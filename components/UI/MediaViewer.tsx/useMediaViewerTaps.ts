import { useCallback, useEffect, useRef } from "react";
import { GestureResponderEvent } from "react-native";

import {
  DOUBLE_TAP_MAX_DELAY_MS,
  getTapZone,
  isDoubleTap,
  isTap,
  TapPoint,
} from "../../../utils/mediaViewerTaps";

type MediaViewerTapOptions = {
  /** Width of the viewer, used to split the screen into side/middle zones. */
  width: number;
  /**
   * Whether a side double tap should page the gallery right now — false for a
   * single-item post, and while a zoomed image owns the gesture.
   */
  canPageSides: () => boolean;
  /** Whether a middle double tap has a video to play/pause right now. */
  canTogglePlayback: () => boolean;
  /** Toggle the post overlay. */
  onSingleTap: () => void;
  onSideDoubleTap: (direction: "left" | "right") => void;
  onMiddleDoubleTap: () => void;
};

/**
 * Touch handlers for the viewer's content container, classifying taps into the
 * single/double interactions described in `utils/mediaViewerTaps`.
 *
 * A single tap fires immediately (the overlay must feel instant) *unless* a
 * double tap in that zone would do something — then it waits out the
 * double-tap window, so double tapping to page or pause doesn't also flip the
 * chrome. Zones with no double-tap action never pay that delay.
 */
export function useMediaViewerTaps({
  width,
  canPageSides,
  canTogglePlayback,
  onSingleTap,
  onSideDoubleTap,
  onMiddleDoubleTap,
}: MediaViewerTapOptions) {
  const touchStart = useRef<TapPoint | null>(null);
  const pendingTap = useRef<TapPoint | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingTap = useCallback(() => {
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    pendingTap.current = null;
  }, []);

  useEffect(() => clearPendingTap, [clearPendingTap]);

  const onTouchStart = (e: GestureResponderEvent) => {
    touchStart.current = {
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
      timestamp: Date.now(),
    };
  };

  const onTouchEnd = (e: GestureResponderEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;

    const end = {
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
      timestamp: Date.now(),
    };
    if (!isTap(start, end)) {
      // A drag (page/dismiss/scrub) also cancels a half-finished double tap.
      clearPendingTap();
      return;
    }

    const previousTap = pendingTap.current;
    const zone = getTapZone(end.x, width, canPageSides());

    if (previousTap && isDoubleTap(previousTap, end)) {
      clearPendingTap();
      if (zone === "middle") {
        if (canTogglePlayback()) onMiddleDoubleTap();
      } else {
        onSideDoubleTap(zone);
      }
      return;
    }

    clearPendingTap();
    if (zone === "middle" && !canTogglePlayback()) {
      onSingleTap();
      return;
    }
    pendingTap.current = end;
    pendingTimer.current = setTimeout(() => {
      pendingTimer.current = null;
      pendingTap.current = null;
      onSingleTap();
    }, DOUBLE_TAP_MAX_DELAY_MS);
  };

  return { onTouchStart, onTouchEnd };
}
