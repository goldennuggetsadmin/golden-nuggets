import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { api, Testimony } from "@/src/api/client";
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
const PAGE_SIZE = 20;

interface YearSummary {
  year: number;
  sermonCount: number;
}

interface StateSummary {
  state: string;
  sermonCount: number;
}

interface SeriesSummary {
  name: string;
  sermonCount: number;
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { appLanguage } = useSettings();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  // Search input state (un-debounced for 60 FPS typing responsiveness)
  const [inputText, setInputText] = useState("");
  // Debounced search query state
  const [searchQuery, setSearchQuery] = useState("");

  const [activeTab, setActiveTab] = useState<SearchTab>("Title");
  
  // Paginated Sermons State (Title Tab / Search Results)
  const [sermons, setSermons] = useState<Testimony[]>([]);
  const [page, setPage] = useState(1);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Tab Summaries State
  const [yearSummaries, setYearSummaries] = useState<YearSummary[]>([]);
  const [stateSummaries, setStateSummaries] = useState<StateSummary[]>([]);
  const [seriesSummaries, setSeriesSummaries] = useState<SeriesSummary[]>([]);
  const [loadingTabSummary, setLoadingTabSummary] = useState(false);

  const isMountedRef = useRef(true);
  const lastLangRef = useRef<string>("");

  // 1. Debounce raw input text -> searchQuery (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(inputText.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [inputText]);

  // 2. Fetch Initial Page of Sermons (Page 1)
  const fetchInitialSermons = useCallback(async (q: string, lang: string) => {
    if (!isMountedRef.current) return;
    setLoadingInitial(true);
    setHasError(false);
    try {
      const res = await api.searchPaginated(q, undefined, lang, 1, PAGE_SIZE);
      if (!isMountedRef.current) return;
      setSermons(res.items);
      setTotalCount(res.total);
      setHasMore(res.has_more);
      setNextCursor(res.next_cursor);
      setPage(1);

      console.log(`[SearchScreen] Page 1 Loaded: returned ${res.items.length}/${res.total}, has_more=${res.has_more}`);
    } catch (err) {
      console.error("[SearchScreen] Initial fetch error:", err);
      if (isMountedRef.current) setHasError(true);
    } finally {
      if (isMountedRef.current) {
        setLoadingInitial(false);
        setRefreshing(false);
      }
    }
  }, []);

  // 3. Fetch Next Page of Sermons (Infinite Scroll)
  const fetchNextPage = useCallback(async () => {
    if (!hasMore || loadingMore || loadingInitial) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await api.searchPaginated(
        searchQuery,
        undefined,
        appLanguage,
        nextPage,
        PAGE_SIZE,
        nextCursor
      );
      if (!isMountedRef.current) return;

      setSermons((prev) => [...prev, ...res.items]);
      setHasMore(res.has_more);
      setNextCursor(res.next_cursor);
      setPage(nextPage);

      console.log(`[SearchScreen] Loaded Page ${nextPage}: +${res.items.length} items`);
    } catch (err) {
      console.error(`[SearchScreen] Page ${nextPage} fetch error:`, err);
    } finally {
      if (isMountedRef.current) setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loadingInitial, page, searchQuery, appLanguage, nextCursor]);

  // 4. Fetch Tab Summaries (Year, State, Series)
  const fetchTabSummary = useCallback(async (tab: SearchTab, lang: string) => {
    setLoadingTabSummary(true);
    try {
      if (tab === "Year") {
        const years = await api.years(lang);
        if (isMountedRef.current) setYearSummaries(years);
      } else if (tab === "State") {
        const states = await api.statesSummary(lang);
        if (isMountedRef.current) setStateSummaries(states);
      } else if (tab === "Series") {
        const series = await api.seriesSummary(lang);
        if (isMountedRef.current) setSeriesSummaries(series);
      }
    } catch (err) {
      console.error(`[SearchScreen] Tab summary fetch error for ${tab}:`, err);
    } finally {
      if (isMountedRef.current) setLoadingTabSummary(false);
    }
  }, []);

  // Trigger search whenever debounced searchQuery or appLanguage changes
  useEffect(() => {
    fetchInitialSermons(searchQuery, appLanguage);
    if (activeTab !== "Title") {
      fetchTabSummary(activeTab, appLanguage);
    }
  }, [searchQuery, appLanguage, fetchInitialSermons, fetchTabSummary, activeTab]);

  // Handle Tab Switching
  const handleTabPress = (tab: SearchTab) => {
    setActiveTab(tab);
    if (tab !== "Title") {
      fetchTabSummary(tab, appLanguage);
    }
  };

  // Focus effect: ensure mounted flag
  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
      };
    }, [])
  );

  // FlatList Render Item Callback for Sermon Cards
  const renderSermonItem = useCallback(({ item }: { item: Testimony }) => (
    <View style={{ paddingHorizontal: spacing[5] }}>
      <SermonCard sermon={item} horizontal />
    </View>
  ), []);

  // Key Extractor
  const keyExtractor = useCallback((item: Testimony) => item.id, []);

  // FlatList Header Component
  const renderHeader = useMemo(() => (
    <View>
      <View style={{ paddingHorizontal: spacing[5], paddingBottom: spacing[3] }}>
        <Text style={styles.h1}>Search</Text>
      </View>

      {/* Language Selector */}
      <View style={{ paddingHorizontal: spacing[5], marginBottom: spacing[3] }}>
        <LanguageSelector testID="search-lang-selector" />
      </View>

      {/* Global Search Bar */}
      <View style={{ paddingHorizontal: spacing[5] }}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            testID="search-input"
            value={inputText}
            onChangeText={setInputText}
            placeholder="Search sermons, series, years..."
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
            autoCorrect={false}
            returnKeyType="search"
          />
          {inputText ? (
            <Pressable testID="search-clear" onPress={() => setInputText("")} style={styles.clearBtn}>
              <Ionicons name="close" size={14} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Search Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing[5], gap: spacing[2], paddingTop: spacing[4], paddingBottom: spacing[2] }}
      >
        {SEARCH_TABS.map((tab) => {
          const active = activeTab === tab;
          return (
            <Pressable
              key={tab}
              testID={`search-tab-${tab}`}
              onPress={() => handleTabPress(tab)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{tab}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Results Header Label */}
      {(searchQuery.length > 0 || activeTab === "Title") && (
        <View style={{ paddingHorizontal: spacing[5], marginTop: spacing[3], marginBottom: spacing[3] }}>
          <Text style={styles.count}>
            {loadingInitial
              ? "SEARCHING…"
              : searchQuery.length > 0
              ? `${totalCount} RESULT${totalCount === 1 ? "" : "S"}`
              : `${totalCount} SERMONS AVAILABLE`}
          </Text>
        </View>
      )}
    </View>
  ), [inputText, searchQuery, activeTab, colors, styles, loadingInitial, totalCount]);

  // FlatList Footer Component (Spinner / End of list message)
  const renderFooter = useCallback(() => {
    if (loadingMore) {
      return (
        <View style={{ paddingVertical: spacing[4], alignItems: "center" }}>
          <ActivityIndicator size="small" color={colors.emerald} />
        </View>
      );
    }
    return null;
  }, [loadingMore, colors.emerald]);

  // FlatList Empty Component
  const renderEmpty = useCallback(() => {
    if (loadingInitial) {
      return (
        <View style={{ paddingHorizontal: spacing[5], gap: spacing[2] }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} style={{ height: 72, borderRadius: radii.md, marginTop: spacing[2] }} />
          ))}
        </View>
      );
    }
    if (hasError) {
      return (
        <View style={styles.errorWrap}>
          <EmptyState icon="cloud-offline-outline" title="Unable to Connect" message="Could not connect to server. Please check your connection." />
          <Pressable style={styles.retryBtn} onPress={() => fetchInitialSermons(searchQuery, appLanguage)}>
            <Text style={styles.retryBtnText}>Tap to Retry</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={{ paddingHorizontal: spacing[5] }}>
        <EmptyState
          icon="search-outline"
          title="No sermons found"
          message={searchQuery ? `No sermons matching "${searchQuery}" in this language.` : "No sermons available for this language."}
        />
      </View>
    );
  }, [loadingInitial, hasError, searchQuery, appLanguage, fetchInitialSermons, styles]);

  // Main Render: Virtualized FlatList for Title Tab & Search Results
  if (activeTab === "Title" || searchQuery.length > 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <FlatList
          data={sermons}
          renderItem={renderSermonItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={{
            paddingTop: insets.top + spacing[2],
            paddingBottom: TAB_BAR_INSET,
          }}
          onEndReached={fetchNextPage}
          onEndReachedThreshold={0.5}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS === "android"}
          keyboardShouldPersistTaps="handled"
        />
      </View>
    );
  }

  // Render for Year, State, Series Tabs (Summary Views)
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + spacing[2], paddingBottom: TAB_BAR_INSET }}
      keyboardShouldPersistTaps="handled"
    >
      {renderHeader}

      <View style={{ paddingHorizontal: spacing[5] }}>
        {/* YEAR TAB */}
        {activeTab === "Year" && (
          loadingTabSummary && yearSummaries.length === 0 ? (
            <View style={{ gap: spacing[2] }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} style={{ height: 60, borderRadius: radii.md, marginTop: spacing[2] }} />
              ))}
            </View>
          ) : yearSummaries.length === 0 ? (
            <EmptyState icon="calendar-outline" title="No sermons" message="No sermons found for this language." />
          ) : (
            yearSummaries.map((ys) => (
              <ExpandableGroup
                key={String(ys.year)}
                title={String(ys.year)}
                count={ys.sermonCount}
                subtitle="Sermons"
                items={searchResults.filter((s) => String(s.year) === String(ys.year))}
              />
            ))
          )
        )}

        {/* STATE TAB */}
        {activeTab === "State" && (
          loadingTabSummary && stateSummaries.length === 0 ? (
            <View style={{ gap: spacing[2] }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} style={{ height: 60, borderRadius: radii.md, marginTop: spacing[2] }} />
              ))}
            </View>
          ) : stateSummaries.length === 0 ? (
            <EmptyState icon="location-outline" title="No locations" message="No location data for this language." />
          ) : (
            stateSummaries.map((st) => (
              <ExpandableGroup
                key={st.state}
                title={st.state}
                count={st.sermonCount}
                subtitle="Sermons"
                items={searchResults.filter((s) => s.state && String(s.state).trim() === String(st.state).trim())}
              />
            ))
          )
        )}

        {/* SERIES TAB */}
        {activeTab === "Series" && (
          loadingTabSummary && seriesSummaries.length === 0 ? (
            <View style={{ gap: spacing[2] }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} style={{ height: 56, borderRadius: radii.md, marginTop: spacing[2] }} />
              ))}
            </View>
          ) : seriesSummaries.length === 0 ? (
            <EmptyState icon="albums-outline" title="No series" message="No series available in this language." />
          ) : (
            seriesSummaries.map((item, index) => (
              <Pressable
                key={item.name}
                onPress={() => router.push({ pathname: "/series", params: { title: item.name } })}
                style={[
                  styles.seriesRow,
                  index < seriesSummaries.length - 1 && styles.seriesRowBorder,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.seriesRowTitle}>{item.name}</Text>
                  <Text style={styles.seriesRowMeta}>{item.sermonCount} Sermons</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              </Pressable>
            ))
          )
        )}
      </View>
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
  count: { fontSize: 10, letterSpacing: 1.8, color: colors.mutedForeground, fontFamily: typography.sansSemi },
  seriesRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing[4], paddingHorizontal: spacing[2] },
  seriesRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  seriesRowTitle: { fontSize: 17, fontFamily: typography.serif, color: colors.foreground },
  seriesRowMeta: { fontSize: 12, fontFamily: typography.sans, color: colors.gold, marginTop: 2 },
  errorWrap: { alignItems: "center", gap: spacing[3] },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: radii.xl, backgroundColor: colors.emerald, marginTop: spacing[2] },
  retryBtnText: { fontSize: 14, fontFamily: typography.sansSemi, color: theme === "dark" ? colors.background : "#fff" },
});
