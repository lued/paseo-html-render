# Android-first live Paseo acceptance

Date: 2026-10-26
Status: user authorized completing live acceptance (item 2), using OpenCode Go DeepSeek max subagents. npm authentication/publication is deferred to the last step. macOS is not an acceptance target.
review: none

## Outcome and evidence

Complete the outstanding D2–D9 user-facing cases from docs/verification.md through actual model/tool use and real client checks. Make the password-protected hosted-client path testable without retrieving the user's password or disabling authentication. Prioritize the user's Android phone: distinguish native report/PNG chat fallback from interactive file preview and Android browser/PWA behavior. Never describe desktop emulation/native shims as physical Android evidence.

Use current code/package identity until a needed runtime fix supersedes it. Save private raw evidence under /tmp/hr-acceptance-20261026/ (0700 directories, 0600 files); record sanitized results and precise limitations in docs/verification.md. Captured examples must be discoverable to the user, not only buried in child-agent output.

## Boundaries

- Existing main workspace only; no new worktrees or feature/research lanes.
- No npm login, npm publication, push, tag or GitHub release in this phase.
- Do not inspect user credentials, copy auth stores, log tokens/pairing material, disable daemon authentication or change the user's daemon/security settings.
- Prefer an explicitly disposable password-protected fixture with a generated test-only password for automated hosted-client checks. If feasible, prove this with an actual model-published card. Fixture evidence supplements, never replaces, the actual Android phone/current-client checks.
- Keep opaque allow-scripts frames, current CSP, script-disabled static captures, and the browser OS sandbox. No allow-same-origin, remote/CDN loading, sandbox bypass or root/sudo.
- Only bounded fixes necessary for these acceptance cases. No new chart engine, package loader, classifier, card revisions or visual architecture.
- Agents cannot delegate. Read-only workers may run in parallel; one code writer at a time on main. Parent owns reloads, full suites, integration, evidence and user communication. Run Chromium-heavy full suites serially.

## Model and execution

All children: models.csv row deepseek-v4-1-flash, selector ocx/opencode-go/deepseek-v4.1-flash, thinking max, ZDR. Availability rechecked 2026-10-26: this route is live; unrelated catalog drift is not used.

1. Read-only scout: locate supported daemon/client password authentication, safe disposable fixture setup, current hosted-client test assumptions, native Android/file-preview paths, and available physical-device/browser automation. Return exact source evidence and a bounded implementation proposal; do not edit or collect credentials.
2. In parallel, fresh read-only live-case agent: source-derived flow plus the built-in Pele report graph, one published artifact. Return real tool results, artifact/file links and private evidence. This agent is reused sequentially for the remaining visual/guard/ownership/history cases, never as a concurrent code writer.
3. After scout findings, one DeepSeek max code child fixes only the owned auth/hosted-client test path and necessary acceptance defects. Parent coordinates focused browser checks and independently reviews changes. No speculative implementation before findings.
4. Run remaining D2–D9 cases sequentially: real-data chart final acceptance; three showcase pages; flow/inspector/filter controls, keyboard, theme, reduced motion, narrow reflow and static fallbacks; auto/iframe/static/report/file views; same-turn/concurrent/unchanged refusals and meaningful updates; image/report/metadata changes, diagnostics, ownership/legacy readback; persisted history/refresh with no duplicate card projection.
5. Parent independently reruns relevant full tests/typecheck/bundles, real protected-host browser checks and actual Android checks. Obtain the user's platform/version or manual phone observations only where device tooling cannot establish them. Report each subcase separately; finish all available cases before declaring a remaining device-dependent blocker.

## Acceptance and stop conditions

- Each case has actual call/artifact evidence and separately identified UI/device evidence. Invalid calls/refusals never count as successful publications; fixtures/mounted components do not count as a physical phone.
- Password protection remains enabled in the positive hosted-client test. Missing/wrong auth has an explicit negative result; credentials/offers do not appear in evidence output. Correctly authenticated client checks the intended card and interactive file, not an arbitrary iframe or unrelated tab.
- Android native chat fallback is readable; supported file preview and controls work on the actual target phone, with native/browser differences documented. Verify history refresh and one projection per artifact.
- No silently skipped/unavailable requirement is a pass. If blocked, preserve the attempted paths and precise evidence, complete independent work, then ask only for the specific phone action/access or scope decision needed. Never bypass user authentication to force a pass.
- Publication stays deferred even after acceptance succeeds; the parent reports readiness and remaining npm-only steps to the user.
