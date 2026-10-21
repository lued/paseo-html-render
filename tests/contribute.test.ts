import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PaseoApi } from "@getpaseo/client";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import contribute from "../server/contribute.ts";
import { ArtifactStore } from "../server/artifacts.ts";
import { readArtifactRpc, readAssetRpc, readOriginalArtifactRpc, readReportRpc } from "../shared/protocol.ts";

type Handler = (input: unknown, context: { paseo: PaseoApi }) => Promise<unknown>;
type BeforeHook = (input: { request: unknown }, context: unknown) => Promise<unknown>;
type EventHook = (event: unknown, context: unknown) => Promise<void> | void;

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

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

test("daemon entry injects MCP into new agents, serves owned artifacts, and cleans up", async (t) => {
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

  const cleanup = contribute(server);
  const paseo = fakePaseo(workspace);

  // A resumed agent establishes authority through the public session-open hook.
  const sessionOpen = hooks.get("agent.session_open");
  assert.ok(sessionOpen);
  assert.equal(
    await sessionOpen(
      { request: { agentId: "agent_ok", workspaceId: "wks_test", provider: "pi", cwd: workspace, reason: "resume", purpose: "interactive", env: {} } },
      { paseo, signal: new AbortController().signal },
    ),
    undefined,
  );

  // A running agent whose plugin was reloaded mid-session warms on turn start.
  const turnStarted = events.get("agent.turn_started");
  assert.ok(turnStarted);
  await turnStarted(
    { agent: { id: "agent_ok", workspaceId: "wks_test", parentAgentId: null, provider: "pi", cwd: workspace, title: null } },
    { paseo, signal: new AbortController().signal },
  );

  const hook = hooks.get("agent.create");
  assert.ok(hook);
  const existing = { provider: "pi", cwd: workspace, mcpServers: { other: { type: "stdio", command: "x" } } };
  const result = (await hook({ request: { config: existing } }, { paseo, signal: new AbortController().signal })) as {
    config: { mcpServers: Record<string, { type: string; command: string; args: string[]; env: Record<string, string> }> };
  };
  // The request object is not mutated in place.
  assert.equal(Object.keys(existing.mcpServers).length, 1);
  assert.deepEqual(Object.keys(result.config.mcpServers).sort(), ["html-render", "other"]);
  const injected = result.config.mcpServers["html-render"];
  assert.equal(injected?.type, "stdio");
  assert.equal(injected?.command, process.execPath);
  assert.ok(injected?.args[0]?.endsWith(".mjs"));
  assert.equal(injected?.env.PASEO_HTML_RENDER_CWD, workspace);
  assert.ok(injected?.env.PASEO_HTML_RENDER_TOKEN);
  // A desktop-managed daemon runs the adapter through its Electron binary, which
  // needs this to behave as Node instead of starting the GUI and closing stdio.
  assert.equal(injected?.env.ELECTRON_RUN_AS_NODE, "1");
  assert.ok((await fs.stat(injected!.args[0]!)).size > 1_000);

  // The token is shared by every future plugin process, not per-process state.
  const tokenPath = join(dataRoot, "bridge.token");
  assert.equal((await fs.stat(tokenPath)).mode & 0o777, 0o600);
  assert.equal((await fs.readFile(tokenPath, "utf8")).trim(), injected!.env.PASEO_HTML_RENDER_TOKEN);

  // The adapter file and bridge socket exist before any render is requested.
  assert.ok(await fs.stat(join(dataRoot, "bridge.sock")));

  const store = new ArtifactStore(dataRoot);
  const saved = await store.save({
    html: "<!doctype html><p>owned</p>",
    title: "Owned",
    summary: null,
    width: 728,
    height: 200,
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
    preview: { base64: string };
  };
  assert.equal(artifact.title, "Owned");
  assert.deepEqual(Buffer.from(artifact.preview.base64, "base64"), PNG);
  const html = (await original({ artifactId: saved.manifest.artifactId, agentId: "agent_ok" }, { paseo })) as {
    html: string;
  };
  assert.equal(html.html, "<!doctype html><p>owned</p>");

  await assert.rejects(
    () => read({ artifactId: saved.manifest.artifactId, agentId: "agent_other" }, { paseo }) as Promise<unknown>,
    /not available for that agent/,
  );

  await cleanup();
  await assert.rejects(() => fs.stat(join(dataRoot, "bridge.sock")));
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

  const handlers = new Map<string, Handler>();
  const server = {
    handle(contract: { name: string }, handler: Handler) {
      handlers.set(contract.name, handler);
    },
    before() {
      return () => {};
    },
    on() {
      return () => {};
    },
  } as unknown as PluginServerContext;

  const cleanup = contribute(server);
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

  const handlers = new Map<string, Handler>();
  const events = new Map<string, EventHook>();
  const server = {
    handle(contract: { name: string }, handler: Handler) {
      handlers.set(contract.name, handler);
    },
    before() {
      return () => {};
    },
    on(name: string, handler: EventHook) {
      events.set(name, handler);
      return () => {};
    },
  } as unknown as PluginServerContext;
  const cleanup = contribute(server);
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
