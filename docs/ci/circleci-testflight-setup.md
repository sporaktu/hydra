# CircleCI → TestFlight + Google Play setup (non-interactive EAS Build + Submit)

This repo ships a CircleCI pipeline (`.circleci/config.yml`) that, on every `v*`
git tag, builds the app on **Expo EAS** and submits it to **TestFlight** (iOS)
and the **Google Play internal track** (Android) — **fully non-interactively**.
You never run `eas` in CI, never answer an Apple/Google login prompt there, and
no secret is committed. CircleCI only drives `eas-cli` on a cheap Linux box; the
macOS/Android builds and code signing happen on EAS's cloud. iOS signing uses an
**App Store Connect API key**; the Android upload keystore is generated and
stored by EAS automatically; Play uploads use a **Google service-account key**.

The iOS and Android release jobs run **in parallel and independently**. The
Android job **soft-skips** when its env vars are unset, so you can finish and
ship iOS first without the Android job turning the release red.

Almost all one-time work below is web-portal clicks (Expo, Apple, Google) plus
pasting values into the CircleCI `hydra-cci` context. The one local step is a
one-time interactive iOS credential seeding (§4).

## Table of contents

- [1. Expo account + access token](#1-expo-account--access-token)
- [2. Apple: bundle id, app record, API key, team id](#2-apple-bundle-id-app-record-api-key-team-id)
- [3. CircleCI: context + environment variables](#3-circleci-context--environment-variables)
- [4. Seed iOS signing credentials (one-time, interactive)](#4-seed-ios-signing-credentials-one-time-interactive)
- [5. Bootstrap your EAS project (one-time CI job)](#5-bootstrap-your-eas-project-one-time-ci-job)
- [6. Android: Google Play account, app, service account](#6-android-google-play-account-app-service-account)
- [7. Cut a release](#7-cut-a-release)
- [Notes & gotchas](#notes--gotchas)

---

## 1. Expo account + access token

1. Create a free account at https://expo.dev. Your username/org is the
   `EXPO_OWNER` value. The EAS project slug is `EXPO_SLUG` (this fork uses
   `ghydra`).
2. Create an access token: expo.dev → **Account → Settings → Access Tokens** →
   create. Save it — it becomes the CircleCI `EXPO_TOKEN`. It needs **≥Developer**
   access to the project so it can manage credentials and builds.

---

## 2. Apple: bundle id, app record, API key, team id

You need a paid **Apple Developer Program** membership.

1. **Bundle id.** Choose a unique iOS bundle identifier (e.g.
   `com.yourname.hydra`). This is `IOS_BUNDLE_ID`. It is permanent once the app
   record exists.
2. **App record.** App Store Connect → **My Apps → + → New App**, select/enter
   your bundle id, name it. On the app's **App Information** page note the
   numeric **Apple ID** — that's `ASC_APP_ID`.
3. **App Store Connect API key.** App Store Connect → **Users and Access →
   Integrations → App Store Connect API** → generate a key with the **Admin**
   role (Admin is needed so EAS can manage signing certificates; App Manager
   alone can submit but may not create certs). Download the `.p8` (one-time
   download), and note the **Key ID** (`EXPO_ASC_KEY_ID`) and **Issuer ID**
   (`EXPO_ASC_ISSUER_ID`).
4. **Team id + type.** developer.apple.com → **Membership** → note the **Team
   ID** (`EXPO_APPLE_TEAM_ID`). For a personal account `EXPO_APPLE_TEAM_TYPE` is
   `INDIVIDUAL` (otherwise `COMPANY_OR_ORGANIZATION`, or `IN_HOUSE` for
   enterprise).

Base64-encode the `.p8` for CircleCI (it stores single-line values):

```bash
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy   # now in your clipboard → ASC_API_KEY_BASE64
```

---

## 3. CircleCI: context + environment variables

1. In CircleCI, **Set Up Project** for this repo (use the existing
   `.circleci/config.yml`).
2. Create a **context** named `hydra-cci` (Organization Settings → **Contexts**
   → Create Context) and add the variables below to it. The workflows reference
   this context, so the vars are shared across jobs rather than set per-project:

   | Variable | Value |
   |---|---|
   | `EXPO_TOKEN` | Expo access token (step 1.2) |
   | `EXPO_OWNER` | your Expo account/org owning the project |
   | `EXPO_SLUG` | EAS project slug (`ghydra` for this fork) |
   | `EAS_PROJECT_ID` | filled after step 5 (leave unset for now) |
   | `IOS_BUNDLE_ID` | your iOS bundle id (step 2.1) |
   | `ASC_API_KEY_BASE64` | base64 of the `.p8` (step 2) |
   | `EXPO_ASC_KEY_ID` | API Key ID (step 2.3) |
   | `EXPO_ASC_ISSUER_ID` | Issuer ID (step 2.3) |
   | `EXPO_APPLE_TEAM_ID` | Apple Team ID (step 2.4) |
   | `EXPO_APPLE_TEAM_TYPE` | `INDIVIDUAL` (or your team type) |
   | `ASC_APP_ID` | numeric App Store Connect app id (step 2.2) |
   | `ANDROID_PACKAGE` | Android package name — see §6 (Android only) |
   | `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | base64 of the Play service-account `.json` — see §6 (Android only) |
   | `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | optional, see notes |

> **Bundle id / package on the EAS build server.** `app.config.ts` reads
> `IOS_BUNDLE_ID` and `ANDROID_PACKAGE` when EAS runs `prebuild` on its build
> server. EAS does **not** see CircleCI's env vars there, so also add
> `IOS_BUNDLE_ID` and `ANDROID_PACKAGE` as **EAS environment variables**:
> expo.dev → your project → **Environment Variables** → environment
> **production**, plaintext. Otherwise prebuild falls back to the upstream
> `com.dmilin.hydra` default. (`EXPO_OWNER` / `EXPO_SLUG` / `EAS_PROJECT_ID` are
> only needed by eas-cli in CircleCI, not on the build server.)

---

## 4. Seed iOS signing credentials (one-time, interactive)

EAS **cannot** create an iOS distribution certificate on a `--non-interactive`
CI build from scratch — the first build fails with *"Distribution Certificate is
not validated for non-interactive builds."* You must generate the cert +
provisioning profiles **once, interactively, from your machine**; EAS stores
them and every CI build afterwards reuses them silently.

This app has **two iOS targets** that each need a provisioning profile: the main
app and the **share extension** (from the `expo-sharing` plugin). One interactive
build sets up both.

```bash
# Use the same identity values you put in the hydra-cci context.
export EXPO_TOKEN=…           # the hydra-cci access token
export EXPO_OWNER=…
export EXPO_SLUG=ghydra
export EAS_PROJECT_ID=…       # from §5; do §5 first if you don't have it yet
export IOS_BUNDLE_ID=…

# Interactive (NO --non-interactive): EAS prompts to generate the distribution
# certificate and a provisioning profile for EACH target. Answer "yes" / let EAS
# manage them, authenticating to Apple with the ASC API key or your Apple ID.
npx eas-cli@latest build --platform ios --profile production
```

Once it prints that credentials are set up and the build is queued, you can let
it finish or Ctrl-C — the credentials persist on EAS regardless. Verify with
`npx eas-cli credentials -p ios`.

---

## 5. Bootstrap your EAS project (one-time CI job)

> Skip if you already created the EAS project (this fork's project slug is
> `ghydra`) and have its **projectId** — just set `EAS_PROJECT_ID` in the
> context. The `EXPO_TOKEN` for this fork is a project-scoped robot token that
> **cannot create projects**, so the bootstrap CI job will fail with a
> permission error; create the project in the expo.dev UI instead and copy its
> Project ID.

If you do have a token that can create projects:

1. Push a branch named exactly `eas-bootstrap`:

   ```bash
   git switch -c eas-bootstrap && git push -u origin eas-bootstrap
   ```

2. CircleCI runs the `bootstrap` workflow → `eas init` creates the project and
   the job log prints the **projectId** (`eas project:info`).
3. Copy that id into the `EAS_PROJECT_ID` context var. Delete the
   `eas-bootstrap` branch when done.

---

## 6. Android: Google Play account, app, service account

Skip this whole section if you're not shipping Android yet — the `android`
release job soft-skips until `ANDROID_PACKAGE` and
`GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` are both set in the context.

1. **Google Play Developer account.** Register at
   https://play.google.com/console (one-time **$25** fee). Required to ship any
   Android build.
2. **Package name.** Choose a unique Android package (e.g.
   `com.yourname.hydra`). This is `ANDROID_PACKAGE`. Permanent once the app
   exists. Add it to the context **and** as an EAS **production** env var (§3
   note).
3. **Create the app listing.** Play Console → **Create app**. Fill the minimum
   required app details so the internal-testing track is available.
4. **Service-account key (for non-interactive upload).**
   - Play Console → **Setup → API access** → create / link a **Google Cloud
     project**, then create a **service account**. (Or create it in the Google
     Cloud Console and grant it access from Play Console.)
   - In Play Console → **Users and permissions**, invite the service-account
     email and grant it at least **Release to testing tracks** (admin for the
     app is simplest).
   - In Google Cloud Console, create a **JSON key** for that service account and
     download it. Base64 it for CircleCI:

     ```bash
     base64 -i play-service-account.json | pbcopy   # → GOOGLE_SERVICE_ACCOUNT_JSON_BASE64
     ```
5. **Upload keystore.** Nothing to do — EAS generates and stores the Android
   upload keystore automatically on the first Android build. (Play App Signing
   then re-signs with Google's managed key.)

> **First upload may need to be manual.** Google often rejects the API's *first*
> upload for a brand-new app. If the first CI `eas submit` errors on the Android
> side, download the `.aab` from the EAS build page and upload it once by hand to
> the **internal testing** track in the Play Console; subsequent CI submits then
> work via the API.

---

## 7. Cut a release

1. Bump the app version in `package.json` (`version` drives the iOS marketing
   version and Android `versionName`; EAS auto-increments the iOS build number /
   Android `versionCode` — `eas.json` sets `appVersionSource: remote` +
   `production.autoIncrement`).
2. Tag and push:

   ```bash
   git tag v4.0.2
   git push origin v4.0.2
   ```

3. CircleCI runs the `release` workflow:
   - **iOS** → EAS builds, signs from your ASC API key, and `--auto-submit`
     uploads to App Store Connect. After Apple processing it appears in
     **TestFlight**; add it to a TestFlight group to reach testers.
   - **Android** (if configured) → EAS builds the `.aab`, signs with the
     EAS-managed keystore, and `--auto-submit` uploads to the **internal
     testing** track. Add testers to that track in the Play Console.

---

## Notes & gotchas

- **No secrets in git.** The Apple `.p8` and the Google `.json` are passed as
  base64 env vars and written to disk only during the build; the
  `submit.production.{ios,android}` blocks are injected into `eas.json` at
  runtime from env vars. The committed `eas.json` stays clean.
- **iOS first build needs interactive seeding.** See §4 — non-interactive CI
  cannot create the distribution cert from nothing. Do it once locally.
- **Android keystore is auto-managed.** Unlike iOS, EAS creates and stores the
  Android upload key on the first build; no interactive seeding needed.
- **Android first upload may be manual.** See §6 — Google may require one manual
  `.aab` upload to the internal track before the API will accept submissions.
- **Sentry plugin.** Without `SENTRY_AUTH_TOKEN` (+ `SENTRY_ORG` /
  `SENTRY_PROJECT`) the Sentry plugin **warns and skips** — it does not fail the
  build. Set them for your own crash reporting, or remove the plugin.
- **EAS Build cost.** The builds run on EAS. The free tier covers a limited
  number of iOS + Android builds/month on a low-priority queue; a paid Expo plan
  buys priority/volume.
- **Tags only.** The `release` workflow ignores all branches and runs only on
  `v*` tags. Change the `filters` in `.circleci/config.yml` to also build on
  `master` if you want a faster cadence.

> Update this doc whenever the pipeline's env vars, signing flow, or release
> steps change.
