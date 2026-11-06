#!/usr/bin/env node
/**
 * Owner-invoked artifact prune. Dry run unless `--apply` is passed.
 *
 * Artifacts are never pruned automatically. A published card is referenced from
 * provider history (the reply's artifact link or the persisted marker), which
 * this plugin cannot enumerate reliably, so deletion needs the operator to point
 * at the history that holds the references. Every id found there is kept, and a
 * scan that hits its own bounds refuses to delete unless the operator says so
 * explicitly.
 *
 *   node scripts/prune-artifacts.mjs --older-than 30d \
 *     --references ~/.pi/agent/sessions --references ~/.paseo/agents
 *
 *   node scripts/prune-artifacts.mjs --older-than 90d --references <dir> --apply
 *
 * Exit codes: 0 planned/applied, 1 bad usage, 2 refused (incomplete reference
 * scan), 3 nothing to do.
 */
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_MAX_DELETE_BYTES, DEFAULT_MAX_DELETES, parseRetentionAge, planRetention } from "../server/retention.ts";
import { resolveDataRoot } from "../server/paths.ts";
import { SELECTED_IDENTITY } from "../shared/selected-identity.ts";

/** Bounded reference scan: a cap hit means "unknown", never "unreferenced". */
const MAX_REFERENCE_FILES = 20_000;
const MAX_REFERENCE_BYTES = 512 * 1_048_576;
const MAX_REFERENCE_FILE_BYTES = 16 * 1_048_576;
const MEDIA_TYPE_BYTES = 4_096;
const ARTIFACT_REFERENCE = /artifacts[\\/]([0-9a-f]{32})[\\/]/g;
const ARTIFACT_ID = /^[0-9a-f]{32}$/;

function usage(message) {
  if (message) console.error(`error: ${message}`);
  console.error(
    "usage: prune-artifacts.mjs --older-than <30d|12h|90m> [--references <path>]... " +
    "[--keep <id,...>] [--data-dir <path>] [--max <n>] [--max-bytes <n>] " +
    "[--max-reference-files <n>] [--allow-incomplete-references] [--apply] [--json]",
  );
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    olderThan: null,
    references: [],
    keep: new Set(),
    dataDir: null,
    max: DEFAULT_MAX_DELETES,
    maxBytes: DEFAULT_MAX_DELETE_BYTES,
    maxReferenceFiles: MAX_REFERENCE_FILES,
    allowIncomplete: false,
    apply: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) usage(`${arg} needs a value`);
      index += 1;
      return next;
    };
    switch (arg) {
      case "--older-than": options.olderThan = value(); break;
      case "--references": options.references.push(value()); break;
      case "--keep":
        for (const id of value().split(",").map((entry) => entry.trim()).filter(Boolean)) {
          if (!ARTIFACT_ID.test(id)) usage(`--keep expects 32-hex artifact ids, got ${id}`);
          options.keep.add(id);
        }
        break;
      case "--data-dir": options.dataDir = value(); break;
      case "--max": options.max = Number.parseInt(value(), 10); break;
      case "--max-bytes": options.maxBytes = Number.parseInt(value(), 10); break;
      case "--max-reference-files": options.maxReferenceFiles = Number.parseInt(value(), 10); break;
      case "--allow-incomplete-references": options.allowIncomplete = true; break;
      case "--apply": options.apply = true; break;
      case "--json": options.json = true; break;
      case "--help": case "-h": usage(); break;
      default: usage(`unknown argument ${arg}`);
    }
  }
  if (!options.olderThan) usage("--older-than is required; retention never runs by surprise");
  for (const [name, number] of [["--max", options.max], ["--max-bytes", options.maxBytes],
    ["--max-reference-files", options.maxReferenceFiles]]) {
    if (!Number.isSafeInteger(number) || number < 0) usage(`${name} must be a non-negative integer`);
  }
  const olderThanMs = parseRetentionAge(options.olderThan);
  if (olderThanMs === null) usage(`--older-than must look like 30d, 12h or 90m, got ${options.olderThan}`);
  return { ...options, olderThanMs };
}

async function readHead(path, bytes) {
  const handle = await fs.open(path, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Walks the supplied paths and returns every artifact id they mention. A file
 * that is unreadable, oversized or binary is skipped and counted, because an
 * unread reference is not proof that nothing references the artifact.
 */
async function collectReferences(paths, maxFiles) {
  const found = new Set();
  const state = { files: 0, bytes: 0, truncated: false, skipped: 0 };
  const visitFile = async (path) => {
    if (state.files >= maxFiles || state.bytes >= MAX_REFERENCE_BYTES) {
      state.truncated = true;
      return;
    }
    let stat;
    try {
      stat = await fs.lstat(path);
    } catch {
      state.skipped += 1;
      return;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      state.skipped += 1;
      return;
    }
    if (stat.size > MAX_REFERENCE_FILE_BYTES) {
      state.skipped += 1;
      return;
    }
    let head;
    try {
      head = await readHead(path, Math.min(stat.size, MEDIA_TYPE_BYTES));
    } catch {
      state.skipped += 1;
      return;
    }
    if (head.includes(0)) {
      state.skipped += 1;
      return;
    }
    let text;
    try {
      text = await fs.readFile(path, "latin1");
    } catch {
      state.skipped += 1;
      return;
    }
    state.files += 1;
    state.bytes += stat.size;
    for (const match of text.matchAll(ARTIFACT_REFERENCE)) {
      if (match[1]) found.add(match[1]);
    }
  };
  const visit = async (path) => {
    let stat;
    try {
      stat = await fs.lstat(path);
    } catch {
      state.skipped += 1;
      return;
    }
    if (stat.isSymbolicLink()) {
      state.skipped += 1;
      return;
    }
    if (stat.isFile()) {
      await visitFile(path);
      return;
    }
    if (!stat.isDirectory()) {
      state.skipped += 1;
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(path, { withFileTypes: true });
    } catch {
      state.skipped += 1;
      return;
    }
    for (const entry of entries) {
      if (state.truncated) return;
      if (entry.isSymbolicLink()) {
        state.skipped += 1;
        continue;
      }
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else await visitFile(child);
    }
  };
  for (const path of paths) {
    if (state.truncated) break;
    await visit(resolve(path));
  }
  return { ids: found, ...state };
}

async function directoryBytes(path, entries) {
  let bytes = 0;
  for (const entry of entries) {
    try {
      const stat = await fs.lstat(join(path, entry));
      if (stat.isFile()) bytes += stat.size;
      else if (stat.isDirectory()) bytes += await directoryBytes(join(path, entry), await fs.readdir(join(path, entry)));
    } catch {
      // An unreadable file is not a reason to abort a read-only measurement.
    }
  }
  return bytes;
}

async function readArtifacts(artifactsDir) {
  const artifacts = [];
  let entries;
  try {
    entries = await fs.readdir(artifactsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return artifacts;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !ARTIFACT_ID.test(entry.name)) continue;
    const directory = join(artifactsDir, entry.name);
    let createdAt = Number.NaN;
    try {
      const manifest = JSON.parse(await fs.readFile(join(directory, "manifest.json"), "utf8"));
      createdAt = Date.parse(String(manifest.createdAt));
    } catch {
      // No readable manifest: keep it out of the candidate set (NaN is ignored).
    }
    artifacts.push({
      artifactId: entry.name,
      createdAt: Number.isFinite(createdAt) ? createdAt : 0,
      bytes: await directoryBytes(directory, await fs.readdir(directory).catch(() => [])),
    });
  }
  return artifacts;
}

const options = parseArgs(process.argv.slice(2));
const dataRoot = options.dataDir ? resolve(options.dataDir) : resolveDataRoot(process.env, SELECTED_IDENTITY);
const artifactsDir = join(dataRoot, "artifacts");
const artifacts = await readArtifacts(artifactsDir);
const references = await collectReferences(options.references, options.maxReferenceFiles);
const incomplete = references.truncated;
const referenced = new Set([...options.keep, ...references.ids]);
const plan = planRetention({
  artifacts,
  referenced,
  now: Date.now(),
  olderThanMs: options.olderThanMs,
  maxDeletes: options.max,
  maxDeleteBytes: options.maxBytes,
});

const summary = {
  ok: true,
  mode: options.apply ? "apply" : "dry-run",
  dataRoot,
  artifacts: plan.totalArtifacts,
  artifactBytes: plan.totalBytes,
  deleteCandidates: plan.delete.length,
  deleteBytes: plan.deleteBytes,
  keptReferenced: plan.keptReferenced,
  keptRecent: plan.keptRecent,
  keptOverCap: plan.keptOverCap,
  ignored: plan.ignored,
  deleted: [],
  referenceScan: {
    paths: options.references,
    files: references.files,
    bytes: references.bytes,
    ids: references.ids.size,
    skipped: references.skipped,
    incomplete,
  },
};

if (incomplete && !options.allowIncomplete) {
  summary.ok = false;
  summary.refused = "the reference scan hit its own bound, so an artifact that is still " +
    "referenced could look unreferenced; rerun with more --references coverage or pass " +
    "--allow-incomplete-references";
  if (options.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.error(`refused: ${summary.refused}`);
    console.error(`scanned ${references.files} files; ${plan.delete.length} candidate(s) left untouched.`);
  }
  process.exit(2);
}

if (options.apply) {
  for (const artifact of plan.delete) {
    const directory = join(artifactsDir, artifact.artifactId);
    if (!ARTIFACT_ID.test(artifact.artifactId) || resolve(directory) !== join(artifactsDir, artifact.artifactId)) {
      throw new Error(`refusing unsafe artifact path ${directory}`);
    }
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`refusing non-directory ${directory}`);
    await fs.rm(directory, { recursive: true, force: true });
    summary.deleted.push(artifact.artifactId);
  }
}

if (options.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`${options.apply ? "deleted" : "would delete"} ${plan.delete.length} of ${plan.totalArtifacts} artifacts ` +
    `(${(plan.deleteBytes / 1_048_576).toFixed(1)} MiB of ${(plan.totalBytes / 1_048_576).toFixed(1)} MiB)`);
  console.log(`  referenced (kept): ${plan.keptReferenced};  recent (kept): ${plan.keptRecent};  ` +
    `over cap (kept): ${plan.keptOverCap};  ignored: ${plan.ignored}`);
  console.log(`  reference scan: ${references.files} files, ${references.ids.size} ids` +
    `${incomplete ? " (INCOMPLETE)" : ""}${references.skipped ? `, ${references.skipped} skipped` : ""}`);
  if (!options.apply && plan.delete.length > 0) console.log("  dry run: pass --apply to delete");
  for (const artifact of plan.delete.slice(0, 10)) console.log(`  - ${artifact.artifactId}`);
  if (plan.delete.length > 10) console.log(`  ... ${plan.delete.length - 10} more`);
}
process.exit(plan.delete.length === 0 ? 3 : 0);
