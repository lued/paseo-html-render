import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AbortController } from "../server/cancellation.ts";
import { ArtifactStore } from "../server/artifacts.ts";
import { startBridge } from "../server/bridge.ts";
import { createRenderer, type Renderer } from "../server/renderer.ts";
import { createHtmlTools } from "../server/tools.ts";
import { MAX_PREVIEW_PNG_BYTES } from "../shared/limits.ts";
import { ADAPTER_SOURCE } from "../server/adapter-source.ts";

// This is intentionally high-entropy, not a compressible solid-colour screenshot.
test("noisy SVG is clipped to the PNG budget before base64 transport", {timeout:45_000}, async () => {
  const renderer = createRenderer();
  try {
    const html = '<svg xmlns="http://www.w3.org/2000/svg" width="728" height="3600"><filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#noise)"/></svg>';
    const output = await renderer.render({html,width:728});
    assert.ok(output.png.byteLength <= MAX_PREVIEW_PNG_BYTES);
    assert.ok(output.capturedHeight < output.contentHeight, "high-entropy capture explicitly reports clipping");
    assert.equal(output.width,728);
  } finally { await renderer.close(); }
});

test("pre-canceled capture and measure never launch Chromium", async () => {
  let launches = 0;
  const renderer = createRenderer({onBrowserLaunch:()=>launches++});
  const controller = new AbortController();
  controller.abort(new Error("request canceled"));
  try {
    await assert.rejects(renderer.render({html:"<p>x</p>",signal:controller.signal}),/canceled/);
    await assert.rejects(renderer.measure({html:"<p>x</p>",widths:[728],signal:controller.signal}),/canceled/);
    assert.equal(launches,0);
  } finally { await renderer.close(); }
});

test("a disconnected publish cancels its renderer and never commits an artifact", {timeout:5000}, async () => {
  const root = await fs.mkdtemp(join(tmpdir(),"hr-cancel-"));
  const store = new ArtifactStore(root);
  let start!:()=>void;
  let cancelled!:()=>void;
  const started = new Promise<void>(r=>start=r);
  const cancellation = new Promise<void>(r=>cancelled=r);
  const renderer: Renderer = {
    async render(input) {
      start();
      await new Promise<void>(resolve=>input.signal!.addEventListener("abort",()=>{cancelled();resolve();},{once:true}));
      input.signal!.throwIfAborted();
      throw new Error("unexpected continuation");
    },
    async close() {},
  };
  const tools = createHtmlTools({renderer,store});
  const bridge = await startBridge({dataRoot:root,tools,authority:{
    workspaceForCwd:async()=>({workspaceId:"wks_cancel",root,workspaceIds:["wks_cancel"]}),workspaceForAgent:async()=>"wks_cancel",
    workspaceForAgentOwnership:async()=>({workspaceId:"wks_cancel",root,workspaceIds:["wks_cancel"]}),
  }},"token");
  const socket = net.createConnection(bridge.socketPath);
  try {
    await new Promise<void>(r=>socket.once("connect",r));
    socket.write(JSON.stringify({token:"token",tool:"html_render",cwd:root,input:{html:"<p>x</p>",title:"Canceled",height:100}})+"\n");
    await started;
    socket.destroy();
    await cancellation;
    await new Promise(r=>setTimeout(r,50));
    assert.equal(await fs.stat(store.artifactsDir).then(()=>true,()=>false),false);
  } finally { socket.destroy(); await bridge.close(); await fs.rm(root,{recursive:true,force:true}); }
});

test("advertised report schema is derived from strict daemon quantity/id/url contracts", () => {
  const match = /const reportSchema = (.*);/.exec(ADAPTER_SOURCE);
  assert.ok(match);
  const schema = JSON.parse(match[1]!);
  const usage = schema.properties.usage;
  assert.equal(usage.minProperties,1);
  const quantities = usage.properties.totalTokens.oneOf;
  const unavailable = quantities.find((item: any)=>item.properties.provenance.const === "unavailable");
  assert.deepEqual(unavailable.required,["provenance"]);
  assert.equal(unavailable.properties.value,undefined);
  assert.equal(unavailable.additionalProperties,false);
  assert.ok(schema.properties.graph.properties.nodes.items.properties.id.pattern);
  assert.ok(schema.properties.evidence.items.properties.url.pattern);
  assert.match(schema.properties.blocks.description,/rows must match columns/);
});
