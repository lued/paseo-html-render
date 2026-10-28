import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { assertNoClientClasses } from "../scripts/client-syntax.ts";

test("production client entry compiles without class syntax for Hermes eval", async () => {
  const result = await build({
    entryPoints: ["index.client.tsx"], bundle: true, platform: "neutral",
    format: "cjs", jsx: "automatic", target: "es2020",
    supported: { "async-await": false }, write: false,
    // Explicit host SDK entries, matching scripts/check-bundles.mjs. A wildcard
    // would also externalize the private `@getpaseo/plugin/client/host`.
    external: ["react", "react/jsx-runtime", "react-native", "@tanstack/react-query", "zod",
      "@getpaseo/plugin", "@getpaseo/plugin/server", "@getpaseo/plugin/server/provider",
      "@getpaseo/plugin/server/usage", "@getpaseo/plugin/server/acp",
      "@getpaseo/plugin/client", "@getpaseo/plugin/client/ui",
      "@getpaseo/plugin/client/react-native"],
  });
  assert.ok(result.outputFiles[0]);
  assertNoClientClasses(result.outputFiles[0].text);
});

test("Hermes class guard rejects actual classes, not HTML attributes or script text", () => {
  assert.doesNotThrow(() => assertNoClientClasses(`const html = '<div class="report">class Example {}</div>'; /* class */`));
  assert.throws(() => assertNoClientClasses("const Catalog = class {};"), /class-free/);
  assert.throws(() => assertNoClientClasses("class Catalog {}"), /class-free/);
});
