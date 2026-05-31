#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="${LORA_CONTAINER_IMAGE:-nvcr.io/nvidia/pytorch:26.04-py3}"
DATASET="${LORA_DATASET:-data/agent-council/lora/all.jsonl}"
OUTPUT_DIR="${LORA_OUTPUT_DIR:-models/agent-council-lora}"
BASE_MODEL="${LORA_BASE_MODEL:-Qwen/Qwen2.5-7B-Instruct}"
BACKEND="${LORA_BACKEND:-peft}"
MAX_STEPS="${LORA_MAX_STEPS:-25}"
EPOCHS="${LORA_EPOCHS:-1}"
BATCH_SIZE="${LORA_BATCH_SIZE:-2}"
GRAD_ACCUM="${LORA_GRAD_ACCUM:-8}"
LEARNING_RATE="${LORA_LEARNING_RATE:-2e-4}"

docker run --rm -i \
  --gpus all \
  --ipc=host \
  --ulimit memlock=-1 \
  --ulimit stack=67108864 \
  -v "${REPO_ROOT}:/workspace/torontoview" \
  -w /workspace/torontoview \
  -e HF_HOME=/workspace/torontoview/.cache/huggingface \
  -e TRANSFORMERS_CACHE=/workspace/torontoview/.cache/huggingface \
  -e LORA_BASE_MODEL="${BASE_MODEL}" \
  -e LORA_BACKEND="${BACKEND}" \
  -e LORA_MAX_STEPS="${MAX_STEPS}" \
  -e LORA_EPOCHS="${EPOCHS}" \
  -e LORA_BATCH_SIZE="${BATCH_SIZE}" \
  -e LORA_GRAD_ACCUM="${GRAD_ACCUM}" \
  -e LORA_LEARNING_RATE="${LEARNING_RATE}" \
  "${IMAGE}" \
  bash -lc "python -m pip install --upgrade pip && python -m pip install -r training/agent-council-lora/requirements-container.txt && python training/agent-council-lora/train_unsloth_lora.py --dataset '${DATASET}' --output-dir '${OUTPUT_DIR}' --base-model '${BASE_MODEL}' --backend '${BACKEND}' --max-steps '${MAX_STEPS}' --epochs '${EPOCHS}' --batch-size '${BATCH_SIZE}' --grad-accum '${GRAD_ACCUM}' --learning-rate '${LEARNING_RATE}'"
