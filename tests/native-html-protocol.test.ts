import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  NATIVE_ERROR_PREFIX,
  NATIVE_MAX_CHUNK_CHARS,
  NATIVE_MAX_CHUNKS,
  NATIVE_MAX_ENCODED_CHARS,
  NATIVE_MAX_BRIDGE_CHARS,
  NATIVE_MAX_TITLE_CHARS,
  NATIVE_MAX_URL_CHARS,
  NATIVE_P2N_PREFIX,
  NATIVE_SHELL_CSP,
  NATIVE_TITLE_ERROR_PREFIX,
  NATIVE_TITLE_PREFIX,
  NATIVE_TRANSPORT_COUNTERS,
  NATIVE_WEBVIEW_SECURITY_PROPS,
  NativeChunkAssembler,
  buildNativeShellDocument,
  decodeNativeTransportMessage,
  nativeReadyTimeoutMessage,
  nativeTransportStage,
  nativeTransportStageLabel,
  parseNativeBridgeMessage,
  parseNativeErrorTitle,
  parseNativeErrorUrl,
  parseNativeTitle,
  isUsableDocumentFrame,
  nativeDocumentKey,
  parseNativeTransportUrl,
  probeRegisteredViewManager,
  readNativeThemeAck,
  selectNativeHtmlCapability,
  nativeFallbackMessage,
  nativeMountErrorMessage,
} from "../client/native-html-protocol.ts";
import { MAX_INTERACTIVE_HTML_BYTES } from "../shared/limits.ts";
import {
  DEFAULT_HTML_DOCUMENT_COLORS,
  buildDocumentTheme,
  buildLiveDocument,
  readReadyMessage,
} from "../shared/html-document.ts";

const SESSION = "0123456789abcdef";
const URL_BASE = "about:blank";

test("raw WebView security invariants reject bridge/cache/cookie clearing", () => {
  // onMessage is the primary page->native channel, so the bridge must be on for
  // the constant trusted shell, and nothing else may be loosened.
  assert.equal(NATIVE_WEBVIEW_SECURITY_PROPS.messagingEnabled, true);
  assert.equal(NATIVE_WEBVIEW_SECURITY_PROPS.javaScriptEnabled, true);
  for (const forbidden of [
    "incognito",
    "cacheEnabled",
    "sharedCookiesEnabled",
    "clearCache",
    "clearHistory",
    "clearFormData",
    "removeAllCookies",
    "setAcceptCookie",
  ]) {
    assert.equal(forbidden in NATIVE_WEBVIEW_SECURITY_PROPS, false, `${forbidden} must not be set on the WebView`);
  }
  const source = readFileSync(join(process.cwd(), "client", "native-html-frame.tsx"), "utf8");
  for (const forbidden of ["incognito", "cacheEnabled", "clearCache", "clearHistory", "CookieManager", "removeAllCookies", "onShouldStartLoadWithRequest"]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} must not appear in the native frame`);
  }
  // The bridge is wired exactly once, to the strict receiver, for the trusted shell.
  assert.equal(source.match(/onMessage:/g)?.length, 1, "the frame wires one onMessage handler");
  assert.match(source, /onMessage: handleBridgeMessage/);
  assert.equal(isUsableDocumentFrame(null), false);
  assert.equal(isUsableDocumentFrame({}), false);
  assert.equal(isUsableDocumentFrame(() => null), true);
  assert.equal(source.includes("event.nativeEvent?.description"), false, "load errors stay generic");
  const base = nativeDocumentKey("artifact-a", "Title", "<p>same</p>");
  assert.equal(base, nativeDocumentKey("artifact-a", "Title", "<p>same</p>"));
  assert.notEqual(base, nativeDocumentKey("artifact-b", "Title", "<p>same</p>"));
  assert.notEqual(base, nativeDocumentKey("artifact-a", "Other", "<p>same</p>"));
  assert.notEqual(base, nativeDocumentKey("artifact-a", "Title", "<p>changed</p>"));
});

function encodedChunks(message: unknown): string[] {
  const encoded = encodeURIComponent(JSON.stringify(message));
  const chunks: string[] = [];
  for (let index = 0; index < encoded.length; index += NATIVE_MAX_CHUNK_CHARS) {
    chunks.push(encoded.slice(index, index + NATIVE_MAX_CHUNK_CHARS));
  }
  return chunks;
}

function chunkUrl(sequence: number, total: number, data: string, session = SESSION, messageId = 1): string {
  return `${URL_BASE}${NATIVE_P2N_PREFIX}${session},${messageId},${sequence},${total},${data}`;
}

test("Android capability accepts an already-registered old-host WebView without double registration", () => {
  const base = {
    platform: "android" as const,
    documentFrame: undefined,
    component: () => null,
    dispatchViewManagerCommand: () => undefined,
    findNodeHandle: () => 1,
    registeredViewManager: true,
  };
  assert.deepEqual(selectNativeHtmlCapability(base), { available: true, reason: "ready" });
  assert.deepEqual(
    selectNativeHtmlCapability({ ...base, registeredViewManager: false }),
    { available: false, reason: "host-native-view" },
  );
  assert.deepEqual(
    selectNativeHtmlCapability({ ...base, registeredViewManager: null }),
    { available: false, reason: "host-native-view" },
  );
  assert.deepEqual(
    selectNativeHtmlCapability({ ...base, documentFrame: () => null, registeredViewManager: null }),
    { available: true, reason: "ready" },
    "the 0.13 public DocumentFrame path remains available when no query exists",
  );
  assert.deepEqual(
    selectNativeHtmlCapability({ ...base, documentFrame: () => null, registeredViewManager: false }),
    { available: false, reason: "host-native-view" },
    "a public component export cannot override a negative native-manager query",
  );
  assert.deepEqual(
    selectNativeHtmlCapability({ ...base, documentFrame: {}, registeredViewManager: true }),
    { available: true, reason: "ready" },
    "an object export may be a registration signal, but is never called",
  );
  assert.deepEqual(
    selectNativeHtmlCapability({ ...base, component: undefined }),
    { available: false, reason: "error-boundary" },
  );
  assert.deepEqual(
    selectNativeHtmlCapability({ ...base, dispatchViewManagerCommand: undefined }),
    { available: false, reason: "command-apis" },
  );
  assert.deepEqual(
    selectNativeHtmlCapability({ ...base, platform: "web" }),
    { available: false, reason: "platform" },
  );

  assert.equal(probeRegisteredViewManager({ hasViewManagerConfig: (name: string) => name === "RNCWebView" }), true);
  assert.equal(probeRegisteredViewManager({ hasViewManagerConfig: () => false }), false);
  assert.equal(probeRegisteredViewManager({ hasViewManagerConfig: () => { throw new Error("bad"); } }), false);
  assert.equal(probeRegisteredViewManager({ getViewManagerConfig: () => ({ Commands: {} }) }), true);
  assert.equal(probeRegisteredViewManager({ getViewManagerConfig: () => null }), false);
  for (const malformed of [false, true, 0, 1, "RNCWebView", []]) {
    assert.equal(probeRegisteredViewManager({ getViewManagerConfig: () => malformed }), false);
  }
  assert.equal(probeRegisteredViewManager({ getViewManagerConfig: () => { throw new Error("bad"); } }), null);
  assert.equal(probeRegisteredViewManager({}), null);
  assert.match(nativeMountErrorMessage(new Error("View config not found for component RNCWebView")), /not registered/);
  assert.match(nativeMountErrorMessage(new Error("boom")), /could not be mounted/);
  assert.match(nativeMountErrorMessage("View config getter callback for component `RNCWebView` must be a function (received undefined)"), /not registered/);
  assert.match(nativeMountErrorMessage("RNCWebView failed to load https://secret.example/data"), /could not be mounted/);
  assert.doesNotMatch(nativeMountErrorMessage(new Error("https://secret.example/data")), /secret/);

  assert.match(nativeFallbackMessage("host-native-view"), /registered native WebView manager/);
  assert.match(nativeFallbackMessage("command-apis"), /native WebView commands/);
  assert.match(nativeFallbackMessage("error-boundary"), /error boundary/);
  assert.notEqual(nativeFallbackMessage("host-native-view"), nativeFallbackMessage("command-apis"));
});

test("native shell keeps report markup inert and preserves the sandbox/CSP boundary", () => {
  const malicious = '</script><script>parent.postMessage({bad:true},"*")</script><!--<textarea>--><script>alert(1)</script>';
  const inner = `<!doctype html><html><body>${malicious}</body></html>`;
  const shell = buildNativeShellDocument(inner, SESSION);
  assert.match(shell, /sandbox="allow-scripts"/);
  assert.doesNotMatch(shell, /allow-(same-origin|forms|popups|top-navigation|downloads|modals)/);
  assert.match(shell, /frame-src 'self' about:/);
  assert.doesNotMatch(shell, /unsafe-eval/);
  assert.doesNotMatch(shell, /https?:\/\//);
  assert.match(shell, /location\.replace/);
  assert.match(shell, /navigator\.userActivation/);
  assert.doesNotMatch(shell, /window\.open/);
  assert.match(shell, /id="p">.*\\u003c\/script>/s);
  assert.doesNotMatch(shell, /<script>alert\(1\)<\/script>/);
  const payload = /<script type="application\/json" id="p">([\s\S]*?)<\/script>/.exec(shell)?.[1];
  assert.ok(payload);
  assert.equal(JSON.parse(payload), inner, "inert JSON round-trips the exact report document");
  assert.match(NATIVE_SHELL_CSP, /script-src 'unsafe-inline'/);
  assert.doesNotMatch(NATIVE_SHELL_CSP, /unsafe-eval|https?:/);
});

test("native shell rejects invalid session/document sizes", () => {
  assert.throws(() => buildNativeShellDocument("<p>x</p>", "bad"));
  assert.throws(() => buildNativeShellDocument("", SESSION));
  assert.throws(() => buildNativeShellDocument("x".repeat(8 * 1_048_576 + 1), SESSION), /limit/);
});

test("page->native transport round-trips unicode, newlines and data images above one chunk", () => {
  const message = {
    jsonrpc: "2.0",
    method: "ui/open-image",
    params: {
      src: `data:image/png;base64,${"A".repeat(NATIVE_MAX_CHUNK_CHARS + 5_000)}`,
      name: "Résumé ✅\n第二行",
    },
  };
  const chunks = encodedChunks(message);
  assert.ok(chunks.length > 1);
  const assembler = new NativeChunkAssembler(SESSION);
  for (let index = 0; index < chunks.length; index += 1) {
    const parsed = parseNativeTransportUrl(chunkUrl(index, chunks.length, chunks[index]!), SESSION);
    assert.equal(parsed?.ok, true);
    assert.equal(assembler.push(parsed!.chunk!).ok, true);
  }
  assert.equal(assembler.complete, true);
  const decoded = decodeNativeTransportMessage(assembler.takeEncoded()!);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.value, message);
});

test("transport rejects stale sessions, malformed/out-of-order/duplicate chunks and bounds", () => {
  const chunks = encodedChunks({ jsonrpc: "2.0", method: "ui/notifications/ready", params: { version: 1 } });
  const stale = parseNativeTransportUrl(chunkUrl(0, chunks.length, chunks[0]!, "other"), SESSION);
  assert.equal(stale?.ok, false);
  assert.equal(stale?.stale, true);
  assert.equal(parseNativeTransportUrl(`${URL_BASE}#nope`, SESSION), undefined);
  assert.equal(parseNativeTransportUrl(chunkUrl(0, 0, ""), SESSION)?.ok, false);
  assert.equal(parseNativeTransportUrl(chunkUrl(2, 3, chunks[0]!), SESSION)?.ok, true);
  assert.equal(parseNativeTransportUrl(chunkUrl(0, 1, "x".repeat(NATIVE_MAX_CHUNK_CHARS + 1)), SESSION)?.ok, false);
  assert.equal(parseNativeTransportUrl(chunkUrl(0, 1, "<bad>"), SESSION)?.ok, false);
  assert.equal(parseNativeTransportUrl(chunkUrl(0, 1, chunks[0]!, SESSION, 0), SESSION)?.ok, false);

  const assembler = new NativeChunkAssembler(SESSION);
  const first = parseNativeTransportUrl(chunkUrl(0, 3, chunks[0]!), SESSION)?.chunk;
  const second = parseNativeTransportUrl(chunkUrl(1, 3, chunks[0]!), SESSION)?.chunk;
  assert.ok(first && second);
  assert.equal(assembler.push(first).ok, true);
  const duplicate = assembler.push(first);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true, "duplicate chunk is acked without re-appending");
  assert.equal(assembler.push(second).ok, true);
  assert.equal(assembler.push({ messageId: 1, sequence: 2, total: 4, data: "x" }).ok, false, "total change rejected");
  assembler.reset();
  assert.equal(assembler.push({ messageId: 1, sequence: 1, total: 2, data: "x" }).ok, false, "first chunk must be zero");
});

test("message ids distinguish identical messages and suppress replay/duplicate callbacks", () => {
  const encoded = encodeURIComponent(JSON.stringify({ jsonrpc: "2.0", method: "ui/notifications/ready", params: { version: 1 } }));
  const assembler = new NativeChunkAssembler(SESSION);
  const first = { messageId: 1, sequence: 0, total: 1, data: encoded };
  const second = { ...first, messageId: 2 };
  assert.equal(assembler.push(first).ok, true);
  assert.equal(typeof assembler.takeEncoded(), "string");
  assert.equal(assembler.push({ ...first }).ok, true);
  const replay = assembler.push({ ...first });
  assert.equal(replay.ok && replay.duplicate === true, true, "completed message replay is acked, not delivered");
  assert.equal(assembler.push(second).ok, true, "a new identical message has a new id");
  assert.equal(typeof assembler.takeEncoded(), "string");
  const duplicateFinal = assembler.push({ ...second });
  assert.equal(duplicateFinal.ok && duplicateFinal.duplicate === true, true, "duplicate final callback is not delivered again");
});

test("ready retry changes the URL without changing chunk identity or data", () => {
  const message = { jsonrpc: "2.0", method: "ui/notifications/ready", params: { version: 1 } };
  const chunks = encodedChunks(message);
  const first = parseNativeTransportUrl(chunkUrl(0, chunks.length, chunks[0]!), SESSION);
  const retry = parseNativeTransportUrl(chunkUrl(0, chunks.length, chunks[0]!) + ";r=2", SESSION);
  assert.equal(first?.ok, true);
  assert.equal(retry?.ok, true);
  assert.deepEqual(retry?.chunk, first?.chunk);
  assert.ok((chunkUrl(0, chunks.length, chunks[0]!) + ";r=2").length <= 65_536);
  assert.equal(parseNativeTransportUrl(chunkUrl(0, chunks.length, chunks[0]!) + ";r=0", SESSION)?.ok, false);
});

test("maximum supported image payload round-trips through the chunk assembly", () => {
  const src = `data:image/png;base64,${"A".repeat(MAX_INTERACTIVE_HTML_BYTES - 100)}`;
  const message = { jsonrpc: "2.0", method: "ui/open-image", params: { src, name: "maximum" } };
  const chunks = encodedChunks(message);
  assert.ok(chunks.length > 1);
  const assembler = new NativeChunkAssembler(SESSION);
  for (let index = 0; index < chunks.length; index += 1) {
    const parsed = parseNativeTransportUrl(chunkUrl(index, chunks.length, chunks[index]!), SESSION);
    assert.equal(parsed?.ok, true);
    assert.equal(assembler.push(parsed!.chunk!).ok, true);
  }
  const decoded = decodeNativeTransportMessage(assembler.takeEncoded()!);
  assert.equal(decoded.ok, true);
  assert.equal((decoded.value as typeof message).params.src.length, src.length);
});

test("worst-case base64 slash expansion still fits the encoded and URL budgets", () => {
  const src = `data:image/png;base64,${"/".repeat(MAX_INTERACTIVE_HTML_BYTES - 50)}`;
  const message = { jsonrpc: "2.0", method: "ui/open-image", params: { src, name: "slash" } };
  const encoded = encodeURIComponent(JSON.stringify(message));
  assert.ok(encoded.length < NATIVE_MAX_ENCODED_CHARS, `encoded ${encoded.length}`);
  const chunks = encodedChunks(message);
  assert.ok(chunks.length <= NATIVE_MAX_CHUNKS);
  const url = chunkUrl(0, chunks.length, chunks[0]!, SESSION, 1);
  assert.ok(url.length <= 65_536, `fragment URL is ${url.length} chars`);
  const assembler = new NativeChunkAssembler(SESSION);
  for (let index = 0; index < chunks.length; index += 1) {
    const parsed = parseNativeTransportUrl(chunkUrl(index, chunks.length, chunks[index]!), SESSION);
    assert.equal(parsed?.ok, true);
    assert.equal(assembler.push(parsed!.chunk!).ok, true);
  }
  const decoded = decodeNativeTransportMessage(assembler.takeEncoded()!);
  assert.equal(decoded.ok, true);
  assert.equal((decoded.value as typeof message).params.src.length, src.length);
});

test("theme acknowledgements are ordered transport values and errors stay bounded", () => {
  assert.equal(readNativeThemeAck({ type: "paseo-theme-ack", session: SESSION, themeSeq: 7 }, SESSION), 7);
  assert.equal(readNativeThemeAck({ type: "paseo-theme-ack", session: "other", themeSeq: 7 }, SESSION), null);
  assert.equal(readNativeThemeAck({ type: "paseo-theme-ack", session: SESSION, themeSeq: 0 }, SESSION), null);
  assert.equal(parseNativeErrorUrl(`${URL_BASE}${NATIVE_ERROR_PREFIX}ack-timeout`), "ack-timeout");
  assert.equal(parseNativeErrorUrl(`${URL_BASE}${NATIVE_ERROR_PREFIX}BAD!`), "invalid");
});

test("complete fragment URL stays below the 65,536-char cap", () => {
  const chunks = encodedChunks({ value: "x".repeat(NATIVE_MAX_CHUNK_CHARS) });
  assert.equal(chunks[0]!.length, NATIVE_MAX_CHUNK_CHARS);
  const url = chunkUrl(0, chunks.length, chunks[0]!, SESSION, 1);
  assert.ok(url.length <= 65_536, `fragment URL is ${url.length} chars`);
});

function bridgePayload(input: {
  mid?: unknown;
  seq?: unknown;
  total?: unknown;
  data?: unknown;
  session?: unknown;
  type?: unknown;
} = {}): string {
  return JSON.stringify({
    type: "paseo-p2n",
    session: SESSION,
    mid: 1,
    seq: 0,
    total: 1,
    data: encodeURIComponent(JSON.stringify({ jsonrpc: "2.0", method: "ui/notifications/ready", params: { version: 1 } })),
    ...input,
  });
}

test("onMessage bridge payloads parse with the same strict bounds as fragments", () => {
  const ok = parseNativeBridgeMessage(bridgePayload(), SESSION);
  assert.equal(ok?.ok, true);
  const data = encodeURIComponent(JSON.stringify({ value: 1 }));
  const parsed = parseNativeBridgeMessage(bridgePayload({ data }), SESSION);
  assert.deepEqual(parsed?.chunk, { messageId: 1, sequence: 0, total: 1, data }, "bridge and fragment share one chunk shape");

  // Non-envelopes are ignored, never treated as transport failures.
  assert.equal(parseNativeBridgeMessage(undefined, SESSION), undefined);
  assert.equal(parseNativeBridgeMessage({ type: "paseo-p2n" }, SESSION), undefined);
  assert.equal(parseNativeBridgeMessage("", SESSION), undefined);
  assert.equal(parseNativeBridgeMessage("not json", SESSION), undefined);
  assert.equal(parseNativeBridgeMessage("null", SESSION), undefined);
  assert.equal(parseNativeBridgeMessage("[]", SESSION), undefined);
  assert.equal(parseNativeBridgeMessage(JSON.stringify({ type: "other" }), SESSION), undefined);
  assert.equal(parseNativeBridgeMessage(bridgePayload({ type: "paseo-ack" }), SESSION), undefined);
  // Another mount's session is stale, not a failure.
  const stale = parseNativeBridgeMessage(bridgePayload({ session: "other" }), SESSION);
  assert.equal(stale?.ok, false);
  assert.equal(stale?.stale, true);

  // Envelopes that claim the type but violate bounds are rejected.
  assert.equal(parseNativeBridgeMessage(bridgePayload({ mid: 0 }), SESSION)?.ok, false);
  assert.equal(parseNativeBridgeMessage(bridgePayload({ mid: "1" }), SESSION)?.ok, true, "numeric strings stay canonical");
  assert.equal(parseNativeBridgeMessage(bridgePayload({ mid: "01" }), SESSION)?.ok, false);
  assert.equal(parseNativeBridgeMessage(bridgePayload({ mid: 1.5 }), SESSION)?.ok, false);
  assert.equal(parseNativeBridgeMessage(bridgePayload({ total: 0 }), SESSION)?.ok, false);
  assert.equal(parseNativeBridgeMessage(bridgePayload({ total: NATIVE_MAX_CHUNKS + 1 }), SESSION)?.ok, false);
  assert.equal(parseNativeBridgeMessage(bridgePayload({ seq: 1 }), SESSION)?.ok, false);
  assert.equal(parseNativeBridgeMessage(bridgePayload({ seq: "0" }), SESSION)?.ok, true);
  assert.equal(parseNativeBridgeMessage(bridgePayload({ data: undefined }), SESSION)?.ok, false);
  assert.equal(parseNativeBridgeMessage(bridgePayload({ data: "x".repeat(NATIVE_MAX_CHUNK_CHARS + 1) }), SESSION)?.ok, false);
  assert.equal(parseNativeBridgeMessage(bridgePayload({ data: "<bad>" }), SESSION)?.ok, false);
  assert.equal(parseNativeBridgeMessage(bridgePayload({ data: "a%2Fb%2Bc%3D" }), SESSION)?.ok, true, "encoded base64 padding stays valid");
});

test("oversized bridge look-alikes are rejected and foreign junk is ignored", () => {
  const oversized = bridgePayload({ data: "A".repeat(NATIVE_MAX_BRIDGE_CHARS) });
  assert.ok(oversized.length > NATIVE_MAX_BRIDGE_CHARS);
  const rejected = parseNativeBridgeMessage(oversized, SESSION);
  assert.equal(rejected?.ok, false);
  assert.match(String(rejected?.error), /too long/);
  const foreign = "x".repeat(NATIVE_MAX_BRIDGE_CHARS + 10);
  assert.equal(parseNativeBridgeMessage(foreign, SESSION), undefined);
});

test("a bridge chunk and its fragment fallback complete exactly one message", () => {
  const message = { jsonrpc: "2.0", method: "ui/notifications/ready", params: { version: 1 } };
  const encoded = encodeURIComponent(JSON.stringify(message));
  const bridge = parseNativeBridgeMessage(bridgePayload({ data: encoded }), SESSION);
  const fragment = parseNativeTransportUrl(chunkUrl(0, 1, encoded), SESSION);
  assert.ok(bridge?.chunk && fragment?.chunk);
  assert.deepEqual(bridge.chunk, fragment.chunk, "both channels carry the same chunk identity");

  const assembler = new NativeChunkAssembler(SESSION);
  assert.equal(assembler.push(bridge.chunk).ok, true);
  const duplicate = assembler.push(fragment.chunk);
  assert.equal(duplicate.ok && duplicate.duplicate === true, true, "cross-channel duplicate is acked, not reapplied");
  assert.equal(assembler.complete, true);
  const decoded = decodeNativeTransportMessage(assembler.takeEncoded()!);
  assert.equal(decoded.ok, true);
  assert.equal(readReadyMessage(decoded.value), true);
});

test("ready timeout diagnostics name the failed stage with safe counters only", () => {
  const zero = NATIVE_TRANSPORT_COUNTERS;
  assert.equal(nativeTransportStage(zero), "no-page-messages");
  assert.equal(nativeTransportStageLabel("no-page-messages"), "no page messages");
  const noMessages = nativeReadyTimeoutMessage(zero);
  assert.match(noMessages, /did not complete its ready handshake in time/);
  assert.match(noMessages, /Stage: no page messages/);
  assert.match(noMessages, /onMessage 0, fragment 0, chunks 0, messages 0, probes 0, rejected 0/);

  assert.equal(
    nativeTransportStage({ ...zero, fragments: 4, chunks: 4, messages: 3, probes: 1 }),
    "chunks-without-ready",
    "decoded messages that never included ready point at the ready path",
  );
  assert.equal(
    nativeTransportStage({ ...zero, pageMessages: 2, chunks: 2, probes: 1, messagesSinceProbe: 0 }),
    "probe-unanswered",
    "traffic that stopped answering the probe points at page->native delivery",
  );
  assert.equal(
    nativeTransportStage({ ...zero, pageMessages: 3, chunks: 3, messagesSinceProbe: 2, probes: 1 }),
    "no-ready-handshake",
    "partial chunks with no completed message stay generic",
  );
  const labelled = nativeReadyTimeoutMessage({
    ...zero,
    pageMessages: 9,
    fragments: 2,
    chunks: 11,
    messages: 4,
    probes: 1,
    messagesSinceProbe: 0,
    rejected: 1,
  });
  assert.match(labelled, /Stage: chunks without ready/);
  assert.match(labelled, /onMessage 9, fragment 2, chunks 11, messages 4, probes 1, rejected 1/);
  assert.equal(/https?:|data:|#paseo|session/i.test(labelled), false, "diagnostics never echo URLs, payloads or sessions");
});

test("the trusted shell sends every chunk on the bridge, as a fragment URL and as the document title", () => {
  const shell = buildNativeShellDocument(buildLiveDocument({
    html: "<p>bridge</p>",
    title: "Bridge",
    theme: buildDocumentTheme(DEFAULT_HTML_DOCUMENT_COLORS.dark, "dark"),
  }), SESSION);
  assert.match(shell, /window\.ReactNativeWebView/);
  assert.match(shell, /type:"paseo-p2n"/);
  assert.match(shell, /bridge\.postMessage/);
  // Android's RNCWebView routes bridge messages to its own JS router, which a
  // raw mount never hears, so the bridge is never the only copy of a chunk.
  assert.match(
    shell,
    /deliver\("bridge"\);\s*deliverTitle\(\);\s*deliver\("fragment"\);/,
    "every carrier gets every chunk, with the title set immediately before the navigation",
  );
  assert.match(shell, /deliver\("bridge"\);deliverTitle\(\);deliver\("fragment"\);/, "the ack retry resends all carriers");
  assert.match(shell, /document\.title=value/, "the title carrier assigns the bounded payload");
  assert.match(shell, /if\(value\.length>TITLEMAX\)/, "the title is bounds-checked before assignment");
  assert.match(shell, /TITLEMAX=4000/, "the shell knows the conservative title budget");
  assert.match(shell, /"paseo-p2n-title:"/, "the title payload is transport-prefixed");
  assert.match(shell, /paseo-error-title:/, "failure markers travel on the title too");
  // Android WebView reports a committed same-document replace through
  // doUpdateVisitedHistory, so the fragment needs no growing history.
  assert.match(shell, /location\.replace\("#paseo-p2n="/, "the fragment channel is built");
  assert.doesNotMatch(shell, /pushState/);
  assert.doesNotMatch(shell, /bridgePreferred/);
  assert.doesNotMatch(shell, /allow-same-origin/);
});

test("title carrier shares the strict chunk identity, bounds and stale handling", () => {
  const message = { jsonrpc: "2.0", method: "ui/notifications/ready", params: { version: 1 } };
  const data = encodeURIComponent(JSON.stringify(message));
  const title = `${NATIVE_TITLE_PREFIX}${SESSION},1,0,1,${data}`;
  const parsed = parseNativeTitle(title, SESSION);
  assert.equal(parsed?.ok, true);
  const fromUrl = parseNativeTransportUrl(chunkUrl(0, 1, data), SESSION);
  assert.deepEqual(parsed!.chunk, fromUrl!.chunk, "both carriers describe the same chunk");
  assert.equal(parseNativeTitle(`${title};r=2`, SESSION)?.ok, true, "a bounded retry suffix is not message data");
  assert.equal(parseNativeTitle(`${title};r=0`, SESSION)?.ok, false);

  // Unrelated titles are ignored, never rejected.
  for (const unrelated of ["Interactive HTML", "", "Paseo", 42, null, undefined, { title: "x" }]) {
    assert.equal(parseNativeTitle(unrelated, SESSION), undefined);
  }
  assert.equal(parseNativeTitle(`${NATIVE_TITLE_PREFIX}x`, SESSION)?.ok, false);
  assert.equal(parseNativeTitle(`${NATIVE_TITLE_PREFIX}${SESSION},0,0,1,${data}`, SESSION)?.ok, false);
  assert.equal(parseNativeTitle(`${NATIVE_TITLE_PREFIX}${SESSION},1,0,1,<bad>`, SESSION)?.ok, false);
  assert.equal(parseNativeTitle(`${NATIVE_TITLE_PREFIX}${SESSION},1,0,1,${data}`, "other-session-0001")?.stale, true);

  // Over-budget titles: ours is rejected, someone else's is ignored.
  const overBudget = `${NATIVE_TITLE_PREFIX}${SESSION},1,0,1,${"A".repeat(NATIVE_MAX_TITLE_CHARS)}`;
  assert.ok(overBudget.length > NATIVE_MAX_TITLE_CHARS);
  assert.equal(parseNativeTitle(overBudget, SESSION)?.ok, false);
  assert.match(parseNativeTitle(overBudget, SESSION)?.error ?? "", /too long/);
  assert.equal(parseNativeTitle("A".repeat(NATIVE_MAX_TITLE_CHARS + 1), SESSION), undefined);

  assert.equal(parseNativeErrorTitle(`${NATIVE_TITLE_ERROR_PREFIX}ack-timeout`), "ack-timeout");
  assert.equal(parseNativeErrorTitle(`${NATIVE_TITLE_ERROR_PREFIX}${"x".repeat(41)}`), "invalid");
  assert.equal(parseNativeErrorTitle("Interactive HTML"), undefined);
  assert.equal(parseNativeErrorTitle(undefined), undefined);
});

test("one title chunk plus the worst-case header fits under the Chromium title cap", () => {
  const maxSession = "a".repeat(64);
  // The shell allows message ids up to 1e9 and chunk counts up to NATIVE_MAX_CHUNKS.
  const worst = `${NATIVE_TITLE_PREFIX}${maxSession},1000000000,${NATIVE_MAX_CHUNKS - 1},${NATIVE_MAX_CHUNKS},${ "A".repeat(NATIVE_MAX_CHUNK_CHARS)};r=9999`;
  assert.ok(worst.length < NATIVE_MAX_TITLE_CHARS, `${worst.length} chars must stay under ${NATIVE_MAX_TITLE_CHARS}`);
  assert.ok(worst.length < 4096, "Chromium kills the renderer above kMaxTitleChars");
  // A canonical nine-digit id still parses at that length.
  const canonical = `${NATIVE_TITLE_PREFIX}${maxSession},999999999,${NATIVE_MAX_CHUNKS - 1},${NATIVE_MAX_CHUNKS},${ "A".repeat(NATIVE_MAX_CHUNK_CHARS)};r=9999`;
  assert.equal(parseNativeTitle(canonical, "a".repeat(64))?.ok, true);
});

test("multi-chunk images reassemble through titles that each stay under the title cap", () => {
  const message = {
    jsonrpc: "2.0",
    method: "ui/open-image",
    params: { src: `data:image/png;base64,${"B".repeat(NATIVE_MAX_CHUNK_CHARS * 2 + 500)}`, name: "shot" },
  };
  const encoded = encodeURIComponent(JSON.stringify(message));
  const total = Math.ceil(encoded.length / NATIVE_MAX_CHUNK_CHARS);
  assert.ok(total > 2, "the fixture spans several titles");
  const assembler = new NativeChunkAssembler(SESSION);
  for (let index = 0; index < total; index += 1) {
    const title = `${NATIVE_TITLE_PREFIX}${SESSION},1,${index},${total},${encoded.slice(index * NATIVE_MAX_CHUNK_CHARS, (index + 1) * NATIVE_MAX_CHUNK_CHARS)}`;
    assert.ok(title.length <= NATIVE_MAX_TITLE_CHARS, "title " + index + " is " + title.length + " chars");
    const parsed = parseNativeTitle(title, SESSION);
    assert.equal(parsed?.ok, true);
    assert.equal(assembler.push(parsed!.chunk!).ok, true);
  }
  assert.equal(assembler.complete, true);
  const decoded = decodeNativeTransportMessage(assembler.takeEncoded()!);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.value, message);
});

test("oversized unrelated navigation URLs are ignored while transport envelopes stay rejected", () => {
  // The original data: URL of an html source is the URL Android reports for
  // every commit in a loadDataWithBaseURL document, so it must never fail the
  // control channel even when it is larger than the URL cap.
  const originalDataUrl = `data:text/html;charset=utf-8;base64,${Buffer.from("x".repeat(NATIVE_MAX_URL_CHARS)).toString("base64")}`;
  assert.ok(originalDataUrl.length > NATIVE_MAX_URL_CHARS);
  assert.equal(parseNativeTransportUrl(originalDataUrl, SESSION), undefined);
  assert.equal(parseNativeTransportUrl(`https://example.test/${ "a".repeat(NATIVE_MAX_URL_CHARS)}`, SESSION), undefined);
  assert.equal(parseNativeTransportUrl(undefined, SESSION), undefined);

  const oversizeEnvelope = `${originalDataUrl}${NATIVE_P2N_PREFIX}${SESSION},1,0,1,AAAA`;
  assert.equal(parseNativeTransportUrl(oversizeEnvelope, SESSION)?.ok, false);
  assert.match(parseNativeTransportUrl(oversizeEnvelope, SESSION)?.error ?? "", /too long/);
});

test("title-only traffic names its own stage and still reports safe counters", () => {
  const zero = NATIVE_TRANSPORT_COUNTERS;
  assert.equal(nativeTransportStage({ ...zero, titles: 3, chunks: 3, probes: 1 }), "title-only");
  assert.equal(nativeTransportStageLabel("title-only"), "titles without bridge or fragment");
  assert.equal(
    nativeTransportStage({ ...zero, titles: 1, fragments: 2, chunks: 3, messages: 1 }),
    "chunks-without-ready",
    "a decoded message still wins over carrier naming",
  );
  const message = nativeReadyTimeoutMessage({
    ...zero, titles: 4, chunks: 4, probes: 1,
    navigationEvents: 7, navigationHashEvents: 0, lastTitleChars: 205,
  });
  assert.match(message, /Stage: titles without bridge or fragment/);
  assert.match(message, /Counters: onMessage 0, fragment 0, chunks 4, messages 0, probes 1, rejected 0, titles 4\./);
  assert.match(message, /Native events 7, URL hash events 0, last title chars 205\./);
  assert.equal(/https?:|data:|#paseo|paseo-p2n-title|session/i.test(message), false, "no URL, title or payload is echoed");
});
