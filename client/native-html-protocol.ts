/**
 * Native Android transport and trusted outer-shell builder.
 *
 * The WebView loads only this constant shell. The report document is inert JSON
 * data in a non-executable script element until the shell assigns it to the
 * sandboxed inner iframe. No report markup is ever parsed as outer HTML.
 *
 * Page -> native messages use bounded, acknowledged URL-fragment chunks. The
 * native side revalidates every complete message with the existing shared
 * readers; the shell also source-filters and requires fresh focus/user
 * activation before forwarding link/image requests.
 *
 * This module has no React, React Native, Node or DOM imports.
 */
import { MAX_INTERACTIVE_HTML_BYTES } from "../shared/limits.ts";
import { utf8ByteLength } from "../shared/report-model.ts";

export const NATIVE_P2N_PREFIX = "#paseo-p2n=";
export const NATIVE_ERROR_PREFIX = "#paseo-error=";
export const NATIVE_THEME_ACK_TYPE = "paseo-theme-ack";
export const NATIVE_MAX_URL_CHARS = 65_536;
export const NATIVE_MAX_CHUNK_CHARS = 60_000;
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

/** Security props for the raw RNCWebView component. No cache/cookie clearing. */
export const NATIVE_WEBVIEW_SECURITY_PROPS = Object.freeze({
  javaScriptEnabled: true,
  messagingEnabled: false,
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

function hashOf(url: string | undefined): string | undefined {
  if (typeof url !== "string" || url.length > NATIVE_MAX_URL_CHARS) return undefined;
  const at = url.indexOf("#");
  return at < 0 ? undefined : url.slice(at);
}

/** Parse one page->native chunk URL. Unknown hashes return undefined. */
export function parseNativeTransportUrl(url: string | undefined, session: string): NativeTransportParse | undefined {
  if (typeof url !== "string" || url.length > NATIVE_MAX_URL_CHARS) {
    return { ok: false, error: "transport URL is too long" };
  }
  const at = url.indexOf(NATIVE_P2N_PREFIX);
  if (at < 0) return undefined;
  const payload = url.slice(at + NATIVE_P2N_PREFIX.length);
  if (payload.length > NATIVE_MAX_CHUNK_CHARS + NATIVE_MAX_SESSION_CHARS + 32) {
    return { ok: false, error: "transport payload is too long" };
  }
  const fields = payload.split(",");
  if (fields.length !== 5) return { ok: false, error: "transport chunk must have five fields" };
  const [rawSession, rawMessage, rawSeq, rawTotal, data] = fields as [string, string, string, string, string];
  if (rawSession !== session) return { ok: false, error: "transport session does not match", stale: true };
  const messageId = canonicalInteger(rawMessage);
  const sequence = canonicalInteger(rawSeq);
  const total = canonicalInteger(rawTotal);
  if (messageId === null || sequence === null || total === null) return { ok: false, error: "transport sequence is malformed" };
  if (messageId < 1) return { ok: false, error: "transport message id is out of range" };
  if (total < 1 || total > NATIVE_MAX_CHUNKS) return { ok: false, error: "transport chunk count is out of range" };
  if (sequence < 0 || sequence >= total) return { ok: false, error: "transport sequence is out of range" };
  if (data.length > NATIVE_MAX_CHUNK_CHARS) return { ok: false, error: "transport chunk data is too long" };
  if (!/^[A-Za-z0-9%._!~*'()-]*$/.test(data)) return { ok: false, error: "transport chunk contains unsupported characters" };
  return { ok: true, chunk: { messageId, sequence, total, data } };
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
var SESSION=__SESSION__,CHUNK=__CHUNK__,MAXCHUNKS=__MAXCHUNKS__,MAXENC=__MAXENC__,MAXQUEUE=__MAXQUEUE__,ACKMS=__ACKMS__,TRANSFERMS=__TRANSFERMS__;
var queue=[],queueChars=0,sending=null,ackTimer=0,themeSeq=0,nextMessageId=1,failed=false;
function fail(code){if(failed)return;failed=true;if(ackTimer){clearTimeout(ackTimer);ackTimer=0;}queue=[];queueChars=0;sending=null;location.replace("${NATIVE_ERROR_PREFIX}"+code);}
function arm(){if(ackTimer)clearTimeout(ackTimer);ackTimer=setTimeout(function(){fail("ack-timeout");},ACKMS);}
function sendChunk(){
  if(!sending)return;
  if(Date.now()-sending.started>TRANSFERMS)return fail("transfer-timeout");
  var start=sending.sequence*CHUNK;
  var data=sending.encoded.slice(start,start+CHUNK);
  location.replace("${NATIVE_P2N_PREFIX}"+SESSION+","+sending.id+","+sending.sequence+","+sending.total+","+data);
  arm();
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
  sending={id:nextMessageId++,encoded:encoded,total:total,sequence:0,started:Date.now()};
  sendChunk();
}
document.addEventListener("message",function(e){
  if(failed||typeof e.data!=="string")return;
  var m;try{m=JSON.parse(e.data);}catch(_){return;}
  if(m&&m.type==="paseo-ack"&&m.session===SESSION&&Number.isInteger(m.mid)&&m.mid===sending?.id&&Number.isInteger(m.seq)&&m.seq===sending.sequence){
    if(ackTimer){clearTimeout(ackTimer);ackTimer=0;}
    sending.sequence++;
    if(sending.sequence<sending.total)sendChunk();else{sending=null;sendNext();}
    return;
  }
  if(m&&m.type==="paseo-theme"&&m.session===SESSION&&Number.isInteger(m.seq)&&m.seq>themeSeq&&m.message&&typeof m.message==="object"){
    themeSeq=m.seq;
    try{f.contentWindow.postMessage(m.message,"*");}catch(_){return fail("theme-post");}
    enqueue({type:"${NATIVE_THEME_ACK_TYPE}",session:SESSION,themeSeq:m.seq},"control");
  }
},false);
window.addEventListener("message",function(e){
  if(failed||!f.contentWindow||e.source!==f.contentWindow)return;
  var d=e.data;
  if(!d||d.jsonrpc!=="2.0"||typeof d.method!=="string")return;
  var method=d.method;
  if(method!=="ui/notifications/ready"&&method!=="ui/notifications/size-changed"&&method!=="ui/open-link"&&method!=="ui/open-image")return;
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
    .replace("__TRANSFERMS__", String(NATIVE_TRANSFER_TIMEOUT_MS));
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${NATIVE_SHELL_CSP}"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Interactive HTML</title><style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:transparent}iframe{display:block;width:100%;height:100%;border:0;background:transparent}</style></head><body><iframe id="f" sandbox="allow-scripts" referrerpolicy="no-referrer" allow="fullscreen 'none'" title="Interactive HTML"></iframe><script type="application/json" id="p">${inertJson(innerDocument)}</script><script>${script}</script></body></html>`;
}

