import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { Testimony } from "@/src/api/client";
import { SermonCard } from "./SermonCard";

interface ExpandableGroupProps {
  title: string;
  count: number;
  subtitle?: string;
  items: Testimony[];
}

export function ExpandableGroup({ title, count, subtitle = "Last Updated", items = [] }: ExpandableGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  const safeItems = Array.isArray(items) ? items : [];

  return (
    <View style={styles.container}>
      <Pressable onPress={() => setExpanded((v) => !v)} style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.meta}>{count} Sermons • {subtitle}</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.mutedForeground} />
      </Pressable>

      {expanded ? (
        <View style={styles.content}>
          {safeItems.map((sermon) => (
            <SermonCard key={sermon.id} sermon={sermon} horizontal />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  container: {
    backgroundColor: theme === "dark" ? "rgba(20, 26, 24, 0.7)" : "rgba(233, 236, 239, 0.7)",
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: spacing[3],
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing[4],
    justifyContent: "space-between",
  },
  title: {
    fontSize: 18,
    fontFamily: typography.serif,
    color: colors.foreground,
  },
  meta: {
    fontSize: 12,
    fontFamily: typography.sans,
    color: colors.gold,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
  },
});
