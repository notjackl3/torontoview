"use client";

import React from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] font-bold uppercase tracking-tight text-zinc-400">
          {label}
        </span>
        {hint && <span className="text-[9px] text-zinc-500">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

const inputBase =
  "w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-md focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400/40 text-zinc-100 placeholder:text-zinc-600 outline-none";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function NumberInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="number" {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${inputBase} resize-none min-h-[72px] ${props.className ?? ""}`}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
        checked
          ? "border-blue-400/40 bg-blue-500/10"
          : "border-white/10 bg-white/5 hover:border-white/20"
      }`}
    >
      <span className="text-[11px] font-bold uppercase tracking-tight text-zinc-200">
        {label}
      </span>
      <span
        className={`h-4 w-7 rounded-full transition-colors ${
          checked ? "bg-blue-500" : "bg-zinc-700"
        } relative`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
            checked ? "left-3.5" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-black uppercase tracking-tight text-zinc-100">{title}</h2>
      <p className="mt-1 text-xs text-zinc-400">{subtitle}</p>
    </div>
  );
}
