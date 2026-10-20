/**
 * Node's real cancellation globals, explicitly typed because React Native's
 * client ambient declarations expose an older AbortSignal API to this mixed
 * client/server TypeScript project. No polyfill or host-source dependency.
 */
export interface AbortSignal extends globalThis.AbortSignal {
  readonly reason: unknown;
  throwIfAborted(): void;
}
const runtime = globalThis as unknown as { AbortSignal: unknown; AbortController: unknown };
export const AbortSignal = runtime.AbortSignal as {
  timeout(milliseconds: number): AbortSignal;
  any(signals: readonly globalThis.AbortSignal[]): AbortSignal;
};
export interface AbortController {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}
export const AbortController = runtime.AbortController as {
  new(): AbortController;
};
