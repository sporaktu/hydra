// Pure decision logic for the inline video loading/error overlay rendered by
// components/UI/Gallery/Video.tsx. Kept here (free of expo-video / RN deps) so
// the "never cover a playing video" behavior and the diagnostic copy can be
// unit-tested directly.
//
// The overlay is an OPAQUE BLACK tile that sits on top of the <VideoView>. The
// core bug it caused: it was gated purely on a mirrored `statusChange` value, so
// when a (often recycled) shared player was already decoding/playing underneath
// — but this component never observed a `loading` -> `readyToPlay` transition —
// the black tile stayed up forever, hiding a perfectly good video. The fix is to
// treat the player as ready the moment ANY live readiness signal is true:
// it is playing, it has advanced past frame 0, or its status is readyToPlay.

import type { MAX_RELOAD_ATTEMPTS as _Max } from "./videoWatchdog";

export type VideoResolveStatus = "loading" | "ready" | "error";

export type VideoOverlayInput = {
  /** Resolution status of the (possibly redgifs) source. */
  resolveStatus: VideoResolveStatus;
  /** Mirrored expo-video player.status, or null if no player yet. */
  playerStatus: string | null;
  /** Whether a player instance currently exists. */
  hasPlayer: boolean;
  /** Live player.playing — true once frames are actually being presented. */
  isPlaying: boolean;
  /** Live player.currentTime — > 0 means a frame has been decoded/shown. */
  currentTime: number;
  /** How many self-healing reloads the watchdog has attempted. */
  reloadAttempts: number;
  /** Cap from videoWatchdog (passed in to avoid importing RN-adjacent code). */
  maxReloadAttempts: number;
};

export type VideoOverlayState =
  | { kind: "hidden" }
  | { kind: "resolveError"; message: string; tappable: true }
  | { kind: "playerError"; message: string; tappable: false }
  | { kind: "resolving"; message: string; tappable: false }
  | { kind: "loading"; message: string; tappable: false }
  | { kind: "noPlayer"; message: string; tappable: false }
  | { kind: "stalled"; message: string; tappable: false };

/**
 * Robust readiness gate: the underlying video is showing real content as soon as
 * ANY of these is true, regardless of whether we saw the `statusChange` event.
 * This is what guarantees the black overlay can never cover a playing video.
 */
export function isVideoVisuallyReady(input: {
  playerStatus: string | null;
  isPlaying: boolean;
  currentTime: number;
}): boolean {
  return (
    input.isPlaying ||
    input.currentTime > 0 ||
    input.playerStatus === "readyToPlay"
  );
}

/**
 * Decides what (if anything) the overlay shows, and the exact diagnostic copy.
 * Order matters: resolve-error and player-error take precedence (they are
 * terminal/actionable), then readiness short-circuits everything else so a
 * playing video is never covered, then the remaining "still working" states map
 * to a specific, self-explanatory message instead of a featureless black box.
 */
export function getVideoOverlayState(
  input: VideoOverlayInput,
): VideoOverlayState {
  const {
    resolveStatus,
    playerStatus,
    hasPlayer,
    isPlaying,
    currentTime,
    reloadAttempts,
    maxReloadAttempts,
  } = input;

  if (resolveStatus === "error") {
    return {
      kind: "resolveError",
      message: "Couldn't load video. Tap to retry.",
      tappable: true,
    };
  }

  // A hard player error is terminal regardless of stale readiness flags.
  if (playerStatus === "error") {
    return {
      kind: "playerError",
      message: "Couldn't load video.",
      tappable: false,
    };
  }

  // The critical short-circuit: if the player is actually showing frames, hide
  // the overlay no matter what the (possibly missed) status event says.
  if (isVideoVisuallyReady({ playerStatus, isPlaying, currentTime })) {
    return { kind: "hidden" };
  }

  if (resolveStatus === "loading") {
    return { kind: "resolving", message: "Resolving video…", tappable: false };
  }

  if (!hasPlayer) {
    return { kind: "noPlayer", message: "No player available", tappable: false };
  }

  // The watchdog is actively retrying a stuck player — say so, with progress.
  if (reloadAttempts > 0 && reloadAttempts < maxReloadAttempts) {
    return {
      kind: "stalled",
      message: `Stalled — retrying (${reloadAttempts}/${maxReloadAttempts})`,
      tappable: false,
    };
  }

  // Resolved + player exists + not yet showing frames: genuinely loading.
  return { kind: "loading", message: "Loading video…", tappable: false };
}

// Keep a structural reference so a future change to MAX_RELOAD_ATTEMPTS's type
// surfaces here too (the value is passed in at call time to keep this pure).
export type _MaxReloadAttempts = typeof _Max;
