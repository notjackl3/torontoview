"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Hammer,
  Store,
  ArrowRight,
  ChevronLeft,
  Upload,
  Image as ImageIcon,
  Pencil,
  Layers,
  Loader2,
} from "lucide-react";
import ThreeMap from "@/components/ThreeMap";
import type { BuildMode } from "@/components/BuildingPlacementForm";
import type { MaterialCostBreakdown } from "@/lib/materialCosts";

type SourceChoice = "default" | "upload" | "blueprint" | "editor";

interface ModeOption {
  mode: BuildMode;
  label: string;
  short: string;
  description: string;
  bullets: string[];
  icon: typeof Building2;
  accent: AccentKey;
  badge: string;
}

type AccentKey = "emerald" | "amber" | "navy";

const MODE_OPTIONS: ModeOption[] = [
  {
    mode: "move-in",
    label: "Use an existing building",
    short: "Move-in",
    description:
      "Lease space inside a real building already on the map. Lowest upfront cost — you pay rent and a fit-out.",
    bullets: [
      "Click any existing building",
      "Lease term: 6 months or 5 years",
      "Cost: fit-out + monthly rent",
    ],
    icon: Store,
    accent: "emerald",
    badge: "Fastest path",
  },
  {
    mode: "demolish-rebuild",
    label: "Demolish & rebuild",
    short: "Demolish + Build",
    description:
      "Acquire an existing property, clear the land, and build your own design on the parcel. Highest total cost.",
    bullets: [
      "Click a building to demolish",
      "Demolition cost added to budget",
      "Upload a GLB or use the editor",
    ],
    icon: Hammer,
    accent: "amber",
    badge: "Full control",
  },
  {
    mode: "new-build",
    label: "Build on empty land",
    short: "Ground-up",
    description:
      "Buy an empty parcel and build from the ground up. You own the land and the building outright.",
    bullets: [
      "Click an empty parcel",
      "Land + construction cost",
      "Upload a GLB or use the editor",
    ],
    icon: Building2,
    accent: "navy",
    badge: "Full ownership",
  },
];

/**
 * Light-theme accent palette. `dot` is the bullet/indicator color;
 * `text` is for accent text on white glass; `tile` is the soft-tint
 * icon background when a card is active; `ring` is the focus ring;
 * `button` is the primary CTA color when this accent is selected.
 */
const ACCENT_STYLES: Record<
  AccentKey,
  {
    border: string;
    ring: string;
    iconBg: string;
    iconText: string;
    badgeBg: string;
    badgeText: string;
    dot: string;
    button: string;
  }
> = {
  emerald: {
    border: "border-emerald-500/55",
    ring: "ring-emerald-500/35",
    iconBg: "bg-emerald-500/12",
    iconText: "text-emerald-700",
    badgeBg: "bg-emerald-500/12",
    badgeText: "text-emerald-700",
    dot: "bg-emerald-600",
    button: "bg-emerald-600 hover:bg-emerald-700 text-white",
  },
  amber: {
    border: "border-amber-500/60",
    ring: "ring-amber-500/35",
    iconBg: "bg-amber-500/12",
    iconText: "text-amber-700",
    badgeBg: "bg-amber-500/12",
    badgeText: "text-amber-700",
    dot: "bg-amber-600",
    button: "bg-amber-600 hover:bg-amber-700 text-white",
  },
  navy: {
    border: "border-[#003F7C]/55",
    ring: "ring-[#003F7C]/30",
    iconBg: "bg-[#003F7C]/10",
    iconText: "text-[#003F7C]",
    badgeBg: "bg-[#003F7C]/10",
    badgeText: "text-[#003F7C]",
    dot: "bg-[#003F7C]",
    button: "bg-[#003F7C] hover:brightness-110 text-white",
  },
};

const SOURCE_OPTIONS: Array<{
  key: SourceChoice;
  label: string;
  description: string;
  icon: typeof Upload;
}> = [
  {
    key: "default",
    label: "Use default model",
    description:
      "Continue with the modern office tower included in the demo. Fastest path.",
    icon: Layers,
  },
  {
    key: "upload",
    label: "Upload a GLB",
    description:
      "Bring your own GLB/glTF building. Materials are parsed and priced automatically.",
    icon: Upload,
  },
  {
    key: "blueprint",
    label: "Blueprint → 3D",
    description:
      "Upload a floorplan or building photo and we'll turn it into a 3D model via Meshy AI.",
    icon: ImageIcon,
  },
  {
    key: "editor",
    label: "Design in the editor",
    description:
      "Open the voice-driven editor to design from scratch, then come back here to place it.",
    icon: Pencil,
  },
];

const archivoStyle = {
  fontFamily:
    "var(--font-archivo), Archivo, system-ui, -apple-system, sans-serif",
};

export default function StartPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedMode, setSelectedMode] = useState<BuildMode | null>(null);
  const [selectedSource, setSelectedSource] = useState<SourceChoice | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [blueprintFile, setBlueprintFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const activeMode = MODE_OPTIONS.find((o) => o.mode === selectedMode) ?? null;
  const accent = activeMode ? ACCENT_STYLES[activeMode.accent] : null;

  const goToStep2 = () => {
    if (!selectedMode) return;
    if (selectedMode === "move-in") {
      router.push(`/map?mode=${selectedMode}`);
      return;
    }
    setStep(2);
  };

  const handleContinue = async () => {
    if (!selectedMode || !selectedSource) return;

    if (selectedSource === "default") {
      router.push(`/map?mode=${selectedMode}`);
      return;
    }

    if (selectedSource === "editor") {
      router.push(`/editor?mode=${selectedMode}`);
      return;
    }

    if (selectedSource === "upload") {
      if (!uploadFile) {
        setUploadError("Pick a GLB file to upload first.");
        return;
      }
      setIsUploading(true);
      setUploadError(null);
      try {
        const buffer = await uploadFile.arrayBuffer();
        const res = await fetch("/api/editor/building-with-materials", {
          method: "POST",
          headers: {
            "content-type": "application/octet-stream",
            "x-building-name": uploadFile.name,
          },
          body: buffer,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          id: string;
          breakdown: MaterialCostBreakdown;
        };
        sessionStorage.setItem(
          `materials:${data.id}`,
          JSON.stringify(data.breakdown),
        );
        router.push(`/map?mode=${selectedMode}&buildingId=${data.id}`);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : String(err));
        setIsUploading(false);
      }
      return;
    }

    if (selectedSource === "blueprint") {
      if (!blueprintFile) {
        setUploadError("Pick a blueprint image to upload.");
        return;
      }
      setIsUploading(true);
      setUploadError(null);
      try {
        const form = new FormData();
        form.append("image", blueprintFile);
        const res = await fetch("/api/blueprint-to-3d", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          id: string;
          breakdown: MaterialCostBreakdown;
        };
        sessionStorage.setItem(
          `materials:${data.id}`,
          JSON.stringify(data.breakdown),
        );
        router.push(`/map?mode=${selectedMode}&buildingId=${data.id}`);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : String(err));
        setIsUploading(false);
      }
    }
  };

  return (
    <main
      className="relative min-h-screen w-full overflow-hidden text-slate-900"
      style={archivoStyle}
    >
      {/* ─── 3D city background ─── */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <ThreeMap
          className="w-full h-full"
          showTorontoTreesLayer={false}
          showParksLayer
          showWaterLayer
          mapStyle="light"
        />
      </div>

      {/* ─── Light ice-blue scrim over the map ─── */}
      <div
        aria-hidden
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(248,250,253,0.82) 0%, rgba(232,240,252,0.72) 40%, rgba(232,240,252,0.78) 100%)",
        }}
      />
      {/* Subtle accent wash so the page reads as branded, not flat */}
      <div
        aria-hidden
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(0,63,124,0.10), transparent 70%)",
        }}
      />

      {/* ─── Foreground content ─── */}
      <div className="relative z-20 mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <div className="mb-8 flex items-center justify-between">
          {step === 1 ? (
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tight text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ChevronLeft size={14} />
              Back
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tight text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ChevronLeft size={14} />
              Back to mode
            </button>
          )}
          <Link
            href="/map"
            className="text-[10px] font-bold uppercase tracking-tight text-slate-500 hover:text-[#003F7C] transition-colors"
          >
            Skip to open map →
          </Link>
        </div>

        {step === 1 && (
          <>
            <header className="mb-10 max-w-3xl">
              <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#003F7C]">
                Step 1 of 3 · Choose your approach
              </p>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 leading-tight">
                How would you like to open your business?
              </h1>
              <p className="mt-4 text-sm sm:text-base text-slate-600 max-w-2xl leading-relaxed">
                TorontoView will guide you through site selection, building
                design, and a full impact report. Start by choosing how
                you&apos;ll take the site — each path has different costs and
                constraints.
              </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {MODE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = selectedMode === opt.mode;
                const styles = ACCENT_STYLES[opt.accent];
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => setSelectedMode(opt.mode)}
                    className={`group relative flex flex-col text-left p-6 rounded-2xl border backdrop-blur-xl transition-all duration-200 ${
                      isActive
                        ? `${styles.border} ring-2 ${styles.ring} bg-white/90 -translate-y-0.5 shadow-[0_22px_60px_-22px_rgba(0,63,124,0.35)]`
                        : "border-[#003F7C]/12 bg-white/75 hover:bg-white/90 hover:border-[#003F7C]/25 hover:-translate-y-0.5 shadow-[0_10px_30px_-18px_rgba(0,63,124,0.25)]"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-5">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center ${styles.iconBg} ${styles.iconText}`}
                      >
                        <Icon size={22} />
                      </div>
                      <span
                        className={`text-[9px] font-black uppercase tracking-tight px-2 py-1 rounded-full ${styles.badgeBg} ${styles.badgeText}`}
                      >
                        {opt.badge}
                      </span>
                    </div>

                    <h2 className="text-lg font-black tracking-tight text-slate-900 mb-2">
                      {opt.label}
                    </h2>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                      {opt.description}
                    </p>

                    <ul className="mt-auto space-y-1.5 pt-4 border-t border-[#003F7C]/10">
                      {opt.bullets.map((b) => (
                        <li
                          key={b}
                          className="flex items-start gap-2 text-[11px] text-slate-600"
                        >
                          <span
                            className={`mt-1.5 inline-block w-1 h-1 rounded-full ${styles.dot}`}
                            aria-hidden
                          />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            <div className="mt-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-xs text-slate-600 max-w-md">
                {activeMode ? (
                  <>
                    You picked{" "}
                    <span className="font-bold text-slate-900">
                      {activeMode.short}
                    </span>
                    .{" "}
                    {selectedMode === "move-in"
                      ? "Next, click an existing building on the map."
                      : "Next, choose where your 3D model comes from."}
                  </>
                ) : (
                  <>Pick one of the three options above to continue.</>
                )}
              </div>
              <button
                type="button"
                onClick={goToStep2}
                disabled={!selectedMode}
                className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-black uppercase tracking-tight transition-all shadow-[0_4px_14px_-6px_rgba(0,63,124,0.4)] ${
                  selectedMode && accent
                    ? accent.button
                    : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                }`}
              >
                {selectedMode === "move-in"
                  ? "Continue to site selection"
                  : "Continue to building source"}
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}

        {step === 2 && activeMode && accent && (
          <>
            <header className="mb-10 max-w-3xl">
              <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#003F7C]">
                Step 2 of 3 · Building source
              </p>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 leading-tight">
                Where does your building come from?
              </h1>
              <p className="mt-4 text-sm text-slate-600 max-w-2xl leading-relaxed">
                You picked{" "}
                <span className="font-bold text-slate-900">
                  {activeMode.short}
                </span>
                . Pick a source for the 3D model that goes on the site. Material
                costs will be added to the financials panel automatically.
              </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SOURCE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = selectedSource === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setSelectedSource(opt.key);
                      setUploadError(null);
                    }}
                    className={`flex gap-4 p-5 rounded-2xl border backdrop-blur-xl text-left transition-all duration-150 ${
                      isActive
                        ? `${accent.border} ring-2 ${accent.ring} bg-white/90 shadow-[0_18px_50px_-22px_rgba(0,63,124,0.35)]`
                        : "border-[#003F7C]/12 bg-white/75 hover:bg-white/90 hover:border-[#003F7C]/25"
                    }`}
                  >
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                        isActive ? accent.iconBg : "bg-[#003F7C]/06"
                      } ${isActive ? accent.iconText : "text-slate-500"}`}
                    >
                      <Icon size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-black tracking-tight text-slate-900">
                        {opt.label}
                      </p>
                      <p className="text-xs text-slate-600 leading-relaxed mt-1">
                        {opt.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedSource === "upload" && (
              <div className="mt-6 p-5 rounded-2xl border border-[#003F7C]/12 bg-white/80 backdrop-blur-xl shadow-[0_10px_30px_-18px_rgba(0,63,124,0.25)]">
                <label className="text-xs font-black uppercase tracking-tight text-slate-700 mb-3 block">
                  GLB / glTF file
                </label>
                <input
                  type="file"
                  accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-bold file:uppercase file:bg-[#003F7C] file:text-white hover:file:brightness-110"
                />
                {uploadFile && (
                  <p className="mt-3 text-[11px] text-slate-500">
                    {uploadFile.name} —{" "}
                    {(uploadFile.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>
            )}

            {selectedSource === "blueprint" && (
              <div className="mt-6 p-5 rounded-2xl border border-[#003F7C]/12 bg-white/80 backdrop-blur-xl shadow-[0_10px_30px_-18px_rgba(0,63,124,0.25)]">
                <label className="text-xs font-black uppercase tracking-tight text-slate-700 mb-3 block">
                  Floorplan or building photo
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) =>
                    setBlueprintFile(e.target.files?.[0] ?? null)
                  }
                  className="block w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-bold file:uppercase file:bg-[#003F7C] file:text-white hover:file:brightness-110"
                />
                {blueprintFile && (
                  <p className="mt-3 text-[11px] text-slate-500">
                    {blueprintFile.name} —{" "}
                    {(blueprintFile.size / 1024).toFixed(1)} KB
                  </p>
                )}
                <p className="mt-3 text-[11px] text-amber-700">
                  Powered by Meshy AI. Conversion takes ~30-60 seconds.
                </p>
              </div>
            )}

            {uploadError && (
              <div className="mt-5 p-3 rounded-lg border border-red-500/30 bg-red-50/90 text-xs text-red-700">
                {uploadError}
              </div>
            )}

            <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-xs text-slate-600 max-w-md">
                After this, you&apos;ll pick the exact site on the map. The
                form on the map will be pre-filled with your choices.
              </div>
              <button
                type="button"
                onClick={handleContinue}
                disabled={!selectedSource || isUploading}
                className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-black uppercase tracking-tight transition-all shadow-[0_4px_14px_-6px_rgba(0,63,124,0.4)] ${
                  selectedSource && !isUploading
                    ? accent.button
                    : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                }`}
              >
                {isUploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {selectedSource === "blueprint"
                      ? "Converting blueprint…"
                      : "Uploading…"}
                  </>
                ) : (
                  <>
                    Continue to site selection
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
