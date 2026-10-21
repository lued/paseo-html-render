import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ReportCard } from "./client/report-card.tsx";
import { ReportScreen } from "./client/report-screen.tsx";
import { setNavigator } from "./client/surface.ts";
import { reportCardSchema } from "./shared/protocol.ts";
import { createTimelineTransformState, transformTimelineToolCall } from "./shared/recognize.ts";
import { SELECTED_IDENTITY } from "./shared/selected-identity.ts";

/** Renderer contribution identity for this build. */
export const REPORT_KIND = SELECTED_IDENTITY.rendererKind;
export const REPORT_VERSION = SELECTED_IDENTITY.reportVersion;

/** Client-safe identity data for client surfaces. */
export const PLUGIN_IDENTITY = SELECTED_IDENTITY;

export default function contribute(client: PluginClientContext) {
  const transformState = createTimelineTransformState();
  client.addScreen({
    id: SELECTED_IDENTITY.screenId,
    title: (params) => params.title || SELECTED_IDENTITY.screenTitle,
    Component: ReportScreen,
  });
  client.addTimelineTransformer({
    id: SELECTED_IDENTITY.transformerId,
    query: { itemType: "tool_call" },
    transform({ item }) {
      return transformTimelineToolCall(
        { name: item.name, detail: item.detail, callId: item.callId },
        SELECTED_IDENTITY,
        transformState,
      );
    },
  });
  client.addTimelineRenderer({
    kind: REPORT_KIND,
    version: REPORT_VERSION,
    schema: reportCardSchema,
    Component: ReportCard,
  });
  setNavigator((input) => client.openScreen(input));
  return () => {
    setNavigator(null);
  };
}
