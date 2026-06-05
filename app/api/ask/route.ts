import { NextRequest, NextResponse } from "next/server";
import { generateCompletionText } from "@/lib/llm/client";
import { safeStringify } from "@/lib/llm/json";
import { resolveLlmPreferences } from "@/lib/llm/preferences";
import { isTavilyConfigured, tavilySearch, type TavilySnippet } from "@/lib/tavilySearch";

interface AskRequestBody {
  question: string;
  context: unknown;
  useExternal?: boolean;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

interface AskResponseBody {
  answer: string;
  sources: Array<{ title: string; url: string }>;
  usedExternal: boolean;
  externalUnavailableReason?: string;
}

const SYSTEM_PROMPT = `You are an urban-economics and small-business advisor for downtown Toronto.
You help a founder interpret analysis they see in a map-based planning tool. They have just
selected a snippet of text from a panel and asked a question about it.

# How to respond

1. **Identify the selection first.** The selected text is almost always a value from
   \`panel.fields\` in the context (e.g. "$205K" → \`panel.fields.buildOrFitOut.display\`,
   "8,943" → \`panel.fields.densityPerKm2\`). Find the matching field and OPEN your answer by
   naming it explicitly — for example: *"That **$205K** is your **Fit-out** budget — capital
   from your plan (own + loan + grants)."* Never say "the selected text likely refers to" or
   "without additional context" — the context **is** the source of truth.
2. **Then answer the question** using other fields from the bundle: business plan rent,
   monthly operating cost, neighbourhood density, nearby competitors, traffic, the placed
   building's floor / GFA / lat-lng, etc. Quote specific numbers and field names; round
   currency to thousands where natural.
3. **Format with markdown** the renderer supports: \`**bold**\`, \`*italic*\`, \`- bullet\`,
   \`### Heading\`, inline \`\\\`code\\\`\`, and blank lines for paragraph breaks. Do NOT wrap
   the whole response in code fences.
4. **Web search results** (when provided): cite inline as \`[1]\`, \`[2]\` — only cite what
   you actually used.
5. **No padding.** 1–3 short paragraphs plus an optional \`### Next steps\` list of up to 3
   bullets. Skip the next-steps section if the question is purely informational.
6. **Honest gaps.** If a number genuinely isn't in the context, say *"That isn't in the
   data I have — to answer I'd need X."* Don't invent values.
7. Address the user as "you".`;

function buildSnippetBlock(snippets: TavilySnippet[]): string {
  if (snippets.length === 0) return "";
  const lines = snippets.map((s, i) => `[${i + 1}] ${s.title}\n${s.content}\nURL: ${s.url}`);
  return `## Web search results\n${lines.join("\n\n")}\n\n`;
}

function buildSearchQuery(question: string, context: unknown): string {
  const parts: string[] = [question];
  if (context && typeof context === "object") {
    const c = context as {
      panel?: { title?: string };
      cityFacts?: { neighbourhoodName?: string | null };
      businessPlan?: { name?: string; category?: string } | null;
    };
    if (c.panel?.title) parts.push(c.panel.title);
    if (c.cityFacts?.neighbourhoodName) parts.push(c.cityFacts.neighbourhoodName);
    if (c.businessPlan?.category) parts.push(c.businessPlan.category);
    parts.push("Toronto");
  }
  return parts.filter(Boolean).join(" ").slice(0, 280);
}

export async function POST(request: NextRequest): Promise<NextResponse<AskResponseBody | { error: string }>> {
  let body: AskRequestBody;
  try {
    body = (await request.json()) as AskRequestBody;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  if (!body.context || typeof body.context !== "object") {
    return NextResponse.json({ error: "context object is required" }, { status: 400 });
  }

  const wantsExternal = Boolean(body.useExternal);
  const externalConfigured = isTavilyConfigured();

  let snippets: TavilySnippet[] = [];
  let externalUnavailableReason: string | undefined;
  let usedExternal = false;

  if (wantsExternal && !externalConfigured) {
    externalUnavailableReason = "TAVILY_API_KEY is not configured on the server.";
  } else if (wantsExternal && externalConfigured) {
    try {
      const search = await tavilySearch(buildSearchQuery(question, body.context), {
        maxResults: 5,
      });
      snippets = search.snippets;
      usedExternal = snippets.length > 0;
    } catch (err) {
      externalUnavailableReason =
        err instanceof Error ? err.message : "external search failed";
    }
  }

  const contextJson = safeStringify(body.context, 12000);
  const historyTrail = (body.history ?? [])
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));

  const userMessage = [
    buildSnippetBlock(snippets),
    `## Context (JSON)\n${contextJson}\n`,
    `## User question\n${question}`,
  ].join("\n");

  const prefs = resolveLlmPreferences(request);

  let raw: string;
  try {
    raw = await generateCompletionText({
      provider: prefs.provider,
      model: prefs.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...historyTrail,
        { role: "user", content: userMessage },
      ],
      temperature: 0.35,
      maxTokens: 900,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "LLM request failed" },
      { status: 502 },
    );
  }

  const answer = raw.trim();

  const sources = snippets.map((s) => ({ title: s.title, url: s.url }));

  return NextResponse.json({
    answer,
    sources,
    usedExternal,
    ...(externalUnavailableReason ? { externalUnavailableReason } : {}),
  });
}
