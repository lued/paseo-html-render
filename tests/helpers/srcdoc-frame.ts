import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChromiumExecutable } from "../../server/renderer.ts";

/**
 * Real Chromium harness for an exact interactive document in sandboxed
 * `allow-scripts` iframes. The host document is a local data: URL; the page is
 * `srcdoc`. Nothing is loaded from file:// or the network, and the browser
 * sandbox is never disabled.
 *
 * This is intentionally separate from `browser.ts`, which navigates a file URL.
 */
export interface SrcdocFrameSpec {
  id: string;
  width: number;
  height: number;
  sandbox: string;
  /** Absolute position in the host page. */
  x: number;
  y: number;
}

export interface SrcdocFrame {
  id: string;
  width: number;
  eval<T>(expression: string): Promise<T>;
  waitFor(expression: string, timeoutMs?: number): Promise<void>;
  click(x: number, y: number): Promise<void>;
  touch(x: number, y: number): Promise<void>;
  key(key: string, code: string, windowsVirtualKeyCode: number): Promise<void>;
  setMedia(reduced: boolean): Promise<void>;
}

interface FrameRecord {
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  eval<T>(expression: string): Promise<T>;
  name: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withSrcdocFrames<T>(options: {
  doc: string;
  specs: readonly SrcdocFrameSpec[];
  viewport: { width: number; height: number };
  run: (frames: Readonly<Record<string, SrcdocFrame>>) => Promise<T>;
}): Promise<T> {
  const executable = findChromiumExecutable();
  if (!executable) throw new Error("Chromium is required for the srcdoc interaction harness");
  const dir = await fs.mkdtemp(join(tmpdir(), "srcdoc-hit-target-"));
  const profile = join(dir, "profile");
  const child = spawn(executable, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-component-update", "--disable-sync",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows", "about:blank",
  ], { stdio: "ignore", detached: true });
  const killOnExit = () => {
    if (child.pid) {
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* group already gone */ }
    }
  };
  process.once("exit", killOnExit);
  let socket: WebSocket | undefined;
  let nextId = 1;
  let spawnError: Error | null = null;
  let transportClosed = false;
  const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const records: Record<string, FrameRecord> = {};
  const rejectPending = (error: Error) => {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  };
  child.once("error", (error) => {
    spawnError = error instanceof Error ? error : new Error(String(error));
    rejectPending(spawnError);
  });

  try {
    let address = "";
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error("Chromium exited before exposing CDP");
      try {
        const [port, path] = (await fs.readFile(join(profile, "DevToolsActivePort"), "utf8")).trim().split("\n");
        if (/^\d+$/.test(port ?? "") && path?.startsWith("/devtools/browser/")) {
          address = `ws://127.0.0.1:${port}${path}`;
          break;
        }
        await sleep(50);
      } catch { await sleep(50); }
    }
    if (!address) throw new Error("Chromium did not expose CDP");

    socket = new WebSocket(address);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP connection timed out")), 5_000);
      timer.unref?.();
      socket!.onopen = () => { clearTimeout(timer); resolve(); };
      socket!.onerror = () => { clearTimeout(timer); reject(new Error("CDP connection failed")); };
    });
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id === undefined) return;
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message ?? "CDP error"));
      else item.resolve(message.result ?? {});
    };
    socket.onclose = () => {
      transportClosed = true;
      rejectPending(new Error("CDP socket closed"));
    };
    socket.onerror = () => {
      transportClosed = true;
      rejectPending(new Error("CDP socket failed"));
    };
    const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) =>
      new Promise<any>((resolve, reject) => {
        if (transportClosed) {
          reject(new Error("CDP is closed"));
          return;
        }
        if (spawnError) {
          reject(spawnError);
          return;
        }
        const id = nextId++;
        const timer = setTimeout(() => {
          if (pending.delete(id)) reject(new Error(`CDP ${method} timed out`));
        }, 30_000);
        timer.unref?.();
        pending.set(id, {
          resolve: (value) => { clearTimeout(timer); resolve(value); },
          reject: (error) => { clearTimeout(timer); reject(error); },
          timer,
        });
        try {
          socket!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        } catch (error) {
          pending.delete(id);
          clearTimeout(timer);
          reject(error);
        }
      });

    const target = await send("Target.createTarget", { url: "about:blank" });
    const mainAttached = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    const mainSession = mainAttached.sessionId;
    const mainSend = (method: string, params: Record<string, unknown> = {}) => send(method, params, mainSession);
    const mainEval = async <T>(expression: string): Promise<T> => {
      const result = await mainSend("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "main evaluation failed");
      return result.result?.value as T;
    };
    await send("Target.activateTarget", { targetId: target.targetId });
    await mainSend("Page.enable");
    await mainSend("Runtime.enable");
    await mainSend("Page.bringToFront");
    await mainSend("Emulation.setDeviceMetricsOverride", {
      width: options.viewport.width, height: options.viewport.height, deviceScaleFactor: 1, mobile: false,
    });

    const safeDoc = JSON.stringify(options.doc).replace(/<\/script/gi, "<\\/script");
    const host = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#222;width:100%;height:100%}iframe{position:absolute;display:block;border:0;background:#111}</style>
</head><body>
<script>
const DOC = ${safeDoc};
const specs = ${JSON.stringify(options.specs)};
for (const spec of specs) {
  const frame = document.createElement("iframe");
  frame.id = spec.id;
  frame.name = spec.id;
  frame.setAttribute("sandbox", spec.sandbox);
  frame.style.left = spec.x + "px";
  frame.style.top = spec.y + "px";
  frame.style.width = spec.width + "px";
  frame.style.height = spec.height + "px";
  frame.srcdoc = DOC;
  document.body.appendChild(frame);
}
window.__harnessReady = true;
</script></body></html>`;
    const hostUrl = "data:text/html;base64," + Buffer.from(host, "utf8").toString("base64");
    await mainSend("Page.navigate", { url: hostUrl });
    for (let i = 0; i < 100; i++) {
      if (await mainEval<boolean>("window.__harnessReady === true").catch(() => false)) break;
      await sleep(50);
    }

    let iframeTargets: Array<{ targetId: string }> = [];
    for (let i = 0; i < 100; i++) {
      const targets = await send("Target.getTargets");
      iframeTargets = (targets.targetInfos ?? []).filter(
        (info: { type?: string; parentId?: string }) => info.type === "iframe" && info.parentId === target.targetId,
      );
      if (iframeTargets.length >= options.specs.length) break;
      await sleep(50);
    }
    if (iframeTargets.length < options.specs.length) {
      throw new Error(`expected ${options.specs.length} iframe targets, got ${iframeTargets.length}`);
    }

    for (const info of iframeTargets) {
      const attached = await send("Target.attachToTarget", { targetId: info.targetId, flatten: true });
      const sessionId = attached.sessionId;
      const rawSend = (method: string, params: Record<string, unknown> = {}) =>
        send(method, params, sessionId).catch((error: Error) => {
          throw new Error(`${method}: ${error.message}`);
        });
      await rawSend("Page.enable");
      await rawSend("Runtime.enable");
      await rawSend("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      const frameEval = async <T>(expression: string): Promise<T> => {
        const result = await rawSend("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
        if (result.exceptionDetails) {
          throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "frame evaluation failed");
        }
        return result.result?.value as T;
      };
      const name = await frameEval<string>("window.name").catch(() => "");
      const width = await frameEval<number>("innerWidth").catch(() => 0);
      const js = await frameEval<boolean>("document.documentElement.classList.contains('js')").catch(() => false);
      let id = name;
      if (!options.specs.some((spec) => spec.id === id)) {
        if (width === 375) id = "n375";
        else if (width === 1024) id = "wide";
        else if (width === 390 && js) id = "n390";
        else if (width === 390 && !js) id = "static";
      }
      if (!options.specs.some((spec) => spec.id === id)) {
        throw new Error(`cannot identify iframe target ${info.targetId}: name=${name} width=${width} js=${js}`);
      }
      records[id] = { send: rawSend, eval: frameEval, name: id };
    }

    const frames: Record<string, SrcdocFrame> = {};
    for (const spec of options.specs) {
      const record = records[spec.id];
      if (!record) throw new Error(`missing frame ${spec.id}`);
      frames[spec.id] = {
        id: spec.id,
        width: spec.width,
        eval: record.eval,
        async waitFor(expression, timeoutMs = 10_000) {
          const until = Date.now() + timeoutMs;
          while (Date.now() < until) {
            if (await record.eval<boolean>(expression).catch(() => false)) return;
            await sleep(50);
          }
          throw new Error(`frame ${spec.id} did not satisfy: ${expression}`);
        },
        async click(x, y) {
          await record.send("Input.dispatchMouseEvent", {
            type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1,
          });
          await record.send("Input.dispatchMouseEvent", {
            type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1,
          });
          await sleep(120);
        },
        async touch(x, y) {
          await record.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x, y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1, id: 1 }],
          });
          await sleep(30);
          await record.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          await sleep(150);
        },
        async key(key, code, windowsVirtualKeyCode) {
          await record.send("Input.dispatchKeyEvent", {
            type: "keyDown", key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode,
          });
          await record.send("Input.dispatchKeyEvent", {
            type: "keyUp", key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode,
          });
          await sleep(120);
        },
        async setMedia(reduced) {
          await record.send("Emulation.setEmulatedMedia", {
            features: [
              { name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" },
              { name: "prefers-color-scheme", value: "dark" },
            ],
          });
          await sleep(120);
        },
      };
    }

    return await options.run(frames);
  } finally {
    process.off("exit", killOnExit);
    transportClosed = true;
    try { socket?.close(); } catch { /* ignore */ }
    rejectPending(new Error("harness closed"));
    if (child.exitCode === null && child.signalCode === null && child.pid) {
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* ignore */ }
    }
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.off("exit", done);
        resolve();
      };
      const timer = setTimeout(done, 5000);
      timer.unref?.();
      child.once("exit", done);
    });
    if (child.exitCode === null && child.signalCode === null) {
      throw new Error("Chromium process did not stop");
    }
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    if (existsSync(dir)) throw new Error("Chromium profile cleanup failed");
  }
}
