# 04a — Feeds, Post Cards, and Post Details / Comments (SwiftUI Implementation Spec)

**Target:** `APPNAME`, a from-scratch native SwiftUI iPhone Reddit client.
**Platform floor:** iOS 26.0, built with the iOS 27 SDK, Swift 6.4, strict concurrency with
default `MainActor` isolation (off-main work marked `@concurrent`).
**Companion documents:** `02-architecture.md` (stores, routing, theming, DI, feature-gate seam),
`03-data-and-networking.md` (the `RedditAPI` actor, endpoint IDs, model types, GRDB schema),
`04b-media.md` (fullscreen viewer, video, gallery mode, download/share),
`04c-accounts-inbox-search-subs-settings.md` (accounts, inbox, search, sidebar, the settings tree),
`05-monetization.md` (binds every `[GATE: gate.*]` tag below to a paid/free matrix),
`06-build-plan-and-acceptance.md`, `07-one-shot-prompt.md`, `08-decisions-and-drift.md` (resolves every
`[DECISION: <id>]` tag below).

This document is **clean-room**: it reproduces *behavior* observed in the original app's current
code. UI label strings and error strings are quoted verbatim where the surveys quote them, because
they are functional copy. No original source, art or documentation prose is reused.

**Scope note — iPad.** iPhone only for v1. The original's iPad split-view feed/detail pane pairing is
out of scope; do not build `NavigationSplitView`, the split-pane feed column, or the floating
close/fullscreen pane controls. Every "tapping a post opens the detail pane" branch collapses to a
plain `NavigationStack` push. `[DECISION: ipad-split-view-deferred]`

---

## 1. Conventions used by this document

### 1.1 Architectural vocabulary

| Term | Meaning in this doc |
|---|---|
| `Route` | The per-tab typed navigation enum from `02-architecture.md` §5.5. Cases referenced here, spelled exactly as that document declares them: `.subreddits`, `.home(FeedTarget)`, `.subredditFeed(FeedTarget)`, `.multiredditFeed(FeedTarget)`, `.userProfile(UserTarget)`, `.postDetail(PostTarget)`, `.subredditSearch(SubredditSearchTarget)`, `.sidebar(SubredditName)`, `.wiki(WikiTarget)`, `.gallery(FeedTarget)`, `.webView(WebViewTarget)`, `.unsupported(URL?)`. |
| Store | An `@Observable final class` owned by a screen (or by the app, where noted), held in `@State` at the screen root and passed down by `@Environment` or plain property. |
| `Settings` | The app-wide `@Observable` settings object with typed keys (`02-architecture.md`). Every key name in this document is the *typed key name*; persistence format is the architecture doc's concern. |
| `Theme` | The `@Environment(\.theme)` value. Named color roles used below: `text`, `subtleText`, `verySubtleText`, `background`, `tint`, `divider`, `iconOrTextButton`, `iconPrimary`, `iconSecondary`, `buttonBg`, `buttonText`, `upvote`, `downvote`, `delete`, `showHide`, `reply`, `bookmark`, `share`, `collapse`, `moderator`, `commentDepthColors`. Full palettes: `04c` §Theme picker. |
| `RedditAPI` | The `actor` from `03-data-and-networking.md`. Endpoint IDs (`P1`, `C1`, `V1`, …) are that document's IDs. |
| `[GATE: gate.*]` | A paid/free boundary. The call site routes through the `Entitlements` seam — `entitlements.isUnlocked(.<case>)`, or the `requiresEntitlement(_:style:)` view modifier. The gate ids are **exactly** the eleven `gate.*` identifiers defined in `05-monetization.md` §4; nothing else is a gate. Before Phase 8, `FreeEverythingProvider` makes every gate return `true` (`02-architecture.md` §13.4). |
| `[DECISION: <id>]` | A place where the shipped code and the original's own documentation disagree, or where the code is a known stub/bug. The id is the canonical id of a numbered entry in `08-decisions-and-drift.md` §1/§2 (or of a row of its §3 drift table), and **that register's "Default (assumed)" column is what this document specs** — where the two ever read differently, the register wins. |

### 1.2 Products explicitly not built

AI post summaries, AI comment summaries, AI ("smart") post filters, and push notifications are **not
specified anywhere** in this document set. They were removed by the owner. The original's dead
settings for them (`showPostSummary`, `showCommentSummary`) are not carried forward.
`[DECISION: post-summary-dead-setting]` `[DECISION: comment-summary-dead-setting]`

A subscription paywall **entry point** does exist (a Settings row and a presentable
`PaywallView` placeholder) — see `04c` §Settings root and `05-monetization.md`. Nothing in this
document presents it directly; feature gates only *query* entitlements and, on a `false`, present
the paywall sheet via the shared `PaywallPresenter` from `02-architecture.md`.

### 1.3 Shared numeric constants (single source of truth)

| Constant | Value | Used by |
|---|---|---|
| `SHORT_SWIPE_THRESHOLD` | 75 pt | Post & comment row swipes |
| `LONG_SWIPE_THRESHOLD` | 130 pt | Post & comment row swipes |
| `SWIPE_ENGAGE_X_POST` | 20 pt | Horizontal activation slop, posts |
| `SWIPE_ENGAGE_X_COMMENT` | 15 pt | Horizontal activation slop, comments |
| `SWIPE_FAIL_Y` | 10 pt | Vertical movement that cancels a row swipe |
| `FEED_PAGE_LIMITS` | `[10, 20, 40, 70, 100]` | Feed filter-retry ramp |
| `GALLERY_PAGE_LIMITS` | `[10, 30, 50]` | Gallery-mode filter-retry ramp |
| `FILTER_RETRIES_FEED` | 5 | Feed |
| `FILTER_RETRIES_GALLERY` | 3 | Gallery mode |
| `COMMENT_PAGE_LIMIT` | 75 | Post detail first fetch |
| `MORE_CHILDREN_BATCH` | 10 | "N more replies" per tap |
| `LOAD_MORE_SCREENS` | 2 | Prefetch distance from list end |
| `HIDDEN_POST_EXPIRY` | 30 days | Local hide |
| `MAX_SEEN_POSTS` | 5 000 | GRDB pruning |
| `MAX_DRAFTS` | 100 | GRDB pruning |
| `COMMENT_DEPTH_INDENT` | 10 pt per level | Comment rows |
| `SEEN_POST_OPACITY` | 0.75 | Post card dimming |
| `GALLERY_OFFER_MIN_POSTS` | 100 | Gallery-mode offer |
| `GALLERY_OFFER_MEDIA_RATIO` | 0.85 | Gallery-mode offer |

---

## 2. Feed infrastructure (shared by every listing screen)

Every listing screen in this document — Home, subreddit, r/all, r/popular, multireddit, user feed
variants, in-subreddit search results, gallery mode — is backed by one generic store.

### 2.1 `ListingStore<Item>`

```
@Observable final class ListingStore<Item: ListingItem> {
    private(set) var items: [Item] = []
    private(set) var phase: Phase            // .initial, .loading, .loaded, .refreshing
    private(set) var isLoadingMore = false
    private(set) var fullyLoaded = false     // a page returned 0 raw items
    private(set) var hitFilterLimit = false  // retries exhausted, everything filtered
    private(set) var accessFailure: AccessFailure?   // banned/private/notFound/multiUnavailable
    private(set) var loadFailed = false
    private var unfilteredCursor: String?    // last RAW item's fullname, not listing.after
    var filterRules: [FilterRule<Item>]
    var pageLimits: [Int]
    var filterRetries: Int
}
```

**Load-more algorithm** (exactly reproduce):

1. Guard: refuse if `isLoadingMore`, `fullyLoaded`, `hitFilterLimit`, or `accessFailure != nil`.
   An **access failure** (banned / private / user-not-found / multireddit-unavailable) short-circuits
   the whole loop, is rendered by `AccessFailureView` (§2.2), and is **not** reported to the crash
   reporter — it is Reddit's answer, not our defect. **Any other** thrown error sets `loadFailed`,
   clears the spinner, and **is** sent to the crash reporter as a captured exception with the route
   as context, so a parser regression on one feed shape is visible rather than silent.
2. For `attempt` in `0..<filterRetries`:
   a. Fetch one page with `limit = pageLimits[min(attempt, pageLimits.count-1)]` and
      `after = unfilteredCursor`. On the very first page for a feed, `after` is the **empty string**
      (feeds always send the parameter); for non-feed endpoints it is omitted.
   b. Set `unfilteredCursor` to the **last raw item's own fullname** — not the listing envelope's
      `after`. `[DECISION: pagination-cursor]` The cursor advances on **every** attempt, including
      one whose items are *all* filtered out. Not advancing it there is the classic failure of this
      loop: the ramp re-requests the same page five times, the retries look like they are doing
      something, and the feed dead-ends on a filter the user could have scrolled past.
   c. If the raw page is empty → `fullyLoaded = true`; stop the loop entirely.
   d. Apply, in order: de-duplication against already-loaded items (match on `id` **and** `kind`),
      then every rule in `filterRules`.
   e. If ≥1 item survived → append and return.
3. If the loop completes with nothing appended → `hitFilterLimit = true`. All further load-more
   calls are refused until a refresh.

**Refresh** (pull-to-refresh, or a change to a refresh dependency such as sort/search text):
reset `unfilteredCursor`, `fullyLoaded`, `hitFilterLimit`, `loadFailed`, `accessFailure`; clear
`items` synchronously when triggered by a dependency change (sort/search), and re-run the same
retry loop **without** the de-dup rule (there is nothing to de-dup against). Replace `items` with
the result.

**Trigger for load-more:** `LOAD_MORE_SCREENS` (2) screen-heights from the end. In SwiftUI, do this
with `.onScrollTargetVisibilityChange(idType: Item.ID.self, threshold: 0.01)` on the scroll view and
compare the highest visible index against `items.count`, **or** by placing a zero-height sentinel row
two viewport-heights above the end and calling `loadMore()` from its `.onAppear`. Prefer the former;
per the 2026 baseline, lazy-stack `onAppear` can be skipped during prefetch.

**Mutation helpers:** `modify(id:kind:_ transform:)` replaces in place; `delete(id:kind:)` removes;
`deleteAll()` clears. Feed rows mutate through these so that a vote/save/hide in a cell is reflected
without a refetch.

### 2.2 Footer / empty / error states (exact copy)

Rendered as the list's footer view, evaluated in this order:

| Condition | Rendered |
|---|---|
| `accessFailure != nil` | `AccessFailureView` replaces the **entire** list (not a footer) — see table below |
| `loadFailed` | `Text("Something went wrong loading this. Pull down to try again.")`, centered, `theme.subtleText`. The spinner is explicitly cleared. |
| `hitFilterLimit` | `Text("The filter limit has been reached. Your filters may be too strict to show anything.")` |
| `fullyLoaded && !items.isEmpty` | `Text("Wow. You've reached the bottom.")` |
| `isLoadingMore` | `ProgressView()` |
| otherwise | nothing |

**Empty feed:** if the first load returns zero surviving posts and none of the above apply, the list
renders **empty with no message** — the initial spinner is simply cleared. Do not invent an empty
state. (`fullyLoaded` with `items.isEmpty` renders nothing, because the "bottom" copy requires at
least one item.)

**`AccessFailureView`** — centered, `theme.subtleText`, no retry button, replaces the whole content
area:

| Failure | Exact string |
|---|---|
| Private subreddit | `🔑 r/<name> has been set to private by its subreddit moderators` |
| Banned subreddit | `🚫 r/<name> has been banned by Reddit Administrators for breaking Reddit rules` |
| Banned/suspended user | `🚫 <name> has been banned` |
| Nonexistent user | `🚫 <name> does not exist` |
| Multireddit unavailable | `🔑 Reddit wouldn't share this multireddit. It may be private, deleted, or only visible to the account that owns it.` |

`<name>` is taken from the **route's** path segment (what the user navigated to), not from a fetched
display name.

**Quarantined / gated subreddit** (detected by the API layer, `03` §gated): present
`.alert("Warning", …)` with Reddit's own message verbatim and buttons `Cancel` / `Proceed`. Cancel →
the listing resolves to an empty array and no further request is made. Proceed → the API layer POSTs
the acceptance and re-issues the original request exactly once.

**After Cancel the store must not re-prompt in a loop.** Cancelling sets `fullyLoaded` on the store,
so the screen settles as an empty feed and the next `onAppear` issues **nothing** — returning to the
tab, popping back to it, or a scroll that would normally trigger load-more all do nothing. The only
thing that re-presents the interstitial is an explicit **pull-to-refresh**. Without this the user
gets the same warning alert every time the view re-appears.

### 2.3 Filter rules

Applied in this order, as `FilterRule<Post>` values composed by the screen:

| Rule | When present | Behavior |
|---|---|---|
| `dedupe` | load-more only | Drops items already present by (`id`, `kind`). |
| `nonMedia` | gallery mode only | Drops posts with zero images **and** zero videos. |
| `hidden` | **always**, unconditionally | Drops posts with a non-expired row in `hidden_posts`. |
| `seen` | when `hideSeen(for: route)` is true | Drops posts present in `seen_posts`. |
| `text` | **always** (a nil/empty filter list trivially passes) | See §7.3. |
| `subreddit` | only on **combined** feeds | See §7.2. |

"Combined feed" = Home, `r/all`, `r/popular`, or any multireddit. A single subreddit's own page is
never subject to the subreddit filter.

### 2.4 Pull-to-refresh

`.refreshable { await store.refresh() }` on the enclosing `List`/`ScrollView`. Fire
`hapticAction()` (a `.sensoryFeedback(.impact(weight: .medium), trigger:)` on the refresh trigger)
when the refresh actually commits.

### 2.5 Scroll-to-top

Tapping the **currently active** tab pops one level off that tab's `NavigationStack` (see
`02-architecture.md` §tab re-tap). There is no separate scroll-to-top gesture beyond the system
status-bar tap. Note the iOS 26/27 hazard from the baseline: an interactive custom navigation-bar
title (the subreddit switcher, §8) must not be swallowed by the system scroll-to-top tap — in SwiftUI
attach the switcher's tap as a `.highPriorityGesture` on the toolbar principal item and verify on
device.

---

## 3. The feed screens

All feed screens are one SwiftUI view, `PostFeedScreen(target: FeedTarget)`, differing only in
`FeedTarget` and a handful of per-target toggles.

```
enum FeedTarget: Hashable {
    case home(sort: PostSort?, time: TopTime?)
    case subreddit(name: String, sort: PostSort?, time: TopTime?)   // incl. all, popular
    case multireddit(owner: String, name: String, sort: MultiSort?, time: TopTime?)
    case user(name: String, section: UserSection, sort: UserSort?, time: TopTime?)
    case subredditSearch(subreddit: String, query: String, sort: SearchSort?, time: TopTime?)
}
enum UserSection { case overview, submitted, comments, upvoted, downvoted, hidden,
                        savedPosts, savedComments }
```

### 3.1 View hierarchy

```
PostFeedScreen
├─ List (.listStyle(.plain), separators hidden, row insets zeroed)
│  ├─ [ListHeader] InSubredditSearchBar          // only for .subreddit
│  ├─ ForEach(store.items) { PostRow / CommentRow }   // user feeds mix both
│  │   └─ .swipeActionsContainer + custom pan (see §7.1)
│  └─ ListFooterView(store)
├─ .refreshable
├─ .overlay(alignment: .bottomTrailing) { FeedVideoFABs }   // §9
├─ .toolbar { principal: SwitcherTitle | Text(title); trailing: SortButton, ContextMenuButton }
└─ .navigationDestination(for: Route.self) { … }   // owned by the tab root
```

**The feed is frozen, not torn down, while a screen sits on top of it.** Pushing a post detail (or
switching tabs) keeps the screen's `ListingStore` alive with its `items`, both cursors and its
`fullyLoaded` / `hitFilterLimit` flags intact — SwiftUI retains the stack entry, so this is free
(`02-architecture.md` §6.2, §6.3). On losing visibility the screen releases **video focus** (§9) and
cancels prefetch, and nothing else. On regaining it, the feed **does not re-fetch**: scroll position
and loaded items are exactly as they were, with no network call. State that changed elsewhere — a
vote cast on the detail screen — arrives through the `FeedMutationBus` and patches the one row
(§7.4).

### 3.2 Per-target configuration table

| Target | Header title | Switcher title? | Search bar in list header? | Sort options | Context ("…") options | Endpoint |
|---|---|---|---|---|---|---|
| `.home` | switcher | yes | no | Best, Hot, New, Top, Rising | Open in Gallery Mode, Show/Hide Seen Posts, Share | P1 |
| `.subreddit` (incl. `all`, `popular`) | switcher (subreddit name) | yes | **yes** | Best, Hot, New, Top, Rising | Subscribe/Unsubscribe, Favorite/Unfavorite, Add to Multireddit, New Post, Open in Gallery Mode, Show/Hide Seen Posts, Sidebar, Wiki, Share | P1 |
| `.multireddit` | switcher (multi name) | yes | no | Hot, New, Top, Rising, Controversial (**no Best**) | Open in Gallery Mode, Share | P2 via M2/M3 chain |
| `.user` | username | no | no | New, Hot, Top — **only** on `.submitted` and `.comments`; no sort control on any other section | (user page menu — see `04c` §User page) | U2 |
| `.subredditSearch` | `"Search"` | no | yes (prefilled with `q`) | Relevance, Hot, New, Top, Comment Count | Share | P3 |

- Selecting **Top** always opens a second-level menu: Hour, Day, Week, Month, Year, All.
- Applying a sort **rewrites the route in place** (`path[path.count-1] = newRoute`) — it does not
  push a new screen. The store's refresh dependency `[searchText, sort, time]` then clears and
  refetches.
- The sort **icon** in the toolbar reflects the *current* route's sort, independent of which options
  that page type offers: `trophy` (best/unset), `flame` (hot), `clock` (new), `chart.bar` (top),
  `chart.line.uptrend.xyaxis` (rising), `arrow.triangle.swap` (controversial), `hourglass` (old),
  `bubble.left.and.bubble.right` (q&a), `magnifyingglass` (relevance), `text.bubble` (comment count).
  Unrecognized → trophy.
- Expose each sort option as an `.accessibilityAction(named:)` on the sort button so VoiceOver can
  pick one without opening the menu.

### 3.3 Multireddit feed specifics

A multireddit feed is **not** fetched from the multireddit's own listing. Resolve the member
subreddit names (endpoint M2 with its three-source fallback chain), then fetch the merged
`r/a+b+c` listing (P2). If the definition says the multi has **zero** subreddits, return an empty
array with no request — render as a normal empty feed, **not** as an error. "Normal" is literal: the
header, the switcher title, the sort control and the "…" menu all render exactly as they would on a
populated multireddit, and only the list is empty (with no message, §2.2). The empty case must never
reach `AccessFailureView`; that view is reserved for `multiUnavailable`. If the merged listing
fails for any reason other than banned/private, fall back to the multireddit's own listing; if that
also fails, surface `AccessFailure.multiUnavailable`. Details in `03-data-and-networking.md`.

### 3.4 User feed variants

`UserFeedScreen` is `PostFeedScreen` with a header. The header (`UserDetailsHeader`) is rendered
**only** on `.overview` (the bare `/user/<name>` route); every deeper section hides it.

| Section | Route path | Offered when | Rows |
|---|---|---|---|
| Overview | `/user/<n>` | always | mixed posts + comments |
| Posts | `/user/<n>/submitted` | always | posts |
| Comments | `/user/<n>/comments` | always | comments (in `displayInList` mode, §14.4) |
| Upvoted | `/user/<n>/upvoted` | own profile only | posts |
| Downvoted | `/user/<n>/downvoted` | own profile only | posts |
| Hidden | `/user/<n>/hidden` | own profile only | posts |
| Saved Posts | `/user/<n>/saved?type=links` | own profile only | posts |
| Saved Comments | `/user/<n>/saved?type=comments` | own profile only | comments |

"Own profile" is determined by the presence of `inbox_count` in the `/about` response, not by string
comparison. Full header/stat/menu spec is in `04c` §User page.

---

## 4. The post card

`PostRow` renders one post. Two mutually exclusive layouts controlled by `Settings.postCompactMode`
(default: `false` on iPhone — the original's default was "true on ≥768pt screens", which on an
iPhone-only build is always false).

Container for both: 12 pt vertical / 10 pt horizontal padding, 10 pt spacing between direct
children, background `theme.background`, `.opacity(post.seen ? 0.75 : 1.0)`. Cards are separated by
a divider strip: **10 pt tall** in normal mode, **1 pt hairline** in compact mode, filled
`theme.divider`.

> **Static subview count.** Per the 2026 scrolling guidance, a feed row must not produce a *dynamic*
> number of subviews. Decide the card's media branch (§4.5) from the post's data in an enum computed
> once at model time (`post.mediaKind`), and render exactly one `MediaContainer` whose internal
> content switches — never `if hasVideo { … }; if hasImages { … }` at the row's top level.

### 4.1 Normal layout (top → bottom)

```
VStack(alignment: .leading, spacing: 10) {
    if settings.subredditAtTop && target.isCombinedFeed { SubredditRow() }
    TitleText()
    if settings.showPostFlair, let flair = post.postFlair { FlairChip(flair) }
    PostMediaView(post)                       // §4.5
    MetadataRow()                             // §4.11
}
.overlay(alignment: .bottomTrailing) { if post.saved { SaveNotch() } }
```

### 4.2 Compact layout

`HStack` (or `.reversed` when `Settings.showThumbnailsOnRightSide` is true, in which case the row's
alignment also becomes space-between):

```
HStack {
    CompactThumbnail(post)                    // fixed 60×60, 10pt corner radius, bg theme.tint
    VStack(alignment: .leading) {
        TitleText()                            // 16 pt in compact
        if settings.showPostFlair, let f = post.postFlair { FlairChip(f) }
        MetadataRow()
    }
}
```

Compact mode renders **no** inline media, **no** self-text preview, and never mounts a video player.

### 4.3 Subreddit + author row

- Shown **above the title** only when `Settings.subredditAtTop` is on **and** the feed is a combined
  feed. Otherwise the same icon+name appears inline in the metadata row, immediately before
  `" by "`.
- `SubredditIcon`: 20×20 circle. Rendered only when `Settings.showSubredditIcon` is on **and** the
  current data mode is `.normal`. In low-data mode nothing at all is drawn — not a placeholder.
  If the subreddit has no icon URL, draw the generic snoo glyph instead of a remote image.
- Sticky posts prefix the row with a pin glyph in `theme.moderator`.
- Author name: bold, 14 pt, tappable → `Route.userProfile(.overview(name:))`. Color `theme.moderator` when
  `post.isModerator`, else `theme.subtleText`.
- There is **no** lock or archived badge on the feed card. `post.interactionDisabledStatus` exists on
  the model but is surfaced only on the detail screen.

### 4.4 Title and flair chip

- Title: `.lineLimit(settings.postTitleLength)`, range 1–10, default 2 (the setting has no `0` case;
  `03` §8.1).
  17 pt normal / 16 pt compact, whitespace-trimmed.
- Flair chip: shown only when `Settings.showPostFlair` **and** `post.postFlair != nil`. The model
  only populates `postFlair` when Reddit returned **both** `link_flair_template_id` and
  `link_flair_text`; a free-text-only flair shows no chip. The chip is a rounded rectangle filled
  `theme.divider` (the flair's own Reddit color is **not** used) with the decoded text in
  `theme.text`.

### 4.5 Inline media presentation (normal mode only)

`PostMediaView` picks exactly one branch, in this precedence order, and then *independently* appends
a poll if present:

| # | Branch | Condition | Renders |
|---|---|---|---|
| 1 | **Crosspost** | `post.crossPost != nil` | `CrosspostCard` — short-circuits; branches 2–5 never run |
| 2 | **Video** | `!post.videos.isEmpty && post.crossCommentLink == nil` | `FeedVideoView` (§9, details in `04b`) |
| 3 | **Image(s)** | `!post.images.isEmpty && post.crossCommentLink == nil && post.externalLink == nil` | `FeedImageStrip` (§4.6) |
| 4 | **Link card** | `post.externalLink != nil \|\| post.crossCommentLink != nil` | `LinkPreviewCard` (§4.8) |
| 5 | **Body text** | otherwise, and `settings.postTextLength != 0` | `Text(post.text)` clamped to `postTextLength` lines (default 3). `0` suppresses the block entirely. |
| — | **Poll** | `post.poll != nil` | `PollCard` (§4.9), rendered *after* whichever of 1–5 ran |

Note the quirk in branch 3: a post with images **and** an external link shows the link card, not the
images.

Embedded-theme extraction: before rendering any body text, run `extractThemeTokens(from:)` (see
`04c` §Theme share/import). Matched tokens are stripped from the displayed text and each yields a
`ThemeImportChip` rendered inline. `[GATE: gate.customThemes]`

**Data mode before the first network-path update.** Until `NWPathMonitor` delivers its first path,
the effective data mode is conservatively **`.lowData`** (`04b` §13). The visible consequence on this
screen is that the very first paint after a cold launch may show **one** image in the strip instead of
two, and at the smallest variant, until the path lands a moment later. This is intentional — guessing
"normal" and then downgrading is worse than the reverse.

**NSFW / spoiler blur.** When `(settings.blurNSFW && post.isNSFW) || (settings.blurSpoilers &&
post.isSpoiler)`, overlay the whole media block with a `.thickMaterial`-equivalent blur plus a
centered pill: eye glyph + the label `"NSFW"` or `"Spoiler"` (NSFW wins if both apply). Tapping the
cover reveals the media for the lifetime of that row's state; reveal state is keyed on `post.id` so
recycled/reused rows never show another post's revealed state. Tapping the cover does **not** mark
the post seen and does **not** navigate. Both defaults are `true`.

### 4.6 Feed image strip

- Shows `min(2, images.count)` images side by side in an `HStack`, except in low-data mode where it
  shows exactly **1** and requests only the smallest resolution variant.
- Each cell height = `min(0.6 × screenHeight, width / post.mediaAspectRatio)`; with two cells that
  height is split between them.
- A badge reading `"<N> IMAGES"` appears bottom-right whenever `images.count >= 2` — it always
  states the *total*, even when only two are shown.
- Tap → open the fullscreen viewer at that image's index (`04b` §2) **and** call
  `interactedWithPost()` (marks seen). The first tap also permanently disables low-data downgrading
  for that row instance.
- Long-press → native `.contextMenu` with exactly: **Share Image**, **Save Image**, **Copy Image
  Link** (`04b` §3.4). There is no "Copy Image" (pixels) and no "Open in Browser".

### 4.7 Crosspost card

A bordered (1 pt `theme.divider`), 10 pt-radius card with 10 pt margins, entirely tappable, whose tap
target opens **the crosspost's own** post detail (`post.link`), while its contents render the
**original** post:

```
VStack {
    Text(crosspost.title).lineLimit(2)            // outer post's title
    PostMediaView(original, renderHTML: false)    // recursive, original's media
    HStack { SubredditIcon(original); Text("r/\(original.subreddit)");
             score, comment count, timeSince }     // original's numbers
}
```

The crosspost card has **no long-press menu of its own**. The embedded media's own long-press menu
(e.g. the image menu) still works and takes priority, since iOS context menus nest inner-first.
`[DECISION: crosspost-longpress]`

### 4.8 Link preview card (OpenGraph)

Bordered 3 pt in `theme.tint`, 10 pt radius, 10 pt margins.

If `openGraphData` has **both** `image` and `title`:
1. Cover image, fixed **200 pt** height, `.scaledToFill().clipped()`, 10 pt radius, 250 ms crossfade.
   **Rendered only when the data mode is `.normal`** — in low-data mode it is omitted entirely, not
   downgraded.
2. OG title, 1 line.
3. OG description, `.lineLimit(settings.linkDescriptionLength)` (default 10; `0` hides it entirely);
   only rendered if description text exists.
4. The raw URL, 1 line, small, `theme.subtleText` — **always** shown.

If title+image are not both present, the card degrades to a single line containing the bare URL.

Tap: if the URL parses as a Reddit URL, push the corresponding route; otherwise hand it to the
external-link opener (`04c` §External links). Either way, `interactedWithPost()` fires.

OpenGraph fetch rules (timeout, exclusions, `.svg` drop) live in `04b` §11 and
`03-data-and-networking.md`.

### 4.9 Poll card

Bordered, rounded. Header: the total vote count via `prettyNum` + `" votes"`.

**Read-only, with results. There is no Vote button and no selection state.** The original renders a
radio list whose "Vote" button calls a local alert and issues no request, so users believe they voted
when nothing happened. `APPNAME` renders the poll honestly instead (`03` §4.13,
`[DECISION: poll-voting-stub]`):

| Data available | Rendering |
|---|---|
| `poll.options[].voteCount` is present (Reddit supplies counts once the poll has closed, or once *this* account has voted elsewhere) | One row per option: the option text, its count, and a proportional bar whose width is `voteCount / max(totalVoteCount, 1)` filled `theme.tint` on `theme.divider`. The option matching `poll.userSelectedOptionID`, when set, is marked with a checkmark glyph and its text rendered in `theme.iconOrTextButton` |
| counts absent | One **inert** row per option — the option text only, no radio circle, no bar, no tap target — above the total vote count |

Below either form, one line in `theme.subtleText`:
**"Voting on polls isn't supported."** When `poll.endsAt` is in the future, append
`" Poll ends in <prettyTimeSince(endsAt)>."`

Nothing on the card is tappable and nothing is ever sent. Poll *creation* is unsupported too —
`NewPostSheet` offers Text/Link/Image only (§16.5).

### 4.10 Compact thumbnail

60×60, 10 pt radius, `theme.tint` background. Content by the same precedence, minus crosspost
recursion (a crosspost in compact mode uses the **crosspost's own** fields):

| Priority | Condition | Content | Tap |
|---|---|---|---|
| 1 | video, no `crossCommentLink` | preview thumbnail + small play-circle overlay bottom-right; generic video glyph if no thumbnail | opens the fullscreen **video** viewer directly |
| 2 | images | thumbnail + count badge (only if >1) in the same corner; generic image glyph fallback | opens the fullscreen **image** viewer directly |
| 3 | poll | generic poll glyph, centered | inert (only the outer card's tap applies) |
| 4 | external / cross-comment link | generic link glyph; plus the OG image as the thumbnail background when one exists **and** data mode is `.normal`; in low-data the glyph is drawn larger/centered instead | outer card tap |
| 5 | plain text | generic document glyph, centered | outer card tap |

The NSFW/spoiler blur overlay applies here too, with its own independent reveal state (compact mode
never renders `PostMediaView`, so there is exactly one blur toggle per card).

### 4.11 Metadata row

A single wrapping `HStack`, `theme.subtleText` unless noted:

- Vote glyph + the upvote count through **`prettyNum`** (K/M/B, §5). The glyph is `arrow.up` unless
  the user's current vote is a downvote, in which case it is `arrow.down`; there is no neutral glyph.
  Tint: `theme.upvote` if upvoted, `theme.downvote` if downvoted, else `theme.subtleText`. The
  original printed the raw integer here, so a big thread rendered `128437` in a feed row; that is a
  defect, not a style, and `08` #33's default abbreviates it. `[DECISION: number-format-parity]`
- Comment glyph + `commentCount`, through the same `prettyNum`.
- Clock glyph + `post.timeSince` (long form, produced by the model layer; the card appends nothing).
- Optional inline subreddit icon + name + `" by "` + author when `subredditAtTop` is off.
- **No** upvote ratio, **no** awards anywhere (awards are not modeled at all).

These footer controls are **display-only** in the feed. There is no tappable vote button on a feed
card; voting happens via long-press menu, swipe, or accessibility action.

### 4.12 Save notch

When `post.saved`, draw a small solid triangle (15×15, `theme.bookmark`) pinned to the card's
bottom-right corner, overlapping the edge. Decorative; not a tap target.

---

## 5. Time and number formatting (exact)

Both formatters must be reimplemented literally; `RelativeDateTimeFormatter` and
`.formatted(.number)` produce different output.

`prettyTimeSince(_:)` from `|now − t|`, floor at every tier, strict `<` boundaries:

| Bucket | Long | Short |
|---|---|---|
| < 60 s | `"<n> second(s)"` | `"<n>s"` |
| < 60 min | `"<n> minute(s)"` | `"<n>m"` |
| < 24 h | `"<n> hour(s)"` | `"<n>h"` |
| < 30 d | `"<n> day(s)"` | `"<n>d"` |
| months = floor(days/30) < 12 | `"<n> month(s)"` | `"<n>mo"` |
| else years = floor(days/365) | `"<n> year(s)"` | `"<n>y"` |

Pluralization is `n == 1 ? "" : "s"`. Post/comment timestamps append `" ago"`; account/subreddit ages
append `" old"`. **Known seam:** a 360–364-day-old item falls through to the years branch and reports
`"0 years"`. Reproduce. `[DECISION: time-format-parity]`

`prettyNum(_:)` — strictly-greater-than thresholds, always exactly one decimal:
`> 1e9 → "<x>B"`, `> 1e6 → "<x>M"`, `> 1e3 → "<x>K"`, else the raw integer with no grouping.
Exactly 1000 prints `"1000"`.

---

## 6. Tap targets on a post card

| Target | Action | Marks seen? |
|---|---|---|
| Card body | Push `Route.postDetail(PostTarget(post))` | **yes**, synchronously before navigating |
| Subreddit icon / name | Push `Route.subredditFeed(.subreddit(name))` | no |
| Author name | Push `Route.userProfile(.overview(name))` | no |
| Inline image / video / link | Open viewer or link, and `interactedWithPost()` | **yes** |
| Poll option / Vote | Local only | no |
| NSFW/spoiler cover | Reveal | no |
| Compact thumbnail (image/video) | Open the fullscreen viewer directly (not the post) | **yes** |

Upvote, Downvote and Save do **not** mark a post seen. Only "Mark as Read", the card tap, and media
taps do.

---

## 7. Feed interactions

### 7.1 Swipe gestures

Implement with a custom `DragGesture` on each row (not `List`'s built-in `swipeActions`), because
the behavior is four-banded with mid-drag haptics, per-band icon swapping, and a configurable action
map. On iOS 27 the new `swipeActions(edge:allowsFullSwipe:content:onPresentationChanged:)` works
outside `List`, but it does not give the 75/130 two-band semantics, so keep the custom gesture and
use `onPresentationChanged` only if you later adopt the system affordance. Track everything on the
UI thread: the drag translation drives a `@State` offset and the band is derived purely.

**Activation.** The pan must fail if vertical movement exceeds `SWIPE_FAIL_Y` (10 pt) so the list can
scroll. Horizontal activation slop is `SWIPE_ENGAGE_X_POST` (20 pt) for posts and
`SWIPE_ENGAGE_X_COMMENT` (15 pt) for comments.

**Bands.** Absolute horizontal translation buckets into: `0` (< 75), `±1` (75 ≤ |x| < 130),
`±2` (|x| ≥ 130). A long slot that is **unset** falls back to the **same direction's short action**,
so a user who assigns only `right` still gets that action from a long right swipe rather than an
inert band. `Disabled` is an explicit value and **never** falls back — it means "this band does
nothing". Unset and `Disabled` are therefore different states and must be modelled as such
(`spec/09` §6.1). Positive translation (dragging right) reveals an icon anchored to the **left**
edge; negative reveals on the right. The user-facing setting names are by drag direction:

| Setting key | Drag | Band | Post default | Comment default |
|---|---|---|---|---|
| `postSwipeOptions.right` / `commentSwipeOptions.right` | right, short | +1 | `upvote` | `upvote` |
| `…farRight` | right, long | +2 | `downvote` | `downvote` |
| `…left` | left, short | −1 | `hide` (= Mark as Read) | `reply` |
| `…farLeft` | left, long | −2 | `bookmark` | `bookmark` |

**Available actions.**

| Posts | Comments |
|---|---|
| Upvote, Downvote, Mark as Read, Bookmark, Share, Disabled | Upvote, Downvote, Reply, Bookmark, Share, Collapse, Collapse Thread, Disabled |

Note the post option internally named `hide` is wired to the **seen/unseen** toggle, not to the
Hide-Post action. Its label in the menu reads "Mark as Read" / "Mark as Unread".

**Icons and colors while revealed** (icon size 38 for posts):

| Action | Glyph | Color |
|---|---|---|
| Upvote | `arrow.up` | `theme.upvote` |
| Downvote | `arrow.down` | `theme.downvote` |
| Mark as Read | `eye.slash` / `eye` (reflects current seen state) | `theme.showHide` |
| Bookmark | filled/outline bookmark (reflects `saved`) | `theme.bookmark` |
| Share | share glyph | `theme.share` |
| Reply | reply glyph | `theme.reply` |
| Collapse | chevron expand/collapse (reflects `collapsed`) | `theme.collapse` |
| Collapse Thread | collapse-all glyph | `theme.collapse` |

**Feedback and commit.** Fire `hapticEngage()` (`.sensoryFeedback(.impact(weight: .light), trigger:
band)`) exactly once per band **transition**, including the transition back to band 0 — never
continuously. On release, if the final band is non-zero, run that band's action **immediately** (no
confirmation, not after the animation). Then spring the row back to 0 with damping 100 / stiffness
300 / overshoot clamped, and clear the revealed icon only once the spring settles. Lock the enclosing
list's scrolling for the duration of an active swipe and unlock on finalize — but only if *this* row
actually activated, so a sibling row's finalize can't clear the lock mid-flight.

**`swipeAnywhereToNavigate` interplay** (`Settings.swipeAnywhereToNavigate`, default `false`): when
on, clamp translation to `min(x, 0)` before banding and widen the rightward activation window to
infinity so the pan never claims a rightward drag. The consequence is that **the two right-swipe
bands become permanently unreachable on every row**; only the left-side actions work. This exists so
the system interactive-pop gesture can be recognized from anywhere on screen, which in SwiftUI means
enabling a full-screen back gesture on the `NavigationStack` (see `02-architecture.md`).

**Swap-on-conflict.** Assigning an action already used by another slot of the *same* set swaps the
two slots. `Disabled` is exempt and may occupy several slots. Post and comment maps never interact.

### 7.2 Long-press context menu (posts)

On iOS, use `.contextMenu` on the card so the user gets the native press-and-hold menu with a blurred
preview of the card. Do **not** also attach a `.onLongPressGesture` — the two fight.

Ordered items, each with a gate; items failing their gate are **omitted**, never shown disabled:

| # | Label | Shown when | Effect |
|---|---|---|---|
| 1 | `Upvote` | always | §7.4 |
| 2 | `Downvote` | always | §7.4 |
| 3 | `Mark as Read` / `Mark as Unread` (label flips on current state) | always | Toggles the `seen_posts` row |
| 4 | `Filter Subreddit` | the row is in a list that can remove itself (true on every feed) | Opens a **nested** menu: `Filter for a day` / `Filter for a week` / `Filter forever` → writes `now+24h`, `now+7d`, or `true` into `filteredSubreddits[subreddit]`, then removes the post from the current list immediately |
| 5 | `Hide Post` / `Unhide Post` | same | Writes/removes a `hidden_posts` row (30-day expiry) and removes the post from the list immediately when hiding |
| 6 | `Save` / `Unsave` | always | Endpoint V2 |
| 7 | `Share` | always | Share sheet with `post.link` — **always the Reddit permalink**, never the post's external link and never the media file. There is **no media share and no media save anywhere in a post's long-press menu**; those live only on the inline media's own long-press menu and in the fullscreen viewer's overlay (`04b` §9.3) |

Two further actions exist **only** as VoiceOver custom actions and never appear in the visual menu:

| Label | Shown when | Effect |
|---|---|---|
| `Read post contents` | always | Speaks a summary: external-link host, post text, video/image counts, poll presence, via `AccessibilityNotification.Announcement` |
| `Open external link to <host>` | `post.externalLink != nil` | Pushes it as an in-app route if it's a Reddit URL, else hands it to the external opener |

Every visible item above is *also* exposed as an `.accessibilityAction(named:)` on the row, so a
VoiceOver user gets the complete set without a long press.

iOS 27 note from the baseline: menus hide SF Symbol images by default in most contexts. Apply
`.labelStyle(.titleAndIcon)` to any menu `Label` that should keep its glyph.

### 7.3 Text filters

`Settings.filterText` is a single string. Parse it by splitting on `", "`, `"\n"`, and `","`;
lowercase; trim; drop empties. Build a character trie once and cache it, invalidating when the
setting changes.

Matching (`passesTextFilter(_:)`): walk the trie over the lowercased haystack. A hit only counts as a
match if the characters immediately before and after the matched span are absent (string boundary) or
non-word (`\W`) — i.e. **true whole-word matching**: `cat` matches `"the cat sat"` but not
`"catering"`. Multi-word phrases match as exact literal substrings under the same boundary rule
(spaces are ordinary trie characters). Any single match anywhere fails the entire item.

Post haystack (space-joined): **title, author, self-text, every poll option's text, OpenGraph title,
OpenGraph description.**
Comment haystack: **comment text + author.**

**One trie, two haystacks.** The same cached trie instance serves both the post filter and the
comment filter — there is no separate comment filter list, no second setting and no second trie. It is
built once from `filters.text` and invalidated only when that setting changes.

The rule is always in the chain; an empty list produces an empty trie that trivially passes. There is
no separate on/off toggle. `[GATE: gate.filters]`

### 7.4 Voting

One shared call for posts and comments (endpoint V1).

- If the requested direction equals the item's current vote, send direction `0` (retract). Tapping or
  swiping the same direction twice always undoes.
- Apply exactly:
  `upvotes = upvotes − oldUserVote + newResult; userVote = newResult`.
  This single expression handles up→down, down→up and either→none correctly.
- **Fix forward: the update is optimistic.** Apply the new state immediately, issue V1, and on failure
  **roll back** to the captured previous `(score, userVote)` and surface a transient, non-modal error
  (a brief inline toast on the row). The original applied nothing until the call resolved, so a slow
  network made every vote feel broken, and a failure was swallowed silently. No error ever escapes
  unhandled. `[DECISION: vote-no-optimistic-rollback]`
- A non-neutral outcome increments the local stat counter `post_upvotes` / `post_downvotes` (or
  `comment_upvotes` / `comment_downvotes`) by 1. Retracting decrements nothing.
- Colors: `theme.upvote` / `theme.downvote` / `theme.subtleText`, computed once per render and
  applied to both the glyph and the number.

**Cross-surface propagation (fix forward).** Vote (and save) state is owned by a single store keyed
by `Fullname`, and every surface observes it through the `FeedMutationBus` from
`02-architecture.md` §6.3. A vote cast on the post-detail screen therefore **patches the feed row
behind it** with no refetch. The original failed to do this and tracked it as an open bug.
`[DECISION: postdetail-vote-not-reflected]`

### 7.5 Save

Endpoint V2 with the item's fullname. **Fix forward, same shape as voting:** flip `saved`
optimistically, issue the call, and **roll back with a transient error** on failure. There is no
offline queue. The original leaked the rejection entirely.
`[DECISION: unhandled-save-failure]`

### 7.6 Hiding posts (local only)

Hiding never calls Reddit's own hide endpoint. `hidePost(_:)` upserts a row keyed by post id with
`expiresAt = now + 30 days`, denormalizing `title` and `subreddit` so the management screen can list
hidden posts without a network call. `isHidden` treats an expired-but-not-yet-swept row as **not
hidden**. Unhiding deletes the row outright. `maintainHiddenPosts()` hard-deletes expired rows at
each cold start. The hidden filter rule is always in the chain, unconditionally. The management
surface lives in Settings → Filters (`04c` §16.3). `[GATE: gate.filters]` — while locked, "Hide Post"
in the long-press menu opens the paywall and existing `hidden_posts` rows are preserved but not
applied.

### 7.7 Seen tracking

**What marks a post seen:**
1. Opening its detail screen (fires synchronously on the card's tap, before navigation).
2. Tapping its inline image, video, or link.
3. The explicit `Mark as Read` menu item / swipe action.
4. Scrolling past it, **only** when `Settings.autoMarkAsSeen` is on (default `false`): a post is
   marked the moment it transitions from visible to not-visible *while its index is still below the
   current maximum visible index* — i.e. it scrolled off the **top**, not off the bottom during a
   downward fling past a not-yet-rendered row. Implement with
   `.onScrollTargetVisibilityChange(idType: Post.ID.self)`, tracking the previous visible set and the
   running max index.

Toggling `filters.markSeenOnScroll` **takes effect immediately** — the feed reads the setting
reactively, so there is **no restart alert**. When the new value is `true` **and** hide-seen is also
on, show a non-blocking informational note: `"You may notice slower loads with this setting enabled
because all the hidden posts still have to be loaded in the background."`
`[DECISION: mark-seen-live]`

**Rendering.** Each row reads its own seen state on init (not `onAppear` — the 2026 lazy-stack
guidance) and subscribes to a per-post-id change publisher so that marking a post seen elsewhere
re-renders exactly that one row. Seen rows render at opacity 0.75; there is no "NEW" badge for unseen
posts.

**Storage.** GRDB table `seen_posts`, unique on `postId`; existence *is* the flag (no boolean
column). Marking an already-seen post is an idempotent no-op that does **not** refresh `createdAt`.
Capped at 5 000 rows; `maintainSeenPosts()` deletes the oldest by insertion order down to exactly the
cap at each cold start. The write must be awaited **before** the change event is published — this
ordering is load-bearing and is one of the few things the original has a test for.

**Hide-seen, global + per-route override.**
- Global: `Settings.filterSeenPosts` (default `false`).
- Per-route: `Settings.hideSeenURLs`, a dictionary keyed by the route's **base page** — Home maps to
  a single slot regardless of its sort; a subreddit maps to `/r/<name>` with any trailing sort
  segment stripped.
- `hideSeen(for:)` returns the override if one exists for that base page, else the global value.
- The context menu item `Show Seen Posts` / `Hide Seen Posts` toggles the override for the current
  base page, **deleting** the key entirely when the new value would equal the global default (so the
  map only ever stores genuine exceptions), then replaces the current route to force a refetch.
- `[GATE: gate.filters]` — *filtering by* seen state is gated (global and per-page). Seen **tracking**
  and the 0.75-opacity dimming stay free, as does `Mark as Read` / `Mark as Unread`
  (`05-monetization.md` §3.1 row P).

### 7.8 Subreddit filters

`Settings.filteredSubreddits`: subreddit name → either `true` (forever) or an epoch-ms expiry. The
rule is added only on combined feeds. A post is dropped when its subreddit's entry is `true` or a
future timestamp. An expired entry simply stops having effect; it is **not** actively cleaned up.
The management surface (view/remove) is Settings → Filters (`04c` §16.3). `[GATE: gate.filters]` —
while locked, "Filter Subreddit" and its duration submenu open the paywall, and existing entries are
preserved but not applied.

---

## 8. Subreddit switcher header + quick search

On Home, subreddit and multireddit feeds the navigation title is replaced by `SwitcherTitle`: the
page name (single line, truncated, max 240 pt) plus a chevron-down glyph in `theme.subtleText`,
tappable.

Tapping it presents the **same** overlay that long-pressing the Search tab presents:
`QuickSubredditSearchView` (full spec in `04c` §Quick subreddit search). Summary of the parts this
document depends on:

- Full-screen dimmed overlay (70 % black scrim, 150 ms fade), anchored to the top safe area; tap the
  scrim to dismiss.
- Empty query → the user's favorites followed by their subscriptions, in their existing order.
- Typing debounces **500 ms**, then fires two concurrent lookups: a paged subreddit search
  (20/page, appended on scroll, list visually capped at 10 × 52 pt rows before internal scroll), and
  an exact-name resolution which, on success, renders a highlighted `Go to r/<name>` row above the
  results. Pressing Return with an exact match resolved jumps straight there.
- Each row: icon (or generic snoo), name, subscriber count via `prettyNum` + `" subscribers"`,
  chevron.
- Selecting any row dismisses the overlay, clears its state, and **pushes** a subreddit feed route.

---

## 9. Feed video: focus, poster, and the two FABs

Full video behavior is in `04b`. The feed-side contract:

- A feed video row renders a **static poster** (the post's preview thumbnail, at feed aspect rules)
  with a centered semi-transparent play-circle overlay, and attaches **no player at all**, whenever
  any of: the data mode is `.lowData`, `Settings.autoPlayVideos` is off, or this row is not the
  Focused Post.
- At most one feed video plays app-wide: the Focused Post. Eligibility to *become* focused requires
  either ≥70 % of the post's own height on screen, **or** ≥60 % of the viewport covered (which is how
  a post taller than the screen can qualify). Among eligible candidates, pick the one whose index is
  closest to the midpoint of the visible index range.
- **Settle debounce 150 ms**, committed immediately on scroll-momentum end. During a fling nothing
  plays because the candidate keeps churning.
- **Asymmetric hysteresis:** once focused, a video keeps focus as long as *any* pixel of it is on
  screen and no other eligible candidate has appeared. A small nudge below the thresholds does not
  stop it.
- **Immediate release:** if the focused video leaves the screen entirely, release focus at once,
  bypassing the debounce — audio must never outlive visibility.
- Losing SwiftUI scene/navigation focus (tab switch, push, disappear) releases focus immediately;
  regaining it re-evaluates from the last visibility snapshot with no scroll event required.
- **The focus key is `VideoSource.key` = (pre-resolution playback URL, gallery index)** — byte-for-byte
  the same key as the shared player registry (`04b` §5) and the resume-position map (`04b` §7.1).
  Never key focus on the post id: one post can carry several videos, and a Redgifs source's URL
  changes when it resolves while its key must not.
- **Only `videos[0]` participates.** For a post with several videos, the first supplies the focus key
  and the poster; the rest never play inline and are reachable only by opening the fullscreen viewer
  (`04b` §7.4).
- **Resume positions** are remembered by that same key in an LRU map capped at **200** entries,
  independent of player lifetime; regaining focus always resumes, never restarts.
- Audio plays only when `focusManaged && isFocused && settings.feedVideoAudio`.

Implement visibility with `.onScrollTargetVisibilityChange(idType:threshold:)` — the 2026 baseline
explicitly recommends it over scroll-geometry math for exactly this purpose. Maintain two thresholds
(0.7 for item-visibility and a viewport-coverage computation for tall items) and union the candidate
sets.

`[GATE: gate.videoAutoplay]` — **OWNER row, default OFF (free).** If the owner flips it on, the gate
covers inline feed video autoplay and the feed-audio FAB: locked users get the poster + play glyph
everywhere in the feed and the audio FAB is replaced by a Plus-badged control that opens the paywall.
Tapping a poster to open the fullscreen viewer stays free either way. The default is off because
gating it makes the feed feel broken and interacts badly with low-data mode
(`05-monetization.md` §3.1 rows A/D, §4).

**FABs** (`FeedVideoFABs`), two 44×44 circular, semi-translucent, bordered, shadowed buttons stacked
bottom-right, positioned just above the tab bar:

| Button | Position | Shown | Glyph | Toggles |
|---|---|---|---|---|
| Autoplay | top | always on feed screens | play-circle (on) / pause-circle (off) | `Settings.autoPlayVideos` (default `true`) |
| Audio | bottom | **only while autoplay is on** | `speaker.wave.2` (on) / `speaker.slash` (off) | `Settings.feedVideoAudio` (default `false`) |

Each press fires `hapticSelection()`. Both expose `accessibilityRole` switch semantics with a
`checked` state. Both are mirrored as rows in Settings → Appearance.

---

## 10. Gallery-mode offer heuristic

After a feed load completes, offer gallery mode when **all** hold:

1. `flags.galleryModeOffered` is false (one-time, ever, app-wide; set on **either** answer).
2. `store.items.count >= 100`.
3. The feed is **not** a combined feed (single subreddit, multireddit or user page only).
4. `≥ 85 %` of the loaded posts have at least one image or video.

Present `.alert("Try Gallery Mode?", …)` with body `"Media heavy subreddits look great in gallery
mode. Would you like to try it out?"` and buttons `Cancel` / `Open`.

- **Open** sets the flag, pushes `Route.gallery(currentTarget)`, then presents a second one-time
  informational alert titled `"Gallery Mode"` with body `"You can open gallery mode any time with the
  … menu button in the top right corner of subreddit pages."`
- **Cancel** **also sets the flag.** Fix forward: the one-time offer is one-time on *either* answer.
  The original wrote the flag only on Open, so declining let the prompt reappear on a different
  qualifying feed — a nag the user already said no to. `[DECISION: gallery-offer-cancel]`
- The offer itself is free; `[GATE: gate.galleryMode]` applies to Gallery Mode's own 100-item limit
  (`04b` §10.1), not to the prompt.

---

## 11. Subreddits page

`SubredditsScreen` is the root of the Posts tab. One `List` of heterogeneous rows in this fixed order:

1. **Three top buttons**, always present regardless of login state:

| Label | Accent | Subtitle | Destination |
|---|---|---|---|
| Home | `#fa045e` | `Posts from subscriptions` | `.home` |
| Popular | `#008ffe` | `Most popular posts across Reddit` | `.subreddit("popular")` |
| All | `#02d82b` | `Posts across all subreddits` | `.subreddit("all")` |

2. **Favorites** — only if non-empty, in stored insertion order (not re-sorted here).
3. **Multireddits** — only if any exist.
4. **Moderator** — only if any.
5. **Subscriber** — only if any, alphabetically (locale-aware) sorted by the data layer.
6. **Trending** — only if any; populated **only when logged out** (when logged out the other four
   sections are all empty, so in practice Trending and the rest are mutually exclusive). The same two
   exclusions the Search tab applies (`04c` §7.1) apply here: drop subreddits the user is already
   subscribed to, and drop any subreddit literally named `"Home"` (which would otherwise sit beside
   the Home button and mean something else).

**Partial-failure rule.** The sections are fetched independently and a failure in one must never take
down the hub. In particular the **multireddit** fetch (M1, with its fallback chain) is independent: if
it throws, log it and render the hub **without** the Multireddits section. A multireddit failure must
not blank Favorites, Moderator, Subscriber or Trending, and must not surface an access-failure screen
over the whole hub — the original shipped exactly that bug and fixed it, and it must not come back.

Each section is preceded by an uppercase header on a `theme.tint` background: `FAVORITES`,
`MULTIREDDITS`, `MODERATOR`, `SUBSCRIBER`, `TRENDING`.

**Subreddit row:** circular icon (generic snoo fallback), name, and a trailing star toggle
(filled = favorited) with its own 10 pt hit-slop. Tapping the star toggles favorite **without**
navigating.

**Multireddit row:** icon (30×30, rounded; generic snoo fallback), name, and a chevron pill that
expands/collapses an indented list of member subreddits (local state, not persisted). Tapping the row
body navigates to the multi's merged feed. Tapping an expanded member navigates to that subreddit;
long-pressing one opens a two-item menu: `Delete From Multireddit` and `Share`. See §11.2.

**A–Z index rail.** A vertical strip of all 26 letters on the right edge (top 10 %, height 80 %),
`theme.tint`. Dragging computes the letter from `locationY / (railHeight / 26)` and scrolls
(non-animated) to the first row whose name begins with that letter — **scoped only to the
`subscriber` and `trending` sections**; favorites, moderator and multireddit rows are not index
targets. Letters with no match are silent no-ops. While touching, a large centered letter bubble
(60×60, rounded, semi-opaque `theme.tint`) shows the hovered letter; it disappears on release.
Implement with `ScrollViewReader` + `scrollTo(id:anchor:.top)`.

**No swipe-to-unsubscribe** exists on this page. Unsubscribing is only reachable from a subreddit's
own feed "…" menu.

**No inline text filter** exists on this page.

### 11.1 Subscribe / favorite / add-to-multireddit (from a subreddit feed's "…" menu)

| Item | Behavior |
|---|---|
| Subscribe / Unsubscribe | Label reflects membership of the loaded subscriber list. Calls R4, reloads the whole subreddit list, then confirms. Subscribe uses a two-line alert: title `"Subscribed!"`, body `"You've successfully subscribed to <subreddit>"`. Unsubscribe uses a single-line alert `"Unsubscribed from <subreddit>"`. |
| Favorite / Unfavorite | Purely local, per-account (keyed by Reddit user id), never synced to Reddit. Requires being logged in (`"You must be logged in to favorite subreddits"`) **and** already subscribed (`"You must be subscribed to a subreddit to favorite it"`). |
| Add to Multireddit | Zero multireddits → alert `"You have no multireddits created yet. Please create one first."` and stop. Otherwise a menu of multi names; picking one calls M4, reloads multis, and confirms `Added <subreddit> to <multi>`. Failure: `Something went wrong: <error>`. |
| New Post | Presents `NewPostSheet` pre-targeted at this subreddit (§16.5). |
| Sidebar / Wiki | Push `Route.sidebar(name)` / `Route.wiki(WikiTarget(subreddit: name, path: "index"))`. |
| Open in Gallery Mode | Push `Route.gallery(currentTarget)`. Present on Home, subreddit and multireddit menus. `[GATE: gate.galleryMode]` |
| Show/Hide Seen Posts | §7.7. |
| Share | Share sheet with the page URL. |

Home's menu omits Subscribe/Favorite/New Post/Add-to-Multireddit/Sidebar/Wiki. A multireddit's menu
contains only Open in Gallery Mode and Share.

### 11.2 Multireddit add/remove only

Multireddits can be **added to** and **removed from**, never created, renamed or deleted in-app.
There is no create/rename/delete endpoint or UI anywhere; the original explicitly directs users to
reddit.com. Removal is reachable only by expanding a multireddit on this page and long-pressing a
member. Neither add nor remove has a confirmation prompt — the menu selection is the only gate; the
result alert is the only feedback.

---

## 12. Post Details screen

### 12.1 Composition

One `List` (**not** `LazyVStack` — the 2026 baseline's `List`-vs-`LazyVStack` guidance is decisive
for 1 000+-row comment trees, which actively recycle rows).

```
PostDetailScreen(target: PostTarget)
└─ List {
     Section { PostHeaderView(detail) }           // .id(detail.id) so it resets on a new post
     ForEach(flatRows, id: \.rowKey) { row in
         switch row { case .comment, .loadMore, .collapsedReplies }
     }
     if !flatRows.isEmpty { FooterDivider() }      // 1 px divider under the last row
   }
   .listStyle(.plain)
   .refreshable { await store.reload() }
   .scrollDisabled(store.swipeInProgress)
   .safeAreaPadding(.bottom, 100)
   .overlay { ScrollToNextButton() }              // §15
   .toolbar { SortButton, ContextMenuButton }
```

- **Empty state:** while the flattened rows are still catching up to a state change, show a small
  `ProgressView`; once settled, if there are no comments, show `"No comments"` centered.
- Pull-to-refresh performs a **full** re-fetch of post + first comment page, replacing the entire
  in-memory tree — local collapse state, un-persisted optimistic votes, and loaded "more replies"
  batches are all discarded and replaced by server truth.
- Disable list scrolling while any row's swipe is mid-gesture.

### 12.2 Store and state

```
@Observable final class PostDetailStore {
    var detail: PostDetail?
    var flatRows: [CommentFlatRow] = []      // recomputed from detail
    var firstVisibleIndex: Int = 0           // drives scroll-to-next
    var swipeInProgress = false
    var commentSortMenu: [CommentSort] = [.best,.new,.top,.controversial,.old,.qa]
}
```

`detail` holds the whole tree; children nest as `comment.children`. Mutations locate a node by
walking `comment.path` (an array of child-array indices from the root) and merge, then republish.
`flatRows` is recomputed from `detail`; because `@Observable` gives fine-grained tracking, splitting
the flatten into a `Task`-deferred recompute is only necessary for very large trees — mirror the
original's "defer the re-flatten so an optimistic vote paints first" behavior by updating the mutated
comment's own row eagerly and recomputing `flatRows` on the next run loop turn.

### 12.3 Fetch

Endpoint C1: the post permalink with `sr_detail=true&limit=75`, `sort`/`t` carried from the route.
The response's element 0 is the post, element 1 is the comment listing. A top-level `more` child
becomes `detail.loadMore = (depth, childIds)`. The gated-subreddit interstitial applies (§2.2); a
user cancel leaves the screen unpopulated.

Opening a post detail increments the `posts_viewed` stat.

---

## 13. Post header (`PostHeaderView`)

Wrapped in a tap target whose `onTapGesture` — **only when `Settings.tapToCollapsePost` is on**
(default `true`) — toggles a local `mediaCollapsed` flag that hides the media block (title and
metadata stay visible). When the setting is off the wrapper is inert.

Top to bottom:

1. **Title** — plain `Text`, 20 pt.
2. **Media** — `PostMediaView(detail, renderHTML: true)`; hidden when collapsed. In the detail screen
   the video is *always* considered focused (there is no focus manager here), so it plays inline
   subject only to autoplay/low-data.
3. **Metadata row 1** — optional pin glyph (`theme.moderator`) if stickied; a subreddit pill (icon +
   `r/<name>`, bold, tappable → subreddit feed) always in `theme.subtleText`; literal `" by "`;
   `u/<author>` bold, tappable → user page, colored `theme.moderator` if the author is a distinguished
   moderator else `theme.subtleText`. There is **no** "OP" concept in the post header.
4. **Metadata row 2** — up-arrow glyph + upvote count, then `"  •  " + timeSince`. If `editedAt` is
   set, a pencil glyph follows as its own tap target; tapping it presents
   `.alert("Edited <relative> ago", message: "Post was edited at <full locale datetime>")`. If
   `interactionDisabledStatus` is non-nil, append `" • "`, a lock glyph, and the raw status string
   (`"archived"` / `"locked"`).
5. **Action bar** — a top-bordered, fixed 46 pt row, evenly spaced, in this exact order:

| # | Control | Glyph | Active state | Action |
|---|---|---|---|---|
| 1 | Upvote | `arrow.up`, 32 pt | background pill `theme.upvote` when `userVote == .up`; glyph `theme.text` when active else `theme.iconPrimary` | V1 |
| 2 | Downvote | `arrow.down`, 32 pt | same pattern with `theme.downvote` | V1 |
| 3 | Save | filled/outline bookmark, 28 pt | **no** background tint — the glyph shape alone communicates state | V2 |
| 4 | Reply | reply glyph, 28 pt | — | Presents `NewCommentSheet(parent: detail)` **unless** `interactionDisabledStatus` is set, in which case present `.alert("This post has been <status>")` and open nothing |
| 5 | Share | share glyph, 28 pt | — | Share sheet with the post's canonical URL |

Vote and save are optimistic in the sense that the local model is patched with the server's returned
direction and a locally recomputed count as soon as the call resolves. There is no undo affordance
beyond tapping the same arrow again.

On a successful reply submit (`contentSent`), the screen re-fetches after a flat **5-second**
`Task.sleep` — not event-driven. Reproduce the delay.

6. **"View all comments" banner** — shown only when the route carries a positive numeric `context`
   parameter (a comment-permalink view). A full-width, top-bordered, tappable row reading
   **"This is a comment thread. Click here to view all comments."** in `theme.iconOrTextButton`,
   which navigates to the canonical `/r/<sub>/comments/<id>/` route, dropping the context framing.

**Deep link into a specific comment.** Beyond the banner there is **no** context-mode behavior: no
highlighted target comment, no dimmed siblings, no ancestor breadcrumb. The scoping comes entirely
from what the server returns for that URL. `[DECISION: context-no-highlight]`

The header's own "…" menu is not part of this view; it lives in the navigation bar (§12.1) and offers
`Edit` (only if the current user authored it **and** it has text, i.e. a self post), `Delete` (only
if authored by the current user), then always `Report`, `Select Text`, `Share`.
`Report` navigates to a **generic** in-app web view at `https://www.reddit.com/report` — it is not
wired to the specific post id. `[DECISION: report-webview]`
`Select Text` opens the text-selection sheet (§17) with the post's raw markdown.
`Delete` confirms, calls V3, then pops the screen.

---

## 14. Comment tree

### 14.1 Flattening

The tree is **not** rendered by recursive nested views. `flattenCommentTree(root:collapseChildrenOnly:
passesFilter:)` walks depth-first and produces a flat array of rows fed to `List`.

```
enum CommentFlatRow: Identifiable {
    case comment(Comment)
    case loadMore(parent: Comment)              // "N more replies"
    case collapsedReplies(Comment)              // stub shown in collapseChildrenOnly mode
}
```

Row keys (never array indices, which shift on collapse/expand/load-more):
`comment-<id>`, `loadMore-<parentId>`, `collapsedReplies-<id>`.

Traversal rules:

1. Emit a comment's own row, **then** (if not filtered and not collapsed) its children recursively,
   **then** — after all descendants — that comment's own `loadMore` row if it has pending child ids.
2. A comment failing the text filter is dropped **together with its entire subtree**, even children
   that would individually pass. There is no "filtered parent, kept child" case.
3. Collapsed with `collapseChildrenOnly == false` (**default**): only the comment's own row is
   emitted; children *and* its `loadMore` row are both suppressed.
4. Collapsed with `collapseChildrenOnly == true`: the comment's row is followed by a single
   `collapsedReplies` stub **if and only if** it has children. Grandchildren and `loadMore` are still
   suppressed either way.
5. Collapsing one comment never affects sibling subtrees.
6. The root's own trailing `loadMore` row (the whole-thread "load more") is emitted **last**, after
   every top-level comment and its subtree.

The root (`PostDetail`) is never emitted as a row — it is the list header.

**Performance contract (a Phase 3 gate measurement, not an aspiration).** Flattening a **2 000-node**
tree completes in **under 100 ms** on the oldest supported device, off the main actor; the **first
screen** of a 2 000-comment thread renders in **under 1 s** from "fetch complete"; and peak memory
**does not scale with total thread size**, because `List` recycles rows and the flat array holds
values, not views. Collapsing a 500-child thread is an array splice, not a re-render of the list.
`02-architecture.md` §18.1 carries the same numbers as budgets.

### 14.2 Comment row layout

```
CommentRow(comment)
└─ HStack(spacing: 0) {
     Spacer().frame(width: 10 * comment.depth)         // unbounded, no max-depth clamp
     VStack(alignment: .leading) { TopBar(); if bodyVisible { MarkdownBody(comment.html) } }
       .overlay(alignment: .leading) { DepthBorder() }  // 1 pt, width 0 at depth 0
       .overlay(alignment: .trailing) { VoteBorder() }  // 1 pt, only when voteIndicator is on
       .overlay(alignment: .bottomTrailing) { if comment.saved { SaveNotch() } }
   }
```

- **Depth indent:** 10 pt per level, unbounded.
- **Depth border color:** cycle the six `theme.commentDepthColors` values — one fixed set, identical
  in every theme and **not** customizable, even in the Theme Maker. The six values are **defined in
  `04c` §18.2** and are **new colours chosen for this app**; the original's cycle is creative
  expression and is not reproduced, so no hex value for it appears anywhere in this document set
  (`[DECISION: theme-count]`). Index with `(depth − 1) % 6` for comment rows and `depth % 6` for
  `loadMore` / `collapsedReplies` stub rows (they represent the *next* level down).
- **Body leading padding:** **15 pt** in the normal case. `displayInList` mode overrides it to 10
  (§14.4); nothing else changes it.
- **Right-side vote indicator:** when `Settings.voteIndicator` is on (default `false`) **and** the
  user has voted, draw a 1 pt right border in `theme.upvote` / `theme.downvote`; otherwise zero
  width.

**Top bar** (`HStack`, 6 pt spacing):

| Element | Detail |
|---|---|
| Pin glyph | if `isStickied`, `theme.moderator` |
| Author | tappable → user page. **Color precedence:** `isOP → theme.iconOrTextButton`; else `isModerator → theme.moderator`; else `theme.text`. No separate "OP" text badge is drawn anywhere — the color alone signals it. **No self-comment color** either; your own comments look like anyone else's (only Edit/Delete availability differs). Admin-distinguished comments are **not** specially colored. |
| Vote/score combo | A **single** tap target (glyph + number), not two arrows. The glyph is `arrow.down` only when `userVote == .down`, otherwise always `arrow.up`. Tapping it **always** casts an upvote — there is no in-row downvote target for comments; downvoting requires a swipe or the context menu. Color follows the vote state. |
| Score text | The number, except `"-"` when `scoreHidden && userVote == .none`. Once you vote, the locally-known count is shown even while Reddit hides the public score. |
| Edited pencil | if `editedAt`, same alert pattern as the post header (`"Comment was edited at …"`). |
| Flair chip | only when `Settings.commentFlairs` is on (default `true`) **and** the comment has a flair: each flair emoji at 16×16 followed by the flair text (1 line, truncated). Tapping presents a plain alert of the flair text, or `"No flair text"` for emoji-only flairs. |
| Trailing | `shortTimeSince` (e.g. `"4h"`), right-aligned |

The top bar's bottom margin is `0` when the comment is collapsed **and** `collapseChildrenOnly` is
off (nothing follows), else `8`.

**Body:** rendered when `collapseChildrenOnly || !comment.collapsed`. Content is `comment.body` —
Reddit's **markdown source** — parsed by `RedditMarkdown` into a `MarkdownDocument` and rendered from
that AST (§18, `02-architecture.md` §9). `body_html` is retained on the model only as an emergency
fallback source and is not the rendering path. Because `raw_json=1` is sent on every read
(`03-data-and-networking.md` §1.3), there is **no client-side HTML-entity decoding step** anywhere.
`[DECISION: raw-json-param]` `[DECISION: snudown-renderer]`

**Inline text selection is disabled** on comment bodies (and on post bodies), because the iOS 27
selection gesture on `Text` + `.textSelection(.enabled)` collides head-on with tap-to-collapse.
Selection is reached through the explicit **Select Text** action instead (§17,
`02-architecture.md` §9.5).

**Save notch:** a 15×15 `theme.bookmark` triangle pinned bottom-right, same as post cards. (The post
header has no notch; its saved state is the filled bookmark in the action bar.)

### 14.3 AutoModerator auto-collapse

A comment is initialized `collapsed = true` if and only if `Settings.collapseAutoModerator` is on
(default `true`), the comment is **top-level** (`depth == 0`), and the author is exactly
`AutoModerator`. Nested AutoModerator replies are never auto-collapsed.

### 14.4 `displayInList` mode

The same row view is reused in user-content listings (a user's comments, saved comments, inbox
context). In that mode: tapping the row always deep-links to `comment.link?context=10` instead of
collapsing; the long-press menu omits Collapse and Collapse Thread; a bordered "source" box (post
title + subreddit, tappable to the post) is appended below the body; a divider-colored spacer bar
follows each row; the top border is removed; body leading padding is 10 instead of 15.

### 14.5 `loadMore` and `collapsedReplies` rows

**`LoadMoreRow`** — text is `"Loading..."` while a fetch is in flight for *this* parent (track with
row-local state keyed on the parent id so a reused row never shows another row's spinner), else
`` "\(childIds.count) more replies" ``.

Tapping fetches **up to 10** ids (`childIds.prefix(10)`), each as its **own** request (endpoint C2)
issued concurrently in a `TaskGroup` — Reddit's batched morechildren endpoint is *not* used. Results
are appended into the parent's children at `childStartIndex = parent.children.count` and the fetched
ids are removed from `childIds`. If more than 10 remain, the row persists with a decremented count,
requiring repeated taps. A "500 more replies" stub therefore takes 50 taps.

Reddit's "continue this thread" stubs (a `more` with `count: 0` and no child ids) **are**
distinguished, via `MoreStub.isContinueThread` (`03-data-and-networking.md` §4.6). Such a row renders
**`"Continue this thread →"`** and tapping it pushes the parent comment's permalink. The original
rendered `"0 more replies"` and fetched nothing when tapped, which is simply broken.
`[DECISION: more-stub-count-zero]`

**`CollapsedRepliesRow`** — reads `` "\(comment.children.count) more replies" ``; tapping expands
(sets `collapsed = false`).

---

## 15. Collapse, expand, thread collapse, and the floating nav button

### 15.1 Tap to collapse

`Settings.tapToCollapseComment` (default `true`): tapping anywhere on a comment row (outside
`displayInList`) toggles `collapsed`.

**Scroll repair.** Before toggling, if the comment is *currently expanded* (i.e. about to collapse),
measure its on-screen Y; if that Y sits **above** the list's top edge, scroll so that the tapped
comment's top lands at the viewport top. This keeps the row you just collapsed from vanishing off the
top. No repositioning happens on expand. Implement with a `GeometryReader` background on the row
publishing its frame in the list's coordinate space, plus `ScrollViewReader.scrollTo(id, anchor:
.top)`.

Toggling `tapToCollapseComment` or `voteIndicator` in Settings shows **no alert and needs no
refresh**: the comment row reads both settings reactively, so an already-open thread repaints in
place. The original demanded a refresh for these two; `APPNAME` has **no restart or refresh alert on
any setting anywhere** (`04c` §17.2, `06` items 57 and 271).

### 15.2 Collapse Thread

Available from the comment context menu and as a swipe action. It **always force-collapses** (never
toggles) the **top-level ancestor** of the invoked comment (`path.prefix(1)` resolved against the
root), regardless of how deep you invoked it from. If that ancestor's row is currently in the
flattened list, scroll it to the very top of the viewport (`anchor: .top`) **before** applying the
collapse.

### 15.3 Persistence of collapse state

Collapsed state lives in the in-memory tree for the lifetime of the screen. Re-expanding a parent
restores whatever collapsed/expanded state its children were left in, because collapsing only ever
removes rows from the flattened array — it never mutates children.

`collapseChildrenOnly` (default `false`): when on, a collapsed comment with children shows an
`N more replies` stub instead of its subtree vanishing without a trace.

### 15.4 Floating scroll-to-next/previous button

One circular 40×40 button with a chevron-down glyph, floating above all screen content.

**Navigation logic:** from `firstVisibleIndex` (updated on every visibility change), walk the flat row
array forward (or backward) to the next row where `kind == .comment && depth == 0`.
- Forward with nothing found: do nothing (no wraparound).
- Backward with nothing found above: scroll to offset 0 (back to the post header).

**Touch model** (one button, no separate prev/next):

| Gesture | Timing | Result |
|---|---|---|
| Quick tap | released within **300 ms**, no drag | **next** top-level comment |
| Press and hold | at the **300 ms** mark, still held | **previous** fires automatically (does not wait for release) |
| Long hold or early drag | held to ~**1000 ms**, or dragged >**30 pt** before that | enters **reposition mode** |

Opacity dims to 0.7 while held.

**Reposition mode:** a `rgba(0,0,0,0.5)` overlay fades in over 300 ms above everything (including the
tab bar), showing **10** locked target positions as 40×40 dashed-outline circles in `theme.buttonBg`,
positioned relative to the screen area above the tab bar:

`bottom-right` (default), `top-right`, `bottom-left`, `top-left`, `bottom-center`, `top-center`,
`left-center`, `right-center`, `left-three-quarters-bottom`, `right-three-quarters-bottom`.

The button follows the finger at (touch − half button size − an extra 30 pt vertical offset for thumb
ergonomics). When within **40 pt** (one button diameter) of a slot it snaps to it. On release: if
hovering a slot, persist it to `Settings.scrollToNextButtonPosition` and stay; otherwise spring back
to the last confirmed position. The overlay fades back out on release.

---

## 16. Comment interactions

### 16.1 Long-press menu

`.contextMenu` on the row (no press-preview image for comments). Ordered items:

| # | Label | Shown when | Effect |
|---|---|---|---|
| 1 | `Upvote` | always | V1 |
| 2 | `Downvote` | always | V1 |
| 3 | `Collapse` / `Expand` (label flips) | not `displayInList` | toggles `collapsed` |
| 4 | `Collapse Thread` | not `displayInList` | §15.2 |
| 5 | `Copy Text` | always | copies `comment.body` (**raw markdown**) to the pasteboard; no toast |
| 6 | `Select Text` | always | opens the selection sheet (§17) with `comment.body` |
| 7 | `Reply` | always | presents `NewCommentSheet(parent: comment)`, gated by the post's `interactionDisabledStatus` **before the sheet opens** — when it is non-nil, present `.alert("This post has been \(status)")` with a single OK and open nothing, where `status` is the raw `"locked"` / `"archived"` string interpolated verbatim (§13 item 4 has the identical check); on success reloads **only this comment** (endpoint C3) after a flat 5 s delay and re-merges it in place |
| 8 | `Save` / `Unsave` | always | V2 |
| 9 | `Edit`, `Delete` | **only** when `currentUser.userName == comment.author` | Edit presents `EditCommentSheet`; Delete is marked destructive and additionally confirms via `.alert("Delete Comment", "Are you sure...", [Cancel, Delete])` before calling V3 and removing the node locally |
| 10 | `Share` | always | share sheet with the comment's canonical URL |

There is **no** per-comment `Report` and **no** per-comment `Block user`. There is no "jump to
parent" item; the nearest equivalent is `displayInList` mode's row tap, which deep-links to the
comment's permalink with `context=10`.

Note the original's own documentation omits `Copy Text` from this list; the code has it. Ship the
code's list — nine items. `[DECISION: comment-menu-copy-text]`

### 16.2 Comment swipes

Identical mechanics to §7.1 with the comment action set and a 15 pt horizontal engage threshold.

### 16.3 Comment sorting

The nav-bar sort menu on a post detail offers exactly **six** options:
**Best, New, Top, Controversial, Old, Q&A.**

There is no `Default`, `Hot`, `Rising`, `Relevance` or `Comment Count` here even though those exist
in the shared sort vocabulary — the original's own documentation additionally lists "Default", which
the code does not offer. Ship six. `[DECISION: comment-sort-six]`

Selecting **Top** opens a second-level menu (Hour/Day/Week/Month/Year/All). Applying a sort rewrites
the route's `sort`/`t` parameters in place, which is the store's refresh dependency and triggers a
refetch.

### 16.4 Sort memory and defaults

`applyPreferredSorts(to:)` runs whenever a route is constructed for navigation and on the startup
route. If the route already carries an explicit sort, do nothing. Otherwise:

| Page type | Resolution order |
|---|---|
| Home | Only if `Settings.sortHomePage` is on (default `false`). Then: per-subreddit remembered → global `defaultPostSort` → `"default"` (leave alone). |
| Subreddit | per-subreddit `postSubredditSort[name.lowercased()]` **if** `Settings.rememberPostSubredditSort` is on → global `defaultPostSort` → `"default"`. |
| Top time window | per-subreddit `postSubredditSortTop[name]` → global `defaultPostSortTop` → `"all"`. |
| Post detail (comments) | per-subreddit `commentSubredditSort[name]` **if** `Settings.rememberCommentSubredditSort` is on → global `defaultCommentSort` → `"default"`. |
| Multireddit | `top` defaults its window to `"day"` when no `t` is present. |
| User | sort defaults to `"new"` when absent. |

A resolved sort of literally `"default"` means **no rewrite** — Reddit's own server default applies.

Whenever the user changes a sort through the UI, and per-subreddit remembering is on for that content
type, write the new choice (lowercased) back into that subreddit's key — plus the Top window when
applicable. Remembering is captured opportunistically on every manual change, not only read.

The bulk-clear buttons ("Clear custom post sorts (N subs)") live in Settings → Sorting (`04c` §16.2).

`[GATE: gate.sortMemory]` — **OWNER row, default gated.** Changing sort on any page is free forever;
what the gate protects is *persisting* a sort preference: the global default post sort, the default
Top range, the default comment sort, "apply sort to home", and both kinds of remember-per-subreddit.
While locked, `applyPreferredSorts(to:)` behaves as if every one of those settings were at its
default, so routes carry no rewritten sort (`05-monetization.md` §3.1 row O, §4).

### 16.5 Compose and edit sheets

`[GATE: gate.compose]` — **OWNER row, default OFF (free), and strongly recommended to stay off.**
Creating posts, comments and messages is Reddit's own functionality; gating it makes the free tier
read-only, which reads as crippleware. The gate exists only so the owner can flip one table entry. If
it is ever turned on, the check runs **when the composer is opened, never on submit**, and drafts are
saved regardless of entitlement (`05-monetization.md` §3.3, §5.10 rule 4).

Four sheets share one shell. Present each as a `.fullScreenCover` (the original is a full-screen
overlay, not a native sheet).

```
ComposerShell
├─ TopBar { Cancel | Title | Post-or-Save }
└─ ScrollView(.vertical) {
     MarkdownEditor(text:)            // multiline TextEditor, autofocus, min height 100
     Toolbar                          // §16.5.1
     TabStrip                         // §16.5.2, absent in NewPost(text)
     PreviewPane                      // live-rendered
   }
   .safeAreaInset(.bottom) { keyboard spacer }   // plain keyboard avoidance
```

- **Cancel** on `NewComment` / `NewPost` closes immediately with no confirmation — their content
  survives through the draft table, so there is nothing to lose. **Cancel on `EditPost` /
  `EditComment` with unsaved changes first presents** `.alert("Discard changes?", "Your edits to this
  <post|comment> will be lost.", [Keep Editing, Discard(destructive)])`, because edits are not
  draft-persisted (`03-data-and-networking.md` §7.5) and the original lost them silently.
  `[DECISION: composer-no-discard-confirm]`
- **Submit** replaces itself with a `ProgressView` while in flight (visually disabling it). Cancel
  stays tappable throughout; tapping it mid-submit abandons the UI wait without cancelling the
  network call. On failure: `.alert("Failed to <action>")` and the button re-enables. On success:
  dismiss and fire the caller's `contentSent`.

#### 16.5.1 Markdown toolbar

A horizontal row of icon buttons operating on the editor's last-tracked selection range (tracked in a
non-observed box so cursor movement doesn't re-render):

| Button | Glyph | Inserts |
|---|---|---|
| Link | link | Prompts for a URL via a text-field alert, then inserts `[selectedText](url)` (`[](url)` if nothing selected) |
| Bold | bold | wraps in `**…**` |
| Italic | italic | wraps in `*…*` |
| **Quote** | quote | **three-way**, see below |
| Strikethrough | strikethrough | wraps in `~~…~~` |
| Spoiler | eye.slash | wraps in `>!…!<` |
| Attach Theme | paintbrush | only when the caller passes `showCustomThemeOption`, which is exactly "the target subreddit is in `themeSharingSubreddits`" and is **false for every subreddit while that constant is empty** (`04c` §18.5). Presents a list of the user's saved custom themes; selecting one confirms via `.alert("Do you want to attach the \"<name>\" theme to your text?", [Cancel, Attach])`, and Attach inserts a newline-wrapped theme token at the selection. `[GATE: gate.customThemes]` |

**Quote's three behaviors, in order:**
1. Editor text is completely empty → set the whole text to literally `"> "`.
2. Text exists but the selection is collapsed → walk **backward** from the cursor to the nearest
   preceding `"\n"` and insert `"> "` immediately after it (quotes the start of the current line).
   **Edge case:** if the cursor is on the very first line (no preceding newline), nothing happens.
   Reproduce.
3. A non-empty selection exists → split it on `"\n"`, prefix **every** resulting line with `"> "`,
   and rejoin.

There are **no** image-upload, table, header, or code-block toolbar buttons. Those constructs must be
typed as raw markdown. Image upload exists only as `NewPost`'s dedicated Image-post flow.

#### 16.5.2 Tabs and previews

| Sheet | Tabs | Default tab | Notes |
|---|---|---|---|
| `NewComment` | **Parent** / **Preview** | Parent if available, else Preview | "Parent" is shown only when the reply target has non-empty HTML. It renders the target's **raw text** in a selectable field — not markdown-rendered. "Preview" renders the composer's markdown live on every keystroke (no debounce). |
| `EditComment` | **Preview** / **Old Version** | Preview | "Old Version" shows the original pre-edit raw text, selectable. |
| `EditPost` | **Preview** / **Old Version** | Preview | as above |
| `NewPost` (text kind) | **none** | — | A static `Preview` label above an always-rendered live preview pane. |

The selected tab is indicated purely by a border-color swap (`theme.iconOrTextButton` vs
`theme.tint`) on a pair of individually styled buttons — not a `Picker`/segmented control.

**Preview rendering** must go through the same markdown→HTML pipeline Reddit's server uses, so what
Preview shows matches what Reddit will produce. See §18.9.

#### 16.5.3 Drafts

Backed by the GRDB `drafts` table (`key` unique, `text`). Saved on **every keystroke** (upsert, no
debounce — in Swift, coalesce to at most one write per ~250 ms if profiling demands it, but the
observable behavior must be "never lose a keystroke on kill").

Key formats are normative in `03-data-and-networking.md` §7.5; repeated here for convenience:

| Composer | Key(s) |
|---|---|
| New comment | `comment.<parentFullname>` — one per reply target, so replying to the same comment/post again always restores what you left |
| New post | `post.title.<subreddit-lowercased>` **and** `post.body.<subreddit-lowercased>` — **one post draft per subreddit**; starting a second in the same subreddit silently overwrites the first. The body key is per post kind, so a link draft and a text draft do not collide (§16.5.4) |
| Edit comment / Edit post | **none** — edits are seeded from existing content and never persisted; cancelling confirms first |
| New message / Reply to message | `message.subject.<recipient>`, `message.body.<recipient>`, `messageReply.<previousAuthor>` — see `04c` §5 |

Drafts are read once at sheet init (`getDraft(key) ?? ""`) and cleared **only on a successful
submit**. A failed submit deliberately leaves the draft intact. `maintainDrafts()` caps the table at
**100** rows globally, deleting the oldest by insertion order at each cold start.

**Fix forward:** the composer keeps a **separate field per post kind** (`selfText`, `linkURL`,
`imageURL`), and switching the post-type pill switches which field is bound. A URL never ends up in
the body editor and a body never ends up in the URL field. Drafts are keyed per kind accordingly. The
original shared one `text` field across all three kinds, which is a latent state-mixing bug.
`[DECISION: newpost-type-switch-keeps-text]`

#### 16.5.4 `NewPostSheet` specifics

- **Post type:** three equal-width pill buttons — Text Post / Link Post / Image Post
  (`self` / `link` / `image`); default `self`. **There is no Poll type.**
- **Title:** always-visible single-line field, no client-side length enforcement, draft-persisted per
  subreddit.
- **Flair button:** rendered next to the title **only if** the subreddit has at least one
  non-mod-only flair (endpoint S2; mod-only flairs are filtered out of the list entirely and can
  never be selected, not even shown disabled). Tapping opens a menu: `No Flair` plus each flair's
  text.
- **Text body:** markdown editor + live preview.
- **Link body:** a single-line URL field (`.textInputAutocapitalization(.never)`,
  `.autocorrectionDisabled`), with **no** client-side URL validation.
- **Image body:** a "Select Image" button → `PhotosPicker` (add/read permission flow: denied and
  not-askable → present an alert directing the user to Settings; denied but askable → request
  inline) → **single image only, no multi-select, no in-app cropping**. Request maximal quality so
  the system transcodes HEIC to JPEG. On successful upload (S3 → S4), the returned remote URL is
  written into the shared `text` field (which doubles as the submission payload) and a local preview
  of the *picked* asset (not the uploaded URL) is shown beneath the button. There is **no** "remove
  image" control — tapping Select Image again re-runs the whole flow.
- **Validation:** **none** client-side. Submit always calls the endpoint and relies on Reddit's error
  response.
- **Errors:**

| Response | UI |
|---|---|
| `errors[0][0] == "BAD_CAPTCHA"` | `.alert` offering to retry inside an embedded `WebView` pointed at `https://new.reddit.com/r/<sub>/submit/?type=<kind>` with shared cookies. The web view **replaces the sheet's body**; the Post button disappears and only Cancel remains, since submission then happens inside the page. For a text post, also copy the body to the pasteboard and tell the user, because the web form starts empty. |
| `errors[0][1]` is a string | `.alert("Failed to submit post", <that string verbatim>)` |
| anything else | `.alert("Failed to submit post", "Unknown error")`. The original *also* re-throws after alerting, which surfaces as an unhandled error upstream — **do not** reproduce the re-throw. `[DECISION: unknown-error-rethrow]` |
| success with no returned URL (what image submissions do) | `.alert("Submitted post successfully", "Post is being processed")` |
| image upload returned nothing / threw | `.alert("Failed to upload image", "Please try again later.")` |

A successful post/comment submit increments `posts_created` / `comments_created`.

#### 16.5.5 `EditPostSheet` / `EditCommentSheet`

No title, flair, type or URL editing — Reddit does not allow changing those after posting. The submit
button reads **"Save"** rather than "Post". Tabs are Preview / Old Version. No drafts. Endpoint V4.

---

## 17. Text selection sheet

Presented from the comment menu's `Select Text` (raw `comment.body` markdown) and the post "…"
menu's `Select Text` (raw `post.selfText` markdown). This sheet is the **only** place a body's text is
selectable, because inline selection on comment and post bodies is disabled so tap-to-collapse keeps
the row's tap (`02-architecture.md` §9.5).

A bottom-anchored panel: **65 % of screen height**, 30 pt rounded top corners, 3 pt border,
`theme.tint` background, sliding up over a full-screen black scrim at **0.7** opacity. Tapping the
scrim dismisses.

The content is a read-only, multiline, selectable text view that gives the real system selection UI
(handles, magnifier, copy/lookup/translate/share). In SwiftUI on iOS 26+, use
`Text(raw).textSelection(.enabled)` inside a `ScrollView`; note the iOS 27 change that selectable
`Text` now uses real system selection gestures rather than a callout menu — verify this does not
fight the sheet's dismiss tap, and use `.highPriorityGesture` on the scrim if it does. There is **no
custom copy button** in the panel; copying relies entirely on the system menu.

---

## 18. Markdown rendering

**One pipeline, one dialect.** Reddit returns both the markdown source (`selftext`, `body`) and its own
server-rendered HTML (`selftext_html`, `body_html`). `APPNAME` parses the **markdown source** with the
first-party Reddit-flavored parser in the `RedditMarkdown` package and renders from the typed
`MarkdownDocument` AST — for fetched content **and** for composer previews, so the preview *is* the
render by construction (`02-architecture.md` §9.1, `[DECISION: snudown-renderer]`). It is **not** a
web view and **not** `AttributedString(markdown:)`, which is inline-only and cannot express the block
constructs Reddit comments are full of.

Two consequences for this section:

- **There is no HTML-entity decoding step.** `raw_json=1` is sent on every read
  (`03-data-and-networking.md` §1.3), so text arrives unescaped everywhere, including
  `reddit_video.hls_url`, which the original inconsistently left encoded.
  `[DECISION: raw-json-param]`
- **`body_html` / `selftext_html` are retained on the model but are not the rendering path.**
  `MarkdownDocument` can be built from HTML (`MarkdownSource.html`) as an emergency parity valve, and
  that branch is also what renders the two fields Reddit exposes *only* as HTML: a subreddit's sidebar
  description and its rules (`03-data-and-networking.md` §4.8).

Pipeline: `swift-cmark-gfm` for CommonMark + GFM, plus Reddit's dialect as a pre-pass over the source
and a post-pass over the node tree (`02-architecture.md` §9.2) → `[Block]` / `[Inline]` → a SwiftUI
block renderer. Inline runs within one block coalesce into a single `Text` built from an
`AttributedString`, so a paragraph is one layout pass; block elements become separate views.
Fidelity is held by the golden-file corpus in `02-architecture.md` §9.1.

### 18.1 Construct → rendering table

The left column names the AST node (`02-architecture.md` §9.3); the HTML tag Reddit would emit for the
same construct is given in parentheses purely as an identification aid.

| AST node (HTML equivalent) | Rendering |
|---|---|
| `.paragraph([Inline])` (`<p>`) | A text block with 5 pt vertical margin. |
| `.inlineImage(url:caption:)` — a paragraph whose **sole** content is a link or bare URL that `RedditLink` classifies as `.image` | Rendered as an inline image preview instead of text: fixed 150×200 container, 16:9 aspect, centered. This is how "a raw image URL on its own line" becomes an inline image. |
| `.spoiler([Inline])` (Reddit's `>!…!<`, `class="md-spoiler-text"`) | Tappable run. Hidden: foreground `theme.tint` on a `theme.tint` background (invisible), 2/5 pt padding. Revealed: foreground `theme.subtleText`; the background block persists. Reveal state is keyed by (row id, spoiler index) **in the screen model, not in the leaf view**, so a recycled row never inherits another row's revealed state (`02-architecture.md` §18.3 rule 3). |
| `.heading(level:[Inline])` (`<h1>`–`<h6>`, and Reddit's `header`-attribute quirk) | Font sizes 32 / 24 / 20 for levels 1–3, level 4+ clamped to 20; line height `floor(size × 1.3)`; 10 pt top / 4 pt bottom margin. |
| `.codeBlock(language:code:)` (`<pre>`) | A **horizontally scrolling** container (no vertical scroll), 10 pt padding, `theme.tint` background. Touches inside must not be stolen by enclosing tap targets. No syntax highlighting. |
| `.thematicBreak` (`<hr>`) | 1 pt bottom border in `theme.tint`, 8 pt vertical margin. |
| `.blockquote([Block])` | Container, `theme.tint` background, 2 pt leading rule in `theme.subtleText`, 5/8 pt margin/padding-left, 2 pt vertical margin. Nested quotes re-apply the same single-level styling at each level; there is no compounding indent. |
| `.table(header:alignments:rows:)` | Horizontally scrolling container, `maxWidth: 100%`, 5 pt vertical margin. Header row carries bold weight. Cell: 1 pt `theme.tint` border, 2 pt padding. **Column width** = `(screenWidth − 30) / columnCount` when there are fewer than 4 columns, else a fixed **100 pt**, so wide tables scroll rather than squeeze. GFM column alignments are honoured. |
| `.strong([Inline])` (`<strong>`) | Bold text. |
| `.emphasis([Inline])` (`<em>`) | Italic text. |
| `.strikethrough([Inline])` (`<del>`) | Strikethrough (solid). |
| `.code(String)` (inline `<code>`) | Monospace (`.system(.body, design: .monospaced)`) on a `theme.tint` background, inline within its paragraph. No highlighting. |
| `.superscript([Inline])` (`<sup>`) | Rendered at a reduced font size (11 pt at body size) **and with a real baseline offset**, so it reads as true superscript. The original rendered it as merely-smaller text with no offset; that is a rendering defect, not a style. Nesting depth compounds the size reduction. `[DECISION: superscript-baseline]` |
| `.giphy(id:)` (a `giphy.com` link) | Intercepted entirely — the link is never followed. The id is the **5th path segment**; render `https://i.giphy.com/<id>.webp` inline with the same 16:9 image treatment. |
| `.link(destination:children:)` | Text coloured `theme.iconOrTextButton`. Tap routing follows `LinkDestination` (`02-architecture.md` §9.3): `.route` pushes; `.reddit` resolves the short link (`redd.it/<id>`, `/s/<id>` — navigable even though classification alone says unknown until resolved) then pushes; `.media` presents the viewer; `.external` goes to the external-link handler after stripping stray `\` / `%5C` escapes Reddit's own linkifier leaves in URLs containing underscores. |
| A link whose only child is an image | Rendered as the image alone; the wrapping link contributes its destination as the image's tap target. (The original emitted an empty container here and relied on Reddit duplicating the image elsewhere in the HTML.) |
| `.list(ordered:start:tight:items:)` (`<ol>` / `<ul>`) | A container; each item is a row of a marker column plus a flexible content column. Ordered lists **honour `start`**, and each item's ordinal continues correctly; unordered lists use a depth-appropriate marker (`•`, `◦`, `▪` cycling by depth). **Nesting is tracked**, so a nested ordered list numbers from its own `start` while the outer list continues from where it left off — the original re-numbered from a local DOM index and got both wrong. Correct numbering falls out of the AST for free. `[DECISION: nested-list-render-bug]` |
| `.inlineImage(url:caption:)` (bare image) | An inline image (150×200 container, 16:9), 10 pt vertical margin, centered, with its caption below when present. |
| `.softBreak` / `.lineBreak` | A soft break joins with a space; a hard break starts a new line. Blank lines between blocks come from the AST's block structure, so no whitespace-stripping pass is needed — the original had to filter whitespace-only text nodes out of the HTML DOM. |
| `.themeChip(CustomTheme)` (the `::appname-theme::` sentinel) | Extracted by the pre-pass, stripped from the displayed text, and rendered inline as a `ThemeImportChip` (`04c` §18.5). `[GATE: gate.customThemes]` |
| Emoji-only bodies | **Clamped to body text size.** The original renders standalone emoji runs oversized because nothing clamps them; that is a bug and is not reproduced. `[DECISION: giant-emoji-bug]` |

`/r/name` and `/u/name` mentions **are** autolinked, by the post-pass autolinker in
`02-architecture.md` §9.2 (word-boundary anchored, skipped inside code spans and existing links), and
resolve through the same `.link` path above.

Reddit-internal `/r/…` and `/u/…` mentions are **not** special-cased; they flow through the generic
link path above and navigate in-app when recognized.

### 18.2 Composer preview

The composer preview uses **the same parser and the same renderer** as fetched content —
`MarkdownView(document: parseRedditMarkdown(text))` — so there is no second dialect, no HTML
round-trip and no inter-tag-whitespace hack. The original ran a separate WASM snudown build for
previews and needed a `>\s+<` → `><` collapse because its two paths disagreed; neither exists here.
`[DECISION: snudown-renderer]`

- The preview recompute is **debounced at 150 ms**. The original reparsed on every keystroke.
- Constructs the preview must handle, i.e. all of them: bold, italic, strikethrough, links, images
  (bare and linked), spoilers, blockquotes (including nested), headings, ordered and unordered lists
  (including nesting, numbered **correctly**), horizontal rules, inline and fenced code, tables,
  superscript, `/r/` and `/u/` autolinks, and the theme-attach sentinel.
- Accept ~95 % fidelity against Reddit's own snudown for exotic markdown; divergences found by the
  golden-file corpus become parser bugs with a failing test (`02-architecture.md` §9.1).

### 18.3 Paragraph height repair

The original works around a text-layout bug by measuring each paragraph's laid-out height and, when
it is non-integral, re-rendering once with `round(h) + 1` pinned. That is a React Native layout
artefact with no SwiftUI equivalent and is **not** ported. `[DECISION: text-height-repair-omit]`

---

## 19. Settings that affect these screens

All read through the typed `SettingsStore`. Effects are as specified above; this table is the index.
Full settings-tree UI (labels, sections, order, pickers) is in `04c` §§14–20.

**Key names.** The names in the left column are the original's flat keys, i.e. the "Legacy key" column
of `03-data-and-networking.md` §8.1. **`03` §8.1 is the single normative source for key names, types
and defaults**; its namespaced `APPNAME` equivalents (`post.compactMode`, `filters.hideSeenPosts`,
`sorting.defaultPost`, …) are what the code declares. `[DECISION: settings-key-rename]`

| Key | Type | Default | Effect on this document's screens |
|---|---|---|---|
| `postCompactMode` | Bool | `false` (iPhone) | Compact vs normal card layout (§4) |
| `showThumbnailsOnRightSide` | Bool | `false` | Compact thumbnail side; row becomes space-between |
| `subredditAtTop` | Bool | `false` | Subreddit row above title vs inline in metadata |
| `showSubredditIcon` | Bool | `true` | Draw subreddit icons (also suppressed in low-data) |
| `postTitleLength` | Int (1–10) | `2` | Title line clamp |
| `postTextLength` | Int (0–10) | `3` | Self-text preview clamp; `0` hides the block |
| `linkDescriptionLength` | Int (0–30) | `10` | Link-card OG description clamp; `0` hides it |
| `showPostFlair` | Bool | `true` | Flair chip on post cards |
| `blurSpoilers` | Bool | `true` | Spoiler blur on post media |
| `blurNSFW` | Bool | `true` | NSFW blur on post media |
| `autoPlayVideos` | Bool | `true` | Whether feed videos ever mount a player |
| `feedVideoAudio` | Bool | `false` | Whether the Focused Post plays with sound |
| `tapToCollapsePost` | Bool | `true` | Post-detail header tap collapses media |
| `filterSeenPosts` | Bool | `false` | Global hide-seen |
| `hideSeenURLs` | [String: Bool] | `[:]` | Per-base-page hide-seen override |
| `filteredSubreddits` | [String: FilterExpiry] | `[:]` | Subreddit filter map |
| `autoMarkAsSeen` | Bool | `false` | Mark seen on scroll-past; live, no restart |
| `filterText` | String | `""` | Whole-word text filter list |
| `swipeAnywhereToNavigate` | Bool | `false` | Kills right-side swipe actions; enables anywhere-back |
| `postSwipeOptions` | 4-slot map | right=upvote, farRight=downvote, left=hide, farLeft=bookmark | Post swipe mapping |
| `commentSwipeOptions` | 4-slot map | right=upvote, farRight=downvote, left=reply, farLeft=bookmark | Comment swipe mapping |
| `defaultPostSort` | enum | `.default` | Global post sort |
| `defaultPostSortTop` | enum | `.all` | Global Top window |
| `rememberPostSubredditSort` | Bool | `false` | Per-subreddit post sort memory |
| `sortHomePage` | Bool | `false` | Whether the default sort applies to Home at all |
| `defaultCommentSort` | enum | `.default` | Global comment sort |
| `rememberCommentSubredditSort` | Bool | `false` | Per-subreddit comment sort memory |
| `postSubredditSort[<name>]` | enum | — | Remembered per-subreddit post sort |
| `postSubredditSortTop[<name>]` | enum | — | Remembered per-subreddit Top window |
| `commentSubredditSort[<name>]` | enum | — | Remembered per-subreddit comment sort |
| `voteIndicator` | Bool | `false` | Right-edge colored border on voted comments; no refresh alert |
| `collapseAutoModerator` | Bool | `true` | Top-level AutoModerator comments start collapsed |
| `commentFlairs` | Bool | `true` | Comment author flair chip |
| `tapToCollapseComment` | Bool | `true` | Tap a comment row to collapse; no refresh alert |
| `collapseChildrenOnly` | Bool | `false` | Collapsing shows an "N more replies" stub |
| `scrollToNextButtonPosition` | enum (10 slots) | `.bottomRight` | Floating button dock |
| `dataMode.wifi` / `.cellular` | enum | `.normal` / `.normal` | Low-data media behavior (§4.5, §4.8, §9) |
| `has_already_offered_gallery_mode` (`flags.galleryModeOffered`) | Bool | `false` | One-time gallery-mode offer; set on either answer |
| `hideTabsOnScroll` | Bool | `false` | Maps to `tabBarMinimizeBehavior(.onScrollDown)` — the platform behaviour, **not** the original's hand-rolled 50 pt / 5 pt-delta / 200 ms translate. `[DECISION: tab-hide-on-scroll]` |
| `showUsername` | Bool | `true` | Account tab label shows the username |

---

## 20. Swift Testing cases for pure logic

Write these as `@Test` functions in Swift Testing (new tests; XCTest reserved for UI/perf per the
2026 baseline). Every item below is pure and requires no network.

### 20.1 `ListingStore` pagination & filtering

| Test | Assertion |
|---|---|
| `dedupeMatchesOnIdAndKind` | Two items with the same id but different kinds both survive; same id + same kind de-dups. |
| `dedupeAppliedOnLoadMoreNotRefresh` | A refresh that returns the same items as are already loaded replaces rather than empties. |
| `cursorTracksUnfilteredLastItem` | With a filter that drops every item of a page, the next request's `after` equals the last **raw** item's fullname. |
| `emptyPageSetsFullyLoadedImmediately` | A page of 0 raw items stops the retry loop on the first attempt and sets `fullyLoaded`. |
| `limitRampUpSequence` | Successive retry attempts request 10, 20, 40, 70, 100. |
| `galleryLimitRampUpSequence` | 10, 30, 50 with `filterRetries == 3`. |
| `retriesStopAtFirstSurvivor` | A filter that passes on attempt 3 leaves `hitFilterLimit == false` and issues exactly 3 requests. |
| `hitFilterLimitRefusesFurtherLoadMore` | After exhausting retries, a subsequent `loadMore()` issues no request. |
| `refreshClearsFilterLimitAndFullyLoaded` | Both flags reset. |
| `accessFailureShortCircuits` | Banned/private/notFound stops retrying and issues no further requests. |

### 20.2 Swipe banding

| Test | Assertion |
|---|---|
| `bandZeroBelow75` | 74.9 pt → band 0. |
| `bandOneAt75` | exactly 75 → ±1. |
| `bandTwoAt130` | exactly 130 → ±2; 129.9 → ±1. |
| `signEncodesDirection` | −140 → band −2 with the right-edge icon. |
| `oneHapticPerTransition` | Dragging 0→80→140→80→0 yields exactly 4 haptics. |
| `noHapticWithinSameBand` | 80→100→120 yields zero additional haptics. |
| `actionFiresOnReleaseOnly` | No action during `onChanged`; exactly one on `onEnded` with a non-zero band. |
| `noActionOnBandZeroRelease` | Releasing at 40 pt fires nothing. |
| `swipeAnywhereClampsRightward` | With the setting on, +200 pt clamps to band 0 and −200 still yields −2. |
| `verticalDragCancels` | 12 pt of vertical movement fails the gesture with no band change. |
| `swapOnConflictSwapsSlots` | Assigning `upvote` to `left` when `right` holds it leaves `right` holding `left`'s previous value. |
| `disabledNeverSwaps` | Assigning `disabled` to two slots leaves both `disabled`. |

### 20.3 Vote arithmetic

| Test | Assertion |
|---|---|
| `noneToUp` | (10, .none) + up → (11, .up) |
| `upToNone` | (11, .up) + up → (10, .none) |
| `upToDown` | (11, .up) + down → (9, .down) |
| `downToUp` | (9, .down) + up → (11, .up) |
| `statsIncrementOnlyOnNonNeutral` | Retracting increments no counter. |

### 20.4 Text filtering

| Test | Assertion |
|---|---|
| `wholeWordOnly` | `"cat"` matches `"the cat sat"`, not `"caterpillar"`, not `"bobcat"`. |
| `boundaryAtStringEnds` | `"cat"` matches the whole string `"cat"`. |
| `punctuationIsBoundary` | `"cat"` matches `"cat, dog"` and `"(cat)"`. |
| `caseInsensitive` | `"CAT"` in the list matches `"cat"` in the text and vice versa. |
| `phrasesMatchLiterally` | `"hot dog"` matches `"a hot dog stand"` but not `"hot  dog"` (double space). |
| `parsingSplitsOnCommaAndNewline` | `"a, b\nc,d"` → `["a","b","c","d"]`; empties dropped; entries trimmed. |
| `emptyListPassesEverything` | An empty filter string passes all input. |
| `anyFieldMatchRejectsPost` | A match only in the OG description rejects the whole post. |
| `haystackFieldsPost` | Title, author, self-text, poll options, OG title, OG description are all searched. |
| `haystackFieldsComment` | Only body + author. |

### 20.5 Comment tree flattening

| Test | Assertion |
|---|---|
| `orderIsParentThenSubtreeThenLoadMore` | For a parent with children and a pending `loadMore`, the loadMore row comes after every descendant. |
| `rootLoadMoreIsLast` | The whole-thread loadMore row is the final element. |
| `filteredCommentDropsSubtree` | A failing parent removes its passing children too. |
| `collapsedHidesChildrenAndOwnLoadMore` | With `collapseChildrenOnly == false`. |
| `collapsedChildrenOnlyEmitsStub` | With children → exactly one `collapsedReplies` row; without children → none. |
| `collapsedChildrenOnlyStillHidesGrandchildren` | Depth 2+ never appears. |
| `siblingsUnaffected` | Collapsing one top-level thread leaves the next thread's rows intact. |
| `rowKeysUnique` | A comment with an id that also has a loadMore stub produces distinct keys. |
| `depthBorderIndex` | Comment at depth 3 → color index `(3−1) % 6`; its loadMore stub → `3 % 6`. |
| `autoModCollapsedOnlyAtTopLevel` | Depth 0 AutoModerator collapsed; depth 1 not; and not at all when the setting is off. |
| `flattenPerformance` | A synthetic ~2 000-node tree (36 threads × 56 nodes) flattens in well under 100 ms. |

### 20.6 Sort resolution

| Test | Assertion |
|---|---|
| `explicitSortWins` | A route already carrying a sort is untouched. |
| `homeIgnoresDefaultWhenSortHomePageOff` | No rewrite. |
| `homeAppliesDefaultWhenOn` | Rewrites to `defaultPostSort`. |
| `perSubredditBeatsGlobal` | When remembering is on and a key exists. |
| `globalUsedWhenNoPerSubredditKey` | Falls through. |
| `defaultSentinelMeansNoRewrite` | `"default"` leaves the route alone. |
| `topWindowFallsBackToAll` | With no remembered or global window. |
| `multiTopDefaultsToDay` | Multireddit `top` with no `t` → `day`. |
| `userSortDefaultsToNew` | User routes with no sort → `new`. |
| `manualChangeWritesBackWhenRemembering` | Including the Top window. |

### 20.7 Formatting

| Test | Assertion |
|---|---|
| `timeBuckets` | 59 s → `"59 seconds"`; 60 s → `"1 minute"`; 3599 s → `"59 minutes"`; 86 399 s → `"23 hours"`; 30 d → `"1 month"`; 359 d → `"11 months"`. |
| `twelveMonthSeam` | 362 days → `"0 years"` (documents the seam). |
| `pluralization` | 1 → singular; 0 and 2 → plural. |
| `shortForms` | `"59s"`, `"1m"`, `"23h"`, `"29d"`, `"11mo"`, `"3y"`. |
| `prettyNumThresholds` | 1000 → `"1000"`; 1001 → `"1.0K"`; 1 000 000 → `"1000.0K"`; 1 000 001 → `"1.0M"`. |

### 20.8 Filters, hide, seen

| Test | Assertion |
|---|---|
| `hiddenPostExpiryIsThirtyDays` | `expiresAt == now + 30d`. |
| `expiredHiddenRowReadsAsNotHidden` | Before the sweep runs. |
| `unhideDeletesRow` | Not just a flag flip. |
| `subredditFilterForeverVsExpiry` | `true` always filters; a past timestamp does not; a future one does. |
| `hideSeenOverrideDeletedWhenEqualToGlobal` | Toggling back to the global value removes the key. |
| `hideSeenBasePageKeying` | `/r/pics/top/?t=week` and `/r/pics/new` share one override slot; Home has exactly one slot. |
| `seenWriteBeforeEvent` | The change publisher never fires before the row exists. |
| `seenPruneKeepsExactlyCap` | 5 001 rows → 5 000 remain, oldest deleted. |
| `draftPruneKeepsExactlyCap` | 101 → 100. |

### 20.9 Composer logic

| Test | Assertion |
|---|---|
| `quoteOnEmptyEditor` | Result is exactly `"> "`. |
| `quoteWithCollapsedCursorMidDocument` | `"> "` inserted after the preceding newline. |
| `quoteOnFirstLineWithCollapsedCursor` | **No change** (documents the edge case). |
| `quoteWithMultiLineSelection` | Every selected line gains `"> "`. |
| `wrapHelpers` | Bold/italic/strike/spoiler wrap the selection, and insert empty delimiters when nothing is selected. |
| `linkInsertWithNoSelection` | Produces `[](url)`. |
| `draftKeyShapes` | Comment/post/title/message key strings match `03` §7.5 exactly. |
| `postTypeSwitchKeepsFieldsSeparate` | Typing a URL as a Link post, switching to Text, and back leaves both fields intact and neither contaminated. |
| `modOnlyFlairsFilteredOut` | A mod-only flair never appears in the picker. |

### 20.10 Gallery-mode offer

| Test | Assertion |
|---|---|
| `offerRequiresAllFourConditions` | Dropping any one suppresses the offer. |
| `combinedFeedsNeverOffer` | Home / all / popular. |
| `ratioBoundary` | 84 % → no offer; 85 % → offer. |
| `bothAnswersSetTheFlag` | Open and Cancel both write `flags.galleryModeOffered`; the offer never reappears. |

### 20.11 Markdown rendering

| Test | Assertion |
|---|---|
| `soleImageLinkParagraphBecomesInlineImage` | And an ordinary link paragraph does not. |
| `giphyLinkExtractsFifthSegment` | Produces the expected `i.giphy.com` URL. |
| `tableColumnWidthHeuristic` | 3 columns → `(w−30)/3`; 4 columns → 100 pt. |
| `noWhitespaceStrippingPassNeeded` | Block spacing comes from the AST, so no whitespace-only block is ever emitted. |
| `anchorWrappingImageSuppressed` | A link whose only child is an image renders the image, with the link as its tap target. |
| `backslashEscapeStrippedOnExternalOpen` | `%5C` removed before opening. |
| `orderedListNumbersHonourStart` | An ordered list honours `start`, and a nested list numbers from its own `start` while the outer continues. |
| `spoilerTogglesIndependently` | Two spoilers in one body keep separate state. |
| `themeTokenStrippedFromText` | And yields one chip per token. |

---

## 21. Traceability

### 21.1 Source spec → this document

| Source (in `docs/swift-rewrite/spec/`) | Section | Covered here |
|---|---|---|
| `spec/01-navigation-shell.md` §4.2 (screen registry), §5.1–5.2 (switcher, sort/context buttons), §5.3 (nav helpers), §7.5–7.6 (sort parsing, preferred sorts), §13 (scroll-to-next button), §14 (haptics), §15 (one-time alerts) | routing, toolbar, sorts, floating button | §3.2, §8, §15.4, §16.4, §7.1 |
| `spec/01` §3 (tab bar hide-on-scroll), §3.1 (tab re-tap) | scroll-to-top semantics | §2.5, §19 |
| `spec/01` §10 (split view) | explicitly out of scope | §Scope note |
| `spec/02-api-contract.md` §2.1 (P1–P3), §2.2 (C1–C3), §2.3 (V1–V5), §2.4 (S1–S4), §2.5 (R4), §2.9 (M2–M5) | endpoints used | §2.1, §3.3, §7.4–7.5, §11.1, §14.5, §16.5 |
| `spec/02` §4.1–4.9 (models), §4.13 (formatting) | post/comment model fields, time & number formatting | §4, §5, §14 |
| `spec/02` §5.1–5.2 (cursors, list state machine), §7 (error copy) | pagination + error states | §2.1, §2.2 |
| `spec/03-feed-and-posts.md` §1–§2 (screens, data loading), §3 (gallery offer), §4 (post card), §5 (tap targets), §6 (context menu), §7 (swipes), §8 (voting), §9 (feed video/FABs), §10 (save/share), §11 (seen), §12 (hidden), §13 (subreddit filters), §14 (text filters), §16 (sorting), §17 (switcher), §18 (Subreddits page), §19 (subreddit menu), §20 (low data), §21 (stats), §22 (formatting), §23 (settings) | the whole feed half | §2–§11, §19 |
| `spec/03` §15 (AI filters) | omitted by owner decision | §1.2 |
| `spec/04-post-details-comments.md` §1 (composition), §2 (header), §3 (flattening + rows), §4 (collapse), §5 (scroll-to-next), §6 (markdown), §7 (comment menu), §8 (comment swipes), §9 (comment sort), §10 (select text), §11 (composers), §12 (virtualization), §13 (context mode), §14 (pull-to-refresh), §15 (settings) | the whole comments half | §12–§19 |
| `spec/05-media.md` §1.2 (link preview/OpenGraph), §7.1–7.3 (focus, autoplay, FABs), §11 (low data) | feed-side media contract | §4.5, §4.8, §9 |
| `spec/06-settings-themes.md` §2.2 (sorting), §2.3 (filters), §4.1–4.2 (appearance), §11.2 (key inventory) | settings that affect these screens | §19 |
| `spec/08-feature-inventory.md` A, B, C, I, J, N, O, P | acceptance checklist coverage | throughout |
| `spec/09-persistence-pro-utils.md` §1.2 (seen/hidden/drafts tables), §1.3 (maintenance), §6.1 (Slideable), §6.4 (action catalog), §7.1–7.2 (formatters) | persistence + interaction primitives | §7.1, §7.6–7.7, §16.5.3, §5 |
| `spec/10-swiftui-2026-baseline.md` A3 (List vs LazyVStack, `onScrollTargetVisibilityChange`, `contextMenu` icons, selectable `Text` on iOS 27, `sensoryFeedback`, `swipeActions` outside `List`, markdown limits) | API choices | §2.1, §7.1, §7.2, §9, §12.1, §17, §18 |

### 21.2 Decision tags used in this document

Every id below is the canonical id of a numbered entry in `08-decisions-and-drift.md` §1/§2. There are
no aliases, and the register's "Default (assumed)" column is what this document specs.

| Tag | Subject |
|---|---|
| `ipad-split-view-deferred` | iPad split view omitted in v1 |
| `post-summary-dead-setting` | `showPostSummary` dropped |
| `comment-summary-dead-setting` | `showCommentSummary` dropped |
| `poll-voting-stub` | Polls render read-only with results; no fake Vote button; no poll post type |
| `crosspost-longpress` | Crosspost card has no long-press menu of its own |
| `pagination-cursor` | Cursor is the last item's own fullname, not the listing `after` |
| `time-format-parity` | Reproduce the bucket arithmetic; the 360–364-day seam is `time-year-seam` |
| `time-year-seam` | A 360–364-day-old item must not report "0 years" |
| `number-format-parity` | Two separate formatters; feed cards abbreviate score and comment count |
| `vote-no-optimistic-rollback` | Votes apply optimistically and roll back on failure |
| `postdetail-vote-not-reflected` | A vote in post detail patches the feed row behind it |
| `unhandled-save-failure` | Save applies optimistically, rolls back, never leaks a rejection |
| `mark-seen-live` | "Mark as seen on scroll" takes effect immediately; no restart alert |
| `gallery-offer-cancel` | The one-time gallery offer is suppressed on **either** answer |
| `report-webview` | Report opens a generic reddit.com/report page, not item-specific |
| `context-no-highlight` | Comment permalinks get no highlight/scroll-to affordance |
| `comment-menu-copy-text` | The comment menu has nine items, including the undocumented Copy Text |
| `comment-sort-six` | Six real comment sorts in the in-post menu |
| `comment-tree-renderer` | Flatten to rows and render in a recycling `List` |
| `more-stub-count-zero` | A `more` stub with `count: 0` renders "Continue this thread →" |
| `composer-no-discard-confirm` | Cancelling an **edit** with unsaved changes confirms first |
| `newpost-type-switch-keeps-text` | Separate text fields per post kind |
| `unknown-error-rethrow` | Alert once on an unknown submit error; never re-throw |
| `superscript-baseline` | `<sup>` renders raised, not merely smaller |
| `nested-list-render-bug` | Nested lists number correctly |
| `giant-emoji-bug` | Emoji-only bodies clamp to body size |
| `text-height-repair-omit` | The RN paragraph-height workaround is not ported |
| `theme-count` | The six comment-depth colours are new and are defined in `04c` §18.2, not here |
| `raw-json-param` | `raw_json=1` on every read; no client-side entity decoding |
| `snudown-renderer` | One first-party markdown pipeline for fetched content and previews |
| `quote-first-line` | The composer's quote-on-first-line no-op is fixed |
| `scroll-to-next-button` | The floating comment-nav button, with "previous" as a long-press |
| `hidden-posts-local` | Hiding stays local; Reddit's hide endpoint is never called |
| `swipe-forward-gesture` | The right-edge forward swipe is dropped in v1 |
| `nav-bar-tap-guard` | Verify the switcher title is not swallowed by scroll-to-top |
| `ai-removed` | No AI summaries, no AI filters |

### 21.3 Gate tags used in this document

| Gate id | Where |
|---|---|
| `gate.customThemes` | Theme-import chips in rendered bodies (§4.5, §18.1); the composer's "Attach Theme" action (§16.5.1) |
| `gate.galleryMode` | Gallery Mode's 100-item limit, reached from the one-time offer (§10) and the "Open in Gallery Mode" menu item (§11.1) |
| `gate.filters` | The text filter (§7.3), hidden posts (§7.6), hide-seen global and per-page (§7.7), subreddit filters (§7.8) |
| `gate.sortMemory` | Persisting a sort preference — default sorts, default Top range, apply-to-home, per-subreddit memory (§16.4). **OWNER, default gated** |
| `gate.videoAutoplay` | Inline feed autoplay and the feed-audio FAB (§9). **OWNER, default free** |
| `gate.compose` | Opening any composer (§16.5). **OWNER, default free** |

Gates declared in the companion documents and referenced from here: `gate.multiAccount`,
`gate.gestures`, `gate.appIcons`, `gate.stats` (`04c`), and `gate.downloads` (`04b`).
