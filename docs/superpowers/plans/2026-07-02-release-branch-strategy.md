# Release Branch Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current "tag `master` directly by hand" release process with a scripted `release/vX.Y.Z` branch workflow: `npm run release -- --patch|--minor|--major` bumps the version, cuts the branch, tags it (triggering the existing CircleCI `release` workflow), pushes, and opens a PR back into `master` for manual review/merge.

**Architecture:** A single Node script (`scripts/release.js`, no new dependencies) run via `npm run release`. It performs all precondition/existence checks before any mutation, computes the next version with pure semver arithmetic, then sequences branch → commit → tag → push → PR. A `--dry-run` flag stops before push/PR so the sequencing can be verified without touching origin or CircleCI.

**Tech Stack:** Node.js (`child_process`, `fs` — both built in), `git`, `gh` CLI (already authenticated in this repo against `sporaktu/hydra`).

## Global Constraints

- No new npm dependencies — use only `child_process` and `fs`.
- `.circleci/config.yml` is not modified — it already triggers on any `v*` tag regardless of branch.
- No auto-merge of the release PR — the script stops after opening it.
- `package.json` `version` field remains the single source of truth (`app.config.ts:23` reads `packageJson.version` directly).
- Every existence/divergence check (branch, clean tree, master-sync, tag-existence) must run and pass before any git mutation (checkout/commit/tag) happens.

---

### Task 1: Implement `scripts/release.js`

**Files:**
- Create: `scripts/release.js`

**Interfaces:**
- Produces (for manual verification and Task 2's npm wiring): a CLI script invoked as `node scripts/release.js --patch|--minor|--major [--dry-run]`. Exported for direct testing: `module.exports = { computeNextVersion }`.

- [ ] **Step 1: Create the `scripts/` directory and write `scripts/release.js`**

```javascript
#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PACKAGE_JSON_PATH = path.join(__dirname, '..', 'package.json');
const VALID_BUMPS = ['--patch', '--minor', '--major'];

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function fail(message) {
  console.error(`release.js: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const bumpFlags = argv.filter((a) => VALID_BUMPS.includes(a));
  const dryRun = argv.includes('--dry-run');
  if (bumpFlags.length !== 1) {
    fail(
      `expected exactly one of ${VALID_BUMPS.join(', ')}, got: ${bumpFlags.join(', ') || '(none)'}\n` +
        'Usage: npm run release -- --patch|--minor|--major [--dry-run]'
    );
  }
  return { bumpType: bumpFlags[0].replace('--', ''), dryRun };
}

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  return pkg.version;
}

function computeNextVersion(current, bumpType) {
  const parts = current.split('.').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    fail(`package.json version "${current}" is not a plain X.Y.Z semver`);
  }
  let [major, minor, patch] = parts;
  if (bumpType === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bumpType === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function assertOnMaster() {
  const branch = run('git rev-parse --abbrev-ref HEAD');
  if (branch !== 'master') {
    fail(`must be on master to cut a release (currently on "${branch}")`);
  }
}

function assertCleanTree() {
  const status = run('git status --porcelain');
  if (status !== '') {
    fail('working tree is not clean; commit or stash changes before releasing');
  }
}

function fetchOriginMasterWithTags() {
  run('git fetch origin master --tags');
}

function assertMasterUpToDate() {
  const local = run('git rev-parse master');
  const remote = run('git rev-parse origin/master');
  if (local !== remote) {
    fail('local master has diverged from origin/master; pull/push to sync before releasing');
  }
}

function assertTagDoesNotExist(tag) {
  const local = run(`git tag -l ${tag}`);
  if (local !== '') {
    fail(`tag ${tag} already exists locally`);
  }
  const remote = run(`git ls-remote --tags origin refs/tags/${tag}`);
  if (remote !== '') {
    fail(`tag ${tag} already exists on origin`);
  }
}

function bumpPackageVersion(bumpType, expectedVersion) {
  run(`npm version ${bumpType} --no-git-tag-version`);
  const actual = readPackageVersion();
  if (actual !== expectedVersion) {
    fail(`npm version produced ${actual}, expected ${expectedVersion} (semver calculations disagree)`);
  }
}

function createReleaseBranchAndCommit(version) {
  const branch = `release/v${version}`;
  run(`git checkout -b ${branch}`);
  run('git add package.json package-lock.json');
  run(`git commit -m "chore: bump version to ${version}"`);
  return branch;
}

function createTag(version) {
  run(`git tag -a v${version} -m "Release v${version}"`);
}

function pushBranchAndTag(branch, version) {
  run(`git push origin ${branch}`);
  run(`git push origin v${version}`);
}

function createPullRequest(branch, version) {
  const title = `Release v${version}`;
  const body =
    `Automated release PR for v${version}.\n\n` +
    `Tag v${version} has already been pushed and CircleCI's release workflow has started ` +
    `(EAS build + TestFlight submit). Merge this PR to bring the version bump back into master.`;
  try {
    const output = run(
      `gh pr create --base master --head ${branch} --title "${title}" --body "${body}"`
    );
    console.log(output);
  } catch (err) {
    console.error('release.js: tag was pushed and CircleCI has started, but `gh pr create` failed.');
    console.error(`Create the PR manually: gh pr create --base master --head ${branch} --title "${title}"`);
    process.exit(1);
  }
}

function main() {
  const { bumpType, dryRun } = parseArgs(process.argv.slice(2));

  assertOnMaster();
  assertCleanTree();
  fetchOriginMasterWithTags();
  assertMasterUpToDate();

  const currentVersion = readPackageVersion();
  const nextVersion = computeNextVersion(currentVersion, bumpType);
  assertTagDoesNotExist(`v${nextVersion}`);

  bumpPackageVersion(bumpType, nextVersion);
  const branch = createReleaseBranchAndCommit(nextVersion);
  createTag(nextVersion);

  if (dryRun) {
    const sha = run('git rev-parse HEAD');
    console.log(`Dry run complete. Would push branch "${branch}" and tag "v${nextVersion}" (commit ${sha}).`);
    console.log('Nothing was pushed. Clean up with:');
    console.log(`  git checkout master && git branch -D ${branch} && git tag -d v${nextVersion}`);
    return;
  }

  pushBranchAndTag(branch, nextVersion);
  console.log(`Tag v${nextVersion} pushed — CircleCI release build started.`);
  createPullRequest(branch, nextVersion);
  console.log('Merge the PR above into master when ready; no further script steps needed.');
}

module.exports = { computeNextVersion };

if (require.main === module) {
  main();
}
```

- [ ] **Step 2: Manually verify `computeNextVersion` before wiring anything up**

Run each of these from the repo root and confirm the printed value matches:

```bash
node -e "console.log(require('./scripts/release.js').computeNextVersion('4.0.1', 'patch'))"
```
Expected: `4.0.2`

```bash
node -e "console.log(require('./scripts/release.js').computeNextVersion('4.0.1', 'minor'))"
```
Expected: `4.1.0`

```bash
node -e "console.log(require('./scripts/release.js').computeNextVersion('4.0.1', 'major'))"
```
Expected: `5.0.0`

(Requiring the module here does not run `main()` — the `require.main === module` guard means only direct execution, e.g. `node scripts/release.js`, triggers `main()`.)

- [ ] **Step 3: Verify the usage-error path (safe to run anytime — fails before any git command)**

```bash
node scripts/release.js
```

Expected: exits non-zero, stderr contains `expected exactly one of --patch, --minor, --major, got: (none)` and the `Usage:` line.

- [ ] **Step 4: Commit**

```bash
git add scripts/release.js
git commit -m "feat: add scripted release branch/tag/PR workflow"
```

---

### Task 2: Wire up `npm run release`

**Files:**
- Modify: `package.json:5-15` (the `scripts` block)

**Interfaces:**
- Consumes: `scripts/release.js` from Task 1 (invoked as `node scripts/release.js`).

- [ ] **Step 1: Add the `release` script entry**

In `package.json`, add `"release": "node scripts/release.js"` to the `scripts` object (alongside the existing `start`, `lint`, `test`, etc. entries):

```json
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "lint": "eslint **/*.ts **/*.tsx",
    "lint:fix": "eslint **/*.ts **/*.tsx --fix",
    "tsc": "tsc --noEmit",
    "test": "jest",
    "generate-docs": "bun run generateDocumentation.ts",
    "release": "node scripts/release.js"
  },
```

- [ ] **Step 2: Verify the npm wiring**

```bash
npm run release
```

Expected: same usage error as Task 1 Step 3, now reached through `npm run release` — confirms argv is passed through correctly (npm forwards everything after `--` to the script, and with no args at all the script still correctly reports "got: (none)").

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add npm run release script"
```

---

### Task 3: Dry-run the full flow against the real repo

**Files:**
- None modified — this task only exercises Task 1/2's code against the live repo state and cleans up after itself.

**Interfaces:**
- Consumes: `npm run release -- --patch --dry-run` from Tasks 1-2.

- [ ] **Step 1: Confirm starting state**

```bash
git status --short --branch
git rev-parse master origin/master
```

Expected: on `master`, clean tree, `master` and `origin/master` resolve to the same commit (matches the state confirmed earlier in this conversation).

- [ ] **Step 2: Run the dry run**

```bash
npm run release -- --patch --dry-run
```

Expected output includes:
- `Dry run complete. Would push branch "release/v4.0.2" and tag "v4.0.2" (commit <sha>).`
- `Nothing was pushed. Clean up with:` followed by the cleanup command.

- [ ] **Step 3: Confirm the local state matches what was printed**

```bash
git branch --show-current
git log -1 --oneline
git tag -l "v4.0.2"
node -p "require('./package.json').version"
```

Expected: on branch `release/v4.0.2`, last commit message `chore: bump version to 4.0.2`, tag `v4.0.2` exists locally, `package.json` version is `4.0.2`. Nothing was pushed (this was never a push step) — no need to check `origin`.

- [ ] **Step 4: Clean up the dry run exactly as instructed**

```bash
git checkout master && git branch -D release/v4.0.2 && git tag -d v4.0.2
```

Expected: back on `master`, clean tree, `git status --short --branch` shows no local changes and no stray branch/tag remain (`git branch --list "release/*"` and `git tag -l "v4.0.2"` both print nothing).

---

### Task 4: Update the release runbook doc

**Files:**
- Modify: `docs/ci/circleci-testflight-setup.md` (§5 "Cut a release")

**Interfaces:**
- Consumes: the `npm run release -- --patch|--minor|--major` command from Tasks 1-2.

- [ ] **Step 1: Replace the "Cut a release" section**

Find the current section (starts with `## 5. Cut a release`) and replace its numbered steps with:

```markdown
## 5. Cut a release

1. From a clean, up-to-date `master`, run:

   ```bash
   npm run release -- --patch   # or --minor / --major
   ```

   This computes the next version, creates a `release/vX.Y.Z` branch, commits
   the version bump, tags it, and pushes both the branch and the tag. The tag
   push alone triggers CircleCI's `release` workflow — EAS builds iOS,
   generates signing credentials from your ASC API key, and `--auto-submit`
   uploads to App Store Connect. It then opens a PR from `release/vX.Y.Z`
   into `master` via `gh pr create` and prints the PR URL.

   To rehearse the branch/commit/tag sequence without pushing anything or
   touching CircleCI, add `--dry-run` first: `npm run release -- --patch
   --dry-run`. It prints what would be pushed and how to clean up the local
   branch/tag it created.

2. After Apple finishes processing the CircleCI-triggered build, it appears
   in **TestFlight**; add it to a TestFlight group to reach testers.

3. Review and merge the PR the script opened, on your own time — this brings
   the version bump commit back into `master`. Merging is manual; the script
   never auto-merges.
```

- [ ] **Step 2: Verify the doc renders sensibly**

```bash
grep -n "## 5. Cut a release" -A 30 docs/ci/circleci-testflight-setup.md
```

Expected: the new section prints cleanly with no leftover lines from the old version (no stray `git tag v4.0.2` / `git push origin v4.0.2` manual instructions remaining below the replaced block).

- [ ] **Step 3: Commit**

```bash
git add docs/ci/circleci-testflight-setup.md
git commit -m "docs: describe the scripted release branch workflow"
```

---

### Task 5: Cut the real release (v4.0.2)

**Files:**
- None — this task runs the shipped script for real; Task 1's script is the only code involved.

**Interfaces:**
- Consumes: `npm run release -- --patch` from Tasks 1-2, confirmed safe by Task 3's dry run.

**This task pushes a real tag, triggers a real CircleCI EAS build, and auto-submits to App Store Connect/TestFlight using real credentials. Get explicit confirmation from the user immediately before Step 1 — do not run it as a matter of course just because earlier tasks completed cleanly.**

- [ ] **Step 1: Confirm clean starting state (same checks as Task 3 Step 1)**

```bash
git status --short --branch
git rev-parse master origin/master
```

Expected: on `master`, clean, in sync with `origin/master`.

- [ ] **Step 2: Run the real release**

```bash
npm run release -- --patch
```

Expected: same branch/commit/tag sequence as the Task 3 dry run, but this time followed by:
- `Tag v4.0.2 pushed — CircleCI release build started.`
- A PR URL printed by `gh pr create` (release/v4.0.2 → master).

- [ ] **Step 3: Confirm the push actually landed**

```bash
git ls-remote --tags origin refs/tags/v4.0.2
gh pr list --head release/v4.0.2
```

Expected: the tag ref is listed on `origin`; `gh pr list` shows the open PR.

- [ ] **Step 4: Hand off**

Report the PR URL and the CircleCI pipeline (check the CircleCI project's Pipelines page for the `release` workflow run triggered by tag `v4.0.2`) to the user. Do not merge the PR — that's the user's manual step per the design.
