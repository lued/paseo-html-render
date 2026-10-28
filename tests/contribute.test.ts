import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PaseoApi } from "@getpaseo/client";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import contribute, { formatSessionOpenEvidence } from "../server/contribute.ts";
import { ArtifactStore } from "../server/artifacts.ts";
import { BRIDGE_TOKEN_FILE, PRODUCTION_IDENTITY } from "../shared/identity.ts";
import { readArtifactRpc, readAssetRpc, readOriginalArtifactRpc, readReportRpc } from "../shared/protocol.ts";

type Handler = (input: unknown, context: { paseo: PaseoApi }) => Promise<unknown>;
type BeforeHook = (input: { request: any }, context: unknown) => Promise<any>;
type EventHook = (event: unknown, context: unknown) => Promise<void> | void;

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const IDENTITY = PRODUCTION_IDENTITY;

function fakePaseoWorkspaces(
  workspaces: Array<{ id: string; path: string }>,
  agents: Record<string, string | null>,
): PaseoApi {
  return {
    workspaces: {
      list: async () => ({
        entries: workspaces.map((workspace) => ({
          id: workspace.id,
          projectRootPath: workspace.path,
          workspaceDirectory: workspace.path,
        })),
        pageInfo: {},
        requestId: "test",
      }),
    },
    agents: {
      ref: (agentId: string) => ({
        async refresh() {
          return null;
        },
        get workspaceId() {
          return agents[agentId] ?? null;
        },
      }),
    },
  } as unknown as PaseoApi;
}

function fakePaseo(workspaceRoot: string): PaseoApi {
  return fakePaseoWorkspaces([{ id: "wks_test", path: workspaceRoot }], { agent_ok: "wks_test" });
}

/** Minimal server context that records every registration. */
function fakeServer() {
  const handlers = new Map<string, Handler>();
  const hooks = new Map<string, BeforeHook>();
  const events = new Map<string, EventHook>();
  const server = {
    handle(contract: { name: string }, handler: Handler) {
      handlers.set(contract.name, handler);
    },
    before(name: string, handler: BeforeHook) {
      hooks.set(name, handler);
      return () => {};
    },
    on(name: string, handler: EventHook) {
      events.set(name, handler);
      return () => {};
    },
  } as unknown as PluginServerContext;
  return { server, handlers, hooks, events };
}

function sessionRequest(overrides: Record<string, unknown> = {}) {
  return {
    agentId: "agent_ok",
    workspaceId: "wks_test",
    provider: "pi",
    cwd: "/tmp/workspace",
    reason: "resume",
    purpose: "interactive",
    title: null,
    labels: {},
    tools: [],
    env: {},
    mcpServers: {},
    ...overrides,
  };
}

test("daemon entry injects MCP at session open, serves owned artifacts, and cleans up", async (t) => {
  const dataRoot = await fs.mkdtemp(join(tmpdir(), "hr-contribute-"));
  const workspace = await fs.mkdtemp(join(tmpdir(), "hr-contribute-ws-"));
  const previous = process.env.PASEO_HTML_RENDER_DATA_DIR;
  process.env.PASEO_HTML_RENDER_DATA_DIR = dataRoot;
  t.after(async () => {
    if (previous === undefined) delete process.env.PASEO_HTML_RENDER_DATA_DIR;
    else process.env.PASEO_HTML_RENDER_DATA_DIR = previous;
    await fs.rm(dataRoot, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  });

  const { server, handlers, hooks, events } = fakeServer();
  const logs: string[] = [];
  const previousError = console.error;
  console.error = (value?: unknown) => {
    logs.push(String(value));
  };
  t.after(() => {
    console.error = previousError;
  });

  const cleanup = contribute(server);
  // Register cleanup before any assertion so a failure cannot leak the bridge
  // socket or the adapter process tree.
  t.after(cleanup);
  const paseo = fakePaseo(workspace);

  // Launch-only injection: `agent.create` must not exist at all, because it
  // writes the server into saved configuration and then collides with the
  // session-open contribution on every later open.
  assert.equal(hooks.get("agent.create"), undefined);
  assert.ok(hooks.get("agent.session_open"));

  // A resumed agent establishes authority and receives the server.
  const sessionOpen = hooks.get("agent.session_open")!;
  const request = sessionRequest({
    cwd: workspace,
    env: { EXISTING: "1" },
    mcpServers: { other: { type: "stdio", command: "x" } },
  });
  const opened = (await sessionOpen(
    { request },
    { paseo, signal: new AbortController().signal },
  )) as {
    mcpServers: Record<string, { type: string; command: string; args: string[]; alwaysLoad?: boolean; env: Record<string, string> }>;
    env: Record<string, string>;
  };
  assert.ok(opened, "an interactive open returns a request");
  // The incoming request is immutable: only the returned copy carries the server.
  assert.deepEqual(Object.keys(request.mcpServers), ["other"]);
  assert.deepEqual(request.env, { EXISTING: "1" });
  assert.deepEqual(Object.keys(opened.mcpServers).sort(), [IDENTITY.mcpServerName, "other"]);
  // Other servers survive untouched.
  assert.deepEqual(opened.mcpServers.other, { type: "stdio", command: "x" });
  assert.deepEqual(opened.env, { EXISTING: "1" }, "launch environment stays untouched");
  const injected = opened.mcpServers[IDENTITY.mcpServerName];
  assert.ok(injected);
  assert.equal(injected.type, "stdio");
  assert.equal(injected.alwaysLoad, true);
  assert.equal(injected.command, process.execPath);
  assert.ok(injected.args[0]?.endsWith(IDENTITY.adapterFileName), injected.args[0]);
  assert.equal(injected.env[IDENTITY.bridgeEnv.cwd], workspace);
  assert.ok(injected.env[IDENTITY.bridgeEnv.token]);
  // A desktop-managed daemon runs the adapter through its Electron binary, which
  // needs this to behave as Node instead of starting the GUI and closing stdio.
  assert.equal(injected.env.ELECTRON_RUN_AS_NODE, "1");
  assert.ok((await fs.stat(injected.args[0]!)).size > 1_000);

  // The private token file remains part of the transport contract. It is
  // owner-only and never enters saved agent configuration, because the server
  // itself is launch-only.
  const tokenPath = join(dataRoot, BRIDGE_TOKEN_FILE);
  assert.equal((await fs.stat(tokenPath)).mode & 0o777, 0o600);
  assert.equal((await fs.readFile(tokenPath, "utf8")).trim(), injected.env[IDENTITY.bridgeEnv.token]);

  // The adapter file and bridge socket exist before any render is requested.
  assert.ok(await fs.stat(join(dataRoot, IDENTITY.socketFileName)));

  // A legacy 2.x agent must find a tombstone, not a live bridge client.
  const legacyPath = join(dataRoot, IDENTITY.legacyAdapterFileName);
  const legacy = await fs.readFile(legacyPath, "utf8");
  assert.ok(legacy.includes("html-render-legacy-tombstone"));
  assert.ok(!legacy.includes("node:net"));

  // Evidence is one sanitized line: no token, no workspace path, fixed fields.
  const evidence = logs.find((line) => line.includes("session-open")) ?? "";
  assert.match(evidence, /session-open result=injected/);
  assert.ok(evidence.includes(`server=${IDENTITY.mcpServerName}`));
  assert.match(evidence, /transport=stdio/);
  assert.match(evidence, /alwaysLoad=true/);
  assert.match(evidence, /agent=agent_ok/);
  assert.match(evidence, /provider=pi/);
  assert.match(evidence, /reason=resume/);
  assert.match(evidence, /purpose=interactive/);
  assert.ok(!evidence.includes(injected.env[IDENTITY.bridgeEnv.token]));
  assert.ok(!evidence.includes(workspace));

  // A running agent whose plugin was reloaded mid-session warms on turn start.
  const turnStarted = events.get("agent.turn_started");
  assert.ok(turnStarted);
  await turnStarted(
    { agent: { id: "agent_ok", workspaceId: "wks_test", parentAgentId: null, provider: "pi", cwd: workspace, title: null } },
    { paseo, signal: new AbortController().signal },
  );

  const store = new ArtifactStore(dataRoot);
  const saved = await store.save({
    html: "<!doctype html><p>owned</p>",
    title: "Owned",
    summary: null,
    width: 728,
    height: 200,
    renderMode: "auto",
    workspaceId: "wks_test",
    ownerCwd: workspace,
    previewPng: PNG,
  });

  const read = handlers.get(readArtifactRpc.name);
  const original = handlers.get(readOriginalArtifactRpc.name);
  const reportRead = handlers.get(readReportRpc.name);
  const assetRead = handlers.get(readAssetRpc.name);
  assert.ok(read);
  assert.ok(original);
  assert.ok(reportRead);
  assert.ok(assetRead);
  const artifact = (await read({ artifactId: saved.manifest.artifactId, agentId: "agent_ok" }, { paseo })) as {
    title: string;
    renderMode?: string;
    card?: { artifactId: string; renderMode?: string };
    preview: { base64: string };
  };
  assert.equal(artifact.title, "Owned");
  assert.deepEqual(Buffer.from(artifact.preview.base64, "base64"), PNG);
  // The durable card projection is part of the artifact read, so a marker that
  // lost renderMode cannot change the display.
  assert.equal(artifact.renderMode, "auto");
  assert.equal(artifact.card?.artifactId, saved.manifest.artifactId);
  assert.equal(artifact.card?.renderMode, "auto");
  const html = (await original({ artifactId: saved.manifest.artifactId, agentId: "agent_ok" }, { paseo })) as {
    html: string;
  };
  assert.equal(html.html, "<!doctype html><p>owned</p>");

  await assert.rejects(
    () => read({ artifactId: saved.manifest.artifactId, agentId: "agent_other" }, { paseo }) as Promise<unknown>,
    /not available for that agent/,
  );

  await cleanup();
  await assert.rejects(() => fs.stat(join(dataRoot, IDENTITY.socketFileName)));
});

test("session open skips history, disabled labels, and an already-present server", async (t) => {
  const dataRoot = await fs.mkdtemp(join(tmpdir(), "hr-contribute-skip-"));
  const workspace = await fs.mkdtemp(join(tmpdir(), "hr-contribute-skip-ws-"));
  const previous = process.env.PASEO_HTML_RENDER_DATA_DIR;
  process.env.PASEO_HTML_RENDER_DATA_DIR = dataRoot;
  t.after(async () => {
    if (previous === undefined) delete process.env.PASEO_HTML_RENDER_DATA_DIR;
    else process.env.PASEO_HTML_RENDER_DATA_DIR = previous;
    await fs.rm(dataRoot, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  });

  const { server, hooks } = fakeServer();
  const logs: string[] = [];
  const previousError = console.error;
  console.error = (value?: unknown) => {
    logs.push(String(value));
  };
  t.after(() => {
    console.error = previousError;
  });
  const cleanup = contribute(server);
  t.after(cleanup);
  const paseo = fakePaseo(workspace);
  const sessionOpen = hooks.get("agent.session_open")!;
  const open = (overrides: Record<string, unknown>) =>
    sessionOpen({ request: sessionRequest({ cwd: workspace, ...overrides }) }, { paseo, signal: new AbortController().signal });

  // A history open attaches no tools at all.
  assert.equal(await open({ purpose: "history" }), undefined);
  assert.ok(logs.some((line) => /result=skipped skip=history/.test(line)));
  // The opt-out label is exact and case/whitespace tolerant.
  assert.equal(await open({ labels: { "html-render/disabled": " TRUE " } }), undefined);
  assert.ok(logs.some((line) => /result=skipped skip=label/.test(line)));
  // Only "true" disables; any other value keeps the default.
  assert.ok(await open({ labels: { "html-render/disabled": "no" } }), "a non-true label keeps injection");
  assert.ok(logs.some((line) => /result=injected/.test(line)));
  // A host that pre-populates the key is never overwritten.
  const present = { [IDENTITY.mcpServerName]: { type: "stdio", command: "keep" } };
  assert.equal(await open({ mcpServers: present }), undefined);
  assert.ok(logs.some((line) => /result=skipped skip=already-present/.test(line)));
  assert.deepEqual(Object.keys(present), [IDENTITY.mcpServerName]);
});

test("session-open evidence is sanitized and bounded", () => {
  const line = formatSessionOpenEvidence({
    result: "injected",
    agent: 'evil agent\nwith "quotes" and token abc',
    provider: "pi",
    reason: "resume",
    purpose: "interactive",
    transport: "stdio",
    alwaysLoad: true,
    server: IDENTITY.mcpServerName,
  });
  assert.equal(line.split("\n").length, 1, "one line per open");
  assert.ok(!line.includes(" " + '"'));
  assert.match(line, /agent=evil_agent_with__quotes__and_token_abc/);
  // An absent or hostile value falls back instead of emitting an empty field or
  // unbounded text.
  assert.equal(formatSessionOpenEvidence({
    result: "skipped",
    skip: "history",
    agent: "",
    provider: " ".repeat(4),
    reason: "create",
    purpose: "history",
    transport: "none",
    alwaysLoad: false,
    server: IDENTITY.mcpServerName,
  }), "session-open result=skipped skip=history server=html-render-v3 transport=none alwaysLoad=false agent=unattributed provider=unknown reason=create purpose=history");
  const bounded = formatSessionOpenEvidence({
    result: "injected",
    agent: "a".repeat(500),
    provider: "p",
    reason: "r",
    purpose: "interactive",
    transport: "stdio",
    alwaysLoad: true,
    server: IDENTITY.mcpServerName,
  });
  assert.ok(bounded.length < 300, "the line must stay bounded");
});

test("an agent can read a card published under a sibling workspace on the same cwd", async (t) => {
  const dataRoot = await fs.mkdtemp(join(tmpdir(), "hr-contribute-shared-"));
  const workspace = await fs.mkdtemp(join(tmpdir(), "hr-contribute-shared-ws-"));
  const previous = process.env.PASEO_HTML_RENDER_DATA_DIR;
  process.env.PASEO_HTML_RENDER_DATA_DIR = dataRoot;
  t.after(async () => {
    if (previous === undefined) delete process.env.PASEO_HTML_RENDER_DATA_DIR;
    else process.env.PASEO_HTML_RENDER_DATA_DIR = previous;
    await fs.rm(dataRoot, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  });

  const { server, handlers } = fakeServer();
  const cleanup = contribute(server);
  t.after(cleanup);
  // Two real Paseo workspaces can share one directory. Publish tie-breaks to
  // wks_aaa; the agent belongs to wks_zzz and must still read its own card.
  const paseo = fakePaseoWorkspaces(
    [
      { id: "wks_zzz", path: workspace },
      { id: "wks_aaa", path: workspace },
    ],
    { agent_sibling: "wks_zzz" },
  );

  const store = new ArtifactStore(dataRoot);
  const saved = await store.save({
    html: "<!doctype html><p>shared owner</p>",
    title: "Shared owner",
    summary: null,
    width: 728,
    height: 200,
    workspaceId: "wks_aaa",
    ownerCwd: workspace,
    previewPng: PNG,
  });

  const read = handlers.get(readArtifactRpc.name);
  assert.ok(read);
  const artifact = (await read(
    { artifactId: saved.manifest.artifactId, agentId: "agent_sibling" },
    { paseo },
  )) as { title: string; preview: { base64: string } };
  assert.equal(artifact.title, "Shared owner");
  assert.deepEqual(Buffer.from(artifact.preview.base64, "base64"), PNG);

  await assert.rejects(
    () => read({ artifactId: saved.manifest.artifactId, agentId: "agent_unknown" }, { paseo }) as Promise<unknown>,
    /not available for that agent/,
  );

  await cleanup();
});

test("report, asset, and interactive reads are exposed with ownership checks", async (t) => {
  const dataRoot = await fs.mkdtemp(join(tmpdir(), "hr-contribute-report-"));
  const workspace = await fs.mkdtemp(join(tmpdir(), "hr-contribute-report-ws-"));
  const previous = process.env.PASEO_HTML_RENDER_DATA_DIR;
  const previousPurge = process.env.PASEO_HTML_RENDER_PURGE_ON_ARCHIVE;
  process.env.PASEO_HTML_RENDER_DATA_DIR = dataRoot;
  delete process.env.PASEO_HTML_RENDER_PURGE_ON_ARCHIVE;
  t.after(async () => {
    if (previous === undefined) delete process.env.PASEO_HTML_RENDER_DATA_DIR;
    else process.env.PASEO_HTML_RENDER_DATA_DIR = previous;
    if (previousPurge === undefined) delete process.env.PASEO_HTML_RENDER_PURGE_ON_ARCHIVE;
    else process.env.PASEO_HTML_RENDER_PURGE_ON_ARCHIVE = previousPurge;
    await fs.rm(dataRoot, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  });

  const { server, handlers, events } = fakeServer();
  const cleanup = contribute(server);
  t.after(cleanup);
  const paseo = fakePaseo(workspace);

  const store = new ArtifactStore(dataRoot);
  const artifact = await store.save({
    html: "<!doctype html><p>report</p>",
    title: "Report",
    summary: "Summary",
    width: 728,
    height: 240,
    workspaceId: "wks_test",
    ownerCwd: workspace,
    measuredHeight: 200,
    heights: [[390, 190], [728, 200]],
    previewPng: PNG,
    previewLightPng: PNG,
    interactiveHtml: "<!doctype html><p>interactive</p>",
    report: {
      version: 1,
      outcome: { status: "success", headline: "Done" },
      blocks: [{ kind: "text", text: "Body" }],
    },
  });
  const readable = { artifactId: artifact.manifest.artifactId, agentId: "agent_ok" };

  const read = (await handlers.get(readArtifactRpc.name)!(readable, { paseo })) as {
    hasReport: boolean;
    report: unknown;
    interactivePath?: string;
    measuredHeight?: number;
    heights?: unknown;
    themePreview?: { light: boolean };
    assets: { previewLight: boolean; graphDark: boolean; graphLight: boolean };
  };
  assert.equal(read.hasReport, true);
  assert.deepEqual(read.report, artifact.manifest.report);
  assert.ok(read.interactivePath?.endsWith("interactive.html"));
  assert.equal(read.measuredHeight, 200);
  assert.deepEqual(read.heights, [[390, 190], [728, 200]]);
  assert.deepEqual(read.themePreview, { light: true, dark: true });
  assert.deepEqual(read.assets, { previewLight: true, graphDark: false, graphLight: false });

  const reportRead = (await handlers.get(readReportRpc.name)!(readable, { paseo })) as {
    report: unknown;
  };
  assert.deepEqual(reportRead.report, artifact.manifest.report);
  const assetRead = (await handlers.get(readAssetRpc.name)!(
    { ...readable, asset: "previewLight" },
    { paseo },
  )) as { base64: string; byteLength: number; mimeType: string };
  assert.equal(assetRead.mimeType, "image/png");
  assert.equal(assetRead.byteLength, PNG.byteLength);
  assert.deepEqual(Buffer.from(assetRead.base64, "base64"), PNG);
  const original = (await handlers.get(readOriginalArtifactRpc.name)!(readable, { paseo })) as {
    html: string;
    interactiveHtml?: string;
    interactivePath?: string;
  };
  assert.equal(original.html, "<!doctype html><p>report</p>");
  assert.equal(original.interactiveHtml, "<!doctype html><p>interactive</p>");
  assert.ok(original.interactivePath?.endsWith("interactive.html"));

  const other = { ...readable, agentId: "agent_other" };
  for (const [name, input] of [
    [readReportRpc.name, other],
    [readAssetRpc.name, { ...other, asset: "preview" }],
    [readOriginalArtifactRpc.name, other],
  ] as const) {
    await assert.rejects(
      () => handlers.get(name)!(input, { paseo }) as Promise<unknown>,
      /not available for that agent/,
    );
  }

  // Retention is non-destructive unless the environment opts in.
  const archive = events.get("workspace.archived");
  assert.ok(archive);
  await archive({ workspace: { id: "wks_test", projectId: "p", cwd: workspace, name: null, archivedAt: "now" } }, { paseo });
  assert.ok(await fs.stat(join(dataRoot, "artifacts", artifact.manifest.artifactId)));

  process.env.PASEO_HTML_RENDER_PURGE_ON_ARCHIVE = "1";
  await archive({ workspace: { id: "wks_test", projectId: "p", cwd: workspace, name: null, archivedAt: "now" } }, { paseo });
  await assert.rejects(() => fs.stat(join(dataRoot, "artifacts", artifact.manifest.artifactId)));

  await cleanup();
});
