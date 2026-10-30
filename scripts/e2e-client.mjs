#!/usr/bin/env node
/**
 * Real hosted-client capture for the protected fixture.
 *
 * The browser profile is fresh and owned. Before app scripts run it installs
 * the app's own `@paseo:e2e` test hook so the app cannot silently auto-connect
 * to the user's localhost daemon. It then drives the visible paste-link,
 * host-confirmation and password controls by stable test IDs, and scopes card
 * and file-preview assertions to the unique marker for this artifact.
 *
 * The pairing offer is read from a 0600 file and the generated test password
 * from PASEO_E2E_PASSWORD. Neither is ever printed, logged, screenshotted or
 * written into evidence. No auth store is injected and no auth code is patched.
 *
 * Usage: node scripts/e2e-client.mjs --config <0600 browser-config.json>
 */
import { spawn } from "node:child_process";
import { existsSync, promises as fs, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { findChromiumExecutable } from "../server/renderer.ts";
import { hostRegistryServerIds, redactSensitive } from "./fixture-paseo.mjs";

class UnavailableError extends Error {
  constructor(stage, message) {
    super(message);
    this.name = "UnavailableError";
    this.stage = stage;
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const AUTH_ERROR_SOURCE = "Password required|Incorrect password|Server disconnected|Unable to pair host|Pairing failed|connection failed|disconnected";

async function readConfig(path) {
  const raw = await fs.readFile(path, "utf8");
  const config = JSON.parse(raw);
  for (const key of ["outDir", "offerFile", "serverId", "agentId", "title", "marker", "artifactId", "interactivePath", "baseUrl"]) {
    if (typeof config[key] !== "string" || config[key].length === 0) {
      throw new Error(`browser config is missing ${key}`);
    }
  }
  return config;
}

/** Minimal CDP client over the DevTools websocket. */
function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(value);
    };
    const onExit = () => done(true);
    const timer = setTimeout(() => done(false), timeoutMs);
    timer.unref?.();
    child.once("exit", onExit);
  });
}

async function openBrowser(executable, profileRoot, childGroupFile) {
  const parent = profileRoot ? resolve(profileRoot) : "/tmp";
  await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  const profileDir = await fs.mkdtemp(join(parent, "browser-profile-"));
  await fs.chmod(profileDir, 0o700);
  let child;
  try {
    child = spawn(executable, [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--remote-debugging-port=0",
      `--user-data-dir=${join(profileDir, "profile")}`,
      "--window-size=1400,1000",
      "--lang=en-US",
      "--no-first-run",
      "--no-default-browser-check",
      // macOS blocks headless CDP navigation on the login keychain prompt.
      ...(process.platform === "darwin" ? ["--use-mock-keychain"] : []),
      "about:blank",
    ], { stdio: "ignore", detached: true });
  } catch (error) {
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  if (childGroupFile && child.pid) {
    try { writeFileSync(childGroupFile, `${JSON.stringify({ pid: child.pid })}\n`, { mode: 0o600 }); } catch { /* parent cleanup still owns the handle */ }
  }
  const killOwnedGroup = () => {
    if (!child.pid) return;
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* group already gone */ }
  };
  const killOnExit = () => {
    killOwnedGroup();
  };
  process.once("exit", killOnExit);
  let spawnError = null;
  let transportClosed = false;
  let closed = false;
  let socket;
  let nextId = 1;
  const listeners = new Set();
  const pending = new Map();
  const rejectPending = (error) => {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  };
  child.once("error", (error) => {
    spawnError = error;
    rejectPending(error);
  });

  try {
    const profile = join(profileDir, "profile");
    let address = "";
    const startDeadline = Date.now() + 20_000;
    while (Date.now() < startDeadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error("Chromium exited before exposing CDP");
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

    socket = new WebSocket(address);
    await new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error("Chromium DevTools connection timed out")), 5_000);
      timer.unref?.();
      socket.onopen = () => { clearTimeout(timer); done(); };
      socket.onerror = () => { clearTimeout(timer); fail(new Error("Chromium DevTools connection failed")); };
    });
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.method) {
        for (const listener of listeners) listener(message);
        return;
      }
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result);
    };
    socket.onclose = () => {
      transportClosed = true;
      rejectPending(new Error("Chromium CDP socket closed"));
    };
    socket.onerror = () => {
      transportClosed = true;
      rejectPending(new Error("Chromium CDP socket failed"));
    };

    const send = (method, params = {}, sessionId) => new Promise((done, fail) => {
      if (closed || transportClosed) {
        fail(new Error("Chromium CDP is closed"));
        return;
      }
      if (spawnError) {
        fail(spawnError);
        return;
      }
      const id = nextId++;
      const timer = setTimeout(() => {
        if (pending.delete(id)) fail(new Error(`Chromium CDP ${method} timed out`));
      }, 30_000);
      timer.unref?.();
      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); done(value); },
        reject: (error) => { clearTimeout(timer); fail(error); },
        timer,
      });
      try {
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        fail(error);
      }
    });
    const target = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    await send("Page.enable", {}, sessionId);
    await send("Runtime.enable", {}, sessionId);
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1400,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId);
    await send("Emulation.setLocaleOverride", { locale: "en-US" }, sessionId).catch(() => {});
    const evaluate = async (expression) => {
      const out = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (out?.exceptionDetails) throw new Error("Browser evaluation failed");
      return out?.result?.value;
    };
    const screenshot = async (path) => {
      const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
      await fs.writeFile(path, Buffer.from(shot.data, "base64"), { mode: 0o600 });
    };
    const close = async () => {
      process.off("exit", killOnExit);
      if (closed) {
        const removed = !existsSync(profileDir);
        return { browserStopped: child.exitCode !== null || child.signalCode !== null, profileRemoved: removed };
      }
      closed = true;
      try { socket?.close(); } catch { /* ignore */ }
      rejectPending(new Error("Chromium browser closed"));
      killOwnedGroup();
      const browserStopped = await waitForChildExit(child, 5_000);
      for (let attempt = 0; attempt < 5 && existsSync(profileDir); attempt += 1) {
        await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
        if (existsSync(profileDir)) await sleep(100);
      }
      return { browserStopped, profileRemoved: !existsSync(profileDir) };
    };
    const waitFor = async (expression, ms, label) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        try { if (await evaluate(expression)) return true; } catch { /* navigating */ }
        await sleep(250);
      }
      throw new Error(`timed out waiting for ${label}`);
    };
    return {
      send, evaluate, screenshot, waitFor, close, sessionId,
      onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    };
  } catch (error) {
    process.off("exit", killOnExit);
    transportClosed = true;
    rejectPending(error instanceof Error ? error : new Error(String(error)));
    try { socket?.close(); } catch { /* ignore */ }
    killOwnedGroup();
    await waitForChildExit(child, 5_000).catch(() => false);
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function grantLocalNetwork(browser, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const attempts = [
    () => browser.send("Browser.setPermission", { permission: { name: "localNetworkAccess" }, setting: "granted", origin }),
    () => browser.send("Browser.setPermission", { permission: { name: "local-network-access" }, setting: "granted", origin }),
    () => browser.send("Browser.setPermission", { permission: { name: "loopback-network" }, setting: "granted", origin }),
    () => browser.send("Browser.grantPermissions", { origin, permissions: ["localNetworkAccess"] }),
  ];
  for (const attempt of attempts) {
    try {
      await attempt();
      return true;
    } catch {
      /* unsupported on this Chrome; relay does not need it */
    }
  }
  return false;
}

async function bodyText(browser) {
  return browser.evaluate("document.body ? document.body.innerText : ''").catch(() => "");
}

async function registryIds(browser) {
  const raw = await browser.evaluate(`(() => {
    try {
      const ids = [];
      const store = globalThis.__paseoHostRuntimeStore;
      if (store && typeof store.getHosts === "function") {
        for (const entry of store.getHosts()) {
          if (entry && typeof entry.serverId === "string" && entry.serverId.length > 0) ids.push(entry.serverId);
          else return JSON.stringify({ error: "malformed runtime host" });
        }
      }
      const value = localStorage.getItem("@paseo:daemon-registry");
      if (value !== null && value !== "") {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return JSON.stringify({ error: "malformed stored hosts" });
        for (const entry of parsed) {
          if (typeof entry === "string" && entry.length > 0) ids.push(entry);
          else if (entry && typeof entry.serverId === "string" && entry.serverId.length > 0) ids.push(entry.serverId);
          else return JSON.stringify({ error: "malformed stored host" });
        }
      }
      return JSON.stringify([...new Set(ids)]);
    } catch {
      return JSON.stringify({ error: "unreadable hosts" });
    }
  })()`);
  return hostRegistryServerIds(raw);
}

async function waitForRegistry(browser, expected, timeoutMs, label) {
  const end = Date.now() + timeoutMs;
  let last = [];
  let lastError = null;
  while (Date.now() < end) {
    try {
      last = await registryIds(browser);
    } catch (error) {
      if (!/Execution context was destroyed|Cannot find context with specified id/i.test(String(error?.message ?? error))) {
        throw error;
      }
      lastError = error;
      await sleep(250);
      continue;
    }
    if (last.some((id) => !expected.includes(id))) {
      throw new Error(`unexpected host while waiting for ${label}: ${JSON.stringify(last)}`);
    }
    if (last.length === expected.length && expected.every((value, index) => last[index] === value)) return last;
    await sleep(250);
  }
  throw new Error(
    `timed out waiting for ${label}; hosts=${JSON.stringify(last)}${lastError ? `; ${lastError.message}` : ""}`,
  );
}


async function testIdRect(browser, testId) {
  const raw = await browser.evaluate(`(() => {
    const element = document.querySelector('[data-testid=${JSON.stringify(testId)}]');
    if (!element) return null;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return JSON.stringify({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  })()`);
  return raw ? JSON.parse(raw) : null;
}

async function clickPoint(browser, point) {
  const { x, y } = point;
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }, browser.sessionId);
  await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 }, browser.sessionId);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 }, browser.sessionId);
}

async function waitForTestId(browser, testId, timeoutMs, label) {
  const selector = `[data-testid=${JSON.stringify(testId)}]`;
  await browser.waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, timeoutMs, label);
}

async function clickTestId(browser, testId, timeoutMs, label) {
  await waitForTestId(browser, testId, timeoutMs, label);
  const selector = `[data-testid=${JSON.stringify(testId)}]`;
  await browser.waitFor(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    return Boolean(element && !element.disabled && element.getAttribute('aria-disabled') !== 'true'
      && getComputedStyle(element).pointerEvents !== 'none');
  })()`, timeoutMs, `${label} enabled`);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const point = await testIdRect(browser, testId);
    if (point) {
      await clickPoint(browser, point);
      return;
    }
    await sleep(100);
  }
  throw new Error(`could not click ${label}`);
}

async function findClickableRect(browser, expression) {
  const raw = await browser.evaluate(`(() => {
    const element = ${expression};
    if (!element) return null;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return JSON.stringify({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  })()`);
  return raw ? JSON.parse(raw) : null;
}

async function fillTestId(browser, testId, value) {
  const selector = `[data-testid=${JSON.stringify(testId)}]`;
  await browser.waitFor(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    return Boolean(element && !element.disabled && !element.readOnly
      && element.getAttribute('aria-disabled') !== 'true' && element.getAttribute('aria-readonly') !== 'true');
  })()`, 20_000, `${testId} editable`);
  const focused = await browser.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.focus();
    if (typeof element.select === "function") element.select();
    return true;
  })()`);
  if (!focused) throw new Error(`could not focus ${testId}`);
  await browser.send("Input.insertText", { text: value }, browser.sessionId);
  const matches = await browser.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    return Boolean(element && element.value === ${JSON.stringify(value)});
  })()`);
  // Return only a boolean; never expose credential values in diagnostics.
  if (matches !== true) throw new Error(`could not fill ${testId}`);
}

async function markerFrames(browser, marker) {
  const raw = await browser.evaluate(`JSON.stringify(
    Array.from(document.querySelectorAll('iframe'))
      .filter((frame) => ((frame.getAttribute('srcdoc') || '').includes(${JSON.stringify(marker)})))
      .map((frame) => ({
        sandbox: frame.getAttribute('sandbox'),
        allow: frame.getAttribute('allow'),
        height: frame.style.height || frame.getAttribute('height') || '',
        hasCsp: (frame.getAttribute('srcdoc') || '').includes('Content-Security-Policy'),
        hasMarker: true
      }))
  )`);
  return JSON.parse(raw);
}

async function waitForCard(browser, marker, timeoutMs, label) {
  await browser.waitFor(
    `Array.from(document.querySelectorAll('iframe')).some((frame) => ((frame.getAttribute('srcdoc') || '').includes(${JSON.stringify(marker)})))`,
    timeoutMs,
    label,
  );
}

async function setCollapseTurns(browser, baseUrl) {
  await browser.send("Page.navigate", { url: `${baseUrl.replace(/\/$/, "")}/settings/chat` }, browser.sessionId);
  const trigger = `document.querySelector('[role="button"][aria-label^="Chat display:"]')`;
  await browser.waitFor(`Boolean(${trigger})`, 30_000, "Chat display setting");
  if (await browser.evaluate(`(${trigger}).getAttribute('aria-label') === 'Chat display: Collapse turns'`)) return;
  const point = await findClickableRect(browser, trigger);
  if (!point) throw new Error("Chat display control is not clickable");
  await clickPoint(browser, point);
  const option = `Array.from(document.querySelectorAll('[role="menuitem"], [role="option"]')).find(node => node.textContent.trim() === 'Collapse turns')`;
  await browser.waitFor(`Boolean(${option})`, 10_000, "Collapse turns option");
  const optionPoint = await findClickableRect(browser, option);
  if (!optionPoint) throw new Error("Collapse turns option is not clickable");
  await clickPoint(browser, optionPoint);
  await browser.waitFor(`Boolean(${trigger}) && (${trigger}).getAttribute('aria-label') === 'Chat display: Collapse turns'`,
    10_000, "Collapse turns saved through Settings UI");
}

async function assertCollapsedResponse(browser, marker) {
  const expression = `(() => {
    const summaries = Array.from(document.querySelectorAll('[data-testid="turn-summary"]'));
    const toggle = summaries[0]?.querySelector('[aria-expanded]');
    const frame = Array.from(document.querySelectorAll('iframe')).find(node =>
      (node.getAttribute('srcdoc') || '').includes(${JSON.stringify(marker)}));
    // Stock 0.14 does not expose aria-expanded here. Check the actual folding
    // effect instead: native tool rows unmount when work is collapsed.
    const workRowCount = document.querySelectorAll('[data-history-row-id^="agent_tool_"]').length;
    return { summaryCount: summaries.length,
      collapsed: workRowCount === 0,
      workRowCount,
      cardAfterSummary: Boolean(frame && summaries[0] &&
        frame.getBoundingClientRect().top >= summaries[0].getBoundingClientRect().bottom - 1),
      summaryTop: summaries[0]?.getBoundingClientRect().top ?? null,
      cardTop: frame?.getBoundingClientRect().top ?? null,
      expandedValue: toggle?.getAttribute('aria-expanded') ?? null };
  })()`;
  try {
    await browser.waitFor(`(() => { const state = ${expression}; return state.summaryCount === 1 && state.collapsed && state.cardAfterSummary; })()`,
      30_000, "HTML answer outside collapsed turn work");
  } catch (error) {
    throw new Error(`${error.message}; state=${JSON.stringify(await browser.evaluate(expression))}`);
  }
  return browser.evaluate(expression);
}

async function waitForAnyTestId(browser, testIds, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    for (const testId of testIds) {
      const present = await browser.evaluate(`Boolean(document.querySelector('[data-testid=${JSON.stringify(testId)}]'))`).catch(() => false);
      if (present) return testId;
    }
    await sleep(250);
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf("--config");
  const configPath = at === -1 ? "" : args[at + 1];
  if (!configPath) throw new Error("e2e-client: --config <path> is required");
  const config = await readConfig(resolve(configPath));
  const offer = (await fs.readFile(config.offerFile, "utf8")).trim();
  const password = process.env.PASEO_E2E_PASSWORD ?? "";
  if (!offer.includes("#offer=")) throw new Error("e2e-client: pairing offer file is invalid");
  if (password.length < 24) throw new Error("e2e-client: PASEO_E2E_PASSWORD is missing or too short");
  const wrongPassword = `${password}x`;
  const secrets = [offer, password, wrongPassword];
  let links = { missing: offer, wrong: offer, correct: offer };
  if (typeof config.linksFile === "string" && config.linksFile.length > 0) {
    try {
      links = JSON.parse(await fs.readFile(config.linksFile, "utf8"));
    } catch {
      throw new Error("auth links file is invalid");
    }
    for (const key of ["missing", "wrong", "correct"]) {
      if (typeof links[key] !== "string" || links[key].length === 0) {
        throw new Error(`auth links file is missing ${key}`);
      }
      secrets.push(links[key]);
    }
  }
  const result = {
    status: "fail",
    stage: "start",
    startedAt: new Date().toISOString(),
    serverId: config.serverId,
    agentId: config.agentId,
    title: config.title,
    marker: config.marker,
    artifactId: config.artifactId,
    auth: {},
    isolation: { hook: "@paseo:e2e", hostsBefore: null, hostsAfter: null, localNetworkGranted: false, loopbackBlocked: false },
    timeline: {},
    filePreview: {},
    refresh: {},
    cleanup: { browserStopped: false, profileRemoved: false },
    errors: [],
  };
  const sanitize = (text) => redactSensitive(text, secrets);
  let browser = null;
  try {
    try {
      const response = await fetch(config.baseUrl, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      if (response.status >= 500) throw new UnavailableError("hosted_app", `hosted app responded ${response.status}`);
    } catch (error) {
      if (error instanceof UnavailableError) throw error;
      throw new UnavailableError("hosted_app", `hosted app unreachable: ${error instanceof Error ? error.message : String(error)}`);
    }

    const executable = config.chromium || findChromiumExecutable();
    if (!executable) throw new Error("e2e-client: no Chromium executable found");
  browser = await openBrowser(executable, config.browserProfileRoot, config.browserChildGroupFile);
  const origin = new URL(config.baseUrl).origin;
  await browser.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => { try { if (location.origin === ${JSON.stringify(origin)}) localStorage.setItem("@paseo:e2e", "1"); } catch {} })()`,
  }, browser.sessionId);
  try {
    await browser.send("Network.enable", {}, browser.sessionId);
    await browser.send("Network.setBlockedURLs", {
      urls: [
        "http://localhost:6767/*",
        "http://127.0.0.1:6767/*",
        "ws://localhost:6767/*",
        "ws://127.0.0.1:6767/*",
      ],
    }, browser.sessionId);
    result.isolation.loopbackBlocked = true;
  } catch {
    // The @paseo:e2e hook and the welcome-screen assertion still fail closed.
    result.isolation.loopbackBlocked = false;
  }
  result.isolation.localNetworkGranted = await grantLocalNetwork(browser, config.baseUrl);

  result.stage = "bootstrap_guard";
  await browser.send("Page.navigate", { url: `${config.baseUrl.replace(/\/$/, "")}/welcome` }, browser.sessionId);
  await waitForTestId(browser, "welcome-paste-pairing-link", 60_000, "welcome paste-link control");
  const welcomeText = await bodyText(browser);
  if (!/Connect your computer|Paste pairing link/i.test(welcomeText)) {
    throw new Error("hosted app did not start on the unpaired welcome screen");
  }
  const before = await registryIds(browser);
  if (before.length !== 0) {
    throw new Error(`host registry was not empty before pairing: auto-bootstrap hook not honored (${JSON.stringify(before)})`);
  }
  result.isolation.hostsBefore = 0;

  const submitLink = async (link) => {
    const present = await browser.evaluate(`Boolean(document.querySelector('[data-testid="pair-link-input"]'))`).catch(() => false);
    if (!present) {
      await clickTestId(browser, "welcome-paste-pairing-link", 20_000, "paste pairing link");
      await waitForTestId(browser, "pair-link-input", 20_000, "pairing link input");
    }
    await fillTestId(browser, "pair-link-input", link);
    await clickTestId(browser, "pair-link-submit", 20_000, "pair submit");
  };
  const waitForAuthError = async (label) => {
    await browser.waitFor(
      `/Server disconnected|Unable to pair host|Pairing failed|Incorrect password|Password required|connection failed|disconnected/i.test(document.body ? document.body.innerText : '')`,
      30_000,
      label,
    );
  };
  const assertNoHost = async (label) => {
    const ids = await registryIds(browser);
    if (ids.length !== 0) throw new Error(`${label} created a host: ${JSON.stringify(ids)}`);
    const text = await bodyText(browser);
    if (/New workspace|No projects yet/.test(text)) {
      throw new Error(`${label} left the unpaired welcome screen`);
    }
  };
  const passwordFieldPresent = async (timeoutMs) =>
    (await waitForAnyTestId(browser, ["pair-link-password-input"], timeoutMs)) === "pair-link-password-input";
  const submitAndAwaitFreshRejection = async (action, label) => {
    const armed = await browser.evaluate(`(() => {
      window.__hrAuthTransition?.observer?.disconnect();
      const stale = new RegExp(${JSON.stringify(AUTH_ERROR_SOURCE)}, "i");
      const fresh = new RegExp(${JSON.stringify(AUTH_ERROR_SOURCE)}, "i");
      const text = () => document.body ? document.body.innerText : "";
      if (!stale.test(text())) return false;
      const state = { clear: false, fresh: false };
      const observer = new MutationObserver(() => {
        const current = text();
        if (!stale.test(current)) state.clear = true;
        if (state.clear && fresh.test(current)) state.fresh = true;
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      state.observer = observer;
      window.__hrAuthTransition = state;
      return true;
    })()`);
    if (!armed) throw new Error(`previous rejection was not visible before ${label}`);
    await action();
    await browser.waitFor(
      "window.__hrAuthTransition && window.__hrAuthTransition.fresh === true",
      30_000,
      `fresh ${label}`,
    );
    const state = await browser.evaluate(`(() => {
      const current = window.__hrAuthTransition;
      if (current?.observer) current.observer.disconnect();
      return JSON.stringify({ clear: current?.clear === true, fresh: current?.fresh === true });
    })()`).then((raw) => JSON.parse(raw));
    if (!state.clear) throw new Error(`${label} did not clear the previous rejection before the new one`);
  };

  result.stage = "paste_link";
  await clickTestId(browser, "welcome-paste-pairing-link", 20_000, "paste pairing link");
  await waitForTestId(browser, "pair-link-input", 20_000, "pairing link input");
  await submitLink(links.missing);
  let next = await waitForAnyTestId(browser, ["host-confirmation", "pair-link-password-input"], 30_000);
  if (next === "host-confirmation") {
    await clickTestId(browser, "host-confirmation-connect", 20_000, "host confirmation connect");
    next = await waitForAnyTestId(browser, ["pair-link-password-input"], 20_000);
  }

  if (next === "pair-link-password-input") {
    // The host exposes the real password prompt.
    result.auth.mode = "password_prompt";
    const missingText = await bodyText(browser);
    if (!missingText.includes("Password required")) {
      throw new Error("missing-password state did not report Password required");
    }
    await assertNoHost("missing password");
    result.auth.missing = "password_required";
    result.auth.missingHosts = [];

    result.stage = "wrong_auth";
    await submitAndAwaitFreshRejection(async () => {
      await fillTestId(browser, "pair-link-password-input", wrongPassword);
      await clickTestId(browser, "pair-link-submit", 20_000, "wrong password submit");
    }, "wrong password rejection");
    await waitForTestId(browser, "pair-link-password-input", 10_000, "password field after wrong password");
    await assertNoHost("wrong password");
    result.auth.wrong = (await bodyText(browser)).includes("Incorrect password") ? "incorrect_password" : "rejected_no_host";
    result.auth.wrongHosts = [];

    result.stage = "positive_auth";
    await fillTestId(browser, "pair-link-password-input", password);
    await clickTestId(browser, "pair-link-submit", 20_000, "correct password submit");
  } else {
    // The hosted build may report a rejected connection instead of a password
    // prompt for relay auth. Prove rejection through the same paste-link flow,
    // then use the host's password-bearing connection URI.
    await waitForAuthError("missing credential rejection");
    await assertNoHost("missing credential");
    result.auth.mode = "link_credentials";
    result.auth.missing = "rejected_no_host";
    result.auth.missingHosts = [];

    result.stage = "wrong_auth";
    await submitAndAwaitFreshRejection(async () => {
      await submitLink(links.wrong);
      const wrongNext = await waitForAnyTestId(browser, ["host-confirmation", "pair-link-password-input"], 10_000);
      if (wrongNext === "host-confirmation") {
        await clickTestId(browser, "host-confirmation-connect", 20_000, "host confirmation connect");
      } else if (wrongNext === "pair-link-password-input" || await passwordFieldPresent(3_000)) {
        await fillTestId(browser, "pair-link-password-input", wrongPassword);
        await clickTestId(browser, "pair-link-submit", 20_000, "wrong password submit");
      }
    }, "wrong credential rejection");
    result.auth.wrong = (await bodyText(browser)).includes("Incorrect password") ? "incorrect_password" : "rejected_no_host";
    await assertNoHost("wrong credential");
    result.auth.wrongHosts = [];

    result.stage = "positive_auth";
    // A link rejection can expose the password prompt. A same-host URL change
    // preserves that password override, so do not submit a new link while the
    // old wrong override is still present, then race the in-flight request.
    if (await passwordFieldPresent(250)) {
      result.auth.positiveMethod = "password_prompt_after_link";
      await fillTestId(browser, "pair-link-password-input", password);
      await clickTestId(browser, "pair-link-submit", 20_000, "correct password submit");
    } else {
      result.auth.positiveMethod = "credential_link";
      await submitLink(links.correct);
      const positiveNext = await waitForAnyTestId(browser, ["host-confirmation", "pair-link-password-input"], 10_000);
      if (positiveNext === "host-confirmation") {
        await clickTestId(browser, "host-confirmation-connect", 20_000, "host confirmation connect");
      }
      if (positiveNext === "pair-link-password-input" || await passwordFieldPresent(3_000)) {
        result.auth.positiveMethod = "password_prompt_after_link";
        await fillTestId(browser, "pair-link-password-input", password);
        await clickTestId(browser, "pair-link-submit", 20_000, "correct password submit");
      }
    }
  }

  result.stage = "positive_auth";
  await browser.waitFor(
    `!document.querySelector('[data-testid="pair-link-password-input"]')`,
    60_000,
    "password modal to close",
  );
  result.isolation.hostsAfter = await waitForRegistry(
    browser,
    [config.serverId],
    60_000,
    "exactly the fixture host after admission",
  );

  result.stage = "chat_display";
  await setCollapseTurns(browser, config.baseUrl);
  result.isolation.chatDisplaySetByUi = "collapseTurns";

  result.stage = "timeline";
  await browser.send("Page.navigate", {
    url: `${config.baseUrl.replace(/\/$/, "")}/h/${config.serverId}/agent/${config.agentId}`,
  }, browser.sessionId);
  await sleep(5_000);
  try {
    await waitForCard(browser, config.marker, 120_000, "fixture card");
  } catch (error) {
    const clicked = await browser.evaluate(`(() => {
      const nodes = Array.from(document.querySelectorAll('[role=tab],button,a'));
      const tab = nodes.find((node) => (node.textContent || '').trim() === ${JSON.stringify(config.title)});
      if (!tab) return false;
      tab.click();
      return true;
    })()`).catch(() => false);
    if (!clicked) throw error;
    await sleep(3_000);
    await waitForCard(browser, config.marker, 90_000, "fixture card after tab selection");
  }

  result.stage = "card_assertions";
  const frames = await markerFrames(browser, config.marker);
  if (frames.length !== 1) throw new Error(`expected exactly one marker card, saw ${frames.length}`);
  const card = frames[0];
  if (card.sandbox !== "allow-scripts") throw new Error("fixture card did not use the allow-scripts sandbox");
  if (card.allow !== "fullscreen 'none'") throw new Error("fixture card allow attribute changed");
  if (!card.hasCsp) throw new Error("fixture card document carried no CSP");
  if (!(Number.parseFloat(card.height) > 0)) throw new Error("fixture card had no measured height");
  result.timeline = {
    path: `${origin}/h/${config.serverId}/agent/${config.agentId}`,
    cardCount: frames.length,
    card,
    folding: await assertCollapsedResponse(browser, config.marker),
  };
  result.auth.positive = "connected";
  result.isolation.hostsAfter = await waitForRegistry(
    browser,
    [config.serverId],
    30_000,
    "exactly the fixture host after the card",
  );
  await browser.screenshot(join(config.outDir, "g6-timeline.png"));

  result.stage = "expand_turn";
  await clickTestId(browser, "turn-summary", 10_000, "expand turn work");
  await browser.waitFor(`document.querySelectorAll('[data-history-row-id^="agent_tool_"]').length > 0`,
    10_000, "expanded turn mounts the original tool rows");
  const expandedFrames = await markerFrames(browser, config.marker);
  if (expandedFrames.length !== 1) throw new Error(`expanded work duplicated the answer card (${expandedFrames.length})`);
  result.timeline.folding.expandedCardCount = expandedFrames.length;
  await browser.screenshot(join(config.outDir, "g6-expanded.png"));
  await clickTestId(browser, "turn-summary", 10_000, "collapse turn work");
  result.timeline.folding.recollapsed = (await assertCollapsedResponse(browser, config.marker)).collapsed;

  result.stage = "refresh";
  // Return to the timeline before reloading; a compact host may have replaced
  // the timeline with the file panel route.
  await browser.send("Page.navigate", {
    url: `${config.baseUrl.replace(/\/$/, "")}/h/${config.serverId}/agent/${config.agentId}`,
  }, browser.sessionId);
  await waitForCard(browser, config.marker, 120_000, "fixture card before refresh");
  await browser.send("Page.reload", {}, browser.sessionId);
  await waitForCard(browser, config.marker, 120_000, "fixture card after refresh");
  const refreshed = await markerFrames(browser, config.marker);
  if (refreshed.length !== 1) throw new Error(`expected one card after refresh, saw ${refreshed.length}`);
  const refreshedHosts = await waitForRegistry(
    browser,
    [config.serverId],
    30_000,
    "exactly the fixture host after refresh",
  );
  result.refresh = { cardCount: refreshed.length, hosts: refreshedHosts,
    folding: await assertCollapsedResponse(browser, config.marker) };
  await browser.screenshot(join(config.outDir, "g6-refresh.png"));

  result.stage = "file_link";
  const linkExpression = `Array.from(document.querySelectorAll('a,button,[role="button"],[role="link"]')).find((node) => {
    const label = (node.textContent || '').trim();
    const href = node.getAttribute('href') || '';
    return label === 'Open interactive report'
      || /interactive\\.html$/i.test(label)
      || href.includes(${JSON.stringify(config.interactivePath)})
      || href.includes(${JSON.stringify(basename(config.interactivePath))});
  })`;
  await browser.waitFor(`Boolean(${linkExpression})`, 60_000, "interactive report link");
  const linkPoint = await findClickableRect(browser, linkExpression);
  if (!linkPoint) throw new Error("interactive report link had no clickable area");
  await clickPoint(browser, linkPoint);

  result.stage = "file_preview";
  await browser.waitFor(
    `Boolean(document.querySelector('[data-testid="file-html-preview"]'))`,
    60_000,
    "host HTML file preview",
  );
  const preview = await browser.evaluate(`(() => {
    const frame = document.querySelector('[data-testid="file-html-preview"]');
    if (!frame) return null;
    const srcdoc = frame.getAttribute('srcdoc') || '';
    return JSON.stringify({
      sandbox: frame.getAttribute('sandbox'),
      referrerPolicy: frame.getAttribute('referrerpolicy'),
      hasCsp: srcdoc.includes('Content-Security-Policy'),
      hasMarker: srcdoc.includes(${JSON.stringify(config.marker)})
    });
  })()`).then((raw) => raw ? JSON.parse(raw) : null);
  if (!preview) throw new Error("host HTML file preview disappeared");
  if (preview.sandbox !== "allow-scripts") throw new Error("file preview sandbox changed");
  if (!preview.hasCsp) throw new Error("file preview carried no CSP");
  if (!preview.hasMarker) throw new Error("file preview did not contain the fixture marker");
  result.filePreview = { testId: "file-html-preview", ...preview };
  await browser.screenshot(join(config.outDir, "g6-file-preview.png"));

  result.status = "pass";
  result.stage = "complete";
} catch (error) {
  result.status = error instanceof UnavailableError ? "unavailable" : "fail";
  if (error instanceof UnavailableError) result.stage = error.stage;
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  result.failure = sanitize(message.split("\n")[0]);
  result.errors.push(sanitize(message));
  if (browser) {
    const text = await bodyText(browser);
    if (text) result.failureText = sanitize(text.slice(-1600));
    if (["card_assertions", "expand_turn", "refresh"].includes(result.stage)) {
      await browser.screenshot(join(config.outDir, "g6-failure.png")).catch(() => {});
    }
  }
} finally {
  if (browser) {
    const cleanup = await browser.close().catch(() => ({ browserStopped: false, profileRemoved: false }));
    result.cleanup = {
      browserStopped: cleanup.browserStopped === true,
      profileRemoved: cleanup.profileRemoved === true,
    };
    if (result.status === "pass" && (!result.cleanup.browserStopped || !result.cleanup.profileRemoved)) {
      result.status = "fail";
      result.stage = "cleanup";
      result.failure = "browser process or owned profile cleanup failed";
      result.errors.push(result.failure);
    }
  }
  result.finishedAt = new Date().toISOString();
  await fs.mkdir(config.outDir, { recursive: true, mode: 0o700 }).catch(() => {});
  await fs.writeFile(join(config.outDir, "g6-client.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 }).catch(() => {});
}
console.log(JSON.stringify({
  status: result.status,
  stage: result.stage,
  auth: result.auth,
  hosts: result.isolation.hostsAfter,
  cardCount: result.timeline.cardCount,
  filePreview: result.filePreview.testId ?? null,
  refreshCardCount: result.refresh.cardCount,
  cleanup: result.cleanup,
}));
if (result.status === "unavailable") process.exitCode = 2;
else if (result.status !== "pass") process.exitCode = 1;
}

export { registryIds, waitForRegistry };

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  main().catch((error) => {
    console.error(`e2e-client: ${redactSensitive(error instanceof Error ? error.message : String(error))}`);
    process.exitCode = 1;
  });
}
