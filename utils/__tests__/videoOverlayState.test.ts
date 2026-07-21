import {
  getVideoOverlayState,
  isVideoVisuallyReady,
} from "../videoOverlayState";
import { MAX_RELOAD_ATTEMPTS } from "../videoWatchdog";

const base = {
  resolveStatus: "ready" as "loading" | "ready" | "error",
  playerStatus: "loading" as string | null,
  hasPlayer: true,
  isPlaying: false,
  currentTime: 0,
  reloadAttempts: 0,
  maxReloadAttempts: MAX_RELOAD_ATTEMPTS,
};

describe("isVideoVisuallyReady", () => {
  it("is ready when the player is playing", () => {
    expect(
      isVideoVisuallyReady({
        playerStatus: "loading",
        isPlaying: true,
        currentTime: 0,
      }),
    ).toBe(true);
  });

  it("is ready when a frame has been decoded (currentTime > 0)", () => {
    expect(
      isVideoVisuallyReady({
        playerStatus: "loading",
        isPlaying: false,
        currentTime: 0.1,
      }),
    ).toBe(true);
  });

  it("is ready when status is readyToPlay even if not yet playing", () => {
    expect(
      isVideoVisuallyReady({
        playerStatus: "readyToPlay",
        isPlaying: false,
        currentTime: 0,
      }),
    ).toBe(true);
  });

  it("is NOT ready when loading with no frames and not playing", () => {
    expect(
      isVideoVisuallyReady({
        playerStatus: "loading",
        isPlaying: false,
        currentTime: 0,
      }),
    ).toBe(false);
  });
});

describe("getVideoOverlayState", () => {
  it("hides the overlay the instant the player is playing, even if status is still loading", () => {
    expect(
      getVideoOverlayState({ ...base, playerStatus: "loading", isPlaying: true })
        .kind,
    ).toBe("hidden");
  });

  it("hides the overlay when a frame has advanced past 0, even if status is loading", () => {
    expect(
      getVideoOverlayState({
        ...base,
        playerStatus: "loading",
        currentTime: 0.25,
      }).kind,
    ).toBe("hidden");
  });

  it("hides the overlay when status is readyToPlay", () => {
    expect(
      getVideoOverlayState({ ...base, playerStatus: "readyToPlay" }).kind,
    ).toBe("hidden");
  });

  it("shows a tappable resolve-error message", () => {
    const o = getVideoOverlayState({ ...base, resolveStatus: "error" });
    expect(o.kind).toBe("resolveError");
    expect(o).toMatchObject({ tappable: true });
    if (o.kind !== "hidden") {
      expect(o.message).toBe("Couldn't load video. Tap to retry.");
    }
  });

  it("shows a non-tappable player-error message (no spinner state)", () => {
    const o = getVideoOverlayState({ ...base, playerStatus: "error" });
    expect(o.kind).toBe("playerError");
    if (o.kind !== "hidden") {
      expect(o.tappable).toBe(false);
      expect(o.message).toBe("Couldn't load video.");
    }
  });

  it("player-error takes precedence over stale playing flags", () => {
    // Defensive: an errored player should never be considered ready.
    expect(
      getVideoOverlayState({
        ...base,
        playerStatus: "error",
        isPlaying: true,
        currentTime: 5,
      }).kind,
    ).toBe("playerError");
  });

  it("shows 'Resolving video…' while the source is resolving", () => {
    const o = getVideoOverlayState({
      ...base,
      resolveStatus: "loading",
      playerStatus: null,
      hasPlayer: false,
    });
    expect(o.kind).toBe("resolving");
    if (o.kind !== "hidden") expect(o.message).toBe("Resolving video…");
  });

  it("shows 'No player available' when resolved but no player exists yet", () => {
    const o = getVideoOverlayState({
      ...base,
      resolveStatus: "ready",
      hasPlayer: false,
      playerStatus: null,
    });
    expect(o.kind).toBe("noPlayer");
    if (o.kind !== "hidden") expect(o.message).toBe("No player available");
  });

  it("shows 'Loading video…' when resolved, player exists, not yet showing frames", () => {
    const o = getVideoOverlayState({ ...base, playerStatus: "loading" });
    expect(o.kind).toBe("loading");
    if (o.kind !== "hidden") expect(o.message).toBe("Loading video…");
  });

  it("shows the watchdog retry progress while stalled and retrying", () => {
    const o = getVideoOverlayState({
      ...base,
      playerStatus: "loading",
      reloadAttempts: 1,
    });
    expect(o.kind).toBe("stalled");
    if (o.kind !== "hidden") {
      expect(o.message).toBe(`Stalled — retrying (1/${MAX_RELOAD_ATTEMPTS})`);
    }
  });

  it("falls back to 'Loading video…' once the retry budget is exhausted", () => {
    const o = getVideoOverlayState({
      ...base,
      playerStatus: "loading",
      reloadAttempts: MAX_RELOAD_ATTEMPTS,
    });
    expect(o.kind).toBe("loading");
  });
});
