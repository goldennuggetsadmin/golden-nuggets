import React, { useRef } from "react";
import {
  ActivityIndicator, Animated, PanResponder, Pressable, StyleSheet, Text, View,
} from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";

import { radii, spacing, typography, getShadows } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { usePlayer } from "@/src/player/PlayerContext";

export function MiniPlayer() {
  const p = usePlayer();
  const pathname = usePathname();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);
  const shadows = getShadows(colors);

  const handlePress = () => {
    if (!p.current) return;
    if (pathname === "/reading-mode") {
      router.push("/player");
    } else {
      router.push({ pathname: "/reading-mode", params: { id: p.current.id } });
    }
  };

  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const sheetOpacity = useRef(new Animated.Value(p.isSheetOpen ? 0 : 1)).current;

  React.useEffect(() => {
    Animated.timing(sheetOpacity, {
      toValue: p.isSheetOpen ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [p.isSheetOpen, sheetOpacity]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
          const newOpacity = Math.max(0.2, 1 - gestureState.dy / 150);
          opacity.setValue(newOpacity);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 50 || gestureState.vy > 0.4) {
          // Animate dismissal down smoothly (~220ms spring/timing)
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: 120,
              duration: 220,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            p.dismissMiniPlayer();
            translateY.setValue(0);
            opacity.setValue(1);
          });
        } else {
          // Snap back
          Animated.parallel([
            Animated.spring(translateY, {
              toValue: 0,
              friction: 8,
              tension: 40,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 1,
              duration: 150,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;

  if (!p.current || p.isDismissed) return null;

  const progress = p.duration ? Math.min(1, p.position / p.duration) : 0;

  const handleDismissButton = (e: any) => {
    e.stopPropagation();
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 120,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      p.dismissMiniPlayer();
      translateY.setValue(0);
      opacity.setValue(1);
    });
  };

  return (
    <Animated.View
      pointerEvents={p.isSheetOpen ? "none" : "auto"}
      style={{
        transform: [{ translateY }],
        opacity: Animated.multiply(opacity, sheetOpacity),
      }}
      {...panResponder.panHandlers}
    >
      <Pressable
        testID="mini-player"
        onPress={handlePress}
        style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.96 : 1 }, shadows.elevated]}
      >
        <BlurView intensity={40} tint={theme === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFillObject} />
        <View style={styles.inner}>
          <Image source={require('@/assets/images/banner.png')} style={styles.art} contentFit="cover" cachePolicy="memory-disk" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>{p.current.title}</Text>
            <Text style={styles.meta} numberOfLines={1}>{p.current.speaker}</Text>
          </View>
          
          {/* Play/Pause/Replay/Loading Button */}
          {p.isPreparing ? (
            <View style={styles.playBtn}>
              <ActivityIndicator size="small" color={theme === "dark" ? colors.background : "#fff"} />
            </View>
          ) : (
            <Pressable
              testID="mini-player-toggle"
              hitSlop={10}
              onPress={(e) => { e.stopPropagation(); p.toggle(); }}
              style={styles.playBtn}
            >
              <Ionicons
                name={p.isEnded ? "reload" : (p.playing ? "pause" : "play")}
                size={18}
                color={theme === "dark" ? colors.background : "#fff"}
              />
            </Pressable>
          )}

          {/* Accessible Close Button */}
          <Pressable
            testID="mini-player-close-btn"
            hitSlop={10}
            onPress={handleDismissButton}
            style={styles.closeBtn}
            accessibilityLabel="Dismiss Mini Player"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <View style={styles.trackBg}>
          <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
        </View>
      </Pressable>
    </Animated.View>
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
    gap: spacing[2],
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
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.emerald,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "transparent",
  },
  trackBg: {
    height: 2, backgroundColor: colors.white5,
  },
  trackFill: {
    height: 2, backgroundColor: colors.emerald,
  },
});

