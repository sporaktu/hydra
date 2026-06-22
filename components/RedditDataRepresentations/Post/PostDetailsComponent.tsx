import { AntDesign, Feather, FontAwesome, Octicons } from "@expo/vector-icons";
import React, { Dispatch, SetStateAction, useContext, useState } from "react";
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Share,
  Alert,
} from "react-native";

import PostMedia from "./PostParts/PostMedia";
import SubredditIcon from "./PostParts/SubredditIcon";
import { PostDetail, vote } from "../../../api/PostDetail";
import { VoteOption } from "../../../api/Posts";
import { saveItem } from "../../../api/Save";
import { ModalContext } from "../../../contexts/ModalContext";
import { PostSettingsContext } from "../../../contexts/SettingsContexts/PostSettingsContext";
import { ThemeContext } from "../../../contexts/SettingsContexts/ThemeContext";
import RedditURL from "../../../utils/RedditURL";
import { useRoute, useURLNavigation } from "../../../utils/navigation";
import NewComment from "../../Modals/NewComment";
import Time from "../../../utils/Time";

type PostDetailsComponentProps = {
  postDetail: PostDetail;
  loadPostDetails: () => Promise<void>;
  setPostDetail: Dispatch<SetStateAction<PostDetail | undefined>>;
};

export default function PostDetailsComponent({
  postDetail,
  loadPostDetails,
  setPostDetail,
}: PostDetailsComponentProps) {
  const { params } = useRoute<"PostDetailsPage">();
  const url = params.url;
  const { pushURL } = useURLNavigation();

  const { theme } = useContext(ThemeContext);
  const { setModal } = useContext(ModalContext);
  const { tapToCollapsePost } = useContext(PostSettingsContext);

  const [mediaCollapsed, setMediaCollapsed] = useState(false);

  const contextDepth = Number(new RedditURL(url).getQueryParam("context") ?? 0);

  const voteOnPost = async (voteOption: VoteOption) => {
    const result = await vote(postDetail, voteOption);
    setPostDetail({
      ...postDetail,
      upvotes: postDetail.upvotes - postDetail.userVote + result,
      userVote: result,
    });
  };

  return (
    <View>
      <TouchableOpacity
        activeOpacity={tapToCollapsePost ? 0.8 : 1}
        onPress={() =>
          tapToCollapsePost ? setMediaCollapsed(!mediaCollapsed) : null
        }
      >
        <View style={styles.postDetailsContainer}>
          <Text
            style={[
              styles.title,
              {
                color: theme.text,
              },
            ]}
          >
            {postDetail.title}
          </Text>
          {!mediaCollapsed && <PostMedia post={postDetail} />}
          <View style={styles.metadataContainer}>
            <View style={styles.metadataRow}>
              {postDetail.isStickied && (
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
                style={styles.subredditContainer}
                activeOpacity={0.5}
                onPress={() => pushURL(`/r/${postDetail.subreddit}`)}
              >
                <SubredditIcon subredditIcon={postDetail.subredditIcon} />
                <Text
                  style={[
                    styles.boldedSmallText,
                    {
                      color: theme.subtleText,
                    },
                  ]}
                >
                  {`r/${postDetail.subreddit}`}
                </Text>
              </TouchableOpacity>
              <Text
                style={[
                  styles.smallText,
                  {
                    color: theme.subtleText,
                  },
                ]}
              >
                {" by "}
              </Text>
              <TouchableOpacity
                activeOpacity={0.5}
                onPress={() => pushURL(`/user/${postDetail.author}`)}
              >
                <Text
                  style={[
                    styles.boldedSmallText,
                    {
                      color: postDetail.isModerator
                        ? theme.moderator
                        : theme.subtleText,
                    },
                  ]}
                >
                  {`u/${postDetail.author}`}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.metadataRow, { marginTop: 5 }]}>
              <Feather name="arrow-up" size={15} color={theme.subtleText} />
              <Text
                style={[
                  styles.smallText,
                  {
                    color: theme.subtleText,
                  },
                ]}
              >
                {postDetail.upvotes}
              </Text>
              <Text
                style={[
                  styles.smallText,
                  {
                    color: theme.subtleText,
                  },
                ]}
              >
                {"  •  "}
                {postDetail.timeSince}
              </Text>
              {postDetail.editedAt && (
                <TouchableOpacity
                  style={styles.editedAtContainer}
                  onPress={() => {
                    if (!postDetail.editedAt) return;
                    const timeSinceEdited = new Time(
                      postDetail.editedAt,
                    ).prettyTimeSince();
                    Alert.alert(
                      `Edited ${timeSinceEdited} ago`,
                      `Post was edited at ${new Date(postDetail.editedAt).toLocaleString()}`,
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
              {postDetail.interactionDisabledStatus && (
                <>
                  <Text style={{ color: theme.subtleText }}>{"  •  "}</Text>
                  <View style={styles.interactionDisabledContainer}>
                    <Feather name="lock" size={14} color={theme.subtleText} />
                    <Text style={{ color: theme.subtleText }}>
                      {postDetail.interactionDisabledStatus}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
      <View
        style={[
          styles.buttonsBarContainer,
          {
            borderTopColor: theme.divider,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.buttonsContainer,
            {
              backgroundColor:
                postDetail.userVote === VoteOption.UpVote
                  ? theme.upvote
                  : undefined,
            },
          ]}
          onPress={() => voteOnPost(VoteOption.UpVote)}
        >
          <Feather
            name="arrow-up"
            size={32}
            color={
              postDetail.userVote === VoteOption.UpVote
                ? theme.text
                : theme.iconPrimary
            }
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.buttonsContainer,
            {
              backgroundColor:
                postDetail.userVote === VoteOption.DownVote
                  ? theme.downvote
                  : undefined,
            },
          ]}
          onPress={() => voteOnPost(VoteOption.DownVote)}
        >
          <Feather
            name="arrow-down"
            size={32}
            color={
              postDetail.userVote === VoteOption.DownVote
                ? theme.text
                : theme.iconPrimary
            }
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.buttonsContainer,
            {
              backgroundColor: undefined,
            },
          ]}
          onPress={async () => {
            await saveItem(postDetail, !postDetail.saved);
            setPostDetail({
              ...postDetail,
              saved: !postDetail.saved,
            });
          }}
        >
          <FontAwesome
            name={postDetail.saved ? "bookmark" : "bookmark-o"}
            size={28}
            color={theme.iconPrimary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.buttonsContainer}
          onPress={() => {
            if (postDetail.interactionDisabledStatus) {
              Alert.alert(
                `This post has been ${postDetail.interactionDisabledStatus}`,
              );
              return;
            }
            setModal(
              <NewComment
                parent={postDetail}
                contentSent={() => setTimeout(() => loadPostDetails(), 5_000)}
              />,
            );
          }}
        >
          <Octicons name="reply" size={28} color={theme.iconPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.buttonsContainer}
          onPress={() => {
            Share.share({ url: new RedditURL(url).toString() });
          }}
        >
          <Feather name="share" size={28} color={theme.iconPrimary} />
        </TouchableOpacity>
      </View>
      {contextDepth > 0 && (
        <TouchableOpacity
          onPress={() => {
            pushURL(
              new RedditURL(
                `https://www.reddit.com/r/${postDetail.subreddit}/comments/${postDetail.id}/`,
              ).toString(),
            );
          }}
          style={[
            styles.showContextContainer,
            {
              borderTopColor: theme.divider,
            },
          ]}
        >
          <Text style={{ color: theme.iconOrTextButton }}>
            This is a comment thread. Click here to view all comments.
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

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
  editedAtContainer: {
    padding: 8,
    margin: -8,
    marginLeft: -3,
  },
  interactionDisabledContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  boldedSmallText: {
    fontSize: 14,
    fontWeight: "600",
  },
  buttonsBarContainer: {
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 46,
    paddingHorizontal: 15,
    paddingVertical: 5,
  },
  buttonsContainer: {
    padding: 3,
    borderRadius: 5,
    marginVertical: -100,
  },
  showContextContainer: {
    borderTopWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 10,
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
