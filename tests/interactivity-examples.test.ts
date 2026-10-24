import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { browserResult } from "./helpers/browser.ts";
import {
  HTML_DOCUMENT_CSP_META,
  HTML_FRAME_SANDBOX,
  buildInteractiveDocument,
  buildLiveDocument,
  defaultDocumentTheme,
} from "../shared/html-document.ts";
import { createRenderer, RenderError } from "../server/renderer.ts";

const EXAMPLES = ["flow", "inspector", "filter"] as const;
type ExampleName = (typeof EXAMPLES)[number];

const source: Record<ExampleName, string> = {
  flow: await fs.readFile(join(process.cwd(), "examples/interactive/flow.html"), "utf8"),
  inspector: await fs.readFile(join(process.cwd(), "examples/interactive/inspector.html"), "utf8"),
  filter: await fs.readFile(join(process.cwd(), "examples/interactive/filter.html"), "utf8"),
};

let lastStatic: Record<string, unknown> | undefined;
let unavailable: string | null = null;

/** The renderer hook records the script-disabled DOM for the last capture. */
const renderer = createRenderer({
  timeoutMs: 20_000,
  maxConcurrent: 1,
  async inspectDom(evaluate) {
    lastStatic = (await evaluate(`(() => {
      const display = (selector) => {
        const element = document.querySelector(selector);
        return element ? getComputedStyle(element).display : null;
      };
      const page = document.querySelector(".page") || document.body;
      const remote = Array.from(document.querySelectorAll("[src], [href]"))
        .map((element) => element.getAttribute("src") || element.getAttribute("href") || "")
        .filter((value) => value && !value.startsWith("data:"));
      return {
        js: document.documentElement.classList.contains("js"),
        overflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 ||
          (document.body.scrollWidth || 0) > document.documentElement.clientWidth + 1,
        width: document.documentElement.clientWidth,
        background: getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
        foreground: getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim(),
        text: page.innerText,
        flowStatic: display(".details-static"),
        flowLive: display(".details-live"),
        filters: display(".filters"),
        compareNote: display(".static-note"),
        compareControls: display(".compare-controls"),
        disabledControls: Array.from(document.querySelectorAll("button, input")).map((element) => ({
          tag: element.tagName,
          disabled: element.disabled === true,
        })),
        labels: Array.from(document.querySelectorAll(".compare-layer")).map((element) =>
          element.getAttribute("aria-label"),
        ),
        remote,
      };
    })()`)) as Record<string, unknown>;
  },
});

try {
  const probe = await renderer.render({ html: "<p>interactivity probe</p>" });
  assert.equal(probe.png.subarray(1, 4).toString("latin1"), "PNG");
} catch (error) {
  if (error instanceof RenderError && error.code === "browser_unavailable") {
    unavailable = `Chromium unavailable: ${error.message}`;
  } else {
    throw error;
  }
}

function skipIfUnavailable(t: { skip(message: string): void }): boolean {
  if (!unavailable) return false;
  t.skip(unavailable);
  return true;
}

test.after(async () => {
  await renderer.close();
});

function liveDocument(example: ExampleName, run: string): string {
  const driver = `<script>
(function () {
  function execute() {
    ${run}
  }
  window.addEventListener("message", function (event) {
    if (event.data && event.data.kind === "interactivity-run") setTimeout(execute, 30);
  }, false);
  parent.postMessage({ kind: "interactivity-ready" }, "*");
})();
</script>`;
  return buildLiveDocument({
    html: source[example].replace("</body>", driver + "</body>"),
    title: `Interactivity example: ${example}`,
    theme: defaultDocumentTheme("dark"),
  });
}

function safeJson(value: string): string {
  return JSON.stringify(value).split("</script").join("<\\/script");
}

/**
 * Runs each example in a real sandboxed `allow-scripts` frame at phone and
 * desktop widths. The parent focuses one frame at a time so keyboard assertions
 * are not racing the other frame for focus.
 */
function liveHarness(document: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  html, body { margin: 0; background: #111; color: #eee; font-family: sans-serif; }
  body { display: flex; gap: 10px; align-items: flex-start; }
  iframe { display: block; flex: 0 0 auto; border: 0; background: #111; }
</style></head><body>
<script>
var DOC = ${safeJson(document)};
var specs = [{ id: "narrow", width: 390 }, { id: "wide", width: 1024 }];
var results = {};
var frames = {};
var queue = [];
var ready = 0;
var running = null;
var finished = false;
specs.forEach(function (spec) {
  var frame = document.createElement("iframe");
  frame.id = spec.id;
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("title", "interactivity example " + spec.id);
  frame.style.width = spec.width + "px";
  frame.style.height = "1400px";
  frames[spec.id] = frame;
  document.body.appendChild(frame);
  frame.srcdoc = DOC;
});
function finish() {
  if (finished) return;
  finished = true;
  results.harness = {
    csp: DOC.indexOf("Content-Security-Policy") !== -1,
    sandbox: specs.map(function (spec) { return frames[spec.id].getAttribute("sandbox"); })
  };
  window.__result = results;
}
function next() {
  if (running) return;
  if (queue.length === 0) {
    if (ready === specs.length) finish();
    return;
  }
  running = queue.shift();
  frames[running.id].focus();
  frames[running.id].contentWindow.postMessage({ kind: "interactivity-run" }, "*");
}
window.addEventListener("message", function (event) {
  var data = event.data;
  if (!data) return;
  if (data.kind === "interactivity-ready") {
    ready += 1;
    if (ready === specs.length) {
      queue = specs.slice();
      next();
    }
    return;
  }
  if (data.kind !== "interactivity-test" || !running) return;
  if (frames[running.id].contentWindow !== event.source) return;
  results[running.id] = data.results;
  running = null;
  next();
});
setTimeout(function () {
  if (window.__result) return;
  results.timeout = true;
  window.__result = results;
}, 20_000);
</script></body></html>`;
}

async function runLive(example: ExampleName, run: string): Promise<Record<string, any>> {
  const result = await browserResult(liveHarness(liveDocument(example, run)), {
    viewport: { width: 1500, height: 1450 },
  });
  return result as Record<string, any>;
}

test("examples are self-contained, inline-only, and keep interaction optional", () => {
  for (const name of EXAMPLES) {
    const html = source[name];
    assert.ok(html.length > 0, name);
    assert.doesNotMatch(html, /https?:\/\//i, `${name} must not contain a remote URL`);
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i, `${name} must not load an external script`);
    assert.doesNotMatch(html, /<link\b/i, `${name} must not load an external stylesheet`);
    assert.doesNotMatch(html, /@import|url\s*\(\s*['"]?https?:/i, `${name} must not import remote CSS`);
    assert.doesNotMatch(html, /\beval\s*\(|\bFunction\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket/, `${name} must stay offline`);
    assert.doesNotMatch(html, /allow-same-origin|allow-forms|allow-popups/i);
    assert.match(html, /prefers-reduced-motion/, `${name} must respect reduced motion in CSS`);
    assert.match(html, /matchMedia/, `${name} must respect reduced motion in script logic`);
    assert.match(html, /data-motion/, `${name} must expose an explicit motion state`);
    assert.doesNotMatch(html, /animation[^;{}]*\binfinite\b/i, `${name} must not run a default loop`);
    assert.doesNotMatch(html, /setInterval|requestAnimationFrame/, `${name} must not need a continuous JS loop`);
    assert.match(html, /<body lang="en">/, `${name} declares the document language`);
    assert.match(html, /<(?:button|input)\b/i, `${name} must use native controls`);
    assert.match(html, name === "inspector" ? /aria-valuetext/ : /aria-pressed=/, `${name} must expose control state`);
  }

  assert.match(source.flow, /aria-label="Release pipeline"/, "the flow names its local stage group");
  assert.match(source.inspector, /<svg\b/i, "the inspector uses inline SVG");
  assert.match(source.inspector, /<input[^>]+type="range"/i, "the inspector uses a native range");
  assert.match(source.inspector, /aria-label="Before:/, "the before image has an accessible label");
  assert.match(source.inspector, /aria-label="After:/, "the after image has an accessible label");
  assert.match(source.filter, /Synthetic demo data/i, "demo data is labelled");
  assert.match(source.inspector, /synthetic layout comparison/i, "the illustration is labelled");
  assert.match(source.filter, /<table>/, "the chart has an exact-value fallback");

  const built = buildLiveDocument({
    html: source.flow,
    title: "flow",
    theme: defaultDocumentTheme("dark"),
  });
  assert.ok(built.includes(HTML_DOCUMENT_CSP_META), "the live document keeps the shared CSP");
  assert.ok(built.includes(`id="paseo-html-theme"`));
  assert.ok(built.includes(`id="paseo-html-base"`));
  assert.equal(HTML_FRAME_SANDBOX, "allow-scripts");
  assert.ok(buildInteractiveDocument({ html: source.flow }).includes(HTML_DOCUMENT_CSP_META));
});

test("examples are useful and reflow without overflow when JavaScript is disabled", { timeout: 90_000 }, async (t) => {
  if (skipIfUnavailable(t)) return;

  for (const name of EXAMPLES) {
    for (const width of [390, 1024]) {
      const output = await renderer.render({ html: source[name], width, appearance: "dark" });
      assert.equal(output.png.subarray(1, 4).toString("latin1"), "PNG", `${name} ${width}`);
      assert.equal(output.width, width);
      assert.ok(lastStatic, `${name} ${width} produced DOM evidence`);
      const observed = lastStatic!;
      assert.equal(observed.width, width, `${name} ${width} rendered at the requested width`);
      assert.equal(observed.js, false, `${name} static capture must not run page scripts`);
      assert.equal(observed.overflow, false, `${name} must not overflow at ${width}px`);
      assert.deepEqual(observed.remote, [], `${name} must not request a remote resource`);

      if (name === "flow") {
        assert.notEqual(observed.flowStatic, "none", "stage details are readable without JS");
        assert.equal(observed.flowLive, "none", "the live detail panel stays out of the static view");
        assert.match(String(observed.text), /What happens at each stage/);
        assert.match(String(observed.text), /Publish to a staging URL/);
        assert.match(String(observed.text), /rollback path is known/);
        assert.ok(
          (observed.disabledControls as Array<{ disabled: boolean }>).every((control) => control.disabled),
          "controls are inert until the enhancement runs",
        );
      }

      if (name === "inspector") {
        assert.notEqual(observed.compareNote, "none", "the static before/after explanation is visible");
        assert.equal(observed.compareControls, "none", "the slider is hidden without JS");
        assert.match(String(observed.text), /Both versions are shown side by side/);
        assert.match(String(observed.text), /Before: dense draft/);
        assert.match(String(observed.text), /After: clearer final/);
        assert.deepEqual(observed.labels, [
          "Before: a dense draft with small, low-contrast panels and a crowded sidebar.",
          "After: a clearer final with fewer panels, stronger hierarchy and a four-bar chart.",
        ]);
        assert.ok(
          (observed.disabledControls as Array<{ tag: string; disabled: boolean }>).some(
            (control) => control.tag === "INPUT" && control.disabled,
          ),
          "the range is inert without JS",
        );
      }

      if (name === "filter") {
        assert.equal(observed.filters, "none", "filter controls are hidden without JS");
        assert.match(String(observed.text), /All 6 services · 1,650 requests/);
        assert.match(String(observed.text), /Synthetic demo data/);
        assert.match(String(observed.text), /View exact values/);
      }

      if (width === 1024) {
        const darkBackground = observed.background;
        const light = await renderer.render({ html: source[name], width, appearance: "light" });
        assert.equal(light.png.subarray(1, 4).toString("latin1"), "PNG");
        assert.equal(lastStatic?.js, false);
        assert.equal(lastStatic?.overflow, false, `${name} must not overflow in light mode`);
        assert.notEqual(lastStatic?.background, darkBackground, `${name} follows the host light theme`);
        assert.notEqual(lastStatic?.foreground, observed.foreground, `${name} changes foreground tokens`);
      }
    }
  }
});

const flowRun = `
  var out = { innerWidth: innerWidth };
  try {
    window.focus();
    var root = document.documentElement;
    out.jsClass = root.classList.contains("js");
    out.staticDisplay = getComputedStyle(document.querySelector(".details-static")).display;
    out.liveDisplay = getComputedStyle(document.querySelector(".details-live")).display;
    var buttons = Array.prototype.slice.call(document.querySelectorAll(".stage"));
    out.stageCount = buttons.length;
    out.native = buttons.every(function (button) {
      return button.tagName === "BUTTON" && button.type === "button" && !button.disabled;
    });
    buttons[0].click();
    buttons[0].focus();
    out.focusStart = document.activeElement === buttons[0];
    buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    out.keyboard = document.getElementById("detail-title").textContent;
    out.keyboardFocus = document.activeElement === buttons[1];
    buttons[2].click();
    out.clicked = document.getElementById("detail-title").textContent;
    out.pressed = buttons.map(function (button) { return button.getAttribute("aria-pressed"); }).join(",");
    root.setAttribute("data-motion", "full");
    buttons[1].click();
    out.fullAnimation = getComputedStyle(document.getElementById("detail-panel")).animationName;
    root.setAttribute("data-motion", "reduce");
    buttons[2].click();
    out.reducedAnimation = getComputedStyle(document.getElementById("detail-panel")).animationName;
    out.mediaQuery = Array.prototype.some.call(document.styleSheets, function (sheet) {
      try {
        return Array.prototype.some.call(sheet.cssRules, function (rule) {
          return String(rule.cssText).indexOf("prefers-reduced-motion") !== -1;
        });
      } catch (error) {
        return false;
      }
    });
    out.overflow = document.documentElement.scrollWidth > innerWidth + 1 ||
      document.body.scrollWidth > innerWidth + 1;
    out.text = (document.querySelector(".page") || document.body).innerText.slice(0, 500);
  } catch (error) {
    out.error = String(error);
    out.stack = error && error.stack;
  }
  parent.postMessage({ kind: "interactivity-test", results: out }, "*");
`;

const inspectorRun = `
  var out = { innerWidth: innerWidth };
  try {
    window.focus();
    var root = document.documentElement;
    out.jsClass = root.classList.contains("js");
    out.staticNote = getComputedStyle(document.querySelector(".static-note")).display;
    out.controls = getComputedStyle(document.querySelector(".compare-controls")).display;
    var frame = document.getElementById("compare");
    var range = document.getElementById("split");
    out.rangeDisabled = range.disabled;
    range.value = "25";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    out.split = getComputedStyle(frame).getPropertyValue("--split").trim();
    out.output = document.getElementById("split-readout").textContent;
    out.clip = getComputedStyle(document.querySelector(".compare-after")).clipPath;
    out.valueText = range.getAttribute("aria-valuetext");
    range.focus();
    out.focus = document.activeElement === range;
    out.labels = Array.prototype.map.call(document.querySelectorAll(".compare-layer"), function (layer) {
      return layer.getAttribute("aria-label");
    });
    out.resources = performance.getEntriesByType("resource").map(function (entry) { return entry.name; });
    out.overflow = document.documentElement.scrollWidth > innerWidth + 1 ||
      document.body.scrollWidth > innerWidth + 1;
    out.text = (document.querySelector(".page") || document.body).innerText.slice(0, 500);
  } catch (error) {
    out.error = String(error);
    out.stack = error && error.stack;
  }
  parent.postMessage({ kind: "interactivity-test", results: out }, "*");
`;

const filterRun = `
  var out = { innerWidth: innerWidth };
  try {
    window.focus();
    var root = document.documentElement;
    out.jsClass = root.classList.contains("js");
    out.controls = getComputedStyle(document.querySelector(".filters")).display;
    out.initial = document.getElementById("filter-summary").textContent;
    var buttons = Array.prototype.slice.call(document.querySelectorAll(".filter"));
    out.native = buttons.every(function (button) { return button.tagName === "BUTTON" && !button.disabled; });
    buttons[2].click();
    out.after = document.getElementById("filter-summary").textContent;
    out.visible = Array.prototype.slice.call(document.querySelectorAll(".bar-row"))
      .filter(function (row) { return !row.hidden; })
      .map(function (row) { return row.getAttribute("data-group"); })
      .join(",");
    out.pressed = buttons.map(function (button) { return button.getAttribute("aria-pressed"); }).join(",");
    out.tableVisible = Array.prototype.slice.call(document.querySelectorAll(".data-table tbody tr"))
      .filter(function (row) { return !row.hidden; }).length;
    root.setAttribute("data-motion", "full");
    buttons[1].click();
    var visibleRow = document.querySelector(".bar-row:not([hidden])");
    out.fullAnimation = getComputedStyle(visibleRow).animationName;
    root.setAttribute("data-motion", "reduce");
    buttons[2].click();
    visibleRow = document.querySelector(".bar-row:not([hidden])");
    out.reducedAnimation = getComputedStyle(visibleRow).animationName;
    out.mediaQuery = Array.prototype.some.call(document.styleSheets, function (sheet) {
      try {
        return Array.prototype.some.call(sheet.cssRules, function (rule) {
          return String(rule.cssText).indexOf("prefers-reduced-motion") !== -1;
        });
      } catch (error) {
        return false;
      }
    });
    out.resources = performance.getEntriesByType("resource").map(function (entry) { return entry.name; });
    out.overflow = document.documentElement.scrollWidth > innerWidth + 1 ||
      document.body.scrollWidth > innerWidth + 1;
    out.text = (document.querySelector(".page") || document.body).innerText.slice(0, 500);
  } catch (error) {
    out.error = String(error);
    out.stack = error && error.stack;
  }
  parent.postMessage({ kind: "interactivity-test", results: out }, "*");
`;

test("the flow example changes state by click and keyboard in the sandbox", { timeout: 60_000 }, async (t) => {
  if (skipIfUnavailable(t)) return;
  const result = await runLive("flow", flowRun);
  assert.equal(result.harness?.csp, true, "the framed document carries the CSP");
  assert.deepEqual(result.harness?.sandbox, ["allow-scripts", "allow-scripts"]);
  for (const width of ["narrow", "wide"] as const) {
    const seen = result[width];
    assert.equal(seen?.error, undefined, seen?.stack);
    assert.equal(seen.innerWidth, width === "narrow" ? 390 : 1024);
    assert.equal(seen.jsClass, true, "the enhancement runs only after the static document exists");
    assert.equal(seen.staticDisplay, "none", "the live panel replaces the static list after enhancement");
    assert.equal(seen.liveDisplay, "block");
    assert.equal(seen.stageCount, 4);
    assert.equal(seen.native, true, "all stages are enabled native buttons");
    assert.equal(seen.focusStart, true, "a stage accepts keyboard focus");
    assert.equal(seen.keyboard, "Verify", "ArrowRight selects the next stage");
    assert.equal(seen.keyboardFocus, true, "ArrowRight moves focus with selection");
    assert.equal(seen.clicked, "Stage", "a click updates the detail panel");
    assert.equal(seen.pressed, "false,false,true,false", "aria-pressed follows the selection");
    assert.equal(seen.fullAnimation, "detail-in", "the state change has a short purposeful reveal");
    assert.equal(seen.reducedAnimation, "none", "reduced motion removes the reveal");
    assert.equal(seen.mediaQuery, true, "the CSS media query is present");
    assert.equal(seen.overflow, false, "no horizontal overflow");
  }
});

test("the inspector changes its split and keeps both images labelled", { timeout: 60_000 }, async (t) => {
  if (skipIfUnavailable(t)) return;
  const result = await runLive("inspector", inspectorRun);
  assert.equal(result.harness?.csp, true);
  assert.deepEqual(result.harness?.sandbox, ["allow-scripts", "allow-scripts"]);
  for (const width of ["narrow", "wide"] as const) {
    const seen = result[width];
    assert.equal(seen?.error, undefined, seen?.stack);
    assert.equal(seen.innerWidth, width === "narrow" ? 390 : 1024);
    assert.equal(seen.jsClass, true);
    assert.equal(seen.staticNote, "none", "the static note is replaced by the live control");
    assert.equal(seen.controls, "flex");
    assert.equal(seen.rangeDisabled, false);
    assert.equal(seen.split, "25%");
    assert.equal(seen.output, "25% after");
    assert.equal(seen.clip, "inset(0px 0px 0px 75%)", "the final image is clipped from the left");
    assert.equal(seen.valueText, "25 percent of the final layout visible");
    assert.equal(seen.focus, true, "the native range accepts focus");
    assert.deepEqual(seen.labels, [
      "Before: a dense draft with small, low-contrast panels and a crowded sidebar.",
      "After: a clearer final with fewer panels, stronger hierarchy and a four-bar chart.",
    ]);
    assert.deepEqual(seen.resources, [], "a local control loads no external resource");
    assert.equal(seen.overflow, false);
  }
});

test("the chart filter keeps exact values and reduces motion in the sandbox", { timeout: 60_000 }, async (t) => {
  if (skipIfUnavailable(t)) return;
  const result = await runLive("filter", filterRun);
  assert.equal(result.harness?.csp, true);
  assert.deepEqual(result.harness?.sandbox, ["allow-scripts", "allow-scripts"]);
  for (const width of ["narrow", "wide"] as const) {
    const seen = result[width];
    assert.equal(seen?.error, undefined, seen?.stack);
    assert.equal(seen.innerWidth, width === "narrow" ? 390 : 1024);
    assert.equal(seen.jsClass, true);
    assert.equal(seen.controls, "flex");
    assert.equal(seen.initial, "All · 6 of 6 services · 1,650 requests");
    assert.equal(seen.native, true);
    assert.equal(seen.after, "Content · 3 of 6 services · 530 requests");
    assert.equal(seen.visible, "content,content,content", "only the selected group remains");
    assert.equal(seen.pressed, "false,false,true");
    assert.equal(seen.tableVisible, 3, "the exact-value table follows the filter");
    assert.equal(seen.fullAnimation, "row-in", "filtered rows use a short reveal");
    assert.equal(seen.reducedAnimation, "none", "reduced motion removes the reveal");
    assert.equal(seen.mediaQuery, true);
    assert.deepEqual(seen.resources, []);
    assert.equal(seen.overflow, false);
  }
});
