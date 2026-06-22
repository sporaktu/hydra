# CircleCI → TestFlight setup (EAS Build + Submit)

This repo ships a CircleCI pipeline (`.circleci/config.yml`) that, on every
`v*` git tag, builds the iOS app on **Expo EAS** and submits it to
**TestFlight**. CircleCI only drives `eas-cli` on a cheap Linux box; the macOS
build and code signing happen on Expo's cloud.

You are distributing under **your own** Apple + Expo accounts, so the one-time
work below is mostly account/credential setup. Do it in order.

---

## 0. Set your app identity

`app.config.ts` reads four identity values, each with a fallback to the upstream
(`dmilin`) defaults:

```ts
const projectId = process.env.EAS_PROJECT_ID ?? "7e403d7f-...";   // your EAS project id
const owner = process.env.EXPO_OWNER ?? "dmilin";                 // your Expo username/org
const iosBundleIdentifier = process.env.IOS_BUNDLE_ID ?? "com.dmilin.hydra";
const androidPackage = process.env.ANDROID_PACKAGE ?? "com.dmilin.hydra";
```

**Recommended (simplest): edit the four defaults** to your own values and commit.
This is the most robust option because EAS evaluates `app.config.ts` in *two*
places — locally in CircleCI (to find the project) **and** on the EAS build
server (during `prebuild`, for the bundle id). Hard-coded defaults are seen by
both with zero extra config.

> Advanced alternative: leave the defaults and instead set `EAS_PROJECT_ID`,
> `EXPO_OWNER`, `IOS_BUNDLE_ID`, `ANDROID_PACKAGE` as environment variables in
> **both** CircleCI *and* your EAS project's Environment Variables (Expo
> dashboard, "production" environment). If you only set them in CircleCI, the
> EAS build server's prebuild will fall back to the `dmilin` bundle id. Editing
> the defaults avoids this footgun.

You'll fill in the real `projectId` in step 1.

---

## 1. Expo account + EAS project

1. Create an account at https://expo.dev and install the CLI: `npm install -g eas-cli`.
2. Log in: `eas login`.
3. From the repo root, create an EAS project under your account: `eas init`.
   Because `app.config.ts` is a *dynamic* config, `eas init` will print the new
   **project id** instead of writing it. Copy it into the `projectId` default
   (step 0). Your Expo username is the `owner` value.
4. Create an Expo **access token** for CI: expo.dev → Account → **Settings →
   Access Tokens** → create. Save it — it becomes the CircleCI `EXPO_TOKEN`.

---

## 2. Apple Developer + App Store Connect

1. Enroll in the Apple Developer Program (https://developer.apple.com, ~$99/yr)
   if you haven't.
2. Choose your bundle id (e.g. `com.yourname.hydra`) and put it in the
   `iosBundleIdentifier` default (step 0). (You don't have to pre-register the
   App ID — EAS can create it — but you may, under Certificates, Identifiers &
   Profiles → Identifiers.)
3. Create the app record: App Store Connect → **My Apps → + → New App**, select
   your bundle id, name it. Note the numeric **Apple ID** shown on the app's
   page — that's the `ascAppId` you may need in step 4.
4. Create an **App Store Connect API key**: App Store Connect → **Users and
   Access → Integrations → App Store Connect API** → generate a key with the
   **App Manager** role. Download the `.p8` (one-time download), and note the
   **Key ID** and **Issuer ID**.

---

## 3. Give EAS your Apple credentials (so CI runs non-interactively)

CI cannot answer interactive prompts, so signing + submit credentials must live
on EAS, set up once from your machine:

1. **iOS signing** (distribution certificate + provisioning profile): run one
   build interactively so EAS generates and stores them under your account:

   ```bash
   eas build --platform ios --profile production
   ```

   Log in with your Apple ID when prompted and let EAS manage credentials. After
   this, CI builds (`--non-interactive`) reuse the stored credentials.

2. **App Store Connect API key** (for `eas submit`): attach the `.p8` to EAS:

   ```bash
   eas credentials
   ```

   Choose iOS → your project → **App Store Connect API Key** → add the key
   (`.p8` path, Key ID, Issuer ID). Once stored, `eas submit` finds it
   automatically — CI then needs only `EXPO_TOKEN`.

   > If `eas submit` can't auto-detect the app on first run, add an `ios` block
   > to `submit.production` in `eas.json` with your `ascAppId` (the numeric Apple
   > ID from step 2.3):
   >
   > ```json
   > "submit": { "production": { "ios": { "ascAppId": "1234567890" } } }
   > ```

---

## 4. CircleCI project + environment variables

1. In CircleCI, **Set Up Project** for this repo (Fastest / use existing
   `.circleci/config.yml`).
2. Project Settings → **Environment Variables** → add:

   | Variable | Required | Value |
   |---|---|---|
   | `EXPO_TOKEN` | yes | the Expo access token from step 1.4 |
   | `EAS_PROJECT_ID` | only if you did NOT edit the default | your EAS project id |
   | `EXPO_OWNER` | only if you did NOT edit the default | your Expo username |
   | `IOS_BUNDLE_ID` | only if you did NOT edit the default | your iOS bundle id |
   | `ANDROID_PACKAGE` | only if you build Android | your Android package |
   | `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | optional | see "Sentry" below |

   If you edited the defaults in `app.config.ts` (recommended), you only need
   `EXPO_TOKEN` here.

---

## 5. Cut a release

1. Bump the app version in `package.json` (`version` drives the iOS marketing
   version; EAS auto-increments the build number because `eas.json` sets
   `appVersionSource: remote` + `production.autoIncrement`).
2. Tag and push:

   ```bash
   git tag v4.0.2
   git push origin v4.0.2
   ```

3. CircleCI runs the `release` workflow → `eas build … --auto-submit` →
   the build appears in App Store Connect, and after Apple finishes processing
   it lands in **TestFlight**. Add it to a TestFlight group to reach your
   testers.

To run a build without tagging (e.g. a first smoke test), trigger the pipeline
manually from the CircleCI UI, or run `eas build -p ios --profile production
--auto-submit` locally.

---

## Notes & gotchas

- **Sentry plugin.** `app.config.ts` includes `@sentry/react-native/expo`, which
  tries to upload source maps at build time. Without `SENTRY_AUTH_TOKEN` (+
  `SENTRY_ORG` / `SENTRY_PROJECT`) it **warns and skips** — it does **not** fail
  the build. For your own crash reporting, set those to your Sentry project; or
  remove the plugin from the `plugins` array if you don't want Sentry.
- **No CircleCI macOS plan needed.** EAS does the macOS build, so the Linux
  executor (and the free/standard CircleCI tier) is enough. The build cost is on
  the **EAS** side — the free tier has limited minutes/concurrency; a paid Expo
  plan is recommended for dependable CI releases.
- **First build establishes signing.** The interactive `eas build` in step 3.1
  is what creates your distribution cert/profile on EAS. Skipping it makes the
  CI build fail with a credentials prompt it can't answer.
- **EAS Update channel.** The `production` profile uses channel `master` for OTA
  updates (`eas.json`). That's independent of TestFlight; leave it unless you use
  EAS Update and want a different channel.
- **Tags only.** The workflow ignores all branches and runs only on `v*` tags
  (`.circleci/config.yml`). Change the `filters` there to also build on
  `master` pushes if you want a faster cadence.
