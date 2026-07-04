# Spec: Interaction overhaul (iOS-first)

**Execution order: 3 of 4.**

## Background

Hydra's interactions predate its current dependency stack. The app ships **Reanimated 4 + react-native-worklets + react-native-gesture-handler 3** but uses them in only two places (the Android media viewer and `PulseHighlight`); every other gesture and animation runs on the legacy JS-thread responder system with the RN `Animated` API. The goal: bring interactions up to the modern iOS bar — **iOS HIG, with Apollo as the taste reference** — by migrating interaction-critical surfaces to the UI-thread stack. Android must keep working but is not the design target.

**Decided and settled:** no Rust/WASM or custom native-module investigation. Hydra has no compute-bound workload (Hermes has no meaningful WASM support anyway); the wins are in moving gestures/animation off the JS thread with the libraries already installed.

## Item 1: Rewrite `Slideable` on gesture-handler + Reanimated

**Current:** `components/UI/Slideable.tsx` implements post/comment swipe actions with the legacy responder system (`onMoveShouldSetResponder`/`onResponderMove`) and JS-driven `Animated` values (`useNativeDriver: true` only on the release spring, `Slideable.tsx:135`). Under JS-thread load (exactly when scrolling a heavy feed), swipe tracking stutters.

**Target:** same feature surface, rebuilt on `Gesture.Pan()` + Reanimated shared values + worklets so tracking runs entirely on the UI thread:

- Two thresholds per side (short 75px / long 130px) mapping to user-configurable actions (`shortLeft/longLeft/shortRight/longRight`) from `GesturesContext` (configured in `pages/SettingsPage/General/Gestures.tsx`). Preserve exactly.
- Light haptic when a threshold engages (haptic call crosses to JS via `runOnJS` — keep it).
- Icon/color reveal underneath the sliding content, as today.
- Interplay with `swipeAnywhereToNavigate`: when that setting is on, `fullScreenGestureEnabled` is set on the native stack (`app/stack/index.tsx:164`) and `Slideable` currently disables its own left-swipes (`Slideable.tsx:89,124`). Reproduce this coexistence with gesture-handler's `simultaneousWithExternalGesture` / `blocksExternalGesture` / activation offsets — the OS back gesture must still win when the setting is on.
- Must coexist with vertical scrolling of FlashList (activation should require mostly-horizontal movement).

This is the pattern-setter: establish the idioms (shared values, gesture composition, `runOnJS` boundaries) that Items 2-3 follow.

## Item 2: Native iOS context menus

**Current:** long-press on posts/comments opens an `@expo/react-native-action-sheet` action sheet, wired through `utils/useContextMenu.ts` and `utils/useComponentActions.ts` (posts: `PostComponent.tsx:77`; comments build the menu inline at `components/RedditDataRepresentations/Post/PostParts/Comments.tsx:203`).

**Target:** real UIKit context menus (press-and-hold with blur + preview) via a wrapper library — evaluate **Zeego** (preferred; falls back gracefully) or `react-native-ios-context-menu`. Requirements:

- Posts: context menu with a preview of the post; menu items = the existing action list (upvote/downvote, save, share, subreddit/user shortcuts, filters, etc. — take the list from `useComponentActions`).
- Comments: context menu without preview is acceptable; same actions as the current sheet.
- Keep the action-sheet path as the Android fallback (Zeego does this automatically via its cross-platform primitives).
- Accessibility actions currently unified with the long-press menu in `useComponentActions` must keep working.

## Item 3: Media viewer gesture overhaul (iOS)

**Current (iOS):** `components/UI/MediaViewer.tsx/MediaViewer.ios.tsx` — dismiss is detected at gesture *end* (`onScrollEndDrag` velocity + overscroll checks animating `flickedAway`), and scroll-driven values call `Animated.setValue` per frame from JS (`:350-431`). Pinch-zoom in `MediaImage.ios.tsx` is a plain `ScrollView` with `maximumZoomScale={10}` + double-tap-to-zoom — not a real pinch gesture. Android (`MediaImage.android.tsx` / `MediaVideo.android.tsx`) already uses gesture-handler/Reanimated and can serve as an in-repo reference.

**Target:**

- **Interactive swipe-to-dismiss:** the media tracks the finger continuously (translate + scale-down + background fade following the drag, Photos/Apollo-style), committing or springing back on release based on displacement + velocity. Built on `Gesture.Pan()` + Reanimated; replaces detect-at-release.
- **Real pinch-to-zoom:** `Gesture.Pinch()` (+ pan while zoomed, + double-tap) replacing the ScrollView zoom hack. Zoom must compose with the paging FlashList (zoomed image captures gestures; unzoomed swipes page/dismiss) — mirror the gesture-composition approach already proven in the Android files.
- Preserve: overlay toggle on tap (`PostOverlay`), gallery paging (vertical rows = posts, horizontal = gallery items), and the shared-video-player handoff. Do not regress the black-box overlay fixes (commits #12-#14).

## Item 4: Paper-cuts pass

Small, ship-blocking or polish defects found in audit:

1. `components/UI/RedditDataScroller.tsx:96` — `RefreshControl` ships a leftover debug style `backgroundColor: "red"`. Remove.
2. `RedditDataScroller.tsx:77-88` and `pages/PostDetails.tsx:285-295` — a 500ms `setTimeout` workaround for broken `RefreshControl` `tintColor` on RN 0.81.5. Re-test on the current RN 0.83.2; remove the workaround if fixed upstream, otherwise consolidate it into one shared component instead of two copies.
3. `app/tabs/index.tsx` — commented-out `animation: 'fade'` on the tab navigator with a link to a react-navigation bug. Re-test on react-navigation 7.1.8 / bottom-tabs 7.4.0; enable if fixed, else delete the dead code and keep the link in a tracking issue.
4. **Haptics consistency audit:** haptics currently fire on swipe-threshold engage, pull-to-refresh, and tab long-press. Define a simple policy (e.g. light impact for state-changing gestures: vote via swipe, collapse thread, threshold engage; selection feedback for menus) and apply it uniformly — sibling actions must not differ (e.g. if swipe-to-upvote buzzes, tap-to-upvote's feedback should be deliberate, not accidental).

## Sequencing within this spec

1 → 2 → 3 → 4. Item 1 establishes the Reanimated/RNGH idioms; Item 3 reuses them. Items 2 and 4 are independent and can interleave.

## Acceptance criteria

1. Post/comment swipe actions track at 60fps while the feed is loading/scrolling (JS-thread busy) — verify with the perf monitor; gesture tracking must not drop frames when JS does.
2. All configurable gesture settings (`Gestures.tsx`), thresholds, haptics, and `swipeAnywhereToNavigate` coexistence behave exactly as before.
3. Long-press on a post shows a native iOS context menu with preview; comments show a native menu; Android still gets a functional menu (sheet fallback acceptable).
4. Fullscreen media: pinch-zooms under the fingers, pans while zoomed, double-tap zooms, and swipe-to-dismiss follows the finger with interactive scale/fade. Gallery paging and tap-for-overlay unaffected.
5. No red refresh control; pull-to-refresh spinner color correct with no visible delay (or the documented workaround consolidated); tab animation dead code resolved.
6. Haptic policy written down (one short section in the PR description is fine) and applied consistently.
7. Android builds and runs: swipes, menus, media viewer all functional (parity of polish not required).
