/**
 * Regression test for the "black loading box covers a working video in the
 * FULLSCREEN viewer after watching several videos" bug.
 *
 * Root cause: the fullscreen viewer's <MediaVideo> gates its opaque black
 * `notReadyContainer` overlay purely on `status === "loading"`, where `status`
 * is a one-time snapshot of `player.status` taken at mount, updated only by the
 * `statusChange` event (which the handler additionally ignores for "loading").
 *
 * The viewer reuses the SAME shared player as the feed (same registry key). So a
 * freshly-mounted MediaVideoContent very often sits on top of a player that has
 * ALREADY transitioned loading->readyToPlay (and is playing) in the gap between
 * the render-time snapshot and the effect-time event subscription — the
 * readyToPlay event already fired and never repeats. The status mirror is stuck
 * at "loading" forever, so the black box covers a perfectly good, playing video.
 * This is the same bug class fixed for the inline feed in
 * components/UI/Gallery/Video.tsx; these tests guard the fullscreen viewer.
 *
 * Like the Gallery regression test, the fake player's event subscriptions NEVER
 * fire a callback — exactly the recycle/already-ready case — so the component
 * must derive readiness from a live read of player.playing / currentTime /
 * status, not from a missed event.
 */
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { ActivityIndicator, Animated } from "react-native";

import MediaVideo from "../MediaVideo.ios";

// --- mocks for the component's dependency tree -----------------------------
jest.mock("expo-video", () => ({
  __esModule: true,
  VideoView: () => null,
}));

// Model the recycle case: subscriptions never fire, and useEvent has no value.
jest.mock("expo", () => ({
  __esModule: true,
  useEvent: () => undefined,
  useEventListener: () => {},
}));

jest.mock("../../../../utils/VideoCache", () => ({
  __esModule: true,
  default: { makeCachedVideoSource: (uri: string) => ({ uri }) },
}));

jest.mock("../../../../utils/RedGifs", () => ({
  __esModule: true,
  default: { clearCached: jest.fn(), getVideoId: (u: string) => u },
}));

jest.mock("../../../Other/DismountWhenBackgrounded", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  useSafeAreaFrame: () => ({ width: 400, height: 800 }),
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));

jest.mock("@expo/vector-icons", () => ({
  __esModule: true,
  FontAwesome: () => null,
}));

const mockResolved = {
  uri: "https://cdn/v.mp4",
  status: "ready" as const,
  retry: jest.fn(),
};
jest.mock("../../../../utils/useResolvedVideoSource", () => ({
  __esModule: true,
  useResolvedVideoSource: () => mockResolved,
}));

// Fake shared player. Event subscriptions are stubbed by the `expo` mock above,
// so no callback ever fires — the component sees only the live getters below.
function makePlayer(over: Record<string, unknown>) {
  return {
    status: "loading",
    playing: false,
    currentTime: 0,
    duration: 10,
    muted: false,
    volume: 0,
    loop: false,
    playbackRate: 1,
    timeUpdateEventInterval: 0,
    audioMixingMode: "mixWithOthers",
    seekTolerance: {},
    scrubbingModeOptions: {},
    videoTrack: { size: { width: 16, height: 9 } },
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    play: jest.fn(),
    pause: jest.fn(),
    replace: jest.fn(),
    ...over,
  };
}

let mockCurrentPlayer: ReturnType<typeof makePlayer> | null = null;
jest.mock("../../../../contexts/VideoPlayerRegistryContext", () => ({
  __esModule: true,
  useSharedVideoPlayer: () => mockCurrentPlayer,
}));

const baseSource = {
  source: "https://cdn/v.mp4",
  needsResolution: false,
} as never;

function renderFocused(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <MediaVideo
        source={baseSource}
        focused
        overlayOpacity={new Animated.Value(0)}
        setIsScrollLocked={() => {}}
      />,
    );
  });
  return tree;
}

function loadingOverlayCount(tree: ReactTestRenderer): number {
  // The black loading box is the only ActivityIndicator the viewer renders.
  return tree.root.findAllByType(ActivityIndicator).length;
}

afterEach(() => {
  mockCurrentPlayer = null;
  jest.clearAllMocks();
});

it("hides the black loading overlay when the shared player is already playing (recycle race, no events fire)", () => {
  // status snapshot still 'loading', but the player IS playing a decoded frame.
  mockCurrentPlayer = makePlayer({
    status: "loading",
    playing: true,
    currentTime: 1.2,
  });
  const tree = renderFocused();
  // No spinner => the opaque black box is NOT covering the playing video.
  expect(loadingOverlayCount(tree)).toBe(0);
});

it("hides the overlay once a frame has decoded (currentTime>0) even if status is still loading", () => {
  mockCurrentPlayer = makePlayer({
    status: "loading",
    playing: false,
    currentTime: 0.5,
  });
  const tree = renderFocused();
  expect(loadingOverlayCount(tree)).toBe(0);
});

it("hides the overlay when status is readyToPlay", () => {
  mockCurrentPlayer = makePlayer({
    status: "readyToPlay",
    playing: false,
    currentTime: 0,
  });
  const tree = renderFocused();
  expect(loadingOverlayCount(tree)).toBe(0);
});

it("still shows a loading indicator while genuinely loading (no frame, not playing)", () => {
  mockCurrentPlayer = makePlayer({
    status: "loading",
    playing: false,
    currentTime: 0,
  });
  const tree = renderFocused();
  expect(loadingOverlayCount(tree)).toBe(1);
});
