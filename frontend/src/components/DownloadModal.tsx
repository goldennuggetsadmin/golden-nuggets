import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { Testimony, api } from "@/src/api/client";
import { useDownloads } from "@/src/downloads/DownloadsContext";
import { useSettings } from "@/src/settings/SettingsContext";
import { useTheme } from "@/src/theme/ThemeProvider";
import { useToast } from "@/src/toast/ToastContext";
import { radii, spacing, typography } from "@/src/theme/tokens";
import { getExportFilename } from "@/src/utils/sermonUtils";

interface DownloadModalProps {
  visible: boolean;
  testimony: Testimony | null;
  onClose: () => void;
}

export function DownloadModal({ visible, testimony, onClose }: DownloadModalProps) {
  const { colors, theme } = useTheme();
  const { appLanguage } = useSettings();
  const downloads = useDownloads();
  const toast = useToast();
  const [sharing, setSharing] = useState(false);

  if (!visible || !testimony) return null;

  console.log("API testimony", testimony);

  const isTelugu = appLanguage === "te";
  const langLabel = isTelugu ? "Telugu" : "English";

  const pdfUrl = isTelugu
    ? (testimony.telugu_pdf_url || testimony.pdf_telugu_url)
    : (testimony.english_pdf_url || testimony.pdf_english_url);

  const audioItem = downloads.items[testimony.id];
  const pdfItem = downloads.getTranscriptItem(testimony.id, appLanguage);

  const isAudioDownloaded = downloads.getLocalUri(testimony.id) !== undefined;
  const isPdfDownloaded = downloads.getLocalTranscriptUri(testimony.id, appLanguage) !== undefined;
  const pdfLocalUri = downloads.getLocalTranscriptUri(testimony.id, appLanguage);

  const isAudioDownloading = audioItem?.state === "downloading";
  const isPdfDownloading = pdfItem?.state === "downloading";

  const audioProgressPct = audioItem?.bytes_total
    ? Math.min(100, Math.max(0, Math.round((audioItem.bytes_written / audioItem.bytes_total) * 100)))
    : 0;

  const pdfProgressPct = pdfItem?.bytes_total
    ? Math.min(100, Math.max(0, Math.round((pdfItem.bytes_written / pdfItem.bytes_total) * 100)))
    : (pdfItem?.progress_percentage || 0);

  const handleDownloadAudio = async () => {
    if (isAudioDownloaded) {
      toast.show("Audio is already downloaded", "info");
      return;
    }
    if (isAudioDownloading) return;
    await downloads.start(testimony);
  };

  const handleDownloadPdf = async () => {
    if (isPdfDownloaded) {
      toast.show("PDF is already downloaded", "info");
      return;
    }
    if (isPdfDownloading) return;
    if (!pdfUrl) {
      toast.show(`No ${langLabel} PDF available for this sermon`, "error");
      return;
    }
    await downloads.startTranscriptDownload(testimony, appLanguage);
  };

  const handleSharePdf = async () => {
    if (!pdfLocalUri) {
      toast.show("Please download the PDF first", "error");
      return;
    }
    try {
      setSharing(true);
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        toast.show("Sharing is not available on this device", "error");
        return;
      }

      const exportFilename = getExportFilename(testimony.id);
      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
      const targetUri = `${baseDir}${exportFilename}`;

      await FileSystem.copyAsync({ from: pdfLocalUri, to: targetUri }).catch(() => {});
      const fileToShare = (await FileSystem.getInfoAsync(targetUri)).exists ? targetUri : pdfLocalUri;

      api.track("pdf_share", testimony.id).catch(() => {});
      await Sharing.shareAsync(fileToShare, {
        mimeType: "application/pdf",
        dialogTitle: exportFilename,
        UTI: "com.adobe.pdf",
      });
    } catch (e) {
      // Ignore
    } finally {
      setSharing(false);
    }
  };

  const styles = getStyles(colors, theme);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close download modal" />
      <View style={styles.sheetContainer}>
        <View style={styles.handle} />

        <Text style={styles.title} numberOfLines={1}>Download</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{testimony.title}</Text>

        <View style={styles.optionList}>
          {/* Option 1: Audio Download */}
          <View style={styles.card}>
            <View style={styles.cardIconWrap}>
              <Ionicons name="headset" size={24} color={colors.emerald} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Download Audio</Text>
              <Text style={[styles.cardSubtitle, { color: theme === "dark" ? "#9AA5A2" : "#687076" }]}>
                {isAudioDownloading
                  ? `Downloading... ${audioProgressPct}%`
                  : isAudioDownloaded
                  ? "Saved for offline listening"
                  : "High quality MP3 audio"}
              </Text>
            </View>

            {isAudioDownloaded ? (
              <View style={styles.completedBadge}>
                <Ionicons name="checkmark-circle" size={20} color={colors.emerald} />
                <Text style={styles.completedText}>Saved</Text>
              </View>
            ) : isAudioDownloading ? (
              <View style={styles.downloadingWrap}>
                <ActivityIndicator color={colors.emerald} size="small" />
                <Text style={styles.downloadingPctText}>{audioProgressPct}%</Text>
              </View>
            ) : audioItem?.state === "failed" ? (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: "#ff3b30" }]}
                onPress={handleDownloadAudio}
                accessibilityRole="button"
                accessibilityLabel="Retry Download Audio"
              >
                <Ionicons name="refresh-outline" size={18} color="#fff" />
              </Pressable>
            ) : (
              <Pressable
                style={styles.actionBtn}
                onPress={handleDownloadAudio}
                accessibilityRole="button"
                accessibilityLabel="Download Audio MP3"
              >
                <Ionicons name="download-outline" size={18} color="#fff" />
              </Pressable>
            )}

            {isAudioDownloading && (
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${audioProgressPct}%`, backgroundColor: colors.emerald }]} />
              </View>
            )}
          </View>

          {/* Option 2: Transcript PDF Download */}
          <View style={styles.card}>
            <View style={[styles.cardIconWrap, { backgroundColor: colors.goldSoft || "rgba(212,160,23,0.15)" }]}>
              <Ionicons name="document-text" size={24} color={colors.gold || "#d4a017"} />
            </View>

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.cardTitle}>Download Transcript</Text>
                <View style={styles.langBadge}>
                  <Text style={styles.langBadgeText}>{langLabel} PDF</Text>
                </View>
              </View>
              <Text style={[styles.cardSubtitle, { color: theme === "dark" ? "#9AA5A2" : "#687076" }]}>
                {isPdfDownloading
                  ? `Downloading... ${pdfProgressPct}%`
                  : isPdfDownloaded
                  ? "Saved for offline reading"
                  : "Official printable PDF"}
              </Text>
            </View>

            {isPdfDownloaded ? (
              <View style={styles.completedBadge}>
                <Ionicons name="checkmark-circle" size={20} color={colors.emerald} />
                <Text style={styles.completedText}>Saved</Text>
              </View>
            ) : isPdfDownloading ? (
              <View style={styles.downloadingWrap}>
                <ActivityIndicator color={colors.gold || "#d4a017"} size="small" />
                <Text style={[styles.downloadingPctText, { color: colors.gold || "#d4a017" }]}>{pdfProgressPct}%</Text>
              </View>
            ) : pdfItem?.state === "failed" ? (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: "#ff3b30" }]}
                onPress={handleDownloadPdf}
                accessibilityRole="button"
                accessibilityLabel="Retry Download Transcript PDF"
              >
                <Ionicons name="refresh-outline" size={18} color="#fff" />
              </Pressable>
            ) : (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.gold || "#d4a017" }]}
                onPress={handleDownloadPdf}
                accessibilityRole="button"
                accessibilityLabel="Download Transcript PDF"
              >
                <Ionicons name="download-outline" size={18} color="#fff" />
              </Pressable>
            )}

            {isPdfDownloading && (
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${pdfProgressPct}%`, backgroundColor: colors.gold || "#d4a017" }]} />
              </View>
            )}
          </View>
        </View>

        <Pressable
          style={styles.closeBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.closeBtnText}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const getStyles = (colors: any, theme: string) =>
  StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
    sheetContainer: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii["3xl"],
      borderTopRightRadius: radii["3xl"],
      paddingHorizontal: spacing[5],
      paddingTop: spacing[3],
      paddingBottom: spacing[8],
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.mutedForeground,
      opacity: 0.3,
      alignSelf: "center",
      marginBottom: spacing[3],
    },
    title: { fontSize: 22, fontFamily: typography.serif, color: colors.foreground || (theme === "dark" ? "#FFFFFF" : "#111827") },
    subtitle: { fontSize: 13, fontFamily: typography.sans, color: theme === "dark" ? "rgba(255, 255, 255, 0.65)" : "#6B7280", marginTop: 2, marginBottom: spacing[4] },
    optionList: { gap: spacing[3] },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing[3],
      padding: spacing[3],
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.hairline,
      backgroundColor: colors.background,
    },
    cardIconWrap: {
      width: 46,
      height: 46,
      borderRadius: radii.lg,
      backgroundColor: colors.emeraldSoft || "rgba(16,185,129,0.15)",
      alignItems: "center",
      justifyContent: "center",
    },
    cardTitle: { fontSize: 15, fontFamily: typography.sansSemi, color: colors.foreground || (theme === "dark" ? "#FFFFFF" : "#111827") },
    cardSubtitle: { fontSize: 12, fontFamily: typography.sans, color: theme === "dark" ? "rgba(255, 255, 255, 0.65)" : "#6B7280", marginTop: 2 },
    langBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radii.sm,
      backgroundColor: colors.emeraldSoft || "rgba(16,185,129,0.15)",
    },
    langBadgeText: { fontSize: 10, fontFamily: typography.sansSemi, color: colors.emerald },
    actionBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.emerald,
      alignItems: "center",
      justifyContent: "center",
    },
    completedBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
    completedText: { fontSize: 12, fontFamily: typography.sansSemi, color: colors.emerald },
    downloadingWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
    downloadingPctText: { fontSize: 13, fontFamily: typography.sansSemi, color: colors.emerald },
    progressBarBg: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 3,
      backgroundColor: colors.hairline,
    },
    progressBarFill: {
      height: "100%",
      borderRadius: 1.5,
    },
    iconActionBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      alignItems: "center",
      justifyContent: "center",
    },
    progressWrap: { marginTop: 6, height: 14, backgroundColor: colors.hairline, borderRadius: 7, overflow: "hidden", justifyContent: "center" },
    progressBar: { height: "100%", backgroundColor: colors.gold || "#d4a017", borderRadius: 7 },
    progressText: { position: "absolute", right: 6, fontSize: 9, fontFamily: typography.sansSemi, color: colors.foreground },
    closeBtn: {
      marginTop: spacing[5],
      height: 48,
      borderRadius: radii.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      alignItems: "center",
      justifyContent: "center",
    },
    closeBtnText: { fontSize: 15, fontFamily: typography.sansSemi, color: colors.foreground },
  });
