/**
 * Native Android transport and trusted outer-shell builder.
 *
 * The WebView loads only this constant shell. The report document is inert JSON
 * data in a non-executable script element until the shell assigns it to the
 * sandboxed inner iframe. No report markup is ever parsed as outer HTML.
 *
 * Page -> native messages use bounded, acknowledged chunks over three
 * carriers: the RNCWebView `onMessage` bridge (`messagingEnabled` on the
 * trusted shell), the historical URL-fragment callbacks, and the document
 * title read from the same loading event. All three are sent together and feed
 * one ordered assembler, so a chunk delivered twice is acknowledged twice and
 * applied once. The title carrier exists because Android WebView reports a
 * `loadDataWithBaseURL` commit URL from the renderer's stored `data:` URL
 * (Chromium `render_frame_impl.cc` MaybeGetOverriddenURL), which loses the
 * fragment; the title travels in the same event independently of that URL.
 * The native side revalidates every complete message with the existing shared
 * readers; the shell also source-filters and requires fresh focus/user
 * activation before forwarding link/image requests.
 *
 * The bridge object is injected into the shell document, never into the
 * report: the report stays in an opaque `allow-scripts` iframe that cannot
 * reach `window.ReactNativeWebView` and does not know the per-mount session id
 * every accepted chunk must carry.
 *
 * This module has no React, React Native, Node or DOM imports.
 */
import { HTML_FRAME_READY_TIMEOUT_MS } from "../shared/html-document.ts";
import { MAX_INTERACTIVE_HTML_BYTES } from "../shared/limits.ts";
import { utf8ByteLength } from "../shared/report-model.ts";

export const NATIVE_P2N_PREFIX = "#paseo-p2n=";
export const NATIVE_ERROR_PREFIX = "#paseo-error=";
/** Document-title carrier. Bounded, prefixed, and parsed by one strict reader. */
export const NATIVE_TITLE_PREFIX = "paseo-p2n-title:";
export const NATIVE_TITLE_ERROR_PREFIX = "paseo-error-title:";
export const NATIVE_THEME_ACK_TYPE = "paseo-theme-ack";
/** Visible on both sides so device evidence identifies this diagnostic build. */
export const NATIVE_DIAGNOSTIC_REVISION = "diag-2";
export const NATIVE_READY_TIMEOUT_MS = Math.max(HTML_FRAME_READY_TIMEOUT_MS, 8_000);
export const NATIVE_MAX_URL_CHARS = 65_536;
/**
 * Chromium caps `document.title` at `blink::mojom::kMaxTitleChars` (4096) and
 * kills the renderer when a title exceeds it, so the whole title — prefix,
 * session, canonical numbers, retry suffix and chunk data — must stay below it
 * with headroom. One chunk therefore carries 3000 encoded characters, which
 * leaves even a ten-digit message id plus retry suffix at 3109 ASCII
 * characters (891 under the budget).
 */
export const NATIVE_MAX_TITLE_CHARS = 4000;
export const NATIVE_MAX_CHUNK_CHARS = 3000;
/** Worst-case URI encoding of the 8 MiB base64 image source plus JSON headroom. */
export const NATIVE_MAX_ENCODED_CHARS = 28 * 1_024 * 1_024;
export const NATIVE_MAX_CHUNKS = Math.ceil(NATIVE_MAX_ENCODED_CHARS / NATIVE_MAX_CHUNK_CHARS) + 8;
export const NATIVE_MAX_QUEUE = 32;
export const NATIVE_ACK_TIMEOUT_MS = 5_000;
export const NATIVE_TRANSFER_TIMEOUT_MS = 120_000;
export const NATIVE_THEME_ACK_TIMEOUT_MS = 120_000;
export const NATIVE_MAX_SESSION_CHARS = 64;
export const NATIVE_SESSION_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Security props for the raw RNCWebView component. No cache/cookie clearing.
 *
 * `messagingEnabled` is on for hosts that dispatch the plain `onMessage` event.
 * Only the constant trusted shell is loaded as the outer document;
 * it injects `window.ReactNativeWebView` into the shell frame. Report markup is
 * never outer HTML and stays in an opaque `allow-scripts` iframe, so it cannot
 * reach that bridge. Keep every other prop hardening unchanged.
 */
export const NATIVE_WEBVIEW_SECURITY_PROPS = Object.freeze({
  javaScriptEnabled: true,
  messagingEnabled: true,
  setSupportMultipleWindows: false,
  javaScriptCanOpenWindowsAutomatically: false,
  domStorageEnabled: false,
  thirdPartyCookiesEnabled: false,
  allowFileAccess: false,
  allowFileAccessFromFileURLs: false,
  allowUniversalAccessFromFileURLs: false,
  mixedContentMode: "never",
  mediaPlaybackRequiresUserAction: true,
  geolocationEnabled: false,
  saveFormData: false,
});

/** The host public namespace export must be a real function, not null/object. */
export function isUsableDocumentFrame(value: unknown): boolean {
  return typeof value === "function";
}

export type NativeHtmlCapability =
  | { readonly available: true; readonly reason: "ready" }
  | {
      readonly available: false;
      readonly reason:
        | "platform"
        | "host-native-view"
        | "command-apis"
        | "error-boundary";
    };

export interface NativeCapabilitySurfaces {
  readonly platform: "ios" | "android" | "web";
  readonly documentFrame: unknown;
  readonly component: unknown;
  readonly dispatchViewManagerCommand: unknown;
  readonly findNodeHandle: unknown;
  /**
   * Result of a public RN view-manager probe. `null` means the host exposes no
   * probe; it is not evidence that the view is registered.
   */
  readonly registeredViewManager: boolean | null;
}

/**
 * Was RNCWebView already registered? `hasViewManagerConfig` is a public RN
 * query and does not register or mount anything. `getViewManagerConfig` is a
 * fallback for older public UIManager shapes; both are read-only.
 */
export function probeRegisteredViewManager(uiManager: unknown): boolean | null {
  const manager = uiManager as {
    hasViewManagerConfig?: unknown;
    getViewManagerConfig?: unknown;
  } | null | undefined;
  if (!manager) return null;
  if (typeof manager.hasViewManagerConfig === "function") {
    try {
      return manager.hasViewManagerConfig.call(manager, "RNCWebView") === true;
    } catch {
      return false;
    }
  }
  if (typeof manager.getViewManagerConfig === "function") {
    try {
      const config: unknown = manager.getViewManagerConfig.call(manager, "RNCWebView");
      return isObject(config);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Select the Android route without rendering a probe.
 *
 * DocumentFrame is an optional public export on 0.13, absent on 0.12. A native
 * manager query is stronger evidence than that export: an explicit negative
 * always wins. If no query is exposed, the 0.13 export permits a contained
 * mount attempt. Neither signal proves JS view-config registration or a live
 * handshake; mount errors and the ready deadline remain enforced. No path
 * calls requireNativeComponent or registers a second view.
 */
export function selectNativeHtmlCapability(input: NativeCapabilitySurfaces): NativeHtmlCapability {
  if (input.platform !== "android") return { available: false, reason: "platform" };
  const hasDocumentFrame = isUsableDocumentFrame(input.documentFrame);
  if (input.registeredViewManager === false || (!hasDocumentFrame && input.registeredViewManager !== true)) {
    return { available: false, reason: "host-native-view" };
  }
  if (typeof input.component !== "function") {
    return { available: false, reason: "error-boundary" };
  }
  if (
    typeof input.dispatchViewManagerCommand !== "function" ||
    typeof input.findNodeHandle !== "function"
  ) {
    return { available: false, reason: "command-apis" };
  }
  return { available: true, reason: "ready" };
}

/** Classify a mount failure without echoing a raw host URL or data. */
export function nativeMountErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? "");
  if (
    /view config not found.*RNCWebView/i.test(text) ||
    /view config getter callback for component [`'"]?RNCWebView[`'"]?.*must be a function/i.test(text) ||
    /RNCWebView.*(?:was not found|is not registered)|(?:was not found|is not registered).*RNCWebView/i.test(text)
  ) {
    return "Native HTML view is not registered on this client";
  }
  return "The native HTML host could not be mounted on this client";
}

/** Safe, reason-specific production notice for an Android static fallback. */
export function nativeFallbackMessage(reason: NativeHtmlCapability["reason"]): string {
  switch (reason) {
    case "host-native-view":
      return "Interactive HTML is unavailable: this client has no registered native WebView manager. Showing a static fallback.";
    case "command-apis":
      return "Interactive HTML is unavailable: this client cannot dispatch native WebView commands. Showing a static fallback.";
    case "error-boundary":
      return "Interactive HTML is unavailable: this client cannot mount the native error boundary. Showing a static fallback.";
    case "platform":
      return "Interactive HTML is unavailable on this platform. Showing a static fallback.";
    default:
      return "Interactive HTML is unavailable on this client. Showing a static fallback.";
  }
}

/** Stable per-document key. Theme/layout are deliberately absent. */
function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function nativeDocumentKey(artifactKey: string, title: string, html: string): string {
  return `${artifactKey}:${title.length}:${hashText(title)}:${html.length}:${hashText(html)}`;
}

export const NATIVE_SHELL_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "media-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'self' about:",
  "object-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
].join("; ");

export interface NativeTransportChunk {
  readonly messageId: number;
  readonly sequence: number;
  readonly total: number;
  readonly data: string;
}

export interface NativeTransportParse {
  readonly ok: boolean;
  readonly chunk?: NativeTransportChunk;
  readonly error?: string;
  /** A chunk from a previous document/session; ignore it without poisoning current state. */
  readonly stale?: boolean;
}

function canonicalInteger(raw: string): number | null {
  if (!/^(0|[1-9][0-9]{0,8})$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

/** Fragment fields are canonical strings; bridge fields are JSON numbers. */
function integerField(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  return typeof value === "string" ? canonicalInteger(value) : null;
}

function hashOf(url: string | undefined): string | undefined {
  if (typeof url !== "string" || url.length > NATIVE_MAX_URL_CHARS) return undefined;
  const at = url.indexOf("#");
  return at < 0 ? undefined : url.slice(at);
}

/** Parse one page->native chunk URL. Unknown hashes return undefined. */
export function parseNativeTransportUrl(url: string | undefined, session: string): NativeTransportParse | undefined {
  if (typeof url !== "string") return undefined;
  if (url.length > NATIVE_MAX_URL_CHARS) {
    // A large unrelated URL must not poison the control channel. On Android the
    // initial loading event for an html source carries the whole original data:
    // source, which is unrelated to the transport. Only a URL that claims the
    // transport envelope is a real oversized message.
    return url.includes(NATIVE_P2N_PREFIX) ? { ok: false, error: "transport URL is too long" } : undefined;
  }
  const at = url.indexOf(NATIVE_P2N_PREFIX);
  if (at < 0) return undefined;
  const payload = url.slice(at + NATIVE_P2N_PREFIX.length);
  if (payload.length > NATIVE_MAX_CHUNK_CHARS + NATIVE_MAX_SESSION_CHARS + 32) {
    return { ok: false, error: "transport payload is too long" };
  }
  const fields = payload.split(",");
  if (fields.length !== 5) return { ok: false, error: "transport chunk must have five fields" };
  const [rawSession, rawMessage, rawSeq, rawTotal, rawData] = fields as [string, string, string, string, string];
  // A bounded retry may resend the same message id with a distinct fragment.
  // The suffix only makes the URL change; it is not message data.
  const data = rawData.replace(/;r=[1-9][0-9]{0,3}$/, "");
  return readChunkFields({ session: rawSession, messageId: rawMessage, sequence: rawSeq, total: rawTotal, data }, session);
}

/**
 * Strict shared validation for one page->native chunk from either channel.
 * Neither channel may widen the bounds or the accepted character set.
 */
function readChunkFields(input: {
  readonly session: unknown;
  readonly messageId: unknown;
  readonly sequence: unknown;
  readonly total: unknown;
  readonly data: unknown;
}, session: string): NativeTransportParse {
  if (input.session !== session) return { ok: false, error: "transport session does not match", stale: true };
  if (typeof input.data !== "string") return { ok: false, error: "transport chunk data is missing" };
  const messageId = integerField(input.messageId);
  const sequence = integerField(input.sequence);
  const total = integerField(input.total);
  if (messageId === null || sequence === null || total === null) return { ok: false, error: "transport sequence is malformed" };
  if (messageId < 1) return { ok: false, error: "transport message id is out of range" };
  if (total < 1 || total > NATIVE_MAX_CHUNKS) return { ok: false, error: "transport chunk count is out of range" };
  if (sequence < 0 || sequence >= total) return { ok: false, error: "transport sequence is out of range" };
  const data = input.data;
  if (data.length > NATIVE_MAX_CHUNK_CHARS) return { ok: false, error: "transport chunk data is too long" };
  if (!/^[A-Za-z0-9%._!~*'()-]*$/.test(data)) return { ok: false, error: "transport chunk contains unsupported characters" };
  return { ok: true, chunk: { messageId, sequence, total, data } };
}

/**
 * Parse one document-title chunk (`paseo-p2n-title:<session>,<mid>,<seq>,<total>,<data>`).
 *
 * The title is read from the same loading event as the URL, but it is a
 * separate carrier: Android rewrites the commit URL for `loadDataWithBaseURL`
 * documents, while the title is whatever the document last set. Unrelated
 * titles (`Interactive HTML`, host chrome, another document) return undefined
 * so they never fail the control channel; a title that claims the prefix and
 * breaks the shared bounds is rejected exactly like a malformed fragment.
 */
export function parseNativeTitle(title: unknown, session: string): NativeTransportParse | undefined {
  if (typeof title !== "string" || title.length === 0) return undefined;
  if (title.length > NATIVE_MAX_TITLE_CHARS) {
    return title.startsWith(NATIVE_TITLE_PREFIX) ? { ok: false, error: "title message is too long" } : undefined;
  }
  if (!title.startsWith(NATIVE_TITLE_PREFIX)) return undefined;
  const payload = title.slice(NATIVE_TITLE_PREFIX.length);
  const fields = payload.split(",");
  if (fields.length !== 5) return { ok: false, error: "title chunk must have five fields" };
  const [rawSession, rawMessage, rawSeq, rawTotal, rawData] = fields as [string, string, string, string, string];
  // The retry suffix keeps a resent title distinct without being message data.
  const data = rawData.replace(/;r=[1-9][0-9]{0,3}$/, "");
  return readChunkFields({ session: rawSession, messageId: rawMessage, sequence: rawSeq, total: rawTotal, data }, session);
}

/** Parse a bounded failure marker carried by the document title. */
export function parseNativeErrorTitle(title: unknown): string | undefined {
  if (typeof title !== "string" || title.length > NATIVE_MAX_TITLE_CHARS) return undefined;
  if (!title.startsWith(NATIVE_TITLE_ERROR_PREFIX)) return undefined;
  const code = title.slice(NATIVE_TITLE_ERROR_PREFIX.length);
  return /^[a-z0-9-]{1,40}$/.test(code) ? code : "invalid";
}

/** Envelope type of one RNCWebView `onMessage` page->native chunk. */
export const NATIVE_BRIDGE_TYPE = "paseo-p2n";
/**
 * Exact opening of the shell's bridge envelope. `JSON.stringify` keeps the
 * literal's key order, so this cheaply separates an oversized message that
 * claims to be ours from unrelated or hostile bridge traffic.
 */
const NATIVE_BRIDGE_PREFIX = `{"type":"${NATIVE_BRIDGE_TYPE}",`;
/** One bridge payload cannot exceed one chunk envelope plus fixed headroom. */
export const NATIVE_MAX_BRIDGE_CHARS = NATIVE_MAX_CHUNK_CHARS + 1_024;

/**
 * Parse one RNCWebView `onMessage` payload (`nativeEvent.data`).
 *
 * Returns `undefined` for anything that is not our envelope, so foreign bridge
 * traffic is ignored instead of failing the control channel. Chunks that claim
 * the envelope but violate the shared bounds are rejected exactly like a
 * malformed fragment.
 */
export function parseNativeBridgeMessage(raw: unknown, session: string): NativeTransportParse | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  if (raw.length > NATIVE_MAX_BRIDGE_CHARS) {
    return raw.startsWith(NATIVE_BRIDGE_PREFIX) ? { ok: false, error: "bridge message is too long" } : undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  if (!isObject(value) || value.type !== NATIVE_BRIDGE_TYPE) return undefined;
  return readChunkFields({
    session: value.session,
    messageId: value.mid,
    sequence: value.seq,
    total: value.total,
    data: value.data,
  }, session);
}

/** Safe transport counters. Numbers only: never URLs, payloads or theme data. */
export interface NativeTransportCounters {
  /** Bridge envelopes accepted by the shared chunk validator. */
  readonly pageMessages: number;
  /** Fragment callback URLs accepted by the same validator. */
  readonly fragments: number;
  /** Document-title chunks accepted by the same validator. */
  readonly titles: number;
  /** Raw loading/progress events, even when they carry no transport data. */
  readonly navigationEvents: number;
  /** Raw event URLs that contain any hash (never the URL or hash itself). */
  readonly navigationHashEvents: number;
  /** Most recent event title length, capped at the title budget plus one. */
  readonly lastTitleChars: number;
  /** Chunks accepted by the assembler, including acknowledged duplicates. */
  readonly chunks: number;
  /** Complete messages decoded into a protocol value. */
  readonly messages: number;
  /** Ready probes dispatched to the page. */
  readonly probes: number;
  /** Accepted chunks since the most recent probe. */
  readonly messagesSinceProbe: number;
  /** Rejected chunks, envelopes and complete messages. */
  readonly rejected: number;
}

export const NATIVE_TRANSPORT_COUNTERS: NativeTransportCounters = Object.freeze({
  pageMessages: 0,
  fragments: 0,
  titles: 0,
  navigationEvents: 0,
  navigationHashEvents: 0,
  lastTitleChars: 0,
  chunks: 0,
  messages: 0,
  probes: 0,
  messagesSinceProbe: 0,
  rejected: 0,
});

/** Which hop of the page->native control channel produced no ready message. */
export type NativeTransportStage =
  | "no-page-messages"
  | "title-only"
  | "chunks-without-ready"
  | "probe-unanswered"
  | "no-ready-handshake";

/**
 * Name the failed stage from accepted-traffic counters.
 *
 * Order matters and follows the diagnostic questions from the device bug:
 * nothing arrived at all (every carrier dead) before data arrived without a
 * ready, before title-only traffic (the bridge and fragment URLs are dead but
 * the document title is alive), before a probe that produced nothing, before
 * partial/incomplete data.
 */
export function nativeTransportStage(counters: NativeTransportCounters): NativeTransportStage {
  const urlCarriers = counters.pageMessages + counters.fragments;
  if (urlCarriers + counters.titles === 0) return "no-page-messages";
  if (counters.messages > 0) return "chunks-without-ready";
  if (urlCarriers === 0) return "title-only";
  if (counters.probes > 0 && counters.messagesSinceProbe === 0) return "probe-unanswered";
  return "no-ready-handshake";
}

export function nativeTransportStageLabel(stage: NativeTransportStage): string {
  switch (stage) {
    case "no-page-messages":
      return "no page messages";
    case "title-only":
      return "titles without bridge or fragment";
    case "chunks-without-ready":
      return "chunks without ready";
    case "probe-unanswered":
      return "probe unanswered";
    default:
      return "no ready handshake";
  }
}

/**
 * Failure text for an expired ready deadline. It keeps the historical first
 * sentence and adds the stage plus safe counters, so a device report can name
 * the hop without shipping payloads or URLs off the device.
 */
export function nativeReadyTimeoutMessage(counters: NativeTransportCounters): string {
  const stage = nativeTransportStage(counters);
  return [
    "The native HTML frame did not complete its ready handshake in time.",
    `Stage: ${nativeTransportStageLabel(stage)}. Build: ${NATIVE_DIAGNOSTIC_REVISION}.`,
    "Counters:",
    `onMessage ${counters.pageMessages},`,
    `fragment ${counters.fragments},`,
    `chunks ${counters.chunks},`,
    `messages ${counters.messages},`,
    `probes ${counters.probes},`,
    `rejected ${counters.rejected},`,
    `titles ${counters.titles}.`,
    `Native events ${counters.navigationEvents}, URL hash events ${counters.navigationHashEvents}, last title chars ${counters.lastTitleChars}.`,
  ].join(" ");
}

/** Parse the shell's ordered theme acknowledgement carried through the transport. */
export function readNativeThemeAck(value: unknown, session: string): number | null {
  if (!isObject(value) || value.type !== NATIVE_THEME_ACK_TYPE || value.session !== session) return null;
  const themeSeq = value.themeSeq;
  return typeof themeSeq === "number" && Number.isSafeInteger(themeSeq) && themeSeq > 0 ? themeSeq : null;
}

/** Parse a bounded failure marker written by the shell. */
export function parseNativeErrorUrl(url: string | undefined): string | undefined {
  const hash = hashOf(url);
  if (!hash?.startsWith(NATIVE_ERROR_PREFIX)) return undefined;
  const code = hash.slice(NATIVE_ERROR_PREFIX.length);
  return /^[a-z0-9-]{1,40}$/.test(code) ? code : "invalid";
}

/** Reassemble strict, ordered page->native chunks with bounded memory. */
export interface NativeChunkAssembler {
  reset(): void;
  push(input: NativeTransportChunk): { ok: true; duplicate?: boolean } | { ok: false; error: string };
  readonly complete: boolean;
  takeEncoded(): string | null;
  readonly sessionId: string;
  readonly lastCompleted: number;
}

type NativeChunkAssemblerConstructor = new (session: string) => NativeChunkAssembler;

/**
 * Function constructor intentionally, not a class expression. The host evals
 * this bundle in Hermes, where large-eval class-expression initializers are
 * lost; the assembler must be constructible after factory evaluation.
 */
function createNativeChunkAssembler(this: NativeChunkAssembler, session: string): void {
  let messageId = 0;
  let total = 0;
  let parts: string[] = [];
  let encodedChars = 0;
  let lastCompletedMessageId = 0;
  const assembler = this;

  assembler.reset = () => {
    messageId = 0;
    total = 0;
    parts = [];
    encodedChars = 0;
    lastCompletedMessageId = 0;
  };

  assembler.push = (input) => {
    if (input.messageId <= lastCompletedMessageId) {
      // A replay or a duplicate final callback from an already-delivered message.
      return { ok: true, duplicate: true };
    }
    if (messageId !== 0 && input.messageId < messageId) {
      return { ok: true, duplicate: true };
    }
    if (messageId === 0) {
      if (input.messageId !== lastCompletedMessageId + 1) {
        return { ok: false, error: "message id skipped ahead" };
      }
      if (input.total < 1 || input.total > NATIVE_MAX_CHUNKS) return { ok: false, error: "chunk count is out of range" };
      if (input.sequence !== 0) return { ok: false, error: "first chunk is out of order" };
      messageId = input.messageId;
      total = input.total;
    } else {
      if (input.messageId !== messageId) return { ok: false, error: "message id changed mid-message" };
      if (total !== input.total) return { ok: false, error: "chunk count changed mid-message" };
      if (input.sequence < parts.length) return { ok: true, duplicate: true };
      if (input.sequence !== parts.length) return { ok: false, error: "chunk is out of order" };
    }
    encodedChars += input.data.length;
    if (encodedChars > NATIVE_MAX_ENCODED_CHARS) {
      assembler.reset();
      return { ok: false, error: "encoded message exceeds the budget" };
    }
    parts.push(input.data);
    return { ok: true };
  };

  /** Returns and clears the encoded payload once all chunks arrived. */
  assembler.takeEncoded = () => {
    if (!(messageId > 0 && total > 0 && parts.length === total)) return null;
    const encoded = parts.join("");
    lastCompletedMessageId = messageId;
    messageId = 0;
    total = 0;
    parts = [];
    encodedChars = 0;
    return encoded;
  };

  Object.defineProperties(assembler, {
    complete: { enumerable: false, get: () => messageId > 0 && total > 0 && parts.length === total },
    sessionId: { enumerable: false, get: () => session },
    lastCompleted: { enumerable: false, get: () => lastCompletedMessageId },
  });
}

export const NativeChunkAssembler = createNativeChunkAssembler as unknown as NativeChunkAssemblerConstructor;

/** Decode a complete transport payload into a validated JSON value. */
export function decodeNativeTransportMessage(encoded: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (encoded.length > NATIVE_MAX_ENCODED_CHARS) return { ok: false, error: "encoded message exceeds the budget" };
  try {
    const json = decodeURIComponent(encoded);
    return { ok: true, value: JSON.parse(json) as unknown };
  } catch {
    return { ok: false, error: "transport message is not valid encoded JSON" };
  }
}

function inertJson(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const SHELL_SCRIPT = `(function(){
var f=document.getElementById("f"),p=document.getElementById("p");
var INNER=JSON.parse(p.textContent);
var SESSION=__SESSION__,CHUNK=__CHUNK__,MAXCHUNKS=__MAXCHUNKS__,MAXENC=__MAXENC__,MAXQUEUE=__MAXQUEUE__,ACKMS=__ACKMS__,TRANSFERMS=__TRANSFERMS__,TITLEMAX=__TITLEMAX__;
var queue=[],queueChars=0,sending=null,ackTimer=0,themeSeq=0,nextMessageId=1,failed=false;
var readyMessage=null,readyAcked=false,readyProbeAttempts=0,readyRetryTimer=0,readyRetryCount=0;
var bridge=null;
try{var rn=window.ReactNativeWebView;if(rn&&typeof rn.postMessage==="function")bridge=rn;}catch(_){bridge=null;}
// Local-only evidence: this strip needs no working page->native channel. Never
// put a URL, session, report text, error message or message payload in it.
var diagnostic=document.getElementById("transport-diagnostic");
var stats={loads:0,events:0,inner:0,ready:0,native:0,probes:0,bridge:0,bridgeErrors:0,fragments:0,navigationErrors:0,errors:0,titles:0,titleErrors:0,titleChars:0};
function bump(k){stats[k]=Math.min(99999,stats[k]+1);}
function paint(){
  if(!diagnostic||diagnostic.hidden)return;
  var scheme=location.protocol;
  if(!/^(about:|data:|file:|https?:|blob:)$/.test(scheme))scheme="other";
  diagnostic.textContent="Transport ${NATIVE_DIAGNOSTIC_REVISION} | page "+scheme+" "+location.href.length+" chars, hash "+location.hash.length+
    " | iframe loads "+stats.loads+", events "+stats.events+", inner "+stats.inner+", ready "+stats.ready+
    " | native "+stats.native+", probes received "+stats.probes+
    " | bridge "+stats.bridge+", bridge errors "+stats.bridgeErrors+", fragments sent "+stats.fragments+
    ", navigation errors "+stats.navigationErrors+", script errors "+stats.errors+
    " | title "+stats.titles+" sent, title errors "+stats.titleErrors+", title "+stats.titleChars+" chars";
}
var diagnosticTimer=setTimeout(function(){if(!readyAcked&&diagnostic){diagnostic.hidden=false;paint();}},__DIAGMS__);
f.addEventListener("load",function(){bump("loads");paint();});
window.addEventListener("error",function(){bump("errors");paint();});
function fail(code){if(failed)return;failed=true;if(ackTimer){clearTimeout(ackTimer);ackTimer=0;}if(readyRetryTimer){clearTimeout(readyRetryTimer);readyRetryTimer=0;}queue=[];queueChars=0;sending=null;var marker="${NATIVE_TITLE_ERROR_PREFIX}"+code;if(marker.length<=TITLEMAX){try{document.title=marker;}catch(_){}}location.replace("${NATIVE_ERROR_PREFIX}"+code);}
function attemptSuffix(next){return next>1?";r="+(next-1):"";}
function titleValue(){
  if(!sending)return null;
  var data=sending.encoded.slice(sending.sequence*CHUNK,sending.sequence*CHUNK+CHUNK);
  // The retry suffix matches the fragment attempt about to be made so both
  // carriers describe the same attempt; it is not message data.
  return "${NATIVE_TITLE_PREFIX}"+SESSION+","+sending.id+","+sending.sequence+","+sending.total+","+data+attemptSuffix(sending.channels.fragment+1);
}
function deliverTitle(){
  var value=titleValue();
  if(value===null)return false;
  // Hard bound before assignment: Chromium kills the renderer above its own
  // title cap, so an over-budget value is dropped and counted, never set.
  if(value.length>TITLEMAX){bump("titleErrors");paint();return false;}
  bump("titles");stats.titleChars=value.length;
  try{document.title=value;}catch(_){bump("titleErrors");paint();return false;}
  paint();
  return true;
}
function arm(){if(ackTimer)clearTimeout(ackTimer);ackTimer=setTimeout(function(){
  ackTimer=0;
  if(failed||!sending)return;
  // One bounded resend on every channel per chunk, then fail.
  if(sending.resentSeq!==sending.sequence){sending.resentSeq=sending.sequence;deliver("bridge");deliverTitle();deliver("fragment");arm();return;}
  fail("ack-timeout");
},ACKMS);}
function clearReadyRetry(){if(readyRetryTimer){clearTimeout(readyRetryTimer);readyRetryTimer=0;}}
function deliver(kind){
  if(!sending)return false;
  var data=sending.encoded.slice(sending.sequence*CHUNK,sending.sequence*CHUNK+CHUNK);
  if(kind==="bridge"){
    if(!bridge)return false;
    bump("bridge");
    try{bridge.postMessage(JSON.stringify({type:"${NATIVE_BRIDGE_TYPE}",session:SESSION,mid:sending.id,seq:sending.sequence,total:sending.total,data:data}));}
    catch(_){bump("bridgeErrors");bridge=null;paint();return false;}
    paint();
    sending.channels.bridge+=1;
    return true;
  }
  sending.channels.fragment+=1;
  // A repeated fragment for the same chunk needs a distinct URL to be delivered.
  var retry=sending.channels.fragment>1?";r="+(sending.channels.fragment-1):"";
  bump("fragments");
  try{location.replace("${NATIVE_P2N_PREFIX}"+SESSION+","+sending.id+","+sending.sequence+","+sending.total+","+data+retry);}
  catch(_){bump("navigationErrors");paint();return false;}
  // A blocked navigation can return without throwing. Observe hash length on
  // the next turn instead of mistaking an attempted send for a committed one.
  setTimeout(paint,0);
  return true;
}
function sendChunk(){
  if(!sending)return;
  if(Date.now()-sending.started>TRANSFERMS)return fail("transfer-timeout");
  // Never trust the bridge alone. On Android, RNCWebView hands bridge messages to
  // its own JS router, keyed by a messagingModuleName that only its <WebView>
  // wrapper knows, so a raw mount never sees them. Every chunk also goes out as
  // a fragment URL and as the document title; the native assembler applies a
  // duplicate once. The title is set immediately before the navigation because
  // WebView rewrites the commit URL of a loadDataWithBaseURL document but reads
  // the title from the document itself.
  deliver("bridge");
  deliverTitle();
  deliver("fragment");
  // Retries keep the original per-chunk deadline, rather than extending it.
  if(!ackTimer)arm();
}
function scheduleReadyRetry(){
  if(failed||readyAcked||readyRetryCount>=2||readyRetryTimer)return;
  readyRetryCount+=1;
  readyRetryTimer=setTimeout(function(){
    readyRetryTimer=0;
    if(failed||readyAcked)return;
    if(sending&&sending.ready){sendChunk();}
    else if(!readyMessage&&readyProbeAttempts<3){
      readyProbeAttempts+=1;
      try{f.contentWindow.postMessage({type:"paseo-ready-probe"},"*");}catch(_){return fail("ready-probe");}
    }
    scheduleReadyRetry();
  },1200);
}
function requestReady(){
  if(failed||readyAcked)return;
  if(sending&&sending.ready){
    sendChunk();
    return;
  }
  if(readyMessage)return;
  if(readyProbeAttempts>=3)return;
  readyProbeAttempts+=1;
  try{f.contentWindow.postMessage({type:"paseo-ready-probe"},"*");}catch(_){return fail("ready-probe");}
  if(!readyRetryTimer)readyRetryTimer=setTimeout(function(){
    readyRetryTimer=0;
    if(!readyMessage&&!readyAcked)requestReady();
  },250);
}
function enqueue(data,kind){
  var size=0;
  try{size=JSON.stringify(data).length;}catch(_){return fail("encode");}
  if(kind==="height"){
    for(var i=0;i<queue.length;i+=1){
      if(queue[i].kind!=="height")continue;
      queueChars-=queue[i].size;
      queue[i]={data:data,size:size,kind:kind};
      queueChars+=size;
      return;
    }
  }
  if(queue.length>=MAXQUEUE||queueChars+size>MAXENC)return fail("queue-full");
  queue.push({data:data,size:size,kind:kind});
  queueChars+=size;
  sendNext();
}
function sendNext(){
  if(failed||sending||queue.length===0)return;
  var item=queue.shift(),encoded;
  if(!item)return;
  queueChars-=item.size;
  try{encoded=encodeURIComponent(JSON.stringify(item.data));}catch(_){return fail("encode");}
  if(encoded.length>MAXENC)return fail("too-large");
  var total=Math.ceil(encoded.length/CHUNK);
  if(total<1||total>MAXCHUNKS)return fail("too-many-chunks");
  if(nextMessageId>1000000000)return fail("message-exhausted");
  sending={id:nextMessageId++,encoded:encoded,total:total,sequence:0,started:Date.now(),channels:{bridge:0,fragment:0}};
  if(item.data&&item.data.method==="ui/notifications/ready"){
    readyMessage=item.data;
    sending.ready=true;
    readyAcked=false;
    readyRetryCount=0;
    // An early inner probe may still have its own timer pending. Do not let
    // that timer prevent scheduling retries for the now-real ready payload.
    clearReadyRetry();
    scheduleReadyRetry();
  }
  sendChunk();
}
document.addEventListener("message",function(e){
  if(failed||typeof e.data!=="string")return;
  var m;try{m=JSON.parse(e.data);}catch(_){return;}
  if(m&&m.session===SESSION){bump("native");paint();}
  if(m&&m.type==="paseo-ready-probe"&&m.session===SESSION){bump("probes");paint();requestReady();return;}
  if(m&&m.type==="paseo-ack"&&m.session===SESSION&&Number.isInteger(m.mid)&&m.mid===sending?.id&&Number.isInteger(m.seq)&&m.seq===sending.sequence){
    if(ackTimer){clearTimeout(ackTimer);ackTimer=0;}
    sending.sequence++;
    if(sending.sequence<sending.total)sendChunk();else{
      if(sending.ready){readyAcked=true;clearReadyRetry();clearTimeout(diagnosticTimer);if(diagnostic)diagnostic.hidden=true;}
      sending=null;sendNext();
    }
    return;
  }
  if(m&&m.type==="paseo-theme"&&m.session===SESSION&&Number.isInteger(m.seq)&&m.seq>themeSeq&&m.message&&typeof m.message==="object"){
    themeSeq=m.seq;
    try{f.contentWindow.postMessage(m.message,"*");}catch(_){return fail("theme-post");}
    enqueue({type:"${NATIVE_THEME_ACK_TYPE}",session:SESSION,themeSeq:m.seq},"control");
  }
},false);
window.addEventListener("message",function(e){
  bump("events");paint();
  if(failed||!f.contentWindow||e.source!==f.contentWindow)return;
  bump("inner");paint();
  var d=e.data;
  if(!d||d.jsonrpc!=="2.0"||typeof d.method!=="string")return;
  var method=d.method;
  if(method!=="ui/notifications/ready"&&method!=="ui/notifications/size-changed"&&method!=="ui/open-link"&&method!=="ui/open-image")return;
  if(method==="ui/notifications/ready"){
    // One ready transfer per session. Probe responses must not queue new
    // message ids behind an unacknowledged ready or restart its deadlines.
    bump("ready");paint();
    if(readyMessage)return;
    readyMessage=d;
  }
  if(method==="ui/open-link"||method==="ui/open-image"){
    var active=navigator.userActivation&&navigator.userActivation.isActive===true;
    if(document.activeElement!==f||!active)return;
  }
  enqueue(d,method==="ui/notifications/size-changed"?"height":"other");
},false);
f.srcdoc=INNER;
})();`;


/** Build the constant trusted shell around an inert inner document string. */
export function buildNativeShellDocument(innerDocument: string, session: string): string {
  if (!NATIVE_SESSION_PATTERN.test(session)) throw new Error("native session id is invalid");
  if (typeof innerDocument !== "string" || innerDocument.length === 0) throw new Error("native inner document is empty");
  if (utf8ByteLength(innerDocument) > MAX_INTERACTIVE_HTML_BYTES) {
    throw new Error("native inner document exceeds the interactive HTML limit");
  }
  const script = SHELL_SCRIPT
    .replace("__SESSION__", JSON.stringify(session))
    .replace("__CHUNK__", String(NATIVE_MAX_CHUNK_CHARS))
    .replace("__MAXCHUNKS__", String(NATIVE_MAX_CHUNKS))
    .replace("__MAXENC__", String(NATIVE_MAX_ENCODED_CHARS))
    .replace("__MAXQUEUE__", String(NATIVE_MAX_QUEUE))
    .replace("__ACKMS__", String(NATIVE_ACK_TIMEOUT_MS))
    .replace("__TRANSFERMS__", String(NATIVE_TRANSFER_TIMEOUT_MS))
    .replace("__TITLEMAX__", String(NATIVE_MAX_TITLE_CHARS))
    .replace("__DIAGMS__", String(NATIVE_READY_TIMEOUT_MS));
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${NATIVE_SHELL_CSP}"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Interactive HTML</title><style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:transparent}iframe{display:block;width:100%;height:100%;border:0;background:transparent}</style></head><body><div id="transport-diagnostic" role="status" hidden style="position:fixed;top:0;left:0;right:0;z-index:1;padding:8px;background:#241d0f;color:#ffe0a3;font:12px/1.5 monospace;overflow-wrap:anywhere;pointer-events:none"></div><iframe id="f" sandbox="allow-scripts" referrerpolicy="no-referrer" allow="fullscreen 'none'" title="Interactive HTML"></iframe><script type="application/json" id="p">${inertJson(innerDocument)}</script><script>${script}</script></body></html>`;
}

