# DGX Spark Agent Council

TorontoView's agent council is designed to run local inference on NVIDIA DGX Spark and expose the result through the app API.

## Runtime

- API route: `POST /api/agent-council/review`
- Core library: `lib/agentCouncil.ts`
- Default runtime: deterministic fallback when DGX Spark NIM is not configured
- NVIDIA runtime: OpenAI-compatible NVIDIA NIM chat-completions endpoint

Required environment for NVIDIA runtime:

```env
NVIDIA_NIM_BASE_URL=http://127.0.0.1:8000/v1
NVIDIA_NIM_MODEL=<dgx-spark-supported-model>
NVIDIA_NIM_API_KEY=<optional-if-local-endpoint-requires-it>
```

When running through the current OpenClaw tunnel, commands and service setup should happen on DGX Spark through the OpenClaw WebSocket gateway exposed locally at:

```text
http://127.0.0.1:18789
ws://127.0.0.1:18789
```

Do not treat the Windows checkout as the DGX Spark execution environment unless the project has been explicitly synced there.

## NVIDIA Stack Evidence

The council implementation is intended to satisfy the NVIDIA stack requirement with:

- NVIDIA DGX Spark as the local AI computer.
- NVIDIA NIM for GPU-accelerated local LLM inference.
- NVIDIA NeMo LoRA adapters for the three specialist agents.
- Official-source RAG for Toronto/Ontario knowledge grounding.

Optional scoring extensions:

- RAPIDS for source-document deduplication, chunk analytics, and evaluation reports.
- cuOpt for route, construction logistics, or traffic-impact optimization demos.

## Agents

- `toronto-building-regulations-lora`: Toronto zoning, permit, and Ontario Building Code review.
- `ontario-business-bursaries-lora`: Ontario and City of Toronto business-support review.
- `civil-infrastructure-toronto-lora`: traffic, transit, public realm, access, and infrastructure review.

The API response includes these adapter IDs in `audit.adapterIds` even when fallback mode is active, so the demo can show the intended NeMo adapter boundary.

## Example Request

```json
{
  "projectDescription": "Mixed-use six-storey building with ground-floor retail and affordable office incubator space.",
  "location": {
    "address": "Downtown Toronto",
    "lat": 43.6532,
    "lng": -79.3832
  },
  "buildings": [
    {
      "id": "proposal-1",
      "zoneType": "MU1",
      "floors": 6,
      "heightM": 22,
      "footprintM2": 850,
      "intendedUse": "mixed-use"
    }
  ],
  "businessContext": {
    "applicantType": "Ontario small business",
    "sector": "urban technology",
    "projectStage": "pilot",
    "fundingGoal": "non-dilutive pilot funding"
  },
  "transportContext": {
    "dailyTripsEstimate": 140,
    "nearbyTransit": ["TTC subway", "streetcar"],
    "affectedRoads": ["local curb lane"]
  }
}
```

## Response Contract

The response contains:

- `agents[]`: individual specialist votes, risks, missing information, actions, citations, and confidence.
- `councilDecision`: final board vote, blockers, conditions, growth opportunities, next steps, and confidence.
- `audit`: runtime, model, NIM endpoint, NVIDIA stack list, adapter IDs, corpus version, and timestamp.

All legal, funding, and infrastructure outputs are decision support only. The council must not represent itself as a lawyer, licensed engineer, municipal official, or final funding authority.
