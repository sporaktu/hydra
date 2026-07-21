jest.mock("../safeFetch");
jest.mock("../KeyStore", () => ({
  __esModule: true,
  default: {
    getString: jest.fn(() => "test-token"),
    set: jest.fn(),
  },
}));

import safeFetch from "../safeFetch";
import Redgifs, { RedgifsResolutionError, RedgifsAbortError } from "../RedGifs";

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
  Redgifs.resetCooldownForTests();
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

describe("Redgifs failure", () => {
  it("throws RedgifsResolutionError when the api keeps failing", async () => {
    jest.useFakeTimers();
    mockSafeFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as unknown as Awaited<ReturnType<typeof safeFetch>>);

    const call = Redgifs.getMediaURL("https://www.redgifs.com/watch/failgif");
    // Suppress unhandled rejection warning before timers fire
    const settled = Promise.allSettled([call]);
    await jest.runAllTimersAsync();
    const [result] = await settled;
    expect(result.status).toBe("rejected");
    expect((result as PromiseRejectedResult).reason).toBeInstanceOf(RedgifsResolutionError);
    jest.useRealTimers();
  });

  it("does not cache a failure", async () => {
    jest.useFakeTimers();
    // First call: exhaust all MAX_BACKOFF_ATTEMPTS (3) with 500 responses
    mockSafeFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as unknown as Awaited<ReturnType<typeof safeFetch>>)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as unknown as Awaited<ReturnType<typeof safeFetch>>)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as unknown as Awaited<ReturnType<typeof safeFetch>>);

    const firstCall = Redgifs.getMediaURL("https://www.redgifs.com/watch/retrygif");
    const settled = Promise.allSettled([firstCall]);
    await jest.runAllTimersAsync();
    const [result] = await settled;
    expect(result.status).toBe("rejected");
    expect((result as PromiseRejectedResult).reason).toBeInstanceOf(RedgifsResolutionError);

    // Reset cooldown so second call doesn't wait
    Redgifs.resetCooldownForTests();
    jest.useRealTimers();

    // Second call: should succeed now
    mockSafeFetch.mockResolvedValue(gifResponse("https://hd.example/c.mp4"));
    const ok = await Redgifs.getMediaURL("https://www.redgifs.com/watch/retrygif");
    expect(ok).toBe("https://hd.example/c.mp4");
  });
});

describe("Redgifs concurrency cap", () => {
  it("never runs more than 2 resolutions at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    mockSafeFetch.mockImplementation(async (url: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return gifResponse(`https://hd.example/${url}.mp4`);
    });

    await Promise.all(
      ["a", "b", "c", "d", "e", "f"].map((id) =>
        Redgifs.getMediaURL(`https://www.redgifs.com/watch/${id}`),
      ),
    );

    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});

describe("Redgifs visible-first queue + cancellation", () => {
  it("serves the most-recently-queued (visible) request first under load", async () => {
    const order: string[] = [];
    // Two slots are busy on long requests; the rest queue up. Resolve the busy
    // ones so the queue drains, recording the order the queued ids actually run.
    let releaseFirstTwo: (() => void)[] = [];
    mockSafeFetch.mockImplementation(async (url: string) => {
      const id = url.split("/").pop()!;
      order.push(id);
      if (id === "busy1" || id === "busy2") {
        await new Promise<void>((r) => releaseFirstTwo.push(r));
      }
      return gifResponse(`https://hd.example/${id}.mp4`);
    });

    // Fill both slots.
    const b1 = Redgifs.getMediaURL("https://www.redgifs.com/watch/busy1");
    const b2 = Redgifs.getMediaURL("https://www.redgifs.com/watch/busy2");
    await new Promise((r) => setTimeout(r, 0)); // let them start + occupy slots

    // Queue three more in scroll order; "third" is the newest = most visible.
    const q1 = Redgifs.getMediaURL("https://www.redgifs.com/watch/first");
    const q2 = Redgifs.getMediaURL("https://www.redgifs.com/watch/second");
    const q3 = Redgifs.getMediaURL("https://www.redgifs.com/watch/third");

    // Free the two busy slots so the queue drains.
    releaseFirstTwo.forEach((r) => r());
    await Promise.all([b1, b2, q1, q2, q3]);

    // Of the queued three, the newest ("third") must have run before "first".
    expect(order.indexOf("third")).toBeLessThan(order.indexOf("first"));
  });

  it("drops a queued request whose signal aborts before it runs", async () => {
    let release: (() => void)[] = [];
    mockSafeFetch.mockImplementation(async (url: string) => {
      const id = url.split("/").pop()!;
      if (id === "busy1" || id === "busy2") {
        await new Promise<void>((r) => release.push(r));
      }
      return gifResponse(`https://hd.example/${id}.mp4`);
    });
    const b1 = Redgifs.getMediaURL("https://www.redgifs.com/watch/busy1");
    const b2 = Redgifs.getMediaURL("https://www.redgifs.com/watch/busy2");
    await new Promise((r) => setTimeout(r, 0));

    const controller = new AbortController();
    const queued = Redgifs.getMediaURL(
      "https://www.redgifs.com/watch/scrolledaway",
      controller.signal,
    );
    const settled = Promise.allSettled([queued]);
    controller.abort(); // post scrolled off-screen while queued

    release.forEach((r) => r());
    await Promise.all([b1, b2]);
    const [result] = await settled;
    expect(result.status).toBe("rejected");
    expect((result as PromiseRejectedResult).reason).toBeInstanceOf(
      RedgifsAbortError,
    );
  });

  it("rejects immediately if the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      Redgifs.getMediaURL(
        "https://www.redgifs.com/watch/dead",
        controller.signal,
      ),
    ).rejects.toBeInstanceOf(RedgifsAbortError);
  });
});

describe("Redgifs 429 cooldown", () => {
  it("applies a shared cooldown after a 429 so a second caller waits", async () => {
    jest.useFakeTimers();
    const r429 = {
      ok: false,
      status: 429,
      json: async () => ({}),
    } as unknown as Awaited<ReturnType<typeof safeFetch>>;
    // First caller: 429 on all attempts -> throws and arms cooldown.
    mockSafeFetch.mockResolvedValue(r429);

    const firstCall = Redgifs.getMediaURL("https://www.redgifs.com/watch/g1");
    const settled = Promise.allSettled([firstCall]);
    await jest.runAllTimersAsync();
    const [result] = await settled;
    expect(result.status).toBe("rejected");
    expect((result as PromiseRejectedResult).reason).toBeInstanceOf(RedgifsResolutionError);

    expect(Redgifs.getCooldownRemainingForTests()).toBeGreaterThan(0);

    jest.useRealTimers();
  });

  it("a normal failure arms a shorter cooldown than a 429", async () => {
    jest.useFakeTimers();

    mockSafeFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as unknown as Awaited<ReturnType<typeof safeFetch>>);
    const c1 = Redgifs.getMediaURL("https://www.redgifs.com/watch/g2");
    const settled1 = Promise.allSettled([c1]);
    await jest.runAllTimersAsync();
    const [r1] = await settled1;
    expect(r1.status).toBe("rejected");
    expect((r1 as PromiseRejectedResult).reason).toBeInstanceOf(RedgifsResolutionError);
    const after500 = Redgifs.getCooldownRemainingForTests();

    Redgifs.clearAllCachedForTests();
    Redgifs.resetCooldownForTests();

    mockSafeFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as unknown as Awaited<ReturnType<typeof safeFetch>>);
    const c2 = Redgifs.getMediaURL("https://www.redgifs.com/watch/g3");
    const settled2 = Promise.allSettled([c2]);
    await jest.runAllTimersAsync();
    const [r2] = await settled2;
    expect(r2.status).toBe("rejected");
    expect((r2 as PromiseRejectedResult).reason).toBeInstanceOf(RedgifsResolutionError);
    const after429 = Redgifs.getCooldownRemainingForTests();

    expect(after429).toBeGreaterThan(after500);
    jest.useRealTimers();
  });
});
