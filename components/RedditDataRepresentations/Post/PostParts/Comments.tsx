import {
  AntDesign,
  Feather,
  FontAwesome,
  Ionicons,
  MaterialCommunityIcons,
  Octicons,
} from "@expo/vector-icons";
import { useRecyclingState } from "@shopify/flash-list";
import { Image } from "expo-image";
import React, { useContext, useMemo, useRef, ComponentRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TouchableHighlight,
  Alert,
  Platform,
} from "react-native";

import {
  Comment,
  deleteUserContent,
  PostDetail,
  reloadComment,
  vote,
} from "../../../../api/PostDetail";
import { VoteOption } from "../../../../api/Posts";
import { saveItem } from "../../../../api/Save";
import { AccountContext } from "../../../../contexts/AccountContext";
import { ModalContext } from "../../../../contexts/ModalContext";
import { CommentSettingsContext } from "../../../../contexts/SettingsContexts/CommentSettingsContext";
import { FiltersContext } from "../../../../contexts/SettingsContexts/FiltersContext";
import { ThemeContext } from "../../../../contexts/SettingsContexts/ThemeContext";
import { LoadMoreCommentsFunc } from "../../../../pages/PostDetails";
import RedditURL from "../../../../utils/RedditURL";
import shareURL from "../../../../utils/shareURL";
import { useURLNavigation } from "../../../../utils/navigation";
import useContextMenu from "../../../../utils/useContextMenu";
import RenderHtml from "../../../HTML/RenderHTML";
import EditComment from "../../../Modals/EditComment";
import NewComment from "../../../Modals/NewComment";
import SelectText from "../../../Modals/SelectText";
import Slideable from "../../../UI/Slideable";
import NativeContextMenu, {
  NativeContextMenuAction,
} from "../../../UI/NativeContextMenu";
import { GesturesContext } from "../../../../contexts/SettingsContexts/GesturesContext";
import Time from "../../../../utils/Time";

/**
 * Renders a SINGLE comment row. The comment tree is flattened into rows by
 * pages/PostDetails.tsx (see flattenComments.ts) and rendered in a
 * virtualized FlashList — this component no longer recurses into children.
 */
interface CommentProps {
  comment: PostDetail | Comment;
  index: number;
  scrollChange?: (y: number) => void;
  displayInList?: boolean; // Changes render style for use in something like a list of user comments,
  changeComment: (comment: Comment) => void;
  deleteComment: (comment: Comment) => void;
  collapseThread?: (comment: Comment) => void;
  interactionDisabledStatus?: PostDetail["interactionDisabledStatus"];
}

export function CommentComponent({
  comment,
  index,
  scrollChange,
  displayInList,
  changeComment,
  deleteComment,
  collapseThread,
  interactionDisabledStatus = null,
}: CommentProps) {
  const { theme } = useContext(ThemeContext);
  const {
    voteIndicator,
    commentFlairs,
    tapToCollapseComment,
    collapseChildrenOnly,
  } = useContext(CommentSettingsContext);
  const { commentSwipeOptions } = useContext(GesturesContext);
  const { doesCommentPassTextFilter } = useContext(FiltersContext);
  const { pushURL } = useURLNavigation();
  const { setModal } = useContext(ModalContext);
  const { currentUser } = useContext(AccountContext);
  const showContextMenu = useContextMenu();

  const isFiltered =
    comment.type === "comment" &&
    !displayInList &&
    !doesCommentPassTextFilter(comment);

  const commentRef = useRef<ComponentRef<typeof TouchableHighlight>>(null);

  const toggleCollapse = () => {
    if (comment.type !== "comment") return;
    changeComment?.({
      ...comment,
      collapsed: !comment.collapsed,
      renderCount: comment.renderCount + 1,
    });
  };

  const voteOnComment = async (voteOption: VoteOption) => {
    if (comment.type === "comment") {
      const result = await vote(comment, voteOption);
      changeComment?.({
        ...comment,
        userVote: result,
        upvotes: comment.upvotes - comment.userVote + result,
        renderCount: comment.renderCount + 1,
      });
    }
  };

  const saveComment = async () => {
    if (comment.type !== "comment") return;
    await saveItem(comment, !comment.saved);
    changeComment?.({
      ...comment,
      saved: !comment.saved,
      renderCount: comment.renderCount + 1,
    });
  };

  const replyToComment = () => {
    if (interactionDisabledStatus) {
      Alert.alert(`This post has been ${interactionDisabledStatus}`);
      return;
    }
    setModal(
      <NewComment
        parent={comment}
        contentSent={() =>
          setTimeout(async () => {
            const reloadedComment = await reloadComment(comment);
            changeComment?.(reloadedComment);
          }, 5_000)
        }
      />,
    );
  };

  const editComment = () => {
    if (comment.type !== "comment") return;
    if (interactionDisabledStatus) {
      Alert.alert(`This post has been ${interactionDisabledStatus}`);
      return;
    }
    setModal(
      <EditComment
        edit={comment}
        contentSent={async () => {
          const reloadedComment = await reloadComment(comment);
          changeComment?.(reloadedComment);
        }}
      />,
    );
  };

  const confirmDeleteComment = () => {
    if (comment.type !== "comment") return;
    Alert.alert(
      "Delete Comment",
      "Are you sure you want to delete this comment?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteUserContent(comment);
              deleteComment(comment);
            } catch (_) {
              alert("Failed to delete comment");
            }
          },
        },
      ],
    );
  };

  const commentMenuOptions: NativeContextMenuAction[] = [
    {
      label: "Upvote",
      handle: () => voteOnComment(VoteOption.UpVote),
    },
    {
      label: "Downvote",
      handle: () => voteOnComment(VoteOption.DownVote),
    },
    ...(displayInList
      ? []
      : [
          {
            label: comment.collapsed ? "Expand" : "Collapse",
            handle: () => toggleCollapse(),
          },
          {
            label: "Collapse Thread",
            handle: () => {
              if (comment.type === "comment") collapseThread?.(comment);
            },
          },
        ]),
    {
      label: "Select Text",
      handle: () => setModal(<SelectText text={comment.text} />),
    },
    {
      label: "Reply",
      handle: () => replyToComment(),
    },
    {
      label: comment.saved ? "Unsave" : "Save",
      handle: () => saveComment(),
    },
    ...(currentUser?.userName === comment.author
      ? [
          {
            label: "Edit",
            handle: () => editComment(),
          },
          {
            label: "Delete",
            destructive: true,
            handle: () => confirmDeleteComment(),
          },
        ]
      : []),
    {
      label: "Share",
      handle: () => {
        shareURL(new RedditURL(comment.link).toString());
      },
    },
  ];

  const showCommentOptions = async () => {
    const result = await showContextMenu({
      options: commentMenuOptions.map((option) => option.label),
    });
    commentMenuOptions.find((option) => option.label === result)?.handle();
  };

  return useMemo(
    () =>
      isFiltered ? null : (
        <View key={comment.id}>
          {comment.depth >= 0 && (
            <Slideable
              xScrollToEngage={15}
              options={[
                {
                  name: "upvote",
                  icon: <Feather name="arrow-up" />,
                  size: 38,
                  color: theme.upvote,
                  action: async () => await voteOnComment(VoteOption.UpVote),
                },
                {
                  name: "downvote",
                  icon: <Feather name="arrow-down" />,
                  size: 38,
                  color: theme.downvote,
                  action: async () => await voteOnComment(VoteOption.DownVote),
                },
                {
                  name: "reply",
                  icon: <Octicons name="reply" />,
                  color: theme.reply,
                  action: () => replyToComment(),
                },
                {
                  name: "bookmark",
                  icon: (
                    <FontAwesome
                      name={comment.saved ? "bookmark" : "bookmark-o"}
                    />
                  ),
                  color: theme.bookmark,
                  action: () => saveComment(),
                },
                {
                  name: "share",
                  icon: <FontAwesome name="share" />,
                  color: theme.share,
                  action: async () => {
                    shareURL(new RedditURL(comment.link).toString());
                  },
                },
                {
                  name: "collapse",
                  icon: (
                    <Ionicons
                      name={
                        comment.collapsed
                          ? "chevron-expand"
                          : "chevron-collapse"
                      }
                    />
                  ),
                  color: theme.collapse,
                  action: () => toggleCollapse(),
                },
                {
                  name: "collapseThread",
                  icon: <MaterialCommunityIcons name="arrow-collapse-all" />,
                  color: theme.collapse,
                  action: () => {
                    if (comment.type !== "comment") return;
                    collapseThread?.(comment);
                  },
                },
              ]}
              shortLeftName={commentSwipeOptions.right}
              longLeftName={commentSwipeOptions.farRight}
              shortRightName={commentSwipeOptions.left}
              longRightName={commentSwipeOptions.farLeft}
            >
              <NativeContextMenu actions={commentMenuOptions}>
                <TouchableHighlight
                  ref={commentRef}
                  activeOpacity={1}
                  underlayColor={
                    tapToCollapseComment || displayInList
                      ? theme.tint
                      : undefined
                  }
                  onPress={() => {
                    if (displayInList) {
                      if (comment.type === "comment") {
                        pushURL(
                          new RedditURL(comment.link)
                            .setQueryParams({ context: "10" })
                            .toString(),
                        );
                      }
                    } else if (tapToCollapseComment) {
                      commentRef.current?.measureInWindow(
                        (_x, y, _width_, _height) => {
                          if (!comment.collapsed && scrollChange) {
                            scrollChange(y);
                          }
                        },
                      );
                      toggleCollapse();
                    }
                  }}
                  onLongPress={
                    // iOS uses the native context menu (NativeContextMenu); the
                    // action sheet stays as the Android long-press path.
                    Platform.OS === "ios"
                      ? undefined
                      : () => showCommentOptions()
                  }
                  style={[
                    styles.outerCommentContainer,
                    displayInList
                      ? styles.outerCommentContainerDisplayInList
                      : {},
                    {
                      marginLeft: 10 * comment.depth,
                      borderTopColor: theme.divider,
                    },
                  ]}
                >
                  <View
                    key={index}
                    style={[
                      styles.commentContainer,
                      displayInList ? styles.commentContainerDisplayInList : {},
                      {
                        borderLeftWidth: comment.depth === 0 ? 0 : 1,
                        borderLeftColor:
                          theme.commentDepthColors[
                            (comment.depth - 1) %
                              theme.commentDepthColors.length
                          ],
                        borderRightColor:
                          comment.userVote === VoteOption.UpVote
                            ? theme.upvote
                            : theme.downvote,
                        borderRightWidth:
                          voteIndicator &&
                          comment.userVote !== VoteOption.NoVote
                            ? 1
                            : 0,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.topBar,
                        {
                          marginBottom:
                            comment.collapsed && !collapseChildrenOnly ? 0 : 8,
                        },
                      ]}
                    >
                      {comment.isStickied && (
                        <AntDesign
                          name="pushpin"
                          style={[
                            styles.stickiedIcon,
                            {
                              color: theme.moderator,
                            },
                          ]}
                        />
                      )}
                      <TouchableOpacity
                        onPress={() => pushURL(`/user/${comment.author}`)}
                      >
                        <Text
                          style={[
                            styles.author,
                            {
                              color: comment.isOP
                                ? theme.iconOrTextButton
                                : comment.isModerator
                                  ? theme.moderator
                                  : theme.text,
                            },
                          ]}
                        >
                          {comment.author}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.upvoteContainer}
                        onPress={() => voteOnComment(VoteOption.UpVote)}
                      >
                        <AntDesign
                          name={
                            comment.userVote === VoteOption.DownVote
                              ? "arrow-down"
                              : "arrow-up"
                          }
                          size={14}
                          color={
                            comment.userVote === VoteOption.UpVote
                              ? theme.upvote
                              : comment.userVote === VoteOption.DownVote
                                ? theme.downvote
                                : theme.subtleText
                          }
                        />
                        <Text
                          style={[
                            styles.upvoteText,
                            {
                              color:
                                comment.userVote === VoteOption.UpVote
                                  ? theme.upvote
                                  : comment.userVote === VoteOption.DownVote
                                    ? theme.downvote
                                    : theme.subtleText,
                            },
                          ]}
                        >
                          {comment.scoreHidden && !comment.userVote
                            ? "-"
                            : comment.upvotes}
                        </Text>
                      </TouchableOpacity>
                      {comment.editedAt && (
                        <TouchableOpacity
                          style={styles.editedAtContainer}
                          onPress={() => {
                            if (!comment.editedAt) return;
                            const timeSinceEdited = new Time(
                              comment.editedAt,
                            ).prettyTimeSince();
                            Alert.alert(
                              `Edited ${timeSinceEdited} ago`,
                              `Comment was edited at ${new Date(comment.editedAt).toLocaleString()}`,
                            );
                          }}
                        >
                          <FontAwesome
                            name="pencil"
                            size={14}
                            color={theme.subtleText}
                          />
                        </TouchableOpacity>
                      )}
                      {commentFlairs && comment.flair && (
                        <TouchableOpacity
                          style={[
                            styles.flairContainer,
                            {
                              backgroundColor: theme.divider,
                            },
                          ]}
                          onPress={() =>
                            alert(comment.flair?.text ?? "No flair text")
                          }
                        >
                          {comment.flair.emojis.map((emoji, index) => (
                            <Image
                              key={index}
                              source={{ uri: emoji }}
                              style={styles.flairEmoji}
                            />
                          ))}
                          {comment.flair.text && (
                            <Text
                              style={[
                                styles.flairText,
                                {
                                  color: theme.text,
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {comment.flair.text}
                            </Text>
                          )}
                        </TouchableOpacity>
                      )}
                      <View style={styles.topBarEnd}>
                        <Text
                          style={[
                            styles.upvoteText,
                            {
                              color: theme.subtleText,
                            },
                          ]}
                        >
                          {comment.shortTimeSince}
                        </Text>
                      </View>
                    </View>
                    {collapseChildrenOnly || !comment.collapsed ? (
                      <View style={styles.textContainer}>
                        <RenderHtml html={comment.html} />
                      </View>
                    ) : null}
                    {displayInList && (
                      <TouchableOpacity
                        style={[
                          styles.sourceContainer,
                          {
                            borderColor: theme.tint,
                          },
                        ]}
                        activeOpacity={0.8}
                        onPress={() => {
                          pushURL(comment.postLink);
                        }}
                      >
                        <Text
                          style={[
                            styles.sourcePostTitle,
                            {
                              color: theme.subtleText,
                            },
                          ]}
                        >
                          {comment.postTitle}
                        </Text>
                        <Text
                          style={[
                            styles.sourceSubreddit,
                            {
                              color: theme.verySubtleText,
                            },
                          ]}
                        >
                          {comment.subreddit}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {comment.saved && (
                      <View
                        style={[
                          styles.bookmarkNotch,
                          {
                            borderColor: theme.bookmark,
                          },
                        ]}
                      />
                    )}
                  </View>
                </TouchableHighlight>
              </NativeContextMenu>
            </Slideable>
          )}
          {displayInList && (
            <View
              style={[
                styles.spacer,
                {
                  backgroundColor: theme.divider,
                },
              ]}
            />
          )}
        </View>
      ),
    [
      isFiltered,
      commentFlairs,
      comment.collapsed,
      comment,
      comment.renderCount,
      theme,
    ],
  );
}

/**
 * "N more replies" link row: loads the next batch of a comment's unloaded
 * children. Uses useRecyclingState so a recycled cell never shows another
 * row's transient "Loading..." text.
 */
export function LoadMoreCommentsRow({
  parent,
  loadMoreComments,
}: {
  parent: PostDetail | Comment;
  loadMoreComments: LoadMoreCommentsFunc;
}) {
  const { theme } = useContext(ThemeContext);
  const [loadingMore, setLoadingMore] = useRecyclingState(false, [parent.id]);

  if (!parent.loadMore) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.5}
      onPress={async () => {
        if (!parent.loadMore) return;
        setLoadingMore(true);
        await loadMoreComments(
          parent.loadMore.childIds.slice(0, 10),
          parent.path,
          parent.comments.length,
        );
        setLoadingMore(false);
      }}
      style={[
        styles.outerCommentContainer,
        {
          marginLeft: 10 * (parent.depth + 1),
          borderTopColor: theme.divider,
        },
      ]}
    >
      <View
        style={[
          styles.commentContainer,
          {
            borderLeftWidth: parent.depth === -1 ? 0 : 1,
            borderLeftColor:
              theme.commentDepthColors[
                parent.depth % theme.commentDepthColors.length
              ],
          },
        ]}
      >
        <Text
          style={[
            styles.upvoteText,
            {
              color: theme.iconOrTextButton,
            },
          ]}
        >
          {loadingMore
            ? "Loading..."
            : `${parent.loadMore.childIds.length} more replies`}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/**
 * The "N more replies" stub a collapsed comment shows in place of its
 * children when collapseChildrenOnly is on; tapping expands the comment.
 */
export function CollapsedRepliesRow({
  comment,
  changeComment,
}: {
  comment: Comment;
  changeComment: (comment: Comment) => void;
}) {
  const { theme } = useContext(ThemeContext);

  return (
    <TouchableOpacity
      activeOpacity={0.5}
      onPress={() =>
        changeComment({
          ...comment,
          collapsed: !comment.collapsed,
          renderCount: comment.renderCount + 1,
        })
      }
      style={{
        marginLeft: 10 * (comment.depth + 1),
        borderTopWidth: 1,
        borderTopColor: theme.divider,
      }}
    >
      <View
        style={{
          borderLeftWidth: comment.depth === -1 ? 0 : 1,
          borderLeftColor:
            theme.commentDepthColors[
              comment.depth % theme.commentDepthColors.length
            ],
          marginVertical: 10,
          paddingLeft: 15,
        }}
      >
        <Text
          style={[
            styles.upvoteText,
            {
              color: theme.iconOrTextButton,
            },
          ]}
        >
          {comment.comments.length} more replies
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  commentsContainer: {
    borderBottomWidth: 1,
  },
  outerCommentContainer: {
    borderTopWidth: 1,
    paddingVertical: 10,
  },
  outerCommentContainerDisplayInList: {
    borderTopWidth: 0,
  },
  commentContainer: {
    flex: 1,
    paddingLeft: 15,
    paddingRight: 10,
  },
  commentContainerDisplayInList: {
    paddingLeft: 10,
  },
  stickiedIcon: {
    fontSize: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  author: {
    fontSize: 14,
    fontWeight: "500",
  },
  upvoteContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  upvoteText: {
    fontSize: 14,
  },
  flairContainer: {
    flexShrink: 1,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 5,
    gap: 2,
    marginVertical: -10,
  },
  flairEmoji: {
    width: 16,
    height: 16,
  },
  flairText: {
    flexShrink: 1,
  },
  editedAtContainer: {
    padding: 8,
    margin: -8,
    marginLeft: -3,
  },
  topBarEnd: {
    flexGrow: 1,
    alignItems: "flex-end",
  },
  textContainer: {
    marginVertical: -10,
  },
  sourceContainer: {
    borderWidth: 3,
    marginTop: 15,
    marginBottom: 5,
    padding: 10,
    borderRadius: 10,
  },
  sourcePostTitle: {
    marginBottom: 10,
  },
  sourceSubreddit: {},
  text: {
    fontSize: 15,
    lineHeight: 18,
  },
  spacer: {
    height: 10,
  },
  bookmarkNotch: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 15,
    borderBottomWidth: 15,
    borderLeftColor: "transparent",
  },
});
