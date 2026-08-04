import { Testimony, Category, Transcript, HomeFeed } from "./client";
import { userStore } from "../utils/userStore";

export interface BackendTranscriptParagraph {
  page?: number;
  paragraph_number?: number;
  text: string;
  language?: string;
  start_seconds?: number;
  end_seconds?: number;
}

export interface BackendSermon {
  id: string;
  title: string;
  speaker: string;
  series?: string | null;
  year?: string | number | null;
  date?: string | null;
  language?: string | null;
  description?: string | null;
  duration?: string | number | null;
  location?: string | null;
  state?: string | null;
  tags?: string[];
  category_ids?: string[];
  featured?: boolean;
  sermon_code?: string | null;
  source?: string | null;
  pdf_english_url?: string | null;
  pdf_telugu_url?: string | null;
  english_pdf_url?: string | null;
  english_pdf_hash?: string | null;
  english_pdf_size?: number | null;
  english_pdf_filename?: string | null;
  english_pdf_page_count?: number | null;
  telugu_pdf_url?: string | null;
  telugu_pdf_hash?: string | null;
  telugu_pdf_size?: number | null;
  telugu_pdf_filename?: string | null;
  telugu_pdf_page_count?: number | null;
  transcripts?: BackendTranscriptParagraph[];
  transcript_parsed?: boolean;
  transcript_page_count?: number;
  transcript_paragraph_count?: number;
  created_at?: string | null;
}

export interface BackendCategory {
  id: string;
  name: string;
  slug?: string;
  description?: string;
}

export interface BackendMeeting {
  id: string;
  title: string;
  speaker: string;
  description?: string;
  start_date: string;
  end_date?: string;
  time?: string;
  location?: string;
  google_maps_url?: string;
  youtube_url?: string;
  registration_link?: string;
  banner_url?: string;
  featured?: boolean;
  status?: string;
}

export interface BackendHomePayload {
  banner?: {
    title?: string;
    subtitle?: string;
    image_url?: string;
    sermon?: BackendSermon | null;
    meeting?: BackendMeeting | null;
  };
  featured_sermons?: BackendSermon[];
  recently_added?: BackendSermon[];
  categories?: BackendCategory[];
  upcoming_meetings?: BackendMeeting[];
}

const TONES: Array<"emerald" | "gold" | "slate"> = ["emerald", "gold", "slate"];

export function parseDurationToSeconds(duration: string | number | null | undefined): number {
  if (typeof duration === "number") return duration;
  if (!duration) return 0;
  const str = String(duration).trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  
  const parts = str.split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

export function adaptCategory(c: BackendCategory, index = 0): Category {
  return {
    id: c.id,
    name: c.name,
    tone: TONES[index % TONES.length],
    order: index,
  };
}

export async function adaptSermon(
  s: BackendSermon,
  userFavs?: Set<string>,
  progMap?: Record<string, { position: number; completed: boolean }>,
  downloadedSet?: Set<string>
): Promise<Testimony> {
  const favs = userFavs || (await userStore.getFavorites());
  const progs = progMap || (await userStore.getProgressMap());
  
  const userProg = progs[s.id];
  const durationSec = parseDurationToSeconds(s.duration);
  
  const transcripts: Transcript[] = [];

  // Use parsed transcript paragraphs from the backend if available
  if (s.transcripts && Array.isArray(s.transcripts) && s.transcripts.length > 0) {
    // Group backend paragraphs by language
    const byLang: Record<string, BackendTranscriptParagraph[]> = {};
    for (const p of s.transcripts) {
      const lang = p.language || "English";
      if (!byLang[lang]) byLang[lang] = [];
      byLang[lang].push(p);
    }
    for (const [lang, itemParas] of Object.entries(byLang)) {
      transcripts.push({
        language: lang,
        pdf_url: lang.toLowerCase().includes("telugu") || lang === "te" ? s.pdf_telugu_url : s.pdf_english_url,
        text: itemParas.map((p) => p.text).join("\n\n"),
        paragraphs: itemParas.map((p) => ({
          text: p.text,
          start_seconds: p.start_seconds,
          end_seconds: p.end_seconds,
          paragraph_number: p.paragraph_number,
        })),
      });
    }
  } else {
    // Fallback: PDF-only transcripts (no parsed text available yet)
    if (s.pdf_english_url) {
      transcripts.push({
        language: "English",
        pdf_url: s.pdf_english_url,
        text: s.description || "",
      });
    }
    if (s.pdf_telugu_url) {
      transcripts.push({
        language: "Telugu",
        pdf_url: s.pdf_telugu_url,
        text: s.description || "",
      });
    }
  }

  const pos = userProg?.position || 0;
  const progressRatio = durationSec > 0 ? Math.min(1, pos / durationSec) : 0;

  return {
    id: s.id,
    title: s.title || "Untitled Sermon",
    speaker: s.speaker || "William Marrion Branham",
    category: s.series || (s.category_ids && s.category_ids.length > 0 ? "Category" : "General"),
    year: typeof s.year === "number" ? s.year : s.year ? parseInt(String(s.year), 10) || 1965 : 1965,
    language: s.language || "en",
    duration: durationSec,
    verse: s.sermon_code || s.series || undefined,
    art_url: s.artwork_url || null,
    art_thumb_url: s.artwork_url || null,
    audio_url: s.audio_url || null,
    pdf_english_url: s.english_pdf_url || s.pdf_english_url || null,
    pdf_telugu_url: s.telugu_pdf_url || s.pdf_telugu_url || null,
    english_pdf_url: s.english_pdf_url || s.pdf_english_url || null,
    english_pdf_hash: s.english_pdf_hash || null,
    english_pdf_size: s.english_pdf_size || 0,
    english_pdf_filename: s.english_pdf_filename || null,
    english_pdf_page_count: s.english_pdf_page_count || 0,
    telugu_pdf_url: s.telugu_pdf_url || s.pdf_telugu_url || null,
    telugu_pdf_hash: s.telugu_pdf_hash || null,
    telugu_pdf_size: s.telugu_pdf_size || 0,
    telugu_pdf_filename: s.telugu_pdf_filename || null,
    telugu_pdf_page_count: s.telugu_pdf_page_count || 0,
    favorite: favs.has(s.id),
    downloaded: downloadedSet ? downloadedSet.has(s.id) : false,
    progress: progressRatio,
    position: pos,
    play_count: 0,
    state: s.state || null,
    transcripts,
    created_at: s.created_at || undefined,
    updated_at: s.created_at || undefined,
  };
}

export function isMeetingExpired(m: BackendMeeting): boolean {
  const dateStr = m.end_date || m.start_date;
  if (!dateStr) return false;
  try {
    const datePart = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const timePart = m.time && m.time.trim() ? m.time.trim() : "23:59:59";
    const dt = new Date(`${datePart}T${timePart}`);
    if (isNaN(dt.getTime())) {
      const d = new Date(datePart);
      d.setHours(23, 59, 59, 999);
      return Date.now() > d.getTime();
    }
    return Date.now() > dt.getTime();
  } catch {
    return false;
  }
}

export async function adaptHomeFeed(
  home: BackendHomePayload,
  downloadedSet?: Set<string>
) {
  const favs = await userStore.getFavorites();
  const progs = await userStore.getProgressMap();
  const history = await userStore.getHistory();

  const adaptedCategories = (home.categories || []).map((c, i) => adaptCategory(c, i));

  let recentSermons = await Promise.all(
    (home.recently_added || []).map((s) => adaptSermon(s, favs, progs, downloadedSet))
  );

  // Fallback: If language-filtered recently added is empty, fetch all published sermons so cards are pre-populated
  if (recentSermons.length === 0) {
    try {
      const { api: clientApi } = await import("./client");
      const fallbackList = await clientApi.search("");
      if (fallbackList.length > 0) {
        recentSermons = fallbackList.slice(0, 6);
      }
    } catch {
      // Ignore
    }
  }

  const featuredSermons = await Promise.all(
    (home.featured_sermons || []).map((s) => adaptSermon(s, favs, progs, downloadedSet))
  );

  const featured = featuredSermons.length > 0 ? featuredSermons[0] : recentSermons[0] || null;

  // Continue Listening is intentionally language-independent.
  // If the last-played sermon isn't in the language-filtered results, fetch it directly.
  let continueListening: Testimony | null = null;
  if (history.length > 0) {
    const lastPlayedId = history[0].testimony_id;
    const foundInRecent = recentSermons.find((r) => r.id === lastPlayedId);
    if (foundInRecent) {
      continueListening = foundInRecent;
    } else {
      // Sermon not in language-filtered results — fetch it directly so it still appears
      try {
        const { api: clientApi } = await import("./client");
        const raw = await fetch(`${clientApi.base}/sermons/${lastPlayedId}`)
          .then((r) => r.ok ? r.json() : null);
        if (raw) {
          continueListening = await adaptSermon(raw as BackendSermon, favs, progs, downloadedSet);
        }
      } catch {
        // Silently ignore — continue listening simply won't appear
      }
    }
  }

  return {
    continue_listening: continueListening,
    recently_added: recentSermons,
    featured,
    popular: featuredSermons,
    categories: adaptedCategories,
    upcoming_meetings: (home.upcoming_meetings || []).filter((m) => !isMeetingExpired(m)),
  };
}
