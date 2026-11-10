import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { browserResult } from "./helpers/browser.ts";

// A chat timeline that sticks to the bottom (Paseo's web stream) lets go only
// when its scroll container sees the reader's own wheel. A wheel over a live
// card lands in the card's document instead, so the timeline saw a scroll with
// no wheel and snapped back to the bottom. These run a real Chromium wheel over
// the iframe and read what the host's scroll container saw.
test("a wheel over a live card reaches the host's scroll container and scrolls it once", {timeout: 60_000}, async () => {
  const bundle = await build({
    stdin: { contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {HtmlFrame} from './client/html-frame.tsx';
      import {DEFAULT_HTML_DOCUMENT_COLORS, buildInteractiveDocument} from './shared/html-document.ts';
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const waitFor = async (predicate, timeout = 8000) => {
        const until = Date.now() + timeout;
        while (Date.now() < until) { const v = predicate(); if (v) return v; await wait(50); }
        return null;
      };
      const timeline = document.getElementById('timeline');
      const hostWheels = [];
      timeline.addEventListener('wheel', e => hostWheels.push({deltaY: e.deltaY, insideCard: !!e.target.closest?.('[data-paseo-html-frame-ready]')}), {passive: true});
      const html = '<div style="height:160px"><div style="width:3000px">Card wider than the frame</div></div>'
        + '<div id="inner" style="height:80px;overflow:auto"><div style="height:400px">Inner list</div></div>'
        // A web component whose list scrolls inside its open shadow root.
        + '<div id="host" style="height:80px"></div><script>var root=document.getElementById("host").attachShadow({mode:"open"});'
        + 'root.innerHTML="<div id=list style=height:80px;overflow:auto><div style=height:400px>Shadow list</div></div>";'
        + '<\\/script>'
        // A card that posts wheel messages on its own, with no wheel from the reader.
        + '<script>addEventListener("message",function(e){if(e.source!==parent||!e.data||!e.data.burst)return;for(var i=0;i<e.data.burst;i++)parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/wheel",params:{deltaX:0,deltaY:e.data.deltaY,deltaMode:0}},"*");});</script>';
      const wheelArrivals = [];
      window.addEventListener('message', e => { if (e.data?.method === 'ui/notifications/wheel') wheelArrivals.push(performance.now()); });
      const root = createRoot(document.getElementById('card'));
      root.render(React.createElement(HtmlFrame, {
        html: buildInteractiveDocument({html, title: 'Card'}), title: 'Card', artifactKey: 'wheel',
        theme: {colors: DEFAULT_HTML_DOCUMENT_COLORS.dark}, requestedHeight: 600, platform: 'web', renderMode: 'auto',
      }));
      (async () => {
        // Keep the card on screen, as a new card is in a chat: Chromium throttles
        // animation frames in an off-screen cross-origin frame, and the card
        // reports its height on one.
        const frame = await waitFor(() => {
          timeline.scrollTop = timeline.scrollHeight;
          const f = document.querySelector('iframe');
          return f?.parentElement?.getAttribute('data-paseo-html-frame-ready') === 'true' && Math.abs(parseFloat(f.style.height) - 320) <= 2 ? f : null;
        });
        if (!frame) { const f = document.querySelector('iframe'); throw new Error('frame never settled: ready=' + f?.parentElement?.getAttribute('data-paseo-html-frame-ready') + ' height=' + f?.style.height); }
        timeline.scrollTop = timeline.scrollHeight;
        await wait(100);
        // Read where the card is now: a forwarded wheel scrolls the timeline and moves it.
        window.__wheelAt = (where) => {
          const rect = frame.getBoundingClientRect();
          return {x: Math.round(rect.left + 40), y: Math.round(rect.top + (where === 'inner' ? 200 : where === 'shadow' ? 280 : 60))};
        };
        window.__step = async () => {
          await wait(400);
          return {top: timeline.scrollTop, wheels: hostWheels.splice(0)};
        };
        window.__burst = async (count, deltaY) => {
          wheelArrivals.length = 0;
          hostWheels.length = 0;
          timeline.scrollTop = timeline.scrollHeight;
          await wait(100);
          const before = timeline.scrollTop;
          frame.contentWindow.postMessage({burst: count, deltaY}, '*');
          await waitFor(() => wheelArrivals.length >= count, 3000);
          await wait(200);
          const span = wheelArrivals.length ? wheelArrivals[wheelArrivals.length - 1] - wheelArrivals[0] : 0;
          return {arrived: wheelArrivals.length, span, moved: before - timeline.scrollTop, wheels: hostWheels.splice(0).length};
        };
        window.__bottom = timeline.scrollTop;
      })().catch(error => window.__result = {error: String(error), stack: error.stack});
    `, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const js = bundle.outputFiles[0]!.text.replace(/<\/script/gi, "<\\/script");
  const page = `<!doctype html><style>html,body{margin:0}#timeline{height:640px;overflow:auto;scroll-behavior:auto}</style>
    <div id="timeline"><div style="height:8000px">Earlier messages</div><div id="card"></div><div style="height:40px"></div></div>
    <script>${js}</script>`;
  const result = await browserResult(page, {
    viewport: { width: 900, height: 900 },
    interact: async ({ send, sessionId }) => {
      const evaluate = async (expression: string) =>
        (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
      const until = Date.now() + 15_000;
      while (Date.now() < until && !(await evaluate("!!window.__wheelAt"))) await new Promise(r => setTimeout(r, 50));
      if (!(await evaluate("!!window.__wheelAt"))) return;
      const wheel = async (where: "card" | "inner" | "shadow", deltaY: number, deltaX = 0) => {
        const point = await evaluate(`window.__wheelAt(${JSON.stringify(where)})`);
        // A person moves the pointer onto what they scroll before turning the wheel.
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y }, sessionId);
        await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: point.x, y: point.y, deltaX, deltaY }, sessionId);
      };
      const moveTo = (x: number, y: number) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }, sessionId);
      const bottom = await evaluate("window.__bottom");
      await wheel("card", -100);
      const overCard = await evaluate("window.__step()");
      // The inner list starts at its top, so an upward wheel there has nowhere to go
      // inside the card; scroll the inner list down first, then wheel up inside it.
      await wheel("inner", 100);
      const innerDown = await evaluate("window.__step()");
      await wheel("inner", -50);
      const innerUp = await evaluate("window.__step()");
      await wheel("card", 0, 100);
      const sideways = await evaluate("window.__step()");
      await wheel("card", -60, 5);
      const drifting = await evaluate("window.__step()");
      // Bring the whole card on screen for the shadow-root list (setup, not a reader's scroll).
      const shadowFrom = await evaluate("(t => (t.scrollTop = t.scrollHeight, t.scrollTop))(document.getElementById('timeline'))");
      await wheel("shadow", 50);
      const shadowDown = { ...(await evaluate("window.__step()")), from: shadowFrom };
      // A card posting wheel messages on its own, with no wheel from the reader.
      const burst = await evaluate("window.__burst(20, -50)");
      await new Promise(r => setTimeout(r, 400));
      const flood = await evaluate("window.__burst(40, -2000)");
      await evaluate(`window.__result = ${"{"}bottom: ${bottom}, overCard: ${JSON.stringify(overCard)}, innerDown: ${JSON.stringify(innerDown)}, innerUp: ${JSON.stringify(innerUp)}, sideways: ${JSON.stringify(sideways)}, drifting: ${JSON.stringify(drifting)}, shadowDown: ${JSON.stringify(shadowDown)}, burst: ${JSON.stringify(burst)}, flood: ${JSON.stringify(flood)}${"}"}`);
    },
  }) as Record<string, any>;
  assert.equal(result.error, undefined, result.stack);

  const { bottom, overCard, innerDown, innerUp, sideways, drifting, shadowDown, burst, flood } = result;
  assert.ok(bottom > 0, "the timeline starts scrolled to the bottom");
  assert.deepEqual(
    overCard.wheels.map((w: any) => w.deltaY < 0 && w.insideCard),
    [true],
    "the host's scroll container sees exactly one upward wheel, from inside the card",
  );
  const moved = bottom - overCard.top;
  assert.ok(moved >= 50 && moved <= 150, `the timeline scrolls up once by about the wheel's delta, moved ${moved}`);

  // A wheel the card's own scroller can take stays in the card.
  assert.deepEqual(innerDown.wheels, [], "a wheel the card's inner list consumes is not forwarded");
  assert.equal(innerDown.top, overCard.top, "the timeline stays put while the inner list scrolls");
  assert.deepEqual(innerUp.wheels, [], "an upward wheel the inner list can take stays in the card");
  assert.equal(innerUp.top, overCard.top);
  assert.deepEqual(sideways.wheels, [], "a sideways wheel the card's own wide page can take stays in the card");
  // An upward swipe with a little sideways drift is still an upward wheel the card cannot take.
  assert.deepEqual(drifting.wheels.map((w: any) => w.deltaY < 0 && w.insideCard), [true], "a mostly upward wheel is forwarded despite sideways drift");
  assert.ok(sideways.top - drifting.top >= 30, `the timeline scrolls up for a drifting upward wheel, moved ${sideways.top - drifting.top}`);

  // A scroller inside a card's open shadow root keeps its own wheel.
  assert.deepEqual(shadowDown.wheels, [], "a wheel a shadow-root list can take is not forwarded");
  assert.equal(shadowDown.top, shadowDown.from, "the timeline stays put while the shadow-root list scrolls");

  // Wheels arriving within one frame are summed and applied once: nothing is dropped, nothing queued.
  assert.equal(burst.arrived, 20, "the card posted its wheels");
  assert.ok(burst.wheels >= 1 && burst.wheels < 20, `a burst is applied in a few frame-sized steps, not 20: ${burst.wheels}`);
  assert.ok(Math.abs(burst.moved - 20 * 50) <= 2, `the summed distance is kept: moved ${burst.moved}`);
  // A card flooding the host cannot scroll it past the distance budget: 2000 px at once, refilled at 6000 px/s.
  assert.equal(flood.arrived, 40);
  const allowed = 2000 + 6 * (flood.span + 250);
  assert.ok(flood.moved > 0 && flood.moved <= allowed, `a flood of 80,000 px moves at most ${Math.round(allowed)} px: moved ${flood.moved}`);
});

test("a forwarded wheel is read in pixels, bounded, and anything else is refused", async () => {
  const { readWheelMessage, WHEEL_METHOD, MAX_FORWARDED_WHEEL_PX } = await import("../shared/html-document.ts");
  const message = (params: unknown) => ({ jsonrpc: "2.0", method: WHEEL_METHOD, params });
  assert.deepEqual(readWheelMessage(message({ deltaX: 0, deltaY: -100, deltaMode: 0 }), 300), { deltaX: 0, deltaY: -100 });
  assert.deepEqual(readWheelMessage(message({ deltaX: 0, deltaY: -3, deltaMode: 1 }), 300), { deltaX: 0, deltaY: -48 }, "lines are 16px");
  assert.deepEqual(readWheelMessage(message({ deltaX: 0, deltaY: 1, deltaMode: 2 }), 300), { deltaX: 0, deltaY: 300 }, "a page is the card's height");
  assert.deepEqual(readWheelMessage(message({ deltaX: 9e9, deltaY: -9e9, deltaMode: 0 }), 300),
    { deltaX: MAX_FORWARDED_WHEEL_PX, deltaY: -MAX_FORWARDED_WHEEL_PX }, "a page cannot fling the timeline");
  for (const params of [{ deltaX: 0, deltaY: 0 }, { deltaX: "1", deltaY: 1 }, { deltaX: 0, deltaY: Number.NaN }, { deltaX: 0, deltaY: Infinity }, null]) {
    assert.equal(readWheelMessage(message(params), 300), undefined, JSON.stringify(params));
  }
  assert.equal(readWheelMessage({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { deltaX: 0, deltaY: 1 } }, 300), undefined);
});
