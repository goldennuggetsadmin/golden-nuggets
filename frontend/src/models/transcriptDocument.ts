import { UserHighlight } from "../utils/userStore";

export type BlockType =
  | "title"
  | "subtitle"
  | "location"
  | "heading"
  | "scripture"
  | "hymn"
  | "prayer"
  | "paragraph";

export interface Paragraph {
  paragraph_number?: number;
  text: string;
  start_seconds?: number;
  end_seconds?: number;
  isHighlighted?: boolean;
  highlightId?: string; // id of the UserHighlight record — used for removal
  blockType?: BlockType;
}

export interface TranscriptDocument {
  id: string;
  testimony_id: string;
  language: string;
  paragraphs: Paragraph[];
}

export function detectBlockType(text: string, pNum?: number, index?: number): BlockType {
  const trimmed = text.trim();
  if (!trimmed) return "paragraph";

  // 1. Check for sermon code / date subtitle (e.g. "52-0900", "59-0329S")
  if (/^\d{2}-\d{4}[A-Z\d]*$/i.test(trimmed) || (index === 0 && /^[\d\-\.\s]+$/.test(trimmed))) {
    return "subtitle";
  }

  // 2. Check for Location metadata (e.g. "Jeffersonville, Indiana U.S.A.", "Chicago, IL")
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s+[A-Z][a-zA-Z\.\s]+$/i.test(trimmed) && trimmed.length < 60) {
    return "location";
  }

  // 3. Check for ALL-CAPS Section Headings (e.g. "FAITH IS THE SUBSTANCE")
  const lettersOnly = trimmed.replace(/[^A-Za-z]/g, "");
  if (
    lettersOnly.length >= 4 &&
    lettersOnly === lettersOnly.toUpperCase() &&
    !trimmed.endsWith(".") &&
    pNum === undefined
  ) {
    return "heading";
  }

  // 4. Check for Scripture References (e.g. "Hebrews 11:1", "St. Matthew 5:3")
  if (/^(?:St\.\s*)?(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation)\s+\d+:\d+/i.test(trimmed)) {
    return "scripture";
  }

  // 5. Check for Hymn / Lyric formatting (multiple lines with line breaks)
  if (trimmed.includes("\n") && trimmed.split("\n").every((l) => l.trim().length < 60)) {
    return "hymn";
  }

  // 6. Check for Prayer (e.g. "Let us pray...", "Our Heavenly Father...")
  if (/^(?:Let us pray|Our Heavenly Father|Bow our heads)/i.test(trimmed) && (pNum === 1 || index === 0)) {
    return "prayer";
  }

  return "paragraph";
}

export function stripTitleHeaderFromParagraph1(text: string): string {
  if (!text) return "";
  let cleaned = text.trim();

  // 1. Strip common PDF document header prefixes if present
  cleaned = cleaned.replace(/^(?:THE\s+SPOKEN\s+WORD|WILLIAM\s+MARRION\s+BRANHAM|E-?\d+)\s*/i, "").trim();

  // 2. Dynamically strip sparse / uppercase PDF title font artifacts before standard prose sentence start
  const match = cleaned.match(/\b(?:I\b|I[’\'][a-z]+|[A-Z][a-z]{1,}|[a-z]{3,})(?:[’\'][a-z]+)?,?\s+/);
  if (match && match.index !== undefined && match.index > 0) {
    const prefix = cleaned.substring(0, match.index).trim();
    if (/^[A-Z0-9\s\.\,\?\!\:\;\-\–\—\(\)\[\]\…]+$/.test(prefix)) {
      cleaned = cleaned.substring(match.index).trim();
    }
  }

  return cleaned;
}

export function buildTranscriptDocument(
  testimony_id: string,
  language: string,
  rawParagraphs: any[],
  rawText?: string
): TranscriptDocument {
  let parsedParas: Paragraph[] = [];
  if (rawParagraphs && rawParagraphs.length > 0) {
    parsedParas = rawParagraphs
      .map((p, idx) => {
        const pNum = p.paragraph_number; // null if unnumbered
        let cleanText = (p.text || "").replace(/^\d+[\.\s\-]+/, "").trim();
        if (idx === 0 || pNum === null || pNum === 1) {
          cleanText = stripTitleHeaderFromParagraph1(cleanText);
        }
        const bType = detectBlockType(cleanText, pNum ?? undefined, idx);
        return {
          paragraph_number: pNum,
          text: cleanText,
          start_seconds: p.start_seconds,
          end_seconds: p.end_seconds,
          blockType: bType,
        };
      })
      .filter((p) => {
        // ISSUE 1: Filter out duplicate PDF headings/titles/subtitles from transcript body
        if (!p.text || !p.text.trim()) return false;
        if (p.blockType === "heading" || p.blockType === "title" || p.blockType === "subtitle" || p.blockType === "location") {
          return false;
        }
        return true;
      });
  } else if (rawText) {
    const rawList = rawText.split(/\n{2,}|\r\n\r\n/).map((t: string) => t.trim()).filter(Boolean);
    parsedParas = rawList
      .map((t: string, idx) => {
        const match = t.match(/^(\d{1,4})[\.\s\-]/);
        const pNum = match ? parseInt(match[1], 10) : undefined;
        let cleanText = t.replace(/^\d+[\.\s\-]+/, "").trim();
        if (idx === 0 || pNum === undefined || pNum === 1) {
          cleanText = stripTitleHeaderFromParagraph1(cleanText);
        }
        const bType = detectBlockType(cleanText, pNum, idx);
        return {
          paragraph_number: pNum as any,
          text: cleanText,
          blockType: bType,
        };
      })
      .filter((p) => {
        if (!p.text || !p.text.trim()) return false;
        if (p.blockType === "heading" || p.blockType === "title" || p.blockType === "subtitle" || p.blockType === "location") {
          return false;
        }
        return true;
      });
  }

  return {
    id: `doc_${testimony_id}_${language}`,
    testimony_id,
    language,
    paragraphs: parsedParas,
  };
}
