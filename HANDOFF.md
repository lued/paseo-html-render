> **Historical (2026-10-20 canary era).** The five-workspace QA method and
> DeepSeek-only rule below are retired by user request. Current state and the
> autonomous harness are in `docs/verification.md`. Kept for history only.
>
> **2.1.0 status (2026-10-21): all four open workstreams landed.** P1 path-based
> artifact recovery is in `shared/recognize.ts` with the persisted `b49e8050`
> regression. P2 client re-projection is `client/artifact-catalog.ts` plus the
> re-registering transformer in `index.client.tsx`. P3 durable card persistence
> is the validated `card.json` stored by `server/artifacts.ts` and served from
> the artifact RPC, including `renderMode`. P4 adapter freshness is the
> versioned, hashed, atomically written adapter plus the stale-adapter warning.
> The mounted-frame cold-start flake now waits on a real readiness probe. No
> remainder is scoped here; see `CHANGELOG.md` and `docs/verification.md`.

# Handoff: complete T3 HTML Render parity in plugin-v2

You are the orchestrator. This workspace is the clean continuation of the working
`plugin-v1` experiment. Implement the full plugin-only T3 parity plan here; do not
edit Paseo source and do not fork Paseo.

## Required orchestration model

- Orchestrator: this GPT-6.1 Sol agent.
- Every subagent: `pi/ocx/opencode-go/deepseek-v4.1-flash` with thinking `max`.
- No other model, no cross-lab reviewer, no model fallback.
- Dispatch subagents with Paseo `create_agent`; give each a bounded task and a
  disjoint file set. Children do not delegate.
- Read `docs/plans/2026-10-20-t3-parity-plugin-only.md` completely before planning.
- Read this file before touching code.

## Current state

- Repository: `/home/xander/git/paseo-html-render` (new Git worktree
  `plugin-v2` at `/home/xander/git/paseo-html-render-worktrees/plugin-v2`).
- The plugin source was copied from `plugin-v1`; `node_modules` was copied too.
- `npm run typecheck` passes. `npm test` passes 30/30.
- The running live plugin is still installed from `plugin-v1` as `html-render`.
  `plugin-v2` is not installed yet. Do not assume installing it is harmless:
  installing the same plugin ID replaces the live plugin. Test locally, then
  install only when ready and preserve rollback evidence.
- Paseo daemon: 0.12.0. Existing plugin `shared-browser` must not be touched.
- Current plugin UI: inline report card. The old "Open report" button was removed
  at the user's request. `ReportScreen` remains registered but has no card entry
  point; either repurpose it or remove it deliberately.
- T3 reference checkout: `/home/xander/git/t3code` (sparse clone). Useful paths:
  - `apps/web/src/components/chat/HtmlRenderFrame.tsx`
  - `apps/web/src/components/files/BrowserDocumentFrame.tsx`
  - `apps/mobile/src/features/threads/HtmlRenderWebView.tsx`
  - `apps/server/src/htmlRender/HtmlRender.ts`
  - `packages/shared/src/htmlRender.ts`
  - `docs/user/html-renders.md`

## What was proven in plugin-v1

- T3-shaped tools: `html_preview` and `html_render`.
- Private artifact store under `~/.paseo/plugin-data/html-render/artifacts/`.
- Sandboxed Chromium rendering with scripts, network, and `file://` blocked.
- MCP injection into newly created agents.
- Marker-based history reconstruction, including Pi's nested `codemode` result
  shape; unrelated rows stay untouched.
- **The important breakthrough:** on Paseo web/desktop, a raw `<iframe>` created
  with `React.createElement("iframe", ...)` inside the plugin card renders inline
  and runs JavaScript. The user confirmed this visually: the test card showed the
  inline page and a working Increment button.
- The raw iframe uses `srcDoc`, `sandbox="allow-scripts"`, an opaque origin, and a
  strict CSP. Native iOS/Android fall back to the static PNG card.
- The plugin now injects Paseo theme CSS variables into the iframe, injects a
  ResizeObserver/height reporter, and auto-fits the iframe height to content.
- `renderMode` is in the marker: `static`, `auto` (default), or `iframe`.
  `auto` chooses live HTML on web/desktop and static PNG on native.
- The current card still has outer native card chrome (title/summary/border).
  T3's real inline frame has no outer card chrome; consider matching T3 by making
  live iframe mode borderless while keeping the static native card.

## Paseo constraints confirmed

- Public plugin client modules do not export a WebView, HTML surface, DOM library,
  or plugin HTTP route.
- `navigation.openBrowser` is Electron-only and HTTP(S)-only; `localhost` means the
  desktop client, not a remote daemon.
- Paseo has a built-in HTML **file** preview:
  - web: sandboxed iframe with `allow-scripts` and a prepended CSP;
  - native: `react-native-webview`, scripts enabled, storage/cache disabled,
    navigation restricted;
  - absolute file paths can be opened through assistant Markdown file links.
  This is the likely plugin-only route for full HTML on native and a fallback for
  arbitrary HTML. It is not inline and is not a public plugin API guarantee.
- Raw iframe is unsupported but works on web/desktop. It is not available on
  native. Do not claim otherwise.

## Remaining work

### 1. Make live HTML production-quality

- Move the iframe/theme/height code into a reusable client component.
- Match T3's frame behavior where possible:
  - theme variables: background, foreground, muted, border, card, accent,
    primary, radius, fonts;
  - content-height measurement and frame fitting;
  - full-screen expanded viewer on web/desktop;
  - static PNG fallback when live HTML is unavailable;
  - optional link/image handling with user activation.
- Decide whether live mode should be borderless like T3. Recommended: yes on
  web/desktop, keep native card chrome.
- Add a safe fallback for a blank/failed iframe: static preview and original HTML
  path, without a giant dead card.
- Add multi-width measured heights (T3 `heights` array) if practical.
- Inline scoped local images into HTML at publish time, with size/page bounds;
  keep remote assets blocked.
- Keep the CSP and sandbox strict. Document the residual self-navigation risk.

### 2. Build the native interactive report model

The earlier plan (`docs/plans/...`) specifies optional `report` JSON on
`html_render`, native blocks, graph, evidence, agents/usage, and prompt lesson.
Implement it as an additive fallback to live HTML:

- `report` absent: static PNG for native, live HTML on web/auto.
- `report` present: native report card/screen; no HTML execution in native views.
- Native report screen: overview, findings, graph, evidence, run/usage, original
  HTML; responsive, theme-aware, accessible.
- Graph: Pele server-side SVG -> PNG light/dark; native node/edge list. Pele must
  be pinned and installed inside the plugin, not via dotfiles.
- Preserve T3 tool compatibility and current marker/history behavior.

### 3. Full HTML file-preview delivery

- Generate `interactive.html` with CSP and data-URI images.
- Expose its absolute path (tool result plus final-reply Markdown contract).
- Verify the file link opens Paseo's HTML preview on web/desktop and mobile, runs
  scripts, blocks network/forms/navigation as documented, and has no plugin
  coupling.
- Add a fallback if the file preview is unavailable. Do not use an HTTP server
  unless explicitly approved.

### 4. Tests and acceptance

Required before calling this complete:

- Typecheck and all existing tests stay green.
- Add tests for `renderMode` marker round-trip, auto/static/iframe selection,
  height message handling, theme CSS, CSP, failed iframe fallback, report schema,
  graph generation, and artifact retention.
- Verify live card in desktop/web and compact/mobile:
  - live HTML scripts work on web/desktop;
  - native shows static/native fallback;
  - theme follows Paseo;
  - auto-height has no large gap;
  - no duplicate title/card chrome if matching T3;
  - history reload reconstructs exactly one card;
  - no network/file access from report HTML.
- Exercise the Paseo file-preview route for full HTML on a mobile client if
  available; otherwise record it explicitly unverified.
- Keep Paseo source, shared-browser, and unrelated plugins untouched.

## Known limitations and traps

- Raw iframe is web/desktop only and unsupported. It works, but do not present it
  as a public cross-platform API.
- The iframe CSP allows inline scripts; report HTML is untrusted. Keep the opaque
  origin and never add `allow-same-origin`.
- The iframe can still navigate itself; document this residual risk. Do not add
  forms/popups unless the security model is rechecked.
- Native clients cannot run live HTML inline; use the static card, native report,
  or Paseo file preview.
- The current `docs/verification.md` predates the iframe/theme/auto-height work;
  update it rather than trusting its claims.
- The current plugin test agents created duplicate cards; that was repeated manual
  testing, not a transformer bug.
- Do not reuse the `plugin-v1` worktree as the implementation target. Leave it as
  the known-good reference.
- No commits/pushes/package publication without explicit permission. No host or
  fleet changes.

## Definition of done

A plugin-only implementation in `plugin-v2` that gives:

1. T3-compatible `html_preview`/`html_render`.
2. Live inline HTML on Paseo web/desktop with theme, auto-height, sandbox, and
   fallback.
3. Native interactive report/native fallback, with full HTML accessible through
   Paseo's file preview.
4. Durable history, private artifacts, security tests, and documented limitations.
5. No Paseo source edits and no unrelated plugin changes.
