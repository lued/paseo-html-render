import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ASSET_PNG_BYTES,
  MAX_INTERACTIVE_HTML_BYTES,
  MAX_REPORT_BLOCKS,
  MAX_REPORT_BYTES,
  MAX_REPORT_LIST_ITEMS,
  MAX_REPORT_TEXT_CHARS,
  MAX_REPORT_TABLE_ROWS,
  MAX_AGENT_ROWS,
  MAX_GRAPH_NODES,
  MAX_METRICS,
  MAX_USAGE_MODELS,
} from "../shared/limits.ts";
import {
  DEFAULT_GRAPH_ID,
  graphIdOf,
  parseReportModel,
  reportModelSchema,
  safeParseReportModel,
  serializeReportModel,
  serializedReportBytes,
  utf8ByteLength,
  type ReportBlockKind,
  type ReportModelV1,
} from "../shared/report-model.ts";
import {
  artifactManifestSchema,
  boundedBase64ImageSchema,
  interactiveHtmlSchema,
  interactivePathSchema,
  measuredHeightsSchema,
} from "../shared/protocol.ts";
import {
  assertMeasuredHeights,
  normalizeMeasureWidths,
  supportsMeasure,
} from "../server/renderer-types.ts";

const ALL_BLOCK_KINDS: ReportBlockKind[] = [
  "heading",
  "text",
  "bullets",
  "steps",
  "callout",
  "code",
  "table",
  "agents",
  "graph",
  "evidence",
];

function validReport(): ReportModelV1 {
  return {
    version: 1,
    outcome: {
      status: "success",
      headline: "Parity contracts frozen",
      detail: "Package A published bounded schemas and RPC shapes.",
    },
    summary: "A complete report exercising every block kind.",
    metrics: [
      { label: "Tests", value: "42", detail: "Focused suites", tone: "good" },
      { label: "Pending", value: "0", tone: "neutral" },
    ],
    blocks: [
      { kind: "heading", text: "Overview" },
      { kind: "text", text: "Narrative text with\nmultiple lines." },
      { kind: "bullets", items: ["First", "Second"] },
      { kind: "steps", items: ["Open", "Run", "Verify"] },
      { kind: "callout", tone: "warn", title: "Careful", text: "Bounded JSON only." },
      { kind: "code", language: "ts", text: "const answer = 42;" },
      { kind: "table", columns: ["Area", "Result"], rows: [["Schema", "pass"], ["RPC", "pass"]] },
      {
        kind: "agents",
        agents: [
          { name: "worker-a", role: "contracts", model: "model-a", status: "ok", summary: "Done." },
        ],
      },
      { kind: "graph", graphId: "run" },
      {
        kind: "evidence",
        items: [
          {
            label: "Plan",
            url: "https://example.com/plan",
            artifactPath: "artifacts/report.html",
            detail: "Checked locally.",
          },
        ],
      },
    ],
    graph: {
      id: "run",
      nodes: [
        { id: "start", label: "Start", tone: "good" },
        { id: "end", label: "End", kind: "step", tone: "neutral" },
      ],
      edges: [{ from: "start", to: "end", label: "then", tone: "neutral" }],
      decisions: [{ id: "ship", label: "Ship it", nodeId: "end", choice: "approved", detail: "Approved." }],
    },
    evidence: [{ label: "Repository", url: "https://example.com/repo" }],
    nextAction: "Run the focused tests.",
    promptLesson: { improvedPrompt: "Ask for bounded contracts first.", lesson: "Freeze schemas before handlers." },
    usage: {
      inputTokens: { provenance: "measured", value: 1_200 },
      outputTokens: { provenance: "estimated", value: 800 },
      cachedInputTokens: { provenance: "unavailable" },
      costUsd: { provenance: "unavailable" },
      durationMs: { provenance: "measured", value: 5_000 },
      models: [{ name: "model-a", provider: "provider-a", totalTokens: { provenance: "measured", value: 2_000 } }],
    },
  };
}

function issuesOf(value: unknown): string[] {
  const result = safeParseReportModel(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

test("valid report covers every block kind and round-trips through canonical JSON", () => {
  const report = validReport();
  const parsed = parseReportModel(report);
  assert.deepEqual(
    [...new Set(parsed.blocks.map((block) => block.kind))].sort(),
    [...ALL_BLOCK_KINDS].sort(),
  );
  assert.equal(parsed.version, 1);
  assert.equal(graphIdOf(parsed.graph), "run");
  assert.equal(graphIdOf(undefined), DEFAULT_GRAPH_ID);
  const json = serializeReportModel(parsed);
  assert.deepEqual(JSON.parse(json), parsed);
  assert.equal(serializedReportBytes(parsed), utf8ByteLength(json));
  assert.ok(serializedReportBytes(parsed) <= MAX_REPORT_BYTES);
});

test("utf8ByteLength counts multi-byte characters without Buffer", () => {
  assert.equal(utf8ByteLength("abc"), 3);
  assert.equal(utf8ByteLength("é"), 2);
  assert.equal(utf8ByteLength("😀"), 4);
});

test("version and unknown keys are strict", () => {
  assert.match(issuesOf({ ...validReport(), version: 2 }).join(" "), /Invalid input|version/i);
  assert.ok(issuesOf({ ...validReport(), extra: "nope" }).length > 0);
  const report = validReport();
  const withUnknownBlockKey = {
    ...report,
    blocks: [{ kind: "text", text: "hello", html: "<b>x</b>" }],
  };
  assert.ok(issuesOf(withUnknownBlockKey).length > 0);
});

test("blocks are bounded by count, length, list size and table shape", () => {
  const tooManyBlocks = validReport();
  tooManyBlocks.blocks = Array.from({ length: MAX_REPORT_BLOCKS + 1 }, () => ({
    kind: "text" as const,
    text: "x",
  }));
  assert.ok(issuesOf(tooManyBlocks).length > 0);

  assert.ok(issuesOf({ ...validReport(), blocks: [] }).length > 0);

  const longText = validReport();
  longText.blocks = [{ kind: "text", text: "x".repeat(MAX_REPORT_TEXT_CHARS + 1) }];
  assert.ok(issuesOf(longText).length > 0);

  const manyBullets = validReport();
  manyBullets.blocks = [
    { kind: "bullets", items: Array.from({ length: MAX_REPORT_LIST_ITEMS + 1 }, (_, i) => `item ${i}`) },
  ];
  assert.ok(issuesOf(manyBullets).length > 0);

  const raggedTable = validReport();
  raggedTable.blocks = [{ kind: "table", columns: ["A", "B"], rows: [["1"]] }];
  assert.match(issuesOf(raggedTable).join(" "), /exactly 2 cells/);

  const tooManyRows = validReport();
  tooManyRows.blocks = [
    {
      kind: "table",
      columns: ["A"],
      rows: Array.from({ length: MAX_REPORT_TABLE_ROWS + 1 }, () => ["x"]),
    },
  ];
  assert.ok(issuesOf(tooManyRows).length > 0);
});

test("metrics, agents and usage arrays are bounded", () => {
  const manyMetrics = validReport();
  manyMetrics.metrics = Array.from({ length: MAX_METRICS + 1 }, (_, i) => ({ label: `m${i}`, value: "1" }));
  assert.ok(issuesOf(manyMetrics).length > 0);

  const manyAgents = validReport();
  manyAgents.blocks = [
    {
      kind: "agents",
      agents: Array.from({ length: MAX_AGENT_ROWS + 1 }, (_, i) => ({ name: `agent-${i}` })),
    },
  ];
  assert.ok(issuesOf(manyAgents).length > 0);

  const manyModels = validReport();
  manyModels.usage = {
    models: Array.from({ length: MAX_USAGE_MODELS + 1 }, (_, i) => ({ name: `model-${i}` })),
  };
  assert.ok(issuesOf(manyModels).length > 0);
});

test("serialized report size is capped at 256 KiB", () => {
  const oversized = validReport();
  oversized.blocks = Array.from({ length: 20 }, () => ({
    kind: "code" as const,
    text: "x".repeat(19_000),
  }));
  const result = safeParseReportModel(oversized);
  assert.equal(result.success, false);
  assert.match(
    result.success ? "" : result.error.issues.map((issue) => issue.message).join(" "),
    /serialized report/,
  );
});

test("serialized report size is capped even without a graph", () => {
  const oversized = validReport();
  delete oversized.graph;
  oversized.blocks = Array.from({ length: 20 }, () => ({
    kind: "code" as const,
    text: "x".repeat(19_000),
  }));
  assert.match(issuesOf(oversized).join(" "), /serialized report/);
});

test("graph ids, edges and decisions are validated", () => {
  const duplicateNodes = validReport();
  duplicateNodes.graph = {
    id: "run",
    nodes: [
      { id: "same", label: "One" },
      { id: "same", label: "Two" },
    ],
    edges: [],
  };
  assert.match(issuesOf(duplicateNodes).join(" "), /duplicate graph node id/);

  const danglingEdge = validReport();
  danglingEdge.graph = {
    id: "run",
    nodes: [{ id: "a", label: "A" }],
    edges: [{ from: "a", to: "missing" }],
  };
  assert.match(issuesOf(danglingEdge).join(" "), /is not a graph node/);

  const danglingDecision = validReport();
  danglingDecision.graph = {
    id: "run",
    nodes: [{ id: "a", label: "A" }],
    edges: [],
    decisions: [{ id: "d", label: "D", nodeId: "missing" }],
  };
  assert.match(issuesOf(danglingDecision).join(" "), /decision nodeId/);

  const tooManyNodes = validReport();
  tooManyNodes.graph = {
    id: "run",
    nodes: Array.from({ length: MAX_GRAPH_NODES + 1 }, (_, i) => ({ id: `n${i}`, label: `N${i}` })),
    edges: [],
  };
  assert.ok(issuesOf(tooManyNodes).length > 0);

  const unsafeGraphId = validReport();
  unsafeGraphId.graph = { id: "../escape", nodes: [{ id: "a", label: "A" }], edges: [] };
  assert.ok(issuesOf(unsafeGraphId).length > 0);
});

test("graph blocks must reference the report graph", () => {
  const wrongId = validReport();
  wrongId.blocks = [{ kind: "graph", graphId: "other" }];
  assert.match(issuesOf(wrongId).join(" "), /graphId must reference/);

  const noGraph = validReport();
  noGraph.blocks = [{ kind: "graph", graphId: "main" }];
  noGraph.graph = undefined;
  assert.match(issuesOf(noGraph).join(" "), /requires report\.graph/);

  const implicitMain = validReport();
  implicitMain.blocks = [{ kind: "graph", graphId: "main" }];
  implicitMain.graph = { nodes: [{ id: "a", label: "A" }], edges: [] };
  assert.equal(safeParseReportModel(implicitMain).success, true);
});

test("evidence URLs allow only absolute http(s) without credentials", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "//example.com/path",
    "ftp://example.com/x",
    "https://user:pass@example.com/x",
    "not a url",
  ]) {
    const report = validReport();
    report.evidence = [{ label: "bad", url }];
    assert.equal(safeParseReportModel(report).success, false, url);
  }
  const report = validReport();
  report.evidence = [{ label: "ok", url: "https://example.com/a?b=c#d" }];
  assert.equal(safeParseReportModel(report).success, true);
});

test("artifact paths are relative, traversal-free and scheme-free", () => {
  for (const artifactPath of [
    "/etc/passwd",
    "../secret",
    "artifacts/../../secret",
    "file:///tmp/x",
    "C:\\temp\\x",
    "a\\b",
    "a//b",
  ]) {
    const report = validReport();
    report.evidence = [{ label: "bad", artifactPath }];
    assert.equal(safeParseReportModel(report).success, false, artifactPath);
  }
  const report = validReport();
  report.evidence = [{ label: "ok", artifactPath: "artifacts/2026/report (1).html" }];
  assert.equal(safeParseReportModel(report).success, true);
});

test("usage accounting keeps measured, estimated and unavailable distinct", () => {
  for (const usage of [
    { inputTokens: { provenance: "measured" as const } },
    { inputTokens: { provenance: "unavailable" as const, value: 0 } },
    { inputTokens: { provenance: "measured" as const, value: -1 } },
    { inputTokens: { provenance: "estimated" as const, value: Number.POSITIVE_INFINITY } },
    {},
  ]) {
    const report = validReport();
    assert.equal(safeParseReportModel({ ...report, usage }).success, false, JSON.stringify(usage));
  }

  const report = validReport();
  report.usage = {
    inputTokens: { provenance: "measured", value: 10 },
    outputTokens: { provenance: "estimated", value: 20 },
    costUsd: { provenance: "unavailable" },
  };
  const parsed = parseReportModel(report);
  assert.equal(parsed.usage?.inputTokens?.provenance, "measured");
  assert.equal(parsed.usage?.outputTokens?.provenance, "estimated");
  assert.deepEqual(parsed.usage?.costUsd, { provenance: "unavailable" });
});

test("control characters are rejected in labels and allowed only as newlines in text", () => {
  const badHeading = validReport();
  badHeading.blocks = [{ kind: "heading", text: "line\nbreak" }];
  assert.equal(safeParseReportModel(badHeading).success, false);

  const goodText = validReport();
  goodText.blocks = [{ kind: "text", text: "line\nbreak\tand tab" }];
  assert.equal(safeParseReportModel(goodText).success, true);

  const nulText = validReport();
  nulText.blocks = [{ kind: "text", text: "nul\u0000byte" }];
  assert.equal(safeParseReportModel(nulText).success, false);
});

test("report schema rejects non-objects and exposes a strict named schema", () => {
  for (const value of [null, undefined, "report", 42, []]) {
    assert.equal(reportModelSchema.safeParse(value).success, false);
  }
});

test("measure contract normalizes widths and validates sorted tuples", () => {
  assert.deepEqual(normalizeMeasureWidths([728, 390, 728, 1024]), [390, 728, 1024]);
  assert.throws(() => normalizeMeasureWidths([]));
  assert.throws(() => normalizeMeasureWidths([239]));
  assert.throws(() => normalizeMeasureWidths([1601]));
  assert.throws(() => normalizeMeasureWidths([390.5]));

  const widths = [728, 390];
  const heights = assertMeasuredHeights(widths, [
    [390, 500],
    [728, 640],
  ]);
  assert.deepEqual(heights, [
    [390, 500],
    [728, 640],
  ]);
  assert.throws(() => assertMeasuredHeights(widths, [[390, 500]]));
  assert.throws(() => assertMeasuredHeights(widths, [[390, 500], [700, 640]]));
  assert.throws(() => assertMeasuredHeights(widths, [[390, 0], [728, 640]]));
});

test("measure support is detected without requiring the current renderer to implement it", () => {
  assert.equal(supportsMeasure(null), false);
  assert.equal(supportsMeasure({ render: async () => ({}) as never, close: async () => {} }), false);
  const measuring = {
    render: async () => ({}) as never,
    close: async () => {},
    measure: async () => [],
  };
  assert.equal(supportsMeasure(measuring), true);
});

test("interactive HTML and asset base64 are bounded by bytes, not only characters", () => {
  const validInteractive = "<!doctype html><p>ok</p>";
  assert.equal(interactiveHtmlSchema.safeParse(validInteractive).success, true);
  assert.equal(
    interactiveHtmlSchema.safeParse("x".repeat(MAX_INTERACTIVE_HTML_BYTES + 1)).success,
    false,
  );

  const oneKb = Buffer.alloc(1_024, 1).toString("base64");
  assert.equal(boundedBase64ImageSchema.safeParse(oneKb).success, true);
  const oversized = Buffer.alloc(MAX_ASSET_PNG_BYTES + 3, 1).toString("base64");
  assert.equal(boundedBase64ImageSchema.safeParse(oversized).success, false);
  assert.equal(boundedBase64ImageSchema.safeParse("not base64!!").success, false);
});

test("interactivePath is absolute and control-free", () => {
  assert.equal(interactivePathSchema.safeParse("/home/user/.paseo/report/interactive.html").success, true);
  assert.equal(interactivePathSchema.safeParse("C:\\paseo\\interactive.html").success, true);
  for (const value of ["relative/interactive.html", "./interactive.html", "", "/tmp/a\nb.html"]) {
    assert.equal(interactivePathSchema.safeParse(value).success, false, value);
  }
});

test("manifest version 1 accepts legacy and additive report fields", () => {
  const legacy = {
    version: 1,
    artifactId: "0123456789abcdef0123456789abcdef",
    title: "Legacy",
    summary: null,
    width: 728,
    height: 640,
    htmlBytes: 100,
    createdAt: "2026-10-20T00:00:00.000Z",
    workspaceId: "workspace-1",
    ownerCwd: "/tmp/workspace",
  };
  assert.equal(artifactManifestSchema.safeParse(legacy).success, true);

  const enhanced = {
    ...legacy,
    measuredHeight: 620,
    heights: [
      [390, 520],
      [728, 620],
    ],
    report: validReport(),
    reportBytes: serializedReportBytes(validReport()),
    interactiveBytes: 2_048,
    themePreview: { light: true, dark: true },
    graph: { id: "run", nodeCount: 2, edgeCount: 1, decisionCount: 1, previewLight: true, previewDark: false },
  };
  const parsed = artifactManifestSchema.safeParse(enhanced);
  assert.equal(parsed.success, true);
  assert.equal(parsed.success ? parsed.data.report?.version : undefined, 1);
});

test("measured heights are bounded, sorted and unique", () => {
  assert.equal(measuredHeightsSchema.safeParse([[390, 520], [728, 620]]).success, true);
  assert.equal(
    measuredHeightsSchema.safeParse(
      Array.from({ length: 24 }, (_, index) => [240 + index, 100]),
    ).success,
    true,
  );
  assert.equal(measuredHeightsSchema.safeParse([[728, 620], [390, 520]]).success, false);
  assert.equal(measuredHeightsSchema.safeParse([[390, 520], [390, 521]]).success, false);
  assert.equal(measuredHeightsSchema.safeParse([[239, 520]]).success, false);
  assert.equal(
    measuredHeightsSchema.safeParse(
      Array.from({ length: 25 }, (_, index) => [240 + index, 100]),
    ).success,
    false,
  );
});
