import React, { useContext, useEffect } from "react";
import { StyleSheet, View } from "react-native";
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
// How much padding the pulsing background extends around the content.
const HIGHLIGHT_PADDING = 6;

export default function PulseHighlight({
  active,
  children,
}: React.PropsWithChildren<PulseHighlightProps>) {
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

  const backgroundStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.35,
    transform: [{ scale: 0.9 + progress.value * 0.1 }],
  }));

  return (
    <View style={styles.container}>
      {active && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.highlight,
            { backgroundColor: theme.iconSecondary },
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
    top: -HIGHLIGHT_PADDING,
    bottom: -HIGHLIGHT_PADDING,
    left: -HIGHLIGHT_PADDING,
    right: -HIGHLIGHT_PADDING,
    borderRadius: 9999,
  },
});
