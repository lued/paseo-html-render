import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { PluginIdentity } from "../shared/identity.ts";
import { SELECTED_IDENTITY } from "../shared/selected-identity.ts";

/**
 * Paseo exports PASEO_HOME to the daemon (and the daemon inherits it into plugin
 * subprocesses). The Shared Browser plugin keeps its runtime there too, so this
 * plugin puts only its own private artifacts under the same parent:
 *
 *   $PASEO_HOME/plugin-data/html-render/{artifacts,bridge.sock,bridge.token}
 *
 * `bridge.token` is a durable per-install credential, so plugin reloads do not
 * invalidate MCP adapters already injected into agents. PASEO_HTML_RENDER_DATA_DIR
 * overrides the root for isolated tests.
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
