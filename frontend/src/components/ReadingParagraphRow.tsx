import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Paragraph } from "../models/transcriptDocument";
import { TranscriptParagraphText } from "./TranscriptParagraphText";
import { radii, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

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
  isHighlighted,
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

  // Active paragraph: opacity 1.0. Other paragraphs during playback: dimmed 0.38. When paused/stopped: opacity 1.0.
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
    <Pressable onPress={() => onPress(item)} style={{ marginVertical: spacing[3] }}>
      <Animated.View style={{ opacity: opacityAnim }}>
        <Animated.View
          style={[
            styles.rowContainer,
            { backgroundColor },
            isHighlighted && styles.highlightedRow,
          ]}
        >
          {/* Highlight bar — always reserves space so text never shifts horizontally */}
          <View style={isHighlighted ? styles.highlightBar : styles.highlightBarPlaceholder} />

          {/* Verse / Paragraph Number Gutter — 20-30% larger font size (16px) */}
          <View style={styles.numCol}>
            {item.paragraph_number != null ? (
              <Text style={styles.paraNum}>{item.paragraph_number}</Text>
            ) : null}
          </View>

          {/* ISSUE 6: Inline speaker/play icon removed completely */}

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
      paddingVertical: spacing[2],
      paddingHorizontal: 0,
      borderRadius: radii.md,
    },
    hymnLayout: {
      lineHeight: 28,
    },
    highlightedRow: {
      backgroundColor: theme === "dark" ? "rgba(16, 185, 129, 0.05)" : "rgba(45, 138, 94, 0.05)",
    },
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
    },
    numCol: {
      width: 40,
      alignItems: "flex-start",
      paddingRight: 6,
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
