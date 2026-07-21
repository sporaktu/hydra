# Carving the dev branch into upstream PRs

Once everything on `dev` has been device-tested (requires a new dev-client /
EAS build — spec 03 added native modules), each spec can be submitted to the
upstream repo (`dmilin1/hydra`) as its own PR. This documents the exact
commits and dependencies so the carve-out is mechanical.

## Commit map (on the `dev` integration branch)

| PR | Spec | Commits (in order) | Also include |
|----|------|--------------------|--------------|
| 1 | Perf quick wins | `fa6f887`, `999cc13` | `docs/specs/01-perf-quick-wins.md` from `c26eff4` |
| 2 | Focused video playback + feed audio | `15cd9c6`, `24253f9` | `docs/specs/02-focused-video-playback.md`, `docs/adr/0003-focused-only-playback.md`, the CONTEXT.md glossary entries (Focused Post, Poster) |
| 3 | Interaction overhaul | `4f2dfc5`, `a0fd0fc` | `docs/specs/03-interaction-overhaul.md` |
| 4 | Comment virtualization | `d60f3d8`, `4a413aa` | `docs/specs/04-comment-virtualization.md` |

## Procedure per PR

```sh
git fetch upstream
git checkout -b upstream/spec-NN upstream/master
git cherry-pick <commits for that spec>
# resolve conflicts (see dependencies below), run:
#   ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/jest --silent
git push origin upstream/spec-NN
gh pr create -R dmilin1/hydra --base master --head sporaktu:upstream/spec-NN
```

## Dependencies between PRs

The specs were built stacked (01 → 02 → 03 → 04), so cherry-picking a later
spec directly onto `upstream/master` will conflict where it builds on earlier
work:

- **PR 2 depends on PR 1**: `PostSettingsContext` edits assume the memoized
  (useCallback/useMemo) version from PR 1; `RedditDataScroller` focus tracking
  sits alongside PR 1's scroll-distance batching; `PostsPage` edits assume
  PR 1's stable-callback refactor.
- **PR 3 depends on PR 1 + 2 lightly**: `ThemedRefreshControl` replaces code
  PR 1 touched; `FeedAudioFAB` (from PR 2) is a haptics call site; the
  Slideable rewrite itself is independent.
- **PR 4 depends on PR 3**: `Comments.tsx` row rendering keeps the
  `NativeContextMenu` wiring and rewritten `Slideable` from PR 3, and
  `PostDetails` uses `ThemedRefreshControl`.

Recommended submission order: open PR 1 alone; once merged upstream, rebase
and open PR 2; then 3; then 4. Alternatively open all four immediately as a
stacked series, each PR based on the previous branch, with the dependency
noted in each PR body.

## Notes for the PR bodies

- PR 2 fixes the fast-scroll stale-video bug (recycled cells showing the
  previous post's playing video) — link the ADR for the rationale.
- PR 3 adds native modules (`zeego`, `react-native-ios-context-menu`,
  `react-native-ios-utilities`, `@react-native-menu/menu`) — upstream needs a
  new native build; call this out prominently.
- PR 4 deletes the `__internalInstanceHandle` React-fiber hack.
- Each spec was implemented against docs/specs/NN-*.md with acceptance
  criteria; unit test coverage was added throughout (seen-state subscription,
  FeedVideoFocus store, Slideable gesture logic, comment-tree flattener).
