# HTML Render: release checklist

Updated: 2026-10-24
Target: first npm release, proposed version 2.2.0; preserve existing v2.1.0.
User direction: build it, dogfood the user-facing cases through Paseo here, then
release. No publication before the evidence gates pass.

## Repository and cleanup

- Consolidated presentation work is fast-forwarded onto `main` at `3cde577`.
- Only the main Paseo workspace/worktree remains. Nudge policy, Turn guard,
  README/showcase and Release integration were archived through Paseo with user
  approval; their owned agents and worktree directories were retired. All source
  commits are preserved in main.
- No additional workspaces. Reuse the existing DeepSeek audit helpers sequentially
  for release hardening, then archive them after recording their results. Fresh
  dogfood agents may be needed to test MCP injection; retire them after evidence
  is saved. Do not create feature/research lanes.
- Baseline: 225/225 tests passed, zero skips; typecheck/bundles passed (15 client /
  24 server inputs). Re-run after hardening; this is not final release evidence.

## Execution, in order

1. **Guard hardening — next:** concurrent publish reservation/accounting, null-ID
   lifecycle, conservative fingerprints covering meaningful publish inputs/assets,
   safe attribution and honest old-adapter degradation. Add regressions and commit.
2. **npm readiness:** exact production-only tarball install/host compilation,
   dependency/type resolution, packed public docs/assets, versions/support and CI.
   Isolate install tests; do not replace the user's home configuration.
3. **Real Paseo dogfood:** reload the validated candidate as necessary, use fresh
   agents and actual tools/artifacts/UI. Cover the matrix in the release plan.
   Record observed results separately from unit/mounted-component tests; do not
   claim untested native devices or harnesses passed.
4. **Publication:** after successful checks/dogfood, publish the exact package to
   npm next, verify an actual npm-source install, then promote and create the
   matching GitHub release/tag. Never overwrite v2.1.0 or an npm version.
5. **Final cleanup:** commit evidence, leave main clean, archive finished helpers
   and dogfood agents. Keep only the main workspace.

## External prerequisites

- GitHub access for lued/paseo-html-render verified; no push performed yet.
- Last npm check: ENEEDAUTH. A visible Paseo terminal named `npm release login`
  is running npm login. The user must complete authentication there, not send
  credentials in chat. Recheck npm identity before publishing.
- Stop on failed safety/install/dogfood gates, missing auth or unavailable required
  client coverage. Report the blocker rather than substitute a test for dogfood.

Detailed acceptance and case matrix: [release plan](plans/2026-10-24-public-npm-release.md).
Verification owner: parent; raw local evidence stays private, public notes sanitized.

## Scope frozen

- Already done: README/gallery/GIF, accessible native-browser examples, small npm
  name list + efficient global inventory guidance (including Pele).
- No registry, classifier, recipe API, library loader, new visual dependencies,
  card revisions or chart engine. Only fixes needed for this release.
