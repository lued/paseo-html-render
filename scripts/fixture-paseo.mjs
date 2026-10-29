#!/usr/bin/env node
/**
 * Disposable, password-protected Paseo fixture for the hosted-client G6 lane.
 *
 * Test-only. This file is not packaged. It creates a private Paseo home,
 * installs the current source tree, runs a real model agent, verifies the
 * persisted artifact through the plugin RPC, and then drives the real hosted
 * app through the fixture's relay offer and generated test-only password.
 *
 * It never reads or copies user Paseo config, credentials or auth stores, and
 * it never changes the user's daemon or relay settings. Provider authentication
 * is used through Paseo's normal provider runtime; the fixture only isolates
 * PASEO_HOME and plugin/artifact state.
 *
 * Parent commands:
 *   node scripts/fixture-paseo.mjs --prepare-only --out <private dir>
 *   node scripts/fixture-paseo.mjs --out <private dir>
 *
 * The second command creates a real acceptance agent. Do not run it in a
 * read-only review step.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, promises as fs, realpathSync, writeFileSync } from "node:fs";
import net from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve, win32 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildAdapterSource } from "../server/adapter-source.ts";
import { findChromiumExecutable } from "../server/renderer.ts";
import {
  decodeReportReference,
  isHtmlRenderToolName,
  isRenderToolRow,
} from "../shared/recognize.ts";
import { BRIDGE_TOKEN_FILE } from "../shared/identity.ts";
import { SELECTED_IDENTITY } from "../shared/selected-identity.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const E2E_CLIENT = join(ROOT, "scripts", "e2e-client.mjs");
const APP_BASE_URL = "https://app.paseo.sh";
const DEFAULT_PROVIDER = "pi";
const DEFAULT_MODEL = "ocx/opencode-go/deepseek-v4.1-flash";
const DEFAULT_THINKING = "max";
const ARTIFACT_ID = /^[0-9a-f]{32}$/;
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const BEARER_SAFE_PASSWORD = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
/** Conservative byte budget for the actual Unix-domain socket path. */
export const UNIX_SOCKET_PATH_MAX_BYTES = 100;

export class FixtureUnavailableError extends Error {
  constructor(stage, message) {
    super(message);
    this.name = "FixtureUnavailableError";
    this.stage = stage;
  }
}

/**
 * Remove every inherited PASEO_* routing/auth override. The fixture sets only
 * its own PASEO_HOME/PASEO_HTML_RENDER_CHROMIUM keys after this.
 *
 * PI_CODING_AGENT_DIR/PI_PACKAGE_DIR stay intact so the normal provider runtime
 * can authenticate; current-agent session selectors are removed so the fixture
 * agent cannot resume this reviewer's session.
 */
export function cleanFixtureEnv(base = process.env) {
  const env = { ...base };
  for (const key of Object.keys(env)) {
    if (key.startsWith("PASEO_")) delete env[key];
  }
  for (const key of [
    "PI_SESSION_FILE",
    "PI_SESSION_ID",
    "PI_CODING_AGENT_SESSION_DIR",
    "PI_AGENT_ID",
    "PI_MODEL",
    "PI_PROVIDER",
    "PI_REASONING_LEVEL",
  ]) {
    delete env[key];
  }
  return env;
}

/** Only the fixture-specific daemon keys are reintroduced. */
export function fixtureDaemonEnv(base, home, chromium) {
  return {
    ...cleanFixtureEnv(base),
    PASEO_HOME: home,
    PASEO_HTML_RENDER_CHROMIUM: chromium,
  };
}

/** Browser child gets no PASEO_* state except the generated test password. */
export function fixtureBrowserEnv(base, secret) {
  return {
    ...cleanFixtureEnv(base),
    PASEO_E2E_PASSWORD: secret,
  };
}

export function assertE2EOnlyPassword(secret) {
  if (typeof secret !== "string" || secret.length < 24) {
    throw new Error("generated password is too short");
  }
  if (BEARER_SAFE_PASSWORD.test(secret)) {
    throw new Error("generated password would use the bearer subprotocol instead of the hello password path");
  }
}

/** Private fixture config. Relay is enabled only for this fixture. */
export function fixtureConfig({ port, passwordHash, appBaseUrl = APP_BASE_URL }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("invalid fixture port");
  if (!BCRYPT_HASH.test(passwordHash)) throw new Error("fixture password is not a bcrypt hash");
  const origin = new URL(appBaseUrl).origin;
  return {
    version: 1,
    daemon: {
      listen: `127.0.0.1:${port}`,
      cors: { allowedOrigins: [origin] },
      relay: { enabled: true, requireProtectedSecurity: true },
      auth: { password: passwordHash },
    },
    app: { baseUrl: origin },
    pluginsEnabled: true,
  };
}

/** Redact secrets and all supported pairing/auth fragments from diagnostics. */
export function redactSensitive(text, secrets = []) {
  let value = String(text ?? "");
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length > 0) value = value.split(secret).join("[redacted]");
  }
  return value
    .replace(/relay:\/\/[^\s"'<>]+/gi, "relay://[redacted]")
    .replace(/relay%3A%2F%2F[^\s"'<>]+/gi, "relay%3A%2F%2F[redacted]")
    .replace(/#offer=[^\s"'<>]+/gi, "#offer=[redacted]")
    .replace(/#connect=[^\s"'<>]+/gi, "#connect=[redacted]")
    .replace(/\boffer=[^\s"'<>]+/gi, "offer=[redacted]")
    .replace(/\b(password|key)=[^&\s"'<>]+/gi, "$1=[redacted]")
    .replace(/\b(password|key)%3D[^&\s"'<>]+/gi, "$1%3D[redacted]")
    .replace(/paseo\.bearer\.[^\s"',;]+/gi, "paseo.bearer.[redacted]")
    .replace(/\bAuthorization\s*:\s*Bearer\s+[^\s,;"']+/gi, "Authorization: Bearer [redacted]")
    .replace(/"password"\s*:\s*"[^"]*"/g, '"password":"[redacted]"')
    .replace(/"daemonPublicKeyB64"\s*:\s*"[^"]*"/g, '"daemonPublicKeyB64":"[redacted]"');
}
/**
 * Parse the browser-produced host-id list. The browser maps its host store to
 * server-id strings before returning anything to Node, so this boundary only
 * accepts a JSON array of non-empty strings. Passwords and store objects never
 * cross it.
 */
export function hostRegistryServerIds(raw) {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("host registry snapshot is missing");
  }
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    throw new Error("host registry is not valid JSON");
  }
  if (!Array.isArray(parsed)) throw new Error("host registry is not an array");
  const ids = [];
  for (const entry of parsed) {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error("host registry entry is not a server id");
    }
    ids.push(entry);
  }
  return [...new Set(ids)];
}

/** Byte budget for an owned Unix-domain socket path. */
export function unixSocketPathBudget(socketPath, maxBytes = UNIX_SOCKET_PATH_MAX_BYTES) {
  const bytes = Buffer.byteLength(String(socketPath), "utf8");
  return {
    bytes,
    maxBytes,
    ok: bytes <= maxBytes,
    detail: `fixture bridge socket path is ${bytes} bytes; limit ${maxBytes}`,
  };
}

/** Deterministic Paseo agent-record directory, matching agent-storage.ts. */
export function projectDirNameFromCwd(cwd) {
  const { root } = win32.parse(cwd);
  const withoutRoot = cwd.slice(root.length).replace(/[\\/]+$/, "");
  const sanitizedRoot = root.replace(/[:\\/]+/g, "-").replace(/^-+|-+$/g, "");
  const prefix = sanitizedRoot ? `${sanitizedRoot}-` : "";
  if (!withoutRoot) return sanitizedRoot || "root";
  return prefix + withoutRoot.replace(/[\\/]+/g, "-");
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Only safe key names/booleans from the owned agent record.
 *
 * 3.0 contributes the MCP server at `agent.session_open`, which is launch-only.
 * The saved record must never contain the new key; a leftover 2.x `html-render`
 * entry is reported, but it is historical state, not injection evidence.
 */
export function recordFacts(record, workspaceId, workspace, readError = null) {
  const config = isObject(record?.config) ? record.config : null;
  const mcp = isObject(config?.mcpServers) ? config.mcpServers : null;
  const names = mcp ? Object.keys(mcp).sort() : [];
  const entry = mcp?.[SELECTED_IDENTITY.mcpServerName];
  const legacy = mcp?.["html-render"];
  return {
    found: Boolean(record),
    readError,
    workspaceIdMatches: record ? record.workspaceId === workspaceId : null,
    cwdMatches: record ? record.cwd === workspace : null,
    configKeys: record && config ? Object.keys(config).sort() : [],
    mcpServersKey: record ? Boolean(mcp) : null,
    mcpServerNames: names,
    /** The launch-only 3.0 key: must stay false. */
    htmlRenderEntryObserved: record ? Boolean(entry) : null,
    newKeyPersisted: record ? Boolean(entry) : null,
    htmlRenderType: typeof entry?.type === "string" ? entry.type : null,
    alwaysLoadObserved: entry ? entry.alwaysLoad === true : null,
    legacyKeyObserved: record ? Boolean(legacy) : null,
    legacyKeyType: typeof legacy?.type === "string" ? legacy.type : null,
    injectionEvidence: entry ? "persisted-config" : "not-persisted",
  };
}

/**
 * Parses the sanitized `session-open` log lines that are the only 3.0 injection
 * evidence. Saved configuration cannot show a launch-only server, so this line
 * is the proof; it must never contain the bridge token or a workspace path.
 */
const SESSION_OPEN_LINE =
  /session-open result=(\S+) server=(\S+) transport=(\S+) alwaysLoad=(\S+) agent=(\S+) provider=(\S+) reason=(\S+) purpose=(\S+)/;

export function sessionOpenFacts(entries, agentId, { token = "", workspace = "" } = {}) {
  const lines = [];
  let raw = "";
  for (const entry of Array.isArray(entries) ? entries : []) {
    const message = String(entry?.message ?? entry?.text ?? "");
    const match = SESSION_OPEN_LINE.exec(message);
    if (!match) continue;
    raw += message + "\n";
    lines.push({
      result: match[1],
      server: match[2],
      transport: match[3],
      alwaysLoad: match[4] === "true",
      agent: match[5],
      provider: match[6],
      reason: match[7],
      purpose: match[8],
    });
  }
  const injected = lines.find((line) => line.result === "injected" && line.agent === agentId);
  return {
    observed: Boolean(injected),
    lineCount: lines.length,
    server: injected?.server ?? null,
    transport: injected?.transport ?? null,
    alwaysLoad: injected?.alwaysLoad === true,
    agentMatches: Boolean(injected),
    provider: injected?.provider ?? null,
    reason: injected?.reason ?? null,
    purpose: injected?.purpose ?? null,
    // A single sanitized line must not leak the credential, the token variable
    // name, the private token file or the workspace path.
    sanitized: lines.length > 0 &&
      !raw.includes("PASEO_HTML_RENDER_TOKEN") &&
      !raw.includes(BRIDGE_TOKEN_FILE) &&
      !(token && raw.includes(token)) &&
      !(workspace && raw.includes(workspace)),
  };
}

/** Real direct or recognized nested render tool rows only. */
export function renderToolFacts(items, expectedTitle) {
  const rows = [];
  const callIds = new Set();
  let identifiedRows = 0;
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (!isObject(value)) return;
    if (value.type === "tool_call" && typeof value.name === "string" &&
        isRenderToolRow({ name: value.name, detail: value.detail })) {
      const callId = typeof value.callId === "string" && value.callId ? value.callId : null;
      if (callId) { callIds.add(callId); identifiedRows += 1; }
      const reference = decodeReportReference(JSON.stringify(value.detail) ?? "");
      rows.push({
        artifactId: reference?.artifactId ?? null,
        titleMatches: reference && typeof expectedTitle === "string" ? reference.title === expectedTitle : null,
        name: value.name.slice(0, 120),
        status: typeof value.status === "string" ? value.status : "unknown",
        direct: isHtmlRenderToolName(value.name),
        codemode: value.name.trim().toLowerCase() === "codemode",
      });
    }
  };
  visit(items);
  const direct = rows.some((row) => row.direct);
  const completedArtifactIds = [...new Set(rows
    .filter((row) => row.status === "completed" && row.titleMatches && row.artifactId)
    .map((row) => row.artifactId))];
  return {
    rows,
    count: rows.length,
    names: [...new Set(rows.map((row) => row.name))],
    statuses: rows.map((row) => row.status),
    completedCount: rows.filter((row) => row.status === "completed").length,
    failedCount: rows.filter((row) => row.status === "failed").length,
    directObserved: direct,
    codemodeObserved: rows.some((row) => row.codemode),
    rowCallIdCount: callIds.size,
    actualInvocationCount: null, // Outer/direct projection rows cannot establish this count.
    repeatedRowCallIds: identifiedRows > callIds.size,
    completedArtifactIds,
    completedArtifactCount: completedArtifactIds.length,
    invocationShape: direct ? "direct-row-observed" : rows.length ? "nested-row-observed" : "not-observed",
    alwaysLoadRuntime: "not-observed",
  };
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function run(command, commandArgs, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const processGroup = options.processGroup === true;
    const child = spawn(command, commandArgs, {
      cwd: options.cwd ?? ROOT,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: processGroup,
    });
    options.onSpawn?.(child);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      if (processGroup && child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { /* group already gone */ }
      } else {
        child.kill("SIGKILL");
      }
      reject(new Error(`${command} ${commandArgs.join(" ")} timed out`));
    }, options.timeoutMs ?? 180_000);
    timer.unref?.();
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? -1, stdout, stderr, pid: child.pid ?? null });
    });
  });
}

function resolvePaseoCommand(input) {
  const value = (input ?? "").trim();
  if (!value) throw new Error("Paseo command is empty; pass --paseo <path-or-command> or set PASEO_BIN");
  const explicitPath = isAbsolute(value) || value.includes("/") || value.includes("\\");
  const candidates = explicitPath
    ? [value]
    : (process.env.PATH ?? "").split(delimiter).filter(Boolean).map((directory) => join(directory, value));
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch {
      /* keep searching */
    }
  }
  throw new Error(`Paseo command not found or not executable: ${value}`);
}

async function paseo(paseoBin, home, commandArgs, env, timeoutMs = 180_000) {
  return run(process.execPath, [paseoBin, ...commandArgs], {
    env: { ...env, PASEO_HOME: home },
    timeoutMs,
  });
}

async function freePort() {
  return new Promise((resolvePromise, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => port ? resolvePromise(port) : reject(new Error("could not reserve a fixture port")));
    });
  });
}

async function writePrivateJson(path, value) {
  await fs.writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(path, 0o600);
}

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, "utf8"));
}

function parseCliJson(stdout) {
  const at = stdout.indexOf("{");
  if (at === -1) throw new Error("Paseo command printed no JSON object");
  return JSON.parse(stdout.slice(at));
}

async function loadInstalledModules(paseoBin) {
  const real = realpathSync(paseoBin);
  const packageRoot = dirname(dirname(real));
  const req = createRequire(join(packageRoot, "package.json"));
  const clientNode = await import(pathToFileURL(req.resolve("@getpaseo/client/node")).href);
  const authModule = await import(pathToFileURL(req.resolve("@getpaseo/server/auth")).href);
  const clientModule = await import(pathToFileURL(join(packageRoot, "dist", "utils", "client.js")).href);
  const logsModule = await import(pathToFileURL(join(packageRoot, "dist", "commands", "agent", "logs.js")).href);
  if (typeof clientNode.createHostClient !== "function") throw new Error("installed Paseo client has no createHostClient");
  if (typeof authModule.hashDaemonPassword !== "function") throw new Error("installed Paseo server auth has no hashDaemonPassword");
  if (typeof clientModule.connectToDaemon !== "function") throw new Error("installed Paseo CLI has no connectToDaemon");
  if (typeof logsModule.fetchAgentTimelineItems !== "function") throw new Error("installed Paseo CLI has no timeline reader");
  const cliPackage = await readJson(join(packageRoot, "package.json"));
  return {
    createHostClient: clientNode.createHostClient,
    hashDaemonPassword: authModule.hashDaemonPassword,
    connectToDaemon: clientModule.connectToDaemon,
    fetchAgentTimelineItems: logsModule.fetchAgentTimelineItems,
    cliVersion: cliPackage.version,
    packageRoot,
  };
}

/** Independent daemon password probe; no local credential is supplied. */
async function probePassword(mods, listen, password) {
  const client = mods.createHostClient(`tcp://${listen}`, {
    clientId: randomUUID(),
    clientType: "cli",
    appVersion: "html-render-e2e-fixture",
    reconnect: { enabled: false },
    connectTimeoutMs: 15_000,
    ...(password ? { password } : {}),
  });
  try {
    await client.connect();
    await client.close().catch(() => {});
    return "connected";
  } catch (error) {
    const reason = typeof error === "object" && error && "reason" in error ? String(error.reason) : "";
    const message = error instanceof Error ? error.message : String(error);
    if (reason === "password_required" || message === "Password required") return "password_required";
    if (reason === "incorrect_password" || message === "Incorrect password") return "incorrect_password";
    return "transport_error";
  } finally {
    await client.close().catch(() => {});
  }
}

async function startDaemon(paseoBin, home, env) {
  const started = await paseo(paseoBin, home, ["daemon", "start", "--home", home, "--timeout", "120", "--json"], env, 180_000);
  if (started.code !== 0) throw new Error(`fixture daemon failed to start: ${redactSensitive(started.stderr).slice(-1200)}`);
  const parsed = parseCliJson(started.stdout);
  const status = await paseo(paseoBin, home, ["daemon", "status", "--home", home, "--json"], env, 30_000);
  if (status.code !== 0) throw new Error("fixture daemon did not answer status");
  const info = parseCliJson(status.stdout);
  return { ...parsed, ...info };
}

async function stopDaemon(paseoBin, home, env) {
  let stopAction = null;
  try {
    const stopped = await paseo(paseoBin, home, ["daemon", "stop", "--home", home, "--json"], env, 30_000);
    if (stopped.code === 0) {
      const parsed = parseCliJson(stopped.stdout);
      stopAction = typeof parsed?.action === "string" ? parsed.action : null;
    }
  } catch {
    /* status below must prove stopped; a failed stop command alone is not proof */
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const status = await paseo(paseoBin, home, ["daemon", "status", "--home", home, "--json"], env, 15_000);
      if (status.code !== 0) break;
      const parsed = parseCliJson(status.stdout);
      if (parsed.localDaemon === "stopped" && parsed.pid === null) {
        return { stopped: true, evidence: "localDaemon:stopped,pid:null", action: stopAction };
      }
    } catch {
      break; // A failed status query is not evidence that the owned daemon stopped.
    }
    await sleep(250);
  }
  return { stopped: false, evidence: "localDaemon/pid did not prove stopped", action: stopAction };
}

async function installAndWait(paseoBin, home, env) {
  const installed = await paseo(paseoBin, home, ["plugin", "--home", home, "install", ROOT, "--json"], env, 180_000);
  if (installed.code !== 0) throw new Error(`fixture plugin install failed: ${redactSensitive(installed.stderr).slice(-1200)}`);
  let last = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const listing = await paseo(paseoBin, home, ["plugin", "--home", home, "ls", "--json"], env, 30_000);
    if (listing.code !== 0) throw new Error("fixture plugin listing failed");
    last = JSON.parse(listing.stdout).find((plugin) => plugin.id === "html-render") ?? null;
    if (last?.status === "failed") {
      const logs = await paseo(paseoBin, home, ["plugin", "--home", home, "logs", "html-render", "--json"], env, 30_000)
        .then((value) => value.stdout).catch(() => "");
      throw new Error(`fixture plugin failed to start: ${redactSensitive(logs).slice(-2000)}`);
    }
    if (last?.status === "running") {
      const logs = await paseo(paseoBin, home, ["plugin", "--home", home, "logs", "html-render", "--json"], env, 30_000);
      if (logs.code === 0) {
        const entries = JSON.parse(logs.stdout);
        if (Array.isArray(entries) && entries.some((entry) => /\[paseo\] Plugin ready/.test(String(entry.message ?? "")))) {
          return { plugin: last, logs: entries };
        }
      }
    }
    await sleep(500);
  }
  throw new Error(`fixture plugin did not reach running/Plugin ready: ${JSON.stringify(last)}`);
}

async function readAgentRecord(home, agentId, workspace) {
  const recordPath = join(
    home,
    "agents",
    projectDirNameFromCwd(workspace),
    `${agentId}.json`,
  );
  try {
    return { path: recordPath, record: await readJson(recordPath), error: null };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    return { path: recordPath, record: null, error: code === "ENOENT" ? "missing" : "unreadable" };
  }
}

function acceptanceHtml(marker) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:18px;background:#101020;color:#f4f4f5;font:20px/1.4 sans-serif"><h1 id="acceptance" style="margin:0 0 8px">${marker}</h1><p style="margin:0">Rendered by the current html-render source tree through a real model call.</p></body></html>`;
}

function acceptancePrompt({ title, html, marker }) {
  return [
    "Call the html_render MCP tool exactly once. Arguments:",
    `title=${JSON.stringify(title)}, height=420, renderMode="auto", html=${JSON.stringify(html)}.`,
    "Do not call any other tool and do not publish a second card.",
    "After the tool result, copy the exact final-reply Markdown link line the tool result requires",
    "(the line that starts [Open interactive report](</...>)) on its own line. Do not invent or shorten the path.",
    `Then include the artifactId. The rendered page must contain the unique marker ${JSON.stringify(marker)}.`,
  ].join(" ");
}

/**
 * Run the protected fixture. With no `prepareOnly`, this creates a real model
 * agent and then invokes scripts/e2e-client.mjs. It returns a sanitized result
 * object; it never includes the offer or password.
 */
export async function runProtectedAcceptance(options = {}) {
  const outDir = resolve(options.outDir ?? await fs.mkdtemp(join(tmpdir(), "html-render-protected-")));
  await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
  await fs.chmod(outDir, 0o700);
  // macOS per-user TMPDIR paths are longer than a Unix socket allows; the
  // fixture home holds bridge-v3.sock, so use the short /tmp root there.
  const workRoot = await fs.mkdtemp(join(process.platform === "darwin" ? "/tmp" : tmpdir(), "hr-pw-"));
  await fs.chmod(workRoot, 0o700);
  const home = join(workRoot, "home");
  const workspace = join(workRoot, "workspace");
  const dataRoot = join(home, "plugin-data", SELECTED_IDENTITY.dataDirName);
  const socketPath = join(dataRoot, SELECTED_IDENTITY.socketFileName);
  const adapterPath = join(dataRoot, SELECTED_IDENTITY.adapterFileName);
  const legacyAdapterPath = join(dataRoot, SELECTED_IDENTITY.legacyAdapterFileName);
  const tokenPath = join(dataRoot, BRIDGE_TOKEN_FILE);
  const socketBudget = unixSocketPathBudget(socketPath);
  const offerPath = join(workRoot, "offer.txt");
  const authLinksPath = join(workRoot, "auth-links.json");
  const browserConfigPath = join(workRoot, "browser-config.json");
  const browserGroupPath = join(outDir, "browser-group.json");
  const browserChildGroupPath = join(outDir, "browser-child-group.json");
  const keep = options.keep === true;
  const prepareOnly = options.prepareOnly === true;
  const appBaseUrl = options.appBaseUrl ?? APP_BASE_URL;
  const provider = options.provider ?? DEFAULT_PROVIDER;
  const model = options.model ?? DEFAULT_MODEL;
  const thinking = options.thinking ?? DEFAULT_THINKING;
  for (const name of ["fixture-result.json", "g6-client.json", "browser-group.json", "browser-child-group.json", "bridge-facts.json", "agent-runtime-facts.json", "agent-tool-facts.json", "artifact-facts.json", "g6-timeline.png", "g6-file-preview.png", "g6-refresh.png"]) {
    await fs.rm(join(outDir, name), { force: true }).catch(() => {});
  }
  const result = {
    status: "fail",
    stage: "start",
    startedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    mode: prepareOnly ? "prepare-only" : "acceptance",
    outDir,
    provider,
    model,
    thinking,
    serverId: null,
    daemonVersion: null,
    cliVersion: null,
    pluginVersion: null,
    workspaceId: null,
    agentId: null,
    title: null,
    marker: null,
    artifactId: null,
    interactivePath: null,
    authPreflight: {},
    paths: {
      fixtureRoot: workRoot,
      home,
      workspace,
      port: null,
      socketPathBytes: socketBudget.bytes,
      socketPathLimit: socketBudget.maxBytes,
    },
    bridge: {},
    sessionOpen: {},
    agentRuntime: {},
    toolCall: {},
    artifact: {},
    browser: {},
    cleanup: {},
    errors: [],
  };
  let paseoBin = null;
  let mods = null;
  let env = null;
  let daemonStarted = false;
  let daemonAttempted = false;
  let secret = "";
  let client = null;
  let agentId = null;
  let daemonStopped = false;
  let browserCleanup = null;
  let browserPid = null;
  let browserChildPid = null;
  let browserLaunched = false;
  let daemonStopEvidence = "not_started";

  // A direct fixture CLI/SDK connection must never pick up an ambient password.
  // This helper process is short-lived; do not restore it.
  delete process.env.PASEO_PASSWORD;

  try {
    paseoBin = resolvePaseoCommand(options.paseoBin ?? process.env.PASEO_BIN ?? "paseo");
    mods = await loadInstalledModules(paseoBin);
    result.cliVersion = mods.cliVersion;

    const chromiumCandidate =
      options.chromium ??
      process.env.PASEO_HTML_RENDER_CHROMIUM ??
      findChromiumExecutable();
    if (!chromiumCandidate) throw new Error("no Chromium executable found for the fixture");
    const chromium = resolve(chromiumCandidate);
    if (!existsSync(chromium)) throw new Error("the configured Chromium executable does not exist");

    await fs.mkdir(home, { recursive: true, mode: 0o700 });
    await fs.mkdir(workspace, { recursive: true, mode: 0o700 });
    await fs.chmod(home, 0o700);
    await fs.chmod(workspace, 0o700);

    secret = randomBytes(47).toString("base64"); // always contains '='; never bearer-compatible
    assertE2EOnlyPassword(secret);
    const wrongSecret = `${secret}x`;
    assertE2EOnlyPassword(wrongSecret);
    const passwordHash = mods.hashDaemonPassword(secret);
    const port = await freePort();
    result.paths.port = port;
    if (!socketBudget.ok) {
      throw new Error(`${socketBudget.detail}. The fixture home must remain under a short owned temp root; the evidence outDir is not used for the socket path.`);
    }
    await writePrivateJson(join(home, "config.json"), fixtureConfig({ port, passwordHash, appBaseUrl }));

    env = fixtureDaemonEnv(process.env, home, chromium);
    result.stage = "daemon_start";
    daemonAttempted = true;
    const daemon = await startDaemon(paseoBin, home, env);
    daemonStarted = true;
    result.serverId = daemon.serverId ?? null;
    result.daemonVersion = daemon.daemonVersion ?? daemon.version ?? null;
    if (!result.serverId) throw new Error("fixture daemon reported no serverId");
    if (typeof daemon.listen !== "string" || !daemon.listen.endsWith(`:${port}`)) {
      throw new Error(`fixture daemon listened on an unexpected address (${daemon.listen ?? "missing"})`);
    }
    result.stage = "auth_preflight";
    result.authPreflight.missing = await probePassword(mods, daemon.listen, undefined);
    result.authPreflight.wrong = await probePassword(mods, daemon.listen, wrongSecret);
    result.authPreflight.positive = await probePassword(mods, daemon.listen, secret);
    if (result.authPreflight.missing !== "password_required") {
      throw new Error(`fixture daemon did not require a password (${result.authPreflight.missing})`);
    }
    if (result.authPreflight.wrong !== "incorrect_password") {
      throw new Error(`fixture daemon did not reject the wrong password (${result.authPreflight.wrong})`);
    }
    if (result.authPreflight.positive !== "connected") {
      throw new Error(`fixture daemon did not admit the generated password (${result.authPreflight.positive})`);
    }

    result.stage = "plugin_install";
    const installed = await installAndWait(paseoBin, home, env);
    const plugin = installed.plugin;
    const pluginPackage = await readJson(join(plugin.path, "package.json"));
    const sourcePackage = await readJson(join(ROOT, "package.json"));
    if (pluginPackage.version !== sourcePackage.version) {
      throw new Error(`fixture plugin version ${pluginPackage.version} does not match source ${sourcePackage.version}`);
    }
    result.pluginVersion = pluginPackage.version;

    result.stage = "bridge_ready";
    const bridgeFailureLogged = installed.logs.some((entry) =>
      /bridge failed to start|bridge-v3\.sock.*(?:EINVAL|ENAMETOOLONG|EADDRINUSE)|EINVAL.*bridge/i
        .test(String(entry.message ?? entry.text ?? "")));
    let socketPresent = false;
    let socketIsSocket = false;
    const bridgeDeadline = Date.now() + 10_000;
    while (Date.now() < bridgeDeadline) {
      try {
        const info = await fs.stat(socketPath);
        socketPresent = true;
        socketIsSocket = info.isSocket();
        if (socketIsSocket) break;
      } catch { /* bridge is still starting */ }
      await sleep(100);
    }
    let adapterPresent = false;
    let adapterHash = null;
    let expectedAdapterHash = null;
    try {
      const adapterSource = buildAdapterSource(SELECTED_IDENTITY);
      expectedAdapterHash = createHash("sha256").update(adapterSource).digest("hex");
      const actual = await fs.readFile(adapterPath);
      adapterPresent = true;
      adapterHash = createHash("sha256").update(actual).digest("hex");
    } catch { /* facts below fail closed */ }
    const adapterHashMatches = Boolean(adapterHash && expectedAdapterHash && adapterHash === expectedAdapterHash);
    // The private credential file remains part of the transport contract; it is
    // owner-only and never part of saved agent configuration.
    let tokenFilePresent = false;
    let tokenFileMode = null;
    let tokenFileBytes = null;
    let token = "";
    try {
      const info = await fs.stat(tokenPath);
      tokenFilePresent = info.isFile();
      tokenFileMode = (info.mode & 0o777).toString(8).padStart(4, "0");
      token = (await fs.readFile(tokenPath, "utf8")).trim();
      tokenFileBytes = Buffer.byteLength(token, "utf8");
    } catch { /* facts below fail closed */ }
    let legacyTombstonePresent = false;
    try {
      const legacy = await fs.readFile(legacyAdapterPath, "utf8");
      legacyTombstonePresent = legacy.includes("html-render-legacy-tombstone") && !legacy.includes("node:net");
    } catch { /* facts below fail closed */ }
    const tokenFileHealthy = tokenFilePresent && tokenFileMode === "0600" && /^[0-9a-f]{64}$/.test(token);
    result.bridge = {
      pluginReady: true,
      bridgeFailureLogged,
      socketPresent,
      socketIsSocket,
      socketPathBytes: socketBudget.bytes,
      socketPathLimit: socketBudget.maxBytes,
      adapterPresent,
      adapterHashMatches,
      adapterHash,
      expectedAdapterHash,
      adapterVersion: SELECTED_IDENTITY.adapterVersion,
      fileName: SELECTED_IDENTITY.adapterFileName,
      legacyAdapterFileName: SELECTED_IDENTITY.legacyAdapterFileName,
      legacyTombstonePresent,
      tokenFilePresent,
      tokenFileMode,
      tokenFileBytes,
      ready: !bridgeFailureLogged && socketPresent && socketIsSocket && adapterPresent &&
        adapterHashMatches && legacyTombstonePresent && tokenFileHealthy,
    };
    await writePrivateJson(join(outDir, "bridge-facts.json"), result.bridge);
    if (bridgeFailureLogged) {
      throw new Error("fixture plugin reported a bridge startup failure; the MCP adapter would not be injected");
    }
    if (!socketPresent || !socketIsSocket) {
      throw new Error("fixture bridge socket was not created as a Unix socket; refusing to run a paid agent");
    }
    if (!adapterPresent || !adapterHashMatches) {
      throw new Error("fixture MCP adapter source is missing or does not match the current build; refusing to run a paid agent");
    }
    if (!legacyTombstonePresent) {
      throw new Error("fixture retired 2.x adapter is not a tombstone; a legacy agent could reach the 3.x bridge");
    }
    if (!tokenFileHealthy) {
      throw new Error(`fixture private bridge token file is unhealthy (present=${tokenFilePresent}, mode=${tokenFileMode}, bytes=${tokenFileBytes})`);
    }
    await writePrivateJson(join(outDir, "bridge-facts.json"), result.bridge);

    result.stage = "workspace";
    client = await mods.connectToDaemon({ target: { kind: "instance", home }, timeout: 20_000 });
    const created = await client.createWorkspace({ source: { kind: "directory", path: workspace } });
    const workspaceId = created?.workspace?.id;
    if (!workspaceId) throw new Error("fixture workspace creation failed");
    result.workspaceId = workspaceId;

    if (prepareOnly) {
      result.stage = "relay_offer_check";
      const pair = await paseo(paseoBin, home, ["pair", "--home", home, "--json"], env, 60_000);
      if (pair.code !== 0) throw new FixtureUnavailableError("relay", "fixture relay offer was not available");
      const offer = parseCliJson(pair.stdout);
      if (typeof offer.url !== "string" || !offer.url.includes("#offer=")) {
        throw new FixtureUnavailableError("relay", "fixture relay offer was empty");
      }
      result.authPreflight.relayOffer = "available";
      result.status = "fixture-ready";
      result.stage = "prepare_only";
      return result;
    }

    result.stage = "agent_run";
    const nonce = randomBytes(6).toString("hex");
    const title = `html-render protected acceptance ${nonce}`;
    const marker = `PROTECTED CLIENT ACCEPTANCE ${nonce.toUpperCase()}`;
    const html = acceptanceHtml(marker);
    result.title = title;
    result.marker = marker;
    const runResult = await paseo(paseoBin, home, [
      "run", "--home", home, "--json",
      "--provider", provider, "--model", model, "--thinking", thinking,
      "--workspace", workspaceId, "--title", title, "--wait-timeout", "5m",
      acceptancePrompt({ title, html, marker }),
    ], env, 360_000);
    if (runResult.code !== 0) {
      const detail = redactSensitive(runResult.stderr).slice(-1600);
      throw new FixtureUnavailableError("provider", `fixture provider/model run failed without fallback: ${detail || "no detail"}`);
    }
    const runJson = parseCliJson(runResult.stdout);
    agentId = runJson.agentId;
    if (!agentId) throw new FixtureUnavailableError("provider", "fixture provider/model run returned no agent id");
    result.agentId = agentId;

    result.stage = "agent_runtime_facts";
    const recordRead = await readAgentRecord(home, agentId, workspace);
    const facts = recordFacts(recordRead.record, workspaceId, workspace, recordRead.error);
    const recordText = JSON.stringify(recordRead.record ?? null);
    const recordTokenLeak = Boolean(
      (token && recordText.includes(token)) ||
      recordText.includes(SELECTED_IDENTITY.bridgeEnv.token) ||
      recordText.includes(BRIDGE_TOKEN_FILE)
    );
    // The launch-only contribution must never reach saved configuration. This
    // check runs before the session-open evidence so a regression names the leak.
    if (facts.newKeyPersisted) {
      throw new Error(`saved agent record contains the launch-only MCP key ${SELECTED_IDENTITY.mcpServerName}`);
    }
    if (recordTokenLeak) {
      throw new Error("saved agent record contains the private bridge credential or its launch environment");
    }
    const runtimeLogs = await paseo(
      paseoBin, home, ["plugin", "--home", home, "logs", "html-render", "--json"], env, 30_000,
    );
    if (runtimeLogs.code !== 0) throw new Error("fixture could not read plugin logs for session-open evidence");
    const sessionOpen = sessionOpenFacts(JSON.parse(runtimeLogs.stdout), agentId, { token, workspace });
    result.sessionOpen = sessionOpen;
    result.agentRuntime = {
      serverId: result.serverId,
      agentId,
      workspaceId,
      pluginVersion: result.pluginVersion,
      daemonVersion: result.daemonVersion,
      authPreflight: result.authPreflight,
      record: facts,
      recordTokenLeak,
      sessionOpen,
    };
    await writePrivateJson(join(outDir, "agent-runtime-facts.json"), result.agentRuntime);
    if (!sessionOpen.observed) {
      throw new Error("no sanitized session-open injection line for the fixture agent; the launch-only server was not observed");
    }
    if (sessionOpen.server !== SELECTED_IDENTITY.mcpServerName ||
        sessionOpen.transport !== "stdio" || sessionOpen.alwaysLoad !== true) {
      throw new Error(`unexpected session-open evidence: ${JSON.stringify(sessionOpen)}`);
    }
    if (!sessionOpen.sanitized) {
      throw new Error("session-open evidence leaked the credential, token file or workspace path");
    }

    result.stage = "tool_evidence";
    const timelineItems = await mods.fetchAgentTimelineItems(client, agentId, { timeoutMs: 30_000 });
    const timelineText = JSON.stringify(timelineItems);
    const toolFacts = renderToolFacts(timelineItems, title);
    let reference = decodeReportReference(timelineText);
    if (!reference) {
      const transcript = await paseo(paseoBin, home, ["logs", agentId, "--home", home], env, 90_000);
      reference = transcript.code === 0 ? decodeReportReference(transcript.stdout) : null;
    }
    result.toolCall = {
      ...toolFacts,
      markerParsed: Boolean(reference),
      artifactId: reference?.artifactId ?? null,
      referenceMatchesCompletedRow: Boolean(reference && toolFacts.completedArtifactIds.includes(reference.artifactId)),
      invocationEvidence:
        reference && toolFacts.completedArtifactCount === 1 && toolFacts.completedArtifactIds.includes(reference.artifactId)
          ? "tool-row+artifact"
          : "none",
    };
    await writePrivateJson(join(outDir, "agent-tool-facts.json"), result.toolCall);

    if (toolFacts.completedCount === 0) {
      if (toolFacts.count === 0) {
        throw new FixtureUnavailableError("provider", "no completed direct or recognized nested html_render tool row was observed");
      }
      throw new Error("html_render tool rows did not complete");
    }
    if (!reference) {
      throw new Error("a completed html_render tool row was observed but no parsed artifact marker was found");
    }
    if (!ARTIFACT_ID.test(reference.artifactId)) throw new Error("parsed artifact id is not 32 lowercase hex characters");
    if (reference.title !== title) {
      throw new Error(`parsed artifact title does not match the unique fixture title (${reference.title})`);
    }
    if (toolFacts.completedArtifactCount !== 1 || !toolFacts.completedArtifactIds.includes(reference.artifactId)) {
      throw new Error("the unique artifact marker must occur in a completed render tool row with the requested title");
    }
    result.artifactId = reference.artifactId;

    result.stage = "artifact_readback";
    const readback = await client.invokePluginRpc("html-render", "html.artifact.read", {
      artifactId: reference.artifactId,
      agentId,
    });
    const original = await client.invokePluginRpc("html-render", "html.artifact.original", {
      artifactId: reference.artifactId,
      agentId,
    });
    const artifactDirectory = join(
      home,
      "plugin-data",
      SELECTED_IDENTITY.dataDirName,
      "artifacts",
      reference.artifactId,
    );
    const storeOwned = typeof readback.interactivePath === "string" &&
      isAbsolute(readback.interactivePath) &&
      resolve(readback.interactivePath) === join(artifactDirectory, "interactive.html");
    const sourceHtmlSha256 = sha256(html);
    const originalHtmlSha256 = sha256(original.html);
    const artifactFacts = {
      artifactId: readback.artifactId,
      title: readback.title,
      markerParsed: true,
      titleMatches: readback.title === title,
      readAuthorized: true,
      originalAuthorized: true,
      storeOwned,
      originalMatchesRequested: original.html === html,
      sourceHtmlSha256,
      originalHtmlSha256,
      interactiveHtmlSha256: typeof original.interactiveHtml === "string"
        ? sha256(original.interactiveHtml)
        : null,
      adapterSourceSha256: result.bridge.adapterHash ?? null,
      expectedAdapterSourceSha256: result.bridge.expectedAdapterHash ?? null,
      adapterVersionExpected: SELECTED_IDENTITY.adapterVersion,
      pluginVersion: result.pluginVersion,
      originalHasMarker: original.html.includes(marker),
      originalHasCsp: typeof original.interactiveHtml === "string" &&
        original.interactiveHtml.includes("Content-Security-Policy"),
      renderMode: readback.renderMode,
    };
    result.artifact = {
      ...artifactFacts,
      width: readback.width,
      height: readback.height,
      interactivePath: readback.interactivePath,
    };
    await writePrivateJson(join(outDir, "artifact-facts.json"), result.artifact);

    if (readback.artifactId !== reference.artifactId || !artifactFacts.titleMatches) {
      throw new Error("authorized artifact readback does not match the parsed marker/title");
    }
    if (!readback.interactivePath || !isAbsolute(readback.interactivePath) || !storeOwned) {
      throw new Error("authorized readback path is not inside the exact owned fixture artifact directory");
    }
    if (original.artifactId !== reference.artifactId || original.title !== title || !artifactFacts.originalHasMarker) {
      throw new Error("authorized original readback does not match the unique fixture marker/title");
    }
    if (!artifactFacts.originalMatchesRequested || originalHtmlSha256 !== sourceHtmlSha256) {
      throw new Error("authorized original HTML is not byte-identical to the requested acceptance HTML");
    }
    if (original.interactivePath !== readback.interactivePath) {
      throw new Error("original and artifact readback disagree on the interactive path");
    }
    result.interactivePath = readback.interactivePath;

    result.stage = "relay_offer";
    const pair = await paseo(paseoBin, home, ["pair", "--home", home, "--json"], env, 60_000);
    if (pair.code !== 0) {
      throw new FixtureUnavailableError("relay", "fixture relay offer was not available");
    }
    const offer = parseCliJson(pair.stdout);
    if (typeof offer.url !== "string" || !offer.url.includes("#offer=")) {
      throw new FixtureUnavailableError("relay", "fixture relay offer was empty");
    }
    if (typeof offer.connectionUri !== "string" || !offer.connectionUri.startsWith("relay://")) {
      throw new FixtureUnavailableError("relay", "fixture relay connection URI was empty");
    }
    const withPassword = (value) => `${offer.connectionUri}${offer.connectionUri.includes("?") ? "&" : "?"}password=${encodeURIComponent(value)}`;
    await fs.writeFile(offerPath, `${offer.url}\n`, { mode: 0o600 });
    await fs.chmod(offerPath, 0o600);
    await writePrivateJson(authLinksPath, {
      missing: offer.url,
      wrong: withPassword(wrongSecret),
      correct: withPassword(secret),
    });
    await writePrivateJson(browserConfigPath, {
      outDir,
      offerFile: offerPath,
      linksFile: authLinksPath,
      serverId: result.serverId,
      agentId,
      title,
      marker,
      artifactId: result.artifactId,
      interactivePath: result.interactivePath,
      baseUrl: appBaseUrl,
      chromium,
      browserProfileRoot: workRoot,
      browserChildGroupFile: browserChildGroupPath,
    });

    result.stage = "browser";
    browserLaunched = true;
    const browserRun = await run(process.execPath, [E2E_CLIENT, "--config", browserConfigPath], {
      cwd: ROOT,
      env: fixtureBrowserEnv(process.env, secret),
      timeoutMs: 300_000,
      processGroup: true,
      onSpawn: (child) => {
        browserPid = child.pid ?? null;
        if (browserPid) {
          try { writeFileSync(browserGroupPath, `${JSON.stringify({ pid: browserPid })}\n`, { mode: 0o600 }); } catch { /* timeout cleanup has the handle */ }
        }
      },
    });
    browserPid = browserRun.pid ?? browserPid;
    const browserResultPath = join(outDir, "g6-client.json");
    const browserResult = await readJson(browserResultPath).catch(() => null);
    result.browser = browserResult
      ? {
          status: browserResult.status,
          stage: browserResult.stage,
          auth: browserResult.auth,
          isolation: browserResult.isolation,
          timeline: browserResult.timeline,
          filePreview: browserResult.filePreview,
          refresh: browserResult.refresh,
          cleanup: browserResult.cleanup,
        }
      : {};
    browserCleanup = browserResult?.cleanup ?? null;
    if (!browserResult) {
      throw new Error(`browser capture exited ${browserRun.code} without a result file`);
    }
    if (browserRun.code === 2 || browserResult.status === "unavailable") {
      throw new FixtureUnavailableError(browserResult.stage ?? "browser", `hosted client unavailable: ${browserResult.failure ?? "no detail"}`);
    }
    if (browserRun.code !== 0 || browserResult.status !== "pass") {
      throw new Error(`hosted client failed: ${browserResult.failure ?? browserResult.errors?.[0] ?? `exit ${browserRun.code}`}`);
    }
    const profileLeftovers = (await fs.readdir(workRoot).catch(() => []))
      .filter((name) => name.startsWith("browser-profile-"));
    if (profileLeftovers.length > 0) {
      browserCleanup = { ...(browserCleanup ?? {}), profileRemoved: false };
    }
    if (!browserCleanup?.browserStopped || !browserCleanup?.profileRemoved) {
      throw new Error("browser process or owned profile cleanup was not verified");
    }

    result.status = "pass";
    result.stage = "complete";
    return result;
  } catch (error) {
    result.status = error instanceof FixtureUnavailableError ? "unavailable" : "fail";
    if (error instanceof FixtureUnavailableError) result.stage = error.stage;
    result.errors.push(redactSensitive(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error), [secret]));
    return result;
  } finally {
    if (!browserCleanup?.browserStopped || !browserCleanup?.profileRemoved) {
      try {
        const state = JSON.parse(await fs.readFile(browserChildGroupPath, "utf8"));
        if (Number.isInteger(state?.pid) && state.pid > 1 && state.pid !== process.pid) {
          browserChildPid = Number(state.pid);
        }
      } catch { /* no child group recorded */ }
      if (browserPid && browserPid > 1 && browserPid !== process.pid) {
        try { process.kill(-browserPid, "SIGKILL"); } catch { /* owned group already gone */ }
      }
      if (browserChildPid && browserChildPid > 1 && browserChildPid !== process.pid) {
        try { process.kill(-browserChildPid, "SIGKILL"); } catch { /* owned group already gone */ }
      }
    }
    if (client) await client.close().catch(() => {});
    if (agentId && daemonStarted) {
      await paseo(paseoBin, home, ["archive", agentId, "--home", home], env, 30_000).catch(() => {});
    }
    const stop = daemonAttempted
      ? await stopDaemon(paseoBin, home, env).catch(() => ({ stopped: false, evidence: "stop error" }))
      : { stopped: true, evidence: "not_started", action: null };
    daemonStopped = stop.stopped;
    daemonStopEvidence = stop.evidence;
    await fs.rm(offerPath, { force: true }).catch(() => {});
    await fs.rm(authLinksPath, { force: true }).catch(() => {});
    await fs.rm(browserConfigPath, { force: true }).catch(() => {});
    result.cleanup = {
      daemonStopped,
      daemonStopEvidence,
      daemonStopAction: stop.action,
      fixtureRemoved: false,
      retainedByRequest: keep,
      browserState: browserLaunched ? "launched" : "not-started",
      ...(browserLaunched
        ? {
            browserStopped: browserCleanup?.browserStopped === true,
            browserProfileRemoved: browserCleanup?.profileRemoved === true,
          }
        : { browserStopped: null, browserProfileRemoved: null }),
    };
    if (!keep && daemonStopped) {
      await fs.rm(workRoot, { recursive: true, force: true }).catch(() => {});
      result.cleanup.fixtureRemoved = !existsSync(workRoot);
    }
    if (!result.cleanup.fixtureRemoved) result.cleanup.fixtureHome = workRoot;
    const fixtureCleanupOk = keep || result.cleanup.fixtureRemoved;
    const browserCleanupOk = !browserLaunched ||
      (result.cleanup.browserStopped === true && result.cleanup.browserProfileRemoved === true);
    const cleanupOk = daemonStopped && fixtureCleanupOk && browserCleanupOk;
    result.cleanup.requiredCleanupPassed = cleanupOk;
    if ((result.status === "pass" || result.status === "fixture-ready") && !cleanupOk) {
      result.status = "fail";
      result.stage = "cleanup";
      result.failure = "completed fixture failed required daemon/browser/work-root cleanup";
      result.errors.push(result.failure);
    }
    result.finishedAt = new Date().toISOString();
    await writePrivateJson(join(outDir, "fixture-result.json"), result).catch(() => {});
  }
}

function option(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
}
const has = (name) => process.argv.includes(`--${name}`);
const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const result = await runProtectedAcceptance({
    outDir: option("out", undefined),
    prepareOnly: has("prepare-only"),
    keep: has("keep"),
    paseoBin: option("paseo", process.env.PASEO_BIN ?? "paseo"),
    chromium: option("chromium", process.env.PASEO_HTML_RENDER_CHROMIUM),
    provider: option("provider", DEFAULT_PROVIDER),
    model: option("model", DEFAULT_MODEL),
    thinking: option("thinking", DEFAULT_THINKING),
    appBaseUrl: option("base-url", APP_BASE_URL),
  });
  console.log(JSON.stringify({
    status: result.status,
    stage: result.stage,
    mode: result.mode,
    outDir: result.outDir,
    serverId: result.serverId,
    pluginVersion: result.pluginVersion,
    authPreflight: result.authPreflight,
    artifactId: result.artifactId,
    browserStatus: result.browser?.status,
    cleanup: result.cleanup,
    errors: result.errors.map((entry) => entry.split("\n")[0]),
  }, null, 2));
  if (result.status === "unavailable") process.exitCode = 2;
  else if (result.status !== "pass" && result.status !== "fixture-ready") process.exitCode = 1;
}
