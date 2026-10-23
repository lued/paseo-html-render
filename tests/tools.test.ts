import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ArtifactStore } from "../server/artifacts.ts";
import type { Renderer } from "../server/renderer.ts";
import { createHtmlTools, ToolError } from "../server/tools.ts";
import {
  createTurnGuard,
  guardKey,
  htmlFingerprint,
  MAX_CARDS_ENV,
  maxCardsPerTurn,
} from "../server/turn-guard.ts";
import { encodeReportReference } from "../shared/recognize.ts";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const context = { workspaceId: "wks_test", cwd: "/tmp/workspace" };

function fakeRenderer(capturedHeight = 102): Renderer {
  return {
    async render() {
      return { png: PNG, width: 728, contentHeight: capturedHeight, capturedHeight };
    },
    async close() {},
  };
}

async function tempStore(t: { after(fn: () => Promise<void>): void }): Promise<ArtifactStore> {
  const root = await fs.mkdtemp(join(tmpdir(), "html-render-tools-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return new ArtifactStore(root);
}

async function tempStoreWithRoot(
  t: { after(fn: () => Promise<void>): void },
): Promise<{ store: ArtifactStore; root: string }> {
  const root = await fs.mkdtemp(join(tmpdir(), "html-render-tools-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { store: new ArtifactStore(root), root };
}

function countingRenderer(counter: { renders: number }): Renderer {
  return {
    async render() {
      counter.renders += 1;
      return { png: PNG, width: 728, contentHeight: 120, capturedHeight: 120 };
    },
    async close() {},
  };
}

test("html_render stores the requested frame height, not the measured capture", async (t) => {
  const store = await tempStore(t);
  const tools = createHtmlTools({ renderer: fakeRenderer(102), store });
  const result = await tools.publish(
    { html: "<h1>tall frame</h1>", title: "  Frame height  ", height: 300, summary: " s " },
    context,
  );
  assert.equal(result.htmlRender.height, 300);
  assert.equal(result.htmlRender.title, "Frame height");
  assert.equal(result.htmlRender.width, 728);
  assert.equal(result.summary, "s");

  const { manifest } = await store.readPreview(result.htmlRender.artifactId, "wks_test");
  assert.equal(manifest.height, 300);
  assert.equal(manifest.measuredHeight, 102);
  assert.equal(manifest.summary, "s");

  const card = encodeReportReference({
    artifactId: manifest.artifactId,
    title: manifest.title,
    summary: manifest.summary,
    width: manifest.width,
    height: result.htmlRender.height,
  });
  assert.ok(card.length > 0);
  assert.ok(new TextDecoder().decode(new TextEncoder().encode(card)) === card);
});

test("html_render keeps the contract height bounds", async (t) => {
  const store = await tempStore(t);
  const tools = createHtmlTools({ renderer: fakeRenderer(), store });
  for (const height of [79, 2001, 0, -5]) {
    await assert.rejects(
      () => tools.publish({ html: "<p>x</p>", title: "x", height }, context),
      (error: unknown) => error instanceof ToolError && error.code === "invalid_input",
      `height ${height} must be rejected`,
    );
  }
  for (const height of [80, 2000]) {
    const result = await tools.publish({ html: "<p>x</p>", title: "x", height }, context);
    assert.equal(result.htmlRender.height, height);
  }
});

interface FakeCapture {
  html: string;
  prepared: boolean;
  appearance: string | undefined;
}

function fullRenderer(
  captures: FakeCapture[] = [],
  options: { failLight?: boolean; failGraph?: boolean } = {},
): Renderer & {
  renderPrepared(input: { html: string; width?: number; appearance?: "light" | "dark" }): Promise<{
    png: Buffer; width: number; contentHeight: number; capturedHeight: number;
  }>;
  measure(input: { html: string; widths: readonly number[] }): Promise<Array<[number, number]>>;
  measurePrepared(input: { html: string; widths: readonly number[] }): Promise<Array<[number, number]>>;
} {
  const render = async (input: {
    html: string;
    width?: number;
    appearance?: "light" | "dark";
  }, prepared: boolean) => {
    captures.push({ html: input.html, prepared, appearance: input.appearance });
    if (options.failGraph && input.html.includes("--pele-bg")) {
      throw new Error("graph rasterization refused");
    }
    if (options.failLight && input.appearance === "light" && !input.html.includes("--pele-bg")) {
      throw new Error("light preview unavailable");
    }
    return { png: PNG, width: input.width ?? 728, contentHeight: 120, capturedHeight: 120 };
  };
  return {
    render: (input) => render(input, false),
    renderPrepared: (input) => render(input, true),
    measure: async ({ widths }) => widths.map((width) => [width, 100 + width] as [number, number]),
    measurePrepared: async ({ widths }) => widths.map((width) => [width, 100 + width] as [number, number]),
    async close() {},
  };
}

const REPORT = {
  version: 1 as const,
  outcome: { status: "success" as const, headline: "Shipped" },
  metrics: [{ label: "Tests", value: "106" }],
  blocks: [{ kind: "text" as const, text: "Bounded body." }],
};

test("publish stores a report, prepared interactive HTML, heights, and the exact link contract", async (t) => {
  const store = await tempStore(t);
  const captures: FakeCapture[] = [];
  const tools = createHtmlTools({ renderer: fullRenderer(captures), store });
  const html = '<!doctype html><body><h1>Report</h1></body>';
  const result = await tools.publish({ html, title: "Report", height: 300, report: REPORT }, context);

  assert.equal(result.hasReport, true);
  assert.ok(result.interactivePath.startsWith("/"));
  assert.equal(result.message.includes(`[Open interactive report](<${result.interactivePath}>)`), true);
  assert.deepEqual(result.htmlRender.heights, [
    [320, 420], [375, 475], [430, 530], [520, 620], [640, 740],
    [728, 828], [860, 960], [1000, 1100], [1144, 1244],
  ]);
  assert.equal(result.htmlRender.measuredHeight, 120);

  const { manifest } = await store.readReport(result.htmlRender.artifactId, "wks_test");
  assert.deepEqual(manifest.report, REPORT);
  assert.equal(manifest.reportBytes, Buffer.byteLength(JSON.stringify(REPORT)));
  assert.deepEqual(manifest.heights, result.htmlRender.heights);
  assert.deepEqual(manifest.themePreview, { light: true, dark: true });
  const interactive = await store.readInteractive(result.htmlRender.artifactId, "wks_test");
  assert.ok(interactive?.html.includes("Content-Security-Policy"));
  assert.equal(interactive?.path, result.interactivePath);
  assert.equal((await store.readOriginal(result.htmlRender.artifactId, "wks_test")).html, html);
  // The dark preview and the light preview both rendered, and prepared input
  // (image-inlined) is covered by the image test below.
  assert.ok(captures.some((entry) => entry.appearance === "dark"));
  assert.ok(captures.some((entry) => entry.appearance === "light"));
});

test("publish inlines workspace images and reports missing ones without failing", async (t) => {
  const store = await tempStore(t);
  const cwd = await fs.mkdtemp(join(tmpdir(), "hr-tools-ws-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  await fs.mkdir(join(cwd, "img"));
  await fs.writeFile(join(cwd, "img", "a.png"), png);
  const tools = createHtmlTools({ renderer: fullRenderer(), store });
  const html = '<h1>x</h1><img src="img/a.png"><img src="missing.png">';
  const local = { ...context, cwd, workspaceRoot: cwd };
  const result = await tools.publish({ html, title: "Images", height: 200 }, local);
  assert.equal(result.hasReport, false);
  assert.deepEqual(result.missingImages?.map((entry) => entry.reason), ["not_found"]);
  const stored = await store.readOriginal(result.htmlRender.artifactId, "wks_test");
  assert.equal(stored.html, html, "original HTML stays byte-identical");
  const interactive = await store.readInteractive(result.htmlRender.artifactId, "wks_test");
  assert.ok(interactive?.html.includes("data:image/png;base64,"));

  const preview = await tools.preview({ html }, local);
  assert.deepEqual(preview.missingImages?.map((entry) => entry.reason), ["not_found"]);
  assert.equal(preview.screenshot.height, 120);
});

test("optional light-preview and graph failures warn but keep the primary publish", async (t) => {
  const store = await tempStore(t);
  const graphReport = {
    ...REPORT,
    blocks: [{ kind: "graph" as const, graphId: "main" }],
    graph: {
      id: "main",
      nodes: [{ id: "a", label: "Plan" }, { id: "b", label: "Build" }],
      edges: [{ from: "a", to: "b" }],
    },
  };
  const tools = createHtmlTools({
    renderer: fullRenderer([], { failLight: true, failGraph: true }),
    store,
  });
  const result = await tools.publish(
    { html: "<p>graph</p>", title: "Graph", height: 200, report: graphReport },
    context,
  );
  assert.equal(result.hasReport, true);
  assert.equal(result.warnings?.length, 2);
  assert.ok(result.warnings?.some((warning) => warning.includes("Light preview")));
  assert.ok(result.warnings?.some((warning) => warning.includes("Graph preview")));
  const { manifest } = await store.readReport(result.htmlRender.artifactId, "wks_test");
  assert.equal(manifest.themePreview, undefined);
  assert.deepEqual(manifest.graph, {
    id: "main",
    nodeCount: 2,
    edgeCount: 1,
    decisionCount: 0,
    previewLight: false,
    previewDark: false,
  });
});

test("a valid report graph is rasterized into stored light and dark PNGs", async (t) => {
  const store = await tempStore(t);
  const tools = createHtmlTools({ renderer: fullRenderer(), store });
  const report = {
    ...REPORT,
    blocks: [{ kind: "graph" as const, graphId: "main" }],
    graph: { nodes: [{ id: "one", label: "One" }], edges: [] },
  };
  const result = await tools.publish({ html: "<p>g</p>", title: "G", height: 200, report }, context);
  const { manifest } = await store.readReport(result.htmlRender.artifactId, "wks_test");
  assert.equal(manifest.graph?.previewLight, true);
  assert.equal(manifest.graph?.previewDark, true);
  const dark = await store.readAsset(result.htmlRender.artifactId, "wks_test", "graphDark");
  assert.deepEqual(dark.png, PNG);
  const light = await store.readAsset(result.htmlRender.artifactId, "wks_test", "graphLight");
  assert.deepEqual(light.png, PNG);
});

test("an invalid or oversized report is rejected before storage", async (t) => {
  const store = await tempStore(t);
  const tools = createHtmlTools({ renderer: fullRenderer(), store });
  for (const report of [
    { ...REPORT, extra: true },
    { ...REPORT, version: 2 },
    { ...REPORT, blocks: [] },
    { ...REPORT, outcome: { status: "success", headline: "" } },
  ]) {
    await assert.rejects(
      () => tools.publish({ html: "<p>x</p>", title: "x", height: 100, report }, context),
      (error: unknown) => error instanceof ToolError && error.code === "invalid_input",
    );
  }
});

function guardedTools(
  renderer: Renderer,
  store: ArtifactStore,
  options: { maxCardsPerTurn?: number } = {},
) {
  const guard = createTurnGuard(options);
  return { guard, tools: createHtmlTools({ renderer, store, guard }) };
}

test("a second card in the same turn is refused before rendering or storage", async (t) => {
  const { store, root } = await tempStoreWithRoot(t);
  const counter = { renders: 0 };
  const { guard, tools } = guardedTools(countingRenderer(counter), store);
  const agent = { ...context, agentId: "agent_a" };
  const key = guardKey(agent.agentId, agent.cwd);
  guard.beginTurn(key, "turn-1");

  const first = await tools.publish({ html: "<h1>one</h1>", title: "One", height: 200 }, agent);
  const rendersAfterFirst = counter.renders;
  assert.ok(rendersAfterFirst > 0);

  await assert.rejects(
    () => tools.publish({ html: "<h1>two</h1>", title: "Two", height: 200 }, agent),
    (error: unknown) => {
      assert.ok(error instanceof ToolError);
      assert.equal(error.code, "duplicate");
      assert.ok(error.message.includes(first.htmlRender.artifactId));
      assert.match(error.message, /Keep the rest in your reply/);
      return true;
    },
  );
  // A refused card costs nothing: no render, no stored artifact.
  assert.equal(counter.renders, rendersAfterFirst);
  assert.deepEqual(await fs.readdir(join(root, "artifacts")), [first.htmlRender.artifactId]);
});

test("a later turn allows new content and still refuses identical HTML", async (t) => {
  const store = await tempStore(t);
  const { guard, tools } = guardedTools(fakeRenderer(), store);
  const agent = { ...context, agentId: "agent_a" };
  const key = guardKey(agent.agentId, agent.cwd);

  guard.beginTurn(key, "turn-1");
  await tools.publish({ html: "<h1>one</h1>", title: "One", height: 200 }, agent);

  guard.beginTurn(key, "turn-2");
  const second = await tools.publish({ html: "<h1>two</h1>", title: "Two", height: 200 }, agent);
  assert.ok(second.htmlRender.artifactId);

  guard.beginTurn(key, "turn-3");
  await assert.rejects(
    () => tools.publish({ html: "<h1>two</h1>", title: "Two again", height: 200 }, agent),
    (error: unknown) =>
      error instanceof ToolError &&
      error.code === "duplicate" &&
      error.message.includes(second.htmlRender.artifactId) &&
      error.message.includes("Nothing changed"),
  );
});

test("whitespace- and comment-only changes count as identical", async (t) => {
  const store = await tempStore(t);
  const { guard, tools } = guardedTools(fakeRenderer(), store);
  const agent = { ...context, agentId: "agent_a" };
  const key = guardKey(agent.agentId, agent.cwd);

  guard.beginTurn(key, "turn-1");
  const first = await tools.publish({ html: "<h1>one</h1>\n<p>body</p>", title: "One", height: 200 }, agent);

  guard.beginTurn(key, "turn-2");
  await assert.rejects(
    () =>
      tools.publish(
        { html: "\n  <h1>one</h1>   <!-- retry -->\n<p>body</p>  ", title: "One", height: 200 },
        agent,
      ),
    (error: unknown) =>
      error instanceof ToolError &&
      error.code === "duplicate" &&
      error.message.includes(first.htmlRender.artifactId) &&
      error.message.includes("Nothing changed"),
  );
});

test("the environment switch disables the guard without changing publish", async (t) => {
  const store = await tempStore(t);
  const limit = maxCardsPerTurn({ [MAX_CARDS_ENV]: "0" });
  assert.equal(limit, 0);
  const { guard, tools } = guardedTools(fakeRenderer(), store, { maxCardsPerTurn: limit });
  const agent = { ...context, agentId: "agent_a" };
  guard.beginTurn(guardKey(agent.agentId, agent.cwd), "turn-1");

  const first = await tools.publish({ html: "<h1>same</h1>", title: "One", height: 200 }, agent);
  const second = await tools.publish({ html: "<h1>same</h1>", title: "One", height: 200 }, agent);
  assert.notEqual(first.htmlRender.artifactId, second.htmlRender.artifactId);
});

test("two agents in one workspace do not share a card budget", async (t) => {
  const store = await tempStore(t);
  const { guard, tools } = guardedTools(fakeRenderer(), store);
  const agentA = { ...context, agentId: "agent_a" };
  const agentB = { ...context, agentId: "agent_b" };
  guard.beginTurn(guardKey(agentA.agentId, agentA.cwd), "turn-1");
  guard.beginTurn(guardKey(agentB.agentId, agentB.cwd), "turn-1");

  // Same HTML on purpose: the keys are separate, so this is not a duplicate.
  const first = await tools.publish({ html: "<h1>shared</h1>", title: "Shared", height: 200 }, agentA);
  const second = await tools.publish({ html: "<h1>shared</h1>", title: "Shared", height: 200 }, agentB);
  assert.notEqual(first.htmlRender.artifactId, second.htmlRender.artifactId);
});

test("html_preview never consults the guard and never spends the turn budget", async (t) => {
  const store = await tempStore(t);
  const { guard, tools } = guardedTools(fakeRenderer(), store, { maxCardsPerTurn: 2 });
  const agent = { ...context, agentId: "agent_a" };
  const key = guardKey(agent.agentId, agent.cwd);
  guard.beginTurn(key, "turn-1");
  await tools.publish({ html: "<h1>one</h1>", title: "One", height: 200 }, agent);

  const preview = await tools.preview({ html: "<h1>two</h1>" }, agent);
  assert.equal(preview.screenshot.mimeType, "image/png");
  // Repeating an identical preview is never a duplicate.
  await tools.preview({ html: "<h1>one</h1>" }, agent);

  // The second card still fits the turn's budget of two.
  const second = await tools.publish({ html: "<h1>two</h1>", title: "Two", height: 200 }, agent);
  assert.ok(second.htmlRender.artifactId);
});

test("a failed publish is not remembered as a card", async (t) => {
  const store = await tempStore(t);
  let fail = true;
  const renderer: Renderer = {
    async render() {
      if (fail) {
        fail = false;
        throw new Error("renderer exploded");
      }
      return { png: PNG, width: 728, contentHeight: 120, capturedHeight: 120 };
    },
    async close() {},
  };
  const { guard, tools } = guardedTools(renderer, store);
  const agent = { ...context, agentId: "agent_a" };
  guard.beginTurn(guardKey(agent.agentId, agent.cwd), "turn-1");

  await assert.rejects(
    () => tools.publish({ html: "<h1>one</h1>", title: "One", height: 200 }, agent),
    (error: unknown) => error instanceof ToolError && error.code === "render_failed",
  );
  // The HTML was never recorded, so the same content is not "nothing changed".
  const retried = await tools.publish({ html: "<h1>one</h1>", title: "One", height: 200 }, agent);
  assert.ok(retried.htmlRender.artifactId);
});

test("htmlFingerprint is what the guard compares, not the raw string", async (t) => {
  const store = await tempStore(t);
  const { guard, tools } = guardedTools(fakeRenderer(), store);
  const agent = { ...context, agentId: "agent_a" };
  const key = guardKey(agent.agentId, agent.cwd);
  guard.beginTurn(key, "turn-1");
  await tools.publish({ html: "<h1>x</h1>", title: "X", height: 200 }, agent);
  // Direct proof the guard is keyed on the normalized hash: the same content
  // under different spacing is refused even before any publish happens.
  assert.equal(
    guard.check({ key, hash: htmlFingerprint("<h1>x</h1>\n<!-- note -->") }).ok,
    false,
  );
});
