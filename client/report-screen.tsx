/**
 * Expanded report screen.
 *
 * Tabs are bounded to five: Overview, optional Findings, optional Evidence,
 * optional Run/Usage, and Original. Structured content renders through
 * `report-blocks`; the Original tab always shows the exact HTML as selectable
 * text and never executes it. Web clients may additionally mount the same
 * sandboxed live frame used by the card, with the static PNG as fallback.
 */
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { appearanceFromColors } from "../shared/html-document.ts";
import {
  readArtifactRpc,
  readAssetRpc,
  readOriginalArtifactRpc,
} from "../shared/protocol.ts";
import { HtmlFrame } from "./html-frame.tsx";
import {
  FileLinkSection,
  GraphSection,
  MetricsList,
  OutcomeBanner,
  PromptLessonSection,
  ReportBlocks,
  ReportEvidence,
  SectionTitle,
  TabBar,
  UsageSection,
} from "./report-blocks.tsx";
import {
  blocksForTab,
  graphAssetName,
  graphView,
  imageAspectRatio,
  interactivePathOf,
  liveHtmlOf,
  previewAssetName,
  reportTabs,
  type ReportTab,
  type ReportTabId,
} from "./report-view-model.ts";
import type { GraphImage } from "./report-blocks.tsx";

const ARTIFACT_ID = /^[0-9a-f]{32}$/;

export function ReportScreen({ params, theme, layout }: PluginScreenProps) {
  const artifactId = params.artifactId ?? "";
  const agentId = params.agentId ?? "";
  const enabled = ARTIFACT_ID.test(artifactId) && agentId.length > 0;

  const readArtifact = useRpc(readArtifactRpc);
  const readOriginal = useRpc(readOriginalArtifactRpc);
  const readAsset = useRpc(readAssetRpc);

  const [tab, setTab] = useState<ReportTabId>("overview");
  const [showLive, setShowLive] = useState(false);

  const artifact = useQuery({
    queryKey: ["html-render", "artifact", artifactId, agentId],
    queryFn: () => readArtifact({ artifactId, agentId }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
    enabled,
  });
  const appearance = appearanceFromColors(theme.colors);
  const hasReportModel = artifact.data?.report !== undefined && artifact.data?.report !== null;
  const previewName = previewAssetName(appearance, artifact.data?.assets);
  const preview = useQuery({
    queryKey: ["html-render", "asset", artifactId, agentId, previewName],
    queryFn: () => readAsset({ artifactId, agentId, asset: previewName }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
    // Only the PNG fallback and the Original tab need the full raster.
    enabled: enabled && artifact.isSuccess && (!hasReportModel || tab === "original"),
  });
  const original = useQuery({
    queryKey: ["html-render", "original", artifactId, agentId],
    queryFn: () => readOriginal({ artifactId, agentId }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
    enabled: enabled && tab === "original",
  });

  const report = artifact.data?.report ?? null;
  const tabs = useMemo<ReportTab[]>(
    () => reportTabs(report, { hasOriginal: true }),
    [report],
  );
  useEffect(() => {
    if (!tabs.some((entry) => entry.id === tab)) setTab(tabs[0]?.id ?? "overview");
  }, [tabs, tab]);

  const graphName = graphAssetName(appearance, artifact.data?.assets);
  const graph = useQuery({
    queryKey: ["html-render", "asset", artifactId, agentId, graphName],
    queryFn: () => readAsset({ artifactId, agentId, asset: graphName ?? "graphDark" }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
    enabled: enabled && report?.graph !== undefined && graphName !== undefined && tab === "run",
  });

  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 } as ViewStyle,
      content: {
        padding: layout.compact ? 16 : 24,
        paddingBottom: 40,
        gap: 12,
      } as ViewStyle,
      title: {
        color: theme.colors.foreground,
        fontSize: layout.compact ? 18 : 22,
        fontWeight: "600",
      } as TextStyle,
      body: {
        color: theme.colors.foregroundMuted,
        fontSize: layout.compact ? 13 : 14,
        lineHeight: layout.compact ? 20 : 22,
      } as TextStyle,
      error: {
        color: theme.colors.statusDanger,
        fontSize: layout.compact ? 13 : 14,
        lineHeight: layout.compact ? 20 : 22,
      } as TextStyle,
      image: {
        width: "100%",
        maxHeight: 900,
        borderRadius: 8,
        backgroundColor: theme.colors.surface1,
      } as ImageStyle,
      code: {
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        borderRadius: 8,
        padding: 12,
        fontFamily: "monospace",
        fontSize: 12,
        lineHeight: 18,
      } as TextStyle,
      button: {
        minHeight: 44,
        paddingHorizontal: 14,
        justifyContent: "center",
        alignSelf: "flex-start",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
      } as ViewStyle,
      buttonText: {
        color: theme.colors.accent,
        fontSize: 13,
        fontWeight: "600",
      } as TextStyle,
      liveFrame: { width: "100%" } as ViewStyle,
    }),
    [theme, layout.compact],
  );

  const title = artifact.data?.title ?? params.title ?? "HTML report";
  const previewWidth = preview.data?.width ?? artifact.data?.width ?? 0;
  const previewHeight =
    preview.data?.height ?? artifact.data?.measuredHeight ?? artifact.data?.height ?? 0;
  const aspectRatio = imageAspectRatio(previewWidth, previewHeight);
  const previewUri = preview.data
    ? `data:image/png;base64,${preview.data.base64}`
    : artifact.data
      ? `data:image/png;base64,${artifact.data.preview.base64}`
      : undefined;
  const interactivePath = interactivePathOf(artifact.data, original.data);
  const graphImage: GraphImage | undefined =
    graph.data === undefined
      ? undefined
      : {
          uri: `data:image/png;base64,${graph.data.base64}`,
          ...(imageAspectRatio(graph.data.width, graph.data.height) === undefined
            ? {}
            : { aspectRatio: imageAspectRatio(graph.data.width, graph.data.height) }),
          accessibilityLabel: `Graph preview for ${title}`,
        };
  const liveHtml = original.data ? liveHtmlOf(original.data) : "";

  const renderOverview = () => {
    if (artifact.isLoading) return <Text style={styles.body}>Loading report…</Text>;
    if (artifact.isError) {
      return <Text style={styles.error}>The report could not be read from the daemon.</Text>;
    }
    if (!report) {
      return (
        <View style={{ gap: 10 }}>
          <Text style={styles.body}>
            This report has no structured details. The static PNG preview is shown instead.
          </Text>
          {preview.isError ? (
            <Text style={styles.error}>The static preview image is unavailable.</Text>
          ) : null}
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              accessibilityLabel={`Static preview of ${title}`}
              resizeMode="contain"
              style={{
                ...styles.image,
                ...(aspectRatio === undefined ? {} : { aspectRatio }),
              } as ImageStyle}
            />
          ) : (
            <Text style={styles.body}>Loading static preview…</Text>
          )}
        </View>
      );
    }
    return (
      <View style={{ gap: 12 }}>
        <OutcomeBanner outcome={report.outcome} colors={theme.colors} compact={layout.compact} />
        {report.summary ? (
          <Text style={styles.body} selectable>
            {report.summary}
          </Text>
        ) : null}
        {report.metrics ? (
          <MetricsList metrics={report.metrics} colors={theme.colors} compact={layout.compact} />
        ) : null}
        {report.nextAction ? (
          <View style={{ gap: 2 }}>
            <Text style={styles.body}>Next action</Text>
            <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "600" }} selectable>
              {report.nextAction}
            </Text>
          </View>
        ) : null}
        <ReportBlocks
          blocks={blocksForTab(report, "overview")}
          ctx={{ colors: theme.colors, compact: layout.compact, report }}
        />
      </View>
    );
  };

  const renderFindings = () => {
    if (!report) return null;
    return (
      <ReportBlocks
        blocks={blocksForTab(report, "findings")}
        ctx={{ colors: theme.colors, compact: layout.compact, report }}
      />
    );
  };

  const renderEvidence = () => {
    if (!report) return null;
    return <ReportEvidence report={report} colors={theme.colors} compact={layout.compact} />;
  };

  const renderRun = () => {
    if (!report) return null;
    const view = graphView(report);
    const runBlocks = blocksForTab(report, "run").filter((block) => block.kind !== "graph");
    return (
      <View style={{ gap: 12 }}>
        {view ? (
          <>
            <SectionTitle colors={theme.colors} compact={layout.compact}>
              Run graph
            </SectionTitle>
            <GraphSection
              graph={view}
              image={graphImage}
              colors={theme.colors}
              compact={layout.compact}
            />
          </>
        ) : null}
        <ReportBlocks
          blocks={runBlocks}
          ctx={{ colors: theme.colors, compact: layout.compact, report, graphImage }}
        />
        {report.usage ? (
          <>
            <SectionTitle colors={theme.colors} compact={layout.compact}>
              Usage
            </SectionTitle>
            <UsageSection usage={report.usage} colors={theme.colors} compact={layout.compact} />
          </>
        ) : null}
        {report.promptLesson ? (
          <>
            <SectionTitle colors={theme.colors} compact={layout.compact}>
              Prompt lesson
            </SectionTitle>
            <PromptLessonSection
              lesson={report.promptLesson}
              colors={theme.colors}
              compact={layout.compact}
            />
          </>
        ) : null}
      </View>
    );
  };

  const renderOriginal = () => {
    const isWeb = layout.platform === "web";
    return (
      <View style={{ gap: 10 }}>
        <Text style={styles.body}>
          The original HTML is shown as selectable text. Markup and scripts are never executed in the
          plugin&apos;s native views.
        </Text>
        {isWeb ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showLive ? "Hide live HTML" : "Show live HTML in a sandboxed frame"}
            onPress={() => setShowLive((value) => !value)}
            style={styles.button}
          >
            <Text style={styles.buttonText}>{showLive ? "Hide live HTML" : "Show live HTML"}</Text>
          </Pressable>
        ) : null}
        {showLive && isWeb && original.data ? (
          <View style={styles.liveFrame}>
            <HtmlFrame
              html={liveHtml}
              title={title}
              artifactKey={artifactId}
              theme={theme}
              appearance={appearance}
              requestedHeight={artifact.data?.height ?? 600}
              heights={artifact.data?.heights}
              platform={layout.platform}
              renderMode="auto"
            />
          </View>
        ) : null}
        {original.isLoading ? <Text style={styles.body}>Loading original HTML…</Text> : null}
        {original.isError ? (
          <Text style={styles.error}>The original HTML is no longer stored on the daemon.</Text>
        ) : null}
        {original.data ? (
          <Text selectable style={styles.code}>
            {original.data.html}
          </Text>
        ) : null}
        {interactivePath ? (
          <FileLinkSection path={interactivePath} colors={theme.colors} compact={layout.compact} />
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <TabBar
          tabs={tabs}
          active={tab}
          onChange={(id) => setTab(id as ReportTabId)}
          colors={theme.colors}
          compact={layout.compact}
        />
        {tab === "overview" ? renderOverview() : null}
        {tab === "findings" ? renderFindings() : null}
        {tab === "evidence" ? renderEvidence() : null}
        {tab === "run" ? renderRun() : null}
        {tab === "original" ? renderOriginal() : null}
      </ScrollView>
    </View>
  );
}
