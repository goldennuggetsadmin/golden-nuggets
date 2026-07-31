/**
 * WelcomeSheet — first-launch onboarding sheet.
 *
 * Rules:
 * - Not dismissible by tapping outside or swipe (first launch).
 * - "Continue" with an empty field shakes the TextInput and shows an error.
 * - "Continue without a name" permanently completes onboarding (name = null).
 * - Sheet closes with a 200 ms animated delay after completing onboarding.
 * - Same animation style as PickerSheet / InputSheet (Modal + animationType="fade").
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
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

export function WelcomeSheet({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const { updateProfile } = useSettings();
  const styles = getStyles(colors, theme);

  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Shake animation for the text field
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Reset local state when sheet becomes visible
  useEffect(() => {
    if (visible) {
      setName("");
      setError("");
      setBusy(false);
    }
  }, [visible]);

  const shake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8,  duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,  duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,  duration: 30, useNativeDriver: true }),
    ]).start();
  };

  const closeAfterDelay = (fn: () => void) => {
    setBusy(true);
    setTimeout(() => {
      fn();
      onDone();
    }, 200);
  };

  const handleContinue = async () => {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter your name");
      shake();
      return;
    }
    setError("");
    closeAfterDelay(() => {
      updateProfile({ name: trimmed, hasCompletedOnboarding: true });
    });
  };

  const handleSkip = () => {
    if (busy) return;
    setError("");
    closeAfterDelay(() => {
      updateProfile({ name: null, hasCompletedOnboarding: true });
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Prevent hardware-back from dismissing on Android without completing
      onRequestClose={() => {}}
    >
      {/* Non-interactive backdrop — cannot dismiss by tapping */}
      <View style={styles.backdrop}>
        <BlurView
          tint={theme === "dark" ? "dark" : "light"}
          intensity={30}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing[4] }]}
        pointerEvents="box-none"
      >
        <View style={styles.card}>
          <View style={styles.handle} />

          {/* Avatar placeholder */}
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>G</Text>
            </View>
          </View>

          <Text style={styles.title}>Welcome to Golden Nuggets</Text>
          <Text style={styles.subtitle}>What should we call you?</Text>

          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            <TextInput
              value={name}
              onChangeText={(t) => { setName(t); if (error) setError(""); }}
              placeholder="Enter your name"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                error ? { borderColor: "rgba(220,80,80,0.6)" } : undefined,
              ]}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleContinue}
            />
          </Animated.View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            onPress={handleContinue}
            style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.6 }]}
            disabled={busy}
          >
            <Text style={[styles.btnText, { color: theme === "dark" ? colors.background : "#fff" }]}>
              Continue
            </Text>
          </Pressable>

          <Pressable
            onPress={handleSkip}
            style={[styles.btn, styles.btnGhost, busy && { opacity: 0.6 }]}
            disabled={busy}
          >
            <Text style={[styles.btnText, { color: colors.mutedForeground }]}>
              Continue without a name
            </Text>
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
      padding: spacing[5],
    },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
      marginBottom: spacing[4],
    },
    avatarRow: {
      alignItems: "center",
      marginBottom: spacing[4],
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.emeraldSoft,
      borderWidth: 1,
      borderColor: "rgba(62,170,121,0.25)",
    },
    avatarText: {
      color: colors.emerald,
      fontFamily: typography.serif,
      fontSize: 28,
    },
    title: {
      fontSize: 20,
      color: colors.foreground,
      fontFamily: typography.serif,
      textAlign: "center",
    },
    subtitle: {
      marginTop: spacing[1],
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: typography.sans,
      textAlign: "center",
      marginBottom: spacing[4],
    },
    input: {
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
    errorText: {
      marginTop: spacing[1],
      fontSize: 12,
      color: "rgba(220,80,80,0.9)",
      fontFamily: typography.sans,
      paddingHorizontal: 4,
    },
    btn: {
      marginTop: spacing[3],
      paddingVertical: 13,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    btnPrimary: {
      backgroundColor: colors.emerald,
    },
    btnGhost: {
      backgroundColor: "transparent",
    },
    btnText: {
      fontFamily: typography.sansSemi,
      fontSize: 15,
    },
  });
