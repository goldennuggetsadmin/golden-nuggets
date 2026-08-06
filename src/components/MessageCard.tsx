import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { radii, spacing, typography, getShadows } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { Testimony } from "@/src/api/client";
import { formatMins, usePlayer } from "@/src/player/PlayerContext";
import { useToast } from "@/src/toast/ToastContext";

function useOpen() {
  const p = usePlayer();
  return async (m: Testimony) => {
    await p.selectSermon(m);
  };
}

function useEnqueue() {
  const p = usePlayer();
  const toast = useToast();
  return (m: Testimony) => { p.enqueue(m); toast.show("Added to queue", "success"); };
}

export function MessageCard({ m, size = "md" }: { m: Testimony; size?: "md" | "lg" }) {
  const open = useOpen();
  const enqueue = useEnqueue();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);
  const width = size === "lg" ? 190 : 156;

  return (
    <Pressable
      onPress={() => open(m)}
      onLongPress={() => enqueue(m)}
      delayLongPress={350}
      testID={`message-card-${m.id}`}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.92 : 1 }]}
    >
      <View style={[styles.artWrap, { width, height: width }]}>
        <Image source={require('@/assets/images/banner.png')} style={styles.art} contentFit="cover" cachePolicy="memory-disk" />
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.65)"]}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <Text style={styles.title} numberOfLines={1}>{m.title}</Text>
      <Text style={styles.meta} numberOfLines={1}>{m.speaker} · {formatMins(m.duration)}</Text>
    </Pressable>
  );
}

export function MessageRow({ m }: { m: Testimony }) {
  const open = useOpen();
  const enqueue = useEnqueue();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  return (
    <Pressable
      onPress={() => open(m)}
      onLongPress={() => enqueue(m)}
      delayLongPress={350}
      testID={`message-row-${m.id}`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.85 : 1 }]}
    >
      <Image source={require('@/assets/images/banner.png')} style={styles.rowArt} contentFit="cover" cachePolicy="memory-disk" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{m.title}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{m.speaker} · {formatMins(m.duration)}</Text>
      </View>
      <View style={styles.rowPlay}>
        <Ionicons name="play" size={20} color={colors.emerald} />
      </View>
    </Pressable>
  );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  artWrap: {
    overflow: "hidden",
    borderRadius: radii["2xl"],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  art: { width: "100%", height: "100%" },
  title: {
    marginTop: spacing[3],
    fontSize: 14,
    color: colors.foreground,
    fontFamily: typography.sansSemi,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.mutedForeground,
    fontFamily: typography.sans,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[2],
  },
  rowArt: {
    width: 56, height: 56, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.hairline,
  },
  rowTitle: {
    fontSize: 14, color: colors.foreground, fontFamily: typography.sansSemi,
  },
  rowMeta: {
    marginTop: 2, fontSize: 12, color: colors.mutedForeground, fontFamily: typography.sans,
  },
  rowPlay: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
  },
});
