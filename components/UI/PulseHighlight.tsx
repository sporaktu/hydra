import React, { useContext, useEffect } from "react";
import { ColorValue } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { ThemeContext } from "../../contexts/SettingsContexts/ThemeContext";
import { Theme } from "../../constants/Themes";

type PulseHighlightChildren =
  | React.ReactNode
  | ((args: { color: ColorValue | undefined }) => React.ReactNode);

type PulseHighlightProps = {
  // When true the wrapped icon slowly pulses (opacity + scale) and is tinted
  // with the theme's attention color to draw the user's attention.
  active: boolean;
  // The wrapped content. When passed as a function it receives the pulse color
  // while `active` (and `undefined` otherwise) so the icon can be tinted.
  children: PulseHighlightChildren;
};

const PULSE_DURATION = 1400;

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

/**
 * The color the pulse uses for `theme`: red-button themes pulse in their own
 * red, every other theme uses the softer amber `share` caution color. Exported
 * so call sites can tint adjacent content (e.g. a tab label) to match.
 */
export function getPulseColor(theme: Theme): ColorValue {
  return isRedish(theme.iconOrTextButton)
    ? theme.iconOrTextButton
    : theme.share;
}

export default function PulseHighlight({
  active,
  children,
}: PulseHighlightProps) {
  const { theme } = useContext(ThemeContext);
  const progress = useSharedValue(0);

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

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value * 0.6,
    transform: [{ scale: 1 - progress.value * 0.08 }],
  }));

  const color = active ? getPulseColor(theme) : undefined;

  return (
    <Animated.View style={animatedStyle}>
      {typeof children === "function" ? children({ color }) : children}
    </Animated.View>
  );
}
