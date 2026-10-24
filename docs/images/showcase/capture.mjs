#!/usr/bin/env node
/**
 * Regenerate the showcase PNG/GIF evidence from the checked-in example sources.
 *
 * Uses the same Chromium discovery as the plugin; no browser download, no npm
 * package, no external media. Run from the repository root:
 *
 *   npm ci --ignore-scripts
 *   node docs/images/showcase/capture.mjs
 *
 * Captures are 2x for still pages and 1x for the GIF. The incident "static"
 * still is captured with script execution disabled, matching the plugin's
 * screenshot path. The GIF is a recording of the interactive example; it is
 * not a live Paseo surface.
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findChromiumExecutable } from "../../../server/renderer.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const EXAMPLES = join(ROOT, "examples/showcase");
const OUT = HERE;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const executable = process.env.PASEO_HTML_RENDER_CHROMIUM || findChromiumExecutable();
if (!executable) {
  console.error("capture: no Chromium found; set PASEO_HTML_RENDER_CHROMIUM");
  process.exit(2);
}

const browser = await openBrowser(executable);
try {
  await captureSettings();
  await capturePages();
  await captureGif();
} finally {
  await browser.close();
}

const files = (await fs.readdir(OUT)).filter((name) => /\.(png|gif)$/i.test(name)).sort();
let total = 0;
for (const name of files) {
  const stat = await fs.stat(join(OUT, name));
  total += stat.size;
  console.log(`${name}\t${(stat.size / 1024).toFixed(0)} KiB`);
}
console.log(`showcase assets\t${(total / 1024 / 1024).toFixed(2)} MiB`);

async function captureSettings() {
  const before = join(EXAMPLES, "assets/settings-before.html");
  const after = join(EXAMPLES, "assets/settings-after.html");
  await page(before, { width: 720, height: 420, scale: 2 }, async () => {
    await shot(join(EXAMPLES, "assets/settings-before.png"), { x: 0, y: 0, width: 720, height: 420 });
  });
  await page(after, { width: 720, height: 420, scale: 2 }, async () => {
    await shot(join(EXAMPLES, "assets/settings-after.png"), { x: 0, y: 0, width: 720, height: 420 });
  });
  await page(
    after,
    { width: 720, height: 420, scale: 2 },
    async () => {
      await shot(join(EXAMPLES, "assets/detail-accent.png"), { x: 560, y: 150, width: 160, height: 90 });
      await shot(join(EXAMPLES, "assets/detail-sidebar.png"), { x: 0, y: 110, width: 160, height: 90 });
      await shot(join(EXAMPLES, "assets/detail-toggle.png"), { x: 560, y: 210, width: 160, height: 90 });
    },
  );
}

async function capturePages() {
  const inspection = join(EXAMPLES, "image-inspection.html");
  await page(inspection, { width: 728, height: 1200, scale: 2 }, async () => {
    await shot(join(OUT, "hero.png"), { x: 0, y: 0, width: 728, height: 665 });
    await shot(join(OUT, "image-inspection.png"), { x: 0, y: 0, width: 728, height: await contentHeight() });
  });
  const pipeline = join(EXAMPLES, "render-pipeline.html");
  await page(pipeline, { width: 728, height: 1200, scale: 2 }, async () => {
    await shot(join(OUT, "render-pipeline.png"), { x: 0, y: 0, width: 728, height: await contentHeight() });
  });
  const incident = join(EXAMPLES, "incident-timeline.html");
  await page(incident, { width: 728, height: 1200, scale: 2 }, async () => {
    await shot(join(OUT, "incident-timeline.png"), { x: 0, y: 0, width: 728, height: await contentHeight() });
  });
  await page(incident, { width: 728, height: 1200, scale: 2, scripts: false }, async () => {
    await shot(join(OUT, "incident-timeline-static.png"), { x: 0, y: 0, width: 728, height: await contentHeight() });
  });
}

async function captureGif() {
  const incident = join(EXAMPLES, "incident-timeline.html");
  await page(incident, { width: 728, height: 1000, scale: 1 }, async () => {
    const rect = JSON.parse(await browser.evaluate('JSON.stringify(document.querySelector(".timeline").getBoundingClientRect())'));
    const clip = {
      x: Math.max(0, Math.floor(rect.x - 8)),
      y: Math.max(0, Math.floor(rect.y - 8)),
      width: Math.ceil(rect.width + 16),
      height: Math.ceil(rect.height + 16),
    };
    const frames = [];
    for (let step = 1; step <= 6; step += 1) {
      await browser.evaluate(
        `document.querySelector('label[for="step-${step}"]').click();` +
          "if (document.activeElement) document.activeElement.blur();",
      );
      await sleep(120);
      const png = await screenPng(clip);
      frames.push(await pngToRgba(png));
    }
    const gif = encodeGif(frames, { width: clip.width, height: clip.height, delay: 110, loop: 1 });
    await fs.writeFile(join(OUT, "incident-timeline.gif"), gif);
  });
}

async function page(file, options, body) {
  await browser.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: "dark" },
      { name: "prefers-reduced-motion", value: "no-preference" },
    ],
  });
  await browser.send("Emulation.setDeviceMetricsOverride", {
    width: options.width,
    height: options.height,
    deviceScaleFactor: options.scale,
    mobile: false,
  });
  await browser.send("Emulation.setScriptExecutionDisabled", { value: options.scripts === false });
  await browser.navigate(`file://${resolve(file)}`);
  await sleep(600);
  await body();
}

async function contentHeight() {
  return Math.ceil(await browser.evaluate("document.body.getBoundingClientRect().height"));
}

async function shot(path, clip) {
  const data = await screenPng(clip);
  await fs.writeFile(path, Buffer.from(data, "base64"));
}

async function screenPng(clip) {
  const result = await browser.send("Page.captureScreenshot", {
    format: "png",
    clip: { ...clip, scale: 1 },
  });
  return result.data;
}

/** Decode a PNG frame to RGBA in the already-open page; no image library. */
async function pngToRgba(base64) {
  const raw = await browser.evaluate(
    `(async () => {
      const img = new Image(); img.src = "data:image/png;base64,${base64}"; await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width; canvas.height = img.height;
      const context = canvas.getContext("2d"); context.drawImage(img, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let binary = "";
      for (let i = 0; i < data.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
      }
      return btoa(binary);
    })()`,
    true,
  );
  return new Uint8Array(Buffer.from(raw, "base64"));
}

async function openBrowser(path) {
  const dir = await fs.mkdtemp(join(tmpdir(), "html-render-showcase-"));
  const profile = join(dir, "profile");
  const child = spawn(
    path,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let address = "";
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const [port, wsPath] = (await fs.readFile(join(profile, "DevToolsActivePort"), "utf8")).trim().split("\n");
      if (/^\d+$/.test(port ?? "") && wsPath?.startsWith("/devtools/browser/")) {
        address = `ws://127.0.0.1:${port}${wsPath}`;
        break;
      }
    } catch {
      // The port file appears asynchronously.
    }
    await sleep(50);
  }
  if (!address) throw new Error("Chromium did not expose a DevTools port");
  const socket = new WebSocket(address);
  await new Promise((done, fail) => {
    socket.addEventListener("open", () => done());
    socket.addEventListener("error", () => fail(new Error("DevTools connection failed")));
  });
  let next = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message));
    else item.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) => {
    const id = next++;
    return new Promise((done, fail) => {
      pending.set(id, { resolve: done, reject: fail });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  };
  const target = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  return {
    send: (method, params, id) => send(method, params, id ?? sessionId),
    evaluate: async (expression, awaitPromise = false) => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise }, sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result?.value;
    },
    navigate: async (url) => {
      await send("Page.navigate", { url }, sessionId);
      await sleep(400);
    },
    close: async () => {
      try {
        socket.close();
      } catch {
        // Best effort.
      }
      child.kill("SIGKILL");
      await sleep(150);
      await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    },
  };
}

// ---------------------------------------------------------------------------
// GIF89a encoder: adaptive 255-colour global palette, LZW, full frames.
// Minimal on purpose; no dependency and no external encoder.
// ---------------------------------------------------------------------------

function encodeGif(frames, { width, height, delay, loop }) {
  const palette = buildPalette(frames, 255);
  const lookup = buildLookup(palette);
  const chunks = [Buffer.from("GIF89a", "ascii")];
  const screen = Buffer.alloc(7);
  screen.writeUInt16LE(width, 0);
  screen.writeUInt16LE(height, 2);
  screen[4] = 0xf7; // global table, 256 entries, 8-bit colour resolution
  chunks.push(screen);
  const table = Buffer.alloc(256 * 3);
  palette.forEach(([red, green, blue], index) => {
    table[index * 3] = red;
    table[index * 3 + 1] = green;
    table[index * 3 + 2] = blue;
  });
  chunks.push(table);
  chunks.push(
    Buffer.from([
      0x21, 0xff, 0x0b,
      ...Buffer.from("NETSCAPE2.0", "ascii"),
      0x03, 0x01, loop & 255, (loop >> 8) & 255, 0x00,
    ]),
  );
  for (const rgba of frames) {
    const pixels = new Uint8Array(width * height);
    for (let index = 0, pixel = 0; index < pixels.length; index += 1, pixel += 4) {
      const bucket = ((rgba[pixel] >> 3) << 10) | ((rgba[pixel + 1] >> 3) << 5) | (rgba[pixel + 2] >> 3);
      pixels[index] = lookup[bucket];
    }
    chunks.push(Buffer.from([0x21, 0xf9, 0x04, 0x00, delay & 255, (delay >> 8) & 255, 0x00, 0x00]));
    const descriptor = Buffer.alloc(10);
    descriptor[0] = 0x2c;
    descriptor.writeUInt16LE(0, 1);
    descriptor.writeUInt16LE(0, 3);
    descriptor.writeUInt16LE(width, 5);
    descriptor.writeUInt16LE(height, 7);
    chunks.push(descriptor, Buffer.from([8]), encodeLzw(pixels), Buffer.from([0]));
  }
  chunks.push(Buffer.from([0x3b]));
  return Buffer.concat(chunks);
}

function buildPalette(frames, maxColors) {
  const buckets = new Map();
  for (const rgba of frames) {
    for (let pixel = 0; pixel < rgba.length; pixel += 4) {
      const key = ((rgba[pixel] >> 3) << 10) | ((rgba[pixel + 1] >> 3) << 5) | (rgba[pixel + 2] >> 3);
      const entry = buckets.get(key);
      if (entry) {
        entry.r += rgba[pixel];
        entry.g += rgba[pixel + 1];
        entry.b += rgba[pixel + 2];
        entry.n += 1;
      } else {
        buckets.set(key, { r: rgba[pixel], g: rgba[pixel + 1], b: rgba[pixel + 2], n: 1 });
      }
    }
  }
  let boxes = [{ entries: [...buckets.values()] }];
  for (const box of boxes) updateRange(box);
  while (boxes.length < maxColors) {
    let best = -1;
    let bestScore = -1;
    for (let index = 0; index < boxes.length; index += 1) {
      const box = boxes[index];
      if (box.entries.length < 2) continue;
      const count = box.entries.reduce((sum, entry) => sum + entry.n, 0);
      const score = Math.max(box.rmax - box.rmin, box.gmax - box.gmin, box.bmax - box.bmin) * Math.log2(count + 1);
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    }
    if (best < 0) break;
    const box = boxes[best];
    const axis =
      box.rmax - box.rmin >= box.gmax - box.gmin && box.rmax - box.rmin >= box.bmax - box.bmin
        ? "r"
        : box.gmax - box.gmin >= box.bmax - box.bmin
          ? "g"
          : "b";
    box.entries.sort((left, right) => left[axis] - right[axis]);
    const total = box.entries.reduce((sum, entry) => sum + entry.n, 0);
    let accumulated = 0;
    let cut = 1;
    for (let index = 0; index < box.entries.length - 1; index += 1) {
      accumulated += box.entries[index].n;
      if (accumulated * 2 >= total) {
        cut = index + 1;
        break;
      }
    }
    const first = { entries: box.entries.slice(0, cut) };
    const second = { entries: box.entries.slice(cut) };
    updateRange(first);
    updateRange(second);
    boxes.splice(best, 1, first, second);
  }
  return boxes.map((box) => {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (const entry of box.entries) {
      red += entry.r;
      green += entry.g;
      blue += entry.b;
      count += entry.n;
    }
    return [Math.round(red / count), Math.round(green / count), Math.round(blue / count)];
  });
}

function updateRange(box) {
  let rmin = 255;
  let rmax = 0;
  let gmin = 255;
  let gmax = 0;
  let bmin = 255;
  let bmax = 0;
  for (const entry of box.entries) {
    rmin = Math.min(rmin, entry.r);
    rmax = Math.max(rmax, entry.r);
    gmin = Math.min(gmin, entry.g);
    gmax = Math.max(gmax, entry.g);
    bmin = Math.min(bmin, entry.b);
    bmax = Math.max(bmax, entry.b);
  }
  Object.assign(box, { rmin, rmax, gmin, gmax, bmin, bmax });
}

function buildLookup(palette) {
  const lookup = new Uint8Array(32 * 32 * 32);
  for (let red = 0; red < 32; red += 1) {
    for (let green = 0; green < 32; green += 1) {
      for (let blue = 0; blue < 32; blue += 1) {
        const r = (red << 3) | 4;
        const g = (green << 3) | 4;
        const b = (blue << 3) | 4;
        let best = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let index = 0; index < palette.length; index += 1) {
          const [pr, pg, pb] = palette[index];
          const distance = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = index;
          }
        }
        lookup[(red << 10) | (green << 5) | blue] = best;
      }
    }
  }
  return lookup;
}

function encodeLzw(indices) {
  const bytes = [];
  let current = 0;
  let bits = 0;
  const push = (code, size) => {
    current |= code << bits;
    bits += size;
    while (bits >= 8) {
      bytes.push(current & 255);
      current >>= 8;
      bits -= 8;
    }
  };
  const clear = 256;
  const end = 257;
  let dictionary = new Map();
  let next = 258;
  let size = 9;
  const reset = () => {
    dictionary = new Map();
    next = 258;
    size = 9;
  };
  push(clear, size);
  let prefix = String(indices[0]);
  for (let index = 1; index < indices.length; index += 1) {
    const nextIndex = String(indices[index]);
    const key = `${prefix},${nextIndex}`;
    const code = dictionary.get(key);
    if (code !== undefined) {
      prefix = key;
      continue;
    }
    push(prefix.includes(",") ? dictionary.get(prefix) : Number(prefix), size);
    dictionary.set(key, next);
    next += 1;
    if (next > 1 << size && size < 12) size += 1;
    if (next >= 4095) {
      push(clear, size);
      reset();
    }
    prefix = nextIndex;
  }
  push(prefix.includes(",") ? dictionary.get(prefix) : Number(prefix), size);
  push(end, size);
  if (bits > 0) bytes.push(current & 255);
  const blocks = [];
  for (let index = 0; index < bytes.length; index += 255) {
    const chunk = bytes.slice(index, index + 255);
    blocks.push(chunk.length, ...chunk);
  }
  return Buffer.from(blocks);
}
