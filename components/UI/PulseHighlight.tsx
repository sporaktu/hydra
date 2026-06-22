import React, { useEffect } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

type PulseHighlightProps = {
  // When true the wrapped content slowly pulses to draw the user's attention.
  active: boolean;
};

const PULSE_DURATION = 1400;

export default function PulseHighlight({
  active,
  children,
}: React.PropsWithChildren<PulseHighlightProps>) {
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

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}
