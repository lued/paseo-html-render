import { AbortController, type AbortSignal } from "./cancellation.ts";
import { timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer, type Socket } from "node:net";
import { join } from "node:path";
import { BRIDGE_MAX_MESSAGE_BYTES } from "../shared/limits.ts";
import type { PluginIdentity } from "../shared/identity.ts";
import { SELECTED_IDENTITY } from "../shared/selected-identity.ts";
import { buildAdapterSource } from "./adapter-source.ts";
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
  adapterPath: string;
  close(): Promise<void>;
}

interface BridgeRequest {
  token?: unknown;
  tool?: unknown;
  cwd?: unknown;
  input?: unknown;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

/**
 * Local bridge between the per-agent MCP adapter process and the plugin daemon.
 * Authority comes from the adapter's cwd configured by the daemon at injection
 * time; a request can never name its own workspace, and the token never leaves
 * the daemon or the spawned process environment.
 */
export async function startBridge(options: BridgeOptions, token: string): Promise<Bridge> {
  const identity = options.identity ?? SELECTED_IDENTITY;
  await fs.mkdir(options.dataRoot, { recursive: true, mode: 0o700 });
  await fs.chmod(options.dataRoot, 0o700).catch(() => {});
  const socketPath = join(options.dataRoot, identity.socketFileName);
  const adapterPath = join(options.dataRoot, identity.adapterFileName);
  await fs.rm(socketPath, { force: true });
  await fs.writeFile(adapterPath, buildAdapterSource(identity), { mode: 0o600 });

  const sockets = new Set<Socket>();
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
    if (typeof request.token !== "string" || !safeEqual(request.token, token)) {
      options.onLog?.("Rejected bridge request with an invalid token");
      return { ok: false, error: { code: "denied", message: "Invalid bridge token" } };
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
      const context = {
        workspaceId: workspace.workspaceId,
        cwd: request.cwd,
        workspaceRoot: workspace.root,
        signal,
      };
      const result =
        request.tool === "html_preview"
          ? await options.tools.preview(request.input, context)
          : await options.tools.publish(request.input, context);
      return { ok: true, result };
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
    token,
    adapterPath,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await fs.rm(socketPath, { force: true });
    },
  };
}
