import { AbortSignal } from "./cancellation.ts";
import { z } from "zod";
import {
  MAX_HTML_CHARS,
  MAX_SUMMARY_CHARS,
  MAX_TITLE_CHARS,
  PREVIEW_DEFAULT_WIDTH,
  PREVIEW_MAX_WIDTH,
  PREVIEW_MIN_WIDTH,
  RENDER_MAX_HEIGHT,
  RENDER_MIN_HEIGHT,
} from "../shared/limits.ts";
import { buildInteractiveDocument } from "../shared/html-document.ts";
import {
  reportModelSchema,
  graphIdOf,
  type ReportModelV1,
} from "../shared/report-model.ts";
import type { GraphMetadata, MeasuredHeight } from "../shared/protocol.ts";
import type { ArtifactStore } from "./artifacts.ts";
import { ArtifactError } from "./artifacts.ts";
import { renderReportGraph } from "./graph.ts";
import { inlineWorkspaceImages, InlineImagesError } from "./images.ts";
import type { Appearance, RenderInput, RenderOutput, Renderer } from "./renderer.ts";
import { RenderError } from "./renderer.ts";
import { DEFAULT_MEASURE_WIDTHS } from "./renderer-types.ts";
import {
  GUARD_UNATTRIBUTED_WARNING,
  guardKey,
  publishFingerprint,
  type TurnGuard,
  type TurnGuardReservation,
} from "./turn-guard.ts";

/**
 * Tool inputs mirror the observed T3 contract:
 *   html_preview  html, width 240-1600 (default 728), appearance light|dark
 *   html_render   html, title 1-200, height 80-2000
 * `summary` and `report` on html_render are additive: the static PNG remains
 * the portable output, and a report is an optional bounded native model.
 */
export const previewInputSchema = z.object({
  html: z.string().min(1).max(MAX_HTML_CHARS),
  width: z.number().int().min(PREVIEW_MIN_WIDTH).max(PREVIEW_MAX_WIDTH).optional(),
  appearance: z.enum(["light", "dark"]).optional(),
});

export const publishInputSchema = z.object({
  html: z.string().min(1).max(MAX_HTML_CHARS),
  title: z.string().min(1).max(MAX_TITLE_CHARS),
  height: z.number().int().min(RENDER_MIN_HEIGHT).max(RENDER_MAX_HEIGHT),
  summary: z.string().max(MAX_SUMMARY_CHARS).optional(),
  renderMode: z.enum(["static", "auto", "iframe"]).default("auto"),
  /** Strict, bounded report JSON. Never executable and never HTML. */
  report: reportModelSchema.optional(),
});

export interface ToolContext {
  workspaceId: string;
  cwd: string;
  /** Authority-derived workspace root; image reads are contained to it. */
  workspaceRoot?: string;
  /** Authority-owned request cancellation; never decoded from tool JSON. */
  signal?: AbortSignal;
  /** Calling agent, forwarded by the bridge when the adapter knows it. */
  agentId?: string;
}

export interface HtmlPreviewResult {
  width: number;
  contentHeight: number;
  capturedHeight: number;
  suggestedHeight?: number;
  /** Always empty: report JavaScript is disabled, so the page cannot log. */
  consoleMessages: Array<{ level: "log" | "info" | "warning" | "error"; text: string }>;
  screenshot: { mimeType: "image/png"; data: string; width: number; height: number };
  /** Workspace-local images that were not inlined; remote/file URLs stay blocked. */
  missingImages?: Array<{ path: string; reason: string }>;
}

export interface HtmlRenderResult {
  htmlRender: {
    artifactId: string;
    title: string;
    height: number;
    width: number;
    measuredHeight?: number;
    heights?: MeasuredHeight[];
  };
  /** Our accessible extra; the adapter embeds it in the persisted card reference. */
  summary: string | null;
  /** auto: inline on web/desktop, static PNG on native. */
  renderMode?: "static" | "auto" | "iframe";
  hasReport: boolean;
  /** Absolute path to the CSP-protected interactive copy. */
  interactivePath: string;
  /** Non-fatal failures (light preview, graph rasterization, measurement). */
  warnings?: string[];
  missingImages?: Array<{ path: string; reason: string }>;
  message: string;
}

export const PUBLISH_MESSAGE =
  "Shown to the reader above your reply. Don't mention or describe the page; reply with only what it doesn't already say.";

/** Exact final-reply contract; the tool text repeats it verbatim. */
export function interactiveLinkInstruction(interactivePath: string): string {
  return `In your final reply include exactly this Markdown link on its own line: [Open interactive report](<${interactivePath}>)`;
}

export class ToolError extends Error {
  readonly code:
    | "invalid_input"
    | "render_failed"
    | "browser_unavailable"
    | "store_failed"
    | "duplicate";

  constructor(code: ToolError["code"], message: string) {
    super(message);
    this.name = "ToolError";
    this.code = code;
  }
}

function mapError(error: unknown): ToolError {
  if (error instanceof ToolError) return error;
  if (error instanceof InlineImagesError) {
    return new ToolError("invalid_input", error.message);
  }
  if (error instanceof RenderError) {
    if (error.code === "invalid_input") return new ToolError("invalid_input", error.message);
    if (error.code === "browser_unavailable") return new ToolError("browser_unavailable", error.message);
    return new ToolError("render_failed", error.message);
  }
  if (error instanceof ArtifactError) {
    if (error.code === "invalid_input") return new ToolError("invalid_input", error.message);
    if (error.code === "denied") return new ToolError("invalid_input", error.message);
    if (error.code === "too_large") return new ToolError("invalid_input", error.message);
    return new ToolError("store_failed", error.message);
  }
  return new ToolError(
    "render_failed",
    error instanceof Error ? error.message : "HTML rendering failed",
  );
}

export interface HtmlTools {
  preview(raw: unknown, context: ToolContext): Promise<HtmlPreviewResult>;
  publish(raw: unknown, context: ToolContext): Promise<HtmlRenderResult>;
}

type PreparedRenderer = Renderer & {
  renderPrepared?(input: RenderInput): Promise<RenderOutput>;
  measurePrepared?(input: { html: string; widths: readonly number[]; signal?: AbortSignal }): Promise<MeasuredHeight[]>;
  measure?(input: { html: string; widths: readonly number[]; signal?: AbortSignal }): Promise<MeasuredHeight[]>;
};

/**
 * Prepared HTML (image-inlined, still under the server's 8 MiB gate) may exceed
 * the untrusted tool-input bound, so it uses the internal prepared entry points.
 * A renderer without them (tests, legacy) falls back to the ordinary contract.
 */
async function renderPrepared(
  renderer: PreparedRenderer,
  input: RenderInput,
  prepared: boolean,
): Promise<RenderOutput> {
  if (prepared && typeof renderer.renderPrepared === "function") {
    return renderer.renderPrepared(input);
  }
  return renderer.render(input);
}

async function measureWidths(
  renderer: PreparedRenderer,
  html: string,
  prepared: boolean,
  signal?: AbortSignal,
): Promise<MeasuredHeight[]> {
  try {
    if (prepared && typeof renderer.measurePrepared === "function") {
      return await renderer.measurePrepared({ html, widths: DEFAULT_MEASURE_WIDTHS, signal });
    }
    if (typeof renderer.measure === "function") {
      return await renderer.measure({ html, widths: DEFAULT_MEASURE_WIDTHS, signal });
    }
  } catch {
    // Measurement is additive: a failed measurement never blocks publishing.
  }
  return [];
}

function graphMetadataFallback(graph: ReportModelV1["graph"]): GraphMetadata | undefined {
  if (!graph) return undefined;
  return {
    id: graphIdOf(graph),
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    decisionCount: graph.decisions?.length ?? 0,
    previewLight: false,
    previewDark: false,
  };
}

function boundedWarning(prefix: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const single = message.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  return `${prefix}: ${single.length > 300 ? `${single.slice(0, 297)}...` : single}`;
}

export function createHtmlTools(deps: {
  renderer: Renderer;
  store: ArtifactStore;
  /** Optional so existing callers and unit tests keep working unguarded. */
  guard?: TurnGuard;
}): HtmlTools {
  const renderer = deps.renderer as PreparedRenderer;
  const guard = deps.guard;

  return {
    async preview(raw, context) {
      context = { ...context, signal: context.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) };
      const parsed = previewInputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ToolError("invalid_input", parsed.error.issues[0]?.message ?? "Invalid html_preview input");
      }
      if (!context.workspaceId) throw new ToolError("invalid_input", "No owning workspace");
      try {
        const inlined = await inlineWorkspaceImages(parsed.data.html, {
          workspaceRoot: context.workspaceRoot ?? context.cwd,
          cwd: context.cwd,
          signal: context.signal,
        });
        const rendered = await renderPrepared(
          renderer,
          {
            html: inlined.html,
            width: parsed.data.width ?? PREVIEW_DEFAULT_WIDTH,
            appearance: (parsed.data.appearance ?? "dark") as Appearance,
            signal: context.signal,
          },
          inlined.html !== parsed.data.html,
        );
        return {
          width: rendered.width,
          contentHeight: rendered.contentHeight,
          capturedHeight: rendered.capturedHeight,
          suggestedHeight: Math.max(RENDER_MIN_HEIGHT, Math.min(RENDER_MAX_HEIGHT, rendered.contentHeight)),
          consoleMessages: [],
          screenshot: {
            mimeType: "image/png",
            data: rendered.png.toString("base64"),
            width: rendered.width,
            height: rendered.capturedHeight,
          },
          ...inlined.missing.length === 0 ? {} : { missingImages: inlined.missing },
        };
      } catch (error) {
        throw mapError(error);
      }
    },

    async publish(raw, context) {
      context = { ...context, signal: context.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) };
      const parsed = publishInputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ToolError("invalid_input", parsed.error.issues[0]?.message ?? "Invalid html_render input");
      }
      if (!context.workspaceId) throw new ToolError("invalid_input", "No owning workspace");

      // Snapshot the turn before any await. A publish that finishes after the
      // lifecycle has moved on must still charge the turn it started in.
      const key = guard ? guardKey(context.agentId) : null;
      const warnings: string[] = [];
      if (guard && key === null) warnings.push(GUARD_UNATTRIBUTED_WARNING);
      let ticket = guard && key ? guard.captureTurn(key) : null;
      let reservation: TurnGuardReservation | null = null;

      const title = parsed.data.title.trim().slice(0, MAX_TITLE_CHARS);
      const summary = parsed.data.summary?.trim().slice(0, MAX_SUMMARY_CHARS) || null;
      const height = Math.max(RENDER_MIN_HEIGHT, Math.min(parsed.data.height, RENDER_MAX_HEIGHT));
      const renderMode = parsed.data.renderMode;
      const report = parsed.data.report;

      try {
        // Image preparation is part of the observable publish input: the
        // fingerprint uses the prepared HTML so changed local raster bytes are
        // a different card, not "nothing changed".
        const inlined = await inlineWorkspaceImages(parsed.data.html, {
          workspaceRoot: context.workspaceRoot ?? context.cwd,
          cwd: context.cwd,
          signal: context.signal,
        });
        const prepared = inlined.html !== parsed.data.html;
        const hash = guard && key && ticket
          ? publishFingerprint({
              html: inlined.html,
              workspaceId: context.workspaceId,
              title,
              height,
              summary,
              renderMode,
              report,
            })
          : "";
        if (guard && key && ticket) {
          const decision = guard.reserve(ticket, hash);
          // The ticket is consumed whether the reservation succeeds or refuses.
          ticket = null;
          if (!decision.ok) throw new ToolError("duplicate", decision.message);
          reservation = decision.reservation;
          if (decision.warning) warnings.push(decision.warning);
        }

        const rendered = await renderPrepared(
          renderer,
          { html: inlined.html, width: PREVIEW_DEFAULT_WIDTH, appearance: "dark", signal: context.signal },
          prepared,
        );
        // The T3 contract's height is the reader-facing frame height, so keep the
        // requested bounded height. The measured capture is recorded separately.
        const heights = await measureWidths(renderer, inlined.html, prepared, context.signal);
        context.signal?.throwIfAborted();
        if (rendered.capturedHeight < Math.min(rendered.contentHeight, 4000)) {
          warnings.push("Static preview clipped to fit the 3 MiB PNG budget; full HTML is preserved.");
        }

        let previewLightPng: Buffer | undefined;
        try {
          const light = await renderPrepared(
            renderer,
            { html: inlined.html, width: PREVIEW_DEFAULT_WIDTH, appearance: "light", signal: context.signal },
            prepared,
          );
          previewLightPng = light.png;
        } catch (error) {
          warnings.push(boundedWarning("Light preview unavailable", error));
        }

        let graph: {
          metadata: GraphMetadata;
          dark?: Buffer;
          light?: Buffer;
        } | undefined;
        if (report?.graph) {
          try {
            const renderedGraph = await renderReportGraph(report.graph, renderer, {
              width: PREVIEW_DEFAULT_WIDTH,
              signal: context.signal,
            });
            graph = {
              metadata: renderedGraph.metadata,
              ...renderedGraph.dark === undefined ? {} : { dark: renderedGraph.dark.png },
              ...renderedGraph.light === undefined ? {} : { light: renderedGraph.light.png },
            };
          } catch (error) {
            // Keep the authoritative native node/edge list; thumbnails are optional.
            warnings.push(boundedWarning("Graph preview unavailable", error));
            graph = { metadata: graphMetadataFallback(report.graph)! };
          }
        }

        context.signal?.throwIfAborted();
        const interactiveHtml = buildInteractiveDocument({
          html: inlined.html,
          title,
        });

        const stored = await deps.store.save({
          html: parsed.data.html,
          title,
          summary,
          width: rendered.width,
          height,
          workspaceId: context.workspaceId,
          ownerCwd: context.workspaceRoot ?? context.cwd,
          signal: context.signal,
          measuredHeight: rendered.capturedHeight,
          ...heights.length === 0 ? {} : { heights },
          renderMode,
          previewPng: rendered.png,
          ...previewLightPng === undefined ? {} : { previewLightPng },
          interactiveHtml,
          ...report === undefined ? {} : { report },
          ...graph === undefined ? {} : { graph },
        });

        // The card exists from this point. Commit before deriving the file path
        // so a late path failure cannot leave a stored card unremembered and
        // invite a duplicate retry.
        if (reservation) {
          guard?.commit(reservation, {
            workspaceId: context.workspaceId,
            artifactId: stored.manifest.artifactId,
            title: stored.manifest.title,
          });
          reservation = null;
        }

        const interactivePath = await deps.store.interactivePath(
          stored.manifest.artifactId,
          context.workspaceId,
        );
        if (!interactivePath) {
          throw new ToolError("store_failed", "The interactive report could not be stored");
        }
        const measuredHeight = stored.manifest.measuredHeight;
        return {
          htmlRender: {
            artifactId: stored.manifest.artifactId,
            title: stored.manifest.title,
            height: stored.manifest.height,
            width: stored.manifest.width,
            ...measuredHeight === undefined ? {} : { measuredHeight },
            ...stored.manifest.heights === undefined ? {} : { heights: stored.manifest.heights },
          },
          summary: stored.manifest.summary,
          renderMode,
          hasReport: report !== undefined,
          interactivePath,
          ...warnings.length === 0 ? {} : { warnings },
          ...inlined.missing.length === 0 ? {} : { missingImages: inlined.missing },
          message: `${PUBLISH_MESSAGE} ${interactiveLinkInstruction(interactivePath)}`,
        };
      } catch (error) {
        if (reservation) guard?.release(reservation);
        else if (ticket) guard?.abandon(ticket);
        throw mapError(error);
      }
    },
  };
}
