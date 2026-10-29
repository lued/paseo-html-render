import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveDocument } from "../shared/html-document.ts";
import { buildNativeShellDocument, NATIVE_DIAGNOSTIC_REVISION } from "../client/native-html-protocol.ts";
import { browserResult, type BrowserInteraction } from "./helpers/browser.ts";

const SESSION = "diagnostic-private-session";
const PRIVATE = "private-report-payload-marker";

function fixture() {
  const shell = buildNativeShellDocument(buildLiveDocument({ html: `<p>${PRIVATE}</p>` }), SESSION);
  // Simulate the Android router accepting sends without dispatching onMessage.
  return shell.replace("<body>", `<body><script>window.__bridge=[];window.ReactNativeWebView={postMessage:function(s){window.__bridge.push(JSON.parse(s));}};</script>`);
}

async function evaluate(io: BrowserInteraction, expression: string) {
  const out = await io.send("Runtime.evaluate", { expression, returnByValue: true }, io.sessionId);
  if (out.exceptionDetails) throw new Error(out.exceptionDetails.text ?? "evaluation failed");
  return out.result?.value;
}

async function until(io: BrowserInteraction, expression: string, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await evaluate(io, expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Diagnostic condition timed out: ${expression}`);
}

function dispatch(io: BrowserInteraction, value: unknown) {
  return evaluate(io, `document.dispatchEvent(new MessageEvent("message",{data:${JSON.stringify(JSON.stringify(value))}}))`);
}

test("a real data URL reproduces blocked fragment sends and exposes page-side evidence without native replies", { timeout: 30_000 }, async () => {
  const result = await browserResult(fixture(), {
    navigation: "data-url",
    interact: async (io) => {
      await until(io, "window.__bridge && window.__bridge.length > 0");
      assert.equal(await evaluate(io, "document.getElementById('transport-diagnostic').hidden"), true, "no strip during normal loading");
      await dispatch(io, { type: "paseo-ready-probe", session: SESSION });
      await until(io, "!document.getElementById('transport-diagnostic').hidden");
      await evaluate(io, `window.__result={scheme:location.protocol,hash:location.hash,text:document.getElementById('transport-diagnostic').textContent,mounted:!!document.getElementById('f'),payload:window.__bridge[0]}`);
    },
  }) as Record<string, any>;
  assert.equal(result.scheme, "data:", "unlike the legacy data fixture, this is a real data URL");
  assert.equal(result.hash, "", "Chromium blocks location.replace fragment navigation in a top-level data URL");
  assert.equal(result.mounted, true, "diagnosis never tears down the report");
  assert.equal(JSON.parse(decodeURIComponent(result.payload.data)).method, "ui/notifications/ready", "the genuine inner ready did reach the shell");
  assert.match(result.text, new RegExp(`Transport ${NATIVE_DIAGNOSTIC_REVISION}`));
  assert.match(result.text, /page data: \d+ chars, hash 0/);
  assert.match(result.text, /iframe loads [1-9]\d*, events [1-9]\d*, inner [1-9]\d*, ready [1-9]\d*/);
  assert.match(result.text, /native 1, probes received 1/);
  assert.match(result.text, /bridge [1-9]\d*, bridge errors 0, fragments sent [1-9]\d*, navigation errors 0/,
    "an attempted navigation may be silently blocked, not throw");
  for (const secret of [SESSION, PRIVATE, result.payload.data, "data:text/html"]) {
    assert.equal(result.text.includes(secret), false, "strip contains only scheme, lengths, bounded counters and a fixed build ID");
  }
});

test("a late genuine ready ack hides the local strip without remounting the report", { timeout: 30_000 }, async () => {
  const result = await browserResult(fixture(), {
    // This is intentionally about:blank, not Android/WebView evidence.
    navigation: "data",
    interact: async (io) => {
      await until(io, "window.__bridge && window.__bridge.length > 0");
      await until(io, "!document.getElementById('transport-diagnostic').hidden");
      const before = await evaluate(io, "document.getElementById('transport-diagnostic').textContent");
      const first = await evaluate(io, "window.__bridge[0]");
      await dispatch(io, { type: "paseo-ack", session: SESSION, mid: first.mid, seq: first.seq });
      await until(io, "document.getElementById('transport-diagnostic').hidden");
      await evaluate(io, `window.__result={before:${JSON.stringify(before)},hidden:document.getElementById('transport-diagnostic').hidden,mounted:!!document.getElementById('f')}`);
    },
  }) as Record<string, any>;
  assert.match(result.before, /page about: \d+ chars, hash [1-9]\d*/);
  assert.equal(result.hidden, true);
  assert.equal(result.mounted, true);
});
