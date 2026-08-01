/**
 * PostMedia decides what a post shows above its text, in the feed and — via
 * PostDetailsComponent, which renders it for the opened post — inside the post
 * itself. A reddit-internal link post (a multireddit link on r/multihub, say)
 * has to reach the Link card in both places, including when the post also
 * carries preview images.
 */
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { Text } from "react-native";

jest.mock("../../../../../contexts/SettingsContexts/ThemeContext", () => {
  const { createContext } = require("react");
  return {
    __esModule: true,
    ThemeContext: createContext({ theme: { subtleText: "rgb(1, 2, 3)" } }),
  };
});

jest.mock(
  "../../../../../contexts/SettingsContexts/PostSettingsContext",
  () => {
    const { createContext } = require("react");
    return {
      __esModule: true,
      PostSettingsContext: createContext({
        blurNSFW: false,
        blurSpoilers: false,
      }),
    };
  },
);

// The real children pull in native media/blur modules and aren't what's under
// test here — only which of them PostMedia decides to render.
jest.mock("../PostMediaParts/Link", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ post }: any) => (
      <Text>{`link:${post.externalLink ?? post.crossCommentLink}`}</Text>
    ),
  };
});
jest.mock("../PostMediaParts/ImageViewer", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>images</Text> };
});
jest.mock("../PostMediaParts/VideoPlayer", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>video</Text> };
});
jest.mock("../PostMediaParts/CrossPost", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>crosspost</Text> };
});
jest.mock("../PostMediaParts/PollViewer", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>poll</Text> };
});
jest.mock("../../../../HTML/RenderHTML", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>html</Text> };
});
jest.mock("../../../../UI/Themes/ThemeImport", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>theme</Text> };
});

import PostMedia from "../PostMedia";
import { Post } from "../../../../../api/Posts";

const MULTIREDDIT_URL = "https://www.reddit.com/user/bob/m/star_wars_stuff/";

const post = (overrides: Partial<Post> = {}): Post =>
  ({
    id: "abc",
    type: "post",
    title: "A multireddit",
    text: "",
    html: "",
    images: [],
    videos: [],
    isNSFW: false,
    isSpoiler: false,
    ...overrides,
  }) as Post;

const rendered = (postToRender: Post) => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<PostMedia post={postToRender} />);
  });
  return tree.root.findAllByType(Text).map((node) => node.props.children);
};

it("renders the link for a post that links to a multireddit", () => {
  expect(rendered(post({ externalLink: MULTIREDDIT_URL }))).toContain(
    `link:${MULTIREDDIT_URL}`,
  );
});

it("renders the link instead of the preview images", () => {
  const contents = rendered(
    post({
      externalLink: MULTIREDDIT_URL,
      images: ["https://i.redd.it/x.jpg"],
    }),
  );
  expect(contents).toContain(`link:${MULTIREDDIT_URL}`);
  expect(contents).not.toContain("images");
});

it("renders no link for a post that has none", () => {
  const contents = rendered(post({ images: ["https://i.redd.it/x.jpg"] }));
  expect(contents).toContain("images");
  expect(contents.some((c) => String(c).startsWith("link:"))).toBe(false);
});
