import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build, type Plugin } from "esbuild";
import { browserResult } from "./helpers/browser.ts";

const ID = "a".repeat(32);
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function aliasPlugin(entries: Record<string, string>): Plugin {
  return {
    name: "test-alias",
    setup(build) {
      for (const [name, path] of Object.entries(entries)) {
        build.onResolve({ filter: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }, () => ({ path }));
      }
    },
  };
}

test("Android capability uses a registered native RNCWebView manager on the 0.12 public surface", { timeout: 60_000 }, async () => {
  const shim = join(dirname(fileURLToPath(import.meta.url)), "helpers", "native-shim.tsx");
  const legacy = join(dirname(fileURLToPath(import.meta.url)), "helpers", "native-shim-legacy.tsx");
  const bundle = await build({
    stdin: {
      contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      import { ReportCard } from './client/report-card.tsx';
      const ID = '${ID}';
      const PNG = '${PNG}';
      const COLORS = {
        surface0: '#101010', surface1: '#181818', surface2: '#222222', border: '#333333',
        foreground: '#eeeeee', foregroundMuted: '#a0a0a0', accent: '#66aaff',
        accentForeground: '#000000', statusSuccess: '#22cc88', statusWarning: '#ffaa33',
        statusDanger: '#ff5577'
      };
      const artifact = {
        artifactId: ID,
        title: 'Legacy host report',
        summary: 'A static card on the old public surface.',
        width: 728,
        height: 600,
        createdAt: '2026-10-27T00:00:00.000Z',
        preview: { mimeType: 'image/png', base64: PNG },
        measuredHeight: 300,
        hasReport: false,
        report: null,
        interactivePath: '/tmp/html-render-artifacts/' + ID + '/interactive.html',
        assets: { previewLight: true, graphDark: true, graphLight: true }
      };
      window.__originalCalls = 0;
      window.__rpc = {
        'html.artifact.read': async () => artifact,
        'html.artifact.original': async () => {
          window.__originalCalls += 1;
          return {
            artifactId: ID,
            title: 'Legacy host report',
            html: '<h1>Legacy inline</h1>',
            interactiveHtml: '<h1>Legacy inline</h1>',
            interactivePath: artifact.interactivePath
          };
        },
        'html.artifact.asset': async () => ({
          artifactId: ID,
          asset: 'preview',
          mimeType: 'image/png',
          base64: PNG,
          byteLength: 68,
          width: 1,
          height: 1
        }),
        'html.artifact.report': async () => ({ artifactId: ID, report: null })
      };
      const theme = { colors: COLORS };
      const host = { id: 'host-1', label: 'Host' };
      function props() {
        return {
          agentId: 'agent-1',
          theme,
          host,
          layout: { compact: true, platform: 'android' },
          item: {
            type: 'plugin',
            kind: 'html-report-card',
            version: 1,
            data: {
              artifactId: ID,
              title: 'Legacy host report',
              summary: 'A static card on the old public surface.',
              width: 728,
              height: 600,
              renderMode: 'auto',
              hasReport: false,
              measuredHeight: 300
            }
          },
          timestamp: new Date('2026-10-27T00:00:00.000Z')
        };
      }
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      async function until(check, ms) {
        const end = Date.now() + ms;
        while (Date.now() < end) {
          try { if (check()) return; } catch (error) {}
          await wait(50);
        }
        throw new Error('condition timed out');
      }
      function text(el) { return (el.textContent || '').replace(/\\s+/g, ' ').trim(); }
      async function renderCase(registered) {
        window.__nativeViewRegistered = registered;
        window.__originalCalls = 0;
        const el = document.createElement('div');
        document.body.appendChild(el);
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const root = createRoot(el);
        root.render(React.createElement(QueryClientProvider, { client }, React.createElement(ReportCard, props())));
        if (registered) {
          await until(() => el.querySelector('rncwebview') !== null, 5000);
        } else {
          await until(() => text(el).includes('no registered native WebView manager') && el.querySelector('img') !== null, 5000);
        }
        const out = {
          text: text(el),
          nativeTags: el.querySelectorAll('rncwebview').length,
          iframes: el.querySelectorAll('iframe').length,
          images: el.querySelectorAll('img').length,
          originalCalls: window.__originalCalls
        };
        root.unmount();
        el.remove();
        return out;
      }
      (async () => {
        const unregistered = await renderCase(false);
        const registered = await renderCase(true);
        window.__result = { unregistered, registered };
      })().catch((error) => { window.__result = { error: String(error), stack: error && error.stack }; });
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
        "react-native": legacy,
        "@getpaseo/plugin/client": shim,
        "@getpaseo/plugin/client/react-native": legacy,
        "@getpaseo/plugin/client/ui": legacy,
      }),
    ],
  });
  const js = bundle.outputFiles[0]!.text.replace(/<\/script/gi, "<\\/script");
  const result = (await browserResult(`<!doctype html><div id="root"></div><script>${js}</script>`)) as Record<string, any>;
  assert.equal(result.error, undefined, `${result.stack}\n${JSON.stringify(result)}`);
  assert.equal(result.unregistered.nativeTags, 0, "missing native registration must not mount the raw view");
  assert.equal(result.unregistered.iframes, 0, "the old host fallback is not an iframe");
  assert.match(result.unregistered.text, /no registered native WebView manager/);
  assert.ok(result.unregistered.images > 0, "the old host keeps its static preview");
  assert.equal(result.registered.nativeTags, 1, "a registered RNCWebView is selectable without DocumentFrame");
  assert.equal(result.registered.iframes, 0, "the registered route still never mounts an iframe");
  assert.ok(result.registered.originalCalls > 0, "the registered route fetches authorized original HTML");
  assert.doesNotMatch(result.registered.text, /no registered native WebView manager/);
});
