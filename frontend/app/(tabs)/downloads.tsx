import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";

import { api, Testimony } from "@/src/api/client";
import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { formatMins, usePlayer } from "@/src/player/PlayerContext";
import { useDownloads } from "@/src/downloads/DownloadsContext";
import { useToast } from "@/src/toast/ToastContext";
import { EmptyState } from "@/src/components/EmptyState";

const TAB_BAR_INSET = 140;

function bytesFmt(b: number) {
  if (!b || b <= 0) return "0 B";
  if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b > 1e3) return `${(b / 1e3).toFixed(0)} KB`;
  return `${b} B`;
}

type Mode = "audio" | "transcript";

export default function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("audio");
  const [items, setItems] = useState<Testimony[]>([]);
  const dl = useDownloads();
  const player = usePlayer();
  const toast = useToast();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  useEffect(() => {
    api.listTestimonies({ limit: 200 }).then(setItems).catch(() => {});
  }, []);

  const testimonyFor = (id: string) => items.find((x) => x.id === id);

  const openAudioTestimony = async (id: string) => {
    const m = testimonyFor(id);
    if (!m) return;
    await player.play(m);
    router.push("/player");
  };

  const sharePdfFile = async (localUri: string, title: string, lang: string, sermonId: string) => {
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        toast.show("Sharing unavailable", "error");
        return;
      }
      api.track("pdf_share", sermonId).catch(() => {});
      await Sharing.shareAsync(localUri, {
        mimeType: "application/pdf",
        dialogTitle: `${title} - Official ${lang.toUpperCase()} Transcript PDF`,
        UTI: "com.adobe.pdf",
      });
    } catch (e) {
      toast.show("Failed to share PDF", "error");
    }
  };

  const downloadedAudioRaw = Object.values(dl.items).filter((r) => r.state === "downloaded" || r.state === "completed");
  const downloadedAudio = downloadedAudioRaw.filter((r) => testimonyFor(r.testimony_id) !== undefined);

  const downloadedPdfRaw = Object.values(dl.transcriptItems).filter((r) => r.state === "downloaded" || r.state === "completed");

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + spacing[2], paddingBottom: TAB_BAR_INSET }}>
      <View style={{ paddingHorizontal: spacing[5], paddingBottom: spacing[3] }}>
        <Text style={styles.h1}>Downloads</Text>
        <Text style={styles.sub}>Take your messages and official transcripts anywhere offline.</Text>

        {/* Segmented Control Mode Switcher */}
        <View style={styles.segmentedWrap}>
          <Pressable
            style={[styles.segmentedBtn, mode === "audio" && styles.segmentedBtnActive]}
            onPress={() => setMode("audio")}
            accessibilityRole="button"
            accessibilityLabel="View Audio Downloads"
          >
            <Ionicons name="headset" size={15} color={mode === "audio" ? (theme === "dark" ? colors.background : "#fff") : colors.mutedForeground} />
            <Text style={[styles.segmentedText, mode === "audio" && styles.segmentedTextActive]}>
              Audio ({downloadedAudio.length})
            </Text>
          </Pressable>

          <Pressable
            style={[styles.segmentedBtn, mode === "transcript" && styles.segmentedBtnActive]}
            onPress={() => setMode("transcript")}
            accessibilityRole="button"
            accessibilityLabel="View Transcript PDF Downloads"
          >
            <Ionicons name="document-text" size={15} color={mode === "transcript" ? (theme === "dark" ? colors.background : "#fff") : colors.mutedForeground} />
            <Text style={[styles.segmentedText, mode === "transcript" && styles.segmentedTextActive]}>
              Transcripts ({downloadedPdfRaw.length})
            </Text>
          </Pressable>
        </View>
      </View>

      {mode === "audio" ? (
        downloadedAudio.length === 0 ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <EmptyState
              testID="downloads-empty-Audio"
              icon="headset-outline"
              title="No audio downloads"
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
            {downloadedAudio.map((r) => {
              const m = testimonyFor(r.testimony_id);
              if (!m) return null;
              return (
                <Pressable
                  key={r.testimony_id}
                  testID={`download-open-${m.id}`}
                  onPress={() => openAudioTestimony(m.id)}
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
                      toast.show("Deleted audio download", "info");
                    }}
                  >
                    <Ionicons name="trash" size={16} color={colors.mutedForeground} />
                  </Pressable>
                </Pressable>
              );
            })}
          </ScrollView>
        )
      ) : downloadedPdfRaw.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <EmptyState
            testID="downloads-empty-Transcript"
            icon="document-text-outline"
            title="No transcript downloads"
            message="Download official printable PDF transcripts to read offline anytime."
            actionLabel="Browse Sermons"
            onAction={() => router.push("/(tabs)/search")}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing[5], gap: spacing[3], paddingBottom: spacing[4] }}
          showsVerticalScrollIndicator={false}
        >
          {downloadedPdfRaw.map((r) => {
            const m = testimonyFor(r.testimony_id);
            const title = m?.title || r.filename;
            const speaker = m?.speaker || "William Marrion Branham";
            const langLabel = r.language.toUpperCase() === "TE" ? "Telugu" : "English";

            return (
              <View key={`${r.testimony_id}_${r.language}`} style={styles.doneRow}>
                <View style={[styles.doneArt, { backgroundColor: colors.goldSoft || "rgba(212,160,23,0.15)", alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="document-text" size={26} color={colors.gold || "#d4a017"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.doneTitle} numberOfLines={1}>{title}</Text>
                  <Text style={styles.doneMeta} numberOfLines={1}>
                    {speaker} · {langLabel} PDF · {bytesFmt(r.bytes_written)}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: spacing[2] }}>
                  {r.local_uri && (
                    <Pressable
                      style={styles.actionIconBtn}
                      onPress={() => sharePdfFile(r.local_uri!, title, langLabel, r.testimony_id)}
                      accessibilityRole="button"
                      accessibilityLabel="Open and Share PDF"
                    >
                      <Ionicons name="share-outline" size={16} color={colors.foreground} />
                    </Pressable>
                  )}
                  <Pressable
                    style={[styles.actionIconBtn, { backgroundColor: "rgba(255,59,48,0.1)" }]}
                    onPress={async () => {
                      await dl.removeTranscriptDownload(r.testimony_id, r.language);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Delete Transcript PDF"
                  >
                    <Ionicons name="trash" size={16} color="#ff3b30" />
                  </Pressable>
                </View>
              </View>
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
  segmentedWrap: { flexDirection: "row", gap: spacing[2], marginTop: spacing[4], padding: 4, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  segmentedBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 38, borderRadius: radii.lg },
  segmentedBtnActive: { backgroundColor: colors.emerald },
  segmentedText: { fontSize: 13, fontFamily: typography.sansSemi, color: colors.mutedForeground },
  segmentedTextActive: { color: theme === "dark" ? colors.background : "#fff" },
  doneRow: { flexDirection: "row", alignItems: "center", gap: spacing[3], borderRadius: radii.xl, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, padding: spacing[3] },
  doneArt: { width: 56, height: 56, borderRadius: radii.md },
  doneTitle: { fontSize: 14, color: colors.foreground, fontFamily: typography.sansSemi },
  doneMeta: { marginTop: 2, fontSize: 12, color: colors.mutedForeground, fontFamily: typography.sans },
  deleteBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  actionIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" },
});
