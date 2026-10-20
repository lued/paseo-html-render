import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findChromiumExecutable } from "../server/renderer.ts";
import {
  DEFAULT_HTML_DOCUMENT_COLORS,
  HTML_DOCUMENT_BASE_CSS,
  HTML_DOCUMENT_CSP,
  HTML_DOCUMENT_RUNTIME_SCRIPT,
  HTML_FRAME_MAX_HEIGHT,
  HTML_FRAME_MIN_HEIGHT,
  HTML_FRAME_SANDBOX,
  MAX_INTERACTIVE_HTML_BYTES,
  appearanceFromColors,
  assertInteractiveDocumentBudget,
  buildDocumentTheme,
  buildInteractiveDocument,
  buildLiveDocument,
  clampFrameHeight,
  defaultDocumentTheme,
  documentByteLength,
  frameHeightFor,
  hostContextChangedMessage,
  leadingDoctypeEnd,
  measuredHeightAt,
  normalizeMeasuredHeights,
  readHostContextThemeMessage,
  readOpenImageRequest,
  readOpenLinkRequest,
  readReadyMessage,
  readSizeChangedMessage,
  readyAckMessage,
  sanitizeCssValue,
  selectHtmlFrameKind,
  themeRootCss,
} from "../shared/html-document.ts";

// Pure helpers -----------------------------------------------------------------

test("theme tokens cover the T3-like map and sanitize every value", () => {
  const theme = buildDocumentTheme(
    {
      ...DEFAULT_HTML_DOCUMENT_COLORS.dark,
      surface0: "#101010",
      accent: "red;}body{display:none",
    },
    "dark",
  );
  for (const name of [
    "--background",
    "--foreground",
    "--muted",
    "--muted-foreground",
    "--card",
    "--card-foreground",
    "--popover",
    "--popover-foreground",
    "--secondary",
    "--secondary-foreground",
    "--border",
    "--input",
    "--ring",
    "--primary",
    "--primary-foreground",
    "--accent",
    "--accent-foreground",
    "--accent-surface",
    "--accent-surface-foreground",
    "--destructive",
    "--destructive-foreground",
    "--destructive-surface",
    "--warning",
    "--warning-foreground",
    "--warning-surface",
    "--success",
    "--success-foreground",
    "--info",
    "--info-foreground",
    "--code-background",
    "--code-foreground",
    "--chart-1",
    "--chart-2",
    "--chart-3",
    "--chart-4",
    "--chart-5",
    "--chart-6",
    "--radius",
    "--font-sans",
    "--font-mono",
  ]) {
    assert.equal(typeof theme.variables[name], "string", name);
    assert.ok(!/[;{}<>\\]/.test(theme.variables[name]!), name);
  }
  assert.equal(theme.variables["--background"], "#101010");
  assert.equal(theme.variables["--accent"], "redbodydisplay:none");
  assert.equal(theme.appearance, "dark");
});

test("themeRootCss emits one bounded root rule for the screenshot renderer", () => {
  const theme = buildDocumentTheme(DEFAULT_HTML_DOCUMENT_COLORS.dark, "dark");
  const css = themeRootCss(theme);
  assert.ok(css.startsWith(":root{color-scheme:dark;--background:#111111;"));
  assert.ok(css.endsWith("}"));
  assert.equal((css.match(/:root\{/g) ?? []).length, 1);
  assert.ok(!/[<>]/.test(css));
});

test("CSS sanitizer strips breakout, control, and remote values", () => {
  assert.equal(sanitizeCssValue("</style><script>alert(1)</script>"), "/stylescriptalert(1)/script");
  assert.equal(sanitizeCssValue("red;background:url(http://evil)"), "");
  assert.equal(sanitizeCssValue("expression(alert(1))"), "");
  assert.equal(sanitizeCssValue("a\u0000b"), "ab");
  assert.equal(sanitizeCssValue(42), "");
  assert.equal(sanitizeCssValue("#112233"), "#112233");
});

test("appearance inference is conservative and overridable", () => {
  assert.equal(appearanceFromColors({ surface0: "#ffffff", surface1: "#ffffff" }), "light");
  assert.equal(appearanceFromColors({ surface0: "#111111", surface1: "#111111" }), "dark");
  assert.equal(appearanceFromColors({ surface0: "not-a-color", surface1: "" }, "light"), "light");
  assert.equal(defaultDocumentTheme("light").appearance, "light");
});

test("the installed CSP blocks network/forms/frames/files and never allows eval", () => {
  for (const directive of [
    "default-src 'none'",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "worker-src 'none'",
    "child-src 'none'",
    "img-src data:",
    "font-src data:",
    "media-src data:",
  ]) {
    assert.ok(HTML_DOCUMENT_CSP.includes(directive), directive);
  }
  assert.ok(!/unsafe-eval/.test(HTML_DOCUMENT_CSP));
  assert.ok(!/same-origin/.test(HTML_DOCUMENT_CSP));
  assert.equal(HTML_FRAME_SANDBOX, "allow-scripts");
  assert.ok(!/same-origin|forms|popups|navigation/.test(HTML_FRAME_SANDBOX));
});

test("the runtime parses, has no eval/Function, and exposes no host commands", () => {
  assert.doesNotThrow(() => new Function(HTML_DOCUMENT_RUNTIME_SCRIPT));
  assert.ok(!/\beval\s*\(/.test(HTML_DOCUMENT_RUNTIME_SCRIPT));
  assert.ok(!/new\s+Function/.test(HTML_DOCUMENT_RUNTIME_SCRIPT));
  assert.ok(HTML_DOCUMENT_RUNTIME_SCRIPT.includes("ui/notifications/host-context-changed"));
  assert.ok(HTML_DOCUMENT_RUNTIME_SCRIPT.includes("ui/notifications/size-changed"));
  assert.ok(HTML_DOCUMENT_RUNTIME_SCRIPT.includes("ui/notifications/ready"));
  assert.ok(!HTML_DOCUMENT_BASE_CSS.includes("100vh"));
  assert.ok(!HTML_DOCUMENT_BASE_CSS.includes("min-height"));
});

test("interactive documents start with an early CSP and prefers-color-scheme defaults", () => {
  const document = buildInteractiveDocument({ html: "<h1>Hello</h1>", title: "Report" });
  assert.ok(document.startsWith("<!doctype html><head>"));
  assert.ok(document.includes("Content-Security-Policy"));
  assert.ok(document.indexOf("Content-Security-Policy") < document.indexOf("<h1>"));
  assert.ok(document.includes("prefers-color-scheme: light"));
  assert.ok(document.includes("color-scheme:dark"));
  assert.ok(document.includes("<title>Report</title>"));
  assert.ok(document.includes(`id="paseo-html-theme"`));
  assert.ok(!document.includes("allow-same-origin"));
});

test("a leading doctype is preserved exactly once with the bootstrap after it", () => {
  const input = "<!doctype html><html><body><h1>Hi</h1></body></html>";
  const document = buildInteractiveDocument({ html: input });
  assert.ok(document.startsWith("<!doctype html><head>"));
  assert.equal((document.match(/<!doctype/gi) ?? []).length, 1);
  assert.ok(document.indexOf("Content-Security-Policy") < document.indexOf("<html>"));
});

test("leading comments survive before the doctype, and the CSP precedes content", () => {
  const input = "<!-- generator: test --><!DOCTYPE HTML><html><body><p>Body</p></body></html>";
  const document = buildInteractiveDocument({ html: input });
  assert.ok(document.startsWith("<!-- generator: test --><!DOCTYPE HTML><head>"));
  assert.ok(document.indexOf("Content-Security-Policy") < document.indexOf("<p>Body</p>"));
  assert.equal((document.match(/<!doctype/gi) ?? []).length, 1);
});

test("doctype internal subsets and quoted declarations are handled", () => {
  const input = '<!DOCTYPE html [ <!ENTITY note "a > b"> ]><p>Subset</p>';
  const document = buildInteractiveDocument({ html: input });
  assert.ok(document.startsWith(`<!DOCTYPE html [ <!ENTITY note "a > b"> ]><head>`));
  assert.ok(document.indexOf("Content-Security-Policy") < document.indexOf("<p>Subset</p>"));
});

test("a comment inside a doctype subset does not terminate it early", () => {
  const input = '<!DOCTYPE html [ <!-- > --> <!ENTITY note "x"> ]><p>Inside</p>';
  const document = buildInteractiveDocument({ html: input });
  assert.ok(document.startsWith(`<!DOCTYPE html [ <!-- > --> <!ENTITY note "x"> ]><head>`));
  assert.ok(document.indexOf("Content-Security-Policy") < document.indexOf("<p>Inside</p>"));
});

test("an unterminated doctype is not trusted; the bootstrap is prefixed", () => {
  const document = buildInteractiveDocument({ html: "<!doctype html" });
  assert.ok(document.startsWith("<!doctype html><head>"));
  assert.ok(document.indexOf("Content-Security-Policy") < document.lastIndexOf("<!doctype html"));
  assert.equal(leadingDoctypeEnd("<!doctype html"), null);
});

test("hostile head shapes cannot capture the bootstrap", () => {
  const inputs = [
    "<!-- <head></head> --><script>window.x=1</script>",
    "<template><head><script>window.x=1</script></head></template>",
    "<plaintext><head><script>window.x=1</script></head>",
    '<div data-x="<head><script>window.x=1</script>"></div>',
    "<svg><foreignObject><head><script>window.x=1</script></head></foreignObject></svg>",
    "<script>var s='<head></head>'</script>",
  ];
  for (const input of inputs) {
    const document = buildInteractiveDocument({ html: input });
    assert.ok(document.startsWith("<!doctype html><head>"), input);
    assert.ok(document.indexOf("Content-Security-Policy") < 200, input);
    assert.equal((document.match(/<!doctype/gi) ?? []).length, 1, input);
  }
});

test("BOM is stripped and title text is escaped", () => {
  const document = buildInteractiveDocument({
    html: "\uFEFF<p>x</p>",
    title: '<b>&"',
  });
  assert.ok(document.startsWith("<!doctype html><head>"));
  assert.ok(document.includes("<title>&lt;b&gt;&amp;&quot;</title>"));
  assert.ok(document.endsWith("<p>x</p>"));
});

test("live documents start with the host theme and omit the media fallback rule", () => {
  const theme = buildDocumentTheme(DEFAULT_HTML_DOCUMENT_COLORS.light, "light");
  const document = buildLiveDocument({ html: "<p>x</p>", theme });
  assert.ok(document.includes("color-scheme:light"));
  assert.ok(document.includes("#ffffff"));
  assert.ok(!document.includes("@media (prefers-color-scheme: light)"));
});

test("stored interactive documents get one live bootstrap without overriding the host theme", () => {
  const stored = buildInteractiveDocument({ html: "<p>Inlined image page</p>", title: "Stored" });
  const live = buildLiveDocument({ html: stored, title: "Live", theme: defaultDocumentTheme("light") });
  assert.equal((live.match(/<style id="paseo-html-theme"/g) ?? []).length, 1);
  assert.equal((live.match(/Content-Security-Policy/g) ?? []).length, 1);
  assert.ok(!live.includes("@media (prefers-color-scheme: light)"));
  assert.ok(live.includes("<p>Inlined image page</p>"));
  const olderRuntime = stored.replace(
    HTML_DOCUMENT_RUNTIME_SCRIPT,
    HTML_DOCUMENT_RUNTIME_SCRIPT.replace("var P=window.parent;", "var P=window.parent;/* previous runtime revision */"),
  );
  const upgraded = buildLiveDocument({ html: olderRuntime, theme: defaultDocumentTheme("light") });
  assert.equal((upgraded.match(/<style id="paseo-html-theme"/g) ?? []).length, 1);
  assert.equal((upgraded.match(/Content-Security-Policy/g) ?? []).length, 1);
  assert.ok(!upgraded.includes("previous runtime revision"), "old exports do not install a second runtime");
  assert.ok(!upgraded.includes("@media (prefers-color-scheme: light)"));
  assert.ok(upgraded.includes("<p>Inlined image page</p>"));
});

test("the interactive document budget is enforced as UTF-8 bytes", () => {
  assert.equal(documentByteLength("é"), 2);
  assert.equal(assertInteractiveDocumentBudget("hello"), 5);
  assert.throws(
    () => assertInteractiveDocumentBudget("a".repeat(MAX_INTERACTIVE_HTML_BYTES + 1)),
    RangeError,
  );
  assert.throws(
    () => assertInteractiveDocumentBudget("é".repeat(MAX_INTERACTIVE_HTML_BYTES / 2 + 1)),
    RangeError,
  );
});

test("theme messages round-trip through the strict host reader", () => {
  const theme = buildDocumentTheme(DEFAULT_HTML_DOCUMENT_COLORS.dark, "dark");
  const message = hostContextChangedMessage(theme);
  assert.equal(message.method, "ui/notifications/host-context-changed");
  const read = readHostContextThemeMessage(message);
  assert.equal(read?.appearance, "dark");
  assert.deepEqual(read?.variables, theme.variables);

  const hostile = readHostContextThemeMessage({
    jsonrpc: "2.0",
    method: "ui/notifications/host-context-changed",
    params: {
      theme: "light",
      styles: {
        variables: {
          "--background": "#fff;}body{display:none",
          "--accent": "url(http://evil)",
          "--BAD": "#000",
          "--ok": "1px",
        },
      },
    },
  });
  assert.equal(hostile?.appearance, "light");
  assert.equal(hostile?.variables["--background"], "#fffbodydisplay:none");
  assert.equal(hostile?.variables["--accent"], undefined);
  assert.equal(hostile?.variables["--BAD"], undefined);
  assert.equal(hostile?.variables["--ok"], "1px");

  assert.equal(readHostContextThemeMessage({ jsonrpc: "2.0", method: "other", params: {} }), null);
  assert.equal(
    readHostContextThemeMessage({
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: { styles: { variables: { "--accent": "url(x)" } } },
    }),
    null,
  );
});

test("height messages reject coercion and cap the UI range", () => {
  const modern = (height: unknown) => ({
    jsonrpc: "2.0",
    method: "ui/notifications/size-changed",
    params: { height },
  });
  assert.equal(readSizeChangedMessage(modern(123.4)), 123);
  assert.equal(readSizeChangedMessage(modern(5000)), HTML_FRAME_MAX_HEIGHT);
  assert.equal(readSizeChangedMessage(modern(10)), HTML_FRAME_MIN_HEIGHT);
  assert.equal(readSizeChangedMessage(modern("123")), undefined);
  assert.equal(readSizeChangedMessage(modern(Number.NaN)), undefined);
  assert.equal(readSizeChangedMessage(modern(Number.POSITIVE_INFINITY)), undefined);
  assert.equal(readSizeChangedMessage(modern(-1)), undefined);
  assert.equal(readSizeChangedMessage(modern(0)), undefined);
  assert.equal(readSizeChangedMessage(modern(null)), undefined);
  assert.equal(readSizeChangedMessage({ type: "paseo-html-render-height", height: 640 }), 640);
  assert.equal(
    readSizeChangedMessage({ type: "paseo-html-render-height", height: "640" }),
    undefined,
  );
  assert.equal(readSizeChangedMessage({ type: "other", height: 100 }), undefined);
  assert.equal(readSizeChangedMessage(null), undefined);
});

test("ready notifications are strict and the ack carries no authority", () => {
  assert.equal(readReadyMessage({ jsonrpc: "2.0", method: "ui/notifications/ready", params: { version: 1 } }), true);
  assert.equal(readReadyMessage({ jsonrpc: "2.0", method: "ui/notifications/ready", params: { version: 2 } }), false);
  assert.equal(readReadyMessage({ jsonrpc: "2.0", method: "ui/notifications/ready" }), false);
  assert.equal(readReadyMessage({ jsonrpc: "2.0", method: "ui/open-link", params: { version: 1 } }), false);
  assert.deepEqual(readyAckMessage(), {
    jsonrpc: "2.0",
    method: "ui/notifications/ready-ack",
    params: { version: 1 },
  });
});

test("the document runtime has no fullscreen or keyboard-dismiss channel", () => {
  assert.doesNotMatch(HTML_DOCUMENT_RUNTIME_SCRIPT, /ui\/notifications\/dismiss|keydown|requestFullscreen|exitFullscreen/);
});

test("link and image requests are scheme- and type-bounded", () => {
  const link = readOpenLinkRequest({
    jsonrpc: "2.0",
    id: 4,
    method: "ui/open-link",
    params: { url: "https://example.com/a", metaKey: true, ctrlKey: false },
  });
  assert.deepEqual(link, { id: 4, url: "https://example.com/a", metaKey: true, ctrlKey: false });
  for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "/relative", ""]) {
    assert.equal(
      readOpenLinkRequest({ jsonrpc: "2.0", id: 1, method: "ui/open-link", params: { url } }),
      undefined,
      url,
    );
  }
  assert.equal(
    readOpenLinkRequest({ jsonrpc: "2.0", id: {}, method: "ui/open-link", params: { url: "https://x" } }),
    undefined,
  );

  assert.deepEqual(
    readOpenImageRequest({
      jsonrpc: "2.0",
      method: "ui/open-image",
      params: { src: "data:image/png;base64,AAAA", name: " chart " },
    }),
    { src: "data:image/png;base64,AAAA", name: "chart" },
  );
  for (const src of ["https://example.com/a.png", "data:text/html;base64,AAAA", "data:image/svg+xml;base64,AAAA"]) {
    assert.equal(
      readOpenImageRequest({ jsonrpc: "2.0", method: "ui/open-image", params: { src } }),
      undefined,
      src,
    );
  }
});

test("frame selection is web-only and legacy markers stay static", () => {
  assert.equal(selectHtmlFrameKind({ platform: "web", renderMode: "auto" }), "live");
  assert.equal(selectHtmlFrameKind({ platform: "web", renderMode: "iframe" }), "live");
  assert.equal(selectHtmlFrameKind({ platform: "web", renderMode: "static" }), "static");
  assert.equal(selectHtmlFrameKind({ platform: "web", renderMode: undefined }), "static");
  assert.equal(selectHtmlFrameKind({ platform: "ios", renderMode: "auto" }), "static");
  assert.equal(selectHtmlFrameKind({ platform: "android", renderMode: "iframe" }), "static");
});

test("measured heights filter, dedupe, sort, and pick the taller neighbour", () => {
  const heights = normalizeMeasuredHeights([
    [700, 200],
    [300, 100],
    [Number.NaN, 300],
    [-1, 50],
    [300, 120],
  ] as unknown as ReadonlyArray<readonly [number, number]>);
  assert.deepEqual(heights, [
    [300, 120],
    [700, 200],
  ]);
  assert.equal(measuredHeightAt(heights, 500), 200);
  assert.equal(measuredHeightAt(heights, 300), 120);
  assert.equal(measuredHeightAt(heights, 900), 200);
  assert.equal(measuredHeightAt([], 500), undefined);
});

test("frame fitting follows requested-cap and nearest-measurement semantics", () => {
  assert.equal(frameHeightFor({ requestedHeight: 600, width: 728 }), 600);
  assert.equal(frameHeightFor({ requestedHeight: 600, width: 728, contentHeight: 300 }), 300);
  assert.equal(frameHeightFor({ requestedHeight: 600, width: 728, contentHeight: 9000 }), 600);
  assert.equal(frameHeightFor({ requestedHeight: 10, width: 728 }), 80);
  assert.equal(frameHeightFor({ requestedHeight: Number.NaN, width: 728 }), 80);
  assert.equal(clampFrameHeight(Number.POSITIVE_INFINITY), 80);

  const heights = [
    [320, 400],
    [728, 1200],
    [1024, 1300],
  ] as const;
  // The column measurement exceeds the request, so the request caps the frame.
  assert.equal(frameHeightFor({ requestedHeight: 800, width: 320, heights, contentHeight: 500 }), 500);
  assert.equal(frameHeightFor({ requestedHeight: 800, width: 320, heights }), 400);
  assert.equal(frameHeightFor({ requestedHeight: 800, width: 500, heights }), 800);
  // A column measurement at or below the request leaves room up to 2000.
  assert.equal(frameHeightFor({ requestedHeight: 1500, width: 320, heights }), 400);
  assert.equal(frameHeightFor({ requestedHeight: 1500, width: 500, heights }), 1200);
  assert.equal(frameHeightFor({ requestedHeight: 1500, width: 2000, heights }), 1300);
  assert.equal(frameHeightFor({ requestedHeight: 1500, width: 320, heights, contentHeight: 9000 }), 2000);
  assert.equal(
    frameHeightFor({
      requestedHeight: 500,
      width: 320,
      heights: [[300, Number.NaN]] as unknown as ReadonlyArray<readonly [number, number]>,
    }),
    500,
  );
});

// Real Chromium security test -------------------------------------------------

const chromium = findChromiumExecutable();

interface Cdp {
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<Record<string, unknown>>;
  close(): void;
}

function connectCdp(url: string): Promise<Cdp> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    let opened = false;
    const pending = new Map<number, { resolve(value: Record<string, unknown>): void; reject(error: Error): void }>();
    socket.addEventListener("open", () => {
      opened = true;
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId++;
          return new Promise<Record<string, unknown>>((resolveSend, rejectSend) => {
            pending.set(id, { resolve: resolveSend, reject: rejectSend });
            socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
          });
        },
        close() {
          for (const entry of pending.values()) entry.reject(new Error("CDP closed"));
          pending.clear();
          socket.close();
        },
      });
    });
    socket.addEventListener("message", (event) => {
      let message: { id?: number; result?: Record<string, unknown>; error?: { message?: string } };
      try {
        message = JSON.parse(String(event.data)) as typeof message;
      } catch {
        return;
      }
      if (typeof message.id !== "number") return;
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message ?? "CDP error"));
      else entry.resolve(message.result ?? {});
    });
    socket.addEventListener("error", () => {
      if (!opened) reject(new Error("CDP socket error"));
    });
    socket.addEventListener("close", () => {
      if (!opened) reject(new Error("CDP socket closed before opening"));
    });
  });
}

async function waitForPort(profile: string, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const text = await fs.readFile(join(profile, "DevToolsActivePort"), "utf8");
      const port = Number.parseInt(text.split("\n")[0] ?? "", 10);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // Not written yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Chromium did not expose a debugging port");
}

async function runChromium(hostHtml: string): Promise<string> {
  const profile = await fs.mkdtemp(join(tmpdir(), "html-frame-chrome-"));
  const dataDir = join(profile, "data");
  const file = join(profile, "host.html");
  let stderr = "";
  const child = spawn(
    chromium!,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${dataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--metrics-recording-only",
      "--mute-audio",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-2_000);
  });
  try {
    await fs.writeFile(file, hostHtml, "utf8");
    const port = await waitForPort(dataDir, 20_000);
    const websocketPath = (await fs.readFile(join(dataDir, "DevToolsActivePort"), "utf8")).split("\n")[1] ?? "";
    assert.ok(websocketPath.startsWith("/devtools/browser/"), "browser websocket path");
    const cdp = await connectCdp(`ws://127.0.0.1:${port}${websocketPath}`);
    try {
      const created = await cdp.send("Target.createTarget", { url: `file://${file}` });
      const targetId = String(created.targetId ?? "");
      assert.ok(targetId, "created a target");
      const attached = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
      const session = String(attached.sessionId ?? "");
      assert.ok(session, "attached to the target");
      await cdp.send("Runtime.enable", {}, session);
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        const evaluated = await cdp.send(
          "Runtime.evaluate",
          {
            expression:
              '(function(){var e=document.getElementById("out");return e&&e.textContent?e.textContent:null;})()',
            returnByValue: true,
          },
          session,
        );
        const value = (evaluated.result as { value?: unknown } | undefined)?.value;
        if (typeof value === "string" && value.length > 0) return value;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const dump = await cdp
        .send(
          "Runtime.evaluate",
          { expression: "document.documentElement.outerHTML", returnByValue: true },
          session,
        )
        .catch(() => null);
      const html = (dump?.result as { value?: unknown } | undefined)?.value;
      throw new Error(
        `Chromium host page did not finish: ${String(html ?? "").slice(0, 1200)} ${stderr.slice(-600)}`,
      );
    } finally {
      await cdp.send("Browser.close").catch(() => {});
      cdp.close();
    }
  } finally {
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", () => resolve());
      setTimeout(resolve, 2_000).unref?.();
    });
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

test(
  "real Chromium: scripts run, network/file/forms/parent DOM are denied, theme updates preserve state",
  { timeout: 45_000 },
  async (t) => {
    if (!chromium) {
      t.skip("Chromium unavailable");
      return;
    }
    const hits: string[] = [];
    const server = createServer((request, response) => {
      hits.push(request.url ?? "");
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("reachable");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const reportHtml = `
        <h1 id="heading">Live report</h1>
        <pre id="counter">0</pre>
        <form id="form" action="http://127.0.0.1:${port}/form" method="post">
          <input name="x" value="1"><button type="submit">Send</button>
        </form>
        <script>
          (function(){
            var count = 0;
            function post(type, payload){
              var message = { type: type };
              for (var key in payload) { message[key] = payload[key]; }
              parent.postMessage(message, "*");
            }
            function check(name, value){ post("check", { name: name, value: value }); }
            window.addEventListener("message", function(event){
              var data = event.data || {};
              if (data.method !== "ui/notifications/host-context-changed") return;
              count += 1;
              document.getElementById("counter").textContent = String(count);
              post("state", {
                count: count,
                background: getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
                appearance: data.params && data.params.theme
              });
            });
            check("csp", !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'));
            check("themeStyle", !!document.getElementById("paseo-html-theme"));
            try { void parent.document.title; check("parentAccess", "allowed"); }
            catch (error) { check("parentAccess", "denied"); }
            fetch("http://127.0.0.1:${port}/secret").then(
              function(){ check("network", "allowed"); },
              function(){ check("network", "blocked"); }
            );
            fetch("file:///etc/hostname").then(
              function(){ check("file", "allowed"); },
              function(){ check("file", "blocked"); }
            );
            try { document.getElementById("form").submit(); } catch (error) {}
          })();
        </script>`;

      const document = buildLiveDocument({
        html: reportHtml,
        title: "Live report",
        theme: buildDocumentTheme(DEFAULT_HTML_DOCUMENT_COLORS.light, "light"),
      });
      const serialized = JSON.stringify(document).replace(/</g, "\\u003c");
      const hostHtml = `<!doctype html><meta charset="utf-8"><title>frame host</title><body>
<script>
(function(){
  var results = {};
  var report = ${serialized};
  var frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("title", "report");
  frame.srcdoc = report;
  frame.style.width = "600px";
  frame.style.height = "500px";
  frame.style.border = "0";
  window.addEventListener("message", function(event){
    if (event.source !== frame.contentWindow) return;
    var data = event.data || {};
    if (data.method === "ui/notifications/ready") {
      event.source.postMessage({ jsonrpc: "2.0", method: "ui/notifications/ready-ack", params: { version: 1 } }, "*");
      setTimeout(function(){
        event.source.postMessage({ jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: { theme: "light", styles: { variables: { "--background": "#ffffff", "--foreground": "#111111" } } } }, "*");
      }, 0);
      setTimeout(function(){
        event.source.postMessage({ jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: { theme: "dark", styles: { variables: { "--background": "#101010", "--foreground": "#eeeeee" } } } }, "*");
      }, 80);
    }
    if (data.method === "ui/notifications/size-changed") results.contentHeight = data.params.height;
    if (data.type === "check") results[data.name] = data.value;
    if (data.type === "state") {
      results.count = data.count;
      results.background = data.background;
      results.appearance = data.appearance;
    }
  });
  document.body.appendChild(frame);
  var published = false;
  function publish(){
    if (published) return;
    published = true;
    var pre = document.createElement("pre");
    pre.id = "out";
    pre.textContent = JSON.stringify(results);
    document.body.appendChild(pre);
  }
  var wait = setInterval(function(){
    if (results.count === 2 && results.network && results.file && results.parentAccess && results.contentHeight > 0) {
      clearInterval(wait);
      publish();
    }
  }, 50);
  setTimeout(function(){ clearInterval(wait); publish(); }, 6000);
})();
</script>`;

      const raw = await runChromium(hostHtml);
      const results = JSON.parse(raw) as Record<string, unknown>;

      assert.equal(results.csp, true, "the CSP meta is present in-document");
      assert.equal(results.themeStyle, true, "the theme style element is present");
      assert.equal(results.parentAccess, "denied", "the frame cannot read the parent DOM");
      assert.equal(results.network, "blocked", "connect-src 'none' blocks http(s)");
      assert.equal(results.file, "blocked", "file: is blocked");
      assert.equal(results.count, 2, "two theme messages arrived without a reload");
      assert.equal(results.background, "#101010", "the last theme tokens were applied");
      assert.equal(results.appearance, "dark");
      assert.ok(typeof results.contentHeight === "number" && results.contentHeight > 0 && results.contentHeight < 500,
        `short content must shrink below the initial 500px iframe, got ${results.contentHeight}`);
      assert.deepEqual(hits, [], "no request reached the local server");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
