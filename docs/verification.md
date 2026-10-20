# Verification and release evidence

Date: 2026-10-20. Worktree: `/home/xander/git/paseo-html-render-worktrees/plugin-v2`.

**Installed plugin: `html-render` 2.0.0, running from `~/git/paseo-html-render`.**
`shared-browser`, `paseo-quiet-timeline` and `html-render` are registered. V1 stays
retired and must never be reinstalled as a rollback. The five-workspace canary and
its allowlist/build script were deleted on 2026-10-20 at user request.

Install on a machine (house pattern, same as quiet-timeline):

```sh
git clone https://code.lued.tech/lued/paseo-html-render ~/git/paseo-html-render
cd ~/git/paseo-html-render && npm ci --ignore-scripts
paseo plugin install ~/git/paseo-html-render
```

The authoritative row-by-row sheet is
[t3-parity-quality-matrix.md](t3-parity-quality-matrix.md); stable PQ ids are
mapped to gates there.

## One command

```sh
npm run verify:e2e      # real Chromium, real store, real stdio MCP, real client
```

It writes `report.json`, per-gate JSON and screenshots to
`~/.paseo/plugin-data/html-render/verification-<YYYYMMDD>/` (0700/0600). Exit code
0 means every gate passed. A gate can also report `blocked` or `unavailable`; those
are never counted as acceptance.

| Gate | Proof |
| --- | --- |
| G1 | `html_preview`/`html_render` through the real sandboxed Chromium and store; PNG magic, byte-exact original, CSP export, `0700`/`0600` modes, marker decode. |
| G2 | Real `ReportCard` + `HtmlFrame` mounted in real Chromium over G1's artifacts (plus `g2-mounted-card.png` and `g2-static-card.png` visual evidence): `sandbox="allow-scripts"`, `allow="fullscreen 'none'"`, CSP present, script executed, no chrome except the report entry, content-height shrink, spoofed height ignored, theme swap without reload, zero iframes on native, **no image fallback for an unreadable page**. |
| G3 | Real stdio MCP adapter over the real bridge socket: initialize, `tools/list`, both tool calls, marker round-trip, one-card rebuild after JSON serialization. |
| G4 | Outer `codemode` row is not transformed, so an artifact yields one card; records the item-scoped transformer residual. |
| G5 | `paseo plugin ls` shows `html-render` enabled and running (third-party plugins may also be installed) and no retired canary identity; daemon pid and server id recorded. |
| G6 | Headless Chromium pairs with the real daemon, opens a real agent timeline, asserts exactly one inline frame with CSP, clicks the assistant file link, asserts Paseo's HTML file preview frame, captures two PNGs. |

## Trigger policy

The plugin tells the model when to render from two surfaces it owns, so disabling the
plugin removes the guidance with it (no AGENTS.md, no skill, no host configuration):

- MCP `instructions`: structured answers (comparison, findings, status, steps, flow,
  architecture, numbers) become a visual card led by a diagram, chart, flow or
  interactive with only essential labels; the explanation stays in the reply. One
  fact, one sentence, code, file contents or config stay text.
- `html_render` description repeats the same rule and forbids styled essays.
- The injected MCP server config sets `alwaysLoad: true`, so the tools are
  first-class rather than hidden behind codemode search. That change moved the same
  prompt from 1/3 to 3/3 renders.

`npm run check:trigger` runs a fixed 10-prompt corpus (5 structured, 5 plain) and
counts real tool calls. Measured on DeepSeek high: 4/5 then 5/5 structured, 0/5 plain
after the policy; selection is biased, never guaranteed.

G6 creates one real agent per run and archives it afterwards. It requires outbound
network and a configured provider; otherwise it reports `unavailable`. If the model
never calls the tool (provider 5xx, overload), the gate also reports `unavailable`
instead of blaming the plugin; if the tool itself refuses, the gate fails with the
tool's message.

## Release gates (current run)

| Command | Result |
| --- | --- |
| `npm run verify:e2e` | **6/6 gates pass** (no blocked, no unavailable) |
| `npm run typecheck` | pass |
| `npm test` | **158/158 pass**, 0 skipped/fail/cancelled |
| `npm run check:trigger` | corpus probe: structured renders, plain prompts stay text (model-dependent, see below) |
| `npm run check:bundles` | pass; 14 client inputs, 21 server inputs, Pele server-only |
| `npm pack --dry-run --json` | pass; 31 files; tests, docs, private data excluded |
| `npm audit --omit=dev --json` | 0 runtime vulnerabilities |
| `paseo plugin ls` | `html-render` running from `~/git/paseo-html-render`, `shared-browser` running, `paseo-quiet-timeline` running |

The daemon restarted on its own at 15:35 UTC 2026-10-20 (host network outage:
relay timeouts, CLI unresponsive). G5 therefore records the current pid rather than
the pre-work pid; nothing in this work restarted or reconfigured the daemon.

## What is deliberately not verified

- **Native clients (PQ-025, PQ-027–PQ-032, PQ-125).** No iOS or Android device
  evidence exists on this host. Native never mounts an iframe (G2 asserts zero);
  the public SDK has no WebView surface. Do not read G6 as native acceptance.
- **Outer Electron app.** G6 drives the hosted web client in headless Chromium, not
  the desktop shell.
- **Arbitrary third-row marker duplication (PQ-019 residual).** A per-item
  timeline transformer cannot see sibling rows; only the render tool's own row is
  transformed, which removes the real Pi duplicate.
- **Full T3 test suite.** Only the inspected inline-HTML pipeline is compared.

## Security model (unchanged)

Opaque-origin iframe, `allow-scripts` only, CSP with `default-src 'none'`, no
`unsafe-eval`, no forms, no popups, no fullscreen, no network/file resources.
Artifacts are `0700`/`0600` under the private data root; reads are checked against
the requesting agent's workspace. A live iframe can still navigate itself; CSP and
click interception do not fully contain `location.assign` or meta refresh.

## History

- **2026-10-20 (bridge token):** The bridge token is now a durable 0600 file in
  the private data root and the MCP adapter re-reads it on every call. A plugin
  reload no longer invalidates tools in existing agents. Authority is also warmed
  at `agent.turn_started`, so a reload that lands mid-session recovers on the next
  turn. Running adapters still need one reconnect to load the new adapter source.
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
