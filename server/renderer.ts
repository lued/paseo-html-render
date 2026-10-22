import { AbortSignal } from "./cancellation.ts";
import { spawn, type ChildProcess } from "node:child_process";
import {
  DEFAULT_HTML_DOCUMENT_COLORS,
  HTML_RENDER_MEASURE_FONTS,
  buildDocumentTheme,
  buildHtmlDocument,
} from "../shared/html-document.ts";
import { existsSync, promises as fs, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_CAPTURED_HEIGHT,
  MAX_CONCURRENT_RENDERS,
  MAX_HTML_CHARS,
  MAX_PREVIEW_PNG_BYTES,
  MAX_INTERACTIVE_HTML_BYTES,
  MAX_INTERACTIVE_HTML_CHARS,
  PREVIEW_DEFAULT_WIDTH,
  PREVIEW_MAX_WIDTH,
  PREVIEW_MIN_WIDTH,
  RENDER_TIMEOUT_MS,
} from "../shared/limits.ts";
import {
  assertMeasuredHeights,
  normalizeMeasureWidths,
  type MeasureInput,
  type MeasuredHeights,
} from "./renderer-types.ts";

export type Appearance = "light" | "dark";

export class RenderError extends Error {
  readonly code:
    | "invalid_input"
    | "browser_unavailable"
    | "render_failed"
    | "timeout"
    | "output_too_large";

  constructor(code: RenderError["code"], message: string) {
    super(message);
    this.name = "RenderError";
    this.code = code;
  }
}

export interface RenderInput {
  html: string;
  width?: number;
  appearance?: Appearance;
  /** Internal cancellation from the owning tool request, never MCP caller input. */
  signal?: AbortSignal;
}

export interface RenderOutput {
  png: Buffer;
  width: number;
  contentHeight: number;
  capturedHeight: number;
}

export interface Renderer {
  render(input: RenderInput): Promise<RenderOutput>;
  close(): Promise<void>;
}

/**
 * Server-built documents (for example a CSP-protected `interactive.html`) may
 * exceed the untrusted MCP input bound. `renderPrepared` and
 * `measurePrepared` are internal-only: never wire them to an RPC/tool input.
 */
export interface PreparedRenderInput extends RenderInput {}

/** Additive capabilities on the concrete renderer returned by `createRenderer`. */
export interface RendererFeatures {
  /**
   * Sorted, deduplicated multi-width content heights for untrusted HTML (dark
   * scheme). Callers use `DEFAULT_MEASURE_WIDTHS`, which matches T3's nine
   * widths. Each width gets a fresh page in one shared browser, at most two at a
   * time, under one total timeout.
   */
  measure(input: MeasureInput): Promise<MeasuredHeights>;
  /** Same contract, for bounded server-built documents only. */
  measurePrepared(input: MeasureInput): Promise<MeasuredHeights>;
  /** Screenshot a bounded server-built document. Internal-only. */
  renderPrepared(input: PreparedRenderInput): Promise<RenderOutput>;
}

export type FullRenderer = Renderer & RendererFeatures;

/** Prepared HTML may be larger than tool input, but never larger than publishing. */
export const PREPARED_HTML_MAX_CHARS = MAX_INTERACTIVE_HTML_CHARS;
export const PREPARED_HTML_MAX_BYTES = MAX_INTERACTIVE_HTML_BYTES;

export interface RendererOptions {
  executablePath?: string;
  timeoutMs?: number;
  /** Total budget for one multi-width measurement call. */
  measureTimeoutMs?: number;
  maxConcurrent?: number;
  /** Test hook: observes URLs the network policy refused or allowed. */
  onBlockedRequest?: (url: string, allowed: boolean) => void;
  /** Test hook: evaluates an expression in the page's main world after capture. */
  inspectDom?: (evaluate: (expression: string) => Promise<unknown>) => Promise<void>;
  /** Test hook: counts browser launches; widths must share one browser. */
  onBrowserLaunch?: () => void;
}

/** T3 parity: captures lay out at the same 800px viewport as measurement. */
const RENDER_VIEWPORT_HEIGHT = 800;
/** T3-compatible measurement viewport; the measure expression ignores it for short pages. */
const MEASURE_VIEWPORT_HEIGHT = 800;
const DEFAULT_MEASURE_TIMEOUT_MS = 20_000;
const PAGE_SETTLE_MS = 50;
/**
 * T3's measurement expression: the root's scroll height never drops below the
 * viewport, so a short page reports its own box height instead. This is what
 * lets an 800px viewport be T3-compatible without inflating short content.
 */
const MEASURE_EXPRESSION =
  "(() => { const root = document.documentElement; return root.scrollHeight > root.clientHeight ? root.scrollHeight : root.getBoundingClientRect().height; })()";
const BROWSER_START_TIMEOUT_MS = 15_000;
const MAX_BROWSER_STDERR = 2_048;

/** Shared early CSP/bootstrap and full theme; static pages still cannot execute scripts. */
export function injectTheme(html: string, appearance: Appearance): string {
  // Captures and measurements use Arial-metric faces so wrapped text, and
  // therefore height, matches what a reader's client shows (T3 parity).
  const theme = buildDocumentTheme(
    DEFAULT_HTML_DOCUMENT_COLORS[appearance],
    appearance,
    HTML_RENDER_MEASURE_FONTS,
  );
  return buildHtmlDocument({ html, theme });
}

function clampWidth(width: number | undefined): number {
  if (width === undefined) return PREVIEW_DEFAULT_WIDTH;
  if (!Number.isInteger(width) || width < PREVIEW_MIN_WIDTH || width > PREVIEW_MAX_WIDTH) {
    throw new RenderError(
      "invalid_input",
      `width must be an integer from ${PREVIEW_MIN_WIDTH} to ${PREVIEW_MAX_WIDTH}`,
    );
  }
  return width;
}

function assertHtml(html: unknown): string {
  if (typeof html !== "string" || html.length === 0) {
    throw new RenderError("invalid_input", "html must be a non-empty string");
  }
  if (html.length > MAX_HTML_CHARS) {
    throw new RenderError("invalid_input", `html exceeds ${MAX_HTML_CHARS} characters`);
  }
  return html;
}

function assertPreparedHtml(html: unknown): string {
  if (typeof html !== "string" || html.length === 0) {
    throw new RenderError("invalid_input", "html must be a non-empty string");
  }
  if (html.length > PREPARED_HTML_MAX_CHARS) {
    throw new RenderError("invalid_input", `prepared html exceeds ${PREPARED_HTML_MAX_CHARS} characters`);
  }
  if (Buffer.byteLength(html, "utf8") > PREPARED_HTML_MAX_BYTES) {
    throw new RenderError("invalid_input", `prepared html exceeds ${PREPARED_HTML_MAX_BYTES} bytes`);
  }
  return html;
}

/** Abort waiting work and remove listeners on every settled path. */
function withAbort<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("Rendering canceled"));
    if (signal.aborted) { void work.catch(() => {}); abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function createLimiter(concurrency: number): <T>(run: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(run: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await run();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

// ---------------------------------------------------------------------------
// Executable discovery: explicit and testable. No download, no global install.
// ---------------------------------------------------------------------------

function isExecutable(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

function browserCacheCandidates(home: string): string[] {
  // Pre-existing browser binaries only; nothing is downloaded or installed.
  const roots = [join(home, ".cache", "ms-playwright")];
  const found: string[] = [];
  for (const root of roots) {
    try {
      const entries = readdirSync(root) as string[];
      for (const entry of entries.filter((name) => name.startsWith("chromium-"))) {
        found.push(join(root, entry, "chrome-linux64", "chrome"));
        found.push(join(root, entry, "chrome-linux", "chrome"));
        found.push(join(root, entry, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"));
      }
    } catch {
      // Missing cache directory is normal.
    }
  }
  return found.sort().reverse();
}

function sharedBrowserCandidates(home: string): string[] {
  // The shared-browser plugin installs a sandbox-capable Chrome for Testing
  // under its own app-owned runtime. Reuse it read-only when it is present; it
  // is one source among several, never a requirement.
  const root = join(home, ".paseo", "plugin-data", "shared-browser");
  const found: string[] = [];
  try {
    for (const entry of readdirSync(root).filter((name) => name.startsWith(".runtime-"))) {
      found.push(join(root, entry, "chromium", "chrome"));
    }
  } catch {
    // Optional source; a missing runtime is normal.
  }
  return found.sort().reverse();
}

const SYSTEM_CANDIDATES = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/snap/bin/chromium",
  "/opt/google/chrome/chrome",
  "/usr/bin/brave-browser",
  "/usr/bin/microsoft-edge",
  "/usr/bin/vivaldi-stable",
];

// Desktop applications that ship a Chromium build. A Chromium fork (Helium,
// Brave, Edge, Vivaldi) speaks the same CDP protocol and accepts the launch
// flags below, so it renders exactly like Chrome or Chromium.
const MAC_APP_CANDIDATES: ReadonlyArray<readonly [string, string]> = [
  ["Google Chrome", "Google Chrome"],
  ["Chromium", "Chromium"],
  ["Helium", "Helium"],
  ["Brave Browser", "Brave Browser"],
  ["Microsoft Edge", "Microsoft Edge"],
  ["Vivaldi", "Vivaldi"],
];

function macAppCandidates(appRoots: readonly string[]): string[] {
  const found: string[] = [];
  for (const root of appRoots) {
    for (const [bundle, executable] of MAC_APP_CANDIDATES) {
      found.push(join(root, `${bundle}.app`, "Contents", "MacOS", executable));
    }
  }
  return found;
}

export interface DiscoveryOptions {
  /** Application directories to scan for Chromium-family app bundles. */
  appRoots?: readonly string[];
}

/**
 * Every place a sandbox-capable Chromium may already exist, most isolated
 * first: the explicit override, the Playwright cache, the shared-browser
 * runtime, then browsers the user installed. Nothing is ever downloaded.
 */
export function chromiumCandidates(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  options: DiscoveryOptions = {},
): string[] {
  const override = env.PASEO_HTML_RENDER_CHROMIUM?.trim();
  const appRoots = options.appRoots ?? ["/Applications", join(home, "Applications")];
  return [
    ...(override ? [override] : []),
    ...browserCacheCandidates(home),
    ...sharedBrowserCandidates(home),
    ...SYSTEM_CANDIDATES,
    ...macAppCandidates(appRoots),
  ];
}

/** Returns the first usable sandboxed Chromium, or null. Env override wins. */
export function findChromiumExecutable(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  options: DiscoveryOptions = {},
): string | null {
  for (const candidate of chromiumCandidates(env, home, options)) {
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Minimal CDP client over Node's built-in WebSocket.
// ---------------------------------------------------------------------------

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message?: string };
  sessionId?: string;
}

interface CdpConnection {
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<Record<string, unknown>>;
  onEvent(listener: (message: CdpMessage) => void): () => void;
  close(): void;
}

function connectCdp(url: string): Promise<CdpConnection> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    let opened = false;
    const pending = new Map<number, { resolve(value: Record<string, unknown>): void; reject(error: Error): void }>();
    const listeners: Array<(message: CdpMessage) => void> = [];

    socket.addEventListener("open", () => {
      opened = true;
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId++;
          const payload: CdpMessage = { id, method, params };
          if (sessionId) payload.sessionId = sessionId;
          return new Promise<Record<string, unknown>>((resolveSend, rejectSend) => {
            pending.set(id, { resolve: resolveSend, reject: rejectSend });
            socket.send(JSON.stringify(payload));
          });
        },
        onEvent(listener) {
          listeners.push(listener);
          return () => {
            const index = listeners.indexOf(listener);
            if (index !== -1) listeners.splice(index, 1);
          };
        },
        close() {
          for (const entry of pending.values()) entry.reject(new Error("CDP connection closed"));
          pending.clear();
          socket.close();
        },
      });
    });
    socket.addEventListener("message", (event) => {
      let message: CdpMessage;
      try {
        message = JSON.parse(String(event.data)) as CdpMessage;
      } catch {
        return;
      }
      if (typeof message.id === "number") {
        const entry = pending.get(message.id);
        if (!entry) return;
        pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message || "CDP error"));
        else entry.resolve(message.result ?? {});
        return;
      }
      if (message.method) for (const listener of listeners) listener(message);
    });
    socket.addEventListener("error", () => {
      if (!opened) reject(new Error("CDP socket error"));
    });
    socket.addEventListener("close", () => {
      if (!opened) reject(new Error("CDP socket closed before opening"));
      for (const entry of pending.values()) entry.reject(new Error("CDP connection closed"));
      pending.clear();
    });
  });
}

async function waitForDevToolsPort(profileDir: string, child: ChildProcess, timeoutMs: number): Promise<number> {
  const portFile = join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + timeoutMs;
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });
  while (Date.now() < deadline) {
    if (exited) throw new Error("Chromium exited before exposing its debugging port");
    try {
      const text = await fs.readFile(portFile, "utf8");
      const port = Number.parseInt(text.split("\n")[0] ?? "", 10);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // Not written yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Chromium did not expose its debugging port in time");
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function createRenderer(options: RendererOptions = {}): FullRenderer {
  const timeoutMs = options.timeoutMs ?? RENDER_TIMEOUT_MS;
  const measureTimeoutMs = options.measureTimeoutMs ?? DEFAULT_MEASURE_TIMEOUT_MS;
  const limit = createLimiter(options.maxConcurrent ?? MAX_CONCURRENT_RENDERS);
  let browserPromise: Promise<{ cdp: CdpConnection; child: ChildProcess; profileDir: string }> | null = null;
  let closed = false;

  const launch = async (): Promise<{ cdp: CdpConnection; child: ChildProcess; profileDir: string }> => {
    const executable = options.executablePath ?? findChromiumExecutable();
    if (!executable) {
      throw new RenderError(
        "browser_unavailable",
        "No sandboxed Chromium found. Set PASEO_HTML_RENDER_CHROMIUM to a Chromium executable.",
      );
    }
    const profileDir = await fs.mkdtemp(join(tmpdir(), "paseo-html-render-"));
    await fs.chmod(profileDir, 0o700).catch(() => {});
    let stderr = "";
    const child = spawn(
      executable,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${profileDir}`,
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
        "--disable-features=Translate,BackForwardCache,AcceptCHFrame",
        "--host-resolver-rules=MAP * ~NOTFOUND",
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"], detached: false },
    );
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-MAX_BROWSER_STDERR);
    });
    // Never add --no-sandbox. A sandbox failure fails closed here.
    try {
      const port = await waitForDevToolsPort(profileDir, child, BROWSER_START_TIMEOUT_MS);
      let path = "";
      try {
        path = (await fs.readFile(join(profileDir, "DevToolsActivePort"), "utf8")).split("\n")[1] ?? "";
      } catch {
        path = "";
      }
      if (!path.startsWith("/devtools/browser/")) {
        throw new Error("Chromium did not publish a browser websocket path");
      }
      const cdp = await connectCdp(`ws://127.0.0.1:${port}${path}`);
      options.onBrowserLaunch?.();
      return { cdp, child, profileDir };
    } catch (error) {
      child.kill("SIGKILL");
      await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
      const detail = stderr.trim().split("\n").slice(0, 3).join(" ");
      throw new RenderError(
        "browser_unavailable",
        `A sandboxed Chromium could not start: ${
          error instanceof Error ? error.message : String(error)
        }${detail ? ` (${detail.slice(0, 300)})` : ""}`,
      );
    }
  };

  const getBrowser = async () => {
    if (closed) throw new RenderError("render_failed", "Renderer is shut down");
    if (!browserPromise) {
      browserPromise = launch();
      browserPromise.catch(() => {
        browserPromise = null;
      });
    }
    return browserPromise;
  };

  /**
   * Opens one script-disabled, offline page target. Every capture and every
   * measured width gets a fresh target (pages often lay out from width once at
   * load), but all of them share the one lazy browser instance.
   */
  const openPage = async (input: {
    width: number;
    viewportHeight: number;
    appearance: Appearance;
    signal?: AbortSignal;
  }): Promise<{
    send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
    load(html: string): Promise<void>;
    close(): Promise<void>;
  }> => {
    input.signal?.throwIfAborted();
    const browser = await withAbort(getBrowser(), input.signal);
    input.signal?.throwIfAborted();
    let targetId = "";
    let unsubscribe = () => {};
    const close = async () => {
      unsubscribe();
      input.signal?.removeEventListener("abort", abortPage);
      if (targetId) await Promise.race([
        browser.cdp.send("Target.closeTarget", { targetId }).catch(() => {}),
        new Promise(resolve => { const timer = setTimeout(resolve, 2000); timer.unref(); }),
      ]);
    };
    const abortPage = () => { void close(); };
    input.signal?.addEventListener("abort", abortPage, { once: true });
    try {
      await withAbort(browser.cdp.send("Target.createTarget", { url: "about:blank" }).then(created => {
        targetId = String(created.targetId ?? "");
        if (input.signal?.aborted) void close();
      }), input.signal);
      if (!targetId) throw new Error("Chromium did not create a page target");
      const attached = await withAbort(browser.cdp.send("Target.attachToTarget", { targetId, flatten: true }), input.signal);
      const sessionId = String(attached.sessionId ?? "");
      if (!sessionId) throw new Error("Chromium did not attach to the page target");
      const session = sessionId;

      const send = (method: string, params?: Record<string, unknown>) => {
        input.signal?.throwIfAborted();
        return withAbort(browser.cdp.send(method, params, session), input.signal);
      };
      unsubscribe = browser.cdp.onEvent((message) => {
        if (message.sessionId !== session) return;
        if (message.method !== "Network.requestWillBeSent") return;
        const url = String((message.params?.request as { url?: unknown } | undefined)?.url ?? "");
        if (!url) return;
        options.onBlockedRequest?.(url, url === "about:blank" || url.startsWith("data:"));
      });
      await send("Page.enable");
      await send("Runtime.enable");
      await send("Network.enable");
      await send("Emulation.setDeviceMetricsOverride", {
        width: input.width,
        height: input.viewportHeight,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: input.appearance }],
      });
      // Report JavaScript must be impossible, not merely discouraged. Runtime
      // evaluation over CDP still works for trusted measurement probes.
      await send("Emulation.setScriptExecutionDisabled", { value: true });
      // Belt and braces: URL patterns, offline mode, and the DNS override passed
      // to Chromium at launch. data: URLs are the only ones left readable.
      await send("Network.setBlockedURLs", {
        urls: ["http://*", "https://*", "ws://*", "wss://*", "ftp://*", "file://*", "blob:*"],
      });
      await send("Network.emulateNetworkConditions", {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0,
      });

      return {
        send,
        async load(html) {
          const tree = await send("Page.getFrameTree");
          const frameId = String(
            (tree.frameTree as { frame?: { id?: unknown } } | undefined)?.frame?.id ?? "",
          );
          if (!frameId) throw new Error("Chromium did not expose a page frame");
          await send("Page.setDocumentContent", { frameId, html });
          // Settle like T3: wait for web fonts, then two paint frames. Page
          // scripts are off, so `fonts.ready.then(rAF)` never resolves; poll the
          // font status instead (bounded) and keep a fixed yield for layout.
          for (let attempt = 0; attempt < 10; attempt += 1) {
            const status = await send("Runtime.evaluate", {
              expression: "document.fonts.status",
              returnByValue: true,
              awaitPromise: false,
            }).then(
              (result) => String((result.result as { value?: unknown } | undefined)?.value ?? ""),
              () => "unavailable",
            );
            if (status === "loaded" || status === "unavailable") break;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          await new Promise((resolve) => setTimeout(resolve, PAGE_SETTLE_MS));
        },
        close,
      };
    } catch (error) {
      await close();
      throw error;
    }
  };

  const measureWidth = async (
    html: string,
    width: number,
    signal?: AbortSignal,
  ): Promise<number> => {
    let page: Awaited<ReturnType<typeof openPage>> | null = null;
    try {
      page = await openPage({ width, viewportHeight: MEASURE_VIEWPORT_HEIGHT, appearance: "dark", signal });
      await page.load(html);
      const evaluated = await page.send("Runtime.evaluate", {
        expression: MEASURE_EXPRESSION,
        returnByValue: true,
        awaitPromise: false,
      });
      const value = Number((evaluated.result as { value?: unknown } | undefined)?.value);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("Chromium returned an invalid measured height");
      }
      return Math.min(MAX_CAPTURED_HEIGHT, Math.max(1, Math.ceil(value)));
    } catch (error) {
      if (error instanceof RenderError) throw error;
      throw new RenderError(
        "render_failed",
        `Measurement failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await page?.close();
    }
  };

  const measureUnprepared = async (
    input: MeasureInput,
    prepared: boolean,
  ): Promise<MeasuredHeights> => {
    const html = injectTheme(prepared ? assertPreparedHtml(input.html) : assertHtml(input.html), "dark");
    let widths: number[];
    try {
      widths = normalizeMeasureWidths(input.widths);
    } catch (error) {
      throw new RenderError(
        "invalid_input",
        error instanceof Error ? error.message : "widths are invalid",
      );
    }
    const signal = input.signal
      ? AbortSignal.any([input.signal, AbortSignal.timeout(measureTimeoutMs)])
      : AbortSignal.timeout(measureTimeoutMs);
    signal.throwIfAborted();
    const run = Promise.all(widths.map(async width => [width, await limit(() => {
      signal.throwIfAborted();
      return measureWidth(html, width, signal);
    })] as const)).then(measured => assertMeasuredHeights(widths, measured));
    try { return await withAbort(run, signal); }
    catch (error) {
      if (signal.aborted) throw new RenderError("timeout", "Measurement canceled or timed out");
      throw error;
    }
  };

  const renderOnce = async (input: RenderInput, prepared: boolean): Promise<RenderOutput> => {
    const html = injectTheme(
      prepared ? assertPreparedHtml(input.html) : assertHtml(input.html),
      input.appearance === "light" ? "light" : "dark",
    );
    const width = clampWidth(input.width);
    let page: Awaited<ReturnType<typeof openPage>> | null = null;
    try {
      page = await openPage({
        width,
        viewportHeight: RENDER_VIEWPORT_HEIGHT,
        appearance: input.appearance === "light" ? "light" : "dark",
        signal: input.signal,
      });
      await page.load(html);

      // T3's expression: short pages report their own box, not the 800px floor.
      const measured = await page.send("Runtime.evaluate", {
        expression: MEASURE_EXPRESSION,
        returnByValue: true,
        awaitPromise: false,
      }).then(
        (result) => Number((result.result as { value?: unknown } | undefined)?.value),
        () => Number.NaN,
      );
      const metrics = await page.send("Page.getLayoutMetrics");
      const content = (metrics.cssContentSize ?? {}) as { width?: number; height?: number };
      const fallback = Math.max(1, Math.ceil(Number(content.height ?? RENDER_VIEWPORT_HEIGHT)));
      const contentHeight = Number.isFinite(measured) && measured > 0 ? Math.max(1, Math.ceil(measured)) : fallback;
      let capturedHeight = Math.min(contentHeight, MAX_CAPTURED_HEIGHT);
      await page.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: capturedHeight,
        deviceScaleFactor: 1,
        mobile: false,
      });
      // Noisy SVG/photos can exceed the PNG/wire budget even within pixel bounds.
      // Keep the requested width, progressively clip height, and report the actual
      // capturedHeight rather than sending an oversized base64 response.
      let png: Buffer;
      for (;;) {
        input.signal?.throwIfAborted();
        const shot = await page.send("Page.captureScreenshot", {
          format: "png", captureBeyondViewport: true, fromSurface: true, optimizeForSpeed: false,
          clip: { x: 0, y: 0, width, height: capturedHeight, scale: 1 },
        });
        png = Buffer.from(typeof shot.data === "string" ? shot.data : "", "base64");
        if (png.byteLength === 0) throw new Error("Chromium returned an empty screenshot");
        if (png.byteLength <= MAX_PREVIEW_PNG_BYTES) break;
        if (capturedHeight <= 1) throw new RenderError("output_too_large", "PNG exceeds the 3 MiB preview budget");
        capturedHeight = Math.max(1, Math.floor(capturedHeight * 0.65));
      }

      if (options.inspectDom) {
        await options.inspectDom(async (expression) => {
          const evaluated = await page!.send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: false,
          });
          const result = evaluated.result as { value?: unknown } | undefined;
          return result?.value;
        });
      }
      return { png, width, contentHeight, capturedHeight };
    } catch (error) {
      if (error instanceof RenderError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (/timeout|timed out/i.test(message)) {
        throw new RenderError("timeout", `Rendering timed out after ${timeoutMs}ms`);
      }
      throw new RenderError("render_failed", `Rendering failed: ${message}`);
    } finally {
      await page?.close();
    }
  };

  const capture = async (input: RenderInput, prepared: boolean): Promise<RenderOutput> => {
    const signal = input.signal
      ? AbortSignal.any([input.signal, AbortSignal.timeout(timeoutMs + 5000)])
      : AbortSignal.timeout(timeoutMs + 5000);
    signal.throwIfAborted();
    try {
      return await withAbort(limit(() => {
        signal.throwIfAborted();
        return renderOnce({ ...input, signal }, prepared);
      }), signal);
    } catch (error) {
      if (signal.aborted) throw new RenderError("timeout", "Rendering canceled or timed out");
      throw error;
    }
  };

  return {
    render(input) { return capture(input, false); },
    renderPrepared(input) { return capture(input, true); },
    async measure(input) {
      const result = await measureUnprepared(input, false);
      return result;
    },
    async measurePrepared(input) {
      const result = await measureUnprepared(input, true);
      return result;
    },
    async close() {
      closed = true;
      const pending = browserPromise;
      browserPromise = null;
      if (!pending) return;
      const browser = await pending.catch(() => null);
      if (!browser) return;
      const exited = new Promise<void>((resolve) => {
        if (browser.child.exitCode !== null || browser.child.signalCode !== null) resolve();
        else browser.child.once("exit", () => resolve());
      });
      await browser.cdp.send("Browser.close").catch(() => {});
      browser.cdp.close();
      const timer = setTimeout(() => browser.child.kill("SIGKILL"), 2_000);
      timer.unref?.();
      await exited;
      clearTimeout(timer);
      await fs.rm(browser.profileDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    },
  };
}
