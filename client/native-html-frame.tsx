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
  HTML_FRAME_READY_TIMEOUT_MS,
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
  NATIVE_WEBVIEW_SECURITY_PROPS,
  NativeChunkAssembler,
  buildNativeShellDocument,
  decodeNativeTransportMessage,
  parseNativeErrorUrl,
  parseNativeTransportUrl,
  nativeMountErrorMessage,
  probeRegisteredViewManager,
  selectNativeHtmlCapability,
  nativeDocumentKey,
  readNativeThemeAck,
  type NativeHtmlCapability,
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
    description?: string;
    didCrash?: boolean;
  };
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
  const [error, setError] = useState<string | null>(null);
  const [themeAckError, setThemeAckError] = useState<string | null>(null);
  const assemblerRef = useRef(new NativeChunkAssembler(session));
  const pendingThemeRef = useRef<number | null>(null);
  const themeSeqRef = useRef(0);
  const lastThemeRef = useRef(`${initialTheme.appearance}:${JSON.stringify(initialTheme.variables)}`);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const themeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyProbeSentRef = useRef(false);
  const readyReceivedRef = useRef(false);

  const fail = useCallback((message: string) => {
    setError(message);
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    if (themeTimerRef.current) clearTimeout(themeTimerRef.current);
    readyTimerRef.current = null;
    themeTimerRef.current = null;
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
      fail(`Native HTML transport could not acknowledge data: ${plainError(commandError)}`);
    }
  }, [dispatchCommand, fail]);

  const handleChunk = useCallback((url: string | undefined) => {
    const parsed = parseNativeTransportUrl(url, session);
    if (!parsed) return false;
    if (!parsed.ok || !parsed.chunk) {
      if (parsed.stale) return true;
      fail(`Native HTML transport rejected data: ${parsed.error ?? "malformed chunk"}`);
      return true;
    }
    const result = assemblerRef.current.push(parsed.chunk);
    if (!result.ok) {
      fail(`Native HTML transport rejected data: ${result.error}`);
      return true;
    }
    acknowledgeChunk(session, parsed.chunk.messageId, parsed.chunk.sequence);
    if (result.duplicate || !assemblerRef.current.complete) return true;
    const encoded = assemblerRef.current.takeEncoded();
    if (encoded === null) return true;
    const decoded = decodeNativeTransportMessage(encoded);
    if (!decoded.ok) {
      fail(`Native HTML transport rejected a message: ${decoded.error}`);
      return true;
    }
    const value = decoded.value;
    const themeAck = readNativeThemeAck(value, session);
    if (themeAck !== null) {
      if (pendingThemeRef.current === themeAck) {
        pendingThemeRef.current = null;
        if (themeTimerRef.current) clearTimeout(themeTimerRef.current);
        themeTimerRef.current = null;
        setThemeAckError(null);
      }
      return true;
    }
    if (readReadyMessage(value)) {
      readyReceivedRef.current = true;
      setReady(true);
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      readyTimerRef.current = null;
      return true;
    }
    const height = readSizeChangedMessage(value);
    if (height !== undefined) {
      setContentHeight(height);
      return true;
    }
    const link = readOpenLinkRequest(value);
    if (link) {
      latest.current.onOpenLink?.(link.url, { metaKey: link.metaKey, ctrlKey: link.ctrlKey });
      return true;
    }
    const image = readOpenImageRequest(value);
    if (image) {
      latest.current.onOpenImage?.(image);
      return true;
    }
    fail("Native HTML transport received an unsupported complete message");
    return true;
  }, [acknowledgeChunk, fail, session]);

  const onNavigationEvent = useCallback((event: NavigationEvent) => {
    const url = event.nativeEvent?.url;
    // Early progress events may have no URL. Only an actual transport URL can
    // contribute data; ordinary loading/progress is never readiness.
    if (typeof url !== "string") return;
    if (handleChunk(url)) return;
    const transportError = parseNativeErrorUrl(url);
    if (transportError) fail(`Native HTML transport failed: ${transportError}`);
  }, [fail, handleChunk]);

  const onLoadingFinish = useCallback((event: NavigationEvent) => {
    // RNWV's public finish/progress events also carry a URL. Reuse the strict
    // receiver in case the corresponding history/start callback was missed.
    onNavigationEvent(event);
    // Shell load itself is not readiness. Request a fresh inner ready once,
    // retaining the original deadline and requiring a complete real message.
    if (readyReceivedRef.current || readyProbeSentRef.current) return;
    readyProbeSentRef.current = true;
    try {
      dispatchCommand("postMessage", [JSON.stringify({ type: "paseo-ready-probe", session })]);
    } catch (commandError) {
      fail(`Native HTML ready probe failed: ${plainError(commandError)}`);
    }
  }, [dispatchCommand, fail, onNavigationEvent, session]);

  const onLoadingError = useCallback(() => {
    fail("Native WebView load failed");
  }, [fail]);

  const onRenderProcessGone = useCallback(() => {
    fail("Native WebView render process exited");
  }, [fail]);

  useEffect(() => {
    if (build.error || ready || error) return;
    const timer = setTimeout(() => {
      fail("The native HTML frame did not complete its ready handshake in time");
    }, Math.max(HTML_FRAME_READY_TIMEOUT_MS, 8_000));
    readyTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (readyTimerRef.current === timer) readyTimerRef.current = null;
    };
  }, [build.error, error, fail, ready]);

  useEffect(() => {
    if (build.error || !ready || error || themeAckError) return;
    const signature = `${liveTheme.appearance}:${JSON.stringify(liveTheme.variables)}`;
    if (signature === lastThemeRef.current) return;
    lastThemeRef.current = signature;
    const sequence = themeSeqRef.current + 1;
    if (!Number.isSafeInteger(sequence) || sequence > 1_000_000_000) {
      setThemeAckError("Native HTML theme sequence is exhausted");
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
      fail(`Native HTML theme update failed: ${plainError(commandError)}`);
      return;
    }
    if (themeTimerRef.current) clearTimeout(themeTimerRef.current);
    themeTimerRef.current = setTimeout(() => {
      if (pendingThemeRef.current !== sequence) return;
      pendingThemeRef.current = null;
      setThemeAckError(`Native HTML theme update ${sequence} was not acknowledged`);
    }, NATIVE_THEME_ACK_TIMEOUT_MS);
  }, [build.error, dispatchCommand, error, fail, liveTheme, ready, session, themeAckError]);

  useEffect(() => () => {
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    if (themeTimerRef.current) clearTimeout(themeTimerRef.current);
    assemblerRef.current.reset();
  }, []);

  if (build.error || error || themeAckError) {
    return (
      <View style={styles.errorBox} accessibilityLabel="Interactive report unavailable">
        <Text style={styles.errorTitle}>Interactive report unavailable</Text>
        <Text style={styles.errorText}>{build.error ?? error ?? themeAckError}</Text>
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
    <View
      style={{ width: "100%", height, overflow: "hidden", backgroundColor: props.theme.colors.surface0 }}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        if (next > 0 && next !== width) setWidth(next);
      }}
      accessibilityLabel="Interactive HTML report"
    >
      {createElement(ErrorBoundary, { onError: (message) => fail(message) },
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
          accessible: true,
          accessibilityLabel: props.title,
          testID: "native-html-frame",
        }))}
      {!ready ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <Text style={styles.loadingText}>Loading interactive report…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
