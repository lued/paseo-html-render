/**
 * Plugin identity contract shared by the client and the daemon.
 *
 * Frozen contracts: the manifest id `html-render`, the `paseo-html-render:v1:`
 * marker, the `paseo-html-card` renderer kind and the
 * `~/.paseo/plugin-data/html-render` storage root must never change here.
 * Changing the marker would orphan every persisted render row.
 *
 * Versioned contracts: the MCP server key and the transport file names are
 * suffixed so a 2.x agent cannot bind them by accident. Paseo 0.14 requires the
 * daemon to reject `PluginSessionOpenRequest.mcpServers` that collide with an
 * agent's saved server map, and the plugin cannot read or rewrite that saved map,
 * so a legacy `html-render` entry would fail every open of a 2.x agent. The new
 * key coexists with it; the old adapter at `mcp-adapter-v1.mjs` is replaced by a
 * tombstone that refuses to connect to the 3.x bridge.
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
  /** MCP server key contributed at `agent.session_open`. */
  readonly mcpServerName: string;
  /** Persisted tool-result marker. */
  readonly markerPrefix: string;
  /** Timeline renderer kind. */
  readonly rendererKind: string;
  /**
   * Renderer kind for the card carried on the final reply.
   *
   * Retained for compatibility, but no longer emitted: replacing the reply with
   * a plugin row removes the `assistant_message` anchor `collapseTurns` looks for,
   * which unfolds the whole turn instead of hiding only its tools.
   */
  readonly messageRendererKind: string;
  /**
   * Renderer kind for the response card appended after the native reply.
   *
   * This row is persisted by the daemon (`agent.timeline.append`), not projected
   * from another row, so it sits after the last assistant message: the reply
   * keeps its fold anchor and this card is outside the folded range.
   */
  readonly responseRendererKind: string;
  /** Timeline renderer/report-card schema version. */
  readonly reportVersion: number;
  /** Host screen id used for the report screen. */
  readonly screenId: string;
  /** Fallback screen title when the host supplies no title param. */
  readonly screenTitle: string;
  /** Timeline transformer id. */
  readonly transformerId: string;
  /** Transformer id for assistant replies that carry a report link. */
  readonly messageTransformerId: string;
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
  /** File name of the retired 2.x adapter, rewritten as a tombstone. */
  readonly legacyAdapterFileName: string;
  /** Version the generated adapter reports and sends with every bridge call. */
  readonly adapterVersion: string;
  /** File name of the private unix socket inside the private data root. */
  readonly socketFileName: string;
}

/**
 * Shared bridge credential file inside the private data root (0600 in a 0700
 * directory). Adapters reread it per call to survive plugin reload/rotation.
 * Session-open injection is launch-only, so unlike 2.x the credential is never
 * persisted in saved agent configuration.
 */
export const BRIDGE_TOKEN_FILE = "bridge-v3.token";

export const PRODUCTION_IDENTITY: PluginIdentity = Object.freeze({
  pluginId: "html-render",
  pluginName: "HTML Render",
  logTag: "html-render",
  mcpServerName: "html-render-v3",
  markerPrefix: "paseo-html-render:v1:",
  rendererKind: "html-report-card",
  messageRendererKind: "html-report-message",
  responseRendererKind: "html-report-response",
  reportVersion: 1,
  screenId: "report",
  screenTitle: "HTML report",
  transformerId: "html-report-card",
  messageTransformerId: "html-report-message",
  dataDirName: "html-render",
  dataDirEnv: "PASEO_HTML_RENDER_DATA_DIR",
  archiveCleanupEnv: "PASEO_HTML_RENDER_PURGE_ON_ARCHIVE",
  bridgeEnv: Object.freeze({
    bridge: "PASEO_HTML_RENDER_BRIDGE",
    token: "PASEO_HTML_RENDER_TOKEN",
    cwd: "PASEO_HTML_RENDER_CWD",
  }),
  adapterFileName: "mcp-adapter-v3.mjs",
  legacyAdapterFileName: "mcp-adapter-v1.mjs",
  adapterVersion: "3.0.0",
  socketFileName: "bridge-v3.sock",
});
