/**
 * Persist the published HTML answer after the native assistant reply, using
 * Paseo's public plugin-session timeline API. The reply remains the fold anchor;
 * draft previews and ordinary tool activity remain work. No host patch or
 * client-side transcript mutation is involved.
 */
import { createHash } from "node:crypto";
import type { PluginHandlerContext, PluginHookAgent, PluginHookContext, PluginTurnOutcome } from "@getpaseo/plugin/server";
import { reportCardSchema, type ReportCardData } from "../shared/protocol.ts";
import type { PluginIdentity } from "../shared/identity.ts";
import { decodeReportReference, isRenderToolRow } from "../shared/recognize.ts";
import type { ArtifactRequester } from "./artifacts.ts";

type PaseoApi = PluginHandlerContext["paseo"];
type TimelineHandle = ReturnType<PaseoApi["agents"]["ref"]>["timeline"];
export type ResponseItem = Parameters<TimelineHandle["append"]>[0];
const DEFAULT_REFETCH_LIMIT = 24;
const MAX_ENTRIES = 240;
const MAX_REFETCH_LIMIT = 48;
const MAX_SCAN_NODES = 192;
const MAX_OUTPUT_STRINGS = 32;
const MAX_OUTPUT_CHARS = 400_000;
const MAX_RENDER_ROWS = 6;
const GATE_LIMIT = 512;
const UNTRUSTED_KEYS = new Set(["input", "arguments", "parameters", "params"]);

export type ResponseSkipReason = "outcome" | "busy" | "disposed" | "timeout" | "aborted" |
  "empty-timeline" | "no-reply" | "no-publish" | "already-present" | "already-appended" |
  "no-workspace" | "unreadable" | "read-failed" | "append-failed" | "unattributed-turn" |
  "stale-turn" | "active-turn";
export type ResponseOutcome =
  | { readonly result: "appended"; readonly artifactId: string; readonly itemId: string; readonly rowName: string }
  | { readonly result: "skipped"; readonly reason: ResponseSkipReason; readonly artifactId?: string };
export interface TurnEndedInput {
  readonly agent: Pick<PluginHookAgent, "id" | "parentAgentId">;
  readonly turnId: string | null;
  readonly outcome: PluginTurnOutcome;
}
export interface ResponseCardStore {
  readCard(artifactId: string, requester: ArtifactRequester): Promise<{ readonly manifest?: unknown; readonly card: ReportCardData }>;
}
export interface ResponseCardsOptions {
  readonly identity: PluginIdentity;
  readonly store: ResponseCardStore;
  resolveRequester(paseo: PaseoApi, agentId: string): Promise<ArtifactRequester>;
  log(message: string): void;
  refetchLimit?: number;
  timeoutMs?: number;
}
export interface ResponseCards {
  handleTurnEnded(input: TurnEndedInput, context: Pick<PluginHookContext, "paseo" | "signal">): Promise<ResponseOutcome>;
  turnStarted(agentId: string): void;
  dispose(): void;
}
interface EntryView { readonly item: Record<string, unknown>; readonly turnId: string | null }
export interface SelectOptions { readonly turnId: string | null; readonly identity: PluginIdentity }
export type Selection =
  | { readonly kind: "target"; readonly artifactId: string; readonly rowName: string }
  | { readonly kind: "skip"; readonly reason: ResponseSkipReason };

export function responseItemId(agentId: string, artifactId: string): string {
  return `response:${createHash("sha256").update(agentId).digest("hex").slice(0, 16)}:${artifactId}`;
}
function safe(value: string): string { return value.replace(/[^A-Za-z0-9._:@#-]/g, "_").slice(0, 96); }
function skip(reason: ResponseSkipReason, artifactId?: string): ResponseOutcome {
  return { result: "skipped", reason, ...artifactId === undefined ? {} : { artifactId } };
}
function entryViews(entries: unknown): EntryView[] {
  if (!Array.isArray(entries)) return [];
  return entries.slice(-MAX_ENTRIES).flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { item, turnId } = entry as { item?: unknown; turnId?: unknown };
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    return [{ item: item as Record<string, unknown>, turnId: typeof turnId === "string" && turnId.length > 0 ? turnId : null }];
  });
}

/** Bounded output-only walk. Arguments are not publication evidence. */
export function publishedMarkerText(detail: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<unknown>();
  let nodes = 0;
  let chars = 0;
  const exhausted = () => nodes >= MAX_SCAN_NODES || chars >= MAX_OUTPUT_CHARS || found.length >= MAX_OUTPUT_STRINGS;
  const walk = (node: unknown, depth: number): void => {
    if (exhausted() || depth > 8) return;
    nodes += 1;
    if (typeof node === "string") {
      const text = node.slice(0, MAX_OUTPUT_CHARS - chars);
      chars += text.length;
      found.push(text);
    } else if (typeof node === "object" && node !== null && !seen.has(node)) {
      seen.add(node);
      if (Array.isArray(node)) {
        for (const child of node) { if (exhausted()) break; walk(child, depth + 1); }
      } else {
        for (const key of Object.keys(node)) {
          if (exhausted()) break;
          if (!UNTRUSTED_KEYS.has(key.toLowerCase())) walk((node as Record<string, unknown>)[key], depth + 1);
        }
      }
    }
  };
  walk(detail, 0);
  return found;
}

/** Never filter newer turns out and then append an old answer beneath them. */
export function selectResponseTarget(entries: unknown, options: SelectOptions): Selection {
  if (!options.turnId) return { kind: "skip", reason: "unattributed-turn" };
  const views = entryViews(entries);
  if (views.length === 0) return { kind: "skip", reason: "empty-timeline" };
  const latest = views.findLast(entry => entry.turnId !== null && entry.item.type !== "plugin");
  if (latest && latest.turnId !== options.turnId) return { kind: "skip", reason: "stale-turn" };
  const window = views.filter(entry => entry.turnId === options.turnId && entry.item.type !== "plugin");
  const reply = window.findLastIndex(entry => entry.item.type === "assistant_message" &&
    typeof entry.item.text === "string" && entry.item.text.trim().length > 0);
  if (reply < 0) return { kind: "skip", reason: "no-reply" };
  // Later work or an unattributed new prompt must not be pulled into this answer.
  if (reply !== window.length - 1) return { kind: "skip", reason: "no-publish" };
  const originalReply = views.indexOf(window[reply]!);
  if (views.slice(originalReply + 1).some(entry => entry.item.type !== "plugin")) {
    return { kind: "skip", reason: "stale-turn" };
  }
  let examined = 0;
  for (let index = reply - 1; index >= 0 && examined < MAX_RENDER_ROWS; index -= 1) {
    const item = window[index]!.item;
    if (item.type !== "tool_call" || typeof item.name !== "string" || !isRenderToolRow({ name: item.name, detail: item.detail })) continue;
    examined += 1;
    if (item.status !== "completed" || (item.error !== null && item.error !== undefined)) continue;
    for (const text of publishedMarkerText(item.detail)) {
      const reference = decodeReportReference(text, options.identity);
      if (reference) return { kind: "target", artifactId: reference.artifactId, rowName: item.name };
    }
  }
  return { kind: "skip", reason: "no-publish" };
}

export function hasResponseRow(entries: unknown, itemId: string, kind: string, pluginId?: string): boolean {
  return entryViews(entries).some(({ item }) => item.type === "plugin" && item.id === itemId &&
    item.kind === kind && (pluginId === undefined || item.pluginId === pluginId));
}

type Settled<T> = { kind: "done"; value: T } | { kind: "failed"; error: unknown } | { kind: "timeout" } | { kind: "aborted" };
function raceDeadline<T>(work: Promise<T>, timeoutMs: number, signal: AbortSignal): Promise<Settled<T>> {
  let timer: ReturnType<typeof setTimeout>;
  let onAbort: () => void;
  const settled = work.then((value): Settled<T> => ({ kind: "done", value }),
    (error): Settled<T> => ({ kind: "failed", error }));
  const timeout = new Promise<Settled<T>>(resolve => { timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs); });
  const aborted = new Promise<Settled<T>>(resolve => {
    onAbort = () => resolve({ kind: "aborted" });
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([settled, timeout, aborted]).finally(() => {
    clearTimeout(timer!);
    signal.removeEventListener("abort", onAbort!);
  });
}

/** Two bounded snapshots, a total deadline, and no client-triggered mutations. */
export function createResponseCards(options: ResponseCardsOptions): ResponseCards {
  const { identity, store, log } = options;
  const refetchLimit = Math.max(1, Math.min(options.refetchLimit ?? DEFAULT_REFETCH_LIMIT, MAX_REFETCH_LIMIT));
  const timeoutMs = Math.max(0, options.timeoutMs ?? 4_000);
  const inflight = new Map<string, AbortController>();
  const appended = new Set<string>();
  let disposed = false;
  const keyFor = (agentId: string, artifactId: string) => `${agentId}\u0000${artifactId}`;
  const remember = (key: string) => {
    if (appended.size >= GATE_LIMIT) appended.delete(appended.values().next().value!);
    appended.add(key);
  };
  const read = async (timeline: TimelineHandle) => {
    const page = await timeline.refetch({ direction: "tail", limit: refetchLimit, projection: "canonical" });
    if (page.error) throw new Error("Timeline read failed");
    return { entries: page.entries, active: page.agent?.status === "running" || page.agent?.status === "initializing" };
  };
  const run = async (input: TurnEndedInput, context: Pick<PluginHookContext, "paseo" | "signal">,
    signal: AbortSignal, deadline: number): Promise<ResponseOutcome> => {
    const stopped = (): ResponseOutcome | null => disposed ? skip("disposed") : signal.aborted ? skip("aborted") :
      performance.now() >= deadline ? skip("timeout") : null;
    const timeline = context.paseo.agents.ref(input.agent.id).timeline;
    const page = await read(timeline);
    let stop = stopped();
    if (stop) return stop;
    if (page.active) return skip("active-turn");
    const selection = selectResponseTarget(page.entries, { turnId: input.turnId, identity });
    if (selection.kind === "skip") return skip(selection.reason);
    const { artifactId } = selection;
    const itemId = responseItemId(input.agent.id, artifactId);
    const present = (entries: unknown) => hasResponseRow(entries, itemId, identity.responseRendererKind, identity.pluginId);
    if (present(page.entries)) return skip("already-present", artifactId);
    if (appended.has(keyFor(input.agent.id, artifactId))) return skip("already-appended", artifactId);
    let requester: ArtifactRequester;
    try { requester = await options.resolveRequester(context.paseo, input.agent.id); }
    catch { return skip("no-workspace", artifactId); }
    stop = stopped();
    if (stop) return stop;
    let card: ReportCardData;
    try { card = reportCardSchema.parse((await store.readCard(artifactId, requester)).card); }
    catch { return skip("unreadable", artifactId); }
    stop = stopped();
    if (stop) return stop;
    if (card.artifactId !== artifactId) return skip("unreadable", artifactId);
    // Authority/storage can await I/O. Recheck the reply and existing receipt
    // immediately before the append, not just before those waits.
    const latest = await read(timeline);
    stop = stopped();
    if (stop) return stop;
    if (latest.active) return skip("active-turn", artifactId);
    const target = selectResponseTarget(latest.entries, { turnId: input.turnId, identity });
    if (target.kind === "skip") return skip(target.reason, artifactId);
    if (target.artifactId !== artifactId) return skip("stale-turn", artifactId);
    if (present(latest.entries)) return skip("already-present", artifactId);
    try {
      await timeline.append({ type: "plugin", id: itemId, kind: identity.responseRendererKind,
        version: identity.reportVersion, data: card });
    } catch { return skip("append-failed", artifactId); }
    remember(keyFor(input.agent.id, artifactId));
    log(`response-card appended agent=${safe(input.agent.id)} artifact=${artifactId} item=${safe(itemId)} row=${safe(selection.rowName)}`);
    return { result: "appended", artifactId, itemId, rowName: selection.rowName };
  };
  return {
    async handleTurnEnded(input, context) {
      if (disposed) return skip("disposed");
      if (context.signal.aborted) return skip("aborted");
      if (input.outcome.kind !== "completed") return skip("outcome");
      if (!input.turnId) return skip("unattributed-turn");
      if (inflight.has(input.agent.id)) return skip("busy");
      const controller = new AbortController();
      const relayAbort = () => controller.abort();
      context.signal.addEventListener("abort", relayAbort, { once: true });
      inflight.set(input.agent.id, controller);
      const work = run(input, context, controller.signal, performance.now() + timeoutMs);
      // A timeout does not cancel an already-dispatched append RPC. Keep its
      // gate until it settles, and reconcile history on subsequent attempts.
      const release = () => { if (inflight.get(input.agent.id) === controller) inflight.delete(input.agent.id); };
      void work.then(release, release);
      try {
        const result = await raceDeadline(work, timeoutMs, controller.signal);
        let outcome: ResponseOutcome;
        if (result.kind === "done") outcome = result.value;
        else if (result.kind === "failed") outcome = skip("read-failed");
        else { controller.abort(); outcome = skip(result.kind); }
        if (outcome.result === "skipped") log(`response-card skip reason=${outcome.reason} agent=${safe(input.agent.id)}`);
        return outcome;
      } finally { context.signal.removeEventListener("abort", relayAbort); }
    },
    turnStarted(agentId) { inflight.get(agentId)?.abort(); },
    dispose() {
      disposed = true;
      for (const controller of inflight.values()) controller.abort();
      appended.clear();
    },
  };
}
