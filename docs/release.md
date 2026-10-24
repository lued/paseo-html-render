# Releasing

Target: the first npm release, **2.2.0**. It is not published yet; the checkout
remains a supported fallback. Existing tag `v2.1.0` is historical and must not be
moved.

## Support matrix

The release claims Node `>=22.18.0` and Paseo `>=0.12.0 <0.14.0`. Validate the
minimum and current host before publication:

| Node | Paseo | Evidence |
| --- | --- | --- |
| 22.18.0 | 0.12.0 | isolated package smoke |
| 26.12.1 (current) | 0.13.0-beta.2 (current) | isolated package smoke |

A version is not “supported” because a range says so. Run the smoke test with
each toolchain and keep the result. Native devices, macOS bundles and provider
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
extraction; package, manifest and adapter versions agree; and no direct
`@getpaseo/client` import remains.

Then pack that exact tarball into an isolated production tree and start a real
isolated daemon:

```sh
npm run smoke:package -- \
  --tarball /tmp/hr-package/paseo-html-render-2.2.0.tgz \
  --paseo "$(command -v paseo)" \
  --out /tmp/hr-smoke
```

The smoke script:

1. installs the given tarball with `--omit=dev --ignore-scripts --legacy-peer-deps`
   in a fresh directory (no checkout or dev dependencies on the resolution path);
2. writes an isolated Paseo home/config on a free loopback port, starts only that
   daemon, and installs the packed plugin;
3. creates a disposable workspace and idle agent in that home (no model prompt),
   reads the injected MCP server config, and calls the real generated adapter;
4. proves `initialize`, `tools/list`, `html_preview`, `html_render`, and an
   artifact readback through the plugin RPC/authority path;
5. starts a second isolated home with no Chromium source, then proves the explicit
   missing-browser error;
6. records Node/Paseo/npm versions, tarball sha256/integrity, exact flags and
   pass/fail evidence, stops only its own daemons, and writes `smoke-result.json`.

No browser is downloaded at runtime and the plugin never adds `--no-sandbox`.
The test environment may provide Chromium through `PASEO_HTML_RENDER_CHROMIUM` or
an existing Playwright cache. Missing browser is a failure to report, not a gate
to fake.

The script uses `--out` for evidence; keep the tarball and `smoke-result.json`
for review. It removes its disposable homes/package tree after copying sanitized
logs unless `--keep-fixtures` is passed. If the release host always has a system
browser, pass `--skip-missing-browser` for the normal install run and execute the
missing-browser proof once on a host/container with no discoverable browser; record
that as a separate result, not as a skipped pass.

## Publish (human-only)

Do not publish from a dirty tree. Do not overwrite `v2.1.0` or an npm version.

1. Merge the release commit, confirm `npm pack` integrity matches the tested
   tarball, and tag `v2.2.0` at that commit.
2. Publish to the `next` dist-tag first:
   `npm publish --tag next` (2FA/account ownership is a human step).
3. Verify `npm view paseo-html-render@2.2.0 version dist.integrity`, then run the
   isolated smoke against `npm:paseo-html-render@next` on one host.
4. Promote the same immutable artifact to `latest`; create the matching GitHub
   release. Never rewrite an npm version to make a failed candidate look green.
5. Keep the checkout fallback until the npm-source smoke is recorded.

## Rollback

Directory installs stay valid. If a rollout fails, stop promotion, adjust the
dist-tag/known-good install, and do not delete existing artifacts or tags:

```sh
paseo plugin remove html-render
cd /path/to/paseo-html-render
npm ci --ignore-scripts
paseo plugin install .
```
