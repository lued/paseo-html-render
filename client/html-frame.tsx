/**
 * Reusable live HTML frame for Paseo web/desktop.
 *
 * UNSUPPORTED CAPABILITY: Paseo's public plugin SDK has no HTML/WebView
 * surface. This uses a raw `iframe` with `srcDoc`, which is known to work on
 * web/desktop and is unavailable on native. It must never be treated as a
 * cross-platform API. Native callers render the static PNG card instead.
 *
 * Security:
 * - The frame is sandboxed with `allow-scripts` only and an opaque origin. It
 *   can never reach the Paseo document, storage, or session.
 * - The document carries the shared CSP from `shared/html-document.ts`, which
 *   blocks network, forms, frames, objects, workers, base URLs, remote images,
 *   fonts, and styles. There is no `unsafe-eval`.
 * - A sandboxed page can still assign `location` itself. Click interception is
 *   defense in depth, not containment. See the shared module's warning.
 * - Link and image requests are accepted only from this frame's window, only
 *   while the frame has focus and a fresh user activation exists. There is no
 *   key replay and no privileged host command.
 * - A forwarded wheel is accepted only from this frame's window. The parent
 *   cannot tie it to the reader's pointer: Chromium gives the parent no pointer
 *   boundary events for an out-of-process iframe. So wheels arriving within one
 *   animation frame are summed and applied once (a fast trackpad keeps its
 *   distance), and the total is held to a distance budget (2000 px at once,
 *   refilled at 6000 px/s). A card can still scroll the chat by itself, but
 *   only within that budget.
 */
import { createElement, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  HTML_FRAME_DEFAULT_WIDTH,
  MAX_FORWARDED_WHEEL_PX,
  HTML_FRAME_READY_TIMEOUT_MS,
  HTML_FRAME_SANDBOX,
  appearanceFromColors,
  buildDocumentTheme,
  buildLiveDocument,
  canRenderLiveHtmlFrame,
  frameHeightFor,
  hostContextChangedMessage,
  readOpenImageRequest,
  readOpenLinkRequest,
  readReadyMessage,
  readSizeChangedMessage,
  readWheelMessage,
  readyAckMessage,
  selectHtmlFrameKind,
  type ForwardedWheel,
  type HtmlDocumentColors,
  type HtmlDocumentTheme,
  type HtmlFramePlatform,
  type HtmlFrameRenderMode,
  type ThemeAppearance,
} from "../shared/html-document.ts";

export interface HtmlFrameProps {
  /** Untrusted report HTML. Rendered only on web/desktop. */
  html: string;
  title: string;
  /**
   * Stable identity for this HTML/artifact. Changing it may rebuild the
   * document (and reload the page); theme changes never do.
   */
  artifactKey: string;
  /** Structural subset of `PluginTheme["colors"]`; no React Native import. */
  theme: { readonly colors: HtmlDocumentColors };
  /** Optional override; otherwise inferred from `surface0` luminance. */
  appearance?: ThemeAppearance;
  /** T3-shaped requested frame height; clamped to 80..2000. */
  requestedHeight: number;
  /** Optional measured `[width, height]` pairs, sorted by width. */
  heights?: ReadonlyArray<readonly [number, number]>;
  /** Web-only gate. ios/android always render nothing. */
  platform: HtmlFramePlatform;
  /** `auto`/`iframe` opt into live HTML on web; absent/`static` stays static. */
  renderMode?: HtmlFrameRenderMode;
  /** Additional hard gate for experiments/tests. Defaults to true. */
  enabled?: boolean;
  /**
   * Called once when the frame fails (handshake timeout or load error) so the
   * card can show the static PNG instead of a large dead area.
   */
  /**
   * Called only for absolute http(s) link requests that pass source, focus, and
   * user-activation checks. When absent, the request is ignored; this component
   * never calls `window.open` or navigates on its own.
   */
  onOpenLink?: (url: string, modifiers: { metaKey: boolean; ctrlKey: boolean }) => void;
  /** Optional data-URI image zoom, gated exactly like links. */
  onOpenImage?: (image: { src: string; name: string }) => void;
}

interface FrameMessageEvent {
  source?: unknown;
  data?: unknown;
}

interface FrameWindow {
  postMessage(message: unknown, targetOrigin: string): void;
}

interface FrameElement {
  contentWindow?: FrameWindow | null;
}

interface MeasuredElement {
  getBoundingClientRect?(): { width?: number; height?: number };
  clientWidth?: number;
}

interface GlobalHost {
  addEventListener(
    type: "message" | "resize",
    listener: (event: never) => void,
  ): void;
  removeEventListener(
    type: "message" | "resize",
    listener: (event: never) => void,
  ): void;
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(id: number): void;
  navigator?: { userActivation?: { isActive?: boolean } };
  document?: { activeElement?: unknown };
  ResizeObserver?: new (
    callback: (entries: Array<{ contentRect?: { width?: number } }>) => void,
  ) => { observe(target: unknown): void; disconnect(): void };
}

function host(): GlobalHost {
  return globalThis as unknown as GlobalHost;
}

function frameFocusedAndActivated(frame: FrameElement): boolean {
  const g = host();
  // A page can focus itself; this stops opens on load, not a page that waits
  // for the reader's next click or key. Require a live activation, not truthy.
  return (
    g.document?.activeElement === (frame as unknown) &&
    g.navigator?.userActivation?.isActive === true
  );
}

interface ScrollableElement {
  parentElement: ScrollableElement | null;
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
  dispatchEvent(event: unknown): boolean;
  scrollBy(options: { top: number; left: number; behavior: "instant" }): void;
}

interface WheelHost {
  WheelEvent?: new (type: "wheel", init: Record<string, unknown>) => { defaultPrevented: boolean };
  getComputedStyle?(element: unknown): { overflowX: string; overflowY: string };
}

function canTake(element: ScrollableElement, wheel: ForwardedWheel, style: { overflowX: string; overflowY: string }): boolean {
  const scrolls = (overflow: string) => overflow === "auto" || overflow === "scroll" || overflow === "overlay";
  const { deltaX: dx, deltaY: dy } = wheel;
  if (dy !== 0 && scrolls(style.overflowY) && element.scrollHeight > element.clientHeight + 1) {
    if (dy < 0 ? element.scrollTop > 0 : element.scrollTop + element.clientHeight < element.scrollHeight - 1) return true;
  }
  if (dx !== 0 && scrolls(style.overflowX) && element.scrollWidth > element.clientWidth + 1) {
    if (dx < 0 ? element.scrollLeft > 0 : element.scrollLeft + element.clientWidth < element.scrollWidth - 1) return true;
  }
  return false;
}

/**
 * Replays a wheel the card could not use as if it had happened on the card's
 * own element, then scrolls the nearest ancestor that can take it.
 *
 * A wheel over an iframe is delivered to the iframe's document and never to the
 * parent's. A host timeline that holds to its bottom until it sees the reader's
 * own wheel (Paseo's agent stream) would read the chained scroll as a layout
 * shift and snap back. The synthetic event is dispatched first, so such a host
 * records the reader's intent before the scroll it causes; a host listener that
 * cancels it keeps the scroll for itself.
 */
export function forwardWheelToHost(element: ScrollableElement, wheel: ForwardedWheel): void {
  const g = globalThis as unknown as WheelHost;
  if (!g.WheelEvent || !g.getComputedStyle) return;
  const event = new g.WheelEvent("wheel", {
    deltaX: wheel.deltaX,
    deltaY: wheel.deltaY,
    deltaMode: 0,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  element.dispatchEvent(event);
  if (event.defaultPrevented) return;
  const step = Math.abs(wheel.deltaX) > Math.abs(wheel.deltaY) ? { deltaX: wheel.deltaX, deltaY: 0 } : { deltaX: 0, deltaY: wheel.deltaY };
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (canTake(node, step, g.getComputedStyle(node))) {
      node.scrollBy({ top: step.deltaY, left: step.deltaX, behavior: "instant" });
      return;
    }
  }
}

/** Longest a summed wheel waits for an animation frame before it is applied anyway. */
const WHEEL_FLUSH_FALLBACK_MS = 32;

/** Refill rate of the forwarded-wheel distance budget: 6000 px per second. */
const WHEEL_REFILL_PX_PER_MS = 6;

export function HtmlFrame(props: HtmlFrameProps) {
  const live =
    props.enabled !== false &&
    canRenderLiveHtmlFrame(props.platform) &&
    selectHtmlFrameKind({ platform: props.platform, renderMode: props.renderMode }) === "live";

  const frameRef = useRef<unknown>(null);
  const wrapperRef = useRef<unknown>(null);
  const readyRef = useRef(false);
  const contentSeenRef = useRef(false);
  const liveThemeRef = useRef<HtmlDocumentTheme | null>(null);
  const latest = useRef({
    onOpenLink: props.onOpenLink,
    onOpenImage: props.onOpenImage,
  });
  latest.current = {
    onOpenLink: props.onOpenLink,
    onOpenImage: props.onOpenImage,
  };

  const [width, setWidth] = useState(HTML_FRAME_DEFAULT_WIDTH);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);
  const [ready, setReady] = useState(false);

  const appearance = props.appearance ?? appearanceFromColors(props.theme.colors);
  const liveTheme = useMemo(
    () => buildDocumentTheme(props.theme.colors, appearance),
    // The color object comes from host theme state and is stable per theme.
    [props.theme.colors, appearance],
  );
  liveThemeRef.current = liveTheme;
  const themeSignature = `${liveTheme.appearance}:${JSON.stringify(liveTheme.variables)}`;

  // Freeze the initial document at the first theme for this artifact. Later
  // theme changes are postMessage updates, never a new srcDoc: that would reset
  // the page's state and counter values.
  const initialTheme = useRef<{ key: string; theme: HtmlDocumentTheme } | null>(null);
  if (initialTheme.current === null || initialTheme.current.key !== props.artifactKey) {
    initialTheme.current = { key: props.artifactKey, theme: liveTheme };
  }

  const documentHtml = useMemo(
    () =>
      live
        ? buildLiveDocument({
            html: props.html,
            title: props.title,
            theme: initialTheme.current?.theme ?? liveTheme,
          })
        : "",
    // initialTheme is intentionally excluded: only the artifact/html identity may rebuild.
    [live, props.artifactKey, props.html, props.title],
  );

  const post = useCallback((message: unknown) => {
    const frame = frameRef.current as FrameElement | null;
    frame?.contentWindow?.postMessage(message, "*");
  }, []);

  // Registered in a layout effect, before the iframe can load and post.
  useLayoutEffect(() => {
    if (!live) return;
    // Forwarded wheels are summed until the next animation frame, then applied once.
    let pendingWheel: { deltaX: number; deltaY: number } | null = null;
    // The flush runs on the next animation frame or after WHEEL_FLUSH_FALLBACK_MS, whichever comes first:
    // a throttled or occluded page may never run an animation frame, and its reader still scrolls.
    let wheelFrame: number | null = null;
    let wheelTimer: number | null = null;
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame;
    const caf = (globalThis as { cancelAnimationFrame?: (id: number) => void }).cancelAnimationFrame;
    const cancelWheelFlush = () => {
      if (wheelFrame !== null && caf) caf(wheelFrame);
      if (wheelTimer !== null) host().clearTimeout(wheelTimer);
      wheelFrame = null;
      wheelTimer = null;
    };
    // Distance budget: at most MAX_FORWARDED_WHEEL_PX at once, refilled at WHEEL_REFILL_PX_PER_MS.
    let budget = MAX_FORWARDED_WHEEL_PX;
    let budgetAt = performance.now();
    const spend = (wheel: { deltaX: number; deltaY: number }) => {
      const now = performance.now();
      budget = Math.min(MAX_FORWARDED_WHEEL_PX, budget + (now - budgetAt) * WHEEL_REFILL_PX_PER_MS);
      budgetAt = now;
      const want = Math.max(Math.abs(wheel.deltaX), Math.abs(wheel.deltaY));
      if (want <= 0 || budget <= 0) return null;
      const scale = Math.min(1, budget / want);
      budget -= want * scale;
      return { deltaX: wheel.deltaX * scale, deltaY: wheel.deltaY * scale };
    };
    const flushWheel = () => {
      cancelWheelFlush();
      const wrapper = wrapperRef.current as ScrollableElement | null;
      const wheel = pendingWheel;
      pendingWheel = null;
      if (!wrapper || !wheel) return;
      const allowed = spend(wheel);
      if (allowed) forwardWheelToHost(wrapper, allowed);
    };
    const listener = (event: FrameMessageEvent) => {
      const frame = frameRef.current as FrameElement | null;
      const source = frame?.contentWindow;
      if (!source || event.source !== source) return;
      const wrapper = wrapperRef.current as ScrollableElement | null;
      const wheel = readWheelMessage(event.data, wrapper?.clientHeight ?? 0);
      if (wheel) {
        if (!wrapper) return;
        pendingWheel = pendingWheel
          ? { deltaX: pendingWheel.deltaX + wheel.deltaX, deltaY: pendingWheel.deltaY + wheel.deltaY }
          : { deltaX: wheel.deltaX, deltaY: wheel.deltaY };
        if (wheelFrame === null && wheelTimer === null) {
          if (raf) wheelFrame = raf(flushWheel);
          wheelTimer = host().setTimeout(flushWheel, WHEEL_FLUSH_FALLBACK_MS);
        }
        return;
      }

      const size = readSizeChangedMessage(event.data);
      if (size !== undefined) {
        contentSeenRef.current = true;
        setContentHeight(size);
        return;
      }

      if (readReadyMessage(event.data)) {
        readyRef.current = true;
        setReady(true);
        if (liveThemeRef.current) post(hostContextChangedMessage(liveThemeRef.current));
        post(readyAckMessage());
        return;
      }

      const link = readOpenLinkRequest(event.data);
      if (link) {
        if (frame && frameFocusedAndActivated(frame)) {
          latest.current.onOpenLink?.(link.url, {
            metaKey: link.metaKey,
            ctrlKey: link.ctrlKey,
          });
        }
        return;
      }

      const image = readOpenImageRequest(event.data);
      if (image && frame && frameFocusedAndActivated(frame)) {
        latest.current.onOpenImage?.(image);
      }
    };
    host().addEventListener("message", listener as (event: never) => void);
    return () => {
      host().removeEventListener("message", listener as (event: never) => void);
      cancelWheelFlush();
    };
  }, [live, post]);

  // One handshake per document. The frame is never replaced on timeout: a live
  // page that is slow to report is still the page the reader asked for.
  useLayoutEffect(() => {
    if (!live) return;
    readyRef.current = false;
    contentSeenRef.current = false;
    setReady(false);
    setContentHeight(undefined);
  }, [live, documentHtml]);

  // Width measurement drives nearest-measurement fitting. The wrapper has an
  // explicit height and no viewport min-height, so fitted height cannot feed
  // back into the measured width.
  useLayoutEffect(() => {
    if (!live) return;
    const g = host();
    const element = wrapperRef.current as (MeasuredElement & object) | null;
    if (!element) return;
    const measureWidth = () => {
      const rect = element.getBoundingClientRect?.();
      const next = Math.round(rect?.width ?? element.clientWidth ?? 0);
      if (next > 0) setWidth((current) => (current === next ? current : next));
    };
    measureWidth();
    const Observer = g.ResizeObserver;
    if (Observer) {
      const observer = new Observer((entries) => {
        const next = entries[0]?.contentRect?.width;
        if (typeof next === "number" && next > 0) setWidth(Math.round(next));
      });
      observer.observe(element);
      return () => observer.disconnect();
    }
    g.addEventListener("resize", measureWidth as (event: never) => void);
    return () => g.removeEventListener("resize", measureWidth as (event: never) => void);
  }, [live]);

  // Theme changes are applied in place; the document is never replaced.
  useLayoutEffect(() => {
    if (!live || !ready) return;
    post(hostContextChangedMessage(liveTheme));
    // themeSignature captures the sanitized token map; post uses a ref.
  }, [live, ready, themeSignature, post]);

  if (!live) return null;

  const frameHeight = frameHeightFor({
    requestedHeight: props.requestedHeight,
    heights: props.heights,
    width,
    contentHeight,
  });

  const onLoad = () => {
    // Covers a theme change that landed while the document was loading.
    if (liveThemeRef.current) post(hostContextChangedMessage(liveThemeRef.current));
    post(readyAckMessage());
  };
  const iframe = createElement("iframe" as never, {
    ref: frameRef as never,
    title: props.title,
    srcDoc: documentHtml,
    sandbox: HTML_FRAME_SANDBOX,
    // No fullscreen permission, same-origin, forms, popups, or navigation.
    allow: "fullscreen 'none'",
    referrerPolicy: "no-referrer",
    style: {
      width: "100%",
      height: frameHeight,
      border: 0,
      display: "block",
      background: "transparent",
      colorScheme: appearance,
    },
    onLoad,
  } as never);

  return createElement(
    "div" as never,
    {
      ref: wrapperRef as never,
      // A real readiness probe for tests and the host: set only after the page
      // has posted its handshake, never merely because the element mounted.
      "data-paseo-html-frame-ready": ready ? "true" : "false",
      style: { width: "100%", height: frameHeight, overflow: "hidden" },
    } as never,
    iframe,
  );
}
