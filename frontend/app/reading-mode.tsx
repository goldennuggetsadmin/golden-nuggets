import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
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
import { usePlayer } from "@/src/player/PlayerContext";
import { MiniPlayer } from "@/src/components/MiniPlayer";
import { buildTranscriptDocument, Paragraph, TranscriptDocument } from "@/src/models/transcriptDocument";
import { useReadingEngine } from "@/src/hooks/useReadingEngine";
import { ReadingParagraphRow } from "@/src/components/ReadingParagraphRow";
import { UserHighlight } from "@/src/utils/userStore";

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

  // Collection picker state
  const [isCollectionPickerOpen, setIsCollectionPickerOpen] = useState(false);
  const [collections, setCollections] = useState<NoteCollection[]>([]);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionTitle, setNewCollectionTitle] = useState("");

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
      activeTranscript.text,
      highlights
    );
  }, [sermon, lang, activeTranscript, highlights]);

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

    triggerGlow(selectedParagraph.paragraph_number);
    toast.show("Playing from paragraph " + selectedParagraph.paragraph_number, "info");
  };

  // Action: Toggle Highlight (add if not highlighted, remove if highlighted)
  const handleToggleHighlight = async () => {
    if (!selectedParagraph || !sermon) return;

    // Derive live state from doc so we always act on current truth,
    // not the stale snapshot captured when the sheet was opened.
    const livePara = doc?.paragraphs.find(
      (p) => p.paragraph_number === selectedParagraph.paragraph_number
    );

    if (livePara?.isHighlighted && livePara.highlightId) {
      // ── Remove ──
      await api.deleteHighlight(livePara.highlightId);
      setHighlights((prev) => prev.filter((h) => h.id !== livePara.highlightId));
      toast.show("Highlight removed", "info");
      // Keep the sheet open so the user can see the UI change immediately
    } else {
      // ── Add ──
      const hl = await api.createHighlight(
        sermon.id,
        selectedParagraph.text,
        lang,
        selectedParagraph.paragraph_number,
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
      paragraph_number: selectedParagraph.paragraph_number,
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

      return (
        <ReadingParagraphRow
          item={item}
          fontSize={fontSize}
          isActive={isActive}
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
    ]
  );

  const estimatedItemSize = Math.round(fontSize * 1.7 * 3.5 + 24);

  if (loading || !sermon) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing[4], paddingHorizontal: spacing[5] }]}>
        <Text style={{ color: colors.mutedForeground, marginTop: 40 }}>Loading Reading Mode…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Minimal Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.topBtn}>
          <Ionicons name="chevron-down" size={24} color={colors.foreground} />
        </Pressable>

        <View style={styles.titleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {sermon.title}
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
            onLoad={handleFlashListLoad}
            extraData={{
              activeParagraphNumber,
              targetGlowParagraphNumber,
              autoFollow,
              isPlaying: p.playing,
              isCurrentSermon,
              fontSize,
            }}
            onScrollBeginDrag={handleManualScrollBegin}
            contentContainerStyle={{
              paddingHorizontal: spacing[3],
              paddingBottom: insets.bottom + 140,
            }}
          />
        )}
      </View>

      {/* Floating Circular "Return to Live" Button */}
      {showReturnToLive ? (
        <Animated.View style={styles.returnToLiveWrap}>
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
      ) : null}

      {/* Persistent Docked Player */}
      <View style={styles.dockedPlayerWrap}>
        <MiniPlayer />
      </View>

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

              {/* Highlight toggle — derives live state from doc, not stale selectedParagraph */}
              {(() => {
                const livePara = doc?.paragraphs.find(
                  (p) => p.paragraph_number === selectedParagraph.paragraph_number
                );
                const isHL = livePara?.isHighlighted ?? selectedParagraph.isHighlighted;
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
          <View style={[styles.sheetContent, { backgroundColor: colors.background, borderColor: colors.hairline }]}>
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
          </View>
        </View>
      ) : null}
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
      bottom: 0,
      left: 0,
      right: 0,
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
