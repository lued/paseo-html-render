# HTML Render

**Turn an answer into something you can see.**

Ask Paseo for a comparison, a flow, a screenshot review or a set of numbers. Instead of a wall of Markdown, the agent can publish a self-contained visual card above its reply.

![The image-inspection demo: a before/after settings screenshot with numbered differences and a detail crop.](docs/images/showcase/hero.png)

<sub>A real capture of the [image-inspection demo](examples/showcase/image-inspection.html). The capture is a standalone demo page, not a mocked Paseo window; on web/desktop the same page runs as a live card in the timeline.</sub>

Each interactive agent session gets two MCP tools: `html_preview` checks the page as a PNG, and `html_render` publishes the card with a link to the full interactive HTML file.

## Try asking

- “Compare these two screenshots of the settings screen. Show me what changed and let me inspect each difference.”
- “Show me how a visual gets from my request into the timeline, including what my phone sees.”
- “Replay this deploy failure as a timeline I can step through, and show what happened at each point.”

[See the gallery](docs/showcase.md) for all three prompts, their actual captures, and copyable source pages.

## Install

**3.0.0 is an unreleased candidate**, not a published npm release. To test it, install the checkout:

```sh
git clone https://github.com/lued/paseo-html-render.git
cd paseo-html-render
npm ci --ignore-scripts
paseo plugin install .
paseo plugin ls
```

Existing agents pick up the tools on their next prompt (Pi with default MCP settings: restart the daemon once, see [compatibility](docs/compatibility.md)). Requires a Paseo daemon `>=0.14.0-beta.1 <0.15.0` (tested with 0.14.0-beta.1 and 0.14.0-beta.2) and Paseo app 0.13.2 or newer, Node 22.18 or newer on the daemon host, and a sandbox-capable Chromium, found via `PASEO_HTML_RENDER_CHROMIUM`, a Playwright cache, `shared-browser`, or an installed Chromium-family browser. No browser is downloaded or installed.

## What it does

1. **Ask naturally.** A comparison, an explanation, a review of an image you already have, or a chart of tool output.
2. **The agent composes one self-contained page** and can check it with `html_preview`. That preview is a PNG with page scripts disabled, so clipping and contrast show up before publishing.
3. **`html_render` publishes it above the reply.** Web and desktop use a live sandboxed frame. Android attempts contained inline HTML, but durable native readiness is still under verification; iOS and unavailable Android hosts keep the PNG or native report. The reply keeps an `Open interactive report` link to the full HTML file.

Cards are a choice, not a default: one per turn when attribution is available, otherwise the agent replies in text. Artifacts are owner-only files on the daemon host, and every plugin read is checked against the requesting agent's workspace.

Live pages can use local controls, CSS transitions and inline SVG. Screenshots and native reports never execute page JavaScript. Remote scripts, styles, fonts and images are blocked; workspace raster images are inlined up to 2 MiB each. Local SVG files are refused, while inline SVG works. More detail: [compatibility and limits](docs/compatibility.md) and the [interaction guide](docs/interactivity.md).

## Limits

- The live frame cannot control Paseo agents, workspaces or files; its controls are local, except opening `http(s)` links and data-URI images.
- A live page can still navigate itself; CSP and click interception do not fully contain `location.assign` or a meta refresh.
- The turn guard compares exact prepared inputs and is not a permanent duplicate database: cosmetic changes count as new, a daemon restart clears state, and missing attribution or unknown turn lifecycle degrades with a warning. A late file-path failure after a durable save can return an error while still using the turn slot.
- A 2.x agent keeps an inert saved `html-render` entry; its tools arrive as `html-render-v3`. Recreate the agent to drop the old entry.
- Paseo 0.14 folds finished turns by default, hiding the card until you expand the turn; the report link in the reply stays visible.
- Label an agent `html-render/disabled=true` to opt it out.

## Develop

```sh
npm ci --ignore-scripts
npm run typecheck && npm test
npm run verify:e2e
```

MIT. Display rules, exact security boundaries and verification evidence are in [OVERVIEW.md](OVERVIEW.md), [docs/release.md](docs/release.md), and [the public verification notes](https://github.com/lued/paseo-html-render/blob/main/docs/verification.md). Feedback is welcome in the [issue tracker](https://github.com/lued/paseo-html-render/issues); see [CONTRIBUTING.md](CONTRIBUTING.md) and report vulnerabilities through [SECURITY.md](SECURITY.md).
