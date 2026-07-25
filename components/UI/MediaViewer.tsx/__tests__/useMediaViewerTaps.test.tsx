/**
 * The media viewer packs three interactions onto one surface: single tap
 * toggles the overlay, side double taps page a gallery, middle double taps
 * play/pause the video. These tests pin the arbitration between them — in
 * particular that a single tap only waits out the double-tap window when a
 * double tap in that zone would actually do something.
 */
import { act, create } from "react-test-renderer";
import { GestureResponderEvent } from "react-native";

import { useMediaViewerTaps } from "../useMediaViewerTaps";
import { DOUBLE_TAP_MAX_DELAY_MS } from "../../../../utils/mediaViewerTaps";

const WIDTH = 400;

type Handlers = ReturnType<typeof useMediaViewerTaps>;

type Options = {
  canPageSides?: boolean;
  canTogglePlayback?: boolean;
};

function setup({
  canPageSides = false,
  canTogglePlayback = false,
}: Options = {}) {
  const calls = {
    singleTap: 0,
    playback: 0,
    sides: [] as ("left" | "right")[],
  };
  let handlers: Handlers | null = null;

  function Harness() {
    handlers = useMediaViewerTaps({
      width: WIDTH,
      canPageSides: () => canPageSides,
      canTogglePlayback: () => canTogglePlayback,
      onSingleTap: () => calls.singleTap++,
      onSideDoubleTap: (direction) => calls.sides.push(direction),
      onMiddleDoubleTap: () => calls.playback++,
    });
    return null;
  }

  act(() => {
    create(<Harness />);
  });

  const event = (x: number, y: number) =>
    ({ nativeEvent: { pageX: x, pageY: y } }) as GestureResponderEvent;

  const tap = (x: number, y = 300) => {
    act(() => {
      handlers!.onTouchStart(event(x, y));
      handlers!.onTouchEnd(event(x, y));
    });
  };

  const drag = (fromX: number, toX: number, y = 300) => {
    act(() => {
      handlers!.onTouchStart(event(fromX, y));
      handlers!.onTouchEnd(event(toX, y));
    });
  };

  return { calls, tap, drag };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useMediaViewerTaps", () => {
  it("toggles the overlay immediately when no double tap could apply", () => {
    const { calls, tap } = setup();
    tap(20);
    expect(calls.singleTap).toBe(1);
    // Nothing pending, so a second tap is just another single tap.
    tap(20);
    expect(calls.singleTap).toBe(2);
  });

  it("pages backwards on a double tap on the left of a gallery", () => {
    const { calls, tap } = setup({ canPageSides: true });
    tap(20);
    tap(20);
    expect(calls.sides).toEqual(["left"]);
    act(() => jest.advanceTimersByTime(1000));
    expect(calls.singleTap).toBe(0);
  });

  it("pages forwards on a double tap on the right of a gallery", () => {
    const { calls, tap } = setup({ canPageSides: true });
    tap(WIDTH - 20);
    tap(WIDTH - 20);
    expect(calls.sides).toEqual(["right"]);
  });

  it("still toggles the overlay when a side tap is not doubled", () => {
    const { calls, tap } = setup({ canPageSides: true });
    tap(20);
    expect(calls.singleTap).toBe(0);
    act(() => jest.advanceTimersByTime(DOUBLE_TAP_MAX_DELAY_MS));
    expect(calls.singleTap).toBe(1);
    expect(calls.sides).toEqual([]);
  });

  it("plays/pauses on a double tap in the middle of a video", () => {
    const { calls, tap } = setup({
      canPageSides: true,
      canTogglePlayback: true,
    });
    tap(WIDTH / 2);
    tap(WIDTH / 2);
    expect(calls.playback).toBe(1);
    act(() => jest.advanceTimersByTime(1000));
    expect(calls.singleTap).toBe(0);
  });

  it("treats the whole screen as middle for a video that is not in a gallery", () => {
    const { calls, tap } = setup({ canTogglePlayback: true });
    tap(20);
    tap(20);
    expect(calls.playback).toBe(1);
    expect(calls.sides).toEqual([]);
  });

  it("does not delay the overlay for a middle tap on an image", () => {
    const { calls, tap } = setup({ canPageSides: true });
    tap(WIDTH / 2);
    expect(calls.singleTap).toBe(1);
  });

  it("ignores a second tap that lands too late", () => {
    const { calls, tap } = setup({ canPageSides: true });
    tap(20);
    act(() => jest.advanceTimersByTime(DOUBLE_TAP_MAX_DELAY_MS));
    tap(20);
    expect(calls.sides).toEqual([]);
    act(() => jest.advanceTimersByTime(DOUBLE_TAP_MAX_DELAY_MS));
    expect(calls.singleTap).toBe(2);
  });

  it("ignores a drag, and cancels a half-finished double tap", () => {
    const { calls, tap, drag } = setup({ canPageSides: true });
    tap(20);
    drag(20, 200);
    act(() => jest.advanceTimersByTime(1000));
    expect(calls.singleTap).toBe(0);
    expect(calls.sides).toEqual([]);
  });
});
