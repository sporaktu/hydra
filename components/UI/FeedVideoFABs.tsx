import { Feather } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useContext } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { TAB_BAR_REMOVED_PADDING_BOTTOM } from "../../constants/TabBarPadding";
import { PostSettingsContext } from "../../contexts/SettingsContexts/PostSettingsContext";
import { ThemeContext } from "../../contexts/SettingsContexts/ThemeContext";
import { hapticSelection } from "../../utils/haptics";

type FeedFABProps = {
  icon: React.ComponentProps<typeof Feather>["name"];
  active: boolean;
  accessibilityLabel: string;
  onPress: () => void;
};

function FeedFAB({ icon, active, accessibilityLabel, onPress }: FeedFABProps) {
  const { theme } = useContext(ThemeContext);

  return (
    <TouchableOpacity
      style={[
        styles.fab,
        {
          backgroundColor: theme.background,
          borderColor: theme.divider,
        },
      ]}
      activeOpacity={0.8}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
    >
      <Feather
        name={icon}
        size={22}
        color={active ? theme.iconPrimary : theme.subtleText}
      />
    </TouchableOpacity>
  );
}

/**
 * Floating video controls for feed pages, stacked bottom-right above the tab
 * bar:
 *
 * - **Autoplay** (top): whether feed videos play at all. With it off, every
 *   video post shows its Poster until opened.
 * - **Audio** (bottom): when on, the Focused Post's video plays with sound
 *   (see docs/specs/02-focused-video-playback.md). Hidden while autoplay is
 *   off, since there is then never a playing feed video to hear.
 *
 * Both settings are global, persist across launches, and are mirrored by rows
 * in Settings → Appearance.
 */
export default function FeedVideoFABs() {
  const {
    autoPlayVideos,
    toggleAutoPlayVideos,
    feedVideoAudio,
    toggleFeedVideoAudio,
  } = useContext(PostSettingsContext);
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <View
      style={[
        styles.stack,
        { bottom: tabBarHeight - TAB_BAR_REMOVED_PADDING_BOTTOM + 20 },
      ]}
    >
      <FeedFAB
        icon={autoPlayVideos ? "play-circle" : "pause-circle"}
        active={autoPlayVideos}
        accessibilityLabel="Autoplay videos in the feed"
        onPress={toggleAutoPlayVideos}
      />
      {autoPlayVideos && (
        <FeedFAB
          icon={feedVideoAudio ? "volume-2" : "volume-x"}
          active={feedVideoAudio}
          accessibilityLabel="Play sound for the centered video"
          onPress={toggleFeedVideoAudio}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: "absolute",
    right: 16,
    alignItems: "center",
    gap: 10,
    zIndex: 10,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.9,
    // Standard iOS-style FAB shadow.
    shadowColor: "black",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
});
