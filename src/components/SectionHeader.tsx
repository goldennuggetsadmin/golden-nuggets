import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";

export function SectionHeader({
  title, action, eyebrow,
}: { title: string; action?: React.ReactNode; eyebrow?: string }) {
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: spacing[5],
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.8,
    color: colors.gold,
    fontFamily: typography.sansSemi,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 22,
    lineHeight: 22,
    color: colors.foreground,
    fontFamily: typography.serif,
  },
});
