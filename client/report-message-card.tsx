/**
 * The report card carried on the assistant's final reply.
 *
 * Why it lives on the reply instead of the render row: with
 * `settings > chat > chat display > collapse turns`, Paseo reduces a finished
 * turn to turn triggers until the **last assistant message** and hides the rest,
 * which includes every tool row — so a card attached to `html_render` is
 * invisible until the turn is expanded, and no plugin API can opt out of that.
 * A plugin item at the reply's position is kept, so that is where the card goes.
 *
 * The cost, accepted deliberately: a timeline transformer's output replaces the
 * row it transforms, so the reply text has to be drawn here. Paseo's own
 * `Markdown` component keeps its theme, selection and link behaviour. Because
 * the projected item is no longer type `assistant_message`, the host's fold no
 * longer finds its end anchor for that trailing segment and leaves it unfolded.
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
      <Markdown>{text}</Markdown>
    </View>
  );
}
