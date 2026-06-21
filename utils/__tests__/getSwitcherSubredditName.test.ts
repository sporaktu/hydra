import { getSwitcherSubredditName } from "../getSwitcherSubredditName";

describe("getSwitcherSubredditName", () => {
  it("returns the sub name for a subreddit feed", () => {
    expect(getSwitcherSubredditName("https://www.reddit.com/r/askreddit")).toBe(
      "askreddit",
    );
  });

  it("returns 'Home' for the root home feed", () => {
    expect(getSwitcherSubredditName("https://www.reddit.com/")).toBe("Home");
  });

  it("returns the name for r/popular", () => {
    expect(getSwitcherSubredditName("https://www.reddit.com/r/popular")).toBe(
      "popular",
    );
  });

  it("returns the name for r/all", () => {
    expect(getSwitcherSubredditName("https://www.reddit.com/r/all")).toBe(
      "all",
    );
  });

  it("returns the name for a sorted home feed", () => {
    expect(getSwitcherSubredditName("https://www.reddit.com/hot")).toBe("Hot");
  });

  it("returns the multireddit name for a multireddit page", () => {
    expect(
      getSwitcherSubredditName("https://www.reddit.com/user/someone/m/mymulti"),
    ).toBe("mymulti");
  });

  it("returns null for a user page", () => {
    expect(
      getSwitcherSubredditName("https://www.reddit.com/user/spez"),
    ).toBeNull();
  });

  it("returns null for a post permalink", () => {
    expect(
      getSwitcherSubredditName(
        "https://www.reddit.com/r/askreddit/comments/abc123/some_title/",
      ),
    ).toBeNull();
  });

  it("returns null for a search page", () => {
    expect(
      getSwitcherSubredditName("https://www.reddit.com/search/?q=cats"),
    ).toBeNull();
  });

  it("returns null for an unparseable url", () => {
    expect(getSwitcherSubredditName("not a url")).toBeNull();
  });
});
