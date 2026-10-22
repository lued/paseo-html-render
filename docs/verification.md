# Verification and release evidence

Date: 2026-10-21. Release: `html-render` **2.1.0**. Worktree used for the
release: `~/.paseo/worktrees/3dyefwmb/paseo-html-render-release`;
the installed checkout is `~/git/paseo-html-render`. The old
`plugin-v2` worktree path in earlier revisions of this file is retired and does
not exist.

`paseo-quiet-timeline` and `html-render` are the registered plugins. The
`shared-browser` plugin was removed from every host on 2026-10-22 at the user's
request; this plugin never depended on it and nothing here requires it. V1 stays
retired and must never be reinstalled as a rollback. The
five-workspace canary and its allowlist/build script were deleted on 2026-10-20
at user request; `npm run verify:e2e` replaces it.

## Install on a machine

```sh
git clone https://github.com/lued/paseo-html-render.git
cd paseo-html-render
npm ci --ignore-scripts
paseo plugin install .
paseo plugin reload html-render
paseo plugin ls
```

A sandbox-capable Chromium must already exist, or set
`PASEO_HTML_RENDER_CHROMIUM` to its executable. No browser is downloaded and
`--no-sandbox` is never used.

## One command

```sh
npm run verify:e2e      # real Chromium, real store, real stdio MCP, real client
```

It writes `report.json`, per-gate JSON and screenshots to
`~/.paseo/plugin-data/html-render/verification-<YYYYMMDD>/` (0700/0600). Exit
code 0 means every gate passed. A gate can also report `blocked` or
`unavailable`; those are never counted as acceptance.

| Gate | Proof |
| --- | --- |
| G1 | `html_preview`/`html_render` through the real sandboxed Chromium and store; PNG magic, byte-exact original, CSP export, durable `card.json`, `0700`/`0600` modes, marker decode. |
| G2 | Real `ReportCard` + `HtmlFrame` mounted in real Chromium over G1's artifacts (plus `g2-mounted-card.png` and `g2-static-card.png` visual evidence): `sandbox="allow-scripts"`, `allow="fullscreen 'none'"`, CSP present, script executed, no chrome except the report entry, readiness probe set only after the handshake, content-height shrink, spoofed height ignored, theme swap without reload, zero iframes on native, **no image fallback for an unreadable page**. |
| G3 | Real stdio MCP adapter over the real bridge socket: initialize, `tools/list`, both tool calls, marker round-trip, one-card rebuild after JSON serialization, durable card read. |
| G4 | Outer `codemode` row is not transformed, so an artifact yields one card; records the item-scoped transformer residual. |
| G5 | `paseo plugin ls` shows `html-render` enabled and running (third-party plugins may also be installed) and no retired canary identity; daemon pid and server id recorded. |
| G6 | Headless Chromium pairs with the real daemon, opens a real agent timeline, asserts exactly one inline frame with CSP, clicks the assistant file link, asserts Paseo's HTML file preview frame, captures two PNGs. |

## Release gates (2.1.0 run)

| Command | Result |
| --- | --- |
| `npm run verify:e2e` | **6/6 gates pass** (no blocked, no unavailable) |
| `npm run typecheck` | pass |
| `npm test` | **178/178 pass**, 0 skipped/fail/cancelled |
| `npm run check:trigger` | corpus probe: structured renders, plain prompts stay text (model-dependent, see below) |
| `npm run check:bundles` | pass; 15 client inputs, 21 server inputs, Pele server-only |
| `npm pack --dry-run --json` | pass; 35 files, 99,537 bytes packed; tests, docs, private data excluded |
| `npm audit --omit=dev --json` | 0 runtime vulnerabilities |
| `paseo plugin ls` | `html-render` running from `~/git/paseo-html-render`, `paseo-quiet-timeline` running |

The daemon was not restarted during the release. The installed plugin was
reloaded with `paseo plugin reload html-render`; see the release transcript for
the exact output.

## After 2.1.0: no `shared-browser` dependency

The 2.1.0 tables above were recorded with the `shared-browser` plugin installed.
Its removal exposed that Chromium discovery had no macOS app-bundle candidate, so
a Mac with no Playwright cache and no plugin runtime had no browser at all. Since
this change, discovery is: `PASEO_HTML_RENDER_CHROMIUM`, the Playwright cache, the
`shared-browser` runtime if present, system paths, then `/Applications` and
`~/Applications` Chromium-family bundles (Chrome, Chromium, Helium, Brave, Edge,
Vivaldi). The G5 gate asserts a launchable Chromium instead of a second plugin
being registered, so no host has to keep another plugin for this one to work.

## Durability evidence added in 2.1.0

The 2.0.0 card depended on one encoded marker in provider output. Real rows
showed three ways that can fail, now covered by tests:

- **Marker cut before the payload (P1).** A bounded
  `artifacts/<32 lowercase hex>/` scan in `shared/recognize.ts` recovers the
  artifact id from the human-readable tool text. The regression fixture is the
  persisted `b49e8050` row. Recovery never reads the model's HTML argument, never
  applies to unrelated tool rows, and a valid marker always wins.
- **Order-dependent duplicate suppression (P2).** `client/artifact-catalog.ts`
  keeps the best reference per artifact and a stable canonical call id. A marker
  replaces a path-only card; a complete render row with no reference asks for one
  bounded re-projection. Re-registering the transformer is Paseo's public way to
  replay a timeline in order.
- **Marker loss changes display mode (P3).** Every new artifact stores a
  validated `card.json` with the exact client projection, including
  `renderMode`. The artifact read returns it; legacy stores fall back to the
  manifest. A corrupt or mismatched sidecar never makes the artifact unreadable.
- **Stale adapter source after reload (P4).** The adapter carries a version,
  sends it on every bridge call, and the bridge hashes the source it wrote.
  An old adapter is served but its tool text tells the model to reconnect; the
  source file is replaced atomically so a concurrently spawning agent cannot see
  a partial script.

The mounted-frame cold-start flake was a fixed-sleep race, not a product bug.
`HtmlFrame` now publishes `data-paseo-html-frame-ready` only after the document
handshake, and the test polls it with a bounded retry and reposts the theme probe
until the new token actually lands. The test passed five consecutive cold runs.

## Trigger policy

The plugin tells the model when to render from two surfaces it owns, so disabling
the plugin removes the guidance with it (no AGENTS.md, no skill, no host
configuration):

- MCP `instructions`: structured answers (comparison, findings, status, steps,
  flow, architecture, numbers) become a visual card led by a diagram, chart,
  flow or interactive with only essential labels; the explanation stays in the
  reply. One fact, one sentence, code, file contents or config stay text.
- `html_render` description repeats the same rule and forbids styled essays.
- The injected MCP server config sets `alwaysLoad: true`, so the tools are
  first-class rather than hidden behind codemode search.

`npm run check:trigger` runs a fixed 10-prompt corpus (5 structured, 5 plain) and
counts real tool calls. Measured on DeepSeek high: 4/5 then 5/5 structured, 0/5
plain after the policy; selection is biased, never guaranteed.

G6 creates one real agent per run and archives it afterwards. It requires outbound
network and a configured provider; otherwise it reports `unavailable`. If the
model never calls the tool (provider 5xx, overload), the gate also reports
`unavailable` instead of blaming the plugin; if the tool itself refuses, the gate
fails with the tool's message.

## What is deliberately not verified

- **Native clients (PQ-025, PQ-027–PQ-032, PQ-125).** No iOS or Android device
  evidence exists on this host. Native never mounts an iframe (G2 asserts zero);
  the public SDK has no WebView surface. Do not read G6 as native acceptance.
- **Outer Electron app.** G6 drives the hosted web client in headless Chromium,
  not the desktop shell.
- **Arbitrary third-row marker duplication (PQ-019 residual).** A per-item
  timeline transformer cannot see sibling rows. The client catalog now chooses a
  stable canonical row and re-projects on change, but a marker duplicated in a
  third tool row that is not this plugin's render row is still outside the
  transformer contract.
- **Full T3 test suite.** Only the inspected inline-HTML pipeline is compared.
- **Packaged npm install.** 2.1.0 is installed from a checkout; no npm publish
  has happened.

## Security model

Opaque-origin iframe, `allow-scripts` only, CSP with `default-src 'none'`, no
`unsafe-eval`, no forms, no popups, no fullscreen, no network/file resources.
Artifacts are `0700`/`0600` under the private data root; reads are checked against
the requesting agent's workspace. A live iframe can still navigate itself; CSP
and click interception do not fully contain `location.assign` or meta refresh.

## History

- **2026-10-21 (2.1.0):** Path recovery, client re-projection, durable
  `card.json`, adapter freshness, readiness probe, release metadata, README,
  MIT license, changelog, paseo.cafe entry, refreshed verification docs. Full
  gate: 178/178 tests, 15/21 bundles, 6/6 e2e gates.
- **2026-10-20 (bridge token):** The bridge token is a durable 0600 file in
  the private data root and the MCP adapter re-reads it on every call. A plugin
  reload no longer invalidates tools in existing agents. Authority is also warmed
  at `agent.turn_started`, so a reload that lands mid-session recovers on the next
  turn.
- **2026-10-20:** QA canary methodology removed; five QA projects/workspaces
  deleted (dirs backed up to `verification-20261020/qa-workspaces-20261020-qa01.tar.gz`);
  QA identity/allowlist/`build-qa` deleted. `html-render` 2.0.0 installed and
  reloaded. Duplicate-card bug reproduced in the hosted client and fixed. Two
  workspaces sharing one directory no longer fail closed. Autonomous harness
  added and passing.
- **Earlier 2026-10-20:** v1 permanently unregistered (artifacts retained);
  fullscreen/zoom removed at user request; live iframe, theme, auto-height,
  static fallback, native report model, graph rasterization and private artifact
  store implemented and unit-tested.
