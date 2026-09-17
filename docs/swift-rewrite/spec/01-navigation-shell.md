# Hydra — Navigation, App Shell, Routing, Tabs, Deep Links, Split View Spec

This document specifies the exact behavior of Hydra's app shell: startup sequence, tab
bar, per-tab navigation stacks, URL parsing/routing, external link handling, header
structure, modal system, startup modals, split view (iPad), forward-navigation
("stack future"), scroll-to-next button, haptics, one-time alerts, error/webview pages,
and lifecycle behaviors. All behavior below is iOS-only unless noted (Android-only code
paths in this repo are explicitly excluded per instructions).

References (TypeScript source, for a Swift engineer's orientation only — do not copy):
`app/index.tsx`, `app/tabs/index.tsx`, `app/stack/index.tsx`, `app/stack/*.tsx`,
`contexts/NavigationContext.tsx`, `contexts/StackFutureContext.tsx`,
`contexts/TabScrollContext.tsx`, `contexts/SubredditSwitcherContext.tsx`,
`contexts/SubredditContext.tsx`, `contexts/ModalContext.tsx`,
`contexts/ModalProvider.tsx`, `contexts/StartupModalContext.tsx`,
`contexts/ActionSheetBgContext.ts`, `contexts/ActionSheetBgProvider.tsx`,
`contexts/SettingsContexts/TabSettingsContext.tsx`, `contexts/ScrollerContext.tsx`,
`contexts/ScrollToNextButtonContext.tsx`, `contexts/ScrollToNextButtonProvider.tsx`,
`utils/navigation.ts`, `utils/navigationTypes.ts`, `utils/PageTypeToNavName.ts`,
`utils/RedditURL.ts`, `utils/URL.ts`, `utils/useHandleIncomingURLs.ts`,
`utils/openExternalLink.ts`, `utils/useSplitViewSupport.ts`, `utils/oneTimeAlert.ts`,
`utils/haptics.ts`, `utils/getSwitcherSubredditName.ts`,
`components/UI/SplitViewOptions.tsx`, `components/Navbar/*`,
`components/Modals/StartupModals/*`, `components/UI/LoadingSplash.tsx`,
`components/Other/DismountWhenBackgrounded.tsx`, `pages/ErrorPage.tsx`,
`pages/WebviewPage.tsx`, `components/HTML/ThemedWebView.tsx`,
`pages/SettingsPage/General/OpenInHydra.tsx`, `pages/SettingsPage/General/Startup.tsx`,
`pages/SettingsPage/index.tsx`, `constants/TabBarPadding.tsx`, `app.config.ts`.

---

## 1. App Startup Sequence

1. `app/index.tsx` is the entry point (`registerRootComponent`).
2. Sentry (`@sentry/react-native`) is initialized immediately at module load, before
   any React renders:
   - DSN is hardcoded.
   - `enabled: !__DEV__ && reportingAllowed`, where `reportingAllowed` reads the MMKV
     boolean key `errorReportingEnabled`-equivalent (`ERROR_REPORTING_STORAGE_KEY`,
     defined in `pages/SettingsPage/Privacy.tsx`); **defaults to `true`** if unset
     (`KeyStore.getBoolean(key) !== false`).
   - `enableAppHangTracking: false` (disabled because it conflicts with iOS
     permission-prompt hangs).
   - Not applicable to a Swift rewrite as literal code, but the *behavior* (crash/error
     reporting toggle, default-on, respects a Privacy setting) should be reproduced,
     e.g. with a native crash reporter gated by the same setting.
3. `expo-router`'s `SplashScreen.preventAutoHideAsync()` is called — the OS splash
   stays up until explicitly hidden.
4. `enableFreeze(true)` (react-native-screens) — background tabs/screens do not
   re-render while not visible. Swift equivalent: don't tick off-screen SwiftUI views;
   this maps naturally since SwiftUI already only renders visible content, but note
   that state updates from background work should still be applied lazily.
5. Device orientation is force-locked to **portrait-up** at launch
   (`ExpoOrientation.lockAsync(PORTRAIT_UP)`), and stays locked for the entire app
   **except**:
   - While the built-in web browser (`openExternalLink` → `expo-web-browser`) is open,
     orientation is unlocked, then re-locked to portrait-up when it closes.
   - The media viewer (image/video full screen) unlocks orientation while open and
     re-locks to portrait-up when closed (see MediaViewer spec, owned by another
     survey area).
   - Everywhere else in the app (feeds, posts, comments, settings, etc.), orientation
     is fixed portrait — there is no landscape layout for the main UI.
6. `RootLayout` component:
   - Runs Drizzle/SQLite migrations (`useMigrations`); if migration fails, the error
     is re-thrown so Expo Router's error boundary can catch it (crash screen).
   - Loads fonts (`SpaceMono` custom font + FontAwesome icon font) via `useFonts`.
   - Clears the video cache if a clear was requested from Settings (must complete
     before first render because no video component may be mounted while clearing).
   - Once migrations complete: runs DB maintenance (pruning old rows) via
     `InteractionManager.runAfterInteractions` (deferred, non-blocking), and
     increments two persistent stats counters: `APP_LAUNCHES` and `APP_FOREGROUNDS`
     (both +1 at cold start). `APP_FOREGROUNDS` is incremented again every time
     `AppState` transitions to `"active"` (i.e., every foreground, not just cold
     launch). These two stats drive later behaviors (review prompt, Stats page).
   - The app body (`GestureHandlerRootView` → `SafeAreaProvider` → `Tabs`) only
     renders once **all three** of: migrations complete, fonts loaded, and video
     cache is ready. Until then, nothing renders (the native OS splash screen stays
     up, since `SplashScreen.preventAutoHideAsync()` was called and nothing has hidden
     it yet).
7. Provider nesting order (outer → inner), each wrapping the whole app:
   `SafeAreaProvider` → `AccountProvider` → `SubscriptionsProvider` →
   `SettingsProvider` → `TabScrollProvider` → `NavigationProvider` →
   `ActionSheetProvider` (from `@expo/react-native-action-sheet`) →
   `ActionSheetBgProvider` → `InboxProvider` → `ModalProvider` →
   `VideoPlayerRegistryProvider` → `MediaViewerProvider` → `SubredditProvider` →
   `StartupModalProvider` → renders `<SubscribeToHydra />` then `<Tabs />`.
   The nesting order matters only insofar as inner providers may read outer ones
   (e.g. `SubredditProvider` reads `AccountContext`); a Swift rewrite should ensure
   equivalent data availability ordering (auth state available before subreddit
   list load, etc.) but does not need literal nested view-model wrapping.
8. Inside `Tabs` (`app/tabs/index.tsx`):
   - While `loginInitialized` is false (account/session restoration from Keychain not
     yet finished), the tab bar is **not** rendered at all — instead a full-screen
     `LoadingSplash` (splash image + centered `ActivityIndicator`) is shown covering
     everything.
   - Once `loginInitialized` becomes true, `SplashScreen.hideAsync()` is called
     (hides the native OS splash, if still up) and the real `Tab.Navigator` renders.
   - `useHandleIncomingURLs()` is invoked unconditionally on every render of `Tabs`
     (see §6).

## 2. Loading Splash Screen

`components/UI/LoadingSplash.tsx`:
- Full-bleed absolutely positioned overlay (`zIndex: 1000`), covers the whole screen.
- Shows `splash.png` (dark mode) or `splashInverted.png` (light mode) based on
  `theme.systemModeStyle === "dark"`, `resizeMode: "contain"`, background color =
  current theme background.
- When the image finishes loading (`onLoadEnd`), it also calls
  `SplashScreen.hideAsync()` — i.e., the *first* frame that can paint (the JS splash
  image) is what actually dismisses the native OS splash screen, not app-readiness.
- A centered `ActivityIndicator` (native spinner) is overlaid, vertically offset 10%
  downward from center via a translateY transform.
- This view is shown whenever `loginInitialized` is false — i.e., during the account
  session-restore step, not the DB/font/video-cache readiness step (those block
  render entirely, see §1).

## 3. Tab Bar

Five tabs, in this fixed order, all sharing one bottom `Tab.Navigator`
(`@react-navigation/bottom-tabs`), each hosting its own independent native-stack
navigator (`Stack`, `app/stack/index.tsx`):

| # | Tab name | Icon (library / name) | Label | Header shown at tab level | Badge |
|---|----------|------------------------|-------|---------------------------|-------|
| 0 | Posts    | MaterialCommunityIcons `post` | "Posts" | none (`headerShown: false`) | none |
| 1 | Inbox    | Entypo `mail` | "Inbox" | none | unread message count (`inboxCount`), shown only if `> 0` |
| 2 | Account  | MaterialIcons `account-circle` | Username (if `showUsername` setting on and logged in) else "Account"; tab title (used e.g. as tab-bar accessibility/back title) is `currentUser.userName ?? "Accounts"` | none | none (pulse animation instead, see below) |
| 3 | Search   | Feather `search` | "Search" | none | none |
| 4 | Settings | Ionicons `settings-sharp` | "Settings" | none | none |

- Tab bar height constant `TAB_BAR_HEIGHT = 90`.
- `tabBarStyle` is `position: absolute`, horizontal padding 10, `bottom:
  -TAB_BAR_REMOVED_PADDING_BOTTOM` (iOS: `-15`; i.e., pinned 15pt lower than a normal
  tab bar sits, presumably to remove default bottom safe-area padding baked into
  react-navigation on iOS — see §16 for how content compensates), `borderTopWidth: 0`
  (no separator line), background = current theme background color.
- Active/inactive tint colors: active = `theme.iconOrTextButton`, inactive =
  `theme.subtleText`. Active icon color additionally switches to `theme.iconPrimary`
  in the icon-drawing function itself when `focused`.
- **Hide-on-scroll**: if the Settings toggle "Hide tabs on scroll" (`hideTabsOnScroll`,
  MMKV bool, default `false`) is enabled, the tab bar animates off-screen
  (translateY by `TAB_BAR_HEIGHT`, fading opacity to 0) when the active feed/list
  scrolls down past 50px of content and the delta since last frame is downward and
  ≥5px; it animates back on scroll-up. Animation: 200ms timing, driven by
  `TabScrollContext.tabBarTranslateY` (an `Animated.Value` 0↔1), updated via
  `handleScrollForTabBar(scrollEvent)` which each scrollable feed view must call from
  its `onScroll`. If the setting is off, `handleScrollForTabBar` is a no-op and the
  tab bar never hides.
- **Account tab pulse**: when there are zero saved accounts (`accounts.length === 0`),
  the Account tab's icon pulses (`PulseHighlight` wrapper — a color-pulsing animation,
  see `components/UI/PulseHighlight.tsx`, out of this doc's scope) and its text label
  is tinted with the same pulse color instead of the normal active/inactive tint. This
  visually nudges the user to log in.

### 3.1 Tab re-tap ("tap active tab to go back")

On `tabPress` (React Navigation's `screenListeners.tabPress`):
- If the tapped tab is the **currently active** tab AND that tab's internal stack has
  more than one screen (`stackHeight > 0`, i.e., not already at its root), the tab
  press is intercepted: default tab-press navigation is prevented
  (`e.preventDefault()`) and instead a single `StackActions.pop()` is dispatched on
  that tab's stack — i.e., **pop one screen**, not pop-to-root. Repeated taps on the
  active tab pop one level at a time until back at the tab's root screen.
- If the tapped tab is **Search** (`e.target?.startsWith("Search")`), a one-time
  informational alert is shown (see §12 one-time alerts):
  title "Did you know?", message "You can quick search for subreddits by long
  pressing the search tab." Shown once ever (per install), via key
  `quickSearchGuideAlert`.

### 3.2 Tab long-press

- **Search tab long-press**: opens the Quick Subreddit Search overlay
  (`QuickSubredditSearch` modal, `components/Modals/QuickSubredditSearch.tsx`) and
  fires a selection haptic (`hapticSelection()`).
  - This overlay is a full-screen search box (with `SafeAreaView`) that lets the user
    type a subreddit name; it searches via Reddit's subreddit search API
    (debounced), shows the user's own favorited + subscribed subreddits when the
    query is empty, does an "exact match" lookup in parallel, supports incremental
    pagination (`PAGE_SIZE = 20`) up to `MAX_VISIBLE_ROWS = 10` visible rows, and on
    selecting a result dismisses itself and pushes `PostsPage` with
    `url: https://www.reddit.com/r/<name>` onto the **navigation container's raw
    dispatch** (not the current tab's stack via the URL-navigation helper — it uses
    `useNavigation<NavigationContainerRef<AppNavigationProp>>()` directly with
    `StackActions.push`). Tapping outside the box dismisses it.
- **Account tab long-press**: if the user has ≥1 saved account, opens the Quick
  Account Swap overlay (`QuickAccountSwap.tsx` — a centered card listing accounts to
  switch between, dismissible by tapping the dark background) and fires
  `hapticSelection()`. If zero accounts exist, long-press does nothing (there is
  nothing to swap between).
- Other tabs have no long-press behavior defined at the tab-bar level.

### 3.3 Initial (startup) tab

- Controlled by MMKV string key `initialTab` (`INITIAL_TAB_STORAGE_KEY`), settable
  in Settings → General → Startup → "Start Hydra on this tab", options are the five
  tab names (`Posts`, `Inbox`, `Account`, `Search`, `Settings`). **Default: `Posts`**
  (index 0) if unset or the stored value doesn't match a known tab name.
  `TabIndices = { Posts: 0, Inbox: 1, Account: 2, Search: 3, Settings: 4 }`.
- This determines which tab is selected (`index`) in the tab navigator's
  `initialState` at cold launch — it does not re-navigate on subsequent app
  foregrounds (React Navigation's persisted `initialState` is fixed at construction
  time each cold start).

## 4. Per-Tab Navigation Stacks

Each of the 5 tabs renders the **same** `Stack` component (`app/stack/index.tsx`), a
`createNativeStackNavigator`, but each tab gets its own independent stack instance
(separate navigation state) since each is a distinct `<Tab.Screen component={Stack}>`.
All tabs share one `StackParamsList` (screen name → params) and register **all**
17 possible screen types on every tab's stack (not scoped per tab) — meaning any tab's
stack *could* navigate to any screen type, though in practice each tab is seeded with
a specific root and users mostly navigate within their tab. E.g., pushing a
`PostsPage` from the Search tab keeps you inside the Search tab's own stack.

### 4.1 Stack-level native-stack navigator options
- `headerTintColor` = `theme.iconOrTextButton`.
- Android nav bar color = theme background (Android only, ignorable for iOS rewrite).
- `headerStyle.backgroundColor` / `headerTitleStyle.color` = theme colors.
- `fullScreenGestureEnabled` = the "Swipe Anywhere to Navigate" gesture setting
  (`GesturesContext.swipeAnywhereToNavigate`) — when true, the iOS interactive pop
  gesture works from **anywhere** on screen (not just the left edge); native-stack's
  built-in behavior. Per `documentation/tips_and_tricks.md`: enabling this disables
  left-vs-right swipe post/comment actions — only left-swipe actions remain active
  (tradeoff to avoid gesture conflicts).
- `contentStyle.paddingBottom`: every screen gets bottom padding equal to
  `tabBarHeight - TAB_BAR_REMOVED_PADDING_BOTTOM` **unless** the screen is in the
  `SHOWS_BENEATH_TABS` allow-list (see table below), in which case padding is 0
  (content is expected to scroll/sit visually beneath the translucent floating tab
  bar).
- `screenLayout` wraps every screen's rendered content in a `StackFutureProvider`
  (see §8, forward-navigation / "stack future" swipe gesture).

### 4.2 Screen registry (`StackParamsList`)

| Screen (route name) | Params | Backing page component | Header title | Header left | Header right | Shows beneath tab bar (padding=0) |
|---|---|---|---|---|---|---|
| `Subreddits` | none | `pages/Subreddits` | "Subreddits" (static) | default back | — | No |
| `Home` | `{ url }` | `pages/PostsPage` | Switcher title if feed-list URL, else default; `headerBackTitle: "Subreddits"`; `freezeOnBlur: true` | default back (label "Subreddits") | Sort/Context via page | Yes |
| `InboxPage` | none | `pages/InboxPage` | "Inbox" | default back | "Mark all read" checklist icon button (see §4.3) | Yes |
| `MessagesPage` | `{ url }` | `pages/MessagesPage` | "Messages" | default back | — | No |
| `PostsPage` | `{ url }` | `pages/PostsPage` | `RedditURL(url).getPageName()` (subreddit name), or switcher title if it's a feed-list URL | default back | Sort/Context via page | Yes |
| `SubredditSearchPage` | `{ url }` | `pages/SubredditSearchPage` | "Search" | default back | — | Yes |
| `PostDetailsPage` | `{ url }` | `pages/PostDetails` | `RedditURL(url).getPageName()` (subreddit name) | default back | Sort/Context via page | Yes |
| `MultiredditPage` | `{ url }` | `pages/PostsPage` | `getPageName()` (multireddit name), or switcher title | default back | Sort/Context via page | Yes |
| `UserPage` | `{ url }` | `pages/UserPage` | `RedditURL(url).getPageName()` (username) | "Accounts" text button **only when this is the first/root screen in the stack** (`navigation.getState().routes.length === 1`), navigates to `Accounts` screen with `hydra://accounts`; otherwise default back | via page | Yes |
| `Accounts` | `{ url }` | `pages/AccountsPage` | "Accounts" (default); `headerBackTitle: "Subreddits"` | default back | "+" add-account button (opens `Login` modal); pulses if `accounts.length === 0` | No |
| `WikiPage` | `{ url }` | `pages/WikiPage` | `getPageName()` = "Wiki" | default back | via page | No |
| `GalleryPage` | `{ url }` | `pages/GalleryPage` | `getPageName()` | default back | via page | No |
| `SidebarPage` | `{ url }` | `pages/SidebarPage` | `getPageName()` = "Sidebar" | default back | via page | No |
| `SettingsPage` | `{ url }` | `pages/SettingsPage` (single component, internally switches on URL path — see §11) | `getPageName()` (varies by sub-path, e.g. "General", "Appearance", or for arbitrary sub-routes, the last path segment camel-case-split and capitalized) | default back | via page | No |
| `SearchPage` | none | `pages/SearchPage` | "Search" (static) | default back | via page | Yes |
| `WebviewPage` | `{ url }` | `pages/WebviewPage` | `getPageName()` | default back | — | No |
| `ErrorPage` | `{ url? }` | `pages/ErrorPage` | "Error" (static) | default back | — | No |

Notes:
- "default back" = native-stack's automatic back button/chevron + swipe-to-pop.
- The `Home` and `PostsPage`/`MultiredditPage` screens compute a "switcher name" via
  `getSwitcherSubredditName(url)` (returns non-null only for HOME, SUBREDDIT, and
  MULTIREDDIT page types); when non-null, the header title is replaced with a custom
  `SwitcherHeaderTitle` component (tappable subreddit-name + chevron-down, opens the
  subreddit switcher — see §5.1) instead of a plain static title.
- `freezeOnBlur: true` is set only on `Home` (keeps the home-feed screen's state
  frozen — not re-rendered — while another screen is pushed on top, for performance).

### 4.3 Inbox screen header-right button

- Icon: MaterialIcons `checklist-rtl`.
- On press: `Alert.alert("Mark All Items Read?", undefined, [Cancel, Ok])`. On "Ok":
  calls the mark-all-read API; on success shows a second alert "Success! / This may
  take a moment to update, especially if you have a lot of unread messages.", then
  after a 1-second delay re-checks the inbox count. On failure: alert "Error / Failed
  to mark all messages as read."

## 5. Header / Navbar Components

### 5.1 Subreddit Switcher Header Title (`components/Navbar/SwitcherHeaderTitle.tsx`)
- Renders as a `TouchableOpacity` containing the current feed/subreddit/multireddit
  name (single line, truncated, max width 240) plus a `keyboard-arrow-down` chevron
  icon (color = `theme.subtleText`).
- Tapping it calls `openSubredditSwitcher()` from `SubredditSwitcherContext`, which
  invokes whatever opener function the tab-bar root registered (`app/tabs/index.tsx`
  registers `() => setShowSubredditSearch(true)`, i.e., **tapping the header title
  opens the same Quick Subreddit Search overlay used by long-pressing the Search
  tab**).
- Only shown as the header title on screens whose current URL is a feed-list type
  (Home, Subreddit, Multireddit) — see §4.2.

### 5.2 Sort & Context Buttons (`components/Navbar/SortAndContext.tsx`)
Rendered as `headerRight` on pages that pass `sortOptions` and/or `contextOptions`
(Posts/Home/Multireddit/PostDetails/UserPage, wired per-page — exact per-page option
sets belong to those pages' own specs, not enumerated here). Two icon buttons,
right-aligned, 35×35pt tap targets each:

**Sort button** (only rendered if `sortOptions` provided):
- Icon reflects the *current* sort of the page's URL (parsed via
  `RedditURL.getSort()`): trophy (best/default), fire (hot), clock (new), podium
  (top), trending-up (rising), sword-cross (controversial), timer-sand (old),
  message (q&a), archive-search (relevance), comment (comments/Comment Count).
  Falls back to trophy icon if sort is unrecognized.
- Tap opens an action-sheet/context menu (`useContextMenu`) listing the page's
  `sortOptions` (e.g. Best/Hot/New/Top/Rising for a subreddit). Selecting "Top" (when
  page type is HOME/SUBREDDIT/MULTIREDDIT/USER) opens a **second** menu for the time
  window: Hour/Day/Week/Month/Year/All.
- Selecting a sort rewrites the URL's sort segment/query param via
  `RedditURL.changeSort()` and calls `navigation.setParams({ url: newURL })` (replaces
  the current screen's params in place — does not push a new screen).
- If the "Remember sort per subreddit" setting
  (`REMEMBER_POST_SUBREDDIT_SORT_KEY`/`REMEMBER_COMMENT_SUBREDDIT_SORT_KEY`) is on,
  the chosen sort (and top-time-window) is persisted per-subreddit in MMKV so future
  visits to that subreddit reopen with the same sort.
- Also exposes each sort option as an iOS accessibility custom action
  (`accessibilityActions`) so VoiceOver users can pick a sort directly.

**Context ("...") button** (only rendered if `contextOptions` provided): opens an
action-sheet with a subset of: Share, Select Text, Subscribe/Unsubscribe,
Favorite/Unfavorite, New Post, Add to Multireddit, Edit, Delete, Message, Block,
Report, Show/Hide Seen Posts, Sidebar, Wiki, Open in Gallery Mode. Each maps to a
specific action (documented inline in source; largely delegates to other
subsystems — subscription API, post editing modal, gallery mode navigation, etc. —
out of scope for this navigation-shell doc except to note that "Sidebar" pushes
`https://www.reddit.com/r/<sub>/about/` and "Wiki" pushes
`https://www.reddit.com/r/<sub>/wiki/index`, both of which resolve to the `SidebarPage`
/`WikiPage` screens via normal URL routing).

### 5.3 Generic Navbar helpers
- `IconButton` (`components/Navbar/IconButton.tsx`): 35×35pt centered touchable
  wrapping an icon, `activeOpacity: 0.5`, tinted `theme.iconOrTextButton`.
- `TextButton` (`components/Navbar/TextButton.tsx`): centered/left/right-justified
  text touchable, `activeOpacity: 0.5`, tinted `theme.iconOrTextButton`, font size 17
  semibold. Used e.g. for the "Accounts" back-shortcut on the root `UserPage`.

## 6. Incoming URL Handling (`utils/useHandleIncomingURLs.ts`)

Invoked once from `Tabs` root; sets up 4 independent triggers, all funneling into a
single `handleURL(url)` function:

**`handleURL(url)`** (shared entry point for every incoming-URL source):
1. Resolves short links via `RedditURL.resolveURLIfValid(url)` (follows HTTP
   redirects for `redd.it/<id>` and `/r|u|user/<x>/s/<id>` share links — see §7.4).
   If resolution fails or the string isn't a valid Reddit URL at all, the original
   string is kept as-is (never throws).
2. Computes `PageType` from the resolved URL.
3. If `PageType.UNKNOWN`: shows `Alert.alert("Unknown URL", "The URL <url> cannot be
   handled by Hydra.")` and stops — **nothing is navigated to**.
4. Otherwise: force-switches the tab bar to the **Posts tab**
   (`TabActions.jumpTo("Posts")`) and pushes the mapped screen
   (`PageTypeToNavName[pageType]`) with `{ url: resolvedURL }` onto that tab's stack
   (`StackActions.push`) — i.e., **every incoming external URL always lands on top of
   the Posts tab's stack**, regardless of which tab was active when it arrived.

**Sources feeding into `handleURL`:**
1. **Custom-scheme deep link** — `hydra://openurl?url=<encoded-url>` (case-insensitive
   prefix match). Handled both for the link the app was cold-launched with
   (`Linking.getLinkingURL()`, checked once navigation becomes ready) and for links
   received while running (`Linking.addEventListener("url", ...)`). The `url=`
   query value is extracted via a literal string replace (not full URL-decoding logic
   beyond removing the prefix) and passed to `handleURL`. This is the mechanism the
   "Hydra Shortcut" (an iOS Shortcuts.app shortcut users install from Settings →
   General → Open in Hydra) uses to hand off a Reddit URL from the share sheet.
   **No other `hydra://` deep-link paths are handled by this listener** — e.g. a bare
   `hydra://settings` link arriving externally is *not* specially routed here (that
   scheme value is only ever constructed internally by the app itself, e.g. for the
   Accounts screen and Settings screen root params); external deep links must use the
   `hydra://openurl?url=` wrapper form.
2. **Clipboard URL detection**: on every app-active transition (cold start once
   navigation is ready, and every `AppState` → `"active"` transition), if the
   Settings toggle "Read Links from Clipboard" (`READ_CLIPBOARD_KEY`, MMKV bool,
   **default `false`**) is on, reads the OS clipboard via `Clipboard.getUrlAsync()`.
   If a URL is present and constructs successfully as a `RedditURL` (i.e., is a
   recognized Reddit host), shows a confirmation alert: "Open Reddit URL? / A Reddit
   URL was detected on your clipboard. Would you like to open it?\n\n<url>" with
   Cancel/Open buttons. Cancel clears the clipboard string
   (`Clipboard.setUrlAsync("")`) and does nothing further. Open clears the clipboard
   and calls `handleURL(url)`. A re-entrancy guard (`isAsking` ref) prevents stacking
   multiple prompts if triggered again before the user responds. If clipboard reading
   is off, or clipboard doesn't contain a URL, or the URL isn't a recognized Reddit
   URL, nothing happens (silently).
3. **Share-sheet incoming URLs** (`expo-sharing`'s `getResolvedSharedPayloadsAsync`):
   checked on the same triggers as clipboard detection (nav-ready + every foreground).
   If Hydra was launched via the iOS share sheet (a URL shared into Hydra as a share
   extension target, per `app.config.ts`'s `expo-sharing` plugin config —
   `activationRule.supportsWebUrlWithMaxCount: 1`, i.e. Hydra accepts share-sheet
   invocations carrying exactly one web URL), the first payload's `contentUri` is
   passed straight to `handleURL` (no confirmation prompt, unlike clipboard) and the
   shared-payload queue is cleared (`clearSharedPayloads()`).
4. **Universal links (https://reddit.com/... opened directly, e.g. from Safari or
   Messages)**: **NOT supported** — no `ios.associatedDomains` / Apple App Site
   Association configuration was found in this repo (no `ios/` prebuild directory,
   no entitlements file, no `associatedDomains` key in `app.config.ts`). Reddit web
   links tapped elsewhere on iOS will open in Safari/the source app, not in Hydra,
   unless the user goes through the "Open in Hydra" Shortcuts.app shortcut (which
   itself hands off via the `hydra://openurl?url=` custom scheme, described above) or
   manually shares/copies the link into Hydra.

## 7. RedditURL — URL Parsing & Page-Type Mapping (`utils/RedditURL.ts`)

`RedditURL` extends a generic `URL` helper class (`utils/URL.ts`) that provides
scheme-normalization (`https://` prepended if missing), host/path/query-param parsing
(all via string splitting on literal delimiters, not `URL`/`NSURL` parsing), and
Open Graph metadata scraping (`getOpenGraphData()`, fetches the page and parses
`<meta property="og:...">` tags via `htmlparser2`, 1750ms timeout, skips `.svg`
og:image values due to a known `expo-image` crash).

### 7.1 Recognized hosts
Only these hosts are ever accepted as "a Reddit URL" (exact match, case-insensitive;
a prefix match is deliberately avoided to reject spoofs like
`redd.it.evil.com`): `www.reddit.com`, `redd.it`, `i.redd.it`, `v.redd.it`,
`preview.redd.it`. Any other host throws `Not a reddit URL` from the constructor
**unless** the string starts with `hydra://` (internal scheme, always accepted).

### 7.2 Host normalization (`normalizeHost`)
Before host-checking, every URL is rewritten:
- `http://` → `https://`; a bare host with no scheme gets `https://` prepended.
- Any of `reddit.com`, `www.reddit.com`, `old.reddit.com`, `new.reddit.com`,
  `np.reddit.com`, `m.reddit.com`, `sh.reddit.com`, `amp.reddit.com` (with or without
  `https://`, matched via regex) is folded to `https://www.reddit.com`.
- `https://www.redd.it` → `https://redd.it` (drops the `www.`).
- `https://www.reddit.com/r/u_<name>` → `https://www.reddit.com/user/<name>` (Reddit's
  "user profile as a subreddit" URL form is folded into the normal user-page form).
- A URL starting with `/` (leading-slash relative path, e.g. `/r/pics`) is expanded to
  `https://www.reddit.com/r/pics`; a URL starting with `//` (protocol-relative) gets
  `https:` prepended as-is.

### 7.3 Page-type decision table (`getPageType()`)

Evaluated in this exact priority order (first match wins) against the **normalized**
URL's relative path:

| Priority | Match condition | `PageType` | Mapped screen (`PageTypeToNavName`) |
|---|---|---|---|
| 1 | `hydra://accounts` prefix | `ACCOUNTS` | `Accounts` |
| 2 | `hydra://settings` prefix | `SETTINGS` | `SettingsPage` |
| 3 | `hydra://webview` prefix | `WEBVIEW` | `WebviewPage` |
| 4 | path is empty, `/`, or starts with `/best`, `/hot`, `/new`, `/top`, `/rising` | `HOME` | `Home` |
| 5 | path contains `/comments/` | `POST_DETAILS` | `PostDetailsPage` |
| 6 | path starts with `/r/` and contains `/search/` | `SUBREDDIT_SEARCH` | `SubredditSearchPage` |
| 7 | path starts with `/r/` and contains `/wiki/` or `/w/` | `WIKI` | `WikiPage` |
| 8 | path starts with `/r/` and contains `/about/` | `SIDEBAR` | `SidebarPage` |
| 9 | path starts with `/r/` (none of the above) | `SUBREDDIT` | `PostsPage` |
| 10 | path starts with `/message/inbox` | `INBOX` | `InboxPage` |
| 11 | path starts with `/message/messages` | `MESSAGES` | `MessagesPage` |
| 12 | path matches `/(user|u)/<name>/m/<multi>/` | `MULTIREDDIT` | `MultiredditPage` |
| 13 | path starts with `/u/` or `/user/` | `USER` | `UserPage` |
| 14 | path starts with `/search` | `SEARCH` | `SearchPage` |
| 15 | URL starts with `https://i.redd.it` | `IMAGE` | (not a screen — opens the media viewer directly, see below) |
| 16 | URL starts with `https://preview.redd.it` | `IMAGE` | (same as above) |
| 17 | none of the above | `UNKNOWN` | `ErrorPage` |

Notes:
- `PageType.IMAGE` is special: `PageTypeToNavName[IMAGE] = "ErrorPage"`, but
  `useURLNavigation`'s `pushURL`/`replaceURL` intercepts `IMAGE` **before** consulting
  that map and instead calls `displayMedia({ media: [[{ source: url, type: "image"
  }]] })` — i.e., tapping/opening a raw `i.redd.it`/`preview.redd.it` image link opens
  the full-screen media viewer directly, it never navigates to a screen (the
  `ErrorPage` mapping is effectively dead code reached only via other, non-`pushURL`
  navigation paths, if any).
- `getRelativePath()` is computed generically (`URL.getRelativePath`) by splitting the
  full URL string on the first occurrence of `.it`, `.com`, `hydra://`, or `?` — so
  e.g. `https://www.reddit.com/r/pics?sort=top` → relative path `/r/pics` (the query
  string is stripped because `?` is one of the split delimiters, and everything before
  the delimiter, i.e. the domain, is discarded).

### 7.4 Shortened / indirect links
- **Share-sheet short links**: `/r/<sub>/s/<id>`, `/u/<name>/s/<id>`,
  `/user/<name>/s/<id>` (Reddit's own "Share" button produces these). Their page type
  is meaningless until resolved — `isShortenedShareLink()` detects the pattern.
- **Short-domain links**: `https://redd.it/<id>` (Reddit's URL shortener; distinct
  from `i.redd.it`/`v.redd.it`/`preview.redd.it` media hosts, which are checked by
  exact hostname match, not treated as short links). `isShortDomainLink()` detects
  this.
- **Resolution** (`resolveURL()`): if the URL matches either pattern above, OR its page
  type is otherwise `UNKNOWN`, Hydra issues an HTTP `HEAD` request (falling back to
  `GET` for short links if the edge refuses `HEAD`) with the app's custom
  `User-Agent`, follows redirects, and if the final landing URL is a valid, non-short
  Reddit URL, adopts it as the resolved URL. A `/u/<name>/...` path is first rewritten
  to `/user/<name>/...` regardless. Network failures leave the URL unchanged (never
  throws) so callers can safely resolve arbitrary external strings.
- `resolveURLIfValid(url)` (static) wraps `resolveURL()` in a try/catch, falling back
  to the original string on any failure — this is the variant used by clipboard
  detection and incoming-URL handling, which must never crash on garbage input.

### 7.5 Sort parsing/writing (`getSort()` / `changeSort()`)
- For HOME/SUBREDDIT: sort is read from path segments (`best|hot|new|top|rising`);
  `t` (time window) is a query param, relevant only for `top`.
- For MULTIREDDIT: sort is a path segment (`hot|new|top|rising|controversial`); `top`
  defaults its time window to `"day"` if no `t` param present.
- For SUBREDDIT_SEARCH / POST_DETAILS / USER: sort is the `sort` query param (USER
  page defaults to `"new"` if absent); POST_DETAILS additionally reads `t`.
- `changeSort(sort, time?)` rewrites the URL structurally per page type (path segment
  for HOME/SUBREDDIT/MULTIREDDIT, query param for the others) and normalizes the
  special sort labels `"Q&A"` → `qa`, `"Comment Count"` → `comments`.

### 7.6 `applyPreferredSorts()` — startup/navigation sort defaulting
Called whenever a URL is navigated to via `pushURL`/`replaceURL`, and on the app's
initial startup URL. If the URL **already** specifies a sort, it's left untouched.
Otherwise:
- For **HOME**: only applies a default sort if the Settings toggle "Sort home page"
  (`SORT_HOME_PAGE` MMKV key) is on; otherwise HOME is left sort-less (Reddit's
  server default, "best", applies).
- For **HOME or SUBREDDIT**: preferred sort resolution order — (1) if "Remember sort
  per subreddit" is on and a subreddit-specific sort was previously saved
  (`makePostSubredditSortKey(subreddit)`), use it; else (2) the global default post
  sort setting (`DEFAULT_POST_SORT_KEY`); else (3) `"default"` (no override applied).
  If the resolved sort is `"top"`, the time window is resolved the same way
  (per-subreddit remembered → global default → `"all"`).
- For **POST_DETAILS** (comment sort): same per-subreddit-then-global-then-none
  resolution using `REMEMBER_COMMENT_SUBREDDIT_SORT_KEY` /
  `makeCommentSubredditSortKey` / `DEFAULT_COMMENT_SORT_KEY`.
- If the resolved preferred sort is literally `"default"`, no rewrite happens.

### 7.7 Other `RedditURL` helpers relevant to navigation
- `getSubreddit()`: text between `/r/` and the next `/` or `?`.
- `getPageName()`: human display name per page type (subreddit name, username,
  multireddit name, "Home"/capitalized home sub-path, "Search", "Accounts",
  "Sidebar", "Wiki", "Error", or for Settings, the last path segment
  space-split-on-capitals and capitalized, e.g. `themeMaker` → "Theme Maker").
- `getBasePage()`: URL with any trailing sub-path stripped back to the subreddit/home
  root (used elsewhere, not central to navigation).
- `jsonify()`: appends `.json` to fetch Reddit's JSON API for a given page URL (data
  layer, not navigation, but explains why the same URL objects are reused for both
  navigation *and* data fetching throughout the app).
- `isCombinedSubredditFeed()`: true for HOME or for r/all, r/popular (used to decide
  whether per-subreddit content filters apply).
- `supportsSharingThemes()`: true only for the subreddits `hydraclient`,
  `hydrafeaturerequest`, `hydrathemes` (custom-theme-sharing detection, unrelated to
  core navigation).

## 8. Navigation Dispatch Helpers (`utils/navigation.ts`)

- `useRoute<Pages>()`: typed wrapper over React Navigation's `useRoute`.
- `useURLNavigation<Pages>()`: the app's primary navigation hook, wraps
  `useNavigation` and adds:
  - `pushURL(url)` / `replaceURL(url)`: resolve the URL (following short-link
    redirects) via `RedditURL.resolveURL()`, apply preferred sorts
    (`applyPreferredSorts()`), compute page type, and either (a) if `IMAGE`, open the
    media viewer directly (no screen navigation), or (b) `navigation.push`/`.replace`
    to the mapped screen name with `{ url }` params. Either way, calls
    `clearFuture()` afterward (see §9 — any forward-navigation history for the
    current stack position is discarded whenever a *new* push/replace happens, since
    the "future" no longer matches what would be re-pushed).
  - `openGallery(url)`: pushes the `GalleryPage` screen directly (bypassing page-type
    resolution), used for the "Open in Gallery Mode" context-menu action.
  - All normal `NavigationProp` methods (`goBack`, `setParams`, etc.) are also spread
    through, so consumers can call e.g. `navigation.setParams(...)` from the same
    hook instance.

## 9. "Stack Future" — Forward-Navigation History & Right-Edge Swipe-Forward

`contexts/StackFutureContext.tsx`, wrapped around **every** screen's content via the
stack navigator's `screenLayout` prop (so it's active on all screens, all tabs).

- Maintains a `futureRoutes` ref: a stack of routes that were popped off *this*
  navigation stack (via back button, swipe-back, or programmatic pop), i.e. a
  "forward" history analogous to a browser's forward button.
- Every time React Navigation's `beforeRemove` event fires (a screen is about to be
  popped), the popped route is pushed onto `futureRoutes`.
- `clearFuture()` empties this list; called by `pushURL`/`replaceURL` whenever a
  *new* forward navigation happens (since the old "future" no longer represents what
  re-pushing would produce — the user branched to a different page).
- **Gesture**: a capturing touch responder wraps each screen's content. If a touch
  starts within 30px of the **right edge** of the window AND `futureRoutes` is
  non-empty, the responder claims subsequent move events. On move: if the horizontal
  drag angle is within 15° of pure-horizontal (rejecting predominantly-vertical
  drags, which are treated as a scroll and released) and the leftward drag distance
  exceeds 15px, the topmost future route is popped off `futureRoutes` and
  re-`navigation.push()`ed (by name + params) — restoring the screen the user had
  navigated away from. The gesture fires only once per touch sequence (it resets
  `gestureStart` to null after firing). This is essentially a "swipe from the right
  edge to go forward" gesture, symmetric to (but independent of) the normal
  "swipe from the left edge (or anywhere, if enabled) to go back" native-stack pop
  gesture. Window-width tracking updates live via a `Dimensions` change listener (for
  rotation/split-screen resize on iPad).
- Not exposed as a user-facing setting; always active whenever there is forward
  history to restore. Not documented in the in-app help docs read for this survey.

## 10. Split View (iPad only)

Reference: `documentation/split_view.md`, `utils/useSplitViewSupport.ts`,
`components/UI/SplitViewOptions.tsx`, `pages/PostsPage.tsx`, `pages/PostDetails.tsx`.

- **Support gate**: `deviceSupportsSplitView = Dimensions.get("screen").width >= 768`
  (a *device*-level, not just current-window, check — computed once at module load
  from the physical screen). This determines whether the split-view **toggle even
  appears** in Settings → Appearance.
- **Window gate**: `windowSupportsSplitView` is a live value tracking
  `Dimensions.get("window").width >= 768`, updated on every `Dimensions` "change"
  event (covers Split Screen / Slide Over multitasking on iPad, and rotation).
- **Enabled setting**: MMKV bool `splitViewEnabled`; **defaults to
  `deviceSupportsSplitView`** (i.e., on by default on any iPad-class device, off by
  default on iPhone) if never explicitly set by the user. Toggled in Settings →
  Appearance → "Enable split view" (only rendered on devices where
  `deviceSupportsSplitView` is true).
- **Effective state**: `showSplitView = splitViewEnabled && windowSupportsSplitView`
  — i.e., even if the setting is on, split view is suppressed if the *current*
  window is currently narrower than 768pt (e.g. iPad in narrow Split View
  multitasking with another app).
- **Behavior in `PostsPage`** (applies to Home/Subreddit/Multireddit feed screens):
  when `showSplitView` is true, tapping a post does **not** navigate/push a new
  screen; instead it calls `openSplitViewPost(url)` which sets local state
  `postDetailsURL`. The screen's content becomes a horizontal split:
  - Left pane (`flex: 1`, "feed column"): the normal scrolling post list (with its
    search bar header, infinite scroll, "mark seen on scroll past" tracking, and the
    feed-audio floating action buttons scoped to just this column so they don't
    overlap the right pane).
  - A 1px vertical divider line (`theme.divider` color) — shown **only** when
    `postDetailsURL` is set (i.e., something is open in the right pane).
  - Right pane (`flex: 1.5`, wider than the feed column): renders `PostDetails` in
    "split view mode" (passed `splitViewURL`/`setSplitViewURL` props instead of a
    route param — `PostDetails` detects this via `"splitViewURL" in props`), showing
    the tapped post's full comment thread.
  - Floating `SplitViewOptions` control (`components/UI/SplitViewOptions.tsx`): two
    circular 40×40 buttons stacked horizontally, centered, positioned just above the
    tab bar (`bottom: tabBarHeight - TAB_BAR_REMOVED_PADDING_BOTTOM`, plus 20pt
    margin): a **close** button (✕ icon) that calls `setSplitViewURL(null)` (collapses
    the right pane back to feed-only), and a **fullscreen** button (expand icon) that
    calls `pushURL(splitViewURL)` — pushes the same post as a normal, full, top-level
    `PostDetailsPage` screen (leaving the split view state as-is underneath).
  - Right pane's `PostDetails` behaves identically to the normal full-screen version
    (voting, commenting, saving, sharing all work) — the only differences are: it's
    rendered inline instead of as a stack screen (no navigation header of its own
    inside the pane; the pane sits below the feed screen's own header/nav bar), and
    it receives its URL via props instead of a route param.
  - When `showSplitView` is false (iPhone, or setting off, or narrow window),
    tapping a post falls back to normal full-screen push navigation
    (`PostDetailsPage`), and the right-pane UI is never rendered at all.
- Tapping a **different** post while the right pane is already open simply updates
  `postDetailsURL` to the new URL — the right pane's content swaps in place without
  any close/reopen animation described in source (state replacement).
- Split view is scoped **per feed screen instance** — `postDetailsURL` is local
  component state on each `PostsPage`, not a shared/global split-view URL. Navigating
  to a different subreddit resets it to empty.

## 11. Settings URL Routing (`hydra://settings/...`)

`pages/SettingsPage/index.tsx` is a **single** stack screen that internally renders
one of ~16 sub-views by string-matching `URL(url).getRelativePath()` against a fixed
list of exact/prefix patterns (e.g. `"settings"` → root menu, `"settings/general"` →
General submenu, `"settings/general/gestures"` → Gestures page,
`"settings/appIconDetails/<id>"` (prefix match) → per-icon detail page, etc. — see
source table in §4.2/§7 pattern list; full enumeration of every settings sub-path
is out of scope for this shell-level doc and belongs to the Settings-page survey
area). **Navigating "deeper" into Settings pushes a brand-new `SettingsPage` stack
screen** with a different `hydra://settings/...` URL param — it is not a nested
navigator with its own back stack semantics; each settings sub-page is its own stack
entry, so the OS back gesture/button pops one settings level at a time exactly like
any other screen. The `Guide` sub-view (in-app documentation browser, backing the
`documentation/*.md` files read for this survey) is lazy-loaded
(`React.lazy`) since it bundles a large documentation constant.

## 12. Modal System

### 12.1 Generic modal (`ModalContext` / `ModalProvider`)
- A single global modal slot: `setModal(node)` (from any component, via
  `useContext(ModalContext)`) replaces whatever is currently shown; `setModal(undefined)`
  dismisses it.
- Presentation: an absolutely-positioned full-screen `Animated.View` overlay
  (rendered as a sibling **after** all app content, so it paints on top of
  everything including the tab bar), whose `translateY` animates between
  `Dimensions.height` (off-screen, below) and `0` (fully covering the screen) using a
  spring animation (`bounciness: 2`) whenever `modal` changes from null↔non-null.
  `pointerEvents` is `"none"` when no modal is set (so touches pass through to the app
  beneath) and `"auto"` when a modal is showing.
  - **This is a single-slot system, not a true stack** — setting a new modal while
    one is showing replaces it outright (no stacking of multiple simultaneous
    modals via this mechanism); any given modal component is responsible for its own
    internal multi-step UI (e.g. `PromptForReview` swaps between a "prompt" and
    "success" sub-screen state rather than pushing a second modal).
- There is no shared "modal stack" of history — each modal component receives (by
  convention, not enforced by the context) an `onExit`/similar callback to clear
  itself.

### 12.2 Startup Modals (`StartupModalContext` / `StartupModalProvider`)
A small priority-ordered queue evaluated **once**, at most, per app session (guarded
by a `hasShownStartupModal` ref so it never re-evaluates on re-renders):

| Priority | Modal id | Trigger condition | Behavior |
|---|---|---|---|
| 1 (highest) | `updateInfo` | MMKV string `lastSeenUpdate` ≠ the current build's hardcoded `updateInfo.updateKey` (e.g. `"v4.0.0"`) | Shows a "What's new" changelog modal (`UpdateInfo.tsx`) listing feature entries (title+description pairs) for the current update, plus optionally a separate "Pro features" list. On dismiss, sets `lastSeenUpdate` to the current `updateKey` so it won't show again until the key changes in a future release. |
| 2 | `promptForReview` | Persistent stat `APP_LAUNCHES` > 30 **and** MMKV bool `storeReviewRequested` is not yet true | Shows `PromptForReview.tsx` — a centered card (app icon, 5 gold stars, "Enjoying Hydra?" headline, "A quick rating helps a ton" subtitle, body copy, "Maybe later"/"Rate now" buttons, a small heart+"Thank you for supporting indie software" footer). "Rate now" opens the App Store review deep link (`itms-apps://itunes.apple.com/.../viewContentsUserReviews?id=6478089063...`) directly to the review-writing flow, then switches the modal to a "Thanks for the support!" success sub-screen. Either "Maybe later", the ✕ close button, or tapping the dark background dismiss it; **any** dismissal path (including after rating) sets `storeReviewRequested = true`, permanently suppressing this modal for the rest of the app's life on that install (it is never shown again, win or lose). |

Only the single highest-priority modal whose condition is true is shown (not both,
even if both conditions are true simultaneously — e.g. a user who both needs to see
release notes and has passed 30 launches sees only the update-info modal that
session; the review prompt would only show on a subsequent qualifying session once
`lastSeenUpdate` has been acknowledged). These render as direct siblings inside
`StartupModalProvider`, stacked above the app content the same way the generic modal
overlay is (absolutely positioned), but are a **separate** mechanism from
`ModalContext` (not routed through `setModal`).

### 12.3 "Subscribe to r/hydraclient" nudge (`components/Modals/SubscribeToHydra.tsx`)
Rendered as a sibling of `Tabs` (not gated by the startup-modal priority queue,
evaluated continuously via reactive state, not once-at-launch):
- Shown when: the user is logged in, their subreddit list has finished loading, they
  have ≥1 subscribed subreddit, they are **not** already subscribed to
  `r/hydraclient` (case-insensitive), and it has been ≥365 days (or never) since they
  were last shown/dismissed this prompt for the *current account*
  (`lastAskedToSubscribeToHydraClient-<accountId>` MMKV timestamp, per-account key).
- Accepting subscribes the account to r/hydraclient via the normal subscribe API;
  either accepting or dismissing resets the "last asked" timestamp to now (so it
  won't reappear again for another year regardless of outcome).

### 12.4 Action-sheet dimming overlay (`ActionSheetBgContext`/`ActionSheetBgProvider`)
- A full-screen black overlay (`zIndex: 1000`) whose opacity animates between 0 and
  0.5 (200ms timing) driven by `setIsActionSheetShowing(bool)`. Used to dim the
  background behind native action sheets/context menus (`useContextMenu`) since
  iOS's native `ActionSheetIOS` doesn't dim the app content itself by default in this
  library's usage — Hydra adds its own dimming layer synced to the sheet's
  presentation state.

## 13. Scroll-to-Next Button

`contexts/ScrollToNextButtonProvider.tsx` (see `documentation/tips_and_tricks.md` for
the user-facing description) renders a floating circular button (40×40, down-chevron
icon) used on the comments screen to jump between top-level comments:
- **Tap** (touch down→up within 300ms, without having entered drag mode): calls the
  currently-registered `scrollToNext` callback (set by whatever screen is showing —
  `PostDetails`/comments view — via `setScrollToNext(fn)`).
- **Long-press-ish** (touch held ≥300ms without moving far): after exactly 300ms of
  holding, if the touch is still down, fires `scrollToPrevious()` instead — i.e., a
  quick tap goes to the *next* top-level comment, a ~300ms-plus hold-and-release
  jumps to the *previous* one. (Both timers are scheduled on touch-start; whichever
  outcome logic actually runs depends on total press duration measured at
  touch-end — a release before 300ms triggers "next"; the previous-scroll timeout
  itself fires automatically at the 300ms mark while still held, so a long-enough
  hold triggers "previous" before release even occurs).
- **Drag-to-reposition**: after holding for 1000ms (or moving >30px from the initial
  touch point, whichever first), the button enters "move mode": a dark overlay
  (opacity animates to 1 over 300ms) appears showing 10 labeled snap-point targets
  (`bottom-right` [default], `top-right`, `bottom-left`, `top-left`, `bottom-center`,
  `top-center`, `left-center`, `right-center`,
  `left-three-quarters-bottom`, `right-three-quarters-bottom`), each a 40×40 dashed
  circle outline in `theme.buttonBg`, positioned relative to the screen area above the
  tab bar. Dragging the button (finger position minus half its size, minus an
  additional 30px vertical offset for thumb-ergonomics) snaps it to whichever
  labeled position is within 40px (button-diameter) of the current drag point,
  otherwise it follows the finger freely. Releasing while hovering a snap point
  persists that choice to MMKV string `scrollToNextButtonPosition` and the button
  stays there on future launches (default: `"bottom-right"`); releasing elsewhere
  springs the button back to its last confirmed position. Move mode's dark overlay
  fades back out on release.
- The container's usable bounds are measured via `onLayout`, and its own bottom
  offset accounts for the tab bar height (`tabBarHeight - TAB_BAR_REMOVED_PADDING_BOTTOM`).

## 14. Haptics (`utils/haptics.ts`)

Three semantic helpers, used consistently instead of calling the haptics API ad hoc:
- `hapticEngage()` — light impact; used when a gesture crosses an "about to act"
  threshold but hasn't committed (e.g. a swipe action reaching its engage point).
- `hapticAction()` — medium impact; used when a state-changing action actually
  commits (e.g. pull-to-refresh firing).
- `hapticSelection()` — iOS selection feedback; used for discrete choice/toggle
  moments — notably **tab long-press** (both Search-tab and Account-tab quick-menu
  openings, §3.2), plus other menu/toggle interactions elsewhere in the app (out of
  this doc's scope).

## 15. One-Time Alerts (`utils/oneTimeAlert.ts`)

`oneTimeAlert(key, title, message)`: checks an MMKV boolean at `key`; if already
true, does nothing; otherwise shows a plain native `Alert.alert(title, message)`
(single implicit "OK" dismiss) and sets the MMKV flag so it never shows again for
that key, for the lifetime of the install. The only shell-level use of this is the
Search-tab quick-search tip (`quickSearchGuideAlert`, §3.1); other one-time alerts
elsewhere in the app (not surveyed here) follow the identical pattern/helper.

## 16. Tab Bar Padding & Content Insets (`constants/TabBarPadding.tsx`)

`TAB_BAR_REMOVED_PADDING_BOTTOM = Platform.OS === "ios" ? 15 : 0`. On iOS, the app
deliberately removes 15pt of the tab bar's default bottom safe-area inset (by
positioning the tab bar 15pt lower than default, §3) and then re-adds that same
amount as extra bottom `contentStyle` padding on any stack screen that is **not** in
the `SHOWS_BENEATH_TABS` allow-list (§4.2 table) — i.e., screens meant to sit
entirely above an opaque-feeling tab bar get exactly enough bottom padding to clear
it (`tabBarHeight - 15`), while screens designed to visually scroll *beneath* the
translucent floating tab bar (feeds, search, post details, etc.) get zero extra
padding and simply let their content draw under it.

## 17. Error Page (`pages/ErrorPage.tsx`)

Shown for `PageType.UNKNOWN` (any URL Hydra's router can't classify) when reached via
normal in-app navigation (as opposed to the separate "Unknown URL" `Alert` shown for
unrecognized *incoming* URLs, §6, which never navigates anywhere). Centered layout:
a bug icon (Entypo `bug`, 48pt), body text "Hydra was unable to load this page. It
may be because this type of link is not yet supported.", and — if a `url` param was
passed — a second line inviting the user to open it in their browser, with the raw
URL rendered as an underlined tappable link that calls `openExternalLink(url)` (§18).
If no `url` param is present (e.g. `ErrorPage` reached with no `url`, per its
`{ url?: string }` param type), only the bug icon and first message are shown, no
link.

## 18. External Link Handling (`utils/openExternalLink.ts`)

Governs how Hydra opens any URL that resolves as **not** a Reddit URL it can render
natively in-app, and any place the app deliberately punts to a browser. Controlled by
Settings → General → External Links (see `documentation/external_links.md`):

- **Setting**: MMKV string `externalLinkBrowser`, default `"internalBrowser"`.
  Options (`BROWSER_CONFIGS`), each with a display label and a URL-scheme rewriter:

| Value | Label | Behavior |
|---|---|---|
| `internalBrowser` | "Hydra" (default) | Opens via `expo-web-browser`'s `openBrowserAsync` — an in-app `SFSafariViewController`-style sheet, presentation style **full screen**, dismiss button styled "close". Device orientation is unlocked while it's open and re-locked to portrait when it closes (§1). Reader mode is applied per the `openInReaderMode` MMKV bool (default `false`, Settings → External Links → "Open in reader mode", only shown when this browser option is selected). |
| `defaultBrowser` | "Default Browser" | `Linking.openURL(url)` unmodified — hands off to iOS's default browser (normally Safari). |
| `chrome` | "Chrome" | Rewrites to `googlechromes://` (https) or `googlechrome://` (http) + host-stripped URL, then `Linking.openURL`. |
| `brave` | "Brave" | Rewrites to `braves://`/`brave://` scheme similarly. |
| `firefox` | "Firefox" | Rewrites to `firefox-open-url:?url=<percent-encoded full URL>`. |
| `edge` | "Edge" | Rewrites `https://`→`microsoft-edge-https://`, `http://`→`microsoft-edge-http://`. |
| `opera` | "Opera" | Rewrites `https://`→`opera-https://`, `http://`→`opera-http://`. |

- For any non-`internalBrowser` option, if `Linking.openURL(schemeURL)` throws (the
  target browser app isn't installed), shows an alert: "Error / Hydra was not able to
  open "<Browser>". You may not have this browser installed. You can change your link
  opening settings under Settings => General => External Links. \n\n<schemeURL>."
  with "Cancel" and "Open in Default Browser" (falls back to plain
  `Linking.openURL(url)`, the original unmodified URL) buttons.
- This function is the single choke point used by: `ErrorPage`'s "open in browser"
  link, `ThemedWebView`'s external-navigation fallback (§19), and (elsewhere, not
  surveyed here) any in-app "open in browser" affordance on links, images, etc.

## 19. Webview Page & Themed WebView

### 19.1 `WebviewPage` (`pages/WebviewPage.tsx`)
Reached via `PageType.WEBVIEW` (`hydra://webview?url=<encoded-target>`). Renders a
plain `react-native-webview` `WebView` pointed at the `url` query param (falls back
to `https://reddit.com` if absent/unparseable), with
`allowsBackForwardNavigationGestures` enabled (iOS Safari-style edge-swipe
back/forward *within the web content itself*). No theming/CSS injection, no
navigation interception — this is the "dumb" webview variant used e.g. for the
"Report" context-menu action (`hydra://webview/?url=https://www.reddit.com/report`).
It is registered in `SHOWS_BENEATH_TABS` as `false` (gets normal bottom padding, not
beneath-tab-bar).

### 19.2 `ThemedWebView` (`components/HTML/ThemedWebView.tsx`)
A separate, richer webview component (used elsewhere in the app — e.g. embedding
Reddit HTML content inline — not itself a stack screen) that:
- Injects a `<style>` block matching Hydra's current theme colors (background, tint,
  text, subtle text, link, divider) onto both old-Reddit (`.thing`, `.usertext-body`,
  `#header`, etc.) and new-Reddit/shreddit (`shreddit-app`, `shreddit-post`,
  Tailwind-ish utility class selectors like `[class*="bg-white"]`) DOM structures, so
  embedded Reddit pages roughly match the app's light/dark theme. Also hides the
  New-Reddit site header (`header { display: none }`) and an in-page promo bottom
  sheet (`#xpromo-bottom-sheet`).
- Enables shared/third-party cookies (`sharedCookiesEnabled`,
  `thirdPartyCookiesEnabled`) so a logged-in Reddit web session (via Hydra's stored
  cookies) carries into the embedded page, and enables Safari Web Inspector
  (`webviewDebuggingEnabled: true`).
- **Navigation interception** (`onShouldStartLoadWithRequest`, top-frame only):
  - If the navigation target's base path (ignoring query/hash, trailing-slash
    normalized) equals the current page's base path, allows it to load in-place
    (e.g. hash-only or query-only changes on the same page).
  - Otherwise, tries to construct a `RedditURL` from the target: if it resolves to a
    *known* page type (or is a short link, whose type can't be known yet but is
    still routable), the load is **cancelled** (`return false`) and instead
    `pushURL(targetURL)` is called — i.e., tapping an internal Reddit link inside an
    embedded webview navigates you to Hydra's own native screen for it instead of
    continuing to load inside the webview.
  - If the target isn't a recognized/short Reddit URL at all (a true external link,
    or a `RedditURL` construction failure), the load is likewise cancelled and
    handed to `openExternalLink(targetURL)` (§18) instead.
  - In all cases the webview's own in-place navigation is suppressed for
    cross-page loads — every "real" navigation from inside a themed webview is
    redirected either into Hydra's native stack or out to the external-link handler,
    never left to load directly inside that webview.
- Shows a centered `ActivityIndicator` while loading (`startInLoadingState` +
  `renderLoading`).

## 20. Backgrounding / Lifecycle Behaviors

- **`DismountWhenBackgrounded`** (`components/Other/DismountWhenBackgrounded.tsx`):
  a generic wrapper that unmounts its children (replacing them with a same-sized
  placeholder `ActivityIndicator`, using the last-measured layout size) whenever
  `AppState` transitions to `"background"`, and remounts them (renders children again)
  on any other state (`active`/`inactive`). This repo's usage of it is scoped to
  **video playback components** (`components/UI/Gallery/Video.tsx`,
  `components/UI/MediaViewer.tsx/MediaVideo.ios.tsx`,
  `components/UI/MediaViewer.tsx/MediaVideo.android.tsx`) — i.e., it is a
  video-player-specific safeguard (likely to avoid AVPlayer/background audio/crash
  issues while backgrounded), not a general app-shell mechanism. It is **not** used
  at the navigation-stack or tab level — the tab bar, stacks, and non-video screens
  stay fully mounted while backgrounded.
- **App-foreground stat tracking**: every transition to `AppState === "active"`
  increments the persistent `APP_FOREGROUNDS` stat (§1); this is the only
  shell-level state specifically re-evaluated on every foreground (besides the
  clipboard/share-payload checks in §6).
- **expo-updates OTA**: `app.config.ts` configures `updates.url` (pointed at the EAS
  project) and `fallbackToCacheTimeout: 5000` **only when** an `EAS_PROJECT_ID` env
  var was set at build time — i.e., over-the-air JS-bundle updates are an Expo/EAS
  build-time feature, entirely inapplicable to a native Swift rewrite (a Swift app
  ships all code compiled; there is no JS-bundle-swap concept to reproduce). No
  further OTA-related runtime behavior (update checks, prompts) was found wired into
  the navigation/shell layer.
- **Sentry crash/error reporting**: initialized at launch (§1), gated by the Privacy
  setting; not otherwise integrated into navigation/lifecycle beyond
  `Sentry.wrap(RootLayout)` (wraps the whole app's render tree in Sentry's error
  boundary/performance instrumentation) and one explicit `Sentry.captureException`
  call inside `SubredditContext`'s multireddit-loading error handling (unrelated to
  navigation).

## 21. App Icons (Settings → General → App Icon)

Configured via the `expo-alternate-app-icons` Expo config plugin
(`app.config.ts`) and surfaced in `pages/SettingsPage/General/AppIcon/AppIcon.tsx`.
Four selectable icons, shown as a 2-column grid of cards (icon image, name, and
credited artist with avatar + Reddit username):

| Internal name (`null` = default) | Display name | Artist |
|---|---|---|
| *(default, `null`)* | "Hydra" | u/dmilin (app developer) |
| `cerberus` | "Cerberus" | u/batjake |
| `hail_hydra` | "Hail Hydra!" | u/boxsitter |
| `hail_hydra_dark` | "Hail Hydra! (Dark)" | u/boxsitter |

Tapping a card navigates (`pushURL`) to
`hydra://settings/appIconDetails/<name-or-"default">`, a detail screen (not read in
full for this survey — belongs to the Settings-page survey area) which presumably
performs the actual `setAlternateAppIcon` call and shows author bio/links. The
currently-active icon is detected via `getAppIconName()` and highlighted with a
colored border + checkmark badge on its grid card.

---

## Open questions / ambiguities

1. **Universal links**: No `ios/` prebuild directory, entitlements file, or
   `associatedDomains` config was found anywhere in this repo, implying Hydra does
   **not** register as a universal-link handler for `reddit.com` URLs. This is
   inferred from the *absence* of configuration in a managed-Expo-workflow repo
   (native iOS project files are generated at build time by EAS, not checked in), so
   it's possible associated-domains entitlements are injected at EAS-build time via
   a mechanism not visible in this source tree (e.g. an EAS project dashboard
   setting, or a `.circleci`/`eas.json` build hook). I could not find any evidence
   either way beyond the repo contents. A Swift rewrite should confirm with the
   product owner whether universal links (Associated Domains) should be added, since
   this repo doesn't clarify it either way.
2. **`AppIconDetails.tsx`** (the per-icon detail screen reached from the App Icon
   grid) was not read in full — its exact content/actions (e.g. whether it also
   supports "tip the artist" links) is out of scope for the navigation-shell area
   and left to whichever survey area covers Settings pages.
3. **Exact wording/full content of `UpdateInfo.tsx`'s changelog list** (503 lines)
   was only partially read (first ~80 lines); the mechanism/trigger for showing it
   is fully documented above (§12.2), but the literal current release-notes text was
   not transcribed since it's app-version-specific content, not shell behavior, and
   is regenerated per-release by the `generate-app-store-update-info` tooling skill
   noted in this environment.
4. **`QuickSubredditSearch.tsx` and `QuickAccountSwap.tsx`** were read only partially
   (enough to document their tab-bar-triggered open/close behavior and basic
   navigation outcome). Their internal list rendering, debounce timing constants, and
   full visual layout are more naturally in scope for whichever survey area covers
   subreddit search / account switching UI, and were intentionally not fully
   transcribed here to avoid duplicating that work.
5. **Interaction between `StackFutureContext`'s right-edge swipe-forward gesture and
   the native-stack's own `fullScreenGestureEnabled` left/anywhere swipe-back
   gesture** (when "Swipe Anywhere to Navigate" is on, both gestures could
   theoretically compete for touches starting near the right edge in landscape or on
   wide iPad windows) — the source does not show explicit conflict resolution beyond
   the 30px right-edge zone check and the 15° angle threshold; exact precedence when
   both could plausibly claim a gesture was not verified empirically (would require
   running the app).
6. **Whether `hydra://accounts`, `hydra://settings`, `hydra://webview` schemes are
   ever handled as *externally arriving* deep links** (as opposed to being
   constructed only by the app's own internal navigation code, and by the
   `hydra://openurl?url=...` wrapper for genuinely external hand-offs): the
   `RedditURL.getPageType()` logic would classify a bare externally-arriving
   `hydra://settings/...` link correctly if it ever reached `useHandleIncomingURLs`,
   but that hook's `handleDeepLink` only pattern-matches the `hydra://openurl?url=`
   prefix and ignores/no-ops on any other `hydra://` deep link shape arriving via
   `Linking`. This looks intentional (only `openurl` is meant to be an external
   entry point) but was not confirmed via a product/marketing source (e.g. whether
   the App Store listing or marketing site ever links `hydra://settings` directly).
