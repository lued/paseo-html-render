export declare class FixtureUnavailableError extends Error {
  readonly stage: string;
  constructor(stage: string, message: string);
}

export declare function cleanFixtureEnv(
  base?: Record<string, string | undefined>,
): Record<string, string | undefined>;

export declare function fixtureDaemonEnv(
  base: Record<string, string | undefined>,
  home: string,
  chromium: string,
): Record<string, string | undefined>;

export declare function fixtureBrowserEnv(
  base: Record<string, string | undefined>,
  secret: string,
): Record<string, string | undefined>;

export declare function assertE2EOnlyPassword(secret: string): void;

export declare function fixtureConfig(input: {
  port: number;
  passwordHash: string;
  appBaseUrl?: string;
}): Record<string, unknown>;

export declare function redactSensitive(text: string, secrets?: string[]): string;

export declare function hostRegistryServerIds(raw: string | null | undefined): string[];

export declare const UNIX_SOCKET_PATH_MAX_BYTES: number;

export declare function unixSocketPathBudget(
  socketPath: string,
  maxBytes?: number,
): { bytes: number; maxBytes: number; ok: boolean; detail: string };

export declare function projectDirNameFromCwd(cwd: string): string;

export declare function recordFacts(
  record: unknown,
  workspaceId: string,
  workspace: string,
  readError?: string | null,
): Record<string, unknown>;

export declare function sessionOpenFacts(
  entries: unknown,
  agentId: string,
  options?: { token?: string; workspace?: string },
): {
  observed: boolean;
  lineCount: number;
  server: string | null;
  transport: string | null;
  alwaysLoad: boolean;
  agentMatches: boolean;
  provider: string | null;
  reason: string | null;
  purpose: string | null;
  sanitized: boolean;
};

export declare function renderToolFacts(items: unknown, expectedTitle?: string): Record<string, unknown>;

export declare function runProtectedAcceptance(options?: Record<string, unknown>): Promise<Record<string, unknown>>;
