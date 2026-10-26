export interface BrowserRegistryProbe {
  evaluate(expression: string): Promise<unknown>;
}

export declare function registryIds(browser: BrowserRegistryProbe): Promise<string[]>;
export declare function waitForRegistry(
  browser: BrowserRegistryProbe,
  expected: readonly string[],
  timeoutMs: number,
  label: string,
): Promise<string[]>;
