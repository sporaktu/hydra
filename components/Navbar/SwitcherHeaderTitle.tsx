import React, { useContext } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

import { ThemeContext } from "../../contexts/SettingsContexts/ThemeContext";
import { SubredditSwitcherContext } from "../../contexts/SubredditSwitcherContext";

type SwitcherHeaderTitleProps = {
  title: string;
};

export default function SwitcherHeaderTitle({
  title,
}: SwitcherHeaderTitleProps) {
  const { theme } = useContext(ThemeContext);
  const { openSubredditSwitcher } = useContext(SubredditSwitcherContext);

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.5}
      onPress={() => openSubredditSwitcher()}
    >
      <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
        {title}
      </Text>
      <MaterialIcons
        name="keyboard-arrow-down"
        size={22}
        color={theme.subtleText}
        style={styles.chevron}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 240,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    flexShrink: 1,
  },
  chevron: {
    marginLeft: 2,
  },
});
