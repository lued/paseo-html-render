import type { AbortSignal } from "./cancellation.ts";
/**
 * Scoped local-image inlining for report HTML.
 *
 * The daemon inlines raster images that live inside the caller's own workspace
 * so a published page can be self-contained without a network or `file://`
 * fetch. Everything here fails closed:
 *
 * - only the caller workspace (authority-derived) is readable; relative paths
 *   resolve from the caller cwd and absolute paths must still be contained;
 * - symlinks are resolved with `realpath` and the resolved target must remain
 *   inside the workspace; the final open uses `O_NOFOLLOW` and re-checks that
 *   the handle is a regular file, so a swapped symlink cannot redirect a read;
 * - only PNG/JPEG/GIF/WebP/AVIF are accepted by magic bytes. SVG is refused
 *   because it is active content;
 * - one image is capped at `MAX_INLINE_IMAGE_BYTES`; the whole prepared page is
 *   capped below the 8 MiB interactive-document budget.
 *
 * Rewriting is a small HTML tokenizer, not a global regex: comments,
 * declarations, and raw-text elements (`script`, `textarea`, `title`, ...) are
 * copied byte-for-byte, and only `img`/`source` `src`/`srcset`, `style`
 * attributes, and `url()` inside `<style>` text are considered. Remote, data,
 * blob, and `file:` references are left untouched, so they stay blocked.
 */
import { constants as fsConstants, promises as fs } from "node:fs";
import { isAbsolute, relative as relativePath, resolve, sep } from "node:path";
import { MAX_INTERACTIVE_HTML_BYTES, MAX_PATH_CHARS } from "../shared/limits.ts";

/** One image may contribute at most this many source bytes. */
export const MAX_INLINE_IMAGE_BYTES = 2 * 1_048_576;
/** Bound filesystem work even when a page contains thousands of tiny references. */
export const MAX_IMAGE_REFERENCES = 256;
export const MAX_IMAGE_DIAGNOSTICS = 50;
/**
 * The prepared tag must stay below the 8 MiB interactive document budget,
 * leaving room for bootstrap markup and the original HTML.
 */
export const MAX_INLINED_PAGE_BYTES = MAX_INTERACTIVE_HTML_BYTES - 256 * 1_024;

export type MissingImageReason =
  | "not_found"
  | "outside_workspace"
  | "not_regular_file"
  | "too_large"
  | "unsupported_type"
  | "unreadable"
  | "reference_limit";

export interface MissingImage {
  /** The reference as it appeared in the HTML, bounded for diagnostics. */
  path: string;
  reason: MissingImageReason;
}

export interface InlineImagesResult {
  /** HTML with resolvable workspace raster images replaced by data URIs. */
  html: string;
  /** Bounded references that were inlined, in encounter order. */
  inlined: string[];
  /** Bounded diagnostics; nothing outside the workspace is ever read. */
  missing: MissingImage[];
  /** UTF-8 byte length of the prepared HTML. */
  bytes: number;
}

export interface InlineImagesOptions {
  /** Authority-derived workspace root. Reads are contained to this directory. */
  workspaceRoot: string;
  /** Caller cwd; relative references resolve from here. */
  cwd: string;
  maxImageBytes?: number;
  maxPageBytes?: number;
  signal?: AbortSignal;
}

export class InlineImagesError extends Error {
  readonly code: "invalid_input" | "page_too_large";

  constructor(code: InlineImagesError["code"], message: string) {
    super(message);
    this.name = "InlineImagesError";
    this.code = code;
  }
}

interface ImageReadSuccess {
  bytes: Buffer;
  mimeType: string;
}
type ImageRead = ImageReadSuccess | { reason: MissingImageReason };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Magic-byte sniff. Extensions are never trusted and SVG is never a raster. */
export function sniffRasterMime(bytes: Buffer): string | null {
  if (bytes.byteLength >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.byteLength >= 6) {
    const header = bytes.subarray(0, 6).toString("latin1");
    if (header === "GIF87a" || header === "GIF89a") return "image/gif";
  }
  if (
    bytes.byteLength >= 12 &&
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  // ISO BMFF: a compatible brand of avif/avis anywhere in the ftyp box.
  if (bytes.byteLength >= 12 && bytes.subarray(4, 8).toString("latin1") === "ftyp") {
    const boxSize = Math.min(bytes.readUInt32BE(0), bytes.byteLength);
    const brands = bytes.subarray(8, Math.max(12, boxSize)).toString("latin1");
    if (/(?:^|[\u0000-\u0020])(?:avif|avis)(?:[\u0000-\u0020]|$)/.test(brands)) return "image/avif";
  }
  return null;
}

function isContained(root: string, candidate: string): boolean {
  const rel = relativePath(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function boundReference(value: string): string {
  const single = value.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  return single.length > 200 ? `${single.slice(0, 197)}...` : single;
}

/**
 * Returns true for something that could be a local file reference. Schemes,
 * protocol-relative URLs, fragments, and data/blob values are never touched.
 */
function isLocalReference(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > MAX_PATH_CHARS) return false;
  if (/[\u0000-\u001F\u007F]/.test(text)) return false;
  if (text.startsWith("#") || text.startsWith("//")) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(text)) return false;
  if (text.includes("\\")) return false;
  return true;
}

function filesystemPath(value: string): string {
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : value.slice(0, cut);
}

function decodeEntities(value: string): string {
  return value.replace(/&(amp|quot|apos|lt|gt|#39|#x27);/gi, (match, name: string) => {
    const key = name.toLowerCase();
    if (key === "amp") return "&";
    if (key === "quot") return '"';
    if (key === "apos" || key === "#39" || key === "#x27") return "'";
    if (key === "lt") return "<";
    if (key === "gt") return ">";
    return match;
  });
}

function filesystemCandidate(reference: string, options: InlineImagesOptions): string {
  const path = filesystemPath(reference);
  return isAbsolute(path) ? resolve(path) : resolve(options.cwd, path);
}

/** Opens, stats, caps, and sniffs one contained file. Never follows the final symlink. */
async function readImage(
  reference: string,
  options: InlineImagesOptions,
  rootReal: string,
  cache: Map<string, Promise<ImageRead>>,
): Promise<ImageRead> {
  const lexical = filesystemCandidate(reference, options);
  if (!isContained(resolve(options.workspaceRoot), lexical)) {
    // Never stat or read outside the workspace, even for diagnostics.
    return { reason: "outside_workspace" };
  }
  const cached = cache.get(lexical);
  if (cached) return cached;
  const pending = (async (): Promise<ImageRead> => {
    let real: string;
    try {
      real = await fs.realpath(lexical);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return { reason: code === "ENOENT" || code === "ENOTDIR" ? "not_found" : "unreadable" };
    }
    if (!isContained(rootReal, real)) return { reason: "outside_workspace" };
    const maxBytes = options.maxImageBytes ?? MAX_INLINE_IMAGE_BYTES;
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
    try {
      const before = await fs.lstat(real);
      if (!before.isFile() || before.isSymbolicLink()) return { reason: "not_regular_file" };
      handle = await fs.open(real, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0));
      const stat = await handle.stat();
      if (!stat.isFile()) return { reason: "not_regular_file" };
      // O_NOFOLLOW covers the final component only. Verify the actual opened fd
      // on Linux, and the resolved path + inode elsewhere, before reading bytes.
      const openedPath = process.platform === "linux"
        ? await fs.realpath(`/proc/self/fd/${handle.fd}`)
        : await fs.realpath(real);
      if (!isContained(rootReal, openedPath)) return { reason: "outside_workspace" };
      const after = await fs.stat(openedPath);
      if (after.dev !== stat.dev || after.ino !== stat.ino) return { reason: "unreadable" };
      if (stat.size > maxBytes) return { reason: "too_large" };
      const chunks: Buffer[] = [];
      let total = 0;
      const buffer = Buffer.allocUnsafe(64 * 1024);
      for (;;) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, null);
        if (bytesRead === 0) break;
        total += bytesRead;
        if (total > maxBytes) return { reason: "too_large" };
        chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
      }
      const bytes = Buffer.concat(chunks, total);
      const mimeType = sniffRasterMime(bytes);
      if (!mimeType) return { reason: "unsupported_type" };
      return { bytes, mimeType };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ELOOP") return { reason: "outside_workspace" };
      if (code === "ENOENT") return { reason: "not_found" };
      return { reason: "unreadable" };
    } finally {
      await handle?.close().catch(() => {});
    }
  })();
  cache.set(lexical, pending);
  return pending;
}

interface ReferenceResolver {
  missing: MissingImage[];
  inlined: string[];
  maxPageBytes: number;
  pageBytes: number;
  references: number;
}

async function replaceReference(
  resolver: ReferenceResolver,
  reference: string,
  rootReal: string,
  options: InlineImagesOptions,
  cache: Map<string, Promise<ImageRead>>,
): Promise<string | null> {
  options.signal?.throwIfAborted();
  if (!isLocalReference(reference)) return null;
  resolver.references += 1;
  if (resolver.references > MAX_IMAGE_REFERENCES) {
    if (resolver.references === MAX_IMAGE_REFERENCES + 1) {
      if (resolver.missing.length >= MAX_IMAGE_DIAGNOSTICS) resolver.missing.pop();
      resolver.missing.push({ path: "(additional image references)", reason: "reference_limit" });
    }
    return null;
  }
  const decoded = decodeEntities(reference);
  const read = await readImage(decoded, options, rootReal, cache);
  if ("reason" in read) {
    if (resolver.missing.length < MAX_IMAGE_DIAGNOSTICS) {
      resolver.missing.push({ path: boundReference(reference), reason: read.reason });
    }
    return null;
  }
  const dataUri = `data:${read.mimeType};base64,${read.bytes.toString("base64")}`;
  const delta = Buffer.byteLength(dataUri, "utf8") - Buffer.byteLength(reference, "utf8");
  const projected = resolver.pageBytes + delta;
  if (projected > resolver.maxPageBytes) {
    if (resolver.missing.length < MAX_IMAGE_DIAGNOSTICS) {
      resolver.missing.push({ path: boundReference(reference), reason: "too_large" });
    }
    return null;
  }
  resolver.pageBytes = projected;
  resolver.inlined.push(boundReference(reference));
  return dataUri;
}

interface Replacement {
  start: number;
  end: number;
  text: string;
}

const RAW_TEXT_ELEMENTS = new Set([
  "script",
  "textarea",
  "title",
  "xmp",
  "plaintext",
  "noembed",
  "noframes",
  "iframe",
]);

function findTagEnd(html: string, start: number): number {
  let index = start + 1;
  while (index < html.length) {
    const char = html[index]!;
    if (char === '"' || char === "'") {
      const close = html.indexOf(char, index + 1);
      if (close === -1) return html.length;
      index = close + 1;
      continue;
    }
    if (char === ">") return index + 1;
    index += 1;
  }
  return html.length;
}

interface AttributeSpan {
  name: string;
  valueStart: number;
  valueEnd: number;
}

function parseAttributes(tag: string, nameEnd: number): AttributeSpan[] {
  const spans: AttributeSpan[] = [];
  let index = nameEnd;
  while (index < tag.length) {
    while (index < tag.length && /\s/.test(tag[index]!)) index += 1;
    if (index >= tag.length || tag[index] === ">" || tag[index] === "/") break;
    const nameStart = index;
    while (index < tag.length && !/[\s=/>]/.test(tag[index]!)) index += 1;
    const name = tag.slice(nameStart, index).toLowerCase();
    while (index < tag.length && /\s/.test(tag[index]!)) index += 1;
    if (tag[index] !== "=") continue;
    index += 1;
    while (index < tag.length && /\s/.test(tag[index]!)) index += 1;
    const quote = tag[index];
    if (quote === '"' || quote === "'") {
      const close = tag.indexOf(quote, index + 1);
      const end = close === -1 ? tag.length : close;
      spans.push({ name, valueStart: index + 1, valueEnd: end });
      index = close === -1 ? tag.length : close + 1;
    } else {
      const start = index;
      while (index < tag.length && !/[\s>]/.test(tag[index]!)) index += 1;
      spans.push({ name, valueStart: start, valueEnd: index });
    }
  }
  return spans;
}

function splitSrcset(value: string): Array<{ token: string; start: number; end: number }> {
  // A data: candidate puts commas in the value that are not separators. Leave
  // such a list untouched rather than guessing and mangling the data URI.
  if (/data:/i.test(value)) return [];
  const candidates: Array<{ token: string; start: number; end: number }> = [];
  let index = 0;
  while (index < value.length) {
    while (index < value.length && /[\s,]/.test(value[index]!)) index += 1;
    if (index >= value.length) break;
    const start = index;
    while (index < value.length && !/\s/.test(value[index]!)) index += 1;
    let end = index;
    while (end > start && value[end - 1] === ",") end -= 1;
    candidates.push({ token: value.slice(start, end), start, end });
    while (index < value.length && value[index] !== ",") index += 1;
    if (index < value.length) index += 1;
  }
  return candidates;
}

/** Rewrites `url(...)` values in CSS text. Comments and quoted strings are skipped. */
async function rewriteCssUrls(
  css: string,
  resolver: ReferenceResolver,
  rootReal: string,
  options: InlineImagesOptions,
  cache: Map<string, Promise<ImageRead>>,
): Promise<string> {
  const replacements: Replacement[] = [];
  let index = 0;
  while (index < css.length) {
    if (css.startsWith("/*", index)) {
      const end = css.indexOf("*/", index + 2);
      index = end === -1 ? css.length : end + 2;
      continue;
    }
    const char = css[index]!;
    if (char === '"' || char === "'") {
      const close = css.indexOf(char, index + 1);
      index = close === -1 ? css.length : close + 1;
      continue;
    }
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (!/^url\(/i.test(css.slice(index, index + 4))) {
      index += 1;
      continue;
    }
    let cursor = index + 4;
    while (cursor < css.length && /\s/.test(css[cursor]!)) cursor += 1;
    const quote = css[cursor];
    let valueStart: number;
    let valueEnd: number;
    let after: number;
    if (quote === '"' || quote === "'") {
      valueStart = cursor + 1;
      const close = css.indexOf(quote, valueStart);
      if (close === -1) break;
      valueEnd = close;
      after = close + 1;
    } else {
      valueStart = cursor;
      const close = css.indexOf(")", cursor);
      if (close === -1) break;
      valueEnd = close;
      after = close;
    }
    while (valueEnd > valueStart && /\s/.test(css[valueEnd - 1]!)) valueEnd -= 1;
    const reference = css.slice(valueStart, valueEnd);
    const dataUri = await replaceReference(resolver, reference, rootReal, options, cache);
    const closeParen = css.indexOf(")", after);
    const end = closeParen === -1 ? css.length : closeParen + 1;
    if (dataUri) replacements.push({ start: valueStart, end: valueEnd, text: dataUri });
    // Unresolvable local asset: drop the whole call rather than leave a request.
    else if (isLocalReference(reference)) replacements.push({ start: index, end, text: "none" });
    index = end;
  }
  return applyReplacements(css, replacements);
}

function applyReplacements(text: string, replacements: Replacement[]): string {
  if (replacements.length === 0) return text;
  const sorted = [...replacements].sort((left, right) => left.start - right.start);
  const parts: string[] = [];
  let cursor = 0;
  for (const replacement of sorted) {
    if (replacement.start < cursor) continue;
    parts.push(text.slice(cursor, replacement.start), replacement.text);
    cursor = replacement.end;
  }
  parts.push(text.slice(cursor));
  return parts.join("");
}

async function rewriteTag(
  tag: string,
  tagName: string,
  resolver: ReferenceResolver,
  rootReal: string,
  options: InlineImagesOptions,
  cache: Map<string, Promise<ImageRead>>,
): Promise<string> {
  const nameEnd = tagName.length + 1;
  const attributes = parseAttributes(tag, nameEnd);
  const replacements: Replacement[] = [];
  // A local image that cannot be inlined is removed with its tag: publishing a
  // broken-image glyph is worse than showing the page without it. Remote and
  // data: references are left alone; they are the page's own business.
  let dropTag = false;
  let inlinedAny = false;
  for (const attribute of attributes) {
    const raw = tag.slice(attribute.valueStart, attribute.valueEnd);
    if (attribute.name === "src" && (tagName === "img" || tagName === "source")) {
      const dataUri = await replaceReference(resolver, raw, rootReal, options, cache);
      if (dataUri) {
        inlinedAny = true;
        replacements.push({ start: attribute.valueStart, end: attribute.valueEnd, text: dataUri });
      } else if (isLocalReference(raw)) {
        dropTag = true;
      }
      continue;
    }
    if (attribute.name === "srcset" && (tagName === "img" || tagName === "source")) {
      const parts: Replacement[] = [];
      for (const candidate of splitSrcset(raw)) {
        const dataUri = await replaceReference(resolver, candidate.token, rootReal, options, cache);
        if (dataUri) {
          inlinedAny = true;
          parts.push({
            start: attribute.valueStart + candidate.start,
            end: attribute.valueStart + candidate.end,
            text: dataUri,
          });
        }
      }
      if (parts.length === 0 && isLocalReference(raw)) dropTag = true;
      replacements.push(...parts);
      continue;
    }
    if (attribute.name === "style") {
      const rewritten = await rewriteCssUrls(raw, resolver, rootReal, options, cache);
      if (rewritten !== raw) {
        replacements.push({ start: attribute.valueStart, end: attribute.valueEnd, text: rewritten });
      }
    }
  }
  if (dropTag && !inlinedAny) return "";
  return applyReplacements(tag, replacements);
}

interface CloseTag {
  /** Offset of the closing tag, or the end of the document. */
  closeStart: number;
  /** Offset just past the closing tag. */
  stop: number;
}

function findCloseTag(html: string, from: number, name: string): CloseTag {
  const pattern = new RegExp(`</${name}\\s*>`, "i");
  const match = pattern.exec(html.slice(from));
  if (!match) return { closeStart: html.length, stop: html.length };
  const closeStart = from + match.index;
  return { closeStart, stop: closeStart + match[0].length };
}

/**
 * Rewrites the document around scoped raster images. The input string is never
 * mutated; the returned HTML is the only prepared version.
 */
export async function inlineWorkspaceImages(
  html: string,
  options: InlineImagesOptions,
): Promise<InlineImagesResult> {
  options.signal?.throwIfAborted();
  if (typeof html !== "string" || html.length === 0) {
    throw new InlineImagesError("invalid_input", "html must be a non-empty string");
  }
  if (!options.workspaceRoot || !isAbsolute(options.workspaceRoot)) {
    throw new InlineImagesError("invalid_input", "workspace root must be absolute");
  }
  if (!options.cwd || !isAbsolute(options.cwd)) {
    throw new InlineImagesError("invalid_input", "caller cwd must be absolute");
  }
  // A workspace root that cannot be resolved cannot contain a readable image;
  // keep the lexical root so containment still fails closed instead of reading.
  let rootReal: string;
  try {
    rootReal = await fs.realpath(options.workspaceRoot);
  } catch {
    rootReal = resolve(options.workspaceRoot);
  }
  const cache = new Map<string, Promise<ImageRead>>();
  const resolver: ReferenceResolver = {
    missing: [],
    inlined: [],
    maxPageBytes: options.maxPageBytes ?? MAX_INLINED_PAGE_BYTES,
    pageBytes: Buffer.byteLength(html, "utf8"),
    references: 0,
  };

  const output: string[] = [];
  let index = 0;
  while (index < html.length) {
    options.signal?.throwIfAborted();
    const lt = html.indexOf("<", index);
    if (lt === -1) {
      output.push(html.slice(index));
      break;
    }
    output.push(html.slice(index, lt));
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      const stop = end === -1 ? html.length : end + 3;
      output.push(html.slice(lt, stop));
      index = stop;
      continue;
    }
    if (html.startsWith("<![CDATA[", lt)) {
      const end = html.indexOf("]]>", lt + 9);
      const stop = end === -1 ? html.length : end + 3;
      output.push(html.slice(lt, stop));
      index = stop;
      continue;
    }
    const next = html[lt + 1] ?? "";
    if (next === "!" || next === "?" || next === "/") {
      const stop = findTagEnd(html, lt);
      output.push(html.slice(lt, stop));
      index = stop;
      continue;
    }
    const nameMatch = /^<([A-Za-z][A-Za-z0-9:-]*)/.exec(html.slice(lt, lt + 64));
    if (!nameMatch) {
      output.push("<");
      index = lt + 1;
      continue;
    }
    const rawName = nameMatch[1]!;
    const tagName = rawName.toLowerCase();
    const tagEnd = findTagEnd(html, lt);
    const rawTag = html.slice(lt, tagEnd);
    if (RAW_TEXT_ELEMENTS.has(tagName)) {
      const { stop } = findCloseTag(html, tagEnd, rawName);
      output.push(html.slice(lt, stop));
      index = stop;
      continue;
    }
    if (tagName === "style") {
      const { closeStart, stop } = findCloseTag(html, tagEnd, rawName);
      const opening = await rewriteTag(rawTag, tagName, resolver, rootReal, options, cache);
      const css = await rewriteCssUrls(html.slice(tagEnd, closeStart), resolver, rootReal, options, cache);
      output.push(opening, css, html.slice(closeStart, stop));
      index = stop;
      continue;
    }
    // Parsing every tag keeps attribute-name matching case-insensitive and
    // limits rewrites to src/srcset/style only.
    output.push(await rewriteTag(rawTag, tagName, resolver, rootReal, options, cache));
    index = tagEnd;
  }

  const prepared = output.join("");
  const bytes = Buffer.byteLength(prepared, "utf8");
  if (bytes > resolver.maxPageBytes) {
    throw new InlineImagesError(
      "page_too_large",
      `The page is ${bytes} bytes after inlining images; the limit is ${resolver.maxPageBytes} bytes. Use smaller images.`,
    );
  }
  return { html: prepared, inlined: resolver.inlined, missing: resolver.missing, bytes };
}
