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

function assertBranchDoesNotExist(branch) {
  const local = run(`git branch --list ${branch}`);
  if (local !== '') {
    fail(`branch ${branch} already exists locally (leftover from a previous run? clean it up with "git branch -D ${branch}")`);
  }
  const remote = run(`git ls-remote --heads origin ${branch}`);
  if (remote !== '') {
    fail(`branch ${branch} already exists on origin`);
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
  run(`git push --atomic origin ${branch} v${version}`);
}

function createPullRequest(branch, version) {
  const title = `Release v${version}`;
  const body =
    `Automated release PR for v${version}.\n\n` +
    `Tag v${version} has already been pushed and CircleCI's release workflow has started ` +
    `(EAS build + TestFlight submit). Merge this PR to bring the version bump back into master.`;
  const bodyFile = path.join(require('os').tmpdir(), `release-pr-body-${version}.md`);
  try {
    fs.writeFileSync(bodyFile, body, 'utf8');
    const output = run(
      `gh pr create --base master --head ${branch} --title "${title}" --body-file "${bodyFile}"`
    );
    console.log(output);
  } catch (_err) {
    console.error('release.js: tag was pushed and CircleCI has started, but `gh pr create` failed.');
    console.error(`Create the PR manually: gh pr create --base master --head ${branch} --title "${title}"`);
    process.exit(1);
  } finally {
    fs.rmSync(bodyFile, { force: true });
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
  assertBranchDoesNotExist(`release/v${nextVersion}`);

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
