import type { PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import type { PluginTimelineTransformResult } from "@getpaseo/plugin";
import { useEffect } from "react";
import { ReportCard } from "./client/report-card.tsx";
import { ReportMessageCard } from "./client/report-message-card.tsx";
import { ReportScreen } from "./client/report-screen.tsx";
import { ArtifactCatalog } from "./client/artifact-catalog.ts";
import { setNavigator } from "./client/surface.ts";
import { reportCardSchema, reportMessageSchema, type ReportCardData } from "./shared/protocol.ts";
import { isRenderToolRow, recognizeToolCallWithSource } from "./shared/recognize.ts";
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
   * retires the duplicate on the render row — and only after the persisted row
   * has actually been observed, so the fallback card is never removed before its
   * replacement exists.
   */
  function ReportResponseCard(props: PluginTimelineItemProps<ReportCardData>) {
    const data = props.item.data;
    useEffect(() => {
      const decision = catalog.record({
        data,
        source: "response",
        callId: `response:${data.artifactId}`,
      });
      if (decision.changed) scheduleReprojection();
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
          if (!decision.show) {
            // Another surface owns this artifact's only card. Keep the native
            // row: it is this turn's countable tool work, and replacing it with
            // nothing would empty the fold summary of a turn whose single tool
            // call was this render. The appended response row carries the HTML.
            return undefined;
          }
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
  // Retained for compatibility with any client that still holds the old shape,
  // but nothing emits it: replacing the native reply removes the fold's end
  // anchor, which unfolds the whole turn instead of hiding only its tools.
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
