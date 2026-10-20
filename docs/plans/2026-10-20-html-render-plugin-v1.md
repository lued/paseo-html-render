# HTML Render: quick Paseo plugin pilot

Status: approved and implemented as a static-first pilot; see docs/verification.md. Live installation not performed.
Date: 2026-10-20 (`date +%F`).
review: none (no cross-lab review requested)

## Outcome

Build a standalone Paseo plugin, using T3 Code's observed HTML tools as the behavior
specification: agents can preview HTML, publish a durable report, and see an inline
report card in chat. Clearly disclose static-preview versus interactive-HTML
limitations. This is not a Paseo fork and not a dotfiles feature.

User authorized creating the new plugin/workspace/worktree. No existing sessions,
installed plugins, application source, or fleet baseline will be modified to develop
it. No child agents are authorized; the current parent does the work directly.

## Workspace

- Repository: `/home/xander/git/paseo-html-render`
- New Git worktree: `/home/xander/git/paseo-html-render-worktrees/plugin-v1`
- Branch: `plugin-v1` (unborn; no bootstrap commit needed)
- Paseo workspace: `wks_6110baf7d7986722`, title `HTML Render plugin`
- Paseo project: `prj_ec7e7045f0f53417`
- Paseo adopted the existing orphan worktree and reports isolation/kind `worktree`.
- No commits, remote creation, publishing, or pushes without further authorization.

## Decisions

1. Match the tool contract, not an unsupported UI promise.
   Target `html_preview` (HTML, width, light/dark appearance -> screenshot) and
   `html_render` (HTML, title, height -> saved artifact reference and inline preview).
   Verify the exact observed T3 schemas before freezing our v1 API. Keep a written
   compatibility table identifying matched behavior and intentional differences.
   Reference observed behavior; do not copy T3 implementation or app-owned skills.

2. Use public Paseo extension points.
   An MCP adapter supplies tools for supporting providers. Plugin creation hooks
   inject it into newly created agents without modifying provider permissions.
   Bind tool authority to the calling agent/workspace; never accept a caller-chosen
   agent ID as authority. No session restart or MCP config write for existing agents.
   A timeline transformer recognizes this plugin's completed tool outputs and draws
   a report card. Use durable tool-result/artifact references, not only appended
   plugin rows, which are lost on daemon restart. Keep unrelated messages untouched.

3. Static-first cross-platform UI for v1.
   Render HTML/CSS/SVG to images on the daemon and show a readable preview card with
   an expanded native image viewer. Preserve original HTML privately as the report.
   Do not present a screenshot as an interactive dashboard. Inspect any documented
   web-only rendering capability during the spike, but do not depend on DOM hacks
   or import Paseo-private components. No new report HTTP server in this pilot.
   An explicit file/export action can provide the original HTML; do not claim it
   opens inside a remote/mobile browser without verifying that route.

4. Keep reports inert and private.
   Generated HTML is untrusted. Use an isolated browser context: scripts disabled
   for report content, network requests blocked, file access denied, no downloads,
   no application credentials/profile, no privileged bridge. Restrict report size,
   screenshot dimensions/output, timeouts and concurrent renders. Validate paths,
   references and URLs; store artifacts owner-only with atomic writes. Use a fresh
   owned browser, never a user's Shared Browser session. No `--no-sandbox` workaround.
   Test hostile navigation, SVG resources, CSS URLs, iframe nesting, scripts, file
   probes and missing/cross-workspace artifact references. If isolation cannot be
   demonstrated, fail closed rather than render unsafely.

5. Small native package, no app modifications.
   Scaffold for the verified Paseo SDK line and retain its directory/runtime rules.
   Exact npm versions and lockfile; Node through existing NVM. Latest versions
   observed during planning: @getpaseo/plugin 0.12.0, MCP SDK 1.32.1,
   playwright-core 1.64.1. Verify compatibility before selecting pins.
   Chromium acquisition/ownership must be explicit and isolated; no dependency on
   private Shared Browser runtime paths and no automatic global installation.
   Unit/contract tests must work without a browser; real renderer tests must name
   the actual browser used. Build/package the artifact for a pilot, not a fleet
   deployment. A later live installation needs an explicit target and permission.

## Scope boundary and limitations to prove

- Interactive inline HTML on desktop/web/iOS/Android is not promised by the current
  public plugin SDK. Its client module list lacks a general HTML/WebView surface.
  Paseo's built-in Mermaid iframe/WebView components are internal, not reusable
  plugin API. Supported cross-platform parity needs a host SDK/API addition.
  A maintained fork could carry that change; upstream acceptance is required only
  if we want it shipped by upstream Paseo rather than maintain a fork.
- V1 does not execute report JavaScript. Pele can generate SVG before publication;
  bundling graph/report authoring into this renderer plugin is out of scope.
- Native-style theme variables can be supported for previews; screenshot theme
  changes require rerendering, unlike a live themed HTML document.
- New-agent MCP injection depends on provider support. Existing sessions are not
  retrofitted. Pi needs its MCP support enabled; absence must be reported, not fixed
  by silently changing the user's global Pi configuration.
- Tool-output rendering/history reconstruction must be verified for the actual
  supported provider output shapes. Unsupported shapes retain the native tool row
  and artifact reference instead of breaking the chat.
- The plugin renders supplied content; it does not invent orchestration lineage,
  cost totals, or model telemetry. The orchestrator owns the report's factual data.
- Report images are less accessible than HTML. Retain the title, text summary when
  supplied, original HTML export, and status/error as ordinary accessible controls.
- Browser availability, desktop/mobile verification, and app-version compatibility
  remain explicit gates. A mocked screenshot or successful typecheck is not proof
  that an installed Paseo client displayed a report.

## Tasks (serial, current parent; no delegated model rows)

1. Capability/contract spike: inspect current SDK types and T3 tool schemas; write
   the compatibility table and verify the public timeline transformer/RPC contract.
2. Build the private artifact store, bounded inert HTML previewer, and MCP tools.
   Add unit/security tests before wiring UI. Start no persistent service.
3. Build the native inline card and expanded static viewer, with clear error,
   pending, missing-artifact and unsupported-provider behavior. Add lifecycle-safe
   MCP injection and cleanup; no auto-approvals.
4. Test typecheck/unit/contracts, then actual browser rendering, dark/light and
   375px/wide previews. Package and inspect the npm payload; ensure it excludes
   credentials, report artifacts, profiles, caches, screenshots of private data,
   and unrelated repository files.
5. Record exact commands/results, demonstrated limitations, installation needs and
   unresolved gates. Stop before live installation/publishing or modifying dotfiles.

## Acceptance

1. A synthetic HTML/CSS/embedded-SVG example previews and publishes through the
   T3-shaped tools; original HTML survives reload in the artifact store.
2. The inline card can be reconstructed from a persisted tool result; unrelated
   timeline items are unchanged; missing artifacts have an actionable fallback.
3. Public client imports compile for supported targets; narrow/wide and light/dark
   screenshots remain readable. Actual client behavior is labeled verified or not
   verified; no claims of interactive parity from a static image.
4. Security tests prove blocked network/file/script access, bounded malformed/large
   input, timeout recovery, workspace ownership and traversal protection. Failures
   do not leak credentials, arbitrary paths or report text into logs.
5. Exact dependency lock, passing automated tests, inspected package payload and
   documented feature matrix. No changes to installed apps, existing sessions,
   network listeners, global config, source branches, or fleet baseline.

## Evidence

- https://paseo.sh/docs/plugins/reference.md: MCP injection via agent.create,
  public client modules/cross-platform rules, timeline transforms/renderers.
- https://github.com/getpaseo/paseo/tree/main/packages/app/src/components/markdown/fence/mermaid:
  built-in web iframe/native WebView implementation, not a public HTML plugin API.
- Installed T3 0.1.1-nightly.20261019.3373 embedded HTML handlers/render service:
  html_preview returns screenshot data; html_render saves an attachment and directs
  the assistant not to repeat the rendered page in its reply.
- https://paseo.cafe/api/plugins: existing diagram and Shared Browser plugins are
  not a T3-style arbitrary HTML publisher.

## Approval and blocked stop

Recommended approval: a static-first, no-report-JavaScript plugin pilot with
T3-shaped preview/publish tools. Estimated 4–8 hours for an initial tested pilot,
not a promise of live desktop/mobile qualification in this session.

If the public SDK cannot support the timeline/artifact path, browser isolation
cannot be demonstrated, or a dependency requires unsafe host changes, stop that
step. Report the failing evidence, attempted approach, precise limitation and
minimum decision needed. Do not respond by patching Paseo or installing a plugin
into the user's live daemon without permission.

## Progress checklist

- [x] Capability/contract spike: T3 schemas read from the installed 0.1.1-nightly binary; public
      Paseo 0.12.0 SDK types inspected; no native WebView module exists. Compatibility table in
      `docs/compatibility.md`.
- [x] Private artifact store, bounded inert renderer, and MCP tools; security tests written and
      passing (`tests/artifacts.test.ts`, `tests/renderer.test.ts`, `tests/bridge.test.ts`).
- [x] Native inline card, expanded static viewer, original-HTML text view, lifecycle-safe MCP
      injection and cleanup (`tests/contribute.test.ts`).
- [x] Typecheck, 24 automated tests, real Chromium rendering (scripts, network, file access
      blocked), package payload inspected, client/server entries bundle with esbuild.
- [x] Evidence, limitations, and installation steps recorded in `docs/verification.md`.
- [x] Live directory installation; plugin reaches `running`; a new child agent receives the MCP
      server and publishes a report artifact through the daemon bridge.
- [ ] Real client card display and provider-persisted tool output after history reload: not
      observed from this agent context; remaining user check recorded in `docs/verification.md`.
