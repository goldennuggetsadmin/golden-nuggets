import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { api, Testimony } from "@/src/api/client";
import { cacheStore } from "@/src/utils/cache";
import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { Skeleton } from "@/src/components/Skeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { SermonCard } from "@/src/components/SermonCard";
import { ExpandableGroup } from "@/src/components/ExpandableGroup";
import { LanguageSelector } from "@/src/components/LanguageSelector";
import { useSettings } from "@/src/settings/SettingsContext";

const SEARCH_TABS = ["Title", "Year", "State", "Series"] as const;
type SearchTab = typeof SEARCH_TABS[number];
const TAB_BAR_INSET = 100;

interface YearSummary {
  year: number;
  sermonCount: number;
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { appLanguage } = useSettings();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  const [q, setQ] = useState("");
  const [activeTab, setActiveTab] = useState<SearchTab>("Title");
  const [allSermons, setAllSermons] = useState<Testimony[]>([]);
  const [yearSummaries, setYearSummaries] = useState<YearSummary[]>([]);
  const [searchResults, setSearchResults] = useState<Testimony[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingMaster, setLoadingMaster] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [hasNetworkError, setHasNetworkError] = useState(false);

  const isMountedRef = useRef(true);
  const lastLangRef = useRef<string>("");

  /**
   * Master sermon loader with fallback cache and network error state handling.
   */
  const fetchMasterSermons = useCallback(async (lang: string) => {
    console.log(`[SearchScreen] Loading master sermons for language: "${lang}"`);
    setHasNetworkError(false);

    // 1. Versioned Cache Recovery (Instant load <1ms)
    const cachedYears = await cacheStore.get<YearSummary[]>(`years_summary_v3_${lang}`);
    const cachedSermons = await cacheStore.get<Testimony[]>(`search_master_v3_${lang}`);

    if (cachedYears && cachedYears.length > 0 && isMountedRef.current) {
      setYearSummaries(cachedYears);
    }

    if (cachedSermons && cachedSermons.length >= 100 && isMountedRef.current) {
      console.log(`[SearchScreen] Instant cache hit: ${cachedSermons.length} sermons for lang "${lang}"`);
      const sorted = [...cachedSermons].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      setAllSermons(sorted);
      setLoadingMaster(false);
      setInitialLoaded(true);
    } else if (isMountedRef.current) {
      setLoadingMaster(true);
    }

    // 2. Parallel Async API Fetch for Years Summary + Full Sermon Catalog
    let fetchFailed = false;
    try {
      const [yearsRes, itemsRes] = await Promise.all([
        api.years(lang).catch((e) => { fetchFailed = true; return []; }),
        api.search("", undefined, lang).catch((e) => { fetchFailed = true; return []; }),
      ]);

      if (!isMountedRef.current) return;

      if (yearsRes && yearsRes.length > 0) {
        setYearSummaries(yearsRes);
        cacheStore.set(`years_summary_v3_${lang}`, yearsRes);
      }

      if (itemsRes && itemsRes.length > 0) {
        const sorted = [...itemsRes].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        setAllSermons(sorted);
        cacheStore.set(`search_master_v3_${lang}`, sorted);
        fetchFailed = false;

        console.log("================================──────────────────────────────");
        console.log(`[SearchScreen Runtime Log] Target Base URL: "${api.base}"`);
        console.log(`[SearchScreen Runtime Log] Requested Language: "${lang}"`);
        console.log(`[SearchScreen Runtime Log] Sermons Received from API: ${itemsRes.length}`);
        console.log(`[SearchScreen Runtime Log] Sermons Rendered in UI: ${sorted.length}`);
        console.log("================================──────────────────────────────");
      } else if (fetchFailed) {
        console.warn(`[SearchScreen] API fetch encountered connection error for lang "${lang}"`);
      }
    } catch (err) {
      fetchFailed = true;
      console.error(`[SearchScreen] API fetch exception for lang "${lang}":`, err);
    } finally {
      if (isMountedRef.current) {
        setLoadingMaster(false);
        setInitialLoaded(true);

        // 3. Fallback recovery if state is still empty after network failure
        if (allSermons.length === 0) {
          const fallback = (await cacheStore.get<Testimony[]>("sermons_fallback")) || (await cacheStore.get<Testimony[]>("sermons_all"));
          if (fallback && fallback.length > 0) {
            console.log(`[SearchScreen] Recovered ${fallback.length} fallback sermons from offline store`);
            setAllSermons(fallback);
          } else if (fetchFailed) {
            setHasNetworkError(true);
          }
        }
      }
    }
  }, [allSermons.length]);

  // Focus effect: Syncs master list whenever Search tab is focused
  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
      fetchMasterSermons(appLanguage);

      return () => {
        isMountedRef.current = false;
      };
    }, [appLanguage, fetchMasterSermons])
  );

  // Language switch handler: Resets query and re-fetches for target language
  useEffect(() => {
    if (lastLangRef.current && lastLangRef.current !== appLanguage) {
      console.log(`[SearchScreen] Language changed from "${lastLangRef.current}" -> "${appLanguage}"`);
      setSearchResults([]);
      setQ("");
      fetchMasterSermons(appLanguage);
    }
    lastLangRef.current = appLanguage;
  }, [appLanguage, fetchMasterSermons]);

  // Debounced search query handler
  const doSearch = useCallback(async (needle: string, lang: string) => {
    if (!needle.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    console.log(`[SearchScreen] Querying needle="${needle}", lang="${lang}"`);
    setSearching(true);
    try {
      const r = await api.search(needle, undefined, lang);
      const sorted = [...r].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      setSearchResults(sorted);
      console.log(`[SearchScreen] Query results count: ${sorted.length}`);
    } catch (err) {
      console.error(`[SearchScreen] Query failed for needle="${needle}":`, err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(q, appLanguage), 220);
    return () => clearTimeout(t);
  }, [q, appLanguage, doSearch]);

  const isQuerying = q.trim().length > 0;
  const activeDataset = isQuerying ? searchResults : allSermons;

  // Dynamic Groupings for Year, State, Series
  const yearGroups = useMemo(() => {
    const map: Record<string, Testimony[]> = {};
    activeDataset.forEach((item) => {
      if (item.year) {
        const yr = String(item.year);
        if (!map[yr]) map[yr] = [];
        map[yr].push(item);
      }
    });

    if (!isQuerying && yearSummaries.length > 0) {
      yearSummaries.forEach((ys) => {
        const yrStr = String(ys.year);
        if (!map[yrStr]) {
          map[yrStr] = [];
        }
      });
    }

    const entries = Object.entries(map).map(([yrStr, items]) => {
      const matchingSummary = yearSummaries.find((ys) => String(ys.year) === yrStr);
      const displayCount = matchingSummary ? matchingSummary.sermonCount : items.length;
      return [yrStr, items, displayCount] as [string, Testimony[], number];
    });

    return entries.sort((a, b) => b[0].localeCompare(a[0]));
  }, [activeDataset, isQuerying, yearSummaries]);

  const stateGroups = useMemo(() => {
    const map: Record<string, Testimony[]> = {};
    activeDataset.forEach((item) => {
      if (item.state && String(item.state).trim()) {
        const st = String(item.state).trim();
        if (!map[st]) map[st] = [];
        map[st].push(item);
      }
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [activeDataset]);

  const seriesGroups = useMemo(() => {
    const map: Record<string, Testimony[]> = {};
    activeDataset.forEach((item) => {
      const s = (item.category && item.category.trim()) ? item.category.trim() : "General";
      if (!map[s]) map[s] = [];
      map[s].push(item);
    });
    const entries = Object.entries(map);
    return entries.sort((a, b) => {
      if (a[0] === "General") return 1;
      if (b[0] === "General") return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [activeDataset]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + spacing[2], paddingBottom: TAB_BAR_INSET }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ paddingHorizontal: spacing[5], paddingBottom: spacing[3] }}>
        <Text style={styles.h1}>Search</Text>
      </View>

      {/* Language Selector — ABOVE search bar */}
      <View style={{ paddingHorizontal: spacing[5], marginBottom: spacing[3] }}>
        <LanguageSelector testID="search-lang-selector" />
      </View>

      {/* Global Search Bar */}
      <View style={{ paddingHorizontal: spacing[5] }}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            testID="search-input"
            value={q}
            onChangeText={setQ}
            placeholder="Search sermons, series, years..."
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
            autoCorrect={false}
            returnKeyType="search"
          />
          {q ? (
            <Pressable testID="search-clear" onPress={() => setQ("")} style={styles.clearBtn}>
              <Ionicons name="close" size={14} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Search Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing[5], gap: spacing[2], paddingTop: spacing[4] }}>
        {SEARCH_TABS.map((tab) => {
          const active = activeTab === tab;
          return (
            <Pressable
              key={tab}
              testID={`search-tab-${tab}`}
              onPress={() => setActiveTab(tab)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{tab}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* SEARCH RESULTS MODE vs DISCOVERY / TABS MODE */}
      {isQuerying ? (
        <View style={{ marginTop: spacing[6], paddingHorizontal: spacing[5] }}>
          <Text style={styles.count}>
            {searching ? "SEARCHING…" : `${searchResults.length} RESULT${searchResults.length === 1 ? "" : "S"}`}
          </Text>

          {searching ? (
            <View style={{ gap: spacing[2] }}>
              {[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 72, borderRadius: radii.md, marginTop: spacing[2] }} />)}
            </View>
          ) : searchResults.length === 0 ? (
            <EmptyState icon="search-outline" title="Nothing found" message={`No results matching "${q}" in this language.`} />
          ) : (
            <View>
              {searchResults.map((item) => (
                <SermonCard key={item.id} sermon={item} horizontal />
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={{ marginTop: spacing[6] }}>

          {/* TITLE TAB */}
          {activeTab === "Title" && (
            <View style={{ paddingHorizontal: spacing[5] }}>
              {loadingMaster && allSermons.length === 0 ? (
                <View style={{ gap: spacing[2] }}>
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} style={{ height: 72, borderRadius: radii.md, marginTop: spacing[2] }} />
                  ))}
                </View>
              ) : hasNetworkError && allSermons.length === 0 ? (
                <View style={styles.errorWrap}>
                  <EmptyState icon="cloud-offline-outline" title="Unable to Connect" message="Could not connect to server. Please check your connection." />
                  <Pressable style={styles.retryBtn} onPress={() => fetchMasterSermons(appLanguage)}>
                    <Text style={styles.retryBtnText}>Tap to Retry</Text>
                  </Pressable>
                </View>
              ) : !loadingMaster && initialLoaded && allSermons.length === 0 ? (
                <EmptyState icon="musical-notes-outline" title="No sermons" message="No sermons available in this language." />
              ) : (
                allSermons.map((item) => (
                  <SermonCard key={item.id} sermon={item} horizontal />
                ))
              )}
            </View>
          )}

          {/* YEAR TAB — Expandable Groups */}
          {activeTab === "Year" && (
            <View style={{ paddingHorizontal: spacing[5] }}>
              {loadingMaster && yearGroups.length === 0 ? (
                <View style={{ gap: spacing[2] }}>
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} style={{ height: 60, borderRadius: radii.md, marginTop: spacing[2] }} />
                  ))}
                </View>
              ) : hasNetworkError && yearGroups.length === 0 ? (
                <View style={styles.errorWrap}>
                  <EmptyState icon="cloud-offline-outline" title="Unable to Connect" message="Could not connect to server. Please check your connection." />
                  <Pressable style={styles.retryBtn} onPress={() => fetchMasterSermons(appLanguage)}>
                    <Text style={styles.retryBtnText}>Tap to Retry</Text>
                  </Pressable>
                </View>
              ) : !loadingMaster && initialLoaded && yearGroups.length === 0 ? (
                <EmptyState icon="calendar-outline" title="No sermons" message="No sermons found for this language." />
              ) : (
                yearGroups.map(([yearStr, items, displayCount]) => (
                  <ExpandableGroup
                    key={yearStr}
                    title={yearStr}
                    count={displayCount}
                    subtitle="Last Updated"
                    items={items}
                  />
                ))
              )}
            </View>
          )}

          {/* STATE TAB — Expandable Groups */}
          {activeTab === "State" && (
            <View style={{ paddingHorizontal: spacing[5] }}>
              {loadingMaster && stateGroups.length === 0 ? (
                <View style={{ gap: spacing[2] }}>
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} style={{ height: 60, borderRadius: radii.md, marginTop: spacing[2] }} />
                  ))}
                </View>
              ) : hasNetworkError && stateGroups.length === 0 ? (
                <View style={styles.errorWrap}>
                  <EmptyState icon="cloud-offline-outline" title="Unable to Connect" message="Could not connect to server. Please check your connection." />
                  <Pressable style={styles.retryBtn} onPress={() => fetchMasterSermons(appLanguage)}>
                    <Text style={styles.retryBtnText}>Tap to Retry</Text>
                  </Pressable>
                </View>
              ) : !loadingMaster && initialLoaded && stateGroups.length === 0 ? (
                <EmptyState icon="location-outline" title="No sermons" message="No sermons with location data in this language." />
              ) : (
                stateGroups.map(([stateStr, items]) => (
                  <ExpandableGroup
                    key={stateStr}
                    title={stateStr}
                    count={items.length}
                    subtitle="Latest Added"
                    items={items}
                  />
                ))
              )}
            </View>
          )}

          {/* SERIES TAB — Clean Vertical List */}
          {activeTab === "Series" && (
            <View style={{ paddingHorizontal: spacing[5] }}>
              {loadingMaster && seriesGroups.length === 0 ? (
                <View style={{ gap: spacing[2] }}>
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} style={{ height: 56, borderRadius: radii.md, marginTop: spacing[2] }} />
                  ))}
                </View>
              ) : hasNetworkError && seriesGroups.length === 0 ? (
                <View style={styles.errorWrap}>
                  <EmptyState icon="cloud-offline-outline" title="Unable to Connect" message="Could not connect to server. Please check your connection." />
                  <Pressable style={styles.retryBtn} onPress={() => fetchMasterSermons(appLanguage)}>
                    <Text style={styles.retryBtnText}>Tap to Retry</Text>
                  </Pressable>
                </View>
              ) : !loadingMaster && initialLoaded && seriesGroups.length === 0 ? (
                <EmptyState icon="albums-outline" title="No series" message="No series available in this language." />
              ) : (
                seriesGroups.map(([seriesName, items], index) => (
                  <Pressable
                    key={seriesName}
                    onPress={() => router.push({ pathname: "/series", params: { title: seriesName } })}
                    style={[
                      styles.seriesRow,
                      index < seriesGroups.length - 1 && styles.seriesRowBorder,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.seriesRowTitle}>{seriesName}</Text>
                      <Text style={styles.seriesRowMeta}>{items.length} Sermons</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                  </Pressable>
                ))
              )}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  h1: { fontSize: 32, color: colors.foreground, fontFamily: typography.serif, lineHeight: 34 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: spacing[3], borderRadius: radii.xl, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, paddingHorizontal: spacing[4], paddingVertical: 12 },
  input: { flex: 1, color: colors.foreground, fontSize: 15, fontFamily: typography.sans, paddingVertical: 0 },
  clearBtn: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.white8 },
  chip: { minHeight: 36, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  chipActive: { borderColor: colors.emerald, backgroundColor: colors.emerald },
  chipText: { fontSize: 13, color: colors.mutedForeground, fontFamily: typography.sansSemi },
  chipTextActive: { color: theme === "dark" ? colors.background : "#fff" },
  count: { fontSize: 10, letterSpacing: 1.8, color: colors.mutedForeground, fontFamily: typography.sansSemi, marginBottom: spacing[3] },
  sectionHeader: { fontSize: 18, color: colors.foreground, fontFamily: typography.serif, marginBottom: spacing[3] },
  recentWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  recentPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.lg, backgroundColor: theme === "dark" ? "rgba(20, 26, 24, 0.7)" : "rgba(233, 236, 239, 0.7)", borderWidth: 1, borderColor: colors.hairline },
  recentText: { fontSize: 12, fontFamily: typography.sans, color: colors.foreground },
  seriesRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing[4], paddingHorizontal: spacing[2] },
  seriesRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  seriesRowTitle: { fontSize: 17, fontFamily: typography.serif, color: colors.foreground },
  seriesRowMeta: { fontSize: 12, fontFamily: typography.sans, color: colors.gold, marginTop: 2 },
  errorWrap: { alignItems: "center", gap: spacing[3] },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: radii.xl, backgroundColor: colors.emerald, marginTop: spacing[2] },
  retryBtnText: { fontSize: 14, fontFamily: typography.sansSemi, color: theme === "dark" ? colors.background : "#fff" },
});
