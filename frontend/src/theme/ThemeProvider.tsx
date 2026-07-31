import React, { createContext, useContext, useEffect, useState } from "react";
import { LayoutAnimation, Platform, UIManager, useColorScheme } from "react-native";
import { storage } from "@/src/utils/storage";
import { darkTheme, lightTheme, ThemeColors } from "./tokens";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ThemeContextValue {
  theme: "light" | "dark";
  colors: ThemeColors;
  setTheme: (theme: "light" | "dark") => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = "sanctuary.theme.preference";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<"light" | "dark">("dark");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    storage.getItem<"light" | "dark">(THEME_KEY, "dark").then((val) => {
      if (val === "light" || val === "dark") {
        setThemeState(val);
      }
      setIsLoaded(true);
    });
  }, []);

  const setTheme = (newTheme: "light" | "dark") => {
    if (newTheme === theme) return;
    // Animate smoothly
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setThemeState(newTheme);
    storage.setItem(THEME_KEY, newTheme).catch(() => {});
  };

  if (!isLoaded) return null; // Wait for initial theme

  const colors = theme === "light" ? lightTheme : darkTheme;

  return (
    <ThemeContext.Provider value={{ theme, colors, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
