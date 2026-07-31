import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Paragraph } from "../models/transcriptDocument";
import { TranscriptParagraphText } from "./TranscriptParagraphText";
import { radii, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

export interface ReadingParagraphRowProps {
  item: Paragraph;
  fontSize: number;
  isActive: boolean;
  isAutoFollowing: boolean;
  isPlaying: boolean;
  isTargetGlow: boolean;
  glowAnim: Animated.Value;
  onPress: (item: Paragraph) => void;
}

export const ReadingParagraphRow = React.memo(function ReadingParagraphRow({
  item,
  fontSize,
  isActive,
  isAutoFollowing,
  isPlaying,
  isTargetGlow,
  glowAnim,
  onPress,
}: ReadingParagraphRowProps) {
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  // Animated opacity transition (150-250ms Ease-In-Out)
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const targetOpacity = isPlaying && isAutoFollowing ? (isActive ? 1 : 0.38) : 1;

  useEffect(() => {
    Animated.timing(opacityAnim, {
      toValue: targetOpacity,
      duration: 200,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [targetOpacity, opacityAnim]);

  // Glow animation background interpolation
  const backgroundColor = isTargetGlow
    ? glowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [
          "transparent",
          theme === "dark" ? "rgba(16, 185, 129, 0.22)" : "rgba(45, 138, 94, 0.22)",
        ],
      })
    : "transparent";

  return (
    <Pressable onPress={() => onPress(item)} style={{ marginVertical: spacing[2] }}>
      <Animated.View style={{ opacity: opacityAnim }}>
        <Animated.View
          style={[
            styles.rowContainer,
            { backgroundColor },
            item.isHighlighted && styles.highlightedRow,
          ]}
        >
        {/* Highlight bar — always reserves space so text never shifts horizontally */}
        <View style={item.isHighlighted ? styles.highlightBar : styles.highlightBarPlaceholder} />

        {/* Paragraph Number */}
        <View style={styles.numCol}>
          <Text style={styles.paraNum}>{item.paragraph_number}</Text>
        </View>

        {/* Active Reading Indicator */}
        {isActive && isPlaying ? (
          <View style={styles.activeIndicator}>
            <Ionicons name="volume-medium" size={14} color={colors.emerald} />
          </View>
        ) : null}

        {/* Paragraph Text */}
        <View style={styles.textCol}>
          <TranscriptParagraphText
            text={item.text}
            fontSize={fontSize}
            style={isActive ? styles.activeTextEmphasis : undefined}
          />
        </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
});

const getStyles = (colors: any, theme: string) =>
  StyleSheet.create({
    rowContainer: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: spacing[2],
      paddingLeft: 0,
      paddingRight: spacing[4],
      borderRadius: radii.md,
    },
    highlightedRow: {
      backgroundColor: theme === "dark" ? "rgba(16, 185, 129, 0.05)" : "rgba(45, 138, 94, 0.05)",
    },
    // Always 3px wide — transparent when not highlighted, coloured when highlighted
    highlightBar: {
      width: 3,
      height: "100%",
      minHeight: 24,
      borderRadius: 2,
      backgroundColor: colors.emerald,
      marginRight: spacing[2],
    },
    highlightBarPlaceholder: {
      width: 3,
      marginRight: spacing[2],
      // Transparent — only reserves space so text never shifts
    },
    numCol: {
      // Reference gutter: number visible, compact, enough for 3 digits
      width: 40,
      alignItems: "flex-end",
      paddingRight: 8,
    },
    paraNum: {
      // Same size as paragraph text, muted gray, top-aligned with first line
      // Stays muted even when paragraph is active
      fontSize: 16,
      fontFamily: typography.sans,
      color: colors.mutedForeground,
      opacity: 0.5,
      lineHeight: 22,
    },
    activeIndicator: {
      position: "absolute",
      left: 6,
      top: spacing[2] + 4,
    },
    textCol: {
      flex: 1,
    },
    activeTextEmphasis: {
      fontFamily: typography.sansSemi,
    },
  });

