# Hydra — Post Details, Comment Tree, Markdown Rendering, and Composing (Behavioral Spec)

Scope: `pages/PostDetails.tsx`, `app/stack/PostDetailsScreen.tsx`,
`components/RedditDataRepresentations/Post/PostDetailsComponent.tsx`,
`components/RedditDataRepresentations/Post/PostParts/Comments.tsx`,
`components/RedditDataRepresentations/Post/PostParts/flattenComments.ts` (+ its test
file), `components/HTML/RenderHTML.tsx`, `external/snudown.js`,
`components/UI/SelectableText.tsx`, `components/Modals/SelectText.tsx`,
`components/UI/MarkdownEditor.tsx`, `components/UI/TextInput.tsx`,
`components/UI/KeyboardAvoidingScroller.tsx`, `components/Modals/NewComment.tsx`,
`EditComment.tsx`, `NewPost.tsx`, `EditPost.tsx`,
`components/Other/TextWithRepairedHeight.tsx`,
`contexts/SettingsContexts/CommentSettingsContext.tsx`,
`contexts/ScrollToNextButtonContext(.tsx|Provider.tsx)`,
`contexts/PostInteractionContext.tsx`, `db/functions/Drafts.ts`,
`utils/useComponentActions.ts`, `utils/useContextMenu.ts`,
`docs/specs/03-interaction-overhaul.md`, `docs/specs/04-comment-virtualization.md`,
`api/PostDetail.ts`, `api/Flair.ts`, `api/PostFlair.ts`, and the six `documentation/*.md`
guide pages. Also consulted: `components/UI/Slideable.tsx`,
`contexts/SettingsContexts/GesturesContext.tsx`,
`contexts/SettingsContexts/FiltersContext.tsx`, `components/Navbar/SortAndContext.tsx`,
`components/UI/NativeContextMenu.tsx`, `constants/Themes.ts`, `utils/Time.ts`,
`utils/colors.ts`, `todo.txt`.

---

## 1. Screen composition

`app/stack/PostDetailsScreen.tsx` registers `PostDetails` (`pages/PostDetails.tsx`) as a
native-stack screen, `title` set from `RedditURL(url).getPageName()`. `PostDetails` is
also usable inline for split-view/iPad (a `splitViewURL`/`setSplitViewURL` prop variant),
which re-fetches on URL change and, only in split-view mode, blanks `postDetail` to
`undefined` first (full-screen spinner) rather than refreshing in place.

The whole screen is one `FlashList<CommentFlatRow>` (`@shopify/flash-list` v2):
- `ListHeaderComponent` = `PostDetailsComponent` (the post itself — title, media,
  metadata, action bar, "view all comments" banner). Keyed by `postDetail.id` so it
  remounts (resetting local UI state such as `mediaCollapsed`) on a different post.
- Each row is one flattened comment-tree entry (§3).
- `ListEmptyComponent`: a small `ActivityIndicator` while `postDetail !== deferredPostDetail`
  (i.e. the flattened rows are still catching up to a state update via `useDeferredValue`),
  else the text **"No comments"** centered, only if `comments.length === 0`.
- `ListFooterComponent`: a 1px divider line under the last row, shown only if there is
  at least one row.
- `refreshControl`: `ThemedRefreshControl`; pull-to-refresh calls `loadPostDetails()`
  again (full re-fetch of post + first page of comments from Reddit; local UI state such
  as collapse/vote optimism is discarded and replaced by server truth).
- `scrollEnabled={!scrollDisabled}` — disabled while a `Slideable` swipe on any row is
  mid-gesture (shared `ScrollerContext`), so a horizontal comment swipe can't also scroll
  the list vertically.
- `contentContainerStyle={{ paddingBottom: 100 }}`.

### 1.1 Data flow / state shape
`postDetail` (type `PostDetail`, effectively `Comment`-shaped plus post fields) holds the
whole tree in memory; comments nest via `comment.comments: Comment[]`. Mutations
(`changeComment`, `deleteComment`) locate a node by walking `comment.path` (an array of
child-array indices from the root) and merge, bumping a `renderCount` counter on every
ancestor down to the mutated node, then replace the top-level `postDetail` object
(`{ ...oldPostDetail }`) purely so React sees a new identity and the memoized
`flattenCommentTree` recomputes. `renderCount` is also part of `CommentComponent`'s
`useMemo` dependency list, so mutating a comment always forces its row to re-render.

`deferredPostDetail = useDeferredValue(postDetail)` — the flattened row list renders from
the deferred value, so a very large re-flatten (e.g. after voting deep in a huge thread)
doesn't block the vote's own optimistic UI update from painting immediately.

### 1.2 Fetching
`getPostsDetail(url)` (`api/PostDetail.ts`) appends `sr_detail=true&limit=75` (default
page size — override via `options.limit`, no caller in this scope changes it) to the
Reddit URL, fetches, and separately parses `response[0]` (post) and `response[1]`
(comments). A `more`-kind top-level child becomes `postDetail.loadMore = { depth, childIds }`.
Handles Reddit's "gated" (quarantined/age-gated) subreddit interstitial via
`handleGatedSubreddit`; a user cancel returns `undefined` and the screen never populates.

---

## 2. Post header (`PostDetailsComponent`)

Rendered once, above all comment rows, wrapped in a `TouchableOpacity` whose
`onPress` — **only when the `tapToCollapsePost` setting is on** — toggles a local
`mediaCollapsed` boolean that hides `<PostMedia>` (media only; title/metadata stay
visible). When the setting is off the wrapper is inert (`activeOpacity=1`, no `onPress`).

Layout, top to bottom:
1. **Title** — `postDetail.title`, plain `Text`, 20pt.
2. **Media** (`PostMedia`, out of this area's scope) — hidden when collapsed.
3. **Metadata row 1**: optional pushpin icon (AntDesign `pushpin`, `theme.moderator`
   color) if `isStickied`; a subreddit pill (icon + `r/<subreddit>`, bold, tappable →
   pushes `/r/<subreddit>`) — subreddit-name color is always `theme.subtleText` (no
   special color for the post's own subreddit); literal `" by "` text; then
   `u/<author>` (bold, tappable → pushes `/user/<author>`), colored `theme.moderator`
   if `postDetail.isModerator` else `theme.subtleText`. (No OP-color branch here — the
   post header has no concept of "OP" distinct from itself; note this contrasts with
   comments, see §3.3.)
4. **Metadata row 2**: up-arrow icon + `upvotes` count, then `"  •  " + timeSince`
   (e.g. "3 hours ago" — see `Time.prettyTimeSince()`, §9). If `editedAt` is set, a
   pencil icon follows in its own small tap target; tapping shows a native `Alert`:
   title `"Edited {relative time} ago"`, message
   `"Post was edited at {full locale datetime}"`. If `interactionDisabledStatus` is
   truthy (e.g. locked/archived — the exact string comes from the API layer, not this
   file), a `" • "` separator, a lock icon, and the raw status string are appended.
5. **Action bar** (`buttonsBarContainer`, top border divider, fixed 46px height, evenly
   spaced `justify-content: space-between`), in this exact order:
   - **Upvote** (Feather `arrow-up`, 32px) — background pill highlights `theme.upvote`
     when `userVote === UpVote`; icon color `theme.text` when active else
     `theme.iconPrimary`.
   - **Downvote** (Feather `arrow-down`, 32px) — same pattern with `theme.downvote`.
   - **Save/bookmark** (FontAwesome `bookmark` filled vs `bookmark-o` outline,
     28px) — toggles `saved` via `saveItem`; no distinct "active" background tint
     (icon shape alone communicates state, unlike vote buttons).
   - **Reply** (Octicons `reply`, 28px) — opens `NewComment` with `parent = postDetail`,
     UNLESS `interactionDisabledStatus` is set, in which case an `Alert` reading
     `"This post has been {status}"` fires instead and no modal opens. On successful
     submit (`contentSent`), the post list refreshes after a flat 5-second
     `setTimeout` (`loadPostDetails()`), not event-driven.
   - **Share** (Feather `share`, 28px) — `shareURL(RedditURL(url).toString())` (native
     share sheet with the post's canonical link).
   Vote/save calls are optimistic: the local `postDetail` state is patched with the
   server's returned vote direction and a locally recomputed `upvotes` count
   (`upvotes - oldUserVote + newResult`) immediately; there is no separate "undo"
   affordance beyond tapping the same arrow again, which `vote()` turns into
   `VoteOption.NoVote` (comparing requested direction to the *current* `userVote`).
6. **"View all comments" banner** — shown only when the URL's `context` query param is a
   positive number (i.e. this is a comment-permalink/"context" view, not the canonical
   post page): a full-width tappable row, top-bordered, reading **"This is a comment
   thread. Click here to view all comments."** (`theme.iconOrTextButton`), which
   navigates to the canonical `/r/<subreddit>/comments/<id>/` URL (dropping the
   `context`/single-comment framing).

The header's own three-dot "..." context menu is not part of this component — it's
injected into the navigation bar by `PostDetails.tsx` via `SortAndContext` (see §7).

---

## 3. Comment tree data model and flattening (`flattenComments.ts`)

As of the virtualization rewrite (`docs/specs/04-comment-virtualization.md`), the
comment tree is **not** rendered by recursive nested components. Instead
`flattenCommentTree(root, { collapseChildrenOnly, passesFilter })` walks the tree
depth-first and produces a flat `CommentFlatRow[]`, one entry per **visible** row, fed
directly to `FlashList`. Row kinds:

- `{ kind: "comment", comment }` — one real comment (or, conceptually, the root, though
  the root is never emitted as a row here — it's the list header, not a row).
- `{ kind: "loadMore", parent }` — a "N more replies" link for a parent whose
  `loadMore.childIds` is non-empty.
- `{ kind: "collapsedReplies", comment }` — a "N more replies" stub in place of a
  collapsed comment's hidden children (only emitted when `collapseChildrenOnly` is on).

Traversal rules (verified against the test suite,
`PostParts/__tests__/flattenComments.test.ts`, 494 lines, ~20 cases):
1. Each comment row is emitted, THEN (if not filtered out and not collapsed) its
   children recursively, THEN — after all descendants — that comment's own `loadMore`
   row if it has pending child ids. This exactly mirrors the old recursive render order
   (parent, subtree, subtree's trailing "load more").
2. **Filtering** (`doesCommentPassTextFilter`, from `FiltersContext`, driven by the
   global comment/post text-filter setting): a comment failing the filter is dropped
   **along with its entire subtree**, even children that would individually pass —
   there is no "filtered parent, kept child" case.
3. **Collapsed, `collapseChildrenOnly = false`** (the default): only the comment's own
   row is emitted; children and its own `loadMore` row are both suppressed entirely
   (they reappear, recomputed, on expand).
4. **Collapsed, `collapseChildrenOnly = true`**: the comment's row is followed by a
   single `collapsedReplies` stub row IF it has children; no stub if it has none.
   Grandchildren/loadMore are still suppressed either way.
5. Collapsing one comment never affects sibling subtrees.
6. The root's own trailing `loadMore` row (top-level "load more" for the whole thread)
   is emitted last, after every top-level comment and its subtree.
7. Rows are keyed (`flatRowKey`) as `` `comment-${id}` ``, `` `loadMore-${parentId}` ``,
   `` `collapsedReplies-${id}` `` — never by array index, since indices shift on
   collapse/expand/load-more; kinds can't collide even for the same underlying id.
8. Performance: the test suite includes a ~2,000-node synthetic tree (36 top-level
   threads × 56 nodes, mixed depth) and asserts flattening completes in well under
   100ms — this underpins the virtualization rewrite's performance goal (first screen
   of a 2,000+-comment megathread renders in well under a second; memory does not scale
   with total thread size since FlashList only mounts visible rows).

### 3.1 Comment fields relevant to rendering (`api/PostDetail.ts` → `Comment` type)
`id`, `name` (Reddit fullname, used for API calls), `depth` (0 = top-level; the root
`PostDetail` itself has `depth: -1`), `path` (array of indices from the root — used to
locate/mutate a node and to compute the comment's *top-level ancestor* for "collapse
thread"), `collapsed`, `author`, `isOP`, `isModerator` (true only if
`distinguished === "moderator"` — **admin-distinguished comments are NOT specially
colored**, they fall through as ordinary), `isStickied`, `editedAt` (ms epoch or
`undefined`), `upvotes`, `scoreHidden`, `saved`, `userVote`, `flair` (`{emojis, text}`
or `null` — built from `author_flair_richtext`/`author_flair_text`, §3.4), `link`
(permalink), `postTitle`/`postLink`/`subreddit` (for the "displayInList" source box,
§3.5), `text` (raw markdown, HTML-entity-decoded), `html` (Reddit's own rendered HTML,
entity-decoded — this is what actually gets displayed; Hydra does not re-render markdown
to HTML for already-fetched comments, only for the live compose preview, §6),
`renderCount`, `comments` (children), `loadMore`, `after`, `createdAt`, `timeSince`
("N hours ago"), `shortTimeSince` ("Nh").

**AutoModerator auto-collapse**: top-level (`depth === 0`) comments authored by
`AutoModerator` are collapsed by default at fetch time
(`formatComments`) when the `collapseAutoModerator` setting is on (**default: on**).
Nested AutoModerator replies are never auto-collapsed, only top-level ones.

### 3.2 Row layout (`CommentComponent`, single row — no longer recurses)
Depth indentation: `marginLeft: 10 * comment.depth` on the outer touchable (10px per
depth level, unbounded — no max-depth clamp visible). Inside that, a left border
(`borderLeftWidth: 1`, `0` at depth 0) colored by cycling through
`theme.commentDepthColors` — a fixed 6-color "rainbow" palette
(`#e40303, #ff8c00, #e6d600, #008026, #24408e, #732982`) — indexed by
`(depth - 1) % 6` for comment rows (`depth % 6` for `loadMore`/`collapsedReplies`
stub rows, since those represent the *next* depth level down). Every theme in
`constants/Themes.ts` uses this same 6-color array for `commentDepthColors` (not
theme-specific).

If the **right-side vote indicator** setting (`voteIndicator`, default off) is on and
the user has voted, a 1px right border in `theme.upvote`/`theme.downvote` is drawn
instead (0-width otherwise).

**Top bar** (row, 6px gap): 
- Pushpin icon if `isStickied` (same icon/color as the post header).
- Author name, tappable → pushes `/user/<author>`. Color precedence:
  `isOP → theme.iconOrTextButton` (highlighted/link color; no separate "OP" text badge
  is drawn anywhere in this component — the name color alone signals it), else
  `isModerator → theme.moderator`, else `theme.text`. **No distinct "self" (own
  comment) color** — your own comments look like anyone else's except for the
  Edit/Delete menu items becoming available.
- **Vote/score combo button**: a single tappable group (icon + number), NOT two
  separate arrows like the post header. Icon is `arrow-down` if
  `userVote === DownVote`, else always `arrow-up` (even at no-vote) — i.e. the icon
  only flips to indicate an active downvote, otherwise defaults to the up arrow shape.
  Tapping this control **always calls `voteOnComment(UpVote)`** — there is no in-row
  downvote tap target for comments (unlike the post header's two separate buttons);
  downvoting a comment requires the swipe gesture or the long-press/context-menu
  "Downvote" action. Color: `theme.upvote`/`theme.downvote`/`theme.subtleText`
  matching vote state. Score text shows `"-"` instead of the number only when
  `scoreHidden && userVote === NoVote` (once you vote, the locally-known count is
  shown even if Reddit is still hiding the public score).
- Edited pencil icon (if `editedAt`), same Alert pattern as the post header
  ("Comment was edited at …").
- Flair chip — shown only if the `commentFlairs` setting is on (default on) AND the
  comment has a flair: renders each flair emoji image (16×16) followed by the flair
  text (max 1 line, ellipsized); tapping shows a plain `alert()` of the flair text (or
  "No flair text" if the flair has emojis only).
- Trailing, right-aligned: `shortTimeSince` (e.g. "4h").
- `marginBottom` under the top bar is `0` if the comment is collapsed AND
  `collapseChildrenOnly` is off (tightening the row since no body/stub follows),
  else `8`.

**Body**: rendered only if `collapseChildrenOnly || !comment.collapsed` (i.e. hidden
while collapsed unless the "load stub" mode is active, in which case the head comment's
own body still shows — only descendants are hidden) via `<RenderHtml html={comment.html} />`
(§6).

**Saved bookmark notch**: if `comment.saved`, a small CSS-triangle (15×15,
`theme.bookmark` left border, transparent bottom/right) is drawn pinned to the
bottom-right corner of the row — the "small bookmark notch" referenced in
`documentation/saving.md`. (The post header has no notch; its saved state is only the
filled bookmark icon in the action bar.)

### 3.3 `displayInList` mode (reused elsewhere, e.g. a user's/saved comment listing —
**not** used on the PostDetails screen itself, but the same `CommentComponent` renders
it, so noting for completeness): tapping the row always deep-links to
`comment.link?context=10` instead of collapsing; the long-press menu drops
Collapse/Collapse Thread; a bordered "source" box (post title + subreddit, tappable →
`postLink`) is appended below the body; a divider-colored spacer bar follows each row;
top border is removed; body left padding is 10 instead of 15.

### 3.4 Flair formatting (`api/Flair.ts`)
`formatFlair` reads `author_flair_richtext` (an array of `{e: "emoji"|"text", u|t}`
entries — collects all emoji URLs and the (trimmed) text segment) and falls back to
plain `author_flair_text` if there's no richtext text/emoji at all. Returns `null` if
there's nothing to show.

### 3.5 Load-more rows
`LoadMoreCommentsRow`: text is `"Loading..."` while a fetch is in flight (tracked via
FlashList's `useRecyclingState` keyed on `parent.id` so a recycled cell never shows a
stale "Loading..." from a different row), else `` `${childIds.length} more replies` ``.
Tapping fetches **up to 10** child ids at a time
(`parent.loadMore.childIds.slice(0, 10)`), each as its own individual
`GET /r/<sub>/comments/<postId>/comment/<commentId>/.json` request, run in parallel via
`Promise.all` — **not** Reddit's batched `/api/morechildren` endpoint — appended into
the parent's `comments` array and stripped from `loadMore.childIds`. If more than 10
remain, the row persists with the decremented count, requiring repeated taps.

`CollapsedRepliesRow` (the `collapseChildrenOnly` stub): reads
`` `${comment.comments.length} more replies` ``; tapping toggles `collapsed` back to
`false` (expand), bumping `renderCount`.

---

## 4. Collapse / expand behavior

- **Tap-to-collapse** (`tapToCollapseComment` setting, default **on**): tapping
  anywhere on a comment row (when not `displayInList`) toggles `collapsed`. Before
  toggling, if the comment is *currently expanded* (about to collapse), its on-screen Y
  position is measured (`measureInWindow`) and passed to `scrollChange`, which — if that
  Y sits above the list container's top edge — scrolls the list so the tapped comment's
  top lands at the viewport top (keeps the comment you just collapsed from vanishing off
  the top of the screen). No such repositioning happens on expand.
- Toggling `tapToCollapseComment` or `voteIndicator` in Settings shows an
  `alert()`: **"Existing pages may need to be refreshed for this change to take
  effect."** (the other comment settings — `collapseAutoModerator`, `commentFlairs`,
  `showCommentSummary`, `collapseChildrenOnly` — toggle silently, no alert).
- **Collapse Thread** (long-press menu item / swipe action / `collapseThread` prop from
  `PostDetails.tsx`): always force-collapses (not a toggle) the **top-level ancestor**
  of the tapped comment (`comment.path.slice(0, 1)` against the root), regardless of
  which nested reply you invoked it from. If that ancestor's row is currently in the
  flattened list, the list scrolls it to `viewPosition: 0` (pinned to the very top of
  the viewport) before applying the collapse.
- Collapsed state persists per-comment in memory as long as the tree object is alive:
  re-expanding a parent restores whatever collapsed/expanded state its children were
  left in (per `documentation/viewing_comments.md`: "Child comments remember their
  collapsed state when a parent thread is collapsed and re-expanded" — consistent with
  collapse only ever hiding rows from the flattened array, never mutating children).
- `collapseChildrenOnly` setting (default **off**): when on, a collapsed comment with
  children shows a `collapsedReplies` "N more replies" stub instead of fully vanishing
  its subtree from the list; when off (default), collapsing hides everything below with
  no stub at all.

---

## 5. Scroll-to-next/previous top-level comment (floating button)

`ScrollToNextButtonProvider` renders one floating circular button (40×40, AntDesign
`down` chevron) above all screen content (registered via `ScrollToNextButtonContext`,
set once per `PostDetails` mount to call `scrollToNextComment()`/`scrollToNextComment(true)`).

**Navigation logic** (`pages/PostDetails.tsx`, replacing an old approach that walked
React-fiber internals — deliberately deleted per the virtualization spec): from
`firstViewableIndex` (updated on every `onViewableItemsChanged`, tracking the first
currently-viewable row), walk the flat row array forward (or backward) to the next row
where `kind === "comment" && comment.depth === 0`.
- Forward with nothing found: does nothing (no wraparound).
- Backward with nothing found above: scrolls to offset 0 (back up to the post header).

**Touch interaction** (single circular button, no separate "next"/"previous" buttons):
- Quick tap (release within 300ms, no drag) → **next** comment.
- Press and hold ≥300ms without releasing → **previous** comment fires automatically
  at the 300ms mark (does not require release).
- Continuing to hold to ~1000ms (or dragging >30px early) → enters **reposition/drag
  mode**: a dark overlay (`rgba(0,0,0,0.5)`) fades in over the whole screen (above the
  tab bar) showing 10 fixed "locked" target positions (rendered as ringed circles):
  `bottom-right` (default), `top-right`, `bottom-left`, `top-left`, `bottom-center`,
  `top-center`, `left-center`, `right-center`, `left-three-quarters-bottom`,
  `right-three-quarters-bottom`. The button follows the finger; when within
  `BUTTON_SIZE` (40px) of a locked slot it snaps to it. On release: if hovering a slot,
  that position is persisted (MMKV key `scrollToNextButtonPosition`); otherwise the
  button springs back to its last saved position.
- Button opacity dims to 0.7 while held.

---

## 6. Markdown / HTML rendering (`components/HTML/RenderHTML.tsx`)

Reddit itself converts markdown → HTML server-side using its own dialect (nicknamed
"snudown", a customized Sundown/Markdown variant): comments/posts arrive with a
pre-rendered `body_html` field which `api/PostDetail.ts` HTML-entity-decodes
(`html-entities` `decode()`) and stores as `Comment.html`/`PostDetail.html`. That
decoded HTML string is parsed client-side with `htmlparser2`'s `parseDocument` (a full
DOM via `domhandler`) and walked into React Native primitives — **not** a WebView, not
`react-native-render-html`. This is the exact renderer used both for already-posted
content and (via the bundled compiled `external/snudown.js`, §6.9) for the compose-time
live preview, so what you see in Preview matches what Reddit will actually render.

### 6.1 Element handling (by tag / attribute, `Element` component)
- **`p`** → wrapped in `TextWithRepairedHeight` (custom `Text`-like wrapper, §6.2) with
  5px vertical margin — this is the default text-paragraph container.
- **Inline image link special-case**: a `<p>` whose sole child is an `<a>` with a
  single text child and an `href` that `RedditURL.getPageType()` classifies as
  `PageType.IMAGE` is redirected away from plain paragraph rendering into an inline
  `ImageViewer` (`aspectRatio 16/9`, in a 150×200 fixed container, centered) — this is
  how a "raw image URL on its own line" comment renders as an inline image preview
  rather than a blue link.
- **`class="md-spoiler-text"`** (Reddit's own spoiler markup for `>!text!<`) → rendered
  as a tappable `Text`; hidden state shows text colored `theme.tint` on a `theme.tint`
  background (effectively invisible/blocked-out) with 2/5px padding; tapping toggles
  `showSpoiler`, revealing the text in `theme.subtleText` (background block persists —
  it doesn't disappear, just the text becomes legible against it). Per-element local
  state, so each spoiler in a comment toggles independently and resets when the row
  remounts.
- **`header` attribute present** (a Reddit markup quirk distinct from `h1`/`h2`/`h3`
  tags) → `Text`, fontSize 24, margin-top 10 / bottom 4.
- **`div`** → `View`, 5px vertical margin.
- **`pre`** (code block) → horizontally-scrolling `ScrollView` (no vertical scroll),
  padding 10, background `theme.tint`; content wrapped in a `View` with
  `onStartShouldSetResponder` so touches inside don't get eaten by outer touchables.
- **`hr`** → `View` with a 1px bottom border (`theme.tint`), 8px vertical margin.
- **`h1`/`h2`/`h3`** → plain `View` (not `Text`!) carrying `fontSize`/`lineHeight` of
  32/24/20 (line-height = `floor(fontSize * 1.3)`) onto `inheritedStyles`, which its
  text-node descendants pick up.
- **`blockquote`** → `View`, background `theme.tint`, left border 2px
  `theme.subtleText`, 5/8px margin/padding-left, 2px vertical margin — a shaded,
  left-ruled block (no nested-indent stacking logic beyond the single border/background,
  so deeply nested quotes just re-apply the same single-level styling at each level).
- **`span`** → `Text`, 5px vertical margin (rarely semantically meaningful beyond
  inheriting text styles).
- **`table`** → horizontally-scrolling `ScrollView` (`maxWidth: 100%`, 5px vertical
  margin); **`thead`** → `View` column-flex + bold inherited font weight; **`tbody`** →
  `View` column-flex; **`tr`** → `View` row-flex; **`th`/`td`** → `View`,
  1px `theme.tint` border, 2px padding; column width = `(screenWidth - 30) / siblingCount`
  if fewer than 4 sibling cells, else a fixed 100px (so wide tables scroll rather than
  squeeze below ~100px/column).
- **`strong`** → `Text`, bold.
- **`del`** (strikethrough) → `Text`, `textDecorationLine: line-through` (solid style).
- **`code`** (inline) → `Text`, monospace (`Courier New` on iOS, `monospace` elsewhere),
  background `theme.tint`.
- **`sup`** (superscript) → `View` (not baseline-shifted text — just rendered smaller,
  fontSize 11, no vertical offset applied), zero margin/padding — Reddit's
  superscript therefore renders as merely-smaller inline-ish text, not true
  superscript baseline positioning.
- **`a[href*="giphy.com"]`** → intercepted entirely: the link is never followed; the
  5th path segment of the URL is read as a Giphy id and rendered inline as
  `https://i.giphy.com/<id>.webp` via `ImageViewer` (same 16:9 inline treatment as
  image links).
- **`a` wrapping only text** → `Text`, colored `theme.iconOrTextButton`; `onPress`
  parses `href` via `RedditURL`. If it resolves to a known page type, or is a
  shortened link (`redd.it/<id>`, `/s/<id>` — these only get a page type once
  `pushURL` resolves them asynchronously, so they're treated as navigable even though
  `getPageType()` alone reports `UNKNOWN`), the app navigates in-app (`pushURL`).
  Otherwise it throws and falls into a `catch`: strips stray `%5C` escape sequences
  from the URL (worked around because Reddit's own markdown→HTML link autodetection is
  known-broken for URLs containing underscores — see the inline code comment linking
  to r/test and r/HydraClient bug reports) and opens it as an **external** link via
  `openExternalLink()`.
- **`a` wrapping an `<img>`** → rendered as an essentially empty `View`
  (`minWidth: 100%`, no visible content) — effectively suppressed, since Reddit already
  emits the actual visible image via a bare `<img>` tag elsewhere in the same HTML.
- **`em`** → `Text`, italic.
- **`ol`/`ul`** → plain `View` (no special indent container beyond each `<li>`'s own
  indent).
- **`li`** → a row: a small bullet column (`"• "` for `ul`, `` `${index+1}. ` `` for
  `ol`, where `index` is the DOM child-array position, not any explicit `start`/`value`
  attribute) + a flexed children column. **Known bug** (`todo.txt`): nested lists
  render improperly, since a nested `<ol>/<ul>` re-numbers/re-bullets from its own
  local `index` without inheriting any outer-list numbering context.
- **bare `img`** → `View` wrapping an `ImageViewer` (150×200 container, 16:9) plus
  `props.children` (rare — usually empty) below it; 10px vertical margin, centered text
  alignment on the wrapper.

Between-tag whitespace text nodes (literal `"\n"`/`"\n\n"`) are filtered out of every
element's children before rendering, so Reddit's HTML never introduces stray blank
lines. (A *lone* `"\n"`/`"\n\n"` **text node** rendered directly, outside any filtered
parent — only reachable from the in-app Settings "Guide" pages, not real
comment/post HTML — instead renders as a 10px-tall spacer `View`; the inline comment
notes this path is effectively dead for real Reddit content since those newlines are
stripped ahead of time.)

### 6.2 `TextWithRepairedHeight`
A `<p>`-substitute `Text` wrapper working around what the author describes as an Apple
text-rendering bug: it measures its own laid-out height on first `onLayout`, and if
that height isn't an integer pixel value, re-renders once with `Math.round(height) + 1`
forced as an explicit `height` style (to stop the last line of text being clipped).
Applied once per paragraph, permanently locked after the first correction
(`heightFixed` ref).

### 6.3 Custom Hydra theme import chips
A text node can contain a hidden payload (`CUSTOM_THEME_IMPORT_PREFIX` + JSON) that lets
a user embed/share a Hydra color theme inside a comment/post body. `extractThemeFromText`
strips this payload out of the rendered text and instead renders a `<ThemeImport>` chip
per embedded theme (a Hydra-specific extension, not standard Reddit markdown/HTML —
these blocks exist only because Hydra's own `MarkdownEditor` "Attach Theme" button
inserts them, §7.2).

### 6.4 Emoji / "giant emoji" issue
Known, unresolved bug (`todo.txt`: "Giant emoji in comments"): comment bodies consisting
mostly/only of emoji glyphs render oversized. Nothing in `RenderHTML.tsx` applies any
emoji-specific font-size clamp — this is presumed to be the OS default text renderer
scaling standalone emoji-run text much larger than mixed text, uncompensated. Not an
intentional design; a faithful rewrite should decide whether to reproduce this bug or
normalize emoji to body text size.

### 6.5 Reddit-specific links (`/r/...`, `/u/...`)
Not special-cased inside `RenderHTML.tsx` itself beyond the generic `RedditURL` /
`pushURL` link-tap logic above — subreddit and user mentions written as markdown links
by the comment author resolve through the same `RedditURL.getPageType()` path as any
other link and, if recognized, navigate in-app.

### 6.6 Images inside comments
Two paths produce an inline preview (never a bare unclickable image): (a) a `<p><a>`
whose link resolves to `PageType.IMAGE` (§6.1), and (b) a literal `<img>` tag. Both use
the same `ImageViewer` component at a fixed 150×200 container / 16:9 aspect (full
tap-to-expand/zoom/save behavior lives inside `ImageViewer`, which is outside this
area's file list — treat as a cross-reference to the media-viewer survey).

### 6.7 Code blocks vs inline code
Block code (`<pre>`) gets its own horizontally-scrollable, `theme.tint`-backgrounded
box; inline `<code>` is just monospace `Text` on a `theme.tint` background run inline
within its paragraph — no syntax highlighting either way.

### 6.8 Tables
Full markdown table support (`table`/`thead`/`tbody`/`tr`/`th`/`td`) with horizontal
scroll for overflow and a column-count-based width heuristic (screen-width-derived for
≤3 columns, fixed 100px per column at 4+) — see §6.1 for the exact formula.

### 6.9 `external/snudown.js` — the live-preview renderer
A ~62KB single-line, minified/compiled (Emscripten/asm.js-style WASM-in-JS) build of
Reddit's own "snudown" markdown compiler, exposing a `markdown(text): string` function
that produces the same HTML shape Reddit's servers would return for that markdown
source. It is imported (`import * as Snudown from "../../external/snudown"`) only by
the four compose/edit modals (`NewComment`, `EditComment`, `NewPost`, `EditPost`) and by
two other out-of-scope composers (`NewMessage`, `ReplyToMessage`) plus the Settings
Guide page — never used to render already-fetched comments (those already carry
server-rendered `html`). Every call site immediately does
`.replaceAll(/>\s+</g, "><")` on the output before feeding it to `RenderHtml`, to strip
inter-tag whitespace snudown emits that Reddit's own API-served HTML apparently doesn't
(or handles differently), avoiding stray blank-line artifacts in the live preview. Given
the binary/minified nature of this module, its exact supported extension set could not
be read directly from source in this survey; behaviorally, based on the editor toolbar
and the `posting.md`/`commenting.md` guide pages plus the tag set `RenderHTML.tsx`
knows how to render, the supported constructs are: bold, italic, strikethrough, links,
images (bare/linked), spoilers (`>!text!<`), block quotes (incl. multi-line via the
toolbar), headers (typed manually, not via toolbar), ordered/unordered lists (incl.
nesting, though nested lists have the numbering bug above), horizontal rules, inline
and block code, tables, and superscript — this matches Reddit's standard "snudown"
markdown dialect (a CommonMark-adjacent but Reddit-specific superset, not GitHub-Flavored
Markdown).

---

## 7. Long-press / context menu on comments

`CommentComponent` builds one ordered `commentMenuOptions` array, used identically for
both platforms (only the *trigger mechanism* differs):

1. **Upvote**
2. **Downvote**
3. **Collapse** / **Expand** (label flips on current state) — omitted entirely when
   `displayInList`.
4. **Collapse Thread** — omitted when `displayInList`.
5. **Copy Text** — `Clipboard.setStringAsync(comment.text)` (raw markdown source, not
   rendered HTML; no confirmation toast in this code).
6. **Select Text** — opens the `SelectText` modal (§8) with `comment.text`.
7. **Reply** — opens `NewComment` with `parent = comment`, gated by
   `interactionDisabledStatus` exactly as the post-level reply button is; on
   `contentSent`, reloads just this one comment via `reloadComment` after a flat 5s
   delay and re-merges it in place (rather than refetching the whole tree).
8. **Save** / **Unsave** (label flips on `comment.saved`).
9. **Edit**, **Delete** — appended ONLY if `currentUser.userName === comment.author`.
   Delete is `destructive: true` and, on the action-sheet path, requires an additional
   native confirm (`Alert.alert("Delete Comment", "Are you sure...", [Cancel, Delete])`)
   before calling `deleteUserContent` + removing the node locally.
10. **Share** — `shareURL(RedditURL(comment.link).toString())`.

**No "Report" and no "Block user" item exists in the per-comment menu** (contrast with
the post/subreddit-level three-dot menu, §7.2, which does have "Report" — but that one
reports the *page*, not a specific comment/author, and there's no per-comment "Block"
anywhere in this file). There is also no explicit "View Parent Thread"/"Jump to parent"
menu item; the closest equivalent inside `displayInList` mode is that tapping the row
itself deep-links to the comment's permalink with `context=10`.

**Trigger mechanism**: on iOS, the whole row is wrapped in `NativeContextMenu` (Zeego) —
a true UIKit press-and-hold context menu (no preview image for comments, per
`docs/specs/03-interaction-overhaul.md`'s explicit requirement) built directly from the
same `commentMenuOptions` list; `onLongPress` on the underlying `TouchableHighlight` is
left `undefined` on iOS so the two mechanisms don't fight. On Android,
`onLongPress={showCommentOptions}` opens an `@expo/react-native-action-sheet` sheet
(same option labels + an appended "Cancel"), via the shared `utils/useContextMenu.ts`
helper (fires `hapticSelection()` on open).

### 7.1 Documentation vs. code discrepancy
`documentation/commenting.md` lists the long-press menu as "Upvote, Downvote, Collapse,
Collapse Thread, Select Text, Reply, Save, Share" — it omits **Copy Text**, which is
present in code between Downvote/Collapse-family and Select Text.

### 7.2 Post/page-level three-dot menu (`SortAndContext`, injected as `headerRight`)
Computed once per fetch in `PostDetails.tsx`'s `loadPostDetails()`:
`["Edit"]` (only if current user authored the post AND it has text, i.e. a self-post),
`["Delete"]` (only if current user authored it), then always `"Report"`,
`"Select Text"`, `"Share"`. Handling for this shared component
(`components/Navbar/SortAndContext.tsx`) includes many more `ContextTypes` used by other
pages (Subscribe, Block, Message, Sidebar, Wiki, etc.) — for PostDetails specifically
only the five above are ever passed in. Notably:
- **Report** always navigates to a generic `hydra://webview/?url=https://www.reddit.com/report`
  — it is not wired to the specific post/comment id in this code path.
- **Select Text** here uses `pageData.text` (the *post's* raw markdown), only when
  `pageData.type === "postDetail"`.
- **Edit** opens `EditPost`; **Delete** confirms via `deleteUserContent` then
  `navigation.goBack()`.
The same header also renders the **sort button** (see §9).

---

## 8. Swipe gestures on comments (`Slideable.tsx` + `GesturesContext`)

Each comment row (when `comment.depth >= 0`, i.e. always for real comments — the
`displayInList` guard is separate) is wrapped in a `Slideable`, one shared component also
used for posts (`docs/specs/03-interaction-overhaul.md` Item 1 rewrote it onto
`Gesture.Pan()` + Reanimated so tracking runs entirely on the UI thread). Available
action set for comments (`COMMENT_SWIPE_OPTIONS`): **Upvote, Downvote, Reply, Bookmark,
Share, Collapse, Collapse Thread, Disabled**. Seven real actions map onto four
configurable directions (each direction can independently be set to any action or
`Disabled`):

| Setting key (`commentSwipeOptions`) | Slideable prop | Default | Triggering gesture |
|---|---|---|---|
| `right` | `shortLeftName` | Upvote | drag finger right, short (≥75px, <130px) |
| `farRight` | `longLeftName` | Downvote | drag right, long (≥130px) |
| `left` | `shortRightName` | Reply | drag finger left, short |
| `farLeft` | `longRightName` | Bookmark | drag left, long |

(The naming is intentionally cross-wired: dragging the comment content to the right
reveals an icon panel on the visual *left* of the screen, hence "right" swipe-direction
settings map to Slideable's "*Left*Name" props, and vice versa.)

- Thresholds: `SHORT_SWIPE_THRESHOLD = 75px`, `LONG_SWIPE_THRESHOLD = 130px` of
  horizontal `translationX`. Crossing into a new "band" (0/±1/±2) triggers a light
  haptic (`hapticEngage`) and swaps the revealed icon/background instantly.
- Pan gesture activates only on mostly-horizontal movement
  (`activeOffsetX([-20,20])` by default per row — comments pass `xScrollToEngage={15}`
  so the horizontal-activation threshold is 15px, tighter than the 20px default used
  elsewhere) and fails on >10px vertical movement, so vertical list scroll isn't
  hijacked.
- **`swipeAnywhereToNavigate` interaction**: when this global setting is on, rightward
  drags are clamped to 0 (`Math.min(translationX, 0)`), so only the two **left**-swipe
  actions (`left`/`farLeft` — Reply/Bookmark by default) remain reachable; this leaves
  room for the OS edge-swipe-back gesture to claim rightward drags, matching
  `documentation/gestures.md`.
- On release past a threshold, the corresponding action's `action()` fires (vote,
  reply-modal open, save toggle, share, collapse toggle, or force-collapse-thread); the
  row then springs back to `translateX: 0` via `withSpring` (damping 100, stiffness
  300, `overshootClamping: true`).
- Each action's icon/color while revealed: Upvote (Feather `arrow-up`, `theme.upvote`),
  Downvote (Feather `arrow-down`, `theme.downvote`), Reply (Octicons `reply`,
  `theme.reply`), Bookmark (FontAwesome `bookmark`/`bookmark-o` reflecting current saved
  state, `theme.bookmark`), Share (FontAwesome `share`, `theme.share`), Collapse
  (Ionicons `chevron-expand`/`chevron-collapse` reflecting current collapsed state,
  `theme.collapse`), Collapse Thread (MaterialCommunityIcons `arrow-collapse-all`,
  `theme.collapse`).

Posts use the same `Slideable` component with a parallel, distinct
`POST_SWIPE_OPTIONS` set (Upvote/Downvote/Mark-as-Read/Bookmark/Share; defaults
Short-Right=Upvote, Long-Right=Downvote, Short-Left=Mark-as-Read, Long-Left=Bookmark) —
out of this area's direct scope (`PostDetailsComponent`'s header is not itself
swipeable; only individual comment rows are), but documented here since
`GesturesContext` is shared. **Setting a swipe direction to an action already assigned
elsewhere swaps the two** (`getKeyToSwitchWith` in `GesturesContext`) rather than
allowing duplicate assignments — except `Disabled`, which can be set on multiple
directions simultaneously.

---

## 9. Comment sorting

The sort button in the nav bar (`SortAndContext`, shared with feed pages) opens an
action sheet. For `PostDetails.tsx` specifically the options list is hard-coded as
**Best, New, Top, Controversial, Old, Q&A** (no "Default", "Hot", "Rising",
"Relevance", or "Comment Count" — those are feed-sort-only options defined in the
shared `SortTypes` union but not passed in here). *Note*: this contradicts
`documentation/viewing_comments.md`, which additionally lists "Default" as an available
comment sort — see Open Questions.

Selecting **Top** opens a second-level action sheet (Hour/Day/Week/Month/Year/All) for
the time range, same UX as a post-feed Top sort. `changeSort()` rewrites the current
URL's `sort`/`t` query params (`setParams`) — no explicit re-fetch call is visible here;
the URL change presumably drives `PostDetails`' `useEffect([url])` to refetch (worth
confirming against the URL/navigation subsystem, out of this file's direct scope).

**Per-subreddit sort memory**: if the `REMEMBER_COMMENT_SUBREDDIT_SORT_KEY` boolean
setting is on, every sort change on a post-details page persists the chosen sort
(lower-cased) to `KeyStore` under a subreddit-scoped key
(`makeCommentSubredditSortKey(subreddit)`). The code that *reads* this stored value to
seed a new post-details URL's default sort was not in this survey's file list — flagged
as an open question (§ Open Questions). The equivalent post-list-sort memory
(`REMEMBER_POST_SUBREDDIT_SORT_KEY`) is a separate, independently-toggleable setting.

---

## 10. Text selection (`SelectableText` / `SelectText` modal)

`SelectText` renders a bottom-anchored panel (absolute-positioned, 65% of screen
height, 30px rounded top corners, 3px border, `theme.tint` background) sliding up over
a full-screen semi-transparent black scrim (`opacity: 0.7`); tapping the scrim
(`onTouchStart`) dismisses (`setModal(null)`). Triggered from: a comment's long-press
menu "Select Text" (raw `comment.text`), the post-level three-dot menu's "Select Text"
(raw post `text`).

`SelectableText` platform-branches:
- **iOS**: a read-only (`readOnly`), multiline, `selectTextOnFocus` native `TextInput`
  — gives the real iOS text-selection UI (drag handles, magnifier, system copy/lookup
  menu, Live Text-style actions) "for free" since it's a genuine editable-looking text
  field just locked to read-only.
- **Android**: a plain `Text` with `selectable={true}`.

No custom copy button is drawn in `SelectText` itself — copying relies entirely on the
OS-native text-selection menu inside the `TextInput`/`Text`.

---

## 11. Composing: shared architecture

All four editors (`NewComment`, `EditComment`, `NewPost`, `EditPost`) share the same
outer shell: an absolutely-positioned full-screen overlay
(`position: absolute; top/bottom/left/right: 0; zIndex: 1`) → `SafeAreaView` →
`KeyboardAvoidingView behavior="padding"` → top bar (Cancel / title / Post-or-Save) →
`ScrollView contentContainerStyle={{flexGrow:1}} keyboardShouldPersistTaps="handled"`
containing a `MarkdownEditor`, a two-tab strip, and a live-rendered preview pane. This
is a distinct, simpler keyboard-avoidance mechanism than `KeyboardAvoidingScroller`
(§11.4) — these modals do NOT use that component or the custom `components/UI/TextInput.tsx`
wrapper; `MarkdownEditor`'s internal field is a raw RN `TextInput`.

**Cancel** always closes the modal immediately (`setModal(undefined)`) with **no
"discard changes?" confirmation of any kind**, even with unsaved edits (new-comment/new-post
drafts survive via the draft DB, §11.3; but in-progress *edits* to existing content have
no persistence at all and are silently lost on Cancel).

**Submit** button shows a small `ActivityIndicator` in place of itself while
`isSubmitting` (visually disabling it; Cancel remains tappable throughout, and tapping
it while a submit is in flight abandons the UI wait without cancelling the underlying
network call). On failure: `Alert.alert("Failed to {action}")` and `isSubmitting`
resets for retry. On success: modal closes and a `contentSent` callback fires.

### 11.1 `MarkdownEditor` (shared editor + toolbar)
A single multiline `TextInput` (`scrollEnabled={false}`, `minHeight: 100`, autofocus)
bound to `text`/`setText`; `onSelectionChange` tracks the current selection range into a
**ref** (not state — no re-render per keystroke of cursor movement). Below it, a
horizontal toolbar of icon buttons, each operating on the last-tracked selection range:

- **Link** (AntDesign `link`) — `Alert.prompt("URL", …)` (an iOS-only native prompt API)
  asks for a URL, then inserts `[selectedText](url)` (selectedText empty if nothing was
  selected, yielding `[](url)`).
- **Bold** (FontAwesome `bold`) — wraps selection in `**...**`.
- **Italic** (FontAwesome `italic`) — wraps in `*...*`.
- **Quote** (Entypo `quote`) — three behaviors depending on state:
  1. Editor text is completely empty → sets the whole text to literally `"> "`.
  2. There's text but the cursor selection is collapsed (nothing selected) → walks
     backward from the cursor to find the nearest preceding `"\n"` and inserts `"> "`
     right after it (i.e. quotes the start of the *current line*). **Edge case**: if
     the cursor is on the very first line (no preceding `"\n"` found), the backward
     loop never fires and nothing happens.
  3. There IS a selection → splits the selected text on `"\n"` and prefixes **every**
     resulting line with `"> "`, rejoining with `"\n"` (multi-line block-quoting).
- **Strikethrough** (FontAwesome `strikethrough`) — wraps in `~~...~~`.
- **Spoiler** (FontAwesome `eye-slash`) — wraps in `>!...!<`.
- **Attach Theme** (FontAwesome `paint-brush`) — shown only when the caller passes
  `showCustomThemeOption={true}` (computed per-call from
  `RedditURL(...).supportsSharingThemes()`, i.e. gated to certain
  posts/subreddits/threads). Opens a full-screen modal listing the user's saved custom
  Hydra themes (`ThemeList`, filtered to custom-only); selecting one shows a confirm
  `Alert` ("Do you want to attach the "{name}" theme to your text?", Cancel/Attach);
  Attach inserts a newline-wrapped JSON theme-import token (§6.3) at the current
  selection.

**No image-upload, table, header, or code-block toolbar buttons exist** — those
constructs must be typed as raw markdown by hand (consistent with
`documentation/posting.md`: "You can also type Markdown syntax directly, including
headers, lists, and code blocks."). Image upload as a first-class action exists only in
`NewPost`'s dedicated Image-post flow (§11.5), not as an inline-attachment button inside
any markdown body editor.

### 11.2 Preview tabs
- `NewComment`: **Parent** / **Preview** tabs. "Parent" shown only if the thing being
  replied to has a non-empty `.html` (`parentViewAvailable`); default tab is "Parent" if
  available else falls back straight to "Preview". "Parent" renders the *raw text* of
  what you're replying to via `SelectableText` (selectable, not markdown-rendered).
  "Preview" renders `Snudown.markdown(text)` through `RenderHtml` live, recomputed on
  every render (no debounce) as you type.
- `EditComment` / `EditPost`: **Preview** (default) / **Old Version** tabs. "Old
  Version" shows the original (pre-edit) raw text via `SelectableText`.
- `NewPost` (text-post kind only): no tab strip at all — a static "Preview" label header
  sits above an always-rendered live preview pane (there's nothing to show a "Parent"
  for when creating a fresh post).
- Selected tab is indicated purely by a border-color swap (`theme.iconOrTextButton` vs
  `theme.tint`) on an individually-styled `Touchable` pair — not a real segmented
  control widget.

### 11.3 Drafts (`db/functions/Drafts.ts`, `useDraftState`)
Backed by a SQLite table (`Drafts`, via Drizzle) with an upsert-on-every-keystroke write
(`onConflictDoUpdate`), no debounce visible.
- **New comment**: one key per parent id — `` `newCommentDraft-${parent.id}` `` — so
  replying to the *same* comment/post again always restores exactly what was left.
- **New post**: two independent keys per subreddit —
  `` `newPostDraft-title-${subreddit}` `` and `` `newPostDraft-text-${subreddit}` `` —
  so only **one** post draft exists per subreddit at a time (starting a second draft in
  the same subreddit silently overwrites the first). Switching the post-type pill
  (Text/Link/Image) does **not** clear the shared `text` field — e.g. switching from
  Link back to Text would show the URL string sitting in the body editor, a latent
  state-mixing quirk.
- **Edit flows do not use drafts at all** — `EditComment`/`EditPost` seed local
  `useState(edit.text)` directly from the existing content and never persist
  in-progress changes; leaving/returning to the edit modal, or backgrounding the app,
  loses unsaved edits with no warning.
- Drafts are read once at mount (`getDraft(key) ?? ""`) and cleared **only** on a
  successful submit (`clearTextDraft()`/`clearTitleDraft()`); a failed submit
  intentionally leaves the draft intact.
- `maintainDrafts()` caps total stored drafts at 100 rows globally, deleting the oldest
  by creation order once exceeded (called from elsewhere as periodic maintenance, not
  wired to every keystroke in these files).
- Guide-page copy (`documentation/commenting.md`/`posting.md`) matches this: drafts
  "autosave as you type," are "restored the next time you reply to the same comment or
  post" / "create a post in the same subreddit," and are "cleared once … successfully
  submitted."

### 11.4 `KeyboardAvoidingScroller` / `components/UI/TextInput.tsx`
A separate, more elaborate keyboard-avoidance pair (a `ScrollView` context provider that
tracks the currently-focused custom `TextInput`, measures its on-screen position once
the keyboard's height is known via `keyboardWillShow`/`keyboardDidShow`, and manually
`scrollTo`s so the field clears the keyboard by a fixed 100px offset). **Not used by any
of the four compose/edit modals in this area** — they rely on plain `KeyboardAvoidingView
behavior="padding"` instead. This scroller/wrapper pair appears intended for other forms
elsewhere in the app (not identified in this survey's scope).

### 11.5 `NewPost` specifics
- **Post types**: three equal-width pill buttons — Text Post / Link Post / Image Post
  (`self`/`link`/`image`); default `self`. The shared `text` draft field is reused
  across all three kinds (no per-kind clearing on switch, see §11.3 quirk).
- **Title**: single always-visible `TextInput`, no character-count/length enforcement
  visible client-side, draft-persisted per subreddit.
- **Flair button**: rendered next to the title field only if
  `useAllowedPostFlairs(subreddit)` returns at least one non-mod-only flair
  (`api/PostFlair.ts` filters out `modOnly` flairs entirely from the hook's result — a
  mod-only flair can never be selected through this UI at all, not even shown then
  disabled). Tapping opens an action-sheet-style menu: "No Flair" + each flair's text.
- **Text-post body**: `MarkdownEditor` + live preview, exactly as comments.
- **Link-post body**: single-line URL `TextInput`
  (`autoCapitalize="none" autoCorrect={false} autoComplete="off"`), no client-side
  URL-shape validation before submit.
- **Image-post body**: "Select Image" button → `expo-image-picker` media-library
  permission flow (denied + can't-ask-again → settings-redirect alert; denied but
  askable → inline permission request) → `launchImageLibraryAsync({ quality: 0.9999 })`
  (deliberately maximal quality to force iOS to transcode HEIC into JPEG) → single image
  only, **no multi-select, no in-app cropping**. On successful `uploadImage`, the
  returned remote URL is written directly into the shared `text` field (doubling as the
  post's submission payload) and a local on-device preview `<Image>` (the picked asset's
  local URI, not the uploaded remote one) is shown beneath the button. No explicit
  "remove image" control — tapping "Select Image" again just re-runs the whole flow.
- **No client-side required-field validation** (no "Title is required" check, etc.) —
  submission always calls `submitPost` and relies on Reddit's API error response.
- **Captcha fallback**: a `BAD_CAPTCHA` error from Reddit triggers an `Alert` offering to
  retry inside an embedded `react-native-webview` pointed at
  `https://new.reddit.com/r/<subreddit>/submit/?type=<kind>` (shared cookies), which
  fully replaces the modal body (`submitThroughBrowser` state; the top-bar Post button
  disappears, only Cancel remains, since submission then happens inside the web view
  outside Hydra's control). For a text post specifically, Hydra also copies the post
  body to the clipboard and alerts the user, since the web view's own form starts empty.
- **Other errors**: a structured `[code, message]` error array becomes a `ParseableError`
  shown via `Alert.alert("Failed to submit post", e.message)`; any other shape falls
  into a generic `"Unknown error"` alert **and also re-throws** the error (so it likely
  surfaces as an unhandled exception/crash log upstream in addition to the alert).

### 11.6 `EditPost` / `EditComment` differences from New*
No title/flair/type/URL editing UI at all — Reddit doesn't allow changing those after
posting (`documentation/posting.md`: "Only the body text can be edited — titles, links,
and images cannot be changed after posting. This is a Reddit restriction."). Submit
button reads **"Save"** rather than "Post". Tabs are Preview/Old-Version rather than
Preview/Parent. No draft persistence (§11.3). Otherwise identical shell, toolbar, and
preview mechanics to `NewComment`/`NewPost`.

---

## 12. Virtualization / performance characteristics

- Renderer: `@shopify/flash-list` v2 over the flattened row array (§3), replacing a
  prior plain `ScrollView` + fully-recursive `.map()` render that mounted the entire
  tree at once and reached into React-fiber internals
  (`__internalInstanceHandle.child.child.child.child.memoizedProps[0]`) for scroll
  positioning — that hack is fully removed as of this rewrite.
- Collapse/expand is an **array recomputation** (rows spliced out/in), not a
  component-level unmount/remount of a subtree — collapsing a 500-child thread does not
  trigger a full-list re-render (acceptance criterion in `04-comment-virtualization.md`).
- Initial fetch page size: `limit=75` (default; overridable via `getPostsDetail`'s
  `options.limit`, no caller in this scope changes it).
- "Load more" batches 10 child ids per tap, each a separate individual API call (not
  batched server-side) run in parallel (§3.5) — so a "500 more replies" stub still
  requires 50 taps.
- `CommentComponent`'s row render is `useMemo`'d on
  `[isFiltered, commentFlairs, comment.collapsed, comment, comment.renderCount, theme]`
  — a mutation must bump `renderCount` (or replace the `comment`/`theme` object
  identity) to force a re-render; this is a known-intentional-but-imperfect state model
  the spec doc flags for eventual replacement by pure immutable-object identity.
- `useRecyclingState` is used specifically in `LoadMoreCommentsRow` to prevent a
  recycled FlashList cell from showing a stale "Loading..." belonging to a different
  parent comment.
- Target/acceptance bar (per the spec, not independently verified in this survey):
  first screen of a 2,000+-comment megathread renders in well under a second; memory
  does not scale with total thread size; small threads (<50 comments) behave/look
  identically to the pre-virtualization implementation.

---

## 13. Deep link into a specific comment / permalink ("context") mode

Opening a post URL that carries a numeric `context` query parameter (a Reddit
comment-permalink convention) is detected in `PostDetailsComponent` via
`contextDepth = Number(RedditURL(url).getQueryParam("context") ?? 0)`. When
`contextDepth > 0`, a banner appears below the action bar (§2, item 6) offering to jump
to the canonical, un-scoped post URL. **No other special "context mode" behavior** (e.g.
a highlighted/scrolled-to target comment, dimmed siblings, a distinct "parent comment"
breadcrumb) was found in the files surveyed — the actual scoping/single-thread behavior
presumably comes entirely from what Reddit's API returns for that URL (i.e., the server
already returns only the relevant comment + its ancestors), with Hydra adding no client-
side highlight logic of its own in this area. Flagged as an open question.

---

## 14. Pull-to-refresh

`ThemedRefreshControl` wraps `FlashList`'s `refreshControl`; `onRefresh` re-invokes
`loadPostDetails()`, which performs a full re-fetch of the post + first comment page
from Reddit — this **replaces** the entire in-memory tree, so any local-only state
(collapse toggles, optimistic votes not yet reflected server-side, loaded "more replies"
batches) is reset to whatever the server returns fresh. In split-view mode specifically,
`postDetail` is set to `undefined` first (full spinner) rather than refreshing in place.

---

## 15. Settings inventory (this survey's area)

### `CommentSettingsContext` (`contexts/SettingsContexts/CommentSettingsContext.tsx`)
| Key (MMKV) | Type | Default | Effect |
|---|---|---|---|
| `voteIndicator` | bool | `false` | Adds a 1px colored right-edge border on comments the user has voted on; shows a "refresh pages" alert when toggled. |
| `collapseAutoModerator` | bool | `true` | Top-level AutoModerator comments start collapsed. |
| `commentFlairs` | bool | `true` | Shows the author-flair chip on comment rows. |
| `showCommentSummary` | bool | `true` | Pro "AI-generated summary" feature per docs; **no consuming UI found anywhere else in the codebase during this survey** — flagged as an open question (possibly unimplemented, server-driven, or out of this survey's file list). |
| `tapToCollapseComment` | bool | `true` | Tapping a comment row toggles its collapsed state; shows a "refresh pages" alert when toggled. |
| `collapseChildrenOnly` | bool | `false` | Collapsing a comment shows an "N more replies" stub instead of fully hiding the subtree with no trace. |

### `GesturesContext` (relevant subset)
| Key | Type | Default | Effect |
|---|---|---|---|
| `swipeAnywhereToNavigate` | bool | `false` | Disables all rightward swipe actions app-wide (posts + comments) so the OS edge-back gesture always wins. |
| `commentSwipeOptions.right` | enum | `upvote` | Short rightward swipe action. |
| `commentSwipeOptions.farRight` | enum | `downvote` | Long rightward swipe action. |
| `commentSwipeOptions.left` | enum | `reply` | Short leftward swipe action. |
| `commentSwipeOptions.farLeft` | enum | `bookmark` | Long leftward swipe action. |

(Comment swipe action enum: `upvote | downvote | reply | bookmark | share | collapse |
collapseThread | disabled`.)

### Other relevant keys (not in the two contexts above but load-bearing here)
| Key | Effect |
|---|---|
| `REMEMBER_COMMENT_SUBREDDIT_SORT_KEY` (bool) | If on, persists the last-chosen comment sort per subreddit via `KeyStore`. |
| `scrollToNextButtonPosition` (MMKV string, one of the 10 locked-position names) | Where the floating scroll-to-next button is docked; default `"bottom-right"`. |
| `filterText` (via `FiltersContext`) | Drives `doesCommentPassTextFilter`; a failing comment hides its entire subtree in the flattened tree. |

---

## Open questions / ambiguities

1. **`showCommentSummary` setting has no discoverable consumer.** It exists in
   `CommentSettingsContext` (default on) and is documented in
   `documentation/viewing_comments.md` as a Pro "AI-generated summary" feature shown "at
   the top of long comment threads," but no component in this survey's file list (nor a
   broader grep) reads it. Either it's implemented in a file outside this area's scope,
   gated server-side, or currently a stub/placeholder — worth confirming with another
   agent or the maintainers before deciding whether to build it in the rewrite.
2. **Comment sort list mismatch**: `PostDetails.tsx` hard-codes the comment-sort action
   sheet to `["Best","New","Top","Controversial","Old","Q&A"]`, but
   `documentation/viewing_comments.md` additionally lists "Default" as an available
   option. Unclear whether "Default" is meant to be Reddit's server-chosen sort
   (i.e., omitting the `sort` param entirely) and simply missing from this array, or the
   doc is stale.
3. **Where per-subreddit remembered comment sort is *read* / applied** was not located
   in this survey's files — only the *write* side (`SortAndContext.changeSort`) was
   found. Need to trace how a fresh `PostDetailsPage` navigation picks up
   `makeCommentSubredditSortKey(subreddit)` from `KeyStore`, if at all.
4. **Deep-link/"context" comment highlighting**: no client-side highlight, scroll-to, or
   "you are here" indicator for the specific comment a permalink points to was found —
   only the generic "view all comments" banner. Confirm whether Reddit's API response
   shape alone is relied upon (i.e., the target comment is simply the only content
   returned) or whether highlighting exists elsewhere (e.g. in a component not in this
   file list).
5. **Report action is not comment/post-specific.** Both the post-level and (absent)
   comment-level Report paths ultimately just open a generic
   `https://www.reddit.com/report` webview with shared cookies — there's no evidence
   Hydra pre-fills or deep-links the specific reported item. Confirm this is intentional
   (Reddit's own report flow handles item-selection) rather than a gap.
6. **`RenderHtml`'s exact tag coverage for `external/snudown.js`'s full output** could
   not be verified against the minified/compiled source directly (it's Emscripten/WASM-
   style output, not readable markdown-parser source). The supported-extension list in
   §6.9 is inferred from the editor's toolbar, the documentation pages, and
   `RenderHTML.tsx`'s tag-handling switch, not from reading the compiled renderer's own
   logic — there may be additional snudown extensions (e.g. specific reddit-only emoji
   shortcodes, `!media` embeds, poll markdown) not surfaced anywhere in this file set.
7. **Whether `getPostsDetail`'s `limit` option (default 75) is ever overridden** by a
   caller elsewhere in the app (e.g. a "load more top-level comments" affordance beyond
   the per-thread "more replies" rows) was not confirmed — only the default path was
   observed in this survey's scope.
8. **NewPost's post-type switch not clearing shared `text`** and **the generic
   "Unknown error" path re-throwing after already alerting** both read as likely
   unintentional bugs rather than deliberate behavior — flagged in §11.5/§11.3 but
   included here since a faithful-bug-for-bug rewrite vs. a "fixed" rewrite is a product
   decision, not something inferable from the code alone.
9. **Polls** are listed in `todo.txt` as "Get polls working" (an open/hard TODO) — no
   poll post type exists in `NewPost`'s `PostType` union (`self | link | image` only),
   confirming polls are simply unimplemented, not a gap in this survey.
