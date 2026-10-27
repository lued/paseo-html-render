import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inlineWorkspaceImages } from "../server/images.ts";
import { createRenderer, findChromiumExecutable } from "../server/renderer.ts";
import { browserResult } from "./helpers/browser.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGES = join(ROOT, "docs/images/showcase");
const EXAMPLES = join(ROOT, "examples/showcase");
const PAGES = ["image-inspection.html", "render-pipeline.html", "incident-timeline.html"];

async function text(path: string): Promise<string> {
  return fs.readFile(path, "utf8");
}

/** Local Markdown link/image targets only; anchors and external URLs are not files. */
function localTargets(markdown: string): string[] {
  const targets: string[] = [];
  for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = match[1]!.trim().replace(/^<|>$/g, "");
    if (!raw || raw.startsWith("#") || /^(?:https?:|mailto:)/i.test(raw)) continue;
    const path = raw.split("#")[0]!.split("?")[0]!;
    if (path) targets.push(path);
  }
  return targets;
}

function assertLinksResolve(file: string, markdown: string, missing: string[]): void {
  for (const target of localTargets(markdown)) {
    const path = resolve(dirname(file), target);
    if (!existsSync(path)) missing.push(path);
  }
}

function pngSize(bytes: Buffer): [number, number] {
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test("README is short, truthful about install and labels the demo capture", async () => {
  const readme = await text(join(ROOT, "README.md"));
  const lines = readme.trim().split("\n");
  assert.ok(lines.length <= 80, `README has ${lines.length} lines; keep it scannable`);
  assert.ok(readme.split(/\s+/).length <= 700, "README should stay a front page, not a manual");

  assert.match(readme, /2\.2\.0 is an unreleased candidate/);
  assert.match(readme, /not a published npm release/);
  assert.match(readme, /git clone https:\/\/github\.com\/lued\/paseo-html-render\.git/);
  assert.match(readme, /npm ci --ignore-scripts/);
  assert.match(readme, /paseo plugin install \./);
  assert.match(readme, /paseo plugin ls/);
  assert.match(readme, />=0\.12\.0 <0\.14\.0/);
  assert.doesNotMatch(readme, /paseo plugin install npm:paseo-html-render@2\.2\.0/);
  assert.match(readme, /Node 22\.18 or newer/);
  assert.match(readme, /Chromium/);
  assert.match(readme, /No browser is downloaded or installed/);

  // Do not sell an unpublished npm package as a working install.
  assert.doesNotMatch(readme, /npm (?:i|install) (?:-g )?paseo-html-render/);
  assert.doesNotMatch(readme, /npx (?:paseo )?plugin/);

  assert.match(readme, /docs\/showcase\.md/);
  assert.match(readme, /docs\/interactivity\.md/);
  assert.match(readme, /docs\/compatibility\.md/);
  assert.match(readme, /docs\/images\/showcase\/hero\.png/);
  assert.match(readme, /standalone demo page, not a mocked Paseo window/i);
});

test("the gallery links the three examples, their assets and their sources", async () => {
  const gallery = await text(join(ROOT, "docs/showcase.md"));
  for (const prompt of [
    "Compare these two screenshots",
    "Show me how a visual gets",
    "Replay this deploy failure",
  ]) {
    assert.ok(gallery.includes(prompt), `gallery keeps a copyable prompt: ${prompt}`);
  }
  for (const asset of [
    "images/showcase/image-inspection.png",
    "images/showcase/render-pipeline.png",
    "images/showcase/incident-timeline.gif",
    "images/showcase/incident-timeline-static.png",
  ]) {
    assert.ok(gallery.includes(asset), asset);
    assert.ok(existsSync(join(ROOT, "docs", asset)), asset);
  }
  for (const source of ["image-inspection.html", "render-pipeline.html", "incident-timeline.html"]) {
    assert.ok(gallery.includes(`../examples/showcase/${source}`), source);
    assert.ok(existsSync(join(EXAMPLES, source)), source);
  }
  assert.match(gallery, /Demo timeline · illustrative data, not real telemetry/i);
  assert.match(gallery, /fabricated Paseo window/i);
  assert.match(gallery, /The GIF is a recording of the source page/i);
  assert.ok(existsSync(join(IMAGES, "capture.mjs")), "capture script survives");
  assert.ok(existsSync(join(IMAGES, "CAPTURES.md")), "capture provenance survives");
});

test("all local links in README and gallery resolve in the integrated tree", async () => {
  const missing: string[] = [];
  for (const file of [join(ROOT, "README.md"), join(ROOT, "docs/showcase.md")]) {
    assertLinksResolve(file, await text(file), missing);
  }
  assert.deepEqual(missing, [], `broken local links:\n${missing.join("\n")}`);
});

test("showcase sources are self-contained, static-first and honest about data", async () => {
  for (const name of PAGES) {
    const file = join(EXAMPLES, name);
    const html = await text(file);
    assert.match(html, /^<!doctype html>/i, name);
    assert.match(html, /<meta name="viewport"/i, name);
    assert.match(html, /<html lang="en">/i, name);
    assert.match(html, /prefers-reduced-motion/, name);
    assert.match(html, /color-scheme/, name);

    // No remote or executable loading. Local controls may use inline script.
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i, name);
    assert.doesNotMatch(html, /<link\b[^>]*\brel=["']?stylesheet/i, name);
    assert.doesNotMatch(html, /@import/i, name);
    assert.doesNotMatch(html, /url\(\s*["']?(?:https?:)?\/\//i, name);
    assert.doesNotMatch(html, /<(?:img|source|iframe|video|audio)\b[^>]*\bsrc=["'](?:https?:)?\/\//i, name);
    assert.doesNotMatch(html, /file:\/\//i, name);
    assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/, name);
    assert.doesNotMatch(html, /\b(?:eval|new Function)\s*\(/, name);
    assert.doesNotMatch(html, /(?:window\.)?parent\.postMessage|postMessage\s*\(/, name);
    assert.doesNotMatch(html, /\/home\/|\/Users\//, name);

    // Every relative image/url() reference is checked in beside the source.
    for (const match of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
      const src = match[1]!;
      if (/^(?:data:|https?:|\/\/|#)/i.test(src)) continue;
      assert.ok(existsSync(resolve(dirname(file), src)), `${name}: ${src}`);
    }
  }

  const image = await text(join(EXAMPLES, "image-inspection.html"));
  assert.doesNotMatch(image, /<script\b/i, "image inspection must not need scripts");
  assert.match(image, /assets\/settings-before\.png/);
  assert.match(image, /assets\/settings-after\.png/);
  assert.match(image, /:checked/);

  const pipeline = await text(join(EXAMPLES, "render-pipeline.html"));
  assert.doesNotMatch(pipeline, /<script\b/i, "pipeline selection must not need scripts");
  assert.match(pipeline, /:checked/);

  const incident = await text(join(EXAMPLES, "incident-timeline.html"));
  assert.match(incident, /<noscript>/);
  assert.match(incident, /Demo timeline · illustrative data, not real telemetry/);
  assert.doesNotMatch(incident, /innerHTML\s*=/, "static markup stays authoritative");
  for (const time of ["09:12", "09:14", "09:17", "09:19", "09:28", "09:31"]) {
    assert.ok(incident.includes(time), `timeline keeps static step ${time}`);
  }
});

test("showcase controls are local and work without host APIs", { timeout: 60_000 }, async (t) => {
  if (!findChromiumExecutable()) {
    t.skip("Chromium unavailable");
    return;
  }

  const pipeline = await text(join(EXAMPLES, "render-pipeline.html"));
  const pipelineResult = (await browserResult(
    pipeline.replace(
      "</body>",
      `<script>
        document.querySelector('label[for="stage-1"]').click();
        window.__result = {
          selected: document.querySelector('#stage-1').checked,
          detail: getComputedStyle(document.querySelector('.detail .p1')).display,
          oldDetail: getComputedStyle(document.querySelector('.detail .p4')).display,
          hostApi: typeof window.paseo
        };
      </script></body>`,
    ),
  )) as { selected: boolean; detail: string; oldDetail: string; hostApi: string };
  assert.equal(pipelineResult.selected, true);
  assert.equal(pipelineResult.detail, "block");
  assert.equal(pipelineResult.oldDetail, "none");
  assert.equal(pipelineResult.hostApi, "undefined");

  const incident = await text(join(EXAMPLES, "incident-timeline.html"));
  const incidentResult = (await browserResult(
    incident.replace(
      "</body>",
      `<script>
        document.querySelector('label[for="step-5"]').click();
        const selected5 = document.querySelector('#step-5').checked;
        const detail5 = getComputedStyle(document.querySelector('.detail .d5')).display;
        const controls = getComputedStyle(document.querySelector('.controls')).display;
        document.querySelector('#play').click();
        setTimeout(() => {
          window.__result = {
            selected5,
            detail5,
            controls,
            advanced: document.querySelector('#step-6').checked,
            detail6: getComputedStyle(document.querySelector('.detail .d6')).display
          };
        }, 1400);
      </script></body>`,
    ),
  )) as { selected5: boolean; detail5: string; controls: string; advanced: boolean; detail6: string };
  assert.equal(incidentResult.selected5, true);
  assert.equal(incidentResult.detail5, "block");
  assert.equal(incidentResult.controls, "flex");
  assert.equal(incidentResult.advanced, true, "Play advances one step after its delay");
  assert.equal(incidentResult.detail6, "block");
});

test("showcase binary assets stay inside the 2 MiB budget", async () => {
  const files: string[] = [];
  for (const dir of [IMAGES, join(EXAMPLES, "assets")]) {
    for (const name of await fs.readdir(dir)) {
      if (/\.(?:png|gif)$/i.test(name)) files.push(join(dir, name));
    }
  }
  let total = 0;
  for (const file of files) {
    const bytes = await fs.readFile(file);
    total += bytes.byteLength;
    assert.ok(bytes.byteLength < 1_048_576, `${file} is ${bytes.byteLength} bytes`);
    if (file.endsWith(".png")) {
      const [width, height] = pngSize(bytes);
      assert.ok(width >= 100 && height >= 80, `${file} is ${width}x${height}`);
      assert.ok(width <= 4096 && height <= 4096, `${file} is ${width}x${height}`);
    } else {
      assert.equal(bytes.subarray(0, 6).toString("latin1"), "GIF89a");
      assert.ok(bytes.readUInt16LE(6) >= 300 && bytes.readUInt16LE(8) >= 200);
      // Six graphic-control extensions: this is the six-step recording.
      const gce = Buffer.from([0x21, 0xf9, 0x04]);
      let count = 0;
      for (let at = bytes.indexOf(gce); at !== -1; at = bytes.indexOf(gce, at + 1)) count += 1;
      assert.ok(count >= 6, `GIF has ${count} frame controls`);
    }
  }
  assert.ok(total <= 2 * 1024 * 1024, `showcase assets total ${total} bytes`);
});

test("showcase pages render under the real static CSP with workspace images inlined", { timeout: 120_000 }, async (t) => {
  if (!findChromiumExecutable()) {
    t.skip("Chromium unavailable");
    return;
  }
  const renderer = createRenderer({ timeoutMs: 25_000, maxConcurrent: 1 });
  try {
    for (const name of PAGES) {
      const html = await text(join(EXAMPLES, name));
      const inlined = await inlineWorkspaceImages(html, { workspaceRoot: EXAMPLES, cwd: EXAMPLES });
      assert.deepEqual(inlined.missing, [], `${name} has no missing images`);
      if (name === "image-inspection.html") {
        assert.ok(inlined.inlined.length >= 5, "before/after and detail images were inlined");
      }
      const output = await renderer.render({ html: inlined.html, width: 728 });
      assert.equal(output.width, 728, name);
      assert.equal(output.png.subarray(1, 4).toString("latin1"), "PNG", name);
      assert.ok(output.contentHeight > 100, `${name} has content`);
      assert.ok(output.png.byteLength > 100, `${name} produced pixels`);
    }
  } finally {
    await renderer.close();
  }
});
