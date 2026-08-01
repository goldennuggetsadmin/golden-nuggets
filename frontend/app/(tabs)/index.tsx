import React, { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, HomeFeed, Testimony } from "@/src/api/client";
import { BackendMeeting } from "@/src/api/adapters";
import { radii, spacing, typography } from "@/src/theme/tokens";
import { getShadows } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { SectionHeader } from "@/src/components/SectionHeader";
import { Skeleton } from "@/src/components/Skeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { formatDuration, usePlayer } from "@/src/player/PlayerContext";
import { useToast } from "@/src/toast/ToastContext";
import { SermonCard } from "@/src/components/SermonCard";
import { getContentType } from "@/src/utils/sermonUtils";
import { SermonBadge } from "@/src/components/SermonBadge";
import { useSettings, getDisplayName, getAvatarInitials } from "@/src/settings/SettingsContext";
import { MeetingSheet, formatMeetingDate } from "@/src/components/MeetingSheet";
import { notificationStore } from "@/src/utils/notificationStore";
import { NotificationItem } from "@/src/services/notificationService";
import { NotificationCenterSheet } from "@/src/components/NotificationCenterSheet";

const TAB_BAR_INSET = 100;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<BackendMeeting | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifSheetVisible, setNotifSheetVisible] = useState(false);
  const p = usePlayer();
  const toast = useToast();
  const { appLanguage, profile } = useSettings();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);
  const shadows = getShadows(colors);
  const displayName = getDisplayName(profile);
  const initials = getAvatarInitials(profile);

  const loadNotifications = useCallback(async (force = false) => {
    try {
      const items = await notificationStore.fetchAndSyncNotifications(appLanguage, force);
      setNotifications(items);
    } catch {}
  }, [appLanguage]);

  const load = useCallback(async (lang: string) => {
    // 1. Instant Cache Load (<20ms)
    const cached = await api.getCachedHome(lang);
    if (cached) {
      setFeed(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(false);

    // 2. Silent Background Refresh
    try {
      const f = await api.home(lang);
      setFeed(f);
      setError(false);
    } catch {
      if (!cached) setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(appLanguage);
      loadNotifications(false);
    }, [load, loadNotifications, appLanguage])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadNotifications(false);
      }
    });
    return () => sub.remove();
  }, [loadNotifications]);

  const handleMarkAsRead = async (id: string) => {
    const updated = await notificationStore.markAsRead(id);
    setNotifications(updated);
  };

  const handleMarkAllAsRead = async () => {
    const updated = await notificationStore.markAllAsRead();
    setNotifications(updated);
  };

  const unreadCount = notificationStore.getUnreadCount(notifications);
  const badgeText = notificationStore.getUnreadBadgeText(unreadCount);

  const openSermon = (m: Testimony) => {
    p.selectSermon(m);
  };

  if (loading) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingTop: insets.top + spacing[6], paddingBottom: TAB_BAR_INSET }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: spacing[5], flexDirection: "row", justifyContent: "space-between" }}>
          <Skeleton style={{ width: 200, height: 44, borderRadius: 22 }} />
          <Skeleton style={{ width: 100, height: 44, borderRadius: 22 }} />
        </View>
        <Skeleton style={{ marginTop: spacing[6], marginHorizontal: spacing[5], height: 208, borderRadius: radii["3xl"] }} />
        <View style={{ paddingHorizontal: spacing[5], marginTop: spacing[10], flexDirection: "row", gap: spacing[4] }}>
          <Skeleton style={{ width: 156, height: 200 }} />
          <Skeleton style={{ width: 156, height: 200 }} />
        </View>
      </ScrollView>
    );
  }

  if (error || !feed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center" }}>
        <EmptyState
          testID="home-error"
          icon="cloud-offline-outline"
          title="We couldn't load the feed"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => { setLoading(true); load(appLanguage); loadNotifications(true); }}
        />
      </View>
    );
  }

  const cont = feed.continue_listening;
  const contType = cont ? getContentType(cont) : "audio";
  const popularSermons = feed.popular || [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + spacing[2], paddingBottom: TAB_BAR_INSET }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(appLanguage); loadNotifications(true); }} tintColor={colors.emerald} />
      }
    >
      {/* 1. Greeting Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/(tabs)/more")} testID="home-avatar" style={{ flexDirection: "row", alignItems: "center", gap: spacing[3] }}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{displayName}</Text>
        </Pressable>
        <Pressable
          testID="home-notif-btn"
          style={styles.iconBtn}
          onPress={() => {
            loadNotifications(true);
            setNotifSheetVisible(true);
          }}
        >
          <Ionicons name="notifications-outline" size={20} color={colors.foreground} />
          {unreadCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>{badgeText}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* 2. Continue Where You Left Off — Always shown regardless of language */}
      {cont ? (
        <Pressable
          testID="continue-listening-card"
          onPress={() => openSermon(cont)}
          style={({ pressed }) => [styles.contWrap, { opacity: pressed ? 0.96 : 1 }, shadows.elevated]}
        >
          <View style={[StyleSheet.absoluteFillObject, { overflow: "hidden" }]}>
            <Image
              source={require('@/assets/images/banner.png')}
              style={[StyleSheet.absoluteFillObject, { width: "65%", left: "35%", opacity: 0.85 }]}
              contentFit="cover"
              contentPosition="right center"
              cachePolicy="memory-disk"
            />
          </View>
          <LinearGradient
            colors={["#181C1A", "rgba(24,28,26,0.95)", "rgba(24,28,26,0.50)", "rgba(24,28,26,0.15)"]}
            locations={[0, 0.45, 0.75, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.contInner}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.contEyebrow}>
                {contType === "transcript" ? "CONTINUE READING" : "CONTINUE LISTENING"}
              </Text>
              <Text style={styles.contTitle} numberOfLines={2}>{cont.title}</Text>
              <Text style={styles.contSpeaker}>{cont.speaker}</Text>
              <SermonBadge type={contType} size="sm" />

              {contType !== "transcript" ? (
                <View style={styles.progressRow}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(1, cont.progress || 0)) * 100}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{formatDuration(Math.max(0, (cont.duration || 0) * (1 - (cont.progress || 0))))} left</Text>
                </View>
              ) : null}
            </View>
            <View style={[styles.playFab, shadows.glow]}>
              <Ionicons name={contType === "transcript" ? "book" : "play"} size={24} color="#FFFFFF" style={contType === "transcript" ? undefined : { marginLeft: 2 }} />
            </View>
          </View>
        </Pressable>
      ) : null}

      {/* 3. Upcoming Meetings — Always shown, language-independent */}
      {feed.upcoming_meetings && feed.upcoming_meetings.length > 0 ? (
        <View style={{ marginTop: spacing[8] }}>
          <SectionHeader title="Upcoming Meetings" />
          <View style={{ paddingHorizontal: spacing[5], marginTop: spacing[3], gap: spacing[3] }}>
            {feed.upcoming_meetings.map((m) => (
              <View key={m.id} style={styles.meetingCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.meetingTime}>
                    {formatMeetingDate(m.start_date, m.end_date)}
                    {m.time ? ` · ${m.time}` : ""}
                  </Text>
                  <Text style={styles.meetingTitle}>{m.title}</Text>
                  <Text style={styles.meetingSpeaker}>{m.speaker || "Pastor Philip"}</Text>
                </View>
                <Pressable onPress={() => setSelectedMeeting(m)} style={styles.meetingBtn}>
                  <Text style={styles.meetingBtnText}>View Details</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* 4. Recently Added — filtered by selected language */}
      <View style={{ marginTop: spacing[8] }}>
        <SectionHeader
          title="Recently Added"
          action={
            <Pressable onPress={() => router.push("/(tabs)/library")} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }}>
              <Text style={styles.seeAll}>SEE ALL</Text>
            </Pressable>
          }
        />
        {(feed?.recently_added || []).length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing[5], paddingTop: spacing[4], paddingBottom: 4 }}>
            {(feed?.recently_added || []).map((m) => (
              <SermonCard key={m.id} sermon={m} />
            ))}
          </ScrollView>
        ) : (
          <EmptyState
            icon="musical-notes-outline"
            title="No sermons yet"
            message={`No recently added sermons in this language.`}
          />
        )}
      </View>

      {/* 5. Most Popular — filtered by selected language; hidden if empty */}
      {popularSermons.length > 0 ? (
        <View style={{ marginTop: spacing[8] }}>
          <SectionHeader title="Most Popular" />
          <View style={{ paddingHorizontal: spacing[5], marginTop: spacing[3] }}>
            {popularSermons.map((m) => (
              <SermonCard key={m.id} sermon={m} horizontal />
            ))}
          </View>
        </View>
      ) : null}

      <MeetingSheet
        visible={!!selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
        meeting={selectedMeeting}
      />

      <NotificationCenterSheet
        visible={notifSheetVisible}
        onClose={() => setNotifSheetVisible(false)}
        notifications={notifications}
        onMarkAsRead={handleMarkAsRead}
        onMarkAllAsRead={handleMarkAllAsRead}
        onSelectMeeting={(mId) => {
          const m = (feed?.upcoming_meetings || []).find((x) => x.id === mId);
          if (m) setSelectedMeeting(m);
        }}
      />
    </ScrollView>
  );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[5], paddingBottom: spacing[4] },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.emeraldSoft, borderWidth: 1, borderColor: "rgba(62,170,121,0.25)" },
  avatarText: { color: colors.emerald, fontFamily: typography.serif, fontSize: 18 },
  name: { fontSize: 15, color: colors.foreground, fontFamily: typography.sansSemi },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, position: "relative" },
  notifBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.emerald,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  notifBadgeText: {
    fontSize: 9,
    fontFamily: typography.sansBold || typography.sansSemi,
    color: "#FFFFFF",
    textAlign: "center",
  },
  contWrap: { marginHorizontal: spacing[5], marginTop: spacing[2], borderRadius: radii["3xl"], overflow: "hidden", backgroundColor: "#181C1A", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", minHeight: 190 },
  contInner: { flexDirection: "row", alignItems: "flex-end", gap: spacing[4], padding: spacing[4], paddingTop: 64 },
  contEyebrow: { fontSize: 10, letterSpacing: 1.8, color: "#F59E0B", fontFamily: typography.sansSemi, marginBottom: 6 },
  contTitle: { fontSize: 20, lineHeight: 24, color: "#FFFFFF", fontFamily: typography.serif },
  contSpeaker: { marginTop: 4, fontSize: 13, color: "rgba(255,255,255,0.75)", fontFamily: typography.sans, marginBottom: 4 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing[3], marginTop: spacing[3] },
  progressTrack: { flex: 1, height: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: colors.emerald },
  progressText: { fontSize: 11, color: "rgba(255,255,255,0.75)", fontFamily: typography.sansMedium, fontVariant: ["tabular-nums"] },
  playFab: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.emerald },
  seeAll: { fontSize: 10, letterSpacing: 1.8, color: colors.gold, fontFamily: typography.sansSemi, textTransform: "uppercase" },
  meetingCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: theme === "dark" ? "rgba(16, 185, 129, 0.25)" : "rgba(45, 138, 94, 0.25)",
    backgroundColor: theme === "dark" ? "rgba(16, 185, 129, 0.06)" : "rgba(45, 138, 94, 0.06)",
    padding: spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  meetingTime: { fontSize: 10, letterSpacing: 1.6, color: colors.emerald, fontFamily: typography.sansSemi },
  meetingTitle: { fontSize: 16, color: colors.foreground, fontFamily: typography.serif, marginTop: 2 },
  meetingSpeaker: { fontSize: 12, color: colors.mutedForeground, fontFamily: typography.sans, marginTop: 2 },
  meetingBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  meetingBtnText: {
    fontSize: 11,
    fontFamily: typography.sansSemi,
    color: colors.foreground,
  },
});
