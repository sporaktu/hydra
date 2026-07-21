import React, { useContext, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  useAnimatedValue,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemeContext } from "../../contexts/SettingsContexts/ThemeContext";
import { getSearchResults } from "../../api/Search";
import { resolveSubreddit } from "../../api/SubredditDetails";
import { useDebouncedEffect } from "../../utils/debounce";
import { Subreddit } from "../../api/Subreddits";
import SubredditIcon from "../RedditDataRepresentations/Post/PostParts/SubredditIcon";
import {
  NavigationContainerRef,
  StackActions,
  useNavigation,
} from "@react-navigation/native";
import { AppNavigationProp } from "../../utils/navigationTypes";
import { SubredditContext } from "../../contexts/SubredditContext";
import { FlashList } from "@shopify/flash-list";
import { MaterialIcons } from "@expo/vector-icons";

type QuickSubredditSearchProps = {
  show: boolean;
  onExit: () => void;
};

const PAGE_SIZE = 20;
const MAX_VISIBLE_ROWS = 10;
const ROW_HEIGHT = 52;

export default function QuickSubredditSearch({
  show,
  onExit,
}: QuickSubredditSearchProps) {
  const navigation = useNavigation<NavigationContainerRef<AppNavigationProp>>();

  const { theme } = useContext(ThemeContext);
  const { subreddits: userSubs } = useContext(SubredditContext);

  const textInputRef = useRef<TextInput>(null);
  const opacity = useAnimatedValue(0);
  const [searchText, setSearchText] = useState("");
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fullyLoaded, setFullyLoaded] = useState(false);
  const [exactSub, setExactSub] = useState<Subreddit | null>(null);
  const exactLookupToken = useRef(0);
  const searchToken = useRef(0);

  const subredditsToShow = searchText
    ? subreddits
    : [...userSubs.favorites, ...userSubs.subscriber];

  const navigateToSubreddit = (subreddit: Subreddit) => {
    onExit();
    setSearchText("");
    setSubreddits([]);
    setExactSub(null);
    navigation.dispatch(
      StackActions.push("PostsPage", {
        url: `https://www.reddit.com/r/${subreddit.name}`,
      }),
    );
  };

  const loadSearchResults = async (searchText: string) => {
    if (!searchText.length) return;
    const token = ++searchToken.current;
    setLoading(true);
    setLoadingMore(false);
    setFullyLoaded(false);
    const results = await getSearchResults<"subreddits">(
      "subreddits",
      searchText,
      {
        limit: String(PAGE_SIZE),
        sr_detail: "false",
      },
    );
    // Ignore stale searches (user kept typing)
    if (token !== searchToken.current) return;
    setSubreddits(results);
    setFullyLoaded(results.length < PAGE_SIZE);
    setLoading(false);
  };

  const loadMoreSearchResults = async () => {
    // Only the searched results paginate; the user's own subs are fully loaded.
    if (!searchText.length || loading || loadingMore || fullyLoaded) return;
    const lastSubreddit = subreddits[subreddits.length - 1];
    if (!lastSubreddit) return;
    const token = searchToken.current;
    setLoadingMore(true);
    const results = await getSearchResults<"subreddits">(
      "subreddits",
      searchText,
      {
        limit: String(PAGE_SIZE),
        after: lastSubreddit.after,
        sr_detail: "false",
      },
    );
    // Ignore this page if a new search started while it was in flight
    if (token !== searchToken.current) return;
    setSubreddits((prev) => [...prev, ...results]);
    setFullyLoaded(results.length < PAGE_SIZE);
    setLoadingMore(false);
  };

  const loadExactSub = async (searchText: string) => {
    const trimmed = searchText.trim().replace(/^(\/r\/|r\/|\/)/, "");
    if (!trimmed.length) {
      setExactSub(null);
      return;
    }
    const token = ++exactLookupToken.current;
    const result = await resolveSubreddit(trimmed);
    // Ignore stale lookups (user kept typing)
    if (token !== exactLookupToken.current) return;
    setExactSub(result);
  };

  useDebouncedEffect(
    500,
    () => {
      loadSearchResults(searchText);
      loadExactSub(searchText);
    },
    [searchText],
  );

  useEffect(() => {
    if (show) {
      textInputRef.current?.focus();
    } else {
      textInputRef.current?.blur();
    }
    Animated.timing(opacity, {
      toValue: show ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [show]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: opacity,
          pointerEvents: show ? "auto" : "none",
        },
      ]}
    >
      <SafeAreaView style={styles.safeArea}>
        <TextInput
          ref={textInputRef}
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.tint,
              borderColor: theme.divider,
              borderWidth: 1,
              borderRadius: 10,
            },
          ]}
          autoCorrect={false}
          value={searchText}
          onChangeText={(text) => {
            setSearchText(text);
            setExactSub(null);
          }}
          returnKeyType="go"
          onSubmitEditing={() => {
            if (exactSub) {
              navigateToSubreddit(exactSub);
            }
          }}
          placeholder="Search for a subreddit"
          placeholderTextColor={theme.subtleText}
        />
        {exactSub && (
          <TouchableOpacity
            onPress={() => navigateToSubreddit(exactSub)}
            activeOpacity={0.5}
            style={[
              styles.goToContainer,
              {
                backgroundColor: theme.tint,
                borderColor: theme.divider,
              },
            ]}
          >
            <SubredditIcon
              subredditIcon={exactSub.iconURL}
              overridePostAppearanceSetting={true}
            />
            <Text style={[styles.goToText, { color: theme.text }]}>
              Go to r/{exactSub.name}
            </Text>
            <MaterialIcons
              name="keyboard-arrow-right"
              size={30}
              color={theme.verySubtleText}
            />
          </TouchableOpacity>
        )}
        <FlashList
          style={{
            ...styles.subredditsContainer,
            borderColor: theme.divider,
            backgroundColor: theme.tint,
          }}
          contentContainerStyle={{ backgroundColor: theme.tint }}
          keyboardShouldPersistTaps="handled"
          data={subredditsToShow}
          onEndReached={loadMoreSearchResults}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                style={styles.footerLoading}
                size="small"
                color={theme.text}
              />
            ) : null
          }
          renderItem={({ item, index }) => (
            <TouchableOpacity
              onPress={() => navigateToSubreddit(item)}
              activeOpacity={0.5}
              style={[
                styles.subredditContainer,
                {
                  borderBottomColor:
                    index < subredditsToShow.length - 1
                      ? theme.divider
                      : "transparent",
                },
              ]}
            >
              <View style={styles.subredditSubContainer}>
                <SubredditIcon
                  subredditIcon={item.iconURL}
                  overridePostAppearanceSetting={true}
                />
                <Text
                  style={[
                    styles.subredditText,
                    {
                      color: theme.text,
                    },
                  ]}
                >
                  {item.name}
                </Text>
                <MaterialIcons
                  name="keyboard-arrow-right"
                  size={30}
                  color={theme.verySubtleText}
                  style={styles.arrow}
                />
              </View>
            </TouchableOpacity>
          )}
        />
        {loading && (
          <ActivityIndicator
            style={styles.loading}
            size="small"
            color={theme.text}
          />
        )}
      </SafeAreaView>
      <TouchableOpacity
        activeOpacity={0.7}
        style={styles.background}
        onPress={() => onExit()}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    paddingHorizontal: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  background: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "black",
    opacity: 0.7,
    zIndex: 1,
  },
  safeArea: {
    width: "100%",
    zIndex: 2,
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 10,
    pointerEvents: "box-none",
  },
  input: {
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 15,
    fontSize: 18,
    marginTop: 20,
  },
  subredditsContainer: {
    width: "100%",
    marginTop: 10,
    pointerEvents: "auto",
    maxHeight: ROW_HEIGHT * MAX_VISIBLE_ROWS,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
  },
  subredditSubContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  subredditContainer: {
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subredditText: {
    fontSize: 17,
    flex: 1,
    marginLeft: 10,
  },
  arrow: {
    marginVertical: -100,
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  loading: {
    marginTop: 20,
  },
  footerLoading: {
    paddingVertical: 15,
  },
  goToContainer: {
    width: "100%",
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  goToText: {
    fontSize: 17,
    fontWeight: "600",
    flex: 1,
    marginLeft: 10,
  },
});
