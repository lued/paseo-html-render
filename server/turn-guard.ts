import { createHash } from "node:crypto";

/**
 * Structural turn guard. Prose alone cannot stop a second card: harnesses that
 * expose the tools behind codemode never put the tool descriptions in the
 * model's context, so "one card per turn" has to be enforced where the publish
 * actually happens.
 *
 * Accounting is reserve/commit/release. `captureTurn` snapshots the active turn
 * at call entry and `reserve` atomically checks and holds one slot, so two
 * simultaneous publishes cannot both pass a one-card budget. A publish that
 * finishes after the turn ended still commits to the turn it captured, never
 * to a later turn.
 *
 * The state is deliberately in memory and per plugin instance. A daemon restart
 * forgets it, which is fine: this is a nudge with teeth, not a durability
 * boundary, and no card is ever refused because of stale disk state.
 */
export const MAX_CARDS_ENV = "PASEO_HTML_RENDER_MAX_CARDS_PER_TURN";
export const DEFAULT_MAX_CARDS_PER_TURN = 1;

/** Remembered publishes per key. Enough for a long session, bounded forever. */
export const MAX_REMEMBERED_PUBLISHES = 50;

export const GUARD_UNATTRIBUTED_WARNING =
  "Agent attribution is unavailable for this publish, so the duplicate/turn guard was not applied. " +
  "Reconnect the agent to load the current adapter.";

export const GUARD_UNKNOWN_TURN_WARNING =
  "The per-turn limit is inactive because this publish could not be tied to a counted turn; " +
  "duplicate detection still applies.";

export interface TurnTicket {
  readonly key: string;
}

export interface TurnGuardReservation {
  readonly key: string;
}

export type TurnGuardDecision =
  | { ok: true; reservation: TurnGuardReservation; warning?: string }
  | { ok: false; code: "duplicate"; message: string; artifactId?: string };

export interface TurnGuardPublish {
  workspaceId: string;
  artifactId: string;
  title: string;
}

export interface TurnGuard {
  /** Starts (or restarts) the counted turn. A null turn id creates a synthetic turn. */
  beginTurn(key: string, turnId: string | null): void;
  /**
   * Ends the active turn. When a turn id is supplied, a known turn only closes
   * on its own id; a synthetic turn closes on any end because it has no host id
   * to compare. Omitting the id keeps the legacy unconditional close for tests.
   */
  endTurn(key: string, turnId?: string | null): void;
  /** Snapshots the active turn before asynchronous preparation. */
  captureTurn(key: string): TurnTicket | null;
  /** Atomically checks and holds one slot for this ticket. Consumes the ticket. */
  reserve(ticket: TurnTicket, hash: string): TurnGuardDecision;
  commit(reservation: TurnGuardReservation, publish: TurnGuardPublish): void;
  release(reservation: TurnGuardReservation): void;
  /** Drops an unconsumed ticket after image preparation or another early failure. */
  abandon(ticket: TurnTicket): void;
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
  /** True for a turn created from a null lifecycle id. */
  synthetic: boolean;
  publishes: number;
  /** Reserved publishes that have not committed or released yet. */
  pending: number;
  lastArtifactId: string | null;
}

interface KeyState {
  /** Null until a turn_started event arrives, or after turn_ended. */
  turn: TurnState | null;
  /** Newest first, capped at MAX_REMEMBERED_PUBLISHES. */
  history: RememberedPublish[];
  /** Hashes with an in-flight reservation, so identical concurrent publishes refuse. */
  pendingHashes: Map<string, number>;
  /** Tickets captured but not yet reserved or abandoned. */
  captures: number;
  /** Counter for synthetic turns created from null lifecycle IDs. */
  synthetic: number;
}

interface TicketInternal {
  state: KeyState;
  turn: TurnState | null;
}

interface ReservationInternal {
  state: KeyState;
  turn: TurnState | null;
  hash: string;
  settled: boolean;
}

const LOCAL_TURN_PREFIX = "local-turn:";

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
 * The key is the agent. There is deliberately no cwd fallback: two agents can
 * share a directory, and a guessed key would either merge their budgets or
 * invent an agent identity. A missing agent id is an explicit degraded publish.
 */
export function guardKey(agentId: string | null | undefined): string | null {
  const id = typeof agentId === "string" ? agentId.trim() : "";
  return id ? `agent:${id}` : null;
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

function newTurn(id: string, synthetic: boolean): TurnState {
  return { id, synthetic, publishes: 0, pending: 0, lastArtifactId: null };
}

function normalizeTurnId(turnId: string | null): string | null {
  const id = typeof turnId === "string" ? turnId.trim() : "";
  return id || null;
}

/**
 * The full observable publish identity. Exact prepared HTML bytes are used on
 * purpose: comments, whitespace, preformatted text and script strings remain
 * meaningful, and a changed local raster image is already a different data URI.
 * Report and frame metadata are included so a changed native report or mode is
 * not misreported as "nothing changed".
 */
export interface PublishFingerprintInput {
  html: string;
  workspaceId: string;
  title: string;
  height: number;
  summary: string | null;
  renderMode: string;
  report?: unknown;
}

function hashPart(hash: ReturnType<typeof createHash>, value: string): void {
  // Length-prefix each part so adjacent fields cannot be made ambiguous.
  hash.update(String(Buffer.byteLength(value, "utf8")));
  hash.update(":");
  hash.update(value);
}

export function publishFingerprint(input: PublishFingerprintInput): string {
  const hash = createHash("sha256");
  hash.update("paseo-html-render:publish:v1\0");
  hashPart(hash, input.workspaceId);
  hashPart(hash, input.title);
  hashPart(hash, String(input.height));
  hashPart(hash, input.summary ?? "");
  hashPart(hash, input.renderMode);
  hashPart(hash, JSON.stringify(input.report ?? null));
  hashPart(hash, input.html);
  return hash.digest("hex");
}

export function createTurnGuard(options: TurnGuardOptions = {}): TurnGuard {
  const limit = options.maxCardsPerTurn ?? DEFAULT_MAX_CARDS_PER_TURN;
  const now = options.now ?? Date.now;
  const states = new Map<string, KeyState>();
  const tickets = new WeakMap<TurnTicket, TicketInternal>();
  const reservations = new WeakMap<TurnGuardReservation, ReservationInternal>();

  const stateFor = (key: string): KeyState => {
    let state = states.get(key);
    if (!state) {
      state = {
        turn: null,
        history: [],
        pendingHashes: new Map(),
        captures: 0,
        synthetic: 0,
      };
      states.set(key, state);
    }
    return state;
  };

  const maybeDrop = (key: string, state: KeyState): void => {
    if (
      state.turn === null &&
      state.history.length === 0 &&
      state.captures === 0 &&
      state.pendingHashes.size === 0
    ) {
      states.delete(key);
    }
  };

  const releaseCapture = (state: KeyState): void => {
    state.captures = Math.max(0, state.captures - 1);
  };

  const releasePending = (state: KeyState, turn: TurnState | null, hash: string): void => {
    if (turn) turn.pending = Math.max(0, turn.pending - 1);
    const count = state.pendingHashes.get(hash) ?? 0;
    if (count <= 1) state.pendingHashes.delete(hash);
    else state.pendingHashes.set(hash, count - 1);
  };

  const countRefusal = (turn: TurnState): TurnGuardDecision => {
    const parts: string[] = [];
    if (turn.publishes > 0) {
      const cards = `${turn.publishes} card${turn.publishes === 1 ? "" : "s"}`;
      parts.push(
        turn.lastArtifactId
          ? `already published ${cards} (${turn.lastArtifactId})`
          : `already published ${cards}`,
      );
    }
    if (turn.pending > 0) {
      const cards = `${turn.pending} card${turn.pending === 1 ? "" : "s"}`;
      parts.push(`already has ${cards} being published`);
    }
    const detail = parts.length > 0 ? parts.join(" and ") : "has no remaining card capacity";
    return {
      ok: false,
      code: "duplicate",
      ...(turn.publishes > 0 && turn.lastArtifactId ? { artifactId: turn.lastArtifactId } : {}),
      message:
        `This turn ${detail}; the per-turn limit is ${limit}. ` +
        "Keep the rest in your reply instead of publishing another card.",
    };
  };

  return {
    beginTurn(key, turnId) {
      const state = stateFor(key);
      const id = normalizeTurnId(turnId);
      const current = state.turn;

      if (!current) {
        state.turn = newTurn(
          id ?? `${LOCAL_TURN_PREFIX}${++state.synthetic}`,
          id === null,
        );
        return;
      }

      // A null event never reopens a budget while a turn is active. The host's
      // null-ID providers still get a counted synthetic turn from the branch
      // above, and endTurn is the only reset for that synthetic turn.
      if (id === null) return;

      if (current.id === id) return;

      // A synthetic turn that later gains a real id is the same lifecycle turn;
      // keep its count rather than reopening the budget on the identity change.
      if (current.synthetic) {
        current.id = id;
        current.synthetic = false;
        return;
      }

      state.turn = newTurn(id, false);
    },

    endTurn(key, turnId) {
      const state = states.get(key);
      if (!state?.turn) return;
      if (turnId !== undefined && !state.turn.synthetic) {
        const id = normalizeTurnId(turnId);
        // A late known end for an earlier turn must not clear the new turn, and
        // a null end cannot identify a known turn.
        if (id === null || id !== state.turn.id) return;
      }
      state.turn = null;
      maybeDrop(key, state);
    },

    captureTurn(key) {
      if (limit === 0) return null;
      const state = stateFor(key);
      state.captures += 1;
      const ticket: TurnTicket = Object.freeze({ key });
      tickets.set(ticket, { state, turn: state.turn });
      return ticket;
    },

    reserve(ticket, hash) {
      const internal = tickets.get(ticket);
      if (!internal) throw new Error("Turn ticket was already consumed");
      tickets.delete(ticket);
      const { state, turn } = internal;
      releaseCapture(state);

      const remembered = state.history.find((entry) => entry.hash === hash);
      if (remembered) {
        return {
          ok: false,
          code: "duplicate",
          artifactId: remembered.artifactId,
          message:
            `Nothing changed: this card content and options match ${describe(remembered)} already published. ` +
            "Keep the new detail in your reply instead of publishing an identical card.",
        };
      }

      if ((state.pendingHashes.get(hash) ?? 0) > 0) {
        return {
          ok: false,
          code: "duplicate",
          message:
            "An identical card is already being published in this turn. " +
            "Wait for it to finish instead of publishing another card.",
        };
      }

      if (turn) {
        if (turn.publishes + turn.pending >= limit) {
          return countRefusal(turn);
        }
        turn.pending += 1;
      }

      state.pendingHashes.set(hash, (state.pendingHashes.get(hash) ?? 0) + 1);
      const reservation: TurnGuardReservation = Object.freeze({ key: ticket.key });
      reservations.set(reservation, { state, turn, hash, settled: false });
      return {
        ok: true,
        reservation,
        ...turn === null ? { warning: GUARD_UNKNOWN_TURN_WARNING } : {},
      };
    },

    commit(reservation, publish) {
      const internal = reservations.get(reservation);
      if (!internal) throw new Error("Unknown turn reservation");
      if (internal.settled) return;
      internal.settled = true;
      reservations.delete(reservation);
      const { state, turn, hash } = internal;
      releasePending(state, turn, hash);

      state.history.unshift({
        artifactId: publish.artifactId,
        workspaceId: publish.workspaceId,
        hash,
        title: publish.title,
        recordedAt: now(),
      });
      if (state.history.length > MAX_REMEMBERED_PUBLISHES) {
        state.history.length = MAX_REMEMBERED_PUBLISHES;
      }

      // Charge the turn captured at call entry, even if the lifecycle has moved
      // on. A later turn must never inherit this publish.
      if (turn) {
        turn.publishes += 1;
        turn.lastArtifactId = publish.artifactId;
      }
    },

    release(reservation) {
      const internal = reservations.get(reservation);
      if (!internal) return;
      reservations.delete(reservation);
      if (internal.settled) return;
      internal.settled = true;
      releasePending(internal.state, internal.turn, internal.hash);
      maybeDrop(reservation.key, internal.state);
    },

    abandon(ticket) {
      const internal = tickets.get(ticket);
      if (!internal) return;
      tickets.delete(ticket);
      releaseCapture(internal.state);
      maybeDrop(ticket.key, internal.state);
    },
  };
}
