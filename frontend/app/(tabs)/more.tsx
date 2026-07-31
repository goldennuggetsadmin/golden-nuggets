import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radii, spacing, typography } from "@/src/theme/tokens";
import { getShadows } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import {
  useSettings,
  APP_LANGUAGES,
  getLanguageLabel,
  getDisplayName,
  getAvatarInitials,
} from "@/src/settings/SettingsContext";
import { useDownloads } from "@/src/downloads/DownloadsContext";
import { useToast } from "@/src/toast/ToastContext";
import { PickerSheet } from "@/src/components/PickerSheet";
import { EditProfileSheet } from "@/src/components/EditProfileSheet";

const TAB_BAR_INSET = 140;

function bytesFmt(b: number) {
  if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${(b / 1e3).toFixed(0)} KB`;
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const dl = useDownloads();
  const toast = useToast();
  const { colors, theme, setTheme: setThemeProvider } = useTheme();
  const styles = getStyles(colors, theme);
  const shadows = getShadows(colors);

  const [openSheet, setOpenSheet] = useState<null | "rate" | "sleep" | "quality" | "tlang" | "font" | "alang">(null);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  const displayName = getDisplayName(s.profile);
  const initials = getAvatarInitials(s.profile);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + spacing[2], paddingBottom: TAB_BAR_INSET }}
    >
      <View style={{ paddingHorizontal: spacing[5], paddingBottom: spacing[6] }}>
        <Text style={styles.h1}>Settings</Text>
      </View>

      <View style={{ paddingHorizontal: spacing[5] }}>
        <Pressable style={styles.profile} onPress={() => setEditProfileOpen(true)}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pName}>{displayName}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={{ marginTop: spacing[8] }}>
        <Text style={styles.groupLabel}>APPEARANCE</Text>
        <View style={styles.appearanceCard}>
          <View style={{ flexDirection: "row", gap: spacing[2] }}>
            {(["light", "dark"] as const).map((v) => {
              const active = theme === v;
              return (
                <Pressable
                  key={v}
                  testID={`theme-${v}`}
                  onPress={() => { s.setTheme(v); setThemeProvider(v); toast.show(`Theme: ${v}`, "info"); }}
                  style={[styles.themeBtn, active && [styles.themeBtnActive, shadows.glow]]}
                >
                  <Ionicons name={v === "light" ? "sunny" : "moon"} size={16} color={active ? (theme === "dark" ? colors.background : "#fff") : (theme === "dark" ? "rgba(245,245,240,0.8)" : "rgba(11,15,14,0.6)")} />
                  <Text style={[styles.themeText, active && { color: theme === "dark" ? colors.background : "#fff" }]}>{v === "light" ? "Light" : "Dark"}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.themeHint}>{"Select a theme for the application interface."}</Text>
        </View>
      </View>

      <Group title="LISTENING">
        <Row testID="settings-row-rate" icon="speedometer" tone="emerald" label="Playback speed" value={`${s.playbackRate}×`} onPress={() => setOpenSheet("rate")} />
        <Row testID="settings-row-sleep" icon="moon" label="Sleep timer" value={s.sleepTimerMinutes ? `${s.sleepTimerMinutes} min` : "Off"} onPress={() => setOpenSheet("sleep")} />
        <Row testID="settings-row-quality" icon="sparkles" label="Download quality" value={s.downloadQuality} onPress={() => setOpenSheet("quality")} />
      </Group>

      <Group title="READING">
        <Row testID="settings-row-tlang" icon="language" tone="gold" label="Transcript language" value={s.transcriptLanguage} onPress={() => setOpenSheet("tlang")} />
        <Row testID="settings-row-font" icon="text" label="Font size" value={`${s.fontSize} pt`} onPress={() => setOpenSheet("font")} />
        <Row testID="settings-row-alang" icon="globe" label="App language" value={getLanguageLabel(s.appLanguage)} onPress={() => setOpenSheet("alang")} />
      </Group>

      <Group title="DEVICE">
        <Row testID="settings-row-storage" icon="server" label="Storage" value={bytesFmt(dl.totalBytes)} onPress={() => toast.show("Manage in Downloads tab", "info")} />
      </Group>

      <Group title="ABOUT">
        <Row testID="settings-row-privacy" icon="shield" label="Privacy policy" onPress={() => toast.show("Privacy policy opens in browser (deploy first)", "info")} />
        <Row testID="settings-row-about" icon="information-circle" label="About Golden Nuggets" value="v1.0" onPress={() => toast.show("Golden Nuggets v1.0", "info")} />
      </Group>

      <PickerSheet
        testID="picker-rate"
        visible={openSheet === "rate"}
        onClose={() => setOpenSheet(null)}
        title="Playback speed"
        value={s.playbackRate}
        onChange={s.setPlaybackRate}
        options={[
          { value: 0.5, label: "0.5×" }, { value: 0.75, label: "0.75×" },
          { value: 1.0, label: "1× (normal)" }, { value: 1.25, label: "1.25×" },
          { value: 1.5, label: "1.5×" }, { value: 2.0, label: "2×" },
        ]}
      />
      <PickerSheet
        testID="picker-sleep"
        visible={openSheet === "sleep"}
        onClose={() => setOpenSheet(null)}
        title="Sleep timer"
        value={s.sleepTimerMinutes ?? 0}
        onChange={(v) => s.setSleepTimerMinutes(v === 0 ? null : (v as number))}
        options={[
          { value: 0, label: "Off" }, { value: 5, label: "5 min" }, { value: 10, label: "10 min" },
          { value: 15, label: "15 min" }, { value: 30, label: "30 min" }, { value: 45, label: "45 min" },
          { value: 60, label: "1 hour" },
        ]}
      />
      <PickerSheet
        testID="picker-quality"
        visible={openSheet === "quality"}
        onClose={() => setOpenSheet(null)}
        title="Download quality"
        value={s.downloadQuality}
        onChange={(v) => s.setDownloadQuality(v as "High" | "Medium" | "Low")}
        options={[
          { value: "Low", label: "Low (smallest)" },
          { value: "Medium", label: "Medium" },
          { value: "High", label: "High (best)" },
        ]}
      />
      <PickerSheet
        testID="picker-tlang"
        visible={openSheet === "tlang"}
        onClose={() => setOpenSheet(null)}
        title="Transcript language"
        value={s.transcriptLanguage}
        onChange={(v) => s.setTranscriptLanguage(v as "English" | "Telugu")}
        options={[{ value: "English", label: "English" }, { value: "Telugu", label: "తెలుగు" }]}
      />
      <PickerSheet
        testID="picker-font"
        visible={openSheet === "font"}
        onClose={() => setOpenSheet(null)}
        title="Transcript font size"
        value={s.fontSize}
        onChange={(v) => s.setFontSize(v as number)}
        options={[
          { value: 14, label: "Small" }, { value: 17, label: "Medium" },
          { value: 20, label: "Large" }, { value: 24, label: "Extra large" },
        ]}
      />
      <PickerSheet
        testID="picker-alang"
        visible={openSheet === "alang"}
        onClose={() => setOpenSheet(null)}
        title="App language"
        value={s.appLanguage}
        onChange={(v) => s.setAppLanguage(v as typeof s.appLanguage)}
        options={APP_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
      />

      {/* Edit Profile sheet */}
      <EditProfileSheet
        visible={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
      />
    </ScrollView>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);
  return (
    <View style={{ marginTop: spacing[8] }}>
      <Text style={styles.groupLabel}>{title}</Text>
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

function Row({
  icon, label, value, tone, onPress, testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  tone?: "emerald" | "gold";
  onPress: () => void;
  testID: string;
}) {
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.row}>
      <View style={[
        styles.rowIcon,
        tone === "emerald" && { backgroundColor: colors.emeraldSoft },
        tone === "gold" && { backgroundColor: colors.goldSoft },
      ]}>
        <Ionicons
          name={icon}
          size={16}
          color={tone === "emerald" ? colors.emerald : tone === "gold" ? colors.gold : (theme === "dark" ? "rgba(245,245,240,0.85)" : "rgba(11,15,14,0.6)")}
        />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  h1: { fontSize: 32, color: colors.foreground, fontFamily: typography.serif, lineHeight: 34 },
  profile: { flexDirection: "row", alignItems: "center", gap: spacing[4], borderRadius: radii["3xl"], borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, padding: spacing[4] },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.emeraldSoft, borderWidth: 1, borderColor: "rgba(62,170,121,0.25)" },
  avatarText: { color: colors.emerald, fontFamily: typography.serif, fontSize: 24 },
  pName: { fontSize: 16, color: colors.foreground, fontFamily: typography.sansSemi },
  groupLabel: { paddingHorizontal: spacing[5], marginBottom: spacing[2], fontSize: 10, letterSpacing: 1.8, color: colors.mutedForeground, fontFamily: typography.sansSemi },
  appearanceCard: { marginHorizontal: spacing[5], borderRadius: radii.xl, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, padding: spacing[3] },
  themeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing[2], borderRadius: radii.md, paddingHorizontal: spacing[3], paddingVertical: 12, backgroundColor: colors.white5 },
  themeBtnActive: { backgroundColor: colors.emerald },
  themeText: { fontSize: 14, color: theme === "dark" ? "rgba(245,245,240,0.85)" : "rgba(11,15,14,0.6)", fontFamily: typography.sansSemi },
  themeHint: { marginTop: spacing[3], paddingHorizontal: 4, fontSize: 11, color: colors.mutedForeground, fontFamily: typography.sans },
  groupCard: { marginHorizontal: spacing[5], borderRadius: radii.xl, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.white5 },
  rowLabel: { flex: 1, fontSize: 14, color: colors.foreground, fontFamily: typography.sansMedium },
  rowValue: { fontSize: 12, color: colors.mutedForeground, fontFamily: typography.sans },

});
