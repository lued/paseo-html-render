import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import type { PaseoApi } from "@getpaseo/client";
import { createResponseCards, hasResponseRow, responseItemId, selectResponseTarget } from "../server/response-cards.ts";
import { PRODUCTION_IDENTITY as identity } from "../shared/identity.ts";
import { encodeReportReference } from "../shared/recognize.ts";

const artifactId = "c".repeat(32);
const card = { artifactId, title: "Answer", summary: null, width: 728, height: 420, renderMode: "auto" as const };
const entries = [
  { turnId: "one", item: { type: "tool_call", name: "html_render", status: "completed", error: null, detail: { text: encodeReportReference(card) } } },
  { turnId: "one", item: { type: "assistant_message", text: "Here is the answer." } },
];
const event = { agent: { id: "agent", parentAgentId: null }, turnId: "one", outcome: { kind: "completed" as const } };
const requester = { workspaceIds: ["workspace"], root: "/tmp/workspace" };

function setup(options: { read?: () => Promise<unknown>; store?: () => Promise<{ card: typeof card }>; timeoutMs?: number } = {}) {
  const appends: unknown[] = [];
  const timeline = {
    refetch: options.read ?? (async () => ({ entries })),
    async append(item: unknown) { appends.push(item); return { seq: 3, epoch: "epoch" }; },
  };
  const paseo = { agents: { ref: () => ({ timeline }) } } as unknown as PaseoApi;
  const publisher = createResponseCards({
    identity, store: { readCard: options.store ?? (async () => ({ card })) },
    resolveRequester: async () => requester, log() {}, timeoutMs: options.timeoutMs ?? 1000,
  });
  return { publisher, appends, context: { paseo, signal: new AbortController().signal } };
}

test("a late old-turn event cannot append beneath a newer turn", () => {
  const history = [...entries, { turnId: "two", item: { type: "assistant_message", text: "Newer answer" } }];
  assert.deepEqual(selectResponseTarget(history, { turnId: "one", identity }), { kind: "skip", reason: "stale-turn" });
});

test("missing turn identity cannot borrow another turn's publication", () => {
  assert.deepEqual(selectResponseTarget(entries, { turnId: null, identity }), { kind: "skip", reason: "unattributed-turn" });
});

test("a matching response from another plugin is not a delivery receipt", () => {
  const history = [{ item: { type: "plugin", id: responseItemId("agent", artifactId), kind: identity.responseRendererKind, pluginId: "another-plugin" } }];
  assert.equal(hasResponseRow(history, responseItemId("agent", artifactId), identity.responseRendererKind, identity.pluginId), false);
});

test("a timed-out history read cannot resume and append later", async () => {
  let release!: (value: unknown) => void;
  const fixture = setup({ read: () => new Promise(resolve => { release = resolve; }), timeoutMs: 10 });
  const pending = fixture.publisher.handleTurnEnded(event, fixture.context);
  await delay(25);
  assert.deepEqual(await pending, { result: "skipped", reason: "timeout" });
  release({ entries });
  await delay(10);
  assert.equal(fixture.appends.length, 0);
});

test("a timed-out artifact read cannot append after its deadline", async () => {
  let release!: (value: { card: typeof card }) => void;
  const fixture = setup({ store: () => new Promise(resolve => { release = resolve; }), timeoutMs: 10 });
  const pending = fixture.publisher.handleTurnEnded(event, fixture.context);
  await delay(25);
  assert.deepEqual(await pending, { result: "skipped", reason: "timeout" });
  release({ card });
  await delay(10);
  assert.equal(fixture.appends.length, 0);
});

test("disposal prevents an artifact read from producing a late append", async () => {
  let release!: (value: { card: typeof card }) => void;
  const fixture = setup({ store: () => new Promise(resolve => { release = resolve; }) });
  const pending = fixture.publisher.handleTurnEnded(event, fixture.context);
  await delay(1);
  fixture.publisher.dispose();
  release({ card });
  await pending;
  assert.equal(fixture.appends.length, 0);
});

test("a new turn cancels an older promotion waiting on artifact I/O", async () => {
  let release!: (value: { card: typeof card }) => void;
  const fixture = setup({ store: () => new Promise(resolve => { release = resolve; }) });
  const pending = fixture.publisher.handleTurnEnded(event, fixture.context);
  await delay(1);
  fixture.publisher.turnStarted("agent");
  release({ card });
  assert.equal((await pending).result, "skipped");
  await delay(1);
  assert.equal(fixture.appends.length, 0);
});

test("a second snapshot rejects a newer reply arriving during artifact I/O", async () => {
  let reads = 0;
  const fixture = setup({ read: async () => ({ entries: ++reads === 1 ? entries : [...entries,
    { turnId: "two", item: { type: "assistant_message", text: "new answer" } }] }) });
  assert.equal((await fixture.publisher.handleTurnEnded(event, fixture.context)).result, "skipped");
  assert.equal(fixture.appends.length, 0);
});

test("an already aborted hook does not start a timeline read", async () => {
  let reads = 0;
  const fixture = setup({ read: async () => { reads++; return { entries }; } });
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await fixture.publisher.handleTurnEnded(event, { ...fixture.context, signal: controller.signal }), { result: "skipped", reason: "aborted" });
  assert.equal(reads, 0);
});

test("a subagent's answer is published in its own conversation", async () => {
  const fixture = setup();
  const outcome = await fixture.publisher.handleTurnEnded({ ...event, agent: { id: "child", parentAgentId: "parent" } }, fixture.context);
  assert.equal(outcome.result, "appended");
  assert.equal(fixture.appends.length, 1);
});
