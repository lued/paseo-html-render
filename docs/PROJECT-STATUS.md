# HTML Render: release checklist

Updated: 2026-10-26
Target: first npm release, candidate version 2.2.0; preserve existing v2.1.0.
User direction: build it, dogfood the user-facing cases through Paseo here, then
release. No publication before the evidence gates pass.

**Live acceptance resumed by user request (2026-10-26).** Complete item 2 in
full using OpenCode Go DeepSeek max subagents; Android is the target. The user
requires INLINE INTERACTIVITY on Android native, Chrome and PWA, not PNG-only
or a separate HTML pane. The integrated Android inline candidate is now
deployed; physical native/Chrome/PWA parity is not yet accepted. macOS is not an acceptance gate. npm authentication/publication remains deferred to the
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

## Current acceptance checkpoint (2026-10-26)

- Protected-fixture writer `6dc72359-217a-4bec-8f0b-f2578d614da0` returned
  bounded harness repairs; parent reviewed and tightened the evidence gates.
  Parent now owns integration; changes are uncommitted. The first real run
  stopped before browser checks: a long fixture home exceeded the Unix-socket
  limit. A short private home plus actual socket/adapter readiness fixes this.
- Parent requested-model run **PASS** at 04:34–04:35 UTC: real DeepSeek max,
  protected disposable Paseo 0.13.0-beta.2, current source 2.2.0, completed render
  rows with one matching artifact, exact source hash and authorized owned-store
  readback. The real hosted app admitted only the intended host; one inline card
  remained after refresh. Browser auth used normal pasted credential-bearing
  links, not the password-prompt branch. User auth/config was untouched. Browser,
  profile, daemon and fixture cleanup were verified. This is hosted desktop-web
  evidence, not Android or interactive-control acceptance. Receipt:
  `/tmp/hr-acceptance-20261026/protected-parent-g6-reviewed-HqPqT8/`.
- Integrated candidate independently verified: **287/287 full serial tests on
  BOTH Node 26.12.1 and Node 22.18.0**, zero failures/skips/cancellations;
  typecheck/bundles PASS (17 client / 24 server inputs). Full G1–G6 now
  **6/6 PASS**, zero blocked/unavailable gates, including a fresh requested-model
  protected hosted-web case. Exact package install/smokes pass on Paseo 0.12
  and 0.13; independent repack matches SHA-256 `11453c79da4528c4df65d1cf3dea4e899c3d6d6d55f1c70bb093617017409dfc`.
- Visual agent `7f2af7be-6c85-475c-989f-580cb77a270f` completed source flow/Pele,
  guard/update, image diagnostics, flow and inspector cases. The flow centre-hit
  defect was reproduced and fixed with decorative-chevron pointer-events; exact
  corrected artifact `47099278b32b0f50e4904bb5a7a6cb69` passes local controls.
  Inspector `6e6109469a633921d28083b17cbfb2be` passes local controls; its narrow
  saved static note says side by side; source wording, captures and narrow/wide
  regressions are corrected. The saved artifact remains unchanged.
  Filter, remaining showcases and hosted/device controls are still open.
- Native scout `fd765fb0-8684-405d-8ebf-78c1a9df7ba6` found a plugin-only route
  using the public RN root namespace and already-registered RNCWebView string.
  A mandatory host update is not proven. Parent reviewed and hardened the
  private counter probe; 7/7 local tests and normal isolated SDK installation
  pass. The counter probe was NEVER installed on the user host. Production
  conversation-inline implementation is now complete and reviewed: trusted shell,
  inert report data, opaque inner frame, bounded acknowledged transport and
  explicit errors/retry. Existing html-render was normally reloaded at 07:53 UTC.
  Actual host bundle SHA-256 `4f5cc85d2cad38ef33450904d3f7851b97fe93ecb089ac4e30f4df277ef0e692`
  exactly matches independent installed-host compilation; all 74 packed files
  match the deployed source. No physical Android/Fabric proof yet.
- All children retain the requested OpenCode Go DeepSeek max route. No new
  workspaces, auth/security changes, npm authentication, push/tag or publication.
  Next user action is ONE integrated native/Chrome/PWA phone pass. Evidence:
  `/tmp/hr-acceptance-20261026/integrated-parent/`. Historical checkpoint
  statements below do not supersede this deployed-candidate record.

## Execution, in order

1. **Guard hardening — locally complete:** `e3987a1` adds atomic reservation and
   captured-turn accounting, counted synthetic null-ID turns, exact prepared-input
   fingerprints (including assets/report/frame metadata), and explicit degraded
   attribution/lifecycle warnings. Parent reviewed implementation and full tests.
   Exact comparison is not semantic duplicate prevention; restart clears history.
2. **npm readiness — historically verified; refresh required:** package checks/release-neutral docs and
   exact npm-source smoke mode are complete; live-dogfood capture fix `a477d8d`
   is included. Parent independently ran **259/259 full tests on BOTH Node 22.18
   and Node 26.12** (zero skipped/failed),
   typecheck/bundles and actual isolated tarball install/preview/publish/readback
   on Paseo 0.12 and 0.13.0-beta.2, including true missing-browser and repeated
   invalid-override failures without crashing. The refreshed 72-entry tarball SHA
   begins `bd514b08`; old `0112c118` and `5543c437` are superseded and must not
   be published. Parent repack matches the new file in
   `/tmp/hr-release-2.2.0/motion-target/paseo-html-render-2.2.0.tgz`.
   Packed flow-example changes now supersede that candidate for the current
   tree: do not publish it. Rebuild/reverify an exact tarball after integration.
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
   Fresh G1–G5 on the historical candidate pass. The reviewed protected
   requested-model/hosted-client fixture and latest integrated full G1–G6
   wrapper now pass (checkpoint above). Finish D2–D9 beyond that
   narrow hosted-web case and record each surface separately. Physical native,
   Android Chrome/PWA and desktop-shell coverage remain unverified; macOS is
   excluded, not an outstanding gate.
4. **Publication:** after successful checks/dogfood, publish the exact package to
   npm next, verify an actual npm-source install, then promote and create the
   matching GitHub release/tag. Never overwrite v2.1.0 or an npm version.
5. **Final cleanup:** commit evidence, leave main clean, archive finished helpers
   and dogfood agents. Keep only the main workspace.

## External prerequisites

- GitHub access for lued/paseo-html-render verified; no push performed yet.
- Protected-host web acceptance is being repaired using an owned disposable
  daemon and generated test credentials through the real pairing/password UI.
  It does not need the user's password. Never change the user's daemon auth or
  relay settings. Physical Android ultimately needs real-device observations, but the feature
  target covers native/Chrome/PWA equally; do not ask the user to accept reduced
  functionality by selecting a platform.
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
