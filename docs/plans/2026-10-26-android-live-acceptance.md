# Android-first live Paseo acceptance

Date: 2026-10-26
Status: user authorized completing live acceptance (item 2), using OpenCode Go DeepSeek max subagents. npm authentication/publication is deferred to the last step. macOS is not an acceptance target.
review: none

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

## Earlier native selection correction — 2026-10-27, 04:35 UTC

Second actual phone attempt **FAILED native parity**: plugin loaded but selected
PNG fallback before mounting. Root source-backed mismatch: required public
DocumentFrame is absent on supported0.12 UI exports. Parent real-Hermes exact
24ff-bundle negative reproduces this with positive native-manager/command APIs;
actual APK version remains unknown. Sole DeepSeek max writer implemented public,
nonregistering native-manager selection; parent hardened negatives/diagnostics,
added both host shapes to VM regression and reviewed the mounted shim case.

Parent full291/291 on BOTH Node22/26, typecheck/bundles, exact package/repack and
Paseo0.12/0.13 smokes PASS; full G1–G6:6/6 PASS. Exact actual delivered bundle
passed Hermes factory/setup/constructors/0.12+0.13 and negative-case matrix on
both drivers. New package81986a25f7310af00562c8970c82689574782aa3f792d7920c5399f7918983b5;
delivered clientebd409563517782a19df03408e71ea983d77d7b5ef813e647b4687cfd61b4362,
159,934 bytes; independent host compilation matches exactly. Existing plugin
normally reloaded. No user auth/security/other-plugin/probe/npm/push/tag change.

Native-manager availability is NOT JS view-registration/handshake or physical
proof. Next: retry same saved card in actual app, not a new report or diagnostic
screen. Full device/browser lifecycle/image/ownership ledger remains open.
Evidence:/tmp/hr-acceptance-20261027/native-selection-fix/parent/; first full-suite
fixture mismatch failure retained, both complete suites rerun after correction.

## Earlier startup-only corrective deployment — 2026-10-26, 22:29 UTC

The actual phone screenshot rejected the previous candidate: html-render failed
on initialization with the prototype-of-undefined error. Parent reproduced the
same error at new ArtifactCatalog in a real Hermes VM with the full immutable
bundle; React.Component was available. All three class-valued client bindings
were affected. Sole DeepSeek max writer replaced them with function/closure/
prototype constructors, preserving catalog, assembler and error-boundary safety.
Parent reviewed, added strict repeatable Hermes evaluation/CI and an AST guard.

Parent 289/289 full tests on both Node 22/26, typecheck/bundles, exact package/
repack and Paseo 0.12/0.13 installation smokes PASS. Full latest G1–G6: 6/6 PASS.
A prior disposable auth UI race failed honestly; bounded harness correction,
both full suites and the entire wrapper were rerun. Latest G6 observes actual
password-prompt onboarding, one inline card after refresh and verified cleanup.

New package: 841b7177fbe2eb17e61527382082a792c270a4eda93ff13201134597a8d5b28f.
Actual delivered bundle: 24ff34f42de25497d735e0fb8bcb43988f0d6a4b65987e6a465264fc8fb50507;
exact bytes passed Hermes factory/setup and native constructor checks. Existing
plugin normally reloaded. Private native-load-fix/parent/ evidence records exact
engine/version and synthetic UI limitations. No post-fix physical pass inferred.

Next: user reopens app and retries the corrected integrated inline candidate,
not a separate diagnostic screen. No other plugin, auth/relay/security change,
new host installation, npm authentication/publication, push or tag.

## Superseded deployment checkpoint — 2026-10-26, 07:55 UTC

Production inline adapter implemented, parent reviewed and existing html-render
installation normally reloaded; NO temporary probe installed. Parent full suites
287/287 on both Node 22/26, typecheck/bundles, exact package/repack and production
install smokes on Paseo 0.12/0.13 PASS. Latest full G1–G6: 6/6 PASS, no
blocked/unavailable gates, including requested DeepSeek max protected hosted web.
Package SHA-256: `11453c79da4528c4df65d1cf3dea4e899c3d6d6d55f1c70bb093617017409dfc`.
Actual host client bundle SHA-256: `4f5cc85d2cad38ef33450904d3f7851b97fe93ecb089ac4e30f4df277ef0e692`,
byte-identical to independent installed-host compiler output. All 74 packed files
match source. Private evidence: `integrated-parent/` under the acceptance root.

Ready for ONE end-to-end phone pass across native, Chrome and PWA. Real
Fabric/WebView events/commands, touch/focus, image transport, height, rotation,
OS motion, background/resume and persisted history remain device observations,
not inferred passes. Other remaining D-case ledger items are still tracked in
verification.md. No auth/relay/security change or npm/push/tag/publication.
Earlier investigation/probe proposals below are historical, not the next task.

## Outcome and evidence

Complete the outstanding D2–D9 user-facing cases from docs/verification.md through actual model/tool use and real client checks. Make the password-protected hosted-client path testable without retrieving the user's password or disabling authentication. Target desktop-equivalent INLINE INTERACTIVITY on Android native, Chrome and PWA. The user explicitly rejected PNG/native-report-only cards or opening HTML in a side pane as the primary outcome. Those are fallbacks, not parity acceptance. Current forced-static code is an implementation choice, not proof that inline native HTML is impossible. Inspect the actual native host/runtime and existing WebView capability before selecting a solution. Never describe desktop emulation/native shims as physical Android evidence.

Use current code/package identity until a needed runtime fix supersedes it. Save private raw evidence under /tmp/hr-acceptance-20261026/ (0700 directories, 0600 files); record sanitized results and precise limitations in docs/verification.md. Captured examples must be discoverable to the user, not only buried in child-agent output.

## Boundaries

- Existing main workspace only; no new worktrees or feature/research lanes.
- GitHub origin/main checkpoint pushes are authorized. No Forgejo push, npm
  login/publication, tag or GitHub release in this phase.
- Do not inspect user credentials, copy auth stores, log tokens/pairing material, disable daemon authentication or change the user's daemon/security settings.
- Prefer an explicitly disposable password-protected fixture with a generated test-only password for automated hosted-client checks. If feasible, prove this with an actual model-published card. Fixture evidence supplements, never replaces, the actual Android phone/current-client checks.
- Keep opaque allow-scripts frames, current CSP, script-disabled static captures, and the browser OS sandbox. No allow-same-origin, remote/CDN loading, sandbox bypass or root/sudo.
- Only bounded fixes necessary for these acceptance cases and the explicitly requested native-inline rendering parity. A native embedding change requires actual host/runtime evidence and security review; do not invent a new visual toolkit. No chart engine, package loader, classifier or card revisions.
- Agents cannot delegate. Read-only workers may run in parallel; one code writer at a time on main. Parent owns reloads, full suites, integration, evidence and user communication. Run Chromium-heavy full suites serially.

## Model and execution

All children: models.csv row deepseek-v4-1-flash, selector ocx/opencode-go/deepseek-v4.1-flash, thinking max, ZDR. Availability rechecked 2026-10-26: this route is live; unrelated catalog drift is not used.

1. Read-only scout: locate supported daemon/client password authentication, safe disposable fixture setup, current hosted-client test assumptions, native Android/file-preview paths, and available physical-device/browser automation. Return exact source evidence and a bounded implementation proposal; do not edit or collect credentials.
2. In parallel, fresh read-only live-case agent: source-derived flow plus the built-in Pele report graph, one published artifact. Return real tool results, artifact/file links and private evidence. This agent is reused sequentially for the remaining visual/guard/ownership/history cases, never as a concurrent code writer.
3. After scout findings, one DeepSeek max code child fixes only the owned auth/hosted-client test path and necessary acceptance defects. Parent coordinates focused browser checks and independently reviews changes. No speculative implementation before findings.
4. Run remaining D2–D9 cases sequentially: real-data chart final acceptance; three showcase pages; flow/inspector/filter controls, keyboard, theme, reduced motion, narrow reflow and static fallbacks; auto/iframe/static/report/file views; same-turn/concurrent/unchanged refusals and meaningful updates; image/report/metadata changes, diagnostics, ownership/legacy readback; persisted history/refresh with no duplicate card projection.
5. Parent independently reruns relevant full tests/typecheck/bundles, real protected-host browser checks and actual Android checks. Test all Android surfaces rather than asking the user to select a reduced feature set. Device/app versions may be needed for reproducible physical tests, not to narrow the interactivity requirement. Report each subcase separately.
6. Read-only native-capability scout: trace current forced-static branch, the actual Android plugin evaluator/import registry, bundled WebView/native components and existing host HTML/browser views. Distinguish absent TypeScript exports from absent runtime capability. Propose the smallest supported plugin-only route or prove the exact host/API change needed. No private bridge hacks, security weakening or speculative production patch. Native prototype/code work follows the auth writer sequentially after evidence review.

## Acceptance and stop conditions

- Each case has actual call/artifact evidence and separately identified UI/device evidence. Invalid calls/refusals never count as successful publications; fixtures/mounted components do not count as a physical phone.
- Password protection remains enabled in the positive hosted-client test. Missing/wrong auth has an explicit negative result; credentials/offers do not appear in evidence output. Correctly authenticated client checks the intended card and interactive file, not an arbitrary iframe or unrelated tab.
- Android native, Chrome and PWA have interactive cards inline in the conversation: local controls and state changes work without opening another pane. Preserve desktop behavior, narrow reflow, touch/focus accessibility, reduced motion and theme. Verify history refresh and one projection per artifact. Readable PNG/report and external file views remain degradation checks, not substitutes for this requirement.
- No silently skipped/unavailable requirement is a pass. If blocked, preserve the attempted paths and precise evidence, complete independent work, then ask only for the specific phone action/access or scope decision needed. Never bypass user authentication to force a pass.
- Publication stays deferred even after acceptance succeeds; the parent reports readiness and remaining npm-only steps to the user.

## Reviewed checkpoint and proposed phone experiment (2026-10-26)

The protected requested-model/hosted-browser fixture now passes: one exact owned
artifact from completed render rows, normal credential-link UI admission, one
inline card after refresh, and actual cleanup. This is not password-prompt-branch
or Android/control acceptance. Parent focused checks pass 15/15 on Node 22/26;
latest-tree full suites/package refresh are still required. Flow hit targeting
is repaired; inspector controls pass locally with a minor static wording fix
pending. No current packed candidate is publishable after those example changes.

The private native counter probe is source-reviewed, locally containment-tested
with the Chromium OS sandbox enabled, and normally installable in an isolated
protected fixture. Reviewed bundle SHA-256 is
`e904d530ac26875273ef9e1507897f2241310bb79df433a161f58b8a99e52023`
(20,278 bytes). It is not installed on the user host. A host update is not proven
mandatory; real Android execution is the next discriminating evidence.

Proposed bounded experiment, pending explicit permission:

1. Parent checks the exact existing host and absence of plugin id
   `native-counter-probe`; never overwrite a pre-existing installation.
2. Normally install only the reviewed private plugin on that host. It adds one
   Native probe menu item/screen; it does not modify html-render, the app binary,
   password, relay, auth stores or daemon security settings. Verify installed
   bundle/source identity. No reload/restart of unrelated plugins or daemon.
3. User opens Native probe in the actual Android app, taps Increment three
   times, then Reset twice. Record visible native count, increasing sequence and
   explicit command acknowledgements. Ask only for those status values or errors,
   not auth screenshots, passwords, pairing links or unrelated phone content.
4. After observations/user is finished, normally uninstall only this owned
   temporary plugin. Preserve private source/receipt evidence. A failed render,
   missing event or missing acknowledgement is failure/unavailable, not success.
5. Even success is capability evidence only. Conversation-inline integration,
   native containment, height, theme, focus/touch, history and large-image checks
   remain required, alongside Chrome/PWA parity. No production native route is
   selected solely from this screen. Stop on unsafe behavior or inability to
   verify ownership/cleanup; report evidence and the next specific input needed.

Parent owns installation/device coordination and independent verification;
native scout remains on the requested DeepSeek max route and repo read-only.
Review method remains parent independent source/evidence review (`review: none`).
No live-host installation is authorized by this proposal itself.

## Production inline implementation — execution direction

The user wants a finished integrated candidate and one end-to-end phone pass,
not an intermediate counter demo. The separate user-host probe proposal above
is therefore not being executed; no permission to install it was given. The
original native scout was closed before returning its integration follow-up.
Continue the already-authorized native parity work through the production card
seam, without another diagnostic-screen detour.

One main code writer, requested OpenCode Go DeepSeek max: implement an isolated
Android HtmlFrame adapter beside the unchanged desktop iframe. Use only public
RN root APIs and the already-registered RNCWebView component; force evaluation
only through the existing public UI export when available. No re-registration,
private imports, messaging-module overrides, app-binary patch, new dependency or
host security/auth changes. Gate actual client capabilities, not server version
or missing SDK types alone. Keep existing explicit static/report modes; missing
native capability or handshake must be visible and cannot count as inline parity.

Preserve the trusted outer shell plus opaque allow-scripts inner frame. Only
constant trusted shell code executes outside the sandbox; all report markup is
encoded as inert data until assigned to inner srcdoc. Account explicitly for
CSP inheritance: arbitrary authored inline scripts and data images must still
work inside, while remote loading/eval/forms/popups/files remain forbidden.
Do not silently restrict desktop-supported report scripts to the counter's two
known script hashes. Keep the native JavaScript interface disabled; use bounded,
source-filtered transport without global WebView messaging interception. Large
image requests require a real bounded transport, not a tiny-hash truncation or
loss of image behavior. Fragment chunks, if used, need bounded assembly,
acknowledgements, deadlines, stale-session rejection and replace-not-push history;
never log their contents or URLs.

Wire real auto/iframe selection and authorized original-HTML loading into native
conversation cards. Reuse the existing ready/context/height/link/image readers,
height clamping, theme sanitation and fresh-gesture checks. Keep HTML/source
identity stable across theme/layout updates so controls retain state. Handle
load/process/command/unmount failures, accessibility, native sizing and OS reduced
motion without forced animation freezing. Preserve desktop behavior and legacy
readback; do not add a visual toolkit or public transport API.

The code child owns only native adapter/transport additions, the minimal existing
client/selection seams, relevant tests and truthful compatibility/interactivity
docs. Parent owns independent review, serial full suites on Node 22/26,
bundles/package refresh, normal reload of the existing html-render installation
and device coordination. Parent must not announce phone-test readiness until a
real integrated candidate is built and deployed; physical Android acceptance is
still established by the user's end-to-end pass, not browser/shim tests.
If no safe implementation exists within these boundaries, return the exact
source-proven blocker rather than silently reducing functionality.
