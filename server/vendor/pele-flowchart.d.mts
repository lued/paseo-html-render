/**
 * Types for the generated pele-flowchart.mjs. Written by hand so the package
 * does not need pele's declarations. Only the options server/graph.ts passes.
 */
export interface FlowchartRenderOptions {
  links?: boolean;
  images?: boolean;
  responsive?: boolean;
  maxEdges?: number;
  limit?: number;
  outputLimit?: number;
}

export interface FlowchartRenderResult {
  svg: string;
  width: number;
  height: number;
}

export function render(source: string, options?: FlowchartRenderOptions): FlowchartRenderResult;
