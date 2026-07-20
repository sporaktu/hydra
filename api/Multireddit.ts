import "react-native-url-polyfill/auto";
import { api } from "./RedditApi";
import { formatSubredditData, Subreddit } from "./Subreddits";
import RedditURL from "../utils/RedditURL";

export type Multi = {
  id: string;
  type: "multi";
  name: string;
  iconURL: string;
  url: string;
  subreddits: Subreddit[];
};

export function formatMultiData(data: any): Multi {
  return {
    id: data.name,
    type: "multi",
    name: data.display_name,
    iconURL: data.icon_url,
    url: data.path,
    subreddits: data.subreddits
      .map((subreddit: any) => formatSubredditData(subreddit))
      .sort((a: Subreddit, b: Subreddit) => a.name.localeCompare(b.name)),
  };
}

/**
 * Caches each multireddit's subreddit names (keyed by its normalized
 * "user/<name>/m/<multi>" path) so paginating a multireddit feed doesn't
 * refetch the multi's definition on every page.
 */
const multiSubredditNamesCache = new Map<string, string[]>();

/**
 * Extracts the "user/<name>/m/<multi>" path from any multireddit URL, or
 * null if the URL isn't a multireddit URL.
 */
export function getMultiPath(url: string): string | null {
  try {
    const relativePath = new RedditURL(url).getRelativePath();
    const match = relativePath.match(/\/(?:user|u)\/([^/]+)\/m\/([^/?]+)/);
    return match ? `user/${match[1]}/m/${match[2]}` : null;
  } catch (_e) {
    return null;
  }
}

function multiCacheKey(multiPath: string): string {
  return multiPath.toLowerCase();
}

export function clearCachedMultiSubreddits(multi: Multi) {
  const multiPath = getMultiPath(multi.url);
  if (multiPath) {
    multiSubredditNamesCache.delete(multiCacheKey(multiPath));
  }
}

export async function getMultiSubredditNames(
  multiPath: string,
): Promise<string[]> {
  const cached = multiSubredditNamesCache.get(multiCacheKey(multiPath));
  if (cached) return cached;
  const multi = await api(`https://www.reddit.com/api/multi/${multiPath}`);
  const names: string[] = multi.data.subreddits.map(
    (subreddit: any) => subreddit.name,
  );
  multiSubredditNamesCache.set(multiCacheKey(multiPath), names);
  return names;
}

/**
 * Reddit multireddits are server-side merges of their subreddits, but the
 * /user/<name>/m/<multi>/.json feed endpoint is unreliable for Keyless
 * clients. The merged-subreddit listing (/r/a+b+c) serves the same blended
 * feed and works like any single-subreddit feed, so multireddit feeds are
 * fetched through it instead.
 *
 * Returns the merged feed URL (carrying over the multi URL's sort), "empty"
 * for a multireddit with no subreddits, or null if the multi's definition
 * couldn't be loaded (callers should fall back to the multi URL itself).
 */
export async function getMergedMultiFeedURL(
  url: string,
): Promise<RedditURL | "empty" | null> {
  const multiPath = getMultiPath(url);
  if (!multiPath) return null;
  try {
    const subredditNames = await getMultiSubredditNames(multiPath);
    if (subredditNames.length === 0) return "empty";
    const [sort, sortTime] = new RedditURL(url).getSort();
    const mergedURL = new RedditURL(
      `https://www.reddit.com/r/${subredditNames.join("+")}${sort ? `/${sort}` : ""}`,
    );
    if (sortTime) {
      mergedURL.changeQueryParam("t", sortTime);
    }
    return mergedURL;
  } catch (_e) {
    return null;
  }
}

export async function getMyMultis(): Promise<Multi[]> {
  const searchParams = new URLSearchParams({
    expand_srs: "true",
  });
  const multis = await api(
    `https://www.reddit.com/api/multi/mine?${searchParams.toString()}`,
    {},
    { requireAuth: true },
  );
  const formattedMultis: Multi[] = multis.map((multi: any) =>
    formatMultiData(multi.data),
  );
  formattedMultis.forEach((multi) => {
    const multiPath = getMultiPath(multi.url);
    if (multiPath) {
      multiSubredditNamesCache.set(
        multiCacheKey(multiPath),
        multi.subreddits.map((subreddit) => subreddit.name),
      );
    }
  });
  return formattedMultis;
}

export async function addToMulti(
  multi: Multi,
  subredditName: Subreddit["name"],
) {
  await api(
    `https://www.reddit.com/api/multi${multi.url}/r/${subredditName}`,
    {
      method: "PUT",
    },
    {
      requireAuth: true,
      body: {
        model: JSON.stringify({
          name: subredditName,
        }),
      },
    },
  );
  clearCachedMultiSubreddits(multi);
}

export async function removeFromMulti(
  multi: Multi,
  subredditName: Subreddit["name"],
) {
  await api(
    `https://www.reddit.com/api/multi${multi.url}/r/${subredditName}`,
    {
      method: "DELETE",
    },
    {
      requireAuth: true,
      dontJsonifyResponse: true,
    },
  );
  clearCachedMultiSubreddits(multi);
}
