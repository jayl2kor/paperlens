export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "purple";

export interface HighlightColorDef {
  name: HighlightColor;
  label: string;
  /** Tailwind class for solid dot/circle */
  dotClass: string;
  /** RGBA for semi-transparent overlay background */
  overlayBg: string;
  /** RGBA for overlay border */
  overlayBorder: string;
}

export const HIGHLIGHT_COLORS: HighlightColorDef[] = [
  {
    name: "yellow",
    label: "노랑",
    dotClass: "bg-yellow-400",
    overlayBg: "rgba(250, 204, 21, 0.35)",
    overlayBorder: "rgba(234, 179, 8, 0.7)",
  },
  {
    name: "green",
    label: "초록",
    dotClass: "bg-green-400",
    overlayBg: "rgba(74, 222, 128, 0.35)",
    overlayBorder: "rgba(34, 197, 94, 0.7)",
  },
  {
    name: "blue",
    label: "파랑",
    dotClass: "bg-blue-400",
    overlayBg: "rgba(96, 165, 250, 0.35)",
    overlayBorder: "rgba(59, 130, 246, 0.7)",
  },
  {
    name: "pink",
    label: "분홍",
    dotClass: "bg-pink-400",
    overlayBg: "rgba(244, 114, 182, 0.35)",
    overlayBorder: "rgba(236, 72, 153, 0.7)",
  },
  {
    name: "purple",
    label: "보라",
    dotClass: "bg-purple-400",
    overlayBg: "rgba(192, 132, 252, 0.35)",
    overlayBorder: "rgba(168, 85, 247, 0.7)",
  },
];

/** Lookup maps for quick access by color name */
export const OVERLAY_BG: Record<string, string> = Object.fromEntries(
  HIGHLIGHT_COLORS.map((c) => [c.name, c.overlayBg])
);

export const OVERLAY_BORDER: Record<string, string> = Object.fromEntries(
  HIGHLIGHT_COLORS.map((c) => [c.name, c.overlayBorder])
);

export const DOT_CLASS: Record<string, string> = Object.fromEntries(
  HIGHLIGHT_COLORS.map((c) => [c.name, c.dotClass])
);
