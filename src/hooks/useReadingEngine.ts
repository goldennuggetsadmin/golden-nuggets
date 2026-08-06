import { useCallback, useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import { Paragraph, TranscriptDocument } from "../models/transcriptDocument";
import { defaultTimingProvider, ParagraphTimingProvider } from "./timingProvider";
import { api } from "../api/client";

export interface UseReadingEngineParams {
  doc: TranscriptDocument | null;
  playerPositionSeconds: number;
  playerDurationSeconds?: number;
  isPlaying: boolean;
  isCurrentSermon: boolean;
  initialTargetParagraphNumber?: number;
  timingProvider?: ParagraphTimingProvider;
}

export function useReadingEngine({
  doc,
  playerPositionSeconds,
  playerDurationSeconds,
  isPlaying,
  isCurrentSermon,
  initialTargetParagraphNumber,
  timingProvider = defaultTimingProvider,
}: UseReadingEngineParams) {
  // When opened from a deep link (highlight / note), lock auto-follow off so the audio
  // position cannot scroll away from the requested paragraph before the user sees it.
  const openedFromDeepLink = !!(initialTargetParagraphNumber && initialTargetParagraphNumber > 0);

  const [autoFollow, setAutoFollow] = useState<boolean>(!openedFromDeepLink);
  const [activeParagraphNumber, setActiveParagraphNumber] = useState<number | null>(null);
  const [manualScrolledParagraphNumber, setManualScrolledParagraphNumber] = useState<number | null>(
    initialTargetParagraphNumber ?? null
  );
  // Show "Return to Live" immediately when opened from a deep link, so the user can
  // choose to resume audio-following at any time without any extra tap.
  const [showReturnToLive, setShowReturnToLive] = useState<boolean>(openedFromDeepLink);
  const [targetGlowParagraphNumber, setTargetGlowParagraphNumber] = useState<number | null>(
    initialTargetParagraphNumber ?? null
  );

  const glowAnim = useRef(new Animated.Value(0)).current;
  // Guard: skip the first auto-scroll tick so initialTargetParagraphNumber scroll wins.
  const hasReleasedDeepLinkLock = useRef(!openedFromDeepLink);

  // Trigger target paragraph glow animation
  const triggerGlow = useCallback(
    (paraNum: number) => {
      setTargetGlowParagraphNumber(paraNum);
      glowAnim.setValue(0);
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.delay(1000),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: false,
        }),
      ]).start(() => {
        setTargetGlowParagraphNumber(null);
      });
    },
    [glowAnim]
  );

  // Initial target paragraph glow if passed
  useEffect(() => {
    if (initialTargetParagraphNumber && initialTargetParagraphNumber > 0) {
      triggerGlow(initialTargetParagraphNumber);
    }
  }, [initialTargetParagraphNumber, triggerGlow]);

  // Active paragraph tracking during playback
  useEffect(() => {
    if (!doc || !isCurrentSermon) {
      setActiveParagraphNumber(null);
      return;
    }

    const activeNum = timingProvider.findActiveParagraphNumber(
      playerPositionSeconds,
      doc.paragraphs,
      playerDurationSeconds
    );

    setActiveParagraphNumber(activeNum);

    // Save reading progress dual state
    if (doc.testimony_id && (activeNum || playerPositionSeconds > 0)) {
      api.saveReadingState({
        testimony_id: doc.testimony_id,
        playback_position: playerPositionSeconds,
        reading_paragraph_number: manualScrolledParagraphNumber || activeNum || 1,
        language: doc.language,
        font_size: 16,
        auto_follow: autoFollow,
        updated_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }, [
    doc,
    playerPositionSeconds,
    playerDurationSeconds,
    isCurrentSermon,
    timingProvider,
    autoFollow,
    manualScrolledParagraphNumber,
  ]);

  // Manual scroll detection handler
  const handleManualScrollBegin = useCallback(() => {
    if (autoFollow) {
      setAutoFollow(false);
      setShowReturnToLive(true);
    }
  }, [autoFollow]);

  // Return to live action handler
  const handleReturnToLive = useCallback(
    (onScrollToActive?: (activeNum: number) => void) => {
      if (activeParagraphNumber && activeParagraphNumber > 0) {
        if (onScrollToActive) {
          onScrollToActive(activeParagraphNumber);
        }
        triggerGlow(activeParagraphNumber);
      }
      // Release deep-link lock so auto-scroll can resume normally
      hasReleasedDeepLinkLock.current = true;
      setAutoFollow(true);
      setShowReturnToLive(false);
    },
    [activeParagraphNumber, triggerGlow]
  );

  return {
    autoFollow,
    activeParagraphNumber,
    showReturnToLive,
    targetGlowParagraphNumber,
    glowAnim,
    handleManualScrollBegin,
    handleReturnToLive,
    triggerGlow,
    setAutoFollow,
    hasReleasedDeepLinkLock,
  };
}
