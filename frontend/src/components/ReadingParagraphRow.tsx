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

  const isHeader = item.blockType === "heading" || item.blockType === "title";
  const isSubtitle = item.blockType === "subtitle" || item.blockType === "location";

  if (isHeader || isSubtitle) {
    return (
      <Pressable onPress={() => onPress(item)} style={styles.headerBlockContainer}>
        <Text
          style={[
            isHeader ? styles.sectionHeadingText : styles.subtitleText,
            { fontSize: isHeader ? fontSize + 3 : fontSize - 1 },
          ]}
        >
          {item.text}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={() => onPress(item)} style={{ marginVertical: spacing[3] }}>
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

          {/* Verse / Paragraph Number Gutter */}
          <View style={styles.numCol}>
            {item.paragraph_number != null ? (
              <Text style={styles.paraNum}>{item.paragraph_number}</Text>
            ) : null}
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
              style={[
                isActive ? styles.activeTextEmphasis : undefined,
                item.blockType === "scripture" ? styles.scriptureText : undefined,
                item.blockType === "hymn" ? styles.hymnText : undefined,
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
    headerBlockContainer: {
      paddingVertical: spacing[4],
      alignItems: "center",
      justifyContent: "center",
    },
    sectionHeadingText: {
      fontFamily: typography.sansBold,
      color: colors.foreground,
      textAlign: "center",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    subtitleText: {
      fontFamily: typography.sansMedium,
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: spacing[1],
    },
    scriptureText: {
      fontStyle: "italic",
      color: colors.emerald,
    },
    hymnText: {
      fontFamily: typography.serif,
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
      width: 34,
      alignItems: "flex-start",
      paddingRight: 6,
    },
    paraNum: {
      fontSize: 13,
      fontFamily: typography.sansMedium,
      color: colors.mutedForeground,
      opacity: 0.5,
      lineHeight: 24,
    },
    activeIndicator: {
      position: "absolute",
      left: 2,
      top: spacing[2] + 4,
    },
    textCol: {
      flex: 1,
    },
    activeTextEmphasis: {
      fontFamily: typography.sansSemi,
    },
  });

