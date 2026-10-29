import type { AbortSignal } from "./cancellation.ts";
/**
 * Bounded report-graph layout and rasterization.
 *
 * The untrusted part of a graph is its labels and ids. This module never
 * forwards either into Mermaid syntax:
 *
 * - report node ids only select an internal `n0..nN` name;
 * - labels are escaped or conservatively rewritten so quotes, brackets,
 *   newlines, HTML, pipes, and directive-looking `%%` text cannot terminate a
 *   label, open a Mermaid keyword (`click`, `link`, `subgraph`), or inject HTML;
 * - Pele runs with links and images disabled and with its own source/output
 *   limits, so an SVG cannot contain `<a>`, `href`, or `<image>`;
 * - the SVG is validated again before an inert, script-disabled Chromium
 *   screenshot, and PNG bytes are capped.
 *
 * Pele is synchronous and offers no cancellation. Complexity is therefore
 * bounded before it runs: at most 200 nodes, 400 edges, 100 decisions, 200
 * characters per label, and 200,000 characters of generated Mermaid. Those
 * bounds are the timeout substitute for a hostile 200-node graph.
 *
 * ./vendor/pele-flowchart.mjs is pele 1.7.0 with only the flowchart grammar.
 * Vendoring it keeps the package free of runtime dependencies, so a bare git
 * clone compiles with no install step.
 */
import { render as renderMermaid } from "./vendor/pele-flowchart.mjs";
import {
  MAX_CAPTURED_HEIGHT,
  MAX_GRAPH_EDGES,
  MAX_GRAPH_LABEL_CHARS,
  MAX_PREVIEW_PNG_BYTES,
  MAX_HTML_CHARS,
  PREVIEW_DEFAULT_WIDTH,
  PREVIEW_MAX_WIDTH,
  PREVIEW_MIN_WIDTH,
} from "../shared/limits.ts";
import { graphIdOf, graphSchema, type ReportGraph } from "../shared/report-model.ts";
import type { GraphMetadata } from "../shared/protocol.ts";
import { MAX_GRAPH_SVG_CHARS } from "./renderer-types.ts";
import type { Appearance, RenderInput, RenderOutput, Renderer } from "./renderer.ts";

export class GraphRenderError extends Error {
  readonly code: "invalid_graph" | "layout_failed" | "output_too_large" | "render_failed";

  constructor(code: GraphRenderError["code"], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GraphRenderError";
    this.code = code;
  }
}

/** Generated Mermaid source bound. Well above 200 nodes of 200-char labels. */
export const MAX_GRAPH_MERMAID_CHARS = 200_000;
/** Fixed wrapper budget: page shell, CSS, and padding around one SVG. */
const GRAPH_PAGE_OVERHEAD = 4_096;
const GRAPH_PAGE_BUDGET = MAX_HTML_CHARS - GRAPH_PAGE_OVERHEAD;
const GRAPH_PELE_OUTPUT_LIMIT = Math.min(MAX_GRAPH_SVG_CHARS, GRAPH_PAGE_BUDGET);

/** Only `render` is needed; the existing inert renderer satisfies this. */
export type GraphRasterizer = Pick<Renderer, "render">;

export interface RenderReportGraphOptions {
  /** Graph canvas width in CSS pixels. Defaults to the preview column. */
  width?: number;
  /** Defaults to both light and dark. Order is irrelevant; output is named. */
  appearances?: readonly Appearance[];
  /** Owning request cancellation; never taken from the report JSON. */
  signal?: AbortSignal;
}

export interface RenderedGraphImage extends RenderOutput {
  appearance: Appearance;
}

export interface ReportGraphRenderResult {
  graph: ReportGraph;
  graphId: string;
  mermaid: string;
  metadata: GraphMetadata;
  light?: RenderedGraphImage;
  dark?: RenderedGraphImage;
}

/** `createGraphRenderer(renderer).renderGraph(graph)` is the common entry point. */
export interface ReportGraphRenderer {
  renderGraph(graph: unknown, options?: RenderReportGraphOptions): Promise<ReportGraphRenderResult>;
}

const CONTROL = /[\u0000-\u001F\u007F]/g;
const WHITESPACE = /\s+/g;

/**
 * Node labels stay quoted, but every metacharacter that could close the quote,
 * open Mermaid structure, HTML, or a directive is rewritten to an inert
 * fullwidth/escaped form. `&quot;` is the only quote encoding Pele passes
 * through without terminating the label; percent signs are widened so no
 * `%%{...}%%` directive survives; backslashes become slashes so no escape
 * sequence can swallow the closing quote. `&`, `#`, `;`, and `:` stay literal:
 * Pele escapes them in SVG text and they are not grammar delimiters here.
 */
export function escapeGraphNodeLabel(value: string): string {
  return value
    .replace(CONTROL, " ")
    .replace(WHITESPACE, " ")
    .trim()
    .slice(0, MAX_GRAPH_LABEL_CHARS)
    .replace(/\\/g, "/")
    .replace(/%/g, "％")
    .replace(/"/g, "&quot;")
    .replace(/</g, "＜")
    .replace(/>/g, "＞")
    .replace(/\[/g, "［")
    .replace(/\]/g, "］")
    .replace(/\{/g, "｛")
    .replace(/\}/g, "｝")
    .replace(/\(/g, "（")
    .replace(/\)/g, "）")
    .replace(/\|/g, "｜")
    .replace(/`/g, "'");
}

/**
 * Edge labels are unquoted Mermaid text. That grammar treats quotes, brackets,
 * braces, pipes, and angle brackets as structure, so rewrite each to an inert
 * character instead of trying to quote it.
 */
export function escapeGraphEdgeLabel(value: string): string {
  return value
    .replace(CONTROL, " ")
    .replace(/[`"']/g, "'")
    .replace(/[[\]{}()]/g, " ")
    .replace(/\|/g, "/")
    .replace(/</g, "‹")
    .replace(/>/g, "›")
    .replace(/\\/g, "/")
    .replace(/%/g, "％")
    .replace(WHITESPACE, " ")
    .trim()
    .slice(0, MAX_GRAPH_LABEL_CHARS);
}

/** Strict schema plus the reference checks the graph schema alone cannot express. */
export function validateReportGraph(raw: unknown): ReportGraph {
  const parsed = graphSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") || "graph";
    throw new GraphRenderError("invalid_graph", `Invalid report graph at ${path}: ${issue?.message ?? "invalid"}`);
  }
  const graph = parsed.data;
  const nodeIds = new Set<string>();
  graph.nodes.forEach((node, index) => {
    if (nodeIds.has(node.id)) {
      throw new GraphRenderError("invalid_graph", `Duplicate graph node id at nodes.${index}`);
    }
    nodeIds.add(node.id);
  });
  graph.edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.from)) {
      throw new GraphRenderError("invalid_graph", `Edge ${index} source does not reference a node`);
    }
    if (!nodeIds.has(edge.to)) {
      throw new GraphRenderError("invalid_graph", `Edge ${index} target does not reference a node`);
    }
  });
  graph.decisions?.forEach((decision, index) => {
    if (decision.nodeId !== undefined && !nodeIds.has(decision.nodeId)) {
      throw new GraphRenderError("invalid_graph", `Decision ${index} nodeId does not reference a node`);
    }
  });
  return graph;
}

/**
 * Converts a validated graph into server-generated Mermaid. No report id is
 * ever written into the diagram syntax: ids map to `n0..nN` by array position.
 */
export function graphToMermaid(graph: ReportGraph): string {
  const internal = new Map<string, string>();
  graph.nodes.forEach((node, index) => internal.set(node.id, `n${index}`));
  const lines = ["flowchart LR"];
  graph.nodes.forEach((node, index) => {
    lines.push(`  n${index}["${escapeGraphNodeLabel(node.label)}"]`);
  });
  for (const edge of graph.edges) {
    const from = internal.get(edge.from);
    const to = internal.get(edge.to);
    // validateReportGraph has already rejected this; never emit a partial edge.
    if (!from || !to) continue;
    const label = edge.label ? escapeGraphEdgeLabel(edge.label) : "";
    lines.push(label ? `  ${from} -->|${label}| ${to}` : `  ${from} --> ${to}`);
  }
  const source = lines.join("\n");
  if (source.length > MAX_GRAPH_MERMAID_CHARS) {
    throw new GraphRenderError(
      "output_too_large",
      `Generated graph source exceeds ${MAX_GRAPH_MERMAID_CHARS} characters`,
    );
  }
  return source;
}

const FORBIDDEN_SVG =
  /<\s*(?:script|foreignObject|iframe|object|embed|image|a|style|link|meta|base|form|input|button|video|audio|source|use|animate|animateMotion|animateTransform|set)\b|<!doctype|<!entity|<\?xml-stylesheet|<[^>]*\son[a-z]+\s*=|(?:<[^>]*\s(?:href|src|xlink:href)\s*=)|(?:<[^>]*url\s*\()|(?:<[^>]*(?:javascript|vbscript|data:text\/html)\s*:)/i;

/**
 * Rejects SVG that could fetch, script, or navigate. Pele output for the
 * flowchart grammar is limited to inert shapes and text; anything else means
 * the layout library changed or the input escaped, and fails closed.
 */
export function assertSafeGraphSvg(svg: string): string {
  if (typeof svg !== "string" || svg.trim().length === 0) {
    throw new GraphRenderError("layout_failed", "Graph layout returned an empty SVG");
  }
  if (svg.length > MAX_GRAPH_SVG_CHARS) {
    throw new GraphRenderError("output_too_large", `Graph SVG exceeds ${MAX_GRAPH_SVG_CHARS} characters`);
  }
  if (!/^\s*<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
    throw new GraphRenderError("layout_failed", "Graph layout did not return a complete SVG document");
  }
  if (FORBIDDEN_SVG.test(svg)) {
    throw new GraphRenderError("layout_failed", "Graph SVG contains a disallowed element or attribute");
  }
  return svg;
}

/** Pele's own defaults, remapped onto the renderer's document theme tokens. */
const GRAPH_PAGE_CSS = [
  "html,body{margin:0;padding:0;background:var(--background);color:var(--foreground);font-family:var(--font-sans)}",
  "body{display:flex;justify-content:center;align-items:flex-start;padding:16px;box-sizing:border-box}",
  "svg{--pele-bg:var(--background);--pele-fg:var(--foreground);--pele-muted:var(--muted-foreground);--pele-line:var(--foreground);--pele-surface:var(--card);--pele-surface-alt:var(--muted);--pele-border:var(--border);--pele-accent:var(--accent);--pele-font:var(--font-sans);--pele-font-mono:var(--font-mono);--pele-radius:var(--radius);max-width:100%;height:auto}",
].join("");

/** Deterministic inert wrapper. The SVG is validated before this call. */
export function buildGraphHtml(svg: string): string {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${GRAPH_PAGE_CSS}</style></head><body>${assertSafeGraphSvg(svg)}</body></html>`;
  if (html.length > MAX_HTML_CHARS) {
    throw new GraphRenderError("output_too_large", `Graph page exceeds ${MAX_HTML_CHARS} characters`);
  }
  return html;
}

function normalizeWidth(width: number | undefined): number {
  if (width === undefined) return PREVIEW_DEFAULT_WIDTH;
  if (!Number.isInteger(width) || width < PREVIEW_MIN_WIDTH || width > PREVIEW_MAX_WIDTH) {
    throw new GraphRenderError(
      "invalid_graph",
      `Graph width must be an integer from ${PREVIEW_MIN_WIDTH} to ${PREVIEW_MAX_WIDTH}`,
    );
  }
  return width;
}

function normalizeAppearances(appearances: readonly Appearance[] | undefined): Appearance[] {
  if (appearances === undefined) return ["light", "dark"];
  if (appearances.length === 0) {
    throw new GraphRenderError("invalid_graph", "At least one graph appearance is required");
  }
  const unique = new Set<Appearance>();
  for (const appearance of appearances) {
    if (appearance !== "light" && appearance !== "dark") {
      throw new GraphRenderError("invalid_graph", "Graph appearance must be light or dark");
    }
    unique.add(appearance);
  }
  return [...unique];
}

function layoutSvg(mermaid: string): string {
  let result: { svg: string };
  try {
    result = renderMermaid(mermaid, {
      links: false,
      images: false,
      responsive: false,
      maxEdges: MAX_GRAPH_EDGES,
      limit: MAX_GRAPH_MERMAID_CHARS,
      outputLimit: GRAPH_PELE_OUTPUT_LIMIT,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new GraphRenderError("layout_failed", `Graph layout failed: ${message}`, { cause: error });
  }
  return assertSafeGraphSvg(result.svg);
}

/**
 * Validates, lays out, and rasterizes one report graph as light/dark PNGs with
 * metadata ready for the artifact store. Every failure is a `GraphRenderError`
 * so a caller can keep the report's native node/edge list and publish anyway.
 */
export async function renderReportGraph(
  rawGraph: unknown,
  rasterizer: GraphRasterizer,
  options: RenderReportGraphOptions = {},
): Promise<ReportGraphRenderResult> {
  options.signal?.throwIfAborted();
  const graph = validateReportGraph(rawGraph);
  const width = normalizeWidth(options.width);
  const appearances = normalizeAppearances(options.appearances);
  const mermaid = graphToMermaid(graph);
  const svg = layoutSvg(mermaid);
  const html = buildGraphHtml(svg);

  const images = await Promise.all(
    appearances.map(async (appearance): Promise<RenderedGraphImage> => {
      const input: RenderInput = { html, width, appearance, signal: options.signal };
      let output: RenderOutput;
      try {
        output = await rasterizer.render(input);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new GraphRenderError("render_failed", `Graph rasterization failed: ${message}`, {
          cause: error,
        });
      }
      if (output.png.byteLength === 0) {
        throw new GraphRenderError("render_failed", "Graph rasterization returned an empty PNG");
      }
      if (output.png.byteLength > MAX_PREVIEW_PNG_BYTES) {
        throw new GraphRenderError(
          "output_too_large",
          `Graph PNG is ${output.png.byteLength} bytes; the limit is ${MAX_PREVIEW_PNG_BYTES}`,
        );
      }
      if (
        !Number.isInteger(output.width) ||
        output.width < PREVIEW_MIN_WIDTH ||
        output.width > PREVIEW_MAX_WIDTH ||
        !Number.isInteger(output.capturedHeight) ||
        output.capturedHeight < 1 ||
        output.capturedHeight > MAX_CAPTURED_HEIGHT
      ) {
        throw new GraphRenderError("render_failed", "Graph rasterization returned invalid dimensions");
      }
      return { ...output, appearance };
    }),
  );

  const result: ReportGraphRenderResult = {
    graph,
    graphId: graphIdOf(graph),
    mermaid,
    metadata: {
      id: graphIdOf(graph),
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      decisionCount: graph.decisions?.length ?? 0,
      previewLight: false,
      previewDark: false,
    },
  };
  for (const image of images) {
    if (image.appearance === "light") {
      result.light = image;
      result.metadata.previewLight = true;
    } else {
      result.dark = image;
      result.metadata.previewDark = true;
    }
  }
  return result;
}

/** Convenience binding for callers that render more than one graph. */
export function createGraphRenderer(rasterizer: GraphRasterizer): ReportGraphRenderer {
  return {
    renderGraph(graph, options) {
      return renderReportGraph(graph, rasterizer, options);
    },
  };
}
