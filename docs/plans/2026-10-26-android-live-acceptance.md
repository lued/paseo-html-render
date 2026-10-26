# Android-first live Paseo acceptance

Date: 2026-10-26
Status: user authorized completing live acceptance (item 2), using OpenCode Go DeepSeek max subagents. npm authentication/publication is deferred to the last step. macOS is not an acceptance target.
review: none

## Integrated deployment checkpoint — 2026-10-26, 07:55 UTC

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
- No npm login, npm publication, push, tag or GitHub release in this phase.
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
