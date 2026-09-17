# Media — Behavioral Specification

Scope: fullscreen media viewer (images/galleries/videos/gifs), video playback everywhere (feed inline, fullscreen, gallery mode), Gallery Mode screen, media caching, download/share/save, Live Text, zoom/pan/dismiss gestures, video source resolution, link preview cards. iOS behavior only (`.ios.tsx` variants); Android files ignored per instructions except where noted for comparison context.

All TypeScript paths below are references only — this document describes behavior, not implementation.

---

## 1. Data model: what counts as "media" on a post

A `Post` (`api/Posts.ts`) carries:
- `images: (string | ImageSource[])[]` — one entry per gallery item; each entry is either a single URL string or an array of `{uri,width,height}` resolution variants sorted smallest→largest (the last is highest resolution).
- `videos: { source: string; videoDownloadURL: string; needsResolution?: boolean }[]` — one entry per gallery item that is a video. `source` is what the player is fed (may be an HLS playlist URL, an mp4 URL, or — for Redgifs — the unresolved watch-page URL). `videoDownloadURL` is what "Share"/"Save" downloads (always a direct file URL, never HLS). `needsResolution: true` only for Redgifs links.
- `mediaAspectRatio: number` — derived from the first image's width/height, or `0.75` default if unavailable. Used to size both the feed's inline media box and the gallery grid cell.
- `imageThumbnail: ImageSource | null` — first (smallest) resolution of the first image; used as the video Poster.
- A post can have images OR videos, never both simultaneously (`videos` takes priority in rendering — `PostMedia.tsx` checks `post.videos.length > 0` first).

### 1.1 Video source resolution chain (`formatVideos` in `api/Posts.ts`)

Exact precedence order, first match wins:

1. **`media.reddit_video.hls_url` present** → `source` = the HLS `.m3u8` playlist URL, `videoDownloadURL` = `media.reddit_video.fallback_url` (a DASH mp4). This is the normal case for native Reddit-hosted (`v.redd.it`) videos with audio.
2. **`media.reddit_video.fallback_url` present but no `hls_url`** (crossposts / older videos) → both `source` and `videoDownloadURL` are the DASH fallback mp4.
3. **Gallery videos** (`gallery_data.items` + `media_metadata[id].s.mp4`) — checked *before* preview variants so a gallery-with-preview doesn't collapse to one video. One entry per gallery item, ordered by `gallery_data.items`, each using `media_metadata[id].s.mp4` (full-size). Items lacking `.p` (unprocessed media) are dropped.
4. **`preview.images[].variants.mp4`** (Reddit-hosted GIF-as-video, e.g. r/gifs) — one entry per preview image; each prefers `variants.mp4.source` (full-size) over `variants.mp4.resolutions` (downscaled, tops out ~640px); falls back to the *last* (largest) resolution entry only if `source` is absent.
5. **External URL fallbacks** (only reached if none of the above matched and the post URL fails Reddit's own-domain validity check):
   - `imgur.com/....gifv` → rewritten to `.mp4` (same host, direct file, no resolution needed).
   - `gfycat.com/...` → rewritten to a Wayback-Machine thumbs mirror URL: `https://web.archive.org/web/0if_/thumbs.<host+path>-mobile.mp4` (gfycat itself is defunct; this is a scraped fallback).
   - `redgifs.com/...` → `source` = the raw watch URL, `needsResolution: true`. Not resolved here — resolution is deferred to display time (see §6).
6. Otherwise → `videos: []` (no video found; the post is later treated as text/link/image).

None of steps 1–5 except Redgifs set `needsResolution`; Redgifs is the *only* host requiring an async API call to get a playable URL (ADR `0001-lazy-redgifs-resolution.md`).

Animated `.gif` **images** (not gif-as-mp4) are rendered by `expo-image` directly as part of `images[]`, not through the video pipeline at all, and always animate regardless of feed focus state (explicitly out of scope for focused-only playback, per ADR 0003).

### 1.2 Link posts / OpenGraph preview cards (`Link.tsx`, `utils/URL.ts`)

For a link post whose URL is *not* a valid in-Reddit page and does not match imgur/gfycat/redgifs/`.gif`/`.gifv`/`.mp4`, `formatPostData` fetches OpenGraph metadata: `new URL(externalLink).getOpenGraphData()`.
- Fetch uses a 1750ms timeout (`safeFetch` with `timeout: 1_750`) so a slow site never blocks post loading; on any failure `openGraphData` is simply `undefined`.
- Parses only `<meta property="og:*">` tags via a streaming HTML parser (`htmlparser2`), collecting `title`, `type`, `image`, `url`, `description`. No fallback to `<title>`/`<meta name="description">`, no Twitter Card (`twitter:*`) tags, no favicon fetching, and no special-cased handling for YouTube, Twitter/X, or any other host — it is a single generic OpenGraph scrape for every non-Reddit, non-media link.
- `og:image` pointing at an `.svg` is explicitly dropped (expo-image crashes on certain SVGs).
- Rendering (`Link.tsx`): if `openGraphData.image` AND `openGraphData.title` are both present, shows a card: 200px-tall cover image (only when `currentDataMode === "normal"`; skipped entirely in low-data mode — see §11) + title (1 line) + description (if present and `linkDescriptionLength !== 0`, clamped to `linkDescriptionLength` lines, default 10) + the raw URL (1 line, subtle color) below. If image+title are not both present, the card degrades to a single-line plain-text URL. Tapping the card: if the URL parses as a `RedditURL` it's pushed in-app; otherwise `openExternalLink` (system browser / in-app browser per user setting, outside this area). No domain/favicon shown anywhere.

---

## 2. Fullscreen Media Viewer

### 2.1 Opening

Any tap on a post's inline image(s) or video (from the feed, post detail, gallery mode, or comment-embedded images) calls `MediaViewerContext.displayMedia({ media, initialIndex?, getCurrentPost?, onFocusedItemChange? })`. `MediaViewerProvider` (`contexts/MediaViewerContext.tsx`) owns a single global instance: only one viewer can be open app-wide. `media` is a 2D array — one **row** per *post* (gallery/multi-image posts get one row with N columns), and viewer paging is: vertical = between rows (posts), horizontal = between columns (items within one post's gallery).
- `displayMedia` converts a flat `initialIndex` into `(startingRowIndex, startingColumnIndex)` by walking row lengths.
- `getCurrentPost` may be a plain function or a `RefObject` (used by Gallery Mode, which needs the *latest* posts array, not a stale closure, since gallery scrolling continuously appends more posts).
- The viewer renders as a transparent, full-screen React Native `Modal` (`supportedOrientations: ["portrait","landscape"]`) inside a `GestureHandlerRootView`, laid on solid black background.
- On mount: `ExpoOrientation.unlockAsync()` — rotation is allowed while the viewer is open. On unmount: forced back to `PORTRAIT_UP`.
- Opening/closing does **not** use a shared-element/hero transition; the modal simply appears (RN `Modal`'s default presentation) with a black background already in place.

### 2.2 Paging structure and index indicator

- Outer list (rows/posts) is a vertical `FlashList` with `pagingEnabled`, one full-screen page per post, `drawDistance: 100`.
- Each row is itself a horizontal `FlashList` (`pagingEnabled`) of that post's items (images and/or videos, matching the post's actual media type — items are never mixed image/video within one post).
- Only the **currently active row** gets a live ref (`rowFlashListRef`) for double-tap paging control; other rows scroll independently and their own touch/scroll position is tracked via `rowScrollPositions`.
- `initialScrollIndex` is deliberately always `0` with `initialScrollIndexParams.viewOffset = height * initialRowIndex` — this works around a documented FlashList bug where the initial index calculation is wrong for indices beyond the first data batch.
- Rotating the device remounts the outer list (`key={orientation}`), re-seeding the initial index from the *current* row/column at the moment of rotation (not the original open-time index), so you land back on the same item post-rotation.
- **Item index indicator**: shown only when the current row has >1 item (multi-image/video gallery post). Bottom-right, two round pill buttons (arrow-left / arrow-right, FontAwesome6) plus a `"{col+1} / {total}"` pill. Buttons are visually dimmed (`opacity: 0.5`) and `disabled` at the first/last item. These buttons animate to hide together with the rest of the overlay chrome.
- **Row navigation** (paging between posts vertically) has no numeric indicator, just the swipe gesture.

### 2.3 Dismiss gestures

Three independent ways to close, each animating via `flickedAway.value = withTiming(-150, {duration:200})` then calling `onClose`:
1. **Close (X) button** top-right, always visible when the overlay chrome is shown (see §2.4).
2. **System back gesture** (`Modal.onRequestClose`).
3. **Overscroll flick**, evaluated separately per axis on `onScrollEndDrag`:
   - **Vertical** (row list): triggers if the user pulled past the top/bottom edge by more than 50px (`pulledPastTop`/`pulledPastBottom`), OR the drag ended with velocity beyond a small threshold (`|velocity.y| > 1`) while already past the edge (`momentumPastTop`/`momentumPastBottom`).
   - **Horizontal** (item row, only when >1 item in the row): same shape but with a **40px** threshold instead of 50px, and only fires from `MediaRow`'s own `onScrollEndDrag` (i.e., swiping past the first/last item in a gallery horizontally can also dismiss the whole viewer, not just refuse to page further).
   - While overscrolling (before release), the background fades and the content container shrinks/fades continuously: `interpolate(dismissOffset, [-150,-50,0], [opacity/scale range])` combining `flickedAway + scrolledAwayY + scrolledAwayX` shared values — i.e. visual feedback is live during the drag, not just on release.

### 2.4 Tap classification (`utils/mediaViewerTaps.ts`, `useMediaViewerTaps.ts`)

The entire content surface (excluding the PostOverlay and video controls rows, which call `e.stopPropagation()`) is one touch target split into three interactions:

| Gesture | Zone | Effect |
|---|---|---|
| Single tap | anywhere | Toggle post overlay + item-index chrome visibility |
| Double tap | left/right 30% edge (`SIDE_TAP_ZONE_FRACTION = 0.3`) — **only when the row has >1 item and the list isn't scroll-locked** | Page to previous/next item in the gallery |
| Double tap | middle (everything else, or the whole screen when side-paging isn't active) | Play/pause the currently displayed video (no-op on an image) |

Exact thresholds (all pure, unit-tested in `utils/mediaViewerTaps.ts`):
- A touch counts as a **tap** only if it moved < 10pt (`TAP_MAX_MOVEMENT`) in both axes and lasted < 300ms (`TAP_MAX_DURATION_MS`). Anything else (drag/scrub/page) cancels any pending tap state.
- A second tap counts as part of a **double tap** if it lands within 280ms (`DOUBLE_TAP_MAX_DELAY_MS`) and within 45pt (`DOUBLE_TAP_MAX_MOVEMENT`) of the first tap's location.
- **Arbitration**: a single tap fires *immediately* only in a zone where no double-tap action is possible there right now (e.g., middle zone when there's no video, or side zone when paging is disabled/locked). Otherwise the handler holds the tap for the full 280ms double-tap window before firing the single-tap action, so a double tap never also toggles the overlay.
- Side double taps are **not clamped** to a debounce like the arrow buttons but the target column *is* clamped to `[0, rowSize-1]` (tapping past the end just does nothing further, doesn't wrap or error). Rapid sequential double-taps (within 300ms of each other) chain from the last *intended* target rather than the actual settled scroll position, so quickly double-tap-double-tapping pages multiple items smoothly.
- Middle double-tap play/pause: looks up the shared player for the focused item via the video player registry's `peek(key)` (does not "acquire" — only pokes an already-owned player), toggles `play()`/`pause()`, fires a haptic (`hapticSelection`), and forces the overlay to show when pausing / hide when resuming (so the paused state is visually legible).
- In a **gallery post with a single item** (`sideTapPages=false` on `MediaImage`, `canPageSides()` false in the viewer), the middle zone effectively covers the *entire* screen for play/pause — there are no dead edge zones.

### 2.5 Post overlay (`PostOverlay.tsx`)

Rendered above the media, `pointerEvents: box-none`, fades in/out (150ms) with single-tap toggle. Contains, top to bottom:
1. **Close (X)** button, top-right, circular translucent grey.
2. **Share button** (only if `post.images.length > 0 || post.videos.length > 0`), top-right below/beside close, circular translucent grey, `ios-share` icon. On press:
   - Sets a loading state (button becomes an `ActivityIndicator`) and disables itself while in flight.
   - For a video: if `needsResolution` (Redgifs), calls `Redgifs.getMediaURL(source)` first to get the real download URL; on `RedgifsResolutionError` shows an alert "Couldn't load video / Redgifs is rate limiting requests. Please try again in a moment." and aborts (any other error is rethrown/uncaught).
   - Then calls `useMediaSharing()("video", downloadURL)` or `("image", post.images[columnIndex])` — see §9 for the download→share flow.
3. **Info card** (tap opens the post, `activeOpacity: 0.7`): title (1 line, ellipsized), body text preview (2 lines, ellipsized, only if `post.text` non-empty), and a metadata row `" in " + r/<subreddit> + " by " + author`, where `/r/<subreddit>` and the author name are independently tappable and navigate there (closing the viewer first). Opening any of these three targets resolves short links (`redd.it/…`, `/s/…`) via `RedditURL.resolveURLIfValid` before deciding the destination page type, and uses `navigation.dispatch(StackActions.push(...))` because the viewer can be invoked from outside the tab navigator (e.g. Gallery Mode).

There is **no rotation control**, **no "open in browser"** action, and **no separate "copy link" / "copy image" action** inside the fullscreen viewer's overlay — copy-image and "open in browser" only exist via the feed-level `ImageViewer` long-press menu (§9.1), not inside the fullscreen viewer.

---

## 3. Image viewing (`MediaImage.ios.tsx`)

One `MediaImage` per gallery item, sized to the full safe-area frame (`width × height`), `contentFit: "contain"`.

### 3.1 Resolution strategy
- `item.source` may be a single URL or an array of `{uri,width,height}` variants (smallest→largest). The image is decoded at the **highest** resolution (`source[source.length-1]`) as the primary `source`.
- **Downscaling latch**: by default `allowDownscaling={!needsFullRes}` starts `true` (expo-image decodes at container size to save memory while paging). The moment the user zooms even once (`isZoomed` transitions true), `needsFullRes` latches permanently `true` for that item — `allowDownscaling` flips off and the image re-decodes at native resolution. It never reverts to downscaled even after zooming back out.
- **Placeholder**: while the full-res `source` loads, the same lower-resolution variant array is passed as `placeholder` (`placeholderContentFit: "contain"`) — this is expected to be an instant cache hit because it's the same resolution the feed's inline `ImageViewer` already displayed and cached, so opening the viewer shows an immediate (possibly slightly soft) image rather than a blank/black frame, then crossfades (`transition: 150`) to full detail.
- `recyclingKey` = the highest-res URI, so FlashList cell recycling resets state correctly.
- On recycle onto a different `item.source` (`useRecyclingState`), zoom/pan state resets synchronously: `scale=1, translateX=translateY=0, isZoomed=false`.

### 3.2 Zoom / pan / pinch gestures
All via `react-native-gesture-handler` + Reanimated worklets (`usePanGesture`, `usePinchGesture`, `useTapGesture`, combined with `useSimultaneousGestures` so pinch and pan can occur together, plus a separate double-tap gesture).

- **Double-tap to zoom**: max travel 20pt between the two taps to still register as a double tap (`useTapGesture({maxDistance:20, numberOfTaps:2})` — this is the *gesture-handler* double tap used for zoom, distinct from the viewer-level 45pt/280ms classifier in §2.4, which is bypassed here because inside a gallery-with->1-item the side 30%-width zones are reserved for viewer paging (`sideTapPages` check) — a double tap landing in a side zone there does nothing at the image level and lets the viewer's own paging handle it).
  - If already zoomed → animate back to scale 1, translate to (0,0), `TIMING = 250ms ease-out`.
  - If not zoomed → zoom to **`ZOOM_SCALE = 3`**, centered on the tap point (computed via the tap's offset from the anchor already applied, so the tapped point stays under the finger), clamped so the image never pans past its edges: `maxX = width*(scale-1)/2`, `maxY = height*(scale-1)/2`.
- **Pinch-to-zoom**: continuous scale from **1 to 10** (`Math.min(Math.max(scale*event.scaleChange,1),10)`), pivoting around the live pinch focal point each frame (incremental, not baseline-relative, so simultaneous pan+zoom both track correctly). A **focal "snap"** guard: if the two-finger centroid jumps more than 50pt in one frame (a finger added/removed mid-gesture), that frame's pan contribution is dropped (zoom still applies) to avoid a visible jerk. On pinch release, if scale settled under 1.1 it springs back to exactly 1 / centered (200ms timing) — i.e., a very small pinch that doesn't clearly commit to zooming snaps back to unzoomed.
- **One-finger pan** (only enabled while zoomed, `maxPointers: 1`, `averageTouches: true`): drags the image within the same edge-clamped bounds as above. On release, if the release velocity exceeds 100pt/s in either axis, pan continues with `withDecay` (deceleration `0.998`), clamped to the same edge bounds — i.e. a flick while zoomed keeps drifting and decelerates rather than stopping dead.
- **Rotation**: not supported at all — no rotate gesture, no rotate button, images are always upright as served.
- Zooming (`isZoomed` true) sets `setIsScrollLocked(true)` on the enclosing viewer, which disables both the row (image gallery) and outer (post-to-post) paging lists so pan gestures aren't fought by list scrolling; un-zooming restores paging.

### 3.3 Live Text
- No native Live Text wiring was found anywhere in the image-viewing code path (`MediaImage.ios.tsx`, `ImageViewer.tsx`) — no `allowsLiveText`/analysis-interaction prop, no VisionKit/ImageAnalyzer module reference in the repo. The **`liveTextInteraction` setting exists** (MMKV-backed, default `false`, toggle under Appearance → "Live text") but is **not read by any component that renders an image** — see Open Questions. Per `documentation/live_text.md`, the intended behavior is: iOS 15+/A12+ only; disabled by default because it conflicts with the image long-press gesture; when enabled, long-press-to-select text requires a longer hold to disambiguate from the context-menu long-press; supports select/copy/translate/look-up/search/share on recognized text, same as system-wide iOS Live Text.

### 3.4 Share / Save / Copy / Open in browser (feed-level `ImageViewer.tsx`, not the fullscreen viewer)
Long-press on any inline image (in a post or in HTML-rendered comment/post body — `ImageViewer` is shared by both) opens a menu with exactly three actions, built by `makeImageMenuActions`:
1. **Share Image** — `useMediaSharing()("image", img)` (see §9).
2. **Save Image** — `useMediaSaving()("image", img)` (see §9), which requests `MediaLibrary` add-only permission on first use.
3. **Copy Image Link** — `getMediaURL(img)` (resolves to the string or the highest-res variant's `.uri`) copied to clipboard via `expo-clipboard`. No "Copy Image" (pixel data) option, only the link.

On iOS this is presented via `NativeContextMenu` (the real native long-press context menu, triggers immediately on long-press, coexists with/overrides any wrapping post/comment long-press menu). On Android (out of scope here) it's an `ActionSheet` from a raw `onLongPress`. There is **no "Open in Browser"** action for images anywhere in this menu.

---

## 4. Video viewing — shared architecture

Video playback happens in three surfaces that all ultimately attach to the **same underlying player instance** per video (via the shared registry, §5): the feed's inline `Video` (`components/UI/Gallery/Video.tsx`), the fullscreen viewer's `MediaVideo` (`components/UI/MediaViewer.tsx/MediaVideo.ios.tsx`), and Gallery Mode's grid cell (`components/UI/Gallery/Video.tsx` — same component reused, no separate gallery-grid video component). This section covers what's common; §7/§8 cover surface-specific behavior.

### 4.1 Redgifs lazy resolution (`utils/useResolvedVideoSource.ts`, `utils/RedGifs.ts`)
Applies only when `video.needsResolution === true` (Redgifs links). All other hosts resolve their playable URL synchronously/deterministically at fetch time (§1.1) and skip this entirely.

- **When it happens**: at *display* time, on mount of whichever component is currently rendering that video (lazy — not at feed-fetch time). ADR 0001 explains this was moved from eager (`Promise.all` in `getPosts`) to lazy specifically to avoid bursting ~20-30+ parallel Redgifs API calls per page load, which triggered rate limiting.
- On mount, first checks an **in-memory-only** cache (`Redgifs.peekCachedMediaURL`, keyed by video id parsed from the URL). A cache hit sets state straight to `"ready"` with no network call and no flash of a loading state (important for FlashList cell recycling — a previously-resolved video re-mounting doesn't re-loading-flash).
- Cache miss → status `"loading"`, calls `Redgifs.getMediaURL(rawSource, abortSignal)`. The `AbortController` is tied to the component's effect cleanup — if the cell scrolls off-screen before resolution completes, the request is aborted (dropped from the queue) rather than continuing to burn a concurrency slot; an abort is **not** treated as an error (state is left untouched, not flipped to error).
- **Concurrency**: global cap of **`MAX_CONCURRENT_RESOLUTIONS = 2`** simultaneous Redgifs API calls app-wide. Additional requests queue.
- **Queue discipline**: LIFO (`takeNextWaiter` pops from the end) — i.e. visible-first: the most recently requested (most likely currently on-screen) video jumps ahead of a backlog of already-scrolled-past requests. Waiters whose abort signal already fired are skipped/rejected when popped, so they never consume a slot.
- **Token**: a Redgifs temporary auth token is fetched via `POST /v2/auth/temporary` and persisted in `KeyStore` (MMKV) under `redgifsToken`; reused across resolutions until a request fails, at which point it's refreshed.
- **Retry/backoff** (`resolveWithRetry`, up to `MAX_BACKOFF_ATTEMPTS = 3`):
  - HTTP 429 → arms a shared **30s cooldown** (`RATE_LIMIT_COOLDOWN_MS`) that pauses *all* pending/future resolutions (not just this one) until it expires; does not consume a retry differently from other failures.
  - Other non-OK response → arms a shorter cooldown (`NORMAL_COOLDOWN_MS(1000) * (attempt+1)`, i.e. 1s/2s/3s escalating) and refreshes the token before retrying.
  - Thrown/network error → same escalating cooldown + token refresh.
  - All attempts exhausted → throws `RedgifsResolutionError`.
  - A queued caller whose signal aborts *while waiting out a cooldown* bails immediately rather than holding its concurrency slot, so a still-visible post isn't starved behind an off-screen one.
- Resolved URL = `gif.urls.hd ?? gif.urls.sd` (prefers HD), cached forever in-memory (`resolvedUrlCache`, never persisted to disk — Redgifs URLs are signed and expire in hours, so a persisted cache would serve dead links on next app launch; staleness is bounded to the current session).
- **Stale-cache recovery**: if playback subsequently errors on an already-`ready`-resolved Redgifs source, both `Video.tsx` and `MediaVideo.ios.tsx` independently detect it (`playerStatus/error === "error" && resolveStatus === "ready"`), call `Redgifs.clearCached(videoId)` once, and `retry()` — busting the (presumably expired) cached URL and re-resolving fresh, exactly once per mount (`hasBustedStaleCache` ref guard).

### 4.2 Query-param trimming fallback (`utils/videoSourceFallback.ts`)
Applies to the **inline feed `Video`** component only (not the fullscreen viewer). On the first player error for a resolved source that has query parameters, retries once with the query string stripped (`getTrimmedVideoSource`). Explicitly **excluded** for signed hosts — `redd.it` (and subdomains: `v.redd.it`, `i.redd.it`, `preview.redd.it`, `external-preview.redd.it`), `redgifs.com`, `redgifs.net` — since their query strings carry required auth signatures and stripping would turn a working URL into a 403; those hosts rely solely on the watchdog/stale-cache paths instead. Guarded by `hasTriedTrimmedSource` (once per mount) and reset when the cell recycles onto a different `video.source`.

### 4.3 Watchdog / self-healing reload (`utils/videoWatchdog.ts`)
Applies to the **inline feed `Video`** component only. Purpose: iOS can momentarily exceed its real hardware AVPlayer-decoder ceiling during a fast fling (decoders aren't freed synchronously), producing a player that never reaches `readyToPlay` even though the registry's logical live-player count is under its own cap.

- **Arms** (`shouldArmReloadWatchdog`) when: a player + resolved source both exist, `resolveStatus === "ready"`, `playerStatus !== "readyToPlay"`, and fewer than **`MAX_RELOAD_ATTEMPTS = 3`** reloads already attempted for this mount.
- **Delay** before firing: `nextReloadDelayMs(attempts) = 2000 + attempts*1000` ms — i.e. 2s, 3s, 4s for successive attempts (backs off so a genuinely dead source doesn't thrash).
- On fire: re-checks live status is still not ready (and the fullscreen viewer doesn't currently own the player) — if still stuck, calls `player.replace(cachedSource)` + `player.play()` and increments the attempt counter. A successful `readyToPlay` transition resets the attempt counter to 0.
- If the underlying registry entry was released mid-timer (cell scrolled far off-screen), the `replace` call is wrapped in try/catch and silently ignored — the next mount gets a fresh player.

### 4.4 Overlay / loading-state presentation (`utils/videoOverlayState.ts`)
A single deterministic state machine (unit-tested, pure) decides what the black overlay tile shows over `<VideoView>`, applied identically in feed `Video.tsx` and (a parallel, slightly different implementation of the same idea) `MediaVideo.ios.tsx`:

Priority order (first match wins):
1. `resolveStatus === "error"` → **"Couldn't load video. Tap to retry."**, tappable (retries the Redgifs resolution).
2. `playerStatus === "error"` → **"Couldn't load video."**, not tappable (terminal; only a source swap via the watchdog/stale-cache path can recover it, not a direct user tap in this state — inline feed view; the fullscreen viewer's equivalent state IS tap-to-retry, see §8.2 discrepancy note below).
3. **Readiness short-circuit**: if `isPlaying || currentTime > 0 || playerStatus === "readyToPlay"`, the overlay is **hidden**, unconditionally — this is the fix for the historical "black box covers a playing video" bug where a shared/recycled player's `statusChange` event was missed. This check always wins over any "still loading" state below.
4. `resolveStatus === "loading"` → **"Resolving video…"** (Redgifs API call in flight), with spinner.
5. `!hasPlayer` → **"No player available"**, with spinner (transient; player creation is async).
6. Watchdog actively mid-retry (`0 < reloadAttempts < MAX_RELOAD_ATTEMPTS`) → **"Stalled — retrying (N/3)"**, with spinner.
7. Otherwise → generic **"Loading video…"**, with spinner.

The critical design point: readiness is judged from **live getters** (`player.playing`, `player.currentTime`, `player.status`) re-read synchronously on every mount/recycle, not from a mirrored event stream alone — because a shared player attached to a *new* cell after FlashList recycling may already be mid-playback with its `loading→readyToPlay` transition long past, so no future event will ever fire to clear a naive "waiting for statusChange" flag.

---

## 5. Shared video player registry (`utils/VideoPlayerRegistry.ts`, `contexts/VideoPlayerRegistryContext.tsx`)

One process-wide registry, keyed by the video's **pre-resolution source URL** (i.e. the Redgifs watch URL itself for Redgifs videos, not the resolved mp4 — the key stays stable across resolution). Every `VideoView` anywhere in the app that wants to show a given video — feed inline, fullscreen viewer, gallery-mode grid cell — **attaches to the same single player instance** rather than creating its own.

- **`acquire(key)`**: returns the existing player if present (increments ref count, cancels any pending deferred release, bumps LRU clock), otherwise evicts if at cap and creates a new one via the registry owner's `createPlayer` callback (set once per app in `VideoPlayerRegistryProvider`, always sets `player.preservesPitch = true` on creation — Android's expo-video defaults this to `false`, which would otherwise pitch-shift audio at non-1x playback rates).
- **`release(key)`**: decrements ref count; at 0, schedules (`setTimeout(fn,0)`) a **deferred** actual release — cancelled if re-acquired before the tick fires. This bridges the brief unmount→remount gap during a tap-to-open-viewer transition or an orientation-triggered remount, so those transitions never destroy-and-recreate the player (no reload, playback position preserved).
- **`peek(key)`**: read-only lookup without acquiring/ref-counting — used by the fullscreen viewer's double-tap-to-play/pause, which wants to control a player some other component (the row's `MediaVideo`) already owns.
- **Cap**: `DEFAULT_MAX_LIVE_PLAYERS = 12`. Reasoning documented in-code: iOS silently fails to decode (permanent black tiles) above roughly ~16 simultaneous `AVPlayer`s; 12 stays safely under that while remaining above the realistic number of video cells FlashList could have mounted at once (viewport + `drawDistance`) in a dense all-video feed — critical because eviction only ever reaps **idle** (refCount 0) entries, so the cap must never sit below the on-screen cell count or an LRU eviction could reap a still-visible player.
- **Eviction** (`evictIfOverCap`, runs before every *new* player creation, not just once per over-cap event): loops reaping the least-recently-used idle (refCount 0) entry until there's room for one more, because a single fast fling can leave several deferred-release entries simultaneously idle — reclaiming only one per acquire would let the real live count creep past the cap.
- Per-surface attach-time configuration differs (not creation-time): feed attaches muted with a small buffer cap (`maxBufferBytes: 5MB`, Android-only setting, listed for parity); the fullscreen viewer attaches unmuted-per-setting with tight `seekTolerance` (±0.1s) and forces `audioMixingMode: "doNotMix"` to reliably activate the iOS audio session immediately (letting the feed's `"mixWithOthers"` mode linger caused audio to start late or drop after a seek).
- With focused-only feed playback (§7), live player count during normal browsing is typically 1–2 (the Focused Post, plus possibly one still-deferred-releasing neighbor), so the 12-cap is now a safety net rather than a hot path (per ADR 0003 / spec doc — no explicit "preload next" speculative acquisition was found implemented in the read files, only mentioned as a future consideration).

---

## 6. Gif handling

Two entirely distinct code paths, both referred to informally as "gifs":
1. **Actual animated `.gif` image files** — part of `post.images[]`, rendered by `expo-image` (`Image` with an animated GIF source) exactly like a static image. They animate automatically regardless of feed video-focus state, are zoomable/pannable exactly like any other image in the fullscreen viewer (§3), and are explicitly excluded from all video-focus/pause logic — an animating gif image never pauses when scrolled off-screen or when another video gains "Focused Post" status (ADR 0003 explicitly calls this out).
2. **"GIF" that is actually an mp4** (Reddit's own re-encoded "GIF" posts, `preview.images[].variants.mp4`, and third-party mp4-as-gif hosts like Imgur `.gifv→.mp4` and gfycat) — these are `videos[]` entries and go through the **entire** video pipeline described in §4/§5/§7/§8: shared player registry, watchdog, focused-only playback gating, loop=true, mute rules, etc. There is no dedicated silent/loop-only "gif mode" player — a Reddit "gif" post behaves identically to any other muted, looping video post.

---

## 7. Feed inline video (`components/RedditDataRepresentations/Post/PostParts/PostMediaParts/VideoPlayer.tsx` wrapping `components/UI/Gallery/Video.tsx`)

### 7.1 Focused-only playback (ADR 0003, spec `docs/specs/02-focused-video-playback.md`, logic in `utils/FeedVideoFocus.ts`)
At most **one** feed video plays at a time app-wide: the **Focused Post** — the center-most video post on screen once scrolling has settled. This is a deliberate departure from "every mounted cell autoplays muted."

- **Poster vs. player**: a non-focused video post (`VideoPlayer.tsx`, `dontRender` true) renders *only* its post's thumbnail image (`ImageViewer` reused as a static poster) with a semi-transparent centered play-circle icon overlay — **no `<VideoView>`, no player attachment at all** for off-focus cells. Tapping it (like tapping any video) opens the fullscreen viewer directly (bypassing the need to ever have played inline).
- Becoming focused: a player is acquired/attached; the poster stays visible (layered under the diagnostic overlay, `Video.tsx`'s `poster` prop) until the player reports a real decoded frame for the *correct* source (readiness gate from §4.4), then the poster+overlay disappear, revealing the video. This crossfade-via-overlay-removal prevents a stale/mismatched frame ever being user-visible, and structurally fixes a historical "shows the previous post's still-playing video" recycling bug.
- Losing focus: player detaches (registry `release`), poster returns, playback position is remembered (`rememberPlaybackPosition`, an in-memory `Map<videoKey, seconds>` capped at **200 entries**, LRU-evicted) independent of player lifetime.
- Regaining focus: **always resumes** from the remembered position (re-seeks after re-acquiring, even if the player itself was evicted and recreated in between) — never restarts from 0, guarded by `hasRestoredPosition` so it only seeks once per (player, video.source) pair and only when the player is fresh (`currentTime < 0.05`).
- **Visibility thresholds** (`FOCUS_ITEM_VISIBLE_PERCENT = 70`, `FOCUS_VIEWPORT_COVERAGE_PERCENT = 60`): a video post is eligible to *become* Focused only when either ≥70% of the post itself is on screen, or (for a post taller than the viewport) it covers ≥60% of the viewport — two separate FlashList viewability configs whose union feeds the decision. **Stopping is more lenient than starting**: a post that's already Focused keeps focus as long as *any* pixel of it remains on screen and no other mostly-visible candidate has appeared — so a small scroll nudge doesn't flip a playing video back to its poster.
- **Center-most selection** (`pickCenterMostVideo`): among all currently eligible video posts, picks the one whose index is closest to the midpoint of the full viewable-index range.
- **Immediate release**: if the currently-focused video scrolls completely off-screen (not even partially visible), focus is released *immediately* (`releaseNow`), not after the settle debounce, so its audio can't keep playing after it's gone.
- Settle debounce: ~150ms of viewport stability per the spec doc (tunable 100–200ms) before a *new* focus candidate is committed — during a fast fling, nothing is Focused and nothing plays.
- Surfaces outside a focus-managed feed (post detail page, Gallery Mode, the fullscreen viewer itself) don't provide `FeedVideoFocusContext` (defaults `false`), so their videos behave as **always-focused** — i.e. every video in Gallery Mode's grid or a post's own detail page plays inline immediately once mounted, with no poster gating.

### 7.2 Autoplay / mute / audio settings interplay
Three independent MMKV-persisted booleans (`PostSettingsContext`, all default shown):
- **`autoPlayVideos`** (default `true`) — global. When `false`, or when `currentDataMode === "lowData"` (§11), the inline player never mounts at all regardless of focus — every video post shows the static poster + play icon, full stop, everywhere in the feed.
- **`feedVideoAudio`** (default `false`) — whether the Focused Post plays with sound. Toggled via a floating action button (FAB), not just a settings row.
- **`tappedVideoAudio`** (default: **follows `feedVideoAudio` until the user has explicitly set it once**, then sticks independently — `storedTappedVideoAudio ?? feedVideoAudio`) — controls audio for videos opened by tapping into the fullscreen viewer. Once the user toggles the mute button inside the fullscreen viewer, that value is persisted and thereafter takes precedence over `feedVideoAudio` for all future tapped-open videos, even if `feedVideoAudio` later changes.
- Effective inline audio = `focusManaged && isFocused && feedVideoAudio` (i.e., audio is only ever possible for the single currently-Focused feed video, and only if the feed-audio FAB is on).
- **Audio session behavior when ON**: per spec doc, sound **interrupts** background audio (Spotify etc. — standard iOS "do not mix" behavior, not ducking) and plays **even with the hardware silent switch engaged** (an explicit "I want sound" signal). Implemented via `player.audioMixingMode = "doNotMix"` when `audioEnabled`, else `"mixWithOthers"`.
- **When OFF**: fully muted (`player.muted = true`), mixes with other audio (doesn't interrupt).
- `player.loop = true` always, for every feed video (looping, like a gif).

### 7.3 FABs (`components/UI/FeedVideoFABs.tsx`)
Two floating round buttons, bottom-right, stacked vertically, positioned just above the tab bar (`tabBarHeight - TAB_BAR_REMOVED_PADDING_BOTTOM + 20`), semi-translucent (`opacity: 0.9`) with a subtle iOS-style drop shadow:
1. **Autoplay** (top) — `play-circle` (on) / `pause-circle` (off) icon, toggles `autoPlayVideos`. Always shown on feed pages.
2. **Audio** (bottom) — `volume-2` (on) / `volume-x` (off), toggles `feedVideoAudio`. **Only rendered when `autoPlayVideos` is on** (no feed video ever plays with autoplay off, so there's nothing to un-mute). Each press triggers a `hapticSelection` haptic. Both mirrored as toggle rows in Settings → Appearance for discoverability. Both persist across app launches (MMKV).

### 7.4 Other inline-feed video behaviors
- **App backgrounding**: the entire video subtree is wrapped in `DismountWhenBackgrounded`, which fully **unmounts** (not just pauses) all video components the instant `AppState` reports `"background"`, replacing with a same-size loading spinner placeholder, and remounts on foreground. This means: **no background audio and no Picture-in-Picture support** — video playback simply stops (the registry's ref-count-based release/pause-on-unmount cleanup runs) the moment the app is backgrounded, full stop.
- **Playback position** on unmount (focus lost / scrolled away / backgrounded): remembered via `rememberPlaybackPosition` and the player is explicitly muted+paused (unless the fullscreen viewer currently owns it) so a refcount-0-but-not-yet-reaped player doesn't keep silently (or audibly, if feed audio was on) playing in the background.
- **Multiple videos in one post** (a video gallery): only `post.videos[0]` participates in focus/poster gating in the feed cell (`VideoPlayer.tsx` uses `post.videos[0]` for the focus key) — the feed cell shows a `"N VIDEOS"` badge (bottom-right) when `post.videos.length > 1`, and tapping opens the fullscreen viewer with all of that post's videos as a horizontally-pageable row.
- **Progress bar**: a 2px bar along the very bottom of the video, animated via `progress.setValue(currentTime/duration)` on every `timeUpdate` event (throttled to `timeUpdateEventInterval = 1/15`s ≈ every ~67ms). No scrub/seek interaction on the inline feed player — scrubbing only exists in the fullscreen viewer (§8.1).
- **No playback-rate control, no explicit play/pause button, no mute button** on the inline feed tile itself — the entire tile's tap target opens the fullscreen viewer; all playback controls live there.

---

## 8. Fullscreen video viewer (`MediaVideo.ios.tsx`)

Unlike the feed, the fullscreen viewer's videos are **always eligible to play** (no focused-only poster gating) — opening it immediately attaches/creates the shared player for the current item and (if it's the initially-focused column/row) starts playback.

### 8.1 Controls & gestures
- **Tap** anywhere: toggles the post overlay + controls chrome (§2.4), unless it's a middle-zone double-tap (play/pause) or a side-zone double-tap (page gallery).
- **Center play/pause button**: large circular translucent button, shown/hidden with the rest of the chrome (`overlayOpacity`), press toggles `player.play()`/`.pause()`. Icon swaps play↔pause (FontAwesome).
- **Scrub bar**: touch-and-drag anywhere on the video surface (not a separate slider widget) scrubs the current video:
  - Skim is only engaged once a horizontal drag exceeds **20pt** while vertical movement stays under **30pt** (`Math.abs(deltaX) > 20 && Math.abs(deltaY) < 30`) — this disambiguates a horizontal scrub from a vertical dismiss/page-post gesture.
  - On engaging skim: `player.scrubbingModeOptions = { scrubbingModeEnabled: true }`, pauses playback, and locks the enclosing scroll (`setIsScrollLocked(true)`) so the drag doesn't also page.
  - While skimming: `currentTime = startTime + deltaX / (width / duration)` — i.e. dragging across the full screen width scrubs through the entire video duration; updates are throttled to one `requestAnimationFrame` at a time (cancels any pending frame before scheduling the next).
  - On release: if playback was playing before the skim started, resumes `player.play()`; scrubbing mode is turned back off; scroll lock released.
  - A visible 2px progress bar along the bottom mirrors `currentTime/duration` continuously (also present without any interaction, as a passive progress indicator).
- **Mute/audio toggle**: top-left pill (with the playback-rate button, in one row, `top: safeAreaTop+10, left: safeAreaLeft+10` — deliberately **not** top-right, because that's where PostOverlay's close button sits and it would otherwise swallow taps since PostOverlay's z-index is above the video content). Icon `volume-2`/`volume-x` (Feather), toggles `tappedVideoAudio` (persisted globally, see §7.2 interplay).
- **Playback speed**: button cycling through **`[0.5, 1, 1.5, 2]`** (wraps back to 0.5 after 2x), label shows current multiplier (e.g. `"1.5x"`). Sets `player.preservesPitch = true` on every change (prevents chipmunk-voice pitch-shift at >1x — Android's expo-video defaults this false, forced true defensively on every rate change here even though the registry also sets it once at creation).
- **Loop**: `player.loop = true` (set on creation, same as feed).
- **Rotation**: device rotation is unlocked while the viewer is open (§2.1); the video's `<VideoView contentFit="contain">` reflows to the new dimensions; the shared player (not tied to a specific `VideoView` instance) survives rotation with no reload, per the registry design (§5) — the aspect-ratio-fit container height is computed as `Math.min(height, width/aspectRatio)`, where `aspectRatio` comes from `player.videoTrack.size`.
- **Picture-in-Picture**: no PiP entry point/button found anywhere in the codebase; `VideoView` is used with only `contentFit`, `nativeControls={false}`, `allowsVideoFrameAnalysis={false}` props — no `allowsPictureInPicture` prop is set, so PiP is not enabled.
- **Background audio**: none — same `DismountWhenBackgrounded` wrapper applies to the fullscreen viewer's video too, so backgrounding the app stops playback entirely (see §7.4).

### 8.2 Audio activation on entering fullscreen
On becoming `focused` (the active row+column in the viewer): forces `player.audioMixingMode = "doNotMix"` (even if the feed left it `"mixWithOthers"`, which was found to cause iOS's audio session to activate late or drop after a seek/reopen), sets `player.muted = !tappedVideoAudio`, `player.play()`, `player.volume = 1`. On losing focus (scrolled to a different item/post inside the viewer, still open): hands back `audioMixingMode = "mixWithOthers"`, pauses, `player.volume = 0` (returns control to the feed's own mixing rules for when the viewer closes).
- **First-open special case**: if the feed had autoplay off, there is no pre-existing shared player when a video is tapped open — the *creation-time* `configure` callback in `MediaVideo.ios.tsx` itself starts playback (muted per `tappedVideoAudio`, `doNotMix`) immediately if the item is the initially-focused one, rather than waiting for the focus `useEffect` to run after mount.

### 8.3 Loading / error states (fullscreen-specific nuance vs. §4.4)
- `resolveStatus === "error"` (Redgifs failed): full-screen black tile, **"Couldn't load video. Tap to retry."**, tap calls `retry()`. This exact state is checked and rendered even before a player exists (the outer `MediaVideo` wrapper returns this without ever calling `useSharedVideoPlayer`).
- No player yet (still being acquired): centered spinner only, no text.
- Once a player exists, `MediaVideoContent` re-derives status from *live* getters on every (re)mount for the same reason as §4.4 (shared/recycled player race), and renders, in priority order: resolve-error (retry) → resolve-loading (spinner) → hard player `error` (message only, **no explicit tap-to-retry affordance rendered for a hard player error here** — differs slightly from the Redgifs stale-cache auto-recovery path, which fires automatically in a `useEffect` without user action) → not-yet-visually-ready (`isVideoVisuallyReady`, same three-way OR check as §4.4) → spinner → nothing (video showing).
- **Stale Redgifs cache bust**: identical mechanism to §4.1's last paragraph, implemented independently here (`hasBustedStaleCache` ref) since this is a separate component tree from the feed's `Video.tsx`.

---

## 9. Download / Share / Save flows (`utils/useMediaSharing.tsx`)

Two entry points exist, both funnelling through the same private `useMediaDownload()` hook:
- **`useMediaSharing()`** → `(type, mediaSource) => Promise<void>` — download then `Share.share({ url: file.uri })` (the native iOS share sheet).
- **`useMediaSaving()`** → `(type, mediaSource) => Promise<void>` — requests `MediaLibrary.requestPermissionsAsync(true)` (the **add-only** permission variant, so Hydra never needs full photo-library read access) and, if granted, downloads then `MediaLibrary.saveToLibraryAsync(file.uri)` directly, skipping the share sheet.

### 9.1 Common download mechanics
- `getMediaURL(mediaSource)`: a plain string source is used as-is; an `ImageSource[]` array uses the **last (highest-resolution)** entry's `.uri`. For video, callers always pass `videoDownloadURL` (never the possibly-HLS `source`) — the OS media pipeline / share sheet needs a direct file, not a streaming playlist.
- Guarded against double-invocation (`alreadyAsking` ref) — a second tap while a download is already in flight is a no-op.
- Shows a small centered modal, **"Preparing Image..."** / **"Preparing Video..."** with a spinner, dismissible by tapping the scrim (which does not cancel the in-flight download, just hides the modal).
- Download: `downloadToCache` derives a filename from the URL's base path (last path segment, so extension is whatever the source URL uses — `.jpg`/`.png`/`.mp4`/`.gif` etc. are preserved as-is; **no HEIC conversion or format normalization is performed** — if the source is an mp4, it's shared/saved as mp4; if a `.gif`, as `.gif`), writes into the app's cache directory (`Paths.cache`), overwriting any stale file of the same name first, via `File.downloadFileAsync`.
- After the consumer callback (`Share.share` or `MediaLibrary.saveToLibraryAsync`) completes (success or throw), the cached file is always deleted (`finally { file.delete() }`) — nothing lingers in cache beyond one operation.
- On any error (download failure, permission denial after grant-check, etc.), the modal is dismissed and an `Alert.alert("Error", "Failed to {share|save} {image|video}")` is shown.
- **Save success**: `Alert.alert("Image saved to Photos")` / `"Video saved to Photos"`.
- **Save permission denial**: `Alert.alert("Can't save to Photos", "Allow Hydra to add to your photo library in Settings to save media.")`, no further action (no deep-link to Settings).

### 9.2 Where these are exposed
- **Fullscreen viewer**: single share button in `PostOverlay` (§2.5) — shares only, no direct "save" button inside the viewer (saving from there happens by picking "Save Video"/"Save Image" from the resulting native share sheet, which is a standard iOS share-sheet action for image/video file types, not an app-defined menu item).
- **Feed-level image long-press** (`ImageViewer.tsx`, §3.4): explicit **Share Image** / **Save Image** / **Copy Image Link** menu — the only place all three actions coexist as a single long-press menu.
- **No equivalent long-press menu exists on the feed's inline video tile or on Gallery Mode's video grid cell** — no `NativeContextMenu` wraps either `Video.tsx` usage. Video download/share/save is reachable only via the fullscreen viewer's overlay share button.
- A post's own long-press context menu (`PostComponent.tsx`, outside this survey's core area) has a generic **"Share"** action, but it shares the **post's permalink** (`shareURL(post.link)`), not the media file — it is unrelated to the media-file share/save flow above.

### 9.3 `shareURL.ts` (link sharing, for context/cross-reference)
Used for sharing post/comment/subreddit *links* (not media files): on iOS, `Share.share({ url })` (uses iOS's rich link-preview share sheet); on Android, `Share.share({ message: url })` (Android silently drops the `url` field, so the link must go in `message` there). This is unrelated to media file sharing (§9.1) but documented here since `documentation/sharing.md` conflates both under "Sharing."

---

## 10. Gallery Mode (`pages/GalleryPage.tsx`, `components/UI/Gallery/GalleryComponent.tsx`, `app/stack/GalleryScreen.tsx`)

A dedicated full-screen page (pushed via `GalleryScreen`, title = the source URL's page name) that re-fetches the same underlying post listing as a normal feed but renders it as a media grid instead of a post list.

### 10.1 Data / qualification
- Reuses `useRedditDataState` with the exact same URL, sort, and filter pipeline as a normal subreddit/home/multireddit page, but layers on `filterNonMediaItems` (drops any post with zero images AND zero videos — `api/../utils/filters/filterNonMediaItems.ts`) as the first filter, before "hide seen," text filters, and (for combined-subreddit feeds) subreddit filters. **AI filters are explicitly documented as not applying** in Gallery Mode (`documentation/gallery_mode.md`).
- `limitRampUp: [10, 30, 50]`, `filterRetries: 3` — standard progressive-load-and-retry-if-filtered-too-much pattern shared with normal feeds.
- Sort/context menu options mirror the normal page's options for the same page type (Home/Subreddit/Multireddit), still available via the header's sort-and-context button.
- Per `documentation/gallery_mode.md`: free users are capped at 100 posts in Gallery Mode, removed by Hydra Pro — **no such cap was found implemented in `GalleryPage.tsx`/`GalleryComponent.tsx`/`useRedditDataState`**; this may be enforced elsewhere (monetization/paywall logic outside this survey's files) — flagged as unverified in Open Questions.

### 10.2 How it's offered / entered (`utils/useOfferGalleryMode.ts`)
- **Manual entry**: "..." context menu → "Open in Gallery Mode" on subreddit, home, and multireddit pages (per docs; the actual menu wiring lives in `pages/PostsPage.tsx`, outside this file's direct reading but referenced).
- **Automatic offer** (one-time, MMKV-flagged `has_already_offered_gallery_mode` — shown at most once ever across the app's lifetime): fires from an effect keyed on `posts.length >= 100` whenever a feed page's loaded post count first crosses:
  - `MIN_POST_COUNT_TO_OFFER_GALLERY_MODE = 100` posts loaded, AND
  - not a combined-subreddit feed (multi-subreddit views are excluded), AND
  - at least **85%** (`PERCENT_OF_MEDIA_TO_OFFER_GALLERY_MODE = 0.85`) of those loaded posts have `images.length>0 || videos.length>0`.
  - Presents `Alert.alert("Try Gallery Mode?", "Media heavy subreddits look great in gallery mode. Would you like to try it out?", [Cancel, Open])`. "Open" sets the flag (so it never offers again, regardless of outcome), navigates to gallery mode (`openGallery(url)`), and then shows a *second* informational alert: `"Gallery Mode" / "You can open gallery mode any time with the ... menu button in the top right corner of subreddit pages."`. "Cancel" does not set the flag... actually it does set nothing, but the effect dependency is `posts.length >= 100` (a boolean), so the offer effect only re-fires if that boolean transitions again, meaning a "Cancel" on one page won't re-prompt again within that page's session but could still show on a different qualifying subreddit later (since the flag is only set on "Open") — **note**: because the flag is only persisted on "Open," declining ("Cancel") does not permanently suppress the prompt; it can reappear on a different subsequent qualifying feed.

### 10.3 Grid layout & scrolling
- Two-column (`numColumns: 2`) **masonry** `FlashList` (`masonry: true, optimizeItemArrangement: true`), `drawDistance: 200`.
- Flattens every qualifying post's media into individual grid cells: a video-only post contributes one cell per video, an image-only post one cell per image (never both from the same post — `videos` still takes priority if present, mirroring the single-post rendering rule).
- Each cell's aspect ratio uses the **parent post's** `mediaAspectRatio` (not a per-image individual ratio) for sizing: `width = contentWidth/2`, `height = width / mediaAspectRatio`.
- Cell content: an `Image` (contentFit `"contain"`, `autoplay: false`, and on iOS specifically `allowDownscaling: false` — downscaling was found to cause glitchy scroll performance from heavy CPU use, at the cost of higher memory; Android does downscale) for images; the shared `Video` component (§4/§7, but here `focusManaged` is `false` since Gallery Mode doesn't provide `FeedVideoFocusContext` — so **every video cell plays immediately and simultaneously** once mounted/on-screen, muted, no focused-only gating) for videos.
- **NSFW/spoiler blur**: **no blur logic exists in `GalleryComponent.tsx`** — grid cells render their raw image/video thumbnail directly with no NSFW/spoiler check, unlike the normal feed's `PostMedia.tsx` (§ below). This is a notable behavioral gap relative to the normal feed and is flagged in Open Questions.
- **Loading more**: `onEndReachedThreshold: 2`, calls the shared `loadMore()`; footer shows a spinner while loading (unless `hitFilterLimit`), `"Wow. You've reached the bottom."` text once `fullyLoaded` and posts exist, or a filter-limit-reached explanatory message if the filter pipeline couldn't find enough qualifying posts.

### 10.4 Opening the fullscreen viewer from the grid
Tapping a cell calls `displayMedia({ media: viewerMedia, initialIndex: <flat grid index>, getCurrentPost: getCurrentPostRef, onFocusedItemChange })`, where:
- `viewerMedia` is the **per-post** grouping (one row per post, so paging vertically in the viewer still moves post-to-post, and horizontally moves within one post's own gallery items) — distinct from the flat `galleryMedia` used for the grid's individual cells.
- `getCurrentPostRef` is a ref (not a plain closure) specifically so that as the user pages deeper in the viewer and the underlying `posts` array grows (more loaded via infinite scroll), the viewer's `PostOverlay` always reflects the *current* render's `posts`, not a stale snapshot from when the viewer was opened.
- `onFocusedItemChange` scrolls the grid's own `FlashList` to keep the grid's scroll position in sync with whatever item the user pages to inside the fullscreen viewer (so closing the viewer returns to a grid scrolled to the right spot) — this is why the grid, unlike a normal feed's, must recycle cells onto the exact video the fullscreen viewer might be actively playing (`Video.tsx`'s comments call this out explicitly as the reason it must never touch playback/mute state while `isViewerShowing`).

---

## 11. Low Data Mode (`contexts/SettingsContexts/DataModeContext.tsx`, `documentation/data_use_settings.md`)

Two independent MMKV-persisted settings, `dataModeSettings.wifi` and `dataModeSettings.cellular`, each either `"normal"` or `"lowData"` (both default **`"normal"`**), auto-selected by `NetInfo`'s live connection type (`currentDataMode`). Default overall context value (before any connection detected) is `"lowData"` as a conservative initial value before the first `NetInfo` callback fires.

Effects specific to media (per docs, cross-referenced against code read in this survey):
- **Videos**: `autoPlayVideos`-gated inline playback is additionally suppressed whenever `currentDataMode === "lowData"` (`VideoPlayer.tsx`'s `dontRender` check includes `currentDataMode === "lowData"` alongside the explicit autoplay-off and non-focused conditions) — every video shows its poster + play icon; tapping still opens the fullscreen viewer (which always loads regardless of data mode — no low-data gating was found inside the fullscreen viewer itself).
- **Images**: `ImageViewer.tsx` reads `currentDataMode` at mount into `loadLowData` state — while `true`, only **1** image is shown instead of up to 2 (`numImgsToDisplay = loadLowData ? 1 : min(2, images.length)`), and that one image is loaded at its **lowest** resolution variant (`[img[0]]`, the smallest entry) instead of the full array. The moment the image is tapped to open the fullscreen viewer, `loadLowData` is forced `false` for that cell (so the full array/resolution is used from then on for that recycled cell instance) — i.e. low-data mode is a *feed-scroll-time* thumbnail optimization only, not a permanent cap; opening any image always fetches full quality.
- **Link previews**: `Link.tsx` skips rendering the `og:image` cover entirely (`currentDataMode === "normal"` gate) while still showing title/description/URL text.
- **Subreddit icons**: mentioned in docs as also gated; not part of this survey's file set (icons load elsewhere).
- Switching data mode is fully automatic based on live network type; there is no manual toggle to force one or the other regardless of connection — only the per-connection-type default can be configured.

---

## 12. Media caching

### 12.1 Image cache (`utils/ImageCache.ts`)
- Backed by `expo-image`'s native disk+memory cache (SDWebImage under the hood on iOS, hence the literal on-disk path `com.hackemist.SDImageCache/default` under the app's cache directory, used only for size measurement).
- Configured (iOS only) at module load: **512MB** max disk (`MAX_DISK_CACHE_SIZE`), **256MB** max memory cost (`MAX_MEMORY_CACHE_SIZE`, despite a comment mislabeling it "128MB").
- On OS memory-pressure warning (`AppState` `"memoryWarning"` event), the in-memory image cache is proactively cleared (disk cache untouched).
- **Clear Cache setting**: `ImageCache.clearCache()` calls `Image.clearDiskCache()` and (by default) shows a confirming alert "Cache Cleared / The image cache has been cleared." A `useCache()` hook reports the current on-disk cache size (recomputed whenever the settings screen using it regains focus) for display in Settings, and exposes a `clearCache` that also resets the displayed size to 0 immediately.
- No manual eviction policy beyond the native LRU-style disk/memory caps above (no app-level size tracking or custom eviction).

### 12.2 Video cache (`utils/VideoCache.ts`)
- Backed by `expo-video`'s native disk cache, capped at **1GB** (`MAX_VIDEO_DISK_CACHE_SIZE`), set once at module load via `setVideoCacheSizeAsync`.
- **Cacheability is per-source**, decided in `makeCachedVideoSource(uri)`: **not cached** (`useCaching: false`, player fetches directly, relies on server `Content-Type`) for any URL whose path ends in `.m3u8` (HLS playlists — inherently not cacheable as a single file) or `.gif` (Reddit sometimes serves an actual mp4 transcode behind a `.gif`-suffixed path, e.g. `preview.redd.it/<id>.gif?format=mp4`; caching would persist the mp4 bytes under a `.gif` extension, and AVFoundation would then fail to decode the cached file — permanent black-box bug this guard prevents). Every other source (plain `.mp4` DASH fallbacks, Redgifs resolved URLs, Imgur/gfycat mp4s) is cached normally.
- **Clearing the video cache cannot happen while any video component is mounted** (native constraint) — so "clear video cache" is a **deferred, restart-required** action: `requestCacheClear()` just sets an MMKV flag (`videoCacheClearRequested`) and shows `Alert.alert("The video cache will be cleared next time you restart Hydra.")`; the actual `clearVideoCacheAsync()` call happens on next app launch, in `clearCacheIfRequested()` (presumably invoked during startup, before any video mounts — call site not in this survey's file set), which then clears the flag regardless of success/failure (wrapped in a swallowed try/catch).

---

## 13. Setting keys summary (media-relevant, `PostSettingsContext` unless noted)

| Key (MMKV) | Type | Default | Effect |
|---|---|---|---|
| `autoPlayVideos` | bool | `true` | Global: whether feed videos ever mount a player inline. Off → every feed video shows poster+play-icon only. |
| `feedVideoAudio` | bool | `false` | Whether the Focused feed video plays with sound (via FAB or Settings row). Interrupts background audio + plays through silent switch when on. |
| `tappedVideoAudio` | bool | follows `feedVideoAudio` until first explicit toggle, then sticky | Audio for videos opened into the fullscreen viewer (feed-tap or otherwise). |
| `liveTextInteraction` | bool | `false` | Documented to gate iOS Live Text on images; setting exists and is toggleable in Settings but **not consumed by any image-rendering component found** (see Open Questions). |
| `blurNSFW` | bool | `true` | Blurs post media (`PostMedia.tsx`) for `post.isNSFW` until tapped to reveal. **Not applied in Gallery Mode grid.** |
| `blurSpoilers` | bool | `true` | Same mechanism as above, for `post.isSpoiler`. **Not applied in Gallery Mode grid.** |
| `linkDescriptionLength` | number | `10` | Max lines of an OpenGraph link-card description; `0` hides the description entirely. |
| `tapToCollapsePost` | bool | `true` | Not media-specific but affects whether tapping post content (incl. media area padding) collapses the post — listed for completeness since it's in the same context. |
| `dataModeSettings.wifi` / `.cellular` (`DataModeContext`, key `dataMode`) | `"normal"` \| `"lowData"` | both `"normal"` | Per-connection-type low-data behavior; §11. |
| `has_already_offered_gallery_mode` (`KeyStore`, not `PostSettingsContext`) | bool | unset | One-time flag suppressing the automatic Gallery Mode offer alert forever once "Open" is chosen. |
| `videoCacheClearRequested` (`KeyStore`) | bool | unset | Deferred flag for clearing the video cache on next launch. |
| `redgifsToken` (`KeyStore`) | string | unset | Cached Redgifs temporary auth token. |

---

## Open questions / ambiguities

1. **Live Text is not actually wired up.** `liveTextInteraction` is a fully-built, persisted, Settings-exposed toggle, and `documentation/live_text.md` describes rich behavior (select/copy/translate/lookup on recognized text, longer long-press hold when enabled), but no code in `MediaImage.ios.tsx`, `ImageViewer.tsx`, or anywhere else reads this setting or configures any Live Text/VisionKit/ImageAnalyzer API. Either (a) it's implemented via a default-on native behavior of the underlying `expo-image`/`UIImageView` that this setting was meant to gate but the gating code was never wired, (b) it's dead/aspirational, or (c) it lives in native module code not present in this JS/TS survey. A Swift rewrite should treat the documented behavior as the intended spec but flag this for product confirmation.

2. **Gallery Mode's documented 100-post free-tier cap** (with Hydra Pro removing it) was not found implemented anywhere in `GalleryPage.tsx`, `GalleryComponent.tsx`, or `useRedditDataState`. It may be enforced by monetization/paywall logic in files outside this survey's assigned scope — flag for the Pro/monetization area's survey to confirm and for cross-referencing.

3. **Gallery Mode applies no NSFW/spoiler blur** to grid thumbnails, unlike the normal feed's `PostMedia.tsx`. This is either an intentional simplification (docs don't mention blur in Gallery Mode at all) or an overlooked gap — worth explicit product confirmation before the Swift rewrite decides whether to replicate the omission or add blur for parity/safety.

4. **`documentation/downloading_media.md`'s "long-press the video → Share from a context menu → Save Video in the share sheet"** does not match the actual code path found: there is no long-press context menu on any video tile (inline feed or Gallery Mode); video download/share is only reachable via the single share icon inside the fullscreen viewer's `PostOverlay`, which immediately opens the OS share sheet (no intermediate app-drawn context menu). The doc's phrasing may be describing the OS share sheet's own native "Save Video" action for a shared video file (which *is* accurate) but conflates it with a long-press "context menu" step that isn't a Hydra-drawn menu the way the equivalent image flow is. Confirm intended UX before replicating literally.

5. **Speculative next-player preloading** for the fullscreen viewer / focused-video handoff is mentioned as a "consider" in `docs/specs/02-focused-video-playback.md` but no implementation of acquiring the *next* likely-focused video's player ahead of time was found in `VideoPlayerRegistry.ts`, `Video.tsx`, or `FeedVideoFocus.ts`. Treat as not implemented.

6. **A hard `playerStatus === "error"` in the fullscreen viewer's `MediaVideo.ios.tsx`** renders a plain message with no visible tap-to-retry affordance (unlike the feed's `Video.tsx`, whose overlay-state machine also treats `playerError` as non-tappable but at least the Redgifs-specific stale-cache auto-bust runs automatically in the background for both). A user facing a genuine non-Redgifs hard player error in the fullscreen viewer currently has no manual recovery action beyond closing and reopening the viewer — confirm whether this is intended or a gap to fix in the rewrite.

7. **Rotation lock and Picture-in-Picture**: confirmed absent (no PiP prop set on `VideoView`, no rotate/orientation-lock button in the viewer's own UI — device rotation is simply unlocked globally while the viewer is open and follows physical device rotation). Confirm this matches product intent for the Swift rewrite, since iOS's native `AVPlayerViewController` offers PiP "for free" and a rewrite might be tempted to add it — that would be a deliberate behavior change from current Hydra, not a parity port.

8. **Exact settle-debounce value for Focused Post determination** (~100-200ms per the spec doc's own hedge) was not pinned down to an exact constant in the read files (`utils/FeedVideoFocus.ts` contains the pure decision function but the actual debounce timer is presumably in `pages/PostsPage.tsx`'s viewability-config wiring, outside this survey's assigned file list) — the Feed/Posts-page survey agent should confirm the exact ms value for parity.
