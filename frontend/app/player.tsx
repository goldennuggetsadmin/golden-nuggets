import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated, PanResponder, Pressable, ScrollView, Share, StyleSheet, Text, View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { ArrowDownToLine } from "lucide-react-native";

import { radii, spacing, typography } from "@/src/theme/tokens";
import { getShadows } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { formatDuration, usePlayer } from "@/src/player/PlayerContext";
import { useSettings } from "@/src/settings/SettingsContext";
import { useDownloads } from "@/src/downloads/DownloadsContext";
import { useToast } from "@/src/toast/ToastContext";
import { InputSheet } from "@/src/components/InputSheet";
import { PickerSheet } from "@/src/components/PickerSheet";
import { DownloadModal } from "@/src/components/DownloadModal";
import { api } from "@/src/api/client";

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const p = usePlayer();
  const s = useSettings();
  const dl = useDownloads();
  const toast = useToast();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);
  const shadows = getShadows(colors);

  const [showNote, setShowNote] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showSleep, setShowSleep] = useState(false);
  const [showRate, setShowRate] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  const m = p.current;
  useEffect(() => {
    if (!m) {
      const timer = setTimeout(() => { if (router.canGoBack()) router.back(); }, 0);
      return () => clearTimeout(timer);
    }
  }, [m]);

  if (!m) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  const duration = m.duration || p.duration || 1;
  const progress = Math.min(1, p.position / duration);
  const download = dl.items[m.id];
  const isDownloaded = download?.state === "downloaded";
  const isDownloading = download?.state === "downloading" || download?.state === "queued";

  const share = async () => {
    try {
      const url = `sanctuary://message/${m.id}`;
      await Share.share({ message: `${m.title} — ${m.speaker}\n${url}`, title: m.title });
      api.track("share", m.id).catch(() => {});
    } catch {}
  };

  const toggleFavorite = async () => {
    await p.favorite(m.id, !m.favorite);
    Haptics.selectionAsync().catch(() => {});
    toast.show(m.favorite ? "Removed from favorites" : "Added to favorites", "success");
  };

  const onSave = async () => {
    if (isDownloaded) { await dl.remove(m.id); return; }
    if (isDownloading) { toast.show("Already downloading", "info"); return; }
    if (!m.audio_url) { toast.show("No audio to save", "error"); return; }
    api.track("download_start", m.id).catch(() => {});
    dl.start(m);
    toast.show("Downloading…", "info");
  };

  const closePlayer = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace({ pathname: "/reading-mode", params: { id: m.id } });
    }
  };

  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 80 || gestureState.vy > 0.5) {
          Animated.timing(translateY, {
            toValue: 500,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            closePlayer();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            friction: 8,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  return (
    <Animated.View style={{ flex: 1, backgroundColor: colors.background, transform: [{ translateY }] }} {...panResponder.panHandlers}>
      <View style={StyleSheet.absoluteFillObject}>
        <Image source={require('@/assets/images/banner.png')} style={{ width: "100%", height: "100%", opacity: 0.4, transform: [{ scale: 1.25 }] }} contentFit="cover" blurRadius={40} cachePolicy="memory-disk" />
        <LinearGradient colors={theme === "dark" ? ["rgba(11,15,14,0.6)", "rgba(11,15,14,0.85)", colors.background] : ["rgba(255,255,255,0.6)", "rgba(255,255,255,0.85)", colors.background]} style={StyleSheet.absoluteFillObject} />
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top + spacing[2] }]}>
        <Pressable testID="player-close" onPress={closePlayer} style={styles.topBtn}>
          <Ionicons name="chevron-down" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.topEyebrow}>NOW PLAYING</Text>
          <Text style={styles.topCategory}>{m.category}</Text>
        </View>
        <Pressable testID="player-download" onPress={() => setShowDownloadModal(true)} style={styles.topBtn}>
          {isDownloaded
            ? <Ionicons name="checkmark-circle" size={22} color={colors.emerald} />
            : <ArrowDownToLine size={22} color={isDownloading ? colors.emerald : colors.foreground} strokeWidth={2} />}
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing[5], paddingBottom: spacing[8] }} showsVerticalScrollIndicator={false}>
        <View style={[styles.artWrap, shadows.elevated]}>
          <Image source={require('@/assets/images/banner.png')} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="memory-disk" />
        </View>

        <View style={styles.titleRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>{m.title}</Text>
            <Text style={styles.speaker}>{m.speaker} · {m.year}</Text>
          </View>
          <Pressable testID="player-favorite" onPress={toggleFavorite} style={styles.favBtn}>
            <Ionicons name={m.favorite ? "heart" : "heart-outline"} size={24} color={m.favorite ? colors.emerald : colors.mutedForeground} />
          </Pressable>
        </View>

        <SeekBar progress={progress} onSeek={(r) => p.seekTo(r * duration)} />

        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatDuration(p.position)}</Text>
          <Text style={styles.timeText}>-{formatDuration(Math.max(0, duration - p.position))}</Text>
        </View>

        <View style={styles.controls}>
          <Pressable testID="player-rate" onPress={() => setShowRate(true)} style={styles.ctlXs}>
            <Text style={styles.rateText}>{s.playbackRate === 1 ? "1×" : `${s.playbackRate}×`}</Text>
          </Pressable>
          <Pressable testID="player-rewind" onPress={() => p.skip(-15)} style={styles.ctlSm}>
            <Ionicons name="play-back" size={28} color={colors.foreground} />
          </Pressable>
          <Pressable testID="player-play-pause" onPress={p.toggle} style={[styles.ctlLg, shadows.glow]}>
            <Ionicons name={p.playing ? "pause" : "play"} size={34} color={theme === "dark" ? colors.background : "#fff"} style={p.playing ? undefined : { marginLeft: 3 }} />
          </Pressable>
          <Pressable testID="player-forward" onPress={() => p.skip(30)} style={styles.ctlSm}>
            <Ionicons name="play-forward" size={28} color={colors.foreground} />
          </Pressable>
          <Pressable testID="player-sleep-timer" onPress={() => setShowSleep(true)} style={styles.ctlXs}>
            <Ionicons name={p.sleepAt ? "moon" : "moon-outline"} size={22} color={p.sleepAt ? colors.emerald : colors.mutedForeground} />
          </Pressable>
        </View>


        <Pressable testID="open-transcript" onPress={() => router.push({ pathname: "/reading-mode", params: { id: m.id } })} style={styles.transcriptPill}>
          <View>
            <Text style={styles.tpEyebrow}>TRANSCRIPT</Text>
            <Text style={styles.tpTitle}>Read while you listen</Text>
          </View>
          <View style={styles.tpIcon}>
            <Ionicons name="text" size={16} color={colors.emerald} />
          </View>
        </Pressable>
      </ScrollView>

      <InputSheet
        testID="note-sheet"
        visible={showNote}
        onClose={() => setShowNote(false)}
        title="Write a note"
        placeholder="Your reflection…"
        submitLabel="Save note"
        onSubmit={async (body) => {
          await api.saveNote({ collection_id: "player_quick", testimony_id: m.id, paragraph_number: 1, text: body, timestamp: Math.floor(p.position) }).catch(() => null);
          toast.show("Note saved", "success");
        }}
      />

      <QueueSheet visible={showQueue} onClose={() => setShowQueue(false)} />

      <PickerSheet
        testID="sleep-sheet"
        visible={showSleep}
        onClose={() => setShowSleep(false)}
        title="Sleep timer"
        value={s.sleepTimerMinutes ?? 0}
        onChange={(v) => { p.setSleepTimer(v === 0 ? null : (v as number)); toast.show(v === 0 ? "Sleep timer off" : `Stops in ${v} min`, "info"); }}
        options={[
          { value: 0, label: "Off" }, { value: 5, label: "5 min" }, { value: 10, label: "10 min" },
          { value: 15, label: "15 min" }, { value: 30, label: "30 min" }, { value: 45, label: "45 min" },
          { value: 60, label: "1 hour" },
        ]}
      />

      <PickerSheet
        testID="rate-sheet"
        visible={showRate}
        onClose={() => setShowRate(false)}
        title="Playback speed"
        value={s.playbackRate}
        onChange={(v) => p.setRate(v as number)}
        options={RATES.map((r) => ({ value: r, label: r === 1 ? "1× (normal)" : `${r}×` }))}
      />

      <DownloadModal
        visible={showDownloadModal}
        testimony={m}
        onClose={() => setShowDownloadModal(false)}
      />
    </Animated.View>
  );
}

function SeekBar({ progress, onSeek }: { progress: number; onSeek: (r: number) => void }) {
  const [width, setWidth] = useState(1);
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);
  const shadows = getShadows(colors);

  return (
    <Pressable
      testID="player-seekbar"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPress={(e) => onSeek(Math.max(0, Math.min(1, e.nativeEvent.locationX / width)))}
      style={styles.seekWrap}
    >
      <View style={styles.seekTrack}>
        <View style={[styles.seekFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={[styles.seekThumb, { left: Math.max(0, Math.min(width - 14, progress * width - 7)) }, shadows.glow]} />
    </Pressable>
  );
}

function ActionBtn({ testID, icon, label, active, onPress }: {
  testID?: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.actionBtn}>
      <Ionicons name={icon} size={22} color={active ? colors.emerald : colors.mutedForeground} />
      <Text style={[styles.actionLabel, active && { color: colors.emerald }]}>{label}</Text>
    </Pressable>
  );
}

function QueueSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const p = usePlayer();
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.55)" }]} onPress={onClose} />
      <View style={[styles.queueSheet, { paddingBottom: insets.bottom + spacing[4] }]}>
        <View style={styles.handle} />
        <Text style={styles.queueTitle}>Up next ({p.queue.length})</Text>
        {p.queue.length === 0 ? (
          <Text style={styles.queueEmpty}>Queue is empty. Add testimonies from any card.</Text>
        ) : (
          <ScrollView style={{ maxHeight: 320 }}>
            {p.queue.map((q, i) => (
              <View key={q.id + i} style={styles.queueRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.queueRowTitle} numberOfLines={1}>{q.title}</Text>
                  <Text style={styles.queueRowMeta} numberOfLines={1}>{q.speaker}</Text>
                </View>
                <Pressable testID={`queue-remove-${q.id}`} onPress={() => p.removeFromQueue(q.id)}>
                  <Ionicons name="close" size={18} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}



const getStyles = (colors: any, theme: string) => StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[5], paddingBottom: spacing[2] },
  topBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: theme === "dark" ? "rgba(20,26,24,0.7)" : "rgba(233,236,239,0.7)" },
  topEyebrow: { fontSize: 10, letterSpacing: 1.8, color: colors.mutedForeground, fontFamily: typography.sansSemi },
  topCategory: { fontSize: 12, color: colors.foreground, fontFamily: typography.sansMedium, marginTop: 2 },
  artWrap: { alignSelf: "center", marginTop: spacing[4], aspectRatio: 1, width: "100%", maxWidth: 360, borderRadius: radii["3xl"], overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  titleRow: { marginTop: spacing[8], flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing[4] },
  title: { fontSize: 28, lineHeight: 32, color: colors.foreground, fontFamily: typography.serif },
  speaker: { marginTop: 6, fontSize: 14, color: colors.mutedForeground, fontFamily: typography.sans },
  favBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  seekWrap: { marginTop: spacing[6], height: 20, justifyContent: "center" },
  seekTrack: { height: 6, borderRadius: 3, backgroundColor: colors.white8, overflow: "hidden" },
  seekFill: { height: 6, borderRadius: 3, backgroundColor: colors.emerald },
  seekThumb: { position: "absolute", top: 3, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.emerald },
  timeRow: { marginTop: spacing[2], flexDirection: "row", justifyContent: "space-between" },
  timeText: { fontSize: 11, color: colors.mutedForeground, fontFamily: typography.sansMedium, fontVariant: ["tabular-nums"] },
  controls: { marginTop: spacing[6], flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ctlXs: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  ctlSm: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  ctlLg: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", backgroundColor: colors.emerald },
  rateText: { color: colors.mutedForeground, fontFamily: typography.sansSemi, fontSize: 13 },
  actionsRow: { marginTop: spacing[8], flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8 },
  actionBtn: { minWidth: 60, minHeight: 60, alignItems: "center", justifyContent: "center", gap: 6 },
  actionLabel: { fontSize: 10, color: colors.mutedForeground, fontFamily: typography.sansMedium },
  transcriptPill: { marginTop: spacing[10], flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing[4], borderRadius: radii.xl, borderWidth: 1, borderColor: colors.hairline, backgroundColor: theme === "dark" ? "rgba(20,26,24,0.7)" : "rgba(233,236,239,0.7)" },
  tpEyebrow: { fontSize: 10, letterSpacing: 1.8, color: colors.gold, fontFamily: typography.sansSemi },
  tpTitle: { marginTop: 2, fontSize: 14, color: colors.foreground, fontFamily: typography.sansSemi },
  tpIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.emeraldSoft },
  transcriptTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[5], paddingBottom: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  langPill: { flexDirection: "row", gap: 4, borderRadius: 999, backgroundColor: colors.surface, padding: 4 },
  langBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  langText: { fontSize: 12, color: colors.mutedForeground, fontFamily: typography.sansSemi },
  fontPill: { flexDirection: "row", gap: 4, borderRadius: 999, backgroundColor: colors.surface, padding: 4 },
  fontBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  fontBtnText: { color: colors.mutedForeground, fontFamily: typography.sansSemi, fontSize: 12 },
  trHeader: { fontSize: 10, letterSpacing: 1.8, color: colors.gold, fontFamily: typography.sansSemi, marginBottom: spacing[3] },
  trBody: { color: theme === "dark" ? "rgba(245,245,240,0.9)" : "rgba(11,15,14,0.9)", fontFamily: typography.sans, marginBottom: spacing[3] },
  trActions: { flexDirection: "row", gap: spacing[3], marginBottom: spacing[6] },
  trActionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.white5 },
  trActionText: { fontSize: 11, color: colors.mutedForeground, fontFamily: typography.sansSemi },
  queueSheet: { position: "absolute", left: spacing[3], right: spacing[3], bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radii["2xl"], borderTopRightRadius: radii["2xl"], borderWidth: 1, borderColor: colors.hairline, padding: spacing[4] },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.white10, marginBottom: spacing[3] },
  queueTitle: { fontSize: 18, color: colors.foreground, fontFamily: typography.serif, marginBottom: spacing[3] },
  queueEmpty: { color: colors.mutedForeground, fontFamily: typography.sans, fontSize: 13, textAlign: "center", paddingVertical: spacing[6] },
  queueRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  queueRowTitle: { color: colors.foreground, fontFamily: typography.sansSemi, fontSize: 14 },
  queueRowMeta: { color: colors.mutedForeground, fontFamily: typography.sans, fontSize: 12, marginTop: 2 },
});
