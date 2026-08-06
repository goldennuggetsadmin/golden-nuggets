import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";

export function EmptyState({
  icon = "sparkles-outline",
  title,
  message,
  actionLabel,
  onAction,
  testID,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  return (
    <View testID={testID} style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={28} color={colors.emerald} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable testID={`${testID}-action`} onPress={onAction} style={styles.action}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  wrap: {
    alignItems: "center", paddingHorizontal: spacing[6], paddingVertical: spacing[10], gap: spacing[3],
  },
  iconWrap: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.emeraldSoft,
  },
  title: { fontSize: 18, color: colors.foreground, fontFamily: typography.serif, marginTop: spacing[2] },
  message: { fontSize: 13, color: colors.mutedForeground, fontFamily: typography.sans, textAlign: "center", maxWidth: 260 },
  action: {
    marginTop: spacing[3], paddingHorizontal: spacing[4], paddingVertical: 12,
    borderRadius: radii.md, backgroundColor: colors.emerald,
  },
  actionText: { color: theme === "dark" ? colors.background : "#fff", fontFamily: typography.sansSemi, fontSize: 13 },
});
