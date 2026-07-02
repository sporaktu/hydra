# Release Branch Strategy — Design

## Problem

Releases are currently cut by tagging `master` directly (documented in
`docs/ci/circleci-testflight-setup.md` §5): bump `package.json` by hand, `git
tag`, `git push origin <tag>`. There's no dedicated release branch, no
scripted version bump, and no review checkpoint before a tag (which triggers
a real EAS build + TestFlight submission) goes out.

## Goals

- A release branch per release: `release/vX.Y.Z`, cut from `master`.
- Version bump scripted, not hand-edited.
- Tag pushed from the release branch — this is what triggers CircleCI.
- Release branch merged back into `master` via a reviewed PR (no auto-merge).
- No changes needed to `.circleci/config.yml` — it already builds on any
  `v*` tag regardless of branch (`filters.tags.only: /^v.*/`,
  `filters.branches.ignore: /.*/`), so a tag pushed from a release branch
  triggers the existing `release` workflow exactly as a tag on `master` does
  today.

## Non-goals

- No auto-merge of the release PR — merging happens manually in GitHub's UI.
- No new CI job, context, or secret. Purely a git/npm-script workflow change.
- No multi-package/monorepo version coordination — `package.json` is the
  single source of truth, as it is today (`app.config.ts` reads
  `packageJson.version` directly).

## Flow

```
master (clean, up to date)
  │
  │  npm run release -- --patch|--minor|--major
  ▼
release/vX.Y.Z  ── bump commit ── tag vX.Y.Z ── push branch + tag
  │                                                  │
  │                                                  ▼
  │                                     CircleCI `release` workflow
  │                                     (EAS build → TestFlight submit)
  │
  ▼
gh pr create (release/vX.Y.Z → master)
  │
  ▼
Human reviews + merges PR in GitHub  (manual, not scripted)
```

## Implementation

### `scripts/release.js`

Plain Node script (no new dependencies — `child_process` + `fs`), invoked via
an npm script. Runs on the dev's machine (Windows/Git Bash/Mac/Linux — Node
avoids a bash-vs-PowerShell split).

Usage:

```
npm run release -- --patch
npm run release -- --minor
npm run release -- --major
```

Steps, in order, aborting with a clear error message if any check fails:

1. **Preconditions**
   - Current branch must be `master`. Abort otherwise.
   - `git status --porcelain` must be empty (clean working tree).
   - `git fetch origin master` then compare local `master` to
     `origin/master`; abort if they've diverged (local must be up to date).
2. **Version bump**
   - Read the bump type from `process.argv` (`--patch` / `--minor` /
     `--major`); require exactly one.
   - Run `npm version <type> --no-git-tag-version` — updates `package.json`
     and `package-lock.json` in place, does **not** commit or tag (that's
     npm's default behavior we're opting out of, since we want our own
     branch/commit/tag sequencing).
   - Read the resulting version back from `package.json` (e.g. `4.1.0`).
3. **Branch**
   - `git checkout -b release/v4.1.0`
   - `git add package.json package-lock.json`
   - `git commit -m "chore: bump version to 4.1.0"`
4. **Tag**
   - Abort if tag `v4.1.0` already exists locally or on `origin` (fetch tags
     first to check).
   - `git tag -a v4.1.0 -m "Release v4.1.0"`
5. **Push**
   - `git push origin release/v4.1.0`
   - `git push origin v4.1.0` — this is what triggers CircleCI's `release`
     workflow.
6. **PR**
   - `gh pr create --base master --head release/v4.1.0 --title "Release v4.1.0" --body <generated>`
   - Print the PR URL and a reminder: "Tag pushed — CircleCI release build
     started. Merge the PR above into master when ready; no further script
     steps needed."

If step 6 (`gh pr create`) fails after the tag has already been pushed (step
5), the script prints the failure and the exact `gh pr create` command to run
manually — it does not attempt to roll back the pushed tag/branch, since the
CI build has already started at that point and rolling back the tag would
desync from what CircleCI is building.

### Docs

Rewrite `docs/ci/circleci-testflight-setup.md` §5 ("Cut a release") to
describe the branch+script flow above instead of "tag master directly by
hand". Keep the section's role (a runbook a future dev/you can follow) but
point at `npm run release -- --patch` (etc.) as the entry point, and describe
what happens after (CI kicks off immediately on tag push; merge the PR
separately, on your own time).

### package.json

Add a `release` script entry:

```json
"release": "node scripts/release.js"
```

## Error handling

Scoped to what can actually happen, not speculative cases:

- Wrong branch / dirty tree / stale master → abort before any mutation.
- Missing or ambiguous bump flag → abort with usage message before any
  mutation.
- Tag already exists (local or remote) → abort before any mutation.
- `gh` not installed / not authenticated → surfaced as a normal command
  failure after the tag push (see step 6 note above) — not pre-checked,
  since `gh auth status` is already confirmed working in this repo.

## Testing

This is a release-orchestration script, not application logic — no unit
tests. Verification is a live dry run against the current repo state
(`master` clean, at `v4.0.1`) as part of executing this plan: run `npm run
release -- --patch`, confirm the branch/tag/push/PR sequence behaves as
designed, then merge the resulting PR.
