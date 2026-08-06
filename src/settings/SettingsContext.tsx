/**
 * SettingsContext — app-wide preferences that must persist across launches.
 * Uses `@/src/utils/storage` (JSON-encoded strings).
 *
 * Also owns the user Profile (version 1):
 *   { version, name, hasCompletedOnboarding, createdAt, updatedAt }
 *
 * Migration: old keys "profile.name", "profile.object" are migrated once into
 * "gn.profile" and then removed so no existing user data is lost.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { storage } from "@/src/utils/storage";

type Theme = "dark" | "light";
type Lang = "English" | "Telugu";

/** ISO 639-1 language codes used internally for filtering. */
export type AppLanguage = "en" | "te";

/** Maps internal code → display label for the Language Selector. Extend here for new languages. */
export const APP_LANGUAGES: { code: AppLanguage; label: string }[] = [
  { code: "en", label: "English" },
  { code: "te", label: "తెలుగు" },
];

/** Map code → display label string. */
export function getLanguageLabel(code: AppLanguage): string {
  return APP_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

// ─── Profile ────────────────────────────────────────────────────────────────

export interface Profile {
  version: 1;
  /** null means user explicitly chose to skip name entry */
  name: string | null;
  hasCompletedOnboarding: boolean;
  createdAt: string;
  updatedAt: string;
}

const PROFILE_KEY = "gn.profile";
/** Legacy keys that may exist on older installations. */
const LEGACY_KEYS = ["profile.name", "profile.object"];

function buildDefaultProfile(): Profile {
  const now = new Date().toISOString();
  return { version: 1, name: null, hasCompletedOnboarding: false, createdAt: now, updatedAt: now };
}

/**
 * Returns up to 2 uppercase initials from the profile name.
 * Falls back to "G" (Golden Nuggets) when name is null/empty.
 */
export function getAvatarInitials(profile: Profile | null): string {
  const name = profile?.name?.trim();
  if (!name) return "G";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Returns the display name for the profile.
 * Falls back to "Welcome" when name is null/empty.
 */
export function getDisplayName(profile: Profile | null): string {
  return profile?.name?.trim() || "Welcome";
}

// ─── Settings ────────────────────────────────────────────────────────────────

interface Settings {
  theme: Theme;
  playbackRate: number;
  transcriptLanguage: Lang;
  fontSize: number;
  sleepTimerMinutes: number | null;
  downloadQuality: "High" | "Medium" | "Low";
  appLanguage: AppLanguage;
  ready: boolean;
  profile: Profile | null;
}

interface SettingsState extends Settings {
  setTheme: (t: Theme) => void;
  setPlaybackRate: (r: number) => void;
  setTranscriptLanguage: (l: Lang) => void;
  setFontSize: (n: number) => void;
  setSleepTimerMinutes: (n: number | null) => void;
  setDownloadQuality: (q: "High" | "Medium" | "Low") => void;
  setAppLanguage: (l: AppLanguage) => void;
  /** Merges partial profile fields, writes to storage, updates state. */
  updateProfile: (partial: Partial<Omit<Profile, "version" | "createdAt">>) => Promise<void>;
  /** Re-reads profile from storage (useful after external writes). */
  refreshProfile: () => Promise<void>;
}

const KEYS = {
  theme: "sanctuary.settings.theme",
  rate: "sanctuary.settings.rate",
  lang: "sanctuary.settings.tlang",
  font: "sanctuary.settings.font",
  sleep: "sanctuary.settings.sleep",
  dq: "sanctuary.settings.download_quality",
  appLang: "sanctuary.settings.app_language",
};

const DEFAULTS: Settings = {
  theme: "dark",
  playbackRate: 1.0,
  transcriptLanguage: "English",
  fontSize: 17,
  sleepTimerMinutes: null,
  downloadQuality: "High",
  appLanguage: "en",
  ready: false,
  profile: null,
};

const Ctx = createContext<SettingsState | null>(null);

// ─── Migration helper ─────────────────────────────────────────────────────────

async function migrateAndLoadProfile(): Promise<Profile | null> {
  // 1. Check for an existing gn.profile
  const existing = await storage.getItem(PROFILE_KEY, null);
  if (existing !== null && typeof existing === "object") {
    const p = existing as any;
    if (p.version === 1) return p as Profile;
    // Future version handling goes here.
  }

  // 2. Attempt to migrate from old keys
  const legacyName = await storage.getItem(LEGACY_KEYS[0], null);  // profile.name
  const legacyObject = await storage.getItem(LEGACY_KEYS[1], null); // profile.object

  const oldName: string | null =
    legacyName != null ? String(legacyName) :
    legacyObject != null && typeof legacyObject === "object" ? ((legacyObject as any).name ?? null) :
    null;

  if (oldName !== null || legacyObject !== null) {
    const now = new Date().toISOString();
    const migrated: Profile = {
      version: 1,
      name: oldName && oldName.trim() ? oldName.trim() : null,
      hasCompletedOnboarding: true, // they had an old profile → already onboarded
      createdAt: now,
      updatedAt: now,
    };
    await storage.setItem(PROFILE_KEY, migrated as any);
    // Remove legacy keys silently
    for (const k of LEGACY_KEYS) await storage.removeItem(k);
    return migrated;
  }

  return null; // fresh install
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    (async () => {
      const [theme, rate, lang, font, sleep, dq, appLang, profile] = await Promise.all([
        storage.getItem(KEYS.theme, "dark"),
        storage.getItem(KEYS.rate, 1),
        storage.getItem(KEYS.lang, "English"),
        storage.getItem(KEYS.font, 17),
        storage.getItem(KEYS.sleep, "null"),
        storage.getItem(KEYS.dq, "High"),
        storage.getItem(KEYS.appLang, "en"),
        migrateAndLoadProfile(),
      ]);
      setS({
        theme: (theme as Theme) || "dark",
        playbackRate: Number(rate) || 1,
        transcriptLanguage: (lang as Lang) || "English",
        fontSize: Number(font) || 17,
        sleepTimerMinutes: sleep === "null" || sleep == null ? null : Number(sleep),
        downloadQuality: (dq as Settings["downloadQuality"]) || "High",
        appLanguage: (appLang as AppLanguage) || "en",
        ready: true,
        profile: profile ?? null,
      });
    })();
  }, []);

  const setTheme = useCallback((theme: Theme) => {
    setS((p: Settings) => ({ ...p, theme })); storage.setItem(KEYS.theme, theme);
  }, []);
  const setPlaybackRate = useCallback((playbackRate: number) => {
    setS((p: Settings) => ({ ...p, playbackRate })); storage.setItem(KEYS.rate, playbackRate);
  }, []);
  const setTranscriptLanguage = useCallback((transcriptLanguage: Lang) => {
    setS((p: Settings) => ({ ...p, transcriptLanguage })); storage.setItem(KEYS.lang, transcriptLanguage);
  }, []);
  const setFontSize = useCallback((fontSize: number) => {
    setS((p: Settings) => ({ ...p, fontSize })); storage.setItem(KEYS.font, fontSize);
  }, []);
  const setSleepTimerMinutes = useCallback((sleepTimerMinutes: number | null) => {
    setS((p: Settings) => ({ ...p, sleepTimerMinutes }));
    storage.setItem(KEYS.sleep, sleepTimerMinutes == null ? "null" : sleepTimerMinutes);
  }, []);
  const setDownloadQuality = useCallback((downloadQuality: Settings["downloadQuality"]) => {
    setS((p: Settings) => ({ ...p, downloadQuality })); storage.setItem(KEYS.dq, downloadQuality);
  }, []);
  const setAppLanguage = useCallback((appLanguage: AppLanguage) => {
    setS((p: Settings) => ({ ...p, appLanguage })); storage.setItem(KEYS.appLang, appLanguage);
  }, []);

  const updateProfile = useCallback(async (partial: Partial<Omit<Profile, "version" | "createdAt">>) => {
    setS((prev) => {
      const existing = prev.profile ?? buildDefaultProfile();
      const updated: Profile = {
        ...existing,
        ...partial,
        version: 1,
        updatedAt: new Date().toISOString(),
      };
      // Write to storage (fire-and-forget, errors are silent per storage contract)
      storage.setItem(PROFILE_KEY, updated as any);
      return { ...prev, profile: updated };
    });
  }, []);

  const refreshProfile = useCallback(async () => {
    const p = await storage.getItem(PROFILE_KEY, null);
    const profile = p && typeof p === "object" && (p as any).version === 1 ? (p as unknown as Profile) : null;
    setS((prev) => ({ ...prev, profile }));
  }, []);

  const value = useMemo<SettingsState>(
    () => ({
      ...s,
      setTheme, setPlaybackRate, setTranscriptLanguage, setFontSize,
      setSleepTimerMinutes, setDownloadQuality, setAppLanguage,
      updateProfile, refreshProfile,
    }),
    [s, setTheme, setPlaybackRate, setTranscriptLanguage, setFontSize,
     setSleepTimerMinutes, setDownloadQuality, setAppLanguage,
     updateProfile, refreshProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSettings must be used within SettingsProvider");
  return v;
}
