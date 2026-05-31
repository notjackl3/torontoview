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
        <span className="text-[10px] font-black uppercase tracking-tight text-slate-600">
          {label}
        </span>
        {hint && <span className="text-[9px] text-slate-500">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

const inputBase =
  "w-full px-3 py-2 text-sm bg-white border border-[#003F7C]/15 rounded-md focus:ring-2 focus:ring-[#003F7C]/25 focus:border-[#003F7C]/50 text-slate-900 placeholder:text-slate-400 outline-none transition-colors";

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
          ? "border-[#003F7C]/40 bg-[#003F7C]/5"
          : "border-[#003F7C]/15 bg-white hover:border-[#003F7C]/30"
      }`}
    >
      <span className="text-[11px] font-black uppercase tracking-tight text-slate-800">
        {label}
      </span>
      <span
        className={`h-4 w-7 rounded-full transition-colors ${
          checked ? "bg-[#003F7C]" : "bg-slate-300"
        } relative`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${
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
      <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">{title}</h2>
      <p className="mt-1 text-xs text-slate-600">{subtitle}</p>
    </div>
  );
}
