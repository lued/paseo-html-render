import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import type { PluginIdentity } from "../shared/identity.ts";
import { SELECTED_IDENTITY } from "../shared/selected-identity.ts";
import {
  readArtifactRpc,
  readAssetRpc,
  readOriginalArtifactRpc,
  readReportRpc,
} from "../shared/protocol.ts";
import type { Authority } from "./authority.ts";
import { createAuthority } from "./authority.ts";
import { ArtifactError, ArtifactStore, pngDimensions, type ArtifactRequester } from "./artifacts.ts";
import { startBridge, type Bridge } from "./bridge.ts";
import { archiveCleanupEnabled, resolveDataRoot } from "./paths.ts";
import { createRenderer } from "./renderer.ts";
import { createHtmlTools } from "./tools.ts";
import { createTurnGuard, guardKey, maxCardsPerTurn } from "./turn-guard.ts";

/** Host-provided API type; the SDK is externalized by the daemon compiler. */
type PaseoApi = PluginHandlerContext["paseo"];

export interface ContributeOptions {
  /**
   * Identity override for tests. Paseo always calls the entry with no options,
   * so the selected identity from `shared/selected-identity.ts` applies.
   */
  identity?: PluginIdentity;
}

/**
 * Daemon entry: private artifact store, bounded inert renderer, local bridge for
 * the MCP adapter, and MCP injection for agents created after this plugin loads.
 * Existing sessions are never retrofitted and no configuration files are edited.
 *
 * Every agent created in a workspace gets the MCP server injected; artifact reads
 * are authorized against that agent's real workspace.
 */
export default function contribute(server: PluginServerContext, options: ContributeOptions = {}) {
  const identity = options.identity ?? SELECTED_IDENTITY;
  const log = (message: string) => console.error(`[${identity.logTag}] ${message}`);
  const dataRoot = resolveDataRoot(process.env, identity);
  const store = new ArtifactStore(dataRoot);
  const renderer = createRenderer({
    executablePath: process.env.PASEO_HTML_RENDER_CHROMIUM?.trim() || undefined,
  });
  // One guard per plugin instance: it owns the in-memory turn and duplicate
  // state for every agent this daemon serves.
  const guard = createTurnGuard({ maxCardsPerTurn: maxCardsPerTurn(process.env) });
  const tools = createHtmlTools({ renderer, store, guard });

  let authority: Authority | null = null;
  const getAuthority = (paseo: PaseoApi): Authority => {
    authority ??= createAuthority(paseo);
    return authority;
  };
  const warmAuthority = async (paseo: PaseoApi, agentId: string, cwd?: string | null) => {
    const current = getAuthority(paseo);
    await Promise.allSettled([
      current.workspaceForAgentOwnership(agentId),
      cwd ? current.workspaceForCwd(cwd) : Promise.resolve(null),
    ]);
  };
  // The bridge starts before any handler can run; a request that arrives early
  // waits for the socket instead of being served without authority checks.
  const bridgePromise: Promise<Bridge> = startBridge(
    {
      dataRoot,
      tools,
      authority: {
        workspaceForCwd(cwd) {
          if (!authority) return Promise.resolve(null);
          return authority.workspaceForCwd(cwd);
        },
        workspaceForAgent(agentId) {
          if (!authority) return Promise.resolve(null);
          return authority.workspaceForAgent(agentId);
        },
        workspaceForAgentOwnership(agentId) {
          if (!authority) return Promise.resolve(null);
          return authority.workspaceForAgentOwnership(agentId);
        },
      },
      identity,
      onLog: log,
    },
  );
  bridgePromise.catch((error: unknown) => {
    log(`bridge failed to start: ${error instanceof Error ? error.message : String(error)}`);
  });

  const requireWorkspace = async (paseo: PaseoApi, agentId: string): Promise<ArtifactRequester> => {
    const workspace = await getAuthority(paseo).workspaceForAgentOwnership(agentId);
    if (!workspace) throw new Error("This report is not available for that agent");
    return { workspaceIds: workspace.workspaceIds, root: workspace.root };
  };

  server.handle(readArtifactRpc, async ({ artifactId, agentId }, { paseo }) => {
    const requester = await requireWorkspace(paseo, agentId);
    try {
      const { manifest, png } = await store.readPreview(artifactId, requester);
      const durable = await store.readCard(artifactId, requester);
      const hasReport = manifest.report !== undefined || manifest.reportBytes !== undefined;
      const report = hasReport
        ? (await store.readReport(artifactId, requester)).report
        : null;
      const interactivePath = await store.interactivePath(artifactId, requester);
      return {
        artifactId: manifest.artifactId,
        title: manifest.title,
        summary: manifest.summary,
        width: manifest.width,
        height: manifest.height,
        createdAt: manifest.createdAt,
        preview: { mimeType: "image/png" as const, base64: png.toString("base64") },
        ...manifest.measuredHeight === undefined ? {} : { measuredHeight: manifest.measuredHeight },
        ...manifest.heights === undefined ? {} : { heights: manifest.heights },
        hasReport,
        report,
        card: durable.card,
        ...durable.card.renderMode === undefined ? {} : { renderMode: durable.card.renderMode },
        ...interactivePath === null ? {} : { interactivePath },
        ...manifest.themePreview === undefined ? {} : { themePreview: manifest.themePreview },
        ...manifest.graph === undefined ? {} : { graph: manifest.graph },
        assets: {
          previewLight: manifest.themePreview?.light === true,
          graphDark: manifest.graph?.previewDark === true,
          graphLight: manifest.graph?.previewLight === true,
        },
      };
    } catch (error) {
      if (error instanceof ArtifactError) throw new Error(error.message);
      throw new Error("The stored report could not be read");
    }
  });

  server.handle(readOriginalArtifactRpc, async ({ artifactId, agentId }, { paseo }) => {
    const requester = await requireWorkspace(paseo, agentId);
    try {
      const { manifest, html } = await store.readOriginal(artifactId, requester);
      const interactive = await store.readInteractive(artifactId, requester);
      return {
        artifactId: manifest.artifactId,
        title: manifest.title,
        html,
        ...interactive === null ? {} : { interactiveHtml: interactive.html, interactivePath: interactive.path },
      };
    } catch (error) {
      if (error instanceof ArtifactError) throw new Error(error.message);
      throw new Error("The stored report could not be read");
    }
  });

  server.handle(readReportRpc, async ({ artifactId, agentId }, { paseo }) => {
    const requester = await requireWorkspace(paseo, agentId);
    try {
      const { manifest, report } = await store.readReport(artifactId, requester);
      return { artifactId: manifest.artifactId, report };
    } catch (error) {
      if (error instanceof ArtifactError) throw new Error(error.message);
      throw new Error("The stored report could not be read");
    }
  });

  server.handle(readAssetRpc, async ({ artifactId, agentId, asset }, { paseo }) => {
    const requester = await requireWorkspace(paseo, agentId);
    try {
      const { manifest, png, asset: name } = await store.readAsset(artifactId, requester, asset);
      // Report actual PNG dimensions when readable; the requested frame height
      // stays separate in the manifest and the card reference.
      const dimensions = pngDimensions(png) ??
        (name === "preview" && manifest.width > 0
          ? { width: manifest.width, height: manifest.height }
          : undefined);
      return {
        artifactId: manifest.artifactId,
        asset: name,
        mimeType: "image/png" as const,
        base64: png.toString("base64"),
        byteLength: png.byteLength,
        ...dimensions === undefined ? {} : dimensions,
      };
    } catch (error) {
      if (error instanceof ArtifactError) throw new Error(error.message);
      throw new Error("The stored report asset could not be read");
    }
  });

  // A resumed agent may call a tool before any client RPC has run. Warm both
  // authority paths from the public session-open hook; the request is untouched.
  server.before("agent.session_open", async ({ request }, context) => {
    await warmAuthority(context.paseo, request.agentId, request.cwd);
  });

  // A plugin reload can land while an agent process is already running, after
  // its session-open hook has passed. Warm authority again at the start of every
  // turn so the next tool call does not fail closed with "not part of an open
  // Paseo workspace". The same event is the only place a counted turn begins.
  server.on("agent.turn_started", async ({ agent, turnId }, context) => {
    const key = guardKey(agent.id);
    if (key) guard.beginTurn(key, turnId);
    await warmAuthority(context.paseo, agent.id, agent.cwd);
  });

  // Closing the turn keeps the remembered publishes, so an identical card is
  // still refused in a later turn; only the per-turn count resets.
  server.on("agent.turn_ended", ({ agent, turnId }) => {
    const key = guardKey(agent.id);
    if (key) guard.endTurn(key, turnId);
  });

  // Non-destructive by default: only an explicit `PASEO_HTML_RENDER_PURGE_ON_ARCHIVE`
  // opt-in removes an archived workspace's artifacts.
  server.on("workspace.archived", async (event) => {
    if (!archiveCleanupEnabled(process.env, identity)) return;
    try {
      const result = await store.purgeWorkspace(event.workspace.id);
      log(
        `archived workspace ${event.workspace.id}: removed ${result.artifactIds.length} artifacts (${result.bytes} bytes)`,
      );
    } catch (error) {
      log(`workspace archive cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  server.before("agent.create", async ({ request }, context) => {
    const bridge = await bridgePromise.catch(() => null);
    const cwd = request.config.cwd;
    if (!bridge || typeof cwd !== "string" || !cwd) return;
    // Establish workspace authority now: an injected agent may call a tool
    // before any client-side RPC has run.
    const authority = getAuthority(context.paseo);
    // Resolve the workspace now so a later artifact read is already authorizeable.
    await authority.workspaceForCwd(cwd).catch(() => null);
    if (request.config.mcpServers?.[identity.mcpServerName]) return;
    return {
      ...request,
      config: {
        ...request.config,
        mcpServers: {
          ...request.config.mcpServers,
          [identity.mcpServerName]: {
            type: "stdio",
            // Load the tools with the session instead of behind codemode, so the
            // model sees html_render as a first-class choice.
            alwaysLoad: true,
            command: process.execPath,
            args: [bridge.adapterPath],
            env: {
              [identity.bridgeEnv.bridge]: bridge.socketPath,
              [identity.bridgeEnv.token]: bridge.token,
              [identity.bridgeEnv.cwd]: cwd,
              // A desktop-managed daemon has the Electron app as process.execPath.
              // Without this the adapter starts the GUI instead of Node and exits,
              // closing MCP stdio; Node ignores the variable.
              ELECTRON_RUN_AS_NODE: "1",
            },
          },
        },
      },
    };
  });

  return async () => {
    const bridge = await bridgePromise.catch(() => null);
    await bridge?.close().catch(() => {});
    await renderer.close().catch(() => {});
  };
}
