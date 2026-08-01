import { formatPostData } from "../Posts";

// Mock native modules pulled in transitively via Posts → RedditApi → RedditCookies
jest.mock("@preeternal/react-native-cookie-manager", () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), clearAll: jest.fn() },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

function child(url: string, subreddit = "multihub") {
  return {
    data: {
      id: "abc123",
      name: "t3_abc123",
      title: "A post",
      author: "someone",
      subreddit,
      permalink: `/r/${subreddit}/comments/abc123/a_post/`,
      url,
      selftext: "",
      selftext_html: "",
      created: 1700000000,
      ups: 1,
      num_comments: 0,
    },
  };
}

describe("formatPostData reddit link targets", () => {
  it("links posts that point at a multireddit", async () => {
    const post = await formatPostData(
      child("https://reddit.com/user/thetruememeisbest/m/star_wars_stuff/"),
    );
    expect(post.externalLink).toBe(
      "https://www.reddit.com/user/thetruememeisbest/m/star_wars_stuff/",
    );
  });

  it("links posts that point at a /u/ multireddit", async () => {
    const post = await formatPostData(
      child("https://www.reddit.com/u/bob/m/tech"),
    );
    expect(post.externalLink).toBe("https://www.reddit.com/u/bob/m/tech");
  });

  it("links posts that point at a user profile", async () => {
    const post = await formatPostData(child("https://www.reddit.com/user/bob"));
    expect(post.externalLink).toBe("https://www.reddit.com/user/bob");
  });

  it("links posts that point at a search", async () => {
    const post = await formatPostData(
      child("https://www.reddit.com/search?q=cats"),
    );
    expect(post.externalLink).toBe("https://www.reddit.com/search?q=cats");
  });

  it("links posts that point at another subreddit", async () => {
    const post = await formatPostData(
      child("https://www.reddit.com/r/askreddit"),
    );
    expect(post.externalLink).toBe("https://www.reddit.com/r/askreddit");
  });

  it("does not link a post at its own subreddit's listing", async () => {
    const post = await formatPostData(
      child("https://www.reddit.com/r/multihub/", "multihub"),
    );
    expect(post.externalLink).toBeUndefined();
  });

  it("does not link a self post at its own permalink", async () => {
    const post = await formatPostData(
      child(
        "https://www.reddit.com/r/multihub/comments/abc123/a_post/",
        "multihub",
      ),
    );
    expect(post.externalLink).toBeUndefined();
    expect(post.crossCommentLink).toBeUndefined();
  });

  it("treats a link to another post as a cross comment link, not a link card", async () => {
    const post = await formatPostData(
      child("https://www.reddit.com/r/askreddit/comments/xyz789/other/"),
    );
    expect(post.crossCommentLink).toBe(
      "https://www.reddit.com/r/askreddit/comments/xyz789/other/",
    );
    expect(post.externalLink).toBeUndefined();
  });

  it("does not turn a reddit-hosted image into a link card", async () => {
    const post = await formatPostData(child("https://i.redd.it/abcdef.jpg"));
    expect(post.externalLink).toBeUndefined();
  });

  it("does not turn a reddit gallery into a link card", async () => {
    const post = await formatPostData(
      child("https://www.reddit.com/gallery/abc123"),
    );
    expect(post.externalLink).toBeUndefined();
  });
});
