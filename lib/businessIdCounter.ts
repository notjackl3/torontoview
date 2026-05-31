const STORAGE_KEY = "tv:business-counter";

export function peekNextBusinessId(): number {
  if (typeof window === "undefined") return 1;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const current = raw ? parseInt(raw, 10) || 0 : 0;
  return current + 1;
}

export function consumeNextBusinessId(): number {
  if (typeof window === "undefined") return 1;
  const next = peekNextBusinessId();
  window.localStorage.setItem(STORAGE_KEY, String(next));
  return next;
}
