import { createContext, useCallback, useMemo } from "react";
import { Alert } from "react-native";
import {
  useMMKVBoolean,
  useMMKVObject,
  useMMKVString,
} from "react-native-mmkv";

import { Comment } from "../../api/PostDetail";
import { Post } from "../../api/Posts";
import {
  makeTextFilterMap,
  doesPostPassTextFilterMap,
  doesCommentPassTextFilterMap,
} from "../../utils/filters/TextFiltering";
import { FilterFunction } from "../../utils/useRedditDataState";
import RedditURL from "../../utils/RedditURL";

type HideSeenURLs = Record<string, boolean>;

type HideFilteredSubreddits = Record<string, number | true>;

export const FILTER_SEEN_POSTS_KEY = "filterSeenPosts";
export const FILTER_SEEN_POSTS_DEFAULT = false;

export const HIDE_SEEN_URLS_KEY = "hideSeenURLs";
export const HIDE_SEEN_URLS_DEFAULT = {} as HideSeenURLs;

export const HIDE_FILTERED_SUBREDDITS_KEY = "filteredSubreddits";
export const HIDE_FILTERED_SUBREDDITS_DEFAULT = {} as HideFilteredSubreddits;

const initialValues = {
  filterSeenPosts: FILTER_SEEN_POSTS_DEFAULT,
  hideSeenURLs: HIDE_SEEN_URLS_DEFAULT,
  hideFilteredSubreddits: HIDE_FILTERED_SUBREDDITS_DEFAULT,
  autoMarkAsSeen: false,
  filterText: "",
};

const initialPostSettingsContext = {
  ...initialValues,
  toggleFilterSeenPosts: (_newValue?: boolean) => {},
  toggleFilterSubreddit: (_subreddit: string, _expiresAt?: number | true) => {},
  hideSeenURLs: HIDE_SEEN_URLS_DEFAULT,
  getHideSeenURLStatus: (_url: string) => false as boolean,
  toggleHideSeenURL: (_url: string) => {},
  toggleAutoMarkAsSeen: (_newValue?: boolean) => {},
  setFilterText: (_newValue?: string) => {},
  filterPostsByText: ((posts) => posts) as FilterFunction<Post>,
  filterPostsBySubreddit: ((posts) => posts) as FilterFunction<Post>,
  doesCommentPassTextFilter: (_comment: Comment) => true,
};

export const FiltersContext = createContext(initialPostSettingsContext);

export function FiltersProvider({ children }: React.PropsWithChildren) {
  const [storedFilterSeenPosts, setFilterSeenPosts] = useMMKVBoolean(
    FILTER_SEEN_POSTS_KEY,
  );
  const filterSeenPosts =
    storedFilterSeenPosts ?? initialValues.filterSeenPosts;

  const [storedHideSeenURLs, setHideSeenURLs] =
    useMMKVObject<HideSeenURLs>(HIDE_SEEN_URLS_KEY);
  const hideSeenURLs = storedHideSeenURLs ?? HIDE_SEEN_URLS_DEFAULT;

  const [storedHideFilteredSubreddits, setHideFilteredSubreddits] =
    useMMKVObject<HideFilteredSubreddits>(HIDE_FILTERED_SUBREDDITS_KEY);
  const hideFilteredSubreddits =
    storedHideFilteredSubreddits ?? initialValues.hideFilteredSubreddits;

  const [storedAutoMarkAsSeen, setAutoMarkAsSeen] =
    useMMKVBoolean("autoMarkAsSeen");
  const autoMarkAsSeen = storedAutoMarkAsSeen ?? initialValues.autoMarkAsSeen;

  const [storedFilterText, setFilterText] = useMMKVString("filterText");
  const filterText = storedFilterText ?? initialValues.filterText;

  const textFilterMap = useMemo(
    () => makeTextFilterMap(filterText),
    [filterText],
  );

  const filterPostsByText: FilterFunction<Post> = useCallback(
    (posts) =>
      posts.filter((post) => doesPostPassTextFilterMap(textFilterMap, post)),
    [textFilterMap],
  );

  const doesCommentPassTextFilter = useCallback(
    (comment: Comment) => doesCommentPassTextFilterMap(textFilterMap, comment),
    [textFilterMap],
  );

  const filterPostsBySubreddit: FilterFunction<Post> = useCallback(
    (posts) => {
      const now = Date.now();
      return posts.filter((post) => {
        const filterValue = hideFilteredSubreddits[post.subreddit];
        if (!filterValue) return true;
        if (filterValue === true) return false;
        return now >= filterValue;
      });
    },
    [hideFilteredSubreddits],
  );

  const toggleFilterSeenPosts = useCallback(
    (newValue = !filterSeenPosts) => setFilterSeenPosts(newValue),
    [filterSeenPosts, setFilterSeenPosts],
  );

  const getHideSeenURLStatus = useCallback(
    (url: string) => {
      const baseURL = new RedditURL(url).getBasePage();
      return hideSeenURLs[baseURL] ?? filterSeenPosts;
    },
    [hideSeenURLs, filterSeenPosts],
  );

  const toggleHideSeenURL = useCallback(
    (url: string) => {
      const baseURL = new RedditURL(url).getBasePage();
      const newSetting = !(hideSeenURLs[baseURL] ?? filterSeenPosts);
      if (newSetting === filterSeenPosts) {
        delete hideSeenURLs[baseURL];
      } else {
        hideSeenURLs[baseURL] = newSetting;
      }
      setHideSeenURLs(hideSeenURLs);
    },
    [hideSeenURLs, filterSeenPosts, setHideSeenURLs],
  );

  const toggleFilterSubreddit = useCallback(
    (subreddit: string, expiresAt?: number | true) => {
      const newFilteredSubreddits = { ...hideFilteredSubreddits };
      if (expiresAt === undefined) {
        delete newFilteredSubreddits[subreddit];
      } else {
        newFilteredSubreddits[subreddit] = expiresAt;
      }
      setHideFilteredSubreddits(newFilteredSubreddits);
    },
    [hideFilteredSubreddits, setHideFilteredSubreddits],
  );

  const toggleAutoMarkAsSeen = useCallback(
    (newValue = !autoMarkAsSeen) => {
      Alert.alert(
        "Restart the app for this change to take effect.",
        newValue && filterSeenPosts
          ? "You may notice slower loads with this setting enabled because all the hidden posts still have to be loaded in the background."
          : undefined,
      );
      setAutoMarkAsSeen(newValue);
    },
    [autoMarkAsSeen, filterSeenPosts, setAutoMarkAsSeen],
  );

  const setFilterTextValue = useCallback(
    (newValue = "") => setFilterText(newValue),
    [setFilterText],
  );

  const value = useMemo(
    () => ({
      filterSeenPosts,
      toggleFilterSeenPosts,

      hideSeenURLs,
      getHideSeenURLStatus,
      toggleHideSeenURL,

      hideFilteredSubreddits,
      toggleFilterSubreddit,
      filterPostsBySubreddit,

      autoMarkAsSeen,
      toggleAutoMarkAsSeen,

      filterText,
      setFilterText: setFilterTextValue,

      filterPostsByText,
      doesCommentPassTextFilter,
    }),
    [
      filterSeenPosts,
      toggleFilterSeenPosts,
      hideSeenURLs,
      getHideSeenURLStatus,
      toggleHideSeenURL,
      hideFilteredSubreddits,
      toggleFilterSubreddit,
      filterPostsBySubreddit,
      autoMarkAsSeen,
      toggleAutoMarkAsSeen,
      filterText,
      setFilterTextValue,
      filterPostsByText,
      doesCommentPassTextFilter,
    ],
  );

  return (
    <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>
  );
}
