import { FlashList, FlashListRef, ViewToken } from "@shopify/flash-list";
import React, {
  useContext,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useState,
  useDeferredValue,
} from "react";
import { StyleSheet, View, Text, ActivityIndicator } from "react-native";

import {
  getPostsDetail,
  loadMoreComments,
  PostDetail,
  Comment,
} from "../api/PostDetail";
import { StackPageProps } from "../app/stack";
import SortAndContext, {
  ContextTypes,
  SortTypes,
} from "../components/Navbar/SortAndContext";
import PostDetailsComponent from "../components/RedditDataRepresentations/Post/PostDetailsComponent";
import {
  CommentComponent,
  LoadMoreCommentsRow,
  CollapsedRepliesRow,
} from "../components/RedditDataRepresentations/Post/PostParts/Comments";
import {
  CommentFlatRow,
  flatRowKey,
  flattenCommentTree,
} from "../components/RedditDataRepresentations/Post/PostParts/flattenComments";
import { AccountContext } from "../contexts/AccountContext";
import { ScrollerContext, ScrollerProvider } from "../contexts/ScrollerContext";
import { CommentSettingsContext } from "../contexts/SettingsContexts/CommentSettingsContext";
import { FiltersContext } from "../contexts/SettingsContexts/FiltersContext";
import { ThemeContext } from "../contexts/SettingsContexts/ThemeContext";
import RedditURL from "../utils/RedditURL";
import { useURLNavigation } from "../utils/navigation";
import { TabScrollContext } from "../contexts/TabScrollContext";
import { modifyStat, Stat } from "../db/functions/Stats";
import ScrollToNextButtonProvider from "../contexts/ScrollToNextButtonProvider";
import { ScrollToNextButtonContext } from "../contexts/ScrollToNextButtonContext";
import ThemedRefreshControl from "../components/UI/ThemedRefreshControl";

export type LoadMoreCommentsFunc = (
  commentIds: string[],
  commentPath: number[],
  childStartIndex: number,
) => Promise<void>;

type PostDetailsProps =
  | StackPageProps<"PostDetailsPage">
  | {
      splitViewURL: string;
      setSplitViewURL: (url: string | null) => void;
    };

function PostDetails(props: PostDetailsProps) {
  const url = "route" in props ? props.route.params.url : props.splitViewURL;

  const isSplitView = "splitViewURL" in props && !!props.splitViewURL;

  const navigation = useURLNavigation();

  const { theme } = useContext(ThemeContext);
  const { scrollDisabled } = useContext(ScrollerContext);
  const { currentUser } = useContext(AccountContext);
  const { handleScrollForTabBar } = useContext(TabScrollContext);
  const { setScrollToNext, setScrollToPrevious } = useContext(
    ScrollToNextButtonContext,
  );

  const listRef = useRef<FlashListRef<CommentFlatRow>>(null);
  const listContainer = useRef<View>(null);
  // Scroll offset and first-visible row are tracked continuously so the
  // scroll helpers below never need to reach into list internals.
  const lastScrollOffsetY = useRef(0);
  const firstViewableIndex = useRef(0);

  const [postDetail, setPostDetail] = useState<PostDetail>();
  const [refreshing, setRefreshing] = useState(false);

  const deferredPostDetail = useDeferredValue(postDetail);

  const { collapseChildrenOnly } = useContext(CommentSettingsContext);
  const { doesCommentPassTextFilter } = useContext(FiltersContext);

  const flatRows = useMemo(
    () =>
      deferredPostDetail
        ? flattenCommentTree(deferredPostDetail, {
            collapseChildrenOnly,
            passesFilter: doesCommentPassTextFilter,
          })
        : [],
    [deferredPostDetail, collapseChildrenOnly, doesCommentPassTextFilter],
  );
  // The scroll helpers are registered once (via context setters) but must see
  // the current rows, so they read through a ref.
  const flatRowsRef = useRef(flatRows);
  flatRowsRef.current = flatRows;

  /**
   * Keeps a tapped-to-collapse comment visible: if its top (changeY, window
   * coords) sits above the viewport top, scroll so the comment lands at the
   * top of the list.
   */
  const scrollChange = useCallback(async (changeY: number) => {
    listContainer.current?.measureInWindow((_x, containerTop) => {
      if (changeY < containerTop) {
        listRef.current?.scrollToOffset({
          offset: lastScrollOffsetY.current + (changeY - containerTop),
          animated: true,
        });
      }
    });
  }, []);

  const loadPostDetails = async () => {
    setRefreshing(true);
    if (isSplitView) {
      setPostDetail(undefined);
    }
    const postDetail = await getPostsDetail(url);
    if (!postDetail) return;
    setPostDetail(postDetail);
    setRefreshing(false);

    if (isSplitView) return;
    const contextOptions: ContextTypes[] = [
      ...(currentUser?.userName === postDetail.author && postDetail.text
        ? ["Edit" as ContextTypes]
        : []),
      ...(currentUser?.userName === postDetail.author
        ? ["Delete" as ContextTypes]
        : []),
      "Report",
      "Select Text",
      "Share",
    ];
    const contextSort: SortTypes[] = [
      "Best",
      "New",
      "Top",
      "Controversial",
      "Old",
      "Q&A",
    ];
    navigation.setOptions({
      title: new RedditURL(url).getPageName(),
      headerRight: () => {
        return (
          <SortAndContext
            route={url}
            navigation={navigation}
            sortOptions={contextSort}
            contextOptions={contextOptions}
            pageData={postDetail}
          />
        );
      },
    });
  };

  const getCommentFromPath = (
    parentObject: PostDetail | Comment,
    commentPath: number[],
  ) => {
    return commentPath.reduce((path: PostDetail | Comment, num) => {
      return path.comments[num];
    }, parentObject);
  };

  const changeComment = (newComment: Comment | PostDetail) => {
    if (postDetail) {
      const oldComment = getCommentFromPath(postDetail, newComment.path);
      Object.assign(oldComment, newComment);
      rerenderComment(oldComment);
    }
  };

  const deleteComment = (comment: Comment) => {
    if (postDetail) {
      const parent = getCommentFromPath(postDetail, comment.path.slice(0, -1));
      parent.comments = parent.comments.filter((c) => c.id !== comment.id);
      rerenderComment(comment);
    }
  };

  const rerenderComment = (comment: Comment | PostDetail) => {
    setPostDetail((oldPostDetail) => {
      if (!oldPostDetail) return oldPostDetail;
      let currentComment: Comment | PostDetail = oldPostDetail;
      for (const num of comment.path) {
        currentComment.renderCount++;
        currentComment = currentComment.comments[num];
      }
      return { ...oldPostDetail };
    });
  };

  const loadMoreCommentsFunc: LoadMoreCommentsFunc = async (
    commentIds,
    commentPath,
    childStartIndex,
  ) => {
    if (!postDetail) return;
    const newComments = await loadMoreComments(
      postDetail.subreddit,
      postDetail?.id,
      commentIds,
      commentPath,
      childStartIndex,
    );
    setPostDetail((oldPostDetail) => {
      if (oldPostDetail) {
        const parent = getCommentFromPath(oldPostDetail, commentPath);
        parent.comments.push(...newComments);
        if (parent.loadMore) {
          parent.loadMore.childIds = parent.loadMore.childIds.filter(
            (childId) => !commentIds.includes(childId),
          );
        }
        // New top-level identity so the flattened row array recomputes and
        // the loaded comments actually appear (returning the same object
        // would make React bail out of the re-render).
        return { ...oldPostDetail };
      }
    });
  };

  /**
   * Jumps to the next/previous top-level comment: a plain index walk over the
   * flat rows relative to the first visible row (this replaces the old
   * implementation that reached into React fiber internals to measure nested
   * comment views).
   */
  const scrollToNextComment = async (goPrevious = false) => {
    const rows = flatRowsRef.current;
    const isTopLevelComment = (row: CommentFlatRow) =>
      row.kind === "comment" && row.comment.depth === 0;
    const current = firstViewableIndex.current;
    if (goPrevious) {
      for (let i = Math.min(current, rows.length) - 1; i >= 0; i--) {
        if (isTopLevelComment(rows[i])) {
          listRef.current?.scrollToIndex({ index: i, animated: true });
          return;
        }
      }
      // Nothing above: back to the post itself.
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    } else {
      for (let i = current + 1; i < rows.length; i++) {
        if (isTopLevelComment(rows[i])) {
          listRef.current?.scrollToIndex({ index: i, animated: true });
          return;
        }
      }
    }
  };

  const collapseThread = async (comment: Comment) => {
    if (!postDetail) return;

    const topOfThread = getCommentFromPath(
      postDetail,
      comment.path.slice(0, 1),
    );
    const threadIndex = flatRowsRef.current.findIndex(
      (row) => row.kind === "comment" && row.comment.id === topOfThread.id,
    );
    if (threadIndex !== -1) {
      // The thread head's index is stable across the collapse (only rows
      // after it are removed); pin it to the viewport top explicitly.
      listRef.current?.scrollToIndex({
        index: threadIndex,
        animated: true,
        viewPosition: 0,
      });
    }
    changeComment({
      ...topOfThread,
      collapsed: true,
      renderCount: topOfThread.renderCount + 1,
    });
  };

  useEffect(() => {
    loadPostDetails();
  }, [url]);

  useEffect(() => {
    setScrollToNext(() => scrollToNextComment());
    setScrollToPrevious(() => scrollToNextComment(true));
  }, []);

  return (
    <View
      style={[
        styles.postDetailsOuterContainer,
        {
          backgroundColor: theme.background,
        },
      ]}
    >
      {postDetail ? (
        <View style={styles.listContainer} ref={listContainer}>
          <FlashList<CommentFlatRow>
            ref={listRef}
            data={flatRows}
            keyExtractor={flatRowKey}
            renderItem={({ item }) => {
              switch (item.kind) {
                case "comment":
                  return (
                    <CommentComponent
                      comment={item.comment}
                      index={0}
                      scrollChange={scrollChange}
                      changeComment={changeComment}
                      deleteComment={deleteComment}
                      collapseThread={collapseThread}
                      interactionDisabledStatus={
                        postDetail.interactionDisabledStatus
                      }
                    />
                  );
                case "loadMore":
                  return (
                    <LoadMoreCommentsRow
                      parent={item.parent}
                      loadMoreComments={loadMoreCommentsFunc}
                    />
                  );
                case "collapsedReplies":
                  return (
                    <CollapsedRepliesRow
                      comment={item.comment}
                      changeComment={changeComment}
                    />
                  );
              }
            }}
            ListHeaderComponent={
              <PostDetailsComponent
                key={postDetail.id}
                postDetail={postDetail}
                loadPostDetails={loadPostDetails}
                setPostDetail={setPostDetail}
              />
            }
            ListEmptyComponent={
              postDetail !== deferredPostDetail ? (
                <View style={styles.loadingCommentsContainer}>
                  <ActivityIndicator size="small" />
                </View>
              ) : deferredPostDetail.comments.length === 0 ? (
                <View style={styles.noCommentsContainer}>
                  <Text
                    style={[
                      styles.noCommentsText,
                      {
                        color: theme.text,
                      },
                    ]}
                  >
                    No comments
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              flatRows.length > 0 ? (
                <View
                  style={[
                    styles.commentsEndDivider,
                    { borderBottomColor: theme.divider },
                  ]}
                />
              ) : null
            }
            refreshControl={
              <ThemedRefreshControl
                refreshing={refreshing}
                onRefresh={() => loadPostDetails()}
              />
            }
            scrollEnabled={!scrollDisabled}
            scrollEventThrottle={100}
            onScroll={(e) => {
              handleScrollForTabBar(e);
              lastScrollOffsetY.current = e.nativeEvent.contentOffset.y;
            }}
            onViewableItemsChanged={({
              viewableItems,
            }: {
              viewableItems: ViewToken<CommentFlatRow>[];
            }) => {
              const first = viewableItems.find(
                (token) => token.isViewable && token.index !== null,
              );
              if (first?.index != null) {
                firstViewableIndex.current = first.index;
              }
            }}
            contentContainerStyle={{
              paddingBottom: 100,
            }}
          />
        </View>
      ) : (
        <ActivityIndicator size="small" />
      )}
    </View>
  );
}

export default (props: PostDetailsProps) => {
  modifyStat(Stat.POSTS_VIEWED, 1);
  return (
    <ScrollToNextButtonProvider>
      <ScrollerProvider>
        <PostDetails {...props} />
      </ScrollerProvider>
    </ScrollToNextButtonProvider>
  );
};

const styles = StyleSheet.create({
  postDetailsOuterContainer: {
    flex: 1,
    justifyContent: "center",
  },
  postDetailsContainer: {
    flex: 1,
    paddingVertical: 12,
  },
  title: {
    fontSize: 20,
    marginBottom: 10,
    paddingHorizontal: 15,
  },
  metadataContainer: {
    marginTop: 5,
    paddingHorizontal: 15,
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  stickiedIcon: {
    marginRight: 7,
    fontSize: 16,
  },
  subredditContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  smallText: {
    fontSize: 14,
  },
  boldedSmallText: {
    fontSize: 14,
    fontWeight: "600",
  },
  buttonsBarContainer: {
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingVertical: 5,
  },
  buttonsContainer: {
    padding: 3,
    borderRadius: 5,
  },
  showContextContainer: {
    borderTopWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  listContainer: {
    flex: 1,
  },
  commentsEndDivider: {
    borderBottomWidth: 1,
  },
  loadingCommentsContainer: {
    marginVertical: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  noCommentsContainer: {
    marginVertical: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  noCommentsText: {
    fontSize: 15,
  },
});
