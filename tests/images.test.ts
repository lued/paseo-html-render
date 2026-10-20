import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  InlineImagesError,
  inlineWorkspaceImages,
  MAX_INLINE_IMAGE_BYTES,
  MAX_IMAGE_REFERENCES,
  MAX_IMAGE_DIAGNOSTICS,
  sniffRasterMime,
} from "../server/images.ts";

/** Smallest PNG-shaped fixture: the sniffer only needs the 8-byte signature. */
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const JPEG = Buffer.from("ffd8ffe000104a464946", "hex");
const GIF = Buffer.from("GIF89a000000000000", "latin1");
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "latin1"),
  Buffer.from([0x10, 0, 0, 0]),
  Buffer.from("WEBPVP8 ", "latin1"),
]);
const AVIF = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from("ftypavif", "latin1"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("avifmif1", "latin1"),
]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

async function workspace(t: { after(fn: () => Promise<void>): void }): Promise<{
  root: string;
  outside: string;
}> {
  const root = await fs.mkdtemp(join(tmpdir(), "hr-images-ws-"));
  const outside = await fs.mkdtemp(join(tmpdir(), "hr-images-outside-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });
  await fs.mkdir(join(root, "img"), { recursive: true });
  await fs.writeFile(join(root, "img", "a.png"), PNG);
  await fs.writeFile(join(root, "img", "b.jpg"), JPEG);
  await fs.writeFile(join(root, "img", "active.svg"), SVG);
  await fs.writeFile(join(root, "img", "notes.txt"), "hello");
  await fs.writeFile(join(outside, "secret.png"), PNG);
  return { root, outside };
}

const options = (root: string, extra: { maxImageBytes?: number; maxPageBytes?: number } = {}) => ({
  workspaceRoot: root,
  cwd: root,
  ...extra,
});

test("inlines relative, absolute, srcset, style, and CSS url references", async (t) => {
  const { root } = await workspace(t);
  const html = [
    '<!doctype html><html><head><style>',
    ".hero{background:url('img/a.png')}",
    "/* url(img/b.jpg) in a comment must not change */",
    "</style></head><body>",
    '<img src="img/a.png" alt="a">',
    `<img src="${join(root, "img", "b.jpg")}" alt="b">`,
    '<img srcset="img/a.png 1x, img/b.jpg 2x" src="img/a.png">',
    '<div style="background-image:url(img/b.jpg)">x</div>',
    '<script>const s = "img/a.png";</script>',
    "<!-- <img src=\"img/a.png\"> -->",
    '<img src="https://example.com/remote.png">',
    '<img src="file:///etc/passwd">',
    "</body></html>",
  ].join("\n");
  const result = await inlineWorkspaceImages(html, options(root));
  assert.equal(result.missing.length, 0, JSON.stringify(result.missing));
  assert.ok(result.html.includes("data:image/png;base64,"));
  assert.ok(result.html.includes("data:image/jpeg;base64,"));
  assert.equal(result.html.match(/data:image\/png;base64,/g)?.length, 4);
  assert.equal(result.html.match(/data:image\/jpeg;base64,/g)?.length, 3);
  assert.ok(result.html.includes('const s = "img/a.png";'), "script text must be untouched");
  assert.ok(result.html.includes('<!-- <img src="img/a.png"> -->'), "comments must be untouched");
  assert.ok(result.html.includes("https://example.com/remote.png"));
  assert.ok(result.html.includes("file:///etc/passwd"));
  assert.ok(result.html.includes("/* url(img/b.jpg) in a comment must not change */"));
  assert.ok(result.inlined.length >= 3);
  assert.equal(html.includes("data:image"), false, "the input string is never mutated");
});

test("missing, outside, symlink, directory, oversized, SVG, and text references stay blocked", async (t) => {
  const { root, outside } = await workspace(t);
  await fs.mkdir(join(root, "dir.png"));
  await fs.writeFile(join(root, "big.png"), Buffer.concat([PNG, Buffer.alloc(64)]));
  await fs.symlink(join(outside, "secret.png"), join(root, "escape.png"));
  const html = [
    '<img src="missing.png">',
    `<img src="${join(outside, "secret.png")}">`,
    '<img src="../../etc/passwd">',
    '<img src="escape.png">',
    '<img src="dir.png">',
    '<img src="big.png">',
    '<img src="img/active.svg">',
    '<img src="img/notes.txt">',
  ].join("");
  const result = await inlineWorkspaceImages(html, options(root, { maxImageBytes: 32 }));
  assert.equal(result.html.includes("data:image"), false);
  const reasons = new Map(result.missing.map((entry) => [entry.path, entry.reason]));
  assert.equal(reasons.get("missing.png"), "not_found");
  assert.equal(reasons.get(join(outside, "secret.png")), "outside_workspace");
  assert.equal(reasons.get("../../etc/passwd"), "outside_workspace");
  assert.equal(reasons.get("escape.png"), "outside_workspace");
  assert.equal(reasons.get("dir.png"), "not_regular_file");
  assert.equal(reasons.get("big.png"), "too_large");
  assert.equal(reasons.get("img/active.svg"), "too_large");
  assert.equal(reasons.get("img/notes.txt"), "unsupported_type");
  // Diagnostics echo only the caller-supplied reference; no outside content is read.
  assert.ok(result.missing.every((entry) => entry.reason !== "unreadable"));

  const typed = await inlineWorkspaceImages(
    '<img src="img/active.svg"><img src="img/notes.txt">',
    options(root),
  );
  assert.deepEqual(
    typed.missing.map((entry) => [entry.path, entry.reason]),
    [["img/active.svg", "unsupported_type"], ["img/notes.txt", "unsupported_type"]],
  );
});

test("the prepared page budget fails closed instead of producing an oversized page", async (t) => {
  const { root } = await workspace(t);
  const html = '<p>content</p><img src="img/a.png">';
  await assert.rejects(
    () => inlineWorkspaceImages(html, options(root, { maxPageBytes: 5 })),
    (error: unknown) => error instanceof InlineImagesError && error.code === "page_too_large",
  );
  // With room for the document but not the image, the image is reported and its
  // tag is removed: a broken-image glyph is never published.
  const tight = await inlineWorkspaceImages(html, options(root, { maxPageBytes: html.length + 8 }));
  assert.equal(tight.html.includes("data:image"), false);
  assert.equal(tight.missing[0]?.reason, "too_large");
  assert.equal(tight.html.includes("<img"), false);
});

test("filesystem work and missing-image diagnostics are bounded", async (t) => {
  const { root } = await workspace(t);
  const html = Array.from({ length: MAX_IMAGE_REFERENCES + 100 }, (_, i) => `<img src="missing-${i}.png">`).join("");
  const result = await inlineWorkspaceImages(html, options(root));
  assert.equal(result.html, "", "every unresolvable local image tag is removed");
  assert.ok(result.missing.length <= MAX_IMAGE_DIAGNOSTICS);
  assert.equal(result.missing.at(-1)?.reason, "reference_limit");
});

test("a missing local image is dropped while remote references are untouched", async (t) => {
  const { root } = await workspace(t);
  const html = '<img src="missing.png"><img src="https://example.com/x.png">';
  const result = await inlineWorkspaceImages(html, options(root));
  assert.equal(result.html, '<img src="https://example.com/x.png">');
  assert.deepEqual(result.missing.map((entry) => entry.reason), ["not_found"]);
});

test("a FIFO masquerading as an image cannot block an inlining request", { timeout: 3000 }, async (t) => {
  if (process.platform === "win32") { t.skip("POSIX FIFO fixture"); return; }
  const { root } = await workspace(t);
  execFileSync("mkfifo", [join(root, "fifo.png")]);
  const result = await inlineWorkspaceImages('<img src="fifo.png">', options(root));
  assert.equal(result.missing[0]?.reason, "not_regular_file");
});

test("a parent-directory symlink swap cannot redirect an opened image outside the workspace", async (t) => {
  if (process.platform !== "linux") { t.skip("opened-fd containment probe requires /proc"); return; }
  const { root, outside } = await workspace(t);
  await fs.writeFile(join(outside, "a.png"), PNG);
  const image = join(root, "img", "a.png");
  const open = fs.open;
  let swapped = false;
  fs.open = (async (...args: any[]) => {
    if (args[0] === image && !swapped) {
      swapped = true;
      await fs.rename(join(root, "img"), join(root, "img-before-swap"));
      await fs.symlink(outside, join(root, "img"));
    }
    return (open as any)(...args);
  }) as typeof fs.open;
  try {
    const result = await inlineWorkspaceImages('<img src="img/a.png">', options(root));
    assert.equal(swapped, true);
    assert.equal(result.html.includes("data:image"), false);
    assert.equal(result.missing[0]?.reason, "outside_workspace");
  } finally { fs.open = open; }
});

test("magic bytes decide the MIME type and SVG is never a raster", () => {
  assert.equal(sniffRasterMime(PNG), "image/png");
  assert.equal(sniffRasterMime(JPEG), "image/jpeg");
  assert.equal(sniffRasterMime(GIF), "image/gif");
  assert.equal(sniffRasterMime(WEBP), "image/webp");
  assert.equal(sniffRasterMime(AVIF), "image/avif");
  assert.equal(sniffRasterMime(SVG), null);
  assert.equal(sniffRasterMime(Buffer.from("plain text")), null);
  assert.equal(sniffRasterMime(Buffer.alloc(0)), null);
});

test("rejects invalid inputs and enforces the per-image default cap", async (t) => {
  const { root } = await workspace(t);
  await assert.rejects(() => inlineWorkspaceImages("", options(root)), InlineImagesError);
  await assert.rejects(
    () => inlineWorkspaceImages('<img src="a.png">', { workspaceRoot: "relative", cwd: root }),
    /workspace root must be absolute/,
  );
  assert.equal(MAX_INLINE_IMAGE_BYTES, 2 * 1_048_576);
});
