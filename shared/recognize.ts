import { SELECTED_IDENTITY } from "./selected-identity.ts";
import type { PluginIdentity } from "./identity.ts";
import { MAX_MARKER_CHARS } from "./limits.ts";
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

const MARKER_PAYLOAD = new RegExp(`^[^\\s"'<>]{8,${MARKER_MAX_PAYLOAD_CHARS}}`);

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
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(match[0]));
    const result = reportCardSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

const MAX_SCAN_STRINGS = 400;
const MAX_SCANNED_STRING_CHARS = 200_000;
const MAX_SCAN_DEPTH = 12;

/**
 * Walks a provider tool-call payload looking for the marker. Only the first
 * valid reference is used; anything else keeps the native tool row.
 */
export function findReportReference(
  value: unknown,
  identity: PluginIdentity = SELECTED_IDENTITY,
): ReportCardData | null {
  const marker = identity.markerPrefix;
  let visited = 0;
  const seen = new Set<unknown>();

  const walk = (node: unknown, depth: number): ReportCardData | null => {
    if (visited >= MAX_SCAN_STRINGS || depth > MAX_SCAN_DEPTH) return null;
    if (typeof node === "string") {
      visited += 1;
      const text = node.length > MAX_SCANNED_STRING_CHARS ? node.slice(0, MAX_SCANNED_STRING_CHARS) : node;
      return text.includes(marker) ? decodeReportReference(text, identity) : null;
    }
    if (typeof node !== "object" || node === null) return null;
    if (seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const entry of node) {
        const found = walk(entry, depth + 1);
        if (found) return found;
      }
      return null;
    }
    for (const entry of Object.values(node as Record<string, unknown>)) {
      const found = walk(entry, depth + 1);
      if (found) return found;
    }
    return null;
  };

  return walk(value, 0);
}

/**
 * True when a tool name is this plugin's `html_render`. Recognition does not
 * require this: providers such as Pi nest MCP calls inside a `codemode` tool
 * result, so the persisted row is named `codemode`. Kept for diagnostics.
 */
export function isHtmlRenderToolName(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const bare = name.includes("__") ? name.slice(name.lastIndexOf("__") + 2) : name;
  return bare === "html_render";
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
 * Tool-row names that belong to the render tool itself.
 *
 * A per-item transformer cannot see sibling rows, so the row name is the only
 * way to avoid rendering the same artifact twice. Pi stores the marker in two
 * rows: the outer `codemode` wrapper and the inner
 * `mcp__html_render__html_render` result. Rendering both produced duplicate
 * inline cards in the real client (reproduced 2026-10-20), so generic wrappers
 * are rejected here and only the render tool's own row becomes a card.
 */
const RENDER_TOOL_NAMES = new Set(["html_render", "html-render", "htmlrender"]);

export function isRenderToolCall(name: string): boolean {
  // Provider namespaces look like `mcp__html_render__html_render` or
  // `html-render.html_render`; the final segment names the tool itself.
  const last = name.trim().split(/__|\./).pop()?.toLowerCase() ?? "";
  return RENDER_TOOL_NAMES.has(last);
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

export function recognizeToolCall(
  item: RecognizedToolCall,
  identity: PluginIdentity = SELECTED_IDENTITY,
): ReportCardData | null {
  if (typeof item.name !== "string") return null;
  if (isRenderToolCall(item.name)) return findReportReference(item.detail, identity);
  if (isCodemodeToolCall(item.name) && hasNestedRenderCall(item.detail)) {
    return findReportReference(item.detail, identity);
  }
  return null;
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
