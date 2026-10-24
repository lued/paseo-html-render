# HTML Render: release checklist

Updated: 2026-10-24
Target: first npm release, candidate version 2.2.0; preserve existing v2.1.0.
User direction: build it, dogfood the user-facing cases through Paseo here, then
release. No publication before the evidence gates pass.

## Repository and cleanup

- Consolidated presentation work is fast-forwarded onto `main` at `3cde577`.
- Only the main Paseo workspace/worktree remains. Nudge policy, Turn guard,
  README/showcase and Release integration were archived through Paseo with user
  approval; their owned agents and worktree directories were retired. All source
  commits are preserved in main.
- No additional workspaces. The guard helper is reviewed and archived. Reuse the
  existing DeepSeek npm audit helper for the next stage, then retire it. Fresh
  dogfood agents may be needed to test MCP injection; retire them after evidence
  is saved. Do not create feature/research lanes.
- Parent independently verified guard commit `e3987a1`: **247/247 tests pass**,
  zero failures/skips/cancellations, typecheck PASS and bundles PASS (15 client /
  24 server inputs). Private full log: `/tmp/html-render-guard-full-tests.log`.
  This is local code evidence, not live Paseo or final package acceptance.

## Execution, in order

1. **Guard hardening — locally complete:** `e3987a1` adds atomic reservation and
   captured-turn accounting, counted synthetic null-ID turns, exact prepared-input
   fingerprints (including assets/report/frame metadata), and explicit degraded
   attribution/lifecycle warnings. Parent reviewed implementation and full tests.
   Exact comparison is not semantic duplicate prevention; restart clears history.
2. **npm readiness — final review fixes:** commits `907be95`–`e2e5732` fix the
   reproduced production type-resolution failure, pack public docs/assets, align
   package/adapter 2.2.0 and add package/isolated-host checks + CI. Actual tarball
   smoke passed Node 22.18/Paseo 0.12 and Node 26.12/Paseo 0.13.0-beta.2; parent
   inspected evidence and ran 253/253 full tests with zero skips/failures.
   Parent then fixed invalid Chromium override crashes in `793ae7c` (24/24
   focused renderer tests, typecheck/bundles PASS). Refresh the candidate tarball
   and smoke matrix after that fix. Finish script path/diagnostic/npm-source gates,
   release-neutral README wording and sandbox-capable CI before live dogfood.
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
