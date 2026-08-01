import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, LogBox, Platform, StyleSheet, View } from "react-native";
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

function AndroidLaunchPoster({ isReady, onFinished }: { isReady: boolean; onFinished: () => void }) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const startedRef = useRef(false);
  const mountTimeRef = useRef(Date.now());

  useEffect(() => {
    const triggerFade = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        onFinished();
      });
    };

    if (isReady && !startedRef.current) {
      const elapsed = Date.now() - mountTimeRef.current;
      const remainingMin = Math.max(0, 2500 - elapsed);
      const timer = setTimeout(triggerFade, remainingMin);
      return () => clearTimeout(timer);
    }

    // Emergency offline fallback timeout (12.0s)
    const maxTimer = setTimeout(triggerFade, 12000);
    return () => clearTimeout(maxTimer);
  }, [isReady]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundColor: "#0B0F0E",
          zIndex: 99999,
          opacity: fadeAnim,
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
      pointerEvents="none"
    >
      <Image
        source={require("@/assets/images/splash-image.png")}
        style={{ width: "100%", height: "100%" }}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

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



import { api } from "@/src/api/client";

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [appFontsLoaded, appFontsError] = useAppFonts();
  const [dataLoaded, setDataLoaded] = useState(false);
  const [showAndroidPoster, setShowAndroidPoster] = useState(Platform.OS === "android");

  useEffect(() => {
    let isMounted = true;
    async function preloadAllData() {
      try {
        await api.home();
      } catch {
        // Silently ignore network errors so offline/cached mode still loads
      } finally {
        if (isMounted) setDataLoaded(true);
      }
    }
    preloadAllData();
    return () => {
      isMounted = false;
    };
  }, []);

  const fontsReady = (iconsLoaded || iconsError) && (appFontsLoaded || appFontsError);

  useEffect(() => {
    if (fontsReady) {
      // Hide Image-1 (Native Android Splash) in <0.5s as soon as React tree mounts
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <ThemeProvider>
      <AppTree />
      {Platform.OS === "android" && showAndroidPoster && (
        <AndroidLaunchPoster isReady={dataLoaded} onFinished={() => setShowAndroidPoster(false)} />
      )}
    </ThemeProvider>
  );
}
