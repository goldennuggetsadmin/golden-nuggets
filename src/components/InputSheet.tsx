/**
 * InputSheet — reusable modal bottom sheet for text input (notes/highlights).
 */
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";

export function InputSheet({
  visible, onClose, title, placeholder, initial = "", submitLabel, onSubmit, testID, multiline = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  placeholder: string;
  initial?: string;
  submitLabel: string;
  onSubmit: (text: string) => void | Promise<void>;
  testID?: string;
  multiline?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  useEffect(() => { if (visible) setText(initial); }, [visible, initial]);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await onSubmit(text.trim()); onClose(); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} onRequestClose={onClose} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <BlurView tint={theme === "dark" ? "dark" : "light"} intensity={30} style={StyleSheet.absoluteFillObject} />
      </Pressable>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing[4] }]}
        pointerEvents="box-none"
      >
        <View style={styles.card} testID={testID}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <TextInput
            testID={`${testID}-input`}
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, multiline && { height: 120 }]}
            multiline={multiline}
            autoFocus
          />
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={[styles.btn, styles.cancel]}>
              <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
            </Pressable>
            <Pressable
              testID={`${testID}-submit`}
              onPress={submit}
              disabled={!text.trim() || busy}
              style={[styles.btn, styles.submit, (!text.trim() || busy) && { opacity: 0.5 }]}
            >
              <Text style={styles.btnText}>{submitLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  input: {
    marginTop: spacing[3],
    borderRadius: 12, backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.hairline,
    color: colors.foreground, fontFamily: typography.sans, fontSize: 15,
    paddingHorizontal: spacing[3], paddingVertical: 12, textAlignVertical: "top",
  },
  actions: { flexDirection: "row", gap: spacing[2], marginTop: spacing[3] },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cancel: { backgroundColor: colors.white5 },
  submit: { backgroundColor: colors.emerald },
  btnText: { color: theme === "dark" ? colors.background : "#fff", fontFamily: typography.sansSemi, fontSize: 14 },
});
