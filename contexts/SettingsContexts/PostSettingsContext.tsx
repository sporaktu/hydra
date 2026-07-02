import { createContext, useCallback, useMemo } from "react";
import { useMMKVBoolean, useMMKVNumber } from "react-native-mmkv";
import { deviceSupportsSplitView } from "../../utils/useSplitViewSupport";

const initialValues = {
  postCompactMode: deviceSupportsSplitView,
  showThumbnailsOnRightSide: false,
  subredditAtTop: false,
  showSubredditIcon: true,
  postTitleLength: 2,
  postTextLength: 3,
  linkDescriptionLength: 10,
  showPostFlair: true,
  blurSpoilers: true,
  blurNSFW: true,
  showPostSummary: true,
  autoPlayVideos: true,
  liveTextInteraction: false,
  tapToCollapsePost: true,
};

const initialPostSettingsContext = {
  ...initialValues,
  togglePostCompactMode: (_newValue?: boolean) => {},
  toggleShowThumbnailsOnRightSide: (_newValue?: boolean) => {},
  toggleSubredditAtTop: (_newValue?: boolean) => {},
  toggleSubredditIcon: (_newValue?: boolean) => {},
  changePostTitleLength: (_newValue: number) => {},
  changePostTextLength: (_newValue: number) => {},
  changeLinkDescriptionLength: (_newValue: number) => {},
  toggleShowPostFlair: (_newValue?: boolean) => {},
  toggleBlurSpoilers: (_newValue?: boolean) => {},
  toggleBlurNSFW: (_newValue?: boolean) => {},
  toggleShowPostSummary: (_newValue?: boolean) => {},
  toggleAutoPlayVideos: (_newValue?: boolean) => {},
  toggleLiveTextInteraction: (_newValue?: boolean) => {},
  toggleTapToCollapsePost: (_newValue?: boolean) => {},
};

export const PostSettingsContext = createContext(initialPostSettingsContext);

export function PostSettingsProvider({ children }: React.PropsWithChildren) {
  const [storedPostCompactMode, setPostCompactMode] =
    useMMKVBoolean("postCompactMode");
  const postCompactMode =
    storedPostCompactMode ?? initialValues.postCompactMode;

  const [storedShowThumbnailsOnRightSide, setShowThumbnailsOnRightSide] =
    useMMKVBoolean("showThumbnailsOnRightSide");
  const showThumbnailsOnRightSide =
    storedShowThumbnailsOnRightSide ?? initialValues.showThumbnailsOnRightSide;

  const [storedSubredditAtTop, setSubredditAtTop] =
    useMMKVBoolean("subredditAtTop");
  const subredditAtTop = storedSubredditAtTop ?? initialValues.subredditAtTop;

  const [storedShowSubredditIcon, setShowSubredditIcon] =
    useMMKVBoolean("showSubredditIcon");
  const showSubredditIcon =
    storedShowSubredditIcon ?? initialValues.showSubredditIcon;

  const [storedPostTitleLength, setPostTitleLength] =
    useMMKVNumber("postTitleLength");
  const postTitleLength =
    storedPostTitleLength ?? initialValues.postTitleLength;

  const [storedPostTextLength, setPostTextLength] =
    useMMKVNumber("postTextLength");
  const postTextLength = storedPostTextLength ?? initialValues.postTextLength;

  const [storedLinkDescriptionLength, setLinkDescriptionLength] = useMMKVNumber(
    "linkDescriptionLength",
  );
  const linkDescriptionLength =
    storedLinkDescriptionLength ?? initialValues.linkDescriptionLength;

  const [storedShowPostFlair, setShowPostFlair] =
    useMMKVBoolean("showPostFlair");
  const showPostFlair = storedShowPostFlair ?? initialValues.showPostFlair;

  const [storedBlurSpoilers, setBlurSpoilers] = useMMKVBoolean("blurSpoilers");
  const blurSpoilers = storedBlurSpoilers ?? initialValues.blurSpoilers;

  const [storedBlurNSFW, setBlurNSFW] = useMMKVBoolean("blurNSFW");
  const blurNSFW = storedBlurNSFW ?? initialValues.blurNSFW;

  const [storedShowPostSummary, setShowPostSummary] =
    useMMKVBoolean("showPostSummary");
  const showPostSummary =
    storedShowPostSummary ?? initialValues.showPostSummary;

  const [storedAutoPlayVideos, setAutoPlayVideos] =
    useMMKVBoolean("autoPlayVideos");
  const autoPlayVideos = storedAutoPlayVideos ?? initialValues.autoPlayVideos;

  const [storedliveTextInteraction, setliveTextInteraction] = useMMKVBoolean(
    "liveTextInteraction",
  );
  const liveTextInteraction =
    storedliveTextInteraction ?? initialValues.liveTextInteraction;

  const [storedTapToCollapsePost, setTapToCollapsePost] =
    useMMKVBoolean("tapToCollapsePost");
  const tapToCollapsePost =
    storedTapToCollapsePost ?? initialValues.tapToCollapsePost;

  const togglePostCompactMode = useCallback(
    (newValue = !postCompactMode) => setPostCompactMode(newValue),
    [postCompactMode, setPostCompactMode],
  );

  const toggleShowThumbnailsOnRightSide = useCallback(
    (newValue = !showThumbnailsOnRightSide) =>
      setShowThumbnailsOnRightSide(newValue),
    [showThumbnailsOnRightSide, setShowThumbnailsOnRightSide],
  );

  const toggleSubredditAtTop = useCallback(
    (newValue = !subredditAtTop) => setSubredditAtTop(newValue),
    [subredditAtTop, setSubredditAtTop],
  );

  const toggleSubredditIcon = useCallback(
    (newValue = !showSubredditIcon) => setShowSubredditIcon(newValue),
    [showSubredditIcon, setShowSubredditIcon],
  );

  const changePostTitleLength = useCallback(
    (newValue: number) => setPostTitleLength(newValue),
    [setPostTitleLength],
  );

  const changePostTextLength = useCallback(
    (newValue: number) => setPostTextLength(newValue),
    [setPostTextLength],
  );

  const changeLinkDescriptionLength = useCallback(
    (newValue: number) => setLinkDescriptionLength(newValue),
    [setLinkDescriptionLength],
  );

  const toggleShowPostFlair = useCallback(
    (newValue = !showPostFlair) => setShowPostFlair(newValue),
    [showPostFlair, setShowPostFlair],
  );

  const toggleBlurSpoilers = useCallback(
    (newValue = !blurSpoilers) => setBlurSpoilers(newValue),
    [blurSpoilers, setBlurSpoilers],
  );

  const toggleBlurNSFW = useCallback(
    (newValue = !blurNSFW) => setBlurNSFW(newValue),
    [blurNSFW, setBlurNSFW],
  );

  const toggleShowPostSummary = useCallback(
    (newValue = !showPostSummary) => setShowPostSummary(newValue),
    [showPostSummary, setShowPostSummary],
  );

  const toggleAutoPlayVideos = useCallback(
    (newValue = !autoPlayVideos) => setAutoPlayVideos(newValue),
    [autoPlayVideos, setAutoPlayVideos],
  );

  const toggleLiveTextInteraction = useCallback(
    (newValue = !liveTextInteraction) => setliveTextInteraction(newValue),
    [liveTextInteraction, setliveTextInteraction],
  );

  const toggleTapToCollapsePost = useCallback(
    (newValue = !tapToCollapsePost) => setTapToCollapsePost(newValue),
    [tapToCollapsePost, setTapToCollapsePost],
  );

  const value = useMemo(
    () => ({
      postCompactMode: postCompactMode ?? initialValues.postCompactMode,
      togglePostCompactMode,

      showThumbnailsOnRightSide:
        showThumbnailsOnRightSide ?? initialValues.showThumbnailsOnRightSide,
      toggleShowThumbnailsOnRightSide,

      subredditAtTop: subredditAtTop ?? initialValues.subredditAtTop,
      toggleSubredditAtTop,

      showSubredditIcon: showSubredditIcon ?? initialValues.showSubredditIcon,
      toggleSubredditIcon,

      postTitleLength: postTitleLength ?? initialValues.postTitleLength,
      changePostTitleLength,

      postTextLength: postTextLength ?? initialValues.postTextLength,
      changePostTextLength,

      linkDescriptionLength:
        linkDescriptionLength ?? initialValues.linkDescriptionLength,
      changeLinkDescriptionLength,

      showPostFlair: showPostFlair ?? initialValues.showPostFlair,
      toggleShowPostFlair,

      blurSpoilers: blurSpoilers ?? initialValues.blurSpoilers,
      toggleBlurSpoilers,

      blurNSFW: blurNSFW ?? initialValues.blurNSFW,
      toggleBlurNSFW,

      showPostSummary: showPostSummary ?? initialValues.showPostSummary,
      toggleShowPostSummary,

      autoPlayVideos: autoPlayVideos ?? initialValues.autoPlayVideos,
      toggleAutoPlayVideos,

      liveTextInteraction:
        liveTextInteraction ?? initialValues.liveTextInteraction,
      toggleLiveTextInteraction,

      tapToCollapsePost: tapToCollapsePost ?? initialValues.tapToCollapsePost,
      toggleTapToCollapsePost,
    }),
    [
      postCompactMode,
      togglePostCompactMode,
      showThumbnailsOnRightSide,
      toggleShowThumbnailsOnRightSide,
      subredditAtTop,
      toggleSubredditAtTop,
      showSubredditIcon,
      toggleSubredditIcon,
      postTitleLength,
      changePostTitleLength,
      postTextLength,
      changePostTextLength,
      linkDescriptionLength,
      changeLinkDescriptionLength,
      showPostFlair,
      toggleShowPostFlair,
      blurSpoilers,
      toggleBlurSpoilers,
      blurNSFW,
      toggleBlurNSFW,
      showPostSummary,
      toggleShowPostSummary,
      autoPlayVideos,
      toggleAutoPlayVideos,
      liveTextInteraction,
      toggleLiveTextInteraction,
      tapToCollapsePost,
      toggleTapToCollapsePost,
    ],
  );

  return (
    <PostSettingsContext.Provider value={value}>
      {children}
    </PostSettingsContext.Provider>
  );
}
