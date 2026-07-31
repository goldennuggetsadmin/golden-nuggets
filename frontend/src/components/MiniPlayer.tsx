import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { radii, spacing, typography, getShadows } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { usePlayer } from "@/src/player/PlayerContext";

export function MiniPlayer() {
  const p = usePlayer();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);
  const shadows = getShadows(colors);

  if (!p.current) return null;
  const progress = p.duration ? Math.min(1, p.position / p.duration) : 0;

  return (
    <Pressable
      testID="mini-player"
      onPress={() => router.push("/player")}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.96 : 1 }, shadows.elevated]}
    >
      <BlurView intensity={40} tint={theme === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFillObject} />
      <View style={styles.inner}>
        <Image source={require('@/assets/images/banner.png')} style={styles.art} contentFit="cover" cachePolicy="memory-disk" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{p.current.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>{p.current.speaker}</Text>
        </View>
        <Pressable
          testID="mini-player-toggle"
          hitSlop={10}
          onPress={(e) => { e.stopPropagation(); p.toggle(); }}
          style={styles.playBtn}
        >
          <Ionicons name={p.playing ? "pause" : "play"} size={18} color={theme === "dark" ? colors.background : "#fff"} />
        </Pressable>
      </View>
      <View style={styles.trackBg}>
        <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
      </View>
    </Pressable>
  );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  wrap: {
    borderRadius: radii.xl,
    overflow: "hidden",
    backgroundColor: theme === "dark" ? "rgba(20,26,24,0.85)" : "rgba(250,250,250,0.85)",
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[2],
    paddingRight: spacing[3],
  },
  art: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface2,
  },
  title: {
    fontSize: 14, color: colors.foreground, fontFamily: typography.sansSemi,
  },
  meta: {
    fontSize: 11, color: colors.mutedForeground, fontFamily: typography.sans, marginTop: 1,
  },
  playBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.emerald,
  },
  trackBg: {
    height: 2, backgroundColor: colors.white5,
  },
  trackFill: {
    height: 2, backgroundColor: colors.emerald,
  },
});
