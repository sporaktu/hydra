/**
 * Pure state for focused-only feed video playback (see
 * docs/adr/0003-focused-only-playback.md and CONTEXT.md "Focused Post").
 *
 * At most one feed video owns playback at a time: the Focused Post — the
 * center-most fully-visible video post on screen once scrolling has settled.
 * This module holds that single focused video key (the video's pre-resolution
 * source URL, the same key the video player registry uses) plus per-key
 * subscriptions so that a focus change re-renders only the two affected cells,
 * never the whole list. It also owns the geometry that decides which videos
 * are eligible to autoplay at all, and remembers playback positions
 * independently of player lifetime so a video resumes where it left off even
 * if its player was released while unfocused.
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
 * A video's on-screen box and the feed's unobstructed viewport, both in window
 * coordinates (what `measureInWindow` reports), so they can be compared
 * directly. The viewport excludes the navigation header and the tab bar — a
 * video sitting behind either of those is not on screen as far as the user is
 * concerned.
 */
export type VideoRect = { top: number; height: number };
export type FeedViewport = { top: number; height: number };

/**
 * How much of the viewport, top and bottom, must stay clear of a video before
 * it may autoplay. A video is only eligible once it is entirely inside the
 * viewport *and* clear of this buffer on both edges, so playback starts when
 * the video is comfortably on screen rather than the instant a sliver of it
 * pokes in.
 */
export const AUTOPLAY_VIEWPORT_BUFFER = 0.04;

/**
 * Whether a video is far enough inside the viewport to autoplay: fully visible
 * with `buffer` of the viewport height clear above and below it.
 *
 * A video taller than that band (possible in landscape or a short window)
 * could never satisfy the rule, so it qualifies by covering the band instead —
 * at that point it fills everything the buffer leaves visible.
 */
export function isVideoAutoplayEligible(
  rect: VideoRect,
  viewport: FeedViewport,
  buffer = AUTOPLAY_VIEWPORT_BUFFER,
): boolean {
  if (rect.height <= 0 || viewport.height <= 0) return false;
  const inset = viewport.height * buffer;
  const bandTop = viewport.top + inset;
  const bandBottom = viewport.top + viewport.height - inset;
  const rectBottom = rect.top + rect.height;
  if (rect.height > bandBottom - bandTop) {
    return rect.top <= bandTop && rectBottom >= bandBottom;
  }
  return rect.top >= bandTop && rectBottom <= bandBottom;
}

/**
 * Picks which video should be Focused: of the videos that are eligible to
 * autoplay (see `isVideoAutoplayEligible`), the one whose center is closest to
 * the center of the viewport. Ties go to the first candidate.
 *
 * @returns the key that should be focused, or null if no video is eligible
 */
export function pickCenterMostEligibleVideo(
  candidates: { key: string; rect: VideoRect }[],
  viewport: FeedViewport,
  buffer = AUTOPLAY_VIEWPORT_BUFFER,
): string | null {
  const viewportCenter = viewport.top + viewport.height / 2;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (!isVideoAutoplayEligible(candidate.rect, viewport, buffer)) continue;
    const center = candidate.rect.top + candidate.rect.height / 2;
    const distance = Math.abs(center - viewportCenter);
    if (distance < bestDistance) {
      best = candidate.key;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Where each video post currently sits on screen. FlashList view tokens carry
 * indices, not pixel offsets, so the cells themselves report their box (they
 * are the only ones holding a measurable view). Measuring is asynchronous and
 * only happens when the feed is deciding what to focus, never during a scroll.
 */
type RectReporter = (report: (rect: VideoRect | null) => void) => void;
const rectReporters = new Map<string, RectReporter>();

/** A measure that never calls back (detached view) must not stall a decision. */
const MEASURE_TIMEOUT_MS = 250;

export function registerVideoRect(key: string, reporter: RectReporter) {
  rectReporters.set(key, reporter);
  return () => {
    // A recycled cell registers its new key before the old cell's cleanup
    // runs, so only remove the entry if it is still the one we added.
    if (rectReporters.get(key) === reporter) {
      rectReporters.delete(key);
    }
  };
}

function measureVideoRect(key: string): Promise<VideoRect | null> {
  const reporter = rectReporters.get(key);
  if (!reporter) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const settle = (rect: VideoRect | null) => {
      if (settled) return;
      settled = true;
      resolve(rect);
    };
    const timeout = setTimeout(() => settle(null), MEASURE_TIMEOUT_MS);
    reporter((rect) => {
      clearTimeout(timeout);
      settle(rect);
    });
  });
}

/**
 * Measures every given video at once. Videos that are gone, unregistered, or
 * unmeasurable are simply absent from the result (they can't be focused).
 */
export async function measureVideoRects(
  keys: string[],
): Promise<{ key: string; rect: VideoRect }[]> {
  const measured = await Promise.all(
    keys.map(async (key) => ({ key, rect: await measureVideoRect(key) })),
  );
  return measured.filter(
    (entry): entry is { key: string; rect: VideoRect } => entry.rect !== null,
  );
}
