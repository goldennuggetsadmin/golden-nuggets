/**
 * PickerSheet — reusable modal bottom sheet for pick-one-value settings and
 * simple actions. Prevents overlap with tab bar (uses full-screen modal).
 */
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";

export interface PickerOption<T = string | number> { value: T; label: string }

export function PickerSheet<T = string | number>({
  visible, onClose, title, options, value, onChange, testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: PickerOption<T>[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  return (
    <Modal visible={visible} onRequestClose={onClose} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <BlurView tint={theme === "dark" ? "dark" : "light"} intensity={30} style={StyleSheet.absoluteFillObject} />
      </Pressable>
      <View
        testID={testID}
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing[4] }]}
        pointerEvents="box-none"
      >
        <View style={styles.card}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <View style={{ marginTop: spacing[3] }}>
            {options.map((o, i) => {
              const active = o.value === value;
              return (
                <Pressable
                  key={String(o.value)}
                  testID={testID ? `${testID}-opt-${o.value}` : undefined}
                  onPress={() => { onChange(o.value); onClose(); }}
                  style={[styles.row, i < options.length - 1 && styles.rowBorder]}
                >
                  <Text style={[styles.label, active && { color: colors.emerald }]}>{o.label}</Text>
                  {active ? <Ionicons name="checkmark" size={20} color={colors.emerald} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: theme === "dark" ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.3)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing[3] },
  card: {
    backgroundColor: colors.surface, borderRadius: radii["2xl"],
    borderWidth: 1, borderColor: colors.hairline, padding: spacing[4],
  },
  handle: {
    alignSelf: "center", width: 36, height: 4, borderRadius: 2,
    backgroundColor: theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)", marginBottom: spacing[3],
  },
  title: { fontSize: 18, color: colors.foreground, fontFamily: typography.serif, textAlign: "center" },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  label: { fontSize: 15, color: colors.foreground, fontFamily: typography.sansMedium },
});
