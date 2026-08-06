/**
 * Backend API client — talks directly to the Golden Nuggets FastAPI REST API (`/api/v1/mobile`).
 */
import { storage } from "@/src/utils/storage";
import { cacheStore } from "@/src/utils/cache";
import { userStore, UserNote, UserHighlight, ReadingProgressState, UserHistoryItem, NoteCollection } from "@/src/utils/userStore";
export type { UserNote, UserHighlight, ReadingProgressState, UserHistoryItem, NoteCollection };
import {
  adaptSermon,
  adaptHomeFeed,
  adaptCategory,
  BackendSermon,
  BackendCategory,
  BackendMeeting,
  BackendHomePayload,
} from "./adapters";

import { Platform } from "react-native";

const PRODUCTION_BASE = process.env.EXPO_PUBLIC_PROD_BACKEND_URL || "https://web-production-1fc9d.up.railway.app/api/v1/mobile";
const LOCAL_BASE = Platform.OS === "android" ? "http://10.0.2.2:8000/api/v1/mobile" : "http://127.0.0.1:8000/api/v1/mobile";

// Automatic Environment Selection:
// - __DEV__ = true (Xcode Debug, Android Emulator Debug, Expo Go) -> Always defaults to LOCAL_BASE (http://127.0.0.1:8000)
// - __DEV__ = false (Release Build, Standalone APK, App Store Release) -> Always defaults to PRODUCTION_BASE (Railway)
const BASE = __DEV__
  ? (process.env.EXPO_PUBLIC_DEV_BACKEND_URL || LOCAL_BASE)
  : (process.env.EXPO_PUBLIC_BACKEND_URL || PRODUCTION_BASE);

if (__DEV__) {
  console.log(`[API Client] 🛠️ Running in __DEV__ mode (Xcode/Expo). Base URL: "${BASE}"`);
} else {
  console.log(`[API Client] 🚀 Running in Production mode. Base URL: "${BASE}"`);
}

// ------------------------------ types
export interface TranscriptParagraph {
  text: string;
  start_seconds?: number;
  end_seconds?: number;
  paragraph_number?: number;
}

export interface Transcript {
  language: string;
  pdf_url?: string | null;
  text: string;
  paragraphs?: TranscriptParagraph[];
  updated_at?: string;
}

export interface Testimony {
  id: string;
  title: string;
  speaker: string;
  category: string;
  year: number;
  language: string;
  duration: number;
  verse?: string | null;
  date_code?: string | null;
  code?: string | null;
  art_url?: string | null;
  art_thumb_url?: string | null;
  audio_url?: string | null;
  audio_bytes?: number;
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
  favorite: boolean;
  downloaded: boolean;
  progress: number;
  position: number;
  play_count?: number;
  state?: string | null;
  transcripts: Transcript[];
  created_at?: string;
  updated_at?: string;
}

export interface BackendNotification {
  id: string;
  title: string;
  body: string;
  deep_link?: string | null;
  audience?: string | null;
  language?: string | null;
  status: string;
  delivered_at?: string | null;
  created_at?: string;
  updated_at?: string;
  sermon_id?: string | null;
  meeting_id?: string | null;
  type?: string | null;
}

export interface Category {
  id: string;
  name: string;
  tone: "emerald" | "gold" | "slate";
  order: number;
}

export interface HomeFeed {
  continue_listening: Testimony | null;
  recently_added: Testimony[];
  featured: Testimony | null;
  popular: Testimony[];
  categories: Category[];
  upcoming_meetings?: BackendMeeting[];
}

export type Note = UserNote;
export type Highlight = UserHighlight;

export interface HistoryRow {
  id: string;
  testimony: Testimony;
  position: number;
  completed: boolean;
  at: string;
}

// ------------------------------ device id
const DEVICE_ID_KEY = "sanctuary.device_id";
let _deviceIdPromise: Promise<string> | null = null;

export function getDeviceId(): Promise<string> {
  if (_deviceIdPromise) return _deviceIdPromise;
  _deviceIdPromise = (async (): Promise<string> => {
    const existing = await storage.getItem(DEVICE_ID_KEY, "");
    if (existing) return String(existing);
    const id = `dev-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
    await storage.setItem(DEVICE_ID_KEY, id);
    return id;
  })();
  return _deviceIdPromise!;
}

// ------------------------------ core fetcher
async function j<T>(path: string, init: RequestInit = {}, retries = 1): Promise<T> {
  const deviceId = await getDeviceId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Device-Id": deviceId,
    ...(init.headers as Record<string, string> | undefined),
  };
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, { ...init, headers });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${res.status}: ${body || res.statusText}`);
      }
      if (res.status === 204) return undefined as T;
      const ct = res.headers.get("content-type") || "";
      return (ct.includes("application/json") ? await res.json() : (await res.text())) as T;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ------------------------------ language code → DB value mapping
// The database stores full names ("English", "Telugu") but the app uses codes ("en", "te").
// Always send the full name to the backend so queries match DB records correctly.
function _toLangParam(code?: string): string | undefined {
  if (!code) return undefined;
  if (code === "en") return "en";
  if (code === "te") return "te";
  return code;
}

// ------------------------------ production API endpoints
export const api = {
  base: BASE,

  getCachedHome: async (language?: string): Promise<HomeFeed | undefined> => {
    const cached = await cacheStore.get<HomeFeed>(`home_${language || "default"}`);
    if (cached) {
      const { isMeetingExpired } = await import("./adapters");
      return {
        ...cached,
        upcoming_meetings: (cached.upcoming_meetings || []).filter((m) => !isMeetingExpired(m)),
      };
    }
    return undefined;
  },

  home: async (language?: string): Promise<HomeFeed> => {
    const cacheKey = `home_${language || "default"}`;
    const langParam = _toLangParam(language);
    const raw = await j<BackendHomePayload>(`/home${langParam ? `?language=${langParam}` : ""}`);
    const adapted = await adaptHomeFeed(raw);
    cacheStore.set(cacheKey, adapted);

    // Pre-seed fallback cache for search & offline mode
    const homeSermons: Testimony[] = [];
    if (adapted.featured) homeSermons.push(adapted.featured);
    if (adapted.continue_listening) homeSermons.push(adapted.continue_listening);
    if (Array.isArray(adapted.recently_added)) homeSermons.push(...adapted.recently_added);
    if (Array.isArray(adapted.popular)) homeSermons.push(...adapted.popular);
    if (homeSermons.length > 0) {
      cacheStore.set("sermons_fallback", homeSermons);
    }
    return adapted;
  },

  getCachedTestimonies: async (paramsKey = "all"): Promise<Testimony[] | undefined> => {
    return cacheStore.get<Testimony[]>(`sermons_${paramsKey}`);
  },

  listTestimonies: async (params: Record<string, string | boolean | number> = {}): Promise<Testimony[]> => {
    const paramsWithPageSize = { page_size: 10000, ...params };
    const cacheKey = `sermons_v3_${JSON.stringify(paramsWithPageSize)}`;
    const cached = await cacheStore.get<Testimony[]>(cacheKey);
    if (cached && cached.length > 0) return cached;

    const qs = new URLSearchParams();
    Object.entries(paramsWithPageSize).forEach(([k, v]) => qs.set(k, String(v)));
    const res = await j<{ items: BackendSermon[]; total: number }>(`/sermons${qs.toString() ? `?${qs}` : ""}`);
    const favs = await userStore.getFavorites();
    const progs = await userStore.getProgressMap();
    const adapted = await Promise.all((res.items || []).map((s) => adaptSermon(s, favs, progs)));
    cacheStore.set(cacheKey, adapted);
    return adapted;
  },

  getTestimony: async (id: string): Promise<Testimony> => {
    const raw = await j<BackendSermon>(`/sermons/${id}`);
    return adaptSermon(raw);
  },

  patchTestimony: async (id: string, patch: Partial<Testimony>): Promise<Testimony> => {
    if (patch.favorite !== undefined) {
      await userStore.toggleFavorite(id, patch.favorite);
    }
    return api.getTestimony(id);
  },

  searchPaginated: async (
    q: string = "",
    category_id?: string,
    language?: string,
    page: number = 1,
    pageSize: number = 20,
    cursor?: string
  ): Promise<{ items: Testimony[]; total: number; page: number; page_size: number; has_more: boolean; next_cursor?: string }> => {
    const langKey = language || "en";
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("page_size", String(pageSize));
    if (q) qs.set("q", q);
    if (category_id) qs.set("category_id", category_id);
    if (cursor) qs.set("cursor", cursor);
    const langParam = _toLangParam(language);
    if (langParam) qs.set("language", langParam);

    try {
      const res = await j<{ items: BackendSermon[]; total: number; page?: number; page_size?: number; has_more?: boolean; next_cursor?: string }>(`/sermons?${qs}`);
      const favs = await userStore.getFavorites();
      const progs = await userStore.getProgressMap();
      const adapted = await Promise.all((res.items || []).map((s) => adaptSermon(s, favs, progs)));

      return {
        items: adapted,
        total: res.total || adapted.length,
        page: res.page || page,
        page_size: res.page_size || pageSize,
        has_more: Boolean(res.has_more),
        next_cursor: res.next_cursor,
      };
    } catch (e) {
      console.warn(`[api.searchPaginated] Query failed for q="${q}", lang="${langKey}"`, e);
      return { items: [], total: 0, page, page_size: pageSize, has_more: false };
    }
  },

  seriesSummary: async (language?: string): Promise<{ name: string; sermonCount: number }[]> => {
    const langParam = _toLangParam(language);
    const qs = langParam ? `?language=${encodeURIComponent(langParam)}` : "";
    try {
      return await j<{ name: string; sermonCount: number }[]>(`/series${qs}`);
    } catch (e) {
      console.warn("[api.seriesSummary] Failed:", e);
      return [];
    }
  },

  statesSummary: async (language?: string): Promise<{ state: string; sermonCount: number }[]> => {
    const langParam = _toLangParam(language);
    const qs = langParam ? `?language=${encodeURIComponent(langParam)}` : "";
    try {
      return await j<{ state: string; sermonCount: number }[]>(`/states${qs}`);
    } catch (e) {
      console.warn("[api.statesSummary] Failed:", e);
      return [];
    }
  },

  search: async (q: string, category_id?: string, language?: string): Promise<Testimony[]> => {
    const langKey = language || "en";
    const cacheKey = `search_v3_${q}_${category_id || ""}_${langKey}`;
    const masterCacheKey = `search_master_v3_${langKey}`;

    const qs = new URLSearchParams();
    qs.set("page_size", "10000");
    if (q) qs.set("q", q);
    if (category_id) qs.set("category_id", category_id);
    const langParam = _toLangParam(language);
    if (langParam) qs.set("language", langParam);

    try {
      const res = await j<{ items: BackendSermon[]; total: number }>(`/sermons?${qs}`);
      const rawCount = res?.items ? res.items.length : 0;
      const favs = await userStore.getFavorites();
      const progs = await userStore.getProgressMap();
      const adapted = await Promise.all((res.items || []).map((s) => adaptSermon(s, favs, progs)));

      if (adapted.length > 0) {
        if (!q && !category_id) {
          cacheStore.set(masterCacheKey, adapted);
        }
        cacheStore.set(cacheKey, adapted);
      }
      return adapted;
    } catch (e) {
      console.warn(`[api.search] Network request failed for query="${q}", lang="${langKey}". Attempting cache recovery.`, e);
      const cached = await cacheStore.get<Testimony[]>(cacheKey);
      if (cached && cached.length > 0) return cached;

      const masterCached = await cacheStore.get<Testimony[]>(masterCacheKey);
      if (masterCached && masterCached.length > 0) {
        if (!q) return masterCached;
        const needle = q.toLowerCase();
        return masterCached.filter(
          (t) => (t.title && t.title.toLowerCase().includes(needle)) ||
                 (t.speaker && t.speaker.toLowerCase().includes(needle)) ||
                 (t.category && t.category.toLowerCase().includes(needle))
        );
      }

      const allCached = (await cacheStore.get<Testimony[]>("sermons_all")) || (await cacheStore.get<Testimony[]>("sermons_{}"));
      if (allCached && allCached.length > 0) {
        const langFiltered = allCached.filter((t) => t.language === langKey || !t.language);
        if (langFiltered.length > 0) {
          if (!q) return langFiltered;
          const needle = q.toLowerCase();
          return langFiltered.filter(
            (t) => (t.title && t.title.toLowerCase().includes(needle)) ||
                   (t.speaker && t.speaker.toLowerCase().includes(needle))
          );
        }
      }

      return [];
    }
  },

  years: async (language?: string): Promise<{ year: number; sermonCount: number }[]> => {
    const langParam = _toLangParam(language);
    const qs = langParam ? `?language=${langParam}` : "";
    return j<{ year: number; sermonCount: number }[]>(`/years${qs}`);
  },

  categories: async (): Promise<Category[]> => {
    const res = await j<{ items: BackendCategory[]; total: number }>("/categories");
    return (res.items || []).map((c, i) => adaptCategory(c, i));
  },

  meetings: async (): Promise<BackendMeeting[]> => {
    const res = await j<{ items: BackendMeeting[]; total: number }>("/meetings");
    return res.items || [];
  },

  notifications: async (language?: string): Promise<BackendNotification[]> => {
    const qs = language ? `?language=${language}` : "";
    const res = await j<{ items: BackendNotification[]; total: number }>(`/notifications${qs}`);
    return res.items || [];
  },

  reportProgress: async (testimony_id: string, position: number, completed = false) => {
    await userStore.recordProgress(testimony_id, position, completed);
    return api.track("progress", testimony_id, { position, completed });
  },

  // Note Collections & Notes (Client-Side Storage + Future API Sync)
  listCollections: () => userStore.getCollections(),
  createCollection: (title: string) => userStore.createCollection(title),
  updateCollection: (id: string, updates: Partial<import("@/src/utils/userStore").NoteCollection>) => userStore.updateCollection(id, updates),
  deleteCollection: async (id: string) => ({ deleted: await userStore.deleteCollection(id) }),

  listNotes: (collection_id?: string) => userStore.getNotes(collection_id),
  saveNote: (noteData: Omit<UserNote, "id" | "created_at" | "updated_at">) => userStore.saveNote(noteData),
  updatePersonalNote: (id: string, text: string) => userStore.updatePersonalNote(id, text),
  moveNoteToCollection: (id: string, collection_id: string) => userStore.moveNoteToCollection(id, collection_id),
  deleteNote: async (id: string) => ({ deleted: await userStore.deleteNote(id) }),

  // Reading State
  getReadingState: (testimony_id: string) => userStore.getReadingState(testimony_id),
  saveReadingState: (state: ReadingProgressState) => userStore.saveReadingState(state),

  // Highlights (Client-Side Storage)
  listHighlights: (testimony_id?: string) => userStore.getHighlights(testimony_id),
  createHighlight: (
    testimony_id: string,
    quote: string,
    language = "English",
    paragraph_number = 1,
    start_seconds?: number,
    testimony_title?: string,
    speaker?: string,
    date_code?: string
  ) =>
    userStore.addHighlight(
      testimony_id,
      quote,
      language,
      paragraph_number,
      start_seconds,
      testimony_title,
      speaker,
      date_code
    ),
  deleteHighlight: async (id: string) => ({ deleted: await userStore.deleteHighlight(id) }),
  clearAllHighlights: async () => ({ cleared: await userStore.clearAllHighlights() }),

  // History (Client-Side Storage)
  listHistory: async (): Promise<HistoryRow[]> => {
    const items = await userStore.getHistory();
    const result: HistoryRow[] = [];
    
    // Fast path: pull from local cache
    const cachedAll = await api.getCachedTestimonies('{"limit":"200"}') || [];
    const cacheMap = new Map(cachedAll.map(t => [t.id, t]));

    for (const item of items) {
      try {
        let testimony = cacheMap.get(item.testimony_id);
        if (!testimony) {
          testimony = await api.getTestimony(item.testimony_id);
        }
        result.push({
          id: item.id,
          testimony,
          position: item.position,
          completed: item.completed,
          at: item.at,
        });
      } catch {}
    }
    return result;
  },
  clearHistory: async () => ({ cleared: (await userStore.clearHistory()) ? 1 : 0 }),

  // Analytics (Backend event recording)
  track: (event: string, sermon_id?: string, metadata: Record<string, unknown> = {}) => {
    return j<unknown>("/analytics/event", {
      method: "POST",
      body: JSON.stringify({ event, sermon_id, metadata }),
    }).catch(() => null);
  },
};
