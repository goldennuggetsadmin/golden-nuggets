import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Paragraph } from "../models/transcriptDocument";
import { TranscriptParagraphText } from "./TranscriptParagraphText";
import { radii, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

import { ENABLE_TRANSCRIPT_SYNC } from "../config/featureFlags";

export interface ReadingParagraphRowProps {
  item: Paragraph;
  fontSize: number;
  isActive: boolean;
  isHighlighted?: boolean;
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
  isHighlighted = false,
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

  // Active paragraph: opacity 1.0. Other paragraphs during playback: dimmed 0.38 when sync enabled. Static 1.0 when sync disabled.
  const targetOpacity = ENABLE_TRANSCRIPT_SYNC && isPlaying && isAutoFollowing ? (isActive ? 1 : 0.38) : 1;

  useEffect(() => {
    Animated.timing(opacityAnim, {
      toValue: targetOpacity,
      duration: 200,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [targetOpacity, opacityAnim]);

  // Animated highlight transition (250ms Ease-In-Out fade in/out)
  const highlightAnim = useRef(new Animated.Value(isHighlighted ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(highlightAnim, {
      toValue: isHighlighted ? 1 : 0,
      duration: 250,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [isHighlighted, highlightAnim]);

  // Interpolated animated background color for user highlight
  const animatedBgColor = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      "transparent",
      theme === "dark" ? "rgba(16, 185, 129, 0.16)" : "rgba(45, 138, 94, 0.12)",
    ],
  });

  // Interpolated animated border color for user highlight
  const animatedBorderColor = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      "transparent",
      theme === "dark" ? "rgba(16, 185, 129, 0.4)" : "rgba(45, 138, 94, 0.4)",
    ],
  });

  // Glow animation background interpolation (only when sync enabled)
  const syncGlowColor = ENABLE_TRANSCRIPT_SYNC && isTargetGlow
    ? glowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [
          "transparent",
          theme === "dark" ? "rgba(16, 185, 129, 0.22)" : "rgba(45, 138, 94, 0.22)",
        ],
      })
    : "transparent";

  // ISSUE 1: Do NOT render duplicate PDF page title/heading/subtitle blocks inside the transcript body
  const isHeader =
    item.blockType === "heading" ||
    item.blockType === "title" ||
    item.blockType === "subtitle" ||
    item.blockType === "location";

  if (isHeader) {
    return null;
  }

  return (
    <Pressable onPress={() => onPress(item)} style={{ marginVertical: spacing[2] }}>
      <Animated.View style={{ opacity: opacityAnim }}>
        <Animated.View
          style={[
            styles.rowContainer,
            {
              backgroundColor: ENABLE_TRANSCRIPT_SYNC && isTargetGlow ? syncGlowColor : animatedBgColor,
              borderColor: animatedBorderColor,
              borderWidth: 1,
            },
          ]}
        >
          {/* Highlight bar — stretches full height and fades in/out with animation */}
          <Animated.View
            style={[
              styles.highlightBar,
              {
                opacity: highlightAnim,
              },
            ]}
          />

          {/* Verse / Paragraph Number Gutter — 20-30% larger font size (16px) */}
          <View style={styles.numCol}>
            {item.paragraph_number != null ? (
              <Text style={styles.paraNum}>{item.paragraph_number}</Text>
            ) : null}
          </View>

          {/* Paragraph Text */}
          <View style={styles.textCol}>
            <TranscriptParagraphText
              text={item.text}
              fontSize={fontSize}
              style={[
                // ISSUE 3/4/9: Classification affects layout only — no bolding or green text
                item.blockType === "hymn" ? styles.hymnLayout : undefined,
              ]}
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
      paddingVertical: spacing[3],
      paddingHorizontal: spacing[2],
      borderRadius: radii.lg,
    },
    hymnLayout: {
      lineHeight: 28,
    },
    highlightBar: {
      width: 4,
      alignSelf: "stretch",
      borderRadius: 2,
      backgroundColor: colors.emerald,
      marginRight: spacing[2],
    },
    numCol: {
      width: 36,
      alignItems: "flex-start",
      paddingRight: 4,
    },
    // ISSUE 5: Paragraph numbers 20-30% larger (16px instead of 13px)
    paraNum: {
      fontSize: 16,
      fontFamily: typography.sansMedium,
      color: colors.mutedForeground,
      opacity: 0.55,
      lineHeight: 26,
    },
    textCol: {
      flex: 1,
    },
  });
