# Hydra — Settings, Theming, Guide & Stats: Behavioral Specification

This document specifies the exact behavior of Hydra's Settings area, theming system
(built-in + custom themes / Theme Maker), app icon picker, in-app Guide/documentation
browser, Stats screen, and the settings persistence layer, as implemented in the
current codebase (not necessarily as described by the in-app documentation — several
important discrepancies between the shipped markdown docs and actual code are called
out explicitly, since a from-scratch rewrite should match the *code*, not the stale
docs).

**IMPORTANT GLOBAL FINDING — Hydra Pro no longer exists.** The paid tier has been
fully removed from the code even though the bundled documentation (`documentation/*.md`,
rendered in the in-app Guide) still describes it extensively. Evidence:
- `contexts/SubscriptionsContext.tsx` hard-codes `isPro: true` and `customerId: null`
  for every user, with a comment: *"All features are free. `isPro` is kept as an
  always-true flag so the rest of the app can continue to gate behavior on it without
  a paid tier."*
- `contexts/SettingsContexts/ThemeContext.tsx`'s `cantUseTheme()` always returns
  `false` — *"Every theme is free, so any theme can always be used."*
- `contexts/SettingsContexts/NotificationsContext.tsx` is an inert stub —
  *"Push notifications (Inbox Alerts) relied on the hosted Hydra push backend and
  have been removed along with the paid tier."* `notificationsEnabled` is always
  `false` and there is no way to enable it from the UI.
- There is no `hydra://settings/hydraPro` route registered in
  `pages/SettingsPage/index.tsx` — the Guide's many links to it are dead links.
- The Stats page's `obfuscateNumber`/`obfuscateText` helper functions
  (`pages/SettingsPage/Stats.tsx`) are literal no-op passthroughs
  (`(text) => text`) — despite the docs claiming free users see asterisks, **all
  users always see real numbers**.
- "AI Filters" (Smart Post Filter) and "AI Summaries" (post/comment summary boxes)
  described at length in `documentation/ai_filters.md` and `documentation/ai_summaries.md`
  have **no corresponding UI anywhere in the app**. `showPostSummary` /
  `showCommentSummary` settings exist as dead fields inside
  `PostSettingsContext`/`CommentSettingsContext` but are never rendered as a toggle
  in `Appearance.tsx`, and no component renders a summary box. There is no "Smart
  Post Filter" section in `Filters.tsx`.
- "Customer ID" (described in `advanced_settings.md`) is never rendered anywhere in
  `Advanced.tsx`; `customerId` is hard-coded `null`.

**For the rewrite, treat all of the above as removed/dead features.** The
specification below describes the app's actual current behavior; where the bundled
Guide text disagrees, that is flagged inline.

---

## 1. Navigation & Entry Point

Settings is reached via the **Settings** tab (5th/rightmost tab; see
`contexts/NavigationContext.tsx` — tabs are `Posts` (index 0, default), `Inbox` (1),
`Account` (2), `Search` (3), `Settings` (4)). All settings pages are one shared
React Navigation stack screen, `SettingsScreen` (`app/stack/SettingsScreen.tsx`),
whose title is derived from the URL's page name; the visible content switches based
on the `hydra://settings/...` URL path, dispatched in `pages/SettingsPage/index.tsx`:

| Path suffix | Component |
|---|---|
| `settings` | `Root` |
| `settings/guide*` | `Guide` (lazy-loaded — the Guide's docs+vectors constant is large) |
| `settings/general` | `GeneralRoot` |
| `settings/general/gestures` | `Gestures` |
| `settings/general/sorting` | `Sorting` |
| `settings/general/openInHydra` | `OpenInHydra` |
| `settings/general/filters` | `Filters` |
| `settings/general/startup` | `Startup` |
| `settings/general/legal` | `Legal` |
| `settings/general/externalLinks` | `ExternalLinks` |
| `settings/theme` | `Theme` |
| `settings/themeMaker` | `ThemeMaker` |
| `settings/appearance` | `Appearance` |
| `settings/appIcon` | `AppIcon` |
| `settings/appIconDetails/<name>` | `AppIconDetails` |
| `settings/dataUse` | `DataUse` |
| `settings/stats` | `Stats` |
| `settings/privacy` | `Privacy` |
| `settings/advanced` | `Advanced` |

### 1.1 Root screen (`pages/SettingsPage/Root.tsx`)

- A **search bar** at top ("Ask a question...", autocorrect on, clears text on
  submit). Submitting non-empty text navigates to
  `hydra://settings/guide/?search=<urlencoded text>`.
- A single grouped `List` titled "Settings" with rows (icon, label, navigation
  target):
  1. **Guide** (book icon) → `hydra://settings/guide`
  2. **General** (gear icon) → `hydra://settings/general`
  3. **Theme** (moon icon) → `hydra://settings/theme`
  4. **Appearance** (eye icon) → `hydra://settings/appearance`
  5. **App Icon** (paintbrush icon) → `hydra://settings/appIcon` — **only rendered
     if `supportsAlternateIcons` from `expo-alternate-app-icons` is true** (device/OS
     support check, not a manual toggle).
  6. **Account** (user icon) → `hydra://accounts` (account management screen; out of
     this document's scope but the entry point lives here).
  7. **Data Use** (activity icon) → `hydra://settings/dataUse`
  8. **Stats** (bar-chart icon) → `hydra://settings/stats`
  9. **Privacy** (lock icon) → `hydra://settings/privacy`
  10. **Advanced** (wrench icon) → `hydra://settings/advanced`
  11. **Patch Notes** (system-update icon) → opens the `updateInfo` startup modal
      (`StartupModalContext.setStartupModal("updateInfo")`) — the same "what's new"
      dialog normally auto-shown once per new version (tracked via MMKV key
      `lastSeenUpdate`, compared against a hardcoded `updateKey` string, currently
      `"v4.0.0"`, in `components/Modals/StartupModals/UpdateInfo.tsx`). This is
      Hydra's changelog/About surface.
  12. **Request A Feature** (git-pull-request icon) → in-app-browses to
      `/r/HydraFeatureRequest/top?t=all` (a Reddit subreddit, not an external link).
- Below the list, footer text (not a control) shows app identity, centered:
  `{Application.applicationName}: {Application.nativeApplicationVersion}` / newline /
  `Build #{Application.nativeBuildVersion}` / newline /
  `Update Group: {Updates.manifest?.metadata?.updateGroup ?? "development"}`.

---

## 2. General (`hydra://settings/general` → `GeneralRoot`)

A grouped `List` titled "General" with 7 rows, each a navigation stub (no inline
toggles on this screen):

1. **Gestures** (hand icon) → `settings/general/gestures`
2. **Post & Comment Sorting** (sort icon) → `settings/general/sorting`
3. **Filters** (filter icon) → `settings/general/filters`
4. **Open in Hydra** (external-link icon) → `settings/general/openInHydra`
5. **App Startup** (restart icon) → `settings/general/startup`
6. **Legal** (file-text icon) → `settings/general/legal`
7. **External Links** (link icon) → `settings/general/externalLinks`

### 2.1 Gestures (`General/Gestures.tsx`)

Backed by `contexts/SettingsContexts/GesturesContext.tsx`.

**"Navigation" section** (single toggle):
- **Swipe Anywhere to Navigate** — Switch. MMKV boolean key `swipeAnywhereToNavigate`,
  default `false`. When true, right-swipe navigation gestures take over and (per the
  Guide text) right swipe *actions* on posts/comments are disabled, leaving only left
  swipe actions active. (This disabling behavior lives in the gesture-handling
  components, outside this document's file set, but is documented here as the stated
  contract.)

**"Post Swipe Actions" section** — 4 rows, each opening a native action-sheet picker
(`useSettingsPicker`) over the same option list, labelled by swipe direction/distance:
- **Long Right Swipe** (`farRight`)
- **Short Right Swipe** (`right`)
- **Long Left Swipe** (`farLeft`)
- **Short Left Swipe** (`left`)

`POST_SWIPE_OPTIONS` (assignable actions, in picker order):
`Upvote` (`upvote`) · `Downvote` (`downvote`) · `Mark as Read` (`hide`) ·
`Bookmark` (`bookmark`) · `Share` (`share`) · `Disabled` (`disabled`).

**"Comment Swipe Actions" section** — same 4 directions, `COMMENT_SWIPE_OPTIONS`:
`Upvote` (`upvote`) · `Downvote` (`downvote`) · `Reply` (`reply`) ·
`Bookmark` (`bookmark`) · `Share` (`share`) · `Collapse` (`collapse`) ·
`Collapse Thread` (`collapseThread`) · `Disabled` (`disabled`).

**Persistence**: single MMKV JSON objects, `postSwipeOptions` and
`commentSwipeOptions`.

**Defaults**:
- Posts: `{ farRight: "downvote", right: "upvote", farLeft: "bookmark", left: "hide" }`
- Comments: `{ farRight: "downvote", right: "upvote", farLeft: "bookmark", left: "reply" }`

**Swap-on-conflict behavior**: assigning an action already used by another slot
*swaps* the two slots' values (does not just overwrite), except assigning
`Disabled` — that never triggers a swap, it can coexist on multiple slots. This
logic (`getKeyToSwitchWith`) scans the other 3 slots of the same
post/comment option set (independently — post and comment assignments never
interact) for a slot currently holding the newly chosen value, and if found, swaps
that slot to hold whatever the current slot held before.

### 2.2 Post & Comment Sorting (`General/Sorting.tsx`)

**"Posts" section**:
- **Default sort** — picker. Options: `Default` / `Best` / `Hot` / `New` / `Top` /
  `Rising` (values `default|best|hot|new|top|rising`). MMKV string key
  `defaultPostSort`, default `"default"`.
- **Default top sort** — picker, **only shown when Default sort = Top**. Options:
  `Hour|Day|Week|Month|Year|All Time` (values `hour|day|week|month|year|all`). MMKV
  key `defaultPostSortTop`, default `"all"`.
- **Apply sort to home** — Switch. MMKV boolean `sortHomePage`, default `false`.
  Controls whether the default sort is applied to the home feed (vs. only
  subreddits).
- **Remember subreddit sort** — Switch. MMKV boolean
  `rememberPostSubredditSort`, default `false`.
- Conditionally, below the list, a **"Clear custom post sorts (N subs)"** button
  (only rendered when remember-sort is on AND at least 1 remembered subreddit
  exists). Tapping it deletes every MMKV key starting with `PostSubredditSort-`
  (enumerated via `KeyStore.getAllKeys()`), resetting the in-memory count to 0.

**"Comments" section**:
- **Default sort** — picker. Options: `Default|Best|New|Top|Controversial|Old|Q&A`
  (values `default|best|new|top|controversial|old|qa`). MMKV key
  `defaultCommentSort`, default `"default"`.
- **Remember subreddit sort** — Switch. MMKV boolean
  `rememberCommentSubredditSort`, default `false`.
- Same conditional **"Clear custom comment sorts (N subs)"** button, deleting keys
  prefixed `CommentSubredditSort-`.

**Per-subreddit remembered sort storage**: `makePostSubredditSortKey(subreddit)` →
MMKV string key `` `PostSubredditSort-${subreddit.toLowerCase()}` ``;
`makePostSubredditSortTopKey` → `` `PostSubredditSortTop-${subreddit.toLowerCase()}` ``;
`makeCommentSubredditSortKey` → `` `CommentSubredditSort-${subreddit.toLowerCase()}` ``.
(Defined in `constants/SettingsKeys.ts`; the actual per-subreddit read/write of these
keys happens outside this file set, in the post/comment list screens.)

### 2.3 Filters (`General/Filters.tsx`)

Backed by `contexts/SettingsContexts/FiltersContext.tsx`. Top-of-page description
text: *"Filters only apply to items in the main feeds and subreddits. They do not
apply to search results or user profiles. Excessive filtering may make load times
slower because more items have to be loaded before showing results."*

**"Post Settings" section**:
- **Hide Seen Posts** — Switch. MMKV boolean `filterSeenPosts`, default `false`.
- **Mark as Seen On Scroll** — Switch. MMKV boolean `autoMarkAsSeen`, default
  `false`. Toggling shows an `Alert`: *"Restart the app for this change to take
  effect."* — and if the new value is `true` **and** Hide Seen Posts is also on, an
  extra line: *"You may notice slower loads with this setting enabled because all
  the hidden posts still have to be loaded in the background."*

If any URL has a manually-toggled per-URL override of "hide seen posts" that
disagrees with the global `filterSeenPosts` value, a text block lists those URLs
verbatim (`hideSeenURLs` MMKV JSON object, keyed by `RedditURL.getBasePage()`,
default `{}`; `toggleHideSeenURL(url)` flips/deletes the per-URL override). This
mechanism is exposed to the rest of the app via
`getHideSeenURLStatus(url)`/`toggleHideSeenURL(url)` but there is no dedicated UI to
add an override here — only to view/understand ones set elsewhere (presumably via a
context menu on a subreddit page, outside this file set) and it's implicitly
editable by whatever component calls `toggleHideSeenURL`.

**"Text Filter List" section** — a multiline `TextInput` bound to MMKV string key
`filterText` (default `""`). Description text below explains the exact matching
rules: *"Words or phrases can be separated by commas or new lines. If a post or
comment contains items on this list, it will be hidden from view. Post filter text
includes the title, author username, post text, poll options, link titles, and link
descriptions. Comment filter text includes the comment text, and author username.
Text filtering is case insensitive and won't match subwords. For example, 'cat'
won't match 'caterpillar'."* (Parsing/matching implemented in
`utils/filters/TextFiltering.ts`, outside this file's scope but consumed via
`FiltersContext.filterPostsByText` / `doesCommentPassTextFilter`.)

**"Filtered subreddits" section** — explanatory text: *"You can filter subreddits by
long-pressing posts on /r/all or /r/popular. Once filtered, subreddits will appear
here. Delete the filter to begin seeing posts from the subreddit again."* Below,
**only if any exist**, a `List` of filtered subreddits (data source: MMKV JSON
object `filteredSubreddits`, default `{}`; key = subreddit name, value = either
`true` (forever) or a numeric epoch-ms expiry). Each row shows a reddit icon,
subreddit name, and either "Forever" or "Until <locale date>"; tapping a row confirms
("Stop filtering /r/x?") and removes the entry
(`toggleFilterSubreddit(subreddit, undefined)`).
`filterPostsBySubreddit` (consumed elsewhere) drops a post if
`hideFilteredSubreddits[post.subreddit]` is `true`, or is a still-future timestamp.

**"Hidden posts" section** — explanatory text: *"You can hide individual posts by
long-pressing them and choosing 'Hide Post'. Hidden posts are kept locally (not on
Reddit) and automatically start showing again one month after they were hidden. Tap
a post here to unhide it sooner."* Below, **only if any exist**, a `List` sourced
from SQLite table `hidden_posts` via `getHiddenPosts()`
(`db/functions/HiddenPosts.ts`), showing post title + `r/{subreddit} · Expires
{date}`. Tapping a row confirms ("Unhide this post?") and calls
`unhidePost(postId)` (deletes the row). **Expiry = 30 days** from hide time
(`HIDDEN_POST_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000`); rows past expiry are
auto-pruned by `maintainHiddenPosts()` (see §11).

**Note**: the "Smart Post Filter" (AI filter) section described in
`documentation/ai_filters.md` does not exist anywhere in this screen or the
codebase — treat as not implemented.

### 2.4 Open in Hydra (`General/OpenInHydra.tsx`)

**"Hydra Shortcut" section**:
- **Get Hydra Shortcut** — button row (app-shortcut icon). Opens (external URL)
  `https://www.icloud.com/shortcuts/f509e3f85f174526b6cabdc48e96b11c` (an iCloud
  link to install an iOS Shortcuts app shortcut). Explanatory text below: *"Setting
  up this shortcut will add an 'Open in Hydra' option to the bottom of the share
  sheet in other apps. This will allow you to open Reddit links directly into
  Hydra."*

**"Clipboard Links" section**:
- **Read Links from Clipboard** — Switch. MMKV boolean key `readClipboard`, default
  `false` (`READ_CLIPBOARD_KEY`/`READ_CLIPBOARD_DEFAULT` constants exported from this
  same file). Explanatory text: *"Hydra can automatically detect Reddit links from
  your clipboard and prompt you to open them. Enabling this will cause iOS to ask
  you each time if you want to allow Hydra to read your clipboard. To disable the
  duplicate prompt, you can go to Hydra in the iOS Settings app and change 'Paste
  from Other Apps' to 'Allow'."*

### 2.5 App Startup (`General/Startup.tsx`)

**"Startup" section**:
- **Start Hydra on this tab** — picker. Options are the 5 tab names in
  `TabIndices` order: `Posts, Inbox, Account, Search, Settings`. MMKV string key
  `initialTab`, default `"Posts"`.

**"Startup URL"** (section title, not in a List):
- Free-text `TextInput`, MMKV string key `startupURL`, default
  `"https://www.reddit.com/"`. Entering this overrides the initial-tab setting
  (opens directly to this URL instead). If the current value fails
  `new RedditURL(value)` validation, red-flag text appears below: *"Invalid
  RedditURL. This setting will be ignored."* — the invalid value is still saved
  verbatim but simply ignored at launch (fallback logic in
  `contexts/NavigationContext.tsx`: on invalid parse, `startupURL` reverts in-memory
  to the default and the tab falls back to "Home").

### 2.6 Legal (`General/Legal.tsx`)

Simple 2-row `List`, both external links via `openExternalLink()` (obeys the user's
chosen External Links browser — see §2.7):
- **Privacy Policy** → `https://www.hydraapp.io/privacy`
- **End User License Agreement** → `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`

### 2.7 External Links (`General/ExternalLinks.tsx`)

- **Open links with** — picker sourced from `BROWSER_CONFIGS`
  (`utils/openExternalLink.ts`). MMKV string key `externalLinkBrowser`, default
  `"internalBrowser"`. Options (label → value → URL-scheme rewrite rule):
  - **Hydra** → `internalBrowser` — opens via `expo-web-browser`
    (`WebBrowser.openBrowserAsync`, full-screen presentation, "close" dismiss
    button), locking device orientation to portrait for the duration (unlocked
    just before opening, relocked after closing).
  - **Default Browser** → `defaultBrowser` — URL passed through unchanged to
    `Linking.openURL`.
  - **Chrome** → `chrome` — rewrites to `googlechromes://` (https) or
    `googlechrome://` (http), stripping the original scheme.
  - **Brave** → `brave` — `braves://` / `brave://`.
  - **Firefox** → `firefox` — `firefox-open-url:?url=<encoded original URL>`.
  - **Edge** → `edge` — replaces `https://`→`microsoft-edge-https://` or
    `http://`→`microsoft-edge-http://`.
  - **Opera** → `opera` — replaces `https://`→`opera-https://` or
    `http://`→`opera-http://`.
  - If `Linking.openURL` throws for a non-Hydra/non-default browser (app not
    installed), an `Alert` appears: *"Error — Hydra was not able to open
    '<Browser>'. You may not have this browser installed. You can change your link
    opening settings under Settings => General => External Links. <scheme URL>"*
    with **Cancel** and **Open in Default Browser** (falls back to
    `Linking.openURL(originalUrl)`) buttons.
- **Open in reader mode** — Switch, **only shown when "Open links with" =
  Hydra**. MMKV boolean key `openInReaderMode`, default `false`. When true, passed
  as `readerMode: true` to `WebBrowser.openBrowserAsync`.

Note: Reddit links themselves are never routed through this external-browser logic —
they always open natively inside Hydra's own navigation stack; this screen only
governs non-Reddit URLs.

---

## 3. Theme (`hydra://settings/theme` → `Theme.tsx`)

Header row: "Themes" title + a pill button **"Custom Theme +"** →
`hydra://settings/themeMaker` (opens the Theme Maker with a fresh, blank custom
theme extending the currently active base theme — see §3.4).

**"Different Dark Mode Theme"** toggle (single-row `List`, no section title). Switch,
MMKV boolean key `useDifferentDarkTheme`, default `false`.
- **Off** (default): a single theme applies at all times, regardless of system light/dark
  mode. Selecting any theme in the list below sets MMKV string key `theme` (used
  for both modes).
- **On**: separate themes can be assigned to light and dark mode. Two extra buttons
  appear above the theme list — **Light** / **Dark** — a local (non-persisted,
  screen-only) toggle for *which* mode you are currently editing (`colorScheme`
  state, initialized from `Appearance.getColorScheme()`, defaulting to `"light"` if
  `"unspecified"`). The theme list then reflects/edits whichever of `theme`
  (light) or `darkTheme` (dark; MMKV string key `darkTheme`) corresponds to the
  selected button. The app automatically follows the OS's live light/dark setting
  at runtime to decide which of the two themes is "current" (see §3.5 resolution
  order).

Below that: **`ThemeList`** component (see §3.2/§3.3), and finally an
**"Explore Community Themes"** button that in-app-browses to
`https://www.reddit.com/r/HydraThemes`.

### 3.1 Theme resolution / `ThemeContext` (`contexts/SettingsContexts/ThemeContext.tsx`)

State exposed: `systemColorScheme` (OS light/dark, `"unspecified"` coerced to
`"light"`), `lightTheme` (MMKV `theme`, defaults to `"dark"` — i.e. the *light-mode*
slot's stored value, confusingly defaulting to the *Dark* built-in theme), `darkTheme`
(MMKV `darkTheme`, same default), `currentTheme` (computed — see below),
`setCurrentTheme(key, colorScheme?)`, `useDifferentDarkTheme`,
`setUseDifferentDarkTheme`, `theme` (the resolved, fully-merged `Theme` object used
for rendering), `baseTheme` (the resolved theme *without* any live Theme-Maker
in-progress edits applied), `cantUseTheme()` (always `false`), `customThemeData` /
`setCustomThemeData` (the Theme Maker's live draft, held in React state only — not
persisted until "Save Theme" is tapped).

**`currentTheme` resolution**:
```
currentTheme = (systemColorScheme === "light" || !useDifferentDarkTheme)
  ? MMKV["theme"]
  : MMKV["darkTheme"]
  ?? "dark"   // DEFAULT_THEME.key
```
i.e., if Different Dark Mode Theme is off, the `theme` key always applies. If it's
on, the OS's *current* light/dark mode picks between `theme` (light) and
`darkTheme` (dark) live, at every render — not a one-time choice.

**Theme object resolution** from `currentTheme` (a string key):
1. If `currentTheme` is a built-in theme key (one of the 12 in `constants/Themes.ts`)
   → use that theme object directly.
2. Else, look it up as a **custom theme name** via `getCustomTheme(currentTheme)`
   (SQLite `custom_themes` table). If found and its `extends` field is a valid
   built-in key, merge: `{ ...builtInTheme[extends], ...customThemeRow, isPro: true }`
   (custom theme fields override the base theme's fields; unset custom fields fall
   through to the base theme). Note `isPro: true` is set here but is inert (never
   checked against a real subscription — see the global Pro-removal finding).
3. Else → falls back to `DEFAULT_THEME` (`dark`).
4. Finally, **any live Theme Maker draft** (`customThemeData`, only non-empty while
   the Theme Maker screen has ever been visited this session) is spread on top:
   `theme = { ...theme, ...customThemeData }`. This is how the Theme Maker
   live-previews changes across the rest of the app without saving.

Whenever the resolved theme's `statusBar` changes, `expo-status-bar`'s
`setStatusBarStyle` is called to match (`"light"` or `"dark"`).

### 3.2 `ThemeList` component (`components/UI/Themes/ThemeList.tsx`)

Renders two sections:
- **"Built-in Themes"** — one `ThemeRow` per entry of `constants/Themes.ts`'s
  `themes` object, in object-declaration order: `dark, light, midnight, discord,
  spotify, strawberry, spiderman, gilded, mulberry, ocean, aurora, royal`.
- **"Custom Themes"** (only rendered if `getCustomThemes().length > 0`) — one
  `ThemeRow` per row of the SQLite `custom_themes` table, each wrapped in a
  `Slideable` (swipe-to-reveal) with a single **delete** (trash icon, themed
  `theme.delete` red) right-swipe action calling the same delete flow as below.
  Long-pressing a custom theme row opens a native context menu with **Edit** /
  **Delete**:
  - **Edit** → navigates to `hydra://settings/themeMaker?edit=<theme name>`.
  - **Delete** (from either swipe or long-press) → confirmation `Alert` ("Delete
    Theme — Are you sure you want to delete '<name>'?", Cancel/Delete-destructive).
    On confirm, deletes the SQLite row (`deleteCustomTheme`); if the deleted theme
    was the currently-active one, `setCurrentTheme(DEFAULT_THEME.key)` (reverts to
    Dark).

Each `ThemeRow` (`components/UI/Themes/ThemeRow.tsx`): theme name (left, fixed
100pt width), a horizontal **`ThemeColorBand`** (a thin strip divided into N equal
flex segments, one per theme field whose value passes `validateHex()` — i.e. every
hex-color field, in object key order; non-color fields like `key`/`name`/
`systemModeStyle`/`statusBar`/`isPro`/`commentDepthColors` are filtered out
automatically since they aren't valid hex strings — note `commentDepthColors` is an
array so it also fails the hex check and is excluded), and a checkmark icon (theme's
`iconOrTextButton` color) if selected. Tapping a row calls the parent's `onSelect`.

### 3.3 Built-in theme catalog — full palettes (`constants/Themes.ts`)

All 12 themes share one fixed `commentDepthColors` "rainbow" array (used to color
nested comment thread indent lines by depth, cycling through these 6 hex values,
independent of the active theme and **not customizable** even in the Theme Maker):
`#e40303, #ff8c00, #e6d600, #008026, #24408e, #732982`.

Every theme has `isPro: false` in the source (a legacy field, inert now that Pro
is removed).

| Field | Dark | Light | Midnight | Discord | Spotify |
|---|---|---|---|---|---|
| key | `dark` | `light` | `midnight` | `discord` | `spotify` |
| name | Dark | Light | Midnight | Discord | Spotify |
| systemModeStyle | dark | light | dark | dark | dark |
| statusBar | light | dark | light | light | light |
| text | `#fff` | `#000` | `#fff` | `#fff` | `#fff` |
| iconOrTextButton | `#2282fe` | `#2282fe` | `#2282fe` | `#00a8fc` | `#1fdf64` |
| buttonBg | `#2282fe` | `#2282fe` | `#2282fe` | `#00a8fc` | `#1fdf64` |
| buttonText | `#fff` | `#fff` | `#fff` | `#fff` | `#fff` |
| subtleText | `#ccc` | `#222` | `#e4e9ec` | `#e4e9ec` | `#dcdcdc` |
| verySubtleText | `#666` | `#888` | `#b5bac1` | `#b5bac1` | `#b5bac1` |
| background | `#000` | `#ffffff` | `#111214` | `#1e1f22` | `#000000` |
| tint | `#131516` | `#f2f3f7` | `#1e1f22` | `#2b2d31` | `#1a1a1a` |
| iconPrimary | `#2282fe` | `#2282fe` | `#2282fe` | `#00a8fc` | `#1fdf64` |
| iconSecondary | `#ccc` | `#ccc` | `#ccc` | `#ccc` | `#ccc` |
| divider | `#222222` | `#ddd` | `#383a40` | `#383a40` | `#4d4d4d` |
| upvote | `#ff6c00` | `#ff6c00` | `#ff6c00` | `#23a55a` | `#1fdf64` |
| downvote | `#565fe3` | `#565fe3` | `#565fe3` | `#f23f43` | `#565fe3` |
| delete | `#ff0000` | `#ff0000` | `#ff0000` | `#ff0000` | `#ff0000` |
| showHide | `#87ceeb` | `#87ceeb` | `#87ceeb` | `#87ceeb` | `#87ceeb` |
| reply | `#23b5ff` | `#23b5ff` | `#23b5ff` | `#23b5ff` | `#23b5ff` |
| bookmark | `#00ac37` | `#00ac37` | `#00ac37` | `#00ac37` | `#00ac37` |
| share | `#ffd700` | `#ff8c00` | `#9370db` | `#faa61a` | `#ff6b35` |
| collapse | `#9370db` | `#9932cc` | `#40e0d0` | `#9370db` | `#8a2be2` |
| moderator | `#00940f` | `#00940f` | `#00940f` | `#00940f` | `#4687d6` |

| Field | Strawberry | Spiderman | Gilded | Mulberry | Deep Ocean (`ocean`) | Aurora | Royal |
|---|---|---|---|---|---|---|---|
| key | `strawberry` | `spiderman` | `gilded` | `mulberry` | `ocean` | `aurora` | `royal` |
| name | Strawberry | Spiderman | Gilded | Mulberry | Deep Ocean | Aurora | Royal |
| systemModeStyle | light | dark | dark | dark | dark | dark | dark |
| statusBar | dark | light | light | light | light | light | light |
| text | `#2d1f21` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| iconOrTextButton | `#FF6B6B` | `#FF0000` | `#FFD700` | `#FFB4B4` | `#66D9EF` | `#A5FFD6` | `#9D4EDD` |
| buttonBg | `#FF6B6B` | `#FF0000` | `#FFD700` | `#FFB4B4` | `#66D9EF` | `#A5FFD6` | `#9D4EDD` |
| buttonText | `#ffffff` | `#ffffff` | `#1a1a1a` | `#2d1f21` | `#1a2632` | `#1a2428` | `#ffffff` |
| subtleText | `#5a3d3f` | `#e8e8e8` | `#e8e3d9` | `#e8e1e2` | `#e1e9ed` | `#e2ede8` | `#e6e1ed` |
| verySubtleText | `#8a6d6f` | `#b5b5b5` | `#8a8580` | `#8a8384` | `#7a8a94` | `#7d8a85` | `#8a8591` |
| background | `#FFF5F5` | `#000033` | `#1a1a1a` | `#1d0f11` | `#1a2632` | `#1a2428` | `#1F1433` |
| tint | `#FFE8E8` | `#1a1a4d` | `#2a2a2a` | `#382a2c` | `#243442` | `#243035` | `#2A1B45` |
| iconPrimary | `#FF6B6B` | `#FF0000` | `#FFD700` | `#FFB4B4` | `#66D9EF` | `#A5FFD6` | `#9D4EDD` |
| iconSecondary | `#FF8E8E` | `#FF3333` | `#DAA520` | `#E6A4A4` | `#4FB3CC` | `#7FDEB2` | `#7B2CBF` |
| divider | `#FFD6D6` | `#333366` | `#3d3d20` | `#4d3b3d` | `#2d4456` | `#2d4035` | `#3C2665` |
| upvote | `#FF6B6B` | `#FF0000` | `#FFD700` | `#FFB4B4` | `#66D9EF` | `#A5FFD6` | `#9D4EDD` |
| downvote | `#8B6F71` | `#0000FF` | `#8B7355` | `#8B6F71` | `#4A7B8C` | `#5C8C7A` | `#5A189A` |
| delete | `#B22222` | `#B22222` | `#B22222` | `#B22222` | `#B22222` | `#B22222` | `#B22222` |
| showHide | `#87ceeb` | `#87ceeb` | `#87ceeb` | `#87ceeb` | `#87ceeb` | `#87ceeb` | `#87ceeb` |
| reply | `#4CAF50` | `#4169E1` | `#4FB3CC` | `#66D9EF` | `#FFB4B4` | `#FFD700` | `#66D9EF` |
| bookmark | `#2E8B57` | `#32CD32` | `#FFA500` | `#FFC0CB` | `#00CED1` | `#98FB98` | `#9370DB` |
| share | `#ff9500` | `#FFD700` | `#F4A460` | `#DDA0DD` | `#20B2AA` | `#40E0D0` | `#FFB347` |
| collapse | `#9370db` | `#ff69b4` | `#9370db` | `#32cd32` | `#ff6347` | `#da70d6` | `#32cd32` |
| moderator | `#2E8B57` | `#1E90FF` | `#2E8B57` | `#4682B4` | `#32CD32` | `#4169E1` | `#4682B4` |

`DEFAULT_THEME = themes.dark`. In the Guide's stale docs, 7 of these (Dark, Light,
Midnight, Discord, Spotify, Strawberry, Spiderman) were labeled "free" and the last
5 (Gilded, Mulberry, Deep Ocean, Aurora, Royal) "Pro-only, 5-minute free trial" — **in
current code, all 12 are unconditionally selectable by everyone, forever**, since
`cantUseTheme()` always returns `false`.

### 3.4 Theme Maker (`hydra://settings/themeMaker` → `ThemeMaker.tsx`)

Opened either fresh ("Custom Theme +" from the Theme screen) or in edit mode
(`?edit=<name>` query param, via long-press → Edit on a custom theme row). On mount:
- If `?edit=<name>` resolves to an existing custom theme (`getCustomTheme(name)`),
  loads it into the live draft (`customThemeData`).
- Otherwise resets to `NEW_CUSTOM_THEME` extended from the **currently active base
  theme's key** (`{ name: "Custom", extends: baseTheme.key }`).
- On unmount, always resets the draft back to a fresh `{ name: "Custom", extends:
  baseTheme.key }` — i.e. leaving the screen (back, or after a successful save)
  clears any unsaved edits from the live-preview state.

**`CustomTheme` type**: `Partial<Omit<Theme, "key"|"commentDepthColors"|"isPro">> &
{ name: string; extends: <a built-in theme key> }`. Every visual field is optional
— unset fields simply fall through to the `extends` base theme at render time (see
§3.1 step 2). `commentDepthColors` and `isPro`/`key` cannot be customized.

**Screen layout** (top to bottom):
1. **Theme Name** — free-text field, bound to `customThemeData.name`.
2. **UI Mode** — two buttons, `light` / `dark`, bound to
   `customThemeData.systemModeStyle`. Description: *"Controls whether the picker,
   scroll bars, and splash screen display in light or dark mode."*
3. **Status Bar** — two buttons, `light` / `dark`, bound to
   `customThemeData.statusBar`. Description: *"Controls whether the system status
   bar at the top with the time and battery displays in light or dark mode."*
4. **Color Groups** — a horizontally-scrolling row of 5 group-filter buttons (order
   as declared, note this differs from the on-screen tab order which starts on "Text
   Hierarchy" by default state, but the underlying object key order is: "Text
   Hierarchy", "Core Colors", "Interactive Elements", "Icons", "Actions" — default
   selected group on open is **"Text Hierarchy"**). Selecting a group filters the
   field list below to just that group's fields.
5. Field list for the selected group — each row: label + description text (left,
   shrinkable) and a small circular color swatch (right, filled with
   `customThemeData[field]`, or theme text-color border if unset — label appends
   `" (default)"` when the field is unset in the draft). Tapping a row opens the
   **ColorPicker** modal for that field.
6. Static note: *"You can preview your changes by navigating to other tabs in the
   app. This screen will not reflect your changes to ensure usability. Changes will
   persist until you leave the Theme Maker."* (confirmed true — `ThemeMaker.tsx`
   itself styles with `baseTheme`, not the live `theme`, so the editor never
   self-previews.)
7. **Save Theme** button.

**Full color group → field list** (label — description, exactly as shown):

*Text Hierarchy*
- **Text** — "Primary text items, post titles, headers, some icons"
- **Subtle Text** — "Non primary text elements like post details, comment sections, etc."
- **Very Subtle Text** — "Low importance text like text input placeholders"

*Core Colors*
- **Background** — "Background of most screens."
- **Tint** — "Background of popups, text inputs, button groups, low contrast borders"
- **Divider** — "Divider between items, high contrast borders, high contrast backgrounds like flairs, message bubbles, etc."

*Interactive Elements*
- **Button Background** (`buttonBg`) — "Background of big primary action buttons like the floating next comment button"
- **Button Text** (`buttonText`) — "Text of big primary action buttons"
- **Icon/Text Button** (`iconOrTextButton`) — "Buttons that are just text without a container like navbar text buttons"

*Icons*
- **Primary Icon** (`iconPrimary`) — "Keep this the same as Icon/Text Button. It does the same thing. Will probably be removed soon."
- **Secondary Icon** (`iconSecondary`) — "Keep this the same as Subtle Text. Off mode color for switches (poorly named), will probably be removed soon."

*Actions*
- **Upvote**, **Downvote**, **Delete**, **Show/Hide** (`showHide`), **Reply**,
  **Share**, **Collapse**, **Bookmark**, **Moderator** — each described as "Color
  of the X button/slider/username and other X related elements."

**Save flow** (`saveTheme()`): if `name` is blank/whitespace, `Alert` "Please enter
a theme name" and abort. Else, if a custom theme with that exact name already exists
(`getCustomTheme(name)`), confirm-overwrite `Alert` ("Another theme with this name
already exists. Do you want to overwrite it?", Cancel / Overwrite-destructive).
Otherwise (or on Overwrite), `saveCustomTheme(customThemeData)` — SQLite upsert into
`custom_themes` keyed by unique `name` — then immediately `setCurrentTheme(name)`
(applies it as the active theme), then success `Alert` ("Theme saved successfully!",
OK → `navigation.goBack()`).

### 3.5 Color Picker modal (`components/UI/Themes/ColorPicker.tsx`)

A bottom-sheet `Modal` (fade transition, transparent, tap-outside-to-dismiss
overlay that shrinks to zero height while the keyboard is visible so it doesn't
block the hex input):
- Header: "Color Picker" title + "Done" button (calls `onClose`).
- A 100×100 rounded color-preview swatch, and a **HEX** text field (max length 7,
  auto-uppercased, placeholder `#000000`) — typing a valid hex (`#` optional, will
  be prepended) immediately calls `onChange`.
- Three custom horizontal **Slider** rows, R / G / B, range 0–255, with the
  respective pure-color track fill (`#FF0000`/`#00FF00`/`#0000FF`) as the
  "filled" portion and the theme's `divider` color as the "empty" track; thumb
  tinted with the theme's `buttonBg`. Dragging updates the live RGB→hex preview
  continuously (`onValueChange`); releasing (`onSlidingComplete`) commits via
  `onChange`. `Slider` is a fully custom `PanResponder`-based control (
  `components/UI/Themes/Slider.tsx`), not the OS-native slider.
- Editing the hex field and dragging a slider stay in sync (hex parsed into RGB via
  `hexToRgb`, RGB re-encoded to 6-digit uppercase hex via `rgbToHex`; `validateHex`
  accepts 3/6/8-hex-digit `#`-prefixed strings case-insensitively, though the RGB
  round-trip only supports the 6-digit form).

### 3.6 Sharing / importing themes (`utils/colors.ts`, `ThemeImport.tsx`, `MarkdownEditor.tsx`, `RenderHTML.tsx`)

**Export/share format**: a custom theme is shared by embedding its JSON inline in
Reddit post/comment markdown text, wrapped with a sentinel prefix:

```
\n::hydra-theme-import::{"name":"MyTheme","extends":"dark","text":"#fff",...}\n
```

- Prefix constant: `CUSTOM_THEME_IMPORT_PREFIX = "::hydra-theme-import::"`
  (`constants/Themes.ts`).
- Detection regex: `` /(::hydra-theme-import::\{[^}]+\})/g `` — matches the prefix
  immediately followed by a single-level `{...}` JSON object (no nested braces
  supported, so a theme's JSON must not itself contain `{`/`}` inside a string
  value, e.g. no HTML/CSS-like text in `name`).
- Payload is exactly `JSON.stringify(customThemeData)` — i.e. the same
  `CustomTheme` shape used everywhere else (`name`, `extends`, plus any of the 19
  optional color fields the user set).

**Attaching (composing)**: In `components/UI/MarkdownEditor.tsx` (used by the
post/comment composer when `showCustomThemeOption` is true — the paintbrush icon in
the editor toolbar, outside this document's scope to detail further), selecting one
of the user's custom themes from a `ThemeList` (custom-only mode) shows an `Alert`
("Attach Theme — Do you want to attach the '<name>' theme to your text?",
Cancel/Attach). On Attach, the sentinel string above is inserted into the text at
the current cursor/selection position, surrounded by newlines.

**Detecting/importing on render**: `components/HTML/RenderHTML.tsx`'s text-node
renderer runs every rendered text node's raw string through
`extractThemeFromText(text)` (`utils/colors.ts`), which regex-matches the sentinel
pattern, `JSON.parse`s each match's payload into a `CustomTheme`, strips the
matched substring out of the displayed text, and returns `{ customThemes,
remainingText }`. For each detected embedded theme, a **`ThemeImport`** card
(`components/UI/Themes/ThemeImport.tsx`) is rendered inline (in addition to the
surrounding text): rounded, 5px-bordered card with the theme name, "Hydra Theme"
subtitle, and a `ThemeColorBand` preview strip. If the embedded object's `extends`
field isn't a string, it instead renders "Theme is invalid" in place of the card.
Tapping the card shows an `Alert` ("Import Theme — Import '<name>' to your custom
themes?") with three options:
- **Cancel**
- **Import** — `saveCustomTheme(customTheme)` only (SQLite upsert by name); confirms
  with a follow-up alert `"<name>" imported successfully!`.
- **Import & Apply** — same save, then also `setTheme(customTheme.name)`
  (immediately makes it the active theme).

Malformed embedded JSON is silently swallowed (`try/catch`, no user-facing error) —
the sentinel text is simply left untouched/unrendered as a theme card in that case
(regex still strips it if it matched the brace-balanced pattern, otherwise it's left
as literal visible text).

---

## 4. Appearance (`hydra://settings/appearance` → `Appearance.tsx`)

Three grouped `List`s, all Switch/picker rows, no section is conditionally hidden
except as noted. Backed by `PostSettingsContext`, `CommentSettingsContext`,
`TabSettingsContext`, plus `useSplitViewSupport()`.

### 4.1 "Post Appearance Settings"

| Row | Control | MMKV key | Default |
|---|---|---|---|
| Make posts compact | Switch | `postCompactMode` | `deviceSupportsSplitView` (i.e. **true** on any device/window ≥768pt wide such as iPad, **false** otherwise) |
| Show thumbnails on right *(only shown when compact mode is on)* | Switch | `showThumbnailsOnRightSide` | `false` |
| Enable split view *(only shown on devices where `deviceSupportsSplitView` is true, i.e. iPad-class screens)* | Switch | `splitViewEnabled` | `deviceSupportsSplitView` (effectively `true` when shown) |
| Show subreddit at top | Switch | `subredditAtTop` | `false` |
| Show subreddit icons | Switch | `showSubredditIcon` | `true` |
| Post title max lines | Picker 1–10 | `postTitleLength` | `2` |
| Post text max lines | Picker 0–10 | `postTextLength` | `3` |
| Link description max lines | Picker 0–30 | `linkDescriptionLength` | `10` |
| Show post flairs | Switch | `showPostFlair` | `true` |
| Blur spoilers | Switch | `blurSpoilers` | `true` |
| Blur NSFW | Switch | `blurNSFW` | `true` |
| Auto play videos | Switch | `autoPlayVideos` | `true` |
| Focused video audio | Switch | `feedVideoAudio` | `false` |
| Tapped video audio | Switch | `tappedVideoAudio` | **mirrors `feedVideoAudio`** until explicitly set once, then sticks independently (see note) |
| Live text | Switch | `liveTextInteraction` | `false` |
| Tap to collapse | Switch | `tapToCollapsePost` | `true` |

`tappedVideoAudio` note (from source comment): governs audio for videos opened by
tapping into the fullscreen viewer. Until the user has ever flipped this specific
toggle, it silently follows `feedVideoAudio`'s current value (so a muted feed opens
tapped videos muted too); the first explicit toggle "pins" it and it stops tracking
`feedVideoAudio` from then on.

`splitViewEnabled`'s underlying key is shared with `utils/useSplitViewSupport.ts`
(`MIN_WIDTH = 768`), also consulted elsewhere for iPad-only layout branching (out of
this document's scope).

**"Show post summary"** exists as a field in `PostSettingsContext`
(`showPostSummary`, MMKV key `showPostSummary`, default `true`) but **is not
rendered anywhere on this screen** — dead setting, no UI, see the global Pro-removal
finding.

### 4.2 "Comment Appearance Settings"

| Row | Control | MMKV key | Default |
|---|---|---|---|
| Right side vote indicators | Switch | `voteIndicator` | `false` |
| Collapse AutoModerator | Switch | `collapseAutoModerator` | `true` |
| Show flairs | Switch | `commentFlairs` | `true` |
| Tap to collapse | Switch | `tapToCollapseComment` | `true` |
| Collapse children only | Switch | `collapseChildrenOnly` | `false` |

Toggling **Right side vote indicators** or **Tap to collapse** (comments) shows an
`alert()`: *"Existing pages may need to be refreshed for this change to take
effect."* (native `alert`, not `Alert.alert` — single-button, platform default
styling.)

`showCommentSummary` (default `true`) exists in `CommentSettingsContext` but again
has **no UI row** anywhere — dead setting.

### 4.3 "Tab Appearance Settings"

| Row | Control | MMKV key | Default |
|---|---|---|---|
| Show username | Switch | `showUsername` | `true` |
| Hide on infinite scroll | Switch | `hideTabsOnScroll` | `false` |

---

## 5. App Icon (`hydra://settings/appIcon` → `AppIcon.tsx` / `AppIconDetails.tsx`)

**Only reachable/listed** when `expo-alternate-app-icons`' `supportsAlternateIcons`
is true (device/OS capability check performed once at the Root list, §1.1).

**`AppIcon.tsx`** — a 2-column grid of icon cards (`APP_ICONS` array, in this
order):
1. **Hydra** (`name: null` = the default/original app icon) — author `dmilin`
2. **Cerberus** (`cerberus`) — author `batjake`
3. **Hail Hydra!** (`hail_hydra`) — author `boxsitter`
4. **Hail Hydra! (Dark)** (`hail_hydra_dark`) — author `boxsitter`

Each card: 90×90 rounded icon image, pretty name, a small author row (avatar +
`u/<username>`), and (if currently applied, checked via
`expo-alternate-app-icons`' `getAppIconName()`) a checkmark badge + highlighted
border. Tapping a card navigates to `hydra://settings/appIconDetails/<name-or-"default">`.

**Author records** (`AUTHORS` map, used for both grid + detail):
- `dmilin` — u/dmilin, website `https://github.com/dmilin1/hydra`, bio: *"Hi, I'm
  Dimitrie, the developer of Hydra. I'm a software engineer and have been building
  apps for almost 2 decades. I built Hydra to craft the best possible Reddit
  experience for myself and others."*
- `batjake` — u/batjake, website `http://brokendiamonddesign.com/`, instagram
  `@bdiamonddesigns`, bio: *"Hi, I'm Jake, a graphic designer with 10+ years of
  experience creating bold logos, striking album art, and brand visuals that
  resonate. I specialize in helping businesses and musicians stand out with designs
  that capture essence, tell stories, and leave lasting impressions."*
- `boxsitter` — u/boxsitter, no website/instagram, bio: *"Hi, I'm Boxsitter, a
  hobbyist designer who wanted to create something special for this app. Because I
  run the open-source server myself, I designed this icon as a way to support the
  project in lieu of a subscription. I hope you enjoy this reminder that if you cut
  off one head, two more shall take its place. Hail Hydra!"*

**`AppIconDetails.tsx`** — large 150×150 preview (with checkmark badge if active),
icon pretty-name title, an author profile card (avatar, `u/username`, "Icon
Creator" label, bio text), a "Links" card listing whichever of Reddit profile
(always, if `redditUsername` set — all 3 authors have one; deep-links to
`https://reddit.com/u/<username>` via in-app `pushURL`), Website (external
`Linking.openURL`), and Instagram (`https://instagram.com/<handle without @>`,
external) are present for that author, and finally a full-width **"Set as App
Icon"** button (disabled + shows a checkmark + "Current App Icon" label if this
icon is already active). Tapping it calls `setAlternateAppIcon(iconName)`
(`expo-alternate-app-icons`); on failure, `Alert.alert("Error setting app icon")`.
Change takes effect immediately (no restart needed, per the OS-level API).

---

## 6. Account (`hydra://accounts`)

Out of this document's primary scope (account/login flow belongs to another area),
but the **settings-side account switcher UI**, `components/UI/AccountList.tsx`, is
covered here since it's reachable from the Settings root:

- If zero accounts are logged in, shows centered "No accounts" text.
- Otherwise, a scrollable list of `[...accounts, "Logged Out"]` rows, each
  `Slideable` with a left-swipe **delete** action (except the synthetic "Logged
  Out" row, which has no delete action). Tapping a username row calls
  `AccountContext.logIn(username)` (switches active account); tapping "Logged Out"
  calls `logOut()`. A checkmark or loading spinner shows next to whichever
  row matches the current session state. Long-pressing a real account (not "Logged
  Out", and only with a single touch point) opens a context menu with **Delete**,
  calling `removeUser(username)` (also reachable via left-swipe or the
  accessibility "delete" custom action). Deleting shows a loading spinner on that
  row while in flight.

---

## 7. Data Use (`hydra://settings/dataUse` → `DataUse.tsx`)

Backed by `contexts/SettingsContexts/DataModeContext.tsx`.

- **Use Low Data on Wi-Fi** — Switch.
- **Use Low Data on Cellular** — Switch.

Both persisted together in one MMKV JSON object, key `dataMode`:
`{ wifi: "normal"|"lowData", cellular: "normal"|"lowData" }`, **default `{ wifi:
"normal", cellular: "normal" }`** (i.e. low data mode is off for both connection
types by default). Each Switch is simply `value === "lowData"`; toggling flips that
one field between `"normal"`/`"lowData"`.

Live connection-type detection via `@react-native-community/netinfo`
(`NetInfo.addEventListener`), used to compute `currentDataMode` (which of the two
settings currently applies) — but this computed value isn't shown/used on the
settings screen itself; it's consumed elsewhere (media-loading components, out of
scope here) to decide whether to defer video/image loading.

Explanatory footer text: *"Low data mode reduces the quality and amount of media
that gets loaded when scrolling. For example, videos will not be loaded while
scrolling and will only load when they are clicked on. Links will not load article
images. Subreddit icons will be not be loaded."*

---

## 8. Stats (`hydra://settings/stats` → `Stats.tsx`)

**Always fully unlocked for everyone** — despite the bundled Guide describing Stats
as Pro-gated with obfuscated numbers for free users, the obfuscation helper
functions are literal identity passthroughs in the current code; there is no gating
of any kind.

Data sources: SQLite tables `counter_stats` (`db/functions/Stats.ts`,
`getStats()` → `Record<Stat, number>`) and `subreddit_visits`
(`getSubredditVisitCounts()` → `Record<string, number>`).

**`Stat` enum / counter keys** (SQLite `counter_stats.key` values):
`app_launches`, `app_foregrounds`, `scroll_distance`, `posts_viewed`,
`post_upvotes`, `post_downvotes`, `posts_created`, `comment_upvotes`,
`comment_downvotes`, `comments_created`.

**Where counters increment** (outside this file set, but documented here for
completeness):
- `app_launches` +1 and `app_foregrounds` +1 — once on cold start
  (`app/index.tsx`, after DB migrations complete).
- `app_foregrounds` +1 again — every subsequent transition of `AppState` to
  `"active"` (i.e. every time the app is foregrounded, not just cold starts).
- `scroll_distance` — incremented by `RedditDataScroller.tsx` in
  density-independent pixel units, flushed periodically (not per-frame).
- `posts_viewed` +1 — every time a post detail page is opened
  (`pages/PostDetails.tsx`).
- `post_upvotes`/`post_downvotes`/`comment_upvotes`/`comment_downvotes` — on
  vote actions in `api/PostDetail.ts` (post vs. comment target determines which
  pair; sign of the delta determines up vs. down).
- `posts_created` +1 / `comments_created` +1 — on successful post/comment
  submission (`api/PostDetail.ts`).

**DB maintenance**: `resetStats()` (delete all `counter_stats` rows) exists as a
function in `db/functions/Stats.ts` but **is never called anywhere in the app** —
there is no "reset stats" button on this screen or elsewhere. Stats accumulate
forever (bounded only by counters being plain integers) unless the user
uninstalls/reinstalls.

**Screen layout** (top to bottom, `ScrollView`):

1. **Hero section**: "Your Hydra Journey" title, subtitle
   `"You've been using Hydra for {prettyTimeSince(installTime)}!"` where
   `installTime` comes from `Application.getInstallationTimeAsync()` (actual OS
   install timestamp, fetched async on mount) and `prettyTimeSince` renders the
   single largest unit (e.g. "3 days", "2 months", "1 year" — see `utils/Time.ts`).

2. **"Your Reddit Activity"** — a grid of 5 stat cards (icon, big value, title,
   subtitle):
   - **Posts Explored** — `posts_viewed`, subtitle "Knowledge acquired".
   - **Distance Scrolled** — computed distance (see below), subtitle a banana
     comparison: `"That's about {scrollInches/6.5} banana(s)!"`.
   - **Upvotes Given** — `post_upvotes + comment_upvotes`, subtitle
     `"{post_upvotes} post(s), {comment_upvotes} comment(s)"`.
   - **Downvotes Given** — `post_downvotes + comment_downvotes`, same subtitle
     shape.
   - **Content Created** — `posts_created + comments_created`, same subtitle
     shape.

   **Distance math**: `scrollDistanceInches = scroll_distance_stat / 160` (assumes
   ~160 DPI-normalized device-independent pixels ⇒ inches), formatted via
   `prettyDistance`: if `< 1000` meters, shows `"{feet}ft / {meters}m"` (0
   decimals); otherwise `"{miles}mi / {km}km"` (1 decimal). `scrollDistanceKm =
   scrollDistanceInches * 0.0000254`.

3. **"Your Usage Patterns"** — a card listing (each row only shown if its `show`
   condition is true):
   - **App Launches** — `app_launches` (always shown).
   - **Opens per Day** — `app_foregrounds / daysSinceTrackingStarted` (2
     decimals; always shown). `daysSinceTrackingStarted` uses
     `max(installTime, new Date("2025-08-12").getTime())` — i.e. stats are only
     ever considered to have been tracked starting **August 12, 2025** at the
     earliest, even if the app was installed earlier.
   - **Total Opens** — `app_foregrounds` (always shown).
   - **Upvote Ratio** — `(positiveVotes/totalVotes)*100`, shown **only if any
     votes exist** (`positivityRatio > 0`).

4. **"Your Favorite Communities"** — **only shown if ≥1 subreddit has been
   visited**. Top 10 subreddits by visit count (SQLite `subreddit_visits`,
   descending), each row: rank `#N`, `r/<subreddit>`, a proportional progress bar
   (width = `visits / maxVisits * 100%`, where `maxVisits` = the #1 entry's count),
   and the raw visit count. (Where `incrementSubredditVisitCount` is actually
   called is outside this file set — presumably subreddit page loads.)

5. **"Achievements Unlocked"** — **only shown if ≥1 achievement is unlocked**. No
   progress indicator; each simply appears once its threshold is met:
   - **Dedicated User** — `app_launches >= 50`.
   - **Scroll Master** — `scrollDistanceKm >= 5`.
   - **Positive Vibes** — `positivityRatio >= 80` **and** `totalVotes >= 10`.
   - **Content Creator** — `posts_created >= 10`.
   - **Commentary Master** — `comments_created >= 10`.
   - **Explorer** — unique subreddits visited `>= 10`.
   - **Knowledge Seeker** — `posts_viewed >= 100`.

6. **"Fun Facts"** — a dynamically-built list of 🌙/🏃/🔄/📰/👀/👍/💬-prefixed
   sentences, each conditionally included only when its inputs are non-zero /
   well-defined:
   - Moon-scroll %: `(scrollDistanceKm / 384_400) * 100`, 7 decimals — "You've
     scrolled X% of the way to the moon" (always included once any scrolling has
     happened).
   - Marathons scrolled: `scrollDistanceKm / 42.195`, 5 decimals.
   - Return rate: `app_foregrounds / app_launches`, 1 decimal — only if
     foregrounds > launches.
   - Posts-read-per-post-created: `posts_viewed / posts_created`, 1 decimal —
     only if both > 0.
   - Posts-viewed-per-foot-scrolled: `posts_viewed / (scrollInches/12)`, 2
     decimals — only if both scroll and views > 0.
   - Posts-clicked-per-open: `posts_viewed / app_foregrounds`, 2 decimals — only
     if both > 0.
   - Upvote:downvote ratio: `positiveVotes / negativeVotes`, 2 decimals — only if
     both > 0.
   - Comment:post vote ratio: `commentVotes / postVotes`, 2 decimals — only if
     both > 0.

   **"Magic number" easter eggs**: for each of the 9 raw counters (`posts_viewed`,
   `posts_created`, `app_foregrounds`, `app_launches`, `comments_created`,
   `post_upvotes`, `post_downvotes`, `comment_upvotes`, `comment_downvotes`), if
   its current value *exactly equals* one of these milestone numbers, an extra fun
   fact line is appended:
   - **34** 🍆 "There should be a rule about this."
   - **69** 😏 "Nice."
   - **420** 🌿 "Blaze it."
   - **80085** 🍒 "You're a pro!"
   - **1337** 🤖 "You're elite."
   - **31337** 🤖 "You're elite."
   - **1000** 🎉 "You're a pro!"
   - **10000** 🎉 "You're a pro!"
   - **100000** 🎉 "You're a pro!"
   (Format: `"{emoji} You've {verb} {num} {noun} - {description}"`, e.g. *"😏
   You've upvoted 69 posts - Nice."* — since this is an exact-equality check, each
   only ever fires transiently, for exactly one value of the counter, then never
   again.)

7. **"Serious Facts"** — two fixed lines, always shown:
   - *"🔒 All these stats are stored locally on your device. They are not sent to
     any servers."*
   - *"❤️ I build Hydra in my spare time as a passion project. Thanks for using
     it!"*

No numbers anywhere on this page are ever formatted with thousands separators
beyond what `toLocaleString` naturally does; there is no reset button.

---

## 9. Privacy (`hydra://settings/privacy` → `Privacy.tsx`)

Single toggle:
- **Allow Hydra to report errors** — Switch. MMKV boolean key
  `allowErrorReporting`, default `true` (opt-out, not opt-in). Toggling shows
  `alert("Hydra must be restarted for this change to take effect.")`.

Footer text: *"If Hydra encounters an error (e.g. a crash or loading issue), it
will automatically upload an error log. This log includes a stack trace to
pinpoint the issue, your Reddit username (if logged in), and device details like
phone model and available RAM. These logs help keep Hydra bug free!"*

This is Hydra's only crash/analytics reporting toggle — the actual Sentry (or
similar) initialization/gating logic that reads this key lives outside this file
set (likely app entry point / error boundary setup), but this is the single
control surface for it. There is no separate general "Analytics" toggle and no
"incognito mode" anywhere in the app.

---

## 10. Advanced (`hydra://settings/advanced` → `Advanced.tsx`)

**"Caching" section**:
- **Clear Image Cache (N MB)** — button row, label shows live cache size
  (`ImageCache.useCache()`, recomputed whenever this screen regains focus).
  Backed by `expo-image`'s disk cache under
  `Directory(Paths.cache.uri + "/com.hackemist.SDImageCache/default")`, capped at
  512 MB disk / 256 MB memory (`MAX_DISK_CACHE_SIZE`/`MAX_MEMORY_CACHE_SIZE`, set
  once at app start via `Image.configureCache`, iOS only). Also auto-clears the
  in-memory cache on OS `memoryWarning` events, independent of this button.
  Tapping clears **immediately** (`Image.clearDiskCache()`), shows `Alert.alert`
  "Cache Cleared — The image cache has been cleared.", and the displayed size
  resets to 0 right away.
- **Clear Video Cache (N MB)** — button row, label shows live cache size
  (`VideoCache.getCacheSize()` via `expo-video`'s `getCurrentVideoCacheSize()`,
  capped at 1 GB — `setVideoCacheSizeAsync` called once at module load). Tapping
  **does not clear immediately** — video components can't have their cache cleared
  while mounted, so it sets MMKV boolean key `videoCacheClearRequested = true` and
  shows `Alert.alert("The video cache will be cleared next time you restart
  Hydra.")`. The actual clear (`clearVideoCacheAsync()`) happens on the **next
  app cold start**, before first render, gated on that same flag
  (`VideoCache.clearCacheIfRequested()` in `app/index.tsx`), which then resets the
  flag back to `false`.

**"Self Hosted Hydra Server" section**:
- **Use Custom Server** — Switch. MMKV boolean key `useHydraServer`
  (`USE_CUSTOM_HYDRA_SERVER_KEY`), default `false`.
- When on, an additional text field + status area appears:
  - Free-text server URL field, initial value = current MMKV string
    `customHydraServerUrl` or else the default `"https://api.hydraapp.io"`
    (`DEFAULT_HYDRA_SERVER_URL`). Editing it (or toggling the switch) triggers
    `hydraServerStatus(url)` (`api/HydraServerStatus.ts` — `GET
    {url}/api/status`, valid only if HTTP 200 and body text is exactly `"Hydra
    server is up"`).
  - While validating: *"Checking server status..."*
  - If invalid/unreachable: *"Custom server URL is not valid or your server is
    not set up properly."*
  - If valid: *"Success! App must be restarted for changes to take effect."* — and
    **only on validation success** is `customHydraServerUrl` actually persisted to
    MMKV (`KeyStore.set`). An invalid/unvalidated URL is never saved, so it can't
    "half-apply."
- At runtime (module load, `constants/HydraServer.ts`), the effective
  `HYDRA_SERVER_URL` used for all API calls is:
  - In `__DEV__` builds: `process.env.EXPO_PUBLIC_HYDRA_SERVER` env var, or else
    the default.
  - In production builds: the persisted `customHydraServerUrl` MMKV value, or
    else the default.
  - This resolution happens **once at module load**, not reactively — hence the
    "restart required" messaging throughout.
  - A separate flag `USING_CUSTOM_HYDRA_SERVER` is true only if the switch is on
    *and* the saved custom URL does **not** contain the substring `"hydraapp.io"`
    (i.e. pointing at hydraapp.io's own infrastructure doesn't count as "using a
    custom server" even if the toggle is on).
- **Note**: the AI documentation-search embedding endpoint
  (`getEmbedding`, `api/AI.ts`) always calls the **hardcoded**
  `DEFAULT_HYDRA_SERVER_URL`, never the resolved/custom `HYDRA_SERVER_URL` — so a
  self-hosted server never intercepts Guide search embedding calls, only
  `askQuestion` (the Guide's AI-answer feature) does, since that one uses
  `HYDRA_SERVER_URL`.

**Not present**: "Customer ID" (described in the bundled docs) is never rendered on
this screen — dead/stale doc content, see the global finding.

---

## 11. Settings persistence layer

### 11.1 Backends

- **MMKV** (`react-native-mmkv`, default unnamed instance created once via
  `createMMKV()` in `utils/KeyStore.ts`, exported as the `KeyStore` default export)
  — used for essentially every boolean/string/number/object *preference*. All
  `useMMKVBoolean`/`useMMKVString`/`useMMKVNumber`/`useMMKVObject` hooks throughout
  Settings read/write this one store. Objects are stored as JSON strings under the
  hood (transparent to callers). `KeyStore.getAllKeys()` is used in a couple of
  places (Sorting screen, per-subreddit sort keys) to enumerate/bulk-delete a
  dynamic key prefix.
- **SecureStore** (`expo-secure-store`) — used **only** for Reddit auth cookies
  (`utils/RedditCookies.ts`), not for any Settings-area preference. Out of scope
  here but noted so the Swift rewrite doesn't conflate the two stores.
- **SQLite** (via Drizzle ORM, `expo-sqlite`, file `db.db`, WAL journal mode) —
  used for anything that's really a *dataset* rather than a scalar preference:
  seen-posts history, hidden-posts list, drafts, custom themes, counter stats, and
  subreddit visit counts. See §11.3 for the schema.

There is **no settings-schema version/migration mechanism** for the MMKV store —
keys are read with `??` fallbacks to hardcoded defaults inline at each call site;
there is no central "migrate old key to new key" step anywhere in the settings
code. The SQLite store *does* have Drizzle migrations (see §11.3) but those only
add/alter tables, never touch MMKV.

### 11.2 Complete MMKV key inventory (Settings-relevant)

| MMKV key | Type | Default | Set by / consumed by |
|---|---|---|---|
| `theme` | string | `"dark"` | `ThemeContext` — light-mode (or single-mode) theme key |
| `darkTheme` | string | `"dark"` | `ThemeContext` — dark-mode theme key (only used if `useDifferentDarkTheme`) |
| `useDifferentDarkTheme` | boolean | `false` | `ThemeContext` |
| `swipeAnywhereToNavigate` | boolean | `false` | `GesturesContext` |
| `postSwipeOptions` | JSON object | `{farRight:"downvote",right:"upvote",farLeft:"bookmark",left:"hide"}` | `GesturesContext` |
| `commentSwipeOptions` | JSON object | `{farRight:"downvote",right:"upvote",farLeft:"bookmark",left:"reply"}` | `GesturesContext` |
| `filterSeenPosts` | boolean | `false` | `FiltersContext` |
| `hideSeenURLs` | JSON object | `{}` | `FiltersContext` (per-URL override map) |
| `filteredSubreddits` | JSON object | `{}` | `FiltersContext` (subreddit → `true`\|epoch-ms expiry) |
| `autoMarkAsSeen` | boolean | `false` | `FiltersContext` |
| `filterText` | string | `""` | `FiltersContext` (comma/newline-separated text filter list) |
| `readClipboard` | boolean | `false` | `General/OpenInHydra.tsx` |
| `externalLinkBrowser` | string | `"internalBrowser"` | `utils/openExternalLink.ts` |
| `openInReaderMode` | boolean | `false` | `utils/openExternalLink.ts` |
| `initialTab` | string | `"Posts"` | `contexts/NavigationContext.tsx` |
| `startupURL` | string | `"https://www.reddit.com/"` | `contexts/NavigationContext.tsx` |
| `defaultPostSort` | string | `"default"` | `General/Sorting.tsx` |
| `defaultPostSortTop` | string | `"all"` | `General/Sorting.tsx` |
| `rememberPostSubredditSort` | boolean | `false` | `General/Sorting.tsx` |
| `defaultCommentSort` | string | `"default"` | `General/Sorting.tsx` |
| `rememberCommentSubredditSort` | boolean | `false` | `General/Sorting.tsx` |
| `sortHomePage` | boolean | `false` | `General/Sorting.tsx` |
| `PostSubredditSort-<subreddit>` | string | n/a (dynamic, per-subreddit) | remembered post sort per subreddit |
| `PostSubredditSortTop-<subreddit>` | string | n/a | remembered post "top" time period per subreddit |
| `CommentSubredditSort-<subreddit>` | string | n/a | remembered comment sort per subreddit |
| `postCompactMode` | boolean | `deviceSupportsSplitView` | `PostSettingsContext` |
| `showThumbnailsOnRightSide` | boolean | `false` | `PostSettingsContext` |
| `subredditAtTop` | boolean | `false` | `PostSettingsContext` |
| `showSubredditIcon` | boolean | `true` | `PostSettingsContext` |
| `postTitleLength` | number | `2` | `PostSettingsContext` |
| `postTextLength` | number | `3` | `PostSettingsContext` |
| `linkDescriptionLength` | number | `10` | `PostSettingsContext` |
| `showPostFlair` | boolean | `true` | `PostSettingsContext` |
| `blurSpoilers` | boolean | `true` | `PostSettingsContext` |
| `blurNSFW` | boolean | `true` | `PostSettingsContext` |
| `showPostSummary` | boolean | `true` | `PostSettingsContext` — **dead, no UI** |
| `autoPlayVideos` | boolean | `true` | `PostSettingsContext` |
| `feedVideoAudio` | boolean | `false` | `PostSettingsContext` |
| `tappedVideoAudio` | boolean | mirrors `feedVideoAudio` until set | `PostSettingsContext` |
| `liveTextInteraction` | boolean | `false` | `PostSettingsContext` |
| `tapToCollapsePost` | boolean | `true` | `PostSettingsContext` |
| `voteIndicator` | boolean | `false` | `CommentSettingsContext` |
| `collapseAutoModerator` | boolean | `true` | `CommentSettingsContext` |
| `commentFlairs` | boolean | `true` | `CommentSettingsContext` |
| `showCommentSummary` | boolean | `true` | `CommentSettingsContext` — **dead, no UI** |
| `tapToCollapseComment` | boolean | `true` | `CommentSettingsContext` |
| `collapseChildrenOnly` | boolean | `false` | `CommentSettingsContext` |
| `showUsername` | boolean | `true` | `TabSettingsContext` |
| `hideTabsOnScroll` | boolean | `false` | `TabSettingsContext` |
| `splitViewEnabled` | boolean | `deviceSupportsSplitView` | `utils/useSplitViewSupport.ts` |
| `dataMode` | JSON object | `{wifi:"normal",cellular:"normal"}` | `DataModeContext` |
| `allowErrorReporting` | boolean | `true` | `Privacy.tsx` |
| `useHydraServer` | boolean | `false` | `Advanced.tsx` / `constants/HydraServer.ts` |
| `customHydraServerUrl` | string | `"https://api.hydraapp.io"` | `Advanced.tsx` / `constants/HydraServer.ts` (only written on successful validation) |
| `videoCacheClearRequested` | boolean | `false` | `utils/VideoCache.ts` (internal flag, no direct UI) |
| `lastAskedToSubscribeToHydraClient-<userId>` | number (epoch ms) | unset | `components/Modals/SubscribeToHydra.tsx` — **subreddit-join nag, unrelated to Hydra Pro** despite the filename |
| `lastSeenUpdate` | string | unset | `components/Modals/StartupModals/UpdateInfo.tsx` — patch-notes "seen" tracking, current version string is `"v4.0.0"` |
| `storeReviewRequested` | boolean | unset | `components/Modals/StartupModals/PromptForReview.tsx` — shown once `app_launches > 30` |

### 11.3 SQLite schema (`db/schema.ts`, Drizzle ORM, file `db.db`, WAL mode)

6 tables, all with `id` autoincrement PK, `createdAt`/`updatedAt` text timestamps
(SQLite `CURRENT_TIMESTAMP` default, `updatedAt` auto-bumped by Drizzle's
`$onUpdate`):

1. **`seen_posts`** — `postId` (text, **unique** indexed), plus indexes on
   `createdAt`/`updatedAt`. Tracks which posts the user has scrolled past
   (consumed by the "Hide Seen Posts" filter, write/read logic outside this file
   set except for maintenance).
2. **`hidden_posts`** — `postId` (unique indexed), `title`, `subreddit`,
   `expiresAt` (integer epoch-ms, indexed), plus `createdAt`/`updatedAt` indexes.
   Powers §2.3's "Hidden posts" list. `expiresAt = hideTime + 30 days`.
3. **`drafts`** — `key` (unique indexed), `text`, plus timestamp indexes. Post/comment
   composer drafts (outside this document's scope beyond noting the table).
4. **`custom_themes`** — `name` (unique indexed), `data` (JSON-stringified
   `CustomTheme`), plus timestamp indexes. Powers §3 Theme Maker persistence.
5. **`counter_stats`** — `key` (unique indexed, one of the `Stat` enum values),
   `count` (integer, default 0), plus timestamp indexes. Powers §8 Stats.
6. **`subreddit_visits`** — `subreddit` (unique indexed), `count` (integer,
   default 1), plus timestamp indexes. Powers §8's "Favorite Communities".

Migration history (`drizzle/*.sql`, applied in order at app start before any
DB reads): `0000` creates `seen_posts`; `0001` adds its indexes; `0002` creates
`drafts`; `0003` creates `custom_themes`; `0004` creates `counter_stats` +
`subreddit_visits`; `0005` creates `hidden_posts`. This is a linear, additive
migration chain with no destructive/data-transforming steps — a from-scratch Swift
rewrite can simply create all 6 tables directly with this final shape; there's no
need to replay history.

### 11.4 Database maintenance (`db/functions/Maintenance.ts`)

`doDBMaintenance()` runs three pruning routines, called once per app cold start
(`app/index.tsx`, deferred via `InteractionManager.runAfterInteractions` so it
doesn't block first paint, but still runs on every launch, not periodically in the
background):

1. **`maintainSeenPosts()`** — if `seen_posts` row count > 5,000
   (`MAX_SEEN_POSTS`), deletes the oldest rows (by `id`, via `createdAt` order) down
   to exactly 5,000 remaining.
2. **`maintainHiddenPosts()`** — deletes every `hidden_posts` row whose
   `expiresAt < Date.now()` (i.e. all rows past their 30-day expiry — every
   launch, not just when viewing the Filters screen).
3. **`maintainDrafts()`** — if `drafts` row count > 100 (`MAX_DRAFTS`), deletes
   the oldest rows down to exactly 100 remaining.

`custom_themes`, `counter_stats`, and `subreddit_visits` are **never pruned** —
they grow/persist indefinitely (custom themes because a user explicitly created
them; stats/visits because they're meant to be a permanent running tally).

---

## 12. Guide / in-app documentation browser (`hydra://settings/guide*` → `Guide.tsx`)

The Guide is a self-contained markdown documentation viewer + semantic search +
AI Q&A layered over a static, build-time-generated corpus.

### 12.1 Content pipeline (build-time, `generateDocumentation.ts`)

This is a Node script (not run at app runtime) that: reads every `.md` file in
`documentation/` (43 files as of this snapshot), parses an optional
`===METADATA===...title:...description:...===END METADATA===` header block off the
top of each file (metadata absent → empty title/description, whole file becomes
`text`), sends each file's remaining markdown body to OpenAI's
`text-embedding-3-small` model (`POST https://api.openai.com/v1/embeddings`, API
key from `.env.local`'s `OPEN_AI_KEY`, batched 10 files at a time) to get a
1536-dimension embedding vector, and writes the whole result — key, title,
description, the *raw embedding vector array*, and the markdown *text* (with the
metadata header stripped) — into a single generated TypeScript source file,
`constants/documentation.ts` (`export const DOCUMENTATION = { <key>: { key, title,
description, vector: number[], text: string }, ... }`), which is then compiled
into the app bundle like any other source file. **There is no runtime dependency on
OpenAI or the generator script** — the vectors ship baked into the app binary, so
doc search works fully offline against those precomputed vectors; only the *query*
text's embedding is fetched live (see §12.3).

### 12.2 Guide screen structure (`Guide.tsx`)

URL query params drive which of 4 states render (mutually exclusive, in this
priority order): `?doc=<key>` (single doc), else `?category=<name>` (category doc
list), else `?search=<text>` (search results / AI answer), else the categories
index. A persistent `SearchBar` (autocorrect on, submits on blur too as
`searchOnBlur`) sits above all of these; submitting non-empty text calls
`navigation.replaceURL("hydra://settings/guide/?search=<encoded>")` (replaces, not
pushes, so repeated searches don't pile up history); clearing it calls
`replaceURL("hydra://settings/guide/")`.

**Categories index** (default, no query params) — a `List` titled "Categories",
11 entries in this fixed order, each showing name + description, navigating to
`?category=<name>`:

| Category | Description | Doc keys (in order) |
|---|---|---|
| Basics | "Learn the basics of using Hydra" | `getting_started`, `accounts_and_login`, `navigation_basics` |
| Browsing | "How to browse posts, comments, and subreddits" | `browsing_posts`, `viewing_comments`, `subreddits`, `search`, `gallery_mode` |
| Interactions | "Voting, saving, sharing, posting, and commenting" | `voting`, `saving`, `sharing`, `downloading_media`, `posting`, `commenting` |
| Gestures | "Swipe gestures and navigation features" | `gestures` |
| Filters | "Filtering content and organizing your feeds" | `text_filters`, `hiding_content`, `organizing_feeds` |
| Sorting | "Sorting options and appearance settings" | `sorting`, `appearance_settings` |
| Themes | "Themes, custom themes, and app icons" | `themes`, `custom_themes`, `app_icons` |
| Messages | "Managing your inbox and private messages" | `inbox`, `messages` |
| Advanced | "Power user features and advanced functionality" | `split_view`, `stats`, `live_text`, `external_links` |
| Settings | "Comprehensive guide to all settings" | `settings_overview`, `general_settings`, `data_use_settings`, `privacy_settings`, `advanced_settings` |
| Troubleshooting | "Common issues, solutions, and helpful tips" | `troubleshooting`, `tips_and_tricks` |

**Category view** (`?category=<name>`) — a `List` titled with the category name,
listing that category's docs (title + description), navigating to `?doc=<key>`.

**Single doc view** (`?doc=<key>`) — renders `DOCUMENTATION[key].text` (its
markdown body) through Snudown (`external/snudown`, the same Reddit-flavored
markdown-to-HTML parser used for post/comment bodies elsewhere in the app) into
`RenderHtml`. If `key` isn't a valid `DocumentationKey`, falls back to rendering
the `not_found` doc instead (a real entry in `DOCUMENTATION`, title "Page Not
Found"). Before parsing, doc markdown is preprocessed by `fixHydraLinks()`: any
`[label](hydra://path)` markdown link is manually rewritten to
`<a href="hydra://path">label</a>` HTML, because Snudown doesn't itself recognize
the custom `hydra://` URI scheme as a valid link protocol and would otherwise strip
or mangle it. (This is how every internal cross-link seen throughout §12's quoted
doc text above — `[Learn More](hydra://settings/guide/?doc=...)` etc. — actually
navigates within the app.) Rendered doc bodies are also subject to the same
embedded-custom-theme detection as Reddit content (§3.6) — a doc that happened to
contain the theme-import sentinel would render an importable theme card, though none
of the shipped docs do.

**Search / AI-answer view** (`?search=<text>`):
1. On mount (only, not on every keystroke — `useEffect` with `[]` deps), runs
   `DocumentationSearch.find(search, 5)` (see §12.3) to get up to 5 matching doc
   keys.
2. While waiting for results (`search` is set but `searchDocKeys` is still empty),
   shows a centered small `ActivityIndicator`.
3. Once results resolve, if any AI answer text exists (see below) it's shown first,
   in a rounded/tinted card, rendered as markdown/HTML exactly like a doc body,
   above the results list.
4. Below that, a `List` titled "Search Results" of the up-to-5 matched docs
   (title + description), each navigating to `?doc=<key>`.
5. Separately (parallel `useEffect`, fires once `search` and the resolved doc list
   are both ready), calls `getAnswer(search)`: takes the **text** of up to the
   first 3 matched docs (`docs.map(d => d.text).slice(0, 3)`) and POSTs them plus
   the raw search string to `askQuestion(question, docs)` (`api/AI.ts` → `POST
   {HYDRA_SERVER_URL}/api/ai/askQuestion`, server-side LLM call, response shape `{
   markdown: string }`). The returned markdown is parsed via the same
   Snudown+`fixHydraLinks` pipeline and shown as the AI-answer card above the
   results list. This is a live network call, not cached, and only fires for the
   *search* flow (not when viewing a single doc or category directly).

The Settings-root search bar (§1.1) is really just a shortcut into this same
`?search=` flow with `pushURL` instead of a local state change.

### 12.3 Semantic search (`utils/DocumentationSearch.ts`)

A from-scratch, dependency-free cosine-similarity nearest-neighbor search over the
baked-in embedding vectors:
- Constructor flattens every `DOCUMENTATION` entry's `vector` array into one
  contiguous `Float32Array` (`count × dimension`, dimension inferred from the
  first entry — 1536 for `text-embedding-3-small`), alongside a parallel array of
  doc keys.
- `find(query, k)`: fetches the query string's own embedding via `getEmbedding()`
  (`api/AI.ts` → `POST {DEFAULT_HYDRA_SERVER_URL}/api/ai/createEmbedding` — note
  this one **always** hits the hardcoded default server, ignoring any self-hosted
  server override, unlike `askQuestion`), then computes the dot product of that
  query vector against every stored doc vector (loop-unrolled by 16 for
  performance; since both sides are pre-normalized embeddings, dot product ==
  cosine similarity), then selects the top-`k` highest-scoring doc keys via an
  insertion-sorted top-k accumulator (binary-search insertion, O(n log k)-ish, no
  full sort). Returns just the ordered list of `DocumentationKey`s (scores
  discarded by the caller). `Guide.tsx` always calls with `k = 5`.
- If `DOCUMENTATION` is empty or `k <= 0`, returns `[]` immediately (defensive,
  not reachable in practice since docs always ship non-empty).

For a Swift rewrite: this whole subsystem needs either (a) a bundled precomputed
embedding matrix + local cosine-similarity search reimplemented natively (no ML
framework dependency required, it's pure arithmetic), or (b) moving search
server-side — but note the *query* embedding step already requires a network call
to Hydra's backend in the current implementation, so full offline search was never
actually achieved even today; only the corpus side is offline.

---

## 13. Notifications / Inbox Alerts

**Fully non-functional in the current app.** `contexts/SettingsContexts/NotificationsContext.tsx`
is a static stub: `notificationsEnabled` is always `false`, `toggleNotifications`
is a no-op, and the file's own comment states push notifications "have been
removed along with the paid tier." There is **no Settings screen, toggle, or menu
item anywhere** that surfaces notification/inbox-alert configuration — it was
presumably removed from the UI along with its backend. The bundled
`documentation/inbox_alerts.md` describes a fully-featured push system (comment
reply / post reply notifications, badge counts, Do Not Disturb interaction, iOS
Settings deep-link instructions) that does not correspond to any working feature
today. **For the rewrite: omit push notifications / inbox alerts entirely**, or
treat them as a new feature to design from scratch rather than as something to
port — there's no existing working implementation to reference.

---

## 14. Hydra Pro

**Fully removed.** See the global finding at the top of this document. Concretely,
for the rewrite:
- There is no purchase flow, no `hydraPro` settings screen, no restore-purchases
  button, and no App Store / RevenueCat / StoreKit integration anywhere in the
  codebase (confirmed via repo-wide search — no `RevenueCat`, `react-native-purchases`,
  or StoreKit references exist).
- `SubscriptionsContext` (`contexts/SubscriptionsContext.tsx`) is the only
  remaining trace: a stub provider exposing `{ isPro: true, customerId: null }`
  unconditionally, kept purely so any legacy call site that still branches on
  `isPro` continues to compile/behave as "always unlocked."
- The similarly-named `components/Modals/SubscribeToHydra.tsx` is **unrelated to
  purchasing** — it's a once-a-year nag modal (gated by a per-account MMKV
  timestamp, `lastAskedToSubscribeToHydraClient-<userId>`, 365-day cooldown)
  prompting the logged-in user to *subscribe to the `r/HydraClient` subreddit*
  (Reddit-native subscribe, via `SubredditContext.subscribe("hydraclient")`) for
  update announcements — not an in-app-purchase paywall. It only appears if the
  user is logged in, isn't already subscribed to `r/HydraClient`, their subreddit
  list has finished loading, and it's been ≥365 days (or never) since they last
  answered this exact prompt for this exact account. "Maybe Later" / tapping the
  dimmed backdrop / the X button all just record `lastAskedAt = now()` without
  subscribing; "Join" calls `subscribe()` then also records `lastAskedAt`.
- Recommendation for the rewrite: **do not build any Pro/paywall system** — ship
  every theme, Stats, and all other historically-"Pro" features unconditionally
  unlocked, matching current behavior exactly. The AI Filters, AI Summaries, and
  Inbox Alerts features described in the bundled docs should be treated as
  **not present** in the current app (dead documentation) unless the product owner
  explicitly wants them designed fresh.

---

## 15. About / version / changelog

There is no dedicated "About" settings page. Version/build info is shown as
static footer text on the Settings root screen (§1.1):
`{Application.applicationName}: {Application.nativeApplicationVersion}` /
`Build #{Application.nativeBuildVersion}` / `Update Group: {...}`. The
closest thing to a changelog is the **Patch Notes** row (§1.1), which opens the
`updateInfo` startup modal (`components/Modals/StartupModals/UpdateInfo.tsx`,
outside this document's file scope to detail further) — the same modal that
auto-presents once per new build (tracked via MMKV key `lastSeenUpdate` vs. a
hardcoded `updateInfo.updateKey` string, currently `"v4.0.0"`).

---

## Open questions / ambiguities

1. **AI Filters / AI Summaries / Inbox Alerts**: the bundled Guide documentation
   describes these in detail as if fully functional Pro features, but no UI or
   consuming component exists for any of them in the current codebase (only dead
   context fields for summaries). Is the product intent for the Swift rewrite to
   (a) omit them entirely, matching current shipped behavior, or (b) actually build
   them as new features using the doc text as a spec? This survey assumes (a)
   unless told otherwise, since the task is to reproduce *current* behavior.
2. **Stats obfuscation**: was making `obfuscateNumber`/`obfuscateText` no-ops
   intentional (i.e., Stats really is meant to be fully unlocked for everyone now),
   or is it an oversight from stripping out the Pro-gating code? Given the rest of
   the Pro removal is thorough and deliberate (explicit comments in 3+ files), this
   survey treats it as intentional.
3. **`hideSeenURLs` per-URL override UI**: `FiltersContext` exposes
   `toggleHideSeenURL`/`getHideSeenURLStatus`, and `Filters.tsx` *displays* any
   existing overrides, but no in-scope file actually calls `toggleHideSeenURL` to
   *create* one — that entry point lives in a component outside this survey's file
   list (likely a subreddit page's context menu). The Swift rewrite should locate
   that call site (probably covered by whichever survey documents post/subreddit
   browsing) to fully specify how an override gets created.
4. **`filteredSubreddits` creation UI**: similarly, `Filters.tsx` only shows/removes
   existing subreddit filters; the docs say they're created by "long-pressing posts
   on /r/all or /r/popular" — that long-press menu lives outside this survey's file
   set.
5. **Gesture "swipe anywhere to navigate" interaction with swipe actions**: the
   Guide states right-swipe *actions* become disabled when this is on, but the
   actual disabling logic lives in gesture-handling components not covered by this
   survey's file list (`Gestures.tsx`/`GesturesContext.tsx` only manage the
   settings values, not the runtime gesture recognizers). Confirm exact behavior
   with whichever survey covers the post/comment list gesture handlers.
6. **Where `incrementSubredditVisitCount` and `SeenPosts` read/write calls happen**:
   confirmed to exist and to be consumed by Stats/Filters, but their call sites
   (subreddit page mount, post-seen tracking) are outside this survey's assigned
   files — cross-reference with the browsing/feed survey.
7. **Startup modal "Prompt for Review"** (`STORE_REVIEW_REQUESTED_KEY`, shown once
   `app_launches > 30`) and **UpdateInfo modal** content/versioning are only
   partially covered here (just their trigger keys) since their files weren't in
   this survey's explicit reading list — worth a full pass if another survey
   doesn't already own `components/Modals/StartupModals/`.
8. **List.tsx divider-index-before-filter quirk**: `List`'s row divider logic
   computes `i < items.length - 1` using the *unfiltered* index/length even though
   rows are rendered after `.filter(item => !item.hide)` — meaning a list whose
   *last visible* row isn't the last item in the original array (because a later
   item has `hide: true`) will incorrectly still show a divider under its last
   visible row. Cosmetic; only currently possible on the Appearance screen's
   conditionally-hidden "split view" row and Post-sort-top row. Worth confirming
   visually before/after in the rewrite rather than porting the bug.
