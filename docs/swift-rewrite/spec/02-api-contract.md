# Hydra — Network / API Contract Specification

Survey area: everything Hydra sends to and receives from reddit.com and any other server, the authentication model, and the data models derived from responses. This is a behavioral contract for a from-scratch SwiftUI rewrite. TypeScript paths are given only as provenance references.

---

## 0. The access model in one paragraph ("Keyless")

Hydra uses **no Reddit OAuth client ID, no API key, and never touches `oauth.reddit.com`**. It talks to the public web endpoints on `www.reddit.com` (and, for three specific things, `old.reddit.com`), appending `.json` to page paths to get JSON. Anonymous browsing works with no credentials at all. Logged-in actions are authorized by two things travelling together:

1. the **`reddit_session` cookie** in the platform HTTP cookie jar (set by a real browser login inside a `WebView`), which the HTTP layer attaches automatically to every `www.reddit.com` / `old.reddit.com` request; and
2. an **`X-Modhash` request header** carrying the `modhash` value read out of `/user/me/about.json`.

There is no refresh token, no expiry handling beyond "the request failed, so log out", and no server-side component of Hydra's own involved in Reddit access. Reference: `CONTEXT.md`, `api/RedditApi.ts`, `api/Authentication.ts`, `utils/RedditCookies.ts`.

---

## 1. The shared request pipeline

Every Reddit request goes through one function (`api()` in `api/RedditApi.ts`), which wraps a custom XHR-based fetch (`utils/safeFetch.ts`).

### 1.1 `api(url, fetchOptions, apiOptions)` behavior, in order

| Step | Behavior |
|---|---|
| 1 | If `apiOptions.requireAuth` and no modhash is held in memory → show a native alert `"You need to log in first!"` and **throw** `Error("User is not authenticated")`. No request is made. |
| 2 | If `requireAuth` → set header `X-Modhash: <modhash>`. |
| 3 | Force cache mode `no-store`, which adds `Pragma: no-cache` and `Cache-Control: no-cache` (only if not already present in the caller's headers). |
| 4 | If `apiOptions.body` is present → set `Content-Type: application/x-www-form-urlencoded` and serialize the body object with URL-search-params encoding into the request body string. **All Reddit write calls are form-encoded, never JSON.** |
| 5 | Always set `User-Agent: <randomized Safari/iOS UA>` (see 1.3). |
| 6 | Issue the request via `safeFetch` (XHR). Cookies are attached by the platform cookie store automatically — Hydra never sets a `Cookie` header itself. |
| 7 | **After every response**, re-persist the session cookie (see §3.4). |
| 8 | If `apiOptions.dontJsonifyResponse` → return the raw response body as a string. Otherwise parse JSON. |
| 9 | If `apiOptions.depaginate` → if `json.data.after != null`, rewrite the URL's `after` query param to that cursor and recurse, concatenating `json.data.children` arrays; otherwise return `json.data.children`. |

Notably: **`api()` does not check the HTTP status code at all.** A 403/404/500 body is parsed and returned like a success. Reddit's error envelopes (`{ error: 403, message: "Forbidden" }`, `{ reason: "private" }`) are therefore detected by *inspecting the parsed body*, not the status. An HTML error page makes `JSON.parse` throw, which surfaces as a rejected promise.

### 1.2 `safeFetch` (the transport)

An XHR-backed `fetch` replacement written to dodge a polyfill bug where status code `0`/`999` produced uncatchable errors.

| Property | Value |
|---|---|
| Default method | `GET` |
| Default timeout | **10,000 ms** (`ontimeout` → rejects `TypeError("Network request timed out")`) |
| Network failure | rejects `TypeError("Network request failed")` |
| Abort | rejects `Error` with `name === "AbortError"` |
| `ok` | `status >= 200 && status < 300` |
| `rejectDataResponse` option | On `HEADERS_RECEIVED`, aborts the request if `Content-Type` is `application/pdf`, `application/octet-stream`, `application/zip`, `application/x-zip-compressed`, or matches `^(image|video|audio)/`. Used only by OpenGraph fetching. |
| JSON parse failure | Adds a Sentry breadcrumb (`url`, `options`, status, body text) and rejects |

Swift equivalent: a `URLSession` wrapper with a 10 s timeout, no status-code throwing, a cookie-enabled session, and a "bail early on binary content type" mode for link previews.

### 1.3 User-Agent strategy (`api/UserAgent.ts`)

A **single randomized iOS-Safari User-Agent string is generated once per app launch** (module load) and reused for every Reddit request and every redirect-follow. It is never randomized per-request.

```
Mozilla/5.0 (CPU iPhone OS {IOS}_{MINOR} like Mac OS X) AppleWebKit/{WEBKIT}.60 (KHTML, like Gecko) Version/{SAFARI}.0 Mobile/15E148 Safari/{WEBKIT}.60
```

| Token | Range (uniform random integer) |
|---|---|
| `{IOS}` | 9–13 |
| `{MINOR}` | 0–9 |
| `{SAFARI}` | 600–604 |
| `{WEBKIT}` | 500–1199 |

The opening parenthesis is intentionally unbalanced in the source but the emitted string above is what goes on the wire. Redgifs requests use a *different*, literal UA: `Hydra`. The S3 media upload reuses the randomized Reddit UA.

### 1.4 URL construction (`utils/RedditURL.ts`, `utils/URL.ts`)

Hydra models a Reddit page URL and converts it to a JSON endpoint by string manipulation.

- **Accepted hosts** (exact match, else constructor throws `Not a reddit URL`): `www.reddit.com`, `redd.it`, `i.redd.it`, `v.redd.it`, `preview.redd.it`. Plus the `hydra://` internal scheme.
- **Host normalization**: `https?://(www.|old.|new.|np.|m.|sh.|amp.)?reddit.com` → `https://www.reddit.com`; `www.redd.it` → `redd.it`; `/r/u_<name>` → `/user/<name>`; bare `/path` → `https://www.reddit.com/path`; `//host` → `https://host`.
- **`jsonify()`**: take the path before `?`/`#`, strip trailing slashes (but keep the single slash if that would leave a bare domain), append `.json`, then re-append `?` + the original query string. Examples: `/r/pics` → `/r/pics.json?`; `/r/pics/top/?t=week` → `/r/pics/top.json?t=week`; `/user/bob/m/tech/` → `/user/bob/m/tech.json?`; `https://www.reddit.com` → `https://www.reddit.com/.json?`.
- Query-param helpers rebuild the URL as `basePath + "?" + params`, so **a trailing bare `?` is normal in Hydra's request URLs**.

**Page type classification** (drives both navigation and which fetcher runs), evaluated in this order on the relative path:

| Order | Condition | PageType |
|---|---|---|
| 1 | URL starts `hydra://accounts` / `hydra://settings` / `hydra://webview` | ACCOUNTS / SETTINGS / WEBVIEW |
| 2 | path is ``/`` or empty, or starts `/best`, `/hot`, `/new`, `/top`, `/rising` | HOME |
| 3 | path contains `/comments/` | POST_DETAILS |
| 4 | starts `/r/` and contains `/search/` | SUBREDDIT_SEARCH |
| 5 | starts `/r/` and contains `/wiki/` or `/w/` | WIKI |
| 6 | starts `/r/` and contains `/about/` | SIDEBAR |
| 7 | starts `/r/` | SUBREDDIT |
| 8 | starts `/message/inbox` | INBOX |
| 9 | starts `/message/messages` | MESSAGES |
| 10 | matches `/(user\|u)/.*/m/.*` | MULTIREDDIT |
| 11 | starts `/u/` or `/user/` | USER |
| 12 | starts `/search` | SEARCH |
| 13 | host is `i.redd.it` or `preview.redd.it` | IMAGE |
| 14 | otherwise | UNKNOWN |

**Sort extraction** (`getSort()` → `[sort, time]`):

| PageType | Rule |
|---|---|
| HOME, SUBREDDIT | Path segment (index 3–4 after splitting on `/r/`, `/`, `?`) matching one of `best, hot, new, top, rising`; time from `?t=`. |
| MULTIREDDIT | Path segment index 6 matching `hot, new, top, rising, controversial`; time = `?t=` (defaulting to `day`) only when sort is `top`. |
| SUBREDDIT_SEARCH | `?sort=`; no time. |
| POST_DETAILS | `?sort=`, `?t=`. |
| USER | `?sort=` defaulting to `new`; `?t=`. |

**Sort application** (`changeSort`): HOME → `https://www.reddit.com/{sort}/?{params}`; SUBREDDIT → `https://www.reddit.com/r/{sub}/{sort}/?{params}`; SUBREDDIT_SEARCH / POST_DETAILS / USER → `?sort=`; MULTIREDDIT → replaces path segment 5. `"Q&A"` maps to `qa`, `"Comment Count"` maps to `comments`, everything else is lowercased. `t` is set from `time` when provided.

**Preferred-sort defaults** (`applyPreferredSorts`, reads local key-value store): if the URL has no explicit sort, apply the user's default post sort (per-subreddit override if "remember subreddit sort" is on, else global default, else `"default"` meaning leave alone); for `top`, also apply the default/remembered time (falling back to `all`). Home page is only sorted if the "sort home page" setting is on. POST_DETAILS gets the default comment sort the same way.

### 1.5 Short-link resolution

Share links (`/r/<sub>/s/<id>`, `/u/<name>/s/<id>`, `/user/<name>/s/<id>`) and short-domain links (`https://redd.it/<id>`) carry no page type until followed.

| Aspect | Behavior |
|---|---|
| Trigger | Only when the URL is a short link, or its page type is UNKNOWN |
| Request 1 | `HEAD <url>` with `redirect: follow`, header `User-Agent: <randomized UA>` |
| Request 2 | If HEAD produced nothing usable **and** the link is a short link → same with `GET` |
| Success | Final response URL, if different from the request URL, is a valid Reddit URL, and is not itself another short link |
| Failure | Returns `null`; the original URL is left untouched (never throws) |
| `/u/` handling | `/u/` is rewritten to `/user/` first; a `/u/<name>/s/<id>` still gets its redirect followed |

---

## 2. Complete HTTP request inventory

Unless stated otherwise: host is `https://www.reddit.com`, transport is the shared pipeline (§1.1), the randomized UA header is present, cookies are attached automatically, and responses are parsed as JSON.

**Ubiquitous query params.** `raw_json=1` is **not** used on listing/detail requests — the only place it appears anywhere in the app is the media-upload call. Because of that, all text fields come back HTML-entity-escaped and Hydra HTML-entity-decodes them client-side (§4). `sr_detail=true` is added to every post-bearing listing so subreddit icons come inline.

### 2.1 Posts / feeds

| # | Method | URL template | Auth | Body | Notes |
|---|---|---|---|---|---|
| P1 | GET | `{feedPath}.json?{existing params}&sr_detail=true&limit={limit}&after={after}` | none (cookie if present) | — | `{feedPath}` is any HOME/SUBREDDIT/MULTIREDDIT/USER page path with its sort baked into the path (`/r/pics/top`) and `t` in the query. `limit` defaults to **10**; `after` is always present, empty string on the first page. |
| P2 | GET | `https://www.reddit.com/r/{a+b+c}{/sort}?t={t}&sr_detail=true&limit=&after=` then `.json` | none | — | Merged-subreddit listing used to render a **multireddit** feed (see M3). |
| P3 | GET | `{subredditSearchURL}.json?q=…&restrict_sr=true&sr_detail=true&limit={limit}&after={after}&sort={sort}` | none | — | In-subreddit post search. |

**Limit ramp-up.** Feeds do not use a fixed page size. `useRedditDataState` retries a page load up to `filterRetries` times when client-side filters wipe out everything, escalating the limit each try:

| Surface | Limit sequence |
|---|---|
| Posts feed (`pages/PostsPage.tsx`) | `10, 20, 40, 70, 100` |
| Gallery mode (`pages/GalleryPage.tsx`) | `10, 30, 50` |
| Subreddit search, user content, inbox, search | no ramp (limit omitted ⇒ P1 default 10; other endpoints send no `limit`) |

**Listing error detection**, applied in this order to the parsed body:
1. `quarantine_message` or `interstitial_warning_message` present → gated-subreddit interstitial (§2.12).
2. `reason === "banned"` → `BannedSubredditError`.
3. `reason === "private"` → `PrivateSubredditError`.
4. `data.children` is not an array → `ListingResponseError`.

### 2.2 Post detail + comments

| # | Method | URL template | Auth | Body | Notes |
|---|---|---|---|---|---|
| C1 | GET | `{postPermalink}.json?{params}&sr_detail=true&limit={limit}` | none | — | `limit` defaults to **75**. `sort` / `t` come from the permalink's query. Response is a 2-element array: `[0]` = post listing (1 child), `[1]` = comment listing. No `after`. |
| C2 | GET | `https://www.reddit.com/r/{subreddit}/comments/{postId}/comment/{commentId}/.json` | none | — | "Load more comments". Issued **in parallel** (`Promise.all`) for up to **10** comment ids at a time (`childIds.slice(0, 10)`). Each response's `[1].data.children[0]` is the comment subtree. |
| C3 | GET | `{commentPermalink}.json?` | none | — | Reload a single comment after edit/reply; reads `[1].data.children[0]`. |

### 2.3 Voting / saving / deleting / editing / replying

| # | Method | URL | Auth | Form body fields |
|---|---|---|---|---|
| V1 | POST | `/api/vote` | **yes** | `id` (fullname, e.g. `t3_abc`), `dir` (`1` / `0` / `-1`) |
| V2 | POST | `/api/save` or `/api/unsave` | **yes** | `id` (fullname) |
| V3 | POST | `/api/del` | **yes** | `id` (fullname) |
| V4 | POST | `/api/editusertext` | **yes** | `thing_id`, `text` |
| V5 | POST | `/api/comment` | **yes** | `thing_id`, `text` |

- V1 toggles: if the item's current vote equals the requested direction, `dir` is sent as `0` (un-vote). Returned value is the new vote state; a non-zero vote also bumps a local stats counter (device-only).
- V5 returns `{ success: boolean }`; Hydra treats missing `success` as `false`.
- V4 returns `{ success: boolean }`.
- Reply-to-message uses the **same** `/api/comment` endpoint with `?api_type=json` (see §2.7).

### 2.4 Post creation, flair, media upload

| # | Method | URL | Auth | Body / params | Response consumed |
|---|---|---|---|---|---|
| S1 | POST | `https://old.reddit.com/api/submit?api_type=json` | **yes** | form: `sr`, `kind` (`self`\|`link`\|`image`), `title`, `flair_id` (only if a flair was chosen), `text` **or** `url` (key is `text` when `kind === "self"`, else `url`), `extension=json` | `json.errors`, `json.data.url` |
| S2 | GET | `/r/{subreddit}/api/link_flair_v2.json` | none | — | Array of `{ id, text, mod_only }` |
| S3 | POST | `/api/image_upload_s3.json` | **yes** | form: `filepath` (file name), `mimetype`, `raw_json=1` | `action` (protocol-relative S3 host), `fields[]` of `{ name, value }` |
| S4 | POST | `https:{action}` (the S3 endpoint returned by S3) | n/a | `multipart/form-data` with every `fields[]` entry as a form field, plus `file` = `{ uri, type, name }`. Headers: `Content-Type: multipart/form-data; `, randomized UA. Uses raw platform `fetch`, **not** the shared pipeline. | Response is XML; Hydra regex-extracts `<Location>(.*?)</Location>` as the uploaded URL |

**Submit error mapping** (S1):
- `json.errors[0][0] === "BAD_CAPTCHA"` → `CaptchaError`. The UI then offers to retry inside an in-app WebView at `https://new.reddit.com/r/{subreddit}/submit/?type={text|link|image}` with shared cookies, copying the post body to the clipboard for a self post.
- `json.errors[0][1]` is a string → `ParseableError(thatString)`, shown verbatim in an alert.
- `errors` missing or non-empty otherwise → generic `Error("Unknown error when submitting post")`, alert "Failed to submit post / Unknown error".
- Success with no `data.url` (which is what image submissions do) → alert "Submitted post successfully / Post is being processed".

**Image post flow**: pick image → S3 upload (S3+S4) → the returned URL is placed into the post's `url` field → S1 with `kind: "image"`.

### 2.5 Subreddits

| # | Method | URL | Auth | Notes |
|---|---|---|---|---|
| R1 | GET | `/subreddits/mine.json?limit=100&{options}` | cookie | **Depaginated**: follows `data.after` until null, concatenating `data.children`. |
| R2 | GET | `/subreddits/mine/moderator.json?limit=100&{options}` | cookie | Depaginated. Issued in parallel with R1. |
| R3 | GET | `/subreddits.json?limit={n}` | none | "Trending". `limit` default `10`; the subreddits screen requests `30`. |
| R4 | POST | `/api/subscribe.json?sr_name={name}&action={sub\|unsub}` | **yes** | Parameters are **query string**, body is empty. |
| R5 | GET | `/r/{sub}/about.json` | none | Sidebar: consumes `data.subscribers`, `data.description_html`. |
| R6 | GET | `/r/{sub}/about/rules.json` | none | Consumes `rules[].short_name`, `rules[].description_html`. |
| R7 | GET | `/r/{name}/about.json` | none | Exact-name resolution for the subreddit switcher / quick search. Returns a `t5` even for private/quarantined/banned subs; only a non-`t5` body or thrown error yields `null`. |

R1/R2 results are sorted by name with locale-aware comparison. Favorites are **local only** (stored under `favoriteSubreddits:{userId}`), filtered out of the subscriber list — there is no Reddit favorites API call.

### 2.6 Search

| # | Method | URL | Auth | Notes |
|---|---|---|---|---|
| Q1 | GET | `/search.json?type={link\|sr\|user}&q={query}&sr_detail=true&{sort,limit,after,time}` | none | `type` is `link` for posts, `sr` for subreddits, `user` for users. |

- For **subreddit** searches the query is rewritten to `"/r/" + text.trim()` with a leading `/r/` or `/` stripped first — a workaround so 1–2 character subreddit names return results.
- Response children are dispatched by `kind`: `t3` → Post, `t5` → Subreddit, `t2` → User (skipped if `data.id` is missing). Anything else is dropped.
- If `res.data` is absent, an empty array is returned (no error).
- **Users search does not paginate**: the UI returns `[]` as soon as an `after` cursor exists for `searchType === "users"`.
- Quick-subreddit-search additionally fires R7 in parallel to surface an exact-name hit, and cancels stale searches with a monotonically increasing token.

### 2.7 Inbox and private messages

| # | Method | URL | Auth | Body | Notes |
|---|---|---|---|---|---|
| I1 | GET | `/message/inbox.json?{sort,limit,after}` | **yes** | — | Only children with `kind` `t1` (comment reply) or `t4` (message) are kept; everything else dropped. |
| I2 | POST | `/api/read_message` or `/api/unread_message` | **yes** | `id` (fullname) | |
| I3 | GET | `/message/messages/{messageId}.json?` | **yes** | — | Conversation thread. First child is the root message; `data.replies` (empty **string** when absent) contains `data.children[]` of replies. |
| I4 | POST | `/api/compose?api_type=json` | **yes** | `to` (username), `subject`, `text` | Success = `json.errors` is an array of length 0. |
| I5 | POST | `/api/comment?api_type=json` | **yes** | `thing_id` (the message's fullname), `text` | Reply to a private message — same endpoint as commenting. Success = `json.errors` is an empty array. |
| I6 | POST | `/api/read_all_messages` | **yes** | — | Response returned as text, not parsed. |

**Inbox polling.** While a user is logged in, I1 runs immediately and then on a **60-second interval**. The unread count is `messages.filter(m => m.new).length` and is pushed to the app badge. The poll is skipped entirely if no modhash is held (mid-account-swap). On logout the count is reset to 0 and the interval torn down. There is **no push notification registration** — the push backend was removed (`contexts/SettingsContexts/NotificationsContext.tsx` is an inert stub).

### 2.8 Users

| # | Method | URL | Auth | Notes |
|---|---|---|---|---|
| U1 | GET | `{userURL}/about.json?` | cookie | `{userURL}` is `https://www.reddit.com/user/{name}` or the special `/user/me`. |
| U2 | GET | `{userContentURL}.json?{limit,after}&sr_detail=true` | cookie | Content path is one of `/user/{name}`, `/user/{name}/submitted`, `/user/{name}/comments`, `/user/{name}/upvoted`, `/user/{name}/downvoted`, `/user/{name}/hidden`, `/user/{name}/saved?type=links`, `/user/{name}/saved?type=comments`. The last four are only offered when the profile is the logged-in user's. Children: `t3` → Post, `t1` → Comment. |
| U3 | POST | `/api/block_user.json?account_id=t2_{userId}` | **yes** | Params in query string, no body. |

**Bad-user response mapping** (applied to U1 and U2 bodies):
- `error === 403`, or `data.is_suspended` truthy → `BannedUserError` (unless the caller passed `allowSuspended`).
- `error === 404` → `UserDoesNotExistError`.

`allowSuspended: true` is passed when reading the *own* account during login (so a suspended account can still sign in) and when loading a profile page header.

### 2.9 Multireddits

| # | Method | URL | Auth | Body | Notes |
|---|---|---|---|---|---|
| M1 | GET | `/api/multi/mine?expand_srs=true` | **yes** | — | Returns an array of `{ data: … }` LabeledMulti objects. Also primes the in-memory definition cache. |
| M2 | GET | `/api/multi/{user/<u>/m/<m>}` → fallback `/api/multi/{path}.json` → fallback `https://old.reddit.com/api/multi/{path}` | cookie | — | Tried strictly in that order; the first source that yields a real `data.subreddits` array wins. A `{ error: 403 }` envelope counts as failure, not as "no subreddits". All three failing → `MultiredditUnavailableError`. |
| M3 | — | (derived) `https://www.reddit.com/r/{sub1+sub2+…}{/sort}?t={t}` | — | — | The **merged feed URL**. Multireddit feeds are read through this, not through the multireddit's own listing, because `/user/<u>/m/<m>.json` is unreliable for this keyless client. |
| M4 | PUT | `/api/multi/{user/<u>/m/<m>}/r/{subreddit}` | **yes** | `model` = JSON string `{"name":"<subreddit>"}` (still form-encoded as a single field) | Add subreddit to multi. |
| M5 | DELETE | `/api/multi/{user/<u>/m/<m>}/r/{subreddit}` | **yes** | — | Remove subreddit; response read as text. |

**Multireddit feed fallback chain** (`getMultiredditPosts`):
1. Build M3 from M2's definition. If the definition says the multi has **zero** subreddits → return `[]` immediately with no request at all.
2. Try the merged listing (P2). On `BannedSubredditError`/`PrivateSubredditError`, rethrow immediately (do not retry).
3. On any other failure (network error, HTML error page, non-listing body), fall through to the multireddit's **own** listing `/user/<u>/m/<m>.json?…`.
4. If both fail, throw `MultiredditUnavailableError`.
5. If M2 itself threw `MultiredditUnavailableError`, skip straight to step 3.

**Definition cache**: keyed on the lowercased `user/<name>/m/<multi>` path, in-memory (per session), never persisted. Successes (including a legitimately empty multi) are cached; failures are not. Invalidated on M4/M5.

### 2.10 Account settings repair (old.reddit HTML scraping)

| # | Method | URL | Auth | Body | Response |
|---|---|---|---|---|---|
| A1 | GET | `https://old.reddit.com/prefs` | cookie | — | **HTML**, returned as text. |
| A2 | POST | `https://old.reddit.com/post/options` | **yes** | Form-encoded, **every** parsed preference field, with three overridden | Text, ignored |

`fixIncompatibleAccountSettings()` runs once per login attempt but is throttled to **at most once every 30 days** by a stored timestamp (`lastFixedAccountSettings`). The timestamp is written *before* the fetch, so a failure still consumes the 30-day window.

**Parsing A1**: locate `#pref-form`; for every `<input>` not of type `hidden`/`submit`: checkbox → `"on"` if `checked` else `""`; radio → its `value` if `checked`, else `""` if the name is not yet seen; text → its `value`. For every `<select>`: the `selected` option's `value` (falling back to its text content), else the first option's, else `""`.

**Required settings forced on** (A2 is only sent if any differ): `media: "on"`, `over_18: "on"`, `search_include_over_18: "on"`.

The full preference schema Hydra round-trips (all as `"on"`/`""` checkboxes unless noted): `lang`(string), `newwindow`, `media`(`on|off|subreddit`), `media_preview`(`on|off|subreddit`), `video_autoplay`, `no_profanity`, `show_trending`, `clickgadget`, `compress`, `domain_details`, `hide_ups`, `hide_downs`, `numsites`(`10|25|50|100`), `min_link_score`(string), `default_comment_sort`(`confidence|old|top|qa|controversial|new`), `ignore_suggested_sort`, `highlight_controversial`, `min_comment_score`(string), `num_comments`(string), `monitor_mentions`, `send_welcome_messages`, `threaded_modmail`, `live_orangereds`, `disable-browser-notifs`, `enable-notifs`, `unread_messages`, `chat_messages`, `trending_posts`, `community_recommendations`, `live_event`, `upvote_post`, `upvote_comment`, `email_digests`, `email_unsubscribe_all`, `show_stylesheets`, `show_flair`, `show_link_flair`, `legacy_search`, `show_presence`, `over_18`, `search_include_over_18`, `private_feeds`, `public_votes`, `beta`, `in_redesign_beta`, `highlight_new_comments`.

### 2.11 Reporting

There is **no report API call**. Choosing "Report" pushes an in-app WebView at `https://www.reddit.com/report`.

### 2.12 Quarantined / gated subreddit interstitial

When any listing or post-detail response contains `quarantine_message` or `interstitial_warning_message`:

1. Show a native alert titled `"Warning"` with that message verbatim, and two buttons: `Cancel` and `Proceed`.
2. Cancel → the feed returns `[]` (post detail returns nothing); no further request.
3. Proceed → `POST https://old.reddit.com/quarantine` (when the response carried `quarantine_message`) or `POST https://old.reddit.com/gated` (otherwise), **requires auth**, form body `sr_name=<subreddit from the page URL>`, `accept=yes`, response read as text. Then the original listing/detail request is **re-issued once**.

### 2.13 Hydra's own server

| # | Method | URL | Auth | Body | Notes |
|---|---|---|---|---|---|
| H1 | GET | `{customServerURL}/api/status` | none | — | Health check. Considered up **only** if HTTP 200 **and** the body text is exactly `"Hydra server is up"`. Uses raw `fetch`; any thrown error → `false`. |
| H2 | POST | `https://api.hydraapp.io/api/ai/createEmbedding` | none | `JSON.stringify({ text })` — **no `Content-Type` header is set** | Returns a bare JSON array of numbers (the embedding vector). Always hits the **default** host, never a custom one. |
| H3 | POST | `{HYDRA_SERVER_URL}/api/ai/askQuestion` | none | `JSON.stringify({ question, docs })` — no `Content-Type` header | Returns `{ markdown: string }`. Uses the custom host if one is configured. |

`HYDRA_SERVER_URL` resolution: in dev, `EXPO_PUBLIC_HYDRA_SERVER` env var else the default; in release, the stored `customHydraServerUrl` key else `https://api.hydraapp.io`. H1's URL is whatever the settings screen is currently validating; a URL that validates is written to that key (see Open Questions).

**What these are used for**: only the in-app documentation/guide search. H2 embeds the user's search query and the app cosine-similarity-matches it against ~50 documentation vectors bundled in the binary (768-ish dims, normalized, unrolled-by-16 dot products, top-k selection). H3 takes the query plus the text of the top 3 matched docs and returns a markdown answer, which is rendered through Snudown. Both run without any account or entitlement check.

### 2.14 Redgifs

| # | Method | URL | Auth | Headers | Response consumed |
|---|---|---|---|---|---|
| G1 | GET | `https://api.redgifs.com/v2/auth/temporary` | none | `User-Agent: Hydra` | `token` (stored under key `redgifsToken`) |
| G2 | GET | `https://api.redgifs.com/v2/gifs/{videoId}` | Bearer | `Authorization: Bearer {token}`, `User-Agent: Hydra` | `gif.urls.hd ?? gif.urls.sd` |

Full behavior in §6.1.

### 2.15 Other hosts

| Purpose | Method | URL | Notes |
|---|---|---|---|
| OpenGraph link preview | GET | the post's external link, as-is | Via `safeFetch` with **timeout 1,750 ms** and `rejectDataResponse: true`. No custom UA. HTML is stream-parsed; every `<meta property="og:*">` becomes `openGraphData[key] = content`. **`og:image` values containing `.svg` are dropped** (they crashed the image renderer). Any failure returns `undefined` silently. |
| Imgur | — | — | **No API calls.** Purely deterministic URL rewriting: `*.gifv` → `*.mp4`. |
| Gfycat | GET (by the player) | `https://web.archive.org/web/0if_/thumbs.{host+path}-mobile.mp4` | Gfycat is dead; Hydra rewrites the link into a Wayback Machine thumbnail URL. No API call. |
| Media download (share / save to library) | GET | the media URL | Downloaded to the cache directory by file name, handed to the share sheet or photo library, then deleted. Serialized: a second request is ignored while one is in flight. |
| Wiki pages, Report, arbitrary external links | — | — | Rendered in a `WebView` / in-app browser at the plain reddit.com URL. Wiki content is never fetched as JSON. |
| Sentry | POST | `https://o4508377723174912.ingest.us.sentry.io/…` (DSN `0a53bc725058aa44bf7aa771f5bcda05`) | Disabled in dev and when the user's error-reporting setting is off. `enableAppHangTracking: false`. User context is set to `{ username }` on login and cleared on logout. |

---

## 3. Authentication

### 3.1 The login WebView

`components/Modals/Login.tsx`.

| Aspect | Contract |
|---|---|
| Initial URL | `https://www.reddit.com/login?dest=https://www.reddit.com/r/HydraClient` |
| Cookie sharing | Shared + third-party cookies enabled, so cookies set in the WebView land in the shared HTTP cookie jar |
| Injected JS | Cosmetic only: hides `.flex.justify-between.items-end.pt-lg.pb-xs`, adds `margin-top: 20px` to `h1.text-24.text-center.text-neutral-content-strong`, sets `z-index: 1` on `auth-flow-manager`; walks shadow roots and re-applies on every DOM mutation |
| Before showing | The current session is **temporarily logged out**: cookies cleared and the in-memory modhash dropped, so the login page isn't already authenticated |
| Success detection #1 | `onLoadStart` fires for a URL that does **not** contain any of: `reddit.com/login`, `redditinc.com/policies/user-agreement`, `redditinc.com/policies/privacy-policy`, `reddit.com/policies/privacy-policy`. Navigating anywhere else means the login completed and Reddit is redirecting to `dest`. |
| Success detection #2 (backup) | A **500 ms poll** that checks whether a `reddit_session` cookie exists for `https://www.reddit.com`. Added because `onLoadStart` does not fire for all users. |
| Guard | `loginFinished` latch so the two detectors can't both run the completion path |
| On completion | Dismiss the modal, run the login procedure (§3.2). If it fails → alert `"Login failed" / "Something went wrong"`. |
| On cancel (X button) | Dismiss, and **restore** the previous account's cookies and modhash |

The temp-logout wrapper (`doWithTempLogout`) snapshots the current username and modhash, clears cookies, drops the modhash, runs the WebView flow, and restores the snapshot only if the flow reports it should (i.e. the user cancelled or failed).

### 3.2 The login procedure (`AccountContext.logInContext`)

Given an optional username (present when switching to a stored account, absent right after a WebView login):

1. If a username was given, restore that account's cookie blob into the cookie jar.
2. `GET /user/me/about.json?` with `allowSuspended: true`.
3. If a username was given and the returned `name` differs → throw `"Authenticated session out of sync"`.
4. If the response has no `modhash` → throw `"Failed to get modhash"`.
5. Store the modhash in a process-global (`UserAuth.modhash`).
6. Write `currentUser = <username>` to the key-value store.
7. Set the current user in state and in Sentry's user context.
8. Save the session cookie under this username in the secure store.
9. Run the 30-day-throttled account-settings repair (§2.10).
10. Add the username to the stored account list if not already present.

**Any thrown error** in the whole chain → alert titled `"Login Session Expired"` with body `"You can login again by pressing the + button in the top right corner of the Account tab."`, then a full logout, and the function returns `false`.

### 3.3 Modhash lifecycle

| Question | Answer |
|---|---|
| Where does it come from | `data.modhash` of `/user/me/about.json` |
| Where is it kept | An in-memory static only. **Never persisted.** |
| How is it sent | `X-Modhash` header on every `requireAuth: true` request. Never as a form field or query param. |
| How is it refreshed | Only by re-running the login procedure — on app launch (for the stored `currentUser`) or on an explicit account switch. There is no periodic or on-401 refresh. |
| What happens when it's missing | The request is never sent; an alert says "You need to log in first!" and the call throws. |

### 3.4 Cookies

| Item | Contract |
|---|---|
| Cookie of record | `reddit_session` for `https://www.reddit.com` (domain `.reddit.com`, path `/`) |
| Where stored between launches | Secure storage (Keychain-equivalent), key `redditSession-{username}`, value = the JSON-serialized cookie object |
| Restore | On switching to an account, the JSON blob is written back into the cookie jar for `https://www.reddit.com` |
| Session-cookie persistence hack | Reddit's `reddit_session` cookie has **no expiry**, so iOS drops it at app launch. After **every** API response, if a `reddit_session` cookie exists with no `expires`, Hydra rewrites it with `expires` = now + 10,000 days. This is why sessions survive app restarts. |
| Logout / clear | Because a cookie library bug re-syncs cookies from WebKit back into HTTP on `clearAll(true)`, Hydra first writes a **stale** `reddit_session` (empty value, `expires` = epoch 0) into *both* the HTTP and WebKit stores, then calls `clearAll()` and `clearAll(true)`. |
| Other cookies | Never read, written, or inspected by name. Everything else Reddit sets rides along in the jar. |

### 3.5 Multiple accounts

| Storage | Key | Format |
|---|---|---|
| Account list | key-value store, `usernames` | JSON array of username strings |
| Current account | key-value store, `currentUser` | plain username string |
| Per-account session | **secure** store, `redditSession-{username}` | JSON of the `reddit_session` cookie object |
| Per-account favorites | key-value store, `favoriteSubreddits:{user.id}` | JSON array of subreddit names |
| Per-account "asked to join r/HydraClient" | key-value store, `lastAskedToSubscribeToHydraClient-{user.id}` | epoch ms |

**Switching accounts** = clear cookies (implicitly, via the login flow's restore) → restore that username's cookie blob → re-run the login procedure. There is no token swap; the whole identity is the cookie + freshly-fetched modhash.

**Logout** = clear all cookies, remove the `currentUser` key, clear the in-memory modhash, clear the Sentry user, set current user state to null. The stored account list and per-account cookie blobs are untouched, so the account can be switched back into.

**Remove account** = if it's the current account, log out first; delete `redditSession-{username}` from secure storage; rewrite the `usernames` array.

**Anonymous mode** = the account list UI appends a synthetic `"Logged Out"` row; selecting it calls logout. Anonymous browsing works for every GET in §2 that isn't marked `requireAuth`. Attempting an authed action shows the "You need to log in first!" alert.

**Startup**: read `usernames`; if present, set the account list and, if `currentUser` is set, run the login procedure for it. Then flip a `loginInitialized` flag that the UI waits on.

### 3.6 Expired sessions, 401/403

There is no status-code-driven auth handling anywhere. The failure modes are:

| Situation | Observable behavior |
|---|---|
| Session cookie expired/revoked, at launch or on switch | `/user/me/about.json` returns no modhash (or a 403 envelope) → the login procedure throws → "Login Session Expired" alert → full logout |
| Session expires mid-session | Authed calls keep sending a stale modhash; Reddit rejects them; the body is parsed as a normal response, so most write calls silently no-op (`success` absent → treated as `false`). Feed reads degrade to logged-out content. Nothing prompts a re-login until the next launch/switch. |
| A listing returns a 403 envelope | Not a listing → `ListingResponseError` → "Something went wrong loading this. Pull down to try again." |
| `/user/me` 403 with `allowSuspended` | Accepted; a suspended account can still sign in |

### 3.7 "Hydra Pro" / entitlement

The paid tier has been **removed from the code**. `contexts/SubscriptionsContext.tsx` is a constant: `isPro: true`, `customerId: null`, with a comment stating all features are free and the hosted-backend calls that took a customer id are gone. There is **no** receipt validation, no StoreKit call, no entitlement endpoint, and nothing to check or store.

Consequently the features `documentation/hydra_pro.md`, `documentation/ai_summaries.md` and `documentation/ai_filters.md` describe are **not implemented in this codebase**:

| Documented Pro feature | Actual state |
|---|---|
| Inbox Alerts (push) | Removed; notifications context is an inert stub; no push registration request exists. Unread count is polled and shown as an app badge only. |
| Gallery Mode unlimited scrolling | No 100-item cap in code. |
| Stats tracking | Local-only counters written to the on-device database on vote/post/comment. No network. |
| AI post filters | **No code path sends post text anywhere.** The only AI endpoints are the two documentation ones (§2.13). Filtering is local: text/keyword filters, seen-post, hidden-post and non-media filters. |
| AI post/comment summaries | Settings toggles `showPostSummary` / `showCommentSummary` still exist in the settings contexts, but **nothing reads them** and no summary endpoint is called. |
| Pro themes / theme maker | No gate found in the network layer. |

The only "Pro-adjacent" prompt that survives is the **"Join r/HydraClient"** modal: shown when logged in, subreddit list loaded, the user is not subscribed to `hydraclient`, and more than 365 days have passed since last asked. Accepting calls R4 with `sr_name=hydraclient&action=sub`.

---

## 4. Data models

All string fields listed below are passed through an HTML-entity decoder unless noted (necessary because `raw_json=1` is not requested). Fullnames (`t1_…`, `t3_…`) are Reddit's, used verbatim as the `id` parameter of write calls.

### 4.1 Post

Source: `api/Posts.ts` `formatPostData(child)`. `child` is a listing child (`{ kind, data }`); the crosspost path passes a synthetic `{ data }`.

| Field | Type | Derivation |
|---|---|---|
| `id` | string | `data.id` |
| `name` | string | `data.name` (fullname; the id used for vote/save/delete/comment) |
| `type` | `"post"` | constant |
| `crossPost` | Post? | Recursively formatted from `data.crosspost_parent_list[0]` when present |
| `crossCommentLink` | string? | Set when `data.url` is a valid Reddit URL, contains `/comments/`, and does **not** contain the post's own `permalink` |
| `title` | string | decoded `data.title` |
| `author` | string | `data.author` (not decoded) |
| `upvotes` | number | `data.ups` |
| `scoreHidden` | bool | `data.score_hidden` |
| `saved` | bool | `data.saved` |
| `userVote` | −1/0/1 | `data.likes === true` → 1; `=== false` → −1; else 0 |
| `flair` | Flair? | see §4.6 |
| `postFlair` | PostFlair? | see §4.7 |
| `subreddit` | string | `data.subreddit` |
| `subredditIcon` | string | `data.sr_detail.community_icon` truncated at the first `?`, else `data.sr_detail.icon_img` (this is why every listing sends `sr_detail=true`) |
| `isModerator` | bool | `data.distinguished === "moderator"` |
| `isStickied` | bool | `data.stickied` |
| `isNSFW` | bool | `data.over_18` |
| `isSpoiler` | bool | `data.spoiler` |
| `interactionDisabledStatus` | `"archived"` \| `"locked"` \| null | `data.archived` wins over `data.locked` |
| `text` | string | decoded `data.selftext` |
| `html` | string | decoded `data.selftext_html` |
| `commentCount` | number | `data.num_comments` |
| `link` | string | `"https://www.reddit.com" + data.permalink` |
| `images` | array of image-source arrays | see §4.1.1 |
| `imageThumbnail` | image source? | `images[0][0]` (the **smallest** resolution of the first image) |
| `mediaAspectRatio` | number | `images[0][0].width / images[0][0].height`; **defaults to 0.75** if there are no images or no dimensions |
| `videos` | array of `{source, videoDownloadURL, needsResolution?}` | see §4.1.2 |
| `poll` | Poll? | see §4.8 |
| `externalLink` | string? | see §4.1.3 |
| `openGraphData` | OpenGraphData? | see §4.1.3 |
| `createdAt` | number | `data.created` (seconds) |
| `timeSince` | string | pretty-time-since(`created × 1000`) + `" ago"` |
| `shortTimeSince` | string | short pretty-time-since |
| `after` | string | `data.name` — the pagination cursor is the **item's own fullname**, not `data.after` |

#### 4.1.1 Image extraction

Two mutually exclusive sources, tried in order:

**A. `data.preview.images`** (used when non-empty). For each entry, build an ordered array of `{uri, width, height}` from `image.resolutions[]` (ascending, as Reddit gives them, URLs entity-decoded), then **append** `image.source` as the last (largest) element if present.

**B. `data.gallery_data.items` + `data.media_metadata`** (only if A was empty). Build a map `media_id → index` from `gallery_data.items` order; take the values of `media_metadata`, **drop any without a `p` array** (Reddit sometimes leaves gallery media unprocessed), sort by that index map, and for each produce `p[].{u,x,y}` → `{uri,width,height}`, appending `s.{u,x,y}` last if present.

If neither yields anything, `images` is `[]`.

**Which resolution is displayed**: the platform image view is handed the *whole* array and picks by display size. In **low-data mode** only `images[i][0]` (the smallest) is handed over, and only **1** image is rendered inline instead of up to **2**.

#### 4.1.2 Video extraction — the classification ladder

`formatVideos(child)` returns an ordered list; the **first matching rule wins**:

| # | Condition | Emits |
|---|---|---|
| 1 | `data.media.reddit_video.hls_url` exists | one entry: `source` = the **HLS playlist URL**, `videoDownloadURL` = `reddit_video.fallback_url` (the DASH mp4). Note `source` is *not* entity-decoded here. |
| 2 | `data.media.reddit_video.fallback_url` exists (no HLS — older videos, some crossposts) | one entry: both fields = the decoded fallback mp4 |
| 3 | Gallery videos: `gallery_data.items` non-empty | for each `media_metadata` entry with a `p` array, ordered by `gallery_data.items`, emit `s.mp4` (decoded) as both fields. Entries without `s.mp4` are dropped. **Checked before rule 4** so a gallery that also has a `preview` isn't collapsed to one preview-resolution video. |
| 4 | `preview.images[0].variants.mp4` exists | for each preview image, take `variants.mp4.source` if present, else the **last** element of `variants.mp4.resolutions` (the largest downscale). Decoded. Nulls dropped. This is the GIF-as-video path. |
| 5 | `data.url` is **not** a Reddit URL and contains `imgur.com` and ends `.gifv` | one entry, both fields = the URL with `.gifv` → `.mp4` |
| 6 | not a Reddit URL and contains `gfycat.com` | one entry = `https://web.archive.org/web/0if_/thumbs.{urlWithoutScheme}-mobile.mp4` |
| 7 | not a Reddit URL and contains `redgifs.com` | one entry: both fields = the original watch URL, **`needsResolution: true`** (lazy resolution, §6.1) |
| 8 | otherwise | `[]` |

Playback source selection at display time: the raw `source` is used unless `needsResolution` is set, in which case the resolved Redgifs mp4 replaces it.

#### 4.1.3 Link / external-link classification

Let `url = data.url`, and `isRedditURL` = it parses as a Reddit URL under §1.4's host rules.

**If it IS a Reddit URL:**
- contains `/comments/` and does **not** contain the post's own `permalink` → `crossCommentLink = url`, no `externalLink`.
- else if it is an **in-app link target** → `externalLink = url`. In-app link targets are page types `SUBREDDIT`, `SUBREDDIT_SEARCH`, `MULTIREDDIT`, `USER`, `SEARCH`, `WIKI`, `SIDEBAR` — with the extra rule that a `SUBREDDIT` target is only a link if its subreddit differs (case-insensitively) from the post's own subreddit.
- else (i.redd.it images, `/gallery/` links, the post's own permalink) → neither is set; the media parsing already covers it.

**If it is NOT a Reddit URL:**
- `externalLink = data.url` (the raw value, un-normalized).
- **OpenGraph is fetched** (§2.15) only when *all* of these hold: no videos were extracted, and the URL does not contain `imgur.com`, `gfycat.com`, `redgifs.com`, `.gif`, `.gifv`, or `.mp4`. Otherwise `openGraphData` stays undefined. **This fetch happens inline during post formatting**, i.e. `Promise.all` over the whole page fires one preview request per eligible link post.

**Rendering precedence** (`PostMedia.tsx`): a crosspost renders only its parent post's card. Otherwise: videos (if any, and no `crossCommentLink`) → else images (if any, and no `crossCommentLink`, and no `externalLink`) → then, independently, a link card if `externalLink || crossCommentLink`, then the body HTML/text, then the poll. So the effective "media type" is derived, not stored: **video > image/gallery > link > self/text > poll**, with crosspost and cross-comment-link short-circuits above.

### 4.2 Comment

Source: `api/PostDetail.ts` `formatComments(children, commentPath, childStartIndex, renderCount, collapseAutoModerator)`.

| Field | Type | Derivation |
|---|---|---|
| `id` | string | `data.id` |
| `name` | string | `data.name` (fullname) |
| `type` | `"comment"` | constant |
| `depth` | number | length of the **parent** path (root comments = 0; the `PostDetail` pseudo-comment is −1) |
| `path` | number[] | parent path + `(index in this children array + childStartIndex)` |
| `collapsed` | bool | `true` only when the "collapse AutoModerator" setting is on (**default true**), the comment is top-level (`parentPath.length === 0`), and `data.author === "AutoModerator"` |
| `author` | string | `data.author` |
| `isOP` | bool | `data.is_submitter` |
| `isModerator` | bool | `data.distinguished === "moderator"` |
| `isStickied` | bool | `data.stickied` |
| `editedAt` | ms? | `data.edited ? data.edited × 1000 : undefined` (Reddit sends `false` or an epoch-seconds number) |
| `upvotes` | number | `data.ups` |
| `scoreHidden` | bool | `data.score_hidden` |
| `saved` | bool | `data.saved` |
| `userVote` | −1/0/1 | same `likes` rule as posts |
| `flair` | Flair? | §4.6 |
| `link` | string | `data.permalink` (**relative**, unlike Post.link) |
| `postTitle` | string | `data.link_title` (only present on inbox/user-content comments) |
| `postLink` | string | `data.link_permalink` |
| `subreddit` | string | `data.subreddit` |
| `text` | string | decoded `data.body` |
| `html` | string | decoded `data.body_html` |
| `comments` | Comment[] | recursive over `data.replies.data.children` when `data.replies` is truthy, else `[]` |
| `renderCount` | number | render-invalidation counter, starts 0 |
| `loadMore` | `{depth, childIds}`? | from the **first** child of `replies.data.children` whose `kind === "more"`: `depth` = `more.data.depth`, `childIds` = `more.data.children` (array of bare comment ids) |
| `after` | string | `data.name` |
| `createdAt` | number | `data.created` |
| `timeSince` / `shortTimeSince` | string | as for Post |

**`more` stubs**: children with `kind === "more"` are **skipped** in the comment array itself and only surface as the parent's `loadMore`. A stub is rendered as a row reading `"{childIds.length} more replies"`. Tapping it issues C2 for `childIds.slice(0, 10)` in parallel, appends the results to the parent's children at `childStartIndex = parent.comments.length`, and removes the fetched ids from `childIds` — so repeated taps walk through the list 10 at a time. Reddit's "continue this thread" (a `more` with `count: 0`) is not specially handled.

### 4.3 PostDetail

The union of Post and Comment fields with `type: "postDetail"`, produced by C1:

| Field | Value |
|---|---|
| all Post fields | from `response[0].data.children[0]` via `formatPostData` |
| `depth` | −1 |
| `path` | `[]` |
| `collapsed` | false |
| `isOP` | `data.is_submitter` |
| `editedAt` | `data.edited × 1000` or undefined |
| `postTitle` / `postLink` | `data.link_title` / `data.link_permalink` |
| `comments` | `formatComments(response[1].data.children)` |
| `renderCount` | 0 |
| `loadMore` | from the top-level `more` child of `response[1].data.children`, if any |

### 4.4 Subreddit

| Field | Type | Derivation |
|---|---|---|
| `id` | string | `data.id`, falling back to the part of `data.name` after `_` (i.e. `t5_2qh1i` → `2qh1i`) |
| `type` | `"subreddit"` | constant |
| `name` | string | `data.display_name` |
| `url` | string | `"https://www.reddit.com" + data.url` |
| `moderating` | bool | `data.user_is_moderator` |
| `subscribed` | bool | `data.user_is_subscriber` |
| `description` | string? | `data.public_description` |
| `iconURL` | string? | `data.community_icon` truncated at the first `?`, else `data.icon_img` |
| `subscribers` | number | `data.subscribers` |
| `timeSinceCreation` | string | pretty-time-since(`created_utc × 1000`) + `" old"` |
| `after` | string | `data.name` (the `t5_…` fullname) |

Related: `Sidebar = { subscribers: data.subscribers || 0, descriptionHTML: decoded data.description_html }`; `Rule = { name: rule.short_name, descriptionHTML: decoded rule.description_html }`.

### 4.5 User

| Field | Type | Derivation |
|---|---|---|
| `id` | string | `data.id` (bare, without `t2_`; blocking prepends `t2_`) |
| `type` | `"user"` | constant |
| `userName` | string | `data.name` |
| `commentKarma` | number | `data.comment_karma` |
| `postKarma` | number | `data.link_karma` |
| `icon` | string | `data.icon_img` truncated at the first `?` |
| `mailCount` | number? | `data.inbox_count` |
| `friends` | bool | `data.is_friend` |
| `isLoggedInUser` | bool | **`data.inbox_count !== undefined`** — presence of the field is the signal |
| `after` | string | `data.id` |
| `modhash` | string? | `data.modhash` — only present on `/user/me/about.json` for the authenticated session |
| `createdAt` | number | `data.created_utc` |
| `timeSinceCreated` | string | pretty-time-since + `" old"` |

### 4.6 Flair (author flair, on posts and comments)

From `data.author_flair_richtext[]` when it is an array: entries with `e === "emoji"` contribute `u` (an image URL) to `emojis[]`; entries with `e === "text"` set `text` to a trimmed `t` (last one wins). If **both** are empty and `data.author_flair_text` is a string, `text` is that raw value. Returns `null` when there is neither an emoji nor text.

### 4.7 PostFlair (link flair)

`{ id: data.link_flair_template_id, text: decoded data.link_flair_text, modOnly: false }`, only when **both** `link_flair_template_id` and `link_flair_text` are present; otherwise `null`.

The *allowed* flairs for a subreddit (S2) map to `{ id, text: decoded, modOnly: mod_only }`, and the post composer filters out `modOnly` entries.

### 4.8 Poll

`{ voteCount: data.poll_data.total_vote_count, options: data.poll_data.options }` — the options array is passed through verbatim (`{id, text}` plus whatever else Reddit sends). **Polls are display-only**: tapping an option sets local state; there is no poll-vote request and no per-option vote count is read.

### 4.9 InboxItem — CommentReply (`t1`) and Message (`t4`)

| CommentReply field | Derivation | | Message field | Derivation |
|---|---|---|---|---|
| `id` | `data.id` | | `id` | `data.id` |
| `name` | `data.name` | | `name` | `data.name` |
| `type` | `"commentReply"` | | `type` | `"message"` |
| `author` | `data.author` | | `author` | `data.author` |
| `upvotes` | **`data.score`** (not `ups`) | | `subject` | `data.subject` |
| `userVote` | `likes` rule | | `new` | `data.new` |
| `new` | `data.new` | | `html` | decoded `data.body_html` |
| `postTitle` | `data.link_title` | | `after` | `data.name` |
| `contextLink` | `data.context` | | `createdAt` | `data.created` |
| `subreddit` | `data.subreddit` | | `timeSince` | pretty + `" ago"` |
| `html` | decoded `data.body_html` | | | |
| `after` / `createdAt` / `timeSince` | `data.name` / `data.created` / pretty + `" ago"` | | | |

### 4.10 Multireddit

| Field | Derivation |
|---|---|
| `id` | `data.name` |
| `type` | `"multi"` |
| `name` | `data.display_name` |
| `iconURL` | `data.icon_url` |
| `url` | `data.path` (**always has a trailing slash**, e.g. `/user/bob/m/tech/`) |
| `subreddits` | `data.subreddits[]` mapped and sorted by name. Two shapes are tolerated: expanded (`{name, data:{…}}`, what `expand_srs=true` produces) → normal subreddit formatting; bare (`{name}`) → synthesize `{display_name: name, url: "/r/{name}/"}`. A missing `subreddits` key yields `[]`. |

Endpoint path construction for M4/M5 deliberately re-derives `user/<u>/m/<m>` from the URL rather than concatenating onto `path`, because `path`'s trailing slash produced `…/m/tech//r/apple` and 404s.

### 4.11 OpenGraphData

`{ title?, type?, image?, url?, description? }` — every `<meta property="og:{key}">`'s `content`, with `og:image` skipped when the value contains `.svg`.

### 4.12 Awards

**Not modelled at all.** No award field is read or rendered anywhere.

### 4.13 Formatting helpers

**Time since** (`utils/Time.ts`), from `|now − t|`:

| Bucket | Long form | Short form |
|---|---|---|
| < 60 s | `"{n} second(s)"` | `"{n}s"` |
| < 60 min | `"{n} minute(s)"` | `"{n}m"` |
| < 24 h | `"{n} hour(s)"` | `"{n}h"` |
| < 30 days | `"{n} day(s)"` | `"{n}d"` |
| < 12 months (months = floor(days/30)) | `"{n} month(s)"` | `"{n}mo"` |
| else | `"{n} year(s)"` (years = floor(days/365)) | `"{n}y"` |

Pluralization is `n === 1 ? "" : "s"`. Post/comment timestamps append `" ago"`; account/subreddit ages append `" old"`. Note the months/years boundary uses two different divisors, so e.g. 360 days reads "12 months" only if months < 12 fails — at exactly 12 months it falls to the years branch and reports `floor(360/365) = 0 years`.

**Number formatting** (`utils/Numbers.ts`): `> 1e9` → `"{x/1e9 to 1dp}B"`; `> 1e6` → `"…M"`; `> 1e3` → `"…K"`; else the plain integer. Strictly greater-than, so exactly 1000 prints `1000`.

**Markdown → HTML** (`external/snudown.js`): a WebAssembly build of Reddit's own **snudown** markdown renderer, shipped in the binary. It exposes two functions, `markdown(text, options)` and `markdownWiki(text, options)`, with options `{ nofollow, target, tocIdPrefix, enableToc }`. It is used **only for locally-authored text** — the live preview in the new-post, new-comment, edit-post, edit-comment, new-message and reply-to-message composers (with whitespace between tags collapsed via `replaceAll(/>\s+</g, "><")`), and for rendering the bundled documentation and the AI answer in the guide. Reddit-sourced bodies are never re-rendered from markdown: Hydra uses the `*_html` fields Reddit already provides. A SwiftUI rewrite needs an equivalent snudown-compatible renderer only for composer previews and local docs.

---

## 5. Pagination, caching, refresh

### 5.1 Cursors

| Surface | Cursor | Notes |
|---|---|---|
| Feeds, user content, inbox, search | **the last item's own fullname** (`Post.after` = `data.name`, `Subreddit.after` = `t5_…`, `User.after` = bare id) — *not* `data.after` from the listing envelope | Sent as `&after=`; on the first page it is the **empty string** for feeds (always present) and omitted entirely for other endpoints |
| `depaginate` mode (subreddits/mine only) | `json.data.after` from the envelope | Recurses until it is null |
| Comments | none — `more` stubs with explicit child ids | |
| Post detail | none | |

`unfilteredAfter` tracks the cursor from the **unfiltered** response, so client-side filtering never skips a page.

### 5.2 The generic list state machine (`utils/useRedditDataState.ts`)

| Behavior | Contract |
|---|---|
| Deduplication | New items are dropped when an existing item has the same `id` **and** the same `type`. Always applied on load-more; **not** applied on refresh. |
| Filter retries | On load-more: up to `filterRetries` (default **5**) attempts. Each attempt fetches with the next limit from the ramp-up array and applies `[dedupe, ...filterRules]`. It stops at the first attempt that yields ≥ 1 item. |
| Empty response | Any attempt that returns 0 raw items sets `fullyLoaded` and stops (UI: "Wow. You've reached the bottom."). |
| All-filtered-out | After exhausting retries with nothing surviving → `hitFilterLimit`, and **all further load-more calls are refused** until refresh (UI: "The filter limit has been reached. Your filters may be too strict to show anything."). |
| Refresh | Resets the cursor to undefined, optionally clears data first, re-runs the same retry loop but applies only `filterRules` (no dedupe, since data was reset), and replaces the array. |
| Refresh triggers | Pull-to-refresh, and a re-run whenever `refreshDependencies` change — typically `[searchText, sort, sortTime]` for feeds, `[sort, sortTime]` for gallery/user. The first mount does a load-more instead. |
| Load-more trigger | List `onEndReached` with a threshold of **2 screens**. Concurrent calls are guarded by an in-flight flag. |
| Item mutation | `modifyData` replaces in place by (`id`, `type`); `deleteData` filters by (`id`, `type`); no-arg `deleteData` clears everything. |

Client-side filter rules applied to feeds (all local, no network): text/keyword filters, already-seen posts, hidden posts, and — in gallery mode — posts with no media.

### 5.3 In-memory caches

| Cache | Key | Lifetime | Invalidation |
|---|---|---|---|
| Multireddit subreddit names | lowercased `user/<u>/m/<multi>` | process | Cleared on add/remove-subreddit; primed by M1; failures are never cached |
| Redgifs resolved URLs | redgifs video id | process — **deliberately not persisted** (signed URLs expire in hours; a persisted cache would serve dead URLs at next launch) | Busted per-id when the player errors on that source |
| Redgifs auth token | key-value store key `redgifsToken` | persisted | Refreshed on any non-OK Redgifs response |

### 5.4 Media caches (local disk, no network contract)

| Cache | Size cap | Notes |
|---|---|---|
| Images | 512 MB disk, 256 MB memory (iOS only configuration) | Memory cache purged on system memory warnings. Cache dir measured by summing file sizes. |
| Videos | 1 GB disk | **Caching is skipped** for sources whose path ends `.m3u8` (HLS playlists can't be cached) or `.gif` (Reddit serves mp4 bytes behind a `.gif` path, and caching under that extension makes the decoder fail — the video hangs as a black box). Clearing must happen before any video view mounts, so a clear is requested via a stored flag and performed on next launch. |

### 5.5 Hydra server status check

`hydraServerStatus(url)` is called from the advanced-settings screen whenever the entered custom server URL or the toggle changes. It is a plain `GET {url}/api/status` and requires HTTP 200 **and** an exact body of `"Hydra server is up"`. On success the URL is written to the `customHydraServerUrl` key.

---

## 6. Third-party services

### 6.1 Redgifs (`utils/RedGifs.ts`, ADR `docs/adr/0001-lazy-redgifs-resolution.md`)

**Why it is lazy.** Resolution used to happen eagerly inside `getPosts`, which formats a whole page with `Promise.all` — a burst of parallel Redgifs calls per page. After roughly 20–30 cumulative resolutions Redgifs rate-limits by IP, and the old fallback baked the unplayable watch URL into the post data permanently. Now `formatVideos` only flags the video (`needsResolution: true`), and resolution happens **on mount of the player**, ~5× fewer calls spread over scroll time.

**Video id extraction** from any redgifs link shape: strip query/hash, strip the scheme, drop the host, take the last non-empty path segment, then strip a trailing 2–4 character extension. Covers `/watch/<id>`, `/ifr/<id>`, `/i/<id>`, bare `/<id>`, and `media.redgifs.com/<id>.mp4`. A link with no path segment yields `""`, treated as unresolvable (never requests `/v2/gifs/undefined`).

**Token flow.** `GET https://api.redgifs.com/v2/auth/temporary` with `User-Agent: Hydra` → `json.token` → stored under `redgifsToken`. Fetched lazily when no token is stored, and refreshed on any non-OK response or thrown error.

**Resolution.** `GET https://api.redgifs.com/v2/gifs/{id}` with `Authorization: Bearer {token}` and `User-Agent: Hydra`. The resolved URL is `gif.urls.hd` falling back to `gif.urls.sd`, cached in memory by id.

**Concurrency and backoff.**

| Control | Value / rule |
|---|---|
| Max concurrent resolutions | **2**, process-wide |
| Queue discipline | **LIFO** — the newest waiter runs first, so the currently-visible post jumps ahead of the backlog of scrolled-past posts |
| Cancellation | Each request carries an abort signal tied to the post's visibility. A waiter aborted while queued is removed and never consumes a slot; an aborted in-flight request bails between retries. |
| Retry attempts | **3** |
| Normal cooldown after a failure | `1000 ms × (attempt + 1)`, armed **globally** (pauses all resolutions) |
| Cooldown on HTTP **429** | **30,000 ms**, global, and the attempt is retried without refreshing the token |
| Token refresh | On any non-429 non-OK status, and on any thrown error, before the next attempt |
| Cache re-check | After acquiring a slot, the cache is re-read (another queued caller may have resolved the same id) |
| Final failure | Throws `RedgifsResolutionError`; an abort throws `RedgifsAbortError` |

**Consumption in the player** (`utils/useResolvedVideoSource.ts`): if the id is already in the cache, the hook starts in `ready` with that URI, so a recycled cell never flashes back to a black loading tile; otherwise it goes to `loading`, resolves, and lands in `ready` or `error`. An abort leaves the state untouched (the post just went away — not an error). A manual `retry()` bumps an attempt counter that re-runs the effect. On a player error with a resolved Redgifs source, the cached entry for that id is cleared and a retry is triggered — playback failure *is* the expiry signal, so there is no TTL.

### 6.2 Redgifs / Reddit signed-URL handling (`utils/videoSourceFallback.ts`)

Some embedded videos fail only because their URL carries trailing tracking/cache-buster query params. On the **first** player error, the player retries once with everything from `?` onward stripped — **except** for hosts that sign their URLs, where the query string *is* the auth signature and stripping it produces a 403. Signed hosts (matched as the exact host or any subdomain of): `redd.it`, `redgifs.com`, `redgifs.net`. For those, `null` is returned and no trim is attempted; their own recovery paths (the reload watchdog, the Redgifs cache bust) handle them.

### 6.3 Video reload watchdog (`utils/videoWatchdog.ts`)

Not a network contract per se, but it governs re-requests. A player is "stuck" when it has a resolved source and is on screen but has not reached `readyToPlay`. Arm a reload after `2000 + attempts × 1000` ms, up to **3** attempts. This exists because during a fast fling iOS has not yet freed enough decoders and a fresh player comes up black and never recovers.

### 6.4 Imgur

No API, no key, no request beyond fetching the media itself. The only transformation is `.gifv` → `.mp4`. Non-gifv Imgur links are treated as ordinary external links, and are explicitly **excluded** from OpenGraph preview fetching.

### 6.5 Gfycat

Dead host. `gfycat.com/<path>` is rewritten to `https://web.archive.org/web/0if_/thumbs.{host}{path}-mobile.mp4` and played directly.

### 6.6 OpenGraph / link previews

See §2.15. Key numbers: **1,750 ms timeout** (deliberately short so a slow site never slows a feed load), abort on binary content types, `.svg` images dropped, failures silent. One request per eligible external-link post, fired concurrently with the rest of the page's formatting.

### 6.7 Sentry

DSN is hard-coded. Enabled only when not in dev **and** the user's error-reporting setting is not explicitly false. App-hang tracking disabled. Used for: JSON-parse-failure breadcrumbs in the transport, captured exceptions for unclassified feed load failures and for multireddit-list load failures, and user identification (`{username}`) tied to login/logout.

### 6.8 Expo OTA updates

When an EAS project id is configured at build time, the app points at `https://u.expo.dev/{projectId}` with a 5 s fallback-to-cache timeout. Not applicable to a native rewrite.

---

## 7. Error handling and what the user sees

| Condition | Detection | User-visible result |
|---|---|---|
| Not logged in, authed action attempted | no in-memory modhash | Alert `"You need to log in first!"`; the call throws; nothing is sent |
| Quarantined / gated subreddit | `quarantine_message` / `interstitial_warning_message` in body | Alert `"Warning"` + Reddit's own message; Cancel → empty feed, Proceed → accept POST then re-fetch |
| Banned subreddit | `reason === "banned"` | `🚫 r/{name} has been banned by Reddit Administrators for breaking Reddit rules` |
| Private subreddit | `reason === "private"` | `🔑 r/{name} has been set to private by its subreddit moderators` |
| Multireddit unreadable | all definition sources + both listings failed | `🔑 Reddit wouldn't share this multireddit. It may be private, deleted, or only visible to the account that owns it.` |
| Nonexistent user | `error === 404` | `🚫 {name} does not exist` |
| Banned/suspended user | `error === 403` or `data.is_suspended` | `🚫 {name} has been banned` |
| Anything else while loading a list (network drop, HTML error page, non-listing body, JSON parse failure) | catch-all | Reported to Sentry, list footer reads `Something went wrong loading this. Pull down to try again.` The loading spinner is explicitly cleared — the pre-fix behavior of leaving a spinner up forever is called out as a bug in the source. |
| Over-filtered feed | 5 retries with escalating limits all filtered to empty | `The filter limit has been reached. Your filters may be too strict to show anything.` and further load-more refused |
| End of listing | a page returned 0 raw items | `Wow. You've reached the bottom.` |
| Post submit: captcha | `errors[0][0] === "BAD_CAPTCHA"` | Alert offering to retry in an in-app WebView at new.reddit's submit page; self-post body copied to clipboard |
| Post submit: Reddit-supplied error | `errors[0][1]` is a string | That message shown verbatim |
| Post submit: other | anything else | `Failed to submit post / Unknown error` |
| Image upload failure | `uploadImage` returns null or throws | `Failed to upload image / Please try again later.` |
| Session expired at launch or switch | login procedure throws | `Login Session Expired` + instructions, then full logout |
| Login WebView failed | login procedure returned false | `Login failed / Something went wrong` |
| Media share/save failure | download or share threw | An error callback per call site; the "Preparing Image/Video…" modal is dismissed |
| Redgifs unresolvable | 3 attempts exhausted | The video tile shows an error state with a tappable retry |
| Rate limiting (HTTP 429) | **only handled for Redgifs** | 30 s global Redgifs cooldown. Reddit 429s are not detected at all — the body simply fails to parse or isn't a listing, and surfaces as the generic load failure. |
| Network offline | XHR error / timeout | Same generic load-failure path; there is no explicit offline detector in the network layer (network *type* is tracked only to pick the data-saving mode) |

**Retries in the system**, exhaustively: (a) the feed filter-retry loop, up to 5 escalating page fetches; (b) the multireddit merged-feed → own-feed fallback, plus 3 definition sources; (c) the gated-subreddit accept-then-refetch; (d) the short-link HEAD-then-GET; (e) Redgifs' 3 attempts with backoff; (f) the video reload watchdog's 3 reloads; (g) the video query-param-trim retry, once. There is **no generic HTTP retry** on Reddit calls.

---

## 8. Rate limiting, throttling, concurrency — summary table

| Mechanism | Scope | Value |
|---|---|---|
| Request timeout | all Reddit + Redgifs requests | 10 s |
| Request timeout | OpenGraph preview only | 1.75 s |
| Concurrent Redgifs resolutions | global | 2, LIFO queue, abortable |
| Redgifs cooldown after failure | global | 1 s × attempt number |
| Redgifs cooldown after 429 | global | 30 s |
| Redgifs retry attempts | per video | 3 |
| Inbox poll | while logged in | every 60 s |
| Account-settings repair | per account | at most once per 30 days |
| "Join r/HydraClient" prompt | per account | at most once per 365 days |
| Comment `more` batch size | per tap | 10 ids, issued fully in parallel |
| Post-detail comment limit | per open | 75 |
| Feed page size | per fetch | 10 (escalating to 20/40/70/100 on filter starvation; gallery 10/30/50) |
| Subreddit-list page size | per fetch | 100, depaginated until exhausted |
| Load-more trigger distance | feeds | 2 screen-heights from the end |
| Concurrency during post formatting | per page | one `Promise.all` over every post, each of which may issue one OpenGraph request; there is **no cap** on these |
| Video player instances | global | reference-counted registry, ~12-instance LRU safety cap, at most 1–2 live under focused-only playback |

Two structural notes for the rewrite, from the ADRs:
- **One player instance per video**, keyed on the *pre-resolution* source URL plus gallery index, shared between the inline feed cell and the fullscreen viewer, reference-counted with a deferred (next-tick) release so a tap or rotation does not destroy and recreate it (`docs/adr/0002`).
- **Focused-only playback**: at most one feed video plays — the center-most video post that is at least 70 % visible, or covers at least 60 % of the viewport if it is taller than the screen, once scrolling has settled (a 150 ms debounce, committed immediately on momentum end). During a fling nothing plays. Everything else renders a static poster with **no player attached**, which also means no video bytes are requested for posts the user flings past (`docs/adr/0003`).

---

## 9. Quick reference: every distinct host Hydra contacts

| Host | Why |
|---|---|
| `www.reddit.com` | Essentially everything: listings, post details, comments, search, user, inbox, multireddits, vote/save/comment/edit/delete, subscribe, block, flair, media-upload ticket |
| `old.reddit.com` | Post submission (`/api/submit`), account preferences (`/prefs`, `/post/options`), quarantine/gated acceptance, third multireddit-definition fallback |
| `new.reddit.com` | Captcha-fallback submit page, shown in a WebView only |
| `redd.it`, `i.redd.it`, `v.redd.it`, `preview.redd.it` | Media and short links; treated as Reddit hosts by the URL parser |
| the S3 host returned by `/api/image_upload_s3.json` | Direct multipart image upload |
| `api.redgifs.com` | Temporary auth token + per-gif resolution |
| `web.archive.org` | Gfycat video substitutes |
| `i.imgur.com` / `imgur.com` | Media only (after `.gifv` → `.mp4` rewriting); no API |
| `api.hydraapp.io` (or a user-configured host) | Documentation embedding + Q&A, and a `/api/status` health check |
| `*.ingest.us.sentry.io` | Crash / error reporting |
| `u.expo.dev` | OTA updates (build-time optional) |
| arbitrary external hosts | OpenGraph link previews, media downloads for share/save, in-app browser |

---

## Open questions / ambiguities

1. **`HYDRA_SERVER_URL` ignores its own toggle.** In release builds the URL is read straight from the `customHydraServerUrl` key, and the advanced-settings screen writes that key whenever a typed URL validates — even if the "use custom server" switch is off. The companion constant `USING_CUSTOM_HYDRA_SERVER` (which *does* consult the switch, and also refuses anything containing `hydraapp.io`) is **defined but never read anywhere**. Should the rewrite honor the switch, or reproduce the current behavior?
2. **`getEmbedding` always hits the default host** (`api.hydraapp.io`) while `askQuestion` honors the custom host. Intentional (the embedding must match the vectors baked into the binary) or a bug?
3. **Both Hydra-server POSTs send a JSON body with no `Content-Type` header.** Servers that require `application/json` would reject these. Does `api.hydraapp.io` sniff the body, or is this latent?
4. **`api()` never inspects HTTP status codes.** Reddit 429s, 500s and 503s are indistinguishable from malformed data. Should the rewrite add explicit status handling (with `Retry-After` for 429s), or preserve the body-shape-only contract?
5. **Documented Pro features have no implementation.** AI summaries, AI post filters, inbox push alerts, the gallery 100-item cap and the theme-maker time limit are all described in `documentation/*.md` but absent from the code (the `showPostSummary` / `showCommentSummary` settings exist but nothing reads them). Is the rewrite's target the documented product or the shipped code?
6. **`raw_json=1` is never sent on listings.** Hydra compensates with client-side HTML-entity decoding, and one field (`reddit_video.hls_url` in the first video rule) is notably *not* decoded while its sibling fallback is. Should the rewrite send `raw_json=1` and drop the decoding, which would change behavior for text containing literal `&amp;`?
7. **Post "media type" is never an explicit enum.** It is re-derived at render time from the presence and precedence of `crossPost` / `videos` / `images` / `externalLink` / `crossCommentLink` / `poll` / `html`. A SwiftUI model would probably want a real enum — but the precedence rules in §4.1.3 must be reproduced exactly, including the "no images if there's an externalLink" quirk.
8. **Pagination uses the last item's fullname, not the listing's `after`.** These usually agree, but they diverge for listings that filter items server-side. Was this deliberate, and should it be preserved?
9. **`formatUserData` reads `icon_img.split("?")`** with no null guard; a user object without `icon_img` would crash. Likewise `formatSubredditData` assumes `created_utc`. Is defensive handling wanted?
10. **Comment `more` stubs with `count: 0`** ("continue this thread", which has no child ids) are not distinguished from ordinary `more` stubs. The row would render `"0 more replies"` and tapping it would fetch nothing. Is deeper-thread navigation expected?
11. **Time formatting crosses a seam at ~12 months**: months use a 30-day divisor and years a 365-day one, so a post between 360 and 365 days old reports "0 years". Preserve or fix?
12. **The 30-day account-settings-repair timestamp is written before the request**, so a failed repair burns the whole window. Intentional throttle-on-attempt, or should it only be written on success?
13. **No explicit offline detection.** Network reachability is observed only to choose the data-saving mode; an offline feed load produces the same generic "Something went wrong" as a server error. Should the rewrite distinguish them?
14. **Reddit 429 handling is absent entirely** — only Redgifs has rate-limit logic. Given a keyless, cookie-based client hitting `www.reddit.com` directly, is a global Reddit throttle/backoff wanted in the rewrite?
15. **The login success detector is heuristic** (any navigation off an allow-list of four URL substrings, plus a 500 ms cookie poll). A native `ASWebAuthenticationSession` or `WKWebView` rewrite needs an equivalent; the allow-list will need auditing against Reddit's current login flow (it already carries a comment that `onLoadStart` does not fire for all users, possibly due to a Reddit A/B test).
