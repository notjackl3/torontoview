# Agent Council LoRA

This folder contains the DGX-only training entrypoint for the TorontoView agent council behavior LoRA.

The LoRA is for behavior, not fact memorization. Toronto regulations, business supports, infrastructure, and local business context should stay in the RAG corpus under `data/agent-council`, where it can be refreshed from official sources.

## Prepare the dataset

Run this on the DGX after the official corpus and retrieval index have been built:

```bash
npm run prepare:agent-council-lora
```

Useful limits:

```bash
AGENT_COUNCIL_LORA_EXAMPLES_PER_AGENT=400 npm run prepare:agent-council-lora
```

Outputs:

- `data/agent-council/lora/building-regulations.jsonl`
- `data/agent-council/lora/business-bursaries.jsonl`
- `data/agent-council/lora/business-viability.jsonl`
- `data/agent-council/lora/civil-infrastructure.jsonl`
- `data/agent-council/lora/all.jsonl`
- `data/agent-council/lora/summary.json`

Each row is chat-format JSONL with `system`, `user`, and `assistant` messages.

## Train

Preferred DGX Spark path is the NVIDIA PyTorch container:

```bash
bash training/agent-council-lora/run_nvidia_container.sh
```

By default this runs a short smoke training pass with `LORA_MAX_STEPS=25`, writes to `models/agent-council-lora`, and uses the standard PEFT backend inside the NVIDIA container.

For a longer run:

```bash
LORA_MAX_STEPS=0 LORA_EPOCHS=1 bash training/agent-council-lora/run_nvidia_container.sh
```

To change the base model:

```bash
LORA_BASE_MODEL=Qwen/Qwen2.5-7B-Instruct bash training/agent-council-lora/run_nvidia_container.sh
```

Direct Python training on the DGX also works when the training dependencies are already installed:

```bash
python3 training/agent-council-lora/train_unsloth_lora.py \
  --dataset data/agent-council/lora/all.jsonl \
  --output-dir models/agent-council-lora \
  --base-model Qwen/Qwen2.5-7B-Instruct \
  --backend peft
```

Environment overrides:

```bash
LORA_BASE_MODEL=Qwen/Qwen2.5-7B-Instruct
LORA_BACKEND=peft
LORA_MAX_SEQ_LENGTH=4096
LORA_EPOCHS=1
LORA_BATCH_SIZE=2
LORA_GRAD_ACCUM=8
LORA_LEARNING_RATE=2e-4
LORA_MAX_STEPS=0
LORA_R=16
LORA_ALPHA=16
```

The current vLLM runtime uses a GGUF model for inference. For LoRA training, use a Hugging Face checkpoint or local HF-format model path as `--base-model`; GGUF is not the right training source.

The trained adapter lands in `models/agent-council-lora` with `torontoview-lora-manifest.json`.

## DGX Docker Access

The `asus` user must be able to access Docker without sudo for OpenClaw-launched training:

```bash
sudo usermod -aG docker asus
newgrp docker
```

If the group was changed from a terminal session, log out and back in before running the container launcher.
