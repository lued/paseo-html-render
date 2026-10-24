/**
 * Autonomous end-to-end verification (`npm run verify:e2e`).
 *
 * Replaces the retired five-workspace manual QA canary. Every gate runs without
 * a human looking at a screen and writes evidence to
 * `~/.paseo/plugin-data/html-render/verification-<date>/`:
 *
 *   G1  real Chromium renderer + real artifact store (tools, privacy, bytes)
 *   G2  real ReportCard/HtmlFrame mounted in real Chromium with real artifacts
 *   G3  real stdio MCP adapter over the real bridge socket + history rebuild
 *   G4  cross-row deduplication capability probe (public SDK surface)
 *   G5  installed plugin registration and daemon identity
 *
 * `report.json` maps every gate to the stable PQ ids in
 * `docs/t3-parity-quality-matrix.md`.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { ArtifactStore } from "../../server/artifacts.ts";
import type { Authority } from "../../server/authority.ts";
import { startBridge, type Bridge } from "../../server/bridge.ts";
import { createRenderer, findChromiumExecutable } from "../../server/renderer.ts";
import { createHtmlTools } from "../../server/tools.ts";
import { decodeReportReference, encodeReportReference, transformTimelineToolCall } from "../../shared/recognize.ts";
import { parseReportModel } from "../../shared/report-model.ts";
import { browserResult } from "../helpers/browser.ts";
import {
  EVIDENCE_DIR,
  evidencePath,
  finishReport,
  gate,
  prepareEvidence,
  sha256,
  writeEvidence,
  writeEvidenceJson,
} from "../helpers/verify.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = join(HERE, "..", "..");
const WORKSPACE_ID = "wks_e2e";
const startedAt = new Date().toISOString();

const PAGE_HTML = [
  "<!doctype html><html><head><meta charset=\"utf-8\"></head>",
  "<body style=\"margin:0;padding:8px;font:16px/1.4 sans-serif\">",
  "<h1 id=\"headline\" style=\"margin:0\">Autonomous HTML</h1>",
  "<p id=\"script\">script did not run</p>",
  "<script>document.getElementById('script').textContent='script-ran:7'</script>",
  "</body></html>",
].join("");

const REPORT_JSON = parseReportModel({
  version: 1,
  outcome: { status: "success", headline: "Autonomous gate", detail: "Real components, real artifacts." },
  summary: "Rendered by the real card in real Chromium.",
  metrics: [{ label: "Gates", value: "5", tone: "good" }],
  blocks: [
    { kind: "heading", text: "Result" },
    { kind: "bullets", items: ["Chromium", "Artifacts", "Adapter"] },
  ],
});

before(prepareEvidence);

after(async () => {
  await finishReport(startedAt, {
    node: process.version,
    platform: process.platform,
    evidenceDir: EVIDENCE_DIR,
    pluginSource: SOURCE_ROOT,
  });
});

test("G1 renderer, tools and artifact store", { timeout: 180_000 }, async () => {
  await gate(
    { id: "G1", title: "real Chromium render + private artifact bytes", pq: ["PQ-003", "PQ-004", "PQ-010", "PQ-011", "PQ-022", "PQ-090"] },
    async () => {
      const workspace = await fs.mkdtemp(join(tmpdir(), "html-render-e2e-ws-"));
      const dataRoot = join(await fs.mkdtemp(join(tmpdir(), "html-render-e2e-data-")), "data");
      const store = new ArtifactStore(dataRoot);
      const renderer = createRenderer({ timeoutMs: 25_000, maxConcurrent: 1 });
      try {
        const tools = createHtmlTools({ renderer, store });
        const context = { workspaceId: WORKSPACE_ID, workspaceRoot: workspace, cwd: workspace };

        const preview = await tools.preview({ html: PAGE_HTML, width: 728 }, context);
        assert.ok(preview.contentHeight > 0, "preview measured content height");
        assert.equal(preview.width, 728);
        const png = Buffer.from(preview.screenshot.data, "base64");
        assert.equal(png.subarray(1, 4).toString("latin1"), "PNG");

        const published = await tools.publish(
          { html: PAGE_HTML, title: "Autonomous report", height: 600, summary: "e2e gate", report: REPORT_JSON },
          context,
        );
        const artifactId = published.htmlRender.artifactId;
        assert.match(artifactId, /^[0-9a-f]{32}$/);

        const { manifest, png: stored } = await store.readPreview(artifactId, WORKSPACE_ID);
        assert.equal(manifest.workspaceId, WORKSPACE_ID);
        assert.equal(stored.subarray(1, 4).toString("latin1"), "PNG");

        // Byte-exact original is preserved separately from the prepared copy.
        const original = await store.readOriginal(artifactId, WORKSPACE_ID);
        assert.equal(original.html, PAGE_HTML, "original.html is byte-exact");
        assert.equal(sha256(original.html), sha256(PAGE_HTML));

        const interactive = await store.readInteractive(artifactId, WORKSPACE_ID);
        assert.ok(interactive, "interactive.html exists");
        assert.match(interactive.html, /Content-Security-Policy/i);
        assert.match(interactive.html, /default-src 'none'/);
        assert.ok(!/src="https?:|href="https?:/.test(interactive.html), "no remote resources in the export");
        assert.ok(interactive.path.startsWith(dataRoot), "interactive path stays inside the private root");

        const report = await store.readReport(artifactId, WORKSPACE_ID);
        assert.equal(report.report?.outcome.headline, "Autonomous gate");

        // Privacy: 0700 directories, 0600 files.
        const dirMode = (await fs.stat(interactive.path)).mode & 0o777;
        assert.equal(dirMode, 0o600, "interactive.html is owner-only");
        const artifactDir = dirname(interactive.path);
        assert.equal((await fs.stat(artifactDir)).mode & 0o777, 0o700, "artifact directory is owner-only");
        assert.equal((await fs.stat(dataRoot)).mode & 0o777, 0o700, "data root is owner-only");

        // The adapter emits this marker text; rebuild the same reference here.
        const marker = encodeReportReference({
          artifactId,
          title: published.htmlRender.title,
          summary: published.summary ?? "",
          width: published.htmlRender.width,
          height: published.htmlRender.height,
        });
        const transformed = transformTimelineToolCall({
          name: "mcp__html_render__html_render",
          detail: { output: [{ type: "text", text: marker }] },
        });
        // The outer codemode row carries the same marker on Pi and must not
        // become a second card.
        assert.equal(
          transformTimelineToolCall({ name: "codemode", detail: { output: [{ type: "text", text: marker }] } }),
          undefined,
        );
        const card = decodeReportReference(marker);
        assert.equal(card?.artifactId, artifactId);
        assert.equal(transformed?.items[0]?.data.artifactId, artifactId);

        const previewPngPath = await writeEvidence("g1-preview.png", png);
        const exportPath = await writeEvidence("g1-interactive.html", interactive.html);
        const record = await writeEvidenceJson("g1-artifact.json", {
          artifactId,
          manifest,
          markerLength: marker.length,
          previewBytes: png.byteLength,
          originalSha256: sha256(original.html),
          interactiveSha256: sha256(interactive.html),
          previewPng: previewPngPath,
          interactiveHtml: exportPath,
        });
        return {
          detail: `preview ${preview.width}x${preview.contentHeight}, artifact ${artifactId}, private modes verified`,
          evidence: [record, previewPngPath, exportPath],
        };
      } finally {
        await renderer.close().catch(() => {});
        await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
      }
    },
  );
});

test("G2 mounted card in real Chromium", { timeout: 240_000 }, async () => {
  await gate(
    { id: "G2", title: "real ReportCard/HtmlFrame in Chromium", pq: ["PQ-024", "PQ-025", "PQ-026", "PQ-034", "PQ-036", "PQ-053", "PQ-054", "PQ-061", "PQ-064", "PQ-066"] },
    async () => {
      const workspace = await fs.mkdtemp(join(tmpdir(), "html-render-e2e-ws2-"));
      const dataRoot = join(await fs.mkdtemp(join(tmpdir(), "html-render-e2e-data2-")), "data");
      const store = new ArtifactStore(dataRoot);
      const renderer = createRenderer({ timeoutMs: 25_000, maxConcurrent: 1 });
      try {
        const tools = createHtmlTools({ renderer, store });
        const context = { workspaceId: WORKSPACE_ID, workspaceRoot: workspace, cwd: workspace };
        const published = await tools.publish(
          { html: PAGE_HTML, title: "Mounted report", height: 600, summary: "live frame", report: REPORT_JSON },
          context,
        );
        const artifactId = published.htmlRender.artifactId;

        // Build the same payloads the daemon RPC handlers build, from the real store.
        const { manifest, png } = await store.readPreview(artifactId, WORKSPACE_ID);
        const original = await store.readOriginal(artifactId, WORKSPACE_ID);
        const interactive = await store.readInteractive(artifactId, WORKSPACE_ID);
        const report = await store.readReport(artifactId, WORKSPACE_ID);
        const payload = {
          read: {
            artifactId,
            title: manifest.title,
            summary: manifest.summary,
            width: manifest.width,
            height: manifest.height,
            createdAt: manifest.createdAt,
            preview: { mimeType: "image/png", base64: png.toString("base64") },
            ...(manifest.measuredHeight === undefined ? {} : { measuredHeight: manifest.measuredHeight }),
            hasReport: true,
            report: report.report,
            ...(interactive === null ? {} : { interactivePath: interactive.path }),
            assets: { previewLight: manifest.themePreview?.light === true, graphDark: false, graphLight: false },
          },
          original: {
            artifactId,
            title: manifest.title,
            html: original.html,
            ...(interactive === null ? {} : { interactiveHtml: interactive.html, interactivePath: interactive.path }),
          },
          asset: {
            artifactId,
            asset: "preview",
            mimeType: "image/png",
            base64: png.toString("base64"),
            byteLength: png.byteLength,
            width: manifest.width,
            height: manifest.height,
          },
        };

        const shim = join(SOURCE_ROOT, "tests", "helpers", "native-shim.tsx");
        const aliases: Record<string, string> = {
          "react-native": shim,
          "@getpaseo/plugin/client": shim,
          "@getpaseo/plugin/client/ui": shim,
          "@getpaseo/plugin/client/react-native": shim,
        };
        const aliasPlugin = {
          name: "verify-alias",
          setup(buildApi: any) {
            for (const [name, path] of Object.entries(aliases)) {
              buildApi.onResolve({ filter: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }, () => ({ path }));
            }
          },
        };
        const bundle = await build({
          stdin: {
            contents: `
              import React from 'react';
              import { createRoot } from 'react-dom/client';
              import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
              import { ReportCard } from './client/report-card.tsx';
              import { setNavigator } from './client/surface.ts';
              setNavigator(() => {});

              const PAYLOAD = ${JSON.stringify(payload)};
              const COLORS_DARK = { surface0: '#101010', surface1: '#181818', surface2: '#222222', border: '#333333',
                foreground: '#eeeeee', foregroundMuted: '#a0a0a0', accent: '#66aaff', accentForeground: '#000000',
                statusSuccess: '#22cc88', statusWarning: '#ffaa33', statusDanger: '#ff5577' };
              const COLORS_LIGHT = { ...COLORS_DARK, surface0: '#ffffff', surface1: '#f5f5f5', surface2: '#eeeeee',
                border: '#dddddd', foreground: '#111111', foregroundMuted: '#555555' };
              const host = { id: 'host', label: 'Host' };
              window.__rpc = {
                'html.artifact.read': async (input) => {
                  if (input.artifactId === 'f'.repeat(32)) {
                    return { ...PAYLOAD.read, artifactId: 'f'.repeat(32), hasReport: false, report: null };
                  }
                  return PAYLOAD.read;
                },
                'html.artifact.original': async (input) => {
                  if (input.artifactId === 'f'.repeat(32)) throw new Error('interactive document unavailable');
                  return PAYLOAD.original;
                },
                'html.artifact.asset': async () => PAYLOAD.asset,
                'html.artifact.report': async () => ({ artifactId: PAYLOAD.read.artifactId, report: PAYLOAD.read.report })
              };
              const wait = ms => new Promise(r => setTimeout(r, ms));
              async function until(check, ms, label) {
                const end = Date.now() + ms;
                while (Date.now() < end) { try { if (check()) return; } catch (e) {} await wait(50); }
                const nodes = Array.from(document.querySelectorAll('body *')).map(n => n.tagName + ':' + ((n.textContent || '').trim().slice(0, 40))).slice(-25);
                throw new Error('timed out: ' + label + ' | dom=' + JSON.stringify(nodes) + ' | result=' + JSON.stringify(window.__result || null));
              }
              const text = el => (el.textContent || '').replace(/\\s+/g, ' ').trim();
              function mount(colors, platform, renderMode, id) {
                const el = document.createElement('div');
                el.style.width = '760px';
                document.body.appendChild(el);
                const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
                const root = createRoot(el);
                root.render(React.createElement(QueryClientProvider, { client },
                  React.createElement(ReportCard, {
                    agentId: 'agent-e2e', theme: { colors }, host,
                    layout: { compact: false, platform },
                    item: { type: 'plugin', kind: 'html-report-card', version: 1, data: {
                      artifactId: id, title: 'Mounted report', summary: 'live frame', width: 728, height: 600, renderMode, hasReport: true
                    } },
                    timestamp: new Date('2026-10-20T00:00:00.000Z')
                  })));
                return { el, root };
              }
              (async () => {
                const results = {};
                const live = mount(COLORS_DARK, 'web', 'auto', PAYLOAD.read.artifactId);
                await until(() => live.el.querySelector('iframe'), 8000, 'live iframe');
                const frame = live.el.querySelector('iframe');
                results.sandbox = frame.getAttribute('sandbox');
                results.allow = frame.getAttribute('allow');
                results.srcdoc = frame.getAttribute('srcdoc') || '';
                results.parentText = text(live.el);
                await until(() => parseFloat(frame.style.height) < 600, 8000, 'content height');
                results.height = parseFloat(frame.style.height);
                results.loading = frame.getAttribute('loading');
                results.inlineScript = (frame.getAttribute('srcdoc') || '').includes('script-ran');
                // Theme update must not reload or remount the frame.
                const beforeFrame = frame;
                const second = mount(COLORS_LIGHT, 'web', 'auto', PAYLOAD.read.artifactId);
                await until(() => second.el.querySelector('iframe'), 8000, 'light iframe');
                const lightFrame = second.el.querySelector('iframe');
                await wait(500);
                results.lightBackground = /--background:\\s*#ffffff/.test(lightFrame.getAttribute('srcdoc') || '');
                second.root.unmount(); second.el.remove();
                // Spoofed height messages from the parent must be ignored.
                window.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { height: 1900 } }, '*');
                await wait(150);
                results.heightAfterSpoof = parseFloat(frame.style.height);
                live.root.unmount(); live.el.remove();

                const native = mount(COLORS_DARK, 'ios', 'auto', PAYLOAD.read.artifactId);
                await until(() => text(native.el).includes('Autonomous gate'), 8000, 'native report');
                results.nativeIframes = native.el.querySelectorAll('iframe').length;
                results.nativeText = text(native.el);
                results.nativeReportEntry = text(native.el).includes('View report');
                native.root.unmount(); native.el.remove();

                const broken = mount(COLORS_DARK, 'web', 'auto', 'f'.repeat(32));
                await until(() => text(broken.el).includes('could not be read'), 8000, 'unreadable page');
                results.fallbackIframes = broken.el.querySelectorAll('iframe').length;
                results.fallbackImages = broken.el.querySelectorAll('img').length;
                broken.root.unmount(); broken.el.remove();

                // Leave the live card mounted so the evidence screenshot shows
                // the real rendering instead of an empty page.
                const shot = mount(COLORS_DARK, 'web', 'auto', PAYLOAD.read.artifactId);
                await until(() => shot.el.querySelector('iframe'), 8000, 'screenshot frame');
                await until(() => parseFloat(shot.el.querySelector('iframe').style.height) < 600, 8000, 'screenshot height');
                await wait(1200);
                window.__result = results;
              })().catch(error => { window.__result = { error: String(error), stack: error.stack }; });
            `,
            resolveDir: SOURCE_ROOT,
            loader: "tsx",
          },
          bundle: true,
          write: false,
          platform: "browser",
          format: "iife",
          jsx: "automatic",
          define: { "process.env.NODE_ENV": '"production"' },
          plugins: [aliasPlugin],
        });
        const js = bundle.outputFiles[0]!.text.replace(/<\/script/gi, "<\\/script");
        const screenshot = evidencePath("g2-mounted-card.png");
        const result = (await browserResult(
          `<!doctype html><html><body style="margin:0;background:#101010"><div id="root"></div><script>${js}</script></body></html>`,
          { screenshotPath: screenshot, viewport: { width: 800, height: 900 } },
        )) as Record<string, unknown>;
        assert.equal(result.error, undefined, String(result.stack));
        assert.equal(result.sandbox, "allow-scripts");
        assert.equal(result.allow, "fullscreen 'none'");
        assert.match(String(result.srcdoc), /Content-Security-Policy/i);
        assert.match(String(result.srcdoc), /Autonomous HTML/);
        assert.equal(result.inlineScript, true, "page script executes inside the frame");
        assert.equal(result.parentText, "View report", "live frame shows no chrome except the report entry point");
        // Lazy loading was removed: an offscreen frame never loaded in time and
        // the card wrongly degraded to an image.
        assert.equal(result.loading, null, "the live frame must load eagerly");
        assert.ok(Number(result.height) < 600 && Number(result.height) >= 80, `frame shrinks to content (${result.height})`);
        assert.equal(result.heightAfterSpoof, result.height, "parent-origin height spoof is ignored");
        assert.equal(result.lightBackground, true, "light theme tokens reach the document");
        assert.equal(result.nativeIframes, 0, "native never mounts an iframe");
        assert.match(String(result.nativeText), /Autonomous gate/, "native renders the structured report");
        assert.equal(result.nativeReportEntry, true, "native reaches the full report screen");
        assert.equal(result.fallbackIframes, 0, "an unreadable page mounts no frame");
        assert.equal(result.fallbackImages, 0, "no image fallback is ever substituted");

        // Static/native card is the plugin's own UI: capture it as visual evidence.
        const staticBundle = await build({
          stdin: {
            contents: `
              import React from 'react';
              import { createRoot } from 'react-dom/client';
              import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
              import { ReportCard } from './client/report-card.tsx';
              const PAYLOAD = ${JSON.stringify(payload)};
              const COLORS = { surface0: '#101010', surface1: '#181818', surface2: '#222222', border: '#333333',
                foreground: '#eeeeee', foregroundMuted: '#a0a0a0', accent: '#66aaff', accentForeground: '#000000',
                statusSuccess: '#22cc88', statusWarning: '#ffaa33', statusDanger: '#ff5577' };
              const host = { id: 'host', label: 'Host' };
              window.__rpc = {
                'html.artifact.read': async () => PAYLOAD.read,
                'html.artifact.original': async () => PAYLOAD.original,
                'html.artifact.asset': async () => PAYLOAD.asset,
                'html.artifact.report': async () => ({ artifactId: PAYLOAD.read.artifactId, report: PAYLOAD.read.report })
              };
              const wait = ms => new Promise(r => setTimeout(r, ms));
              const el = document.createElement('div');
              el.style.width = '760px';
              el.style.padding = '16px';
              el.style.background = '#101010';
              document.body.appendChild(el);
              const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
              createRoot(el).render(React.createElement(QueryClientProvider, { client },
                React.createElement(ReportCard, {
                  agentId: 'agent-e2e', theme: { colors: COLORS }, host,
                  layout: { compact: false, platform: 'web' },
                  item: { type: 'plugin', kind: 'html-report-card', version: 1, data: {
                    artifactId: PAYLOAD.read.artifactId, title: 'Mounted report', summary: 'live frame',
                    width: 728, height: 600, renderMode: 'static', hasReport: true
                  } },
                  timestamp: new Date('2026-10-20T00:00:00.000Z')
                })));
              (async () => {
                const started = Date.now();
                while (Date.now() - started < 8000) {
                  if ((el.textContent || '').includes('Autonomous gate')) break;
                  await wait(50);
                }
                await wait(800);
                window.__result = { text: (el.textContent || '').replace(/\\s+/g, ' ').trim() };
              })();
            `,
            resolveDir: SOURCE_ROOT,
            loader: "tsx",
          },
          bundle: true,
          write: false,
          platform: "browser",
          format: "iife",
          jsx: "automatic",
          define: { "process.env.NODE_ENV": '"production"' },
          plugins: [aliasPlugin],
        });
        const staticJs = staticBundle.outputFiles[0]!.text.replace(/<\/script/gi, "<\\/script");
        const staticScreenshot = evidencePath("g2-static-card.png");
        const staticResult = (await browserResult(
          `<!doctype html><html><body style="margin:0;background:#0b0b0b"><script>${staticJs}</script></body></html>`,
          { screenshotPath: staticScreenshot, viewport: { width: 800, height: 700 } },
        )) as { text?: string; error?: string };
        assert.equal(staticResult.error, undefined);
        assert.match(String(staticResult.text), /Autonomous gate/, "static card renders the report");

        const record = await writeEvidenceJson("g2-mounted.json", { artifactId, result, staticText: staticResult.text });
        return {
          detail: `iframe sandbox/theme/height/script/fallback verified; height ${result.height}px; static card captured`,
          evidence: [record, screenshot, staticScreenshot],
        };
      } finally {
        await renderer.close().catch(() => {});
        await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
      }
    },
  );
});

class Adapter {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

  constructor(adapterPath: string, env: Record<string, string>) {
    this.child = spawn(process.execPath, [adapterPath], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.onData(chunk));
    this.child.stderr.resume();
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) {
        const message = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown };
        const entry = message.id === undefined ? undefined : this.pending.get(message.id);
        if (entry && message.id !== undefined) {
          this.pending.delete(message.id);
          if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
          else entry.resolve(message.result);
        }
      }
      newline = this.buffer.indexOf("\n");
    }
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`adapter did not answer ${method}`)); }, 90_000);
      timer.unref?.();
      this.pending.set(id, { resolve, reject });
    });
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return promise;
  }

  notify(method: string): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  }

  close(): void {
    this.child.kill();
  }
}

test("G3 real MCP adapter and history rebuild", { timeout: 180_000 }, async () => {
  await gate(
    { id: "G3", title: "stdio MCP adapter, marker and history rebuild", pq: ["PQ-003", "PQ-004", "PQ-018", "PQ-131"] },
    async () => {
      const workspace = await fs.mkdtemp(join(tmpdir(), "html-render-e2e-ws3-"));
      const dataRoot = join(await fs.mkdtemp(join(tmpdir(), "html-render-e2e-data3-")), "data");
      const store = new ArtifactStore(dataRoot);
      const renderer = createRenderer({ timeoutMs: 25_000, maxConcurrent: 1 });
      const tools = createHtmlTools({ renderer, store });
      const authority: Authority = {
        async workspaceForCwd(cwd: string) {
          return cwd === workspace
            ? { workspaceId: WORKSPACE_ID, root: workspace, workspaceIds: [WORKSPACE_ID] }
            : null;
        },
        async workspaceForAgent() {
          return WORKSPACE_ID;
        },
        async workspaceForAgentOwnership() {
          return { workspaceId: WORKSPACE_ID, root: workspace, workspaceIds: [WORKSPACE_ID] };
        },
      };
      let bridge: Bridge | null = null;
      let adapter: Adapter | null = null;
      try {
        bridge = await startBridge({ dataRoot, tools, authority, onLog: () => {} }, randomBytes(32).toString("hex"));
        adapter = new Adapter(bridge.adapterPath, {
          PASEO_HTML_RENDER_BRIDGE: bridge.socketPath,
          PASEO_HTML_RENDER_TOKEN: bridge.token,
          PASEO_HTML_RENDER_CWD: workspace,
        });
        const init = (await adapter.request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "verify-e2e", version: "1" },
        })) as { serverInfo: { name: string } };
        assert.equal(init.serverInfo.name, "html-render");
        adapter.notify("notifications/initialized");
        const list = (await adapter.request("tools/list", {})) as { tools: Array<{ name: string }> };
        assert.deepEqual(list.tools.map((tool) => tool.name).sort(), ["html_preview", "html_render"]);

        const preview = (await adapter.request("tools/call", {
          name: "html_preview",
          arguments: { html: PAGE_HTML, width: 728 },
        })) as { content: Array<{ type: string; text?: string }>; isError?: boolean };
        assert.notEqual(preview.isError, true);
        const previewText = preview.content.map((entry) => entry.text ?? "").join("\n");
        assert.match(previewText, /contentHeight/);

        const rendered = (await adapter.request("tools/call", {
          name: "html_render",
          arguments: { html: PAGE_HTML, title: "Adapter report", height: 480, summary: "via MCP" },
        })) as { content: Array<{ type: string; text?: string }>; isError?: boolean };
        assert.notEqual(rendered.isError, true);
        const text = rendered.content.map((entry) => entry.text ?? "").join("\n");
        const decoded = decodeReportReference(text);
        assert.ok(decoded, "tool result carries the persisted marker");
        assert.equal(decoded.title, "Adapter report");

        // History reload: the provider stores a nested codemode row around the
        // tool result. One row must reconstruct exactly one card, twice.
        const row = { type: "codemode", output: [{ type: "text", text }] };
        const rowName = "mcp__html_render__html_render";
        const first = transformTimelineToolCall({ name: rowName, detail: row });
        const serialized = JSON.stringify({ name: rowName, detail: row });
        const second = transformTimelineToolCall({ name: rowName, detail: JSON.parse(serialized) });
        assert.equal(first?.items.length, 1);
        assert.deepEqual(first, second, "reload after serialization is stable");
        assert.equal(first?.items[0]?.data.artifactId, decoded.artifactId);

        const record = await writeEvidenceJson("g3-adapter.json", {
          serverInfo: init.serverInfo,
          tools: list.tools.map((tool) => tool.name),
          markerLength: text.length,
          artifactId: decoded.artifactId,
          replayedCard: first?.items[0]?.data,
        });
        return { detail: `adapter published ${decoded.artifactId}; history rebuild stable`, evidence: [record] };
      } finally {
        adapter?.close();
        await bridge?.close().catch(() => {});
        await renderer.close().catch(() => {});
        await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
      }
    },
  );
});

test("G4 duplicate-row suppression", { timeout: 60_000 }, async () => {
  await gate(
    { id: "G4", title: "outer wrapper row does not duplicate the card", pq: ["PQ-019"] },
    async () => {
      const marker = encodeReportReference({
        artifactId: "a".repeat(32),
        title: "Dedupe",
        summary: "",
        width: 728,
        height: 400,
      });
      // Pi persists the same marker in the outer `codemode` row and the inner
      // MCP row. Only the inner row may become a card.
      const rows = [
        { name: "codemode", detail: { output: [{ type: "text", text: marker }] } },
        { name: "mcp__html_render__html_render", detail: { output: [{ type: "text", text: marker }] } },
      ];
      const cards = rows
        .map((row) => transformTimelineToolCall(row))
        .filter((value) => value !== undefined);
      assert.equal(cards.length, 1, "one artifact yields exactly one card for this row set");

      // The public SDK transformer is still item-scoped: a marker-bearing row
      // that is neither the wrapper nor the tool itself cannot be suppressed.
      const contracts = await fs.readFile(
        join(SOURCE_ROOT, "node_modules", "@getpaseo", "plugin", "dist", "client", "contracts.d.ts"),
        "utf8",
      );
      const start = contracts.lastIndexOf("export type PluginTimelineTransformerContribution");
      assert.ok(start !== -1, "transformer contract is present");
      const body = contracts.slice(start, start + 1200);
      const itemScoped = /transform\(input:\s*\{\s*item:\s*Extract</.test(body);
      const record = await writeEvidenceJson("g4-dedupe.json", {
        markerRows: rows.map((row) => row.name),
        cards: cards.length,
        transformerContract: itemScoped ? "item-scoped" : "batch-capable",
        residual:
          "A provider that only exposes a generic wrapper row, or that duplicates the marker in another tool row, still cannot be deduplicated by a per-item transformer.",
      });
      return {
        detail: `wrapper+tool rows collapse to ${cards.length} card; transformer remains item-scoped`,
        evidence: [record],
      };
    },
  );
});

test("G5 installed plugin registration", { timeout: 120_000 }, async () => {
  await gate(
    { id: "G5", title: "installed plugin, daemon and registration", pq: ["PQ-126", "PQ-133"] },
    async () => {
      const output = await runPaseo(["plugin", "ls", "--json"]);
      const plugins = JSON.parse(output) as Array<{ id: string; status: string; enabled: boolean }>;
      const ids = plugins.map((plugin) => plugin.id).sort();
      const status = JSON.parse(await runPaseo(["status", "--json"])) as { pid?: number; serverId?: string };
      // Unrelated third-party plugins are allowed; what matters is that this
      // plugin is installed, running, and that no retired identity survived.
      const html = plugins.find((plugin) => plugin.id === "html-render");
      // A Chromium that html-render can actually launch is the real requirement.
      // Which plugin or app provides it is the host's business: this plugin must
      // not depend on a second plugin being installed.
      const chromium = findChromiumExecutable();
      const record = await writeEvidenceJson("g5-plugins.json", {
        plugins,
        daemonPid: status.pid,
        serverId: status.serverId,
        chromium,
      });
      assert.equal(html?.enabled, true, "html-render is enabled");
      assert.equal(html?.status, "running", "html-render is running");
      assert.ok(
        chromium,
        "no sandbox-capable Chromium is discoverable: set PASEO_HTML_RENDER_CHROMIUM, install a Chromium browser, or keep a Playwright browser cache",
      );
      assert.ok(
        !ids.some((id) => id.includes("-qa") || id.includes("html-render-v2")),
        `retired canary identity is still registered: ${ids.join(",")}`,
      );
      return {
        detail: `html-render running; chromium ${chromium}; registered: ${ids.join(", ")}`,
        evidence: [record],
      };
    },
  );
});

test("G6 real hosted client timeline and file preview", { timeout: 300_000 }, async () => {
  await gate(
    { id: "G6", title: "hosted web client timeline and file preview", pq: ["PQ-016", "PQ-017", "PQ-024", "PQ-025", "PQ-126", "PQ-132"] },
    async () => {
      if (process.env.PASEO_E2E_CLIENT === "0") {
        return { status: "unavailable" as const, detail: "PASEO_E2E_CLIENT=0: hosted client capture disabled for this run" };
      }
      // The hosted client needs outbound network. A machine without it is not
      // evidence either way, so the gate reports `unavailable`, never a pass.
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        const probe = await fetch("https://app.paseo.sh/", { signal: controller.signal, redirect: "manual" })
          .finally(() => clearTimeout(timer));
        assert.ok(probe.status < 500, `hosted client responded ${probe.status}`);
      } catch (error) {
        return {
          status: "unavailable" as const,
          detail: `hosted client unreachable (${error instanceof Error ? error.message : String(error)}): no real-client evidence this run`,
        };
      }
      let created: string | null = null;
      if (!process.env.PASEO_E2E_AGENT) {
        try {
          created = await createAcceptanceAgent();
        } catch (error) {
          return {
            status: "unavailable" as const,
            detail: `could not create the acceptance agent (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`,
          };
        }
        const logs = await runPaseo(["logs", created], 90_000).catch(() => "");
        const called = /html_render/.test(logs);
        const rendered = /interactive\.html|[0-9a-f]{32}/.test(logs);
        const refusal = /not part of an open Paseo workspace|render_failed|invalid_input|denied/i.test(logs);
        if (!rendered) {
          await runPaseo(["archive", created]).catch(() => "");
          if (called && refusal) {
            assert.fail(`the render tool refused: ${logs.slice(-600)}`);
          }
          // No tool call at all: provider/model trouble, not plugin evidence.
          return {
            status: "unavailable" as const,
            detail: `acceptance agent produced no render (provider/model failure): ${logs.slice(-300).replaceAll("\n", " ")}`,
          };
        }
      }
      const agentId = process.env.PASEO_E2E_AGENT ?? created;
      assert.ok(agentId, "an acceptance agent id is available");
      try {
        const script = join(SOURCE_ROOT, "scripts", "e2e-client.mjs");
        const output = await run(
          process.execPath,
          [script, "--agent", agentId, "--out", EVIDENCE_DIR, "--title", process.env.PASEO_E2E_TITLE ?? "html-render verify e2e"],
          280_000,
        );
        const report = JSON.parse(await fs.readFile(evidencePath("g6-client.json"), "utf8")) as {
          errors: string[];
          timeline: { frames: Array<{ sandbox: string | null; allow: string | null; height: string; hasCsp: boolean; hasContent: boolean }> };
          filePreview: { frames: Array<{ sandbox: string | null; hasCsp: boolean }> };
        };
        assert.deepEqual(report.errors, [], "client capture reported no errors");
        assert.equal(report.timeline.frames.length, 1, `expected exactly one inline card, saw ${report.timeline.frames.length}`);
        const frame = report.timeline.frames[0]!;
        assert.equal(frame.sandbox, "allow-scripts");
        assert.equal(frame.allow, "fullscreen 'none'");
        assert.equal(frame.hasCsp, true, "frame document carries the CSP");
        assert.equal(frame.hasContent, true, "frame document carries the rendered page");
        assert.ok(Number.parseFloat(frame.height) > 0, "frame has a measured height");
        assert.ok(report.filePreview.frames.length > 1, "file link opened a second sandboxed frame");
        assert.ok(report.filePreview.frames.some((entry) => entry.hasCsp), "file preview enforces its CSP");
        return {
          detail: `one inline card (${frame.height}) and the HTML file preview verified in the hosted client; ${output.trim().slice(-200)}`,
          evidence: [evidencePath("g6-client.json"), evidencePath("g6-timeline.png"), evidencePath("g6-file-preview.png")],
        };
      } finally {
        if (created) await runPaseo(["archive", created]).catch(() => "");
      }
    },
  );
});

const ACCEPTANCE_HTML = "<!doctype html><html><body style='margin:0;font:20px sans-serif;background:#101020;color:#eee'><h1 id='ok'>CLIENT ACCEPTANCE</h1><p>rendered inline by the html-render plugin</p><script>document.title='ran'<\/script></body></html>";

/** Creates a real agent that calls `html_render` through the injected MCP server. */
async function createAcceptanceAgent(): Promise<string> {
  const provider = process.env.PASEO_E2E_PROVIDER ?? "pi";
  const model = process.env.PASEO_E2E_MODEL ?? "ocx/opencode-go/deepseek-v4.1-flash";
  const thinking = process.env.PASEO_E2E_THINKING ?? "high";
  const prompt = [
    "Call the html_render MCP tool exactly once. Arguments:",
    `title="Client acceptance", height=420, html=${JSON.stringify(ACCEPTANCE_HTML)}.`,
    "Do not call any other tool. In your final reply, copy the exact Markdown link",
    "the tool asked for, in the form [Open interactive report](<absolute path from the tool result>),",
    "on its own line, followed by the artifactId.",
  ].join(" ");
  const output = await runPaseo([
    "run", "--json", "--provider", provider, "--model", model, "--thinking", thinking,
    "--title", "html-render verify e2e", "--wait-timeout", "3m", prompt,
  ], 260_000);
  const parsed = JSON.parse(output.slice(output.indexOf("{"))) as { agentId?: string };
  assert.ok(parsed.agentId, "paseo run returned an agent id");
  return parsed.agentId;
}

function run(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: SOURCE_ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { out += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { err += chunk; });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${command} timed out`)); }, timeoutMs);
    timer.unref?.();
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${command} exited ${code}: ${err.slice(0, 600)}`));
    });
  });
}

async function runPaseo(args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["paseo", ...args], { cwd: SOURCE_ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { out += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { err += chunk; });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`paseo ${args.join(" ")} timed out`)); }, timeoutMs);
    timer.unref?.();
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`paseo ${args.join(" ")} exited ${code}: ${err.slice(0, 500)}`));
    });
  });
}
