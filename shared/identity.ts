/**
 * Plugin identity contract shared by the client and the daemon.
 *
 * These values are frozen contracts: the manifest id `html-render`, the MCP
 * server name, the `paseo-html-render:v1:` marker and the
 * `~/.paseo/plugin-data/html-render` storage root must never change here.
 * Changing the marker would orphan every persisted render row.
 *
 * This module is client-safe: no node builtins, no absolute paths, no tokens.
 */

export interface BridgeEnvironmentNames {
  /** Environment variable carrying the private bridge socket path. */
  readonly bridge: string;
  /** Environment variable carrying the per-process bridge token. */
  readonly token: string;
  /** Environment variable carrying the adapter caller cwd. */
  readonly cwd: string;
}

export interface PluginIdentity {
  /** Manifest id and entry-point identity. */
  readonly pluginId: string;
  /** Manifest display name. */
  readonly pluginName: string;
  /** Log tag, rendered as `[<logTag>]`. */
  readonly logTag: string;
  /** MCP server key injected into agent configs. */
  readonly mcpServerName: string;
  /** Persisted tool-result marker. */
  readonly markerPrefix: string;
  /** Timeline renderer kind. */
  readonly rendererKind: string;
  /** Timeline renderer/report-card schema version. */
  readonly reportVersion: number;
  /** Host screen id used for the report screen. */
  readonly screenId: string;
  /** Fallback screen title when the host supplies no title param. */
  readonly screenTitle: string;
  /** Timeline transformer id. */
  readonly transformerId: string;
  /** Directory component below `$PASEO_HOME/plugin-data`. */
  readonly dataDirName: string;
  /** Environment override for the private data root, or null to ignore it. */
  readonly dataDirEnv: string | null;
  /** Environment opt-in for archive cleanup, or null to disable the hook. */
  readonly archiveCleanupEnv: string | null;
  /** Adapter environment variable names. */
  readonly bridgeEnv: BridgeEnvironmentNames;
  /** File name of the generated stdio adapter inside the private data root. */
  readonly adapterFileName: string;
  /** Version the generated adapter reports and sends with every bridge call. */
  readonly adapterVersion: string;
  /** File name of the private unix socket inside the private data root. */
  readonly socketFileName: string;
}

/**
 * Persisted bridge credential inside the private data root. Every plugin process
 * for one identity shares this file, so a reload does not invalidate MCP
 * adapters that were injected into existing agents. The file is 0600 and the
 * containing directory is 0700.
 */
export const BRIDGE_TOKEN_FILE = "bridge.token";

export const PRODUCTION_IDENTITY: PluginIdentity = Object.freeze({
  pluginId: "html-render",
  pluginName: "HTML Render",
  logTag: "html-render",
  mcpServerName: "html-render",
  markerPrefix: "paseo-html-render:v1:",
  rendererKind: "html-report-card",
  reportVersion: 1,
  screenId: "report",
  screenTitle: "HTML report",
  transformerId: "html-report-card",
  dataDirName: "html-render",
  dataDirEnv: "PASEO_HTML_RENDER_DATA_DIR",
  archiveCleanupEnv: "PASEO_HTML_RENDER_PURGE_ON_ARCHIVE",
  bridgeEnv: Object.freeze({
    bridge: "PASEO_HTML_RENDER_BRIDGE",
    token: "PASEO_HTML_RENDER_TOKEN",
    cwd: "PASEO_HTML_RENDER_CWD",
  }),
  adapterFileName: "mcp-adapter-v1.mjs",
  adapterVersion: "2.1.0",
  socketFileName: "bridge.sock",
});
