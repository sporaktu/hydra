import { createContext, useCallback, useMemo } from "react";
import { useMMKVBoolean } from "react-native-mmkv";

const initialValues = {
  voteIndicator: false,
  collapseAutoModerator: true,
  commentFlairs: true,
  showCommentSummary: true,
  tapToCollapseComment: true,
  collapseChildrenOnly: false,
};

const initialCommentSettingsContext = {
  ...initialValues,
  toggleVoteIndicator: (_newValue?: boolean) => {},
  toggleCollapseAutoModerator: (_newValue?: boolean) => {},
  toggleCommentFlairs: (_newValue?: boolean) => {},
  toggleShowCommentSummary: (_newValue?: boolean) => {},
  toggleTapToCollapseComment: (_newValue?: boolean) => {},
  toggleCollapseChildrenOnly: (_newValue?: boolean) => {},
};

export const CommentSettingsContext = createContext(
  initialCommentSettingsContext,
);

export function CommentSettingsProvider({ children }: React.PropsWithChildren) {
  const [voteIndicator, setVoteIndicator] = useMMKVBoolean("voteIndicator");
  const [storedCollapseAutoModerator, setCollapseAutoModerator] =
    useMMKVBoolean("collapseAutoModerator");
  const collapseAutoModerator =
    storedCollapseAutoModerator ?? initialValues.collapseAutoModerator;

  const [storedCommentFlairs, setCommentFlairs] =
    useMMKVBoolean("commentFlairs");
  const commentFlairs = storedCommentFlairs ?? initialValues.commentFlairs;

  const [storedShowCommentSummary, setShowCommentSummary] =
    useMMKVBoolean("showCommentSummary");
  const showCommentSummary =
    storedShowCommentSummary ?? initialValues.showCommentSummary;

  const toggleVoteIndicator = useCallback(
    (newValue = !voteIndicator) => {
      setVoteIndicator(newValue);
      alert(
        "Existing pages may need to be refreshed for this change to take effect.",
      );
    },
    [voteIndicator, setVoteIndicator],
  );

  const [storedTapToCollapseComment, setTapToCollapseComment] = useMMKVBoolean(
    "tapToCollapseComment",
  );
  const tapToCollapseComment =
    storedTapToCollapseComment ?? initialValues.tapToCollapseComment;

  const toggleTapToCollapseComment = useCallback(
    (newValue = !tapToCollapseComment) => {
      setTapToCollapseComment(newValue);
      alert(
        "Existing pages may need to be refreshed for this change to take effect.",
      );
    },
    [tapToCollapseComment, setTapToCollapseComment],
  );

  const [storedCollapseChildrenOnly, setCollapseChildrenOnly] = useMMKVBoolean(
    "collapseChildrenOnly",
  );
  const collapseChildrenOnly =
    storedCollapseChildrenOnly ?? initialValues.collapseChildrenOnly;

  const toggleCollapseAutoModerator = useCallback(
    (newValue = !collapseAutoModerator) => setCollapseAutoModerator(newValue),
    [collapseAutoModerator, setCollapseAutoModerator],
  );

  const toggleCommentFlairs = useCallback(
    (newValue = !commentFlairs) => setCommentFlairs(newValue),
    [commentFlairs, setCommentFlairs],
  );

  const toggleShowCommentSummary = useCallback(
    (newValue = !showCommentSummary) => setShowCommentSummary(newValue),
    [showCommentSummary, setShowCommentSummary],
  );

  const toggleCollapseChildrenOnly = useCallback(
    (newValue = !collapseChildrenOnly) => setCollapseChildrenOnly(newValue),
    [collapseChildrenOnly, setCollapseChildrenOnly],
  );

  const value = useMemo(
    () => ({
      voteIndicator: voteIndicator ?? initialValues.voteIndicator,
      toggleVoteIndicator,

      collapseAutoModerator,
      toggleCollapseAutoModerator,

      commentFlairs,
      toggleCommentFlairs,

      showCommentSummary,
      toggleShowCommentSummary,

      tapToCollapseComment:
        tapToCollapseComment ?? initialValues.tapToCollapseComment,
      toggleTapToCollapseComment,

      collapseChildrenOnly,
      toggleCollapseChildrenOnly,
    }),
    [
      voteIndicator,
      toggleVoteIndicator,
      collapseAutoModerator,
      toggleCollapseAutoModerator,
      commentFlairs,
      toggleCommentFlairs,
      showCommentSummary,
      toggleShowCommentSummary,
      tapToCollapseComment,
      toggleTapToCollapseComment,
      collapseChildrenOnly,
      toggleCollapseChildrenOnly,
    ],
  );

  return (
    <CommentSettingsContext.Provider value={value}>
      {children}
    </CommentSettingsContext.Provider>
  );
}
