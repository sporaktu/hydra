# Spec: Focused-only video playback + feed audio toggle

**Execution order: 2 of 4** (after `01-perf-quick-wins.md`; independent of the others).

## Background

Two user-facing problems, one architectural cause:

1. **The stale-video bug.** When scrolling fast, a video post often shows the *previous* post's video — it "looks like a video the user already viewed" until the player catches up.
2. **No feed audio.** There is no way to hear a video without opening it; the user wants a toggle that gives the center-most feed video autoplay-with-audio.

**Diagnosed root cause of (1):** FlashList v2 recycles feed cells. When a cell is recycled from post A to post B:

- `useSharedVideoPlayer` (`contexts/VideoPlayerRegistryContext.tsx:96-121`) acquires the new player in a post-commit `useEffect` and exposes it via `useState` — so the first render(s) of the recycled cell still bind `<VideoView>` (`components/UI/Gallery/Video.tsx:287-295`) to post A's *actively playing* player.
- The black loading overlay is deliberately hidden whenever the bound player `isPlaying || currentTime > 0 || status === "readyToPlay"` (`utils/videoOverlayState.ts:49-59,100-102` — that gate was the fix for the fullscreen black-box bug), so nothing masks the stale video.
- There is no poster image and no reset-on-recycle; `useResolvedVideoSource` state (`utils/useResolvedVideoSource.ts:20-27`) also lags one render on recycle.
- Because every mounted video cell autoplays (`Video.tsx:52`, and the re-issuing play effect at `Video.tsx:125-132`), there is no concept of "the current video" that could correct a mis-bound cell.

## The design (all decisions final — do not relitigate)

### Focused Post (see `CONTEXT.md` glossary)

At most one post owns video playback: the **Focused Post** — the center-most video post on screen once scrolling has settled (~150ms of viewport stability; tune between 100-200ms). During a fast fling, no post is Focused. This replaces "every mounted cell autoplays."

### Behavior matrix

| State | What a video post shows |
|---|---|
| Not focused (including during fling) | **Poster**: the post's Reddit preview thumbnail via `expo-image`, with a play-icon + duration badge. **No video player attached at all.** |
| Becomes Focused | Player acquired/attached; poster stays visible until the player has a decoded frame for the *correct* source, then crossfades out. Playback starts muted, or with audio if the feed-audio toggle is on. |
| Loses focus | Player detaches (registry release); poster returns. Playback position is remembered. |
| Regains focus later | **Resume** from the remembered position — always, even if the LRU evicted the player. Keep an in-memory `Map<videoKey, positionSeconds>`; seek after re-acquire. |

This structurally fixes the stale-video bug: a recycled cell renders a poster (cheap, correct, cached) on first render, and non-focused players never play, so stale playing frames cannot appear.

### Feed audio toggle

- **Persistent global toggle** (MMKV), always-on or always-off — not per-session.
- Surfaced as a **floating action button** on feed pages: bottom-right, above the tab bar, small and semi-translucent, speaker icon (`speaker.wave.2` on / `speaker.slash` off). Apollo-style. Also mirrored as a row in Settings for discoverability.
- When ON: the Focused Post plays **unmuted**. Audio **interrupts** background audio (Spotify etc.) — standard iOS behavior, do not mix/duck. Audio plays **even when the hardware silent switch is on** (the toggle is an explicit "I want sound" signal — configure the audio session accordingly, e.g. playback category).
- When OFF: the Focused Post plays muted (current mute behavior).

## Implementation pointers

- **Focus tracking:** extend `onViewableItemsChanged` / viewability config in `pages/PostsPage.tsx:197-210` (currently only marks posts seen) or use scroll-settle detection in `components/UI/RedditDataScroller.tsx`. Compute the video post whose center is nearest the viewport center; debounce by the settle threshold. Expose via a context or the existing registry so exactly one `Video` instance knows it is Focused.
- **Player registry:** `utils/VideoPlayerRegistry.ts` + `contexts/VideoPlayerRegistryContext.tsx` + `docs/adr/0002-shared-video-player-registry.md`. The registry stays (it exists so inline feed and the fullscreen viewer share one player per video — preserve that). With focused-only playback the live-player count drops to ~1-2, so the LRU cap (`DEFAULT_MAX_LIVE_PLAYERS = 12`, `VideoPlayerRegistry.ts:25`) becomes a safety net rather than a hot path. Consider acquiring the *next* likely Focused Post's player speculatively (one ahead in scroll direction) so focus-gain feels instant.
- **Poster:** Reddit post data already carries preview thumbnails (see how `components/RedditDataRepresentations/Post/PostParts/PostMediaParts/ImageViewer.tsx` renders feed images with `expo-image`). Render the poster inside `Video.tsx` / `PostMediaParts/VideoPlayer.tsx` as the base layer; the `<VideoView>` mounts on top only when Focused.
- **Autoplay logic to remove:** the unconditional `player.play()` at `Video.tsx:52` and the always-play effect at `Video.tsx:125-132` must become focus-gated. The overlay logic in `utils/videoOverlayState.ts` simplifies dramatically once posters exist — the black `notReadyContainer` (`Video.tsx:256-286, 334-344`) and the watchdog (`utils/videoWatchdog.ts`, `Video.tsx:144-180`) should be re-evaluated: with poster-first rendering, the black box should never be user-visible in the feed. Do not regress the fullscreen fixes from commits #12-#14.
- **Resolution ("Resolve" — see CONTEXT.md):** lazy Redgifs resolution (`utils/useResolvedVideoSource.ts`, `utils/RedGifs.ts` queue with `MAX_CONCURRENT_RESOLUTIONS = 2`, LIFO visible-first) now only needs to run for the Focused Post (+ the speculative next). Posters need no resolution. This shrinks resolution queue pressure; keep the 429 cooldown behavior.
- **Fullscreen viewer:** `components/UI/MediaViewer.tsx/*` keeps its own focus/pause logic (`MediaVideo.ios.tsx:222-245`); fullscreen playback is always eligible for audio as today. The shared-player handoff (inline ↔ fullscreen) must keep working, including position continuity.
- **FAB:** new component on feed pages (`pages/PostsPage.tsx` render tree); MMKV-backed setting in a `SettingsContexts` sub-context; settings row under a sensible existing section (e.g. General or Appearance → Autoplay).

## Out of scope

- Actual animated `.gif` *images* (rendered by `expo-image`, not a video player) keep animating regardless of focus — they are images, not videos.
- Comment-section videos and the fullscreen viewer's playback rules (unchanged beyond the shared-player handoff continuing to work).
- Android parity is desirable but iOS is the acceptance platform.

## Acceptance criteria

1. **Fast-fling test:** fling through a video-heavy feed (e.g. r/gifs). At no point does any cell display frames from a different post's video. Cells show posters instantly; the landed-on video begins playing only after the scroll settles.
2. Exactly one feed video plays at a time; scrolled-away videos show posters.
3. Scrolling away from a playing video and back resumes it from where it left off (test both quick scroll-away and far scroll-away that evicts the player).
4. FAB toggles feed audio; state survives app relaunch; Settings row mirrors it.
5. With audio on: focused video plays sound, interrupts background music, and plays through the silent switch. With audio off: fully muted.
6. Opening a feed video into the fullscreen viewer keeps the same player (no reload, position continuous); closing it returns playback state to the feed correctly.
7. No black loading boxes in the feed; fullscreen viewer black-box behavior (commits #12-#14) not regressed.
8. Battery/CPU sanity: simultaneous live players during steady feed browsing ≤ 2 (was up to 12).
