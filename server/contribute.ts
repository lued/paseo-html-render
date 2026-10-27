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
 * Label that opts a single agent out of the injected server. Frozen spelling:
 * `html-render/disabled: "true"`. Any other value keeps the default behavior.
 */
const DISABLED_LABEL = "html-render/disabled";

/**
 * A session open must never wait on bridge startup. The bridge starts with the
 * plugin and is normally ready before the first hook; this is a guard against a
 * stuck filesystem, not a normal wait.
 */
const BRIDGE_INJECTION_TIMEOUT_MS = 5_000;

/** Log-safe value: no spaces or quotes a parser could misread, bounded length. */
function logValue(value: unknown, fallback: string, max = 64): string {
  const text = typeof value === "string" ? value.trim() : "";
  const safe = text.replace(/[^A-Za-z0-9._:@-]/g, "_").slice(0, max);
  return safe || fallback;
}

export interface SessionOpenEvidence {
  readonly result: "injected" | "skipped";
  readonly skip?: "history" | "label" | "already-present" | "bridge-unavailable";
  readonly agent: string;
  readonly provider: string;
  readonly reason: string;
  readonly purpose: string;
  readonly transport: "stdio" | "none";
  readonly alwaysLoad: boolean;
  readonly server: string;
}

/**
 * One sanitized line per session open. This is the only injection evidence 3.0
 * can produce: the server is launch-only and never persisted, so the daemon's
 * `~/.paseo` configuration cannot show it. The fields are the agent id, provider,
 * session reason, purpose, transport, alwaysLoad flag and server key.
 *
 * The bridge token, the launch environment and the workspace path are never
 * included, so the line is safe to paste into a bug report.
 */
export function formatSessionOpenEvidence(evidence: SessionOpenEvidence): string {
  const parts = [
    "session-open",
    `result=${evidence.result}`,
    ...evidence.skip === undefined ? [] : [`skip=${evidence.skip}`],
    `server=${logValue(evidence.server, "unknown")}`,
    `transport=${evidence.transport}`,
    `alwaysLoad=${evidence.alwaysLoad}`,
    `agent=${logValue(evidence.agent, "unattributed")}`,
    `provider=${logValue(evidence.provider, "unknown")}`,
    `reason=${logValue(evidence.reason, "unknown")}`,
    `purpose=${logValue(evidence.purpose, "unknown")}`,
  ];
  return parts.join(" ");
}

/**
 * Daemon entry: private artifact store, bounded inert renderer, local bridge for
 * the MCP adapter, and launch-only MCP injection at `agent.session_open`.
 *
 * No saved configuration is ever written. Paseo 0.14 runs the session-open hook on
 * create, resume, refresh and import, so every interactive agent derives the
 * server from the hook instead of from a record that a reload cannot update. The
 * server key is versioned (`html-render-v3`) because a 2.x agent's saved
 * `html-render` entry is invisible to the plugin and would make every open of that
 * agent fail with a collision.
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

  /** Bridge for injection, bounded: a stuck start must not hold a session open. */
  const bridgeForInjection = async (): Promise<Bridge | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), BRIDGE_INJECTION_TIMEOUT_MS);
      timer.unref?.();
    });
    try {
      return await Promise.race([bridgePromise.catch(() => null), deadline]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

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

  // The one place this plugin contributes an MCP server. `agent.session_open`
  // also runs on resume, refresh and import, so a reload reaches idle agents on
  // their next prompt and no agent has to be recreated.
  server.before("agent.session_open", async ({ request }, context) => {
    // A resumed agent may call a tool before any client RPC has run. Warm both
    // authority paths; a warm failure must never fail the open.
    await warmAuthority(context.paseo, request.agentId, request.cwd).catch(() => {});

    const evidence = {
      agent: request.agentId,
      provider: request.provider,
      reason: request.reason,
      purpose: request.purpose,
      server: identity.mcpServerName,
    };
    // A history open attaches no tools at all, so there is nothing to inject.
    if (request.purpose !== "interactive") {
      log(formatSessionOpenEvidence({
        ...evidence,
        result: "skipped",
        skip: "history",
        transport: "none",
        alwaysLoad: false,
      }));
      return;
    }
    if (request.labels?.[DISABLED_LABEL]?.trim().toLowerCase() === "true") {
      log(formatSessionOpenEvidence({
        ...evidence,
        result: "skipped",
        skip: "label",
        transport: "none",
        alwaysLoad: false,
      }));
      return;
    }
    const bridge = await bridgeForInjection();
    if (!bridge) {
      log(formatSessionOpenEvidence({
        ...evidence,
        result: "skipped",
        skip: "bridge-unavailable",
        transport: "none",
        alwaysLoad: false,
      }));
      return;
    }
    // The daemon hands each plugin an empty map, so this only guards against a
    // future host that merges contributions. Never overwrite a present value.
    if (request.mcpServers?.[identity.mcpServerName]) {
      log(formatSessionOpenEvidence({
        ...evidence,
        result: "skipped",
        skip: "already-present",
        transport: "stdio",
        alwaysLoad: false,
      }));
      return;
    }
    log(formatSessionOpenEvidence({
      ...evidence,
      result: "injected",
      transport: "stdio",
      alwaysLoad: true,
    }));
    // Immutable fields and every other server are returned untouched: the request
    // object is never mutated, and only `mcpServers` is added to.
    return {
      ...request,
      mcpServers: {
        ...request.mcpServers,
        [identity.mcpServerName]: {
          type: "stdio",
          // Load the tools with the session instead of behind a lazy catalog. The
          // Claude provider honors this flag; the others load an injected server
          // regardless, so this is never the reason a tool is missing.
          alwaysLoad: true,
          command: process.execPath,
          args: [bridge.adapterPath],
          env: {
            [identity.bridgeEnv.bridge]: bridge.socketPath,
            [identity.bridgeEnv.token]: bridge.token,
            [identity.bridgeEnv.cwd]: request.cwd,
            // A desktop-managed daemon has the Electron app as process.execPath.
            // Without this the adapter starts the GUI instead of Node and exits,
            // closing MCP stdio; Node ignores the variable.
            ELECTRON_RUN_AS_NODE: "1",
          },
        },
      },
    };
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

  return async () => {
    const bridge = await bridgePromise.catch(() => null);
    await bridge?.close().catch(() => {});
    await renderer.close().catch(() => {});
  };
}
