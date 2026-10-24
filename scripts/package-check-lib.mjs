import { existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

const EXTERNAL_TARGET = /^(?:https?:|mailto:|data:|\/\/)/i;

/** Absolute, external and fragment-only links are not package files. */
export function isExternalTarget(raw) {
  const value = raw.trim().replace(/^<|>$/g, "");
  return !value || value.startsWith("#") || EXTERNAL_TARGET.test(value) ||
    value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

/**
 * Resolve one Markdown/HTML local target inside an extracted package root.
 * Returns null for external/absolute examples. Throws when a relative target
 * lexically escapes packageRoot, before existsSync can accept an outside file.
 */
export function resolvePackedTarget(packageRoot, sourceRelative, raw) {
  if (isExternalTarget(raw)) return null;
  const target = decodeURIComponent(raw.trim().replace(/^<|>$/g, "").split("#")[0].split("?")[0]);
  if (!target) return null;
  const root = resolve(packageRoot);
  const absolute = resolve(dirname(join(root, sourceRelative)), target);
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw new Error(`Link escapes package root: ${sourceRelative} -> ${raw}`);
  }
  return { absolute, target };
}

/** Fail with the offending file name when packed server source imports the client SDK directly. */
export async function assertNoDirectClientImports(serverFiles, readFile) {
  const sources = await Promise.all(serverFiles.map((path) => readFile(path)));
  for (const [index, source] of sources.entries()) {
    if (/from\s+["']@getpaseo\/client["']/.test(source)) {
      throw new Error(`packed server source still imports @getpaseo/client directly: ${serverFiles[index]}`);
    }
  }
}

export function requirePackedTarget(packageRoot, sourceRelative, raw) {
  const resolved = resolvePackedTarget(packageRoot, sourceRelative, raw);
  if (!resolved) return null;
  if (!existsSync(resolved.absolute)) {
    throw new Error(`packed link target is missing: ${sourceRelative} -> ${raw}`);
  }
  return resolved;
}
