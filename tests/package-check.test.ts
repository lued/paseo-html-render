import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertNoDirectClientImports,
  isExternalTarget,
  resolvePackedTarget,
} from "../scripts/package-check-lib.mjs";

test("packed link resolution rejects lexical escapes before existsSync can accept them", async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), "hr-pack-root-"));
  const outside = await fs.mkdtemp(join(tmpdir(), "hr-pack-outside-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });
  await fs.mkdir(join(root, "docs"), { recursive: true });
  await fs.writeFile(join(outside, "secret.md"), "outside");
  assert.throws(
    () => resolvePackedTarget(root, "docs/README.md", "../../secret.md"),
    /escapes package root/,
  );
  assert.throws(
    () => resolvePackedTarget(root, "docs/README.md", "../../does-not-exist.png"),
    /escapes package root/,
  );
  assert.equal(isExternalTarget("https://example.test/x"), true);
  assert.equal(isExternalTarget("/etc/passwd"), true);
  const inside = resolvePackedTarget(root, "docs/README.md", "../examples/flow.html");
  assert.equal(inside?.target, "../examples/flow.html");
  assert.match(inside?.absolute ?? "", /examples\/flow\.html$/);
});

test("direct client import diagnostics name the packed file", async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), "hr-pack-import-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(join(root, "server"), { recursive: true });
  await fs.writeFile(join(root, "server/leak.ts"), 'import type { PaseoApi } from "@getpaseo/client";\n');
  await assert.rejects(
    () => assertNoDirectClientImports(["server/leak.ts"], (path: string) => fs.readFile(join(root, path), "utf8")),
    /server\/leak\.ts/,
  );
  await assert.doesNotReject(
    () => assertNoDirectClientImports(["server/clean.ts"], async () => 'import type { PluginServerContext } from "@getpaseo/plugin/server";\n'),
  );
});
