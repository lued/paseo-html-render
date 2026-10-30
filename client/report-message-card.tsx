/**
 * Legacy reply-replacement renderer, retained for previously projected items.
 * Nothing emits this shape now: replacing a native assistant reply destroys
 * Paseo's collapse boundary. New publications use the server's persistent
 * response row after the untouched reply; see server/response-cards.ts.
 */
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Markdown } from "@getpaseo/plugin/client/ui";
import { View } from "react-native";
import type { ViewStyle } from "react-native";
import type { ReportMessageData } from "../shared/protocol.ts";
import { SELECTED_IDENTITY } from "../shared/selected-identity.ts";
import { ReportCard } from "./report-card.tsx";

export function ReportMessageCard(props: PluginTimelineItemProps<ReportMessageData>) {
  const { text, ...card } = props.item.data;
  const styles = { wrap: { gap: 8, paddingBottom: 2 } as ViewStyle };
  return (
    <View style={styles.wrap} accessibilityLabel="HTML report and reply">
      <ReportCard
        {...props}
        item={{
          type: "plugin",
          kind: SELECTED_IDENTITY.rendererKind,
          version: SELECTED_IDENTITY.reportVersion,
          data: card,
        }}
      />
      <Markdown>{text}</Markdown>
    </View>
  );
}
