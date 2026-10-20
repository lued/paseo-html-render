#!/usr/bin/env node
/**
 * Trigger-policy check.
 *
 * Runs a fixed corpus of ordinary prompts - no tool names, no "make a report" -
 * through a real agent and counts actual `html_render` calls. Structured prompts
 * should render; plain ones should not. The policy lives in the plugin's MCP
 * instructions and tool description, so this measures the model's reading of the
 * plugin, not a prompt trick.
 *
 *   node scripts/trigger-eval.mjs [--runs 1] [--provider pi] [--model ...]
 *
 * Exit code 0 when structured >= --min-structured (default 4) and plain === 0.
 * A miss is model variance, not a plugin failure; rerun before acting on it.
 */
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const provider = option("provider", process.env.PASEO_E2E_PROVIDER ?? "pi");
const model = option("model", process.env.PASEO_E2E_MODEL ?? "ocx/opencode-go/deepseek-v4.1-flash");
const thinking = option("thinking", process.env.PASEO_E2E_THINKING ?? "high");
const minStructured = Number(option("min-structured", "4"));

const STRUCTURED = [
  "Compare the last two commits and tell me which is riskier.",
  "Summarize today's verification results for me.",
  "Explain how the MCP bridge authenticates callers.",
  "Which files in server/ are the largest and what do they do?",
  "What changed about the report card today?",
];
const PLAIN = [
  "What is 17*23?",
  "What does paseo-plugin.json contain?",
  "Is the daemon running right now?",
  "Which node version does the plugin require?",
  "What is the current git branch?",
];

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

function countCalls(log) {
  return log.split("\n").filter((line) => /^\[(mcp__html_render__)?html_render\]/.test(line)).length;
}

async function probe(prompt) {
  const out = await run("npx", [
    "paseo", "run", "--json", "--provider", provider, "--model", model, "--thinking", thinking,
    "--title", "trigger eval", "--wait-timeout", "100s", prompt,
  ], 180_000);
  const agentId = JSON.parse(out.slice(out.indexOf("{")))?.agentId;
  if (!agentId) throw new Error(`no agent id for: ${prompt}`);
  const log = await run("npx", ["paseo", "logs", agentId], 120_000).catch(() => "");
  return countCalls(log);
}

const results = [];
for (const [kind, prompts] of [["structured", STRUCTURED], ["plain", PLAIN]]) {
  for (const prompt of prompts) {
    const calls = await probe(prompt).catch((error) => {
      results.push({ kind, prompt, calls: -1, error: String(error) });
      return -1;
    });
    if (calls !== -1) results.push({ kind, prompt, calls });
    const entry = results.at(-1);
    console.log(`${entry.calls > 0 ? "rendered" : "text    "} ${kind.padEnd(10)} ${prompt}`);
  }
}

const structuredOk = results.filter((entry) => entry.kind === "structured" && entry.calls > 0).length;
const plainRendered = results.filter((entry) => entry.kind === "plain" && entry.calls > 0).length;
console.log(`\nstructured rendered ${structuredOk}/5 (need >= ${minStructured}); plain rendered ${plainRendered}/5 (need 0)`);
process.exit(structuredOk >= minStructured && plainRendered === 0 ? 0 : 1);
