# Hydra Behavioral Spec — Accounts & Login, Inbox, Messages, User Profiles, Search, Subreddit Details/Sidebar/Wiki, Multireddits

This document specifies exact, reproducible behavior for a from-scratch SwiftUI rewrite. It covers only the areas assigned: accounts/login, quick account swap, inbox, private messages, user profile pages, search (global + in-subreddit + quick subreddit search), the Subreddits hub page, subreddit sidebar/wiki, and multireddits.

IMPORTANT CROSS-CUTTING NOTE: `documentation/*.md` in this repo describes a "Hydra Pro" paid subscription tier that gated Inbox Alerts (push notifications), AI filters, stats, custom themes, and gallery mode depth. **The actual current code has removed this entirely.** `contexts/SubscriptionsContext.tsx` is a stub that always returns `isPro: true, customerId: null` with a comment stating "All features are free... paid tier" was removed. `contexts/SettingsContexts/NotificationsContext.tsx` is likewise an inert stub (`notificationsEnabled: false`, a no-op `toggleNotifications`) with a comment that push notifications "relied on the hosted Hydra push backend and have been removed along with the paid tier." There is no `expo-notifications` push-registration code anywhere in the app (only local badge-count updates via `Notifications.setBadgeCountAsync`). **Treat the documentation's Pro/push-notification claims as historical/aspirational and not part of the current behavior to reproduce.** The rewrite should treat all features as unconditionally unlocked and should NOT implement remote/push inbox notifications — only the in-app 60-second polling badge described below.

---

## 1. Accounts & Login

### 1.1 Accounts tab / Accounts page

Source: `pages/AccountsPage.tsx`, `app/stack/AccountsScreen.tsx`, `components/UI/AccountList.tsx`, `app/tabs/index.tsx`.

- The app has a 5-tab bottom bar: Posts, Inbox, Account, Search, Settings.
- The center "Account" tab's icon is a filled person-circle. Its title/label depends on login state:
  - Logged in: tab label under the icon is the current username if the "show username" setting (`TabSettingsContext.showUsername`) is on, otherwise literally "Account". The screen's stack title (header) shows the current username.
  - Logged out (no accounts saved): tab shows "Account" and pulses (see §1.5) to draw attention. The stack header title falls back to "Accounts" when `currentUser` is null.
  - The route/screen name for the accounts list itself is always `"Accounts"`, reachable directly by URL `hydra://accounts`.
- **Accounts screen header**: header-right is a "+" (plus) button. Tapping it opens the Login modal (`setModal(<Login />)`). The button itself pulses (same `PulseHighlight`) when there are zero saved accounts. `headerBackTitle` is "Subreddits" (i.e., navigating back from Accounts returns toward the Subreddits hub).
- **Accounts list body** (`AccountList.tsx`): a vertical scroll list. Order is: every saved account (in the order they were added — see §1.6), followed by a final synthetic row labeled **"Logged Out"**.
  - Empty state: if there are zero accounts, the entire body is replaced by centered text: **"No accounts"** (font size 18). Note: the "Logged Out" row is NOT shown when there are zero accounts (the `accounts.length === 0` branch short-circuits before the map that appends it).
  - Each row: username text (left), and a checkmark icon (Feather "check") on the right IF this row is the currently active one (`currentUser?.userName === username`, or, for "Logged Out", `!currentUser`). While an account-switch action is in flight, the checkmark is replaced by a small `ActivityIndicator`.
  - **Tap a row**: sets a local loading flag, then:
    - If row is "Logged Out": calls `logOut()`.
    - Else: calls `logIn(username)` (restores that user's saved session cookies and re-authenticates — see §1.6).
    - Clears loading flag afterward, then calls the optional `onAccountAction` callback (used by Quick Account Swap to auto-dismiss itself).
  - **Swipe actions** (`Slideable` wrapper): swiping the row reveals a delete action (Feather "trash" icon, colored with `theme.delete`). The "Logged Out" row has no swipe/short-right delete action (`shortRightName={undefined}` for it); every real account row's short-right swipe action is delete.
  - **Long press** a real account row (single-touch only — multi-touch is ignored) opens a native action sheet with a single option **"Delete"**. Selecting it deletes that account. The "Logged Out" row cannot be long-pressed (no-op).
  - **Delete flow**: `handleDelete(username)` sets a loading spinner, calls `removeUser(username)` from `AccountContext`, then clears loading. There is NO confirmation dialog before deleting an account from this list (neither swipe-delete nor long-press-delete asks "are you sure").
  - Accessibility: each row exposes `accessibilityRole="button"`, a `selected` state matching the active-row highlighting logic above, and (for real accounts) a custom "delete" accessibility action equivalent to swipe/long-press delete.
- **One-time tip alert**: the first time the Accounts page is shown with more than 1 saved account, an `Alert` fires once (persisted via a `KeyStore` boolean flag `quickAccountSwapGuideAlert`) with title **"Did you know?"** and message **"You can quick swap accounts by long pressing the account tab."** It never shows again on that device after being dismissed once.

### 1.2 Login modal (adding an account)

Source: `components/Modals/Login.tsx`.

- Presented as a full-screen modal (absolute-positioned overlay, `zIndex: 10`, solid black background) — NOT a native sheet.
- Top navbar: centered title **"Login"** (white text), and a close "X" button (Feather, white, top-right, `hitSlop: 15`) that cancels the flow.
- Body: a `WebView` loading `https://www.reddit.com/login?dest=https://www.reddit.com/r/HydraClient` with shared/third-party cookies enabled, so the user authenticates directly against Reddit's own hosted login page (username/password, 2FA, etc. all happen inside Reddit's web UI — Hydra never sees the password). While the WebView is not yet ready to show (`canShow` false, briefly, while a temporary logout of the current session is being staged — see below), a small `ActivityIndicator` is shown instead.
- **Injected JavaScript** hides certain DOM elements from Reddit's login page for a cleaner look (via a `MutationObserver`-driven shadow-DOM-aware style injector): it hides an element matching `.flex.justify-between.items-end.pt-lg.pb-xs` (a Reddit UI chrome region), nudges the login heading's top margin, and adjusts the z-index of the `auth-flow-manager` custom element.
- **Detecting success — two mechanisms run in parallel:**
  1. `onLoadStart`: every time the WebView begins loading a URL, if that URL does NOT match one of the allowed patterns (`reddit.com/login`, `redditinc.com/policies/user-agreement`, `redditinc.com/policies/privacy-policy`, `reddit.com/policies/privacy-policy`), the login is considered finished (this fires when Reddit redirects to `dest=` after a successful login, or to any other post-login destination).
  2. A 500ms-interval poller (backup mechanism, explicitly commented as a workaround for `onLoadStart` not firing for all users/experiments) repeatedly calls `RedditCookies.hasSessionCookieBeenSet()`, which checks whether the `reddit_session` cookie now exists for `https://www.reddit.com`. As soon as it's set, login is considered finished. This poller only starts once `canShow` is true.
  - Whichever fires first wins (`loginFinished` ref guards against double-invocation).
- **On "login finished"**: the modal is dismissed immediately (`setModal(null)`), then `AccountContext.logIn()` (no username arg — uses whatever session cookie is now live) is awaited:
  - On success: the temporary-logout promise resolves with `false` (do not restore the previous session), and the new user becomes `currentUser`.
  - On failure: an `Alert` is shown — title **"Login failed"**, message **"Something went wrong"**.
- **Cancel** (X button): resolves the temporary-logout promise with `true` (restore whichever account was active before the Login modal opened, if any) and dismisses the modal without attempting a login.
- **Temporary logout while the WebView is open**: Before showing the WebView, `AccountContext.doWithTempLogout()` is invoked. This clears all Reddit session cookies and clears `UserAuth.modhash` so the login WebView starts from a logged-out Reddit session (important when adding a 2nd/3rd account — otherwise Reddit's login page might silently already be authenticated as the currently-active account). If the flow is cancelled or fails, and a previous account existed, its session cookies and modhash are restored so the app returns to exactly the state it was in before.

### 1.3 Adding an account / reaching the Login modal from elsewhere

Per `documentation/accounts_and_login.md` (confirmed by code): the "+" button lives in the Accounts screen header (`app/stack/AccountsScreen.tsx`). The doc's instructions to reach it ("user profile tab → tap Accounts in top-left → tap +") correspond to: when logged in, the header-left of the User profile screen (`app/stack/UserScreen.tsx`) shows a text button labeled **"Accounts"** (only at navigation depth 1, i.e., the root of that tab's stack) which navigates to the Accounts screen; from there the "+" opens Login.

### 1.4 Successful login side effects (`AccountContext.logInContext`)

Source: `contexts/AccountContext.tsx`.

1. If a `username` was passed, restores that user's saved session cookies from `SecureStore` (see §1.6/1.9) before making any request.
2. Fetches `/user/me` via `getUser(..., { allowSuspended: true })` — i.e. even a suspended account is allowed to "log in" at this stage (suspension is surfaced later when viewing content, not blocked at login).
3. If a `username` was explicitly requested but the returned user's name doesn't match, throws "Authenticated session out of sync" (covers a stale/corrupted cookie jar).
4. Requires a `modhash` in the response; if missing, throws "Failed to get modhash".
5. Sets `UserAuth.modhash` (used by every subsequent authenticated POST request as a CSRF token), persists `currentUser` username to `KeyStore`, sets React state `currentUser`, tags Sentry with the username, re-saves the fresh session cookies to `SecureStore` (`saveSessionCookies`), runs `fixIncompatibleAccountSettings()` (see §1.10), and registers the username in the saved-accounts list if not already present.
6. **On ANY failure in the above**, shows an `Alert`: title **"Login Session Expired"**, message **"You can login again by pressing the + button in the top right corner of the Account tab."** — then fully logs out (clears cookies, clears stored current-user key, clears `currentUser` state, clears Sentry user, clears modhash) and returns `false`.

### 1.5 "No account" pulsing indicator

`PulseHighlight` (source: `components/UI/PulseHighlight.tsx`) wraps: (a) the Accounts-screen "+" header button, (b) the Account tab's bottom-bar icon, and (c) the Account tab's text label color — all only while `accounts.length === 0`. It's a slow (1400ms) repeating opacity+scale pulse tinted in an "attention" color: the theme's caution/share color for most themes, or a red variant if the active theme's own accent reads as reddish (there's a hue/saturation heuristic — reddish themes like "spiderman", "strawberry", "mulberry" pulse red; everything else pulses amber). This is purely a first-run-nudge affordance with no persisted "seen" state — it re-pulses any time there are zero accounts.

### 1.6 Managing multiple accounts / switching

- Accounts are stored as an ordered array of usernames under `KeyStore` key `"usernames"` (JSON array). `addUser` appends a new username (no reordering when switching). `AccountContext.accounts` mirrors this array.
- **Switching accounts** (tap a row in `AccountList`, from either the full Accounts page or Quick Account Swap):
  1. Restores that username's saved Reddit session cookies from `SecureStore` (`RedditCookies.restoreSessionCookies`) — i.e., there is no re-entering credentials; the previously captured session cookie is reused.
  2. Re-fetches `/user/me`, re-derives `modhash`, updates `currentUser`.
  3. On any error (e.g., an expired/invalidated stored session), shows the "Login Session Expired" alert from §1.4 and falls back to logged-out.
- **Switching to "Logged Out"**: clears session cookies, clears the stored current-user key, clears `currentUser` (does NOT remove the account from the saved list — it remains available to switch back into).
- **Removing an account** (`removeUser`): removes the username from the stored/array list; if it was the active account, logs out first; deletes that username's stored session cookies from `SecureStore`; persists the updated account list.
- **App-wide effects of switching accounts** (driven by `currentUser` changing, observed across contexts read in this survey):
  - `SubredditContext` (`contexts/SubredditContext.tsx`) reloads: subscriptions, moderated subreddits, and multireddits (`loadData()` runs in a `useEffect` keyed on `currentUser`). When logged out, it instead loads a `trending` list (top 30 trending subreddits) and empties favorites/moderator/subscriber/multis.
  - Favorites are keyed per-account: `KeyStore` key `` favoriteSubreddits:${currentUser.id} `` — so favorites do NOT carry over between different accounts on the same device, and logging out clears the visible favorites list (though the underlying stored data for each account persists under its own key).
  - `InboxContext` resets `inboxCount` to 0 and stops polling when there's no `currentUser`; starts/restarts a 60-second poll when a user becomes active (see §2.6).
  - Any currently open feed / profile screens are NOT automatically reloaded by the account switch itself (no global "refresh everything" trigger observed beyond the two contexts above); screens re-fetch on their own focus/param-change triggers as usual.

### 1.7 Quick Account Swap modal

Source: `components/Modals/QuickAccountSwap.tsx`, trigger wiring in `app/tabs/index.tsx`.

- **Trigger gesture**: long-pressing the **Account** tab in the bottom tab bar (`tabLongPress` listener on the tab navigator), but ONLY if `accounts.length > 0` (no accounts saved ⇒ long-press does nothing). A haptic "selection" tick fires on trigger.
- **Presentation**: an absolute full-screen overlay (`zIndex: 2`) with: a semi-transparent black scrim (opacity 0.7) covering the whole screen that dismisses on tap, and a centered card (max-height 400, rounded corners, bordered, tinted with `theme.tint`) containing the exact same `AccountList` component used on the full Accounts page (same rows, same swipe/long-press/tap semantics as §1.1). The whole overlay fades in/out over 150ms.
- **Contents**: identical account rows (including the trailing "Logged Out" row and the "No accounts" empty state, though empty state can't practically show here since the trigger requires `accounts.length > 0`).
- **Dismissal**: tapping the scrim calls `onExit`. Additionally, `AccountList` is given an `onAccountAction` callback wired to the same `onExit`, so **successfully switching/logging out/deleting an account from within the swap sheet automatically closes it** (unlike the full Accounts page, where the list stays open after an action).

### 1.8 Anonymous / logged-out state

- Browsing is fully allowed logged out: subreddit feeds, post details, comments, search, and (per `documentation/accounts_and_login.md`) reading content. Voting, commenting, posting, saving, messaging, subscribing/favoriting, and viewing personalized feeds/inbox require login.
- `SubredditContext.toggleFavorite` explicitly throws `NeedsLoginToFavorite` and shows a plain `alert("You must be logged in to favorite subreddits")` if attempted while logged out.
- The Subreddits hub page shows a `trending` subreddits section instead of Home/Favorites/Multireddits/Moderator/Subscribed sections when logged out (see §7).
- The Search page and Inbox page both special-case "no `currentUser`": Inbox's data loader returns `[]` immediately when there's no logged-in user (so the inbox screen is simply empty rather than error/prompt), and `MessagesPage` renders nothing at all (`return currentUser && (...)`) when logged out.

### 1.9 Session storage / security

Source: `utils/RedditCookies.ts`.

- Each account's Reddit session cookie is persisted to iOS's secure keychain-backed storage (`expo-secure-store`) under key `` redditSession-${username} `` as a JSON-serialized cookie object (this is the actual `reddit_session` cookie value + attributes, not a password).
- `saveSessionCookies` reads the live `reddit_session` cookie from the native cookie jar (`CookieManager`) after a successful login and stores it.
- `restoreSessionCookies` re-injects a stored cookie into the native jar when switching to that account.
- `clearSessionCookies` explicitly overwrites the `reddit_session` cookie with an expired/empty value (worked around a native cookie-library sync bug where a full clear could resurrect cookies from WebKit's separate store) and then calls `clearAll()` for both the default and WebKit-backed jars.
- `persistSessionCookies` — if the live session cookie lacks an explicit `expires`, it is given a very long expiry (~10,000 days) so it survives.
- No password is ever transmitted to or stored by Hydra — the login flow is entirely delegated to Reddit's own hosted web login.

### 1.10 Silent account-settings normalization on login

Source: `api/AccountSettings.ts`, called from `AccountContext.logInContext` step 5.

- On every successful login (subject to a throttle — see next point), the app fetches the account's Reddit preferences page (`https://old.reddit.com/prefs`), parses the `#pref-form` HTML form to reconstruct the full preferences object, and checks three specific settings: `media` (media previews), `over_18` ("I am over eighteen..."/NSFW), and `search_include_over_18`. If any of these three don't equal `"on"`, it silently POSTs the full settings object back with those three forced to `"on"` (i.e., the app force-enables media previews and NSFW content visibility server-side on the user's Reddit account preferences, with no UI, no prompt, and no user awareness).
- Throttle: this whole check-and-fix only runs at most once per 30 days per device (tracked via a single global `KeyStore` timestamp key `lastFixedAccountSettings` — NOT per-account), to avoid hitting `/prefs` on every login.
- Rationale (visible in code comments elsewhere in the app, not fully explored here): the app relies on Reddit's own NSFW gate being open so that its own local, in-app NSFW blur/filter settings are the sole gatekeeper — otherwise Reddit's server would already strip/blur NSFW content regardless of Hydra's own settings.

---

## 2. Inbox

### 2.1 Access & tab badge

Source: `contexts/InboxContext.tsx`, `app/tabs/index.tsx`.

- The Inbox tab icon is a mail glyph (Entypo "mail"). A native tab badge (`tabBarBadge`) shows `inboxCount` whenever it's > 0 (hidden/undefined at 0 — no "0" badge is ever shown).
- `inboxCount` is defined as the count of inbox items (comment replies + private messages, combined) whose `new` flag is true, as returned by a single fetch of `/message/inbox`.

### 2.2 Polling

- While a user is logged in, a `setInterval` re-runs `checkForMessages()` every **60,000 ms (60 seconds)**, plus an immediate initial call when `currentUser` becomes set. The interval is cleared whenever `currentUser` changes (e.g., on logout/switch) or the provider unmounts.
- `checkForMessages()` guards on `UserAuth.modhash` being set (skips the check silently if not — explicitly to tolerate the moment during an account switch where a user is set but not yet fully authenticated) — fetches `getInboxItems()` (default first page, no `after`), and sets `inboxCount` to the number of items with `new === true` in that single page.
- **No distinction between foreground/background polling** is implemented in this code (no `AppState` listener observed in `InboxContext`) — the interval simply runs whenever the JS context is alive, which in React Native/Expo effectively means "while the app is in the foreground" since JS timers pause when the app is backgrounded (no background fetch / background task registration was found for this). There is no remote/push notification delivery (see the top-of-document cross-cutting note) — badge/count updates only happen while the app is open and this poll fires.
- Every time `inboxCount` changes, `Notifications.setBadgeCountAsync(inboxCount)` is called — this only updates the OS app-icon badge number; it does not create any notification banner/alert.
- The Inbox screen itself additionally refreshes its own list (`refreshMessages()`) whenever `inboxCount` changes AND the screen is currently focused (`useIsFocused()`), so opening/foregrounding the Inbox tab while a poll just landed will visibly refresh the list.

### 2.3 Inbox page layout

Source: `pages/InboxPage.tsx`, `app/stack/InboxScreen.tsx`.

- Header title: **"Inbox"**. Header-right: a single icon button (`MaterialIcons "checklist-rtl"`) — "Mark All Items Read" (see §2.5).
- Body: a single infinite-scrolling list (`RedditDataScroller`) fed by `getInboxItems({ after })` against `/message/inbox` — **there are NO separate filter tabs** in this codebase (no "All / Unread / Messages / Comment Replies / Mentions" segmented control). The single feed interleaves two item kinds returned by Reddit's inbox endpoint, filtered client-side to keep only `t1` (comment reply) and `t4` (private message) kinds — i.e., post replies and username mentions, if Reddit's `t1` kind covers them generically as comment replies, are represented the same as comment replies; there is no separate "mentions" visual treatment. Standard pull-to-refresh and infinite scroll (load-more-on-scroll) apply, per the shared `RedditDataScroller` component behavior used across the app.

### 2.4 Item layouts

Source: `components/RedditDataRepresentations/InboxItem/CommentReplyComponent.tsx`, `MessageComponent.tsx`.

**Comment reply row:**
- Leading icon: `Feather "message-square"`, tinted `theme.iconPrimary` if unread (`new === true`) else `theme.subtleText`.
- Title line: static prefix "Reply to your comment in " (in `theme.text`) followed by the parent post's title (`postTitle`, in a subtler tint), truncated to 2 lines.
- Body: the comment reply's HTML rendered via the app's Markdown/HTML renderer.
- Footer: "in **r/{subreddit}**" (tappable → navigates to that subreddit) "by **{author}**" (tappable → navigates to that user's profile), then a metadata row: an up/down arrow icon (colored by the current user's vote — green/theme.upvote if upvoted, theme.downvote if downvoted, theme.subtleText if no vote) + vote/score count, then a clock icon + relative time-since string (e.g., pre-formatted "X ago").
- **Tap**: marks the item read (optimistic local update + `setInboxItemNewStatus(item, false)` API call) and navigates to the comment's context link (deep-links into the post/comment thread).
- **Swipe** (via `Slideable`): short-right swipe = "mark as read" toggle (mail icon). Right-swipe distance also supports short-left = upvote, long-left = downvote (per the `shortLeftName`/`longLeftName` props — i.e., swiping right on the row reveals upvote/downvote actions at two different swipe distances, and swiping left reveals the read/unread toggle). [Matches `documentation/inbox.md`: "Swipe right to upvote (short) or downvote (longer); swipe left to toggle read/unread".]
- **Long press** (single touch only): action sheet with options **"Upvote"**, **"Downvote"**, and either **"Mark as Read"** (if currently unread) or **"Mark as Unread"** (if currently read).
- Voting recomputes the row's local vote/score state optimistically from the API's returned effective vote delta.

**Private message row:**
- Leading icon: `Feather "mail"`, same read/unread tint logic.
- Title: the message `subject` (max 2 lines, `theme.text`).
- Body: the message HTML body.
- Footer: "from **{author}**" (tappable → user profile) + clock icon + relative time.
- **Tap**: marks read, navigates to `https://www.reddit.com/message/messages/{id}` (opens the Messages/conversation page — §3).
- **Swipe**: short-right swipe = mark-as-read toggle only (no vote actions — messages aren't votable).
- **Long press**: action sheet with a single option **"Mark as Read"** (note: unlike comment replies, the code always offers "Mark as Read" regardless of current state rather than toggling label text — i.e., long-press on an already-read message still shows "Mark as Read" and re-marks it read/no-ops the toggle rather than offering "Mark as Unread").

### 2.5 Mark All Read

Source: `app/stack/InboxScreen.tsx`.

- Header checklist icon → confirmation `Alert`: title **"Mark All Items Read?"**, no message body, buttons **Cancel** (style: cancel) / **Ok** (style: default).
- On "Ok": calls `markAllMessagesRead()` (`POST /api/read_all_messages`). On success: shows a second `Alert` — title **"Success!"**, message **"This may take a moment to update, especially if you have a lot of unread messages."** — then, after a 1-second delay, calls `checkForMessages()` to refresh the badge/count.
- On failure: `Alert` — title **"Error"**, message **"Failed to mark all messages as read."**

### 2.6 Read/unread toggling API

Source: `api/Messages.ts`.

- `setInboxItemNewStatus(item, isNew)` posts to `POST /api/unread_message` (to mark unread, `isNew: true`) or `POST /api/read_message` (to mark read, `isNew: false`) with `{ id: item.name }` (the fullname, e.g. `t1_xxx`/`t4_xxx`).
- Toggling updates `InboxContext.inboxCount` locally by ±1 immediately (optimistic), in addition to whatever the next poll cycle recomputes.

---

## 3. Private Messages

### 3.1 Conversation view

Source: `pages/MessagesPage.tsx`, `app/stack/MessagesScreen.tsx`.

- Reached by tapping a message row in the Inbox (URL `https://www.reddit.com/message/messages/{id}`). Header title: **"Messages"**.
- Renders nothing (blank) if not logged in.
- Extracts the message-thread id from the URL path, then loads the full thread via `getConversationMessages(messageId)`, which hits `GET /message/messages/{id}` and flattens the root message plus all of its nested `replies` (Reddit stores replies inside the first message's `data.replies.data.children`; an empty-string `replies` means no replies) into a flat chronological array.
- While loading: a centered `ActivityIndicator`. Auto-scrolls to the bottom whenever the message count changes (new message loaded or sent).
- **Bubble layout**: each message renders as a chat bubble. The current user's own messages are right-aligned with `theme.iconPrimary` background; the other party's messages are left-aligned with `theme.tint` background. Each bubble shows the author name and a short relative timestamp (`Time.shortPrettyTimeSince()`) above the HTML-rendered body.
- **Reply button**: shown only if there is an "other user" in the thread (i.e., some message authored by someone other than `currentUser`) and at least one message from them exists — pinned to the bottom of the screen. Tapping opens the `ReplyToMessage` modal, seeded with the most recent message from that other user (used as the `thing_id` to reply to).

### 3.2 Composing a new message

Source: `components/Modals/NewMessage.tsx`, triggered via a user profile's context-menu "Message" option (see §4) or the doc-described 3-dot menu.

- Full-screen modal. Top bar: **Cancel** (left, dismisses without sending), title **"New Message"** (center — note: the title literally says "New Message" is NOT what's shown; actually the code's topBarTitle text is "New Message" for `NewMessage.tsx` — confirmed), **Send** (right, or an `ActivityIndicator` while submitting).
- Fields: a single-line **Title** text input (subject) styled as a pill row, then a full markdown editor body (`MarkdownEditor` — shared rich-text editor component used across the app for comments/posts, includes a formatting toolbar and "custom theme" option per its `showCustomThemeOption` prop) for the message text, followed by a **Preview** label and a live-rendered HTML preview of the markdown (via the app's `Snudown` markdown-to-HTML compiler) below the editor.
- **Validation**: none client-side beyond what the server enforces — pressing Send always attempts submission regardless of empty subject/body; the server's response `errors` array (JSON API `errors`) determines success. On success (`errors` is an empty array): closes the modal, clears both drafts, fires `contentSent()` (parent refresh callback), and shows an `Alert` — **"Message sent!"**. On failure (non-empty errors array, or the request itself throwing): the modal stays open, submitting state resets, and shows `Alert` — **"Failed to submit comment"** (note: the error alert's copy literally says "comment", not "message" — a minor stock-copy reuse bug worth reproducing faithfully or fixing at the rewriter's discretion, but documenting it as the current exact string).
- **Drafts**: subject and body are auto-persisted to local storage as the user types, keyed per-recipient (`newMessageDraft-Subject-{username}` / `newMessageDraft-Text-{username}`) via a shared `useDraftState` hook (backed by the app's local SQLite/drizzle DB, per `db/functions/Drafts`). Drafts are cleared only on successful send; closing the modal without sending preserves the draft for next time.

### 3.3 Replying to a message

Source: `components/Modals/ReplyToMessage.tsx`.

- Same visual shell as New Message (Cancel / title "New Message" / Send, markdown editor + live preview) but with no subject field — it's a reply to an existing thread.
- Submits via `replyToMessage(previousMsg, text)`, which — notably — POSTs to `https://www.reddit.com/api/comment?api_type=json` (the SAME endpoint used for posting a normal comment on a post, with `thing_id` set to the previous message's fullname) rather than a message-specific endpoint; a code comment flags this reddit quirk explicitly.
- Same success/failure alert behavior as New Message (success has no alert here — only `contentSent()` is called to reload the thread and the modal closes; failure alert: **"Failed to submit comment"**).
- Draft key: `` replyToMessageDraft-${previousMsg.author} ``, auto-saved, cleared on successful send.

### 3.4 Block & report (from a user's profile, applies to messaging context too)

- **Block**: from a user profile's 3-dot menu → "Block" → confirmation `Alert` (title **"Block User"**, message **"Are you sure you want to block this user?"**, buttons Cancel / Block) → on confirm, `POST /api/block_user?account_id=t2_{id}`, then a success `Alert` — title **"User Blocked"**, message **"Content from this user will be hidden"**. (No dedicated "blocked users" management list was found in the surveyed files — blocking is fire-and-forget with no visible in-app "Blocked Users" settings screen in this scope.)
- **Report**: from the same 3-dot menu → "Report" → simply pushes an in-app webview to `https://www.reddit.com/report` (Reddit's own hosted report flow; no native report form in Hydra).

---

## 4. User Profile Page

Source: `pages/UserPage.tsx`, `app/stack/UserScreen.tsx`, `components/RedditDataRepresentations/User/UserDetailsComponent.tsx`, `components/RedditDataRepresentations/User/UserComponent.tsx`, `api/User.ts`.

### 4.1 Header (`UserDetailsComponent`, shown only on the profile root, not on deeper sub-pages)

- Three-stat row, evenly spaced: **Comment Karma**, **Post Karma**, **Account Age** (each with a two-line label under the number; the number is abbreviated via a `Numbers.prettyNum()` formatter, e.g. "12.3k"; age uses a "pretty time since" string, e.g. "5y").
- **No avatar/icon is rendered anywhere in the profile UI** — `User.icon` exists in the data model (parsed from `icon_img`) but is never displayed on this page or in `UserComponent` (the search-result row). Confirm the rewrite should likewise omit an avatar unless product direction says otherwise, since the current app simply doesn't show one here.
- **No trophies, no cake-day-specific UI beyond the "Account Age" stat**, **no follow/unfollow control** anywhere in the surveyed User page code (there is a `friends: boolean` field on the `User` model surfaced only in the compact search-result row as "Friends: Yes/No" text — see §4.5 — with no tap action to change it).
- **Section buttons list** below the stats (icon + label rows, tap → pushes the corresponding URL):
  - **Posts** → `/user/{username}/submitted` (always shown)
  - **Comments** → `/user/{username}/comments` (always shown)
  - Only if `user.isLoggedInUser` (i.e., viewing your OWN profile — determined by the API response including an `inbox_count` field, which Reddit only returns for the authenticated user's own `/about` call):
    - **Upvoted** → `/user/{username}/upvoted`
    - **Downvoted** → `/user/{username}/downvoted`
    - **Hidden** → `/user/{username}/hidden`
    - **Saved Posts** → `/user/{username}/saved?type=links`
    - **Saved Comments** → `/user/{username}/saved?type=comments`
  - There is no separate "Overview" or "Gilded" section button in this list. (The profile root itself, i.e. `/user/{username}` with no sub-path, acts as the combined "overview" feed — see next.)

### 4.2 Content feed

- The rest of the page below the header is an infinite-scroll feed of the user's content at whatever URL/section is active (root = overview mixing posts+comments; `/submitted` = posts only; `/comments` = comments only; `/upvoted`, `/downvoted`, `/hidden`, `/saved` = self-only sections above). Items render as `PostComponent` (kind `t3`) or `CommentComponent` (kind `t1`) using the same shared components used elsewhere in the app for posts/comments.
- `isDeepPath` (true when the URL path has more than `/user/{username}` — i.e., any of the sub-sections) hides the `UserDetailsComponent` header on those sub-pages, showing just the list.

### 4.3 Sorting

- **Sort options** (via the shared `SortAndContext` header control) are offered ONLY on the `submitted` and `comments` sections: **New, Hot, Top** (with Top opening a secondary action-sheet for time range: Hour/Day/Week/Month/Year/All). No sort control is shown on the root/overview page or on upvoted/downvoted/hidden/saved.

### 4.4 Header context menu (3-dot)

- Always includes **Block** and **Share** (Share invokes the OS share sheet with the profile's canonical URL).
- Includes **Message** only when viewing someone else's profile (`currentUser?.userName !== user?.userName`) — opens `NewMessage` (§3.2) addressed to that user.
- "Block" triggers the confirm-then-block flow described in §3.4.

### 4.5 Compact user row (used in Search results, §5)

Source: `UserComponent.tsx`. Shows username (tap → push `/user/{username}`), then a metadata row: star icon + total karma (post+comment karma summed) + "karma", a person-add icon + "Friends: Yes/No" (from `friends` boolean, no tap action), and a clock icon + `timeSinceCreated` string.

### 4.6 Error / not-found / suspended states

Source: `api/User.ts`, `components/UI/AccessFailureComponent.tsx`.

- `getUser()` throws `BannedUserError` if the response has `error === 403` or `data.is_suspended` is true (unless `allowSuspended` was passed, which the initial header load specifically does — allowing the page to still attempt loading content for a suspended user's URL rather than instantly failing the whole page load at the header-fetch step; the CONTENT loader (`getUserContent`) does NOT pass `allowSuspended`, so it will still throw for a suspended/banned user).
- `getUser()` throws `UserDoesNotExistError` if `error === 404`.
- These errors surface through `useRedditDataState`'s `accessFailure` typing and are rendered by the shared `AccessFailureComponent`, which replaces the entire content area with centered subtle-colored text and NO further UI (no retry button observed in this component):
  - Banned/suspended user: **`🚫 {username} has been banned`**
  - Nonexistent user: **`🚫 {username} does not exist`**
  - (For reference, the same component's other messages used elsewhere in this scope: private subreddit → `🔑 r/{sub} has been set to private by its subreddit moderators`; banned subreddit → `🚫 r/{sub} has been banned by Reddit Administrators for breaking Reddit rules`; unavailable multireddit → `🔑 Reddit wouldn't share this multireddit. It may be private, deleted, or only visible to the account that owns it.`)
- The `contentName` interpolated into these messages is derived from the URL path segment (e.g., the username or subreddit name as typed in the URL), not a separately fetched display name.

---

## 5. Search

Source: `pages/SearchPage.tsx`, `app/stack/SearchScreen.tsx`, `components/UI/SearchBar.tsx`, `api/Search.ts`.

### 5.1 Layout

- Header title **"Search"**.
- Below the header: a row of **3 pill-shaped scope toggles**, one per search type, in fixed order **POSTS / SUBREDDITS / USERS** (rendered uppercase from `SearchTypes = ["posts", "subreddits", "users"]`). The active pill has a `theme.tint` background; inactive pills are transparent. Default active type on page load: **"posts"**.
- Below that: a single `SearchBar` (magnifying-glass icon + text field + clear "x" button once there's text). This bar auto-focuses on screen focus IF no search has been entered yet (`useFocusEffect`); it does not re-focus on every focus event once a search exists.
- Below that: the results list (`RedditDataScroller`), OR, when there's no query text yet, a **"Trending Subreddits"** list (a `List` of rows with a trending-up icon + subreddit name, tap → push that subreddit) sourced from `getTrending()` filtered to exclude subreddits the user is already subscribed to and to exclude a subreddit literally named "Home". While results are loading with no rows yet, a small `ActivityIndicator` is shown instead of the trending list.

### 5.2 Search-triggering behavior

- The `SearchBar`'s `onSearch` callback fires on `onSubmitEditing` (return/search key) and, by default, `onBlur` (leaving the field) — `searchOnBlur` is left at its default `true` on this page, so simply tapping away from the search field also triggers/re-triggers a search if the text changed since the last search. It does NOT search on every keystroke (no live/instant search-as-you-type on the main Search page).
- Changing the active scope pill immediately re-runs the search against the same query text (`refreshSearchResults()` fires on `searchType` change).
- Clearing the text (tapping the "x") also triggers a search call, which — since the query is now empty — clears any existing results (the loader explicitly returns `[]` and deletes existing search data when the current search text is empty).

### 5.3 Result rendering per scope

- **posts** → `PostComponent` rows (standard post card, supports vote/save/etc. same as feed posts elsewhere).
- **subreddits** → `SubredditComponent` rows: `/r/{name}` title, description (or **"No description"** if empty) truncated to 3 lines, and a footer with subscriber count, "Joined"/"Not Subscribed" status, and time-since-creation.
- **users** → `UserComponent` rows (§4.5).

### 5.4 Query construction, pagination, and quirks

Source: `api/Search.ts`.

- Endpoint: `GET https://www.reddit.com/search/` with `type` mapped from scope (`posts→link`, `subreddits→sr`, `users→user`), `q` = the typed text, and `sr_detail=true` always included.
- **Subreddit-scope special-casing**: the raw query text is rewritten to `` "/r/" + text.trim().replace(/^(\/r\/|\/)/, "") `` before being sent — a code comment states this "fixes a bug where you can't search for subreddits with less than 3 characters" (i.e., Reddit's search API has a minimum-length quirk for plain subreddit-name queries that's worked around by wrapping the query as an `/r/`-prefixed path-style search).
- **Pagination**: infinite-scroll via `after` cursor for posts and subreddits. **User search explicitly disables pagination** — if `after` is set and `searchType === "users"`, the loader returns `[]` immediately with a code comment "API only allows 1 page of search for users" (matches `documentation/search.md`'s stated limitation).
- **No sort or time-range controls, no NSFW-inclusion toggle, and no "recent searches" history** exist anywhere in `SearchPage.tsx` or `api/Search.ts` for the top-level Search tab. (Sort/time controls DO exist, but only for in-subreddit search — see §5.6.) This directly matches `documentation/search.md`'s advertised "search operators" (author:, subreddit:, site:, title:, selftext:, quoted phrases) being purely a Reddit-search-syntax feature typed manually into the query box — Hydra provides no dedicated UI for those operators; they're just plain text query-string conventions the user can type.

### 5.5 In-subreddit search (search bar embedded in a subreddit's feed)

Source: `pages/PostsPage.tsx` (ListHeaderComponent, only rendered when `route.name === "PostsPage"`, i.e. NOT shown on the Home feed or a Multireddit combined feed — only on an actual single-subreddit feed page).

- A `SearchBar` at the top of the subreddit's post list, with `clearOnSearch={true}` (the field auto-clears itself right after a search fires) and `searchOnBlur={false}` (only submits on the return key, not on blur).
- On submit with non-empty text: navigates (pushes a new stack screen) to `https://www.reddit.com/r/{subreddit}/search/?q={text}&restrict_sr=true`, which routes to the dedicated `SubredditSearchPage`.

### 5.6 Subreddit Search page

Source: `pages/SubredditSearchPage.tsx`, `app/stack/SubredditSearchScreen.tsx`, `api/Posts.ts::searchSubredditPosts`.

- Header title: **"Search"**. Header-right: `SortAndContext` offering sort options **Relevance, Hot, New, Top (+ time-range submenu), Comment Count** and context option **Share** only.
- Body: another `SearchBar` (as the list's header, pre-filled with the current `q` param) followed by an infinite-scroll list of `PostComponent` results.
- Query: `GET` against the passed subreddit-search URL with `restrict_sr=true` (forced) and `sr_detail=true` (forced) query params always applied, `limit` defaulting to 10 per page, paginated via `after`.
- Results are posts only — there is no subreddit/user scope toggle on this page (it's purely "search posts inside this subreddit").
- Editing the search text and re-submitting updates the URL's `q` param via `navigation.setParams`, which re-triggers the fetch (refresh dependencies include `searchText`, `sort`, `sortTime`).

### 5.7 Quick Subreddit Search modal

Source: `components/Modals/QuickSubredditSearch.tsx`, trigger wiring in `app/tabs/index.tsx`.

- **Trigger gesture**: long-pressing the **Search** tab in the bottom tab bar (fires regardless of login state — no guard). A haptic tick fires on trigger. The FIRST time the Search tab is tapped (a normal short tap, not long-press) a one-time `Alert` fires ("Did you know?" / "You can quick search for subreddits by long pressing the search tab.") — persisted the same way as the account-swap tip.
- **Presentation**: same full-screen dimmed-overlay pattern as Quick Account Swap (150ms fade), but anchored to the top of the safe area rather than centered, containing: a text input ("Search for a subreddit", autocorrect off, auto-focused when shown, auto-blurred when hidden), an optional "Go to r/{exactName}" row (see below), and a scrollable results list capped visually at 10 rows tall (`FlashList`, max height = 10×52px) before internal scrolling kicks in.
- **Default/empty-query state**: when the text field is empty, the list shows the user's own **favorited subreddits followed by their subscribed subreddits** (`[...userSubs.favorites, ...userSubs.subscriber]`) — i.e., favorites first, no separate "Recently visited" or other section.
- **As the user types** (debounced 500ms), two lookups run concurrently:
  1. A fuzzy subreddit-name search (`getSearchResults("subreddits", text, { limit: 20, sr_detail: false })`), paginated on scroll (`onEndReached`) in pages of 20, appended to the growing list. Stale in-flight requests are discarded via monotonically-increasing token refs if the user keeps typing or starts a new search.
  2. An **exact-match lookup** (`resolveSubreddit()`, hits `/r/{name}/about.json` directly after stripping any leading `/r/`, `r/`, or `/` the user typed) — if it resolves to a real subreddit (including private/quarantined/banned ones, per the code comment, since Reddit still returns a `t5` object for those), a highlighted **"Go to r/{name}"** row appears above the search-results list, showing the subreddit's icon (or a generic Reddit icon if none) and subscriber count is NOT shown on this row (only on the list rows below). Pressing return/go while this exact match is resolved also navigates directly to it.
- **Each result row**: subreddit icon (or a generic reddit glyph fallback), name, subscriber count (if known, formatted via `Numbers.prettyNum()` + " subscribers"), chevron-right affordance.
- **Tap a row (or the "Go to" row, or press return with an exact match resolved)**: closes the modal, clears all local search state, and pushes a new `PostsPage` screen for that subreddit (`https://www.reddit.com/r/{name}`) via `StackActions.push` (note: this is a hard **push**, distinct from `pushURL`, directly onto the navigator).
- **Dismissal**: tapping the dimmed background area calls `onExit` without navigating.

---

## 6. Sorting & context menu vocabulary used across this area (shared component)

Source: `components/Navbar/SortAndContext.tsx` (documented here since it's the mechanism behind several screens above).

- Sort button (when present) shows a dynamic trophy/fire/clock/podium/etc. icon reflecting the CURRENT sort of the page's URL, and tapping it opens a native action sheet listing the passed `sortOptions`. Choosing **"Top"** opens a SECOND action sheet for the time range (**Hour/Day/Week/Month/Year/All**) before actually applying the sort — this two-step flow applies identically to the User page's Top sort and the Subreddit Search page's Top sort.
- If a "remember sort per subreddit" preference is enabled (`REMEMBER_POST_SUBREDDIT_SORT_KEY` / `REMEMBER_COMMENT_SUBREDDIT_SORT_KEY`, out of this survey's direct scope but touched by this shared component), changing sort on a subreddit page persists that subreddit's chosen sort (and, for Top, its chosen time range) to `KeyStore` for future visits.
- Context (3-dot) button opens a native action sheet whose OPTIONS vary per page (each page passes its own relevant subset of: Share, Select Text, Subscribe, Unsubscribe, Favorite, Unfavorite, New Post, Add to Multireddit, Edit, Delete, Message, Block, Report, Show/Hide Seen Posts, Sidebar, Wiki, Open in Gallery Mode). The handler for each option is centralized in this one component (see the earlier inline description for Block/Message/Report/Sidebar/Wiki/Add-to-Multireddit exact behavior, all detailed in the sections above where each page uses them).

---

## 7. Subreddits Hub Page

Source: `pages/Subreddits.tsx`, `app/stack/SubredditsScreen.tsx`, `contexts/SubredditContext.tsx`.

### 7.1 Structure

- Header title: **"Subreddits"**. This is the root/first screen of the Posts-tab stack (back-navigating from a Home feed returns here, per `documentation/subreddits.md`).
- A single virtualized list (`FlashList`) of heterogeneous row types, in this fixed order:
  1. **Three "top button" rows**, always present regardless of login state:
     - **Home** (pink/`#fa045e`, house icon) → `https://www.reddit.com/` — subtitle "Posts from subscriptions"
     - **Popular** (blue/`#008ffe`, trending-up icon) → `https://www.reddit.com/r/popular` — subtitle "Most popular posts across Reddit"
     - **All** (green/`#02d82b`, sort-amount icon) → `https://www.reddit.com/r/all` — subtitle "Posts across all subreddits"
  2. **Favorites** section (header + rows) — only rendered if `subreddits.favorites.length > 0`.
  3. **Multireddits** section — only rendered if `multis.length > 0`.
  4. **Moderator** section — only rendered if `subreddits.moderator.length > 0` (subs the user moderates).
  5. **Subscriber** section — only rendered if `subreddits.subscriber.length > 0` (all subscriptions, alphabetically sorted server-request-side via `localeCompare` in `getSubreddits()`).
  6. **Trending** section — only rendered if `subreddits.trending.length > 0` (this is populated ONLY in the logged-out case — see §7.2 — so in practice Trending and Favorites/Multireddits/Moderator/Subscriber are mutually exclusive display states based on login).
- Section headers are uppercase labels in a `theme.tint`-backgrounded bar (e.g., "FAVORITES", "MULTIREDDITS", "MODERATOR", "SUBSCRIBER", "TRENDING").
- Each subreddit row (`SubredditCompactLink`): leading circular icon image (or a generic Reddit glyph fallback if no `iconURL`), subreddit name, and a star/star-outline toggle button on the right (filled if favorited) — tapping the star calls `toggleFavorite` directly from this list without navigating.
- Each multireddit row (`MultiredditLink`): leading icon image (or generic fallback), multi name, and a chevron expand/collapse toggle. Tapping the row body (not the chevron) navigates to the multi's combined feed. Expanding reveals an indented sub-list of the multi's member subreddits (icon + name), each: tap → navigate to that subreddit; long-press → action sheet with **"Delete From Multireddit"** (calls `deleteSubFromMulti`, which alerts **"Removed {sub} from {multi}"** on success or **"Something went wrong: {error}"** on failure) and **"Share"** (shares that subreddit's URL).

### 7.2 Data sourcing & login-state dependent content

- Logged in: `getSubreddits()` fetches `/subreddits/mine.json` (subscriptions) and `/subreddits/mine/moderator.json` (moderated) in parallel (both depaginated to fetch everything, `limit=100` per page), each sorted alphabetically by name. Favorites are derived by cross-referencing the per-account favorites `KeyStore` list against the fetched `subscriber` list (so a favorited-but-since-unsubscribed subreddit silently drops out of Favorites — there's no error, it just won't appear because it's not in `subscriber` to intersect against).
- Logged out: `trending` is populated via `getTrending({ limit: "30" })`; `favorites`/`moderator`/`subscriber` are all empty arrays.
- Multireddits: `getMyMultis()` (`GET /api/multi/mine?expand_srs=true`) — only when logged in; empty when logged out. A load failure here is caught and reported to Sentry WITHOUT blocking the rest of the page (explicitly commented: multireddits are "a secondary part of this screen" and used to take the whole list down on failure before this fix).
- All of this reloads whenever `currentUser` changes (see §1.6).

### 7.3 A-Z alphabet scroller

- A vertical strip of letters A–Z, absolutely positioned on the right edge (top 10%, height 80% of the screen), rendered in `theme.tint`.
- **Touch-drag interaction**: touching/dragging a finger down the strip computes which letter row corresponds to the touch's Y position (dividing the strip's measured height into 26 equal bands) and immediately scrolls the main list (`scrollToIndex`, not animated) to the first row whose subreddit name starts with that letter — but the underlying letter→index map is built ONLY from subreddits in the **subscriber** or **trending** categories (favorites/moderator/multireddit rows are excluded from the jump targets). If a letter has no matching subreddit, tapping it does nothing (the scroll call is skipped when no index is found).
- While actively touching, a large centered floating "letter preview" bubble (60×60, rounded, semi-opaque `theme.tint`) shows the currently-hovered letter in big bold text; it disappears on touch release.
- No search/filter TEXT box exists on this page itself for narrowing the subreddit list — filtering by typed text is only available via the Search tab or Quick Subreddit Search modal (§5.7), not inline on this hub page.

### 7.4 Favorite toggling & storage

- Favoriting requires: (a) being logged in (else `NeedsLoginToFavorite`, alert as in §1.8), and (b) being subscribed to that subreddit already — attempting to favorite a subreddit the user isn't subscribed to throws `NeedsSubscriptionToFavorite` and shows `alert("You must be subscribed to a subreddit to favorite it")`. (This constraint is enforced client-side against the currently-loaded `subreddits.subscriber` list, not by any server call.)
- Storage: `KeyStore` key `` favoriteSubreddits:${currentUser.id} `` (note: keyed by the numeric/string Reddit user **id**, not username) holding a JSON array of subreddit names. Purely local/on-device — never synced to Reddit or any Hydra backend.
- No swipe-to-remove or drag-to-reorder was found for the Favorites section specifically on this page — the only affordance is the star toggle (on this page) and the Favorite/Unfavorite context-menu option (when viewing a subreddit's own feed).

### 7.5 Subscribing / unsubscribing

- Not initiated from the Subreddits hub page itself — done via the 3-dot context menu on a subreddit's own feed page (`SortAndContext`, §6): **Subscribe** → `setSubscriptionStatus(sub, true)` → reloads the subreddit list → `Alert.alert("Subscribed!", "You've successfully subscribed to " + subreddit)`. **Unsubscribe** → `setSubscriptionStatus(sub, false)` → reloads → `alert("Unsubscribed from " + subreddit)` (note: this one uses the plain JS `alert()`, which on iOS via RN renders as a basic OK-only alert, distinct from the richer `Alert.alert` used for Subscribe — same effective UX, just documenting the exact call used).

---

## 8. Subreddit Sidebar Page

Source: `pages/SidebarPage.tsx`, `app/stack/SidebarScreen.tsx`, `api/SubredditDetails.ts`.

### 8.1 Access

- Reached via a subreddit feed's 3-dot menu → **"Sidebar"**, which pushes `https://www.reddit.com/r/{subreddit}/about/`. Header title is derived from the URL's "page name" (effectively the subreddit name).

### 8.2 Layout

- While loading (either the "about" data or the rules haven't both arrived yet): a single centered `ActivityIndicator`, no skeleton content.
- Once both load, a scroll view containing, top to bottom:
  1. A stats bar (`theme.tint` background) — currently showing exactly ONE stat: **"Subscribers"** with a locale-formatted number (e.g. "1,234,567"). (The data model (`Sidebar` type) only carries `subscribers` and `descriptionHTML` — there is no subscriber-online/active-user count, no NSFW flag surfaced here, no banner/header image, and no subreddit icon rendered on this page.)
  2. **"Rules"** section header, then a numbered, expandable list of rules (`{i+1}. {rule.name}` as the tappable row header with a "+"/"−" toggle glyph on the right). Tapping a rule toggles its expansion; expanded state is per-rule (a `Set` of expanded rule names) and multiple rules can be expanded simultaneously. Expanded content renders the rule's full HTML description via the shared HTML renderer. If a subreddit has zero rules, the "Rules" header still renders with an empty list beneath it (no explicit "no rules" empty-state text was found).
  3. The subreddit's full sidebar description, rendered as HTML (`descriptionHTML`, HTML-entity-decoded) via the shared `RenderHtml` component (supports links, which navigate in-app per the shared HTML link-handling behavior used across the app).
- **No moderators list** is fetched or shown on this page (no `getModerators`-style call found in `api/SubredditDetails.ts` or usage in `SidebarPage.tsx`).
- **No subscribe/unsubscribe or favorite controls** are present on the Sidebar page itself — those live only on the subreddit's feed page context menu (§6/§7.5).
- **No wiki link/button** is present on the Sidebar page itself — the Wiki is a SEPARATE entry in the subreddit feed's 3-dot menu (§6, "Wiki" option), not something reached from within Sidebar.

### 8.3 Data source

- `getSidebar(subreddit)`: `GET /r/{subreddit}/about.json`, extracting `subscribers` (defaults to 0 if absent) and HTML-decoded `description_html`.
- `getRules(subreddit)`: `GET /r/{subreddit}/about/rules.json`, mapping each rule to `{ name: short_name, descriptionHTML: decode(description_html) }`.
- There is a separate helper `resolveSubreddit(name)` (used by the subreddit switcher/quick-search, §5.7) that hits the same `/about.json` endpoint independently and is explicitly documented (in a code comment) to resolve even for private/quarantined/banned subreddits (Reddit still returns a `t5` payload for those), returning `null` only on a genuine 404 or malformed response.

---

## 9. Subreddit Wiki Page

Source: `pages/WikiPage.tsx`, `app/stack/WikiScreen.tsx`, `components/HTML/ThemedWebView.tsx`.

### 9.1 Access & path handling

- Reached via the subreddit feed's 3-dot menu → **"Wiki"**, which pushes `https://www.reddit.com/r/{subreddit}/wiki/index` (always the `index` wiki page, never a chooser/listing of wiki pages within Hydra itself). Header title is derived from the URL's page name.
- **There is no custom path-parsing/rendering logic in Hydra for the wiki at all.** `WikiPage` is a thin wrapper that hands the incoming URL param straight to a generic `ThemedWebView` — i.e., the wiki is rendered by loading the ACTUAL Reddit wiki web page inside an embedded WebView, not via Hydra's native markdown/HTML renderer or its own JSON-API-driven UI.

### 9.2 Rendering & theming

- `ThemedWebView` loads the given URL directly in a `WebView` (shared cookies/third-party cookies enabled so the user's login session carries over to the embedded page), and injects CSS overrides to reskin BOTH old-Reddit and new-Reddit ("shreddit") DOM structures to match the app's current theme colors: background, tint (secondary background), text, subtle text, link color (mapped to `theme.iconOrTextButton`), and divider color are all pushed via `!important` CSS rules targeting a long list of both legacy (`.side`, `.usertext-body`, `.md`, `.thing`, etc.) and modern (`shreddit-app`, `shreddit-post`, `[class*="bg-neutral-background"]`, etc.) selectors. It also hides the web page's own `<header>` and Reddit's promo bottom-sheet (`#xpromo-bottom-sheet`).
- A loading spinner (`ActivityIndicator`) shows while the page is initially loading (`startInLoadingState`).

### 9.3 Link navigation inside the Wiki (and any other themed WebView)

- `onShouldStartLoadWithRequest` intercepts top-frame navigations. If the target URL's normalized base path equals the CURRENT page's base path (i.e., just an in-page anchor/fragment or redundant reload), the WebView is allowed to navigate itself normally.
- Otherwise, Hydra tries to resolve the target as a recognized in-app Reddit URL (`RedditURL.getPageType()`); if it recognizes the page type (or it's a shortened link like `redd.it/...` or `/s/...`, which are allowed through to be resolved later), it cancels the WebView's own navigation and instead calls `pushURL(url)` to hand off to Hydra's native routing/screens (so tapping a link to another wiki page, a post, a user, etc. from within the embedded wiki opens Hydra's native equivalent screen rather than staying inside the WebView).
- If the URL can't be resolved as any known in-app page type, it's opened as an external link (device browser / share sheet — `openExternalLink`) instead, and the WebView's own navigation is still cancelled.

---

## 10. Multireddits

Source: `api/Multireddit.ts`, `components/RedditDataRepresentations/Multireddit/MultiredditLink.tsx`, `contexts/SubredditContext.tsx`, `pages/Subreddits.tsx`, `app/stack/MultiredditScreen.tsx`.

### 10.1 No in-app create/rename/delete

- **Multireddits cannot be created, renamed, or deleted from within Hydra at all.** No such API call, modal, or menu option exists anywhere in the codebase (confirmed by a repo-wide search for create/delete-multi UI, which found nothing). This matches `documentation/subreddits.md` and `organizing_feeds.md`, which both explicitly state multireddits "must be created on Reddit's website" (or another app) — once created there, they simply appear automatically in Hydra by virtue of `getMyMultis()` fetching them from the account.

### 10.2 Listing

- `getMyMultis()`: `GET /api/multi/mine?expand_srs=true`, mapped into `Multi { id, name, iconURL, url, subreddits[] }`, with member subreddits sorted alphabetically by name. Each multi's subreddit-name list is primed into an in-memory cache (`multiSubredditNamesCache`, keyed by a lower-cased normalized `user/{owner}/m/{multiname}` path) to avoid re-fetching the multi's definition while paginating its feed.
- Displayed on the Subreddits hub page under a "MULTIREDDITS" section (§7.1) as expandable `MultiredditLink` rows.

### 10.3 Add / remove a subreddit

- **Add**: from any subreddit's 3-dot menu → **"Add to Multireddit"**. If the user has zero multireddits, an `alert("You have no multireddits created yet. Please create one first.")` fires and the flow stops. Otherwise, an action sheet lists the user's multi names; picking one calls `addSubToMulti(multi, subredditName)` → `PUT /api/multi/{path}/r/{subredditName}` with a JSON `model` body → success alert `` `Added ${subredditName} to ${multi.name}` `` (plain `alert()`) → the multireddit list is reloaded (also invalidating that multi's cached subreddit-name list). Failure: `` alert("Something went wrong: " + e) ``.
- **Remove**: only reachable from the Subreddits hub page — expand a multireddit, long-press one of its member subreddit rows → action sheet with **"Delete From Multireddit"** / **"Share"**. Choosing delete calls `deleteSubFromMulti` → `DELETE /api/multi/{path}/r/{subredditName}` → success alert `` `Removed ${subredditName} from ${multi.name}` `` → reload. Failure: `` alert("Something went wrong: " + e) ``.
- There is no confirmation prompt before either add or remove beyond the resulting result alert (i.e., no "Are you sure you want to remove X from Y?" — the action sheet selection itself is the only gate).

### 10.4 Multireddit feed

- Tapping a multireddit row (or its icon/name area) pushes `MultiredditPage`, which reuses the same `PostsPage` component as any subreddit/home feed (`app/stack/MultiredditScreen.tsx`), so it behaves identically to a subreddit feed for sorting/voting/etc., with these multireddit-specific quirks:
  - Because Reddit's own `/user/{owner}/m/{multi}/.json` feed endpoint is described (in code comments) as "unreliable for Keyless clients," Hydra instead resolves the multi's member subreddit NAMES and fetches the equivalent **merged feed** via Reddit's combined-subreddit URL syntax, e.g. `https://www.reddit.com/r/sub1+sub2+sub3`, carrying over whatever sort (and top-time-range) was on the multi's URL.
  - If the multi's subreddit-name list can't be read from ANY of three fallback sources it tries in order (`/api/multi/{path}`, `/api/multi/{path}.json`, then the SAME path against `https://old.reddit.com` as a last resort — useful for viewing a multi you don't own, since your own multis are already cache-primed by `getMyMultis()`), a `MultiredditUnavailableError` is thrown, surfaced via `AccessFailureComponent` as: **`🔑 Reddit wouldn't share this multireddit. It may be private, deleted, or only visible to the account that owns it.`**
  - If the multi genuinely has zero subreddits, the merged-feed resolution returns a sentinel `"empty"` (distinct from an unavailable multi) rather than throwing — the feed for a legitimately-empty multireddit renders as a normal empty list rather than an error message (this specific "empty vs unavailable" distinction is called out directly in the source comments as a past bug fix: previously an empty multireddit and an unreadable one were conflated).

### 10.5 Multireddit icon fallback

- If `iconURL` is present, a square (30×30, rounded) image is shown; otherwise a generic Reddit glyph (`FontAwesome "reddit"`) is used, identically to how subreddit rows without an icon fall back.

---

## Open questions / ambiguities

1. **Documentation vs. code drift on monetization**: `documentation/*.md` throughout this scope (inbox.md, inbox_alerts.md, subreddits.md, troubleshooting.md) repeatedly references a "Hydra Pro" paid subscription that gates Inbox Alerts (push notifications), AI filters, gallery-mode depth, custom-theme saving, and stats — but `SubscriptionsContext` and `NotificationsContext` are both explicit stubs stating these were removed and everything is free now. I've treated the CODE as ground truth (no push notifications, no paid gate) per this survey's instructions, but the rewrite team should confirm whether the in-app documentation viewer itself (out of this survey's scope) also needs updating, and whether any remnant purchase/paywall UI still exists elsewhere in the app that references Pro (not found in the files I read, but I didn't survey the full Settings tree).

2. **No push notifications confirmed, but exact intended behavior for "app icon badge while backgrounded" is unclear.** Since the 60-second poll only runs via a JS `setInterval` while the app is alive, and no `AppState`/background-task/background-fetch registration was found in the files read, the badge count effectively freezes once the app is backgrounded until it's reopened. I could not fully rule out background poll registration living in a file outside this survey's assigned list (e.g., a root `App.tsx`/native module); flagging this as worth double-checking against `app/_layout.tsx` or similar root files another agent may have covered.

3. **"Mentions" as a distinct inbox category**: the documentation task description asks about "mentions" as a possible inbox filter, but no such distinct category, icon, or filter exists in the code — Reddit username mentions, if present, would arrive as ordinary `t1` comment-reply items indistinguishable in the UI from a direct comment reply. Confirmed there is no dedicated "mentions" tab/filter anywhere in this codebase.

4. **Blocked-users management screen**: I found the block action itself (profile 3-dot menu → Block, with confirm) but no dedicated "Blocked Users" list/settings screen in the files assigned to me. It's possible such a screen exists in the Settings tree (out of scope for this survey) — worth checking with whichever agent covers Settings.

5. **"Following users" feature**: the task brief mentions "following users" as an area to document, but I found no follow/unfollow UI or API call anywhere in the User page, User components, or `api/User.ts` (only the read-only `friends: boolean` field, sourced from Reddit's `is_friend`, shown as inert text in the compact search-result row). If a follow feature exists, it must live outside my assigned file set; based on everything read, **Hydra does not appear to implement a follow/unfollow feature** in this survey's scope.

6. **Wiki page navigation is a plain embedded WebView**, not a native page-tree browser — there is no in-app "list of wiki pages" or breadcrumb path UI; whatever path Reddit's own wiki page structure exposes (e.g., links to sub-pages) is navigated via the generic link-interception logic in `ThemedWebView`. A SwiftUI rewrite should decide whether to keep this WebView-based approach (simplest 1:1 fidelity) or build a native wiki-markdown renderer — the current app does NOT do the latter, so faithful reproduction favors keeping it as an embedded, reskinned web view.

7. **`NewMessage` and `ReplyToMessage` modal top-bar titles both literally read "New Message"** even when replying to an existing thread (not "Reply"), and the failure alert in both says "Failed to submit comment" (not "message"). These look like copy/paste artifacts from the comment-composer modal this was likely forked from. I documented them as-is (exact current strings) rather than "fixing" them, per the instruction to describe WHAT the app does — the rewrite team should decide whether to preserve these exact (likely unintentional) strings or correct them.
