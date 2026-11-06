/**
 * The report card carried on the assistant's final reply.
 *
 * Why it lives on the reply: Paseo's `chat > chat display > collapse turns`
 * reduces a finished turn to its triggers up to the **last assistant message**,
 * so a card attached to the `html_render` row is hidden with the collapsed
 * work. The daemon's appended response row survives that fold but lives in
 * daemon memory, so a restart or rebuild drops it. Provider history keeps the
 * reply, so projecting the card onto the reply is what keeps an older published
 * answer visible after a rebuild.
 *
 * The cost, accepted deliberately: a transformer's output replaces the row it
 * transforms, so the reply text has to be drawn here. Paseo's own `Markdown`
 * component keeps its theme, selection and link behaviour, so the text is still
 * shown and selectable — it is never hidden. Because the projected item is no
 * longer type `assistant_message`, the host's fold no longer finds its end
 * anchor for that trailing segment and leaves it unfolded. Once the live
 * response row is mounted, the catalog hands the card back to it (rank
 * `response` > `message`) and this row returns to its native rendering.
 *
 * `ReportCard` is reused unchanged so both surfaces share one presentation
 * policy (live frame, native report, static PNG) and one artifact read.
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
      {/* The reply text is never hidden: it keeps Paseo's Markdown rendering. */}
      <Markdown>{text}</Markdown>
    </View>
  );
}
