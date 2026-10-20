/**
 * Inline report card.
 *
 * Presentation is decided by the pure `reportCardMode` helper:
 * - web/desktop with `auto`/`iframe`: a borderless live frame, no card chrome;
 * - a structured report: a compact native card with outcome, highlights, graph
 *   thumbnail and next action, plus an entry point into the report screen;
 * - otherwise: the static PNG with measured dimensions and the exact file path.
 *
 * Native clients never mount an iframe. Report JSON is untrusted text: it is
 * rendered as text only and links go through the public host opener.
 */
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { openExternalUrl, useRpc } from "@getpaseo/plugin/client";
import { Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { appearanceFromColors, selectHtmlFrameKind } from "../shared/html-document.ts";
import {
  readArtifactRpc,
  readAssetRpc,
  readOriginalArtifactRpc,
  type ReportCardData,
} from "../shared/protocol.ts";
import { isSafeHttpUrl } from "../shared/report-model.ts";
import { HtmlFrame } from "./html-frame.tsx";
import { FileLinkSection, toneColor } from "./report-blocks.tsx";
import {
  cardHighlights,
  graphAssetName,
  imageAspectRatio,
  interactivePathOf,
  liveHtmlOf,
  outcomeLabel,
  outcomeTone,
  previewAssetName,
  reportCardMode,
} from "./report-view-model.ts";
import { canOpenReportScreen, openReportScreen } from "./surface.ts";

const ARTIFACT_ID = /^[0-9a-f]{32}$/;

interface ZoomImage {
  readonly src: string;
  readonly name: string;
}

export function ReportCard({ item, agentId, theme, layout }: PluginTimelineItemProps<ReportCardData>) {
  const data = item.data;
  const readArtifact = useRpc(readArtifactRpc);
  const readOriginal = useRpc(readOriginalArtifactRpc);
  const readAsset = useRpc(readAssetRpc);
  const toast = useToast();
  const [imageFailed, setImageFailed] = useState(false);
  const [zoom, setZoom] = useState<ZoomImage | null>(null);
  useEffect(() => {
    setImageFailed(false);
    setZoom(null);
  }, [data.artifactId]);

  const appearance = appearanceFromColors(theme.colors);
  const wantsLive =
    ARTIFACT_ID.test(data.artifactId) &&
    agentId.length > 0 &&
    selectHtmlFrameKind({ platform: layout.platform, renderMode: data.renderMode }) === "live";

  const artifact = useQuery({
    queryKey: ["html-render", "artifact", data.artifactId, agentId],
    queryFn: () => readArtifact({ artifactId: data.artifactId, agentId }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
  const original = useQuery({
    queryKey: ["html-render", "original", data.artifactId, agentId],
    queryFn: () => readOriginal({ artifactId: data.artifactId, agentId }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
    enabled: wantsLive && ARTIFACT_ID.test(data.artifactId) && agentId.length > 0,
  });

  const hasReport = artifact.data?.report !== undefined && artifact.data.report !== null;
  const mode = reportCardMode({
    platform: layout.platform,
    renderMode: data.renderMode,
    hasHtml: original.data !== undefined,
    hasReport,
  });

  const previewName = previewAssetName(appearance, artifact.data?.assets);
  const preview = useQuery({
    queryKey: ["html-render", "asset", data.artifactId, agentId, previewName],
    queryFn: () => readAsset({ artifactId: data.artifactId, agentId, asset: previewName }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
    // The structured card needs its graph asset, not the full static preview.
    enabled: mode === "image" && artifact.isSuccess,
  });
  const graphName = graphAssetName(appearance, artifact.data?.assets);
  const graph = useQuery({
    queryKey: ["html-render", "asset", data.artifactId, agentId, graphName],
    queryFn: () => readAsset({ artifactId: data.artifactId, agentId, asset: graphName ?? "graphDark" }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
    enabled: mode === "report" && graphName !== undefined,
  });

  const styles = useMemo(
    () => ({
      card: {
        backgroundColor: theme.colors.surface1,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 10,
        padding: layout.compact ? 12 : 16,
        gap: layout.compact ? 8 : 10,
      } as ViewStyle,
      title: {
        color: theme.colors.foreground,
        fontSize: layout.compact ? 15 : 16,
        fontWeight: "600",
      } as TextStyle,
      body: {
        color: theme.colors.foregroundMuted,
        fontSize: layout.compact ? 12 : 13,
        lineHeight: layout.compact ? 18 : 20,
      } as TextStyle,
      strong: { color: theme.colors.foreground, fontSize: 13, fontWeight: "600" } as TextStyle,
      error: {
        color: theme.colors.statusDanger,
        fontSize: layout.compact ? 12 : 13,
        lineHeight: layout.compact ? 18 : 20,
      } as TextStyle,
      image: {
        width: "100%",
        maxHeight: 420,
        borderRadius: 6,
        backgroundColor: theme.colors.surface0,
      } as ImageStyle,
      placeholder: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 4,
      } as ViewStyle,
    }),
    [theme, layout.compact],
  );

  const liveHtml = original.data ? liveHtmlOf(original.data) : "";
  const artifactTitle = artifact.data?.title ?? data.title;
  const interactivePath = interactivePathOf(artifact.data, original.data);
  const openLink = (url: string) => {
    if (!isSafeHttpUrl(url)) return;
    void openExternalUrl(url).catch(() => toast.error("The link could not be opened"));
  };

  const zoomModal = (
    <Modal
      title={zoom?.name ?? "Image"}
      open={zoom !== null}
      onOpenChange={(open) => {
        if (!open) setZoom(null);
      }}
    >
      <Modal.Content>
        {zoom ? (
          <Image
            source={{ uri: zoom.src }}
            accessibilityLabel={zoom.name}
            resizeMode="contain"
            style={{ width: "100%", aspectRatio: 1 } as ImageStyle}
          />
        ) : null}
      </Modal.Content>
    </Modal>
  );

  if (mode === "live") {
    // Borderless, like the T3 inline frame: no title, summary or outer card.
    // A structured report is still reachable, or it would be invisible on web.
    const reportAvailable = artifact.data?.report !== undefined && artifact.data.report !== null;
    return (
      <>
        <HtmlFrame
          html={liveHtml}
          title={artifactTitle}
          artifactKey={data.artifactId}
          theme={theme}
          appearance={appearance}
          requestedHeight={data.height}
          heights={data.heights}
          platform={layout.platform}
          renderMode={data.renderMode}
          onOpenLink={openLink}
          onOpenImage={setZoom}
        />
        {reportAvailable && canOpenReportScreen() ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View full report"
            onPress={() =>
              openReportScreen({ artifactId: data.artifactId, agentId, title: artifactTitle })
            }
            style={{ alignSelf: "flex-start", paddingVertical: 4 }}
          >
            <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "600" }}>
              View report
            </Text>
          </Pressable>
        ) : null}
        {zoomModal}
      </>
    );
  }

  if (mode === "loading") {
    // No image fallback: either the page is on its way or it cannot be read.
    return (
      <View style={styles.placeholder} accessibilityLabel="Interactive report">
        <Text style={styles.body}>
          {original.isError ? "The interactive page could not be read." : "Loading interactive report…"}
        </Text>
      </View>
    );
  }

  const report = artifact.data?.report ?? null;
  const previewWidth = preview.data?.width ?? artifact.data?.width ?? data.width;
  const previewHeight =
    preview.data?.height ?? artifact.data?.measuredHeight ?? artifact.data?.height ?? data.height;
  const aspectRatio = imageAspectRatio(previewWidth, previewHeight);
  const previewUri = preview.data
    ? `data:image/png;base64,${preview.data.base64}`
    : artifact.data
      ? `data:image/png;base64,${artifact.data.preview.base64}`
      : undefined;

  if (mode === "report" && report) {
    const highlights = cardHighlights(report);
    const graphUri = graph.data ? `data:image/png;base64,${graph.data.base64}` : undefined;
    const graphAspect = imageAspectRatio(graph.data?.width, graph.data?.height);
    return (
      <View style={styles.card}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            accessibilityLabel={`Outcome ${report.outcome.status}`}
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: theme.colors.surface2,
              borderWidth: 1,
              borderColor: toneColor(outcomeTone(report.outcome.status), theme.colors),
            }}
          >
            <Text
              style={{
                color: toneColor(outcomeTone(report.outcome.status), theme.colors),
                fontSize: 11,
                fontWeight: "700",
              }}
            >
              {outcomeLabel(report.outcome.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {artifactTitle}
        </Text>
        <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }} selectable>
          {report.outcome.headline}
        </Text>
        {report.summary ?? data.summary ? (
          <Text style={styles.body} selectable>
            {report.summary ?? data.summary}
          </Text>
        ) : null}
        {highlights.length === 0 ? null : (
          <View style={{ gap: 6 }}>
            {highlights.map((highlight, index) => (
              <View
                key={`${highlight.label}-${index}`}
                accessibilityLabel={`${highlight.label}: ${highlight.value}`}
                style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    marginTop: 7,
                    backgroundColor: toneColor(highlight.tone, theme.colors),
                  }}
                />
                <Text style={{ ...styles.body, flexShrink: 0 }}>{highlight.label}</Text>
                <Text
                  selectable
                  style={{ ...styles.strong, flex: 1, textAlign: "right" }}
                >
                  {highlight.value}
                </Text>
              </View>
            ))}
          </View>
        )}
        {graphUri ? (
          <Image
            source={{ uri: graphUri }}
            accessibilityLabel={`Graph preview for ${artifactTitle}`}
            resizeMode="contain"
            style={{
              ...styles.image,
              maxHeight: 240,
              ...(graphAspect === undefined ? {} : { aspectRatio: graphAspect }),
            } as ImageStyle}
          />
        ) : null}
        {report.nextAction ? (
          <View style={{ gap: 2 }}>
            <Text style={styles.body}>Next action</Text>
            <Text style={styles.strong} selectable>
              {report.nextAction}
            </Text>
          </View>
        ) : null}
        {!canOpenReportScreen() && interactivePath ? (
          <FileLinkSection path={interactivePath} colors={theme.colors} compact={layout.compact} />
        ) : null}
        {canOpenReportScreen() ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View full report"
            onPress={() =>
              openReportScreen({
                artifactId: data.artifactId,
                agentId,
                title: artifactTitle,
              })
            }
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              justifyContent: "center",
              alignSelf: "flex-start",
              borderRadius: 8,
              backgroundColor: theme.colors.accent,
            }}
          >
            <Text style={{ color: theme.colors.accentForeground, fontSize: 13, fontWeight: "600" }}>
              View report
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.card} accessibilityLabel={`HTML report: ${artifactTitle}`}>
      {(artifact.data?.summary ?? data.summary) ? (
        <Text style={styles.body}>{artifact.data?.summary ?? data.summary}</Text>
      ) : null}
      {artifact.isLoading || preview.isLoading ? (
        <Text style={styles.body}>Loading static preview…</Text>
      ) : null}
      {artifact.isError ? (
        <Text style={styles.error}>The report could not be read from the daemon.</Text>
      ) : null}
      {preview.isError && artifact.isSuccess ? (
        <Text style={styles.error}>The static preview image is unavailable.</Text>
      ) : null}
      {previewUri && !imageFailed ? (
        <Image
          source={{ uri: previewUri }}
          accessibilityLabel={`Static preview of ${artifactTitle}`}
          resizeMode="contain"
          onError={() => setImageFailed(true)}
          style={{
            ...styles.image,
            ...(aspectRatio === undefined ? {} : { aspectRatio }),
          } as ImageStyle}
        />
      ) : null}
      {imageFailed ? <Text style={styles.error}>The preview image could not be displayed.</Text> : null}
      {interactivePath ? (
        <FileLinkSection path={interactivePath} colors={theme.colors} compact={layout.compact} />
      ) : null}
      {zoomModal}
    </View>
  );
}
