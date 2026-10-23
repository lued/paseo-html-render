import assert from "node:assert/strict";
import test from "node:test";
import {
  createTurnGuard,
  DEFAULT_MAX_CARDS_PER_TURN,
  guardKey,
  htmlFingerprint,
  MAX_CARDS_ENV,
  MAX_REMEMBERED_PUBLISHES,
  maxCardsPerTurn,
  type TurnGuard,
  type TurnGuardDecision,
} from "../server/turn-guard.ts";

function refused(decision: TurnGuardDecision): Extract<TurnGuardDecision, { ok: false }> {
  assert.equal(decision.ok, false, "expected a duplicate refusal");
  return decision as Extract<TurnGuardDecision, { ok: false }>;
}

function publish(guard: TurnGuard, key: string, artifactId: string, html: string): string {
  const hash = htmlFingerprint(html);
  guard.record({ key, workspaceId: "wks_test", artifactId, hash, title: `Card ${artifactId}` });
  return hash;
}

test("a second card in one turn is refused and names the existing artifact", () => {
  const guard = createTurnGuard();
  const key = guardKey("agent_a", "/tmp/workspace");
  guard.beginTurn(key, "turn-1");
  publish(guard, key, "art_one", "<h1>one</h1>");

  const decision = refused(guard.check({ key, hash: htmlFingerprint("<h1>two</h1>") }));
  assert.equal(decision.code, "duplicate");
  assert.equal(decision.artifactId, "art_one");
  assert.match(decision.message, /per-turn limit is 1/);
  assert.match(decision.message, /art_one/);
  assert.match(decision.message, /Keep the rest in your reply/);
});

test("a later turn reopens the card budget", () => {
  const guard = createTurnGuard();
  const key = "agent:agent_a";
  guard.beginTurn(key, "turn-1");
  publish(guard, key, "art_one", "<h1>one</h1>");
  guard.beginTurn(key, "turn-2");
  assert.deepEqual(guard.check({ key, hash: htmlFingerprint("<h1>two</h1>") }), { ok: true });
});

test("identical HTML is refused across turns with a nothing-changed message", () => {
  const guard = createTurnGuard();
  const key = "agent:agent_a";
  guard.beginTurn(key, "turn-1");
  const hash = publish(guard, key, "art_one", "<h1>same</h1>");
  guard.endTurn(key);
  guard.beginTurn(key, "turn-2");

  const decision = refused(guard.check({ key, hash }));
  assert.equal(decision.artifactId, "art_one");
  assert.match(decision.message, /Nothing changed/);
  assert.match(decision.message, /art_one/);
});

test("an unknown turn applies only the identical-content rule", () => {
  const guard = createTurnGuard();
  const key = guardKey(undefined, "/tmp/workspace");
  const hash = publish(guard, key, "art_one", "<h1>one</h1>");

  assert.deepEqual(guard.check({ key, hash: htmlFingerprint("<h1>two</h1>") }), { ok: true });
  assert.equal(refused(guard.check({ key, hash })).code, "duplicate");
});

test("a replayed turn_started for the same turn does not reset the count", () => {
  const guard = createTurnGuard();
  const key = "agent:agent_a";
  guard.beginTurn(key, "turn-1");
  publish(guard, key, "art_one", "<h1>one</h1>");
  guard.beginTurn(key, "turn-1");
  assert.equal(refused(guard.check({ key, hash: htmlFingerprint("<h1>two</h1>") })).code, "duplicate");
});

test("endTurn keeps the remembered publishes but clears the turn", () => {
  const guard = createTurnGuard();
  const key = "agent:agent_a";
  guard.beginTurn(key, "turn-1");
  const hash = publish(guard, key, "art_one", "<h1>one</h1>");
  guard.endTurn(key);

  assert.equal(refused(guard.check({ key, hash })).code, "duplicate");
  assert.deepEqual(guard.check({ key, hash: htmlFingerprint("<h1>two</h1>") }), { ok: true });
});

test("remembered publishes are capped so a long session cannot grow without bound", () => {
  const guard = createTurnGuard({ maxCardsPerTurn: 1000 });
  const key = "agent:agent_a";
  guard.beginTurn(key, "turn-1");
  const hashes: string[] = [];
  for (let index = 0; index < MAX_REMEMBERED_PUBLISHES + 10; index += 1) {
    hashes.push(publish(guard, key, `art_${index}`, `<p>${index}</p>`));
  }

  // The ten oldest are forgotten; the fifty newest are still remembered.
  assert.deepEqual(guard.check({ key, hash: hashes[9]! }), { ok: true });
  assert.equal(refused(guard.check({ key, hash: hashes[10]! })).artifactId, "art_10");
  assert.equal(refused(guard.check({ key, hash: hashes.at(-1)! })).artifactId, "art_59");
});

test("two agents never block each other", () => {
  const guard = createTurnGuard();
  const one = "agent:agent_a";
  const two = "agent:agent_b";
  guard.beginTurn(one, "turn-1");
  guard.beginTurn(two, "turn-1");
  publish(guard, one, "art_a", "<p>a</p>");

  assert.deepEqual(guard.check({ key: two, hash: htmlFingerprint("<p>b</p>") }), { ok: true });
});

test("maxCardsPerTurn reads the environment and only 0 disables the guard", () => {
  assert.equal(maxCardsPerTurn({}), DEFAULT_MAX_CARDS_PER_TURN);
  assert.equal(maxCardsPerTurn({ [MAX_CARDS_ENV]: "3" }), 3);
  assert.equal(maxCardsPerTurn({ [MAX_CARDS_ENV]: " 2 " }), 2);
  assert.equal(maxCardsPerTurn({ [MAX_CARDS_ENV]: "0" }), 0);
  // Anything malformed stays closed, because leaving the guard on is the safe
  // failure mode for a duplicate-card nudge.
  for (const value of ["", "two", "-1", "1.5", "999999999999999999999999"]) {
    assert.equal(maxCardsPerTurn({ [MAX_CARDS_ENV]: value }), DEFAULT_MAX_CARDS_PER_TURN);
  }
});

test("a zero limit disables both refusals", () => {
  const guard = createTurnGuard({ maxCardsPerTurn: maxCardsPerTurn({ [MAX_CARDS_ENV]: "0" }) });
  const key = "agent:agent_a";
  guard.beginTurn(key, "turn-1");
  const hash = publish(guard, key, "art_one", "<h1>one</h1>");
  assert.deepEqual(guard.check({ key, hash }), { ok: true });
  assert.deepEqual(guard.check({ key, hash: htmlFingerprint("<h1>two</h1>") }), { ok: true });
});

test("htmlFingerprint ignores comments and whitespace differences only", () => {
  const base = htmlFingerprint("<h1>Report</h1>\n<p>Body</p>");
  assert.equal(htmlFingerprint("  <h1>Report</h1>\n\n<p>Body</p>  "), base);
  assert.equal(htmlFingerprint("<h1>Report</h1> <!-- draft --> <p>Body</p>"), base);
  // An unterminated comment hides the rest of the document, as a browser does.
  assert.equal(htmlFingerprint("<h1>Report</h1> <!-- open\n<p>Body</p>"), htmlFingerprint("<h1>Report</h1>"));
  assert.equal(base.length, 64);
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.notEqual(htmlFingerprint("<h1>Report</h1><p>Body</p>"), base);
});

test("guardKey prefers the agent and falls back to the caller directory", () => {
  assert.equal(guardKey("agent_a", "/tmp/workspace"), "agent:agent_a");
  assert.equal(guardKey("  agent_a  ", "/tmp/workspace"), "agent:agent_a");
  assert.equal(guardKey(undefined, "/tmp/workspace"), "cwd:/tmp/workspace");
  assert.equal(guardKey(null, "/tmp/workspace"), "cwd:/tmp/workspace");
  assert.equal(guardKey("   ", "/tmp/workspace"), "cwd:/tmp/workspace");
  assert.equal(guardKey("", ""), "cwd:");
});
