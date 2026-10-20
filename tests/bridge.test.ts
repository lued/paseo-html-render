import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ArtifactStore } from "../server/artifacts.ts";
import type { Authority } from "../server/authority.ts";
import { startBridge, type Bridge } from "../server/bridge.ts";
import { createRenderer } from "../server/renderer.ts";
import { createHtmlTools } from "../server/tools.ts";
import { decodeReportReference } from "../shared/recognize.ts";

const WORKSPACE_ID = "wks_test";
const OUTSIDE = await fs.mkdtemp(join(tmpdir(), "html-render-outside-"));
const workspace = await fs.mkdtemp(join(tmpdir(), "html-render-ws-"));
const dataRoot = await fs.mkdtemp(join(tmpdir(), "hr-"));
const store = new ArtifactStore(dataRoot);
const renderer = createRenderer({ timeoutMs: 10_000 });
const authority: Authority = {
  async workspaceForCwd(cwd) {
    return cwd === workspace ? { workspaceId: WORKSPACE_ID, root: workspace } : null;
  },
  async workspaceForAgent() {
    return WORKSPACE_ID;
  },
};
const tools = createHtmlTools({ renderer, store });

class Adapter {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

  constructor(env: Record<string, string>) {
    this.child = spawn(process.execPath, [join(dataRoot, "mcp-adapter-v1.mjs")], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.onData(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(`[adapter] ${chunk.toString("utf8")}`);
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) {
        const message = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown };
        const entry = message.id === undefined ? undefined : this.pending.get(message.id);
        if (entry && message.id !== undefined) {
          this.pending.delete(message.id);
          if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
          else entry.resolve(message.result);
        }
      }
      newline = this.buffer.indexOf("\n");
    }
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`adapter did not answer ${method}`));
      }, 40_000);
      timer.unref?.();
    });
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return promise;
  }

  notify(method: string): void {
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
  }

  close(): void {
    this.child.kill();
  }
}

let bridge: Bridge;

test.before(async () => {
  bridge = await startBridge(
    { dataRoot, tools, authority, onLog: (message) => process.stderr.write(`[bridge] ${message}\n`) },
    randomBytes(32).toString("hex"),
  );
});

test.after(async () => {
  await bridge.close();
  await renderer.close();
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.rm(OUTSIDE, { recursive: true, force: true });
  await fs.rm(dataRoot, { recursive: true, force: true });
});

function adapter(): Adapter {
  return new Adapter({
    PASEO_HTML_RENDER_BRIDGE: bridge.socketPath,
    PASEO_HTML_RENDER_TOKEN: bridge.token,
    PASEO_HTML_RENDER_CWD: workspace,
  });
}

test("adapter initializes and advertises the T3-shaped render tools", async () => {
  const client = adapter();
  try {
    const init = (await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    })) as { protocolVersion: string; serverInfo: { name: string } };
    assert.equal(init.protocolVersion, "2024-11-05");
    assert.equal(init.serverInfo.name, "html-render");
    client.notify("notifications/initialized");
    const list = (await client.request("tools/list", {})) as {
      tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
    };
    assert.deepEqual(
      list.tools.map((tool) => tool.name).sort(),
      ["html_preview", "html_render"],
    );
    const render = list.tools.find((tool) => tool.name === "html_render");
    assert.ok(render);
    assert.ok(render.description.includes("sandboxed"));
    assert.ok(render.description.includes("renderMode"));
    const schema = render.inputSchema as {
      required: string[];
      properties: Record<string, { maximum?: number }>;
    };
    assert.deepEqual([...schema.required].sort(), ["height", "html", "title"]);
    assert.equal(schema.properties.height?.maximum, 2000);
  } finally {
    client.close();
  }
});

test("html_render publishes an owned artifact and a marker the client can parse", async () => {
  const client = adapter();
  try {
    await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {} });
    const html = '<!doctype html><body><h1>Revenue</h1><svg width="10" height="10"></svg></body>';
    const result = (await client.request("tools/call", {
      name: "html_render",
      arguments: { html, title: "Revenue report", height: 400, summary: "Q3 snapshot" },
    })) as { content: Array<{ type: string; text?: string }>; isError: boolean };
    assert.equal(result.isError, false);
    const text = result.content[0]?.text ?? "";
    assert.ok(text.includes("Revenue report"), text);
    const card = decodeReportReference(text);
    assert.ok(card, "marker must decode to a card reference");
    assert.equal(card.title, "Revenue report");
    assert.equal(card.summary, "Q3 snapshot");
    assert.equal(card.width, 728);
    assert.equal(card.height, 400);
    assert.equal(card.summary, "Q3 snapshot");

    const stored = await store.readPreview(card.artifactId, WORKSPACE_ID);
    assert.equal(stored.manifest.height, 400);
    assert.ok((stored.manifest.measuredHeight ?? 0) > 0);
    assert.equal(stored.manifest.workspaceId, WORKSPACE_ID);
    assert.equal(stored.manifest.ownerCwd, workspace);
    assert.equal(stored.manifest.summary, "Q3 snapshot");
    assert.equal(stored.png.subarray(1, 4).toString("latin1"), "PNG");
    const original = await store.readOriginal(card.artifactId, WORKSPACE_ID);
    assert.equal(original.html, html);
  } finally {
    client.close();
  }
});

test("html_render forwards a report and returns the interactive link contract", async () => {
  const client = adapter();
  try {
    await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {} });
    const list = (await client.request("tools/list", {})) as {
      tools: Array<{ name: string; inputSchema: { properties: Record<string, { type?: string; maxItems?: number; required?: string[] }> } }>;
    };
    const render = list.tools.find((tool) => tool.name === "html_render");
    assert.ok(render?.inputSchema.properties.report, "report must be advertised");
    assert.equal(render?.inputSchema.properties.report?.type, "object");

    const report = {
      version: 1,
      outcome: { status: "success", headline: "Bridge report" },
      summary: "One bounded report.",
      blocks: [{ kind: "text", text: "Body from the adapter." }],
      usage: { totalTokens: { provenance: "measured", value: 1200 } },
    };
    const html = '<!doctype html><body><h1>Bridge</h1></body>';
    const result = (await client.request("tools/call", {
      name: "html_render",
      arguments: { html, title: "Bridge report", height: 320, report },
    })) as { content: Array<{ type: string; text?: string }>; isError: boolean };
    assert.equal(result.isError, false);
    const text = result.content[0]?.text ?? "";
    assert.ok(text.includes("interactivePath: /"), text);
    assert.ok(text.includes("reportStored: yes"), text);
    assert.ok(text.includes("measuredHeights: 320x"), text);
    const link = /\[Open interactive report\]\(<([^>]+)>\)/.exec(text);
    assert.ok(link, "the exact Markdown link contract must be present");
    const card = decodeReportReference(text);
    assert.ok(card);
    assert.equal(card.hasReport, true);
    assert.equal(card.renderMode, "auto");
    assert.ok((card.measuredHeight ?? 0) > 0);
    assert.equal(card.heights?.length, 9);
    assert.deepEqual(card.heights?.map((entry) => entry[0]), [320, 375, 430, 520, 640, 728, 860, 1000, 1144]);

    const { manifest } = await store.readReport(card.artifactId, WORKSPACE_ID);
    assert.deepEqual(manifest.report, report);
    const interactive = await store.readInteractive(card.artifactId, WORKSPACE_ID);
    assert.ok(interactive?.html.includes("Content-Security-Policy"));
    assert.equal(interactive?.path, link[1]);
    assert.equal((await store.readOriginal(card.artifactId, WORKSPACE_ID)).html, html);
  } finally {
    client.close();
  }
});

test("html_preview returns a PNG and its measured height", async () => {
  const client = adapter();
  try {
    await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {} });
    const result = (await client.request("tools/call", {
      name: "html_preview",
      arguments: { html: '<!doctype html><body><div style="height:120px">x</div></body>', width: 390 },
    })) as { content: Array<{ type: string; data?: string; mimeType?: string; text?: string }>; isError: boolean };
    assert.equal(result.isError, false);
    const image = result.content.find((entry) => entry.type === "image");
    assert.ok(image?.data && image.mimeType === "image/png");
    assert.equal(Buffer.from(image.data, "base64").subarray(1, 4).toString("latin1"), "PNG");
    assert.ok((result.content[1]?.text ?? "").includes("contentHeight="));
  } finally {
    client.close();
  }
});

test("a caller outside a Paseo workspace is refused by the bridge", async () => {
  const client = new Adapter({
    PASEO_HTML_RENDER_BRIDGE: bridge.socketPath,
    PASEO_HTML_RENDER_TOKEN: bridge.token,
    PASEO_HTML_RENDER_CWD: OUTSIDE,
  });
  try {
    await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {} });
    const result = (await client.request("tools/call", {
      name: "html_render",
      arguments: { html: "<p>x</p>", title: "x", height: 100 },
    })) as { content: Array<{ text?: string }>; isError: boolean };
    assert.equal(result.isError, true);
    assert.match(result.content[0]?.text ?? "", /not part of an open Paseo workspace/);
  } finally {
    client.close();
  }
});

test("an invalid bridge token is denied and a caller cannot choose its workspace", async () => {
  const wrong = await rawBridge({ token: "0".repeat(64), tool: "html_preview", cwd: workspace, input: {} });
  assert.equal((wrong as { ok: boolean }).ok, false);
  assert.equal(((wrong as { error: { code: string } }).error).code, "denied");

  const forged = await rawBridge({
    token: bridge.token,
    tool: "html_render",
    cwd: workspace,
    input: {
      html: "<p>forged</p>",
      title: "Forged",
      height: 100,
      workspaceId: "wks_attacker",
      ownerCwd: "/etc",
    },
  });
  assert.equal((forged as { ok: boolean }).ok, true);
  const artifactId = (forged as { result: { htmlRender: { artifactId: string } } }).result.htmlRender
    .artifactId;
  const stored = await store.readPreview(artifactId, WORKSPACE_ID);
  assert.equal(stored.manifest.workspaceId, WORKSPACE_ID);
  assert.equal(stored.manifest.ownerCwd, workspace);
  await assert.rejects(() => store.readPreview(artifactId, "wks_attacker"), /another workspace/);
});

function rawBridge(payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: bridge.socketPath });
    let buffer = "";
    socket.setTimeout(40_000, () => reject(new Error("raw bridge timeout")));
    socket.on("connect", () => socket.write(JSON.stringify(payload) + "\n"));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
    });
    socket.on("end", () => {
      try {
        resolve(JSON.parse(buffer));
      } catch {
        reject(new Error("unreadable bridge response"));
      }
    });
    socket.on("error", reject);
  });
}
