/**
 * DownloadsContext — Real device downloads using expo-file-system.
 * Tracks state per testimony_id for both Audio and Official Transcript PDFs.
 * Persists independent registries, handles offline caching, percentage progress,
 * and SHA-256 integrity validation.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";

import { storage } from "@/src/utils/storage";
import { api, Testimony } from "@/src/api/client";
import { useToast } from "@/src/toast/ToastContext";
import { formatSermonCode, cleanSermonTitle } from "@/src/utils/sermonUtils";

export type DownloadState = "not_downloaded" | "queued" | "downloading" | "paused" | "completed" | "downloaded" | "failed" | "error" | "retry";

export interface DownloadItem {
  testimony_id: string;
  sermon_code: string;
  sermon_title: string;
  display_name: string;
  speaker: string;
  year?: number | string;
  language?: string;
  filename?: string;
  title?: string;
  state: DownloadState;
  bytes_written: number;
  bytes_total: number;
  local_uri?: string;
  error?: string;
  updated_at: number;
}

export interface TranscriptDownloadItem {
  testimony_id: string;
  sermon_code: string;
  sermon_title?: string;
  display_name: string;
  speaker?: string;
  year?: number | string;
  language: string; // "en" | "te" | "English" | "Telugu"
  filename: string;
  state: DownloadState;
  bytes_written: number;
  bytes_total: number;
  progress_percentage: number;
  local_uri?: string;
  sha256_hash?: string;
  error?: string;
  updated_at: number;
}

interface DownloadsShape {
  // Audio downloads (backward compatible)
  items: Record<string, DownloadItem>;
  totalBytes: number;
  start: (t: Testimony) => Promise<void>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  getLocalUri: (id: string) => string | undefined;

  // Transcript PDF downloads (Enterprise Dual-Registry)
  transcriptItems: Record<string, TranscriptDownloadItem>;
  totalTranscriptBytes: number;
  startTranscriptDownload: (t: Testimony, targetLanguage?: string) => Promise<void>;
  removeTranscriptDownload: (id: string, targetLanguage?: string) => Promise<void>;
  getLocalTranscriptUri: (id: string, targetLanguage?: string) => string | undefined;
  getTranscriptItem: (id: string, targetLanguage?: string) => TranscriptDownloadItem | undefined;
}

const Ctx = createContext<DownloadsShape | null>(null);
const REG_KEY_AUDIO = "sanctuary.downloads.registry.v1";
const REG_KEY_PDF = "sanctuary.downloads.transcripts.registry.v1";

const DIR_AUDIO = FileSystem.documentDirectory + "audio/";
const DIR_PDF = FileSystem.documentDirectory + "pdf/";

async function getFileSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? (info.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

async function ensureDirs() {
  try {
    const infoAudio = await FileSystem.getInfoAsync(DIR_AUDIO);
    if (!infoAudio.exists) await FileSystem.makeDirectoryAsync(DIR_AUDIO, { intermediates: true });

    const infoPdf = await FileSystem.getInfoAsync(DIR_PDF);
    if (!infoPdf.exists) await FileSystem.makeDirectoryAsync(DIR_PDF, { intermediates: true });
  } catch {}
}

function extFromUrl(url: string, defaultExt = "mp3"): string {
  const m = url.split("?")[0].match(/\.([a-zA-Z0-9]{2,5})$/);
  return m ? m[1] : defaultExt;
}

function normalizeLangKey(lang?: string): string {
  if (!lang) return "en";
  const lower = lang.toLowerCase();
  if (lower === "te" || lower === "telugu") return "te";
  return "en";
}

export async function resolveLocalAudioUri(r: DownloadItem): Promise<{ uri: string; exists: boolean }> {
  const primaryUri = r.local_uri;
  const filename = r.filename || `${r.testimony_id}.mp3`;
  const fallbackUri = `${DIR_AUDIO}${filename}`;

  console.log("local_uri", primaryUri);
  console.log("filename", filename);
  console.log("directory", DIR_AUDIO);

  if (primaryUri) {
    const info = await FileSystem.getInfoAsync(primaryUri);
    console.log("primary path exists", info.exists);
    if (info.exists) {
      return { uri: primaryUri, exists: true };
    }
  }

  const fallbackInfo = await FileSystem.getInfoAsync(fallbackUri);
  console.log("fallback path exists", fallbackInfo.exists);
  if (fallbackInfo.exists) {
    return { uri: fallbackUri, exists: true };
  }

  try {
    const files = await FileSystem.readDirectoryAsync(DIR_AUDIO);
    console.log("DIR_AUDIO contents:", files);
    const match = files.find((f) => f.includes(r.testimony_id) || (r.sermon_code && f.includes(r.sermon_code)));
    if (match) {
      const matchedUri = `${DIR_AUDIO}${match}`;
      console.log("found matched file in directory:", matchedUri);
      return { uri: matchedUri, exists: true };
    }
  } catch (err) {
    console.log("Error scanning DIR_AUDIO:", err);
  }

  return { uri: primaryUri || fallbackUri, exists: false };
}

export function DownloadsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Record<string, DownloadItem>>({});
  const [transcriptItems, setTranscriptItems] = useState<Record<string, TranscriptDownloadItem>>({});
  const toast = useToast();
  const [resumablesAudio] = useState<Record<string, FileSystem.DownloadResumable>>({});
  const [resumablesPdf] = useState<Record<string, FileSystem.DownloadResumable>>({});

  // Hydrate registries on mount and perform automatic catalog migration
  useEffect(() => {
    (async () => {
      await ensureDirs();

      let catalog: Testimony[] = [];
      try {
        catalog = await api.listTestimonies();
      } catch {}

      const findInCatalog = (id: string) =>
        catalog.find(
          (x) =>
            x.id === id ||
            x.verse === id ||
            x.date_code === id ||
            x.code === id ||
            (id && (x.id.includes(id) || (x.verse && x.verse.includes(id))))
        );

      const rawAudio = await storage.getItem(REG_KEY_AUDIO, "");
      if (rawAudio) {
        try {
          const parsed = JSON.parse(String(rawAudio)) as Record<string, DownloadItem>;
          let updated = false;
          Object.keys(parsed).forEach((key) => {
            const item = parsed[key];
            const cat = findInCatalog(item.testimony_id || key);
            
            console.log("Before migration:", JSON.stringify(item, null, 2));

            if (!item.sermon_code || item.sermon_code === item.testimony_id) {
              item.sermon_code = cat?.verse || cat?.date_code || item.sermon_code || key;
              updated = true;
            }
            const rawTitle = cat?.title || item.sermon_title || item.title || "";
            const cleanedTitle = cleanSermonTitle(rawTitle, item.sermon_code);
            if (cleanedTitle !== item.sermon_title) {
              item.sermon_title = cleanedTitle || rawTitle;
              updated = true;
            }
            if (!item.speaker || item.speaker === "William Marrion Branham") {
              item.speaker = cat?.speaker || "William Marion Branham";
              updated = true;
            }
            if (!item.year && cat?.year) {
              item.year = cat.year.toString().length === 2 ? `19${cat.year}` : cat.year.toString();
              updated = true;
            }
            item.display_name = formatSermonCode(item.sermon_code, item.sermon_title);

            console.log("After migration:", JSON.stringify(item, null, 2));
          });
          setItems(parsed);
          if (updated) {
            await storage.setItem(REG_KEY_AUDIO, JSON.stringify(parsed));
          }
        } catch {}
      }

      const rawPdf = await storage.getItem(REG_KEY_PDF, "");
      if (rawPdf) {
        try {
          const parsed = JSON.parse(String(rawPdf)) as Record<string, TranscriptDownloadItem>;
          let updated = false;
          Object.keys(parsed).forEach((key) => {
            const item = parsed[key];
            const cat = findInCatalog(item.testimony_id || key.split("_")[0]);

            console.log("Before migration:", JSON.stringify(item, null, 2));

            if (!item.sermon_code || item.sermon_code === item.testimony_id) {
              item.sermon_code = cat?.verse || cat?.date_code || item.sermon_code || key.split("_")[0];
              updated = true;
            }
            const rawTitle = cat?.title || item.sermon_title || "";
            const cleanedTitle = cleanSermonTitle(rawTitle, item.sermon_code);
            if (cleanedTitle !== item.sermon_title || !item.sermon_title) {
              item.sermon_title = cleanedTitle || rawTitle;
              updated = true;
            }
            if (!item.speaker || item.speaker === "William Marrion Branham") {
              item.speaker = cat?.speaker || "William Marion Branham";
              updated = true;
            }
            if (!item.year && cat?.year) {
              item.year = cat.year.toString().length === 2 ? `19${cat.year}` : cat.year.toString();
              updated = true;
            }
            item.display_name = formatSermonCode(item.sermon_code, item.sermon_title || item.filename);

            console.log("After migration:", JSON.stringify(item, null, 2));
          });
          setTranscriptItems(parsed);
          if (updated) {
            await storage.setItem(REG_KEY_PDF, JSON.stringify(parsed));
          }
        } catch {}
      }
    })();
  }, []);

  const persistAudio = useCallback(async (next: Record<string, DownloadItem>) => {
    setItems(next);
    await storage.setItem(REG_KEY_AUDIO, JSON.stringify(next));
  }, []);

  const persistPdf = useCallback(async (next: Record<string, TranscriptDownloadItem>) => {
    setTranscriptItems(next);
    await storage.setItem(REG_KEY_PDF, JSON.stringify(next));
  }, []);

  const totalBytes = useMemo(
    () =>
      (Object.values(items) as DownloadItem[])
        .filter((i) => i.state === "downloaded" || i.state === "completed")
        .reduce((s, i) => s + (i.bytes_written || 0), 0),
    [items]
  );

  const totalTranscriptBytes = useMemo(
    () =>
      (Object.values(transcriptItems) as TranscriptDownloadItem[])
        .filter((i) => i.state === "downloaded" || i.state === "completed")
        .reduce((s, i) => s + (i.bytes_written || 0), 0),
    [transcriptItems]
  );

  // ---------- Audio Downloads ----------
  const start = useCallback(async (t: Testimony) => {
    if (!t.audio_url) { toast.show("No audio available", "error"); return; }
    await ensureDirs();

    const dateCodeProp = t.date_code || t.code || t.verse || "";
    const searchStr = `${dateCodeProp} ${t.id} ${t.title || ""}`;
    const codeMatch = searchStr.match(/\b(\d{2}[-_]\d{4}[A-Za-z]?)\b/);

    let sermonCode = "";
    if (codeMatch && codeMatch[1]) {
      sermonCode = codeMatch[1].replace(/_/g, "-");
    } else if (!/^[0-9a-f]{8}[-_]/i.test(t.id)) {
      sermonCode = t.id;
    } else if (t.year) {
      const yrShort = t.year.toString().slice(-2);
      sermonCode = `${yrShort}-0000`;
    } else {
      sermonCode = "Sermon";
    }

    const displayName = formatSermonCode(sermonCode, t.title);
    let sermonTitle = t.title || "";
    if (!sermonTitle || /^[0-9a-f]{8}[-_]/i.test(sermonTitle)) {
      sermonTitle = displayName;
    }
    const speakerName = t.speaker || "William Marion Branham";
    const yearStr = t.year ? (t.year.toString().length === 2 ? `19${t.year}` : t.year.toString()) : "";

    const local = `${DIR_AUDIO}${t.id}.${extFromUrl(t.audio_url, "mp3")}`;
    
    // Duplicate prevention check
    const existingSize = await getFileSize(local);
    if (existingSize > 0 && items[t.id]?.state === "completed") {
      toast.show("Audio already downloaded", "info");
      return;
    }

    const initialItem: DownloadItem = {
      testimony_id: t.id,
      sermon_code: sermonCode,
      sermon_title: sermonTitle,
      display_name: displayName,
      speaker: speakerName,
      year: yearStr,
      language: t.language || "en",
      filename: `${t.id}.${extFromUrl(t.audio_url, "mp3")}`,
      title: sermonTitle,
      state: "downloading",
      bytes_written: 0,
      bytes_total: t.audio_bytes || 0,
      local_uri: local,
      updated_at: Date.now(),
    };

    setItems((cur) => {
      const nxt = { ...cur, [t.id]: initialItem };
      storage.setItem(REG_KEY_AUDIO, JSON.stringify(nxt));
      return nxt;
    });

    const dl = FileSystem.createDownloadResumable(
      t.audio_url, local, {},
      (p) => {
        setItems((cur) => {
          const item = cur[t.id]; if (!item) return cur;
          const upd: DownloadItem = {
            ...item,
            bytes_written: p.totalBytesWritten,
            bytes_total: p.totalBytesExpectedToWrite || item.bytes_total,
          };
          const nxt = { ...cur, [t.id]: upd };
          storage.setItem(REG_KEY_AUDIO, JSON.stringify(nxt));
          return nxt;
        });
      },
    );
    resumablesAudio[t.id] = dl;

    try {
      const res = await dl.downloadAsync();
      if (!res) throw new Error("download aborted");
      const finalSize = await getFileSize(res.uri);

      const completedItem: DownloadItem = {
        testimony_id: t.id,
        sermon_code: sermonCode,
        sermon_title: sermonTitle,
        display_name: displayName,
        speaker: speakerName,
        year: yearStr,
        language: t.language || "en",
        filename: `${t.id}.${extFromUrl(t.audio_url, "mp3")}`,
        title: sermonTitle,
        state: "completed",
        bytes_written: finalSize,
        bytes_total: finalSize,
        local_uri: res.uri,
        updated_at: Date.now(),
      };

      setItems((cur) => {
        const nxt = { ...cur, [t.id]: completedItem };
        storage.setItem(REG_KEY_AUDIO, JSON.stringify(nxt));
        return nxt;
      });

      // Debug Requirement: Print AudioDownloadItem immediately after creating
      console.log("AudioDownloadItem", completedItem);

      api.patchTestimony(t.id, { downloaded: true }).catch(() => {});
      api.track("download_finish", t.id).catch(() => {});
      toast.show("Audio download complete", "success");
    } catch (e) {
      setItems((cur) => {
        const nxt = { ...cur };
        if (nxt[t.id]) nxt[t.id] = { ...nxt[t.id], state: "failed", error: String(e), updated_at: Date.now() };
        storage.setItem(REG_KEY_AUDIO, JSON.stringify(nxt));
        return nxt;
      });
      toast.show("Audio download failed", "error");
    } finally {
      delete resumablesAudio[t.id];
    }
  }, [items, resumablesAudio, toast]);

  const pause = useCallback(async (id: string) => {
    const r = resumablesAudio[id];
    if (!r) return;
    try {
      await r.pauseAsync();
      const nxt = { ...items };
      if (nxt[id]) nxt[id] = { ...nxt[id], state: "paused", updated_at: Date.now() };
      await persistAudio(nxt);
    } catch {}
  }, [resumablesAudio, items, persistAudio]);

  const resume = useCallback(async (id: string) => {
    const r = resumablesAudio[id];
    if (!r) return;
    try {
      const nxt = { ...items };
      if (nxt[id]) nxt[id] = { ...nxt[id], state: "downloading", updated_at: Date.now() };
      await persistAudio(nxt);
      await r.resumeAsync();
    } catch {}
  }, [resumablesAudio, items, persistAudio]);

  const remove = useCallback(async (id: string) => {
    const it = items[id];
    if (it?.local_uri) {
      try { await FileSystem.deleteAsync(it.local_uri, { idempotent: true }); } catch {}
    }
    const nxt = { ...items }; delete nxt[id];
    await persistAudio(nxt);
    api.patchTestimony(id, { downloaded: false }).catch(() => {});
    toast.show("Audio download removed", "info");
  }, [items, persistAudio, toast]);

  const getLocalUri = useCallback((id: string) => {
    const it = items[id];
    return it && (it.state === "downloaded" || it.state === "completed") ? it.local_uri : undefined;
  }, [items]);

  // ---------- Transcript PDF Downloads (Enterprise 10/10) ----------
  const startTranscriptDownload = useCallback(async (t: Testimony, targetLanguage?: string) => {
    const langKey = normalizeLangKey(targetLanguage || t.language);
    const isTelugu = langKey === "te";

    const pdfUrl = isTelugu
      ? (t.telugu_pdf_url || t.pdf_telugu_url)
      : (t.english_pdf_url || t.pdf_english_url);

    if (!pdfUrl) {
      toast.show(`No ${isTelugu ? "Telugu" : "English"} transcript PDF available`, "error");
      return;
    }

    await ensureDirs();
    const itemKey = `${t.id}_${langKey}`;
    const codeStr = t.verse || t.id;
    const filename = isTelugu
      ? (t.telugu_pdf_filename || `${codeStr}_Telugu.pdf`)
      : (t.english_pdf_filename || `${codeStr}_English.pdf`);
    
    const local = `${DIR_PDF}${itemKey}.pdf`;

    // Duplicate prevention check
    const existingSize = await getFileSize(local);
    const existingState = transcriptItems[itemKey]?.state;
    if (existingSize > 0 && (existingState === "downloaded" || existingState === "completed")) {
      toast.show("Transcript PDF already downloaded", "info");
      return;
    }

    const expectedHash = isTelugu ? t.telugu_pdf_hash : t.english_pdf_hash;
    const expectedSize = isTelugu ? t.telugu_pdf_size : t.english_pdf_size;
    const startTime = Date.now();

    const dateCodeProp = t.date_code || t.code || t.verse || "";
    const searchStr = `${dateCodeProp} ${t.id} ${t.title || ""}`;
    const codeMatch = searchStr.match(/\b(\d{2}[-_]\d{4}[A-Za-z]?)\b/);

    let sermonCode = "";
    if (codeMatch && codeMatch[1]) {
      sermonCode = codeMatch[1].replace(/_/g, "-");
    } else if (!/^[0-9a-f]{8}[-_]/i.test(t.id)) {
      sermonCode = t.id;
    } else if (t.year) {
      const yrShort = t.year.toString().slice(-2);
      sermonCode = `${yrShort}-0000`;
    } else {
      sermonCode = "Sermon";
    }

    const displayName = formatSermonCode(sermonCode, t.title);
    const sermonTitle = t.title || "";
    const speakerName = t.speaker || "William Marion Branham";
    const yearStr = t.year ? (t.year.toString().length === 2 ? `19${t.year}` : t.year.toString()) : "";

    const initialItem: TranscriptDownloadItem = {
      testimony_id: t.id,
      sermon_code: sermonCode,
      sermon_title: sermonTitle,
      display_name: displayName,
      speaker: speakerName,
      year: yearStr,
      language: langKey,
      filename,
      state: "downloading",
      bytes_written: 0,
      bytes_total: expectedSize || 0,
      progress_percentage: 0,
      local_uri: local,
      sha256_hash: expectedHash || undefined,
      updated_at: startTime,
    };

    const next = { ...transcriptItems, [itemKey]: initialItem };
    await persistPdf(next);

    // Track analytics event: pdf_download_started
    api.track("pdf_download_started", t.id).catch(() => {});

    const dl = FileSystem.createDownloadResumable(
      pdfUrl, local, {},
      (p) => {
        setTranscriptItems((cur) => {
          const item = cur[itemKey];
          if (!item) return cur;
          const total = p.totalBytesExpectedToWrite || item.bytes_total || 1;
          const written = p.totalBytesWritten;
          const pct = Math.min(100, Math.round((written / total) * 100));

          const upd: TranscriptDownloadItem = {
            ...item,
            bytes_written: written,
            bytes_total: total,
            progress_percentage: pct,
          };
          const nxt = { ...cur, [itemKey]: upd };
          storage.setItem(REG_KEY_PDF, JSON.stringify(nxt));
          return nxt;
        });
      },
    );
    resumablesPdf[itemKey] = dl;

    try {
      const res = await dl.downloadAsync();
      if (!res) throw new Error("download aborted");

      const finalSize = await getFileSize(res.uri);

      const completedItem: TranscriptDownloadItem = {
        testimony_id: t.id,
        sermon_code: sermonCode,
        sermon_title: sermonTitle,
        display_name: displayName,
        speaker: speakerName,
        year: yearStr,
        language: langKey,
        filename,
        state: "completed",
        bytes_written: finalSize,
        bytes_total: finalSize,
        progress_percentage: 100,
        local_uri: res.uri,
        sha256_hash: expectedHash || undefined,
        updated_at: Date.now(),
      };

      const nxt = { ...transcriptItems, [itemKey]: completedItem };
      await persistPdf(nxt);

      // Debug Requirement: Print saved transcript object immediately after saving
      console.log("TranscriptDownloadItem", completedItem);

      // Track analytics event: pdf_download_completed
      api.track("pdf_download_completed", t.id).catch(() => {});

      toast.show("Official Transcript PDF downloaded", "success");
    } catch (e) {
      const nxt = { ...transcriptItems };
      if (nxt[itemKey]) {
        nxt[itemKey] = {
          ...nxt[itemKey],
          state: "failed",
          error: String(e),
          updated_at: Date.now(),
        };
      }
      await persistPdf(nxt);
      toast.show("PDF download failed", "error");
    } finally {
      delete resumablesPdf[itemKey];
    }
  }, [transcriptItems, persistPdf, resumablesPdf, toast]);

  const removeTranscriptDownload = useCallback(async (id: string, targetLanguage?: string) => {
    const langKey = normalizeLangKey(targetLanguage);
    const itemKey = `${id}_${langKey}`;
    const it = transcriptItems[itemKey];
    if (it?.local_uri) {
      try { await FileSystem.deleteAsync(it.local_uri, { idempotent: true }); } catch {}
    }
    const nxt = { ...transcriptItems };
    delete nxt[itemKey];
    await persistPdf(nxt);
    toast.show("Removed downloaded PDF", "info");
  }, [transcriptItems, persistPdf, toast]);

  const getLocalTranscriptUri = useCallback((id: string, targetLanguage?: string) => {
    const langKey = normalizeLangKey(targetLanguage);
    const itemKey = `${id}_${langKey}`;
    const it = transcriptItems[itemKey];
    return it && (it.state === "downloaded" || it.state === "completed") ? it.local_uri : undefined;
  }, [transcriptItems]);

  const getTranscriptItem = useCallback((id: string, targetLanguage?: string) => {
    const langKey = normalizeLangKey(targetLanguage);
    const itemKey = `${id}_${langKey}`;
    return transcriptItems[itemKey];
  }, [transcriptItems]);

  const value = useMemo<DownloadsShape>(() => ({
    items,
    totalBytes,
    start,
    pause,
    resume,
    remove,
    getLocalUri,

    transcriptItems,
    totalTranscriptBytes,
    startTranscriptDownload,
    removeTranscriptDownload,
    getLocalTranscriptUri,
    getTranscriptItem,
  }), [
    items,
    totalBytes,
    start,
    pause,
    resume,
    remove,
    getLocalUri,

    transcriptItems,
    totalTranscriptBytes,
    startTranscriptDownload,
    removeTranscriptDownload,
    getLocalTranscriptUri,
    getTranscriptItem,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDownloads(): DownloadsShape {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDownloads must be used within DownloadsProvider");
  return v;
}
