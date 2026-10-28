import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { assertNoClientClasses } from "./client-syntax.ts";

/**
 * Mirrors the Paseo 0.14 plugin compiler boundaries instead of approximating
 * them. The host compiles the client bundle with `platform: "neutral"` and
 * `target: "es2020"`, and the server bundle with `platform: "node"` and
 * `target: "node20"`. Only the listed SDK entry points may stay external: a
 * wildcard would also externalize `@getpaseo/plugin/client/host`, which the
 * host rejects, and would hide a forbidden cross-bundle import.
 */
const PLUGIN_SDK_SPECIFIERS = [
  "@getpaseo/plugin",
  "@getpaseo/plugin/server",
  "@getpaseo/plugin/server/provider",
  "@getpaseo/plugin/server/usage",
  "@getpaseo/plugin/server/acp",
  "@getpaseo/plugin/client",
  "@getpaseo/plugin/client/ui",
  "@getpaseo/plugin/client/react-native",
];
const CLIENT_EXTERNALS = [
  "react",
  "react/jsx-runtime",
  "react-native",
  "@tanstack/react-query",
  ...PLUGIN_SDK_SPECIFIERS,
  "zod",
];
const SERVER_EXTERNALS = [
  ...PLUGIN_SDK_SPECIFIERS.filter((name) => !name.startsWith("@getpaseo/plugin/client")),
  "zod",
];
/** The host exposes these only through the public entries above. */
const FORBIDDEN_PRIVATE = "@getpaseo/plugin/client/host";

const directory = process.env.HTML_RENDER_EVIDENCE_DIR
  ? resolve(process.env.HTML_RENDER_EVIDENCE_DIR)
  : await mkdtemp(join(tmpdir(), "html-render-bundles-"));

const client = await build({
  entryPoints: ["index.client.tsx"], bundle: true, platform: "neutral", format: "cjs",
  jsx: "automatic", target: "es2020", metafile: true,
  outfile: join(directory, "client.cjs"),
  external: CLIENT_EXTERNALS,
});
const server = await build({
  entryPoints: ["index.server.ts"], bundle: true, platform: "node", format: "cjs",
  target: "node20", metafile: true, outfile: join(directory, "server.cjs"),
  external: SERVER_EXTERNALS,
});

const clientInputs = Object.keys(client.metafile.inputs);
const serverInputs = Object.keys(server.metafile.inputs);
const clientImports = Object.keys(client.metafile.inputs)
  .flatMap((path) => client.metafile.inputs[path]?.imports ?? [])
  .map((entry) => entry.path);
const serverImports = Object.keys(server.metafile.inputs)
  .flatMap((path) => server.metafile.inputs[path]?.imports ?? [])
  .map((entry) => entry.path);

// The client bundle is host-neutral: no server code, no Pele, no Node builtins
// and no private host entry point.
assert.ok(!clientInputs.some((path) => /(?:^|\/)server\//.test(path)), "server code must not enter the client");
assert.ok(!clientInputs.some((path) => path.includes("node_modules/pele/")), "Pele must stay out of the client");
assert.deepEqual(clientImports.filter((path) => /^node:/.test(path)), [], "client bundle must import no Node builtins");
assert.deepEqual(clientImports.filter((path) => path === FORBIDDEN_PRIVATE), [], "client must not import the private host module");
assert.deepEqual(
  clientInputs.filter((path) => path.includes("node_modules/@getpaseo/plugin/client/host")),
  [],
  "client must not bundle the private host module",
);
// Every non-bundled import is one of the explicit permitted SDK entries.
const bundled = new Set([...clientInputs, ...serverInputs]);
const externalImports = [...new Set([...clientImports, ...serverImports])]
  .filter((path) => !path.startsWith("node:") && !bundled.has(path));
for (const specifier of externalImports) {
  if (specifier === "pele" || specifier.startsWith("node_modules/")) continue;
  assert.ok(
    CLIENT_EXTERNALS.includes(specifier) || SERVER_EXTERNALS.includes(specifier),
    `${specifier} is not an explicit host external`,
  );
  assert.notEqual(specifier, FORBIDDEN_PRIVATE, "the private host entry must never be externalized");
}

const clientText = await readFile(join(directory, "client.cjs"), "utf8");
assertNoClientClasses(clientText);
assert.doesNotMatch(clientText, /require\(["']node:/, "client bundle contains a Node builtin require");
assert.ok(
  serverInputs.some((path) => path.includes("node_modules/pele/")),
  "Pele must be bundled into the server",
);
assert.ok(!serverInputs.some((path) => /(?:^|\/)client\//.test(path)), "client code must not enter the server");
assert.deepEqual(
  serverImports.filter((path) => path.startsWith("@getpaseo/plugin/client")),
  [],
  "server bundle must not import client-only SDK entries",
);

// Shared modules are compiled into both bundles, so they may only use the SDK
// and each other: no Node builtins, no React/React Native, no server/client code.
for (const name of await readdir("shared")) {
  if (!name.endsWith(".ts")) continue;
  const source = await readFile(join("shared", name), "utf8");
  for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
    const specifier = match[1];
    assert.ok(
      specifier.startsWith("./") || specifier.startsWith("../shared/") ||
        specifier === "zod" || specifier === "@getpaseo/plugin",
      `shared/${name} imports a non-shared module: ${specifier}`,
    );
    assert.ok(!specifier.startsWith("node:"), `shared/${name} imports a Node builtin`);
    assert.ok(!/\/(?:server|client)\//.test(specifier), `shared/${name} imports server/client code`);
  }
}

await writeFile(
  join(directory, "bundle-metadata.json"),
  JSON.stringify({ client: client.metafile, server: server.metafile }, null, 2),
);
console.log(JSON.stringify({
  result: "pass",
  directory,
  clientTarget: "es2020",
  serverTarget: "node20",
  clientInputs: clientInputs.length,
  serverInputs: serverInputs.length,
  externals: { client: CLIENT_EXTERNALS, server: SERVER_EXTERNALS },
  pele: "server-only",
}));
