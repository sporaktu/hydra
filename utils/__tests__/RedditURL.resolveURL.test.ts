import RedditURL, { PageType } from "../RedditURL";

/**
 * Reddit's share sheet produces shortened links whose id says nothing about
 * what it points at. /r/<sub>/s/<id> was already being resolved, but the
 * /user/<name>/s/<id> and /u/<name>/s/<id> forms — what you get when sharing
 * from a profile or a multireddit — looked like ordinary user pages, so they
 * were opened as-is and loaded nothing.
 */
describe("RedditURL.resolveURL", () => {
  const originalFetch = global.fetch;

  const mockRedirect = (finalURL: string) => {
    const fetchMock = jest.fn().mockResolvedValue({ url: finalURL });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  };

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it("follows a /user/<name>/s/<id> share link to a multireddit", async () => {
    const fetchMock = mockRedirect("https://www.reddit.com/user/bob/m/tech/");

    const resolved = await new RedditURL(
      "https://www.reddit.com/user/bob/s/UAuNzVTOen",
    ).resolveURL();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolved.toString()).toBe("https://www.reddit.com/user/bob/m/tech/");
    expect(resolved.getPageType()).toBe(PageType.MULTIREDDIT);
  });

  it("follows a /u/<name>/s/<id> share link instead of just expanding /u/", async () => {
    const fetchMock = mockRedirect(
      "https://www.reddit.com/r/pics/comments/abc123/a_post/",
    );

    const resolved = await new RedditURL(
      "https://www.reddit.com/u/bob/s/UAuNzVTOen",
    ).resolveURL();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolved.getPageType()).toBe(PageType.POST_DETAILS);
  });

  it("still follows /r/<sub>/s/<id> share links", async () => {
    mockRedirect("https://www.reddit.com/r/pics/comments/abc123/a_post/");

    const resolved = await new RedditURL(
      "https://www.reddit.com/r/pics/s/UAuNzVTOen",
    ).resolveURL();

    expect(resolved.getPageType()).toBe(PageType.POST_DETAILS);
  });

  it("retries with GET when HEAD does not resolve the share link", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        url: "https://www.reddit.com/user/bob/s/UAuNzVTOen",
      })
      .mockResolvedValueOnce({
        url: "https://www.reddit.com/user/bob/m/tech/",
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const resolved = await new RedditURL(
      "https://www.reddit.com/user/bob/s/UAuNzVTOen",
    ).resolveURL();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].method).toBe("HEAD");
    expect(fetchMock.mock.calls[1][1].method).toBe("GET");
    expect(resolved.toString()).toBe("https://www.reddit.com/user/bob/m/tech/");
  });

  it("leaves the URL alone when the redirect can't be followed", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("Network request failed")) as never;

    const resolved = await new RedditURL(
      "https://www.reddit.com/user/bob/s/UAuNzVTOen",
    ).resolveURL();

    expect(resolved.toString()).toBe(
      "https://www.reddit.com/user/bob/s/UAuNzVTOen",
    );
  });

  it("does not make a request for a normal user or multireddit URL", async () => {
    const fetchMock = mockRedirect("https://www.reddit.com/");

    const user = await new RedditURL(
      "https://www.reddit.com/user/bob",
    ).resolveURL();
    const multi = await new RedditURL(
      "https://www.reddit.com/user/bob/m/tech/",
    ).resolveURL();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(user.getPageType()).toBe(PageType.USER);
    expect(multi.getPageType()).toBe(PageType.MULTIREDDIT);
  });

  it("expands /u/ to /user/ without a request", async () => {
    const fetchMock = mockRedirect("https://www.reddit.com/");

    const resolved = await new RedditURL(
      "https://www.reddit.com/u/bob",
    ).resolveURL();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(resolved.toString()).toBe("https://www.reddit.com/user/bob");
  });
});

describe("RedditURL.isShortenedShareLink", () => {
  const isShare = (url: string) => new RedditURL(url).isShortenedShareLink();

  it("recognizes every share link form", () => {
    expect(isShare("https://www.reddit.com/r/pics/s/UAuNzVTOen")).toBe(true);
    expect(isShare("https://www.reddit.com/u/bob/s/UAuNzVTOen")).toBe(true);
    expect(isShare("https://www.reddit.com/user/bob/s/UAuNzVTOen")).toBe(true);
    expect(
      isShare("https://www.reddit.com/user/bob/s/UAuNzVTOen?share_id=x"),
    ).toBe(true);
  });

  it("does not mistake normal pages for share links", () => {
    expect(isShare("https://www.reddit.com/user/bob")).toBe(false);
    expect(isShare("https://www.reddit.com/user/bob/m/tech/")).toBe(false);
    expect(isShare("https://www.reddit.com/r/pics/search/?q=cats")).toBe(false);
    expect(
      isShare("https://www.reddit.com/r/pics/comments/abc123/a_post/"),
    ).toBe(false);
  });
});
