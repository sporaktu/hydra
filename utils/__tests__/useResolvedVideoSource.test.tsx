import { act, create } from "react-test-renderer";
import { Text } from "react-native";
import { useResolvedVideoSource } from "../useResolvedVideoSource";

jest.mock("../RedGifs", () => ({
  __esModule: true,
  default: {
    getMediaURL: jest.fn(),
    getVideoId: (u: string) => u,
    clearCached: jest.fn(),
  },
}));

import Redgifs from "../RedGifs";
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
