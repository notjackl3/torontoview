"use client";

import { useMemo } from "react";
import { MODEL_CATALOG, modelsForProvider, type CatalogModel } from "@/lib/llm/catalog";
import type { LlmProviderId } from "@/lib/llm/providers";

interface ModelPickerProps {
  provider: LlmProviderId;
  model: string | null;
  onChange: (model: string) => void;
  className?: string;
  /** When true, show every catalog model regardless of provider. */
  allowAnyProvider?: boolean;
}

export function ModelPicker({
  provider,
  model,
  onChange,
  className,
  allowAnyProvider,
}: ModelPickerProps) {
  const options = useMemo<CatalogModel[]>(() => {
    return allowAnyProvider ? MODEL_CATALOG : modelsForProvider(provider);
  }, [provider, allowAnyProvider]);

  return (
    <div className={className}>
      <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
        Model
      </label>
      <select
        value={model ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      >
        <option value="" disabled>
          Select a model…
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.displayName}
            {option.badge ? ` · ${option.badge}` : ""}
          </option>
        ))}
      </select>
      {model
        ? (() => {
            const selected = MODEL_CATALOG.find((m) => m.id === model);
            if (!selected) return null;
            return (
              <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
                {selected.description} · context {selected.contextLength.toLocaleString()} tokens
              </p>
            );
          })()
        : null}
    </div>
  );
}
