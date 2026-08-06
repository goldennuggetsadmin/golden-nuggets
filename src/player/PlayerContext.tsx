/**
 * PlayerContext — audio playback state, queue, sleep timer, progress
 * heartbeat, and offline resolution.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { Alert } from "react-native";
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { router } from "expo-router";

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
  isDismissed: boolean;
  isEnded: boolean;
  isPreparing: boolean;
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
  dismissMiniPlayer: () => void;
  restoreMiniPlayer: () => void;
  selectSermon: (m: Testimony) => Promise<void>;
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
  const [isDismissed, setIsDismissed] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);

  const settings = useSettings();
  const downloads = useDownloads();

  const lastHeartbeatRef = useRef<number>(0);
  const isNavigatingRef = useRef<boolean>(false);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
  }, []);

  const lastPosRef = useRef<number>(-1);
  const playingRef = useRef<boolean>(false);

  // Poll status & track end detection
  useEffect(() => {
    if (!player) return;
    const iv = setInterval(() => {
      try {
        const cur = player.currentTime || 0;
        const curFloor = Math.floor(cur);
        if (curFloor !== lastPosRef.current) {
          lastPosRef.current = curFloor;
          setPosition(curFloor);
        }
        const dur = player.duration || duration;
        if (dur && dur !== duration) setDuration(dur);

        if (player.playing !== playingRef.current) {
          playingRef.current = player.playing;
          setPlaying(player.playing);
        }

        // Track completion detection
        if (dur > 0 && cur >= dur - 0.5) {
          setIsEnded(true);
        } else if (isEnded && cur < dur - 1) {
          setIsEnded(false);
        }

        // heartbeat every 15s
        if (current && player.playing && Date.now() - lastHeartbeatRef.current > 15000) {
          lastHeartbeatRef.current = Date.now();
          api.reportProgress(current.id, curFloor, false).catch(() => {});
        }

        // sleep timer
        if (sleepAt && Date.now() >= sleepAt) {
          player.pause();
          playingRef.current = false;
          setPlaying(false);
          setSleepAt(null);
          settings.setSleepTimerMinutes(null);
        }
      } catch {}
    }, 500);
    return () => clearInterval(iv);
  }, [player, duration, current, sleepAt, settings, isEnded]);

  const play = useCallback(async (m: Testimony, _autoAdvance = false) => {
    setIsPreparing(true);
    setIsEnded(false);
    try {
      if (player) {
        player.pause();
        (player as any)?.release?.();
      }
    } catch {}

    setCurrent(m);
    setDuration(m.duration || 0);
    setIsDismissed(false);

    // start from stored server position or fallback
    const startPos = m.position || (m.progress || 0) * (m.duration || 0);
    setPosition(startPos);

    // prefer local file if downloaded
    const localUri = downloads.getLocalUri(m.id);
    const uri = localUri || m.audio_url;
    if (!uri) {
      setPlayer(null);
      setPlaying(false);
      setIsPreparing(false);
      return;
    }

    try {
      const p = createAudioPlayer({ uri });
      setPlayer(p);
      p.setPlaybackRate(settings.playbackRate);
      if (startPos > 0) {
        (p as any).seekTo?.(startPos);
      }
      p.play();
      setPlaying(true);
      api.track("play_start", m.id).catch(() => {});
    } catch {} finally {
      setIsPreparing(false);
    }
  }, [player, downloads, settings.playbackRate]);

  const toggle = useCallback(() => {
    if (!player) return;
    try {
      if (isEnded) {
        setIsEnded(false);
        seekTo(0);
        player.play();
        setPlaying(true);
        api.track("replay", current?.id).catch(() => {});
        return;
      }
      if (player.playing) {
        player.pause();
        setPlaying(false);
        api.track("play_pause", current?.id).catch(() => {});
      } else {
        player.play();
        setPlaying(true);
        api.track("play_resume", current?.id).catch(() => {});
      }
    } catch {}
  }, [player, current, isEnded]);

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
    setPlayer(null); setPlaying(false); setCurrent(null); setIsDismissed(false); setIsEnded(false);
  }, [player]);

  const dismissMiniPlayer = useCallback(() => {
    try {
      if (player?.playing) {
        player.pause();
        setPlaying(false);
      }
    } catch {}
    setIsDismissed(true);
    api.track("mini_player_dismiss", current?.id).catch(() => {});
  }, [player, current]);

  const restoreMiniPlayer = useCallback(() => {
    setIsDismissed(false);
  }, []);

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

  const startSermonInternal = useCallback(async (m: Testimony) => {
    router.push({ pathname: "/reading-mode", params: { id: m.id } });
    await play(m);
    api.track("sermon_opened", m.id).catch(() => {});
  }, [play]);

  const selectSermon = useCallback(async (m: Testimony) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setTimeout(() => { isNavigatingRef.current = false; }, 600);

    // Case 1: Same sermon selected
    if (current && current.id === m.id) {
      setIsDismissed(false);
      if (!playing && player) {
        try { player.play(); setPlaying(true); } catch {}
      } else if (!player) {
        await play(m);
      }
      router.push({ pathname: "/reading-mode", params: { id: m.id } });
      return;
    }

    // Case 2: Different sermon selected while audio is currently playing
    if (playing && current && current.id !== m.id) {
      Alert.alert(
        "Stop Current Sermon?",
        "Close the current sermon and switch to the selected sermon?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Continue",
            style: "destructive",
            onPress: () => {
              setTimeout(async () => {
                await startSermonInternal(m);
              }, 100);
            },
          },
        ],
        { cancelable: true }
      );
      return;
    }

    // Case 3: No sermon currently playing
    await startSermonInternal(m);
  }, [current, playing, player, play, startSermonInternal]);

  const value: PlayerState = useMemo(() => ({
    current, playing, position, duration, playbackRate: settings.playbackRate,
    queue, sleepAt, isDismissed, isEnded, isPreparing,
    play, toggle, seekTo, skip, setRate, clear,
    enqueue, removeFromQueue, playNextInQueue, setSleepTimer, favorite,
    dismissMiniPlayer, restoreMiniPlayer, selectSermon,
  }), [current, playing, position, duration, settings.playbackRate, queue, sleepAt,
       isDismissed, isEnded, isPreparing, play, toggle, seekTo, skip, setRate, clear,
       enqueue, removeFromQueue, playNextInQueue, setSleepTimer, favorite,
       dismissMiniPlayer, restoreMiniPlayer, selectSermon]);

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
