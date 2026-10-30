/**
 * The single source for the plugin's "when to render" policy.
 *
 * Harnesses disagree about what reaches the model. Claude, codex and opencode
 * read the tools/list descriptions, but pi hides the tools behind codemode and
 * keeps only the first line of the MCP instructions, hard-capped at 250
 * characters (pi's serverSummary takes the first line, then truncates). The
 * summary below therefore has to carry the whole decision on its own; the long
 * form and the tool descriptions are additive.
 *
 * A test enforces the one-line budget and the presence of every rule, so a
 * verbose edit fails here instead of silently truncating on pi.
 *
 * This module is client-safe: plain strings only, no node builtins and no paths.
 */
import { COMMON_VISUAL_PACKAGE_HINTS } from "./visual-packages.ts";

export const POLICY_SUMMARY_MAX_CHARS = 250;

export const POLICY_SUMMARY =
  "Render a visual card when a picture carries the answer: comparison, flow, architecture, multi-part status, numbers to scan, or a chart of real data. Otherwise reply in text. One card per turn, not every reply; never republish unchanged content.";

/** One npm inventory plus a small name list; the agent makes the design choice. */
const DESIGN_GUIDANCE =
  "When designing a visual, run npm ls --global --depth=0 --json once per session and match package names in its top-level dependencies against this common-package list: " +
  COMMON_VISUAL_PACKAGE_HINTS + ". " +
  "Use suitable installed matches and reuse the inventory; run npm root --global only when you need a package's location. " +
  "This list is a starting point, not an allowlist; other available packages are also options. " +
  "Use your own design judgment: let the content and audience drive the result, not this project's dependencies or examples. " +
  "If no installed match fits, use other available tools or plain HTML/CSS/SVG. " +
  "Reuse what is available; do not install packages unless asked.";

/**
 * Long form for harnesses that read the whole `instructions` payload. The first
 * line is exactly POLICY_SUMMARY so the summary projection never needs a second
 * copy, then the operating detail that would not fit in 250 characters.
 */
export const POLICY_INSTRUCTIONS =
  POLICY_SUMMARY +
  "\n" +
  "Reply in text for a single fact, one sentence, code, file contents or config.\n" +
  DESIGN_GUIDANCE + "\n" +
  "The live card is fluid (typically about 600-1100 CSS pixels); 728 is only the default preview width, not a card cap. " +
  "Fill the width with responsive, reflowing visuals. " +
  "html_preview returns a draft, script-disabled PNG screenshot and content height; it does not publish an answer. " +
  "When the visual is the answer, finish with html_render rather than saying a preview was published. " +
  "html_render publishes a visual card with a private byte-identical original HTML, a static preview, " +
  "an absolute interactive.html path for Paseo file preview, and an optional bounded native report. " +
  "Daemon captures keep JavaScript, network, remote assets, SVG, and file URLs blocked; workspace " +
  "raster images are inlined. Live scripts run only in the sandboxed live frame or file preview. " +
  "Never publish a second card in the same turn. Include [Open interactive report](<path>) from the tool result in your final reply.";

/**
 * The card is fluid in the reader's thread column. 728 is the historical preview
 * default, not a layout cap, so fixed narrow columns break on desktop.
 */
export const LAYOUT_DESCRIPTION =
  "The live card is fluid: it fills the reader's thread column, which is typically about 600-1100 CSS pixels wide, so 728 is only the default preview width and never a card cap. " +
  "Do not hard-code a max-width below 1000px. Use responsive CSS such as grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)) and stack columns below about 720px. " +
  "Keep outer padding small, and prefer one full-width visual, such as a vertical flow or timeline with callouts, over fixed side-by-side columns that leave each column narrow.";

/**
 * Charts were the weakest part of the old prose: the renderer had chart tokens
 * but never told the model how to choose a form. This brief copy rides on both
 * HTML inputs, because the model may write the chart before it reads
 * RENDER_DESCRIPTION.
 */
const CHART_RULES_BRIEF =
  "Chart fit: numbers over time use a line or area; comparing categories uses bars with the baseline at 0; " +
  "two numeric variables use a scatter; a distribution uses a dot or strip plot; a ranking uses sorted bars; " +
  "proportions use a stacked bar, pie only up to 4 slices. " +
  "Never a table of numbers when a chart answers it; label units and the axis range; " +
  "series colors come from --chart-1 through --chart-6. " +
  "No 3D, no gradients, no truncated axes, no dual axes. " +
  "Do not animate chart geometry on initial load: a static PNG can otherwise capture intermediate values. " +
  "Plot only numbers actually obtained from a tool, caption the source, and omit the chart rather than invent data.";

/**
 * The long copy keeps the same rules plus the comparison that a table is the
 * wrong answer when a chart carries it. Both copies are asserted by
 * tests/policy.test.ts so one cannot drift from the other.
 */
const CHART_RULES =
  "Charts follow a fit rule: numbers over time use a line or area; comparing categories uses bars with the baseline at 0; " +
  "two numeric variables use a scatter; a distribution uses a dot or strip plot; a ranking uses sorted bars; " +
  "proportions use a stacked bar, and a pie only up to 4 slices. " +
  "Never a table of numbers when a chart answers it: label units and the axis range, and take series colors from --chart-1 through --chart-6. " +
  "No 3D, no gradients, no truncated axes, no dual axes. " +
  "Do not animate chart geometry on initial load: a static PNG can otherwise capture intermediate values. " +
  "Plot only numbers actually obtained from a tool, caption the source, and omit the chart rather than invent data.";

/**
 * Interaction is a presentation choice, not a default. The same rules ride on
 * both HTML inputs so a live-looking page cannot quietly become the expected
 * shape of every answer.
 */
const INTERACTION_RULES =
  "Fit the form to the answer, and prefer one full-width visual over a grid of decorated boxes. " +
  "Use interaction only when it helps the reader; do not make every answer animated or interactive. " +
  "Motion must be optional and purposeful: a short reveal or state change that shows what changed, not decoration. " +
  "Inline scripts and styles are the only executable capabilities; remote libraries, fonts, images and network calls are blocked. " +
  "Static previews execute no JavaScript and request reduced motion; the default markup must stay readable and controls must be progressive enhancement. " +
  "Use native buttons and labels with visible focus and keyboard operation, and respect prefers-reduced-motion in both CSS and script logic. " +
  "Any continuous animation needs a visible pause or stop and must not run by default. " +
  "Local diagram, image and chart controls work inside the sandbox; never imply control of Paseo agents, workspaces or other host actions.";

export const HTML_DESCRIPTION =
  "A complete, self-contained HTML document. Lead with something visual: a diagram, chart, flow, " +
  "comparison, timeline or small interactive. Keep labels short; the page is not an essay. " +
  DESIGN_GUIDANCE + " " + LAYOUT_DESCRIPTION + " Any prose " +
  "on the page must be essential to reading the visual, because the explanation belongs in your reply " +
  "alongside the card. Inline <style> and inline SVG are supported. " +
  "Remote http(s) resources and local file:// paths are blocked. Workspace-local raster images " +
  "(PNG, JPEG, GIF, WebP, AVIF) referenced by img src, srcset, or CSS url() are inlined for previews " +
  "and published pages. Local SVG files are not inlined; inline SVG markup is supported. Remote resources stay blocked. " +
  INTERACTION_RULES + " " + CHART_RULES_BRIEF;

export const RENDER_DESCRIPTION =
  "Publish a visual HTML card when the answer has structure: a comparison, several findings, status, " +
  "steps, a flow, an architecture, or numbers a reader will scan. The card is the picture: a diagram, " +
  "chart, flow, timeline or interactive, not a styled essay or a wall of bullets. " +
  DESIGN_GUIDANCE + " " + LAYOUT_DESCRIPTION + " Skip it for a single " +
  "fact, one sentence, code, file contents or config, and anything the reader will copy as text. " +
  "Publish the finished page with html_render; a draft html_preview is not publication. " +
  "The response card appears after your native final reply when the turn completes, outside collapsed thinking and tools. " +
  "renderMode auto is the default: it renders live, sandboxed HTML on web and desktop and a static " +
  "PNG on native clients (a native report when report is supplied). In live mode inline scripts and styles " +
  "run; network resources, forms, local file URLs, and remote assets are blocked. Self-navigation remains possible. Inline SVG markup is supported; embed raster images as data: URIs or " +
  "reference workspace raster files, which are inlined. renderMode static selects native report views when supplied, otherwise PNG. Call html_preview " +
  "first and pass its suggestedHeight as height. Use theme CSS variables such as " +
  "var(--background), var(--foreground), var(--card), var(--border), var(--accent), var(--muted-foreground), " +
  "var(--primary), var(--radius), var(--font-sans), and var(--font-mono). The page sits on the thread " +
  "background; keep the outermost element transparent. The result includes an absolute interactive path. " +
  "In your final reply include exactly [Open interactive report](<path>) on its own line. Do not repeat " +
  "or describe the page in your reply. " +
  INTERACTION_RULES + " " + CHART_RULES;
