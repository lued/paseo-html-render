# HTML Render for Paseo

T3-shaped `html_preview` and `html_render`, implemented entirely in this plugin.
No Paseo fork, daemon HTTP route, or shared-browser dependency.

## Choose a display

| Client / input | Display |
| --- | --- |
| Final reply carrying the artifact link | The report card is published **on the assistant reply** (card, then the reply text through Paseo's Markdown component), so `chat display > collapse turns` cannot hide it. The tool-row copy is suppressed. |
| Web/desktop, `renderMode: "auto"` (default) or `"iframe"` | Borderless inline HTML with theme updates and content-height fitting; no fullscreen. If the artifact also carries a report, one muted "View report" link opens the report screen. |
| iOS/Android, optional `report` supplied | Accessible native report views, findings, graph lists, evidence and usage |
| Explicit `"static"` | Native report views when supplied; otherwise PNG, with no live HTML |
| Native without a report, or legacy marker without a report | Static PNG fallback |
| Assistant's absolute HTML file link | Paseo's built-in HTML file preview, subject to client support |

The web/desktop raw iframe is **unsupported by the public plugin SDK**. Native
views never execute HTML. A compact web viewport is not native-client evidence.
The repository verification run uses real Chromium, the real MCP adapter and the
hosted client; results and remaining gaps are in the
[public verification notes](https://github.com/lued/paseo-html-render/blob/main/docs/verification.md).

## Layout width

The live frame is fluid: it fills the host's thread column (roughly 600-1100 CSS
pixels on web/desktop) and carries no plugin-side `max-width`. The `728` default on
`html_preview.width` is only the Chromium capture width; `html_render` has no width
input, and that capture is displayed at card width on static surfaces. The MCP
guidance therefore tells authors to fill the width with responsive, reflowing
visuals rather than design only for 728, and to check both ends with `html_preview`
at about 390 and 1000-1200.

## Tools

1. `html_preview({ html, width?, appearance? })` returns a static PNG and measured
   height plus a bounded `suggestedHeight` (80–2000). Scripts are disabled; provide meaningful static markup even for live
   pages that enhance themselves with JavaScript.
2. `html_render({ html, title, height, summary?, renderMode?, report? })` stores the
   page and publishes a durable timeline reference. Optional `report` is bounded
   `ReportModelV1` JSON, not executable content.
3. Include the exact link returned by `html_render` in the final assistant reply:
   `[Open interactive report](</absolute/path/to/interactive.html>)`.

Use CSS variables such as `--background`, `--foreground`, `--card`, `--border`,
`--accent`, `--primary`, `--muted-foreground`, `--chart-1` through `--chart-6`,
`--radius`, `--font-sans` and `--font-mono`. Live theme updates preserve page state.
Keep the outer page fluid, transparent and without duplicate card/title chrome.

## Turn guard

The daemon refuses a second publish in the same counted turn by default (limit 1;
`PASEO_HTML_RENDER_MAX_CARDS_PER_TURN=0` disables it). It compares exact prepared
HTML bytes plus the publishing workspace, title, height, summary, `renderMode`
and report; comments, whitespace and cosmetic changes are different inputs, not
semantic duplicates. A bounded in-memory history (50 publishes per agent) also
refuses an identical card across turns; a daemon restart clears that history.
When agent attribution is missing, the guard warns and skips; when the turn
lifecycle is unknown, it warns and keeps duplicate-only checking. The durable
save commits the turn slot before the interactive path lookup, so a late path
error can return `store_failed` after the card was stored and the slot consumed.

## Privacy and limits

Artifacts live under `$PASEO_HOME/plugin-data/html-render/artifacts/<id>/`
(default `~/.paseo/...`), with directories `0700` and files `0600`. Plugin reads
check the requesting agent's workspace. A read is allowed for the recorded owner
id or for any active workspace whose canonical root matches the publisher's root,
so a sibling workspace created later on the same directory cannot invalidate an
existing card. Original HTML is preserved byte-for-byte.
The interactive copy contains CSP and inlined workspace-local raster images.

The render tool writes the persisted marker first in its result text, and a marker
cut short by a provider output cap or by an agent slicing the result is repaired
from its artifact id; the artifact read supplies the authoritative title and
dimensions. Unknown or oversized markers stay rejected.

Network resources, forms, local file URLs, frames, objects and workers are blocked.
Inline scripts execute only in live/file-preview HTML, never screenshots or native
report blocks. The live iframe has `sandbox="allow-scripts"`, never same-origin.
**A web iframe can still navigate itself.** CSP and click interception do not fully
contain `location.assign` or meta refresh. Do not treat arbitrary live HTML as
incapable of all network navigation.

Local PNG/JPEG/GIF/WebP/AVIF images: at most 2 MiB each, 256 local references per
page. Symlink escapes and non-regular files are refused; SVG files are not inlined
(inline SVG markup is supported). A local image that cannot be resolved is removed
from the prepared page with a bounded warning — the original HTML keeps it. There is
no image fallback for a failed live render: the frame stays, and only an artifact
that cannot be read shows one line of text. Prepared page <8 MiB; interactive file <=8 MiB;
original HTML <=512,000 characters and <=512,000 UTF-8 bytes; report <=256 KiB;
each PNG <=3 MiB. Noisy/large captures are clipped vertically to fit; original HTML
is preserved. Remote assets are not fetched. Missing images are diagnostics, not
permission to broaden access. Calls have a 60-second absolute deadline and cancel
unfinished work on disconnect.

Artifacts are retained by default. Set `PASEO_HTML_RENDER_PURGE_ON_ARCHIVE=1`
only if deleting a workspace's reports on archive is desired. No background
age-based deletion is performed. Pele is pinned inside this plugin; graph lists
remain usable if graph thumbnails cannot be generated.

## Development and installation

```sh
npm ci --ignore-scripts
npm run verify:e2e     # real Chromium, mounted card, MCP, install, hosted client
npm run check:trigger  # fixed corpus: structured renders, plain stays text
npm run typecheck
npm test
npm run check:bundles
npm run check:package
npm run smoke:package -- --tarball /tmp/paseo-html-render-3.0.0.tgz
```

A sandbox-capable Chromium must already be installed, or set
`PASEO_HTML_RENDER_CHROMIUM` to its executable. No browser is downloaded and
`--no-sandbox` is never used. Missing Chromium fails preview/publish explicitly.
Every interactive agent session receives the MCP server, plus the rendering policy
in the MCP handshake: render a card when the answer has structure, answer in text
for single facts, prose, code, file contents or config. What the model actually sees is client- and
configuration-dependent: some harnesses expose MCP tools behind codemode, and a
client or shared server description can override or truncate the 244-character
summary. Do not infer universal exposure from one harness. 
Paseo 0.14 runs the plugin's `agent.session_open` hook on create, resume, refresh
and import, and the server it returns (`html-render-v3`) is launch-only: it is
never written into a saved agent record. Installing, reloading or disabling the
plugin therefore reaches an idle agent on its next prompt, and a busy agent at
its next idle prompt. History opens and agents labelled
`html-render/disabled: "true"` get no server. One sanitized `session-open` line
per open in the plugin log records what happened, without the token, launch
environment or workspace path.

Agents created by 2.x keep a saved `html-render` entry that the plugin cannot see
or remove. 3.0 uses a different key so that entry cannot collide, and overwrites
the old adapter file (`mcp-adapter-v1.mjs`) with an inert tombstone that lists no
tools and never contacts the bridge. Recreate such an agent to drop the entry.

The bridge token is a 0600 file (`bridge-v3.token`) under the private data root,
and the adapter re-reads it on every call, so a plugin reload does not strand an
adapter that is already running.

See [`docs/compatibility.md`](docs/compatibility.md) for intentional T3 differences,
bounded guard semantics, and the [public verification notes](https://github.com/lued/paseo-html-render/blob/main/docs/verification.md)
for live results and rollback.
