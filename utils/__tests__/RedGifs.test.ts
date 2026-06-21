import Redgifs from "../RedGifs";

describe("Redgifs.getVideoId", () => {
  it("extracts the id from a watch url", () => {
    expect(Redgifs.getVideoId("https://www.redgifs.com/watch/somecoolgif")).toBe(
      "somecoolgif",
    );
  });

  it("strips query params", () => {
    expect(
      Redgifs.getVideoId("https://www.redgifs.com/watch/somecoolgif?foo=bar"),
    ).toBe("somecoolgif");
  });

  it("strips hash fragments", () => {
    expect(
      Redgifs.getVideoId("https://www.redgifs.com/watch/somecoolgif#t=1"),
    ).toBe("somecoolgif");
  });
});
