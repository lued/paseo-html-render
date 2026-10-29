import { SELECTED_IDENTITY } from "./selected-identity.ts";
import type { PluginIdentity } from "./identity.ts";
import { MAX_MARKER_CHARS, MAX_MESSAGE_TEXT_CHARS, PREVIEW_DEFAULT_WIDTH } from "./limits.ts";
import { reportCardSchema, type MeasuredHeight, type ReportCardData } from "./protocol.ts";

/**
 * A persisted tool result carries a small self-describing reference. The client
 * transformer finds it in the tool call the provider stored, so the card is
 * rebuilt after a history reload instead of relying on a memory-only row.
 *
 * `<marker><percent-encoded JSON>` is deliberately boring: it survives JSON
 * escaping, Markdown fences, and providers that wrap tool output in text, and
 * it needs no Buffer, atob, or DOM global in the client bundle.
 */
export const REPORT_MARKER = SELECTED_IDENTITY.markerPrefix;
/** Kept equal to the historical 8192-character decode budget. */
export const MARKER_MAX_PAYLOAD_CHARS = MAX_MARKER_CHARS;

/**
 * The exact alphabet `encodeURIComponent` can emit: unreserved characters,
 * digits, `%` escapes, and the sub-delimiters it leaves alone. Single quotes
 * are in that set (`employer's`), so excluding them truncated real markers.
 */
const MARKER_PAYLOAD = new RegExp(`^[A-Za-z0-9%._!~*'()-]{8,${MARKER_MAX_PAYLOAD_CHARS}}`);

/** A trailing `%` or `%A` is an escape cut in half by truncation. */
const PARTIAL_ESCAPE = /%(?:[0-9A-Fa-f]{0,1})$/;

/** Fallback frame height when a truncated marker lost its `height` field. */
const REPAIRED_FRAME_HEIGHT = 600;

/**
 * Some providers drop the marker entirely while preserving the human-readable
 * tool text, which still names the private artifact directory. This is the only
 * fallback that can rebuild a card from such a row: an exact artifact id under
 * `artifacts/<id>/`. It is deliberately narrow, bounded, and only considered
 * for this plugin's render rows and nested codemode render calls.
 */
const ARTIFACT_PATH_ID = /artifacts[\\/]([0-9a-f]{32})(?=[\\/]|$)/g;
const MAX_ARTIFACT_PATH_REFERENCES = 8;
const PUBLISHED_TITLE = /Published a report card titled ("(?:[^"\\]|\\.)*")/;
const REPORT_STORED = /\breportStored:\s*(yes|no)\b/;
const RENDER_MODE = /\brenderMode:\s*(static|auto|iframe)\b/;
const MEASURED_HEIGHTS = /\bmeasuredHeights:\s*((?:\d+\s*x\s*\d+)(?:\s*,\s*\d+\s*x\s*\d+)*)/;

/**
 * Match a top-level field, not a key that happens to appear inside a string
 * value (a summary can quote JSON). The cheap marker is flat, so `{` or `,`
 * before the key is the whole structure we need.
 */
function fieldPattern(key: string, value: string): RegExp {
  return new RegExp(`(?:^|[,{])\\s*"${key}"\\s*:\\s*(${value})`);
}

function jsonStringField(text: string, key: string): string | null {
  const match = fieldPattern(key, '"(?:[^"\\\\]|\\\\.)*"').exec(text);
  if (!match?.[1]) return null;
  try {
    const value: unknown = JSON.parse(match[1]);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function jsonNumberField(text: string, key: string): number | undefined {
  const match = fieldPattern(key, "-?\\d+").exec(text);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : undefined;
}

function jsonBooleanField(text: string, key: string): boolean | undefined {
  const match = fieldPattern(key, "true|false").exec(text);
  return match?.[1] === undefined ? undefined : match[1] === "true";
}

/** Only complete `[width,height]` pairs; a pair cut by truncation is ignored. */
function completeHeights(text: string): Array<[number, number]> | undefined {
  const key = /(?:^|[,{])\s*"heights"\s*:/.exec(text);
  if (!key) return undefined;
  const values: Array<[number, number]> = [];
  for (const match of text.slice(key.index).matchAll(/\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/g)) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) continue;
    values.push([width, height]);
  }
  return values.length > 0 ? values : undefined;
}

/**
 * Recover a reference whose tail was cut off by a provider output cap or by an
 * agent slicing the tool result. The required artifact id and the leading
 * fields survive any prefix; the artifact RPC supplies the authoritative
 * metadata afterwards. Returns null unless a real artifact id is present, so
 * prose that merely mentions the marker cannot become a card.
 */
export function repairReportReference(payload: string): ReportCardData | null {
  const trimmed = payload.replace(PARTIAL_ESCAPE, "");
  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return null;
  }
  if (!decoded.startsWith("{")) return null;
  const artifactId = fieldPattern("artifactId", '"[0-9a-f]{32}"').exec(decoded)?.[1]?.slice(1, 33);
  if (!artifactId) return null;
  const renderMode = jsonStringField(decoded, "renderMode");
  const hasReport = jsonBooleanField(decoded, "hasReport");
  const measuredHeight = jsonNumberField(decoded, "measuredHeight");
  const heights = completeHeights(decoded);
  const candidate = {
    artifactId,
    title: jsonStringField(decoded, "title") ?? "HTML report",
    summary: jsonStringField(decoded, "summary"),
    width: jsonNumberField(decoded, "width") ?? PREVIEW_DEFAULT_WIDTH,
    height: jsonNumberField(decoded, "height") ?? REPAIRED_FRAME_HEIGHT,
    ...renderMode === "static" || renderMode === "auto" || renderMode === "iframe"
      ? { renderMode }
      : {},
    ...hasReport === undefined ? {} : { hasReport },
    ...measuredHeight === undefined ? {} : { measuredHeight },
    ...heights === undefined ? {} : { heights },
  };
  const parsed = reportCardSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Extracts exactly one artifact id from a bounded scan of render-tool output.
 * Multiple distinct ids are ambiguous, so no card is invented.
 */
function artifactIdFromPathReference(text: string): string | null {
  const ids = new Set<string>();
  let scanned = 0;
  for (const match of text.matchAll(ARTIFACT_PATH_ID)) {
    scanned += 1;
    if (scanned > MAX_ARTIFACT_PATH_REFERENCES) break;
    const id = match[1];
    if (id) ids.add(id);
  }
  return ids.size === 1 ? [...ids][0]! : null;
}

function publishedTitle(text: string): string | null {
  const match = PUBLISHED_TITLE.exec(text);
  if (!match?.[1]) return null;
  try {
    const value: unknown = JSON.parse(match[1]);
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
}

function measuredHeightsFromText(text: string): MeasuredHeight[] | undefined {
  const match = MEASURED_HEIGHTS.exec(text);
  if (!match?.[1]) return undefined;
  const byWidth = new Map<number, number>();
  for (const pair of match[1].matchAll(/(\d+)\s*x\s*(\d+)/g)) {
    const width = Number(pair[1]);
    const height = Number(pair[2]);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) continue;
    if (!byWidth.has(width)) byWidth.set(width, height);
  }
  if (byWidth.size === 0) return undefined;
  return [...byWidth.entries()].sort((left, right) => left[0] - right[0]);
}

/**
 * Rebuilds a card reference from the artifact path in a render tool result when
 * the marker is gone. Only an exact `artifacts/<32 hex>/` id is used, and the
 * result is schema-validated like any other reference. Metadata that the text
 * still carries (title, stored-report flag, measured heights) is preserved; the
 * artifact RPC remains authoritative for everything else.
 */
export function recoverReportReferenceFromArtifactPath(
  text: string,
): ReportCardData | null {
  if (typeof text !== "string" || text.length === 0) return null;
  const artifactId = artifactIdFromPathReference(text);
  if (!artifactId) return null;
  const heights = measuredHeightsFromText(text);
  const measuredAtDefault = heights?.find(([width]) => width === PREVIEW_DEFAULT_WIDTH)?.[1];
  const stored = REPORT_STORED.exec(text)?.[1];
  const renderMode = RENDER_MODE.exec(text)?.[1];
  const candidate = {
    artifactId,
    title: publishedTitle(text) ?? "HTML report",
    summary: null,
    width: PREVIEW_DEFAULT_WIDTH,
    height: measuredAtDefault ?? REPAIRED_FRAME_HEIGHT,
    // New rows print renderMode; `auto` is the tool's default for older rows.
    // The durable card sidecar still has the final say after the artifact read.
    renderMode: (renderMode === "static" || renderMode === "iframe" ? renderMode : "auto") as
      | "static"
      | "auto"
      | "iframe",
    ...(stored === undefined ? {} : { hasReport: stored === "yes" }),
    ...(measuredAtDefault === undefined ? {} : { measuredHeight: measuredAtDefault }),
    ...(heights === undefined ? {} : { heights }),
  };
  const parsed = reportCardSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

const MESSAGE_ARTIFACT_LINK = /artifacts[\\/]([0-9a-f]{32})[\\/]interactive\.html/g;

/**
 * The render contract makes the final reply carry the artifact link:
 * `[Open interactive report](</abs/path/artifacts/<id>/interactive.html>)`.
 *
 * That link is the only thing tying a reply to its artifact, so it is matched
 * literally: the exact file name under `artifacts/<32 hex>/`. Several distinct
 * ids mean the reply covers more than one report, which stays on the tool rows.
 * Metadata here is a placeholder; the artifact RPC supplies the authoritative
 * title and render mode once the card mounts.
 */
export function reportReferenceFromMessageText(text: string): ReportCardData | null {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_MESSAGE_TEXT_CHARS) {
    return null;
  }
  let artifactId: string | null = null;
  for (const match of text.matchAll(MESSAGE_ARTIFACT_LINK)) {
    const id = match[1];
    if (!id) continue;
    if (artifactId !== null && artifactId !== id) return null;
    artifactId = id;
  }
  if (artifactId === null) return null;
  const parsed = reportCardSchema.safeParse({
    artifactId,
    title: "HTML report",
    summary: null,
    width: PREVIEW_DEFAULT_WIDTH,
    height: REPAIRED_FRAME_HEIGHT,
    renderMode: "auto",
  });
  return parsed.success ? parsed.data : null;
}

function sortedHeights(heights: readonly MeasuredHeight[] | undefined): MeasuredHeight[] | undefined {
  if (!heights || heights.length === 0) return undefined;
  return [...heights].sort((left, right) => left[0] - right[0]);
}

export function encodeReportReference(
  data: ReportCardData,
  identity: PluginIdentity = SELECTED_IDENTITY,
): string {
  const heights = sortedHeights(data.heights);
  const json = JSON.stringify({
    artifactId: data.artifactId,
    title: data.title,
    summary: data.summary,
    width: data.width,
    height: data.height,
    ...(data.renderMode === undefined ? {} : { renderMode: data.renderMode }),
    ...(data.hasReport === undefined ? {} : { hasReport: data.hasReport }),
    ...(data.measuredHeight === undefined ? {} : { measuredHeight: data.measuredHeight }),
    ...(heights === undefined ? {} : { heights }),
  });
  return identity.markerPrefix + encodeURIComponent(json);
}

export function decodeReportReference(
  text: string,
  identity: PluginIdentity = SELECTED_IDENTITY,
): ReportCardData | null {
  const marker = identity.markerPrefix;
  const at = text.indexOf(marker);
  if (at === -1) return null;
  const tail = text.slice(at + marker.length);
  const match = MARKER_PAYLOAD.exec(tail);
  if (!match) return null;
  // A payload longer than the budget is hostile, not truncated: the match
  // stopped at the cap while payload characters still follow. Do not repair it.
  if (
    match[0].length === MARKER_MAX_PAYLOAD_CHARS &&
    /[A-Za-z0-9%._!~*'()-]/.test(tail.charAt(match[0].length))
  ) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(match[0]));
    const result = reportCardSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return repairReportReference(match[0]);
  }
}

const MAX_SCAN_STRINGS = 400;
const MAX_SCANNED_STRING_CHARS = 200_000;
const MAX_SCAN_DEPTH = 12;

/**
 * Which row a reference came from. A reply that names the artifact outranks a
 * tool row, because Paseo keeps the final assistant message when it collapses a
 * finished turn while the render row is folded away; a persisted marker outranks
 * the artifact-path fallback.
 */
export type ReferenceSource = "marker" | "path" | "message";

export interface FoundReportReference {
  readonly data: ReportCardData;
  /** `marker` is the persisted encoded reference; `path` is the bounded fallback. */
  readonly source: ReferenceSource;
}

/**
 * Walks a provider tool-call payload looking for the marker, then for a bounded
 * artifact-path fallback. Only the first valid reference is used; anything else
 * keeps the native tool row.
 */
export function findReportReferenceWithSource(
  value: unknown,
  identity: PluginIdentity = SELECTED_IDENTITY,
): FoundReportReference | null {
  const marker = identity.markerPrefix;
  let visited = 0;
  let pathCandidate: ReportCardData | null = null;
  const seen = new Set<unknown>();

  // `allowPath` is false under an `input` key: a model-supplied HTML argument
  // must never be mistaken for this render's own artifact path. The marker scan
  // remains unchanged and is still allowed in every string.
  const walk = (node: unknown, depth: number, allowPath: boolean): FoundReportReference | null => {
    if (visited >= MAX_SCAN_STRINGS || depth > MAX_SCAN_DEPTH) return null;
    if (typeof node === "string") {
      visited += 1;
      const text = node.length > MAX_SCANNED_STRING_CHARS ? node.slice(0, MAX_SCANNED_STRING_CHARS) : node;
      if (text.includes(marker)) {
        const found = decodeReportReference(text, identity);
        if (found) return { data: found, source: "marker" };
      }
      if (allowPath && pathCandidate === null && text.includes("artifacts/")) {
        pathCandidate = recoverReportReferenceFromArtifactPath(text);
      }
      return null;
    }
    if (typeof node !== "object" || node === null) return null;
    if (seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const entry of node) {
        const found = walk(entry, depth + 1, allowPath);
        if (found) return found;
      }
      return null;
    }
    for (const [key, entry] of Object.entries(node as Record<string, unknown>)) {
      const found = walk(entry, depth + 1, allowPath && key !== "input");
      if (found) return found;
    }
    return null;
  };

  const foundMarker = walk(value, 0, true);
  if (foundMarker) return foundMarker;
  return pathCandidate ? { data: pathCandidate, source: "path" } : null;
}

export function findReportReference(
  value: unknown,
  identity: PluginIdentity = SELECTED_IDENTITY,
): ReportCardData | null {
  return findReportReferenceWithSource(value, identity)?.data ?? null;
}

/**
 * True when a tool name is this plugin's `html_render`. Recognition does not
 * require this: providers such as Pi nest MCP calls inside a `codemode` tool
 * result, so the persisted row is named `codemode`. Kept for diagnostics.
 */
export function isHtmlRenderToolName(name: unknown): boolean {
  return typeof name === "string" && isRenderToolCall(name);
}

export interface RecognizedToolCall {
  name: unknown;
  detail?: unknown;
  callId?: unknown;
}

/**
 * Duplicate suppression for the two rows Pi can persist for one render: the
 * outer `codemode` wrapper and a direct `html_render` row. The same row may be
 * transformed again while streaming, so a stable call id is allowed through.
 */
export interface TimelineTransformState {
  readonly seen: Map<string, { callId: string; at: number }>;
  readonly now: () => number;
  readonly windowMs: number;
}

export function createTimelineTransformState(
  now: () => number = Date.now,
  windowMs = 10_000,
): TimelineTransformState {
  return { seen: new Map(), now, windowMs };
}

/**
 * Reduces every name shape a provider has produced for this tool to one token.
 *
 * A per-item transformer cannot see sibling rows, so the row name is the only
 * way to avoid rendering the same artifact twice. Pi stores the marker in two
 * rows: the outer `codemode` wrapper and the inner
 * `mcp__html_render__html_render` result. Rendering both produced duplicate
 * inline cards in the real client (reproduced 2026-10-20), so generic wrappers
 * are rejected and only the render tool's own row becomes a card.
 *
 * The same tool therefore has to be recognized under several spellings, where
 * only the last component names it:
 *
 *   html_render                                   bare tool name
 *   mcp__html_render_v3__html_render               `mcp__<server>__<tool>`
 *   html-render-v3.html_render                     dot namespace
 *   html-render-v3 / html_render                   Paseo's omp timeline rename
 *   mcp_html-render-v3__html_render_3422f593a2e9   omp bridge hash suffix
 *
 * Paseo's omp provider bridges MCP itself and renames the timeline item to
 * `${server} / ${tool}`, so a stored row can carry the agent's raw bridged name
 * or that rewrite. Comparing letters and digits only keeps one rule for all of
 * them while still rejecting lookalikes (`not_html_render`, `html_renderer`).
 */
function normalizeToolName(name: string): string {
  let last = name.trim().toLowerCase();
  // `mcp_html-render-v3__html_render_3422f593a2e9` -> `html_render_3422f593a2e9`
  const slash = last.lastIndexOf(" / ");
  if (slash !== -1) last = last.slice(slash + 3);
  last = last.split(/__|\./).pop() ?? last;
  // Deterministic 12-hex hash appended by Paseo's omp MCP bridge.
  last = last.replace(/_[0-9a-f]{12}$/, "");
  return last.replace(/[^a-z0-9]/g, "");
}

export function isRenderToolCall(name: string): boolean {
  return normalizeToolName(name) === "htmlrender";
}

/**
 * Returns the card payload when a render tool row's persisted detail holds a
 * valid marker, and `null` for everything else, so unrelated rows are never
 * touched. The scan is bounded, cycle-safe, and returns only the first valid
 * reference per row.
 */
function isCodemodeToolCall(name: string): boolean {
  return name.trim().toLowerCase() === "codemode";
}

/**
 * Pi records an MCP call made from codemode as one outer `codemode` row whose
 * output carries the nested calls. Those calls are not separate persisted
 * timeline items, so recognizing only `html_render` rows loses every card after
 * a history load. Require a real nested render call so unrelated codemode rows
 * are never touched, then let the marker decide.
 */
function hasNestedRenderCall(detail: unknown): boolean {
  if (typeof detail !== "object" || detail === null) return false;
  const output = (detail as { output?: unknown }).output;
  if (typeof output !== "object" || output === null) return false;
  const details = (output as { details?: unknown }).details;
  if (typeof details !== "object" || details === null) return false;
  const calls = (details as { calls?: unknown }).calls;
  if (!Array.isArray(calls)) return false;
  return calls.some(
    (call) => typeof call === "object" && call !== null && typeof (call as { name?: unknown }).name === "string" && isRenderToolCall((call as { name: string }).name),
  );
}

/**
 * True when this row belongs to the render tool (directly, or through Pi's
 * codemode wrapper). Used by the client catalog to tell an unresolved render
 * row (a gap that may fill while streaming) from an unrelated tool row.
 */
export function isRenderToolRow(item: RecognizedToolCall): boolean {
  if (typeof item.name !== "string") return false;
  if (isRenderToolCall(item.name)) return true;
  return isCodemodeToolCall(item.name) && hasNestedRenderCall(item.detail);
}

export function recognizeToolCallWithSource(
  item: RecognizedToolCall,
  identity: PluginIdentity = SELECTED_IDENTITY,
): FoundReportReference | null {
  if (!isRenderToolRow(item)) return null;
  return findReportReferenceWithSource(item.detail, identity);
}

export function recognizeToolCall(
  item: RecognizedToolCall,
  identity: PluginIdentity = SELECTED_IDENTITY,
): ReportCardData | null {
  return recognizeToolCallWithSource(item, identity)?.data ?? null;
}

export interface PluginTimelineReplacement {
  items: Array<{ type: "plugin"; kind: string; version: number; data: ReportCardData }>;
}

/**
 * Transformer body shared by the client entry and its tests. Returning
 * `undefined` keeps the source item untouched, which is the case for every
 * unrelated tool call.
 */
export function transformTimelineToolCall(
  item: RecognizedToolCall,
  identity: PluginIdentity = SELECTED_IDENTITY,
  state?: TimelineTransformState,
): PluginTimelineReplacement | undefined {
  const data = recognizeToolCall(item, identity);
  if (!data) return undefined;
  if (state) {
    const callId = typeof item.callId === "string" ? item.callId : "";
    const now = state.now();
    const prior = state.seen.get(data.artifactId);
    if (prior && prior.callId !== callId && now - prior.at < state.windowMs) {
      return { items: [] };
    }
    state.seen.set(data.artifactId, { callId, at: now });
    if (state.seen.size > 256) {
      for (const [artifactId, entry] of state.seen) {
        if (now - entry.at >= state.windowMs) state.seen.delete(artifactId);
      }
    }
  }
  return {
    items: [{ type: "plugin", kind: identity.rendererKind, version: identity.reportVersion, data }],
  };
}
