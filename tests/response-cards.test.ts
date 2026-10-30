import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PaseoApi } from "@getpaseo/client";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  createResponseCards,
  hasResponseRow,
  publishedMarkerText,
  responseItemId,
  selectResponseTarget,
  type ResponseItem,
  type TurnEndedInput,
} from "../server/response-cards.ts";
import contribute from "../server/contribute.ts";
import { ArtifactStore } from "../server/artifacts.ts";
import { PRODUCTION_IDENTITY } from "../shared/identity.ts";
import type { ReportCardData } from "../shared/protocol.ts";
import { encodeReportReference } from "../shared/recognize.ts";

const IDENTITY = PRODUCTION_IDENTITY;
const ARTIFACT = "a".repeat(32);
const OTHER_ARTIFACT = "b".repeat(32);

const card = (artifactId = ARTIFACT, title = "Report"): ReportCardData => ({
  artifactId,
  title,
  summary: null,
  width: 728,
  height: 600,
  renderMode: "auto",
});
const MARKER = encodeReportReference(card());
const STORED_CARD: ReportCardData = {
  artifactId: ARTIFACT,
  title: "Durable report",
  summary: "Authoritative metadata",
  width: 900,
  height: 420,
  renderMode: "static",
  hasReport: true,
  measuredHeight: 380,
  heights: [[728, 360], [900, 420]],
};

interface Entry {
  turnId?: string;
  item: Record<string, unknown>;
}

function reply(text = "Here is the report.", turnId = "turn-1"): Entry {
  return { turnId, item: { type: "assistant_message", text } };
}

function render(
  overrides: Record<string, unknown> = {},
  turnId = "turn-1",
  text = MARKER,
): Entry {
  return {
    turnId,
    item: {
      type: "tool_call",
      callId: "call-render",
      name: "mcp__html_render_v3__html_render",
      status: "completed",
      error: null,
      detail: { type: "plain_text", text },
      ...overrides,
    },
  };
}

function preview(turnId = "turn-1"): Entry {
  return {
    turnId,
    item: {
      type: "tool_call",
      callId: "call-preview",
      name: "mcp__html_render_v3__html_preview",
      status: "completed",
      error: null,
      detail: { type: "plain_text", text: "728x380 PNG captured" },
    },
  };
}

function persist(entries: Entry[], item: ResponseItem): Entry[] {
  return [
    ...entries,
    {
      item: {
        type: "plugin",
        id: item.id,
        kind: item.kind,
        version: item.version,
        data: item.data,
        pluginId: IDENTITY.pluginId,
      },
    },
  ];
}

interface FakeState {
  entries: Entry[];
  appends: ResponseItem[];
  error?: unknown;
  refetchOptions?: Record<string, unknown>;
}

function fakePaseo(state: FakeState) {
  const timeline = {
    async refetch(options: Record<string, unknown>) {
      state.refetchOptions = options;
      if (state.error) throw state.error;
      return { entries: state.entries };
    },
    async append(item: ResponseItem) {
      state.appends.push(item);
      state.entries = persist(state.entries, item);
      return { seq: state.entries.length, epoch: "epoch-1" };
    },
  };
  return {
    agents: { ref: (agentId: string) => ({ id: agentId, timeline }) },
  } as unknown as PaseoApi;
}

function publisher(options: {
  state: FakeState;
  card?: ReportCardData | Error;
  requester?: Error;
  logs: string[];
  timeoutMs?: number;
}) {
  return createResponseCards({
    identity: IDENTITY,
    store: {
      async readCard() {
        if (options.card instanceof Error) throw options.card;
        return { card: options.card ?? STORED_CARD };
      },
    },
    async resolveRequester() {
      if (options.requester) throw options.requester;
      return { workspaceIds: ["wks_test"], root: "/tmp/workspace" };
    },
    log: (message) => options.logs.push(message),
    timeoutMs: options.timeoutMs,
  });
}

function turnEnded(overrides: Partial<TurnEndedInput> = {}): TurnEndedInput {
  return {
    agent: { id: "agent_ok", parentAgentId: null },
    turnId: "turn-1",
    outcome: { kind: "completed" },
    ...overrides,
  };
}

const context = (state: FakeState) => ({
  paseo: fakePaseo(state),
  signal: new AbortController().signal,
});

// --- selection -------------------------------------------------------------

test("selection promotes the completed render row that precedes the reply", () => {
  const entries = [reply("working", "turn-1"), preview(), render(), reply()];
  assert.deepEqual(selectResponseTarget(entries, { turnId: "turn-1", identity: IDENTITY }), {
    kind: "target",
    artifactId: ARTIFACT,
    rowName: "mcp__html_render_v3__html_render",
  });
});

test("selection ignores drafts, failures and publishes that follow the reply", () => {
  assert.equal(
    selectResponseTarget([preview(), reply()], { turnId: "turn-1", identity: IDENTITY }).kind,
    "skip",
  );
  assert.deepEqual(
    selectResponseTarget([render({ status: "failed", error: { message: "no" } }), reply()], {
      turnId: "turn-1",
      identity: IDENTITY,
    }),
    { kind: "skip", reason: "no-publish" },
  );
  // A render row after the last reply has no answer to sit under.
  assert.deepEqual(
    selectResponseTarget([reply(), render()], { turnId: "turn-1", identity: IDENTITY }),
    { kind: "skip", reason: "no-publish" },
  );
  assert.deepEqual(
    selectResponseTarget([render(), { turnId: "turn-1", item: { type: "assistant_message", text: "  " } }], {
      turnId: "turn-1",
      identity: IDENTITY,
    }),
    { kind: "skip", reason: "no-reply" },
  );
  assert.deepEqual(selectResponseTarget([], { turnId: "turn-1", identity: IDENTITY }), {
    kind: "skip",
    reason: "empty-timeline",
  });
});

test("a marker in model-supplied arguments is never evidence of a publish", () => {
  const entries = [
    {
      turnId: "turn-1",
      item: {
        type: "tool_call",
        name: "mcp__html_render_v3__html_render",
        status: "completed",
        error: null,
        detail: {
          type: "unknown",
          input: { html: `<p>${MARKER}</p>`, arguments: { text: MARKER }, parameters: [MARKER] },
          output: { content: [{ type: "text", text: "Rendered preview" }] },
        },
      },
    },
    reply(),
  ];
  assert.deepEqual(selectResponseTarget(entries, { turnId: "turn-1", identity: IDENTITY }), {
    kind: "skip",
    reason: "no-publish",
  });
  // The same marker in the real tool output is accepted, including Pi's nested
  // codemode wrapper where the nested call is under `output.details.calls`.
  const nested = [
    {
      turnId: "turn-1",
      item: {
        type: "tool_call",
        name: "codemode",
        status: "completed",
        error: null,
        detail: {
          type: "unknown",
          input: { code: "html_render({html})" },
          output: { details: { calls: [{ name: "html_render", output: { text: MARKER } }] } },
        },
      },
    },
    reply(),
  ];
  assert.deepEqual(selectResponseTarget(nested, { turnId: "turn-1", identity: IDENTITY }), {
    kind: "target",
    artifactId: ARTIFACT,
    rowName: "codemode",
  });
});

test("output scanning is bounded and cycle safe", () => {
  const cyclic: Record<string, unknown> = { text: MARKER };
  cyclic.self = cyclic;
  assert.deepEqual(publishedMarkerText(cyclic), [MARKER]);
  const many = { list: Array.from({ length: 100 }, (_, index) => `value-${index}`) };
  assert.ok(publishedMarkerText(many).length <= 32);
});

test("a late event for an older turn cannot decorate a newer reply", () => {
  const entries = [
    { turnId: "turn-1", item: { type: "tool_call", name: "html_render", status: "completed", error: null, detail: { text: MARKER } } },
    reply("old answer", "turn-1"),
    reply("new answer", "turn-2"),
  ];
  // A turn id filters the older turn's render row out entirely.
  assert.deepEqual(selectResponseTarget(entries, { turnId: "turn-2", identity: IDENTITY }), {
    kind: "skip",
    reason: "no-publish",
  });
  // Without a turn identity, borrowing an older publication is not safe.
  assert.deepEqual(selectResponseTarget(entries, { turnId: null, identity: IDENTITY }), {
    kind: "skip",
    reason: "unattributed-turn",
  });
});

test("a persisted response row is recognized by its deterministic id and kind", () => {
  const id = responseItemId("agent_ok", ARTIFACT);
  assert.equal(id, responseItemId("agent_ok", ARTIFACT));
  assert.notEqual(id, responseItemId("agent_other", ARTIFACT));
  assert.ok(id.length <= 64);
  const entries = persist([render(), reply()], {
    type: "plugin",
    id,
    kind: IDENTITY.responseRendererKind,
    version: IDENTITY.reportVersion,
    data: STORED_CARD,
  });
  assert.equal(hasResponseRow(entries, id, IDENTITY.responseRendererKind), true);
  assert.equal(hasResponseRow(entries, id, IDENTITY.rendererKind), false);
  assert.equal(hasResponseRow([], id, IDENTITY.responseRendererKind), false);
});

// --- publisher -------------------------------------------------------------

test("a completed turn appends one bounded card after the native reply", async () => {
  const state: FakeState = { entries: [render(), reply()], appends: [] };
  const logs: string[] = [];
  const cards = publisher({ state, logs });
  const outcome = await cards.handleTurnEnded(turnEnded(), context(state));
  assert.equal(outcome.result, "appended");
  assert.equal(state.appends.length, 1);
  const item = state.appends[0]!;
  assert.equal(item.type, "plugin");
  assert.equal(item.id, responseItemId("agent_ok", ARTIFACT));
  assert.equal(item.kind, IDENTITY.responseRendererKind);
  assert.equal(item.version, IDENTITY.reportVersion);
  // Display metadata is the durable store's, not the marker's.
  assert.deepEqual(item.data, STORED_CARD);
  // The row really is the last item, i.e. after the reply.
  assert.deepEqual(state.entries.at(-1)?.item.data, STORED_CARD);
  assert.ok(logs.some((line) => line.includes("response-card appended")));
  // One bounded page, canonical projection, small limit.
  assert.equal(state.refetchOptions?.projection, "canonical");
  assert.equal(state.refetchOptions?.direction, "tail");
  assert.equal(typeof state.refetchOptions?.limit, "number");
  assert.ok(
    (state.refetchOptions?.limit as number) > 0 && (state.refetchOptions?.limit as number) <= 24,
  );
});

test("failed and canceled turns are never promoted; child conversations remain supported", async () => {
  for (const outcome of [
    { kind: "failed", error: { message: "boom" } },
    { kind: "canceled", reason: "user" },
  ] as const) {
    const state = { entries: [render(), reply()], appends: [] as ResponseItem[] };
    const cards = publisher({ state, logs: [] });
    const result = await cards.handleTurnEnded(turnEnded({ outcome }), context(state));
    assert.deepEqual(result, { result: "skipped", reason: "outcome" });
    assert.equal(state.appends.length, 0);
  }
  const state = { entries: [render(), reply()], appends: [] as ResponseItem[] };
  const result = await publisher({ state, logs: [] }).handleTurnEnded(
    turnEnded({ agent: { id: "agent_child", parentAgentId: "agent_ok" } }),
    context(state),
  );
  assert.equal(result.result, "appended");
  assert.equal(state.appends.length, 1);
});

test("a preview-only turn appends nothing", async () => {
  const state = { entries: [preview(), preview(), reply()], appends: [] as ResponseItem[] };
  const result = await publisher({ state, logs: [] }).handleTurnEnded(turnEnded(), context(state));
  assert.deepEqual(result, { result: "skipped", reason: "no-publish" });
  assert.equal(state.appends.length, 0);
});

test("a replayed event appends once, and a restart reconciles the persisted row", async () => {
  const state = { entries: [render(), reply()], appends: [] as ResponseItem[] };
  const cards = publisher({ state, logs: [] });
  assert.equal((await cards.handleTurnEnded(turnEnded(), context(state))).result, "appended");
  const withResponse = state.entries;
  // A read that still lags behind the append (event replayed immediately) is
  // covered by the in-process gate.
  state.entries = [render(), reply()];
  assert.deepEqual(await cards.handleTurnEnded(turnEnded(), context(state)), {
    result: "skipped",
    reason: "already-appended",
    artifactId: ARTIFACT,
  });
  assert.equal(state.appends.length, 1);

  // Restart: a fresh publisher has no memory, but the persisted row is read back.
  state.entries = withResponse;
  const restarted = publisher({ state, logs: [] });
  assert.deepEqual(await restarted.handleTurnEnded(turnEnded(), context(state)), {
    result: "skipped",
    reason: "already-present",
    artifactId: ARTIFACT,
  });
  assert.equal(state.appends.length, 1);
});

test("concurrent turn-ended calls append once", async () => {
  const state = { entries: [render(), reply()], appends: [] as ResponseItem[] };
  const cards = publisher({ state, logs: [] });
  const [first, second] = await Promise.all([
    cards.handleTurnEnded(turnEnded(), context(state)),
    cards.handleTurnEnded(turnEnded(), context(state)),
  ]);
  assert.deepEqual([first.result, second.result].sort(), ["appended", "skipped"]);
  assert.equal(state.appends.length, 1);
});

test("authority, store and transport failures skip without inventing a card", async () => {
  const denied = { entries: [render(), reply()], appends: [] as ResponseItem[] };
  assert.deepEqual(
    await publisher({ state: denied, logs: [], requester: new Error("not owned") }).handleTurnEnded(
      turnEnded(),
      context(denied),
    ),
    { result: "skipped", reason: "no-workspace", artifactId: ARTIFACT },
  );
  assert.equal(denied.appends.length, 0);

  const unreadable = { entries: [render(), reply()], appends: [] as ResponseItem[] };
  assert.deepEqual(
    await publisher({ state: unreadable, logs: [], card: new Error("not found") }).handleTurnEnded(
      turnEnded(),
      context(unreadable),
    ),
    { result: "skipped", reason: "unreadable", artifactId: ARTIFACT },
  );
  assert.equal(unreadable.appends.length, 0);

  // A card projection for a different artifact is a corrupt read, not a card.
  const mismatched = { entries: [render(), reply()], appends: [] as ResponseItem[] };
  assert.deepEqual(
    await publisher({
      state: mismatched,
      logs: [],
      card: card(OTHER_ARTIFACT),
    }).handleTurnEnded(turnEnded(), context(mismatched)),
    { result: "skipped", reason: "unreadable", artifactId: ARTIFACT },
  );
  assert.equal(mismatched.appends.length, 0);
});

test("an append failure is logged once, keeps the fallback and can be retried", async () => {
  const state = { entries: [render(), reply()], appends: [] as ResponseItem[] };
  const logs: string[] = [];
  const cards = createResponseCards({
    identity: IDENTITY,
    store: { async readCard() { return { card: STORED_CARD }; } },
    async resolveRequester() { return { workspaceIds: ["wks_test"], root: "/tmp/workspace" }; },
    log: (message) => logs.push(message),
  });
  const failing = {
    agents: {
      ref: () => ({
        timeline: {
          async refetch() { return { entries: state.entries }; },
          async append() { throw new Error("append refused"); },
        },
      }),
    },
  } as unknown as PaseoApi;
  assert.deepEqual(
    await cards.handleTurnEnded(turnEnded(), { paseo: failing, signal: new AbortController().signal }),
    { result: "skipped", reason: "append-failed", artifactId: ARTIFACT },
  );
  assert.ok(logs.some((line) => line.includes("reason=append-failed")));
  // Nothing was remembered: the next turn can still publish this artifact.
  assert.equal((await cards.handleTurnEnded(turnEnded(), context(state))).result, "appended");
});

test("a stalled timeline read is abandoned at the deadline", async () => {
  const logs: string[] = [];
  const cards = createResponseCards({
    identity: IDENTITY,
    store: { async readCard() { return { card: STORED_CARD }; } },
    async resolveRequester() { return { workspaceIds: ["wks_test"], root: "/tmp/workspace" }; },
    log: (message) => logs.push(message),
    timeoutMs: 10,
  });
  const stalled = {
    agents: {
      ref: () => ({ timeline: { refetch: () => new Promise(() => {}), async append() {} } }),
    },
  } as unknown as PaseoApi;
  assert.deepEqual(
    await cards.handleTurnEnded(turnEnded(), { paseo: stalled, signal: new AbortController().signal }),
    { result: "skipped", reason: "timeout" },
  );
  assert.ok(logs.some((line) => line.includes("reason=timeout")));
});

test("a transport error is swallowed and later turns still work", async () => {
  const broken: FakeState = { entries: [], appends: [], error: new Error("socket closed") };
  const logs: string[] = [];
  const cards = publisher({ state: broken, logs });
  assert.deepEqual(await cards.handleTurnEnded(turnEnded(), context(broken)), {
    result: "skipped",
    reason: "read-failed",
  });
  assert.ok(logs.some((line) => line.includes("reason=read-failed")));
  broken.error = undefined;
  broken.entries = [render(), reply()];
  assert.equal((await cards.handleTurnEnded(turnEnded(), context(broken))).result, "appended");
});

test("dispose stops promotion without touching the fallback", async () => {
  const state = { entries: [render(), reply()], appends: [] as ResponseItem[] };
  const cards = publisher({ state, logs: [] });
  cards.dispose();
  assert.deepEqual(await cards.handleTurnEnded(turnEnded(), context(state)), {
    result: "skipped",
    reason: "disposed",
  });
  assert.equal(state.appends.length, 0);
});

// --- daemon entry integration ---------------------------------------------

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

test("daemon entry appends the real published card and ignores a preview-only turn", async (t) => {
  const dataRoot = await fs.mkdtemp(join(tmpdir(), "hr-response-"));
  const workspace = await fs.mkdtemp(join(tmpdir(), "hr-response-ws-"));
  const previous = process.env.PASEO_HTML_RENDER_DATA_DIR;
  process.env.PASEO_HTML_RENDER_DATA_DIR = dataRoot;
  t.after(async () => {
    if (previous === undefined) delete process.env.PASEO_HTML_RENDER_DATA_DIR;
    else process.env.PASEO_HTML_RENDER_DATA_DIR = previous;
    await fs.rm(dataRoot, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  });

  const events = new Map<string, (event: unknown, context: unknown) => Promise<void> | void>();
  const server = {
    handle() {},
    before() {
      return () => {};
    },
    on(name: string, handler: (event: unknown, context: unknown) => Promise<void> | void) {
      events.set(name, handler);
      return () => {};
    },
  } as unknown as PluginServerContext;
  const previousError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = previousError;
  });
  const cleanup = contribute(server);
  t.after(cleanup);

  const store = new ArtifactStore(dataRoot);
  const saved = await store.save({
    html: "<!doctype html><p>response</p>",
    title: "Response card",
    summary: "Durable",
    width: 728,
    height: 300,
    renderMode: "static",
    workspaceId: "wks_test",
    ownerCwd: workspace,
    previewPng: PNG,
  });

  const entries: Entry[] = [
    {
      turnId: "turn-1",
      item: {
        type: "tool_call",
        name: "mcp__html_render_v3__html_preview",
        status: "completed",
        error: null,
        detail: { type: "plain_text", text: "728x380 PNG captured" },
      },
    },
    { turnId: "turn-1", item: { type: "assistant_message", text: "Here is the height." } },
  ];
  const appends: ResponseItem[] = [];
  const persisted = (): ReportCardData => appends[0]!.data as unknown as ReportCardData;
  const paseo = {
    workspaces: {
      list: async () => ({
        entries: [{ id: "wks_test", projectRootPath: workspace, workspaceDirectory: workspace }],
        pageInfo: {},
        requestId: "test",
      }),
    },
    agents: {
      ref: (agentId: string) => ({
        id: agentId,
        workspaceId: "wks_test",
        async refresh() {
          return null;
        },
        timeline: {
          async refetch() {
            return { entries };
          },
          async append(item: ResponseItem) {
            appends.push(item);
            return { seq: 1, epoch: "epoch" };
          },
        },
      }),
    },
  } as unknown as PaseoApi;
  const hook = events.get("agent.turn_ended");
  assert.ok(hook);
  const agent = { id: "agent_ok", workspaceId: "wks_test", parentAgentId: null, provider: "pi", cwd: workspace, title: null };

  // A preview-only turn has no marker, so nothing is appended.
  await hook(
    { agent, turnId: "turn-1", outcome: { kind: "completed" }, timeline: [] },
    { paseo, signal: new AbortController().signal },
  );
  assert.equal(appends.length, 0);

  // The real publish promotes the durable card, not the marker's placeholder.
  entries.splice(0, entries.length,
    {
      turnId: "turn-1",
      item: {
        type: "tool_call",
        name: "mcp__html_render_v3__html_render",
        status: "completed",
        error: null,
        detail: {
          type: "plain_text",
          text: encodeReportReference({
            artifactId: saved.manifest.artifactId,
            title: "Marker placeholder",
            summary: null,
            width: 728,
            height: 300,
          }),
        },
      },
    },
    { turnId: "turn-1", item: { type: "assistant_message", text: "Published the card." } },
  );
  await hook(
    { agent, turnId: "turn-1", outcome: { kind: "completed" }, timeline: [] },
    { paseo, signal: new AbortController().signal },
  );
  assert.equal(appends.length, 1);
  assert.equal(appends[0]!.kind, IDENTITY.responseRendererKind);
  assert.equal(persisted().artifactId, saved.manifest.artifactId);
  // Durable store metadata wins over the marker's placeholder values.
  assert.equal(persisted().title, "Response card");
  assert.equal(persisted().summary, "Durable");
  assert.equal(persisted().renderMode, "static");
});
