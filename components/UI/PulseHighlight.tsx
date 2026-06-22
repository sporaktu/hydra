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

type PulseHighlightChildren =
  | React.ReactNode
  | ((args: { color: ColorValue | undefined }) => React.ReactNode);

type PulseHighlightProps = {
  // When true the wrapped content slowly pulses to draw the user's attention.
  active: boolean;
  // The wrapped content. When passed as a function it receives the theme's
  // alert color while `active` (and `undefined` otherwise) so icons can render
  // in the attention-grabbing color.
  children: PulseHighlightChildren;
};

const PULSE_DURATION = 1400;

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

  const alertColor = active ? theme.delete : undefined;

  return (
    <Animated.View style={animatedStyle}>
      {typeof children === "function"
        ? children({ color: alertColor })
        : children}
    </Animated.View>
  );
}
