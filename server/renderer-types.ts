import type { AbortSignal } from "./cancellation.ts";
/**
 * Frozen renderer contracts for package A.
 *
 * `server/renderer.ts` keeps its existing `Renderer` interface and behavior;
 * this module states the additive contracts downstream packages code against:
 *
 * - `measure({ html, widths })` returns sorted `[width, height]` tuples without
 *   changing static capture semantics. It is optional here so the current
 *   renderer keeps typechecking before package D implements it.
 * - graph rendering consumes bounded SVG markup and returns a PNG.
 * - report and graph pages are rendered with script execution disabled, network
 *   blocked, and `file://` blocked. No type in this file relaxes that.
 *
 * `Renderer` below is structurally compatible with `server/renderer.ts`.
 */
import {
  MAX_CAPTURED_HEIGHT,
  MAX_GRAPH_ID_CHARS,
  MAX_HTML_CHARS,
  MAX_MEASURE_WIDTHS,
  PREVIEW_MAX_WIDTH,
  PREVIEW_MIN_WIDTH,
} from "../shared/limits.ts";
import type { MeasuredHeight } from "../shared/protocol.ts";
import type {
  Appearance,
  RenderInput,
  RenderOutput,
  Renderer as BaseRenderer,
  RendererOptions,
} from "./renderer.ts";

export type { Appearance, RenderInput, RenderOutput, RendererOptions };

/** Static capture behavior is unchanged; measurement is additive. */
export type Renderer = BaseRenderer & {
  measure?(input: MeasureInput): Promise<MeasuredHeights>;
};

export interface MeasureInput {
  html: string;
  /** 1..24 widths, each 240..1600. Duplicates are removed and order normalized. */
  widths: readonly number[];
  /** Internal tool-request cancellation. Not exposed as MCP input. */
  signal?: AbortSignal;
}

/** `[width, height]` pairs, sorted ascending by width, one per requested width. */
export type MeasuredHeights = MeasuredHeight[];

export interface MeasuringRenderer extends BaseRenderer {
  measure(input: MeasureInput): Promise<MeasuredHeights>;
}

/** True when a renderer can report multi-width measurements. */
export function supportsMeasure(renderer: BaseRenderer | null | undefined): renderer is MeasuringRenderer {
  return typeof (renderer as Partial<MeasuringRenderer> | null | undefined)?.measure === "function";
}

/** Sensible measurement widths: phone, default card, and wide card. */
/** T3's measurement widths, in ascending order. */
export const DEFAULT_MEASURE_WIDTHS: readonly number[] = [320, 375, 430, 520, 640, 728, 860, 1_000, 1_144];

/**
 * Validates, deduplicates, and sorts requested widths ascending. Throws on an
 * empty list, too many entries, or a width outside the preview contract.
 */
export function normalizeMeasureWidths(widths: readonly number[]): number[] {
  if (widths.length === 0) throw new RangeError("widths must contain at least one width");
  if (widths.length > MAX_MEASURE_WIDTHS) {
    throw new RangeError(`widths must contain at most ${MAX_MEASURE_WIDTHS} entries`);
  }
  const unique = new Set<number>();
  for (const width of widths) {
    if (!Number.isInteger(width) || width < PREVIEW_MIN_WIDTH || width > PREVIEW_MAX_WIDTH) {
      throw new RangeError(`width must be an integer from ${PREVIEW_MIN_WIDTH} to ${PREVIEW_MAX_WIDTH}`);
    }
    unique.add(width);
  }
  return [...unique].sort((left, right) => left - right);
}

/**
 * Checks a renderer measurement result against the requested widths. Returns a
 * freshly sorted copy; throws instead of silently repairing a mismatched width.
 */
export function assertMeasuredHeights(
  widths: readonly number[],
  measured: readonly (readonly [number, number])[],
): MeasuredHeights {
  const expected = normalizeMeasureWidths(widths);
  const tuples = measured.map((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new TypeError(`measurement ${index} is not a [width, height] tuple`);
    }
    const width = Number(entry[0]);
    const height = Number(entry[1]);
    if (!Number.isInteger(width) || width < PREVIEW_MIN_WIDTH || width > PREVIEW_MAX_WIDTH) {
      throw new RangeError(`measurement ${index} has an invalid width`);
    }
    if (!Number.isInteger(height) || height < 1 || height > MAX_CAPTURED_HEIGHT) {
      throw new RangeError(`measurement ${index} has an invalid height`);
    }
    return [width, height] as [number, number];
  });
  tuples.sort((left, right) => left[0] - right[0]);
  if (tuples.length !== expected.length) {
    throw new RangeError(`expected ${expected.length} measurements, received ${tuples.length}`);
  }
  tuples.forEach((entry, index) => {
    if (entry[0] !== expected[index]) {
      throw new RangeError(`measurement ${index} must report width ${expected[index]}`);
    }
  });
  return tuples;
}

// ---------------------------------------------------------------------------
// Graph rasterization (package D)
// ---------------------------------------------------------------------------

export interface GraphRenderInput {
  /** Server-generated, escaped SVG markup. Never page HTML. */
  svg: string;
  width: number;
  appearance: Appearance;
  /** Stable graph identifier used in metadata; optional for ad-hoc renders. */
  graphId?: string;
}

export interface GraphRenderOutput extends RenderOutput {
  /** The graph id echoed back for metadata bookkeeping. */
  graphId?: string;
}

export interface GraphRenderer {
  renderGraph(input: GraphRenderInput): Promise<GraphRenderOutput>;
  close?(): Promise<void>;
}

export interface RendererCapabilities {
  measure: boolean;
  graphs: boolean;
}

export const GRAPH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
export const MAX_GRAPH_SVG_CHARS = MAX_HTML_CHARS;
export const MAX_GRAPH_WIDTH = PREVIEW_MAX_WIDTH;

/** Validates a graph render input before it reaches Chromium or Pele. */
export function assertGraphRenderInput(input: GraphRenderInput): GraphRenderInput {
  if (typeof input.svg !== "string" || input.svg.trim().length === 0) {
    throw new RangeError("graph svg must be a non-empty string");
  }
  if (input.svg.length > MAX_GRAPH_SVG_CHARS) {
    throw new RangeError(`graph svg exceeds ${MAX_GRAPH_SVG_CHARS} characters`);
  }
  if (!Number.isInteger(input.width) || input.width < PREVIEW_MIN_WIDTH || input.width > MAX_GRAPH_WIDTH) {
    throw new RangeError(`graph width must be an integer from ${PREVIEW_MIN_WIDTH} to ${MAX_GRAPH_WIDTH}`);
  }
  if (input.appearance !== "light" && input.appearance !== "dark") {
    throw new RangeError("graph appearance must be light or dark");
  }
  if (
    input.graphId !== undefined &&
    (input.graphId.length === 0 ||
      input.graphId.length > MAX_GRAPH_ID_CHARS ||
      !GRAPH_ID_PATTERN.test(input.graphId))
  ) {
    throw new RangeError("graphId must be a safe identifier");
  }
  return input;
}

/** Contract marker: report and graph rendering never enables page scripts. */
export const RENDERER_SCRIPT_POLICY = "disabled" as const;
