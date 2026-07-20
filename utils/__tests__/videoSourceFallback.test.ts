import { getTrimmedVideoSource } from "../videoSourceFallback";

describe("getTrimmedVideoSource", () => {
  it("strips the query string from a non-signed embed URL", () => {
    expect(
      getTrimmedVideoSource("https://example.com/video.mp4?utm_source=reddit"),
    ).toBe("https://example.com/video.mp4");
    expect(
      getTrimmedVideoSource("https://i.imgur.com/abc.mp4?foo=bar&baz=1"),
    ).toBe("https://i.imgur.com/abc.mp4");
  });

  it("returns null when there are no params to trim", () => {
    expect(getTrimmedVideoSource("https://example.com/video.mp4")).toBeNull();
    expect(getTrimmedVideoSource("https://i.imgur.com/abc.mp4")).toBeNull();
  });

  it("returns null for null/empty input", () => {
    expect(getTrimmedVideoSource(null)).toBeNull();
    expect(getTrimmedVideoSource("")).toBeNull();
  });

  it("never trims signed reddit media URLs (params are required)", () => {
    expect(
      getTrimmedVideoSource(
        "https://v.redd.it/xyz/HLSPlaylist.m3u8?a=1&v=1&f=sd&s=deadbeef",
      ),
    ).toBeNull();
    expect(
      getTrimmedVideoSource(
        "https://preview.redd.it/abc.gif?format=mp4&s=signature",
      ),
    ).toBeNull();
    expect(
      getTrimmedVideoSource(
        "https://external-preview.redd.it/abc.mp4?width=640&s=sig",
      ),
    ).toBeNull();
  });

  it("never trims signed redgifs media URLs", () => {
    expect(
      getTrimmedVideoSource("https://media.redgifs.com/SomeName.mp4?token=abc"),
    ).toBeNull();
  });

  it("does not confuse a lookalike host suffix with a signed host", () => {
    // notredd.it / evilredgifs.com.example are NOT reddit/redgifs hosts.
    expect(getTrimmedVideoSource("https://notredd.it/video.mp4?x=1")).toBe(
      "https://notredd.it/video.mp4",
    );
  });
});
