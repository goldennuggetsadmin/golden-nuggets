import { Paragraph } from "../models/transcriptDocument";

export interface ParagraphTimingProvider {
  findActiveParagraphNumber(
    positionSeconds: number,
    paragraphs: Paragraph[],
    durationSeconds?: number
  ): number | null;
}

export const defaultTimingProvider: ParagraphTimingProvider = {
  findActiveParagraphNumber(
    positionSeconds: number,
    paragraphs: Paragraph[],
    durationSeconds?: number
  ): number | null {
    if (!paragraphs || paragraphs.length === 0 || positionSeconds < 0) return null;

    // 1. Precise check via start_seconds and end_seconds if available
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      if (p.start_seconds !== undefined && p.end_seconds !== undefined) {
        if (positionSeconds >= p.start_seconds && positionSeconds < p.end_seconds) {
          return p.paragraph_number ?? null;
        }
      } else if (p.start_seconds !== undefined) {
        const nextP = paragraphs[i + 1];
        const nextStart = nextP?.start_seconds ?? p.start_seconds + 30;
        if (positionSeconds >= p.start_seconds && positionSeconds < nextStart) {
          return p.paragraph_number ?? null;
        }
      }
    }

    // 2. Fallback ratio calculation if duration is provided
    if (durationSeconds && durationSeconds > 0) {
      const ratio = Math.min(1, Math.max(0, positionSeconds / durationSeconds));
      const estimatedIndex = Math.min(
        paragraphs.length - 1,
        Math.floor(ratio * paragraphs.length)
      );
      return paragraphs[estimatedIndex]?.paragraph_number ?? null;
    }

    return null;
  },
};
