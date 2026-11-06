import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ADAPTER_SOURCE } from "../server/adapter-source.ts";
import { COMMON_VISUAL_PACKAGES, COMMON_VISUAL_PACKAGE_HINTS } from "../shared/visual-packages.ts";
import {
  HTML_DESCRIPTION,
  LAYOUT_DESCRIPTION,
  MCP_SERVER_DESCRIPTION,
  MCP_TOOL_EXPOSURE,
  POLICY_INSTRUCTIONS,
  POLICY_SUMMARY,
  POLICY_SUMMARY_MAX_CHARS,
  RENDER_DESCRIPTION,
} from "../shared/policy.ts";

test("the policy summary fits pi's one-line 250-character budget", () => {
  assert.equal(POLICY_SUMMARY_MAX_CHARS, 250);
  assert.ok(
    POLICY_SUMMARY.length <= POLICY_SUMMARY_MAX_CHARS,
    `the summary must stay within pi's hard cap (${POLICY_SUMMARY.length} chars)`,
  );
  assert.equal(POLICY_SUMMARY.split("\n").length, 1);
});

/**
 * The discovery regression this test exists for: pi declares no html_render or
 * html_preview tool, `toPiMcpConfig` drops the server description, and the
 * first instruction line is all the model sees. A fresh agent asked for an
 * "HTML report" had no signal and wrote a file with bash instead, because the
 * old first line only described when to render, never what the tools are.
 */
test("the first model-visible line carries the product identity and tool names", () => {
  const firstLine = POLICY_INSTRUCTIONS.split("\n")[0] ?? "";
  assert.equal(firstLine, POLICY_SUMMARY);
  assert.ok(firstLine.length <= POLICY_SUMMARY_MAX_CHARS, `first line is ${firstLine.length} chars`);
  for (const required of ["HTML", "report", "html_render", "html_preview"]) {
    assert.ok(
      firstLine.toLowerCase().includes(required.toLowerCase()),
      `the first line must name ${required}: ${firstLine}`,
    );
  }
});

test("the summary carries all four rules on its own", () => {
  // pi sees only this line. Each rule is a positive assertion so a shorter
  // summary cannot silently drop the brake.
  assert.match(POLICY_SUMMARY, /HTML reports and cards/);
  assert.match(POLICY_SUMMARY, /html_render publishes a card above your reply/);
  assert.match(POLICY_SUMMARY, /html_preview drafts it/);
  assert.match(POLICY_SUMMARY, /comparison, flow, chart, status/);
  assert.match(POLICY_SUMMARY, /Otherwise reply in text/);
  assert.match(POLICY_SUMMARY, /One card per turn/);
  assert.match(POLICY_SUMMARY, /never republish unchanged content/);
});

test("the long form starts with the standalone summary", () => {
  const lines = POLICY_INSTRUCTIONS.split("\n");
  assert.equal(lines[0], POLICY_SUMMARY);
  assert.ok(lines.length > 1, "the long form must add the operating detail");
  assert.ok((lines[1] ?? "").trim().length > 0);
});

test("the long form agrees with the summary's brake and text rule", () => {
  const lines = POLICY_INSTRUCTIONS.split("\n");
  // Both projections must carry the same brake. The old "one card per reply"
  // phrase contradicted the summary's stricter "one card per turn".
  assert.match(POLICY_INSTRUCTIONS, /One card per turn/);
  assert.match(POLICY_INSTRUCTIONS, /Never publish a second card in the same turn/);
  assert.match(POLICY_INSTRUCTIONS, /Otherwise reply in text/);
  assert.match(POLICY_INSTRUCTIONS, /Reply in text for a single fact, one sentence, code, file contents or config/);
  // The long form names the same tools as the summary, and keeps the "HTML
  // report" phrasing a user actually asks for.
  assert.match(POLICY_INSTRUCTIONS, /These are HTML report tools/);
  assert.match(POLICY_INSTRUCTIONS, /html_preview returns a draft screenshot and never publishes/);
  assert.match(POLICY_INSTRUCTIONS, /A request for an HTML report, a visual summary, a dashboard or something scannable/);
  for (const line of lines) {
    assert.ok(!line.toLowerCase().includes("one card per reply"), `contradicting line: ${line}`);
  }
});

test("the contributed MCP entry carries a description and an exposure", () => {
  // Forward-compatible only: Paseo 0.15's providers strip both fields, so the
  // summary above remains the discovery mechanism. These are still accurate.
  assert.match(MCP_SERVER_DESCRIPTION, /HTML reports and cards/);
  assert.match(MCP_SERVER_DESCRIPTION, /html_render/);
  assert.ok(MCP_SERVER_DESCRIPTION.length <= 280);
  assert.equal(MCP_TOOL_EXPOSURE, "codemode");
});

test("the common-package list is compact npm-name data, not a dependency or profile registry", () => {
  const names = Object.values(COMMON_VISUAL_PACKAGES).flat();
  assert.equal(new Set(names).size, names.length, "package names must be unique");
  assert.ok(COMMON_VISUAL_PACKAGE_HINTS.length < 600, "keep discovery hints small");
  for (const name of names) {
    assert.match(name, /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/);
    assert.ok(COMMON_VISUAL_PACKAGE_HINTS.includes(name));
  }
  for (const name of ["pele", "three", "motion", "echarts", "@observablehq/plot", "lucide-static", "shadcn"]) {
    assert.ok(names.some(candidate => candidate === name), `${name} is a common discovery hint`);
  }
});

test("design guidance matches one npm global inventory while leaving choices to the agent", () => {
  for (const description of [POLICY_INSTRUCTIONS, HTML_DESCRIPTION, RENDER_DESCRIPTION]) {
    assert.match(description, /npm ls --global --depth=0 --json once per session/);
    assert.match(description, /match package names in its top-level dependencies/);
    assert.ok(description.includes(COMMON_VISUAL_PACKAGE_HINTS));
    assert.match(description, /reuse the inventory/);
    assert.match(description, /npm root --global only when you need a package's location/);
    assert.match(description, /starting point, not an allowlist/);
    assert.match(description, /other available packages are also options/);
    assert.match(description, /Use your own design judgment/);
    assert.match(description, /If no installed match fits, use other available tools or plain HTML\/CSS\/SVG/);
    assert.match(description, /do not install packages unless asked/);
    assert.doesNotMatch(description, /chart-svg|motion-web|icons-svg|recipe-verified/);
  }
});

test("the layout contract keeps its fluid-width guidance", () => {
  // These were previously asserted against the adapter's instructions line.
  // They belong to the shared layout text, which both descriptions embed.
  assert.match(LAYOUT_DESCRIPTION, /fluid/);
  assert.match(LAYOUT_DESCRIPTION, /728/);
  assert.match(LAYOUT_DESCRIPTION, /repeat\(auto-fit/);
});

test("both HTML descriptions carry the chart fit and honesty rules", () => {
  for (const description of [HTML_DESCRIPTION, RENDER_DESCRIPTION]) {
    assert.match(description, /numbers over time use a line or area/);
    assert.match(description, /comparing categories uses bars with the baseline at 0/);
    assert.match(description, /two numeric variables use a scatter/);
    assert.match(description, /a distribution uses a dot or strip plot/);
    assert.match(description, /a ranking uses sorted bars/);
    assert.match(description, /proportions use a stacked bar/);
    assert.match(description, /pie only up to 4 slices/);
    assert.match(description, /Never a table of numbers when a chart answers it/);
    assert.match(description, /label units and the axis range/i);
    assert.match(description, /--chart-1 through --chart-6/);
    assert.match(description, /No 3D/);
    assert.match(description, /truncated axes/);
    assert.match(description, /dual axes/);
    assert.match(description, /Plot only numbers actually obtained from a tool/);
    assert.match(description, /caption the source/);
    assert.match(description, /omit the chart rather than invent data/);
  }
});

test("both HTML descriptions keep interaction optional, static-first, and sandbox-bound", () => {
  for (const description of [HTML_DESCRIPTION, RENDER_DESCRIPTION]) {
    assert.match(description, /Use interaction only when it helps the reader/);
    assert.match(description, /do not make every answer animated or interactive/);
    assert.match(description, /Motion must be optional and purposeful/);
    assert.match(description, /short reveal or state change/);
    assert.match(description, /Inline scripts and styles are the only executable capabilities/);
    assert.match(description, /remote libraries, fonts, images and network calls are blocked/);
    assert.match(description, /Static previews execute no JavaScript/);
    assert.match(description, /default markup must stay readable/);
    assert.match(description, /controls must be progressive enhancement/);
    assert.match(description, /native buttons and labels with visible focus and keyboard operation/);
    assert.match(description, /respect prefers-reduced-motion in both CSS and script logic/);
    assert.match(description, /continuous animation needs a visible pause or stop/);
    assert.match(description, /must not run by default/);
    assert.match(description, /never imply control of Paseo agents, workspaces or other host actions/);
  }
});

test("the built adapter embeds the policy and stays template-safe", () => {
  // The summary is the first line of the injected instructions string, so it
  // appears verbatim followed by an escaped newline rather than as its own
  // quoted constant.
  assert.ok(ADAPTER_SOURCE.includes(POLICY_SUMMARY));
  assert.ok(ADAPTER_SOURCE.includes(JSON.stringify(POLICY_INSTRUCTIONS)));
  assert.ok(ADAPTER_SOURCE.includes(JSON.stringify(HTML_DESCRIPTION)));
  assert.ok(ADAPTER_SOURCE.includes(JSON.stringify(RENDER_DESCRIPTION)));

  // Check the String.raw body, not the generated output: the report schema
  // already carries backticks in a description, while the template itself must
  // stay free of both backticks and interpolation.
  const adapterFile = readFileSync("server/adapter-source.ts", "utf8");
  const startMarker = "return String.raw`";
  const start = adapterFile.indexOf(startMarker);
  const end = adapterFile.indexOf("\n`\n", start);
  assert.ok(start >= 0 && end > start, "adapter template delimiters must be recognizable");
  const template = adapterFile.slice(start + startMarker.length, end);
  assert.ok(!template.includes("`"), "adapter template must stay free of backticks");
  assert.ok(!template.includes("${"), "adapter template must stay free of interpolation");
});

test("the adapter sends the agent id with every bridge request", () => {
  // Frozen contract with the turn guard: env lookup at call time, empty string
  // when an older host does not set it, and no guessing from cwd.
  assert.ok(ADAPTER_SOURCE.includes('agentId: process.env.PASEO_AGENT_ID || ""'));
  assert.ok(!ADAPTER_SOURCE.includes("agentId: callerCwd"));
});
