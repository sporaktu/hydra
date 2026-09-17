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

/**
 * How much of a video post has to be on screen before it may become the
 * Focused Post. A post is "mostly visible" when EITHER holds:
 *
 * - at least FOCUS_ITEM_VISIBLE_PERCENT of the post itself is on screen (the
 *   normal case), or
 * - the post covers at least FOCUS_VIEWPORT_COVERAGE_PERCENT of the viewport
 *   (a post taller than the viewport can never satisfy the first rule, and on
 *   a small phone a video post with a long title can be).
 *
 * The feed list registers one viewability config per rule and feeds the
 * union of both into decideFeedVideoFocus. Without these, a video's first
 * pixel scrolling into view was enough to start it playing.
 */
export const FOCUS_ITEM_VISIBLE_PERCENT = 70;
export const FOCUS_VIEWPORT_COVERAGE_PERCENT = 60;

/** The parts of a FlashList ViewToken this module reads. */
export type ViewabilityToken = {
  index: number | null;
  isViewable: boolean;
  item: unknown;
};

export type VideoCandidates = {
  /** Sorted, de-duplicated indices of every viewable item. */
  viewableIndices: number[];
  /** The viewable items that are video posts, with their video key. */
  videoIndices: { index: number; key: string }[];
};

/**
 * Collapses one or more lists of view tokens (the same index may appear in
 * several) into the inputs pickCenterMostVideo wants.
 */
export function collectVideoCandidates(
  tokens: ViewabilityToken[],
): VideoCandidates {
  const seen = new Set<number>();
  const viewableIndices: number[] = [];
  const videoIndices: { index: number; key: string }[] = [];
  for (const token of tokens) {
    if (!token.isViewable || token.index === null) continue;
    if (seen.has(token.index)) continue;
    seen.add(token.index);
    viewableIndices.push(token.index);
    const item = token.item as { videos?: { source: string }[] } | undefined;
    const key = item?.videos?.[0]?.source;
    if (key) {
      videoIndices.push({ index: token.index, key });
    }
  }
  viewableIndices.sort((a, b) => a - b);
  videoIndices.sort((a, b) => a.index - b.index);
  return { viewableIndices, videoIndices };
}

export type FocusDecision = {
  /**
   * The video this feed has focused left the screen entirely: release focus
   * now, before any settle debounce, so its audio never outlives it.
   */
  releaseNow: boolean;
  /**
   * What to focus once scrolling settles: a video key, null for "nothing
   * should play", or undefined to leave things as they are (and drop any
   * pending change).
   */
  pending: string | null | undefined;
};

/**
 * Decides the next Focused Post from two views of the feed:
 *
 * @param mostlyVisible tokens for items meeting the "mostly visible" rules
 *   above (the union of both configs; duplicates are fine)
 * @param anyVisible tokens for items with any pixel on screen
 * @param focusedKey the globally focused video key, if any
 * @param ownsFocus whether that focus belongs to this feed
 * @param keepVisibleFocus when true, the focused video keeps focus as long as
 *   any of it is on screen, even if another video is now more central. For
 *   re-evaluating from viewability snapshots that may be about to change
 *   (e.g. the fullscreen viewer just closed and the feed is rotating back to
 *   portrait): without it a briefly-central video would start, with audio,
 *   only to hand focus straight back.
 *
 * Starting is strict: only a mostly visible video can become Focused, and the
 * center-most of those wins. Stopping is lenient: once playing, a video keeps
 * focus while any of it is on screen and nothing mostly visible replaces it,
 * so nudging the feed a little doesn't cut a video off mid-play.
 */
export function decideFeedVideoFocus({
  mostlyVisible,
  anyVisible,
  focusedKey,
  ownsFocus,
  keepVisibleFocus = false,
}: {
  mostlyVisible: ViewabilityToken[];
  anyVisible: ViewabilityToken[];
  focusedKey: string | null;
  ownsFocus: boolean;
  keepVisibleFocus?: boolean;
}): FocusDecision {
  const { viewableIndices, videoIndices } =
    collectVideoCandidates(mostlyVisible);
  const stillOnScreen =
    focusedKey !== null &&
    collectVideoCandidates(anyVisible).videoIndices.some(
      (video) => video.key === focusedKey,
    );
  if (keepVisibleFocus && stillOnScreen) {
    return { releaseNow: false, pending: undefined };
  }
  const releaseNow = ownsFocus && focusedKey !== null && !stillOnScreen;
  const effectiveFocused = releaseNow ? null : focusedKey;

  const candidate = pickCenterMostVideo(viewableIndices, videoIndices);
  if (candidate === effectiveFocused) {
    return { releaseNow, pending: undefined };
  }
  if (candidate === null && effectiveFocused !== null) {
    // Hysteresis: the focused video is only partly visible and nothing else
    // qualifies yet. Keep it going rather than flipping it to its Poster.
    return { releaseNow, pending: undefined };
  }
  return { releaseNow, pending: candidate };
}
