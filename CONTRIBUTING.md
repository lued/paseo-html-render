# Contributing

Thanks for trying HTML Render. This is a small, security-sensitive plugin; bug
reports and focused fixes are more useful than broad feature patches right now.

## Report a bug

Open an issue with the bug template and include:

- Paseo version, Node version and operating system;
- client and harness (web, desktop, iOS/Android, Pi/Claude/Codex/OpenCode…);
- the prompt or tool arguments needed to reproduce, with private content removed;
- expected and actual result, plus sanitized logs or a screenshot.

Never paste tokens, API keys, private workspace paths, personal report content or
customer data. Redact artifact ids and local paths when they are not needed.

For a suspected vulnerability, do **not** open a public issue. Use the private
route in [SECURITY.md](SECURITY.md).

## Development

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run check:bundles
npm run check:package -- --out /tmp/hr-package
npm run smoke:package -- --tarball /tmp/hr-package/paseo-html-render-3.0.0.tgz --skip-missing-browser
# Also run once without --skip-missing-browser on a host with no discoverable browser.
```

Keep changes inside the release scope unless maintainers agree otherwise. Do not
weaken the sandbox, CSP, workspace authorization or the documented renderer
behavior. The package smoke test must use the exact production flags and an
isolated Paseo home; never replace a user's live plugin or default home.
