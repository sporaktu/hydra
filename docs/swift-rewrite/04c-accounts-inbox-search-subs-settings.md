# 04c — Accounts, Inbox, Messages, User, Search, Subreddit Detail, Web Views, and the Settings Tree (SwiftUI Implementation Spec)

**Target:** `APPNAME`, a from-scratch native SwiftUI iPhone Reddit client.
**Platform floor:** iOS 26.0, built with the iOS 27 SDK, Swift 6.4, strict concurrency with default
`MainActor` isolation.
**Companion documents:** `02-architecture.md` (stores, `Route`, `Theme` environment, typed `Settings`,
entitlements seam), `03-data-and-networking.md` (`RedditAPI` actor, endpoint IDs, Keychain session
model), `04a-feeds-posts-comments.md` (feeds, post cards, comments, composers),
`04b-media.md` (media viewer, caches, low data), `05-monetization.md` (binds `[GATE: gate.*]`),
`06-build-plan-and-acceptance.md`, `07-one-shot-prompt.md`, `08-decisions-and-drift.md` (resolves `[DECISION: <id>]`).

Clean-room reproduction of *behavior*. Quoted strings are functional UI copy and reproduced verbatim,
with the product name replaced by `APPNAME` where it appears. iPhone only.
`[DECISION: ipad-split-view-deferred]`

**Removed by the owner, not specified anywhere here:** AI summaries, AI filters, push notifications /
"Inbox Alerts". A subscription **paywall entry point** does exist as a placeholder (§13.1) and is
defined by `05-monetization.md`.

---

## Part I — Accounts

### 1. Accounts screen

Route `Route.accounts`. Reachable from: the Account tab's root, the Settings root's **Account** row,
and the header-left "Accounts" button on the User page when that page is the root of its stack.

#### 1.1 Chrome

- Navigation title: the current username when logged in, else `"Accounts"`.
- **Header-right: a "+" button** that presents the login sheet (§2). It **pulses** (§1.4) whenever
  there are zero saved accounts.
- Back title, when this screen was pushed, is `"Subreddits"`.

#### 1.2 List

Vertical list of every saved account in the order they were added (switching never reorders),
followed by a synthetic trailing row labeled **`"Logged Out"`**.

- **Empty state:** with zero accounts the whole body is replaced by centered `Text("No accounts")` at
  18 pt. The `"Logged Out"` row is **not** shown in that case.
- **Row:** username on the left; a checkmark glyph on the right when the row is the active one
  (`currentUser?.userName == username`, or `currentUser == nil` for the `"Logged Out"` row). While a
  switch is in flight the checkmark is replaced by a `ProgressView`.
- **Tap:** sets a row-local loading flag, then either `logOut()` (for `"Logged Out"`) or
  `logIn(username:)`, clears the flag, and finally calls an optional `onAccountAction` callback (used
  by the quick-swap sheet to dismiss itself).
- **Swipe:** a leading/trailing delete action (trash glyph, `theme.delete`) on real account rows. The
  `"Logged Out"` row has **no** swipe action.
- **Long press** on a real account row (single touch only) opens a context menu with exactly one item:
  **`Delete`**. The `"Logged Out"` row cannot be long-pressed.
- **Delete:** **fix forward** — both swipe-delete and long-press-delete first present
  `.alert("Remove Account", "Remove <username> from APPNAME? You can sign in again at any time.",
  [Cancel, Remove(destructive)])`. On confirm: show a row spinner, remove the account, clear the
  spinner. The original asked nothing, which is a real footgun.
  `[DECISION: no-confirm-account-delete]`
- Accessibility: each row is a button with a `selected` trait matching the active-row logic, and real
  accounts expose a custom `delete` action.

#### 1.3 One-time tip

The first time this screen is shown with **more than one** saved account, present a one-shot alert
(persisted by key `flags.quickAccountSwapTip`, never shown again):
title **`"Did you know?"`**, message **`"You can quick swap accounts by long pressing the account
tab."`**

#### 1.4 Zero-accounts pulse

`PulseHighlight` wraps (a) the Accounts "+" button, (b) the Account tab's icon, and (c) the Account
tab's label color, only while `accounts.isEmpty`. It is a repeating opacity (1 → 0.4) and scale
(1 → 0.92) animation, **1400 ms per half-cycle**, ease-in-out, auto-reversing forever.

**Pulse color** (`pulseColor(for:)`): convert `theme.iconOrTextButton` to HSL; if hue ∈ [0°, 20°] ∪
[345°, 360°] **and** saturation ≥ 0.5, the theme reads "reddish" and the pulse uses that same color
(so red-accented themes pulse red rather than clashing); otherwise fall back to `theme.share` (a
softer amber "caution" color). There is no persisted "seen" state — it re-pulses whenever there are
zero accounts.

### 2. Login flow

#### 2.1 Presentation

A full-screen cover with a solid black background (not a native sheet).

- Top bar: centered title **`"Login"`** in white, and a white close "X" on the right with a generous
  hit area.
- Body: a `WebView` (SwiftUI-native WebKit, per the 2026 baseline) driven by a `WebPage` configured
  with a **persistent** website data store so cookies land in the shared jar, loading:

  `https://www.reddit.com/login?dest=https://www.reddit.com/`

  The `dest` value only affects where Reddit redirects after a successful login; it is the Reddit
  home page and names no subreddit (`03-data-and-networking.md` §5.3).
- While the web view is not yet ready to show (briefly, while the temporary logout below is staged),
  show a centered `ProgressView` instead.

**Instructions copy.** The user authenticates directly on Reddit's own page (username/password, 2FA,
everything), and `APPNAME` never sees the password. **Fix forward:** show one line of explanatory copy
above the web view — "You sign in on Reddit's own page. APPNAME never sees your password." — because
the original's silence here is the most-reported confusion in the login flow.
`[DECISION: login-no-instructions]`

**Cosmetic injection.** `APPNAME` injects **nothing** into Reddit's login page. The original injected
CSS to hide chrome, nudge a heading margin and adjust a z-index, re-applying on every DOM mutation and
walking shadow roots; injected cosmetics break on every Reddit redesign and are a maintenance tax on a
page shown a handful of times per install (`03-data-and-networking.md` §5.3).
`[DECISION: login-css-injection]`

#### 2.2 Temporary logout before showing

Before displaying the web view, snapshot the current username and auth token, clear all Reddit session
cookies, and drop the in-memory auth token, so the login page starts from a genuinely logged-out
session. This matters when adding a second or third account — otherwise Reddit's login page may
silently already be authenticated as the active account. If the flow is cancelled or fails and a
previous account existed, restore its cookies and token so the app returns exactly to its prior state.

#### 2.3 Success detection — two mechanisms in parallel

A `loginFinished` latch guards against both firing.

1. **Navigation allow-list.** On each navigation start, if the target URL does **not** contain any of
   these four substrings, treat the login as finished:

| # | Allowed-while-logging-in substring |
|---|---|
| 1 | `reddit.com/login` |
| 2 | `redditinc.com/policies/user-agreement` |
| 3 | `redditinc.com/policies/privacy-policy` |
| 4 | `reddit.com/policies/privacy-policy` |

   Navigating anywhere else means Reddit is redirecting to `dest`.

2. **500 ms cookie poll** (backup, because the navigation callback does not fire for all users — the
   original notes this is likely a Reddit A/B test). Every 500 ms, check whether a `reddit_session`
   cookie now exists for `https://www.reddit.com`. As soon as it does, treat the login as finished.
   The poll starts only once the web view is showing, and stops on completion or dismissal.

With `WebPage`, implement (1) by observing the `navigations` async sequence and (2) with a `Task` that
polls `WKHTTPCookieStore`.

#### 2.4 Completion

On "finished": dismiss immediately, then run the login procedure with no username argument (it uses
whatever session cookie is now live).

Login procedure, in order:
1. If a username was given (an account switch, not a fresh login), restore that account's session
   cookies from the Keychain first.
2. `GET /user/me/about.json` (endpoint U1) with suspended accounts allowed — a suspended account can
   still sign in; suspension surfaces later when browsing.
3. If a username was explicitly requested and the returned name differs → throw
   `"Authenticated session out of sync"`.
4. Require an auth token (`modhash`) in the response; if missing → throw `"Failed to get modhash"`.
5. Store the token in memory (never persisted).
6. Persist `currentUser`, set the in-app current-user state, set the crash reporter's user context.
7. Re-save the fresh session cookie to the Keychain (service `com.OWNER.appname.session`, account
   `<username>` — `03-data-and-networking.md` §7.4).
8. Evaluate the one-time NSFW-visibility banner (§3.4). No Reddit account preference is written.
9. Append the username to the stored account list if not already present.

**On any failure in that chain:** present
`.alert("Login Session Expired", "You can login again by pressing the + button in the top right
corner of the Account tab.")`, then perform a full logout, and return failure.

**If the login procedure itself fails right after the web view flow:**
`.alert("Login failed", "Something went wrong")`.

**Cancel (X):** dismiss without attempting a login and restore the previous account's session.

#### 2.5 Session storage and switching

| Concern | Contract |
|---|---|
| What is stored | The `reddit_session` **cookie**, serialized, per account. **No password is ever stored or transmitted to `APPNAME`.** |
| Where | Keychain, `kSecClassGenericPassword`, service `com.OWNER.appname.session`, account `<username>`, accessibility `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` (`03-data-and-networking.md` §7.4) |
| Account list | Persisted array of usernames, insertion-ordered |
| Active account | Persisted `currentUser` username; absence means logged out |
| Auth token | In memory only, never persisted; refreshed **only** by re-running the login procedure (at launch for the stored `currentUser`, or on an explicit switch). There is no periodic or on-401 refresh. |
| Cookie longevity hack | Reddit's `reddit_session` cookie carries **no expiry**, so the system drops it at launch. If a `reddit_session` cookie exists with no expiry, rewrite it with an expiry of **now + 10 000 days** — **at most once per app session per account**, not after every response (`[DECISION: cookie-expiry-rewrite]`). This is why sessions survive restarts. |
| Logout / clear | Because clearing can resurrect cookies from the web view's separate store, first write a **stale** `reddit_session` (empty value, expiry epoch 0) into **both** the HTTP and web-view cookie stores, then clear both. Reproduce this ordering with `HTTPCookieStorage` and `WKWebsiteDataStore.default().httpCookieStore`. |
| Switching | Restore that username's cookie blob → re-run the login procedure. There is no token swap; the identity is the cookie plus a freshly fetched token. |
| Logout | Clear cookies, remove the `currentUser` key, clear the in-memory token and crash-reporter user, set state to nil. The account list and per-account cookie blobs are **untouched**, so the account can be switched back into. |
| Remove account | If it is the active account, log out first; delete its Keychain entry; rewrite the account list. |
| Anonymous mode | The synthetic `"Logged Out"` row; selecting it calls logout. Anonymous browsing works for every unauthenticated GET. Attempting an authenticated action presents `.alert("You need to log in first!")` and the call is never sent. |
| Startup | Read the account list; if present, set it, and if `currentUser` is set run the login procedure for it. Then flip a `loginInitialized` flag the UI waits on — until it is true, a full-screen splash covers everything. |

#### 2.6 What reloads on an account switch

Driven purely by `currentUser` changing:

| Subsystem | Effect |
|---|---|
| Subreddits store | Reloads subscriptions, moderated subreddits and multireddits. When logged out it instead loads the top 30 trending subreddits and empties favorites/moderator/subscriber/multis. |
| Favorites | Keyed **per account** by Reddit user id, so they do not carry over between accounts on one device; logging out empties the visible list while each account's stored data persists under its own key. |
| Inbox store | Resets the unread count to 0 and tears down polling when there is no user; starts (and immediately runs) a 60 s poll when a user becomes active. |
| Open feed / profile screens | **Not** automatically reloaded — there is no global refresh trigger. Screens re-fetch on their own focus / route-change triggers as usual. |

#### 2.7 Quick Account Swap

Triggered by **long-pressing the Account tab**, but only when at least one account is saved (with zero
accounts the long press does nothing). Fires `hapticSelection()`.

Presentation: a full-screen overlay — a 0.7-opacity black scrim that dismisses on tap, plus a
**centered card** (max height 400, rounded, bordered, `theme.tint`) containing the **same** account
list component as §1.2, with identical tap/swipe/long-press semantics. The whole overlay fades in and
out over **150 ms**.

Difference from the full Accounts screen: `onAccountAction` is wired to dismiss, so **successfully
switching, logging out, or deleting from the swap card closes it automatically**.

`[GATE: gate.multiAccount]` — the gate sits on the Accounts "+" button (when `accounts.count >= 1`) and
on this long-press, never on the list itself. Existing extra accounts stay listed; selecting one opens
the paywall (`05-monetization.md` §4).

### 3. Anonymous state, blocking, and account-settings normalization

#### 3.1 Logged-out behavior

Browsing (feeds, post details, comments, search, sidebars) works fully logged out. Voting, commenting,
posting, saving, messaging, subscribing, favoriting, and the inbox all require login.

- Favoriting while logged out presents `"You must be logged in to favorite subreddits"`.
- The Subreddits hub shows a Trending section instead of Home/Favorites/Multireddits/Moderator/
  Subscribed.
- The Inbox loader returns an empty list immediately when there is no user, so the inbox is simply
  empty rather than showing an error or a login prompt.
- The Messages screen renders **nothing at all** when logged out.

#### 3.2 Block

From a user profile's "…" menu → `Block` → `.alert("Block User", "Are you sure you want to block this
user?", [Cancel, Block])` → endpoint U3 → `.alert("User Blocked", "Content from this user will be
hidden")`.

There is **no** blocked-users management list anywhere in the app. Blocking is fire-and-forget.
`[DECISION: no-blocked-users-screen]`

#### 3.3 Report

Every `Report` action anywhere in the app pushes a web view at `https://www.reddit.com/report`. It is
**not** wired to a specific post, comment or user id. `[DECISION: report-webview]`

#### 3.4 Account-settings normalization — **dropped**, replaced by a one-time banner

The original silently scraped `https://old.reddit.com/prefs`, parsed the preferences form, and POSTed
the **entire** preferences object back with `media`, `over_18` and `search_include_over_18` forced to
`"on"` — no UI, no prompt, no user awareness, throttled by a single global 30-day timestamp written
*before* the request so a failure burned the window.

**`APPNAME` does not do this.** There is no `/prefs` fetch, no `/post/options` write, no throttle
timestamp, and no `A1`/`A2` endpoint in the catalogue (`03-data-and-networking.md` §5.7). Silently
mutating a user's Reddit account settings without consent is indefensible on its own terms and in App
Review, and it is a screen-scrape of an HTML form that breaks whenever Reddit touches that page.

**Replacement — the NSFW-visibility banner.** On first login, if `/user/me/about.json` or the first
listing indicates that Reddit is filtering mature content server-side for this account, show a
**one-time, dismissible banner** at the top of the feed:

> "Reddit is hiding mature content for this account. You can change that in Reddit's settings."

with a button that opens `https://www.reddit.com/settings/account` through the external-link handler
(§12), and a dismiss control. The banner is shown at most once per account; dismissal is permanent.
`APPNAME` writes nothing to the user's Reddit account, ever.
`[DECISION: prefs-force-over18-on-login]`

---

## Part II — Inbox and Messages

### 4. Inbox

#### 4.1 Badge and polling

- The Inbox tab shows a badge with the unread count whenever it is `> 0`; at 0 no badge is shown (never
  a literal "0").
- Unread count = the number of items whose `new` flag is true in **one** fetch of the inbox's first
  page.
- While logged in, poll every **60 000 ms**, plus an immediate call the moment a user becomes active.
  Tear the timer down whenever the user changes (logout or switch).
- The poll **skips silently** when no auth token is held — this tolerates the window during an account
  switch where a user is set but the handshake has not finished.
- Every time the count changes, set the app icon badge (`UNUserNotificationCenter.setBadgeCount(_:)`).
  This is **only** the badge number — no banner, no notification content, no scheduling.
- **No background polling, no background fetch, no push registration.** The timer runs only while the
  app is alive, which in practice means foregrounded; the badge therefore freezes while backgrounded
  until the app is reopened.
- **Notification permission:** setting a badge requires `.badge` authorization. Request it **lazily**,
  the first time a non-zero count is about to be written, not at launch. If the request is denied,
  everything else continues to work; only the icon badge is absent. The inbox, its 60-second poll and
  its badge are **free** — there is no gate on this path (`05-monetization.md` §3.1 row F, §4.1).
- The Inbox screen additionally refreshes its own list whenever the count changes **and** the screen is
  currently visible, so opening or foregrounding the tab just as a poll lands visibly refreshes.

#### 4.2 Screen

- Title `"Inbox"`. Header-right: a single checklist icon button — **Mark All Items Read** (§4.4).
- Body: **one infinite-scrolling combined list** fed by endpoint I1. **There are no filter tabs** — no
  "All / Unread / Messages / Comment Replies / Mentions" segmented control exists. Username mentions
  arrive as ordinary comment-reply items and are visually indistinguishable from direct replies; there
  is no mentions category anywhere. `[DECISION: inbox-no-filter-tabs]` `[DECISION: inbox-no-filter-tabs]`
- Only two kinds are kept client-side: comment replies and private messages. Everything else is
  dropped.
- Standard pull-to-refresh and load-more-on-scroll, using the same `ListingStore` machinery as `04a`
  §2.

#### 4.3 Row layouts

**Comment reply row:**

| Part | Detail |
|---|---|
| Leading glyph | `message-square`-equivalent, tinted `theme.iconPrimary` when unread, `theme.subtleText` when read |
| Title line | Static prefix `"Reply to your comment in "` in `theme.text`, followed by the parent post's title in a subtler tint, clamped to **2 lines** |
| Body | The reply's HTML, rendered by the shared renderer (`04a` §18) |
| Footer | `"in "` + **`r/<subreddit>`** (tappable → subreddit feed) + `" by "` + **`<author>`** (tappable → user page); then a metadata row: vote glyph tinted by the current user's vote (`theme.upvote` / `theme.downvote` / `theme.subtleText`) + score, then a clock glyph + relative time |
| Tap | Marks the item read (optimistic local flip + endpoint I2) and navigates to the comment's **context** link, deep-linking into the thread |
| Swipe | Short-right (drag right, short) = **upvote**; long-right = **downvote**; short-left = **toggle read/unread** (mail glyph) |
| Long press | Menu: **`Upvote`**, **`Downvote`**, and either **`Mark as Read`** (when unread) or **`Mark as Unread`** (when read) |

Voting recomputes the row's local vote/score state optimistically from the returned effective vote.

**Private message row:**

| Part | Detail |
|---|---|
| Leading glyph | mail glyph, same read/unread tint rule |
| Title | The message `subject`, max **2 lines**, `theme.text` |
| Body | The message HTML |
| Footer | `"from "` + **`<author>`** (tappable → user page) + clock glyph + relative time |
| Tap | Marks read, navigates to `Route.messageThread(id)` (§5) |
| Swipe | Short-right = **mark-as-read toggle only**. No vote actions — messages are not votable. |
| Long press | A **single** item whose label **flips with state**: `Mark as Read` when unread, `Mark as Unread` when read. The original hard-coded "Mark as Read" in both states; that is a copy bug, not a design. `[DECISION: message-modal-copy-bugs]` |

#### 4.4 Mark all read

Header checklist → `.alert("Mark All Items Read?")` with **no message body** and buttons
**`Cancel`** (cancel role) / **`Ok`** (default role).

- On **Ok**: endpoint I6. On success present
  `.alert("Success!", "This may take a moment to update, especially if you have a lot of unread
  messages.")`, then after a **1-second** delay re-run the poll to refresh the badge/count.
- On failure: `.alert("Error", "Failed to mark all messages as read.")`.

#### 4.5 Read/unread toggling

Endpoint I2 with the item's fullname: `/api/unread_message` to mark unread, `/api/read_message` to
mark read. Adjust the in-memory unread count by ±1 immediately (optimistic), in addition to whatever
the next poll recomputes.

### 5. Messages (conversation view)

Route `Route.messageThread(MessageID)`. Title **`"Messages"`**. Renders **nothing** when logged out.

- Loads the full thread (endpoint **I3**) and flattens the root message plus all nested replies into one
  chronological array. Reddit stores replies inside the first message; an empty-string `replies`
  field means none.
- While loading: a centered `ProgressView`. Auto-scroll to the bottom whenever the message count
  changes (a message loaded or sent).
- **Bubbles:** the current user's own messages are right-aligned with a `theme.iconPrimary`
  background; the other party's are left-aligned with `theme.tint`. Each bubble shows the author name
  and a **short** relative timestamp above the HTML-rendered body.
- **Reply button:** pinned to the bottom, shown only when the thread contains at least one message
  from someone other than the current user. Tapping it opens the reply composer seeded with the most
  recent message from that other user (used as the reply target).

#### 5.1 New message composer

Reached from a user profile's "…" menu → `Message`.

- Full-screen cover. Top bar: **`Cancel`** (dismisses without sending), a centered title, and
  **`Send`** (replaced by a `ProgressView` while submitting).
- Fields: a single-line **Title** (subject) styled as a pill row, then the shared markdown editor
  (`04a` §16.5.1) for the body, then a **`Preview`** label with a live-rendered preview beneath.
- **Validation: none.** `Send` always attempts submission regardless of an empty subject or body; the
  server's error array decides. Endpoint I4.
- **Success** (empty error array): dismiss, clear both drafts, fire the parent refresh callback, and
  present `.alert("Message sent!")`.
- **Failure:** stay open, reset the submitting state, and present `.alert("Failed to send message")`.
  The original's copy literally said "Failed to submit **comment**" — a copy/paste artifact from the
  comment composer, fixed here. `[DECISION: message-modal-copy-bugs]`
- **Drafts:** subject and body autosave per recipient under the draft keys
  `message.subject.<recipient-lowercased>` and `message.body.<recipient-lowercased>`
  (`03-data-and-networking.md` §7.5), cleared only on a successful send.

#### 5.2 Reply composer

Same shell, **no subject field**.

- The top-bar title reads **`"Reply"`**. The original literally titled the reply composer
  `"New Message"` — another copy/paste artifact, fixed here. `[DECISION: message-modal-copy-bugs]`
- Submits via endpoint I5 — which is Reddit's **comment** endpoint with the previous message's
  fullname as the target, not a message-specific endpoint.
- Success: **no alert**; just fire the parent reload and dismiss. Failure: the same
  `"Failed to send message"` alert as above.
- Draft key: `messageReply.<authorOfPreviousMessage-lowercased>` (`03-data-and-networking.md` §7.5),
  cleared on a successful send.

---

## Part III — User pages, search, subreddit detail

### 6. User page

Route `Route.userProfile(UserTarget)`. See `04a` §3.4 for the feed half and the section list; this section owns
the header and menus.

#### 6.1 Header (`UserDetailsHeader`)

Rendered **only** on the profile root, never on a deeper section.

A circular **avatar**, 64×64, above the stats: `User.iconURL` (`data.icon_img` truncated at the first
`?`), loaded with `AsyncImage`, falling back to the generic person glyph when absent. The original
carried the icon URL in its model and rendered it nowhere; on a modern iPhone the missing avatar reads
as broken, so this one addition is a deliberate, flagged deviation from code parity
(`[DECISION: user-page-minimal]`).

**Three stats**, evenly spaced, each a number over a two-line label:

| Stat | Value |
|---|---|
| Comment Karma | `prettyNum(commentKarma)` |
| Post Karma | `prettyNum(postKarma)` |
| Account Age | `prettyTimeSince(createdAt)` (e.g. `"5y"`) |

**Not rendered anywhere on this page:**
- **No trophies.**
- **No cake-day UI** beyond the Account Age stat.
- **No follow / unfollow control.** A read-only `friends` boolean exists in the model and surfaces
  only as inert text in the compact search-result row (§7.3). The app has no follow feature.

`[DECISION: user-page-minimal]`

**Section buttons** (icon + label rows, tap pushes the corresponding route):

| Label | Route suffix | Shown |
|---|---|---|
| Posts | `/submitted` | always |
| Comments | `/comments` | always |
| Upvoted | `/upvoted` | own profile only |
| Downvoted | `/downvoted` | own profile only |
| Hidden | `/hidden` | own profile only |
| Saved Posts | `/saved?type=links` | own profile only |
| Saved Comments | `/saved?type=comments` | own profile only |

There is **no** "Overview" or "Gilded" button — the profile root itself is the combined overview feed.
"Own profile" is determined by the `/about` response carrying an `inbox_count` field, which Reddit
returns only for the authenticated user's own profile.

#### 6.2 Sorting

Sort controls appear **only** on the `submitted` and `comments` sections, offering **New, Hot, Top**
(Top opens the Hour/Day/Week/Month/Year/All submenu). The root/overview page and the
upvoted/downvoted/hidden/saved sections show **no** sort control.

#### 6.3 Header "…" menu

| Item | Shown | Effect |
|---|---|---|
| `Block` | always | §3.2 |
| `Message` | only when viewing **someone else's** profile | Opens the new-message composer addressed to them (§5.1) |
| `Share` | always | Share sheet with the profile's canonical URL |

#### 6.4 Not-found / suspended states

| Condition | Result |
|---|---|
| `error == 403` or `is_suspended` is truthy | Banned/suspended user error |
| `error == 404` | Nonexistent user error |

The **header** fetch passes "allow suspended", so a suspended user's page still attempts to load. The
**content** fetch does not, so it throws for a suspended or banned user. Both surface through the
shared access-failure view with the exact strings in `04a` §2.2 (`🚫 <name> has been banned`,
`🚫 <name> does not exist`), replacing the entire content area with centered subtle text and **no
retry button**.

#### 6.5 Compact user row (search results)

Username (tap → user page), then a metadata row: star glyph + **total** karma (post + comment summed)
+ `" karma"`, a person-add glyph + **`"Friends: Yes"` / `"Friends: No"`** (inert, no tap action), and
a clock glyph + the account-age string.

### 7. Search

#### 7.1 Search tab

Route: the Search tab's root. Title **`"Search"`**.

```
SearchScreen
├─ HStack { Pill("POSTS"), Pill("SUBREDDITS"), Pill("USERS") }   // fixed order
├─ SearchBar
└─ results List  |  TrendingSubredditsList  |  ProgressView
```

- **Three pill scope toggles**, uppercase, fixed order **POSTS / SUBREDDITS / USERS**. The active pill
  has a `theme.tint` background; inactive pills are transparent. Default scope on load: **posts**.
- **Search bar**: magnifier glyph + field + a clear "x" button that appears once there is text.
  Auto-focuses when the screen appears **only if no search has been entered yet**; it does not
  re-focus on every appearance thereafter.
- **No query yet** → a **Trending Subreddits** list (trending-up glyph + name, tap → subreddit feed),
  sourced from the trending endpoint and filtered to exclude subreddits the user is already
  subscribed to and any subreddit literally named `"Home"`. While results are loading with no rows
  yet, show a small `ProgressView` instead of the trending list.

**Triggering.** The search fires on **submit** (return key) **and on blur** (leaving the field), but
only when the text differs from the last text actually searched. It does **not** search on every
keystroke. Changing the scope pill immediately re-runs the search against the same text. Clearing the
text also triggers a search, which — since the query is now empty — clears the results.

**Result rendering:**

| Scope | Row |
|---|---|
| posts | the standard post card (`04a` §4), fully interactive |
| subreddits | `/r/<name>` title, description (or **`"No description"`** when empty) clamped to 3 lines, footer with subscriber count, `"Joined"` / `"Not Subscribed"`, and time-since-creation |
| users | the compact user row (§6.5) |

**Query construction and quirks** (endpoint Q1):
- `type` is `link` / `sr` / `user`; `sr_detail=true` always included.
- **Subreddit scope rewrites the query** to `"/r/" + text.trimmed` with a leading `/r/`, `r/` or `/`
  stripped first — a workaround for Reddit's minimum-length quirk that otherwise makes 1–2 character
  subreddit names unfindable.
- **Pagination:** posts and subreddits paginate normally. **User search returns an empty page as soon
  as a cursor exists** — Reddit only allows one page of user results.
- **No sort control, no time-range control, no NSFW toggle, and no recent-searches history** exist on
  this tab. Reddit's own search operators (`author:`, `subreddit:`, `site:`, `title:`, `selftext:`,
  quoted phrases) work simply because they are plain query text; there is no UI for them.
  `[DECISION: search-no-sort]`

#### 7.2 In-subreddit search

A search bar is the **list header** of a single-subreddit feed only (never on Home or a multireddit).
It clears itself immediately after a search fires and submits **only on the return key** (not on
blur). On submit with non-empty text, push
`Route.subredditSearch(SubredditSearchTarget)`.

#### 7.3 Subreddit search results screen

- Title **`"Search"`**. Header-right offers sort options **Relevance, Hot, New, Top (+ time submenu),
  Comment Count**, and a single context option **Share**.
- Body: another search bar as the list header, prefilled with the current query, followed by an
  infinite-scrolling list of post cards.
- Query always forces `restrict_sr=true` and `sr_detail=true`; default page size 10, paginated by
  cursor (endpoint P3).
- **Posts only** — there is no scope toggle on this screen.
- Editing the text and re-submitting updates the route's query parameter, which is a refresh
  dependency and re-triggers the fetch.

#### 7.4 Quick Subreddit Search

Triggered by **long-pressing the Search tab** (no login guard) and by tapping the **switcher title**
on any Home/subreddit/multireddit feed (`04a` §8). Fires `hapticSelection()`.

Additionally, the **first** ordinary tap on the Search tab presents a one-shot alert (key
`flags.quickSearchTip`): title **`"Did you know?"`**, message
**`"You can quick search for subreddits by long pressing the search tab."`**

Presentation: a full-screen dimmed overlay (150 ms fade) anchored to the **top** safe area,
containing:
1. A text field, placeholder **`"Search for a subreddit"`**, autocorrect off, auto-focused when shown
   and auto-blurred when hidden.
2. An optional **`Go to r/<name>`** row.
3. A results list visually capped at **10 rows × 52 pt** before it scrolls internally.

| State | Content |
|---|---|
| Empty query | The user's **favorites followed by their subscriptions** (`favorites + subscriber`), in their existing order — no "recently visited" section |
| Typing (debounced **500 ms**) | Two concurrent lookups (below) |

**Lookup 1 — fuzzy search:** subreddit-scope search, 20 per page, appended on scroll. Stale in-flight
requests are discarded via a monotonically increasing token, so fast typing never renders older
results.

**Lookup 2 — exact match:** endpoint R7 (`/r/<name>/about.json`) after stripping a leading `/r/`,
`r/`, or `/`. If it resolves to a real subreddit — **including private, quarantined and banned ones**,
since Reddit still returns a subreddit object for those — show a highlighted **`Go to r/<name>`** row
above the results, with the subreddit's icon (or the generic glyph). **No subscriber count is shown on
this row** (only on the list rows below). Pressing Return with an exact match resolved navigates
straight there.

**Result row:** icon (generic glyph fallback), name, subscriber count via `prettyNum` + `" subscribers"`
when known, trailing chevron.

**Selection** (any row, the Go-to row, or Return with an exact match): dismiss, clear all local state,
and **push** a subreddit feed route.
**Dismissal:** tapping the dimmed background calls the exit handler without navigating.

### 8. Subreddit sidebar

Route `Route.sidebar(name)`, reached from a subreddit feed's "…" menu → **`Sidebar`**. Title is the
subreddit name.

- While **either** the about data or the rules are still loading: one centered `ProgressView`, no
  skeleton.
- Once both arrive, a scroll view containing, top to bottom:

1. **Stats bar** on a `theme.tint` background, currently showing exactly **one** stat: **`Subscribers`**
   with a locale-grouped number (e.g. `"1,234,567"`). The model carries only `subscribers` and the
   description HTML — there is **no** online/active-user count, **no** NSFW badge, **no** banner image
   and **no** subreddit icon on this page. `[DECISION: sidebar-single-stat]`
2. **`Rules`** section header, then a numbered expandable list: each row reads `"<i+1>. <rule name>"`
   with a `+` / `−` toggle glyph trailing. Tapping toggles that rule's expansion; expansion state is a
   set, so **multiple rules can be open simultaneously**. Expanded content renders the rule's full
   HTML description through the shared renderer. If a subreddit has **zero** rules the `Rules` header
   still renders with an empty list beneath it — there is no empty-state text.
3. The subreddit's full sidebar description, rendered as HTML. Links navigate in-app through the same
   link-handling rules as everywhere else.

- **No moderators list** is fetched or shown.
- **No subscribe/unsubscribe or favorite controls** on this page — those live only in the subreddit
  feed's "…" menu.
- **No wiki link** on this page — the Wiki is a separate item in that same "…" menu.

Endpoints: R5 (`/r/<sub>/about.json` → subscribers, description HTML) and R6
(`/r/<sub>/about/rules.json` → each rule's short name and description HTML).

**Access-failure screens.** A private, banned or quarantined subreddit surfaces through the same
shared component and strings as feeds (`04a` §2.2). A quarantined or gated subreddit presents the
`"Warning"` interstitial alert with Reddit's own message and `Cancel` / `Proceed`; Proceed accepts and
re-issues the request once.

### 9. Subreddit wiki

Route `Route.wiki(WikiTarget)`, reached from the subreddit feed's "…" menu → **`Wiki`**, which always opens
`https://www.reddit.com/r/<sub>/wiki/index` — never a chooser or listing of wiki pages.

**There is no native wiki renderer.** The screen is a thin wrapper around a themed web view that loads
the actual Reddit wiki page. Keep this approach: it is the highest-fidelity, lowest-risk option, and
the original does not have a native wiki markdown pipeline.
`[DECISION: wiki-webview]`

### 10. Multireddits

Covered end-to-end in `04a` §11.2 (listing, expand, add, remove). Recap of the constraints this
document owns:

- **No create, rename, or delete** in-app — no endpoint, no UI. Multireddits must be created on
  reddit.com and appear automatically.
- **Add** from a subreddit's "…" menu → `Add to Multireddit`. Zero multireddits →
  `"You have no multireddits created yet. Please create one first."` and stop. Otherwise a menu of
  names; picking one calls endpoint M4 and confirms `Added <sub> to <multi>`; failure shows
  `Something went wrong: <error>`.
- **Remove** only by expanding a multireddit on the Subreddits hub and long-pressing a member →
  `Delete From Multireddit` (endpoint M5) → `Removed <sub> from <multi>` / the same failure string.
  The menu also offers `Share`.
- **No confirmation** before either add or remove.
- A multireddit with a genuinely empty member list renders as an empty feed, **not** an error — this
  distinction (empty vs unavailable) is deliberate.
- Icon fallback: a 30×30 rounded image when an icon URL exists, otherwise the generic Reddit glyph.

---

## Part IV — Web views, external links, incoming URLs

### 11. Web view screen and link interception

#### 11.1 Plain web view screen

Route `Route.webView(WebViewTarget)`. Loads the given URL in a plain `WebView` with back/forward navigation
gestures enabled (`webViewBackForwardNavigationGestures`). **No theming, no link interception.** This
is the "dumb" variant used for things like the Report flow. It sits above the tab bar with normal
bottom padding (it is not one of the screens that scroll beneath the bar).

#### 11.2 Themed web view (wiki, embedded Reddit pages)

A richer component used for the wiki and any embedded Reddit page.

- Injects a stylesheet matching the current theme's background, tint, text, subtle text, link
  (`theme.iconOrTextButton`) and divider colors onto **both** old-Reddit DOM structures and
  new-Reddit ("shreddit") structures, using `!important` rules across a long selector list. Also hides
  the page's own `<header>` and Reddit's promotional bottom sheet.
- Enables shared and third-party cookies so the user's logged-in session carries into the page.
- Shows a centered `ProgressView` while loading.

**Navigation interception** (top-frame navigations only). For each navigation request:

| Case | Decision |
|---|---|
| The target's base path (ignoring query and fragment, trailing slash normalized) **equals** the current page's base path | **Allow** — in-page anchors, query-only changes, reloads |
| The target resolves to a **known** in-app page type, **or** is a short link (`redd.it/<id>`, `/r\|u\|user/<x>/s/<id>`, whose type is only knowable after resolution) | **Cancel** the web navigation and `push` the equivalent native route instead |
| Anything else (a genuine external link, or a URL that fails to parse as a Reddit URL) | **Cancel** and hand it to the external-link opener (§12) |

In every non-same-page case the web view's own navigation is suppressed — **every "real" navigation out
of a themed web view is redirected either into the native stack or out to the external browser**, never
left to load in place.

With `WebPage`, implement this in a `NavigationDeciding` conformance.

### 12. External link handling

A single choke point for every URL the app will not render natively. Governed by
Settings → General → External Links (§16.7), key `links.externalBrowser` of type `BrowserChoice`
(`03-data-and-networking.md` §8.1; the original's key was `externalLinkBrowser` and its raw values
`internalBrowser` / `defaultBrowser`).

| `BrowserChoice` | Label | Behavior |
|---|---|---|
| `inApp` | **APPNAME** (default) | Opens an in-app browser, presented full screen, with a "close"-styled dismiss control. Device orientation is unlocked while it is open and re-locked to portrait when it closes. Reader mode is applied per `openInReaderMode`. Use `SFSafariViewController` via a representable (`entersReaderIfAvailable` gives reader mode for free) — or a `WebView` if more control is needed, at the cost of reimplementing reader mode. |
| `system` | **Default Browser** | Open the URL unmodified; the system hands it to the default browser. |
| `chrome` | **Chrome** | Rewrite to `googlechromes://` (https) or `googlechrome://` (http) with the scheme stripped from the original. |
| `brave` | **Brave** | `braves://` / `brave://`, same shape. |
| `firefox` | **Firefox** | `firefox-open-url:?url=<percent-encoded full URL>`. |
| `edge` | **Edge** | `https://` → `microsoft-edge-https://`, `http://` → `microsoft-edge-http://`. |
| `opera` | **Opera** | `https://` → `opera-https://`, `http://` → `opera-http://`. |

**Failure path.** For any non-internal, non-default option, if opening the scheme URL fails (the
browser is not installed), present:

`.alert("Error", "APPNAME was not able to open \"<Browser>\". You may not have this browser installed.
You can change your link opening settings under Settings => General => External Links.\n\n<schemeURL>")`

with buttons **`Cancel`** and **`Open in Default Browser`** (which opens the original, unmodified URL).

**iOS 27 note:** `canOpenURL:` is deprecated. **Attempt the open and handle the failure** — do not
probe first. `UIApplication.open(_:options:completionHandler:)`'s completion flag is the signal.

Reddit URLs are never routed through this path; they always open natively inside the app's own
navigation.

### 13. Incoming URLs and "Open in APPNAME"

All four sources funnel into one handler.

**`handleURL(_:)`:**
1. Resolve short links (follow redirects for `redd.it/<id>` and `/r|u|user/<x>/s/<id>`). If resolution
   fails or the string is not a Reddit URL at all, keep the original string — never throw.
2. Classify the page type.
3. If **unknown**: present `.alert("Unknown URL", "The URL <url> cannot be handled by APPNAME.")` and
   **navigate nowhere**.
4. Otherwise: force-switch the tab bar to the **Posts** tab and **push** the mapped route onto that
   tab's stack — every incoming external URL always lands on top of the Posts tab, regardless of which
   tab was active.

**Sources:**

| # | Source | Details |
|---|---|---|
| 1 | **Custom scheme** `APPNAME://openurl?url=<encoded>` | Case-insensitive prefix match. Handled both for a cold-launch URL and for URLs delivered while running (`.onOpenURL`). The `url=` value is extracted by stripping the prefix. **No other custom-scheme path is accepted from outside** — a bare `APPNAME://settings` arriving externally is ignored; internal deep links of that shape are only ever constructed by the app itself. |
| 2 | **Clipboard detection** | On cold start (once routing is ready) and on **every** transition to the foreground, if `Settings.readClipboard` is on (**default `false`**), read the pasteboard's URL. If it parses as a Reddit URL, present `.alert("Open Reddit URL?", "A Reddit URL was detected on your clipboard. Would you like to open it?\n\n<url>")` with `Cancel` / `Open`. **Both** branches clear the pasteboard URL afterwards so the same content does not re-prompt. A re-entrancy guard prevents stacking prompts. If the setting is off, or there is no URL, or it is not a Reddit URL, nothing happens silently. On iOS, reading the pasteboard triggers the system paste prompt unless the user allows it for the app — this is what the settings copy in §16.4 explains. |
| 3 | **Share extension** | The app registers a share extension accepting **exactly one web URL**. Checked on the same triggers as the clipboard (routing-ready + every foreground). The payload is passed straight to `handleURL` with **no confirmation prompt**, and the queue is cleared. |
| 4 | **Universal links** | **Not enabled in v1.** Associated Domains would require serving an `apple-app-site-association` file from `reddit.com`, which the owner does not control, so universal links are not a realistic option. The entry points are the custom scheme, the Share Extension, the "Open in APPNAME" App Intent and clipboard detection. `[DECISION: universal-links-absent]` |

**"Open in APPNAME" shortcut.** The original ships an iOS Shortcuts-app shortcut (installed from
Settings → General → Open in APPNAME) that adds an "Open in APPNAME" row to other apps' share sheets
and hands off via the custom scheme. In a native rewrite, **prefer an App Intent** (`OpenURLIntent`-
style) so the action appears in Shortcuts and the share sheet without the user installing anything;
keep the iCloud-shortcut row only if `08` wants literal parity.
`[DECISION: shortcuts-intent]`

---

## Part V — Settings

### 14. Navigation model

Settings is the 5th tab. Every settings screen is an ordinary `NavigationStack` destination — pushing
deeper is a normal push, and the system back gesture pops one level, exactly like any other screen.
The tab's stack holds `Route.settings(SettingsRoute)` entries (`02-architecture.md` §5.5); the nested
enum is:

```
enum SettingsRoute: Hashable {
    case root, guide(GuideQuery), general, gestures, sorting, openInApp, filters,
         startup, legal, externalLinks, theme, themeMaker(editing: String?),
         appearance, appIcon, dataUse, stats, privacy, advanced, paywall
}
```

The **Guide** destination is heavy (a large bundled corpus) — load it lazily.

### 15. Settings root

A search bar at the top: placeholder **`"Ask a question..."`**, autocorrect on, clears its text on
submit. Submitting non-empty text pushes `.guide(.search(text))`.

Below it, one grouped list titled **`"Settings"`**:

| # | Row | Glyph | Destination / action |
|---|---|---|---|
| 1 | **Guide** | book | `.guide(.index)` |
| 2 | **General** | gear | `.general` |
| 3 | **Theme** | moon | `.theme` |
| 4 | **Appearance** | eye | `.appearance` |
| 5 | **App Icon** | paintbrush | `.appIcon` — **only rendered when the OS reports alternate-icon support** |
| 6 | **Account** | person | `Route.accounts` |
| 7 | **APPNAME Plus** | star | `.paywall` — the Settings → APPNAME Plus screen defined by `05-monetization.md` §6.4. **Not a gate:** this row is always visible and always free to open, for subscribers and non-subscribers alike; it is the paywall's entry point, not something the paywall protects. |
| 8 | **Data Use** | waveform | `.dataUse` |
| 9 | **Stats** | chart.bar | `.stats` |
| 10 | **Privacy** | lock | `.privacy` |
| 11 | **Advanced** | wrench | `.advanced` |
| 12 | **Patch Notes** | arrow.down.app | Presents the update-info modal (§21.1) — this is the app's changelog surface |
| 13 | **Request A Feature** | arrow.triangle.pull | Navigates **in-app** to the owner's chosen feedback destination, sorted `top?t=all` (not an external link). The original targeted its own community; `APPNAME` must not, per the clean-room rule. `[DECISION: subscribe-nag-removed]` |

**Footer text** (not a control), centered, three lines:
```
APPNAME: <version>
Build #<build>
```
The original's third line reports an over-the-air update group, which has no meaning in a native app —
drop it. `[DECISION: drop-update-group-footer]`

**List row separator quirk to *not* reproduce.** The original's list component computes separators from
the *unfiltered* index, so a list whose last **visible** row is followed by a hidden row incorrectly
draws a trailing separator. Do not port the bug. `[DECISION: list-divider-index]`

### 16. General

A grouped list titled **`"General"`** with 7 navigation rows, no inline controls:

| # | Row | Glyph | Destination |
|---|---|---|---|
| 1 | Gestures | hand | `.gestures` |
| 2 | Post & Comment Sorting | arrow.up.arrow.down | `.sorting` |
| 3 | Filters | line.3.horizontal.decrease | `.filters` |
| 4 | Open in APPNAME | arrow.up.forward.app | `.openInApp` |
| 5 | App Startup | arrow.clockwise | `.startup` |
| 6 | Legal | doc.text | `.legal` |
| 7 | External Links | link | `.externalLinks` |

#### 16.1 Gestures

**Section "Navigation":**

| Row | Control | Key | Default | Effect |
|---|---|---|---|---|
| **Swipe Anywhere to Navigate** | Toggle | `swipeAnywhereToNavigate` | `false` | Enables the anywhere-back gesture; **disables all right-swipe row actions app-wide**, leaving only left-swipe actions (`04a` §7.1) |

`[GATE: gate.gestures]` — the whole Gestures screen is the gate's home. It always renders with the
current values and a Plus badge; when locked, tapping any row (the toggle above or the eight
assignment pickers below) opens the paywall. The defaults keep working; only *changing* them is paid
(`05-monetization.md` §3.1 row N, §4).

**Section "Post Swipe Actions"** — 4 picker rows, each opening a menu of the same option set:

| Row label | Key slot | Default |
|---|---|---|
| Long Right Swipe | `farRight` | Downvote |
| Short Right Swipe | `right` | Upvote |
| Long Left Swipe | `farLeft` | Bookmark |
| Short Left Swipe | `left` | Mark as Read |

Post options, in picker order: **Upvote · Downvote · Mark as Read · Bookmark · Share · Disabled.**

**Section "Comment Swipe Actions"** — the same four rows.

| Row label | Key slot | Default |
|---|---|---|
| Long Right Swipe | `farRight` | Downvote |
| Short Right Swipe | `right` | Upvote |
| Long Left Swipe | `farLeft` | Bookmark |
| Short Left Swipe | `left` | Reply |

Comment options, in picker order: **Upvote · Downvote · Reply · Bookmark · Share · Collapse ·
Collapse Thread · Disabled.**

**Swap-on-conflict:** assigning an action already held by another slot of the same set swaps the two
slots' values. `Disabled` is exempt and may occupy multiple slots. Post and comment maps never
interact.

#### 16.2 Post & Comment Sorting

`[GATE: gate.sortMemory]` — **OWNER row, default gated.** Every control on this screen persists a
sort *preference*; changing sort on any individual page is free forever (`05-monetization.md` §3.1
row O, §4). When locked, the screen renders with its current values and a Plus badge and any row tap
opens the paywall.

**Section "Posts":**

| Row | Control | Key | Options | Default |
|---|---|---|---|---|
| Default sort | Picker | `defaultPostSort` | Default, Best, Hot, New, Top, Rising | `Default` |
| Default top sort | Picker — **only shown when Default sort is Top** | `defaultPostSortTop` | Hour, Day, Week, Month, Year, All Time | `All Time` |
| Apply sort to home | Toggle | `sortHomePage` | — | `false` |
| Remember subreddit sort | Toggle | `rememberPostSubredditSort` | — | `false` |

Below the section, **only** when remembering is on **and** at least one subreddit is remembered, a
button: **`"Clear custom post sorts (N subs)"`**. Tapping deletes every per-subreddit post-sort entry
and resets the displayed count to 0.

**Section "Comments":**

| Row | Control | Key | Options | Default |
|---|---|---|---|---|
| Default sort | Picker | `sorting.defaultComment` | Default, Best, New, Top, Controversial, Old, Q&A | `Default` |
| Remember subreddit sort | Toggle | `rememberCommentSubredditSort` | — | `false` |

Plus the matching **`"Clear custom comment sorts (N subs)"`** button under the same conditions.

**Note on the count of comment sorts.** This picker has **seven** entries because the first is the
`default` *sentinel* meaning "send no `sort` parameter and let Reddit choose". The in-post sort menu
(`04a` §16.3) offers the **six** real sorts only — Best, New, Top, Controversial, Old, Q&A — and never
a "Default" entry. Both statements are true and are not in conflict
(`[DECISION: comment-sort-six]`).

Per-subreddit storage keys are lowercased subreddit names in three dictionaries:
`postSubredditSort`, `postSubredditSortTop`, `commentSubredditSort`. Resolution order and write-back
behavior: `04a` §16.4.

#### 16.3 Filters

Top-of-page description, verbatim:

> **"Filters only apply to items in the main feeds and subreddits. They do not apply to search results
> or user profiles. Excessive filtering may make load times slower because more items have to be
> loaded before showing results."**

`[GATE: gate.filters]` — the whole Filters screen is the gate's home: the text filter list, the
subreddit filters (including the duration picker from the post long-press menu), global hide-seen, the
per-page hide-seen override, the hidden-posts list, and "Hide Post". When locked, the screen renders
its explanatory copy and a locked state; existing filter data is **preserved and simply not applied**
(`05-monetization.md` §3.1 row P, §4). "Mark as Seen On Scroll" and the seen-dimming it drives are
**free** — only *filtering by* seen state is gated.

**Section "Post Settings":**

| Row | Control | Key | Default | Notes |
|---|---|---|---|---|
| Hide Seen Posts | Toggle | `filters.hideSeenPosts` | `false` | Global hide-seen. `[GATE: gate.filters]` |
| Mark as Seen On Scroll | Toggle | `filters.markSeenOnScroll` | `false` | **Takes effect immediately — no restart, no alert.** The rewrite reads the setting reactively. When the new value is `true` **and** hide-seen is also on, show a non-blocking informational note: `"You may notice slower loads with this setting enabled because all the hidden posts still have to be loaded in the background."` `[DECISION: mark-seen-live]` |

If any per-route hide-seen override disagrees with the global value, a text block lists those routes
verbatim. There is **no UI here to create** an override — only to see ones created from a feed's "…"
menu.

**Section "Text Filter List":** a multiline text field bound to `filterText` (default `""`), with this
description below, verbatim:

> **"Words or phrases can be separated by commas or new lines. If a post or comment contains items on
> this list, it will be hidden from view. Post filter text includes the title, author username, post
> text, poll options, link titles, and link descriptions. Comment filter text includes the comment
> text, and author username. Text filtering is case insensitive and won't match subwords. For example,
> 'cat' won't match 'caterpillar'."**

**Section "Filtered subreddits":** explanatory text, verbatim:

> **"You can filter subreddits by long-pressing posts on /r/all or /r/popular. Once filtered,
> subreddits will appear here. Delete the filter to begin seeing posts from the subreddit again."**

Below it, **only if any exist**, a list of filtered subreddits: reddit glyph, name, and either
**`"Forever"`** or **`"Until <locale date>"`**. Tapping a row confirms (`"Stop filtering /r/x?"`) and
removes the entry.

**Section "Hidden posts":** explanatory text, verbatim:

> **"You can hide individual posts by long-pressing them and choosing 'Hide Post'. Hidden posts are
> kept locally (not on Reddit) and automatically start showing again one month after they were hidden.
> Tap a post here to unhide it sooner."**

Below it, **only if any exist**, a list from the `hidden_posts` table showing the post title and
`r/<subreddit> · Expires <date>`. Tapping confirms (`"Unhide this post?"`) and deletes the row.

**There is no "Smart Post Filter" / AI filter section.** It does not exist in the original's code and
is not being built.

#### 16.4 Open in APPNAME

**Section "APPNAME Shortcut":**

| Row | Control | Effect |
|---|---|---|
| **Open in APPNAME** | Informational row (app-shortcut glyph) | **No install step.** `APPNAME` ships an `OpenRedditLinkIntent` App Intent, so "Open in APPNAME" appears in Shortcuts, the share sheet and Spotlight automatically (§13). The row explains this and offers a button that opens the Shortcuts app; the original's iCloud-Shortcut link is **not** reproduced. `[DECISION: shortcuts-intent]` |

Description below, verbatim (with the product name substituted):

> **"'Open in APPNAME' is already available in the share sheet and in the Shortcuts app. Use it to
> open Reddit links from anywhere on your iPhone directly in APPNAME."**

**Section "Clipboard Links":**

| Row | Control | Key | Default |
|---|---|---|---|
| **Read Links from Clipboard** | Toggle | `links.readClipboard` | `false` (`[DECISION: clipboard-read-default]`) |

Description, verbatim:

> **"APPNAME can automatically detect Reddit links from your clipboard and prompt you to open them.
> Enabling this will cause iOS to ask you each time if you want to allow APPNAME to read your
> clipboard. To disable the duplicate prompt, you can go to APPNAME in the iOS Settings app and change
> 'Paste from Other Apps' to 'Allow'."**

#### 16.5 App Startup

**Section "Startup":**

| Row | Control | Key | Options | Default |
|---|---|---|---|---|
| **Start APPNAME on this tab** | Picker | `startup.tab` | Posts, Inbox, Account, Search, Settings | `Posts` |

**Section "Startup URL"** (a section title, not a list row): a free-text field bound to
`startup.url`, **default `""` (empty)**. The original defaulted this to `"https://www.reddit.com/"`,
which silently defeated the initial-tab setting for every user who never touched it; the empty default
is the fix (`[DECISION: startup-url-default]`, `03-data-and-networking.md` §8.1). A non-empty valid
value **overrides** the initial-tab setting and opens directly to that URL. If the current value fails
Reddit-URL validation, red flag text appears below: **`"Invalid Reddit URL. This setting will be
ignored."`** The invalid value is still saved verbatim and simply ignored at launch (the app falls
back to the initial tab).

#### 16.6 Legal

A two-row list, both opening through the external-link opener (so they obey the browser choice):

| Row | URL |
|---|---|
| **Privacy Policy** | the app's own privacy-policy page |
| **End User License Agreement** | `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/` |

#### 16.7 External Links

| Row | Control | Key | Default |
|---|---|---|---|
| **Open links with** | Picker over the seven `BrowserChoice` values in §12 | `links.externalBrowser` | `.inApp` ("APPNAME") |
| **Open in reader mode** | Toggle — **only shown when the browser is APPNAME** | `links.readerMode` | `false` |

### 17. Appearance

Three grouped sections.

#### 17.1 Post Appearance Settings

| Row | Control | Key | Default | Notes |
|---|---|---|---|---|
| Make posts compact | Toggle | `postCompactMode` | `false` | iPhone-only build, so the original's "true on ≥768 pt" default collapses to false |
| Show thumbnails on right | Toggle — **only shown when compact mode is on** | `showThumbnailsOnRightSide` | `false` | |
| Show subreddit at top | Toggle | `subredditAtTop` | `false` | |
| Show subreddit icons | Toggle | `showSubredditIcon` | `true` | Also suppressed in low-data mode |
| Post title max lines | Picker 1–10 | `postTitleLength` | `2` | |
| Post text max lines | Picker 0–10 | `postTextLength` | `3` | `0` hides text previews |
| Link description max lines | Picker 0–30 | `linkDescriptionLength` | `10` | `0` hides the description |
| Show post flairs | Toggle | `showPostFlair` | `true` | |
| Blur spoilers | Toggle | `blurSpoilers` | `true` | |
| Blur NSFW | Toggle | `blurNSFW` | `true` | |
| Auto play videos | Toggle | `autoPlayVideos` | `true` | Mirrors the feed FAB |
| Focused video audio | Toggle | `feedVideoAudio` | `false` | Mirrors the feed FAB |
| Tapped video audio | Toggle | `tappedVideoAudio` | **mirrors `feedVideoAudio` until explicitly set once**, then sticks independently | `04b` §7.2 |
| Live text | Toggle | `media.liveText` | `false` | `04b` §3.3. Inert in the original; **actually implemented** in `APPNAME` via `ImageAnalysisInteraction`. `[DECISION: live-text-dead-setting]` |
| Tap to collapse | Toggle | `tapToCollapsePost` | `true` | Post-detail header |

**The "Enable split view" row is omitted** (iPhone-only build). **The "Show post summary" row does not
exist** — the setting is dead and not carried forward.

#### 17.2 Comment Appearance Settings

| Row | Control | Key | Default | Notes |
|---|---|---|---|---|
| Right side vote indicators | Toggle | `voteIndicator` | `false` | Toggling presents `.alert("Existing pages may need to be refreshed for this change to take effect.")` |
| Collapse AutoModerator | Toggle | `collapseAutoModerator` | `true` | Silent |
| Show flairs | Toggle | `commentFlairs` | `true` | Silent |
| Tap to collapse | Toggle | `tapToCollapseComment` | `true` | Same refresh alert |
| Collapse children only | Toggle | `collapseChildrenOnly` | `false` | Silent |

**The "Show comment summary" row does not exist.**

#### 17.3 Tab Appearance Settings

| Row | Control | Key | Default |
|---|---|---|---|
| Show username | Toggle | `showUsername` | `true` |
| Hide on infinite scroll | Toggle | `hideTabsOnScroll` | `false` |

On iOS 26+, implement "hide on infinite scroll" with `tabBarMinimizeBehavior(.onScrollDown)` rather
than a hand-rolled translate/fade. If parity with the original's exact 50 pt / 5 pt-delta / 200 ms
animation is required, note the divergence. `[DECISION: tab-hide-on-scroll]`

### 18. Theme

#### 18.1 Theme screen

```
ThemeScreen
├─ HStack { Text("Themes"); Spacer(); PillButton("Custom Theme +") → .themeMaker(editing: nil) }
├─ List { Toggle("Different Dark Mode Theme", isOn: $useDifferentDarkTheme) }
├─ if useDifferentDarkTheme { HStack { Button("Light"); Button("Dark") } }   // local edit target
├─ ThemeList
└─ Button("Explore Community Themes")   // in-app browse to a themes subreddit
```

**"Different Dark Mode Theme"** (`useDifferentDarkTheme`, default `false`):

- **Off:** a single theme applies at all times regardless of the system appearance. Selecting a theme
  writes the single `theme` key.
- **On:** separate themes are assigned to light and dark appearance. Two extra buttons — **Light** and
  **Dark** — appear above the list; they are a **screen-local, non-persisted** selector for which slot
  you are currently editing, initialized from the current system appearance (defaulting to light when
  the system reports unspecified). The list then reflects and edits either `theme` (light) or
  `darkTheme`.

**Resolution at render time:**

```
currentThemeKey = (systemColorScheme == .light || !useDifferentDarkTheme) ? theme : darkTheme
```

The app follows the system appearance **live, at every render** — it is not a one-time choice.

**Theme object resolution** from the key:
1. If the key names one of the built-in themes (§18.2) → use it directly.
2. Else look it up as a **custom theme** by name in the `custom_themes` table. If found and its
   `extends` field names a valid built-in, merge: base theme fields overridden by whatever the custom
   theme sets; unset custom fields fall through to the base.
3. Else fall back to the **default built-in theme** (§18.2).
4. Finally, any **live Theme Maker draft** is layered on top — this is how the maker live-previews
   across the whole app without saving.

Whenever the resolved theme's `statusBar` value changes, update the preferred status-bar style to
match. In SwiftUI, drive this with `.preferredColorScheme` on the root plus a
`UIHostingController`-level override where a genuinely independent status-bar style is required.

**Theme list:**

- **"Built-in Themes"** — one row per built-in, in the declared order below.
- **"Custom Themes"** — only rendered if any exist. Each row supports a **swipe-to-delete** action
  (trash glyph, `theme.delete`) and a long-press context menu with **`Edit`** and **`Delete`**:
  - `Edit` → `.themeMaker(editing: name)`.
  - `Delete` (from either path) → `.alert("Delete Theme", "Are you sure you want to delete '<name>'?",
    [Cancel, Delete(destructive)])`. On confirm, delete the row; **if the deleted theme was the active
    one, revert to the default built-in theme**. Note that a lapsed subscription never deletes a
    custom theme and never deselects an active one (`05-monetization.md` §3.3).
  `[GATE: gate.customThemes]`

**Theme row:** the theme name (leading, fixed 100 pt width), a horizontal **color band** (a thin strip
divided into equal segments, one per hex-color field of the theme in key order — non-color fields such
as the key, name, mode flags and the depth-color array are excluded automatically because they are not
valid hex strings), and a trailing checkmark in the theme's own `iconOrTextButton` color when selected.

#### 18.2 Built-in theme catalogue

**Clean-room constraint.** The original's twelve named themes and their specific hex palettes are
creative expression and **must not be reproduced**. `APPNAME` ships **6–8 new built-in themes with
new palettes, all free**, authored for this app in Phase 0 (`[DECISION: theme-count]`,
`02-architecture.md` §8.5). What is reproduced is the *structure*, which is functional data shape,
not expression:

| Structural element | Contract |
|---|---|
| Colour roles per theme | Exactly the **19** customisable roles listed in §18.3, in the five groups named there |
| Per-role renditions | Four: `light`, `dark`, `lightIncreasedContrast`, `darkIncreasedContrast` (`02-architecture.md` §8.1). A theme that specifies only `light`/`dark` inherits those for the contrast variants |
| Per-theme flags | `systemModeStyle` (`light` or `dark`) and `statusBar` (`light` or `dark`) |
| Comment depth colours | One fixed cycle of **6** colours, shared by every theme and not customisable even in the Theme Maker. The colours themselves are **new** — the original's cycle is not reused |
| Default theme | One of the new dark themes; its key is the fallback for an unresolved theme key |
| Declared order | The catalogue's declaration order is also the list order on this screen |

Every new palette must satisfy, at authoring time: text-on-background and text-on-tint meet WCAG AA at
both contrast settings; `background` is opaque (Reduce Transparency renders bars with it); `upvote`
and `downvote` are distinguishable without colour vision. These are the snapshot-test axes in
`02-architecture.md` §5.10 rule 5.

**All built-in themes are free to everyone.** The original's documentation labelled five of its twelve
as paid with a five-minute preview; its shipped code never enforced that, and `05-monetization.md`
§3.1 row Q and §3.3 forbid timed previews outright. There is therefore **no "premium themes" gate** —
built-in themes are free, and only *authoring* a theme is paid (`[GATE: gate.customThemes]`, §18.3).
`[DECISION: theme-count]`

**Liquid Glass caveat (2026 baseline).** Custom themes are the main hazard for the iOS 26+ material
system: standard components pick the material up automatically, and custom backgrounds on bars, tab
bars and toolbars fight the material and its scroll-edge effect. The theme layer must therefore:
- define light/dark variants **and increased-contrast variants** for every color role;
- avoid painting opaque custom backgrounds on navigation bars, toolbars and the tab bar — let the
  material show through and tint content instead;
- be tested against Reduce Transparency, Increase Contrast and Reduce Motion;
- apply `glassEffect` only to the few genuinely custom floating controls (the two feed FABs, the
  floating comment-nav button), never broadly.

#### 18.3 Theme Maker

Opened either fresh (**"Custom Theme +"**) or in edit mode (long-press a custom theme → **Edit**).
`[GATE: gate.customThemes]`

**On appear:** if editing an existing theme by name, load it into the live draft. Otherwise reset to a
new draft named `"Custom"` extending the **currently active base theme's key**.
**On disappear:** always reset the draft to a fresh `{ name: "Custom", extends: baseTheme.key }` — so
leaving the screen (back, or after saving) clears any unsaved edits from the live preview.

**Draft model:**
```
struct CustomTheme: Codable {
    var name: String
    var `extends`: BuiltInThemeKey
    // every visual field optional; unset falls through to the base at render time
    var text: HexColor?; var subtleText: HexColor?; var verySubtleText: HexColor?
    var background: HexColor?; var tint: HexColor?; var divider: HexColor?
    var buttonBg: HexColor?; var buttonText: HexColor?; var iconOrTextButton: HexColor?
    var iconPrimary: HexColor?; var iconSecondary: HexColor?
    var upvote: HexColor?; var downvote: HexColor?; var delete: HexColor?
    var showHide: HexColor?; var reply: HexColor?; var share: HexColor?
    var collapse: HexColor?; var bookmark: HexColor?; var moderator: HexColor?
    var systemModeStyle: ModeStyle?; var statusBar: ModeStyle?
}
```
The theme key and the comment depth colours **cannot** be customized. (The original carried an
`isPro` flag on every theme; it is not reproduced — built-in themes are all free and the gate lives on
*authoring*, not on selection.)

**Screen layout, top to bottom:**

1. **Theme Name** — free-text field bound to `name`.
2. **UI Mode** — two buttons, `light` / `dark`, bound to `systemModeStyle`. Description:
   **"Controls whether the picker, scroll bars, and splash screen display in light or dark mode."**
3. **Status Bar** — two buttons, `light` / `dark`, bound to `statusBar`. Description:
   **"Controls whether the system status bar at the top with the time and battery displays in light or
   dark mode."**
4. **Color Groups** — a horizontally scrolling row of 5 filter buttons in this order:
   **Text Hierarchy · Core Colors · Interactive Elements · Icons · Actions.** The default selected
   group on open is **Text Hierarchy**.
5. **Field list** for the selected group. Each row: label + description text (leading, shrinkable) and
   a trailing small circular swatch filled with the draft's value — or an outlined swatch when unset,
   in which case the label appends **`" (default)"`**. Tapping a row opens the color picker (§18.4).
6. **Static note**, verbatim: **"You can preview your changes by navigating to other tabs in the app.
   This screen will not reflect your changes to ensure usability. Changes will persist until you leave
   the Theme Maker."** This is literally true — the Theme Maker styles itself with the *base* theme,
   never the live draft.
7. **Save Theme** button.

**The 19 color fields, by group, with exact labels and descriptions:**

*Text Hierarchy*

| Field | Label | Description |
|---|---|---|
| `text` | Text | "Primary text items, post titles, headers, some icons" |
| `subtleText` | Subtle Text | "Non primary text elements like post details, comment sections, etc." |
| `verySubtleText` | Very Subtle Text | "Low importance text like text input placeholders" |

*Core Colors*

| Field | Label | Description |
|---|---|---|
| `background` | Background | "Background of most screens." |
| `tint` | Tint | "Background of popups, text inputs, button groups, low contrast borders" |
| `divider` | Divider | "Divider between items, high contrast borders, high contrast backgrounds like flairs, message bubbles, etc." |

*Interactive Elements*

| Field | Label | Description |
|---|---|---|
| `buttonBg` | Button Background | "Background of big primary action buttons like the floating next comment button" |
| `buttonText` | Button Text | "Text of big primary action buttons" |
| `iconOrTextButton` | Icon/Text Button | "Buttons that are just text without a container like navbar text buttons" |

*Icons*

| Field | Label | Description |
|---|---|---|
| `iconPrimary` | Primary Icon | "Keep this the same as Icon/Text Button. It does the same thing. Will probably be removed soon." |
| `iconSecondary` | Secondary Icon | "Keep this the same as Subtle Text. Off mode color for switches (poorly named), will probably be removed soon." |

*Actions* — nine fields: **Upvote, Downvote, Delete, Show/Hide, Reply, Share, Collapse, Bookmark,
Moderator**, each described as *"Color of the X button/slider/username and other X related elements."*

**Save flow:**
1. Blank or whitespace-only name → `.alert("Please enter a theme name")` and abort.
2. If a custom theme with that exact name already exists → confirm:
   `.alert("Another theme with this name already exists. Do you want to overwrite it?",
   [Cancel, Overwrite(destructive)])`.
3. Upsert into `custom_themes` keyed by the unique `name`.
4. Immediately make it the active theme.
5. `.alert("Theme saved successfully!")` with OK, which pops back.

Renaming a theme creates a **new** row (upsert is by name); the old name persists unless deleted.

#### 18.4 Color picker and slider

A bottom-sheet modal, tap-outside-to-dismiss, whose overlay collapses to zero height while the
keyboard is visible so it cannot block the hex field.

- Header: title **`"Color Picker"`** + a **`Done`** button.
- A 100×100 rounded preview swatch.
- A **HEX** field: max length 7, auto-uppercased, placeholder `#000000`. Typing a valid hex (the `#` is
  optional and prepended) commits immediately.
- Three custom horizontal **sliders** — R, G, B — range **0–255**, each with the corresponding pure
  color (`#FF0000` / `#00FF00` / `#0000FF`) as the filled track and `theme.divider` as the empty track,
  thumb tinted `theme.buttonBg`. Dragging updates the live preview continuously; releasing commits.
  These are **custom** controls, not the system slider.
- Hex field and sliders stay in sync: hex parses to RGB, RGB re-encodes to a 6-digit uppercase hex.

**Hex helpers — both fixed forward (`[DECISION: validateHex-bug]`):**
- `hexToRgb` handles the **3-digit** (`#RGB`), **6-digit** (`#RRGGBB`) **and 8-digit** (`#RRGGBBAA`)
  forms. The original handled only 6 digits and silently returned black for everything else; that
  produced invisible-black themes from perfectly valid input.
- `rgbToHex` produces uppercase `#RRGGBB`.
- `validateHex` is **properly anchored**: `^#(?:[0-9A-F]{3}|[0-9A-F]{6}|[0-9A-F]{8})$`,
  case-insensitive, whole-string. The original's alternation was unparenthesized, so `^#` bound only
  to the first branch and `$` only to the last, and any bare 6- or 8-hex run inside a longer string
  validated.

#### 18.5 Theme sharing and import

**Export format (new, not wire-compatible with the original).** A custom theme is shared by embedding
a **base64url-encoded** JSON payload inline in Reddit post/comment markdown, behind `APPNAME`'s own
sentinel and surrounded by newlines:

```
\n::appname-theme::<base64url(JSON of CustomTheme)>\n
```

- The payload is exactly the encoded `CustomTheme` — `name`, `extends`, plus whichever of the 19
  optional colour fields the user set — then base64url-encoded, so no brace, quote or newline ever
  reaches the markdown.
- **`APPNAME` neither emits nor imports the original's `::hydra-theme-import::{…}` format.** Staying
  wire-compatible would mean adopting a format defined by an AGPL project and interoperating with its
  community, which the clean-room rule forbids (`[DECISION: theme-import-format-compat]`).
- Detection scans for the sentinel and decodes the base64url run that follows it up to the next
  whitespace. Because the payload is encoded, the original's single-level-braces limitation does not
  exist: nested objects and braces inside string values are fine. A payload that fails to decode, or
  decodes to something that is not a `CustomTheme`, is treated as malformed (below).

**Attaching.** From the composer's paintbrush button (`04a` §16.5.1): pick one of the user's custom
themes, confirm via
`.alert("Attach Theme", "Do you want to attach the '<name>' theme to your text?", [Cancel, Attach])`,
and insert the sentinel string at the current selection, newline-wrapped.

**Detecting and importing.** Every rendered text node's raw string is scanned for the sentinel. Each
match is decoded, **stripped from the displayed text**, and rendered inline as a **theme card**:
rounded, 5 pt bordered, containing the theme name, the subtitle **`"APPNAME Theme"`**, and a colour
band preview. If the decoded object's `extends` field is not a string, or names no built-in theme,
the card is replaced by the text **`"Theme is invalid"`**.

Tapping the card presents `.alert("Import Theme", "Import '<name>' to your custom themes?")` with
three options:

| Button | Effect |
|---|---|
| **Cancel** | nothing |
| **Import** | upsert into `custom_themes` by name, then `.alert("\"<name>\" imported successfully!")` |
| **Import & Apply** | the same save, then immediately make it the active theme |

A malformed or undecodable payload is **silently swallowed** — no user-facing error — and the
sentinel text is still stripped from the display if the pattern matched.

`[GATE: gate.customThemes]` — the Theme Maker, saving or editing a custom theme, importing a shared
theme (both **Import** and **Import & Apply**), and the separate light/dark theme pairing. Previously
saved custom themes stay listed, stay selectable and stay applied when a subscription lapses.

### 19. App Icon

Listed on the Settings root and reachable **only** when the OS reports alternate-icon support
(`UIApplication.shared.supportsAlternateIcons`).

`[GATE: gate.appIcons]` — selecting any **non-default** alternate is the gated action. The grid always
renders in full, with a Plus badge on each alternate; tapping "Set as App Icon" on a locked alternate
opens the paywall. **Reverting to the default icon is always free**, so a lapsed subscriber is never
stuck with an icon they cannot change (`05-monetization.md` §3.1 row V, §4).

**Icon set — all-new artwork.** The original ships four icons by three named community artists, with
per-icon detail pages carrying artist bios, avatars and outbound links. None of that art or prose may
be reused. `APPNAME` ships **1 default + 3 alternates, authored for this app**, composed in Icon
Composer as layered documents so light/dark/clear/tinted variants are system-generated (iOS 26+), each
added to the *Alternate App Icon Sets* build setting so Xcode writes `CFBundleAlternateIcons`.
**The per-icon detail screen with its artist card is dropped entirely** — there are no artist bios, no
avatars and no external links anywhere in this screen. `[DECISION: app-icons-new-art]`

**Grid screen** (the only screen in this section):

- A 2-column grid of icon cards. Each card: a 90×90 rounded icon image, the icon's display name, and —
  when that icon is currently applied — a checkmark badge and a highlighted border. Alternates carry a
  `PlusBadge` while locked.
- Tapping a card **selects** it directly: it calls `UIApplication.shared.setAlternateIconName(_:)`
  (`nil` for the default). There is no push, no preview page and no separate "Set as App Icon" button.
- The change takes effect immediately with no restart. On failure: `.alert("Error setting app icon")`.
- Accessibility: each card is a button with a `selected` trait for the active icon.


### 20. Data Use, Stats, Privacy, Advanced

#### 20.1 Data Use

| Row | Control | Key | Default |
|---|---|---|---|
| **Use Low Data on Wi-Fi** | Toggle | `data.wifi` | `.normal` (off) |
| **Use Low Data on Cellular** | Toggle | `data.cellular` | `.normal` (off) |

Each toggle is simply `value == .lowData`. The **active** mode is chosen live from the current
connection type via `NWPathMonitor`; that computed value is not shown on this screen — it is consumed
by the media layer (`04b` §13).

Footer text, verbatim:

> **"Low data mode reduces the quality and amount of media that gets loaded when scrolling. For
> example, videos will not be loaded while scrolling and will only load when they are clicked on.
> Links will not load article images. Subreddit icons will be not be loaded."**

(The original's copy contains the grammatical slip "will be not be loaded". Fix it.)
`[DECISION: data-use-copy-typo]`

#### 20.2 Stats

`[GATE: gate.stats]` — **the whole Stats screen is gated** (`05-monetization.md` §3.1 row T, §4).
The Settings row stays visible; opening it while locked shows a `FeatureLockView` describing exactly
what is tracked, that all of it stays on the device, and the CTA. **The counters keep incrementing
while locked**, so the screen is full of real data the moment the user subscribes.

The original's documentation described Stats as paid with numbers obfuscated into asterisks for free
users; its `obfuscateNumber` / `obfuscateText` helpers are identity passthroughs, so nobody ever saw
an asterisk. **Neither behaviour is reproduced** — fake blurred data is a dark pattern and looks
broken; an honest locked screen is the replacement. `[DECISION: stats-obfuscation]`

**Data sources:** the GRDB tables `counter_stats` (one row per counter key) and `subreddit_visits`.

**Counter keys and where they increment:**

| Key | Incremented |
|---|---|
| `app_launches` | +1 once per cold start, after migrations complete |
| `app_foregrounds` | +1 at cold start **and** +1 on every subsequent transition to the active scene phase (so `app_foregrounds >= app_launches` always) |
| `scroll_distance` | Accumulated absolute scroll delta in points; **buffered during active scrolling and flushed only on drag end, momentum end, or teardown** — never mid-gesture |
| `posts_viewed` | +1 each time a post-detail screen is opened |
| `post_upvotes` / `post_downvotes` | +1 per non-neutral vote on a post |
| `comment_upvotes` / `comment_downvotes` | +1 per non-neutral vote on a comment |
| `posts_created` / `comments_created` | +1 per successful submission |
| (separate table) `subreddit_visits[<name>]` | +1 per mount of a **single, non-combined** subreddit feed; Home/popular/all/multireddit visits count for nothing |

All counters are `INSERT … ON CONFLICT DO UPDATE SET count = count + delta` — atomic in SQL, never
read-modify-write. **There is no reset button anywhere**, and the reset function is never called;
stats accumulate forever. `[DECISION: stats-no-reset]`

**Screen, top to bottom (one scroll view):**

**1. Hero.** Title **"Your APPNAME Journey"**. Subtitle:
`"You've been using APPNAME for <prettyTimeSince(installDate)>!"` where the install date comes from the
OS (fetched asynchronously on appear) and the formatter renders the single largest unit.

**2. "Your Reddit Activity"** — a grid of **5** stat cards (glyph, big value, title, subtitle):

| Card | Value | Subtitle |
|---|---|---|
| **Posts Explored** | `posts_viewed` | `"Knowledge acquired"` |
| **Distance Scrolled** | formatted distance (below) | `"That's about <scrollInches / 6.5> banana(s)!"` |
| **Upvotes Given** | `post_upvotes + comment_upvotes` | `"<post_upvotes> post(s), <comment_upvotes> comment(s)"` |
| **Downvotes Given** | `post_downvotes + comment_downvotes` | same shape |
| **Content Created** | `posts_created + comments_created` | same shape |

**Distance math:** `scrollInches = scroll_distance / 160` (a ~160-DPI-normalized point→inch
assumption). Format: if the equivalent is under **1000 m**, show `"<feet>ft / <meters>m"` with **0**
decimals; otherwise `"<miles>mi / <km>km"` with **1** decimal. `scrollKm = scrollInches × 0.0000254`.

**3. "Your Usage Patterns"** — a card of rows, each shown only if its condition holds:

| Row | Value | Shown |
|---|---|---|
| **App Launches** | `app_launches` | always |
| **Opens per Day** | `app_foregrounds / daysSinceTrackingStarted`, **2 decimals** | always |
| **Total Opens** | `app_foregrounds` | always |
| **Upvote Ratio** | `positiveVotes / totalVotes × 100` | only when any votes exist |

`daysSinceTrackingStarted` uses `max(installDate, trackingEpoch)` where the original hard-codes
**2025-08-12** as the earliest date stats are considered to have been tracked, even for older installs.
For a new app, set `trackingEpoch` to the rewrite's own first-release date.
`[DECISION: stats-tracking-epoch]`

**4. "Your Favorite Communities"** — shown only when at least one subreddit has been visited. The
**top 10** by visit count, descending; each row: rank `#N`, `r/<name>`, a proportional progress bar
(`visits / maxVisits`, where `maxVisits` is the #1 entry's count), and the raw visit count.

**5. "Achievements Unlocked"** — shown only when at least one is unlocked. **No progress indicators**;
each simply appears once its threshold is met:

| Achievement | Threshold |
|---|---|
| **Dedicated User** | `app_launches >= 50` |
| **Scroll Master** | `scrollKm >= 5` |
| **Positive Vibes** | upvote ratio `>= 80` **and** total votes `>= 10` |
| **Content Creator** | `posts_created >= 10` |
| **Commentary Master** | `comments_created >= 10` |
| **Explorer** | unique subreddits visited `>= 10` |
| **Knowledge Seeker** | `posts_viewed >= 100` |

**6. "Fun Facts"** — a dynamically built list of emoji-prefixed sentences, each included only when its
inputs are non-zero and well-defined:

| Fact | Formula | Precision | Condition |
|---|---|---|---|
| 🌙 % of the way to the moon | `scrollKm / 384 400 × 100` | 7 decimals | any scrolling has happened |
| 🏃 marathons scrolled | `scrollKm / 42.195` | 5 decimals | any scrolling |
| 🔄 return rate | `app_foregrounds / app_launches` | 1 decimal | only if foregrounds > launches |
| 📰 posts read per post created | `posts_viewed / posts_created` | 1 decimal | only if both > 0 |
| 👀 posts viewed per foot scrolled | `posts_viewed / (scrollInches / 12)` | 2 decimals | only if both > 0 |
| 👀 posts clicked per open | `posts_viewed / app_foregrounds` | 2 decimals | only if both > 0 |
| 👍 upvote : downvote ratio | `positive / negative` | 2 decimals | only if both > 0 |
| 💬 comment : post vote ratio | `commentVotes / postVotes` | 2 decimals | only if both > 0 |

**Milestone easter eggs.** For each of the **9** raw counters (`posts_viewed`, `posts_created`,
`app_foregrounds`, `app_launches`, `comments_created`, `post_upvotes`, `post_downvotes`,
`comment_upvotes`, `comment_downvotes`), if its value **exactly equals** one of these numbers, append
an extra fun-fact line in the shape `"<emoji> You've <verb> <num> <noun> - <description>"`:

| Number | Emoji | Description |
|---|---|---|
| 34 | 🍆 | "There should be a rule about this." |
| 69 | 😏 | "Nice." |
| 420 | 🌿 | "Blaze it." |
| 1337 | 🤖 | "You're elite." |
| 1000 | 🎉 | "You're a pro!" |
| 10000 | 🎉 | "You're a pro!" |
| 31337 | 🤖 | "You're elite." |
| 80085 | 🍒 | "You're a pro!" |
| 100000 | 🎉 | "You're a pro!" |

Because it is an exact-equality check, each fires transiently for exactly one value of the counter and
never again.

**7. "Serious Facts"** — two fixed lines, always shown:
- **"🔒 All these stats are stored locally on your device. They are not sent to any servers."**
- **"❤️ APPNAME is built in spare time as a passion project. Thanks for using it!"** (owner's own
  wording; the original's sentence is its prose and is not reused — `[DECISION: guide-prose-rewrite]`)

No number on this page uses thousands separators beyond what the default locale formatter produces.

#### 20.3 Privacy

A single toggle:

| Row | Control | Key | Default |
|---|---|---|---|
| **Allow APPNAME to report errors** | Toggle | `privacy.errorReporting` | **`true`** (opt-out, not opt-in) |

**No restart alert.** The original read the key once at launch and demanded a restart; `APPNAME` reads
it reactively and enables/disables the reporter live, so toggling takes effect immediately and the
alert is gone. `[DECISION: error-reporting-default]`

Footer text, verbatim:

> **"If APPNAME encounters an error (e.g. a crash or loading issue), it will automatically upload an
> error log. This log includes a stack trace to pinpoint the issue, your Reddit username (if logged
> in), and device details like phone model and available RAM. These logs help keep APPNAME bug free!"**

This is the app's **only** crash/analytics control. There is no separate analytics toggle and no
incognito mode. The reporter is disabled in debug builds and whenever this key is `false`, and the
whole dependency is present only if `[DECISION: sentry-or-not]` resolves to "include". Per the 2026
baseline, pair a
symbolicating crash reporter with the new `MetricManager` (iOS 27+) for hitch/hang/launch/memory
telemetry, and gate **both** on this one toggle. Note the breaking MetricKit change: the old
scroll-hitch metric type is gone; use the new hitch-time metric or the app crashes on launch.

#### 20.4 Advanced

**Section "Caching":**

| Row | Label | Behavior |
|---|---|---|
| **Clear Image Cache (N MB)** | live on-disk size, recomputed whenever this screen regains focus | Clears **immediately**, presents `.alert("Cache Cleared", "The image cache has been cleared.")`, and zeroes the displayed size right away |
| **Clear Video Cache (N MB)** | live native cache size | **Deferred.** Sets the persisted `media.videoCacheClearRequested` flag and presents `.alert("The video cache will be cleared next time you restart APPNAME.")`. The actual clear runs at the next cold start, before anything that could mount a player, and resets the flag regardless of outcome. |

Caps and per-source cacheability rules: `04b` §12.

**Section "Self Hosted Server" — not built.**

The original exposes a "Use Custom Server" toggle plus a URL field validated against a health endpoint,
used only by the in-app documentation search's embedding and question endpoints. Guide search is
rebuilt fully on-device (§21.3), the backend is the original project's infrastructure, and the setting
carries a known bug (the URL is persisted and used even when the toggle is off). **The section, its
two keys (`useHydraServer`, `customHydraServerUrl`) and the `/api/status` health check do not exist in
`APPNAME`.** `[DECISION: self-hosted-server-row]`

**Also not present:** a "Customer ID" row. The original's docs describe one; the code has none.

### 21. Guide, About, startup modals

#### 21.1 Startup modals

A small priority-ordered queue evaluated **once, at most, per app session**, guarded so it never
re-evaluates on re-render. Only the **single highest-priority** candidate whose condition is true is
shown — never two in one session.

| Priority | Id | Condition | Behavior |
|---|---|---|---|
| 1 | `updateInfo` | The stored `lastSeenUpdate` value differs from this build's hard-coded update key | A "What's new" sheet listing the current release's feature entries (title + description pairs). On dismiss, store the current key so it does not reappear until the next release. Also presented on demand from Settings → **Patch Notes**. |
| 2 | `promptForReview` | `app_launches > 30` **and** `storeReviewRequested` is not yet true | The review prompt (below) |

**Review prompt.** A centered card containing: the app icon, 5 gold stars, the headline
**"Enjoying APPNAME?"**, the subtitle **"A quick rating helps a ton"**, body copy, **"Maybe later"** and
**"Rate now"** buttons, and a small heart + **"Thank you for supporting indie software"** footer.

- **"Rate now"** invokes `requestReview` from StoreKit's SwiftUI environment (`@Environment(\.requestReview)`),
  **not** an `itms-apps://` write-a-review deep link. The deep link bypasses Apple's own throttling and
  is discouraged; the system action respects it. The card then switches to a **"Thanks for the
  support!"** state. `[DECISION: review-prompt-mechanism]`
- **"Maybe later"**, the ✕, or tapping the dimmed backdrop all dismiss.
- **Every** dismissal path — including after rating — sets `flags.reviewRequested = true`, permanently
  suppressing our own pre-prompt card for the life of the install. It is never shown again, win or
  lose. (The system's own rate-limiting is what governs whether `requestReview` actually renders
  anything; we do not hand-roll a second throttle on top of it. `[DECISION: startup-modals]`)

**Community-subscribe nudge — not built.** The original ships a third, independently gated overlay
asking the logged-in user to subscribe to its own support subreddit, on a 365-day per-account
cooldown. `APPNAME` ships **no community nag modal of any kind**: it is pure noise, and the original's
targets its own subreddit, which is also a clean-room concern. The per-account timestamp key
(`lastAskedToSubscribeToHydraClient-<userId>`) is not carried over.
`[DECISION: subscribe-nag-removed]`

#### 21.2 About / version

There is **no dedicated About screen.** Version and build are the footer text on the Settings root
(§15). The closest thing to a changelog is the **Patch Notes** row, which presents the same update
modal that auto-appears once per release.

#### 21.3 Guide (in-app documentation browser)

**All Guide prose must be written from scratch.** The original's ~40 documentation articles are its own
copyrighted text and additionally describe features that no longer exist (a paid tier, AI summaries, AI
filters, push notifications). Reuse **none** of it. `[DECISION: guide-prose-rewrite]`

**Structure to keep.** Four mutually exclusive states, evaluated in this priority order:

| Priority | Query | Renders |
|---|---|---|
| 1 | `?doc=<key>` | a single article |
| 2 | `?category=<name>` | that category's article list |
| 3 | `?search=<text>` | the search result list (no answer card — see below) |
| 4 | none | the categories index |

A persistent search bar sits above all four; submitting non-empty text **replaces** (does not push) the
route with a `?search=` query, so repeated searches do not pile up history; clearing it replaces back
to the index.

**Categories index** — a list titled **"Categories"**, each row showing a name and a description. The
original ships 11 categories over ~40 articles; the rewrite ships a **much smaller, hand-written help
section of 10–14 short topics** covering only the feature surface that actually exists
(`[DECISION: guide-included-or-not]`). Category structure (new prose required for every entry):

| Category | Covers |
|---|---|
| Basics | getting started, accounts & login, navigation |
| Browsing | posts, comments, subreddits, search, gallery mode |
| Interactions | voting, saving, sharing, downloading media, posting, commenting |
| Gestures | swipe actions and navigation gestures |
| Filters | text filters, hiding content, organizing feeds |
| Sorting | sort options and appearance settings |
| Themes | themes, custom themes, app icons |
| Messages | inbox and private messages |
| Advanced | stats, Live Text, external links |
| Settings | a walkthrough of every settings screen |
| Troubleshooting | common issues and tips |

Drop the original's categories for the removed features. Keep a dedicated **"Page Not Found"** article
rendered whenever an unresolved article key is requested.

**Article view.** Render the article's markdown through the same Reddit-flavored markdown pipeline used
for post and comment bodies (`02-architecture.md` §9). Internal `appname://…` deep links written as
markdown links resolve through `RedditLink` / `RouteResolver` like any other link. Guide pages are the
one place where **inline text selection is enabled** (`.textSelection(.enabled)`), because there is no
tap-to-collapse gesture to lose it to (`02-architecture.md` §9.5).

**Search — fully on-device, lexical (SQLite FTS5 + BM25).**

There is **no embedding model, no vector index, no cosine similarity and no network call** anywhere in
Guide search. The original computed cosine similarity against a baked-in vector matrix but fetched the
*query's* embedding from its own backend, so its "offline search" never actually worked offline; with
the backend dropped (§20.4) the embedding approach has no query side left. `APPNAME` replaces it with
a plain lexical index, which is entirely offline, needs no model, and is more than good enough for a
10–14-topic help corpus (`02-architecture.md` §11.7, `03-data-and-networking.md` §9.6).

| Step | Contract |
|---|---|
| Corpus | The help articles ship as bundled Markdown, each with a key, title, description and body |
| Index | A SQLite **FTS5** table at `Application Support/APPNAME/guide.sqlite`, built once at first launch and rebuilt whenever the bundled corpus version changes. Columns: `key` (unindexed), `title`, `description`, `body` |
| Query | `SELECT … FROM guide_fts WHERE guide_fts MATCH ? ORDER BY bm25(guide_fts, 10.0, 4.0, 1.0) LIMIT 5` — title weighted above description, description above body |
| Tokenisation | FTS5's `unicode61` tokenizer with `remove_diacritics 2`; the raw query is escaped and each term suffixed with `*` so prefix matching works while typing |
| Selection | Top **5** results, in BM25 order |
| Degenerate input | An empty or whitespace-only query returns an empty result immediately and issues no statement |
| Performance | Trivial at this corpus size; no Accelerate, no matrix maths, no background index build after the first launch |

**The AI "ask a question" answer card is not rebuilt.** The original sent the query plus the text of
the top 3 matched articles to a hosted model and rendered a markdown answer above the results. With no
backend and no AI features in v1 (`[DECISION: ai-removed]`), the search view renders **only** the
result list. `[DECISION: guide-ai-answer-drop]`


The Settings-root search bar is simply a shortcut into this same search state.

---

### 22. Settings persistence and startup

#### 22.1 Backends

| Store | Used for |
|---|---|
| Typed settings store (`UserDefaults`-backed, or a small GRDB key-value table for large values) | Every scalar preference in this document. There is **no** schema-version/migration mechanism — every key is read with an inline default. **The canonical key names, types and defaults are the namespaced `APPNAME` keys in `03-data-and-networking.md` §8.1**; where a table in this document still shows the original's flat key (e.g. `postCompactMode`), that is §8.1's "Legacy key" column and `post.compactMode` is the real key. `[DECISION: settings-key-rename]` |
| **Keychain** | The per-account Reddit session cookies (§2.5) and the cached entitlement snapshot (`05-monetization.md` §5.5, `03-data-and-networking.md` §7.4). Never an ordinary preference. |
| **GRDB** (`Application Support/APPNAME/app.sqlite`, WAL) | Anything that is a dataset rather than a scalar: seen posts, hidden posts, drafts, custom themes, counter stats, subreddit visits. Schema and indexes in `03-data-and-networking.md`. |

Six tables, each with an autoincrement primary key, `createdAt` / `updatedAt`, a **unique index on the
natural key**, and indexes on the timestamps for insertion-order pruning:

| Table | Natural key | Extra columns |
|---|---|---|
| `seen_posts` | `postId` | — (existence is the flag) |
| `hidden_posts` | `postId` | `title`, `subreddit`, `expiresAt` (indexed) |
| `drafts` | `key` | `text` |
| `custom_themes` | `name` | `data` (encoded `CustomTheme`) |
| `counter_stats` | `key` | `count` |
| `subreddit_visits` | `subreddit` | `count` (default 1) |

Every write is an upsert on the natural key. Create all six directly with their final shape; the
original's six additive migrations do not need replaying.

#### 22.2 Maintenance

Run once per cold start, deferred past the first frame so it never blocks first paint, in this order:

1. **Seen posts** — if the row count exceeds **5 000**, delete the oldest by insertion order down to
   exactly 5 000.
2. **Hidden posts** — hard-delete every row whose `expiresAt` is in the past. No count cap.
3. **Drafts** — if the row count exceeds **100**, delete the oldest down to exactly 100.

`custom_themes`, `counter_stats` and `subreddit_visits` are **never pruned** — custom themes because
the user created them explicitly, the other two because they are meant to be permanent tallies.
`subreddit_visits` grows with the number of distinct subreddits ever visited; that is accepted.

#### 22.3 Startup order

1. **Before any UI:** initialize crash reporting (gated on `privacy.errorReporting`, default on,
   disabled in debug, read reactively thereafter); run the deferred video-cache clear if its flag is
   set (must complete before anything that could mount a player); open the database, run migrations
   and create/verify the schema; lock orientation to portrait-up.
2. **Splash:** the app body renders nothing until the database is ready and the account session has
   been restored. While the account restore is in flight, show a full-screen splash (theme-aware
   image + a centered spinner offset ~10 % below center), which is also what dismisses the launch
   screen.
3. **Once the database is ready** (independently of the splash): increment `app_launches` **and**
   `app_foregrounds` by 1 each, schedule DB maintenance after the first interaction, and register a
   scene-phase observer that increments `app_foregrounds` again on every transition to active.
4. **Once the session is restored:** dismiss the splash, evaluate the startup-modal queue (§21.1), and
   select the initial tab from `initialTab`, overridden by a valid `startupURL`.
5. **No network call happens before the UI renders.** The entire cold path is local.

**Hard gates from the iOS 27 SDK:** the app **must** adopt the scene-based lifecycle or it will not
launch, and it **must** ship a launch screen or be rejected.

---

## 23. Swift Testing cases

### 23.1 Login and session

| Test | Assertion |
|---|---|
| `loginAllowListMatchesFourSubstrings` | Each of the four allowed substrings keeps the flow open; any other URL completes the login |
| `cookiePollDetectsSessionCookie` | Completion fires within one 500 ms tick of the cookie appearing |
| `bothDetectorsGuardedByLatch` | Completion runs exactly once when both fire |
| `usernameMismatchThrows` | The out-of-sync error |
| `missingTokenThrows` | The token error |
| `suspendedAccountMayLogIn` | The "allow suspended" path succeeds |
| `anyFailureTriggersExpiryAlertAndLogout` | And returns failure |
| `cancelRestoresPreviousSession` | Cookies and token restored |
| `sessionCookieGivenLongExpiryWhenMissing` | now + 10 000 days, written at most once per app session per account |
| `logoutWritesStaleCookieBeforeClearing` | Ordering assertion |
| `removeAccountDeletesKeychainEntryAndRewritesList` | And logs out first when it is the active account |
| `logoutKeepsAccountListAndBlobs` | Switchable back in |

### 23.2 Inbox

| Test | Assertion |
|---|---|
| `unreadCountCountsOnlyNewItems` | From a single page |
| `pollSkipsWhenNoToken` | Count unchanged, no request |
| `pollIntervalIsSixtySeconds` | And runs once immediately on login |
| `pollTornDownOnUserChange` | No timer after logout |
| `badgeZeroShowsNoBadge` | Never a literal "0" |
| `toggleAdjustsCountOptimistically` | ±1 |
| `onlyRepliesAndMessagesKept` | All other kinds dropped |
| `markAllSuccessDelaysOneSecondBeforeRefresh` | Timing |

### 23.3 Search

| Test | Assertion |
|---|---|
| `subredditQueryRewrite` | `"pics"` → `"/r/pics"`; `"/r/pics"` → `"/r/pics"`; `"r/pics"` → `"/r/pics"`; `"/pics"` → `"/r/pics"` |
| `userSearchDoesNotPaginate` | A cursor yields an empty page immediately |
| `searchFiresOnlyWhenTextChanged` | Repeated blur/submit with unchanged text issues one request |
| `scopeChangeRefires` | Same text, new scope |
| `emptyTextClearsResults` | And issues no request |
| `trendingExcludesSubscribedAndHome` | Filter behavior |
| `quickSearchDebounceIsFiveHundredMs` | Timing |
| `quickSearchStaleResultsDiscarded` | Token monotonicity |
| `quickSearchEmptyShowsFavoritesThenSubscriptions` | Order preserved |
| `exactMatchResolvesPrivateAndBanned` | Still yields a Go-to row |
| `returnKeyWithExactMatchNavigates` | Without requiring a tap |

### 23.4 Settings model

| Test | Assertion |
|---|---|
| `everyKeyHasTheDocumentedDefault` | A table-driven test over the full §17/§16 key list |
| `swapOnConflictPosts` | And comments, independently |
| `disabledMayOccupyMultipleSlots` | No swap |
| `defaultTopSortRowHiddenUnlessTop` | Visibility rule |
| `readerModeRowHiddenUnlessInternalBrowser` | Visibility rule |
| `thumbnailSideRowHiddenUnlessCompact` | Visibility rule |
| `startupURLInvalidIsSavedButIgnored` | Value persists; launch falls back |
| `clearCustomSortsRemovesOnlyMatchingKeys` | Post keys vs comment keys |

### 23.5 Theme

| Test | Assertion |
|---|---|
| `resolutionIgnoresDarkSlotWhenToggleOff` | Single-theme mode |
| `resolutionFollowsSystemWhenToggleOn` | Live, per render |
| `customThemeMergesOverBase` | Unset fields fall through |
| `unknownKeyFallsBackToDefault` | The default built-in theme |
| `draftLayeredOnTop` | Live preview |
| `deletingActiveThemeRevertsToDefault` | The default built-in theme |
| `saveRejectsBlankName` | Whitespace-only too |
| `saveOverExistingNamePrompts` | And overwrites on confirm |
| `renameCreatesNewRow` | Old name persists |
| `colorBandExcludesNonHexFields` | Name/key/mode/depth-array excluded |
| `hexToRgbSupportsThreeSixAndEightDigits` | `#fff`, `#ffffff` and `#ffffffff` all decode; garbage throws rather than returning black |
| `rgbToHexUppercase` | Round-trip |
| `validateHexIsProperlyAnchored` | Rejects `"zz#ffffff"` and `"#gggggg"`; accepts `#fff`, `#ffffff`, `#ffffffff` |
| `themeTokenRoundTrip` | Encode → detect → decode yields the same theme |
| `themeTokenSurvivesNestedBraces` | A theme name containing `{`/`}` round-trips, because the payload is base64url-encoded |
| `invalidExtendsRendersInvalidCard` | `"Theme is invalid"` |
| `malformedJsonIsSilentlyStripped` | No error, text still cleaned |
| `pulseColorRedHeuristic` | Hue 10°/sat 0.6 → red; hue 200° → the fallback color |

### 23.6 Stats

| Test | Assertion |
|---|---|
| `distanceFormattingBoundary` | Just under 1000 m → ft/m with 0 decimals; just over → mi/km with 1 |
| `bananaFormula` | `inches / 6.5`, with correct singular/plural |
| `moonPercentSevenDecimals` | Formula and precision |
| `marathonsFiveDecimals` | Formula and precision |
| `returnRateOnlyWhenForegroundsExceedLaunches` | Conditional inclusion |
| `ratioFactsRequireBothSidesPositive` | Each of the four ratio facts |
| `opensPerDayUsesMaxOfInstallAndEpoch` | Tracking epoch clamp |
| `achievementThresholds` | Each of the seven, at and just below its boundary |
| `positiveVibesRequiresBothConditions` | Ratio **and** minimum vote count |
| `milestoneIsExactEqualityOnly` | 69 fires, 70 does not |
| `allNineCountersCheckedForMilestones` | Coverage |
| `counterIncrementIsAtomicUpsert` | Concurrent increments do not lose updates |
| `foregroundsAlwaysGreaterOrEqualLaunches` | Invariant after a cold start plus N foregrounds |

### 23.7 External links and incoming URLs

| Test | Assertion |
|---|---|
| `schemeRewritePerBrowser` | Each of the six non-default browsers |
| `firefoxPercentEncodesWholeUrl` | Exact shape |
| `failureAlertOffersDefaultBrowserFallback` | And opens the **original** URL |
| `redditUrlsNeverGoExternal` | Routed natively |
| `unknownIncomingUrlAlertsAndDoesNotNavigate` | Exact copy |
| `incomingUrlAlwaysLandsOnPostsTab` | Regardless of the active tab |
| `clipboardPromptClearsOnBothBranches` | Cancel and Open |
| `clipboardGuardPreventsStackedPrompts` | Re-entrancy |
| `shareExtensionPayloadSkipsConfirmation` | No prompt |
| `onlyOpenUrlSchemePathAccepted` | A bare `APPNAME://settings` from outside is ignored |

### 23.8 Web view interception

| Test | Assertion |
|---|---|
| `samePathAllowsInPlaceNavigation` | Query-only and fragment-only changes, trailing slash normalized |
| `knownRedditUrlIsCancelledAndPushed` | And the native route matches |
| `shortLinkIsCancelledAndPushed` | Even though its type is unknown pre-resolution |
| `unknownUrlIsCancelledAndOpenedExternally` | |
| `subframeNavigationsNotIntercepted` | Top frame only |

### 23.9 Persistence and maintenance

| Test | Assertion |
|---|---|
| `seenPruneKeepsExactlyFiveThousand` | Oldest removed |
| `hiddenPruneDeletesOnlyExpired` | Non-expired survive |
| `draftPruneKeepsExactlyOneHundred` | |
| `themesStatsVisitsNeverPruned` | Explicit non-behavior |
| `maintenanceOrder` | Seen → hidden → drafts |
| `upsertSemanticsPerTable` | Each natural key |

---

## 24. Traceability

### 24.1 Source spec → this document

| Source (in `docs/swift-rewrite/spec/`) | Section | Covered here |
|---|---|---|
| `01-navigation-shell.md` §3.2 (tab long-press), §3.3 (initial tab), §4.3 (inbox header button), §6 (incoming URLs), §11 (settings routing), §12.2–12.3 (startup modals, community nudge), §17 (error page), §18 (external links), §19 (web views), §21 (app icons) | accounts entry points, settings routing, URL handling, web views, modals | §1, §13, §14, §16.7, §11, §19, §21.1 |
| `02-api-contract.md` §2.5 (R4–R7), §2.6 (Q1), §2.7 (I1–I6), §2.8 (U1–U3), §2.10 (the `/prefs` rewrite — **dropped**, §3.4), §2.13 (server endpoints — **dropped**, §20.4) | endpoints used here; the endpoint ids are `03-data-and-networking.md` §5.2's | §2, §4, §5, §6, §7, §8, §3.4, §20.4 |
| `02-api-contract.md` §3.1–3.7 (login web view, procedure, token, cookies, multi-account, expiry) | the whole login model | §2 |
| `06-settings-themes.md` §1 (routing + root), §2.1–2.7 (General subtree), §3.1–3.6 (theme, palettes, maker, picker, sharing), §4.1–4.3 (appearance), §5 (app icon), §7 (data use), §8 (stats), §9 (privacy), §10 (advanced), §11 (persistence), §12 (guide), §13 (notifications), §14 (Pro), §15 (about) | the whole settings tree | §14–§22 |
| `07-accounts-inbox-search-subs.md` §1 (accounts, login, pulse, multi-account, quick swap, session storage, settings normalization), §2 (inbox), §3 (messages), §4 (user page), §5 (search, in-subreddit, quick search), §6 (sort/context vocabulary), §7 (subreddits hub), §8 (sidebar), §9 (wiki), §10 (multireddits) | Parts I–III | §1–§10 |
| `08-feature-inventory.md` E, F, G, H, L, Q, T, U, V, W | acceptance checklist | throughout |
| `09-persistence-pro-utils.md` §1 (GRDB tables + maintenance), §2.1–2.2 (key store, Keychain cookies), §3 (server/AI), §4 (inbox polling), §5.3 (inbound sharing), §7.3 (color helpers), §8 (UI primitives), §11 (startup sequence) | persistence, startup, primitives | §22, §2.5, §4.1, §13, §18.4, §1.4 |
| `10-swiftui-2026-baseline.md` A1 (scene lifecycle, launch screen), A2 (Liquid Glass + alternate icons via Icon Composer), A3 (`WebPage`/`WebView`, tabs, `canOpenURL` deprecation, MetricKit rewrite, GRDB, on-device models, Accelerate-friendly math) | API choices throughout | §2.1, §11, §12, §18.2, §19, §20.3, §21.3, §22.3 |

### 24.2 Decision tags used in this document

Every id below is the canonical id of a numbered entry in `08-decisions-and-drift.md` §1/§2 (or of a
row of its §3 drift table). There are no aliases.

| Tag | Subject |
|---|---|
| `ipad-split-view-deferred` | iPad split view out of scope |
| `no-confirm-account-delete` | Account removal now confirms before deleting |
| `login-no-instructions` | One line of explanatory copy is added to the login screen |
| `login-css-injection` | No cosmetic CSS is injected into Reddit's login page |
| `cookie-expiry-rewrite` | The `+10 000 days` rewrite runs once per session per account |
| `no-blocked-users-screen` | No blocked-users management surface exists |
| `report-webview` | Report opens a generic page, not item-specific |
| `prefs-force-over18-on-login` | The silent `/prefs` rewrite is dropped; a one-time banner replaces it |
| `inbox-no-filter-tabs` | Single combined inbox list; no filter tabs, no mentions category |
| `message-modal-copy-bugs` | Reply title, message-failure copy and the long-press label are all fixed |
| `user-page-minimal` | Minimal profile, but the avatar **is** rendered |
| `search-no-sort` | The Search tab has no sort or time controls |
| `sidebar-single-stat` | Sidebar shows only a subscriber count; no icon, banner, or moderators |
| `wiki-webview` | The wiki is an embedded reskinned web page, not a native renderer |
| `universal-links-absent` | No associated domains; scheme + extension + intent instead |
| `shortcuts-intent` | An App Intent replaces the iCloud Shortcut |
| `drop-update-group-footer` | The OTA "Update Group" footer line has no native meaning |
| `list-divider-index` | Do not port the trailing-separator bug |
| `mark-seen-live` | "Mark as seen on scroll" takes effect immediately, no restart alert |
| `live-text-dead-setting` | The Live Text toggle is inert in the original; implemented here |
| `tab-hide-on-scroll` | Use `tabBarMinimizeBehavior` instead of the hand-rolled hide |
| `theme-count` | A new built-in theme catalogue, all free; no "premium themes" gate |
| `theme-import-format-compat` | New `::appname-theme::` base64url sentinel; the legacy format is not imported |
| `validateHex-bug` | Correct anchored validator; `hexToRgb` handles 3/6/8-digit forms |
| `app-icons-new-art` | All-new icon art; the artist-credit detail screen is dropped |
| `data-use-copy-typo` | "will be not be loaded" |
| `stats-obfuscation` | Stats are gated with an honest locked screen, not fake asterisks |
| `gate-matrix` | Which rows of `05` §3.1 are paid |
| `stats-no-reset` | No reset button; stats accumulate forever |
| `stats-tracking-epoch` | The hard-coded 2025-08-12 epoch is replaced by the rewrite's release date |
| `self-hosted-server-row` | No custom-server section, keys, or health check |
| `startup-url-default` | The startup URL defaults to empty, not the Reddit home page |
| `clipboard-read-default` | Clipboard link reading defaults to off |
| `error-reporting-default` | Error reporting defaults on and needs no restart |
| `sentry-or-not` | Whether the crash reporter ships at all |
| `settings-key-rename` | The namespaced `APPNAME` settings keys of `03` §8.1 are canonical |
| `review-prompt-mechanism` | `requestReview`, not a write-a-review deep link |
| `startup-modals` | The single-slot modal plus the priority-ordered startup queue |
| `subscribe-nag-removed` | No community-subscribe nudge of any kind |
| `guide-included-or-not` | A 10–14 topic hand-written help section |
| `guide-prose-rewrite` | Every Guide article needs new prose |
| `guide-ai-answer-drop` | The hosted answer card is not rebuilt |
| `ai-removed` | No AI features anywhere |
| `comment-sort-six` | Six real comment sorts; the settings picker adds the `default` sentinel |
| `D17` | Google sign-in presence is Reddit's own page's business |

### 24.3 Gate tags used in this document

| Gate id | Where |
|---|---|
| `gate.multiAccount` | The Accounts "+" button and the Account-tab long-press quick swap (§1.1, §2.7) |
| `gate.customThemes` | Custom-theme list, Theme Maker, attach/import, light/dark pairing (§18.1, §18.3, §18.5) |
| `gate.gestures` | The Gestures screen — changing any of the 8 swipe assignments or the swipe-anywhere toggle (§16.1) |
| `gate.filters` | The Filters screen: text filters, subreddit filters, hide-seen (global and per-page), hidden posts (§16.3) |
| `gate.sortMemory` | The Post & Comment Sorting screen — default sorts, default Top range, apply-to-home, per-subreddit memory (§16.2). **OWNER, default gated** |
| `gate.appIcons` | Selecting a non-default alternate icon (§19) |
| `gate.stats` | The whole Stats screen (§20.2) |

Gates declared in the companion documents and referenced from here: `gate.galleryMode`
(`04a` §10/§11.1, `04b` §10), `gate.downloads` (`04b` §3.4, §9), `gate.videoAutoplay`
(`04a` §9, `04b` §7.2 — OWNER, default free), `gate.compose` (`04a` §16.5 — OWNER, default free).

**Not gates.** `05-monetization.md` §4.1 records three tags that earlier drafts of this document
carried and that are *not* gates: the Settings → APPNAME Plus row (§15 row 7) is the paywall's entry
point and is always free to open; the inbox badge and its polling are free (§4.1); and built-in themes
are free, so there is no "premium themes" seam (§18.2).
