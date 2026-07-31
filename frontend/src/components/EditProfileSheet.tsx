/**
 * EditProfileSheet — bottom sheet for editing the user's display name.
 * Actions: Save · Clear Name · Cancel
 * Same animation style as PickerSheet (Modal + animationType="fade").
 */
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { useSettings } from "@/src/settings/SettingsContext";

export function EditProfileSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const { profile, updateProfile } = useSettings();
  const styles = getStyles(colors, theme);

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // Sync input to current profile name whenever sheet opens
  useEffect(() => {
    if (visible) {
      setName(profile?.name ?? "");
      setBusy(false);
    }
  }, [visible, profile?.name]);

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await updateProfile({ name: name.trim() || null });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await updateProfile({ name: null });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} onRequestClose={onClose} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <BlurView
          tint={theme === "dark" ? "dark" : "light"}
          intensity={30}
          style={StyleSheet.absoluteFillObject}
        />
      </Pressable>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing[4] }]}
        pointerEvents="box-none"
      >
        <View style={styles.card}>
          <View style={styles.handle} />
          <Text style={styles.title}>Edit Name</Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Enter your name"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
            autoCapitalize="words"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={[styles.btn, styles.btnGhost]}>
              <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={busy}
              style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.6 }]}
            >
              <Text style={[styles.btnText, { color: theme === "dark" ? colors.background : "#fff" }]}>
                Save
              </Text>
            </Pressable>
          </View>

          {/* Clear Name */}
          <Pressable
            onPress={handleClear}
            disabled={busy}
            style={[styles.btn, styles.btnClear, busy && { opacity: 0.6 }]}
          >
            <Text style={[styles.btnText, { color: "rgba(220,80,80,0.85)" }]}>Clear Name</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const getStyles = (colors: any, theme: string) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme === "dark" ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.3)",
    },
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing[3],
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii["2xl"],
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: spacing[4],
    },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
      marginBottom: spacing[3],
    },
    title: {
      fontSize: 18,
      color: colors.foreground,
      fontFamily: typography.serif,
      textAlign: "center",
    },
    input: {
      marginTop: spacing[3],
      borderRadius: 12,
      backgroundColor: colors.surface2 ?? colors.white5,
      borderWidth: 1,
      borderColor: colors.hairline,
      color: colors.foreground,
      fontFamily: typography.sans,
      fontSize: 15,
      paddingHorizontal: spacing[3],
      paddingVertical: 12,
    },
    actions: {
      flexDirection: "row",
      gap: spacing[2],
      marginTop: spacing[3],
    },
    btn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    btnPrimary: {
      backgroundColor: colors.emerald,
    },
    btnGhost: {
      backgroundColor: colors.white5,
    },
    btnClear: {
      backgroundColor: "transparent",
      marginTop: spacing[1],
    },
    btnText: {
      fontFamily: typography.sansSemi,
      fontSize: 14,
    },
  });
