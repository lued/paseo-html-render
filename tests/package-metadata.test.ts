import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => fs.readFile(join(ROOT, path), "utf8");

test("package, lockfile, manifest and adapter use the same 2.2.0 contract", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const lock = JSON.parse(await read("package-lock.json"));
  const manifest = JSON.parse(await read("paseo-plugin.json"));
  const identity = await read("shared/identity.ts");
  assert.equal(pkg.name, "paseo-html-render");
  assert.equal(pkg.version, "2.2.0");
  assert.equal(pkg.private, false);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.match(identity, /adapterVersion: "2\.2\.0"/);
  assert.equal(pkg.engines.node, ">=22.18.0");
  assert.equal(pkg.peerDependencies["@getpaseo/plugin"], ">=0.12.0 <0.14.0");
  assert.equal(manifest.requirements.paseo, ">=0.12.0 <0.14.0");
  assert.equal(manifest.id, "html-render");
});

test("the packed allowlist is public and excludes private working material", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const files: string[] = pkg.files;
  const covered = (path: string) => files.includes(path) ||
    files.some((entry) => entry.endsWith("/") && path.startsWith(entry));
  for (const path of [
    "paseo-plugin.json", "README.md", "OVERVIEW.md", "SECURITY.md", "CONTRIBUTING.md", "LICENSE", "CHANGELOG.md",
    "docs/compatibility.md", "docs/interactivity.md", "docs/release.md", "docs/showcase.md",
    "docs/images/showcase/hero.png", "examples/showcase/image-inspection.html",
    "examples/interactive/flow.html",
  ]) {
    assert.ok(covered(path), `package files must include ${path}`);
  }
  for (const path of files) {
    assert.ok(!path.startsWith("tests/"), path);
    assert.ok(!path.startsWith("docs/plans/"), path);
    assert.ok(!path.startsWith("docs/research/"), path);
    assert.ok(!path.includes("PROJECT-STATUS"), path);
    assert.ok(!path.includes("HANDOFF"), path);
    assert.ok(!path.startsWith("scripts/"), path);
  }
  const dependencies = pkg.dependencies ?? {};
  assert.equal(dependencies.pele, "1.7.0");
  assert.equal(dependencies["@getpaseo/client"], undefined, "host SDK type must not become a runtime dependency");
});

test("README keeps a conditional npm path and a checkout fallback", async () => {
  const readme = await read("README.md");
  assert.match(readme, /not published yet/i);
  assert.match(readme, /paseo plugin install npm:paseo-html-render@2\.2\.0/);
  assert.match(readme, /git clone https:\/\/github\.com\/lued\/paseo-html-render\.git/);
  assert.match(readme, /npm view paseo-html-render version/);
  assert.match(readme, /Paseo 0\.12\.0 through 0\.13\.x/);
  assert.match(readme, /Node 22\.18 or newer/);
  assert.match(readme, /No browser is downloaded or installed/);
  assert.match(readme, /compatibility and limits/);
  assert.match(readme, /public verification notes/);
});

test("the guard documentation is exact rather than overclaiming normalization or cwd fallback", async () => {
  const changelog = await read("CHANGELOG.md");
  const compatibility = await read("docs/compatibility.md");
  assert.match(changelog, /## \[2\.2\.0\]/);
  assert.match(changelog, /exact fingerprint/);
  assert.match(changelog, /not semantic duplicate detection/);
  assert.match(changelog, /50 publishes per agent/);
  assert.match(changelog, /restart clears/);
  assert.match(changelog, /interactivePath/);
  assert.match(changelog, /244-character summary/);
  assert.doesNotMatch(changelog, /only by comments or whitespace runs/i);
  assert.doesNotMatch(changelog, /cwd fallback/i);
  assert.match(compatibility, /## Turn guard/);
  assert.match(compatibility, /not semantic/i);
  assert.match(compatibility, /agent attribution is missing/i);
  assert.match(compatibility, /unknown/i);
  assert.match(compatibility, /interactivePath/);
});

test("release notes describe the production-only install and preserve v2.1.0", async () => {
  const release = await read("docs/release.md");
  assert.match(release, /--legacy-peer-deps/);
  assert.match(release, /--omit=dev/);
  assert.match(release, /smoke:package/);
  assert.match(release, /check:package/);
  assert.match(release, /v2\.1\.0/);
  assert.match(release, /never (?:overwrite|rewrite)/i);
  assert.match(release, /Node.*22\.18\.0/s);
  assert.match(release, /Paseo.*0\.12\.0/s);
});

test("no server source directly imports the @getpaseo/client package", async () => {
  const entries = await fs.readdir(join(ROOT, "server"));
  for (const name of entries.filter((entry) => entry.endsWith(".ts"))) {
    const source = await read(join("server", name));
    assert.doesNotMatch(source, /from\s+["']@getpaseo\/client["']/, name);
  }
});
