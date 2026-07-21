import { resolveSubreddit } from "../SubredditDetails";
import { api } from "../RedditApi";

jest.mock("../RedditApi", () => ({
  api: jest.fn(),
}));

const mockedApi = api as jest.MockedFunction<typeof api>;

describe("resolveSubreddit", () => {
  beforeEach(() => {
    mockedApi.mockReset();
  });

  it("returns the subreddit when about.json returns a t5", async () => {
    mockedApi.mockResolvedValueOnce({
      kind: "t5",
      data: {
        id: "2qh1i",
        display_name: "askreddit",
        name: "t5_2qh1i",
        url: "/r/askreddit/",
        user_is_moderator: false,
        user_is_subscriber: true,
        public_description: "Ask anything",
        community_icon: "https://styles.redditmedia.com/icon.png?width=256",
        icon_img: "",
        subscribers: 100,
        created_utc: 1201233135,
      },
    });

    const result = await resolveSubreddit("askreddit");

    expect(mockedApi).toHaveBeenCalledWith(
      "https://www.reddit.com/r/askreddit/about.json",
    );
    expect(result).not.toBeNull();
    expect(result?.name).toBe("askreddit");
    expect(result?.type).toBe("subreddit");
  });

  it("resolves private/banned subs (still a t5)", async () => {
    mockedApi.mockResolvedValueOnce({
      kind: "t5",
      data: {
        id: "2qh1i",
        display_name: "somePrivateSub",
        name: "t5_2qh1i",
        url: "/r/somePrivateSub/",
        subscribers: 0,
        created_utc: 1201233135,
      },
    });

    const result = await resolveSubreddit("somePrivateSub");
    expect(result?.name).toBe("somePrivateSub");
  });

  it("returns null on a 404 error body", async () => {
    mockedApi.mockResolvedValueOnce({ error: 404, message: "Not Found" });
    const result = await resolveSubreddit("thissubdoesnotexist12345");
    expect(result).toBeNull();
  });

  it("returns null when the response is not a t5 (e.g. a search listing)", async () => {
    mockedApi.mockResolvedValueOnce({
      kind: "Listing",
      data: { children: [] },
    });
    const result = await resolveSubreddit("nope");
    expect(result).toBeNull();
  });

  it("returns null when api rejects", async () => {
    mockedApi.mockRejectedValueOnce(new Error("network"));
    const result = await resolveSubreddit("oops");
    expect(result).toBeNull();
  });
});
