import "react-native-url-polyfill/auto";
import { decode } from "html-entities";

import { Flair, formatFlair } from "./Flair";
import { api } from "./RedditApi";
import {
  getMergedMultiFeedURL,
  MultiredditUnavailableError,
} from "./Multireddit";
import RedditURL, { PageType } from "../utils/RedditURL";
import Time from "../utils/Time";
import URL, { OpenGraphData } from "../utils/URL";
import { Alert } from "react-native";
import { formatPostFlair, PostFlair } from "./PostFlair";
import { ImageSource } from "expo-image";

export type Poll = {
  voteCount: number;
  options: {
    id: string;
    text: string;
  }[];
};

export type Post = {
  id: string;
  name: string;
  type: "post";
  crossPost?: Post;
  crossCommentLink?: string;
  title: string;
  author: string;
  upvotes: number;
  scoreHidden: boolean;
  saved: boolean;
  userVote: VoteOption;
  flair: Flair | null;
  postFlair: PostFlair | null;
  subreddit: string;
  subredditIcon: string;
  isModerator: boolean;
  isStickied: boolean;
  isNSFW: boolean;
  isSpoiler: boolean;
  interactionDisabledStatus: "locked" | "archived" | null;
  text: string;
  html: string;
  commentCount: number;
  link: string;
  images: (string | ImageSource[])[];
  imageThumbnail: ImageSource | null;
  mediaAspectRatio: number;
  videos: {
    source: string;
    videoDownloadURL: string;
    needsResolution?: boolean;
  }[];
  poll: Poll | undefined;
  externalLink: string | undefined;
  openGraphData: OpenGraphData | undefined;
  createdAt: number;
  timeSince: string;
  shortTimeSince: string;
  after: string;
};

export enum VoteOption {
  UpVote = 1,
  NoVote = 0,
  DownVote = -1,
}

type GetPostOptions = {
  limit?: number;
  after?: string;
};

function formatImages(child: any): ImageSource[][] {
  /**
   * Images can be stored in .preview or in .media_metadata. I'm not sure what causes
   * one or the other. We try loading both.
   */
  if (child.data.preview?.images?.length) {
    return child.data.preview.images.map((image: any) => {
      const sizes = image.resolutions.map(
        (item: any) =>
          ({
            uri: decode(item.url),
            width: item.width,
            height: item.height,
          }) as ImageSource,
      );
      if (image.source) {
        sizes.push({
          uri: decode(image.source.url),
          width: image.source.width,
          height: image.source.height,
        } as ImageSource);
      }
      return sizes;
    });
  }
  if (child.data.gallery_data?.items?.length) {
    const galleryIndexes =
      child.data.gallery_data?.items?.reduce?.(
        (acc: string[], item: any, i: number) => ({
          ...acc,
          [item.media_id]: i,
        }),
        {},
      ) ?? {};

    return (
      Object.values(child.data.media_metadata ?? {})
        /**
         * Posts can have unprocessed media that we can't display. I don't
         * know why they remain unprocessed. Maybe a Reddit server media
         * processing bug?
         *
         * https://www.reddit.com/r/pocketcasts/comments/1tgukak/display_first_two_lines_of_episode_titles_in_up/
         */
        .filter((data: any) => !!data.p)
        .sort((a: any, b: any) => galleryIndexes[a.id] - galleryIndexes[b.id])
        .map((data: any) => {
          const sizes = data.p.map(
            (item: any) =>
              ({
                uri: decode(item.u),
                width: item.x,
                height: item.y,
              }) as ImageSource,
          );
          if (data.s) {
            sizes.push({
              uri: decode(data.s.u),
              width: data.s.x,
              height: data.s.y,
            } as ImageSource);
          }
          return sizes;
        })
    );
  }
  return [];
}

/**
 * Reddit exposes a GIF-as-video in `preview.images[].variants.mp4` as a
 * full-size `source` plus a list of downscaled `resolutions` (which top out
 * around 640px wide). Always prefer `source` — the downscaled variants are
 * literally previews and look soft on a phone screen, let alone fullscreen.
 */
function bestPreviewMp4(image: any): string | null {
  const mp4 = image?.variants?.mp4;
  if (!mp4) return null;
  const item = mp4.source ?? mp4.resolutions?.at?.(-1);
  return item?.url ? decode(item.url) : null;
}

/**
 * Videos in a Reddit gallery post live in `media_metadata`, one entry per
 * gallery item, ordered by `gallery_data.items`. Each entry's `s.mp4` is the
 * full-size original (`p` holds the preview-sized stills).
 */
function formatGalleryVideos(
  child: any,
): { source: string; videoDownloadURL: string }[] {
  if (!child.data.gallery_data?.items?.length) return [];

  // Example post: https://www.reddit.com/r/CelebsWithPetiteTits/comments/1s4xx9l/ana_de_armas_or_alison_brie/
  const galleryIndexes =
    child.data.gallery_data?.items?.reduce?.(
      (acc: string[], item: any, i: number) => ({
        ...acc,
        [item.media_id]: i,
      }),
      {},
    ) ?? {};

  return (
    Object.values(child.data.media_metadata ?? {})
      /**
       * Posts can have unprocessed media that we can't display. I don't
       * know why they remain unprocessed. Maybe a Reddit server media
       * processing bug?
       *
       * https://www.reddit.com/r/pocketcasts/comments/1tgukak/display_first_two_lines_of_episode_titles_in_up/
       */
      .filter((data: any) => !!data.p)
      .sort((a: any, b: any) => galleryIndexes[a.id] - galleryIndexes[b.id])
      .map((data: any) => {
        if (!data.s?.mp4) return null;
        const url = decode(data.s.mp4);
        return {
          source: url,
          videoDownloadURL: url,
        };
      })
      .filter((video) => video !== null)
  );
}

export async function formatVideos(
  child: any,
): Promise<
  { source: string; videoDownloadURL: string; needsResolution?: boolean }[]
> {
  if (child.data.media?.reddit_video?.hls_url) {
    return [
      {
        source: child.data.media.reddit_video.hls_url,
        videoDownloadURL: child.data.media.reddit_video.fallback_url,
      },
    ];
  }
  if (child.data.media?.reddit_video?.fallback_url) {
    // No HLS playlist (happens on some crossposts / older videos). The DASH
    // fallback is the full-size mp4 — much better than dropping down to the
    // preview variants below.
    const fallbackURL = decode(child.data.media.reddit_video.fallback_url);
    return [
      {
        source: fallbackURL,
        videoDownloadURL: fallbackURL,
      },
    ];
  }
  /**
   * Galleries are checked before the preview variants: a gallery post that
   * also carries a `preview` would otherwise collapse to a single
   * preview-resolution video instead of every item at full size.
   */
  const galleryVideos = formatGalleryVideos(child);
  if (galleryVideos.length) {
    return galleryVideos;
  }
  if (child.data.preview?.images?.[0]?.variants?.mp4) {
    // Example post: https://www.reddit.com/r/gifs/comments/1rzl4fp/seth_hernandez_throws_a_1024_mph_laser_on_the/
    return child.data.preview.images
      .map((image: any) => {
        const url = bestPreviewMp4(image);
        return url ? { source: url, videoDownloadURL: url } : null;
      })
      .filter((video: any) => video !== null);
  }
  const { url, isValid } = RedditURL.getURLIfValid(child.data.url);
  if (!isValid) {
    if (url.includes("imgur.com") && url.endsWith(".gifv")) {
      const videoURL = url.replace(".gifv", ".mp4");
      return [
        {
          source: videoURL,
          videoDownloadURL: videoURL,
        },
      ];
    } else if (url.includes("gfycat.com")) {
      const videoURL = `https://web.archive.org/web/0if_/thumbs.${url.split("https://")[1]}-mobile.mp4`;
      return [
        {
          source: videoURL,
          videoDownloadURL: videoURL,
        },
      ];
    } else if (url.includes("redgifs.com")) {
      return [
        {
          source: url,
          videoDownloadURL: url,
          needsResolution: true,
        },
      ];
    }
  }
  return [];
}

/**
 * Reddit pages a link post can point at that Hydra knows how to open in-app.
 * Anything else valid-but-unlisted (i.redd.it images, /gallery/ links, the
 * post's own permalink) is already handled by the media parsing above and must
 * not also render as a link.
 */
const IN_APP_LINK_PAGE_TYPES = [
  PageType.SUBREDDIT,
  PageType.SUBREDDIT_SEARCH,
  PageType.MULTIREDDIT,
  PageType.USER,
  PageType.SEARCH,
  PageType.WIKI,
  PageType.SIDEBAR,
];

/**
 * Whether a link post's (already validated) Reddit URL should become a
 * tappable in-app link.
 *
 * This used to be a bare `url.includes("/r/")` check, which silently dropped
 * every link post pointing at a page that doesn't live under /r/ — most
 * visibly multireddits (/user/<name>/m/<multi>), i.e. essentially all of
 * r/multihub, but also user profiles and site-wide searches. Those posts got
 * no externalLink at all, so no link card was rendered and tapping the post
 * only opened its comments.
 */
function isInAppLinkTarget(url: string, postSubreddit: string): boolean {
  const pageType = RedditURL.getPageType(url);
  if (!IN_APP_LINK_PAGE_TYPES.includes(pageType)) return false;
  if (pageType === PageType.SUBREDDIT) {
    // A post linking to the listing of the subreddit it was posted in isn't
    // taking the reader anywhere new.
    return (
      new RedditURL(url).getSubreddit().toLowerCase() !==
      (postSubreddit ?? "").toLowerCase()
    );
  }
  return true;
}

export async function formatPostData(child: any): Promise<Post> {
  const images = formatImages(child);
  const imageThumbnail = images?.at(0)?.at(0) ?? null;

  // default in case we can't get the aspect ratio
  let mediaAspectRatio = 0.75;
  if (images.length && images[0][0].width && images[0][0].height) {
    mediaAspectRatio = images[0][0].width / images[0][0].height;
  }

  const videos = await formatVideos(child);

  let openGraphData: OpenGraphData | undefined = undefined;
  let externalLink = undefined;
  let crossCommentLink = undefined;

  const { url, isValid } = RedditURL.getURLIfValid(child.data.url);
  if (isValid) {
    if (
      child.data.url.includes("/comments/") &&
      !child.data.url.includes(child.data.permalink)
    ) {
      crossCommentLink = url;
    } else if (isInAppLinkTarget(url, child.data.subreddit)) {
      // Link posts that point at another page on Reddit but are not cross posts
      externalLink = url;
    }
  } else {
    externalLink = child.data.url;
    if (
      !videos.length &&
      !url.includes("imgur.com") &&
      !url.includes("gfycat.com") &&
      !url.includes("redgifs.com") &&
      !url.includes(".gif") &&
      !url.includes(".gifv") &&
      !url.includes(".mp4")
    ) {
      openGraphData = await new URL(externalLink).getOpenGraphData();
    }
  }

  let poll = undefined;
  if (child.data.poll_data) {
    poll = {
      voteCount: child.data.poll_data.total_vote_count,
      options: child.data.poll_data.options,
    };
  }

  let userVote = VoteOption.NoVote;
  if (child.data.likes === true) {
    userVote = VoteOption.UpVote;
  } else if (child.data.likes === false) {
    userVote = VoteOption.DownVote;
  }

  let crossPost: Post | undefined = undefined;
  if (child.data.crosspost_parent_list?.[0]) {
    crossPost = await formatPostData({
      data: child.data.crosspost_parent_list[0],
    });
  }

  return {
    id: child.data.id,
    name: child.data.name,
    type: "post",
    crossPost,
    crossCommentLink,
    title: decode(child.data.title),
    author: child.data.author,
    upvotes: child.data.ups,
    scoreHidden: child.data.score_hidden,
    saved: child.data.saved,
    userVote,
    flair: formatFlair(child.data),
    postFlair: formatPostFlair(child.data),
    subreddit: child.data.subreddit,
    subredditIcon:
      child.data.sr_detail?.community_icon?.split("?")?.[0] ??
      child.data.sr_detail?.icon_img,
    isModerator: child.data.distinguished === "moderator",
    isStickied: child.data.stickied,
    isNSFW: child.data.over_18,
    isSpoiler: child.data.spoiler,
    interactionDisabledStatus: child.data.archived
      ? "archived"
      : child.data.locked
        ? "locked"
        : null,
    text: decode(child.data.selftext),
    html: decode(child.data.selftext_html),
    commentCount: child.data.num_comments,
    link: `https://www.reddit.com${child.data.permalink}`,
    images,
    imageThumbnail,
    mediaAspectRatio,
    videos,
    poll,
    externalLink,
    openGraphData,
    createdAt: child.data.created,
    timeSince: new Time(child.data.created * 1000).prettyTimeSince() + " ago",
    shortTimeSince: new Time(child.data.created * 1000).shortPrettyTimeSince(),
    after: child.data.name,
  };
}

export class BannedSubredditError extends Error {
  name: "BannedSubredditError";
  constructor() {
    super("BannedSubredditError");
    this.name = "BannedSubredditError";
  }
}

export class PrivateSubredditError extends Error {
  name: "PrivateSubredditError";
  constructor() {
    super("PrivateSubredditError");
    this.name = "PrivateSubredditError";
  }
}

export async function getPosts(
  url: string,
  options: GetPostOptions = {},
): Promise<Post[]> {
  let redditURL = new RedditURL(url);
  // Set when a multireddit's definition couldn't be read, so this request is
  // the last-resort attempt at the multi's own listing rather than the merged
  // /r/a+b+c feed. See the check after the response comes back.
  let isUnreadableMulti = false;
  if (redditURL.getPageType() === PageType.MULTIREDDIT) {
    try {
      const mergedFeedURL = await getMergedMultiFeedURL(url);
      if (mergedFeedURL === "empty") {
        return [];
      }
      if (mergedFeedURL) {
        redditURL = mergedFeedURL;
      }
    } catch (e) {
      if (!(e instanceof MultiredditUnavailableError)) throw e;
      isUnreadableMulti = true;
    }
  }
  redditURL.changeQueryParam("sr_detail", "true");
  redditURL.changeQueryParam("limit", String(options?.limit ?? 10));
  redditURL.changeQueryParam("after", options?.after ?? "");
  redditURL.jsonify();
  let response = await api(redditURL.toString());
  const gatedResult = await handleGatedSubreddit(response, url);
  if (gatedResult === "cancelled") return [];
  if (gatedResult === "success") {
    response = await api(redditURL.toString());
  }
  if (response.reason === "banned") {
    throw new BannedSubredditError();
  }
  if (response.reason === "private") {
    throw new PrivateSubredditError();
  }
  if (isUnreadableMulti && !Array.isArray(response?.data?.children)) {
    // Neither the multi's definition nor its own listing came back. Say so
    // instead of rendering a blank feed that looks like "no posts here".
    throw new MultiredditUnavailableError();
  }
  const posts: Post[] = await Promise.all(
    response.data.children.map(
      async (child: any) => await formatPostData(child),
    ),
  );
  return posts;
}

export async function handleGatedSubreddit(
  response: any,
  url: string,
): Promise<"success" | "cancelled" | null> {
  const warning =
    response.quarantine_message ?? response.interstitial_warning_message;
  if (!warning) return null;
  const type = response.quarantine_message ? "quarantine" : "gated";
  return new Promise((resolve) => {
    Alert.alert("Warning", warning, [
      {
        text: "Cancel",
        style: "cancel",
        onPress: () => {
          resolve("cancelled");
        },
      },
      {
        text: "Proceed",
        onPress: async () => {
          await api(
            `https://old.reddit.com/${type}`,
            {
              method: "POST",
            },
            {
              requireAuth: true,
              body: {
                sr_name: new RedditURL(url).getSubreddit(),
                accept: "yes",
              },
              dontJsonifyResponse: true,
            },
          );
          resolve("success");
        },
      },
    ]);
  });
}

export async function searchSubredditPosts(
  url: string,
  options: GetPostOptions = {},
): Promise<Post[]> {
  const redditURL = new RedditURL(url);
  redditURL.changeQueryParam("restrict_sr", "true");
  redditURL.changeQueryParam("sr_detail", "true");
  redditURL.changeQueryParam("limit", String(options?.limit ?? 10));
  redditURL.changeQueryParam("after", options?.after ?? "");
  redditURL.jsonify();
  const response = await api(redditURL.toString());
  const posts: Post[] = await Promise.all(
    response.data.children.map(
      async (child: any) => await formatPostData(child),
    ),
  );
  return posts;
}
