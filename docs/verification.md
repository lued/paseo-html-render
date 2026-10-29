# Verification and release evidence

Updated: 2026-10-29. Candidate: **paseo-html-render 3.0.0**, plugin id
`html-render`, MCP key `html-render-v3`. This is a staged release record, not a
claim that npm publication or live client acceptance has finished. Historical
`v2.1.0` stays unchanged. Everything after the 3.0 section is **pre-0.14
historical evidence** for the unpublished 2.2.0 candidate (Paseo 0.12/0.13,
`agent.create` injection, `bridge.sock`); it does not describe 3.0.

## 3.0.0 on Paseo 0.14 (2026-10-28)

Local gates on branch `feat/v0.14-migration`, Node 26.13.0, each bounded by
`timeout 600`:

| Gate | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm test` | 310/310 pass, 104 s |
| `npm run check:bundles` | pass: client `es2020`, server `node20`, explicit SDK externals, Pele server-only |
| `npm run check:package` | pass: 74 entries, 43 required files, 0 forbidden; sha256 `1c4baf58…7997` (commit `1546ca7`) |
| `npm run smoke:package` (CLI/daemon 0.14.0-beta.2, isolated home) | pass: session-open line `injected server=html-render-v3 transport=stdio alwaysLoad=true reason=create purpose=interactive`; saved record without the v3 key or token; token file 0600; tombstone present; adapter `initialize`/`tools/list`/`html_preview`/`html_render`/RPC readback; both missing-browser negatives |
| native tests (`tests/native-*`) | 29/29 pass; emulated, not device evidence |

Real-daemon lifecycle, 0.14.0-beta.2, isolated `PASEO_HOME` on this machine (no
user agents involved), Pi provider with `ocx/opencode-go/deepseek-v4.1-flash`:

| Check | Evidence | Result |
| --- | --- | --- |
| Install | plugin `running`, 3.0.0; data root holds `mcp-adapter-v3.mjs`, `mcp-adapter-v1.mjs` (tombstone), `bridge-v3.sock`, `bridge-v3.token` | pass |
| Legacy 2.x-shaped agent (saved `html-render` → `mcp-adapter-v1.mjs`) opens and prompts | prompt completed; `injected server=html-render-v3 reason=create`; processes: tombstone and v3 adapter | pass, no collision |
| New agent is launch-only | saved `mcpServers` empty, token absent from the record; v3 adapter process for the agent | pass |
| Opt-out label `html-render/disabled=true` | `skipped skip=label`; no adapter process | pass |
| Reload reaches an idle agent | after `plugin reload`, next prompt logs `injected reason=refresh` | pass |
| Disable reaches an idle agent | adapter process present before, gone after the next prompt | pass |
| Re-enable reaches an idle agent (`injectIntoAgents: true`) | next prompt completed, `injected reason=refresh`, adapter back | pass |
| Resume re-injects (daemon restart, same path as the 60 min idle release) | `injected reason=resume`, adapter back | pass |
| History open of an archived agent | `skipped skip=history`; no v3 adapter. Its saved legacy entry still launched the inert tombstone | pass |
| Real card from a model | agent `44f514e1-2368-46d3-be7c-8370a3fbec96`, artifact `d1e98151c32ea1ccd0a65fee90418eae`, rows `mcp__html_render_v3__html_preview` / `…__html_render`, PNG preview 24,324 bytes read back through the plugin RPC, report link in the reply | pass |
| Install/re-enable with `injectIntoAgents` off (default) | idle Pi agent opened without MCP fails its next prompt with `Provider 'pi' does not support MCP servers (plugin html-render)`; a daemon restart fixes it | **host defect**, documented in `docs/compatibility.md` |

Real daemon on slydio, Paseo 0.14.0-beta.1 (upgraded outside this work; no
pre-upgrade config backup exists, the current one is
`~/.paseo/config.json.at-0.14-beta.1`):

- 3.0.0 installed from a worktree at `a41ceec`; plugin `running`, log `Plugin
  ready`. Its data root holds the v3 adapter, the v1 tombstone (2,528 bytes), the
  socket and the 0600 token file.
- 35 saved agent records still carry the 2.x `html-render` entry. Two of them
  (`3d113c1d…`, created for this check, and one existing user agent `e48168a0…`)
  were reloaded and prompted on 0.14 without a collision.
- No card was produced on slydio; the card evidence above comes from the
  isolated 0.14.0-beta.2 daemon.

Dogfood on the user's daemon (0.14.0-beta.2, plugin installed from this
worktree, 2026-10-29): the existing chat reopened with `injected
server=html-render-v3 reason=resume` and published artifact
`16a012fb1d084d84934fbff8c053b866` from a nested codemode call. The Android app
(0.13.2; no 0.14 mobile release yet) then showed the plugin as failed: `requires
Paseo >=0.14.0-beta.1 <0.15.0. Your app is 0.13.2`. Paseo checks the same range
against the app. The range is now `>=0.13.2 <0.15.0`, and a 0.13 daemon is
handled at session open (`skip=host-unsupported`).

**Android device failure, 2026-10-29:** the report renders and stays mounted
behind the non-destructive banner, but the ready handshake consistently times
out, including after app restart on `bd8ec1e`. Screenshot: `onMessage 0,
fragment 0, chunks 0, messages 0, probes 1, rejected 0`. Dual-channel immediate
sends did not fix it. `probes 1` counts an attempted command, not receipt in the
page. Physical Android acceptance is **failing**, not passed by the local gates.

The `diag-1` candidate adds independent page-local evidence without changing
the transport or 8 s deadline. It reports scheme and lengths (no URL), iframe
loads, raw/source-accepted/ready messages, actual native-probe receipt and send/error
counts, then hides after a real ready ack. The native timeout text identifies
`diag-1` too. Next required evidence: a phone screenshot with both diagnostic
blocks visible. This is an instrumented build, not a claimed fix. Local diagnostic
gates: typecheck; 312/312 tests (123 s); bundle check; real Hermes entry,
constructor, host-matrix and generated-document equality checks; package check
(74 entries, 43 required files, 0 forbidden) all pass. These do not supersede the
failing phone result.

The Hermes check now compares the actual generated inner document and shell
byte-for-byte with Node's builders. The browser helper now has a real `data-url`
mode; its old `data` mode is actually about:blank/setContent. Chromium reproduces
blocked fragment navigation on true data URLs, but WebView's
`loadDataWithBaseURL` substitutes the base URL as the document URL in
`content/renderer/render_frame_impl.cc`. Therefore that reproduction alone does
not prove the phone uses a data: document; page-local evidence is still needed.

Not verified: a successful physical Android handshake, cold start, 120 s dwell,
reopen, background, theme, links and image zoom, Chrome and PWA parity, the
turn-collapse display, Claude/Codex providers, and npm publication.

**Live acceptance resumed 2026-10-26; not production-accepted.** The user has
authorized completing the remaining live cases with OpenCode Go DeepSeek max
subagents, prioritizing Android. macOS is not a required gate. npm authentication
and publication remain deferred. The authorized GitHub checkpoint is pushed;
no release tag or npm publication has occurred.
Previous dogfood history is preserved. The user requires inline interactive
cards on Android native, Chrome and PWA. PNG/report-only display or opening an
HTML side pane does not satisfy Android parity. The production Android inline
candidate is now implemented and deployed as recorded below; actual physical
Android acceptance remains open. See the internal Android-first acceptance plan
for ownership and evidence requirements.

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

## Earlier native-selection correction — deployed 2026-10-27, 04:35 UTC

The user's next physical Android attempt **FAILED interactivity**: the plugin
loaded but displayed the PNG with the generic amber static-fallback message.
That proves selection rejected native before mounting; the startup-only fix was
not native acceptance. The exact installed phone version remains unknown.

The old gate required a function DocumentFrame export. Public Paseo0.12 UI
source has no such export (separate UI/RN namespaces), despite the supported
range and possible existing native WebView. Parent reproduced that exact false
host-document-frame result in the immutable 24ff delivered bundle under real
Hermes with the actual0.12 export shape and positive native-manager/command
surfaces. New selection uses a nonregistering public UIManager query instead;
DocumentFrame is optional. Explicit negative queries win even on0.13, malformed
configs fail closed, missing commands/boundary still reject, and visible
fallback/mount failures are reason-specific and URL-safe. No private imports,
new dependency, duplicate registration, bridge or cache/cookie clearing.
A native-manager query does NOT prove JavaScript view registration or handshake.

Parent verification after review corrections:
- **291/291 on BOTH Node22.18.0 and26.12.1**, zero fail/skip/cancellation.
- **Full G1–G6:6/6 PASS**, actual requested DeepSeek max protected hosted web,
  password_prompt missing/wrong/correct outcomes, exactly one inline frame
  after refresh, authorized source readback and positive owned cleanup.
- Typecheck/bundles PASS;17 client/24 server inputs; Pele server-only.
- New mounted selection regression covers no-DocumentFrame+manager present
  versus absent; it uses DOM/native shims, NOT a physical WebView.
- Real Hermes full exact-delivered entry/setup/cleanup, constructors and both
  host profiles (0.12 separate namespaces/no DocumentFrame;0.13 unified UI),
  including missing-manager/command negatives: PASS via both Node drivers.
- Exact package/repack and both Paseo0.12/0.13 install-smokes PASS; all74 packed
  files equal current source. Package SHA256:
  81986a25f7310af00562c8970c82689574782aa3f792d7920c5399f7918983b5.
- Packed1,566,361 /unpacked2,071,759 bytes;74 entries/43 required/40 local
  links/zero forbidden. Actual catalog client SHA256:
  ebd409563517782a19df03408e71ea983d77d7b5ef813e647b4687cfd61b4362,
  159,934 bytes; exact independent installed-host compilation equality.
- Existing html-render only normally reloaded. No host auth/relay/security,
  other-plugin change, temporary probe, npm/push/tag/release. Remote CI unrun.

Evidence:/tmp/hr-acceptance-20261027/native-selection-fix/parent/.
Retained first parent full-suite failure: modern test shim newly exposed an
explicit negative native-manager query by default although its fixture intended
an available host. Parent fixed the fixture default, retained explicit false
negative cases, and reran BOTH entire suites. Other review corrections reject
primitive/array configs, avoid guessing registration failures from any error
containing RNCWebView, and remove a swallowed timeout in the new mounted test.
At that checkpoint, physical controls were **not yet observed**. The subsequent
user-confirmed local interaction and delayed ready failure are recorded above.
Retry the same saved card; no republish needed. Chrome/PWA, images/lifecycle and
remaining acceptance ledger stay open. Neither preceding candidate nor the
worker's intermediate728e6e6f package is the verified current package.

## Earlier startup-only correction — deployed 2026-10-26, 22:29 UTC

The user's physical Android screenshot rejected the previous candidate: the
plugin failed during setup with Cannot read property 'prototype' of undefined.
Parent reproduced that exact error in a real Hermes VM using the immutable
old delivered bundle. The failure was at new ArtifactCatalog(), not missing
React.Component and not a WebView fallback. All three class-valued bindings
were undefined in the full evaluated wrapper; small evaluated classes worked.
Only converting the affected class definitions to function/prototype code made
the full entry initialize. Catalog dedupe, assembler state/limits and React
error containment remain covered and unchanged in behavior.

| Corrective gate | Result |
| --- | --- |
| Exact delivered bundle in real Hermes | **PASS**, full factory/setup/cleanup and separate catalog/assembler/error-boundary construction checks; Node 22 and 26 drivers |
| Full serial suites, latest auth-harness repair | **289/289 PASS on BOTH Node 22.18.0 and 26.12.1**, zero fail/skip/cancellation |
| Latest full G1–G6 | **6/6 PASS**, zero blocked/unavailable; 22:36–22:37 UTC |
| Typecheck / bundles | PASS; 17 client / 24 server inputs; Pele server-only |
| Exact install/smoke | PASS, Paseo 0.12 / Node 22 and Paseo 0.13.0-beta.2 / Node 26 |
| Package / repack / source | Matching tarballs and all 74 packed files equal current source |
| Package SHA-256 | 841b7177fbe2eb17e61527382082a792c270a4eda93ff13201134597a8d5b28f |
| Sizes / contents | 1,564,698 packed / 2,066,739 unpacked bytes; 74 entries, 43 required, 40 local links, zero forbidden matches |
| Actual delivered client SHA-256 | 24ff34f42de25497d735e0fb8bcb43988f0d6a4b65987e6a465264fc8fb50507; 157,636 bytes |
| Deployed identity | Byte-identical to independent installed-host compilation; same exact bytes passed Hermes |
| Physical Android after correction | **Not observed yet**; needs retry of the corrected integrated candidate |

Private evidence: /tmp/hr-acceptance-20261026/native-load-fix/parent/.
The previous 11453c79 candidate and intermediate 3858ba94 package are superseded;
never publish them. No user-host probe, auth/relay/security change, other-plugin
change, npm publication, push or tag. Only existing html-render was reloaded.

The repeatable strict check is npm run check:client-eval -- --hermes <VM>, with
optional --bundle <actual-delivered-bundle.js>. It executes the unmodified entry
and a separately instrumented constructor/lifecycle check. It uses real React,
Zod and shared SDK exports with synthetic unmounted RN/UI surfaces. The official
Hermes release asset tag is v0.13.0; executable identifies Hermes 0.12.0 / HBC96,
with -Xes6-class -enable-eval. This is a real VM, not hermesc/parser/Node, but NOT
asserted to be the exact phone build or Fabric/WebView evidence. CI pins the
official download SHA and requires this gate; remote CI remains unrun. An AST
class guard also checks the complete client bundle without rejecting HTML
class attributes or strings. No new production dependency was added.

The first corrective G1–G6 run failed in disposable hosted authentication before
any card: the current pairing UI could preserve a wrong password override while
a same-host link was submitted, and the harness raced busy/readonly controls.
That failure and verified cleanup remain under e2e/. The bounded harness repair
waits for enabled/editable controls, checks filled values only as a boolean, and
completes an already-present password prompt instead of resubmitting a stale
wrong override. BOTH full suites and full G1–G6 were rerun afterward. Latest
hosted run actually used password_prompt: missing-password negative, fresh wrong
rejection/no admitted host, correct admission, one inline card after refresh,
authorized exact source readback and positive browser/profile/daemon/root cleanup.
This now proves the prompt branch, not merely credential-link onboarding.

## Rejected native candidate — historical 07:53 UTC deployment

The existing user installation of html-render was normally reloaded; no probe
plugin was installed and no auth, relay or security settings were changed.
Android auto/iframe cards now fetch authorized original HTML and mount the
trusted WebView shell with an opaque allow-scripts inner frame. Public runtime
capabilities are checked; unavailable hosts and load/transport failures are
explicit degradation, not parity acceptance. Desktop behavior remains covered.

| Check | Independently observed result |
| --- | --- |
| Full serial suite, Node 26.12.1 | **287/287 pass**, zero failures/skips/cancellations |
| Full serial suite, Node 22.18.0 | **287/287 pass**, zero failures/skips/cancellations |
| Typecheck / bundle boundaries | PASS; 17 client / 24 server inputs; Pele server-only |
| Full G1–G6 wrapper | **6/6 pass**, zero blocked/unavailable gates; 07:54–07:55 UTC |
| Exact package install/smoke | PASS, Node 26 / Paseo 0.13.0-beta.2 and Node 22 / Paseo 0.12.0 |
| Package/repack/source equality | PASS; independent tarballs identical; all 74 packed files match deployed source tree |
| Package SHA-256 | `11453c79da4528c4df65d1cf3dea4e899c3d6d6d55f1c70bb093617017409dfc` |
| Package sizes / contents | 1,563,606 packed / 2,062,771 unpacked bytes; 74 entries; 43 required files; 40 local links; zero forbidden matches |
| Actual host client bundle | 156,969 bytes; SHA-256 `4f5cc85d2cad38ef33450904d3f7851b97fe93ecb089ac4e30f4df277ef0e692` |
| Deployed bundle equality | Byte-for-byte equal to independent installed-host compilation of current source, including path comments |
| Physical Android native / Chrome / PWA | **Unverified; ready for the user's single integrated phone pass**, not accepted parity |

Private evidence: `/tmp/hr-acceptance-20261026/integrated-parent/`.
The exact tarball is under `package/`; matching repack under `repack/`.
Initial full-suite failure was an obsolete expectation for the corrected
inspector static note; the expectation was fixed and BOTH full suites rerun.
The first deployment hash comparison differed only in esbuild path comments;
matching the daemon's compiler cwd produced exact raw-byte equality. Both
initial failures are retained, not silently counted as passes.

Native-focused browser/protocol/component tests cover real arbitrary/dynamic
inline scripts, opaque-parent/storage denial, blocked remote fetch, no RN JS
bridge, genuine image/link activation, a real multi-chunk PNG opened twice,
message/session/replay/ack validation, bounded queues/deadlines, ordered theme
acks during image transfer, stable source across theme changes and document
identity reset. These remain Chromium/shim evidence, not Android Fabric proof.

G6 used the requested DeepSeek max model, a generated-password disposable host,
completed render rows and exact authorized original-source readback. Normal
credential-link UI rejected missing/wrong credentials, admitted only the owned
host, and displayed one inline card after refresh. Password-prompt-branch and
mobile-control acceptance are not inferred. Browser/profile/daemon/root cleanup
was positively verified. npm publication and remote CI remain unperformed.

## Historical candidate identity

**The table below is the last verified historical tarball, not a publishable
candidate for the current tree.** The accepted flow hit-target repair changes
packed example content. A new exact package, full suites and install checks are
required after integration; no replacement tarball has been verified yet.

Runtime content through `a477d8d`, including atomic guard `e3987a1`, production
type-resolution fix `907be95`, Chromium launch-error fix `793ae7c` and the
live-dogfood reduced-motion capture correction.
Verification-only scripts/docs/CI changes do not enter the package allowlist.
Any change to a packed file requires a new integrity check and acceptance run.

| Artifact property | Verified value |
| --- | --- |
| Filename | `paseo-html-render-2.2.0.tgz` |
| SHA-256 | `bd514b08bcb7d036674d713848272595475198be2c0a82d0d18b21ee30c5f115` |
| npm integrity | `sha512-geTDAtz997DT0lFa3B3/kIokbR32qfFO+2YmQp1SkfqNNgof6qrVRAyMwse9u46ftHoablknJZUkBCDmA70s3Q==` |
| Packed / unpacked | 1,554,597 / 2,027,970 bytes |
| Contents | 72 entries; 43 required public files; 40 local Markdown links checked; zero forbidden/private matches |

Parent independently repacked the tree and matched the same SHA-256. The older
candidates beginning `0112c118` and `5543c437` are superseded and must not be
published. The verified release file is in `/tmp/hr-release-2.2.0/motion-target/`.

## Independently executed local gates

| Gate | Result |
| --- | --- |
| Full serial suite, Node 26.12.1 | **259/259 pass**, zero skipped/failures/cancelled |
| Full serial suite, Node 22.18.0 | **259/259 pass**, zero skipped/failures/cancelled |
| Typecheck | PASS |
| Bundle boundaries | PASS; 15 client / 24 server inputs; Pele server-only |
| Actual tarball contents/links | PASS, integrity above |
| Sandboxed hosted-client browser helper | PASS startup/evaluation; full client flow remains below |
| GitHub Actions | Workflow added; remote execution pending |

CI uses Ubuntu 22.04's existing Chrome, probes an actual sandboxed render before
tests, runs the full serial TAP suite and requires zero skips/cancellations.
It has read-only repository permission and no publication credentials. Renderer
and live-acceptance browsers do not use `--no-sandbox`.

## Exact production installation

The baseline failure was reproduced with Paseo's real acquisition flags:

```sh
npm install <exact-tarball> --ignore-scripts --legacy-peer-deps --omit=dev
```

The previous package failed host compilation on an undeclared type-only
`@getpaseo/client` import. The server now derives the API type from the
host-provided SDK; no heavy client runtime dependency was added.

Parent independently installed the exact candidate and exercised **real isolated
Paseo daemons**, not API stubs, on both toolchains:

| Node | npm | Paseo daemon / SDK | Preview, publish, authorized readback | Negative browser cases |
| --- | --- | --- | --- | --- |
| 22.18.0 | 10.9.3 | 0.12.0 / 0.12.0 | PASS | PASS |
| 26.12.1 | 11.20.0 | 0.13.0-beta.2 / 0.13.0-beta.2 | PASS | PASS |

Each run proved `Plugin ready`, injection into an idle fixture agent, real stdio
adapter initialization/tool discovery, PNG preview, durable publish, and
`html.artifact.read` / `html.artifact.original` through actual authorization.
No model prompt was sent in these install tests. Fixture homes, workspaces and
daemons were disposable and did not replace the live installation.

True missing-browser calls returned `browser_unavailable`; a nonexistent explicit
override returned it on **two consecutive calls**. The plugin stayed running in
both cases. Missing, non-executable and synchronously invalid paths also have
retry/cleanup regressions. No browser was downloaded or sandbox disabled.

Current private receipts: `/tmp/hr-release-2.2.0/motion-smoke-012/`,
`motion-smoke-013/`, `motion-target/` and independent `motion-repack/`. Raw logs/screenshots remain
private; pairing offers, bridge credentials and unrelated user data are not
release artifacts. Commands for reproducing the checks are in [release.md](release.md).

## Live Paseo case ledger

Local tests and fixture installs are not substitutes for a model using the plugin
in the actual hosted client. These cases are the remaining live acceptance work:

| Case | Status |
| --- | --- |
| D1 fresh injection and text-only single-fact selection | PASS: fresh 2.2.0 adapter injected; agent read package.json and replied `2.2.0`; zero HTML calls |
| D2 chart of real repository/tool data | Counts 14/7/9 independently verified; initial PNG captured intermediate animation. Fixed at `a477d8d`; parent geometry/PNG check and real model post-reload preview PASS. Final hosted acceptance pending |
| D3 source-based flow and built-in Pele/report graph | PARTIAL (2026-10-26): one real publication, four inspected previews; stored 6-node/6-edge report graph has actual light/dark Pele PNGs. Parent inspected source/PNGs. Native-report transport wording corrected in report-only update; actual client/Android checks remain pending |
| D4 all three showcase pages published and inspected | PARTIAL: pipeline and image-inspection artifacts available; image preparation/static defaults checked. Incident timeline and complete hosted/Android showcase checks pending |
| D5 flow/inspector/filter controls, keyboard, motion and reflow | PARTIAL: flow centre-hit defect fixed; corrected saved artifact and inspector controls pass in opaque local frames. Inspector source static wording and captures repaired; filter pending; simple current-chat controls user-confirmed on the phone before a delayed ready failure; sustained post-fix controls unverified |
| D6 actual web auto/iframe/static/report views and file link | PARTIAL: reviewed protected requested-model run PASS for hosted desktop-web auto inline card and file preview. Other modes and full native/Android surfaces remain pending; simple local phone interaction worked before a ready timeout, with recovery deployed but not device-verified; file preview is not native parity |
| D7 same-turn/concurrent/unchanged refusals and next-turn update | Live pending-reservation race PASS (one success), same-turn unchanged PASS, cross-turn exact-repeat PASS (16 ms), meaningful report-only update PASS. Real client/device presentation beyond the protected fixture remains pending |
| D8 image/report/metadata changes, missing-image diagnostics and ownership/readback | Report-only correction PASS with HTML/previews/graph bytes preserved; image inlining/static checks and preview-only missing-image diagnostic PASS. Metadata, cross-owner/authority and legacy cases remain pending |
| D9 persisted history, refresh and one card per artifact | PARTIAL: one protected hosted-web artifact survives refresh with exactly one inline card despite outer/direct render rows. Android and remaining artifact/control cases pending |
| D10 exact production tarball / actual published npm-source acquisition | Current5b32291d… package/repack/source74, both exact-install smokes and raw deployed-byte equality PASS; full Hermes matrices PASS. Registry/npm-source publication remains deliberately deferred |

Historical pre-repair evidence (superseded for the narrow protected fixture by
the checkpoint below): the full live `npm run verify:e2e` run produced **5 pass / 1 fail**: G1–G5
passed; G6 timed out while the real hosted client was connecting, before a card
was displayed. Private evidence is in `live/e2e/` under the receipt root.
Chrome 153 initially blocked local/loopback networking. Per-origin permission
grants in a disposable QA profile removed that block; the actual app then
reported **Password required**. No password was read, authentication disabled,
or browser sandbox/CSP weakened. A visible Paseo-browser attempt also timed out;
its owned pending tab was closed. This was an ambient test-setup failure, not a need to retrieve the user
password. The 2026-10-26 scout found the harness did not drive the web paste-link
and password flow and could use localhost auto-bootstrap instead. A protected
disposable fixture with generated credentials and scoped UI assertions is being
implemented. Earlier ambient-host runs did not establish the pairing path.
Actual physical Android observations still require the target phone.

After the capture correction, G1–G5 were rerun at `a477d8d`: **5/5 pass**,
zero skips/cancellations (`live/motion-e2e/`). G6 was deliberately not selected
in that targeted rerun and is **not** counted as passing. G2 mounts real
components but uses a native shim; it is **not** physical iOS/Android evidence.
G6 drives the real hosted Paseo web application, not the outer Electron shell.
A blocked/unavailable gate is never counted as a pass.

At pause the parent conversation previewed/published an existing showcase page
so the user could see a render in this thread. That conversation still has
adapter 2.1.1, which correctly warns to reconnect to 2.2.0; its publish also
warned of an unknown counted turn. It is not fresh-adapter or guard acceptance
evidence. The fresh agent above used 2.2.0. Neither the requested example nor
the local tests establish that the user actually viewed the hosted UI.

### 2026-10-26 source flow and Pele evidence

Fresh agent `7f2af7be-6c85-475c-989f-580cb77a270f` published artifact
`56de6280af18b8d2d997e52e753f9940` exactly once. Parent inspected the static
page and graph PNGs, and checked the manifest: report 4779 bytes; graph
`publish-flow`, 6 nodes / 6 edges, both preview flags true. Server-baked
light/dark PNGs are 728×154. Real tool calls returned no staleness or degraded
guard warning. Receipt: `/tmp/hr-acceptance-20261026/source-flow/receipt.md`.
This proves tool publication and built-in Pele execution, not physical Android
or hosted-client display. Parent found one native-report transport sentence
mislabeling forwarding as stdio: the adapter accepts MCP stdio but forwards to
the bridge over a Unix socket. A report-only correction is the next meaningful
update/concurrent-guard case; preserve the original artifact as evidence.

### 2026-10-26 real concurrency and report-only update

Two different corrected reports were submitted concurrently through the injected
adapter. Exactly one published (`032922ef886658df97f1a6ed8be86e30`). The other
returned the pending-reservation per-turn refusal 1496 ms before the winner
completed, with no invented artifact id. An exact same-turn repeat then returned
unchanged/duplicate referencing the winner. No stale/degraded warning appeared.
Parent independently checked the recorded timing/refusal and the artifact
bytes: original, interactive page, light/dark previews and graph PNGs are
identical to the base; only report `outcome.detail` and `blocks.2.items.0` changed.
Receipt and independent `parent-verification.json`:
`/tmp/hr-acceptance-20261026/guard-report-update/`. Cross-turn exact-repeat and
actual client/history display are separate unfinished checks.

### Static-chart defect found by actual dogfood

The first model-generated chart used an entrance animation. Its labels were
correct, but the stored PNG showed intermediate bar lengths. The original
artifact remains unchanged as failure evidence. A new regression first failed
with active animation and near-zero bar width, then passed with the reduced
motion media preference set before page load. Captures and measurements now
request that preference; page scripts remain disabled and live motion is
unchanged. Rendering the exact original source now produces the correct 14/7/9
geometry. The same live agent then read the exact source and made one actual
`html_preview` call after reload: PASS, 728×380 PNG, bar endpoints measured at
14/7/9 units; no republish or artifact mutation. CSS can ignore the preference,
so guidance also prohibits animating essential chart geometry on initial load.
This is not a general CSS freeze.

### 2026-10-26 reviewed protected-host/model/browser checkpoint

Parent independently ran the current fixture with `pi`,
`ocx/opencode-go/deepseek-v4.1-flash`, thinking `max`: **PASS**,
04:34:17–04:35:46 UTC, Node 26.12.1 / Paseo 0.13.0-beta.2 / source 2.2.0.
Private evidence: `/tmp/hr-acceptance-20261026/protected-parent-g6-reviewed-HqPqT8/`.
Artifact `6446ff61b48360ffbe38ced3c307d576` belonged to this disposable fixture,
not the user installation; cleanup intentionally removed its live files.

- Bridge socket 58/100 bytes, actual Unix socket, matching current adapter hash.
  This repairs the first failed run: a deeply nested fixture home caused bridge
  startup failure even though Paseo reported Plugin ready. That first run had
  no browser evidence and is not counted as a pass.
- Both a completed codemode row and a completed direct render row carried the
  same unique marker/artifact/title. The underlying invocation count cannot be
  inferred from their two provider row IDs. Authorized plugin readback matched
  the exact owned interactive file and requested original-source SHA-256.
- Persisted owned record observed MCP stdio configuration and `alwaysLoad:true`;
  these are config diagnostics, not proof of provider-runtime alwaysLoad behavior.
- Server admission rejected missing/wrong passwords with exact reasons and
  accepted the generated password. Hosted UI used `link_credentials`: real
  paste-link onboarding, rejected missing/wrong credentials with no admitted
  host, then connected only the expected fixture host. It does **not** prove the
  password-prompt UI branch. No stored host/password injection, ambient local
  bootstrap, user password access or security-setting changes.
- Parent inspected actual timeline/refresh captures: one opaque allow-scripts
  inline card with real CSP and marker, still one after refresh. File preview
  was separately checked as a secondary view, not native-inline acceptance.
- Browser stopped/profile removed; daemon status proved stopped with null PID;
  owned work root removed. Missing cleanup evidence downgrades a completed run.
- Parent typecheck and 15/15 focused tests pass on Node 26 and Node 22, zero
  failures/skips/cancellations. These do not replace a latest-tree full suite,
  full G1–G6 wrapper run, all-mode checks or physical Android controls.

### 2026-10-26 example and native-capability checkpoint

Flow artifact `d12fd46cd0fe5e63854131e25cd7b389` exposed rotated decorative
chevrons covering narrow stage centres. A failing-then-passing mouse/touch
regression supports the minimal pointer-events repair. Corrected exact artifact
`47099278b32b0f50e4904bb5a7a6cb69` passes local 375/390/wide interactions,
keyboard and static/motion checks. Captured PNG bytes stayed unchanged; source
hash changed. Inspector `6e6109469a633921d28083b17cbfb2be` passes exact-artifact
range mouse/touch/keyboard, theme, motion, reflow and useful script-disabled
checks. Its saved artifact retains the old side-by-side note. Source wording,
captures and both narrow/wide script-disabled regressions are now corrected;
the saved artifact was not silently rewritten or republished. Receipts: `interactive-flow-fix/` and `interactive-inspector/`
under the private acceptance root. These are not hosted/phone control evidence.

Actual pinned host source exposes the full public RN root and bundles WebView.
A raw already-registered RNCWebView string/public-command route compiles without
deep imports or registry overrides; a mandatory host update is not proven.
Parent reviewed/hardened the private counter-only prototype: exact script hashes,
trusted shell plus opaque iframe, parent/source filtering and acknowledged reset
(including reset at zero). Its 7/7 local Node-reported tests pass, including a
real Chromium shell check with the OS sandbox explicitly enabled and bypass
flags checked absent. Controlled forbidden-resource endpoints received zero
requests; parent/storage/cookie access was refused. Normal isolated SDK install
passed with generated-password admission and verified fixture cleanup. Reviewed
client bundle: 20,278 bytes, SHA-256
`e904d530ac26875273ef9e1507897f2241310bb79df433a161f58b8a99e52023`.

No user-host probe installation or phone execution has happened. The prototype
is a separate diagnostic screen, not conversation-inline implementation or
Android parity. Actual native render/events/command/containment checks and full
inline height/theme/accessibility/history/image behavior remain open.

## Boundaries and unverified claims

- Native devices, the outer Electron shell and macOS app-bundle discovery have
  not been freshly exercised here. Native fallback implementation/mounted tests
  are not physical-device acceptance.
- Natural tool selection is model/config dependent. Pi can truncate or override
  the first-line MCP summary via description/shared budgets; `alwaysLoad` is not
  a universal exposure guarantee. Do not infer all-provider coverage from Pi.
- The guard compares exact prepared inputs, not semantic equivalence. It retains
  50 publishes per attributed agent in memory; restart clears state. Missing
  attribution or unknown lifecycle degrades explicitly. See [compatibility.md](compatibility.md).
- A per-item transformer cannot suppress arbitrary marker duplication in unrelated
  third tool rows. The supported wrapper/inner-row and history paths have regressions.
- Opaque frames retain `allow-scripts` only; static screenshots disable JavaScript.
  CSP blocks resource loading, but iframe self-navigation is a documented residual.
- Positive npm-source proof requires publication of this immutable tarball to
  `next`, matching registry integrity, then actual isolated Paseo npm acquisition
  and readback. Only then may it be promoted to `latest` and released on GitHub.

## Historical checkpoint

The 2026-10-21 v2.1.0 record reported 178 tests and six e2e gates. Those historical
counts are not current release evidence. Source commits and previous revisions of
this document retain the earlier durability/marker recovery and policy history.
