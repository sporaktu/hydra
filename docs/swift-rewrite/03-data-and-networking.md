# 03 — Data Model and Networking

**Project:** `APPNAME` (bundle id `com.OWNER.appname`, URL scheme `appname`).
**Status:** normative. This is the wire contract and the domain model. Where this document and a screen spec disagree about *what a field means*, this document wins; where they disagree about *what the screen shows*, the screen spec wins.
**Companion documents:** `02-architecture.md` (module boundaries, concurrency, persistence engine choice), `04a-feeds-posts-comments.md`, `04b-media.md`, `04c-accounts-inbox-search-subs-settings.md`, `05-monetization.md`, `06-build-plan.md`, `07-one-shot-prompt.md`, `08-decisions-and-drift.md`.

Reading order for an implementer: §1 (access model) → §2 (links) → §4 (domain model + derivation rules) → §5 (client and endpoints) → §7/§8 (persistence and settings).

---

## 1. The access model

### 1.1 Keyless, cookie-authenticated

There is no Reddit OAuth client id, no API key, and `oauth.reddit.com` is never contacted. The app talks to the public web endpoints on `https://www.reddit.com`, appending `.json` to page paths to get JSON, plus three specific things on `https://old.reddit.com` and one captcha fallback page on `https://new.reddit.com`.

Anonymous browsing needs no credentials at all. An authenticated action is authorized by two things travelling together:

1. a **`reddit_session` cookie** for `.reddit.com`, set by a real login performed inside a `WebView`, attached automatically by `URLSession`'s cookie storage; and
2. an **`X-Modhash` header** carrying the `modhash` string read from `/user/me/about.json`.

There is no refresh token and no expiry handling beyond "the request failed, so log out". No first-party backend is involved in Reddit access. `APPNAME` ships **no backend at all** (§9).

### 1.2 Request pipeline

`RedditClient` is an `actor` owning one `URLSession` built from a `URLSessionConfiguration` with `httpCookieStorage` set to a dedicated `HTTPCookieStorage`, `httpShouldSetCookies = true`, `requestCachePolicy = .reloadIgnoringLocalCacheData`, `urlCache = nil`, `timeoutIntervalForRequest = 10`, and `waitsForConnectivity = false`.

Every request passes through one method, in this order:

| Step | Behavior |
|---|---|
| 1 | If the call `requiresAuth` and no modhash is held in memory → throw `RedditError.notAuthenticated`. **No request is issued.** The UI surfaces "You need to log in first!" |
| 2 | If `requiresAuth` → set `X-Modhash: <modhash>` |
| 3 | Set `Cache-Control: no-cache` and `Pragma: no-cache` unless the caller already set them |
| 4 | If a form body is present → set `Content-Type: application/x-www-form-urlencoded` and percent-encode the body as URL-form pairs. **Every Reddit write is form-encoded, never JSON** |
| 5 | Set `User-Agent` to the per-launch randomized string (§1.4) |
| 6 | Issue the request. Cookies are attached by `URLSession`; the client never writes a `Cookie` header itself |
| 7 | After **every** response, run the session-cookie persistence rewrite (§5.4) |
| 8 | Classify the response (§10). Decode, or return raw text for the endpoints that ask for it |
| 9 | If the call is `depaginate` → while `data.after != nil`, rewrite the `after` query parameter and recurse, concatenating `data.children` |

**HTTP status is not the primary error signal.** Reddit returns error envelopes with a 200, and returns a 403 body that is still a perfectly good JSON envelope. Classification is by body shape first (§10.1). Status code handling is a *secondary* signal that `APPNAME` adds and the original lacks: 429 and 5xx are recognised (§11).

### 1.3 Ubiquitous query parameters

| Parameter | Where | Value | Note |
|---|---|---|---|
| `raw_json` | **every read** | `1` | **Change from the original**, which omitted it and entity-decoded ~30 string fields client-side — and missed one (`reddit_video.hls_url`). Sending it means text arrives unescaped and no decoding step exists. Behavioural consequence: a body containing the literal characters `&amp;` now renders as `&amp;` rather than `&`. Recorded as `raw-json-param` in `08` |
| `sr_detail` | every post-bearing listing | `true` | Supplies `sr_detail.community_icon` / `icon_img` inline so subreddit icons need no second request |
| `limit` | feeds, post detail | see §6.1 | Feeds ramp `10 → 20 → 40 → 70 → 100`; gallery mode `10 → 30 → 50`; post detail is a flat `75` |
| `after` | paginated reads | a **fullname**, see §6.1 | Always present (possibly empty) on feeds; omitted entirely on other endpoints until page 2 |

### 1.4 User-Agent

One randomized iOS-Safari string generated **once per launch** and reused for every Reddit request and every redirect follow. Never randomized per request.

```
Mozilla/5.0 (iPhone; CPU iPhone OS {IOS}_{MINOR} like Mac OS X) AppleWebKit/{WEBKIT}.60 (KHTML, like Gecko) Version/{SAFARI}.0 Mobile/15E148 Safari/{WEBKIT}.60
```

| Token | Uniform random integer range |
|---|---|
| `{IOS}` | 9…13 |
| `{MINOR}` | 0…9 |
| `{SAFARI}` | 600…604 |
| `{WEBKIT}` | 500…1199 |

Two exceptions: Redgifs requests use the literal UA `APPNAME`; the S3 media upload reuses the randomized Reddit UA.

*(The original's template omitted the `iPhone;` token through a typo in an unbalanced parenthesis. We emit the well-formed string. Recorded as `user-agent-string` in `08`.)*

---

## 2. Links: parsing, normalization, classification

`AppCore.RedditLink` is the single parser. It is a value type, has no I/O except the short-link resolver (§3), and is exhaustively unit-tested.

```swift
public struct RedditLink: Hashable, Sendable {
    public let normalized: URL
    public let kind: PageKind
    public var relativePath: String
    public var queryItems: [String: String]

    public init?(_ raw: String)                 // nil when the host is not accepted
    public var jsonEndpoint: URL { get }        // §2.5
    public var sort: (PostSort, TopWindow?)? { get }
    public func changingSort(_ sort: PostSort, time: TopWindow?) -> RedditLink
    public var subredditName: String? { get }
    public var displayName: String { get }
    public var basePage: RedditLink { get }     // trailing sub-path stripped to subreddit/home root
    public var isCombinedFeed: Bool { get }     // home, r/all, r/popular, any multireddit
    public var isShortLink: Bool { get }
}
```

### 2.1 Accepted hosts

Exact, case-insensitive match against this set, **never a prefix or suffix match** (a suffix match would accept `redd.it.evil.com`):

`www.reddit.com`, `redd.it`, `i.redd.it`, `v.redd.it`, `preview.redd.it`

Plus the internal scheme `appname://`, which is always accepted. Anything else fails construction.

### 2.2 Host normalization (applied before host checking)

Normative, in order:

1. `http://` → `https://`.
2. A bare host with no scheme gets `https://` prepended.
3. Any of `reddit.com`, `www.reddit.com`, `old.reddit.com`, `new.reddit.com`, `np.reddit.com`, `m.reddit.com`, `sh.reddit.com`, `amp.reddit.com` (with or without a scheme) folds to `https://www.reddit.com`.
4. `https://www.redd.it` → `https://redd.it` (drop the `www.`).
5. `https://www.reddit.com/r/u_<name>` → `https://www.reddit.com/user/<name>`.
6. A string starting with a single `/` expands to `https://www.reddit.com` + the string.
7. A string starting with `//` gets `https:` prepended verbatim.

### 2.3 Page-kind decision table

Evaluated in this exact order against the **normalized** URL's relative path; first match wins.

| # | Condition | `PageKind` |
|---|---|---|
| 1 | URL begins `appname://accounts` | `.appAccounts` |
| 2 | URL begins `appname://settings` | `.appSettings` |
| 3 | URL begins `appname://webview` | `.appWebView` |
| 4 | Path is empty or `/`, or begins `/best`, `/hot`, `/new`, `/top`, `/rising` | `.home` |
| 5 | Path contains `/comments/` | `.postDetails` |
| 6 | Path begins `/r/` **and** contains `/search/` | `.subredditSearch` |
| 7 | Path begins `/r/` **and** contains `/wiki/` or `/w/` | `.wiki` |
| 8 | Path begins `/r/` **and** contains `/about/` | `.sidebar` |
| 9 | Path begins `/r/` (none of the above) | `.subreddit` |
| 10 | Path begins `/message/inbox` | `.inbox` |
| 11 | Path begins `/message/messages` | `.messages` |
| 12 | Path matches `/(user|u)/<name>/m/<multi>` | `.multireddit` |
| 13 | Path begins `/u/` or `/user/` | `.user` |
| 14 | Path begins `/search` | `.search` |
| 15 | Host is `i.redd.it` | `.image` |
| 16 | Host is `preview.redd.it` | `.image` |
| 17 | otherwise | `.unknown` |

**`.image` is not a screen.** Opening an `.image` link presents the fullscreen media viewer directly with a single-item media set. It never pushes a route.

*Fidelity note.* The original derived the relative path by splitting the raw string on the first occurrence of `.it`, `.com`, `appname://` or `?`, which means the query string was always discarded before classification. `APPNAME` uses `URLComponents` and takes `path` — same result for every realistic input, correct for pathological ones (a subreddit whose name contains `.com` is impossible, but a query value containing `.com` is not).

### 2.4 Sort parsing and writing

| `PageKind` | Read | Write |
|---|---|---|
| `.home` | Path segment matching `best\|hot\|new\|top\|rising`; time from `?t=` | `https://www.reddit.com/{sort}/?{params}` |
| `.subreddit` | Path segment matching `best\|hot\|new\|top\|rising`; time from `?t=` | `https://www.reddit.com/r/{sub}/{sort}/?{params}` |
| `.multireddit` | Path segment matching `hot\|new\|top\|rising\|controversial`; time from `?t=`, **defaulting to `day`** when the sort is `top` and `t` is absent | Replace the sort path segment |
| `.subredditSearch` | `?sort=`; no time | `?sort=` |
| `.postDetails` | `?sort=`, `?t=` | `?sort=`, `?t=` |
| `.user` | `?sort=`, **defaulting to `new`**; `?t=` | `?sort=` |

Label normalisation when writing: `"Q&A"` → `qa`, `"Comment Count"` → `comments`, everything else lowercased.

### 2.5 `.json` endpoint construction

Take the path up to the first `?` or `#`; strip trailing slashes (but keep a single `/` if stripping would leave a bare domain); append `.json`; re-append `?` plus the original query string.

| Input | Output |
|---|---|
| `/r/pics` | `/r/pics.json?` |
| `/r/pics/top/?t=week` | `/r/pics/top.json?t=week` |
| `/user/bob/m/tech/` | `/user/bob/m/tech.json?` |
| `https://www.reddit.com` | `https://www.reddit.com/.json?` |

A trailing bare `?` in a request URL is normal and harmless; we reproduce it so captured-traffic comparisons match.

### 2.6 Preferred-sort defaulting

Applied whenever a link is navigated to and the link carries **no explicit sort**. If it has one, nothing happens.

1. **Home only:** do nothing unless the `sortHomePage` setting is on.
2. **Home or subreddit:** resolve in order — (a) if `rememberPostSubredditSort` is on and `postSubredditSort.<sub-lowercased>` exists, use it; else (b) `defaultPostSort`; else (c) the sentinel `default`, which means "apply nothing, let Reddit choose".
3. If the resolved sort is `top`, resolve the window the same way: per-subreddit → `defaultPostSortTop` → `all`.
4. **Post detail (comment sort):** the same ladder with `rememberCommentSubredditSort` / `commentSubredditSort.<sub>` / `defaultCommentSort`.
5. A resolved value of `default` writes nothing.

The write side is opportunistic: any manual sort change, when per-subreddit remembering is on for that content type, persists the choice (and the top window) under the subreddit-scoped key.

---

## 3. Short-link resolution

Share links (`/r/<sub>/s/<id>`, `/u/<name>/s/<id>`, `/user/<name>/s/<id>`) and short-domain links (`https://redd.it/<id>`) carry no meaningful page kind until followed. `i.redd.it`, `v.redd.it` and `preview.redd.it` are **media hosts, not short links**, and are matched by exact host, never by the `redd.it` substring.

| Aspect | Behavior |
|---|---|
| Trigger | The link is a short link, **or** its kind is `.unknown` |
| Request 1 | `HEAD <url>`, follow redirects, randomized UA |
| Request 2 | If `HEAD` yielded nothing usable **and** the link is a short link → the same with `GET` |
| Success | The final response URL, when it differs from the request URL, is an accepted Reddit URL, and is not itself another short link |
| Failure | Return `nil`; the caller keeps the original string. **Never throws** — this runs on arbitrary clipboard input |
| `/u/` handling | Rewritten to `/user/` before the request; a `/u/<name>/s/<id>` still gets its redirect followed |

`resolveIfValid(_:)` wraps the above in a catch-all and is the variant used by clipboard detection, share-extension intake and deep links.

---

## 4. Domain model

All types are `Sendable` value types in `AppCore`. Field-by-field derivation rules below are **normative**: each bullet describes exactly how to produce the field from Reddit's JSON.

### 4.0 Shared primitives

```swift
public struct Fullname: Hashable, Sendable, RawRepresentable {   // "t3_abc123"
    public let rawValue: String
    public var kind: ThingKind    // t1 comment · t2 account · t3 link · t4 message · t5 subreddit · more
    public var id: String         // the part after the underscore
}

public enum VoteDirection: Int, Sendable { case down = -1, none = 0, up = 1 }

public struct ImageVariant: Hashable, Sendable { public let url: URL; public let width: Int; public let height: Int }
public typealias ImageVariants = [ImageVariant]        // ascending by area; last is largest
```

- `Fullname` values are Reddit's and are used verbatim as the `id` parameter of every write call.
- **`likes` → `VoteDirection`:** `true` → `.up`, `false` → `.down`, `null`/absent → `.none`. This mapping appears on posts, comments and inbox items and must be identical in all three.

### 4.1 `Post`

```swift
public struct Post: Identifiable, Hashable, Sendable {
    public let id: String                       // data.id
    public let fullname: Fullname               // data.name
    public let title: String
    public let author: String
    public let subreddit: String
    public let subredditIconURL: URL?
    public let permalink: URL                   // "https://www.reddit.com" + data.permalink
    public let createdAt: Date                  // data.created (epoch seconds)

    public let score: Int                       // data.ups
    public let isScoreHidden: Bool              // data.score_hidden
    public let commentCount: Int                // data.num_comments
    public let userVote: VoteDirection
    public let isSaved: Bool

    public let authorFlair: Flair?
    public let linkFlair: LinkFlair?

    public let isModeratorDistinguished: Bool
    public let isStickied: Bool
    public let isNSFW: Bool
    public let isSpoiler: Bool
    public let interactionState: InteractionState   // .normal | .locked | .archived

    public let selfText: String                 // data.selftext (markdown)
    public let selfTextHTML: String?            // data.selftext_html — retained only for the fallback renderer

    public let media: PostMedia
    public let mediaAspectRatio: Double         // 0.75 when unknown
    public let crossPost: Box<Post>?            // recursively formatted parent
    public let crossCommentLink: URL?
    public let externalLink: URL?
    public let openGraph: OpenGraphData?
    public let poll: Poll?

    public var paginationCursor: Fullname { fullname }   // §6.1
}

public enum InteractionState: Sendable { case normal, locked, archived }
```

**Derivation rules**

- `id` = `data.id`; `fullname` = `data.name`.
- `title` = `data.title`; `author` = `data.author`; `subreddit` = `data.subreddit`.
- `subredditIconURL`: `data.sr_detail.community_icon` **truncated at the first `?`**, else `data.sr_detail.icon_img`, else `nil`. (This is why every listing sends `sr_detail=true`.)
- `permalink` = `"https://www.reddit.com"` + `data.permalink`. Note the difference from `Comment.permalink`, which stays relative.
- `createdAt` = `Date(timeIntervalSince1970: data.created)`. `data.created` is seconds; `data.created_utc` is the same value for our purposes. Prefer `created`.
- `score` = `data.ups` (**not** `data.score`). `isScoreHidden` = `data.score_hidden`.
- `userVote` from `data.likes` per §4.0.
- `isModeratorDistinguished` = `data.distinguished == "moderator"`. **Admin distinction is not modelled** — an admin-distinguished post falls through as ordinary.
- `isStickied` = `data.stickied`; `isNSFW` = `data.over_18`; `isSpoiler` = `data.spoiler`.
- `interactionState`: `data.archived == true` → `.archived`; else `data.locked == true` → `.locked`; else `.normal`. **Archived wins over locked.**
- `selfText` = `data.selftext`; `selfTextHTML` = `data.selftext_html`.
- `mediaAspectRatio` = first image variant's `width / height`, **defaulting to `0.75`** when there are no images or no dimensions. Used to size the feed's media box and the gallery cell.
- `crossPost`: if `data.crosspost_parent_list` is a non-empty array, recursively build a `Post` from element `[0]` (wrapped in a synthetic `{ data: … }`). Nested crossposts of crossposts are possible; the recursion is depth-limited to 3 to be safe.
- `paginationCursor` is the post's **own** fullname (§6.1).

#### 4.1.1 Flags summary (for implementers checking parity)

| Flag | Source | Where it surfaces |
|---|---|---|
| NSFW | `over_18` | Media blur when `blurNSFW` (default on) |
| Spoiler | `spoiler` | Media blur when `blurSpoilers` (default on); NSFW wins the label when both |
| Stickied | `stickied` | Pin glyph in moderator colour, feed card and detail header |
| Moderator | `distinguished == "moderator"` | Author name colour |
| Locked / archived | `locked` / `archived` | Detail header only — **never on the feed card**; blocks reply with "This post has been {state}" |
| Edited | `edited` (see §4.2) | Pencil glyph + alert with the exact time; posts and comments |
| Saved | `saved` | Bookmark notch corner triangle |
| Score hidden | `score_hidden` | Comments render `-` instead of a number **only while the user's own vote is `.none`** |

### 4.2 `PostMedia`

The original never stored a media type; it re-derived one at render time from the presence and precedence of several fields. `APPNAME` computes it **once**, at decode time, into a real enum. The precedence must be reproduced exactly.

```swift
public enum PostMedia: Hashable, Sendable {
    case none
    case selfText                                   // body only
    case image(ImageVariants)                       // single image, variants ascending
    case gallery([ImageVariants])                   // ordered gallery items
    case video([VideoSource])                       // one entry per gallery item
    case link(URL)                                  // external link card
    case crossComment(URL)                          // crosspost of a comment
    case crossPost                                  // renders the parent post's card
    case poll                                       // poll card (may coexist with text)
}
```

**Classification algorithm (normative, in order):**

1. Build `images` (§4.3) and `videos` (§4.4) unconditionally.
2. Classify `data.url` (§4.5) producing at most one of `crossCommentLink` or `externalLink`.
3. If `crossPost != nil` → `.crossPost`. **A crosspost never falls through.** The card renders the parent post's media recursively, but the outer tap target and title belong to the crosspost.
4. Else if `!videos.isEmpty && crossCommentLink == nil` → `.video(videos)`.
5. Else if `!images.isEmpty && crossCommentLink == nil && externalLink == nil` → `.image` (one item) or `.gallery` (more than one).
6. Else if `externalLink != nil` → `.link(externalLink!)`; else if `crossCommentLink != nil` → `.crossComment(crossCommentLink!)`.
7. Else if `selfText` is non-empty → `.selfText`.
8. Else → `.none`.
9. **Independently of 3–8**, if `data.poll_data` exists, `poll` is set and the poll card renders after whatever the above produced.

Effective precedence: **crosspost > video > image/gallery > link > self-text**, with poll orthogonal. Note rule 5's quirk — a post that has *both* preview images and a non-Reddit `url` renders as a link card, not an image. That is intentional parity.

### 4.3 Image extraction

Two mutually exclusive sources, tried in order.

**A. `data.preview.images`** — used when non-empty. For each entry:
- Take `image.resolutions[]` in the order Reddit gives them (ascending), mapping `{url, width, height}` → `ImageVariant`.
- **Append `image.source`** as the final, largest element when present.
- URLs come through `raw_json=1` already unescaped.

**B. `data.gallery_data.items` + `data.media_metadata`** — only when A produced nothing:
- Build `media_id → index` from `gallery_data.items` order.
- Take the values of `media_metadata`; **drop any entry lacking a `p` array** (Reddit leaves some gallery media unprocessed).
- Sort by the index map.
- For each, map `p[].{u,x,y}` → variants, then append `s.{u,x,y}` last when present.

If neither yields anything, `images` is empty.

**Display selection.** The full variant array is handed to the loader, which picks by target size. In low-data mode only index 0 (the smallest) is used and at most **one** image is rendered inline instead of up to **two**; the first tap permanently opts that cell out of low-data for the rest of its life.

### 4.4 Video extraction — the classification ladder

`videos` is an ordered array; **the first matching rule wins** and produces the whole array.

| # | Condition | Emits |
|---|---|---|
| 1 | `data.media.reddit_video.hls_url` exists | One entry. `playback = .hls(hls_url)`, `download = reddit_video.fallback_url` (the DASH mp4) |
| 2 | `data.media.reddit_video.fallback_url` exists and there is no `hls_url` (older videos, some crossposts) | One entry; `playback = .direct(fallback_url)`, `download` identical |
| 3 | `data.gallery_data.items` is non-empty (gallery videos) | One entry per `media_metadata` value that has a `p` array, ordered by `gallery_data.items`, using `s.mp4`. Entries lacking `s.mp4` are dropped. **Checked before rule 4** so a gallery that also carries a `preview` is not collapsed to a single preview-resolution video |
| 4 | `data.preview.images[0].variants.mp4` exists (the GIF-as-video path) | One entry per preview image: `variants.mp4.source` when present, else the **last** element of `variants.mp4.resolutions` (the largest downscale). Nulls dropped |
| 5 | `data.url` is **not** a Reddit URL, contains `imgur.com`, and ends `.gifv` | One entry, `.gifv` → `.mp4`, same URL for playback and download |
| 6 | `data.url` is not a Reddit URL and contains `gfycat.com` | One entry: `https://web.archive.org/web/0if_/thumbs.{urlWithoutScheme}-mobile.mp4`. Gfycat is dead; this is a Wayback mirror |
| 7 | `data.url` is not a Reddit URL and contains `redgifs.com` | One entry, `playback = .needsResolution(watchURL)`, `download = watchURL`. Lazily resolved at display time (§12) |
| 8 | otherwise | empty |

**`VideoSource.key`** is `(pre-resolution playback URL, gallery index)`. It must stay stable across resolution, because it is the player-registry key, the focus key and the playback-position key.

**Animated `.gif` image files** are *not* videos. They live in `images` and are rendered by the image pipeline, always animating, never subject to video focus.

### 4.5 Link and external-link classification

Let `url = data.url` and `isReddit = RedditLink(url) != nil`.

**If `url` IS a Reddit URL:**

- Contains `/comments/` **and** does not contain the post's own `permalink` → `crossCommentLink = url`; no `externalLink`.
- Else if the URL's `PageKind` is one of `.subreddit`, `.subredditSearch`, `.multireddit`, `.user`, `.search`, `.wiki`, `.sidebar` → `externalLink = url` (it renders as a link card that navigates in-app). **Extra rule:** a `.subreddit` target counts only when its subreddit name differs case-insensitively from the post's own subreddit.
- Else (i.redd.it images, `/gallery/` links, the post's own permalink) → neither is set; media extraction already covers it.

**If `url` is NOT a Reddit URL:**

- `externalLink = data.url`, raw and un-normalized.
- **OpenGraph is fetched** only when *all* hold: `videos` is empty, and the URL contains none of `imgur.com`, `gfycat.com`, `redgifs.com`, `.gif`, `.gifv`, `.mp4`.
- The fetch is concurrent with the rest of the page's decoding, one request per eligible post, with a hard 1.75 s timeout (§8 of this list; see §13).

### 4.6 `Comment`

```swift
public struct Comment: Identifiable, Hashable, Sendable {
    public let id: String
    public let fullname: Fullname
    public let depth: Int                 // root comments = 0; the PostDetail pseudo-node = -1
    public let path: [Int]                // child-array indices from the root
    public var isCollapsed: Bool
    public let author: String
    public let isSubmitter: Bool          // "OP"
    public let isModeratorDistinguished: Bool
    public let isStickied: Bool
    public let editedAt: Date?
    public let score: Int                 // data.ups
    public let isScoreHidden: Bool
    public let isSaved: Bool
    public let userVote: VoteDirection
    public let authorFlair: Flair?
    public let permalink: String          // data.permalink — RELATIVE, unlike Post.permalink
    public let postTitle: String?         // data.link_title — inbox / user-content only
    public let postPermalink: String?     // data.link_permalink
    public let subreddit: String
    public let body: String               // data.body (markdown)
    public let bodyHTML: String?          // data.body_html — fallback renderer only
    public var replies: [Comment]
    public var more: MoreStub?
    public let createdAt: Date
}

public struct MoreStub: Hashable, Sendable {
    public let depth: Int                 // more.data.depth
    public var childIDs: [String]         // more.data.children — bare ids, not fullnames
    public var isContinueThread: Bool     // count == 0 && children.isEmpty
}
```

**Derivation rules**

- `depth` = the length of the **parent's** path. Root comments are 0. The post itself, when modelled as a pseudo-comment for the detail screen, is −1.
- `path` = parent path + `(index within this children array + childStartIndex)`. `childStartIndex` is non-zero when appending a "load more" batch, so paths stay unique and stable.
- `isCollapsed` is `true` at decode time **only when** all three hold: the `collapseAutoModerator` setting is on (default **true**), the comment is top-level (`parentPath.isEmpty`), and `author == "AutoModerator"`. Nested AutoModerator replies are never auto-collapsed.
- `editedAt`: Reddit sends `false` or an epoch-seconds number. `false` → `nil`; a number → `Date(timeIntervalSince1970: n)`.
- `score` = `data.ups` (posts and comments); **inbox comment replies use `data.score` instead** (§4.11) — this asymmetry is Reddit's, and must be reproduced.
- `replies`: recurse over `data.replies.data.children` when `data.replies` is truthy. Reddit sends the **empty string** `""` when there are no replies, so a naive object decode fails; decode `replies` as an either-string-or-object.
- `more`: from the **first** child of `replies.data.children` whose `kind == "more"`: `depth = more.data.depth`, `childIDs = more.data.children`.
- Children with `kind == "more"` are **skipped** in the comment array itself; they surface only as the parent's `more`.
- **`isContinueThread`**: Reddit's "continue this thread" is a `more` with `count: 0` and no children. The original did not distinguish it and would render "0 more replies" that fetched nothing. `APPNAME` renders it as a **"Continue this thread →"** row that pushes the comment's permalink. Recorded as `more-stub-count-zero` in `08`.

### 4.7 `PostDetail`

The union of `Post` and comment-node fields, produced by endpoint **C1**, whose response is a **two-element array**: `[0]` is a listing containing exactly one post child, `[1]` is the comment listing.

```swift
public struct PostDetail: Hashable, Sendable {
    public let post: Post
    public var comments: [Comment]
    public var more: MoreStub?          // the thread-level "load more", if any
    public let isSubmitter: Bool        // data.is_submitter on the post child
    public let editedAt: Date?
}
```

- `comments` = formatted from `response[1].data.children`.
- `more` = from a top-level `kind == "more"` child of `response[1].data.children`.
- The pseudo-node has `depth == -1`, `path == []`, `isCollapsed == false`.
- There is no `after` cursor on this endpoint; comment paging happens exclusively through `more` stubs.

### 4.8 `Subreddit`

```swift
public struct Subreddit: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String             // data.display_name
    public let url: URL                 // "https://www.reddit.com" + data.url
    public let isModerator: Bool        // data.user_is_moderator
    public let isSubscribed: Bool       // data.user_is_subscriber
    public let publicDescription: String?
    public let iconURL: URL?
    public let subscriberCount: Int
    public let createdAt: Date          // data.created_utc
    public var paginationCursor: Fullname   // data.name — "t5_…"
}
```

- `id` = `data.id`, falling back to the substring of `data.name` after the underscore (`t5_2qh1i` → `2qh1i`).
- `iconURL` = `data.community_icon` **truncated at the first `?`**, else `data.icon_img`, else `nil`.
- `createdAt` must be decoded defensively; a subreddit object missing `created_utc` must not crash the page (the original would).

Related:

```swift
public struct SubredditSidebar: Sendable { public let subscriberCount: Int; public let descriptionHTML: String }
public struct SubredditRule: Sendable { public let name: String; public let descriptionHTML: String }
```
- `SubredditSidebar.subscriberCount` = `data.subscribers ?? 0`; `descriptionHTML` = `data.description_html`.
- `SubredditRule` from `rules[]`: `name` = `short_name`, `descriptionHTML` = `description_html`.
- These two are the **only** places we consume Reddit's rendered HTML rather than markdown, because Reddit does not expose the markdown source for them. They go through the HTML branch of the markdown pipeline (`02 §9.1`).

### 4.9 `User`

```swift
public struct User: Identifiable, Hashable, Sendable {
    public let id: String               // BARE id, no "t2_" prefix
    public let name: String
    public let commentKarma: Int        // data.comment_karma
    public let postKarma: Int           // data.link_karma
    public let iconURL: URL?            // data.icon_img truncated at first "?"
    public let inboxCount: Int?         // data.inbox_count — present only for the authenticated user
    public let isFriend: Bool           // data.is_friend
    public let isSuspended: Bool        // data.is_suspended
    public let createdAt: Date          // data.created_utc
    public let modhash: String?         // data.modhash — only on /user/me/about.json
    public var isCurrentUser: Bool { inboxCount != nil }
}
```

- **`isCurrentUser` is the presence of `inbox_count`.** Reddit returns that field only on the authenticated user's own `/about`. This is the signal that decides whether the profile shows the self-only sections (Upvoted, Downvoted, Hidden, Saved Posts, Saved Comments).
- Blocking prepends `t2_` to `id` at call time.
- `iconURL` must tolerate a missing `icon_img` (the original would crash).

### 4.10 `Multireddit`

```swift
public struct Multireddit: Identifiable, Hashable, Sendable {
    public let id: String               // data.name
    public let displayName: String      // data.display_name
    public let iconURL: URL?            // data.icon_url
    public let path: String             // data.path — ALWAYS has a trailing slash, e.g. "/user/bob/m/tech/"
    public let subreddits: [Subreddit]
}
```

- `subreddits` from `data.subreddits[]`, sorted by name, tolerating **two shapes**: expanded (`{name, data:{…}}`, what `expand_srs=true` produces) → normal subreddit decoding; bare (`{name}`) → synthesize `{display_name: name, url: "/r/{name}/"}`. A missing `subreddits` key yields `[]`.
- **Endpoint paths for add/remove must be re-derived** as `user/<owner>/m/<name>` from the components, **not** concatenated onto `path` — `path`'s trailing slash produces `…/m/tech//r/apple` and a 404.

### 4.11 Inbox items

```swift
public enum InboxItem: Identifiable, Hashable, Sendable {
    case commentReply(CommentReply)
    case message(PrivateMessage)
}

public struct CommentReply: Identifiable, Hashable, Sendable {
    public let id: String
    public let fullname: Fullname
    public let author: String
    public let score: Int            // data.score  ← NOT data.ups
    public let userVote: VoteDirection
    public var isUnread: Bool        // data.new
    public let postTitle: String     // data.link_title
    public let contextLink: String   // data.context
    public let subreddit: String
    public let body: String          // data.body
    public let createdAt: Date
}

public struct PrivateMessage: Identifiable, Hashable, Sendable {
    public let id: String
    public let fullname: Fullname
    public let author: String
    public let subject: String
    public var isUnread: Bool
    public let body: String
    public let createdAt: Date
}
```

- Only children with `kind == "t1"` (comment reply) or `kind == "t4"` (message) are kept; everything else is dropped.
- Username **mentions** arrive as ordinary `t1` items and are not distinguished. There is no mentions filter.
- Conversation threads (endpoint **I3**) return the root message first; `data.replies` is the **empty string** when absent, otherwise an object whose `data.children` are the replies. Flatten root + replies into one chronological array.

### 4.12 `Flair` (author flair) and `LinkFlair` (post flair)

```swift
public struct Flair: Hashable, Sendable {
    public let text: String?
    public let emojiURLs: [URL]
}
public struct LinkFlair: Hashable, Sendable {
    public let id: String
    public let text: String
    public let isModOnly: Bool
}
```

**`Flair`** from `data.author_flair_richtext[]` when it is an array:
- Entries with `e == "emoji"` contribute `u` (an image URL) to `emojiURLs`.
- Entries with `e == "text"` set `text` to a trimmed `t`; **the last one wins**.
- If both are still empty **and** `data.author_flair_text` is a string, `text` is that raw value.
- Return `nil` when there is neither an emoji nor text.

**`LinkFlair`** is produced **only when both** `data.link_flair_template_id` and `data.link_flair_text` are present; otherwise `nil`. A free-text flair with no template id therefore shows no chip — parity, not a bug. `isModOnly` is `false` on posts.

The **allowed** flairs for a subreddit (endpoint **S2**) map to `{id, text, isModOnly: mod_only}`; the composer filters `isModOnly` entries out entirely rather than showing them disabled.

### 4.13 `Poll`

```swift
public struct Poll: Hashable, Sendable {
    public let totalVoteCount: Int              // data.poll_data.total_vote_count
    public let options: [PollOption]            // data.poll_data.options, verbatim
    public let userSelectedOptionID: String?    // data.poll_data.user_selection
    public let endsAt: Date?                    // data.poll_data.voting_end_timestamp (ms)
}
public struct PollOption: Identifiable, Hashable, Sendable {
    public let id: String
    public let text: String
    public let voteCount: Int?                  // data.poll_data.options[].vote_count — present only after the poll closes or after voting
}
```

The original models only `total_vote_count` and the raw options array, renders a radio list, and its "Vote" button is a **stub that shows an alert and issues no request**; no per-option counts are read. `APPNAME` decodes the fuller shape so the decision in `08` (`poll-voting-stub` — implement `POST /api/vote` with the poll option, or render read-only with results) can be made without a model change. Until that decision lands, polls render **read-only with results when Reddit supplies them**, which is strictly better than a fake button.

### 4.14 Awards

**Not modelled.** No award field is read or rendered anywhere. Reddit's awards have largely been retired; if they return, `Post` gains an `awards: [Award]` field and one card row.

### 4.15 `OpenGraphData`

```swift
public struct OpenGraphData: Hashable, Sendable {
    public let title: String?
    public let type: String?
    public let imageURL: URL?
    public let url: URL?
    public let description: String?
}
```
Every `<meta property="og:{key}">`'s `content`, collected by a streaming parser. **`og:image` values containing `.svg` are dropped.** No fallback to `<title>` or `<meta name="description">`, no Twitter Card tags, no favicon fetching, no per-host special cases.

### 4.16 Formatting helpers — bug-compatible on purpose

**Relative time.** Computed from `|now − t|`, with floored integer division and strict `<` boundaries.

| Bucket | Long form | Short form |
|---|---|---|
| < 60 s | `"{n} second(s)"` | `"{n}s"` |
| < 60 min | `"{n} minute(s)"` | `"{n}m"` |
| < 24 h | `"{n} hour(s)"` | `"{n}h"` |
| < 30 days | `"{n} day(s)"` | `"{n}d"` |
| months = ⌊days/30⌋ < 12 | `"{n} month(s)"` | `"{n}mo"` |
| otherwise, years = ⌊days/365⌋ | `"{n} year(s)"` | `"{n}y"` |

Pluralisation is `n == 1 ? "" : "s"`. Post and comment timestamps append `" ago"`; account and subreddit ages append `" old"`.

**Do not use `RelativeDateTimeFormatter`.** It is calendar-aware and produces different strings for many inputs. Reproduce the arithmetic. Note the deliberate seam: the months bucket divides by 30 and the years bucket by 365, so a post 360–364 days old reports `"0 years"`. That is the original's behavior and is preserved so captured-screenshot comparisons match; whether to fix it is `time-year-seam` in `08`.

**Compact numbers.** Strict `>` comparisons, always one decimal place:

| Condition | Output |
|---|---|
| `n > 1_000_000_000` | `"{n/1e9, 1dp}B"` |
| `n > 1_000_000` | `"{n/1e6, 1dp}M"` |
| `n > 1_000` | `"{n/1e3, 1dp}K"` |
| otherwise | the plain integer, unformatted |

Exactly `1000` prints `1000`. Compact numbers are used for subreddit subscriber counts and the quick-search rows; the **feed card prints raw integers** for score and comment count.

---

## 5. The client

### 5.1 Shape

```swift
public actor RedditClient {
    public init(session: URLSession, sessionStore: SessionStore, userAgent: String)

    // Reads
    public func feed(_ target: FeedTarget, after: Fullname?, limit: Int) async throws -> Page<Post>
    public func postDetail(_ target: PostTarget, limit: Int) async throws -> PostDetail
    public func moreComments(post: PostTarget, ids: [String]) async throws -> [Comment]
    public func reloadComment(permalink: String) async throws -> Comment
    public func search(_ scope: SearchScope, query: String, after: Fullname?, sort: SearchSort?, time: TopWindow?) async throws -> Page<SearchResult>
    public func subredditSearch(_ target: SubredditSearchTarget, after: Fullname?, limit: Int) async throws -> Page<Post>
    public func mySubreddits() async throws -> [Subreddit]           // depaginated
    public func myModeratedSubreddits() async throws -> [Subreddit]  // depaginated
    public func trendingSubreddits(limit: Int) async throws -> [Subreddit]
    public func subredditAbout(_ name: String) async throws -> Subreddit?
    public func sidebar(_ name: String) async throws -> SubredditSidebar
    public func rules(_ name: String) async throws -> [SubredditRule]
    public func user(_ name: UserRef, allowSuspended: Bool) async throws -> User
    public func userContent(_ target: UserTarget, after: Fullname?) async throws -> Page<UserContentItem>
    public func inbox(after: Fullname?) async throws -> Page<InboxItem>
    public func conversation(_ id: String) async throws -> [PrivateMessage]
    public func myMultireddits() async throws -> [Multireddit]
    public func multireddit(_ path: MultiredditPath) async throws -> Multireddit
    public func linkFlairs(_ subreddit: String) async throws -> [LinkFlair]

    // Writes  (all requiresAuth)
    public func vote(_ fullname: Fullname, _ direction: VoteDirection) async throws
    public func setSaved(_ fullname: Fullname, _ saved: Bool) async throws
    public func delete(_ fullname: Fullname) async throws
    public func edit(_ fullname: Fullname, text: String) async throws
    public func comment(parent: Fullname, text: String) async throws -> Comment?
    public func submit(_ draft: PostDraft) async throws -> SubmitResult
    public func uploadImage(_ file: URL, mimeType: String) async throws -> URL
    public func setSubscribed(_ subreddit: String, _ subscribed: Bool) async throws
    public func addToMultireddit(_ path: MultiredditPath, subreddit: String) async throws
    public func removeFromMultireddit(_ path: MultiredditPath, subreddit: String) async throws
    public func blockUser(id: String) async throws
    public func setMessageRead(_ fullname: Fullname, _ read: Bool) async throws
    public func markAllMessagesRead() async throws
    public func compose(to: String, subject: String, text: String) async throws
    public func acceptInterstitial(_ kind: InterstitialKind, subreddit: String) async throws
}
```

`Page<T>` carries `items`, `rawCount` (pre-filter, needed by the filter-retry loop) and `nextCursor`.

### 5.2 Endpoint catalog

Host is `https://www.reddit.com` unless stated. All reads add `raw_json=1`. "Auth" means the modhash header is required and the call fails closed without it.

#### Feeds and posts

| # | Method | URL template | Auth | Body / params | Response handling |
|---|---|---|---|---|---|
| P1 | GET | `{feedPath}.json?{existing}&raw_json=1&sr_detail=true&limit={limit}&after={after}` | cookie | — | Listing. `{feedPath}` is any home/subreddit/multireddit/user page path with the sort baked into the path (`/r/pics/top`) and `t` in the query. `after` is **always present**, empty string on page 1 |
| P2 | GET | `https://www.reddit.com/r/{a+b+c}{/sort}.json?t={t}&raw_json=1&sr_detail=true&limit=&after=` | cookie | — | The merged-subreddit listing used to render a multireddit feed (see M3) |
| P3 | GET | `{subredditSearchPath}.json?q={q}&restrict_sr=true&raw_json=1&sr_detail=true&limit={limit}&after={after}&sort={sort}` | none | — | In-subreddit post search |
| C1 | GET | `{postPermalink}.json?{sort,t}&raw_json=1&sr_detail=true&limit=75` | cookie | — | **Two-element array**: `[0]` post listing (1 child), `[1]` comment listing. No `after` |
| C2 | GET | `/r/{sub}/comments/{postID}/comment/{commentID}/.json?raw_json=1` | none | — | "Load more". Issued **in parallel for up to 10 ids at a time**. Each response's `[1].data.children[0]` is the subtree |
| C3 | GET | `{commentPermalink}.json?raw_json=1` | cookie | — | Reload one comment after edit/reply; read `[1].data.children[0]` |

#### Voting, saving, editing, replying

| # | Method | URL | Auth | Form body | Notes |
|---|---|---|---|---|---|
| V1 | POST | `/api/vote` | **yes** | `id` (fullname), `dir` ∈ `1` / `0` / `-1` | If the requested direction equals the current vote, send `0` (un-vote). Local score update is `score - oldVote + newVote` |
| V2 | POST | `/api/save` or `/api/unsave` | **yes** | `id` | |
| V3 | POST | `/api/del` | **yes** | `id` | |
| V4 | POST | `/api/editusertext` | **yes** | `thing_id`, `text` | Returns `{success: Bool}` |
| V5 | POST | `/api/comment` | **yes** | `thing_id`, `text` | Returns `{success: Bool}`; a missing `success` is treated as `false`. Also used to reply to a private message (I5) |

#### Post creation, flair, media upload

| # | Method | URL | Auth | Body | Response |
|---|---|---|---|---|---|
| S1 | POST | `https://old.reddit.com/api/submit?api_type=json` | **yes** | form: `sr`, `kind` (`self`/`link`/`image`), `title`, `flair_id` (only when chosen), **`text` when `kind == "self"` else `url`**, `extension=json` | `json.errors`, `json.data.url` |
| S2 | GET | `/r/{sub}/api/link_flair_v2.json?raw_json=1` | cookie | — | `[{id, text, mod_only}]` |
| S3 | POST | `/api/image_upload_s3.json` | **yes** | form: `filepath` (file name), `mimetype`, `raw_json=1` | `action` (protocol-relative S3 host), `fields[]` of `{name, value}` |
| S4 | POST | `https:{action}` (the S3 host from S3) | n/a | `multipart/form-data`: every `fields[]` entry as a form field, plus `file`. Randomized UA. **Bypasses the shared pipeline** | XML; extract `<Location>…</Location>` as the uploaded URL |

**Submit error mapping (S1):**
- `json.errors[0][0] == "BAD_CAPTCHA"` → `SubmitError.captcha`. The UI offers to retry inside a `WebView` at `https://new.reddit.com/r/{sub}/submit/?type={text|link|image}` with shared cookies, copying a self-post's body to the pasteboard first because that form starts empty.
- `json.errors[0][1]` is a string → `SubmitError.reddit(message)`, shown verbatim.
- `errors` missing, or non-empty in any other shape → `SubmitError.unknown`.
- Success with no `data.url` (what image submissions do) → treat as success, message "Post is being processed".

**Image post flow:** pick → S3 → S4 → put the returned URL in `url` → S1 with `kind: "image"`.

#### Subreddits

| # | Method | URL | Auth | Notes |
|---|---|---|---|---|
| R1 | GET | `/subreddits/mine.json?limit=100&raw_json=1` | cookie | **Depaginated**: follow `data.after` until null |
| R2 | GET | `/subreddits/mine/moderator.json?limit=100&raw_json=1` | cookie | Depaginated; issued in parallel with R1 |
| R3 | GET | `/subreddits.json?limit={n}&raw_json=1` | none | "Trending". Default 10; the subreddits screen asks for 30 |
| R4 | POST | `/api/subscribe.json?sr_name={name}&action={sub\|unsub}` | **yes** | Parameters in the **query string**; the body is empty |
| R5 | GET | `/r/{sub}/about.json?raw_json=1` | cookie | Sidebar: `data.subscribers`, `data.description_html` |
| R6 | GET | `/r/{sub}/about/rules.json?raw_json=1` | none | `rules[].short_name`, `rules[].description_html` |
| R7 | GET | `/r/{name}/about.json?raw_json=1` | none | Exact-name resolution for the switcher. Returns a `t5` even for private/quarantined/banned subs; only a non-`t5` body or a thrown error yields `nil` |

R1/R2 results are sorted by name with a locale-aware comparison. **Favorites are local only** (`favoriteSubreddits.<userID>`); there is no Reddit favorites API call, and favorites are intersected against the live subscriber list so an unsubscribed-but-favorited subreddit silently disappears.

#### Search

| # | Method | URL | Auth | Notes |
|---|---|---|---|---|
| Q1 | GET | `/search.json?type={link\|sr\|user}&q={q}&raw_json=1&sr_detail=true&{sort,limit,after,t}` | none | `type` is `link` for posts, `sr` for subreddits, `user` for users |

- **Subreddit-scope query rewrite:** the raw text is rewritten to `"/r/" + text.trimmed` after stripping a leading `/r/`, `r/` or `/`. This works around Reddit's minimum-length behavior for 1–2 character subreddit names.
- Children are dispatched by `kind`: `t3` → post, `t5` → subreddit, `t2` → user (skipped when `data.id` is missing). Anything else is dropped.
- A response without `data` yields an empty array, not an error.
- **User search does not paginate**: once an `after` cursor exists for the users scope, return `[]` immediately (Reddit serves one page).

#### Inbox and messages

| # | Method | URL | Auth | Body | Notes |
|---|---|---|---|---|---|
| I1 | GET | `/message/inbox.json?raw_json=1&{sort,limit,after}` | **yes** | — | Keep only `t1` and `t4` children |
| I2 | POST | `/api/read_message` or `/api/unread_message` | **yes** | `id` (fullname) | |
| I3 | GET | `/message/messages/{id}.json?raw_json=1` | **yes** | — | Root message + `data.replies` (empty **string** when absent) |
| I4 | POST | `/api/compose?api_type=json` | **yes** | `to`, `subject`, `text` | Success = `json.errors` is an array of length 0 |
| I5 | POST | `/api/comment?api_type=json` | **yes** | `thing_id` (the message's fullname), `text` | Reply to a private message — the same endpoint as commenting. Success = empty `errors` |
| I6 | POST | `/api/read_all_messages` | **yes** | — | Response read as text, not parsed |

**Inbox polling:** while logged in and foregrounded, I1 runs immediately and then every **60 s**. The unread count is the number of items with `new == true` **in that single first page**. The poll is skipped silently when no modhash is held (the window during an account switch). On logout the count resets to 0 and the timer is torn down. There is **no push registration**.

#### Users

| # | Method | URL | Auth | Notes |
|---|---|---|---|---|
| U1 | GET | `{userURL}/about.json?raw_json=1` | cookie | `{userURL}` is `/user/{name}` or the special `/user/me` |
| U2 | GET | `{userContentPath}.json?raw_json=1&{limit,after}&sr_detail=true` | cookie | Content path ∈ `/user/{n}`, `/user/{n}/submitted`, `/user/{n}/comments`, `/user/{n}/upvoted`, `/user/{n}/downvoted`, `/user/{n}/hidden`, `/user/{n}/saved?type=links`, `/user/{n}/saved?type=comments`. The last five are offered only for the logged-in user. Children: `t3` → post, `t1` → comment |
| U3 | POST | `/api/block_user.json?account_id=t2_{userID}` | **yes** | Parameters in the query string, empty body |

**Bad-user mapping** for U1/U2 bodies: `error == 403` **or** `data.is_suspended` → `RedditError.userBanned` (unless the caller passed `allowSuspended`); `error == 404` → `RedditError.userNotFound`. `allowSuspended: true` is passed when reading the *own* account during login (so a suspended account can still sign in) and when loading a profile header.

#### Multireddits

| # | Method | URL | Auth | Body | Notes |
|---|---|---|---|---|---|
| M1 | GET | `/api/multi/mine?expand_srs=true&raw_json=1` | **yes** | — | Array of `{data: …}` LabeledMulti objects; also primes the in-memory definition cache |
| M2 | GET | `/api/multi/{user/<u>/m/<m>}` → fallback `/api/multi/{path}.json` → fallback `https://old.reddit.com/api/multi/{path}` | cookie | — | Tried strictly in that order; the first source yielding a real `data.subreddits` array wins. A `{error: 403}` envelope counts as failure. All three failing → `RedditError.multiredditUnavailable` |
| M3 | — | *(derived)* `https://www.reddit.com/r/{sub1+sub2+…}{/sort}?t={t}` | — | — | The **merged feed URL**. Multireddit feeds are read through this, not through the multireddit's own listing, because `/user/<u>/m/<m>.json` is unreliable for a keyless client |
| M4 | PUT | `/api/multi/{user/<u>/m/<m>}/r/{sub}` | **yes** | `model` = the JSON string `{"name":"<sub>"}`, form-encoded as a single field | |
| M5 | DELETE | `/api/multi/{user/<u>/m/<m>}/r/{sub}` | **yes** | — | Response read as text |

**Multireddit feed fallback chain:**
1. Build M3 from M2's definition. If the definition says the multi has **zero** subreddits, return an empty page immediately with **no request** — this is a legitimately-empty multi, not an error.
2. Try the merged listing (P2). On banned/private subreddit errors, rethrow immediately; do not retry.
3. On any other failure (network, HTML error page, non-listing body), fall through to the multireddit's own listing `/user/<u>/m/<m>.json?…`.
4. Both failing → `multiredditUnavailable`.
5. If M2 itself already threw `multiredditUnavailable`, skip straight to step 3.

**Definition cache:** keyed on the lowercased `user/<u>/m/<multi>` path, in-memory only, never persisted. Successes (including a legitimately empty multi) are cached; failures never are. Invalidated on M4/M5.

#### Interstitials

| # | Method | URL | Auth | Body |
|---|---|---|---|---|
| X1 | POST | `https://old.reddit.com/quarantine` | **yes** | `sr_name=<sub>`, `accept=yes` |
| X2 | POST | `https://old.reddit.com/gated` | **yes** | `sr_name=<sub>`, `accept=yes` |

Triggered when any listing or post-detail body contains `quarantine_message` or `interstitial_warning_message`: show an alert titled "Warning" with Reddit's message verbatim and Cancel / Proceed. Cancel → the feed returns empty and no further request is made. Proceed → X1 when the body carried `quarantine_message`, X2 otherwise, then **re-issue the original request exactly once**. The response is read as text.

#### Reporting

**There is no report API call.** "Report" opens an in-app `WebView` at `https://www.reddit.com/report` with shared cookies. It is not wired to the specific item; Reddit's own flow handles selection.

### 5.3 Login

The login flow is a real Reddit web login inside `WebPage` + `WebView` (SwiftUI-native WebKit, iOS 26+). `APPNAME` never sees a password.

| Aspect | Contract |
|---|---|
| Initial URL | `https://www.reddit.com/login?dest=https://www.reddit.com/` |
| Cookie store | The **same** persistent `WKWebsiteDataStore` the app's `URLSession` shares cookies with, so a successful login lands the cookie in the jar |
| Before showing | The current session is **temporarily logged out**: cookies cleared and the in-memory modhash dropped, so the login page is not already authenticated as the active account |
| Success detector 1 | A navigation begins for a URL that matches **none** of this four-entry allow-list: `reddit.com/login`, `redditinc.com/policies/user-agreement`, `redditinc.com/policies/privacy-policy`, `reddit.com/policies/privacy-policy`. Navigating anywhere else means the login completed |
| Success detector 2 (backup) | A **500 ms poll** checking whether a `reddit_session` cookie exists for `https://www.reddit.com`. Required because the navigation event does not fire for all users (Reddit A/B variance) |
| Guard | A single latch so the two detectors cannot both run the completion path |
| On completion | Dismiss, then run the login procedure (§5.5). On failure, alert "Login failed / Something went wrong" |
| On cancel | Dismiss and **restore** the previous account's cookies and modhash |
| Cosmetic JS | The original injected CSS to hide parts of Reddit's login chrome. `APPNAME` injects **nothing**. Injected cosmetics break on every Reddit redesign and are a maintenance tax for a page shown a handful of times per install. Recorded as `login-css-injection` in `08` |

With `WebPage`, the allow-list check lives in a `NavigationDeciding` policy object, and the cookie poll reads `configuration.websiteDataStore.httpCookieStore`. Both are testable against a stubbed navigation sequence.

### 5.4 Cookies and session storage

| Item | Contract |
|---|---|
| Cookie of record | `reddit_session`, domain `.reddit.com`, path `/` |
| Between launches | Keychain, service `com.OWNER.appname.session`, account `<username>`, value = JSON of the cookie's properties (§7.4) |
| Restore on switch | Write the stored cookie back into both `HTTPCookieStorage` and the `WKWebsiteDataStore` |
| **Expiry rewrite** | Reddit's `reddit_session` cookie has **no expiry**, so iOS treats it as a session cookie and drops it at launch. After **every** API response, if a `reddit_session` cookie exists with no `expiresDate`, rewrite it with `expiresDate = now + 10_000 days`. This is the single reason sessions survive app restarts |
| Logout | A cookie library bug (in the original's RN stack) re-synced WebKit cookies back into the HTTP jar on a full clear, resurrecting the session. The defensive order is preserved because the same class of bug exists between `HTTPCookieStorage` and `WKHTTPCookieStore`: **first** write a stale `reddit_session` (empty value, `expiresDate = .distantPast`) into *both* stores, **then** clear both |
| Other cookies | Never read, written or inspected by name; everything else Reddit sets rides along |

### 5.5 Login procedure

Given an optional username (present when switching to a stored account, absent right after a web login):

1. If a username was given, restore that account's cookie into the jar.
2. `GET /user/me/about.json?raw_json=1` with `allowSuspended: true`.
3. If a username was given and the returned `name` differs → throw `sessionOutOfSync`.
4. If the response has no `modhash` → throw `missingModhash`.
5. Store the modhash in the `SessionStore` actor (in-memory only).
6. Persist `currentUser = <username>`.
7. Publish the current user to the app and to the crash reporter's user context.
8. Save the live session cookie under this username in the Keychain.
9. Run the account-settings normalisation (§5.7) if its throttle allows.
10. Append the username to the stored account list when not already present.

**Any throw** anywhere in that chain produces the alert "Login Session Expired / You can log in again by pressing the + button in the top right corner of the Account tab.", a full logout, and a `false` return.

### 5.6 Modhash lifecycle

| Question | Answer |
|---|---|
| Source | `data.modhash` of `/user/me/about.json` |
| Storage | In-memory in the `SessionStore` actor. **Never persisted** |
| Transmission | The `X-Modhash` header on every authenticated request. Never a form field or query parameter |
| Refresh | Only by re-running the login procedure — at launch for the stored `currentUser`, or on an explicit account switch. There is no periodic refresh and no on-401 refresh |
| When missing | The request is never sent; the call throws `notAuthenticated` |

### 5.7 Account-settings normalisation — **dropped**

The original silently fetches `https://old.reddit.com/prefs`, parses the `#pref-form` HTML, and POSTs the entire preference set back to `https://old.reddit.com/post/options` with `media`, `over_18` and `search_include_over_18` forced to `"on"`, throttled to once per 30 days (with the timestamp written *before* the request, so a failure burns the window).

**Decision: `APPNAME` does not do this.** Recorded as `prefs-force-over18-on-login` in `08`. Reasons:

1. It mutates a user's Reddit account preferences without asking, with no UI and no disclosure. That is hard to defend on its own terms and harder in App Review.
2. It is a screen-scrape of an HTML form, which breaks whenever Reddit touches that page.
3. The stated purpose — ensuring `APPNAME`'s own NSFW blur settings are the sole gatekeeper — is achievable honestly.

**Replacement.** On first login, if `/user/me/about.json` or a first listing indicates NSFW content is being filtered server-side, show a **one-time, dismissible banner**: "Reddit is hiding mature content for this account. You can change that in Reddit's settings." with a button that opens `https://www.reddit.com/settings/account` in the in-app browser. No silent writes, no scraping. If the product owner rejects this, §5.7's original behavior is fully specified above and can be restored behind a `normalizeAccountSettings` setting defaulting to off.

### 5.8 Multiple accounts

| Storage | Key | Format |
|---|---|---|
| Account list | `UserDefaults` `accountUsernames` | JSON array of usernames, insertion-ordered |
| Current account | `UserDefaults` `currentUsername` | plain username |
| Per-account session | **Keychain** `com.OWNER.appname.session` / `<username>` | JSON of the `reddit_session` cookie |
| Per-account favorites | `UserDefaults` `favoriteSubreddits.<userID>` | JSON array of subreddit names — keyed by the Reddit **user id**, not the username |

- **Switching** = restore that username's cookie → re-run the login procedure. There is no token swap; the identity is the cookie plus a freshly-fetched modhash.
- **Logout** = clear cookies, remove `currentUsername`, drop the modhash, clear the crash reporter's user. The account list and the per-account Keychain items are untouched, so the account can be switched back into.
- **Remove account** = log out first when it is the current one; delete its Keychain item; rewrite the account list.
- **Anonymous** = a synthetic "Logged Out" row in the account list; selecting it logs out. Every non-auth GET works logged out; an authenticated action shows "You need to log in first!".
- **Startup** = read the account list; if non-empty and `currentUsername` is set, run the login procedure for it; then flip `loginInitialized`, which is what the splash waits on.

### 5.9 Expired sessions

There is no status-code-driven auth handling. The observable failure modes are:

| Situation | Behavior |
|---|---|
| Cookie expired/revoked, at launch or on switch | `/user/me/about.json` returns no modhash (or a 403 envelope) → login procedure throws → "Login Session Expired" → full logout |
| Session expires mid-session | Authenticated calls keep sending a stale modhash; Reddit rejects them; the body parses as a normal response, so most writes silently no-op (`success` absent → `false`). Feed reads degrade to logged-out content. Nothing prompts a re-login until the next launch or switch |
| A listing returns a 403 envelope | Not a listing → `listingMalformed` → "Something went wrong loading this. Pull down to try again." |
| `/user/me` 403 with `allowSuspended` | Accepted; a suspended account can still sign in |

`APPNAME` adds one improvement: a write that returns `success: false` **three times consecutively** while a user is logged in triggers a single re-validation of the session (one `/user/me/about.json`), and if that fails, the "Login Session Expired" path. Recorded as `stale-modhash-recovery` in `08`.

---

## 6. Pagination, filtering, refresh

### 6.1 Cursors

| Surface | Cursor | Notes |
|---|---|---|
| Feeds, user content, inbox, search | **The last item's own fullname** (`Post.fullname`, `Subreddit.fullname` = `t5_…`, `User.id` bare) — *not* `data.after` from the listing envelope | Sent as `&after=`. On page 1 it is the **empty string** for feeds (always present) and omitted entirely elsewhere |
| Depaginated reads (subreddits/mine) | `json.data.after` from the envelope | Recursed until null |
| Comments | none — `more` stubs with explicit child ids | |
| Post detail | none | |

This deliberate divergence (item fullname rather than envelope `after`) is preserved. They usually agree; they diverge for listings that filter server-side. Recorded as `pagination-cursor` in `08`.

**`unfilteredCursor`** tracks the cursor from the *unfiltered* response, so client-side filtering never causes a page to be skipped.

### 6.2 The list state machine

| Behavior | Contract |
|---|---|
| Deduplication | Drop an incoming item when an existing item has the same `id` **and** the same kind. Applied on load-more; **not** applied on refresh |
| Filter retries | On load-more, up to **5** attempts. Each attempt fetches with the next limit from the ramp and applies `[dedupe] + filterRules`. Stop at the first attempt yielding ≥ 1 surviving item |
| Limit ramp | Feeds `10, 20, 40, 70, 100`. Gallery mode `10, 30, 50` with **3** retries. Subreddit search, user content, inbox and search do not ramp (they send no `limit`, so P1's default of 10 applies where relevant) |
| Empty response | Any attempt returning **0 raw** items sets `fullyLoaded` and stops. UI: "Wow. You've reached the bottom." (shown only when at least one item is already loaded) |
| All filtered out | Exhausting retries with nothing surviving sets `hitFilterLimit`, and **all further load-more calls are refused** until a refresh. UI: "The filter limit has been reached. Your filters may be too strict to show anything." |
| Refresh | Reset the cursor, optionally clear first, re-run the same retry loop applying only the filter rules (no dedupe, since the data was reset), and replace the array |
| Refresh triggers | Pull-to-refresh, and any change to the refresh dependencies — typically `[searchText, sort, sortTime]` for feeds and `[sort, sortTime]` for gallery and user content. A sort or search change clears the list **synchronously** before refetching. The first appearance does a load-more, not a refresh |
| Load-more trigger | The last **2 screen-heights** of content becoming visible. Concurrent calls are guarded by an in-flight flag |
| Item mutation | Replace in place by (id, kind); delete by (id, kind); a no-argument delete clears everything |

### 6.3 Client-side filter rules (no network)

Applied in this order on every loaded batch:

1. **Hidden posts** — always applied, unconditionally.
2. **Seen posts** — only when the hide-seen status resolves true for the current page (per-URL override, else the global `filterSeenPosts`).
3. **Text filter** — always in the chain; an empty filter list trivially passes everything, so there is no separate on/off switch.
4. **Subreddit filter** — only on **combined** feeds (home, `r/all`, `r/popular`, any multireddit). Never when browsing one subreddit directly.
5. **Non-media** — gallery mode only, applied **first** in that mode.

**Text filter matching** is whole-word, case-insensitive, over a space-joined haystack. For posts the haystack is: title, author, self-text, every poll option's text, the OpenGraph title and the OpenGraph description. For comments: body and author. A match anywhere fails the whole item. Multi-word phrases match as literal substrings under the same word-boundary rule at each end. The filter list is parsed by splitting on `", "`, `"\n"` or `","`, lowercasing, trimming, and dropping empties.

**Subreddit filter entries** map a subreddit name to either `true` (forever) or an expiry timestamp. An expired timestamp reads as not-filtered and is **not** actively cleaned up.

### 6.4 In-memory caches

| Cache | Key | Lifetime | Invalidation |
|---|---|---|---|
| Multireddit subreddit names | lowercased `user/<u>/m/<multi>` | process | Cleared on M4/M5; primed by M1; failures never cached |
| Redgifs resolved URLs | redgifs video id | process — **deliberately not persisted** (signed URLs expire in hours) | Busted per-id when the player errors on that source |
| OpenGraph | post id | process | Never |
| Redgifs auth token | `UserDefaults` `redgifsToken` | persisted | Refreshed on any non-OK Redgifs response |

There is **no persistent response cache.** Feeds are refetched from scratch on every cold launch.

---

## 7. Persistence

### 7.1 Database

SQLite at `Application Support/APPNAME/app.sqlite`, opened as a GRDB `DatabasePool` with `PRAGMA journal_mode = WAL`. Migrations are registered with `DatabaseMigrator`; v1 creates the final shape directly (there is no legacy data to migrate through).

### 7.2 DDL

```sql
-- Migration: v1_initial

CREATE TABLE seen_posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX seen_posts_post_id_idx    ON seen_posts(post_id);
CREATE        INDEX seen_posts_created_at_idx ON seen_posts(created_at);
CREATE        INDEX seen_posts_updated_at_idx ON seen_posts(updated_at);

CREATE TABLE hidden_posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  subreddit   TEXT    NOT NULL,
  expires_at  INTEGER NOT NULL,          -- epoch milliseconds
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX hidden_posts_post_id_idx    ON hidden_posts(post_id);
CREATE        INDEX hidden_posts_expires_at_idx ON hidden_posts(expires_at);
CREATE        INDEX hidden_posts_created_at_idx ON hidden_posts(created_at);
CREATE        INDEX hidden_posts_updated_at_idx ON hidden_posts(updated_at);

CREATE TABLE drafts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT    NOT NULL,
  text        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX drafts_key_idx        ON drafts(key);
CREATE        INDEX drafts_created_at_idx ON drafts(created_at);
CREATE        INDEX drafts_updated_at_idx ON drafts(updated_at);

CREATE TABLE custom_themes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  data        TEXT    NOT NULL,          -- JSON of CustomTheme
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX custom_themes_name_idx       ON custom_themes(name);
CREATE        INDEX custom_themes_created_at_idx ON custom_themes(created_at);
CREATE        INDEX custom_themes_updated_at_idx ON custom_themes(updated_at);

CREATE TABLE counter_stats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT    NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX counter_stats_key_idx        ON counter_stats(key);
CREATE        INDEX counter_stats_created_at_idx ON counter_stats(created_at);
CREATE        INDEX counter_stats_updated_at_idx ON counter_stats(updated_at);

CREATE TABLE subreddit_visits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subreddit   TEXT    NOT NULL,
  count       INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX subreddit_visits_subreddit_idx  ON subreddit_visits(subreddit);
CREATE        INDEX subreddit_visits_created_at_idx ON subreddit_visits(created_at);
CREATE        INDEX subreddit_visits_updated_at_idx ON subreddit_visits(updated_at);
```

`updated_at` is refreshed on every write by the store (GRDB has no `$onUpdate` equivalent; the record type's `willUpdate` sets it).

### 7.3 Semantics per table

| Table | Write semantics | Read semantics | Pruning |
|---|---|---|---|
| `seen_posts` | `INSERT … ON CONFLICT(post_id) DO NOTHING` — idempotent, and **`created_at` is not refreshed** on a repeat mark. Unmark is a hard `DELETE`. The DB write is **awaited before** the change notification is published | Existence is the flag; there is no boolean column. Batch check by `post_id IN (…)` | When the row count exceeds **5 000**, delete every row with an `id` smaller than the row `(count − 5000)` positions from the oldest. `id`-based deletion avoids `created_at` ties |
| `hidden_posts` | `INSERT … ON CONFLICT(post_id) DO UPDATE SET title, subreddit, expires_at`; `expires_at = now + 30 days`, fixed and not user-configurable. Unhide deletes the row outright | A row with `expires_at ≤ now` reads as **not hidden**, even before the sweep deletes it. `getHiddenPosts()` returns non-expired rows ordered by `created_at` descending. `title`/`subreddit` are denormalised so the management screen needs no API call | Delete all rows with `expires_at < now` |
| `drafts` | `INSERT … ON CONFLICT(key) DO UPDATE SET text`. Debounced at 400 ms and flushed on disappear under a cancellation shield. **Cleared only on a successful submit**; a failed submit deliberately keeps the draft | One draft per opaque key. Key formats in §7.5 | Cap **100** rows, same oldest-first deletion pattern |
| `custom_themes` | Upsert keyed on `name`. Renaming creates a new row unless the caller deletes the old name | A row whose JSON fails to decode is skipped and logged, never fatal | **Never pruned** |
| `counter_stats` | `INSERT … ON CONFLICT(key) DO UPDATE SET count = count + :delta` — atomic in SQL | `getStat` returns 0 for a missing row | **Never pruned** (bounded by the enum) |
| `subreddit_visits` | `INSERT … ON CONFLICT(subreddit) DO UPDATE SET count = count + 1`; the column default of 1 handles first insert | Top-N by count descending | **Never pruned** (`unpruned-tables` in `08`) |

**Counter keys** (`counter_stats.key`): `app_launches`, `app_foregrounds`, `scroll_distance`, `posts_viewed`, `post_upvotes`, `post_downvotes`, `posts_created`, `comment_upvotes`, `comment_downvotes`, `comments_created`.

Increment sites: `app_launches` +1 at cold start; `app_foregrounds` +1 at cold start **and** on every transition to active (so foregrounds ≥ launches always); `scroll_distance` accumulated in points, buffered during a gesture and flushed on drag end, momentum end or disappear — never mid-gesture; `posts_viewed` +1 when a post **detail** opens; the four vote counters +1 on a non-neutral vote (retracting a vote decrements nothing); `posts_created` / `comments_created` +1 on successful submit. `subreddit_visits` +1 per mount of a single subreddit's feed (not home, `r/all`, `r/popular` or a multireddit).

### 7.4 Keychain items

| Service | Account | Value | Accessibility |
|---|---|---|---|
| `com.OWNER.appname.session` | `<reddit username>` | JSON of the `reddit_session` cookie: `{name, value, domain, path, expiresDate, isSecure, isHTTPOnly}` — produced from `HTTPCookie.properties` and consumed by `HTTPCookie(properties:)` | `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` |
| `com.OWNER.appname.entitlement` | `cached` | Last-known-good subscription status with an expiry, so an offline launch does not lock a paying user out (`05` owns the payload) | Same |

No password is ever stored, because no password is ever seen.

### 7.5 Draft keys

One draft per opaque key. Formats, chosen so drafts never collide across accounts or contexts:

| Context | Key |
|---|---|
| Reply to a post or comment | `comment.<parentFullname>` |
| New post, title | `post.title.<subreddit-lowercased>` |
| New post, body | `post.body.<subreddit-lowercased>` |
| New message, subject | `message.subject.<recipient-lowercased>` |
| New message, body | `message.body.<recipient-lowercased>` |
| Reply to a message | `messageReply.<authorOfPreviousMessage-lowercased>` |

Edit flows (`EditPost`, `EditComment`) **do not use drafts at all** — parity with the original; unsaved edits are lost on cancel with no confirmation. Recorded as `edit-draft` in `08` (a candidate improvement, not parity).

One post draft exists per subreddit, so starting a second draft in the same subreddit overwrites the first. Switching the post-type pill does **not** clear the shared body field — a latent state-mixing quirk in the original that we **fix**: the body field is cleared when switching between `link` and the others, since a URL sitting in a text body is never intended. Recorded as `newpost-type-switch-keeps-text` in `08`.

### 7.6 File cache layout and limits

| Cache | Location | Ceiling | Eviction | Clearing |
|---|---|---|---|---|
| Image disk cache | `Caches/com.OWNER.appname.images/` | **512 MB** | Pipeline LRU | Immediate, from Settings, with a live size readout recomputed whenever the settings screen appears |
| Image memory cache | in-process | **256 MB** cost | LRU + purge on memory warning | Automatic on `didReceiveMemoryWarning` |
| Video cache | `Caches/com.OWNER.appname.video/` | **1 GB** | LRU | **Deferred to next launch** behind the `videoCacheClearRequested` flag, because the cache cannot be cleared while any player exists. The alert says so |
| Video cache exclusions | — | — | — | A source is **not cached** when its path ends `.m3u8` (playlists are not single-file cacheable) or `.gif` (Reddit serves mp4 bytes behind a `.gif` path; caching under that extension makes the decoder fail and the tile stays black forever) |
| Media scratch | `Caches/` | one file at a time | — | Deleted in a shielded `defer` after every share/save, win or lose. Named from the URL's last path component so the extension survives; **no transcoding, no HEIC conversion** |
| Guide search index | `Application Support/APPNAME/guide.sqlite` (FTS5) | small | — | Rebuilt when the bundled corpus version changes |

### 7.7 Maintenance job

Runs once per cold launch, after the first frame, in this fixed order:

1. Trim `seen_posts` to the newest 5 000 rows.
2. Delete `hidden_posts` rows past expiry.
3. Trim `drafts` to the newest 100 rows.

`custom_themes`, `counter_stats` and `subreddit_visits` are untouched.

---

## 8. Settings

Backed by `UserDefaults` through a typed `SettingsStore`. Every read is `stored ?? default`; there is **no settings migration mechanism**, matching the original. Enum-valued settings are `RawRepresentable`; an unrecognised stored value falls back to the default.

`APPNAME` key names are namespaced camelCase. The "Legacy key" column names the original's key so a parity audit is mechanical; it is **not** an import path (there is no data to import).

### 8.1 Consolidated key table

| `APPNAME` key | Type | Default | Legacy key | Effect |
|---|---|---|---|---|
| **Theme** | | | | |
| `theme.light` | String (theme key) | the default theme | `theme` | Theme for light mode, or the only theme when the dark-mode split is off |
| `theme.dark` | String | the default theme | `darkTheme` | Theme for dark mode; used only when the split is on |
| `theme.useSeparateDark` | Bool | `false` | `useDifferentDarkTheme` | Enables the light/dark split |
| **Gestures** | | | | |
| `gestures.swipeAnywhereToNavigate` | Bool | `false` | `swipeAnywhereToNavigate` | Disables all rightward swipe actions app-wide so the system back gesture wins |
| `gestures.postSwipe` | `SwipeAssignment` (4 slots) | `{right: upvote, farRight: downvote, left: markRead, farLeft: bookmark}` | `postSwipeOptions` | Post swipe mapping. Assigning an action already in use **swaps** the two slots; `disabled` never swaps |
| `gestures.commentSwipe` | `SwipeAssignment` | `{right: upvote, farRight: downvote, left: reply, farLeft: bookmark}` | `commentSwipeOptions` | Comment swipe mapping, same swap rule, independent of posts |
| **Filters** | | | | |
| `filters.hideSeenPosts` | Bool | `false` | `filterSeenPosts` | Global hide-seen |
| `filters.hideSeenOverrides` | `[String: Bool]` | `[:]` | `hideSeenURLs` | Per-base-page override map. A key is **deleted** when its value would equal the global default, keeping the map to genuine exceptions |
| `filters.subreddits` | `[String: SubredditFilter]` | `[:]` | `filteredSubreddits` | Subreddit name → `.forever` or `.until(Date)` |
| `filters.markSeenOnScroll` | Bool | `false` | `autoMarkAsSeen` | Mark posts seen when they scroll off the top. Live in `APPNAME` (no restart) |
| `filters.text` | String | `""` | `filterText` | Comma/newline-separated whole-word filter list |
| **Sorting** | | | | |
| `sorting.defaultPost` | `PostSort` | `.default` | `defaultPostSort` | `default` means "apply nothing" |
| `sorting.defaultPostTop` | `TopWindow` | `.all` | `defaultPostSortTop` | Only meaningful when the default post sort is `top` |
| `sorting.rememberPerSubreddit` | Bool | `false` | `rememberPostSubredditSort` | |
| `sorting.defaultComment` | `CommentSort` | `.default` | `defaultCommentSort` | |
| `sorting.rememberCommentPerSubreddit` | Bool | `false` | `rememberCommentSubredditSort` | |
| `sorting.applyToHome` | Bool | `false` | `sortHomePage` | Whether the default/remembered sort applies to the home feed at all |
| `sorting.post.<sub-lowercased>` | `PostSort` | — | `PostSubredditSort-<sub>` | Dynamic, per subreddit |
| `sorting.postTop.<sub-lowercased>` | `TopWindow` | — | `PostSubredditSortTop-<sub>` | Dynamic |
| `sorting.comment.<sub-lowercased>` | `CommentSort` | — | `CommentSubredditSort-<sub>` | Dynamic |
| **Post appearance** | | | | |
| `post.compactMode` | Bool | `false` (iPhone) | `postCompactMode` | Compact vs normal card |
| `post.thumbnailsOnRight` | Bool | `false` | `showThumbnailsOnRightSide` | Compact thumbnail side; row shown only when compact is on |
| `post.subredditAtTop` | Bool | `false` | `subredditAtTop` | Subreddit row above the title vs inline in the footer |
| `post.showSubredditIcon` | Bool | `true` | `showSubredditIcon` | Also suppressed entirely in low-data mode |
| `post.titleMaxLines` | Int (1…10) | `2` | `postTitleLength` | |
| `post.textMaxLines` | Int (0…10) | `3` | `postTextLength` | `0` hides the body preview entirely |
| `post.linkDescriptionMaxLines` | Int (0…30) | `10` | `linkDescriptionLength` | `0` hides the OG description |
| `post.showFlair` | Bool | `true` | `showPostFlair` | |
| `post.blurSpoilers` | Bool | `true` | `blurSpoilers` | |
| `post.blurNSFW` | Bool | `true` | `blurNSFW` | NSFW wins the label when both apply |
| `post.tapToCollapse` | Bool | `true` | `tapToCollapsePost` | Detail screen: tapping the header collapses media only |
| **Video / media** | | | | |
| `video.autoplay` | Bool | `true` | `autoPlayVideos` | Master switch; off → poster + play glyph everywhere, no player mounted |
| `video.feedAudio` | Bool | `false` | `feedVideoAudio` | Focused feed video plays with sound; interrupts background audio and plays through the silent switch |
| `video.tappedAudio` | Bool | mirrors `video.feedAudio` until explicitly set once, then independent | `tappedVideoAudio` | Audio for videos opened into the fullscreen viewer |
| `media.liveText` | Bool | `false` | `liveTextInteraction` | Live Text on images. **Actually implemented** in `APPNAME` |
| `media.videoCacheClearRequested` | Bool | `false` | `videoCacheClearRequested` | Internal deferred-clear flag, no UI |
| **Comment appearance** | | | | |
| `comment.voteIndicator` | Bool | `false` | `voteIndicator` | Coloured right-edge border on voted comments |
| `comment.collapseAutoModerator` | Bool | `true` | `collapseAutoModerator` | Top-level AutoModerator comments start collapsed |
| `comment.showFlair` | Bool | `true` | `commentFlairs` | |
| `comment.tapToCollapse` | Bool | `true` | `tapToCollapseComment` | |
| `comment.collapseChildrenOnly` | Bool | `false` | `collapseChildrenOnly` | Collapsing shows an "N more replies" stub instead of hiding the subtree entirely |
| **Tabs** | | | | |
| `tabs.showUsername` | Bool | `true` | `showUsername` | Account tab label shows the username |
| `tabs.hideOnScroll` | Bool | `false` | `hideTabsOnScroll` | Maps to `tabBarMinimizeBehavior(.onScrollDown)` |
| **Startup** | | | | |
| `startup.tab` | `TabID` | `.posts` | `initialTab` | |
| `startup.url` | String | `""` | `startupURL` | Overrides the initial tab when it parses as a valid Reddit link; an invalid value is stored verbatim and ignored, with an inline warning in Settings. **Default changed from the original's `https://www.reddit.com/` to empty**, because a non-empty default silently defeats the initial-tab setting. Recorded as `startup-url-default` in `08` |
| **Links** | | | | |
| `links.externalBrowser` | `BrowserChoice` | `.inApp` | `externalLinkBrowser` | `inApp` / `system` / `chrome` / `brave` / `firefox` / `edge` / `opera` |
| `links.readerMode` | Bool | `false` | `openInReaderMode` | Shown only when the browser choice is `inApp` |
| `links.readClipboard` | Bool | `false` | `readClipboard` | Prompt to open a Reddit URL found on the pasteboard. **Note:** the original's two sources disagree on this default (`false` in the settings screen, `true` in a constant); `false` is correct and is what the UI ships. Recorded as `clipboard-read-default` in `08` |
| **Data use** | | | | |
| `data.wifi` | `DataMode` | `.normal` | `dataMode.wifi` | `normal` / `lowData` |
| `data.cellular` | `DataMode` | `.normal` | `dataMode.cellular` | The active mode is chosen live from the current path type (`NWPathMonitor`) and re-evaluated on every change, with no reload |
| **Privacy** | | | | |
| `privacy.errorReporting` | Bool | `true` | `allowErrorReporting` | Opt-out crash reporting. Restart required |
| **Misc / internal** | | | | |
| `ui.scrollToNextButtonPosition` | `ButtonAnchor` | `.bottomRight` | `scrollToNextButtonPosition` | One of the ten snap positions |
| `flags.galleryModeOffered` | Bool | `false` | `has_already_offered_gallery_mode` | One-time gallery-mode suggestion. Set **only on accept**, so declining can re-prompt on a different qualifying feed |
| `flags.quickSearchTip` | Bool | `false` | `quickSearchGuideAlert` | One-time alert |
| `flags.quickAccountSwapTip` | Bool | `false` | `quickAccountSwapGuideAlert` | One-time alert |
| `flags.lastSeenUpdate` | String | — | `lastSeenUpdate` | What's-new gate |
| `flags.reviewRequested` | Bool | `false` | `storeReviewRequested` | Review prompt gate; set on **every** exit path |
| `accountUsernames` | `[String]` | `[]` | `usernames` | Ordered account list |
| `currentUsername` | String? | `nil` | `currentUser` | Absence means logged out |
| `favoriteSubreddits.<userID>` | `[String]` | `[]` | `favoriteSubreddits:<userId>` | Per-account, local only, never synced |
| `redgifsToken` | String? | `nil` | `redgifsToken` | Cached bearer token |
| **Removed** | | | | |
| — | — | — | `showPostSummary`, `showCommentSummary` | Dead in the original (no consumer). Not carried over |
| — | — | — | `splitViewEnabled` | iPad only; out of scope for v1 |
| — | — | — | `useHydraServer`, `customHydraServerUrl` | No backend exists (§9) |
| — | — | — | `lastFixedAccountSettings` | The silent prefs write is dropped (§5.7) |
| — | — | — | `lastAskedToSubscribeToHydraClient-<userId>` | Product decision for `05` (`subscribe-nag-removed`) |

### 8.2 Feature matrix storage

`05` owns the free/paid split. Architecturally it lives in a bundled `FeatureMatrix.json` resource with a code default, plus an optional `UserDefaults` override key `entitlements.matrixOverride` used only in Debug/TestFlight for testing the paywall. Feature code never reads either.

---

## 9. Third-party services

### 9.1 Redgifs

| # | Method | URL | Auth | Headers | Consumed |
|---|---|---|---|---|---|
| G1 | GET | `https://api.redgifs.com/v2/auth/temporary` | none | `User-Agent: APPNAME` | `token`, stored in `redgifsToken` |
| G2 | GET | `https://api.redgifs.com/v2/gifs/{videoID}` | bearer | `Authorization: Bearer {token}`, `User-Agent: APPNAME` | `gif.urls.hd ?? gif.urls.sd` |

**Why resolution is lazy.** Resolving eagerly during page decoding fires a burst of parallel calls per page; after roughly 20–30 cumulative resolutions Redgifs rate-limits by IP, and a baked-in unplayable watch URL is permanent. Instead, decoding only flags the source (`.needsResolution`), and resolution happens on **player mount**, roughly 5× fewer calls spread over scroll time.

**Video id extraction** from any redgifs link shape: strip query and fragment, strip the scheme, drop the host, take the last non-empty path segment, then strip a trailing 2–4 character extension. This covers `/watch/<id>`, `/ifr/<id>`, `/i/<id>`, a bare `/<id>`, and `media.redgifs.com/<id>.mp4`. A link with no path segment yields an empty id, treated as unresolvable — never request `/v2/gifs/`.

**Concurrency and backoff:**

| Control | Value |
|---|---|
| Max concurrent resolutions | **2**, process-wide |
| Queue discipline | **LIFO** — the newest waiter runs first, so the currently visible post jumps ahead of the scrolled-past backlog |
| Cancellation | Each request carries an abort signal tied to the view's lifetime. A waiter aborted while queued is removed and **never consumes a slot**; an in-flight request bails between retries |
| Retry attempts | **3** |
| Cooldown after a normal failure | `1000 ms × (attempt + 1)`, armed **globally** (pauses all resolutions) |
| Cooldown after HTTP **429** | **30 000 ms**, global, and the attempt is retried **without** refreshing the token |
| Token refresh | On any non-429 non-OK status and on any thrown error, before the next attempt |
| Cache re-check | After acquiring a slot, re-read the cache — another queued caller may have resolved the same id |
| Final failure | `RedgifsError.unresolved`; an abort throws `RedgifsError.aborted`, which is **not** an error state in the UI |

**Consumption.** A cache hit starts the player in `ready` with no loading flash. An abort leaves state untouched (the post simply went away). A manual retry bumps an attempt counter that re-runs resolution. A playback error on an already-resolved Redgifs source clears that id from the cache once per mount and retries — playback failure *is* the expiry signal, so there is no TTL.

### 9.2 Signed-URL handling

Some embedded videos fail only because of trailing tracking/cache-buster query parameters. On the **first** playback error, retry once with everything from `?` onward stripped — **except** for hosts that sign their URLs, where the query string *is* the signature and stripping it yields a 403. Signed hosts, matched as the exact host or any subdomain: `redd.it`, `redgifs.com`, `redgifs.net`. For those, no trim is attempted; their own recovery paths (watchdog, cache bust) handle it.

### 9.3 Video reload watchdog

A player is "stuck" when it has a resolved source and is on screen but has not reached ready-to-play. Arm a reload after `2000 + attempts × 1000` ms, up to **3** attempts; a successful ready transition resets the counter. This exists because during a fast fling iOS has not yet freed enough decoders and a fresh player comes up black and never recovers. On fire, re-check that the player is still not ready and that the fullscreen viewer does not currently own it, then replace the source and play. A player released mid-timer is a silent no-op.

### 9.4 OpenGraph fetcher

| Aspect | Value |
|---|---|
| Method | `GET` the post's external link, unmodified |
| Timeout | **1 750 ms**, deliberately short so a slow site never slows a feed load |
| Binary abort | On receiving headers, abort immediately when `Content-Type` is `application/pdf`, `application/octet-stream`, `application/zip`, `application/x-zip-compressed`, or matches `^(image|video|audio)/`. Implemented with `URLSession`'s delegate-based `didReceiveResponse` returning `.cancel` |
| User-Agent | **None set** (the default `URLSession` UA) — some sites serve different markup to a Safari UA |
| Parsing | Streaming; every `<meta property="og:*">`'s `content` is collected |
| `.svg` rule | An `og:image` whose value contains `.svg` is dropped |
| Failure | Silent; `openGraph` stays `nil` |
| Concurrency | One request per eligible post, fired concurrently with the rest of the page's decoding. The original imposes **no cap**; `APPNAME` caps it at **6 concurrent** via a `TaskGroup` semaphore, because a 100-post page on a filter retry could otherwise open 100 sockets. Recorded as `og-concurrency-cap` in `08` |

### 9.5 Imgur, Gfycat

No API, no key. Imgur: `*.gifv` → `*.mp4`, nothing else; non-gifv Imgur links are ordinary external links and are **excluded** from OpenGraph fetching. Gfycat is a dead host; `gfycat.com/<path>` is rewritten to `https://web.archive.org/web/0if_/thumbs.{host}{path}-mobile.mp4` and played directly.

### 9.6 The original's backend — **not reproduced**

The original contacts its own server for exactly three things: a `/api/status` health check, an embedding endpoint used to vectorise a guide-search query, and a question-answering endpoint that returns markdown. Every one of these serves the **in-app documentation search only**; none touches Reddit content, and none is gated by anything.

**Decision: `APPNAME` ships no backend.** The guide is bundled Markdown; search is fully on-device (SQLite FTS5 with BM25 ranking, index built once at first launch and rebuilt when the bundled corpus version changes). There is no "ask a question" LLM answer. Consequences: the "self-hosted server" settings section, its two settings keys, its health-check endpoint and its restart-required messaging all disappear; guide search now works offline, which the original's never actually did (it needed the network for the query embedding even though the corpus was local). Recorded as `guide-included-or-not` and `self-hosted-server-row` in `08`.

### 9.7 Crash reporting

sentry-cocoa, DSN in an `.xcconfig` (not source), enabled iff not a Debug build **and** `privacy.errorReporting` is not explicitly false. App-hang tracking **off**. User context is the Reddit username on login, cleared on logout. Breadcrumbs include route pushes, network failures, and JSON decode failures with the first 512 bytes of the offending body. This is the app's **only** outbound telemetry.

### 9.8 Complete host inventory

| Host | Why |
|---|---|
| `www.reddit.com` | Essentially everything |
| `old.reddit.com` | Post submission, quarantine/gated acceptance, the third multireddit-definition fallback |
| `new.reddit.com` | The captcha-fallback submit page, in a `WebView` only |
| `redd.it`, `i.redd.it`, `v.redd.it`, `preview.redd.it` | Media and short links |
| the S3 host returned by `/api/image_upload_s3.json` | Direct multipart image upload |
| `api.redgifs.com` | Temporary token + per-gif resolution |
| `web.archive.org` | Gfycat substitutes |
| `imgur.com` / `i.imgur.com` | Media only, after `.gifv` → `.mp4`; no API |
| `*.ingest.sentry.io` | Crash reporting, opt-out |
| arbitrary external hosts | OpenGraph previews, media downloads for share/save, the in-app browser |

Removed relative to the original: the first-party API host, and `u.expo.dev`.

---

## 10. Error taxonomy

### 10.1 Detection

Classification runs on the parsed body first, in this order, and only then considers the status code.

**Listing responses:**

1. `quarantine_message` or `interstitial_warning_message` present → `.interstitial(message, kind)`.
2. `reason == "banned"` → `.subredditBanned(name)`.
3. `reason == "private"` → `.subredditPrivate(name)`.
4. `data.children` is not an array → `.listingMalformed`.

**User responses:** `error == 403` or `data.is_suspended` → `.userBanned`; `error == 404` → `.userNotFound`.

**Write responses:** `json.errors` non-empty → map per endpoint (§5.2 S1); `success == false` or absent → `.writeRejected`.

**Transport:** timeout → `.timedOut`; connection failure → `.offline` (distinguished via `NWPathMonitor`'s current path, which the original never did — recorded as `no-offline-detection` in `08`); JSON parse failure → `.decodingFailed` with a breadcrumb.

**Status codes (new):** 429 → `.rateLimited(retryAfter:)`; 500…599 → `.serverError(code)`. Both are surfaced as distinct user-facing states rather than being folded into the generic failure.

### 10.2 User-facing mapping

| Condition | What the user sees |
|---|---|
| Authenticated action with no session | Alert "You need to log in first!"; nothing is sent |
| Quarantined / gated subreddit | Alert "Warning" + Reddit's message verbatim, Cancel / Proceed. Cancel → empty feed. Proceed → accept POST, then one refetch |
| Banned subreddit | `🚫 r/{name} has been banned by Reddit Administrators for breaking Reddit rules` |
| Private subreddit | `🔑 r/{name} has been set to private by its subreddit moderators` |
| Multireddit unreadable | `🔑 Reddit wouldn't share this multireddit. It may be private, deleted, or only visible to the account that owns it.` |
| Nonexistent user | `🚫 {name} does not exist` |
| Banned / suspended user | `🚫 {name} has been banned` |
| Generic load failure | Footer: `Something went wrong loading this. Pull down to try again.` The spinner is **explicitly cleared** — leaving it up forever was a real bug in the original |
| Over-filtered feed | `The filter limit has been reached. Your filters may be too strict to show anything.` and further load-more refused |
| End of listing | `Wow. You've reached the bottom.` (only when at least one item is loaded) |
| **Offline** (new) | `You're offline. Check your connection and pull down to try again.` |
| **Rate limited** (new) | `Reddit is asking us to slow down. Try again in a moment.` |
| **Server error** (new) | `Reddit is having trouble right now. Pull down to try again.` |
| Submit: captcha | Alert offering to retry in a `WebView` at new.reddit's submit page; a self-post body is copied to the pasteboard first |
| Submit: Reddit-supplied error | That message shown verbatim |
| Submit: other | `Failed to submit post / Unknown error` |
| Image upload failure | `Failed to upload image / Please try again later.` |
| Session expired at launch or switch | `Login Session Expired` + instructions, then full logout |
| Login web flow failed | `Login failed / Something went wrong` |
| Media share/save failure | `Error / Failed to {share\|save} {image\|video}` and the preparing modal is dismissed |
| Redgifs unresolvable | The video tile shows `Couldn't load video. Tap to retry.` |
| Hard player error | `Couldn't load video.` — not tappable inline; the watchdog and cache-bust paths are the recovery. **In the fullscreen viewer this state becomes tappable-to-retry**, closing a gap in the original where the only recovery was closing and reopening. Recorded as `fullscreen-player-retry` in `08` |

### 10.3 Complete retry inventory

Every retry in the system, exhaustively: (a) the feed filter-retry loop, up to 5 escalating page fetches; (b) the multireddit merged-feed → own-feed fallback plus three definition sources; (c) the gated-subreddit accept-then-refetch, once; (d) the short-link `HEAD`-then-`GET`; (e) Redgifs' 3 attempts with backoff; (f) the video reload watchdog's 3 reloads; (g) the video query-param trim, once; **(h) new: the 429 backoff in §11.** There is no generic HTTP retry on Reddit calls, and adding one would change behavior in ways this document does not sanction.

---

## 11. Rate limiting and throttling

### 11.1 Current-state summary

| Mechanism | Scope | Value |
|---|---|---|
| Request timeout | all Reddit and Redgifs requests | 10 s |
| Request timeout | OpenGraph only | 1.75 s |
| Concurrent Redgifs resolutions | global | 2, LIFO, abortable |
| Redgifs cooldown after failure | global | 1 s × attempt |
| Redgifs cooldown after 429 | global | 30 s |
| Redgifs retry attempts | per video | 3 |
| Inbox poll | while logged in and foregrounded | 60 s |
| Comment `more` batch | per tap | 10 ids, fully parallel |
| Post-detail comment limit | per open | 75 |
| Feed page size | per fetch | 10, ramping 20/40/70/100 under filter starvation; gallery 10/30/50 |
| Subreddit list page size | per fetch | 100, depaginated to exhaustion |
| Load-more trigger distance | feeds | 2 screen-heights |
| OpenGraph concurrency | per page | **6** (new cap; the original has none) |
| Live `AVPlayer` instances | global | 12 LRU cap; 1–2 in practice under focused-only playback |

### 11.2 The minimal safe addition

The original detects **no** Reddit rate limiting at all: a 429 body fails to parse or is not a listing, and surfaces as a generic load failure. This is the one place where preserving the behavior exactly is worse than a small, carefully-bounded change.

**`APPNAME` adds, and nothing more:**

1. **429 recognition.** A 429 response classifies as `.rateLimited(retryAfter:)`, reading the `Retry-After` header when present (seconds or HTTP-date), defaulting to 5 s.
2. **A global cooldown gate** in `RedditClient`: while a cooldown is armed, new requests wait for it rather than firing. The gate is a single `Date`, identical in shape to the Redgifs one.
3. **Exactly one automatic retry** of the request that was rate-limited, after the cooldown. A second 429 surfaces to the user as `.rateLimited`.
4. **No change to any other status code's handling** and no retry for 5xx (those surface immediately as `.serverError`).

Why this is safe: it cannot increase request volume (it only ever delays), it does not alter any success path, and it converts a confusing generic error into an accurate one. Recorded as `no-429-handling` in `08`.

---

## 12. Sharing

### 12.1 Outbound URL formats

| Thing shared | URL | Notes |
|---|---|---|
| Post | `https://www.reddit.com{permalink}` | **Always** the Reddit discussion permalink, never the post's external link, even for link posts |
| Comment | `https://www.reddit.com{comment.permalink}` | `Comment.permalink` is relative; the host is prepended at share time |
| Comment in context | `https://www.reddit.com{comment.permalink}?context=10` | Used by the "view in context" affordance on inbox and user-content rows |
| Subreddit | `https://www.reddit.com/r/{name}` | |
| Multireddit | `https://www.reddit.com{multi.path}` | Keeps the trailing slash |
| User | `https://www.reddit.com/user/{name}` | |
| Current page | the canonical URL of the current route | The `…` menu's "Share" |

Shared links contain the link and nothing else — no tracking parameters, no account identity, no referrer.

### 12.2 Share sheet payloads

| Kind | Payload |
|---|---|
| A link | `ShareLink(item: URL)` — iOS renders the rich link preview |
| An image | The **downloaded file URL** in the scratch cache, so the system offers "Save Image" natively |
| A video | The downloaded file URL from `videoDownloadURL` (never an HLS playlist) |

Both media cases resolve a Redgifs source first when needed, surfacing `Couldn't load video / Redgifs is rate limiting requests. Please try again in a moment.` when resolution fails.

### 12.3 Inbound: the share extension

The extension's activation rule accepts **exactly one web URL** (`NSExtensionActivationSupportsWebURLWithMaxCount = 1`) and nothing else — no images, no multiple items, no text.

**Payload contract.** The extension writes a single JSON object into the App Group container at `group.com.OWNER.appname/inbox.json`:

```json
{ "version": 1, "receivedAt": 1758000000.0, "url": "https://www.reddit.com/r/pics/comments/abc/def/" }
```

It then opens `appname://openurl?url=<percent-encoded>` and completes. The host app drains the file (read, then delete) at launch and on every transition to active, so a share that arrives while the app is suspended is never lost. Any entry older than 5 minutes is discarded rather than acted on.

**Validation.** The extension validates the URL with `AppCore.RedditLink` before writing. A non-Reddit URL is rejected in the extension with a brief message, so the app is never launched to show an "Unknown URL" alert.

### 12.4 App Intent

`OpenRedditLinkIntent` (`AppIntents`) accepts a URL and performs the same intake, so "Open in APPNAME" appears in Shortcuts, the share sheet and Spotlight without the user installing anything. This replaces the original's "install this iCloud Shortcut" flow. `AppEntity` payloads stay well under the 10 MB cumulative cap (we vend none).

---

## 13. Traceability

| Section | Implements |
|---|---|
| §1 Access model, pipeline, UA | `spec/02 §0`, `§1.1`, `§1.2`, `§1.3` |
| §2 Link parsing / normalization / classification | `spec/02 §1.4`; `spec/01 §7`, `§7.1`–`§7.3`, `§7.5`, `§7.7` |
| §2.6 Preferred sorts | `spec/01 §7.6`; `spec/02 §1.4`; `spec/03 §16.2` |
| §3 Short links | `spec/01 §7.4`; `spec/02 §1.5` |
| §4.0–§4.1 Post | `spec/02 §4.1` |
| §4.1.1 Flag summary | `spec/02 §4.1`; `spec/03 §4.2`, `§4.11`, open question 6; `spec/04 §2` |
| §4.2 PostMedia enum | `spec/02 §4.1.3` (rendering precedence), open question 7; `spec/03 §4.5`; `spec/05 §1` |
| §4.3 Images | `spec/02 §4.1.1`; `spec/03 §4.6`; `spec/05 §11` |
| §4.4 Video ladder | `spec/02 §4.1.2`; `spec/05 §1.1` |
| §4.5 Link classification | `spec/02 §4.1.3`; `spec/05 §1.2` |
| §4.6 Comment | `spec/02 §4.2`; `spec/04 §3.1`, `§3.5` |
| §4.7 PostDetail | `spec/02 §4.3`; `spec/04 §1.2` |
| §4.8 Subreddit | `spec/02 §4.4`; `spec/07 §8.3` |
| §4.9 User | `spec/02 §4.5`; `spec/07 §4.1`, `§4.6` |
| §4.10 Multireddit | `spec/02 §4.10`; `spec/07 §10` |
| §4.11 Inbox | `spec/02 §4.9`; `spec/07 §2.3`, `§2.4`, `§3.1` |
| §4.12 Flair | `spec/02 §4.6`, `§4.7`; `spec/04 §3.4` |
| §4.13 Poll | `spec/02 §4.8`; `spec/03 §4.9`; `spec/04 open question 9` |
| §4.14 Awards | `spec/02 §4.12` |
| §4.15 OpenGraph | `spec/02 §4.11`, `§2.15`; `spec/05 §1.2` |
| §4.16 Formatters | `spec/02 §4.13`; `spec/03 §22`; `spec/09 §7.1`, `§7.2` |
| §5.2 Endpoint catalog | `spec/02 §2.1`–`§2.12` in full |
| §5.3 Login | `spec/02 §3.1`; `spec/07 §1.2` |
| §5.4 Cookies | `spec/02 §3.4`; `spec/09 §2.2` |
| §5.5 Login procedure | `spec/02 §3.2`; `spec/07 §1.4` |
| §5.6 Modhash | `spec/02 §3.3` |
| §5.7 Prefs normalisation (dropped) | `spec/02 §2.10`; `spec/07 §1.10` |
| §5.8 Multi-account | `spec/02 §3.5`; `spec/07 §1.6`, `§1.9` |
| §5.9 Expired sessions | `spec/02 §3.6` |
| §6 Pagination and filtering | `spec/02 §5.1`, `§5.2`; `spec/03 §2`, `§11`–`§14` |
| §6.4 In-memory caches | `spec/02 §5.3` |
| §7 Persistence | `spec/09 §1.1`–`§1.4`; `spec/06 §11.3`, `§11.4` |
| §7.4 Keychain | `spec/02 §3.4`; `spec/09 §2.2` |
| §7.5 Draft keys | `spec/04 §11.3`; `spec/07 §3.2`, `§3.3`; `spec/09 open question 1` |
| §7.6 File caches | `spec/02 §5.4`; `spec/05 §12`; `spec/09 §2.3` |
| §7.7 Maintenance | `spec/09 §1.3`; `spec/06 §11.4` |
| §8 Settings table | `spec/06 §11.2` (primary), `spec/03 §23`, `spec/04 §15`, `spec/05 §13`, `spec/09 §2.1` |
| §9.1 Redgifs | `spec/02 §2.14`, `§6.1`; `spec/05 §4.1` |
| §9.2 Signed URLs | `spec/02 §6.2`; `spec/05 §4.2` |
| §9.3 Watchdog | `spec/02 §6.3`; `spec/05 §4.3` |
| §9.4 OpenGraph fetcher | `spec/02 §2.15`, `§6.6`; `spec/05 §1.2` |
| §9.5 Imgur/Gfycat | `spec/02 §6.4`, `§6.5` |
| §9.6 Backend removal | `spec/02 §2.13`, `§5.5`; `spec/06 §10`, `§12.3`; `spec/09 §3.1`, `§3.2` |
| §9.7 Crash reporting | `spec/02 §6.7`; `spec/06 §9` |
| §9.8 Host inventory | `spec/02 §9` |
| §10 Error taxonomy | `spec/02 §7`; `spec/03 §2`; `spec/07 §4.6` |
| §11 Rate limiting | `spec/02 §8`, open question 14 |
| §12 Sharing | `spec/09 §5.1`–`§5.4`; `spec/05 §9`; `spec/08 §K` |

---

## 14. Open decisions referenced

Every item below is resolved in `08-decisions-and-drift.md`. Items marked **(new)** are raised by this document and should be added to `08` if they are not already there; all others use `08`'s existing short name.

### 14.1 Items already catalogued in `08`

| Short name | What this document needs from it |
|---|---|
| `raw-json-param` | Send `raw_json=1` and delete all client-side entity decoding (§1.3). Changes rendering for text containing a literal `&amp;` |
| `pagination-cursor` | Keep paginating on the last item's fullname rather than the listing envelope's `after` (§6.1) |
| `more-stub-count-zero` | Render a `more` stub with `count: 0` as "Continue this thread →" instead of "0 more replies" (§4.6) |
| `poll-voting-stub` | Build real poll voting, or render read-only with results — the model supports both (§4.13) |
| `time-year-seam` | Preserve the 360–365-day "0 years" seam, or fix it (§4.16) |
| `time-format-parity` / `number-format-parity` | Reproduce the custom formatters exactly rather than using `RelativeDateTimeFormatter` / `NumberFormatter` (§4.16) |
| `prefs-force-over18-on-login` / `account-settings-throttle` | Drop the undisclosed `old.reddit.com/prefs` rewrite; replace with a one-time banner (§5.7) |
| `cookie-expiry-rewrite` | Keep the `+10 000 days` expiry rewrite after every response (§5.4) |
| `no-offline-detection` | Distinguish offline from server error with `NWPathMonitor` (§10.1) |
| `no-429-handling` | Add minimal 429 recognition, a global cooldown and exactly one retry (§11.2) |
| `self-hosted-server-row` | No first-party backend; the self-hosted-server settings section disappears (§9.6) |
| `guide-included-or-not` / `guide-prose-rewrite` | Guide search becomes on-device FTS5 over bundled Markdown (§9.6) |
| `newpost-type-switch-keeps-text` | Clear the composer body when switching to or from a link post (§7.5) |
| `clipboard-read-default` | Resolve the original's contradictory defaults in favour of `false` (§8.1) |
| `unpruned-tables` | Leave `custom_themes`, `counter_stats` and `subreddit_visits` unpruned (§7.3) |
| `theme-import-format-compat` | Accept the legacy theme-import sentinel; emit ours (`02 §8.5`) |
| `snudown-renderer` / `swift-markdown` | Parse markdown source rather than Reddit's rendered HTML (`02 §9.1`) |
| `redgifs-memory-only` | Never persist resolved Redgifs URLs (§6.4, §9.1) |
| `hidden-posts-local` | Hiding stays local; Reddit's own hide endpoint is never called (§7.3) |
| `multireddit-merged-feed` | Read multireddit feeds through the merged `r/a+b+c` URL with the three-source definition fallback (§5.2 M2/M3) |
| `captcha-webview-fallback` | Keep the new.reddit submit-page fallback on `BAD_CAPTCHA` (§5.2 S1) |
| `report-webview` / `wiki-webview` | Report and wiki remain embedded web pages (§5.2, `04c`) |
| `inbox-no-filter-tabs` | One interleaved inbox feed; no All/Unread/Messages segmentation (§4.11) |
| `user-page-minimal` | No avatar, no trophies, no follow control on the profile (§4.9) |
| `comment-sort-six` | Six comment sorts; whether "Default" is added is a `04a` decision (§2.4) |
| `share-extension` / `shortcuts-intent` | Share extension payload plus the App Intent (§12.3, §12.4) |
| `pro-removed` / `ai-removed` / `push-removed` | Out of scope; nothing in this contract depends on them |
| `message-modal-copy-bugs` / `unknown-error-rethrow` / `edit-comment-crash` / `pencil-modal-close` | Original bugs that this contract does not reproduce |

### 14.2 New items raised by this document

| Short name | Question |
|---|---|
| `user-agent-string` **(new)** | Emit a well-formed iOS-Safari UA rather than the original's typo'd one (§1.4) |
| `login-css-injection` **(new)** | Inject no cosmetic CSS into Reddit's login page (§5.3) |
| `stale-modhash-recovery` **(new)** | Re-validate the session after three consecutive rejected writes (§5.9) |
| `og-concurrency-cap` **(new)** | Cap OpenGraph preview fetches at 6 concurrent (§9.4) |
| `fullscreen-player-retry` **(new)** | Make a hard player error tappable-to-retry in the fullscreen viewer (§10.2) |
| `edit-draft` **(new)** | Persist in-progress edits, which the original loses silently (§7.5) |
| `startup-url-default` **(new)** | Default the startup URL to empty instead of the Reddit home page (§8.1) |
| `settings-key-rename` **(new)** | Confirm the namespaced `APPNAME` key names in §8.1; there is no import path from the original, so this is free to get right once |
