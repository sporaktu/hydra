import {
  BannedSubredditError,
  getPosts,
  ListingResponseError,
  PrivateSubredditError,
} from "../Posts";
import { api } from "../RedditApi";
import {
  getMergedMultiFeedURL,
  MultiredditUnavailableError,
} from "../Multireddit";
import RedditURL from "../../utils/RedditURL";

jest.mock("../RedditApi", () => ({
  api: jest.fn(),
}));

jest.mock("../Multireddit", () => {
  const actual = jest.requireActual("../Multireddit");
  return { ...actual, getMergedMultiFeedURL: jest.fn() };
});

const mockedApi = api as jest.MockedFunction<typeof api>;
const mockedGetMergedMultiFeedURL =
  getMergedMultiFeedURL as jest.MockedFunction<typeof getMergedMultiFeedURL>;

const MULTI_URL = "https://www.reddit.com/user/bob/m/tech/";

const listing = (ids: string[]) => ({
  data: {
    children: ids.map((id) => ({
      data: {
        id,
        name: `t3_${id}`,
        title: "A post",
        author: "someone",
        subreddit: "apple",
        permalink: `/r/apple/comments/${id}/a_post/`,
        url: `https://www.reddit.com/r/apple/comments/${id}/a_post/`,
        selftext: "",
        selftext_html: "",
        created: 1700000000,
        ups: 1,
        num_comments: 0,
      },
    })),
  },
});

/** What safeFetch's json() does to Reddit's HTML error pages. */
const htmlErrorPage = () =>
  Promise.reject(new SyntaxError("Unexpected token < in JSON"));

beforeEach(() => {
  mockedApi.mockReset();
  mockedGetMergedMultiFeedURL.mockReset();
});

describe("getPosts on a multireddit", () => {
  it("reads the merged feed when it works", async () => {
    mockedGetMergedMultiFeedURL.mockResolvedValue(
      new RedditURL("https://www.reddit.com/r/apple+android"),
    );
    mockedApi.mockResolvedValueOnce(listing(["a"]));

    const posts = await getPosts(MULTI_URL);

    expect(posts.map((post) => post.id)).toEqual(["a"]);
    expect(mockedApi).toHaveBeenCalledTimes(1);
    expect(mockedApi.mock.calls[0][0]).toContain("/r/apple+android");
  });

  it("falls back to the multi's own listing when the merged feed errors out", async () => {
    mockedGetMergedMultiFeedURL.mockResolvedValue(
      new RedditURL("https://www.reddit.com/r/apple+android"),
    );
    mockedApi.mockReturnValueOnce(htmlErrorPage());
    mockedApi.mockResolvedValueOnce(listing(["b"]));

    const posts = await getPosts(MULTI_URL);

    expect(posts.map((post) => post.id)).toEqual(["b"]);
    expect(mockedApi.mock.calls[1][0]).toContain("/user/bob/m/tech");
  });

  it("falls back when the merged feed returns something that isn't a listing", async () => {
    mockedGetMergedMultiFeedURL.mockResolvedValue(
      new RedditURL("https://www.reddit.com/r/apple+android"),
    );
    mockedApi.mockResolvedValueOnce({ error: 404 });
    mockedApi.mockResolvedValueOnce(listing(["c"]));

    const posts = await getPosts(MULTI_URL);

    expect(posts.map((post) => post.id)).toEqual(["c"]);
  });

  it("tries the multi's own listing when the definition can't be read", async () => {
    mockedGetMergedMultiFeedURL.mockRejectedValue(
      new MultiredditUnavailableError(),
    );
    mockedApi.mockResolvedValueOnce(listing(["d"]));

    const posts = await getPosts(MULTI_URL);

    expect(posts.map((post) => post.id)).toEqual(["d"]);
    expect(mockedApi).toHaveBeenCalledTimes(1);
    expect(mockedApi.mock.calls[0][0]).toContain("/user/bob/m/tech");
  });

  it("reports the multireddit as unavailable when every source fails", async () => {
    mockedGetMergedMultiFeedURL.mockResolvedValue(
      new RedditURL("https://www.reddit.com/r/apple+android"),
    );
    mockedApi.mockReturnValueOnce(htmlErrorPage());
    mockedApi.mockReturnValueOnce(htmlErrorPage());

    await expect(getPosts(MULTI_URL)).rejects.toBeInstanceOf(
      MultiredditUnavailableError,
    );
  });

  it("returns no posts for a multireddit with no subreddits", async () => {
    mockedGetMergedMultiFeedURL.mockResolvedValue("empty");

    await expect(getPosts(MULTI_URL)).resolves.toEqual([]);
    expect(mockedApi).not.toHaveBeenCalled();
  });

  it("still reports a banned subreddit rather than retrying", async () => {
    mockedGetMergedMultiFeedURL.mockResolvedValue(
      new RedditURL("https://www.reddit.com/r/apple+android"),
    );
    mockedApi.mockResolvedValueOnce({ reason: "banned" });

    await expect(getPosts(MULTI_URL)).rejects.toBeInstanceOf(
      BannedSubredditError,
    );
    expect(mockedApi).toHaveBeenCalledTimes(1);
  });
});

describe("getPosts on an ordinary feed", () => {
  it("loads the listing", async () => {
    mockedApi.mockResolvedValueOnce(listing(["e", "f"]));

    const posts = await getPosts("https://www.reddit.com/r/apple");

    expect(posts.map((post) => post.id)).toEqual(["e", "f"]);
    expect(mockedGetMergedMultiFeedURL).not.toHaveBeenCalled();
  });

  it("throws a named error when the response isn't a listing", async () => {
    mockedApi.mockResolvedValueOnce({ error: 500 });

    await expect(
      getPosts("https://www.reddit.com/r/apple"),
    ).rejects.toBeInstanceOf(ListingResponseError);
  });

  it("still reports private subreddits", async () => {
    mockedApi.mockResolvedValueOnce({ reason: "private" });

    await expect(
      getPosts("https://www.reddit.com/r/apple"),
    ).rejects.toBeInstanceOf(PrivateSubredditError);
  });
});
