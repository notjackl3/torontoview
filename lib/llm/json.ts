/**
 * Pulls a JSON object out of an LLM response. Handles the three shapes models
 * keep producing: a clean JSON object, a ```json … ``` fence, or a chatty
 * preamble wrapping `{ … }`. Returns null when nothing parses.
 */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const stripped = trimmed.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // fall through
  }
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(stripped.slice(start, end + 1));
    } catch {
      // give up
    }
  }
  return null;
}

/** JSON.stringify with a character cap — for cramming context into a prompt. */
export function safeStringify(value: unknown, maxChars: number): string {
  try {
    const s = JSON.stringify(value, null, 2);
    if (s.length <= maxChars) return s;
    return s.slice(0, maxChars) + "\n…(truncated)";
  } catch {
    return String(value).slice(0, maxChars);
  }
}
