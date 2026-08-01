import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { api, Testimony } from "@/src/api/client";
import { SermonCard } from "@/src/components/SermonCard";
import { usePlayer } from "@/src/player/PlayerContext";
import { getContentType } from "@/src/utils/sermonUtils";
import { useSettings } from "@/src/settings/SettingsContext";

export default function SeriesScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ title: string }>();
  const p = usePlayer();
  const { colors, theme } = useTheme();
  const { appLanguage } = useSettings();
  const styles = getStyles(colors, theme);

  const [sermons, setSermons] = useState<Testimony[]>([]);
  const [loading, setLoading] = useState(true);

  const seriesTitle = params.title || "Series";

  useEffect(() => {
    setLoading(true);
    const languageParam = appLanguage === "te" ? "Telugu" : "English";
    api.listTestimonies({ category: seriesTitle, language: languageParam })
      .then((data) => setSermons(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [seriesTitle, appLanguage]);

  const handleStartFromBeginning = () => {
    if (sermons.length === 0) return;
    p.selectSermon(sermons[0]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.topBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{seriesTitle}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing[5], paddingBottom: insets.bottom + 80 }}>
        {/* Series Header Card */}
        <View style={styles.headerCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.seriesEyebrow}>SERIES</Text>
            <Text style={styles.seriesTitle}>{seriesTitle}</Text>
            <Text style={styles.seriesMeta}>{sermons.length} Sermons</Text>
          </View>
          {sermons.length > 0 && (
            <Pressable onPress={handleStartFromBeginning} style={styles.startBtnSmall}>
              <Ionicons name="play" size={14} color={theme === "dark" ? colors.background : "#fff"} />
              <Text style={styles.startBtnSmallText}>Play All</Text>
            </Pressable>
          )}
        </View>

        {loading ? (
          <Text style={{ color: colors.mutedForeground, marginTop: 20 }}>Loading sermons…</Text>
        ) : (
          <View style={{ marginTop: spacing[4] }}>
            {sermons.map((item) => (
              <View key={item.id} style={{ marginBottom: spacing[3] }}>
                <SermonCard sermon={item} horizontal />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  topBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme === "dark" ? "rgba(20,26,24,0.7)" : "rgba(233,236,239,0.7)",
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: typography.sansSemi,
    color: colors.foreground,
  },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme === "dark" ? "rgba(16, 185, 129, 0.08)" : "rgba(45, 138, 94, 0.08)",
    borderColor: theme === "dark" ? "rgba(16, 185, 129, 0.25)" : "rgba(45, 138, 94, 0.25)",
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing[4],
  },
  seriesEyebrow: {
    fontSize: 10,
    letterSpacing: 1.8,
    fontFamily: typography.sansSemi,
    color: colors.emerald,
  },
  seriesTitle: {
    fontSize: 22,
    fontFamily: typography.serif,
    color: colors.foreground,
    marginTop: 2,
  },
  seriesMeta: {
    fontSize: 12,
    fontFamily: typography.sansMedium,
    color: colors.gold,
    marginTop: 2,
  },
  startBtnSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.emerald,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  startBtnSmallText: {
    fontSize: 12,
    fontFamily: typography.sansSemi,
    color: theme === "dark" ? colors.background : "#fff",
  },
});
