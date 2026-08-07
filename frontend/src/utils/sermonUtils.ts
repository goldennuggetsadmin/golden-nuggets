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

/**
 * Formats a sermon code / ID into standardized display and export format:
 * Replaces "-" with "_"
 * Removes extraneous suffixes, titles, UUIDs, and file extensions.
 * e.g. "65-1205" -> "65_1205"
 * e.g. "64-0306" -> "64_0306"
 * e.g. "58-0316A" -> "58_0316A"
 * e.g. UUID "88d2ba3f-b25f..." + "65-1205 Things That Are To Be" -> "65_1205"
 */
/**
 * Cleans a sermon title by stripping sermon code prefixes, UUIDs, or display names.
 * e.g. ("65-1205 Things That Are To Be", "65-1205") -> "Things That Are To Be"
 * e.g. ("65_1205", "65-1205") -> ""
 */
export function cleanSermonTitle(rawTitle?: string, sermonCode?: string): string {
  if (!rawTitle) return "";
  let clean = rawTitle.trim();
  if (/^[0-9a-f]{8}[-_]/i.test(clean)) return "";
  
  if (sermonCode) {
    const codeHyphen = sermonCode.replace(/_/g, "-");
    const codeUnderscore = sermonCode.replace(/-/g, "_");
    clean = clean.replace(new RegExp(`^${codeHyphen}[\\s-_]+`, "i"), "");
    clean = clean.replace(new RegExp(`^${codeUnderscore}[\\s-_]+`, "i"), "");
  }
  clean = clean.trim();
  if (clean === sermonCode || clean.replace(/-/g, "_") === sermonCode?.replace(/-/g, "_")) return "";
  return clean;
}

export function formatSermonCode(rawIdOrCode: string, fallbackTitle?: string): string {
  const strToTest = `${rawIdOrCode || ""} ${fallbackTitle || ""}`;
  
  // 1. Try to find a standard sermon code pattern (e.g., 65-1205, 64-0306, 58-0316A, 65_1205)
  const codeMatch = strToTest.match(/\b(\d{2}[-_]\d{4}[A-Za-z]?)\b/);
  if (codeMatch && codeMatch[1]) {
    return codeMatch[1].replace(/-/g, "_");
  }

  // 2. Filter out raw UUIDs if no sermon code was matched
  const isUuid = /^[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}$/i.test((rawIdOrCode || "").trim());
  if (isUuid) {
    if (fallbackTitle && !/^[0-9a-f]{8}[-_]/i.test(fallbackTitle)) {
      return fallbackTitle;
    }
    return "Sermon";
  }

  if (!rawIdOrCode) return "Sermon";
  let clean = rawIdOrCode.trim();
  clean = clean.replace(/\.(pdf|mp3|m4a)$/i, "");
  clean = clean.replace(/_(English|Telugu|TE|EN)$/i, "");
  clean = clean.replace(/-/g, "_");
  return clean;
}

/**
 * Generates the standardized suggested export/share filename:
 * e.g. "65_1127E.pdf"
 */
export function getExportFilename(rawIdOrCode: string, fallbackTitle?: string): string {
  const code = formatSermonCode(rawIdOrCode, fallbackTitle);
  return `${code}.pdf`;
}
