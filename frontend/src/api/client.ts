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

const DEFAULT_BASE = "http://127.0.0.1:8000/api/v1/mobile";
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || DEFAULT_BASE;

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
  art_url?: string | null;
  art_thumb_url?: string | null;
  audio_url?: string | null;
  audio_bytes?: number;
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

// ------------------------------ production API endpoints
export const api = {
  base: BASE,

  getCachedHome: async (language?: string): Promise<HomeFeed | undefined> => {
    return cacheStore.get<HomeFeed>(`home_${language || "default"}`);
  },

  home: async (language?: string): Promise<HomeFeed> => {
    const cacheKey = `home_${language || "default"}`;
    const raw = await j<BackendHomePayload>(`/home${language ? `?language=${language}` : ""}`);
    const adapted = adaptHomeFeed(raw);
    cacheStore.set(cacheKey, adapted);
    return adapted;
  },

  getCachedTestimonies: async (paramsKey = "all"): Promise<Testimony[] | undefined> => {
    return cacheStore.get<Testimony[]>(`sermons_${paramsKey}`);
  },

  listTestimonies: async (params: Record<string, string | boolean | number> = {}): Promise<Testimony[]> => {
    const cacheKey = `sermons_${JSON.stringify(params)}`;
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => qs.set(k, String(v)));
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

  search: async (q: string, category_id?: string, language?: string): Promise<Testimony[]> => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (category_id) qs.set("category_id", category_id);
    if (language) qs.set("language", language);
    const res = await j<{ items: BackendSermon[]; total: number }>(`/sermons?${qs}`);
    const favs = await userStore.getFavorites();
    const progs = await userStore.getProgressMap();
    return Promise.all((res.items || []).map((s) => adaptSermon(s, favs, progs)));
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
  createHighlight: (testimony_id: string, quote: string, language = "English", paragraph_number = 1, start_seconds?: number) =>
    userStore.addHighlight(testimony_id, quote, language, paragraph_number, start_seconds),
  deleteHighlight: async (id: string) => ({ deleted: await userStore.deleteHighlight(id) }),
  clearAllHighlights: async () => ({ cleared: await userStore.clearAllHighlights() }),

  // History (Client-Side Storage)
  listHistory: async (): Promise<HistoryRow[]> => {
    const items = await userStore.getHistory();
    const result: HistoryRow[] = [];
    for (const item of items) {
      try {
        const testimony = await api.getTestimony(item.testimony_id);
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
