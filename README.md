# HTML Render for Paseo

Ask your Paseo agent a question with structure — a comparison, a set of
findings, a status, a flow, a handful of numbers — and get a visual card in the
timeline instead of a wall of Markdown. The card is a self-contained HTML page:
a diagram, chart, flow, timeline, or small interactive. On web and desktop it
runs live in a sandboxed frame; on a phone it becomes a static picture or a
structured native report.

The plugin adds two MCP tools to every agent created after it is installed:

- **`html_preview`** renders a page to a PNG with scripts disabled and returns
  its content height. Use it to check spacing, overflow, and readability.
- **`html_render`** publishes the finished page as a durable timeline card. The
  original HTML is stored byte-for-byte, a static preview is captured, and the
  agent is told to put an `[Open interactive report](<path>)` link in its reply
  so the page is also reachable through Paseo's HTML file preview.

The model is told when to use them: structured answers get a card, single facts,
prose, code, file contents and config stay text. Disabling the plugin removes
both the tools and that guidance.

## Requirements

| Requirement | Why |
| --- | --- |
| **Paseo 0.12.0 or newer** on the daemon and client | The public plugin SDK, timeline renderers, RPC, and `alwaysLoad` MCP injection used here. |
| **Node.js 22.18 or newer** on the daemon host | The generated MCP adapter and the development commands use native TypeScript stripping and modern Node APIs. |
| **A sandbox-capable Chromium** | `html_preview` and the static PNG need a real browser. The plugin never downloads one and never passes `--no-sandbox`. |
| **A writable Paseo home** | Artifacts live under `$PASEO_HOME/plugin-data/html-render` (default `~/.paseo`). |

Chromium is found from a system install, or from the Chromium bundled with the
`shared-browser` plugin. To point at a specific binary:

```sh
export PASEO_HTML_RENDER_CHROMIUM=/absolute/path/to/chrome
```

If no sandbox-capable Chromium exists, preview and publish fail explicitly; the
plugin does not fall back to an unsafe browser launch.

## Install

From a checkout (this is the supported path for 2.1.0; nothing is published to
npm yet):

```sh
git clone https://github.com/lued/paseo-html-render.git
cd paseo-html-render
npm ci --ignore-scripts
paseo plugin install .
paseo plugin reload html-render
paseo plugin ls
```

`paseo plugin ls` should show `html-render` enabled and running. Installing the
same plugin id replaces an older install; reload it once so a running daemon
picks up the new server bundle.

Agents that already exist keep their injected MCP configuration until they are
recreated. The bridge token is durable, so a reload does not invalidate tools in
an existing agent; an adapter process that is already running reports itself as
stale and asks for one reconnect when its source changes. New agents get the
current tools and policy immediately.

## Use

Just ask for the answer you want. For example:

> Compare our two deploy options, with the trade-offs and a recommendation.

The agent calls `html_preview` while designing, then `html_render` when the page
is ready. The card appears above the final reply. The reply should contain only
the explanation, plus:

```md
[Open interactive report](</absolute/path/to/interactive.html>)
```

The link opens the same page through Paseo's built-in HTML file preview where
the client supports it. The card itself is borderless on web and desktop and
fills the thread column, so pages should be fluid rather than fixed at 728px.

Theme-aware pages can use the hosted CSS variables: `--background`,
`--foreground`, `--card`, `--border`, `--accent`, `--primary`,
`--muted-foreground`, `--chart-1` through `--chart-6`, `--radius`, `--font-sans`
and `--font-mono`. Live theme changes update the frame without reloading the
page, so counters and other page state survive.

## Display and privacy

| Client / input | What you see |
| --- | --- |
| Web/desktop, default `auto` | Live, sandboxed HTML; theme updates and content-height fitting |
| Web/desktop, `static` | Native report if one was supplied, otherwise the PNG |
| iOS/Android, report supplied | Native report views; HTML is never executed |
| iOS/Android, no report | Static PNG |
| Assistant file link | Paseo's HTML file preview, subject to client support |

Artifacts are private: directories are `0700`, files are `0600`, and every read
is checked against the requesting agent's workspace. Network resources, forms,
local `file://` URLs, frames, objects and workers are blocked by CSP. Inline
scripts run only in the live frame or file preview; screenshots and native report
blocks never execute HTML. The live iframe uses `sandbox="allow-scripts"` with an
opaque origin and never `allow-same-origin`.

A web iframe can still navigate itself. CSP and click interception do not fully
contain `location.assign` or a meta refresh; do not treat arbitrary live HTML as
incapable of all network navigation.

Workspace-local PNG, JPEG, GIF, WebP and AVIF images are inlined up to 2 MiB
each and 256 references per page. Local SVG files are refused; inline SVG markup
works. Remote assets are never fetched. Artifacts are retained by default.
Set `PASEO_HTML_RENDER_PURGE_ON_ARCHIVE=1` only if you want an archived
workspace's artifacts deleted.

## Troubleshooting

**"Chromium is required" / preview fails.** Install a sandbox-capable Chromium,
or set `PASEO_HTML_RENDER_CHROMIUM` to its executable. Check that the binary can
run headless as the daemon user.

**The card is missing after a history reload.** The plugin rebuilds cards from
the persisted tool result. It accepts the normal marker, a truncated marker, or
a surviving `artifacts/<id>/interactive.html` path. A durable `card.json` beside
the artifact supplies the authoritative title, dimensions and display mode even
if the provider dropped both references.

**An agent still uses old tools after a reload.** The adapter tells the model
when it is stale. Reconnect or recreate that agent; no daemon restart is needed
for new agents.

**A local image is missing from the card.** The original HTML keeps it; the
prepared page removes only the unresolvable reference and the tool result lists
the bounded diagnostic. Check that the file is inside the agent's workspace and
is one of the supported raster formats.

See [docs/verification.md](docs/verification.md) for current gate results and
[docs/compatibility.md](docs/compatibility.md) for intentional differences from
T3's inline renderer.

## Development

```sh
npm ci --ignore-scripts
npm test                 # unit and integration tests
npm run typecheck
npm run check:bundles    # client/server boundary and Pele isolation
npm run verify:e2e       # G1-G6 with real Chromium, store, MCP adapter and client
npm run check:trigger    # fixed prompt corpus; model-dependent, not a gate
npm pack --dry-run --json
```

No runtime dependency is added for the card or catalog logic. `pele@1.7.0` is
the only runtime dependency; it is pinned and bundled server-side for graph
thumbnails.

## License

MIT. See [LICENSE](LICENSE).
