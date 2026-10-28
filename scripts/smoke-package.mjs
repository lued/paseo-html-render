#!/usr/bin/env node
/**
 * Install one exact tarball the way Paseo installs npm plugins, then prove it in
 * a disposable Paseo home: daemon compile/readiness, injected MCP adapter,
 * preview, publish and artifact readback. No model prompt is sent.
 *
 * Usage:
 *   node scripts/smoke-package.mjs --tarball <file.tgz> [--paseo <bin>] [--out <dir>]
 *     [--npm-source npm:paseo-html-render@<exact-version>]
 *     [--provider pi] [--skip-missing-browser] [--keep-fixtures]
 *
 * --npm-source is opt-in and requires the reference --tarball. It checks the
 * registry version/integrity, then asks the real Paseo CLI to acquire the npm
 * source into the isolated home. It never substitutes a hand-installed directory.
 *
 * The daemon and every home are isolated under --out/work-*. Only the owned
 * daemon is stopped. No global tool, plugin or default Paseo home is touched.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, promises as fs, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import net from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BRIDGE_TOKEN_FILE, SELECTED_IDENTITY } from "../shared/identity.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const has = (name) => args.includes(`--${name}`);
const outOption = option("out");
const outDir = resolve(outOption ?? await fs.mkdtemp(join(tmpdir(), "html-render-smoke-")));
const provider = option("provider", "pi");
const model = option("model", "smoke/local");
const skipMissingBrowser = has("skip-missing-browser");
const keepFixtures = has("keep-fixtures");
const startedAt = new Date().toISOString();
const result = {
  startedAt,
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  npm: null,
  paseo: null,
  tarball: null,
  integrity: null,
  sha256: null,
  flags: ["--omit=dev", "--ignore-scripts", "--legacy-peer-deps"],
  checks: {},
  errors: [],
};
let workRoot = null;
let paseoBinPath = null;
const evidenceHomes = [];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const sanitize = (text, roots) => {
  let value = String(text);
  for (const [from, to] of roots) value = value.replaceAll(from, to);
  return value.replace(/(PASEO_HTML_RENDER_TOKEN|bridge-v3\.token|bridge\.token)[^\n]*/gi, "$1=<redacted>");
};

function run(command, commandArgs, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd ?? ROOT,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} ${commandArgs.join(" ")} timed out`));
    }, options.timeoutMs ?? 180_000);
    timer.unref?.();
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(`${command} ${commandArgs.join(" ")} exited ${code}\n${stderr.slice(-4000)}`));
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
      /* keep searching; an explicit path still reports a meaningful miss below */
    }
  }
  const searched = explicitPath ? value : `PATH entries (${process.env.PATH ?? ""})`;
  throw new Error(`Paseo command not found or not executable: ${value}; searched ${searched}`);
}

async function paseo(paseoBin, home, commandArgs, extraEnv = {}, timeoutMs = 180_000) {
  return run(process.execPath, [paseoBin, ...commandArgs], {
    env: { ...process.env, ...extraEnv, PASEO_HOME: home },
    timeoutMs,
  });
}

async function freePort() {
  return new Promise((resolvePromise, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePromise(address.port));
    });
  });
}

function findExistingChromium(home = process.env.HOME ?? homedir(), includeEnv = true) {
  const override = includeEnv ? process.env.PASEO_HTML_RENDER_CHROMIUM?.trim() : undefined;
  if (override && existsSync(override)) return override;
  const roots = [join(home, ".cache", "ms-playwright")];
  for (const root of roots) {
    try {
      for (const entry of readdirSync(root)) {
        if (!entry.startsWith("chromium-")) continue;
        for (const candidate of [
          join(root, entry, "chrome-linux64", "chrome"),
          join(root, entry, "chrome-linux", "chrome"),
          join(root, entry, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
        ]) if (existsSync(candidate)) return candidate;
      }
    } catch { /* no cache */ }
  }
  for (const candidate of ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/snap/bin/chromium", "/opt/google/chrome/chrome", "/usr/bin/brave-browser", "/usr/bin/microsoft-edge", "/usr/bin/vivaldi-stable"]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function writePiModels(home) {
  const agentDir = join(home, ".pi", "agent");
  await fs.mkdir(agentDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(join(agentDir, "models.json"), `${JSON.stringify({
    $schema: "https://pi.dev/schemas/models.schema.json",
    providers: {
      smoke: {
        baseUrl: "http://127.0.0.1:9/v1",
        api: "openai-completions",
        apiKey: "smoke-no-request",
        models: [{ id: "local" }],
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });
}

async function captureDaemonLog(home, label, extraRoots = []) {
  const logPath = join(home, "daemon.log");
  if (!existsSync(logPath)) return null;
  const roots = [[home, `<${label}-home>`], [workRoot, "<work>"], ...extraRoots];
  const text = await fs.readFile(logPath, "utf8");
  const lines = text.trimEnd().split("\n").slice(-400).join("\n");
  const output = join(outDir, `daemon-${label}.log`);
  await fs.writeFile(output, `${sanitize(lines, roots)}\n`, { mode: 0o600 });
  return output;
}

async function writeHomeConfig(home, port) {
  await fs.mkdir(home, { recursive: true, mode: 0o700 });
  await fs.writeFile(join(home, "config.json"), `${JSON.stringify({
    version: 1,
    daemon: { listen: `127.0.0.1:${port}`, cors: { allowedOrigins: ["https://app.paseo.sh"] }, relay: { enabled: false } },
    app: { baseUrl: "https://app.paseo.sh" },
    pluginsEnabled: true,
  }, null, 2)}\n`, { mode: 0o600 });
}

async function startDaemon(paseoBin, home, envExtra = {}) {
  const { stdout } = await paseo(paseoBin, home, ["daemon", "start", "--home", home, "--timeout", "120", "--json"], envExtra, 180_000);
  const parsed = JSON.parse(stdout.slice(stdout.indexOf("{")).trim());
  if (parsed.listen === undefined && parsed.pid === undefined) throw new Error(`unexpected daemon start output: ${stdout.slice(0, 500)}`);
  const { stdout: statusOut } = await paseo(paseoBin, home, ["daemon", "status", "--home", home, "--json"], envExtra, 30_000);
  const status = JSON.parse(statusOut.slice(statusOut.indexOf("{")).trim());
  return { ...parsed, daemonVersion: status.daemonVersion ?? parsed.daemonVersion ?? null };
}

async function stopDaemon(paseoBin, home) {
  try {
    await paseo(paseoBin, home, ["daemon", "stop", "--home", home, "--json"], {}, 30_000);
  } catch {
    try {
      const status = JSON.parse((await paseo(paseoBin, home, ["daemon", "status", "--home", home, "--json"], {}, 10_000)).stdout);
      if (status.pid) process.kill(status.pid, "SIGTERM");
    } catch { /* already gone or stopped by its supervisor */ }
  }
}

async function installAndWait(paseoBin, home, pluginDirectory, envExtra = {}) {
  await paseo(paseoBin, home, ["plugin", "--home", home, "install", pluginDirectory, "--json"], envExtra, 120_000);
  let last = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const listing = JSON.parse((await paseo(paseoBin, home, ["plugin", "--home", home, "ls", "--json"], envExtra, 30_000)).stdout);
    last = listing.find((plugin) => plugin.id === "html-render") ?? null;
    if (last?.status === "failed") {
      const logs = await paseo(paseoBin, home, ["plugin", "--home", home, "logs", "html-render", "--json"], envExtra, 30_000)
        .then((value) => value.stdout).catch(() => "");
      throw new Error(`plugin failed to start: ${last.error ?? "unknown error"}\n${logs.slice(-4000)}`);
    }
    if (last?.status === "running") {
      const logs = JSON.parse((await paseo(paseoBin, home, ["plugin", "--home", home, "logs", "html-render", "--json"], envExtra, 30_000)).stdout);
      if (logs.some((entry) => /\[paseo\] Plugin ready/.test(entry.message))) return { plugin: last, logs };
    }
    await sleep(500);
  }
  throw new Error(`plugin did not reach running/Plugin ready: ${JSON.stringify(last)}`);
}

async function packageVersionNear(req, specifier) {
  let resolved;
  try {
    resolved = req.resolve(specifier);
  } catch {
    return null;
  }
  let directory = dirname(resolved);
  for (let depth = 0; depth < 10; depth += 1) {
    try {
      const pkg = JSON.parse(await fs.readFile(join(directory, "package.json"), "utf8"));
      if (pkg.name === specifier) return pkg.version;
    } catch { /* keep walking */ }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

async function readTarballPackage(tarball) {
  const { stdout } = await run("tar", ["-xOf", tarball, "package/package.json"], { timeoutMs: 30_000 });
  return JSON.parse(stdout);
}

async function inspectInstalledSource({ sourceMode, packagePath, expectedVersion, referenceIntegrity }) {
  const installed = JSON.parse(await fs.readFile(join(packagePath, "package.json"), "utf8"));
  if (installed.version !== expectedVersion) {
    throw new Error(`installed version ${installed.version} != reference ${expectedVersion} at ${packagePath}`);
  }
  let acquiredIntegrity = null;
  if (sourceMode === "npm") {
    const versionRoot = dirname(dirname(packagePath));
    const lockPath = join(versionRoot, "package-lock.json");
    const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
    const artifact = lock.packages?.["node_modules/paseo-html-render"];
    if (!artifact?.version || artifact.version !== expectedVersion || !artifact.integrity) {
      throw new Error(`Paseo npm acquisition left no matching lock artifact at ${lockPath}`);
    }
    acquiredIntegrity = artifact.integrity;
    if (acquiredIntegrity !== referenceIntegrity) {
      throw new Error(`acquired npm integrity ${acquiredIntegrity} != reference ${referenceIntegrity}`);
    }
    if (existsSync(join(versionRoot, "node_modules", "@getpaseo", "client"))) {
      throw new Error("Paseo npm acquisition installed @getpaseo/client; production tree would rely on it");
    }
  }
  return { path: packagePath, version: installed.version, integrity: acquiredIntegrity };
}

async function installFromSource({ paseoBin, home, pluginSource, envExtra, expectedVersion, sourceMode, referenceIntegrity }) {
  const installed = await installAndWait(paseoBin, home, pluginSource, envExtra);
  const sourceInfo = await inspectInstalledSource({
    sourceMode,
    packagePath: installed.plugin.path,
    expectedVersion,
    referenceIntegrity,
  });
  return { ...installed, sourceInfo };
}

async function loadPaseoModules(paseoBin) {
  const real = realpathSync(paseoBin);
  const packageRoot = dirname(dirname(real));
  const cliPackage = JSON.parse(await fs.readFile(join(packageRoot, "package.json"), "utf8"));
  const clientModule = await import(pathToFileURL(join(packageRoot, "dist", "utils", "client.js")).href);
  if (typeof clientModule.connectToDaemon !== "function") throw new Error("Paseo CLI has no connectToDaemon client helper");
  const req = createRequire(join(packageRoot, "package.json"));
  return {
    connectToDaemon: clientModule.connectToDaemon,
    cliVersion: cliPackage.version,
    sdkVersion: await packageVersionNear(req, "@getpaseo/plugin"),
  };
}

async function connectClient(modules, home) {
  return modules.connectToDaemon({ target: { kind: "instance", home } });
}

/** Identity-derived private transport paths; never persisted in an agent record. */
function transportPaths(home) {
  const dataRoot = join(home, "plugin-data", SELECTED_IDENTITY.dataDirName);
  return {
    dataRoot,
    adapterPath: join(dataRoot, SELECTED_IDENTITY.adapterFileName),
    legacyAdapterPath: join(dataRoot, SELECTED_IDENTITY.legacyAdapterFileName),
    socketPath: join(dataRoot, SELECTED_IDENTITY.socketFileName),
    tokenPath: join(dataRoot, BRIDGE_TOKEN_FILE),
  };
}

/**
 * The only 3.0 injection evidence: the sanitized session-open line. Saved agent
 * configuration is launch-only and must never contain the server.
 */
const SESSION_OPEN = /session-open result=(\S+) server=(\S+) transport=(\S+) alwaysLoad=(\S+) agent=(\S+) provider=(\S+) reason=(\S+) purpose=(\S+)/;

async function readSessionOpen(paseoBin, home, envExtra, agentId) {
  let last = [];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const output = await paseo(paseoBin, home, ["plugin", "--home", home, "logs", "html-render", "--json"], envExtra, 30_000);
    const entries = JSON.parse(output.stdout);
    last = entries;
    for (const entry of Array.isArray(entries) ? entries : []) {
      const message = String(entry?.message ?? entry?.text ?? "");
      const match = SESSION_OPEN.exec(message);
      if (!match) continue;
      const facts = {
        observed: true,
        result: match[1],
        server: match[2],
        transport: match[3],
        alwaysLoad: match[4] === "true",
        agent: match[5],
        provider: match[6],
        reason: match[7],
        purpose: match[8],
        agentMatches: match[5] === agentId,
      };
      if (facts.result === "injected" && facts.agentMatches) return facts;
    }
    await sleep(250);
  }
  throw new Error(`no sanitized session-open injection line for agent ${agentId}: ${JSON.stringify(last.slice(-3))}`);
}

async function createDisposableAgent(client, home, workspace, agentHome, paseoBin, envExtra) {
  await fs.mkdir(workspace, { recursive: true, mode: 0o700 });
  await fs.mkdir(agentHome, { recursive: true, mode: 0o700 });
  const createdWorkspace = await client.createWorkspace({ source: { kind: "directory", path: workspace } });
  if (!createdWorkspace?.workspace?.id) throw new Error(`workspace creation failed: ${JSON.stringify(createdWorkspace)}`);
  await writePiModels(agentHome);
  const agent = await client.createAgent({
    provider,
    model,
    cwd: workspace,
    workspaceId: createdWorkspace.workspace.id,
    title: "html-render package smoke",
    env: {
      HOME: agentHome,
      XDG_CONFIG_HOME: join(agentHome, ".config"),
      XDG_CACHE_HOME: join(agentHome, ".cache"),
      XDG_DATA_HOME: join(agentHome, ".local", "share"),
    },
  });
  if (!agent?.id) throw new Error(`agent creation failed: ${JSON.stringify(agent)}`);
  const agentRoot = join(home, "agents");
  const entries = await fs.readdir(agentRoot, { recursive: true }).catch(() => []);
  const recordPath = entries.find((entry) => entry.endsWith(`${agent.id}.json`));
  if (!recordPath) throw new Error(`agent record not found for ${agent.id}`);
  const recordText = await fs.readFile(join(agentRoot, recordPath), "utf8");
  const record = JSON.parse(recordText);
  const savedServers = record?.config?.mcpServers ?? {};
  // The session-open contribution is launch-only. A saved entry would collide on
  // the next open, so its presence is a hard failure, not a warning.
  if (Object.prototype.hasOwnProperty.call(savedServers, SELECTED_IDENTITY.mcpServerName)) {
    throw new Error(`session-open server ${SELECTED_IDENTITY.mcpServerName} leaked into the saved agent record`);
  }
  const transport = transportPaths(home);
  const token = (await fs.readFile(transport.tokenPath, "utf8")).trim();
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("private bridge token file is malformed");
  const tokenMode = (await fs.stat(transport.tokenPath)).mode & 0o777;
  if (tokenMode !== 0o600) throw new Error(`private bridge token file mode is 0${tokenMode.toString(8)}; expected 0600`);
  const adapterMode = (await fs.stat(transport.adapterPath)).mode & 0o777;
  if (adapterMode !== 0o600) throw new Error(`generated adapter mode is 0${adapterMode.toString(8)}; expected 0600`);
  const legacy = await fs.readFile(transport.legacyAdapterPath, "utf8");
  if (!legacy.includes("html-render-legacy-tombstone")) throw new Error("the retired 2.x adapter is not a tombstone");
  if (recordText.includes(token)) throw new Error("the private bridge token leaked into the saved agent record");
  if (recordText.includes(SELECTED_IDENTITY.bridgeEnv.token)) throw new Error("the launch token variable leaked into the saved agent record");
  const sessionOpen = await readSessionOpen(paseoBin, home, envExtra, agent.id);
  if (sessionOpen.transport !== "stdio") throw new Error(`unexpected session-open transport ${sessionOpen.transport}`);
  if (sessionOpen.server !== SELECTED_IDENTITY.mcpServerName) throw new Error(`unexpected session-open server ${sessionOpen.server}`);
  if (sessionOpen.alwaysLoad !== true) throw new Error("session-open server was not marked alwaysLoad");
  return {
    agent,
    workspace: createdWorkspace.workspace,
    record,
    sessionOpen,
    savedNewServer: false,
    savedLaunchEnv: false,
    transport,
  };
}


class Adapter {
  constructor(adapterPath, env) {
    this.child = spawn(process.execPath, [adapterPath], { env, stdio: ["pipe", "pipe", "pipe"] });
    this.buffer = "";
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = "";
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.onData(chunk));
    this.child.stderr.setEncoding("utf8").on("data", (chunk) => { this.stderr += chunk; });
  }

  onData(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    }
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`adapter did not answer ${method}; stderr=${this.stderr.slice(-1000)}`));
      }, 90_000);
      timer.unref?.();
    });
  }

  notify(method) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  }

  close() {
    this.child.kill();
  }
}

function toolText(response) {
  return (response.content ?? []).map((item) => item.text ?? "").join("\n");
}

async function readWithRetry(client, artifactId, agentId) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await client.invokePluginRpc("html-render", "html.artifact.read", { artifactId, agentId });
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw lastError;
}

async function exercisePlugin({ modules, home, paseoBin, sessionOpen, transport, record, agent, workspace, agentHome, roots, expectedVersion }) {
  // Direct adapter probe: the private owner-only token file proves the transport
  // without putting the credential in evidence or in saved agent config.
  const token = (await fs.readFile(transport.tokenPath, "utf8")).trim();
  assert.match(token, /^[0-9a-f]{64}$/);
  const env = {
    ...process.env,
    PASEO_AGENT_ID: agent.id,
    HOME: agentHome,
    [SELECTED_IDENTITY.bridgeEnv.bridge]: transport.socketPath,
    // The adapter never needs a model or a checkout; keep cwd explicit.
    [SELECTED_IDENTITY.bridgeEnv.cwd]: workspace,
  };
  const adapter = new Adapter(transport.adapterPath, env);
  const client = await connectClient(modules, home);
  try {
    const init = await adapter.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "html-render-package-smoke", version: "1" },
    });
    assert.equal(init.serverInfo.name, SELECTED_IDENTITY.mcpServerName);
    assert.equal(init.serverInfo.version, expectedVersion);
    adapter.notify("notifications/initialized");
    const listing = await adapter.request("tools/list", {});
    assert.deepEqual(listing.tools.map((tool) => tool.name).sort(), ["html_preview", "html_render"]);

    const preview = await adapter.request("tools/call", {
      name: "html_preview",
      arguments: { html: "<h1>Package smoke preview</h1><p>real adapter</p>", width: 728 },
    });
    assert.notEqual(preview.isError, true, toolText(preview));
    assert.match(toolText(preview), /contentHeight/);

    const published = await adapter.request("tools/call", {
      name: "html_render",
      arguments: { html: "<h1>Package smoke publish</h1><p>real adapter</p>", title: "Package smoke", height: 300, summary: "isolated install" },
    });
    assert.notEqual(published.isError, true, toolText(published));
    const publishText = toolText(published);
    const markerPayload = /paseo-html-render:v1:(\S+)/.exec(publishText)?.[1];
    assert.ok(markerPayload, "publish result carries the persisted marker");
    const marker = JSON.parse(decodeURIComponent(markerPayload));
    const artifactId = marker.artifactId;
    assert.match(artifactId, /^[0-9a-f]{32}$/, "marker carries a canonical artifact id");

    let read;
    try {
      read = await readWithRetry(client, artifactId, agent.id);
    } catch (error) {
      throw new Error(`readback failed for ${artifactId}: ${error instanceof Error ? error.message : String(error)}\npublish result: ${publishText.slice(0, 600)}`);
    }
    assert.equal(read.artifactId, artifactId);
    assert.equal(read.title, "Package smoke");
    assert.equal(Buffer.from(read.preview.base64, "base64").subarray(1, 4).toString("latin1"), "PNG");
    assert.ok(read.interactivePath?.startsWith("/"));
    const original = await client.invokePluginRpc("html-render", "html.artifact.original", { artifactId, agentId: agent.id });
    assert.equal(original.html, "<h1>Package smoke publish</h1><p>real adapter</p>");
    assert.equal(typeof original.interactiveHtml, "string");

    const workspaceId = record.workspaceId;
    return {
      adapterVersion: init.serverInfo.version,
      tools: listing.tools.map((tool) => tool.name),
      preview: toolText(preview).slice(0, 300),
      artifactId,
      title: read.title,
      interactivePath: read.interactivePath,
      previewBytes: Buffer.from(read.preview.base64, "base64").byteLength,
      originalExact: true,
      workspaceId,
      agentId: agent.id,
      sessionOpen,
      savedNewServer: false,
      savedLaunchEnv: false,
      tokenFileMode: "0600",
      adapterFileMode: "0600",
      mcpInjected: sessionOpen.observed,
      alwaysLoad: sessionOpen.alwaysLoad,
      env: roots,
    };
  } finally {
    adapter.close();
    await client.close();
  }
}

async function runBrowserNegative({
  label,
  home,
  workspace,
  agentHome,
  envExtra,
  modules,
  paseoBin,
  pluginSource,
  expectedVersion,
  sourceMode,
  referenceIntegrity,
  calls,
}) {
  evidenceHomes.push({ home, label, roots: [[workspace, `<${label}-workspace>`], [agentHome, `<${label}-agent-home>`]] });
  await writeHomeConfig(home, await freePort());
  await writePiModels(home);
  await writePiModels(agentHome);
  try {
    const daemon = await startDaemon(paseoBin, home, envExtra);
    const installed = await installFromSource({
      paseoBin,
      home,
      pluginSource,
      envExtra,
      expectedVersion,
      sourceMode,
      referenceIntegrity,
    });
    const client = await connectClient(modules, home);
    let adapter = null;
    try {
      const disposable = await createDisposableAgent(client, home, workspace, agentHome, paseoBin, envExtra);
      const { agent, record, transport, sessionOpen } = disposable;
      adapter = new Adapter(transport.adapterPath, {
        ...process.env,
        PASEO_AGENT_ID: agent.id,
        HOME: agentHome,
        [SELECTED_IDENTITY.bridgeEnv.bridge]: transport.socketPath,
        [SELECTED_IDENTITY.bridgeEnv.cwd]: workspace,
      });
      await adapter.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: `html-render-${label}`, version: "1" },
      });
      adapter.notify("notifications/initialized");
      const errors = [];
      for (let attempt = 0; attempt < calls; attempt += 1) {
        const preview = await adapter.request("tools/call", {
          name: "html_preview",
          arguments: { html: `<h1>${label} ${attempt + 1}</h1>`, width: 728 },
        });
        const text = toolText(preview);
        if (preview.isError !== true) throw new Error(`${label} unexpectedly rendered: ${text.slice(0, 500)}`);
        if (!/browser_unavailable|No sandboxed Chromium found|Chromium/i.test(text)) {
          throw new Error(`${label} did not report the expected browser error: ${text.slice(0, 500)}`);
        }
        errors.push(text.slice(0, 500));
      }
      const listing = JSON.parse((await paseo(paseoBin, home, ["plugin", "--home", home, "ls", "--json"], envExtra, 30_000)).stdout);
      const plugin = listing.find((entry) => entry.id === "html-render");
      if (plugin?.status !== "running") {
        throw new Error(`${label} left the plugin not running after ${calls} call(s): ${JSON.stringify(plugin)}`);
      }
      const logs = JSON.parse((await paseo(paseoBin, home, ["plugin", "--home", home, "logs", "html-render", "--json"], envExtra, 30_000)).stdout);
      if (logs.some((entry) => /\[paseo\] Plugin failed|Unhandled 'error' event/i.test(entry.message))) {
        throw new Error(`${label} logged a plugin failure: ${JSON.stringify(logs.slice(-5))}`);
      }
      return {
        result: "pass",
        calls,
        errors,
        pluginStatus: plugin.status,
        daemonVersion: daemon.daemonVersion,
        installed: installed.sourceInfo,
        recordWorkspaceId: record.workspaceId,
        agentId: agent.id,
        sessionOpen,
        savedNewServer: false,
      };
    } finally {
      adapter?.close();
      await client.close();
    }
  } finally {
    await stopDaemon(paseoBin, home);
  }
}

async function missingBrowserProof({
  modules,
  paseoBin,
  workRoot,
  pluginSource,
  expectedVersion,
  sourceMode,
  referenceIntegrity,
}) {
  const label = "missing-browser";
  const home = join(workRoot, "missing-home");
  const workspace = join(workRoot, "missing-workspace");
  const agentHome = join(workRoot, "missing-agent-home");
  const discoverable = findExistingChromium(home, false);
  if (discoverable) throw new Error(`a Chromium is still discoverable at ${discoverable}; cannot prove the missing-browser path in this environment`);
  const envExtra = {
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    // Clear any caller override so this fixture really has no Chromium source.
    PASEO_HTML_RENDER_CHROMIUM: "",
    PLAYWRIGHT_BROWSERS_PATH: "",
  };
  return runBrowserNegative({
    label,
    home,
    workspace,
    agentHome,
    envExtra,
    modules,
    paseoBin,
    pluginSource,
    expectedVersion,
    sourceMode,
    referenceIntegrity,
    calls: 1,
  });
}

async function badOverrideProof({
  modules,
  paseoBin,
  workRoot,
  pluginSource,
  expectedVersion,
  sourceMode,
  referenceIntegrity,
}) {
  const label = "bad-override";
  const home = join(workRoot, "bad-override-home");
  const workspace = join(workRoot, "bad-override-workspace");
  const agentHome = join(workRoot, "bad-override-agent-home");
  const envExtra = {
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    PASEO_HTML_RENDER_CHROMIUM: join(workRoot, "chromium-does-not-exist"),
    PLAYWRIGHT_BROWSERS_PATH: "",
  };
  return runBrowserNegative({
    label,
    home,
    workspace,
    agentHome,
    envExtra,
    modules,
    paseoBin,
    pluginSource,
    expectedVersion,
    sourceMode,
    referenceIntegrity,
    calls: 2,
  });
}

async function main() {
  await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
  workRoot = await fs.mkdtemp(join(outDir, "work-"));
  const paseoBin = resolvePaseoCommand(option("paseo", process.env.PASEO_BIN ?? "paseo"));
  paseoBinPath = paseoBin;
  const modules = await loadPaseoModules(paseoBin);
  const npmVersion = (await run("npm", ["--version"], { timeoutMs: 30_000 })).stdout.trim();
  const paseoVersion = (await run(process.execPath, [paseoBin, "--version"], { timeoutMs: 30_000 })).stdout.trim();
  result.npm = npmVersion;
  result.paseo = paseoVersion;
  result.clientVersion = modules.cliVersion;
  result.sdkVersion = modules.sdkVersion;

  const npmSourceOption = option("npm-source");
  let npmSource = null;
  let npmSourceMatch = null;
  if (npmSourceOption) {
    npmSource = npmSourceOption.trim();
    npmSourceMatch = /^npm:paseo-html-render@(\d+\.\d+\.\d+)$/.exec(npmSource);
    if (!npmSourceMatch) throw new Error("--npm-source must be npm:paseo-html-render@<exact-version>");
    if (!option("tarball")) throw new Error("--npm-source requires the reference --tarball for version/integrity comparison");
  }
  const sourceMode = npmSource ? "npm" : "tarball";

  let tarball = option("tarball");
  if (!tarball) {
    const packDir = await fs.mkdtemp(join(outDir, "pack-"));
    const packed = JSON.parse((await run("npm", ["pack", "--pack-destination", packDir, "--json"], { timeoutMs: 120_000 })).stdout)[0];
    tarball = join(packDir, packed.filename);
  }
  tarball = resolve(tarball);
  const bytes = await fs.readFile(tarball);
  const referencePackage = await readTarballPackage(tarball);
  const expectedVersion = referencePackage.version;
  result.tarball = tarball;
  result.version = expectedVersion;
  result.sha256 = createHash("sha256").update(bytes).digest("hex");
  result.integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  result.size = bytes.byteLength;
  result.source = {
    mode: sourceMode,
    request: npmSource,
    proof: sourceMode === "npm" ? "pending" : "reference-tarball",
    reference: {
      tarball,
      version: expectedVersion,
      sha256: result.sha256,
      integrity: result.integrity,
      size: result.size,
    },
    registry: null,
    installed: null,
  };
  if (npmSourceMatch && npmSourceMatch[1] !== expectedVersion) {
    throw new Error(`--npm-source version ${npmSourceMatch[1]} != reference tarball version ${expectedVersion}`);
  }
  if (npmSource) {
    let view;
    try {
      view = JSON.parse((await run("npm", [
        "view", `paseo-html-render@${expectedVersion}`,
        "version", "dist.integrity", "dist.tarball", "--json",
      ], { timeoutMs: 120_000 })).stdout);
    } catch (error) {
      throw new Error(`npm source ${npmSource} is not available from the registry; positive remote proof remains pending until the parent publishes the exact verified tarball. ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
    const entry = Array.isArray(view) ? view[0] : view;
    const registryIntegrity = entry?.["dist.integrity"] ?? entry?.dist?.integrity;
    const registryVersion = entry?.version;
    if (registryVersion !== expectedVersion || registryIntegrity !== result.integrity) {
      throw new Error(`registry artifact does not match the reference tarball: version=${registryVersion} integrity=${registryIntegrity ?? "missing"} expected=${expectedVersion}/${result.integrity}`);
    }
    result.source.registry = {
      requested: npmSource,
      version: registryVersion,
      integrity: registryIntegrity,
      tarball: entry?.["dist.tarball"] ?? entry?.dist?.tarball ?? null,
    };
  }

  const pkgDir = join(workRoot, "pkg");
  const home = join(workRoot, "home");
  const workspace = join(workRoot, "workspace");
  const agentHome = join(workRoot, "agent-home");
  evidenceHomes.push({ home, label: "normal", roots: [[workspace, "<workspace>"], [agentHome, "<agent-home>"]] });
  const chromiumOption = option("chromium", process.env.PASEO_HTML_RENDER_CHROMIUM ?? findExistingChromium() ?? "");
  const chromium = chromiumOption ? resolve(chromiumOption) : "";
  if (!chromium || !existsSync(chromium)) throw new Error("no Chromium found; set PASEO_HTML_RENDER_CHROMIUM to an existing sandbox-capable browser");
  result.chromium = chromium;

  let pluginSource;
  if (sourceMode === "tarball") {
    await fs.mkdir(pkgDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(join(pkgDir, "package.json"), `${JSON.stringify({ name: "html-render-package-smoke", version: "1.0.0", private: true }, null, 2)}\n`);
    await run("npm", [
      "install", tarball,
      "--omit=dev", "--ignore-scripts", "--legacy-peer-deps",
      "--no-audit", "--no-fund", "--global=false", "--workspaces=false",
      "--package-lock=true", "--lockfile-version=3",
    ], {
      cwd: pkgDir,
      env: { ...process.env, NODE_PATH: "" },
      timeoutMs: 180_000,
    });
    const installedPackage = JSON.parse(await fs.readFile(join(pkgDir, "node_modules", "paseo-html-render", "package.json"), "utf8"));
    assert.equal(installedPackage.version, expectedVersion);
    assert.ok(existsSync(join(pkgDir, "node_modules", "pele")));
    assert.equal(existsSync(join(pkgDir, "node_modules", "@getpaseo", "client")), false, "production tree must not rely on @getpaseo/client");
    pluginSource = join(pkgDir, "node_modules", "paseo-html-render");
    result.checks.productionTree = { source: "reference-tarball", version: installedPackage.version, pele: true, getpaseoClient: false };
  } else {
    pluginSource = npmSource;
    result.checks.productionTree = { source: "npm", request: npmSource, version: expectedVersion };
  }

  await writePiModels(home);
  await writePiModels(agentHome);
  await writeHomeConfig(home, await freePort());
  const daemonEnv = {
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    PASEO_HTML_RENDER_CHROMIUM: chromium,
  };
  try {
    const daemon = await startDaemon(paseoBin, home, daemonEnv);
    result.checks.daemon = { listen: daemon.listen, pid: daemon.pid, version: daemon.daemonVersion };
    result.daemonVersion = daemon.daemonVersion;
    const installed = await installFromSource({
      paseoBin,
      home,
      pluginSource,
      envExtra: daemonEnv,
      expectedVersion,
      sourceMode,
      referenceIntegrity: result.integrity,
    });
    result.checks.plugin = { status: installed.plugin.status, path: installed.plugin.path, ready: true };
    if (sourceMode === "npm") {
      result.checks.productionTree = {
        source: "npm",
        request: npmSource,
        version: installed.sourceInfo.version,
        integrity: installed.sourceInfo.integrity,
        getpaseoClient: false,
      };
      result.source.installed = installed.sourceInfo;
      result.source.proof = "registry";
    } else {
      result.source.installed = installed.sourceInfo;
    }
    const client = await connectClient(modules, home);
    try {
      const disposable = await createDisposableAgent(client, home, workspace, agentHome, paseoBin, daemonEnv);
      result.checks.mcp = {
        // Injection is proven by the sanitized session-open line, never by a
        // saved record: the server is launch-only in 3.0.
        injected: disposable.sessionOpen.observed,
        server: disposable.sessionOpen.server,
        transport: disposable.sessionOpen.transport,
        alwaysLoad: disposable.sessionOpen.alwaysLoad,
        savedNewServer: disposable.savedNewServer,
        savedLaunchEnv: disposable.savedLaunchEnv,
        privateTokenFile: "0600",
      };
      result.checks.adapter = await exercisePlugin({
        modules,
        home,
        paseoBin,
        sessionOpen: disposable.sessionOpen,
        transport: disposable.transport,
        record: disposable.record,
        agent: disposable.agent,
        workspace,
        agentHome,
        roots: { home, workspace, agentHome },
        expectedVersion,
      });
    } finally {
      await client.close();
    }
  } finally {
    await stopDaemon(paseoBin, home);
  }

  if (!skipMissingBrowser) {
    result.checks.missingBrowser = await missingBrowserProof({
      modules,
      paseoBin,
      workRoot,
      pluginSource,
      expectedVersion,
      sourceMode,
      referenceIntegrity: result.integrity,
    });
    result.checks.badOverride = await badOverrideProof({
      modules,
      paseoBin,
      workRoot,
      pluginSource,
      expectedVersion,
      sourceMode,
      referenceIntegrity: result.integrity,
    });
  } else {
    result.checks.missingBrowser = { result: "skipped", reason: "--skip-missing-browser" };
    result.checks.badOverride = { result: "skipped", reason: "--skip-missing-browser" };
  }

  result.result = "pass";
  result.finishedAt = new Date().toISOString();
  await fs.writeFile(join(outDir, "smoke-result.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({
    result: result.result,
    tarball: result.tarball,
    version: result.version,
    integrity: result.integrity,
    sha256: result.sha256,
    node: result.node,
    npm: result.npm,
    paseo: result.paseo,
    daemonVersion: result.daemonVersion,
    sdkVersion: result.sdkVersion,
    source: result.source,
    checks: Object.fromEntries(Object.entries(result.checks).map(([key, value]) => [key, value.result ?? (value.ready ? "pass" : value.status ?? "recorded")])),
    outDir,
  }, null, 2));
}

main().catch(async (error) => {
  result.result = "fail";
  result.finishedAt = new Date().toISOString();
  result.errors.push(sanitize(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error), []));
  try {
    await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(join(outDir, "smoke-result.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  } catch { /* evidence is best effort */ }
  console.error(`smoke-package: ${result.errors[0].split("\n")[0]}`);
  process.exitCode = 1;
}).finally(async () => {
  if (workRoot) {
    const evidence = [];
    for (const entry of evidenceHomes) {
      const path = await captureDaemonLog(entry.home, entry.label, entry.roots).catch(() => null);
      if (path) evidence.push(path);
    }
    if (evidence.length > 0) {
      result.evidence = evidence;
      await fs.writeFile(join(outDir, "smoke-result.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 }).catch(() => {});
    }
    if (!keepFixtures) await fs.rm(workRoot, { recursive: true, force: true }).catch(() => {});
  }
});
