import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { radii, spacing, typography, getShadows } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { Testimony } from "@/src/api/client";
import { getContentType } from "@/src/utils/sermonUtils";
import { SermonBadge } from "./SermonBadge";
import { usePlayer } from "@/src/player/PlayerContext";

interface SermonCardProps {
  sermon: Testimony;
  onPress?: () => void;
  horizontal?: boolean;
}

export function SermonCard({ sermon, onPress, horizontal = false }: SermonCardProps) {
  const p = usePlayer();
  const type = getContentType(sermon);
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);
  const shadows = getShadows(colors);

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (type === "transcript") {
      router.push({ pathname: "/reading-mode", params: { id: sermon.id } });
    } else {
      p.play(sermon);
      router.push("/player");
    }
  };

  if (horizontal) {
    return (
      <Pressable onPress={handlePress} style={styles.horizCard}>
        <View style={styles.horizArt}>
          <Image source={require('@/assets/images/banner.png')} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" />
        </View>
        <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
          <Text style={styles.title} numberOfLines={1}>{sermon.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {sermon.speaker || "William Marrion Branham"} {sermon.year ? `· ${sermon.year}` : ""} {sermon.state ? `· ${sermon.state}` : ""}
          </Text>
          <SermonBadge type={type} size="sm" />
        </View>
        <Ionicons name={type === "transcript" ? "document-text-outline" : "play-circle-outline"} size={24} color={colors.mutedForeground} />
      </Pressable>
    );
  }

  return (
    <Pressable onPress={handlePress} style={[styles.card, shadows.elevated]}>
      <View style={styles.artWrap}>
        <Image source={require('@/assets/images/banner.png')} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" />
      </View>
      <Text style={styles.title} numberOfLines={2}>{sermon.title}</Text>
      <Text style={styles.meta} numberOfLines={1}>
        {sermon.speaker || "William Marrion Branham"} {sermon.year ? `· ${sermon.year}` : ""}
      </Text>
      {sermon.state ? <Text style={styles.subMeta} numberOfLines={1}>{sermon.state}</Text> : null}
      <SermonBadge type={type} size="sm" />
    </Pressable>
  );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  card: {
    width: 160,
    marginRight: spacing[4],
  },
  artWrap: {
    width: 160,
    height: 160,
    borderRadius: radii.xl,
    overflow: "hidden",
    backgroundColor: colors.surface,
    marginBottom: spacing[2],
  },
  horizCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor: theme === "dark" ? "rgba(20, 26, 24, 0.6)" : "rgba(233, 236, 239, 0.6)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: spacing[3],
    gap: spacing[3],
  },
  horizArt: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  title: {
    fontSize: 15,
    fontFamily: typography.sansSemi,
    color: colors.foreground,
  },
  meta: {
    fontSize: 12,
    fontFamily: typography.sans,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  subMeta: {
    fontSize: 11,
    fontFamily: typography.sans,
    color: colors.mutedForeground,
    marginTop: 1,
  },
});
