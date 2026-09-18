# Hydra — User-Facing Feature Inventory (Documentation-Derived Acceptance Checklist)

Source material: `documentation/*.md` (38 files), `README.md`, `CONTEXT.md`, `todo.txt`,
`components/Modals/StartupModals/UpdateInfo.tsx`, `docs/specs/*.md`, `docs/adr/*.md`,
`docs/superpowers/specs/*.md` + `docs/superpowers/plans/*.md` (CI/release only),
`assets/`, `app.config.ts`, `package.json`, `patches/`, `.circleci/config.yml`, `eas.json`,
`scripts/release.js`, `pages/SettingsPage/General/AppIcon/AppIcon.tsx`.

This document is a checklist of *documented user-visible behavior*, not a code audit. Each
checklist item cites its source doc in brackets, e.g. `[browsing_posts.md]`. Use it to verify
the from-scratch SwiftUI rewrite is complete — every line should have a corresponding
implemented behavior.

---

## 1. Master Feature Checklist

### A. Browsing / Feed

1. Home feed shows posts from subscribed subreddits; opened via the Posts tab. [browsing_posts.md]
2. Posts load automatically as the user scrolls (infinite scroll). [browsing_posts.md]
3. Pull-down-to-refresh reloads the feed at any time. [browsing_posts.md]
4. Earlier posts remain accessible scrolling back up (no discard of already-loaded pages). [browsing_posts.md]
5. Compact mode: denser post layout showing more posts at once with reduced spacing. [browsing_posts.md, appearance_settings.md]
6. Tapping a post card opens it in a detail view. [browsing_posts.md]
7. Post detail view includes full content, author info, subreddit name, media, vote counts, comments, and post action bar. [browsing_posts.md]
8. Scrolling down in post detail reveals comments; swipe right or back button returns to feed. [browsing_posts.md]
9. Tapping the post content area collapses it in detail view, if "Tap to Collapse" is enabled (default on). [browsing_posts.md, appearance_settings.md]
10. Post interactions: tap to open, swipe for configured quick actions, long-press for a context menu, vote directly from the feed, save for later — all without opening the post. [browsing_posts.md]
11. Supported post types: Text (self) posts with configurable preview length, Link posts with previews, Image posts with gallery support, Video posts with optional auto-play, Poll posts (interactive), Crossposts (shows original post + subreddit). [browsing_posts.md]
12. NSFW and spoiler content is blurred by default; tap to reveal (configurable). [browsing_posts.md]
13. Each post displays title, subreddit, author, time posted, vote count, comment count, and flair (if enabled). [browsing_posts.md]
14. Posts can be sorted: Best, Hot, New, Top (with time period), Rising; multireddits additionally offer Controversial instead of Best. [browsing_posts.md, sorting.md]
15. Posts can be filtered via text filters, AI filters (Pro), "hide seen posts", or subreddit filters. [browsing_posts.md]
16. Posts are marked "seen" when opened, voted on, commented on, or (if enabled) scrolled past; seen posts appear dimmed. [browsing_posts.md, hiding_content.md]
17. "Hide Seen Posts" setting auto-filters previously-seen posts from the feed. [browsing_posts.md, hiding_content.md]
18. "Mark as Seen On Scroll" auto-marks posts as seen while scrolling past, without opening; requires app restart to take effect. [hiding_content.md]
19. Manual "Mark as Read" via long-press on a post. [hiding_content.md]
20. Per-page override of the global "Hide/Show Seen Posts" setting via the "..." context menu on any feed page; overridden pages are listed in Filters settings. [hiding_content.md]
21. Gallery Mode: grid layout (two-column masonry) filtering to only image/video posts, opened via "..." menu → "Open in Gallery Mode" on subreddit/home/multireddit pages. [browsing_posts.md, gallery_mode.md]
22. Hydra may automatically suggest Gallery Mode when a feed is detected to be mostly media. [gallery_mode.md, tips_and_tricks.md]
23. Gallery Mode full-screen viewer: swipe left/right moves between images in a multi-image post, swipe up/down moves between different posts, pinch to zoom, tap toggles post-info overlay, swipe down or tap X closes. [gallery_mode.md]
24. Gallery Mode overlay shows title, text preview, subreddit, author; tapping it opens the full post; a share button shares the media directly. [gallery_mode.md]
25. Gallery Mode applies text filters and hide-seen-posts settings, and subreddit filters on multireddit pages, but NOT AI filters. [gallery_mode.md]
26. Gallery Mode is capped at 100 posts for free users; unlimited scrolling is a Hydra Pro feature. [gallery_mode.md, hydra_pro.md]
27. Activity indicators show loading state during scroll/fetch. [navigation_basics.md]
28. Feed video posts show a static "Poster" (preview thumbnail with play icon) when not the focused/centered post; at most one video autoplays at a time (the "Focused Post" — the mostly-visible, centered video). [docs/adr/0003-focused-only-playback.md, docs/specs/02-focused-video-playback.md]
29. A post must be ~70% on screen (or cover ~60% of the viewport if taller than it) to become Focused; a playing video keeps focus more leniently than it gains it. [docs/adr/0003-focused-only-playback.md]
30. A persistent, global Feed Audio toggle (floating action button, bottom-right above tab bar, speaker icon) lets the Focused Post play unmuted; it interrupts background audio and plays even with the hardware silent switch on. Mirrored as a Settings row. [docs/specs/02-focused-video-playback.md]
31. Losing focus remembers video playback position; regaining focus later resumes from that position. [docs/adr/0003-focused-only-playback.md, docs/specs/02-focused-video-playback.md]
32. Animated GIF *images* (not GIFV/video) keep animating regardless of feed focus state. [docs/adr/0003-focused-only-playback.md]

### B. Posts (creating/editing/deleting)

33. New posts are created via a subreddit's "..." menu → "New Post" (only available while viewing a subreddit). [posting.md]
34. Post creation screen: post-type selector, title field, content area, optional flair selector, "Post" button. [posting.md]
35. Text Posts: title + Markdown body, with formatting toolbar and a live Preview section. [posting.md]
36. Link Posts: title + URL field. [posting.md]
37. Image Posts: title + a single image selected from the photo library via "Select Image"; image uploads automatically with a preview shown before submit; multiple images are NOT supported. [posting.md]
38. Formatting toolbar buttons: Link `[text](url)`, Bold `**text**`, Italic `*text*`, Quote `> text`, Strikethrough `~~text~~`, Spoiler `>!text!<`. Selecting text before tapping wraps the selection; raw Markdown (headers, lists, code blocks) can also be typed directly. [posting.md, commenting.md]
39. Post flair selector appears next to the title field if the subreddit supports flairs; "No Flair" option available. [posting.md]
40. Post drafts (title + body) auto-save as typed; restored next time the editor for that subreddit is opened; cleared on successful submit. [posting.md]
41. Editing a post: only the body text of the user's own text posts can be edited (Reddit restriction — titles, links, images cannot change); edited posts show an "edited" indicator. [posting.md]
42. Deleting a post: confirmation prompt required. [posting.md]
43. If Reddit requires a CAPTCHA on submit, Hydra offers to open Reddit's submission page in an in-app browser to complete it. [posting.md]
44. Posting requires login; some subreddits enforce account-age/karma requirements (surfaced as an error). [posting.md]

### C. Comments

45. Comment on a post via the reply button in the post's bottom action bar, opening the comment editor. [commenting.md]
46. Reply to a specific comment via long-press → "Reply", or a configured swipe gesture. [commenting.md]
47. Comment editor has a "Parent" tab (shows what's being replied to) and a "Preview" tab (rendered Markdown preview); when editing, tabs become "Preview" and "Old Version" (pre-edit text). [commenting.md]
48. Comment drafts auto-save as typed and restore next time the same reply target is opened; cleared once submitted. [commenting.md]
49. Formatting toolbar identical to post editor: Link, Bold, Italic, Quote, Strikethrough, Spoiler; select-then-tap to wrap selection; raw Markdown typing supported. [commenting.md]
50. Editing own comments via long-press → "Edit"; editor pre-fills current text; edited comments show an edited indicator with the edit time. [commenting.md]
51. Deleting own comments via long-press → "Delete", with confirmation. [commenting.md]
52. Comment long-press context menu actions: Upvote, Downvote, Collapse, Collapse Thread, Select Text, Reply, Save, Share; Edit and Delete appear only on the user's own comments. [commenting.md]
53. Commenting requires login; blocked on locked posts; some subreddits enforce account-age/karma requirements. [commenting.md]
54. Comments organized in threaded reply chains: top-level comments reply to the post, nested replies reply to other comments. [viewing_comments.md]
55. Indentation and colored left borders (fixed color set, not theme-customizable) indicate reply depth. [viewing_comments.md, custom_themes.md]
56. Each comment displays author username (with mod/OP badges), score, time posted, flair (if enabled), awards, and edited status. [viewing_comments.md]
57. Tapping a comment collapses/expands its thread (toggle "Tap to Collapse", default on; disabling requires page refresh to take effect). [viewing_comments.md, appearance_settings.md]
58. Collapsed threads show only the top comment; child comments remember their collapsed state through collapse/re-expand cycles. [viewing_comments.md]
59. A floating "scroll to next comment" button jumps to the next top-level comment on tap, and the previous one on long-press. [viewing_comments.md, tips_and_tricks.md]
60. The floating comment-nav button can be repositioned: hold ~1s to enter "move mode" (dark overlay with snap points appears), drag to a snap point, release to save the new position. [tips_and_tricks.md]
61. "Load more" link at the bottom of a thread fetches additional replies beyond what was initially loaded. [viewing_comments.md]
62. Pull down to refresh all comments on a post. [viewing_comments.md]
63. Comment sort options: Default, Best, New, Top, Controversial, Old, Q&A — chosen via the sort button top-right on a post. [viewing_comments.md, sorting.md]
64. Default comment sort configurable in Sorting settings; optional per-subreddit sort memory. [viewing_comments.md, sorting.md]
65. Vote on comments by tapping up/down arrow or swipe gesture; tapping the same arrow again removes the vote. [viewing_comments.md, voting.md]
66. Comment swipe gestures configurable per direction (short right/long right/short left/long left): upvote, downvote, reply, bookmark, share, collapse, collapse thread. [viewing_comments.md, gestures.md]
67. Stickied comments are pinned to the top with a pin icon. [viewing_comments.md]
68. Moderator comments are highlighted in a distinct color. [viewing_comments.md]
69. OP (post author) comments are color-coded with an "OP" badge. [viewing_comments.md]
70. AutoModerator comments are auto-collapsed by default (configurable). [viewing_comments.md, appearance_settings.md]
71. Deleted/removed comments show as "[deleted]"/"[removed]" while the thread structure remains visible. [viewing_comments.md]
72. Right-side vote indicators option moves vote arrows to the right side of comments, and adds a colored right-edge border on voted comments. [appearance_settings.md, voting.md]
73. Some subreddits temporarily hide comment scores after posting (shown as "-" until the period ends); Reddit applies score "fuzzing" so displayed numbers may be approximate. [voting.md]
74. Comment summaries (AI, Pro): summarizes top comments, shown between post content and comment section labeled "Comments Summary"; tappable to collapse/expand; only generated when there's enough comment text. [ai_summaries.md]

### D. Media (Images/Video/Gallery)

75. Image posts render inline with gallery support for multi-image posts. [browsing_posts.md]
76. Full-screen image viewer: double-tap to zoom to 2x, double-tap again to zoom out; pinch to zoom and pan while zoomed; swipe down to close. [tips_and_tricks.md]
77. Multi-image posts: swipe left/right to browse; an indicator shows position (e.g. "2 of 5"). [tips_and_tricks.md, gallery_mode.md]
78. Long-press an image to save to photo library or share. [tips_and_tricks.md, downloading_media.md]
79. Media Collection navigation arrows appear when viewing a collection of images/videos for easier swiping between items. [UpdateInfo.tsx v4.0.0]
80. Post info overlay in the media viewer: tapping content overlays title/subreddit/author; tapping those navigates to the relevant page. [UpdateInfo.tsx v4.0.0]
81. Media viewer dismiss: swipe up or down (both directions supported, not just one). [UpdateInfo.tsx v4.0.0]
82. Live Text (iOS 15+, A12 chip or later): select, copy, translate, look up, search, or share text found inside images via tap-and-hold. [live_text.md]
83. Live Text is OFF by default (interferes with image long-press gesture); enabled in Appearance settings. [live_text.md]
84. With Live Text enabled, the long-press-to-open-context-menu gesture requires a longer hold to avoid conflicting with text selection. [live_text.md]
85. Live Text has known limitations: low-res images, tiny text, unusual fonts, complex layouts, and handwriting are less reliable. [live_text.md]
86. Video: playback speed cycling button (top-left in fullscreen) cycles 0.5x, 1x, 1.5x, 2x. [tips_and_tricks.md, UpdateInfo.tsx v4.0.0]
87. Video: drag horizontally to scrub (swipe-to-scrub) through a fullscreen video. [tips_and_tricks.md, UpdateInfo.tsx v4.0.0]
88. Video: Picture-in-Picture supported via the standard iOS PiP gesture. [tips_and_tricks.md]
89. Video: long-press for save/share options; save flow is long-press → Share → "Save Video" in the share sheet. [tips_and_tricks.md, downloading_media.md]
90. Landscape mode: rotating the device while in the media viewer or in-app browser shows content in landscape. [UpdateInfo.tsx v4.0.0]
91. Auto-play videos setting: automatically plays videos while scrolling (uses more data/battery); can be disabled. [appearance_settings.md]
92. Redgifs videos are resolved lazily (at display/view time, not at feed-fetch time) — a per-video API call converts the watch-page URL to a playable `.mp4`; resolved URLs are cached only in memory for the session (not persisted, since they expire). [docs/adr/0001-lazy-redgifs-resolution.md]
93. A single shared video player instance is reused between the inline feed video and the fullscreen viewer for the same video — tapping into fullscreen doesn't reload or lose position, and device rotation re-attaches without reloading. [docs/adr/0002-shared-video-player-registry.md]
94. In Gallery Mode fullscreen, scrubbing a video locks vertical scrolling for a smoother experience (bugfix, confirms this is intended behavior). [UpdateInfo.tsx v4.0.0]
95. Posts containing a collection of multiple videos display all of them (not just the first). [UpdateInfo.tsx v4.0.0, bugfix entry]
96. Low Data Mode (Wi-Fi / Cellular independently): videos are not loaded while scrolling — shown as a thumbnail with a "VIDEO" label, loading only on tap. [data_use_settings.md]
97. Low Data Mode: images show thumbnails while scrolling; tap to load full resolution. [data_use_settings.md]
98. Low Data Mode: link-preview article images are not loaded. [data_use_settings.md]
99. Low Data Mode: subreddit icons are not loaded. [data_use_settings.md]
100. Hydra caches images locally for faster loading/offline access; cache size (MB) shown in Advanced Settings with a "Clear Image Cache" action that rebuilds automatically on browsing. [advanced_settings.md]
101. Hydra automatically picks the best image resolution to load per context (optimization, not just raw source). [UpdateInfo.tsx v4.0.0]
102. Image posts briefly showing the wrong image during load is a documented bugfix (i.e., correct behavior is: the correct image shows immediately). [UpdateInfo.tsx v4.0.0]

### E. Accounts / Login

103. Multiple Reddit accounts can be added and switched between. [accounts_and_login.md]
104. Browsing works fully logged-out (view posts/comments/subreddits/search) but voting, commenting, posting, and personalization require login. [accounts_and_login.md]
105. When logged out, the center tab shows as "Accounts"; when logged in, it shows the username and opens the user's profile. [accounts_and_login.md]
106. Hydra does NOT support creating new Reddit accounts in-app — direct users to reddit.com to sign up, then log in in Hydra. [accounts_and_login.md]
107. Login flow: Accounts tab → "+" → Reddit's own login page opens (web view) → username/password → 2FA if enabled → session saved. [accounts_and_login.md]
108. Adding additional accounts: profile tab → "Accounts" → "+" → log in with second account credentials. [accounts_and_login.md]
109. Switching accounts: profile tab → "Accounts" → tap the target account. [accounts_and_login.md]
110. Removing an account: swipe left on it and tap delete, or long-press → "Delete". [accounts_and_login.md]
111. "Logged Out" is itself a selectable pseudo-account in the Accounts list to browse anonymously while other accounts remain saved. [accounts_and_login.md]
112. Session data stored securely on-device using encrypted storage; password is never sent to Hydra's own servers — login happens directly with Reddit. [accounts_and_login.md]
113. Removing an account clears its stored session data. [accounts_and_login.md]
114. Google sign-in appears to be missing from the Hydra login screen (known bug, root cause TBD). [todo.txt]

### F. Inbox / Messages

115. Inbox tab shows notifications about account activity: replies to comments/posts and private messages. [inbox.md]
116. Unread-count badge on the Inbox tab updates automatically. [inbox.md]
117. Inbox refreshes automatically when opened; pull down to manually refresh; older items load automatically on scroll. [inbox.md]
118. Reply items show post title, subreddit, author, reply content, vote count, relative time. [inbox.md]
119. Private message items show subject, sender, content preview, time; unread messages show a highlighted mail icon vs. subtle for read. [inbox.md, messages.md]
120. Tapping a reply navigates to it in context within the full discussion; tapping an unread item marks it read automatically. [inbox.md]
121. Swipe actions on replies: swipe right = upvote (short)/downvote (longer swipe); swipe left = toggle read/unread. [inbox.md]
122. Swipe actions on messages: swipe left = toggle read/unread; swipe right = mark as read (quick swipe). [inbox.md, messages.md]
123. Long-press a reply: Upvote / Downvote / Mark as Read / Mark as Unread options. [inbox.md]
124. Long-press a message: Mark as Read option. [inbox.md]
125. "Mark All Read" checkmark button in the top-right of the Inbox marks every item read at once. [inbox.md, messages.md]
126. Tapping a message opens the full conversation thread, chronological, sender's messages on the left/user's on the right with author + timestamp on each. [messages.md]
127. Sending a new message: open a user's profile → "..." menu → "Message" → enter subject + body → Send. [messages.md]
128. Message composer has a markdown toolbar (bold, italic, links, quotes, strikethrough, spoiler) and a live preview. [messages.md]
129. Message drafts (new and reply) auto-save and restore. [messages.md]
130. Replying to a conversation: open it → "Reply" button at bottom → write → Send. [messages.md]
131. Inbox Alerts (Pro): push notifications for new comment replies, post replies, and private messages, so the user doesn't need to keep the app open. [inbox.md, inbox_alerts.md]

### G. Search

132. Search tab has three switchable result-type tabs: Posts, Subreddits, Users. [search.md]
133. Posts and subreddit search results support infinite scroll; user search is limited to a single page (Reddit API limitation). [search.md]
134. When no query is entered, the Search page shows a list of trending subreddits to discover. [search.md]
135. A search bar appears at the top of an open subreddit's post list to search within that subreddit only. [search.md]
136. Subreddit-scoped search sort options: Relevance, Hot, New, Top (with Hour/Day/Week/Month/Year/All Time), Comment Count. [search.md]
137. Quick Subreddit Search: long-press the Search tab to open an overlay; type ≥3 characters, tap a result to jump directly; tap outside to dismiss. [search.md, tips_and_tricks.md, navigation_basics.md]
138. Reddit search operators supported in queries: `author:username`, `subreddit:name`, `site:domain.com`, `title:text`, `selftext:text`; quoted phrases for exact match. [search.md]
139. Search finds posts, not individual comments; deleted/removed posts don't appear in results. [search.md, troubleshooting.md]

### H. Subreddits / Multireddits / Organizing Feeds

140. Subreddits page (first screen of the Posts tab) organizes communities into sections: Home, Popular, All, Favorites, Multireddits, Moderator, Subscribed/Subscriber — each shown only if applicable. [subreddits.md, organizing_feeds.md]
141. An A-Z alphabet scroller on the right lets the user jump directly to subreddits by letter in the Subscriber section. [subreddits.md, organizing_feeds.md]
142. When logged out, trending subreddits are shown instead of a subscriptions list. [subreddits.md]
143. Opening a subreddit shows its posts with a per-subreddit search bar at top and a sort button (Best/Hot/New/Top/Rising). [subreddits.md]
144. Subreddit "..." menu options: Subscribe/Unsubscribe, Favorite/Unfavorite, Add to Multireddit, New Post, Open in Gallery Mode, Sidebar, Wiki, Share. [subreddits.md]
145. Subscribing adds the subreddit's posts to Home feed; unsubscribing removes it; subscriptions list in the Subscribed section. [subreddits.md, organizing_feeds.md]
146. Favoriting pins a subreddit to the top of the Subreddits page; must be subscribed first to favorite; favorites stored locally per-account (not synced to Reddit). [subreddits.md, organizing_feeds.md]
147. Favoriting toggled via star icon on the Subreddits page or via "Favorite"/"Unfavorite" in the "..." menu. [organizing_feeds.md]
148. Multireddits combine multiple subreddits into one feed; must be created on Reddit's website or another client (Hydra cannot create them) but appear automatically once created. [subreddits.md, organizing_feeds.md]
149. Tapping a multireddit opens its combined feed; tapping its chevron expands to show member subreddits. [subreddits.md, organizing_feeds.md]
150. Add subreddit to multireddit via subreddit's "..." menu → "Add to Multireddit" → pick target. [organizing_feeds.md, subreddits.md]
151. Remove subreddit from multireddit: expand the multireddit on the Subreddits page, long-press the subreddit, "Delete From Multireddit". [organizing_feeds.md, subreddits.md]
152. Filtering a subreddit: long-press a post from it → "Filter Subreddit" — removes the triggering post and hides all future posts from that subreddit in combined feeds (Home, Popular, All, multireddits); does NOT apply when browsing the subreddit directly. [hiding_content.md, subreddits.md]
153. Filter Subreddit can be applied temporarily: for a day, a week, or forever (option shown on mixed feeds). [UpdateInfo.tsx v4.0.0]
154. Managing filtered subreddits: Filters settings → "Filtered subreddits" list → tap + confirm to remove a filter. [hiding_content.md]
155. Subreddit "Sidebar" view shows description, subscriber count, and expandable rules (tap a rule for full text). [subreddits.md]
156. Subreddit "Wiki" accessible from the "..." menu; new (non-old.reddit.com) wiki format is supported and used by default. [subreddits.md, UpdateInfo.tsx v4.0.0]
157. "Subreddit at top" appearance setting shows the subreddit name prominently on each post. [subreddits.md, appearance_settings.md]
158. "Subreddit icons" appearance setting shows community icons next to subreddit names (uses additional data). [subreddits.md, appearance_settings.md]
159. Having a multireddit literally named "All" no longer hides the built-in "All" button in the subreddit list (bugfix, i.e. correct behavior: both must coexist). [UpdateInfo.tsx v4.0.0]

### I. Voting

160. Tap the up-arrow to upvote a post/comment: arrow turns orange, score +1; tap down-arrow to downvote: arrow turns blue, score -1; tap the same arrow again to remove the vote. [voting.md]
161. Voting via configured swipe gestures on posts and comments (short/long swipe distances can map to different actions). [voting.md, gestures.md]
162. Swiping to vote again (on the same action) undoes the vote. [gestures.md]
163. Score = upvotes − downvotes; some subreddits hide comment scores for a period after posting (shown as "-"); Reddit applies "fuzzing" to displayed vote counts. [voting.md]
164. Upvoting from post-details view is documented as NOT reflected on the posts list (known bug, explicitly out of scope to fix per specs). [todo.txt, docs/specs/04-comment-virtualization.md]

### J. Saving / Bookmarks

165. Saving from post detail page: tap the bookmark icon in the bottom action bar (fills in when saved). [saving.md]
166. Saving from a feed/comment thread: long-press → "Save". [saving.md]
167. Saving via swipe gesture (default: long-left swipe on posts; configurable). [saving.md, gestures.md]
168. A small bookmark "notch" indicator appears on saved posts/comments in lists. [saving.md]
169. Saved content browsable from Account tab profile page via "Saved Posts" and "Saved Comments" buttons; both support pull-to-refresh and infinite scroll. [saving.md]
170. Unsaving uses the same mechanisms (tap bookmark again / long-press → "Unsave" / swipe); item removed from saved list immediately. [saving.md]
171. Saved items sync via the user's actual Reddit account — visible in any Reddit client, not just Hydra. [saving.md]
172. Saved items have no folders, tags, in-list search, sort, or filter — inherited Reddit limitation. [saving.md]
173. "Fancy bookmarks with folders and categories" and "search saved items" are explicitly NOT implemented. [todo.txt]

### K. Sharing / Downloading

174. Native iOS share sheet used to share posts, comments, images, videos, and subreddit/multireddit links. [sharing.md]
175. Posts and comments share as direct Reddit permalinks; images share as image files; videos are downloaded then shared as video files; subreddits/multireddits share as page links. [sharing.md]
176. Share entry points: long-press context menu → Share; configured swipe gesture (opens share sheet directly, no menu); post-detail action-bar share button; "..." menu Share (current page link) on subreddit/multireddit/post-detail pages; long-press image/video directly; Gallery Mode overlay share button. [sharing.md]
177. Shared post/comment links contain only the link — the sharer's Reddit account identity is never embedded. [sharing.md]
178. Saving a video: long-press → Share → "Save Video" in the share sheet → saved to Photos library. [downloading_media.md]
179. Saving an image: long-press → "Save Image" (direct) or Share → "Save Image" in the share sheet. [downloading_media.md]
180. Photo-library permission required/prompted for saving media; manageable in iOS Settings → Privacy & Security → Photos. [downloading_media.md]
181. Hydra appears as a share-sheet destination when sharing a URL from another app (into Hydra). [UpdateInfo.tsx v4.0.0 — "Hydra in Share Sheet"]
182. "Save posts and comments as image" is explicitly NOT implemented (feature request tracked externally). [todo.txt]

### L. External Links / In-App Browser

183. Reddit links always open within Hydra; external (non-Reddit) links open in a user-chosen browser. [external_links.md]
184. Browser choice options: Hydra (built-in, default), Default Browser (system, usually Safari), Chrome, Brave, Firefox, Edge, Opera — configured in External Links settings. [external_links.md, general_settings.md]
185. If a chosen third-party browser isn't installed, Hydra offers to open in the default browser instead. [external_links.md]
186. "Open in reader mode" (only shown when browser = Hydra) makes the built-in browser strip ads/nav/clutter for a clean text view. [external_links.md, general_settings.md]
187. "Open in Hydra" iOS Shortcut: installed via "Get Hydra Shortcut" → iOS Shortcuts app; then appears as a share-sheet option in other apps for opening Reddit links directly in Hydra. [external_links.md, general_settings.md]
188. Clipboard Reddit-link detection: "Read Links from Clipboard" toggle prompts to open a detected Reddit link; iOS will re-prompt for clipboard-read permission each time unless "Paste from Other Apps" is set to "Allow" in iOS Settings → Hydra. [external_links.md, general_settings.md, tips_and_tricks.md]
189. Rotating the device while the in-app browser is open shows the page in landscape. [UpdateInfo.tsx v4.0.0]
190. Link previews (article metadata) load favicons only when the site supports Open Graph; loading a favicon for non-OG sites is explicitly NOT implemented. [todo.txt]
191. Slow-responding link-metadata fetches are skipped/timed out so the feed loads faster in worst cases (documented bugfix behavior). [UpdateInfo.tsx v4.0.0]
192. Some link sources (e.g. Wikipedia) previously failed to show a preview image — fixed; correct behavior is a preview image displays. [UpdateInfo.tsx v4.0.0]
193. Reddit-internal links inside posts (e.g. linking to another Reddit thread like "/r/wowthissubexists") render as tappable Hydra links, not raw text. [UpdateInfo.tsx v4.0.0]
194. Landscape mode in the in-app browser is a known partial/buggy area ("enable landscape mode in the browser" listed as an open bug). [todo.txt]

### M. Navigation / Split View / Gestures (structural)

195. Bottom tab bar with five sections: Posts, Inbox, Account, Search, Settings. [getting_started.md, navigation_basics.md]
196. Tapping the currently-active tab navigates back one level in that tab's stack. [navigation_basics.md, tips_and_tricks.md]
197. Long-pressing the Search tab opens the quick subreddit search overlay. [navigation_basics.md]
198. Swipe right from the left screen edge, or tap the back button, to navigate back. [navigation_basics.md]
199. Long-press posts/comments/subreddits/users for quick-action context menus. [navigation_basics.md]
200. "..." button on subreddit/user profile pages exposes additional actions (subscribe, share, sidebar, etc.). [navigation_basics.md]
201. `hydra://` URL scheme for deep linking (e.g. `hydra://settings`, `hydra://settings/general/gestures`, `hydra://accounts`); ordinary Reddit URLs also resolve automatically within Hydra. [navigation_basics.md]
202. "Swipe Anywhere to Navigate" setting: swipe right from anywhere on screen to go back; when enabled, all right-swipe post/comment actions are disabled (only left-swipe actions remain active). [gestures.md, navigation_basics.md, tips_and_tricks.md]
203. Pull down to refresh feeds; swipe down to dismiss modals. [navigation_basics.md]
204. Split View (iPad only): feed stays visible on the left while the tapped post opens on the right panel; each panel scrolls independently. [split_view.md, navigation_basics.md]
205. Split View is enabled by default on supported devices; toggle in Appearance settings; setting only appears on iPad-class screens. [split_view.md]
206. Split View right panel has "Close" (returns to feed-only) and "Fullscreen" (opens the post full-screen) buttons. [split_view.md]
207. All standard post interactions (vote/comment/save/share) work normally within Split View. [split_view.md]
208. Full multi-pane iPad support (beyond the current 2-pane Split View) is explicitly listed as "Unlikely" to be implemented. [todo.txt]

### N. Gestures / Swipe Actions (configuration)

209. Four configurable swipe directions per item type: short right, long right, short left, long left. [gestures.md]
210. Post swipe actions available: Upvote, Downvote, Mark as Read, Bookmark, Share. Default: Short Right = Upvote, Long Right = Downvote, Short Left = Mark as Read, Long Left = Bookmark. [gestures.md]
211. Comment swipe actions available: Upvote, Downvote, Reply, Bookmark, Share, Collapse, Collapse Thread. Default: Short Right = Upvote, Long Right = Downvote, Short Left = Reply, Long Left = Bookmark. [gestures.md]
212. Swiping shows a colored background and action icon during the gesture indicating which action will fire, differentiated by short vs. long swipe distance. [gestures.md]
213. A light haptic fires when a swipe threshold is engaged. [docs/specs/03-interaction-overhaul.md]
214. Post/comment swipe tracking must remain smooth (60fps) even while the feed/JS thread is busy loading (performance requirement, not purely visual). [docs/specs/03-interaction-overhaul.md]

### O. Sorting

215. Post sorts: Best (personalized algorithm), Hot (time-weighted trending), New (chronological), Top (with time period: Hour/Day/Week/Month/Year/All Time), Rising (vote velocity). [sorting.md]
216. Multireddit sorts differ slightly: Hot, New, Top, Rising, Controversial (no Best). [sorting.md]
217. Comment sorts: Best, New, Top, Controversial, Old, Q&A. [sorting.md]
218. Tapping the sort icon top-right changes sort; selecting "Top" prompts for a time period; changes apply immediately. [sorting.md]
219. Default post/comment sort configurable in Sorting settings, including a default Top time period. [sorting.md]
220. "Apply sort to home" applies the configured default sort to the home feed specifically. [sorting.md]
221. "Remember subreddit sort" (separately for posts and comments) saves each subreddit's last-used sort; "Clear custom sorts" resets all remembered per-subreddit sorts. [sorting.md]

### P. Filters (text/AI/subreddit/seen)

222. Text filters hide posts/comments containing configured keywords/phrases; matching is case-insensitive and whole-word (e.g. "cat" does not match "caterpillar"); multi-word phrases match exactly as entered. [text_filters.md]
223. Text filter list is entered as comma- or newline-separated keywords in Filters settings; changes autosave. [text_filters.md]
224. For posts, text filters check: title, body text, author username, poll options, link titles, link descriptions. For comments: comment text and author username. [text_filters.md]
225. Text filters apply to home feed, subreddit pages, multireddits, and Gallery Mode; they do NOT apply to search results or user profiles. [text_filters.md, hiding_content.md]
226. Text filters use only literal matching — no partial-word, context/sentiment understanding, or AND/OR logic. [text_filters.md]
227. Heavy filtering (text or AI) can slow feed loading since more posts must be fetched/evaluated to fill the feed. [text_filters.md, ai_filters.md, hiding_content.md, troubleshooting.md]
228. AI Filters (Hydra Pro): natural-language filter description sent with each post's title/subreddit/text to an AI service that decides whether to hide it. [ai_filters.md]
229. AI Filters analyze text only — cannot scan images/video content. [ai_filters.md]
230. AI Filters apply to main feeds and subreddits only — NOT to search results, user profiles, or Gallery Mode. [ai_filters.md, gallery_mode.md]
231. AI Filter presets (tap to apply, replaces current filter text): "No Politics", "No Negativity", "No Graphic Content", "No Gambling Triggers", "No Drugs and Alcohol", "No Fluff" — each with a specific documented scope of content it targets (see ai_filters.md for full per-preset descriptions). [ai_filters.md]
232. Selecting a preset replaces whatever text is currently in the filter box (not additive); presets can be further hand-edited. [ai_filters.md]
233. AI filters require an active internet connection and an active Pro subscription to function. [ai_filters.md]

### Q. Themes / Appearance

234. 12 built-in themes total: 7 free (Dark, Light, Midnight, Discord, Spotify, Strawberry, Spiderman) and 5 Pro-only (Gilded, Mulberry, Deep Ocean, Aurora, Royal). [themes.md]
235. Free users can preview a Pro theme for 5 minutes before it reverts to the default theme. [themes.md]
236. Tapping a theme in Theme settings applies it immediately; persists across sessions. [themes.md]
237. "Different Dark Mode Theme" setting lets the user assign separate themes for light vs. dark system appearance, auto-switching with the device's appearance setting; when enabled, separate "Light"/"Dark" configuration buttons appear atop the theme list. [themes.md]
238. Community Themes: browsing at r/HydraThemes; when a post/comment containing an embedded theme is viewed, Hydra auto-detects it and shows a preview card; tapping imports it. [themes.md, custom_themes.md]
239. Theme Maker (Custom Themes, Pro feature with a 5-minute free trial): full custom theme creation with a starting point of the current theme's colors. [custom_themes.md, themes.md]
240. Theme name is required and must be unique to save; can be changed anytime while editing. [custom_themes.md]
241. Theme "UI Mode" (Light/Dark) controls system elements: color picker, scroll bars, splash screen. [custom_themes.md]
242. Theme "Status Bar" setting (Light/Dark) controls iOS status bar text/icon color scheme. [custom_themes.md]
243. Theme Maker color groups: Text Hierarchy (Text, Subtle Text, Very Subtle Text), Core Colors (Background, Tint, Divider), Interactive Elements (Button Background, Button Text, Icon/Text Button), Icons (Primary Icon, Secondary Icon), Actions (Upvote, Downvote, Delete, Show/Hide, Reply, Share, Collapse, Bookmark, Moderator) — 19 customizable color properties total, per themes.md. [custom_themes.md, themes.md]
244. Unset colors in the Theme Maker show "(default)" and inherit the base theme's value. [custom_themes.md]
245. Comment depth colors are fixed (not theme-customizable) and shared across all themes. [custom_themes.md]
246. Theme Maker changes apply live app-wide in real time except within the Theme Maker screen itself (kept static for usability); preview by navigating to other tabs; unsaved changes persist only until leaving the Theme Maker. [custom_themes.md]
247. "Save Theme" requires a non-empty name; saving over an existing name prompts to confirm overwrite; saved themes appear immediately in the theme list's Custom Themes section. [custom_themes.md]
248. Editing an existing custom theme: long-press it in the theme list → "Edit". [custom_themes.md]
249. Deleting a custom theme: swipe left on it, or long-press → "Delete"; if the deleted theme was active, the app reverts to the default theme. [custom_themes.md]
250. Sharing a theme: in a comment/reply/message editor, tap the paintbrush icon → pick a custom theme → "Attach" — embeds theme data as text, postable to Reddit (e.g. r/HydraThemes). [custom_themes.md]
251. Importing a theme from a post/comment: tap the auto-detected preview card → "Import" (save only) or "Import & Apply" (save + apply immediately). [custom_themes.md]
252. Appearance — Post: "Make Posts Compact" (denser layout). [appearance_settings.md]
253. Appearance — Post: "Enable Split View" (iPad only). [appearance_settings.md]
254. Appearance — Post: "Show Subreddit at Top". [appearance_settings.md]
255. Appearance — Post: "Show Subreddit Icons" (uses additional data). [appearance_settings.md]
256. Appearance — Post: "Post Title Max Lines" (1–10). [appearance_settings.md]
257. Appearance — Post: "Post Text Max Lines" (0–10; 0 = hide text previews entirely). [appearance_settings.md]
258. Appearance — Post: "Link Description Max Lines" (0–30; applies to external link posts). [appearance_settings.md]
259. Appearance — Post: "Show Post Flairs". [appearance_settings.md]
260. Appearance — Post: "Blur Spoilers" (tap to reveal). [appearance_settings.md]
261. Appearance — Post: "Blur NSFW" (tap to reveal). [appearance_settings.md]
262. Appearance — Post: "Show Post Summary" (AI, Pro). [appearance_settings.md, ai_summaries.md]
263. Appearance — Post: "Auto Play Videos" (uses more data/battery). [appearance_settings.md]
264. Appearance — Post: "Live Text" toggle. [appearance_settings.md, live_text.md]
265. Appearance — Post: "Tap to Collapse" (post content area), enabled by default. [appearance_settings.md]
266. Appearance — Post: "Right Side Thumbnails in Compact Mode" — moves the post thumbnail preview to the right side when compact mode is on; only shown when compact mode is enabled. [UpdateInfo.tsx v4.0.0]
267. Appearance — Comment: "Right Side Vote Indicators". [appearance_settings.md]
268. Appearance — Comment: "Collapse AutoModerator" (default on, still manually expandable). [appearance_settings.md]
269. Appearance — Comment: "Show Comment Flairs". [appearance_settings.md]
270. Appearance — Comment: "Show Comment Summary" (AI, Pro). [appearance_settings.md, ai_summaries.md]
271. Appearance — Comment: "Tap to Collapse" (default on; existing open pages may need a refresh to pick up a change). [appearance_settings.md]
272. Appearance — Comment: "Collapse Children Only" — tapping a comment collapses its children instead of the comment itself. [UpdateInfo.tsx v4.0.0]
273. Appearance — Tab: "Show Username" in the bottom tab bar. [appearance_settings.md]
274. Appearance — Tab: "Hide on Infinite Scroll" (auto-hides the tab bar while scrolling). [appearance_settings.md]
275. Settings search bar at the top of the Settings tab lets the user "ask a question or search for a specific setting." [settings_overview.md]

### R. AI Summaries (Pro)

276. Post Summaries: AI-generated overview shown below post content in a bordered "Summary" box; only generated for long-enough text posts. [ai_summaries.md]
277. Comment Summaries: AI-generated overview of top comments, labeled "Comments Summary", shown between post content and comment section; only generated when there's enough comment text; tap to collapse/expand. [ai_summaries.md]
278. Summaries are generated fresh server-side each time the post is opened and are never cached. [ai_summaries.md]
279. When both summaries are enabled, the post summary generates first and is fed as context into the comment summary for a more relevant result. [ai_summaries.md]
280. Both summary toggles are on by default for Pro subscribers, configurable independently in Appearance settings. [ai_summaries.md]

### S. Hydra Pro (subscription/features overview)

281. Hydra Pro is a monthly subscription; price shown on the Hydra Pro settings page and may vary by region. [hydra_pro.md]
282. Subscribing: Hydra Pro settings → "Upgrade Now"; features unlock immediately on purchase. [hydra_pro.md]
283. Managing/cancelling: done via Settings → Apple ID → Subscriptions on-device (not in-app); Pro remains active through the end of the current billing period after cancellation. [hydra_pro.md]
284. A grace period (with an end time shown on the Hydra Pro page) keeps Pro features active temporarily after a failed payment or cancellation; renewal possible during this window. [hydra_pro.md]
285. Pro feature set: Inbox Alerts, Gallery Mode unlimited scrolling, Stats Tracking (full/unobfuscated), Advanced (AI) Post Filtering, Post & Comment AI Summaries, Pro Themes & Theme Maker (save/keep custom themes). [hydra_pro.md]
286. Self-hosting a custom Hydra server also grants access to Pro features (alternate unlock path outside App Store subscription). [advanced_settings.md]
287. A "Customer ID" unique identifier is shown at the bottom of Advanced Settings if assigned; tap to copy to clipboard; used for support requests, should not be shared publicly. [advanced_settings.md]

### T. Stats (Pro)

288. Stats page (Pro): usage analytics — free users see the page but all numbers are obfuscated (replaced with asterisks), with a prompt to subscribe. [stats.md]
289. "Your Hydra Journey" summary at the top shows how long the user has used Hydra. [stats.md]
290. Activity cards: Posts Explored (total posts viewed), Distance Scrolled (feet/meters or miles/km + a "banana comparison" fun fact), Upvotes Given (broken down posts/comments), Downvotes Given (broken down posts/comments), Content Created (posts + comments total, broken down). [stats.md]
291. Usage-pattern metrics: App Launches, Opens per Day (average), Total Opens (times foregrounded), Upvote Ratio (only shown once the user has voted). [stats.md]
292. Favorite Communities: top 10 most-visited subreddits ranked by visit count, each with a relative progress bar vs. the most-visited one. [stats.md]
293. Achievements (appear once unlocked, no progress bar): Dedicated User (50+ launches), Scroll Master (5+ km scrolled), Positive Vibes (80%+ upvote ratio, ≥10 total votes), Content Creator (10+ posts), Commentary Master (10+ comments), Explorer (10+ unique communities visited), Knowledge Seeker (100+ posts viewed). [stats.md]
294. Fun Facts: dynamically generated, e.g. marathons-equivalent scrolled, % of the way to the moon scrolled, posts-read-per-post-created ratio, upvote:downvote ratio — only shown when relevant/calculable. [stats.md]
295. Milestone-number Easter eggs: special playful messages when a stat hits numbers like 69, 420, 1337, etc. [stats.md]
296. All stats are stored locally on-device only, never uploaded to a server; tracking began no earlier than August 2025 and only from the user's install date (pre-install history is not reflected). [stats.md, privacy_settings.md]
297. Vote statistics (Pro) shown on the Stats page: total upvotes/downvotes given, broken down by posts/comments, and upvote ratio. [voting.md]

### U. Privacy / Data / Settings — General

298. Error Reporting toggle ("Allow Hydra to report errors"), enabled by default; sends a stack trace, Reddit username (if logged in), and device details (model, RAM) on crash/loading errors; requires app restart to take effect. [privacy_settings.md, settings_overview.md]
299. Outside error reports, Hydra sends no other user data to external servers; Reddit content/browsing history/search queries/personal info are never collected. [privacy_settings.md]
300. Reddit credentials are stored securely on-device, used only to authenticate directly with Reddit. [privacy_settings.md, accounts_and_login.md]
301. Privacy Policy and EULA links available in Settings → General → Legal, opening in-browser. [privacy_settings.md, general_settings.md]
302. Data Use settings: independent "Use Low Data on Wi-Fi" and "Use Low Data on Cellular" toggles; Hydra auto-detects current connection type and applies the matching setting. [data_use_settings.md]
303. Advanced Settings: "Clear Image Cache" button showing current cache size in MB. [advanced_settings.md]
304. Advanced Settings: Self-Hosted Hydra Server — "Use Custom Server" toggle + URL field; validated against the server's status endpoint with states "Checking...", failure message, or success message requiring an app restart; URL is only saved on validated success. [advanced_settings.md]
305. Settings — Startup: "Start Hydra on This Tab" (Posts default / Inbox / Account / Search / Settings). [general_settings.md]
306. Settings — Startup: "Startup URL" opens directly to a specific Reddit page on launch, overriding the initial-tab setting; invalid URLs show an error and are ignored. [general_settings.md]
307. Settings categories overview page lists: General, Guide, Theme, Appearance, App Icon, Account, Data Use, Stats, Privacy, Advanced, Hydra Pro, Patch Notes, Request A Feature. [settings_overview.md]
308. "Patch Notes" settings entry shows what's new in the latest update (same content as the startup UpdateInfo modal). [settings_overview.md]
309. "Request A Feature" links out to submit feature requests to the Hydra community on Reddit (r/HydraFeatureRequest). [settings_overview.md, UpdateInfo.tsx]
310. All settings save automatically as changed and persist across sessions. [settings_overview.md]
311. Some settings are visible-but-disabled until a Pro subscription is active (AI Filters, Stats, AI Summaries, Custom Theme saving, Inbox Alerts), rather than hidden. [troubleshooting.md]
312. Device-specific settings appear/disappear automatically based on hardware support: Split View (iPad only), App Icon (only on devices/OS that support alternate icons). [troubleshooting.md, app_icons.md]

### V. App Icons

313. Alternate app icon selection is only offered if the device/OS supports it (auto-detected). [app_icons.md]
314. Changing icon: App Icon settings → tap an icon → view detail page (creator info) → "Set as App Icon"; takes effect immediately on the home screen; a checkmark badge marks the currently active icon. [app_icons.md]
315. Each icon's detail page shows the creator's profile/avatar, bio, and links to their Reddit, website, and/or Instagram where available. [app_icons.md]
316. Available icons (from code, corroborating the doc): default "Hydra" icon (creator dmilin — GitHub link, bio); "Cerberus" (creator batjake — website + Instagram + bio); "Hail Hydra!" and "Hail Hydra! (Dark)" (creator boxsitter — bio only, no external links). [pages/SettingsPage/General/AppIcon/AppIcon.tsx]

### W. Guide (in-app documentation)

317. The Guide is Hydra's built-in documentation system, browsable by category or searchable for answers. [settings_overview.md]
318. Guide deep-links use the `hydra://settings/guide/?doc=<name>` pattern to open a specific article (used pervasively as cross-references throughout all documentation files). [all documentation/*.md]
319. A dedicated "Page Not Found" document is shown for unresolved/invalid Guide doc references. [not_found.md]
320. Guide covers (non-exhaustive list confirmed by file inventory): Getting Started, Accounts & Login, Navigation Basics, Browsing Posts, Viewing Comments, Commenting, Posting, Voting, Saving, Sharing, Downloading Media, Search, Subreddits, Organizing Feeds, Sorting, Gestures, Hiding Content, Text Filters, AI Filters, Gallery Mode, Live Text, Split View, App Icons, Themes, Custom Themes, Appearance Settings, General Settings, Data Use Settings, Privacy Settings, Advanced Settings, Hydra Pro, AI Summaries, Stats, Inbox, Inbox Alerts, Messages, External Links, Tips and Tricks, Troubleshooting (38 topics). [documentation/*.md file list]

### X. Misc / Cross-cutting

321. Drafts auto-save across all composers — posts, comments, and messages — with automatic restoration if the editor is closed/navigated away from; no manual save action needed. [tips_and_tricks.md, posting.md, commenting.md, messages.md]
322. "Keeping your feed fresh" recommended combo: "Mark as Seen On Scroll" + "Hide Seen Posts" together, optionally layered with text/AI filters and subreddit filters. [tips_and_tricks.md]
323. Music (background audio, e.g. a podcast) no longer randomly pausing while scrolling the feed is a documented (partially-confirmed) bugfix. [UpdateInfo.tsx v4.0.0]
324. Shadowbanned users being unable to log in was fixed — correct behavior: shadowbanned accounts can still log in. [UpdateInfo.tsx v4.0.0]
325. Markdown text URLs containing backslashes not marked as links previously parsed incorrectly — fixed; correct behavior: such URLs render as links. [UpdateInfo.tsx v4.0.0]
326. Hydra warns the user when attempting to reply in a locked or archived post (rather than silently failing or submitting). [UpdateInfo.tsx v4.0.0]
327. Android builds successfully as of v4.0.0 per the changelog, with "an official app is coming soon" — confirms Android is a build target but not yet officially released (out of scope for this iOS rewrite, noted for context). [UpdateInfo.tsx v4.0.0, todo.txt]

---

## 2. Changelog-Derived Features (`components/Modals/StartupModals/UpdateInfo.tsx`)

The file currently contains a single changelog entry, `updateKey: "v4.0.0"`. The modal displays three sections: **Pro Features** (empty for this version), **Features**, and **Bugfixes**. Per-version breakdown:

### v4.0.0 — "Update" ("Here's what's new in this update")

**Pro Features:** (none listed for this version)

**Features:**
1. **Media Viewer Rewrite** — Rebuilt from scratch for new features and better performance; described as a significant step toward Android release; many other listed features result from this rewrite.
2. **Hydra in Share Sheet** — Hydra appears as a share-sheet destination when sharing a URL from another app.
3. **Right Side Thumbnails in Compact Mode** — Moves post thumbnail previews from left to right in compact mode; toggle in Settings → Appearance → Post Appearance Settings → "Show Thumbnails on Right"; only visible when compact mode is enabled.
4. **Collapse Child Comments Only** — Tapping a comment collapses its children instead of the comment itself; toggle: Settings → Appearance → Comment Appearance Settings → "Collapse Children Only".
5. **Filter Subreddits Temporarily** — On mixed feeds (Home, Popular, etc.), long-press a post → "Filter Subreddit" now offers a day/week/forever duration option.
6. **Support for New Wikis** — Previously only old.reddit.com wikis were supported; new-format wikis now supported and used by default.
7. **Swipe to Scrub Videos** — Horizontal swipe on a fullscreen video scrubs through it.
8. **Change Video Playback Rate** — Tap the playback-rate button (top-left) in fullscreen video to change speed.
9. **Landscape Mode** — Rotating the device in the media viewer or in-app browser shows landscape content.
10. **Media Collection Navigation Arrows** — Arrows appear for easier swiping when viewing a collection of images/videos.
11. **Post Info in Media Viewer** — Tapping content in the media viewer overlays post info (title/subreddit/author), each tappable to navigate.
12. **Swipe to Dismiss Media** — Media viewer can be dismissed by swiping up OR down (previously only one direction).
13. **Media Viewer Optimizations** — Smarter image-resolution selection, improved caching, background videos pause while a different video plays in foreground → faster loads, reduced memory use.

**Bugfixes:**
1. Music no longer randomly pauses while scrolling (not consistently reproducible; still monitored).
2. Posts with a collection of videos previously only displayed the first video — fixed.
3. Scrubbing while in Gallery Mode now locks vertical scrolling for a smoother experience.
4. Slow-to-respond link-metadata requests are now skipped, speeding up worst-case loads.
5. Android builds successfully; an official app is "coming soon."
6. Fixed image posts momentarily showing the wrong image.
7. Some link sources (e.g. Wikipedia) previously failed to show a preview image — fixed.
8. Fixed shadowbanned users being unable to log in.
9. Text URLs containing backslashes not marked as links in markdown were parsed incorrectly — fixed.
10. Posts linking to other Reddit pages (e.g. `/r/wowthissubexists`) weren't rendering as links — fixed.
11. Having a multireddit named "All" caused the built-in "All" button to disappear from the subreddit list — fixed.
12. Hydra now warns the user when attempting to reply in a locked or archived post.

**Static help footer content shown in the modal (not a feature, but user-visible copy):**
- "If you have any feature requests, you can submit them on /r/HydraFeatureRequest which can be found in the settings tab" (with the subreddit icon image).
- "If you have any familiarity with React Native and want to help, you can make a pull request at https://github.com/dmilin1/hydra" (with a GitHub icon).

Note: Only this one version entry exists in the current source; there is no accessible multi-version changelog array in this file as shipped (older versions are not retained in this array — it is overwritten per release). No git-history archaeology of prior `UpdateInfo.tsx` versions was performed as part of this survey (out of scope per task instructions, which specify reading the file as-is).

---

## 3. Dependencies → Native iOS Equivalent

| Package | User-facing capability it provides | Native iOS / SwiftUI equivalent |
|---|---|---|
| `expo` / `expo-router` | App framework, file-based navigation/routing | `NavigationStack` / `NavigationSplitView`, SwiftUI app lifecycle |
| `expo-media-library` | Save photos/videos to the device Photos library (with permission string) | `PHPhotoLibrary` |
| `@sentry/react-native` | Crash/error reporting (Privacy → "Allow Hydra to report errors") | Sentry Cocoa SDK, or Apple's `MetricKit`/`os_log` + Sentry |
| `expo-image-picker` | Select a photo from the library for image posts | `PHPickerViewController` |
| `expo-notifications` | Push notifications (Inbox Alerts, Pro) | `UserNotifications` framework + APNs |
| `expo-alternate-app-icons` | Alternate app icon switching (App Icon settings) | `UIApplication.setAlternateIconName(_:)` |
| `expo-sharing` | Native share sheet (Sharing feature) | `UIActivityViewController` |
| `expo-screen-orientation` | Landscape support in media viewer/browser | `UIViewController.supportedInterfaceOrientations` / `UIDevice.setValue(orientation)` |
| `expo-font` | Custom font loading (SpaceMono) | Font bundled via Info.plist `UIAppFonts` / SwiftUI `.font(.custom)` |
| `expo-image` | Optimized image loading/caching/downscaling, GIF playback | `AsyncImage`/`SDWebImageSwiftUI`/`Nuke`-style loader; `UIImageView` w/ animated GIF support |
| `expo-secure-store` | Encrypted on-device storage of session/account data | Keychain Services (`kSecClassGenericPassword`) |
| `expo-sqlite` | Local SQLite DB (stats tracking, drafts, filters, etc. per drizzle-orm usage) | `SQLite.swift` / `GRDB.swift` / Core Data |
| `expo-video` | Video playback (feed autoplay, fullscreen viewer, PiP) | `AVPlayer` + `AVPlayerLayer`/`VideoPlayer` (SwiftUI), `AVPictureInPictureController` |
| `expo-web-browser` | In-app browser for external links / reader mode | `SFSafariViewController` (reader mode is a system feature) or `WKWebView` for full custom control (needed for "Hydra" built-in browser option) |
| `expo-blur` | Blur effects (e.g. NSFW/spoiler blur, context menu preview blur) | `UIVisualEffectView` / SwiftUI `.blur()` / `Material` |
| `expo-clipboard` | Clipboard read for Reddit-link detection | `UIPasteboard` |
| `expo-constants` | App/build metadata | `Bundle.main.infoDictionary` |
| `expo-application` | App version/bundle info | `Bundle.main` |
| `expo-device` | Device model info (for error reports) | `UIDevice.current` |
| `expo-haptics` | Haptic feedback on swipe thresholds, votes, etc. | `UIImpactFeedbackGenerator` / `UISelectionFeedbackGenerator` |
| `expo-linking` | Deep link handling (`hydra://` scheme, Reddit URL interception) | `UIApplication` URL scheme handling / Universal Links, `onOpenURL` |
| `expo-network` | Network/connection-type detection (Wi-Fi vs. Cellular for Low Data Mode) | `Network` framework (`NWPathMonitor`) |
| `expo-splash-screen` | Launch splash screen | Native `LaunchScreen.storyboard`/SwiftUI splash |
| `expo-status-bar` | Status bar light/dark styling per theme | `UIStatusBarStyle` / `.preferredColorScheme` / `.statusBarHidden` |
| `expo-system-ui` | System UI background color sync | `UIWindow.backgroundColor` |
| `expo-updates` | Over-the-air JS bundle updates (EAS Update) | N/A in native Swift — App Store review cycle replaces OTA updates |
| `expo-dev-client` | Custom dev client for local development | N/A (Xcode build/run replaces this) |
| `@react-native-community/netinfo` | Network state (overlaps with expo-network) | `Network` framework |
| `@react-native-menu/menu` / `react-native-ios-context-menu` / `zeego` | Native iOS long-press context menus (post/comment quick actions) | `UIContextMenuInteraction` / SwiftUI `.contextMenu()` |
| `react-native-ios-utilities` | Support library for the above context-menu packages | N/A (native equivalent has no analog dependency) |
| `@expo/react-native-action-sheet` | Action-sheet fallback menu (legacy menu style, still used for some flows/Android) | `UIAlertController(style: .actionSheet)` / SwiftUI `.confirmationDialog()` |
| `@react-navigation/bottom-tabs` | Bottom tab bar (Posts/Inbox/Account/Search/Settings) | SwiftUI `TabView` |
| `@react-navigation/native` + `native-stack` | Screen stack navigation, back gestures | `NavigationStack`, `NavigationPath`, interactive pop gesture |
| `react-native-gesture-handler` | Swipe gestures (posts/comments), pan gestures | SwiftUI `DragGesture`, `UIPanGestureRecognizer` |
| `react-native-reanimated` + `react-native-worklets` | UI-thread-driven animations for swipe/gesture feedback | Core Animation / SwiftUI `withAnimation`, `.animation()`, `matchedGeometryEffect` |
| `react-native-screens` | Native screen container optimization (patched — see §6) | Native `UIViewController`-backed navigation (implicit in UIKit/SwiftUI) |
| `react-native-safe-area-context` | Safe-area insets | SwiftUI `.safeAreaInset()` / `GeometryReader` |
| `react-native-webview` | Embedded web content (in-app browser, some rendering) | `WKWebView` |
| `@shopify/flash-list` | High-performance virtualized post/comment lists | SwiftUI `List`/`LazyVStack` inside `ScrollView`, or `UICollectionView` w/ compositional layout for large threads |
| `react-native-mmkv` | Fast local key-value storage (settings, feed-audio toggle, per-subreddit sort memory, filter lists, etc.) | `UserDefaults` (small values) or a lightweight on-disk KV store (e.g. GRDB/plist) for larger volumes |
| `drizzle-orm` + `expo-drizzle-studio-plugin` | ORM layer over SQLite (stats, drafts, DB migrations) | `GRDB.swift` / `SQLite.swift` with hand-written migrations, or Core Data |
| `@preeternal/react-native-cookie-manager` | Cookie-based Reddit login/session management (keyless "modhash" auth model) | `HTTPCookieStorage` / `WKWebView` cookie store, `WKHTTPCookieStore` |
| `html-entities` / `htmlparser2` | Parsing/decoding Reddit's HTML-ish comment/post markup and entities | `NSAttributedString(data:options:[.documentType: .html])`, or a custom Markdown/HTML renderer (e.g. swift-markdown, or hand-rolled) |
| `react-native-url-polyfill` | URL parsing polyfill (RN JS engine lacks native URL) | N/A — native `URL`/`URLComponents` already available in Swift |
| `react-native-nitro-modules` | Native-module bridging infra used by some of the above libs | N/A — direct native code, no bridge needed |
| `react-native-web` / `webpack` | Web build target (not used for the iOS app itself) | N/A |
| `@expo/vector-icons` | Icon fonts (FontAwesome, FontAwesome6, MaterialIcons, etc. used throughout UI) | SF Symbols, or bundled custom icon font/SVG assets |

---

## 4. Assets Inventory

### App Icons / Branding
- `assets/images/icon.png` — primary/default app icon (also used in README header and as the app's `expo.icon`). Also `icon.pxz` (a Pixelmator source file, not shipped).
- `assets/images/adaptive-icon.png` — Android adaptive-icon foreground (background color `#FFFFFF`/`#000000` depending on context; not directly relevant to the iOS rewrite).
- `assets/images/favicon.png` — web build favicon (not relevant to native iOS).
- **Alternate app icons** (`expo-alternate-app-icons` plugin, see §6):
  - `assets/images/custom_icons/cerberus.png` — "Cerberus" icon, created by u/batjake.
  - `assets/images/custom_icons/hail_hydra.png` — "Hail Hydra!" icon, created by u/boxsitter.
  - `assets/images/custom_icons/hail_hydra_dark.png` — "Hail Hydra! (Dark)" icon, created by u/boxsitter.
  - Author avatar images: `assets/images/custom_icons/authors/dmilin.jpg`, `assets/images/custom_icons/authors/batjake.png`, `assets/images/custom_icons/authors/boxsitter.png` (shown on each icon's detail page per `app_icons.md`).

### Splash Screen
- `assets/images/splash.png` — splash image, `resizeMode: contain`, `backgroundColor: #000000` (see `app.config.ts`).
- `assets/images/splashInverted.png` — presumably a light/dark-mode-inverted variant of the splash (not referenced in `app.config.ts`'s single splash config; likely used at runtime for theme-aware splash via `expo-splash-screen` API).
- `assets/images/splash.pxz` — Pixelmator source file (not shipped in-app).

### Other UI Images
- `assets/images/subredditIcon.png` — generic/default subreddit icon placeholder, used e.g. in the UpdateInfo modal's "feature request" row.
- `assets/images/HydraPro.png` — promotional/branding image for the Hydra Pro upsell screen.

### Fonts
- `assets/fonts/SpaceMono-Regular.ttf` — the only custom font bundled (loaded via `expo-font`); likely used for monospace contexts (e.g. code blocks in Markdown rendering) rather than app-wide UI type.

### Marketing / Store Screenshots (not shipped in the app; App Store asset generation only)
- `assets/screenshots/13_0/13_0/…`, `assets/screenshots/6_5/…`, `assets/screenshots/6_9/…` — per-device-size (iPhone 13"/6.5"/6.9" class) marketing screenshots: `beautiful_fullscreen.png`, `blazing_fast.png`, `efficient_compact.png`, `intuitive_comments.png`, plus theme screenshots (`themes/discord.png`, `themes/light.png`, `themes/midnight.png`, `themes/spotify.png`).
- `assets/screenshots/complete/Apple iPad Pro 12.9 Inch (2048x2732)/…Screenshot 1–6.png` and `assets/screenshots/complete/Apple iPhone 14 Plus (1284x2778)/…Screenshot 1–6.png` and `assets/screenshots/complete/Apple iPhone 16 Pro Max (1320x2868)/…Screenshot 1–6.png` — final App Store listing screenshots per device class.
- `assets/screenshots/screenshots_app_mockup_dot_com.mockup` — source mockup project file for generating the above.

These marketing/screenshot assets confirm the App Store-presented feature highlights: "beautiful fullscreen" (media viewer), "blazing fast", "efficient compact" (mode), "intuitive comments", and per-theme screenshots for Discord/Light/Midnight/Spotify themes.

---

## 5. Explicitly Not Implemented / Known Bugs (`todo.txt`)

`todo.txt` is explicitly the unimplemented/backlog list (🚀 = feature request, 🐛 = bug, ⭐ = starred/highlighted). These are NOT part of the acceptance checklist for "what exists today" — listed here separately per task instructions, but the rewrite should be aware these are known gaps in the reference app (the rewrite does not need to fix or add them unless separately asked).

### Unlikely to be implemented
- Full multiple-pane iPad support (beyond current 2-pane Split View). 🚀

### Hard / large
- Android support (official release). 🚀
- Get polls working (poll posts are listed as a supported type in docs but flagged here as not fully functional). 🚀
- Accessibility support. 🚀
- Endpoint caching / future navigation-stack state caching. 🚀
- Fancy bookmarks with folders and categories (Reddit API supports this; Hydra doesn't use it). 🚀
- ⭐ Save posts/comments as an image (community-requested, linked to a Reddit thread). 🚀
- Auto-translation of posts/comments to another language. 🚀
- 🐛 Upvoting in post-details view is not reflected on the posts list (confirmed still-open per `docs/specs/04-comment-virtualization.md`, explicitly "out of scope to fix, in scope to not regress").
- Search saved items (no Reddit API for this; would require building a local index). 🚀
- Show author account age in the comments section. 🚀
- 🐛 Lists nested inside lists render improperly in Markdown.

### Medium
- Load favicons for sites that don't support the Open Graph Protocol. 🚀
- 🐛 Enable landscape mode in the in-app browser (landscape support elsewhere exists per the v4.0.0 changelog, but the browser specifically is flagged as incomplete/buggy here — a documentation/reality discrepancy worth flagging).
- Add a sort option to the Search tab. 🚀
- Add chat back (a previously-removed feature — Reddit chat). 🚀
- Add favorited-subreddit reordering. 🚀
- 🐛 Google sign-in is missing from the login screen (root cause unknown).

### Easy
- Enable Gallery Mode for Saved posts. 🚀
- 🐛 Editing a comment on the user page, then clicking its link, causes a crash.
- 🐛 Cannot favorite subreddits the user isn't subscribed to (docs confirm "must be subscribed to favorite" — this bug entry may just be tracking a UX complaint about that restriction).
- 🐛 Giant/oversized emoji rendering in comments.
- 🐛 The "x" close button on certain modals doesn't respond to Apple Pencil input.

### Additional documentation-noted caveats/limitations (not from todo.txt, but functionally "not implemented" or intentionally limited)
- Multireddits cannot be created within Hydra — must be created on reddit.com or another client. [subreddits.md, organizing_feeds.md]
- Hydra cannot create new Reddit accounts in-app. [accounts_and_login.md]
- Image posts support only a single image at creation time — multi-image post creation is not supported (though multi-image *viewing* is). [posting.md]
- Post title, link URL, and images cannot be edited after posting — a Reddit platform restriction, not a Hydra limitation, but still a hard constraint the rewrite must replicate. [posting.md]
- Saved items have no folders/tags/in-app search/sort — inherited Reddit API limitation. [saving.md]
- Search only finds posts, never individual comments (Reddit limitation); user search is capped at one page of results (Reddit limitation). [search.md, troubleshooting.md]
- Text filters cannot do partial-word matching, context/sentiment understanding, or AND/OR logic. [text_filters.md]
- AI filters cannot analyze images/video — text only. [ai_filters.md]
- AI/text filters and hide-seen-posts do not apply to search results or user profiles. [text_filters.md, hiding_content.md, ai_filters.md]
- AI filters do not apply within Gallery Mode. [gallery_mode.md]
- Gallery Mode is capped at 100 posts for non-Pro users. [gallery_mode.md]
- Live Text requires iOS 15+ and an A12 chip or newer; not available on Android. [live_text.md]
- Split View only appears on iPad-class screens. [split_view.md]
- App Icon settings only appear on devices/OS versions that support alternate icons. [app_icons.md]

---

## 6. iOS Capabilities & Entitlements Required

Derived from `app.config.ts` `plugins` array and the permission strings passed to those plugins.

### Config plugins used (each implies a native capability the SwiftUI rewrite must replicate)
- `expo-router` — app routing/navigation (no native entitlement).
- `expo-media-library`, configured with: `savePhotosPermission: "Allow $(PRODUCT_NAME) to save photos and videos to your library."` → **`NSPhotoLibraryAddUsageDescription`** (write-only Photos access, for saving images/videos).
- `@sentry/react-native/expo` — crash reporting SDK integration (no user-facing permission string; network access implied).
- `expo-image-picker`, configured with: `photosPermission: "$(PRODUCT_NAME) accesses your photos to upload images."` → **`NSPhotoLibraryUsageDescription`** (read access, for selecting an image to attach to an image post).
- `expo-notifications` — push notification registration → **`UNUserNotificationCenter`** authorization request; requires **Push Notifications** entitlement (`aps-environment`) for Inbox Alerts (Pro feature).
- `expo-alternate-app-icons`, configured with 3 named alternate icons (`cerberus`, `hail_hydra`, `hail_hydra_dark`) each with an iOS icon image path → **`CFBundleIcons` / `CFBundleAlternateIcons`** in Info.plist, driven via `UIApplication.setAlternateIconName(_:)`.
- `expo-sharing`, configured with: `ios.enabled: true`, `ios.activationRule.supportsWebUrlWithMaxCount: 1` → enables Hydra as a **Share Extension** target / share-sheet participant for URLs shared *into* the app from other apps (see "Hydra in Share Sheet" changelog feature) — implies a native **Share Extension** app-extension target in the SwiftUI rewrite, or `UIActivityViewController`/`NSExtensionActivationRule` configuration limited to exactly one URL.
- `expo-screen-orientation`, configured with `initialOrientation: "DEFAULT"` → **`UISupportedInterfaceOrientations`** allowing rotation (landscape support in media viewer/browser).
- `expo-font` — custom font registration (`UIAppFonts` in Info.plist for `SpaceMono-Regular.ttf`).
- `expo-image` — no distinct entitlement; relies on network access for remote image loading.
- `expo-secure-store` — uses the **iOS Keychain** for encrypted storage of account/session data (no special entitlement beyond standard Keychain access, though Keychain Sharing / access groups may be relevant if extensions are added).
- `expo-sqlite` — local file-based SQLite DB, no special entitlement.
- `expo-video` — video playback; **Picture-in-Picture** requires the **Background Modes → Audio, AirPlay, and Picture in Picture** capability (confirmed by documented PiP support in `tips_and_tricks.md`), and background audio playback (feed-audio toggle / interrupting other apps' audio) implies **Background Modes → Audio** and configuring the `AVAudioSession` category to `.playback`.
- `expo-web-browser` — in-app browser (`SFSafariViewController`-backed by default in Expo, but Hydra's custom "Hydra" browser option with reader mode implies a custom `WKWebView`-based browser instead/also) — no extra entitlement, but Reader Mode functionality (stripping ads/nav) implies either `WKWebView` content-reading logic or Safari Reader API usage.

### Other permission-adjacent behaviors confirmed in documentation (not directly plugin config, but native-capability-relevant)
- **Clipboard read access** — "Read Links from Clipboard" triggers iOS's per-access clipboard-read prompt unless the user sets **Settings → Hydra → Paste from Other Apps → Allow**. → Uses `UIPasteboard`; the "Paste from Other Apps" toggle is the standard iOS 16+ **Sensitive Clipboard Access** system setting, no special entitlement beyond using `UIPasteboard.general` and expecting the OS prompt.
- **iOS Shortcuts integration** — "Get Hydra Shortcut" installs an iOS Shortcuts-app shortcut that adds "Open in Hydra" to other apps' share sheets. → Implies either a custom URL scheme handler (`hydra://`) invoked by the Shortcut, and/or an **App Intents** / **Shortcuts** extension in the native rewrite for a first-class "Open in Hydra" share action (rather than requiring a separately-installed Shortcut).
- **Deep linking / custom URL scheme** — `scheme: "hydra"` in `app.config.ts` → registers the **`hydra://`** custom URL scheme (`CFBundleURLTypes`), used pervasively for in-app Guide navigation and settings deep links, and documented as also accepting ordinary `reddit.com` URLs.
- **Background/foreground network detection** — Low Data Mode's Wi-Fi vs. Cellular auto-detection implies use of the **Network** framework (`NWPathMonitor`) or `SCNetworkReachability`; no special entitlement required.
- **iOS Live Text** — requires iOS 15+/A12 chip; uses Apple's built-in `VNRecognizeTextRequest`/Live Text APIs on `UIImageView`, no separate entitlement, but does require the system Live Text feature to be enabled in iOS Settings (outside Hydra's control).

### Explicitly NOT used
- No `NSCameraUsageDescription` reference found — Hydra does not appear to use the camera directly (image posting is photo-library-only, via `expo-image-picker`).
- No location, microphone, contacts, Bluetooth, or HealthKit permission strings found in `app.config.ts`.
- `ITSAppUsesNonExemptEncryption: false` is set in `ios.infoPlist` — declares the app does not use non-exempt encryption, relevant for App Store export-compliance declarations (the SwiftUI rewrite should carry the same declaration unless its crypto usage changes).

---

## 7. Release / CI Summary

- **Versioning**: `package.json` `version` is the single source of truth; `app.config.ts` reads it directly (`packageJson.version`). Runtime version policy is `appVersion` (EAS Updates match app version).
- **Release script** (`scripts/release.js`, run via `npm run release -- --patch|--minor|--major [--dry-run]`): validates the working tree is clean and on `master` and in sync with `origin/master`; computes the next semver; checks the target tag/branch don't already exist; bumps `package.json`/`package-lock.json` via `npm version --no-git-tag-version`; creates a `release/vX.Y.Z` branch with a `chore: bump version to X.Y.Z` commit; tags it `vX.Y.Z`; pushes branch+tag atomically to `origin`; opens a GitHub PR (`release/vX.Y.Z` → `master`) via `gh pr create` for manual review/merge (no auto-merge). `--dry-run` stops before push/PR.
- **CI trigger**: CircleCI's `release` workflow runs only on `v*` git tags (any branch — tags are the trigger, branch filters are ignored), per `.circleci/config.yml`. Pushing the release branch itself does not trigger a build; only the tag push does.
- **iOS pipeline** (`ios_build_and_submit` job): installs `eas-cli`, verifies required secrets (`EXPO_OWNER`, `EAS_PROJECT_ID`, `IOS_BUNDLE_ID`, App Store Connect API key parts, Apple Team ID/type, `ASC_APP_ID`), writes the ASC API key from a base64 env var, injects submit credentials into `eas.json` at build time (kept out of git), then runs `eas build --platform ios --profile production --non-interactive --auto-submit --no-wait`, polling build then TestFlight-submission status (bounded windows: 40 min build wait, 50 min total before treating an in-progress submission as "still queued but OK"). Building/code-signing happens on Expo's EAS cloud (macOS), not on the CircleCI Linux box.
- **Android pipeline** (`android_build` job, parallel to iOS): builds an installable `.apk` (not `.aab`) via `eas build --platform android --profile production --json`, extracts the artifact download URL, and stores it as a CircleCI build artifact (`android-apk-download-link.txt`). No Play Store submission — sideloadable APK link only.
- **Bootstrap workflow**: one-time, manually triggered by pushing an `eas-bootstrap` branch; runs `eas init` to create/link the EAS project and prints its `projectId` for the operator to copy into the `EAS_PROJECT_ID` CircleCI env var.
- **Secrets** live in a CircleCI Organization context named `hydra-cci` (Expo token, Apple Store Connect API key parts, bundle/package identifiers, etc.); no secrets are committed to the repo.
- **`eas.json` build profiles**: `development`/`development-simulator` (internal, dev client), `preview` (internal, `staging` channel), `production` (channel `master`, `autoIncrement: true`, Android `buildType: apk`, and two RN-new-architecture-related env flags `RCT_USE_RN_DEP=0` / `RCT_USE_PREBUILT_RNCORE=0`).
- **Local dev** (`README.md`): `npm install`; macOS needs `cocoapods` + `watchman` via Homebrew; run with `SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:ios` (or `run:android`); hot reload via pressing `r` in the Expo terminal; troubleshooting tips include clearing Expo cache and re-running `pod install --repo-update`.
- **Patch**: `patches/react-native-screens+4.23.0.patch` (applied via `patch-package` on `postinstall`) works around an iOS 26+ regression where tapping an interactive custom title-bar view (e.g. a button in the nav bar) incorrectly triggers the system "tap status bar to scroll to top" gesture instead of the button's own tap; the patch backports an unreleased upstream fix (a guard gesture recognizer) and removes its iPad-only restriction since the bug also reproduces on iPhone under iOS 26+/27. This is a subtle iOS-version-specific navigation-bar interaction behavior the SwiftUI rewrite should be aware of if it ever reintroduces a similar bug natively (unlikely, since SwiftUI's own `NavigationStack` doesn't have this specific RN-bridging issue, but worth flagging as a "don't let a nav-bar button eat the scroll-to-top gesture" acceptance check).
