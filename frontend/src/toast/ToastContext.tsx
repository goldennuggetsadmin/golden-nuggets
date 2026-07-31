/**
 * ToastContext — lightweight bottom toast host. Replaces Alert.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";

type Kind = "info" | "success" | "error";
interface ToastState {
  show: (message: string, kind?: Kind) => void;
}
const Ctx = createContext<ToastState | null>(null);

interface Toast { id: number; message: string; kind: Kind }

function ToastCard({ toast, opacity, insets }: { toast: Toast; opacity: Animated.Value; insets: any }) {
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  const kindStyle = toast.kind === "success"
    ? styles.success
    : toast.kind === "error"
    ? styles.error
    : styles.info;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.host,
        { bottom: 120 + insets.bottom, opacity },
      ]}
    >
      <View style={[styles.card, kindStyle]}>
        <Text testID="toast-text" style={styles.text} numberOfLines={2}>{toast.message}</Text>
      </View>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, kind: Kind = "info") => {
    setToast({ id: Date.now(), message, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(({ finished }: { finished: boolean }) => {
        if (finished) setToast(null);
      });
    }, 2400);
    return () => clearTimeout(t);
  }, [toast, opacity]);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast ? <ToastCard toast={toast} opacity={opacity} insets={insets} /> : null}
    </Ctx.Provider>
  );
}

export function useToast(): ToastState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used within ToastProvider");
  return v;
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  host: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 10 },
  card: {
    maxWidth: 320, paddingHorizontal: spacing[4], paddingVertical: 12,
    borderRadius: radii.xl, borderWidth: 1, borderColor: colors.hairline,
    backgroundColor: theme === "dark" ? "rgba(20,26,24,0.95)" : "rgba(255,255,255,0.95)",
  },
  text: { color: colors.foreground, fontSize: 14, fontFamily: typography.sansMedium, textAlign: "center" },
  info: {},
  success: { borderColor: "rgba(62,170,121,0.6)" },
  error: { borderColor: "rgba(214,69,69,0.6)" },
});
