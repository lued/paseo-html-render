import type { AbortSignal } from "./cancellation.ts";
import { randomBytes } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import {
  MAX_HTML_CHARS,
  MAX_INTERACTIVE_HTML_BYTES,
  MAX_ORIGINAL_HTML_BYTES,
  MAX_PREVIEW_PNG_BYTES,
  MAX_REPORT_BYTES,
  MAX_SUMMARY_CHARS,
  MAX_TITLE_CHARS,
} from "../shared/limits.ts";
import {
  artifactIdSchema,
  artifactManifestSchema,
  type ArtifactManifest,
  type GraphMetadata,
  type ReportAssetName,
} from "../shared/protocol.ts";
import {
  reportModelSchema,
  type ReportModelV1,
} from "../shared/report-model.ts";
import { assertInteractiveDocumentBudget } from "../shared/html-document.ts";
import type { MeasuredHeight } from "../shared/protocol.ts";

export class ArtifactError extends Error {
  readonly code: "invalid_input" | "not_found" | "denied" | "too_large" | "store_failed";

  constructor(code: ArtifactError["code"], message: string) {
    super(message);
    this.name = "ArtifactError";
    this.code = code;
  }
}

export interface SaveArtifactInput {
  html: string;
  title: string;
  summary: string | null;
  width: number;
  height: number;
  workspaceId: string;
  ownerCwd: string;
  signal?: AbortSignal;
  /** Measured capture height; the stored `height` stays the requested frame height. */
  measuredHeight?: number;
  /** Optional multi-width measurements, already sorted by the renderer. */
  heights?: MeasuredHeight[];
  previewPng: Buffer;
  /** Optional light-theme static preview. */
  previewLightPng?: Buffer;
  /** CSP-protected, image-inlined copy for the file preview. */
  interactiveHtml?: string;
  /** Strict, bounded native report model. */
  report?: ReportModelV1;
  /** Optional graph thumbnails plus metadata; the graph body stays in the report. */
  graph?: {
    metadata: GraphMetadata;
    dark?: Buffer;
    light?: Buffer;
  };
}

export interface StoredArtifact {
  manifest: ArtifactManifest;
}

export interface PurgeResult {
  workspaceId: string;
  dryRun: boolean;
  artifactIds: string[];
  bytes: number;
}

const MANIFEST_FILE = "manifest.json";
const ORIGINAL_FILE = "original.html";
const PREVIEW_FILE = "preview.png";
const PREVIEW_LIGHT_FILE = "preview-light.png";
const INTERACTIVE_FILE = "interactive.html";
const REPORT_FILE = "report.json";
const GRAPH_DARK_FILE = "graph-dark.png";
const GRAPH_LIGHT_FILE = "graph-light.png";

function assertContained(root: string, candidate: string): string {
  const normalizedRoot = resolve(root);
  const normalized = resolve(candidate);
  if (normalized !== normalizedRoot && !normalized.startsWith(normalizedRoot + sep)) {
    throw new ArtifactError("denied", "Artifact path escapes the store");
  }
  return normalized;
}

async function writeFileAtomic(path: string, data: string | Buffer, mode: number): Promise<void> {
  const tmp = join(dirname(path), `.tmp-${randomBytes(8).toString("hex")}`);
  const handle = await fs.open(tmp, "wx", mode);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, path);
}

/**
 * Reads a stored file without following a final symlink and verifies that the
 * opened handle is a regular file. Missing files are `not_found`; anything that
 * could escape the artifact directory is `denied`.
 */
async function readStoredFile(dir: string, name: string, maxBytes: number): Promise<Buffer> {
  const path = assertContained(dir, join(dir, name));
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const stat = await handle.stat();
    if (!stat.isFile()) throw new ArtifactError("denied", "Stored artifact is not a regular file");
    if (stat.size > maxBytes) throw new ArtifactError("store_failed", "Stored artifact exceeds its budget");
    const chunks: Buffer[] = [];
    let total = 0;
    const buffer = Buffer.allocUnsafe(64 * 1024);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxBytes) throw new ArtifactError("store_failed", "Stored artifact exceeds its budget");
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    return Buffer.concat(chunks, total);
  } catch (error) {
    if (error instanceof ArtifactError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new ArtifactError("not_found", "This report asset is not stored");
    if (code === "ELOOP") throw new ArtifactError("denied", "Stored artifact path is not safe");
    throw new ArtifactError("store_failed", "The stored artifact could not be read");
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function assertRegularDirectory(dir: string): Promise<void> {
  const stat = await fs.lstat(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new ArtifactError("denied", "Stored artifact path is not a directory");
  }
}

/** PNG IHDR dimensions; optional metadata, never trusted for rendering decisions. */
export function pngDimensions(png: Buffer): { width: number; height: number } | null {
  if (png.byteLength < 24) return null;
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  if (png.subarray(12, 16).toString("latin1") !== "IHDR") return null;
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;
  return { width, height };
}

/**
 * Owner-only artifact store. One directory per artifact holding the manifest,
 * the original HTML exactly as supplied, the static preview PNGs, the optional
 * interactive HTML, report JSON, and optional graph PNGs.
 *
 * Manifest version 1 remains readable without any of the optional fields, so
 * artifacts written by the static-only plugin keep working.
 */
export class ArtifactStore {
  readonly root: string;
  readonly artifactsDir: string;

  constructor(root: string) {
    this.root = resolve(root);
    this.artifactsDir = join(this.root, "artifacts");
  }

  async ensure(): Promise<void> {
    await fs.mkdir(this.artifactsDir, { recursive: true, mode: 0o700 });
    await fs.chmod(this.root, 0o700);
    await fs.chmod(this.artifactsDir, 0o700);
  }

  private dirFor(artifactId: string): string {
    const parsed = artifactIdSchema.safeParse(artifactId);
    if (!parsed.success) throw new ArtifactError("invalid_input", "Malformed artifact id");
    return assertContained(this.artifactsDir, join(this.artifactsDir, parsed.data));
  }

  async save(input: SaveArtifactInput): Promise<StoredArtifact> {
    input.signal?.throwIfAborted();
    const html = input.html;
    if (typeof html !== "string" || html.length === 0) {
      throw new ArtifactError("invalid_input", "html must be a non-empty string");
    }
    if (html.length > MAX_HTML_CHARS) {
      throw new ArtifactError("too_large", `html exceeds ${MAX_HTML_CHARS} characters`);
    }
    if (Buffer.byteLength(html, "utf8") > MAX_ORIGINAL_HTML_BYTES) {
      throw new ArtifactError("too_large", `html exceeds ${MAX_ORIGINAL_HTML_BYTES} bytes`);
    }
    const title = input.title.trim().slice(0, MAX_TITLE_CHARS);
    if (!title) throw new ArtifactError("invalid_input", "title must not be empty");
    const summary = input.summary?.trim().slice(0, MAX_SUMMARY_CHARS) || null;
    if (!Number.isInteger(input.width) || input.width < 1 || input.width > 10_000) {
      throw new ArtifactError("invalid_input", "width is out of range");
    }
    if (!Number.isInteger(input.height) || input.height < 1) {
      throw new ArtifactError("invalid_input", "height is out of range");
    }
    if (input.previewPng.byteLength === 0 || input.previewPng.byteLength > MAX_PREVIEW_PNG_BYTES) {
      throw new ArtifactError("too_large", "preview image is empty or too large");
    }
    if (
      input.previewLightPng !== undefined &&
      (input.previewLightPng.byteLength === 0 || input.previewLightPng.byteLength > MAX_PREVIEW_PNG_BYTES)
    ) {
      throw new ArtifactError("too_large", "light preview image is empty or too large");
    }
    if (!input.workspaceId) throw new ArtifactError("denied", "workspace ownership is required");

    let report: ReportModelV1 | undefined;
    let reportBytes: number | undefined;
    if (input.report !== undefined) {
      const parsed = reportModelSchema.safeParse(input.report);
      if (!parsed.success) {
        throw new ArtifactError(
          "invalid_input",
          parsed.error.issues[0]?.message ?? "report does not match the report model",
        );
      }
      report = parsed.data;
      reportBytes = Buffer.byteLength(JSON.stringify(report), "utf8");
      if (reportBytes > MAX_REPORT_BYTES) {
        throw new ArtifactError("too_large", `report exceeds ${MAX_REPORT_BYTES} bytes`);
      }
    }

    let interactiveBytes: number | undefined;
    if (input.interactiveHtml !== undefined) {
      try {
        interactiveBytes = assertInteractiveDocumentBudget(input.interactiveHtml);
      } catch (error) {
        throw new ArtifactError(
          "too_large",
          error instanceof Error ? error.message : "interactive HTML exceeds its budget",
        );
      }
    }

    for (const [name, png] of [
      ["graph dark", input.graph?.dark],
      ["graph light", input.graph?.light],
    ] as const) {
      if (png !== undefined && (png.byteLength === 0 || png.byteLength > MAX_PREVIEW_PNG_BYTES)) {
        throw new ArtifactError("too_large", `${name} image is empty or too large`);
      }
    }

    await this.ensure();
    const artifactId = randomBytes(16).toString("hex");
    const dir = this.dirFor(artifactId);
    await fs.mkdir(dir, { mode: 0o700 });
    const heights = input.heights && input.heights.length > 0 ? input.heights : undefined;
    const themePreview =
      input.previewLightPng !== undefined
        ? { light: true, dark: true }
        : undefined;
    const manifest: ArtifactManifest = {
      version: 1,
      artifactId,
      title,
      summary,
      width: input.width,
      height: input.height,
      htmlBytes: Buffer.byteLength(html, "utf8"),
      createdAt: new Date().toISOString(),
      workspaceId: input.workspaceId,
      ownerCwd: input.ownerCwd,
      ...input.measuredHeight === undefined ? {} : { measuredHeight: input.measuredHeight },
      ...heights === undefined ? {} : { heights },
      ...report === undefined ? {} : { report, ...(reportBytes === undefined ? {} : { reportBytes }) },
      ...interactiveBytes === undefined ? {} : { interactiveBytes },
      ...themePreview === undefined ? {} : { themePreview },
      ...input.graph === undefined ? {} : { graph: input.graph.metadata },
    };
    const write = async (name: string, data: string | Buffer) => {
      input.signal?.throwIfAborted();
      await writeFileAtomic(join(dir, name), data, 0o600);
      input.signal?.throwIfAborted();
    };
    try {
      // Original HTML is always the caller's exact bytes; prepared documents are separate.
      await write(ORIGINAL_FILE, html);
      await write(PREVIEW_FILE, input.previewPng);
      if (input.previewLightPng) {
        await write(PREVIEW_LIGHT_FILE, input.previewLightPng);
      }
      if (input.interactiveHtml !== undefined) {
        await write(INTERACTIVE_FILE, input.interactiveHtml);
      }
      if (input.graph?.dark) {
        await write(GRAPH_DARK_FILE, input.graph.dark);
      }
      if (input.graph?.light) {
        await write(GRAPH_LIGHT_FILE, input.graph.light);
      }
      if (report !== undefined) {
        await write(REPORT_FILE, JSON.stringify(report));
      }
      // Manifest last: a reader never sees a manifest for an incomplete artifact.
      await write(MANIFEST_FILE, JSON.stringify(manifest));
    } catch (error) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      throw new ArtifactError(
        "store_failed",
        error instanceof Error ? `Artifact could not be saved: ${error.message}` : "Artifact could not be saved",
      );
    }
    return { manifest };
  }

  private async readManifest(artifactId: string): Promise<ArtifactManifest> {
    const dir = this.dirFor(artifactId);
    // Refuse a symlinked artifact directory before opening anything inside it.
    try {
      await assertRegularDirectory(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ArtifactError("not_found", "This report is no longer stored on the daemon");
      }
      throw error instanceof ArtifactError
        ? error
        : new ArtifactError("denied", "Stored artifact path is not a directory");
    }
    let raw: string;
    try {
      raw = (await readStoredFile(dir, MANIFEST_FILE, 4 * 1_048_576)).toString("utf8");
    } catch (error) {
      if (error instanceof ArtifactError && error.code === "not_found") {
        throw new ArtifactError("not_found", "This report is no longer stored on the daemon");
      }
      throw error;
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw) as unknown;
    } catch {
      throw new ArtifactError("store_failed", "Stored report manifest is invalid");
    }
    const parsed = artifactManifestSchema.safeParse(parsedJson);
    if (!parsed.success) throw new ArtifactError("store_failed", "Stored report manifest is invalid");
    return parsed.data;
  }

  /** Ownership check shared by every read. The caller's workspace must match. */
  async openForWorkspace(
    artifactId: string,
    requesterWorkspaceId: string | null,
  ): Promise<{ manifest: ArtifactManifest; dir: string }> {
    const manifest = await this.readManifest(artifactId);
    if (!requesterWorkspaceId || manifest.workspaceId !== requesterWorkspaceId) {
      throw new ArtifactError("denied", "This report belongs to another workspace");
    }
    const dir = this.dirFor(artifactId);
    await assertRegularDirectory(dir);
    return { manifest, dir };
  }

  async readPreview(artifactId: string, requesterWorkspaceId: string | null): Promise<{
    manifest: ArtifactManifest;
    png: Buffer;
  }> {
    return this.readAsset(artifactId, requesterWorkspaceId, "preview");
  }

  /** Named PNG assets. Legacy artifacts only have `preview`. */
  async readAsset(
    artifactId: string,
    requesterWorkspaceId: string | null,
    asset: ReportAssetName,
  ): Promise<{ manifest: ArtifactManifest; png: Buffer; asset: ReportAssetName }> {
    const { manifest, dir } = await this.openForWorkspace(artifactId, requesterWorkspaceId);
    const file = asset === "preview"
      ? PREVIEW_FILE
      : asset === "previewLight"
        ? PREVIEW_LIGHT_FILE
        : asset === "graphDark"
          ? GRAPH_DARK_FILE
          : GRAPH_LIGHT_FILE;
    const png = await readStoredFile(dir, file, MAX_PREVIEW_PNG_BYTES);
    if (png.byteLength === 0) throw new ArtifactError("store_failed", "Stored image is invalid");
    return { manifest, png, asset };
  }

  async readOriginal(artifactId: string, requesterWorkspaceId: string | null): Promise<{
    manifest: ArtifactManifest;
    html: string;
  }> {
    const { manifest, dir } = await this.openForWorkspace(artifactId, requesterWorkspaceId);
    const html = (await readStoredFile(dir, ORIGINAL_FILE, MAX_ORIGINAL_HTML_BYTES)).toString("utf8");
    return { manifest, html };
  }

  /** Prepared interactive document; `null` for artifacts written before it existed. */
  async readInteractive(artifactId: string, requesterWorkspaceId: string | null): Promise<{
    manifest: ArtifactManifest;
    html: string;
    path: string;
  } | null> {
    const { manifest, dir } = await this.openForWorkspace(artifactId, requesterWorkspaceId);
    if (manifest.interactiveBytes === undefined) return null;
    try {
      const html = (
        await readStoredFile(dir, INTERACTIVE_FILE, MAX_INTERACTIVE_HTML_BYTES)
      ).toString("utf8");
      return { manifest, html, path: join(dir, INTERACTIVE_FILE) };
    } catch (error) {
      if (error instanceof ArtifactError && error.code === "not_found") return null;
      throw error;
    }
  }

  async interactivePath(
    artifactId: string,
    requesterWorkspaceId: string | null,
  ): Promise<string | null> {
    const { manifest, dir } = await this.openForWorkspace(artifactId, requesterWorkspaceId);
    if (manifest.interactiveBytes === undefined) return null;
    return join(dir, INTERACTIVE_FILE);
  }

  /** Bounded native report read; `null` for artifacts written before reports. */
  async readReport(artifactId: string, requesterWorkspaceId: string | null): Promise<{
    manifest: ArtifactManifest;
    report: ReportModelV1 | null;
  }> {
    const { manifest, dir } = await this.openForWorkspace(artifactId, requesterWorkspaceId);
    if (manifest.report !== undefined) return { manifest, report: manifest.report };
    if (manifest.reportBytes === undefined) return { manifest, report: null };
    let raw: string;
    try {
      raw = (await readStoredFile(dir, REPORT_FILE, MAX_REPORT_BYTES)).toString("utf8");
    } catch (error) {
      if (error instanceof ArtifactError && error.code === "not_found") {
        throw new ArtifactError("store_failed", "Stored report body is missing");
      }
      throw error;
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw) as unknown;
    } catch {
      throw new ArtifactError("store_failed", "Stored report body is invalid");
    }
    const parsed = reportModelSchema.safeParse(parsedJson);
    if (!parsed.success) throw new ArtifactError("store_failed", "Stored report body is invalid");
    return { manifest, report: parsed.data };
  }

  /**
   * Workspace-scoped cleanup for the opt-in archive hook and explicit tests.
   * Symlinked or malformed entries are never followed or deleted. `dryRun`
   * reports what would be removed without deleting anything.
   */
  async purgeWorkspace(
    workspaceId: string,
    options: { dryRun?: boolean } = {},
  ): Promise<PurgeResult> {
    if (!workspaceId) throw new ArtifactError("invalid_input", "workspace id is required");
    const dryRun = options.dryRun === true;
    const result: PurgeResult = { workspaceId, dryRun, artifactIds: [], bytes: 0 };
    let entries: Array<{ name: string; isDirectory(): boolean; isSymbolicLink(): boolean }>;
    try {
      entries = await fs.readdir(this.artifactsDir, { withFileTypes: true });
    } catch {
      return result;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (!artifactIdSchema.safeParse(entry.name).success) continue;
      const dir = assertContained(this.artifactsDir, join(this.artifactsDir, entry.name));
      let manifest: ArtifactManifest;
      try {
        manifest = await this.readManifest(entry.name);
      } catch {
        continue;
      }
      if (manifest.workspaceId !== workspaceId) continue;
      let bytes = 0;
      const files = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const file of files) {
        if (!file.isFile() || file.isSymbolicLink()) continue;
        const stat = await fs.lstat(join(dir, file.name)).catch(() => null);
        if (stat?.isFile()) bytes += stat.size;
      }
      result.artifactIds.push(entry.name);
      result.bytes += bytes;
      if (dryRun) continue;
      const check = await fs.lstat(dir).catch(() => null);
      if (!check?.isDirectory() || check.isSymbolicLink()) continue;
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    return result;
  }
}
