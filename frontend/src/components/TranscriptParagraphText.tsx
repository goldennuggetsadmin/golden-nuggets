import React from "react";
import { StyleSheet, Text, TextProps } from "react-native";
import { typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";

export interface TranscriptParagraphTextProps extends TextProps {
  text: string;
  fontSize?: number;
}

export function TranscriptParagraphText({ text, fontSize = 16, style, ...props }: TranscriptParagraphTextProps) {
  const { theme } = useTheme();
  const textColor = theme === "dark" ? "rgba(245,245,240,0.92)" : "rgba(11,15,14,0.92)";

  return (
    <Text
      {...props}
      style={[
        {
          color: textColor,
          fontFamily: typography.sans,
          fontSize,
          lineHeight: Math.round(fontSize * 1.62),
          letterSpacing: 0.2,
        },
        style,
      ]}
    >
      {text}
    </Text>
  );
}
