# HTML Render: release checklist

Updated: 2026-10-26
Target: first npm release, candidate version 2.2.0; preserve existing v2.1.0.
User direction: build it, dogfood the user-facing cases through Paseo here, then
release. No publication before the evidence gates pass.

**Live acceptance resumed by user request (2026-10-26).** Complete item 2 in
full using OpenCode Go DeepSeek max subagents; Android is the target. macOS is
not an acceptance gate. npm authentication/publication remains deferred to the
last step; no push, tag or registry publication in this phase. Password-protected
daemons are normal and must remain protected. Execution/evidence contract:
[Android-first acceptance plan](plans/2026-10-26-android-live-acceptance.md).

## Repository and cleanup

- Consolidated presentation work is fast-forwarded onto `main` at `3cde577`.
- Only the main Paseo workspace/worktree remains. Nudge policy, Turn guard,
  README/showcase and Release integration were archived through Paseo with user
  approval; their owned agents and worktree directories were retired. All source
  commits are preserved in main.
- No additional workspaces. Previous code helpers and dogfood agent are archived;
  evidence/history is preserved. This phase uses read-only acceptance/scout
  subagents in main, then at most one code writer. All use the requested OpenCode
  Go DeepSeek route at max thinking. No feature/research workspaces.
- Parent independently verified guard commit `e3987a1`: **247/247 tests pass**,
  zero failures/skips/cancellations, typecheck PASS and bundles PASS (15 client /
  24 server inputs). Private full log: `/tmp/html-render-guard-full-tests.log`.
  This is local code evidence, not live Paseo or final package acceptance.

## Current acceptance workers (2026-10-26)

- Auth/Android read-only scout: `6dc72359-217a-4bec-8f0b-f2578d614da0`.
- Live visual/guard agent: `7f2af7be-6c85-475c-989f-580cb77a270f`.
  Source-flow artifact `56de6280af18b8d2d997e52e753f9940` and actual Pele
  light/dark graph PNGs inspected; Android/client acceptance remains open.
  Next: report-only correction plus real concurrent/unchanged guard calls.
- Both use OpenCode Go DeepSeek max in main, read-only repository. No reload
  during live guard checks. No npm/publication work.

## Execution, in order

1. **Guard hardening — locally complete:** `e3987a1` adds atomic reservation and
   captured-turn accounting, counted synthetic null-ID turns, exact prepared-input
   fingerprints (including assets/report/frame metadata), and explicit degraded
   attribution/lifecycle warnings. Parent reviewed implementation and full tests.
   Exact comparison is not semantic duplicate prevention; restart clears history.
2. **npm readiness — locally complete:** package checks/release-neutral docs and
   exact npm-source smoke mode are complete; live-dogfood capture fix `a477d8d`
   is included. Parent independently ran **259/259 full tests on BOTH Node 22.18
   and Node 26.12** (zero skipped/failed),
   typecheck/bundles and actual isolated tarball install/preview/publish/readback
   on Paseo 0.12 and 0.13.0-beta.2, including true missing-browser and repeated
   invalid-override failures without crashing. The refreshed 72-entry tarball SHA
   begins `bd514b08`; old `0112c118` and `5543c437` are superseded and must not
   be published. Parent repack matches the new file in
   `/tmp/hr-release-2.2.0/motion-target/paseo-html-render-2.2.0.tgz`.
   CI and hosted-client browser checks retain the sandbox; remote CI is pending.
3. **Real Paseo dogfood — resumed, incomplete:** candidate reloaded and running;
   main-workspace agent `afe8aedd-47b4-482b-8eee-a92fca3df601`
   (Release dogfood: real Paseo cases) was reused sequentially and archived at
   the pause after its evidence was saved. D1 passed:
   verified adapter 2.2.0 injection, actual package read, text-only `2.2.0`,
   zero HTML calls. D2 real counts are 14/7/9; its initial PNG exposed a
   mid-animation chart defect, corrected in `a477d8d` with a failing-then-passing
   regression. The same agent made one real post-reload preview of the exact
   source: PASS, final 14/7/9 bar geometry; original artifact preserved.
   Full G1–G6 produced 5 pass / 1 fail:
   the hosted client could not connect. Diagnostics progressed past browser
   network permissions to a host password requirement; no password was read.
   Fresh G1–G5 on the new candidate pass; G6 remains unpassed. Obtain an
   authenticated visible client, finish D2 and remaining D3–D9 cases.
   Record each result in docs/verification.md. Tests/fixtures are not live model
   evidence; physical native/Electron/macOS coverage remains unverified.
4. **Publication:** after successful checks/dogfood, publish the exact package to
   npm next, verify an actual npm-source install, then promote and create the
   matching GitHub release/tag. Never overwrite v2.1.0 or an npm version.
5. **Final cleanup:** commit evidence, leave main clean, archive finished helpers
   and dogfood agents. Keep only the main workspace.

## External prerequisites

- GitHub access for lued/paseo-html-render verified; no push performed yet.
- Real hosted-client acceptance needs host authentication; the Paseo browser
  automation host also timed out. Ask the user to authenticate in a visible
  client, never send or retrieve the password in chat. Do not disable host auth.
- Latest npm check after `a477d8d`: ENEEDAUTH. A visible Paseo terminal named
  `npm release login` was opened for sign-in; the attempt may need restarting
  after the pause. Authentication stays in a visible terminal, never chat.
  Recheck npm identity before publishing.
- This parent conversation still uses adapter 2.1.1 and emits a reconnect warning.
  Fresh agent adapter 2.2.0 was verified separately. Reconnect before further
  acceptance work; do not count the parent example as fresh-adapter/guard proof.
- Stop on failed safety/install/dogfood gates, missing auth or unavailable required
  client coverage. Report the blocker rather than substitute a test for dogfood.

Detailed acceptance and case matrix: [release plan](plans/2026-10-24-public-npm-release.md).
Verification owner: parent; raw local evidence stays private, public notes sanitized.

## Scope frozen

- Already done: README/gallery/GIF, accessible native-browser examples, small npm
  name list + efficient global inventory guidance (including Pele).
- No registry, classifier, recipe API, library loader, new visual dependencies,
  card revisions or chart engine. Only fixes needed for this release.
