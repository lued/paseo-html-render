import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { PluginTimelineTransformResult } from "@getpaseo/plugin";
import { ReportCard } from "./client/report-card.tsx";
import { ReportMessageCard } from "./client/report-message-card.tsx";
import { ReportScreen } from "./client/report-screen.tsx";
import { ArtifactCatalog } from "./client/artifact-catalog.ts";
import { setNavigator } from "./client/surface.ts";
import { reportCardSchema, reportMessageSchema } from "./shared/protocol.ts";
import {
  isRenderToolRow,
  recognizeToolCallWithSource,
  reportReferenceFromMessageText,
} from "./shared/recognize.ts";
import { SELECTED_IDENTITY } from "./shared/selected-identity.ts";

/** Renderer contribution identity for this build. */
export const REPORT_KIND = SELECTED_IDENTITY.rendererKind;
export const REPORT_MESSAGE_KIND = SELECTED_IDENTITY.messageRendererKind;
export const REPORT_VERSION = SELECTED_IDENTITY.reportVersion;

/** Client-safe identity data for client surfaces. */
export const PLUGIN_IDENTITY = SELECTED_IDENTITY;

const REPROJECT_DELAY_MS = 120;

export default function contribute(client: PluginClientContext) {
  // One catalog survives re-registration, so a re-projection reaches the same
  // decisions and then settles instead of oscillating.
  const catalog = new ArtifactCatalog();
  let removeTransformers: Array<() => void | Promise<void>> = [];
  let reprojectTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleReprojection = () => {
    if (reprojectTimer !== null) return;
    reprojectTimer = setTimeout(() => {
      reprojectTimer = null;
      register();
    }, REPROJECT_DELAY_MS);
  };

  /**
   * Re-registering publishes a new plugin snapshot, so Paseo reprojects every
   * timeline in order with fresh catalog decisions. This is the only public way
   * to fill a card gap after a row's reference arrives or a better row wins.
   */
  function register() {
    catalog.beginGeneration();
    for (const remove of removeTransformers.splice(0)) void remove();
    removeTransformers = [
      client.addTimelineTransformer({
        id: SELECTED_IDENTITY.transformerId,
        query: { itemType: "tool_call" },
        transform({ item, phase }): PluginTimelineTransformResult | undefined {
          const row = { name: item.name, detail: item.detail, callId: item.callId };
          const found = recognizeToolCallWithSource(row, SELECTED_IDENTITY);
          if (!found) {
            // A render row that has no reference yet may finish streaming. Ask
            // for one re-projection at completion so the row gets a fresh look.
            if (isRenderToolRow(row) && catalog.noteGap(item.callId, phase)) scheduleReprojection();
            return undefined;
          }
          const decision = catalog.record({
            data: found.data,
            source: found.source,
            callId: item.callId,
          });
          if (!decision.show) return { items: [] };
          if (decision.changed) scheduleReprojection();
          return {
            items: [
              {
                type: "plugin",
                kind: SELECTED_IDENTITY.rendererKind,
                version: SELECTED_IDENTITY.reportVersion,
                data: found.data,
              },
            ],
          };
        },
      }),
      client.addTimelineTransformer({
        id: SELECTED_IDENTITY.messageTransformerId,
        query: { itemType: "assistant_message" },
        transform({ item }): PluginTimelineTransformResult | undefined {
          // The reply text carries the artifact link the render contract wants.
          // Matching it moves the card here, where `collapseTurns` cannot hide
          // it; the artifact read then supplies the authoritative title/mode.
          const found = reportReferenceFromMessageText(item.text);
          if (!found) return undefined;
          const decision = catalog.record({
            data: found,
            source: "message",
            callId: `message:${found.artifactId}`,
          });
          // Never hide a reply: a second message citing the same artifact keeps
          // its native rendering (and no second card) instead of losing text.
          if (!decision.show) return undefined;
          if (decision.changed) scheduleReprojection();
          return {
            items: [
              {
                type: "plugin",
                kind: SELECTED_IDENTITY.messageRendererKind,
                version: SELECTED_IDENTITY.reportVersion,
                data: { ...found, text: item.text },
              },
            ],
          };
        },
      }),
    ];
  }

  register();
  client.addScreen({
    id: SELECTED_IDENTITY.screenId,
    title: (params) => params.title || SELECTED_IDENTITY.screenTitle,
    Component: ReportScreen,
  });
  client.addTimelineRenderer({
    kind: REPORT_KIND,
    version: REPORT_VERSION,
    schema: reportCardSchema,
    Component: ReportCard,
  });
  client.addTimelineRenderer({
    kind: REPORT_MESSAGE_KIND,
    version: REPORT_VERSION,
    schema: reportMessageSchema,
    Component: ReportMessageCard,
  });
  setNavigator((input) => client.openScreen(input));
  return () => {
    if (reprojectTimer !== null) {
      clearTimeout(reprojectTimer);
      reprojectTimer = null;
    }
    for (const remove of removeTransformers.splice(0)) void remove();
    setNavigator(null);
  };
}
