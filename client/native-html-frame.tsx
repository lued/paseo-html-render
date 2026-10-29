/**
 * Native Android inline HTML frame.
 *
 * Public native-manager discovery permits a contained mount attempt; it does
 * not prove JavaScript view registration or successful event delivery. This
 * adapter does not import private modules or re-register RNCWebView. It mounts
 * the host component with a constant trusted shell; the report is
 * inert JSON until assigned to an opaque allow-scripts iframe.
 *
 * If the public host surface, command APIs, registration, shell handshake, or
 * transport fails, the component shows an explicit error/retry state. It never
 * falls back to rendering report HTML outside the sandbox.
 *
 * The shell sends every page -> native chunk three times: on the RNCWebView
 * `onMessage` bridge, as a fragment URL, which Android reports through
 * `doUpdateVisitedHistory` as a loading-start event, and as the document title
 * read from that same loading event. On Android the bridge never reaches this
 * raw mount (RNCWebView routes it to its own wrapper by `messagingModuleName`),
 * and a `loadDataWithBaseURL` commit URL is the renderer's stored `data:` URL,
 * so the fragment is dropped from the URL. The title is read from the document
 * itself and survives both rewrites. All three feed one ordered assembler, so a
 * chunk seen on more than one carrier is applied once.
 *
 * A control-channel failure
 * (ready deadline, ack rejection, theme ack) no longer tears the frame down: a
 * report that already renders stays mounted behind a non-destructive banner and
 * Retry remounts explicitly.
 */
import {
  Component,
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import * as PublicClientUi from "@getpaseo/plugin/client/ui";
import {
  UIManager,
  View,
  Text,
  Pressable,
  StyleSheet,
  findNodeHandle,
} from "react-native";
import {
  HTML_FRAME_MIN_HEIGHT,
  appearanceFromColors,
  buildDocumentTheme,
  buildLiveDocument,
  frameHeightFor,
  hostContextChangedMessage,
  readOpenImageRequest,
  readOpenLinkRequest,
  readReadyMessage,
  readSizeChangedMessage,
  type HtmlDocumentColors,
  type HtmlFramePlatform,
  type HtmlFrameRenderMode,
  type HtmlDocumentTheme,
  type MeasuredFrameHeight,
  type ThemeAppearance,
} from "../shared/html-document.ts";
import {
  NATIVE_THEME_ACK_TIMEOUT_MS,
  NATIVE_READY_TIMEOUT_MS,
  NATIVE_MAX_TITLE_CHARS,
  NATIVE_TRANSPORT_COUNTERS,
  NATIVE_WEBVIEW_SECURITY_PROPS,
  NativeChunkAssembler,
  buildNativeShellDocument,
  decodeNativeTransportMessage,
  nativeReadyTimeoutMessage,
  parseNativeBridgeMessage,
  parseNativeErrorTitle,
  parseNativeErrorUrl,
  parseNativeTitle,
  parseNativeTransportUrl,
  nativeMountErrorMessage,
  probeRegisteredViewManager,
  selectNativeHtmlCapability,
  nativeDocumentKey,
  readNativeThemeAck,
  type NativeHtmlCapability,
  type NativeTransportChunk,
  type NativeTransportCounters,
} from "./native-html-protocol.ts";

const RNCWebView = "RNCWebView" as unknown as ComponentType<Record<string, unknown>>;

export type { NativeHtmlCapability } from "./native-html-protocol.ts";

/**
 * Capability is a runtime check of public host surfaces, not a server version
 * or a TypeScript declaration. DocumentFrame is optional (absent on 0.12).
 * Prefer the nonmutating public native-manager query; neither it nor a public
 * component export proves JS view registration or a successful mount. Actual
 * mount/handshake errors remain contained. Never register a second view.
 */
export function nativeHtmlCapability(platform: HtmlFramePlatform): NativeHtmlCapability {
  if (platform !== "android") return { available: false, reason: "platform" };
  let documentFrame: unknown;
  try {
    documentFrame = (PublicClientUi as unknown as { DocumentFrame?: unknown }).DocumentFrame;
  } catch {
    documentFrame = undefined;
  }
  const commandUi = UIManager as unknown as { dispatchViewManagerCommand?: unknown };
  return selectNativeHtmlCapability({
    platform,
    documentFrame,
    component: Component,
    dispatchViewManagerCommand: commandUi?.dispatchViewManagerCommand,
    findNodeHandle,
    registeredViewManager: probeRegisteredViewManager(commandUi),
  });
}

function newSession(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = (globalThis as unknown as { crypto?: { getRandomValues?: (value: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function plainError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface NativeMessageRefs {
  onOpenLink?: (url: string, modifiers: { metaKey: boolean; ctrlKey: boolean }) => void;
  onOpenImage?: (image: { src: string; name: string }) => void;
}

interface NavigationEvent {
  nativeEvent?: {
    url?: string;
    /** Bounded document title carried by the same loading event. */
    title?: string;
    description?: string;
    didCrash?: boolean;
  };
}

/**
 * The RNCWebView `onMessage` event shape on hosts that dispatch it to this
 * component. Android's wrapper-routed messages do not reach a raw mount.
 * Nothing in the envelope or optional URL is trusted.
 */
interface NativeMessageEvent {
  nativeEvent?: {
    data?: unknown;
    url?: unknown;
  };
}

/** Writable copy of the safe transport counters kept for one mounted frame. */
type MutableTransportCounters = { -readonly [K in keyof NativeTransportCounters]: number };

/**
 * A non-destructive control-channel failure. `ready-timeout` is cleared by a
 * late genuine ready; the others need an explicit Retry remount.
 */
interface NativeControlNotice {
  readonly kind: "ready-timeout" | "control" | "theme";
  readonly message: string;
}

interface NativeBoundaryProps {
  children?: ReactNode;
  onError: (message: string) => void;
}

interface NativeBoundaryState {
  error: string | null;
}

interface NativeBoundaryInstance {
  props: NativeBoundaryProps;
  state: NativeBoundaryState;
  render(): ReactNode;
  componentDidCatch(): void;
}

type NativeBoundaryConstructor = {
  new (props: NativeBoundaryProps): NativeBoundaryInstance;
  getDerivedStateFromError(error: unknown): NativeBoundaryState;
};

let cachedNativeBoundary: ComponentType<NativeBoundaryProps> | null | undefined;

/**
 * Build a React error boundary without class syntax.
 *
 * Hermes 0.12 drops class-expression initializers from the large eval source
 * the host uses for plugin bundles. This legacy function-constructor component
 * uses only public React.Component behavior (prototype, componentDidCatch and
 * getDerivedStateFromError) and is created lazily only for the native mount.
 * If the host has no usable Component, capability stays unavailable rather than
 * failing plugin import for web or older hosts.
 */
function getNativeErrorBoundary(): ComponentType<NativeBoundaryProps> | null {
  if (cachedNativeBoundary !== undefined) return cachedNativeBoundary;
  const maybeBase: unknown = Component;
  if (typeof maybeBase !== "function") {
    cachedNativeBoundary = null;
    return null;
  }
  const Base = maybeBase as {
    call(thisArg: NativeBoundaryInstance, props: NativeBoundaryProps): void;
    prototype: object;
  };
  if (!Base.prototype) {
    cachedNativeBoundary = null;
    return null;
  }
  const Boundary = function (this: NativeBoundaryInstance, props: NativeBoundaryProps): void {
    Base.call(this, props);
    this.state = { error: null };
  } as unknown as NativeBoundaryConstructor;
  Boundary.prototype = Object.create(Base.prototype) as NativeBoundaryInstance;
  Object.defineProperty(Boundary.prototype, "constructor", {
    value: Boundary,
    writable: true,
    configurable: true,
  });
  Boundary.prototype.render = function (this: NativeBoundaryInstance): ReactNode {
    if (this.state.error) return null;
    return this.props.children;
  } as unknown as NativeBoundaryInstance["render"];
  Boundary.prototype.componentDidCatch = function (this: NativeBoundaryInstance): void {
    this.props.onError(nativeMountErrorMessage(this.state.error));
  };
  Boundary.getDerivedStateFromError = (error: unknown): NativeBoundaryState => ({
    error: plainError(error),
  });
  cachedNativeBoundary = Boundary as unknown as ComponentType<NativeBoundaryProps>;
  return cachedNativeBoundary;
}

export interface NativeHtmlFrameProps {
  html: string;
  title: string;
  artifactKey: string;
  theme: { readonly colors: HtmlDocumentColors };
  appearance?: ThemeAppearance;
  requestedHeight: number;
  heights?: ReadonlyArray<MeasuredFrameHeight>;
  platform: HtmlFramePlatform;
  renderMode?: HtmlFrameRenderMode;
  onOpenLink?: (url: string, modifiers: { metaKey: boolean; ctrlKey: boolean }) => void;
  onOpenImage?: (image: { src: string; name: string }) => void;
}

export function NativeHtmlFrame(props: NativeHtmlFrameProps) {
  const [retry, setRetry] = useState(0);
  const documentKey = useMemo(
    () => nativeDocumentKey(props.artifactKey, props.title, props.html),
    [props.artifactKey, props.html, props.title],
  );
  return (
    <NativeHtmlFrameInstance
      key={`${documentKey}:${retry}`}
      {...props}
      onRetry={() => setRetry((value) => value + 1)}
    />
  );
}

function NativeHtmlFrameInstance({
  onRetry,
  ...props
}: NativeHtmlFrameProps & { onRetry: () => void }) {
  const webViewRef = useRef<unknown>(null);
  const latest = useRef<NativeMessageRefs>({});
  latest.current = { onOpenLink: props.onOpenLink, onOpenImage: props.onOpenImage };

  const appearance = props.appearance ?? appearanceFromColors(props.theme.colors);
  const liveTheme = useMemo(
    () => buildDocumentTheme(props.theme.colors, appearance),
    [props.theme.colors, appearance],
  );
  const initialThemeRef = useRef<{ key: string; theme: HtmlDocumentTheme } | null>(null);
  if (initialThemeRef.current === null || initialThemeRef.current.key !== props.artifactKey) {
    initialThemeRef.current = { key: props.artifactKey, theme: liveTheme };
  }
  const initialTheme = initialThemeRef.current.theme;
  const sessionRef = useRef({ artifactKey: props.artifactKey, html: props.html, value: newSession() });
  if (sessionRef.current.artifactKey !== props.artifactKey || sessionRef.current.html !== props.html) {
    sessionRef.current = { artifactKey: props.artifactKey, html: props.html, value: newSession() };
  }
  const session = sessionRef.current.value;

  const build = useMemo(() => {
    try {
      const innerDocument = buildLiveDocument({
        html: props.html,
        title: props.title,
        theme: initialTheme,
      });
      return {
        innerDocument,
        shellDocument: buildNativeShellDocument(innerDocument, session),
        error: null,
      };
    } catch (buildError) {
      return { innerDocument: "", shellDocument: "", error: plainError(buildError) };
    }
    // Only document identity may rebuild the frame; theme/layout changes are messages.
  }, [props.artifactKey, props.html, props.title, initialTheme, session]);
  const source = useMemo(
    () => ({ html: build.shellDocument, baseUrl: "about:blank" }),
    [build.shellDocument],
  );

  const [width, setWidth] = useState(728);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [notice, setNotice] = useState<NativeControlNotice | null>(null);
  const assemblerRef = useRef(new NativeChunkAssembler(session));
  const countersRef = useRef<MutableTransportCounters>({ ...NATIVE_TRANSPORT_COUNTERS });
  const pendingThemeRef = useRef<number | null>(null);
  const themeSeqRef = useRef(0);
  const lastThemeRef = useRef(`${initialTheme.appearance}:${JSON.stringify(initialTheme.variables)}`);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const themeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyProbeSentRef = useRef(false);
  const readyReceivedRef = useRef(false);

  /**
   * Hard failure: the frame cannot show a report at all (build, mount, load or
   * render-process death), so replacing it with the error box is not
   * destructive. Control-channel failures must use `failControl` instead.
   */
  const failFatal = useCallback((message: string) => {
    setFatal((current) => current ?? message);
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    if (themeTimerRef.current) clearTimeout(themeTimerRef.current);
    readyTimerRef.current = null;
    themeTimerRef.current = null;
  }, []);

  /**
   * Control-channel failure: the WebView keeps rendering whatever it already
   * has and a non-destructive banner offers an explicit Retry remount. The first
   * failure wins so a later cascade cannot overwrite the diagnostic.
   */
  const failControl = useCallback((kind: NativeControlNotice["kind"], message: string) => {
    setNotice((current) => current ?? { kind, message });
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    readyTimerRef.current = null;
  }, []);

  const dispatchCommand = useCallback((command: string, args: unknown[]) => {
    const tag = findNodeHandle(webViewRef.current as never);
    if (typeof tag !== "number") throw new Error("Native HTML frame is not mounted");
    const commandUi = UIManager as unknown as {
      dispatchViewManagerCommand: (tag: number, command: string, args: unknown[]) => void;
    };
    commandUi.dispatchViewManagerCommand(tag, command, args);
  }, []);

  const acknowledgeChunk = useCallback((sessionId: string, messageId: number, sequence: number) => {
    try {
      dispatchCommand("postMessage", [JSON.stringify({ type: "paseo-ack", session: sessionId, mid: messageId, seq: sequence })]);
    } catch (commandError) {
      countersRef.current.rejected += 1;
      failControl("control", `Native HTML transport could not acknowledge data: ${plainError(commandError)}`);
    }
  }, [dispatchCommand, failControl]);

  const handleComplete = useCallback((value: unknown) => {
    const counters = countersRef.current;
    const themeAck = readNativeThemeAck(value, session);
    if (themeAck !== null) {
      if (pendingThemeRef.current === themeAck) {
        pendingThemeRef.current = null;
        if (themeTimerRef.current) clearTimeout(themeTimerRef.current);
        themeTimerRef.current = null;
      }
      return;
    }
    if (readReadyMessage(value)) {
      readyReceivedRef.current = true;
      setReady(true);
      // A late genuine ready disproves the timeout. Recovery is non-destructive:
      // the frame was never unmounted, so only the banner is removed.
      setNotice((current) => (current?.kind === "ready-timeout" ? null : current));
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      readyTimerRef.current = null;
      return;
    }
    const height = readSizeChangedMessage(value);
    if (height !== undefined) {
      setContentHeight(height);
      return;
    }
    const link = readOpenLinkRequest(value);
    if (link) {
      latest.current.onOpenLink?.(link.url, { metaKey: link.metaKey, ctrlKey: link.ctrlKey });
      return;
    }
    const image = readOpenImageRequest(value);
    if (image) {
      latest.current.onOpenImage?.(image);
      return;
    }
    counters.rejected += 1;
    failControl("control", "Native HTML transport received an unsupported complete message");
  }, [failControl, session]);

  /**
   * One assembler for both channels. A chunk delivered on the bridge and again
   * as a fragment fallback is acknowledged twice and applied once.
   */
  const acceptChunk = useCallback((chunk: NativeTransportChunk) => {
    const counters = countersRef.current;
    counters.chunks += 1;
    counters.messagesSinceProbe += 1;
    const result = assemblerRef.current.push(chunk);
    if (!result.ok) {
      counters.rejected += 1;
      failControl("control", `Native HTML transport rejected data: ${result.error}`);
      return;
    }
    acknowledgeChunk(session, chunk.messageId, chunk.sequence);
    if (result.duplicate || !assemblerRef.current.complete) return;
    const encoded = assemblerRef.current.takeEncoded();
    if (encoded === null) return;
    const decoded = decodeNativeTransportMessage(encoded);
    if (!decoded.ok) {
      counters.rejected += 1;
      failControl("control", `Native HTML transport rejected a message: ${decoded.error}`);
      return;
    }
    counters.messages += 1;
    handleComplete(decoded.value);
  }, [acknowledgeChunk, failControl, handleComplete, session]);

  /** Fragment receiver: one of the three simultaneous page->native carriers. */
  const handleChunkUrl = useCallback((url: string | undefined) => {
    const parsed = parseNativeTransportUrl(url, session);
    if (!parsed) return false;
    if (!parsed.ok || !parsed.chunk) {
      if (parsed.stale) return true;
      countersRef.current.rejected += 1;
      failControl("control", `Native HTML transport rejected data: ${parsed.error ?? "malformed chunk"}`);
      return true;
    }
    countersRef.current.fragments += 1;
    acceptChunk(parsed.chunk);
    return true;
  }, [acceptChunk, failControl, session]);

  /**
   * Title receiver: the same chunk read from `nativeEvent.title`.
   *
   * Android rewrites the commit URL for a `loadDataWithBaseURL` document, but
   * the document title travels unchanged in the same loading event.
   */
  const handleChunkTitle = useCallback((title: string | undefined) => {
    const parsed = parseNativeTitle(title, session);
    if (!parsed) return false;
    if (!parsed.ok || !parsed.chunk) {
      if (parsed.stale) return true;
      countersRef.current.rejected += 1;
      failControl("control", `Native HTML transport rejected data: ${parsed.error ?? "malformed chunk"}`);
      return true;
    }
    countersRef.current.titles += 1;
    acceptChunk(parsed.chunk);
    return true;
  }, [acceptChunk, failControl, session]);

  /** Bridge receiver for hosts that dispatch the plain onMessage event. */
  const handleBridgeMessage = useCallback((event: NativeMessageEvent) => {
    const parsed = parseNativeBridgeMessage(event?.nativeEvent?.data, session);
    // Not our envelope: a foreign bridge writer must not break the transport.
    if (!parsed) return;
    if (!parsed.ok || !parsed.chunk) {
      if (parsed.stale) return;
      countersRef.current.rejected += 1;
      failControl("control", `Native HTML transport rejected data: ${parsed.error ?? "malformed chunk"}`);
      return;
    }
    countersRef.current.pageMessages += 1;
    acceptChunk(parsed.chunk);
  }, [acceptChunk, failControl, session]);

  const onNavigationEvent = useCallback((event: NavigationEvent) => {
    const title = event.nativeEvent?.title;
    const url = event.nativeEvent?.url;
    // Keep raw event delivery separate from accepted chunks. If title delivery
    // fails on a device, the banner can distinguish no callback from a callback
    // carrying a rewritten URL or missing title, without exposing either value.
    const counters = countersRef.current;
    counters.navigationEvents = Math.min(99999, counters.navigationEvents + 1);
    if (typeof url === "string" && url.includes("#")) {
      counters.navigationHashEvents = Math.min(99999, counters.navigationHashEvents + 1);
    }
    counters.lastTitleChars = typeof title === "string" ? Math.min(title.length, NATIVE_MAX_TITLE_CHARS + 1) : 0;
    // The title is parsed first: it is the carrier Android cannot rewrite, and
    // a chunk seen here must not be lost to an unrelated URL on the same event.
    const titleHandled = handleChunkTitle(title);
    const urlHandled = typeof url === "string" ? handleChunkUrl(url) : false;
    if (titleHandled || urlHandled) return;
    const transportError =
      parseNativeErrorTitle(title) ?? (typeof url === "string" ? parseNativeErrorUrl(url) : undefined);
    if (transportError) failControl("control", `Native HTML transport failed: ${transportError}`);
  }, [failControl, handleChunkTitle, handleChunkUrl]);

  const requestReadyProbe = useCallback(() => {
    const counters = countersRef.current;
    counters.probes += 1;
    counters.messagesSinceProbe = 0;
    try {
      dispatchCommand("postMessage", [JSON.stringify({ type: "paseo-ready-probe", session })]);
    } catch (commandError) {
      counters.rejected += 1;
      failControl("control", `Native HTML ready probe failed: ${plainError(commandError)}`);
    }
  }, [dispatchCommand, failControl, session]);

  const onLoadingFinish = useCallback((event: NavigationEvent) => {
    // RNWV's public finish/progress events also carry a URL. Reuse the strict
    // receiver in case the corresponding history/start callback was missed.
    onNavigationEvent(event);
    // Shell load itself is not readiness. Request a fresh inner ready once,
    // retaining the original deadline and requiring a complete real message.
    if (readyReceivedRef.current || readyProbeSentRef.current) return;
    readyProbeSentRef.current = true;
    requestReadyProbe();
  }, [onNavigationEvent, requestReadyProbe]);

  const onLoadingError = useCallback(() => {
    failFatal("Native WebView load failed");
  }, [failFatal]);

  const onRenderProcessGone = useCallback(() => {
    failFatal("Native WebView render process exited");
  }, [failFatal]);

  useEffect(() => {
    if (build.error || ready || fatal || notice) return;
    const timer = setTimeout(() => {
      failControl("ready-timeout", nativeReadyTimeoutMessage(countersRef.current));
    }, NATIVE_READY_TIMEOUT_MS);
    readyTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (readyTimerRef.current === timer) readyTimerRef.current = null;
    };
  }, [build.error, failControl, fatal, notice, ready]);

  useEffect(() => {
    if (build.error || !ready || fatal || notice) return;
    const signature = `${liveTheme.appearance}:${JSON.stringify(liveTheme.variables)}`;
    if (signature === lastThemeRef.current) return;
    lastThemeRef.current = signature;
    const sequence = themeSeqRef.current + 1;
    if (!Number.isSafeInteger(sequence) || sequence > 1_000_000_000) {
      failControl("theme", "Native HTML theme sequence is exhausted");
      return;
    }
    themeSeqRef.current = sequence;
    pendingThemeRef.current = sequence;
    try {
      dispatchCommand("postMessage", [JSON.stringify({
        type: "paseo-theme",
        session,
        seq: sequence,
        message: hostContextChangedMessage(liveTheme),
      })]);
    } catch (commandError) {
      failControl("control", `Native HTML theme update failed: ${plainError(commandError)}`);
      return;
    }
    if (themeTimerRef.current) clearTimeout(themeTimerRef.current);
    themeTimerRef.current = setTimeout(() => {
      if (pendingThemeRef.current !== sequence) return;
      pendingThemeRef.current = null;
      failControl("theme", `Native HTML theme update ${sequence} was not acknowledged`);
    }, NATIVE_THEME_ACK_TIMEOUT_MS);
  }, [build.error, dispatchCommand, failControl, fatal, liveTheme, notice, ready, session]);

  useEffect(() => () => {
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    if (themeTimerRef.current) clearTimeout(themeTimerRef.current);
    assemblerRef.current.reset();
  }, []);

  if (build.error || fatal) {
    return (
      <View style={styles.errorBox} accessibilityLabel="Interactive report unavailable">
        <Text style={styles.errorTitle}>Interactive report unavailable</Text>
        <Text style={styles.errorText}>{build.error ?? fatal}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry interactive report"
          onPress={onRetry}
          style={styles.retry}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const height = frameHeightFor({
    requestedHeight: props.requestedHeight,
    heights: props.heights,
    width,
    contentHeight,
  });
  const ErrorBoundary = getNativeErrorBoundary();
  if (!ErrorBoundary) {
    return (
      <View style={styles.errorBox} accessibilityLabel="Interactive report unavailable">
        <Text style={styles.errorTitle}>Interactive report unavailable</Text>
        <Text style={styles.errorText}>The native host does not expose a usable React component base.</Text>
      </View>
    );
  }

  return (
    <View style={styles.frame} accessibilityLabel="Interactive HTML report">
      {notice ? (
        // Non-destructive: the rendered report stays mounted below this banner
        // and keeps its local state. Retry is the only path to a remount.
        <View style={styles.notice} accessibilityLabel="Interactive report notice">
          <Text style={styles.noticeTitle}>
            {notice.kind === "theme" ? "Report theme is out of sync" : "Report connection interrupted"}
          </Text>
          <Text style={styles.noticeText}>{notice.message}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry interactive report"
            onPress={onRetry}
            style={styles.noticeRetry}
          >
            <Text style={styles.noticeRetryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      <View
        style={{ width: "100%", height, overflow: "hidden", backgroundColor: props.theme.colors.surface0 }}
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          if (next > 0 && next !== width) setWidth(next);
        }}
      >
        {createElement(ErrorBoundary, { onError: failFatal },
          createElement(RNCWebView, {
            ref: webViewRef,
            newSource: source,
            style: styles.webview,
            ...NATIVE_WEBVIEW_SECURITY_PROPS,
            onLoadingStart: onNavigationEvent,
            onLoadingProgress: onNavigationEvent,
            onLoadingFinish,
            onLoadingError,
            onRenderProcessGone,
            onMessage: handleBridgeMessage,
            accessible: true,
            accessibilityLabel: props.title,
            testID: "native-html-frame",
          }))}
        {!ready && !notice ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <Text style={styles.loadingText}>Loading interactive report…</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%" },
  notice: {
    width: "100%",
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: "#5b4a24",
    borderRadius: 8,
    backgroundColor: "#1f1a10",
  },
  noticeTitle: { color: "#ffd9a0", fontSize: 13, fontWeight: "700" },
  noticeText: { color: "#e8dcc2", fontSize: 12, lineHeight: 18 },
  noticeRetry: {
    alignSelf: "flex-start",
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#3a2f1c",
  },
  noticeRetryText: { color: "#ffe9c7", fontSize: 13, fontWeight: "600" },
  webview: { flex: 1, backgroundColor: "transparent" },
  loadingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "rgba(17,17,17,0.82)",
  },
  loadingText: { color: "#dddddd", fontSize: 12 },
  errorBox: {
    width: "100%",
    minHeight: HTML_FRAME_MIN_HEIGHT,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "#5b2b32",
    borderRadius: 8,
    backgroundColor: "#1c1113",
  },
  errorTitle: { color: "#ffb4bc", fontSize: 14, fontWeight: "700" },
  errorText: { color: "#e6c6ca", fontSize: 12, lineHeight: 18 },
  retry: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#3a2024",
  },
  retryText: { color: "#ffd7dc", fontSize: 13, fontWeight: "600" },
});
