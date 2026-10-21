import assert from "node:assert/strict";
import test from "node:test";
import {
  createTimelineTransformState,
  decodeReportReference,
  encodeReportReference,
  recognizeToolCall,
  transformTimelineToolCall,
} from "../shared/recognize.ts";
import { MAX_MARKER_CHARS } from "../shared/limits.ts";
import { reportCardSchema, type ReportCardData } from "../shared/protocol.ts";

const card: ReportCardData = {
  artifactId: "0123456789abcdef0123456789abcdef",
  title: "Quarterly revenue — naïve <report>",
  summary: "Static preview of the Q3 dashboard.",
  width: 728,
  height: 640,
};

test("reference round-trips through the marker, including unicode and HTML-ish titles", () => {
  const encoded = encodeReportReference(card);
  assert.ok(encoded.startsWith("paseo-html-render:v1:"));
  assert.deepEqual(decodeReportReference(`before ${encoded} after`), card);
});

test("malformed or hostile references are rejected, not coerced", () => {
  assert.equal(decodeReportReference("paseo-html-render:v1:%7Bnot-json"), null);
  assert.equal(decodeReportReference("paseo-html-render:v1:"), null);
  const traversal = encodeURIComponent(
    JSON.stringify({ ...card, artifactId: "../../etc/passwd" }),
  );
  assert.equal(decodeReportReference(`paseo-html-render:v1:${traversal}`), null);
  const oversized = encodeURIComponent(JSON.stringify({ ...card, title: "x".repeat(400) }));
  assert.equal(decodeReportReference(`paseo-html-render:v1:${oversized}`), null);
});

test("recognition is marker-driven and still rejects invalid markers", () => {
  const encoded = encodeReportReference(card);
  assert.deepEqual(
    recognizeToolCall({ name: "html_render", detail: { type: "unknown", output: encoded } }),
    card,
  );
  assert.deepEqual(
    recognizeToolCall({ name: "mcp__html-render__html_render", detail: { output: [encoded] } }),
    card,
  );
  // A wrapper with no nested render call is never touched.
  assert.equal(recognizeToolCall({ name: "bash", detail: { output: encoded } }), null);
  assert.equal(recognizeToolCall({ name: "codemode", detail: { output: encoded } }), null);
  assert.deepEqual(recognizeToolCall({ name: "mcp__html_render__html_render", detail: { output: encoded } }), card);
  // A tool row without the marker keeps the native row.
  assert.equal(recognizeToolCall({ name: "html_render", detail: { output: "done" } }), null);
  // A name alone never creates a card.
  assert.equal(recognizeToolCall({ name: "not_html_render", detail: { output: "done" } }), null);
});

test("recognizes a real Pi codemode row with the MCP call nested in details", () => {
  const encoded = encodeReportReference(card);
  const detail = {
    type: "unknown",
    input: {
      calls: [
        {
          name: "mcp__html_render__html_render",
          arguments: { html: "<h1>x</h1>", title: card.title, height: card.height },
        },
      ],
    },
    output: {
      content: [{ type: "text", text: "Published a static report card." }],
      details: {
        calls: [
          {
            name: "mcp__html_render__html_render",
            status: "completed",
            result: { content: [{ type: "text", text: `done\n${encoded}` }] },
          },
        ],
      },
    },
  };
  // Pi persists the outer row as codemode, not html_render. Both shapes work.
  assert.deepEqual(recognizeToolCall({ name: "codemode", detail }), card);
  assert.deepEqual(recognizeToolCall({ name: "mcp__html_render__html_render", detail }), card);
  const wrapped = transformTimelineToolCall({ name: "codemode", detail, callId: "wrapped" });
  assert.equal(wrapped?.items.length, 1);
  assert.deepEqual(wrapped?.items[0]?.data, card);
  const direct = transformTimelineToolCall({ name: "mcp__html_render__html_render", detail });
  assert.equal(direct?.items.length, 1);
  assert.deepEqual(direct?.items[0]?.data, card);
});

test("codemode and direct rows for one artifact produce one card, not duplicates", () => {
  const encoded = encodeReportReference(card);
  const detail = {
    output: {
      content: [{ type: "text", text: encoded }],
      details: { calls: [{ name: "mcp__html_render__html_render", status: "completed" }] },
    },
  };
  const state = createTimelineTransformState(() => 1_000);
  const wrapped = transformTimelineToolCall({ name: "codemode", detail, callId: "call-1" }, undefined, state);
  assert.equal(wrapped?.items.length, 1);
  // The same row re-transforming while streaming still renders.
  const again = transformTimelineToolCall({ name: "codemode", detail, callId: "call-1" }, undefined, state);
  assert.equal(again?.items.length, 1);
  // A second persisted row for the same artifact is suppressed.
  const direct = transformTimelineToolCall(
    { name: "mcp__html_render__html_render", detail: { output: encoded }, callId: "call-2" },
    undefined,
    state,
  );
  assert.deepEqual(direct, { items: [] });
  // A different artifact still renders.
  const other = { ...card, artifactId: "fedcba9876543210fedcba9876543210" };
  const distinct = transformTimelineToolCall(
    { name: "html_render", detail: { output: encodeReportReference(other) }, callId: "call-3" },
    undefined,
    state,
  );
  assert.equal(distinct?.items.length, 1);
  assert.equal(distinct?.items[0]?.data.artifactId, other.artifactId);
});

test("nested codemode rows without a marker are preserved", () => {
  assert.equal(
    transformTimelineToolCall({
      name: "codemode",
      detail: {
        type: "unknown",
        input: { calls: [{ name: "mcp__paseo__list_agents", arguments: {} }] },
        output: { content: [{ type: "text", text: "agents listed" }] },
      },
    }),
    undefined,
  );
});

test("duplicate nested markers still yield exactly one card", () => {
  const encoded = encodeReportReference(card);
  const detail = {
    output: {
      content: [
        { type: "text", text: encoded },
        { type: "text", text: encoded },
      ],
      details: { calls: [{ result: { text: encoded } }] },
    },
  };
  const replacement = transformTimelineToolCall({ name: "mcp__html_render__html_render", detail });
  assert.equal(replacement?.items.length, 1);
  assert.equal(replacement?.items[0]?.data.artifactId, card.artifactId);
});

test("unrelated timeline rows are preserved and our row becomes a v1 plugin item", () => {
  assert.equal(
    transformTimelineToolCall({ name: "read", detail: { output: "file contents" } }),
    undefined,
  );
  const replacement = transformTimelineToolCall({
    name: "html_render",
    detail: { output: encodeReportReference(card) },
  });
  assert.ok(replacement);
  assert.equal(replacement.items.length, 1);
  assert.equal(replacement.items[0]?.type, "plugin");
  assert.equal(replacement.items[0]?.kind, "html-report-card");
  assert.equal(replacement.items[0]?.version, 1);
  assert.deepEqual(reportCardSchema.parse(replacement.items[0]?.data), card);
});

test("cyclic tool payloads do not hang recognition", () => {
  const node: Record<string, unknown> = { name: "html_render" };
  node.self = node;
  assert.equal(recognizeToolCall({ name: "html_render", detail: node }), null);
});

test("renderMode, hasReport, measuredHeight and heights round-trip in the marker", () => {
  const enhanced: ReportCardData = {
    ...card,
    renderMode: "iframe",
    hasReport: true,
    measuredHeight: 620,
    heights: [
      [390, 520],
      [728, 620],
      [1024, 700],
    ],
  };
  const encoded = encodeReportReference(enhanced);
  assert.deepEqual(decodeReportReference(encoded), enhanced);
  assert.ok(encoded.length <= MAX_MARKER_CHARS);
  // The marker holds references and metadata only; report bodies never travel here.
  assert.equal(encoded.includes("blocks"), false);
  assert.equal(encoded.includes("outcome"), false);
});

test("all render modes round-trip, and an absent mode stays absent", () => {
  for (const renderMode of ["static", "auto", "iframe"] as const) {
    const encoded = encodeReportReference({ ...card, renderMode });
    assert.equal(decodeReportReference(encoded)?.renderMode, renderMode);
  }
  assert.equal(decodeReportReference(encodeReportReference(card))?.renderMode, undefined);
});

test("heights are sorted on encode, bounded, and unsorted payloads are rejected", () => {
  const encoded = encodeReportReference({
    ...card,
    heights: [
      [1024, 700],
      [390, 520],
    ],
  });
  assert.deepEqual(decodeReportReference(encoded)?.heights, [
    [390, 520],
    [1024, 700],
  ]);

  const unsorted = {
    ...card,
    heights: [
      [1024, 700],
      [390, 520],
    ],
  };
  const marker = `paseo-html-render:v1:${encodeURIComponent(JSON.stringify(unsorted))}`;
  assert.equal(decodeReportReference(marker), null);

  const tooMany = {
    ...card,
    heights: Array.from({ length: 25 }, (_, index) => [240 + index, 100 + index]),
  };
  const tooManyMarker = `paseo-html-render:v1:${encodeURIComponent(JSON.stringify(tooMany))}`;
  assert.equal(decodeReportReference(tooManyMarker), null);
});

test("a legacy reference without new fields still decodes unchanged", () => {
  const legacyPayload = encodeURIComponent(
    JSON.stringify({
      artifactId: card.artifactId,
      title: card.title,
      summary: card.summary,
      width: card.width,
      height: card.height,
    }),
  );
  assert.deepEqual(decodeReportReference(`paseo-html-render:v1:${legacyPayload}`), card);
  assert.deepEqual(
    recognizeToolCall({ name: "html_render", detail: { output: `paseo-html-render:v1:${legacyPayload}` } }),
    card,
  );
});

test("a payload beyond the 8192-character marker budget is rejected", () => {
  assert.equal(decodeReportReference(`paseo-html-render:v1:${"a".repeat(9_000)}`), null);
  const padded = `x${encodeReportReference(card)}`;
  assert.ok(padded.length <= MAX_MARKER_CHARS + 1);
});

test("nested codemode rows with report metadata still yield exactly one card", () => {
  const enhanced: ReportCardData = {
    ...card,
    renderMode: "auto",
    hasReport: true,
    measuredHeight: 620,
    heights: [[390, 520]],
  };
  const encoded = encodeReportReference(enhanced);
  const detail = {
    type: "unknown",
    output: {
      content: [
        { type: "text", text: encoded },
        { type: "text", text: encoded },
      ],
      details: {
        calls: [
          {
            name: "mcp__html_render__html_render",
            result: { content: [{ type: "text", text: `done\n${encoded}` }] },
          },
        ],
      },
    },
  };
  const replacement = transformTimelineToolCall({ name: "mcp__html_render__html_render", detail });
  assert.equal(replacement?.items.length, 1);
  assert.deepEqual(replacement?.items[0]?.data, enhanced);
  assert.equal(replacement?.items[0]?.version, 1);
});
