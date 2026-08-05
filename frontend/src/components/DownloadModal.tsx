import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";

import { Testimony, api } from "@/src/api/client";
import { useDownloads } from "@/src/downloads/DownloadsContext";
import { useSettings } from "@/src/settings/SettingsContext";
import { useTheme } from "@/src/theme/ThemeProvider";
import { useToast } from "@/src/toast/ToastContext";
import { radii, spacing, typography } from "@/src/theme/tokens";

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

  const handleDownloadAudio = async () => {
    if (isAudioDownloaded) {
      toast.show("Audio is already downloaded", "info");
      return;
    }
    await downloads.start(testimony);
  };

  const handleDownloadPdf = async () => {
    if (isPdfDownloaded) {
      toast.show("PDF is already downloaded", "info");
      return;
    }
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
      api.track("pdf_share", testimony.id).catch(() => {});
      await Sharing.shareAsync(pdfLocalUri, {
        mimeType: "application/pdf",
        dialogTitle: `${testimony.title} - Official ${langLabel} Transcript PDF`,
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
            </View>

            {isAudioDownloaded ? (
              <View style={styles.completedBadge}>
                <Ionicons name="checkmark-circle" size={20} color={colors.emerald} />
                <Text style={styles.completedText}>Saved</Text>
              </View>
            ) : audioItem?.state === "downloading" ? (
              <ActivityIndicator color={colors.emerald} size="small" />
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

              {pdfItem?.state === "downloading" && (
                <View style={styles.progressWrap}>
                  <View style={[styles.progressBar, { width: `${pdfItem.progress_percentage}%` }]} />
                  <Text style={styles.progressText}>{pdfItem.progress_percentage}%</Text>
                </View>
              )}
            </View>

            {isPdfDownloaded ? (
              <Pressable
                style={styles.iconActionBtn}
                onPress={handleSharePdf}
                accessibilityRole="button"
                accessibilityLabel="Share PDF"
              >
                <Ionicons name="share-outline" size={18} color={colors.foreground} />
              </Pressable>
            ) : pdfItem?.state === "downloading" ? (
              <ActivityIndicator color={colors.gold || "#d4a017"} size="small" />
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
    title: { fontSize: 22, fontFamily: typography.serif, color: colors.foreground },
    subtitle: { fontSize: 13, fontFamily: typography.sans, color: colors.mutedForeground, marginTop: 2, marginBottom: spacing[4] },
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
    cardTitle: { fontSize: 15, fontFamily: typography.sansSemi, color: colors.foreground },
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
