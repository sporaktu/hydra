/**
 * Regression test for "every feed image and gallery went blank on iOS".
 *
 * ImageViewer wraps each image's touchable in NativeContextMenu for the image
 * long-press menu. On iOS that is zeego's native trigger, whose Root view is
 * rendered with `flexGrow: 0` and whose Trigger wraps the child in a plain,
 * auto-sized View. A `flex: 1` touchable inside that has nothing to grow into
 * on either axis. Height is handled here by sizing the touchable explicitly;
 * width is handled in NativeContextMenu, which forwards the caller's flex to
 * the Root as explicit grow/shrink/basis (see its own tests).
 *
 * These tests render ImageViewer on each platform and assert the touchable is
 * explicitly sized on iOS (no reliance on flex) while Android, where the
 * touchable sits directly in the flex row, keeps `flex: 1`.
 */
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { Platform, StyleSheet, TouchableHighlight } from "react-native";

import ImageViewer from "../ImageViewer";

jest.mock("expo-image", () => ({
  __esModule: true,
  Image: () => null,
}));

jest.mock("expo-clipboard", () => ({
  __esModule: true,
  setStringAsync: jest.fn(),
}));

jest.mock("zeego/context-menu", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    Root: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
    Trigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
    Content: () => null,
    Item: () => null,
    ItemTitle: () => null,
  };
});

jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  useSafeAreaFrame: () => ({ width: 400, height: 800 }),
}));

jest.mock("../../../../../../utils/useMediaSharing", () => ({
  __esModule: true,
  default: () => jest.fn(),
  useMediaSaving: () => jest.fn(),
  getMediaURL: (s: string) => s,
}));

jest.mock("../../../../../../utils/useContextMenu", () => ({
  __esModule: true,
  default: () => jest.fn(),
}));

jest.mock("../../../../../../contexts/SettingsContexts/DataModeContext", () => {
  const { createContext } = require("react");
  return {
    __esModule: true,
    DataModeContext: createContext({ currentDataMode: "normal" }),
  };
});

jest.mock("../../../../../../contexts/SettingsContexts/ThemeContext", () => {
  const { createContext } = require("react");
  return {
    __esModule: true,
    ThemeContext: createContext({
      theme: { background: "#000", text: "#fff" },
    }),
  };
});

jest.mock("../../../../../../contexts/MediaViewerContext", () => {
  const { createContext } = require("react");
  return {
    __esModule: true,
    MediaViewerContext: createContext({ displayMedia: jest.fn() }),
  };
});

jest.mock("../../../../../../contexts/PostInteractionContext", () => {
  const { createContext } = require("react");
  return {
    __esModule: true,
    PostInteractionContext: createContext({ interactedWithPost: jest.fn() }),
  };
});

const originalOS = Platform.OS;

function setPlatform(os: "ios" | "android") {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}

afterEach(() => {
  Object.defineProperty(Platform, "OS", {
    value: originalOS,
    configurable: true,
  });
});

function render(images: string[]): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    // 16:9 at a 400pt-wide frame => 225pt tall, well under the 60% cap.
    tree = create(<ImageViewer images={images} aspectRatio={16 / 9} />);
  });
  return tree;
}

function touchableStyles(tree: ReactTestRenderer) {
  return tree.root
    .findAllByType(TouchableHighlight)
    .map((node) => StyleSheet.flatten(node.props.style));
}

it("sizes each image's touchable explicitly on iOS so the native menu trigger can't collapse it", () => {
  setPlatform("ios");
  const tree = render(["https://i.redd.it/a.jpg"]);

  const [style] = touchableStyles(tree);
  expect(style.height).toBe(225);
  expect(style.width).toBe("100%");
  expect(style.flex).toBeUndefined();
});

it("halves the explicit height when two images share the row on iOS", () => {
  setPlatform("ios");
  const tree = render(["https://i.redd.it/a.jpg", "https://i.redd.it/b.jpg"]);

  const styles = touchableStyles(tree);
  expect(styles).toHaveLength(2);
  styles.forEach((style) => expect(style.height).toBe(112.5));
});

it("keeps the touchable flexing in the row on Android, where there is no trigger view", () => {
  setPlatform("android");
  const tree = render(["https://i.redd.it/a.jpg", "https://i.redd.it/b.jpg"]);

  touchableStyles(tree).forEach((style) => expect(style.flex).toBe(1));
});
