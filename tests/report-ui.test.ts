import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build, type Plugin } from "esbuild";
import { browserResult } from "./helpers/browser.ts";
import { parseReportModel, type ReportModelV1 } from "../shared/report-model.ts";
import {
  blocksForTab,
  cardHighlights,
  collectEvidence,
  formatUsageNumber,
  graphAssetName,
  graphView,
  imageAspectRatio,
  interactivePathOf,
  listWindow,
  liveHtmlOf,
  outcomeLabel,
  outcomeTone,
  previewAssetName,
  reportCardMode,
  reportTabs,
  safeExternalUrl,
  usageEntries,
  usageModelEntries,
} from "../client/report-view-model.ts";
import { canOpenReportScreen, openReportScreen, setNavigator } from "../client/surface.ts";

function fixture(): ReportModelV1 {
  return parseReportModel({
    version: 1,
    outcome: { status: "success", headline: "Parity contracts frozen", detail: "All blocks covered." },
    summary: "A complete report exercising every block kind.",
    metrics: [
      { label: "Tests", value: "42", tone: "good" },
      { label: "Pending", value: "0" },
      { label: "Coverage", value: "88%" },
      { label: "Fourth", value: "hidden" },
    ],
    blocks: [
      { kind: "heading", text: "Overview" },
      { kind: "text", text: "Narrative text." },
      { kind: "bullets", items: ["First finding", "Second finding"] },
      { kind: "steps", items: ["Open", "Run", "Verify"] },
      { kind: "callout", tone: "warn", title: "Careful", text: "Bounded JSON only." },
      { kind: "code", language: "ts", text: "const answer = 42;" },
      { kind: "table", columns: ["Area", "Result"], rows: [["Schema", "pass"]] },
      { kind: "agents", agents: [{ name: "worker-a", role: "contracts", status: "ok" }] },
      { kind: "graph", graphId: "main" },
      {
        kind: "evidence",
        items: [{ label: "Plan", url: "https://example.com/plan", artifactPath: "artifacts/report.html" }],
      },
    ],
    graph: {
      id: "main",
      nodes: [
        { id: "start", label: "Start", tone: "good" },
        { id: "end", label: "End", kind: "step" },
      ],
      edges: [{ from: "start", to: "end", label: "then" }],
      decisions: [{ id: "ship", label: "Ship it", nodeId: "end", choice: "approved" }],
    },
    evidence: [
      { label: "Repository", url: "https://example.com/repo" },
      { label: "Plan", url: "https://example.com/plan", artifactPath: "artifacts/report.html" },
    ],
    nextAction: "Run the focused tests.",
    promptLesson: { improvedPrompt: "Ask for bounded contracts first.", lesson: "Freeze schemas first." },
    usage: {
      inputTokens: { provenance: "measured", value: 1_200 },
      outputTokens: { provenance: "estimated", value: 800 },
      cachedInputTokens: { provenance: "unavailable" },
      costUsd: { provenance: "unavailable" },
      durationMs: { provenance: "measured", value: 5_000 },
      models: [{ name: "model-a", provider: "provider-a", totalTokens: { provenance: "measured", value: 2_000 } }],
    },
  });
}

test("card mode: live wins only on web; native/report/static fall back in order", () => {
  assert.equal(
    reportCardMode({ platform: "web", renderMode: "auto", hasHtml: true, hasReport: true }),
    "live",
  );
  assert.equal(
    reportCardMode({ platform: "web", renderMode: "iframe", hasHtml: false, hasReport: false }),
    "loading",
  );
  assert.equal(
    reportCardMode({ platform: "ios", renderMode: "auto", hasHtml: true, hasReport: true }),
    "report",
  );
  assert.equal(
    reportCardMode({ platform: "android", renderMode: "iframe", hasHtml: true, hasReport: false }),
    "image",
  );
  assert.equal(
    reportCardMode({ platform: "web", renderMode: "static", hasHtml: true, hasReport: true }),
    "report",
  );
  assert.equal(
    reportCardMode({ platform: "web", renderMode: undefined, hasHtml: true, hasReport: false }),
    "image",
  );
});

test("asset selection follows appearance with a dark fallback", () => {
  const assets = { previewLight: true, graphDark: true, graphLight: false };
  assert.equal(previewAssetName("light", assets), "previewLight");
  assert.equal(previewAssetName("dark", assets), "preview");
  assert.equal(previewAssetName("light", undefined), "preview");
  assert.equal(graphAssetName("light", assets), "graphDark");
  assert.equal(
    graphAssetName("light", { previewLight: true, graphDark: true, graphLight: true }),
    "graphLight",
  );
  assert.equal(graphAssetName("dark", { previewLight: true, graphDark: true, graphLight: true }), "graphDark");
  assert.equal(graphAssetName("dark", { previewLight: false, graphDark: false, graphLight: true }), undefined);
});

test("aspect ratio uses measured capture or asset dimensions, never the requested cap", () => {
  assert.equal(imageAspectRatio(728, 300), 728 / 300);
  assert.equal(imageAspectRatio(800, 400), 2);
  assert.equal(imageAspectRatio(0, 300), undefined);
  assert.equal(imageAspectRatio(728, Number.POSITIVE_INFINITY), undefined);
  assert.equal(imageAspectRatio(undefined, 300), undefined);
});

test("tabs stay at five or fewer and only appear with content", () => {
  const report = fixture();
  const tabs = reportTabs(report, { hasOriginal: true });
  assert.deepEqual(
    tabs.map((tab) => tab.id),
    ["overview", "findings", "evidence", "run", "original"],
  );
  assert.equal(tabs.length, 5);

  const minimal = parseReportModel({
    version: 1,
    outcome: { status: "partial", headline: "Only overview" },
    blocks: [{ kind: "text", text: "Text" }],
  });
  assert.deepEqual(reportTabs(minimal, { hasOriginal: false }).map((tab) => tab.id), ["overview"]);
  assert.deepEqual(reportTabs(null, { hasOriginal: true }).map((tab) => tab.id), ["overview", "original"]);
});

test("every block kind lands in exactly one tab", () => {
  const report = fixture();
  const kinds = [
    ...blocksForTab(report, "overview"),
    ...blocksForTab(report, "findings"),
    ...blocksForTab(report, "evidence"),
    ...blocksForTab(report, "run"),
  ].map((block) => block.kind);
  assert.deepEqual(kinds.sort(), [
    "agents",
    "bullets",
    "callout",
    "code",
    "evidence",
    "graph",
    "heading",
    "steps",
    "table",
    "text",
  ]);
  assert.equal(blocksForTab(report, "original").length, 0);
});

test("card highlights cap at three, metrics first, findings fill", () => {
  const report = fixture();
  const highlights = cardHighlights(report);
  assert.equal(highlights.length, 3);
  assert.deepEqual(highlights.map((entry) => entry.label), ["Tests", "Pending", "Coverage"]);

  const withoutMetrics = { ...report, metrics: undefined };
  const findings = cardHighlights(withoutMetrics);
  assert.equal(findings.length, 2);
  assert.equal(findings[0]?.kind, "finding");
  assert.equal(findings[0]?.value, "First finding");
});

test("usage keeps measured, estimated and unavailable distinct", () => {
  const usage = fixture().usage!;
  const entries = usageEntries(usage);
  assert.equal(entries.length, 5);
  assert.deepEqual(
    entries.map((entry) => [entry.label, entry.value, entry.provenance]),
    [
      ["Input tokens", "1,200", "measured"],
      ["Output tokens", "~800", "estimated"],
      ["Cached input tokens", "Unavailable", "unavailable"],
      ["Cost", "Unavailable", "unavailable"],
      ["Duration", "5.0 s", "measured"],
    ],
  );
  assert.ok(entries.every((entry) => entry.label !== "Total tokens"));
  const models = usageModelEntries(usage);
  assert.equal(models[0]?.name, "model-a");
  assert.equal(models[0]?.provider, "provider-a");
  assert.equal(models[0]?.tokens?.value, "2,000");
  assert.equal(formatUsageNumber(1_200), "1,200");
});

test("evidence merges top-level and block rows without duplicates", () => {
  const rows = collectEvidence(fixture());
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.label), ["Repository", "Plan"]);
});

test("graph view resolves the graph id and rejects unknown references", () => {
  const report = fixture();
  const view = graphView(report);
  assert.equal(view?.id, "main");
  assert.equal(view?.nodes.length, 2);
  assert.equal(view?.decisions.length, 1);
  assert.equal(graphView(report, "main")?.id, "main");
  assert.equal(graphView(report, "other"), null);
  const noGraph = parseReportModel({
    version: 1,
    outcome: { status: "success", headline: "No graph" },
    blocks: [{ kind: "text", text: "Text" }],
  });
  assert.equal(graphView(noGraph), null);
});

test("list windows expand without losing the total", () => {
  assert.deepEqual(listWindow([1, 2, 3, 4, 5], false, 2), { items: [1, 2], hidden: 3 });
  assert.deepEqual(listWindow([1, 2, 3], true, 2), { items: [1, 2, 3], hidden: 0 });
  assert.deepEqual(listWindow([1], false, 8), { items: [1], hidden: 0 });
});

test("outcome labels and tones map without inventing colors", () => {
  assert.equal(outcomeLabel("success"), "Success");
  assert.equal(outcomeTone("success"), "good");
  assert.equal(outcomeTone("failed"), "bad");
  assert.equal(outcomeTone("partial"), "warn");
  assert.equal(outcomeTone("blocked"), "warn");
});

test("path and live HTML prefer the prepared copy, then the exact original", () => {
  assert.equal(interactivePathOf({ interactivePath: "/a" }, { interactivePath: "/b" }), "/b");
  assert.equal(interactivePathOf({ interactivePath: "/a" }, {}), "/a");
  assert.equal(interactivePathOf(undefined, undefined), undefined);
  assert.equal(liveHtmlOf({ html: "<p>original</p>", interactiveHtml: "<p>prepared</p>" }), "<p>prepared</p>");
  assert.equal(liveHtmlOf({ html: "<p>original</p>" }), "<p>original</p>");
});

test("only absolute http(s) links pass the external-link guard", () => {
  assert.equal(safeExternalUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(safeExternalUrl("http://example.com"), "http://example.com");
  assert.equal(safeExternalUrl("javascript:alert(1)"), undefined);
  assert.equal(safeExternalUrl("file:///tmp/a.html"), undefined);
  assert.equal(safeExternalUrl("data:text/html,x"), undefined);
  assert.equal(safeExternalUrl("/relative"), undefined);
  assert.equal(safeExternalUrl("https://user@example.com"), undefined);
  assert.equal(safeExternalUrl(undefined), undefined);
});

test("surface navigation uses public openScreen and clears on cleanup", () => {
  const opened: Array<{ screenId: string; params?: Record<string, string> }> = [];
  assert.equal(canOpenReportScreen(), false);
  assert.equal(openReportScreen({ artifactId: "a", agentId: "b", title: "T" }), false);
  setNavigator((input) => opened.push(input));
  assert.equal(canOpenReportScreen(), true);
  assert.equal(
    openReportScreen({ artifactId: "a".repeat(32), agentId: "agent-1", title: "Report" }),
    true,
  );
  assert.deepEqual(opened, [
    {
      screenId: "report",
      params: { artifactId: "a".repeat(32), agentId: "agent-1", title: "Report" },
    },
  ]);
  setNavigator(null);
  assert.equal(canOpenReportScreen(), false);
});

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const GOOD = "a".repeat(32);
const FAIL = "b".repeat(32);
const LEGACY = "c".repeat(32);
const PATH = `/tmp/html-render-artifacts/${GOOD}/interactive.html`;

function aliasPlugin(entries: Record<string, string>): Plugin {
  return {
    name: "test-alias",
    setup(build) {
      for (const [name, path] of Object.entries(entries)) {
        build.onResolve({ filter: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }, () => ({
          path,
        }));
      }
    },
  };
}

test("mounted card and screen: report, live, fallback and original states", { timeout: 240_000 }, async () => {
  const shim = join(dirname(fileURLToPath(import.meta.url)), "helpers", "native-shim.tsx");
  const bundle = await build({
    stdin: {
      contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      import { ReportCard } from './client/report-card.tsx';
      import { ReportScreen } from './client/report-screen.tsx';
      import { setNavigator } from './client/surface.ts';

      const GOOD = '${GOOD}';
      const FAIL = '${FAIL}';
      const LEGACY = '${LEGACY}';
      const NOGRAPH = 'd'.repeat(32);
      const BLANK = 'e'.repeat(32);
      const PNG = '${PNG}';
      const PATH = '/tmp/html-render-artifacts/' + GOOD + '/interactive.html';
      const COLORS = {
        surface0: '#101010', surface1: '#181818', surface2: '#222222', border: '#333333',
        foreground: '#eeeeee', foregroundMuted: '#a0a0a0', accent: '#66aaff',
        accentForeground: '#000000', statusSuccess: '#22cc88', statusWarning: '#ffaa33',
        statusDanger: '#ff5577'
      };
      const REPORT = {
        version: 1,
        outcome: { status: 'success', headline: 'Parity contracts frozen', detail: 'Every block covered.' },
        summary: 'A complete report exercising every block kind.',
        metrics: [
          { label: 'Tests', value: '42', tone: 'good' },
          { label: 'Pending', value: '0' },
          { label: 'Coverage', value: '88%' },
          { label: 'Hidden metric', value: 'secret' }
        ],
        blocks: [
          { kind: 'heading', text: 'Overview block' },
          { kind: 'text', text: 'Narrative text.' },
          { kind: 'bullets', items: ['First finding', 'Second finding'] },
          { kind: 'steps', items: ['Open', 'Run', 'Verify'] },
          { kind: 'callout', tone: 'warn', title: 'Careful', text: 'Bounded JSON only.' },
          { kind: 'code', language: 'ts', text: 'const answer = 42;' },
          { kind: 'table', columns: ['Area', 'Result'], rows: [
            ['Schema', 'pass'], ...Array.from({ length: 9 }, (_, i) => ['Row ' + i, i === 8 ? 'Last table row' : 'ok'])
          ] },
          { kind: 'agents', agents: [{ name: 'worker-a', role: 'contracts', status: 'ok' }] },
          { kind: 'graph', graphId: 'main' },
          { kind: 'evidence', items: [{ label: 'Plan', url: 'https://example.com/plan', artifactPath: 'artifacts/report.html' }] }
        ],
        graph: {
          id: 'main',
          nodes: [
            { id: 'start', label: 'Start', tone: 'good' },
            { id: 'end', label: 'End', kind: 'step' },
            { id: 'n3', label: 'Node three' },
            { id: 'n4', label: 'Node four' },
            { id: 'n5', label: 'Node five' },
            { id: 'n6', label: 'Node six' },
            { id: 'n7', label: 'Node seven' },
            { id: 'n8', label: 'Node eight' },
            { id: 'n9', label: 'Node nine' },
            { id: 'n10', label: 'Node ten' }
          ],
          edges: [{ from: 'start', to: 'end', label: 'then' }],
          decisions: [{ id: 'ship', label: 'Ship it', nodeId: 'end', choice: 'approved' }]
        },
        evidence: [
          { label: 'Repository', url: 'https://example.com/repo' },
          { label: 'Plan', url: 'https://example.com/plan', artifactPath: 'artifacts/report.html' }
        ],
        nextAction: 'Run the focused tests.',
        promptLesson: { improvedPrompt: 'Ask for bounded contracts first.', lesson: 'Freeze schemas first.' },
        usage: {
          inputTokens: { provenance: 'measured', value: 1200 },
          outputTokens: { provenance: 'estimated', value: 800 },
          cachedInputTokens: { provenance: 'unavailable' },
          costUsd: { provenance: 'unavailable' },
          durationMs: { provenance: 'measured', value: 5000 },
          models: [{ name: 'model-a', provider: 'provider-a', totalTokens: { provenance: 'measured', value: 2000 } }]
        }
      };

      function artifact(id, hasReport) {
        return {
          artifactId: id,
          title: hasReport ? 'Parity report' : 'Legacy report',
          summary: hasReport ? 'Summary text' : 'Legacy summary',
          width: 728,
          height: 600,
          createdAt: '2026-10-20T00:00:00.000Z',
          preview: { mimeType: 'image/png', base64: PNG },
          measuredHeight: 300,
          hasReport,
          report: hasReport ? REPORT : null,
          interactivePath: '/tmp/html-render-artifacts/' + id + '/interactive.html',
          assets: {
            previewLight: id !== NOGRAPH,
            graphDark: id !== NOGRAPH,
            graphLight: id !== NOGRAPH
          },
          graph: hasReport
            ? {
                id: 'main',
                nodeCount: 10,
                edgeCount: 1,
                decisionCount: 1,
                previewDark: id !== NOGRAPH,
                previewLight: id !== NOGRAPH
              }
            : undefined
        };
      }

      const artifacts = {
        [GOOD]: artifact(GOOD, true),
        [FAIL]: artifact(FAIL, false),
        [LEGACY]: artifact(LEGACY, false),
        [NOGRAPH]: artifact(NOGRAPH, true),
        [BLANK]: artifact(BLANK, false)
      };
      window.__rpc = {
        'html.artifact.read': async (input) => artifacts[input.artifactId],
        'html.artifact.original': async (input) => {
          if (input.artifactId === FAIL) throw new Error('original unavailable');
          return {
            artifactId: input.artifactId,
            title: 'Parity report',
            html: '<h1 id="original">Original</h1><script>window.__pwned=1<\\/script>',
            interactiveHtml: input.artifactId === BLANK ? '' : '<div id="prepared">interactive</div>',
            interactivePath: '/tmp/html-render-artifacts/' + input.artifactId + '/interactive.html'
          };
        },
        'html.artifact.asset': async (input) => ({
          artifactId: input.artifactId,
          asset: input.asset,
          mimeType: 'image/png',
          base64: PNG,
          byteLength: 68,
          width: 800,
          height: 400
        }),
        'html.artifact.report': async (input) => ({ artifactId: input.artifactId, report: artifacts[input.artifactId].report })
      };

      const theme = { colors: COLORS };
      const host = { id: 'host-1', label: 'Host' };
      const screens = [];
      window.__screens = screens;
      setNavigator((input) => screens.push(input));

      function props(platform, renderMode, id, compact) {
        return {
          agentId: 'agent-1',
          theme,
          host,
          layout: { compact: compact === true, platform },
          item: {
            type: 'plugin',
            kind: 'html-report-card',
            version: 1,
            data: {
              artifactId: id,
              title: 'Parity report',
              summary: 'Summary text',
              width: 728,
              height: 600,
              renderMode,
              hasReport: id === GOOD,
              measuredHeight: 300
            }
          },
          timestamp: new Date('2026-10-20T00:00:00.000Z')
        };
      }

      function mount(element) {
        const el = document.createElement('div');
        el.style.width = '760px';
        document.body.appendChild(el);
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const root = createRoot(el);
        root.render(React.createElement(QueryClientProvider, { client }, element));
        return { el, root };
      }
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      async function until(check, ms) {
        const deadline = Date.now() + ms;
        while (Date.now() < deadline) {
          try {
            if (check()) return;
          } catch (error) {}
          await wait(50);
        }
        throw new Error('condition timed out');
      }
      function click(label) {
        const button = Array.from(document.querySelectorAll('button')).find((entry) => entry.getAttribute('aria-label') === label);
        if (!button) throw new Error('missing button: ' + label);
        button.click();
      }
      const text = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim();
      const images = (el) => Array.from(el.querySelectorAll('img')).map((entry) => entry.getAttribute('src') || '');

      (async () => {
        const results = {};

        const native = mount(React.createElement(ReportCard, props('ios', 'auto', GOOD, true)));
        await until(() => text(native.el).includes('Coverage'), 5000);
        results.native = {
          text: text(native.el),
          iframes: native.el.querySelectorAll('iframe').length,
          images: images(native.el).map((src) => src.slice(0, 22)),
          buttons: Array.from(native.el.querySelectorAll('button')).map((entry) => entry.getAttribute('aria-label'))
        };
        click('View full report');
        results.nativeScreen = screens[0];
        native.root.unmount();
        native.el.remove();

        const live = mount(React.createElement(ReportCard, props('web', 'auto', GOOD, false)));
        await until(() => live.el.querySelector('iframe'), 5000);
        const frame = live.el.querySelector('iframe');
        results.live = {
          iframes: live.el.querySelectorAll('iframe').length,
          text: text(live.el),
          title: frame ? frame.getAttribute('title') : null,
          srcdoc: frame ? frame.getAttribute('srcdoc') || '' : ''
        };
        live.root.unmount();
        live.el.remove();

        const fallback = mount(React.createElement(ReportCard, props('web', 'auto', FAIL, false)));
        await until(() => text(fallback.el).includes('could not be read'), 6000);
        results.fallback = {
          iframes: fallback.el.querySelectorAll('iframe').length,
          images: fallback.el.querySelectorAll('img').length,
          text: text(fallback.el)
        };
        fallback.root.unmount();
        fallback.el.remove();

        const blank = mount(React.createElement(ReportCard, props('web', 'auto', BLANK, false)));
        await until(() => blank.el.querySelector('iframe'), 6500);
        results.blank = {
          iframes: blank.el.querySelectorAll('iframe').length,
          images: blank.el.querySelectorAll('img').length,
          text: text(blank.el)
        };
        blank.root.unmount();
        blank.el.remove();

        const staticReport = mount(React.createElement(ReportCard, props('web', 'static', GOOD, false)));
        await until(() => text(staticReport.el).includes('Coverage'), 5000);
        results.staticReport = {
          iframes: staticReport.el.querySelectorAll('iframe').length,
          text: text(staticReport.el),
          images: images(staticReport.el).length
        };
        staticReport.root.unmount();
        staticReport.el.remove();

        const legacy = mount(React.createElement(ReportCard, props('android', 'auto', LEGACY, true)));
        await until(() => text(legacy.el).includes('Copy file link'), 5000);
        results.legacy = {
          iframes: legacy.el.querySelectorAll('iframe').length,
          text: text(legacy.el),
          buttons: Array.from(legacy.el.querySelectorAll('button')).map((entry) => entry.getAttribute('aria-label')),
          images: images(legacy.el).length
        };
        legacy.root.unmount();
        legacy.el.remove();

        const screen = mount(
          React.createElement(ReportScreen, {
            params: { artifactId: GOOD, agentId: 'agent-1', title: 'Parity report' },
            theme,
            host,
            layout: { compact: false, platform: 'web' }
          })
        );
        await until(() => text(screen.el).includes('Parity contracts frozen'), 5000);
        results.screen = {
          tabs: Array.from(screen.el.querySelectorAll('[role="tab"]')).map((entry) => entry.getAttribute('aria-label')),
          overview: text(screen.el)
        };
        click('Show all 10 table rows');
        await until(() => text(screen.el).includes('Last table row'), 3000);
        results.tableExpanded = text(screen.el);
        click('Copy ts code');
        await wait(100);
        results.codeCopies = Array.from(window.__copies || []);

        click('Show Evidence tab');
        await until(() => screen.el.querySelector('a[href="https://example.com/repo"]'), 4000);
        results.evidence = {
          text: text(screen.el),
          links: Array.from(screen.el.querySelectorAll('a')).map((entry) => entry.getAttribute('href'))
        };

        click('Show Run / Usage tab');
        await until(() => text(screen.el).includes('Graph main:'), 5000);
        results.run = {
          text: text(screen.el),
          images: images(screen.el).map((src) => src.slice(0, 22))
        };
        click('Show all 12 graph items');
        await until(() => text(screen.el).includes('Node ten'), 3000);
        results.runExpanded = text(screen.el);

        click('Show Findings tab');
        await wait(150);
        results.findings = { text: text(screen.el) };

        click('Show Original tab');
        await until(() => text(screen.el).includes('window.__pwned=1'), 5000);
        results.original = {
          text: text(screen.el),
          h1: screen.el.querySelectorAll('h1').length,
          pwned: window.__pwned === undefined ? 'undefined' : String(window.__pwned)
        };
        click('Copy file link');
        await wait(100);
        results.fileCopies = Array.from(window.__copies || []);
        click('Show live HTML in a sandboxed frame');
        await until(() => screen.el.querySelector('iframe'), 4000);
        const screenFrame = screen.el.querySelector('iframe');
        results.screenLive = {
          iframes: screen.el.querySelectorAll('iframe').length,
          srcdoc: screenFrame ? screenFrame.getAttribute('srcdoc') || '' : ''
        };
        click('Hide live HTML');
        await wait(150);
        results.screenLive.afterHide = screen.el.querySelectorAll('iframe').length;

        screen.root.unmount();
        screen.el.remove();

        const noGraph = mount(
          React.createElement(ReportScreen, {
            params: { artifactId: NOGRAPH, agentId: 'agent-1', title: 'No graph raster' },
            theme,
            host,
            layout: { compact: true, platform: 'android' }
          })
        );
        await until(() => text(noGraph.el).includes('Parity contracts frozen'), 5000);
        click('Show Run / Usage tab');
        await until(() => text(noGraph.el).includes('Graph main:'), 5000);
        results.noGraph = {
          text: text(noGraph.el),
          images: images(noGraph.el).length,
          iframes: noGraph.el.querySelectorAll('iframe').length
        };
        noGraph.root.unmount();
        noGraph.el.remove();

        window.__result = results;
      })().catch((error) => {
        window.__result = { error: String(error), stack: error && error.stack };
      });
      `,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      aliasPlugin({
        "react-native": shim,
        "@getpaseo/plugin/client": shim,
        "@getpaseo/plugin/client/react-native": shim,
        "@getpaseo/plugin/client/ui": shim,
      }),
    ],
  });
  const js = bundle.outputFiles[0]!.text.replace(/<\/script/gi, "<\\/script");
  const result = (await browserResult(`<!doctype html><div id="root"></div><script>${js}</script>`)) as Record<
    string,
    any
  >;
  assert.equal(result.error, undefined, result.stack);

  assert.equal(result.native.iframes, 0, "native never mounts an iframe");
  assert.match(result.native.text, /Success/);
  assert.match(result.native.text, /Parity contracts frozen/, "native card leads with the outcome");
  assert.match(result.native.text, /Tests/);
  assert.match(result.native.text, /Coverage/);
  assert.doesNotMatch(result.native.text, /Hidden metric/, "card caps highlights at three");
  assert.ok(result.native.images.some((src: string) => src.startsWith("data:image/png")), "graph thumbnail");
  assert.ok(result.native.buttons.includes("View full report"));
  assert.deepEqual(result.nativeScreen, {
    screenId: "report",
    params: { artifactId: GOOD, agentId: "agent-1", title: "Parity report" },
  });

  assert.equal(result.live.iframes, 1, "live frame on web");
  assert.doesNotMatch(result.live.text, /Parity report|Summary text/, "live mode renders no card chrome");
  assert.match(result.live.text, /View report/, "a structured report stays reachable from the live frame");
  assert.equal(result.live.title, "Parity report", "iframe keeps the accessible title");
  assert.match(result.live.srcdoc, /id="prepared"/, "prepared interactive HTML is used");

  assert.equal(result.fallback.iframes, 0, "an unreadable page mounts no frame");
  assert.equal(result.fallback.images, 0, "no image fallback is ever substituted");
  assert.match(result.fallback.text, /The interactive page could not be read/);
  assert.doesNotMatch(result.fallback.text, /static preview/i);

  assert.equal(result.blank.iframes, 1, "a blank live page keeps its frame");
  assert.equal(result.blank.images, 0, "a blank live page is never replaced by an image");

  assert.equal(result.staticReport.iframes, 0, "explicit static never mounts a frame");
  assert.match(result.staticReport.text, /View report/);
  assert.match(result.staticReport.text, /Coverage/);

  assert.equal(result.legacy.iframes, 0);
  assert.match(result.legacy.text, /Legacy summary/, "the card shows content without repeating the title");
  assert.match(result.legacy.text, /Copy file link/);
  assert.ok(!result.legacy.buttons.includes("View full report"), "no structured report entry");

  assert.equal(result.screen.tabs.length, 5, "tabs stay bounded at five");
  assert.deepEqual(result.screen.tabs, [
    "Show Overview tab",
    "Show Findings tab",
    "Show Evidence tab",
    "Show Run / Usage tab",
    "Show Original tab",
  ]);
  assert.match(result.screen.overview, /Parity contracts frozen/);
  assert.match(result.screen.overview, /Overview block/);
  assert.match(result.screen.overview, /const answer = 42;/);
  assert.match(result.screen.overview, /Schema/);
  assert.doesNotMatch(result.screen.overview, /Last table row/, "large tables start with a bounded row window");
  assert.match(result.tableExpanded, /Last table row/, "table rows can be expanded explicitly");
  assert.ok(result.codeCopies.includes("const answer = 42;"), "code copy uses public copyText");

  assert.match(result.evidence.text, /Repository/);
  assert.match(result.evidence.text, /artifacts\/report.html/);
  assert.ok(result.evidence.links.includes("https://example.com/plan"));
  assert.ok(result.evidence.links.includes("https://example.com/repo"));

  assert.match(result.run.text, /Graph main: 10 nodes, 1 edges, 1 decisions/);
  assert.match(result.runExpanded, /Node ten/, "large graph lists expand in place");
  assert.match(result.run.text, /start/);
  assert.match(result.run.text, /end/);
  assert.match(result.run.text, /approved/);
  assert.match(result.run.text, /Input tokens: 1,200 \(measured\)/);
  assert.match(result.run.text, /Output tokens: ~800 \(estimated\)/);
  assert.match(result.run.text, /Cached input tokens: Unavailable/);
  assert.match(result.run.text, /Cost: Unavailable/);
  assert.match(result.run.text, /Duration: 5\.0 s \(measured\)/);
  assert.match(result.run.text, /model-a \(provider-a\)/);
  assert.match(result.run.text, /Copy improved prompt/);
  assert.ok(result.run.images.some((src: string) => src.startsWith("data:image/png")));
  assert.doesNotMatch(result.run.text, /\$0\.00/, "no fabricated zero cost");

  assert.match(result.findings.text, /First finding/);
  assert.match(result.findings.text, /Verify/);

  assert.equal(result.original.h1, 0, "original HTML is never parsed as markup");
  assert.equal(result.original.pwned, "undefined", "original script never runs");
  assert.match(result.original.text, /window\.__pwned=1/);
  assert.ok(result.fileCopies.includes(PATH), "copy file link copies the exact path");
  assert.equal(result.screenLive.iframes, 1);
  assert.match(result.screenLive.srcdoc, /id="prepared"/);
  assert.equal(result.screenLive.afterHide, 0);

  assert.match(result.noGraph.text, /Graph main: 10 nodes/);
  assert.match(result.noGraph.text, /start/);
  assert.match(result.noGraph.text, /approved/);
  assert.equal(result.noGraph.images, 0, "graph list renders without a raster thumbnail");
  assert.equal(result.noGraph.iframes, 0, "native never mounts a frame");


});
