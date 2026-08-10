import KeyStore from "./KeyStore";
import URL from "./URL";
import {
  DEFAULT_COMMENT_SORT_KEY,
  DEFAULT_POST_SORT_KEY,
  DEFAULT_POST_SORT_TOP_KEY,
  makeCommentSubredditSortKey,
  makePostSubredditSortKey,
  makePostSubredditSortTopKey,
  REMEMBER_COMMENT_SUBREDDIT_SORT_KEY,
  REMEMBER_POST_SUBREDDIT_SORT_KEY,
  SORT_HOME_PAGE,
} from "../constants/SettingsKeys";
import { USER_AGENT } from "../api/UserAgent";

export enum PageType {
  HOME,
  POST_DETAILS,
  SUBREDDIT,
  SUBREDDIT_SEARCH,
  MULTIREDDIT,
  USER,
  SEARCH,
  INBOX,
  SIDEBAR,
  WIKI,

  MESSAGES,

  ACCOUNTS,
  SETTINGS,
  WEBVIEW,

  IMAGE,

  UNKNOWN,
}

/**
 * The only hosts Hydra will treat as Reddit. Matched exactly — a prefix check
 * would accept things like "redd.it.example.com".
 */
const REDDIT_HOSTS = [
  "www.reddit.com",
  "redd.it",
  "i.redd.it",
  "v.redd.it",
  "preview.redd.it",
];

/**
 * Every host Reddit itself serves the site from. They're all the same site, so
 * they're all folded onto www.reddit.com. "sh." is the host Reddit's own share
 * sheet uses.
 */
const REDDIT_COM_HOST_PATTERN =
  /^https:\/\/(?:www\.|old\.|new\.|np\.|m\.|sh\.|amp\.)?reddit\.com/i;

export default class RedditURL extends URL {
  url: string;

  constructor(url: string) {
    super(url);
    if (url.startsWith("hydra://")) {
      this.url = url;
    } else if (url.startsWith("/")) {
      /* Override super() call if short reddit link, e.g. "/r/pics" */
      this.url = url.startsWith("//")
        ? `https:${url}`
        : `https://www.reddit.com${url}`;
    } else {
      this.url = RedditURL.normalizeHost(url);
    }
    if (
      !this.url.startsWith("hydra://") &&
      !REDDIT_HOSTS.includes(this.getHostName().toLowerCase())
    ) {
      throw new Error(`Not a reddit URL: ${url}`);
    }
  }

  /**
   * Folds the many hosts Reddit answers on (old/new/np/m/sh/amp, no-www,
   * plain http, no scheme at all) onto the canonical ones, so the rest of the
   * class only ever has to reason about www.reddit.com and redd.it.
   */
  private static normalizeHost(url: string): string {
    const withScheme = /^https?:\/\//i.test(url)
      ? url.replace(/^http:\/\//i, "https://")
      : `https://${url}`;
    return withScheme
      .replace(REDDIT_COM_HOST_PATTERN, "https://www.reddit.com")
      .replace(/^https:\/\/www\.redd\.it/i, "https://redd.it")
      .replace("https://www.reddit.com/r/u_", "https://www.reddit.com/user/");
  }

  static getURLIfValid(url: string) {
    try {
      return { url: new RedditURL(url).toString(), isValid: true };
    } catch (_e) {
      return { url, isValid: false };
    }
  }

  /**
   * Resolves a URL when Hydra can make sense of it, falling back to the string
   * it was handed. Entry points fed URLs from outside the app (the share
   * sheet, the clipboard, a deep link, a post's own link) can't assume they're
   * even Reddit URLs, and must never throw over one.
   */
  static async resolveURLIfValid(url: string): Promise<string> {
    try {
      return (await new RedditURL(url).resolveURL()).toString();
    } catch (_e) {
      return url;
    }
  }

  static getPageType(url: string): PageType {
    try {
      const redditURL = new RedditURL(url);
      return redditURL.getPageType();
    } catch (_e) {
      return PageType.UNKNOWN;
    }
  }

  getSort(): [string | null, string | null] {
    const pageType = this.getPageType();
    if ([PageType.HOME, PageType.SUBREDDIT].includes(pageType)) {
      const sort = this.url.split(/\/r\/|\/|\?/).slice(3, 5) ?? [];
      for (const check of ["best", "hot", "new", "top", "rising"]) {
        if (sort.includes(check)) {
          return [check, this.getQueryParam("t")];
        }
      }
    } else if (pageType === PageType.MULTIREDDIT) {
      const sort = this.url.split(/\/m\/|\/|\?/).slice(6, 7)[0];
      for (const check of ["hot", "new", "top", "rising", "controversial"]) {
        if (sort === check) {
          return [
            check,
            check === "top" ? (this.getQueryParam("t") ?? "day") : null,
          ];
        }
      }
    } else if (pageType === PageType.SUBREDDIT_SEARCH) {
      return [this.getQueryParam("sort"), null];
    } else if (pageType === PageType.POST_DETAILS) {
      return [this.getQueryParam("sort"), this.getQueryParam("t")];
    } else if (pageType === PageType.USER) {
      return [this.getQueryParam("sort") ?? "new", this.getQueryParam("t")];
    }
    return [null, null];
  }

  changeSort(sort: string, time?: string): RedditURL {
    const subreddit = this.getSubreddit();
    const urlParams = this.getURLParams();
    const pageType = this.getPageType();
    if (sort === "Q&A") {
      sort = "qa";
    }
    if (sort === "Comment Count") {
      sort = "comments";
    }
    if (pageType === PageType.HOME) {
      this.url = `https://www.reddit.com/${sort.toLowerCase()}/?${urlParams}`;
    } else if (pageType === PageType.SUBREDDIT) {
      this.url = `https://www.reddit.com/r/${subreddit}/${sort.toLowerCase()}/?${urlParams}`;
    } else if (pageType === PageType.SUBREDDIT_SEARCH) {
      this.changeQueryParam("sort", sort.toLowerCase());
    } else if (pageType === PageType.POST_DETAILS) {
      this.changeQueryParam("sort", sort.toLowerCase());
    } else if (pageType === PageType.MULTIREDDIT) {
      const pathParts = this.getRelativePath().split("/");
      pathParts[5] = sort.toLowerCase();
      this.url = `https://www.reddit.com${pathParts.join("/")}?${urlParams}`;
    } else if (pageType === PageType.USER) {
      this.changeQueryParam("sort", sort.toLowerCase());
    }
    if (time) {
      this.changeQueryParam("t", time.toLowerCase());
    }
    return this;
  }

  getBasePage(): string {
    const pageType = this.getPageType();
    if (pageType === PageType.HOME) {
      return this.getBasePath().replace(/(reddit\.com).*/, "$1");
    }
    if (pageType === PageType.SUBREDDIT) {
      return this.getBasePath().replace(/(\/r\/.+)\/.*/, "$1");
    }
    return this.getBasePath();
  }

  getSubreddit(): string {
    return this.url.split("/r/")[1]?.split(/\/|\?/)[0] ?? "";
  }

  jsonify(): RedditURL {
    const base = this.getBasePath();
    const urlParams = this.getURLParams();
    // A trailing slash would produce ".../m/tech/.json". Drop it — but never so
    // far that the domain root loses its own slash ("https://www.reddit.com.json").
    const trimmed = base.replace(/\/+$/, "");
    const jsonBase = /^https?:\/\/[^/]+$/.test(trimmed)
      ? `${trimmed}/`
      : trimmed;
    this.url = `${jsonBase}.json?${urlParams}`;
    return this;
  }

  getPageType(): PageType {
    const relativePath = this.getRelativePath();
    if (this.url.startsWith("hydra://accounts")) {
      return PageType.ACCOUNTS;
    } else if (this.url.startsWith("hydra://settings")) {
      return PageType.SETTINGS;
    } else if (this.url.startsWith("hydra://webview")) {
      return PageType.WEBVIEW;
    } else if (
      relativePath === "" ||
      relativePath === "/" ||
      relativePath.startsWith("/best") ||
      relativePath.startsWith("/hot") ||
      relativePath.startsWith("/new") ||
      relativePath.startsWith("/top") ||
      relativePath.startsWith("/rising")
    ) {
      return PageType.HOME;
    } else if (relativePath.includes("/comments/")) {
      return PageType.POST_DETAILS;
    } else if (
      relativePath.startsWith("/r/") &&
      relativePath.includes("/search/")
    ) {
      return PageType.SUBREDDIT_SEARCH;
    } else if (
      relativePath.startsWith("/r/") &&
      (relativePath.includes("/wiki/") || relativePath.includes("/w/"))
    ) {
      return PageType.WIKI;
    } else if (
      relativePath.startsWith("/r/") &&
      relativePath.includes("/about/")
    ) {
      return PageType.SIDEBAR;
    } else if (relativePath.startsWith("/r/")) {
      return PageType.SUBREDDIT;
    } else if (relativePath.startsWith("/message/inbox")) {
      return PageType.INBOX;
    } else if (relativePath.startsWith("/message/messages")) {
      return PageType.MESSAGES;
    } else if (relativePath.match(/\/(user|u)\/.*\/m\/.*/)) {
      return PageType.MULTIREDDIT;
    } else if (
      relativePath.startsWith("/u/") ||
      relativePath.startsWith("/user/")
    ) {
      return PageType.USER;
    } else if (relativePath.startsWith("/search")) {
      return PageType.SEARCH;
    } else if (this.url.startsWith("https://i.redd.it")) {
      return PageType.IMAGE;
    } else if (this.url.startsWith("https://preview.redd.it")) {
      return PageType.IMAGE;
    } else {
      return PageType.UNKNOWN;
    }
  }

  getPageName(): string {
    let name = "";
    const pageType = this.getPageType();
    if (pageType === PageType.HOME) {
      const relativePath = this.getRelativePath();
      name = relativePath.split("/")[1];
      name = name ? name : "Home";
      name = name.charAt(0).toUpperCase() + name.slice(1);
    } else if (pageType === PageType.POST_DETAILS) {
      name = this.getSubreddit();
    } else if (pageType === PageType.SIDEBAR) {
      name = "Sidebar";
    } else if (pageType === PageType.WIKI) {
      name = "Wiki";
    } else if (pageType === PageType.SUBREDDIT) {
      name = this.getSubreddit();
    } else if (pageType === PageType.MULTIREDDIT) {
      name = this.getRelativePath().split("/")[4] ?? "Multireddit";
    } else if (pageType === PageType.USER) {
      name = this.getRelativePath().split("/")[2] ?? "User";
    } else if (pageType === PageType.SEARCH) {
      name = "Search";
    } else if (pageType === PageType.ACCOUNTS) {
      name = "Accounts";
    } else if (pageType === PageType.SETTINGS) {
      const route = this.getRelativePath().split("/").slice(-1)[0];
      name = route.replace(/([A-Z])/g, " $1").trim();
      name = name.charAt(0).toUpperCase() + name.slice(1);
    } else if (pageType === PageType.UNKNOWN) {
      name = "Error";
    }
    return name;
  }

  /**
   * Reddit's share sheet hands out shortened links: /r/<subreddit>/s/<id>,
   * /user/<name>/s/<id> and /u/<name>/s/<id> (the last two are what sharing
   * from a profile or a multireddit produces). The id says nothing about what
   * it points at, so the page type of a share link is meaningless until the
   * redirect has been followed — a /user/<name>/s/<id> link would otherwise
   * look like a plain user page and load as an empty one.
   */
  isShortenedShareLink(): boolean {
    return /^\/(?:r|u|user)\/[^/]+\/s\/[^/]+/.test(this.getRelativePath());
  }

  /**
   * Reddit's short domain: https://redd.it/<postId>. Like a share link, it's
   * an id with no page behind it until the redirect is followed. Media hosts
   * on the same domain (i/v/preview.redd.it) are real content URLs, not short
   * links, which is why this matches the host exactly.
   */
  isShortDomainLink(): boolean {
    return (
      this.getHostName().toLowerCase() === "redd.it" &&
      /^\/[^/]+/.test(this.getRelativePath())
    );
  }

  /**
   * True for any link whose destination is only knowable by following it.
   * Callers that decide between opening a link in Hydra and handing it to the
   * browser have to check this: a short link's page type is a lie until
   * resolveURL() has run.
   */
  isShortenedLink(): boolean {
    return this.isShortenedShareLink() || this.isShortDomainLink();
  }

  /**
   * Properly formats shortened URLs and forwarded URLs
   */
  async resolveURL(): Promise<RedditURL> {
    const isShortLink = this.isShortenedLink();
    if (this.getRelativePath().startsWith("/u/")) {
      this.url = this.url.replace("/u/", "/user/");
      /* A /u/<name>/s/<id> share link still needs its redirect followed */
      if (!isShortLink) return this;
    }
    if (this.getPageType() !== PageType.UNKNOWN && !isShortLink) {
      return this;
    }
    const resolved =
      (await this.followRedirect("HEAD")) ??
      /* Some edges refuse HEAD on short links, so try again with GET */
      (isShortLink ? await this.followRedirect("GET") : null);
    if (resolved) {
      this.url = resolved;
    }
    return this;
  }

  /**
   * Follows this URL's redirects and returns where it landed, or null if the
   * request failed or landed somewhere that isn't a Reddit URL. Navigation
   * calls this, so a network failure must leave the URL untouched rather than
   * throw.
   */
  private async followRedirect(method: "HEAD" | "GET"): Promise<string | null> {
    try {
      const response = await fetch(this.url, {
        method,
        redirect: "follow",
        headers: {
          "User-Agent": USER_AGENT,
        },
      });
      if (!response.url || response.url === this.url) return null;
      const { url, isValid } = RedditURL.getURLIfValid(response.url);
      if (!isValid) return null;
      /* A redirect that lands on another short link resolved nothing */
      if (new RedditURL(url).isShortenedLink()) return null;
      return url;
    } catch (_e) {
      return null;
    }
  }

  applyPreferredSorts(): RedditURL {
    const pageType = this.getPageType();
    const [sort, _sortTime] = this.getSort();
    if (sort) return this;

    const shouldApplySortToHomePage = KeyStore.getBoolean(SORT_HOME_PAGE);

    if (pageType === PageType.HOME && !shouldApplySortToHomePage) return this;

    if ([PageType.SUBREDDIT, PageType.HOME].includes(pageType)) {
      const subreddit = this.getSubreddit();
      const subredditSpecificSort = KeyStore.getBoolean(
        REMEMBER_POST_SUBREDDIT_SORT_KEY,
      )
        ? KeyStore.getString(makePostSubredditSortKey(subreddit))
        : null;
      const preferredSort =
        subredditSpecificSort ??
        KeyStore.getString(DEFAULT_POST_SORT_KEY) ??
        "default";
      if (preferredSort !== "default") {
        let time = undefined;
        if (preferredSort === "top") {
          const subredditSpecificTime = KeyStore.getBoolean(
            REMEMBER_POST_SUBREDDIT_SORT_KEY,
          )
            ? KeyStore.getString(makePostSubredditSortTopKey(subreddit))
            : null;
          time =
            subredditSpecificTime ??
            KeyStore.getString(DEFAULT_POST_SORT_TOP_KEY) ??
            "all";
        }
        this.changeSort(preferredSort, time);
      }
    }

    if (pageType === PageType.POST_DETAILS) {
      const subreddit = this.getSubreddit();
      const subredditSpecificSort = KeyStore.getBoolean(
        REMEMBER_COMMENT_SUBREDDIT_SORT_KEY,
      )
        ? KeyStore.getString(makeCommentSubredditSortKey(subreddit))
        : null;
      const preferredSort =
        subredditSpecificSort ??
        KeyStore.getString(DEFAULT_COMMENT_SORT_KEY) ??
        "default";
      if (preferredSort !== "default") {
        this.changeSort(preferredSort);
      }
    }

    return this;
  }

  supportsSharingThemes(): boolean {
    const subreddit = this.getSubreddit().toLowerCase();
    return ["hydraclient", "hydrafeaturerequest", "hydrathemes"].includes(
      subreddit,
    );
  }

  isCombinedSubredditFeed(): boolean {
    const subreddit = this.getSubreddit().toLowerCase();
    return (
      this.getPageType() !== PageType.SUBREDDIT ||
      ["popular", "all"].includes(subreddit)
    );
  }
}
