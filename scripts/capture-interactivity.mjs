#!/usr/bin/env node
/**
 * Captures the interactivity examples with the plugin's own static renderer.
 *
 * This is a review aid, not a test: page JavaScript is disabled, exactly as in
 * `html_preview` and the native preview PNG. Run from the repository root:
 *
 *   node scripts/capture-interactivity.mjs
 *
 * It writes PNGs and a small manifest under examples/interactive/captures/.
 * Nothing is downloaded and no browser flag is relaxed.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createRenderer } from "../server/renderer.ts";

const ROOT = process.cwd();
const EXAMPLE_DIR = join(ROOT, "examples", "interactive");
const OUTPUT_DIR = join(EXAMPLE_DIR, "captures");
const EXAMPLES = ["flow", "inspector", "filter"];
const WIDTHS = [390, 1024];
const APPEARANCE = "dark";

const renderer = createRenderer({ timeoutMs: 20_000, maxConcurrent: 1 });
const manifest = {
  note: "Static previews rendered by server/renderer.ts with page JavaScript disabled.",
  appearance: APPEARANCE,
  widths: WIDTHS,
  generatedBy: "scripts/capture-interactivity.mjs",
  examples: {},
};

try {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  for (const name of EXAMPLES) {
    const html = await fs.readFile(join(EXAMPLE_DIR, `${name}.html`), "utf8");
    const entry = {
      source: `examples/interactive/${name}.html`,
      sourceSha256: createHash("sha256").update(html).digest("hex"),
      captures: {},
    };
    for (const width of WIDTHS) {
      const result = await renderer.render({ html, width, appearance: APPEARANCE });
      const file = `${name}-${width}.png`;
      await fs.writeFile(join(OUTPUT_DIR, file), result.png, { mode: 0o644 });
      entry.captures[width] = {
        file: `examples/interactive/captures/${file}`,
        contentHeight: result.contentHeight,
        capturedHeight: result.capturedHeight,
      };
      console.log(`${file}: ${result.contentHeight}px content, ${result.png.byteLength} bytes`);
    }
    manifest.examples[name] = entry;
  }
  await fs.writeFile(
    join(OUTPUT_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o644 },
  );
  console.log(`wrote ${join(OUTPUT_DIR, "manifest.json")}`);
} finally {
  await renderer.close();
}
