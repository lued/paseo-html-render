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
 * The policy lives once in shared/policy.ts and is projected into the MCP
 * instructions and tool descriptions, so this measures the model's reading of
 * the plugin, not a prompt trick.
 *
 *   node scripts/trigger-eval.mjs [--runs 1] [--min-structured 4] [--provider pi] [--model ...]
 *
 * Exit code 0 when must-render calls meet --min-structured (default 80% of the
 * attempts) and must-not-render calls are 0. may-render is reported but never
 * decides the exit code. A miss is model variance, not a plugin failure; rerun
 * before acting on it.
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
const runs = Math.max(1, Number.parseInt(option("runs", "1"), 10) || 1);

const CLASSES = [
  {
    kind: "must-render",
    prompts: [
      "Compare the last two commits and tell me which is riskier.",
      "Summarize today's verification results for me.",
      "Explain how the MCP bridge authenticates callers.",
      "Which files in server/ are the largest and what do they do?",
      "What changed about the report card today?",
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

const mustRenderAttempts = CLASSES[0].prompts.length * runs;
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
for (const { kind, prompts } of CLASSES) {
  for (const prompt of prompts) {
    for (let pass = 1; pass <= runs; pass += 1) {
      const calls = await probe(prompt).catch((error) => {
        results.push({ kind, prompt, pass, calls: -1, error: String(error) });
        return -1;
      });
      if (calls !== -1) results.push({ kind, prompt, pass, calls });
      const entry = results.at(-1);
      const verdict = entry.calls > 0 ? "rendered" : entry.calls === 0 ? "text    " : "error   ";
      console.log(`${verdict} ${kind.padEnd(14)} ${pass}/${runs} ${prompt}`);
    }
  }
}

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
