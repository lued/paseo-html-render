import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildInteractiveDocument } from "../shared/html-document.ts";
import { findChromiumExecutable } from "../server/renderer.ts";
import {
  withSrcdocFrames,
  type SrcdocFrame,
  type SrcdocFrameSpec,
} from "./helpers/srcdoc-frame.ts";

const source = await fs.readFile(join(process.cwd(), "examples/interactive/flow.html"), "utf8");
const documentHtml = buildInteractiveDocument({ html: source, title: "Flow hit-target regression" });

const specs: readonly SrcdocFrameSpec[] = [
  { id: "n375", width: 375, height: 900, sandbox: "allow-scripts", x: 0, y: 0 },
  { id: "n390", width: 390, height: 900, sandbox: "allow-scripts", x: 385, y: 0 },
  { id: "wide", width: 1024, height: 900, sandbox: "allow-scripts", x: 0, y: 910 },
  { id: "static", width: 390, height: 900, sandbox: "", x: 0, y: 1820 },
];

interface Hit {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function stageRect(frame: SrcdocFrame, stage: string): Promise<Hit> {
  return frame.eval<Hit>(`(() => {
    const r = document.querySelector('[data-stage="${stage}"]').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`);
}

async function probe(frame: SrcdocFrame): Promise<Record<string, any>> {
  return frame.eval<Record<string, any>>(`(() => {
    const root = document.documentElement;
    const active = document.activeElement;
    return {
      title: document.getElementById("detail-title")?.textContent ?? null,
      pressed: Array.from(document.querySelectorAll(".stage")).map((b) => b.getAttribute("aria-pressed")),
      active: active ? (active.getAttribute("data-stage") || active.id || active.tagName) : null,
      js: root.classList.contains("js"),
      staticDisplay: getComputedStyle(document.querySelector(".details-static")).display,
      liveDisplay: getComputedStyle(document.querySelector(".details-live")).display,
      disabled: Array.from(document.querySelectorAll(".stage")).map((b) => b.disabled),
      overflow: root.scrollWidth > root.clientWidth + 1 || document.body.scrollWidth > root.clientWidth + 1,
      trackColumns: getComputedStyle(document.getElementById("stage-track")).gridTemplateColumns,
      dataMotion: root.getAttribute("data-motion"),
      reduceMatch: matchMedia("(prefers-reduced-motion: reduce)").matches,
      animation: getComputedStyle(document.getElementById("detail-panel")).animationName,
      origin: window.origin,
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? null,
      text: (document.querySelector(".page") || document.body).innerText,
      chevrons: Array.from(document.querySelectorAll(".chevron")).map((e) => ({
        ariaHidden: e.getAttribute("aria-hidden"),
        pointerEvents: getComputedStyle(e).pointerEvents,
        rect: (() => { const r = e.getBoundingClientRect(); return { y: r.y, height: r.height }; })(),
      })),
      resources: performance.getEntriesByType("resource").map((e) => e.name),
    };
  })()`);
}

async function hitAtCenter(frame: SrcdocFrame, stage: string): Promise<Record<string, unknown> | null> {
  const rect = await stageRect(frame, stage);
  return frame.eval<Record<string, unknown> | null>(`(() => {
    const e = document.elementFromPoint(${rect.x + rect.width / 2}, ${rect.y + rect.height / 2});
    const stage = e && e.closest ? e.closest(".stage") : null;
    return e ? { tag: e.tagName, cls: e.className, stage: stage ? stage.getAttribute("data-stage") : null } : null;
  })()`);
}

async function reset(frame: SrcdocFrame): Promise<void> {
  await frame.eval(`document.querySelector('[data-stage="build"]').focus()`);
  await frame.key("Home", "Home", 36);
  await frame.waitFor(`document.getElementById("detail-title").textContent === "Build"`);
}

async function clickStage(frame: SrcdocFrame, stage: string, fractionX = 0.5): Promise<void> {
  const rect = await stageRect(frame, stage);
  await frame.click(rect.x + rect.width * fractionX, rect.y + rect.height / 2);
}

async function touchStage(frame: SrcdocFrame, stage: string, fractionX = 0.5): Promise<void> {
  const rect = await stageRect(frame, stage);
  await frame.touch(rect.x + rect.width * fractionX, rect.y + rect.height / 2);
}

test("flow stage cards stay clickable and tappable at narrow widths", { timeout: 120_000 }, async (t) => {
  if (!findChromiumExecutable()) {
    t.skip("Chromium unavailable");
    return;
  }

  const results = await withSrcdocFrames({
    doc: documentHtml,
    specs,
    viewport: { width: 1500, height: 2800 },
    async run(frames) {
      await frames.n375.waitFor(`document.readyState === "complete" && document.documentElement.classList.contains("js") && Array.from(document.querySelectorAll(".stage")).every((b) => !b.disabled)`);
      await frames.n390.waitFor(`document.readyState === "complete" && document.documentElement.classList.contains("js") && Array.from(document.querySelectorAll(".stage")).every((b) => !b.disabled)`);
      await frames.wide.waitFor(`document.readyState === "complete" && document.documentElement.classList.contains("js") && Array.from(document.querySelectorAll(".stage")).every((b) => !b.disabled)`);
      await frames.static.waitFor(`document.readyState === "complete" && !document.documentElement.classList.contains("js")`);

      const n375: Record<string, any> = {};
      n375.centerHit = await hitAtCenter(frames.n375, "verify");
      await clickStage(frames.n375, "verify");
      n375.mouseCenter = await probe(frames.n375);
      await reset(frames.n375);
      await clickStage(frames.n375, "verify", 0.08);
      n375.mouseLeft = await probe(frames.n375);
      await reset(frames.n375);
      n375.touchCenterHit = await hitAtCenter(frames.n375, "stage");
      await touchStage(frames.n375, "stage");
      n375.touchCenter = await probe(frames.n375);
      await reset(frames.n375);
      await touchStage(frames.n375, "release", 0.08);
      n375.touchLeft = await probe(frames.n375);
      await reset(frames.n375);

      const n390: Record<string, any> = {};
      await clickStage(frames.n390, "verify");
      n390.mouseCenter = await probe(frames.n390);
      await reset(frames.n390);
      await touchStage(frames.n390, "stage");
      n390.touchCenter = await probe(frames.n390);
      await reset(frames.n390);
      await frames.n390.eval(`document.querySelector('[data-stage="build"]').focus()`);
      await frames.n390.key("ArrowRight", "ArrowRight", 39);
      n390.afterArrowRight = await probe(frames.n390);
      await frames.n390.key("End", "End", 35);
      n390.afterEnd = await probe(frames.n390);
      await frames.n390.key("Home", "Home", 36);
      n390.afterHome = await probe(frames.n390);

      await frames.n390.setMedia(true);
      const reducedBefore = await probe(frames.n390);
      await clickStage(frames.n390, "verify");
      const reducedAfter = await probe(frames.n390);
      await reset(frames.n390);
      await frames.n390.setMedia(false);
      const fullBefore = await probe(frames.n390);
      await clickStage(frames.n390, "verify");
      const fullAfter = await probe(frames.n390);
      await reset(frames.n390);
      await frames.n390.setMedia(true);
      await reset(frames.n390);

      const wide: Record<string, any> = {};
      await clickStage(frames.wide, "verify");
      wide.mouseCenter = await probe(frames.wide);

      const staticState = await probe(frames.static);
      return { n375, n390, wide, static: staticState, reducedBefore, reducedAfter, fullBefore, fullAfter };
    },
  });

  assert.equal(
    results.n375.mouseCenter.title,
    "Verify",
    JSON.stringify(results, null, 2),
  );
  assert.equal(results.n375.centerHit?.stage, "verify", JSON.stringify(results.n375.centerHit));
  assert.equal(results.n375.mouseLeft.title, "Verify", JSON.stringify(results.n375.mouseLeft));
  assert.equal(results.n375.touchCenter.title, "Stage", JSON.stringify(results.n375.touchCenter));
  assert.equal(results.n375.touchCenterHit?.stage, "stage", JSON.stringify(results.n375.touchCenterHit));
  assert.equal(results.n375.touchLeft.title, "Release", JSON.stringify(results.n375.touchLeft));
  assert.equal(results.n390.mouseCenter.title, "Verify", JSON.stringify(results.n390.mouseCenter));
  assert.equal(results.n390.touchCenter.title, "Stage", JSON.stringify(results.n390.touchCenter));
  assert.equal(results.n390.afterArrowRight.title, "Verify", JSON.stringify(results.n390.afterArrowRight));
  assert.equal(results.n390.afterArrowRight.active, "verify");
  assert.equal(results.n390.afterEnd.title, "Release", JSON.stringify(results.n390.afterEnd));
  assert.equal(results.n390.afterEnd.active, "release");
  assert.equal(results.n390.afterHome.title, "Build", JSON.stringify(results.n390.afterHome));
  assert.equal(results.n390.afterHome.active, "build");
  assert.equal(results.wide.mouseCenter.title, "Verify", JSON.stringify(results.wide.mouseCenter));

  assert.equal(results.reducedBefore.reduceMatch, true);
  assert.equal(results.reducedBefore.dataMotion, "reduce");
  assert.equal(results.reducedAfter.title, "Verify");
  assert.equal(results.reducedAfter.animation, "none");
  assert.equal(results.fullBefore.reduceMatch, false);
  assert.equal(results.fullBefore.dataMotion, "full");
  assert.equal(results.fullAfter.title, "Verify");
  assert.equal(results.fullAfter.animation, "detail-in");

  assert.equal(results.static.js, false);
  assert.equal(results.static.origin, "null");
  assert.match(String(results.static.csp), /default-src 'none'/);
  assert.equal(results.static.staticDisplay, "block");
  assert.equal(results.static.liveDisplay, "none");
  assert.ok(results.static.disabled.every(Boolean));
  assert.match(String(results.static.text), /What happens at each stage/);
  assert.match(String(results.static.text), /Release/);
  assert.equal(results.static.overflow, false);

  assert.equal(results.n375.mouseCenter.overflow, false);
  assert.equal(results.n390.mouseCenter.overflow, false);
  assert.equal(results.wide.mouseCenter.overflow, false);
  assert.equal(results.n375.mouseCenter.origin, "null");
  assert.match(String(results.n375.mouseCenter.csp), /default-src 'none'/);
  assert.ok(results.n375.mouseCenter.chevrons.every((c: { pointerEvents: string; ariaHidden: string }) =>
    c.pointerEvents === "none" && c.ariaHidden === "true"));
  assert.deepEqual(results.n375.mouseCenter.resources, []);
  assert.deepEqual(results.n390.mouseCenter.resources, []);
  assert.deepEqual(results.wide.mouseCenter.resources, []);
});

test("inspector static copy stays accurate for stacked and side-by-side layouts", { timeout: 60_000 }, async (t) => {
  if (!findChromiumExecutable()) {
    t.skip("Chromium unavailable");
    return;
  }
  const html = await fs.readFile(join(process.cwd(), "examples/interactive/inspector.html"), "utf8");
  const states = await withSrcdocFrames({
    doc: buildInteractiveDocument({ html, title: "Inspector static reflow regression" }),
    specs: [
      { id: "static", width: 390, height: 1000, sandbox: "", x: 0, y: 0 },
      { id: "wide", width: 1024, height: 1000, sandbox: "", x: 400, y: 0 },
    ],
    viewport: { width: 1500, height: 1100 },
    async run(frames) {
      const result: Record<string, any> = {};
      for (const [id, frame] of Object.entries(frames)) {
        await frame.waitFor(`document.readyState === "complete"`);
        result[id] = await frame.eval<Record<string, any>>(`(() => ({
          note: document.querySelector(".static-note").textContent.trim(),
          noteDisplay: getComputedStyle(document.querySelector(".static-note")).display,
          columns: getComputedStyle(document.querySelector(".compare-stage")).gridTemplateColumns.split(" ").length,
          labels: Array.from(document.querySelectorAll(".compare-layer")).map(e => e.getAttribute("aria-label")),
          disabled: document.getElementById("split").disabled,
          controlsDisplay: getComputedStyle(document.querySelector(".compare-controls")).display,
          js: document.documentElement.classList.contains("js"),
          origin: window.origin,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          resources: performance.getEntriesByType("resource").map(e => e.name)
        }))()`);
      }
      return result;
    },
  });
  for (const state of Object.values(states)) {
    assert.equal(state.note, "Both versions are shown. The draggable comparison is an optional enhancement.");
    assert.equal(state.noteDisplay, "block");
    assert.equal(state.disabled, true);
    assert.equal(state.controlsDisplay, "none");
    assert.equal(state.js, false);
    assert.equal(state.origin, "null");
    assert.equal(state.overflow, false);
    assert.equal(state.labels.length, 2);
    assert.match(state.labels[0], /^Before:/);
    assert.match(state.labels[1], /^After:/);
    assert.deepEqual(state.resources, []);
  }
  assert.equal(states.static.columns, 1);
  assert.equal(states.wide.columns, 2);
});
