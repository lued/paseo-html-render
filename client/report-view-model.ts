/**
 * Pure view-model helpers for the native report card and screen.
 *
 * Everything here is deterministic and DOM-free so the same decisions can be
 * unit tested without a bundler. Components must not re-implement these rules:
 * live-frame gating, asset selection, tab layout, card highlights, usage
 * provenance and list expansion all come from this module.
 */
import {
  selectHtmlFrameKind,
  type HtmlFramePlatform,
  type HtmlFrameRenderMode,
  type ThemeAppearance,
} from "../shared/html-document.ts";
import type { ReportAssetsMetadata } from "../shared/protocol.ts";
import {
  graphIdOf,
  isSafeHttpUrl,
  type EvidenceRow,
  type ReportBlock,
  type ReportModelV1,
  type ReportStatus,
  type ReportTone,
  type UsageQuantity,
  type UsageSummary,
} from "../shared/report-model.ts";

export type ReportTabId = "overview" | "findings" | "evidence" | "run" | "original";

export interface ReportTab {
  readonly id: ReportTabId;
  readonly label: string;
}

export const REPORT_TAB_LABELS: Readonly<Record<ReportTabId, string>> = {
  overview: "Overview",
  findings: "Findings",
  evidence: "Evidence",
  run: "Run / Usage",
  original: "Original",
};

/** The card has four mutually exclusive presentations. */
export type ReportCardMode = "live" | "loading" | "report" | "image";

export interface ReportCardModeInput {
  platform: HtmlFramePlatform;
  renderMode: HtmlFrameRenderMode;
  /** Whether the original/prepared HTML has arrived. */
  hasHtml: boolean;
  /** The frame reported a timeout or load error. */
  /** Whether a structured ReportModelV1 is available. */
  hasReport: boolean;
}

/**
 * Live HTML wins on web/desktop when the shared gate allows it. Otherwise a
 * structured report wins over the PNG. Native never reaches the live branch.
 */
export function reportCardMode(input: ReportCardModeInput): ReportCardMode {
  const liveGate = selectHtmlFrameKind({
    platform: input.platform,
    renderMode: input.renderMode,
  }) === "live";
  // Live mode never degrades to a static image: the reader asked for HTML.
  if (liveGate) return input.hasHtml ? "live" : "loading";
  if (input.hasReport) return "report";
  return "image";
}

/**
 * Durable artifact metadata wins over the persisted marker. The marker is a
 * cache that a provider can truncate; `card.json` and the manifest are not.
 * Absent on both sides stays absent, which the frame treats as static.
 */
export function cardRenderMode(
  markerMode: HtmlFrameRenderMode,
  durableMode: HtmlFrameRenderMode,
): HtmlFrameRenderMode {
  return durableMode ?? markerMode;
}

/** Light preview when the artifact has one; the dark preview is the default. */
export function previewAssetName(
  appearance: ThemeAppearance,
  assets: ReportAssetsMetadata | undefined,
): "preview" | "previewLight" {
  return appearance === "light" && assets?.previewLight === true ? "previewLight" : "preview";
}

/** Prefer the graph raster that matches the appearance; dark is the fallback. */
export function graphAssetName(
  appearance: ThemeAppearance,
  assets: ReportAssetsMetadata | undefined,
): "graphDark" | "graphLight" | undefined {
  if (appearance === "light") {
    if (assets?.graphLight === true) return "graphLight";
    return assets?.graphDark === true ? "graphDark" : undefined;
  }
  return assets?.graphDark === true ? "graphDark" : undefined;
}

/**
 * Width/height from measured capture or PNG pixels. Callers must not pass the
 * requested frame height, which is a cap rather than the image's own shape.
 */
export function imageAspectRatio(width: unknown, height: unknown): number | undefined {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  return width / height;
}

export function outcomeTone(status: ReportStatus): ReportTone {
  if (status === "success") return "good";
  if (status === "failed") return "bad";
  return "warn";
}

export function outcomeLabel(status: ReportStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const FINDING_KINDS: ReadonlyArray<ReportBlock["kind"]> = ["bullets", "steps"];

/**
 * Overview is always present. Findings, Evidence and Run appear only when the
 * model actually carries content, so the tab bar never exceeds five entries and
 * never offers an empty tab.
 */
export function reportTabs(
  report: ReportModelV1 | null,
  options: { hasOriginal: boolean },
): ReportTab[] {
  const tabs: ReportTab[] = [{ id: "overview", label: REPORT_TAB_LABELS.overview }];
  const blocks = report?.blocks ?? [];
  const hasKind = (kinds: ReadonlyArray<ReportBlock["kind"]>) =>
    blocks.some((block) => kinds.includes(block.kind));
  if (report && hasKind(FINDING_KINDS)) {
    tabs.push({ id: "findings", label: REPORT_TAB_LABELS.findings });
  }
  if (report && (report.evidence !== undefined || hasKind(["evidence"]))) {
    tabs.push({ id: "evidence", label: REPORT_TAB_LABELS.evidence });
  }
  if (
    report &&
    (report.graph !== undefined ||
      report.usage !== undefined ||
      report.promptLesson !== undefined ||
      hasKind(["agents", "graph"]))
  ) {
    tabs.push({ id: "run", label: REPORT_TAB_LABELS.run });
  }
  if (options.hasOriginal) {
    tabs.push({ id: "original", label: REPORT_TAB_LABELS.original });
  }
  return tabs.slice(0, 5);
}

const TAB_BLOCK_KINDS: Readonly<Record<Exclude<ReportTabId, "original">, ReadonlyArray<ReportBlock["kind"]>>> = {
  overview: ["heading", "text", "callout", "code", "table"],
  findings: ["bullets", "steps"],
  evidence: ["evidence"],
  run: ["agents", "graph"],
};

export function blocksForTab(report: ReportModelV1 | null, tab: ReportTabId): ReportBlock[] {
  if (!report || tab === "original") return [];
  const kinds = TAB_BLOCK_KINDS[tab];
  return report.blocks.filter((block) => kinds.includes(block.kind));
}

export interface CardHighlight {
  readonly kind: "metric" | "finding";
  readonly label: string;
  readonly value: string;
  readonly tone: ReportTone;
}

const CARD_HIGHLIGHT_LIMIT = 3;

/**
 * At most three metric/finding highlights for the compact card. Metrics come
 * first; bullet findings fill any remaining slots.
 */
export function cardHighlights(report: ReportModelV1, limit = CARD_HIGHLIGHT_LIMIT): CardHighlight[] {
  const highlights: CardHighlight[] = [];
  for (const metric of report.metrics ?? []) {
    if (highlights.length >= limit) break;
    highlights.push({
      kind: "metric",
      label: metric.label,
      value: metric.value,
      tone: metric.tone ?? "neutral",
    });
  }
  for (const block of report.blocks) {
    if (block.kind !== "bullets") continue;
    for (const item of block.items) {
      if (highlights.length >= limit) break;
      highlights.push({ kind: "finding", label: "Finding", value: item, tone: "neutral" });
    }
  }
  return highlights.slice(0, limit);
}

export function formatUsageNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "Unavailable";
  return new Intl.NumberFormat("en-US").format(value);
}

const USAGE_ROWS: ReadonlyArray<{
  key: Exclude<keyof UsageSummary, "models">;
  label: string;
}> = [
  { key: "inputTokens", label: "Input tokens" },
  { key: "outputTokens", label: "Output tokens" },
  { key: "cachedInputTokens", label: "Cached input tokens" },
  { key: "totalTokens", label: "Total tokens" },
  { key: "costUsd", label: "Cost" },
  { key: "durationMs", label: "Duration" },
];

export interface UsageEntry {
  readonly label: string;
  readonly value: string;
  readonly provenance: UsageQuantity["provenance"];
}

function quantityText(key: string, quantity: UsageQuantity): string {
  if (quantity.provenance === "unavailable") return "Unavailable";
  const prefix = quantity.provenance === "estimated" ? "~" : "";
  if (key === "costUsd") return `${prefix}$${quantity.value.toFixed(2)}`;
  if (key === "durationMs") {
    if (quantity.value < 1_000) return `${prefix}${formatUsageNumber(quantity.value)} ms`;
    return `${prefix}${(quantity.value / 1_000).toFixed(1)} s`;
  }
  return `${prefix}${formatUsageNumber(quantity.value)}`;
}

/** Every supplied usage quantity keeps its provenance; gaps are simply absent. */
export function usageEntries(usage: UsageSummary): UsageEntry[] {
  const entries: UsageEntry[] = [];
  for (const row of USAGE_ROWS) {
    const quantity = usage[row.key];
    if (quantity === undefined) continue;
    entries.push({
      label: row.label,
      value: quantityText(row.key, quantity),
      provenance: quantity.provenance,
    });
  }
  return entries;
}

export interface UsageModelEntry {
  readonly name: string;
  readonly provider?: string;
  readonly tokens?: UsageEntry;
}

export function usageModelEntries(usage: UsageSummary): UsageModelEntry[] {
  return (usage.models ?? []).map((model) => ({
    name: model.name,
    ...(model.provider === undefined ? {} : { provider: model.provider }),
    ...(model.totalTokens === undefined
      ? {}
      : {
          tokens: {
            label: "Tokens",
            value: quantityText("totalTokens", model.totalTokens),
            provenance: model.totalTokens.provenance,
          },
        }),
  }));
}

/** Merges the top-level evidence list and evidence blocks, dropping duplicates. */
export function collectEvidence(report: ReportModelV1): EvidenceRow[] {
  const rows = new Map<string, EvidenceRow>();
  const add = (row: EvidenceRow) => {
    const key = `${row.label}\u0000${row.url ?? ""}\u0000${row.artifactPath ?? ""}`;
    if (!rows.has(key)) rows.set(key, row);
  };
  report.evidence?.forEach(add);
  for (const block of report.blocks) {
    if (block.kind === "evidence") block.items.forEach(add);
  }
  return [...rows.values()];
}

export interface GraphView {
  readonly id: string;
  readonly nodes: NonNullable<ReportModelV1["graph"]>["nodes"];
  readonly edges: NonNullable<ReportModelV1["graph"]>["edges"];
  readonly decisions: NonNullable<NonNullable<ReportModelV1["graph"]>["decisions"]>;
}

/** Resolves a graph block reference; unknown ids render nothing. */
export function graphView(report: ReportModelV1, graphId?: string): GraphView | null {
  const graph = report.graph;
  if (!graph) return null;
  const id = graphIdOf(graph);
  if (graphId !== undefined && graphId !== id) return null;
  return { id, nodes: graph.nodes, edges: graph.edges, decisions: graph.decisions ?? [] };
}

export function listWindow<T>(
  items: readonly T[],
  expanded: boolean,
  limit = 8,
): { items: readonly T[]; hidden: number } {
  if (expanded || items.length <= limit) return { items, hidden: 0 };
  return { items: items.slice(0, limit), hidden: items.length - limit };
}

/** Exact file path shown/copied by the client; never a URL scheme. */
export function interactivePathOf(
  artifact: { interactivePath?: string } | undefined,
  original: { interactivePath?: string } | undefined,
): string | undefined {
  return original?.interactivePath ?? artifact?.interactivePath;
}

/** Prepared document when available; falls back to the exact original. */
export function liveHtmlOf(original: { html: string; interactiveHtml?: string }): string {
  return original.interactiveHtml ?? original.html;
}

export function safeExternalUrl(url: string | undefined): string | undefined {
  return typeof url === "string" && isSafeHttpUrl(url) ? url : undefined;
}
