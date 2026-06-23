/**
 * Regression test for the "black loading overlay covers a working video" bug.
 *
 * Root cause: the opaque black overlay was gated on a status mirror fed ONLY by
 * the expo-video `statusChange` event. Because one player is shared across
 * recycled FlashList cells, a cell usually mounts on TOP of a player that has
 * ALREADY transitioned loading->readyToPlay (and is playing) before this cell
 * subscribed — so the event never fires again and the overlay stayed black on
 * top of a playing video forever, at ANY scroll speed.
 *
 * These tests mount the real <Video> component (with the real overlay logic) and
 * a fake shared player whose addListener NEVER fires a callback — exactly the
 * recycle case — and assert the overlay is hidden when the player is already
 * playing, and that non-ready states show a self-explanatory message.
 */
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { Text, ActivityIndicator } from "react-native";

// --- mocks for the component's dependency tree -----------------------------
jest.mock("expo-video", () => ({
  __esModule: true,
  VideoView: () => null,
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

jest.mock("../../../../contexts/SettingsContexts/ThemeContext", () => {
  const { createContext } = require("react");
  return {
    __esModule: true,
    ThemeContext: createContext({
      theme: { text: "#fff", background: "#000", subtleText: "#888" },
    }),
  };
});

jest.mock("../../../../contexts/MediaViewerContext", () => {
  const { createContext } = require("react");
  return {
    __esModule: true,
    MediaViewerContext: createContext({
      subscribeToVisibility: () => () => {},
    }),
  };
});

const mockResolved = {
  uri: "https://cdn/v.mp4",
  status: "ready" as const,
  retry: jest.fn(),
};
jest.mock("../../../../utils/useResolvedVideoSource", () => ({
  __esModule: true,
  useResolvedVideoSource: () => mockResolved,
}));

// Fake shared player. addListener does NOT invoke the callback — this models a
// recycled cell mounting after the loading->readyToPlay event already fired.
function makePlayer(over: Record<string, unknown>) {
  return {
    status: "loading",
    playing: false,
    currentTime: 0,
    muted: false,
    loop: false,
    timeUpdateEventInterval: 0,
    bufferOptions: {},
    audioMixingMode: "mixWithOthers",
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

import Video from "../Video";

const baseVideo = {
  source: "https://cdn/v.mp4",
  needsResolution: false,
} as never;

function overlayTexts(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .filter((c): c is string => typeof c === "string");
}

afterEach(() => {
  mockCurrentPlayer = null;
  jest.clearAllMocks();
});

it("hides the overlay when the player is already playing (recycle case, no events fire)", () => {
  mockCurrentPlayer = makePlayer({
    status: "readyToPlay",
    playing: true,
    currentTime: 1.2,
  });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Video video={baseVideo} />);
  });
  // No diagnostic message, no spinner => the black overlay is NOT covering the
  // playing video. This is the core bug being fixed.
  const texts = overlayTexts(tree);
  expect(texts).toHaveLength(0);
  expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
});

it("hides the overlay when only a frame has been decoded (currentTime>0) even if status not readyToPlay", () => {
  mockCurrentPlayer = makePlayer({
    status: "loading",
    playing: false,
    currentTime: 0.5,
  });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Video video={baseVideo} />);
  });
  expect(overlayTexts(tree)).toHaveLength(0);
});

it("shows a 'Loading video…' message (not a blank box) while genuinely loading", () => {
  mockCurrentPlayer = makePlayer({
    status: "loading",
    playing: false,
    currentTime: 0,
  });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Video video={baseVideo} />);
  });
  expect(overlayTexts(tree)).toContain("Loading video…");
});

it("clears the overlay via the live-getter poll when NO events ever fire", () => {
  // Recycled player that comes up not-ready and never emits any event, but whose
  // live getters flip to playing shortly after mount (audio audibly plays while
  // the black tile lingers). The polling fallback must observe this and hide the
  // overlay even though statusChange/playingChange/timeUpdate never fired.
  jest.useFakeTimers();
  const player = makePlayer({
    status: "loading",
    playing: false,
    currentTime: 0,
  });
  mockCurrentPlayer = player;
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Video video={baseVideo} />);
  });
  // Initially the overlay is up (genuinely loading, nothing playing yet).
  expect(overlayTexts(tree)).toContain("Loading video…");

  // The underlying player starts presenting frames; only the live getters know.
  player.status = "readyToPlay";
  player.playing = true;
  player.currentTime = 0.3;

  // Advance past one poll interval — the fallback reads the live getters.
  act(() => {
    jest.advanceTimersByTime(250);
  });

  expect(overlayTexts(tree)).toHaveLength(0);
  expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  jest.useRealTimers();
});

it("shows 'No player available' when the registry returned no player", () => {
  mockCurrentPlayer = null;
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Video video={baseVideo} />);
  });
  expect(overlayTexts(tree)).toContain("No player available");
});
