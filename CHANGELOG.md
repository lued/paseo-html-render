# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — 3.0.0 candidate

Not published to npm or tagged as 3.0.0. Requires Paseo `>=0.14.0-beta.1 <0.15.0`.
It also contains the never-published 2.2.0 candidate changes listed further down.

### Breaking

- The daemon must be Paseo `>=0.14.0-beta.1 <0.15.0`; 0.12 and 0.13 daemons get
  no tools. The manifest range is `>=0.13.2 <0.15.0` because Paseo checks the
  same range against the app, and mobile apps are still on 0.13.2 (the client
  SDK is byte-identical between 0.13.2 and 0.14.0-beta.1). On an older daemon
  the session-open hook passes the request through and logs
  `skip=host-unsupported`. The SDK is pinned to `@getpaseo/plugin` 0.14.0-beta.1
  and the peer range is `>=0.14.0-beta.1 <0.15.0`.
- The MCP server is contributed at `agent.session_open`, not written into an
  agent's saved configuration at `agent.create`. The `agent.create` hook is gone.
  The contribution is launch-only, so it reaches new, resumed, refreshed and
  imported interactive sessions, and a plugin install, reload or disable reaches
  an idle agent on its next prompt. No new agent is needed after an upgrade.
- The MCP server key is now `html-render-v3`. A 2.x agent still carries a saved
  `html-render` entry that the plugin cannot see or remove; reusing that name
  would make Paseo 0.14 reject every open of that agent with a collision. The two
  keys coexist instead. Recreate an old agent, or remove its saved entry, to drop
  the legacy entry.
- Transport files are versioned: `mcp-adapter-v3.mjs`, `bridge-v3.sock` and
  `bridge-v3.token`. The retired `mcp-adapter-v1.mjs` is overwritten with an
  inert tombstone: it completes `initialize`, lists no tools, answers tool calls
  with a migration message, and never opens the bridge socket.

### Added

- Per-agent opt-out: an agent labelled `html-render/disabled: "true"` gets no
  server. History opens never get one.
- One sanitized `session-open` log line per open (result, server, transport,
  alwaysLoad, agent id, provider, reason, purpose). It never contains the bridge
  token, the launch environment or a workspace path. Package smoke and the e2e
  fixture use it as injection evidence instead of the saved agent record.
- Android transport v2: every page-to-native chunk goes out on three carriers:
  the RNCWebView `onMessage` bridge (`messagingEnabled: true` on the trusted
  shell only), the fragment URL and a prefixed document title set before that
  navigation. All feed one ordered, deduplicating assembler with the same size
  and session checks. An unacknowledged chunk is resent once on all carriers,
  then the transfer fails. This is the `diag-2` candidate, not device acceptance.
  The first 3.0 device run timed out with `onMessage 0, fragment 0, probes 1`.
  Cause, from the `react-native-webview` 13.16.1 source: on Android, bridge
  messages go to the library's own JS router, keyed by a `messagingModuleName`
  that only its `<WebView>` wrapper knows, so a raw RNCWebView mount never
  receives them. The earlier build trusted the bridge and sent the fragment copy
  only after a 5 s ack timeout, which left 3 s of the 8 s ready deadline.
- Device re-testing after `bd8ec1e` still produced zero bridge and fragment
  traffic. The `diag-1` build adds a timeout-only strip inside the trusted shell,
  independent of native replies: scheme/lengths, iframe/message/ready counts,
  actual probe receipt, send attempts and error counts, with no URLs, sessions
  or payloads. Both the strip and native banner identify the build. This is a
  diagnostic change, **not a verified device fix**. The native 8 s deadline,
  sandbox and transport are unchanged. A genuine ready ack hides the strip.
- The physical `diag-1` screenshot proves inner ready, actual probe receipt and
  local hash updates succeed while the app receives zero bridge/fragment chunks.
  Chromium's `MaybeGetOverriddenURL` reports the original loadDataWithBaseURL
  source even after same-document navigation, losing the updated fragment.
  `diag-2` reads the chunk from `nativeEvent.title` independently of the URL.
  Titles are bounded before assignment at 4,000 characters (below Chromium's
  4,096 limit); chunk data is 3,000 characters. Full message/image budgets and
  all deadlines are unchanged. Large unrelated load URLs no longer trigger a
  false oversized-transport error. Tests cover title-only ready/interaction,
  multi-chunk images, duplicate carriers, rejected titles and real-shell order.
- Android diagnostics name the failed stage (`no page messages`, `chunks without
  ready`, `probe unanswered`, `titles without bridge or fragment`) with numeric
  counters only. `diag-2` adds title send/receive counts, native event/hash counts
  and title lengths; no diagnostic echoes title contents or payloads.

### Changed

- A control-channel failure (ready deadline, rejected chunk, theme acknowledgement)
  keeps an already-rendered report mounted behind a banner with Retry, instead of
  replacing the card with an error box. Build, mount, load and render-process
  failures still replace the frame. The 8 s ready deadline is unchanged.
- The bridge token stays in the owner-only `bridge-v3.token` file, read on every
  call so a running adapter survives a plugin reload. It is never written into a
  saved agent record.
- Bundle checks mirror the 0.14 host compiler: client `es2020`, server `node20`,
  explicit SDK externals, no Node builtins or private `client/host` import in the
  client bundle.

### Known limits

- Paseo 0.14 folds a finished turn's tool rows by default ("collapse turns" on new
  installs), and the card sits on the `html_render` tool row, so it is hidden
  until the turn is expanded. A plugin cannot opt out. The
  `[Open interactive report](...)` link in the final reply stays visible.
- Paseo 0.14.0-beta.1/beta.2 host defect: with `daemon.mcp.injectIntoAgents` off
  (the default), an idle Pi agent whose session opened with no MCP server fails its
  next prompt after html-render is installed or re-enabled, with `Provider 'pi'
  does not support MCP servers (plugin html-render)`. The daemon checks the old
  session's capability before the refresh, and Pi reports MCP support only when a
  session launched with an MCP server. Restart the daemon once; resumed sessions
  are not affected. Hosts with `injectIntoAgents: true` are not affected.
- `alwaysLoad` is honored only by the Claude provider; Pi and Codex load the
  server normally.
- On Android the `onMessage` bridge never delivers to a raw mount; it is kept for
  hosts that dispatch the plain event. The user reports the fresh `diag-2` phone
  card works without errors. Timed lifecycle checks, title/event ordering under
  sustained interaction and large-image throughput remain unverified; full
  physical acceptance is still open. Smaller chunks increase native round trips
  without extending deadlines.
  A host exposing raw WebView titles could display chunk content; native titles
  must not be logged.

## 2.2.0 candidate (never published; folded into 3.0.0)

Not published to npm or tagged as 2.2.0. The turn guard is an in-memory nudge, not a
permanent duplicate database or a semantic HTML diff.

### Added

- Contained Android inline HTML candidate: constant trusted native shell, opaque
  `allow-scripts` inner frame, bounded acknowledged transport and explicit
  failures/retry. iOS and unavailable hosts retain the static/native fallback.
  Physical readiness and lifecycle acceptance are not complete.
- Repeatable full-entry evaluation in a pinned real Hermes VM, including public
  Paseo 0.12/0.13 host shapes. This is not physical Android WebView evidence.
- Turn guard: a second `html_render` in one counted agent turn is refused with
  the `duplicate` error code. The limit comes from
  `PASEO_HTML_RENDER_MAX_CARDS_PER_TURN` (integer, default `1`; `0` disables it);
  `html_preview` is never affected. State is per plugin instance.
- The guard compares an exact fingerprint of the **prepared** HTML (after workspace
  raster inlining) plus workspace id, title, height, summary, render mode and
  optional report. Comments, whitespace and cosmetic markup are different inputs;
  they can bypass the nudge. The guard is not semantic duplicate detection.
- A bounded in-memory history remembers 50 publishes per agent, so an identical
  card in a later turn is also refused. A daemon restart clears both the history
  and the active turn count.
- Missing agent attribution emits a warning and skips guarding. An unknown turn
  lifecycle emits a warning and keeps duplicate-only checking (no per-turn count).
  Known null turn ids create counted synthetic turns; a late end for an earlier
  known turn cannot clear a newer turn.
- Adapter `2.2.0`: the generated stdio adapter sends `PASEO_AGENT_ID` with every
  bridge request, so the guard keys on the agent rather than a caller directory.
  An adapter injected before this build is reported stale and asks for a reconnect.

### Changed

- Trigger policy remains one source (`shared/policy.ts`) with the unchanged
  244-character summary and a longer instruction payload. Exposure is not
  universal: a client, harness or shared server description can override or
  truncate what the model sees; Pi exposes MCP tools behind codemode and caps the
  first instruction line at 250 characters. Do not infer a universal selection
  rate or guarantee.
- Chart guidance covers line/area for time, bars from a zero baseline for
  categories, scatter for two numeric variables, dot/strip for distributions,
  sorted bars for rankings and stacked bars for proportions. Series colours use
  `--chart-1` … `--chart-6`; only numbers obtained from a tool may be plotted.
- The G5 e2e gate no longer requires the `shared-browser` plugin. It asserts a
  sandbox-capable Chromium is discoverable and records its path; `shared-browser`
  remains one optional source.
- Release packaging: the server consumes `PluginHandlerContext["paseo"]` instead
  of a direct `@getpaseo/client` type import, so the production-only tarball no
  longer depends on a package Paseo’s `--legacy-peer-deps` acquisition does not
  install. Public compatibility, release and showcase docs, SECURITY, examples and
  captures are packed; private plans, research, status, tests and scripts are not.
- Added a package artifact/link check, an isolated production-install smoke script,
  and CI for the lockfile install, typecheck, full serial tests, bundle boundaries
  and tarball checks. The release remains a manual, human-published step. Added
  public contribution guidance and a bug-report template that asks for sanitized
  host/harness/version details and routes vulnerabilities to the private channel.

### Fixed

- Hermes full-bundle initialization: class-free catalog, chunk assembler and
  public React boundary avoid the reproduced undefined constructor bindings.
- Native selection no longer requires the DocumentFrame export absent from the
  supported 0.12 UI surface. Public native-manager queries do not register views
  or prove mounting; explicit negatives still fail closed.
- Lost initial ready callbacks have bounded same-identity retries; public
  progress/finish URLs reuse the strict receiver. Shell load is never readiness,
  and the original ready, chunk and transfer deadlines remain in force.
- Static captures and measurements request reduced motion before loading the
  document, avoiding intermediate chart geometry when the page honors that
  preference. JavaScript remains disabled; live-frame motion is unchanged.
  Guidance also warns against animating essential chart geometry on initial load.
- Chromium discovery: an installed Chromium-family application is a source, so a
  host with no Playwright cache and no `shared-browser` plugin still has a browser.
  macOS `/Applications` and `~/Applications` bundles are scanned for Google Chrome,
  Chromium, Helium, Brave, Edge and Vivaldi; Linux Brave, Edge and Vivaldi paths are
  added. Discovery order is `PASEO_HTML_RENDER_CHROMIUM`, the Playwright cache, the
  `shared-browser` runtime when present, system paths, then app bundles. Nothing is
  downloaded or installed, and every candidate is launched with the same sandboxed
  flags.

### Security

- Add `SECURITY.md`: supported versions, private vulnerability reporting, the trust
  model (a trusted, unsandboxed Paseo plugin running as the daemon user) and the
  out-of-scope list.
- Remove machine-specific home paths from the public release docs; tests use a
  neutral path.

### Known limits

- A durable save commits the guard reservation before resolving `interactivePath`.
  If that later lookup fails, the tool returns `store_failed` while the artifact
  exists and the turn slot is already consumed. Retrying would create a second
  card; the next turn should reuse the reported card rather than republish.
- The per-turn guard is an in-memory nudge. A restart, a changed cosmetic byte,
  missing attribution or an unknown turn lifecycle can allow another card.
- A user confirmed local inline interaction on Android, then reported a native
  ready timeout. The recovery changes still require a fresh device check; durable
  native/Chrome/PWA parity is not accepted. A compact viewport is not device proof.
- Native-device and provider behavior depend on the host client/provider and are
  not guaranteed by this package.

### Verified

- Focused package/install checks are recorded in the release evidence; the parent
  runs the full serial suite and live dogfood before publication. This changelog
  does not treat a unit-test count as npm or live-client acceptance.

## [2.1.0] - 2026-10-21

Release focused on cards that survive real provider output and plugin reloads.
No new runtime dependencies.

### Added

- Path-based artifact recovery: when a provider drops the encoded marker but
  keeps the tool text, a bounded `artifacts/<32 hex>/` scan rebuilds the card.
  Recovery runs only for this plugin's render rows and nested `codemode` render
  calls, never for the HTML argument or unrelated tools.
- Durable card persistence: every new artifact stores a validated `card.json`
  beside its manifest. The artifact read returns that card, including the
  requested `renderMode`, so a lost marker cannot turn a static card live or a
  live card static. Legacy stores fall back to the manifest.
- Client artifact catalog and re-projection: a marker replaces a path-only
  recovery, duplicate rows keep one stable canonical call id, and a complete
  render row with no reference asks for one bounded re-projection. Re-registering
  the transformer makes Paseo replay the timeline in order.
- Adapter freshness: the generated MCP adapter is versioned, sends its version
  with every bridge request, and is hashed on disk. A stale adapter still serves
  the request and tells the model to reconnect for current tool source.
- A real readiness probe on the live frame (`data-paseo-html-frame-ready`) and a
  bounded retry in the mounted-frame test, replacing the cold-start sleep race.

### Changed

- Release metadata: version `2.1.0`, MIT `LICENSE`, a first-time-user `README`,
  package description/keywords/repository/homepage/bugs/engines, and this
  changelog. `paseo-plugin.json` keeps the id `html-render`.
- Adapter writes are atomic (0600 temp file plus rename); unchanged source keeps
  its inode. A concurrently spawning agent never sees a partial adapter script.
- `docs/verification.md` and `docs/t3-parity-quality-matrix.md` reflect the
  current paths and gate counts instead of the retired 158-test/plugin-v2 claims.
- Added the Git-only paseo.cafe registry entry and exact submission instructions.
  The entry has no npm `package` field because 2.1.0 is not published to npm.

### Fixed

- Cards persisted from a real Pi `codemode` row whose marker was cut before the
  encoded payload (regression fixture `b49e8050`).
- Duplicate-card decisions that depended on row order rather than a stable
  canonical row.
- `renderMode` was not durable: it lived only in the marker and manifest.

### Verified

- `npm test`: 178/178.
- `npm run typecheck`: pass.
- `npm run check:bundles`: pass, 15 client inputs / 21 server inputs, Pele
  server-only.
- `npm run verify:e2e`: 6/6 gates (G1-G6), no blocked or unavailable gates.
- Installed-plugin check: `paseo plugin reload html-render`, `paseo plugin ls`,
  and `paseo plugin logs html-render` after merging to `main`.

## [2.0.0] - 2026-10-20

First packaged release: checkout install path, T3-shaped HTML tools, sandboxed
static previews, live web/desktop frames, native report model, private artifact
store, trigger corpus and autonomous verification (G1-G6).
