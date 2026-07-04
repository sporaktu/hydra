# CircleCI: Android APK build + download link

## Problem

The existing `.circleci/config.yml` `release` workflow builds iOS on EAS and
submits it to TestFlight on every `v*` git tag. There is no equivalent for
Android — no build runs, and there's nothing to install/test the app on an
Android device without going through Expo/EAS manually.

## Goal

On every `v*` release tag, alongside the existing iOS build+submit job, also
build an installable Android APK on EAS and surface a direct download link
for it — with no new secrets, integrations, or Play Store setup.

## Design

### 1. `eas.json`

Add an `android` override to the `production` build profile:

```json
"production": {
  "channel": "master",
  "autoIncrement": true,
  "env": { ... existing ... },
  "android": {
    "buildType": "apk"
  }
}
```

Without this, EAS defaults Android builds under `production` to an `.aab`
(Play Store bundle), which isn't directly installable. `buildType: apk`
produces a sideloadable `.apk`.

### 2. `.circleci/config.yml`

**Shared `verify_env_vars` command.** The iOS job already has an inline
"verify required env vars are present" step (a bash loop over a hardcoded
list of 9 var names). Extract that loop into a new reusable command,
parameterized by a `var_names` parameter, alongside the existing `install_eas`
/ `install_deps` commands. `ios_build_and_submit` is updated to call it with
its existing 9-var list instead of inlining the loop, and the new
`android_build` job calls it with its own (shorter) list. This keeps the
check-required-vars logic in one place so a future rename/addition can't be
updated in one job and forgotten in the other.

New job `android_build`, reusing `install_eas` / `install_deps` /
`verify_env_vars`:

- `checkout`
- `install_eas`
- `install_deps`
- `verify_env_vars` with `EXPO_OWNER` and `EAS_PROJECT_ID` (same vars the iOS
  job already requires to resolve the EAS project). `ANDROID_PACKAGE` stays
  optional — `app.config.ts` already falls back to `com.dmilin.hydra` when
  unset.
- Run EAS build in JSON mode so the result is machine-readable:
  ```
  eas build --platform android --profile production --non-interactive --json > eas-android-build.json
  ```
- A small Node step parses `eas-android-build.json` and extracts the artifact
  download URL (the direct `.apk` link EAS returns for a finished build).
  **This step must fail loudly, not silently, when there's no usable URL:**
  if the build's `status` isn't the completed/finished state, or the expected
  artifact URL field is missing/empty, the script exits non-zero (via
  `process.exit(1)` after printing a clear error) instead of writing an
  empty/undefined value. That makes the CircleCI step — and therefore the
  job and workflow — fail whenever the EAS build itself failed, times out, or
  is cancelled, rather than reporting green with no real download link.
- Only on success: print the URL plainly in the job log (CircleCI
  auto-linkifies `https://` URLs in log output) **and** write it to
  `android-apk-download-link.txt`, which gets `store_artifacts`'d — so the
  link is reachable both by reading the job log and via the CircleCI
  Artifacts tab.

No signing setup is needed: EAS auto-generates and manages an Android upload
keystore on first non-interactive build, the same way it already manages iOS
signing credentials from the ASC API key.

`android_build` runs in the `release` workflow next to `ios_build_and_submit`
— same `v*` tag filter, same `hydra-cci` context, no dependency between the
two jobs (they run in parallel).

### 3. `docs/ci/circleci-testflight-setup.md`

Update to describe the Android job: it runs automatically on every release
tag, requires no additional one-time setup beyond what's already documented
(`ANDROID_PACKAGE` is already listed as an optional context var), and where
to find the resulting download link (job log output, or the job's Artifacts
tab).

## Explicitly out of scope

- No Google Play submission (would need a Play Console service-account key
  and an existing app listing, and typically wants an `.aab` not `.apk`).
- No Slack/GitHub notification integration — the CircleCI job log + artifact
  is sufficient per the user's preference.
- No separate "build Android on every push to master" workflow — Android
  builds stay tied to the same `v*` tag release cadence as iOS.

## Testing

This is a CI pipeline change; it's validated by cutting a real release (`npm
run release -- --patch`) and confirming the `android_build` job appears in
the `release` workflow, completes, and prints/stores a working `.apk`
download URL. No unit tests apply.
