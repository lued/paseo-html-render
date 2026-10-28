# Releasing

Target: the first npm release, **3.0.0**. 2.2.0 was a candidate that was never
published; its changes ship in 3.0.0. The reference tarball is verified locally;
registry availability and npm-source acceptance are recorded at publication time.
Existing tag `v2.1.0` is historical and must not be moved.

## Support matrix

The release claims Node `>=22.18.0` and Paseo `>=0.14.0-beta.1 <0.15.0`. The
floor names the prerelease explicitly because a semver range excludes
prereleases unless a comparator carries one. Paseo 0.12 and 0.13 are not
supported: 3.0 contributes its MCP server through the 0.14 `agent.session_open`
hook. Validate the minimum and current host before publication:

| Node | Paseo daemon | Paseo CLI | `@getpaseo/plugin` SDK | Evidence |
| --- | --- | --- | --- | --- |
| 22.18.0 | 0.14.0-beta.1 | 0.14.0-beta.1 | 0.14.0-beta.1 | CI isolated reference-tarball smoke |
| 22.18.0 | 0.14.0-beta.2 | 0.14.0-beta.2 | 0.14.0-beta.1 | CI isolated reference-tarball smoke |
| 26.12.1 | 0.14.0-beta.2 | 0.14.0-beta.2 | 0.14.0-beta.1 | local isolated smoke; see `docs/verification.md` |

The 0.14.0-beta.1 and 0.14.0-beta.2 SDK `dist` trees are byte-identical, so the
package pins the floor.

The daemon/CLI version and the `@getpaseo/plugin` SDK version are separate
contracts. Record both in `smoke-result.json`; do not infer the SDK version from
the daemon version. A range does not prove a version: run the smoke test with each
toolchain and keep the result. Native devices, macOS bundles and provider
selection are separate claims and are not proven by this matrix.

## Pre-publish acceptance

Paseo installs npm plugins with:

```sh
npm install --ignore-scripts --legacy-peer-deps --omit=dev
```

`--legacy-peer-deps` means the plugin cannot rely on peer auto-install. Paseo’s
compiler supplies its SDK, React, React Native and Zod as host externals; `pele`
is a real package dependency and is bundled into the server. The package has no
direct `@getpaseo/client` import or runtime dependency.

Run the source gates first:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run check:bundles
npm run check:package -- --out /tmp/hr-package
```

`check:package` creates the tarball and validates the actual artifact: required
public docs/assets, examples and captures; no private plans/research/status,
tests, scripts or node_modules; relative Markdown/HTML links resolve after
extraction and cannot escape the package root; package, manifest and adapter
versions agree; and no direct `@getpaseo/client` import remains.

Then test that exact tarball in an isolated production tree and real daemon:

```sh
npm run smoke:package -- \
  --tarball /tmp/hr-package/paseo-html-render-3.0.0.tgz \
  --paseo "$(command -v paseo)" \
  --out /tmp/hr-smoke
```

The smoke script:

1. installs the reference tarball with `--omit=dev --ignore-scripts
   --legacy-peer-deps` in a fresh directory (no checkout or dev dependencies on
   the resolution path), then starts a real isolated Paseo home on a free loopback
   port and installs the packed plugin;
2. creates a disposable workspace and idle agent in that home (no model prompt),
   proves injection from the sanitized `session-open` plugin log line (server
   `html-render-v3`, `stdio`, `alwaysLoad=true`), fails if the saved agent record
   contains the v3 key or the bridge credential, checks the owner-only token file
   and the retired-adapter tombstone, and calls the real generated adapter;
3. proves `initialize`, `tools/list`, `html_preview`, `html_render`, and an
   artifact readback through the plugin RPC/authority path;
4. clears inherited `PASEO_HTML_RENDER_CHROMIUM`, starts a second isolated home
   with no Chromium source, and proves the explicit missing-browser error;
5. starts a third isolated home with a nonexistent explicit Chromium override,
   calls preview twice, and proves `browser_unavailable` both times while the
   plugin remains running — not crashed;
6. records Node, npm, Paseo CLI, daemon and SDK versions, tarball
   sha256/integrity, exact flags, source mode and pass/fail evidence, stops only
   its own daemons, and writes `smoke-result.json`.

No browser is downloaded at runtime and the plugin never adds `--no-sandbox`.
The test environment may provide Chromium through `PASEO_HTML_RENDER_CHROMIUM` or
an existing Playwright cache. Missing browser is a failure to report, not a gate
to fake.

The script uses `--out` for evidence; keep the tarball and `smoke-result.json`
for review. It removes its disposable homes/package tree after copying sanitized
logs unless `--keep-fixtures` is passed. If the release host always has a system
browser, pass `--skip-missing-browser` for the normal install run and execute both
negative browser proofs once on a host/container with no discoverable browser;
record them as separate results, not as skipped passes.

## Actual npm-source acceptance (after publication)

Do not publish from a dirty tree. Publish the **exact verified tarball**, not a
new `npm pack` of the repository, so registry integrity can be compared to the
reference:

```sh
npm publish /tmp/hr-package/paseo-html-render-3.0.0.tgz --tag next
npm view paseo-html-render@3.0.0 version dist.integrity dist.tarball
```

Then run the same smoke with the opt-in npm-source mode. It checks the registry
version/integrity against the reference tarball, has the real isolated Paseo CLI
acquire `npm:paseo-html-render@3.0.0` (not a directory), and exercises the same
adapter/readback path:

```sh
npm run smoke:package -- \
  --tarball /tmp/hr-package/paseo-html-render-3.0.0.tgz \
  --npm-source npm:paseo-html-render@3.0.0 \
  --paseo "$(command -v paseo)" \
  --out /tmp/hr-smoke-npm
```

If the registry has no matching artifact or its integrity differs, the script
fails; an unavailable registry is never a pass. The positive npm-source result
belongs in the parent-owned verification evidence. Promote only the exact tested
artifact to `latest`, then create the matching GitHub release. Never rewrite an
npm version to make a failed candidate look green.

## Rollback

Directory installs stay valid. If a rollout fails, stop promotion, adjust the
dist-tag/known-good install, and do not delete existing artifacts or tags:

```sh
paseo plugin remove html-render
cd /path/to/paseo-html-render
npm ci --ignore-scripts
paseo plugin install .
```
