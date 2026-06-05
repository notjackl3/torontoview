import { defaultProviderId, getProvider, LLM_PROVIDERS, resolveDefaultModel, type LlmProviderId } from "./providers";

export interface ResolvedLlmPreferences {
  provider: LlmProviderId;
  model: string;
}

const PROVIDER_HEADER = "x-tv-provider";
const MODEL_HEADER = "x-tv-model";

function isKnownProvider(id: string | null | undefined): id is LlmProviderId {
  return Boolean(id && id in LLM_PROVIDERS);
}

/**
 * Resolve the provider and model for an inbound API request.
 * Priority:
 *   1. x-tv-provider / x-tv-model request headers (set by the client based on /settings)
 *   2. LLM_PROVIDER + provider-default model env vars
 *   3. defaultProviderId() heuristic
 */
export function resolveLlmPreferences(request: Request): ResolvedLlmPreferences {
  const headerProvider = request.headers.get(PROVIDER_HEADER);
  const provider: LlmProviderId = isKnownProvider(headerProvider)
    ? headerProvider
    : defaultProviderId();

  const headerModel = request.headers.get(MODEL_HEADER);
  const model = headerModel && headerModel.trim().length > 0
    ? headerModel.trim()
    : resolveDefaultModel(getProvider(provider));

  return { provider, model };
}

export const LLM_HEADER_NAMES = {
  provider: PROVIDER_HEADER,
  model: MODEL_HEADER,
};
