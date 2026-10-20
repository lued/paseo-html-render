import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { HTML_FRAME_SANDBOX } from "../shared/html-document.ts";

/**
 * The component cannot be imported by `node --test` because it is TSX, so this
 * guards the source-level invariants that matter more than rendering here:
 * no native surface, no second sandbox policy, and no automatic navigation.
 */
async function frameSource(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  return fs.readFile(join(here, "..", "client", "html-frame.tsx"), "utf8");
}

test("the live frame never imports a native surface or opens links by itself", async () => {
  const source = await frameSource();
  assert.ok(!/from\s+["']react-native["']/.test(source), "no react-native import");
  assert.ok(!/\bPlatform\b/.test(source), "no React Native Platform module");
  assert.ok(!/\bwindow\.open\s*\(/.test(source), "no automatic window.open");
  assert.ok(!/\blocation\.(?:assign|replace)\s*\(/.test(source), "no automatic navigation");
  assert.ok(!/postMessage\([^)]*allow-same-origin/.test(source));
});

test("the live frame uses the shared sandbox and the shared selection gate", async () => {
  const source = await frameSource();
  assert.equal(HTML_FRAME_SANDBOX, "allow-scripts");
  assert.ok(/sandbox:\s*HTML_FRAME_SANDBOX/.test(source), "sandbox comes from the shared constant");
  assert.ok(!/sandbox\s*:\s*["'`][^"'`]*(?:allow-same-origin|allow-forms|allow-popups)/.test(source));
  assert.ok(/selectHtmlFrameKind\(/.test(source), "render mode is gated by the shared helper");
  assert.ok(/canRenderLiveHtmlFrame\(/.test(source), "platform is gated by the shared helper");
  assert.ok(!/onFailure/.test(source), "the frame has no failure hand-off to a static image");
  assert.ok(/userActivation/.test(source), "link/image requests require user activation");
  assert.doesNotMatch(source, /setExpanded|expandedRef|setZoom|requestFullscreen|exitFullscreen|Open full screen|Close full screen|aria-modal/);
  assert.doesNotMatch(source, /position:\s*["']fixed["']/);
  assert.ok(source.includes('allow: "fullscreen \'none\'"'), "fullscreen API permission is explicitly denied");
});
