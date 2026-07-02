/**
 * Pure state for focused-only feed video playback (see
 * docs/adr/0003-focused-only-playback.md and CONTEXT.md "Focused Post").
 *
 * At most one feed video owns playback at a time: the Focused Post — the
 * center-most video post on screen once scrolling has settled. This module
 * holds that single focused video key (the video's pre-resolution source URL,
 * the same key the video player registry uses) plus per-key subscriptions so
 * that a focus change re-renders only the two affected cells, never the whole
 * list. It also remembers playback positions independently of player lifetime
 * so a video resumes where it left off even if its player was released while
 * unfocused.
 *
 * Kept free of React/RN imports so the focus/commit/resume logic is unit
 * testable.
 */

type FocusListener = (isFocused: boolean) => void;

// A single global focus key is sufficient because at most one focus-managed
// feed list is on a screen-focused screen at a time (split view pairs a feed
// with an unmanaged PostDetails; blurred screens release their focus). If a
// future layout mounts two focus-managed feeds simultaneously, this needs to
// become per-scroller scoped.
let focusedVideoKey: string | null = null;
const focusListeners = new Map<string, Set<FocusListener>>();

export function getFocusedVideo(): string | null {
  return focusedVideoKey;
}

export function subscribeToVideoFocus(key: string, listener: FocusListener) {
  let listeners = focusListeners.get(key);
  if (!listeners) {
    listeners = new Set();
    focusListeners.set(key, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      focusListeners.delete(key);
    }
  };
}

function notifyFocus(key: string | null, isFocused: boolean) {
  if (key === null) return;
  focusListeners.get(key)?.forEach((listener) => listener(isFocused));
}

export function setFocusedVideo(key: string | null) {
  if (key === focusedVideoKey) return;
  const previous = focusedVideoKey;
  focusedVideoKey = key;
  notifyFocus(previous, false);
  notifyFocus(key, true);
}

/**
 * Playback positions survive player release (the LRU may evict an unfocused
 * player), so regaining focus always resumes rather than restarting.
 */
const playbackPositions = new Map<string, number>();
const MAX_REMEMBERED_POSITIONS = 200;

export function rememberPlaybackPosition(key: string, seconds: number) {
  if (seconds <= 0) {
    playbackPositions.delete(key);
    return;
  }
  // Re-insert so iteration order stays LRU-ish and the cap drops the oldest.
  playbackPositions.delete(key);
  playbackPositions.set(key, seconds);
  if (playbackPositions.size > MAX_REMEMBERED_POSITIONS) {
    const oldest = playbackPositions.keys().next().value;
    if (oldest !== undefined) {
      playbackPositions.delete(oldest);
    }
  }
}

export function getRememberedPlaybackPosition(key: string): number {
  return playbackPositions.get(key) ?? 0;
}

/**
 * Picks which viewable video should be Focused: the one closest to the center
 * of the viewport, approximated as the middle of the currently viewable index
 * range (FlashList view tokens carry indices, not pixel offsets).
 *
 * @param viewableIndices sorted indices of ALL currently viewable items
 * @param videoIndices indices (subset of viewableIndices) that are video posts,
 *   paired with their video key
 * @returns the key that should be focused, or null if no video is viewable
 */
export function pickCenterMostVideo(
  viewableIndices: number[],
  videoIndices: { index: number; key: string }[],
): string | null {
  if (viewableIndices.length === 0 || videoIndices.length === 0) return null;
  // Don't rely on FlashList delivering view tokens in index order.
  const center =
    (Math.min(...viewableIndices) + Math.max(...viewableIndices)) / 2;
  let best = videoIndices[0];
  let bestDistance = Math.abs(best.index - center);
  for (const candidate of videoIndices) {
    const distance = Math.abs(candidate.index - center);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best.key;
}
