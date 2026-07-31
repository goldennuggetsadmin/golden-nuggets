import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import { api, Testimony } from "@/src/api/client";
import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { formatMins, usePlayer } from "@/src/player/PlayerContext";
import { useDownloads, DownloadItem } from "@/src/downloads/DownloadsContext";
import { useToast } from "@/src/toast/ToastContext";
import { EmptyState } from "@/src/components/EmptyState";

const TAB_BAR_INSET = 140;

function bytesFmt(b: number) {
  if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b > 1e3) return `${(b / 1e3).toFixed(0)} KB`;
  return `${b} B`;
}

export default function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Testimony[]>([]);
  const dl = useDownloads();
  const player = usePlayer();
  const toast = useToast();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  useEffect(() => {
    api.listTestimonies({ limit: 200 }).then(setItems).catch(() => {});
  }, []);

  const registry = dl.items;

  const testimonyFor = (id: string) => items.find((x) => x.id === id);

  const openTestimony = async (id: string) => {
    const m = testimonyFor(id);
    if (!m) return;
    await player.play(m);
    router.push("/player");
  };

  const downloadedRaw = Object.values(registry).filter((r) => r.state === "downloaded");
  // Only consider it a "downloaded" item if we can actually resolve its testimony data
  const downloaded = downloadedRaw.filter((r) => testimonyFor(r.testimony_id) !== undefined);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + spacing[2], paddingBottom: TAB_BAR_INSET }}>
      <View style={{ paddingHorizontal: spacing[5], paddingBottom: spacing[4] }}>
        <Text style={styles.h1}>Downloads</Text>
        <Text style={styles.sub}>Take your messages anywhere, even offline.</Text>
      </View>

      {downloaded.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <EmptyState
            testID="downloads-empty-Downloaded"
            icon="download-outline"
            title="No downloads yet"
            message="Download sermons to listen offline anytime."
            actionLabel="Browse Library"
            onAction={() => router.push("/(tabs)/library")}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing[5], gap: spacing[3], paddingBottom: spacing[4] }}
          showsVerticalScrollIndicator={false}
        >
          {downloaded.map((r) => {
            const m = testimonyFor(r.testimony_id);
            if (!m) return null;
            return (
              <Pressable
                key={r.testimony_id}
                testID={`download-open-${m.id}`}
                onPress={() => openTestimony(m.id)}
                style={styles.doneRow}
              >
                {m.art_url ? (
                  <Image source={{ uri: m.art_url }} style={styles.doneArt} contentFit="cover" cachePolicy="memory-disk" />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={styles.doneTitle} numberOfLines={1}>{m.title}</Text>
                  <Text style={styles.doneMeta} numberOfLines={1}>
                    {m.speaker} · {formatMins(m.duration)} · {bytesFmt(r.bytes_written)}
                  </Text>
                </View>
                <Pressable
                  testID={`download-delete-${m.id}`}
                  style={styles.deleteBtn}
                  onPress={async (e) => {
                    e.stopPropagation();
                    await dl.remove(m.id);
                    toast.show("Deleted", "info");
                  }}
                >
                  <Ionicons name="trash" size={16} color={colors.mutedForeground} />
                </Pressable>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  h1: { fontSize: 32, color: colors.foreground, fontFamily: typography.serif, lineHeight: 34 },
  sub: { marginTop: spacing[2], fontSize: 14, color: colors.mutedForeground, fontFamily: typography.sans },
  doneRow: { flexDirection: "row", alignItems: "center", gap: spacing[3], borderRadius: radii.xl, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, padding: spacing[3] },
  doneArt: { width: 56, height: 56, borderRadius: radii.md },
  doneTitle: { fontSize: 14, color: colors.foreground, fontFamily: typography.sansSemi },
  doneMeta: { marginTop: 2, fontSize: 12, color: colors.mutedForeground, fontFamily: typography.sans },
  deleteBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
