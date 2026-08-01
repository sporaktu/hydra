import RedditURL from "../RedditURL";

/**
 * A multireddit's URL comes from Reddit's `path`, which always ends in a slash
 * ("/user/bob/m/tech/"). jsonify() used to append ".json" straight onto that,
 * producing ".../m/tech/.json" — a URL Reddit does not serve a listing for, so
 * the multireddit's own feed (the fallback when the merged feed can't be built)
 * came back empty.
 */
describe("RedditURL.jsonify", () => {
  const jsonify = (url: string) => new RedditURL(url).jsonify().toString();

  it("does not leave a slash before .json on a multireddit path", () => {
    expect(jsonify("https://www.reddit.com/user/bob/m/tech/")).toBe(
      "https://www.reddit.com/user/bob/m/tech.json?",
    );
  });

  it("leaves an already-clean path alone", () => {
    expect(jsonify("https://www.reddit.com/r/pics")).toBe(
      "https://www.reddit.com/r/pics.json?",
    );
  });

  it("keeps the domain root's slash so the host isn't mangled", () => {
    expect(jsonify("https://www.reddit.com/")).toBe(
      "https://www.reddit.com/.json?",
    );
    expect(jsonify("https://www.reddit.com")).toBe(
      "https://www.reddit.com/.json?",
    );
  });

  it("preserves query params", () => {
    expect(jsonify("https://www.reddit.com/r/pics/top/?t=week")).toBe(
      "https://www.reddit.com/r/pics/top.json?t=week",
    );
  });
});
