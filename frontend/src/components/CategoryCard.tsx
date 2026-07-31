import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";

type Tone = "emerald" | "gold" | "slate";

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  Healing: "heart",
  Faith: "sparkles",
  Prayer: "hand-right",
  Marriage: "people",
  Youth: "person",
  Salvation: "add",
  Prophecy: "flame",
  "Bible Study": "book",
  "Q & A": "help-circle",
  "Special Meetings": "calendar",
};

export function CategoryCard({
  name, tone = "slate", compact,
}: { name: string; tone?: Tone; compact?: boolean }) {
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  const TONE_COLORS: Record<Tone, { from: string; to: string; icon: string }> = {
    emerald: { from: "rgba(62,170,121,0.28)", to: colors.surface, icon: colors.emerald },
    gold: { from: "rgba(214,191,138,0.28)", to: colors.surface, icon: colors.gold },
    slate: { from: theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)", to: colors.surface, icon: theme === "dark" ? "rgba(245,245,240,0.85)" : "rgba(11,15,14,0.7)" },
  };

  const t = TONE_COLORS[tone];
  const iconName = ICON[name] ?? "sparkles";
  const aspect = compact ? 7 / 4 : 16 / 10;

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/(tabs)/search", params: { category: name } })}
      testID={`category-card-${name}`}
      style={({ pressed }) => [
        styles.wrap,
        { aspectRatio: aspect, opacity: pressed ? 0.92 : 1 },
      ]}
    >
      <LinearGradient
        colors={[t.from, t.to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.iconWrap}>
        <Ionicons name={iconName} size={16} color={t.icon} />
      </View>
      <Text style={styles.label} numberOfLines={1}>{name}</Text>
    </Pressable>
  );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  wrap: {
    borderRadius: radii["2xl"],
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing[4],
    justifyContent: "space-between",
    overflow: "hidden",
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: theme === "dark" ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.7)",
    borderWidth: 1, borderColor: colors.hairline,
  },
  label: {
    fontSize: 14, color: colors.foreground, fontFamily: typography.sansSemi,
  },
});
