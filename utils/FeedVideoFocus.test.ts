/**
 * Unit tests for the pure focused-only playback state (see
 * docs/specs/02-focused-video-playback.md and ADR 0003). Covers the single
 * focused-key store + per-key subscriptions, the remembered-position LRU that
 * survives player release, and center-most video selection.
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

describe("pickCenterMostVideo", () => {
  it("returns null when there are no viewable items", () => {
    expect(focus.pickCenterMostVideo([], [{ index: 0, key: "a" }])).toBeNull();
  });

  it("returns null when no viewable item is a video", () => {
    expect(focus.pickCenterMostVideo([0, 1, 2], [])).toBeNull();
  });

  it("returns the only video's key when there is a single candidate", () => {
    expect(
      focus.pickCenterMostVideo([0, 1, 2], [{ index: 1, key: "only" }]),
    ).toBe("only");
  });

  it("picks the video nearest the center of the viewable index range", () => {
    const key = focus.pickCenterMostVideo(
      [0, 1, 2, 3, 4],
      [
        { index: 0, key: "top" },
        { index: 2, key: "middle" },
        { index: 4, key: "bottom" },
      ],
    );
    expect(key).toBe("middle");
  });

  it("uses the midpoint of the viewable range, not the raw indices, as center", () => {
    // Viewable range 10..20 => center 15; the video at 16 is nearest.
    const key = focus.pickCenterMostVideo(
      [10, 12, 14, 16, 18, 20],
      [
        { index: 12, key: "high" },
        { index: 16, key: "near-center" },
        { index: 20, key: "low" },
      ],
    );
    expect(key).toBe("near-center");
  });

  it("breaks ties in favor of the first candidate at equal distance", () => {
    // Center of [0..4] is 2; both candidates are distance 1 away.
    const key = focus.pickCenterMostVideo(
      [0, 1, 2, 3, 4],
      [
        { index: 1, key: "first" },
        { index: 3, key: "second" },
      ],
    );
    expect(key).toBe("first");
  });
});
