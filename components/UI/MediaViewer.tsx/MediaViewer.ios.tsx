import { FontAwesome6 } from "@expo/vector-icons";
import { FlashList, FlashListRef } from "@shopify/flash-list";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Animated,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Reanimated, {
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { runOnJS } from "react-native-worklets";
import {
  useSafeAreaInsets,
  useSafeAreaFrame,
} from "react-native-safe-area-context";
import MediaVideo, { VideoItem } from "./MediaVideo";
import { ImageItem, MediaImage } from "./MediaImage";
import * as ExpoOrientation from "expo-screen-orientation";
import PostOverlay from "./PostOverlay";
import { Post } from "../../../api/Posts";
import { PostDetail } from "../../../api/PostDetail";

type MediaItem = ImageItem | VideoItem;

type MediaItemRow = MediaItem[];

export type MediaItemCollection = MediaItemRow[];

// Reanimated wrapper so `onScroll` runs on the UI thread via
// `useAnimatedScrollHandler`. Casting back to `typeof FlashList` preserves the
// generic call signature (and the FlashListRef the active row's ref relies on).
const ReanimatedFlashList = Reanimated.createAnimatedComponent(
  FlashList,
) as typeof FlashList;

type MediaViewerProps = {
  media: MediaItemCollection;
  startingRowIndex: number;
  startingColumnIndex: number;
  onFocusedItemChange?: (index: number) => void;
  getCurrentPost?: (rowIndex: number) => Post | PostDetail | null;
  onClose: () => void;
};

export default function MediaViewer({
  media,
  startingRowIndex,
  startingColumnIndex,
  onFocusedItemChange,
  getCurrentPost,
  onClose,
}: MediaViewerProps) {
  const { width, height } = useSafeAreaFrame();
  const {
    top: safeAreaTop,
    bottom: safeAreaBottom,
    left: safeAreaLeft,
    right: safeAreaRight,
  } = useSafeAreaInsets();

  const rowFlashListRef = useRef<FlashListRef<MediaItem>>(null);

  const overlayTapStart = useRef<{
    x: number;
    y: number;
    timestamp: number;
  } | null>(null);

  // Track horizontal scroll position for each row independently
  const rowScrollPositions = useRef<Map<number, number>>(new Map());

  // UI-thread scroll tracking: these drive the background fade + content
  // shrink while overscrolling past an edge, and the flick-away close. They are
  // written from the reanimated scroll handlers (UI thread) and read from
  // `useAnimatedStyle`, so the visual tracking never touches the JS thread.
  const scrolledAwayY = useSharedValue(0);
  const scrolledAwayX = useSharedValue(0);
  const flickedAway = useSharedValue(0);

  const dismissOffset = useDerivedValue(
    () => flickedAway.value + scrolledAwayY.value + scrolledAwayX.value,
  );

  const backgroundStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dismissOffset.value, [-150, -50, 0], [0, 0.85, 1]),
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dismissOffset.value, [-150, -50, 0], [0, 0.85, 1]),
    transform: [
      {
        scale: interpolate(dismissOffset.value, [-150, -50, 0], [0.9, 0.95, 1]),
      },
    ],
  }));

  // Overlay fade stays on the RN Animated API: it is toggled discretely on tap,
  // not tracked per scroll frame, and MediaVideo.ios still consumes it as an
  // Animated.Value.
  const showOverlay = useRef(false);
  const overlayOpacity = useRef(new Animated.Value(0));

  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  const [currentColumnIndex, setCurrentColumnIndex] = useState(0);
  const [isScrollLocked, setIsScrollLocked] = useState(false);

  // Read inside the reanimated scroll handlers' `runOnJS` callbacks, which would
  // otherwise close over stale state.
  const currentRowIndexRef = useRef(0);
  const currentColumnIndexRef = useRef(0);
  currentRowIndexRef.current = currentRowIndex;
  currentColumnIndexRef.current = currentColumnIndex;

  // Last settled page per axis, kept on the UI thread so the handlers only hop
  // to JS when the page actually changes (not every frame).
  const lastRow = useSharedValue(0);

  const tapToScrollColumnIndex = useRef<number>(0);
  const lastTapToScrollTime = useRef<number>(0);

  const orientation = height > width ? "vertical" : "horizontal";
  const deferredOrientation = useDeferredValue(orientation);
  // These track the initial position when opening - used for initialScrollIndex
  // They don't change during scrolling, only when open() is called or orientation changes
  const initialRowIndex = useRef(startingRowIndex);
  const initialColumnIndex = useRef(startingColumnIndex);
  if (orientation !== deferredOrientation) {
    initialRowIndex.current = currentRowIndex;
    initialColumnIndex.current = currentColumnIndex;
  }

  const currentRowSize = media[currentRowIndex]?.length ?? 0;
  const mediaLength = media.length;

  const currentPost = getCurrentPost?.(currentRowIndex);

  const animateClose = () => {
    flickedAway.value = withTiming(-150, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(onClose)();
      }
    });
  };

  const handleRowScroll = (newIndex: number) => {
    if (newIndex !== currentRowIndexRef.current) {
      setCurrentRowIndex(newIndex);
      setCurrentColumnIndex(rowScrollPositions.current.get(newIndex) ?? 0);
    }
  };

  const handleColumnScroll = (postIndex: number, newIndex: number) => {
    rowScrollPositions.current.set(postIndex, newIndex);
    if (
      postIndex === currentRowIndexRef.current &&
      newIndex !== currentColumnIndexRef.current
    ) {
      setCurrentColumnIndex(newIndex);
    }
  };

  const handleTapToScrollRow = (direction: "left" | "right") => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapToScrollTime.current;
    const currentIndex =
      timeSinceLastTap < 300
        ? tapToScrollColumnIndex.current
        : currentColumnIndex;
    lastTapToScrollTime.current = now;
    tapToScrollColumnIndex.current =
      currentIndex + (direction === "left" ? -1 : 1);
    rowFlashListRef.current?.scrollToIndex({
      index: tapToScrollColumnIndex.current,
    });
  };

  const verticalScrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const { contentOffset, contentSize, layoutMeasurement } = event;
        const newIndex = Math.min(
          mediaLength - 1,
          Math.max(0, Math.round(contentOffset.y / height)),
        );
        if (newIndex !== lastRow.value) {
          lastRow.value = newIndex;
          runOnJS(handleRowScroll)(newIndex);
        }
        const maxScrollY = contentSize.height - layoutMeasurement.height;
        const isAtTop = newIndex === 0 && contentOffset.y <= 0;
        const isAtBottom =
          newIndex === mediaLength - 1 && contentOffset.y >= maxScrollY;
        if (isAtTop) {
          scrolledAwayY.value = contentOffset.y;
        } else if (isAtBottom) {
          scrolledAwayY.value = maxScrollY - contentOffset.y;
        } else {
          scrolledAwayY.value = 0;
        }
      },
    },
    [height, mediaLength],
  );

  useEffect(() => {
    if (!onFocusedItemChange) return;
    let trueIndex = 0;
    for (let i = 0; i < currentRowIndex; i++) {
      trueIndex += media[i].length;
    }
    trueIndex += currentColumnIndex;
    onFocusedItemChange?.(trueIndex);
  }, [currentRowIndex, currentColumnIndex]);

  useEffect(() => {
    ExpoOrientation.unlockAsync();
    return () => {
      ExpoOrientation.lockAsync(ExpoOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  return (
    <Modal
      visible={true}
      onRequestClose={() => animateClose()}
      transparent={true}
      supportedOrientations={["portrait", "landscape"]}
    >
      <GestureHandlerRootView style={styles.root}>
        <Reanimated.View style={[styles.background, backgroundStyle]} />
        {currentRowSize > 1 && (
          <Animated.View
            style={[
              styles.rowDetailsContainer,
              {
                bottom: safeAreaBottom + 10,
                right: safeAreaRight + 10,
                opacity: overlayOpacity.current.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0],
                }),
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.rowNavigationButton,
                {
                  opacity: currentColumnIndex === 0 ? 0.5 : 1,
                },
              ]}
              disabled={currentColumnIndex === 0}
              onPress={() => handleTapToScrollRow("left")}
              hitSlop={10}
            >
              <FontAwesome6 name="arrow-left" size={16} color="white" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.rowNavigationButton,
                {
                  opacity: currentColumnIndex === currentRowSize - 1 ? 0.5 : 1,
                },
              ]}
              disabled={currentColumnIndex === currentRowSize - 1}
              onPress={() => handleTapToScrollRow("right")}
              hitSlop={10}
            >
              <FontAwesome6 name="arrow-right" size={16} color="white" />
            </TouchableOpacity>
            <View style={styles.itemIndexContainer}>
              <Text style={styles.itemIndexText}>
                {currentColumnIndex + 1} / {currentRowSize}
              </Text>
            </View>
          </Animated.View>
        )}
        <Reanimated.View
          style={[styles.contentContainer, contentStyle]}
          onTouchStart={(e) =>
            (overlayTapStart.current = {
              x: e.nativeEvent.locationX,
              y: e.nativeEvent.locationY,
              timestamp: Date.now(),
            })
          }
          onTouchEnd={(e) => {
            if (overlayTapStart.current) {
              const { x, y, timestamp } = overlayTapStart.current;
              const { locationX, locationY } = e.nativeEvent;
              if (
                Math.abs(locationX - x) < 10 &&
                Math.abs(locationY - y) < 10 &&
                Date.now() - timestamp < 300
              ) {
                showOverlay.current = !showOverlay.current;
                Animated.timing(overlayOpacity.current, {
                  toValue: showOverlay.current ? 1 : 0,
                  duration: 150,
                  useNativeDriver: true,
                }).start();
              }
            }
          }}
        >
          <Animated.View
            style={[
              styles.overlayContainer,
              {
                paddingTop: safeAreaTop,
                paddingBottom: safeAreaBottom,
                paddingLeft: safeAreaLeft,
                paddingRight: safeAreaRight,
                opacity: overlayOpacity.current,
              },
            ]}
          >
            {currentPost && (
              <PostOverlay
                post={currentPost}
                closeViewer={() => animateClose()}
                columnIndex={currentColumnIndex}
              />
            )}
          </Animated.View>
          <ReanimatedFlashList
            /**
             * Key ensures the outer list reset to the correct index when the orientation
             * changes.
             */
            key={orientation}
            data={media}
            scrollEnabled={!isScrollLocked}
            renderItem={({ item: row, index: postIndex }) => (
              <MediaRow
                key={`${postIndex}-${orientation}`}
                items={row}
                postIndex={postIndex}
                isActiveRow={postIndex === currentRowIndex}
                activeColumnIndex={currentColumnIndex}
                initialColumn={
                  postIndex === initialRowIndex.current
                    ? initialColumnIndex.current
                    : 0
                }
                width={width}
                height={height}
                isScrollLocked={isScrollLocked}
                scrolledAwayX={scrolledAwayX}
                overlayOpacity={overlayOpacity.current}
                rowRef={postIndex === currentRowIndex ? rowFlashListRef : null}
                setIsScrollLocked={setIsScrollLocked}
                onColumnScroll={handleColumnScroll}
                onDismiss={animateClose}
              />
            )}
            /**
             * We have to do this because FlashList has a bug that causes calculations for
             * the initial scroll index to be wrong when the index is larger than the initial
             * batch of media items.
             */
            initialScrollIndex={0}
            initialScrollIndexParams={{
              viewOffset: height * initialRowIndex.current,
            }}
            pagingEnabled={true}
            onScroll={verticalScrollHandler}
            scrollEventThrottle={16}
            onScrollEndDrag={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } =
                event.nativeEvent;
              const bottomLimit = contentSize.height - layoutMeasurement.height;
              const momentumPastTop =
                (event.nativeEvent.velocity?.y ?? 0) < -1 &&
                contentOffset.y < 0;
              const momentumPastBottom =
                (event.nativeEvent.velocity?.y ?? 0) > 1 &&
                contentOffset.y > bottomLimit;
              const pulledPastTop = contentOffset.y < -50;
              const pulledPastBottom = contentOffset.y > 50 + bottomLimit;
              if (
                pulledPastTop ||
                pulledPastBottom ||
                momentumPastTop ||
                momentumPastBottom
              ) {
                animateClose();
              }
            }}
            drawDistance={100}
            showsVerticalScrollIndicator={false}
          />
        </Reanimated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

type MediaRowProps = {
  items: MediaItemRow;
  postIndex: number;
  isActiveRow: boolean;
  activeColumnIndex: number;
  initialColumn: number;
  width: number;
  height: number;
  isScrollLocked: boolean;
  scrolledAwayX: SharedValue<number>;
  overlayOpacity: Animated.Value;
  rowRef: React.Ref<FlashListRef<MediaItem>> | null;
  setIsScrollLocked: (isScrollLocked: boolean) => void;
  onColumnScroll: (postIndex: number, newIndex: number) => void;
  onDismiss: () => void;
};

function MediaRow({
  items,
  postIndex,
  isActiveRow,
  activeColumnIndex,
  initialColumn,
  width,
  height,
  isScrollLocked,
  scrolledAwayX,
  overlayOpacity,
  rowRef,
  setIsScrollLocked,
  onColumnScroll,
  onDismiss,
}: MediaRowProps) {
  // Last settled column, kept on the UI thread so the handler only hops to JS
  // when the page changes.
  const lastColumn = useSharedValue(0);

  const horizontalScrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const { contentOffset, contentSize, layoutMeasurement } = event;
        if (width !== layoutMeasurement.width) {
          /**
           * Device orientation just changed. Don't handle this since the list
           * remounts (keyed on orientation) at the correct index.
           */
          return;
        }
        const newIndex = Math.min(
          items.length - 1,
          Math.max(0, Math.round(contentOffset.x / width)),
        );
        const rightLimit = contentSize.width - layoutMeasurement.width;
        if (newIndex === 0 && contentOffset.x <= 0) {
          scrolledAwayX.value = contentOffset.x;
        } else if (
          newIndex === items.length - 1 &&
          contentOffset.x >= rightLimit
        ) {
          scrolledAwayX.value = rightLimit - contentOffset.x;
        }
        if (newIndex !== lastColumn.value) {
          lastColumn.value = newIndex;
          runOnJS(onColumnScroll)(postIndex, newIndex);
        }
      },
    },
    [width, items.length, postIndex],
  );

  return (
    <ReanimatedFlashList
      ref={rowRef}
      data={items}
      style={{ width, height }}
      renderItem={({ item: mediaItem, index: itemIndex }) => (
        <View style={{ width, height }}>
          {mediaItem.type === "image" ? (
            <MediaImage
              item={mediaItem}
              setIsScrollLocked={setIsScrollLocked}
            />
          ) : mediaItem.type === "video" ? (
            <MediaVideo
              source={mediaItem.source}
              focused={isActiveRow && itemIndex === activeColumnIndex}
              overlayOpacity={overlayOpacity}
              setIsScrollLocked={setIsScrollLocked}
            />
          ) : null}
        </View>
      )}
      // Only apply initial scroll to the row we want to open to
      initialScrollIndex={initialColumn}
      scrollEnabled={items[0]?.type !== "video" && !isScrollLocked}
      pagingEnabled={true}
      horizontal={true}
      getItemType={(item) => item.type}
      keyExtractor={(item, index) =>
        item.type === "image"
          ? ((typeof item.source === "string"
              ? item.source
              : item.source[0].uri) ?? index.toString())
          : item.source.source
      }
      showsHorizontalScrollIndicator={false}
      onScroll={horizontalScrollHandler}
      scrollEventThrottle={16}
      onScrollEndDrag={(event) => {
        const rightLimit =
          event.nativeEvent.contentSize.width -
          event.nativeEvent.layoutMeasurement.width;
        const pulledPastLeft = event.nativeEvent.contentOffset.x < -40;
        const pulledPastRight =
          event.nativeEvent.contentOffset.x >= rightLimit + 40;
        const momentumPastLeft =
          (event.nativeEvent.velocity?.x ?? 0) < -1 &&
          event.nativeEvent.contentOffset.x < 0;
        const momentumPastRight =
          (event.nativeEvent.velocity?.x ?? 0) > 1 &&
          event.nativeEvent.contentOffset.x >= rightLimit;
        if (
          pulledPastLeft ||
          pulledPastRight ||
          momentumPastLeft ||
          momentumPastRight
        ) {
          onDismiss();
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  background: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "black",
  },
  contentContainer: {
    flex: 1,
  },
  overlayContainer: {
    position: "absolute",
    width: "100%",
    height: "100%",
    justifyContent: "space-between",
    zIndex: 1,
    pointerEvents: "box-none",
  },
  rowDetailsContainer: {
    position: "absolute",
    flexDirection: "row",
    right: 10,
    zIndex: 1,
    gap: 15,
  },
  rowNavigationButton: {
    aspectRatio: 1,
    borderRadius: 100,
    padding: 10,
    backgroundColor: "rgba(100, 100, 100, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  itemIndexContainer: {
    borderRadius: 10,
    padding: 10,
    backgroundColor: "rgba(100, 100, 100, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  itemIndexText: {
    color: "white",
  },
});
