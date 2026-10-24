# T3 compatibility and intentional differences

Reference: T3 Code source inspected 2026-10-20. Primary files:
`packages/shared/src/htmlRender.ts`, `apps/server/src/htmlRender/HtmlRender.ts`,
`apps/web/src/components/chat/HtmlRenderFrame.tsx`,
`apps/web/src/components/files/BrowserDocumentFrame.tsx`,
`apps/mobile/src/features/threads/HtmlRenderWebView.tsx`.
Source inspection is not evidence that a Paseo client displayed the implementation.
See the [public verification notes](https://github.com/lued/paseo-html-render/blob/main/docs/verification.md)
for exact tests and remaining client gates.

## Tool contract

| Input | T3-shaped plugin contract |
| --- | --- |
| `html_preview.html` | 1–512,000 characters; original page byte budget also applies when publishing |
| `html_preview.width` | Integer 240–1600, default 728. Capture width only; the live frame is fluid and has no plugin-side max-width |
| `html_preview.appearance` | `light` or `dark`, default `dark` |
| `html_render.html`, `title`, `height` | Required HTML; title 1–200 characters; requested frame cap 80–2000 |
| Additive plugin fields | `summary` <=280 characters; `renderMode` static/auto/iframe (default auto); bounded `report` v1 JSON |

Preview result keeps PNG `{mimeType,data,width,height}`, `width`, `contentHeight`,
`capturedHeight`, and `consoleMessages`, plus bounded `suggestedHeight` (80–2000).
The plugin disables report scripts during capture, so console output is always
empty. Missing local images produce bounded path/reason diagnostics. Captures are
clipped to 4000px and further vertically clipped if needed to fit the 3 MiB PNG
budget; `capturedHeight` describes the actual pixels, not the full page.

Publish result uses `htmlRender.artifactId` instead of T3's `attachmentId`. It keeps
title, requested height and width; adds measured height/width tuples, summary,
render mode, report availability, absolute `interactivePath`, warnings and missing
image diagnostics. The adapter emits a small percent-encoded
`paseo-html-render:v1:` marker, not the HTML/report body.

The original inline-display message is retained, with a mandatory final-reply
link instruction added:

```md
[Open interactive report](</absolute/path/to/interactive.html>)
```

The file path is a compatibility adapter into Paseo's existing HTML file preview,
not a plugin route or guaranteed public navigation API. The card can copy the
link/path; copying is not represented as opening a file tab.

## Turn guard

`html_render` defaults to one card per counted agent turn. The comparison is an
exact fingerprint over the **prepared** HTML (after workspace raster inlining),
the publishing workspace, title, height, summary, `renderMode` and optional report.
It is deliberately not semantic: a changed comment, whitespace run or cosmetic
markup is a different input and can bypass the nudge. A bounded in-memory history
of 50 publishes per agent also refuses an identical card in later turns; a daemon
restart clears all of it. If agent attribution is missing, the plugin warns and
skips the guard. If the turn lifecycle is unknown, it warns and keeps duplicate-only
checking. The durable save commits the reservation before the `interactivePath`
lookup, so a late path failure can return an error after the card was stored and
the turn slot consumed. Do not describe this as permanent or semantic deduplication.

## Display parity

| Capability | Plugin implementation / difference |
| --- | --- |
| Live inline HTML | Web/desktop raw `srcDoc` iframe, unsupported by public SDK; no inline HTML on native |
| Theme | T3-like token names mapped to Paseo palette; initial theme plus live messages without reload. Exported file follows OS color preference |
| Height | T3-style nearest-width fitting and requested cap semantics; measurements at 390/728/1024 rather than T3's nine widths |
| Layout width | Live iframe is 100% of the host thread column (roughly 600–1100 CSS px); 728 is only the default capture width. No plugin-side max-width, and no expand/fullscreen surface |
| Fullscreen | Removed at user request. No expand button, viewport overlay, fullscreen zoom toolbar, or Escape-dismiss channel; iframe fullscreen permission explicitly denied |
| Native | Structured report views when `report` exists; otherwise static PNG. Full arbitrary HTML via assistant file link where client supports it |
| Static fallback | Light/dark PNGs, requested frame cap distinct from actual screenshot dimensions; missing/live-failed states remain readable |
| Graph | Pinned `pele@1.7.0` converts bounded generated Mermaid to light/dark SVG then inert PNG; native nodes/edges/decisions stay authoritative |
| Accounting | Usage quantities explicitly measured, estimated or unavailable; no inferred cost/model attribution |
| History | Marker-driven, bounded/cycle-safe nested codemode recognition; first valid reference per row, legacy v1 readable |
| Deletion | Workspace-owned artifacts retained by default, opt-in workspace archive cleanup; not T3's thread-owned deletion |

T3's theme variables include host concepts Paseo does not expose separately.
The plugin maps `--primary` to Paseo accent where no distinct primary exists;
font stacks and palette defaults are compatible concepts, not pixel-identical T3
colors. No host keyboard-shortcut replay is provided: Paseo has no suitable public
plugin command bridge for it.

## Report model

Optional `report` is strict, non-executable `ReportModelV1`: outcome, summary,
metrics, blocks, graph, evidence, next action, prompt lesson, usage. Supported
blocks: heading, text, bullets, steps, callout, code, table, agents, graph, evidence.
Strings/arrays/table shapes/references are bounded; serialized report <=256 KiB.
Graph limits: 200 nodes, 400 edges, 100 decisions. Evidence URLs are http(s) only
without credentials; evidence paths are inert workspace-relative references.
Usage values must include provenance; unavailable has no numeric value.

## Security differences (deliberately stricter than T3)

- Daemon screenshots/measurements always disable page JavaScript. T3 executes
  scripts for previews, so JS-only generated pages do **not** have static parity.
  Provide static markup or an accompanying structured report.
- Live pages use an opaque origin with `sandbox="allow-scripts"` only. No
  same-origin, forms, popups, downloads or top-navigation permission. CSP refuses
  network resources, file URLs, frames/objects/workers, forms and base URLs;
  eval and remote/blob resources are not enabled.
- **Self-navigation remains possible inside a web iframe.** A report can assign
  its own location or use meta refresh. Neither CSP nor trusted-click interception
  fully contains this. Do not claim that every possible navigation/network side
  effect is prevented. Native file-preview navigation is host-owned and remains
  a client verification gate.
- Local raster inlining is scoped to the caller's authority-derived workspace,
  resolves symlinks, verifies opened files, rejects non-regular files, and caps
  reads/references/page bytes. Per image 2 MiB; 256 local references; diagnostics
  <=50. T3 allows larger files and SVG image inlining; this plugin refuses local
  SVG files. Inline SVG markup remains supported inside sandboxed HTML.
- Interactive file <=8 MiB, PNG <=3 MiB, original HTML <=512,000 UTF-8 bytes.
  Pele has bounded graph inputs/output; its synchronous layout has no separate
  preemptive CPU timeout. Optional graph, light-preview and measure failures do
  not discard the primary artifact.
- Artifacts are private owner-only files, not encrypted or synchronized across
  hosts. Plugin RPC reads require agent-to-workspace ownership. The host's own
  file-preview permissions are separate from plugin RPC authorization.
- Bridge/tool calls have an absolute 60-second deadline, cancellation on socket
  disconnect, and cancellation checks before rendering and during artifact writes.
  The adapter has a longer transport ceiling; incomplete private writes are
  removed on failure. Synchronous bounded Pele layout cannot be preempted.
- Chromium must already be available. Missing browser fails explicitly; there
  is no browser download, fake preview, or `--no-sandbox` fallback.
