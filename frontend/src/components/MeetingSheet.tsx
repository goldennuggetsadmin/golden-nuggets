import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Linking,
} from "react-native";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { BackendMeeting } from "@/src/api/adapters";

export function formatMeetingDate(start?: string, end?: string) {
  if (!start) return "";
  const formatDate = (ds: string) => {
    const d = new Date(ds);
    if (isNaN(d.getTime())) return ds;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };
  const s = formatDate(start);
  if (end && end !== start) {
    return `${s} – ${formatDate(end)}`;
  }
  return s;
}

export function MeetingSheet({
  visible,
  onClose,
  meeting,
}: {
  visible: boolean;
  onClose: () => void;
  meeting: BackendMeeting | null;
}) {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  if (!meeting) return null;

  const dateStr = formatMeetingDate(meeting.start_date, meeting.end_date);

  const openUrl = (url?: string) => {
    if (url) {
      Linking.openURL(url).catch(() => {});
    }
  };

  return (
    <Modal visible={visible} onRequestClose={onClose} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <BlurView
          tint={theme === "dark" ? "dark" : "light"}
          intensity={30}
          style={StyleSheet.absoluteFillObject}
        />
      </Pressable>

      <View style={[styles.sheet, { paddingTop: insets.top + spacing[4] }]} pointerEvents="box-none">
        <View style={[styles.card, { paddingBottom: insets.bottom || spacing[4] }]}>
          <View style={styles.handle} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {meeting.banner_url ? (
              <Image
                source={{ uri: meeting.banner_url }}
                style={styles.banner}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : null}

            <View style={styles.content}>
              <Text style={styles.title}>{meeting.title}</Text>

              <View style={styles.metaSection}>
                <Text style={styles.metaEyebrow}>Speaker</Text>
                <Text style={styles.metaValue}>{meeting.speaker || "Pastor Philip"}</Text>
              </View>

              {(dateStr || meeting.time) ? (
                <View style={styles.metaSectionRow}>
                  {dateStr ? (
                    <View style={styles.metaItem}>
                      <Text style={styles.metaEyebrow}>Date</Text>
                      <Text style={styles.metaValue}>{dateStr}</Text>
                    </View>
                  ) : null}
                  {meeting.time ? (
                    <View style={styles.metaItem}>
                      <Text style={styles.metaEyebrow}>Time</Text>
                      <Text style={styles.metaValue}>{meeting.time}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {meeting.location ? (
                <View style={styles.metaSection}>
                  <Text style={styles.metaEyebrow}>Venue</Text>
                  <Text style={styles.metaValue}>{meeting.location}</Text>
                </View>
              ) : null}

              {meeting.description ? (
                <View style={styles.metaSection}>
                  <Text style={styles.metaEyebrow}>Description</Text>
                  <Text style={styles.description}>{meeting.description}</Text>
                </View>
              ) : null}

              {(meeting.google_maps_url || meeting.youtube_url) ? (
                <View style={styles.actions}>
                  {meeting.google_maps_url ? (
                    <Pressable onPress={() => openUrl(meeting.google_maps_url)} style={styles.btn}>
                      <Ionicons name="map-outline" size={18} color={theme === "dark" ? colors.background : "#fff"} />
                      <Text style={styles.btnText}>Open in Maps</Text>
                    </Pressable>
                  ) : null}
                  
                  {meeting.youtube_url ? (
                    <Pressable onPress={() => openUrl(meeting.youtube_url)} style={[styles.btn, meeting.google_maps_url ? styles.btnSecondary : undefined]}>
                      <Ionicons name="logo-youtube" size={18} color={meeting.google_maps_url ? colors.foreground : (theme === "dark" ? colors.background : "#fff")} />
                      <Text style={meeting.google_maps_url ? styles.btnTextSecondary : styles.btnText}>Watch Live</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: any, theme: string) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme === "dark" ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.3)",
    },
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      top: 0,
      justifyContent: "flex-end",
    },
    card: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii["3xl"],
      borderTopRightRadius: radii["3xl"],
      borderWidth: 1,
      borderColor: colors.hairline,
      maxHeight: "90%",
    },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
      marginTop: spacing[3],
      marginBottom: spacing[2],
    },
    scrollContent: {
      paddingBottom: spacing[8],
    },
    banner: {
      height: 200,
      borderRadius: radii["2xl"],
      marginHorizontal: spacing[4],
      width: "auto",
      marginTop: spacing[2],
    },
    content: {
      paddingHorizontal: spacing[5],
      marginTop: spacing[5],
    },
    title: {
      fontSize: 28,
      color: colors.foreground,
      fontFamily: typography.serif,
      marginBottom: spacing[6],
    },
    metaSection: {
      marginBottom: spacing[5],
    },
    metaSectionRow: {
      flexDirection: "row",
      marginBottom: spacing[5],
      gap: spacing[6],
    },
    metaItem: {
      flex: 1,
    },
    metaEyebrow: {
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: colors.mutedForeground,
      fontFamily: typography.sansSemi,
      marginBottom: 4,
    },
    metaValue: {
      fontSize: 16,
      color: colors.foreground,
      fontFamily: typography.sans,
    },
    description: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.foreground,
      fontFamily: typography.sans,
    },
    actions: {
      marginTop: spacing[4],
      gap: spacing[3],
    },
    btn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing[2],
      backgroundColor: colors.emerald,
      paddingVertical: 14,
      borderRadius: radii.xl,
    },
    btnSecondary: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    btnText: {
      color: theme === "dark" ? colors.background : "#fff",
      fontFamily: typography.sansSemi,
      fontSize: 15,
    },
    btnTextSecondary: {
      color: colors.foreground,
      fontFamily: typography.sansSemi,
      fontSize: 15,
    },
  });
