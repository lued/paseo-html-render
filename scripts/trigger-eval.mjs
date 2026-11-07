#!/usr/bin/env node
/**
 * Trigger-policy check.
 *
 * Runs a fixed corpus of ordinary prompts - no tool names, no "make a report" -
 * through a real agent and counts actual `html_render` calls. The corpus has
 * three classes so a policy change cannot trade false positives for false
 * negatives unnoticed:
 *
 * - must-render: structured answers where a picture carries the answer.
 * - may-render: ambiguous prompts where either text or a card is defensible.
 * - must-not-render: one fact, code, config or file contents that stay text.
 *
 * The corpus also carries the exact words users ask for - "HTML report",
 * "render this as a card", "dashboard" - because the first model-visible line
 * is the only signal pi gives and it has to connect those words to
 * `html_render`. A miss on one of those is a discovery failure, not a taste
 * difference.
 *
 * The policy lives once in shared/policy.ts and is projected into the MCP
 * instructions and tool descriptions, so this measures the model's reading of
 * the plugin, not a prompt trick.
 *
 *   node scripts/trigger-eval.mjs [--runs 1] [--min-structured 4] [--provider pi] [--model ...]
 *                                [--home <isolated PASEO_HOME>] [--cwd <dir>] [--only <substring>]
 *                                [--concurrency <n>]
 *
 * Calls are counted from the persisted agent timeline, not from printed logs:
 * pi exposes the server behind codemode, and `paseo logs` sometimes prints only
 * `[Codemode]` for a nested call, so a log-line regex under-counts real renders.
 * The timeline row keeps the nested call detail. Use `--home` to measure a
 * candidate build installed in an isolated home instead of the ambient daemon.
 *
 * Exit code 0 when must-render calls meet --min-structured (default 80% of the
 * attempts) and must-not-render calls are 0. may-render is reported but never
 * decides the exit code. A miss is model variance, not a plugin failure; rerun
 * before acting on it.
 */
import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { renderToolFacts } from "./fixture-paseo.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const provider = option("provider", process.env.PASEO_E2E_PROVIDER ?? "pi");
const model = option("model", process.env.PASEO_E2E_MODEL ?? "ocx/opencode-go/deepseek-v4.1-flash");
const thinking = option("thinking", process.env.PASEO_E2E_THINKING ?? "high");
const runs = Math.max(1, Number.parseInt(option("runs", "1"), 10) || 1);
const concurrency = Math.max(1, Math.min(8, Number.parseInt(option("concurrency", "1"), 10) || 1));
// An isolated home lets a candidate build be measured instead of the installed
// one: `paseo run` otherwise talks to the ambient daemon and its plugin.
const home = option("home", process.env.PASEO_HOME ?? "");
const cwd = option("cwd", "");
const only = option("only", "");
const homeArgs = home ? ["--home", home] : [];
const cwdArgs = cwd ? ["--cwd", cwd] : [];

const CLASSES = [
  {
    kind: "must-render",
    prompts: [
      "Compare the last two commits and tell me which is riskier.",
      "Summarize today's verification results for me.",
      "Explain how the MCP bridge authenticates callers.",
      "Which files in server/ are the largest and what do they do?",
      "What changed about the report card today?",
      // Report-shaped wording: the words a user actually types must reach
      // html_render even though pi never declares the tool.
      "Make me an HTML report of what changed in this repo this week.",
      "Render this verification run as an HTML report card I can scan.",
      "Turn these numbers into an HTML report: Node 20 245ms, Node 22 120ms, Node 24 118ms, Node 26 251ms.",
    ],
  },
  {
    kind: "may-render",
    prompts: [
      "Walk me through what this plugin does.",
      "How do the renderer and the bridge fit together?",
      "Give me an overview of the test suite.",
      "What is in the docs folder?",
    ],
  },
  {
    kind: "must-not-render",
    prompts: [
      "What is 17*23?",
      "What does paseo-plugin.json contain?",
      "Is the daemon running right now?",
      "Which node version does the plugin require?",
      "What is the current git branch?",
    ],
  },
];

const selected = (kind) => CLASSES.find((entry) => entry.kind === kind).prompts
  .filter((prompt) => !only || prompt.toLowerCase().includes(only.toLowerCase())).length * runs;
const mustRenderAttempts = selected("must-render");
const defaultMinimum = Math.ceil(mustRenderAttempts * 0.8);
const minStructured = Number(option("min-structured", String(defaultMinimum)));

function run(command, commandArgs, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${command} timed out`)); }, timeoutMs);
    timer.unref?.();
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${command} exited ${code}: ${err.slice(0, 300)}`));
    });
  });
}

/**
 * How many real render calls the agent made.
 *
 * Read from the persisted timeline: a direct `html_render` row, an MCP-named
 * row, or the nested call inside pi's `codemode` wrapper. Printed logs are not a
 * contract (`paseo logs` can show only `[Codemode]`), which silently reported
 * renders as text before this.
 */
function countCalls(items) {
  const facts = renderToolFacts(items, null);
  return Number(facts?.count ?? 0);
}

/** The Paseo executable: PASEO_BIN, else the PATH entry, resolved to a real file. */
function resolvePaseo() {
  const explicit = process.env.PASEO_BIN?.trim();
  const candidates = explicit
    ? [explicit]
    : (process.env.PATH ?? "").split(delimiter).filter(Boolean).map((directory) => join(directory, "paseo"));
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch { /* keep searching */ }
  }
  throw new Error(`Paseo command not found (PASEO_BIN=${explicit ?? "unset"}); the trigger check needs the installed CLI`);
}

/** Installed-CLI modules, so counting uses the same timeline reader as the gates. */
let modulesPromise = null;
function loadModules() {
  modulesPromise ??= (async () => {
    const real = resolvePaseo();
    const packageRoot = dirname(dirname(real));
    const clientModule = await import(pathToFileURL(join(packageRoot, "dist", "utils", "client.js")).href);
    const logsModule = await import(pathToFileURL(join(packageRoot, "dist", "commands", "agent", "logs.js")).href);
    if (typeof clientModule.connectToDaemon !== "function") throw new Error("installed Paseo CLI has no connectToDaemon");
    if (typeof logsModule.fetchAgentTimelineItems !== "function") {
      throw new Error("installed Paseo CLI has no timeline reader");
    }
    return { connectToDaemon: clientModule.connectToDaemon, fetchAgentTimelineItems: logsModule.fetchAgentTimelineItems };
  })();
  return modulesPromise;
}

let clientPromise = null;
function connect() {
  clientPromise ??= (async () => {
    const modules = await loadModules();
    const targetHome = home || process.env.PASEO_HOME?.trim() || join(homedir(), ".paseo");
    return modules.connectToDaemon({ target: { kind: "instance", home: targetHome }, timeout: 30_000 });
  })();
  return clientPromise;
}

async function probe(prompt) {
  const out = await run("npx", [
    "paseo", "run", "--json", ...homeArgs, ...cwdArgs, "--provider", provider, "--model", model,
    "--thinking", thinking, "--title", "trigger eval", "--wait-timeout", "420s", prompt,
  ], 900_000);
  const agentId = JSON.parse(out.slice(out.indexOf("{")))?.agentId;
  if (!agentId) throw new Error(`no agent id for: ${prompt}`);
  // `run` can return while the turn is still finishing. Reading the timeline
  // then counts a render that has not happened yet (seen as a false "text").
  await run("npx", ["paseo", "wait", agentId, ...homeArgs, "--timeout", "300"], 420_000).catch(() => "");
  const modules = await loadModules();
  const client = await connect();
  const items = await modules.fetchAgentTimelineItems(client, agentId, { timeoutMs: 60_000 });
  return countCalls(items);
}

const jobs = [];
for (const { kind, prompts } of CLASSES) {
  for (const prompt of prompts) {
    if (only && !prompt.toLowerCase().includes(only.toLowerCase())) continue;
    for (let pass = 1; pass <= runs; pass += 1) jobs.push({ kind, prompt, pass });
  }
}

const results = [];
let nextJob = 0;
async function worker() {
  for (;;) {
    const job = jobs[nextJob];
    nextJob += 1;
    if (!job) return;
    let calls = -1;
    let error = null;
    try {
      calls = await probe(job.prompt);
    } catch (failure) {
      error = String(failure);
    }
    const entry = { kind: job.kind, prompt: job.prompt, pass: job.pass, calls, ...(error ? { error } : {}) };
    results.push(entry);
    const verdict = entry.calls > 0 ? "rendered" : entry.calls === 0 ? "text    " : "error   ";
    console.log(`${verdict} ${job.kind.padEnd(14)} ${job.pass}/${runs} ${job.prompt}`);
    if (entry.error) console.log(`   ${entry.error.split("\n")[0].slice(0, 300)}`);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, jobs.length)) }, worker));

function summarize(kind) {
  const entries = results.filter((entry) => entry.kind === kind);
  const measured = entries.filter((entry) => entry.calls >= 0);
  return {
    attempts: entries.length,
    unavailable: entries.length - measured.length,
    rendered: measured.filter((entry) => entry.calls > 0).length,
  };
}

console.log("\nPer class:");
for (const { kind } of CLASSES) {
  const summary = summarize(kind);
  const suffix = summary.unavailable > 0 ? `, ${summary.unavailable} unavailable` : "";
  console.log(`  ${kind.padEnd(14)} rendered ${summary.rendered}/${summary.attempts}${suffix}`);
}

const mustRender = summarize("must-render");
const mustNotRender = summarize("must-not-render");
const ok = mustRender.rendered >= minStructured && mustNotRender.rendered === 0;
console.log(
  `\nmust-render ${mustRender.rendered}/${mustRender.attempts} (need >= ${minStructured}); ` +
  `must-not-render ${mustNotRender.rendered}/${mustNotRender.attempts} (need 0); ` +
  `may-render reported only`,
);
process.exit(ok ? 0 : 1);
