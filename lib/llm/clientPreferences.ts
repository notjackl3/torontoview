"use client";

import { useEffect, useState, useCallback } from "react";
import { LLM_HEADER_NAMES } from "./preferences";
import type { LlmProviderId } from "./providers";

const STORAGE_KEY = "torontoview:llm-preferences:v1";

export interface LlmPreferences {
  provider: LlmProviderId | null;
  model: string | null;
}

const EMPTY: LlmPreferences = { provider: null, model: null };

function readStorage(): LlmPreferences {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<LlmPreferences>;
    return {
      provider: (parsed.provider as LlmProviderId | null) ?? null,
      model: parsed.model ?? null,
    };
  } catch {
    return EMPTY;
  }
}

function writeStorage(prefs: LlmPreferences) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent("torontoview:llm-prefs-changed", { detail: prefs }));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function useLlmPreferences() {
  // Reads localStorage on first client render; falls back to EMPTY on the
  // server. The lazy initializer avoids a setState-in-effect lint warning
  // and saves one paint compared to reading inside an effect.
  const [prefs, setPrefs] = useState<LlmPreferences>(() => readStorage());

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<LlmPreferences>;
      if (custom.detail) setPrefs(custom.detail);
    };
    window.addEventListener("torontoview:llm-prefs-changed", handler);
    return () => window.removeEventListener("torontoview:llm-prefs-changed", handler);
  }, []);

  const update = useCallback((next: Partial<LlmPreferences>) => {
    const merged = { ...readStorage(), ...next };
    writeStorage(merged);
    setPrefs(merged);
  }, []);

  const clear = useCallback(() => {
    writeStorage(EMPTY);
    setPrefs(EMPTY);
  }, []);

  return { prefs, update, clear };
}

/**
 * Build the headers a client fetch should include so the API route picks up
 * the user's provider/model preference. Returns an empty object when no
 * preference is set (server falls back to env defaults).
 */
export function llmPreferenceHeaders(prefs: LlmPreferences): Record<string, string> {
  const headers: Record<string, string> = {};
  if (prefs.provider) headers[LLM_HEADER_NAMES.provider] = prefs.provider;
  if (prefs.model) headers[LLM_HEADER_NAMES.model] = prefs.model;
  return headers;
}

/**
 * Synchronous reader for code paths that can't use the hook (e.g. event
 * handlers that fire before mount). Always reads fresh from localStorage.
 */
export function readLlmPreferencesSync(): LlmPreferences {
  return readStorage();
}
