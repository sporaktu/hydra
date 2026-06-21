import RedditURL, { PageType } from "./RedditURL";

const FEED_LIST_PAGE_TYPES: PageType[] = [
  PageType.HOME,
  PageType.SUBREDDIT,
  PageType.MULTIREDDIT,
];

/**
 * Returns the header title to show in the subreddit switcher when `url` is a
 * feed-list screen (subreddit r/X, Home/Popular/All, or a multireddit), or
 * null for any other page (user, post detail, search, settings, etc.) or an
 * unparseable URL. Used to decide whether the header title is tappable.
 */
export function getSwitcherSubredditName(url: string): string | null {
  try {
    const redditURL = new RedditURL(url);
    if (!FEED_LIST_PAGE_TYPES.includes(redditURL.getPageType())) {
      return null;
    }
    return redditURL.getPageName();
  } catch (_e) {
    return null;
  }
}
