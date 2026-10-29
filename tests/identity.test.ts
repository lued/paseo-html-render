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
import {
  buildAdapterSource,
  buildLegacyAdapterTombstone,
  ADAPTER_SOURCE,
  LEGACY_ADAPTER_TOMBSTONE,
} from "../server/adapter-source.ts";
import { POLICY_INSTRUCTIONS, POLICY_SUMMARY } from "../shared/policy.ts";
import { SELECTED_IDENTITY } from "../shared/selected-identity.ts";
import type { ReportCardData } from "../shared/protocol.ts";

const card: ReportCardData = {
  artifactId: "0123456789abcdef0123456789abcdef",
  title: "Contract",
  summary: "Identity and storage contracts",
  width: 728,
  height: 400,
};

test("identity freezes the 3.0 external contracts", () => {
  assert.equal(SELECTED_IDENTITY, PRODUCTION_IDENTITY);
  assert.equal(PRODUCTION_IDENTITY.pluginId, "html-render");
  // The MCP key is versioned so a 2.x agent's saved `html-render` entry cannot
  // collide with the launch-only session-open contribution.
  assert.equal(PRODUCTION_IDENTITY.mcpServerName, "html-render-v3");
  assert.equal(PRODUCTION_IDENTITY.markerPrefix, "paseo-html-render:v1:");
  assert.equal(PRODUCTION_IDENTITY.rendererKind, "html-report-card");
  assert.equal(PRODUCTION_IDENTITY.screenId, "report");
  assert.equal(PRODUCTION_IDENTITY.dataDirName, "html-render");
  // Versioned transport files keep a 2.x adapter away from the 3.x bridge.
  assert.equal(PRODUCTION_IDENTITY.adapterFileName, "mcp-adapter-v3.mjs");
  assert.equal(PRODUCTION_IDENTITY.legacyAdapterFileName, "mcp-adapter-v1.mjs");
  assert.equal(PRODUCTION_IDENTITY.socketFileName, "bridge-v3.sock");
  assert.equal(PRODUCTION_IDENTITY.adapterVersion, "3.0.0");
  assert.equal(BRIDGE_TOKEN_FILE, "bridge-v3.token");
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
  // The MCP serverInfo name is the versioned key, so a host that merges by
  // name cannot confuse the 3.x adapter with a saved 2.x entry.
  assert.ok(ADAPTER_SOURCE.includes(JSON.stringify(PRODUCTION_IDENTITY.mcpServerName)));
  for (const name of Object.values(PRODUCTION_IDENTITY.bridgeEnv)) {
    assert.ok(ADAPTER_SOURCE.includes(name), `adapter must read ${name}`);
  }
  assert.ok(ADAPTER_SOURCE.includes(JSON.stringify(BRIDGE_TOKEN_FILE)));
  assert.ok(!/token-[0-9a-f]{32}/.test(ADAPTER_SOURCE));
  // The private token file is the source of truth, so a busy or reloaded
  // adapter keeps working when the injected environment is stale.
  assert.match(ADAPTER_SOURCE, /function currentBridgeToken\(\) \{\s*if \(bridgeTokenFile\)/);
  assert.ok(ADAPTER_SOURCE.indexOf("readFileSync(bridgeTokenFile") < ADAPTER_SOURCE.indexOf("return bridgeToken;"));

  // The retired adapter is a tombstone: it names the migration, advertises no
  // tools and cannot reach the bridge at all.
  assert.equal(LEGACY_ADAPTER_TOMBSTONE, buildLegacyAdapterTombstone(PRODUCTION_IDENTITY));
  assert.ok(LEGACY_ADAPTER_TOMBSTONE.includes(JSON.stringify(PRODUCTION_IDENTITY.legacyAdapterFileName)));
  assert.ok(LEGACY_ADAPTER_TOMBSTONE.includes("html-render-legacy-tombstone"));
  assert.ok(LEGACY_ADAPTER_TOMBSTONE.includes("tools: []"));
  assert.ok(!LEGACY_ADAPTER_TOMBSTONE.includes("node:net"));
  assert.ok(!LEGACY_ADAPTER_TOMBSTONE.includes("BRIDGE_ENV"));
  assert.ok(!LEGACY_ADAPTER_TOMBSTONE.includes("bridgeToken"));

  // The generated adapter is the only place pi reads guidance, so it must
  // carry the one-line summary as the first instruction line.
  assert.equal(POLICY_INSTRUCTIONS.split("\n")[0], POLICY_SUMMARY);
  assert.ok(ADAPTER_SOURCE.includes(POLICY_SUMMARY));
});

test("adapter writes the marker first so a prefix slice cannot cut it", () => {
  // Regression: an agent logged link.slice(0, 1200) and destroyed the marker
  // that used to be appended last.
  assert.ok(ADAPTER_SOURCE.includes('let text = MARKER + reference + "\\n" +'));
  assert.ok(!ADAPTER_SOURCE.includes('" + MARKER + reference'));
  const markerAt = ADAPTER_SOURCE.indexOf("let text = MARKER + reference");
  const proseAt = ADAPTER_SOURCE.indexOf('"Published a report card titled "');
  assert.ok(markerAt >= 0 && proseAt > markerAt);
});
