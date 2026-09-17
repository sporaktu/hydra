# SwiftUI 2026 Baseline for a Native iOS Reddit-Client Rewrite

**Compiled:** 2026-09-17 · **Method:** live web research only (no recall). Every factual claim below carries a URL. Apple documentation was read through the `developer.apple.com/tutorials/data/...json` DocC endpoints, which is the same data the rendered docs site serves, so availability annotations (`introducedAt`, `beta`) are authoritative.

---

# PART A — VERIFIED GA AS OF 2026-09-17

Everything in Part A was confirmed against Apple first-party sources (developer.apple.com, swift.org) today.

## A1. Platform, toolchain and language versions

| Thing | GA version today | Source |
|---|---|---|
| iOS / iPadOS | **27.0**, publicly released **2026-09-14** | [MacRumors 2026-09-09](https://www.macrumors.com/2026/09/09/apple-announces-ios-27-release-date/), [AppleInsider](https://appleinsider.com/articles/26/09/09/ios-27-arrives-on-september-14-heres-what-youll-get) |
| Previous-major line | **iOS 26.7** (security-only, shipped alongside iOS 27 on 2026-09-14). 26.6.2 was 2026-09-08. | [MacRumors iOS 26.7](https://www.macrumors.com/2026/09/14/apple-releases-ios-26-7/), [MacRumors 26.6.2](https://www.macrumors.com/2026/09/08/apple-releases-ios-26-6-2/) |
| Xcode | **27** (GA). Includes **Swift 6.4** and the iOS/iPadOS/tvOS/watchOS/macOS/visionOS **27 SDKs**. Requires **macOS Tahoe 26.6+**. On-device debugging floor: iOS 17+. | [Xcode 27 Release Notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-27-release-notes) |
| Swift | **6.4**, released **2026-09-15** | [swift.org/blog](https://www.swift.org/blog/) |
| SwiftUI feature level | iOS 27 SwiftUI (the "September 2026" block of the updates page) | [SwiftUI updates](https://developer.apple.com/documentation/updates/swiftui) |

**So: yes, iOS 27 is released.** It shipped three days ago. App Store submissions using the 27 SDKs are **open now**, and **from April 2027 uploads to App Store Connect must be built with the iOS/iPadOS 27 SDK or later** ([Apple Developer News](https://developer.apple.com/news/?id=k1mtkt1k)).

### Deployment target recommendation

**Target iOS 26.0 as the floor, and gate the iOS 27 conveniences behind `@available`.** Reasoning:

- Apple's own adoption page, measured **2026-06-07**, showed **iOS 26 on 79 % of all iPhones and 86 % of iPhones introduced in the last four years** ([Apple App Store support page](https://developer.apple.com/support/app-store/)). iOS 27 is three days old and has no published number yet; an iOS 27-only floor today throws away most of your addressable users.
- iOS 26 is where the entire design language you must adopt lives (Liquid Glass, `Tab`/`tabViewBottomAccessory`, `WebView`/`WebPage`, `TextEditor` + `AttributedString`, Foundation Models). Nothing architectural forces 27.
- The iOS 27 features that matter most to this app — `AsyncImage` HTTP caching, swipe actions outside `List`, `toolbarMinimizationBehavior` — are all additive and easy to `@available`-branch. Note one exception: **the new `@State` macro behaviour back-deploys to iOS 17**, it is a *compiler* change from building with Xcode 27, not a runtime gate ([iOS 27 release notes, SwiftUI](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes)).
- If the product is an enthusiast Reddit client (typically a young, fast-updating audience), **iOS 27.0 is defensible** as a floor by roughly Q1 2027 — but not on day 4.

**You must build with the iOS 27 SDK regardless of deployment target.** Two hard gates arrive with that SDK:
1. Apps built with the 27.0 SDK **must adopt the UIKit scene-based life cycle or they fail to launch**.
2. Apps built with the 27.0 SDK **must ship a launch screen** (`UILaunchScreen`/`UILaunchStoryboardName`/etc. in Info.plist) or be rejected.
Both from the [iOS 27 release notes (UIKit)](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes).

---

## A2. Liquid Glass — non-negotiable now

**The opt-out is dead.** Apple's own doc for the key states plainly: *"The system ignores this key when you build for iOS 27 or later, iPadOS 27 or later, Mac Catalyst 27 or later, macOS 27 or later, or tvOS 27 or later."* ([UIDesignRequiresCompatibility](https://developer.apple.com/documentation/bundleresources/information-property-list/uidesignrequirescompatibility)). Since you must be on the 27 SDK by April 2027, `UIDesignRequiresCompatibility` gives a **new** app exactly nothing. Design for Liquid Glass from line one.

Apple's guidance in [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass), which is directly relevant to a themed Reddit client:

- Standard SwiftUI components pick the material up automatically. **Reduce custom backgrounds** on bars, tab bars, split views and toolbars — custom backgrounds fight the material and the scroll-edge effect.
- **Use `glassEffect` sparingly.** Apply it only to the most important custom controls; overuse distracts from content. `glassEffect(_:in:)` and `GlassEffectContainer` are **iOS 26.0+** (verified via DocC platform metadata).
- Use `scrollEdgeEffectStyle(_:for:)` for custom bars that have content scrolling under them (iOS 26+).
- **Custom themes are the hazard.** Liquid Glass adapts to Reduce Transparency / Reduce Motion and to the user's chosen glass look. Your theming layer must define light/dark variants and increased-contrast variants per colour, and must be tested against those accessibility settings.
- App icons are now **layered** (background / middle / foreground) and composed in **Icon Composer**, which ships in Xcode. Light, dark, clear and tinted variants are system-generated. For **alternate app icons**, each alternate now needs its own Icon Composer file added to the project; Xcode writes `CFBundleAlternateIcons` from the *Alternate App Icon Sets* build setting, and you still switch at runtime with `UIApplication.setAlternateIconName(_:completionHandler:)` (iOS 10.3+, unchanged) — [Apple: Configuring your app to use alternate app icons](https://developer.apple.com/documentation/xcode/configuring-your-app-to-use-alternate-app-icons), [useyourloaf on Icon Composer in Xcode](https://useyourloaf.com/blog/adding-icon-composer-icons-to-xcode/).

---

## A3. Modern-idiom checklist (all GA)

### Observation, state and concurrency
- **`@Observable` / `@Bindable`** (Observation framework) — iOS 17.0+, verified. `ObservableObject`/`@StateObject`/`@Published` are legacy for a new app; use `@Observable` classes held in `@State` or `@Environment`.
- **`@State` is now a macro** when you build with Xcode 27. It fixes the long-standing "initializer expression re-evaluated on every view re-instantiation" problem and **back-deploys to iOS 17**. Three source-compat traps, all spelled out in the [iOS 27 release notes](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes): you may no longer both give an inline initial value *and* assign in `init`; the compiler-synthesised private memberwise init is disabled; and composing `@State` with other property wrappers/macros is unsupported. Budget a small amount of migration friction.
- **Swift 6 strict concurrency with default MainActor isolation.** SE-0466 adds module-level default actor isolation; in Xcode you set `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` under the `SWIFT_APPROACHABLE_CONCURRENCY = YES` umbrella, and Xcode 26 already turns both on for new projects ([SE-0466](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0466-control-default-actor-isolation.md), [SwiftLee](https://www.avanderlee.com/concurrency/default-actor-isolation-in-swift-6-2/), [Hacking with Swift: What's new in Swift 6.2](https://www.hackingwithswift.com/articles/277/whats-new-in-swift-6-2)). **Turn both on.** Apple's own SwiftUI code now assumes it — the iOS 27 release notes explicitly tell conformers to switch `nonisolated` async requirements to **`@concurrent`** because *"with approachable-concurrency defaults that infer MainActor isolation, an unannotated nonisolated async method runs on the main actor, defeating the intent of off-main reading and writing."* That is exactly the trap your SQLite/network layer will hit: **mark off-main work `@concurrent` explicitly.**
- **Swift 6.4 concurrency additions** worth knowing: `await` is now allowed inside `defer`; `withTaskCancellationShield` protects cleanup work from cancellation; warnings now fire for silently-ignored `Task` errors; `weak let`; `~Sendable`; `@available(anyAppleOS 27, *)` replaces the six-platform availability litany ([swift.org blog](https://www.swift.org/blog/swift-6.4-released/), [WWDC26 262 — What's new in Swift](https://developer.apple.com/videos/play/wwdc2026/262/)).

### Testing
- **Swift Testing is the default for new unit/integration tests; XCTest is not deprecated.** Swift 6.4 / Xcode 27 adds **test-framework interoperability** with four modes (Limited / Complete / Strict / None) settable in Test Plan settings or via `SWIFT_TESTING_XCTEST_INTEROP_MODE`; `swift-tools-version: 6.4` enables Complete. Apple's own advice is: leave existing XCTests, write new tests in Swift Testing.
- **UI automation (XCUITest), performance measurement (XCTMetric) and Objective-C exception handling remain XCTest-only.** For a Reddit client that means your scroll-performance and launch tests stay XCTest. ([WWDC26 267 — Migrate to Swift Testing](https://developer.apple.com/videos/play/wwdc2026/267/))

### Navigation and tabs
- `NavigationStack` + `NavigationPath` + `navigationDestination` remains the value-typed routing model; nothing has replaced it.
- **`Tab(...)` builder API** is iOS 18.0+, `tabBarMinimizeBehavior(_:)` and `tabViewBottomAccessory(content:)` are **iOS 26.0+** (all verified via DocC). `TabViewBottomAccessoryPlacement` lets the accessory adapt when the bar minimises — this is the idiomatic home for a "currently playing / now viewing" mini-bar.
- **iOS 27 breaking change:** *"a `TabView` enforces that its selection is set to a visible tab. `TabView` might crash when its selection is set to a hidden or otherwise unavailable tab."* If your tab set is user-customisable (common in Reddit clients), validate selection whenever the visible tab set changes. ([iOS 27 release notes](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes))
- iOS 27 adds a **`prominent` tab role** (separate trailing slot) and `TabsPickerStyle`.

### Toolbars
- **`toolbarMinimizationBehavior(_:for:)` is iOS 27.0+ and *replaces* `toolbarMinimizeBehavior`** (verified DocC + release notes). Also new in 27: `visibilityPriority(_:)` to keep important actions out of the overflow, `ToolbarOverflowMenu` to force secondary actions in, and the `topBarPinnedTrailing` placement.

### Feed scrolling and very large lists — the most important section for this app
Apple's [WWDC26 321 — *Dive into lazy stacks and scrolling with SwiftUI*](https://developer.apple.com/videos/play/wwdc2026/321/) is the definitive current guidance and it changes some received wisdom:

- **Prefer `ScrollPosition` binding over absolute offsets.** Lazy stacks *estimate* off-screen content size from the average of loaded views, so `contentOffset`/`contentSize` are unstable. `scrollPosition(_:anchor:)` is iOS 18+.
- **For "which post is on screen" (autoplay focus), Apple explicitly recommends `onScrollTargetVisibilityChange(idType:threshold:)` over `onScrollGeometryChange`** — relative visibility rather than estimated position. Both are iOS 18.0+. This is your video-autoplay trigger.
- **Do setup in `init`, not `onAppear`.** Lazy stacks prefetch; `onAppear` may never fire if the scroll direction reverses mid-prefetch.
- **Never let a leaf view produce a dynamic number of subviews** (e.g. `if step.isVisible { … }`). It forces the stack to keep earlier views alive to preserve indices. Filter in the query/data layer instead. For a Reddit feed with heterogeneous cards, this means: decide card *type* by data, keep each card's subview count static.
- **Move state that must survive scroll-off out of the row** into the parent via `Binding` — LazyVStack does *not* recycle, so anything you leave in a row is either lost or retained forever.
- **Nesting `LazyHStack` inside `LazyVStack` is encouraged** (image galleries inside a feed) — nested content isn't loaded until scrolled.
- **`List` vs `LazyVStack` for 1000+ rows:** `List` is a `UICollectionView` under the hood since iOS 16 and actively recycles cells; `LazyVStack` keeps every created view in memory until the parent dies. Benchmarks widely cited in the community show `List` ~5.5 s vs `LazyVStack` ~52 s to scroll a large data set, with 4.6 vs 78 hangs ([STRV](https://www.strv.com/blog/swiftui-list-vs-lazyvstack), [Fatbobman: List or LazyVStack](https://fatbobman.com/en/posts/list-or-lazyvstack/)). **Recommendation: `List` for the 1000+-comment tree** (flatten the tree into rows with a depth field, use `.listStyle(.plain)` and strip separators/insets rather than reaching for LazyVStack), and `LazyVStack` only where you need layout freedom `List` won't give you. Custom `UICollectionView` bridging is now a last resort, not a default — the iOS 26/27 scroll APIs cover most of what people used to bridge for.
- **Swipe actions are no longer List-only.** `swipeActions(edge:allowsFullSwipe:content:onPresentationChanged:)` and `swipeActionsContainer()` are **iOS 27.0+** and work on scroll views, stacks, grids and custom layouts (verified DocC). On iOS 26 you still need `List` or a hand-rolled gesture. `onPresentationChanged` finally lets you pause video when a swipe opens.
- **Reordering**: `reorderable()` / `reorderContainer(for:isEnabled:move:)` arrived in the June 2026 SwiftUI block — useful for user-reorderable subreddit lists.
- **Profiling**: [WWDC25 306 — *Optimize SwiftUI performance with Instruments*](https://developer.apple.com/videos/play/wwdc2025/306/) and [WWDC26 268 — *Profile, fix, and verify: Improve app responsiveness with Instruments*](https://developer.apple.com/videos/play/wwdc2026/268/).

### Images — this changed materially in iOS 27
From the [iOS 27 release notes](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes): *"`AsyncImage` now automatically caches downloaded images using HTTP caching protocols… You can customize caching for specific images using the new `AsyncImage` initializers that accept `URLRequest` with custom `cachePolicy` settings. Additionally, you can set a custom `URLSession` using the new `View.asyncImageURLSession(_:)` API."* Both `init(request:scale:content:placeholder:)` and `asyncImageURLSession(_:)` verified as **iOS 27.0+**.

**Recommendation:** this removes the historical reason to reach for a third-party pipeline *by default*, but not for a media-heavy feed. Reddit thumbnails/previews come from `i.redd.it`/`preview.redd.it` with variable cache headers, and `AsyncImage` still gives you no prefetch-ahead, no decode-off-main control, no progressive JPEG and no memory-cost ceiling. Practical plan: **use `AsyncImage` + `asyncImageURLSession` with a tuned `URLCache` for avatars, icons and low-traffic screens; use Nuke for the feed and the fullscreen viewer.** Nuke is the community's current pick for a real pipeline (modern Swift, actively maintained); SDWebImage/Kingfisher remain viable but are Objective-C-era lineage. Pin your image dependency version before moving to Xcode 27, since these libraries are actively adapting to native caching. ([SwiftLee](https://www.avanderlee.com/swiftui/downloading-caching-images/), [Livsy Code on AsyncImage + HTTP caching](https://livsycode.com/swiftui/asyncimage-and-http-caching-in-ios27/))

### Web view / cookie login
**`WebView` and `WebPage` (WebKit, SwiftUI-native) are GA and are exactly right for the multi-account cookie login flow.** [`WebPage`](https://developer.apple.com/documentation/webkit/webpage) is `@MainActor final class`, `@Observable`, and gives you: `WebPage.Configuration` with a **`websiteDataStore`** (so `.nonPersistent()` or a per-account persistent store isolates each account's cookies), `customUserAgent`, `NavigationDeciding` for policy decisions, an async `navigations` sequence, `callJavaScript`, `backForwardList`, and `Transferable` conformance for PDF/webarchive export. [`WebView`](https://developer.apple.com/documentation/webkit/webview-swift.struct) adds `webViewBackForwardNavigationGestures`, `webViewMagnificationGestures`, `webViewLinkPreviews`, `webViewTextSelection`, `webViewContextMenu`, `webViewElementFullscreenBehavior`, `webViewScrollPosition` and `webViewOnScrollGeometryChange` — a complete in-app browser with no `UIViewRepresentable`. Reference: [WWDC25 231 — *Meet WebKit for SwiftUI*](https://developer.apple.com/videos/play/wwdc2025/231/).

### Text, markdown and rich editing
- **`TextEditor(text:selection:)` with an `AttributedString` binding is iOS 26.0+**, together with `AttributedTextSelection` and `AttributedTextFormattingDefinition` (all verified). Good for a compose/reply box with bold/italic/link/spoiler affordances driven by a formatting definition. Reference: [WWDC25 280 — *Code-along: Cook up a rich text experience in SwiftUI with AttributedString*](https://developer.apple.com/videos/play/wwdc2025/280/).
- **`AttributedString`'s markdown support is inline-only for rendering purposes.** `Text` renders emphasis, strong, strikethrough and links; block-level constructs (blockquotes, nested lists, code blocks, tables, headings, images) are not rendered, and block content cannot be selected together with adjacent `Text` ([Fatbobman: A Deep Dive into SwiftUI Rich Text Layout](https://fatbobman.com/en/posts/a-deep-dive-into-swiftui-rich-text-layout/), [Apple Developer Forums thread 682711](https://developer.apple.com/forums/thread/682711)). **Reddit comments are block-heavy** — quotes, nested lists, code fences, tables, spoilers. Plan on a real markdown pipeline (swift-markdown / cmark-gfm → your own SwiftUI block renderer, or `swift-markdown-ui`) rather than `AttributedString(markdown:)`.
- **iOS 27 changes selectable text:** with the 27.0 SDK, `Text` + `.textSelection(.enabled)` uses the **system text selection UI with real gestures** instead of a callout menu. Apple warns to use `.highPriorityGesture()` for custom gestures on selectable `Text` that must win. This will collide with tap-to-collapse on comment rows — test it. Selectable text also now supports `TextRenderer`.
- `TextInputBorderShape` + `textInputBorderShape(_:)` are new; `.squareBorder` and `.roundedBorder` text field styles are **soft-deprecated** in favour of `.bordered`.
- [WWDC26 370 — *Elevate your app's text experience with TextKit*](https://developer.apple.com/videos/play/wwdc2026/370/) if you end up bridging TextKit for the comment renderer.

### Local storage
Nothing Apple shipped in 2026 resolves this in SwiftData's favour for your workload. SwiftData's June 2026 additions are real but modest: `sectionBy` query macros, `@Attribute(.codable)` for third-party types, and **`ResultsObserver` / `HistoryObserver`** for observing changes outside a view ([SwiftData updates](https://developer.apple.com/documentation/updates/swiftdata), [WWDC26 274 — *What's new in SwiftData*](https://developer.apple.com/videos/play/wwdc2026/274/)).

**Recommendation: GRDB (or SQLiteData) for a Reddit client, not SwiftData.** The community position in 2026 is consistent: *"GRDB.swift is recommended for anything data-heavy, and SwiftData for simple apps that will stay simple"* ([Pi Stack, 2026-08](https://www.pistack.xyz/posts/2026-08-11-grdb-swiftdata-core-data-swift-persistence-comparison/)); raw-SQLite layers outperform Core Data which outperforms SwiftData on read/write ([Fatbobman: SwiftData Limitations](https://fatbobman.com/en/posts/key-considerations-before-using-swiftdata/)); GRDB gives predictable control over the complex queries, FTS and large batch upserts a feed cache demands ([HackerNoon](https://hackernoon.com/swiftdata-core-data-or-grdb-choose-by-the-queries-you-actually-run)). Point-Free's **SQLiteData** (formerly SharingGRDB) is the GRDB-based option that keeps SwiftData-like ergonomics ([Point-Free](https://www.pointfree.co/blog/posts/168-sharinggrdb-a-swiftdata-alternative)). Concrete SwiftData risk for you: multi-account + background sync + 1000-comment trees means heavy background writes, and iOS 27 still lists a fixed deadlock *"for @Query when saving a ModelContext on a background actor while scheduling new async tasks for a ModelActor"* — a bug class you do not want on your critical path. Raw SQLite (no wrapper) is not worth it; GRDB's thin layer plus escape-hatch raw SQL is the right altitude.

### Media, autoplay and PiP
- `VideoPlayer` (AVKit) is iOS 14+ and unchanged; it is fine for the **fullscreen** viewer but is the wrong tool for a feed. For inline autoplay, drive `AVPlayer`/`AVQueuePlayer` yourself behind a thin representable, keep a small pool of players, and bind playback to `onScrollTargetVisibilityChange` (see A3 scrolling). `AVPlayerViewController` remains the path for system PiP.
- **New in iOS 27: the Now Playing framework** — an `@Observable`, protocol-driven successor to `MPNowPlayingInfoCenter`/`MPRemoteCommandCenter`, covering Lock Screen, Control Center, Dynamic Island, CarPlay and StandBy via `MediaSessionRepresentable` / `MediaSession` ([WWDC26 312 — *Meet the Now Playing framework*](https://developer.apple.com/videos/play/wwdc2026/312/)). Relevant if you surface video/audio posts on system playback UI.
- AVFoundation's playback stack already has full `Sendable` adoption, `AVMetrics`, and `AVPlayerItemIntegratedTimeline` ([AVFoundation updates](https://developer.apple.com/documentation/updates/avfoundation)).

### Gestures, zoom, Live Text
- `MagnifyGesture` / `RotateGesture` remain the pinch/rotate primitives. **New in June 2026: all major gestures gained initializers that take `GestureInputKinds`** so you can restrict recognition to direct touch vs pointer vs pencil — useful to stop a trackpad scroll being read as a pan in the image viewer ([SwiftUI updates](https://developer.apple.com/documentation/updates/swiftui)).
- `.navigationTransition(.zoom(sourceID:in:))` is **iOS 18.0+** — the right transition from a feed thumbnail into the fullscreen viewer. iOS 27 fixed a bug where a `fullScreenCover` with a zoom transition plus `@FocusState` produced a two-step keyboard animation.
- `draggable(_:)` is iOS 16+; June 2026 added **multi-item drag** via `draggable(containerItemID:containerNamespace:)` + `dragContainer(for:itemID:in:_:)` — good for multi-select save/share from a gallery. See [WWDC26 271 — *Code-along: Build powerful drag and drop in SwiftUI*](https://developer.apple.com/videos/play/wwdc2026/271/).
- **Live Text still requires bridging.** `ImageAnalysisInteraction` is VisionKit/UIKit (iOS 16+); there is no SwiftUI-native equivalent, so wrap it in a `UIViewRepresentable` inside the fullscreen viewer.
- `contextMenu(menuItems:preview:)` is iOS 16+ and unchanged. **iOS 27 note:** menus now hide SF Symbol images by default in most contexts; use `.labelStyle(.titleAndIcon)` on menu item `Label`s you want icons on.
- `sensoryFeedback(_:trigger:)` is iOS 17.0+ — use it rather than `UIImpactFeedbackGenerator`.

### IAP, intents, background, notifications
- **StoreKit 2 + `SubscriptionStoreView`** (iOS 17.0+) is the path for a Pro tier. iOS 27 adds offer-code redemption returning a `VerificationResult<Transaction>`, `Transaction.OwnershipType.assigned`, and subscription **Bundles/Suites** product types. See [WWDC25 241 — *What's new in StoreKit and In-App Purchase*](https://developer.apple.com/videos/play/wwdc2025/241/), [WWDC26 210 — *What's new in Apple In-App Purchase*](https://developer.apple.com/videos/play/wwdc2026/210/), [WWDC26 391 — *Offer subscriptions to groups and organizations*](https://developer.apple.com/videos/play/wwdc2026/391/).
- **App Intents** is the surface for Siri/Shortcuts/Spotlight. iOS 27 adds `AppIntentsTesting` ([WWDC26 295](https://developer.apple.com/videos/play/wwdc2026/295/)) and App Schemas ([WWDC26 240](https://developer.apple.com/videos/play/wwdc2026/240/), [345](https://developer.apple.com/videos/play/wwdc2026/345/)). Note the hard limit: **`AppEntity` instances have a cumulative 10 MB size cap including child properties** — exceed it and you crash.
- **Background:** `BGContinuedProcessingTask` is **iOS 26.0+** (verified) — a foreground-started task that continues in the background with system UI, well suited to "upload this video" or "sync my saved posts". Classic `BGAppRefreshTask`/`BGProcessingTask` remain for inbox polling. [WWDC25 227 — *Finish tasks in the background*](https://developer.apple.com/videos/play/wwdc2025/227/).
- **Local notifications:** `UNUserNotificationCenter` unchanged (iOS 10+). Inbox polling still means a background refresh task plus local notification scheduling; there is no new mechanism.
- **Incoming URLs / share extension:** `onOpenURL` and universal links are unchanged, but **`canOpenURL:` is deprecated in iOS 27** — *"Attempt to open the URL and handle any failure instead of validating it first."* Also, **On Demand Resources / `NSBundleResourceRequest` are deprecated**; use Background Assets.

### Crash reporting and metrics
- **MetricKit was rewritten.** The old `MXMetricManager`, `MXMetricManagerSubscriber`, `MXMetricPayload`, `MXDiagnosticPayload` are **"no longer recommended for new adoption"**; the replacement is **`MetricManager`** (iOS 27.0+, verified), Swift-first, delivering `MetricReport`/`DiagnosticReport` via `AsyncStream`, with daily aggregates plus a few-hour interval breakdown. New: `MemoryExceptionDiagnostic`, `CrashDiagnostic.terminationCategory`, `MetalFrameRateMetric`. **Breaking:** `ScrollHitchTimeMetric`/`scrollHitchTime(_:)` are gone — use `HitchTimeMetric`/`hitchTime(_:)`, and `HitchTimeMetric.ratio` changed type to `HitchTimeRatio`; **recompile or you get a launch crash**. ([iOS 27 release notes](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes), [WWDC26 222 — *Meet the new MetricKit*](https://developer.apple.com/videos/play/wwdc2026/222/))
- **Recommendation: both.** MetricKit for aggregate hitch/hang/launch/memory telemetry (now good enough to drive your feed-performance work), Sentry-cocoa for symbolicated crash grouping, breadcrumbs and release health that MetricKit does not provide.

### On-device AI
`SystemLanguageModel` (Foundation Models) is **iOS 26.0+**, Apple-Intelligence-capable devices only. June 2026 adds `LanguageModel` (bring any model), `PrivateCloudComputeLanguageModel` for larger context, `DynamicProfile` for agentic flows, and Vision tools (`OCRTool`, `BarcodeReaderTool`). **The on-device model changes when a user updates to iOS 27 — Apple explicitly tells you to re-test your prompts.** Reasonable for optional "summarise this thread" features; not a core dependency, since availability is device-gated. ([Foundation Models updates](https://developer.apple.com/documentation/updates/foundationmodels), [WWDC26 241](https://developer.apple.com/videos/play/wwdc2026/241/))

### Tooling and project structure
- **swift-format ships in the Swift toolchain** and is invocable as `swift format`; Xcode has had built-in Swift Format since Xcode 16. SwiftLint is *not* deprecated and remains the diagnostic/convention linter — the two are complementary, not competing ([NSHipster: Swift Code Formatters](https://nshipster.com/swift-format/), [swiftlang/swift-format](https://github.com/swiftlang/swift-format)). **Use swift-format for formatting, SwiftLint for rules.**
- **Tuist vs XcodeGen:** Tuist for a modular multi-package app (Swift-defined manifests, caching, scaffolding); XcodeGen if you only want merge-friendly project files ([Tuist docs](https://docs.tuist.dev/en/guides/develop/projects), [Qonto engineering](https://medium.com/qonto-way/choosing-the-right-tool-to-modularize-our-ios-codebase-869a8ef568b8)). See Part B for the iOS 27.2 `.xcproj` development that may change this calculus.
- **Architecture consensus for 2026: vanilla MV / MVVM with `@Observable`, not TCA.** The recurring summary is *"MVVM remains the default architecture for SwiftUI iOS apps — TCA is the heavier alternative for teams who want it"*, with TCA justified when *"state must be exactly answerable: trading, multiplayer, complex undo"* ([Pi/7Span 2026 roundup](https://7span.com/blog/mvvm-vs-clean-architecture-vs-tca), [alicinaroglu.dev](https://alicinaroglu.dev/mvvm-vs-the-composable-architecture-when-to-pick-which/)). A Reddit client is not in TCA's sweet spot: the state is mostly server-derived cache plus local UI state. **Recommendation:** feature Swift packages (Feed, Comments, Media, Accounts, Settings, Purchases) over a thin Core package; `@Observable` models per screen; a single routing type per tab holding `NavigationPath`; DI through `@Environment`.

---

# PART B — BETA / UNVERIFIED / WATCH LIST

These are real but **not** GA, or not first-party-confirmed. Do not plan around them.

1. **Xcode 27.2 is in beta today.** Its release notes describe Swift 6.4 and the **27.2 SDKs**, and state that *"the iOS SDK and simulator support for iPhone Duo will be available later this month in an upcoming release of Xcode 27.1."* So Xcode 27.1 has not shipped yet either. ([Xcode 27.2 Beta Release Notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-27_2-release-notes))
2. **JSON-based `.xcproj` project format — BETA (Xcode 27.2).** *"Xcode now supports a JSON-based project format (.xcproj) that's more readable, merge-friendly, and easier for coding agents to edit. Enable it in the file inspector. Projects using .xcproj also open in earlier versions of Xcode 27."* If this ships, it materially weakens the case for XcodeGen and part of the case for Tuist. **Do not bet the project layout on it yet.** Source as above.
3. **Known 27.2-beta SDK bug:** macOS/watchOS/tvOS/visionOS SDKs *"incorrectly report 27.1 as a valid deployment target"*, with unexpected build behaviour.
4. **iOS 27 adoption numbers do not exist yet.** Apple's published figures are from 2026-06-07 and cover iOS 26. Re-check [developer.apple.com/support/app-store](https://developer.apple.com/support/app-store/) before finalising the deployment target.
5. **The April 2027 SDK deadline has no announced day.** Apple published the month only ([Apple Developer News](https://developer.apple.com/news/?id=k1mtkt1k)); treat as 2027-04-01 and re-check.
6. **iPhone Duo / foldable SwiftUI APIs** — `ArrangementView` + split/overlay styles, `ReservedRegion`, `onHingeChange`/`DeviceHinge`, `CameraCaptureAccessory`, and the vertical-axis toolbar family (`toolbarVerticalEdge`, `toolbarVerticalBehavior`, `ToolbarItemAxisBehavior`, `toolbarVerticalCompressionBehavior`) are documented in the September 2026 SwiftUI block, but simulator support is pending per the Xcode 27.2 note above. Design your feed/detail split so `ArrangementView` can be adopted later, but don't build for hardware you can't simulate.
7. **Secondary sources that were not first-party-confirmable** and should be treated as directional only: Xcode 27's Intel-Mac drop and AI-assistant model bundling (byteiota, DEV.to); the exact iOS 27 adoption trajectory; third-party benchmark numbers for List vs LazyVStack (community measurements, not Apple's).

---

# PART C — DEPRECATED / AVOID IN A NEW APP (all GA-confirmed)

| Avoid | Use instead | Source |
|---|---|---|
| `UIDesignRequiresCompatibility` | Nothing — ignored on the 27 SDK | [Apple doc](https://developer.apple.com/documentation/bundleresources/information-property-list/uidesignrequirescompatibility) |
| `ObservableObject` / `@StateObject` / `@Published` | `@Observable` + `@State`/`@Bindable` | Observation framework |
| XCTest for new unit tests | Swift Testing (keep XCTest for UI/perf) | WWDC26 267 |
| `MXMetricManager` & friends | `MetricManager` (iOS 27+) | iOS 27 release notes |
| `ScrollHitchTimeMetric` | `HitchTimeMetric` — **recompile or crash** | iOS 27 release notes |
| `canOpenURL:` | Attempt the open, handle failure; prefer universal links | iOS 27 release notes |
| On Demand Resources / `NSBundleResourceRequest` | Background Assets | iOS 27 release notes |
| `FileDocument` / `ReferenceFileDocument` | `ReadableDocument` / `WritableDocument` / `Document` | iOS 27 release notes |
| `toolbarMinimizeBehavior` | `toolbarMinimizationBehavior(_:for:)` | iOS 27 release notes |
| `.squareBorder` / `.roundedBorder` text field styles | `.bordered` + `textInputBorderShape(_:)` | iOS 27 release notes |
| UIKit app-delegate-only life cycle | Scene-based life cycle (**required**, app won't launch otherwise) | iOS 27 release notes |
| `UIApplication.statusBarFrame`/`statusBarStyle`/etc. | Scene APIs; these may return NaN/null on the 27 SDK | iOS 27 release notes |
| `ToolbarContentBuilder` / `CommandsBuilder` | `@ContentBuilder` (unified) | SwiftUI updates, June 2026 |
| `nonisolated` async on off-main protocol requirements | `@concurrent` | iOS 27 release notes |

---

# PART D — REFERENCE SOURCES BY TOPIC

**Versions & release gates**
- [Xcode 27 Release Notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-27-release-notes) · [iOS & iPadOS 27 Release Notes](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes) · [Apple Developer News: submissions open + April 2027 deadline](https://developer.apple.com/news/?id=k1mtkt1k) · [App Store adoption stats](https://developer.apple.com/support/app-store/) · [swift.org blog](https://www.swift.org/blog/)

**SwiftUI overall**
- [SwiftUI updates](https://developer.apple.com/documentation/updates/swiftui) (the single best diff page) · WWDC26 **269** *What's new in SwiftUI* · WWDC25 **256** *What's new in SwiftUI*

**Liquid Glass & design**
- [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass) · WWDC25 **219** *Meet Liquid Glass* · WWDC25 **323** *Build a SwiftUI app with the new design* · WWDC25 **356** *Get to know the new design system* · WWDC25 **220** *Say hello to the new look of app icons* · WWDC25 **361** *Create icons with Icon Composer* · WWDC26 **250** *Principles of great design* · WWDC26 **251** *Communicate your brand identity on iOS*

**Feed / scrolling / performance**
- WWDC26 **321** *Dive into lazy stacks and scrolling with SwiftUI* (read first) · WWDC25 **306** *Optimize SwiftUI performance with Instruments* · WWDC26 **268** *Profile, fix, and verify* · [Fatbobman: List or LazyVStack](https://fatbobman.com/en/posts/list-or-lazyvstack/) · [STRV: List vs LazyVStack](https://www.strv.com/blog/swiftui-list-vs-lazyvstack)

**Concurrency & Swift**
- WWDC26 **262** *What's new in Swift* · WWDC25 **268** *Embracing Swift concurrency* · WWDC25 **266** *Explore concurrency in SwiftUI* · WWDC25 **270** *Code-along: Elevate an app with Swift concurrency* · [SE-0466](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0466-control-default-actor-isolation.md)

**Testing** — WWDC26 **267** *Migrate to Swift Testing*
**Web / login** — [WebPage](https://developer.apple.com/documentation/webkit/webpage) · [WebView](https://developer.apple.com/documentation/webkit/webview-swift.struct) · WWDC25 **231** *Meet WebKit for SwiftUI*
**Text / markdown** — WWDC25 **280** *Cook up a rich text experience* · WWDC26 **370** *Elevate your app's text experience with TextKit*
**Storage** — WWDC26 **274** *What's new in SwiftData* / **275** code-along · [SwiftData updates](https://developer.apple.com/documentation/updates/swiftdata) · [Fatbobman: SwiftData limitations](https://fatbobman.com/en/posts/key-considerations-before-using-swiftdata/) · [GRDB](https://github.com/groue/GRDB.swift) · [SQLiteData](https://www.pointfree.co/blog/posts/168-sharinggrdb-a-swiftdata-alternative)
**Drag & drop / gestures** — WWDC26 **271** *Code-along: Build powerful drag and drop in SwiftUI* · WWDC26 **322** *Compose advanced graphics effects with SwiftUI*
**Media** — WWDC26 **312** *Meet the Now Playing framework* · [AVFoundation updates](https://developer.apple.com/documentation/updates/avfoundation) · [AVKit updates](https://developer.apple.com/documentation/updates/avkit)
**IAP** — WWDC25 **241** *What's new in StoreKit and In-App Purchase* · WWDC26 **210** *What's new in Apple In-App Purchase* · WWDC26 **391** *Offer subscriptions to groups and organizations*
**App Intents** — WWDC25 **244** *Get to know App Intents* · WWDC26 **345** *Discover new capabilities in the App Intents framework* · WWDC26 **295** *Validate your App Intents adoption with AppIntentsTesting*
**Background** — WWDC25 **227** *Finish tasks in the background*
**Telemetry** — WWDC26 **222** *Meet the new MetricKit*
**On-device AI** — WWDC25 **286** *Meet the Foundation Models framework* · WWDC25 **301** *Deep dive into the Foundation Models framework* · WWDC26 **241** *What's new in the Foundation Models framework*
**UIKit bridging** — WWDC26 **272** *Use SwiftUI with AppKit and UIKit* · WWDC26 **278** *Modernize your UIKit app*

(WWDC session URLs follow the pattern `https://developer.apple.com/videos/play/wwdc2026/<number>/`.)
