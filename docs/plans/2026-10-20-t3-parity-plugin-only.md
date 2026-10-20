# T3 HTML render parity: plugin-only plan

Status: proposed; research complete, no implementation.
Date: 2026-10-20.
Constraint: no Paseo source edits, no fork. Everything ships in `paseo-html-render`.
Reference: T3 Code `apps/web/src/components/chat/HtmlRenderFrame.tsx`,
`apps/mobile/src/features/threads/HtmlRenderWebView.tsx`,
`apps/server/src/htmlRender/HtmlRender.ts`, and `docs/user/html-renders.md`.

## Bottom line

There is a plugin-only path to an interactive, T3-like report experience. It has two
layers:

1. **Native report UI** in the card and a plugin screen. Fully interactive on desktop,
   web, iOS and Android using public React Native/plugin primitives.
2. **Paseo's own HTML file preview** for arbitrary HTML. Paseo already renders `.html`
   files with scripts and styles in a sandboxed iframe on web and a WebView on mobile.
   A plugin-written absolute HTML path, emitted as an assistant file link, opens that
   preview in a workspace file tab.

The only thing that still needs upstream is **arbitrary HTML rendered inline in the
timeline on every platform**. Paseo's public plugin SDK exposes no WebView, no HTML
surface, and no plugin asset route. A web-only raw iframe may work on desktop, but it is
unsupported, is unavailable on mobile, and is not needed for the two-layer plan.

## What T3 actually provides

From the public T3 source:

- `html_preview`: renders HTML with a headless Chrome, returns PNG, width,
  content height, captured height, console messages, and missing-image paths.
- `html_render`: publishes a self-contained HTML page as a thread-owned attachment;
  returns an attachment reference, title, requested height, and optional measured
  heights.
- The inline frame uses a signed asset URL; scripts and inline styles run; the frame
  has an **opaque origin** (`sandbox="allow-scripts allow-forms"`), so it cannot reach
  the app session.
- The page receives T3 theme CSS variables, can follow live theme changes through
  `postMessage`, reports content height, opens links/images only after user activation,
  and has full-screen and zoom controls.
- Local images referenced by absolute path are inlined into the published page with
  size and page-byte limits.
- Mobile uses `react-native-webview`, loads the same signed page, restricts navigation,
  and reports overflow.
- Deleting the thread deletes its page attachments. Preview browsers are daemon-owned;
  pages publish even when no preview browser is installed.

## What Paseo provides to plugins

Verified from the installed 0.12.0 SDK and current public source:

- Client plugin modules: React, React Native, TanStack Query, Zod, and
  `@getpaseo/plugin/*`. No `WebView`, no `react-native-svg`, no DOM library, and no
  arbitrary third-party host module.
- `navigation.openBrowser` exists only on Electron and requires an absolute HTTP(S)
  URL. `localhost` means the desktop client, not a remote daemon.
- `openExternalUrl` opens HTTP(S) URLs; it is not a file-panel opener.
- Server code can use Node APIs and installed dependencies; plugins can run their own
  local HTTP server, but there is no plugin HTTP route on the daemon.
- Paseo's first-class plugin UI can be interactive: screens, workspace/agent panels,
  timeline renderers, modals, pressables, lists, tables built from views, settings,
  and RPC to daemon-side report data.

## The missing piece Paseo already has

Paseo's own file panel supports HTML previews:

- Web renders the document in an iframe with `sandbox="allow-scripts"` and a
  prepended CSP.
- Native iOS/Android renders it in `react-native-webview`, with JavaScript enabled,
  storage/cache disabled, and navigation restricted to the initial document.
- Inline scripts and styles work; fetch/XHR/WebSocket/beacon, remote scripts/fonts/
  images, forms, frames and objects are refused. A page can still navigate itself in
  the web iframe; Paseo documents that residual risk. Native narrows it by refusing
  navigation outside the initial document.
- Absolute file paths are accepted by the file-preview resolver. Assistant Markdown
  file links open a workspace file tab.

That gives a plugin-only full-HTML route:

1. Save the report as an HTML file under the plugin's private artifact directory.
2. Add a CSP and inline any allowed images, producing `interactive.html`.
3. Return its absolute path in the tool result and instruct the agent to put a Markdown
   file link in its final reply.
4. The reader clicks the link; Paseo opens the file tab and runs the page in its existing
   sandbox.

This is not inline in the chat and is not a plugin API guarantee; it is built-in Paseo
behavior triggered by a file link. Treat it as a compatibility adapter with a live test
gate, not as a private API dependency.

## Feature parity matrix

| Capability | T3 Code | Current plugin | Plugin-only target |
|---|---|---|---|
| `html_preview` | Headless PNG + height | Yes | Keep; add multi-width heights |
| `html_render` | Saved HTML + reference | Yes, artifact + marker | Keep; add optional report model |
| Inline rendering | Live HTML iframe | Static PNG card | Native interactive report; optional static HTML fallback |
| Scripts inline | Yes | No | No in native card; yes in Paseo file preview |
| Arbitrary HTML inline | Yes, all platforms | No | No; file tab only. Upstream needed for true inline |
| Theme | Live CSS variables | Fixed screenshot | Native theme live; light/dark previews; HTML uses `prefers-color-scheme` |
| Local images | Inlined server-side | Blocked | Inline scoped workspace images into HTML; native image blocks |
| Remote assets | Page-controlled | Blocked | Blocked by default; file preview CSP blocks |
| Links | User-activation gated | Text only | Native `ExternalLink`; HTML file preview links are restricted |
| Full screen / zoom | Native frame controls | Static screen | Native report screen; preview image zoom optional |
| Mobile | WebView | Static image | Native report; full HTML via Paseo file preview |
| History reload | Thread attachment | Marker scan | Keep; support nested `codemode`, duplicates, missing artifacts |
| Deletion | Thread-owned | Artifact persists | Clean on workspace archive; retention policy |
| Security | Opaque origin, CSP, proxy | Strong static isolation | Native has no HTML execution; file preview uses Paseo CSP/WebView |
| Accessibility | Web content | PNG + text | Native headings, text, labels; HTML original available |

## Target architecture

```text
MCP tools (html_preview / html_render)
  -> private artifact store
     manifest.json
     original.html
     preview-dark.png / preview-light.png
     report.json (optional, native report model)
     interactive.html (CSP + inlined images)
     graph-dark.png / graph-light.png (optional)
  -> marker in persisted tool result
  -> timeline transformer (any tool_call, including nested codemode)
  -> native report card
       -> native report screen (tabs, evidence, run graph, original HTML)
       -> assistant file link -> Paseo HTML file preview (full HTML/scripts)
```

### Report contract

Preserve T3-shaped inputs. Add one optional field rather than replacing HTML:

```ts
html_render({
  html: string,
  title: string,
  height: 80..2000,
  summary?: string,
  report?: ReportModelV1,
})
```

`ReportModelV1` is bounded JSON, not executable:

```ts
type ReportModelV1 = {
  version: 1;
  outcome: { status: "success" | "partial" | "blocked" | "failed"; headline: string; detail?: string };
  summary?: string;
  metrics?: { label: string; value: string; detail?: string; tone?: "neutral" | "good" | "warn" | "bad" }[];
  blocks: ReportBlock[];
  graph?: { nodes: GraphNode[]; edges: GraphEdge[]; decisions?: DecisionNode[] };
  evidence?: { label: string; url?: string; artifactPath?: string }[];
  nextAction?: string;
  promptLesson?: { improvedPrompt: string; lesson: string };
  usage?: UsageSummary;
};

type ReportBlock =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "callout"; tone?: "info" | "warn" | "good" | "bad"; title?: string; text: string }
  | { kind: "code"; language?: string; text: string }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "agents"; agents: AgentRow[] }
  | { kind: "graph"; graphId: string }
  | { kind: "evidence"; items: EvidenceRow[] };
```

Keep report rendering additive: no `report` means the current static card; a report
means the native card. HTML remains the portable/export format.

### Native UI components

- Card: outcome status, title, summary, at most three key metrics/findings, graph
  thumbnail, next action, `Open report` and `Open interactive HTML` affordances.
- Screen: Overview, Evidence, Run, Original tabs; expandable sections; horizontal
  table scrolling; copy buttons; external links; no HTML execution.
- Blocks: heading, text, bullets/steps, callout, code, table, agent rows, evidence,
  graph image plus accessible node/edge list.
- Theme: use `theme.colors`, `layout.compact`, accessible labels, no hardcoded colors.
- Graph: Pele renders SVG server-side; Chromium rasterizes light/dark PNGs; native
  node list remains the accessible source. Optional node selection overlay in phase 2.

### Delivery of full HTML

- `interactive.html` is generated with Paseo-compatible CSP and data-URI images.
- Tool result contains `interactivePath`.
- The agent final reply includes `[Open interactive report](</absolute/path>)`.
- The card shows the path/copy action and explains that the full HTML opens in a file
  tab; it must not claim arbitrary HTML is inline.
- For orchestrate reports, update the orchestrate skill template to include the link.

## Phases

### Phase 0: live compatibility gates

1. Write a test HTML file with an inline script and a `data:` image to the plugin
   artifact directory.
2. Emit an assistant Markdown file link for its absolute path. Click it on desktop/web
   and mobile; confirm the file panel opens, scripts run, network is blocked, and
   navigation is restricted.
3. Confirm a report card survives a thread reload from a real nested `codemode` result.
4. Optional: test a disposable web-only raw iframe plugin on desktop. Do not make it a
   dependency; if it fails or has residual navigation risk, abandon it.

### Phase 1: native report model

- Add schema/validation, report persistence, marker fields, tool description.
- Add native card/screen blocks and responsive theme behavior.
- Preserve static previews and original HTML.
- Tests: valid/invalid report JSON, size bounds, no HTML/script execution in native UI,
  missing report fallback.

### Phase 2: graph and parity polish

- Add pinned Pele server dependency and graph rasterization; light/dark previews.
- Add metrics, agent/usage rows, evidence links, table/code/callout blocks.
- Add scoped local image inlining for HTML; keep remote assets blocked.
- Add multi-width height measurement and preserve requested height.
- Tests: graph layout/render, image limits, theme snapshots, compact widths.

### Phase 3: full HTML file delivery

- Generate CSP-protected `interactive.html`.
- Add `interactivePath` to tool result and final-reply contract.
- Verify desktop/web/iOS/Android file preview and script behavior.
- Add fallback to current static card if the file preview is unavailable.

### Phase 4: optional experiments, fail closed

- **Web-only raw iframe:** try an unsupported iframe in the plugin screen; require
  sandbox, CSP, no parent access, no network, and a desktop/web-only label. Do not ship
  unless the security gate passes.
- **Browser panel:** evaluate a plugin-local HTTP preview + `navigation.openBrowser`.
  It is Electron-only, not inline, and `localhost` belongs to the client; document
  reachability limits. Not required for the main plan.
- **Shared Browser:** optional integration only; do not couple to its private runtime.

### Phase 5: hardening and release

- Retention/cleanup on workspace archive; artifact ownership checks.
- Package payload audit, zero unnecessary dependencies, install/reload evidence.
- Documentation: limitations, security model, supported clients, rollback.
- Acceptance checks below.


## Acceptance checks

1. **T3 contract:** tool schemas/results pass compatibility tests; height, title,
   width, appearance, bounds and preview PNG match.
2. **Native UX:** card and screen work on wide/compact and light/dark; no HTML or
   scripts execute in native views; missing reports fall back safely.
3. **Nested history:** real `codemode`-wrapped MCP result reconstructs one card after
   reload; duplicates produce one card; unrelated rows unchanged.
4. **Full HTML:** the absolute file link opens Paseo's HTML preview on desktop/web and
   mobile; inline script runs; remote requests, forms, and navigation are blocked;
   artifact permissions are owner-only.
5. **Security:** hostile HTML cannot reach the Paseo app, filesystem, network, or
   another workspace from the plugin card. File-preview residual risk is documented.
6. **Accounting:** report graph/usage marks measured, estimated, and unavailable values;
   no invented cost or model attribution.
7. **Plugin-only:** no Paseo source change, fork, daemon restart, or live-plugin coupling.

## Decisions to confirm

1. **Report model:** optional `report` on `html_render` (recommended) versus a separate
   `html_report` tool.
2. **Full HTML:** file-panel link (recommended) versus browser panel or a web-only
   iframe experiment.
3. **Graph:** server-side Pele PNG plus native list (recommended) versus native-only
   layout.
4. **Retention:** delete artifacts on workspace archive or keep until manual cleanup.
