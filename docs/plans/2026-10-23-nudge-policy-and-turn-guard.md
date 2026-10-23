# Nudge policy single source, and a structural turn guard

Date: 2026-10-23
Status: executed (main, 2026-10-23)

## Goal

Make the plugin's "when to render" guidance survive every harness, and stop the
duplicate-card behaviour structurally instead of by prose. Charts improve as a
side effect of the policy rewrite, not as a new renderer.

## Findings that drive the plan

- Harness matrix: claude, codex and opencode declare the tools directly, so the
  `tools/list` descriptions are in the model's context. Pi exposes them under
  `codemode`, so **no tool description reaches the model**, and the only text it
  sees is the first line of the MCP `instructions`, hard-capped at 250 chars
  (`pi/dist/extensions/mcp/index.js:78`, `serverSummary` takes the first line).
- `alwaysLoad: true` (`server/contribute.ts:230`) is honoured only by the Claude
  provider (`@getpaseo/protocol/agent-types.d.ts:26-29`). `docs/verification.md:120`
  and `docs/t3-parity-quality-matrix.md:208` claim otherwise and are wrong.
- The current first instruction line is 325 chars, so its negative rule ("Answer
  in text only for one fact…") is silently truncated away on pi.
- `--chart-1` … `--chart-6` exist (`shared/html-document.ts:266`) but are not
  mentioned in `RENDER_DESCRIPTION`, and there is no chart fit rule anywhere.
- `PASEO_AGENT_ID` is already in every agent process env (`agent-manager.js:3824`),
  so per-agent state needs no host change. `agent.turn_started` / `agent.turn_ended`
  are already consumed by this plugin.

## Decisions

1. **One policy module, two renderings.** `shared/policy.ts` holds the policy once,
   projected into (a) a ≤250-character single-line summary that must stand alone,
   and (b) the long form used for tool descriptions. A test enforces the budget and
   the presence of each rule in both renderings, so neither copy can rot.
   Rejected: per-provider policy variants. They would let the copies drift and the
   summary is the only common denominator anyway.
2. **The summary carries the brake.** "One card per turn, not every reply" goes into
   the 250 chars, because prose is the only lever pi has.
3. **Refuse a second card in a turn before rendering.** The guard runs ahead of the
   renderer, so a refused card costs nothing. It is an error result with code
   `duplicate`, not a thrown render failure, and its message names the existing
   artifactId so the model can course-correct.
4. **Exact-duplicate detection across turns.** Normalized-HTML hash per agent; a
   byte-for-byte re-publish of the same content is refused with a pointer to the
   existing card. In-memory only (a daemon restart clears it); documented.
5. **No card identity/revision work here.** `cardId`, revisions and the meaningful-
   change gate are item 3 of the plan and would collide with these files. The
   refusal message therefore must not promise editing.
6. **`agentId` travels with the bridge request** instead of guessing from `cwd`.
   `cwd` stays as the fallback key so the guard still works against an older adapter.

## Tasks

Both tasks run in parallel in separate worktrees, on one live model row
(`deepseek-v4-1-flash`, zdr, `max_concurrent: 12`). File ownership is disjoint:

| Task | Owner files | Model |
| --- | --- | --- |
| A. Policy single source | `shared/policy.ts` (new), `server/adapter-source.ts`, `tests/policy.test.ts` (new), `tests/bridge.test.ts`, `tests/identity.test.ts`, `scripts/trigger-eval.mjs`, `docs/verification.md`, `docs/t3-parity-quality-matrix.md` | `deepseek-v4-1-flash` |
| B. Turn guard | `server/turn-guard.ts` (new), `server/bridge.ts`, `server/tools.ts`, `server/contribute.ts`, `tests/turn-guard.test.ts` (new), `tests/tools.test.ts` | `deepseek-v4-1-flash` |

Interface contract frozen for both:

- adapter → daemon bridge request gains `agentId: process.env.PASEO_AGENT_ID || ""`
  (A adds the sender, B consumes it and falls back to `cwd`).
- `ToolContext` gains `agentId?: string` (B).
- Duplicate refusal: error result, code `duplicate`, message names the artifactId,
  and never throws a render failure. Escape hatch for tests:
  `PASEO_HTML_RENDER_MAX_CARDS_PER_TURN` (default `1`).

## Acceptance checks (run by the orchestrator after integration)

1. `npm run typecheck` passes.
2. `npm test` passes (baseline is 178 tests; new tests only add).
3. `npm run check:bundles` passes.
4. `node -e` assertion that the summary projection is ≤250 chars, one line, and
   contains the render-when, text-otherwise and one-card-per-turn rules.
5. Manual read of `git diff main` for: adapter template still free of backticks and
   `${`, placeholder injection still uses the `() =>` replace form, no new deps, no
   changes outside the owned file lists.
6. `npm run check:trigger` is documented as a manual, model-dependent check and is
   not required to pass in this change (it spawns real agents).

Not verified here: end-to-end behaviour of an installed plugin. The installed copy
points at this checkout and is live; the workers must not run
`paseo plugin install`, `paseo plugin reload`, or start agents against it.

## Review

`review: none` — the only review row (`gpt-6-1-sol`) is currently stale in
`models.csv`, and this change is prose plus one in-memory state machine with tests.
