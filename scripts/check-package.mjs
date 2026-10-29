#!/usr/bin/env node
/**
 * Pack the package once and validate the artifact, not the checkout.
 *
 * This deliberately runs `npm pack` (not just a files-list approximation), then
 * extracts the tarball and checks:
 *   - the public runtime/docs/examples allowlist is complete;
 *   - private plans/research/status, tests and scripts are absent;
 *   - relative Markdown and example HTML links resolve inside the tarball;
 *   - the package has no direct @getpaseo/client runtime dependency;
 *   - package, manifest and adapter versions agree.
 *
 * Usage: node scripts/check-package.mjs [--out <dir>] [--json]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoDirectClientImports, isExternalTarget, resolvePackedTarget } from "./package-check-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};
const outDir = resolve(option("out") ?? await fs.mkdtemp(join(tmpdir(), "html-render-package-check-")));
const quiet = args.includes("--json");
const fail = (message) => { throw new Error(message); };
const log = (...values) => { if (!quiet) console.log(...values); };

await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
const packJson = JSON.parse(execFileSync("npm", ["pack", "--pack-destination", outDir, "--json"], {
  cwd: ROOT,
  encoding: "utf8",
  env: { ...process.env, npm_config_ignore_scripts: "true" },
}));
const info = packJson[0];
if (!info?.filename) fail("npm pack returned no filename");
const tarball = join(outDir, info.filename);
const extractDir = await fs.mkdtemp(join(outDir, "extract-"));
try {
  execFileSync("tar", ["-xzf", tarball, "-C", extractDir], { stdio: "ignore" });

  const packageRoot = join(extractDir, "package");
  const files = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(relative(packageRoot, path).split(sep).join("/"));
    }
  }
  await walk(packageRoot);
  files.sort();
  const fileSet = new Set(files);

  const required = [
    "package.json", "paseo-plugin.json", "README.md", "OVERVIEW.md", "SECURITY.md", "CONTRIBUTING.md", "LICENSE", "CHANGELOG.md",
    "index.client.tsx", "index.server.ts",
    "server/authority.ts", "server/contribute.ts", "server/tools.ts", "shared/identity.ts",
    "server/vendor/pele-flowchart.mjs", "server/vendor/LICENSE.pele",
    "docs/compatibility.md", "docs/interactivity.md", "docs/release.md", "docs/showcase.md",
    "docs/images/showcase/hero.png", "docs/images/showcase/image-inspection.png",
    "docs/images/showcase/render-pipeline.png", "docs/images/showcase/incident-timeline.gif",
    "docs/images/showcase/incident-timeline-static.png", "docs/images/showcase/CAPTURES.md",
    "docs/images/showcase/capture.mjs",
    "examples/showcase/image-inspection.html", "examples/showcase/render-pipeline.html",
    "examples/showcase/incident-timeline.html",
    "examples/showcase/assets/settings-before.png", "examples/showcase/assets/settings-after.png",
    "examples/showcase/assets/detail-accent.png", "examples/showcase/assets/detail-sidebar.png",
    "examples/showcase/assets/detail-toggle.png",
    "examples/interactive/flow.html", "examples/interactive/inspector.html", "examples/interactive/filter.html",
    "examples/interactive/captures/manifest.json", "examples/interactive/captures/flow-1024.png",
    "examples/interactive/captures/flow-390.png", "examples/interactive/captures/inspector-1024.png",
    "examples/interactive/captures/inspector-390.png", "examples/interactive/captures/filter-1024.png",
    "examples/interactive/captures/filter-390.png",
  ];
  const missing = required.filter((path) => !fileSet.has(path));
  if (missing.length > 0) fail(`packed tarball is missing required public files:\n${missing.join("\n")}`);

  const forbiddenPrefixes = [
    "tests/", "scripts/", "docs/plans/", "docs/research/", ".github/", "node_modules/",
  ];
  const forbiddenFiles = [
    "HANDOFF.md", "docs/PROJECT-STATUS.md", "docs/verification.md", "docs/t3-parity-quality-matrix.md",
    "docs/paseo-cafe-pr.md", "docs/paseo-cafe-pr-body.md", "docs/paseo-cafe-registry.json",
    "package-lock.json",
  ];
  const forbidden = files.filter((path) =>
    forbiddenPrefixes.some((prefix) => path.startsWith(prefix)) || forbiddenFiles.includes(path));
  if (forbidden.length > 0) fail(`packed tarball contains private/unneeded files:\n${forbidden.join("\n")}`);

  const textExtensions = new Set([".md", ".json", ".html", ".ts", ".tsx", ".mjs"]);
  const privatePatterns = [/\/home\/xander\//i, /\/Users\/[^/\s]+\//i, /\bai-workspace-0\b/i, /~\/\.paseo\/worktrees\//i];
  for (const path of files) {
    if (!textExtensions.has(extname(path))) continue;
    const text = await fs.readFile(join(packageRoot, path), "utf8");
    for (const pattern of privatePatterns) {
      if (pattern.test(text)) fail(`packed file contains a private machine path (${pattern}): ${path}`);
    }
  }

  const markdownFiles = files.filter((path) => path.endsWith(".md"));
  const missingLinks = [];
  const externalLinkCount = { value: 0 };
  const publicLinkCount = { value: 0 };
  for (const path of markdownFiles) {
    const source = await fs.readFile(join(packageRoot, path), "utf8");
    const withoutFences = source.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
    for (const match of withoutFences.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const raw = match[1].trim();
      if (!raw || raw.startsWith("#")) continue;
      if (isExternalTarget(raw)) {
        externalLinkCount.value += 1;
        continue;
      }
      const resolved = resolvePackedTarget(packageRoot, path, raw);
      if (!resolved) continue;
      publicLinkCount.value += 1;
      if (!existsSync(resolved.absolute)) missingLinks.push(`${path} -> ${raw}`);
    }
  }
  if (missingLinks.length > 0) fail(`packed Markdown has missing local targets:\n${missingLinks.join("\n")}`);

  const htmlFiles = files.filter((path) => path.startsWith("examples/") && path.endsWith(".html"));
  for (const path of htmlFiles) {
    const source = await fs.readFile(join(packageRoot, path), "utf8");
    for (const match of source.matchAll(/\b(?:src|href)="([^"]+)"/gi)) {
      const raw = match[1].trim();
      if (!raw || raw.startsWith("#") || isExternalTarget(raw)) continue;
      const resolved = resolvePackedTarget(packageRoot, path, raw);
      if (!resolved) continue;
      if (!existsSync(resolved.absolute)) fail(`packed example has a missing local target: ${path} -> ${raw}`);
    }
  }

  const packedPackage = JSON.parse(await fs.readFile(join(packageRoot, "package.json"), "utf8"));
  const manifest = JSON.parse(await fs.readFile(join(packageRoot, "paseo-plugin.json"), "utf8"));
  const identity = await fs.readFile(join(packageRoot, "shared/identity.ts"), "utf8");
  const adapterVersion = /adapterVersion:\s*"([^"]+)"/.exec(identity)?.[1];
  if (packedPackage.name !== "paseo-html-render") fail("packed package name changed");
  if (packedPackage.private !== false) fail("packed package is not public");
  if (!/^\d+\.\d+\.\d+$/.test(packedPackage.version)) fail("packed package version is not exact semver");
  if (adapterVersion !== packedPackage.version) fail(`adapter ${adapterVersion} != package ${packedPackage.version}`);
  // A git clone installs nothing, so a runtime dependency would need a manifest
  // preparation command and npm on the daemon host. Keep the package clean.
  const runtimeDependencies = Object.keys(packedPackage.dependencies ?? {});
  if (runtimeDependencies.length > 0) fail(`packed package declares runtime dependencies: ${runtimeDependencies.join(", ")}`);
  // The SDK types need 0.14 (session-open `mcpServers`). The manifest range is
  // checked against both the daemon and the app, and mobile apps are on 0.13.2,
  // so it must admit that app version as well as the tested 0.14 daemons.
  const peerRange = packedPackage.peerDependencies?.["@getpaseo/plugin"];
  if (!peerRange?.includes("0.14.0-beta.1")) {
    fail("packed package peer range no longer includes the tested minimum");
  }
  const manifestRange = manifest.requirements?.paseo;
  if (!manifestRange) fail("packed manifest has no Paseo requirement");
  const semverSatisfies = createRequire(import.meta.url)("semver/functions/satisfies");
  for (const version of ["0.13.2", "0.14.0"]) {
    if (!semverSatisfies(version, manifestRange)) {
      fail(`manifest Paseo range ${manifestRange} rejects ${version}`);
    }
  }
  if (!/mcpServerName:\s*"html-render-v3"/.test(identity)) fail("packed identity does not use the v3 MCP key");

  const serverFiles = files.filter((path) => path.startsWith("server/") && path.endsWith(".ts"));
  await assertNoDirectClientImports(serverFiles, async (path) => fs.readFile(join(packageRoot, path), "utf8"));

  const readme = await fs.readFile(join(packageRoot, "README.md"), "utf8");
  const changelog = await fs.readFile(join(packageRoot, "CHANGELOG.md"), "utf8");
  const npmInstall = `paseo plugin install npm:paseo-html-render@${packedPackage.version}`;
  const unreleased = changelog.includes(`## [Unreleased] — ${packedPackage.version} candidate`);
  if (unreleased) {
    if (!readme.includes(`${packedPackage.version} is an unreleased candidate`) ||
        !readme.includes("paseo plugin install .") || readme.includes(npmInstall)) {
      fail("unreleased candidate README must label its status and use a checkout install");
    }
  } else {
    if (!changelog.includes(`## [${packedPackage.version}]`)) fail("CHANGELOG has no section for the package version");
    if (!readme.includes(npmInstall)) fail("README does not show the conditional exact-version npm install command");
  }
  if (!readme.includes("git clone https://github.com/lued/paseo-html-render.git")) {
    fail("README lost the checkout install");
  }

  const sha256 = createHash("sha256").update(await fs.readFile(tarball)).digest("hex");
  const result = {
    result: "pass",
    tarball,
    filename: info.filename,
    version: packedPackage.version,
    size: info.size,
    unpackedSize: info.unpackedSize,
    shasum: info.shasum,
    integrity: info.integrity,
    sha256,
    entries: files.length,
    localLinksChecked: publicLinkCount.value,
    externalLinksSkipped: externalLinkCount.value,
    requiredFiles: required.length,
    forbiddenMatches: 0,
  };
  await fs.writeFile(join(outDir, "package-check.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await fs.rm(extractDir, { recursive: true, force: true });
}
