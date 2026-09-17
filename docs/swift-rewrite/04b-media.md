# 04b — Media: Fullscreen Viewer, Video, Gallery Mode, Downloads, Caches (SwiftUI Implementation Spec)

**Target:** `APPNAME`, a from-scratch native SwiftUI iPhone Reddit client.
**Platform floor:** iOS 26.0, built with the iOS 27 SDK, Swift 6.4, strict concurrency with default
`MainActor` isolation; all decode/network work marked `@concurrent`.
**Companion documents:** `02-architecture.md` (stores, routing, theming, entitlements seam),
`03-data-and-networking.md` (`RedditAPI` actor, endpoint IDs, media model derivation),
`04a-feeds-posts-comments.md` (post cards, the feed-side video contract, low-data effects on cards),
`04c-accounts-inbox-search-subs-settings.md` (settings tree UI, Data Use screen, Advanced/cache rows),
`05-monetization.md` (binds `[GATE: gate.*]`), `08-decisions-and-drift.md` (resolves `[DECISION: <id>]`).

Clean-room reproduction of *behavior*. Quoted strings are functional UI copy and are reproduced
verbatim. iPhone only; no iPad split-view media pane. `[DECISION: ipad-split-view-deferred]`

---

## 1. Media model (what the app considers "media")

Derived once, in the model layer (`03-data-and-networking.md` §Post). This document consumes it.

```
struct PostMedia {
    var images: [MediaItem]        // one entry per gallery item
    var videos: [VideoItem]        // one entry per gallery item that is a video
    var mediaAspectRatio: Double   // first image's w/h, default 0.75 when unavailable
    var thumbnail: ImageSource?    // first (smallest) variant of the first image; the video poster
}
struct MediaItem { var sources: [ImageSource] }   // ascending: smallest → largest
struct ImageSource { var url: URL; var width: Int; var height: Int }
struct VideoItem {
    var source: URL                // what the player is fed (may be HLS, mp4, or an unresolved
                                   // Redgifs watch URL)
    var downloadURL: URL           // always a direct file; never HLS. Used by save/share.
    var needsResolution: Bool      // true ONLY for Redgifs
}
```

**A post has images or videos, never both.** The renderer checks `videos` first, so a post carrying
both collapses to its videos.

### 1.1 Video source ladder (first match wins)

| # | Condition | `source` | `downloadURL` | Notes |
|---|---|---|---|---|
| 1 | `media.reddit_video.hls_url` present | the **HLS `.m3u8`** playlist | `reddit_video.fallback_url` (a DASH mp4) | Normal `v.redd.it` video with audio. The original entity-decoded ~30 string fields client-side and missed this one; `APPNAME` sends `raw_json=1` on every read, so **no field is ever entity-encoded and no decoding step exists**. `[DECISION: raw-json-param]` |
| 2 | `fallback_url` present, no HLS | the DASH mp4 | same | Crossposts, older videos |
| 3 | Gallery videos (`gallery_data.items` + `media_metadata[id].s.mp4`) | `s.mp4` per item, ordered by `gallery_data.items` | same | **Checked before rule 4** so a gallery that also has a preview isn't collapsed to one preview-resolution video. An entry is dropped when it lacks a `p` array (unprocessed) **or** when it lacks `s.mp4` — both drops, not just the first (`03` §4.4 rule 3). |
| 4 | `preview.images[].variants.mp4` | `variants.mp4.source` if present, else the **last** (largest) entry of `variants.mp4.resolutions` | same | The "Reddit GIF as mp4" path (r/gifs etc.). Nulls dropped. |
| 5a | non-Reddit URL containing `imgur.com` ending `.gifv` | the URL with `.gifv` → `.mp4` | same | Pure string rewrite, no API |
| 5b | non-Reddit URL containing `gfycat.com` | `https://web.archive.org/web/0if_/thumbs.<host+path>-mobile.mp4` | same | Gfycat is dead; this is a Wayback mirror |
| 5c | non-Reddit URL containing `redgifs.com` | the raw **watch** URL, `needsResolution = true` | same | Resolved lazily at display time (§6) |
| 6 | otherwise | — | — | `videos == []` |

Redgifs is the **only** host requiring an async call to become playable.

### 1.2 Animated GIF *images* are not videos

An actual animated `.gif` file is part of `images[]` and is rendered by the image pipeline. It
animates unconditionally **except in the Gallery Mode grid**, where §10.3 renders animated content as
a **still first frame**; tapping into the fullscreen viewer resumes animation. That one carve-out
exists because a two-column grid of simultaneously animating GIFs is the same CPU problem the
four-player cap solves for video. Everywhere else it is **excluded from all focus/pause logic**: an animating GIF never
pauses when scrolled off-screen or when another video takes focus, and it zooms/pans in the
fullscreen viewer exactly like a still image. Only rule 4/5a/5b sources ("GIFs that are really mp4s")
go through the video pipeline, where they behave identically to any other muted, looping video. There
is no separate silent/loop-only "gif mode" player.

---

## 2. Fullscreen media viewer

### 2.1 Ownership and presentation

One global viewer instance, app-wide. `MediaViewerStore` is an `@Observable` held at the app root and
read from `@Environment`.

```
@Observable final class MediaViewerStore {
    private(set) var presentation: Presentation?     // nil = closed
    struct Presentation {
        var rows: [[MediaEntry]]      // one ROW per post; columns = items within that post
        var rowIndex: Int
        var columnIndex: Int
        var currentPost: () -> Post?  // a closure OR a live reference — see below
        var onFocusedItemChange: ((Int, Int) -> Void)?
    }
    func present(rows:initialFlatIndex:currentPost:onFocusedItemChange:)
    func dismiss()
}
```

- `rows` is a **2-D** array: vertical paging moves between **posts**, horizontal paging moves between
  **items within one post's gallery**. Items within a row are never mixed image/video.
- `present(initialFlatIndex:)` converts a flat index into `(row, column)` by walking row lengths.
- `currentPost` must be able to read the **latest** posts array, not a stale snapshot — Gallery Mode
  keeps appending posts while the viewer is open. Model it as a closure capturing an `@Observable`
  store, never a captured array value.
- Presented as a `.fullScreenCover` over a solid black background. `.statusBarHidden(true)`.
- **Orientation:** the app is otherwise locked portrait-up. The viewer unlocks rotation while open
  and re-locks to portrait-up on dismiss. On the iOS 27 SDK this must be done through scene APIs
  (`UIWindowScene.requestGeometryUpdate(.iOS(interfaceOrientations:))` plus a
  `supportedInterfaceOrientations` override on the hosting controller), never via the deprecated
  `UIApplication` status-bar/orientation APIs.
- **Zoom transition.** Enter with `.navigationTransition(.zoom(sourceID:in:))` from the tapped
  thumbnail, matched on the media item's id (`02-architecture.md` §10.5). The original simply
  presented on a black background with no shared-element transition; this is a deliberate,
  flagged enhancement, and it is **suppressed under Reduce Motion**
  (`02-architecture.md` §15.1 rule 3). `[DECISION: viewer-zoom-transition]`

### 2.2 Paging structure

```
FullscreenMediaViewer
└─ ScrollView(.vertical)                    // posts
   .scrollTargetBehavior(.paging)
   .scrollPosition(id: $rowID)
   └─ LazyVStack(spacing: 0) {
        ForEach(rows) { row in
            ScrollView(.horizontal)          // items within the post
              .scrollTargetBehavior(.paging)
              .scrollPosition(id: $columnID) // only for the ACTIVE row
              .scrollDisabled(isScrollLocked)
              └─ LazyHStack { ForEach(row) { ImagePage | VideoPage } }
        }
      }
   .scrollDisabled(isScrollLocked)           // zoom/scrub lock both axes
   .overlay { PostOverlay(); ItemIndexIndicator() }
```

Per the 2026 baseline, nesting a `LazyHStack` inside a `LazyVStack` for galleries is the recommended
shape, and `ScrollPosition` bindings are preferred over absolute offsets. Only the **currently
active** row needs a live position binding for programmatic paging; other rows track their own scroll
state independently.

**Initial index.** Seed the vertical position by binding `scrollPosition` to the target row's id
before first layout, rather than computing an offset — the original works around a list bug by
starting at index 0 with a manual `height × initialRowIndex` offset; that workaround is unnecessary
with `scrollPosition(id:)`.

**Rotation.** Re-seed the position from the **current** row/column at the moment of rotation (not the
open-time index), so the user lands back on the same item.

**Prefetch budget.** On the **vertical (post) axis**, prefetch **one page ahead and one behind** — a
single screen in each direction. On the **horizontal (gallery) axis**, prefetch **nothing**: paging
within one post is a deliberate act and the next item is one cache-warm decode away. Wider budgets
spend bandwidth on posts the user is flinging past, which is the same argument as
`[DECISION: no-speculative-preload]` for video.

**Item index indicator.** Shown only when the current row has **more than one** item. Bottom-right:
two round pill buttons (chevron-left / chevron-right) plus a pill reading `"<col+1> / <total>"`. The
buttons are `.opacity(0.5)` and `.disabled` at the first/last item. They animate in and out together
with the rest of the overlay chrome. There is **no** numeric indicator for vertical (post-to-post)
paging.

### 2.3 Dismissal

Three independent paths, each animating out via a dismiss offset driven to −150 over 200 ms before
closing:

1. **Close (X) button**, top-right, always visible while the overlay chrome is shown.
2. **System back / swipe-dismiss request** (`.interactiveDismissDisabled(false)` on the cover, or the
   hardware back affordance).
3. **Overscroll flick**, evaluated per axis at the end of a drag:
   - **Vertical (post list):** fires if the user pulled past the top or bottom edge by **more than
     50 pt**, OR ended the drag with `|velocity.y| > 1` while already past an edge.
   - **Horizontal (item row, only when the row has >1 item):** the same shape with a **40 pt**
     threshold. Swiping past the first/last item in a gallery therefore dismisses the viewer rather
     than merely refusing to page.
   - **During** the overscroll — before release — the background fades and the content container
     shrinks and fades continuously, interpolating over a combined dismiss offset in the range
     `[-150, -50, 0]`. The feedback is live, not release-only.

### 2.4 Tap classification

The entire content surface is one tap target, **excluding** the post overlay and the video control
rows (which consume their own taps). Three outcomes:

| Gesture | Zone | Effect |
|---|---|---|
| Single tap | anywhere | Toggle the post overlay + item-index chrome |
| Double tap | left/right **30 %** edge (`SIDE_TAP_ZONE_FRACTION = 0.3`) — **only** when the row has >1 item **and** the list is not scroll-locked | Page to the previous / next item |
| Double tap | middle (or the whole screen when side paging isn't active) | Play/pause the current video (no-op on an image) |

Exact constants (all pure, all unit-tested):

| Constant | Value |
|---|---|
| `TAP_MAX_MOVEMENT` | 10 pt in both axes |
| `TAP_MAX_DURATION_MS` | 300 ms |
| `DOUBLE_TAP_MAX_DELAY_MS` | 280 ms |
| `DOUBLE_TAP_MAX_MOVEMENT` | 45 pt from the first tap's location |
| `SIDE_TAP_ZONE_FRACTION` | 0.3 |

**Arbitration.** A single tap fires *immediately* only in a zone where no double-tap action is
currently possible there (middle zone with no video, or side zone with paging disabled or locked).
Otherwise the handler holds the single tap for the full 280 ms double-tap window, so a double tap
never also toggles the overlay.

Side double-taps are not debounced, but the target column is clamped to `0...(rowCount-1)` — tapping
past the end does nothing and never wraps. Rapid sequential double-taps (within 300 ms of each other)
chain from the last **intended** target rather than the settled scroll position, so fast repeated
double-tapping pages several items smoothly.

Middle double-tap play/pause: look up the shared player for the focused item via the registry's
read-only `peek(key:)` (do **not** acquire — some other view owns it), toggle play/pause, fire
`hapticSelection()`, and force the overlay **visible when pausing** / **hidden when resuming**, so a
paused state is always legible.

In a single-item post, `canPageSides` is false and the middle zone effectively covers the whole
screen — there are no dead edge zones.

Implement this as a custom pure classifier (`MediaTapClassifier`) fed by a
`DragGesture(minimumDistance: 0)`'s start/end samples, rather than composing SwiftUI's
`onTapGesture(count:)`, because the arbitration and zone rules cannot be expressed with the built-ins.

### 2.5 Post overlay

Rendered above the media with `allowsHitTesting` scoped to its own controls, fading in/out over
150 ms with the single-tap toggle.

| # | Element | Position | Condition | Behavior |
|---|---|---|---|---|
| 1 | Close (X) | top-right | always | Dismiss |
| 2 | Share | top-right, beside/below close | `post.images.count > 0 \|\| post.videos.count > 0` | Circular translucent grey button with a share glyph. On press it becomes a `ProgressView` and disables itself while in flight. For a video: if `needsResolution`, resolve the Redgifs URL first; on a resolution failure present `.alert("Couldn't load video", "Redgifs is rate limiting requests. Please try again in a moment.")` and abort. Then run the download→share flow (§9) with `("video", downloadURL)` or `("image", images[columnIndex])`. |
| 3 | Info card | bottom | always | Tappable (opens the post). Contains: title (1 line, truncated); body-text preview (2 lines, only when `post.text` is non-empty); and a metadata row `" in " + r/<subreddit> + " by " + <author>`, where the subreddit and the author are **independently** tappable and navigate there, closing the viewer first. |

All three navigation targets resolve short links (`redd.it/<id>`, `/s/<id>`) before deciding the
destination route, and push onto the active tab's stack — the viewer can be presented from contexts
outside the normal feed hierarchy (Gallery Mode), so routing must go through the app-level router,
not a local `NavigationLink`.

The viewer's overlay has **no** rotation control, **no** "Open in Browser", and **no** "Copy link" /
"Copy image" action. Copy-image-link and the save action exist only on the feed-level image
long-press menu (§3.4).

---

## 3. Image viewing

One `ImagePage` per gallery item, sized to the full safe-area frame, `.scaledToFit()`.

### 3.1 Resolution strategy

- `MediaItem.sources` is ascending smallest → largest. Decode the **largest** as the primary source.
- **Downscaling latch.** By default the pipeline may decode at container size to save memory. The
  moment the user zooms even once, latch "needs full resolution" permanently for that item: disable
  downscaling and re-decode at native resolution. It never reverts, even after zooming back out.
- **Placeholder.** While the full-resolution image loads, display the same lower-resolution variant
  array as a placeholder with `.scaledToFit()`. This is expected to be an instant cache hit, because
  it is exactly the resolution the feed card already displayed and cached — so opening the viewer
  shows an immediate (slightly soft) image rather than a black frame, then crossfades (150 ms) to
  full detail.
- **The feed strip, the gallery grid and this viewer must share one `ImagePipeline` instance and one
  cache**, constructed once in the composition root and injected. The placeholder guarantee above
  depends on it entirely: two pipelines means two caches, the viewer's "placeholder" is a cache miss,
  and every open shows a black frame before the image arrives. This is a structural requirement, not
  an optimisation.
- Key the page's identity on the largest source URL so state resets correctly when a page is reused.
- When a page is reused for a different item, zoom/pan state resets **synchronously**:
  `scale = 1, offset = .zero, isZoomed = false`.

**Pipeline choice.** Per the 2026 baseline: iOS 27's `AsyncImage` gained HTTP caching and accepts a
custom `URLSession` via `asyncImageURLSession(_:)`, which is sufficient for avatars, subreddit icons
and low-traffic screens. It still offers no prefetch-ahead, no off-main decode control, no memory-cost
ceiling and no progressive decode. **Use a real pipeline (Nuke) for the feed strip, the gallery grid
and this fullscreen viewer**, configured with the disk/memory ceilings in §12. Pin the dependency
version before moving Xcode versions.

### 3.2 Zoom / pan / pinch

Compose `MagnifyGesture`, a `DragGesture`, and a double-tap gesture simultaneously. Use the new
`GestureInputKinds` initializers to restrict recognition to direct touch, so a trackpad/pointer scroll
is not read as a pan.

| Interaction | Behavior |
|---|---|
| **Double-tap to zoom** | Registers as a double tap only if the two taps land within **20 pt** of each other (note: this is the *gesture-level* double tap for zoom, distinct from the viewer-level 45 pt/280 ms classifier in §2.4). If already zoomed → animate back to scale 1 and offset zero over **250 ms ease-out**. If not zoomed → zoom to **`ZOOM_SCALE = 3`** centered on the tap point (computed from the tap's offset relative to the current anchor so the tapped point stays under the finger), clamped so the image never pans past its edges: `maxX = width × (scale − 1) / 2`, `maxY = height × (scale − 1) / 2`. |
| **Inside a multi-item row** | A double tap landing in a side 30 % zone does **nothing at the image level** — it is reserved for viewer paging (§2.4). |
| **Pinch** | Continuous scale clamped to **1…10**: `scale = min(max(scale × event.magnification, 1), 10)`, pivoting around the **live focal point each frame** (incremental, not baseline-relative, so simultaneous pan+zoom both track). **Focal snap guard:** if the two-finger centroid jumps more than **50 pt** in a single frame (a finger added or lifted mid-gesture), drop that frame's pan contribution — apply the zoom but not the translation — to avoid a visible jerk. |
| **Pinch release** | If the settled scale is **below 1.1**, spring back to exactly 1 and centered over **200 ms**. A small non-committal pinch snaps back to unzoomed. |
| **One-finger pan** | Enabled **only while zoomed** (`maxPointers: 1`, average touches). Drags within the same edge clamps. On release, if velocity exceeds **100 pt/s** in either axis, continue with a decay animation (deceleration **0.998**) clamped to the same bounds — a flick while zoomed keeps drifting and decelerates rather than stopping dead. |
| **Rotation** | **Not supported at all** — no rotate gesture, no rotate button. Images are always upright as served. |
| **Scroll lock** | `isZoomed == true` sets the viewer's scroll lock, disabling both the horizontal item pager and the vertical post pager so pan isn't fought by list scrolling. Un-zooming restores paging. |

### 3.3 Live Text

The original ships a persisted, Settings-exposed toggle named "Live text" (default **off**) that
**nothing reads** — no image view configures any text-analysis interaction anywhere in the codebase.
The feature is documented but not wired.

**Specification for the rewrite:** implement it properly, gated on the same setting.

- `LiveTextImageView: UIViewRepresentable` wrapping a `UIImageView` with a VisionKit
  `ImageAnalysisInteraction`; run `ImageAnalyzer.analyze(_:configuration:)` with `.text` (and
  `.machineReadableCode` if desired) off the main actor, then assign the result.
- `interaction.preferredInteractionTypes = settings.liveTextInteraction ? .automatic : []`. When off,
  no interaction is installed at all, so the zoom/pan gestures are untouched.
- When on, the long-press-to-open-context-menu gesture must require a **longer hold** to disambiguate
  from text selection, matching the documented intent.
- Available capabilities when on: select, copy, translate, look up, search, share — all system-
  provided.
- There is no SwiftUI-native equivalent; the representable bridge is required per the 2026 baseline.
- `[DECISION: live-text-dead-setting]` — the original's toggle is inert; we are specifying the
  intended behavior. If `08` says "ship parity", delete the toggle and the interaction entirely
  rather than shipping a switch that does nothing.

### 3.4 Feed-level image long-press menu

Attached to the **inline** image view in feed cards and in rendered comment/post bodies — **not** to
the fullscreen viewer. A native `.contextMenu` with exactly three items:

| Item | Effect |
|---|---|
| `Share Image` | `share("image", item)` (§9). **Free** — the OS share sheet's own "Save Image" is reachable from it, so the gate below is soft by construction and we do not fight the user (`05-monetization.md` §3.1 row D) |
| `Save Image` | `save("image", item)` (§9) — requests add-only photo permission on first use. `[GATE: gate.downloads]`: the row stays visible with a Plus badge; tapping it while locked opens the paywall |
| `Copy Image Link` | Resolves the item to a URL (a plain URL as-is; an array of variants → the **largest** variant's URL) and copies it to the pasteboard. There is **no** "Copy Image" (pixel data). |

There is **no** "Open in Browser" item for images anywhere.

---

## 4. Video: shared architecture

Three surfaces attach to the **same underlying player instance** per video, via the registry in §5:
the feed's inline video, the fullscreen viewer's video, and Gallery Mode's grid cell.

Per the 2026 baseline, `VideoPlayer` (AVKit) is acceptable for the **fullscreen** surface but is the
wrong tool for a feed. Drive `AVPlayer` yourself behind a thin `UIViewRepresentable` wrapping an
`AVPlayerLayer`-backed view, and bind playback to visibility via
`onScrollTargetVisibilityChange(idType:threshold:)`.

### 4.1 Per-surface attach configuration

Configuration differs at **attach** time, not creation time:

| Surface | Muted | Audio session | Seek tolerance | Buffer |
|---|---|---|---|---|
| Feed inline | muted unless focused **and** `feedVideoAudio` | `.mixWithOthers`-equivalent | default | small buffer cap |
| Fullscreen viewer | muted per `tappedVideoAudio` | forced **do-not-mix** | ±0.1 s | default |
| Gallery grid | always muted | `.mixWithOthers` | default | small |

`preservesPitch = true` is set **at creation** on every player and re-asserted on every playback-rate
change.

### 4.2 Query-parameter trim fallback

Applies to the **inline feed** player only (not the fullscreen viewer). On the **first** player error
for a resolved source that carries query parameters, retry **once** with everything from `?` onward
stripped.

**Excluded for signed hosts**, where the query string *is* the auth signature and stripping produces
a 403 — matched as the exact host or any subdomain of: `redd.it` (thus `v.redd.it`, `i.redd.it`,
`preview.redd.it`, `external-preview.redd.it`), `redgifs.com`, `redgifs.net`. For those, return nil
and let the watchdog / cache-bust paths handle recovery.

Guarded to once per attach; reset when the view is reused for a different source.

### 4.3 Reload watchdog

Applies to the **inline feed** player only. Purpose: during a fast fling iOS can momentarily exceed
its real hardware decoder ceiling (decoders are not freed synchronously), producing a player that
never reaches ready-to-play even though the registry's logical live count is under its own cap.

- **Arm when:** a player and a resolved source both exist, resolution status is `ready`, player status
  is **not** ready-to-play, and fewer than **`MAX_RELOAD_ATTEMPTS = 3`** reloads have been attempted
  for this attachment.
- **Delay before firing:** `2000 + attempts × 1000` ms → 2 s, 3 s, 4 s.
- **On fire:** re-check that the player is still not ready **and** that the fullscreen viewer does not
  currently own it. If still stuck, `replace(with: cachedSource)` and `play()`, and increment the
  attempt counter. Reaching ready-to-play resets the counter to 0.
- If the registry entry was released while the timer was pending, swallow the failure silently — the
  next attachment gets a fresh player.

### 4.4 Overlay / loading state machine

A single **pure**, unit-tested function decides what the black overlay tile shows over the video
surface. Priority order, first match wins:

| # | Condition | Overlay |
|---|---|---|
| 1 | resolution status is `error` | **"Couldn't load video. Tap to retry."** — tappable, retries the Redgifs resolution |
| 2 | player status is `error` | **"Couldn't load video."** — **not** tappable in the inline feed (the watchdog and the Redgifs cache-bust are the recovery there). In the fullscreen viewer the same state reads **"Couldn't load video. Tap to retry."** and is tappable (§8.3, `[DECISION: fullscreen-player-retry]`). |
| 3 | **Readiness short-circuit:** `isPlaying \|\| currentTime > 0 \|\| status == .readyToPlay` | **hidden, unconditionally** — this always wins over any "still loading" state below |
| 4 | resolution status is `loading` | **"Resolving video…"** + spinner |
| 5 | no player attached | **"No player available"** + spinner (transient; creation is async) |
| 6 | watchdog mid-retry (`0 < attempts < 3`) | **"Stalled — retrying (N/3)"** + spinner |
| 7 | otherwise | **"Loading video…"** + spinner |

**Critical design point:** readiness is judged from **live getters** re-read synchronously on every
(re)attachment — `player.rate > 0`, `player.currentTime()`, `playerItem.status` — not from a mirrored
event stream alone. A shared player attached to a *new* view may already be mid-playback with its
loading→ready transition long past, so no future event will ever fire to clear a naive
"waiting-for-status-change" flag. Rule 3 is the fix for the historical "black box covers a playing
video" bug; do not reorder it.

---

## 5. Shared video player registry

One process-wide registry, keyed by the video's **pre-resolution** source URL (i.e. the Redgifs watch
URL itself for Redgifs videos, not the resolved mp4 — the key stays stable across resolution) plus
the gallery index. Every surface that wants to show a given video **attaches to the same single
player** instead of creating its own.

```
actor VideoPlayerRegistry {
    func acquire(_ key: VideoKey) -> AVPlayer
    func release(_ key: VideoKey)
    nonisolated func peek(_ key: VideoKey) -> AVPlayer?   // read-only, no ref count
}
```

| Operation | Contract |
|---|---|
| `acquire` | Returns the existing player if present: increments the ref count, **cancels any pending deferred release**, bumps the LRU clock. Otherwise evicts if at cap and creates a new player with `preservesPitch = true` and `isMuted = true`. |
| `release` | Decrements the ref count. At zero, schedules a **deferred** actual release on the next run-loop turn — cancelled if re-acquired before it fires. This bridges the brief unmount→remount gap during tap-to-open-viewer or a rotation-driven rebuild, so those transitions never destroy and recreate the player: no reload, position preserved. |
| `peek` | Read-only lookup with no ref counting — used by the viewer's middle double-tap play/pause, which wants to control a player another view owns. |
| Cap | **`DEFAULT_MAX_LIVE_PLAYERS = 12`.** iOS silently fails to decode (permanent black tiles) above roughly 16 simultaneous `AVPlayer`s; 12 stays safely under while remaining above the realistic number of video cells that could be mounted at once. **Critical:** eviction only ever reaps **idle** (ref count 0) entries, so the cap must never sit below the on-screen cell count or an eviction could reap a still-visible player. |
| Eviction | `evictIfOverCap()` runs before **every** new player creation (not once per over-cap event) and **loops**, reaping the least-recently-used idle entry until there is room for one more — a single fast fling can leave several deferred-release entries simultaneously idle, and reclaiming only one per acquire would let the real live count creep past the cap. |

With focused-only feed playback (§7), the live player count during normal browsing is typically 1–2
(the Focused Post plus possibly one still-deferred neighbor), so the cap is a safety net rather than a
hot path.

**No speculative preloading** of the next likely-focused video exists, and none is added: it would
spend bandwidth and decoders on posts the user flings past, which is exactly what focused-only
playback exists to avoid. `[DECISION: no-speculative-preload]`

---

## 6. Redgifs lazy resolution

Applies **only** when `video.needsResolution == true`. Every other host resolves deterministically at
fetch time (§1.1) and skips all of this.

### 6.1 Why lazy

Resolution used to happen eagerly while formatting a whole page of posts, producing a burst of
parallel calls per page load. After roughly 20–30 cumulative resolutions Redgifs rate-limits by IP,
and the old fallback baked the unplayable watch URL into the post data permanently. Resolution now
happens **on attach of whichever view is currently rendering that video** — roughly 5× fewer calls,
spread over scroll time.

### 6.2 Id extraction

From any Redgifs link shape: strip query and fragment, strip the scheme, drop the host, take the last
non-empty path segment, then strip a trailing 2–4 character extension. This covers `/watch/<id>`,
`/ifr/<id>`, `/i/<id>`, a bare `/<id>`, and `media.redgifs.com/<id>.mp4`. A link with no path segment
yields an empty id, treated as unresolvable — never issue a request for an empty id.

### 6.3 Token

`GET https://api.redgifs.com/v2/auth/temporary` with header `User-Agent: APPNAME` (a literal, distinct
from the app's randomized Reddit user agent — `03-data-and-networking.md` §1.4, §9.1 endpoint **G1**).
The returned token is persisted under the key `redgifsToken`. Fetched lazily when none is stored;
refreshed on any non-OK response or thrown error.

### 6.4 Resolution

`GET https://api.redgifs.com/v2/gifs/<id>` (endpoint **G2**) with `Authorization: Bearer <token>` and
`User-Agent: APPNAME`. The resolved URL is `gif.urls.hd ?? gif.urls.sd` (prefer HD).

### 6.5 Concurrency, queueing, backoff

| Control | Value / rule |
|---|---|
| Max concurrent resolutions | **2**, process-wide |
| Queue discipline | **LIFO** — the newest waiter runs first, so the currently visible post jumps ahead of the backlog of scrolled-past posts |
| Cancellation | Each request carries a cancellation signal tied to the view's lifetime. A waiter cancelled **while queued** is removed and never consumes a slot; a cancelled in-flight request bails between retries. |
| Cache re-check | After acquiring a slot, re-read the cache — another queued caller may have resolved the same id meanwhile |
| Retry attempts | **3** (`MAX_BACKOFF_ATTEMPTS`) |
| Cooldown after a normal failure | `1000 ms × (attempt + 1)` → 1 s, 2 s, 3 s — armed **globally**, pausing *all* pending and future resolutions |
| Cooldown after HTTP **429** | **30 000 ms**, global; the attempt is retried **without** refreshing the token |
| Token refresh | On any non-429 non-OK status, and on any thrown error, before the next attempt |
| Waiting out a cooldown | A waiter whose cancellation fires *while waiting out a cooldown* bails immediately rather than holding its slot, so a still-visible post isn't starved behind an off-screen one |
| Final failure | Throws a resolution error; a cancellation throws a distinct abort error |

Implement the queue as an `actor` with an explicit LIFO waiter array and `withTaskCancellation
Handler` per waiter. Do **not** use a plain `TaskGroup` — the LIFO discipline and the cancel-while-
queued behavior are load-bearing.

### 6.6 Cache

`resolvedUrlCache: [String: URL]`, **memory-only, never persisted.** Redgifs URLs are signed and
expire in hours; a persisted cache would serve dead links at the next launch. Staleness is bounded to
the current session.

### 6.7 Consumption in the player

- On attach, first check the cache. A hit sets the state straight to `ready` with that URL, with no
  network call and **no flash of a loading state** — important when a view is reused for a video that
  was already resolved.
- A miss goes to `loading`, resolves, and lands in `ready` or `error`. A cancellation leaves the state
  **untouched** (the post simply went away; that is not an error).
- A manual `retry()` bumps an attempt counter that re-runs the resolution.

### 6.8 Stale-cache recovery

If playback subsequently errors on an **already-resolved** Redgifs source, that is the expiry signal —
there is no TTL. Both the feed player and the fullscreen player independently detect
`playerStatus == .error && resolveStatus == .ready`, call `clearCached(id)` **once** (guarded by a
per-attachment flag), and trigger a retry, busting the presumably-expired URL and re-resolving fresh.

---

## 7. Feed inline video

### 7.1 Focused-only playback

At most **one** feed video plays app-wide: the **Focused Post** — the center-most video post on
screen once scrolling has settled. Full selection algorithm is in `04a` §9; the media-side contract:

- **Poster vs player.** A non-focused video post renders **only** the post's thumbnail with a
  semi-transparent centered play-circle overlay — **no player attached at all**. This also means **no
  video bytes are requested** for posts the user flings past. Tapping it still opens the fullscreen
  viewer directly, bypassing the need to have played inline.
- **Becoming focused:** acquire and attach a player. The poster stays visible (layered beneath the
  diagnostic overlay) until the player reports a real decoded frame **for the correct source**
  (readiness gate, §4.4), then the poster and overlay disappear, revealing the video. This
  crossfade-via-overlay-removal structurally prevents a stale or mismatched frame from ever being
  user-visible.
- **Losing focus:** release the player, restore the poster, remember the playback position.
- **Regaining focus:** **always resume** from the remembered position — re-seek after re-acquiring,
  even if the player itself was evicted and recreated in between. Guard the seek so it happens only
  once per (player, source) pair and only when the player is fresh (`currentTime < 0.05`).
- **Remembered positions:** an in-memory map keyed by video key, **LRU-capped at 200 entries**,
  independent of player lifetime.
- **Surfaces outside a focus-managed feed** — post detail, Gallery Mode, the fullscreen viewer — do
  not provide a focus context, so their videos behave as **always focused**: every video plays inline
  immediately once on screen, with no poster gating.

### 7.2 Autoplay / mute / audio interplay

| Setting | Default | Meaning |
|---|---|---|
| `autoPlayVideos` | `true` | Global. When **false**, or when the current data mode is `.lowData`, the inline player **never mounts at all** regardless of focus — every video post shows the static poster + play glyph, everywhere in the feed. |
| `feedVideoAudio` | `false` | Whether the Focused Post plays with sound. Toggled by a FAB as well as a Settings row. |
| `tappedVideoAudio` | **follows `feedVideoAudio` until the user has explicitly set it once**, then sticks independently | Audio for videos opened into the fullscreen viewer. Once the user toggles the mute button inside the viewer, that value is persisted and thereafter takes precedence for all future tapped-open videos, even if `feedVideoAudio` later changes. |

Effective inline audio = `focusManaged && isFocused && feedVideoAudio`.

**Audio session when ON:** sound **interrupts** background audio (standard do-not-mix, not ducking)
and plays **even with the hardware silent switch engaged** — enabling the toggle is an explicit "I
want sound" signal. In AVFoundation: category `.playback` with **no** `.mixWithOthers` option while
audio is enabled.
**When OFF:** fully muted and mixing with other audio — category `.ambient` (or `.playback` with
`.mixWithOthers`) so the user's podcast is never interrupted.

`player.actionAtItemEnd = .none` with a boundary observer, or `AVPlayerLooper` — **every feed video
loops**, like a GIF.

### 7.3 FABs

Two floating circular 44×44 buttons, bottom-right, stacked vertically, just above the tab bar,
`opacity 0.9` with a subtle shadow:

1. **Autoplay** (top) — play-circle (on) / pause-circle (off); toggles `autoPlayVideos`. Always shown
   on feed screens.
2. **Audio** (bottom) — `speaker.wave.2` (on) / `speaker.slash` (off); toggles `feedVideoAudio`.
   **Only rendered while autoplay is on** — with autoplay off no feed video ever plays, so there is
   nothing to unmute; the button is hidden entirely, not disabled.

Each press fires `hapticSelection()` (`.sensoryFeedback(.selection, trigger:)`). Both are mirrored as
Settings → Appearance rows and persist across launches.

`[GATE: gate.videoAutoplay]` — **OWNER row, default OFF (free).** The tag covers **both FABs** above
and their two mirrored Appearance rows (`04c` §17.1, "Auto play videos" and "Focused video audio"),
and it is the same seam `04a` §9 tags on inline feed playback. While the owner leaves the gate off,
nothing here is badged and nothing behaves differently; if it is ever flipped on, the FABs render with
a `Plus` badge and open the paywall (`05` §5.11), every feed video falls back to the poster + play
glyph, and **tapping a poster to open the fullscreen viewer stays free**. The tag exists so that flip
is one line in `Feature.isGated` rather than a code hunt (`05-monetization.md` §3.1 rows A/D, §4).

### 7.4 Other inline behaviors

- **App backgrounding.** The entire video subtree is torn down — **unmounted**, not merely paused —
  the instant the scene phase reports `.background`, replaced by a same-size placeholder, and rebuilt
  on foreground. Consequence: **no background audio and no Picture-in-Picture.** Playback simply stops
  when the app is backgrounded.
- On teardown (focus lost / scrolled away / backgrounded) remember the position, then explicitly mute
  and pause the player unless the fullscreen viewer currently owns it, so a ref-count-zero-but-not-
  yet-reaped player doesn't keep playing.
- **Multiple videos in one post.** Only `videos[0]` participates in focus/poster gating in the feed
  cell (it supplies the focus key). The cell shows a `"<N> VIDEOS"` badge bottom-right when
  `videos.count > 1`; tapping opens the fullscreen viewer with **all** of that post's videos as a
  horizontally pageable row.
- **Progress bar.** A 2 pt bar along the very bottom of the video, updated from a periodic time
  observer at **1/15 s** (~67 ms). No scrub interaction inline — scrubbing exists only in the
  fullscreen viewer.
- **No** playback-rate control, **no** explicit play/pause button, and **no** mute button on the
  inline tile. The whole tile is one tap target that opens the fullscreen viewer; all controls live
  there.
- **Long-press menu on video tiles (fix forward).** Inline feed video tiles and Gallery Mode video
  cells carry a native `.contextMenu` with exactly three items, mirroring the image menu (§3.4):
  **Share Video**, **Save Video** (`[GATE: gate.downloads]`), **Copy Video Link** (copies
  `downloadURL`, never the HLS `source`). The original has no such menu anywhere, even though its own
  help text describes the flow — that is a gap, not a design, and it is also the natural home for the
  downloads gate on video. A Redgifs source resolves first; on a resolution failure the menu's action
  presents `.alert("Couldn't load video", "Redgifs is rate limiting requests. Please try again in a
  moment.")` and aborts. `[DECISION: no-video-longpress-menu]`

---

## 8. Fullscreen video viewer

Unlike the feed, the fullscreen viewer's videos are **always eligible to play**. Opening it
immediately attaches (or creates) the shared player for the current item and, if that item is the
initially focused column/row, starts playback.

### 8.1 Controls and gestures

| Control | Placement | Behavior |
|---|---|---|
| **Tap** | anywhere | Toggles the post overlay + control chrome, unless it is a middle-zone double tap (play/pause) or a side-zone double tap (page) — §2.4 |
| **Center play/pause** | center | Large circular translucent button, shown/hidden with the chrome, glyph swaps play↔pause |
| **Scrub** | the video surface itself, no slider widget | See below |
| **Mute / audio** | **top-left** pill (paired with the rate button) at `safeAreaTop + 10, safeAreaLeft + 10` | Deliberately **not** top-right: that is where the overlay's close button sits and it would swallow the taps, since the overlay paints above the video. Glyph `speaker.wave.2` / `speaker.slash`. Toggles `tappedVideoAudio` (persisted globally, §7.2). |
| **Playback speed** | beside the mute pill | Cycles **`[0.5, 1, 1.5, 2]`**, wrapping back to 0.5 after 2×. Label shows the current multiplier, e.g. `"1.5x"`. Sets `preservesPitch = true` on **every** change (defensively, even though creation already does). |
| **Loop** | — | Always on, same as the feed |
| **Rotation** | — | Rotation is unlocked while the viewer is open (§2.1); the video surface reflows with `.scaledToFit()` and the shared player survives rotation with no reload. Container height is `min(screenHeight, screenWidth / aspectRatio)` where the aspect ratio comes from the video track's natural size. |
| **Picture-in-Picture** | — | **Not enabled.** No PiP button, no `AVPictureInPictureController`. Adding it would be a deliberate behavior change, not a parity port. `[DECISION: background-audio-pip]` |
| **Background audio** | — | **None** — the same background teardown as §7.4 applies. |

**Scrub ("swipe to scrub"):**

- Skim engages only once a horizontal drag exceeds **20 pt** while vertical movement stays under
  **30 pt** — this disambiguates a scrub from a vertical dismiss or a post-page gesture.
- On engaging: enable the player's scrubbing-friendly mode, **pause** playback, and set the viewer's
  scroll lock so the drag doesn't also page.
- While skimming: `currentTime = startTime + Δx / (screenWidth / duration)` — dragging across the
  full screen width scrubs the entire duration. Throttle updates to at most one per display frame
  (cancel any pending frame before scheduling the next).
- On release: if playback was playing before the skim began, resume; disable scrubbing mode; release
  the scroll lock.
- A 2 pt progress bar along the bottom mirrors `currentTime / duration` continuously, with or without
  interaction.

### 8.2 Audio activation on entering fullscreen

On becoming the focused item (active row + column):
1. Force the audio session to **do-not-mix** even if the feed left it mixing — a lingering mixing
   mode causes iOS to activate the audio session late or drop it after a seek or reopen.
2. `isMuted = !tappedVideoAudio`, `play()`, `volume = 1`.

On losing focus (paging to a different item or post while the viewer stays open): hand back to
**mix-with-others**, pause, and set `volume = 0`, returning control to the feed's own mixing rules for
when the viewer closes.

**First-open special case:** if the feed had autoplay off, there is no pre-existing shared player when
a video is tapped open. The player's **creation-time** configuration itself must start playback
(muted per `tappedVideoAudio`, do-not-mix) when the item is the initially focused one, rather than
waiting for a focus effect to run after the view appears.

### 8.3 Loading and error states (fullscreen variants of §4.4)

- **Resolution error** (Redgifs failed): full-screen black tile, **"Couldn't load video. Tap to
  retry."**, tap retries. This state is checked and rendered **before a player even exists** — the
  outer view returns it without ever acquiring a player.
- **No player yet** (still acquiring): a centered spinner only, no text.
- Once a player exists, re-derive status from **live getters** on every (re)attachment for the same
  reason as §4.4, and render in priority order: resolve-error (tap to retry) → resolve-loading
  (spinner) → hard player error → not-yet-visually-ready → spinner → nothing.
- **Hard player error — tappable to retry (fix forward).** In the fullscreen viewer a hard player
  error renders **"Couldn't load video. Tap to retry."** and the tap re-creates the player item from
  the cached source. In the original this state had no retry affordance at all, unlike the
  resolution-error case, so a genuine non-Redgifs player error left the user with no recovery but
  closing and reopening the viewer. The **inline** feed player keeps its non-tappable
  "Couldn't load video." (§4.4 rule 2), because there the watchdog and cache-bust paths are the
  recovery. `[DECISION: fullscreen-player-retry]`
- Redgifs stale-cache busting (§6.8) runs here independently of the feed player, with its own
  per-attachment guard.

---

## 9. Download, save, share

Two entry points share one private download helper.

| Hook | Flow |
|---|---|
| `share(_ type:_ source:)` | download → present the system share sheet with the **local file URL**, so the sheet gets a real file (which is what enables its own "Save Video"/"Save Image" actions) |
| `save(_ type:_ source:)` | request **add-only** photo-library permission → download → write to the photo library directly, skipping the share sheet |

### 9.1 Common download mechanics

- **URL resolution.** A plain URL source is used as-is; an array of image variants uses the **last
  (largest)** entry. For video, callers **always** pass `downloadURL`, never the possibly-HLS
  `source` — the OS media pipeline and the share sheet need a direct file, not a streaming playlist.
- **Re-entrancy guard.** A second invocation while a download is already in flight is a silent no-op.
- **Progress UI.** A small centered modal reading **"Preparing Image..."** / **"Preparing Video..."**
  with a spinner. Tapping the scrim dismisses the modal but does **not** cancel the in-flight
  download.
- **Filename and format.** Derive the filename from the URL's last path segment, so the extension is
  whatever the source uses (`.jpg`, `.png`, `.mp4`, `.gif`, …). **No HEIC conversion, no format
  normalization, no transcoding** — an mp4 is shared as mp4, a `.gif` as `.gif`.
- **Location.** Write into the app's caches directory, deleting any stale file at the same path first.
- **Cleanup.** After the consumer (share sheet or photo-library write) completes — success or throw —
  the cached file is **always** deleted. Nothing lingers beyond one operation.

### 9.2 Permissions and alerts (exact copy)

| Situation | UI |
|---|---|
| Save, permission not yet requested | Request **add-only** access (`PHPhotoLibrary.requestAuthorization(for: .addOnly)`) — the app never needs full library read access for saving |
| Save, permission denied | `.alert("Can't save to Photos", "Allow APPNAME to add to your photo library in Settings to save media.")`, with a button that opens the app's own Settings page (`UIApplication.openSettingsURLString`) — the original offered no route out of the denial. |
| Save success (image) | `.alert("Image saved to Photos")` |
| Save success (video) | `.alert("Video saved to Photos")` |
| Any download/share/save failure | dismiss the preparing modal, then `.alert("Error", "Failed to <share\|save> <image\|video>")` |
| Redgifs resolution failure during a viewer share | `.alert("Couldn't load video", "Redgifs is rate limiting requests. Please try again in a moment.")` |

### 9.3 Where each action is exposed

| Surface | Share media file | Save media file | Copy image link |
|---|---|---|---|
| Fullscreen viewer overlay | ✅ (one button) | ❌ — saving from there happens through the system share sheet's own action | ❌ |
| Feed/comment inline **image** long-press | ✅ | ✅ | ✅ |
| Feed inline **video** long-press | ✅ | ✅ (`[GATE: gate.downloads]`) | ✅ (Copy Video Link) |
| Gallery Mode grid cell (video) | ✅ | ✅ (`[GATE: gate.downloads]`) | ✅ |
| Gallery Mode grid cell (image) | ✅ | ✅ (`[GATE: gate.downloads]`) | ✅ |
| Post long-press "Share" (`04a` §7.2) | shares the **post permalink**, never the media file | — | — |

### 9.4 Link sharing (for contrast)

`shareURL(_:)` presents the system share sheet with a `URL` item, which produces the rich link
preview. Post/comment/subreddit/multireddit sharing uses whatever canonical URL the model already
carries; there is no short-link generation. Only the link is shared — no account identity is
embedded.

---

## 10. Gallery Mode

A dedicated full-screen route (`Route.gallery(FeedTarget)`) that re-fetches the same listing as a
normal feed but renders it as a media grid. `[GATE: gate.galleryMode]`

### 10.1 Data and qualification

- Reuses the same `ListingStore` and filter pipeline as a normal feed, with `nonMedia` layered in as
  the **first** rule (drops any post with zero images **and** zero videos), before hide-seen, text
  filters, and (on combined feeds) subreddit filters.
- `pageLimits = [10, 30, 50]`, `filterRetries = 3`.
- Sort and context menu options mirror the normal page's options for the same target type, still in
  the navigation bar.
- **100-item limit, reinstated as a gate.** The original's code has no cap despite its documentation
  describing one; `05-monetization.md` §3.1 row A and §4 reinstate it as `[GATE: gate.galleryMode]`.
  Gallery Mode **opens normally for everyone**; after **100 loaded items** a locked user's grid stops
  loading more and appends an inline **"Continue with Plus"** footer row — `GateStyle.inlineFooter`,
  never a modal, never a hard stop at entry. Unlocked users have no limit. `[DECISION: gate-matrix]`
- **Text filters and hide-seen apply.** There are no AI filters to apply.

### 10.2 Entry

- **Manual:** the "…" context menu → **"Open in Gallery Mode"**, present on Home, subreddit and
  multireddit feeds.
- **Automatic one-time offer:** see `04a` §10 for the full heuristic (≥100 posts, non-combined feed,
  ≥85 % media, one-time flag set on **either** answer — `[DECISION: gallery-offer-cancel]`).

### 10.3 Grid layout and scrolling

- Two-column **masonry** layout with arrangement optimization. In SwiftUI, either a two-column
  `LazyVStack` pair fed by a running-height balancer, or a `UICollectionViewCompositionalLayout`
  bridge. Prefer the former; measure with Instruments before bridging.
- **Every qualifying post's media is flattened into individual grid cells:** a video-only post
  contributes one cell per video, an image-only post one cell per image. Never both from one post —
  videos still take priority, mirroring the single-post rendering rule.
- **Cell aspect ratio uses the parent post's `mediaAspectRatio`**, not a per-image ratio:
  `width = contentWidth / 2`, `height = width / mediaAspectRatio`.
- **Cell content:**
  - Images: `.scaledToFit()`, **no autoplay** for animated content, and **downscaling disabled** on
    iOS — downscaling was found to cause glitchy scroll performance from heavy CPU use, at the cost of
    higher memory.
  - Videos: the shared video view with **no focus context**, so visible video cells play immediately,
    muted, with no focused-only gating. **At most 4 gallery players run simultaneously**: the focus
    engine's candidate set is applied as a ceiling, nearest-to-viewport-centre first, because letting
    every visible cell play is real decoder pressure against the registry's cap of 12
    (`02-architecture.md` §10.6). `[DECISION: gallery-video-cap]`
- **NSFW/spoiler blur applies (fix forward).** Gallery grid cells honour `post.blurNSFW` and
  `post.blurSpoilers` exactly as feed cards do (`04a` §4.5), including the eye-glyph pill labelled
  "NSFW" or "Spoiler" (NSFW wins when both apply) and the per-cell reveal keyed on the post id. The
  original rendered raw thumbnails here with no check at all; a grid of unblurred NSFW thumbnails is
  a safety problem and an App Store age-rating risk. `[DECISION: gallery-mode-no-blur]`
- **Loading more:** the same 2-screen prefetch threshold, and **two viewport heights of grid cells are
  prefetched ahead** (a taller budget than the viewer's, because a masonry grid shows far more items
  per screen and a miss is visible as an empty tile). Footer: spinner while loading (unless the
  filter limit was hit), `"Wow. You've reached the bottom."` once fully loaded with at least one post,
  or the filter-limit copy from `04a` §2.2.
- **Zero results render nothing.** A grid whose filters leave no qualifying post renders an **empty
  grid with the spinner cleared and no message**, exactly like an empty feed (`04a` §2.2) and empty
  search results (`04c` §7.1). Do not invent an empty state for Gallery Mode either.

### 10.4 Handoff to the fullscreen viewer

Tapping a cell presents the viewer with:

- `rows` = the **per-post** grouping (one row per post), so vertical paging still moves post-to-post
  and horizontal paging moves within one post's gallery — distinct from the flat cell array the grid
  itself uses.
- `initialFlatIndex` = the tapped cell's flat grid index.
- `currentPost` = a **live** accessor (not a captured array), so that as the user pages deeper and the
  underlying posts array grows via infinite scroll, the overlay always reflects the current data.
- `onFocusedItemChange` = a callback that scrolls the **grid** to keep its position in sync with
  whatever item the user paged to inside the viewer, so closing the viewer returns to a grid scrolled
  to the right place.

Because the grid must stay in sync, a grid cell may end up displaying the exact video the fullscreen
viewer is actively playing. **The grid cell must never touch playback or mute state while the viewer
is showing** — guard every play/pause/mute call with an `isViewerShowing` check.

---

## 11. Link preview (OpenGraph) fetch rules

Owned by the model layer, consumed by the link card in `04a` §4.8.

| Aspect | Rule |
|---|---|
| **When fetched** | Only for a link post whose URL is **not** a valid in-Reddit page, **and** does not contain any of: `imgur.com`, `gfycat.com`, `redgifs.com`, `.gif`, `.gifv`, `.mp4`, **and** the post produced zero videos |
| **Where** | Inline during post formatting — one request per eligible link post in a page, concurrent but **capped at 6 in flight** via a `TaskGroup` semaphore. The original imposed no cap, so a 100-post page on a filter retry could open 100 sockets. `[DECISION: og-concurrency-cap]` |
| **Timeout** | **1 750 ms**, deliberately short so a slow site never stalls a feed load |
| **Binary bail-out** | Abort as soon as response headers arrive if `Content-Type` is a PDF, `application/octet-stream`, a zip type, or matches `^(image|video|audio)/` |
| **Parsing** | Stream-parse the HTML; every `<meta property="og:*">` contributes `title`, `type`, `image`, `url`, `description`. **No** fallback to `<title>` or `<meta name="description">`, **no** Twitter Card tags, **no** favicon fetching, **no** per-host special cases (YouTube, X, …) |
| **SVG drop** | An `og:image` whose value contains `.svg` is discarded — certain SVGs crashed the original's image renderer |
| **Failure** | Silent: `openGraphData` stays nil and the card degrades to a bare URL line |
| **User agent** | None set (unlike Reddit requests) |

Loading favicons for sites without OpenGraph is explicitly **not implemented** and is not in scope.

---

## 12. Caches

### 12.1 Image cache

| Aspect | Value |
|---|---|
| Max disk | **512 MB** |
| Max memory cost | **256 MB** |
| Configuration | Set once at launch, before any image loads |
| Memory-pressure behavior | On an OS memory warning, proactively clear the **in-memory** cache only; the disk cache is untouched |
| Size reporting | The Advanced settings row shows the live on-disk size, recomputed whenever that screen regains focus |
| Clearing | **Immediate.** Clears the disk cache, presents `.alert("Cache Cleared", "The image cache has been cleared.")`, and resets the displayed size to 0 right away |
| Eviction | Native LRU within the caps; no app-level size tracking or custom eviction policy |

### 12.2 Video cache

| Aspect | Value |
|---|---|
| Max disk | **1 GB**, set once at launch |
| **Per-source cacheability** | **Not cached** when the URL's path ends in `.m3u8` (HLS playlists are not single-file cacheable) **or** `.gif` (Reddit serves an mp4 transcode behind a `.gif`-suffixed path; caching would persist mp4 bytes under a `.gif` extension and the decoder, which infers type from the extension, would then fail — a permanent black-box bug this guard prevents). Every other source — plain mp4 DASH fallbacks, resolved Redgifs URLs, Imgur/gfycat mp4s — is cached normally. |
| **Clearing** | **Deferred and restart-required.** The cache cannot be cleared while any video view is alive. Tapping "Clear Video Cache" sets a persisted flag and presents `.alert("The video cache will be cleared next time you restart <APPNAME>.")`. The actual clear runs at the **next cold start**, before any UI that could mount a player, and resets the flag regardless of success or failure. |
| Size reporting | Live native cache size, shown on the Advanced settings row |

Both rows live in Settings → Advanced (`04c` §Advanced).

---

## 13. Low data mode — effects per media surface

Two independent settings, `dataMode.wifi` and `dataMode.cellular`, each `.normal` or `.lowData`, both
defaulting to `.normal`. The **active** mode is chosen live from the current connection type via
`NWPathMonitor` (Wi-Fi vs anything else, treated as cellular) and re-evaluated on every path change —
switching from Wi-Fi to cellular mid-session changes the effective mode immediately for every
consumer with no reload. There is **no** manual "force low data" override; only the per-connection-
type defaults are configurable.

Before the first path update arrives, the effective mode is conservatively `.lowData`.

| Surface | Effect when `.lowData` |
|---|---|
| **Feed inline video** | The player **never mounts**, unconditionally — independent of focus state and of the autoplay toggle. Poster + play glyph only. Tapping still opens the fullscreen viewer, which loads normally (there is **no** low-data gating inside the viewer). |
| **Feed image strip** | Shows exactly **1** image instead of up to 2, and requests only the **smallest** variant. The moment the image is tapped to open the viewer, low-data is forced off for that row instance (full array/resolution thereafter). Low data is a scroll-time thumbnail optimization only, never a permanent cap. |
| **Link preview card** | The 200 pt OpenGraph cover image is **not rendered at all**; title, description and URL text still render. |
| **Compact thumbnail (link posts)** | The OG image is not used; a larger centered link glyph is drawn instead. |
| **Subreddit icons** | Not rendered at all — not even a placeholder. |
| **Gallery Mode** | Not specially gated (the grid is media by definition). |
| **Fullscreen viewer** | Not gated — opening any media always fetches full quality. |

---

## 14. Component choices (SwiftUI / AVFoundation / VisionKit)

| Concern | Choice | Rationale (from `10-swiftui-2026-baseline.md`) |
|---|---|---|
| Viewer paging | Nested `ScrollView` + `.scrollTargetBehavior(.paging)` + `.scrollPosition(id:)`, `LazyVStack` outer / `LazyHStack` inner | Nesting lazy stacks for galleries is explicitly encouraged; `ScrollPosition` beats absolute offsets since lazy stacks only estimate off-screen size |
| Visibility / focus detection | `.onScrollTargetVisibilityChange(idType:threshold:)` | Apple explicitly recommends it over `onScrollGeometryChange` for "which item is on screen" |
| Feed image loading | Nuke (pinned version) | `AsyncImage`'s iOS 27 HTTP caching is real but has no prefetch, no decode-off-main control, no memory ceiling |
| Icons / low-traffic images | `AsyncImage` + `.asyncImageURLSession(_:)` with a tuned `URLCache` | Sufficient, and removes a dependency from the cold path |
| Inline feed video | `AVPlayer` behind a thin `UIViewRepresentable` over `AVPlayerLayer` | `VideoPlayer` is the wrong tool for a feed; you need pooling and explicit attach/detach |
| Fullscreen video surface | Same representable (shared player from the registry) | Required so the player is literally the same instance as the feed's |
| Pinch / zoom | `MagnifyGesture` + `DragGesture` + double-tap, `.simultaneously(with:)`, with `GestureInputKinds` restricted to direct touch | Prevents a pointer scroll being read as a pan |
| Haptics | `.sensoryFeedback(_:trigger:)` | Preferred over `UIImpactFeedbackGenerator` |
| Live Text | `UIViewRepresentable` wrapping `UIImageView` + VisionKit `ImageAnalysisInteraction` | No SwiftUI-native equivalent exists |
| Share sheet | `ShareLink` where the payload is a plain URL; `UIActivityViewController` bridge where a temporary file URL and completion cleanup are needed | `ShareLink` cannot easily express the "delete the temp file after the sheet finishes" contract |
| Photo library | `PHPhotoLibrary.requestAuthorization(for: .addOnly)` + `PHAssetCreationRequest` | Add-only keeps the app out of full-library access |
| Orientation unlock | Scene geometry APIs on the hosting controller | `UIApplication` orientation/status-bar APIs are deprecated and may return NaN on the iOS 27 SDK |
| Video caching | A custom `AVAssetResourceLoaderDelegate`-backed disk cache, or a maintained caching-player package, with the `.m3u8` / `.gif` exclusions | AVFoundation has no built-in size-capped media cache |

---

## 15. Swift Testing cases

All pure logic below is testable without a network, a player, or a screen.

### 15.1 Tap classification

| Test | Assertion |
|---|---|
| `movementOverTenPointsIsNotATap` | 10.1 pt in either axis disqualifies |
| `durationOverThreeHundredMsIsNotATap` | 301 ms disqualifies |
| `secondTapWithinTwoEightyMsAndFortyFivePointsIsDouble` | 279 ms / 44 pt → double; 281 ms → two singles; 46 pt → two singles |
| `sideZoneBoundary` | x at exactly 0.3·w is inside the left zone; 0.30001·w is not |
| `sideZoneInactiveForSingleItemRow` | Classifier reports middle for the whole width |
| `singleTapFiresImmediatelyWhenNoDoubleActionPossible` | Middle zone with no video → no 280 ms hold |
| `singleTapHeldWhenDoubleActionPossible` | Side zone with paging enabled → held for the full window |
| `doubleTapNeverAlsoTogglesOverlay` | A double tap yields exactly one action |
| `targetColumnClampedAtEnds` | Double-tapping right on the last item yields the last index, never wraps |
| `rapidChainingUsesIntendedTarget` | Two double-taps 200 ms apart page two items even if scrolling hasn't settled |

### 15.2 Dismiss thresholds

| Test | Assertion |
|---|---|
| `verticalOverscrollFiftyPoints` | 50.1 pt past an edge dismisses; 49.9 does not |
| `horizontalOverscrollFortyPoints` | 40.1 dismisses; 39.9 does not |
| `velocityPathRequiresPastEdge` | `|v| > 1` alone does not dismiss unless already past an edge |
| `horizontalDismissOnlyWithMultipleItems` | A single-item row never dismisses horizontally |
| `dismissInterpolationRange` | Offsets −150 / −50 / 0 map to the documented opacity and scale endpoints |

### 15.3 Zoom math

| Test | Assertion |
|---|---|
| `pinchClampsToOneAndTen` | 0.5× and 50× both clamp |
| `pinchIsIncremental` | Two successive 2× changes yield 4×, not 2× |
| `focalJumpOverFiftyPointsDropsPan` | Zoom still applies; translation does not |
| `releaseBelowOnePointOneSnapsToOne` | 1.09 → 1 centered; 1.11 → stays |
| `doubleTapZoomIsThree` | And the tapped point remains under the finger |
| `doubleTapWhileZoomedResets` | Scale 1, offset zero |
| `panClampsToEdges` | `maxX == w(s−1)/2`, `maxY == h(s−1)/2`, at s = 3 |
| `decayOnlyAboveHundredPointsPerSecond` | 99 pt/s stops dead; 101 pt/s decays |
| `zoomLocksPaging` | `isZoomed` sets the scroll lock; un-zooming clears it |
| `pageReuseResetsZoomSynchronously` | No frame renders with the previous item's zoom |

### 15.4 Video source ladder

| Test | Assertion |
|---|---|
| `hlsWins` | HLS source with the DASH fallback as `downloadURL` |
| `fallbackWhenNoHls` | Both fields equal the mp4 |
| `galleryBeatsPreviewVariants` | A gallery post with a preview yields N entries, not 1 |
| `galleryDropsUnprocessedItems` | Entries lacking a `p` array are excluded |
| `galleryOrderFollowsGalleryData` | Not `media_metadata` key order |
| `previewVariantPrefersSourceOverResolutions` | And falls back to the **last** resolution |
| `imgurGifvRewrite` | `.gifv` → `.mp4`, same host |
| `gfycatWaybackRewrite` | Exact URL shape |
| `redgifsFlagsNeedsResolution` | `source` is the raw watch URL |
| `noMatchYieldsEmpty` | Plain link posts produce no videos |
| `aspectRatioDefaultsToPointSevenFive` | With no image dimensions |

### 15.5 Redgifs

| Test | Assertion |
|---|---|
| `idExtractionShapes` | `/watch/<id>`, `/ifr/<id>`, `/i/<id>`, `/<id>`, `media.redgifs.com/<id>.mp4` all yield `<id>` |
| `idExtractionStripsQueryAndExtension` | And a 2–4 char extension only |
| `emptyPathYieldsEmptyIdAndNoRequest` | No call is issued |
| `concurrencyCapIsTwo` | A third request queues |
| `queueIsLifo` | With three queued waiters, the newest runs first when a slot frees |
| `cancelledWhileQueuedConsumesNoSlot` | And is removed |
| `cacheRecheckAfterAcquiringSlot` | A duplicate id resolved by another waiter issues no request |
| `normalBackoffEscalates` | 1 s, 2 s, 3 s |
| `rateLimitCooldownIsThirtySeconds` | And the attempt retries **without** a token refresh |
| `tokenRefreshedOnNonRateLimitFailure` | And on a thrown error |
| `threeAttemptsThenThrows` | Exactly three |
| `cancellationDuringCooldownBailsImmediately` | Slot is not held |
| `cacheIsMemoryOnly` | Nothing is written to persistent storage |
| `hdPreferredOverSd` | And `sd` is used when `hd` is absent |
| `playerErrorOnResolvedSourceBustsCacheOnce` | Second error does not re-bust within one attachment |

### 15.6 Player registry

| Test | Assertion |
|---|---|
| `acquireReturnsSameInstanceForSameKey` | Reference equality |
| `releaseIsDeferred` | Player still alive immediately after `release` |
| `reacquireBeforeDeferredReleaseCancelsIt` | No teardown |
| `peekDoesNotRefCount` | A subsequent single `release` still tears down |
| `evictionOnlyReapsIdle` | A referenced entry survives eviction pressure |
| `evictionLoopsUntilRoom` | Several idle entries reaped in one `acquire` |
| `evictionIsLru` | Oldest idle entry goes first |
| `capIsTwelve` | A 13th distinct key forces an eviction |
| `keyIncludesPreResolutionSourceAndGalleryIndex` | Two gallery items of one post get distinct keys; a Redgifs key is stable across resolution |

### 15.7 Overlay state machine

| Test | Assertion |
|---|---|
| `resolveErrorBeatsEverything` | Even when playing |
| `readinessShortCircuitBeatsLoading` | `currentTime > 0` hides the overlay even with a stale "waiting" flag |
| `playingHidesOverlay` | As does `status == .readyToPlay` |
| `noPlayerShowsNoPlayerAvailable` | With spinner |
| `watchdogTextIncludesAttemptCount` | `"Stalled — retrying (2/3)"` |
| `watchdogTextOnlyBetweenOneAndThree` | 0 and 3 fall through to generic loading |
| `defaultIsLoadingVideo` | Exact string |

### 15.8 Watchdog and fallback

| Test | Assertion |
|---|---|
| `watchdogDelays` | 2 000, 3 000, 4 000 ms |
| `watchdogArmsOnlyWhenNotReady` | And only up to 3 attempts |
| `watchdogDoesNotFireWhenViewerOwnsPlayer` | No replace call |
| `readyResetsAttemptCounter` | Back to 0 |
| `trimStripsQueryOnce` | And only once per attachment |
| `trimExcludesSignedHosts` | `v.redd.it`, `i.redd.it`, `preview.redd.it`, `external-preview.redd.it`, `redgifs.com`, `redgifs.net` all return nil |
| `trimAppliesToSubdomains` | Any subdomain of an excluded host is excluded |
| `trimNotAppliedInFullscreen` | Viewer never trims |

### 15.9 Downloads

| Test | Assertion |
|---|---|
| `largestVariantChosenForImages` | The last element |
| `videoUsesDownloadUrlNotSource` | Even when `source` is HLS |
| `filenameFromLastPathSegment` | Extension preserved, no normalization |
| `staleFileDeletedBeforeWrite` | Same path overwritten |
| `tempFileDeletedOnSuccessAndOnThrow` | Both paths |
| `reentrancyGuardDropsSecondCall` | Exactly one download |
| `scrimDismissDoesNotCancelDownload` | The task continues |

### 15.10 Gallery mode and low data

| Test | Assertion |
|---|---|
| `nonMediaFilterIsFirst` | Ordering of the filter chain |
| `videoPostContributesOneCellPerVideo` | And an image post one per image |
| `videoPriorityWithinAPost` | A post with both yields video cells only |
| `cellAspectUsesPostRatio` | Not the individual image's |
| `viewerRowsArePerPostNotFlat` | A 3-image post is one row of three columns |
| `lowDataShowsOneImageAtSmallestVariant` | And two at largest in normal mode |
| `tapClearsLowDataForThatRow` | Subsequent renders use the full array |
| `lowDataSuppressesLinkCoverImage` | Title/description/URL still present |
| `lowDataSuppressesInlinePlayerRegardlessOfFocus` | And regardless of the autoplay toggle |
| `defaultModeBeforeFirstPathUpdateIsLowData` | Conservative initial value |

### 15.11 OpenGraph

| Test | Assertion |
|---|---|
| `notFetchedWhenVideosPresent` | Zero requests |
| `notFetchedForExcludedSubstrings` | Each of imgur/gfycat/redgifs/.gif/.gifv/.mp4 |
| `svgImageDropped` | Any `og:image` containing `.svg` |
| `onlyOgPropertiesParsed` | `<title>` and `twitter:*` ignored |
| `timeoutIsSeventeenFifty` | 1 750 ms |
| `binaryContentTypeAborts` | Each listed type |
| `failureIsSilent` | Result is nil, no error surfaced |

### 15.12 Caches

| Test | Assertion |
|---|---|
| `m3u8NotCached` | Cacheability decision |
| `gifPathNotCached` | Even with `?format=mp4` |
| `mp4Cached` | And resolved Redgifs URLs |
| `videoClearIsDeferredViaFlag` | No immediate clear; flag set |
| `startupClearRunsAndResetsFlagOnFailure` | Flag cleared either way |
| `imageClearIsImmediate` | Disk cleared, reported size zeroed |
| `memoryWarningClearsMemoryOnly` | Disk untouched |

---

## 16. Traceability

### 16.1 Source spec → this document

| Source (in `docs/swift-rewrite/spec/`) | Section | Covered here |
|---|---|---|
| `05-media.md` §1 (media model), §1.1 (source ladder), §1.2 (link previews) | model + OpenGraph | §1, §11 |
| `spec/05-media.md` §2.1–2.5 (open, paging, dismiss, taps, overlay) | fullscreen viewer | §2 |
| `spec/05-media.md` §3.1–3.4 (image resolution, zoom, Live Text, image menu) | image viewing | §3 |
| `spec/05-media.md` §4.1–4.4 (Redgifs, trim fallback, watchdog, overlay state) | shared video architecture | §4, §6 |
| `05-media.md` §5 (player registry) | registry | §5 |
| `05-media.md` §6 (gif handling) | gif dual paths | §1.2 |
| `spec/05-media.md` §7.1–7.4 (focus, autoplay/mute, FABs, other inline) | feed video | §7 |
| `spec/05-media.md` §8.1–8.3 (fullscreen controls, audio activation, errors) | fullscreen video | §8 |
| `spec/05-media.md` §9.1–9.3 (download/share/save) | downloads | §9 |
| `spec/05-media.md` §10.1–10.4 (gallery mode) | gallery mode | §10 |
| `spec/05-media.md` §11 (low data) | low data | §13 |
| `spec/05-media.md` §12.1–12.2 (caches) | caches | §12 |
| `spec/05-media.md` §13 (settings keys) | settings cross-ref | §7.2, §13, §12 |
| `spec/02-api-contract.md` §2.14–2.15 (Redgifs G1/G2, other hosts), §5.3–5.4 (caches), §6.1–6.6 (third-party services), §8 (throttling table) | endpoints, concurrency, cooldowns | §6, §11, §12 |
| `spec/02-api-contract.md` §4.1.1–4.1.3 (image/video/link extraction) | media derivation | §1 |
| `01-navigation-shell.md` §1 (orientation lock/unlock), §20 (backgrounding) | rotation + background teardown | §2.1, §7.4 |
| `03-feed-and-posts.md` §4.5–4.6 (blur, feed image strip), §9 (focus algorithm), §20 (low data) | feed-side media | §3, §7, §13 |
| `08-feature-inventory.md` D (media), K (sharing/downloading) | acceptance checklist | throughout |
| `09-persistence-pro-utils.md` §2.3 (media caches), §5.2 (media sharing) | caches, share/save | §9, §12 |
| `spec/10-swiftui-2026-baseline.md` A3 (images, media/autoplay/PiP, gestures/zoom/Live Text, lazy stacks, sensory feedback, scene APIs) | component choices | §14 |

### 16.2 Decision tags used in this document

Every id below is the canonical id of a numbered entry in `08-decisions-and-drift.md` §1/§2. There are
no aliases, and the register's "Default (assumed)" column is what this document specs.

| Tag | Subject |
|---|---|
| `ipad-split-view-deferred` | iPad split view out of scope |
| `raw-json-param` | `raw_json=1` on every read; no entity decoding anywhere, `hls_url` included |
| `viewer-zoom-transition` | Enter the viewer with a zoom navigation transition |
| `live-text-dead-setting` | The Live Text toggle is inert in the original; implemented for real here |
| `no-speculative-preload` | No next-video preloading |
| `no-video-longpress-menu` | Video tiles gain a Share / Save / Copy Link long-press menu |
| `background-audio-pip` | No Picture-in-Picture and no background audio; players unmount on background |
| `fullscreen-player-retry` | A hard player error in the viewer is tappable to retry |
| `gate-matrix` | Gallery Mode's 100-item limit is reinstated as a gate, as an inline footer |
| `gallery-mode-no-blur` | Gallery grid cells apply NSFW/spoiler blur |
| `gallery-video-cap` | At most 4 simultaneous gallery-grid players |
| `redgifs-memory-only` | Resolved Redgifs URLs are never persisted |
| `shared-player-registry` | One ref-counted player per video, deferred release, LRU cap 12 |
| `feed-focus-playback` | Focused-only feed playback with the 70 % / 60 % thresholds and 150 ms settle |
| `og-concurrency-cap` | OpenGraph preview fetches capped at 6 concurrent |
| `no-offline-detection` | Offline is distinguished from server error |

### 16.3 Gate tags used in this document

| Gate id | Where |
|---|---|
| `gate.galleryMode` | Gallery Mode's 100-item limit and its inline "Continue with Plus" footer (§10.1) |
| `gate.downloads` | "Save Image" in the image long-press menu (§3.4), "Save Video" in the new video long-press menu (§7.4), and the `save(_:_:)` flow itself (§9). **Sharing stays free** |
| `gate.videoAutoplay` | The two feed FABs and their mirrored Appearance rows (§7.3), covering inline feed autoplay and feed audio (§7.2). **OWNER, default free** — the same seam `04a` §9 tags |

Gates declared in the companion documents and referenced from here: `gate.customThemes`,
`gate.filters`, `gate.sortMemory`, `gate.compose` (`04a`), and `gate.multiAccount`, `gate.gestures`,
`gate.appIcons`, `gate.stats` (`04c`).
