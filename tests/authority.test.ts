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
  assert.equal((await authority.workspaceForAgentOwnership("agent_ok"))?.workspaceId, "wks_worktree");
  assert.equal(await authority.workspaceForAgentOwnership("agent_bad"), null);
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
      { agent_zzz: "wks_zzz", agent_aaa: "wks_aaa" },
    ),
  );
  // Same directory, two ids: ownership must not flip between calls.
  assert.equal((await authority.workspaceForCwd(root))?.workspaceId, "wks_aaa");
  assert.equal(await authority.workspaceForCwd("/etc"), null);
  // Reads follow the same owner as publish, whichever sibling workspace owns
  // the agent. Otherwise the agent cannot read the card it just published.
  assert.equal((await authority.workspaceForAgentOwnership("agent_zzz"))?.workspaceId, "wks_aaa");
  assert.equal((await authority.workspaceForAgentOwnership("agent_aaa"))?.workspaceId, "wks_aaa");
  assert.equal(await authority.workspaceForAgentOwnership("agent_missing"), null);
});

test("the real sly sibling set still reaches the owner recorded by both failing agents", async () => {
  // Reproduces 2026-10-21: wks_4201e411d5936f56 was created for another
  // /home/xander agent and sorts below wks_546fb8529e094f50, which is the
  // workspace id every existing html-render manifest recorded. Reads must keep
  // the publisher's root reachable instead of flipping to the new minimum.
  const authority = createAuthority(
    fakePaseo(
      [
        { id: "wks_4ee422740ec399d9", path: "/home/xander/git/fde-idea" },
        { id: "wks_d6bc3ad1515f8ab3", path: "/home/xander/git/fde-idea" },
        { id: "wks_546fb8529e094f50", path: "/home/xander" },
        { id: "wks_6d761d14714818f8", path: "/home/xander" },
        { id: "wks_eec911619ed5c8ff", path: "/home/xander/git/paseo-html-render" },
        { id: "wks_e998089619f881b2", path: "/home/xander" },
        { id: "wks_850d289a5902ecfa", path: "/home/xander/git/paseo-html-render" },
        { id: "wks_4201e411d5936f56", path: "/home/xander" },
      ],
      {
        "dfc70a9f-4f0d-45bf-b5cc-bc1fec97827f": "wks_e998089619f881b2",
        "8d12d06c-19ed-4ef0-91c5-df3e0c322782": "wks_6d761d14714818f8",
      },
    ),
  );
  for (const agentId of [
    "dfc70a9f-4f0d-45bf-b5cc-bc1fec97827f",
    "8d12d06c-19ed-4ef0-91c5-df3e0c322782",
  ]) {
    const ownership = await authority.workspaceForAgentOwnership(agentId);
    assert.equal(ownership?.root, "/home/xander");
    assert.equal(ownership?.workspaceId, "wks_4201e411d5936f56");
    assert.ok(ownership?.workspaceIds.includes("wks_546fb8529e094f50"));
    assert.ok(ownership?.workspaceIds.includes("wks_4201e411d5936f56"));
  }
});
