/**
 * Design tokens — a 1:1 port of Golden Nuggets' OKLCH tokens to sRGB hex.
 * Colors were converted precisely so the Expo build renders identically
 * to the approved web design. DO NOT tweak visually.
 */

export const darkTheme = {
  background: "#0B0F0E",
  foreground: "#F5F5F0",
  surface: "#141A18",
  surface2: "#1D2523",
  card: "#141A18",

  emerald: "#3EAA79",
  emeraldSoft: "rgba(62, 170, 121, 0.14)",
  emeraldGlow: "rgba(62, 170, 121, 0.45)",

  gold: "#D6BF8A",
  goldSoft: "rgba(214, 191, 138, 0.14)",

  muted: "#1D2523",
  mutedForeground: "#9AA5A2",

  border: "rgba(255,255,255,0.07)",
  hairline: "rgba(255,255,255,0.05)",
  input: "rgba(255,255,255,0.09)",

  black70: "rgba(0,0,0,0.70)",
  black55: "rgba(0,0,0,0.55)",
  white5: "rgba(255,255,255,0.05)",
  white8: "rgba(255,255,255,0.08)",
  white10: "rgba(255,255,255,0.10)",
  white25: "rgba(255,255,255,0.25)",

  destructive: "#D64545",
};

export const lightTheme = {
  background: "#FAFAFA", // Off-white
  foreground: "#11181C",
  surface: "#F1F3F5", // Subtle grey surface
  surface2: "#E9ECEF",
  card: "#FFFFFF",

  emerald: "#2D8A5E", // Darker for contrast
  emeraldSoft: "rgba(45, 138, 94, 0.12)",
  emeraldGlow: "rgba(45, 138, 94, 0.3)",

  gold: "#B59A5A",
  goldSoft: "rgba(181, 154, 90, 0.12)",

  muted: "#E9ECEF",
  mutedForeground: "#687076",

  border: "rgba(0,0,0,0.08)",
  hairline: "rgba(0,0,0,0.05)",
  input: "rgba(0,0,0,0.06)",

  black70: "rgba(0,0,0,0.70)", // Used mostly for overlays
  black55: "rgba(0,0,0,0.55)",
  white5: "rgba(0,0,0,0.03)", // Equivalent dark overlay over light backgrounds
  white8: "rgba(0,0,0,0.05)",
  white10: "rgba(0,0,0,0.08)",
  white25: "rgba(0,0,0,0.15)",

  destructive: "#D64545",
};

export type ThemeColors = typeof darkTheme;


export const radii = {
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 28,
  full: 999,
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  14: 56,
} as const;

export const typography = {
  serif: "InstrumentSerif_400Regular",
  serifItalic: "InstrumentSerif_400Regular_Italic",
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemi: "Inter_600SemiBold",
  sansBold: "Inter_700Bold",
} as const;

export const getShadows = (colors: ThemeColors) => ({
  elevated: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.7,
    shadowRadius: 40,
    elevation: 16,
  },
  soft: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
  glow: {
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 30,
    elevation: 12,
  },
} as const);

export type Colors = ThemeColors;
