/**
 * Tap classification for the fullscreen media viewer.
 *
 * The viewer supports three tap interactions on the same surface:
 *
 * - single tap anywhere        -> toggle the post overlay (chrome)
 * - double tap on a side       -> previous / next item in a gallery
 * - double tap in the middle   -> play/pause the current video
 *
 * These helpers are pure so the (fiddly) thresholds can be tested without a
 * renderer; `useMediaViewerTaps` wires them to the platform viewers.
 */

/** A tap must not travel further than this, in points, to count as a tap. */
export const TAP_MAX_MOVEMENT = 10;
/** …nor last longer than this. */
export const TAP_MAX_DURATION_MS = 300;

/** The second tap of a double tap has to land within this long… */
export const DOUBLE_TAP_MAX_DELAY_MS = 280;
/** …and this close to the first one. */
export const DOUBLE_TAP_MAX_MOVEMENT = 45;

/** Fraction of the viewer's width, on each edge, that counts as a side tap. */
export const SIDE_TAP_ZONE_FRACTION = 0.3;

export type TapPoint = {
  x: number;
  y: number;
  timestamp: number;
};

export type TapZone = "left" | "middle" | "right";

export function isTap(start: TapPoint, end: TapPoint): boolean {
  return (
    Math.abs(end.x - start.x) < TAP_MAX_MOVEMENT &&
    Math.abs(end.y - start.y) < TAP_MAX_MOVEMENT &&
    end.timestamp - start.timestamp < TAP_MAX_DURATION_MS
  );
}

export function isDoubleTap(previous: TapPoint, next: TapPoint): boolean {
  return (
    next.timestamp - previous.timestamp < DOUBLE_TAP_MAX_DELAY_MS &&
    Math.abs(next.x - previous.x) < DOUBLE_TAP_MAX_MOVEMENT &&
    Math.abs(next.y - previous.y) < DOUBLE_TAP_MAX_MOVEMENT
  );
}

/**
 * Everything is "middle" when the side zones are inactive (a single-item post,
 * or a zoomed image that owns the gesture), so a lone video gets the whole
 * screen for play/pause instead of two dead edges.
 */
export function getTapZone(
  x: number,
  width: number,
  sidesEnabled: boolean,
): TapZone {
  if (!sidesEnabled || width <= 0) return "middle";
  if (x < width * SIDE_TAP_ZONE_FRACTION) return "left";
  if (x > width * (1 - SIDE_TAP_ZONE_FRACTION)) return "right";
  return "middle";
}
