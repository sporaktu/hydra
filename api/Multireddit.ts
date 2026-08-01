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

/**
 * A multi's `subreddits` entries come back in two shapes: expanded
 * (`{ name, data: { ...subreddit } }`, what `expand_srs=true` asks for) and
 * bare (`{ name }`). Only the expanded shape is a normal subreddit listing
 * child. Treating a bare entry as expanded throws inside formatSubredditData,
 * which used to take the WHOLE multireddit list down with it — so fall back to
 * the one field a bare entry does carry.
 */
function formatMultiSubredditData(subreddit: any): Subreddit {
  if (subreddit?.data) return formatSubredditData(subreddit);
  const name = subreddit?.name ?? "";
  return formatSubredditData({
    data: { display_name: name, url: `/r/${name}/` },
  });
}

export function formatMultiData(data: any): Multi {
  return {
    id: data.name,
    type: "multi",
    name: data.display_name,
    iconURL: data.icon_url,
    url: data.path,
    subreddits: (data.subreddits ?? [])
      .map((subreddit: any) => formatMultiSubredditData(subreddit))
      .sort((a: Subreddit, b: Subreddit) =>
        (a.name ?? "").localeCompare(b.name ?? ""),
      ),
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

/**
 * Thrown when a multireddit's definition can't be read at all. Distinct from a
 * multireddit that genuinely contains no subreddits: without the definition
 * there is no merged feed to build, and the feed must say so rather than
 * render as an empty page.
 */
export class MultiredditUnavailableError extends Error {
  name: "MultiredditUnavailableError";
  constructor() {
    super("MultiredditUnavailableError");
    this.name = "MultiredditUnavailableError";
  }
}

/**
 * `api()` parses the body whatever the status code was, so Reddit's error
 * envelopes ({ error: 403, message: "Forbidden" }) arrive looking like a
 * successful response. Only a real array of subreddits counts as an answer.
 */
function readSubredditNames(response: any): string[] | null {
  const subreddits = response?.data?.subreddits;
  if (!Array.isArray(subreddits)) return null;
  return subreddits.map((subreddit: any) => subreddit?.name).filter(Boolean);
}

/**
 * Sources for a multi's definition, tried in order. Your OWN multis are
 * normally primed into the cache by getMyMultis(), so these only run for a
 * multireddit you don't own — which is exactly the case that was silently
 * failing. old.reddit is a genuinely different backend and is worth a second
 * try for this keyless/cookie client before giving up.
 */
const MULTI_DEFINITION_URLS = [
  (multiPath: string) => `https://www.reddit.com/api/multi/${multiPath}`,
  (multiPath: string) => `https://www.reddit.com/api/multi/${multiPath}.json`,
  (multiPath: string) => `https://old.reddit.com/api/multi/${multiPath}`,
];

export async function getMultiSubredditNames(
  multiPath: string,
): Promise<string[]> {
  const cached = multiSubredditNamesCache.get(multiCacheKey(multiPath));
  if (cached) return cached;
  for (const makeURL of MULTI_DEFINITION_URLS) {
    let names: string[] | null = null;
    try {
      names = readSubredditNames(await api(makeURL(multiPath)));
    } catch (_e) {
      // Network/parse failure for this source — fall through to the next one.
    }
    if (names) {
      // Only cache a definition we actually read. Caching a failure as []
      // would pin the feed empty for the rest of the session.
      multiSubredditNamesCache.set(multiCacheKey(multiPath), names);
      return names;
    }
  }
  throw new MultiredditUnavailableError();
}

/**
 * Reddit multireddits are server-side merges of their subreddits, but the
 * /user/<name>/m/<multi>/.json feed endpoint is unreliable for Keyless
 * clients. The merged-subreddit listing (/r/a+b+c) serves the same blended
 * feed and works like any single-subreddit feed, so multireddit feeds are
 * fetched through it instead.
 *
 * Returns the merged feed URL (carrying over the multi URL's sort), "empty"
 * for a multireddit that genuinely has no subreddits, or null if `url` isn't a
 * multireddit URL at all.
 *
 * Throws MultiredditUnavailableError when the definition can't be read. That
 * used to be swallowed into a null, and the caller then fell back to the multi
 * URL's own (unreliable) feed — which is why browsing someone else's
 * multireddit rendered as a blank page with no explanation.
 */
export async function getMergedMultiFeedURL(
  url: string,
): Promise<RedditURL | "empty" | null> {
  const multiPath = getMultiPath(url);
  if (!multiPath) return null;
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

/**
 * Reddit hands back a multi's `path` WITH a trailing slash ("/user/bob/m/tech/"),
 * so pasting "/r/<sub>" onto it produced a doubled slash and a 404 — silently
 * breaking "Add to Multireddit" / "Delete From Multireddit". Rebuild the path
 * through the same normalizer the feed uses instead.
 */
function multiSubredditEndpoint(
  multi: Multi,
  subredditName: Subreddit["name"],
): string {
  const multiPath = getMultiPath(multi.url);
  if (!multiPath) {
    throw new Error(`Not a multireddit URL: ${multi.url}`);
  }
  return `https://www.reddit.com/api/multi/${multiPath}/r/${subredditName}`;
}

export async function addToMulti(
  multi: Multi,
  subredditName: Subreddit["name"],
) {
  await api(
    multiSubredditEndpoint(multi, subredditName),
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
    multiSubredditEndpoint(multi, subredditName),
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
