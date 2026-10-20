#!/usr/bin/env node
/**
 * Real-client acceptance capture for the html-render plugin.
 *
 * Opens the public Paseo web client with a fresh pairing offer, connects to the
 * local daemon, opens one agent timeline, and verifies - without a human looking
 * at the screen - that
 *   1. the plugin's inline frame is mounted (sandbox, allow, CSP, height), and
 *   2. the "Open interactive report" file link opens Paseo's HTML file preview.
 *
 * Screenshots + a JSON result are written to the evidence directory. The pairing
 * offer is never written to disk or printed.
 *
 * Usage: node scripts/e2e-client.mjs --agent <agentId> --out <dir>
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { findChromiumExecutable } from "../server/renderer.ts";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const agentId = option("agent", process.env.PASEO_E2E_AGENT ?? "");
const agentTitle = option("title", process.env.PASEO_E2E_TITLE ?? "html-render verify e2e");
const outDir = resolve(option("out", process.env.PASEO_HTML_RENDER_EVIDENCE_DIR ?? ""));
const chromium = option("chromium", process.env.PASEO_HTML_RENDER_CHROMIUM ?? "");
if (!agentId) {
  console.error("e2e-client: --agent <agentId> is required");
  process.exit(2);
}
if (!outDir) {
  console.error("e2e-client: --out <dir> is required");
  process.exit(2);
}

const result = { agentId, startedAt: new Date().toISOString(), timeline: {}, filePreview: {}, errors: [] };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function paseo(...cliArgs) {
  return new Promise((done, fail) => {
    const child = spawn("npx", ["paseo", ...cliArgs], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    const timer = setTimeout(() => { child.kill("SIGKILL"); fail(new Error(`paseo ${cliArgs.join(" ")} timed out`)); }, 45_000);
    timer.unref?.();
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) done(out);
      else fail(new Error(`paseo ${cliArgs.join(" ")} exited ${code}: ${err.slice(0, 300)}`));
    });
  });
}

async function daemonUrl() {
  const status = JSON.parse(await paseo("status", "--json"));
  const pair = JSON.parse(await paseo("pair", "--json"));
  if (!pair.url) throw new Error("daemon printed no pairing URL");
  return { url: pair.url, serverId: status.serverId, listen: status.listen };
}

/** Minimal CDP client over the DevTools websocket. */
async function openBrowser(executable) {
  const profileDir = await fs.mkdtemp("/tmp/paseo-e2e-client-");
  const child = spawn(executable, [
    "--headless=new",
    // The client page is our own trusted app, not untrusted report HTML.
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--remote-debugging-port=0",
    `--user-data-dir=${join(profileDir, "profile")}`,
    "--window-size=1400,1000",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ], { stdio: "ignore" });
  const profile = join(profileDir, "profile");
  let address = "";
  for (let attempt = 0; attempt < 400; attempt += 1) {
    try {
      const [port, path] = (await fs.readFile(join(profile, "DevToolsActivePort"), "utf8")).trim().split("\n");
      if (/^\d+$/.test(port ?? "") && path?.startsWith("/devtools/browser/")) {
        address = `ws://127.0.0.1:${port}${path}`;
        break;
      }
    } catch { /* not written yet */ }
    await sleep(50);
  }
  if (!address) throw new Error("Chromium did not expose a DevTools port");
  let socket;
  for (let attempt = 0; attempt < 20 && !socket; attempt += 1) {
    socket = await new Promise((done) => {
      const candidate = new WebSocket(address);
      candidate.onopen = () => done(candidate);
      candidate.onerror = () => done(null);
    });
    if (!socket) await sleep(100);
  }
  if (!socket) throw new Error("Chromium DevTools connection failed");

  let nextId = 1;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message));
    else item.resolve(message.result);
  };
  const send = (method, params = {}, sessionId) => new Promise((done, fail) => {
    const id = nextId++;
    pending.set(id, { resolve: done, reject: fail });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const target = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  const evaluate = async (expression) => {
    const out = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    return out?.result?.value;
  };
  const screenshot = async (path) => {
    const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    await fs.writeFile(path, Buffer.from(shot.data, "base64"), { mode: 0o600 });
  };
  const close = async () => {
    try { socket.close(); } catch { /* ignore */ }
    child.kill("SIGKILL");
    await sleep(200);
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
  };
  const waitFor = async (expression, ms, label) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try { if (await evaluate(expression)) return true; } catch { /* navigating */ }
      await sleep(250);
    }
    throw new Error(`timed out waiting for ${label}`);
  };
  return { send, evaluate, screenshot, waitFor, close, sessionId };
}

async function main() {
  await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
  const { url, serverId } = await daemonUrl();
  result.serverId = serverId;
  const executable = chromium || findChromiumExecutable();
  if (!executable) throw new Error("no Chromium executable found; set PASEO_HTML_RENDER_CHROMIUM");
  const browser = await openBrowser(executable);
  try {
    await browser.send("Page.navigate", { url }, browser.sessionId);
    await browser.waitFor("document.body && document.body.innerText.includes('Connect')", 45_000, "pairing dialog");
    const connected = await browser.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find((node) => (node.textContent || '').trim() === 'Connect');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (!connected) throw new Error("pairing dialog had no Connect button");
    await browser.waitFor("!document.body.innerText.includes('Connect to this host')", 60_000, "pairing to finish");
    await sleep(1500);

    await browser.send("Page.navigate", { url: `https://app.paseo.sh/h/${serverId}/agent/${agentId}` }, browser.sessionId);
    await sleep(6000);
    // The agent route can land on a sibling agent in the same workspace; select
    // the acceptance agent's tab explicitly by its title.
    const clickedTab = await browser.evaluate(`(() => {
      const nodes = Array.from(document.querySelectorAll('[role=tab],button,a'));
      const tab = nodes.find((node) => (node.textContent || '').trim() === ${JSON.stringify(agentTitle)});
      if (!tab) return false;
      tab.click();
      return true;
    })()`);
    if (clickedTab) await sleep(2500);
    try {
      await browser.waitFor("document.querySelectorAll('iframe').length > 0", 90_000, "inline card frame");
    } catch (error) {
      // Persist why before failing: DOM text plus a screenshot.
      const diagnostic = await browser.evaluate("document.body.innerText.slice(-3000)");
      result.errors.push(String(error));
      result.failureText = diagnostic;
      await browser.screenshot(join(outDir, "g6-failure.png"));
      throw error;
    }
    await sleep(2000);
    result.timeline = await browser.evaluate(`JSON.stringify({
      url: location.href,
      frames: Array.from(document.querySelectorAll('iframe')).map((frame) => ({
        sandbox: frame.getAttribute('sandbox'),
        allow: frame.getAttribute('allow'),
        height: frame.style.height,
        hasCsp: (frame.getAttribute('srcdoc') || '').includes('Content-Security-Policy'),
        hasContent: (frame.getAttribute('srcdoc') || '').includes('CLIENT ACCEPTANCE')
      })),
      text: document.body.innerText.slice(0, 1200)
    })`).then((raw) => JSON.parse(raw));
    await browser.screenshot(join(outDir, "g6-timeline.png"));

    // The assistant's final reply with the Markdown file link can arrive after
    // the card itself, so wait for it instead of sampling once.
    const findLink = `Array.from(document.querySelectorAll('a,button')).find((node) => {
      const label = (node.textContent || '').trim();
      return label === 'Open interactive report' || /interactive\.html$/i.test(label);
    })`;
    await browser.waitFor(`Boolean(${findLink})`, 45_000, "interactive report file link");
    const clicked = await browser.evaluate(`(() => { const link = ${findLink}; if (!link) return false; link.click(); return true; })()`);
    if (!clicked) throw new Error("timeline had no interactive report file link");
    await browser.waitFor("document.querySelectorAll('iframe').length > 1", 45_000, "file preview frame");
    await sleep(2500);
    result.filePreview = await browser.evaluate(`JSON.stringify({
      url: location.href,
      frames: Array.from(document.querySelectorAll('iframe')).map((frame) => ({
        sandbox: frame.getAttribute('sandbox'),
        hasCsp: (frame.getAttribute('srcdoc') || '').includes('Content-Security-Policy')
      })),
      text: document.body.innerText.slice(-600)
    })`).then((raw) => JSON.parse(raw));
    await browser.screenshot(join(outDir, "g6-file-preview.png"));
  } finally {
    await browser.close();
  }
  result.finishedAt = new Date().toISOString();
  await fs.writeFile(join(outDir, "g6-client.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ timelineFrames: result.timeline.frames?.length, previewFrames: result.filePreview.frames?.length, outDir }));
}

main().catch(async (error) => {
  result.errors.push(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  try {
    await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(join(outDir, "g6-client.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  } catch { /* ignore */ }
  console.error(`e2e-client: ${result.errors[0]}`);
  process.exit(1);
});
