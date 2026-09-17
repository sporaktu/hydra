# 05 — Monetization: `APPNAME Plus` (StoreKit 2)

Status: design spec, authoritative for the rewrite.
Audience: the AI coding agent building the app, and the owner approving the plan.
Companion docs: `02-architecture.md` (Entitlements seam, packages), `03-data-and-networking.md`
(no server, keyless Reddit access), `04a-feeds-posts-comments.md` / `04b-media.md` /
`04c-accounts-inbox-search-subs-settings.md` (per-screen `[GATE: …]` tags),
`06-build-plan-and-acceptance.md` (Phase 8), `08-decisions-and-drift.md` (owner decisions).

---

## 1. Goals and constraints

### 1.1 What the owner asked for

> "Monetize cheaply: roughly $1/month, most features paid."

That single sentence carries three design consequences:

1. **Price is a rounding error to the user.** At $0.99/month the purchase decision must be
   frictionless and near-impulse. That means: no hard wall on first launch, no interstitials,
   no countdown timers, no dark patterns. The paywall appears *only* when the user reaches for
   something it protects, and the free tier must be good enough that the user is still happy if
   they never pay.
2. **"Most features" cannot mean "most of Reddit."** The app's core value — reading Reddit —
   comes from Reddit, not from us. Gating reading would be both user-hostile and a review risk
   (see §7). What we can legitimately sell is *our client's* power features: multiple accounts,
   theming, gesture customization, filtering, downloads, stats, alternate icons.
3. **Revenue expectations should be set correctly.** After the App Store Small Business Program
   (15% commission for developers under $1M/year proceeds — the owner will qualify), $0.99/month
   nets roughly **$0.84**, and a $9.99/year plan nets roughly **$8.49**. This is a
   "pays-for-the-developer-account-and-a-coffee" tier, not a business. Design accordingly: no
   analytics vendor, no backend, no support burden.

### 1.2 Cost structure the design must respect

The rewrite inherits Hydra's **keyless** access model (spec/02 §0): no Reddit OAuth app, no API
key, no `oauth.reddit.com`, cookie + `X-Modhash` auth against `www.reddit.com`. Combined with the
owner's removal of AI and push, this means:

| Cost centre | Status in the rewrite | Consequence for monetization |
|---|---|---|
| Reddit API | $0 — public web JSON endpoints, cookie session | No per-user marginal cost |
| Own backend | **None.** The AI embedding / Q&A endpoints (`api.hydraapp.io`) and the self-hosted-server setting are dropped (`[DECISION: self-hosted-server-row]`) | No server to validate receipts against → on-device verification only |
| Push infrastructure | **None** (`[DECISION: push-removed]`) | No APNs certs, no notification service |
| AI inference | **None** (`[DECISION: ai-removed]`) | No token costs, so no usage-based tier is needed |
| Crash reporting | Optional Sentry free tier (`[DECISION: sentry-or-not]`) | Fixed, trivial |
| Apple Developer Program | $99/year | The subscription's only real break-even target: ~10 monthly subscribers |

Because marginal cost per user is **zero**, there is no economic reason to gate volume (requests,
posts read, comments loaded). Gate *capabilities*, never *quantity of Reddit content*. The single
exception inherited from the original app — a 100-item cap on Gallery Mode — is kept only because
it is a pleasant, legible free-tier demo of a paid feature, not because it saves anything.

### 1.3 Apple's rules that shape the design

- **Guideline 3.1.1 (In-App Purchase).** Unlocking features or functionality within the app must
  use IAP. There is no alternative payment path, no "buy on our website" link, no Patreon link,
  no crypto, no tip jar outside IAP. The app must contain **zero** references to purchasing
  outside the App Store.
- **Guideline 3.1.3(a) "Reader" apps — NOT applicable.** Reader apps sell access to *previously
  purchased* magazines, newspapers, books, audio, video or cloud storage. A third-party Reddit
  client selling its own client features is not a reader app, so the External Link Account
  Entitlement and the "no IAP required" carve-out are unavailable. Do not attempt to use them.
- **Content vs functionality.** We are gating *our* functionality. We must not gate, hide or
  degrade content the user's own Reddit account already entitles them to: their subscriptions,
  their NSFW setting, their saved items, their messages. Concretely: **never** gate reading a
  feed, opening a post, reading comments, voting, saving, subscribing, searching, or reading the
  inbox. `[GATE: …]` tags never appear on those paths in the `04*` docs.
- **Guideline 3.1.2 (Subscriptions).** Auto-renewable subscriptions must disclose title, length,
  price per period, and what the subscription provides, adjacent to the purchase control, plus
  functional links to Terms of Use (EULA) and Privacy Policy, plus a Restore control.
- **Guideline 5.1.1(iv)** — the app must not require the user to sign in (to Reddit) to use its
  non-account-based functionality, and must not require an account to browse. Logged-out browsing
  stays fully supported and fully free.

### 1.4 Naming

Product surface name is the placeholder **`APPNAME Plus`** throughout (`[DECISION: app-name]`).
Do not use "Pro" — the original app's paid tier was called Hydra Pro, and the clean-room rule
(`[DECISION: pro-removed]`) means we neither reuse its name, its feature list as marketing copy,
nor its promotional artwork. "Plus" also reads as additive rather than as "the real version",
which matches the soft-gate philosophy.

---

## 2. Product catalog and App Store Connect setup

### 2.1 Subscription group

One auto-renewable subscription group. One group means Apple handles upgrade/downgrade/crossgrade
proration automatically, the introductory offer is once-per-group per Apple ID, and
`SubscriptionStoreView(groupID:)` can render the whole catalogue with no custom plumbing.

| Field | Value |
|---|---|
| Group reference name | `APPNAME Plus` |
| Group display name (localized, user-visible) | `APPNAME Plus` |
| App-level entitlement identifier used in code | `plus` |
| Number of levels | 1 (both products at the same service level — they differ only in duration) |

### 2.2 Products

| Product ID | Type | Duration | Tier / price (USD) | Level | Family Sharing | Intro offer |
|---|---|---|---|---|---|---|
| `com.OWNER.appname.plus.monthly` | Auto-renewable | 1 month | $0.99 | 1 | **On** | 7-day free trial, new subscribers only |
| `com.OWNER.appname.plus.yearly` | Auto-renewable | 1 year | $9.99 | 1 | **On** | 7-day free trial, new subscribers only |

Rationale for each choice:

- **$0.99 monthly** is the owner's stated target and the lowest non-trivial tier. It is also the
  price point at which "is this worth it?" stops being a real question for anyone who uses the app
  daily.
- **$9.99 yearly** is ~16% off (10 months for 12). A steeper discount is not needed at this price;
  the point of the annual plan is to reduce churn and payment-failure churn, not to maximise ARPU.
  Annual also survives the "I forgot I was paying $0.99" cancellation reflex better than monthly.
- **7-day free trial** (introductory offer, "Free Trial", duration 1 week, on both products,
  eligible once per subscription group per Apple ID). Seven days is long enough to hit a weekend,
  short enough that the trial→paid conversion decision is still connected to the install. The trial
  is offered at the *first* paywall the user sees, so the paywall's CTA reads
  "Try free for 7 days" rather than "Subscribe".
  - Apple grants group-level trial eligibility automatically; query
    `Product.SubscriptionInfo.isEligibleForIntroOffer(for: groupID)` before composing CTA copy so
    an ineligible returning subscriber is never shown "Try free".
- **Family Sharing: on.** At $0.99 there is nothing to protect and family sharing is a purchase
  motivator. Note the one behavioural consequence: with Family Sharing enabled, transactions can
  arrive with `Transaction.ownershipType == .familyShared`, and the entitlement can be revoked
  when the organizer leaves the family — the `Transaction.updates` listener (§4.3) handles this
  for free as long as the code never caches "subscribed forever".
- **Offer codes / promo codes:** create none for v1. (`[DECISION: monetization-model]` covers
  whether the owner wants a lifetime unlock; the default answer is no — see §2.5.)

### 2.3 Localized metadata required per product

Apple requires, per product, per localization (English only for v1):

| Field | Monthly | Yearly |
|---|---|---|
| Display name | `APPNAME Plus (Monthly)` | `APPNAME Plus (Yearly)` |
| Description | Unlocks every APPNAME Plus feature: multiple Reddit accounts, the theme editor, custom swipe gestures, keyword and subreddit filters, unlimited gallery browsing, media downloads, usage stats, and alternate app icons. | Same, plus: Billed once a year. |
| Review screenshot | A capture of the in-app paywall sheet (required; upload before submitting) | Same |
| Review notes | "Subscription unlocks optional client features only. All Reddit browsing, voting, commenting and messaging are free and require no purchase. Test account not required — the app browses Reddit logged out." | Same |

### 2.4 App Store Connect setup checklist (human, once)

1. Create the app record with bundle id `com.OWNER.appname` (`[DECISION: bundle-id]`).
2. **Agreements, Tax, and Banking** → Paid Apps agreement active; banking + tax forms complete.
   IAP products cannot leave "Missing Metadata" without this.
3. Enroll in the **App Store Small Business Program** (Business → Small Business Program). Approval
   takes effect the month after acceptance; commission drops 30% → 15%.
4. Create subscription group `APPNAME Plus`; add the two products above with the IDs exactly as
   written (the code hard-codes them).
5. For each product: set price, add localization, upload the paywall review screenshot.
6. Add the **7-day Free Trial** introductory offer to both products (Subscription Prices →
   Introductory Offers), territory = all, eligibility = new subscribers.
7. **Enable Billing Grace Period** (App Store Connect → Subscriptions → Billing Grace Period → On,
   16 days for monthly / 16 days for annual is the Apple-recommended default). This is what keeps a
   paying user from losing features because a card expired.
8. Set the **subscription group display name** and, optionally, the group-level marketing artwork
   (1024×1024) — `SubscriptionStoreView` will use it if present.
9. App Information → **EULA**: use Apple's standard EULA unless the owner has a custom one; if a
   custom one is used, its URL must also be reachable from inside the app (§6.4).
10. App Privacy → complete the nutrition label as specified in §8.
11. Create a **StoreKit Configuration file** in Xcode (`Fixtures/StoreKit/APPNAME.storekit`)
    mirroring the two products and the intro offer, so the whole purchase flow, including
    grace period and billing retry, can be tested in the simulator with no network.

### 2.5 Explicitly out of scope for v1

| Considered | Verdict | Why |
|---|---|---|
| Lifetime / non-consumable unlock | No (owner may override — `[DECISION: monetization-model]`) | At $0.99/mo a lifetime price that feels fair (~$20) is 20 months of revenue and permanently removes the user from the funnel; also complicates entitlement logic (two product types). |
| Consumable "tip jar" | No | Extra products, extra review surface, no feature value. |
| Multiple tiers (Plus / Pro) | No | The catalogue is too small to split. One level, two durations. |
| Offer codes, win-back offers, promotional offers | No | Requires signing promotional offers with a private key, i.e. a server. Revisit only if churn becomes visible. |
| Ads | No | Contradicts the product and the privacy stance. |

---

## 3. Free vs Paid feature matrix

The matrix below covers **all 24 feature areas** of `spec/08-feature-inventory.md` §1 (A–X).
"Free" means fully available with no account and no purchase. "Plus" means the capability is
protected by the named gate. Rows marked **OWNER** are the ones the owner should consciously
confirm or flip before the build starts; every other row is a default the plan assumes.

### 3.1 Area-by-area

| # | Area (spec 08) | Free | Plus (gate) | Argument |
|---|---|---|---|---|
| A | Browsing / Feed | Home, subreddit, multireddit, user, popular, all; infinite scroll; pull-to-refresh; compact mode; all post types; NSFW/spoiler blur; sorting; seen-post dimming | Gallery Mode past 100 items (`gate.galleryMode`); inline video autoplay + feed audio (`gate.videoAutoplay`, **OWNER**) | Reading is the product's reason to exist and comes from Reddit, not us. Gating it would be both hostile and a 3.1.3/5.1.1 risk. Gallery Mode is a distinct *presentation* we built; a 100-item taste is generous. |
| B | Posting / editing / deleting posts | Create, edit, delete posts; flair; drafts; image upload | — (`gate.compose` defined but **OFF**, **OWNER**) | Writing to Reddit is Reddit's functionality, not ours. Gating it makes the free tier read-only, which reads as crippleware and invites 1-star reviews. Gate exists only so the owner can flip it. |
| C | Comments | Read, thread, collapse, load-more, sort, vote, reply, edit, delete, save, share, scroll-to-next-comment button | — | Same argument as B. The comment reader *is* the app. |
| D | Media (images/video/gallery) | Full-screen viewer, zoom/pan, double-tap, swipe-to-dismiss, multi-image paging, video playback, scrub, playback speed, mute, Live Text | Save to Photos (`gate.downloads`); feed autoplay (`gate.videoAutoplay`, **OWNER**) | Viewing media is reading. Saving media to the device is a *device* capability we implement (permission flow, download, temp-file handling) and is a classic, legible paid feature. **Share sheet stays free** — the OS share sheet's own "Save Image" is reachable from it, so the gate is soft by construction and we do not fight the user. |
| E | Accounts / login | One signed-in account; logged-out browsing; login, logout, remove account | Second and subsequent accounts, quick account swap (`gate.multiAccount`) | The single clearest "power user" line in the whole app, and the one every competitor charges for. One account is a complete experience. |
| F | Inbox / messages | Inbox list, unread badge, 60s poll, mark read/unread, mark all read, conversations, compose, reply, drafts | — | Messaging is Reddit functionality. (Push alerts, which the original sold, do not exist — `[DECISION: push-removed]`.) |
| G | Search | Post/subreddit/user search, in-subreddit search, quick subreddit search, trending | — | Search is Reddit functionality and also the main discovery path; gating it would suppress engagement. |
| H | Subreddits / multireddits | Subreddits hub, A–Z scroller, favorites, subscribe/unsubscribe, multireddit feeds, add/remove sub to multi, sidebar, wiki | — | All Reddit-account functionality. |
| I | Voting | Tap and swipe voting on posts and comments, vote retraction | — | Reddit functionality. |
| J | Saving / bookmarks | Save/unsave posts and comments, saved lists, bookmark notch | — | Reddit functionality, synced to the user's account. |
| K | Sharing / downloading | Share sheet for posts, comments, subreddits, media; share extension into the app | Save image / save video to Photos (`gate.downloads`) | Split as in D: sharing free, saving gated. |
| L | External links / in-app browser | Browser choice, reader mode, clipboard link detection, Shortcuts hand-off | — | Small, cheap, and a bad thing to nickel-and-dime. |
| M | Navigation / gestures (structural) | Tab bar, per-tab stacks, tap-active-tab-to-pop, edge-swipe back, "swipe anywhere to navigate", long-press menus, deep links | — | Structural navigation must never be gated. iPad split view is out of scope entirely (`[DECISION: ipad-split-view-deferred]`). |
| N | Swipe-action configuration | The default assignments work for everyone | Changing any swipe assignment (`gate.gestures`) | The *feature* (swiping to upvote etc.) is free; *customizing* it is the paid part. This is the cleanest possible "power feature" split — nothing is taken away, only tailoring is sold. |
| O | Sorting | All sorts and Top time ranges, per-page sort switching | Global default sort, default Top range, "apply sort to home", remember-sort-per-subreddit (`gate.sortMemory`, **OWNER**) | Changing sort is free forever. *Persisting a preference* is a small convenience worth a dollar. Marked OWNER because it is the most arguable row: some will see it as petty. |
| P | Filters | — | Keyword/text filters, subreddit filters (incl. temporary), hide-seen-posts (global + per-page override), hidden-posts management (`gate.filters`) | Filtering is pure client-side work we built, with no Reddit analogue, and is the single most-requested power feature in every Reddit client. Strongest paid row in the matrix. Note: "mark as seen" *tracking* and the dimming stay free; only *filtering by* seen state is gated. |
| Q | Themes / appearance | All built-in themes (`[DECISION: theme-count]`); every appearance toggle (compact mode, title/text line limits, flairs, blur, thumbnails side, vote indicators, AutoMod collapse, tab settings) | Theme Maker, saving/editing/deleting custom themes, importing a shared theme, separate light/dark theme pairing (`gate.customThemes`) | Picking a theme is free — the app should look good for everyone, and built-in themes cost nothing to ship. *Authoring* a theme is a creative tool we built. The original app's "5-minute Pro theme preview" mechanic is **not** reproduced; it is a dark pattern and the theme set is free anyway. |
| R | AI summaries | **Feature does not exist** (`[DECISION: ai-removed]`) | — | Removed by owner decision; also absent from the current code. |
| S | Paid tier itself | — | This document | Replaces "Hydra Pro" entirely, clean-room. |
| T | Stats | — | The whole Stats screen (`gate.stats`) | Local-only vanity metrics, zero marginal cost, purely additive, nobody is harmed by not having it. Textbook paid feature. **Counters still accumulate for free users** so the screen is full of data the day they subscribe. The original's asterisk-obfuscation is *not* reproduced — free users see a locked screen with a real description of what is inside, not fake blurred numbers (`[DECISION: stats-obfuscation]`). |
| U | Privacy / general settings | Error-reporting toggle, data-use (low data) settings, cache clearing, startup tab, startup URL, legal links, settings search | — | Never gate privacy controls or data-saving controls. Gating low-data mode would actively cost users money on cellular. |
| V | App icons | Default icon | All alternates (`gate.appIcons`) | Cosmetic, discrete, classic paid perk, trivially implemented as a gate. |
| W | Guide / in-app help | Whatever ships (`[DECISION: guide-prose-rewrite]`) | — | Help must never be paywalled. |
| X | Misc / cross-cutting | Drafts across all composers, haptics, one-time tips, patch notes, review prompt | — | Plumbing. |

### 3.2 The resulting free tier, stated plainly

A user who never pays gets: unlimited browsing of every feed with every sort; full post and comment
reading with the full comment tree, markdown, media and gallery viewer; voting, commenting, posting,
editing, saving, sharing, messaging and searching on **one** Reddit account (or none); every
built-in theme; every appearance setting; low-data mode; the share extension; the in-app browser.
That is a genuinely complete Reddit client. The $0.99 buys tailoring, filtering, multiplicity and
toys.

A user who pays additionally gets: unlimited accounts, the theme editor, custom gestures, all
filters, unlimited Gallery Mode, media downloads, stats, alternate icons, and (pending owner
decision) sort memory and feed autoplay.

### 3.3 Anti-patterns explicitly forbidden

- No time-limited "preview" of a paid feature that silently reverts (the original's 5-minute theme
  trial). Either it is free, or the paywall appears.
- No paywall on app launch, after N launches, or on tab switch.
- No degrading a free user's existing data. If a subscription lapses, custom themes are **kept**,
  the active custom theme **stays active**, filters are **kept but stop applying**, extra accounts
  are **kept but only the most recently used one can be switched to**. Nothing is deleted, ever.
  Re-subscribing restores everything with no migration step.
- No blocking content the user has already typed. If a compose-adjacent gate ever ships
  (`gate.compose`), the paywall must appear *before* the editor opens, never on submit.

---

## 4. Gate identifiers (canonical list)

These are the exact strings the `04a`/`04b`/`04c` docs use in their `[GATE: name]` tags and the
exact cases of the `Feature` enum in code. Nothing else is a gate.

| Gate id | `Feature` case | Protects | Free behaviour when locked |
|---|---|---|---|
| `gate.multiAccount` | `.multiAccount` | Adding a 2nd+ account; the quick-account-swap sheet (long-press Account tab) | "+" in Accounts opens the paywall when `accounts.count >= 1`. Existing extra accounts remain listed but selecting one opens the paywall. Long-press on the Account tab opens the paywall instead of the swap sheet. |
| `gate.customThemes` | `.customThemes` | Theme Maker (create/edit), saving a custom theme, importing a shared theme ("Import" and "Import & Apply"), separate light/dark theme assignment | "Custom Theme +" and the theme-import card open the paywall. Built-in themes fully selectable. Previously saved custom themes stay in the list, stay selectable, and stay applied. |
| `gate.gestures` | `.gestures` | Changing any of the 8 swipe-action assignments (4 post + 4 comment) and the swipe-anywhere-to-navigate toggle | The Gestures screen renders with the current values and a Plus badge; tapping any row opens the paywall. Defaults still work. |
| `gate.filters` | `.filters` | Text/keyword filter list, subreddit filters (incl. the duration picker from the post long-press menu), global hide-seen-posts, per-page hide-seen override, the hidden-posts list, "Hide Post" | Filters screen shows a locked state with the description; existing filter data is preserved and simply not applied. "Filter Subreddit" / "Hide Post" in the long-press menu open the paywall. |
| `gate.galleryMode` | `.galleryMode` | Gallery Mode beyond **100** items | Gallery Mode opens normally; after 100 loaded items the grid stops loading more and shows an inline "Continue with Plus" footer row (not a modal). |
| `gate.downloads` | `.downloads` | "Save Image" / "Save Video" to Photos | The action stays visible in the long-press menu and the media viewer with a Plus badge; tapping opens the paywall. "Share" and "Copy Image Link" remain free. |
| `gate.stats` | `.stats` | The entire Stats screen | The row stays in Settings; opening it shows a locked screen describing what is tracked (all local), with the CTA. Counters keep incrementing. |
| `gate.appIcons` | `.appIcons` | Selecting any non-default alternate icon | The grid renders with Plus badges on alternates; "Set as App Icon" opens the paywall. Reverting to default is always free. |
| `gate.sortMemory` | `.sortMemory` | Default post sort, default Top range, default comment sort, "apply sort to home", remember-sort-per-subreddit (both kinds) | **OWNER.** Default assumed ON (gated). If the owner disagrees, delete the gate and the tags. |
| `gate.videoAutoplay` | `.videoAutoplay` | Inline feed video autoplay and the feed-audio FAB | **OWNER.** Default assumed **OFF (free)** — gating it makes the feed feel broken and interacts badly with low-data mode. Gate is defined so the owner can flip it. |
| `gate.compose` | `.compose` | Creating posts, comments and messages | **OWNER.** Default assumed **OFF (free)**. Strongly recommended to leave off. |

### 4.1 Tag aliases (normalization)

The `04*` screen specs were drafted in parallel with this document and contain a few earlier-draft
tag spellings. Treat the following as exact synonyms; the canonical form is always the `gate.*` one.

| Variant seen in `04*` | Canonical |
|---|---|
| `[GATE: gallery-mode]` | `gate.galleryMode` |
| `[GATE: custom-themes]` | `gate.customThemes` |
| `[GATE: text-filters]` | `gate.filters` |
| `[GATE: multi-account]` | `gate.multiAccount` |
| `[GATE: pro-entry]` | **Not a gate.** It marks the Settings → APPNAME Plus row, which is always visible and always free to open |
| `[GATE: inbox-badge]` | **Not a gate.** The inbox, its polling and its badge are free (`05` §3.1 row F) |

Any `[GATE: …]` tag naming something not in the table above or in §4's table is an error: resolve
it to the nearest canonical gate, or, if none fits, treat the feature as **free** and record the
discrepancy. A gate that is not defined here does not exist.

Implementation note for the `04*` docs: a screen tagged `[GATE: gate.filters]` means the *feature*
on that screen is gated; the screen itself must still be reachable and must still render its
explanatory copy. Gates never hide navigation.

---

## 5. Entitlement architecture

### 5.1 Shape

Everything lives in one small Swift package, `Packages/Entitlements` (see `02-architecture.md`),
depending only on `StoreKit` and `Observation`. No third-party purchase SDK — RevenueCat and
friends are a network dependency, a privacy disclosure, and a monthly cost, for a single
subscription group with no server.

```
Entitlements (package)
├── Feature            enum, the 11 cases in §4
├── Entitlements       @Observable, @MainActor, the single source of truth
├── EntitlementCache   last-known-good state, small + signed-ish, in UserDefaults
├── ProductCatalog     product ids, group id, loads Product objects
├── PaywallPresenter   environment-driven sheet presentation
└── Views              PaywallSheet, PlusSettingsScreen, PlusBadge, requiresEntitlement modifier
```

### 5.2 `Entitlements` — observable state

```
@Observable @MainActor final class Entitlements {
    private(set) var isSubscribed: Bool
    private(set) var state: State          // .unknown, .subscribed(Snapshot), .notSubscribed, .inGracePeriod(Snapshot), .inBillingRetry(Snapshot)
    private(set) var products: [Product]
    private(set) var isEligibleForIntroOffer: Bool
    func isUnlocked(_ feature: Feature) -> Bool
    func refresh() async
    func purchase(_ product: Product) async throws -> PurchaseOutcome
    func restore() async throws
}
```

`isUnlocked(_:)` is the only thing the rest of the app calls. It returns `true` when
`isSubscribed` is true **or** when the feature's gate is configured off (the OWNER rows in §4 map
to a compile-time `Feature.isEnabledAsGate` table, so flipping `gate.compose` to free is a
one-line change, not a code hunt).

`isSubscribed` is true for `.subscribed`, `.inGracePeriod` and `.inBillingRetry` states. It is
false for `.notSubscribed`. It is **`false` for `.unknown` only after the first refresh completes**;
during the very first refresh the UI must not flash a locked state — see §5.7.

### 5.3 Source of truth: `Transaction.currentEntitlements` + `Transaction.updates`

1. **At launch**, before the first frame that could show a gated affordance, start a
   `Task` that iterates `Transaction.currentEntitlements`. For each result:
   - Take only `case .verified(let transaction)`. An `.unverified` result is treated as no
     entitlement and logged (not surfaced to the user).
   - Ignore transactions whose `productID` is not in our catalogue.
   - Ignore transactions with a non-nil `revocationDate`.
   - Ignore transactions whose `expirationDate` is in the past (StoreKit normally filters these,
     but be defensive).
   - Keep the one with the latest `expirationDate`; store a `Snapshot`
     (`productID`, `expirationDate`, `ownershipType`, `isUpgraded`) in `EntitlementCache`.
2. **Then**, for the winning subscription, read
   `Product.SubscriptionInfo.status(for: groupID)` (or `product.subscription?.status`) to get
   `RenewalState` and `RenewalInfo`:
   - `.subscribed` → `.subscribed`
   - `.inGracePeriod` → `.inGracePeriod` (features stay unlocked; the Plus settings screen shows
     "Update your payment method by <gracePeriodExpirationDate>")
   - `.inBillingRetry` → `.inBillingRetry` (features stay unlocked; softer banner)
   - `.expired`, `.revoked` → `.notSubscribed`
3. **A long-lived `Transaction.updates` listener** is started once, at app launch, and never
   cancelled. Every incoming verified transaction is `await transaction.finish()`-ed and then
   triggers a `refresh()`. This is what catches: purchases made on another device, renewals,
   refunds (`revocationDate` set), family-sharing changes, Ask-to-Buy approvals, and subscriptions
   managed in the Settings app while our app is backgrounded.
   - The listener must be installed **before** the first `currentEntitlements` read, so a
     transaction that lands during startup is not missed.
4. **On `scenePhase == .active`**, call `refresh()`. Cheap, and covers the user returning from
   Settings → Subscriptions after cancelling.

### 5.4 Receipt validation stance

**On-device StoreKit 2 verification only. No server, no receipt upload, no `verifyReceipt`.**

`VerificationResult` is JWS-verified by StoreKit against Apple's certificate chain before our code
sees it; for a $0.99 client feature set with no server-delivered content, that is the correct
altitude. The residual risk is a jailbroken device with a StoreKit hook granting a free unlock —
which costs us nothing, since the unlocked features consume no resources of ours. Do not spend a
line of code on anti-piracy.

Explicitly **do not**: ship a shared secret in the binary; call Apple's `verifyReceipt` endpoint
from the client (deprecated and it requires the secret); add an "integrity check" that can false-
positive a paying customer into a locked app.

### 5.5 Offline behaviour and the cache

`EntitlementCache` persists the last verified snapshot in `UserDefaults` (standard suite, not an
app group — the share extension does not need entitlements):

| Key | Value |
|---|---|
| `plus.cached.productID` | last entitled product id |
| `plus.cached.expiresAt` | `Date` |
| `plus.cached.refreshedAt` | `Date` of the last successful verified refresh |
| `plus.cached.state` | raw value of the renewal state |

Rules:

- On cold launch with no network, `isSubscribed` is seeded from the cache **iff**
  `now < expiresAt + offlineLeeway`, where `offlineLeeway = 16 days` (matched to the configured
  billing grace period, so an offline user in grace is never locked out).
- Once a live verified refresh completes, the cache is overwritten and becomes authoritative.
- If a live refresh says "not subscribed", the cache is cleared immediately — a downgrade is
  applied at once; only *upgrades* are optimistic.
- The cache is never the reason to *grant* a feature past `expiresAt + offlineLeeway`.
- This is a convenience cache, not a security boundary. It is fine that a user can edit it.

### 5.6 Purchasing

```
func purchase(_ product: Product) async throws -> PurchaseOutcome
```

- Call `product.purchase(options: [])`. No `appAccountToken` — we have no user identity and no
  server, so attaching one would be a privacy liability with no benefit.
- Handle every case of `Product.PurchaseResult`:
  - `.success(let verification)` → verify, `finish()`, `refresh()`, return `.purchased`.
    On `.unverified` → return `.failedVerification` and show a plain alert.
  - `.pending` → return `.pending`; show "Waiting for approval" (Ask to Buy / SCA). The
    `Transaction.updates` listener will complete it later, possibly days later.
  - `.userCancelled` → return `.cancelled`; dismiss nothing, log nothing, show nothing.
  - `@unknown default` → treat as `.cancelled`.
- `StoreKitError.networkError` and `.systemError` → a single retryable alert. Never a crash.
- The purchase button must be disabled while a purchase is in flight and must show progress.

### 5.7 First-run and unknown state

Between launch and the first completed refresh, `state == .unknown`. During that window:

- Gated **screens** render their normal content with gate affordances *hidden* (no Plus badges, no
  lock screens) rather than rendering a locked state that would flash and then unlock.
- Gated **actions** invoked during `.unknown` `await` the in-flight refresh (bounded to 3 seconds)
  before deciding. If the refresh has not resolved in 3 seconds, treat as not subscribed and open
  the paywall — the paywall itself will correct itself once the refresh lands (it observes
  `Entitlements`), so a subscriber who taps very fast sees the sheet appear and then can dismiss
  it; acceptable and rare.
- This is the only place where "unknown" is user-visible, and it must not be a spinner over the
  whole app.

### 5.8 Restore purchases

- A visible **Restore Purchases** button on the paywall and on the Plus settings screen (required
  by 3.1.2 and by common sense for family-shared purchases and reinstalls).
- Implementation: `try await AppStore.sync()` then `refresh()`. Show a determinate result:
  "Your subscription was restored" / "No purchase found for this Apple Account".
- `AppStore.sync()` may prompt for the Apple Account password — so it must only ever run from an
  explicit user tap, never automatically on launch. Automatic restoration is already handled by
  `currentEntitlements`, which needs no prompt.

### 5.9 The `Feature` enum and the view modifier

```
enum Feature: String, CaseIterable, Sendable {
    case multiAccount, customThemes, gestures, filters, galleryMode
    case downloads, stats, appIcons, sortMemory, videoAutoplay, compose
}
```

Each case carries, via a static table: `title`, `blurb` (one sentence for the lock screen / paywall
highlight), `symbol` (SF Symbol), and `isGated` (the OWNER switches).

```
extension View {
    func requiresEntitlement(_ feature: Feature,
                             style: GateStyle = .interceptTap) -> some View
}
```

`GateStyle`:

| Style | Behaviour | Used for |
|---|---|---|
| `.interceptTap` | Renders content normally, adds a trailing `PlusBadge`, swallows the tap and presents the paywall when locked | Settings rows, menu actions, toggles |
| `.lockScreen` | Replaces the content entirely with a `FeatureLockView` (icon, title, blurb, CTA, restore link) when locked | Stats screen, Theme Maker |
| `.inlineFooter` | Renders content, appends a non-modal "Continue with Plus" row at the end when locked | Gallery Mode's 100-item stop |
| `.passthrough` | Renders content unchanged and reports lock state through a `@Binding` so the caller decides | Bespoke cases |

The modifier reads `Entitlements` and `PaywallPresenter` from `@Environment`. It must never
`if` the content out of existence — a gated row that disappears when locked is undiscoverable and
therefore never converts.

### 5.10 Paywall presentation rules

1. The paywall is a **sheet**, presented from the deepest presenting scene, with
   `.presentationDetents([.large])` and a visible close control.
2. It is presented **only** as the direct result of a user tap on a gated affordance, or from
   Settings → APPNAME Plus. Never on launch, never on a timer, never after N sessions, never on
   backgrounding, never twice in one interaction.
3. The presenting context passes the `Feature` that triggered it, so the sheet can lead with that
   feature ("Custom themes are part of APPNAME Plus") before listing the rest. Context beats a
   generic list.
4. **Never block already-entered content.** No gate may sit between the user and text they have
   typed, an image they have picked, or a draft they have written. If `gate.compose` is ever turned
   on, its check runs when opening the composer, not on submit; drafts are saved regardless of
   entitlement.
5. Dismissal is always free and always leaves the app exactly where it was. No "are you sure you
   want to miss out" second sheet.
6. At most one paywall in the view hierarchy at a time; `PaywallPresenter` is a single-slot
   presenter keyed off an `@Observable` optional `Feature`.
7. After a successful purchase, the sheet dismisses itself, and the originally-tapped action is
   **re-executed automatically** (the presenter stores a `pendingAction` closure). Making the user
   tap again after paying is the worst possible first impression.

---

## 6. Paywall and Plus settings UI

### 6.1 Default: `SubscriptionStoreView`

Use Apple's `SubscriptionStoreView(groupID:)` as the shipping paywall for v1:

- It renders both products, the localized prices, the intro-offer eligibility, the
  "cancel anytime" language and the legal boilerplate, in every language and territory, for free,
  and it is updated by Apple when the rules change.
- Configure:
  - `.subscriptionStoreControlStyle(.prominentPicker)` — both plans visible, annual pre-selected.
  - `.subscriptionStorePolicyDestination(url:for: .termsOfService)` and `.privacyPolicy` — both
    URLs required (§7).
  - `.storeButton(.visible, for: .restorePurchases)` — required control.
  - `.storeButton(.visible, for: .redeemCode)` — optional, harmless, costs nothing.
  - `.subscriptionStoreControlIcon { … }` — per-plan icon if desired.
  - `.onInAppPurchaseCompletion { product, result in … }` → verify, finish, refresh, dismiss,
    replay the pending action.
  - Marketing content: a `VStack` header with the app icon, "APPNAME Plus", the trigger feature's
    headline, then a compact feature list (§6.2).
- Liquid Glass: do not apply a custom background to the subscription controls; let the system
  material do its job (spec/10 §A2). Restrict any `glassEffect` to the header card, if at all.

### 6.2 Feature list shown on the paywall (fixed order)

1. **Multiple accounts** — Sign in with as many Reddit accounts as you like and switch instantly.
2. **Theme editor** — Build your own colour theme, or import one someone shared.
3. **Filters** — Hide posts by keyword, mute whole subreddits, and skip what you've already read.
4. **Custom gestures** — Reassign every swipe action on posts and comments.
5. **Unlimited gallery** — Browse media-heavy subreddits as an endless grid.
6. **Save media** — Download images and videos straight to Photos.
7. **Stats** — See what you've read, scrolled and voted on. Stored only on your device.
8. **Alternate app icons** — Pick a different icon for your Home Screen.

(Plus "Sort memory" and "Feed autoplay" if the owner turns those gates on.)

Copy rules: no superlatives, no "unlock the full experience", no scarcity, no comparison table
against the free tier. State what it does.

### 6.3 Custom paywall layout spec (fallback / later)

If `SubscriptionStoreView` proves too rigid, the hand-rolled layout is specified here so the agent
does not improvise:

| Region | Content |
|---|---|
| Top bar | Close (✕) trailing; no title |
| Hero | App icon 72pt, "APPNAME Plus" (title2, semibold), one-line subtitle naming the triggering feature |
| Feature list | The 8 rows of §6.2, each `Label` with SF Symbol, 15pt, 12pt row spacing, the triggering feature's row visually emphasised |
| Plan picker | Two selectable cards side by side: Yearly (pre-selected, "$9.99/yr", badge "Save 16%") and Monthly ("$0.99/mo"). Prices from `product.displayPrice`, **never hard-coded** |
| Trial line | "7 days free, then \(displayPrice) per \(period). Cancel anytime." Shown only when `isEligibleForIntroOffer` |
| CTA | Full-width prominent button: "Try Free for 7 Days" (eligible) or "Subscribe" (ineligible). Disabled + progress during purchase |
| Disclosure | Small print: auto-renews unless cancelled at least 24 hours before the end of the period; manage in Settings; payment charged to the Apple Account at confirmation |
| Footer | "Restore Purchases" · "Terms of Use" · "Privacy Policy" — three tappable links, always present |

### 6.4 Settings → APPNAME Plus screen

A row in the Settings root, below Appearance, above App Icon, labelled **APPNAME Plus**.

**When not subscribed:** a compact version of the paywall's feature list, the plan picker, the CTA,
Restore Purchases, and the legal links.

**When subscribed:**

| Row | Content |
|---|---|
| Status | "APPNAME Plus is active" + plan name; if `.inGracePeriod` or `.inBillingRetry`, an amber row: "There's a problem with your payment method. Plus stays active until <date>." with a Manage Subscription link |
| Renews | `expirationDate`, formatted with the user's locale; label is "Renews" or "Expires" depending on `willAutoRenew` |
| Plan | "Monthly" / "Yearly", with an inline control to switch (opens `SubscriptionStoreView` in "manage" mode, which Apple handles as a crossgrade) |
| Manage Subscription | Presents `.manageSubscriptionsSheet(isPresented:)` (StoreKit's own sheet). **Fallback** for a failure to present: open `https://apps.apple.com/account/subscriptions`. Do not deep-link `itms-apps://` |
| Restore Purchases | Always present |
| Terms of Use / Privacy Policy | Always present |
| Thanks | One quiet line of gratitude. No upsell. |

### 6.5 Price localization

Every price string in the app comes from `product.displayPrice` /
`product.subscription.subscriptionPeriod`, formatted through `Product`'s own localized accessors.
There is exactly **zero** hard-coded currency anywhere in the codebase — including this document's
"$0.99", which is a design target, not a string. If products fail to load (no network, StoreKit
unavailable), the paywall shows a retry state, not a fabricated price.

### 6.6 Existing "free forever" expectations

None. The owner is the only user of the fork, the new app ships under a new name and bundle id
with no upgrade path from the old one, and no one has ever paid for anything. There is therefore no
grandfathering, no legacy-unlock receipt check, and no migration. If the owner later distributes to
friends before monetizing, add a build-time `Entitlements.isComplimentary` flag rather than a
runtime code-redemption scheme.

---

## 7. App Store compliance checklist

Work through this before the first submission; each line is a rejection Apple has actually issued
for subscription apps.

- [ ] Subscription **title** visible adjacent to the purchase control ("APPNAME Plus").
- [ ] Subscription **length** visible (1 month / 1 year).
- [ ] **Price per period** visible, localized, from `displayPrice`.
- [ ] A plain statement of **what the subscription provides** (the §6.2 list) on the same screen.
- [ ] **Terms of Use (EULA)** link, functional, opening in-app or in Safari. If using Apple's
      standard EULA, link `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`.
- [ ] **Privacy Policy** link, functional, at a URL the owner controls, also entered in App Store
      Connect → App Privacy.
- [ ] **Restore Purchases** control present on the paywall *and* reachable from Settings.
- [ ] Auto-renewal disclosure text present (renews unless cancelled ≥24h before period end;
      managed in Apple Account settings).
- [ ] **No external purchase links** anywhere: no "buy on our site", no Patreon, Ko-fi, GitHub
      Sponsors, PayPal, crypto, or donation link, in the app, in the Guide, in the About screen,
      or in any bundled documentation text.
- [ ] No mention of other platforms' pricing, and no "cheaper on the web".
- [ ] The app is **fully usable without purchasing** and without signing in (3.1.1, 5.1.1(iv)).
- [ ] No gated content that the user's own Reddit account already provides.
- [ ] Paywall **review screenshot** uploaded for each product in App Store Connect.
- [ ] **Review notes** explain the keyless Reddit access model and that no demo account is needed.
- [ ] Sandbox purchase, restore, cancel and grace-period paths all verified (§9) before submission.
- [ ] Subscription products submitted **with** the app binary on first submission (a first-release
      IAP cannot be approved separately).
- [ ] App Privacy answers match reality (§8) — in particular "Purchases" data is collected by
      Apple, not by us, and we link no data to identity.
- [ ] 4.2 (Minimum Functionality): the app is a full native client, not a web wrapper. The only
      `WebView` uses are the Reddit login flow, subreddit wikis and the report flow — document this
      in review notes to pre-empt the question.
- [ ] 5.2.5 / trademark: the app's name, icon and screenshots must not use Reddit's wordmark,
      Snoo, or trade dress; the description should say "a client for Reddit", not "Reddit".
      (Also relevant: `[DECISION: app-icons-new-art]`.)
- [ ] Export compliance: `ITSAppUsesNonExemptEncryption = false` in Info.plist.
- [ ] Age rating set to reflect unfiltered user-generated content (17+ / "Frequent or Intense
      Mature Themes"), with the user-generated-content questions answered honestly, and the app
      providing block + report paths (both exist: block via user menu, report via Reddit's web
      flow).

---

## 8. Metrics without phoning home

The owner's app collects **nothing**. There is no analytics SDK, no event pipeline, no funnel
instrumentation, and no way for the developer to observe a conversion other than App Store Connect.
That is a deliberate trade: the product's privacy story is one of its selling points, and at this
revenue scale funnel optimization would cost more than it could ever return.

What is available for free, without any code:

| Question | Source |
|---|---|
| How many subscribers? | App Store Connect → Trends → Subscriptions (active, new, cancelled, by plan) |
| Trial conversion rate? | App Store Connect → Subscription reports (introductory offer → paid) |
| Churn / retention curves? | App Store Connect subscription retention report |
| Proceeds after commission? | App Store Connect → Payments and Financial Reports |
| Crash-free rate, hangs, launch time, scroll hitches | MetricKit's `MetricManager` (iOS 27) — aggregate, on-device-generated, delivered by Apple; no third party |

Optional, owner's call (`[DECISION: sentry-or-not]`): Sentry-cocoa for symbolicated crashes, gated
behind the same opt-out toggle the original app had (default on, "Allow APPNAME to report errors",
restart not required in the rewrite). If Sentry is included, it changes the privacy label (see
below) and must **never** receive purchase state, Reddit content, or the Reddit username unless the
owner explicitly wants username tagging.

### Privacy nutrition label implications

| Data type | Collected? | Linked to identity? | Used for tracking? | Notes |
|---|---|---|---|---|
| Purchases | **Not collected by us** | — | — | Apple processes the transaction; we never see or store an identifier. Declare "not collected" — the app does not transmit purchase data anywhere. |
| Identifiers (user id, device id) | No | — | No | No `appAccountToken`, no IDFA, no IDFV use, no ATT prompt. |
| Usage data | No | — | No | Stats are computed and stored on-device in SQLite and never leave it. This must be stated in the Stats screen's own copy. |
| Contact info / health / location / contacts / browsing history | No | — | No | — |
| Diagnostics (crash data, performance data) | **Only if Sentry ships** | Owner's choice — recommended: **not linked** | No | If included: declare "Crash Data" and "Performance Data", not linked to identity, used for App Functionality. Do not attach the Reddit username (`[DECISION: sentry-or-not]` should settle this; recommended: don't). |
| User content | No | — | — | Drafts stay on-device. |

The App Store privacy label for the default build (no Sentry) is therefore **"Data Not Collected"**,
which is both true and a meaningful differentiator worth stating in the App Store description.

---

## 9. Testing the money paths

| Environment | How | What must pass |
|---|---|---|
| **Xcode StoreKit configuration file** (`Fixtures/StoreKit/APPNAME.storekit`) | Scheme → Run → Options → StoreKit Configuration | Purchase monthly; purchase annual; cancel; restore; intro-offer eligibility on/off; **simulated** billing retry, grace period, refund and subscription-revocation via the Transaction Manager. All eleven gates lock/unlock correctly. Time-rate acceleration to observe renewal. |
| **Swift Testing unit tests** | `Packages/Entitlements/Tests` | `Entitlements` state machine given synthetic transaction snapshots: expired, revoked, grace, retry, family-shared, unverified, unknown product id, clock-skewed expiry. Cache leeway boundaries at `expiresAt ± 1s` and `expiresAt + 16d ± 1s`. `isUnlocked` truth table for all 11 features × 5 states. **No network, no real StoreKit** — the tests drive a protocol-shaped seam, not `Transaction` itself. |
| **Sandbox** (real device, Sandbox Apple Account from App Store Connect → Users and Access) | Settings → Developer → Sandbox Apple Account | Real purchase sheet; renewal acceleration (sandbox renews monthly subs every 5 minutes, annual every hour); interrupted purchase; Ask to Buy; `manageSubscriptionsSheet`; restore on a second device. |
| **TestFlight** | Internal tester build | TestFlight purchases are free and use the sandbox environment — verify the entitlement lands, the paywall dismisses, the pending action replays, and nothing charges. Also verify the app works for a tester who never purchases. |
| **Production smoke** | First day after release | One real $0.99 purchase by the owner, then refund request, to confirm the revocation path unlocks→locks correctly via `Transaction.updates`. |

Guardrail for the build agent: **no unit test may touch StoreKit's real APIs or the network.** All
entitlement tests run against injected snapshots. The StoreKit-configuration-file tests are UI/
manual tests, run in the simulator, and are listed in the Phase 8 manual smoke checklist in
`06-build-plan-and-acceptance.md`.

---

## Traceability

| Section here | Derived from | Feeds into |
|---|---|---|
| §1.1–1.2 goals, zero-marginal-cost argument | Owner's product decisions; `spec/02-api-contract.md` §0 (keyless model), §2.13 (Hydra server), `spec/09-persistence-pro-utils.md` §0, §3.1 | `08-decisions-and-drift.md` ids `pro-removed`, `ai-removed`, `push-removed`, `self-hosted-server-row` |
| §1.3 Apple rules | App Store Review Guidelines 3.1.1, 3.1.2, 3.1.3(a), 4.2, 5.1.1(iv), 5.2.5 | §7 checklist |
| §2 catalogue, ASC setup | `spec/10-swiftui-2026-baseline.md` §A3 "IAP, intents, background" (StoreKit 2 + `SubscriptionStoreView`, iOS 17+; iOS 27 additions) | `06` Phase 8; `07` kickoff checklist |
| §3 matrix | `spec/08-feature-inventory.md` §1 areas A–X (items 1–327); `spec/06-settings-themes.md` §§2–10; `spec/03-feed-and-posts.md` §§11–15; `spec/05-media.md` §§9–10 | `04a`/`04b`/`04c` `[GATE: …]` tags; `06` acceptance checklist |
| §3.1 row D/K split (share free, save gated) | `spec/05-media.md` §9.1–9.2 | `04b-media.md` |
| §3.1 row P (filters) | `spec/03-feed-and-posts.md` §§11–14; `spec/06-settings-themes.md` §2.3 | `04a-feeds-posts-comments.md`, `04c-…-settings.md` |
| §3.1 row Q (themes) | `spec/06-settings-themes.md` §3 (12 themes, Theme Maker, import format) | `04c-…-settings.md`; `[DECISION: theme-import-format-compat]` |
| §3.1 row T (stats) | `spec/06-settings-themes.md` §8; `spec/09-persistence-pro-utils.md` §1.2 (`counter_stats`, `subreddit_visits`) | `04c-…-settings.md`; `[DECISION: stats-obfuscation]` |
| §4 gate ids | This document is the source of truth for gate names | Every `[GATE: …]` tag in `04a`, `04b`, `04c` |
| §5 entitlement architecture | `spec/10-swiftui-2026-baseline.md` §A3 (Observation, approachable concurrency, StoreKit 2) | `02-architecture.md` (Entitlements seam); `06` Phase 8 |
| §5.4 no-server verification | `spec/02-api-contract.md` §3.7 (no receipt validation existed); `spec/09` §3.3 (no IAP plumbing existed) | `07-one-shot-prompt.md` guardrails |
| §6 paywall UI | `spec/10` §A2 (Liquid Glass: reduce custom backgrounds), §A3 (`SubscriptionStoreView`) | `04c-…-settings.md` (Settings root row placement) |
| §7 compliance | Guidelines as cited; `spec/08` §6 (`ITSAppUsesNonExemptEncryption: false`) | `06` Phase 10 release gate |
| §8 privacy label | `spec/06-settings-themes.md` §9 (error-reporting toggle); `spec/08` §1 items 296–301 | `08-decisions-and-drift.md` id `sentry-or-not` |
| §9 testing | `spec/10` §A3 Testing (Swift Testing default, XCTest for UI) | `06` Phase 8 DoD |
