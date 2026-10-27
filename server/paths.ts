import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { PluginIdentity } from "../shared/identity.ts";
import { SELECTED_IDENTITY } from "../shared/selected-identity.ts";

/**
 * Paseo exports PASEO_HOME to the daemon (and the daemon inherits it into plugin
 * subprocesses). Other Paseo plugins keep their runtimes under the same parent, so
 * this plugin puts only its own private artifacts beside them:
 *
 *   $PASEO_HOME/plugin-data/html-render/
 *     artifacts/                 durable cards, previews, report models
 *     mcp-adapter-v3.mjs         generated stdio adapter for this build
 *     mcp-adapter-v1.mjs         tombstone replacing the retired 2.x adapter
 *     bridge-v3.sock             private unix socket for the adapter
 *     bridge-v3.token            written only for an explicit token rotation
 *
 * The token is not a durable credential any more: Paseo 0.14 injects the MCP
 * server from `agent.session_open`, which is launch-only, so each process mints
 * its own token and hands it to the agents it opens. A reload therefore mints a
 * new token and the next session reopen carries it; nothing is written to disk
 * on the normal path. `bridge-v3.token` stays a reserved name for deliberate
 * rotation. PASEO_HTML_RENDER_DATA_DIR overrides the root for isolated tests.
 *
 * The QA canary uses the same function with its own identity, so it resolves to
 * `$PASEO_HOME/plugin-data/html-render-v2-qa` and ignores the production
 * `PASEO_HTML_RENDER_DATA_DIR` override entirely.
 */
export function resolveDataRoot(
  env: NodeJS.ProcessEnv = process.env,
  identity: PluginIdentity = SELECTED_IDENTITY,
): string {
  const overrideName = identity.dataDirEnv;
  const override = overrideName ? env[overrideName]?.trim() : undefined;
  if (override) return resolve(override);
  const home = env.PASEO_HOME?.trim() || join(homedir(), ".paseo");
  return resolve(home, "plugin-data", identity.dataDirName);
}

/**
 * Artifact retention is non-destructive by default: `workspace.archived` never
 * deletes anything unless the operator opts in. This is an environment setting
 * on purpose, so no existing Paseo config source is edited.
 *
 * A profile with `archiveCleanupEnv: null` can never enable cleanup, and the QA
 * canary never reads the production purge variable.
 */
export function archiveCleanupEnabled(
  env: NodeJS.ProcessEnv = process.env,
  identity: PluginIdentity = SELECTED_IDENTITY,
): boolean {
  const name = identity.archiveCleanupEnv;
  if (!name) return false;
  const value = env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
