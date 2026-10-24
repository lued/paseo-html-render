# Common-package list and agent-led design

Date: 2026-10-24
Status: lightweight name catalog + agent instructions; no selector subsystem
review: none

## Decision

Maintain our own small list of common visual npm package names. Have the agent
match it against one global npm inventory, then use suitable installed matches
and its own design judgment. The list is a starting point, not an allowlist or a
claim that every listed package works directly in the browser sandbox.

The earlier registry/profile architecture remains withdrawn. No discovery
service, admission pipeline, recipe API, renderer or new dependency is planned.

## Efficient lookup

1. Run `npm ls --global --depth=0 --json` once per agent session.
2. Compare the top-level `dependencies` names with `COMMON_VISUAL_PACKAGES` in
   `shared/visual-packages.ts`; retain the installed versions from the inventory.
3. Use the installed matches that help the task. Inspect relevant APIs/requirements
   as needed; use `npm root --global` only when a package's location is needed.
4. Reuse the inventory rather than checking availability one package at a time.
   Other available packages and plain HTML/CSS/SVG remain options. Do not install
   packages unless asked.

The checked-in list contains names grouped by purpose: charts, motion, diagrams,
icons, spatial content, animation playback and component tooling. There are no
version gates, scores, profiles or package-specific implementations.

## Small implementation and evidence

- Add `shared/visual-packages.ts` and embed its compact hints plus the lookup
  instructions in the existing long-form and HTML descriptions in `shared/policy.ts`.
- Keep the 244-character summary, render brakes, motion examples and runtime/CSP
  unchanged. This is agent guidance, not automatic plugin-side package loading.
- Parent checks: 11/11 policy tests, typecheck, bundle checks and diff checks pass.
- A real inventory of this shell's active npm global prefix returned three package
  names and no matches from the visual list. No packages were installed.

Committed as b6cab1b in the existing motion worktree, now combined with the
README/showcase lane. Integrated code at 6f7bdb6 passes 225/225 tests, typecheck
and bundle checks. No new workspace, agent, live reload, push or publication.

Earlier research is [background only](../research/2026-10-24-visual-toolkit-selector.md).
