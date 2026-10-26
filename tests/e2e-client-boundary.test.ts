import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { registryIds, waitForRegistry } from "../scripts/e2e-client.mjs";

function browserFor(hosts: unknown[], stored: unknown[] = []) {
  const outputs: unknown[] = [];
  return {
    outputs,
    async evaluate(expression: string): Promise<unknown> {
      const value: unknown = runInNewContext(expression, {
        __paseoHostRuntimeStore: { getHosts: () => hosts },
        localStorage: { getItem: () => JSON.stringify(stored) },
      });
      outputs.push(value);
      return value;
    },
  };
}

test("real browser registry mapper returns only validated ids, never profile secrets", async () => {
  const browser = browserFor(
    [{ serverId: "srv_fixture", password: "must-not-cross-the-boundary" }],
    [{ serverId: "srv_fixture", password: "stored-secret" }],
  );
  assert.deepEqual(await registryIds(browser), ["srv_fixture"]);
  assert.deepEqual(browser.outputs, [JSON.stringify(["srv_fixture"])]);
});

test("registry mapper fails closed on malformed runtime or stored profiles", async () => {
  await assert.rejects(registryIds(browserFor([{ password: "not-an-id" }])), /not an array/);
  await assert.rejects(registryIds(browserFor([], [{ password: "not-an-id" }])), /not an array/);
  await assert.rejects(registryIds({ evaluate: async () => undefined }), /snapshot is missing/);
});

test("admission rejects a transient unexpected host instead of later passing", async () => {
  let calls = 0;
  const browser = {
    async evaluate(): Promise<unknown> {
      calls += 1;
      return JSON.stringify(calls === 1 ? ["srv_other"] : ["srv_fixture"]);
    },
  };
  await assert.rejects(waitForRegistry(browser, ["srv_fixture"], 1000, "fixture admission"), /unexpected host/);
  assert.equal(calls, 1);
});

test("admission waits for the exact fixture and does not hide malformed snapshots", async () => {
  let calls = 0;
  const browser = { evaluate: async () => JSON.stringify(++calls === 1 ? [] : ["srv_fixture"]) };
  assert.deepEqual(await waitForRegistry(browser, ["srv_fixture"], 1000, "fixture admission"), ["srv_fixture"]);
  assert.equal(calls, 2);
  await assert.rejects(
    waitForRegistry({ evaluate: async () => JSON.stringify({ error: "unreadable" }) }, ["srv_fixture"], 1000, "fixture admission"),
    /not an array/,
  );
});
