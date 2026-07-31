import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "@/src/theme/ThemeProvider";

export function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const { colors } = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, [v]);
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
  return <Animated.View style={[{ backgroundColor: colors.surface2, borderRadius: 12, overflow: "hidden" }, style, { opacity }]} />;
}
