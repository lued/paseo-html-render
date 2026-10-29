import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build, type Plugin } from "esbuild";
import { browserResult } from "./helpers/browser.ts";

// This exercises the mounted React adapter and real deadlines, not Android
// event delivery. Synthetic public native events must carry genuine protocol
// messages; neither ordinary shell progress nor load completion means ready.
test("native ready accepts complete transport from public progress/finish events, not shell load", { timeout: 45_000 }, async () => {
  const shim = join(dirname(fileURLToPath(import.meta.url)), "helpers", "native-shim.tsx");
  const aliases: Plugin = {
    name: "native-ready-host-fixture",
    setup(builder) {
      builder.onResolve({ filter: /^(react-native|@getpaseo\/plugin\/client\/ui)$/ }, () => ({ path: shim }));
    },
  };
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: "tsx",
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { UIManager } from 'react-native';
        import { NativeHtmlFrame } from './client/native-html-frame.tsx';
        import { DEFAULT_HTML_DOCUMENT_COLORS, readyMessage } from './shared/html-document.ts';
        const commands = [];
        UIManager.dispatchViewManagerCommand = (tag, command, args) => {
          commands.push({ command, message: JSON.parse(args[0]) });
        };
        // Replace only the raw native view in this browser fixture. Preserve the
        // public event callbacks/ref, without registering or simulating a WebView.
        const create = React.createElement;
        React.createElement = (type, props, ...children) => {
          if (type !== 'RNCWebView') return create(type, props, ...children);
          return create('div', {
            'data-native-fixture': '',
            ref: node => {
              props.ref.current = node;
              if (node) node.nativeProps = props;
            }
          });
        };
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        async function until(check) {
          const end = Date.now() + 4000;
          while (Date.now() < end) {
            if (check()) return;
            await wait(20);
          }
          throw new Error('native fixture did not mount/update');
        }
        async function mount(name) {
          const el = document.createElement('div');
          document.body.appendChild(el);
          const root = createRoot(el);
          root.render(create(NativeHtmlFrame, {
            artifactKey: name, title: name, html: '<p>Report</p>',
            theme: { colors: DEFAULT_HTML_DOCUMENT_COLORS.dark },
            requestedHeight: 400, platform: 'android', renderMode: 'auto'
          }));
          await until(() => el.querySelector('[data-native-fixture]'));
          const props = el.querySelector('[data-native-fixture]').nativeProps;
          const match = props.newSource.html.match(/var SESSION=("[a-f0-9]+")/);
          if (!match) throw new Error('native session missing from trusted shell');
          return { el, root, props, session: JSON.parse(match[1]) };
        }
        const url = item => 'about:blank#paseo-p2n=' + item.session + ',1,0,1,' + encodeURIComponent(JSON.stringify(readyMessage()));
        (async () => {
          const cases = [];
          try {
            const progress = await mount('progress'); cases.push(progress);
            const finish = await mount('finish'); cases.push(finish);
            const missing = await mount('missing'); cases.push(missing);
            if (typeof progress.props.onLoadingProgress !== 'function') throw new Error('progress callback is missing');
            progress.props.onLoadingProgress({ nativeEvent: { url: url(progress), progress: 1 } });
            finish.props.onLoadingFinish({ nativeEvent: { url: url(finish) } });
            // A repeated callback carries an already-completed message. It must
            // be acknowledged without re-delivery or poisoning assembly state.
            progress.props.onLoadingStart({ nativeEvent: { url: url(progress) } });
            missing.props.onLoadingProgress({ nativeEvent: { progress: 0 } });
            missing.props.onLoadingFinish({ nativeEvent: { url: 'about:blank' } });
            missing.props.onLoadingFinish({ nativeEvent: { url: 'about:blank' } });
            await until(() => !progress.el.textContent.includes('Loading interactive report') && !finish.el.textContent.includes('Loading interactive report'));
            await wait(8500);
            window.__result = {
              progress: progress.el.textContent,
              finish: finish.el.textContent,
              missing: missing.el.textContent,
              progressMounted: !!progress.el.querySelector('[data-native-fixture]'),
              finishMounted: !!finish.el.querySelector('[data-native-fixture]'),
              // A control-channel timeout must not tear down a frame that may
              // already be showing the report, so the view stays mounted.
              missingMounted: !!missing.el.querySelector('[data-native-fixture]'),
              acknowledgements: commands.filter(c => c.message.type === 'paseo-ack').map(c => ({
                session: c.message.session, mid: c.message.mid, seq: c.message.seq
              })),
              expectedSessions: [progress.session, finish.session],
              probes: commands.filter(c => c.message.type === 'paseo-ready-probe').map(c => c.message.session),
              missingSession: missing.session
            };
          } finally {
            for (const item of cases) { item.root.unmount(); item.el.remove(); }
          }
        })().catch(error => { window.__result = { error: String(error), stack: error.stack }; });
      `,
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [aliases],
  });
  const js = bundle.outputFiles[0]!.text.replace(/<\/script/gi, "<\\/script");
  const result = await browserResult(`<!doctype html><body><script>${js}</script>`) as Record<string, any>;
  assert.equal(result.error, undefined, result.stack ?? result.error);
  assert.equal(result.progressMounted, true);
  assert.equal(result.finishMounted, true);
  assert.doesNotMatch(result.progress + result.finish, /unavailable|Loading interactive report|handshake/i);
  assert.match(result.missing, /did not complete its ready handshake in time/);
  assert.match(result.missing, /Stage: no page messages/, "the timeout names the failed transport stage");
  assert.match(result.missing, /Counters: onMessage 0, fragment 0/, "the timeout reports safe transport counters");
  assert.equal(result.missingMounted, true, "a timeout keeps the WebView mounted behind the banner");
  assert.deepEqual(result.probes, [result.missingSession], "shell load requests ready at most once and never substitutes for it");
  assert.deepEqual(result.acknowledgements.map((ack: any) => [ack.mid, ack.seq]), [[1, 0], [1, 0], [1, 0]]);
  assert.deepEqual(result.acknowledgements.map((ack: any) => ack.session), [...result.expectedSessions, result.expectedSessions[0]]);
});
