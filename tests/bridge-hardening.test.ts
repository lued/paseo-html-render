import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startBridge } from "../server/bridge.ts";
import type { HtmlTools } from "../server/tools.ts";

test("bridge preserves split UTF-8 and dispatches only one request per socket", async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), "hr-wire-"));
  let calls = 0;
  let received: any;
  const tools: HtmlTools = {
    async preview() { throw new Error("not expected"); },
    async publish(raw) {
      calls++;
      received = raw;
      await new Promise(r => setTimeout(r, 80));
      return {htmlRender:{artifactId:"a".repeat(32),title:"Wire",height:100,width:728},
        summary:null,hasReport:false,interactivePath:"/tmp/interactive.html",message:"stored"};
    },
  };
  const bridge = await startBridge({ dataRoot: dir, tools, authority: {
    workspaceForCwd: async () => ({workspaceId:"wks_wire", root:dir}),
    workspaceForAgent: async () => "wks_wire",
  } }, "token");
  try {
    const request = Buffer.from(JSON.stringify({token:"token",tool:"html_render",cwd:dir,input:{title:"Unicode 😀 café",html:"<p>日本語</p>"}})+"\n");
    const split = request.indexOf(Buffer.from("😀")) + 2;
    const response = await new Promise<string>((resolve, reject) => {
      const socket = net.createConnection(bridge.socketPath);
      let text = "";
      socket.setEncoding("utf8");
      socket.on("error",reject);
      socket.on("data",chunk=>text+=chunk);
      socket.on("end",()=>resolve(text));
      socket.on("connect",()=>{
        socket.write(request.subarray(0,split));
        setTimeout(()=>socket.write(request.subarray(split)),10);
        setTimeout(()=>socket.write(request),30);
      });
    });
    assert.equal(JSON.parse(response).ok, true);
    assert.deepEqual(received,{title:"Unicode 😀 café",html:"<p>日本語</p>"});
    assert.equal(calls, 1);
  } finally {
    await bridge.close();
    await fs.rm(dir,{recursive:true,force:true});
  }
});
