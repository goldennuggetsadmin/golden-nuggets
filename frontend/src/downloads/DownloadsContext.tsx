/**
 * DownloadsContext — real device downloads using expo-file-system.
 * Tracks state per testimony_id, persists the registry, and exposes a helper
 * to resolve `audio_url` to the local file:// URI when the testimony is
 * available offline.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";

import { storage } from "@/src/utils/storage";
import { api, Testimony } from "@/src/api/client";
import { useToast } from "@/src/toast/ToastContext";

export type DownloadState = "queued" | "downloading" | "paused" | "downloaded" | "error";

export interface DownloadItem {
  testimony_id: string;
  state: DownloadState;
  bytes_written: number;
  bytes_total: number;
  local_uri?: string;
  error?: string;
  updated_at: number;
}

interface DownloadsShape {
  items: Record<string, DownloadItem>;
  totalBytes: number;
  start: (t: Testimony) => Promise<void>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  getLocalUri: (id: string) => string | undefined;
}

const Ctx = createContext<DownloadsShape | null>(null);
const REG_KEY = "sanctuary.downloads.registry.v1";
const DIR = FileSystem.documentDirectory + "audio/";

async function getFileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists ? (info.size ?? 0) : 0;
}

async function ensureDir() {
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  } catch {}
}

function extFromUrl(url: string): string {
  const m = url.split("?")[0].match(/\.([a-zA-Z0-9]{2,5})$/);
  return m ? m[1] : "mp3";
}

export function DownloadsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Record<string, DownloadItem>>({});
  const toast = useToast();
  const [resumables] = useState<Record<string, FileSystem.DownloadResumable>>({});

  // hydrate
  useEffect(() => {
    (async () => {
      await ensureDir();
      const raw = await storage.getItem(REG_KEY, "");
      if (raw) {
        try { setItems(JSON.parse(String(raw)) as Record<string, DownloadItem>); } catch {}
      }
    })();
  }, []);

  const persist = useCallback(async (next: Record<string, DownloadItem>) => {
    setItems(next);
    await storage.setItem(REG_KEY, JSON.stringify(next));
  }, []);

  const totalBytes = useMemo(
    () =>
      (Object.values(items) as DownloadItem[])
        .filter((i) => i.state === "downloaded")
        .reduce((s, i) => s + (i.bytes_written || 0), 0),
    [items]
  );

  const start = useCallback(async (t: Testimony) => {
    if (!t.audio_url) { toast.show("No audio available", "error"); return; }
    await ensureDir();
    const local = `${DIR}${t.id}.${extFromUrl(t.audio_url)}`;
    const next = { ...items, [t.id]: {
      testimony_id: t.id, state: "downloading" as DownloadState,
      bytes_written: 0, bytes_total: t.audio_bytes || 0,
      updated_at: Date.now(), local_uri: local,
    }};
    await persist(next);

    const dl = FileSystem.createDownloadResumable(
      t.audio_url, local, {},
      (p) => {
        setItems((cur) => {
          const item = cur[t.id]; if (!item) return cur;
          const upd: DownloadItem = {
            ...item, bytes_written: p.totalBytesWritten,
            bytes_total: p.totalBytesExpectedToWrite || item.bytes_total,
          };
          const nxt = { ...cur, [t.id]: upd };
          storage.setItem(REG_KEY, JSON.stringify(nxt));
          return nxt;
        });
      },
    );
    resumables[t.id] = dl;

    try {
      const res = await dl.downloadAsync();
      if (!res) throw new Error("aborted");
      const nxt = { ...items, [t.id]: {
        testimony_id: t.id, state: "downloaded" as DownloadState,
        bytes_written: await getFileSize(res.uri),
        bytes_total: await getFileSize(res.uri),
        local_uri: res.uri, updated_at: Date.now(),
      }};
      await persist(nxt);
      api.patchTestimony(t.id, { downloaded: true }).catch(() => {});
      api.track("download_finish", t.id).catch(() => {});
      toast.show("Download complete", "success");
    } catch (e) {
      const nxt = { ...items };
      if (nxt[t.id]) nxt[t.id] = { ...nxt[t.id], state: "error", error: String(e), updated_at: Date.now() };
      await persist(nxt);
      toast.show("Download failed", "error");
    } finally {
      delete resumables[t.id];
    }
  }, [items, persist, resumables, toast]);

  const pause = useCallback(async (id: string) => {
    const r = resumables[id];
    if (!r) return;
    try {
      await r.pauseAsync();
      const nxt = { ...items };
      if (nxt[id]) nxt[id] = { ...nxt[id], state: "paused", updated_at: Date.now() };
      await persist(nxt);
    } catch {}
  }, [resumables, items, persist]);

  const resume = useCallback(async (id: string) => {
    const r = resumables[id];
    if (!r) return;
    try {
      const nxt = { ...items };
      if (nxt[id]) nxt[id] = { ...nxt[id], state: "downloading", updated_at: Date.now() };
      await persist(nxt);
      await r.resumeAsync();
    } catch {}
  }, [resumables, items, persist]);

  const remove = useCallback(async (id: string) => {
    const it = items[id];
    if (it?.local_uri) {
      try { await FileSystem.deleteAsync(it.local_uri, { idempotent: true }); } catch {}
    }
    const nxt = { ...items }; delete nxt[id];
    await persist(nxt);
    api.patchTestimony(id, { downloaded: false }).catch(() => {});
    toast.show("Removed download", "info");
  }, [items, persist, toast]);

  const getLocalUri = useCallback((id: string) => {
    const it = items[id];
    return it && it.state === "downloaded" ? it.local_uri : undefined;
  }, [items]);

  const value = useMemo<DownloadsShape>(() => ({
    items, totalBytes, start, pause, resume, remove, getLocalUri,
  }), [items, totalBytes, start, pause, resume, remove, getLocalUri]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDownloads(): DownloadsShape {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDownloads must be used within DownloadsProvider");
  return v;
}
