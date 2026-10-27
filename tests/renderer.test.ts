import assert from "node:assert/strict";
import { existsSync, promises as fs } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createRenderer, findChromiumExecutable, RenderError } from "../server/renderer.ts";
import { renderReportGraph } from "../server/graph.ts";
import { MAX_CAPTURED_HEIGHT, MAX_GRAPH_NODES, MAX_INTERACTIVE_HTML_CHARS, MAX_PREVIEW_PNG_BYTES } from "../shared/limits.ts";

const renderer = createRenderer({ timeoutMs: 10_000, maxConcurrent: 1 });
let unavailable: string | null = null;

try {
  const probe = await renderer.render({ html: "<p>probe</p>" });
  assert.equal(probe.png.subarray(1, 4).toString("latin1"), "PNG");
} catch (error) {
  if (error instanceof RenderError && error.code === "browser_unavailable") {
    unavailable = `Chromium unavailable: ${error.message}`;
  } else {
    throw error;
  }
}

function skipIfUnavailable(t: { skip(message: string): void }): boolean {
  if (!unavailable) return false;
  t.skip(unavailable);
  return true;
}

test.after(async () => {
  await renderer.close();
});

test("renders a self-contained page to a bounded PNG", async (t) => {
  if (skipIfUnavailable(t)) return;
  const result = await renderer.render({
    html: '<!doctype html><html><body><h1 style="margin:0">Report</h1><svg width="40" height="40"><circle cx="20" cy="20" r="18" fill="teal"/></svg></body></html>',
  });
  assert.equal(result.width, 728);
  assert.ok(result.contentHeight >= 40, `contentHeight ${result.contentHeight}`);
  assert.equal(result.capturedHeight, result.contentHeight);
  assert.equal(result.png.subarray(1, 4).toString("latin1"), "PNG");
  assert.ok(result.png.byteLength > 100);
});

test("appearance changes the rendered theme variables", async (t) => {
  if (skipIfUnavailable(t)) return;
  const html =
    '<!doctype html><body><div style="height:60px;background:var(--background);color:var(--foreground)">theme</div></body>';
  const dark = await renderer.render({ html, appearance: "dark" });
  const light = await renderer.render({ html, appearance: "light" });
  assert.notEqual(dark.png.toString("base64"), light.png.toString("base64"));
});

test("static capture and measurement honor reduced motion without executing scripts", async (t) => {
  if (skipIfUnavailable(t)) return;
  let seen: unknown;
  const observer = createRenderer({
    timeoutMs: 10_000,
    maxConcurrent: 1,
    async inspectDom(evaluate) {
      seen = await evaluate(`({
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        animation: getComputedStyle(document.getElementById('bar')).animationName,
        width: document.getElementById('bar').getBoundingClientRect().width
      })`);
    },
  });
  const html = `<!doctype html><style>
    html,body{margin:0}
    #track{width:300px;height:20px}
    #bar{width:280px;height:20px;background:teal;transform-origin:left;animation:grow 60s linear both}
    @keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
    @media(prefers-reduced-motion:reduce){#track,#bar{height:60px}#bar{animation:none}}
  </style><div id="track"><div id="bar"></div></div>
  <script>document.getElementById('bar').style.width='1px'</script>`;
  try {
    await observer.render({ html });
    assert.deepEqual(seen, { reduced: true, animation: "none", width: 280 });
    const heights = await observer.measure({ html, widths: [390, 728] });
    assert.deepEqual(heights, [[390, 60], [728, 60]]);
  } finally {
    await observer.close();
  }
});

test("report scripts never execute", async (t) => {
  if (skipIfUnavailable(t)) return;
  const result = await renderer.render({
    html: '<!doctype html><body><p>static</p><script>document.body.style.height="5000px";document.body.innerHTML="<h1>executed</h1>";</script></body>',
  });
  assert.ok(result.contentHeight < 200, `script must not run, contentHeight=${result.contentHeight}`);
});

test("remote images, stylesheets, and iframes are blocked before reaching the network", async (t) => {
  if (skipIfUnavailable(t)) return;
  let hits = 0;
  const server = createServer((_request, response) => {
    hits += 1;
    response.end("network reached");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const blocked: string[] = [];
  const observer = createRenderer({
    timeoutMs: 10_000,
    maxConcurrent: 1,
    onBlockedRequest: (url, allowed) => {
      if (!allowed) blocked.push(url);
    },
  });
  try {
    const result = await observer.render({
      html: `<!doctype html><body><img src="http://127.0.0.1:${port}/a.png"><link rel="stylesheet" href="http://127.0.0.1:${port}/a.css"><iframe src="http://127.0.0.1:${port}/frame"></iframe><div style="height:30px">x</div></body>`,
    });
    assert.equal(hits, 0, "no request may reach the network");
    assert.ok(blocked.some((url) => url.startsWith("http://127.0.0.1:")), "router saw the requests");
    assert.ok(result.png.byteLength > 100);
  } finally {
    await observer.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("file:// images stay unloaded while data: images render", async (t) => {
  if (skipIfUnavailable(t)) return;
  const dir = await fs.mkdtemp(join(tmpdir(), "html-render-file-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const pngPath = join(dir, "pixel.png");
  const pixel =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  await fs.writeFile(pngPath, Buffer.from(pixel, "base64"));
  let seen: Array<{ id: string; width: number }> = [];
  const observer = createRenderer({
    timeoutMs: 10_000,
    maxConcurrent: 1,
    async inspectDom(evaluate) {
      seen = (await evaluate(
        "Array.from(document.querySelectorAll('img')).map((image) => ({ id: image.id, width: image.naturalWidth }))",
      )) as Array<{ id: string; width: number }>;
    },
  });
  try {
    const result = await observer.render({
      html: `<!doctype html><body><img id="file" src="file://${pngPath}"><img id="data" src="data:image/png;base64,${pixel}"><div style="height:20px">x</div></body>`,
    });
    assert.ok(result.png.byteLength > 100);
    assert.deepEqual(seen, [
      { id: "file", width: 0 },
      { id: "data", width: 1 },
    ]);
  } finally {
    await observer.close();
  }
});

test("invalid widths and oversized documents fail before rendering", async (t) => {
  if (skipIfUnavailable(t)) return;
  await assert.rejects(
    () => renderer.render({ html: "<p>x</p>", width: 100 }),
    (error: unknown) => error instanceof RenderError && error.code === "invalid_input",
  );
  await assert.rejects(
    () => renderer.render({ html: "x".repeat(512_001) }),
    (error: unknown) => error instanceof RenderError && error.code === "invalid_input",
  );
  await assert.rejects(
    () => renderer.render({ html: "" }),
    (error: unknown) => error instanceof RenderError && error.code === "invalid_input",
  );
});

test("a page taller than the capture bound is clipped", async (t) => {
  if (skipIfUnavailable(t)) return;
  const result = await renderer.render({
    html: '<!doctype html><body><div style="height:9000px">tall</div></body>',
  });
  assert.ok(result.contentHeight > 8000);
  assert.equal(result.capturedHeight, 4000);
});

test("executable discovery is explicit and testable", () => {
  // Pin every machine-wide discovery source, including Linux system paths.
  // CI may have /usr/bin/chromium even when the synthetic home has no browser.
  const noApps = { appRoots: ["/nonexistent/Applications"], systemCandidates: [] };
  assert.equal(
    findChromiumExecutable({ PASEO_HTML_RENDER_CHROMIUM: "/nope/chrome" }, "/nonexistent", noApps),
    null,
  );
  const discovered = findChromiumExecutable({}, homedir());
  if (discovered) assert.ok(existsSync(discovered));
  if (unavailable) assert.equal(discovered, null);
});

test("an installed Chromium app bundle is discovered without a cache or plugin runtime", async () => {
  const home = await fs.mkdtemp(join(tmpdir(), "hr-app-bundle-"));
  try {
    const root = join(home, "Applications");
    const executable = join(root, "Helium.app", "Contents", "MacOS", "Helium");
    await fs.mkdir(dirname(executable), { recursive: true });
    await fs.writeFile(executable, "", { mode: 0o700 });
    assert.equal(findChromiumExecutable({}, home, { appRoots: [root], systemCandidates: [] }), executable);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("the explicit override wins over an installed app bundle", async () => {
  const home = await fs.mkdtemp(join(tmpdir(), "hr-override-"));
  try {
    const root = join(home, "Applications");
    const bundled = join(root, "Google Chrome.app", "Contents", "MacOS", "Google Chrome");
    await fs.mkdir(dirname(bundled), { recursive: true });
    await fs.writeFile(bundled, "", { mode: 0o700 });
    const override = join(home, "override-chrome");
    await fs.writeFile(override, "", { mode: 0o700 });
    assert.equal(
      findChromiumExecutable({ PASEO_HTML_RENDER_CHROMIUM: override }, home, { appRoots: [root], systemCandidates: [] }),
      override,
    );
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("shared-browser's bundled Chromium is a discovery fallback", async () => {
  const home = await fs.mkdtemp(join(tmpdir(), "hr-shared-browser-"));
  try {
    const runtime = join(home, ".paseo", "plugin-data", "shared-browser", ".runtime-test", "chromium");
    await fs.mkdir(runtime, { recursive: true });
    const chrome = join(runtime, "chrome");
    await fs.writeFile(chrome, "", { mode: 0o700 });
    assert.equal(findChromiumExecutable({}, home, { appRoots: [], systemCandidates: [] }), chrome);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Multi-width measurement
// ---------------------------------------------------------------------------

const SHORT_HTML =
  '<!doctype html><style>body{margin:0}p{margin:0;line-height:20px}</style><p>short</p>';

test("measure returns sorted, deduplicated widths from one browser launch", async (t) => {
  if (skipIfUnavailable(t)) return;
  let launches = 0;
  const observer = createRenderer({ timeoutMs: 10_000, maxConcurrent: 1, onBrowserLaunch: () => (launches += 1) });
  try {
    const measured = await observer.measure({ html: SHORT_HTML, widths: [1024, 390, 728, 390] });
    assert.deepEqual(
      measured.map(([width]) => width),
      [390, 728, 1024],
    );
    for (const [, height] of measured) assert.ok(height >= 1 && height <= MAX_CAPTURED_HEIGHT);
    assert.equal(launches, 1, "all widths must share one browser");
  } finally {
    await observer.close();
  }
});

test("measure uses an 800px viewport without inflating short content", async (t) => {
  if (skipIfUnavailable(t)) return;
  const measured = await renderer.measure({ html: SHORT_HTML, widths: [390, 728, 1024] });
  for (const [, height] of measured) {
    assert.ok(height < 80, `short content must not grow to the viewport: ${height}`);
  }
});

test("measure caps a very tall page and keeps scripts disabled", async (t) => {
  if (skipIfUnavailable(t)) return;
  const tall = await renderer.measure({
    html: '<!doctype html><body><div style="height:9000px">tall</div></body>',
    widths: [728],
  });
  assert.equal(tall[0]![1], MAX_CAPTURED_HEIGHT);

  const scripted = await renderer.measure({
    html: '<!doctype html><body><p>short</p><script>document.documentElement.style.height="3000px"</script></body>',
    widths: [728],
  });
  assert.ok(scripted[0]![1] < 80, `measurement script must not run, got ${scripted[0]![1]}`);
});

test("measure rejects invalid widths before touching the browser", async (t) => {
  if (skipIfUnavailable(t)) return;
  for (const widths of [[], [239], [1601], [728.5], Array.from({ length: 25 }, (_, index) => 300 + index)]) {
    await assert.rejects(
      () => renderer.measure({ html: SHORT_HTML, widths }),
      (error: unknown) => error instanceof RenderError && error.code === "invalid_input",
      `widths ${JSON.stringify(widths)} must be rejected`,
    );
  }
});

test("measure blocks remote and file resources just like a capture", async (t) => {
  if (skipIfUnavailable(t)) return;
  const blocked: string[] = [];
  const observer = createRenderer({
    timeoutMs: 10_000,
    maxConcurrent: 1,
    onBlockedRequest: (url, allowed) => {
      if (!allowed) blocked.push(url);
    },
  });
  try {
    const measured = await observer.measure({
      html: '<!doctype html><body><img src="http://127.0.0.1:9/a.png"><img src="file:///etc/passwd"><div style="height:30px">x</div></body>',
      widths: [728],
    });
    assert.equal(measured.length, 1);
    assert.ok(blocked.some((url) => url.startsWith("http://127.0.0.1:")));
    assert.ok(blocked.some((url) => url.startsWith("file://")));
  } finally {
    await observer.close();
  }
});

test("measure failure is a catchable RenderError", async (t) => {
  if (skipIfUnavailable(t)) return;
  const closed = createRenderer({ timeoutMs: 10_000, maxConcurrent: 1 });
  await closed.render({ html: "<p>x</p>" });
  await closed.close();
  await assert.rejects(
    () => closed.measure({ html: SHORT_HTML, widths: [728] }),
    (error: unknown) => error instanceof RenderError && error.code === "render_failed",
  );
});

// ---------------------------------------------------------------------------
// Prepared (server-built) documents
// ---------------------------------------------------------------------------

test("renderPrepared accepts a bounded document larger than MCP input", async (t) => {
  if (skipIfUnavailable(t)) return;
  const html = `<!doctype html><body><div style="height:10px">ok</div><!--${"x".repeat(520_000)}--></body>`;
  assert.ok(html.length > 512_000);
  await assert.rejects(
    () => renderer.render({ html }),
    (error: unknown) => error instanceof RenderError && error.code === "invalid_input",
  );
  const prepared = await renderer.renderPrepared({ html });
  assert.equal(prepared.png.subarray(1, 4).toString("latin1"), "PNG");
  assert.ok(prepared.capturedHeight >= 10);
  const measured = await renderer.measurePrepared({ html, widths: [1024, 390] });
  assert.deepEqual(
    measured.map(([width]) => width),
    [390, 1024],
  );
  for (const [, height] of measured) assert.ok(height >= 10);
});

test("prepared input has its own hard bound", async (t) => {
  if (skipIfUnavailable(t)) return;
  await assert.rejects(
    () => renderer.renderPrepared({ html: "x".repeat(MAX_INTERACTIVE_HTML_CHARS + 1) }),
    (error: unknown) => error instanceof RenderError && error.code === "invalid_input",
  );
  await assert.rejects(
    () => renderer.renderPrepared({ html: "é".repeat(4_300_000) }),
    (error: unknown) => error instanceof RenderError && error.code === "invalid_input",
    "the prepared bound counts UTF-8 bytes, not only characters",
  );
});

// ---------------------------------------------------------------------------
// Real Pele plus Chromium graph rasterization (one shared browser)
// ---------------------------------------------------------------------------

const GRAPH = {
  id: "main",
  nodes: [
    { id: "a", label: 'Plan "quoted" ] --> n9["PWNED' },
    { id: "b", label: "Build [step] (x) {y} | z" },
    { id: "c", label: "Ship <script>alert(1)</script>" },
  ],
  edges: [
    { from: "a", to: "b", label: "yes | no <b>bold</b>" },
    { from: "b", to: "c", label: "done" },
  ],
  decisions: [{ id: "d1", label: "Ship?", nodeId: "b", choice: "yes" }],
};

test("real Pele plus Chromium produce bounded light and dark graph PNGs", async (t) => {
  if (skipIfUnavailable(t)) return;
  const result = await renderReportGraph(GRAPH, renderer);
  for (const image of [result.light, result.dark]) {
    assert.ok(image);
    assert.equal(image.png.subarray(1, 4).toString("latin1"), "PNG");
    assert.equal(image.width, 728);
    assert.ok(image.capturedHeight >= 32 && image.capturedHeight <= MAX_CAPTURED_HEIGHT);
    assert.ok(image.png.byteLength > 100 && image.png.byteLength <= MAX_PREVIEW_PNG_BYTES);
  }
  assert.notEqual(result.light!.png.toString("base64"), result.dark!.png.toString("base64"));
  assert.equal(result.metadata.previewLight, true);
  assert.equal(result.metadata.previewDark, true);
});

test("a 200-node graph is bounded and completes", async (t) => {
  if (skipIfUnavailable(t)) return;
  const nodes = Array.from({ length: MAX_GRAPH_NODES }, (_, index) => ({
    id: `node-${index}`,
    label: `Step ${index} with a reasonably long label`,
  }));
  const edges = Array.from({ length: MAX_GRAPH_NODES - 1 }, (_, index) => ({
    from: `node-${index}`,
    to: `node-${index + 1}`,
    label: index % 2 === 0 ? "next" : undefined,
  }));
  const started = Date.now();
  const result = await renderReportGraph({ nodes, edges }, renderer, { appearances: ["dark"] });
  const elapsed = Date.now() - started;
  assert.equal(result.metadata.nodeCount, 200);
  assert.equal(result.metadata.edgeCount, 199);
  assert.ok(result.dark && result.dark.png.byteLength <= MAX_PREVIEW_PNG_BYTES);
  assert.ok(result.dark!.capturedHeight <= MAX_CAPTURED_HEIGHT);
  assert.ok(elapsed < 15_000, `200-node graph took ${elapsed}ms`);
});
