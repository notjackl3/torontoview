import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL_CATALOG, modelsForProvider, getModel } from "./catalog";
import {
  defaultProviderId,
  getProvider,
  isProviderConfigured,
  LLM_PROVIDERS,
  PROVIDER_ORDER,
  resolveApiKey,
  resolveBaseUrl,
  resolveDefaultModel,
} from "./providers";
import { generateCompletion, generateCompletionText } from "./client";
import { LLM_HEADER_NAMES, resolveLlmPreferences } from "./preferences";

const ENV_KEYS = [
  "LLM_PROVIDER",
  "NVIDIA_API_KEY",
  "NVIDIA_NIM_BASE_URL",
  "NVIDIA_NIM_DEFAULT_MODEL",
  "DGX_INFERENCE_BASE_URL",
  "DGX_INFERENCE_API_KEY",
  "DGX_INFERENCE_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "LOCAL_LLM_BASE_URL",
  "LOCAL_LLM_API_KEY",
  "LOCAL_LLM_MODEL",
];

function snapshotEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) snap[key] = process.env[key];
  return snap;
}

function restoreEnv(snap: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    if (snap[key] === undefined) delete process.env[key];
    else process.env[key] = snap[key];
  }
}

describe("provider catalog", () => {
  it("declares NVIDIA NIM as the headline provider with the public NIM base URL and a Nemotron default", () => {
    const nim = getProvider("nvidia-nim");
    expect(nim.vendor).toBe("nvidia");
    expect(nim.shortName).toBe("NVIDIA NIM");
    expect(nim.defaultBaseUrl).toBe("https://integrate.api.nvidia.com/v1");
    expect(nim.apiKeyEnv).toBe("NVIDIA_API_KEY");
    expect(nim.defaultModel).toMatch(/nemotron/i);
  });

  it("orders NVIDIA-served providers ahead of OpenAI in the provider list", () => {
    const nimIdx = PROVIDER_ORDER.indexOf("nvidia-nim");
    const dgxIdx = PROVIDER_ORDER.indexOf("nvidia-dgx");
    const openaiIdx = PROVIDER_ORDER.indexOf("openai");
    expect(nimIdx).toBeGreaterThanOrEqual(0);
    expect(dgxIdx).toBeGreaterThanOrEqual(0);
    expect(openaiIdx).toBeGreaterThan(nimIdx);
    expect(openaiIdx).toBeGreaterThan(dgxIdx);
  });

  it("includes Toronto Council LoRA pointing at the DGX provider", () => {
    const lora = getModel("toronto-council-lora");
    expect(lora).toBeDefined();
    expect(lora!.provider).toBe("nvidia-dgx");
    expect(lora!.badge).toBe("fine-tuned");
  });

  it("offers at least three NIM-served models and they all reference real provider ids", () => {
    const nimModels = modelsForProvider("nvidia-nim");
    expect(nimModels.length).toBeGreaterThanOrEqual(3);
    for (const model of MODEL_CATALOG) {
      expect(LLM_PROVIDERS[model.provider]).toBeDefined();
    }
  });
});

describe("env-aware provider resolution", () => {
  let env: Record<string, string | undefined>;

  beforeEach(() => {
    env = snapshotEnv();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    restoreEnv(env);
  });

  it("falls back to local when nothing is configured", () => {
    expect(defaultProviderId()).toBe("local");
  });

  it("picks nvidia-nim when NVIDIA_API_KEY is present", () => {
    process.env.NVIDIA_API_KEY = "nvapi-test";
    expect(defaultProviderId()).toBe("nvidia-nim");
    expect(isProviderConfigured(getProvider("nvidia-nim"))).toBe(true);
  });

  it("respects LLM_PROVIDER override", () => {
    process.env.NVIDIA_API_KEY = "nvapi-test";
    process.env.LLM_PROVIDER = "openai";
    expect(defaultProviderId()).toBe("openai");
  });

  it("uses NVIDIA_NIM_DEFAULT_MODEL when set, otherwise the catalog default", () => {
    const nim = getProvider("nvidia-nim");
    expect(resolveDefaultModel(nim)).toBe("meta/llama-3.3-nemotron-super-49b-v1");
    process.env.NVIDIA_NIM_DEFAULT_MODEL = "nvidia/nemotron-mini-4b-instruct";
    expect(resolveDefaultModel(nim)).toBe("nvidia/nemotron-mini-4b-instruct");
  });

  it("strips trailing slashes from base URLs", () => {
    process.env.NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1/";
    expect(resolveBaseUrl(getProvider("nvidia-nim"))).toBe(
      "https://integrate.api.nvidia.com/v1",
    );
  });

  it("treats DGX as configured once base URL and api key are set", () => {
    expect(isProviderConfigured(getProvider("nvidia-dgx"))).toBe(false);
    process.env.DGX_INFERENCE_BASE_URL = "https://dgx.example.com/v1";
    process.env.DGX_INFERENCE_API_KEY = "dgx-test";
    expect(isProviderConfigured(getProvider("nvidia-dgx"))).toBe(true);
    expect(resolveApiKey(getProvider("nvidia-dgx"))).toBe("dgx-test");
  });
});

describe("resolveLlmPreferences", () => {
  let env: Record<string, string | undefined>;

  beforeEach(() => {
    env = snapshotEnv();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    restoreEnv(env);
  });

  it("uses the x-tv-provider/model headers when present", () => {
    const req = new Request("https://example.com/api/x", {
      headers: {
        [LLM_HEADER_NAMES.provider]: "nvidia-nim",
        [LLM_HEADER_NAMES.model]: "nvidia/nemotron-mini-4b-instruct",
      },
    });
    const prefs = resolveLlmPreferences(req);
    expect(prefs.provider).toBe("nvidia-nim");
    expect(prefs.model).toBe("nvidia/nemotron-mini-4b-instruct");
  });

  it("ignores unknown provider headers and falls back to defaults", () => {
    process.env.NVIDIA_API_KEY = "nvapi-test";
    const req = new Request("https://example.com/api/x", {
      headers: { [LLM_HEADER_NAMES.provider]: "not-a-real-provider" },
    });
    const prefs = resolveLlmPreferences(req);
    expect(prefs.provider).toBe("nvidia-nim");
    expect(prefs.model).toBe("meta/llama-3.3-nemotron-super-49b-v1");
  });
});

describe("generateCompletion (mocked fetch)", () => {
  let env: Record<string, string | undefined>;

  beforeEach(() => {
    env = snapshotEnv();
    process.env.NVIDIA_API_KEY = "nvapi-test";
    process.env.NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv(env);
  });

  it("POSTs to {base}/chat/completions with bearer auth and OpenAI-shaped body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "meta/llama-3.3-nemotron-super-49b-v1",
          choices: [{ message: { content: "OK" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await generateCompletion({
      provider: "nvidia-nim",
      messages: [
        { role: "system", content: "ping" },
        { role: "user", content: "ping" },
      ],
    });

    expect(result.text).toBe("OK");
    expect(result.meta.provider).toBe("nvidia-nim");
    expect(result.meta.baseUrl).toBe("https://integrate.api.nvidia.com/v1");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer nvapi-test");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("meta/llama-3.3-nemotron-super-49b-v1");
    expect(body.messages).toHaveLength(2);
  });

  it("forwards response_format when caller asks for JSON mode", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await generateCompletion({
      provider: "nvidia-nim",
      messages: [{ role: "user", content: "x" }],
      responseFormat: { type: "json_object" },
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("retries transient failures and eventually returns text", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("nim overloaded", { status: 503 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "second-try" } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    const text = await generateCompletionText(
      {
        provider: "nvidia-nim",
        messages: [{ role: "user", content: "ping" }],
      },
      2,
    );
    expect(text).toBe("second-try");
    expect(spy).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("raises a descriptive error when the provider has no base URL", async () => {
    delete process.env.NVIDIA_NIM_BASE_URL;
    // Force the in-memory default URL to be missing too by switching to DGX,
    // which has no built-in default base URL.
    delete process.env.DGX_INFERENCE_BASE_URL;
    delete process.env.DGX_INFERENCE_API_KEY;

    await expect(
      generateCompletion({
        provider: "nvidia-dgx",
        messages: [{ role: "user", content: "x" }],
      }),
    ).rejects.toThrow(/DGX_INFERENCE_BASE_URL/);
  });
});
