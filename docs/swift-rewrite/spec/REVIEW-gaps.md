# REVIEW-gaps.md — Read-only gap audit of `03` / `04a` / `04b` / `04c` / `06`

**Auditor:** gap-audit pass, 2026-09-17. **Read-only** — nothing outside this file was modified.
**Method:** each raw survey (`spec/01`–`spec/09`) read side by side with its derived implementation
spec, plus a line-by-line pass of `spec/08-feature-inventory.md` §1 (items 1–327) against
`06-build-plan-and-acceptance.md` §4.

**How to use this file.** Section A is additive (paste the proposed text into the named section).
Section B is corrective (two normative docs disagree; one of them must change). Section C is about
`06`'s checklist pointers. Section D is product-decision violations. Section E is a coverage estimate.

**Scope caveat.** `05-monetization.md`, `02-architecture.md`, `07-one-shot-prompt.md` and
`08-decisions-and-drift.md` were read as *context only* and are not audited here, except where `03`/`04*`/`06`
contradict them.

---

## A. Missing behaviors

Severity key: **blocker** = an implementer cannot build the screen/flow at all, or will ship something
observably wrong on a core path; **major** = a real user-visible behavior is absent and will simply not
be built; **minor** = detail, polish, or a parity nicety.

| # | Survey file § | Behavior (one line) | Target doc § | Sev | Proposed insertion text |
|---|---|---|---|---|---|
| A1 | `spec/01` §17 | The Error / unsupported-link screen has no spec anywhere: bug glyph, body copy, and the tappable raw URL that opens externally. `02` §5.5 declares `Route.unsupported(URL?)` but no document renders it. | `04c` new §11.3 | blocker | `### 11.3 Unsupported-link screen`<br>`Route.unsupported(url)`. Centered: a 48 pt bug glyph, then `Text("APPNAME was unable to load this page. It may be because this type of link is not yet supported.")`. When the route carries a URL, a second line invites opening it in a browser, with the raw URL rendered underlined and tappable, handing off to the external-link opener (§12). With no URL, only the glyph and the first line render. |
| A2 | `spec/01` §7.7 | `supportsSharingThemes()` — the composer's **Attach Theme** button is only offered on an allow-list of subreddits. `04a` §16.5.1 defers to "`04c` §Theme sharing", which never defines the rule. | `04c` §18.5 | major | Add to §18.5: **Where attaching is offered.** The composer's paintbrush button appears only when the target subreddit is one of `APPNAME`'s own theme-sharing communities (the original hard-codes three: its client, feature-request and themes subreddits, matched case-insensitively). Ship a single constant `themeSharingSubreddits: Set<String>`; when it is empty the button never appears. |
| A3 | `spec/08` §6 | `NSPhotoLibraryAddUsageDescription` (Save to Photos) is never declared. Phase 4/Phase 8 will ship a save action that crashes on first use. | `06` §1.3 | blocker | Add to the build-settings table: \| `NSPhotoLibraryAddUsageDescription` \| "Allow APPNAME to save photos and videos to your library." \| `spec/08` §6; `04b` §9.2 \| |
| A4 | `spec/08` §6 | `NSPhotoLibraryUsageDescription` (read access for the image-post picker) is never declared. | `06` §1.3 | blocker | Add: \| `NSPhotoLibraryUsageDescription` \| "APPNAME accesses your photos to upload images." \| `spec/08` §6; `04a` §16.5.4 \| |
| A5 | `spec/08` §6 | `CFBundleURLTypes` registering the `appname://` scheme is never declared, yet `03` §12.3 and `04c` §13 both depend on `appname://openurl?url=`. | `06` §1.3 | blocker | Add: \| `CFBundleURLTypes` \| one entry, `CFBundleURLSchemes = ["appname"]` \| `04c` §13; `03` §12.3 \| |
| A6 | `spec/08` §6 | The App Group entitlement the share extension writes into (`group.com.OWNER.appname`, `03` §12.3) is never declared on either target. | `06` §1.3 / §1.2 | blocker | Add: \| App Group `group.com.OWNER.appname` \| on **both** the app and the Share Extension targets \| `03` §12.3 \| — and note in §1.2 that `APPNAME.entitlements` and `ShareExtension.entitlements` must both carry it. |
| A7 | `spec/02` §2.1, `05` §4 | `[GATE: gate.downloads]` appears nowhere in `04b`, although `06` items 78/178/179 point there for it. | `04b` §9.2/§9.3 | major | Tag the `Save Image` / `Save Video` rows in §9.3 and the save row of §9.2 with `[GATE: gate.downloads]`, and add: the action remains visible with a Plus badge; tapping it when locked opens the paywall. `Share` and `Copy Image Link` are never gated. |
| A8 | `05` §4 | `[GATE: gate.gestures]` appears nowhere, although `06` items 65/209 point to `04a`/`04c` for it. | `04c` §16.1 | major | Add under the Gestures heading: `[GATE: gate.gestures]` — the screen always renders with its current values; tapping any of the nine rows (eight slots plus swipe-anywhere) when locked opens the paywall. Defaults keep working. |
| A9 | `05` §4 | `[GATE: gate.sortMemory]` appears nowhere, although `06` items 63/219/220/221 point to `04a`/`04c`. | `04c` §16.2 | major | Add under §16.2: `[GATE: gate.sortMemory]` on Default sort, Default top sort, Apply sort to home, and both Remember-subreddit-sort toggles. When locked the rows render with a Plus badge and their current values; the resolution ladder in `04a` §16.4 still runs against whatever is stored. |
| A10 | `05` §4 | `[GATE: gate.videoAutoplay]` appears nowhere, although `06` item 30 points to it. | `04b` §7.2 / §7.3 | major | Add to §7.3: the two FABs and the mirrored Appearance rows carry `[GATE: gate.videoAutoplay]`. **OWNER default is free/ungated** (`05` §4); the tag exists so the owner can flip one line. |
| A11 | `05` §4 | `[GATE: gate.appIcons]` appears nowhere, although `06` area V points to `04c` for it. | `04c` §19 | major | Add to §19: `[GATE: gate.appIcons]` on the "Set as App Icon" button of every **non-default** icon. The grid always renders with Plus badges on alternates; reverting to the default icon is always free. |
| A12 | `05` §4 | `[GATE: gate.compose]` appears nowhere, although `05` defines it as one of the eleven and `06` item 337 requires all eleven. | `04a` §16.5 | major | Add to the §16.5 preamble: every composer entry point (`NewPostSheet`, `NewCommentSheet`, and `04c` §5.1/§5.2) is tagged `[GATE: gate.compose]`, checked **before the editor opens** so no gate ever blocks already-typed content (`05` §3.3). **OWNER default is free.** |
| A13 | `05` §5.9, `06` item 311 | Nothing in `04a`/`04b`/`04c` describes what a **gated affordance actually looks like** (the "Plus badge" chrome). Every `[GATE:]` tag is therefore unimplementable as written. | `04c` §14 (new preamble) | major | Add: **Gate chrome.** A gated row keeps its label and current value and gains a trailing "Plus" badge (a small capsule in `theme.iconOrTextButton`). Tapping it presents the paywall instead of the control. Gates never hide navigation and never hide the row. The four gate styles are `05` §5.9's. |
| A14 | `spec/06` §1.1, `06` item 275 | The Settings-root search bar is specified only as a shortcut into Guide search. Item 275 requires it to **filter settings rows locally**; no doc specifies that behavior. | `04c` §15 | major | Add: **Settings search.** Typing filters the visible settings rows in place by a case-insensitive match against each row's label and its screen's section titles, showing matches as a flat list with their parent screen as a subtitle. Submitting with no row match falls through to Help search. There is **no** "ask a question" free-text answer box. |
| A15 | `spec/07` §7.2 | A multireddit-list load failure must be caught and reported **without taking down the Subreddits hub** — an explicitly-fixed past bug. | `04a` §11 | major | Add after the section list: **Partial-failure rule.** The multireddit fetch is independent: if it throws, log it and render the hub **without** the Multireddits section. A multireddit failure must never blank the Favorites/Moderator/Subscriber sections. |
| A16 | `spec/09` §7.1 | The Stats screen uses a **second, different** number formatter (`toLocaleString` + caller-specified fixed precision + singular/plural unit suffix, e.g. `"1 banana"` vs `"2.3 bananas"`), not the K/M/B `prettyNum`. `04a` §5 and `04c` §20.2 define only one formatter between them. | `04c` §20.2 | major | Add: **Two formatters, deliberately not unified.** `prettyNum` (K/M/B, `04a` §5) is used for karma and subscriber counts. The Stats screen uses its **own** `statNum(_ value: Double, precision: Int, unit: String?)` → locale-grouped number with exactly `precision` decimals plus a correctly pluralised unit. Keep them separate. |
| A17 | `spec/01` §3, §4.1, §16 | Tab-bar geometry and the `SHOWS_BENEATH_TABS` allow-list (which screens draw under the bar vs. get bottom inset) is specified nowhere. | `02` §5.4 (or `04a` §3.1) | major | Add: **Content insets.** Feed, search, post-detail, inbox, gallery and user screens draw **beneath** the tab bar and add no bottom inset. Subreddits hub, Accounts, Messages, Wiki, Sidebar, all Settings screens and the plain web view sit **above** it and take `.safeAreaPadding(.bottom, tabBarHeight)`. |
| A18 | `spec/01` §4.2 | `freezeOnBlur` on the Home feed (state frozen, not torn down, while a screen is pushed on top). | `04a` §3.1 | minor | Add a bullet: the Home feed's store is retained and **not** re-fetched when a screen is pushed over it; only video focus is released (§9). Returning restores scroll position and items without a network call. |
| A19 | `spec/09` §6.1 | `Slideable`'s long-band fallback: when a long slot is *unset*, the long band fires that direction's **short** action. | `04a` §7.1 | minor | Add to **Bands**: an unset (not `Disabled`) long slot falls back to the same direction's short action, so a row can opt into one action per side without the long band becoming inert. `Disabled` is an explicit value and never falls back. |
| A20 | `spec/06` §3.5, `spec/09` §7.3 | `validateHex` accepts 3-, 6- and 8-digit hex; `hexToRgb` handles only the 6-digit form and returns black on anything else. `04c` §18.4 states only the 6-digit round trip. | `04c` §18.4 | minor | Add: validation accepts `#RGB`, `#RRGGBB` and `#RRGGBBAA` (case-insensitive, `#` optional on input). Only the 6-digit form round-trips through the RGB sliders; a 3- or 8-digit value entered by hand is stored verbatim but the sliders read it as black until it is re-entered as 6 digits. |
| A21 | `spec/01` §12.4 | The dimming overlay drawn behind action sheets / confirmation dialogs. | `04c` §14 | minor | Add: `.confirmationDialog` and `.contextMenu` presentations get the system scrim; do **not** add a custom dimming layer (the original needed one because its action-sheet library did not dim). |
| A22 | `spec/05` §2.2 | Fullscreen viewer: vertical pager `drawDistance` ≈ 1 screen, gallery grid ≈ 2 screens. `04b` gives no prefetch budget for either. | `04b` §2.2, §10.3 | minor | Add to §2.2: prefetch one page ahead and behind on the vertical (post) axis; do not prefetch the horizontal axis. Add to §10.3: prefetch two viewport heights of grid cells. |
| A23 | `spec/02` §1.2 | Transport contract detail: `ok` is `200..<300`, an aborted request surfaces as a distinct cancellation error, and a timeout is distinguishable from a connection failure. `03` §1.2 lists the pipeline steps but not these three. | `03` §1.2 | minor | Add a closing note: `isOK` is `(200..<300).contains(statusCode)`. A cancelled request throws `CancellationError` and is **never** surfaced to the user. A timeout maps to `.timedOut`, a connection failure to `.offline` (§10.1); they are not collapsed. |
| A24 | `spec/03` §4.11 | The feed metadata row's time string carries **no** `" ago"` suffix appended by the card — the model layer supplies the whole string. | `04a` §4.11 | minor | Already implied; make it explicit: the card renders `post.timeSince` verbatim and appends nothing. The `" ago"` suffix is applied in the model layer (`03` §4.16), not here. |
| A25 | `spec/04` §3.2 | Comment body leading padding is **15 pt** in the normal case (only the `displayInList` override of 10 is stated). | `04a` §14.2 | minor | State the base value: the comment body's leading padding is **15 pt**; `displayInList` overrides it to 10 (§14.4). |
| A26 | `spec/04` §3, §12 | The flattening performance bar (a ~2 000-node tree flattens in well under 100 ms; first screen of a 2 000-comment thread under a second; memory independent of thread size). | `04a` §14.1 | minor | Add: **Performance contract.** Flattening a 2 000-node tree must complete in <100 ms on the oldest supported device; the first screen of a 2 000-comment thread must render in <1 s; peak memory must not scale with total thread size. These are Phase 3 gate measurements. |
| A27 | `spec/06` §2.2 | The "Clear custom … sorts (N subs)" buttons delete by **key prefix** and reset the displayed count to 0 in place. | `04c` §16.2 | minor | Add: the clear action enumerates the per-subreddit dictionaries, removes every entry, and sets the displayed count to 0 without a refetch. There is no confirmation. |
| A28 | `spec/07` §5.1 | Trending-subreddit filtering: exclude subs the user is already subscribed to **and** any subreddit literally named `"Home"`. `04c` §7.1 has this; `04a` §11 (hub Trending section) does not. | `04a` §11 | minor | Add to the Trending bullet: the same two exclusions as the Search tab apply — already-subscribed subreddits and any subreddit literally named `"Home"` are dropped. |
| A29 | `spec/02` §2.5 | R1/R2 results are sorted **locale-aware** by name before display; `04a` §11 says "alphabetically (locale-aware) sorted by the data layer" but does not say favourites inherit that order. | `04a` §11 | minor | Add: Favourites render in **stored insertion order**, not sorted; Subscriber and Moderator render in the data layer's locale-aware name order. |
| A30 | `spec/03` §9.2 | The focus **key** is the video's pre-resolution source URL — the same key as the player registry and the resume-position map. `04a` §9 describes the algorithm but never names the key. | `04a` §9 | major | Add: the focus key is `VideoSource.key` = (pre-resolution playback URL, gallery index) — identical to the registry key (`04b` §5) and the resume-position key (`04b` §7.1). Never key focus on the post id. |
| A31 | `spec/03` §9.2 | Only `videos[0]` of a multi-video post participates in focus; `04b` §7.4 says this, `04a` §9 does not. | `04a` §9 | minor | Add: for a post with several videos, only `videos[0]` supplies the focus key and the poster; the rest never play inline. |
| A32 | `spec/03` §2 | Feed access failures: `BannedSubredditError` / `PrivateSubredditError` / `MultiredditUnavailableError` are **not** retried, everything else is reported to the crash reporter. `04a` §2.1 stops retrying on `accessFailure` but does not say the others are reported. | `04a` §2.1 | minor | Add to step 1: an access failure short-circuits without a report; any **other** thrown error sets `loadFailed`, clears the spinner, and is sent to the crash reporter as a captured exception with the route as context. |
| A33 | `spec/03` §14 | The text-filter trie is built once and cached, invalidated when `filterText` changes — `04a` §7.3 says this; it does not say the trie is **shared** between the post and comment filters. | `04a` §7.3 | minor | Add: one trie instance serves both the post and the comment haystacks; there is no separate comment filter list. |
| A34 | `spec/03` §11 | A seen-post write must be **awaited before** the change event is published (load-bearing ordering). `04a` §7.7 has it; `03` §7.3 has it; neither states what a consumer should do on failure. | `03` §7.3 | minor | Add: if the write throws, do **not** publish the change event — the row stays visually unseen rather than showing a state the database does not hold. |
| A35 | `spec/05` §4.1 | Redgifs: "a waiter cancelled while waiting out a cooldown bails immediately rather than holding its slot". Present in `03` §9.1 and `04b` §6.5; the *reason* (a visible post must not starve behind an off-screen one) is only in the survey. | `04b` §6.5 | minor | Append the rationale to the cooldown row so an implementer does not "optimise" it away: otherwise a still-visible post starves behind a scrolled-past one. |
| A36 | `spec/05` §3.1 | The fullscreen image placeholder is *expected to be a cache hit* because it is literally the variant the feed card already displayed — so the pipeline must be shared between feed and viewer. | `04b` §3.1 | major | Add: the feed strip and the viewer must use the **same** image pipeline instance and cache. The placeholder guarantee depends on it; two pipelines means a black frame on every open. |
| A37 | `spec/05` §10.3 | Gallery grid: images render with **autoplay disabled** for animated content. `04b` §10.3 says "no autoplay for animated content" but not that this contradicts `04b` §1.2 (GIF images always animate). | `04b` §1.2 | minor | Add a carve-out to §1.2: animated GIF *images* animate unconditionally **except** in the Gallery Mode grid, where they render as a still first frame. Tapping into the viewer resumes animation. |
| A38 | `spec/05` §11 | Before the first `NWPathMonitor` update arrives the effective data mode is conservatively `.lowData`. `04b` §13 states it; `04a` (which also branches on data mode) does not. | `04a` §4.5 | minor | Add a footnote: until the first network-path update lands, the effective data mode is `.lowData`, so the very first feed paint after a cold launch may show one image instead of two. This is intentional. |
| A39 | `spec/06` §1.1 | The Settings root footer's exact shape (app name + version, then `Build #<build>`). `04c` §15 has it; it omits that the footer is **centred, non-interactive, `theme.verySubtleText`**. | `04c` §15 | minor | Add: centred, non-interactive, `theme.verySubtleText`, 12 pt, with 16 pt of space above the list's bottom edge. |
| A40 | `spec/06` §2.3 | The Filters screen's per-route hide-seen override block lists the overriding routes **verbatim** — `04c` §16.3 says "lists those routes verbatim" but does not say the rows are inert (not tappable, not removable here). | `04c` §16.3 | minor | Add: those rows are **informational only** — they are not tappable and cannot be removed from this screen. Clearing an override is done from the originating feed's "…" menu. |
| A41 | `spec/06` §3.2 | Deleting the **active** custom theme reverts to the default theme — present in `04c` §18.1. The reciprocal case (deleting a non-active theme) must not disturb the active one. | `04c` §18.1 | minor | Add: deleting a theme that is not currently active changes nothing else — no re-resolution, no re-render of the theme list's selection. |
| A42 | `spec/06` §3.4 | On leaving the Theme Maker the live draft resets **even after a successful save** — `04c` §18.3 has "On disappear"; it does not say the just-saved theme is nonetheless already active. | `04c` §18.3 | minor | Add: the reset-on-disappear does not undo the save — step 4 of the save flow already made the theme active, and the active theme is resolved from `custom_themes`, not from the draft. |
| A43 | `spec/06` §8 | Stats: `daysSinceTrackingStarted` must never be < 1 (a same-day install would divide by zero). Neither `spec/06` nor `04c` §20.2 states a floor. | `04c` §20.2 | major | Add: `daysSinceTrackingStarted = max(1, …)`. On install day, Opens per Day equals the raw foreground count rather than dividing by zero. |
| A44 | `spec/06` §8 | Stats: the achievement "Explorer" counts **unique subreddits visited**, i.e. the row count of `subreddit_visits`, not the sum of counts. `04c` §20.2 says "unique subreddits visited" but never ties it to the table. | `04c` §20.2 | minor | Add: unique-subreddits-visited is `COUNT(*)` over `subreddit_visits`, not `SUM(count)`. |
| A45 | `spec/06` §10 | Advanced: the image-cache size readout is recomputed **whenever the screen regains focus**, and an OS memory warning clears the in-memory cache independently of the button. `04c` §20.4 has the first, not the second. | `04c` §20.4 | minor | Add: independently of this button, an OS memory-pressure warning clears the **in-memory** image cache; the disk cache and this readout are untouched. |
| A46 | `spec/06` §12.2 | The Guide article view must rewrite in-article `appname://…` markdown links into real anchors **before** rendering, because the markdown compiler does not treat a custom scheme as a link protocol. `04c` §21.3 states it — but not that the same rewrite is needed for the Help deep links `06` item 318 requires from settings rows. | `04c` §21.3 | minor | Add: the same rewrite applies to Help deep links opened **from** a settings row, so `SettingsRoute.guide(.article(key))` and an in-article link resolve through one code path. |
| A47 | `spec/07` §1.6 | Switching to `"Logged Out"` does **not** remove the account from the saved list. `04c` §2.5 says this in the Logout row; the Accounts-list section (§1.2) does not, and that is where a reader looks. | `04c` §1.2 | minor | Add to the `"Logged Out"` row bullet: selecting it logs out but leaves every saved account in the list and in the Keychain, so it can be switched back into. |
| A48 | `spec/07` §2.4 | Inbox comment-reply **voting** updates the row's local score optimistically from the returned effective vote; `04c` §4.3 says so, but does not say the inbox has **no** swipe-configurability (its swipe map is fixed, unlike feed rows). | `04c` §4.3 | minor | Add: inbox swipe actions are **fixed** and are not affected by `postSwipeOptions` / `commentSwipeOptions`. |
| A49 | `spec/07` §3.1 | The Messages thread auto-scrolls to the bottom **whenever the message count changes**, including after sending. `04c` §5 has it; it does not state that a send inserts the new message optimistically or refetches. | `04c` §5 | major | Resolve explicitly: after a successful send the thread **refetches** (endpoint I3) via the parent reload callback, then auto-scrolls. Nothing is inserted optimistically. |
| A50 | `spec/07` §4.6 | The `allowSuspended` asymmetry: the header fetch passes it, the content fetch does not, so a suspended user's page loads its header and then fails its list. `04c` §6.4 states it — but not what the screen looks like in that split state. | `04c` §6.4 | major | Add: in that split state the header renders normally and the **content area** is replaced by the access-failure view. The screen is not blanked. |
| A51 | `spec/07` §8.2 | The sidebar renders the `Rules` header even for a subreddit with **zero** rules, with no empty-state text. `04c` §8 has it; it does not say the description still renders below. | `04c` §8 | minor | Add: an empty rules list does not suppress item 3 — the description HTML still renders beneath the empty `Rules` header. |
| A52 | `spec/07` §10.4 | The multireddit "empty vs unavailable" distinction is a **fixed past bug**; `04a` §3.3 and `03` §5.2 both state it, but neither says the empty case must still render the sort control and the "…" menu. | `04a` §3.3 | minor | Add: a legitimately-empty multireddit renders as a normal empty feed — header, switcher title, sort control and "…" menu all present — not as an error surface. |
| A53 | `spec/01` §6 | Incoming-URL handling must run **after routing is ready** on a cold launch (the original checks `Linking.getLinkingURL()` only once navigation becomes ready). `04c` §13 lists the sources but not the ordering constraint. | `04c` §13 | major | Add to `handleURL`: on a cold launch the intake runs only **after** the tab router exists and `loginInitialized` is true, so the push has a stack to land on. A URL that arrives earlier is queued, not dropped. |
| A54 | `spec/01` §6 source 2 | Clipboard detection has a **re-entrancy guard** so repeated foregrounds cannot stack prompts. `04c` §13 mentions it; it does not say the guard is released when the alert is answered. | `04c` §13 | minor | Add: the guard is held from presenting the alert until the user answers it, then released. A foreground transition while the alert is up is a no-op. |
| A55 | `spec/02` §2.12 | The gated/quarantined interstitial's **Cancel** path must leave the store in a state that does not immediately retry on the next appearance. `03` §5.2 and `04a` §2.2 both say "returns empty" but not that the screen must not re-prompt in a loop. | `04a` §2.2 | major | Add: after Cancel, the store sets `fullyLoaded` and does **not** re-issue on the next `onAppear`. Only an explicit pull-to-refresh re-presents the interstitial. |
| A56 | `spec/02` §3.2 step 9 | The account-settings normalisation is throttled by a **single global** timestamp, not a per-account one. Neither `03` §5.7 (which drops the feature) nor `04c` §3.4 (which keeps it) states the consequence: adding a second account within 30 days silently skips it. | `04c` §3.4 | minor | Add: the throttle key is **global**, not per account, so adding a second account inside the 30-day window skips normalisation for that account entirely. If the feature is kept, make the key per account. |
| A57 | `spec/02` §5.2 | `unfilteredCursor` must be advanced **even on an attempt whose items are all filtered out** — otherwise the ramp re-requests the same page. `03` §6.1 names the field; `04a` §2.1 step 2b is correct but the failure mode is not called out. | `04a` §2.1 | minor | Add a note under 2b: the cursor advances on **every** attempt, including one whose items are entirely filtered out. Not advancing it makes the filter-retry ladder re-fetch the same page five times. |
| A58 | `spec/02` §4.1.2 rule 3 | Gallery-video entries lacking `s.mp4` are dropped (in addition to entries lacking a `p` array). `03` §4.4 rule 3 states only the `p`-array drop; `04b` §1.1 states only the `p`-array drop. | `03` §4.4 | minor | Amend rule 3's Notes: entries lacking a `p` array **or** lacking `s.mp4` are dropped. |
| A59 | `spec/02` §4.13 | The composer's markdown→HTML output must have inter-tag whitespace collapsed (`>\s+<` → `><`) before rendering. `04a` §18.2 has it; `03` (which owns the model/format contract) does not mention the composer pipeline at all. | `03` §4.16 | minor | Add a closing paragraph pointing at `04a` §18.2, so the formatting-helpers section is not read as the complete set. |
| A60 | `spec/02` §5.3 | The OpenGraph in-memory cache is keyed by **post id** and never invalidated (`03` §6.4 has it) — but nothing says a refresh must not re-fetch previews for posts already in the cache. | `03` §6.4 | minor | Add: a refresh re-uses cached OpenGraph data for any post id already present; only genuinely new posts issue a preview request. |
| A61 | `spec/02` §7 | "Media share/save failure" dismisses the preparing modal **before** presenting the error. `04b` §9.2 has the copy but not the ordering. | `04b` §9.2 | minor | Add: the preparing modal is dismissed **first**, then the alert is presented — never stacked. |
| A62 | `spec/09` §2.3 / `spec/06` §10 | The video-cache clear must run **before any view that could mount a player** exists, and the flag is reset regardless of success. `03` §7.6 and `04c` §22.3 have the ordering; neither states the reset-on-failure rule. | `03` §7.6 | minor | Add to the Video cache row: the flag is cleared after the attempt **whether or not it succeeded**, so a permanently failing clear cannot wedge every subsequent launch. |
| A63 | `spec/09` §8 | `List`'s `hide` semantics: a hidden row is **filtered out entirely**, not disabled — this is what makes every conditional settings row (top-sort picker, thumbnails-on-right, reader mode) work. | `04c` §14 | minor | Add to the navigation-model preamble: conditional settings rows are **removed** from the list, never rendered disabled. The one exception is a gated row (A13), which stays visible with a badge. |
| A64 | `spec/09` §8 | `SearchBar`'s `clearOnSearch` behaviour is what makes the in-subreddit bar clear itself. `04c` §7.2 describes the effect but not the shared primitive. | `04c` §7.2 | minor | Add: this is a flag on the shared search-bar primitive (`clearOnSearch`), not bespoke logic — the Search tab's bar and the subreddit-search screen's bar set it to false. |
| A65 | `spec/01` §1.6 | Two counters increment at cold start (`app_launches` **and** `app_foregrounds`), and `app_foregrounds` increments again on every activation, so `foregrounds >= launches` always. `04c` §20.2 has it; `04c` §22.3 step 3 has it; `03` §7.3 has it — but none says what to do if the DB is not ready yet. | `04c` §22.3 | minor | Add to step 3: if the database is not yet open, the increments are deferred until it is — never dropped, never double-counted. |
| A66 | `spec/03` §2 | The feed's **empty** state renders nothing at all (no message), deliberately. `04a` §2.2 says this; nothing says the same rule applies to Gallery Mode and to search results. | `04b` §10.3 / `04c` §7.1 | minor | Add the same sentence to both: a zero-result state renders an empty list with the spinner cleared and no message. |
| A67 | `spec/04` §2 item 5 | The post-detail action bar's Reply button is gated by `interactionDisabledStatus` **before** the sheet opens, and the alert text interpolates the raw status string. `04a` §13 has it; `04a` §16.1 item 7 says "gated … exactly like the post-level reply button" without repeating the copy. | `04a` §16.1 | minor | Spell out the copy once more so the comment path is implementable standalone: `.alert("This post has been \(status)")` where `status` is the raw `"locked"` / `"archived"` string. |
| A68 | `spec/06` §2.7 | The in-app browser **locks orientation back to portrait when it closes** — the only place besides the media viewer that unlocks it. `04c` §12 says "re-locked to portrait when it closes"; `02` §5.11 must be the single owner. | `04c` §12 | minor | Add a cross-reference: the unlock/re-lock pair is owned by `02` §5.11; this row only names the two surfaces that use it (media viewer, in-app browser). |
| A69 | `spec/06` §11.2 | `spec/09` §2.1 records `readClipboard`'s default as `true` while `spec/06` §2.4 records `false`. `03` §8.1 resolves to `false`; `04c` §16.4 states `false` — but neither records that the two sources disagreed, so a later reader may "fix" it back. | `04c` §16.4 | minor | Add a footnote: the original's two sources disagree (`false` in the settings screen, `true` in the constant). `false` is authoritative — it is what the UI ships and what `08`'s `clipboard-read-default` decides. |
| A70 | `spec/08` §1 item 60 | Repositioning the floating comment-nav button (hold ~1 s → move mode → 10 snap points → persist) is specified in `04a` §15.4 but is **absent from `06`'s checklist entirely** (chk 73 covers only tap/long-press). | `06` §4 area C | major | Add: `- [ ] 73a. The floating comment button can be repositioned: ~1 s hold enters move mode, 10 snap points, release on one persists it (04a §15.4).` |
| A71 | `spec/02` §9 | `03` §9.8's host inventory omits `new.reddit.com`'s role being **web-view only** in the *removed* column reasoning, and omits the S3 upload host from the "no first-party backend" claim's scope. Cosmetic, but the inventory is used as an ATS/allow-list source. | `03` §9.8 | minor | Add a closing line: this table is the exhaustive set of hosts the app may contact. Any host not listed here is a bug; `www.hydraapp.io`-class first-party hosts are explicitly absent by decision (§9.6). |
| A72 | `spec/05` §9.2 | The **only** place a video can be shared/saved is the fullscreen viewer's overlay button — `04b` §9.3 has the table, but `04a` §7.2 (post long-press menu) does not say its `Share` is the *permalink*, not the media, in the same breath as the media table. | `04a` §7.2 | minor | Already partly present; strengthen item 7's note to: `Share` shares the Reddit permalink. There is **no** media share/save anywhere in a post's long-press menu — see `04b` §9.3. |

---

## B. Incorrect / contradicting statements in `03` / `04*`

These are places where two **normative** documents disagree. Each needs one side changed; the
"correct value" column names which side the evidence supports.

| # | Doc § | Claim | Survey § | Correct value | Proposed fix |
|---|---|---|---|---|---|
| B1 | `04c` §18.2 | Reproduces the original's **exact 12 built-in palettes**, every hex value, plus its 6-colour comment-depth rainbow, and instructs "Ship all 12 free". | `08` decision **36 `theme-count`** | Decision 36: ship **6–8 new** built-in themes with **new** palettes, keep the 19-role structure, and **choose new depth colours**. | Replace §18.2's two palette tables with a structural template (19 roles × N themes, blank hexes) plus the sentence "palettes are an owner/design deliverable; the original's are creative expression and must not be reproduced." Move the depth-colour array to a new 6-colour set. Keep the declared-order/default-theme mechanics. |
| B2 | `04a` §14.2 | Comment depth rail cycles `#e40303, #ff8c00, #e6d600, #008026, #24408e, #732982`. | `08` decision 36 | A **new** 6-colour set chosen for this app. | Replace the literal list with "the six `theme.commentDepthColors` values defined in `04c` §18.2 (fixed across all themes, not customisable)" and drop the hexes. |
| B3 | `04b` §10.1 | "**No 100-post cap exists** … Do not build a cap." | `05` §4 `gate.galleryMode`; `06` item 26 | `05` is normative on monetisation: Gallery Mode stops loading after **100** items without the entitlement and shows an inline "Continue with Plus" footer row. | Replace the paragraph with: after 100 loaded items, `loadMore()` is refused when `entitlements.isEnabled(.galleryMode) == false`, and the list footer renders the inline upsell row (`05` §5.9 `.inlineFooter`). With the entitlement, paging is unbounded. |
| B4 | `04b` §11 | OpenGraph fetches are "all concurrent, **with no cap**". | `03` §9.4 (`og-concurrency-cap`) | **6** concurrent, via a task-group semaphore. | Change "with no cap" to "capped at **6** concurrent (`03` §9.4) — a 100-post filter-retry page would otherwise open 100 sockets." |
| B5 | `04a` §14.5 | Reddit's `count: 0` "continue this thread" stub is **not** distinguished; renders `"0 more replies"`; tapping fetches nothing. "Reproduce." | `03` §4.6 `isContinueThread`; `06` item 61 | `03` and `06` both say it **is** detected and renders **"Continue this thread →"**, pushing the comment's permalink. | Replace the paragraph: a `more` with `count == 0` and no child ids becomes a `.continueThread` row reading `"Continue this thread →"`; tapping pushes `Route.postDetail` at the parent comment's permalink. Delete the "Reproduce" instruction. |
| B6 | `03` §7.5 | Draft keys are `comment.<parentFullname>`, `post.title.<sub>`, `post.body.<sub>`, `message.subject.<user>`, `message.body.<user>`, `messageReply.<user>`. | `04a` §16.5.3, `04c` §5.1/§5.2 | `04a`/`04c` use `newCommentDraft-<parentId>`, `newPostDraft-title-<sub>`, `newPostDraft-text-<sub>`, `newMessageDraft-Subject-<user>`, `newMessageDraft-Text-<user>`, `replyToMessageDraft-<author>`. | Pick one. Recommend `03`'s namespaced forms (they are the doc that owns persistence) and update `04a` §16.5.3 and `04c` §5.1/§5.2 tables to match. Also resolve **fullname vs bare id** for the comment key — `03` says fullname, `04a` says id; fullname is safer (it encodes the kind). |
| B7 | `03` §7.5 | "We **fix** [the type-switch quirk]: the body field is cleared when switching between `link` and the others." | `04a` §16.5.3 | `04a` says the opposite: "switching the post-type pill does **not** clear the shared `text` field … `[DECISION: newpost-type-switch-shares-text]`". | One of the two `[DECISION:]` names is stale (`03` cites `newpost-type-switch-keeps-text`, `04a` cites `…-shares-text`). Resolve to `03`'s behaviour (clear on link↔non-link switch) and rewrite `04a` §16.5.3's "Quirk to reproduce" block accordingly. |
| B8 | `04c` §2.1 | Login URL is `https://www.reddit.com/login?dest=https://www.reddit.com/r/HydraClient`. | `03` §5.3 | `03` uses `dest=https://www.reddit.com/`. | Use `03`'s value. The `dest` only affects where Reddit redirects; pointing it at the original app's community is both a clean-room smell and a dead link for `APPNAME`. |
| B9 | `04c` §2.1 | "**Cosmetic injection.** … Reproduce with `WebPage.callJavaScript` on each navigation." | `03` §5.3 (`login-css-injection`) | `03`: "`APPNAME` injects **nothing**." | Delete the cosmetic-injection paragraph from `04c` §2.1 and replace with a one-line pointer to `03` §5.3's decision. |
| B10 | `04c` §3.4 | Specifies the silent `old.reddit.com/prefs` scrape-and-force-NSFW-on normalisation as behaviour to build, tagged `[DECISION: force-nsfw-account-settings]`. | `03` §5.7 (`prefs-force-over18-on-login`); `06` item 114c | `03` **drops** it and replaces it with a one-time disclosed banner. `06` item 114c says "disclosed and toggleable". | Rewrite `04c` §3.4 as the disclosed-banner replacement from `03` §5.7 (banner copy, the button that opens Reddit's settings, and an optional `normalizeAccountSettings` toggle defaulting **off**). Remove step 8 from `04c` §2.4's login procedure or point it at the banner. |
| B11 | `04c` §16.5 | `startupURL` default is `"https://www.reddit.com/"`. | `03` §8.1 (`startup-url-default`) | `03`: default **empty**, because a non-empty default silently defeats the initial-tab setting. | Change `04c` §16.5's default to `""` and add the sentence from `03` §8.1 explaining why. |
| B12 | `04c` §20.2 | "**Fully unlocked for everyone** … Ship it free. `[DECISION: stats-free]`". | `05` §4 `gate.stats`; `06` items 288, 297a | `05` gates the whole Stats screen; the locked state describes what is tracked, and counters keep incrementing. | Replace with: `[GATE: gate.stats]` — the row stays in Settings; opening it without the entitlement shows the locked description screen (`05` §5.9 `.lockedScreen`). Counters increment regardless. Delete `[DECISION: stats-free]` or re-point it at the locked-state copy. |
| B13 | `04c` §15 row 7 | Settings row labelled **"APPNAME Pro"**. | `05` throughout; `06` item 307 | The product is **"APPNAME Plus"**. | Rename the row to `APPNAME Plus` and retag `[GATE: pro-entry]` → the non-gate note in `05` §4.1. |
| B14 | `04c` §15 rows 1, 12, 13 | Settings root lists **Guide**, **Patch Notes**, **Request A Feature**, and row 13 navigates in-app to a feedback **subreddit** sorted `top?t=all`. | `06` items 307, 308, 309, 317 | `06` requires **Help**, **What's New**, **Feedback**, and "Feedback links to the owner's chosen destination (no third-party subreddit by default)". | Rename rows 1/12/13 to Help / What's New / Feedback; change row 13's destination to an owner-configured URL constant (default: an owner-supplied feedback destination), opened through the external-link opener. Rename `04c` §21.3's heading from "Guide" to "Help". |
| B15 | `04c` §21.3 | Specifies the full 11-category Guide browser with build-time embedding vectors and top-k cosine search. | `06` items 317, 320 | `06`: "**a small hand-written help section replaces the 38-topic guide**", topics limited to what the rewrite does. | Keep the four-state structure and the "Page Not Found" article, but scale the spec down: state a target of ~10–14 short articles, and make the search an FTS5/BM25 lexical index (option 2 in §21.3) the **default**, with the embedding approach recorded as a future option rather than the primary contract. |
| B16 | `04a` §7.4 | "**Known drift:** voting inside post details is not reflected back into the feed … Ship the same behavior. `[DECISION: detail-vote-not-in-feed]`". | `06` item 164 | `06`: "**CHANGED (FIXED)** Voting in post detail is reflected in the feed behind it (`[DECISION: postdetail-vote-not-reflected]`)". | Replace the paragraph: the detail screen's vote mutates the same `ListingStore` item (by id + kind) that the feed behind it renders, so popping back shows the updated score. Delete the "ship the same behavior" instruction and align the decision tag name with `06`'s. |
| B17 | `04a` §4.9 / `03` §4.13 | `04a`: reproduce the stub Vote button, which alerts and sends nothing. `03`: "polls render **read-only with results** when Reddit supplies them, which is strictly better than a fake button." | `08` `poll-voting-stub` | The two derived docs specify **different UI**. | Resolve to `03`'s read-only-with-results rendering (it is the one that is not a fake affordance) and rewrite `04a` §4.9's footer: no Vote button; when `poll_data.options[].vote_count` is present render per-option bars and the user's own selection; otherwise render the options inertly with the total vote count. |
| B18 | `04a` §7.7 + `04c` §16.3 | Toggling `autoMarkAsSeen` presents `"Restart the app for this change to take effect."` | `06` item 18 | `06`: "**CHANGED** … takes effect immediately, no restart required." | Delete the restart alert from both places; keep only the conditional slower-loads warning when hide-seen is also on. Update `[DECISION: mark-seen-restart]`'s resolution note in both traceability tables. |
| B19 | `04c` §20.3 | Toggling error reporting presents `"APPNAME must be restarted for this change to take effect."` | `06` item 298 | `06`: "**CHANGED** … **no restart required**". | Replace with: the toggle takes effect immediately — the reporter is started/stopped in place rather than read once at launch. Remove the restart sentence from the section body too. |
| B20 | `03` §1.3 + §14.1 | `raw_json=1` on every read, therefore "no decoding step exists". | `04a` §14.2, §18 | `04a` says comment/post bodies are "Reddit's own server-rendered HTML (**entity-decoded**)" and "The model layer entity-decodes it." | With `raw_json=1` the decode step is gone. Change `04a` §14.2 and the §18 preamble to "Reddit's server-rendered HTML, already unescaped because every read sends `raw_json=1` (`03` §1.3)". |
| B21 | `03` §8.1 (whole table) | Settings keys are namespaced (`filters.hideSeenPosts`, `data.wifi`, `ui.scrollToNextButtonPosition`, `flags.galleryModeOffered`, `post.compactMode`, …). | `04a` §19, `04b` §13, `04c` §§16–20 | The `04*` docs use the **legacy flat names** throughout (`filterSeenPosts`, `dataMode.wifi`, `scrollToNextButtonPosition`, `hasOfferedGalleryMode`, `postCompactMode`, …). | Systemic. Pick `03` §8.1's namespaced names (it owns persistence and `03` §14.2 already flags `settings-key-rename` as open) and do one mechanical rename pass across `04a` §19, `04b` §13 and every `04c` settings table. Until then every key reference in `04*` is ambiguous. |
| B22 | `04c` §4.3 / `03` §4.11 | `04c` renders inbox item bodies as "the reply's **HTML**" / "the message **HTML**"; `03` §4.11 models `CommentReply.body` and `PrivateMessage.body` as `data.body` (markdown) with no HTML field. | `spec/02` §4.9 | The original stores `body_html`; `03` deliberately switched the whole app to markdown-source rendering (`snudown-renderer`). | Align `04c` §4.3 and §5 to say "the body markdown, rendered by the shared renderer (`04a` §18)" — or add `bodyHTML` to `03` §4.11 if inbox items are to keep the HTML path. One or the other, not both. |
| B23 | `04c` §7.1 | Search fires "on **submit** … **and on blur**". `04c` §7.2 says the in-subreddit bar submits "**only** on the return key (not on blur)". | `spec/07` §5.2, `spec/09` §8 | Correct as written — but the two behaviours come from one shared primitive's `searchOnBlur` flag, which is never named. | Add the flag name to both sections so an implementer does not build two search bars: "the shared search-bar primitive's `searchOnBlur` is `true` on the Search tab and `false` here." (Also see A64.) |
| B24 | `04b` §9.2 | Permission-denied alert copy is `"Allow **Hydra** to add to your photo library in Settings to save media."` with a parenthetical "Replace `Hydra` with `APPNAME`". | clean-room rule (`02` §0.3) | The product name must not appear in shipped copy. | Replace the literal string with `"Allow APPNAME to add to your photo library in Settings to save media."` and delete the parenthetical. (Same treatment for the two `"Hydra"` occurrences in the same table.) |

---

## C. Checklist pointer problems in `06` §4

| # | Checklist item | Current pointer | Correct pointer / verdict |
|---|---|---|---|
| C1 | 15 — "Filtering by text, hide-seen and subreddit filters (`[GATE: gate.filters]`)" | area A → `04a` | `04a` tags only text filtering (`[GATE: text-filters]`, §7.3). Hide-seen (§7.7), subreddit filters (§7.8) and Hide Post (§7.6) carry **no gate tag** → see **A8**-style fix; add `[GATE: gate.filters]` to `04a` §§7.6–7.8 and `04c` §16.3. |
| C2 | 18 — "**CHANGED** … takes effect immediately, no restart required" | `04a` | `04a` §7.7 and `04c` §16.3 both still specify the restart alert → **B18**. |
| C3 | 26 — "Gallery Mode capped at 100 items … as an inline footer" | `04b` | `04b` §10.1 says "**Do not build a cap**". No spec for the footer exists in `04b` → **B3**; the real behaviour is defined in `05` §4 / §5.9 only. |
| C4 | 30 — "`[GATE: gate.videoAutoplay]`" | `04a` | No such tag in `04a` or `04b` → **A10**. |
| C5 | 40 — "drafts autosave per subreddit **and per post kind**" | `04a` | `04a` §16.5.3 specifies **one** draft pair per subreddit with a *shared* body across kinds. "Per post kind" is specified nowhere → no spec exists; see **B7**. |
| C6 | 61 — "'continue this thread' stub is detected and navigates to the permalink" | `04a` | `04a` §14.5 specifies the exact opposite and says "Reproduce" → **B5**. |
| C7 | 63, 219, 220, 221 — `[GATE: gate.sortMemory]` | `04a` / `04c` | No such tag in either → **A9**. |
| C8 | 65, 209 — `[GATE: gate.gestures]` | `04a` / `04c` | No such tag in either → **A8**. |
| C9 | 78, 178, 179 — `[GATE: gate.downloads]` | `04b` | No such tag in `04b` → **A7**. |
| C10 | 114c — "The `/prefs` NSFW/media normalization is **disclosed and toggleable**" | `04c` | `04c` §3.4 specifies the **silent** version; `03` §5.7 **drops** it entirely. Neither specifies "disclosed and toggleable" → no spec exists; see **B10**. |
| C11 | 152 — "'Filter Subreddit' … (`[GATE: gate.filters]`)" | `04c` | The behaviour lives in `04a` §7.2 item 4 / §7.8, not `04c`; and it carries no gate tag. Re-point to `04a` §7.2/§7.8 **and** add the tag. |
| C12 | 164 — "**CHANGED (FIXED)** Voting in post detail is reflected in the feed behind it" | `04a` | `04a` §7.4 specifies shipping the bug → **B16**. |
| C13 | 172, 173 — saved-item limitations | `04a` (area J) | `04a` never mentions the Saved sections' constraints; the Saved Posts / Saved Comments sections are specified in `04c` §6.1 / `04a` §3.4. Re-point area J items 169–173 to `04c` §6.1. |
| C14 | 187 — "'Open in APPNAME' ships as an App Intent" | `04c` | `04c` §16.4 still describes the iCloud-Shortcut row as the primary and defers to `[DECISION: open-in-appname-shortcut-vs-intent]`; `03` §12.4 specifies the App Intent. Re-point to `03` §12.4 and make `04c` §16.4 reference it as resolved. |
| C15 | 190, 191, 192 — link previews / 1.75 s timeout | `04c` (area L) | OpenGraph rules live in `04b` §11 and `03` §9.4, not `04c`. Re-point area L items 190–192 to `04b` §11. |
| C16 | 194 — "Landscape in the browser works" | `04c` | `04c` §12 mentions the unlock/re-lock only for the `internalBrowser` option. Fine, but add the pointer `04c` §12 + `02` §5.11 explicitly, since area L's blanket "→ `04c`" hides that `02` owns orientation. |
| C17 | 234 — "**CHANGED** New built-in theme set, all free" | `04c` | `04c` §18.2 ships the original 12 palettes verbatim → **B1**. |
| C18 | 235 — "**CUT** Timed previews of locked themes" | `04c` | `04c` §18.2 carries `[GATE: premium-themes]`, which is **not** in `05` §4's canonical list nor in §4.1's alias table. Per `05` §4.1's own rule, a gate not defined there does not exist → delete the tag from `04c` §18.2. |
| C19 | 245 — "Comment depth colours are fixed and shared across themes" | `04c` | Structurally correct, but the concrete values in `04c` §18.2 and `04a` §14.2 are the original's → **B2**. |
| C20 | 275 — "Settings search filters settings rows locally; no AI question box" | `04c` | `04c` §15 specifies an `"Ask a question..."` bar that pushes Guide search — the opposite of "filters rows locally" → **A14**. |
| C21 | 288, 297a — Stats gated / counters keep incrementing while locked | `04c`, `[GATE: gate.stats]` | `04c` §20.2 says "Fully unlocked for everyone … Ship it free" → **B12**. |
| C22 | 298 — "**CHANGED** Error-reporting toggle … **no restart required**" | `04c` | `04c` §20.3 specifies the restart alert → **B19**. |
| C23 | 306 — "Startup URL overriding the tab, with validation feedback" | `04c` | Behaviour is specified, but the **default** contradicts `03` §8.1 → **B11**. |
| C24 | 307 — root lists "General, **Help**, … **APPNAME Plus**, **What's New**, **Feedback**" | `04c` | `04c` §15 lists Guide / APPNAME **Pro** / Patch Notes / Request A Feature → **B13**, **B14**. Also the orders differ (06 puts Help 2nd, `04c` puts Guide 1st) — pick one. |
| C25 | 309 — "Feedback links to the owner's chosen destination (no third-party subreddit by default)" | `04c` | `04c` §15 row 13 navigates in-app to a feedback subreddit → **B14**. |
| C26 | 311 — "Gated settings stay visible with a Plus badge" | `05` §5.9 | `05` defines the styles; **no** `04*` document describes the badge chrome → **A13**. |
| C27 | 313, 314, 316 — App icons, `[GATE: gate.appIcons]` | `04c` | `04c` §19 has no gate tag → **A11**. Item 316 ("one default plus three new alternates, authored for this app") **is** correctly specified by `04c` §19's `[DECISION: app-icon-art]`. |
| C28 | 317, 318, 320 — Help section, deep-linkable topics | `04c` | `04c` §21.3 is still the full Guide browser with 11 categories → **B15**. Item 318's "reachable by deep link from settings rows" is specified nowhere (see **A46**). |
| C29 | 337 — "`Feature` enum with the eleven cases" | `05` §4 | Correct against `05`, but only **5** of the 11 gates are tagged anywhere in `04a`/`04b`/`04c` (`custom-themes`, `gallery-mode`, `multi-account`, `stats`, `text-filters`). Phase 8's "sweep applying every `[GATE:]` tag" has nothing to sweep for six of them → A7–A12. |
| C30 | area C numbering, items 59–73 | "Transcribed from `spec/08` §1 (items 1–327)" | The transcription is **offset** in area C: checklist 59 = inventory 61, checklist 60 = inventory 62, … checklist 72 = inventory 73, checklist 73 = inventory 59+60, and checklist 61 is a *new* item. Anyone cross-referencing by number lands on the wrong feature. Either restore 1:1 numbering or drop the "items 1–327" claim and add an explicit inventory→checklist map. |
| C31 | area C, inventory item 60 | — | **Inventory item absent from the checklist.** Repositioning the floating comment-nav button is folded into checklist 73, whose text covers only tap/long-press → **A70**. |
| C32 | 344, 345 | `05` §7, §9 | Pointers are valid, but `06` §3 (Verification method) never lists the StoreKit-configuration matrix as a gate step, while Phase 8's DoD does. Add a line to §3 so the acceptance path and the phase gate agree. |

---

## D. Product-decision violations

Not empty.

| # | Decision | Where violated | Detail | Fix |
|---|---|---|---|---|
| D1 | **Clean-room — no copying of the original's creative assets** (`02` §0.3; `08` decision 36) | `04c` §18.2; `04a` §14.2 | The 12 built-in palettes are transcribed hex-for-hex, and the comment-depth rainbow is copied verbatim. A colour palette is creative expression, and `08` decision 36 explicitly says to ship **new** palettes and **new** depth colours. | See **B1**, **B2**. |
| D2 | **Clean-room / trademark** (`06` R3: "no Reddit wordmark or Snoo anywhere"; the same logic applies to other marks) | `04c` §18.2 | Three of the reproduced built-in themes are named **Discord**, **Spotify** and **Spiderman** — two live third-party trademarks and one Marvel character — and are specified as shipping theme names. This is a 5.2.5 / trademark exposure the risk register does not cover. | Drop those names along with the palettes (B1). Add a line to `06` §5 R3's mitigation: "no third-party brand or character names on built-in themes." |
| D3 | **Clean-room — no reference to the original product's own communities** | `04c` §2.1 | The login `dest` is `https://www.reddit.com/r/HydraClient`. | See **B8**. |
| D4 | **Clean-room — product name must not survive in shipped copy** | `04b` §9.2 (twice), `04c` §20.2 hero title note | Literal `"Hydra"` appears inside quoted UI copy with a parenthetical instruction to substitute later. An implementer following the doc literally ships the wrong name. | See **B24**; apply the same substitution to `04c` §20.2's `"Your Hydra Journey"` (already flagged there, but make the quoted string itself `"Your APPNAME Journey"`). |
| D5 | **Pro paywall replaced by the new StoreKit 2 subscription** (`05`) | `04c` §15 row 7 | The settings row is labelled **"APPNAME Pro"**, carrying the removed tier's name into the new product. | See **B13**. |

**Checked and clean:** no AI features anywhere in `03`/`04a`/`04b`/`04c` (AI summaries, AI filters and
the hosted embedding/answer endpoints are all explicitly excluded, `04a` §1.2, `04c` preamble,
`03` §9.6). No push notifications (`04c` §4.1 is badge-only, lazily-authorised, explicitly
"no background polling, no background fetch, no push registration"). No iPad split-view UI
(`04a` §Scope note, `04b` header, `04c` header; `06` §1.3 sets `TARGETED_DEVICE_FAMILY = 1`).
No instruction anywhere to copy the original's code, and `04c` §19 / §21.3 correctly forbid reusing
its icon art and Guide prose.

---

## E. Overall assessment

These documents are unusually good. The gaps are overwhelmingly **consistency between normative
documents** rather than missing behaviour: the surveys were mined thoroughly, and almost every exact
string, threshold and menu list made it across. The failure mode is that `03`, `04a`, `04b`, `04c`
and `06` were each written against the surveys **in parallel**, so where a decision changed (drop the
prefs scrape, add the 429 handler, gate Stats, replace the theme set) only some of them were updated.

Estimated coverage of survey behaviour by the derived specs, per area:

| Area | Survey | Derived | Coverage | Dominant gap |
|---|---|---|---|---|
| Networking, auth, endpoints | `spec/02` §§1–3 | `03` §§1–5 | **~97 %** | Login `dest` + CSS injection disagree with `04c` (B8, B9) |
| Domain model & derivation rules | `spec/02` §4 | `03` §4 | **~97 %** | Gallery `s.mp4` drop (A58); poll rendering split (B17) |
| Pagination, filters, caches | `spec/02` §5 | `03` §6 | **~98 %** | Cursor-advance failure mode unstated (A57) |
| Persistence & settings keys | `spec/06` §11, `spec/09` §§1–2 | `03` §§7–8 | **~90 %** | Systemic key-name divergence from `04*` (B21); draft keys (B6) |
| Feeds & post cards | `spec/03` | `04a` §§2–11 | **~96 %** | Gate tags absent (A8–A12); vote-in-detail (B16) |
| Post detail & comments | `spec/04` | `04a` §§12–18 | **~95 %** | Continue-thread stub (B5); depth colours (B2) |
| Composers & drafts | `spec/04` §11 | `04a` §16.5 | **~93 %** | Draft keys (B6); type-switch (B7); no compose gate (A12) |
| Media viewer, video, gallery | `spec/05` | `04b` | **~96 %** | Gallery cap (B3); OG concurrency (B4); no downloads gate (A7) |
| Accounts, login, inbox, messages | `spec/07` §§1–3 | `04c` Parts I–II | **~95 %** | Prefs normalisation three-way split (B10); thread send path (A49) |
| User, search, subreddits, wiki | `spec/07` §§4–10 | `04c` Part III | **~96 %** | Hub partial-failure rule (A15) |
| Web views, links, incoming URLs | `spec/01` §§6, 17–19 | `04c` Part IV | **~85 %** | **Error screen entirely unspecified** (A1); cold-launch ordering (A53) |
| Settings tree | `spec/06` §§1–2, 4–10 | `04c` Part V | **~93 %** | Root row names (B14); settings search (A14); gate chrome (A13) |
| Themes & Theme Maker | `spec/06` §3 | `04c` §18 | **~99 % structural, 0 % compliant** | Ships the original's palettes against decision 36 (B1, D1, D2) |
| Stats | `spec/06` §8 | `04c` §20.2 | **~97 %** | Gating contradicts `05`/`06` (B12); divide-by-zero (A43) |
| Guide / Help | `spec/06` §12 | `04c` §21.3 | **~90 % of the wrong target** | Specs the full Guide where `06` wants a small Help section (B15) |
| App icons | `spec/06` §5 | `04c` §19 | **~95 %** | No `gate.appIcons` tag (A11) |
| Build plan, entitlements, plist | `spec/08` §6 | `06` §1.3 | **~70 %** | **Four required Info.plist / entitlement entries missing** (A3–A6) |

**Weighted overall: ~94 %.** Three things would take it to ~99 %:

1. **One reconciliation pass over the six contradictions that change shipped behaviour** — B1/B2
   (themes), B3 (gallery cap), B5 (continue-thread), B10 (prefs), B12 (Stats gating), B16
   (detail vote). Each is a single paragraph in one document.
2. **One mechanical pass adding the six missing `[GATE:]` tags** (A7–A12) plus the gate-chrome
   description (A13). Without it, Phase 8's "sweep applying every `[GATE:]` tag" is a no-op for six
   of the eleven gates and `06` item 337 cannot pass.
3. **Four lines in `06` §1.3** (A3–A6). These are the only true blockers in the set: the app will
   crash on first Save-to-Photos, crash on first image-post pick, fail every deep link, and the
   share extension will be unable to write its hand-off file.

The **highest-risk single item** is D1/D2: shipping twelve palettes copied from the original app,
three of them named after live third-party trademarks, is both the clean-room violation with the
clearest legal edge and the one that is cheapest to fix now and most expensive to fix after the
theme system is built against those exact tokens.

---

## Fix pass disposition

**Editor:** fix pass, 2026-09-17, run after `REVIEW-consistency.md`. Every row of sections A–D
above was re-verified against the **current** text of `00`, `02`–`08` before being actioned, because
the consistency pass had already resolved part of this audit and had renumbered or rewritten some of
the sections the proposed insertions named. Proposed text was adapted to the current section numbers,
to the canonical gate ids (`05` §4) and decision ids (`08` §1–§3), and to the clean-room rule — no
proposal was pasted verbatim where it would have carried the original app's names, palettes or
communities across.

**Totals: 87 applied · 45 already resolved by the consistency pass · 1 rejected.**
(133 findings: A = 62 / 9 / 1, B = 8 / 16 / 0, C = 15 / 17 / 0, D = 2 / 3 / 0.)

### A. Missing behaviors

| # | Verdict | What was done |
|---|---|---|
| A1 | applied | `04c` §11.3 written: `Route.unsupported(URL?)`, 48 pt bug glyph, the body copy from `spec/01` §17 with the product name substituted, the conditional underlined tappable raw URL handed to the external-link opener, the no-URL case, the static "Error" title. **Blocker closed.** |
| A2 | applied | `04c` §18.5 "Where attaching is offered": the paintbrush appears only for subreddits in a single `themeSharingSubreddits: Set<String>`; empty set = never shown (the shipping default). The original's three community names are **not** carried over. `04a` §16.5.1's `showCustomThemeOption` re-pointed at it; `07` §A gains item 13b. |
| A3 | applied | `06` §1.3 gained a normative Info.plist/entitlement table. **Blocker closed.** |
| A4 | applied | Same table. **Blocker closed.** |
| A5 | applied | Same table, with `CFBundleURLName` + `CFBundleURLSchemes = ["appname"]`. **Blocker closed.** |
| A6 | applied | Same table, on **both** targets, plus `ShareExtension.entitlements` added to `06` §1.2's tree and a paragraph under it. **Blocker closed.** |
| A7 | already resolved | `04b` §3.4, §7.4 and the §9.3 exposure table already carry `[GATE: gate.downloads]`. |
| A8 | already resolved | `04c` §16.1 already carries `[GATE: gate.gestures]`. |
| A9 | already resolved | `04c` §16.2 already carries `[GATE: gate.sortMemory]`. |
| A10 | applied | `04b` §7.3 gained `[GATE: gate.videoAutoplay]` covering both FABs and their mirrored Appearance rows; §16.3's gate table updated. This was the last of the eleven gates with no tag in `04b`/`04c`. |
| A11 | already resolved | `04c` §19 already carries `[GATE: gate.appIcons]`. |
| A12 | already resolved | `04a` §16.5 already carries `[GATE: gate.compose]`. |
| A13 | applied | New normative section **`05` §5.11** "What a gated affordance looks like": the `PlusBadge` capsule spec, five rules (disabled-looking but tappable; never hidden; current values stay visible and keep working; composed flows gate at the final committing control; menus and swipe actions follow the same contract), the VoiceOver rule and the unknown-window rule. Pointers added from `02` §13.3, `04c` §14 and `06` item 311. |
| A14 | applied | `04c` §15 rewritten: the bar is "Search settings", typing filters rows in place against labels + destination section titles, matches render flat with the parent screen as subtitle, submit falls through to Help search, no "ask a question" box. `06` item 275 rewritten to match (inventory item 275 asks for both halves). |
| A15 | applied | `04a` §11 "Partial-failure rule": a multireddit fetch failure renders the hub without that section and never blanks the others or raises an access-failure screen. |
| A16 | applied | `04c` §20.2: `statNum(_:precision:unit:)` specified alongside `prettyNum`, with the pluralise-on-rendered-value rule and an explicit "keep them separate". |
| A17 | applied | `02` §5.4 "Content insets under the bar": the beneath-the-bar and above-the-bar allow-lists, plus the rule that a non-scrolling screen belongs above. |
| A18 | applied | `04a` §3.1: the feed is frozen, not torn down — stores, cursors and flags retained, only video focus released, no re-fetch on return, cross-screen mutations arrive via `FeedMutationBus`. |
| A19 | applied | `04a` §7.1 Bands: an **unset** long slot falls back to the same direction's short action; `Disabled` is explicit and never falls back. |
| A20 | applied | `04c` §18.4: only the 6-digit form round-trips through the sliders; 3- and 8-digit values are stored verbatim and read as black until re-entered. |
| A21 | applied | `04c` §14: `.confirmationDialog` / `.contextMenu` / `.alert` use the **system scrim** only; no custom dimming layer. |
| A22 | applied | `04b` §2.2 (one page ahead/behind vertically, nothing horizontally) and §10.3 (two viewport heights of grid cells). |
| A23 | applied | `03` §1.2: `isOK` is `(200..<300)`; `CancellationError` is never surfaced; `.timedOut` and `.offline` are never collapsed. |
| A24 | already resolved | `04a` §4.11 already says the card renders `post.timeSince` verbatim and appends nothing. |
| A25 | applied | `04a` §14.2: base body leading padding stated as **15 pt**, overridden to 10 by `displayInList`. |
| A26 | applied | `04a` §14.1 "Performance contract": 2 000 nodes flatten <100 ms, first screen <1 s, memory independent of thread size, collapse is an array splice — a Phase 3 gate measurement. |
| A27 | applied | `04c` §16.2: the clear action removes every entry under the matching key prefix (both post keys), zeroes the count in place, no refetch, **no confirmation**. |
| A28 | applied | `04a` §11 Trending bullet: the same two exclusions as the Search tab — already-subscribed subreddits and any subreddit literally named `"Home"`. |
| A29 | already resolved | `04a` §11 already states favourites render in stored insertion order and Subscriber in the data layer's locale-aware order. |
| A30 | applied | `04a` §9: the focus key is `VideoSource.key` = (pre-resolution playback URL, gallery index), identical to the registry and resume-position keys; never the post id. |
| A31 | applied | `04a` §9: only `videos[0]` supplies the focus key and poster; the rest never play inline. |
| A32 | applied | `04a` §2.1 step 1: an access failure short-circuits and is **not** reported; any other throw sets `loadFailed`, clears the spinner and is captured with the route as context. |
| A33 | applied | `04a` §7.3: one trie serves both the post and the comment haystack; there is no separate comment filter list. |
| A34 | applied | `03` §7.3: if the seen write throws, the change event is **not** published. |
| A35 | already resolved | `04b` §6.5 already carries the starvation rationale on the cooldown row. |
| A36 | applied | `04b` §3.1: the feed strip, the gallery grid and the viewer must share **one** `ImagePipeline` instance and cache — the placeholder guarantee depends on it. |
| A37 | applied | `04b` §1.2 carve-out: animated GIF *images* animate unconditionally **except** in the Gallery Mode grid, where they render as a still first frame and resume in the viewer. |
| A38 | applied | `04a` §4.5 footnote: the effective data mode is `.lowData` until the first `NWPathMonitor` update, so the first paint may show one image. |
| A39 | applied | `04c` §15: footer is centred, non-interactive, `theme.verySubtleText`, 12 pt, 16 pt above the list edge — and two lines, not three. |
| A40 | applied | `04c` §16.3: the override rows are informational only — not tappable, no swipe action, not removable here. |
| A41 | applied | `04c` §18.1: deleting a non-active theme changes nothing else — no re-resolution, no repaint, selection untouched. |
| A42 | applied | `04c` §18.3: the reset-on-disappear does not undo the save; the active theme resolves from `custom_themes`, never from the draft. |
| A43 | applied | `04c` §20.2: `daysSinceTrackingStarted = max(1, …)`, with the install-day consequence spelled out. **Divide-by-zero closed.** |
| A44 | applied | `04c` §20.2: Explorer counts `COUNT(*)` over `subreddit_visits`, not `SUM(count)`. |
| A45 | applied | `04c` §20.4: an OS memory-pressure warning clears the **in-memory** cache independently of the button; the disk cache and the readout are untouched. |
| A46 | applied | `04c` §21.3: one rewrite path serves in-article `appname://` links **and** Help deep links opened from a settings row; `06` item 318 re-pointed at it. |
| A47 | applied | `04c` §1.2: selecting `"Logged Out"` logs out but leaves every account in the list and in the Keychain. |
| A48 | applied | `04c` §4.3: inbox swipe actions are **fixed** and unaffected by the swipe settings, so `gate.gestures` never applies there. |
| A49 | applied | `04c` §5: after a successful send the thread **refetches** (I3) via the parent reload callback, then auto-scrolls; nothing is inserted optimistically. |
| A50 | applied | `04c` §6.4: in the split state the header renders normally and only the **content area** is replaced by the access-failure view; the screen is never blanked. |
| A51 | applied | `04c` §8: an empty rules list does not suppress item 3 — the description still renders beneath the empty header. |
| A52 | applied | `04a` §3.3: a legitimately-empty multireddit renders as a normal empty feed with header, switcher title, sort control and "…" menu, and never reaches `AccessFailureView`. |
| A53 | applied | `04c` §13: intake runs only after the tab router exists and `loginInitialized` is true; earlier URLs are **queued, never dropped**, and flushed in order. |
| A54 | applied | `04c` §13: the clipboard guard is held from presenting the alert until the user answers it, then released; a foreground while it is up is a no-op. |
| A55 | applied | `04a` §2.2: after Cancel the store sets `fullyLoaded` and re-issues nothing on the next `onAppear`; only pull-to-refresh re-presents the interstitial. |
| A56 | rejected | **Rejected: moot.** The global-vs-per-account throttle it describes belongs to the `/prefs` normalisation, which `08` #26 drops entirely — there is no timestamp, no throttle key and no `A1`/`A2` endpoint left for the consequence to apply to. `04c` §3.4 already states the replacement banner is one-time **per account**. |
| A57 | applied | `04a` §2.1 step 2b: the cursor advances on **every** attempt, including one whose items are all filtered out, with the "same page five times" failure mode named. |
| A58 | applied | `04b` §1.1 rule 3 amended: an entry is dropped when it lacks a `p` array **or** `s.mp4` (`03` §4.4 already had both). |
| A59 | applied | `03` §4.16 gained a closing paragraph naming the two helpers it does not own — Stats' `statNum` (`04c` §20.2) and the composer pipeline (`04a` §18.2) — adapted, because the one-pipeline decision deleted the `>\s+<` collapse the audit's text assumed. |
| A60 | applied | `03` §6.4: a refresh re-uses cached OpenGraph data for any post id already present; only genuinely new posts issue a request. |
| A61 | already resolved | `04b` §9.2 already orders the failure row "dismiss the preparing modal, then alert". |
| A62 | applied | `03` §7.6: the video-cache flag is cleared after the attempt **whether or not it succeeded**, so a failing clear cannot wedge every launch. |
| A63 | applied | `04c` §14: a conditional row is **removed**, never disabled, with separators computed from the rendered collection; the one exception is a gated row, which stays badged. |
| A64 | applied | `04c` §7.2 and §7.1: `clearOnSearch` and `searchOnBlur` named as flags on one shared `DesignSystem.SearchBar`. |
| A65 | applied | `04c` §22.3 step 3: counter increments that fire before the database is open are buffered and flushed as one atomic upsert per key — never dropped, never double-counted. |
| A66 | applied | `04b` §10.3 and `04c` §7.1 both gained the zero-result rule (empty list, spinner cleared, no message). |
| A67 | applied | `04a` §16.1 item 7: the copy spelled out — `.alert("This post has been \(status)")` with the raw `"locked"` / `"archived"` string, checked **before** the sheet opens. |
| A68 | applied | `04c` §12: the unlock/re-lock pair is owned by `02` §5.11; this row only names the two surfaces that use it. |
| A69 | applied | `04c` §16.4 footnote: the original's two sources disagree; `false` is authoritative and why. |
| A70 | applied | `06` area C item **60** added (hold ~1 s → move mode, 10 snap points, release persists to `ui.scrollToNextButtonPosition`), which is exactly inventory item 60. |
| A71 | applied | `03` §9.8 closing lines: the table is the exhaustive host set, any host not listed is a bug, and no owner-operated host appears in it by decision. |
| A72 | applied | `04a` §7.2 item 7 strengthened: `Share` is the permalink, and there is **no** media share/save anywhere in a post's long-press menu — see `04b` §9.3. |

### B. Contradictions between normative documents

| # | Verdict | What was done |
|---|---|---|
| B1 | applied | **Applied and made concrete.** The palette tables were already deleted by the consistency pass; `04c` §18.2 is now a full contract — **12** built-in themes (matching the original catalogue's slot count), at least 4 light and at least 4 dark, all 20 roles × 4 renditions, both per-theme flags, the 6-colour depth cycle in new colours, **five naming rules** (no third-party brand/character names, nothing from the original's catalogue, nothing evoking the original's name, one-or-two-word descriptive names, unique case-insensitively) and the WCAG/opacity/colour-vision authoring constraints. The count change 6–8 → 12 was propagated to `02` §8.5, `06` Phase 7 + item 234, `07` §A 13a and the assumed-decisions block, and `08` #36. |
| B2 | applied | **Applied.** `04a` §14.2 still carried the original's six hex values; replaced with "the six `theme.commentDepthColors` values defined in `04c` §18.2", new colours, no hex anywhere in the set. `04a` §21.2 gained the `theme-count` row. |
| B3 | already resolved | Already resolved — `04b` §10.1, `05` §4/§5.9, `06` item 26 and `02` §10.6 all say 100 items with an inline "Continue with Plus" footer. |
| B4 | already resolved | Already resolved — 6 concurrent in `04b` §11, `03` §9.4/§11.1, `06` Phase 4 and item 191. |
| B5 | already resolved | Already resolved — `04a` §14.5 renders "Continue this thread →" and pushes the permalink. |
| B6 | applied | **Applied (residue).** `04a` §16.5.3 and `04c` §5.1/§5.2 were already on `03` §7.5's formats, but `06` Phase 6 still listed `newCommentDraft-<parentId>`; rewritten to cite §7.5's six formats verbatim. No `newPostDraft` / `newMessageDraft` / `replyToMessageDraft` spelling survives anywhere. |
| B7 | applied | **Applied (residue).** `03` §7.5 and `04a` §16.5.3 agree on "separate field per kind", but `03` §14.1's summary row still said "clear the composer body"; rewritten to match. |
| B8 | already resolved | Already resolved — `dest=https://www.reddit.com/` in `03` §5.3 and `04c` §2.1. |
| B9 | already resolved | Already resolved — `04c` §2.1 injects nothing. |
| B10 | already resolved | Already resolved — `04c` §3.4 is the disclosed-banner replacement; `06` item 114c is CUT. |
| B11 | already resolved | Already resolved — `""` in `03` §8.1 and `04c` §16.5. |
| B12 | already resolved | Already resolved — `04c` §20.2 carries `[GATE: gate.stats]` with the honest locked screen. |
| B13 | already resolved | Already resolved — `04c` §15 row 7 is "APPNAME Plus" and is marked not-a-gate. |
| B14 | applied | **Applied.** `04c` §15 rows 1/12/13 renamed **Help** / **What's New** / **Feedback**; row 13 now opens an owner-configured `feedbackDestinationURL` through the external-link opener, with **no default and no third-party subreddit** (row hidden when unset). `SettingsRoute.guide(GuideQuery)` → `.help(HelpQuery)`; §21.3 retitled "Help"; §21.2 and §21.1 re-pointed. `06` items 307/308/309 rewritten to the same order and names; `07`'s assumed-decisions block states them. |
| B15 | already resolved | Already resolved — `04c` §21.3 is FTS5 + BM25, `k = 5`, no vectors, no answer card, 10–14 articles; the heading rename came with B14. **Sub-proposal rejected:** recording the embedding approach as "a future option" would contradict `02` §11.7, `03` §9.6 and `07`'s guardrail, which forbid vectors outright. |
| B16 | already resolved | Already resolved — `04a` §7.4 patches the feed via `FeedMutationBus`; `06` item 164 agrees. |
| B17 | applied | **Applied.** `04a` §4.9 still specified the fake Vote button. Rewritten to `03` §4.13 / `08` #20: no Vote button, no selection state; per-option bars, counts and the user's own selection when Reddit supplies `vote_count`, otherwise inert option rows plus the total; one line reading "Voting on polls isn't supported." and an optional ends-in line. |
| B18 | already resolved | Already resolved — no restart alert in `04a` §7.7 or `04c` §16.3. |
| B19 | already resolved | Already resolved — `04c` §20.3 reads the toggle reactively, no alert. |
| B20 | already resolved | Already resolved — `04a` §14.2/§18 state the `raw_json=1` consequence and no decoding step. |
| B21 | already resolved | Already resolved, **and verified**: 47 keys sampled across `04a` §19, `04b` §13 and `04c` §§16–20 against `03` §8.1; every one resolves to §8.1 as either the canonical namespaced key or its "Legacy key" column, and every namespaced key used in `04*` prose exists in §8.1. No stragglers found. Draft-key formats likewise (see B6). |
| B22 | applied | **Applied.** `04c` §4.3 and §5 rendered "the reply's HTML" / "the message HTML" against `03` §4.11, which models markdown only. Changed to the body **markdown** rendered by the shared renderer, citing `03` §4.11. |
| B23 | applied | **Applied.** `searchOnBlur` (and `clearOnSearch`) named in both `04c` §7.1 and §7.2 as flags on one shared primitive. |
| B24 | already resolved | Already resolved — `04b` §9.2 reads "Allow APPNAME …" with a Settings deep link and no parenthetical. |

### C. Checklist pointer problems in `06` §4

| # | Verdict | What was done |
|---|---|---|
| C1 | already resolved | Already resolved — `04a` §§7.3, 7.6, 7.7, 7.8 and `04c` §16.3 all carry `[GATE: gate.filters]`. |
| C2 | already resolved | Already resolved (B18). |
| C3 | already resolved | Already resolved (B3). |
| C4 | already resolved | Already resolved for `04a` §9; the `04b` half closed by **A10**. |
| C5 | already resolved | Already resolved — per-kind fields and per-kind draft keys are specified in `04a` §16.5.3 and `03` §7.5; `06` item 40 already cites §7.5. |
| C6 | already resolved | Already resolved (B5). |
| C7 | already resolved | Already resolved; the item number is now **64** after the area-C renumbering (C30). |
| C8 | already resolved | Already resolved; the item number is now **66** after the renumbering. |
| C9 | already resolved | Already resolved (A7). |
| C10 | already resolved | Already resolved — item 114c is CUT and `04c` §3.4 / `03` §5.7 agree. |
| C11 | applied | **Applied.** Item 152 re-pointed at `04a` §7.2 item 4 / §7.8 and keeps its gate. |
| C12 | already resolved | Already resolved (B16). |
| C13 | applied | **Applied.** Area J's heading and items 169/172/173 re-pointed at `04c` §6.1 and `04a` §3.4. |
| C14 | applied | **Applied.** Item 187 re-pointed at `03` §12.4 with `04c` §16.4 named as the informational row. |
| C15 | applied | **Applied.** Area L's heading and items 190–192 re-pointed at `04b` §11 and `03` §9.4; item 191 gained the 6-concurrent cap. |
| C16 | applied | **Applied.** Item 194 and the area heading now name `02` §5.11 as the owner of orientation. |
| C17 | applied | **Applied** via B1. |
| C18 | already resolved | Already resolved — no `[GATE: premium-themes]` survives; `05` §4.1 records why built-in themes are not a gate. |
| C19 | applied | **Applied** via B2 — `04c` §18.2 is structural and `04a` §14.2 no longer carries the original's values. |
| C20 | applied | **Applied** via A14. |
| C21 | already resolved | Already resolved (B12); items 288 and 297a agree with `04c` §20.2. |
| C22 | already resolved | Already resolved (B19). |
| C23 | already resolved | Already resolved (B11). |
| C24 | applied | **Applied** via B14 — one order, in `04c` §15 and `06` item 307. |
| C25 | applied | **Applied** via B14. |
| C26 | applied | **Applied** via A13 — item 311 now points at `05` §5.11. |
| C27 | already resolved | Already resolved — `04c` §19 carries `[GATE: gate.appIcons]`; item 316 is correctly specified. |
| C28 | applied | **Applied** — `04c` §21.3 was already FTS5 (B15); item 318's "reachable by deep link" now has a spec (A46) and the pointer, and item 317 names the Help label. |
| C29 | already resolved | Already resolved — **all eleven** gate ids are now tagged in `04a`/`04b`/`04c` (the last, `gate.videoAutoplay` in `04b`, closed by A10). Verified programmatically. |
| C30 | applied | **Applied.** Area C renumbered so item *N* is inventory item *N*: 59 = the floating button, 60 = repositioning it, 61–73 = the inventory's 61–73, and the net-new continue-thread item becomes **73a**. `06` §4's preamble now states the 1:1 rule and the lettered-suffix convention for net-new items, so the "items 1–327" claim is true. No other document cites a `06` item number by position. |
| C31 | applied | **Applied** — item 60 added (see A70). |
| C32 | applied | **Applied.** `06` §3 gained step 5, the StoreKit-configuration matrix, named as a Phase 8 gate step. |

### D. Product-decision violations

| # | Verdict | What was done |
|---|---|---|
| D1 | applied | **Applied.** `04c` §18.2 was already palette-free; `04a` §14.2's copied depth rainbow was not, and is now gone (B2). No hex value from the original survives anywhere in `02`–`08`. |
| D2 | applied | **Applied.** The three trademarked theme names went with the palettes; `04c` §18.2 now carries explicit naming rules, and `06` §5 R3's mitigation gained "no third-party brand or character name on a built-in theme, an app icon or any other shipped asset". |
| D3 | already resolved | Already resolved — the login `dest` is Reddit's home page. |
| D4 | already resolved | Already resolved — `04b` §9.2 and `04c` §20.2 use `APPNAME` in the quoted strings, with no substitution instruction left. |
| D5 | already resolved | Already resolved — the row is "APPNAME Plus"; `05` §6.4's position statement was additionally corrected to match `04c` §15 row 7. |

### Beyond the audit: defects found while verifying, and fixed

These were not in sections A–D. They are contradictions or errors the re-verification turned up, and
they are listed so the record of this pass is complete.

| # | Defect | Fix |
|---|---|---|
| X1 | **Feed-card counts.** `04a` §4.11 and `03` §4.16 both said the feed card prints **raw** integers, against `08` #33 (`number-format-parity`, "abbreviate the feed card's vote/comment counts") and `06` item 163 | Both rewritten to abbreviate through `prettyNum`. `08` wins per its own §4 rule 1 |
| X2 | **Refresh alerts.** `04a` §15.1 and `04c` §17.2 still popped `"Existing pages may need to be refreshed for this change to take effect."` on the two comment toggles, against `06` items 57 and 271 and `07`'s "no restart alerts" guardrail | Deleted from both; both settings are read reactively and every row on `04c` §17.2 is now silent |
| X3 | **Colour-role count.** Every document said "19 colour roles", but `spec/06` §3.3's own palette table, `02` §8.1's token list and `04c` §18.3's `CustomTheme` struct all enumerate **twenty** (3 + 3 + 3 + 2 + 9) | Corrected to **20** in `02` §3.1/§8.1/§8.4/§8.5a, `04c` §18.2/§18.3/§18.5, `06` Phase 0 + item 243, `07` §A 13a and `08` #36, with a one-line note in `02` §8.1 and `04c` §18.2 recording that the survey's "19" is an off-by-one against its own table |
| X4 | **Plus row position.** `05` §6.4 placed the Settings → APPNAME Plus row "below Appearance, above App Icon"; `04c` §15 has it at row 7, below Account | `05` §6.4 corrected to row 7 of 13, matching `04c` §15 and `06` item 307 |
| X5 | **Background modes.** `02` §14.7 declared the `audio` background mode "so a future PiP is possible", while `08` #52 and `04b` §7.4 tear every player down on background | `02` §14.7 rewritten: **no `UIBackgroundModes` at all**, with the reasoning and what adding PiP would cost. `06` §1.3's "deliberately absent" table says the same |
| X6 | **Unnamed third-party destinations.** `04c` §18.1's "Explore Community Themes" button and §15's feedback row pointed at unspecified subreddits | Both are now single owner-configured constants (`themeCommunityURL`, `feedbackDestinationURL`) opened through the external-link opener, with **no default**; an unset constant means the control is not rendered. `07` §A gained item **13b** so the owner is asked for them (with `themeSharingSubreddits`, A2) |
| X7 | **Stale markdown test expectations.** `04a` §20.11 still asserted `orderedListNumbersIgnoreStartAttribute`, `anchorWrappingImageSuppressed` and `whitespaceTextNodesStripped`, all of which contradict §18.1's AST-based rendering table | Rewritten to assert the specified behaviour (honour `start`, render the wrapped image, no whitespace-stripping pass needed) |
| X8 | **Ambiguous survey references.** The `04*` traceability tables cite survey files as `` `02` §4.1 ``, `` `05-media.md` §7.1 `` and so on, which reads as a reference to `02-architecture.md` / `05-monetization.md` | All 35 rows in the three "Source spec → this document" tables now carry the `spec/` prefix, which is what let check (b) below run clean |

### Owner instructions carried through this pass

Two of the fixes above change a value the register previously fixed, on the owner's instruction, and
were propagated everywhere rather than left as a local edit:

1. **Twelve built-in themes, not 6–8** (`08` #36 rewritten; `02` §8.5, `04c` §18.2, `06` Phase 7 +
   item 234, `07` §A 13a and `07`'s assumed-decisions block all updated). The kickoff item that makes
   authoring them a Phase 0 blocker is **kept**, and now says explicitly that the migration bridge
   does not remove it.
2. **The theme migration bridge** (`08` #35 rewritten; new `02` §8.5a; `04c` §18.2 and §18.5; `07`'s
   kickoff and assumed-decisions blocks). `APPNAME` **emits** only `::appname-theme::<base64url>`; its
   **importer** additionally accepts the legacy `::hydra-theme-import::{…}` sentinel through a
   brace-balanced scan and the same `CustomTheme` decoder, so the owner can move their own saved
   themes across with the old app's own share feature. Import-only recognition is not code reuse, and
   the legacy string appears in exactly one place in the codebase — the import scanner's alternation —
   and in no `APPNAME` screen, no `APPNAME` output and no stored theme.

### Programmatic checks

All five were scripted and all five are green on the final text of `00`, `02`–`08`.

| # | Check | Result |
|---|---|---|
| a | Every `[GATE: …]` names one of the **11** canonical ids in `05` §4, and every `[DECISION: …]` names a numbered entry in `08` §1, a bug id in §2 or a drift row in §3 | **PASS.** 64 gate tags, **11/11** distinct ids used — every gate is now tagged somewhere, which `06` item 337 and the Phase 8 sweep require. 236 decision tags over 93 distinct ids, all resolving; `08` §1 holds exactly 95 numbered entries, 1–95, no gaps or duplicates. Metalinguistic mentions (`` `[GATE: gate.*]` ``, `` `[DECISION: <id>]` ``) are excluded by payload, not by backticks |
| b | Every `§` cross-reference from one of `02`–`08` to another resolves to a heading that exists | **PASS, 391 references checked, 0 dangling.** The checker parses every numbered heading per file and matches `04a §12.3`-style references, accepting a parent reference such as `§9` when only `§9.1`–`§9.4` exist. 14 apparent failures were traceability rows citing *survey* files by bare number; those rows were disambiguated with a `spec/` prefix (X8) rather than suppressed in the checker |
| c | Exactly one H1 per file, and no skipped heading levels | **PASS.** 10/10 files have exactly one H1; no `###` follows a `#`. The new `04c` §11.3 and `05` §5.11 sit at the right level for their parents |
| d | No `TODO` / `TBD` / `FIXME` and no `…]` placeholder tags in normative text | **PASS.** The only surviving `TODO` strings are the lint rule that bans them (`06` §1.5), the guardrail that repeats it (`07`), and `PROGRESS.md`'s own status vocabulary — all of which are *about* the token. Zero `[GATE: x]` / `[GATE:]` / `[DECISION: …]`-style placeholders |
| e | The original app's name never used as the **new** app's identity | **PASS.** 22 occurrences remain across the set, every one of them referring to the original app (`08` §2/§3 evidence rows, `05` §1.4's "do not use Pro", `07`'s "must not evoke Hydra"), to a legacy key name the settings table records as removed (`useHydraServer`, `lastAskedToSubscribeToHydraClient-<userId>`), to the legacy import sentinel `::hydra-theme-import::`, or to the legacy `hydra://` scheme in a drift row. No shipped string, no theme name, no destination and no identifier in `APPNAME`'s own surface carries it |

Two further checks were run because this pass touched a lot of tables and numbering:

| # | Check | Result |
|---|---|---|
| f | Every markdown table has a consistent column count (pipes inside code spans and `\|` escapes excluded) | **PASS**, 0 mismatches across all ten files |
| g | `06` §4 area C maps 1:1 onto `spec/08` §1's inventory numbers | **PASS.** Items 55–74 now line up item-for-item; the two genuinely new behaviours carry lettered suffixes (`73a`) so no base number shifts, and `06` §4's preamble states the convention |

### Known residual work (not defects — deliverables)

Unchanged in kind from `REVIEW-consistency.md` §4, restated with this pass's numbers:

- **The 12 built-in palettes still have to be authored** — `04c` §18.2 is now a complete contract
  (count, split, 20 roles × 4 renditions, two flags, naming rules, WCAG constraints) but contains no
  colours, and cannot, per `[DECISION: theme-count]`. `07` §A item 13a is the kickoff blocker.
- **The Help corpus still has to be written** — 10–14 articles under `04c` §21.3's eleven categories
  (`guide-prose-rewrite`).
- **Three owner-configured constants have no value yet** — `feedbackDestinationURL`,
  `themeCommunityURL`, `themeSharingSubreddits` (`07` §A item 13b). Each is specified to hide its own
  control when unset, so the build is not blocked on them.
