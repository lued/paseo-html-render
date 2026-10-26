/**
 * Pure HTML document, CSP, theme, and frame-message helpers.
 *
 * This module has no Node, React, or DOM imports. The daemon uses it to build
 * `interactive.html`; the web client uses the same builder for the live
 * `srcDoc` frame. Both paths share one CSP and one bootstrap, so a security fix
 * cannot drift between the exported file and the inline frame.
 *
 * Security model (must stay true):
 * - The report HTML is untrusted. The CSP is inserted immediately after a
 *   leading doctype (or before everything when there is none), so it always
 *   precedes untrusted executable markup. We never inject into the document's
 *   own `<head>`: a hostile `<head>` inside a comment, template, raw-text
 *   element, plaintext block, attribute value, or SVG foreignObject cannot
 *   capture the bootstrap.
 * - Inline scripts and styles are the only executable capabilities. There is
 *   no `unsafe-eval`, no remote script/style/font/image, no form action, no
 *   frame/object/worker, no base URL, and no network.
 * - The iframe sandbox is `allow-scripts` only. Never add `allow-same-origin`,
 *   `allow-forms`, `allow-popups`, or navigation grants.
 * - A sandboxed frame can still navigate itself (for example by assigning
 *   `location`, calling `location.assign`, or using a zero-delay
 *   `<meta http-equiv="refresh">`). CSP does not contain that, and this module
 *   does not claim it does. Link clicks and image clicks are intercepted on a
 *   best-effort basis as defense in depth; a page script can always navigate
 *   itself directly. The stored original HTML is never modified.
 * - The raw iframe is an unsupported web/desktop capability. Native clients
 *   must use the static PNG or the native report view.
 */
import {
  MAX_INTERACTIVE_HTML_BYTES,
  PREVIEW_DEFAULT_WIDTH,
  RENDER_MAX_HEIGHT,
  RENDER_MIN_HEIGHT,
} from "./limits.ts";
import { utf8ByteLength } from "./report-model.ts";

/** Re-exported so the server gate and the document builder share one bound. */
export { MAX_INTERACTIVE_HTML_BYTES };

export type ThemeAppearance = "light" | "dark";

/**
 * Structural subset of `PluginTheme["colors"]`. A host `PluginTheme["colors"]`
 * is assignable to this type; `ring`, `primary`, and `primaryForeground` are
 * optional aliases for hosts that expose more than the 0.12.0 palette.
 */
export interface HtmlDocumentColors {
  readonly surface0: string;
  readonly surface1: string;
  readonly surface2: string;
  readonly border: string;
  readonly foreground: string;
  readonly foregroundMuted: string;
  readonly accent: string;
  readonly accentForeground: string;
  readonly statusSuccess: string;
  readonly statusWarning: string;
  readonly statusDanger: string;
  readonly ring?: string;
  readonly primary?: string;
  readonly primaryForeground?: string;
}

export interface HtmlDocumentFonts {
  readonly sans: string;
  readonly mono: string;
}

export interface HtmlDocumentTheme {
  readonly appearance: ThemeAppearance;
  /** `--token` names mapped to sanitized CSS values. */
  readonly variables: Readonly<Record<string, string>>;
}

/**
 * Arial-metric faces stand in for the system UI fonts readers see, so measured
 * heights and preview screenshots wrap text close to how a client will render it.
 * Mirrors T3's `HTML_RENDER_MEASURE_FONTS`.
 */
export const HTML_RENDER_MEASURE_FONTS: HtmlDocumentFonts = {
  sans: '"Liberation Sans", Arimo, Arial, Helvetica, sans-serif',
  mono: '"Liberation Mono", Cousine, Menlo, Consolas, monospace',
};

export const HTML_DOCUMENT_FONTS: HtmlDocumentFonts = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  // Concrete names only: some engines alias `ui-monospace` to the proportional UI font.
  mono: '"SF Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace',
};

/**
 * Default palette used for exported files and the script-disabled screenshot
 * renderer. It intentionally mirrors the renderer's existing dark/light pair so
 * a screenshot and a surrounding exported page look alike.
 */
export const DEFAULT_HTML_DOCUMENT_COLORS: Readonly<Record<ThemeAppearance, HtmlDocumentColors>> = {
  dark: {
    surface0: "#111111",
    surface1: "#1a1a1a",
    surface2: "#232323",
    border: "#333333",
    foreground: "#eeeeee",
    foregroundMuted: "#a3a3a3",
    accent: "#6ea8fe",
    accentForeground: "#0b0b0b",
    statusSuccess: "#10b981",
    statusWarning: "#fbbf24",
    statusDanger: "#fb7185",
    ring: "#6ea8fe",
  },
  light: {
    surface0: "#ffffff",
    surface1: "#ffffff",
    surface2: "#f4f4f5",
    border: "#e4e4e7",
    foreground: "#111111",
    foregroundMuted: "#52525b",
    accent: "#2563eb",
    accentForeground: "#ffffff",
    statusSuccess: "#10b981",
    statusWarning: "#d97706",
    statusDanger: "#e11d48",
    ring: "#2563eb",
  },
};

const FIXED_APPEARANCE = {
  light: {
    successForeground: "#047857",
    // T3's light error/warning foregrounds, read on their tinted surfaces.
    warningForeground: "#bb4d00",
    destructiveForeground: "#c10007",
    info: "#3b82f6",
    infoForeground: "#1d4ed8",
    chart: ["#0d9488", "#d97706", "#9333ea", "#e11d48", "#65a30d"],
  },
  dark: {
    successForeground: "#34d399",
    warningForeground: "#fbbf24",
    destructiveForeground: "#ff6467",
    info: "#3b82f6",
    infoForeground: "#60a5fa",
    chart: ["#2dd4bf", "#fbbf24", "#c084fc", "#fb7185", "#a3e635"],
  },
} as const;

const CSS_CONTROL_OR_INJECTION = /[\u0000-\u001F\u007F;{}<>\\]/g;
const CSS_REMOTE_OR_EXECUTABLE = /url\s*\(|expression\s*\(|@import|javascript:|vbscript:|data:/i;
const CSS_VARIABLE_NAME = /^--[a-z0-9-]+$/;
const MAX_CSS_VALUE_CHARS = 512;

/**
 * Sanitizes one CSS value for insertion into a `:root{...}` rule. Rejects
 * values that can break out of the declaration/style element or pull a remote
 * resource. The CSP is the primary defense; this keeps the token map tidy even
 * before CSP parsing.
 */
export function sanitizeCssValue(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(CSS_CONTROL_OR_INJECTION, "").trim().slice(0, MAX_CSS_VALUE_CHARS);
  if (!cleaned || CSS_REMOTE_OR_EXECUTABLE.test(cleaned)) return "";
  return cleaned;
}

function sanitizedOr(value: unknown, fallback: string): string {
  return sanitizeCssValue(value) || fallback;
}

type RequiredColorKey = Exclude<keyof HtmlDocumentColors, "ring" | "primary" | "primaryForeground">;

function normalizedColors(
  colors: Partial<HtmlDocumentColors> | undefined,
  appearance: ThemeAppearance,
): HtmlDocumentColors {
  const fallback = DEFAULT_HTML_DOCUMENT_COLORS[appearance];
  const pick = (key: RequiredColorKey): string => {
    const raw = colors?.[key];
    return typeof raw === "string" ? sanitizedOr(raw, fallback[key]) : fallback[key];
  };
  const optional = (key: "ring" | "primary" | "primaryForeground"): string | undefined => {
    const raw = colors?.[key];
    return typeof raw === "string" ? sanitizeCssValue(raw) || undefined : undefined;
  };
  return {
    surface0: pick("surface0"),
    surface1: pick("surface1"),
    surface2: pick("surface2"),
    border: pick("border"),
    foreground: pick("foreground"),
    foregroundMuted: pick("foregroundMuted"),
    accent: pick("accent"),
    accentForeground: pick("accentForeground"),
    statusSuccess: pick("statusSuccess"),
    statusWarning: pick("statusWarning"),
    statusDanger: pick("statusDanger"),
    ring: optional("ring"),
    primary: optional("primary"),
    primaryForeground: optional("primaryForeground"),
  };
}

/**
 * Builds the full T3-like CSS token map. Every value is sanitized and falls back
 * to the default palette for the appearance.
 */
/**
 * Opaque blend of `tint` over `base`, for the tinted surfaces T3 derives from
 * its palette (`--destructive-surface`, `--warning-surface`, `--accent-surface`,
 * `--input`). Paseo's plugin theme exposes only flat colors, so the tints are
 * reconstructed here instead of being read. Unparseable inputs keep `base`.
 */
function mixColor(base: string, tint: string, amount: number): string {
  const from = parseColor(base);
  const to = parseColor(tint);
  if (!from || !to) return base;
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  const channel = (index: number) => clamp(from[index]! + (to[index]! - from[index]!) * amount);
  const hex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${hex(channel(0))}${hex(channel(1))}${hex(channel(2))}`;
}

export function buildDocumentTheme(
  colors: Partial<HtmlDocumentColors> | undefined,
  appearance: ThemeAppearance,
  fonts: HtmlDocumentFonts = HTML_DOCUMENT_FONTS,
): HtmlDocumentTheme {
  const palette = normalizedColors(colors, appearance);
  const fixed = FIXED_APPEARANCE[appearance];
  const sans = sanitizedOr(fonts.sans, HTML_DOCUMENT_FONTS.sans);
  const mono = sanitizedOr(fonts.mono, HTML_DOCUMENT_FONTS.mono);
  const dark = appearance === "dark";
  const variables: Record<string, string> = {
    "--background": palette.surface0,
    "--foreground": palette.foreground,
    "--muted": palette.surface1,
    "--muted-foreground": palette.foregroundMuted,
    "--card": palette.surface1,
    "--card-foreground": palette.foreground,
    "--popover": palette.surface2,
    "--popover-foreground": palette.foreground,
    "--secondary": palette.surface2,
    "--secondary-foreground": palette.foreground,
    "--border": palette.border,
    // T3 draws inputs a step darker than the border (`#1e1e1e` vs `#191919`).
    "--input": mixColor(palette.border, palette.foreground, dark ? 0.03 : 0.08),
    "--ring": palette.ring ?? palette.accent,
    "--primary": palette.primary ?? palette.accent,
    "--primary-foreground": palette.primaryForeground ?? palette.accentForeground,
    "--accent": palette.accent,
    "--accent-foreground": palette.accentForeground,
    "--accent-surface": mixColor(palette.surface1, palette.accent, 0.04),
    "--accent-surface-foreground": palette.accent,
    "--destructive": palette.statusDanger,
    "--destructive-foreground": fixed.destructiveForeground,
    "--destructive-surface": mixColor(palette.surface1, palette.statusDanger, dark ? 0.12 : 0.1),
    "--warning": palette.statusWarning,
    "--warning-foreground": fixed.warningForeground,
    "--warning-surface": mixColor(palette.surface1, palette.statusWarning, dark ? 0.12 : 0.08),
    "--success": palette.statusSuccess,
    "--success-foreground": fixed.successForeground,
    "--info": fixed.info,
    "--info-foreground": fixed.infoForeground,
    "--code-background": palette.surface2,
    "--code-foreground": palette.foreground,
    "--chart-1": palette.accent,
    "--radius": "0.625rem",
    "--font-sans": sans,
    "--font-mono": mono,
  };
  fixed.chart.forEach((color, index) => {
    variables[`--chart-${index + 2}`] = color;
  });
  return { appearance, variables };
}

export function defaultDocumentTheme(appearance: ThemeAppearance): HtmlDocumentTheme {
  return buildDocumentTheme(DEFAULT_HTML_DOCUMENT_COLORS[appearance], appearance);
}

function parseColor(value: string): [number, number, number] | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(text);
  if (hex) {
    const digits = hex[1]!;
    if (digits.length === 3 || digits.length === 4) {
      return [0, 1, 2].map((index) => Number.parseInt(digits[index]! + digits[index]!, 16)) as [
        number,
        number,
        number,
      ];
    }
    if (digits.length === 6 || digits.length === 8) {
      return [0, 2, 4].map((index) => Number.parseInt(digits.slice(index, index + 2), 16)) as [
        number,
        number,
        number,
      ];
    }
    return null;
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/.exec(text);
  if (!rgb) return null;
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map((channel) =>
    Math.max(0, Math.min(255, Math.round(channel))),
  ) as [number, number, number];
}

/**
 * Infers light/dark from a surface color. `PluginTheme` 0.12.0 has no
 * appearance field, so the frame derives it from `surface0`; callers can still
 * pass an explicit `appearance` when they know better.
 */
export function appearanceFromColors(
  colors: Pick<HtmlDocumentColors, "surface0" | "surface1"> | undefined,
  fallback: ThemeAppearance = "dark",
): ThemeAppearance {
  const parsed =
    (colors?.surface0 ? parseColor(colors.surface0) : null) ??
    (colors?.surface1 ? parseColor(colors.surface1) : null);
  if (!parsed) return fallback;
  const [red, green, blue] = parsed.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.4 ? "light" : "dark";
}

// ---------------------------------------------------------------------------
// CSP, base CSS, and the in-document bootstrap
// ---------------------------------------------------------------------------

/**
 * Strict CSP for report HTML. `unsafe-eval` is intentionally absent; T3's own
 * bootstrap needs only inline script execution. `img-src data:` permits the
 * data-URI images inlined at publish time and nothing remote.
 */
export const HTML_DOCUMENT_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "media-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "worker-src 'none'",
  "child-src 'none'",
  "manifest-src 'none'",
].join("; ");

export const HTML_DOCUMENT_CSP_META =
  `<meta http-equiv="Content-Security-Policy" content="${HTML_DOCUMENT_CSP}">`;

/** The only sandbox permission the live frame may use. */
export const HTML_FRAME_SANDBOX = "allow-scripts";

export const HTML_DOCUMENT_THEME_STYLE_ID = "paseo-html-theme";
export const HTML_DOCUMENT_BASE_STYLE_ID = "paseo-html-base";

/**
 * Base stylesheet. It deliberately sets no viewport height, no `min-height`,
 * and no `height:100%`: the frame measures content, so viewport-driven sizing
 * would create a shrink/resize feedback loop.
 */
export const HTML_DOCUMENT_BASE_CSS = [
  "html{background:var(--background);color:var(--foreground);font-family:var(--font-sans);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;scrollbar-width:none}",
  "html::-webkit-scrollbar{display:none}",
  "body{margin:0}",
  "code,kbd,pre,samp{font-family:var(--font-mono)}",
  ":where(:focus-visible){outline:2px solid var(--ring)}",
  ":focus-visible{outline-width:2px!important;outline-offset:-2px!important}",
  ":where(img:not(a[href] img,button img)){cursor:zoom-in}",
].join("");

export const HOST_CONTEXT_CHANGED_METHOD = "ui/notifications/host-context-changed";
export const SIZE_CHANGED_METHOD = "ui/notifications/size-changed";
export const READY_METHOD = "ui/notifications/ready";
export const READY_ACK_METHOD = "ui/notifications/ready-ack";
export const OPEN_LINK_METHOD = "ui/open-link";
export const OPEN_IMAGE_METHOD = "ui/open-image";

export function hostContextChangedMessage(theme: HtmlDocumentTheme): {
  jsonrpc: "2.0";
  method: typeof HOST_CONTEXT_CHANGED_METHOD;
  params: { theme: ThemeAppearance; styles: { variables: Readonly<Record<string, string>> } };
} {
  return {
    jsonrpc: "2.0",
    method: HOST_CONTEXT_CHANGED_METHOD,
    params: { theme: theme.appearance, styles: { variables: theme.variables } },
  };
}

export function sizeChangedMessage(height: number): {
  jsonrpc: "2.0";
  method: typeof SIZE_CHANGED_METHOD;
  params: { height: number };
} {
  return { jsonrpc: "2.0", method: SIZE_CHANGED_METHOD, params: { height } };
}

export function readyMessage(): {
  jsonrpc: "2.0";
  method: typeof READY_METHOD;
  params: { version: 1 };
} {
  return { jsonrpc: "2.0", method: READY_METHOD, params: { version: 1 } };
}

/**
 * The ready ack only completes the handshake. It grants the document no host
 * authority: theme, height, and link messages remain bounded and source
 * checked. Do not add privileged commands to this channel.
 */
export function readyAckMessage(): {
  jsonrpc: "2.0";
  method: typeof READY_ACK_METHOD;
  params: { version: 1 };
} {
  return { jsonrpc: "2.0", method: READY_ACK_METHOD, params: { version: 1 } };
}

/** One `:root{...}` rule with every token, sanitized and filtered by name. */
export function themeRootCss(theme: HtmlDocumentTheme): string {
  const declarations = Object.entries(theme.variables)
    .filter(([name, value]) => CSS_VARIABLE_NAME.test(name) && value.length > 0)
    .map(([name, value]) => `${name}:${value};`)
    .join("");
  return `:root{color-scheme:${theme.appearance};${declarations}}`;
}

const rootRule = themeRootCss;

/**
 * In-document runtime. It runs before page markup and:
 * - posts a ready notification when embedded;
 * - accepts only source-checked, bounded host theme messages and rewrites its
 *   own style element (no reload, no state loss);
 * - reports content height through `ui/notifications/size-changed`, measuring
 *   body content rather than the viewport;
 * - asks the parent to open http(s) links and data-URI images on trusted
 *   clicks. It does not handle or forward keyboard events. At top level
 *   (an exported file) it never prevents navigation.
 *
 * It grants no host authority and performs no key replay. Kept ES5-compatible
 * because report pages may run in older webviews.
 */
export const HTML_DOCUMENT_RUNTIME_SCRIPT = `(function(){var P=window.parent;function post(m){if(P!==window){P.postMessage(m,"*");}}post(${JSON.stringify(readyMessage())});function clean(v){if(typeof v!=="string")return "";v=v.replace(/[\\u0000-\\u001F\\u007F;{}<>\\\\]/g,"").trim();if(!v||/url\\s*\\(|expression\\s*\\(|@import|javascript:|vbscript:|data:/i.test(v))return "";return v.slice(0,512);}function apply(p){var v=p&&p.styles&&p.styles.variables;if(!v||typeof v!=="object")return;var css=":root{color-scheme:"+(p.theme==="light"?"light":"dark")+";";for(var k in v){if(!Object.prototype.hasOwnProperty.call(v,k))continue;if(!/^--[a-z0-9-]+$/.test(k))continue;var x=clean(v[k]);if(x)css+=k+":"+x+";";}css+="}";var s=document.getElementById(${JSON.stringify(HTML_DOCUMENT_THEME_STYLE_ID)});if(s){s.textContent=css;return;}if(!document.head)return;s=document.createElement("style");s.id=${JSON.stringify(HTML_DOCUMENT_THEME_STYLE_ID)};s.textContent=css;document.head.insertBefore(s,document.head.firstChild);}window.addEventListener("message",function(e){if(P===window||e.source!==P)return;var d=e.data;if(!d||d.jsonrpc!=="2.0")return;if(d.method===${JSON.stringify(HOST_CONTEXT_CHANGED_METHOD)}){apply(d.params);}else if(d.method===${JSON.stringify(READY_ACK_METHOD)}){/* handshake only; no authority */}},false);var last=-1,pending=0;function measure(){var h=0,b=document.body,d=document.documentElement,r;if(b){if(b.scrollHeight)h=Math.max(h,b.scrollHeight);if(b.getBoundingClientRect){r=b.getBoundingClientRect();if(r&&r.height)h=Math.max(h,r.height);}}if(d){if(d.scrollHeight>d.clientHeight)h=Math.max(h,d.scrollHeight);else if(d.getBoundingClientRect){r=d.getBoundingClientRect();if(r&&r.height)h=Math.max(h,r.height);}}return Math.ceil(h);}function send(){pending=0;var h=measure();if(h===last)return;last=h;post({jsonrpc:"2.0",method:${JSON.stringify(SIZE_CHANGED_METHOD)},params:{height:h}});}function schedule(){if(pending)return;var raf=window.requestAnimationFrame||function(f){return setTimeout(f,16);};pending=raf(send);}if(P!==window){if(window.ResizeObserver){var ro=new ResizeObserver(schedule);ro.observe(document.documentElement);document.addEventListener("DOMContentLoaded",function(){if(document.body)ro.observe(document.body);schedule();},false);}window.addEventListener("load",schedule,false);schedule();}var linkId=0;document.addEventListener("click",function(e){var path=e.composedPath?e.composedPath():[],i,t;for(i=0;i<path.length;i++){t=path[i];if(t&&t.tagName==="A"&&t.getAttribute&&t.getAttribute("href")){if(!e.isTrusted)return;var u;try{u=new URL(t.getAttribute("href"),document.baseURI);}catch(x){return;}if(u.protocol!=="http:"&&u.protocol!=="https:")return;if(u.href.split("#")[0]===location.href.split("#")[0])return;if(P!==window){e.preventDefault();e.stopPropagation();post({jsonrpc:"2.0",id:"paseo-link-"+(++linkId),method:${JSON.stringify(OPEN_LINK_METHOD)},params:{url:u.href,metaKey:e.metaKey===true,ctrlKey:e.ctrlKey===true}});}return;}}t=path.length?path[0]:e.target;if(!e.isTrusted||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||!t||t.tagName!=="IMG")return;if(t.closest&&t.closest("a[href],button"))return;var src=t.currentSrc||t.src||"";if(!/^data:image\\//i.test(src))return;post({jsonrpc:"2.0",method:${JSON.stringify(OPEN_IMAGE_METHOD)},params:{src:src,name:t.alt||t.title||""}});},true);})();`;

function themeStyleElementCss(theme: HtmlDocumentTheme | undefined): string {
  if (theme) return rootRule(theme);
  // Exported files follow the reader's OS setting and need no parent.
  const dark = defaultDocumentTheme("dark");
  const light = defaultDocumentTheme("light");
  return `${rootRule(dark)}@media (prefers-color-scheme: light){${rootRule(light)}}`;
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface DeclarationScan {
  end: number;
  terminated: boolean;
}

function skipQuoted(html: string, start: number): number {
  const quote = html[start]!;
  let index = start + 1;
  while (index < html.length) {
    if (html[index] === quote) return index + 1;
    index += 1;
  }
  return html.length;
}

/** Skips `<!...>` while honoring quoted values and a doctype internal subset. */
function skipDeclaration(html: string, start: number): DeclarationScan {
  let index = start;
  let subsetDepth = 0;
  while (index < html.length) {
    const char = html[index]!;
    if (html.startsWith("<!--", index)) {
      const end = html.indexOf("-->", index + 4);
      if (end === -1) return { end: html.length, terminated: false };
      index = end + 3;
      continue;
    }
    if (char === '"' || char === "'") {
      index = skipQuoted(html, index);
      continue;
    }
    if (char === "[") subsetDepth += 1;
    else if (char === "]") subsetDepth = Math.max(0, subsetDepth - 1);
    else if (char === ">" && subsetDepth === 0) return { end: index + 1, terminated: true };
    index += 1;
  }
  return { end: html.length, terminated: false };
}

/**
 * Returns the end offset of a well-formed doctype that is the document's first
 * non-whitespace, non-comment token, or null. A doctype buried in a comment,
 * raw text, or after content is not a leading doctype: in that case the builder
 * prefixes its own instead of trusting the later token.
 */
export function leadingDoctypeEnd(html: string): number | null {
  let index = html.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (;;) {
    while (index < html.length && /\s/.test(html[index]!)) index += 1;
    if (html.startsWith("<!--", index)) {
      const end = html.indexOf("-->", index + 4);
      if (end === -1) return null;
      index = end + 3;
      continue;
    }
    if (html.startsWith("<![CDATA[", index)) return null;
    break;
  }
  if (!/^<!doctype/i.test(html.slice(index, index + 9))) return null;
  const scan = skipDeclaration(html, index + 2);
  return scan.terminated ? scan.end : null;
}

export interface HtmlDocumentOptions {
  /** Untrusted report HTML. Kept byte-for-byte apart from the leading BOM. */
  html: string;
  /** Optional accessible document title when the page has none of its own. */
  title?: string;
  /** Host theme for the live frame; omit for an exported file. */
  theme?: HtmlDocumentTheme;
}

function bootstrapMarkup(options: HtmlDocumentOptions): string {
  const parts = [
    '<meta charset="utf-8">',
    HTML_DOCUMENT_CSP_META,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
  ];
  if (options.title) parts.push(`<title>${escapeHtmlText(options.title).slice(0, 200)}</title>`);
  parts.push(
    `<style id="${HTML_DOCUMENT_THEME_STYLE_ID}">${themeStyleElementCss(options.theme)}</style>`,
    `<style id="${HTML_DOCUMENT_BASE_STYLE_ID}">${HTML_DOCUMENT_BASE_CSS}</style>`,
    `<script>${HTML_DOCUMENT_RUNTIME_SCRIPT}</script>`,
  );
  return parts.join("");
}

/**
 * Builds a complete document with the CSP, theme, base CSS, and runtime before
 * the report markup.
 *
 * Placement rule: immediately after a leading doctype, else at the very start
 * with a fresh doctype. This never scans for `<head>`, so comments, raw-text
 * elements, templates, plaintext, attribute values, and foreignObject content
 * cannot capture the bootstrap.
 */
export function buildHtmlDocument(options: HtmlDocumentOptions): string {
  const raw = typeof options.html === "string" ? options.html : "";
  const html = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const block = bootstrapMarkup(options);
  const doctypeEnd = leadingDoctypeEnd(html);
  if (doctypeEnd !== null) {
    return `${html.slice(0, doctypeEnd)}<head>${block}</head>${html.slice(doctypeEnd)}`;
  }
  return `<!doctype html><head>${block}</head>${html}`;
}

/**
 * Exported `interactive.html`: CSP plus prefers-color-scheme light/dark tokens,
 * no parent required. Paseo's file preview may prepend its own CSP; both apply.
 */
export function buildInteractiveDocument(
  options: Omit<HtmlDocumentOptions, "theme"> & { theme?: HtmlDocumentTheme },
): string {
  return buildHtmlDocument(options);
}

/**
 * Live frame document. Starts with the host's current tokens to avoid a flash,
 * then follows `ui/notifications/host-context-changed` without reloading.
 */
export function buildLiveDocument(options: HtmlDocumentOptions): string {
  return buildHtmlDocument({ ...options, html: interactiveDocumentSource(options.html) });
}

/**
 * Remove our generated file bootstrap before building a live frame, including
 * older runtime revisions. The fixed prefix/style/runtime signature identifies it.
 * Otherwise its later default theme would override the host theme and its runtime
 * would run twice. The strict live builder always reinstalls CSP before markup;
 * this helper grants no trust to the returned page. Original storage is untouched.
 */
export function interactiveDocumentSource(document: string): string {
  const at = leadingDoctypeEnd(document);
  if (at === null || !document.startsWith(`<head><meta charset="utf-8">${HTML_DOCUMENT_CSP_META}`, at)) {
    return document;
  }
  const suffix = "</script></head>";
  const end = document.indexOf(suffix, at);
  if (end === -1 || end - at > 65_536) return document;
  const bootstrap = document.slice(at, end);
  if (
    !bootstrap.includes(`<style id="${HTML_DOCUMENT_THEME_STYLE_ID}">`) ||
    !bootstrap.includes(`<style id="${HTML_DOCUMENT_BASE_STYLE_ID}">`) ||
    !bootstrap.includes("<script>(function(){var P=window.parent;")
  ) return document;
  return document.slice(0, at) + document.slice(end + suffix.length);
}

export function documentByteLength(document: string): number {
  return utf8ByteLength(document);
}

/**
 * Enforces the 8 MiB `interactive.html` gate before the daemon writes a file.
 * Returns the document byte length on success.
 */
export function assertInteractiveDocumentBudget(document: string): number {
  const bytes = documentByteLength(document);
  if (bytes > MAX_INTERACTIVE_HTML_BYTES) {
    throw new RangeError(
      `interactive.html is ${bytes} bytes; the limit is ${MAX_INTERACTIVE_HTML_BYTES} bytes`,
    );
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Bound and source-checked message readers
// ---------------------------------------------------------------------------

export interface HostContextThemeMessage {
  readonly appearance: ThemeAppearance;
  readonly variables: Readonly<Record<string, string>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonRpcMethod(data: unknown): { jsonrpc: "2.0"; method: string; params: unknown } | null {
  if (!isRecord(data) || data.jsonrpc !== "2.0" || typeof data.method !== "string") return null;
  return { jsonrpc: "2.0", method: data.method, params: data.params };
}

/**
 * Validates a host theme message. Used by tests and by parent-side audits; the
 * document's embedded runtime performs the same checks in-document.
 */
export function readHostContextThemeMessage(data: unknown): HostContextThemeMessage | null {
  const message = jsonRpcMethod(data);
  if (!message || message.method !== HOST_CONTEXT_CHANGED_METHOD) return null;
  if (!isRecord(message.params) || !isRecord(message.params.styles)) return null;
  const variables = message.params.styles.variables;
  if (!isRecord(variables)) return null;
  const safe: Record<string, string> = {};
  for (const [name, value] of Object.entries(variables)) {
    if (!CSS_VARIABLE_NAME.test(name)) continue;
    const cleaned = sanitizeCssValue(value);
    if (cleaned) safe[name] = cleaned;
  }
  if (Object.keys(safe).length === 0) return null;
  return {
    appearance: message.params.theme === "light" ? "light" : "dark",
    variables: safe,
  };
}

/**
 * Reads a frame height. Accepts the JSON-RPC `ui/notifications/size-changed`
 * notification and the bounded legacy `{type:"paseo-html-render-height"}`
 * shape. Strings, NaN, infinities, zero, and negatives are rejected rather than
 * coerced. The result is capped to the UI range 80..2000.
 */
export function readSizeChangedMessage(data: unknown): number | undefined {
  let height: unknown;
  const message = jsonRpcMethod(data);
  if (message) {
    if (message.method !== SIZE_CHANGED_METHOD) return undefined;
    if (!isRecord(message.params)) return undefined;
    height = message.params.height;
  } else if (isRecord(data) && data.type === "paseo-html-render-height") {
    height = data.height;
  } else {
    return undefined;
  }
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) return undefined;
  return clampFrameHeight(height);
}

/** Strict ready notification. A page can forge this; it grants no authority. */
export function readReadyMessage(data: unknown): boolean {
  const message = jsonRpcMethod(data);
  if (!message || message.method !== READY_METHOD) return false;
  return isRecord(message.params) && message.params.version === 1;
}

export interface OpenLinkRequest {
  readonly id: string | number;
  readonly url: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
}

/** Absolute http(s) link requests only. Never javascript:, data:, or relative. */
export function readOpenLinkRequest(data: unknown): OpenLinkRequest | undefined {
  if (!isRecord(data) || data.jsonrpc !== "2.0" || data.method !== OPEN_LINK_METHOD) return undefined;
  const id = data.id;
  if (typeof id !== "string" && typeof id !== "number") return undefined;
  if (!isRecord(data.params)) return undefined;
  const url = data.params.url;
  if (typeof url !== "string" || url.length > 2_048 || !/^https?:\/\//i.test(url)) return undefined;
  return {
    id,
    url,
    metaKey: data.params.metaKey === true,
    ctrlKey: data.params.ctrlKey === true,
  };
}

export interface OpenImageRequest {
  readonly src: string;
  readonly name: string;
}

/**
 * Data-URI image requests only. Remote images are CSP-blocked, and accepting an
 * http(s) source here would let a page ask the client to fetch it.
 */
export function readOpenImageRequest(data: unknown): OpenImageRequest | undefined {
  if (!isRecord(data) || data.jsonrpc !== "2.0" || data.method !== OPEN_IMAGE_METHOD) return undefined;
  if (!isRecord(data.params)) return undefined;
  const src = data.params.src;
  if (
    typeof src !== "string" ||
    src.length > MAX_INTERACTIVE_HTML_BYTES ||
    !/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(src)
  ) {
    return undefined;
  }
  const name = typeof data.params.name === "string" ? data.params.name.trim().slice(0, 200) : "";
  return { src, name: name || "Image" };
}

// ---------------------------------------------------------------------------
// Frame selection, fallback, and responsive height
// ---------------------------------------------------------------------------

export type HtmlFramePlatform = "ios" | "android" | "web";
export type HtmlFrameRenderMode = "static" | "auto" | "iframe" | undefined;
export type HtmlFrameKind = "live" | "native" | "static";
export type HtmlFrameFailureReason = "timeout" | "load_error" | "unavailable";

export const HTML_FRAME_MIN_HEIGHT = RENDER_MIN_HEIGHT;
export const HTML_FRAME_MAX_HEIGHT = RENDER_MAX_HEIGHT;
export const HTML_FRAME_DEFAULT_WIDTH = PREVIEW_DEFAULT_WIDTH;
export const HTML_FRAME_READY_TIMEOUT_MS = 4_000;

export type MeasuredFrameHeight = readonly [width: number, height: number];

/** Only web/desktop may host the unsupported raw iframe. */
export function canRenderLiveHtmlFrame(platform: HtmlFramePlatform): boolean {
  return platform === "web";
}

/** Android may use the reviewed native adapter only when its host capability is ready. */
export function canRenderNativeHtmlFrame(
  platform: HtmlFramePlatform,
  nativeAvailable: boolean,
): boolean {
  return platform === "android" && nativeAvailable === true;
}

/**
 * `auto`/`iframe` mean live HTML on web, or the native adapter on Android when
 * its public host capability is actually ready. `static`, legacy absence, and
 * unavailable native hosts stay static.
 */
export function selectHtmlFrameKind(input: {
  platform: HtmlFramePlatform;
  renderMode: HtmlFrameRenderMode;
  nativeAvailable?: boolean;
}): HtmlFrameKind {
  if (canRenderLiveHtmlFrame(input.platform)) {
    return input.renderMode === "auto" || input.renderMode === "iframe" ? "live" : "static";
  }
  if (
    canRenderNativeHtmlFrame(input.platform, input.nativeAvailable === true) &&
    (input.renderMode === "auto" || input.renderMode === "iframe")
  ) {
    return "native";
  }
  return "static";
}

export function clampFrameHeight(height: number): number {
  if (typeof height !== "number" || !Number.isFinite(height)) return HTML_FRAME_MIN_HEIGHT;
  return Math.min(
    HTML_FRAME_MAX_HEIGHT,
    Math.max(HTML_FRAME_MIN_HEIGHT, Math.round(height)),
  );
}

/** Drops malformed entries, deduplicates widths, and sorts ascending. */
export function normalizeMeasuredHeights(
  heights: ReadonlyArray<MeasuredFrameHeight> | undefined,
): MeasuredFrameHeight[] {
  if (!Array.isArray(heights)) return [];
  const byWidth = new Map<number, number>();
  for (const entry of heights) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [width, height] = entry;
    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      continue;
    }
    byWidth.set(Math.round(width), Math.max(1, Math.round(height)));
  }
  return [...byWidth.entries()]
    .map(([width, height]) => [width, height] as const)
    .sort((left, right) => left[0] - right[0]);
}

/**
 * The taller of the nearest measured widths on each side of `width`. A
 * breakpoint between two measurements can make the page as tall as either.
 */
export function measuredHeightAt(
  heights: ReadonlyArray<MeasuredFrameHeight>,
  width: number,
): number | undefined {
  const sorted = normalizeMeasuredHeights(heights);
  if (sorted.length === 0) return undefined;
  const above = sorted.findIndex(([measuredWidth]) => measuredWidth >= width);
  const high = above === -1 ? sorted.length - 1 : above;
  const low = sorted[high]![0] === width ? high : Math.max(0, high - 1);
  return Math.max(sorted[low]![1], sorted[high]![1]);
}

export interface FrameHeightInput {
  /** T3-shaped requested frame height. Clamped to 80..2000. */
  requestedHeight: number;
  heights?: ReadonlyArray<MeasuredFrameHeight>;
  /** Current rendered width in CSS pixels. */
  width: number;
  /** Bounded height reported by the page. */
  contentHeight?: number;
}

/**
 * T3-compatible frame fitting:
 * - no measurements: the smaller of the requested height and the content;
 * - measurements: a cap of the requested height when the column measurement
 *   already exceeded it, otherwise the contract maximum, then the smaller of
 *   the cap and the content/nearest measurement.
 *
 * Every path is clamped to 80..2000. The wrapper must set an explicit height
 * and no viewport min-height, so this does not create a resize feedback loop.
 */
export function frameHeightFor(input: FrameHeightInput): number {
  const requested = clampFrameHeight(input.requestedHeight);
  const content =
    typeof input.contentHeight === "number" &&
    Number.isFinite(input.contentHeight) &&
    input.contentHeight > 0
      ? input.contentHeight
      : undefined;
  const heights = normalizeMeasuredHeights(input.heights);
  if (heights.length === 0) {
    return clampFrameHeight(Math.min(requested, content ?? requested));
  }
  const column = measuredHeightAt(heights, HTML_FRAME_DEFAULT_WIDTH) ?? requested;
  const cap = column > requested ? requested : HTML_FRAME_MAX_HEIGHT;
  const fallback = measuredHeightAt(heights, input.width) ?? requested;
  return clampFrameHeight(Math.min(cap, content ?? fallback));
}
