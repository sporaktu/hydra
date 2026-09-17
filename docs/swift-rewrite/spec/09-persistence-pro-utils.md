# Hydra — Persistence, Hydra Pro/AI, Notifications, Sharing, and Cross-Cutting UI Primitives

This document is a behavioral specification (not a code walkthrough) of local persistence, the "Hydra Pro" system, notifications, sharing, and a set of shared utilities/UI primitives, as they **actually behave in the current codebase** (not as legacy in-app documentation describes them — see "Major discrepancy" callout below). File paths are TypeScript references only.

## 0. CRITICAL FINDING: Hydra Pro / paid tier has been removed from the app

Before detailing individual systems, the single most important fact for a rewrite: **the paid "Hydra Pro" subscription system, its hosted backend, push notifications, AI post/comment summaries, and AI content filters have all been stripped out of the current app**, even though in-app help documentation (`documentation/*.md`, `constants/documentation.ts`) still describes them at length as if they were live, paid features. A rewrite that aims for identical *behavior* should reproduce the current (free, offline-only) behavior, not the documentation's claims. Evidence:

- `contexts/SubscriptionsContext.tsx`: `isPro` is a **hardcoded `true`** constant for all users; `customerId` is **hardcoded `null`**. Comment in the source: "All features are free. `isPro` is kept as an always-true flag so the rest of the app can continue to gate behavior on it without a paid tier" and "There is no longer a paid customer record."
- `contexts/SettingsContexts/NotificationsContext.tsx` is an **inert stub**: `notificationsEnabled: false`, `toggleNotifications` is a no-op. Comment: "Push notifications (Inbox Alerts) relied on the hosted Hydra push backend and have been removed along with the paid tier. This context is kept as an inert stub so existing consumers continue to work without registering for push." No component in the app calls `Notifications.registerForPushNotificationsAsync` or similar — grep confirms no push-token registration code exists anywhere.
- `pages/SettingsPage/Stats.tsx`: the functions `obfuscateNumber` and `obfuscateText`, which the in-app docs say hide numbers for free users, are literally `(text) => text` — pure pass-throughs. All stats are shown unobfuscated to every user, with no Pro gating.
- AI summaries: `showPostSummary` / `showCommentSummary` exist only as dead MMKV-backed boolean toggles in `contexts/SettingsContexts/PostSettingsContext.tsx` and `CommentSettingsContext.tsx`. Grepping the whole `pages/` and `components/` trees for `"Summary"` finds **no component that reads these settings or renders a summary UI**. The feature toggle exists in Settings but does nothing.
- AI filters: no "AI filter" / "smart filter" implementation exists anywhere in `contexts/SettingsContexts/FiltersContext.tsx` or the settings pages. Only text/keyword-based subreddit and keyword filters exist (outside this survey's scope).
- `api/AI.ts` only exposes two endpoints against the Hydra server: `getEmbedding` (used solely by `utils/DocumentationSearch.ts` for semantic search over the **in-app help/documentation articles**, i.e. a local FAQ search feature) and `askQuestion` (used solely by `pages/SettingsPage/Guide.tsx`, an in-app "ask a question about how Hydra works" documentation chatbot). Neither is used for summarizing Reddit posts/comments or filtering the feed.
- `components/Modals/SubscribeToHydra.tsx` — despite its name, this modal has **nothing to do with "Hydra Pro" subscriptions**. It is a nag modal asking the user to *subscribe to the r/HydraClient subreddit on Reddit* (community engagement), shown once a year via the MMKV key `lastAskedToSubscribeToHydraClient-${currentUser?.id}`, only if the user is logged in, has subscribed subreddits loaded, and is not already subscribed to r/HydraClient.
- The "Customer ID" field the docs describe on the Advanced Settings page does not exist in `pages/SettingsPage/Advanced.tsx` — there is no customer-ID display or copy-to-clipboard control.

What remains genuinely functional and Pro-adjacent:
- **Hydra Server** (`constants/HydraServer.ts`, `api/HydraServerStatus.ts`): a real, still-used self-hostable backend (default `https://api.hydraapp.io`), used for the documentation embedding/Q&A search feature and validated via a `/api/status` health check. Users can point the app at a custom server (Advanced Settings).
- **Stats tracking** (`db/functions/Stats.ts`, `pages/SettingsPage/Stats.tsx`): fully local SQLite counters, unobfuscated, free for everyone.
- **Inbox polling and local badge updates** (`contexts/InboxContext.tsx`): real, but this is ordinary polling of the authenticated Reddit API every 60 seconds while the app is foregrounded — **not a push-notification / background-fetch system**. There is no background delivery when the app is not running; "Inbox Alerts" as push notifications described in the docs do not exist in code.
- **Pro-only themes / Theme Maker gating**: `constants/Themes.ts` still tags certain themes `isPro: true`, but since `isPro` is always `true` app-wide, this gate is permanently open — all users can use Pro themes and the Theme Maker without restriction. (Theme system internals are out of this survey's scope.)

A faithful SwiftUI rewrite should therefore: make all features unconditionally available (no entitlement/paywall system needed), implement no push notification registration, implement no AI post/comment summarization or AI content filtering, and implement the documentation semantic-search/Q&A feature as calling the same two Hydra server endpoints if that in-app help feature is to be preserved.

---

## 1. SQLite persistence (Drizzle ORM over expo-sqlite)

### 1.1 Database setup (`db/index.ts`)

- Single SQLite file named `db.db`, opened via `expo-sqlite`'s `openDatabaseSync("db.db", { enableChangeListener: true })`.
- `PRAGMA journal_mode = WAL;` is set immediately after opening (write-ahead logging for concurrent read/write).
- Wrapped by Drizzle's `expo-sqlite` driver.
- A monkey-patch on `SQLite.SQLiteStatement.prototype.executeSync` forces every prepared statement to call `finalizeSync()` right after executing, working around a known Drizzle memory leak (statements not finalized). A rewrite in native SQLite/GRDB/SQLite.swift does not need this workaround; it exists purely because of the JS driver.
- Migrations run at every app launch via Drizzle's `useMigrations(db, migrations)` React hook (see §10 Startup Sequence). If migrations fail, the error is re-thrown to be caught by Expo Router's error boundary — the app effectively crashes/shows an error screen rather than degrading gracefully.

### 1.2 Schema (`db/schema.ts`) — six tables

All six tables share the same audit-column convention: `id` (autoincrement PK), `createdAt`/`updatedAt` (`text`, default `CURRENT_TIMESTAMP`, `updatedAt` auto-refreshed via Drizzle's `$onUpdate`), and both a unique index on the table's natural key plus non-unique indexes on `createdAt`/`updatedAt` (used for LRU-style pruning by insertion order).

**`seen_posts`** (table `SeenPosts`)
- Columns: `id` PK, `postId text NOT NULL` (Reddit post fullname/id), `createdAt`, `updatedAt`.
- Unique index `postId_idx` on `postId`; indexes on `createdAt`, `updatedAt`.
- Semantics: presence of a row = the post has been marked "seen" (read). No boolean column; existence is the flag.
- Write functions (`db/functions/SeenPosts.ts`):
  - `markPostSeen(post)`: `INSERT ... ON CONFLICT DO NOTHING` on `postId` (idempotent — marking an already-seen post again is a silent no-op, `createdAt` is **not** refreshed), then synchronously emits a "seen changed → true" event.
  - `markPostUnseen(post)`: `DELETE WHERE postId = post.id`, then emits "seen changed → false".
  - `isPostSeen(post)` / `arePostsSeen(posts[])`: synchronous existence checks (single lookup or `IN` batch lookup).
  - A per-post pub/sub system (`subscribeToSeenChange(postId, listener)` / internal `emitSeenChange`) lets a single feed cell re-render its own dimmed/read state without a full FlashList `extraData` bump when a post is marked seen elsewhere (e.g. auto-marked when scrolled past, or toggled from a detail page). Listeners are stored in a `Map<postId, Set<listener>>`; unsubscribing removes the listener and, if it was the last one for that post, deletes the map entry (verified by tests to not throw on subsequent emits).
  - Ordering guarantee (verified by test): the DB write is always awaited **before** the seen-change event is emitted, so subscribers never observe the event before the row exists.
- Maintenance (`maintainSeenPosts`, called from `doDBMaintenance`): if total row count exceeds **`MAX_SEEN_POSTS = 5,000`**, finds the row that is `(count - 5000)` positions from the oldest by `createdAt` ordering, and deletes every row with a smaller autoincrement `id` than it (i.e., keeps only the most-recently-marked 5,000 seen posts). Uses `id`-based deletion, not `createdAt`, to avoid ties.

**`hidden_posts`** (table `HiddenPosts`)
- Columns: `id` PK, `postId text NOT NULL`, `title text NOT NULL`, `subreddit text NOT NULL`, `expiresAt integer NOT NULL` (epoch ms), `createdAt`, `updatedAt`.
- Unique index on `postId`; indexes on `expiresAt`, `createdAt`, `updatedAt`.
- Purely a **local** hide — never calls Reddit's own hide API. `HIDDEN_POST_EXPIRY_MS = 30 days`.
- `hidePost(post)`: upserts a row (on conflict on `postId`, updates `title`/`subreddit`/`expiresAt`) with `expiresAt = now + 30 days`. Storing `title`/`subreddit` denormalized (not just the id) lets the "review hidden posts" management screen show what was hidden without a live API call.
- `unhidePost(postId)`: deletes the row outright (does not wait for expiry).
- `isPostHidden(post)` / `arePostsHidden(posts[])`: a row existing but with `expiresAt <= now` is treated as **not hidden** (lazy expiry check at read time), even before the maintenance sweep physically deletes it.
- `getHiddenPosts()`: returns all non-expired rows (`expiresAt > now`), ordered by `createdAt` descending (most recently hidden first) — feeds the "manage hidden posts" UI.
- Maintenance (`maintainHiddenPosts`): hard-deletes all rows where `expiresAt < now`. Comment: "Run on startup as part of regular DB maintenance so the table doesn't grow without bound." No count cap — only expiry-based pruning.

**`drafts`** (table `Drafts`)
- Columns: `id` PK, `key text NOT NULL` (unique), `text text NOT NULL`, `createdAt`, `updatedAt`.
- Unique index on `key`; the composer screens pass a context-specific key string (e.g. keyed by post/comment/thread target) — the exact key-format construction lives in the composer components, outside this survey's file list, but the storage contract is: one draft per opaque string key, upserted on save.
- `getDraft(key)` → returns `text` or `undefined`. `setDraft(key, text)` → `INSERT ... ON CONFLICT DO UPDATE SET text`. `deleteDraft(key)` → `DELETE WHERE key = key`.
- `useDraftState(key)` hook: a React state wrapper — initializes state from `getDraft(key) ?? ""`, and every `setState` call (whether direct value or updater function) synchronously persists the new text to SQLite via `setDraft`. `clearDraft()` deletes the row and resets state to `""`. This means drafts are saved on **every keystroke**, not debounced.
- Maintenance (`maintainDrafts`): cap of **`MAX_DRAFTS = 100`**. Same "find the row `(count-cap)` positions from the oldest, delete everything with a smaller `id`" pattern as seen posts.

**`custom_themes`** (table `CustomThemes`)
- Columns: `id` PK, `name text NOT NULL` (unique), `data text NOT NULL` (JSON-serialized `CustomTheme` object from `constants/Themes.ts`), `createdAt`, `updatedAt`.
- `getCustomThemes()`: returns all rows, `JSON.parse`d; a parse failure for one row is caught, logged, and that theme is simply omitted (doesn't crash the whole list).
- `getCustomTheme(name)`: single lookup by name, same parse-failure handling (returns `null`).
- `saveCustomTheme(theme)`: upsert keyed on `name` (renaming a theme therefore creates a new row rather than updating in place, unless the caller explicitly deletes the old name first).
- `deleteCustomTheme(theme)`: delete by `name`.
- No maintenance/cap function exists for this table — custom themes are never auto-pruned.

**`counter_stats`** (table `CounterStats`) — the Stats feature's counters
- Columns: `id` PK, `key text NOT NULL` (unique), `count integer NOT NULL DEFAULT 0`, `createdAt`, `updatedAt`.
- The `Stat` enum (`db/functions/Stats.ts`) defines exactly these keys:
  - `app_launches` — incremented once per cold app start (in `app/index.tsx`, when migrations complete).
  - `app_foregrounds` — incremented once per cold start **and** every time `AppState` transitions to `"active"` (i.e., every foreground, including the initial launch — so `app_foregrounds >= app_launches` always).
  - `scroll_distance` — accumulated scroll distance in density-independent pixels (dp); the Stats page converts this to inches by dividing by 160 (assumed ~160dpi baseline), then to feet/meters/miles/km.
  - `posts_viewed` — count of posts opened/viewed.
  - `post_upvotes`, `post_downvotes` — vote actions on posts.
  - `posts_created` — posts submitted by the user.
  - `comment_upvotes`, `comment_downvotes` — vote actions on comments.
  - `comments_created` — comments submitted by the user.
  - (Increment call sites for `scroll_distance`, `posts_viewed`, vote/creation counters live outside this survey's assigned files, in the relevant feed/post/comment components; only the storage contract and the `Stat` enum itself are in scope here.)
- `getStat(key)`: returns the count or `0` if no row exists. `getStats()`: returns a `Record<Stat, number>` of every row. `resetStats()`: deletes **all** counter rows (used by a "reset stats" settings action, if present elsewhere).
- `modifyStat(key, delta)`: `INSERT ... ON CONFLICT DO UPDATE SET count = count + delta` — atomic increment/decrement via SQL, not read-modify-write in JS.
- No maintenance/pruning — this table never grows beyond the fixed set of `Stat` enum keys (one row per key, ever).

**`subreddit_visits`** (table `SubredditVisits`) — drives "Favorite/most-visited Communities" in Stats
- Columns: `id` PK, `subreddit text NOT NULL` (unique), `count integer NOT NULL DEFAULT 1`, `createdAt`, `updatedAt`.
- `getSubredditVisitCounts()`: returns `Record<subredditName, count>`.
- `incrementSubredditVisitCount(subreddit)`: `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1` (default `1` on first insert since the column default is `1`, then the conflict path increments further visits by 1 each).
- The Stats page sorts entries by count descending, takes the top 10, and renders a relative progress bar against the single most-visited subreddit's count. No maintenance/pruning function exists for this table either — it grows unboundedly with the number of distinct subreddits ever visited.

### 1.3 Maintenance orchestration (`db/functions/Maintenance.ts`)

`doDBMaintenance()` runs, **in this fixed order**: `maintainSeenPosts()` → `maintainHiddenPosts()` → `maintainDrafts()`. Note `CustomThemes`, `CounterStats`, and `SubredditVisits` have **no** maintenance step — they are never pruned by this function (or anywhere else found in the codebase). Invoked once, from `app/index.tsx`, deferred via `InteractionManager.runAfterInteractions(...)` after migrations complete, so it runs after the first frame rather than blocking startup (see §10).

### 1.4 Migration history (`drizzle/*.sql` + `drizzle/meta/`)

Six migrations, applied via Drizzle's Expo runtime migrator against `drizzle/meta/_journal.json` (schema `dialect: sqlite`, journal `version: 7`, snapshot `version: 6`):

0. `0000_glorious_brother_voodoo` — create `seen_posts` (no indexes yet).
1. `0001_light_shiva` — add `seen_posts` indexes (`postId_idx` unique, `createdAt_idx`, `updatedAt_idx`).
2. `0002_exotic_silver_surfer` — create `drafts` + its three indexes.
3. `0003_motionless_lady_ursula` — create `custom_themes` + its three indexes.
4. `0004_secret_morg` — create `counter_stats` and `subreddit_visits`, each with their three indexes, in one migration.
5. `0005_hidden_posts` — create `hidden_posts` + its four indexes (including the `expiresAt` index used for the expiry sweep).

A rewrite should replicate this exact column/index/uniqueness shape (e.g. in Core Data or GRDB/SQLite.swift) to preserve identical query performance characteristics and upsert semantics (`ON CONFLICT` upserts on the natural unique key for every table).

---

## 2. Non-SQLite persistence

### 2.1 MMKV key-value store (`utils/KeyStore.ts`)

`KeyStore` is a thin default export of `createMMKV()` from `react-native-mmkv` — a single, unencrypted, unnamespaced MMKV instance used both directly (`KeyStore.getString/getBoolean/getNumber/set/remove/getAllKeys`) and indirectly through the `react-native-mmkv` React hooks (`useMMKVBoolean`, `useMMKVString`, `useMMKVNumber`) scattered across settings contexts. Below is every key found via exhaustive grep, grouped by owning module (this survey's assigned files only; broader settings-context keys such as theme/appearance/gesture toggles belong to other survey areas and are only listed here if they surfaced in files this survey read).

**Reddit content sort preferences** (`constants/SettingsKeys.ts`, consumed by `utils/RedditURL.ts`, written by `components/Navbar/SortAndContext.tsx`):
- `defaultPostSort`, `defaultPostSortTop` — string, global default post sort / top-sort time window.
- `rememberPostSubredditSort` — boolean; when true, per-subreddit sort is remembered instead of always using the global default.
- `sortHomePage` — boolean; whether the default-sort logic also applies to the Home feed (vs. only subreddits).
- `PostSubredditSort-${subreddit.toLowerCase()}` / `PostSubredditSortTop-${subreddit.toLowerCase()}` — per-subreddit remembered sort/top-window (dynamic key, subreddit name lower-cased).
- `defaultCommentSort` — string, global default comment sort.
- `rememberCommentSubredditSort` — boolean, same pattern for comments.
- `CommentSubredditSort-${subreddit.toLowerCase()}` — per-subreddit remembered comment sort.

**Hydra server** (`constants/HydraServer.ts`):
- `useHydraServer` (boolean) — whether to use a custom self-hosted server instead of the default.
- `customHydraServerUrl` (string) — the custom server URL, only persisted after `hydraServerStatus()` validation succeeds (see §4). Read at **module load time** (not reactively), so a change requires an app restart to take effect — this matches the in-app documentation's explicit instruction to restart after changing the server URL.

**Account / session** (`contexts/AccountContext.tsx`):
- `usernames` (string) — JSON-serialized `string[]` of every Reddit account ever logged into this device (added to on login, removed from on account removal).
- `currentUser` (string) — the currently active username; absence means logged out. Removed on logout.

**Navigation / startup** (`contexts/NavigationContext.tsx`):
- `startupURL` (string, default `"https://www.reddit.com/"`) — the URL the app opens to on launch; read once at module load to compute the initial nav stack.
- `initialTab` (string) — which of the 5 tabs (`Posts`, `Inbox`, `Account`, `Search`, `Settings` — see `TabIndices`) the app opens to.

**Per-account favorites** (`contexts/SubredditContext.tsx`):
- `favoriteSubreddits:${currentUser.id}` (string) — JSON `string[]` of favorited subreddit names, namespaced per logged-in account by Reddit user id. Favoriting/unfavoriting requires being logged in and subscribed to the subreddit (throws in-app alerts otherwise, not persistence errors).

**Startup modal gating** (`contexts/StartupModalContext.tsx` + the two modal components):
- `lastSeenUpdate` (string) — the last "What's New" `updateKey` the user has seen (currently `"v4.0.0"`); the update modal shows whenever this differs from the current build's key.
- `storeReviewRequested` (boolean) — set once the user has answered (either way) the App Store review prompt; prevents re-asking.

**"Join r/HydraClient" nag** (`components/Modals/SubscribeToHydra.tsx`):
- `lastAskedToSubscribeToHydraClient-${currentUser?.id}` (number, epoch ms) — re-asks at most once per 365 days per account.

**External link handling** (`utils/openExternalLink.ts`):
- `externalLinkBrowser` (string, default `"internalBrowser"`) — one of `internalBrowser | defaultBrowser | chrome | brave | firefox | edge | opera`; selects the URL-scheme rewrite used when opening external links (see §"cross-cutting utilities" below).
- `openInReaderMode` (boolean, default `false`) — only applies to the internal in-app browser (`expo-web-browser`), enabling Safari Reader Mode-style rendering.

**Clipboard URL detection** (`pages/SettingsPage/General/OpenInHydra.tsx` key, consumed by `utils/useHandleIncomingURLs.ts`):
- `readClipboard` (boolean, default `true` per `READ_CLIPBOARD_DEFAULT`) — gates whether Hydra checks the clipboard for a Reddit URL on foreground/launch and offers to open it.

**Error reporting** (`pages/SettingsPage/Privacy.tsx`):
- `allowErrorReporting` (boolean, default `true` — i.e. Sentry is enabled unless explicitly set to `false`) — read once at module load in `app/index.tsx` to decide `Sentry.init({ enabled: ... })`; requires app restart to change (matches documented restart requirement).

**Video cache** (`utils/VideoCache.ts`):
- `videoCacheClearRequested` (boolean) — a deferred-clear flag; see §2.3.

**RedGifs API token cache** (`utils/RedGifs.ts`, outside this survey's core scope but grepped):
- `redgifsToken` (string) — cached bearer token for the RedGifs API.

**Post detail settings** (`api/PostDetail.ts`):
- `collapseAutoModerator` (boolean, default `true`) — whether AutoModerator's stickied comment is collapsed by default.

**Gallery mode one-time offer** (`utils/useOfferGalleryMode.ts`):
- `has_already_offered_gallery_mode` (boolean) — a feed showing ≥100 posts where ≥85% of posts contain media, on a non-combined-subreddit-feed page, triggers a one-time offer to switch to Gallery Mode; this key ensures it's only offered once ever, app-wide.

**One-time alert helper** (`utils/oneTimeAlert.ts`): a generic utility — `oneTimeAlert(key, title, message)` shows a native `Alert` only if the given boolean MMKV key is not already set, then sets it. Callers elsewhere in the app supply their own keys; this is a reusable primitive, not itself a specific persisted key.

**Sorting reset utility** (`pages/SettingsPage/General/Sorting.tsx`): reads `KeyStore.getAllKeys()` and removes every key matching the per-subreddit sort key patterns (`PostSubredditSort-*`, `CommentSubredditSort-*` etc.) — a "reset all remembered subreddit sorts" action, implying MMKV is otherwise unnamespaced/flat and must be filtered by prefix for bulk operations.

Note: many additional MMKV keys exist for appearance/theme/gesture/data-mode settings (`contexts/SettingsContexts/*`) that are out of this survey's explicit scope; those context files were only inspected where they intersected notifications, filters-key constants, or Pro/dead-feature toggles.

### 2.2 SecureStore (`utils/RedditCookies.ts`) — account credentials

Hydra does **not** store a Reddit username/password. Authentication is entirely cookie-based:
- Key format: `redditSession-${username}` (one entry per logged-in account).
- Value format: `JSON.stringify(cookies.reddit_session)` — the serialized `reddit_session` cookie object as read from the native cookie jar (`@preeternal/react-native-cookie-manager`) for `https://www.reddit.com`, i.e. whatever shape that cookie library returns for a single cookie (name/value/domain/path/expires, etc.), stringified as-is.
- `restoreSessionCookies(username)`: reads the SecureStore entry and re-applies it into the WebKit/native cookie jar via `CookieManager.set` — this is how switching between multiple logged-in accounts works: only one account's session cookie lives in the actual cookie jar at a time; the others sit serialized in SecureStore and get swapped in.
- `getSessionCookies(username)`: raw read, used by `AccountContext.doWithTempLogout` to snapshot/restore state around an operation that needs to run logged-out temporarily.
- `hasSessionCookieBeenSet()`: checks whether the cookie jar currently has a `reddit_session` cookie at all (used right after an OAuth/login web-view flow completes, before it's been persisted to SecureStore).
- `saveSessionCookies(username)`: reads the current cookie jar's `reddit_session` and persists it to SecureStore under that username's key — called right after successful login.
- `deleteSessionCookies(username)`: removes the SecureStore entry — called when a user account is removed from the device.
- `persistSessionCookies()`: if the current `reddit_session` cookie has no `expires` field (a session-only cookie that would be dropped when the app/webview process ends), rewrites it in the cookie jar with an artificial expiry ~10,000 days out (`Date.now() + 1000*60*60*24*10000`), effectively making login "stick" indefinitely instead of expiring at process end.
- `clearSessionCookies()`: a defensive, multi-step logout — first overwrites the `reddit_session` cookie with an explicitly expired (epoch 0) stale value on both the HTTP and WebKit-synced cookie stores (`CookieManager.set(..., true)` — the boolean forces a WebKit-side set), *then* calls `CookieManager.clearAll()` on both. The comment explains this order is a workaround for a known bug in `react-native-cookies` where `clearAll(true)` triggers a WebKit→HTTP sync that can resurrect just-cleared cookies; pre-expiring the cookie first prevents that resurrection.

A SwiftUI rewrite should use the iOS Keychain (the native equivalent of Expo SecureStore) keyed identically by `redditSession-<username>`, and should replicate the "long expiry rewrite" and "pre-expire before clearAll" defensive ordering if using `WKWebsiteDataStore`/`HTTPCookieStorage` for the Reddit session cookie, to avoid the same resurrection bug class.

### 2.3 File-based / native media caches

**Image cache** (`utils/ImageCache.ts`, via `expo-image`'s SDWebImage-backed disk+memory cache on iOS):
- `MAX_DISK_CACHE_SIZE = 512 MB`, `MAX_MEMORY_CACHE_SIZE = 256 MB` (constant name says "128MB" in a comment inside `useMediaSharing.tsx`-adjacent code, but the actual configured value in `ImageCache.ts` is `1024*1024*256` = 256 MB — the 256 MB literal is authoritative).
- Configured once at module load via `Image.configureCache(...)`, **iOS only** (`Platform.OS === "ios"` guard).
- On an OS `memoryWarning` `AppState` event, `Image.clearMemoryCache()` is called globally (registered once at module load, not per-component).
- Cache directory inspected directly on disk at `${Paths.cache.uri}/com.hackemist.SDImageCache/default` (SDWebImage's own on-disk layout) purely to **compute a human-readable size** for the Advanced Settings "Clear Image Cache (N MB)" button; the actual clear operation goes through `Image.clearDiskCache()` (the expo-image API), not manual file deletion.
- `ImageCache.useCache()` hook: recomputes cache size whenever the settings screen regains focus (`useIsFocused`), and exposes a `clearCache(withAlert = true)` that clears then resets the displayed size to 0, optionally showing a native "Cache Cleared" alert.

**Video cache** (`utils/VideoCache.ts`, via `expo-video`'s native cache):
- `MAX_VIDEO_DISK_CACHE_SIZE = 1 GB`, set once at module load via `setVideoCacheSizeAsync`.
- `getCacheSize()`: synchronous native call `getCurrentVideoCacheSize()`.
- Clearing is **deferred, not immediate**: `requestCacheClear()` just sets the `videoCacheClearRequested` MMKV boolean and shows an alert telling the user the cache clears **on next app restart** — because, per the code comment, the native video cache "cannot be cleared when any video components are mounted." `clearCacheIfRequested()` is called once at startup (before any UI mounts video players — see §10) to actually perform `clearVideoCacheAsync()` if the flag is set, then resets the flag.
- `makeCachedVideoSource(uri)`: decides per-video whether expo-video should cache it at all. Caching is **skipped** for URLs whose path ends in `.m3u8` (HLS playlists — fundamentally not single-file-cacheable) or `.gif` (Reddit serves some videos as an mp4 transcode behind a `.gif`-suffixed URL via `?format=mp4`; caching would store mp4 bytes under a `.gif` extension, and expo-video's cache infers MIME type from the URL extension, so AVFoundation would fail to decode the cached file — better to always stream those directly so the real `Content-Type` header is honored).

**Media share/save downloads** (`utils/useMediaSharing.tsx`): images/videos being shared or saved are first downloaded to a **temporary** file in `Paths.cache.uri` (not the persistent SDWebImage/expo-video caches), named after the URL's base filename; any pre-existing file at that path is deleted first. The temp file is deleted in a `finally` block after the share/save operation completes, win or lose — so this is not a persistent cache, just a scratch file for the OS share sheet / photo library APIs to read from.

---

## 3. Hydra Pro / AI features — actual current behavior

(See §0 for the headline finding that this system is largely vestigial.) What's real:

### 3.1 Hydra Server (`constants/HydraServer.ts`, `api/HydraServerStatus.ts`, `api/AI.ts`)

- `DEFAULT_HYDRA_SERVER_URL = "https://api.hydraapp.io"`.
- `HYDRA_SERVER_URL`: in dev builds (`__DEV__`), resolved from `process.env.EXPO_PUBLIC_HYDRA_SERVER` or falls back to the default; in production builds, resolved from the MMKV key `customHydraServerUrl` (falls back to default if unset). Read once at module import time — changing the custom server URL requires an app restart, as the Advanced Settings screen explicitly tells the user.
- `USING_CUSTOM_HYDRA_SERVER`: true only if the `useHydraServer` MMKV boolean is set **and** the custom URL does *not* contain the substring `"hydraapp.io"` (i.e., pointing at the official server, even via the "custom server" toggle, doesn't count as "using a custom server" for whatever downstream logic consumes this flag — not observed elsewhere in this survey's files, likely feature-gating logic in another area).
- Health check: `hydraServerStatus(customServerURL)` — `GET ${customServerURL}/api/status`, considered valid only if the HTTP status is exactly `200` **and** the response body text is exactly the literal string `"Hydra server is up"`. Any thrown error (network failure, timeout, etc.) is caught and treated as invalid (`false`), never surfaced to the caller as an exception.
- Advanced Settings flow (`pages/SettingsPage/Advanced.tsx`): typing/changing the custom server URL text field triggers `validateCustomServerUrl` in a `useEffect` (debounced only by the effect firing on every keystroke via `customServerUrl` state, i.e. not explicitly debounced — every change re-validates). While validating, `isCustomServerValid` is `null` → shows "Checking server status...". On success (`true`), the URL is **immediately persisted** to `customHydraServerUrl` and the UI shows a success message instructing a restart. On failure (`false`), the URL is explicitly **not saved**, and an error message is shown. The `useCustomHydraServer` toggle itself is a separate MMKV boolean (`useHydraServer`) that doesn't gate the validation UI's visibility beyond conditionally rendering the URL input/status block.
- `api/AI.ts` — two endpoints, both `POST`, both parsing the response as JSON with no error handling beyond what `fetch` itself throws:
  - `getEmbedding(text)` → `POST {DEFAULT_HYDRA_SERVER_URL}/api/ai/createEmbedding` with body `{ text }`, **always** hits the *default* server URL (not the possibly-custom `HYDRA_SERVER_URL`) — i.e. documentation search embeddings are never routed through a self-hosted server. Returns `number[]` (an embedding vector).
  - `askQuestion(question, docs)` → `POST {HYDRA_SERVER_URL}/api/ai/askQuestion` (this one **does** respect a custom server) with body `{ question, docs }`. Returns `{ markdown: string }`.

### 3.2 In-app documentation semantic search (`utils/DocumentationSearch.ts`)

This is the only real consumer of `getEmbedding`. `DOCUMENTATION` (`constants/documentation.ts`) is a static map of documentation article keys → `{ vector: number[], ... }`, where each article's embedding vector was presumably pre-computed offline and baked into the app bundle (not computed at runtime). At query time:
- `find(query, k)`: embeds the user's free-text query via `getEmbedding` (one network round-trip to the Hydra server), then does a **local, in-app** k-nearest-neighbor search against the bundled per-article vectors using cosine similarity (vectors are assumed pre-normalized, so cosine similarity reduces to a plain dot product).
- Performance-tuned dot product: computed with a manual 16-way loop-unroll ("I tested this and the performance difference is significant" per the source comment) into a `Float32Array` of per-article scores.
- Top-k selection: a partial insertion-sort maintaining a size-`k` sorted array via binary-search insertion (`O(n log k)` overall rather than a full sort), returning the `k` article keys in descending similarity order.
- Used by `pages/SettingsPage/Guide.tsx`'s search box (semantic doc search) and its "ask a question" flow (which additionally calls `askQuestion` with the retrieved docs as context — a basic on-device RAG pattern against Hydra's own help content, not against Reddit content).

### 3.3 Dead/vestigial Pro surface area (for completeness — do not reproduce in the rewrite unless intentionally recreating a paywall)

- Paywall modal contents: **none exist in code.** No component named anything like `Paywall`, `UpgradeModal`, or similar was found; `SubscribeToHydra.tsx` (the only modal with "Subscribe" in its name) is the r/HydraClient nag described in §0, not a Pro paywall.
- IAP/entitlement plumbing: no `react-native-purchases`, `RevenueCat`, `expo-in-app-purchases`, or `StoreKit` references anywhere in the source tree.
- Offline behavior for AI features: moot, since the only live AI-backed feature (doc search/Q&A) simply fails its `fetch` call offline with no special offline UI observed in the reviewed files (would surface as an unhandled promise rejection / thrown error at the call site in `Guide.tsx`, outside this survey's scope to trace further).

---

## 4. Notifications and Inbox polling

### 4.1 `NotificationsContext` — stub (§0). No permission flow, no push token registration, no badge-from-push anywhere in the app.

### 4.2 `InboxContext` (`contexts/InboxContext.tsx`) — real local polling + badge

- State: `inboxCount` (number of **new/unread** inbox items), exposed with a manual `setInboxCount` setter and a `checkForMessages()` function.
- Polling: only active while `currentUser` is set (logged in). On login (or whenever `currentUser` changes to a truthy value), starts a `setInterval` firing `checkForMessages` every **60,000 ms (60 seconds)**, and calls it once immediately. On logout (`currentUser` becomes falsy), clears the interval and resets `inboxCount` to `0`.
- `checkForMessages()`: guards on `UserAuth.modhash` being set (a truthy check meant to skip the poll during the brief window where an account is set in state but the login handshake hasn't finished, e.g. while swapping accounts) — if unset, it silently returns without altering `inboxCount`. Otherwise calls `getInboxItems()` (`api/Messages.ts`, outside this survey's scope) and counts items where `.new === true`.
- Badge: a separate `useEffect` calls `Notifications.setBadgeCountAsync(inboxCount)` (from `expo-notifications`) every time `inboxCount` changes — this sets the **app icon badge number** on the home screen. This is the one place `expo-notifications` is actually used in the reviewed files, and it is purely for the badge API, not for scheduling or receiving any local/remote notification.
- **No background fetch / background task** registration was found for inbox polling — polling only runs while the JS runtime is alive and the app is foregrounded (an `AppState`-driven timer, not `expo-background-fetch` or `expo-task-manager`). This is a key divergence from the "Inbox Alerts" documentation's claim of push notifications "even when the app is not running."
- A rewrite targeting *identical current behavior* should implement: a 60-second foreground poll timer gated on being logged in, updating the app icon badge to the "new" inbox item count, and **no** actual push notification delivery, no notification permission prompt, and no background execution.

---

## 5. Sharing

### 5.1 URL sharing (`utils/shareURL.ts`)

`shareURL(url)` wraps React Native's `Share.share`. Platform-specific payload shape, driven by a documented RN quirk (tested in `utils/__tests__/shareURL.test.ts`):
- **iOS**: `Share.share({ url })` — the `url` field is honored on iOS and produces the rich link preview in the share sheet.
- **Android** (out of scope, N/A for the iOS rewrite, but documented for completeness): `Share.share({ message: url })`, since iOS-only `url` field is silently dropped on Android.

Callers pass Reddit's canonical `post.link` / a subreddit or comment URL directly — this survey did not find a separate "short link" generation utility; sharing uses whatever full URL the API/data layer already produced for that entity (post permalink, subreddit URL, user profile URL, etc.). Per `documentation/sharing.md`, only the link itself is shared — no account/session data is embedded in the shared content.

### 5.2 Media sharing and saving (`utils/useMediaSharing.tsx`)

Two exported hooks share a private `useMediaDownload` helper that: guards re-entrancy with a `useRef` flag (a second call while one is in flight is dropped silently), resolves the highest-resolution URL from either a plain string or an `ImageSource[]` array (`getMediaURL` takes the array's **last** entry, assumed highest resolution), shows a themed "Preparing Image/Video..." modal (rendered via `ModalContext`, dismissible by tapping the backdrop) while downloading the file to a temp cache path, then hands the downloaded `File` to a caller-supplied continuation and deletes the temp file in a `finally` block regardless of outcome.

- `useMediaSharing()` (default export): continuation calls `Share.share({ url: file.uri })` (a local file URI, so the OS share sheet gets an actual file rather than a remote link — enabling "Save Video"/"Save Image" options in the native share sheet per `documentation/downloading_media.md`). On failure: `Alert.alert("Error", "Failed to download {image|video}")`.
- `useMediaSaving()`: first requests the **add-only** photo library permission (`MediaLibrary.requestPermissionsAsync(true)` — the `true` argument requests write-only/add-only access rather than full read/write, a privacy-minimizing choice), and if denied shows an alert directing the user to Settings. On success, downloads then calls `MediaLibrary.saveToLibraryAsync(file.uri)` and shows a plain success alert (`"{Image|Video} saved to Photos"`). This is the direct "long-press → Save Image/Video" path that bypasses the OS share sheet entirely.

### 5.3 Inbound sharing / "Share Extension" (`useHandleIncomingURLs.ts` + `expo-sharing` config plugin)

Hydra's iOS Share Extension (appearing as a share-sheet destination in *other* apps, e.g. Safari, so a user can share a webpage URL "to Hydra") is implemented entirely through the **`expo-sharing` Expo config plugin** (`app.config.ts`), which generates the native Share Extension target at build time — there is no custom Swift/JS share-extension source in this repository. Configuration: `ios.enabled: true`, `activationRule: { supportsWebUrlWithMaxCount: 1 }` — the extension activates only when exactly one web URL is being shared (not images, not multiple items).

Inbound handling, in `utils/useHandleIncomingURLs.ts`:
- `handleSharedLink()`: calls `expo-sharing`'s `getResolvedSharedPayloadsAsync()`; if there's at least one payload with a `contentUri`, it's treated as a URL and routed through the same `handleURL` pipeline as deep links (see below), then `clearSharedPayloads()` is called to consume it.
- Checked both on initial mount (once navigation is ready) and every time the app transitions to `AppState === "active"` (so a share made while the app was backgrounded is picked up on return-to-foreground, not just cold launch).
- `handleURL(url)`: resolves short links first (`RedditURL.resolveURLIfValid` — handles `redd.it/<id>`, `/r/<sub>/s/<id>`, `/user/<name>/s/<id>` share-link redirects), determines the Reddit `PageType`; if `UNKNOWN`, shows `Alert.alert("Unknown URL", ...)` and stops. Otherwise force-switches the tab bar to the "Posts" tab (`TabActions.jumpTo("Posts")`) and pushes the resolved URL's corresponding stack screen (`PageTypeToNavName[pageType]`).
- Custom URL scheme deep links (`hydra://openurl?url=<url>`) go through the same `handleURL` after being unwrapped, handled both via `Linking.getLinkingURL()` at startup and the `Linking` `"url"` event listener while running.
- Clipboard URL detection (`handleClipboardURL`): gated by the `readClipboard` MMKV setting (default on); on every foreground transition, reads `Clipboard.getUrlAsync()`, and if it parses as a `RedditURL`, prompts `Alert.alert("Open Reddit URL?", ...)` with Cancel/Open — both branches clear the clipboard URL afterward (`Clipboard.setUrlAsync("")`) to avoid re-prompting for the same clipboard content on the next foreground.

### 5.4 Outbound share button locations (from `documentation/sharing.md`, cross-checked against `PostComponent.tsx`'s action catalog in §6): long-press context menu ("Share" action), an assigned swipe-gesture direction (via `Slideable`, using `theme.share` color and a `FontAwesome "share"` icon), the post detail action bar's share button, the three-dot menu on subreddit/multireddit/post-detail pages (page-link sharing), and long-press-to-share on images/videos directly, plus a share button inside the full-screen gallery overlay.

---

## 6. The `Slideable` swipe primitive and the component-actions catalog

### 6.1 `Slideable` (`components/UI/Slideable.tsx`)

A generic horizontal-swipe-to-reveal-action primitive wrapping any child content (used for post/comment rows). Mechanics:

- **Thresholds**: `SHORT_SWIPE_THRESHOLD = 75` px, `LONG_SWIPE_THRESHOLD = 130` px (device-independent points). Drag distance magnitude is bucketed into a `SwipeBand`: `0` (no action revealed), `±1` (short band — magnitude ≥75 and <130), `±2` (long band — magnitude ≥130). Sign encodes direction: positive (rightward drag) reveals the **left**-side option slot, negative (leftward drag) reveals the **right**-side option slot — naming reflects which edge the revealed icon sits against, not the drag direction.
- Up to four distinct actions can be wired per instance via props: `shortLeftName`, `longLeftName`, `shortRightName`, `longRightName` — each a key into the `options` array. If a "long" name is not configured for a direction, the long band falls back to that direction's short action (`longItem ?? shortItem`), so a component can opt into just 1–2 swipe actions per side without breaking the long-swipe gesture.
- **Gesture recognition** (`react-native-gesture-handler` `Gesture.Pan`): activates only on mostly-horizontal movement — `activeOffsetX([-engageDistance, engageDistance])` where `engageDistance` defaults to 20px (`xScrollToEngage` prop) — and explicitly fails on vertical movement beyond `failOffsetY([-10, 10])`, so the enclosing vertical list scroll takes over for any drag that isn't clearly horizontal.
- **`swipeAnywhereToNavigate` coexistence**: when this global gesture setting (`GesturesContext`) is on, the pan's rightward activation window is widened to `[-engageDistance, Number.MAX_SAFE_INTEGER]` and any rightward translation is clamped to `Math.min(translationX, 0)` before banding — i.e. rightward swipes never activate this component's own reveal at all, so the OS/global "swipe from anywhere to go back" gesture always wins over a Slideable row's left-reveal action. Leftward swipes are unaffected.
- All drag tracking runs on the UI thread via Reanimated shared values (`translateX`, `lastBand`, `activated`); only band *changes* and the final release hop to the JS thread (`runOnJS`), keeping 60fps swipe tracking even under JS-thread load (e.g. a busy feed re-render).
- **Haptics**: `hapticEngage()` (light impact, from `utils/haptics.ts`) fires exactly once per band transition (i.e., once when crossing into the short band, again when upgrading into the long band) — not continuously during drag.
- **On release** (`onEnd`): if the released band is non-zero, that band's configured action's `.action()` callback fires immediately (not waiting for the spring-back animation).
- **On finalize** (`onFinalize`, which fires for *every* gesture attempt including ones that failed to activate, e.g. a vertical drag): only resets state if `activated` was actually set true in `onStart` for *this* row (guards against one row's finalize incorrectly clearing global `scrollDisabled` state while a sibling row's swipe is still mid-flight in a virtualized list). When it does run: springs `translateX` back to 0 (`damping: 100, stiffness: 300, overshootClamping: true`), and once the spring settles, clears the revealed slide-item state (so the icon disappears exactly when the row visually returns to rest, not before).
- **Scroll locking**: `setScrollDisabled(true)` (via `ScrollerContext`) on gesture start, `setScrollDisabled(false)` on finalize — prevents the enclosing list from scrolling while a swipe is in progress.
- **Visuals**: the revealed background is a solid color block (`slideItem.color`, defaulting to `theme.tint` when nothing is revealed) containing the action's icon (cloned with the icon's configured `size` — default 32 — and forced to `theme.text` color) positioned against the left or right edge depending on which side is engaged.

### 6.2 Native long-press context menu (`components/UI/NativeContextMenu.tsx`)

Platform-split wrapper: **on iOS**, wraps children in a `zeego/context-menu` `Root`/`Trigger`/`Content` tree, rendering one `Item` per `{ label, handle, destructive? }` action (destructive actions get iOS's native red destructive-item styling). Menus can nest (an inner menu, e.g. on an image inside a comment, takes priority on press-and-hold over an outer one). **On Android** (out of scope but documented): renders children completely unwrapped, deferring to the existing long-press action-sheet fallback instead. A `style` prop's `flex` shorthand is specially expanded into explicit `flexGrow`/`flexShrink`/`flexBasis` longhands and applied only to the native menu root view (not the trigger), working around a Yoga layout quirk where zeego's `flexGrow: 0` default otherwise overrides a naive `flex: 1` passthrough and collapses the wrapped content to zero width.

### 6.3 `useContextMenu` (`utils/useContextMenu.ts`) — the Android/cross-platform action-sheet fallback

A promise-based wrapper around `@expo/react-native-action-sheet`: `openContextMenu({ options, ...ActionSheetOptions })` fires a selection haptic (`hapticSelection`) immediately on open, sets a global "an action sheet is showing" flag (`ActionSheetBgContext` — likely consumed elsewhere to suppress other UI, e.g. dim navigation, outside this survey's scope), appends a synthetic `"Cancel"` option at the end, and resolves to either the selected option string or `null` (both an explicit Cancel tap and a dismiss-without-selecting resolve to `null`). Respects the current theme's light/dark mode for the sheet's native styling (`userInterfaceStyle: theme.systemModeStyle`).

### 6.4 `useComponentActions` (`utils/useComponentActions.ts`) — the generic action-catalog factory

This file is **not itself a catalog** — it's a reusable hook/factory that any component can call with its own list of `{ label, isAllowed?, isLongPressOption?, isAccessibilityAction?, handle }` entries (defaults: all three booleans `true`). It derives, from one action list:
- `accessibilityActions` — VoiceOver custom actions (filtered to `isAllowed && isAccessibilityAction`), exposed as `{ name: label }` pairs for RN's `accessibilityActions` prop.
- `handleAction(label)` — imperative dispatch by label (used by `Slideable`'s swipe callbacks to fire the same named action a long-press or accessibility action would).
- `handleAccessibilityAction(event)` — routes a VoiceOver custom-action invocation back to the matching handler.
- `handleLongPress()` — opens the Android/fallback action sheet (`useContextMenu`) with the subset of actions where `isLongPressOption` is true, and dispatches the chosen one.
- `longPressOptions` — the same subset pre-resolved as `{ label, handle }` pairs, shaped for `NativeContextMenu` (iOS), which needs handlers up front rather than resolving a label after the fact.

**The only current caller is `PostComponent.tsx`** (`components/RedditDataRepresentations/Post/PostComponent.tsx`), which defines the actual, concrete action catalog for a feed post cell:

| Label | isLongPressOption | isAllowed condition | Effect |
|---|---|---|---|
| `Read post contents` | **false** (accessibility-only) | always | Builds a spoken summary (external link host, post text, video/image count, poll presence) and calls `AccessibilityInfo.announceForAccessibility` |
| `Open external link to {host}` | **false** (accessibility-only) | `!!post.externalLink` | If the external link is itself a Reddit URL, pushes it as an in-app page; otherwise opens it via `openExternalLink` |
| `Upvote` | true | always | Calls Reddit vote API with `VoteOption.UpVote`, updates local `upvotes`/`userVote` state |
| `Downvote` | true | always | Same, `VoteOption.DownVote` |
| `Mark as Unread` / `Mark as Read` (label flips on current `seen` state) | true | always | Toggles `SeenPosts` via `markPostSeen`/`markPostUnseen` |
| `Filter Subreddit` | true | `!!deletePost` (i.e. only in a list context that supports removing the cell) | Opens a **nested** action sheet (`useContextMenu`) with `"Filter for a day" / "Filter for a week" / "Filter forever"`; computes `expiresAt` accordingly (`Date.now() + 1 day`, `+7 days`, or `true` for permanent), calls `toggleFilterSubreddit(subreddit, expiresAt)`, then removes the post from the current list via `deletePost` |
| `Unhide Post` / `Hide Post` (label flips on `hidden` state) | true | `!!deletePost` | Toggles the `HiddenPosts` table (§1.2) and, when hiding, removes the cell via `deletePost` |
| `Unsave` / `Save` (label flips on `post.saved`) | true | always | Calls `saveItem(post, !post.saved)` (Reddit save API) and updates local state |
| `Share` | true | always | `shareURL(post.link)` — the post's canonical permalink |

Swipe (`Slideable`) options for a post, independently defined (icon / color / handler), reusing the same `handleAction(label)` dispatcher so swipe and long-press/accessibility stay behaviorally identical:

| Swipe option name | Icon | Color token | Fires action |
|---|---|---|---|
| `upvote` | Feather `arrow-up`, size 38 | `theme.upvote` | `Upvote` |
| `downvote` | Feather `arrow-down`, size 38 | `theme.downvote` | `Downvote` |
| `hide` | Feather `eye-off`/`eye` (depending on current `seen`) | `theme.showHide` | `Mark as Unread`/`Mark as Read` (despite the swipe-option name "hide", this is wired to the seen/unseen toggle, **not** the Hide-Post action) |
| `bookmark` | FontAwesome `bookmark`/`bookmark-o` (depending on `post.saved`) | `theme.bookmark` | `Unsave`/`Save` |
| `share` | FontAwesome `share` | `theme.share` | `Share` |

Which of these five map to which of the four swipe slots (short-left/long-left/short-right/long-right) is itself user-configurable via `GesturesContext.postSwipeOptions` (`{ right, farRight, left, farLeft }`) — outside this survey's scope to enumerate defaults, but the wiring contract is: `shortLeftName = postSwipeOptions.right`, `longLeftName = postSwipeOptions.farRight`, `shortRightName = postSwipeOptions.left`, `longRightName = postSwipeOptions.farLeft`.

On iOS, `onLongPress` on the post's outer `TouchableOpacity` is explicitly disabled (`undefined`) in favor of `NativeContextMenu`; on Android it fires `handleLongPress()` directly (guarded against multi-touch: `e.nativeEvent.touches.length > 1` is ignored).

(Comment/subreddit/other component action catalogs were not found using `useComponentActions` and are presumably implemented with bespoke logic in those components — outside this survey's assigned file list.)

### 6.5 `useSettingsPicker` (`utils/useSettingsPicker.tsx`)

A small settings-row helper built on `useContextMenu`: given `{ items: {label, value}[], value, onChange }`, returns `{ openPicker, rightIcon }` where `rightIcon` is a themed `<Text>` showing the current selection's label (meant to be passed as a `List` item's `rightIcon`), and `openPicker()` opens the action sheet of all labels and calls `onChange` with the matching value if one was picked (no-op if cancelled/dismissed).

---

## 7. Cross-cutting formatting/utility primitives

### 7.1 `utils/Numbers.ts` — `prettyNum()`

Given `this.num`, using **strict `>` comparisons** (not `>=`) and always **one decimal place** (`toFixed(1)`), suffixed:
- `> 1,000,000,000` → `${(num/1e9).toFixed(1)}B`
- else `> 1,000,000` → `${(num/1e6).toFixed(1)}M`
- else `> 1,000` → `${(num/1e3).toFixed(1)}K`
- else → the raw integer as a string, **no formatting** (e.g. exactly `1,000` renders as literal `"1000"`, not `"1.0K"`, because the threshold is strictly-greater-than).

Note this is a different, simpler formatter than the Stats page's own `prettyNum` (§"Stats" in the Hydra Pro section of the docs, implemented ad hoc in `pages/SettingsPage/Stats.tsx`, not in `utils/Numbers.ts`) — the Stats screen's local `prettyNum` instead uses `toLocaleString` with a caller-specified fixed precision and optional singular/plural unit suffix (e.g. `"1 banana"` vs `"2.3 bananas"`), unrelated to the K/M/B suffix logic. A rewrite should keep these as two distinct formatting functions rather than unifying them, to preserve each screen's exact output.

### 7.2 `utils/Time.ts` — relative time formatting

Two methods, both computing `diff = |target - this.time|` in ms then successively floored `Math.floor` unit breakdowns (seconds → minutes → hours → days → months[`/30`] → years[`/365`]) with **strict `<` boundaries** at each tier:

- `prettyTimeSince(target = now)` — long form with pluralization (`"5 minutes"`, `"1 hour"`, `"3 days"`, `"2 months"`, `"1 year"`); pluralization is a simple `=== 1 ? "" : "s"` suffix (so e.g. `"1 seconds"` never happens, but note there's no special-casing for `0` — `"0 seconds"` is possible and grammatically fine).
- `shortPrettyTimeSince(target = now)` — compact form: `${n}s` / `${n}m` / `${n}h` / `${n}d` / `${n}mo` / `${n}y` (note the two-letter `mo` for months to disambiguate from minutes).

Exact tier boundaries (identical in both methods): `<60s` → seconds; `<60min` (3600s) → minutes; `<24h` (86400s) → hours; `<30 days` → days; `<12 "months"` (where a "month" = `floor(days/30)`, so this boundary is actually `< 360 days` by day-count, not calendar-aware) → months; otherwise → years (`floor(days/365)`). No `Intl.RelativeTimeFormat` is used — this is fully custom, non-locale-aware, English-only, singular/plural logic. A SwiftUI rewrite wanting **pixel-identical output** (not just "relative time" in general) must replicate these exact floor-based, 30-day-month / 365-day-year approximations rather than using `RelativeDateTimeFormatter`, which uses different (calendar-aware) boundaries and would produce different output for many inputs.

### 7.3 `utils/colors.ts`

- `validateHex(color)`: must be a string starting with `#` matching `/^#([0-9A-F]{3})|([0-9A-F]{6})|([0-9A-F]{8})$/i` — **note the regex is not fully parenthesized**: due to operator precedence, this actually matches `^#[0-9A-F]{3}` **OR** `[0-9A-F]{6}` **OR** `[0-9A-F]{8}$` as three independently-anchored alternatives (only the first alternative is anchored at the start with `^#`, and only the last is anchored at the end with `$`) — meaning, e.g., a bare 6 or 8 hex-digit substring anywhere in a larger string that happens to *contain* such a run would satisfy the middle/last alternatives on their own even without the `#` or without being the whole string, because `^` only binds to the first alternative and `$` only to the last. This is very likely an unintentional bug (probably meant `^#(([0-9A-F]{3})|([0-9A-F]{6})|([0-9A-F]{8}))$`), but for identical-behavior porting purposes, replicate the regex exactly as written including this looseness, unless the rewrite is meant to *fix* bugs (out of scope for a spec).
- `hexToRgb(hex)`: only handles the 6-digit `#RRGGBB` form (via `/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i`); returns `{r:0,g:0,b:0}` (black) silently on any non-matching input (3-digit shorthand, 8-digit with alpha, or invalid strings) rather than throwing.
- `rgbToHex(r,g,b)`: classic `(1<<24) + (r<<16) + (g<<8) + b` bit-packing trick, sliced and upper-cased, e.g. produces `#RRGGBB` uppercase.
- `extractThemeFromText(text)`: scans free-form text (e.g. a pasted message/comment) for one or more custom-theme "import" segments matching `CUSTOM_THEME_IMPORT_REGEX` (defined in `constants/Themes.ts`, out of this survey's scope to detail further), strips the `CUSTOM_THEME_IMPORT_PREFIX` from each match and `JSON.parse`s the remainder into a `CustomTheme`; malformed segments are silently skipped (caught, ignored) rather than surfaced as errors, and are still stripped from the `remainingText` output regardless of parse success or failure — i.e. even a malformed embedded theme block is removed from the displayed text, just not added to the returned `customThemes` array. This is how "share a custom theme" (mentioned in the Pro documentation as importable via pasted text) is implemented at the parsing layer — the import feature is real (unlike AI summaries/filters), it's just gated on nothing now that `isPro` is always true.

### 7.4 `utils/haptics.ts` — three semantic wrappers over `expo-haptics`

Per the in-source haptics policy doc reference (`docs/specs/03-interaction-overhaul.md`, not in this survey's file list but named in the comment): three named intensities so call sites never pick raw haptic styles ad hoc.
- `hapticEngage()` → `Haptics.impactAsync(ImpactFeedbackStyle.Light)` — a gesture crossed an action threshold but hasn't committed (e.g. `Slideable`'s band-change).
- `hapticAction()` → `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` — a state-changing action actually committed (e.g. pull-to-refresh firing — call site outside this survey's files).
- `hapticSelection()` → `Haptics.selectionAsync()` — choosing from a menu / flipping a toggle (used by `useContextMenu`'s action-sheet open, tab long-press quick menus, the feed-audio FAB — the latter two outside this survey's scope).
Verified 1:1 by `utils/__tests__/haptics.test.ts`.

### 7.5 `utils/debounce.ts`

A single hook, `useDebouncedEffect(delay, func, deps)`: a thin wrapper over `useEffect` + `setTimeout`/`clearTimeout` — re-runs `func` `delay` ms after the last change to `deps` (standard trailing-edge debounce via effect cleanup). `delay` itself is included in the effect's own dependency array, so changing the debounce delay also resets any in-flight timer.

### 7.6 `utils/oneTimeAlert.ts`

`oneTimeAlert(key, title, message)`: shows a native `Alert.alert(title, message)` **only if** the MMKV boolean at `key` is not already truthy, then unconditionally sets that key `true` (so it never re-fires for that key, even if the alert itself was dismissed without an explicit acknowledgment button — dismissal alone suffices to suppress future occurrences). A generic, reusable "show this alert exactly once, ever" primitive.

### 7.7 `utils/safeFetch.ts`

A hand-rolled `fetch`-shaped wrapper around `XMLHttpRequest`, purpose-built to route around a bug in the `whatwg-fetch` polyfill where invalid/unusual HTTP status codes (the motivating example: LinkedIn Open Graph scraping returning **HTTP 999**) cause errors that a `try/catch` around `fetch()` cannot catch, because the polyfill defers its internal handling into a `setTimeout`. Behavioral contract:
- Returns a `SafeFetchResponse` shaped like a subset of the real `Response` interface (`ok`, `status`, `statusText`, `headers` as a real `Headers` object rebuilt from `xhr.getAllResponseHeaders()` line-by-line, `url` — preferring `xhr.responseURL` for the final, possibly-redirected URL — `text()`, `json()`, `blob()`).
- `ok` is computed the standard way: `status >= 200 && status < 300`.
- Options support: `method`, `headers`, `body`, `timeout` (default **10,000 ms**), `cache` (a `RequestCache`-shaped hint — only `"no-store"`, `"reload"` (→ `Pragma: no-cache`, `Cache-Control: no-cache`), and `"no-cache"` (→ `Cache-Control: max-age=0`) are mapped to explicit request headers; other `RequestCache` values are effectively ignored since the switch doesn't cover them, and the function returns early doing nothing further if `cacheHeaders` is falsy for a passed `cache` value that isn't one of those three), and `rejectDataResponse` — an opt-in early-abort: once response headers arrive (`HEADERS_RECEIVED` ready state), if `Content-Type` indicates PDF, `application/octet-stream`, any `image/*`/`video/*`/`audio/*`, or a zip type, the request is aborted immediately rather than letting XHR attempt to decode binary data as text.
- Error surface matches `fetch` conventions for callers: network failure → rejects with `TypeError("Network request failed")`; timeout → rejects with `TypeError("Network request timed out")`; explicit abort (e.g. via `rejectDataResponse`) → rejects with an `Error` named `"AbortError"`.
- `.json()` failures are captured as a Sentry breadcrumb (URL, options, response status, and the raw response text) before rejecting, to aid debugging malformed-JSON responses from third-party sites (this function is primarily used for scraping arbitrary external link metadata, e.g. Open Graph tags, not for the Reddit API itself).

---

## 8. Remaining UI primitives

- **`components/UI/List.tsx`**: a themed vertical list-of-rows primitive (used throughout Settings). Each `ListItem` has `key`, optional `icon`/`rightIcon`, `text`, `onPress`, an optional `hide` boolean (filtered out entirely, not just disabled), and an optional `renderCustomItem` escape hatch that replaces the default icon+text row rendering entirely while keeping the row's press handling and right-icon slot. Defaults `rightIcon` to a `MaterialIcons keyboard-arrow-right` chevron when none is supplied (implying "this row navigates somewhere" is List's default assumption). Rows are separated by a hairline bottom border in `theme.divider`, omitted on the last visible row.
- **`components/UI/TextInput.tsx`**: a near-passthrough wrapper over RN's `TextInput`, whose only added behavior is registering itself with `KeyboardAvoidingScrollerContext` on focus (`setCurrentInput(ref)`) so a parent keyboard-avoiding scroll container (implementation outside this survey's scope) knows which input to scroll into view.
- **`components/UI/SearchBar.tsx`**: a themed search field with a leading `Feather "search"` icon and a trailing clear (`FontAwesome6 "xmark-circle"`) button shown only once text is non-empty. Search firing is controlled by two independent triggers — `onSubmitEditing` (always fires) and `onBlur` (fires only if `searchOnBlur` prop, default `true`) — both routed through a single `doSearch()` that **only calls the `onSearch` callback if the current text differs from the last text that was actually searched** (`search.current !== prevSearch.current`), preventing duplicate identical searches from repeated blur/submit. An optional `clearOnSearch` prop resets the field's text immediately after a successful search fires (used for "search and clear" flows like a comment-jump search, as opposed to a persistent filter search box).
- **`components/UI/SectionTitle.tsx`**: trivial — uppercases and themes (`theme.subtleText`) a section header string; used by `List` when given a `title` and standalone throughout Settings/Stats pages.
- **`components/Navbar/IconButton.tsx` / `TextButton.tsx`**: minimal themed nav-bar touch targets (`theme.iconOrTextButton` color), fixed 35×35 hit target for the icon variant; `TextButton` supports `justifyContent` alignment and truncates to one line.
- **`components/UI/LoadingSplash.tsx`**: the full-screen splash overlay shown while the app boots (see §10) — a theme-aware splash image (`splash.png` for dark mode, `splashInverted.png` otherwise, selected by `theme.systemModeStyle`) with a centered `ActivityIndicator` positioned via a `10%` vertical translate offset (to sit just below the splash artwork's logo). Calls `SplashScreen.hideAsync()` (Expo Router's native splash) in the `<Image>`'s `onLoadEnd` — i.e. the native OS splash screen is only dismissed once this JS-rendered splash image has actually finished loading and painted, avoiding a flash of blank content between the native splash and this one.
- **`components/UI/PulseHighlight.tsx`**: a generic "draw attention to this icon" wrapper — animates opacity (`1 → 0.4`, i.e. `1 - progress*0.6`) and scale (`1 → 0.92`) in an infinite reverse-repeating loop (`withRepeat(..., -1, true)`, 1400ms per half-cycle, ease-in-out) while `active`. Includes a semantic color helper, `getPulseColor(theme)`: computes whether `theme.iconOrTextButton` is a "reddish" hue via manual RGB→HSL conversion (hue ∈ [0°,20°] ∪ [345°,360°] and saturation ≥ 0.5 counts as red), and if so pulses in that same red (so red-accented themes like "Spiderman"/"Strawberry"/"Mulberry" pulse in their own red rather than clashing), otherwise falls back to `theme.share` (a softer amber "caution" color) for every other theme. Children can be a plain node or a render-prop function receiving `{ color }` to tint adjacent content (e.g. a badge/label) to match the pulse.
- **`components/HTML/ThemedWebView.tsx`**: wraps `react-native-webview`'s `WebView` for rendering raw Reddit pages (old.reddit.com wikis, new-Reddit "shreddit" pages not otherwise natively rendered) with injected CSS forcing the current Hydra theme's colors onto both old-Reddit's classic CSS classes and new-Reddit's Tailwind-esque utility classes (a long hardcoded list of selectors for headers, content backgrounds, dividers, links, secondary text, etc.), plus hiding old-Reddit's `header` and a new-Reddit promo bottom sheet (`#xpromo-bottom-sheet`). Cookies are shared with the app's native cookie jar (`sharedCookiesEnabled`, `thirdPartyCookiesEnabled`) so the user's Reddit session carries into the web view. Navigation interception (`onShouldStartLoadWithRequest`): only intercepts top-frame navigations; if the target URL's base path equals the currently-loaded URL's base path, lets it load natively (in-page anchors/reloads); otherwise tries to parse it as a `RedditURL` and push it as a native in-app page (unless its `PageType` is `UNKNOWN` and it isn't a resolvable short link, in which case it throws to fall into the `catch`); any parse failure or unknown-non-short-link URL is instead opened via `openExternalLink` (see §7) and the WebView navigation itself is always cancelled (`return false`) once either path is taken, so the WebView never actually navigates away from its original page — all navigation is handed off to the app's own router or the external browser.
- **`components/Other/ConditionalWrapper.tsx`**: trivial generic — conditionally applies a wrapper render-prop around children, or renders children bare.
- **`components/Other/DismountWhenBackgrounded.tsx`**: fully unmounts its children (replacing them with a same-sized `ActivityIndicator` placeholder, sized from the last-known layout via `onLayout`) whenever `AppState` becomes `"background"`, remounting on any non-background state. Purpose (inferred from name/usage pattern, not stated in-file): likely used to force expensive components (e.g. video players) to tear down their native resources when the app is backgrounded rather than continuing to hold them.
- **`components/Other/TextWithRepairedHeight.tsx`**: a workaround for what the author identifies as an Apple text-rendering bug (linked to a Reddit comment in-source) — measures a `<Text>`'s laid-out height on first `onLayout`, and if that height is a non-integer, pins the `<Text>`'s `height` style to `Math.round(height) + 1` from then on (only ever applied once per mount, via a `heightFixed` ref guard) to prevent whatever visual artifact the fractional height was causing.

---

## 9. Test coverage inventory

Jest is configured with a minimal global setup (`jest.setup.js`): mocks `react-native-mmkv`'s `createMMKV` to a stub object exposing only `getString`/`set` as jest mocks (any other KeyStore method used un-mocked in a test would need a per-file mock), and stubs `@sentry/react-native`'s `captureException`/`captureMessage`. Individual test files add further native-module mocks (Reanimated, gesture-handler, zeego, ThemeContext, the drizzle `db` module) as needed rather than globally, keeping the global setup minimal.

Tests directly in this survey's area, read in full:
- **`db/functions/__tests__/SeenPosts.test.ts`**: exhaustively covers the seen-change pub/sub system — single/multiple listeners per post, listener isolation between different posts, unsubscribe (including double-unsubscribe safety and safe emit-after-last-unsubscribe map cleanup), and **ordering**: proves the DB write is awaited before the change event emits (by holding a mocked `execute()` promise open and asserting the listener hasn't fired yet), and that `markPostUnseen` issues an actual `delete`/`where` call before emitting `false`. This is the strongest signal of what the app owner considers behaviorally load-bearing about `SeenPosts`: the subscription/ordering contract, not the SQL itself (which is trivially mocked out).
- **`utils/__tests__/haptics.test.ts`**: pins each of the three haptic helpers to its exact `expo-haptics` call (light/medium impact vs. selection), asserting no cross-contamination (e.g. `hapticEngage` never triggers `selectionAsync`).
- **`utils/__tests__/shareURL.test.ts`**: pins the iOS-vs-Android `Share.share` payload shape divergence (§5.1) as a named regression guard, explicitly framed in comments as preventing a specific prior Android bug (shared link silently dropped) from recurring.
- **`components/UI/__tests__/Slideable.test.tsx`**: the most extensive test file surveyed. Mocks the entire gesture-handler + Reanimated pipeline (capturing the `Gesture.Pan()` builder's callbacks so tests can drive `onStart`/`onUpdate`/`onEnd`/`onFinalize` directly as plain function calls) and exercises: threshold-band detection at exact pixel values (rendering the correct icon past 75px, upgrading past 130px, one haptic per band transition — not per pixel), left vs. right direction handling, no-haptic-below-threshold, action firing only on release (not during drag) and only for engaged bands, icon clearing timed to the spring settling on finalize (not immediately on release), scroll-lock engage/disengage tied correctly to `onStart`/`onFinalize`, the `activated`-gate protecting against a non-activated gesture's finalize spuriously clearing scroll-lock, and the full `swipeAnywhereToNavigate` coexistence behavior (widened right-edge activation window, rightward-drag clamping to zero, leftward drags unaffected). This test file is effectively an executable spec for §6.1 above and should be treated as the authoritative behavioral reference for a from-scratch reimplementation of the swipe primitive.
- **`components/UI/__tests__/NativeContextMenu.test.tsx`**: mocks `zeego/context-menu` with instrumented passthrough components and verifies: Android renders children unwrapped with zero menu items constructed; iOS builds the full Root/Trigger/Content tree with one item per action in order, correct label text, correct `onSelect`→`handle` wiring, correct `destructive` flag propagation (only on the flagged action), and — at some length — the `flex` shorthand-to-explicit-longhand expansion logic for the menu root (§6.2), including the `flex: 0` and negative-`flex` edge cases matching React Native's own shorthand-expansion semantics, non-flex styles staying on the Trigger only (not doubled onto the Root), array-style flattening, and `onOpenChange` forwarding.
- **`db/functions/__tests__` contains only `SeenPosts.test.ts`** — notably, `HiddenPosts`, `Drafts`, `CustomThemes`, `Stats`, and `Maintenance` have **no automated test coverage** at all, despite being fully documented functions in this survey. This is a coverage gap worth calling out explicitly: the seen/unseen subscription contract is evidently considered the highest-risk piece of the local-persistence layer (likely because of its direct UI-consistency implications across a virtualized list), while the other tables' simpler CRUD/upsert functions are not tested.

Other test files present but outside this survey's core assignment (listed for completeness per the task's "test coverage inventory" requirement, not read in full): `api/__tests__/{Multireddit,SubredditDetails,formatPostData,formatVideos,getPosts}.test.ts` (Reddit API data-shaping, another survey's area), `components/RedditDataRepresentations/Post/PostParts/**/__tests__/*` and `components/UI/Gallery/__tests__/Video.test.tsx` and `components/UI/MediaViewer.tsx/__tests__/*` (media viewer/gallery mechanics, another survey's area), `components/UI/__tests__/{RedditDataScroller,ThemedRefreshControl}.test.tsx` (list/refresh mechanics), `utils/__tests__/{RedGifs,RedditURL.jsonify,RedditURL.resolveURL,getSwitcherSubredditName,mediaViewerTaps,useRedditDataState,useResolvedVideoSource,videoOverlayState,videoSourceFallback,videoWatchdog}.test.ts(x)` (URL parsing and video-playback state machines, other survey areas), and `utils/__tests__/sanity.test.ts` (a trivial `1+1===2` smoke test confirming the Jest runner itself works — not testing app code).

---

## 10. Patches

**`patches/react-native-screens+4.23.0.patch`** (applied via `patch-package` against `node_modules/react-native-screens`): adds a new Objective-C++ class, `RNSScrollToTopGuardGestureRecognizer`, and wires it into `RNSScreenStackHeaderSubview` for title/center header subviews on iOS 26+. **Behavioral purpose**: iOS 26 (and the patch comment notes iOS 27 too) introduced a system behavior where tapping anywhere in the navigation bar — including on a custom, interactive title view (e.g. a tappable title/subtitle stack, common in Hydra's subreddit header) — triggers the OS's "tap the status bar/nav bar to scroll to top" gesture instead of the custom view's own tap handler. This patch backports an unreleased upstream fix (react-native-screens PR #3731) with the iPad-only restriction removed (applying the guard to iPhone as well, since the bug reproduces there too on iOS 26+). Mechanically: the guard gesture recognizer is a no-throw, no-action `UITapGestureRecognizer` (`initWithTarget:self action:nil`) that exists purely to be registered as **required-to-fail-before** every other tap gesture recognizer whose view is *not* a descendant of the guarded header subview — i.e. it tells the OS's scroll-to-top tap recognizer "wait and see if a recognizer inside this header subview handles the tap first," effectively giving custom interactive title content tap priority over the system's scroll-to-top gesture, only on iOS 26.0+ (compiled behind `RNS_IPHONE_OS_VERSION_AVAILABLE(26_0)`, a no-op on earlier iOS). A from-scratch SwiftUI rewrite would need to replicate this exact `shouldBeRequiredToFail`-based gesture-precedence trick (or use SwiftUI-native equivalents, e.g. `.simultaneousGesture`/`allowsHitTesting` composition, or `UINavigationBar` customization at the `UIKit` interop layer) for any interactive custom navigation-bar title content, specifically targeting iOS 26+.

---

## 11. Startup sequence (`app/index.tsx`)

Order of initialization, as encoded in the module and the `RootLayout` component:

1. **Module-load-time side effects** (run once, before any component renders): `@expo/metro-runtime` and `expo-dev-client` imports (dev tooling only); `LogBox.ignoreLogs([...])` suppresses three known noisy warnings (require-cycle warning, two deprecated Constants API warnings); `reportingAllowed` is computed from the `allowErrorReporting` MMKV key (default `true`); `Sentry.init(...)` runs immediately — **disabled** in dev builds (`!__DEV__`) or if the user opted out, **enabled** otherwise, with app-hang tracking explicitly disabled (worked around a bug where it misfires during permission prompts); `SplashScreen.preventAutoHideAsync()` keeps the native splash up; `enableFreeze(true)` (react-native-screens) stops background tab screens from re-rendering; device orientation is locked to portrait-up (`ExpoOrientation.lockAsync`).
2. **`RootLayout` render, before the provider tree mounts anything visible**: three async/derived gates must all be true before the actual app tree renders — `migrationsComplete` (Drizzle's `useMigrations(db, migrations)` — runs the six SQL migrations in §1.4 in order against `db.db`; a migration error is re-thrown to Expo Router's error boundary rather than handled gracefully), `fontsLoaded` (`useFonts` loading `SpaceMono-Regular.ttf` plus the full FontAwesome icon font set), and `videoCacheReady` (a `useEffect` awaiting `VideoCache.clearCacheIfRequested()` — §2.3 — which must complete, since the native video cache cannot be cleared once any video component has mounted, before anything that might contain a video player is allowed to render). Until all three are true, `RootLayout` renders **nothing at all** (not even a loading view) — the `LoadingSplash` component (§8) is presumably rendered by a parent/sibling in `app/tabs.tsx` or similar during this gap, though that file is outside this survey's scope; what's confirmed here is that `app/index.tsx` itself gates the entire provider tree behind these three conditions with no fallback UI of its own.
3. **On `migrationsComplete` becoming true** (a separate `useEffect`, independent of the render gate above — so this fires as soon as migrations finish, even if fonts/video-cache aren't ready yet): DB maintenance is scheduled via `InteractionManager.runAfterInteractions(() => doDBMaintenance())` — deliberately deferred past the first interaction/frame so pruning (§1.3) never blocks initial paint; `modifyStat(Stat.APP_LAUNCHES, 1)` and `modifyStat(Stat.APP_FOREGROUNDS, 1)` both increment immediately (so every cold launch counts as one launch AND one foreground); an `AppState` "change" listener is registered for the lifetime of this effect (cleaned up if `migrationsComplete` ever flips, though in practice it won't) that increments `app_foregrounds` again on every subsequent transition to `"active"`.
4. **Once all three gates pass**, the provider tree mounts, nested in this exact order (outer→inner): `GestureHandlerRootView` → `SafeAreaProvider` → `AccountProvider` → `SubscriptionsProvider` → `SettingsProvider` → `TabScrollProvider` → `NavigationProvider` → `ActionSheetProvider` → `ActionSheetBgProvider` → `InboxProvider` → `ModalProvider` → `VideoPlayerRegistryProvider` → `MediaViewerProvider` → `SubredditProvider` → `StartupModalProvider` → (`SubscribeToHydra` modal + `Tabs`, as siblings, both inside `StartupModalProvider`). Notably: `AccountProvider` wraps everything account-dependent, and loads saved account/session state asynchronously on its own mount (§2.2/AccountContext, outside this file); `InboxProvider`'s 60-second polling (§4.2) only starts once `AccountProvider` has resolved a `currentUser`, which happens independently of this outer gating sequence. `SubscriptionsProvider` here is the always-`isPro:true` stub (§0) — included in the tree for API compatibility with any consumer, contributing no real gating logic.
5. **Startup modal priority** (`StartupModalProvider`, evaluated once, synchronously, on its own first mount — via a `useRef` guard preventing re-evaluation on re-renders): checks, **in this fixed priority order**, the first `wantsToShow: true` candidate and shows only that one:
   1. `updateInfo` — wants to show if `lastSeenUpdate` MMKV key ≠ the current build's `updateInfo.updateKey` (currently `"v4.0.0"`) — i.e., shows once per app version bump, listing recent changes (release notes), pulled from `components/Modals/StartupModals/UpdateInfo.tsx`'s hardcoded `updateInfo.features` list (and an empty `proFeatures` array — further evidence per §0 that Pro-specific release-note callouts have been retired even though the data structure for them remains).
   2. `promptForReview` — wants to show only if `app_launches` stat > 30 **and** the user hasn't already answered (`storeReviewRequested` MMKV flag) — a two-screen modal ("prompt" → tapping "Rate now" opens the App Store review deep link `itms-apps://itunes.apple.com/...id=6478089063...` and transitions to a "success/thank you" screen; tapping "Maybe later" or the X/backdrop exits without opening the App Store) that, either way (rate now or dismiss), permanently sets `storeReviewRequested = true` so it can never reappear.
   
   Only one startup modal shows per launch (the highest-priority one whose condition is met); if neither wants to show, none renders. `SubscribeToHydra` (§0, the r/HydraClient nag) is a **separate**, independently-gated overlay rendered as a sibling — not part of this priority-ordered `StartupModalContext` system, meaning it's possible (though not verified from these files alone) for both a `StartupModalContext` modal and `SubscribeToHydra` to be eligible in the same session; their relative z-ordering/stacking was not traced further as it depends on `ModalProvider` internals outside this survey's scope.
6. **No explicit "Hydra Server status check" gates startup** — the only server status check found (`hydraServerStatus`) is invoked reactively from the Advanced Settings screen when the user edits the custom server URL, not as part of the app boot sequence. This means the app's cold-start path performs no network calls at all before rendering the UI — everything in steps 1–5 is purely local (SQLite migrations, MMKV reads, font loading, native cache housekeeping).

---

## Open questions / ambiguities

1. **Draft key format is not fully specified by this survey's files.** `db/functions/Drafts.ts` only defines the generic `key`/`text` upsert contract; the actual string keys used per composer context (new post, post reply, comment reply, message compose, edit-in-place, etc.) are constructed in composer component files not in this survey's assigned list. A rewrite needs to grep those composer components directly to get the exact key-construction scheme (e.g. whether it includes post/comment id, account username, or just a screen name) to guarantee drafts don't collide across accounts or contexts.
2. **`SubredditVisits` and `CustomThemes` have no maintenance/pruning function anywhere in the codebase** — confirmed by reading `Maintenance.ts` in full. Whether this is an intentional design choice (both are expected to stay small — one row per distinct subreddit visited, one per saved custom theme) or an oversight is not stated anywhere in comments. A rewrite should decide whether to preserve this unbounded-growth behavior exactly, or add pruning (a behavioral *deviation*, so flag it if choosing the latter).
3. **Whether any dead-Pro UI is still user-visible needs a live-app check.** This survey confirmed the *settings toggles* for `showPostSummary`/`showCommentSummary` exist with no consumer, and that the Stats obfuscation functions are no-ops — but did not exhaustively check every settings-page file for other now-inert Pro-labeled UI (e.g. whether the Appearance settings page still visibly labels these toggles "Requires Hydra Pro" per `constants/documentation.ts` line 298/318, which would be user-visible but functionally meaningless copy). Another survey area covering the Appearance/Filters settings pages directly should confirm exact on-screen copy.
4. **The exact shape of the `reddit_session` cookie object** persisted to SecureStore is opaque from `RedditCookies.ts` alone — it's whatever `@preeternal/react-native-cookie-manager`'s `CookieManager.get()` returns for that single cookie, not independently documented in this survey's files. A SwiftUI rewrite using native `HTTPCookie`/`WKHTTPCookieStore` should verify the actual JSON shape at runtime (name/value/domain/path/expires/secure/httpOnly fields) rather than assuming a specific shape from this description.
5. **Whether `USING_CUSTOM_HYDRA_SERVER` (constants/HydraServer.ts) gates any Pro-adjacent behavior** was not traced — no consumer of this exported constant was found within this survey's assigned files. The in-app Advanced Settings documentation says using a custom server "also grants access to Pro features," but since `isPro` is unconditionally `true` for everyone regardless of server choice (§0), this claim appears to be stale/moot in current code; worth a grep across the full codebase (beyond this survey's file list) to confirm no hidden consumer exists.
6. **Background/foreground badge-count behavior when logged into multiple accounts** — `InboxContext` only tracks `currentUser`'s inbox; switching accounts presumably resets/reinitializes polling (new `currentUser` value re-triggers the `useEffect`), but whether the OS app-icon badge should reflect only the active account or some combined count across all logged-in accounts is not addressed by the code or docs — current behavior is unambiguously "active account only," but this is worth flagging as a product-level ambiguity if a rewrite considers multi-account badge aggregation.
7. **`documentation/*.md` vs `constants/documentation.ts`**: these appear to be two copies of the same content (the `.md` files read for this survey, and a generated/embedded TypeScript constant with pre-computed embedding vectors for in-app semantic search — `generateDocumentation.ts`, not read in full by this survey, is presumably the build-time script that turns the `.md` files into `constants/documentation.ts`). This survey did not verify the two are byte-identical in prose, only that both describe the same now-defunct Pro feature set; a rewrite treating the `.md` files as the specification source should confirm `generateDocumentation.ts`'s transform doesn't alter meaning.
