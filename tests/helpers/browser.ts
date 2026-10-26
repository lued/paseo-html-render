import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { findChromiumExecutable } from "../../server/renderer.ts";

/** Isolated real Chromium harness; never disables the browser sandbox. */
export interface BrowserInteraction {
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<any>;
  sessionId: string;
  targetId: string;
}

export interface BrowserOptions {
  /** Absolute path for a PNG of the rendered page, captured before teardown. */
  screenshotPath?: string;
  viewport?: { width: number; height: number };
  /** Emulate the top-level OS media preference before the page navigates. */
  reducedMotion?: "reduce" | "no-preference";
  /** Test-only interaction after navigation and before window.__result is read. */
  interact?: (io: BrowserInteraction) => Promise<void>;
  /** Opt-in local data-document navigation for opaque-origin tests. Default: file. */
  navigation?: "file" | "data";
}

export async function browserResult(html: string, options: BrowserOptions = {}): Promise<unknown> {
  const executable = findChromiumExecutable();
  if (!executable) throw new Error("Chromium is required for mounted client verification");
  const dir = await fs.mkdtemp(join(tmpdir(), "html-mounted-frame-"));
  const profile = join(dir, "profile");
  const file = join(dir, "host.html");
  await fs.writeFile(file, html);
  const child = spawn(executable, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-component-update", "--disable-sync",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows", "about:blank"],
    { stdio: "ignore" });
  let socket: WebSocket | undefined;
  let next = 1;
  const pending = new Map<number, {resolve(v: any): void; reject(e: Error): void}>();
  try {
    let address = "";
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      try {
        const [port, path] = (await fs.readFile(join(profile, "DevToolsActivePort"), "utf8")).trim().split("\n");
        if (/^\d+$/.test(port ?? "") && path?.startsWith("/devtools/browser/")) {
          address = `ws://127.0.0.1:${port}${path}`;
          break;
        }
        await new Promise(r => setTimeout(r, 50));
      } catch { await new Promise(r => setTimeout(r, 50)); }
    }
    assert.ok(address, "Chromium exposed CDP");
    socket = new WebSocket(address);
    await new Promise<void>((resolve, reject) => {
      socket!.addEventListener("open", () => resolve());
      socket!.addEventListener("error", () => reject(new Error("CDP connection failed")));
    });
    socket.addEventListener("message", event => {
      const message = JSON.parse(String(event.data));
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result);
    });
    const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => {
      const id = next++;
      return new Promise<any>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket!.send(JSON.stringify({ id, method, params, ...(sessionId ? {sessionId} : {}) }));
      });
    };
    const target = await send("Target.createTarget", { url: "about:blank" });
    const {sessionId} = await send("Target.attachToTarget", {targetId: target.targetId, flatten: true});
    await send("Page.enable", {}, sessionId);
    if (options.reducedMotion) {
      await send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: options.reducedMotion }],
      }, sessionId);
    }
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.addEventListener('error', event => {
        window.__result = { error: event.message, stack: event.error && event.error.stack };
      });
      window.addEventListener('unhandledrejection', event => {
        window.__result = { error: String(event.reason), stack: event.reason && event.reason.stack };
      });
    ` }, sessionId);
    await send("Target.activateTarget", { targetId: target.targetId });
    if (options.viewport) {
      await send("Emulation.setDeviceMetricsOverride", {
        width: options.viewport.width,
        height: options.viewport.height,
        deviceScaleFactor: 1,
        mobile: false,
      }, sessionId);
    }
    if (options.navigation === "data") {
      // Opt-in local in-memory document. The URL stays about:blank, so the
      // shell has an opaque origin without file:// access.
      await send("Page.navigate", { url: "about:blank" }, sessionId);
      const tree = await send("Page.getFrameTree", {}, sessionId);
      await send("Page.setDocumentContent", { frameId: tree.frameTree.frame.id, html }, sessionId);
    } else {
      await send("Page.navigate", { url: `file://${file}` }, sessionId);
    }
    await send("Page.bringToFront", {}, sessionId);
    if (options.interact) await options.interact({ send, sessionId, targetId: target.targetId });
    const until = Date.now() + 30_000;
    while (Date.now() < until) {
      const out = await send("Runtime.evaluate", {expression: "window.__result || null", returnByValue: true}, sessionId);
      if (out.result?.value) {
        if (options.screenshotPath) {
          // Give layout (and any final paint) one more frame before the capture.
          await new Promise(r => setTimeout(r, 250));
          const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, sessionId);
          await fs.mkdir(dirname(options.screenshotPath), { recursive: true });
          await fs.writeFile(options.screenshotPath, Buffer.from(shot.data, "base64"), { mode: 0o600 });
        }
        return out.result.value;
      }
      await new Promise(r => setTimeout(r, 100));
    }
    const dump = await send("Runtime.evaluate", {expression: "document.body.innerText", returnByValue: true}, sessionId);
    throw new Error(`Mounted client did not finish: ${String(dump.result?.value).slice(0, 1000)}`);
  } finally {
    socket?.close();
    for (const item of pending.values()) item.reject(new Error("Browser harness closed"));
    child.kill("SIGKILL");
    await new Promise<void>(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once("exit", () => resolve());
      setTimeout(resolve, 2000).unref();
    });
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
