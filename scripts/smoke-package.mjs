#!/usr/bin/env node
/**
 * Install one exact tarball the way Paseo installs npm plugins, then prove it in
 * a disposable Paseo home: daemon compile/readiness, injected MCP adapter,
 * preview, publish and artifact readback. No model prompt is sent.
 *
 * Usage:
 *   node scripts/smoke-package.mjs --tarball <file.tgz> [--paseo <bin>] [--out <dir>]
 *     [--provider pi] [--skip-missing-browser] [--keep-fixtures]
 *
 * The daemon and every home are isolated under --out/work-*. Only the owned
 * daemon is stopped. No global tool, plugin or default Paseo home is touched.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, promises as fs, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import net from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const has = (name) => args.includes(`--${name}`);
const outDir = resolve(option("out", await fs.mkdtemp(join(tmpdir(), "html-render-smoke-"))));
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
  return value.replace(/(PASEO_HTML_RENDER_TOKEN|bridge\.token)[^\n]*/gi, "$1=<redacted>");
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
  return parsed;
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

async function loadPaseoModules(paseoBin) {
  const real = realpathSync(paseoBin);
  const packageRoot = dirname(dirname(real));
  const cliPackage = JSON.parse(await fs.readFile(join(packageRoot, "package.json"), "utf8"));
  const clientModule = await import(pathToFileURL(join(packageRoot, "dist", "utils", "client.js")).href);
  if (typeof clientModule.connectToDaemon !== "function") throw new Error("Paseo CLI has no connectToDaemon client helper");
  return { connectToDaemon: clientModule.connectToDaemon, cliVersion: cliPackage.version };
}

async function connectClient(modules, home) {
  return modules.connectToDaemon({ target: { kind: "instance", home } });
}

async function createDisposableAgent(client, home, workspace, agentHome) {
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
  const record = JSON.parse(await fs.readFile(join(agentRoot, recordPath), "utf8"));
  const mcp = record?.config?.mcpServers?.["html-render"];
  if (!mcp || mcp.type !== "stdio" || !mcp.args?.[0]) throw new Error("html-render MCP server was not injected into the new agent");
  if (mcp.alwaysLoad !== true) throw new Error("html-render MCP server was not marked alwaysLoad");
  return { agent, workspace: createdWorkspace.workspace, record, mcp };
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

async function exercisePlugin({ modules, home, paseoBin, mcp, record, agent, workspace, agentHome, roots }) {
  const env = {
    ...process.env,
    ...mcp.env,
    PASEO_AGENT_ID: agent.id,
    HOME: agentHome,
    // The adapter never needs a model or a checkout; keep cwd explicit.
    PASEO_HTML_RENDER_CWD: workspace,
  };
  const adapter = new Adapter(mcp.args[0], env);
  const client = await connectClient(modules, home);
  try {
    const init = await adapter.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "html-render-package-smoke", version: "1" },
    });
    assert.equal(init.serverInfo.name, "html-render");
    assert.equal(init.serverInfo.version, "2.2.0");
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
      mcpInjected: true,
      alwaysLoad: true,
      env: roots,
    };
  } finally {
    adapter.close();
    await client.close();
  }
}

async function missingBrowserProof({ modules, paseoBin, tarball, workRoot, daemonHome, chromium }) {
  const home = join(workRoot, "missing-home");
  const workspace = join(workRoot, "missing-workspace");
  const agentHome = join(workRoot, "missing-agent-home");
  evidenceHomes.push({ home, label: "missing", roots: [[workspace, "<missing-workspace>"], [agentHome, "<missing-agent-home>"]] });
  await writeHomeConfig(home, await freePort());
  await writePiModels(home);
  const envExtra = {
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_DATA_HOME: join(home, ".local", "share"),
  };
  const discoverable = findExistingChromium(home, false);
  if (discoverable) throw new Error(`a Chromium is still discoverable at ${discoverable}; cannot prove the missing-browser path in this environment`);
  try {
    await startDaemon(paseoBin, home, envExtra);
    const installed = await installAndWait(paseoBin, home, join(workRoot, "pkg", "node_modules", "paseo-html-render"), envExtra);
    const client = await connectClient(modules, home);
    try {
      await writePiModels(agentHome);
      const { agent, record, mcp } = await createDisposableAgent(client, home, workspace, agentHome);
      const adapter = new Adapter(mcp.args[0], {
        ...process.env,
        ...mcp.env,
        PASEO_AGENT_ID: agent.id,
        HOME: agentHome,
      });
      try {
        await adapter.request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "html-render-missing-browser", version: "1" },
        });
        adapter.notify("notifications/initialized");
        const preview = await adapter.request("tools/call", {
          name: "html_preview",
          arguments: { html: "<h1>No browser</h1>", width: 728 },
        });
        const text = toolText(preview);
        if (preview.isError !== true) throw new Error(`missing-browser probe unexpectedly rendered: ${text.slice(0, 500)}`);
        if (!/No sandboxed Chromium found|browser_unavailable|Chromium/i.test(text)) {
          throw new Error(`missing-browser probe did not report the expected error: ${text.slice(0, 500)}`);
        }
        return { result: "pass", pluginLogs: installed.logs.length, error: text.slice(0, 500), recordWorkspaceId: record.workspaceId };
      } finally {
        adapter.close();
      }
    } finally {
      await client.close();
    }
  } finally {
    await stopDaemon(paseoBin, home);
  }
}

async function main() {
  await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
  workRoot = await fs.mkdtemp(join(outDir, "work-"));
  const paseoBin = realpathSync(option("paseo", process.env.PASEO_BIN ?? "paseo"));
  paseoBinPath = paseoBin;
  const modules = await loadPaseoModules(paseoBin);
  const npmVersion = (await run("npm", ["--version"], { timeoutMs: 30_000 })).stdout.trim();
  const paseoVersion = (await run(process.execPath, [paseoBin, "--version"], { timeoutMs: 30_000 })).stdout.trim();
  result.npm = npmVersion;
  result.paseo = paseoVersion;
  result.clientVersion = modules.cliVersion;

  let tarball = option("tarball");
  if (!tarball) {
    const packDir = await fs.mkdtemp(join(outDir, "pack-"));
    const packed = JSON.parse((await run("npm", ["pack", "--pack-destination", packDir, "--json"], { timeoutMs: 120_000 })).stdout)[0];
    tarball = join(packDir, packed.filename);
  }
  tarball = resolve(tarball);
  const bytes = await fs.readFile(tarball);
  result.tarball = tarball;
  result.sha256 = createHash("sha256").update(bytes).digest("hex");
  result.integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  result.size = bytes.byteLength;

  const pkgDir = join(workRoot, "pkg");
  const home = join(workRoot, "home");
  const workspace = join(workRoot, "workspace");
  const agentHome = join(workRoot, "agent-home");
  evidenceHomes.push({ home, label: "normal", roots: [[workspace, "<workspace>"], [agentHome, "<agent-home>"]] });
  const chromiumOption = option("chromium", process.env.PASEO_HTML_RENDER_CHROMIUM ?? findExistingChromium() ?? "");
  const chromium = chromiumOption ? resolve(chromiumOption) : "";
  if (!chromium || !existsSync(chromium)) throw new Error("no Chromium found; set PASEO_HTML_RENDER_CHROMIUM to an existing sandbox-capable browser");
  result.chromium = chromium;
  await fs.mkdir(pkgDir, { recursive: true, mode: 0o700 });
  await writePiModels(home);
  await writePiModels(agentHome);
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
  assert.equal(installedPackage.version, "2.2.0");
  assert.ok(existsSync(join(pkgDir, "node_modules", "pele")));
  assert.equal(existsSync(join(pkgDir, "node_modules", "@getpaseo", "client")), false, "production tree must not rely on @getpaseo/client");
  result.checks.productionTree = { version: installedPackage.version, pele: true, getpaseoClient: false };

  await writeHomeConfig(home, await freePort());
  const daemonEnv = {
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    PASEO_HTML_RENDER_CHROMIUM: chromium,
  };
  const daemon = await startDaemon(paseoBin, home, daemonEnv);
  result.checks.daemon = { listen: daemon.listen, pid: daemon.pid };
  try {
    const installed = await installAndWait(paseoBin, home, join(pkgDir, "node_modules", "paseo-html-render"), daemonEnv);
    result.checks.plugin = { status: installed.plugin.status, path: installed.plugin.path, ready: true };
    const client = await connectClient(modules, home);
    try {
      const disposable = await createDisposableAgent(client, home, workspace, agentHome);
      result.checks.mcp = {
        injected: true,
        alwaysLoad: disposable.mcp.alwaysLoad === true,
        commandUsesNode: /\bnode(?:\.exe)?$/.test(disposable.mcp.command),
        bridgeEnv: Object.keys(disposable.mcp.env ?? {}).filter((key) => key !== "PASEO_HTML_RENDER_TOKEN").sort(),
      };
      result.checks.adapter = await exercisePlugin({
        modules,
        home,
        paseoBin,
        mcp: disposable.mcp,
        record: disposable.record,
        agent: disposable.agent,
        workspace,
        agentHome,
        roots: { home, workspace, agentHome },
      });
    } finally {
      await client.close();
    }
  } finally {
    await stopDaemon(paseoBin, home);
  }

  if (!skipMissingBrowser) {
    result.checks.missingBrowser = await missingBrowserProof({ modules, paseoBin, tarball, workRoot, daemonHome: home, chromium });
  } else {
    result.checks.missingBrowser = { result: "skipped", reason: "--skip-missing-browser" };
  }

  result.result = "pass";
  result.finishedAt = new Date().toISOString();
  await fs.writeFile(join(outDir, "smoke-result.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({
    result: result.result,
    tarball: result.tarball,
    integrity: result.integrity,
    sha256: result.sha256,
    node: result.node,
    npm: result.npm,
    paseo: result.paseo,
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
