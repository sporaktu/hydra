/**
 * The scroller shows its loading indicator from the very first render, before
 * it has kicked off any loading of its own, so it depends on the data owner to
 * tell it when to stop. A feed that came back empty or failed outright used to
 * leave it spinning on a blank page with no way to know anything went wrong.
 *
 * It also decides the Focused Post — the one feed video allowed to play — from
 * where the viewable videos actually sit on screen, so the rest of these tests
 * cover that gating (see docs/adr/0003-focused-only-playback.md).
 */
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { ActivityIndicator, Dimensions, Text } from "react-native";

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

jest.mock("@react-navigation/elements", () => {
  const { createContext } = require("react");
  return { HeaderHeightContext: createContext(0) };
});

jest.mock("@react-navigation/bottom-tabs", () => {
  const { createContext } = require("react");
  return { BottomTabBarHeightContext: createContext(0) };
});

// The scroller drives focus off FlashList's scroll/viewability callbacks, so
// the mock hands them back to the tests instead of rendering a list.
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

import RedditDataScroller from "../RedditDataScroller";
import { RedditDataObject } from "../../../api/RedditApi";
import {
  getFocusedVideo,
  registerVideoRect,
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

describe("Focused Post", () => {
  const { height: windowHeight } = Dimensions.get("window");
  const SETTLE_MS = 150;

  let unregisterRects: (() => void)[] = [];

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    unregisterRects.forEach((unregister) => unregister());
    unregisterRects = [];
    setFocusedVideo(null);
  });

  const videoPost = (id: string) =>
    ({
      id,
      type: "post",
      videos: [{ source: `${id}.mp4` }],
    }) as unknown as Item;

  /**
   * Reports the given videos as viewable, each sitting at a given place on
   * screen (window coordinates, exactly what a cell's measureInWindow gives).
   */
  const showVideos = async (
    videos: { post: Item; top: number; height: number }[],
  ) => {
    videos.forEach(({ post, top, height }) => {
      const source = (post as unknown as { videos: { source: string }[] })
        .videos[0].source;
      unregisterRects.push(
        registerVideoRect(source, (report) => report({ top, height })),
      );
    });
    await act(async () => {
      mockFlashListProps.onViewableItemsChanged({
        viewableItems: videos.map(({ post }, index) => ({
          item: post,
          index,
          isViewable: true,
          key: (post as unknown as { id: string }).id,
        })),
        changed: [],
      });
    });
  };

  const scroll = async (offsetY: number) => {
    await act(async () => {
      mockFlashListProps.onScroll({
        nativeEvent: { contentOffset: { y: offsetY } },
      });
    });
  };

  const settle = async () => {
    await act(async () => {
      jest.advanceTimersByTime(SETTLE_MS);
    });
  };

  it("focuses a fully visible video once scrolling settles", async () => {
    renderScroller({ data: [videoPost("a")] });

    await showVideos([{ post: videoPost("a"), top: 200, height: 300 }]);
    expect(getFocusedVideo()).toBeNull();

    await settle();
    expect(getFocusedVideo()).toBe("a.mp4");
  });

  it("leaves a video that is cut off by the bottom of the screen unfocused", async () => {
    renderScroller({ data: [videoPost("a")] });

    await showVideos([
      { post: videoPost("a"), top: windowHeight - 100, height: 300 },
    ]);
    await settle();

    expect(getFocusedVideo()).toBeNull();
  });

  it("leaves a fully visible video inside the edge buffer unfocused", async () => {
    renderScroller({ data: [videoPost("a")] });

    // Entirely on screen, but only 1pt clear of the bottom edge.
    await showVideos([
      { post: videoPost("a"), top: windowHeight - 301, height: 300 },
    ]);
    await settle();

    expect(getFocusedVideo()).toBeNull();
  });

  it("focuses the fully visible video over a more centered cut-off one", async () => {
    renderScroller({ data: [videoPost("a"), videoPost("b")] });

    await showVideos([
      { post: videoPost("a"), top: 100, height: 200 },
      { post: videoPost("b"), top: windowHeight - 200, height: 400 },
    ]);
    await settle();

    expect(getFocusedVideo()).toBe("a.mp4");
  });

  it("focuses nothing while scroll events keep arriving", async () => {
    renderScroller({ data: [videoPost("a")] });

    await showVideos([{ post: videoPost("a"), top: 200, height: 300 }]);
    for (let i = 0; i < 5; i++) {
      await scroll(i * 100);
      await act(async () => {
        jest.advanceTimersByTime(SETTLE_MS - 50);
      });
    }

    expect(getFocusedVideo()).toBeNull();
  });

  it("releases a focused video that scrolling pushed off the screen edge", async () => {
    renderScroller({ data: [videoPost("a")] });

    await showVideos([{ post: videoPost("a"), top: 200, height: 300 }]);
    await settle();
    expect(getFocusedVideo()).toBe("a.mp4");

    // Same video, now hanging off the bottom, without a viewability change.
    unregisterRects.forEach((unregister) => unregister());
    unregisterRects = [];
    await showVideos([
      { post: videoPost("a"), top: windowHeight - 100, height: 300 },
    ]);
    await scroll(500);
    await settle();

    expect(getFocusedVideo()).toBeNull();
  });

  it("picks the Focused Post immediately when momentum scrolling ends", async () => {
    renderScroller({ data: [videoPost("a")] });

    await showVideos([{ post: videoPost("a"), top: 200, height: 300 }]);
    await act(async () => {
      mockFlashListProps.onMomentumScrollEnd({
        nativeEvent: { contentOffset: { y: 0 } },
      });
    });

    expect(getFocusedVideo()).toBe("a.mp4");
  });
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
