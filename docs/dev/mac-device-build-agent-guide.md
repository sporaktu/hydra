# Mac local device build — agent guide

**Audience:** a Claude agent running on the user's **macOS** machine, on this PR branch
(`feat/video-switcher-2026-06-21`). **Goal:** build the app from source and install it on
the user's **physical iPhone** (or the iOS Simulator) — no TestFlight, no App Store review —
then run the on-device QA for the three features this branch ships.

You are executing directly on the user's Mac. Unlike the branch's original (Windows) execution
environment, npm script wrappers work normally here — use `npm test` / `npm run tsc` /
`npm run ios` as written.

---

## What this app is (so you don't get surprised)
- **Expo SDK 55, managed workflow.** There is **no `ios/` directory committed** — `expo prebuild`
  (run automatically by `expo run:ios`) generates the native project. Do not hand-edit native files;
  re-run prebuild instead.
- React Native 0.83, `expo-video ~55`, `react-native-mmkv`, `react-native-nitro-modules`,
  `react-native-reanimated`, `@sentry/react-native`. These require a **real native build**
  (the Simulator/dev-client build covers them; Expo Go will NOT — do not use Expo Go).
- Identity in `app.config.ts` is **env-overridable** with upstream defaults: `EAS_PROJECT_ID`,
  `EXPO_OWNER`, `IOS_BUNDLE_ID`, `ANDROID_PACKAGE`. The default iOS bundle id is `com.dmilin.hydra`
  (the upstream author's — **you cannot sign with it**). See Signing below.

## Before you start — confirm with the user
Ask (or confirm) these; they determine the path:
1. **Target:** physical iPhone (cabled via USB) or iOS Simulator? (Physical = real device QA; Simulator = quickest but can't fully test some native behaviors.)
2. **Apple signing:** do they have a paid Apple Developer account, or should you use **free "personal team"** signing? Free personal team works for a cabled device but the app **expires after 7 days** and needs a **unique bundle id**.
3. **Bundle id to use:** for any on-device signing they need a bundle id unique to their Apple ID — e.g. `com.<theiruser>.hydra`. Do NOT use `com.dmilin.hydra`.
4. **Apple Developer Team name/ID** (for setting the signing team).

## Environment checks (run first, report anything missing)
```bash
sw_vers                       # macOS version
xcodebuild -version           # Xcode installed?
xcode-select -p               # command line tools path
xcrun simctl list devices | head   # simulators available
node -v && npm -v             # Node (project uses Node 22.x)
pod --version || gem list cocoapods   # CocoaPods (RN needs it; `sudo gem install cocoapods` or `brew install cocoapods` if absent)
watchman --version || echo "watchman optional"
xcrun xctrace list devices    # connected physical devices (find the iPhone + its UDID)
```
If Xcode or CocoaPods is missing, stop and tell the user what to install (Xcode from the App Store; open it once to accept the license: `sudo xcodebuild -license accept`).

## Step 1 — Install JS dependencies
```bash
npm install
```
If `npm install` fails on a native postinstall, report the exact error — do not silently `--ignore-scripts` unless you confirm the failing package isn't needed for the build.

## Step 2 — Set the signing identity (bundle id + team)
The simplest, source-controlled way is to set the bundle id via env when you build, e.g.:
```bash
export IOS_BUNDLE_ID=com.<theiruser>.hydra
```
(Or edit the `iosBundleIdentifier` default in `app.config.ts` — but don't commit the user's identity to the PR.)

Sentry source-map upload will **warn and skip** without `SENTRY_AUTH_TOKEN` — that's fine and does not block the build. Ignore that warning.

## Step 3 — Build & install
### Path A (recommended): cabled physical iPhone
1. Plug in the iPhone, unlock it, and "Trust This Computer" if prompted.
2. Run:
   ```bash
   npx expo run:ios --device
   ```
   - This runs `expo prebuild` (generates `ios/`), `pod install`, builds with Xcode, and installs to the device.
   - Select the iPhone if prompted (or pass `--device "<device name>"`).
3. **Signing:** the first build needs a development team. If the CLI build fails with a signing error:
   - Open the generated workspace: `open ios/*.xcworkspace`
   - In Xcode: select the app target → **Signing & Capabilities** → check **Automatically manage signing** → pick the user's **Team** → confirm the unique bundle id from Step 2.
   - Build/Run once from Xcode (▶) to let it register the device and provisioning, then `npx expo run:ios --device` will work for subsequent runs.
4. On the device, first launch may require trusting the developer:
   **Settings → General → VPN & Device Management → Developer App → Trust**.

### Path B: iOS Simulator (fastest, partial QA)
```bash
npx expo run:ios          # boots a simulator and installs; no signing/team needed
```
Good for the subreddit switcher and general smoke tests; physical-device behaviors (real video decoding under memory pressure, rotation, background/foreground) are best on Path A.

### Optional: dev client + Fast Refresh (for iterating, not just one install)
After a successful `expo run:ios` build (it includes `expo-dev-client`):
```bash
npx expo start --dev-client    # then open the app on the device/sim to load JS with hot reload
```

## Step 4 — Sanity-check the JS layer (optional but quick)
```bash
npm run tsc      # should be clean (exit 0)
npm test         # 43 tests / 7 suites should pass
```
If `npm test` or `npm run tsc` errors with "command not found" for jest/tsc (unexpected on Mac), fall back to `node node_modules/jest/bin/jest.js` / `node node_modules/typescript/bin/tsc --noEmit`.

## Step 5 — On-device QA (the reason for building locally)
This branch ships three features whose UI/native behavior could not be verified in the original
(headless) environment. Exercise each and report results. Use a Reddit account with NSFW/gif
content visible to hit redgifs.

### C — Redgifs lazy resolution (the "black tile" fix)
- [ ] Scroll a redgifs-heavy feed past 40+ posts: **no permanent black tiles** — each video shows a spinner then plays, or a "Couldn't load video. Tap to retry." tile (never a frozen black square).
- [ ] Redgifs videos autoplay inline (muted, looping) with Wi-Fi/data on.
- [ ] Toggle Airplane Mode, scroll to an unresolved redgifs post → tap-to-retry tile appears → turn networking back on → tap it → video loads. **On Android the tile must be tappable** (box-none fix) — but here you're on iOS; confirm it works on iOS.
- [ ] Non-redgifs videos (v.redd.it, imgur .gifv) play with no regression and no spurious spinner.
- [ ] Open a redgifs post fullscreen, tap **Share** → the shared/downloaded file is a real playable mp4 (not 0-byte/HTML).
- [ ] (Stale-URL recovery) If you can reproduce an expired cached redgifs URL mid-session, confirm the video auto-recovers (the player swaps to the freshly re-resolved URL) rather than staying errored.

### D — Shared video player registry
- [ ] Tap a feed video → fullscreen opens at the **same playback position** with **no reload spinner** (player is shared).
- [ ] Close the viewer → the feed video is still playing and is **muted again**.
- [ ] In fullscreen, **rotate** to landscape and back → video does **not** reload and keeps its position.
- [ ] Scrub/seek (touch scrubber), play/pause work in fullscreen; playback resumes.
- [ ] Background the app while the viewer is open, then foreground → resumes without a full reload.
- [ ] Scroll the feed fast past many videos → no crash; memory stays bounded (off-screen players are reaped).

### B — Subreddit switcher
- [ ] On a subreddit feed (e.g. r/askreddit), the **header title shows a chevron**; tapping it opens the `QuickSubredditSearch` overlay. Same on Home, r/popular, r/all, and a multireddit.
- [ ] In the switcher, type an obscure-but-real sub → a pinned **"Go to r/{name}"** row appears with its icon; tapping it navigates there. Pressing the keyboard **"go"** key also navigates.
- [ ] Type a private/quarantined sub you know → the pinned row still appears (resolves), and navigating shows the existing private/banned error screen.
- [ ] Type a non-existent string (e.g. `asdkjh12345`) → **no** pinned row; pressing return does nothing; fuzzy results still show.
- [ ] Confirm **user pages (u/X), post detail, the Search tab page, and Settings have NO switcher chevron**.
- [ ] Long-press the **Search tab** → the switcher overlay still opens (regression check).

## Troubleshooting
- **CocoaPods failure** (`pod install`): `cd ios && pod repo update && pod install && cd ..`, or delete `ios/Pods` + `ios/Podfile.lock` and re-run. If pods are stale after a prebuild, `npx expo prebuild --clean` then rebuild.
- **Signing error / "no profiles found":** use the Xcode automatic-signing flow in Step 3.3 with the user's Team and a unique bundle id. Free personal team requires a unique bundle id and the device to be registered (Xcode does this on first run).
- **Build cache weirdness:** `npx expo prebuild --clean` (regenerates native dirs), then `npx expo run:ios --device`. As a last resort delete `ios/` and let prebuild regenerate it.
- **`mmkv` / `nitro` / `reanimated` link errors:** these are config-plugin/autolinked; a clean prebuild + pod install resolves most. Report the exact error if it persists.
- **App expires after ~7 days** (free personal team): rebuild to refresh, or use a paid account.
- Do NOT use **Expo Go** — this app has custom native modules; it must be a dev/prebuild build.

## Report back to the user
- Which path you used (cabled device / simulator), bundle id + signing team used.
- Whether the build installed and launched successfully.
- The QA checklist results above (pass/fail per item), with notes on anything broken — especially any redgifs black tile, a fullscreen reload on tap/rotate, or a missing/extra switcher chevron.
- Any signing/pod/prebuild issues you hit and how you resolved them.

Do not commit the user's signing identity (bundle id / team / tokens) to the PR.
