import assert from "node:assert/strict";
import test from "node:test";
import { encodeReportReference } from "../shared/recognize.ts";
import {
  assertE2EOnlyPassword,
  cleanFixtureEnv,
  fixtureBrowserEnv,
  fixtureConfig,
  fixtureDaemonEnv,
  hostRegistryServerIds,
  projectDirNameFromCwd,
  recordFacts,
  redactSensitive,
  renderToolFacts,
  unixSocketPathBudget,
} from "../scripts/fixture-paseo.mjs";

const HASH = `$2b$12$${"a".repeat(53)}`;

test("fixture environment removes ambient PASEO routing/auth overrides", () => {
  const env = cleanFixtureEnv({
    HOME: "/home/user",
    PATH: "/bin",
    PASEO_HOME: "/home/user/.paseo",
    PASEO_HOST: "localhost:6767",
    PASEO_PASSWORD: "ambient",
    PASEO_DAEMON_PASSWORD: "ambient-daemon",
    PASEO_RELAY_ENABLED: "true",
    PASEO_APP_BASE_URL: "https://evil.example",
    PASEO_AGENT_ID: "agent",
    PI_CODING_AGENT_DIR: "/home/user/.pi/agent",
    PI_SESSION_FILE: "/home/user/.pi/session.jsonl",
    PI_SESSION_ID: "session",
    PI_CODING_AGENT_SESSION_DIR: "/home/user/.pi/sessions",
    PI_MODEL: "ambient-model",
  });
  assert.equal(env.HOME, "/home/user");
  assert.equal(env.PATH, "/bin");
  assert.equal(env.PI_CODING_AGENT_DIR, "/home/user/.pi/agent");
  for (const key of [
    "PASEO_HOME",
    "PASEO_HOST",
    "PASEO_PASSWORD",
    "PASEO_DAEMON_PASSWORD",
    "PASEO_RELAY_ENABLED",
    "PASEO_APP_BASE_URL",
    "PASEO_AGENT_ID",
    "PI_SESSION_FILE",
    "PI_SESSION_ID",
    "PI_CODING_AGENT_SESSION_DIR",
    "PI_MODEL",
  ]) {
    assert.equal(key in env, false, `${key} leaked into the fixture environment`);
  }
});

test("fixture daemon and browser environments reintroduce only owned keys", () => {
  const base = {
    HOME: "/home/user",
    PASEO_HOME: "/home/user/.paseo",
    PASEO_PASSWORD: "ambient",
    PASEO_RELAY_ENABLED: "true",
  };
  const daemon = fixtureDaemonEnv(base, "/tmp/fixture/home", "/tmp/chromium");
  assert.equal(daemon.PASEO_HOME, "/tmp/fixture/home");
  assert.equal(daemon.PASEO_HTML_RENDER_CHROMIUM, "/tmp/chromium");
  assert.equal("PASEO_PASSWORD" in daemon, false);
  assert.equal("PASEO_RELAY_ENABLED" in daemon, false);

  const browser = fixtureBrowserEnv(base, "generated-secret");
  assert.equal(browser.PASEO_E2E_PASSWORD, "generated-secret");
  assert.equal("PASEO_HOME" in browser, false);
  assert.equal("PASEO_PASSWORD" in browser, false);
  assert.equal("PASEO_RELAY_ENABLED" in browser, false);
});

test("fixture config enables relay only for the owned home and app origin", () => {
  const config = fixtureConfig({ port: 45678, passwordHash: HASH, appBaseUrl: "https://app.paseo.sh/path" }) as {
    daemon: { listen: string; relay: { enabled: boolean }; cors: { allowedOrigins: string[] }; auth: { password: string } };
    app: { baseUrl: string };
    pluginsEnabled: boolean;
  };
  assert.equal(config.daemon.listen, "127.0.0.1:45678");
  assert.equal(config.daemon.relay.enabled, true);
  assert.equal((config.daemon.relay as { requireProtectedSecurity?: boolean }).requireProtectedSecurity, true);
  assert.deepEqual(config.daemon.cors.allowedOrigins, ["https://app.paseo.sh"]);
  assert.equal(config.daemon.auth.password, HASH);
  assert.equal(config.app.baseUrl, "https://app.paseo.sh");
  assert.equal(config.pluginsEnabled, true);
  assert.throws(() => fixtureConfig({ port: 1, passwordHash: "plaintext" }), /bcrypt/);
});

test("generated fixture passwords stay off the bearer subprotocol", () => {
  assert.doesNotThrow(() => assertE2EOnlyPassword("abcdefghijklmnopqrstuvwx+/=="));
  assert.throws(() => assertE2EOnlyPassword("OnlyTokenSafeCharacters123"), /bearer/);
  assert.throws(() => assertE2EOnlyPassword("short"), /too short/);
});

test("diagnostics redact all pairing forms and credentials but keep admission reasons", () => {
  const secret = "abc+/def==";
  const text = [
    `password ${secret}`,
    "https://app.paseo.sh/#offer=eyJ2IjoyfQ",
    "#connect=relay%3A%2F%2Frelay.paseo.sh%2Fsrv%3Fkey%3Dabc%26password%3Dhunter2",
    "relay://relay.paseo.sh/srv?key=public-key&password=hunter2&ssl=true",
    "offer=eyJ2IjoyfQ",
    "password%3Dhunter2",
    "key%3Dpublic-key",
    '"daemonPublicKeyB64":"public-key"',
    '"password":"hunter2"',
    "Authorization: Bearer abc123",
    "Password required",
    "Incorrect password",
  ].join("\n");
  const redacted = redactSensitive(text, [secret]);
  for (const forbidden of [
    secret,
    "eyJ2IjoyfQ",
    "hunter2",
    "public-key",
    "abc123",
    "relay://relay.paseo.sh",
    "relay%3A%2F%2Frelay.paseo.sh",
  ]) {
    assert.equal(redacted.includes(forbidden), false, `${forbidden} survived redaction`);
  }
  assert.match(redacted, /Password required/);
  assert.match(redacted, /Incorrect password/);
});

test("host registry boundary accepts the browser's string list and rejects malformed state", () => {
  const raw = JSON.stringify(["srv_fixture", "srv_fixture"]);
  assert.deepEqual(hostRegistryServerIds(raw), ["srv_fixture"]);
  assert.deepEqual(hostRegistryServerIds(JSON.stringify(["srv_other", "srv_fixture"])), ["srv_other", "srv_fixture"]);
  assert.deepEqual(hostRegistryServerIds("[]"), []);
  assert.throws(() => hostRegistryServerIds(null), /snapshot is missing/);
  assert.throws(() => hostRegistryServerIds(undefined), /snapshot is missing/);
  assert.throws(() => hostRegistryServerIds(""), /snapshot is missing/);
  assert.throws(() => hostRegistryServerIds("not-json"), /valid JSON/);
  assert.throws(() => hostRegistryServerIds(JSON.stringify({ serverId: "srv" })), /not an array/);
  assert.throws(() => hostRegistryServerIds(JSON.stringify([{ serverId: "srv" }])), /not a server id/);
  assert.throws(() => hostRegistryServerIds(JSON.stringify([""])), /not a server id/);
});

test("fixture socket budget is computed from the actual owned bridge path", () => {
  const short = "/tmp/hr-pw-AbC123/plugin-data/html-render/bridge.sock";
  const shortBudget = unixSocketPathBudget(short);
  assert.equal(shortBudget.bytes, Buffer.byteLength(short, "utf8"));
  assert.equal(shortBudget.ok, true);
  const long = `/tmp/${"x".repeat(130)}/plugin-data/html-render/bridge.sock`;
  const longBudget = unixSocketPathBudget(long);
  assert.ok(longBudget.bytes > longBudget.maxBytes);
  assert.equal(longBudget.ok, false);
  assert.match(longBudget.detail, /bytes; limit/);
  assert.equal(projectDirNameFromCwd("/tmp/hr-pw-AbC123/workspace"), "tmp-hr-pw-AbC123-workspace");
});

test("record facts expose key names/booleans only, never MCP env or args", () => {
  const record = {
    workspaceId: "wks_owned",
    cwd: "/tmp/hr-pw-AbC123/workspace",
    config: {
      model: "model",
      mcpServers: {
        "html-render": {
          type: "stdio",
          alwaysLoad: true,
          command: "/secret/node",
          args: ["/secret/adapter.mjs"],
          env: { PASEO_HTML_RENDER_TOKEN: "secret-token" },
        },
      },
    },
  };
  const facts = recordFacts(record, "wks_owned", "/tmp/hr-pw-AbC123/workspace");
  assert.equal(facts.workspaceIdMatches, true);
  assert.equal(facts.cwdMatches, true);
  assert.equal(facts.mcpServersKey, true);
  assert.deepEqual(facts.mcpServerNames, ["html-render"]);
  assert.equal(facts.htmlRenderEntryObserved, true);
  assert.equal(facts.alwaysLoadObserved, true);
  const serialized = JSON.stringify(facts);
  assert.equal(serialized.includes("secret-token"), false);
  assert.equal(serialized.includes("/secret/"), false);
  const missing = recordFacts(null, "wks_owned", "/tmp/x", "missing");
  assert.equal(missing.found, false);
  assert.equal(missing.readError, "missing");
  assert.equal(missing.mcpServersKey, null);
  assert.equal(missing.alwaysLoadObserved, null);
  assert.equal(missing.injectionEvidence, "not-observed");
});

test("render tool facts require a real direct or nested render row", () => {
  const direct = {
    type: "tool_call",
    name: "mcp__html_render__html_render",
    callId: "call-1",
    status: "completed",
    detail: { type: "unknown", input: {}, output: "marker" },
  };
  const wrapped = {
    type: "tool_call",
    name: "codemode",
    callId: "call-2",
    status: "completed",
    detail: { output: { details: { calls: [{ name: "mcp__html_render__html_render" }] } } },
  };
  const generic = {
    type: "tool_call",
    name: "codemode",
    callId: "call-3",
    status: "completed",
    detail: { output: { details: { calls: [{ name: "shell" }] } } },
  };
  const directFacts = renderToolFacts([direct, wrapped, generic]);
  assert.equal(directFacts.count, 2);
  assert.equal(directFacts.completedCount, 2);
  assert.equal(directFacts.directObserved, true);
  assert.equal(directFacts.codemodeObserved, true);
  assert.equal(directFacts.rowCallIdCount, 2);
  assert.equal(directFacts.actualInvocationCount, null);
  assert.equal(directFacts.repeatedRowCallIds, false);
  assert.equal(directFacts.alwaysLoadRuntime, "not-observed");
  const duplicate = renderToolFacts([direct, { ...direct }]);
  assert.equal(duplicate.count, 2);
  assert.equal(duplicate.rowCallIdCount, 1);
  assert.equal(duplicate.actualInvocationCount, null);
  assert.equal(duplicate.repeatedRowCallIds, true);
  const noIds = renderToolFacts([{ ...direct, callId: undefined }, { ...direct, callId: undefined }]);
  assert.equal(noIds.actualInvocationCount, null);
  assert.equal(noIds.repeatedRowCallIds, false);
  assert.equal(renderToolFacts([generic]).count, 0);
  assert.equal(renderToolFacts([generic]).completedCount, 0);
});

test("artifact evidence must come from a completed render row, not unrelated prose", () => {
  const title = "owned acceptance";
  const marker = encodeReportReference({ artifactId: "a".repeat(32), title, summary: null, width: 728, height: 420 });
  const row = { type: "tool_call", name: "html_render", status: "completed", detail: { output: marker } };
  assert.deepEqual(renderToolFacts([row], title).completedArtifactIds, ["a".repeat(32)]);
  assert.equal(renderToolFacts([row, { ...row, callId: "outer-row" }], title).completedArtifactCount, 1);
  assert.equal(renderToolFacts([{ type: "assistant_message", text: marker }], title).completedArtifactCount, 0);
  assert.equal(renderToolFacts([{ ...row, status: "failed" }], title).completedArtifactCount, 0);
  assert.equal(renderToolFacts([row], "wrong title").completedArtifactCount, 0);
  assert.equal(renderToolFacts([{ ...row, name: "codemode", detail: { input: "tools.html_render", output: marker } }], title).completedArtifactCount, 0);
});
