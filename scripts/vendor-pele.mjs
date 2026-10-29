#!/usr/bin/env node
/**
 * Rebuild the vendored report-graph renderer from the pinned pele dev dependency.
 * Only the flowchart grammar is bundled, which is 178 KB instead of 664 KB.
 *
 * Run: node scripts/vendor-pele.mjs
 */
import { build } from "esbuild";
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(ROOT, "server", "vendor");
const PELE = join(ROOT, "node_modules", "pele");

const pkg = JSON.parse(await fs.readFile(join(ROOT, "package.json"), "utf8"));
const pinned = pkg.devDependencies.pele;
const installed = JSON.parse(await fs.readFile(join(PELE, "package.json"), "utf8")).version;
if (installed !== pinned) throw new Error(`pele is ${installed} in node_modules, package.json pins ${pinned}`);

const entry = [
  'import { register, render } from "pele/core";',
  'import flowchart from "pele/diagrams/flowchart";',
  "register(flowchart);",
  "export { render };",
  "",
].join("\n");

const result = await build({
  stdin: { contents: entry, resolveDir: ROOT, sourcefile: "pele-flowchart.js", loader: "js" },
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2020",
  minify: false,
  legalComments: "inline",
  banner: {
    js: `/**\n * Generated from pele ${pinned}, flowchart only. Do not edit.\n * Rebuild: node scripts/vendor-pele.mjs\n * Upstream https://github.com/obsidianmd/pele, MIT. See LICENSE.pele beside this file.\n */\n`,
  },
  write: false,
  logLevel: "silent",
});
const bundle = result.outputFiles[0].text;
const license = await fs.readFile(join(PELE, "LICENSE"), "utf8");

await fs.writeFile(join(VENDOR, "pele-flowchart.mjs"), bundle);
await fs.writeFile(join(VENDOR, "LICENSE.pele"), license);
console.log(`wrote server/vendor/pele-flowchart.mjs (${bundle.length} bytes) and LICENSE.pele from pele ${pinned}`);
