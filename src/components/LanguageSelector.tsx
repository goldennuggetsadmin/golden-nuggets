/**
 * LanguageSelector — Premium segmented control for selecting the global app language.
 *
 * Architecture:
 * - Reads/writes `appLanguage` from SettingsContext (the single source of truth).
 * - Adding future languages requires ONLY adding an entry to APP_LANGUAGES in SettingsContext.
 * - Renders a sliding indicator using Animated.Value for a smooth premium feel.
 *
 * Variants:
 * - "default"  — full-size segmented control used on the Search page.
 * - "compact"  — proportionally smaller version for tight spaces like the Home header.
 *   Both share identical design language: same colors, animation, border-radius, and behaviour.
 *   Only height, padding, and font-size differ.
 */
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, Text, ViewStyle } from "react-native";

import { APP_LANGUAGES, AppLanguage, useSettings } from "@/src/settings/SettingsContext";
import { radii, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";

// ─── Size token tables ────────────────────────────────────────────────────────

const SIZES = {
  default: {
    trackHeight: 44,
    trackBorderRadius: radii.xl,        // pill-shaped outer track
    pillBorderRadius: radii.xl,         // pill fills track snugly
    pillInset: 3,                       // gap between pill and track edge
    optionPaddingH: 20,                 // generous horizontal breathing room
    minOptionWidth: 80,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  compact: {
    trackHeight: 34,
    trackBorderRadius: radii.xl,
    pillBorderRadius: radii.xl,
    pillInset: 3,
    optionPaddingH: 14,
    minOptionWidth: 58,
    fontSize: 12,
    letterSpacing: 0.3,
  },
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  /** "default" = full-size (Search page). "compact" = header-sized (Home page). */
  variant?: "default" | "compact";
  testID?: string;
  style?: ViewStyle;
}

export function LanguageSelector({ variant = "default", testID, style }: Props) {
  const { appLanguage, setAppLanguage } = useSettings();
  const { colors, theme } = useTheme();
  const sz = SIZES[variant];
  const count = APP_LANGUAGES.length;
  const activeIndex = APP_LANGUAGES.findIndex((l) => l.code === appLanguage);

  // Single Animated.Value drives the pill — same spring config for both variants
  const slideAnim = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: activeIndex,
      useNativeDriver: false,
      tension: 280,
      friction: 28,
    }).start();
  }, [activeIndex, slideAnim]);

  return (
    <Animated.View
      testID={testID ?? `language-selector-${variant}`}
      style={[
        {
          flexDirection: "row",
          height: sz.trackHeight,
          borderRadius: sz.trackBorderRadius,
          borderWidth: 1,
          borderColor: colors.hairline,
          backgroundColor: colors.surface,
          overflow: "hidden",
          position: "relative",
          padding: sz.pillInset,
        },
        style,
      ]}
    >
      {/* Sliding emerald pill — inset by pillInset on all sides */}
      <Animated.View
        style={{
          position: "absolute",
          top: sz.pillInset,
          bottom: sz.pillInset,
          borderRadius: sz.pillBorderRadius,
          backgroundColor: colors.emerald,
          width: `${100 / count}%` as any,
          left: slideAnim.interpolate({
            inputRange: APP_LANGUAGES.map((_, i) => i),
            outputRange: APP_LANGUAGES.map((_, i) => `${(i * 100) / count}%`),
          }),
        }}
      />

      {APP_LANGUAGES.map((lang) => {
        const active = lang.code === appLanguage;
        return (
          <Pressable
            key={lang.code}
            testID={`lang-option-${lang.code}`}
            onPress={() => setAppLanguage(lang.code as AppLanguage)}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1,
              paddingHorizontal: sz.optionPaddingH,
              minWidth: sz.minOptionWidth,
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Select ${lang.label}`}
          >
            <Text
              style={{
                fontSize: sz.fontSize,
                fontFamily: typography.sansSemi,
                letterSpacing: sz.letterSpacing,
                color: active ? (theme === "dark" ? colors.background : "#fff") : colors.mutedForeground,
              }}
            >
              {lang.label}
            </Text>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}
