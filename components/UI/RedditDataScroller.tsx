import { useIsFocused } from "@react-navigation/native";
import { FlashList, FlashListProps, ViewToken } from "@shopify/flash-list";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { StyleSheet, ActivityIndicator, Text, View } from "react-native";

import { RedditDataObject } from "../../api/RedditApi";
import { FeedVideoFocusContext } from "../../contexts/FeedVideoFocusContext";
import { MediaViewerContext } from "../../contexts/MediaViewerContext";
import {
  ScrollerContext,
  ScrollerProvider,
} from "../../contexts/ScrollerContext";
import { ThemeContext } from "../../contexts/SettingsContexts/ThemeContext";
import { TabScrollContext } from "../../contexts/TabScrollContext";
import { modifyStat, Stat } from "../../db/functions/Stats";
import {
  decideFeedVideoFocus,
  FOCUS_ITEM_VISIBLE_PERCENT,
  FOCUS_VIEWPORT_COVERAGE_PERCENT,
  getFocusedVideo,
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
  const { subscribeToVisibility } = useContext(MediaViewerContext);

  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(
    props.showInitialLoader ?? true,
  );

  const lastScrollPosition = useRef(0);

  // ---- Focused Post tracking (docs/adr/0003-focused-only-playback.md) ----
  // The center-most MOSTLY VISIBLE video becomes the Focused Post once
  // scrolling settles (a short debounce after the last viewability change).
  // During a fast fling candidates churn faster than the debounce, so nothing
  // is Focused and nothing plays. Leaving the screen entirely clears focus
  // immediately so a video (and its audio) never keeps playing off screen.
  //
  // "Mostly visible" comes from two extra viewability configs (see
  // FeedVideoFocus for the thresholds): one for "most of the post is on
  // screen" and one for "the post fills most of the screen" (a post taller
  // than the viewport can only satisfy the latter). The list's default
  // config, which counts any visible pixel, still feeds the caller's own
  // onViewableItemsChanged and tells us when a video has fully left.
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

  // Snapshots of the latest viewable items per config, so focus can be
  // re-evaluated whenever any of them changes, and without a scroll event
  // (e.g. returning to this screen after a blur).
  const anyVisibleItems = useRef<ViewToken<T>[]>([]);
  const mostlyVisibleItems = useRef<ViewToken<T>[]>([]);
  const fillingViewportItems = useRef<ViewToken<T>[]>([]);

  // While the fullscreen viewer is open it owns playback, so the Focused Post
  // is frozen: the feed underneath still re-lays out (rotating the device
  // changes every post's height and the viewport's), and acting on those
  // viewability changes moved focus to whichever video was now center-most,
  // which then started playing — audibly, with feed audio on — under the
  // video the user was actually watching. Snapshots keep updating; only the
  // decision waits until the viewer closes.
  const isViewerShowing = useRef(false);

  // Only touches refs and module state, so it is safe to capture once in the
  // viewability pairs below.
  const evaluateVideoFocus = useCallback(
    ({ keepVisibleFocus = false }: { keepVisibleFocus?: boolean } = {}) => {
      if (isViewerShowing.current) return;
      const decision = decideFeedVideoFocus({
        mostlyVisible: [
          ...mostlyVisibleItems.current,
          ...fillingViewportItems.current,
        ],
        anyVisible: anyVisibleItems.current,
        focusedKey: getFocusedVideo(),
        ownsFocus: ownsFocus(),
        keepVisibleFocus,
      });

      if (decision.releaseNow) {
        commitFocus(null);
      }

      if (decision.pending === undefined) {
        pendingFocusKey.current = null;
        if (focusCommitTimer.current) {
          clearTimeout(focusCommitTimer.current);
          focusCommitTimer.current = null;
        }
        return;
      }
      pendingFocusKey.current = decision.pending;
      if (focusCommitTimer.current) clearTimeout(focusCommitTimer.current);
      focusCommitTimer.current = setTimeout(() => {
        focusCommitTimer.current = null;
        commitFocus(pendingFocusKey.current);
      }, FOCUS_SETTLE_MS);
    },
    [],
  );

  useEffect(
    () =>
      subscribeToVisibility((isShowing) => {
        if (isShowing === isViewerShowing.current) return;
        isViewerShowing.current = isShowing;
        if (isShowing) {
          // A focus change still settling must not land under the viewer.
          pendingFocusKey.current = null;
          if (focusCommitTimer.current) {
            clearTimeout(focusCommitTimer.current);
            focusCommitTimer.current = null;
          }
          return;
        }
        // Catch up on what changed underneath the viewer. The snapshots may be
        // mid-flight (closing re-locks to portrait, and that relayout is still
        // to come), so a Focused Post that is still on screen keeps focus
        // rather than briefly handing it to whatever is central right now.
        evaluateVideoFocus({ keepVisibleFocus: true });
      }),
    [subscribeToVisibility],
  );

  // FlashList builds its viewability helpers once from this prop, so keep the
  // array (and the configs inside it) stable for the life of the list.
  const focusViewabilityPairs = useRef<
    NonNullable<FlashListProps<T>["viewabilityConfigCallbackPairs"]>
  >([
    {
      viewabilityConfig: {
        itemVisiblePercentThreshold: FOCUS_ITEM_VISIBLE_PERCENT,
      },
      onViewableItemsChanged: ({ viewableItems }) => {
        mostlyVisibleItems.current = viewableItems;
        evaluateVideoFocus();
      },
    },
    {
      viewabilityConfig: {
        viewAreaCoveragePercentThreshold: FOCUS_VIEWPORT_COVERAGE_PERCENT,
      },
      onViewableItemsChanged: ({ viewableItems }) => {
        fillingViewportItems.current = viewableItems;
        evaluateVideoFocus();
      },
    },
  ]);

  // Release focus (stopping playback/audio) when this feed's screen blurs or
  // unmounts — otherwise a focused video would keep playing underneath the
  // next screen.
  const isScreenFocused = useIsFocused();
  useEffect(() => {
    if (isScreenFocused) {
      // Returning to this screen: no scroll event will fire, so replay the
      // last viewability snapshots to restore the Focused Post.
      evaluateVideoFocus();
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
      anyVisibleItems.current = info.viewableItems;
      evaluateVideoFocus();
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
      }}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfigCallbackPairs={focusViewabilityPairs.current}
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
