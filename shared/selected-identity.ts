/** The single identity used by client and daemon entry points. */
import { PRODUCTION_IDENTITY, type PluginIdentity } from "./identity.ts";

export const SELECTED_IDENTITY: PluginIdentity = PRODUCTION_IDENTITY;
