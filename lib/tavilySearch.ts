export interface TavilySnippet {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface TavilySearchResult {
  snippets: TavilySnippet[];
  query: string;
}

interface TavilyApiResponse {
  results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
  answer?: string;
}

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

export function tavilyApiKey(): string | null {
  return process.env.TAVILY_API_KEY?.trim() || null;
}

export function isTavilyConfigured(): boolean {
  return Boolean(tavilyApiKey());
}

export async function tavilySearch(
  query: string,
  options: { maxResults?: number; includeRawContent?: boolean } = {},
): Promise<TavilySearchResult> {
  const key = tavilyApiKey();
  if (!key) {
    throw new Error("TAVILY_API_KEY is not set");
  }

  const trimmedQuery = query.trim().slice(0, 400);
  const maxResults = Math.max(1, Math.min(10, options.maxResults ?? 5));

  const response = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query: trimmedQuery,
      max_results: maxResults,
      include_answer: false,
      include_raw_content: Boolean(options.includeRawContent),
      search_depth: "basic",
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Tavily search failed (${response.status}): ${text || response.statusText}`);
  }

  const data = (await response.json()) as TavilyApiResponse;
  const snippets: TavilySnippet[] = (data.results ?? [])
    .filter((r) => r.url && r.content)
    .map((r) => ({
      title: r.title ?? r.url ?? "Result",
      url: r.url!,
      content: (r.content ?? "").trim().slice(0, 1200),
      score: r.score,
    }));

  return { snippets, query: trimmedQuery };
}
