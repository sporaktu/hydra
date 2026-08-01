import {
  addToMulti,
  formatMultiData,
  getMergedMultiFeedURL,
  getMultiPath,
  getMultiSubredditNames,
  Multi,
  MultiredditUnavailableError,
  removeFromMulti,
} from "../Multireddit";
import { api } from "../RedditApi";

jest.mock("../RedditApi", () => ({
  api: jest.fn(),
}));

const mockedApi = api as jest.MockedFunction<typeof api>;

const makeMultiResponse = (subredditNames: string[]) => ({
  kind: "LabeledMulti",
  data: {
    name: "tech",
    display_name: "tech",
    path: "/user/bob/m/tech/",
    icon_url: "",
    subreddits: subredditNames.map((name) => ({ name })),
  },
});

describe("getMultiPath", () => {
  it("extracts the multi path from a full multireddit URL", () => {
    expect(getMultiPath("https://www.reddit.com/user/bob/m/tech/")).toBe(
      "user/bob/m/tech",
    );
  });

  it("extracts the multi path from a relative /user URL", () => {
    expect(getMultiPath("/user/bob/m/tech")).toBe("user/bob/m/tech");
  });

  it("handles sorted multireddit URLs", () => {
    expect(
      getMultiPath("https://www.reddit.com/user/bob/m/tech/top?t=week"),
    ).toBe("user/bob/m/tech");
  });

  it("returns null for non-multireddit URLs", () => {
    expect(getMultiPath("https://www.reddit.com/r/askreddit")).toBeNull();
    expect(getMultiPath("https://www.reddit.com/user/bob")).toBeNull();
  });
});

describe("getMultiSubredditNames", () => {
  beforeEach(() => {
    mockedApi.mockReset();
  });

  it("fetches the multi definition and caches it", async () => {
    mockedApi.mockResolvedValueOnce(makeMultiResponse(["apple", "android"]));

    const names = await getMultiSubredditNames("user/cachedbob/m/tech");
    expect(names).toEqual(["apple", "android"]);
    expect(mockedApi).toHaveBeenCalledWith(
      "https://www.reddit.com/api/multi/user/cachedbob/m/tech",
    );

    const namesAgain = await getMultiSubredditNames("user/cachedbob/m/tech");
    expect(namesAgain).toEqual(["apple", "android"]);
    expect(mockedApi).toHaveBeenCalledTimes(1);
  });
});

describe("getMergedMultiFeedURL", () => {
  beforeEach(() => {
    mockedApi.mockReset();
  });

  it("builds a merged subreddit feed URL from the multi's subreddits", async () => {
    mockedApi.mockResolvedValueOnce(makeMultiResponse(["apple", "android"]));

    const mergedURL = await getMergedMultiFeedURL(
      "https://www.reddit.com/user/bob/m/tech/",
    );
    expect(mergedURL).not.toBeNull();
    expect(mergedURL).not.toBe("empty");
    expect((mergedURL as any).toString()).toBe(
      "https://www.reddit.com/r/apple+android",
    );
  });

  it("carries the multi URL's sort and time over to the merged URL", async () => {
    mockedApi.mockResolvedValueOnce(makeMultiResponse(["apple", "android"]));

    const mergedURL = await getMergedMultiFeedURL(
      "https://www.reddit.com/user/bob2/m/tech/top?t=week",
    );
    expect((mergedURL as any).toString()).toBe(
      "https://www.reddit.com/r/apple+android/top?t=week",
    );
  });

  it("returns 'empty' for a multireddit with no subreddits", async () => {
    mockedApi.mockResolvedValueOnce(makeMultiResponse([]));

    const mergedURL = await getMergedMultiFeedURL(
      "https://www.reddit.com/user/bob3/m/empty/",
    );
    expect(mergedURL).toBe("empty");
  });

  it("throws when the multi definition can't be loaded from any source", async () => {
    mockedApi.mockRejectedValue(new Error("network"));

    await expect(
      getMergedMultiFeedURL("https://www.reddit.com/user/bob4/m/tech/"),
    ).rejects.toBeInstanceOf(MultiredditUnavailableError);
  });

  it("treats a Reddit error envelope as unavailable, not as an empty multi", async () => {
    // api() parses the body whatever the status was, so a 403 arrives looking
    // like a successful response. Reading it as "no subreddits" is what made
    // someone else's multireddit render as a blank feed.
    mockedApi.mockResolvedValue({ error: 403, message: "Forbidden" });

    await expect(
      getMergedMultiFeedURL("https://www.reddit.com/user/forbidden/m/tech/"),
    ).rejects.toBeInstanceOf(MultiredditUnavailableError);
  });

  it("returns null for non-multireddit URLs without hitting the API", async () => {
    const mergedURL = await getMergedMultiFeedURL(
      "https://www.reddit.com/r/askreddit",
    );
    expect(mergedURL).toBeNull();
    expect(mockedApi).not.toHaveBeenCalled();
  });

  it("refetches the multi definition after it is edited", async () => {
    mockedApi.mockResolvedValueOnce(makeMultiResponse(["apple"]));
    await getMergedMultiFeedURL("https://www.reddit.com/user/bob5/m/tech/");

    const multi: Multi = {
      id: "tech",
      type: "multi",
      name: "tech",
      iconURL: "",
      url: "/user/bob5/m/tech/",
      subreddits: [],
    };
    mockedApi.mockResolvedValueOnce(""); // addToMulti PUT response
    await addToMulti(multi, "android");

    mockedApi.mockResolvedValueOnce(makeMultiResponse(["apple", "android"]));
    const mergedURL = await getMergedMultiFeedURL(
      "https://www.reddit.com/user/bob5/m/tech/",
    );
    expect((mergedURL as any).toString()).toBe(
      "https://www.reddit.com/r/apple+android",
    );
  });
});

describe("formatMultiData", () => {
  const expandedSubreddit = (name: string) => ({
    name,
    data: {
      id: `id_${name}`,
      display_name: name,
      url: `/r/${name}/`,
      subscribers: 10,
    },
  });

  it("formats expanded (expand_srs) subreddit entries", () => {
    const multi = formatMultiData({
      name: "tech",
      display_name: "Tech",
      icon_url: "",
      path: "/user/bob/m/tech/",
      subreddits: [expandedSubreddit("zebra"), expandedSubreddit("apple")],
    });
    expect(multi.subreddits.map((sub) => sub.name)).toEqual(["apple", "zebra"]);
  });

  it("keeps the multireddit usable when entries aren't expanded", () => {
    // A bare `{ name }` entry used to throw inside formatSubredditData, which
    // took the entire multireddit list down with it.
    const multi = formatMultiData({
      name: "tech",
      display_name: "Tech",
      icon_url: "",
      path: "/user/bob/m/tech/",
      subreddits: [{ name: "zebra" }, { name: "apple" }],
    });
    expect(multi.subreddits.map((sub) => sub.name)).toEqual(["apple", "zebra"]);
    expect(multi.subreddits[0].url).toBe("https://www.reddit.com/r/apple/");
  });

  it("tolerates a multi with no subreddits key", () => {
    const multi = formatMultiData({
      name: "tech",
      display_name: "Tech",
      icon_url: "",
      path: "/user/bob/m/tech/",
    });
    expect(multi.subreddits).toEqual([]);
  });
});

describe("add/removeFromMulti endpoints", () => {
  const multi: Multi = {
    id: "tech",
    type: "multi",
    name: "tech",
    // Reddit's `path` always carries a trailing slash.
    url: "/user/bob/m/tech/",
    iconURL: "",
    subreddits: [],
  };

  beforeEach(() => {
    mockedApi.mockReset();
    mockedApi.mockResolvedValue("");
  });

  it("does not double the slash before /r/<subreddit> when adding", async () => {
    await addToMulti(multi, "apple");
    expect(mockedApi.mock.calls[0][0]).toBe(
      "https://www.reddit.com/api/multi/user/bob/m/tech/r/apple",
    );
  });

  it("does not double the slash before /r/<subreddit> when removing", async () => {
    await removeFromMulti(multi, "apple");
    expect(mockedApi.mock.calls[0][0]).toBe(
      "https://www.reddit.com/api/multi/user/bob/m/tech/r/apple",
    );
  });
});

describe("getMultiSubredditNames fallbacks", () => {
  beforeEach(() => {
    mockedApi.mockReset();
  });

  it("falls through to the next source when one returns no definition", async () => {
    mockedApi
      .mockResolvedValueOnce({ error: 403, message: "Forbidden" })
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(makeMultiResponse(["apple", "android"]));

    const names = await getMultiSubredditNames("user/other/m/tech");

    expect(names).toEqual(["apple", "android"]);
    expect(mockedApi.mock.calls.map((call) => call[0])).toEqual([
      "https://www.reddit.com/api/multi/user/other/m/tech",
      "https://www.reddit.com/api/multi/user/other/m/tech.json",
      "https://old.reddit.com/api/multi/user/other/m/tech",
    ]);
  });

  it("does not cache a failure, so a later attempt can still succeed", async () => {
    mockedApi.mockResolvedValue({ error: 403 });
    await expect(
      getMultiSubredditNames("user/retry/m/tech"),
    ).rejects.toBeInstanceOf(MultiredditUnavailableError);

    mockedApi.mockReset();
    mockedApi.mockResolvedValueOnce(makeMultiResponse(["apple"]));
    expect(await getMultiSubredditNames("user/retry/m/tech")).toEqual([
      "apple",
    ]);
  });

  it("caches and reports a genuinely empty multireddit as empty", async () => {
    mockedApi.mockResolvedValueOnce(makeMultiResponse([]));
    expect(await getMultiSubredditNames("user/emptyone/m/tech")).toEqual([]);
    expect(mockedApi).toHaveBeenCalledTimes(1);
  });
});
