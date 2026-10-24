# Two authorized lanes: README/showcase and tasteful interactivity

Date: 2026-10-24
Status: both lanes consolidated and parent-tested in the existing motion workspace; promotion to main not performed
review: none

## Outcome

Help a first-time visitor understand why HTML Render improves Paseo, with a short
README and real examples. Show that useful visuals can be images, charts, diagrams
and interactions instead of generic nested panels. Demonstrate tasteful motion
without changing the plugin's security boundary, adding runtime dependencies, or
making screenshots/native output depend on JavaScript.

This expands the presentation phase of `2026-10-24-public-npm-release.md` only.
Guard and npm hardening stay tracked and must pass before publication. No publish,
push, release tag, live plugin reload/replacement, cleanup or archive is authorized.

## Decisions

- Use two Paseo-managed worktree workspaces from main at `a8c3e4e`; one visible
  DeepSeek child per lane. No git-only hidden workspace and no further delegation.
- Preserve sandbox/CSP. External script/CDN imports, network resources and
  `file://` are blocked today. A library being browser-loaded rather than an npm
  dependency does not remove the security or offline/reproducibility cost.
- Start with browser-native CSS, SVG, DOM and inline JS. No Three.js or animation
  dependency in this batch. If a future use case warrants vendored code, it needs
  a separate size/license/security proposal, not an exception to the CSP.
- Motion must convey state or a relationship; no always-on particle wallpaper,
  distracting bouncing cards or gratuitous 3D. Respect reduced motion, keyboard
  focus, and a pause option for any continuous demonstration.
- HTML must be useful before any script runs. Screenshots execute no page JS;
  native clients do not run the live HTML. JS-enhanced controls have visible
  meaningful default content and no fake functional claim on static surfaces.
- Clickable entities mean local diagram/image/chart controls unless an actual
  supported host navigation API has been verified. Never imply access to Paseo
  workspace/agent controls or arbitrary host actions from inside the sandbox.
- Use real captures. A standalone demo is labelled as such; it is not a fabricated
  screenshot of the entire Paseo app. Use synthetic data only when clearly labelled
  as demo data; actual claims/charts require a real recorded source.
- The README remains short. Put advanced examples and browser-platform caveats in
  a gallery and interaction guide; link from the front page.
- The existing 244-character policy summary is not changed in this lane. Its
  shared-budget correctness issue belongs to release hardening. More motion is
  a choice when helpful, never a universal output requirement.

## Lane ownership and dispatch

| Lane | Branch / workspace | Model row | Owns |
| --- | --- | --- | --- |
| README/showcase | `feat/readme-showcase`, `wks_29d15b37f3fdc73c` | deepseek-v4-1-flash (code/scout, max) | README.md; docs/showcase.md; docs/images/showcase/; examples/showcase/; tests/showcase-docs.test.ts |
| Motion/interactivity | `feat/motion-interactivity`, `wks_09ccca9fd2f2d541` | deepseek-v4-1-flash (code/scout, max) | shared/policy.ts; shared/visual-packages.ts (small name list requested by user); tests/policy.test.ts; docs/interactivity.md; examples/interactive/; scripts/capture-interactivity.mjs; tests/interactivity-examples.test.ts; tests/helpers/browser.ts (optional reduced-motion emulation only, added at parent verification) |

Both lanes can run in parallel. No overlapping ownership. README may point to
`docs/interactivity.md` as the frozen cross-lane link, but does not edit it; the
motion lane does not edit README or the showcase assets. Existing runtime files,
package.json/lockfile, SECURITY.md, shared/identity.ts, changelog and CI are outside
these children; request the orchestrator for any necessary seam change.

Each child first inspects the relevant contracts and local capture tooling, then
implements inside its ownership. Stop and ask the parent if a claim needs new
runtime permissions, an unsupported host feature, a dependency, or an installation
that changes the live daemon. No feature scope expansion just to make a prettier
README. Commit only owned files on the branch; no merge or push.

### README lane acceptance

1. First screen: benefit, actual Paseo image if available, current truthful install
   path, prerequisites. npm is not yet published; don't present an unavailable
   command as a working install.
2. Three to four strong, copyable natural prompts and visual examples cover image
   inspection, a diagram/flow, local clickable entities, and animated media or
   state changes. Preserve a concise top-level README rather than a tutorial wall.
3. Showcase pages are self-contained, responsive and use no remote assets. Capture
   small reproducible PNG/GIF assets when the existing toolchain permits it; keep
   source and capture provenance. Do not claim a GIF exists if capture is blocked.
4. State live web/desktop vs static preview/native differences. Explain publish
   above reply plus the interactive file link. No assertion that every Paseo UI
   feature is callable by the embedded document.
5. Readme/gallery image and link paths resolve in the combined tree (the one
   interactivity guide is provided by lane 2); total added binary assets <=2 MiB.
6. No personal report data, secrets, absolute machine paths, fake screenshots or
   unsupported feature claims. Targeted tests/typecheck pass.

### Motion lane acceptance

1. Two to three compelling self-contained examples: e.g. click-to-explain SVG flow,
   image before/after inspector, data view filter with a restrained transition.
   Prefer real usefulness over gadget variety. No forced card-grid aesthetic.
2. Static markup is fully readable with JS disabled. At least one local control
   produces a tested state change when JS runs in the existing sandbox.
3. Reduced-motion mode removes nonessential motion; keyboard users can operate the
   controls; no continuous animation without pause/stop support. Theme-aware and
   reflow tested at narrow and wide widths with no horizontal overflow.
4. Existing CSP/frame sandbox is used for a test harness. Remote resources remain
   blocked, no external library/download, no use of unsafe eval or host privileges.
5. Update long-form HTML/render guidance for form fit, purposeful optional motion,
   static-first design and self-contained execution; preserve summary and its
   one-card/brake contract and existing chart/layout requirements.
6. Tests prove static fallback, live interaction and reduced motion. Parent
   verification found the initial tests set data-motion directly; add actual CDP
   prefers-reduced-motion emulation before page scripts to verify the preference
   hook, not just the CSS test switch. The motion lane may extend
   tests/helpers/browser.ts with that one optional setting. Add capture tooling
   only if needed, reuse existing browser/renderer tooling, no dependency.

## Orchestrator acceptance and monitoring

- Track workspace/agent IDs, branch/base/head, file scope, last reported check,
  blocker and next action in `docs/PROJECT-STATUS.md`.
- Completion/error/permission notifications wake the parent. Inspect actual diffs
  and test evidence on completion; do not treat a child's success claim as proof.
  Check active lane state when new ideas arrive, but don't repeatedly poll a
  running child for status or promise unattended background monitoring forever.
- Intake ideas as queued candidates with a lane and next action. Steer a running
  child only when compatible with its owned files; queue conflicting scope.
- Do not create one workspace per stray idea; use a workspace for a coherent,
  independently testable change. Additional subagents in a workspace require
  disjoint tasks or read-only roles to avoid shared checkout collisions.
- Run targeted worker tests; orchestrator runs full suite/bundle checks serially
  after integration, and visually examines the rendered examples.
- Integration is a separate decision after both diffs are ready. Resolve link and
  asset dependencies together; do not publish either branch directly.
- Retain both old merged worktrees and these active ones until cleanup approved.

## Returned work and parent acceptance

- Motion commits: b6bdc41 and b8dffba; package-name hints/instructions: b6cab1b.
  README/showcase: 9bdc5a4. Parent combined the branches in the existing motion
  workspace and tightened link checks in 6f7bdb6. No new workspace was created.
- Parent independently inspected README/gallery/source/captures; 42/42 targeted
  showcase/image/document tests passed. Showcase binaries: 11 files, 1,264,689
  bytes, below the 2 MiB budget.
- Integrated verification: typecheck PASS; npm test **225/225 PASS**, zero skips;
  bundle checks PASS (15 client / 24 server inputs, Pele server-only). All local
  README/gallery links must now resolve; no cross-lane exemption remains.
- All three motion examples derive reduced-motion state from emulated matchMedia.
  The preference test is top-level with shared CSP; separate tests cover sandbox,
  keyboard and 390/1024 layouts. This is not a host OS-preference end-to-end test.
- Motion capture hashes/dimensions match; six PNGs total 224,555 bytes. The
  244-character summary, runtime/CSP and dependencies remain unchanged.
- Work is consolidated locally, not promoted to main or the live plugin. No push,
  reload, publication or workspace archival. Guard/npm release gates remain open.


## Stop conditions

If a demo cannot work under current CSP/static-preview/native constraints, report
that limitation and propose a safe substitute. If binary capture tooling is
unavailable, provide tested HTML plus explicit pending-capture status. Never
weaken sandbox, invent evidence, install packages globally, or replace the live
plugin to satisfy presentation goals.
