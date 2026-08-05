import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

import { radii, spacing, typography } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeProvider";
import { api, NoteCollection, Testimony } from "@/src/api/client";
import { useSettings } from "@/src/settings/SettingsContext";
import { useToast } from "@/src/toast/ToastContext";
import { DownloadModal } from "@/src/components/DownloadModal";
import { usePlayer } from "@/src/player/PlayerContext";
import { MiniPlayer } from "@/src/components/MiniPlayer";
import { buildTranscriptDocument, Paragraph, TranscriptDocument } from "@/src/models/transcriptDocument";
import { useReadingEngine } from "@/src/hooks/useReadingEngine";
import { ReadingParagraphRow } from "@/src/components/ReadingParagraphRow";
import { UserHighlight } from "@/src/utils/userStore";
import { Skeleton } from "@/src/components/Skeleton";

export default function ReadingModeScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; targetIndex?: string }>();
  const s = useSettings();
  const toast = useToast();
  const p = usePlayer();
  const { colors, theme } = useTheme();
  const styles = getStyles(colors, theme);

  const [sermon, setSermon] = useState<Testimony | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<string>(s.transcriptLanguage || "English");
  const [fontSize, setFontSize] = useState(s.fontSize || 16);
  const [highlights, setHighlights] = useState<UserHighlight[]>([]);

  // Action bottom sheet state
  const [selectedParagraph, setSelectedParagraph] = useState<Paragraph | null>(null);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  // Collection picker state
  const [isCollectionPickerOpen, setIsCollectionPickerOpen] = useState(false);
  const [collections, setCollections] = useState<NoteCollection[]>([]);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionTitle, setNewCollectionTitle] = useState("");

  const keyboardHeight = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "android" ? "keyboardDidShow" : "keyboardWillShow",
      (e) => {
        Animated.timing(keyboardHeight, {
          toValue: e.endCoordinates.height,
          duration: Platform.OS === "android" ? 200 : e.duration || 250,
          useNativeDriver: false,
        }).start();
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "android" ? "keyboardDidHide" : "keyboardWillHide",
      (e) => {
        Animated.timing(keyboardHeight, {
          toValue: 0,
          duration: Platform.OS === "android" ? 200 : (e ? e.duration : 250),
          useNativeDriver: false,
        }).start();
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const flashListRef = useRef<any>(null);

  const initialTargetNumber = params.targetIndex
    ? parseInt(params.targetIndex as string, 10) + 1
    : undefined;

  // Load sermon & highlights
  const loadSermonData = useCallback(async () => {
    if (!params.id) return;
    setLoading(true);
    try {
      const [data, hls] = await Promise.all([
        api.getTestimony(params.id),
        api.listHighlights(params.id).catch(() => []),
      ]);

      setSermon(data);
      setHighlights(hls);

      if (data.transcripts && data.transcripts.length > 0) {
        const avail = new Set(data.transcripts.map((t) => t.language));
        if (!avail.has(lang)) {
          setLang(data.transcripts[0].language || "English");
        }
      }
    } catch {
      toast.show("Failed to load sermon transcript", "error");
    } finally {
      setLoading(false);
    }
  }, [params.id, lang, toast]);

  useEffect(() => {
    loadSermonData();
  }, [loadSermonData]);

  // Active transcript & document
  const activeTranscript = useMemo(() => {
    if (!sermon?.transcripts) return null;
    return sermon.transcripts.find((t) => t.language === lang) || sermon.transcripts[0] || null;
  }, [sermon, lang]);

  const doc: TranscriptDocument | null = useMemo(() => {
    if (!sermon || !activeTranscript) return null;
    return buildTranscriptDocument(
      sermon.id,
      lang,
      activeTranscript.paragraphs || [],
      activeTranscript.text
    );
  }, [sermon, lang, activeTranscript]);

  const highlightedSet = useMemo(() => {
    const s = new Set<number>();
    highlights.forEach((h) => {
      const pNum = h.paragraph_number ?? h.paragraph_index;
      if (pNum !== undefined && pNum !== null) s.add(pNum);
    });
    return s;
  }, [highlights]);

  const isCurrentSermon = p.current?.id === sermon?.id;

  // Reading Engine
  const {
    autoFollow,
    activeParagraphNumber,
    showReturnToLive,
    targetGlowParagraphNumber,
    glowAnim,
    handleManualScrollBegin,
    handleReturnToLive,
    triggerGlow,
    hasReleasedDeepLinkLock,
  } = useReadingEngine({
    doc,
    playerPositionSeconds: p.position || 0,
    playerDurationSeconds: p.duration,
    isPlaying: p.playing,
    isCurrentSermon,
    initialTargetParagraphNumber: initialTargetNumber,
  });

  // ── One-shot deep-link scroll ──
  // Two conditions must both be true before scrollToIndex is reliable:
  //   1. FlashList has finished its initial measurement pass (onLoad fired)
  //   2. The transcript document is ready (doc is non-null)
  // We track condition 1 with a ref and trigger a re-check via state.
  const initialScrollFired = useRef(false);
  const flashListReady = useRef(false);
  const [flashListReadyTick, setFlashListReadyTick] = useState(0);

  const handleFlashListLoad = useCallback(() => {
    flashListReady.current = true;
    // Nudge the effect below to run
    setFlashListReadyTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (
      !initialScrollFired.current &&
      flashListReady.current &&
      initialTargetNumber &&
      doc?.paragraphs &&
      flashListRef.current
    ) {
      const targetIdx = doc.paragraphs.findIndex(
        (para) => para.paragraph_number === initialTargetNumber
      );
      if (targetIdx >= 0) {
        initialScrollFired.current = true;
        flashListRef.current.scrollToIndex({
          index: targetIdx,
          viewPosition: 0.42,
          animated: false, // instant on first open — no jarring animation
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, flashListReadyTick, initialTargetNumber]);

  // ── Live audio-follow auto-scroll ──
  // Guarded by hasReleasedDeepLinkLock: when Reading Mode is opened from a
  // deep link, this effect does NOT fire until the user taps "Return to Live".
  useEffect(() => {
    if (!hasReleasedDeepLinkLock.current) return;
    if (autoFollow && activeParagraphNumber && doc?.paragraphs && flashListRef.current) {
      const activeIdx = doc.paragraphs.findIndex(
        (p) => p.paragraph_number === activeParagraphNumber
      );
      if (activeIdx >= 0) {
        flashListRef.current.scrollToIndex({
          index: activeIdx,
          viewPosition: 0.42,
          animated: true,
        });
      }
    }
  }, [autoFollow, activeParagraphNumber, doc, hasReleasedDeepLinkLock]);

  // Font size adjustments
  const persistFont = (delta: number) => {
    const n = Math.max(14, Math.min(24, fontSize + delta));
    setFontSize(n);
    s.setFontSize(n);
  };

  // Available languages
  const availableLangs = useMemo(() => {
    if (!sermon?.transcripts) return [];
    return Array.from(new Set(sermon.transcripts.map((t) => t.language)));
  }, [sermon]);

  // Paragraph tap -> open action sheet
  const handleParagraphPress = useCallback((para: Paragraph) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedParagraph(para);
    setIsActionSheetOpen(true);
  }, []);

  // Action: Play From Here
  const handlePlayFromHere = async () => {
    if (!selectedParagraph || !sermon) return;
    setIsActionSheetOpen(false);

    p.play(sermon);
    if (selectedParagraph.start_seconds !== undefined) {
      p.seekTo(selectedParagraph.start_seconds);
    }

    if (doc?.paragraphs && flashListRef.current) {
      const idx = doc.paragraphs.findIndex(
        (p) => p.paragraph_number === selectedParagraph.paragraph_number
      );
      if (idx >= 0) {
        flashListRef.current.scrollToIndex({
          index: idx,
          viewPosition: 0.42,
          animated: true,
        });
      }
    }

    if (selectedParagraph.paragraph_number != null) {
      triggerGlow(selectedParagraph.paragraph_number);
    }
    toast.show("Playing from paragraph " + (selectedParagraph.paragraph_number ?? 1), "info");
  };

  // Action: Toggle Highlight (add if not highlighted, remove if highlighted)
  const handleToggleHighlight = async () => {
    if (!selectedParagraph || !sermon) return;

    const pNum = selectedParagraph.paragraph_number;
    const existingHl = highlights.find(h => 
      (h.paragraph_number ?? h.paragraph_index) === pNum
    );

    if (existingHl) {
      // ── Remove ──
      await api.deleteHighlight(existingHl.id);
      setHighlights((prev) => prev.filter((h) => h.id !== existingHl.id));
      toast.show("Highlight removed", "info");
      // Keep the sheet open so the user can see the UI change immediately
    } else {
      // ── Add ──
      const hl = await api.createHighlight(
        sermon.id,
        selectedParagraph.text,
        lang,
        selectedParagraph.paragraph_number ?? 0,
        selectedParagraph.start_seconds
      );
      setHighlights((prev) => [hl, ...prev]);
      toast.show("Saved to Highlights ⭐", "success");
      // Keep the sheet open so the user can see the UI change immediately
    }
  };

  // Action: Open Collection Picker ("Add To Notes")
  const handleOpenCollectionPicker = async () => {
    if (!selectedParagraph || !sermon) return;
    setIsActionSheetOpen(false);
    Haptics.selectionAsync().catch(() => {});

    const cols = await api.listCollections().catch(() => []);
    setCollections(cols);
    setIsCreatingCollection(cols.length === 0);
    setNewCollectionTitle("");
    setIsCollectionPickerOpen(true);
  };

  // Save passage to a chosen collection
  const handleSaveToCollection = async (collection: NoteCollection) => {
    if (!selectedParagraph || !sermon) return;
    setIsCollectionPickerOpen(false);

    await api.saveNote({
      collection_id: collection.id,
      testimony_id: sermon.id,
      testimony_title: sermon.title,
      speaker: sermon.speaker,
      date_code: sermon.year ? String(sermon.year) : undefined,
      language: lang,
      paragraph_number: selectedParagraph.paragraph_number ?? 0,
      text: selectedParagraph.text,
      timestamp: selectedParagraph.start_seconds,
    });

    toast.show(`Saved to "${collection.title}" 📝`, "success");
  };

  // Create a new collection then save to it
  const handleCreateAndSave = async () => {
    const title = newCollectionTitle.trim();
    if (!title) {
      toast.show("Please enter a collection name", "error");
      return;
    }

    const col = await api.createCollection(title).catch(() => null);
    if (!col) {
      toast.show("Failed to create collection", "error");
      return;
    }

    await handleSaveToCollection(col);
    setCollections((prev) => [col, ...prev]);
  };

  // Action: Copy Text
  const handleCopyParagraph = async () => {
    if (!selectedParagraph) return;
    setIsActionSheetOpen(false);
    await Clipboard.setStringAsync(selectedParagraph.text);
    toast.show("Copied to clipboard", "success");
  };

  // FlashList row renderer
  const renderRow = useCallback(
    ({ item }: { item: Paragraph }) => {
      const isActive = activeParagraphNumber === item.paragraph_number;
      const isTargetGlow = targetGlowParagraphNumber === item.paragraph_number;
      const isHL = item.paragraph_number != null ? highlightedSet.has(item.paragraph_number) : false;

      return (
        <ReadingParagraphRow
          item={item}
          fontSize={fontSize}
          isActive={isActive}
          isHighlighted={isHL}
          isAutoFollowing={autoFollow}
          isPlaying={p.playing && isCurrentSermon}
          isTargetGlow={isTargetGlow}
          glowAnim={glowAnim}
          onPress={handleParagraphPress}
        />
      );
    },
    [
      activeParagraphNumber,
      autoFollow,
      fontSize,
      glowAnim,
      handleParagraphPress,
      isCurrentSermon,
      p.playing,
      targetGlowParagraphNumber,
      highlightedSet,
    ]
  );

  const estimatedItemSize = Math.round(fontSize * 1.7 * 3.5 + 24);

  const returnToLiveAnim = useRef(new Animated.Value(showReturnToLive ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(returnToLiveAnim, {
      toValue: showReturnToLive ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [showReturnToLive, returnToLiveAnim]);

  const renderListHeader = useCallback(() => {
    if (!sermon) return null;
    const rawTitle = sermon.title || "";
    const displayTitle = rawTitle.replace(/^\d{2}-\d{4}[A-Z\d]*\s*/i, "").trim() || rawTitle;
    const sermonCode = sermon.verse || (rawTitle.match(/^\d{2}-\d{4}[A-Z\d]*/i)?.[0] || "");
    const location = sermon.category && sermon.category !== "General" ? sermon.category : "OAKLAND CALIFORNIA U.S.A.";

    return (
      <View style={styles.titleHeaderContainer}>
        <Text style={[styles.titleHeaderTitle, { fontSize: Math.round(fontSize * 1.45) }]}>
          {displayTitle}
        </Text>
        {sermonCode ? (
          <Text style={[styles.titleHeaderCode, { fontSize: Math.round(fontSize * 1.05) }]}>
            {sermonCode}
          </Text>
        ) : null}
        <Text style={styles.titleHeaderLocation}>{location.toUpperCase()}</Text>
      </View>
    );
  }, [sermon, fontSize, styles]);

  if (loading || !sermon) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing[4], paddingHorizontal: spacing[5] }]}>
        <View style={{ gap: spacing[4], marginTop: spacing[6] }}>
          <Skeleton style={{ height: 28, width: "70%" }} />
          <Skeleton style={{ height: 16, width: "40%" }} />
          <Skeleton style={{ height: 80, width: "100%", marginTop: spacing[4] }} />
          <Skeleton style={{ height: 120, width: "100%" }} />
          <Skeleton style={{ height: 90, width: "100%" }} />
          <Skeleton style={{ height: 110, width: "100%" }} />
        </View>
      </View>
    );
  }

  const isMiniPlayerActive = Boolean(p.current && !p.isDismissed);
  const dockHeight = isMiniPlayerActive ? 68 + Math.max(insets.bottom, 12) : 0;
  const bottomPadding = dockHeight + 16;
  const returnToLiveBottom = dockHeight + 14;

  const returnToLiveOpacity = returnToLiveAnim;
  const returnToLiveTranslateY = returnToLiveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Minimal Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.topBtn}>
          <Ionicons name="chevron-down" size={24} color={colors.foreground} />
        </Pressable>

        <View style={styles.titleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {sermon ? (sermon.verse ? `${sermon.verse} ${sermon.title.replace(/^\d{2}-\d{4}[A-Z\d]*\s*/i, "")}` : sermon.title) : ""}
          </Text>
        </View>

        {/* Language & Font Controls */}
        <View style={styles.controlsWrap}>
          {availableLangs.length > 1 ? (
            <Pressable
              onPress={() => {
                const nextLang = availableLangs.find((l) => l !== lang) || availableLangs[0];
                setLang(nextLang);
              }}
              style={styles.langPill}
            >
              <Text style={styles.langPillText}>
                {lang === "English" || lang === "en" ? "EN" : lang === "Telugu" || lang === "te" ? "TE" : lang}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => setShowDownloadModal(true)}
            style={styles.langPill}
            accessibilityRole="button"
            accessibilityLabel="Download sermon audio or official transcript PDF"
          >
            <Ionicons name="download-outline" size={16} color={colors.foreground} />
          </Pressable>

          <View style={styles.fontPill}>
            <Pressable onPress={() => persistFont(-1)} style={styles.fontBtn}>
              <Text style={styles.fontBtnText}>A-</Text>
            </Pressable>
            <Pressable onPress={() => persistFont(+1)} style={styles.fontBtn}>
              <Text style={[styles.fontBtnText, { color: colors.foreground }]}>A+</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Main Continuous FlashList Document */}
      <View style={{ flex: 1 }}>
        {!doc || doc.paragraphs.length === 0 ? (
          <Text style={styles.emptyText}>Transcript unavailable</Text>
        ) : (
          <FlashList
            ref={flashListRef}
            data={doc.paragraphs}
            keyExtractor={(item, index) => `${sermon.id}_${item.paragraph_number ?? `idx_${index}`}`}
            renderItem={renderRow}
            ListHeaderComponent={renderListHeader}
            onLoad={handleFlashListLoad}
            extraData={{
              activeParagraphNumber,
              targetGlowParagraphNumber,
              autoFollow,
              isPlaying: p.playing,
              isCurrentSermon,
              fontSize,
              highlightedSet,
            }}
            onScrollBeginDrag={handleManualScrollBegin}
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingBottom: bottomPadding,
            }}
          />
        )}
      </View>

      {/* Floating Circular "Return to Live" Button */}
      <Animated.View
        pointerEvents={showReturnToLive ? "auto" : "none"}
        style={[
          styles.returnToLiveWrap,
          {
            bottom: returnToLiveBottom,
            opacity: returnToLiveOpacity,
            transform: [{ translateY: returnToLiveTranslateY }],
          },
        ]}
      >
        <Pressable
          onPress={() => {
            handleReturnToLive((activeNum) => {
              if (doc?.paragraphs && flashListRef.current) {
                const idx = doc.paragraphs.findIndex(
                  (p) => p.paragraph_number === activeNum
                );
                if (idx >= 0) {
                  flashListRef.current.scrollToIndex({
                    index: idx,
                    viewPosition: 0.42,
                    animated: true,
                  });
                }
              }
            });
          }}
          style={styles.returnToLiveBtn}
        >
          <Ionicons name="arrow-up" size={16} color={colors.background} />
          <Text style={styles.returnToLiveText}>Return to Live</Text>
        </Pressable>
      </Animated.View>

      {/* Curved Bottom Dock for Mini Player */}
      {isMiniPlayerActive && (
        <View
          style={[
            styles.bottomDock,
            {
              height: dockHeight,
              backgroundColor: theme === "dark" ? "rgba(11,15,14,0.98)" : "rgba(250,250,250,0.98)",
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={{ paddingHorizontal: spacing[3] }}>
            <MiniPlayer />
          </View>
        </View>
      )}

      {/* ─── Paragraph Action Bottom Sheet ─── */}
      {isActionSheetOpen && selectedParagraph ? (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <Pressable style={styles.sheetOverlay} onPress={() => setIsActionSheetOpen(false)} />
          <View style={[styles.sheetContent, { backgroundColor: colors.background, borderColor: colors.hairline }]}>
            <View style={styles.sheetHandle} />

            <Text style={styles.sheetHeader}>
              Paragraph {selectedParagraph.paragraph_number}
            </Text>

            <View style={{ gap: spacing[3], marginTop: spacing[4] }}>
              {/* Play From Here */}
              <Pressable style={[styles.sheetBtn, { backgroundColor: colors.emerald }]} onPress={handlePlayFromHere}>
                <Ionicons name="play" size={18} color={theme === "dark" ? colors.background : "#fff"} />
                <Text style={[styles.sheetBtnText, { color: theme === "dark" ? colors.background : "#fff" }]}>
                  Play From Here
                </Text>
              </Pressable>

              {/* Highlight toggle */}
              {(() => {
                const pNum = selectedParagraph.paragraph_number;
                const isHL = pNum != null ? highlightedSet.has(pNum) : false;
                return (
                  <Pressable
                    style={[styles.sheetBtn, {
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: isHL ? colors.gold : colors.hairline,
                    }]}
                    onPress={handleToggleHighlight}
                  >
                    <Ionicons
                      name={isHL ? "checkmark-circle" : "star-outline"}
                      size={18}
                      color={isHL ? colors.gold : colors.foreground}
                    />
                    <Text style={[styles.sheetBtnText, { color: isHL ? colors.gold : colors.foreground }]}>
                      {isHL ? "✓ Remove Highlight" : "Highlight"}
                    </Text>
                  </Pressable>
                );
              })()}

              {/* Add To Notes */}
              <Pressable
                style={[styles.sheetBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline }]}
                onPress={handleOpenCollectionPicker}
              >
                <Ionicons name="journal-outline" size={18} color={colors.foreground} />
                <Text style={[styles.sheetBtnText, { color: colors.foreground }]}>Add To Notes</Text>
              </Pressable>

              {/* Copy Text */}
              <Pressable
                style={[styles.sheetBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline }]}
                onPress={handleCopyParagraph}
              >
                <Ionicons name="copy-outline" size={18} color={colors.foreground} />
                <Text style={[styles.sheetBtnText, { color: colors.foreground }]}>Copy Text</Text>
              </Pressable>

              {/* Cancel */}
              <Pressable style={[styles.sheetBtn, { backgroundColor: "transparent" }]} onPress={() => setIsActionSheetOpen(false)}>
                <Text style={[styles.sheetBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {/* ─── Select / Create Collection Sheet ─── */}
      {isCollectionPickerOpen ? (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <Pressable style={styles.sheetOverlay} onPress={() => setIsCollectionPickerOpen(false)} />
          <Animated.View
            style={[
              styles.sheetContent,
              {
                backgroundColor: colors.background,
                borderColor: colors.hairline,
                bottom: keyboardHeight,
              },
            ]}
          >
            <View style={styles.sheetHandle} />

            <Text style={styles.sheetHeader}>
              {isCreatingCollection ? "Create Collection" : "Add To Notes"}
            </Text>

            {isCreatingCollection ? (
              /* Create new collection form */
              <View style={{ marginTop: spacing[4] }}>
                <TextInput
                  autoFocus
                  value={newCollectionTitle}
                  onChangeText={setNewCollectionTitle}
                  placeholder="e.g. Sunday Morning, Faith Series…"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.collectionInput, { color: colors.foreground, borderColor: colors.hairline }]}
                />
                <Pressable
                  style={[styles.sheetBtn, { backgroundColor: colors.emerald, marginTop: spacing[3] }]}
                  onPress={handleCreateAndSave}
                >
                  <Ionicons name="add" size={18} color={theme === "dark" ? colors.background : "#fff"} />
                  <Text style={[styles.sheetBtnText, { color: theme === "dark" ? colors.background : "#fff" }]}>Create</Text>
                </Pressable>
                {collections.length > 0 && (
                  <Pressable
                    style={[styles.sheetBtn, { backgroundColor: "transparent", marginTop: spacing[1] }]}
                    onPress={() => setIsCreatingCollection(false)}
                  >
                    <Text style={[styles.sheetBtnText, { color: colors.mutedForeground }]}>Choose Existing</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.sheetBtn, { backgroundColor: "transparent", marginTop: spacing[1] }]}
                  onPress={() => setIsCollectionPickerOpen(false)}
                >
                  <Text style={[styles.sheetBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              /* Existing collection list */
              <ScrollView style={{ maxHeight: 340, marginTop: spacing[4] }} showsVerticalScrollIndicator={false}>
                {collections.map((col) => (
                  <Pressable
                    key={col.id}
                    style={[styles.collectionRow, { borderColor: colors.hairline }]}
                    onPress={() => handleSaveToCollection(col)}
                  >
                    <Ionicons name="folder-outline" size={18} color={colors.emerald} />
                    <Text style={[styles.collectionRowText, { color: colors.foreground }]} numberOfLines={1}>
                      {col.title}
                    </Text>
                  </Pressable>
                ))}

                <Pressable
                  style={[styles.collectionRow, { borderColor: colors.hairline }]}
                  onPress={() => setIsCreatingCollection(true)}
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.emerald} />
                  <Text style={[styles.collectionRowText, { color: colors.emerald }]}>+ Create New Collection</Text>
                </Pressable>

                <Pressable
                  style={[styles.sheetBtn, { backgroundColor: "transparent", marginTop: spacing[2] }]}
                  onPress={() => setIsCollectionPickerOpen(false)}
                >
                  <Text style={[styles.sheetBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
              </ScrollView>
            )}
          </Animated.View>
        </View>
      ) : null}

      {/* Download Modal for Audio and Official PDF */}
      <DownloadModal
        visible={showDownloadModal}
        testimony={sermon}
        onClose={() => setShowDownloadModal(false)}
      />
    </View>
  );
}

const getStyles = (colors: any, theme: string) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    topBtn: {
      padding: spacing[2],
    },
    titleWrap: {
      flex: 1,
      paddingHorizontal: spacing[2],
    },
    headerTitle: {
      fontSize: 16,
      fontFamily: typography.serif,
      color: colors.foreground,
    },
    controlsWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing[2],
    },
    langPill: {
      paddingHorizontal: spacing[2],
      paddingVertical: 4,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    langPillText: {
      fontSize: 12,
      fontFamily: typography.sansSemi,
      color: colors.foreground,
    },
    fontPill: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    fontBtn: {
      paddingHorizontal: spacing[2],
      paddingVertical: 4,
    },
    fontBtnText: {
      fontSize: 12,
      fontFamily: typography.sansSemi,
      color: colors.mutedForeground,
    },
    titleHeaderContainer: {
      paddingTop: spacing[8],
      paddingBottom: spacing[6],
      alignItems: "center",
      justifyContent: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
      marginBottom: spacing[4],
    },
    titleHeaderTitle: {
      fontFamily: typography.serif,
      fontStyle: "italic",
      color: theme === "dark" ? "rgba(245,245,240,0.95)" : "rgba(11,15,14,0.95)",
      textAlign: "center",
      marginBottom: spacing[2],
    },
    titleHeaderCode: {
      fontFamily: typography.serif,
      color: colors.mutedForeground,
      textAlign: "center",
      marginBottom: spacing[3],
    },
    titleHeaderLocation: {
      fontFamily: typography.sansMedium,
      fontSize: 12,
      letterSpacing: 2,
      color: colors.mutedForeground,
      textAlign: "center",
      textTransform: "uppercase",
      opacity: 0.7,
    },
    headerBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing[4],
      height: 52,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    emptyText: {
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 40,
      fontFamily: typography.sans,
    },
    returnToLiveWrap: {
      position: "absolute",
      bottom: 90,
      right: spacing[4],
      zIndex: 99,
    },
    returnToLiveBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing[2],
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
      borderRadius: 999,
      backgroundColor: colors.emerald,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    returnToLiveText: {
      fontSize: 13,
      fontFamily: typography.sansSemi,
      color: theme === "dark" ? colors.background : "#fff",
    },
    dockedPlayerWrap: {
      position: "absolute",
      left: spacing[3],
      right: spacing[3],
    },
    bottomDock: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      borderTopLeftRadius: radii["3xl"],
      borderTopRightRadius: radii["3xl"],
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
      justifyContent: "flex-end",
      overflow: "hidden",
      zIndex: 90,
    },
    sheetOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.6)",
    },
    sheetContent: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      borderTopLeftRadius: radii["3xl"],
      borderTopRightRadius: radii["3xl"],
      padding: spacing[5],
      paddingTop: spacing[3],
      paddingBottom: spacing[10],
      borderWidth: 1,
      borderBottomWidth: 0,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.white10,
      alignSelf: "center",
      marginBottom: spacing[3],
    },
    sheetHeader: {
      fontSize: 18,
      fontFamily: typography.serif,
      color: colors.foreground,
      textAlign: "center",
    },
    sheetBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing[2],
      height: 48,
      borderRadius: radii.xl,
    },
    sheetBtnText: {
      fontSize: 14,
      fontFamily: typography.sansSemi,
    },
    collectionInput: {
      height: 48,
      paddingHorizontal: spacing[4],
      borderRadius: radii.xl,
      borderWidth: 1,
      fontFamily: typography.sans,
      fontSize: 15,
    },
    collectionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing[3],
      paddingVertical: spacing[3],
      paddingHorizontal: spacing[2],
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    collectionRowText: {
      flex: 1,
      fontSize: 15,
      fontFamily: typography.sans,
    },
  });
