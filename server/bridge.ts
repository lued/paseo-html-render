import { AbortController, type AbortSignal } from "./cancellation.ts";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer, type Socket } from "node:net";
import { join } from "node:path";
import { BRIDGE_TOKEN_FILE, type PluginIdentity } from "../shared/identity.ts";
import { BRIDGE_MAX_MESSAGE_BYTES } from "../shared/limits.ts";
import { SELECTED_IDENTITY } from "../shared/selected-identity.ts";
import { buildAdapterSource, buildLegacyAdapterTombstone } from "./adapter-source.ts";
import type { Authority } from "./authority.ts";
import type { HtmlTools } from "./tools.ts";
import { ToolError } from "./tools.ts";

/**
 * One publish can include a static capture, three measurement widths, a light
 * preview, and two graph captures. `shared/limits.ts` raises the bridge message
 * budget to 8 MiB for the base64 preview plus that work; this timeout is the
 * matching explicit ceiling and stays under 90 seconds end to end.
 */
const SOCKET_TIMEOUT_MS = 85_000;

export interface BridgeOptions {
  dataRoot: string;
  tools: HtmlTools;
  authority: Authority;
  onLog?: (message: string) => void;
  /**
   * Identity of the build that owns this bridge. The QA canary uses its own
   * socket/adapter file names and adapter environment variables, so a production
   * adapter can never connect to it (and vice versa). Defaults to the historical
   * production contract.
   */
  identity?: PluginIdentity;
}

export interface Bridge {
  socketPath: string;
  token: string;
  tokenPath: string;
  adapterPath: string;
  /** Version embedded in the adapter source written for this bridge. */
  adapterVersion: string;
  /** SHA-256 of that exact source, for freshness evidence and tests. */
  adapterHash: string;
  close(): Promise<void>;
}

interface BridgeRequest {
  token?: unknown;
  tool?: unknown;
  cwd?: unknown;
  /** Optional so an adapter that predates agentId forwarding still works. */
  agentId?: unknown;
  input?: unknown;
  adapterVersion?: unknown;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

async function readBridgeToken(path: string): Promise<string | null> {
  try {
    const value = (await fs.readFile(path, "utf8")).trim();
    return TOKEN_PATTERN.test(value) ? value : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeBridgeToken(path: string, token: string): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await fs.writeFile(temporary, `${token}\n`, { mode: 0o600 });
  await fs.chmod(temporary, 0o600).catch(() => {});
  await fs.rename(temporary, path);
}

/**
 * Writes the generated adapter atomically. An agent can spawn the adapter at
 * any moment during a plugin reload, so it must never observe a partial file.
 * Unchanged source keeps its inode, but the mode is still enforced.
 */
async function writeAdapterSource(path: string, source: string): Promise<void> {
  const existing = await fs.readFile(path, "utf8").catch(() => null);
  if (existing === source) {
    await fs.chmod(path, 0o600).catch(() => {});
    return;
  }
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temporary, source, { mode: 0o600 });
    await fs.chmod(temporary, 0o600).catch(() => {});
    await fs.rename(temporary, path);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

/**
 * Reads the shared token or creates it exactly once. `wx` makes concurrent
 * plugin starts agree on a single credential; a malformed existing file is
 * replaced rather than leaving every adapter permanently locked out.
 */
export async function loadOrCreateBridgeToken(path: string): Promise<string> {
  const existing = await readBridgeToken(path);
  if (existing) return existing;
  const token = randomBytes(32).toString("hex");
  try {
    const handle = await fs.open(path, "wx", 0o600);
    try {
      await handle.writeFile(`${token}\n`, "utf8");
    } finally {
      await handle.close();
    }
    return token;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const raced = await readBridgeToken(path);
    if (raced) return raced;
    await writeBridgeToken(path, token);
    return token;
  }
}

/**
 * Local bridge between the per-agent MCP adapter process and the plugin daemon.
 * Authority comes from the adapter's cwd, which `agent.session_open` sets from
 * the session it is opening; a request can never name its own workspace.
 *
 * The token remains in an owner-only file inside the private data root, so an
 * adapter in a busy session can continue across plugin reloads. Session-open
 * injection is launch-only: the credential never enters saved agent config.
 *
 * An explicit token is accepted for tests and deliberate rotation. The effective
 * token is always written to the shared file, which adapters reread per call.
 */
export async function startBridge(options: BridgeOptions, token?: string): Promise<Bridge> {
  const identity = options.identity ?? SELECTED_IDENTITY;
  await fs.mkdir(options.dataRoot, { recursive: true, mode: 0o700 });
  await fs.chmod(options.dataRoot, 0o700).catch(() => {});
  const socketPath = join(options.dataRoot, identity.socketFileName);
  const adapterPath = join(options.dataRoot, identity.adapterFileName);
  const legacyAdapterPath = join(options.dataRoot, identity.legacyAdapterFileName);
  const tokenPath = join(options.dataRoot, BRIDGE_TOKEN_FILE);
  const bridgeToken = token ?? await loadOrCreateBridgeToken(tokenPath);
  if (token !== undefined) await writeBridgeToken(tokenPath, bridgeToken);
  await fs.chmod(tokenPath, 0o600).catch(() => {});
  await fs.rm(socketPath, { force: true });
  const adapterSource = buildAdapterSource(identity);
  const adapterHash = createHash("sha256").update(adapterSource).digest("hex");
  await writeAdapterSource(adapterPath, adapterSource);
  // The retired 2.x adapter is replaced by a tombstone: a legacy agent record that
  // still points at it must never reach this bridge with the old protocol.
  await writeAdapterSource(legacyAdapterPath, buildLegacyAdapterTombstone(identity));

  const sockets = new Set<Socket>();
  const staleAdaptersLogged = new Set<string>();
  const server = createServer((socket: Socket) => {
    sockets.add(socket);
    const controller = new AbortController();
    let buffer = "";
    let done = false;
    let started = false;
    socket.setEncoding("utf8");
    const finish = (payload: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(deadline);
      if (!socket.destroyed) socket.end(JSON.stringify(payload));
    };
    // Absolute budget, not just socket idleness. Cancellation reaches the page
    // targets and the store's pre-commit checks before any artifact is published.
    const deadline = setTimeout(() => {
      controller.abort(new DOMException("Tool request exceeded 60 seconds", "TimeoutError"));
      finish({ ok: false, error: { code: "timeout", message: "Tool request exceeded 60 seconds" } });
      socket.destroy();
    }, 60_000);
    deadline.unref();
    socket.on("close", () => {
      sockets.delete(socket);
      clearTimeout(deadline);
      if (!done) controller.abort(new DOMException("Tool caller disconnected", "AbortError"));
    });
    socket.setTimeout(SOCKET_TIMEOUT_MS, () => {
      controller.abort(new DOMException("Bridge request timed out", "TimeoutError"));
      finish({ ok: false, error: { code: "timeout", message: "Bridge request timed out" } });
      socket.destroy();
    });
    socket.on("data", (chunk) => {
      if (done || started) return;
      buffer += chunk;
      if (Buffer.byteLength(buffer, "utf8") > BRIDGE_MAX_MESSAGE_BYTES) {
        finish({ ok: false, error: { code: "invalid_input", message: "Bridge request is too large" } });
        socket.destroy();
        return;
      }
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      const line = buffer.slice(0, newline);
      buffer = "";
      started = true;
      void handleLine(line, controller.signal)
        .then(finish)
        .catch(() => finish({ ok: false, error: { code: "render_failed", message: "Bridge request failed" } }));
    });
    socket.on("error", () => {});
  });

  const handleLine = async (line: string, signal: AbortSignal): Promise<unknown> => {
    let request: BridgeRequest;
    try {
      request = JSON.parse(line) as BridgeRequest;
    } catch {
      return { ok: false, error: { code: "invalid_input", message: "Malformed bridge request" } };
    }
    if (typeof request.token !== "string" || !safeEqual(request.token, bridgeToken)) {
      options.onLog?.("Rejected bridge request with an invalid token");
      return { ok: false, error: { code: "denied", message: "Invalid bridge token" } };
    }
    const runningAdapterVersion =
      typeof request.adapterVersion === "string" ? request.adapterVersion : null;
    const adapterStale = runningAdapterVersion !== identity.adapterVersion;
    if (adapterStale) {
      const key = runningAdapterVersion ?? "unknown";
      if (!staleAdaptersLogged.has(key)) {
        staleAdaptersLogged.add(key);
        options.onLog?.(
          `MCP adapter ${key} is stale; this build is ${identity.adapterVersion}. ` +
            "The request is served, and the tool result asks for a reconnect.",
        );
      }
    }
    if (request.tool !== "html_preview" && request.tool !== "html_render") {
      return { ok: false, error: { code: "invalid_input", message: "Unknown tool" } };
    }
    if (typeof request.cwd !== "string") {
      return { ok: false, error: { code: "invalid_input", message: "Missing caller directory" } };
    }
    let workspace: Awaited<ReturnType<Authority["workspaceForCwd"]>> = null;
    try {
      workspace = await options.authority.workspaceForCwd(request.cwd);
    } catch {
      workspace = null;
    }
    if (!workspace) {
      return {
        ok: false,
        error: {
          code: "denied",
          message: "This directory is not part of an open Paseo workspace",
        },
      };
    }
    try {
      // Only a non-empty string is trusted. Anything else is an unattributed
      // request: the tools report a degraded guard instead of guessing an
      // agent from a directory that several agents may share.
      const agentId =
        typeof request.agentId === "string" && request.agentId.trim()
          ? request.agentId.trim()
          : undefined;
      const context = {
        workspaceId: workspace.workspaceId,
        cwd: request.cwd,
        workspaceRoot: workspace.root,
        signal,
        ...agentId === undefined ? {} : { agentId },
      };
      const result =
        request.tool === "html_preview"
          ? await options.tools.preview(request.input, context)
          : await options.tools.publish(request.input, context);
      // Freshness is explicit, never fatal: an adapter injected before a
      // reload keeps working and tells the model to reconnect for new source.
      return {
        ok: true,
        result: adapterStale
          ? {
              ...result,
              adapterStale: true,
              adapterVersion: identity.adapterVersion,
              runningAdapterVersion,
            }
          : result,
      };
    } catch (error) {
      if (error instanceof ToolError) {
        return { ok: false, error: { code: error.code, message: error.message } };
      }
      return { ok: false, error: { code: "render_failed", message: "HTML rendering failed" } };
    }
  };

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
  await fs.chmod(socketPath, 0o600);

  return {
    socketPath,
    token: bridgeToken,
    tokenPath,
    adapterPath,
    adapterVersion: identity.adapterVersion,
    adapterHash,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await fs.rm(socketPath, { force: true });
    },
  };
}
