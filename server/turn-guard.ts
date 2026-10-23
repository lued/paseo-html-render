import { createHash } from "node:crypto";

/**
 * Structural turn guard. Prose alone cannot stop a second card: harnesses that
 * expose the tools behind codemode never put the tool descriptions in the
 * model's context, so "one card per turn" has to be enforced where the publish
 * actually happens.
 *
 * The state is deliberately in memory and per plugin instance. A daemon restart
 * forgets it, which is fine: this is a nudge with teeth, not a durability
 * boundary, and no card is ever refused because of stale disk state.
 */
export const MAX_CARDS_ENV = "PASEO_HTML_RENDER_MAX_CARDS_PER_TURN";
export const DEFAULT_MAX_CARDS_PER_TURN = 1;

/** Remembered publishes per key. Enough for a long session, bounded forever. */
export const MAX_REMEMBERED_PUBLISHES = 50;

export interface TurnGuardCheck {
  key: string;
  /** Normalized-HTML fingerprint from htmlFingerprint. */
  hash: string;
}

export type TurnGuardDecision =
  | { ok: true }
  | { ok: false; code: "duplicate"; message: string; artifactId: string };

export interface TurnGuardPublish {
  key: string;
  workspaceId: string;
  artifactId: string;
  hash: string;
  title: string;
}

export interface TurnGuard {
  /** Starts (or restarts) the counted turn. A null turn id means "unknown turn". */
  beginTurn(key: string, turnId: string | null): void;
  endTurn(key: string): void;
  /** Never records; the caller records only after a successful publish. */
  check(input: TurnGuardCheck): TurnGuardDecision;
  record(input: TurnGuardPublish): void;
}

export interface TurnGuardOptions {
  /** Successful publishes allowed per turn. 0 disables both refusals. */
  maxCardsPerTurn?: number;
  /** Injectable so tests can pin recorded timestamps. */
  now?: () => number;
}

interface RememberedPublish {
  artifactId: string;
  workspaceId: string;
  hash: string;
  title: string;
  recordedAt: number;
}

interface TurnState {
  id: string;
  publishes: number;
  lastArtifactId: string | null;
}

interface KeyState {
  /** Null until a turn_started event arrives, or after turn_ended. */
  turn: TurnState | null;
  /** Newest first, capped at MAX_REMEMBERED_PUBLISHES. */
  history: RememberedPublish[];
}

/**
 * A malformed value falls back to the guarded default instead of switching the
 * guard off by accident. Only an explicit 0 disables refusals.
 */
export function maxCardsPerTurn(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[MAX_CARDS_ENV]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_MAX_CARDS_PER_TURN;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) ? value : DEFAULT_MAX_CARDS_PER_TURN;
}

/**
 * The key is the agent, so two agents in one directory never share a card
 * budget. The adapter may predate agentId forwarding, so the caller directory
 * is the fallback; it degrades to the identical-content rule because no turn
 * was started for that key.
 */
export function guardKey(
  agentId: string | null | undefined,
  cwd: string | null | undefined,
): string {
  const id = typeof agentId === "string" ? agentId.trim() : "";
  if (id) return `agent:${id}`;
  const directory = typeof cwd === "string" ? cwd.trim() : "";
  return `cwd:${directory}`;
}

/**
 * Comments and whitespace runs do not change what the reader sees, so they must
 * not smuggle a duplicate past the guard. An unterminated comment hides the
 * rest of the document, so it is stripped to the end.
 */
function normalizeHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function htmlFingerprint(html: string): string {
  return createHash("sha256").update(normalizeHtml(html)).digest("hex");
}

/** Titles come from the model, so keep a refusal message one readable line. */
function describe(entry: RememberedPublish): string {
  const title = entry.title
    .replace(/\s+/g, " ")
    .replace(/"/g, "'")
    .trim()
    .slice(0, 120);
  return title ? `${entry.artifactId} ("${title}")` : entry.artifactId;
}

export function createTurnGuard(options: TurnGuardOptions = {}): TurnGuard {
  const limit = options.maxCardsPerTurn ?? DEFAULT_MAX_CARDS_PER_TURN;
  const now = options.now ?? Date.now;
  const states = new Map<string, KeyState>();

  const stateFor = (key: string): KeyState => {
    let state = states.get(key);
    if (!state) {
      state = { turn: null, history: [] };
      states.set(key, state);
    }
    return state;
  };

  return {
    beginTurn(key, turnId) {
      const state = stateFor(key);
      const id = typeof turnId === "string" ? turnId.trim() : "";
      if (!id) {
        // Without an id we cannot tell two turns apart, so only the
        // identical-content rule stays in force for this key.
        state.turn = null;
        return;
      }
      // A repeated turn_started for the same turn must not reset the count,
      // otherwise a replayed event would re-open the turn for another card.
      if (state.turn?.id !== id) state.turn = { id, publishes: 0, lastArtifactId: null };
    },

    endTurn(key) {
      const state = states.get(key);
      if (!state) return;
      state.turn = null;
      // Nothing published and no history: drop the key instead of leaking one
      // entry per turn that never rendered a card.
      if (state.history.length === 0) states.delete(key);
    },

    check(input) {
      if (limit === 0) return { ok: true };
      const state = states.get(input.key);
      if (!state) return { ok: true };

      // The content rule outranks the count rule: "nothing changed" is the more
      // useful correction when both apply, and it also covers unknown turns.
      const remembered = state.history.find((entry) => entry.hash === input.hash);
      if (remembered) {
        return {
          ok: false,
          code: "duplicate",
          artifactId: remembered.artifactId,
          message:
            `Nothing changed: this HTML matches ${describe(remembered)} already published. ` +
            "Keep the new detail in your reply instead of publishing an identical card.",
        };
      }

      const turn = state.turn;
      if (turn && turn.publishes >= limit && turn.lastArtifactId !== null) {
        return {
          ok: false,
          code: "duplicate",
          artifactId: turn.lastArtifactId,
          message:
            `This turn already published ${turn.publishes} card${turn.publishes === 1 ? "" : "s"} ` +
            `(${turn.lastArtifactId}); the per-turn limit is ${limit}. ` +
            "Keep the rest in your reply instead of publishing another card.",
        };
      }

      return { ok: true };
    },

    record(input) {
      const state = stateFor(input.key);
      state.history.unshift({
        artifactId: input.artifactId,
        workspaceId: input.workspaceId,
        hash: input.hash,
        title: input.title,
        recordedAt: now(),
      });
      if (state.history.length > MAX_REMEMBERED_PUBLISHES) {
        state.history.length = MAX_REMEMBERED_PUBLISHES;
      }
      const turn = state.turn;
      if (turn) {
        turn.publishes += 1;
        turn.lastArtifactId = input.artifactId;
      }
    },
  };
}
