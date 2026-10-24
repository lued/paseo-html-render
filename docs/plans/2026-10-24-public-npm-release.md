# HTML Render: first public npm release

Date: 2026-10-24
Status: presentation consolidated and tested in the existing integration workspace; guard/npm gates pending; publication requires approval
Recommended release: 2.2.0 (the first npm release, not a rewrite of v2.1.0)
review: none

## Outcome and boundaries

Ship `paseo-html-render` as an npm-installable Paseo plugin from the personal
GitHub repository `https://github.com/lued/paseo-html-render`. A first-time user
must be able to install it by following the README, obtain a useful visual card,
and find an honest explanation of requirements, limitations, and how to report
feedback. Preserve artifact compatibility, workspace authorization, the Chromium
sandbox, and existing client behavior.

Success means a green release commit, a proven production-only tarball install,
a successful install of the actual npm source in an isolated Paseo home, matching
GitHub tag/package/integrity evidence, and a concise public release page. A unit
test count alone is not release acceptance.

This is a release-readiness project, not a feature expansion. Do not implement
card editing/revisions, a chart engine, per-harness forks, or a composer button
before this release. Do not publish, push, tag, delete worktrees, change repository
settings, or reload/replace the user's live plugin without explicit approval.
No credentials belong in prompts, logs, reports, or repository files.

## Recovered state: nothing is stranded

Verified on 2026-10-24, baseline commit `a8c3e4e`:

| Location | State | Action |
| --- | --- | --- |
| `main` | Clean, four commits ahead of the live GitHub `main` ref | Use as the sole release base |
| `feat/nudge-policy` | HEAD `ccf4f75`, clean, ancestor of `main` | Already integrated; retain until approved cleanup |
| `feat/turn-guard` | HEAD `e7307d2`, clean, ancestor of `main` | Already integrated; retain until approved cleanup |
| GitHub `main` | `43231d7`; repository is public and issues are enabled | Push only after release approval |
| npm | Registry lookup for `paseo-html-render` returns E404 | No visible package; name ownership/availability still unconfirmed |
| Public `v2.1.0` | Annotated tag resolves to `a6d5949`, not current HEAD | Preserve; never move or overwrite |

Use `git worktree list` to locate the retained branches above. Machine-specific
worktree paths are not part of the release documentation.

The worktrees are not separate unfinished releases. Their commits are already
in `main`; there is nothing to cherry-pick from either. Keep them as references
until cleanup is approved. Do not create more feature worktrees for discovery.

### Feature 1: visual selection policy and chart guidance

Merged: `0efd2d0`, followed by `ccf4f75`.
- `shared/policy.ts` centralizes the descriptions and a 244-character summary.
- The first MCP instruction line includes both the positive use rule and brakes.
- Chart fit rules cover time series, category bars, scatter, distributions,
  rankings, and proportions. Theme series tokens and data-honesty guidance are
  advertised. This is guidance, not a deterministic chart rendering engine.
- The adapter sends `PASEO_AGENT_ID` to the bridge.
- The trigger probe now distinguishes must-render, may-render and must-not-render.
- Harness exposure is client/config/version-dependent; do not market universal
  selection rates or assume every installation of a harness exposes tools alike.

### Feature 2: duplicate-card guard

Merged: `e7307d2`, with integration follow-up `a8c3e4e`.
- A default per-agent turn budget and normalized-HTML duplicate check run before
  rendering; refusals point to an existing artifact.
- Guard state is in-memory and retains at most 50 publishes per key. Preview is
  unaffected. An explicit environment option disables the guard.
- Adapter version is 2.1.1 while package.json still says 2.1.0. These are currently
  separate contracts; choose and document the release version policy explicitly.
- This is not card editing, replacement, revision storage, or semantic diffing.
- Current guard has correctness gaps below. The previous claim that it fully
  prevents duplicate cards was too strong.

### Fresh baseline, not a historical claim

Re-run on 2026-10-24:
- `npm run typecheck`: PASS.
- `npm test`: 209 tests, 209 pass, 0 failures/skips/cancellations.
- `npm run check:bundles`: PASS; 15 client inputs, 23 server inputs, Pele server-only.
- `npm pack --dry-run --json`: 37 entries, 104,551 bytes packed, 374,863 unpacked.
- Current local CLI: Paseo 0.13.0-beta.2; Node v26.12.1. This does not prove the
  advertised Node 22.18/Paseo 0.12 minimums.
- Full deployed e2e, multi-harness natural triggering, macOS/native device behavior,
  and an actual npm-source install have NOT been freshly verified for this commit.

### Consolidation checkpoint

Presentation work is now combined in the existing motion workspace at `6f7bdb6`:
README/showcase `9bdc5a4`, motion `b6bdc41`/`b8dffba`, package-name guidance
`b6cab1b`, and strict integrated link checks. Parent typecheck, **225/225 tests**
(zero skips/failures) and bundle checks pass (15 client / 24 server inputs). Main's
live source was not updated and no plugin reload took place. This does not close
the correctness, install or support-evidence gates below. Use the existing
integration workspace for further approved work; do not create more lanes.

## Release blockers and acceptance

### A. Close correctness holes in the new guard

Independently reproduced from the existing source, using fake rendering and a
temporary artifact store (no live plugin replacement):

1. **Concurrent publishing bypasses the count.** `publish()` checks the guard,
   awaits rendering/storage, then records. Two simultaneous calls both pass
   `check`; `Promise.allSettled` returned two successful artifacts in one turn.
   Use an atomic reservation or per-key serialization, with failure rollback and
   turn-scoped accounting. Test concurrency, failed/cancelled publishes, and a
   turn transition while a request is in flight.
2. **Whitespace normalization can erase meaningful changes.** Fingerprints for
   `<pre>a  b</pre>` and `<pre>a b</pre>` are equal; so are distinct JavaScript
   strings containing those spaces. Comments inside raw-text data can matter too.
   Prefer conservative duplicate detection over claiming semantic equivalence.
   Test preformatted content, scripts/styles and significant whitespace.
3. **Fingerprint coverage needs an explicit contract.** It currently hashes only
   raw HTML, ignoring changed report data, rendering mode, frame metadata and
   referenced raster file bytes. A changed native report or updated image must
   not be refused as "nothing changed". Define the safe comparison surface and
   test meaningful input changes without building a semantic-diff system.
4. **The per-turn guard is inactive for known null-ID provider events.** The
   installed Claude and Codex provider paths emit turn-start events without IDs;
   the plugin host maps these to null, and the guard turns the count off. Create
   a synthetic turn for null-ID begin/end lifecycle pairs, retain it across
   duplicate begin events, and test transitions. Old adapters also use a cwd key
   that does not match the agent-keyed lifecycle; prove attribution or explicitly
   signal degraded behavior. Preserve workspace authorization; agent IDs from a
   bridge request must not become a new authorization authority.
5. **The instruction budget is a ceiling, not a guarantee.** Pi's configured
   server description can override initialize.instructions, and the shared
   server-section budget can truncate text below 250 characters. Lead with the
   essential rule and brake, test realistic crowded-server configurations, and
   remove unconditional per-harness exposure claims.

Gate: added regression tests pass, at most the intended number of simultaneous
publishes commit for a known turn, meaningful updates are not falsely blocked,
and claims match the tested degradation behavior. Do not advertise unlimited
permanent duplicate prevention from a 50-entry in-memory history.

### B. Prove the actual npm install, not a checkout install

The packed package imports `PaseoApi` from `@getpaseo/client` in
`server/authority.ts` and `server/contribute.ts`, but does not declare that
package as a production dependency. The installed Paseo npm acquisition path uses
`--legacy-peer-deps --omit=dev --ignore-scripts`; the documented release rehearsal
omits the first flag, which can hide the missing dependency by installing peers.
The host compiler explicitly errors on unresolved type-only imports.

Gate:
- Reproduce in an isolated production-only package tree using the actual flags;
  fix the direct type dependency or remove the dependency on it without adding
  unnecessary runtime weight.
- Pack once; install that exact tarball with no checkout/dev-dependency leakage.
- Start/compile with an isolated Paseo home; prove plugin readiness and one
  preview/publish/readback. Never replace the user's live plugin for this test.
- Test a discovered Chromium and the intentional missing-browser error. No browser
  download at runtime, no unsafe `--no-sandbox` fallback.
- Repeat against `npm:paseo-html-render@<exact-version>` after publishing to `next`.
- Record commit, package integrity, flags, Node/Paseo versions, and outcomes.

The missing-type failure is strongly indicated by compiler/acquisition inspection;
a real isolated package install is still the proof gate, not yet a completed test.

### C. Align the release identity and the public contract

Recommend 2.2.0: existing public v2.1.0 remains unchanged; the merged turn guard is
an added feature. An initial npm release does not have to begin at 1.0.0.

Gate:
- Package version, lockfile, changelog and release notes agree with a new tag.
  Decide whether adapter version follows the package or is independently tracked.
- Choose a tested support range; align peer metadata, manifest, README and matrix.
  Test the advertised minimum Node/Paseo versions and current supported host(s),
  or narrow the claim. The peer currently caps the SDK below 0.13 while the
  manifest/README promise 0.12 or newer.
- Replace broad harness claims with a dated model/harness/config test matrix:
  preview, publish, history reconstruction, natural selection, repeat-follow-up.
  Pi plus Claude/Codex are priority targets; OpenCode is next. Mark untested cells
  honestly. Paid/provider tests require a bounded approved budget.
- Preserve the artifact marker and legacy-readable IDs. No migration of old cards
  is required for this release.

### D. Make first contact look finished

Gate:
- README leads with the benefit and one verified npm install command, then browser
  requirements, a real screenshot, three useful prompts, and troubleshooting.
- Include or use valid public URLs for every README/OVERVIEW image and doc link.
  The current tarball excludes the linked docs/image and SECURITY.md.
- Pack only user-facing docs; exclude work plans, internal handoffs, fixtures,
  credentials, private workspace paths and personal report data.
- Capture real chart/flow/comparison examples in light/dark and narrow/wide layouts.
  Use actual sourced data, axis units, readable text and no placeholder charts.
- State native testing gaps and self-navigation/security limitations plainly.
- Add CONTRIBUTING, a concise issue template (host/harness/version/repro, sanitized
  logs only), and verify the private security-reporting route exists.

### E. Make release quality repeatable

Gate:
- Add a PR/push CI workflow: immutable lockfile install, typecheck, tests, bundle
  boundaries, pack-contents/link assertions, and regression tests.
- Arrange sandbox-capable Chromium for CI without weakening production sandbox
  behavior. State CI prerequisites rather than silently skipping renderer tests.
- Add an isolated package-install smoke gate so future dependency changes cannot
  recreate a checkout-only success.
- Keep provider/browser UI e2e as explicit opt-in integration jobs with prerequisites;
  never count "unavailable" as passing release evidence.
- Save a release verification manifest, not stale hard-coded test totals as
  perpetual proof. Prefer npm trusted publishing/provenance when account setup
  permits; otherwise document the first-release manual publish path and 2FA.

## Ordered work plan

The two authorized presentation lanes are consolidated and parent-tested; their
scoped work plan is `2026-10-24-showcase-and-interactivity.md`. Guard hardening, npm
packaging changes, CI/versioning and external release actions remain proposed
until approved. The next work is sequential in the existing integration workspace,
not another pair of worktrees or an expansion of the package-list idea.

| Phase | Work | Model row / responsibility | Worktree and dependencies | Exit evidence |
| --- | --- | --- | --- | --- |
| 0. Recover | Reconcile branches and consolidate presentation work | Orchestrator; original DeepSeek lanes complete | Existing motion workspace, now integration | 225 tests pass; pending work committed |
| 1. Stabilize | Guard races, safe fingerprint, lifecycle/attribution, consistent policy rules | Existing owner after scoped approval | Same integration workspace, sequential | Targeted regressions + full suite |
| 2. Package | Fix dependency tree, tarball docs and exact isolated install rehearsal | Existing owner after scoped approval | Same integration workspace, after phase 1 | Production-only tarball compiles and renders |
| 3. Present | README/demo complete; finish support matrix and feedback contract | Orchestrator signs off | Presentation already integrated; packaging/support details follow phase 2 | Fresh-user walkthrough; accessible visual examples |
| 4. Verify | Integrate, CI/publish guard, final version and evidence | Orchestrator + deepseek-v4-1-flash code | One release integration branch; no new product features | Green CI, e2e, package and supported-host matrix |
| 5. Launch | Push approved commit/tag, publish `next`, verify npm source, promote `latest`, GitHub release | Human-controlled npm/GitHub actions | Only after all gates; explicit approval | Public artifact integrity + fresh install |
| 6. Listen | Triage outside-user reports and plan 2.2.x | Orchestrator + maintainer | After launch | Reproducible feedback, patch backlog |

Keep remaining work sequential in the existing integration workspace unless the
user separately approves parallelism. Ownership boundaries still apply:
- Guard lane: guard/tools/lifecycle/bridge and dedicated regressions.
- Package lane: package metadata/lockfile, type-only authority import, package
  checks and release-install tests. If a fix touches contribute.ts (guard lane),
  the orchestrator applies that small seam sequentially rather than allow overlap.
- README, compatibility docs, CI, changelog and final version bump have one owner
  at integration time; neither parallel child changes release identity on its own.
- Children use the models.csv row `deepseek-v4-1-flash` (ZDR, code/scout roles);
  re-check routing availability before execution. No further delegation by children.
- Run Chromium-heavy full suites serially after integration to avoid load-induced
  timeouts; parallel workers use targeted tests.
- Existing merged worktrees are retained until the user explicitly approves cleanup.

## Launch sequence and rollback

1. Approve the release commit/version and external publication actions. Confirm npm
   account, name ownership, 2FA and GitHub security/reporting settings privately.
2. Push the release commit and a new matching tag; do not rewrite v2.1.0.
3. Publish stable version 2.2.0 under the npm `next` dist-tag first (not `latest`).
   An npm version is immutable: if this candidate fails, fix it under a new version.
4. In a clean isolated home, install the exact published npm version and run the
   first-user smoke. Check registry integrity against the release tarball.
5. Promote that tested stable artifact to `latest`, then publish the GitHub release
   and request feedback. The final install command is verified, not hypothetical.
6. Keep the last known-good checkout/package available. If rollout fails, stop
   promotion; adjust dist-tags or install the known-good version. Never delete or
   rewrite existing private artifacts or version tags to make a release look green.

Feedback should ask: Did installation work? Which Paseo/harness/model/client?
Did a card add value? Was it duplicated, clipped, unreadable or incorrectly
charted? Avoid collecting report content or personal paths by default.

## Deferred product roadmap

After outside feedback, prioritize:
1. Stable logical card IDs with immutable revisions and meaningful update behavior.
2. Data-driven chart primitives/recipes to improve quality without forcing charts.
3. Smaller prompt/tool overhead and evidence-based harness exposure adjustments.
4. An optional user affordance only if real use shows a need.

No dates, percent-complete scores or adoption targets are invented. Phase gates,
not a calendar promise, decide when the release is ready.

## Stop conditions

If the isolated package will not compile/render, the browser cannot run safely,
version/tag identity differs, or a release claim lacks evidence, do not publish.
Report the failing command, sanitized evidence, attempted fix, and next decision
needed. Authentication/name ownership/provider access failures require human input;
never bypass permissions or weaken the sandbox to satisfy a gate.
