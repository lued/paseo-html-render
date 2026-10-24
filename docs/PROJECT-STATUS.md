# HTML Render: release checklist

Updated: 2026-10-24
Priority: a reliable first public npm release, not more visual-toolkit features.

## Current state

- README/showcase, accessible native-browser interactions and the small common
  npm-package hint list (including Pele) are combined in the **existing motion
  workspace**, now used as the single release-integration lane.
- Integration code: `6f7bdb6` on `feat/motion-interactivity`.
- Parent verification: **225/225 tests pass**, zero failures/skips; typecheck and
  bundle checks pass (15 client / 24 server inputs, Pele server-only).
- README/gallery links now all have to resolve; the temporary cross-lane exception
  is removed. Showcase assets: 11 binaries, 1,264,689 bytes, under the 2 MiB budget.
- Source in the live `main` checkout remains at the `a8c3e4e` baseline. The six
  planning files are preserved as documentation only, not a live source update. No reload, push, publication or release tag has been performed.

Green tests do **not** close the known guard and npm-install gaps below. Those
were audited, not fixed by the presentation work.

## Workspace disposition

| Workspace / branch | State | Action |
| --- | --- | --- |
| Main / `main` | Live source unchanged; release notes kept here | Keep |
| Release integration / `feat/motion-interactivity` | Existing motion workspace; contains both presentation branches | Use for remaining local work; no new workspace |

With explicit user approval, Paseo archived the Nudge policy, Turn guard and
README/showcase workspaces, archived their owned agents and removed their worktree
directories. Commits `ccf4f75`, `e7307d2` and `9bdc5a4` remain reachable from the
integration branch. Only Main and Release integration remain active; both are
clean. No push, publication or live reload occurred. Do not create more
agents/workspaces to continue a tangent.

## Remaining release work, in order

1. **Guard correctness:** atomic concurrent publish accounting, null-ID lifecycle,
   safe meaningful-change fingerprints and consistent agent attribution.
2. **Real npm installation:** prove the exact production-only tarball path, fix
   undeclared type/dependency resolution and packed README/docs/assets links.
3. **Release contract:** align versions/support claims, add repeatable CI/install
   checks, and record isolated-host evidence. Version 2.2.0 is proposed, not set.
4. **External release:** only after gates pass and explicit approval for main
   promotion/live changes as applicable, push/tag, npm publication and rollout.

Detailed blocker evidence and acceptance: [release plan](plans/2026-10-24-public-npm-release.md).
Guard/npm implementation needs a scoped approval; it is not silently started by
this consolidation pass.

## Scope closed or parked

- Done: short README, honest standalone captures/GIF, interactions and static
  fallbacks, a small package-name list + one npm global inventory instruction.
- Not building: package/profile registry, classifier, recipe API, library loader,
  vendored library set or automatic package installation.
- Later, not release scope: card revisions and a deterministic chart engine.
- Earlier dated plans/research are background, not additional active lanes.
