export function isExternalTarget(raw: string): boolean;
export function resolvePackedTarget(
  packageRoot: string,
  sourceRelative: string,
  raw: string,
): { absolute: string; target: string } | null;
export function assertNoDirectClientImports(
  serverFiles: string[],
  readFile: (path: string) => Promise<string>,
): Promise<void>;
export function requirePackedTarget(
  packageRoot: string,
  sourceRelative: string,
  raw: string,
): { absolute: string; target: string } | null;
