import { realpathSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Canonical absolute path. `realpathSync` resolves symlinks, so a path that
 * escapes a workspace through a link can never keep the workspace prefix.
 * Missing paths fall back to a lexical resolve; callers still fail closed
 * because only a real workspace root can match.
 */
export function canonicalPath(path: string): string {
  try {
    return realpathSync.native(resolve(path));
  } catch {
    return resolve(path);
  }
}

/**
 * Canonical path that must exist. Returns null when the path (or a parent
 * symlink target) cannot be resolved, so a missing/unreadable path can never be
 * matched against an allowed workspace by lexical prefix.
 */
export function canonicalExistingPath(path: string): string | null {
  try {
    return realpathSync.native(resolve(path));
  } catch {
    return null;
  }
}
