import {
  PropsWithChildren,
  ReactElement,
  cloneElement,
  useContext,
  useState,
} from "react";
import { View, StyleSheet, ColorValue } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ScrollerContext } from "../../contexts/ScrollerContext";
import { ThemeContext } from "../../contexts/SettingsContexts/ThemeContext";
import { GesturesContext } from "../../contexts/SettingsContexts/GesturesContext";
import { hapticEngage } from "../../utils/haptics";
import { IconProps } from "@expo/vector-icons/build/createIconSet";

const SHORT_SWIPE_THRESHOLD = 75;
const LONG_SWIPE_THRESHOLD = 130;

/**
 * Threshold band the current drag distance falls in. Positive = rightward
 * drag (revealing the LEFT options), negative = leftward. Magnitude 1 = the
 * short threshold, 2 = the long threshold. Computed on the UI thread; the JS
 * thread is only notified when the band changes.
 */
type SwipeBand = -2 | -1 | 0 | 1 | 2;

const bandForDelta = (delta: number): SwipeBand => {
  "worklet";
  const absD = Math.abs(delta);
  if (absD >= LONG_SWIPE_THRESHOLD) return delta > 0 ? 2 : -2;
  if (absD >= SHORT_SWIPE_THRESHOLD) return delta > 0 ? 1 : -1;
  return 0;
};

type SlideItem<SlideName extends string> = {
  name: SlideName;
  icon: ReactElement<IconProps<string>>;
  size?: number;
  color: ColorValue;
  action: () => void;
};

type SlideableProps<SlideName extends string> = {
  options: SlideItem<SlideName>[];
  shortLeftName?: SlideName;
  longLeftName?: SlideName;
  shortRightName?: SlideName;
  longRightName?: SlideName;
  xScrollToEngage?: number;
};

export default function Slideable<SlideName extends string>({
  children,
  options,
  shortLeftName,
  longLeftName,
  shortRightName,
  longRightName,
  xScrollToEngage,
}: PropsWithChildren<SlideableProps<SlideName>>) {
  const { theme } = useContext(ThemeContext);
  const { setScrollDisabled } = useContext(ScrollerContext);
  const { swipeAnywhereToNavigate } = useContext(GesturesContext);

  // Gesture tracking runs entirely on the UI thread (Reanimated shared
  // values), so swipes stay at 60fps even when the JS thread is busy
  // rendering the feed. Only band changes and the released action hop to JS.
  const translateX = useSharedValue(0);

  const [slideItem, setSlideItem] = useState<
    SlideItem<SlideName> & { side: "left" | "right" }
  >();

  const lookupOption = (name: SlideName | undefined) =>
    options.find((option) => option.name === name);

  const shortLeftItem = lookupOption(shortLeftName);
  const longLeftItem = lookupOption(longLeftName);
  const shortRightItem = lookupOption(shortRightName);
  const longRightItem = lookupOption(longRightName);

  const itemForBand = (band: SwipeBand) => {
    if (band === 0) return undefined;
    const [shortItem, longItem] =
      band > 0
        ? [shortLeftItem, longLeftItem]
        : [shortRightItem, longRightItem];
    return Math.abs(band) === 2 ? (longItem ?? shortItem) : shortItem;
  };

  const handleBandChange = (band: SwipeBand) => {
    const item = itemForBand(band);
    if (item?.name !== slideItem?.name) {
      setSlideItem(
        item ? { side: band > 0 ? "left" : "right", ...item } : undefined,
      );
      if (item) hapticEngage();
    }
  };

  const fireActionForBand = (band: SwipeBand) => {
    const item = itemForBand(band);
    if (item) {
      item.action();
    }
  };

  const clearSlideItem = () => setSlideItem(undefined);

  const engageDistance = xScrollToEngage ?? 20;
  const lastBand = useSharedValue<SwipeBand>(0);

  const panGesture = Gesture.Pan()
    // Mostly-horizontal movement activates; vertical movement fails the pan
    // so the enclosing list scrolls normally. When swipeAnywhereToNavigate is
    // on, rightward drags never activate so the OS back gesture wins.
    .activeOffsetX(
      swipeAnywhereToNavigate
        ? [-engageDistance, Number.MAX_SAFE_INTEGER]
        : [-engageDistance, engageDistance],
    )
    .failOffsetY([-10, 10])
    .onStart(() => {
      lastBand.value = 0;
      runOnJS(setScrollDisabled)(true);
    })
    .onUpdate((e) => {
      const delta = swipeAnywhereToNavigate
        ? Math.min(e.translationX, 0)
        : e.translationX;
      translateX.value = delta;
      const band = bandForDelta(delta);
      if (band !== lastBand.value) {
        lastBand.value = band;
        runOnJS(handleBandChange)(band);
      }
    })
    .onEnd((e) => {
      const delta = swipeAnywhereToNavigate
        ? Math.min(e.translationX, 0)
        : e.translationX;
      const band = bandForDelta(delta);
      if (band !== 0) {
        runOnJS(fireActionForBand)(band);
      }
    })
    .onFinalize(() => {
      translateX.value = withSpring(
        0,
        { damping: 100, stiffness: 300, overshootClamping: true },
        (finished) => {
          if (finished) {
            runOnJS(clearSlideItem)();
          }
        },
      );
      runOnJS(setScrollDisabled)(false);
    });

  const animatedSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.slideableContainer}>
        <Animated.View
          style={[
            styles.animatedView,
            {
              backgroundColor: theme.background,
            },
            animatedSlideStyle,
          ]}
        >
          {children}
        </Animated.View>
        <View
          style={[
            styles.backgroundContainer,
            {
              backgroundColor: slideItem?.color ?? theme.tint,
            },
          ]}
        >
          <View
            style={[
              styles.iconContainer,
              {
                marginLeft: slideItem?.side === "left" ? 0 : "auto",
              },
            ]}
          >
            {slideItem?.icon &&
              cloneElement(slideItem.icon, {
                color: theme.text,
                size: slideItem.size ?? 32,
              })}
          </View>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  slideableContainer: {
    flexDirection: "row",
    overflow: "hidden",
  },
  animatedView: {
    flex: 1,
  },
  backgroundContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    position: "absolute",
    width: "100%",
    height: "100%",
    zIndex: -1,
  },
  iconContainer: {
    width: 50,
    alignItems: "center",
    justifyContent: "center",
  },
});
