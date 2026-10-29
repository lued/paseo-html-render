import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_HTML_DOCUMENT_COLORS,
  buildDocumentTheme,
  buildLiveDocument,
  hostContextChangedMessage,
  readOpenImageRequest,
  readOpenLinkRequest,
  readReadyMessage,
  readSizeChangedMessage,
} from "../shared/html-document.ts";
import {
  NATIVE_ACK_TIMEOUT_MS,
  NATIVE_MAX_CHUNK_CHARS,
  NATIVE_MAX_TITLE_CHARS,
  NATIVE_TITLE_PREFIX,
  NativeChunkAssembler,
  buildNativeShellDocument,
  decodeNativeTransportMessage,
  parseNativeErrorUrl,
  parseNativeErrorTitle,
  parseNativeTitle,
  parseNativeTransportUrl,
  readNativeThemeAck,
} from "../client/native-html-protocol.ts";
import { browserResult, type BrowserInteraction } from "./helpers/browser.ts";

const SESSION = "native-shell-test-0001";
const PNG = readFileSync("examples/interactive/captures/flow-1024.png").toString("base64");
const IMAGE_URI = `data:image/png;base64,${PNG}`;
const REPORT = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:12px;font:14px system-ui,sans-serif}
#count{font-size:20px;font-weight:700;margin-top:8px}
#shot{display:block;width:120px;height:90px;object-fit:cover;margin-top:8px}
a{display:inline-block;margin-top:8px}
</style></head><body>
<button id="b" type="button" style="width:180px;height:44px">Increment</button>
<div id="count">0</div>
<img id="shot" alt="rendered screenshot" src="${IMAGE_URI}" />
<a id="link" href="https://example.com/">example</a>
<script>
var count=0;
document.getElementById("b").addEventListener("click",function(){
  count+=1;
  document.getElementById("count").textContent=String(count);
  for(var i=1;i<=10;i+=1){
    parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/size-changed",params:{height:document.body.scrollHeight+i}},"*");
  }
},false);
var dynamic=document.createElement("script");
dynamic.textContent="window.__dynamicRan=true;";
document.body.appendChild(dynamic);
window.__scriptRan = true;
</script></body></html>`;

function theme(appearance: "light" | "dark") {
  return buildDocumentTheme(DEFAULT_HTML_DOCUMENT_COLORS[appearance], appearance);
}

async function evaluate(io: BrowserInteraction, expression: string, sessionId = io.sessionId) {
  const out = await io.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (out.exceptionDetails) throw new Error(out.exceptionDetails.text ?? "evaluation failed");
  return out.result?.value as unknown;
}

async function waitFor<T>(fn: () => Promise<T | null | undefined>, timeoutMs: number): Promise<T> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await fn().catch(() => null);
    if (value) return value;
    await new Promise((done) => setTimeout(done, 40));
  }
  throw new Error("browser interaction timed out");
}

interface ReceivedMessage {
  readonly kind: "ready" | "height" | "image" | "link" | "theme-ack";
  readonly messageId: number;
  readonly value?: unknown;
}

async function interact(io: BrowserInteraction, carrier: "fragment" | "title" = "fragment") {
  const iframeTarget = await waitFor(async () => {
    const targets = await io.send("Target.getTargets");
    return (targets.targetInfos ?? []).find(
      (info: { type?: string; parentId?: string }) => info.type === "iframe" && info.parentId === io.targetId,
    ) ?? null;
  }, 8_000);
  const attached = await io.send("Target.attachToTarget", { targetId: iframeTarget.targetId, flatten: true });
  const frameSession = attached.sessionId as string;
  const assembler = new NativeChunkAssembler(SESSION);
  const received: ReceivedMessage[] = [];
  let lastHash = "";

  const acknowledge = async (messageId: number, sequence: number) => {
    await evaluate(io, `document.dispatchEvent(new MessageEvent("message",{data:${JSON.stringify(JSON.stringify({
      type: "paseo-ack",
      session: SESSION,
      mid: messageId,
      seq: sequence,
    }))}}))`);
  };

  const handleComplete = (encoded: string, messageId: number) => {
    const decoded = decodeNativeTransportMessage(encoded);
    if (!decoded.ok) throw new Error(decoded.error);
    const value = decoded.value;
    const themeAck = readNativeThemeAck(value, SESSION);
    if (themeAck !== null) {
      received.push({ kind: "theme-ack", messageId, value: themeAck });
      return;
    }
    if (readReadyMessage(value)) {
      received.push({ kind: "ready", messageId });
      return;
    }
    const height = readSizeChangedMessage(value);
    if (height !== undefined) {
      received.push({ kind: "height", messageId, value: height });
      return;
    }
    const image = readOpenImageRequest(value);
    if (image) {
      received.push({ kind: "image", messageId, value: image });
      return;
    }
    const link = readOpenLinkRequest(value);
    if (link) {
      received.push({ kind: "link", messageId, value: link });
      return;
    }
    throw new Error("production receiver saw an unsupported complete message");
  };

  const pump = async (predicate: () => boolean, timeoutMs: number) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      // In title mode, never read the fragment carrier. This exercises the real
      // shell's title output and all interactions with the URL reply absent.
      const value = String(await evaluate(io, carrier === "title" ? "document.title" : "location.hash"));
      if (value !== lastHash) {
        lastHash = value;
        if (carrier === "title") assert.ok(value.length <= NATIVE_MAX_TITLE_CHARS);
        const error = carrier === "title" ? parseNativeErrorTitle(value) : parseNativeErrorUrl(`about:blank${value}`);
        if (error) throw new Error(`shell transport error: ${error}`);
        const parsed = carrier === "title" ? parseNativeTitle(value, SESSION) : parseNativeTransportUrl(`about:blank${value}`, SESSION);
        if (parsed?.ok && parsed.chunk) {
          const result = assembler.push(parsed.chunk);
          if (!result.ok) throw new Error(result.error);
          await acknowledge(parsed.chunk.messageId, parsed.chunk.sequence);
          if (assembler.complete) {
            const encoded = assembler.takeEncoded();
            if (encoded !== null) handleComplete(encoded, assembler.lastCompleted);
          }
        } else if (parsed && !parsed.ok && !parsed.stale) {
          throw new Error(parsed.error ?? "malformed transport chunk");
        }
      }
      if (predicate()) return;
      await new Promise((done) => setTimeout(done, 25));
    }
    throw new Error("production receiver timed out");
  };

  await waitFor(async () => await evaluate(io, "document.getElementById('b') !== null", frameSession), 8_000);
  await waitFor(async () => await evaluate(io, "window.__scriptRan === true && window.__dynamicRan === true", frameSession), 8_000);

  // A synthetic link request without activation must never become a transport message.
  await evaluate(io, `parent.postMessage({jsonrpc:"2.0",id:"synthetic",method:"ui/open-link",params:{url:"https://example.com/"}},"*")`, frameSession);
  await new Promise((done) => setTimeout(done, 350));
  assert.equal(received.some((message) => message.kind === "link"), false, "synthetic/no-activation link is rejected");

  const iframeRect = JSON.parse(String(await evaluate(io, `JSON.stringify(document.getElementById("f").getBoundingClientRect())`))) as { left: number; top: number };
  const buttonRect = JSON.parse(String(await evaluate(io, `JSON.stringify(document.getElementById("b").getBoundingClientRect())`, frameSession))) as { left: number; top: number; width: number; height: number };
  const click = async (rect: { left: number; top: number; width: number; height: number }) => {
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    await io.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 }, frameSession);
    await io.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 }, frameSession);
    void iframeRect;
  };
  await click(buttonRect);
  await pump(() => received.some((message) => message.kind === "ready") && received.some((message) => message.kind === "height"), 8_000);
  assert.ok(received.filter((message) => message.kind === "height").length <= 3, "burst size notifications stay coalesced");

  const shotRect = JSON.parse(String(await evaluate(io, `JSON.stringify(document.getElementById("shot").getBoundingClientRect())`, frameSession))) as { left: number; top: number; width: number; height: number };
  await click(shotRect);
  // Theme command is issued while the multi-chunk image is in flight.
  await evaluate(io, `document.dispatchEvent(new MessageEvent("message",{data:${JSON.stringify(JSON.stringify({
    type: "paseo-theme",
    session: SESSION,
    seq: 1,
    message: hostContextChangedMessage(theme("light")),
  }))}}))`);
  await pump(
    () => received.some((message) => message.kind === "image") && received.some((message) => message.kind === "theme-ack"),
    30_000,
  );
  const firstImage = received.find((message) => message.kind === "image")!;
  assert.deepEqual(firstImage.value, { src: IMAGE_URI, name: "rendered screenshot" });
  assert.ok(firstImage.messageId > 0);
  assert.equal(await evaluate(io, "getComputedStyle(document.documentElement).getPropertyValue('--background').trim()", frameSession), "#ffffff");
  assert.equal(await evaluate(io, "document.getElementById('count').textContent", frameSession), "1", "theme during image preserves state");

  // A delayed acknowledgement for the completed image must not advance anything.
  await acknowledge(firstImage.messageId, 0);
  await new Promise((done) => setTimeout(done, 120));
  assert.equal(received.filter((message) => message.kind === "image").length, 1);

  // The same image opened again is a new message, not a same-URL replay.
  await click(shotRect);
  await pump(
    () => received.filter((message) => message.kind === "image").length >= 2,
    30_000,
  );
  const images = received.filter((message) => message.kind === "image");
  assert.equal(images.length, 2);
  assert.deepEqual(images[0]!.value, images[1]!.value);
  assert.notEqual(images[0]!.messageId, images[1]!.messageId, "identical callbacks receive distinct transport messages");

  const linkRect = JSON.parse(String(await evaluate(io, `JSON.stringify(document.getElementById("link").getBoundingClientRect())`, frameSession))) as { left: number; top: number; width: number; height: number };
  await click(linkRect);
  await pump(() => received.some((message) => message.kind === "link"), 8_000);
  assert.equal((received.find((message) => message.kind === "link")!.value as { url: string }).url, "https://example.com/");

  const historyLength = await evaluate(io, "history.length");
  const parentAccess = await evaluate(io, `(function(){try{return parent.document.body.innerHTML.length>0?"accessed":"empty";}catch(error){return error.name;}})()`, frameSession);
  const storage = await evaluate(io, `(function(){try{localStorage.setItem("probe","1");return "allowed";}catch(error){return error.name;}})()`, frameSession);
  const bridge = await evaluate(io, "typeof window.ReactNativeWebView", frameSession);
  const remote = await evaluate(io, `fetch("https://example.com/blocked").then(function(){return "allowed";}).catch(function(){return "blocked";})`, frameSession);
  const imageWidth = await evaluate(io, "document.getElementById('shot').naturalWidth", frameSession);
  const scriptRan = await evaluate(io, "window.__scriptRan === true && window.__dynamicRan === true", frameSession);
  await evaluate(io, `window.__result=${JSON.stringify({
    count: await evaluate(io, "document.getElementById('count').textContent", frameSession),
    background: await evaluate(io, "getComputedStyle(document.documentElement).getPropertyValue('--background').trim()", frameSession),
    historyLength,
    parentAccess,
    storage,
    bridge,
    remote,
    imageWidth,
    scriptRan,
    imageCalls: images.length,
    distinctMessageIds: new Set(images.map((message) => message.messageId)).size,
    imagePayloadChars: IMAGE_URI.length,
    chunkChars: NATIVE_MAX_CHUNK_CHARS,
    linkForwarded: received.some((message) => message.kind === "link"),
    syntheticBlocked: !received.some((message) => message.kind === "link" && message.messageId === 0),
    themeAck: received.some((message) => message.kind === "theme-ack"),
    heightMessages: received.filter((message) => message.kind === "height").length,
    innerText: await evaluate(io, "document.body.innerText", frameSession),
  })}`);
}

for (const carrier of ["fragment", "title"] as const) {
test(`native shell runs scripts, clicks, multi-chunk images and active-transfer theme changes over ${carrier}`, { timeout: 90_000 }, async () => {
  const inner = buildLiveDocument({ html: REPORT, title: "Native report", theme: theme("dark") });
  const shell = buildNativeShellDocument(inner, SESSION);
  const result = await browserResult(shell, { interact: (io) => interact(io, carrier), viewport: { width: 800, height: 600 }, navigation: "data" }) as Record<string, unknown>;
  assert.equal(result.scriptRan, true, "arbitrary authored and dynamically created inline scripts ran");
  assert.equal(result.count, "1", "the real click changed state");
  assert.equal(result.background, "#ffffff", "theme changed during image transfer");
  assert.ok(Number(result.imageWidth) > 0, "the real rendered PNG loaded inside the opaque report frame");
  assert.ok(Number(result.imagePayloadChars) > Number(result.chunkChars), "image requires more than one fragment");
  assert.equal(result.imageCalls, 2, "both identical image opens were delivered");
  assert.equal(result.distinctMessageIds, 2, "identical opens use distinct message ids");
  assert.equal(result.linkForwarded, true, "genuine link activation was forwarded");
  assert.equal(result.themeAck, true, "theme acknowledgement travelled through the ordered transport");
  assert.ok(Number(result.historyLength) <= 2, "transport uses replace, not a growing history");
  assert.equal(result.parentAccess, "SecurityError");
  assert.equal(result.storage, "SecurityError");
  assert.equal(result.bridge, "undefined");
  assert.equal(result.remote, "blocked");
});
}

test("native shell exposes a missing acknowledgement as a visible transport failure", { timeout: 30_000 }, async () => {
  const inner = buildLiveDocument({ html: "<p>waiting</p>", title: "No ack", theme: theme("dark") });
  const shell = buildNativeShellDocument(inner, SESSION);
  const result = await browserResult(shell, {
    viewport: { width: 800, height: 600 },
    navigation: "data",
    interact: async (io) => {
      await waitFor(async () => String(await evaluate(io, "location.hash")).startsWith("#paseo-p2n="), 3_000);
      const sentAt = Date.now();
      // A late retry request must not re-arm the chunk deadline. The old retry
      // implementation failed this bounded wait.
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      await evaluate(io, `document.dispatchEvent(new MessageEvent("message",{data:${JSON.stringify(JSON.stringify({
        type: "paseo-ready-probe", session: SESSION,
      }))}}))`);
      const hash = await waitFor(async () => {
        const value = String(await evaluate(io, "location.hash"));
        return value.startsWith("#paseo-error=") ? value : null;
      }, 10_000);
      await evaluate(io, `window.__result=${JSON.stringify({ hash, elapsed: Date.now() - sentAt })}`);
    },
  }) as Record<string, unknown>;
  assert.equal(result.hash, "#paseo-error=ack-timeout");
  // One resend on every channel after the first deadline, then fail at the
  // second: about two deadlines, never more.
  assert.ok(Number(result.elapsed) > NATIVE_ACK_TIMEOUT_MS, `failed too early: ${String(result.elapsed)} ms`);
  assert.ok(Number(result.elapsed) < 2 * NATIVE_ACK_TIMEOUT_MS + 2_000, `failed too late: ${String(result.elapsed)} ms`);
});

test("native shell resends genuine ready after a lost initial native fragment", { timeout: 30_000 }, async () => {
  const inner = buildLiveDocument({ html: "<p>ready retry</p>", title: "Ready retry", theme: theme("dark") });
  const shell = buildNativeShellDocument(inner, SESSION);
  const result = await browserResult(shell, {
    viewport: { width: 800, height: 600 },
    navigation: "data",
    interact: async (io) => {
      const first = await waitFor(async () => {
        const hash = String(await evaluate(io, "location.hash"));
        return hash.startsWith("#paseo-p2n=") ? hash : null;
      }, 8_000);
      const firstParsed = parseNativeTransportUrl(`about:blank${first}`, SESSION);
      await evaluate(io, `document.dispatchEvent(new MessageEvent("message",{data:${JSON.stringify(JSON.stringify({
        type: "paseo-ready-probe",
        session: SESSION,
      }))}}))`);
      const second = await waitFor(async () => {
        const hash = String(await evaluate(io, "location.hash"));
        return hash !== first && hash.startsWith("#paseo-p2n=") ? hash : null;
      }, 3_000);
      const secondParsed = parseNativeTransportUrl(`about:blank${second}`, SESSION);
      const assembler = new NativeChunkAssembler(SESSION);
      if (!secondParsed?.ok || !secondParsed.chunk) throw new Error("retry chunk did not parse");
      const pushed = assembler.push(secondParsed.chunk);
      if (!pushed.ok) throw new Error(pushed.error);
      const encoded = assembler.takeEncoded();
      const decoded = encoded === null ? { ok: false as const, error: "not complete" } : decodeNativeTransportMessage(encoded);
      if (!decoded.ok) throw new Error(decoded.error);
      await evaluate(io, `document.dispatchEvent(new MessageEvent("message",{data:${JSON.stringify(JSON.stringify({
        type: "paseo-ack",
        session: SESSION,
        mid: secondParsed.chunk.messageId,
        seq: secondParsed.chunk.sequence,
      }))}}))`);
      await evaluate(io, `window.__result=${JSON.stringify({
        first,
        second,
        firstOk: firstParsed?.ok === true,
        secondOk: secondParsed.ok === true,
        sameMessageId: firstParsed?.chunk?.messageId === secondParsed.chunk.messageId,
        sameData: firstParsed?.chunk?.data === secondParsed.chunk.data,
        ready: readReadyMessage(decoded.value),
        retrySuffix: /;r=\d+$/.test(second),
      })}`);
    },
  }) as Record<string, unknown>;
  assert.equal(result.firstOk, true);
  assert.equal(result.secondOk, true);
  assert.equal(result.sameMessageId, true, "retry keeps the original message id");
  assert.equal(result.sameData, true, "retry carries the same ready payload");
  assert.equal(result.ready, true, "a genuine ready handshake is still required");
  assert.equal(result.retrySuffix, true, "retry changes the fragment so the native event is deliverable");
});

test("an early probe cannot cancel automatic retries of the genuine inner ready", { timeout: 30_000 }, async () => {
  const inner = buildLiveDocument({ html: "<p>early probe</p>", title: "Early probe", theme: theme("dark") });
  const original = buildNativeShellDocument(inner, SESSION);
  // Test-only scheduling hook: receive the native command before assigning
  // srcdoc, so a probe-response timer is pending when the real ready arrives.
  const shell = original.replace("f.srcdoc=INNER;", `document.dispatchEvent(new MessageEvent("message",{data:${JSON.stringify(JSON.stringify({
    type: "paseo-ready-probe", session: SESSION,
  }))}}));setTimeout(function(){f.srcdoc=INNER;},100);`);
  assert.notEqual(shell, original);
  const result = await browserResult(shell, {
    navigation: "data",
    interact: async (io) => {
      const first = await waitFor(async () => {
        const hash = String(await evaluate(io, "location.hash"));
        return hash.startsWith("#paseo-p2n=") ? hash : null;
      }, 3_000);
      // No new native probe or ack: only the bounded automatic retry may
      // change the fragment while preserving the original message identity.
      const retry = await waitFor(async () => {
        const hash = String(await evaluate(io, "location.hash"));
        return hash !== first && hash.startsWith("#paseo-p2n=") ? hash : null;
      }, 3_000);
      const a = parseNativeTransportUrl(first, SESSION);
      const b = parseNativeTransportUrl(retry, SESSION);
      if (!a?.ok || !b?.ok || !a.chunk || !b.chunk) throw new Error("ready retry failed to parse");
      const decoded = decodeNativeTransportMessage(b.chunk.data);
      await evaluate(io, `window.__result=${JSON.stringify({
        same: JSON.stringify(a.chunk) === JSON.stringify(b.chunk),
        ready: decoded.ok && readReadyMessage(decoded.value),
        suffix: /;r=\d+$/.test(retry),
      })}`);
    },
  }) as Record<string, unknown>;
  assert.equal(result.same, true);
  assert.equal(result.ready, true);
  assert.equal(result.suffix, true);
});

/** Install a test-only RNCWebView bridge object before the trusted shell runs. */
function withBridge(shell: string): string {
  const marker = "<body>";
  const at = shell.indexOf(marker);
  if (at < 0) throw new Error("shell body is missing");
  const prelude = `${marker}<script>window.__bridge=[];window.ReactNativeWebView={postMessage:function(payload){window.__bridge.push(String(payload));}};</script>`;
  return shell.slice(0, at) + prelude + shell.slice(at + marker.length);
}

async function readBridge(io: BrowserInteraction): Promise<Record<string, unknown>[]> {
  const raw = await evaluate(io, "JSON.stringify(window.__bridge||[])");
  return (JSON.parse(String(raw)) as string[]).map((entry) => JSON.parse(entry) as Record<string, unknown>);
}

test("native shell sends each page->native chunk on the onMessage bridge and as a fragment URL", { timeout: 30_000 }, async () => {
  const inner = buildLiveDocument({ html: "<p>bridge primary</p>", title: "Bridge", theme: theme("dark") });
  const shell = withBridge(buildNativeShellDocument(inner, SESSION));
  const result = await browserResult(shell, {
    viewport: { width: 800, height: 600 },
    navigation: "data",
    interact: async (io) => {
      const payloads = await waitFor(async () => {
        const list = await readBridge(io);
        return list.length > 0 ? list : null;
      }, 8_000);
      const first = payloads[0]!;
      // The same chunk also goes out as a fragment, because Android drops bridge
      // messages for a raw RNCWebView mount.
      const hash = await waitFor(async () => {
        const value = String(await evaluate(io, "location.hash"));
        return value.startsWith("#paseo-p2n=") ? value : null;
      }, 1_500);
      await evaluate(io, `document.dispatchEvent(new MessageEvent("message",{data:${JSON.stringify(JSON.stringify({
        type: "paseo-ack",
        session: SESSION,
        mid: first.mid,
        seq: first.seq,
      }))}}))`);
      await new Promise((done) => setTimeout(done, 250));
      await evaluate(io, `window.__result=${JSON.stringify({
        first,
        hash,
        // The shell moves on to its next message after an ack; only a resend of
        // the acknowledged chunk would be wrong.
        payloadCount: (await readBridge(io)).filter((p) => p.mid === first.mid && p.seq === first.seq).length,
        errorHash: String(await evaluate(io, "location.hash")).startsWith("#paseo-error="),
      })}`);
    },
  }) as Record<string, unknown>;
  const fragment = parseNativeTransportUrl(`about:blank${String(result.hash)}`, SESSION);
  assert.ok(fragment?.ok && fragment.chunk, "the fragment copy parses");
  assert.equal(fragment.chunk.messageId, (result.first as { mid?: number }).mid, "same message identity on both channels");
  assert.equal(fragment.chunk.data, (result.first as { data?: string }).data, "same chunk payload on both channels");
  assert.equal(result.errorHash, false);
  const first = result.first as { type?: string; session?: string; mid?: number; seq?: number; total?: number; data?: string };
  assert.equal(first.type, "paseo-p2n");
  assert.equal(first.session, SESSION);
  assert.equal(first.mid, 1);
  assert.equal(first.seq, 0);
  assert.equal(first.total, 1);
  const decoded = decodeNativeTransportMessage(String(first.data));
  assert.equal(decoded.ok, true);
  assert.equal(readReadyMessage(decoded.ok ? decoded.value : null), true, "the bridge carries the genuine ready payload");
  assert.equal(Number(result.payloadCount), 1, "an acknowledged chunk is not resent");
});

test("a bridge that silently drops messages does not delay the fragment copy", { timeout: 40_000 }, async () => {
  const inner = buildLiveDocument({ html: "<p>bridge fallback</p>", title: "Fallback", theme: theme("dark") });
  const shell = withBridge(buildNativeShellDocument(inner, SESSION));
  const result = await browserResult(shell, {
    viewport: { width: 800, height: 600 },
    navigation: "data",
    interact: async (io) => {
      // The device case: the bridge accepts postMessage and nothing arrives. The
      // fragment copy must already be out, not wait for an ack timeout.
      const payloads = await waitFor(async () => {
        const list = await readBridge(io);
        return list.length > 0 ? list : null;
      }, 8_000);
      const first = payloads[0]!;
      const fallback = await waitFor(async () => {
        const hash = String(await evaluate(io, "location.hash"));
        return hash.startsWith("#paseo-p2n=") ? hash : null;
      }, 1_500);
      const parsed = parseNativeTransportUrl(`about:blank${fallback}`, SESSION);
      if (!parsed?.ok || !parsed.chunk) throw new Error("fallback chunk did not parse");
      await evaluate(io, `document.dispatchEvent(new MessageEvent("message",{data:${JSON.stringify(JSON.stringify({
        type: "paseo-ack",
        session: SESSION,
        mid: parsed.chunk.messageId,
        seq: parsed.chunk.sequence,
      }))}}))`);
      await new Promise((done) => setTimeout(done, 300));
      await evaluate(io, `window.__result=${JSON.stringify({
        fallback,
        firstMid: first.mid,
        firstData: first.data,
        chunkMid: parsed.chunk.messageId,
        chunkData: parsed.chunk.data,
        retrySuffix: /;r=\\d+$/.test(fallback),
        errorHash: String(await evaluate(io, "location.hash")).startsWith("#paseo-error="),
        bridgeCount: (await readBridge(io)).length,
      })}`);
    },
  }) as Record<string, unknown>;
  assert.equal(result.errorHash, false, "the fallback recovers the transfer instead of failing");
  assert.equal(result.retrySuffix, false, "the first fragment delivery of that chunk needs no retry suffix");
  assert.equal(result.chunkMid, result.firstMid, "the fallback reuses the bridge message identity");
  assert.equal(result.chunkData, result.firstData, "the fallback carries the same chunk payload");
  const decoded = decodeNativeTransportMessage(String(result.chunkData));
  assert.equal(decoded.ok, true);
  assert.equal(readReadyMessage(decoded.ok ? decoded.value : null), true);
});

test("the shell sets the document title to the same bounded chunk before each fragment navigation", { timeout: 90_000 }, async () => {
  const inner = buildLiveDocument({ html: "<p>title carrier</p>", title: "Title carrier", theme: theme("dark") });
  const shell = buildNativeShellDocument(inner, SESSION);
  // Record the title assignment synchronously (it observes location.hash at the
  // instant of the write) and pair it with the hash each committed navigation
  // produced. A title written after the navigation would see the new hash.
  const instrumented = shell.replace("<body>", `<body><script>
window.__pairs=[];
window.__titleLog=[];
window.addEventListener("hashchange",function(){window.__pairs.push({hash:location.hash,title:document.title});});
(function(){var descriptor=Object.getOwnPropertyDescriptor(Document.prototype,"title");
Object.defineProperty(document,"title",{configurable:true,get:function(){return descriptor.get.call(document);},
set:function(value){window.__titleLog.push({value:value,hash:location.hash});descriptor.set.call(document,value);}});})();
</script>`);
  const result = await browserResult(instrumented, {
    viewport: { width: 800, height: 600 },
    navigation: "data",
    interact: async (io) => {
      const pairs: Array<{ hash: string; title: string }> = [];
      let acknowledged = 0;
      const collectDeadline = Date.now() + 9_000;
      while (Date.now() < collectDeadline && pairs.length < 2) {
        const raw = String(await evaluate(io, "JSON.stringify(window.__pairs||[])")) ?? "[]";
        const all = JSON.parse(raw) as Array<{ hash: string; title: string }>;
        while (pairs.length < all.length) pairs.push(all[pairs.length]!);
        for (; acknowledged < pairs.length; acknowledged += 1) {
          const parsed = parseNativeTransportUrl(`about:blank${pairs[acknowledged]!.hash}`, SESSION);
          if (parsed?.ok && parsed.chunk) {
            await evaluate(io, `document.dispatchEvent(new MessageEvent("message",{data:${JSON.stringify(JSON.stringify({
              type: "paseo-ack", session: SESSION, mid: parsed.chunk.messageId, seq: parsed.chunk.sequence,
            }))}}))`);
          }
        }
        await new Promise((done) => setTimeout(done, 40));
      }
      const titleLog = JSON.parse(String(await evaluate(io, "JSON.stringify(window.__titleLog||[])"))) as Array<{ value: string; hash: string }>;
      const mounted = Boolean(await evaluate(io, "document.getElementById('f') !== null"));
      const errorHash = String(await evaluate(io, "location.hash.indexOf('#paseo-error=') === 0"));
      await evaluate(io, `window.__result=${JSON.stringify({ pairs, titleLog, mounted, errorHash })}`);
    },
  }) as Record<string, any>;
  const pairs = result.pairs as Array<{ hash: string; title: string }>;
  const titleLog = result.titleLog as Array<{ value: string; hash: string }>;
  assert.ok(pairs.length >= 2, "at least two chunks committed a navigation");
  assert.equal(result.mounted, true, "the report frame stayed mounted");
  assert.equal(result.errorHash, "false", "the shell never failed its transfer");
  for (const pair of pairs) {
    const fromTitle = parseNativeTitle(pair.title, SESSION);
    const fromUrl = parseNativeTransportUrl(`about:blank${pair.hash}`, SESSION);
    assert.equal(fromTitle?.ok, true, "the document title parses as a transport chunk");
    assert.equal(fromUrl?.ok, true, "the fragment still commits in an about:blank fixture");
    assert.deepEqual(fromTitle!.chunk, fromUrl!.chunk, "title and fragment describe the same chunk");
    assert.ok(pair.title.startsWith(NATIVE_TITLE_PREFIX));
    assert.ok(pair.title.length <= NATIVE_MAX_TITLE_CHARS, `${pair.title.length} chars stay under the title cap`);
  }
  const transportTitles = titleLog.filter((entry) => entry.value.startsWith(NATIVE_TITLE_PREFIX));
  assert.ok(transportTitles.length >= pairs.length, "every navigation was preceded by a title write");
  pairs.forEach((pair, index) => {
    const write = transportTitles.find((entry) => entry.value === pair.title);
    assert.ok(write, `title for chunk ${index} was written`);
    // The write observed the PREVIOUS committed hash: the title is set before
    // location.replace, not after it.
    const previous = index === 0 ? "" : pairs[index - 1]!.hash;
    assert.equal(write!.hash, previous, `title ${index} was written before its own navigation committed`);
  });
  assert.ok(new Set(pairs.map((pair) => pair.title)).size >= 2, "distinct chunks produced distinct titles");
});
