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
- No additional workspaces. Both code helpers are reviewed and archived. Use one
  fresh dogfood agent in main for real MCP injection/model cases and reuse it
  sequentially; retire it after evidence is saved. No feature/research lanes.
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
2. **npm readiness — locally complete:** `a5f2b18` completes the package checks,
   release-neutral docs and exact npm-source smoke mode. Parent independently ran
   **258/258 full tests on BOTH Node 22.18 and Node 26.12** (zero skipped/failed),
   typecheck/bundles and actual isolated tarball install/preview/publish/readback
   on Paseo 0.12 and 0.13.0-beta.2, including true missing-browser and repeated
   invalid-override failures without crashing. The refreshed 72-entry tarball SHA
   begins `5543c437`; old `0112c118` is superseded. Parent repack matches it.
   CI and hosted-client browser checks retain the sandbox; remote CI is pending.
3. **Real Paseo dogfood — current stage:** candidate reloaded and running;
   one fresh main-workspace agent `afe8aedd-47b4-482b-8eee-a92fca3df601`
   (Release dogfood: real Paseo cases) is reused sequentially. D1 passed:
   verified adapter 2.2.0 injection, actual package read, text-only `2.2.0`,
   zero HTML calls. Next: real-data chart with CLIENT ACCEPTANCE heading, then
   full G1–G6 against that one-card agent, then remaining source/guard/UI cases.
   Record each result in docs/verification.md. Tests/fixtures are not live model
   evidence; physical native/Electron/macOS coverage remains unverified.
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
