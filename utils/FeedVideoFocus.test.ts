/**
 * Unit tests for the pure focused-only playback state (see
 * docs/specs/02-focused-video-playback.md and ADR 0003). Covers the single
 * focused-key store + per-key subscriptions, the remembered-position LRU that
 * survives player release, and the geometry that decides which video may
 * autoplay (fully on screen, clear of the viewport edge buffer, center-most).
 *
 * The module holds process-global state (a focused key, a listener map, and a
 * positions map), so each test re-requires a fresh copy via jest.resetModules
 * rather than sharing state across tests.
 */

type FeedVideoFocus = typeof import("./FeedVideoFocus");

let focus: FeedVideoFocus;
beforeEach(() => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  focus = require("./FeedVideoFocus");
});

describe("setFocusedVideo / getFocusedVideo / subscribeToVideoFocus", () => {
  it("starts with no focused video", () => {
    expect(focus.getFocusedVideo()).toBeNull();
  });

  it("stores the focused key and reports it via getFocusedVideo", () => {
    focus.setFocusedVideo("a");
    expect(focus.getFocusedVideo()).toBe("a");
  });

  it("notifies the newly focused key's listener with true", () => {
    const listener = jest.fn();
    focus.subscribeToVideoFocus("a", listener);

    focus.setFocusedVideo("a");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(true);
  });

  it("notifies the previously focused key's listener with false on a change", () => {
    const oldListener = jest.fn();
    const newListener = jest.fn();
    focus.subscribeToVideoFocus("old", oldListener);
    focus.subscribeToVideoFocus("new", newListener);

    focus.setFocusedVideo("old");
    oldListener.mockClear();

    focus.setFocusedVideo("new");

    expect(oldListener).toHaveBeenCalledTimes(1);
    expect(oldListener).toHaveBeenCalledWith(false);
    expect(newListener).toHaveBeenCalledWith(true);
  });

  it("treats setting the same key as a no-op (no duplicate notifications)", () => {
    const listener = jest.fn();
    focus.subscribeToVideoFocus("a", listener);

    focus.setFocusedVideo("a");
    focus.setFocusedVideo("a");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clears focus with null and notifies the old key with false", () => {
    const listener = jest.fn();
    focus.subscribeToVideoFocus("a", listener);
    focus.setFocusedVideo("a");
    listener.mockClear();

    focus.setFocusedVideo(null);

    expect(focus.getFocusedVideo()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(false);
  });

  it("leaves listeners for uninvolved keys untouched on a focus change", () => {
    const involved = jest.fn();
    const bystander = jest.fn();
    focus.subscribeToVideoFocus("a", involved);
    focus.subscribeToVideoFocus("b", bystander);

    focus.setFocusedVideo("a");

    expect(involved).toHaveBeenCalledWith(true);
    expect(bystander).not.toHaveBeenCalled();
  });

  it("notifies every listener subscribed to the same key", () => {
    const first = jest.fn();
    const second = jest.fn();
    focus.subscribeToVideoFocus("a", first);
    focus.subscribeToVideoFocus("a", second);

    focus.setFocusedVideo("a");

    expect(first).toHaveBeenCalledWith(true);
    expect(second).toHaveBeenCalledWith(true);
  });

  it("stops notifying after the returned unsubscribe is called", () => {
    const listener = jest.fn();
    const unsubscribe = focus.subscribeToVideoFocus("a", listener);

    unsubscribe();
    focus.setFocusedVideo("a");

    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the remaining listener working when one of several unsubscribes", () => {
    const stays = jest.fn();
    const leaves = jest.fn();
    focus.subscribeToVideoFocus("a", stays);
    const unsubscribeLeaves = focus.subscribeToVideoFocus("a", leaves);

    unsubscribeLeaves();
    focus.setFocusedVideo("a");

    expect(leaves).not.toHaveBeenCalled();
    expect(stays).toHaveBeenCalledWith(true);
  });

  it("does not notify a key whose only listener has since unsubscribed", () => {
    const listener = jest.fn();
    const unsubscribe = focus.subscribeToVideoFocus("a", listener);
    unsubscribe();

    // The map entry for "a" was removed; setting focus must not throw.
    expect(() => focus.setFocusedVideo("a")).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("rememberPlaybackPosition / getRememberedPlaybackPosition", () => {
  it("returns 0 for a key that was never remembered", () => {
    expect(focus.getRememberedPlaybackPosition("unknown")).toBe(0);
  });

  it("remembers and returns a position for a key", () => {
    focus.rememberPlaybackPosition("a", 12.5);
    expect(focus.getRememberedPlaybackPosition("a")).toBe(12.5);
  });

  it("overwrites an existing position with the latest value", () => {
    focus.rememberPlaybackPosition("a", 5);
    focus.rememberPlaybackPosition("a", 9);
    expect(focus.getRememberedPlaybackPosition("a")).toBe(9);
  });

  it("deletes the remembered position when set to 0", () => {
    focus.rememberPlaybackPosition("a", 7);
    focus.rememberPlaybackPosition("a", 0);
    expect(focus.getRememberedPlaybackPosition("a")).toBe(0);
  });

  it("deletes the remembered position when set to a negative value", () => {
    focus.rememberPlaybackPosition("a", 7);
    focus.rememberPlaybackPosition("a", -3);
    expect(focus.getRememberedPlaybackPosition("a")).toBe(0);
  });

  it("caps at 200 entries, evicting the oldest when the 201st is added", () => {
    for (let i = 0; i < 201; i++) {
      focus.rememberPlaybackPosition(`k${i}`, i + 1);
    }
    // The first-inserted key (k0) was evicted; the newest (k200) survives.
    expect(focus.getRememberedPlaybackPosition("k0")).toBe(0);
    expect(focus.getRememberedPlaybackPosition("k200")).toBe(201);
    expect(focus.getRememberedPlaybackPosition("k1")).toBe(2);
  });

  it("re-remembering an existing key refreshes its recency so it survives eviction", () => {
    for (let i = 0; i < 200; i++) {
      focus.rememberPlaybackPosition(`k${i}`, i + 1);
    }
    // Refresh the oldest key so it becomes the most-recently used.
    focus.rememberPlaybackPosition("k0", 999);
    // The next insert pushes over the cap; k1 (now the oldest) is evicted.
    focus.rememberPlaybackPosition("k200", 1);

    expect(focus.getRememberedPlaybackPosition("k0")).toBe(999);
    expect(focus.getRememberedPlaybackPosition("k1")).toBe(0);
    expect(focus.getRememberedPlaybackPosition("k200")).toBe(1);
  });
});

// A 1000pt-tall viewport starting at the top of the window: the 4% buffer
// leaves videos eligible only between y=40 and y=960.
const VIEWPORT = { top: 0, height: 1000 };

describe("isVideoAutoplayEligible", () => {
  it("accepts a video sitting well inside the viewport", () => {
    expect(
      focus.isVideoAutoplayEligible({ top: 300, height: 400 }, VIEWPORT),
    ).toBe(true);
  });

  it("accepts a video that exactly fills the buffered band", () => {
    expect(
      focus.isVideoAutoplayEligible({ top: 40, height: 920 }, VIEWPORT),
    ).toBe(true);
  });

  it("rejects a video hanging off the bottom of the screen", () => {
    expect(
      focus.isVideoAutoplayEligible({ top: 800, height: 400 }, VIEWPORT),
    ).toBe(false);
  });

  it("rejects a video hanging off the top of the screen", () => {
    expect(
      focus.isVideoAutoplayEligible({ top: -100, height: 400 }, VIEWPORT),
    ).toBe(false);
  });

  it("rejects a fully visible video that is inside the buffer", () => {
    // Entirely on screen (0..1000) but only 20pt clear of the bottom edge.
    expect(
      focus.isVideoAutoplayEligible({ top: 580, height: 400 }, VIEWPORT),
    ).toBe(false);
  });

  it("measures the buffer against the viewport, not the video", () => {
    // A short viewport shrinks the buffer with it: 4% of 100 is 4pt.
    const shortViewport = { top: 0, height: 100 };
    expect(
      focus.isVideoAutoplayEligible({ top: 5, height: 90 }, shortViewport),
    ).toBe(true);
    expect(
      focus.isVideoAutoplayEligible({ top: 2, height: 90 }, shortViewport),
    ).toBe(false);
  });

  it("offsets the buffered band by the top of the viewport", () => {
    // A viewport starting below a 100pt header: the band is 140..1060.
    const insetViewport = { top: 100, height: 1000 };
    expect(
      focus.isVideoAutoplayEligible({ top: 120, height: 400 }, insetViewport),
    ).toBe(false);
    expect(
      focus.isVideoAutoplayEligible({ top: 200, height: 400 }, insetViewport),
    ).toBe(true);
  });

  it("accepts a video taller than the band when it covers the band", () => {
    expect(
      focus.isVideoAutoplayEligible({ top: -20, height: 1040 }, VIEWPORT),
    ).toBe(true);
  });

  it("rejects a video taller than the band that only covers part of it", () => {
    expect(
      focus.isVideoAutoplayEligible({ top: 500, height: 1040 }, VIEWPORT),
    ).toBe(false);
  });

  it("rejects an unmeasurable (zero height) video", () => {
    expect(
      focus.isVideoAutoplayEligible({ top: 300, height: 0 }, VIEWPORT),
    ).toBe(false);
  });

  it("rejects everything when the viewport has no height", () => {
    expect(
      focus.isVideoAutoplayEligible(
        { top: 0, height: 100 },
        { top: 0, height: 0 },
      ),
    ).toBe(false);
  });

  it("honors an explicit buffer override", () => {
    const rect = { top: 10, height: 400 };
    expect(focus.isVideoAutoplayEligible(rect, VIEWPORT, 0)).toBe(true);
    expect(focus.isVideoAutoplayEligible(rect, VIEWPORT, 0.04)).toBe(false);
  });
});

describe("pickCenterMostEligibleVideo", () => {
  it("returns null when there are no candidates", () => {
    expect(focus.pickCenterMostEligibleVideo([], VIEWPORT)).toBeNull();
  });

  it("returns null when no candidate is fully on screen", () => {
    const key = focus.pickCenterMostEligibleVideo(
      [
        { key: "above", rect: { top: -300, height: 400 } },
        { key: "below", rect: { top: 900, height: 400 } },
      ],
      VIEWPORT,
    );
    expect(key).toBeNull();
  });

  it("picks the eligible video nearest the center of the viewport", () => {
    const key = focus.pickCenterMostEligibleVideo(
      [
        { key: "high", rect: { top: 50, height: 200 } },
        { key: "centered", rect: { top: 400, height: 200 } },
        { key: "low", rect: { top: 700, height: 200 } },
      ],
      VIEWPORT,
    );
    expect(key).toBe("centered");
  });

  it("skips a more centered video that is not fully on screen", () => {
    // The bottom video is closer to center but hangs off the screen edge.
    const key = focus.pickCenterMostEligibleVideo(
      [
        { key: "fully-visible", rect: { top: 60, height: 300 } },
        { key: "cut-off", rect: { top: 700, height: 400 } },
      ],
      VIEWPORT,
    );
    expect(key).toBe("fully-visible");
  });

  it("breaks ties in favor of the first candidate", () => {
    const key = focus.pickCenterMostEligibleVideo(
      [
        { key: "first", rect: { top: 200, height: 200 } },
        { key: "second", rect: { top: 600, height: 200 } },
      ],
      VIEWPORT,
    );
    expect(key).toBe("first");
  });
});

describe("registerVideoRect / measureVideoRects", () => {
  it("measures every registered video", async () => {
    focus.registerVideoRect("a", (report) => report({ top: 10, height: 100 }));
    focus.registerVideoRect("b", (report) => report({ top: 200, height: 100 }));

    await expect(focus.measureVideoRects(["a", "b"])).resolves.toEqual([
      { key: "a", rect: { top: 10, height: 100 } },
      { key: "b", rect: { top: 200, height: 100 } },
    ]);
  });

  it("omits videos that were never registered", async () => {
    focus.registerVideoRect("a", (report) => report({ top: 10, height: 100 }));

    await expect(focus.measureVideoRects(["a", "gone"])).resolves.toEqual([
      { key: "a", rect: { top: 10, height: 100 } },
    ]);
  });

  it("omits videos that report no rect (unmounted or not laid out)", async () => {
    focus.registerVideoRect("a", (report) => report(null));

    await expect(focus.measureVideoRects(["a"])).resolves.toEqual([]);
  });

  it("stops measuring a video after it unregisters", async () => {
    const unregister = focus.registerVideoRect("a", (report) =>
      report({ top: 10, height: 100 }),
    );
    unregister();

    await expect(focus.measureVideoRects(["a"])).resolves.toEqual([]);
  });

  it("keeps a recycled cell's registration when the old cell cleans up", async () => {
    // FlashList mounts the new cell's effect before the old one's cleanup.
    const unregisterOld = focus.registerVideoRect("a", (report) =>
      report({ top: 10, height: 100 }),
    );
    focus.registerVideoRect("a", (report) => report({ top: 20, height: 200 }));
    unregisterOld();

    await expect(focus.measureVideoRects(["a"])).resolves.toEqual([
      { key: "a", rect: { top: 20, height: 200 } },
    ]);
  });

  it("gives up on a video whose measurement never comes back", async () => {
    jest.useFakeTimers();
    focus.registerVideoRect("hung", () => {});

    const measuring = focus.measureVideoRects(["hung"]);
    jest.runAllTimers();

    await expect(measuring).resolves.toEqual([]);
    jest.useRealTimers();
  });
});
