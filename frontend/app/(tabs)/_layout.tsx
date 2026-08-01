import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LibraryBig, ArrowDownToLine } from "lucide-react-native";

import { spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { MiniPlayer } from "@/src/components/MiniPlayer";

function TabIcon({ focused, name, isLucide }: { focused: boolean; name: any; isLucide?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? colors.emeraldSoft : "transparent",
      }}
    >
      {isLucide ? (
        React.createElement(name, {
          size: 20,
          color: focused ? colors.emerald : colors.mutedForeground,
          strokeWidth: focused ? 2.5 : 2,
        })
      ) : (
        <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={20} color={focused ? colors.emerald : colors.mutedForeground} />
      )}
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const barHeight = 58 + Math.max(insets.bottom, 8);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: colors.emerald,
          tabBarInactiveTintColor: colors.mutedForeground,
          tabBarLabelStyle: {
            fontFamily: typography.sansMedium,
            fontSize: 10,
            letterSpacing: 0.4,
            marginBottom: 4,
          },
          tabBarItemStyle: { paddingTop: 6 },
          tabBarStyle: {
            position: "absolute",
            height: barHeight,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: 6,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.hairline,
            backgroundColor: Platform.OS === "android" ? (theme === "dark" ? "rgba(11,15,14,0.96)" : "rgba(250,250,250,0.96)") : "transparent",
          },
          tabBarBackground: () =>
            Platform.OS === "ios" ? (
              <BlurView tint={theme === "dark" ? "dark" : "light"} intensity={theme === "dark" ? 45 : 80} style={StyleSheet.absoluteFill} />
            ) : null,
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} name={focused ? "home" : "home-outline"} />,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: "Search",
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} name={focused ? "search" : "search-outline"} />,
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: "Library",
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} name={LibraryBig} isLucide />,
          }}
        />
        <Tabs.Screen
          name="downloads"
          options={{
            title: "Downloads",
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} name={ArrowDownToLine} isLucide />,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: "More",
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="ellipsis-horizontal" />,
          }}
        />
      </Tabs>

      <View pointerEvents="box-none" style={[styles.miniWrap, { bottom: barHeight + 12 }]}>
        <View pointerEvents="auto" style={{ paddingHorizontal: spacing[3] }}>
          <MiniPlayer />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  miniWrap: { position: "absolute", left: 0, right: 0 },
});
