/**
 * sermonUtils.ts — Helpers for content type classification, chips, and metadata.
 */
import { Testimony } from "@/src/api/client";

export type ContentType = "audio" | "transcript" | "both";

export function getContentType(m: Testimony): ContentType {
  const hasAudio = Boolean(m.audio_url && m.audio_url.trim().length > 0);
  const hasTranscript = Boolean(m.transcripts && m.transcripts.length > 0);

  if (hasAudio && hasTranscript) return "both";
  if (hasTranscript) return "transcript";
  return "audio";
}

export function getContentTypeChip(type: ContentType): { label: string; shortLabel: string } {
  switch (type) {
    case "both":
      return { label: "AUDIO • TRANSCRIPT", shortLabel: "AUDIO • READ" };
    case "transcript":
      return { label: "TRANSCRIPT", shortLabel: "READ" };
    case "audio":
    default:
      return { label: "AUDIO", shortLabel: "AUDIO" };
  }
}

export function getEstimatedReadingTime(m: Testimony): number {
  if (m.duration && m.duration > 0) {
    return Math.ceil(m.duration / 60);
  }
  const text = m.transcripts?.[0]?.text || "";
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  // Avg reading speed: ~200 wpm
  return Math.max(1, Math.ceil(wordCount / 200));
}
