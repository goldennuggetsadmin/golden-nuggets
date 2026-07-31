import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { ContentType, getContentTypeChip } from "@/src/utils/sermonUtils";

interface SermonBadgeProps {
  type: ContentType;
  size?: "sm" | "md";
}

export function SermonBadge({ type, size = "md" }: SermonBadgeProps) {
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);
  const chip = getContentTypeChip(type);
  const isSm = size === "sm";

  return (
    <View style={[styles.badge, isSm && styles.badgeSm]}>
      <Text style={[styles.text, isSm && styles.textSm]}>
        {chip.label}
      </Text>
    </View>
  );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    backgroundColor: theme === "dark" ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.08)",
    borderColor: theme === "dark" ? "rgba(16, 185, 129, 0.3)" : "rgba(16, 185, 129, 0.2)",
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  badgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  text: {
    color: colors.emerald,
    fontSize: 10,
    fontFamily: typography.sansSemi,
    letterSpacing: 0.8,
  },
  textSm: {
    fontSize: 9,
    letterSpacing: 0.6,
  },
});
