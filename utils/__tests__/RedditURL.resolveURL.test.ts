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

  it("follows a redd.it short link to the post it points at", async () => {
    mockRedirect("https://www.reddit.com/r/pics/comments/abc123/a_post/");

    const resolved = await new RedditURL("https://redd.it/abc123").resolveURL();

    expect(resolved.toString()).toBe(
      "https://www.reddit.com/r/pics/comments/abc123/a_post/",
    );
    expect(resolved.getPageType()).toBe(PageType.POST_DETAILS);
  });

  it("follows a scheme-less redd.it short link", async () => {
    mockRedirect("https://www.reddit.com/r/pics/comments/abc123/a_post/");

    const resolved = await new RedditURL("redd.it/abc123").resolveURL();

    expect(resolved.getPageType()).toBe(PageType.POST_DETAILS);
  });

  it("does not follow media URLs on the redd.it domain", async () => {
    const fetchMock = mockRedirect("https://www.reddit.com/");

    const image = await new RedditURL(
      "https://i.redd.it/abc123.jpg",
    ).resolveURL();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(image.getPageType()).toBe(PageType.IMAGE);
  });

  it("resolves through RedditURL.resolveURLIfValid without throwing", async () => {
    mockRedirect("https://www.reddit.com/r/pics/comments/abc123/a_post/");

    await expect(
      RedditURL.resolveURLIfValid("https://redd.it/abc123"),
    ).resolves.toBe("https://www.reddit.com/r/pics/comments/abc123/a_post/");
    await expect(
      RedditURL.resolveURLIfValid("https://example.com/not-reddit"),
    ).resolves.toBe("https://example.com/not-reddit");
  });
});

/**
 * Reddit answers on a pile of hosts that are all the same site, and links
 * arrive from post bodies and share sheets in every one of those shapes.
 * Anything the constructor rejects is punted to the browser instead of opening
 * in Hydra, so the shapes it accepts matter.
 */
describe("RedditURL host normalization", () => {
  const normalize = (url: string) => new RedditURL(url).toString();

  it("folds Reddit's alternate hosts onto www.reddit.com", () => {
    expect(normalize("https://old.reddit.com/r/pics")).toBe(
      "https://www.reddit.com/r/pics",
    );
    expect(normalize("http://old.reddit.com/r/pics")).toBe(
      "https://www.reddit.com/r/pics",
    );
    expect(normalize("https://reddit.com/r/pics")).toBe(
      "https://www.reddit.com/r/pics",
    );
    expect(normalize("https://sh.reddit.com/r/pics/s/abc123")).toBe(
      "https://www.reddit.com/r/pics/s/abc123",
    );
    expect(normalize("https://m.reddit.com/r/pics")).toBe(
      "https://www.reddit.com/r/pics",
    );
    expect(normalize("http://www.reddit.com/r/pics")).toBe(
      "https://www.reddit.com/r/pics",
    );
    expect(normalize("reddit.com/r/pics")).toBe(
      "https://www.reddit.com/r/pics",
    );
    expect(normalize("www.reddit.com/r/pics")).toBe(
      "https://www.reddit.com/r/pics",
    );
  });

  it("keeps the short and media domains", () => {
    expect(normalize("https://redd.it/abc123")).toBe("https://redd.it/abc123");
    expect(normalize("redd.it/abc123")).toBe("https://redd.it/abc123");
    expect(normalize("https://i.redd.it/abc123.jpg")).toBe(
      "https://i.redd.it/abc123.jpg",
    );
    expect(normalize("https://v.redd.it/abc123")).toBe(
      "https://v.redd.it/abc123",
    );
  });

  it("rewrites profile subreddits to user pages", () => {
    expect(normalize("https://www.reddit.com/r/u_bob")).toBe(
      "https://www.reddit.com/user/bob",
    );
  });

  it("rejects hosts that merely look like Reddit's", () => {
    expect(() => normalize("https://redd.it.example.com/abc123")).toThrow();
    expect(() =>
      normalize("https://www.reddit.com.example.com/r/pics"),
    ).toThrow();
    expect(() => normalize("https://example.com/r/pics")).toThrow();
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

describe("RedditURL.isShortenedLink", () => {
  const isShort = (url: string) => new RedditURL(url).isShortenedLink();

  it("covers the redd.it short domain as well as share links", () => {
    expect(isShort("https://redd.it/abc123")).toBe(true);
    expect(isShort("redd.it/abc123")).toBe(true);
    expect(isShort("https://www.reddit.com/user/bob/s/UAuNzVTOen")).toBe(true);
  });

  it("does not treat media or normal pages as short links", () => {
    expect(isShort("https://i.redd.it/abc123.jpg")).toBe(false);
    expect(isShort("https://v.redd.it/abc123")).toBe(false);
    expect(isShort("https://preview.redd.it/abc123.jpg")).toBe(false);
    expect(isShort("https://www.reddit.com/r/pics")).toBe(false);
  });
});
