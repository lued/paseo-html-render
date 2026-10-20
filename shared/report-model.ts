/**
 * ReportModelV1: the bounded, strictly validated JSON contract for native
 * report rendering.
 *
 * This module is deliberately pure: no Node built-ins, no DOM, no executable
 * content. Every string, array, reference, URL and path is bounded here, and
 * the whole serialized document is capped at `MAX_REPORT_BYTES`. Native clients
 * render the model as text/views only; they must never interpret any field as
 * HTML, a script, a style, or a URL scheme the schema does not allow.
 *
 * A report is additive to `html_render`. Legacy reports without one keep the
 * static PNG card and manifest version 1.
 */
import { z } from "zod";
import {
  MAX_AGENT_DETAIL_CHARS,
  MAX_AGENT_MODEL_CHARS,
  MAX_AGENT_NAME_CHARS,
  MAX_AGENT_ROLE_CHARS,
  MAX_AGENT_ROWS,
  MAX_EVIDENCE_DETAIL_CHARS,
  MAX_EVIDENCE_ITEMS,
  MAX_EVIDENCE_LABEL_CHARS,
  MAX_EVIDENCE_PATH_CHARS,
  MAX_EVIDENCE_URL_CHARS,
  MAX_GRAPH_DECISIONS,
  MAX_GRAPH_DETAIL_CHARS,
  MAX_GRAPH_EDGES,
  MAX_GRAPH_ID_CHARS,
  MAX_GRAPH_KIND_CHARS,
  MAX_GRAPH_LABEL_CHARS,
  MAX_GRAPH_NODES,
  MAX_METRIC_DETAIL_CHARS,
  MAX_METRIC_LABEL_CHARS,
  MAX_METRIC_VALUE_CHARS,
  MAX_METRICS,
  MAX_NEXT_ACTION_CHARS,
  MAX_PROMPT_IMPROVED_CHARS,
  MAX_PROMPT_LESSON_CHARS,
  MAX_REPORT_BLOCKS,
  MAX_REPORT_BYTES,
  MAX_REPORT_CALLOUT_TEXT_CHARS,
  MAX_REPORT_CALLOUT_TITLE_CHARS,
  MAX_REPORT_CODE_CHARS,
  MAX_REPORT_CODE_LANGUAGE_CHARS,
  MAX_REPORT_HEADING_CHARS,
  MAX_REPORT_HEADLINE_CHARS,
  MAX_REPORT_LIST_ITEM_CHARS,
  MAX_REPORT_LIST_ITEMS,
  MAX_REPORT_OUTCOME_DETAIL_CHARS,
  MAX_REPORT_SUMMARY_CHARS,
  MAX_REPORT_TABLE_CELL_CHARS,
  MAX_REPORT_TABLE_COLUMN_CHARS,
  MAX_REPORT_TABLE_COLUMNS,
  MAX_REPORT_TABLE_ROWS,
  MAX_REPORT_TEXT_CHARS,
  MAX_USAGE_MODEL_NAME_CHARS,
  MAX_USAGE_MODEL_PROVIDER_CHARS,
  MAX_USAGE_MODELS,
} from "./limits.ts";

/** Version literal is part of the wire contract; never accept another version. */
export const REPORT_MODEL_VERSION = 1 as const;
/** The implicit graph id used when `graph.id` is absent. */
export const DEFAULT_GRAPH_ID = "main";

const SINGLE_LINE_CONTROL = /[\u0000-\u001F\u007F]/;
const MULTI_LINE_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const GRAPH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ARTIFACT_PATH_SEGMENT = /^[A-Za-z0-9._@+() [\]#-]+$/;

/** UTF-8 byte length without Buffer, so this module stays client-safe. */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/** Rejects control characters; multiline text still allows tab, CR and LF. */
function safeText(max: number, multiline = false) {
  return z
    .string()
    .min(1)
    .max(max)
    .regex(multiline ? /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/ : /^[^\u0000-\u001F\u007F]*$/, "text contains control characters")
    .refine(
      (value) => !(multiline ? MULTI_LINE_CONTROL : SINGLE_LINE_CONTROL).test(value),
      "text contains control characters",
    );
}

const singleLine = (max: number) => safeText(max, false);
const multiLine = (max: number) => safeText(max, true);

/** Absolute http(s) URLs only. No javascript:, data:, file:, mailto:, or credentials. */
export function isSafeHttpUrl(value: string): boolean {
  if (!value || value.length > MAX_EVIDENCE_URL_CHARS || SINGLE_LINE_CONTROL.test(value)) return false;
  // Manual parsing keeps this module free of a WHATWG URL dependency in native
  // clients; only the scheme, authority and remainder are relevant here.
  const match = /^(https?):\/\/([^\s/?#]+)([^\s]*)$/i.exec(value);
  if (!match) return false;
  const authority = match[2] ?? "";
  if (!authority || authority.includes("@") || authority.startsWith(":")) return false;
  if (authority.startsWith(".") || authority.endsWith(".")) return false;
  return true;
}

/** Relative artifact paths only. No absolute paths, traversal, schemes, or backslashes. */
export function isSafeArtifactPath(value: string): boolean {
  if (!value || value.length > MAX_EVIDENCE_PATH_CHARS || SINGLE_LINE_CONTROL.test(value)) return false;
  if (value.startsWith("/") || value.includes("\\") || value.includes("://")) return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  return value
    .split("/")
    .every(
      (segment) =>
        segment !== "." && segment !== ".." && ARTIFACT_PATH_SEGMENT.test(segment),
    );
}

export const reportToneSchema = z.enum(["neutral", "good", "warn", "bad"]);
export type ReportTone = z.output<typeof reportToneSchema>;

export const reportStatusSchema = z.enum(["success", "partial", "blocked", "failed"]);
export type ReportStatus = z.output<typeof reportStatusSchema>;

export const outcomeSchema = z
  .strictObject({
    status: reportStatusSchema,
    headline: singleLine(MAX_REPORT_HEADLINE_CHARS),
    detail: multiLine(MAX_REPORT_OUTCOME_DETAIL_CHARS).optional(),
  })
  .describe("Overall outcome shown first in the native card");
export type ReportOutcome = z.output<typeof outcomeSchema>;

export const metricSchema = z
  .strictObject({
    label: singleLine(MAX_METRIC_LABEL_CHARS),
    value: singleLine(MAX_METRIC_VALUE_CHARS),
    detail: multiLine(MAX_METRIC_DETAIL_CHARS).optional(),
    tone: reportToneSchema.optional(),
  })
  .describe("One bounded metric; `value` is display text, never executable data");
export type ReportMetric = z.output<typeof metricSchema>;

export const agentStatusSchema = z.enum(["ok", "running", "blocked", "failed"]);
export type AgentStatus = z.output<typeof agentStatusSchema>;

export const agentRowSchema = z
  .strictObject({
    name: singleLine(MAX_AGENT_NAME_CHARS),
    role: singleLine(MAX_AGENT_ROLE_CHARS).optional(),
    model: singleLine(MAX_AGENT_MODEL_CHARS).optional(),
    status: agentStatusSchema.optional(),
    summary: multiLine(MAX_AGENT_DETAIL_CHARS).optional(),
  })
  .describe("One orchestrated agent row");
export type AgentRow = z.output<typeof agentRowSchema>;

export const graphIdSchema = z
  .string()
  .min(1)
  .max(MAX_GRAPH_ID_CHARS)
  .regex(GRAPH_ID_PATTERN, "graph id must be a safe identifier");
export type GraphId = z.output<typeof graphIdSchema>;

export const graphNodeSchema = z
  .strictObject({
    id: graphIdSchema,
    label: singleLine(MAX_GRAPH_LABEL_CHARS),
    kind: singleLine(MAX_GRAPH_KIND_CHARS).optional(),
    tone: reportToneSchema.optional(),
    detail: multiLine(MAX_GRAPH_DETAIL_CHARS).optional(),
  })
  .describe("A node in the report graph; `id` is unique within the graph");
export type GraphNode = z.output<typeof graphNodeSchema>;

export const graphEdgeSchema = z
  .strictObject({
    from: graphIdSchema,
    to: graphIdSchema,
    label: singleLine(MAX_GRAPH_LABEL_CHARS).optional(),
    tone: reportToneSchema.optional(),
  })
  .describe("A directed edge; both endpoints must resolve to graph nodes");
export type GraphEdge = z.output<typeof graphEdgeSchema>;

export const decisionNodeSchema = z
  .strictObject({
    id: graphIdSchema,
    label: singleLine(MAX_GRAPH_LABEL_CHARS),
    nodeId: graphIdSchema.optional(),
    choice: singleLine(MAX_GRAPH_LABEL_CHARS).optional(),
    detail: multiLine(MAX_GRAPH_DETAIL_CHARS).optional(),
  })
  .describe("A recorded decision; optional nodeId must resolve to a graph node");
export type DecisionNode = z.output<typeof decisionNodeSchema>;

export const graphSchema = z
  .strictObject({
    id: graphIdSchema.optional(),
    nodes: z.array(graphNodeSchema).min(1).max(MAX_GRAPH_NODES),
    edges: z.array(graphEdgeSchema).max(MAX_GRAPH_EDGES),
    decisions: z.array(decisionNodeSchema).max(MAX_GRAPH_DECISIONS).optional(),
  })
  .describe("Bounded run graph. Server-generated previews are optional; this list is authoritative");
export type ReportGraph = z.output<typeof graphSchema>;

export const evidenceRowSchema = z
  .strictObject({
    label: singleLine(MAX_EVIDENCE_LABEL_CHARS),
    url: z.string().max(MAX_EVIDENCE_URL_CHARS).regex(/^https?:\/\/[^\s@/]+(?:[^\s]*)$/i, "evidence url must be absolute http(s)").refine(isSafeHttpUrl, "evidence url must be absolute http(s)").optional(),
    artifactPath: z
      .string()
      .max(MAX_EVIDENCE_PATH_CHARS)
      .refine(isSafeArtifactPath, "artifact path must be workspace-relative without traversal")
      .optional(),
    detail: multiLine(MAX_EVIDENCE_DETAIL_CHARS).optional(),
  })
  .describe("One evidence reference. URLs are http(s) only; paths are relative and inert");
export type EvidenceRow = z.output<typeof evidenceRowSchema>;

const listItemSchema = singleLine(MAX_REPORT_LIST_ITEM_CHARS);

export const headingBlockSchema = z.strictObject({
  kind: z.literal("heading"),
  text: singleLine(MAX_REPORT_HEADING_CHARS),
});

export const textBlockSchema = z.strictObject({
  kind: z.literal("text"),
  text: multiLine(MAX_REPORT_TEXT_CHARS),
});

export const bulletsBlockSchema = z.strictObject({
  kind: z.literal("bullets"),
  items: z.array(listItemSchema).min(1).max(MAX_REPORT_LIST_ITEMS),
});

export const stepsBlockSchema = z.strictObject({
  kind: z.literal("steps"),
  items: z.array(listItemSchema).min(1).max(MAX_REPORT_LIST_ITEMS),
});

export const calloutBlockSchema = z.strictObject({
  kind: z.literal("callout"),
  tone: z.enum(["info", "warn", "good", "bad"]).optional(),
  title: singleLine(MAX_REPORT_CALLOUT_TITLE_CHARS).optional(),
  text: multiLine(MAX_REPORT_CALLOUT_TEXT_CHARS),
});

export const codeBlockSchema = z.strictObject({
  kind: z.literal("code"),
  language: singleLine(MAX_REPORT_CODE_LANGUAGE_CHARS).optional(),
  text: multiLine(MAX_REPORT_CODE_CHARS),
});

export const tableBlockSchema = z
  .strictObject({
    kind: z.literal("table"),
    columns: z.array(singleLine(MAX_REPORT_TABLE_COLUMN_CHARS)).min(1).max(MAX_REPORT_TABLE_COLUMNS),
    rows: z
      .array(z.array(singleLine(MAX_REPORT_TABLE_CELL_CHARS)).min(1).max(MAX_REPORT_TABLE_COLUMNS))
      .max(MAX_REPORT_TABLE_ROWS),
  })
  .superRefine((table, context) => {
    table.rows.forEach((row, index) => {
      if (row.length !== table.columns.length) {
        context.addIssue({
          code: "custom",
          path: ["rows", index],
          message: `row ${index} must have exactly ${table.columns.length} cells`,
        });
      }
    });
  });

export const agentsBlockSchema = z.strictObject({
  kind: z.literal("agents"),
  agents: z.array(agentRowSchema).min(1).max(MAX_AGENT_ROWS),
});

export const graphBlockSchema = z.strictObject({
  kind: z.literal("graph"),
  graphId: graphIdSchema,
});

export const evidenceBlockSchema = z.strictObject({
  kind: z.literal("evidence"),
  items: z.array(evidenceRowSchema).min(1).max(MAX_EVIDENCE_ITEMS),
});

export const reportBlockSchema = z
  .discriminatedUnion("kind", [
    headingBlockSchema,
    textBlockSchema,
    bulletsBlockSchema,
    stepsBlockSchema,
    calloutBlockSchema,
    codeBlockSchema,
    tableBlockSchema,
    agentsBlockSchema,
    graphBlockSchema,
    evidenceBlockSchema,
  ])
  .describe("One inert native report block");
export type ReportBlock = z.output<typeof reportBlockSchema>;
export type ReportBlockKind = ReportBlock["kind"];

/**
 * Usage quantities always carry provenance. `unavailable` deliberately has no
 * numeric value, so a renderer cannot accidentally show a fabricated zero.
 */
export const usageProvenanceSchema = z.enum(["measured", "estimated", "unavailable"]);
export type UsageProvenance = z.output<typeof usageProvenanceSchema>;

const usageNumber = z.number().finite().min(0).max(1_000_000_000_000);

export const usageQuantitySchema = z
  .discriminatedUnion("provenance", [
    z.strictObject({ provenance: z.literal("measured"), value: usageNumber }),
    z.strictObject({ provenance: z.literal("estimated"), value: usageNumber }),
    z.strictObject({ provenance: z.literal("unavailable") }),
  ])
  .describe("A measured value, a labelled estimate, or an explicit unavailable value");
export type UsageQuantity = z.output<typeof usageQuantitySchema>;

export const usageModelSchema = z.strictObject({
  name: singleLine(MAX_USAGE_MODEL_NAME_CHARS),
  provider: singleLine(MAX_USAGE_MODEL_PROVIDER_CHARS).optional(),
  totalTokens: usageQuantitySchema.optional(),
});
export type UsageModel = z.output<typeof usageModelSchema>;

const usageSummaryShape = {
  inputTokens: usageQuantitySchema.optional(),
  outputTokens: usageQuantitySchema.optional(),
  cachedInputTokens: usageQuantitySchema.optional(),
  totalTokens: usageQuantitySchema.optional(),
  costUsd: usageQuantitySchema.optional(),
  durationMs: usageQuantitySchema.optional(),
  models: z.array(usageModelSchema).min(1).max(MAX_USAGE_MODELS).optional(),
};

export const usageSummarySchema = z
  .strictObject(usageSummaryShape)
  .superRefine((usage, context) => {
    if (Object.keys(usage).length === 0) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "usage must report at least one quantity or model",
      });
    }
  })
  .describe("Accounting with explicit provenance; never invented values");
export type UsageSummary = z.output<typeof usageSummarySchema>;

export const promptLessonSchema = z.strictObject({
  improvedPrompt: multiLine(MAX_PROMPT_IMPROVED_CHARS),
  lesson: multiLine(MAX_PROMPT_LESSON_CHARS),
});
export type PromptLesson = z.output<typeof promptLessonSchema>;

const reportShape = {
  version: z.literal(REPORT_MODEL_VERSION),
  outcome: outcomeSchema,
  summary: multiLine(MAX_REPORT_SUMMARY_CHARS).optional(),
  metrics: z.array(metricSchema).max(MAX_METRICS).optional(),
  blocks: z.array(reportBlockSchema).min(1).max(MAX_REPORT_BLOCKS),
  graph: graphSchema.optional(),
  evidence: z.array(evidenceRowSchema).min(1).max(MAX_EVIDENCE_ITEMS).optional(),
  nextAction: singleLine(MAX_NEXT_ACTION_CHARS).optional(),
  promptLesson: promptLessonSchema.optional(),
  usage: usageSummarySchema.optional(),
};

/** Resolves the effective graph id, including the implicit `main` graph. */
export function graphIdOf(graph: Pick<ReportGraph, "id"> | undefined): string {
  return graph?.id ?? DEFAULT_GRAPH_ID;
}

function validateReferences(report: z.output<z.ZodObject<typeof reportShape>>, context: z.RefinementCtx): void {
  const graph = report.graph;
  const effectiveGraphId = graphIdOf(graph);
  report.blocks.forEach((block, index) => {
    if (block.kind !== "graph") return;
    if (!graph) {
      context.addIssue({
        code: "custom",
        path: ["blocks", index, "graphId"],
        message: "a graph block requires report.graph",
      });
      return;
    }
    if (block.graphId !== effectiveGraphId) {
      context.addIssue({
        code: "custom",
        path: ["blocks", index, "graphId"],
        message: `graphId must reference the report graph "${effectiveGraphId}"`,
      });
    }
  });

  const serializedBytes = utf8ByteLength(JSON.stringify(report));
  if (serializedBytes > MAX_REPORT_BYTES) {
    context.addIssue({
      code: "custom",
      path: [],
      message: `serialized report is ${serializedBytes} bytes; the limit is ${MAX_REPORT_BYTES}`,
    });
  }

  if (!graph) return;
  const nodeIds = new Set<string>();
  graph.nodes.forEach((node, index) => {
    if (nodeIds.has(node.id)) {
      context.addIssue({
        code: "custom",
        path: ["graph", "nodes", index, "id"],
        message: `duplicate graph node id "${node.id}"`,
      });
    }
    nodeIds.add(node.id);
  });
  graph.edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.from)) {
      context.addIssue({
        code: "custom",
        path: ["graph", "edges", index, "from"],
        message: `edge source "${edge.from}" is not a graph node`,
      });
    }
    if (!nodeIds.has(edge.to)) {
      context.addIssue({
        code: "custom",
        path: ["graph", "edges", index, "to"],
        message: `edge target "${edge.to}" is not a graph node`,
      });
    }
  });
  graph.decisions?.forEach((decision, index) => {
    if (decision.nodeId !== undefined && !nodeIds.has(decision.nodeId)) {
      context.addIssue({
        code: "custom",
        path: ["graph", "decisions", index, "nodeId"],
        message: `decision nodeId "${decision.nodeId}" is not a graph node`,
      });
    }
  });

}

/**
 * Strict ReportModelV1. Unknown keys are rejected rather than ignored so a
 * client can never smuggle extra payload through a report.
 */
export const reportModelSchema = z
  .strictObject(reportShape)
  .superRefine(validateReferences)
  .describe("Bounded native report model v1");
export type ReportModelV1 = z.output<typeof reportModelSchema>;
/** Named alias for downstream imports that mirror the type name. */
export const ReportModelV1Schema = reportModelSchema;

export function parseReportModel(raw: unknown): ReportModelV1 {
  return reportModelSchema.parse(raw);
}

export function safeParseReportModel(raw: unknown): z.ZodSafeParseResult<ReportModelV1> {
  return reportModelSchema.safeParse(raw);
}

/** Parses, strips nothing (strict), and returns the canonical JSON string. */
export function serializeReportModel(report: ReportModelV1): string {
  const parsed = reportModelSchema.parse(report);
  return JSON.stringify(parsed);
}

export function serializedReportBytes(report: ReportModelV1): number {
  return utf8ByteLength(JSON.stringify(report));
}
