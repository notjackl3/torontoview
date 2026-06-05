# NVIDIA AI Stack in TorontoView

TorontoView is built end-to-end on the NVIDIA AI stack. This document maps every feature in the platform to the NVIDIA layer it depends on, so a reviewer can see at a glance how each tier is exercised.

## Stack mapping

| NVIDIA layer | Component | Where it shows up in TorontoView |
|---|---|---|
| **Hardware** | NVIDIA GPU | Required to host any inference path. Drives both DGX-side training and any local GGUF dev server. |
| **Systems** | **DGX Spark** | LoRA fine-tuning lives in `training/agent-council-lora/`. The `run_nvidia_container.sh` launcher targets DGX with `--gpus all`. |
| **Software** | **CUDA / cuDNN** | Pulled implicitly via the NGC PyTorch container (`nvcr.io/nvidia/pytorch:26.04-py3`). Powers PEFT + TRL training of Qwen2.5-7B-Instruct. |
| **Software** | **NGC Containers** | Reproducible training environment. No "fight CUDA versions" tax. |
| **Platforms** | **NVIDIA NIM** | Default inference provider for every LLM-backed route — voice design, environmental report, agent council, tree advisor, AI Insights. Configured via `NVIDIA_API_KEY` + `NVIDIA_NIM_BASE_URL`. See `lib/llm/providers.ts`. |
| **Models** | Nemotron family | Headline served model: `meta/llama-3.3-nemotron-super-49b-v1`. Catalog also includes `nvidia/llama-3.1-nemotron-70b-instruct` and `nvidia/nemotron-mini-4b-instruct`. See `lib/llm/catalog.ts`. |
| **Models (custom)** | **Toronto Council LoRA** | Domain-fine-tuned on DGX Spark from Toronto's official municipal corpus (zoning, business bursaries, civil infrastructure). Served from a self-hosted vLLM/NIM under the `nvidia-dgx` provider. See `training/agent-council-lora/README.md` and `lib/agentCouncil.ts`. |

## Feature → NVIDIA layer

| Feature | Reasoning layer | Why this layer |
|---|---|---|
| Voice building design (`/api/design`) | NIM — small/fast Nemotron Mini | Low-latency JSON parsing; tight Zod retry loop. |
| Ask popover (`/api/ask`) | NIM — Llama-3.1-Nemotron 70B | General chat-grade reasoning over the panel context bundle. |
| Tree advisor (`/api/tree-advisor`) | NIM | RAG-style recommendation grounded in the Toronto tree dataset. |
| Competitor analysis (`/api/competitor-analysis`) | NIM with JSON mode | Structured competitor scoring. |
| Reasonableness review (`/api/reasonableness-review`) | NIM or DGX-LoRA | Senior-advisor review of a proposal — uses the council LoRA when available. |
| Agent Council (`/api/agent-council/review`) | **DGX-served LoRA** (preferred) → NIM fallback | Four specialized advisors (Building Regulations, Bursaries, Business Viability, Civil Infrastructure). Behavior in the LoRA, facts in the RAG corpus. |
| **AI Insights — Water** (`/api/insights/water-impact`) | NIM | Deterministic drainage stats → recommendations. |
| **AI Insights — Traffic** (`/api/insights/traffic-impact`) | NIM | Deterministic congestion stats → recommendations. |
| **AI Insights — Shadow** (`/api/insights/shadow-impact`) | NIM | Deterministic sun occlusion → mitigation advice. |
| **AI Insights — Wind / Noise / Stakeholder** (`/api/insights/wind-noise`) | NIM | Deterministic wind + noise + impact summary → recommendations. |
| **AI Insights — Project Brief** (`/api/insights/project-brief`) | NIM — flagship Nemotron Super 49B | Combines all simulation outputs into one synthesized brief. |

## Architectural principle: behavior in LoRA, facts in RAG

The agent-council training pipeline (`training/agent-council-lora/`) explicitly fine-tunes for **behavior**, not facts. Toronto regulations live in the RAG corpus under `data/agent-council/` and can be refreshed from official sources without retraining.

This split is what makes the DGX-served model trustworthy in a planning context: the LoRA learns *how* to write a council review, the corpus carries *what* the current rules are.

## What lives where

```
training/agent-council-lora/        ← DGX Spark fine-tuning (Hardware/Systems/Software)
  ├── train_unsloth_lora.py
  ├── requirements-container.txt
  └── run_nvidia_container.sh       ← pulls nvcr.io/nvidia/pytorch:26.04-py3

lib/llm/                            ← Multi-provider client (Platforms)
  ├── providers.ts                  ← NIM / DGX / Local / OpenAI registry
  ├── catalog.ts                    ← Model catalog (Nemotron variants + Toronto-LoRA)
  ├── client.ts                     ← generateCompletion() + retry
  ├── preferences.ts                ← server-side header resolution
  └── clientPreferences.ts          ← localStorage + useLlmPreferences()

lib/insights/                       ← AI Insights layer (Models)
  ├── promptTemplates.ts            ← per-domain system prompts
  ├── schemas.ts                    ← Zod-validated structured output
  └── runner.ts                     ← shared run + parse + validate

app/api/insights/                   ← Five NIM-served reasoning endpoints
  ├── water-impact/
  ├── traffic-impact/
  ├── shadow-impact/
  ├── wind-noise/
  └── project-brief/

app/settings/                       ← /settings model picker UI
app/api/llm/health/                 ← provider config + 1-token probe
```

## Why this is "an NVIDIA project"

1. **Training happens on NVIDIA hardware**, in an NVIDIA container, against NVIDIA-blessed model weights.
2. **Every reasoning call goes through an NVIDIA-served model by default** — Nemotron via NIM for general work, the Toronto Council LoRA on DGX for domain-specific recommendation.
3. **The deterministic simulations and the LLM layer cleanly separate**: GPU-accelerated simulations on the user's box, reasoning on NVIDIA inference. The AI Insights layer is the seam.
4. **Users can explore the NVIDIA model catalog from `/settings`** without code changes — picking between Nemotron flagship, mini, Mixtral-on-NIM, or the fine-tuned Toronto LoRA.
