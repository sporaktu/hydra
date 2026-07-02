# Spec: Comment tree virtualization

**Execution order: 4 of 4** — deliberately last: this is the highest-risk change (a rewrite of the app's second-most-important screen) and was split out of the general perf work for exactly that reason. Do not bundle it with other changes.

## Background

`pages/PostDetails.tsx` renders the entire comment tree inside a single plain `ScrollView` (`:307-362`), and `components/RedditDataRepresentations/Post/PostParts/Comments.tsx` recursively `.map`s all children (`:582`). Opening a 2,000-comment thread mounts every comment node at once — the whole-tree mount cost dominates large-thread open time and memory. Each `CommentComponent` memoizes its subtree render (`Comments.tsx:240`, keyed on `comment`, `comment.renderCount`, `theme`, …), which helps re-renders but not initial mount.

There is also a landmine: **scroll-to-next-comment reaches into React internals** — `pages/PostDetails.tsx:224` and `:254` walk `(commentsView.current as any).__internalInstanceHandle.child.child.child.child.memoizedProps[0]` to find comment positions (self-described as "horrific" at `Comments.tsx:66-69`). Any React upgrade can break it silently. Virtualization removes its reason to exist.

## Target design

Flatten the comment tree into a single array and render it with **FlashList v2** (already the feed's list — `components/UI/RedditDataScroller.tsx` shows house style):

- **Flattening:** depth-first traversal of the comment tree → `FlatComment[]` where each entry carries `{ comment, depth, parentId }`. Collapsed comments contribute only their head node (children excluded from the array). The post header/body becomes the list header.
- **Collapse/expand** becomes an array recomputation (remove/insert the children slice), not a subtree re-render. Preserve both settings: `tapToCollapseComment` and `collapseChildrenOnly`, and the collapse-thread-scrolls-to-top-of-thread behavior.
- **Depth indicators:** the colored left-border rails (`theme.commentDepthColors`) currently come from nested wrappers. In the flat model each row draws its own depth rails (N vertical bars for depth N).
- **Scroll-to-next-top-level-comment:** with a flat array this is `scrollToIndex` on the next entry with `depth === 0`. Delete the `__internalInstanceHandle` hack entirely.
- **Load-more / "continue thread" rows** become list items of their own kind, splicing fetched children into the flat array in place.
- **Swipe actions** (`components/UI/Slideable.tsx`) wrap each row as they do today (if `03-interaction-overhaul.md` landed first, that's the rewritten Slideable — either version works row-wise).
- **Pull-to-refresh** on PostDetails must survive the ScrollView→FlashList swap (`PostDetails.tsx:285-295` refresh control, including its tint workaround if still present).

## Preserve exactly (regression checklist)

- Comment HTML rendering (`components/HTML/RenderHTML.tsx`) including code blocks, quotes, spoilers, flair.
- Vote state + swipe/tap voting on comments; long-press menu (`Comments.tsx:203` or its Item-2 replacement from spec 03).
- Collapse behaviors and their two settings; depth colors; "op" and mod/admin badges.
- Deep-link jump to a specific comment (context links) and highlighted-comment state.
- Reply flow, edit flow, and inline new-comment insertion (`comment.renderCount` exists to force re-render on mutation — the flat model should replace this with immutable row identity, e.g. new object per mutated comment).
- Known issue that must not get *worse*: "Upvoting in post details is not reflected on the posts list" (`todo.txt`) — out of scope to fix, in scope to not regress further.

## Risks and mitigations

- **Variable row heights** (comments range from one line to essays with media): FlashList v2 handles dynamic sizing, but test `scrollToIndex` accuracy on long threads — if imprecise, use `viewPosition` correction or estimated-size hints.
- **State migration bugs:** collapse/vote/reply state must live keyed by comment id (not array index) since indices shift on collapse/load-more.
- **Scroll position jumps** when splicing load-more results: use FlashList's `maintainVisibleContentPosition` if needed.

## Acceptance criteria

1. Opening a very large thread (find one with 2,000+ comments, e.g. a megathread) renders the first screen of comments in well under a second on device; memory does not scale with total thread size.
2. Time-to-interactive on large threads measurably better than baseline (record before/after on the same thread).
3. Every item in the regression checklist above verified by hand on a real thread.
4. Scroll-to-next-comment works and no `__internalInstanceHandle` access remains in the codebase (`grep` returns nothing).
5. Collapse/expand of a 500-child thread is instant (no full-list re-render).
6. Small threads (< 50 comments) look and behave identically to before.
