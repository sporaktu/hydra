import {
  addToMulti,
  getMergedMultiFeedURL,
  getMultiPath,
  getMultiSubredditNames,
  Multi,
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

  it("returns null when the multi definition can't be loaded", async () => {
    mockedApi.mockRejectedValueOnce(new Error("network"));

    const mergedURL = await getMergedMultiFeedURL(
      "https://www.reddit.com/user/bob4/m/tech/",
    );
    expect(mergedURL).toBeNull();
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
