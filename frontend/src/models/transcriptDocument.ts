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

export function buildTranscriptDocument(
  testimony_id: string,
  language: string,
  rawParagraphs: any[],
  rawText?: string,
  highlights: UserHighlight[] = []
): TranscriptDocument {
  const highlightMap = new Map<number, string>(); // paragraphNumber → highlight id
  highlights.forEach((h) => {
    if (h.paragraph_number !== undefined && h.paragraph_number !== null) {
      highlightMap.set(h.paragraph_number, h.id);
    }
  });

  let parsedParas: Paragraph[] = [];
  if (rawParagraphs && rawParagraphs.length > 0) {
    parsedParas = rawParagraphs.map((p, idx) => {
      const pNum = p.paragraph_number; // null if unnumbered
      // Strip any leading serial number embedded in the text so it only shows in the gutter
      let cleanText = (p.text || "").replace(/^\d+[\.\s\-]+/, "").trim();
      // If first paragraph contains PDF title header artifacts at start, strip header text
      if (idx === 0 || pNum === null || pNum === 1) {
        cleanText = cleanText.replace(/^(?:F\s*I\s*T\s*S\s*AITH\s*S\s*HE\s*UBSTANCE|FAITH\s+IS\s+THE\s+SUBSTANCE|THE\s+SPOKEN\s+WORD)\s*/i, "").trim();
      }
      const bType = detectBlockType(cleanText, pNum ?? undefined, idx);
      return {
        paragraph_number: pNum,
        text: cleanText,
        start_seconds: p.start_seconds,
        end_seconds: p.end_seconds,
        isHighlighted: pNum != null ? highlightMap.has(pNum) : false,
        highlightId: pNum != null ? highlightMap.get(pNum) : undefined,
        blockType: bType,
      };
    });
  } else if (rawText) {
    const rawList = rawText.split(/\n{2,}|\r\n\r\n/).map((t: string) => t.trim()).filter(Boolean);
    parsedParas = rawList.map((t: string, idx) => {
      const match = t.match(/^(\d{1,4})[\.\s\-]/);
      const pNum = match ? parseInt(match[1], 10) : undefined;
      let cleanText = t.replace(/^\d+[\.\s\-]+/, "").trim();
      if (idx === 0 || pNum === undefined || pNum === 1) {
        cleanText = cleanText.replace(/^(?:F\s*I\s*T\s*S\s*AITH\s*S\s*HE\s*UBSTANCE|FAITH\s+IS\s+THE\s+SUBSTANCE|THE\s+SPOKEN\s+WORD)\s*/i, "").trim();
      }
      const bType = detectBlockType(cleanText, pNum, idx);
      return {
        paragraph_number: pNum as any, // might be undefined, which matches the model
        text: cleanText,
        isHighlighted: pNum != null ? highlightMap.has(pNum) : false,
        highlightId: pNum != null ? highlightMap.get(pNum) : undefined,
        blockType: bType,
      };
    });
  }

  return {
    id: `doc_${testimony_id}_${language}`,
    testimony_id,
    language,
    paragraphs: parsedParas,
  };
}
