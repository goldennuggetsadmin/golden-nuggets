/**
 * PlayerContext — audio playback state, queue, sleep timer, progress
 * heartbeat, and offline resolution.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";

import { api, Testimony } from "@/src/api/client";
import { useSettings } from "@/src/settings/SettingsContext";
import { useDownloads } from "@/src/downloads/DownloadsContext";

interface PlayerState {
  current: Testimony | null;
  playing: boolean;
  position: number;
  duration: number;
  playbackRate: number;
  queue: Testimony[];
  sleepAt: number | null; // epoch ms
  play: (m: Testimony, autoAdvance?: boolean) => Promise<void>;
  toggle: () => void;
  seekTo: (posSec: number) => void;
  skip: (deltaSec: number) => void;
  setRate: (r: number) => void;
  clear: () => void;
  enqueue: (m: Testimony) => void;
  removeFromQueue: (id: string) => void;
  playNextInQueue: () => Promise<void>;
  setSleepTimer: (minutes: number | null) => void;
  favorite: (id: string, value: boolean) => Promise<void>;
}

const Ctx = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<Testimony | null>(null);
  const [player, setPlayer] = useState<AudioPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [queue, setQueue] = useState<Testimony[]>([]);
  const [sleepAt, setSleepAt] = useState<number | null>(null);

  const settings = useSettings();
  const downloads = useDownloads();

  const lastHeartbeatRef = useRef<number>(0);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
  }, []);

  // Poll status
  useEffect(() => {
    if (!player) return;
    const iv = setInterval(() => {
      try {
        const cur = player.currentTime || 0;
        setPosition(cur);
        if (player.duration && player.duration !== duration) setDuration(player.duration);
        setPlaying(player.playing);

        // heartbeat every 15s
        if (current && player.playing && Date.now() - lastHeartbeatRef.current > 15000) {
          lastHeartbeatRef.current = Date.now();
          api.reportProgress(current.id, Math.floor(cur), false).catch(() => {});
        }

        // sleep timer
        if (sleepAt && Date.now() >= sleepAt) {
          player.pause();
          setPlaying(false);
          setSleepAt(null);
          settings.setSleepTimerMinutes(null);
        }
      } catch {}
    }, 500);
    return () => clearInterval(iv);
  }, [player, duration, current, sleepAt, settings]);

  const play = useCallback(async (m: Testimony, _autoAdvance = false) => {
    try { player?.pause(); (player as any)?.release?.(); } catch {}
    setCurrent(m);
    setDuration(m.duration || 0);
    // start from stored server position; falls back to 0
    setPosition(m.position || (m.progress || 0) * (m.duration || 0));

    // prefer local file if downloaded
    const localUri = downloads.getLocalUri(m.id);
    const uri = localUri || m.audio_url;
    if (!uri) { setPlayer(null); setPlaying(false); return; }

    const p = createAudioPlayer({ uri });
    setPlayer(p);
    try {
      p.setPlaybackRate(settings.playbackRate);
      if (m.position && m.position > 0) {
        (p as any).seekTo?.(m.position);
      }
      p.play();
      setPlaying(true);
      api.track("play_start", m.id).catch(() => {});
    } catch {}
  }, [player, downloads, settings.playbackRate]);

  const toggle = useCallback(() => {
    if (!player) return;
    try {
      if (player.playing) { player.pause(); setPlaying(false); api.track("play_pause", current?.id).catch(() => {}); }
      else { player.play(); setPlaying(true); api.track("play_resume", current?.id).catch(() => {}); }
    } catch {}
  }, [player, current]);

  const seekTo = useCallback((posSec: number) => {
    if (!player) { setPosition(posSec); return; }
    try { (player as any).seekTo?.(posSec); setPosition(posSec); } catch {}
  }, [player]);

  const skip = useCallback((deltaSec: number) => {
    seekTo(Math.max(0, Math.min(duration || Infinity, position + deltaSec)));
  }, [seekTo, position, duration]);

  const setRate = useCallback((r: number) => {
    settings.setPlaybackRate(r);
    try { player?.setPlaybackRate(r); } catch {}
  }, [player, settings]);

  const clear = useCallback(() => {
    try { player?.pause(); (player as any)?.release?.(); } catch {}
    setPlayer(null); setPlaying(false); setCurrent(null);
  }, [player]);

  const enqueue = useCallback((m: Testimony) => setQueue((q: Testimony[]) => [...q, m]), []);
  const removeFromQueue = useCallback((id: string) => setQueue((q: Testimony[]) => q.filter((x: Testimony) => x.id !== id)), []);

  const playNextInQueue = useCallback(async () => {
    const next = queue[0];
    if (!next) return;
    setQueue((q) => q.slice(1));
    await play(next, true);
  }, [queue, play]);

  const setSleepTimer = useCallback((minutes: number | null) => {
    settings.setSleepTimerMinutes(minutes);
    setSleepAt(minutes == null ? null : Date.now() + minutes * 60 * 1000);
  }, [settings]);

  const favorite = useCallback(async (id: string, value: boolean) => {
    try {
      const t = await api.patchTestimony(id, { favorite: value });
      if (current?.id === id) setCurrent(t);
    } catch {}
  }, [current]);

  const value: PlayerState = useMemo(() => ({
    current, playing, position, duration, playbackRate: settings.playbackRate,
    queue, sleepAt,
    play, toggle, seekTo, skip, setRate, clear,
    enqueue, removeFromQueue, playNextInQueue, setSleepTimer, favorite,
  }), [current, playing, position, duration, settings.playbackRate, queue, sleepAt,
       play, toggle, seekTo, skip, setRate, clear, enqueue, removeFromQueue, playNextInQueue, setSleepTimer, favorite]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayer(): PlayerState {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePlayer must be used within PlayerProvider");
  return v;
}

export function formatDuration(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatMins(seconds: number) {
  return `${Math.round(seconds / 60)} min`;
}
