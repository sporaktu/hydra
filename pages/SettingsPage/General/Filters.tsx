import { FontAwesome, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useContext, useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";

import List from "../../../components/UI/List";
import SectionTitle from "../../../components/UI/SectionTitle";
import TextInput from "../../../components/UI/TextInput";
import { FiltersContext } from "../../../contexts/SettingsContexts/FiltersContext";
import { ThemeContext } from "../../../contexts/SettingsContexts/ThemeContext";
import { getHiddenPosts, unhidePost } from "../../../db/functions/HiddenPosts";

type HiddenPost = ReturnType<typeof getHiddenPosts>[number];

export default function Filters() {
  const { theme } = useContext(ThemeContext);
  const {
    filterSeenPosts,
    toggleFilterSeenPosts,
    hideSeenURLs,
    autoMarkAsSeen,
    toggleAutoMarkAsSeen,
    filterText,
    setFilterText,
    hideFilteredSubreddits,
    toggleFilterSubreddit: toggleHideSubreddit,
  } = useContext(FiltersContext);

  const filteredSubreddits = Object.entries(hideFilteredSubreddits);

  const [hiddenPosts, setHiddenPosts] = useState<HiddenPost[]>([]);

  useEffect(() => {
    setHiddenPosts(getHiddenPosts());
  }, []);

  const handleUnhidePost = (post: HiddenPost) => {
    Alert.alert(`Unhide this post?`, post.title, [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Unhide",
        style: "destructive",
        onPress: async () => {
          await unhidePost(post.postId);
          setHiddenPosts((current) =>
            current.filter((p) => p.postId !== post.postId),
          );
        },
      },
    ]);
  };

  const hideSeenURLOverrides = Object.entries(hideSeenURLs)
    .filter(([_, setting]) => setting !== filterSeenPosts)
    .map(([url]) => url);

  return (
    <>
      <Text
        style={[
          styles.textDescription,
          {
            color: theme.text,
          },
        ]}
      >
        Filters only apply to items in the main feeds and subreddits. They do
        not apply to search results or user profiles. Excessive filtering may
        make load times slower because more items have to be loaded before
        showing results.
      </Text>
      <View style={[styles.divider, { borderColor: theme.divider }]} />
      <List
        title="Post Settings"
        items={[
          {
            key: "filterSeenPosts",
            icon: (
              <MaterialCommunityIcons
                name="view-compact-outline"
                size={24}
                color={theme.text}
              />
            ),
            rightIcon: (
              <Switch
                trackColor={{
                  false: theme.iconSecondary,
                  true: theme.iconPrimary,
                }}
                value={filterSeenPosts}
                onValueChange={() => toggleFilterSeenPosts()}
              />
            ),
            text: "Hide Seen Posts",
            onPress: () => toggleFilterSeenPosts(),
          },
          {
            key: "autoMarkAsSeen",
            icon: (
              <MaterialCommunityIcons
                name="view-compact-outline"
                size={24}
                color={theme.text}
              />
            ),
            rightIcon: (
              <Switch
                trackColor={{
                  false: theme.iconSecondary,
                  true: theme.iconPrimary,
                }}
                value={autoMarkAsSeen}
                onValueChange={() => toggleAutoMarkAsSeen()}
              />
            ),
            text: "Mark as Seen On Scroll",
            onPress: () => toggleAutoMarkAsSeen(),
          },
        ]}
      />
      {hideSeenURLOverrides.length > 0 && (
        <View style={styles.hideSeenURLsContainer}>
          <Text
            style={{
              color: theme.text,
            }}
          >
            You have set manual overrides to {filterSeenPosts ? "show" : "hide"}{" "}
            seen posts on the following URLs:
          </Text>
          {hideSeenURLOverrides.map((url) => (
            <Text
              key={url}
              style={{
                color: theme.text,
              }}
            >
              {url}
            </Text>
          ))}
        </View>
      )}
      <View style={[styles.divider, { borderColor: theme.divider }]} />
      <SectionTitle text="Text Filter List" />
      <TextInput
        style={[
          styles.filterText,
          {
            backgroundColor: theme.tint,
            borderColor: theme.divider,
            color: theme.text,
          },
        ]}
        textAlignVertical="top"
        multiline
        value={filterText}
        onChangeText={(text) => setFilterText(text)}
      />
      <Text
        style={[
          styles.textDescription,
          {
            color: theme.text,
          },
        ]}
      >
        Words or phrases can be seperated by commas or new lines. If a post or
        comment contains items on this list, it will be hidden from view. Post
        filter text includes the title, author username, post text, poll
        options, link titles, and link descriptions. Comment filter text
        includes the comment text, and author username. Text filtering is case
        insensitive and won't match subwords. For example, "cat" won't match
        "caterpillar".
      </Text>
      <View style={[styles.divider, { borderColor: theme.divider }]} />
      <SectionTitle text="Filtered subreddits" />
      <Text
        style={[
          styles.textDescription,
          {
            marginTop: 0,
            color: theme.text,
          },
        ]}
      >
        You can filter subreddits by long-pressing posts on /r/all or
        /r/popular. Once filtered, subreddits will apear here. Delete the filter
        to begin seeing posts from the subreddit again.
      </Text>
      {filteredSubreddits.length > 0 && (
        <List
          title="Subreddits"
          items={filteredSubreddits.map(([subreddit, expiresAt]) => ({
            key: subreddit,
            text: subreddit,
            rightIcon: <></>,
            renderCustomItem: () => (
              <>
                <View style={styles.iconMargin}>
                  <FontAwesome name="reddit" size={24} color={theme.text} />
                </View>
                <View style={styles.subredditFilterInfo}>
                  <Text style={{ color: theme.text, fontSize: 17 }}>
                    {subreddit}
                  </Text>
                  <Text style={{ color: theme.subtleText, fontSize: 13 }}>
                    {expiresAt === true
                      ? "Forever"
                      : `Until ${new Date(expiresAt).toLocaleDateString()}`}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={24}
                  color={theme.text}
                />
              </>
            ),
            onPress: () => {
              Alert.alert(`Stop filtering /r/${subreddit}?`, "", [
                {
                  text: "Cancel",
                  style: "cancel",
                },
                {
                  text: "Stop Filtering",
                  style: "destructive",
                  onPress: () => {
                    toggleHideSubreddit(subreddit);
                  },
                },
              ]);
            },
          }))}
        />
      )}
      <View style={[styles.divider, { borderColor: theme.divider }]} />
      <SectionTitle text="Hidden posts" />
      <Text
        style={[
          styles.textDescription,
          {
            marginTop: 0,
            color: theme.text,
          },
        ]}
      >
        You can hide individual posts by long-pressing them and choosing "Hide
        Post". Hidden posts are kept locally (not on Reddit) and automatically
        start showing again one month after they were hidden. Tap a post here to
        unhide it sooner.
      </Text>
      {hiddenPosts.length > 0 && (
        <List
          title="Posts"
          items={hiddenPosts.map((post) => ({
            key: post.postId,
            text: post.title,
            rightIcon: <></>,
            renderCustomItem: () => (
              <>
                <View style={styles.iconMargin}>
                  <MaterialCommunityIcons
                    name="eye-off-outline"
                    size={24}
                    color={theme.text}
                  />
                </View>
                <View style={styles.subredditFilterInfo}>
                  <Text
                    style={{ color: theme.text, fontSize: 17 }}
                    numberOfLines={2}
                  >
                    {post.title}
                  </Text>
                  <Text style={{ color: theme.subtleText, fontSize: 13 }}>
                    {`r/${post.subreddit} · Expires ${new Date(
                      post.expiresAt,
                    ).toLocaleDateString()}`}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={24}
                  color={theme.text}
                />
              </>
            ),
            onPress: () => handleUnhidePost(post),
          }))}
        />
      )}
      <View style={{ marginBottom: 50 }} />
    </>
  );
}

const styles = StyleSheet.create({
  divider: {
    marginTop: 25,
    marginBottom: 10,
    marginHorizontal: 15,
    borderBottomWidth: 1,
  },
  textDescription: {
    marginTop: 10,
    marginHorizontal: 15,
    lineHeight: 20,
  },
  hideSeenURLsContainer: {
    marginTop: 10,
    marginHorizontal: 15,
    gap: 5,
  },
  filterText: {
    marginHorizontal: 15,
    borderWidth: 2,
    borderRadius: 10,
    padding: 10,
    minHeight: 100,
  },
  iconMargin: {
    width: 24,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  subredditFilterInfo: {
    flex: 1,
    marginLeft: 10,
    gap: 2,
  },
});
