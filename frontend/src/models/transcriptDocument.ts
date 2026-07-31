import { UserHighlight } from "../utils/userStore";

export interface Paragraph {
  paragraph_number: number;
  text: string;
  start_seconds?: number;
  end_seconds?: number;
  isHighlighted?: boolean;
  highlightId?: string; // id of the UserHighlight record — used for removal
}

export interface TranscriptDocument {
  id: string;
  testimony_id: string;
  language: string;
  paragraphs: Paragraph[];
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
    parsedParas = rawParagraphs.map((p) => {
      const pNum = p.paragraph_number; // null if unnumbered
      // Strip any leading serial number embedded in the text so it only shows in the gutter
      const cleanText = (p.text || "").replace(/^\d+[\.\s\-]+/, "").trim();
      return {
        paragraph_number: pNum,
        text: cleanText,
        start_seconds: p.start_seconds,
        end_seconds: p.end_seconds,
        isHighlighted: pNum != null ? highlightMap.has(pNum) : false,
        highlightId: pNum != null ? highlightMap.get(pNum) : undefined,
      };
    });
  } else if (rawText) {
    const rawList = rawText.split(/\n{2,}|\r\n\r\n/).map((t: string) => t.trim()).filter(Boolean);
    parsedParas = rawList.map((t: string) => {
      const match = t.match(/^(\d{1,4})[\.\s\-]/);
      const pNum = match ? parseInt(match[1], 10) : undefined;
      const cleanText = t.replace(/^\d+[\.\s\-]+/, "").trim();
      return {
        paragraph_number: pNum as any, // might be undefined, which matches the model
        text: cleanText,
        isHighlighted: pNum != null ? highlightMap.has(pNum) : false,
        highlightId: pNum != null ? highlightMap.get(pNum) : undefined,
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
