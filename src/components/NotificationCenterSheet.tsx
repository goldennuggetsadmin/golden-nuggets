import React from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import {
  NotificationItem,
  NotificationType,
  resolveNotificationRoute,
} from "@/src/services/notificationService";
import { EmptyState } from "@/src/components/EmptyState";

export function NotificationCenterSheet({
  visible,
  onClose,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onSelectMeeting,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onSelectMeeting?: (meetingId: string) => void;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  const handlePressItem = (item: NotificationItem) => {
    onMarkAsRead(item.id);

    const routeRes = resolveNotificationRoute(item);
    if (routeRes.type === NotificationType.Sermon && routeRes.sermon_id) {
      onClose();
      router.push({ pathname: "/reading-mode", params: { id: routeRes.sermon_id } });
    } else if (routeRes.type === NotificationType.Meeting && routeRes.meeting_id) {
      onClose();
      if (onSelectMeeting) onSelectMeeting(routeRes.meeting_id);
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case NotificationType.Sermon:
        return "book-outline";
      case NotificationType.Meeting:
        return "calendar-outline";
      case NotificationType.Announcement:
        return "megaphone-outline";
      default:
        return "notifications-outline";
    }
  };

  const formatRelativeTime = (iso?: string | null) => {
    if (!iso) return "Just now";
    const date = new Date(iso);
    if (Number.isNaN(+date)) return "Just now";

    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return "Yesterday";
    if (diffDay < 7) return `${diffDay}d ago`;

    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <Modal visible={visible} onRequestClose={onClose} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <BlurView tint={theme === "dark" ? "dark" : "light"} intensity={30} style={StyleSheet.absoluteFillObject} />
      </Pressable>
      <View
        testID={testID || "notification-center-sheet"}
        style={[styles.sheet, { paddingTop: insets.top + spacing[6], paddingBottom: insets.bottom + spacing[4] }]}
        pointerEvents="box-none"
      >
        <View style={styles.card}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[2] }}>
              <Text style={styles.title}>Notification Center</Text>
              {hasUnread && <View style={styles.headerUnreadDot} />}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[3] }}>
              {hasUnread && (
                <Pressable onPress={onMarkAllAsRead} hitSlop={8} testID="notif-mark-all-btn">
                  <Text style={styles.markAllText}>Mark all read</Text>
                </Pressable>
              )}
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8} testID="notif-close-btn">
                <Ionicons name="close" size={20} color={colors.foreground} />
              </Pressable>
            </View>
          </View>

          {/* List */}
          {notifications.length === 0 ? (
            <View style={{ paddingVertical: spacing[8] }}>
              <EmptyState
                icon="notifications-off-outline"
                title="No Notifications"
                message="You're all caught up! New announcements and sermon updates will appear here."
              />
            </View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: spacing[2] }}
              renderItem={({ item, index }) => {
                const iconName = getNotificationIcon(item.type);
                const isLast = index === notifications.length - 1;

                return (
                  <Pressable
                    testID={`notif-item-${item.id}`}
                    onPress={() => handlePressItem(item)}
                    style={({ pressed }) => [
                      styles.itemCard,
                      !item.read && styles.itemUnreadBg,
                      pressed && { opacity: 0.8 },
                      !isLast && styles.itemBorder,
                    ]}
                  >
                    {/* Unread indicator */}
                    <View style={styles.indicatorCol}>
                      {!item.read ? (
                        <View style={styles.unreadDot} />
                      ) : (
                        <View style={{ width: 8 }} />
                      )}
                    </View>

                    {/* Icon */}
                    <View style={[styles.iconBox, !item.read && styles.iconBoxUnread]}>
                      <Ionicons
                        name={iconName as any}
                        size={18}
                        color={!item.read ? colors.emerald : colors.mutedForeground}
                      />
                    </View>

                    {/* Content */}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.titleRow}>
                        <Text style={[styles.itemTitle, !item.read && styles.itemTitleUnread]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.timeText}>{formatRelativeTime(item.delivered_at)}</Text>
                      </View>
                      <Text style={styles.itemBody} numberOfLines={3}>
                        {item.body}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: any, theme: string) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme === "dark" ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.35)",
    },
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      top: "15%",
      paddingHorizontal: spacing[3],
    },
    card: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radii["3xl"],
      borderWidth: 1,
      borderColor: colors.hairline,
      paddingHorizontal: spacing[4],
      paddingTop: spacing[3],
      paddingBottom: spacing[4],
    },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
      marginBottom: spacing[3],
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: spacing[3],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    title: {
      fontSize: 18,
      color: colors.foreground,
      fontFamily: typography.serif,
    },
    headerUnreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.emerald,
    },
    markAllText: {
      fontSize: 13,
      color: colors.emerald,
      fontFamily: typography.sansMedium,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
      alignItems: "center",
      justifyContent: "center",
    },
    itemCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: spacing[3],
      paddingHorizontal: spacing[2],
      borderRadius: radii.xl,
      gap: spacing[3],
    },
    itemUnreadBg: {
      backgroundColor: theme === "dark" ? "rgba(62, 170, 121, 0.05)" : "rgba(45, 138, 94, 0.04)",
    },
    itemBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    indicatorCol: {
      paddingTop: 6,
      alignItems: "center",
      justifyContent: "center",
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.emerald,
    },
    iconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
      alignItems: "center",
      justifyContent: "center",
    },
    iconBoxUnread: {
      backgroundColor: colors.emeraldSoft,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing[2],
      marginBottom: 2,
    },
    itemTitle: {
      flex: 1,
      fontSize: 14,
      color: colors.foreground,
      fontFamily: typography.sansMedium,
    },
    itemTitleUnread: {
      fontFamily: typography.sansBold || typography.sansMedium,
      color: colors.foreground,
    },
    timeText: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontFamily: typography.sans,
    },
    itemBody: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: typography.sans,
      lineHeight: 18,
    },
  });
