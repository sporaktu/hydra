import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { HeaderHeightContext } from "@react-navigation/elements";
import { useIsFocused } from "@react-navigation/native";
import { FlashList, FlashListProps, ViewToken } from "@shopify/flash-list";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  ActivityIndicator,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { RedditDataObject } from "../../api/RedditApi";
import { FeedVideoFocusContext } from "../../contexts/FeedVideoFocusContext";
import {
  ScrollerContext,
  ScrollerProvider,
} from "../../contexts/ScrollerContext";
import { ThemeContext } from "../../contexts/SettingsContexts/ThemeContext";
import { TabScrollContext } from "../../contexts/TabScrollContext";
import { modifyStat, Stat } from "../../db/functions/Stats";
import {
  FeedViewport,
  getFocusedVideo,
  measureVideoRects,
  pickCenterMostEligibleVideo,
  setFocusedVideo,
} from "../../utils/FeedVideoFocus";
import { hapticAction } from "../../utils/haptics";
import ThemedRefreshControl from "./ThemedRefreshControl";

/**
 * Future note for when I'm an idiot and the scroller gets all glitchy again.
 * None of the components rendered by the scroller should create a new state
 * from the data passed into them. For example, adding something like this to
 * the PostComponent would cause the scroller to glitch. Let the parent that
 * wraps the scroller handle data modifications. State changes can be issued
 * to the parent.
 *
 * const [post, setPost] = useState(initialPostState); // BAD
 *
 * Also, elements rendered by the scroller should not change their height or
 * everything gets fucked.
 */

type OverridableFlashListProps<T> = Omit<
  FlashListProps<T>,
  "data" | "getItem" | "getItemCount"
>;

type RedditDataScrollerProps<T> = OverridableFlashListProps<T> & {
  scrollViewRef?: React.RefObject<typeof FlashList<T>>;
  showInitialLoader?: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  data: T[];
  fullyLoaded: boolean;
  hitFilterLimit: boolean;
  loadFailed?: boolean;
};

function RedditDataScroller<T extends RedditDataObject>(
  props: RedditDataScrollerProps<T>,
) {
  const { theme } = useContext(ThemeContext);
  const { scrollDisabled } = useContext(ScrollerContext);
  const { handleScrollForTabBar } = useContext(TabScrollContext);

  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(
    props.showInitialLoader ?? true,
  );

  const lastScrollPosition = useRef(0);

  // ---- Focused Post tracking (docs/adr/0003-focused-only-playback.md) ----
  // A video only autoplays once it is fully on screen — clear of the viewport
  // edges by AUTOPLAY_VIEWPORT_BUFFER — and scrolling has settled (a short
  // debounce after the last scroll/viewability event). Of the videos that
  // qualify, the center-most becomes the Focused Post. During a fast fling
  // events arrive faster than the debounce, so nothing is Focused and nothing
  // plays. Losing viewability clears focus immediately so a video (and its
  // audio) never keeps playing after it leaves the screen.
  const FOCUS_SETTLE_MS = 150;
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommittedFocusKey = useRef<string | null>(null);
  // Deciding focus measures views asynchronously, so a decision that a newer
  // one has superseded (the user kept scrolling) must be dropped, not applied.
  const focusDecisionId = useRef(0);

  // The viewport videos are judged against: the window minus the navigation
  // header and the tab bar, since the feed scrolls underneath both and a video
  // behind them is not on screen as far as the user is concerned. Window
  // coordinates, to match what the cells' measureInWindow reports.
  const { height: windowHeight } = useWindowDimensions();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const viewport = useRef<FeedViewport>({ top: 0, height: 0 });
  viewport.current = {
    top: headerHeight,
    height: Math.max(0, windowHeight - headerHeight - tabBarHeight),
  };

  const ownsFocus = () =>
    lastCommittedFocusKey.current !== null &&
    getFocusedVideo() === lastCommittedFocusKey.current;

  const commitFocus = (key: string | null) => {
    lastCommittedFocusKey.current = key;
    setFocusedVideo(key);
  };

  // Drops both the pending settle timer and any focus decision still waiting
  // on measurements.
  const cancelPendingFocus = () => {
    focusDecisionId.current++;
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  };

  // Snapshot of the latest viewable items so focus can be re-evaluated
  // without a scroll event (e.g. returning to this screen after a blur).
  const lastViewableItems = useRef<ViewToken<T>[]>([]);

  const viewableVideoKeys = (viewableItems: ViewToken<T>[]) => {
    const keys: string[] = [];
    viewableItems.forEach((token) => {
      if (!token.isViewable || token.index === null) return;
      const item = token.item as RedditDataObject & {
        videos?: { source: string }[];
      };
      const videoKey = item.videos?.[0]?.source;
      if (videoKey) keys.push(videoKey);
    });
    return keys;
  };

  const decideFocus = async () => {
    cancelPendingFocus();
    const decisionId = focusDecisionId.current;
    const keys = viewableVideoKeys(lastViewableItems.current);
    const rects = keys.length ? await measureVideoRects(keys) : [];
    if (decisionId !== focusDecisionId.current) return;
    commitFocus(pickCenterMostEligibleVideo(rects, viewport.current));
  };

  const scheduleFocusDecision = () => {
    cancelPendingFocus();
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      decideFocus();
    }, FOCUS_SETTLE_MS);
  };

  const handleViewableVideosChanged = (viewableItems: ViewToken<T>[]) => {
    lastViewableItems.current = viewableItems;
    // The focused video left the screen: release focus right away instead of
    // letting it play on until scrolling settles.
    const focusedKey = getFocusedVideo();
    if (
      focusedKey &&
      ownsFocus() &&
      !viewableVideoKeys(viewableItems).includes(focusedKey)
    ) {
      cancelPendingFocus();
      commitFocus(null);
    }
    scheduleFocusDecision();
  };

  // Release focus (stopping playback/audio) when this feed's screen blurs or
  // unmounts — otherwise a focused video would keep playing underneath the
  // next screen.
  const isScreenFocused = useIsFocused();
  useEffect(() => {
    if (isScreenFocused) {
      // Returning to this screen: no scroll event will fire, so re-decide from
      // the last viewability snapshot to restore the Focused Post.
      decideFocus();
      return;
    }
    cancelPendingFocus();
    if (ownsFocus()) {
      commitFocus(null);
    }
  }, [isScreenFocused]);
  useEffect(() => {
    return () => {
      cancelPendingFocus();
      if (ownsFocus()) {
        setFocusedVideo(null);
      }
    };
  }, []);

  const onViewableItemsChanged = useCallback(
    (info: { viewableItems: ViewToken<T>[]; changed: ViewToken<T>[] }) => {
      props.onViewableItemsChanged?.(info);
      handleViewableVideosChanged(info.viewableItems);
    },

    [props.onViewableItemsChanged],
  );

  // Scroll distance is accumulated in a ref during scrolling and flushed to
  // SQLite only when scrolling comes to rest (or on unmount), so no DB I/O is
  // initiated while a scroll gesture is active.
  const unflushedScrollDistance = useRef(0);
  const flushScrollDistance = () => {
    if (unflushedScrollDistance.current > 0) {
      modifyStat(Stat.SCROLL_DISTANCE, unflushedScrollDistance.current);
      unflushedScrollDistance.current = 0;
    }
  };
  useEffect(() => {
    return flushScrollDistance;
  }, []);

  const loadMoreData = async (refresh = false) => {
    if (props.fullyLoaded && !refresh) {
      // Nothing left to load, but the initial loader may still be showing
      // (this fires on mount for a feed that came back empty).
      setIsLoadingMore(false);
      return;
    }
    setIsLoadingMore(true);
    try {
      if (refresh) {
        await props.refresh();
      } else {
        await props.loadMore();
      }
    } finally {
      // A load that throws still has to put the spinner down, or the page
      // spins forever with nothing on it.
      if (refresh) setRefreshing(false);
      setIsLoadingMore(false);
    }
  };

  // The initial loader is on from the first render, before this component
  // does any loading of its own, so the owner of the data is the one that has
  // to end it: either everything there is has arrived, or nothing will.
  useEffect(() => {
    if (props.fullyLoaded || props.loadFailed) {
      setIsLoadingMore(false);
    }
  }, [props.fullyLoaded, props.loadFailed]);

  return (
    <FlashList<T>
      {...props}
      scrollEnabled={!scrollDisabled}
      indicatorStyle={theme.systemModeStyle === "dark" ? "white" : "black"}
      refreshControl={
        <ThemedRefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            hapticAction();
            setRefreshing(true);
            loadMoreData(true);
          }}
        />
      }
      scrollEventThrottle={100}
      onScroll={(e) => {
        handleScrollForTabBar(e);
        const scrollPosition = e.nativeEvent.contentOffset.y;
        unflushedScrollDistance.current += Math.abs(
          scrollPosition - lastScrollPosition.current,
        );
        lastScrollPosition.current = scrollPosition;
        // Where a video sits on screen changes with every scroll event, not
        // just when viewability flips, so scrolling itself defers the decision
        // (and re-runs it once the feed comes to rest under the user's finger).
        scheduleFocusDecision();
      }}
      onViewableItemsChanged={onViewableItemsChanged}
      onScrollEndDrag={(e) => {
        props.onScrollEndDrag?.(e);
        flushScrollDistance();
      }}
      onMomentumScrollEnd={(e) => {
        props.onMomentumScrollEnd?.(e);
        flushScrollDistance();
        // Scrolling has definitively settled — pick the Focused Post now
        // instead of waiting out the debounce.
        decideFocus();
      }}
      onEndReachedThreshold={2}
      onEndReached={() => {
        loadMoreData();
      }}
      data={props.data}
      keyExtractor={(item) => `${item.type}-${item.id}`}
      ListFooterComponent={
        <View style={styles.endOfListContainer}>
          {isLoadingMore && <ActivityIndicator size="small" />}
          {!isLoadingMore && props.fullyLoaded && !!props.data.length && (
            <Text
              style={[
                styles.endOfListText,
                {
                  color: theme.text,
                },
              ]}
            >
              {`Wow. You've reached the bottom.`}
            </Text>
          )}
          {!isLoadingMore && props.loadFailed && (
            <Text
              style={[
                styles.endOfListText,
                {
                  color: theme.text,
                },
              ]}
            >
              Something went wrong loading this. Pull down to try again.
            </Text>
          )}
          {!isLoadingMore && props.hitFilterLimit && (
            <Text
              style={[
                styles.endOfListText,
                {
                  color: theme.text,
                },
              ]}
            >
              The filter limit has been reached. Your filters may be too strict
              to show anything.
            </Text>
          )}
        </View>
      }
    />
  );
}

export default function WrappedScroller<T extends RedditDataObject>(
  props: RedditDataScrollerProps<T>,
) {
  return (
    <ScrollerProvider>
      <FeedVideoFocusContext.Provider value={true}>
        <RedditDataScroller<T> {...props} />
      </FeedVideoFocusContext.Provider>
    </ScrollerProvider>
  );
}

const styles = StyleSheet.create({
  endOfListContainer: {
    alignItems: "center",
    justifyContent: "center",
    height: 75,
  },
  endOfListText: {
    fontSize: 14,
    marginHorizontal: 10,
  },
});
