import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { LogBox, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { useAppFonts } from "@/src/theme/fonts";
import { PlayerProvider } from "@/src/player/PlayerContext";
import { SettingsProvider, useSettings } from "@/src/settings/SettingsContext";
import { DownloadsProvider } from "@/src/downloads/DownloadsContext";
import { ToastProvider } from "@/src/toast/ToastContext";
import { ThemeProvider, useTheme } from "@/src/theme/ThemeProvider";
import { WelcomeSheet } from "@/src/components/WelcomeSheet";

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

/**
 * OnboardingGate — mounted inside SettingsProvider so it can read profile.
 * Waits 600 ms after settings are ready, then shows WelcomeSheet if
 * hasCompletedOnboarding is false (or profile is null).
 * Never shows again once completed.
 */
function OnboardingGate() {
  const { ready, profile } = useSettings();
  const [showWelcome, setShowWelcome] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready) return;

    const needsOnboarding = profile === null || profile.hasCompletedOnboarding === false;
    if (needsOnboarding) {
      timerRef.current = setTimeout(() => setShowWelcome(true), 600);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [ready]); // only runs once when settings finish loading

  return (
    <WelcomeSheet
      visible={showWelcome}
      onDone={() => setShowWelcome(false)}
    />
  );
}

function AppTree() {
  const { colors, theme } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <ToastProvider>
            <DownloadsProvider>
              <PlayerProvider>
                <View style={{ flex: 1, backgroundColor: colors.background }}>
                  <StatusBar style={theme === "dark" ? "light" : "dark"} />
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen
                      name="player"
                      options={{ presentation: "modal", animation: "slide_from_bottom", gestureEnabled: true }}
                    />
                    <Stack.Screen
                      name="reading-mode"
                      options={{ presentation: "fullScreenModal", animation: "slide_from_bottom", gestureEnabled: false }}
                    />
                    <Stack.Screen
                      name="series"
                      options={{ animation: "slide_from_right" }}
                    />
                    <Stack.Screen
                      name="collection"
                      options={{ animation: "slide_from_right" }}
                    />
                  </Stack>
                  {/* Global onboarding — appears 600 ms after settings load, once per install */}
                  <OnboardingGate />
                </View>
              </PlayerProvider>
            </DownloadsProvider>
          </ToastProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [appFontsLoaded, appFontsError] = useAppFonts();

  const ready = (iconsLoaded || iconsError) && (appFontsLoaded || appFontsError);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider>
      <AppTree />
    </ThemeProvider>
  );
}
