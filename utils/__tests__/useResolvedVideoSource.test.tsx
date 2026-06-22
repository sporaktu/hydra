import { act, create } from "react-test-renderer";
import { Text } from "react-native";
import { useResolvedVideoSource } from "../useResolvedVideoSource";

jest.mock("../RedGifs", () => {
  class RedgifsAbortError extends Error {
    constructor(message = "Redgifs resolution aborted") {
      super(message);
      this.name = "RedgifsAbortError";
    }
  }
  return {
    __esModule: true,
    default: {
      getMediaURL: jest.fn(),
      getVideoId: (u: string) => u,
      clearCached: jest.fn(),
    },
    RedgifsAbortError,
  };
});

import Redgifs, { RedgifsAbortError } from "../RedGifs";
const mockGet = Redgifs.getMediaURL as jest.MockedFunction<
  typeof Redgifs.getMediaURL
>;

let last: ReturnType<typeof useResolvedVideoSource>;
function Probe({ src, needs }: { src: string; needs?: boolean }) {
  last = useResolvedVideoSource(src, needs);
  return <Text>{last.status}</Text>;
}

beforeEach(() => jest.clearAllMocks());

it("passthrough when needsResolution is falsy", async () => {
  await act(async () => {
    create(<Probe src="https://x/y.mp4" />);
  });
  expect(last.uri).toBe("https://x/y.mp4");
  expect(last.status).toBe("ready");
  expect(mockGet).not.toHaveBeenCalled();
});

it("resolves redgifs on mount", async () => {
  mockGet.mockResolvedValue("https://hd/resolved.mp4");
  await act(async () => {
    create(<Probe src="https://www.redgifs.com/watch/z" needs />);
  });
  expect(last.status).toBe("ready");
  expect(last.uri).toBe("https://hd/resolved.mp4");
});

it("passes an AbortSignal and aborts the resolution on unmount", async () => {
  let received: AbortSignal | undefined;
  mockGet.mockImplementation((_url: string, signal?: AbortSignal) => {
    received = signal;
    return new Promise(() => {}); // never resolves
  });
  let root: ReturnType<typeof create>;
  await act(async () => {
    root = create(<Probe src="https://www.redgifs.com/watch/z" needs />);
  });
  expect(received).toBeInstanceOf(AbortSignal);
  expect(received?.aborted).toBe(false);
  await act(async () => {
    root.unmount();
  });
  expect(received?.aborted).toBe(true);
});

it("does NOT flip to error when the resolution aborts", async () => {
  mockGet.mockRejectedValue(new RedgifsAbortError());
  await act(async () => {
    create(<Probe src="https://www.redgifs.com/watch/z" needs />);
  });
  // An abort means the post scrolled away, not a failure — stay in loading,
  // never show the permanent error tile.
  expect(last.status).toBe("loading");
});

it("surfaces error and retry re-resolves", async () => {
  mockGet.mockRejectedValueOnce(new Error("boom"));
  mockGet.mockResolvedValueOnce("https://hd/second.mp4");
  await act(async () => {
    create(<Probe src="https://www.redgifs.com/watch/z" needs />);
  });
  expect(last.status).toBe("error");
  await act(async () => {
    last.retry();
  });
  expect(last.status).toBe("ready");
  expect(last.uri).toBe("https://hd/second.mp4");
});
