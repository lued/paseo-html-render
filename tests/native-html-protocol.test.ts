import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  NATIVE_ERROR_PREFIX,
  NATIVE_MAX_CHUNK_CHARS,
  NATIVE_MAX_CHUNKS,
  NATIVE_MAX_ENCODED_CHARS,
  NATIVE_P2N_PREFIX,
  NATIVE_SHELL_CSP,
  NATIVE_WEBVIEW_SECURITY_PROPS,
  NativeChunkAssembler,
  buildNativeShellDocument,
  decodeNativeTransportMessage,
  parseNativeErrorUrl,
  isUsableDocumentFrame,
  nativeDocumentKey,
  parseNativeTransportUrl,
  readNativeThemeAck,
} from "../client/native-html-protocol.ts";
import { MAX_INTERACTIVE_HTML_BYTES } from "../shared/limits.ts";

const SESSION = "0123456789abcdef";
const URL_BASE = "about:blank";

test("raw WebView security invariants reject bridge/cache/cookie clearing", () => {
  assert.equal(NATIVE_WEBVIEW_SECURITY_PROPS.messagingEnabled, false);
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
  for (const forbidden of ["incognito", "cacheEnabled", "clearCache", "clearHistory", "CookieManager", "removeAllCookies", "onMessage:", "onShouldStartLoadWithRequest"]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} must not appear in the native frame`);
  }
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
