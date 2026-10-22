> **Superseded 2026-10-20.** The five-workspace canary described below was retired
> at user request and replaced by `npm run verify:e2e`. Kept for history only.

# Plugin-v2: isolated Paseo-native QA workflow

Date: 2026-10-20. Status: **approved by user; implementation started**. User also permanently retired live v1: remove its registration, retain artifacts, and never reinstall it as rollback.
review: none (user prohibits cross-lab review).

## Outcome

Make failures reproducible in fresh, visible Paseo workspaces inside plugin-v2,
using real plugin components, real daemon RPC/artifacts and the actual Paseo
client. Separate browser/unit evidence, real backend evidence, and actual-client
acceptance. V1 is permanently retired at user request. Preserve its artifacts, but do not keep it installed or use it as rollback.
Fullscreen remains absent. No host-source edits, shared-browser modifications,
commits, pushes, npm publication, app/production-daemon restarts, or deletion of
existing artifacts/workspaces.

## Read-only scouting findings

- Live plugin ls confirms html-render runs from plugin-v1; revised v2 is not live.
- The 149 tests include a React Native **DOM shim**, not real Paseo/native layout.
  The prior backend smoke passed while the user still encountered UI bugs.
- Public SDK exposes workspace/agent panels, screens, navigation to agents and
  workspaces, theme/layout props, clipboard, RPC and lifecycle hooks. These can
  support an in-Paseo QA panel without a custom preview server or private import.
- Paseo browser automation controls browser tabs, **not the outer app timeline**.
  browser_list_tabs currently returns none. These tools must not be presented as
  app-shell/iOS automation. A screenshot of a standalone HTML tab is not a
  screenshot of a plugin timeline card.
- Public create_workspace supports local adoption or Git worktrees. HEAD is
  unborn (`git rev-parse --verify HEAD` fails), so branch-off worktrees cannot be
  assumed. Local mode adopts an existing directory and does not create one.
- `.paseo-plugin/` is already gitignored. Proposed fixture directories can live
  there without commits or changing the source checkout. Whether local workspace
  creation preserves distinct nested directory roots must be checked after
  approval; if it canonicalizes to the existing root, stop and report rather
  than create hidden commits or claim new workspaces exist.
- Simply installing a second manifest ID is **not isolated**: MCP server name,
  adapter/socket/data root, marker prefix, client renderer identity and hooks are
  currently hardcoded/shared. All must be separated and tested before any canary
  install. In particular, v1's marker transformer must not consume canary rows.
- Global plugin registration is not per-workspace installation. A canary would
  load on the same daemon/client; its functionality must fail closed outside an
  explicit QA workspace allowlist. SDK panel registration itself may still be
  visible globally; any such UI footprint must be explicit, not called invisible.
- All nine child requests stored max, but actual Pi runtime reported high. No
  new child was started for this scout. Parent performed read-only inspection.
  The current inspect_provider response does not resolve the thinking mismatch.

## Blocking decisions / approval

1. **Approved:** separately named `html-render-v2-qa` canary on the existing daemon, restricted to explicitly adopted QA workspaces. User authorized permanently removing live v1; removal is verified, shared-browser remains running. On canary failure disable/remove only the canary; never reinstall v1. Do not start a second daemon. A fresh workspace alone does not isolate globally installed plugin code.
2. **Resolved by user:** after independently verified max→high normalization, user explicitly replied `use high`. All future workers use only `pi/ocx/opencode-go/deepseek-v4.1-flash`, requested thinking **high**, via Paseo create_agent. Parent independently checks actual runtime/model before accepting work. No other model or hidden fallback; never claim max-level execution.

Canary approval is recorded. User subsequently replied `use high` after normalization was independently verified. Continue with exact DeepSeek v4.1 Flash at requested/verified high; never claim actual max or use another model.

## Bootstrap state (verified)

- [x] Permanently removed v1 registration; retained artifacts; shared-browser running.
- [x] Created active goal and authoritative master sheet with stable PQ-001–PQ-135 IDs.
- [x] Created five visible native QA workspaces; independently confirmed IDs/cwds with list_workspaces. Local request was adopted with inherited worktree kind, not new Git worktrees.
- [x] Runtime setting authorized: user replied `use high` after parent verified max→high through persisted records and one public update attempt. Future workers request/verify high on exact DeepSeek; implementation may proceed.
- [ ] Canary identity/scope implementation is in progress under sole DeepSeek worker77b498b0; parent independently verified actual high. No canary installed or source changes accepted yet.

Actual hosted Paseo web-client access has also been established through the existing encrypted relay, without restarts/config patches. All five QA titles appear in its sidebar and baseline actual probe history opens. This unlocks later web UI checks, not plugin acceptance. Background screenshot returned `tab has not painted yet`; do not claim a PNG or outer Electron/native-device coverage.

Private bootstrap evidence: `~/.paseo/plugin-data/html-render-v2-qa/verification-20261020`. Local workspace manifest: `.paseo-plugin/qa-run.json` (ignored/private). See master PQ-127–PQ-135 for evidence and next gates.

## Five work packages (sequential source writes)

### 1. Isolated canary identity and preflight

Create one centralized, default-preserving identity contract plus a deterministic
local QA build derived from this plugin's own sources. Resolve exact supported
manifest/entry packaging against the installed host before choosing the build
format; no host/dependency patching or regex edits of third-party source.

Separate manifest/plugin ID, MCP server name, adapter/socket/token/data directory,
marker namespace and renderer contribution identity. Keep production contracts,
old markers and storage paths unchanged. Generate into `.paseo-plugin/qa-build/`.
QA artifacts/evidence must be private and separate from production data.

Only allow explicit QA workspace IDs whose canonical directories match approved
paths. Non-QA agent.create/session-open hooks must not inject/change MCP config.
Canary RPCs/diagnostic publishers must also enforce scope; no arbitrary caller
workspace assertion. The exact isolation layer is covered by tests before install.
Record build hash, daemon/server ID, plugin/source ID and actual connection target.

### 2. Fresh visible workspaces and reproducible fixtures

After approval, create existing local directories beneath
`.paseo-plugin/qa-workspaces/<run-id>/`, then adopt them with native Paseo
create_workspace(local). Save actual returned workspace ID/directory; assert
five distinct IDs and correct directory authority. Do not claim Git worktrees.

| Workspace | Fixture family | Core assertions |
| --- | --- | --- |
| 01-baseline | Static semantic HTML, small script counter, raster | Correct canary/build, one intended publication, read RPCs, original equality, real artifact permissions |
| 02-layout-theme | Short/tall/wide content, breakpoint table, dynamic collapse | Correct shrink/grow/cap, parent scrolling, no fullscreen, stable counter through actual theme changes |
| 03-native-report | Every block, long labels/tables, graph/list fallback, unavailable usage | Actual host rendering, readable compact layout, touch/focus, tabs/copy, no native iframe, no fabricated values |
| 04-failure-security | Blank/malformed HTML, missing image, invalid report, no browser/optional asset failure, ownership boundary | Visible diagnostic/fallback, bounded work, safe denial, no hang, no relaxed sandbox or real external exfiltration |
| 05-history-lifecycle | Actual nested MCP result, reopen history, repeated marker, resumed session, retained old artifact | Count cards in actual client; duplicate failure reproducer; persistence/authority after reconnect; no automatic destructive cleanup |

Keep fixture contents deterministic, versioned, nonsensitive and stable. Use a
bounded case manifest with expected results and a run ID. Do not echo raw report
markers into helper tool output/evidence-writing commands: this previously
created additional matching rows. Preserve the actual publish result for history
verification instead. Diagnose/fix cross-row duplication; do not weaken the test
to count only one selected row. Do not copy provider secrets into workspaces.

### 3. Diagnostics in the actual Paseo surface

Add a **QA-only** workspace panel with case list, exact current build/source,
connection target, result status and Copy diagnostics. Reuse the same report/frame
components and actual RPC/store/renderer code; do not substitute native-shim
components or fake useRpc and call that acceptance.

Collect a bounded, sanitized event buffer: run/workspace/agent/artifact IDs,
platform/compact mode, selected display mode, layout dimensions, iframe
ready/height/failure timings, asset metadata/errors, and card mount/unmount IDs.
Never collect HTML bodies, report text, clipboard contents, credentials/tokens,
full agent configs or arbitrary filesystem paths. Mount count is not visible-card
count; actual visibility still requires observation.

Use supported onLayout/ResizeObserver and lifecycle callbacks; no inspection of
Paseo's private app internals or iframe contents across the sandbox. Do not add a
fullscreen/portal mechanism. Capture the client platform and evidence class on
every result. A panel/gallery test is labeled separately from timeline rendering.

### 4. Real-client QA loop and evidence

For each failure: fixture → reproduce in actual surface → copy diagnostics plus
actual app screenshot/video → save minimal regression → focused tests → retry
that same fixture in a fresh case workspace → full release gates. Do not fix
several unrelated UI problems at once. UI fixes come from observed failures, not
increasing unit-test count.

Separate three check levels:

- Automated schemas/browser/component tests (existing149 plus new regressions).
- Real daemon/MCP/artifact/history checks, including actual source/build identity.
- **Actual Paseo desktop/web client** timeline and screens, then iOS/Android when
  available. None may inherit another level's pass. Browser-tab tooling is only
  used for tab-level checks. User screenshots/manual interactions or an available
  authorized native automation surface are needed for app-shell/device evidence.

Initial desktop acceptance budget:20–30minutes for the five families. Additional
mobile acceptance:about20minutes per available platform/device. Record unavailable
platforms as blocked, not passed. A second QA pass checks reopened history, not
only the fresh in-memory render. File-preview click-through must be actually used.

Agent-dependent cases run only after the thinking constraint is resolved. Every
child uses the exact required model/setting via Paseo create_agent and never
delegates. Parent owns identity/security changes and integration; source-writing
workers remain sequential because there is no committed worktree base. Do not
use another model for review; review:none.

### 5. Release gate and rollback

Before QA install: typecheck/full tests/bundles/package audit plus explicit production-vs-canary collision tests. Preserve plugin status and unchanged daemon PID. On collision/regression, disable/remove **only the canary** after preserving evidence. Retain artifacts and shared-browser configuration. V1 must remain unregistered permanently.

A green QA run requires actual-client acceptance for the tested platform, all
required deterministic/backend gates, no unexplained duplicate cards, correct
native fallback and file-preview evidence. Missing device checks remain open.
Promotion to production ID is a separate controlled step; canary namespace success
is not proof of production coexistence/migration. Re-check using real production
identity only after explicit promotion approval. No automatic production activation and no v1 restoration.

## Proposed changed paths / boundaries

- Identity/build: one shared identity module, existing marker/bridge/contribute/
  paths wiring, a QA build script. Preserve defaults and legacy tests.
- QA surface: new client QA panel/diagnostic helpers; small opt-in instrumentation
  hooks in existing components, not changes to host internals.
- Fixture runner: QA case manifest/fixtures and native workspace/evidence script;
  use public Paseo API/MCP tools, with model-gated actual tool-call checks.
- Tests: identity collision/allowlist/storage isolation, diagnostic bounds,
  real-mode behavior, observed bug regressions and reopened-history checks.
- Docs: matrix/verification/QA runbook and exact environment/platform evidence.

Implementation estimate:2–4hours if canary packaging/public APIs behave as expected;
actual-device acceptance depends on device availability and the model constraint.
Canary implementation, scoped installation and fresh QA workspace creation are authorized by the user's explicit approval, not merely by this document. Model runtime evidence and actual-client acceptance remain separate gates.

## Iteration and blocked stop condition

Choose the next failing reproducible case, not an unrelated feature. Recheck
focused regression, isolation and actual affected client before moving on. If
workspace creation aliases existing roots, identity isolation cannot be proven,
max thinking cannot be honored, actual client cannot be observed, or there is no
safe public API, stop that gate with evidence, attempted safe paths, exact blocker
and one next input. Do not compensate with mock-based green checks or edits to
Paseo/shared-browser/dependency sources.
