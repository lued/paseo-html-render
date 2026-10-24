# Global-package design guidance: research disposition

Date: 2026-10-24
Status: earlier selector architecture withdrawn per user direction

## What changed

The research expanded a request for intelligent use of existing global packages
into a project-specific registry, three initial profiles, recipes and verification
infrastructure. That was more scope than requested. Those recommendations are
not an active plan and no candidate library was selected for implementation.

The replacement is [a small package-name list plus agent guidance](../plans/2026-10-24-visual-toolkit-selector.md):
run one npm global inventory, match it against our common visual package names,
and use suitable installed matches with design judgment based on the task and
audience. The list is a starting point, not an allowlist; other available packages
remain options. No classifier or profile registry is required.

## Useful background only

- A package name or UI-related keyword does not establish what it supplies.
  Read the relevant package documentation when using it; do not build a general
  classifier just to make that decision.
- Existing sandbox and static-preview behavior remain runtime facts. Guidance
  does not itself add package loading, change CSP or make scripts run in static
  captures.
- No new packages were installed and no library-support subsystem was implemented.
  The completed motion examples use native browser features and remain separate.

The researcher's full comparison remains in its Paseo conversation,
agent `3fde493a-f3ba-4a79-85ee-25573ec083cd`, if a concrete future task needs it.
There is no pending library spike or three-profile adoption task from this work.
