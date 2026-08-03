import { useRecyclingState } from "@shopify/flash-list";
import { createContext, useContext, useEffect, useRef } from "react";
import { View } from "react-native";

import {
  getFocusedVideo,
  registerVideoRect,
  subscribeToVideoFocus,
} from "../utils/FeedVideoFocus";

/**
 * True inside a feed list that manages focused-only video playback (see
 * docs/adr/0003-focused-only-playback.md). Surfaces that don't manage focus
 * (post details, gallery, fullscreen viewer) leave the default false, and
 * their videos behave as always-focused.
 */
export const FeedVideoFocusContext = createContext(false);

/**
 * Whether the video with this key is the Focused Post's video. Re-renders
 * only when THIS key's focus state changes — a focus change elsewhere in the
 * feed doesn't touch this cell.
 */
export function useVideoFocus(videoKey: string): {
  focusManaged: boolean;
  isFocused: boolean;
} {
  const focusManaged = useContext(FeedVideoFocusContext);

  // useRecyclingState resets synchronously when FlashList recycles this cell
  // onto a different video, so a recycled cell never renders a frame with the
  // previous cell's focus state (outside a FlashList it degrades to useState).
  const [isFocused, setIsFocused] = useRecyclingState(
    () => getFocusedVideo() === videoKey,
    [videoKey, focusManaged],
  );

  useEffect(() => {
    if (!focusManaged) return;
    return subscribeToVideoFocus(videoKey, setIsFocused);
  }, [videoKey, focusManaged, setIsFocused]);

  return { focusManaged, isFocused: focusManaged ? isFocused : true };
}

/**
 * Lets the feed find out where this video sits on screen, which is what
 * decides whether it is far enough inside the viewport to autoplay. Attach the
 * returned ref to the view that wraps the video (the media box, not the whole
 * post — only the video itself has to be visible).
 *
 * Outside a focus-managed feed nothing measures anything.
 */
export function useVideoRectReporter(videoKey: string) {
  const focusManaged = useContext(FeedVideoFocusContext);
  const mediaRef = useRef<View>(null);

  useEffect(() => {
    if (!focusManaged || !videoKey) return;
    return registerVideoRect(videoKey, (report) => {
      const media = mediaRef.current;
      if (!media) {
        report(null);
        return;
      }
      media.measureInWindow((_x, y, _width, height) => {
        // A cell that is mounted but not laid out (or already detached)
        // measures as zero/undefined — it can't be judged, so it can't play.
        report(height > 0 && Number.isFinite(y) ? { top: y, height } : null);
      });
    });
  }, [videoKey, focusManaged]);

  return mediaRef;
}
