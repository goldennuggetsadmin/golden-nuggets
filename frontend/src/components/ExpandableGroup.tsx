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
  items?: Testimony[];
  fetchItems?: () => Promise<Testimony[]>;
}

export function ExpandableGroup({ title, count, subtitle = "Last Updated", items = [], fetchItems }: ExpandableGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const [fetchedItems, setFetchedItems] = useState<Testimony[]>([]);
  const [loading, setLoading] = useState(false);
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  const displayItems = items && items.length > 0 ? items : fetchedItems;

  const handlePress = () => {
    const nextState = !expanded;
    setExpanded(nextState);
    if (nextState && displayItems.length === 0 && fetchItems && !loading) {
      setLoading(true);
      fetchItems()
        .then((res) => {
          if (Array.isArray(res)) setFetchedItems(res);
        })
        .catch((err) => console.error(`[ExpandableGroup] Error fetching items for ${title}:`, err))
        .finally(() => setLoading(false));
    }
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={handlePress} style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.meta}>{count} Sermons • {subtitle}</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.mutedForeground} />
      </Pressable>

      {expanded ? (
        <View style={styles.content}>
          {loading ? (
            <View style={{ paddingVertical: spacing[4], alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.emerald} />
              <Text style={{ color: colors.mutedForeground, marginTop: 8, fontSize: 12 }}>Loading sermons…</Text>
            </View>
          ) : displayItems.length === 0 ? (
            <Text style={{ color: colors.mutedForeground, paddingVertical: spacing[2], fontSize: 12 }}>No sermons found.</Text>
          ) : (
            displayItems.map((sermon) => (
              <View key={sermon.id} style={{ marginBottom: spacing[3] }}>
                <SermonCard sermon={sermon} horizontal />
              </View>
            ))
          )}
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
