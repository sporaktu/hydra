# Spec: Performance quick wins

**Execution order: 1 of 4** (before `02-focused-video-playback.md` — these fixes reduce the render churn that amplifies the stale-video bug).

## Background

Hydra is a keyless Reddit client (React Native 0.83 / Expo SDK 55, React 19). A code audit found several low-risk, high-certainty performance defects. None of these change user-visible behavior; they remove wasted work. Each item below is independent — implement and verify them one at a time.

## Item 1: Feed render churn

**Problem:** Every visible feed cell re-renders during scroll.

- `PostComponent` (`components/RedditDataRepresentations/Post/PostComponent.tsx`) is not wrapped in `React.memo`.
- `renderItem` in `pages/PostsPage.tsx:179-196` is an inline closure recreated every render.
- `PostsPage.tsx:178` passes `extraData={rerenderCount}`, and `handleScrolledPastPost` (`PostsPage.tsx:85-90`) bumps `rerenderCount` on every scrolled-past post when `autoMarkAsSeen` is on — force-re-rendering **all** visible cells mid-scroll to update one cell's "seen" dimming.

**Fix:**

- Wrap `PostComponent` in `React.memo`.
- Hoist `renderItem` to a stable `useCallback` (or module-level function taking props via item).
- Replace the `extraData`/`rerenderCount` pattern with per-item seen state: the cell that was scrolled past is the only one that should re-render (e.g. subscribe to seen-state per post id, or store seen ids in a context keyed lookup that only the affected cell reads reactively).

**Verify:** With React DevTools profiler (or render-count logging), scrolling the feed with `autoMarkAsSeen` on re-renders only the cell being marked seen, not all visible cells. Seen-post dimming still works, including after navigating away and back.

## Item 2: Context value churn (Theme and friends)

**Problem:** `contexts/SettingsContexts/ThemeContext.tsx` builds a fresh `theme` object every render (`:84`, `theme = { ...theme, ...customThemeData }`) and passes a new object literal as the context `value` (`:92`). Nearly every component in the app consumes `theme`, so any re-render of the provider cascades tree-wide. `GesturesContext` and the other `contexts/SettingsContexts/*` providers have the same unmemoized-value pattern. The root provider tree (`app/index.tsx:108-142`, 15 nested providers) multiplies the blast radius.

**Fix:** `useMemo` the computed theme object and every context `value` object in `contexts/SettingsContexts/` (and `GesturesContext`), keyed on their actual inputs.

**Verify:** Changing an unrelated setting no longer re-renders theme consumers (profiler). Theme switching, custom themes (ThemeMaker), and light/dark switching still work.

## Item 3: Work on the scroll path

**Problem:**

- `components/UI/RedditDataScroller.tsx:110` writes a SQLite stat (`modifyStat(Stat.SCROLL_DISTANCE, ...)`) inside `onScroll` (throttled to `scrollEventThrottle={100}`, but still DB I/O initiated during active scrolling).
- `pages/PostDetails.tsx:317` runs `handleScrollForTabBar` in `onScroll` with no `scrollEventThrottle` set.

**Fix:**

- Accumulate scroll distance in a ref during scroll; flush to SQLite on `onMomentumScrollEnd` / screen blur / app background — never during active scroll.
- Set an appropriate `scrollEventThrottle` on the `PostDetails` scroll view (16 if the tab-bar animation needs per-frame data, higher otherwise).

**Verify:** Scroll-distance stat still accumulates correctly across sessions (check Stats settings page). Tab-bar hide/show on scroll still feels the same.

## Item 4: Startup blocking work

**Problem:** `app/index.tsx:83-87` runs `doDBMaintenance()` and `VideoCache.clearCacheIfRequested()` before first render; the splash screen stays up until they finish. Neither must complete before the UI is usable.

**Fix:** Defer both to after first render / interaction idle (e.g. `InteractionManager.runAfterInteractions` or a post-mount effect). Confirm neither has an ordering dependency that requires pre-render execution (DB *migrations* must stay blocking; *maintenance* should not).

**Verify:** Cold-start time to first feed render measurably drops (time it before/after). Video cache clearing still happens when requested (toggle the setting, relaunch, confirm cache dir emptied).

## Item 5: Fullscreen image memory

**Problem:** `components/UI/MediaViewer.tsx/MediaImage.ios.tsx:138` sets `allowDownscaling={false}`, forcing full-resolution decode of every fullscreen image up front (needed for zoom quality, but paid even when the user never zooms). Large images spike memory inside the paging viewer, which keeps neighbors mounted.

**Fix:** Progressive decode — render with downscaling allowed by default; when zoom begins (scale > 1), swap to (or overlay) the full-res decode. `expo-image` supports `recyclingKey`/source swapping; keep the transition invisible (keep the downscaled layer until full-res is ready).

**Verify:** Open a very large image (e.g. a 10000px wallpaper post) — memory stays bounded; zooming in still reaches full sharpness with no visible pop or blank frame.

## Out of scope

- Video playback architecture → `02-focused-video-playback.md`.
- Gesture/animation JS-thread work → `03-interaction-overhaul.md`.
- Comment tree virtualization → `04-comment-virtualization.md`.

## Acceptance criteria (whole spec)

1. Feed scroll with `autoMarkAsSeen` on: only the affected cell re-renders.
2. All `SettingsContexts` and `GesturesContext` provide memoized values; theme change still propagates correctly.
3. No SQLite writes initiated while a scroll gesture is active.
4. Cold start no longer blocks on DB maintenance or video-cache cleanup.
5. Fullscreen images decode progressively; zoom quality unchanged.
6. No behavioral regressions: seen-dimming, stats page numbers, theme switching, pull-to-refresh, tab-bar auto-hide all work as before.
