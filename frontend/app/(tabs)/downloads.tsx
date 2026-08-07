import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { api, Testimony } from "@/src/api/client";
import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { formatMins, usePlayer } from "@/src/player/PlayerContext";
import { useDownloads, resolveLocalAudioUri, DownloadItem } from "@/src/downloads/DownloadsContext";
import { useToast } from "@/src/toast/ToastContext";
import { EmptyState } from "@/src/components/EmptyState";
import { formatSermonCode, getExportFilename, cleanSermonTitle } from "@/src/utils/sermonUtils";

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
    api.listTestimonies().then(setItems).catch(() => {});
  }, []);

  const testimonyFor = (id: string) =>
    items.find(
      (x) =>
        x.id === id ||
        x.verse === id ||
        x.date_code === id ||
        x.code === id ||
        (id && (x.id.includes(id) || (x.verse && x.verse.includes(id))))
    );

  const openAudioTestimony = async (id: string) => {
    const m = testimonyFor(id);
    if (!m) return;
    await player.play(m);
    router.push("/player");
  };

  const sharePdfFile = async (localUri: string, sermonId: string) => {
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        toast.show("Sharing unavailable", "error");
        return;
      }

      const exportFilename = getExportFilename(sermonId);
      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
      const targetUri = `${baseDir}${exportFilename}`;

      // Copy to cache directory with standardized export filename (65_1127E.pdf)
      await FileSystem.copyAsync({ from: localUri, to: targetUri }).catch(() => {});
      const fileToShare = (await FileSystem.getInfoAsync(targetUri)).exists ? targetUri : localUri;

      api.track("pdf_share", sermonId).catch(() => {});
      await Sharing.shareAsync(fileToShare, {
        mimeType: "application/pdf",
        dialogTitle: exportFilename,
        UTI: "com.adobe.pdf",
      });
    } catch (e) {
      toast.show("Failed to share PDF", "error");
    }
  };

  const shareAudioFile = async (item: DownloadItem) => {
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        toast.show("Sharing unavailable", "error");
        return;
      }

      const resolved = await resolveLocalAudioUri(item);
      console.log("local_uri", item.local_uri);
      console.log("exists", resolved.exists);
      console.log("filename", item.filename || `${item.testimony_id}.mp3`);
      console.log("directory", FileSystem.documentDirectory + "audio/");

      if (!resolved.exists) {
        console.log("Missing audio file at path:", item.local_uri, "Fallback path:", resolved.uri);
        toast.show("Audio file missing on disk", "error");
        return;
      }

      const codeFormatted = formatSermonCode(item.sermon_code || item.display_name || item.testimony_id);
      const exportFilename = `${codeFormatted}.mp3`;
      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
      const targetUri = `${baseDir}${exportFilename}`;

      let fileToShare = resolved.uri;
      try {
        await FileSystem.copyAsync({ from: resolved.uri, to: targetUri });
        const targetInfo = await FileSystem.getInfoAsync(targetUri);
        if (targetInfo.exists) {
          fileToShare = targetUri;
        }
      } catch (err) {
        console.log("Copy to cache failed, falling back to resolved.uri:", err);
        fileToShare = resolved.uri;
      }

      console.log("share target", fileToShare);

      await Sharing.shareAsync(fileToShare, {
        mimeType: "audio/mpeg",
        dialogTitle: exportFilename,
      });
    } catch (e) {
      console.log("Share audio error:", e);
      toast.show("Failed to share Audio", "error");
    }
  };

  const downloadedAudio = Object.values(dl.items).filter((r) => r.state === "downloaded" || r.state === "completed");
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
              const codeRaw = r.sermon_code || m?.id || "";
              const cleanCode = codeRaw ? codeRaw.replace(/_/g, "-") : "";
              const titleClean = cleanSermonTitle(m?.title || r.sermon_title, cleanCode);

              let title = cleanCode;
              if (cleanCode && titleClean) {
                title = `${cleanCode} ${titleClean}`;
              } else if (titleClean) {
                title = titleClean;
              }

              const speakerName = r.speaker || m?.speaker || "William Marion Branham";
              const rawYear = r.year || m?.year;
              const displayYear = rawYear ? (rawYear.toString().length === 2 ? `19${rawYear}` : rawYear) : undefined;
              const subTitle = displayYear ? `${speakerName} • ${displayYear}` : speakerName;
              const metaText = "MP3 • Offline";

              return (
                <Pressable
                  key={r.testimony_id}
                  testID={`download-open-${r.testimony_id}`}
                  onPress={() => openAudioTestimony(r.testimony_id)}
                  style={styles.horizCard}
                >
                  <View style={styles.horizArt}>
                    {m?.art_url ? (
                      <Image source={{ uri: m.art_url }} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" />
                    ) : (
                      <Image source={require('@/assets/images/banner.png')} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
                    <Text style={styles.cardSubtitle} numberOfLines={1}>{subTitle}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>{metaText}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: spacing[2], alignItems: "center" }}>
                    {r.local_uri && (
                      <Pressable
                        style={styles.actionIconBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          shareAudioFile(r);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Open and Share Audio"
                      >
                        <Ionicons name="share-outline" size={16} color={colors.foreground} />
                      </Pressable>
                    )}
                    <Pressable
                      testID={`download-delete-${r.testimony_id}`}
                      style={styles.deleteBtn}
                      onPress={async (e) => {
                        e.stopPropagation();
                        await dl.remove(r.testimony_id);
                        toast.show("Deleted audio download", "info");
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Delete Audio Download"
                    >
                      <Ionicons name="trash" size={16} color="#ff3b30" />
                    </Pressable>
                  </View>
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
            console.log("Transcript Render Object", JSON.stringify(r, null, 2));
            const m = testimonyFor(r.testimony_id);

            const codeRaw = r.sermon_code || m?.verse || m?.id || r.testimony_id || "";
            const sermonCode = codeRaw ? codeRaw.replace(/_/g, "-") : "";
            const rawTitle = m?.title || r.sermon_title || "";
            const titleClean = cleanSermonTitle(rawTitle, sermonCode);

            let title = sermonCode;
            if (sermonCode && titleClean) {
              title = `${sermonCode} ${titleClean}`;
            } else if (titleClean) {
              title = titleClean;
            } else if (rawTitle && !rawTitle.includes(sermonCode)) {
              title = `${sermonCode} ${rawTitle}`;
            }

            const speakerName = r.speaker || m?.speaker || "William Marion Branham";
            const rawYear = r.year || m?.year || "1965";
            const displayYear = rawYear ? (rawYear.toString().length === 2 ? `19${rawYear}` : rawYear) : "1965";
            const subTitle = `${speakerName} • ${displayYear}`;

            const isTe = r.language.toLowerCase() === "te" || r.language.toLowerCase() === "telugu";
            const pdfLangLabel = isTe ? "Telugu PDF" : "English PDF";
            const metaText = `${pdfLangLabel} • Offline`;

            console.log("Card Title Render Check - Transcript:", { title, sermon_title: r.sermon_title, m_title: m?.title });

            return (
              <View key={`${r.testimony_id}_${r.language}`} style={styles.horizCard}>
                <View style={styles.horizArt}>
                  {m?.art_url ? (
                    <Image source={{ uri: m.art_url }} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" />
                  ) : (
                    <Image source={require('@/assets/images/banner.png')} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
                  <Text style={styles.cardSubtitle} numberOfLines={1}>{subTitle}</Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>{metaText}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: spacing[2], alignItems: "center" }}>
                  {r.local_uri && (
                    <Pressable
                      style={styles.actionIconBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        sharePdfFile(r.local_uri!, r.display_name || r.sermon_code || r.testimony_id);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Open and Share PDF"
                    >
                      <Ionicons name="share-outline" size={16} color={colors.foreground} />
                    </Pressable>
                  )}
                  <Pressable
                    style={styles.deleteBtn}
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
  horizCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor: theme === "dark" ? "rgba(20, 26, 24, 0.6)" : "rgba(233, 236, 239, 0.6)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    gap: spacing[3],
  },
  horizArt: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  cardTitle: { fontSize: 15, fontFamily: typography.sansSemi, color: colors.foreground, marginBottom: 2 },
  cardSubtitle: { fontSize: 13, fontFamily: typography.sans, color: colors.mutedForeground, marginBottom: 2 },
  cardMeta: { fontSize: 12, fontFamily: typography.sans, color: colors.emerald },
  deleteBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,59,48,0.1)", alignItems: "center", justifyContent: "center" },
  actionIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" },
});
