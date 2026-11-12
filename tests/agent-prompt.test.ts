import assert from "node:assert/strict";
import test from "node:test";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerAgentPromptHook } from "../server/agent-prompt.ts";
import {
  AGENT_PROMPT,
  AGENT_PROMPT_MARKER,
  AGENT_PROMPT_PROVIDERS,
  hasAgentPrompt,
  isAgentPromptProvider,
  withAgentPrompt,
} from "../shared/prompt.ts";

type CreateHook = (input: { request: any }, context: unknown) => Promise<any>;

function fakeServer(enabled = true) {
  let hook: CreateHook | undefined;
  const logs: string[] = [];
  const server = {
    before(name: string, handler: CreateHook) {
      if (name === "agent.create") hook = handler;
      return () => {};
    },
  } as unknown as PluginServerContext;
  registerAgentPromptHook(server, {
    enabled: async () => enabled,
    log: (message) => logs.push(message),
  });
  assert.ok(hook, "agent.create hook must be registered");
  const run = (request: unknown) => hook?.({ request }, {});
  return { run, logs };
}

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    config: {
      provider: "pi",
      cwd: "/tmp/workspace",
      model: "m",
      systemPrompt: undefined as string | undefined,
      ...overrides,
    },
    env: {},
    metadata: {},
  };
}

test("the prompt names both tools, the codemode path and the brake", () => {
  assert.ok(AGENT_PROMPT.startsWith(AGENT_PROMPT_MARKER));
  assert.match(AGENT_PROMPT, /html_render/);
  assert.match(AGENT_PROMPT, /html_preview/);
  assert.match(AGENT_PROMPT, /codemode/);
  assert.match(AGENT_PROMPT, /searchTools\("html"\)/);
  assert.match(AGENT_PROMPT, /Do not ask permission/);
  assert.match(AGENT_PROMPT, /plain text for a single fact/);
  assert.match(AGENT_PROMPT, /One card per turn/);
  assert.match(AGENT_PROMPT, /never republish unchanged content/);
});

test("only pi receives the prompt", () => {
  assert.deepEqual([...AGENT_PROMPT_PROVIDERS], ["pi"]);
  assert.equal(isAgentPromptProvider("pi"), true);
  for (const provider of ["claude", "codex", "opencode", "omp", "hermes", "acp"]) {
    assert.equal(isAgentPromptProvider(provider), false, provider);
  }
});

test("the prompt appends to an existing system prompt and is idempotent", () => {
  assert.equal(withAgentPrompt(undefined), AGENT_PROMPT);
  assert.equal(withAgentPrompt("  "), AGENT_PROMPT);
  const custom = "You are a careful reviewer.";
  const joined = withAgentPrompt(custom);
  assert.ok(joined.startsWith(custom));
  assert.ok(joined.includes(AGENT_PROMPT));
  assert.equal(withAgentPrompt(joined), joined);
  assert.equal((joined.match(/paseo-html-render prompt v1/g) ?? []).length, 1);
  assert.equal(hasAgentPrompt(joined), true);
  assert.equal(hasAgentPrompt(custom), false);
});

test("a new pi agent gets the prompt without losing its own config", async () => {
  const { run, logs } = fakeServer();
  const request = createRequest({ systemPrompt: "Prefer short answers." });
  const result = await run(request);
  assert.ok(result, "the hook returns the modified request");
  assert.equal(result.config.provider, "pi");
  assert.equal(result.config.model, "m");
  assert.equal(result.config.cwd, "/tmp/workspace");
  assert.equal(result.config.systemPrompt, withAgentPrompt("Prefer short answers."));
  assert.equal(request.config.systemPrompt, "Prefer short answers.", "the input object is not mutated");
  assert.deepEqual(result.env, {});
  assert.equal(logs.length, 1);
  assert.match(logs[0] ?? "", /agent prompt injected/);
});

test("a non-pi agent is returned untouched", async () => {
  const { run } = fakeServer();
  for (const provider of ["claude", "codex", "opencode", "omp"]) {
    assert.equal(await run(createRequest({ provider })), undefined, provider);
  }
});

test("an agent that already carries the prompt is not changed", async () => {
  const { run } = fakeServer();
  const request = createRequest({ systemPrompt: `Host text\n\n${AGENT_PROMPT}` });
  assert.equal(await run(request), undefined);
});

test("the host setting can turn the prompt off", async () => {
  const { run } = fakeServer(false);
  assert.equal(await run(createRequest()), undefined);
});

test("a missing or malformed config is ignored", async () => {
  const { run } = fakeServer();
  assert.equal(await run({}), undefined);
  assert.equal(await run({ config: null }), undefined);
});
