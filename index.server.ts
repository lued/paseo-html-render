import type { PluginServerContext } from "@getpaseo/plugin/server";
import contribute from "./server/contribute.ts";

/**
 * Keep the default export a hoisted function declaration. Paseo evaluates the
 * server bundle in CommonJS form with eager module interop; a `var` re-export
 * would be copied before assignment and fail its "default export" check.
 */
export default function contributeEntry(server: PluginServerContext) {
  return contribute(server);
}
