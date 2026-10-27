import { z } from "zod";
import { BRIDGE_TOKEN_FILE, PRODUCTION_IDENTITY, type PluginIdentity } from "../shared/identity.ts";
import {
  HTML_DESCRIPTION,
  POLICY_INSTRUCTIONS,
  RENDER_DESCRIPTION,
} from "../shared/policy.ts";
import { reportModelSchema } from "../shared/report-model.ts";

const reportJsonSchema = z.toJSONSchema(reportModelSchema, { target: "draft-7", unrepresentable: "any" });
// Cross-field refinements stay daemon-validated; describe what JSON Schema cannot
// express and encode the representable non-empty usage constraint.
const properties = reportJsonSchema.properties as Record<string, any>;
properties.usage.minProperties = 1;
properties.blocks.description = "Table rows must match columns; graph blocks reference report.graph.id (default main).";
properties.graph.description += " Node ids must be unique; edge endpoints and decision nodeId must resolve to nodes.";

/**
 * Standalone MCP stdio adapter. The daemon writes this exact source into its
 * private data directory and contributes it at `agent.session_open` as a stdio
 * MCP server for interactive sessions. The contribution is launch-only: Paseo
 * never persists it into an agent record. The adapter is deliberately
 * dependency-free and does no rendering itself: every tool call is forwarded to
 * the daemon bridge over a unix socket, which owns workspace authority,
 * sandboxed rendering, and the artifact store.
 *
 * Identity (marker, MCP server name, adapter env names, log tag) is injected as
 * explicit placeholders so the production and QA adapters cannot share tokens,
 * sockets or marker namespaces.
 *
 * Keep this template free of backticks and `${` sequences.
 */
export function buildAdapterSource(identity: PluginIdentity): string {
  return String.raw`import { readFileSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";

const MARKER = __PASEO_MARKER__;
const ADAPTER_VERSION = __PASEO_ADAPTER_VERSION__;
const MAX_HTML_CHARS = 512000;
const SUPPORTED_PROTOCOLS = ["2024-11-05", "2025-03-26", "2025-06-18"];
// Matches shared/limits.ts BRIDGE_MAX_MESSAGE_BYTES (8 MiB). The preview image
// alone is base64-encoded here, so the old 4 MiB line budget was too small.
const MAX_LINE_BYTES = 8 * 1024 * 1024;

const BRIDGE_ENV = __PASEO_BRIDGE_ENV__;
const BRIDGE_TOKEN_FILE = __PASEO_TOKEN_FILE__;
const ADAPTER_LOG_TAG = __PASEO_LOG_TAG__;
const bridgePath = process.env[BRIDGE_ENV.bridge] || "";
const bridgeToken = process.env[BRIDGE_ENV.token] || "";
const callerCwd = process.env[BRIDGE_ENV.cwd] || "";
const bridgeTokenFile = bridgePath ? join(dirname(bridgePath), BRIDGE_TOKEN_FILE) : "";

// The private token file is the source of truth so reload/rotation does not
// strand an adapter in a busy session. Launch-only injection never saves this
// credential in agent config; the environment is a fallback for isolated tests.
function currentBridgeToken() {
  if (bridgeTokenFile) {
    try {
      const shared = readFileSync(bridgeTokenFile, "utf8").trim();
      if (shared) return shared;
    } catch {
      // Fall through to the injected token.
    }
  }
  return bridgeToken;
}

const HTML_DESCRIPTION = __PASEO_HTML_DESCRIPTION__;

const REPORT_DESCRIPTION =
  "Optional bounded native report model (ReportModelV1). It is strictly validated JSON, never HTML. " +
  "status success|partial|blocked|failed; headline <=200; summary <=2000; up to 12 metrics and 60 blocks " +
  "(heading, text, bullets, steps, callout, code, table, agents, graph, evidence); graph with up to 200 nodes " +
  "and 400 edges; up to 25 evidence rows with http(s) URLs only; nextAction <=500; promptLesson; usage with " +
  "measured/estimated/unavailable provenance. Total serialized size <=256 KiB. Native clients render text " +
  "and views only; HTML still supplies the portable page.";

const RENDER_DESCRIPTION = __PASEO_RENDER_DESCRIPTION__;

// Generated from the daemon schema to avoid divergent hand-maintained contracts.
const reportSchema = __PASEO_REPORT_SCHEMA__;

const TOOLS = [
  {
    name: "html_preview",
    description:
      "Render an HTML page to a static PNG screenshot and return its content height. " +
      "Use it to check spacing, overflow, and readability before publishing. The page is " +
      "rendered with JavaScript disabled and with network and file access blocked, so do " +
      "not rely on scripts or remote assets; use scoped workspace raster files or data: URIs. " +
      HTML_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        html: { type: "string", minLength: 1, maxLength: MAX_HTML_CHARS, description: HTML_DESCRIPTION },
        width: {
          type: "integer",
          minimum: 240,
          maximum: 1600,
          description: "Viewport width in CSS pixels, 240-1600. Defaults to 728. This is the capture width, not the live card width, which is fluid; use about 390 for phones and 1000-1200 to check the wide layout.",
        },
        appearance: {
          type: "string",
          enum: ["light", "dark"],
          description: "Theme variables to preview. Defaults to dark.",
        },
      },
      required: ["html"],
      additionalProperties: false,
    },
  },
  {
    name: "html_render",
    description: RENDER_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        html: { type: "string", minLength: 1, maxLength: MAX_HTML_CHARS, description: HTML_DESCRIPTION },
        title: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          description: "Short accessible name for the page.",
        },
        height: {
          type: "integer",
          minimum: 80,
          maximum: 2000,
          description: "Report card height in CSS pixels, 80-2000. Use html_preview suggestedHeight (contentHeight capped at 2000).",
        },
        summary: {
          type: "string",
          maxLength: 280,
          description: "Optional one or two sentence summary shown to the reader and to screen readers.",
        },
        renderMode: {
          type: "string",
          enum: ["static", "auto", "iframe"],
          default: "auto",
          description: "auto renders live inline HTML on web/desktop; native uses report views when supplied, otherwise PNG. static disables live HTML on every platform. iframe is an explicit web-only override. Defaults to auto.",
        },
        report: reportSchema,
      },
      required: ["html", "title", "height"],
      additionalProperties: false,
    },
  },
];

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function fail(id, code, message) {
  send({ jsonrpc: "2.0", id: id, error: { code: code, message: message } });
}

function bridge(request) {
  return new Promise(function (resolve, reject) {
    const token = currentBridgeToken();
    if (!bridgePath || !token || !callerCwd) {
      reject(new Error("The HTML Render bridge is not configured for this agent"));
      return;
    }
    const socket = net.createConnection({ path: bridgePath });
    let buffer = "";
    let settled = false;
    const settle = function (error, value) {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    // 90 second ceiling: the daemon bridge budget is 85 seconds, with transport
    // slack for the 8 MiB response line (base64 preview) and measurement/graph work.
    socket.setTimeout(90000, function () {
      settle(new Error("The HTML Render bridge did not answer in time"));
    });
    socket.on("connect", function () {
      socket.write(JSON.stringify({
        token: token,
        tool: request.tool,
        cwd: callerCwd,
        agentId: process.env.PASEO_AGENT_ID || "",
        input: request.input,
        adapterVersion: ADAPTER_VERSION,
      }) + "\n");
    });
    socket.setEncoding("utf8");
    socket.on("data", function (chunk) {
      buffer += chunk;
      if (Buffer.byteLength(buffer, "utf8") > MAX_LINE_BYTES) {
        settle(new Error("The HTML Render bridge response was too large"));
      }
    });
    socket.on("end", function () {
      if (!buffer.trim()) {
        settle(new Error("The HTML Render bridge closed without a response"));
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(buffer);
      } catch {
        settle(new Error("The HTML Render bridge returned an unreadable response"));
        return;
      }
      if (parsed && parsed.ok === true) {
        settle(null, parsed.result);
        return;
      }
      const error = parsed && parsed.error ? parsed.error : {};
      const code = typeof error.code === "string" ? error.code : "render_failed";
      const message = typeof error.message === "string" ? error.message : "HTML rendering failed";
      settle(new Error(code + ": " + message));
    });
    socket.on("error", function () {
      settle(new Error("The HTML Render bridge is unavailable"));
    });
  });
}

function textResult(text, isError) {
  return { content: [{ type: "text", text: text }], isError: isError === true };
}

function missingText(missing) {
  if (!Array.isArray(missing) || missing.length === 0) return "";
  const entries = missing.slice(0, 20).map(function (item) {
    const path = item && typeof item.path === "string" ? item.path : "?";
    const reason = item && typeof item.reason === "string" ? item.reason : "unreadable";
    return path + " (" + reason + ")";
  });
  return " Not inlined: " + entries.join(", ") + (missing.length > 20 ? ", ..." : "") + ".";
}

function freshnessText(result) {
  if (!result || result.adapterStale !== true) return "";
  return "\nAdapter freshness: this agent is running MCP adapter " +
    (typeof result.runningAdapterVersion === "string" ? result.runningAdapterVersion : "unknown") +
    " but the plugin is " +
    (typeof result.adapterVersion === "string" ? result.adapterVersion : ADAPTER_VERSION) +
    ". Reconnect this agent to load the current tools.\n";
}

function previewText(result) {
  const widths = "width=" + result.width + " contentHeight=" + result.contentHeight +
    " capturedHeight=" + result.capturedHeight + " suggestedHeight=" + Math.max(80, Math.min(2000, result.contentHeight));
  return "Static PNG preview rendered with scripts disabled. " + widths +
    ". No console output: page scripts are disabled. Workspace raster images were inlined; remote and file " +
    "URLs stay blocked." + missingText(result.missingImages) + freshnessText(result);
}

async function callTool(name, args) {
  const input = args && typeof args === "object" ? args : {};
  if (typeof input.html !== "string" || input.html.length === 0) {
    return textResult("html_preview/html_render failed: html must be a non-empty string", true);
  }
  if (input.html.length > MAX_HTML_CHARS) {
    return textResult("html_render failed: html exceeds " + MAX_HTML_CHARS + " characters", true);
  }
  if (name === "html_preview") {
    const result = await bridge({
      tool: "html_preview",
      input: {
        html: input.html,
        width: typeof input.width === "number" ? input.width : undefined,
        appearance: input.appearance === "light" ? "light" : "dark",
      },
    });
    return {
      content: [
        { type: "image", data: result.screenshot.data, mimeType: "image/png" },
        { type: "text", text: previewText(result) },
      ],
      isError: false,
    };
  }
  if (name === "html_render") {
    if (typeof input.title !== "string" || input.title.trim().length === 0) {
      return textResult("html_render failed: title must not be empty", true);
    }
    if (typeof input.height !== "number" || !Number.isInteger(input.height) ||
      input.height < 80 || input.height > 2000) {
      return textResult("html_render failed: height must be an integer from 80 to 2000", true);
    }
    const result = await bridge({
      tool: "html_render",
      input: {
        html: input.html,
        title: input.title,
        height: input.height,
        summary: typeof input.summary === "string" ? input.summary : undefined,
        renderMode: typeof input.renderMode === "string" ? input.renderMode : undefined,
        ...(input.report && typeof input.report === "object" ? { report: input.report } : {}),
      },
    });
    const reference = encodeURIComponent(JSON.stringify({
      artifactId: result.htmlRender.artifactId,
      title: result.htmlRender.title,
      summary: result.summary === undefined ? null : result.summary,
      width: result.htmlRender.width,
      height: result.htmlRender.height,
      ...(result.renderMode === undefined ? {} : { renderMode: result.renderMode }),
      ...(result.hasReport === true ? { hasReport: true } : {}),
      ...(typeof result.htmlRender.measuredHeight === "number"
        ? { measuredHeight: result.htmlRender.measuredHeight }
        : {}),
      ...(Array.isArray(result.htmlRender.heights) && result.htmlRender.heights.length > 0
        ? { heights: result.htmlRender.heights }
        : {}),
    }));
    const heights = Array.isArray(result.htmlRender.heights)
      ? result.htmlRender.heights.map(function (entry) { return entry[0] + "x" + entry[1]; }).join(", ")
      : "unavailable";
    const path = typeof result.interactivePath === "string" ? result.interactivePath : "";
    // The marker is first so a provider output cap or an agent slicing the
    // result (for example link.slice(0, 1200)) cannot cut the reference. The
    // artifact id survives any prefix; the rest is for the model to read.
    let text = MARKER + reference + "\n" +
      "Published a report card titled " + JSON.stringify(result.htmlRender.title) +
      ". The reader sees it above your reply.\n" +
      "interactivePath: " + path + "\n" +
      "measuredHeights: " + heights + "\n" +
      "reportStored: " + (result.hasReport === true ? "yes" : "no") + "\n" +
      "renderMode: " + (result.renderMode === undefined ? "auto" : result.renderMode) + "\n" +
      "In your final reply include exactly this Markdown link on its own line: [Open interactive report](<" +
      path + ">)\n";
    if (Array.isArray(result.warnings) && result.warnings.length > 0) {
      text += "Warnings: " + result.warnings.slice(0, 5).join("; ") + "\n";
    }
    const missing = missingText(result.missingImages);
    if (missing) text += "Images not inlined:" + missing + "\n";
    text += "Do not repeat or describe the page in your reply.\n";
    text += freshnessText(result);
    return textResult(text, false);
  }
  return textResult("Unknown tool: " + name, true);
}

async function handle(message) {
  const id = message.id === undefined ? null : message.id;
  if (message.method === "initialize") {
    const requested = message.params && message.params.protocolVersion;
    const protocolVersion = SUPPORTED_PROTOCOLS.indexOf(requested) >= 0 ? requested : "2024-11-05";
    send({
      jsonrpc: "2.0",
      id: id,
      result: {
        protocolVersion: protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: __PASEO_SERVER_NAME__, version: ADAPTER_VERSION },
        instructions: __PASEO_POLICY_INSTRUCTIONS__,
      },
    });
    return;
  }
  if (message.method === "ping") {
    send({ jsonrpc: "2.0", id: id, result: {} });
    return;
  }
  if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: id, result: { tools: TOOLS } });
    return;
  }
  if (message.method === "tools/call") {
    const params = message.params || {};
    const name = typeof params.name === "string" ? params.name : "";
    if (name !== "html_preview" && name !== "html_render") {
      fail(id, -32602, "Unknown tool: " + name);
      return;
    }
    try {
      const result = await callTool(name, params.arguments);
      send({ jsonrpc: "2.0", id: id, result: result });
    } catch (error) {
      const text = error instanceof Error ? error.message : "HTML rendering failed";
      send({ jsonrpc: "2.0", id: id, result: textResult(name + " failed: " + text, true) });
    }
    return;
  }
  if (typeof message.method === "string" && message.method.startsWith("notifications/")) {
    return;
  }
  if (message.method === undefined) return;
  fail(id, -32601, "Method not found: " + message.method);
}

let pending = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", function (chunk) {
  pending += chunk;
  if (Buffer.byteLength(pending, "utf8") > MAX_LINE_BYTES) {
    process.stderr.write(ADAPTER_LOG_TAG + " MCP adapter: oversized request\n");
    pending = "";
    return;
  }
  let newline = pending.indexOf("\n");
  while (newline !== -1) {
    const line = pending.slice(0, newline).trim();
    pending = pending.slice(newline + 1);
    if (line) {
      try {
        const message = JSON.parse(line);
        void handle(message);
      } catch {
        send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      }
    }
    newline = pending.indexOf("\n");
  }
});
process.stdin.on("end", function () {
  process.exit(0);
});
`
    .replace("__PASEO_REPORT_SCHEMA__", () => JSON.stringify(reportJsonSchema))
    .replace("__PASEO_HTML_DESCRIPTION__", () => JSON.stringify(HTML_DESCRIPTION))
    .replace("__PASEO_RENDER_DESCRIPTION__", () => JSON.stringify(RENDER_DESCRIPTION))
    .replace("__PASEO_POLICY_INSTRUCTIONS__", () => JSON.stringify(POLICY_INSTRUCTIONS))
    .replace("__PASEO_MARKER__", () => JSON.stringify(identity.markerPrefix))
    .replace("__PASEO_ADAPTER_VERSION__", () => JSON.stringify(identity.adapterVersion))
    .replace("__PASEO_BRIDGE_ENV__", () => JSON.stringify(identity.bridgeEnv))
    .replace("__PASEO_TOKEN_FILE__", () => JSON.stringify(BRIDGE_TOKEN_FILE))
    .replace("__PASEO_LOG_TAG__", () => JSON.stringify(identity.logTag))
    .replace("__PASEO_SERVER_NAME__", () => JSON.stringify(identity.mcpServerName));
}

/** Production adapter source, written by every bridge for the production identity. */
export const ADAPTER_SOURCE = buildAdapterSource(PRODUCTION_IDENTITY);

/**
 * Retired 2.x adapter, written beside the current one so a legacy agent record
 * that still points at `mcp-adapter-v1.mjs` cannot reach the 3.x bridge.
 *
 * A 2.x install left that file as a live bridge client speaking the old
 * protocol. The daemon now overwrites it with this tombstone, which
 *
 * - names the retirement on stderr when a legacy agent spawns it,
 * - completes `initialize` so the legacy agent still opens, and advertises no
 *   tools, so a stale entry cannot shadow `html-render-v3`,
 * - answers `tools/call` with an explicit migration error instead of a timeout.
 *
 * It imports nothing, reads no environment variable, opens no socket and cannot
 * authenticate against the bridge. Keep this template free of backticks and
 * `${` sequences.
 */
export function buildLegacyAdapterTombstone(identity: PluginIdentity): string {
  return String.raw`const VERSION = __PASEO_ADAPTER_VERSION__;
const SERVER_NAME = __PASEO_SERVER_NAME__;
const LOG_TAG = __PASEO_LOG_TAG__;
const RETIRED_FILE = __PASEO_LEGACY_FILE__;
const MESSAGE =
  "This agent still has the retired HTML Render 2.x MCP server in its saved configuration (" +
  RETIRED_FILE + "), which cannot talk to the 3.x bridge. HTML Render 3.0 contributes server " +
  SERVER_NAME + " at agent session open and never writes saved MCP configuration. Remove the saved " +
  "\"html-render\" entry from this agent, or create a new agent, to get the current tools.";

// stderr, once: daemon logs and device logcat show why this process is inert.
process.stderr.write(LOG_TAG + " tombstone: " + MESSAGE + "\n");

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

async function handle(message) {
  const id = message.id === undefined ? null : message.id;
  if (message.method === "initialize") {
    const requested = message.params && message.params.protocolVersion;
    send({
      jsonrpc: "2.0",
      id: id,
      result: {
        protocolVersion: typeof requested === "string" ? requested : "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "html-render-legacy-tombstone", version: VERSION },
        instructions: MESSAGE,
      },
    });
    return;
  }
  if (message.method === "ping") {
    send({ jsonrpc: "2.0", id: id, result: {} });
    return;
  }
  if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: id, result: { tools: [] } });
    return;
  }
  if (message.method === "tools/call") {
    send({ jsonrpc: "2.0", id: id, error: { code: -32603, message: MESSAGE } });
    return;
  }
  if (typeof message.method === "string" && message.method.startsWith("notifications/")) {
    return;
  }
  if (message.method === undefined) return;
  send({ jsonrpc: "2.0", id: id, error: { code: -32601, message: "Method not found: " + message.method } });
}

let pending = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", function (chunk) {
  pending += chunk;
  let newline = pending.indexOf("\n");
  while (newline !== -1) {
    const line = pending.slice(0, newline).trim();
    pending = pending.slice(newline + 1);
    if (line) {
      try {
        const message = JSON.parse(line);
        void handle(message);
      } catch {
        send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      }
    }
    newline = pending.indexOf("\n");
  }
});
process.stdin.on("end", function () {
  process.exit(0);
});
`
    .replace("__PASEO_ADAPTER_VERSION__", () => JSON.stringify(identity.adapterVersion))
    .replace("__PASEO_SERVER_NAME__", () => JSON.stringify(identity.mcpServerName))
    .replace("__PASEO_LOG_TAG__", () => JSON.stringify(identity.logTag))
    .replace("__PASEO_LEGACY_FILE__", () => JSON.stringify(identity.legacyAdapterFileName));
}

/** Production tombstone source, written by every production bridge. */
export const LEGACY_ADAPTER_TOMBSTONE = buildLegacyAdapterTombstone(PRODUCTION_IDENTITY);
