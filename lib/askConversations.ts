import type { AskScopeId } from "./askContext";

export interface AskMessage {
  role: "user" | "assistant";
  content: string;
  scope?: AskScopeId;
  selectedText?: string;
  sources?: Array<{ title: string; url: string }>;
  usedExternal?: boolean;
  timestamp: number;
}

export interface AskConversation {
  id: string;
  buildingId: string | "default";
  messages: AskMessage[];
  updatedAt: number;
}

const CONV_PREFIX = "tv:ask:";

function keyFor(buildingId: string | "default"): string {
  return `${CONV_PREFIX}${buildingId}`;
}

export function loadConversation(buildingId: string | "default"): AskConversation {
  if (typeof window === "undefined") {
    return { id: buildingId, buildingId, messages: [], updatedAt: 0 };
  }
  try {
    const raw = window.localStorage.getItem(keyFor(buildingId));
    if (!raw) return { id: buildingId, buildingId, messages: [], updatedAt: 0 };
    const parsed = JSON.parse(raw) as AskConversation;
    if (!Array.isArray(parsed.messages)) {
      return { id: buildingId, buildingId, messages: [], updatedAt: 0 };
    }
    return parsed;
  } catch {
    return { id: buildingId, buildingId, messages: [], updatedAt: 0 };
  }
}

export function saveConversation(conv: AskConversation): void {
  if (typeof window === "undefined") return;
  const toSave: AskConversation = { ...conv, updatedAt: Date.now() };
  try {
    window.localStorage.setItem(keyFor(conv.buildingId), JSON.stringify(toSave));
  } catch {
    // Quota / private-mode failures are non-critical; conversation is still in memory.
  }
}

export function appendMessage(
  buildingId: string | "default",
  message: AskMessage,
): AskConversation {
  const existing = loadConversation(buildingId);
  const next: AskConversation = {
    ...existing,
    buildingId,
    messages: [...existing.messages, message],
    updatedAt: Date.now(),
  };
  saveConversation(next);
  return next;
}

export function clearConversation(buildingId: string | "default"): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(buildingId));
  } catch {
    // ignore
  }
}
