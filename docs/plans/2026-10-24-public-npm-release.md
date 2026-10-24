# HTML Render: first public npm release

Date: 2026-10-24
Status: user authorized build, hardening, real Paseo dogfood and release; execution on main only; publication gated on successful evidence and npm login
Recommended release: 2.2.0 (the first npm release, not a rewrite of v2.1.0)
review: none

## Authorized execution and Paseo dogfood

The user's latest direction authorizes building and releasing after dogfooding
through the actual Paseo installation here, and cleaning up all superseded
workspaces/subagents. Presentation is now fast-forwarded onto main at `3cde577`;
the integration workspace and its two agents have been archived through Paseo.
Only main remains. Reuse existing DeepSeek audit helpers sequentially (models.csv
row deepseek-v4-1-flash, max); no new feature workspaces or delegated research.
Parent owns verification, live dogfood and publication; helpers cannot publish,
reload, archive or delegate. Retire helpers once their evidence is captured.

Execution order: guard regressions/fix -> exact tarball/host install and release
contract -> fresh build/full tests -> actual Paseo dogfood -> npm next -> actual
npm-source install -> latest and matching GitHub release -> final cleanup.
GitHub access is available; npm currently requires user login in the visible
`npm release login` Paseo terminal. Credentials never enter chat/repository.

Real dogfood matrix (record outcome + evidence, not just a test count):

| Case | Exercise through Paseo here | Evidence required |
| --- | --- | --- |
| D1 | Fresh agent receives preview/render tools; single-fact prompt stays text | Actual agent/tool history; no invented universal harness claim |
| D2 | Chart real repository/tool data; one useful visual, proper units/source | Actual calls, stored artifact and visual inspection |
| D3 | Flow/architecture including the built-in Pele report-graph path | Published HTML + graph assets/report; no global Pele assumption |
| D4 | Image-inspection, pipeline and incident-timeline showcase sources | Each published through the plugin; local controls/images, static capture and honest demo labels |
| D5 | Flow, inspector and filter interaction sources | Each published; live controls/keyboard/theme/reduced motion/reflow plus script-disabled fallback |
| D6 | Auto/iframe/static modes, interactive file link and native/report fallback | Real supported Paseo surfaces; separate actual device coverage from mounted tests |
| D7 | Same-turn/concurrent refusal, later-turn unchanged refusal, meaningful update | Actual adapter/agent attempts and refusal/success records; unit regressions additionally cover lifecycle races/null IDs |
| D8 | Image/report/metadata changes, missing images, ownership and legacy readback | Actual artifact results; no false nothing-changed refusal or authorization bypass |
| D9 | History reconstruction, refresh and one-card rendering | Real persisted history/UI observation; no duplicate codemode/card projection |
| D10 | Exact tarball production install, then exact published npm-source install | Isolated Paseo home, actual flags, version/integrity/readiness and preview/publish/readback |

Fresh test agents stay in the main workspace and are retired after recording
results. Do not expose unrelated user tabs/workspaces in public evidence. Parent
runs the existing e2e gates too, but they do not substitute for these live cases.
If a required physical client/provider/UI path cannot be exercised, mark it
blocked/untested and resolve the release claim with the user before publishing;
never silently count emulation or a component harness as native-device dogfood.

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

### Audit baseline (a8c3e4e, before presentation integration)

Historical audit run on 2026-10-24:
- `npm run typecheck`: PASS.
- `npm test`: 209 tests, 209 pass, 0 failures/skips/cancellations.
- `npm run check:bundles`: PASS; 15 client inputs, 23 server inputs, Pele server-only.
- `npm pack --dry-run --json`: 37 entries, 104,551 bytes packed, 374,863 unpacked.
- Current local CLI: Paseo 0.13.0-beta.2; Node v26.12.1. This does not prove the
  advertised Node 22.18/Paseo 0.12 minimums.
- Full deployed e2e, multi-harness natural triggering, macOS/native device behavior,
  and an actual npm-source install have NOT been freshly verified for this commit.

### Consolidation checkpoint

Presentation work was combined in the existing motion workspace at `6f7bdb6`:
README/showcase `9bdc5a4`, motion `b6bdc41`/`b8dffba`, package-name guidance
`b6cab1b`, and strict integrated link checks. Parent typecheck, **225/225 tests**
(zero skips/failures) and bundle checks pass (15 client / 24 server inputs). Main's
live source was not updated at that checkpoint and no plugin reload took place.
The user's subsequent release/cleanup instruction moved the combined history to
main at `3cde577` and retired integration. The correctness, install and support
gates below remain open; subsequent work is on main only.

## Release blockers and acceptance

### A. Close correctness holes in the new guard

Local code gate completed by `e3987a1` (2026-10-24): parent independently read the
reservation/fingerprint/tool/lifecycle implementation and ran **247/247 tests**,
zero failures/skips/cancellations, typecheck and bundle checks (15 client / 24
server inputs). Full private log: `/tmp/html-render-guard-full-tests.log`. Guard
helper archived after capturing its report. Live adapter/lifecycle dogfood remains
in D7, not inferred from these tests.

Comparison is deliberately exact over prepared HTML and published options, not
semantic equivalence: cosmetic changes can pass. Missing agent attribution warns
and skips guarding; unknown turn lifecycle warns and retains duplicate-only
checking. A successful durable save commits the guard even if a later interactive
path lookup fails; this avoids storing a duplicate on retry but can leave a failed
tool result. State is per-process, with 50 remembered publishes per key.

Historical audit findings, reproduced with fake rendering and a temporary
artifact store before this fix (no live plugin replacement):

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

Implementation checkpoint `907be95`–`e2e5732`: the prior missing-type failure was
reproduced using actual production flags/daemon. The SDK-owned
`PluginHandlerContext["paseo"]` type seam removes the direct client coupling.
An exact 72-entry candidate passed real isolated preview/publish/authorized
readback on Node 22.18/Paseo 0.12 and Node 26.12/Paseo 0.13.0-beta.2, including
true missing-browser errors. Parent inspected receipts and ran 253/253 tests,
zero skips/failures. Evidence is under `/tmp/hr-release-2.2.0/`.

That candidate is **superseded**, not a final publish artifact: parent reproduced
an unhandled spawn error for a bad explicit Chromium override and fixed it in
`793ae7c` (24/24 focused renderer tests, typecheck/bundles pass). Refresh tarball
and install evidence after that fix and final review corrections. Script CLI
resolution/negative diagnostics, actual npm-source acquisition, release-neutral
README wording and sandbox-capable CI remain to finish before live dogfood.

Historical blocker at the audit baseline: the packed package imports `PaseoApi` from `@getpaseo/client` in
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

The presentation lanes are consolidated and parent-tested; their scoped work
plan is `2026-10-24-showcase-and-interactivity.md`. The user has now authorized
release hardening and publication after real Paseo dogfood. Work is sequential
on main, not another pair of worktrees or an expansion of the package-list idea.
Publication remains conditional on the gates, authenticated access and evidence.

| Phase | Work | Responsibility | Location / dependency | Exit evidence |
| --- | --- | --- | --- | --- |
| 0. Recover | Preserve and retire superseded workspaces | Parent; complete | Main contains integration through 3cde577 | One worktree; commits preserved; integration + owned agents archived |
| 1. Stabilize | Guard races, fingerprints, lifecycle and attribution | Existing DeepSeek guard helper, then parent review | Main; first code task | Targeted regressions + parent verification |
| 2. Package | Exact install, dependencies, docs, support/version and CI | Existing DeepSeek npm helper, then parent review | Main; after phase 1, no overlapping writer | Production-only tarball compiles/renders; aligned contract |
| 3. Verify | Full suite/build/CI and real D1–D10 dogfood | Parent; test agents only as needed | Main and isolated install homes | Evidence manifest; no substitute tests counted as dogfood |
| 4. Launch | Push/tag, npm next, actual npm-source smoke, latest, GitHub release | Parent; interactive auth stays with user | Only after applicable pre-publication gates | Public integrity + fresh install; D10 npm-source result before promotion |
| 5. Close | Save results and retire finished agents | Parent | Main only | Clean main; no superseded workspaces/helpers |

Keep work sequential on main; no new feature lanes. Ownership boundaries:
- Guard helper: guard/tools/lifecycle/bridge and dedicated regressions only.
- Package helper: metadata/lockfile, type resolution, package/install checks,
  README/support docs, CI, changelog and agreed version bump; starts only after
  guard work has been reviewed. Parent owns live state and publication.
- Parent owns PROJECT-STATUS, this plan and final verification evidence.
- Helpers use verified models.csv row deepseek-v4-1-flash (ZDR, code/scout roles),
  thinking max, and cannot delegate. Re-check availability before a new dispatch.
- Chromium-heavy full suites run serially; helpers use focused regressions.
- Workspace archival is complete. Preserve commits and archive finished helpers
  after capturing their results; do not remove the main workspace.

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
