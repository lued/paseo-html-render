import assert from "node:assert/strict";
import test from "node:test";
import { RenderError } from "../server/renderer.ts";
import {
  assertSafeGraphSvg,
  buildGraphHtml,
  createGraphRenderer,
  escapeGraphEdgeLabel,
  escapeGraphNodeLabel,
  GraphRenderError,
  graphToMermaid,
  MAX_GRAPH_MERMAID_CHARS,
  renderReportGraph,
  validateReportGraph,
  type RenderReportGraphOptions,
} from "../server/graph.ts";
import {
  MAX_GRAPH_EDGES,
  MAX_GRAPH_NODES,
  MAX_PREVIEW_PNG_BYTES,
} from "../shared/limits.ts";
import type { RenderInput, RenderOutput } from "../server/renderer.ts";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

interface CapturedRender {
  input: RenderInput;
}

function fakeRasterizer(
  captures: CapturedRender[] = [],
  output?: (input: RenderInput) => RenderOutput,
): { render(input: RenderInput): Promise<RenderOutput> } {
  return {
    async render(input) {
      captures.push({ input });
      if (output) return output(input);
      return {
        png: PNG,
        width: input.width ?? 728,
        contentHeight: 120,
        capturedHeight: 120,
      };
    },
  };
}

const HOSTILE_GRAPH = {
  id: "main",
  nodes: [
    { id: "a", label: 'Plan "quoted" ] --> n9["PWNED' },
    { id: "b", label: "<script>alert(1)</script> [b] (c) {d} | e" },
    { id: "c", label: 'line one line two %%{init: {"theme":"dark"}}%% \\ end' },
  ],
  edges: [
    { from: "a", to: "b", label: 'yes | no <b>bold</b> "quoted"' },
    { from: "b", to: "c", label: "x[y](z){w}|v\\tail" },
  ],
  decisions: [{ id: "d1", label: "Ship it?", nodeId: "b", choice: "yes" }],
};

// ---------------------------------------------------------------------------
// Escaping and syntax generation
// ---------------------------------------------------------------------------

test("node labels neutralize quotes, brackets, HTML, newlines and directives", () => {
  const label = escapeGraphNodeLabel('x"] --> n9["PWNED]\n<script>%%{init: {"theme":"dark"}}%%');
  assert.ok(!label.includes('"'));
  assert.ok(!label.includes("[") && !label.includes("]"));
  assert.ok(!label.includes("<") && !label.includes(">"));
  assert.ok(!label.includes("\n"));
  assert.ok(!label.includes("%"));
  assert.ok(label.includes("&quot;"));
  assert.ok(label.length <= 200);
});

test("edge labels cannot open Mermaid structure or inline HTML", () => {
  const label = escapeGraphEdgeLabel('a|b[c](d){e}<b>x</b>"q"\\z%');
  assert.ok(!/[|()[\]{}<>"`\\%]/.test(label), label);
  assert.ok(label.includes("'q'"));
});

test("graphToMermaid uses generated ids, never report ids", () => {
  const graph = validateReportGraph(HOSTILE_GRAPH);
  const mermaid = graphToMermaid(graph);
  assert.ok(mermaid.startsWith("flowchart LR\n"));
  assert.ok(mermaid.includes('n0["'));
  assert.ok(!mermaid.includes('a["'));
  assert.ok(!mermaid.includes('b["'));
  assert.ok(!mermaid.includes("click "));
  assert.ok(!mermaid.includes("subgraph"));
  assert.ok(!mermaid.includes("<script"));
  assert.ok(mermaid.length <= MAX_GRAPH_MERMAID_CHARS);
});

test("hostile labels cannot add nodes or inject SVG in a real Pele layout", async () => {
  const captures: CapturedRender[] = [];
  const result = await renderReportGraph(HOSTILE_GRAPH, fakeRasterizer(captures));
  assert.equal(captures.length, 2);
  const html = captures[0]!.input.html;
  const nodeGroups = html.match(/class="pele-node /g) ?? [];
  assert.equal(nodeGroups.length, 3, "the injected n9 node must not exist");
  assert.ok(!/<script/i.test(html));
  assert.ok(!/href=|javascript:|onload=/i.test(html));
  assert.equal(result.metadata.nodeCount, 3);
  assert.equal(result.metadata.edgeCount, 2);
  assert.equal(result.metadata.decisionCount, 1);
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test("validateReportGraph enforces schema and endpoint references", () => {
  assert.doesNotThrow(() => validateReportGraph(HOSTILE_GRAPH));
  const invalid = (graph: unknown, code = "invalid_graph") => {
    assert.throws(
      () => validateReportGraph(graph),
      (error: unknown) => error instanceof GraphRenderError && error.code === code,
    );
  };
  invalid({ nodes: [{ id: "a", label: "a" }, { id: "a", label: "b" }], edges: [] });
  invalid({ nodes: [{ id: "a", label: "a" }], edges: [{ from: "a", to: "missing" }] });
  invalid({ nodes: [{ id: "a", label: "a" }], edges: [{ from: "missing", to: "a" }] });
  invalid({
    nodes: [{ id: "a", label: "a" }],
    edges: [],
    decisions: [{ id: "d", label: "d", nodeId: "missing" }],
  });
  invalid({ nodes: [{ id: "a", label: "a" }], edges: [], extra: true });
  invalid({ nodes: [{ id: "a", label: "bad\u0000label" }], edges: [] });
  invalid({ nodes: [{ id: "bad id!", label: "a" }], edges: [] });
  invalid({ nodes: [], edges: [] });
});

test("graph node, edge, and label counts are bounded", () => {
  const node = (index: number) => ({ id: `n${index}`, label: "x" });
  const overNodes = {
    nodes: Array.from({ length: MAX_GRAPH_NODES + 1 }, (_, index) => node(index)),
    edges: [],
  };
  assert.throws(
    () => validateReportGraph(overNodes),
    (error: unknown) => error instanceof GraphRenderError && error.code === "invalid_graph",
  );
  const edges = Array.from({ length: MAX_GRAPH_EDGES + 1 }, () => ({ from: "n0", to: "n1" }));
  const overEdges = { nodes: [node(0), node(1)], edges };
  assert.throws(
    () => validateReportGraph(overEdges),
    (error: unknown) => error instanceof GraphRenderError && error.code === "invalid_graph",
  );
  assert.throws(
    () => validateReportGraph({ nodes: [{ id: "a", label: "x".repeat(201) }], edges: [] }),
    (error: unknown) => error instanceof GraphRenderError && error.code === "invalid_graph",
  );
});

test("malformed graphs fail before any rasterization", async () => {
  let renders = 0;
  await assert.rejects(
    () =>
      renderReportGraph(
        { nodes: [{ id: "a", label: "a" }], edges: [{ from: "a", to: "b" }] },
        {
          async render() {
            renders += 1;
            return { png: PNG, width: 728, contentHeight: 1, capturedHeight: 1 };
          },
        },
      ),
    (error: unknown) => error instanceof GraphRenderError && error.code === "invalid_graph",
  );
  assert.equal(renders, 0);
});

// ---------------------------------------------------------------------------
// SVG and page validation
// ---------------------------------------------------------------------------

test("SVG validation accepts Pele output and rejects executable markup", () => {
  assert.doesNotThrow(() =>
    assertSafeGraphSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g><rect width="10" height="10"/><text x="1" y="5">ok</text></g></svg>',
    ),
  );
  for (const svg of [
    '<svg><script>alert(1)</script></svg>',
    '<svg><a href="https://example.com">x</a></svg>',
    '<svg><image href="data:image/png;base64,AA"/></svg>',
    '<svg><foreignObject><div>x</div></foreignObject></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><rect fill="url(#x)"/></svg>',
    '<!doctype svg><svg></svg>',
    "<svg></svg><script>alert(1)</script>",
  ]) {
    assert.throws(
      () => assertSafeGraphSvg(svg),
      (error: unknown) => error instanceof GraphRenderError,
      svg,
    );
  }
});

test("graph pages carry only the fixed inert wrapper", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>ok</text></svg>';
  const html = buildGraphHtml(svg);
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("--pele-bg:var(--background)"));
  assert.ok(!html.includes("<script"));
  assert.throws(
    () => buildGraphHtml(`<svg>${"x".repeat(512_000)}</svg>`),
    (error: unknown) => error instanceof GraphRenderError,
  );
});

// ---------------------------------------------------------------------------
// Rasterization contract
// ---------------------------------------------------------------------------

test("rasterizer failures stay catchable and never lose the graph ids", async () => {
  await assert.rejects(
    () =>
      renderReportGraph(HOSTILE_GRAPH, {
        async render() {
          throw new RenderError("browser_unavailable", "no browser");
        },
      }),
    (error: unknown) => error instanceof GraphRenderError && error.code === "render_failed",
  );
  await assert.rejects(
    () =>
      renderReportGraph(
        HOSTILE_GRAPH,
        fakeRasterizer([], () => ({
          png: Buffer.alloc(MAX_PREVIEW_PNG_BYTES + 1),
          width: 728,
          contentHeight: 10,
          capturedHeight: 10,
        })),
      ),
    (error: unknown) => error instanceof GraphRenderError && error.code === "output_too_large",
  );
});

test("appearance and width options are bounded before rendering", async () => {
  let renders = 0;
  const counter = {
    async render(): Promise<RenderOutput> {
      renders += 1;
      return { png: PNG, width: 728, contentHeight: 1, capturedHeight: 1 };
    },
  };
  for (const options of [
    { width: 239 },
    { width: 1601 },
    { width: 728.5 },
    { appearances: [] },
    { appearances: ["sepia" as never] },
  ] satisfies RenderReportGraphOptions[]) {
    await assert.rejects(
      () => renderReportGraph(HOSTILE_GRAPH, counter, options),
      (error: unknown) => error instanceof GraphRenderError && error.code === "invalid_graph",
    );
  }
  assert.equal(renders, 0);
});

test("light/dark images and store-ready metadata are returned", async () => {
  const captures: CapturedRender[] = [];
  const graphRenderer = createGraphRenderer(fakeRasterizer(captures));
  const result = await graphRenderer.renderGraph(HOSTILE_GRAPH);
  assert.equal(captures.length, 2);
  assert.deepEqual(
    captures.map(({ input }) => input.appearance),
    ["light", "dark"],
  );
  assert.ok(result.light && result.dark);
  assert.equal(result.light.width, 728);
  assert.equal(result.graphId, "main");
  assert.deepEqual(result.metadata, {
    id: "main",
    nodeCount: 3,
    edgeCount: 2,
    decisionCount: 1,
    previewLight: true,
    previewDark: true,
  });

  const darkOnly = await renderReportGraph(HOSTILE_GRAPH, fakeRasterizer(), {
    appearances: ["dark"],
    width: 390,
  });
  assert.equal(darkOnly.light, undefined);
  assert.ok(darkOnly.dark);
  assert.equal(darkOnly.dark.width, 390);
  assert.equal(darkOnly.metadata.previewLight, false);
  assert.equal(darkOnly.metadata.previewDark, true);
});
