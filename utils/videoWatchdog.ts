// Pure decision logic for the self-healing video watchdog used by
// components/UI/Gallery/Video.tsx. Kept here (free of expo-video / RN deps) so
// the recovery behavior can be unit-tested directly.

export const MAX_RELOAD_ATTEMPTS = 3;

type WatchdogInput = {
  /** Mirrored expo-video player.status, or null if no player yet. */
  playerStatus: string | null;
  /** Resolution status of the source ("loading" | "ready" | "error"). */
  resolveStatus: "loading" | "ready" | "error";
  /** Whether a player + resolved source currently exist. */
  hasPlayerAndSource: boolean;
  /** How many reloads have already been attempted for this player. */
  attempts: number;
};

/**
 * A player is "stuck" when it is on-screen (this component only renders while
 * its cell is mounted) and has a resolved source, but has not reached
 * readyToPlay. During a fast fling iOS hasn't freed enough AVPlayer decoders
 * yet, so a freshly-created player can come up black and never recover on its
 * own — we reload it once conditions ease. readyToPlay means healthy; a non-ready
 * resolve (still loading / errored) means it isn't this watchdog's job yet.
 */
export function shouldArmReloadWatchdog(input: WatchdogInput): boolean {
  const { playerStatus, resolveStatus, hasPlayerAndSource, attempts } = input;
  if (!hasPlayerAndSource) return false;
  if (resolveStatus !== "ready") return false;
  if (playerStatus === "readyToPlay") return false;
  if (attempts >= MAX_RELOAD_ATTEMPTS) return false;
  return true;
}

/**
 * Watchdog delay before reloading, in ms. Backs off a little each attempt so a
 * genuinely dead source doesn't reload in a tight loop.
 */
export function nextReloadDelayMs(attempts: number): number {
  return 2000 + attempts * 1000;
}
