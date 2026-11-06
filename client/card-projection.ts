/**
 * Which timeline row becomes the report card, and which row stays native.
 *
 * Paseo's `chat > chat display > collapse turns` reduces a finished turn to its
 * triggers up to the **last assistant message**, so a card attached to the
 * `html_render` tool row is hidden with the collapsed work and a card attached
 * to the daemon-appended response row is dropped with the process when the
 * daemon restarts (plugin timeline rows live in memory). Two projections cover
 * that:
 *
 * - the tool row (marker or artifact path in the persisted tool output), and
 * - the assistant reply whose text carries the artifact link/marker, which is
 *   what survives a rebuilt timeline because provider history keeps replies.
 *
 * The catalog ranks decide who owns the one card. `response` (a mounted,
 * daemon-persisted row after the reply) beats `message` (the reply) beats
 * `marker` beats `path`. A losing row keeps its native rendering instead of
 * being emptied: the reply keeps its text and fold anchor, and the tool row
 * stays countable work.
 *
 * This module is framework-free so the exact production decisions are unit
 * testable. It is client-safe: no Node builtins and no host imports.
 */
import type { PluginIdentity } from "../shared/identity.ts";
import type { ReportCardData } from "../shared/protocol.ts";
import {
  isRenderToolRow,
  recognizeToolCallWithSource,
  reportReferenceFromMessageText,
} from "../shared/recognize.ts";
import type { ArtifactCatalog } from "./artifact-catalog.ts";

export interface ProjectedPluginItem {
  readonly type: "plugin";
  readonly kind: string;
  readonly version: number;
  /** Card payload; the reply projection adds the bounded reply text. */
  readonly data: ReportCardData & { readonly text?: string };
}
export interface Projection {
  readonly items: readonly ProjectedPluginItem[];
}

export interface ToolCallRow {
  readonly name: unknown;
  readonly detail?: unknown;
  readonly callId?: unknown;
}

export interface AssistantMessageRow {
  readonly text?: unknown;
  readonly callId?: unknown;
}

/** Stable catalogue key for a projected reply. */
export function messageCallId(artifactId: string): string {
  return `message:${artifactId}`;
}

/** Stable catalogue key for the daemon-persisted response row. */
export function responseCallId(artifactId: string): string {
  return `response:${artifactId}`;
}

/**
 * A reply that carries the artifact reference becomes the card **and** the
 * reply text, drawn with Paseo's own Markdown component, so the text is never
 * hidden. Returns `undefined` when this row keeps its native rendering: no
 * reference, an ambiguous reply, or another surface already owns the artifact.
 */
export function projectAssistantMessage(
  row: AssistantMessageRow,
  identity: PluginIdentity,
  catalog: ArtifactCatalog,
  onCatalogChanged: () => void,
): Projection | undefined {
  const text = row.text;
  if (typeof text !== "string") return undefined;
  const found = reportReferenceFromMessageText(text, identity);
  if (!found) return undefined;
  const decision = catalog.record({
    data: found,
    source: "message",
    callId: messageCallId(found.artifactId),
  });
  // Never empty a reply: a later row citing the same artifact keeps the native
  // message (and no second card).
  if (!decision.show) return undefined;
  if (decision.changed) onCatalogChanged();
  return {
    items: [
      {
        type: "plugin",
        kind: identity.messageRendererKind,
        version: identity.reportVersion,
        data: { ...found, text },
      },
    ],
  };
}

/**
 * A render tool row becomes the card only while it owns the artifact. Once the
 * reply or the persisted response row owns it, the native row is kept: it is
 * the turn's countable tool work and emptying it would blank the fold summary.
 */
export function projectToolCall(
  row: ToolCallRow,
  identity: PluginIdentity,
  catalog: ArtifactCatalog,
  onCatalogChanged: () => void,
): Projection | undefined {
  const found = recognizeToolCallWithSource(row, identity);
  if (!found) return undefined;
  const decision = catalog.record({
    data: found.data,
    source: found.source,
    callId: typeof row.callId === "string" ? row.callId : "",
  });
  if (!decision.show) return undefined;
  if (decision.changed) onCatalogChanged();
  return {
    items: [
      {
        type: "plugin",
        kind: identity.rendererKind,
        version: identity.reportVersion,
        data: found.data,
      },
    ],
  };
}

/**
 * Records the mounted response row. This is what retires the projected copies,
 * and it happens only after the host actually rendered the persisted row, so a
 * fallback card is never removed before its replacement exists.
 */
export function recordResponseCard(
  data: ReportCardData,
  catalog: ArtifactCatalog,
  onCatalogChanged: () => void,
): void {
  const decision = catalog.record({
    data,
    source: "response",
    callId: responseCallId(data.artifactId),
  });
  if (decision.changed) onCatalogChanged();
}

/**
 * One bounded re-projection request for a render row whose reference has not
 * arrived yet (it may still be streaming). Always false for unrelated rows.
 */
export function noteRenderGap(
  row: ToolCallRow,
  phase: "streaming" | "complete" | undefined,
  catalog: ArtifactCatalog,
): boolean {
  if (!isRenderToolRow(row)) return false;
  return catalog.noteGap(typeof row.callId === "string" ? row.callId : "", phase);
}
