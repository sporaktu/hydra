# Hydra — Post Feeds, Post Card, Feed Interactions Behavioral Spec

Scope: Home / subreddit / multireddit / user / saved / popular / all feeds, the post
card in normal and compact mode, feed gestures, sorting, filtering, seen/hidden
tracking, subreddit switcher, Subreddits page, and feed video autoplay/focus.
File paths are given as references only; this document describes behavior, not code.

## 1. Screen structure and routing

Three navigation-stack screens all render the same `pages/PostsPage.tsx` component:

- **HomeScreen** (`app/stack/HomeScreen.tsx`) — route name `Home`. Header back title is
  fixed to "Subreddits". `freezeOnBlur: true` (the screen's render tree is frozen,
  not torn down, when navigated away from — video focus is still explicitly released
  via the screen-blur effect described in §9).
- **PostsScreen** (`app/stack/PostsScreen.tsx`) — route name `PostsPage`, used for
  `r/<subreddit>` and combined feeds (`r/popular`, `r/all`). Header title is the
  page name from the URL (e.g. "Pics"); a search bar is shown at the top of the list
  (see §2).
- **MultiredditScreen** (`app/stack/MultiredditScreen.tsx`) — route name
  `MultiredditPage`, used for `/user/<name>/m/<multi>` URLs.

For all three, if `getSwitcherSubredditName(url)` returns non-null (true for HOME,
SUBREDDIT, and MULTIREDDIT page types), the header title is replaced with
`SwitcherHeaderTitle`, a tappable title + down-chevron that opens the subreddit
switcher (a full-screen quick-search modal, §14). Post-details, user, and search
pages never get this tappable title.

## 2. Data loading — pagination, dedupe, filter retry (`utils/useRedditDataState.ts`)

`PostsPage` calls `useRedditDataState` with:
- `loadData`: `getPosts(url, { after, limit })`.
- `filterRules`: `filterHiddenItems`, conditionally `filterSeenItems` (if "hide seen"
  applies to this URL, see §11), `filterPostsByText`, and — only on combined feeds
  (`isCombinedSubredditFeed()`: Home, r/all, r/popular, or a multireddit) —
  `filterPostsBySubreddit` (the per-subreddit filter).
- `limitRampUp`: `[10, 20, 40, 70, 100]` — the page-size requested from Reddit's API
  grows on each successive attempt within one "load more" call.
- `refreshDependencies`: `[searchText, sort, sortTime]` — changing the search query
  string or the sort clears the list and reloads from scratch.

**Pagination / load-more algorithm:** `loadMoreData` loops up to `filterRetries`
(default 5) times. Each iteration fetches a page of size `limitRampUp[i]` starting
after the last **unfiltered** post's `after` cursor (cursor tracking is independent
of what got filtered out, so it never skips over filtered items on the next fetch).
The fetched batch is deduplicated against everything already loaded (`filterExisting`,
matches on `id` + `type`), then run through the filter chain. If a batch produces zero
surviving posts, the loop tries again with the next larger limit. If Reddit itself
returns zero raw posts, `fullyLoaded` is set immediately and no more retries happen.
If all `filterRetries` attempts produce nothing, `hitFilterLimit` is set to true and
the list stops trying — the footer explains "your filters may be too strict."
Otherwise, the surviving batch is appended to `data`.

**Refresh** (pull-to-refresh or a dependency change): resets the `after` cursor to
`undefined`, clears `hitFilterLimit`/`fullyLoaded`, and repeats the same retry loop
starting from `data = []` (or `[]` immediately if the changed dependency is a sort/
search change — `refreshDependencies` triggers the effect to call `refreshData({
clearBeforeLoading: true })`, clearing the list synchronously before refetching).

**Access failures:** `BannedSubredditError`, `PrivateSubredditError`,
`MultiredditUnavailableError` are caught and surfaced via `accessFailure` instead of
being retried; any other error is reported to Sentry, sets `loadFailed`, and the
feed shows nothing with a footer message ("Something went wrong loading this. Pull
down to try again"). `AccessFailureComponent` (wraps the whole feed column) shows
one of these fixed messages instead of the list:
- Private subreddit: `🔑 r/<name> has been set to private by its subreddit moderators`
- Banned subreddit: `🚫 r/<name> has been banned by Reddit Administrators for breaking Reddit rules`
- Banned user: `🚫 <name> has been banned`
- Nonexistent user: `🚫 <name> does not exist`
- Multireddit unavailable: `🔑 Reddit wouldn't share this multireddit. It may be private, deleted, or only visible to the account that owns it.`

**Empty feed:** if the initial load returns zero posts (after filtering), the list is
simply empty with the initial spinner cleared — there is no dedicated "empty state"
message beyond what the footer conditions produce (loadFailed / hitFilterLimit /
fullyLoaded-with-length-0 shows nothing since the "reached the bottom" text requires
`data.length > 0`).

**Search bar:** on `PostsScreen` only (`route.name === "PostsPage"`), a `SearchBar`
is the list's `ListHeaderComponent`. Submitting text pushes
`https://www.reddit.com/r/<subreddit>/search/?q=<text>&restrict_sr=true`. It clears
on search and does not search-on-blur.

## 3. Gallery Mode offer (`utils/useOfferGalleryMode.ts`)

After posts load, if the user hasn't already been offered gallery mode
(`has_already_offered_gallery_mode` flag, offered at most once ever), the feed has
≥100 posts loaded, the feed is **not** a combined subreddit feed (single subreddit
or multireddit/user page only — not Home/popular/all), and ≥85% of the loaded posts
contain at least one image or video, an alert offers to open Gallery Mode. Accepting
sets the flag permanently, opens gallery mode for the current URL, then shows a
second, one-time informational alert explaining how to reach gallery mode again via
the "..." context menu. Declining just dismisses (the flag is only set on accept, so
the prompt can reappear on a later feed unless/until accepted once anywhere).

## 4. The post card (`PostComponent.tsx`)

### 4.1 Layout modes

Controlled by `PostSettingsContext.postCompactMode` (MMKV `postCompactMode`, default
= `deviceSupportsSplitView`, i.e. **true** on screens ≥768pt wide such as iPad,
**false** on phones).

- **Normal mode** (`flexDirection: column`): subreddit-icon+name row (if
  `subredditAtTop` is on), title, flair chip, inline `PostMedia` (image/video/link/
  poll/text preview), then the metadata footer row.
- **Compact mode** (`flexDirection: row` or `row-reverse`): a fixed 60×60
  `CompactPostMedia` thumbnail square sits beside a condensed body (title, optional
  flair, metadata row — no inline media, no text preview body). `showThumbnailsOnRightSide`
  (MMKV, default false) flips the row so the thumbnail sits on the right instead of
  left, and also changes the row's `justifyContent` to `space-between`.

Whole-card container: 12pt vertical / 10pt horizontal padding, 10pt gap between
direct children, background = theme background, opacity **0.75 when the post is
"seen"**, else 1 (see §11). A themed divider strip separates cards: 10pt tall in
normal mode, 1pt (hairline) in compact mode.

### 4.2 Subreddit + author row

If `subredditAtTop` (MMKV, default false) **and** the current page is a combined
feed (`isCombinedSubredditFeed`, i.e. Home/popular/all/multireddit — a single
subreddit's own page never shows its own name on every card), a subreddit icon (20×20,
circular, `SubredditIcon`) + subreddit name row is shown above the title, tappable to
navigate to `r/<subreddit>`. If `subredditAtTop` is off, the same icon+name appears
instead inline in the metadata footer, immediately before "by <author>".
`SubredditIcon` itself only renders when `showSubredditIcon` (MMKV, default true)
is on **and** `currentDataMode !== "lowData"` (§13) — otherwise nothing is drawn
(not even a placeholder), regardless of `subredditAtTop`; if there's no icon URL a
generic Reddit-snoo glyph is shown instead of the remote image.

Sticky posts: an `AntDesign` pushpin icon in `theme.moderator` color precedes the
author/subreddit row (before the subreddit or "by" text) when `post.isStickied` is
true. There is **no** separate lock or archived badge on the feed card — those are
shown only on the Post Details screen, not in `PostComponent`.

Author name: tappable, navigates to `/user/<author>`. Colored `theme.moderator` if
`post.isModerator` (post author is distinguished as "moderator" on Reddit), else
`theme.subtleText`. Bold, 14pt.

### 4.3 Title

`numberOfLines={postTitleLength}` (MMKV `postTitleLength`, default **2**; 0 = unlimited
since `numberOfLines={0}` removes the clamp). 17pt in normal mode, 16pt in compact.
Title text is trimmed of whitespace; no truncation ellipsis customization beyond RN's
default line-clamp behavior.

### 4.4 Flair chip

Shown only if `showPostFlair` (MMKV, default true) **and** `post.postFlair` is
non-null. `postFlair` is only populated when Reddit returns **both**
`link_flair_template_id` and `link_flair_text` — a post with only a free-text flair
(no template id) shows no chip. The chip is a plain rounded rectangle filled with
`theme.divider` (not the flair's actual Reddit color — no per-flair color/background
data is used), containing the decoded flair text in `theme.text`. Margins differ
slightly between compact (2/-3) and normal (5/-5) mode.

### 4.5 Inline media (normal mode only — `PostMedia.tsx`)

Rendered in this priority order (mutually exclusive):
1. **Crossposted post** (`post.crossPost` set): renders `CrossPost`, an entirely
   separate bordered card (see §4.7) that recursively renders the *original* post's
   `PostMedia` inside it — a crosspost never falls through to the branches below.
2. **Video** (`post.videos.length > 0 && !post.crossCommentLink`): `VideoPlayer`
   (§9).
3. **Image(s)** (`post.images.length > 0 && !post.crossCommentLink && !post.externalLink`):
   `ImageViewer` (§4.6).
4. **External link or cross-comment link** (`post.externalLink || post.crossCommentLink`):
   `Link` (§4.8). (`crossCommentLink` is the target when a post is a crosspost of a
   *comment*, distinct from a full crosspost.)
5. **Body text**: only in the non-crosspost, non-HTML render path (`renderHTML=false`,
   used by the feed and by CrossPost) — the post's self-text (with any inline
   `[theme:...]` custom-theme directives stripped via `extractThemeFromText`) is shown
   as a `Text` block, `numberOfLines={maxLines}` (`postTextLength`, MMKV, default **3**;
   passing `0` suppresses the text block entirely). Custom themes embedded in a post's
   text are imported as side effects (`ThemeImport`) purely from being rendered — this
   is unrelated to media but travels through the same component.
6. **Poll**: `PollViewer` (§4.9), can appear alongside body text/media in the same
   card (it is not mutually exclusive with the video/image/link branches — the poll
   is rendered after them, independently).

NSFW/spoiler blur: if `(blurNSFW && post.isNSFW) || (blurSpoilers && post.isSpoiler)`
(`blurNSFW`/`blurSpoilers` MMKV, both default **true**), a full-cover `BlurView`
(intensity 80) sits on top of the whole media block with a centered pill showing an
eye icon and the label "NSFW" or "Spoiler" (NSFW takes priority if both are true).
Tapping the blur cover once permanently reveals it for that render of the cell (state
resets to blurred again if the cell is recycled onto a different post by FlashList,
tracked via `post.id` on a ref). On Android specifically, the underlying content's
opacity is forced to 0 while blurred (worked around a rendering bug where the blur
becomes see-through once a post is read) — iOS has no such issue and shows the
content beneath the blur normally.

### 4.6 Image viewer (feed inline, `ImageViewer.tsx`)

Displays up to 2 images side-by-side in a horizontal row (`numImgsToDisplay =
Math.min(2, images.length)`, or forced to 1 if the current data mode is
`lowData` even before the first tap). Each cell's height is
`min(60% of screen height, width / aspectRatio)`; with 2 images shown that height is
halved between the two cells. A count badge ("`N` IMAGES") appears bottom-right
whenever there are ≥2 images total, even if only 2 are shown side-by-side (i.e. for a
5-image gallery post the badge still just says the total, not "showing 2 of 5").
Tapping any image opens the full-screen media viewer at that image's index (handled
by a different survey area); the first tap also permanently switches this feed
instance off low-data mode for its images (`setLoadLowData(false)`), loading full
resolution thereafter for that cell. Long-press (Android only; iOS gets the native
context menu, §7) opens an action sheet: "Share Image", "Save Image", "Copy Image
Link". `interactedWithPost()` is called on tap, marking the post seen via context
(§11).

### 4.7 Crosspost card (`CrossPost.tsx`)

A separate bordered (1pt, `theme.divider`), rounded (10pt) card, margin 10pt on all
sides, entirely tappable (opens the crosspost's **own** post, not the original) via
`post.link`. Inside: crosspost title (2 lines max, bold-ish 16pt), then the ORIGINAL
post's `PostMedia` (recursed, `renderHTML=false`, `maxLines=postTextLength`), then a
footer with the original post's subreddit icon+name, and metadata (score / comment
count / time-since) in the original post's numbers — i.e. the crosspost card shows
the *original* post's media and vote/comment counts, but the outer title and tap
target belong to the crosspost itself.

### 4.8 Link card (`Link.tsx`)

Bordered (3pt border, `theme.tint`), rounded (10pt) card, 10pt margins. If
`post.openGraphData` has both `image` and `title`:
- OpenGraph preview image at 200pt fixed height, `contentFit: cover`, 10pt corner
  radius, 250ms crossfade — **only rendered when `currentDataMode === "normal"`**
  (suppressed entirely in low-data mode, not even shown at reduced quality).
- OpenGraph title, 1 line.
- OpenGraph description, `numberOfLines={linkDescriptionLength}` (MMKV, default
  **10**; `0` hides the description entirely) — only shown if description text
  exists AND the length setting isn't 0.
- The raw URL, 1 line, small/subtle text, always shown at the bottom.

If there's no OpenGraph title+image (plain link with no preview), the card shows just
the bare URL as its only content (`linkOnlyText` style, single line). Tapping the
card: if the URL parses as a Reddit URL it's opened in-app via push navigation;
otherwise it opens externally (system browser / share). `interactedWithPost()` fires
on tap.

### 4.9 Poll card (`PollViewer.tsx`)

Bordered, rounded container: header shows `poll.voteCount.toLocaleString()` + " votes";
body lists each option as a radio row (tap selects it locally, showing a filled inner
circle — **no network vote is actually sent for the option**); footer has a "Vote"
button that, when pressed, currently just `alert("voted")` — voting on polls from the
feed card is **not functionally implemented** (visually present, non-functional). No
option shows partial results/percentages in this component regardless of selection.

### 4.10 Compact media thumbnail (`CompactPostMedia.tsx`)

60×60 rounded-corner (10pt) square, background `theme.tint`. Content by priority
(same branch order as full media minus crosspost-recursion — a crossposted post in
compact mode still routes through this component using the **crosspost's own**
video/image/etc. fields, since `CompactPostMedia` does not special-case
`post.crossPost`):
1. Video present (`!crossCommentLink`): thumbnail image (post's preview thumbnail)
   with a small play-circle icon overlay bottom-right; if no thumbnail, a generic
   video icon. Tapping opens the fullscreen video viewer directly (bypasses any inline
   preview — compact mode has no inline player at all).
2. Image(s) present: thumbnail image with an image-count badge (only if >1 image) in
   the same corner position as the video's play icon; falls back to a generic image
   icon if no thumbnail. Tapping opens the fullscreen image viewer.
3. Poll present: generic poll icon, centered, non-interactive (tapping the thumbnail
   does nothing beyond the outer card's tap-to-open-post; there's no dedicated poll
   touch target here).
4. External/cross-comment link: generic link icon; if `openGraphData.image` exists
   AND `currentDataMode !== "lowData"`, the OG image is also shown as the thumbnail
   background. In low-data mode the icon is shown larger/centered instead
   (`bigIconContainer`) since there's no image.
5. Plain text post (none of the above): generic text/document icon, centered.

Same NSFW/spoiler blur overlay logic as the full media view (independent blur state
from the main `PostMedia` blur — compact mode never renders `PostMedia`, only this
thumbnail, so there is exactly one blur toggle per card in compact mode).

### 4.11 Metadata footer row

Present in both modes, directly below the media/body. Left-aligned, wrapping row:
- Vote arrow icon (`Feather` `arrow-up` or `arrow-down` — always shows an up-arrow
  glyph unless the user's current vote is a downvote, in which case the down-arrow
  glyph is shown instead; there is no "neutral" glyph) + the raw upvote count
  (`post.upvotes`, **not abbreviated** to k/m in the feed card — Hydra's `Numbers`
  k/m/b abbreviation utility exists (§ below) but the feed post card prints the raw
  integer, unlike the Subreddit sidebar which uses `Numbers.prettyNum()` for
  subscriber counts). Color: `theme.upvote` if user upvoted, `theme.downvote` if
  downvoted, else `theme.subtleText`.
- Comment icon (`message-square`) + `post.commentCount` raw integer, `theme.subtleText`.
- Clock icon + `post.timeSince` (a pre-formatted string from the API layer using
  `Time.prettyTimeSince()`: `"<n> second(s)/minute(s)/hour(s)/day(s)/month(s)/year(s)"`
  — no "ago" suffix appended by this component; whichever screen renders it is
  responsible for context). `Time.prettyTimeSince` buckets: <60s → seconds, <60min →
  minutes, <24h → hours, <30d → days, <12 "months" (days/30) → months, else years;
  always singular/plural-correct (`"1 minute"` vs `"2 minutes"`).
- No upvote *ratio*, no *award* icons/counts are rendered anywhere in the feed post
  card (Post type carries no awards field at all — awards are not modeled in this
  codebase).

### 4.12 Save "notch"

If `post.saved`, a small solid triangle (`bookmarkNotch`, 15×15, CSS-border trick)
in `theme.bookmark` color is pinned to the bottom-right corner of the whole card,
overlapping the card edge — purely decorative, not tappable itself.

## 5. Tap targets

- **Whole card body** (`TouchableOpacity`, `activeOpacity=0.8`): marks the post seen
  (§11) then either calls `onPostOpen(post.link)` (split-view mode on wide screens —
  opens the post in the adjacent detail pane instead of navigating) or pushes
  `post.link` onto the navigation stack.
- **Subreddit icon/name** (both the "at top" row and the inline metadata-row variant):
  navigates to `r/<subreddit>`, does not mark seen, `activeOpacity=0.5`.
- **Author name**: navigates to `/user/<author>`, `activeOpacity=0.8`, does not mark
  seen.
- **Inline media** (image/video/link/poll): each has its own tap target as described
  in §4.6–§4.9; all media taps except the poll also call `interactedWithPost()`
  which marks the post seen through `PostInteractionContext` (independent of the
  outer card's own onPress).
- **NSFW/spoiler blur cover**: reveals content, does not itself mark seen or navigate.
- **Compact thumbnail**: opens the fullscreen viewer directly for image/video (not
  the post detail page), marks seen via `interactedWithPost()`.

## 6. Long-press context menu (`useComponentActions.ts` + `NativeContextMenu.tsx`)

On iOS, long-pressing a post card opens the native UIKit context menu (Zeego) with a
blurred preview of the card; the outer `TouchableOpacity`'s own `onLongPress` is
explicitly disabled on iOS (`undefined`) so it doesn't fight the native menu. On
Android, long-press triggers the JS action-sheet path instead (native menu wrapper
is a no-op passthrough on Android) — capped to single-touch (`e.nativeEvent.touches.length
> 1` aborts).

Full ordered action list, each with an `isAllowed` gate (items failing their gate are
omitted entirely, not shown disabled):

| Label | Always shown? | Condition | Effect |
|---|---|---|---|
| Read post contents | accessibility-only (`isLongPressOption: false`) | always | Not in the long-press menu; announces a text summary via VoiceOver. |
| Open external link to `<host>` | accessibility-only | `post.externalLink` set | Same. |
| Upvote | yes | always | Casts/toggles upvote (§8). |
| Downvote | yes | always | Casts/toggles downvote (§8). |
| Mark as Read / Mark as Unread | yes | always | Toggles seen state (§11), label flips based on current `seen`. |
| Filter Subreddit | yes | only if `deletePost` prop supplied (i.e. this cell is in a list that can remove itself — always true for feed pages) | Opens a second action sheet: "Filter for a day" / "Filter for a week" / "Filter forever". Sets `hideFilteredSubreddits[subreddit]` to `Date.now()+24h`, `Date.now()+7d`, or literal `true` respectively, then removes the post from the current list immediately (does not wait for a refresh). |
| Hide Post / Unhide Post | yes | only if `deletePost` supplied | Hides for 30 days (§12) or unhides; hiding also removes the post from the current list immediately. |
| Save / Unsave | yes | always | Toggles Reddit-side save (§10). |
| Share | yes | always | Opens the native share sheet with `post.link`. |

Two items ("Read post contents", "Open external link...") are accessibility-only
actions (VoiceOver rotor), never appear in the visual long-press/native menu.

Every action above is *also* individually reachable via a matching accessibility
action name on the card (`accessibilityActions`/`onAccessibilityAction`), so
VoiceOver users get the full set without a long press.

## 7. Swipe gestures (`Slideable.tsx`, `GesturesContext`)

Implemented with `react-native-gesture-handler` `Gesture.Pan()` + Reanimated shared
values — gesture tracking runs entirely on the UI thread.

**Activation:** requires mostly-horizontal movement (`failOffsetY([-10, 10])`
cancels the pan if vertical drag exceeds 10px, letting the enclosing FlashList scroll
instead). Horizontal activation offset is normally `±20px` either direction
(`xScrollToEngage` default). If `swipeAnywhereToNavigate` (§ below) is on, the
activation range becomes `[-20, MAX_SAFE_INTEGER]` — i.e. **rightward drags never
activate the row's own pan at all**, letting the OS edge-swipe-back gesture win
instead; only leftward swipes remain live on the row.

**Thresholds:** `SHORT_SWIPE_THRESHOLD = 75px`, `LONG_SWIPE_THRESHOLD = 130px`,
measured as absolute horizontal translation. Four independent "bands":
short-right (drag right 75–129px), long-right (≥130px right), short-left (75–129px
left), long-left (≥130px left, magnitude only — sign encodes direction). When
`swipeAnywhereToNavigate` is on, translation is clamped to `min(translationX, 0)`
before banding, so only the left-swipe bands can ever fire.

**Visual feedback:** as the band changes during a live drag, a colored background
(the target action's theme color) plus its icon are revealed behind the card, which
itself translates by the raw drag distance. A light haptic (`hapticEngage`, iOS light
impact) fires exactly once per band **transition** (not continuously), including the
transition back to band 0. On release, if the final band is non-zero, that band's
`action()` fires immediately (no separate confirmation); the card then springs back
to `translateX: 0` (damping 100, stiffness 300, overshoot-clamped) and the highlight
clears once the spring settles.

**Action mapping — posts** (`GesturesContext.postSwipeOptions`, MMKV key
`postSwipeOptions`, default `{ right: "upvote", farRight: "downvote", left: "hide",
farLeft: "bookmark" }` — note "right"=short-right band, "farRight"=long-right band):
maps to `Slideable`'s `shortLeftName`/`longLeftName` (using the "right"/"farRight"
option names, since a rightward drag reveals content anchored to the **left** edge)
and `shortRightName`/`longRightName` (using "left"/"farLeft"). Available values:
Upvote, Downvote, Mark as Read (posts only — the label reads "Mark as Read" but
toggles to "Mark as Unread" if already seen, matching the long-press item), Bookmark
(save/unsave, toggles), Share (opens native share sheet directly, no menu), or
Disabled (that band does nothing and shows no highlight). Changing one direction to a
value already used by another direction **swaps** the two directions' values
(`getKeyToSwitchWith`) rather than allowing duplicates.

Icons/colors bound to each of the 5 possible post swipe actions (regardless of which
band they're assigned to): Upvote = `arrow-up`/`theme.upvote`, Downvote =
`arrow-down`/`theme.downvote`, Hide = eye/eye-off (depends on current seen state) /
`theme.showHide`, Bookmark = filled/outline bookmark / `theme.bookmark`, Share =
share icon / `theme.share`. Icon size 38 uniformly for posts (comments use a
different size elsewhere, out of this area's scope).

**Comment swipe options** exist in the same context (`commentSwipeOptions`, default
`{ right: "upvote", farRight: "downvote", left: "reply", farLeft: "bookmark" }`,
extra values Reply/Collapse/Collapse Thread) but apply to the comment list, not the
feed — documented here only because they share the context/config surface.

**Swipe Anywhere to Navigate** (MMKV `swipeAnywhereToNavigate`, default **false**):
when on, a right-edge swipe anywhere on screen triggers the OS back gesture instead
of a post's short/long-right swipe actions; those two bands become permanently
unreachable on every row while the setting is on (only left-side swipe actions still
work).

## 8. Voting

Tap-to-vote is **not** exposed as a direct tap target on the feed card itself (no
dedicated up/down arrow buttons rendered inline in `PostComponent`'s footer are
touchable — the footer icons in §4.11 are display-only in the feed; voting happens
via long-press menu item, swipe gesture, or accessibility action, not a footer tap).
Both Upvote and Downvote actions call the shared `vote(post, VoteOption)` API helper:
- If the requested direction equals the post's current vote, the vote is retracted
  (`dir = NoVote`) — i.e. tapping/swiping the same direction again always undoes it;
  there is no separate "remove vote" action.
- On success, the local post object is optimistically updated:
  `upvotes: post.upvotes - post.userVote + result; userVote: result` (arithmetic
  removes the old vote's contribution and applies the new one in one step — handles
  up→down, down→up, and either→none correctly without a separate branch).
- A non-neutral vote outcome increments the local stats counter
  `POST_UPVOTES`/`POST_DOWNVOTES` by 1 (§18) — retracting a vote does not decrement
  anything.
- Colors: current-vote arrow tint uses `theme.upvote` (up), `theme.downvote` (down),
  or `theme.subtleText` (no vote) — computed once per render as `currentVoteColor`
  and applied to both the vote-count icon and number in the footer.
- No pending/optimistic-then-rollback-on-failure UI is implemented — the update
  applies only after the network call resolves (an error would reject/throw and the
  card would visually not update, since `setPost` is only called after `await vote(...)`
  succeeds).

## 9. Feed video: poster vs. player, and the Focused Post algorithm

### 9.1 What each cell renders

`VideoPlayer` (`PostMediaParts/VideoPlayer.tsx`) is used in normal-mode feed cards.
It never plays unconditionally; whether it mounts a real player is gated by
`dontRender = currentDataMode === "lowData" || !autoPlayVideos || (focusManaged &&
!isFocused)`:
- **Low data mode**, or the global **Autoplay** toggle off, or (inside a
  focus-managed feed list) **not the Focused Post**: shows only the static poster
  (the post's preview thumbnail rendered through `ImageViewer`, feed aspect-ratio
  rules) with a centered semi-transparent play-circle icon overlay, and **no player
  is attached at all** — not even a paused/hidden one.
- **Focused** (or outside any focus-managed context, e.g. Post Details, where
  `isFocused` is always true): a real `Video` player mounts, using the poster as its
  base layer until the correct frame is decoded, then crossfading it away (handled by
  the shared `Video` component, covered by the media-viewer survey area).

Tapping the video area (whole cell is one `TouchableOpacity`) always opens the
fullscreen media viewer for that post's video(s), regardless of poster/playing state,
and calls `interactedWithPost()` (marks seen). A `VIDEOS` count badge appears
bottom-right if the post has more than one video.

**Audio:** the mounted feed player is unmuted only when `focusManaged && isFocused &&
feedVideoAudio` (the global Audio toggle, §9.4) are all true — i.e. audio never plays
for a non-focused feed video even transiently.

### 9.2 Focused Post selection algorithm (`utils/FeedVideoFocus.ts`)

At most one video plays across the whole app at a time (module-level single
`focusedVideoKey`, keyed by the video's pre-resolution source URL — the same key the
shared player registry uses). Selection runs inside `RedditDataScroller` via two
extra FlashList `viewabilityConfigCallbackPairs` (in addition to the caller's own
`onViewableItemsChanged`, which still separately drives seen-on-scroll, §11):

- **"Mostly visible A"**: `itemVisiblePercentThreshold: 70` — at least 70% of the
  post's own height is on screen.
- **"Mostly visible B"**: `viewAreaCoveragePercentThreshold: 60` — the post covers at
  least 60% of the *viewport* (this is how a post taller than the screen — a long
  title above a video — can ever qualify, since it can never satisfy the 70% rule).
- The **union** of tokens from A and B forms the "mostly visible" candidate set,
  recomputed on every change to either.
- A third, always-present config (the plain `onViewableItemsChanged` FlashList uses
  by default, any-pixel-visible) supplies the "any visible" set, used only to detect
  when the currently focused video has left the screen **entirely**.

**Candidate choice:** among mostly-visible video posts, the one whose index is
closest to the numeric midpoint of `[min(viewableIndices), max(viewableIndices)]`
wins (`pickCenterMostVideo`) — an index-based approximation of "closest to the
center of the viewport," not a true pixel-center computation.

**Settle debounce:** a candidate change is not applied immediately. It's held in
`pendingFocusKey` and committed via `setFocusedVideo` only after **150ms**
(`FOCUS_SETTLE_MS`) with no further candidate change, OR immediately on
`onMomentumScrollEnd` (whichever comes first) — this is why a fast fling never
starts any video: the candidate keeps churning faster than the debounce window, so
`pendingFocusKey` is repeatedly reset and never commits until the fling actually
stops.

**Hysteresis (asymmetric start/stop):** starting is strict — only a *mostly visible*
video can become newly Focused. Stopping is lenient — once a video is Focused, it
**keeps** focus as long as it has *any* pixel on screen (from the "any visible" set)
and no *other* mostly-visible candidate has appeared to replace it; a small nudge
that drops the focused video just below the 70%/60% mostly-visible thresholds does
not stop it.

**Immediate release:** if the feed's own owned, focused video is no longer present
in the "any visible" set at all (fully scrolled off), focus is released to `null`
**immediately**, bypassing the 150ms debounce — a video's audio must never keep
playing once it is fully off-screen.

**Screen blur/unmount:** losing navigation focus (tab switch, pushing a new screen,
unmounting) releases this feed's owned focus to `null` immediately (so a video never
keeps playing under a covering screen). Regaining screen focus re-evaluates from the
last known viewability snapshot (no scroll event needed) to restore whichever video
should be playing.

**Resume position:** playback positions are remembered independently of player
lifetime, keyed by video key, LRU-capped at 200 remembered positions
(`MAX_REMEMBERED_POSITIONS`) — losing focus (and possibly having the underlying
player evicted/released) never loses the resume point; regaining focus later always
resumes rather than restarting from 0.

**Scoping caveat:** the whole system uses one process-global focused key because at
most one focus-managed list is expected on a focused screen at once (split view pairs
a managed feed with an *unmanaged* PostDetails pane — PostDetails' own video is
always "focused" since it's outside any `FeedVideoFocusContext.Provider`). Two
simultaneous managed feeds on screen at once would fight over the single global key
(noted as a known limitation in the source, not currently reachable in the UI).

### 9.3 Global Autoplay toggle

`PostSettingsContext.autoPlayVideos`, MMKV key `autoPlayVideos`, default **true**.
When off, every feed video post (compact or normal mode is irrelevant — this only
gates the normal-mode inline `VideoPlayer`; compact mode never inline-plays regardless)
shows its poster + play icon and nothing auto-starts; tapping still opens the
fullscreen viewer, which plays independently of this setting.

### 9.4 Global Audio toggle

`PostSettingsContext.feedVideoAudio`, MMKV key `feedVideoAudio`, default **false**.
Persistent, global (not per-session, not per-post). Governs whether the Focused
Post's video plays with sound. Distinct from `tappedVideoAudio` (audio state for
videos opened via tap into the fullscreen viewer), which initially mirrors
`feedVideoAudio` until the user overrides it once in the viewer, after which it
tracks independently forever.

### 9.5 Feed video FABs (`FeedVideoFABs.tsx`)

Two small (44×44, circular, semi-translucent, bordered, drop-shadow) floating buttons
stacked bottom-right, positioned just above the tab bar
(`tabBarHeight - TAB_BAR_REMOVED_PADDING_BOTTOM + 20`), rendered as a sibling of the
feed list inside the feed column (so on split view/iPad they stay scoped to the feed
pane, not floating over the detail pane):
- **Autoplay** (top button, always shown): icon is a filled play-circle when on, a
  pause-circle when off; toggles `autoPlayVideos`. Light selection haptic on tap.
- **Audio** (bottom button, shown **only while Autoplay is on** — with autoplay off
  there is never a playing feed video to have sound, so the button is hidden
  entirely rather than shown disabled): icon is `volume-2` (on) or `volume-x` (off);
  toggles `feedVideoAudio`. Both buttons expose `accessibilityRole="switch"` with
  `accessibilityState.checked`.

## 10. Save / share / other single-shot actions

- **Save**: `saveItem(post, !post.saved)` → Reddit API `api/save` or `api/unsave`
  with the post's Reddit fullname. Optimistically flips `post.saved` locally after
  the call resolves. No offline queue — a failed request leaves the star/bookmark
  unchanged (the `await` is not wrapped in try/catch at the call site, so a failure
  would surface as an unhandled rejection rather than a user-visible error message).
- **Share**: `shareURL(post.link)` — opens the native iOS share sheet with the
  canonical Reddit permalink URL (never the post's external link, even for link
  posts — sharing always shares the *Reddit* discussion link).
- **Unsave/Save** and the bookmark notch are the only persistent visual save
  indicators in the feed; there's no separate "saved" filter chip on the card itself.
- Save/hide/vote local mutations flow back to `PostsPage` through `setPost`/`deletePost`
  callbacks threaded via stable refs (`modifyPostsRef`/`deletePostsRef`) so
  `renderPost`'s identity stays stable across renders and `React.memo` on
  `PostComponent` can skip re-rendering untouched cells during scroll.

## 11. Seen-post tracking and dimming

**What marks a post seen:**
1. Opening its post-details page or split-view pane (`setSeenValue(true)` fires
   synchronously on the outer card's `onPress`, before navigation).
2. Interacting with its inline media — tapping an image, video, or link
   (`interactedWithPost()` via `PostInteractionContext`, wired to the same
   `setSeenValue(true)`).
3. Voting on it, hiding it, or explicitly choosing "Mark as Read" — anything routed
   through `useComponentActions`'s handlers that also happens to be one of the
   listed actions above triggers seen as a side effect only where explicitly coded
   (Upvote/Downvote/Save do **not** themselves mark seen — only the dedicated
   "Mark as Read" action and the card/media taps do).
4. **Scrolling past it**, but only if `autoMarkAsSeen` (MMKV `autoMarkAsSeen`,
   default **false**) is enabled: `PostsPage`'s `onViewableItemsChanged` marks a post
   seen the moment it transitions from viewable to not-viewable while its index is
   still below the current max-visible index (i.e. it scrolled off the **top**,
   not e.g. off the bottom on a downward fling past a not-yet-rendered item).
   Toggling this setting shows an alert instructing the user to restart the app for
   it to take effect (it is read once at some initialization point, not reactively);
   if both `autoMarkAsSeen` and the seen-hiding filter are enabled together, an
   additional warning about slower loads is appended (loading has to fetch and
   discard every already-seen post server-side before finding new ones).

**Rendering:** each `PostComponent` independently loads its own seen state on mount
(`isPostSeen(post)`, a synchronous SQLite lookup) and subscribes to a per-post-id
pub/sub (`subscribeToSeenChange`) so marking it seen elsewhere (e.g. the scroll-past
path) re-renders only that one cell, never the whole list. A recycled FlashList cell
resets this state synchronously via `useRecyclingState` keyed on `post.id`, so a
reused cell never flashes the previous post's dimming for even one frame. Seen posts
render at **opacity 0.75**; unseen at 1.0 — this is the only visual difference (no
"NEW" badge or similar for unseen).

**Storage:** SQLite table of seen post IDs, capped at 5,000 rows — maintenance
(`maintainSeenPosts`) trims the oldest rows down to the cap on each run (run at some
periodic/startup point outside this area's files).

**Hide Seen Posts (global + per-URL override):**
- Global setting: `filterSeenPosts` (MMKV key `filterSeenPosts`, default **false**).
- Per-URL override: `hideSeenURLs`, an object keyed by the URL's "base page" (Home →
  the whole `reddit.com` domain — Home has exactly one override slot regardless of
  its current sort; a single subreddit → `/r/<name>` with any trailing sort/segment
  stripped). `getHideSeenURLStatus(url)` returns the per-URL override if one exists
  for that base page, else falls back to the global `filterSeenPosts`. The context
  menu's "Show Seen Posts"/"Hide Seen Posts" item toggles the override for the
  *current* base page specifically (via `toggleHideSeenURL`, which **deletes** the
  override key entirely if the new value would equal the current global default —
  keeping the override map minimal/only storing actual exceptions) and immediately
  replaces the current URL to force a refetch with the new filter applied.
- When active for the current URL, `filterSeenItems` (an extra filter rule) removes
  already-seen posts from every loaded batch, counted against the same
  filter-retry/hit-filter-limit machinery as any other filter (§2).

## 12. Hidden posts (local, not Reddit's own hide)

Hiding is entirely local/on-device — it never calls Reddit's `hide` API endpoint.
`hidePost(post)` inserts (or updates, on conflict) a row keyed by post ID with
`expiresAt = Date.now() + HIDDEN_POST_EXPIRY_MS` (**30 days**, fixed, not
user-configurable). `isPostHidden`/`arePostsHidden` check `expiresAt > now` — an
expired-but-not-yet-cleaned-up row reads as not-hidden. `maintainHiddenPosts`
(run at startup as DB maintenance) deletes rows past their expiry outright so the
table doesn't grow unbounded. `filterHiddenItems` (always in the filter chain,
unconditionally, unlike seen-filtering which is opt-in) removes currently-hidden
posts from every loaded feed. Un-hiding removes the row entirely (does not just flip
a flag). There is a management surface (`getHiddenPosts()`, most-recently-hidden
first) for reviewing/un-hiding, outside this area's files.

## 13. Subreddit-level filtering (from long-press "Filter Subreddit")

Stored as `hideFilteredSubreddits`, an object keyed by (lowercase, presumably as
typed by Reddit's own casing) subreddit name → either a numeric expiry timestamp or
literal `true` (forever). `filterPostsBySubreddit` (only added to the filter chain on
**combined** feeds — Home, r/all, r/popular, multireddits; never applied when
browsing an individual subreddit directly, per `isCombinedSubredditFeed()`) drops any
post whose subreddit has an entry that is `true`, or a timestamp still in the future;
an expired timestamp entry is treated as not-filtered (but is **not** actively
cleaned up by this code path — stale expired entries simply stop having any effect,
they are not deleted). Toggling via the long-press menu immediately removes the
triggering post from the current list without waiting for a refresh.

## 14. Text filters (`utils/filters/TextFiltering.ts`)

`filterText` (MMKV string, default `""`) is parsed by `makeTextFilterMap` into a
per-character trie ("filter map"): the raw string is split on `", "`, `"\n"`, or
`","`, lowercased, trimmed, empty entries dropped. Matching
(`doesTextPassTextFilter`) walks the trie over the lowercased haystack looking for
any filtered word occurring as a **whole word** — a match only counts if the
character immediately before and after the matched span is either absent (string
boundary) or a non-word character (`\W`); this is true whole-word matching, e.g. the
word "cat" matches "the cat sat" but not "catering". Multi-word phrases in the filter
list are matched as an exact literal substring per the same whole-boundary rule
(spaces are ordinary trie characters). Matching runs "no filter word found ⇒ pass";
finding any match anywhere immediately fails the whole text and returns false — a
single-word match rejects the entire post even if only one field out of several
matched.

For posts, the concatenated haystack (space-joined) is: title, author, self-text,
all poll option texts, OpenGraph title, OpenGraph description. For comments (used
elsewhere, not this area): comment text + author. `filterPostsByText` is always
present in the feed's filter chain (not gated by any toggle — an empty filter string
produces an empty trie, which trivially passes everything, so there is no separate
on/off switch: the feature is "on" whenever the list is non-empty).

## 15. AI (Smart) filters — documented, not implemented in this codebase

`documentation/ai_filters.md` describes a Hydra Pro feature: sends a post's title,
subreddit, and text to an AI classification service against a free-text description
("Smart Post Filter") or one of six presets (No Politics, No Negativity, No Graphic
Content, No Gambling Triggers, No Drugs and Alcohol, No Fluff); matching posts are
hidden; text-only (never scans images/video); applies to main feeds and subreddits
but explicitly **not** to search, user profiles, or gallery mode. **No corresponding
implementation was found anywhere in this codebase** (no filter-map, MMKV key, or API
call resembling "smart filter"/"AI filter" exists in `utils/filters/`, contexts, or
elsewhere) — treat this as a specified-but-unbuilt feature; a from-scratch rewrite
should treat it as net-new work rather than a behavior to reverse-engineer from
existing code.

## 16. Sorting

### 16.1 Per-feed sort option sets (`SortAndContext.tsx` via `pages/PostsPage.tsx`)

- **Home** (`PageType.HOME`): Best, Hot, New, Top, Rising.
- **Subreddit** (`PageType.SUBREDDIT`, including r/popular, r/all — those are still
  `SUBREDDIT` page type): Best, Hot, New, Top, Rising.
- **Multireddit** (`PageType.MULTIREDDIT`): Hot, New, Top, Rising, Controversial (no
  Best).
- **User** pages restrict sort to New/Hot/Top, and only show a sort control at all on
  the `submitted` and `comments` sections (overview/saved/upvoted/etc. show no sort
  control from `UserPage`).

Selecting "Top" always opens a second-level action sheet for the time range: Hour,
Day, Week, Month, Year, All (`handleTopSort`), for Home/Subreddit/Multireddit/User
page types. Selecting any other option applies immediately via `changeSort`, which
rewrites the URL's path segment (Home/Subreddit: `/…/<sort>/`; Multireddit: 6th path
segment) or query param (`sort=`, for subreddit-search/post-details/user) and pushes
it via `navigation.setParams`.

The sort icon shown in the header reflects the *current* URL's sort (parsed via
`RedditURL.getSort()`), independent of which options are offered for that page type —
falls back to a trophy icon (Best's icon) if unrecognized/absent.

### 16.2 Remembering sort per subreddit / defaults (`RedditURL.applyPreferredSorts`)

Applied whenever a URL is navigated to with no explicit sort segment already present.
Logic:
1. If the URL already specifies a sort, do nothing.
2. For **Home** specifically, do nothing unless `SORT_HOME_PAGE` (MMKV, "Apply sort
   to home") is enabled — Home does not inherit preferred sorts by default even if a
   default sort is configured.
3. For Subreddit or Home (once past the gate above): if
   `REMEMBER_POST_SUBREDDIT_SORT_KEY` (MMKV, "Remember subreddit sort") is on, look
   up a per-subreddit remembered sort (`PostSubredditSort-<lowercased subreddit>`);
   otherwise fall back to the global default (`defaultPostSort` MMKV key, itself
   defaulting to the sentinel `"default"` meaning "use Reddit's own default sort,
   don't force one"). If the resolved sort is "top", the time range is resolved the
   same way: per-subreddit `PostSubredditSortTop-<subreddit>` if remembering is on,
   else the global `defaultPostSortTop` MMKV key, else falls back to `"all"`.
4. For **Post Details** pages, an analogous but separate pair of keys governs comment
   sort: `REMEMBER_COMMENT_SUBREDDIT_SORT_KEY` / `CommentSubredditSort-<subreddit>` /
   `defaultCommentSort`.

Whenever the sort is changed manually through the UI (`SortAndContext.changeSort`),
if per-subreddit remembering is currently enabled for that content type, the new
choice is written back into that subreddit's specific remembered-sort key (and the
matching top-time key, if sorting by Top) — i.e. remembering is captured
opportunistically on every manual sort change, not just read.

## 17. The subreddit switcher header and quick search modal

Any feed screen whose URL is Home/Subreddit/Multireddit gets a tappable header title
(`SwitcherHeaderTitle`) showing the page name + a down-chevron. Tapping it invokes
`SubredditSwitcherContext.openSubredditSwitcher()`, which is wired (via a
registration side-channel set up once at the tab-navigator root) to open
`QuickSubredditSearch`, a full-screen modal overlay (dark 70%-opacity backdrop, tap
outside to dismiss).

**Behavior:**
- With an empty search box, the list shows the user's favorited subreddits followed
  by all subscribed subreddits (`[...favorites, ...subscriber]`, in whatever order
  those arrays already carry — no re-sorting applied by this modal itself).
- Typing debounces 500ms before firing two parallel lookups: a general subreddit
  search (paginated, 20 per page, infinite-scroll within the modal's own capped-height
  list — `maxHeight` = 10 rows × 52pt) and an **exact-match resolution**
  (`resolveSubreddit`, stripping a leading `/r/`, `r/`, or `/`) that, if it resolves,
  shows a distinct "Go to r/<name>" quick-jump row above the search results list —
  pressing Enter/Go on the keyboard also jumps straight there if an exact match is
  currently resolved.
- Each result row shows the subreddit's icon (or generic snoo), name, and
  (if provided by the API) subscriber count formatted via `Numbers.prettyNum()`
  (k/m/b abbreviation, one decimal place — this is the *one* place in this feed/
  subreddit surface area that does use the abbreviated-number formatter, unlike the
  main feed post card's raw counts).
- Selecting any row (search result, favorite/subscribed row, or the exact-match
  quick-jump) closes the modal, clears all local modal state, and pushes
  `PostsPage` for `r/<subreddit>` via a direct navigation dispatch (not the URL-based
  navigation helper used elsewhere — this bypasses `pushURL`/history normalization).

## 18. The Subreddits page (`pages/Subreddits.tsx`)

A single flat `FlashList` assembled from heterogeneous typed rows, in this fixed
order:
1. Three fixed **top buttons**: Home (`/`, pink #fa045e, "Posts from subscriptions"),
   Popular (`/r/popular`, blue #008ffe, "Most popular posts across Reddit"), All
   (`/r/all`, green #02d82b, "Posts across all subreddits") — always present,
   unconditionally, regardless of login state.
2. **Favorites** section (only if non-empty) — subreddits the user favorited, in
   whatever order the favorites array holds (insertion order into local storage, not
   re-sorted here).
3. **Multireddits** section (only if any exist) — one expandable row per multireddit.
4. **Moderator** section (only if any) — subreddits the current user moderates.
5. **Subscriber** section (only if any) — every subscribed subreddit.
6. **Trending** section (only if any; only populated at all when logged out — the
   subreddit context loads `trending` subs specifically for the logged-out case, and
   `subscriber`/`moderator`/`favorites` are all empty then).

Each section is preceded by an uppercase divider header (`SectionHeading`, tinted
background). Favorites/Moderator/Subscriber/Trending rows all render via the same
`SubredditCompactLink` (icon, name, tappable star toggle on the right for
favorite/unfavorite — pressing the star does **not** navigate, it's a nested
touchable with its own 10pt hit-slop). No search box exists directly on this page
(subreddit search lives in the separate Search tab and in the quick-switcher modal,
§17); there is no client-side sort/filter control on this page beyond the fixed
section order and the A–Z jump.

**A–Z scroller:** a vertical letter rail on the right edge (`AlphabetScroller`,
tinted background, all 26 letters always shown). Touching and dragging over it
computes the touched letter from `locationY / (containerHeight / 26)` and calls
`scrollToIndex` (non-animated) to the first item — scoped **only** to items in the
`subscriber` or `trending` categories (favorites/moderator sections are not
indexed by this control) — whose name starts with that letter (case-insensitive);
letters with no matching subreddit are silently no-ops (index `-1` found → not
scrolled). While actively touching the rail, a large centered letter-preview bubble
shows the currently-hovered letter; it disappears on touch release.

**Unsubscribe:** there is **no swipe-to-unsubscribe gesture anywhere on this page or
on `SubredditCompactLink`** — unsubscribing is only reachable via a subreddit's own
page → "..." menu → "Unsubscribe" (§19), never from the Subreddits list itself.

**Multireddit rows** (`MultiredditLink.tsx`): icon (or generic snoo), name, and a
chevron-in-a-pill button that expands/collapses (local component state, not
persisted) a nested indented list of the multireddit's member subreddits directly
beneath the row. Tapping the row itself (not the chevron) navigates to the
multireddit's combined feed. Tapping an expanded member subreddit navigates to that
subreddit; long-pressing a member subreddit opens a 2-item action sheet ("Delete
From Multireddit", "Share") — deleting calls the Reddit API to remove that subreddit
from the multi and triggers a reload of the multireddit list.

## 19. Subscribe / Favorite / Add-to-multireddit (subreddit-page "..." menu)

All routed through `SortAndContext`'s context-menu handler when viewing a subreddit
page specifically (`PageType.SUBREDDIT`):
- **Subscribe/Unsubscribe**: label flips based on whether the current subreddit
  name is found in `subreddits.subscriber`. Calls the Reddit subscribe API, then
  reloads the whole subreddit list, then shows a plain `Alert`/`alert()` confirmation
  ("Subscribed!"/"Unsubscribed from <name>").
- **Favorite/Unfavorite**: label flips based on `subreddits.favorites`. Favoriting a
  subreddit the user isn't subscribed to throws `NeedsSubscriptionToFavorite`
  (surfaced via a plain `alert`, not a styled UI) — **you must be subscribed before
  you can favorite**. Favorites are stored in local key-value storage (`KeyStore`),
  keyed per-account (`favoriteSubreddits:<userId>`) — an unauthenticated user cannot
  favorite at all (`NeedsLoginToFavorite`, silently swallowed after an `alert`).
  Favorites are **not** synced to Reddit — purely local, per-device, per-account.
- **Add to Multireddit**: if the user has zero multireddits, an alert says so and
  stops; otherwise a second action sheet lists all multi names, and selecting one
  calls the add API, reloads multis, and confirms via `alert`.
- **New Post**: opens the new-post composer modal pre-filled for this subreddit.
- **Sidebar** / **Wiki**: pushes `/r/<sub>/about/` or `/r/<sub>/wiki/index`.
- **Open in Gallery Mode**: available for Home, Subreddit, and Multireddit context
  menus (all three `contextOptions` arrays built in `PostsPage.tsx` include it) —
  opens the gallery-mode view of the current URL.
- **Show/Hide Seen Posts**: toggles the per-URL override described in §11 and
  force-reloads the current page.
- Home's context menu omits Subscribe/Favorite/New Post/Multireddit/Sidebar/Wiki
  entirely (only: Open in Gallery Mode, Show/Hide Seen Posts, Share) since "Home" has
  no single subreddit identity. Multireddit's context menu is minimal too: only Open
  in Gallery Mode and Share.

## 20. Data-mode (low-data) rules for feed media (`DataModeContext.tsx`)

Two independent MMKV-backed settings, `dataMode.wifi` and `dataMode.cellular`
(object under key `dataMode`), each either `"normal"` or `"lowData"`. Defaults: both
**"normal"** (i.e. low-data mode is off by default on both connection types — despite
the context's own hardcoded fallback constant reading `currentDataMode: "lowData"`,
that fallback is only used before the MMKV object has loaded/if unset entirely, and
the *settings default* baked into `dataModeSettings` is normal/normal). The active
mode is picked live from `NetInfo`'s current connection type (`wifi` vs. anything
else, treated as cellular) and re-evaluated on every network-state change
(`NetInfo.addEventListener`) — switching from Wi-Fi to cellular mid-session
immediately changes `currentDataMode` for every consuming component without any
reload.

Effects specifically within this feed/post-card area when `currentDataMode ===
"lowData"`:
- `SubredditIcon` renders nothing at all (not even a placeholder) regardless of the
  `showSubredditIcon` setting.
- `ImageViewer` (feed inline) forces `numImgsToDisplay = 1` and requests only the
  first frame/lowest tier of the first image's source array, until the user taps
  once (which permanently switches that image cell to full quality for the rest of
  its life, independent of the global setting).
- `Link` card suppresses the 200pt OpenGraph preview image entirely (title/
  description/URL text still render).
- `CompactPostMedia`'s external-link thumbnail shows a large centered link icon
  instead of the OpenGraph image (which is not fetched).
- `VideoPlayer` never mounts a real player (poster + play icon only), independent of
  Focused-Post state or the Autoplay toggle — low data forces the poster-only branch
  unconditionally.

## 21. Stats counted from feed/post interactions (`db/functions/Stats.ts`)

Locally-stored (SQLite) counters relevant to this area, each a simple persistent
integer bumped by `modifyStat`:
- `SCROLL_DISTANCE`: accumulated absolute pixel delta of feed scroll position,
  buffered in a ref during active scrolling and flushed to SQLite only on
  `onScrollEndDrag`, `onMomentumScrollEnd`, or component unmount — never mid-gesture.
- `POST_UPVOTES` / `POST_DOWNVOTES`: incremented by 1 whenever a vote action resolves
  to a non-neutral direction (§8); retracting a vote does not decrement.
- `POSTS_VIEWED`: incremented by 1 when a post's **detail page** is opened (tracked
  in the Post Details screen, outside this survey's files, not incremented merely by
  a card being scrolled past or its media tapped in the feed).
- `SubredditVisits` (a separate per-subreddit table, not a `Stat` enum key):
  incremented once per mount of a subreddit's own `PostsPage` (only when the page
  represents a single, non-combined subreddit — Home/popular/all/multireddit visits
  do not increment any subreddit's count), used to drive the Stats page's "top 10
  most visited communities."

These feed a separate Stats settings page (Hydra Pro–gated) covered elsewhere; noted
here only for the counters this area's code itself writes.

## 22. Formatting utilities referenced throughout

- **`Numbers.prettyNum()`**: >1e9 → `"<n>.<d>B"`, >1e6 → `"<n>.<d>M"`, >1e3 →
  `"<n>.<d>K"` (always exactly one decimal place via `toFixed(1)`), else the raw
  integer as a string. Used for the sidebar's subscriber count and the quick-switcher
  modal's subscriber count — **not** used for the feed post card's own vote/comment
  counts, which print raw integers unformatted (see §4.11).
- **`Time.prettyTimeSince()` / `shortPrettyTimeSince()`**: bucket boundaries <60s →
  seconds, <60min → minutes, <24h → hours, <30d → days, <12mo(=360d bucket via
  days/30) → months, else years. Long form: `"<n> unit(s)"` with correct
  pluralization, no "ago" appended by the utility itself. Short form: `"<n>s/m/h/d/mo/y"`.
  The feed post card uses the long form (via the API layer's precomputed
  `post.timeSince` string).

## 23. Settings-key inventory for this area

All are MMKV keys (persisted device-local key-value storage), read through
`react-native-mmkv` hooks with an in-code fallback default when unset.

| Key | Type | Default | Effect |
|---|---|---|---|
| `postCompactMode` | bool | `deviceSupportsSplitView` (≥768pt width) | Compact vs. normal card layout. |
| `showThumbnailsOnRightSide` | bool | false | Compact-mode thumbnail side. |
| `subredditAtTop` | bool | false | Subreddit row above title vs. inline in metadata. |
| `showSubredditIcon` | bool | true | Show subreddit icon (also gated by data mode). |
| `postTitleLength` | number | 2 | Title `numberOfLines` (0 = unlimited). |
| `postTextLength` | number | 3 | Self-text preview `numberOfLines` (0 = hidden). |
| `linkDescriptionLength` | number | 10 | Link-card OG description `numberOfLines` (0 = hidden). |
| `showPostFlair` | bool | true | Show flair chip. |
| `blurSpoilers` | bool | true | Blur spoiler-tagged media. |
| `blurNSFW` | bool | true | Blur NSFW media. |
| `showPostSummary` | bool | true | (Consumed outside this area's files — not read by any file surveyed here beyond being defined.) |
| `autoPlayVideos` | bool | true | Global feed video autoplay master switch. |
| `feedVideoAudio` | bool | false | Focused feed video plays with sound. |
| `tappedVideoAudio` | bool | mirrors `feedVideoAudio` until first explicit set | Audio default for videos opened via tap (fullscreen viewer). |
| `liveTextInteraction` | bool | false | (Not consumed within this area's files.) |
| `tapToCollapsePost` | bool | true | (Post Details behavior, not the feed card.) |
| `filterSeenPosts` | bool | false | Global "hide seen posts." |
| `hideSeenURLs` | object | `{}` | Per-base-page override map for hide-seen. |
| `filteredSubreddits` | object | `{}` | Per-subreddit filter map (expiry timestamp or `true`). |
| `autoMarkAsSeen` | bool | false | Mark posts seen on scroll-past (requires app restart to take effect). |
| `filterText` | string | `""` | Whole-word text filter list. |
| `swipeAnywhereToNavigate` | bool | false | Disables right-side swipe actions; enables anywhere-back-swipe. |
| `postSwipeOptions` | object | `{farRight:"downvote", right:"upvote", farLeft:"bookmark", left:"hide"}` | Post swipe→action mapping. |
| `dataMode` | object | `{wifi:"normal", cellular:"normal"}` | Low-data behavior per connection type. |
| `defaultPostSort` | string | `"default"` (= don't force) | Global default post sort. |
| `defaultPostSortTop` | string | `"all"` (fallback only) | Global default Top time range. |
| `rememberPostSubredditSort` | bool | (unset → falsy/off) | Per-subreddit sort memory on/off. |
| `PostSubredditSort-<sub>` | string | none | Remembered sort for one subreddit. |
| `PostSubredditSortTop-<sub>` | string | none | Remembered Top time range for one subreddit. |
| `sortHomePage` | bool | (unset → falsy/off) | Whether default/remembered sort applies to Home at all. |
| `has_already_offered_gallery_mode` | bool | false | One-time Gallery Mode suggestion flag. |
| `favoriteSubreddits:<userId>` | JSON string array | `[]` | Per-account favorited subreddit names (KeyStore, not MMKV hook, but same underlying local storage). |

## Open questions / ambiguities

1. **AI (Smart) Filters** are fully documented as a shipping Hydra Pro feature but
   have zero implementation anywhere in this codebase snapshot. A from-scratch iOS
   rewrite needs a product decision on whether to build this net-new (spec: text-only
   analysis of title+subreddit+text against a free-text description or preset,
   applies to feeds/subreddits but not search/profiles/gallery) or omit it.
2. **Poll voting** in the feed card is visually complete but functionally a no-op
   (`alert("voted")`, no API call, no result percentages). Unclear whether this is a
   known stub awaiting implementation or intentionally deferred to the post-detail
   view (which was out of this survey's scope — worth checking against the comments/
   post-detail survey area for whether a *working* poll vote exists there).
3. **`showPostSummary`, `liveTextInteraction`** settings are defined in
   `PostSettingsContext` but no consumer of them appeared in any file this survey
   read in full; they may be consumed by post-detail-page or HTML-rendering files
   outside this area's assignment (worth cross-checking with the post-details survey
   agent).
4. **Exact pixel-center vs. index-center for Focused Post**: `pickCenterMostVideo`
   approximates viewport center using the midpoint of the min/max *viewable index*,
   not true pixel geometry (FlashList view tokens expose indices, not offsets, per
   the source comment). For a feed with wildly varying cell heights this could pick
   a video slightly off from the visual center; treated here as intentional/accepted
   behavior per the code comments, but worth confirming against real-device feel
   during the Swift rewrite rather than assuming pixel-perfect centering is required.
5. **Single global focus key** is explicitly called out in the source as a scoping
   limitation if two focus-managed feeds are ever mounted simultaneously (not
   currently reachable via any navigation path found in this survey, but split view
   plus some future layout could expose it). Not a behavior to reproduce so much as a
   constraint to be aware of if the Swift rewrite's navigation model differs.
6. **`interactionDisabledStatus` (locked/archived)** is present on the `Post` data
   type but intentionally never surfaced on the feed card itself (only on Post
   Details) — confirmed by absence of any reference in `PostComponent.tsx`; flagged
   here explicitly since a naive rewrite might assume every field on the data model
   should appear somewhere in the card.
7. **Crosspost long-press/tap semantics**: `CrossPost.tsx`'s outer card navigates to
   the *crosspost's own* `post.link`, while its embedded `PostMedia`/footer reflect
   the *original* post's content and counts. Whether long-pressing inside that
   embedded media area (e.g. the original's inline image) triggers the original
   post's media context menu (yes, per `ImageViewer`'s own menu) versus the outer
   card's long-press menu (which belongs to the crosspost, not the original) was not
   exhaustively traced through gesture-conflict resolution — flagged for double-
   checking against the native-context-menu nesting behavior described in
   `NativeContextMenu.tsx`'s own comment ("menus nest... a press-and-hold on the
   inner one opens the inner menu"), which appears authoritative but wasn't traced
   end-to-end for the crosspost's outer `TouchableOpacity` specifically (crosspost's
   outer wrapper is a plain `TouchableOpacity`, not itself wrapped in
   `NativeContextMenu` — so a crosspost card has **no** long-press menu of its own at
   all; only its embedded media's own long-press/native-menu works). This is worth a
   quick confirming re-read if crosspost behavior proves important to the rewrite.
