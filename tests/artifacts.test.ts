import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ArtifactError, ArtifactStore } from "../server/artifacts.ts";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

async function tempStore(): Promise<{ root: string; store: ArtifactStore }> {
  const root = await fs.mkdtemp(join(tmpdir(), "html-render-store-"));
  return { root, store: new ArtifactStore(root) };
}

const base = {
  html: "<!doctype html><title>t</title><h1>Hello</h1>",
  title: "Report",
  summary: "One line",
  width: 728,
  height: 480,
  workspaceId: "wks_a",
  ownerCwd: "/tmp/workspace",
  previewPng: PNG,
};

test("saves and reads the preview and the original HTML", async (t) => {
  const { root, store } = await tempStore();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const saved = await store.save(base);
  const preview = await store.readPreview(saved.manifest.artifactId, "wks_a");
  assert.equal(preview.manifest.title, "Report");
  assert.deepEqual(preview.png, PNG);
  const original = await store.readOriginal(saved.manifest.artifactId, "wks_a");
  assert.equal(original.html, base.html);
});

test("a sibling workspace created after publish still reads the artifact", async (t) => {
  const { root, store } = await tempStore();
  const owner = await fs.mkdtemp(join(tmpdir(), "html-render-owner-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(owner, { recursive: true, force: true });
  });
  const saved = await store.save({
    ...base,
    workspaceId: "wks_546fb8529e094f50",
    ownerCwd: owner,
  });
  // Exact scope for agent 8d12d06c after wks_4201e411d5936f56 appeared; the
  // recorded owner id is still in the sibling set.
  const preview = await store.readPreview(saved.manifest.artifactId, {
    workspaceIds: ["wks_4201e411d5936f56", "wks_546fb8529e094f50"],
    root: owner,
  });
  assert.deepEqual(preview.png, PNG);
  // The root alone authorizes even if the recorded owner was archived and is
  // no longer in the active sibling list.
  await store.readPreview(saved.manifest.artifactId, {
    workspaceIds: ["wks_4201e411d5936f56"],
    root: owner,
  });
  // A lexically similar root is not the same directory.
  await assert.rejects(
    () =>
      store.readPreview(saved.manifest.artifactId, {
        workspaceIds: ["wks_4201e411d5936f56"],
        root: `${owner}-evil`,
      }),
    /another workspace/,
  );
  // An unrelated id and root stay denied.
  await assert.rejects(
    () =>
      store.readPreview(saved.manifest.artifactId, {
        workspaceIds: ["wks_other"],
        root: "/tmp/unrelated-workspace",
      }),
    /another workspace/,
  );
});

test("artifact directories and files are owner-only", async (t) => {
  const { root, store } = await tempStore();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const saved = await store.save(base);
  const dir = join(root, "artifacts", saved.manifest.artifactId);
  assert.equal((await fs.stat(root)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(dir)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(join(dir, "original.html"))).mode & 0o777, 0o600);
  assert.equal((await fs.stat(join(dir, "manifest.json"))).mode & 0o777, 0o600);
});

test("path traversal and cross-workspace reads are denied", async (t) => {
  const { root, store } = await tempStore();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const saved = await store.save(base);
  for (const id of [
    "../../etc/passwd",
    "../" + saved.manifest.artifactId,
    saved.manifest.artifactId.toUpperCase(),
    "x".repeat(32),
    "",
  ]) {
    await assert.rejects(
      () => store.readPreview(id, "wks_a"),
      (error: unknown) => error instanceof ArtifactError,
      `expected ${JSON.stringify(id)} to be rejected`,
    );
  }
  await assert.rejects(
    () => store.readPreview(saved.manifest.artifactId, "wks_b"),
    /another workspace/,
  );
  await assert.rejects(
    () => store.readOriginal(saved.manifest.artifactId, null),
    /another workspace/,
  );
});

test("bounds input and reports missing artifacts without leaking paths", async (t) => {
  const { root, store } = await tempStore();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(() => store.save({ ...base, html: "" }), /non-empty/);
  await assert.rejects(
    () => store.save({ ...base, html: "x".repeat(512_001) }),
    /exceeds/,
  );
  await assert.rejects(() => store.save({ ...base, width: 0 }), /width/);
  await assert.rejects(() => store.save({ ...base, workspaceId: "" }), /workspace/);
  await assert.rejects(
    () => store.readPreview("a".repeat(32), "wks_a"),
    (error: unknown) =>
      error instanceof ArtifactError && error.code === "not_found" && !error.message.includes(root),
  );
});

import { buildInteractiveDocument } from "../shared/html-document.ts";
import { pngDimensions } from "../server/artifacts.ts";

const REPORT = {
  version: 1 as const,
  outcome: { status: "success" as const, headline: "All checks passed" },
  blocks: [{ kind: "text" as const, text: "Bounded native body." }],
};

function pngWithSize(width: number, height: number): Buffer {
  const header = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(header, 0);
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

test("stores interactive HTML, report JSON, light preview, and graph PNGs", async (t) => {
  const { root, store } = await tempStore();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const light = pngWithSize(728, 480);
  const graphDark = pngWithSize(728, 200);
  const graphLight = pngWithSize(728, 200);
  const interactiveHtml = buildInteractiveDocument({
    html: base.html,
    title: "Report",
  });
  const saved = await store.save({
    ...base,
    heights: [[390, 420], [728, 480]],
    previewLightPng: light,
    interactiveHtml,
    report: REPORT,
    graph: {
      metadata: {
        id: "main",
        nodeCount: 2,
        edgeCount: 1,
        decisionCount: 0,
        previewLight: true,
        previewDark: true,
      },
      dark: graphDark,
      light: graphLight,
    },
  });
  const id = saved.manifest.artifactId;
  assert.equal(saved.manifest.interactiveBytes, Buffer.byteLength(interactiveHtml));
  assert.deepEqual(saved.manifest.heights, [[390, 420], [728, 480]]);
  assert.deepEqual(saved.manifest.themePreview, { light: true, dark: true });
  assert.equal(saved.manifest.graph?.nodeCount, 2);
  assert.equal(saved.manifest.reportBytes, Buffer.byteLength(JSON.stringify(REPORT)));

  const interactive = await store.readInteractive(id, "wks_a");
  assert.ok(interactive?.html.includes("Content-Security-Policy"));
  assert.equal(interactive?.path, join(root, "artifacts", id, "interactive.html"));
  assert.equal(await store.interactivePath(id, "wks_a"), join(root, "artifacts", id, "interactive.html"));

  const report = await store.readReport(id, "wks_a");
  assert.deepEqual(report.report, REPORT);

  const previewLight = await store.readAsset(id, "wks_a", "previewLight");
  assert.deepEqual(previewLight.png, light);
  assert.equal(previewLight.asset, "previewLight");
  assert.deepEqual((await store.readAsset(id, "wks_a", "graphDark")).png, graphDark);
  assert.deepEqual((await store.readAsset(id, "wks_a", "graphLight")).png, graphLight);

  // Original HTML is untouched even though interactive.html was prepared.
  assert.equal((await store.readOriginal(id, "wks_a")).html, base.html);
  const onDisk = await fs.readFile(join(root, "artifacts", id, "original.html"), "utf8");
  assert.equal(onDisk, base.html);
});

test("legacy artifacts without the new files stay readable", async (t) => {
  const { root, store } = await tempStore();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const artifactId = "a".repeat(32);
  const dir = join(root, "artifacts", artifactId);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.writeFile(join(dir, "original.html"), "<p>legacy</p>", { mode: 0o600 });
  await fs.writeFile(join(dir, "preview.png"), PNG, { mode: 0o600 });
  await fs.writeFile(
    join(dir, "manifest.json"),
    JSON.stringify({
      version: 1,
      artifactId,
      title: "Legacy",
      summary: null,
      width: 728,
      height: 300,
      htmlBytes: 14,
      createdAt: "2026-10-20T00:00:00.000Z",
      workspaceId: "wks_a",
      ownerCwd: "/tmp/workspace",
    }),
    { mode: 0o600 },
  );
  const preview = await store.readPreview(artifactId, "wks_a");
  assert.equal(preview.manifest.title, "Legacy");
  assert.deepEqual(preview.png, PNG);
  assert.equal(await store.readInteractive(artifactId, "wks_a"), null);
  assert.equal(await store.interactivePath(artifactId, "wks_a"), null);
  const report = await store.readReport(artifactId, "wks_a");
  assert.equal(report.report, null);
  await assert.rejects(
    () => store.readAsset(artifactId, "wks_a", "previewLight"),
    (error: unknown) => error instanceof ArtifactError && error.code === "not_found",
  );
});

test("named assets and reports are owner-only and traversal-safe", async (t) => {
  const { root, store } = await tempStore();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const saved = await store.save({
    ...base,
    interactiveHtml: "<!doctype html><p>prepared</p>",
    report: REPORT,
  });
  const id = saved.manifest.artifactId;
  for (const read of [
    () => store.readAsset(id, "wks_b", "preview"),
    () => store.readAsset(id, "wks_b", "graphDark"),
    () => store.readReport(id, "wks_b"),
    () => store.readInteractive(id, "wks_b"),
    () => store.readInteractive(id, null),
  ]) {
    await assert.rejects(read, /another workspace/);
  }
  for (const bad of ["../../etc/passwd", `${id}/../${id}`, id.toUpperCase(), "not-an-id"]) {
    await assert.rejects(
      () => store.readReport(bad, "wks_a"),
      (error: unknown) => error instanceof ArtifactError && error.code === "invalid_input",
    );
  }
});

test("symlinked artifact files and directories are denied", async (t) => {
  const { root, store } = await tempStore();
  const outside = await fs.mkdtemp(join(tmpdir(), "hr-artifacts-outside-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });
  const saved = await store.save({ ...base, report: REPORT });
  const id = saved.manifest.artifactId;
  const dir = join(root, "artifacts", id);
  await fs.rm(join(dir, "preview.png"));
  await fs.symlink(join(outside, "preview.png"), join(dir, "preview.png"));
  await fs.writeFile(join(outside, "preview.png"), PNG);
  await assert.rejects(
    () => store.readPreview(id, "wks_a"),
    (error: unknown) => error instanceof ArtifactError && error.code === "denied",
  );
  // A symlinked artifact directory cannot be opened at all.
  const forgedId = "b".repeat(32);
  await fs.mkdir(join(outside, forgedId));
  await fs.writeFile(
    join(outside, forgedId, "manifest.json"),
    JSON.stringify({
      version: 1,
      artifactId: forgedId,
      title: "Forged",
      summary: null,
      width: 728,
      height: 100,
      htmlBytes: 1,
      createdAt: "2026-10-20T00:00:00.000Z",
      workspaceId: "wks_a",
      ownerCwd: "/tmp/workspace",
    }),
  );
  await fs.symlink(join(outside, forgedId), join(root, "artifacts", forgedId));
  await assert.rejects(
    () => store.readOriginal(forgedId, "wks_a"),
    (error: unknown) => error instanceof ArtifactError && error.code === "denied",
  );
});

test("workspace-scoped purge supports dry-run and never touches other workspaces", async (t) => {
  const { root, store } = await tempStore();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const mine = await store.save({ ...base, workspaceId: "wks_a" });
  const other = await store.save({ ...base, workspaceId: "wks_b" });
  await fs.symlink(join(root, "elsewhere"), join(root, "artifacts", "c".repeat(32)));

  const dry = await store.purgeWorkspace("wks_a", { dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.deepEqual(dry.artifactIds, [mine.manifest.artifactId]);
  assert.ok(dry.bytes > 0);
  assert.ok(await fs.stat(join(root, "artifacts", mine.manifest.artifactId)));

  const purged = await store.purgeWorkspace("wks_a");
  assert.deepEqual(purged.artifactIds, [mine.manifest.artifactId]);
  await assert.rejects(() => fs.stat(join(root, "artifacts", mine.manifest.artifactId)));
  assert.ok(await fs.stat(join(root, "artifacts", other.manifest.artifactId)));
  // The dangling symlink is skipped, not followed or deleted.
  assert.ok((await fs.lstat(join(root, "artifacts", "c".repeat(32)))).isSymbolicLink());
});

test("PNG dimensions are read only from a valid IHDR", () => {
  assert.deepEqual(pngDimensions(pngWithSize(728, 480)), { width: 728, height: 480 });
  assert.equal(pngDimensions(Buffer.from("not a png")), null);
  assert.equal(pngDimensions(PNG), null);
});

test("the durable card sidecar survives a lost marker and restores renderMode", async (t) => {
  const { root, store } = await tempStore();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const saved = await store.save({
    ...base,
    renderMode: "static",
    measuredHeight: 200,
    heights: [
      [390, 180],
      [728, 200],
    ],
  });
  const dir = join(root, "artifacts", saved.manifest.artifactId);
  const cardPath = join(dir, "card.json");
  assert.equal((await fs.stat(cardPath)).mode & 0o777, 0o600);
  const durable = await store.readCard(saved.manifest.artifactId, "wks_a");
  assert.deepEqual(durable.card, {
    artifactId: saved.manifest.artifactId,
    title: "Report",
    summary: "One line",
    width: 728,
    height: 480,
    renderMode: "static",
    measuredHeight: 200,
    heights: [
      [390, 180],
      [728, 200],
    ],
  });

  // A missing sidecar falls back to the manifest (legacy stores).
  await fs.rm(cardPath);
  assert.deepEqual((await store.readCard(saved.manifest.artifactId, "wks_a")).card, durable.card);

  // A corrupt or mismatched sidecar never makes the artifact unreadable.
  await fs.writeFile(cardPath, "{not json", { mode: 0o600 });
  assert.deepEqual((await store.readCard(saved.manifest.artifactId, "wks_a")).card, durable.card);
  const mismatched = {
    version: 1,
    card: { ...durable.card, artifactId: "f".repeat(32), renderMode: "iframe" },
    workspaceId: "wks_a",
    ownerCwd: "/tmp/workspace",
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(cardPath, JSON.stringify(mismatched), { mode: 0o600 });
  assert.equal((await store.readCard(saved.manifest.artifactId, "wks_a")).card.renderMode, "static");
  await assert.rejects(() => store.readCard(saved.manifest.artifactId, "wks_b"), /another workspace/);
});
