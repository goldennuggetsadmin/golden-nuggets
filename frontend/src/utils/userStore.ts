import { storage } from "./storage";

export interface NoteCollection {
  id: string;
  title: string;
  order_index?: number;
  icon?: string;
  accent_color?: string;
  created_at: string;
  updated_at: string;
}

export interface UserNote {
  id: string;
  collection_id: string;
  testimony_id: string;
  testimony_title?: string;
  speaker?: string;
  date_code?: string;
  language?: string;
  paragraph_number: number;
  text: string;
  timestamp?: number;
  personal_note?: string;
  created_at: string;
  updated_at: string;
}

export interface UserHighlight {
  id: string;
  testimony_id: string;
  testimony_title?: string;
  speaker?: string;
  date_code?: string;
  quote: string;
  language: string;
  paragraph_number: number;
  paragraph_index?: number;
  start_seconds?: number;
  created_at: string;
}

export interface ReadingProgressState {
  testimony_id: string;
  playback_position: number;
  reading_paragraph_number: number;
  language: string;
  font_size: number;
  auto_follow: boolean;
  updated_at: string;
}

export interface UserHistoryItem {
  id: string;
  testimony_id: string;
  position: number;
  completed: boolean;
  at: string;
}

const KEYS = {
  FAVORITES: "sanctuary.user.favorites",
  NOTE_COLLECTIONS: "sanctuary.user.note_collections",
  NOTES: "sanctuary.user.notes",
  HIGHLIGHTS: "sanctuary.user.highlights",
  HISTORY: "sanctuary.user.history",
  PROGRESS: "sanctuary.user.progress",
  READING_STATE: "sanctuary.user.reading_state",
};

export const userStore = {
  // Favorites
  async getFavorites(): Promise<Set<string>> {
    const raw = await storage.getItem(KEYS.FAVORITES, "[]");
    if (!raw) return new Set();
    try {
      return new Set(JSON.parse(String(raw)));
    } catch {
      return new Set();
    }
  },

  async toggleFavorite(id: string, value?: boolean): Promise<boolean> {
    const favs = await userStore.getFavorites();
    const isFav = value !== undefined ? value : !favs.has(id);
    if (isFav) {
      favs.add(id);
    } else {
      favs.delete(id);
    }
    await storage.setItem(KEYS.FAVORITES, JSON.stringify(Array.from(favs)));
    return isFav;
  },

  // Note Collections
  async getCollections(): Promise<NoteCollection[]> {
    const raw = await storage.getItem(KEYS.NOTE_COLLECTIONS, "[]");
    if (!raw) return [];
    try {
      return JSON.parse(String(raw));
    } catch {
      return [];
    }
  },

  async createCollection(title: string, order_index?: number): Promise<NoteCollection> {
    const all = await userStore.getCollections();
    const col: NoteCollection = {
      id: `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title,
      order_index: order_index ?? all.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const updated = [col, ...all];
    await storage.setItem(KEYS.NOTE_COLLECTIONS, JSON.stringify(updated));
    return col;
  },

  async updateCollection(id: string, updates: Partial<NoteCollection>): Promise<boolean> {
    const all = await userStore.getCollections();
    const idx = all.findIndex((c) => c.id === id);
    if (idx < 0) return false;
    all[idx] = { ...all[idx], ...updates, updated_at: new Date().toISOString() };
    await storage.setItem(KEYS.NOTE_COLLECTIONS, JSON.stringify(all));
    return true;
  },

  async deleteCollection(id: string): Promise<boolean> {
    const all = await userStore.getCollections();
    const filtered = all.filter((c) => c.id !== id);
    await storage.setItem(KEYS.NOTE_COLLECTIONS, JSON.stringify(filtered));
    
    // Also delete all notes in this collection
    const notes = await userStore.getNotes();
    const filteredNotes = notes.filter((n) => n.collection_id !== id);
    await storage.setItem(KEYS.NOTES, JSON.stringify(filteredNotes));
    
    return true;
  },

  // Notes
  async getNotes(collection_id?: string): Promise<UserNote[]> {
    const raw = await storage.getItem(KEYS.NOTES, "[]");
    if (!raw) return [];
    try {
      const all: UserNote[] = JSON.parse(String(raw));
      if (collection_id) return all.filter((n) => n.collection_id === collection_id);
      return all;
    } catch {
      return [];
    }
  },

  async saveNote(noteData: Omit<UserNote, "id" | "created_at" | "updated_at">): Promise<UserNote> {
    const all = await userStore.getNotes();
    const note: UserNote = {
      ...noteData,
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const updated = [note, ...all];
    await storage.setItem(KEYS.NOTES, JSON.stringify(updated));
    
    // Update collection's updated_at
    await userStore.updateCollection(note.collection_id, {});
    
    return note;
  },

  async updatePersonalNote(id: string, personal_note: string): Promise<boolean> {
    const all = await userStore.getNotes();
    const idx = all.findIndex((n) => n.id === id);
    if (idx < 0) return false;
    all[idx].personal_note = personal_note;
    all[idx].updated_at = new Date().toISOString();
    await storage.setItem(KEYS.NOTES, JSON.stringify(all));
    
    // Update collection's updated_at
    await userStore.updateCollection(all[idx].collection_id, {});
    return true;
  },

  async moveNoteToCollection(id: string, new_collection_id: string): Promise<boolean> {
    const all = await userStore.getNotes();
    const idx = all.findIndex((n) => n.id === id);
    if (idx < 0) return false;
    const old_col = all[idx].collection_id;
    all[idx].collection_id = new_collection_id;
    all[idx].updated_at = new Date().toISOString();
    await storage.setItem(KEYS.NOTES, JSON.stringify(all));
    
    await userStore.updateCollection(old_col, {});
    await userStore.updateCollection(new_collection_id, {});
    return true;
  },

  async deleteNote(id: string): Promise<boolean> {
    const all = await userStore.getNotes();
    const filtered = all.filter((n) => n.id !== id);
    await storage.setItem(KEYS.NOTES, JSON.stringify(filtered));
    return true;
  },

  // Highlights
  async getHighlights(testimony_id?: string): Promise<UserHighlight[]> {
    const raw = await storage.getItem(KEYS.HIGHLIGHTS, "[]");
    if (!raw) return [];
    try {
      const all: UserHighlight[] = JSON.parse(String(raw));
      if (testimony_id) return all.filter((h) => h.testimony_id === testimony_id);
      return all;
    } catch {
      return [];
    }
  },

  async addHighlight(
    testimony_id: string,
    quote: string,
    language = "English",
    paragraph_number: number,
    start_seconds?: number,
    testimony_title?: string,
    speaker?: string,
    date_code?: string
  ): Promise<UserHighlight> {
    const all = await userStore.getHighlights();
    
    // Deduplicate by testimony_id + paragraph_number
    const existingIndex = all.findIndex(
      (h) => h.testimony_id === testimony_id && (h.paragraph_number === paragraph_number || h.paragraph_index === paragraph_number)
    );

    if (existingIndex !== -1) {
      // Overwrite the existing quote with the latest text to prevent stale data
      const existing = all[existingIndex];
      existing.quote = quote;
      if (start_seconds !== undefined) existing.start_seconds = start_seconds;
      if (testimony_title) existing.testimony_title = testimony_title;
      if (speaker) existing.speaker = speaker;
      if (date_code) existing.date_code = date_code;
      await storage.setItem(KEYS.HIGHLIGHTS, JSON.stringify(all));
      return existing;
    }

    const hl: UserHighlight = {
      id: `hl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      testimony_id,
      testimony_title,
      speaker,
      date_code,
      quote,
      language,
      paragraph_number,
      paragraph_index: paragraph_number,
      start_seconds,
      created_at: new Date().toISOString(),
    };
    const updated = [hl, ...all];
    await storage.setItem(KEYS.HIGHLIGHTS, JSON.stringify(updated));
    return hl;
  },

  async deleteHighlight(id: string): Promise<boolean> {
    const all = await userStore.getHighlights();
    const filtered = all.filter((h) => h.id !== id);
    await storage.setItem(KEYS.HIGHLIGHTS, JSON.stringify(filtered));
    return true;
  },

  async clearAllHighlights(): Promise<boolean> {
    await storage.removeItem(KEYS.HIGHLIGHTS);
    return true;
  },


  // Reading Progress Dual Storage
  async getReadingState(testimony_id: string): Promise<ReadingProgressState | null> {
    const raw = await storage.getItem(KEYS.READING_STATE, "{}");
    if (!raw) return null;
    try {
      const map: Record<string, ReadingProgressState> = JSON.parse(String(raw));
      return map[testimony_id] || null;
    } catch {
      return null;
    }
  },

  async saveReadingState(state: ReadingProgressState): Promise<void> {
    const raw = await storage.getItem(KEYS.READING_STATE, "{}");
    let map: Record<string, ReadingProgressState> = {};
    try {
      map = JSON.parse(String(raw)) || {};
    } catch {
      map = {};
    }
    map[state.testimony_id] = {
      ...state,
      updated_at: new Date().toISOString(),
    };
    await storage.setItem(KEYS.READING_STATE, JSON.stringify(map));
  },

  // History & Progress
  async getHistory(): Promise<UserHistoryItem[]> {
    const raw = await storage.getItem(KEYS.HISTORY, "[]");
    if (!raw) return [];
    try {
      return JSON.parse(String(raw));
    } catch {
      return [];
    }
  },

  async getProgressMap(): Promise<Record<string, { position: number; completed: boolean }>> {
    const raw = await storage.getItem(KEYS.PROGRESS, "{}");
    if (!raw) return {};
    try {
      return JSON.parse(String(raw));
    } catch {
      return {};
    }
  },

  async recordProgress(testimony_id: string, position: number, completed = false) {
    const progMap = await userStore.getProgressMap();
    progMap[testimony_id] = { position, completed };
    await storage.setItem(KEYS.PROGRESS, JSON.stringify(progMap));

    const history = await userStore.getHistory();
    const existingIdx = history.findIndex((h) => h.testimony_id === testimony_id);
    const item: UserHistoryItem = {
      id: existingIdx >= 0 ? history[existingIdx].id : `hist_${Date.now()}`,
      testimony_id,
      position,
      completed,
      at: new Date().toISOString(),
    };

    let updatedHistory = history.filter((h) => h.testimony_id !== testimony_id);
    updatedHistory.unshift(item);
    if (updatedHistory.length > 50) updatedHistory = updatedHistory.slice(0, 50);

    await storage.setItem(KEYS.HISTORY, JSON.stringify(updatedHistory));
  },

  async clearHistory(): Promise<boolean> {
    await storage.removeItem(KEYS.HISTORY);
    return true;
  },
};
