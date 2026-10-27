/**
 * Test-only browser shim for React Native and the public plugin client.
 *
 * `node --test` mounts the real TSX components in headless Chromium through
 * `tests/helpers/browser.ts`. esbuild aliases `react-native`,
 * `@getpaseo/plugin/client*` and `@getpaseo/plugin/client/ui` to this module so
 * the components run unmodified against DOM primitives and a scripted RPC
 * table. It is never shipped: `files` in package.json excludes `tests/`.
 */
import { createElement, type ReactNode } from "react";

interface ShimGlobal {
  __copies?: string[];
  __opened?: string[];
  __toasts?: string[];
  __rpc?: Record<string, (input: unknown) => Promise<unknown>>;
  __nativeViewRegistered?: boolean;
}

const globals = globalThis as unknown as ShimGlobal;

type AnyProps = Record<string, unknown> & { children?: ReactNode };

const UNITLESS = new Set([
  "aspectRatio",
  "flex",
  "flexGrow",
  "flexShrink",
  "fontWeight",
  "opacity",
  "zIndex",
]);

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function css(style: unknown): Record<string, string | number> {
  if (style === null || style === undefined) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map((entry) => css(entry)));
  }
  if (typeof style !== "object") return {};
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
    if (value === undefined || value === null || typeof value === "boolean") continue;
    if (key === "aspectRatio") {
      out["aspect-ratio"] = String(value);
      continue;
    }
    if (key === "paddingVertical" || key === "marginVertical") {
      const prefix = key === "paddingVertical" ? "padding" : "margin";
      out[`${prefix}-top`] = typeof value === "number" ? `${value}px` : String(value);
      out[`${prefix}-bottom`] = typeof value === "number" ? `${value}px` : String(value);
      continue;
    }
    if (key === "paddingHorizontal" || key === "marginHorizontal") {
      const prefix = key === "paddingHorizontal" ? "padding" : "margin";
      out[`${prefix}-left`] = typeof value === "number" ? `${value}px` : String(value);
      out[`${prefix}-right`] = typeof value === "number" ? `${value}px` : String(value);
      continue;
    }
    const name = kebab(key);
    if (typeof value === "number") out[name] = UNITLESS.has(key) ? value : `${value}px`;
    else out[name] = String(value);
  }
  return out;
}

function domStyle(style: unknown, extra: Record<string, string | number> = {}) {
  // Caller styles must win over the shim's defaults, so they are layered last.
  return { ...extra, ...css(style) } as never;
}

/**
 * React Native's `View` is a flex container by default (column, stretch).
 * A plain div is not, so shimmed layout used to collapse; these defaults keep
 * the browser's box layout close to the real client. Caller styles still win.
 */
const VIEW_DEFAULTS = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  boxSizing: "border-box",
  minWidth: 0,
} as const;

export function View(props: AnyProps) {
  const { children, style, accessibilityRole, accessibilityLabel, testID } = props;
  return createElement(
    "div" as never,
    {
      role: accessibilityRole as never,
      "aria-label": accessibilityLabel as never,
      "data-testid": testID as never,
      style: domStyle(style, { ...VIEW_DEFAULTS }),
    } as never,
    children,
  );
}

export function Text(props: AnyProps) {
  const { children, style, accessibilityRole, accessibilityLabel, selectable, testID } = props;
  const role = accessibilityRole === "header" ? "heading" : accessibilityRole;
  return createElement(
    "span" as never,
    {
      role: role as never,
      "aria-label": accessibilityLabel as never,
      "data-testid": testID as never,
      style: domStyle(style, {
        display: "block",
        ...(selectable ? { "user-select": "text" } : {}),
      }),
    } as never,
    children,
  );
}

export function Pressable(props: AnyProps) {
  const {
    children,
    style,
    onPress,
    accessibilityRole,
    accessibilityLabel,
    accessibilityState,
    testID,
    disabled,
  } = props;
  const state = (accessibilityState ?? {}) as { selected?: boolean; disabled?: boolean };
  return createElement(
    "button" as never,
    {
      type: "button",
      role: (accessibilityRole ?? "button") as never,
      "aria-label": accessibilityLabel as never,
      "aria-selected": state.selected as never,
      "aria-disabled": state.disabled as never,
      disabled: (disabled === true || state.disabled === true) as never,
      "data-testid": testID as never,
      style: domStyle(style, { ...VIEW_DEFAULTS, cursor: "pointer" }),
      onClick: () => {
        if (disabled === true || state.disabled === true) return;
        if (typeof onPress === "function") (onPress as () => void)();
      },
    } as never,
    children,
  );
}

export function ScrollView(props: AnyProps) {
  const { children, style, accessibilityLabel, horizontal, contentContainerStyle } = props;
  return createElement(
    "div" as never,
    {
      "aria-label": accessibilityLabel as never,
      style: domStyle(style, {
        overflow: "auto",
        ...(horizontal === true
          ? { display: "flex", "flex-direction": "row" }
          : { "max-height": "100%" }),
      }),
      "data-content-style": contentContainerStyle ? JSON.stringify(css(contentContainerStyle)) : undefined,
    } as never,
    children,
  );
}

export function Image(props: AnyProps) {
  const { source, style, accessibilityLabel, onError, onLoad, resizeMode } = props;
  const uri = (source as { uri?: string } | undefined)?.uri ?? "";
  return createElement("img" as never, {
    src: uri as never,
    alt: (accessibilityLabel ?? "") as never,
    style: domStyle(style, {
      display: "block",
      ...(resizeMode === "contain" ? { "object-fit": "contain" } : {}),
    }),
    onError: onError as never,
    onLoad: onLoad as never,
  } as never);
}

function ModalContent(props: AnyProps) {
  const { children, style } = props;
  return createElement("div" as never, { style: domStyle(style) } as never, children);
}

export function Modal(props: AnyProps) {
  const { open, title, onOpenChange, children } = props;
  if (open !== true) return null;
  return createElement(
    "div" as never,
    {
      role: "dialog" as never,
      "aria-label": title as never,
      style: domStyle({
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.6)",
        padding: 16,
      }),
      onClick: (event: { target?: unknown; currentTarget?: unknown }) => {
        if (event.target === event.currentTarget && typeof onOpenChange === "function") {
          (onOpenChange as (value: boolean) => void)(false);
        }
      },
    } as never,
    createElement(
      "div" as never,
      { style: domStyle({ background: "#ffffff", padding: 16, borderRadius: 8 }) } as never,
      typeof title === "string" ? createElement("h2" as never, {} as never, title) : null,
      children,
    ),
  );
}
(Modal as unknown as { Content: typeof ModalContent }).Content = ModalContent;

export function useToast() {
  return {
    show(message: string) {
      globals.__toasts = [...(globals.__toasts ?? []), message];
    },
    error(message: string) {
      globals.__toasts = [...(globals.__toasts ?? []), `error:${message}`];
    },
  };
}

export async function copyText(text: string): Promise<void> {
  globals.__copies = [...(globals.__copies ?? []), text];
}

export async function openExternalUrl(url: string): Promise<void> {
  globals.__opened = [...(globals.__opened ?? []), url];
}

export function ExternalLink(props: AnyProps) {
  const { href, children, accessibilityLabel } = props;
  return createElement(
    "a" as never,
    {
      href: href as never,
      target: "_blank" as never,
      rel: "noreferrer noopener" as never,
      "aria-label": accessibilityLabel as never,
    } as never,
    children,
  );
}

export function Icon(props: AnyProps) {
  return createElement("span" as never, { "aria-hidden": "true" } as never, String(props.name ?? ""));
}

export const Platform = { OS: "android" as const };
export const StyleSheet = { create: <T,>(value: T): T => value };
export const UIManager = {
  dispatchViewManagerCommand: (_tag: number, _command: string, _args: unknown[]): void => undefined,
  hasViewManagerConfig: (name: string): boolean =>
    name === "RNCWebView" && globals.__nativeViewRegistered !== false,
};
export const findNodeHandle = (_value: unknown): number => 1;
export function DocumentFrame() {
  return null;
}

export function useRpc(contract: { name: string }) {
  return async (input: unknown): Promise<unknown> => {
    const handler = globals.__rpc?.[contract.name];
    if (!handler) throw new Error(`No test RPC handler for ${contract.name}`);
    return handler(input);
  };
}
