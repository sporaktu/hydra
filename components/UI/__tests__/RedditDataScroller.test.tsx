/**
 * The scroller shows its loading indicator from the very first render, before
 * it has kicked off any loading of its own, so it depends on the data owner to
 * tell it when to stop. A feed that came back empty or failed outright used to
 * leave it spinning on a blank page with no way to know anything went wrong.
 *
 * It also picks the feed's Focused Post (docs/adr/0003-focused-only-playback.md)
 * from FlashList's viewability callbacks; the second half of this file drives
 * those callbacks by hand and checks which video ends up focused.
 */
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { ActivityIndicator, Text } from "react-native";

jest.mock("../../../contexts/SettingsContexts/ThemeContext", () => {
  const { createContext } = require("react");
  return {
    __esModule: true,
    ThemeContext: createContext({
      theme: { text: "rgb(1, 2, 3)", systemModeStyle: "dark" },
    }),
  };
});

jest.mock("@react-navigation/native", () => ({
  useIsFocused: () => true,
}));

jest.mock("../../../db/functions/Stats", () => ({
  modifyStat: jest.fn(),
  Stat: { SCROLL_DISTANCE: "scrollDistance" },
}));

// Renders only the footer, and keeps the latest props so tests can fire the
// viewability callbacks the real list would.
let mockFlashListProps: any = null;
jest.mock("@shopify/flash-list", () => {
  const { View } = require("react-native");
  return {
    FlashList: (props: any) => {
      mockFlashListProps = props;
      return <View>{props.ListFooterComponent}</View>;
    },
  };
});

// Controllable stand-in for the fullscreen viewer's visibility broadcast. Like
// the real one, it replays the current value to a listener on subscribe.
type VisibilityListener = (isShowing: boolean) => void;
const mockVisibilityListeners = new Set<VisibilityListener>();
let mockViewerIsShowing = false;

function setViewerShowing(isShowing: boolean) {
  mockViewerIsShowing = isShowing;
  mockVisibilityListeners.forEach((listener) => listener(isShowing));
}

jest.mock("../../../contexts/MediaViewerContext", () => {
  const { createContext } = require("react");
  return {
    __esModule: true,
    MediaViewerContext: createContext({
      subscribeToVisibility: (listener: VisibilityListener) => {
        mockVisibilityListeners.add(listener);
        listener(mockViewerIsShowing);
        return () => mockVisibilityListeners.delete(listener);
      },
    }),
  };
});

import RedditDataScroller from "../RedditDataScroller";
import { RedditDataObject } from "../../../api/RedditApi";
import {
  getFocusedVideo,
  setFocusedVideo,
} from "../../../utils/FeedVideoFocus";

type Item = RedditDataObject;

const noop = async () => {};

const renderScroller = (
  props: Partial<React.ComponentProps<typeof RedditDataScroller<Item>>> = {},
) => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <RedditDataScroller<Item>
        loadMore={noop}
        refresh={noop}
        data={[]}
        fullyLoaded={false}
        hitFilterLimit={false}
        renderItem={() => null}
        {...props}
      />,
    );
  });
  return tree;
};

const spinners = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(ActivityIndicator);

const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((node) => node.props.children);

afterEach(() => {
  mockFlashListProps = null;
  mockVisibilityListeners.clear();
  mockViewerIsShowing = false;
  setFocusedVideo(null);
  jest.useRealTimers();
});

it("shows the loading indicator while the first load is in flight", () => {
  const tree = renderScroller();
  expect(spinners(tree)).toHaveLength(1);
});

it("stops loading once the owner reports there is nothing more to load", () => {
  const tree = renderScroller();
  act(() => {
    tree.update(
      <RedditDataScroller<Item>
        loadMore={noop}
        refresh={noop}
        data={[]}
        fullyLoaded={true}
        hitFilterLimit={false}
        renderItem={() => null}
      />,
    );
  });
  expect(spinners(tree)).toHaveLength(0);
});

it("stops loading and explains itself when the load failed", () => {
  const tree = renderScroller();
  act(() => {
    tree.update(
      <RedditDataScroller<Item>
        loadMore={noop}
        refresh={noop}
        data={[]}
        fullyLoaded={false}
        hitFilterLimit={false}
        loadFailed={true}
        renderItem={() => null}
      />,
    );
  });
  expect(spinners(tree)).toHaveLength(0);
  expect(texts(tree)).toContain(
    "Something went wrong loading this. Pull down to try again.",
  );
});

// ---- Focused Post tracking --------------------------------------------------

/** A viewability token for a post at `index`; a video post when `key` is set. */
const token = (index: number, key?: string) => ({
  index,
  isViewable: true,
  item: key ? { videos: [{ source: key }] } : {},
});

/**
 * Feeds one viewport's worth of viewability into every config the scroller
 * registers, the way FlashList does after a scroll or a relayout. `mostly` are
 * the posts that clear the mostly-visible thresholds; `any` are all posts with
 * a pixel on screen.
 */
function reportViewability(
  mostly: ReturnType<typeof token>[],
  any: ReturnType<typeof token>[],
) {
  act(() => {
    mockFlashListProps.onViewableItemsChanged({
      viewableItems: any,
      changed: [],
    });
    const [itemPercent, viewportCoverage] =
      mockFlashListProps.viewabilityConfigCallbackPairs;
    itemPercent.onViewableItemsChanged({ viewableItems: mostly, changed: [] });
    viewportCoverage.onViewableItemsChanged({
      viewableItems: [],
      changed: [],
    });
  });
}

const settle = () => {
  act(() => {
    jest.advanceTimersByTime(200);
  });
};

// Portrait: "a" is the center-most video. Landscape (shorter viewport, taller
// posts): the same scroll offset shows "b" as the mostly visible one, with only
// the tail of "a" still on screen.
const portrait = () =>
  reportViewability(
    [token(1, "a"), token(2)],
    [token(0), token(1, "a"), token(2), token(3, "b")],
  );
const landscape = () =>
  reportViewability([token(3, "b")], [token(1, "a"), token(3, "b")]);

it("focuses the center-most mostly visible video once scrolling settles", () => {
  jest.useFakeTimers();
  renderScroller();
  portrait();
  expect(getFocusedVideo()).toBeNull();
  settle();
  expect(getFocusedVideo()).toBe("a");
});

it("does not move the Focused Post while the fullscreen viewer is open", () => {
  // Rotating with the viewer open re-lays out the feed underneath it. Acting
  // on that used to focus (and start, with audio) a video the user wasn't
  // watching.
  jest.useFakeTimers();
  renderScroller();
  portrait();
  settle();
  expect(getFocusedVideo()).toBe("a");

  act(() => setViewerShowing(true));
  landscape();
  settle();
  expect(getFocusedVideo()).toBe("a");
});

it("drops a focus change that was still settling when the viewer opened", () => {
  jest.useFakeTimers();
  renderScroller();
  portrait();
  settle();
  landscape();
  act(() => setViewerShowing(true));
  settle();
  expect(getFocusedVideo()).toBe("a");
});

it("keeps the Focused Post when the viewer closes with it still on screen", () => {
  // The viewer closes in landscape; the feed is about to rotate back to
  // portrait, where "a" is central again, so "b" must not get a turn.
  jest.useFakeTimers();
  renderScroller();
  portrait();
  settle();
  act(() => setViewerShowing(true));
  landscape();
  act(() => setViewerShowing(false));
  settle();
  expect(getFocusedVideo()).toBe("a");

  portrait();
  settle();
  expect(getFocusedVideo()).toBe("a");
});

it("re-evaluates focus when the viewer closes and the Focused Post has left the screen", () => {
  jest.useFakeTimers();
  renderScroller();
  portrait();
  settle();
  act(() => setViewerShowing(true));
  reportViewability([token(3, "b")], [token(3, "b"), token(4)]);
  act(() => setViewerShowing(false));
  settle();
  expect(getFocusedVideo()).toBe("b");
});

it("resumes normal focus tracking after the viewer closes", () => {
  jest.useFakeTimers();
  renderScroller();
  portrait();
  settle();
  act(() => setViewerShowing(true));
  act(() => setViewerShowing(false));
  landscape();
  settle();
  expect(getFocusedVideo()).toBe("b");
});
