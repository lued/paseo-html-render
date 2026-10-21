import assert from "node:assert/strict";
import test from "node:test";
import { ArtifactCatalog } from "../client/artifact-catalog.ts";
import type { ReportCardData } from "../shared/protocol.ts";

const card = (artifactId: string, title = "Report"): ReportCardData => ({
  artifactId,
  title,
  summary: null,
  width: 728,
  height: 600,
});
const A = "a".repeat(32);
const B = "b".repeat(32);

test("a new artifact makes the catalog dirty exactly once", () => {
  const catalog = new ArtifactCatalog();
  assert.deepEqual(catalog.record({ data: card(A), source: "marker", callId: "call-1" }), {
    show: true,
    changed: true,
  });
  assert.equal(catalog.takeDirty(), true);
  // Re-projecting the same row is stable: no card gap and no infinite loop.
  assert.deepEqual(catalog.record({ data: card(A), source: "marker", callId: "call-1" }), {
    show: true,
    changed: false,
  });
  assert.equal(catalog.takeDirty(), false);
  catalog.beginGeneration();
  assert.deepEqual(catalog.record({ data: card(A), source: "marker", callId: "call-1" }), {
    show: true,
    changed: false,
  });
});

test("a marker replaces a path-only card and moves the canonical row", () => {
  const catalog = new ArtifactCatalog();
  const first = catalog.record({ data: { ...card(A), title: "From path" }, source: "path", callId: "codemode" });
  assert.deepEqual(first, { show: true, changed: true });
  catalog.takeDirty();

  const second = catalog.record({ data: { ...card(A), title: "From marker" }, source: "marker", callId: "direct" });
  assert.deepEqual(second, { show: true, changed: true });
  assert.equal(catalog.canonicalCallId(A), "direct");
  assert.equal(catalog.card(A)?.data.title, "From marker");
  // The old row is hidden on the next projection.
  assert.deepEqual(catalog.record({ data: { ...card(A), title: "From path" }, source: "path", callId: "codemode" }), {
    show: false,
    changed: false,
  });
});

test("equal-quality duplicate rows keep one canonical card", () => {
  const catalog = new ArtifactCatalog();
  assert.equal(catalog.record({ data: card(A), source: "marker", callId: "wrapped" }).show, true);
  assert.equal(catalog.record({ data: card(A), source: "marker", callId: "direct" }).show, false);
  assert.equal(catalog.canonicalCallId(A), "wrapped");
  // A different artifact still renders.
  assert.equal(catalog.record({ data: card(B), source: "marker", callId: "other" }).show, true);
});

test("a complete unresolved render row asks for one re-projection, not a loop", () => {
  const catalog = new ArtifactCatalog();
  assert.equal(catalog.noteGap("gap-1", "streaming"), false);
  assert.equal(catalog.takeDirty(), false);
  assert.equal(catalog.noteGap("gap-1", "complete"), true);
  assert.equal(catalog.takeDirty(), true);
  catalog.beginGeneration();
  assert.equal(catalog.noteGap("gap-1", "complete"), false);
  assert.equal(catalog.takeDirty(), false);
  assert.equal(catalog.gapCount, 1);
});

test("a gap that later fills still leaves the catalog consistent", () => {
  const catalog = new ArtifactCatalog();
  catalog.noteGap("gap-1");
  catalog.takeDirty();
  assert.equal(catalog.record({ data: card(A), source: "path", callId: "call-2" }).show, true);
  assert.equal(catalog.takeDirty(), true);
  assert.equal(catalog.card(A)?.source, "path");
  // The unresolved row is still unresolved, but it is not canonical.
  assert.equal(catalog.isGap("gap-1"), true);
  assert.equal(catalog.canonicalCallId(A), "call-2");
});
