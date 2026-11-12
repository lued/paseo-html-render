/**
 * The trigger prompt the plugin appends to an agent's own system prompt.
 *
 * This exists because of a host boundary, not a content gap. Pi exposes an
 * injected MCP server behind `codemode`: `html_render` is never declared, never
 * listed, and only the first 250 characters of the MCP instructions reach the
 * model. Paseo's Pi provider also drops `description`, `toolExposure` and
 * `alwaysLoad` when it builds the Pi MCP config (`toPiMcpConfig` forwards only
 * command/args/env). With only the one-line summary, the model renders when the
 * user says "html render" and answers in text otherwise.
 *
 * The create hook is the one supported place where the plugin can put text into
 * a Pi agent's system prompt (Paseo appends `config.systemPrompt` every turn),
 * and it applies wherever the plugin is enabled without editing a daemon. It
 * runs at agent creation, so it reaches new agents, not existing ones.
 *
 * The text is deliberately asymmetric: render is the default when the answer
 * has structure, text is the exception. The turn guard already bounds the other
 * failure mode (one card per turn, no republish), so the remaining risk is a
 * card on an answer that should stay text; the plain-text list is the brake.
 *
 * This module is client-safe: plain strings only, no node builtins and no paths.
 */

export const AGENT_PROMPT_MARKER = "<paseo-html-render prompt v1>";

export const AGENT_PROMPT =
  AGENT_PROMPT_MARKER +
  "\n" +
  "Presenting answers: when a reply's content is structural — a comparison, a flow or architecture, " +
  "several findings, a status set, ordered steps, a ranking, or numbers the reader will scan — publish " +
  "it as one HTML card with the html_render tool and keep your prose to what the card cannot say. " +
  "html_preview drafts the card; html_render publishes it. In pi the tools sit behind codemode: " +
  "searchTools(\"html\"), then call html_render. Do not ask permission and do not offer to render; just " +
  "render. Answer in plain text for a single fact, a definition, code, config, file contents, or " +
  "anything the reader will copy. One card per turn; never republish unchanged content.";

/**
 * Providers whose system prompt the plugin augments. Only pi is listed: the
 * declared-tool harnesses (claude, codex, opencode, omp) already see the full
 * tool descriptions, so repeating this text there would only bias them.
 */
export const AGENT_PROMPT_PROVIDERS = ["pi"] as const;

export function isAgentPromptProvider(provider: string): boolean {
  return (AGENT_PROMPT_PROVIDERS as readonly string[]).includes(provider);
}

export function hasAgentPrompt(systemPrompt: string | undefined): boolean {
  return typeof systemPrompt === "string" && systemPrompt.includes(AGENT_PROMPT_MARKER);
}

/**
 * Append the trigger prompt without replacing anything the user or the host
 * already set. Idempotent by the marker so a re-created or migrated agent
 * never gets two copies.
 */
export function withAgentPrompt(systemPrompt: string | undefined): string {
  const existing = typeof systemPrompt === "string" ? systemPrompt.trim() : "";
  if (!existing) return AGENT_PROMPT;
  if (hasAgentPrompt(existing)) return existing;
  return `${existing}\n\n${AGENT_PROMPT}`;
}
