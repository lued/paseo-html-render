# Showcase capture notes

These files are generated from the checked-in example sources. They are real
renders of those pages, not mockups. The pages are standalone demos; none of the
images below claims to be a Paseo application screenshot.

## Regenerate

From the repository root:

```sh
npm ci --ignore-scripts
node docs/images/showcase/capture.mjs
```

The script uses the repository's existing Chromium discovery (`PASEO_HTML_RENDER_CHROMIUM`,
the Playwright cache, the `shared-browser` runtime when present, a system Chromium, or an installed Chromium-family app). It
does not download a browser, add a dependency, or fetch remote media.

## Files

| File | Source | Capture |
| --- | --- | --- |
| `hero.png` | `examples/showcase/image-inspection.html` | Top 728×665 region, Chromium at 2x |
| `image-inspection.png` | same | Full page, Chromium at 2x |
| `render-pipeline.png` | `examples/showcase/render-pipeline.html` | Full page, Chromium at 2x |
| `incident-timeline.png` | `examples/showcase/incident-timeline.html` | Full page with scripts enabled, Chromium at 2x |
| `incident-timeline-static.png` | same | Full page with script execution disabled, matching the plugin's static capture path, 2x |
| `incident-timeline.gif` | same | Six steps, 700×527 at 1x, 1.1 s per frame, 255-colour global palette, one repeat |
| `examples/showcase/assets/settings-before.png` | `examples/showcase/assets/settings-before.html` | 720×420 at 2x |
| `examples/showcase/assets/settings-after.png` | `examples/showcase/assets/settings-after.html` | 720×420 at 2x |
| `examples/showcase/assets/detail-accent.png` | `examples/showcase/assets/settings-after.html` | 160×90 CSS px at 2x |
| `examples/showcase/assets/detail-sidebar.png` | `examples/showcase/assets/settings-after.html` | 160×90 CSS px at 2x |
| `examples/showcase/assets/detail-toggle.png` | `examples/showcase/assets/settings-after.html` | 160×90 CSS px at 2x |

The settings UI and the incident are explicitly labelled demo data inside the
pages. The incident times, service names and threshold are fictional.

## GIF

The GIF is recorded from the real interactive page: the capture script selects
each `step-1` … `step-6` radio label, waits for the CSS state, captures a
screenshot, and encodes the frames with the small GIF89a writer in `capture.mjs`.
It is not an external video or a hand-drawn animation. The image is not a live
iframe; the source page is the interactive artifact.

## Budget

Current total added showcase binary assets:

```sh
du -ch docs/images/showcase/*.png docs/images/showcase/*.gif examples/showcase/assets/*.png | tail -1
```

That is 1.3 MiB on disk, below the 2 MiB showcase budget. The older
`docs/images/card.png` is untouched and is not part of this gallery.

## Why there is no full Paseo chrome capture

Producing a full host capture for this showcase would require creating a live
agent and publishing a card; an existing verification screenshot contains
unrelated workspace names and session content. A fabricated host window would
misrepresent the product. The cards are
therefore captured as standalone pages and labelled that way; the host surfaces
(live frame, static/native fallback, reply link) are described from the checked-in
implementation and existing verification evidence instead of staged.
