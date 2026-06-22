import { decode } from "html-entities";
import { api } from "./RedditApi";
import { Subreddit, formatSubredditData } from "./Subreddits";

export type Rule = {
  name: string;
  descriptionHTML: string;
};

export type Sidebar = {
  subscribers: number;
  descriptionHTML: string;
};

function formatSidebarData(data: any): Sidebar {
  return {
    subscribers: data.subscribers || 0,
    descriptionHTML: decode(data.description_html),
  };
}

export async function getSidebar(subreddit: string): Promise<Sidebar> {
  const data = await api(`https://www.reddit.com/r/${subreddit}/about.json`);
  return formatSidebarData(data.data);
}

function formatRulesData(data: any): Rule[] {
  return data.rules.map((rule: any) => ({
    name: rule.short_name,
    descriptionHTML: decode(rule.description_html),
  }));
}

export async function getRules(subreddit: string): Promise<Rule[]> {
  const data = await api(
    `https://www.reddit.com/r/${subreddit}/about/rules.json`,
  );
  return formatRulesData(data);
}

/**
 * Independent EXACT-name lookup used by the subreddit switcher. Hits
 * /r/{name}/about.json directly (mirrors getSidebar above). Reddit returns a
 * `t5` object for any existing sub INCLUDING private/quarantined/banned subs,
 * so those resolve; only a true 404 (or a non-t5 body) yields null.
 */
export async function resolveSubreddit(
  name: string,
): Promise<Subreddit | null> {
  try {
    const data = await api(`https://www.reddit.com/r/${name}/about.json`);
    if (data?.kind === "t5" && data?.data?.display_name) {
      return formatSubredditData(data);
    }
    return null;
  } catch (_e) {
    return null;
  }
}
