jest.mock("../safeFetch");
jest.mock("../KeyStore", () => ({
  __esModule: true,
  default: {
    getString: jest.fn(() => "test-token"),
    set: jest.fn(),
  },
}));

import safeFetch from "../safeFetch";
import Redgifs from "../RedGifs";

const mockSafeFetch = safeFetch as jest.MockedFunction<typeof safeFetch>;

function gifResponse(hd: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ gif: { urls: { hd } } }),
  } as unknown as Awaited<ReturnType<typeof safeFetch>>;
}

beforeEach(() => {
  jest.clearAllMocks();
  Redgifs.clearAllCachedForTests();
});

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

describe("Redgifs cache", () => {
  it("returns cached url without a second api call", async () => {
    mockSafeFetch.mockResolvedValue(gifResponse("https://hd.example/a.mp4"));
    const url = "https://www.redgifs.com/watch/cachegif";

    const first = await Redgifs.getMediaURL(url);
    const second = await Redgifs.getMediaURL(url);

    expect(first).toBe("https://hd.example/a.mp4");
    expect(second).toBe("https://hd.example/a.mp4");
    // one auth-token call is skipped (token mocked present); only the gif call happens, once.
    expect(mockSafeFetch).toHaveBeenCalledTimes(1);
  });

  it("clearCached forces a re-fetch", async () => {
    mockSafeFetch.mockResolvedValue(gifResponse("https://hd.example/b.mp4"));
    const url = "https://www.redgifs.com/watch/bustgif";

    await Redgifs.getMediaURL(url);
    Redgifs.clearCached("bustgif");
    await Redgifs.getMediaURL(url);

    expect(mockSafeFetch).toHaveBeenCalledTimes(2);
  });
});
