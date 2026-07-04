import { Comment, PostDetail } from "../../../../../api/PostDetail";
import {
  CommentFlatRow,
  flatRowKey,
  flattenCommentTree,
} from "../flattenComments";

/**
 * Minimal fixture builders. flattenCommentTree only reads id, comments,
 * collapsed, loadMore.childIds (and passes each Comment to passesFilter), so we
 * build partial objects and cast with the repo's `as unknown as` style rather
 * than filling every Comment field.
 */
type CommentInit = {
  id: string;
  depth?: number;
  collapsed?: boolean;
  comments?: Comment[];
  loadMoreChildIds?: string[];
};

function makeComment(init: CommentInit): Comment {
  return {
    id: init.id,
    depth: init.depth ?? 0,
    collapsed: init.collapsed ?? false,
    comments: init.comments ?? [],
    loadMore:
      init.loadMoreChildIds !== undefined
        ? { depth: (init.depth ?? 0) + 1, childIds: init.loadMoreChildIds }
        : undefined,
  } as unknown as Comment;
}

function makePostDetail(init: {
  comments?: Comment[];
  loadMoreChildIds?: string[];
}): PostDetail {
  return {
    id: "post",
    depth: -1,
    collapsed: false,
    comments: init.comments ?? [],
    loadMore:
      init.loadMoreChildIds !== undefined
        ? { depth: 0, childIds: init.loadMoreChildIds }
        : undefined,
  } as unknown as PostDetail;
}

const allPass = () => true;

/** Compact description of a row for order assertions. */
function describeRow(row: CommentFlatRow): string {
  switch (row.kind) {
    case "comment":
      return `comment:${row.comment.id}`;
    case "loadMore":
      return `loadMore:${row.parent.id}`;
    case "collapsedReplies":
      return `collapsedReplies:${row.comment.id}`;
  }
}

const describeRows = (rows: CommentFlatRow[]) => rows.map(describeRow);

const defaultOptions = {
  collapseChildrenOnly: false,
  passesFilter: allPass,
};

describe("flattenCommentTree", () => {
  it("returns an empty array for a tree with no comments", () => {
    expect(flattenCommentTree(makePostDetail({}), defaultOptions)).toEqual([]);
  });

  it("emits one comment row per top-level comment, in order", () => {
    const root = makePostDetail({
      comments: [
        makeComment({ id: "a" }),
        makeComment({ id: "b" }),
        makeComment({ id: "c" }),
      ],
    });

    expect(describeRows(flattenCommentTree(root, defaultOptions))).toEqual([
      "comment:a",
      "comment:b",
      "comment:c",
    ]);
  });

  it("orders rows depth-first: parent, then children recursively, then parent's loadMore", () => {
    // a
    // ├─ a1
    // │  └─ a1a
    // ├─ a2
    // └─ loadMore(a)
    // b
    const root = makePostDetail({
      comments: [
        makeComment({
          id: "a",
          depth: 0,
          comments: [
            makeComment({
              id: "a1",
              depth: 1,
              comments: [makeComment({ id: "a1a", depth: 2 })],
            }),
            makeComment({ id: "a2", depth: 1 }),
          ],
          loadMoreChildIds: ["more1"],
        }),
        makeComment({ id: "b", depth: 0 }),
      ],
    });

    expect(describeRows(flattenCommentTree(root, defaultOptions))).toEqual([
      "comment:a",
      "comment:a1",
      "comment:a1a",
      "comment:a2",
      "loadMore:a",
      "comment:b",
    ]);
  });

  it("matches the old recursive render order (parent row before its subtree, loadMore after subtree)", () => {
    // Mirrors what the old recursive Comments.tsx map produced: a comment's
    // children render nested inside it, and its "load more" link renders after
    // all rendered children.
    const root = makePostDetail({
      comments: [
        makeComment({
          id: "top",
          comments: [
            makeComment({
              id: "child",
              comments: [makeComment({ id: "grandchild" })],
              loadMoreChildIds: ["gc-more"],
            }),
          ],
        }),
      ],
      loadMoreChildIds: ["root-more"],
    });

    expect(describeRows(flattenCommentTree(root, defaultOptions))).toEqual([
      "comment:top",
      "comment:child",
      "comment:grandchild",
      "loadMore:child",
      "loadMore:post",
    ]);
  });

  it("puts the root's loadMore row last, after every top-level comment", () => {
    const root = makePostDetail({
      comments: [makeComment({ id: "a" }), makeComment({ id: "b" })],
      loadMoreChildIds: ["x", "y"],
    });

    expect(describeRows(flattenCommentTree(root, defaultOptions))).toEqual([
      "comment:a",
      "comment:b",
      "loadMore:post",
    ]);
  });

  describe("collapsed comments", () => {
    it("emits only the head row, excluding children and the comment's own loadMore", () => {
      const root = makePostDetail({
        comments: [
          makeComment({
            id: "a",
            collapsed: true,
            comments: [
              makeComment({ id: "a1" }),
              makeComment({ id: "a2", comments: [makeComment({ id: "a2a" })] }),
            ],
            loadMoreChildIds: ["more"],
          }),
          makeComment({ id: "b" }),
        ],
      });

      expect(describeRows(flattenCommentTree(root, defaultOptions))).toEqual([
        "comment:a",
        "comment:b",
      ]);
    });

    it("with collapseChildrenOnly and children present, follows the head with a collapsedReplies stub", () => {
      const root = makePostDetail({
        comments: [
          makeComment({
            id: "a",
            collapsed: true,
            comments: [makeComment({ id: "a1" })],
          }),
          makeComment({ id: "b" }),
        ],
      });

      const rows = flattenCommentTree(root, {
        collapseChildrenOnly: true,
        passesFilter: allPass,
      });

      expect(describeRows(rows)).toEqual([
        "comment:a",
        "collapsedReplies:a",
        "comment:b",
      ]);
    });

    it("with collapseChildrenOnly but NO children, emits no stub", () => {
      const root = makePostDetail({
        comments: [makeComment({ id: "a", collapsed: true, comments: [] })],
      });

      const rows = flattenCommentTree(root, {
        collapseChildrenOnly: true,
        passesFilter: allPass,
      });

      expect(describeRows(rows)).toEqual(["comment:a"]);
    });

    it("without collapseChildrenOnly, never emits a stub even when children exist", () => {
      const root = makePostDetail({
        comments: [
          makeComment({
            id: "a",
            collapsed: true,
            comments: [makeComment({ id: "a1" })],
          }),
        ],
      });

      const rows = flattenCommentTree(root, {
        collapseChildrenOnly: false,
        passesFilter: allPass,
      });

      expect(describeRows(rows)).toEqual(["comment:a"]);
    });

    it("collapses only the collapsed comment; sibling subtrees are unaffected", () => {
      const root = makePostDetail({
        comments: [
          makeComment({
            id: "a",
            collapsed: true,
            comments: [makeComment({ id: "a1" })],
          }),
          makeComment({
            id: "b",
            comments: [makeComment({ id: "b1" })],
          }),
        ],
      });

      expect(describeRows(flattenCommentTree(root, defaultOptions))).toEqual([
        "comment:a",
        "comment:b",
        "comment:b1",
      ]);
    });
  });

  describe("filtering", () => {
    it("drops a filtered comment and its entire subtree, even children that would pass", () => {
      const root = makePostDetail({
        comments: [
          makeComment({
            id: "bad",
            comments: [
              // These would pass the filter on their own, but their parent
              // fails, so the whole subtree must be gone.
              makeComment({ id: "good-child" }),
              makeComment({
                id: "good-grandparent",
                comments: [makeComment({ id: "good-grandchild" })],
              }),
            ],
            loadMoreChildIds: ["more"],
          }),
          makeComment({ id: "keep" }),
        ],
      });

      const rows = flattenCommentTree(root, {
        collapseChildrenOnly: false,
        passesFilter: (comment) => comment.id !== "bad",
      });

      expect(describeRows(rows)).toEqual(["comment:keep"]);
    });

    it("drops a filtered child while keeping its passing parent and siblings", () => {
      const root = makePostDetail({
        comments: [
          makeComment({
            id: "parent",
            comments: [
              makeComment({ id: "keep1" }),
              makeComment({
                id: "drop",
                comments: [makeComment({ id: "orphan" })],
              }),
              makeComment({ id: "keep2" }),
            ],
          }),
        ],
      });

      const rows = flattenCommentTree(root, {
        collapseChildrenOnly: false,
        passesFilter: (comment) => comment.id !== "drop",
      });

      expect(describeRows(rows)).toEqual([
        "comment:parent",
        "comment:keep1",
        "comment:keep2",
      ]);
    });

    it("keeps everything when the filter passes all comments", () => {
      const root = makePostDetail({
        comments: [
          makeComment({ id: "a", comments: [makeComment({ id: "a1" })] }),
        ],
      });

      expect(describeRows(flattenCommentTree(root, defaultOptions))).toEqual([
        "comment:a",
        "comment:a1",
      ]);
    });
  });

  describe("loadMore rows", () => {
    it("emits a loadMore row only when childIds is non-empty", () => {
      const root = makePostDetail({
        comments: [
          makeComment({ id: "withMore", loadMoreChildIds: ["x"] }),
          makeComment({ id: "emptyMore", loadMoreChildIds: [] }),
          makeComment({ id: "noMore" }),
        ],
      });

      expect(describeRows(flattenCommentTree(root, defaultOptions))).toEqual([
        "comment:withMore",
        "loadMore:withMore",
        "comment:emptyMore",
        "comment:noMore",
      ]);
    });

    it("does not emit a root loadMore row when the root's childIds is empty", () => {
      const root = makePostDetail({
        comments: [makeComment({ id: "a" })],
        loadMoreChildIds: [],
      });

      expect(describeRows(flattenCommentTree(root, defaultOptions))).toEqual([
        "comment:a",
      ]);
    });
  });

  describe("flatRowKey", () => {
    it("prefixes keys by kind and comment/parent id", () => {
      const comment = makeComment({ id: "x" });
      expect(flatRowKey({ kind: "comment", comment })).toBe("comment-x");
      expect(flatRowKey({ kind: "loadMore", parent: comment })).toBe(
        "loadMore-x",
      );
      expect(flatRowKey({ kind: "collapsedReplies", comment })).toBe(
        "collapsedReplies-x",
      );
    });

    it("does not collide across kinds for the same id", () => {
      const comment = makeComment({ id: "same" });
      const keys = [
        flatRowKey({ kind: "comment", comment }),
        flatRowKey({ kind: "loadMore", parent: comment }),
        flatRowKey({ kind: "collapsedReplies", comment }),
      ];
      expect(new Set(keys).size).toBe(3);
    });

    it("produces unique, stable keys across a whole flattened tree", () => {
      const root = makePostDetail({
        comments: [
          makeComment({
            id: "a",
            collapsed: true,
            comments: [makeComment({ id: "a1" })],
          }),
          makeComment({ id: "b", loadMoreChildIds: ["x"] }),
        ],
        loadMoreChildIds: ["y"],
      });
      const options = { collapseChildrenOnly: true, passesFilter: allPass };

      const keys1 = flattenCommentTree(root, options).map(flatRowKey);
      const keys2 = flattenCommentTree(root, options).map(flatRowKey);

      // Unique
      expect(new Set(keys1).size).toBe(keys1.length);
      // Stable across repeated flattening of the same tree
      expect(keys2).toEqual(keys1);
    });
  });

  describe("deep nesting", () => {
    it("keeps depth-first order down a 6-level single-child chain", () => {
      // Build g0 -> g1 -> ... -> g5, each the sole child of the previous.
      const depth = 6;
      let node = makeComment({ id: `g${depth - 1}`, depth: depth - 1 });
      for (let level = depth - 2; level >= 0; level--) {
        node = makeComment({
          id: `g${level}`,
          depth: level,
          comments: [node],
        });
      }
      const root = makePostDetail({ comments: [node] });

      expect(describeRows(flattenCommentTree(root, defaultOptions))).toEqual([
        "comment:g0",
        "comment:g1",
        "comment:g2",
        "comment:g3",
        "comment:g4",
        "comment:g5",
      ]);
    });
  });

  describe("performance smoke test", () => {
    it("flattens a ~2000-node wide+deep tree quickly with an exact row count", () => {
      // 36 top-level threads of 56 nodes each (~2000 total), each a 4-level
      // chain that fans out 5 children → sizeable, realistically shaped tree.
      let idCounter = 0;
      const nextId = () => `c${idCounter++}`;

      const topLevel: Comment[] = [];
      for (let t = 0; t < 36; t++) {
        // Each top-level comment has 5 children; each child has 5 grandchildren;
        // each grandchild has 1 great-grandchild → 1 + 5 + 25 + 25 = 56 nodes.
        const children: Comment[] = [];
        for (let c = 0; c < 5; c++) {
          const grandchildren: Comment[] = [];
          for (let g = 0; g < 5; g++) {
            grandchildren.push(
              makeComment({
                id: nextId(),
                depth: 3,
                comments: [makeComment({ id: nextId(), depth: 4 })],
              }),
            );
          }
          children.push(
            makeComment({ id: nextId(), depth: 2, comments: grandchildren }),
          );
        }
        topLevel.push(
          makeComment({ id: nextId(), depth: 1, comments: children }),
        );
      }

      const totalNodes = idCounter;
      expect(totalNodes).toBeGreaterThanOrEqual(2000);

      const root = makePostDetail({ comments: topLevel });

      const start = performance.now();
      const rows = flattenCommentTree(root, defaultOptions);
      const elapsed = performance.now() - start;

      // Every node passes the filter and none are collapsed, so the row count
      // equals the node count exactly (no loadMore/collapsedReplies rows).
      expect(rows).toHaveLength(totalNodes);
      expect(rows.every((row) => row.kind === "comment")).toBe(true);
      expect(elapsed).toBeLessThan(100);
    });
  });
});
