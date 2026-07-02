import { useIsFocused } from "@react-navigation/native";
import { FlashList, FlashListProps, ViewToken } from "@shopify/flash-list";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { StyleSheet, ActivityIndicator, Text, View } from "react-native";

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
  getFocusedVideo,
  pickCenterMostVideo,
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
  // The center-most viewable video becomes the Focused Post once scrolling
  // settles (a short debounce after the last viewability change). During a
  // fast fling candidates churn faster than the debounce, so nothing is
  // Focused and nothing plays. Losing viewability clears focus immediately so
  // a video (and its audio) never keeps playing after it leaves the screen.
  const FOCUS_SETTLE_MS = 150;
  const focusCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFocusKey = useRef<string | null>(null);
  const lastCommittedFocusKey = useRef<string | null>(null);

  const ownsFocus = () =>
    lastCommittedFocusKey.current !== null &&
    getFocusedVideo() === lastCommittedFocusKey.current;

  const commitFocus = (key: string | null) => {
    if (focusCommitTimer.current) {
      clearTimeout(focusCommitTimer.current);
      focusCommitTimer.current = null;
    }
    lastCommittedFocusKey.current = key;
    setFocusedVideo(key);
  };

  // Snapshot of the latest viewable items so focus can be re-evaluated
  // without a scroll event (e.g. returning to this screen after a blur).
  const lastViewableItems = useRef<ViewToken<T>[]>([]);

  const handleViewableVideosChanged = (viewableItems: ViewToken<T>[]) => {
    lastViewableItems.current = viewableItems;
    const viewableIndices: number[] = [];
    const videoIndices: { index: number; key: string }[] = [];
    viewableItems.forEach((token) => {
      if (!token.isViewable || token.index === null) return;
      viewableIndices.push(token.index);
      const item = token.item as RedditDataObject & {
        videos?: { source: string }[];
      };
      const videoKey = item.videos?.[0]?.source;
      if (videoKey) {
        videoIndices.push({ index: token.index, key: videoKey });
      }
    });
    const candidate = pickCenterMostVideo(viewableIndices, videoIndices);

    // The focused video left the screen: release focus right away.
    if (ownsFocus() && !videoIndices.some((v) => v.key === getFocusedVideo())) {
      commitFocus(null);
    }

    if (candidate === getFocusedVideo()) {
      pendingFocusKey.current = null;
      if (focusCommitTimer.current) {
        clearTimeout(focusCommitTimer.current);
        focusCommitTimer.current = null;
      }
      return;
    }
    pendingFocusKey.current = candidate;
    if (focusCommitTimer.current) clearTimeout(focusCommitTimer.current);
    focusCommitTimer.current = setTimeout(() => {
      focusCommitTimer.current = null;
      commitFocus(pendingFocusKey.current);
    }, FOCUS_SETTLE_MS);
  };

  // Release focus (stopping playback/audio) when this feed's screen blurs or
  // unmounts — otherwise a focused video would keep playing underneath the
  // next screen.
  const isScreenFocused = useIsFocused();
  useEffect(() => {
    if (isScreenFocused) {
      // Returning to this screen: no scroll event will fire, so replay the
      // last viewability snapshot to restore the Focused Post.
      handleViewableVideosChanged(lastViewableItems.current);
      return;
    }
    if (ownsFocus()) {
      commitFocus(null);
    }
  }, [isScreenFocused]);
  useEffect(() => {
    return () => {
      if (focusCommitTimer.current) clearTimeout(focusCommitTimer.current);
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
    if (props.fullyLoaded && !refresh) return;
    setIsLoadingMore(true);
    if (refresh) {
      await props.refresh();
      setRefreshing(false);
    } else {
      await props.loadMore();
    }
    setIsLoadingMore(false);
  };

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
      }}
      onViewableItemsChanged={onViewableItemsChanged}
      onScrollEndDrag={(e) => {
        props.onScrollEndDrag?.(e);
        flushScrollDistance();
      }}
      onMomentumScrollEnd={(e) => {
        props.onMomentumScrollEnd?.(e);
        flushScrollDistance();
        // Scrolling has definitively settled — commit the pending Focused
        // Post immediately instead of waiting out the debounce.
        if (focusCommitTimer.current) {
          clearTimeout(focusCommitTimer.current);
          focusCommitTimer.current = null;
          commitFocus(pendingFocusKey.current);
        }
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
