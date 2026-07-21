import { useRecyclingState } from "@shopify/flash-list";
import { createContext, useContext, useEffect } from "react";

import {
  getFocusedVideo,
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
