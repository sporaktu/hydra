/**
 * The scroller shows its loading indicator from the very first render, before
 * it has kicked off any loading of its own, so it depends on the data owner to
 * tell it when to stop. A feed that came back empty or failed outright used to
 * leave it spinning on a blank page with no way to know anything went wrong.
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

jest.mock("@shopify/flash-list", () => {
  const { View } = require("react-native");
  return {
    FlashList: ({ ListFooterComponent }: any) => (
      <View>{ListFooterComponent}</View>
    ),
  };
});

import RedditDataScroller from "../RedditDataScroller";
import { RedditDataObject } from "../../../api/RedditApi";

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
