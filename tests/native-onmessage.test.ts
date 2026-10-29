import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build, type Plugin } from "esbuild";
import { browserResult } from "./helpers/browser.ts";
import {
  NATIVE_MAX_CHUNK_CHARS,
  NATIVE_MAX_TITLE_CHARS,
  NATIVE_TITLE_PREFIX,
} from "../client/native-html-protocol.ts";

// Primary page->native channel: the real RNCWebView `onMessage` event shape
// (`{nativeEvent:{data}}`) carrying the trusted shell's chunk envelope. These
// tests mount the real adapter in headless Chromium and hand it the exact event
// Android delivers. The fragment callbacks remain supported as the fallback.

const FIXTURE = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { UIManager } from 'react-native';
import { NativeHtmlFrame } from './client/native-html-frame.tsx';
import { DEFAULT_HTML_DOCUMENT_COLORS, readyMessage } from './shared/html-document.ts';

const create = React.createElement;
const commands = [];
const links = [];
const images = [];
UIManager.dispatchViewManagerCommand = (tag, command, args) => {
  commands.push({ command, message: JSON.parse(args[0]) });
};
// Replace only the raw native view in this browser fixture. Public event
// callbacks, ref, props and the bridge path stay exactly as the host passes them.
React.createElement = (type, props, ...children) => {
  if (type !== 'RNCWebView') return create(type, props, ...children);
  return create('div', {
    'data-native-fixture': '',
    ref: node => {
      if (!node) return;
      node.nativeProps = props;
      window.__lastNativeProps = props;
    }
  });
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, ms) {
  const end = Date.now() + (ms || 4000);
  while (Date.now() < end) {
    if (check()) return;
    await wait(20);
  }
  throw new Error('native fixture did not update');
}
function text(el) { return (el.textContent || '').replace(/\\s+/g, ' ').trim(); }
function latest(item) {
  const node = item.el.querySelector('[data-native-fixture]');
  if (!node) throw new Error('native view is not mounted');
  return node.nativeProps;
}
function mount(name, overrides) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  const props = {
    artifactKey: name,
    title: name,
    html: '<p>Report</p>',
    theme: { colors: DEFAULT_HTML_DOCUMENT_COLORS.dark },
    requestedHeight: 400,
    platform: 'android',
    renderMode: 'auto',
    onOpenLink: (url, modifiers) => links.push({ url, modifiers }),
    onOpenImage: image => images.push(image),
    ...(overrides || {})
  };
  root.render(create(NativeHtmlFrame, props));
  return { el, root, props };
}
async function session(item) {
  await until(() => item.el.querySelector('[data-native-fixture]'));
  const html = latest(item).newSource.html;
  const match = html.match(/var SESSION=("[a-f0-9]+")/);
  if (!match) throw new Error('native session missing from trusted shell');
  return JSON.parse(match[1]);
}
function encodeMessage(message) { return encodeURIComponent(JSON.stringify(message)); }
function envelopeData(sessionId, data, messageId, sequence, total) {
  return JSON.stringify({
    type: 'paseo-p2n',
    session: sessionId,
    mid: messageId || 1,
    seq: sequence || 0,
    total: total || 1,
    data: data
  });
}
function envelope(sessionId, message, messageId, sequence, total) {
  return envelopeData(sessionId, encodeMessage(message), messageId, sequence, total);
}
function emit(props, payload) { props.onMessage({ nativeEvent: { data: payload } }); }
function fragment(sessionId, message, messageId, sequence, total) {
  return 'about:blank#paseo-p2n=' + sessionId + ',' + (messageId || 1) + ',' + (sequence || 0) + ',' + (total || 1) + ',' + encodeURIComponent(JSON.stringify(message));
}
const TITLE_CHUNK = ${NATIVE_MAX_CHUNK_CHARS};
function titleChunks(sessionId, message, messageId) {
  const encoded = encodeMessage(message);
  const total = Math.max(1, Math.ceil(encoded.length / TITLE_CHUNK));
  const out = [];
  for (let index = 0; index < total; index += 1) {
    out.push('${NATIVE_TITLE_PREFIX}' + sessionId + ',' + (messageId || 1) + ',' + index + ',' + total + ',' + encoded.slice(index * TITLE_CHUNK, (index + 1) * TITLE_CHUNK));
  }
  return out;
}
function title(sessionId, message, messageId) { return titleChunks(sessionId, message, messageId)[0]; }
// Android reports the renderer's stored data: URL for every commit of an html
// source, so a real loading event can carry a huge fragment-free URL.
function rewrittenDataUrl() { return 'data:text/html;charset=utf-8;base64,' + 'A'.repeat(70000); }
function acks() { return commands.filter(c => c.message.type === 'paseo-ack'); }
function probes() { return commands.filter(c => c.message.type === 'paseo-ready-probe'); }
`;

async function run(body: string, timeout = 60_000): Promise<Record<string, any>> {
  const shim = join(dirname(fileURLToPath(import.meta.url)), "helpers", "native-shim.tsx");
  const aliases: Plugin = {
    name: "native-onmessage-host-fixture",
    setup(builder) {
      builder.onResolve({ filter: /^(react-native|@getpaseo\/plugin\/client\/ui)$/ }, () => ({ path: shim }));
    },
  };
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: "tsx",
      contents: `${FIXTURE}\n${body}`,
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
  assert.equal(result.error, undefined, `${result.stack ?? result.error}\n${JSON.stringify(result)}`);
  return result;
}

test("onMessage is the primary channel: a real bridge chunk completes ready once", { timeout: 60_000 }, async () => {
  const result = await run(`
(async () => {
  const item = mount('bridge-primary');
  const sessionId = await session(item);
  const props = latest(item);
  const ready = readyMessage();
  emit(props, envelope(sessionId, ready));
  await until(() => text(item.el).indexOf('Loading interactive report') < 0);
  const first = acks().map(c => [c.message.mid, c.message.seq]);
  // The same chunk replayed through the fragment fallback is acknowledged and
  // not applied twice.
  latest(item).onLoadingProgress({ nativeEvent: { url: fragment(sessionId, ready) } });
  // Foreign, malformed and another mount's traffic must not fail the channel.
  const current = latest(item);
  current.onMessage({});
  current.onMessage({ nativeEvent: {} });
  current.onMessage({ nativeEvent: { data: 'not json' } });
  current.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'paseo-ack', mid: 1 }) } });
  current.onMessage({ nativeEvent: { data: envelope('ffffffffffffffff', ready) } });
  await wait(300);
  window.__result = {
    messagingEnabled: props.messagingEnabled,
    mounted: !!item.el.querySelector('[data-native-fixture]'),
    bodyText: text(item.el),
    acknowledgements: acks().map(c => [c.message.mid, c.message.seq]),
    ackSessionsMatch: acks().every(c => c.message.session === sessionId),
    probes: probes().length,
    firstAcknowledgement: first
  };
  item.root.unmount();
  item.el.remove();
})().catch(error => { window.__result = { error: String(error), stack: error && error.stack }; });
`);
  assert.equal(result.messagingEnabled, true, "the trusted shell enables the bridge");
  assert.equal(result.mounted, true);
  assert.deepEqual(result.firstAcknowledgement, [[1, 0]]);
  assert.deepEqual(result.acknowledgements, [[1, 0], [1, 0]], "the fallback duplicate is acked, not re-delivered");
  assert.equal(result.ackSessionsMatch, true, "acks carry this mount's session");
  assert.equal(result.probes, 0, "no load event fired, so no probe was needed");
  assert.doesNotMatch(result.bodyText, /unavailable|Loading interactive report|handshake/i);
});

test("a report that renders stays mounted behind a non-destructive banner on timeout", { timeout: 60_000 }, async () => {
  // Three idle mounts on the same page, each starved differently, then one
  // shared 8.5 s wait: the banner must name the stage and never unmount.
  const result = await run(`
(async () => {
  const silent = mount('silent');
  const silentSession = await session(silent);

  const heightOnly = mount('height-only');
  const heightSession = await session(heightOnly);
  emit(latest(heightOnly), envelope(heightSession, { jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { height: 640 } }));

  const partial = mount('partial');
  const partialSession = await session(partial);
  const huge = encodeMessage({ jsonrpc: '2.0', method: 'ui/open-image', params: { src: 'data:image/png;base64,' + 'A'.repeat(70000), name: 'huge' } });
  const hugeTotal = Math.ceil(huge.length / TITLE_CHUNK);
  if (hugeTotal < 2) throw new Error('partial fixture needs more than one chunk');
  emit(latest(partial), envelopeData(partialSession, huge.slice(0, TITLE_CHUNK), 1, 0, hugeTotal));
  // Loading finish is not readiness; it only asks the page for a genuine ready.
  latest(partial).onLoadingFinish({ nativeEvent: { url: 'about:blank' } });

  await wait(8600);
  const describe = item => ({
    bodyText: text(item.el),
    mounted: !!item.el.querySelector('[data-native-fixture]'),
    loading: text(item.el).indexOf('Loading interactive report') >= 0
  });
  window.__result = {
    silent: describe(silent),
    heightOnly: describe(heightOnly),
    partial: describe(partial),
    probes: probes().length,
    probeSessions: probes().map(c => c.message.session),
    sessions: [silentSession, heightSession, partialSession]
  };
  for (const item of [silent, heightOnly, partial]) { item.root.unmount(); item.el.remove(); }
})().catch(error => { window.__result = { error: String(error), stack: error && error.stack }; });
`);
  for (const [name, stage] of [
    ["silent", "no page messages"],
    ["heightOnly", "chunks without ready"],
    ["partial", "probe unanswered"],
  ] as const) {
    const item = result[name];
    assert.equal(item.mounted, true, `${name}: the WebView must stay mounted`);
    assert.equal(item.loading, false, `${name}: the loading overlay must not hide the report`);
    assert.match(item.bodyText, /did not complete its ready handshake in time/, `${name}: deadline named`);
    assert.match(item.bodyText, new RegExp(`Stage: ${stage}`), `${name}: named stage`);
    assert.match(item.bodyText, /Counters: onMessage \d+, fragment \d+, chunks \d+, messages \d+, probes \d+, rejected \d+/, `${name}: safe counters`);
    assert.match(item.bodyText, /Retry/, `${name}: explicit retry stays available`);
    assert.doesNotMatch(item.bodyText, /https?:|data:image|#paseo-p2n/, `${name}: no payload or URL leaks into the banner`);
  }
  assert.match(result.heightOnly.bodyText, /Counters: onMessage 1, fragment 0, chunks 1, messages 1, probes 0, rejected 0/);
  assert.match(result.partial.bodyText, /Counters: onMessage 1, fragment 0, chunks 1, messages 0, probes 1, rejected 0/);
  assert.match(result.silent.bodyText, /Counters: onMessage 0, fragment 0, chunks 0, messages 0, probes 0, rejected 0/);
  assert.deepEqual(result.probeSessions, [result.sessions[2]], "only the finished load asked for a ready");
});

test("a rejected bridge chunk reports the failure without unmounting the frame", { timeout: 60_000 }, async () => {
  const result = await run(`
(async () => {
  const item = mount('rejected');
  const sessionId = await session(item);
  emit(latest(item), envelope(sessionId, readyMessage()));
  await until(() => text(item.el).indexOf('Loading interactive report') < 0);
  // A well-formed envelope that claims our type but breaks the shared bounds.
  emit(latest(item), JSON.stringify({ type: 'paseo-p2n', session: sessionId, mid: 0, seq: 0, total: 1, data: 'AAAA' }));
  await wait(200);
  window.__result = {
    mounted: !!item.el.querySelector('[data-native-fixture]'),
    bodyText: text(item.el),
    ready: text(item.el).indexOf('Loading interactive report') < 0
  };
  item.root.unmount();
  item.el.remove();
})().catch(error => { window.__result = { error: String(error), stack: error && error.stack }; });
`);
  assert.equal(result.mounted, true, "a transport rejection is not a reason to drop a rendered report");
  assert.match(result.bodyText, /transport rejected data: transport message id is out of range/);
  assert.match(result.bodyText, /Retry/);
});

test("theme, links, images and height still work over onMessage", { timeout: 60_000 }, async () => {
  const result = await run(`
(async () => {
  const item = mount('interactive', { requestedHeight: 1200 });
  const sessionId = await session(item);
  emit(latest(item), envelope(sessionId, readyMessage()));
  await until(() => text(item.el).indexOf('Loading interactive report') < 0);
  emit(latest(item), envelope(sessionId, { jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { height: 812 } }, 2));
  emit(latest(item), envelope(sessionId, { jsonrpc: '2.0', id: 'paseo-link-1', method: 'ui/open-link', params: { url: 'https://example.com/', metaKey: false, ctrlKey: false } }, 3));
  emit(latest(item), envelope(sessionId, { jsonrpc: '2.0', method: 'ui/open-image', params: { src: 'data:image/png;base64,AAAA', name: 'shot' } }, 4));
  await until(() => links.length === 1 && images.length === 1);
  await wait(60);
  const frameNode = item.el.firstElementChild.lastElementChild;
  const heightAfter = frameNode ? frameNode.style.height : null;
  // Theme is an in-place message, never a remount: render the light palette.
  item.root.render(create(NativeHtmlFrame, Object.assign({}, item.props, { theme: { colors: DEFAULT_HTML_DOCUMENT_COLORS.light } })));
  await until(() => commands.some(c => c.message.type === 'paseo-theme'));
  const theme = commands.filter(c => c.message.type === 'paseo-theme').pop().message;
  emit(latest(item), envelope(sessionId, { type: 'paseo-theme-ack', session: sessionId, themeSeq: theme.seq }, 5));
  await wait(250);
  window.__result = {
    links,
    images,
    heightAfter,
    themeSeq: theme.seq,
    themeSession: theme.session === sessionId,
    themeHasMessage: !!theme.message && theme.message.method === 'ui/notifications/host-context-changed',
    bodyText: text(item.el),
    mounted: !!item.el.querySelector('[data-native-fixture]'),
    acknowledgements: acks().map(c => c.message.mid),
    commands: commands.map(c => c.message.type),
  };
  item.root.unmount();
  item.el.remove();
})().catch(error => { window.__result = { error: String(error), stack: error && error.stack }; });
`);
  assert.deepEqual(result.links, [{ url: "https://example.com/", modifiers: { metaKey: false, ctrlKey: false } }]);
  assert.deepEqual(result.images, [{ src: "data:image/png;base64,AAAA", name: "shot" }]);
  assert.equal(result.heightAfter, "812px", "the height message still drives the frame height");
  assert.ok(result.themeSeq >= 1);
  assert.equal(result.themeSession, true, "the theme command is scoped to this mount's session");
  assert.equal(result.themeHasMessage, true, "the theme command carries the host context message");
  assert.equal(result.mounted, true);
  assert.deepEqual(result.acknowledgements, [1, 2, 3, 4, 5], "every delivered chunk, including the theme ack, is acknowledged");
  assert.doesNotMatch(result.bodyText, /unavailable|Loading interactive report|not acknowledged|handshake/i);
});

test("the rewritten Android commit URL loses the fragment but the document title still completes ready", { timeout: 60_000 }, async () => {
  const result = await run(`
(async () => {
  const item = mount('title-ready');
  const sessionId = await session(item);
  const ready = readyMessage();
  // Android reports the renderer's stored data: URL for a loadDataWithBaseURL
  // commit, so the fragment is gone; the title travels independently.
  latest(item).onLoadingStart({ nativeEvent: { url: rewrittenDataUrl(), title: title(sessionId, ready) } });
  await until(() => text(item.el).indexOf('Loading interactive report') < 0);
  const afterTitle = text(item.el);
  // The same chunk on the other two carriers is acknowledged and applied once.
  emit(latest(item), envelope(sessionId, ready));
  latest(item).onLoadingFinish({ nativeEvent: { url: 'about:blank', title: title(sessionId, ready) } });
  latest(item).onLoadingProgress({ nativeEvent: { url: fragment(sessionId, ready) } });
  await wait(250);
  window.__result = {
    afterTitle,
    bodyText: text(item.el),
    mounted: !!item.el.querySelector('[data-native-fixture]'),
    ready: text(item.el).indexOf('Loading interactive report') < 0,
    acknowledgements: acks().map(c => [c.message.mid, c.message.seq]),
    probes: probes().length
  };
  item.root.unmount();
  item.el.remove();
})().catch(error => { window.__result = { error: String(error), stack: error && error.stack }; });
`);
  assert.doesNotMatch(result.afterTitle, /Loading interactive report|interrupted|rejected/i, "a title chunk alone completes the handshake");
  assert.equal(result.ready, true, "the report renders and the overlay is gone");
  assert.equal(result.mounted, true);
  assert.deepEqual(result.acknowledgements, [[1, 0], [1, 0], [1, 0], [1, 0]], "every carrier copy is acknowledged, never applied twice");
  assert.equal(result.probes, 0, "readiness came from the title, not from a synthetic probe");
  assert.doesNotMatch(result.bodyText, /unavailable|rejected|out of sync/i);
});

test("unrelated, stale, malformed and over-budget titles never fake readiness and keep the report mounted", { timeout: 60_000 }, async () => {
  const result = await run(`
(async () => {
  const stale = mount('stale-title');
  const staleSession = await session(stale);
  latest(stale).onLoadingProgress({ nativeEvent: { url: rewrittenDataUrl(), title: 'Interactive HTML' } });
  latest(stale).onLoadingProgress({ nativeEvent: { url: rewrittenDataUrl(), title: title('ffffffffffffffff', readyMessage()) } });
  await wait(200);

  const over = mount('over-budget-title');
  const overSession = await session(over);
  latest(over).onLoadingStart({ nativeEvent: { url: 'about:blank', title: '${NATIVE_TITLE_PREFIX}' + overSession + ',1,0,1,' + 'A'.repeat(${NATIVE_MAX_TITLE_CHARS}) } });
  await wait(200);

  const bad = mount('malformed-title');
  const badSession = await session(bad);
  latest(bad).onLoadingStart({ nativeEvent: { url: 'about:blank', title: '${NATIVE_TITLE_PREFIX}' + badSession + ',0,0,1,AAAA' } });
  await wait(200);

  const describe = item => ({
    bodyText: text(item.el),
    mounted: !!item.el.querySelector('[data-native-fixture]'),
    loading: text(item.el).indexOf('Loading interactive report') >= 0
  });
  window.__result = {
    stale: describe(stale),
    over: describe(over),
    bad: describe(bad),
    acknowledgements: acks().length
  };
  for (const item of [stale, over, bad]) { item.root.unmount(); item.el.remove(); }
})().catch(error => { window.__result = { error: String(error), stack: error && error.stack }; });
`);
  assert.equal(result.stale.mounted, true);
  assert.equal(result.stale.bodyText.includes("rejected"), false, "unrelated and stale titles are ignored, not failures");
  assert.equal(result.acknowledgements, 0, "ignored titles are never acknowledged");
  assert.equal(result.stale.loading, true, "ignored titles never fake readiness");
  assert.match(result.over.bodyText, /transport rejected data: title message is too long/);
  assert.match(result.bad.bodyText, /transport rejected data: transport message id is out of range/);
  for (const name of ["over", "bad"]) {
    assert.equal(result[name].mounted, true, `${name}: the WebView stays mounted`);
    assert.equal(result[name].loading, false, `${name}: the control banner replaces the loading overlay`);
    assert.doesNotMatch(result[name].bodyText, /https?:\/\/|data:text|data:image|paseo-p2n-title|#paseo/, `${name}: no URL or title payload is echoed`);
  }
  assert.equal(result.stale.mounted, true);
  assert.doesNotMatch(result.stale.bodyText, /https?:\/\/|data:text|data:image|paseo-p2n-title|#paseo/);
});

test("height, links, multi-chunk images and the theme ack travel through the title carrier", { timeout: 60_000 }, async () => {
  const result = await run(`
(async () => {
  const item = mount('title-messages', { requestedHeight: 1200 });
  const sessionId = await session(item);
  const sendTitle = (message, messageId) => {
    for (const value of titleChunks(sessionId, message, messageId)) {
      latest(item).onLoadingProgress({ nativeEvent: { url: 'about:blank', title: value } });
    }
  };
  sendTitle(readyMessage(), 1);
  await until(() => text(item.el).indexOf('Loading interactive report') < 0);
  sendTitle({ jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { height: 812 } }, 2);
  sendTitle({ jsonrpc: '2.0', id: 'paseo-link-1', method: 'ui/open-link', params: { url: 'https://example.com/', metaKey: false, ctrlKey: false } }, 3);
  sendTitle({ jsonrpc: '2.0', method: 'ui/open-image', params: { src: 'data:image/png;base64,' + 'B'.repeat(${NATIVE_MAX_CHUNK_CHARS} + 100), name: 'shot' } }, 4);
  await until(() => links.length === 1 && images.length === 1);
  item.root.render(create(NativeHtmlFrame, Object.assign({}, item.props, { theme: { colors: DEFAULT_HTML_DOCUMENT_COLORS.light } })));
  await until(() => commands.some(c => c.message.type === 'paseo-theme'));
  const theme = commands.filter(c => c.message.type === 'paseo-theme').pop().message;
  sendTitle({ type: 'paseo-theme-ack', session: sessionId, themeSeq: theme.seq }, 5);
  await wait(250);
  const frameNode = item.el.firstElementChild.lastElementChild;
  window.__result = {
    links,
    imageName: images[0] && images[0].name,
    imageSrcChars: images[0] ? images[0].src.length : 0,
    heightAfter: frameNode ? frameNode.style.height : null,
    acknowledgements: acks().map(c => c.message.mid),
    bodyText: text(item.el),
    mounted: !!item.el.querySelector('[data-native-fixture]'),
    titleChars: titleChunks(sessionId, { jsonrpc: '2.0', method: 'ui/open-image', params: { src: 'data:image/png;base64,' + 'B'.repeat(${NATIVE_MAX_CHUNK_CHARS} + 100), name: 'shot' } }, 4).map(value => value.length)
  };
  item.root.unmount();
  item.el.remove();
})().catch(error => { window.__result = { error: String(error), stack: error && error.stack }; });
`);
  assert.deepEqual(result.links, [{ url: "https://example.com/", modifiers: { metaKey: false, ctrlKey: false } }]);
  assert.equal(result.imageName, "shot");
  assert.ok(Number(result.imageSrcChars) > NATIVE_MAX_CHUNK_CHARS, "the image needed more than one title");
  assert.ok(result.titleChars.every((length: number) => length <= NATIVE_MAX_TITLE_CHARS), "every title stays under the Chromium cap");
  assert.equal(result.heightAfter, "812px", "the height still drives the frame");
  assert.deepEqual(result.acknowledgements, [1, 2, 3, 4, 4, 5], "each title chunk is acknowledged once");
  assert.equal(result.mounted, true);
  assert.doesNotMatch(result.bodyText, /unavailable|Loading interactive report|not acknowledged|handshake/i);
});
