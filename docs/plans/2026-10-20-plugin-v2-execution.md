# Plugin-v2: full plugin-only T3 parity execution

Date: 2026-10-20.
Status: v2 backend activation/smoke passed, then user-reported UI regression triggered rollback to v1. Fullscreen removed at user request; revised local gates 149/149 pass. Revised v2 is not live. Actual-client acceptance and regression diagnosis remain open.
review: none (user prohibits cross-lab review).

## Outcome and verification surface

Complete the implementation described in HANDOFF.md and
2026-10-20-t3-parity-plugin-only.md in this worktree. Preserve T3-shaped tools,
private workspace-owned artifacts, marker/history compatibility including nested
Pi codemode, strict sandbox/CSP, and the proven live web/desktop iframe. Add a
bounded native report model/UI, Pele graph previews, scoped local images,
responsive measured heights, inline-only rendering, failure fallback, and an absolute
interactive.html file-link delivery contract for Paseo's built-in file preview.

Verify with typecheck, all existing and added tests, real Chromium security tests,
package/bundle audit, live daemon tool/ownership/history evidence, and available
client observations. Never equate a server test, browser harness, or compact web
viewport with actual native-client verification. Record unavailable gates.

## Evidence before implementation

- HANDOFF.md and the original parity plan read completely.
- npm run typecheck: pass. npm test: 30/30 pass, zero skipped.
- Daemon 0.12.0, PID 35052; html-render running from plugin-v1. shared-browser
  running and out of scope. No live changes performed during planning.
- Git branch plugin-v1 has no commits; all plugin source is untracked. A normal
  branch-off implementation worktree has no committed base. Do not create a commit
  to bypass the user's prohibition. Preserve a private baseline snapshot before
  any implementation. Implementation children will run sequentially unless a
  valid existing committed base is discovered; read-only scouting/checking may
  run concurrently. This is an explicit scheduling limitation, not permission
  to overlap source writers or introduce a commit.
- T3 reference source confirms theme postMessage updates without reloading,
  borderless frames, multi-width fitting, fullscreen and zoom, and user-activation
  checks for privileged link/image messages. T3's network/forms policy is broader;
  do not copy that relaxation.
- Public SDK 0.12.0 exposes workspace.archived lifecycle events and clipboard
  helpers, but no cross-platform inline HTML/WebView surface.
- npm registry identifies pele 1.7.0 as obsidianmd/pele. Inspect package/API and pin
  exact version plus lockfile before adopting; do not use external dotfiles.

## Decisions (and rejected alternatives)

1. Keep html_preview and daemon screenshots script-disabled. Live HTML may execute
   inline scripts in an opaque-origin iframe or built-in file preview only.
   Reject enabling daemon report scripts merely to match T3: this changes the
   proven security boundary. JS-generated-only HTML may have an empty static
   preview; document it and recommend a meaningful static HTML skeleton/report.
2. Optional report JSON is additive to html_render. Legacy markers/manifests and
   static behavior remain readable. On web/desktop, auto/iframe selects live HTML;
   native uses report UI when available, otherwise static PNG. Explicit static
   avoids live HTML. No arbitrary HTML execution in React Native report blocks.
3. Use reusable pure document/theme/message/height helpers plus a web-gated frame.
   Theme changes post messages instead of replacing srcDoc. Use strict source and
   bounded payload validation. Privileged links/images require user activation;
   omit host keyboard replay because Paseo has no suitable public command bridge.
4. Amended by user request: live frames are borderless and inline-only, with no
   fullscreen controls, viewport overlay, fullscreen zoom toolbar or Escape-dismiss
   handlers. Browser fullscreen permission is explicitly denied. Keep PNG fallback
   on failure/handshake timeout. Do not add the previously removed
   generic Open report button to ordinary live HTML; structured native reports
   may have a report-detail entry point as specified in the parity plan.
5. Generate interactive.html with a leading restrictive CSP and bounded data-URI
   images. Return its absolute path and a Markdown link instruction in tool
   output. No HTTP preview server, private host import, dependency source patch,
   or cross-plugin coupling. File-preview client capability remains a live gate.
6. Inline only scoped workspace raster images after realpath containment, format
   sniffing and strict per-image/total limits; reject symlink escapes, file URLs,
   traversal, oversized assets and unsupported image types. Keep remote resources
   blocked. Original HTML remains byte-identical and private.
7. Pele consumes only server-generated, escaped graph syntax from bounded JSON;
   rasterize light/dark SVG previews with the existing inert Chromium renderer.
   Native node/edge lists remain available even when rasterization fails. Usage
   values explicitly distinguish measured, estimated and unavailable; do not
   invent cost, attribution or accounting.
8. Artifact retention is non-destructive by default: retain existing artifacts.
   Add tested workspace-scoped cleanup and opt-in archive cleanup through the
   public hook; no purge of existing live data during this task. Do not introduce
   silent age-based deletion. Document recovery and configurable policy.

## Work packages and file ownership

Every child uses exactly pi/ocx/opencode-go/deepseek-v4.1-flash, thinking max,
created via Paseo create_agent. No fallback, child delegation, cross-lab review,
commits, pushes, publishing, daemon/app restarts, or edits outside the plugin.
Parent owns final integration, dependency/lockfile edits, release gates and docs.
Children may read other packages but only write their explicitly assigned paths.

| Package | Owned files | Deliverable |
| --- | --- | --- |
| A: contracts | shared/report-model.ts (new), shared/limits.ts, shared/protocol.ts, shared/recognize.ts, server/renderer-types.ts (new), tests/report-model.test.ts (new), tests/recognize.test.ts | Bounded strict report/graph/evidence/agent/usage schemas, additive RPC/manifest/marker fields, legacy compatibility, type-only renderer interfaces |
| B: live frame | shared/html-document.ts (new), client/html-frame.tsx (new), tests/html-document.test.ts (new), tests/html-frame.test.ts (new if needed) | Shared CSP/theme/bootstrap, validated messages, responsive fit, stable srcDoc/live theme, inline-only rendering, failure callbacks, web-only guard |
| C: publish/store | server/artifacts.ts, server/tools.ts, server/adapter-source.ts, server/contribute.ts, server/bridge.ts, server/paths.ts, server/images.ts (new), tests/artifacts.test.ts, tests/tools.test.ts, tests/bridge.test.ts, tests/contribute.test.ts, tests/images.test.ts (new) | Atomic private report/interactive/theme-preview persistence, ownership RPCs, report/tool schema, interactivePath and final-link contract, image bounds, retention |
| D: rendering/graphs | server/graph.ts (new), server/renderer.ts, tests/graph.test.ts (new), tests/renderer.test.ts | Pinned Pele integration after parent dependency audit; light/dark graph PNGs, multi-width measurements, preserved inert renderer/network/file guarantees |
| E: native/report integration | client/report-card.tsx, client/report-screen.tsx, client/report-blocks.tsx (new), client/surface.ts, index.client.tsx, tests/report-ui.test.ts (new if feasible) | Theme-aware accessible overview/evidence/run/original tabs, all report blocks, metrics/agents/usage/prompt lesson, graph list, static/native fallback and live frame integration |

### Contract freeze and integration corrections from scout 2

A must publish exact exported interfaces before downstream briefs are issued:

- Marker holds only references and bounded metadata: optional hasReport,
  measuredHeight and heights (at most 24 sorted width/height tuples), never report
  JSON or HTML. Keep version 1 and the existing 8192-character decode budget.
- Manifest version 1 remains backward compatible with optional report/interactive
  byte counts, measured heights, theme previews and graph availability. RPCs add
  bounded report and named asset reads; every handler retains workspace ownership
  checks. Bound base64 output as well as binary files.
- Keep render({html,width,appearance}); freeze measure({html,widths}) and graph
  renderer input/output types. Parent resolves interface changes centrally.
- Keep interactive.html at or below 8 MB, below the observed native file-preview
  plain-text size budget. Asset/page limits and encoded RPC limits must agree.
- C fixes authority initialization for resumed agents via the public
  agent.session_open hook, and aligns adapter/bridge line budgets and timeout
  with base64 preview overhead and bounded multi-width rendering. Add regression
  tests for both paths.

The installed web bundle supports absolute file-preview targets outside the
workspace and maps HTML to the sandboxed preview. This is source evidence only:
actual click-through and native script behavior still require client observations.
Pele's observed API renders Mermaid to SVG; do not assume a graph-layout API.

Scheduling: A establishes contracts first. B/C/D are logically independent after
contracts, but source-writing children remain sequential because of the unborn
Git base. E follows those interfaces. Read-only validation can run in parallel.
If implementation reveals a missing interface, parent resolves it centrally and
communicates it; children never silently expand file ownership. Parent may repair
integration only after the responsible child has finished.

## Execution checklist

- [x] Read handoff and original plan; establish clean test baseline.
- [x] Dispatch two read-only scouts on the exact required model.
- [x] Incorporate both scout reports, including ownership/API and transport-budget corrections.
- [x] Obtain execution-plan approval (user: approve).
- [x] Save private baseline and live plugin source/status/rollback evidence (/tmp/html-render-v2-evidence.LSRivu; baseline SHA-256 b6850cd779579d5a07aded7da2a7589c7e60af497054c5400c30f6067769c56a).
- [x] Implement A: contracts; parent verification 55/55 tests, plus no-graph size-limit regression fixed.
- [x] Implement B: shared document/live frame; Chromium security/state tests and mounted React frame regression pass.
- [x] Implement D: Pele graphs and prepared multi-width measurements; renderer/graph focused tests 30/30 pass. Parent unified screenshot themes with the shared document builder.
- [x] Implement C: publish/store/delivery; private interactive/report/theme/graph artifacts, image scope, ownership/resume and retention.
- [x] Implement E: native/report integration; all blocks, five tabs, graph/accounting, live/static fallback and mounted UI tests.
- [x] Integrate and run complete typecheck/tests/security/package checks: 149/149 pass, no skips; typecheck and bundles pass; Pele server-only; 28 packaged files, no private/test payload; runtime audit 0, dev tree 20 findings disclosed. Parent fixed PNG byte clipping, cancellation/deadlines, schema alignment, transient authority lookup and blank-frame fallback.
- [x] Install plugin-v2 after local gates; verify ready/running and unchanged daemon PID. User removed the prior registration and authorized installation. Real backend smoke passed; subsequent user-reported client failure triggered immediate rollback. Current live path is plugin-v1, running, daemon PID35052; shared-browser unchanged; artifacts retained.
- [x] Exercise real MCP preview/publish and private report/image/graph artifacts; reconstruct one item from the actual persisted outer codemode row. Cross-row duplicate markers remain a limitation, not a globally-single-card success.
- [x] Remove fullscreen entirely at user request; no expand/close/overlay/toolbar/Escape channel, deny child fullscreen. Revised typecheck, 149/149 tests and bundles pass; older interactive export still gets one safe runtime/theme. Do not reactivate before diagnosing the reported UI failure.
- [ ] Observe available web/desktop/client file-preview behavior; record native gates honestly.
- [x] Update OVERVIEW.md, docs/compatibility.md and docs/verification.md with local results, rejected install evidence, rollback procedure and explicit unverified live/client gates. Refresh after activation.

## Acceptance gates and rollback

1. npm run typecheck and npm test pass with no regressions; new tests cover
   schema bounds, marker modes/heights, legacy/missing artifacts, ownership,
   interactive CSP, image containment/limits, graphs, retention and failure paths.
   Browser tests prove script-disabled captures and zero remote/file resource reads.
2. Client tests/harness cover source-spoof rejection, positive bounded heights,
   stable document across theme changes, no outer live-card chrome, fallback,
   compact/theme native block rendering where the SDK test environment permits.
3. npm pack --dry-run and client/server bundles succeed; pin/audit dependencies;
   no host implementation vendoring, source patches, shared-browser changes or
   unexpected private artifact/test payload in the package.
4. Before install preserve plugin-v1 path and runtime evidence. Install using
   paseo plugin install <plugin-v2 absolute path>; never restart daemon/apps.
   On plugin error, failed live tool/authority smoke or client regression,
   reinstall plugin-v1 and verify running status. Keep rollback evidence private
   and reference sanitized paths/results from verification docs.
5. Record actual client evidence for live scripts, theme preserving state,
   auto-height, absence of fullscreen, PNG failure fallback, per-row card history
   reconstruction, and interactive file link. Native iOS/Android and native
   file-preview tests require an actual available client. No client means an
   explicit unverified acceptance gate, not a success claim.

## Boundaries and blocked stop condition

No Paseo source/fork, unrelated plugins, external skill edits, daemon/app restart,
HTTP preview server, commits, pushes, npm publication or undisclosed fallback
model. Do not weaken CSP or add allow-same-origin/forms/popups. Self-navigation
inside a web iframe remains a documented residual risk; do not claim CSP can
fully prevent it. Never claim script-disabled preview parity with T3's script-on
preview.

Between packages, inspect changed paths and rerun focused tests before proceeding;
choose the next unmet gate, not unrelated cleanup. If a dependency, SDK or client
capability blocks a feature, preserve completed work and stop that feature with
exact evidence, attempted safe paths, blocker and one next input/check. If live
activation fails, roll back immediately and record verification. Full completion
requires distinguishing implementation done from client acceptance still open.
