import { Comment, PostDetail } from "../../../../api/PostDetail";

/**
 * Rows for the virtualized comment list (docs/specs/04-comment-virtualization.md).
 * The comment tree flattens depth-first into one row per visible comment —
 * collapsed comments contribute only their head row — plus dedicated rows for
 * "load more replies" links and the "N more replies" stub a collapsed comment
 * shows when collapseChildrenOnly is on. Rows are keyed by comment id, never
 * by array index, since indices shift on collapse/load-more.
 */
export type CommentFlatRow =
  | { kind: "comment"; comment: Comment }
  | { kind: "loadMore"; parent: Comment | PostDetail }
  | { kind: "collapsedReplies"; comment: Comment };

export function flatRowKey(row: CommentFlatRow): string {
  switch (row.kind) {
    case "comment":
      return `comment-${row.comment.id}`;
    case "loadMore":
      return `loadMore-${row.parent.id}`;
    case "collapsedReplies":
      return `collapsedReplies-${row.comment.id}`;
  }
}

export function flattenCommentTree(
  root: PostDetail,
  options: {
    collapseChildrenOnly: boolean;
    /** Text filter — a failing comment hides its entire subtree. */
    passesFilter: (comment: Comment) => boolean;
  },
): CommentFlatRow[] {
  const rows: CommentFlatRow[] = [];

  const visit = (comment: Comment) => {
    if (!options.passesFilter(comment)) return;
    rows.push({ kind: "comment", comment });
    if (comment.collapsed) {
      if (options.collapseChildrenOnly && comment.comments.length > 0) {
        rows.push({ kind: "collapsedReplies", comment });
      }
      return;
    }
    comment.comments.forEach(visit);
    if (comment.loadMore && comment.loadMore.childIds.length > 0) {
      rows.push({ kind: "loadMore", parent: comment });
    }
  };

  root.comments.forEach(visit);
  if (root.loadMore && root.loadMore.childIds.length > 0) {
    rows.push({ kind: "loadMore", parent: root });
  }
  return rows;
}
