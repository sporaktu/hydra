import {
  DOUBLE_TAP_MAX_DELAY_MS,
  DOUBLE_TAP_MAX_MOVEMENT,
  getTapZone,
  isDoubleTap,
  isTap,
  TAP_MAX_DURATION_MS,
  TAP_MAX_MOVEMENT,
} from "../mediaViewerTaps";

const point = (x: number, y: number, timestamp: number) => ({
  x,
  y,
  timestamp,
});

describe("isTap", () => {
  it("accepts a quick, stationary touch", () => {
    expect(isTap(point(100, 100, 0), point(102, 98, 80))).toBe(true);
  });

  it("rejects a touch that travelled", () => {
    expect(
      isTap(point(100, 100, 0), point(100 + TAP_MAX_MOVEMENT, 100, 80)),
    ).toBe(false);
    expect(
      isTap(point(100, 100, 0), point(100, 100 + TAP_MAX_MOVEMENT, 80)),
    ).toBe(false);
  });

  it("rejects a long press", () => {
    expect(
      isTap(point(100, 100, 0), point(100, 100, TAP_MAX_DURATION_MS)),
    ).toBe(false);
  });
});

describe("isDoubleTap", () => {
  it("accepts a second tap that is soon enough and close enough", () => {
    expect(isDoubleTap(point(100, 100, 0), point(120, 110, 150))).toBe(true);
  });

  it("rejects a second tap that came too late", () => {
    expect(
      isDoubleTap(point(100, 100, 0), point(100, 100, DOUBLE_TAP_MAX_DELAY_MS)),
    ).toBe(false);
  });

  it("rejects a second tap somewhere else on screen", () => {
    expect(
      isDoubleTap(
        point(100, 100, 0),
        point(100 + DOUBLE_TAP_MAX_MOVEMENT, 100, 150),
      ),
    ).toBe(false);
  });
});

describe("getTapZone", () => {
  const width = 400;

  it("splits the screen into side and middle zones", () => {
    expect(getTapZone(10, width, true)).toBe("left");
    expect(getTapZone(200, width, true)).toBe("middle");
    expect(getTapZone(390, width, true)).toBe("right");
  });

  it("keeps the zone boundaries just inside the edge thirds", () => {
    expect(getTapZone(119, width, true)).toBe("left");
    expect(getTapZone(121, width, true)).toBe("middle");
    expect(getTapZone(279, width, true)).toBe("middle");
    expect(getTapZone(281, width, true)).toBe("right");
  });

  it("gives the whole screen to the middle when paging is unavailable", () => {
    expect(getTapZone(10, width, false)).toBe("middle");
    expect(getTapZone(390, width, false)).toBe("middle");
  });

  it("does not divide by an unmeasured width", () => {
    expect(getTapZone(10, 0, true)).toBe("middle");
  });
});
