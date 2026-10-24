# HTML Render

**Turn an answer into something you can see.**

Ask Paseo for a comparison, a flow, a screenshot review or a set of numbers. Instead of a wall of Markdown, the agent can publish a self-contained visual card above its reply.

![The image-inspection demo: a before/after settings screenshot with numbered differences and a detail crop.](docs/images/showcase/hero.png)

<sub>A real capture of the [image-inspection demo](examples/showcase/image-inspection.html). The capture is a standalone demo page, not a mocked Paseo window; on web/desktop the same page runs as a live card in the timeline.</sub>

New agents get two tools: `html_preview` checks the page as a PNG, and `html_render` publishes the card and keeps a link to the full interactive HTML file.

## Try asking

- “Compare these two screenshots of the settings screen. Show me what changed and let me inspect each difference.”
- “Show me how a visual gets from my request into the timeline, including what my phone sees.”
- “Replay this deploy failure as a timeline I can step through, and show what happened at each point.”

[See the gallery](docs/showcase.md) for all three prompts, their actual captures, and copyable source pages.

## How it works

1. **Ask naturally.** A comparison, an explanation, a review of an image you already have, or a chart of tool output.
2. **The agent composes one self-contained page** and can check it with `html_preview`. That preview is a PNG with page scripts disabled, so clipping and contrast show up before publishing.
3. **`html_render` publishes it above the reply.** On web and desktop it is a live sandboxed frame; phones get a static PNG or a structured native report. The reply keeps an `Open interactive report` link to the full HTML file.

Cards are a choice, not a default: one per turn, when a picture carries the answer; otherwise the agent replies in text. Artifacts are owner-only files on the daemon host, and every read is checked against the requesting agent's workspace.

Live pages can use local controls, CSS transitions and inline SVG. Screenshots and native reports never execute page JavaScript. Remote scripts, styles, fonts and images are blocked; workspace raster images are inlined up to 2 MiB each. Local SVG files are refused, while inline SVG works. More detail: [compatibility and limits](docs/compatibility.md) and the [interaction guide](docs/interactivity.md).

## Install (from checkout)

The npm package is **not published yet**. The checkout below is the current install path.

```sh
git clone https://github.com/lued/paseo-html-render.git
cd paseo-html-render
npm ci --ignore-scripts
paseo plugin install .
paseo plugin reload html-render
```

Requires Paseo 0.12.x (the package peer range is `>=0.12.0 <0.13.0`), Node 22.18 or newer on the daemon host, and a sandbox-capable Chromium. Chromium is discovered from `PASEO_HTML_RENDER_CHROMIUM`, a Playwright cache, an installed `shared-browser` runtime, system Chromium, or an installed Chromium-family app. No browser is downloaded or installed.

## Limits

- The live web/desktop frame cannot control Paseo agents, workspaces or files. Its controls are local; it can ask the host to open an `http(s)` link or a data-URI image.
- A live page can still navigate itself; CSP and click interception do not fully contain `location.assign` or a meta refresh.
- Agents created before install do not get the tools; start a new agent. After an upgrade, a running adapter may report itself stale, so reconnect the agent.

## Develop

```sh
npm ci --ignore-scripts
npm run typecheck && npm test
npm run verify:e2e
```

MIT. Display rules, exact security boundaries and verification evidence are in [OVERVIEW.md](OVERVIEW.md), [docs/verification.md](docs/verification.md) and [docs/release.md](docs/release.md).
