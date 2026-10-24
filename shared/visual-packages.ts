/**
 * Common npm names to match against a global inventory, grouped as design hints.
 * This is a starting list, not an allowlist, dependency set or compatibility claim.
 */
export const COMMON_VISUAL_PACKAGES = {
  charts: ["echarts", "chart.js", "d3", "@observablehq/plot", "recharts"],
  motion: ["motion", "framer-motion", "animejs", "gsap"],
  diagrams: ["pele", "mermaid", "@xyflow/react", "cytoscape"],
  icons: ["lucide", "lucide-static", "lucide-react", "@phosphor-icons/web"],
  spatial: ["three"],
  "animation playback": ["lottie-web"],
  "component tooling": ["shadcn"],
} as const;

/** Compact text for agent instructions; no package code is imported or loaded. */
export const COMMON_VISUAL_PACKAGE_HINTS = Object.entries(COMMON_VISUAL_PACKAGES)
  .map(([purpose, names]) => `${purpose}: ${names.join(", ")}`)
  .join("; ");
