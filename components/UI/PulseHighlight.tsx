import React, { useContext, useEffect, useState } from "react";
import { ColorValue, LayoutChangeEvent, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { ThemeContext } from "../../contexts/SettingsContexts/ThemeContext";

type PulseHighlightProps = {
  // When true a colored background behind the wrapped content slowly pulses to
  // draw the user's attention.
  active: boolean;
};

const PULSE_DURATION = 1400;
// How much the pulsing circle extends past the wrapped content on each side.
const HIGHLIGHT_PADDING = 6;

/**
 * Returns true when `color` reads as a red/danger hue, so red-button themes
 * (e.g. spiderman/strawberry/mulberry) pulse in their own red, while every
 * other theme uses the softer amber `share` caution color.
 */
function isRedish(color: ColorValue): boolean {
  if (typeof color !== "string") return false;
  const hex = color.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!hex) return false;
  const int = parseInt(hex[1], 16);
  const r = ((int >> 16) & 0xff) / 255;
  const g = ((int >> 8) & 0xff) / 255;
  const b = (int & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return false; // grey
  let hue: number;
  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }
  hue *= 60;
  if (hue < 0) hue += 360;
  const lightness = (max + min) / 2;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  return (hue <= 20 || hue >= 345) && saturation >= 0.5;
}

export default function PulseHighlight({
  active,
  children,
}: React.PropsWithChildren<PulseHighlightProps>) {
  const { theme } = useContext(ThemeContext);
  const progress = useSharedValue(0);
  const [contentSize, setContentSize] = useState(0);

  useEffect(() => {
    if (active) {
      progress.value = withRepeat(
        withTiming(1, {
          duration: PULSE_DURATION,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      );
    } else {
      cancelAnimation(progress);
      progress.value = 0;
    }
    return () => cancelAnimation(progress);
  }, [active, progress]);

  const backgroundStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.35,
    transform: [{ scale: 0.9 + progress.value * 0.1 }],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContentSize(Math.max(width, height));
  };

  // A circle whose diameter covers the (possibly non-square) content plus
  // padding, so the glow is always round rather than a rounded rectangle.
  const diameter = contentSize + HIGHLIGHT_PADDING * 2;

  const pulseColor = isRedish(theme.iconOrTextButton)
    ? theme.iconOrTextButton
    : theme.share;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {active && contentSize > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.highlight,
            {
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
              backgroundColor: pulseColor,
            },
            backgroundStyle,
          ]}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  highlight: {
    position: "absolute",
  },
});
