/**
 * <NativeContextMenu> (docs/specs/03-interaction-overhaul.md, item 2) is a
 * Platform split: on iOS it wraps its children in a zeego native context menu
 * built from the supplied action list; on Android it renders the children
 * unchanged so callers keep their existing long-press action sheet.
 *
 * zeego is a native-module wrapper, so it's mocked with passthrough components.
 * Each menu Item records the props it receives into `mockItems`, letting us
 * assert the label/onSelect/destructive wiring without a device.
 */
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { Platform, View } from "react-native";

import NativeContextMenu from "../NativeContextMenu";

type CapturedItem = {
  label: React.ReactNode;
  onSelect?: () => void;
  destructive?: boolean;
};
const mockItems: CapturedItem[] = [];
const mockRootProps: { onOpenChange?: (open: boolean) => void } = {};

jest.mock("zeego/context-menu", () => {
  const React = require("react");
  const { View: RNView } = require("react-native");
  return {
    __esModule: true,
    Root: ({
      children,
      onOpenChange,
    }: {
      children: React.ReactNode;
      onOpenChange?: (open: boolean) => void;
    }) => {
      mockRootProps.onOpenChange = onOpenChange;
      return React.createElement(RNView, { testID: "cm-Root" }, children);
    },
    Trigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement(RNView, { testID: "cm-Trigger" }, children),
    Content: ({ children }: { children: React.ReactNode }) =>
      React.createElement(RNView, { testID: "cm-Content" }, children),
    Item: ({
      children,
      onSelect,
      destructive,
    }: {
      children: React.ReactNode;
      onSelect?: () => void;
      destructive?: boolean;
    }) => {
      // children is the <ItemTitle> element; its children is the label string.
      const label = React.isValidElement(children)
        ? (children as React.ReactElement<{ children: React.ReactNode }>).props
            .children
        : children;
      mockItems.push({ label, onSelect, destructive });
      return React.createElement(RNView, { testID: "cm-Item" }, children);
    },
    ItemTitle: ({ children }: { children: React.ReactNode }) => children,
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

const handleUpvote = jest.fn();
const handleDelete = jest.fn();

const actions = [
  { label: "Upvote", handle: handleUpvote },
  { label: "Delete", handle: handleDelete, destructive: true },
];

function render(onOpenChange?: (open: boolean) => void) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <NativeContextMenu actions={actions} onOpenChange={onOpenChange}>
        <View testID="menu-child" />
      </NativeContextMenu>,
    );
  });
  return tree;
}

beforeEach(() => {
  handleUpvote.mockClear();
  handleDelete.mockClear();
  mockItems.length = 0;
  mockRootProps.onOpenChange = undefined;
});

describe("on Android", () => {
  it("renders the children unchanged with no zeego menu wrapper", () => {
    setPlatform("android");
    const tree = render();
    expect(tree.root.findByProps({ testID: "menu-child" })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: "cm-Root" })).toHaveLength(0);
    expect(mockItems).toHaveLength(0);
  });
});

describe("on iOS", () => {
  it("wraps the children in a zeego Root/Trigger/Content structure", () => {
    setPlatform("ios");
    const tree = render();
    expect(tree.root.findByProps({ testID: "cm-Root" })).toBeTruthy();
    expect(tree.root.findByProps({ testID: "cm-Trigger" })).toBeTruthy();
    expect(tree.root.findByProps({ testID: "cm-Content" })).toBeTruthy();
    expect(tree.root.findByProps({ testID: "menu-child" })).toBeTruthy();
  });

  it("renders one menu item per action, in order, with its label", () => {
    setPlatform("ios");
    render();
    expect(mockItems.map((i) => i.label)).toEqual(["Upvote", "Delete"]);
  });

  it("wires each item's onSelect to the action's handle", () => {
    setPlatform("ios");
    render();
    act(() => {
      mockItems[0].onSelect?.();
    });
    expect(handleUpvote).toHaveBeenCalledTimes(1);
    expect(handleDelete).not.toHaveBeenCalled();
    act(() => {
      mockItems[1].onSelect?.();
    });
    expect(handleDelete).toHaveBeenCalledTimes(1);
  });

  it("flags destructive actions and leaves the rest unset", () => {
    setPlatform("ios");
    render();
    expect(mockItems[0].destructive).toBeUndefined();
    expect(mockItems[1].destructive).toBe(true);
  });

  it("forwards onOpenChange to the menu root", () => {
    setPlatform("ios");
    const onOpenChange = jest.fn();
    render(onOpenChange);
    expect(mockRootProps.onOpenChange).toBe(onOpenChange);
  });
});
