import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRenderer, RenderError } from "../server/renderer.ts";

// No installed Chromium is needed: explicit bad overrides must fail closed,
// never fall back to another browser or emit an unhandled child-process error.
for (const kind of ["missing", "non-executable", "invalid-path"] as const) {
  test(`a ${kind} browser override is catchable and retryable`, { timeout: 5_000 }, async (t) => {
    const directory = await fs.mkdtemp(join(tmpdir(), "html-render-launch-test-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const executablePath = join(directory, kind === "invalid-path" ? "invalid\0chrome" : "chrome");
    if (kind === "non-executable") {
      await fs.writeFile(executablePath, "not an executable browser\n", { mode: 0o600 });
    }
    let launches = 0;
    const renderer = createRenderer({
      executablePath,
      maxConcurrent: 1,
      onBrowserLaunch: () => { launches += 1; },
    });
    t.after(() => renderer.close());
    const unavailable = (error: unknown) => {
      assert.ok(error instanceof RenderError);
      assert.equal(error.code, "browser_unavailable");
      assert.match(error.message, /A sandboxed Chromium could not start/);
      return true;
    };
    await assert.rejects(() => renderer.render({ html: "<p>first attempt</p>" }), unavailable);
    // A failed browser promise and limiter slot must not poison another call.
    await assert.rejects(() => renderer.measure({ html: "<p>retry</p>", widths: [728] }), unavailable);
    assert.equal(launches, 0);
  });
}
