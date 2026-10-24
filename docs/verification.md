# Verification and release evidence

Date: 2026-10-24. Candidate: **paseo-html-render 2.2.0**, plugin id
`html-render`. This is a staged release record, not a claim that npm publication
or live client acceptance has finished. Historical `v2.1.0` stays unchanged.

## Candidate identity

Runtime content through `a5f2b18`, including atomic guard `e3987a1`, production
type-resolution fix `907be95` and Chromium launch-error fix `793ae7c`.
Verification-only scripts/docs/CI changes do not enter the package allowlist.
Any change to a packed file requires a new integrity check and acceptance run.

| Artifact property | Verified value |
| --- | --- |
| Filename | `paseo-html-render-2.2.0.tgz` |
| SHA-256 | `5543c437450f1ac3a7d7d464dde8b44d63a660ca0a7869a950c2e5c15198762b` |
| npm integrity | `sha512-eyntKJo0hFIAjbYZDHLNL625RkYUgbq2gxmBjg4p1NG0Vkb8kBqdY5orxlxoamQ+6NFpXRPkA3Q8Alk3ColNRA==` |
| Packed / unpacked | 1,554,106 / 2,026,680 bytes |
| Contents | 72 entries; 43 required public files; 40 local Markdown links checked; zero forbidden/private matches |

Parent independently repacked the tree and matched the same SHA-256. The older
candidate beginning `0112c118` is superseded and must not be published.

## Independently executed local gates

| Gate | Result |
| --- | --- |
| Full serial suite, Node 26.12.1 | **258/258 pass**, zero skipped/failures/cancelled |
| Full serial suite, Node 22.18.0 | **258/258 pass**, zero skipped/failures/cancelled |
| Typecheck | PASS |
| Bundle boundaries | PASS; 15 client / 24 server inputs; Pele server-only |
| Actual tarball contents/links | PASS, integrity above |
| Sandboxed hosted-client browser helper | PASS startup/evaluation; full client flow remains below |
| GitHub Actions | Workflow added; remote execution pending |

CI uses Ubuntu 22.04's existing Chrome, probes an actual sandboxed render before
tests, runs the full serial TAP suite and requires zero skips/cancellations.
It has read-only repository permission and no publication credentials. Renderer
and live-acceptance browsers do not use `--no-sandbox`.

## Exact production installation

The baseline failure was reproduced with Paseo's real acquisition flags:

```sh
npm install <exact-tarball> --ignore-scripts --legacy-peer-deps --omit=dev
```

The previous package failed host compilation on an undeclared type-only
`@getpaseo/client` import. The server now derives the API type from the
host-provided SDK; no heavy client runtime dependency was added.

Parent independently installed the exact candidate and exercised **real isolated
Paseo daemons**, not API stubs, on both toolchains:

| Node | npm | Paseo daemon / SDK | Preview, publish, authorized readback | Negative browser cases |
| --- | --- | --- | --- | --- |
| 22.18.0 | 10.9.3 | 0.12.0 / 0.12.0 | PASS | PASS |
| 26.12.1 | 11.20.0 | 0.13.0-beta.2 / 0.13.0-beta.2 | PASS | PASS |

Each run proved `Plugin ready`, injection into an idle fixture agent, real stdio
adapter initialization/tool discovery, PNG preview, durable publish, and
`html.artifact.read` / `html.artifact.original` through actual authorization.
No model prompt was sent in these install tests. Fixture homes, workspaces and
daemons were disposable and did not replace the live installation.

True missing-browser calls returned `browser_unavailable`; a nonexistent explicit
override returned it on **two consecutive calls**. The plugin stayed running in
both cases. Missing, non-executable and synchronously invalid paths also have
retry/cleanup regressions. No browser was downloaded or sandbox disabled.

Local private receipts: `/tmp/hr-release-2.2.0/parent-smoke-012/`,
`parent-smoke-013/` and `parent-package-check/`. Raw logs/screenshots remain
private; pairing offers, bridge credentials and unrelated user data are not
release artifacts. Commands for reproducing the checks are in [release.md](release.md).

## Live Paseo case ledger

Local tests and fixture installs are not substitutes for a model using the plugin
in the actual hosted client. These cases are the remaining live acceptance work:

| Case | Status |
| --- | --- |
| D1 fresh injection and text-only single-fact selection | PASS: fresh 2.2.0 adapter injected; agent read package.json and replied `2.2.0`; zero HTML calls |
| D2 chart of real repository/tool data | Pending |
| D3 source-based flow and built-in Pele/report graph | Pending |
| D4 all three showcase pages published and inspected | Pending |
| D5 flow/inspector/filter controls, keyboard, motion and reflow | Pending |
| D6 actual web auto/iframe/static/report views and file link | Pending |
| D7 same-turn/concurrent/unchanged refusals and next-turn update | Pending |
| D8 image/report/metadata changes, missing-image diagnostics and ownership/readback | Pending |
| D9 persisted history, refresh and one card per artifact | Pending |
| D10 exact production tarball / actual published npm-source acquisition | Tarball PASS; npm-source pending |

G1–G6 `npm run verify:e2e` results will be recorded separately. G2 mounts real
components but uses a native shim; it is **not** physical iOS/Android evidence.
G6 drives the real hosted Paseo web application, not the outer Electron shell.
A blocked/unavailable gate is never counted as a pass.

## Boundaries and unverified claims

- Native devices, the outer Electron shell and macOS app-bundle discovery have
  not been freshly exercised here. Native fallback implementation/mounted tests
  are not physical-device acceptance.
- Natural tool selection is model/config dependent. Pi can truncate or override
  the first-line MCP summary via description/shared budgets; `alwaysLoad` is not
  a universal exposure guarantee. Do not infer all-provider coverage from Pi.
- The guard compares exact prepared inputs, not semantic equivalence. It retains
  50 publishes per attributed agent in memory; restart clears state. Missing
  attribution or unknown lifecycle degrades explicitly. See [compatibility.md](compatibility.md).
- A per-item transformer cannot suppress arbitrary marker duplication in unrelated
  third tool rows. The supported wrapper/inner-row and history paths have regressions.
- Opaque frames retain `allow-scripts` only; static screenshots disable JavaScript.
  CSP blocks resource loading, but iframe self-navigation is a documented residual.
- Positive npm-source proof requires publication of this immutable tarball to
  `next`, matching registry integrity, then actual isolated Paseo npm acquisition
  and readback. Only then may it be promoted to `latest` and released on GitHub.

## Historical checkpoint

The 2026-10-21 v2.1.0 record reported 178 tests and six e2e gates. Those historical
counts are not current release evidence. Source commits and previous revisions of
this document retain the earlier durability/marker recovery and policy history.
