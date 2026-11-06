import type { PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import type { PluginTimelineTransformResult } from "@getpaseo/plugin";
import { useEffect } from "react";
import { ReportCard } from "./client/report-card.tsx";
import { ReportMessageCard } from "./client/report-message-card.tsx";
import { ReportScreen } from "./client/report-screen.tsx";
import { ArtifactCatalog } from "./client/artifact-catalog.ts";
import {
  noteRenderGap,
  projectAssistantMessage,
  projectToolCall,
  recordResponseCard,
} from "./client/card-projection.ts";
import { setNavigator } from "./client/surface.ts";
import { reportCardSchema, reportMessageSchema, type ReportCardData } from "./shared/protocol.ts";
import { SELECTED_IDENTITY } from "./shared/selected-identity.ts";

/** Renderer contribution identity for this build. */
export const REPORT_KIND = SELECTED_IDENTITY.rendererKind;
export const REPORT_MESSAGE_KIND = SELECTED_IDENTITY.messageRendererKind;
export const REPORT_RESPONSE_KIND = SELECTED_IDENTITY.responseRendererKind;
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
  let disposed = false;

  const scheduleReprojection = () => {
    if (disposed || reprojectTimer !== null) return;
    reprojectTimer = setTimeout(() => {
      reprojectTimer = null;
      register();
    }, REPROJECT_DELAY_MS);
  };

  /**
   * The card the daemon persisted after the turn's native reply.
   *
   * Unlike a projected card this row is always mounted: it sits after the last
   * assistant message, so `collapse turns` keeps it. Recording it here is what
   * retires the duplicate on the render row and on the reply — and only after
   * the persisted row has actually been observed, so a fallback card is never
   * removed before its replacement exists.
   */
  function ReportResponseCard(props: PluginTimelineItemProps<ReportCardData>) {
    const data = props.item.data;
    useEffect(() => {
      recordResponseCard(data, catalog, scheduleReprojection);
    }, [data]);
    return (
      <ReportCard
        {...props}
        item={{
          type: "plugin",
          kind: REPORT_KIND,
          version: REPORT_VERSION,
          data,
        }}
      />
    );
  }

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
          const projected = projectToolCall(row, SELECTED_IDENTITY, catalog, scheduleReprojection);
          if (projected) return { items: [...projected.items] };
          // A render row that has no reference yet may finish streaming. Ask
          // for one re-projection at completion so the row gets a fresh look.
          if (noteRenderGap(row, phase, catalog)) scheduleReprojection();
          return undefined;
        },
      }),
      client.addTimelineTransformer({
        id: SELECTED_IDENTITY.messageTransformerId,
        query: { itemType: "assistant_message" },
        transform({ item }): PluginTimelineTransformResult | undefined {
          // The reply carries the artifact reference the render contract asks
          // for. Projecting the card there is what survives a rebuilt timeline:
          // the daemon's response row lives in memory and is lost on restart,
          // while provider history keeps the reply. A live turn keeps its
          // response row (catalog rank `response`) and this row stays native.
          const projected = projectAssistantMessage(
            { text: item.text },
            SELECTED_IDENTITY,
            catalog,
            scheduleReprojection,
          );
          return projected ? { items: [...projected.items] } : undefined;
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
  client.addTimelineRenderer({
    kind: REPORT_RESPONSE_KIND,
    version: REPORT_VERSION,
    schema: reportCardSchema,
    Component: ReportResponseCard,
  });
  setNavigator((input) => client.openScreen(input));
  return () => {
    disposed = true;
    if (reprojectTimer !== null) {
      clearTimeout(reprojectTimer);
      reprojectTimer = null;
    }
    for (const remove of removeTransformers.splice(0)) void remove();
    setNavigator(null);
  };
}
