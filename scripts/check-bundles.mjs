import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { assertNoClientClasses } from "./client-syntax.ts";

const directory = process.env.HTML_RENDER_EVIDENCE_DIR
  ? resolve(process.env.HTML_RENDER_EVIDENCE_DIR)
  : await mkdtemp(join(tmpdir(), "html-render-bundles-"));
const client = await build({
  entryPoints: ["index.client.tsx"], bundle: true, platform: "neutral", format: "cjs",
  jsx: "automatic", target: "es2022", metafile: true,
  outfile: join(directory, "client.cjs"),
  external: ["react", "react/*", "react-native", "react-native/*", "@tanstack/react-query", "zod", "@getpaseo/plugin", "@getpaseo/plugin/*"],
});
const server = await build({
  entryPoints: ["index.server.ts"], bundle: true, platform: "node", format: "cjs",
  target: "node22", metafile: true, outfile: join(directory, "server.cjs"),
  external: ["@getpaseo/plugin", "@getpaseo/plugin/*", "zod"],
});
assert.ok(!Object.keys(client.metafile.inputs).some(p => /(?:^|\/)server\/|node_modules\/pele\//.test(p)), "server/Pele code must not enter the client");
const clientText = await readFile(join(directory, "client.cjs"), "utf8");
assertNoClientClasses(clientText);
assert.ok(Object.keys(server.metafile.inputs).some(p => p.includes("node_modules/pele/")), "Pele must be bundled into the server");
await writeFile(join(directory, "bundle-metadata.json"), JSON.stringify({client:client.metafile,server:server.metafile}, null, 2));
console.log(JSON.stringify({result:"pass",directory,clientInputs:Object.keys(client.metafile.inputs).length,serverInputs:Object.keys(server.metafile.inputs).length,pele:"server-only"}));
