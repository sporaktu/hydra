import {
  shouldArmReloadWatchdog,
  nextReloadDelayMs,
  MAX_RELOAD_ATTEMPTS,
} from "../videoWatchdog";

const base = {
  playerStatus: "loading" as string | null,
  resolveStatus: "ready" as "loading" | "ready" | "error",
  hasPlayerAndSource: true,
  attempts: 0,
};

describe("shouldArmReloadWatchdog", () => {
  it("arms when a resolved player is stuck (not readyToPlay) on screen", () => {
    expect(shouldArmReloadWatchdog({ ...base, playerStatus: "loading" })).toBe(
      true,
    );
    expect(shouldArmReloadWatchdog({ ...base, playerStatus: "idle" })).toBe(
      true,
    );
    // A decoder-spike black box surfaces as error too — reload it.
    expect(shouldArmReloadWatchdog({ ...base, playerStatus: "error" })).toBe(
      true,
    );
  });

  it("does NOT arm once the player is healthy", () => {
    expect(
      shouldArmReloadWatchdog({ ...base, playerStatus: "readyToPlay" }),
    ).toBe(false);
  });

  it("does NOT arm while the source itself is still resolving or errored", () => {
    expect(
      shouldArmReloadWatchdog({ ...base, resolveStatus: "loading" }),
    ).toBe(false);
    expect(shouldArmReloadWatchdog({ ...base, resolveStatus: "error" })).toBe(
      false,
    );
  });

  it("does NOT arm without a player/source yet", () => {
    expect(
      shouldArmReloadWatchdog({
        ...base,
        hasPlayerAndSource: false,
        playerStatus: null,
      }),
    ).toBe(false);
  });

  it("stops after the reload budget is exhausted (no thrash)", () => {
    expect(
      shouldArmReloadWatchdog({ ...base, attempts: MAX_RELOAD_ATTEMPTS - 1 }),
    ).toBe(true);
    expect(
      shouldArmReloadWatchdog({ ...base, attempts: MAX_RELOAD_ATTEMPTS }),
    ).toBe(false);
    expect(
      shouldArmReloadWatchdog({ ...base, attempts: MAX_RELOAD_ATTEMPTS + 5 }),
    ).toBe(false);
  });
});

describe("nextReloadDelayMs", () => {
  it("backs off with each attempt", () => {
    expect(nextReloadDelayMs(0)).toBe(2000);
    expect(nextReloadDelayMs(1)).toBe(3000);
    expect(nextReloadDelayMs(2)).toBe(4000);
    expect(nextReloadDelayMs(1)).toBeGreaterThan(nextReloadDelayMs(0));
  });
});
