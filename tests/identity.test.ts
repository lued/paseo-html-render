import assert from "node:assert/strict";
import test from "node:test";
import { BRIDGE_TOKEN_FILE, PRODUCTION_IDENTITY } from "../shared/identity.ts";
import {
  decodeReportReference,
  encodeReportReference,
  recognizeToolCall,
  transformTimelineToolCall,
} from "../shared/recognize.ts";
import { archiveCleanupEnabled, resolveDataRoot } from "../server/paths.ts";
import { buildAdapterSource, ADAPTER_SOURCE } from "../server/adapter-source.ts";
import { SELECTED_IDENTITY } from "../shared/selected-identity.ts";
import type { ReportCardData } from "../shared/protocol.ts";

const card: ReportCardData = {
  artifactId: "0123456789abcdef0123456789abcdef",
  title: "Contract",
  summary: "Identity and storage contracts",
  width: 728,
  height: 400,
};

test("identity preserves the historical external contracts", () => {
  assert.equal(SELECTED_IDENTITY, PRODUCTION_IDENTITY);
  assert.equal(PRODUCTION_IDENTITY.pluginId, "html-render");
  assert.equal(PRODUCTION_IDENTITY.mcpServerName, "html-render");
  assert.equal(PRODUCTION_IDENTITY.markerPrefix, "paseo-html-render:v1:");
  assert.equal(PRODUCTION_IDENTITY.rendererKind, "html-report-card");
  assert.equal(PRODUCTION_IDENTITY.screenId, "report");
  assert.equal(PRODUCTION_IDENTITY.dataDirName, "html-render");
  assert.equal(PRODUCTION_IDENTITY.adapterFileName, "mcp-adapter-v1.mjs");
  assert.equal(PRODUCTION_IDENTITY.socketFileName, "bridge.sock");
  assert.equal(BRIDGE_TOKEN_FILE, "bridge.token");
  assert.deepEqual(PRODUCTION_IDENTITY.bridgeEnv, {
    bridge: "PASEO_HTML_RENDER_BRIDGE",
    token: "PASEO_HTML_RENDER_TOKEN",
    cwd: "PASEO_HTML_RENDER_CWD",
  });
  assert.equal(PRODUCTION_IDENTITY.dataDirEnv, "PASEO_HTML_RENDER_DATA_DIR");
  assert.equal(PRODUCTION_IDENTITY.archiveCleanupEnv, "PASEO_HTML_RENDER_PURGE_ON_ARCHIVE");
});

test("marker round-trips through every recognized host shape", () => {
  const text = encodeReportReference(card, PRODUCTION_IDENTITY);
  assert.deepEqual(decodeReportReference(text, PRODUCTION_IDENTITY), card);
  assert.equal(
    decodeReportReference(text.replace(PRODUCTION_IDENTITY.markerPrefix, "paseo-html-render-other:v1:"), PRODUCTION_IDENTITY),
    null,
  );
  assert.equal(recognizeToolCall({ name: "html_render", detail: { output: text } }, PRODUCTION_IDENTITY)?.artifactId, card.artifactId);
  assert.equal(recognizeToolCall({ name: "html_render", detail: { output: "plain text" } }, PRODUCTION_IDENTITY), null);
  assert.equal(transformTimelineToolCall({ name: "codemode", detail: { output: text } }, PRODUCTION_IDENTITY), undefined);
  const item = transformTimelineToolCall({ name: "mcp__html_render__html_render", detail: { output: text } }, PRODUCTION_IDENTITY);
  assert.equal(item?.items[0]?.kind, "html-report-card");
});

test("data root and archive cleanup read the documented environment variables", () => {
  assert.equal(
    resolveDataRoot({ PASEO_HOME: "/home/example/.paseo" }, PRODUCTION_IDENTITY),
    "/home/example/.paseo/plugin-data/html-render",
  );
  assert.equal(
    resolveDataRoot({ PASEO_HOME: "/home/example/.paseo", PASEO_HTML_RENDER_DATA_DIR: "/tmp/override" }, PRODUCTION_IDENTITY),
    "/tmp/override",
  );
  assert.equal(archiveCleanupEnabled({}, PRODUCTION_IDENTITY), false);
  assert.equal(archiveCleanupEnabled({ PASEO_HTML_RENDER_PURGE_ON_ARCHIVE: "1" }, PRODUCTION_IDENTITY), true);
});

test("adapter source matches the identity and embeds no credentials", () => {
  assert.equal(ADAPTER_SOURCE, buildAdapterSource(PRODUCTION_IDENTITY));
  assert.ok(ADAPTER_SOURCE.includes(PRODUCTION_IDENTITY.markerPrefix));
  assert.ok(ADAPTER_SOURCE.includes(PRODUCTION_IDENTITY.mcpServerName));
  for (const name of Object.values(PRODUCTION_IDENTITY.bridgeEnv)) {
    assert.ok(ADAPTER_SOURCE.includes(name), `adapter must read ${name}`);
  }
  assert.ok(!/token-[0-9a-f]{32}/.test(ADAPTER_SOURCE));
});
