import assert from "node:assert/strict";
import test from "node:test";
import {
  createTurnGuard,
  DEFAULT_MAX_CARDS_PER_TURN,
  GUARD_UNKNOWN_TURN_WARNING,
  guardKey,
  MAX_CARDS_ENV,
  MAX_REMEMBERED_PUBLISHES,
  maxCardsPerTurn,
  publishFingerprint,
  type PublishFingerprintInput,
  type TurnGuard,
  type TurnGuardDecision,
} from "../server/turn-guard.ts";

const KEY = "agent:agent_a";
const BASE: Omit<PublishFingerprintInput, "html"> = {
  workspaceId: "wks_test",
  title: "Card",
  height: 200,
  summary: null,
  renderMode: "auto",
  report: null,
};

function fingerprint(html: string, overrides: Partial<PublishFingerprintInput> = {}): string {
  return publishFingerprint({ ...BASE, html, ...overrides });
}

function refused(decision: TurnGuardDecision): Extract<TurnGuardDecision, { ok: false }> {
  assert.equal(decision.ok, false, "expected a duplicate refusal");
  return decision as Extract<TurnGuardDecision, { ok: false }>;
}

function reserve(guard: TurnGuard, key: string, html: string, overrides: Partial<PublishFingerprintInput> = {}): TurnGuardDecision {
  const ticket = guard.captureTurn(key);
  assert.ok(ticket, "expected a turn ticket");
  return guard.reserve(ticket, fingerprint(html, overrides));
}

function commit(guard: TurnGuard, decision: TurnGuardDecision, artifactId: string, title = "Card"): void {
  assert.ok(decision.ok);
  guard.commit(decision.reservation, { workspaceId: "wks_test", artifactId, title });
}

function reserveAndCommit(guard: TurnGuard, key: string, artifactId: string, html: string): void {
  commit(guard, reserve(guard, key, html), artifactId);
}

test("a second card in one turn is refused and names the existing artifact", () => {
  const guard = createTurnGuard();
  guard.beginTurn(KEY, "turn-1");
  reserveAndCommit(guard, KEY, "art_one", "<h1>one</h1>");

  const decision = refused(reserve(guard, KEY, "<h1>two</h1>"));
  assert.equal(decision.code, "duplicate");
  assert.equal(decision.artifactId, "art_one");
  assert.match(decision.message, /per-turn limit is 1/);
  assert.match(decision.message, /art_one/);
  assert.match(decision.message, /Keep the rest in your reply/);
});

test("a later turn reopens the card budget", () => {
  const guard = createTurnGuard();
  guard.beginTurn(KEY, "turn-1");
  reserveAndCommit(guard, KEY, "art_one", "<h1>one</h1>");
  guard.beginTurn(KEY, "turn-2");
  const decision = reserve(guard, KEY, "<h1>two</h1>");
  assert.ok(decision.ok);
  guard.release(decision.reservation);
});

test("identical publish identity is refused across turns with a nothing-changed message", () => {
  const guard = createTurnGuard();
  guard.beginTurn(KEY, "turn-1");
  reserveAndCommit(guard, KEY, "art_one", "<h1>same</h1>");
  guard.endTurn(KEY);
  guard.beginTurn(KEY, "turn-2");

  const decision = refused(reserve(guard, KEY, "<h1>same</h1>"));
  assert.equal(decision.artifactId, "art_one");
  assert.match(decision.message, /Nothing changed/);
  assert.match(decision.message, /art_one/);
});

test("a null turn id creates a counted synthetic turn", () => {
  const guard = createTurnGuard();
  guard.beginTurn(KEY, null);
  reserveAndCommit(guard, KEY, "art_one", "<h1>one</h1>");

  const decision = refused(reserve(guard, KEY, "<h1>two</h1>"));
  assert.match(decision.message, /per-turn limit is 1/);
});

test("a repeated null begin cannot reopen an active synthetic turn", () => {
  const guard = createTurnGuard();
  guard.beginTurn(KEY, null);
  reserveAndCommit(guard, KEY, "art_one", "<h1>one</h1>");
  guard.beginTurn(KEY, null);

  assert.equal(refused(reserve(guard, KEY, "<h1>two</h1>")).code, "duplicate");
});

test("end then a null begin opens a fresh counted turn", () => {
  const guard = createTurnGuard();
  guard.beginTurn(KEY, null);
  reserveAndCommit(guard, KEY, "art_one", "<h1>one</h1>");
  guard.endTurn(KEY);
  guard.beginTurn(KEY, null);

  const decision = reserve(guard, KEY, "<h1>two</h1>");
  assert.ok(decision.ok);
  guard.release(decision.reservation);
});

test("a repeated known turn id cannot reset the count", () => {
  const guard = createTurnGuard();
  guard.beginTurn(KEY, "turn-1");
  reserveAndCommit(guard, KEY, "art_one", "<h1>one</h1>");
  guard.beginTurn(KEY, "turn-1");

  assert.equal(refused(reserve(guard, KEY, "<h1>two</h1>")).code, "duplicate");
});

test("null and known turn transitions preserve the active budget", () => {
  const guard = createTurnGuard();

  // Known turn, then an unidentified event for the same active lifecycle turn.
  guard.beginTurn(KEY, "turn-1");
  reserveAndCommit(guard, KEY, "art_one", "<h1>one</h1>");
  guard.beginTurn(KEY, null);
  assert.equal(refused(reserve(guard, KEY, "<h1>two</h1>")).code, "duplicate");

  // A synthetic turn that later gains a real id is still the same turn.
  guard.endTurn(KEY);
  guard.beginTurn(KEY, null);
  reserveAndCommit(guard, KEY, "art_two", "<h1>three</h1>");
  guard.beginTurn(KEY, "turn-2");
  assert.equal(refused(reserve(guard, KEY, "<h1>four</h1>")).code, "duplicate");

  // A different known id after an explicit end is a new turn.
  guard.endTurn(KEY);
  guard.beginTurn(KEY, "turn-3");
  const next = reserve(guard, KEY, "<h1>five</h1>");
  assert.ok(next.ok);
  guard.release(next.reservation);
});

test("a late end for an earlier known turn cannot clear the next turn", () => {
  const guard = createTurnGuard();
  guard.beginTurn(KEY, "turn-1");
  reserveAndCommit(guard, KEY, "art_one", "<h1>one</h1>");
  guard.endTurn(KEY, "turn-1");
  guard.beginTurn(KEY, "turn-2");

  // A delayed turn_ended for turn-1 arrives after turn-2 started.
  guard.endTurn(KEY, "turn-1");
  const first = reserve(guard, KEY, "<h1>two</h1>");
  assert.ok(first.ok);
  assert.equal(first.warning, undefined, "turn-2 must still be counted");
  commit(guard, first, "art_two");
  assert.equal(refused(reserve(guard, KEY, "<h1>three</h1>")).code, "duplicate");
});

test("a null end closes a synthetic turn but not a known turn", () => {
  const guard = createTurnGuard();

  guard.beginTurn(KEY, null);
  reserveAndCommit(guard, KEY, "art_one", "<h1>one</h1>");
  guard.endTurn(KEY, null);
  guard.beginTurn(KEY, null);
  const afterSynthetic = reserve(guard, KEY, "<h1>two</h1>");
  assert.ok(afterSynthetic.ok);
  guard.release(afterSynthetic.reservation);

  guard.endTurn(KEY);
  guard.beginTurn(KEY, "turn-1");
  reserveAndCommit(guard, KEY, "art_three", "<h1>three</h1>");
  guard.endTurn(KEY, null);
  assert.equal(refused(reserve(guard, KEY, "<h1>four</h1>")).code, "duplicate");
});

test("unknown lifecycle is an explicit degradation, not a counted turn", () => {
  const guard = createTurnGuard();
  const first = reserve(guard, KEY, "<h1>one</h1>");
  assert.ok(first.ok);
  assert.equal(first.warning, GUARD_UNKNOWN_TURN_WARNING);
  commit(guard, first, "art_one");

  // No turn means no count, but duplicate identity still applies.
  const second = reserve(guard, KEY, "<h1>two</h1>");
  assert.ok(second.ok);
  assert.equal(second.warning, GUARD_UNKNOWN_TURN_WARNING);
  guard.release(second.reservation);

  assert.equal(refused(reserve(guard, KEY, "<h1>one</h1>")).artifactId, "art_one");
});

test("a zero limit disables capture and both refusals", () => {
  const guard = createTurnGuard({ maxCardsPerTurn: 0 });
  guard.beginTurn(KEY, null);
  assert.equal(guard.captureTurn(KEY), null);
});

test("remembered publishes are capped so a long session cannot grow without bound", () => {
  const guard = createTurnGuard({ maxCardsPerTurn: 1000 });
  guard.beginTurn(KEY, "turn-1");
  for (let index = 0; index < MAX_REMEMBERED_PUBLISHES + 10; index += 1) {
    reserveAndCommit(guard, KEY, `art_${index}`, `<p>${index}</p>`);
  }

  const forgotten = reserve(guard, KEY, "<p>9</p>");
  assert.ok(forgotten.ok);
  guard.release(forgotten.reservation);
  assert.equal(refused(reserve(guard, KEY, "<p>10</p>")).artifactId, "art_10");
  assert.equal(refused(reserve(guard, KEY, `<p>${MAX_REMEMBERED_PUBLISHES + 9}</p>`)).artifactId, "art_59");
});

test("two agents never block each other", () => {
  const guard = createTurnGuard();
  const one = "agent:agent_a";
  const two = "agent:agent_b";
  guard.beginTurn(one, "turn-1");
  guard.beginTurn(two, "turn-1");
  reserveAndCommit(guard, one, "art_a", "<p>a</p>");

  const decision = reserve(guard, two, "<p>b</p>");
  assert.ok(decision.ok);
  guard.release(decision.reservation);
});

test("simultaneous reservations against one slot cannot both succeed", () => {
  const guard = createTurnGuard();
  guard.beginTurn(KEY, "turn-1");
  const first = reserve(guard, KEY, "<h1>one</h1>");
  const second = reserve(guard, KEY, "<h1>two</h1>");
  assert.ok(first.ok);
  const refusal = refused(second);
  assert.equal(refusal.artifactId, undefined, "in-flight refusal must not invent an artifact id");
  assert.match(refusal.message, /being published|per-turn limit/);

  guard.release(first.reservation);
  const retry = reserve(guard, KEY, "<h1>two</h1>");
  assert.ok(retry.ok);
  guard.release(retry.reservation);
});

test("identical simultaneous content refuses without inventing an artifact id", () => {
  const guard = createTurnGuard();
  guard.beginTurn(KEY, "turn-1");
  const first = reserve(guard, KEY, "<h1>same</h1>");
  const second = reserve(guard, KEY, "<h1>same</h1>");
  assert.ok(first.ok);
  const refusal = refused(second);
  assert.equal(refusal.artifactId, undefined);
  assert.match(refusal.message, /already being published/);

  commit(guard, first, "art_one");
  const afterCommit = refused(reserve(guard, KEY, "<h1>same</h1>"));
  assert.equal(afterCommit.artifactId, "art_one");
});

test("a reservation that started in an earlier turn never charges a later turn", () => {
  const guard = createTurnGuard({ maxCardsPerTurn: 2 });
  guard.beginTurn(KEY, "turn-1");
  const old = reserve(guard, KEY, "<h1>old</h1>");
  assert.ok(old.ok);

  guard.endTurn(KEY);
  guard.beginTurn(KEY, "turn-2");
  const firstNew = reserve(guard, KEY, "<h1>new one</h1>");
  assert.ok(firstNew.ok);
  commit(guard, firstNew, "art_new_one");

  // The old publish finishes after the new turn began.
  commit(guard, old, "art_old");

  // Turn 2 has one committed card, not two; this second reservation must fit.
  const secondNew = reserve(guard, KEY, "<h1>new two</h1>");
  assert.ok(secondNew.ok);
  guard.release(secondNew.reservation);
});

test("a ticket captured before a turn transition reserves against the captured turn", () => {
  const guard = createTurnGuard({ maxCardsPerTurn: 2 });
  guard.beginTurn(KEY, "turn-1");
  const ticket = guard.captureTurn(KEY);
  assert.ok(ticket);

  guard.endTurn(KEY);
  guard.beginTurn(KEY, "turn-2");
  const old = ticket ? guard.reserve(ticket, fingerprint("<h1>old</h1>")) : undefined;
  assert.ok(old?.ok);
  commit(guard, old, "art_old");

  const firstNew = reserve(guard, KEY, "<h1>new one</h1>");
  assert.ok(firstNew.ok);
  commit(guard, firstNew, "art_new_one");
  const secondNew = reserve(guard, KEY, "<h1>new two</h1>");
  assert.ok(secondNew.ok);
  guard.release(secondNew.reservation);
});

test("release after a failed publish returns the slot without leaking state", () => {
  const guard = createTurnGuard();
  guard.beginTurn(KEY, "turn-1");
  const failed = reserve(guard, KEY, "<h1>failed</h1>");
  assert.ok(failed.ok);
  guard.release(failed.reservation);

  const retry = reserve(guard, KEY, "<h1>retry</h1>");
  assert.ok(retry.ok);
  guard.release(retry.reservation);
});

test("publishFingerprint keeps meaningful bytes distinct", () => {
  const pairs: Array<[string, string]> = [
    ["<pre>a  b</pre>", "<pre>a b</pre>"],
    ["<textarea>a  b</textarea>", "<textarea>a b</textarea>"],
    ['<script>const s = "<!--";</script><p>one</p>', '<script>const s = "<!--";</script><p>two</p>'],
    ["<style>.a { color: red }</style><p>one</p>", "<style>.a { color: blue }</style><p>one</p>"],
    ["<p>one</p>", "\n  <p>one</p>  "],
    ["<p>one</p>", "<p>one</p><!-- changed comment -->"],
  ];
  for (const [left, right] of pairs) {
    assert.notEqual(fingerprint(left), fingerprint(right), `${left} and ${right} must differ`);
  }
  assert.equal(fingerprint("<p>one</p>"), fingerprint("<p>one</p>"));
});

test("publishFingerprint covers report, mode, metadata and workspace", () => {
  const base = fingerprint("<p>one</p>");
  assert.notEqual(base, fingerprint("<p>one</p>", { report: { outcome: { status: "success", headline: "Done" } } }));
  assert.notEqual(base, fingerprint("<p>one</p>", { renderMode: "static" }));
  assert.notEqual(base, fingerprint("<p>one</p>", { title: "Renamed" }));
  assert.notEqual(base, fingerprint("<p>one</p>", { height: 300 }));
  assert.notEqual(base, fingerprint("<p>one</p>", { summary: "New summary" }));
  assert.notEqual(base, fingerprint("<p>one</p>", { workspaceId: "wks_other" }));
});

test("maxCardsPerTurn reads the environment and only 0 disables the guard", () => {
  assert.equal(maxCardsPerTurn({}), DEFAULT_MAX_CARDS_PER_TURN);
  assert.equal(maxCardsPerTurn({ [MAX_CARDS_ENV]: "3" }), 3);
  assert.equal(maxCardsPerTurn({ [MAX_CARDS_ENV]: " 2 " }), 2);
  assert.equal(maxCardsPerTurn({ [MAX_CARDS_ENV]: "0" }), 0);
  for (const value of ["", "two", "-1", "1.5", "999999999999999999999999"]) {
    assert.equal(maxCardsPerTurn({ [MAX_CARDS_ENV]: value }), DEFAULT_MAX_CARDS_PER_TURN);
  }
});

test("guardKey requires an agent and never guesses from a shared directory", () => {
  assert.equal(guardKey("agent_a"), "agent:agent_a");
  assert.equal(guardKey("  agent_a  "), "agent:agent_a");
  assert.equal(guardKey(undefined), null);
  assert.equal(guardKey(null), null);
  assert.equal(guardKey("   "), null);
  assert.equal(guardKey(""), null);
});
