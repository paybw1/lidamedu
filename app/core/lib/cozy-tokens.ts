export type CozyAccent = "brown" | "terracotta" | "olive" | "sage";

export type CozyPalette = {
  primary: string;
  accent: string;
  soft: string;
  tint: string;
};

export const COZY_PALETTES: Record<CozyAccent, CozyPalette> = {
  brown: {
    primary: "#6B4226",
    accent: "#C17D52",
    soft: "#E8D5C0",
    tint: "#F5EFE6",
  },
  terracotta: {
    primary: "#9C4A2C",
    accent: "#D88A5E",
    soft: "#EBD0BD",
    tint: "#F6ECE2",
  },
  olive: {
    primary: "#4F5A2C",
    accent: "#94A267",
    soft: "#DCE2C2",
    tint: "#EFF1E2",
  },
  sage: {
    primary: "#3F5A4A",
    accent: "#7FA08E",
    soft: "#CFDDD2",
    tint: "#E6EDE6",
  },
};

export const COZY_BASE = "#FDFAF6";
export const COZY_INK = "#2B1F14";
export const COZY_INK_SOFT = "#6B5A48";
export const COZY_LINE = "rgba(107, 66, 38, 0.12)";

export const COZY_FONT_STACK =
  'Pretendard, "Noto Sans KR", -apple-system, system-ui, sans-serif';
