/**
 * Regression test for the "black loading screen on a tapped-to-expand image" bug.
 *
 * Root cause: the full-screen iOS viewer rendered ONLY the original full-size
 * URL (`highestResSource`). That URL is never the one the feed cached — the
 * feed's ImageViewer passes the whole resolution array and expo-image caches
 * the best-fit (smaller) resolution while scrolling. So tapping to expand fired
 * a fresh network download of the multi-MB original against the Modal's black
 * background, showing a black screen until it landed.
 *
 * Fix: hand the same resolution array to expo-image's `placeholder`. expo-image
 * picks the best-fit placeholder for the container — the same choice the feed
 * made — so it's an instant cache hit (no black screen) while the high-res
 * `source` loads underneath for crisp zoom.
 *
 * These tests mount the real <MediaImage> and assert the rendered expo-image
 * receives the resolution array as its placeholder (array sources), and no
 * placeholder when there is only a single string source (nothing to fall back
 * to, and it is already what the feed showed).
 */
import { act, create, ReactTestRenderer } from "react-test-renderer";

// --- capture the props handed to expo-image --------------------------------
let lastImageProps: Record<string, any> | null = null;
jest.mock("expo-image", () => ({
  __esModule: true,
  Image: (props: Record<string, any>) => {
    lastImageProps = props;
    return null;
  },
}));

// useRecyclingState behaves like useState for the purposes of this test.
jest.mock("@shopify/flash-list", () => {
  const React = require("react");
  return {
    __esModule: true,
    useRecyclingState: (initial: unknown) =>
      React.useState(typeof initial === "function" ? initial() : initial),
  };
});

jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  useSafeAreaFrame: () => ({ width: 400, height: 800 }),
}));

// The viewer's pinch/pan/double-tap stack is exercised on-device, not here;
// these tests only assert the expo-image props. Stub the gesture + worklet layer
// so the component renders under jest.
jest.mock("react-native-gesture-handler", () => ({
  __esModule: true,
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  usePanGesture: () => ({}),
  usePinchGesture: () => ({}),
  useTapGesture: () => ({}),
  useSimultaneousGestures: () => ({}),
}));

jest.mock("react-native-worklets", () => ({
  __esModule: true,
  runOnJS: (fn: unknown) => fn,
}));

jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View },
    Easing: { out: () => (t: number) => t, ease: (t: number) => t },
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    useAnimatedReaction: () => {},
    withTiming: (value: unknown) => value,
    withDecay: () => 0,
  };
});

import { MediaImage } from "../MediaImage.ios";

beforeEach(() => {
  lastImageProps = null;
});

function render(source: string | { uri: string }[]) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <MediaImage
        item={{ type: "image", source: source as any }}
        setIsScrollLocked={() => {}}
      />,
    );
  });
  return tree;
}

it("uses the full resolution array as placeholder so the cached feed image shows immediately", () => {
  const sources = [
    { uri: "https://cdn/low" },
    { uri: "https://cdn/mid" },
    { uri: "https://cdn/high" },
  ];
  render(sources);

  // High-res original is still the main source (kept for crisp zoom).
  expect(lastImageProps?.source).toEqual({ uri: "https://cdn/high" });
  // The whole array is the placeholder -> expo-image paints the cached best-fit.
  expect(lastImageProps?.placeholder).toEqual(sources);
  expect(lastImageProps?.placeholderContentFit).toBe("contain");
});

it("has no placeholder for a single string source (already what the feed showed)", () => {
  render("https://cdn/only");

  expect(lastImageProps?.source).toBe("https://cdn/only");
  expect(lastImageProps?.placeholder).toBeUndefined();
});
