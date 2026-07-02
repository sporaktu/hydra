/**
 * <ThemedRefreshControl> consolidates the RN 0.81.5 tintColor-on-first-render
 * workaround (docs/specs/03-interaction-overhaul.md, item 4.2): tintColor is
 * applied 500ms after mount rather than immediately. These tests assert the
 * delayed tint is applied to the theme's text color, that refreshing/onRefresh
 * pass straight through, and that no tint is set before the timer fires.
 */
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { RefreshControl } from "react-native";

import ThemedRefreshControl from "../ThemedRefreshControl";

const TEXT_COLOR = "rgb(11, 22, 33)";

// The real ThemeContext transitively opens a SQLite db (db/index.ts) that
// can't load under jest; stub it with the text color the component reads.
jest.mock("../../../contexts/SettingsContexts/ThemeContext", () => {
  const { createContext } = require("react");
  return {
    __esModule: true,
    ThemeContext: createContext({ theme: { text: TEXT_COLOR } }),
  };
});

function renderControl(props: { refreshing: boolean; onRefresh: () => void }) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<ThemedRefreshControl {...props} />);
  });
  return tree;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  // Flush the still-pending 500ms tint timer inside act() so the state update
  // it triggers doesn't warn, then restore real timers.
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

it("renders a RefreshControl", () => {
  const tree = renderControl({ refreshing: false, onRefresh: () => {} });
  expect(tree.root.findByType(RefreshControl)).toBeTruthy();
});

it("has no tintColor before the 500ms timer fires", () => {
  const tree = renderControl({ refreshing: false, onRefresh: () => {} });
  expect(tree.root.findByType(RefreshControl).props.tintColor).toBeUndefined();
});

it("applies the theme text color as tintColor after 500ms", () => {
  const tree = renderControl({ refreshing: false, onRefresh: () => {} });
  act(() => {
    jest.advanceTimersByTime(500);
  });
  expect(tree.root.findByType(RefreshControl).props.tintColor).toBe(TEXT_COLOR);
});

it("passes refreshing and onRefresh straight through", () => {
  const onRefresh = jest.fn();
  const tree = renderControl({ refreshing: true, onRefresh });
  const control = tree.root.findByType(RefreshControl);
  expect(control.props.refreshing).toBe(true);
  expect(control.props.onRefresh).toBe(onRefresh);
});
