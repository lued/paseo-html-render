/**
 * Artifact retention: the planner rules and the owner command.
 *
 * The defect this closes: artifacts were never pruned by default and had grown
 * on every host, while any automatic deletion risked breaking a card that a
 * conversation still links to. The planner is therefore conservative and the
 * command refuses to delete while its reference scan is incomplete.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  DEFAULT_MAX_DELETES,
  MAX_RETENTION_CANDIDATES,
  parseRetentionAge,
  planRetention,
} from "../server/retention.ts";

const run = promisify(execFile);
const DAY = 86_400_000;
const ID_A = "a".repeat(32);
const ID_B = "b".repeat(32);
const ID_C = "c".repeat(32);

test("retention never deletes a referenced artifact, whatever its age", () => {
  const now = 1_000 * DAY;
  const plan = planRetention({
    now,
    olderThanMs: 30 * DAY,
    referenced: new Set([ID_A]),
    artifacts: [
      { artifactId: ID_A, createdAt: now - 400 * DAY, bytes: 10 },
      { artifactId: ID_B, createdAt: now - 400 * DAY, bytes: 20 },
    ],
  });
  assert.deepEqual(plan.delete.map((artifact) => artifact.artifactId), [ID_B]);
  assert.equal(plan.keptReferenced, 1);
  assert.equal(plan.deleteBytes, 20);
});

test("retention keeps recent artifacts and ignores undated or malformed entries", () => {
  const now = 1_000 * DAY;
  const plan = planRetention({
    now,
    olderThanMs: 30 * DAY,
    referenced: new Set(),
    artifacts: [
      { artifactId: ID_A, createdAt: now - 1 * DAY, bytes: 10 },
      { artifactId: ID_B, createdAt: now - 60 * DAY, bytes: 10 },
      // No readable manifest date: not a candidate.
      { artifactId: ID_C, createdAt: 0, bytes: 10 },
      { artifactId: "../../etc/passwd", createdAt: now - 60 * DAY, bytes: 10 },
      { artifactId: ID_B, createdAt: now - 200 * DAY, bytes: 10 },
    ],
  });
  assert.deepEqual(plan.delete.map((artifact) => artifact.artifactId), [ID_B]);
  assert.equal(plan.keptRecent, 1);
  assert.equal(plan.ignored, 3, "undated, malformed and duplicate entries are ignored");
});

test("retention is bounded by count and bytes, oldest first", () => {
  const now = 1_000 * DAY;
  const artifacts = Array.from({ length: 6 }, (_, index) => ({
    artifactId: index.toString(16).padStart(32, "0"),
    createdAt: now - (100 + index) * DAY,
    bytes: 5,
  }));
  const byCount = planRetention({ now, olderThanMs: DAY, referenced: new Set(), artifacts, maxDeletes: 2 });
  assert.equal(byCount.delete.length, 2);
  assert.deepEqual(byCount.delete.map((artifact) => artifact.artifactId),
    [artifacts[5]!.artifactId, artifacts[4]!.artifactId], "oldest first");
  assert.equal(byCount.keptOverCap, 4);

  const byBytes = planRetention({ now, olderThanMs: DAY, referenced: new Set(), artifacts, maxDeleteBytes: 10 });
  assert.equal(byBytes.delete.length, 2);
  assert.equal(byBytes.deleteBytes, 10);

  const defaults = planRetention({ now, olderThanMs: DAY, referenced: new Set(), artifacts: [] });
  assert.equal(defaults.delete.length, 0);
  assert.ok(DEFAULT_MAX_DELETES > 0);
  assert.equal(new Set(artifacts.map((artifact) => artifact.artifactId)).size, artifacts.length);
});

test("retention scanning stays bounded and deterministic", () => {
  const now = 1_000 * DAY;
  const many = Array.from({ length: MAX_RETENTION_CANDIDATES + 10 }, (_, index) => ({
    artifactId: (index % 0xffffffff).toString(16).padStart(32, "0"),
    createdAt: now - 100 * DAY,
    bytes: 1,
  }));
  const plan = planRetention({ now, olderThanMs: DAY, referenced: new Set(), artifacts: many, maxDeletes: 3 });
  assert.equal(plan.delete.length, 3);
  assert.equal(plan.totalArtifacts, MAX_RETENTION_CANDIDATES);
});

test("age parsing accepts explicit units and refuses guesses", () => {
  assert.equal(parseRetentionAge("30d"), 30 * DAY);
  assert.equal(parseRetentionAge("12h"), 12 * 3_600_000);
  assert.equal(parseRetentionAge("90m"), 90 * 60_000);
  assert.equal(parseRetentionAge("2w"), 14 * DAY);
  assert.equal(parseRetentionAge("45"), 45 * DAY);
  for (const bad of ["", "-3d", "soon", "3 years", "0d", "d"]) {
    assert.equal(parseRetentionAge(bad), null, bad);
  }
});

// --- owner command ---------------------------------------------------------

async function writeArtifact(root: string, artifactId: string, createdAt: string): Promise<void> {
  const directory = join(root, "artifacts", artifactId);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.writeFile(join(directory, "manifest.json"),
    JSON.stringify({ version: 1, artifactId, title: "T", createdAt }), { mode: 0o600 });
  await fs.writeFile(join(directory, "interactive.html"), "<!doctype html><p>card</p>", { mode: 0o600 });
}

test("the owner command deletes only old, unreferenced artifacts", async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), "hr-retention-"));
  const history = await fs.mkdtemp(join(tmpdir(), "hr-retention-history-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(history, { recursive: true, force: true });
  });
  const old = new Date(Date.now() - 60 * DAY).toISOString();
  const fresh = new Date().toISOString();
  await writeArtifact(root, ID_A, old); // referenced below
  await writeArtifact(root, ID_B, old); // prunable
  await writeArtifact(root, ID_C, fresh); // too new
  await fs.writeFile(join(history, "session.jsonl"),
    JSON.stringify({ reply: `[Open interactive report](</x/artifacts/${ID_A}/interactive.html>)` }) + "\n");

  const script = "scripts/prune-artifacts.mjs";
  const args = ["--data-dir", root, "--older-than", "30d", "--references", history, "--json"];

  const dry = await run(process.execPath, [script, ...args]).catch((error) => error);
  assert.equal(dry.code ?? 0, 0, dry.stderr ?? String(dry));
  const plan = JSON.parse(dry.stdout);
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.deleteCandidates, 1);
  assert.equal(plan.keptReferenced, 1);
  assert.equal(plan.keptRecent, 1);
  assert.equal(plan.referenceScan.ids, 1);
  assert.equal(plan.referenceScan.incomplete, false);
  assert.ok((await fs.stat(join(root, "artifacts", ID_B))).isDirectory(), "a dry run deletes nothing");

  const applied = await run(process.execPath, [script, ...args, "--apply"]).catch((error) => error);
  assert.equal(applied.code ?? 0, 0, applied.stderr ?? String(applied));
  const result = JSON.parse(applied.stdout);
  assert.deepEqual(result.deleted, [ID_B]);
  await assert.rejects(fs.stat(join(root, "artifacts", ID_B)), "the unreferenced old artifact is gone");
  assert.ok((await fs.stat(join(root, "artifacts", ID_A))).isDirectory(), "a referenced artifact survives");
  assert.ok((await fs.stat(join(root, "artifacts", ID_C))).isDirectory(), "a recent artifact survives");

  // Idempotent: nothing left to delete.
  const again = await run(process.execPath, [script, ...args, "--apply"]).catch((error) => error);
  assert.equal(again.code, 3);
  assert.deepEqual(JSON.parse(again.stdout).deleted, []);
});

test("the owner command refuses to delete when the reference scan is incomplete", async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), "hr-retention-refuse-"));
  const history = await fs.mkdtemp(join(tmpdir(), "hr-retention-refuse-history-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(history, { recursive: true, force: true });
  });
  await writeArtifact(root, ID_B, new Date(Date.now() - 60 * DAY).toISOString());
  await fs.writeFile(join(history, "one.jsonl"), "nothing\n");
  await fs.writeFile(join(history, "two.jsonl"), "nothing\n");
  const script = "scripts/prune-artifacts.mjs";
  const base = ["--data-dir", root, "--older-than", "30d", "--references", history, "--max-reference-files", "1", "--json"];

  const refused = await run(process.execPath, [script, ...base, "--apply"]).catch((error) => error);
  assert.equal(refused.code, 2, refused.stdout ?? String(refused));
  const summary = JSON.parse(refused.stdout);
  assert.equal(summary.ok, false);
  assert.equal(summary.referenceScan.incomplete, true);
  assert.deepEqual(summary.deleted, []);
  assert.ok((await fs.stat(join(root, "artifacts", ID_B))).isDirectory(), "nothing is deleted on refusal");

  // The explicit override still respects the planner's rules.
  const forced = await run(process.execPath,
    [script, ...base, "--apply", "--allow-incomplete-references"]).catch((error) => error);
  assert.equal(forced.code ?? 0, 0, forced.stdout ?? String(forced));
  assert.deepEqual(JSON.parse(forced.stdout).deleted, [ID_B]);
});

test("the owner command refuses unsafe input instead of guessing", async () => {
  const script = "scripts/prune-artifacts.mjs";
  const missingAge = await run(process.execPath, [script, "--json"]).catch((error) => error);
  assert.equal(missingAge.code, 1);
  const badAge = await run(process.execPath, [script, "--older-than", "soon"]).catch((error) => error);
  assert.equal(badAge.code, 1);
  const badKeep = await run(process.execPath,
    [script, "--older-than", "30d", "--keep", "../../etc"]).catch((error) => error);
  assert.equal(badKeep.code, 1);
});
