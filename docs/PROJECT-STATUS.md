# HTML Render: release checklist

Updated: 2026-10-27
Target: first npm release, candidate version 2.2.0; preserve existing v2.1.0.
User direction: build it, dogfood the user-facing cases through Paseo here, then
release. No publication before the evidence gates pass.

**Live acceptance resumed by user request (2026-10-26).** Complete item 2 in
full using OpenCode Go DeepSeek max subagents; Android is the target. The user
requires INLINE INTERACTIVITY on Android native, Chrome and PWA, not PNG-only
or a separate HTML pane. The integrated Android inline candidate is now
deployed; physical native/Chrome/PWA parity is not yet accepted. macOS is not an acceptance gate. npm authentication/publication remains deferred to the
last step. GitHub origin/main checkpoint pushes are authorized; tags and
registry publication remain deferred. Password-protected
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

## Native ready recovery and repository checkpoint — 2026-10-27

The user confirmed that the new current-conversation inline test worked on the
phone, then reported: “The native HTML frame did not complete its ready
handshake in time.” Local report interaction is established by that report;
sustained native-host readiness is not. The estimated 30 seconds is not a
measured timer value. The actual ready deadline remains eight seconds.

The initial ready fragment was previously one-shot. Recovery now requests a
genuine inner ready after shell finish, retries the same message identity
boundedly, and reads protocol URLs from public start/progress/finish events.
Shell load and a local LIVE badge do not grant readiness. The exact missed
callback/race on the phone is not established without device evidence. Parent
review also preserved the original five-second chunk-ack deadline on retries,
fixed an early-probe timer race, and deduplicated ready responses.

The GitHub checkpoint e5ac410 is pushed to origin/main with user authorization;
no Forgejo push, tag, npm publication or release occurred. The first remote CI
run 40453413792 failed three tests: two discovery fixtures assumed no installed
system Chromium, and one theme observer raced the authored script setup. Both
isolated install-smoke jobs passed. The fixes pin system discovery in fixtures
and use explicit authored-observer/state acknowledgements, not longer sleeps,
weaker assertions or sandbox bypasses. A new CI result is required.

The bounded history audit found no known-pattern credential matches in the
37-commit checkpoint (193 text blobs scanned; 19 binaries not scanned). This
is not a full secret/entropy/image audit. No tracked runtime/auth/log/tarball
material was identified; useful tests, examples, captures and history remain.
Ignore rules now prevent common local credentials/runtime/output accidents.
The push-time moderate advisory was withdrawn and GitHub marks it fixed; local
npm audit found zero vulnerabilities. No speculative dependency bump was made.

Parent local verification: full **295/295 on BOTH Node22.18.0 and26.12.1**,
zero failures/skips/cancellations; typecheck/bundles PASS (17 client/24 server).
Real Hermes full-entry, native constructors, both public host profiles and
negative gates PASS through both drivers. Exact expected host bundle also PASS.
Package/repack/source74 equality and both Paseo0.12/0.13 exact install-smokes
PASS, including missing-browser and bad-override negatives. Package SHA256:
5b32291d86fcfda5800e46ccc6e0ada214e3977a57e986cd5a0e53db8146ac5b.
Expected host client SHA256:e009e9e9275ffdb6f9231bdb50177d519c893181caa0beb207dda839335e4952,
162,969 bytes. These are not physical Android/Fabric/WebView evidence.

Retained failures include the initial stale documentation-test/pack-check
expectations and one smoke run whose long evidence-root runtime caused an
EINVAL bridge socket failure. Both full suites were rerun after the doc-check
correction; complete smokes passed using owned short roots. The failed smoke
was cleaned up. No paid model was used for the install smokes.

Fix commit **4b9e77a** is pushed to authorized GitHub origin/main. Remote CI
**40456903239 PASS**, including the complete Node22/Chromium/Hermes/package job
and both isolated Paseo0.12/0.13 install jobs. Full protected hosted G1–G6:
**6/6 PASS** with requested DeepSeek max, actual password-prompt onboarding,
fresh missing/wrong/correct auth outcomes, exactly one card after refresh,
authorized exact source readback and positively verified owned cleanup.
Projection rows do not establish underlying invocation counts or runtime
alwaysLoad exposure. Captures were inspected.

Existing html-render was normally reloaded at **2026-10-27 05:46 UTC**. Actual
raw delivered client equals the expected e009e9e9… bytes (162,969 bytes), and
those same raw bytes pass the full Hermes host/constructor/negative matrices
through BOTH Node drivers. All74 packed files still equal source; independent
repack matches. No user auth/security/relay/other-plugin/probe change and no
Forgejo push, npm login/publication, release tag or GitHub release.

**Physical post-fix readiness is unverified.** Retry the existing saved test
card 00eb0c1c96efa968a8a8ab327202a027 after reopening the app, keeping it visible
past the previous timeout. No new report or diagnostic plugin is needed.
Private evidence:/tmp/hr-acceptance-20261027/native-ready-fix/parent/.

## Earlier native-selection correction (2026-10-27, 04:35 UTC)

The user's second physical attempt loaded the plugin but **failed inline
interactivity**, selecting the PNG with the generic fallback. Parent reproduced
the old full delivered bundle's false DocumentFrame prerequisite under the
public0.12 UI shape in real Hermes. That supported version has no such export;
the exact user's APK version is not established. New selection uses public
native-manager discovery without registering a view; explicit negatives win,
missing commands/boundary reject, and failure text is reason-specific.

- Parent **291/291 complete serial tests on EACH Node22/26**, zero failure,
  skip or cancellation. Full latest hosted **G1–G6:6/6 PASS** with real model,
  password-prompt auth, one inline card after refresh and positive cleanup.
- Real Hermes exact-delivered entry/constructors plus0.12/0.13 host matrices
  and negative gates PASS through both Node drivers. Mounted selection test
  is a DOM/native shim, not device evidence. Typecheck/bundles PASS.
- Package/repack/source74 files and Paseo0.12/0.13 exact install-smokes PASS.
  Current package81986a25f7310af00562c8970c82689574782aa3f792d7920c5399f7918983b5;
  actual delivered clientebd409563517782a19df03408e71ea983d77d7b5ef813e647b4687cfd61b4362,
  159,934 bytes; exact independent host-compiler equality. Existing plugin
  normally reloaded. No auth/security/other-plugin/probe/npm/push/tag change.
- **At this checkpoint, corrected physical rendering was unobserved.** The
  subsequent partial phone success/timeout is recorded above. A positive
  native manager query is not proof of JS view registration or handshake.
  Retry same saved card, no republish. Remaining device/Chrome/PWA/image/
  lifecycle and ledger checks stay open. Remote CI unrun.

Evidence:/tmp/hr-acceptance-20261027/native-selection-fix/parent/.
See verification.md for retained failure and exact package/runtime provenance.

## Earlier startup-only corrective deployment (2026-10-26, 22:29 UTC)

- User's real Android screenshot **FAILED** the prior candidate at plugin
  initialization. Parent reproduced the exact prototype error in real Hermes:
  class-valued catalog/assembler/boundary bindings became undefined across the
  full evaluated bundle. The previous phone-ready result is withdrawn.
- All three constructors now use class-free function/closure/prototype code.
  Dedupe, transport, safety, error boundary and retry behavior are retained.
  AST prevention and a repeatable real-Hermes full-entry/constructor gate are
  checked in; CI requires a pinned official VM. No new production dependency.
- Parent full serial suites: **289/289 on BOTH Node 22.18.0 and 26.12.1**,
  zero fail/skip/cancellation. Typecheck/bundles PASS. Latest full G1–G6:
  **6/6 PASS**, now including real password-prompt onboarding. A preceding
  isolated auth-harness race failure is retained; both full suites and the
  entire wrapper were rerun after the bounded test-only correction.
- Exact package smokes pass on Paseo 0.12/0.13. Independent repack and all 74
  packed-source files match. New package SHA-256:
  841b7177fbe2eb17e61527382082a792c270a4eda93ff13201134597a8d5b28f.
- Existing html-render normally reloaded. Actual delivered client SHA-256:
  24ff34f42de25497d735e0fb8bcb43988f0d6a4b65987e6a465264fc8fb50507,
  157,636 bytes; byte-identical to independent host compilation and passed
  real Hermes factory/setup/constructor checks through both Node drivers.
- **Physical Android after this correction is not observed.** User may retry
  the integrated app after reopening; no new probe/install/password change.
  Chrome/PWA and remaining case-ledger acceptance remain separate gates.
- No changes to the other plugins in the screenshot, user auth/relay/security,
  npm publication, push or tag. Remote CI unrun. Evidence:
  /tmp/hr-acceptance-20261026/native-load-fix/parent/.

## Earlier acceptance checkpoint — superseded by corrective deployment

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
   CI and hosted-client browser checks retain the sandbox. Current green remote
   CI and refreshed package identities are recorded above.
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

- Authorized checkpoints are pushed to GitHub origin/main; no release/tag or
  registry publication. The current code CI result is green as recorded above.
- Protected-host web acceptance passes using an owned disposable daemon and
  generated test credentials through the real pairing/password UI.
  It does not need the user's password. Never change the user's daemon auth or
  relay settings. Physical Android ultimately needs real-device observations, but the feature
  target covers native/Chrome/PWA equally; do not ask the user to accept reduced
  functionality by selecting a platform.
- Latest npm check after `a477d8d`: ENEEDAUTH. A visible Paseo terminal named
  `npm release login` was opened for sign-in; the attempt may need restarting
  after the pause. Authentication stays in a visible terminal, never chat.
  Recheck npm identity before publishing.
- Earlier parent examples used adapter 2.1.1 with a reconnect warning. Fresh
  agent adapter 2.2.0 was verified separately; the earlier examples do not count
  as fresh-adapter/guard proof.
- Stop on failed safety/install/dogfood gates, missing auth or unavailable required
  client coverage. Report the blocker rather than substitute a test for dogfood.

Detailed acceptance and case matrix: [release plan](plans/2026-10-24-public-npm-release.md).
Verification owner: parent; raw local evidence stays private, public notes sanitized.

## Scope frozen

- Already done: README/gallery/GIF, accessible native-browser examples, small npm
  name list + efficient global inventory guidance (including Pele).
- No registry, classifier, recipe API, library loader, new visual dependencies,
  card revisions or chart engine. Only fixes needed for this release.
