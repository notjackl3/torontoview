/**
 * Shared stat tile used across analysis panels (Demographics, Zoning, Grants,
 * etc.). Provides consistent typography, baseline alignment, and tone slots so
 * a row of tiles renders as a clean visual grid.
 *
 * Design choices:
 *   - flex-col + h-full so all cards in a grid stretch to the tallest sibling
 *   - label area is one short uppercase line, value pushes to mt-auto so the
 *     numeric line aligns across every card in the row
 *   - hint clamps to 2 lines so a long caption can't elongate the card vs. its
 *     siblings (the grid wrapper handles row-stretching instead)
 */

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export type StatTone = "neutral" | "ok" | "warn" | "info" | "accent";

const TONE_VALUE: Record<StatTone, string> = {
  neutral: "text-slate-900",
  ok: "text-emerald-700",
  warn: "text-rose-700",
  info: "text-[#003F7C]",
  accent: "text-amber-700",
};

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  tone?: StatTone;
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "h-full min-h-[88px] flex flex-col rounded-lg border border-slate-900/10 bg-white/80 px-3 py-2.5 shadow-[0_1px_0_rgba(15,23,42,0.04)]",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-500 uppercase tracking-[0.06em] leading-tight">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p
        className={cn(
          "mt-auto pt-1 text-[18px] font-black leading-none tabular-nums",
          TONE_VALUE[tone],
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[9px] text-slate-500 leading-snug line-clamp-2">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Convenience: wrap a row of stat cards in a consistent 3-col grid. */
export function StatGrid({
  children,
  cols = 3,
  className,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}) {
  const grid = cols === 2 ? "grid-cols-2" : cols === 4 ? "grid-cols-4" : "grid-cols-3";
  return (
    <div className={cn("grid gap-2 items-stretch", grid, className)}>
      {children}
    </div>
  );
}
