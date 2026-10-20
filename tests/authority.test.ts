import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PaseoApi } from "@getpaseo/client";
import { createAuthority } from "../server/authority.ts";

function fakePaseo(
  workspaces: Array<{ id: string; path: string }>,
  agents: Record<string, string | null>,
): PaseoApi {
  return {
    workspaces: {
      list: async () => ({
        entries: workspaces.map((workspace) => ({
          id: workspace.id,
          projectRootPath: workspace.path,
          workspaceDirectory: workspace.path,
        })),
        pageInfo: {},
        requestId: "test",
      }),
    },
    agents: {
      ref: (agentId: string) => ({
        async refresh() {
          return null;
        },
        get workspaceId() {
          return agents[agentId] ?? null;
        },
      }),
    },
  } as unknown as PaseoApi;
}

test("cwd resolution prefers the deepest workspace and rejects outsiders", async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), "html-render-auth-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const nested = join(root, "worktree");
  await fs.mkdir(nested);
  const paseo = fakePaseo(
    [
      { id: "wks_project", path: root },
      { id: "wks_worktree", path: nested },
    ],
    { agent_ok: "wks_worktree", agent_bad: null },
  );
  const authority = createAuthority(paseo);

  assert.equal((await authority.workspaceForCwd(root))?.workspaceId, "wks_project");
  assert.equal((await authority.workspaceForCwd(join(nested, "src")))?.workspaceId, "wks_worktree");
  assert.equal(await authority.workspaceForCwd("/etc"), null);
  assert.equal(await authority.workspaceForCwd("relative/path"), null);
  assert.equal(await authority.workspaceForAgent("agent_ok"), "wks_worktree");
  assert.equal(await authority.workspaceForAgent("agent_bad"), null);
  assert.equal(await authority.workspaceForAgent("agent_missing"), null);
});

test("a transient missing agent does not poison a successful ownership retry", async () => {
  const agents: Record<string, string | null> = { recovering: null };
  const authority = createAuthority(fakePaseo([], agents));
  assert.equal(await authority.workspaceForAgent("recovering"), null);
  agents.recovering = "wks_recovered";
  assert.equal(await authority.workspaceForAgent("recovering"), "wks_recovered");
});

test("a trailing-slash sibling directory is not treated as inside a workspace", async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), "html-render-auth2-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = join(root, "repo");
  const sibling = join(root, "repo-evil");
  await fs.mkdir(workspace);
  await fs.mkdir(sibling);
  const authority = createAuthority(fakePaseo([{ id: "wks_repo", path: workspace }], {}));
  assert.equal(await authority.workspaceForCwd(sibling), null);
  assert.equal((await authority.workspaceForCwd(workspace))?.workspaceId, "wks_repo");
});

test("two workspaces sharing one directory resolve to a stable owner", async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), "html-render-auth3-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const authority = createAuthority(
    fakePaseo(
      [
        { id: "wks_zzz", path: root },
        { id: "wks_aaa", path: root },
      ],
      {},
    ),
  );
  // Same directory, two ids: ownership must not flip between calls.
  assert.equal((await authority.workspaceForCwd(root))?.workspaceId, "wks_aaa");
  assert.equal(await authority.workspaceForCwd("/etc"), null);
});
