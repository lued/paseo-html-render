/**
 * Shared bounds for the HTML Render plugin.
 *
 * Values mirror the observed T3 0.1.1-nightly.20261019.3373 tool contract where
 * that contract is meaningful for a static renderer: 512,000 character HTML
 * documents, previews 240-1600 CSS pixels wide, report frames 80-2000 pixels
 * tall. `MAX_CAPTURED_HEIGHT` is ours: the static screenshot is bounded even
 * when a supplied `height` is at the contract maximum.
 */

export const MAX_HTML_CHARS = 512_000;
export const PREVIEW_MIN_WIDTH = 240;
export const PREVIEW_MAX_WIDTH = 1600;
export const PREVIEW_DEFAULT_WIDTH = 728;
export const RENDER_MIN_HEIGHT = 80;
export const RENDER_MAX_HEIGHT = 2_000;
export const MAX_CAPTURED_HEIGHT = 4_000;
export const MAX_TITLE_CHARS = 200;
export const MAX_SUMMARY_CHARS = 280;
export const MAX_PREVIEW_PNG_BYTES = 3 * 1_048_576;
export const MAX_ORIGINAL_HTML_BYTES = 512_000;
/** 3 MiB PNG -> 4 MiB base64 plus JSON overhead; requests remain schema-bounded. */
export const BRIDGE_MAX_MESSAGE_BYTES = 8 * 1_048_576;
export const RENDER_TIMEOUT_MS = 15_000;
export const MAX_CONCURRENT_RENDERS = 2;

// ---------------------------------------------------------------------------
// Report model (package A). Every limit here is enforced by the Zod schemas in
// shared/report-model.ts; downstream packages must treat them as the contract.
// ---------------------------------------------------------------------------

/** Hard cap for the serialized UTF-8 JSON of one ReportModelV1. */
export const MAX_REPORT_BYTES = 256 * 1_024;
export const MAX_REPORT_BLOCKS = 60;
export const MAX_REPORT_SUMMARY_CHARS = 2_000;
export const MAX_REPORT_HEADLINE_CHARS = 200;
export const MAX_REPORT_OUTCOME_DETAIL_CHARS = 2_000;
export const MAX_REPORT_HEADING_CHARS = 200;
export const MAX_REPORT_TEXT_CHARS = 8_000;
export const MAX_REPORT_LIST_ITEMS = 20;
export const MAX_REPORT_LIST_ITEM_CHARS = 500;
export const MAX_REPORT_CALLOUT_TITLE_CHARS = 200;
export const MAX_REPORT_CALLOUT_TEXT_CHARS = 2_000;
export const MAX_REPORT_CODE_CHARS = 20_000;
export const MAX_REPORT_CODE_LANGUAGE_CHARS = 40;
export const MAX_REPORT_TABLE_COLUMNS = 10;
export const MAX_REPORT_TABLE_ROWS = 100;
export const MAX_REPORT_TABLE_COLUMN_CHARS = 120;
export const MAX_REPORT_TABLE_CELL_CHARS = 500;
export const MAX_METRICS = 12;
export const MAX_METRIC_LABEL_CHARS = 80;
export const MAX_METRIC_VALUE_CHARS = 120;
export const MAX_METRIC_DETAIL_CHARS = 300;
export const MAX_AGENT_ROWS = 25;
export const MAX_AGENT_NAME_CHARS = 120;
export const MAX_AGENT_ROLE_CHARS = 120;
export const MAX_AGENT_MODEL_CHARS = 160;
export const MAX_AGENT_DETAIL_CHARS = 500;
export const MAX_GRAPH_NODES = 200;
export const MAX_GRAPH_EDGES = 400;
export const MAX_GRAPH_DECISIONS = 100;
export const MAX_GRAPH_ID_CHARS = 64;
export const MAX_GRAPH_LABEL_CHARS = 200;
export const MAX_GRAPH_KIND_CHARS = 40;
export const MAX_GRAPH_DETAIL_CHARS = 1_000;
export const MAX_EVIDENCE_ITEMS = 25;
export const MAX_EVIDENCE_LABEL_CHARS = 200;
export const MAX_EVIDENCE_URL_CHARS = 2_000;
export const MAX_EVIDENCE_PATH_CHARS = 500;
export const MAX_EVIDENCE_DETAIL_CHARS = 1_000;
export const MAX_NEXT_ACTION_CHARS = 500;
export const MAX_PROMPT_IMPROVED_CHARS = 4_000;
export const MAX_PROMPT_LESSON_CHARS = 2_000;
export const MAX_USAGE_MODELS = 20;
export const MAX_USAGE_MODEL_NAME_CHARS = 160;
export const MAX_USAGE_MODEL_PROVIDER_CHARS = 120;

/** Widths requested from the renderer's `measure` contract. */
export const MAX_MEASURE_WIDTHS = 24;
/** Heights stored in a marker or manifest. Sorted ascending by width. */
export const MAX_MARKER_HEIGHTS = 24;
/** Marker decode budget; never raised without a compatibility review. */
export const MAX_MARKER_CHARS = 8_192;

/** interactive.html is delivered through Paseo's file preview, not an RPC. */
export const MAX_INTERACTIVE_HTML_BYTES = 8 * 1_048_576;
/** Same bound expressed in UTF-16 code units for schema-level validation. */
export const MAX_INTERACTIVE_HTML_CHARS = MAX_INTERACTIVE_HTML_BYTES;
/** Binary budget for one PNG asset served over RPC. */
export const MAX_ASSET_PNG_BYTES = 3 * 1_048_576;
/** Base64 output cap derived from the binary budget (plus padding slack). */
export const MAX_ASSET_BASE64_CHARS = Math.ceil((MAX_ASSET_PNG_BYTES * 4) / 3) + 8;
export const MAX_PATH_CHARS = 4_096;
