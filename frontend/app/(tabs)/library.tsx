import React, { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { api, Highlight, HistoryRow, NoteCollection, Testimony } from "@/src/api/client";
import { TranscriptParagraphText } from "@/src/components/TranscriptParagraphText";
import { UserNote } from "@/src/utils/userStore";
import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { Skeleton } from "@/src/components/Skeleton";
import { useToast } from "@/src/toast/ToastContext";
import { SermonCard } from "@/src/components/SermonCard";
import { getContentType } from "@/src/utils/sermonUtils";
import { useSettings } from "@/src/settings/SettingsContext";
import { usePlayer } from "@/src/player/PlayerContext";
import { useDownloads } from "@/src/downloads/DownloadsContext";


const FIVE_TABS = [
  { id: "recent", label: "Recent", icon: "time" },
  { id: "highlights", label: "Highlights", icon: "star" },
  { id: "notes", label: "Notes", icon: "journal" },
  { id: "favorites", label: "Favorites", icon: "heart" },
] as const;

type TabId = typeof FIVE_TABS[number]["id"];
const TAB_BAR_INSET = 100;

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  const [tab, setTab] = useState<TabId>("recent");
  const [testimonies, setTestimonies] = useState<Testimony[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [collections, setCollections] = useState<NoteCollection[]>([]);
  const [collectionNoteCounts, setCollectionNoteCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedHighlight, setSelectedHighlight] = useState<Highlight | null>(null);

  const toast = useToast();
  const p = usePlayer();
  const downloads = useDownloads();
  const { appLanguage, fontSize } = useSettings();

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      
      // 1. Instantly load ultra-fast local data (Zero network calls)
      const [hl, cols, cachedT] = await Promise.all([
        api.listHighlights().catch(() => [] as Highlight[]),
        api.listCollections().catch(() => [] as NoteCollection[]),
        api.getCachedTestimonies(JSON.stringify({ limit: 200 })).catch(() => null),
      ]);
      
      setHighlights(hl);
      setCollections(cols);

      // Fetch note counts (also local, very fast)
      const counts: Record<string, number> = {};
      await Promise.all(
        cols.map(async (col) => {
          const notes = await api.listNotes(col.id).catch(() => [] as UserNote[]);
          counts[col.id] = notes.length;
        })
      );
      setCollectionNoteCounts(counts);

      if (cachedT && cachedT.length > 0) {
        setTestimonies(cachedT);
      }

      // STOP LOADING IMMEDIATELY! The UI is ready to render Highlights and Notes.
      setLoading(false);

      // 2. Fetch potentially slow data concurrently in the background
      api.listHistory()
        .then(h => setHistory(h))
        .catch(() => setHistory([]));

      api.listTestimonies({ limit: 200 })
        .then(freshT => setTestimonies(freshT))
        .catch(() => {});

    } finally {
      // Just in case of errors
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  React.useEffect(() => {
    p.setSheetOpen(Boolean(selectedHighlight));
  }, [selectedHighlight, p]);

  const findTestimony = useCallback((id: string) => testimonies.find((x) => x.id === id), [testimonies]);

  const favoritesList = useMemo(
    () => testimonies.filter((m) => m.favorite && m.language === appLanguage),
    [testimonies, appLanguage]
  );

  const recentList = useMemo(
    () => history
      .map((h) => h.testimony)
      .filter((m) => m.language === appLanguage),
    [history, appLanguage]
  );

  const filteredHighlights = useMemo(() => {
    const seen = new Set<string>();
    return highlights.filter((h) => {
      const t = findTestimony(h.testimony_id);
      if (t && t.language !== appLanguage) return false;
      const key = `${h.testimony_id}_${h.paragraph_number ?? h.paragraph_index}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [highlights, appLanguage, findTestimony]);

  // Format date for collection display
  const formatCollectionDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Updated Today";
    if (diffDays === 1) return "Updated Yesterday";
    if (diffDays < 7) return `Updated ${diffDays} days ago`;
    return `Updated ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + spacing[2], paddingBottom: TAB_BAR_INSET }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.emerald} />}
      >
        <View style={{ paddingHorizontal: spacing[5], paddingBottom: spacing[4] }}>
          <Text style={styles.h1}>Library</Text>
          <Text style={styles.sub}>{"Your saved sermons, highlights, and activity."}</Text>
        </View>

        {/* 5 Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing[5], gap: spacing[2] }}>
          {FIVE_TABS.map(({ id, label, icon }) => {
            const active = tab === id;
            return (
              <Pressable
                key={id}
                testID={`library-tab-${id}`}
                onPress={() => setTab(id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Ionicons name={icon as any} size={14} color={active ? (theme === "dark" ? colors.background : "#fff") : colors.mutedForeground} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ marginTop: spacing[6], paddingHorizontal: spacing[5] }}>
          {loading ? (
            <View style={{ gap: spacing[2] }}>
              {[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 72, borderRadius: radii.lg }} />)}
            </View>
          ) : tab === "recent" ? (
            recentList.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>No recent activity</Text>
                <Text style={styles.emptyMessage}>Start listening or reading sermons to build your history.</Text>
                <Pressable onPress={() => router.push("/(tabs)/search")} style={styles.emptyBtn}>
                  <Text style={styles.emptyBtnText}>Browse Sermons</Text>
                </Pressable>
              </View>
            ) : (
              recentList.map((m) => <SermonCard key={m.id} sermon={m} horizontal />)
            )

          ) : tab === "highlights" ? (
            filteredHighlights.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>No highlights yet</Text>
                <Text style={styles.emptyMessage}>Highlight meaningful passages while reading transcripts.</Text>
                <Pressable onPress={() => router.push("/(tabs)/search")} style={styles.emptyBtn}>
                  <Text style={styles.emptyBtnText}>Browse Sermons</Text>
                </Pressable>
              </View>
            ) : (
              filteredHighlights.map((h) => {
                const t = findTestimony(h.testimony_id);
                const code = h.date_code || (t?.year ? String(t.year) : (h.testimony_id !== "unknown" ? h.testimony_id : ""));
                const title = h.testimony_title || t?.title || (h.testimony_id !== "unknown" ? `Sermon ${h.testimony_id}` : "Saved Passage");
                const speaker = h.speaker || t?.speaker || "William Marrion Branham";
                const paraNum = h.paragraph_number ?? h.paragraph_index ?? null;

                return (
                  <Pressable
                    key={h.id}
                    onPress={() => setSelectedHighlight(h)}
                    style={styles.hlCard}
                  >
                    <View style={styles.hlHeaderRow}>
                      <Text style={styles.hlCode}>{code}</Text>
                      {paraNum !== null && (
                        <Text style={styles.hlParaBadge}>Paragraph {paraNum}</Text>
                      )}
                    </View>

                    <Text style={styles.hlTitle}>{title}</Text>
                    <Text style={styles.hlSpeaker}>{speaker}</Text>

                    <TranscriptParagraphText
                      text={`\u201C${h.quote}\u201D`}
                      fontSize={fontSize}
                      style={styles.hlQuote}
                      numberOfLines={4}
                    />
                    <View style={styles.hlFooter}>
                      <Pressable
                        onPress={async () => {
                          await api.deleteHighlight(h.id).catch(() => {});
                          setHighlights((cur) => cur.filter((x) => x.id !== h.id));
                          toast.show("Highlight removed", "info");
                        }}
                      >
                        <Ionicons name="close" size={16} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })
            )

          ) : tab === "notes" ? (
            collections.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="journal-outline" size={40} color={colors.mutedForeground} style={{ opacity: 0.3, marginBottom: spacing[4] }} />
                <Text style={styles.emptyTitle}>No notes yet</Text>
                <Text style={styles.emptyMessage}>
                  {"You haven't created any sermon preparation notes yet."}
                </Text>
                <Pressable onPress={() => router.push("/(tabs)/search")} style={styles.emptyBtn}>
                  <Text style={styles.emptyBtnText}>Browse Sermons</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {collections.map((col) => {
                  const count = collectionNoteCounts[col.id] ?? 0;
                  return (
                    <Pressable
                      key={col.id}
                      style={[styles.collectionCard, { borderColor: colors.hairline }]}
                      onPress={() => router.push({ pathname: "/collection", params: { id: col.id } })}
                    >
                      <View style={styles.collectionIconWrap}>
                        <Ionicons name="folder" size={22} color={colors.emerald} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.collectionTitle}>{col.title}</Text>
                        <Text style={styles.collectionMeta}>
                          {count} {count === 1 ? "Passage" : "Passages"} · {formatCollectionDate(col.updated_at)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  );
                })}
              </>
            )

          ) : tab === "favorites" ? (
            favoritesList.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>No favorites yet</Text>
                <Text style={styles.emptyMessage}>Save sermons you love to access them quickly anytime.</Text>
                <Pressable onPress={() => router.push("/(tabs)/search")} style={styles.emptyBtn}>
                  <Text style={styles.emptyBtnText}>Browse Sermons</Text>
                </Pressable>
              </View>
            ) : (
              favoritesList.map((m) => <SermonCard key={m.id} sermon={m} horizontal />)
            )
          ) : null}
        </View>
      </ScrollView>

      {/* Highlight Detail Bottom Sheet (with Deep Link) */}
      {selectedHighlight && (() => {
        const t = findTestimony(selectedHighlight.testimony_id);
        const code = selectedHighlight.date_code || (t?.year ? String(t.year) : (selectedHighlight.testimony_id !== "unknown" ? selectedHighlight.testimony_id : ""));
        const title = selectedHighlight.testimony_title || t?.title || (selectedHighlight.testimony_id !== "unknown" ? `Sermon ${selectedHighlight.testimony_id}` : "Saved Passage");
        const speaker = selectedHighlight.speaker || t?.speaker || "William Marrion Branham";
        const paraNum = selectedHighlight.paragraph_number ?? selectedHighlight.paragraph_index ?? 1;

        return (
          <View style={[StyleSheet.absoluteFillObject, { zIndex: 1000 }]} pointerEvents="box-none">
            <Pressable style={styles.sheetOverlay} onPress={() => setSelectedHighlight(null)} />
            <View
              style={[
                styles.sheetContent,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.hairline,
                  paddingBottom: Math.max(insets.bottom + spacing[5], spacing[8]),
                },
              ]}
            >
              <View style={styles.sheetHandle} />

              {/* Sermon Code & Paragraph Number Header */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing[3] }}>
                <Text style={styles.hlCode}>{code}</Text>
                <Text style={[styles.sheetParaNum, { color: colors.emerald }]}>
                  Paragraph {paraNum}
                </Text>
              </View>

              {/* Highlight Quote ScrollView */}
              <ScrollView style={{ maxHeight: 180, marginBottom: spacing[4] }} showsVerticalScrollIndicator={false}>
                <TranscriptParagraphText
                  text={`\u201C${selectedHighlight.quote}\u201D`}
                  fontSize={fontSize}
                  style={[styles.hlQuote, { color: colors.foreground }]}
                />
              </ScrollView>

              {/* Sermon Meta Header */}
              <View style={styles.sheetMeta}>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                  {title}
                </Text>
                <Text style={[styles.sheetSpeaker, { color: colors.mutedForeground }]}>
                  {speaker} {code ? `· ${code}` : ""}
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={{ gap: spacing[3], marginTop: spacing[5] }}>
                {/* Deep link: Go to Reading Mode at this paragraph */}
                <Pressable
                  style={[styles.sheetBtn, { backgroundColor: colors.emerald }]}
                  onPress={() => {
                    router.push({
                      pathname: "/reading-mode",
                      params: {
                        id: selectedHighlight.testimony_id,
                        targetIndex: String(paraNum - 1),
                      },
                    });
                    setSelectedHighlight(null);
                  }}
                >
                  <Ionicons name="book" size={18} color={theme === "dark" ? colors.background : "#fff"} />
                  <Text style={[styles.sheetBtnText, { color: theme === "dark" ? colors.background : "#fff" }]}>
                    Read in Context
                  </Text>
                </Pressable>

                {/* Play from highlight if audio is available */}
                {(t || selectedHighlight.start_seconds !== undefined) && (
                  <Pressable
                    style={[styles.sheetBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline }]}
                    onPress={() => {
                      const sermonObj = t || { id: selectedHighlight.testimony_id, title, speaker, year: parseInt(code) || undefined };
                      p.play(sermonObj as Testimony);
                      if (selectedHighlight.start_seconds !== undefined) {
                        p.seekTo(selectedHighlight.start_seconds);
                      }
                      router.push("/player");
                      setSelectedHighlight(null);
                    }}
                  >
                    <Ionicons name="play" size={18} color={colors.foreground} />
                    <Text style={[styles.sheetBtnText, { color: colors.foreground }]}>Play From Here</Text>
                  </Pressable>
                )}

                <Pressable style={[styles.sheetBtn, { backgroundColor: "transparent" }]} onPress={() => setSelectedHighlight(null)}>
                  <Text style={[styles.sheetBtnText, { color: colors.mutedForeground }]}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        );
      })()}
    </View>
  );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  h1: { fontSize: 32, color: colors.foreground, fontFamily: typography.serif, lineHeight: 34 },
  sub: { marginTop: spacing[2], fontSize: 14, color: colors.mutedForeground, fontFamily: typography.sans },
  chip: { flexDirection: "row", alignItems: "center", gap: spacing[2], minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, justifyContent: "center" },
  chipActive: { borderColor: colors.emerald, backgroundColor: colors.emerald },
  chipText: { fontSize: 13, color: colors.mutedForeground, fontFamily: typography.sansSemi },
  chipTextActive: { color: theme === "dark" ? colors.background : "#fff" },
  hlCard: { borderLeftWidth: 3, borderLeftColor: colors.emerald, borderRadius: radii.xl, backgroundColor: theme === "dark" ? "rgba(20, 26, 24, 0.7)" : "rgba(233, 236, 239, 0.7)", borderWidth: 1, borderColor: colors.hairline, padding: spacing[4], marginBottom: spacing[3] },
  hlHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing[2] },
  hlCode: { fontSize: 13, fontFamily: typography.sansSemi, color: colors.gold },
  hlTitle: { fontSize: 16, fontFamily: typography.serif, color: colors.foreground, marginBottom: 2 },
  hlSpeaker: { fontSize: 13, fontFamily: typography.sans, color: colors.mutedForeground, marginBottom: spacing[3] },
  hlParaBadge: { fontSize: 12, fontFamily: typography.sansSemi, color: colors.emerald, letterSpacing: 0.5 },
  hlParaNum: { fontSize: 20, fontFamily: typography.serif, color: colors.mutedForeground, opacity: 0.25, marginBottom: spacing[2] },
  hlQuote: { color: colors.foreground, lineHeight: 26 },
  hlFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.white8 },
  hlSource: { fontSize: 12, color: colors.gold, fontFamily: typography.sansSemi },
  collectionCard: { flexDirection: "row", alignItems: "center", gap: spacing[4], borderWidth: 1, borderRadius: radii["2xl"], padding: spacing[4], marginBottom: spacing[3] },
  collectionIconWrap: { width: 44, height: 44, borderRadius: radii.xl, backgroundColor: colors.emeraldSoft, alignItems: "center", justifyContent: "center" },
  collectionTitle: { fontSize: 16, fontFamily: typography.sansSemi, color: colors.foreground },
  collectionMeta: { fontSize: 12, fontFamily: typography.sans, color: colors.mutedForeground, marginTop: 2 },
  emptyWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  emptyTitle: { fontSize: 20, fontFamily: typography.serif, color: colors.foreground, marginBottom: spacing[2] },
  emptyMessage: { fontSize: 14, fontFamily: typography.sans, color: colors.mutedForeground, textAlign: "center", paddingHorizontal: spacing[6], marginBottom: spacing[6] },
  emptyBtn: { paddingHorizontal: spacing[6], paddingVertical: spacing[3], borderRadius: 999, backgroundColor: colors.emerald },
  emptyBtnText: { fontSize: 14, fontFamily: typography.sansSemi, color: theme === "dark" ? colors.background : "#fff" },
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheetContent: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: radii["3xl"], borderTopRightRadius: radii["3xl"], padding: spacing[5], paddingTop: spacing[3], paddingBottom: spacing[10], borderWidth: 1, borderBottomWidth: 0 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.white10, alignSelf: "center", marginBottom: spacing[4] },
  sheetMeta: { paddingTop: spacing[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  sheetTitle: { fontSize: 16, fontFamily: typography.serif, marginBottom: 2 },
  sheetSpeaker: { fontSize: 13, fontFamily: typography.sans, marginBottom: 2 },
  sheetParaNum: { fontSize: 12, fontFamily: typography.sansSemi, letterSpacing: 1.2, textTransform: "uppercase" },
  sheetBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing[2], height: 52, borderRadius: radii.xl },
  sheetBtnText: { fontSize: 15, fontFamily: typography.sansSemi },
});
