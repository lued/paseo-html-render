# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-10-24

First npm-release candidate. The turn guard is an in-memory nudge, not a
permanent duplicate database or a semantic HTML diff.

### Added

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
- Native-device and provider behavior depend on the host client/provider and are
  not guaranteed by this package. A compact web viewport is not native evidence.

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
