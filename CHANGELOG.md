# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- Add `SECURITY.md`: supported versions, private vulnerability reporting, the trust model
  (a trusted, unsandboxed Paseo plugin running as the daemon user) and the out-of-scope list.
- Remove absolute home paths, a machine name and internal workspace paths from the docs and
  test fixtures. Tests use a neutral `/home/dev` path; behaviour is unchanged.

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
