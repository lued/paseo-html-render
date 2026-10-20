/**
 * Native report presentation blocks.
 *
 * These components only use public React Native and plugin primitives. Report
 * text is always rendered as text: no field is ever interpreted as HTML, a
 * script, a style, or an executable URL scheme. Links go through the host's
 * `ExternalLink` (http(s) only, already schema-validated), and copying goes
 * through the public `copyText` helper.
 */
import type { PluginTheme } from "@getpaseo/plugin";
import { copyText, useToast } from "@getpaseo/plugin/client/react-native";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import type {
  AgentRow,
  EvidenceRow,
  ReportMetric,
  ReportOutcome,
  PromptLesson,
  ReportBlock,
  ReportModelV1,
  ReportTone,
  UsageSummary,
} from "../shared/report-model.ts";
import {
  collectEvidence,
  formatUsageNumber,
  graphView,
  listWindow,
  outcomeLabel,
  outcomeTone,
  safeExternalUrl,
  usageEntries,
  usageModelEntries,
  type GraphView,
  type UsageEntry,
} from "./report-view-model.ts";

type Colors = PluginTheme["colors"];

export interface GraphImage {
  readonly uri: string;
  readonly aspectRatio?: number;
  readonly accessibilityLabel: string;
}

export interface BlockRenderContext {
  readonly colors: Colors;
  readonly compact: boolean;
  readonly report: ReportModelV1;
  readonly graphImage?: GraphImage;
}

const LIST_LIMIT = 8;
const MIN_TOUCH = 44;

/** Tones map onto the host theme; no palette is hard-coded here. */
export function toneColor(tone: ReportTone | undefined, colors: Colors): string {
  if (tone === "good") return colors.statusSuccess;
  if (tone === "warn") return colors.statusWarning;
  if (tone === "bad") return colors.statusDanger;
  return colors.foregroundMuted;
}

function agentTone(status: AgentRow["status"]): ReportTone {
  if (status === "ok") return "good";
  if (status === "failed") return "bad";
  if (status === "blocked") return "warn";
  return "neutral";
}

function bodyStyle(colors: Colors, compact: boolean): TextStyle {
  return { color: colors.foreground, fontSize: compact ? 13 : 14, lineHeight: compact ? 19 : 21 };
}

function mutedStyle(colors: Colors, compact: boolean): TextStyle {
  return {
    color: colors.foregroundMuted,
    fontSize: compact ? 12 : 13,
    lineHeight: compact ? 18 : 20,
  };
}

function labelStyle(colors: Colors): TextStyle {
  return { color: colors.foregroundMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 };
}

function monoStyle(colors: Colors): TextStyle {
  return {
    color: colors.foreground,
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: colors.surface2,
    borderRadius: 6,
    padding: 10,
  };
}

export function SectionTitle({
  children,
  colors,
  compact,
}: {
  children: ReactNode;
  colors: Colors;
  compact: boolean;
}) {
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: colors.foreground,
        fontSize: compact ? 15 : 17,
        fontWeight: "700",
        marginTop: compact ? 8 : 12,
      }}
    >
      {children}
    </Text>
  );
}

export function OutcomeBanner({
  outcome,
  colors,
  compact,
}: {
  outcome: ReportOutcome;
  colors: Colors;
  compact: boolean;
}) {
  const tone = toneColor(outcomeTone(outcome.status), colors);
  return (
    <View
      accessibilityLabel={`Outcome ${outcome.status}: ${outcome.headline}`}
      style={{
        borderLeftWidth: 3,
        borderColor: tone,
        backgroundColor: colors.surface2,
        borderRadius: 6,
        padding: compact ? 10 : 12,
        gap: 4,
      }}
    >
      <Text style={{ color: tone, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 }}>
        {outcomeLabel(outcome.status).toUpperCase()}
      </Text>
      <Text style={{ color: colors.foreground, fontSize: compact ? 14 : 15, fontWeight: "600" }}>
        {outcome.headline}
      </Text>
      {outcome.detail ? (
        <Text style={mutedStyle(colors, compact)} selectable>
          {outcome.detail}
        </Text>
      ) : null}
    </View>
  );
}

export function MetricsList({
  metrics,
  colors,
  compact,
}: {
  metrics: readonly ReportMetric[];
  colors: Colors;
  compact: boolean;
}) {
  if (metrics.length === 0) return null;
  return (
    <View style={{ gap: 6 }}>
      {metrics.map((metric, index) => (
        <View
          key={`${metric.label}-${index}`}
          accessibilityLabel={`Metric ${metric.label}: ${metric.value}`}
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              marginTop: 7,
              backgroundColor: toneColor(metric.tone ?? "neutral", colors),
            }}
          />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={mutedStyle(colors, compact)}>{metric.label}</Text>
            <Text style={{ color: colors.foreground, fontSize: compact ? 14 : 15, fontWeight: "600" }}>
              {metric.value}
            </Text>
            {metric.detail ? (
              <Text style={mutedStyle(colors, compact)} selectable>
                {metric.detail}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export function CopyButton({
  text,
  accessibilityLabel,
  visibleLabel,
  colors,
  compact,
}: {
  text: string;
  accessibilityLabel: string;
  visibleLabel: string;
  colors: Colors;
  compact: boolean;
}) {
  const toast = useToast();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        void copyText(text)
          .then(() => toast.show("Copied"))
          .catch(() => toast.error("Copy failed"));
      }}
      style={{
        minHeight: MIN_TOUCH,
        minWidth: MIN_TOUCH,
        paddingHorizontal: 12,
        justifyContent: "center",
        alignItems: "center",
        alignSelf: "flex-start",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface2,
      }}
    >
      <Text style={{ color: colors.accent, fontSize: compact ? 12 : 13, fontWeight: "600" }}>
        {visibleLabel}
      </Text>
    </Pressable>
  );
}

function ExpandToggle({
  total,
  expanded,
  onPress,
  colors,
  compact,
  what,
}: {
  total: number;
  expanded: boolean;
  onPress(): void;
  colors: Colors;
  compact: boolean;
  what: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        expanded ? `Show fewer ${what}` : `Show all ${formatUsageNumber(total)} ${what}`
      }
      onPress={onPress}
      style={{ minHeight: MIN_TOUCH, justifyContent: "center", alignSelf: "flex-start" }}
    >
      <Text style={{ color: colors.accent, fontSize: compact ? 12 : 13, fontWeight: "600" }}>
        {expanded ? `Show fewer ${what}` : `Show all ${total} ${what}`}
      </Text>
    </Pressable>
  );
}

function CodeBlock({ language, text, ctx }: { language?: string; text: string; ctx: BlockRenderContext }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={labelStyle(ctx.colors)}>{language ? language.toUpperCase() : "CODE"}</Text>
        <CopyButton
          text={text}
          accessibilityLabel={language ? `Copy ${language} code` : "Copy code"}
          visibleLabel="Copy code"
          colors={ctx.colors}
          compact={ctx.compact}
        />
      </View>
      <Text selectable style={monoStyle(ctx.colors)}>
        {text}
      </Text>
    </View>
  );
}

function TableBlock({
  columns,
  rows,
  ctx,
}: {
  columns: readonly string[];
  rows: ReadonlyArray<readonly string[]>;
  ctx: BlockRenderContext;
}) {
  const [expanded, setExpanded] = useState(false);
  const window = listWindow(rows, expanded, LIST_LIMIT);
  const columnWidth = ctx.compact ? 140 : 180;
  return (
    <View style={{ gap: 6 }}>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      accessibilityLabel={`Table with ${columns.length} columns and ${rows.length} rows`}
      style={{ maxWidth: "100%" } as ViewStyle}
      contentContainerStyle={{ minWidth: 320 }}
    >
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", gap: 2 }}>
          {columns.map((column, index) => (
            <Text
              key={`h-${index}`}
              style={{
                width: columnWidth,
                paddingVertical: 6,
                paddingHorizontal: 8,
                backgroundColor: ctx.colors.surface2,
                color: ctx.colors.foreground,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              {column}
            </Text>
          ))}
        </View>
        {window.items.map((row, rowIndex) => (
          <View key={`r-${rowIndex}`} style={{ flexDirection: "row", gap: 2 }}>
            {row.map((cell, cellIndex) => (
              <Text
                key={`c-${rowIndex}-${cellIndex}`}
                selectable
                style={{
                  width: columnWidth,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  backgroundColor: ctx.colors.surface1,
                  color: ctx.colors.foreground,
                  fontSize: 12,
                }}
              >
                {cell}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
    {window.hidden > 0 || expanded ? (
      <ExpandToggle
        total={rows.length}
        expanded={expanded}
        onPress={() => setExpanded((value) => !value)}
        colors={ctx.colors}
        compact={ctx.compact}
        what="table rows"
      />
    ) : null}
    </View>
  );
}

export function AgentRows({ agents, colors, compact }: { agents: readonly AgentRow[]; colors: Colors; compact: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const window = listWindow(agents, expanded, LIST_LIMIT);
  return (
    <View style={{ gap: 8 }}>
      {window.items.map((agent, index) => (
        <View
          key={`${agent.name}-${index}`}
          accessibilityLabel={`Agent ${agent.name}${agent.status ? `, ${agent.status}` : ""}`}
          style={{
            gap: 2,
            paddingVertical: 6,
            paddingHorizontal: 8,
            borderRadius: 6,
            backgroundColor: colors.surface2,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ flex: 1, color: colors.foreground, fontSize: compact ? 13 : 14, fontWeight: "600" }}>
              {agent.name}
            </Text>
            {agent.status ? (
              <Text style={{ color: toneColor(agentTone(agent.status), colors), fontSize: 11, fontWeight: "700" }}>
                {agent.status}
              </Text>
            ) : null}
          </View>
          {agent.role || agent.model ? (
            <Text style={mutedStyle(colors, compact)}>
              {[agent.role, agent.model].filter((value): value is string => typeof value === "string").join(" · ")}
            </Text>
          ) : null}
          {agent.summary ? (
            <Text style={bodyStyle(colors, compact)} selectable>
              {agent.summary}
            </Text>
          ) : null}
        </View>
      ))}
      {window.hidden > 0 || expanded ? (
        <ExpandToggle
          total={agents.length}
          expanded={expanded}
          onPress={() => setExpanded((value) => !value)}
          colors={colors}
          compact={compact}
          what="agents"
        />
      ) : null}
    </View>
  );
}

function EvidenceRowView({ row, colors, compact }: { row: EvidenceRow; colors: Colors; compact: boolean }) {
  const href = safeExternalUrl(row.url);
  return (
    <View style={{ gap: 3, paddingVertical: 4 }}>
      <Text style={{ color: colors.foreground, fontSize: compact ? 13 : 14, fontWeight: "600" }} selectable>
        {row.label}
      </Text>
      {row.detail ? (
        <Text style={mutedStyle(colors, compact)} selectable>
          {row.detail}
        </Text>
      ) : null}
      {href ? (
        <ExternalLink href={href} accessibilityLabel={`Open evidence ${row.label}`}>
          {href}
        </ExternalLink>
      ) : null}
      {row.artifactPath ? (
        <Text selectable style={{ color: colors.foregroundMuted, fontFamily: "monospace", fontSize: 12 }}>
          {row.artifactPath}
        </Text>
      ) : null}
    </View>
  );
}

export function EvidenceSection({
  rows,
  colors,
  compact,
}: {
  rows: readonly EvidenceRow[];
  colors: Colors;
  compact: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const window = listWindow(rows, expanded, LIST_LIMIT);
  return (
    <View style={{ gap: 4 }}>
      {rows.length === 0 ? <Text style={mutedStyle(colors, compact)}>No evidence recorded.</Text> : null}
      {window.items.map((row, index) => (
        <EvidenceRowView key={`${row.label}-${index}`} row={row} colors={colors} compact={compact} />
      ))}
      {window.hidden > 0 || expanded ? (
        <ExpandToggle
          total={rows.length}
          expanded={expanded}
          onPress={() => setExpanded((value) => !value)}
          colors={colors}
          compact={compact}
          what="evidence items"
        />
      ) : null}
    </View>
  );
}

export function GraphSection({
  graph,
  image,
  colors,
  compact,
}: {
  graph: GraphView;
  image?: GraphImage;
  colors: Colors;
  compact: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const nodes = listWindow(graph.nodes, expanded, LIST_LIMIT);
  const edges = listWindow(graph.edges, expanded, LIST_LIMIT);
  const decisions = listWindow(graph.decisions, expanded, LIST_LIMIT);
  const hidden = nodes.hidden + edges.hidden + decisions.hidden;
  return (
    <View style={{ gap: 8 }}>
      {image ? (
        <Image
          source={{ uri: image.uri }}
          accessibilityLabel={image.accessibilityLabel}
          resizeMode="contain"
          style={{
            width: "100%" as const,
            maxHeight: 360,
            borderRadius: 8,
            backgroundColor: colors.surface1,
            ...(image.aspectRatio === undefined ? {} : { aspectRatio: image.aspectRatio }),
          } as ImageStyle}
        />
      ) : null}
      <Text style={mutedStyle(colors, compact)}>
        {`Graph ${graph.id}: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.decisions.length} decisions`}
      </Text>
      <Text style={labelStyle(colors)}>NODES</Text>
      {nodes.items.map((node, index) => (
        <View key={`n-${node.id}-${index}`} style={{ gap: 1 }} accessibilityLabel={`Node ${node.label}`}>
          <Text style={{ color: toneColor(node.tone, colors), fontSize: compact ? 13 : 14, fontWeight: "600" }}>
            {node.kind ? `${node.label} · ${node.kind}` : node.label}
          </Text>
          {node.detail ? (
            <Text style={mutedStyle(colors, compact)} selectable>
              {node.detail}
            </Text>
          ) : null}
        </View>
      ))}
      <Text style={labelStyle(colors)}>EDGES</Text>
      {edges.items.length === 0 ? (
        <Text style={mutedStyle(colors, compact)}>No edges recorded.</Text>
      ) : (
        edges.items.map((edge, index) => (
          <Text
            key={`e-${index}`}
            style={{ color: colors.foreground, fontSize: compact ? 13 : 14 }}
            accessibilityLabel={`Edge from ${edge.from} to ${edge.to}`}
          >
            {`${edge.from} → ${edge.to}${edge.label ? ` (${edge.label})` : ""}`}
          </Text>
        ))
      )}
      <Text style={labelStyle(colors)}>DECISIONS</Text>
      {decisions.items.length === 0 ? (
        <Text style={mutedStyle(colors, compact)}>No decisions recorded.</Text>
      ) : (
        decisions.items.map((decision, index) => (
          <View key={`d-${decision.id}-${index}`} style={{ gap: 1 }}>
            <Text
              style={{ color: colors.foreground, fontSize: compact ? 13 : 14, fontWeight: "600" }}
              accessibilityLabel={`Decision ${decision.label}`}
            >
              {decision.choice ? `${decision.label}: ${decision.choice}` : decision.label}
            </Text>
            {decision.detail ? (
              <Text style={mutedStyle(colors, compact)} selectable>
                {decision.detail}
              </Text>
            ) : null}
          </View>
        ))
      )}
      {hidden > 0 || expanded ? (
        <ExpandToggle
          total={graph.nodes.length + graph.edges.length + graph.decisions.length}
          expanded={expanded}
          onPress={() => setExpanded((value) => !value)}
          colors={colors}
          compact={compact}
          what="graph items"
        />
      ) : null}
    </View>
  );
}

function usageText(entry: UsageEntry): string {
  return entry.value === "Unavailable"
    ? `${entry.label}: ${entry.value}`
    : `${entry.label}: ${entry.value} (${entry.provenance})`;
}

export function UsageSection({
  usage,
  colors,
  compact,
}: {
  usage: UsageSummary;
  colors: Colors;
  compact: boolean;
}) {
  const entries = usageEntries(usage);
  const models = usageModelEntries(usage);
  return (
    <View style={{ gap: 4 }}>
      {entries.map((entry) => (
        <Text key={entry.label} style={bodyStyle(colors, compact)}>
          {usageText(entry)}
        </Text>
      ))}
      {models.map((model, index) => (
        <View key={`${model.name}-${index}`} style={{ gap: 1 }}>
          <Text style={{ color: colors.foreground, fontSize: compact ? 13 : 14, fontWeight: "600" }}>
            {model.provider ? `${model.name} (${model.provider})` : model.name}
          </Text>
          {model.tokens ? (
            <Text style={mutedStyle(colors, compact)}>{usageText(model.tokens)}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function PromptLessonSection({
  lesson,
  colors,
  compact,
}: {
  lesson: PromptLesson;
  colors: Colors;
  compact: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={labelStyle(colors)}>IMPROVED PROMPT</Text>
      <Text style={bodyStyle(colors, compact)} selectable>
        {lesson.improvedPrompt}
      </Text>
      <CopyButton
        text={lesson.improvedPrompt}
        accessibilityLabel="Copy improved prompt"
        visibleLabel="Copy improved prompt"
        colors={colors}
        compact={compact}
      />
      <Text style={labelStyle(colors)}>LESSON</Text>
      <Text style={bodyStyle(colors, compact)} selectable>
        {lesson.lesson}
      </Text>
    </View>
  );
}

export function FileLinkSection({
  path,
  colors,
  compact,
}: {
  path: string;
  colors: Colors;
  compact: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ ...labelStyle(colors), flex: 1 }}>FULL INTERACTIVE HTML FILE</Text>
        <CopyButton
          text={path}
          accessibilityLabel="Copy file link"
          visibleLabel="Copy file link"
          colors={colors}
          compact={compact}
        />
      </View>
      <Text
        selectable
        numberOfLines={1}
        ellipsizeMode="middle"
        style={{ color: colors.foregroundMuted, fontFamily: "monospace", fontSize: 11 }}
      >
        {path}
      </Text>
      <Text style={mutedStyle(colors, compact)}>
        Open it from the assistant&apos;s Markdown link; the plugin never runs the file itself.
      </Text>
    </View>
  );
}

export function TabBar({
  tabs,
  active,
  onChange,
  colors,
  compact,
}: {
  tabs: ReadonlyArray<{ id: string; label: string }>;
  active: string;
  onChange(id: string): void;
  colors: Colors;
  compact: boolean;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityLabel={`Show ${tab.label} tab`}
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.id)}
            style={{
              minHeight: MIN_TOUCH,
              paddingHorizontal: 12,
              justifyContent: "center",
              borderRadius: 8,
              borderWidth: 1,
              borderColor: selected ? colors.accent : colors.border,
              backgroundColor: selected ? colors.surface2 : colors.surface0,
            }}
          >
            <Text
              style={{
                color: selected ? colors.accent : colors.foregroundMuted,
                fontSize: compact ? 12 : 13,
                fontWeight: selected ? "700" : "500",
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ReportBlockView({ block, ctx }: { block: ReportBlock; ctx: BlockRenderContext }) {
  switch (block.kind) {
    case "heading":
      return (
        <Text
          accessibilityRole="header"
          style={{ color: ctx.colors.foreground, fontSize: ctx.compact ? 15 : 16, fontWeight: "700" }}
        >
          {block.text}
        </Text>
      );
    case "text":
      return (
        <Text selectable style={bodyStyle(ctx.colors, ctx.compact)}>
          {block.text}
        </Text>
      );
    case "bullets":
      return (
        <View style={{ gap: 4 }}>
          {block.items.map((item, index) => (
            <View key={`b-${index}`} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ color: ctx.colors.foregroundMuted, fontSize: 13 }}>•</Text>
              <Text style={{ ...bodyStyle(ctx.colors, ctx.compact), flex: 1 }} selectable>
                {item}
              </Text>
            </View>
          ))}
        </View>
      );
    case "steps":
      return (
        <View style={{ gap: 4 }}>
          {block.items.map((item, index) => (
            <View key={`s-${index}`} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ color: ctx.colors.accent, fontSize: 13, fontWeight: "700" }}>{`${index + 1}.`}</Text>
              <Text style={{ ...bodyStyle(ctx.colors, ctx.compact), flex: 1 }} selectable>
                {item}
              </Text>
            </View>
          ))}
        </View>
      );
    case "callout": {
      const tone = toneColor(block.tone === "info" ? "neutral" : block.tone, ctx.colors);
      return (
        <View
          accessibilityLabel={block.title ? `Callout ${block.title}` : "Callout"}
          style={{
            borderLeftWidth: 3,
            borderColor: tone,
            backgroundColor: ctx.colors.surface2,
            borderRadius: 6,
            padding: 10,
            gap: 3,
          }}
        >
          {block.title ? (
            <Text style={{ color: tone, fontSize: 12, fontWeight: "700" }}>{block.title}</Text>
          ) : null}
          <Text style={bodyStyle(ctx.colors, ctx.compact)} selectable>
            {block.text}
          </Text>
        </View>
      );
    }
    case "code":
      return <CodeBlock language={block.language} text={block.text} ctx={ctx} />;
    case "table":
      return <TableBlock columns={block.columns} rows={block.rows} ctx={ctx} />;
    case "agents":
      return <AgentRows agents={block.agents} colors={ctx.colors} compact={ctx.compact} />;
    case "graph": {
      const view = graphView(ctx.report, block.graphId);
      return view ? (
        <GraphSection graph={view} image={ctx.graphImage} colors={ctx.colors} compact={ctx.compact} />
      ) : null;
    }
    case "evidence":
      return <EvidenceSection rows={block.items} colors={ctx.colors} compact={ctx.compact} />;
    default:
      return null;
  }
}

export function ReportBlocks({ blocks, ctx }: { blocks: readonly ReportBlock[]; ctx: BlockRenderContext }) {
  return (
    <View style={{ gap: 10 }}>
      {blocks.map((block, index) => (
        <ReportBlockView key={`${block.kind}-${index}`} block={block} ctx={ctx} />
      ))}
    </View>
  );
}

/** Evidence tab helper: merges top-level and block evidence exactly once. */
export function ReportEvidence({ report, colors, compact }: { report: ReportModelV1; colors: Colors; compact: boolean }) {
  return <EvidenceSection rows={collectEvidence(report)} colors={colors} compact={compact} />;
}
