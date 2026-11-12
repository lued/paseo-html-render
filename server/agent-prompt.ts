import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  hasAgentPrompt,
  isAgentPromptProvider,
  withAgentPrompt,
} from "../shared/prompt.ts";

export interface AgentPromptOptions {
  /** Whether the host setting allows the prompt; defaults to enabled on failure. */
  enabled: () => Promise<boolean>;
  log: (message: string) => void;
}

interface CreateRequest {
  config: {
    provider: string;
    systemPrompt?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Append the trigger prompt to a new agent's own system prompt.
 *
 * `agent.create.before` is a request hook: the daemon validates the returned
 * object (only `config` fields other than `cwd` may change) and persists it in
 * the agent record, so the text survives resumes without the plugin running.
 * `agent.open.before` cannot set a prompt at all, which is why this hook exists
 * instead of the session-open one.
 */
export function registerAgentPromptHook(server: PluginServerContext, options: AgentPromptOptions): void {
  // `before` is the SDK's compatibility alias for `agent.create.before`; the
  // long-lived fleet pattern is the alias, so a 0.13/0.14 daemon keeps working.
  server.before("agent.create", async ({ request }) => {
    const create = request as unknown as CreateRequest;
    const config = create?.config;
    if (!config || !isAgentPromptProvider(config.provider)) return;
    if (hasAgentPrompt(config.systemPrompt)) return;
    if (!(await options.enabled())) return;
    const next = withAgentPrompt(config.systemPrompt);
    if (next === config.systemPrompt) return;
    options.log(`agent prompt injected for a new ${config.provider} agent`);
    return {
      ...(request as object),
      config: {
        ...config,
        systemPrompt: next,
      },
    } as typeof request;
  });
}
