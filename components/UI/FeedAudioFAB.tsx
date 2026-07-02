import { Feather } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useContext } from "react";
import { StyleSheet, TouchableOpacity } from "react-native";

import { TAB_BAR_REMOVED_PADDING_BOTTOM } from "../../constants/TabBarPadding";
import { PostSettingsContext } from "../../contexts/SettingsContexts/PostSettingsContext";
import { ThemeContext } from "../../contexts/SettingsContexts/ThemeContext";
import { hapticSelection } from "../../utils/haptics";

/**
 * Floating toggle for feed video audio: when on, the Focused Post's video
 * autoplays with sound (see docs/specs/02-focused-video-playback.md). The
 * setting is global and persists across launches; it is mirrored by the
 * "Focused video audio" row in Settings → Appearance.
 */
export default function FeedAudioFAB() {
  const { theme } = useContext(ThemeContext);
  const { feedVideoAudio, toggleFeedVideoAudio, autoPlayVideos } =
    useContext(PostSettingsContext);
  const tabBarHeight = useBottomTabBarHeight();

  // Without autoplay there is never a playing feed video to hear.
  if (!autoPlayVideos) return null;

  return (
    <TouchableOpacity
      style={[
        styles.fab,
        {
          backgroundColor: theme.background,
          borderColor: theme.divider,
          bottom: tabBarHeight - TAB_BAR_REMOVED_PADDING_BOTTOM + 20,
        },
      ]}
      activeOpacity={0.8}
      accessibilityRole="switch"
      accessibilityState={{ checked: feedVideoAudio }}
      accessibilityLabel="Play sound for the centered video"
      onPress={() => {
        hapticSelection();
        toggleFeedVideoAudio();
      }}
    >
      <Feather
        name={feedVideoAudio ? "volume-2" : "volume-x"}
        size={22}
        color={feedVideoAudio ? theme.iconPrimary : theme.subtleText}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.9,
    zIndex: 10,
    // Standard iOS-style FAB shadow.
    shadowColor: "black",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
});
