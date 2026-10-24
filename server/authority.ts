import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { sep } from "node:path";
import { canonicalPath } from "./canonical.ts";

/** Host-provided API type; importing the SDK avoids a direct @getpaseo/client dependency. */
type PaseoApi = PluginHandlerContext["paseo"];

export interface WorkspaceRoot {
  workspaceId: string;
  root: string;
  /**
   * Every active workspace id rooted at `root`. Reads accept any sibling, so a
   * workspace created later cannot invalidate artifacts published by another
   * workspace sharing the same directory.
   */
  workspaceIds: readonly string[];
}

interface WorkspaceEntry {
  workspaceId: string;
  root: string;
}

export interface Authority {
  /** Resolves a tool caller's cwd to the workspace that owns it. Never trusts a caller-supplied id. */
  workspaceForCwd(cwd: string): Promise<WorkspaceRoot | null>;
  /** Resolves an agent id to its own workspace id, for diagnostics. */
  workspaceForAgent(agentId: string): Promise<string | null>;
  /**
   * Resolves an agent to the stable workspace that owns artifacts published
   * from its directory. Several workspaces can share a directory; publish uses
   * the lowest workspace id, so reads must resolve to that same owner.
   */
  workspaceForAgentOwnership(agentId: string): Promise<WorkspaceRoot | null>;
}

export interface AuthorityOptions {
  now?: () => number;
  ttlMs?: number;
}

/**
 * Ownership is decided against every real public workspace root: the caller's
 * directory is owned by the deepest matching root. There is no second, narrower
 * root set, so an unlisted nested workspace can never inherit an ancestor's
 * authority. Several workspaces can legitimately share one directory (for
 * example two worktrees opened on the same path); that tie breaks on the lowest
 * workspace id so publish ownership stays stable across calls.
 *
 * Successful lookups are cached for 15 seconds; failures are never cached, so a
 * transient SDK error does not poison later authorization decisions.
 */
export function createAuthority(paseo: PaseoApi, options: AuthorityOptions = {}): Authority {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 15_000;

  const list = async (): Promise<WorkspaceEntry[]> => {
    const result = await paseo.workspaces.list({});
    const value: WorkspaceEntry[] = [];
    for (const workspace of result.entries) {
      const path = workspace.workspaceDirectory ?? workspace.projectRootPath;
      if (!path) continue;
      const root = canonicalPath(path);
      if (!root) continue;
      value.push({ workspaceId: workspace.id, root });
    }
    return value;
  };

  let cachedWorkspaces: { at: number; value: WorkspaceEntry[] } | null = null;
  const workspaces = async (): Promise<WorkspaceEntry[]> => {
    if (cachedWorkspaces && now() - cachedWorkspaces.at < ttlMs) return cachedWorkspaces.value;
    const value = await list();
    cachedWorkspaces = { at: now(), value };
    return value;
  };

  const cachedAgents = new Map<string, { at: number; value: string | null }>();
  const agentWorkspace = async (agentId: string): Promise<string | null> => {
    const cached = cachedAgents.get(agentId);
    if (cached && now() - cached.at < ttlMs) return cached.value;
    let workspaceId: string | null = null;
    try {
      const handle = paseo.agents.ref(agentId);
      await handle.refresh();
      workspaceId = handle.workspaceId ?? null;
    } catch {
      workspaceId = null;
    }
    if (workspaceId) cachedAgents.set(agentId, { at: now(), value: workspaceId });
    else cachedAgents.delete(agentId);
    return workspaceId;
  };

  const ownershipForTarget = async (target: string): Promise<WorkspaceRoot | null> => {
    const all = await workspaces();
    const matches = all
      .filter((entry) => target === entry.root || target.startsWith(entry.root + sep))
      .sort((left, right) =>
        right.root.length - left.root.length || left.workspaceId.localeCompare(right.workspaceId));
    const owner = matches[0];
    if (!owner) return null;
    return {
      workspaceId: owner.workspaceId,
      root: owner.root,
      workspaceIds: matches.map((entry) => entry.workspaceId),
    };
  };

  return {
    async workspaceForCwd(cwd) {
      if (typeof cwd !== "string" || !cwd.startsWith("/")) return null;
      const target = canonicalPath(cwd);
      if (!target) return null;
      return ownershipForTarget(target);
    },

    async workspaceForAgent(agentId) {
      if (typeof agentId !== "string" || agentId.length === 0) return null;
      return agentWorkspace(agentId);
    },

    async workspaceForAgentOwnership(agentId) {
      const workspaceId = await agentWorkspace(agentId);
      if (!workspaceId) return null;
      const all = await workspaces();
      const entry = all.find((workspace) => workspace.workspaceId === workspaceId);
      if (!entry) return null;
      return ownershipForTarget(entry.root);
    },
  };
}
