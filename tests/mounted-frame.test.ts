import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { browserResult } from "./helpers/browser.ts";

test("mounted frame: inline only, no fullscreen, stable theme, spoof rejection, no image fallback and native gate", {timeout: 45_000}, async () => {
  const bundle = await build({
    stdin: { contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {HtmlFrame} from './client/html-frame.tsx';
      import {DEFAULT_HTML_DOCUMENT_COLORS, buildInteractiveDocument} from './shared/html-document.ts';
      const root = createRoot(document.getElementById('root'));
      const wait = ms => new Promise(r => setTimeout(r,ms));
      // Bounded readiness probe: a cold browser can take longer than any fixed
      // sleep to create the frame, load the document, and run its handshake.
      const waitFor = async (predicate, timeout = 8000) => {
        const until = Date.now() + timeout;
        while (Date.now() < until) {
          const value = predicate();
          if (value) return value;
          await wait(50);
        }
        return null;
      };
      const results = {};
      let state;
      window.addEventListener('message', e => { if (e.data?.kind === 'probe') state=e.data; });
      const html = '<div style="height:100px">Report</div><script>var count=7; window.addEventListener("message",function(e){if(e.data==="probe")parent.postMessage({kind:"probe",count:count,background:getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),fullscreenEnabled:document.fullscreenEnabled},"*")});<\\/script>';
      let props = {html:buildInteractiveDocument({html,title:'Stored document'}),title:'Mounted report',artifactKey:'one',theme:{colors:DEFAULT_HTML_DOCUMENT_COLORS.dark},requestedHeight:600,platform:'web',renderMode:'auto',};
      const render = () => root.render(React.createElement(HtmlFrame,props));
      const frame = () => document.querySelector('iframe');
      (async()=>{
        render();
        // The component publishes this only after the document's ready message.
        await waitFor(() => frame()?.parentElement?.getAttribute('data-paseo-html-frame-ready') === 'true');
        await waitFor(() => parseFloat(frame()?.style.height) === 100);
        const first = frame();
        results.initialHeight = parseFloat(first?.style.height);
        results.sandbox = first?.getAttribute('sandbox');
        results.allow = first?.getAttribute('allow');
        results.readyProbe = first?.parentElement?.getAttribute('data-paseo-html-frame-ready');
        window.postMessage({jsonrpc:'2.0',method:'ui/notifications/size-changed',params:{height:1900}},'*');
        await wait(100); results.spoofHeight = parseFloat(frame()?.style.height);
        props = {...props,theme:{colors:DEFAULT_HTML_DOCUMENT_COLORS.light}}; render();
        // Repost the probe until the frame answers; a cold start can drop the
        // first message while the document is still loading.
        results.themeState = await waitFor(() => {
          frame()?.contentWindow?.postMessage('probe','*');
          // Wait for the in-place theme update, not merely the first handshake.
          return state?.kind === 'probe' && state.background === '#ffffff' ? state : null;
        });
        results.sameThemeFrame = first === frame();
        results.controls = document.querySelectorAll('button').length;
        results.dialogs = document.querySelectorAll('[role="dialog"]').length;
        results.fixedOverlays = Array.from(document.querySelectorAll('[style]')).filter(el=>el.style.position==='fixed').length;
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); await wait(100);
        results.sameInlineFrame = first === frame();
        props = {...props,platform:'ios'}; render(); await wait(100);
        results.nativeFrames = document.querySelectorAll('iframe').length;
        props = {...props,platform:'web',artifactKey:'blank',html:''}; render(); await wait(1500);
        results.blankFrames = document.querySelectorAll('iframe').length;
        root.unmount();
        window.__result = results;
      })().catch(error=>window.__result={error:String(error),stack:error.stack});
    `, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const js = bundle.outputFiles[0]!.text.replace(/<\/script/gi, "<\\/script");
  const result = await browserResult(`<!doctype html><div id="root"></div><script>${js}</script>`) as Record<string, any>;
  assert.equal(result.error, undefined, result.stack);
  assert.equal(result.sandbox, "allow-scripts");
  assert.equal(result.allow, "fullscreen 'none'", "report content cannot invoke browser fullscreen");
  assert.equal(result.readyProbe, "true", "the frame exposes readiness only after its handshake");
  assert.equal(result.initialHeight, 100, "content shrinks from requested 600px");
  assert.equal(result.spoofHeight, 100, "parent-origin forged height is ignored");
  assert.deepEqual(result.themeState, {kind: "probe", count: 7, background: "#ffffff", fullscreenEnabled: false});
  assert.equal(result.sameThemeFrame, true);
  assert.equal(result.sameInlineFrame, true);
  assert.equal(result.controls, 0, "no expand, close, or fullscreen zoom toolbar");
  assert.equal(result.dialogs, 0, "no fullscreen dialog");
  assert.equal(result.fixedOverlays, 0, "no viewport overlay");
  assert.equal(result.nativeFrames, 0);
  assert.equal(result.blankFrames, 1, "blank content keeps its live frame instead of degrading to a PNG");
});
