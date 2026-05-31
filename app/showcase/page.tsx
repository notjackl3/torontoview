"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

const features = [
  {
    id: "3d-map",
    title: "Live 3D Map of Toronto",
    subtitle: "4,776 real buildings. Real roads. Real city.",
    description:
      "Explore Toronto in a fully interactive 3D environment built from OpenStreetMap data. Satellite and light map styles, real road networks, and every building footprint — all running in your browser.",
    video: "/showcase/live-map.mp4",
    color: "#1a1611",
  },
  {
    id: "building-designer",
    title: "Building Designer & Voice Commands",
    subtitle: "Describe a building. Watch it appear.",
    description:
      "Design 3D buildings by speaking naturally — 'A 6-story mixed-use building, brick facade, flat roof.' Powered by a local model, the system interprets your description and generates a full 3D model in seconds. Adjust dimensions, textures, windows, and rotation with precise controls.",
    video: "/showcase/build-mode.mp4",
    color: "#1a1611",
  },
  {
    id: "tree-advisor",
    title: "Tree Planting Advisor",
    subtitle: "40 verified species from Toronto's planting program.",
    description:
      "An AI-powered advisor recommends trees based on Toronto's climate, soil conditions, and the city's actual Neighbourhood Tree Planting Program. Filter by shade, cost, space, wildlife value, or year-round coverage. Toggle trees on to see landscaping in 3D.",
    video: "/showcase/tree-planting.mp4",
    color: "#1a1611",
  },
  {
    id: "impact-report",
    title: "Environmental Impact Report",
    subtitle: "CO2, energy, water, noise — quantified instantly.",
    description:
      "Place a building and immediately see its environmental footprint: CO2 emissions in tonnes per year, energy consumption in MWh, water usage in cubic metres, and construction noise radius. Generate a full AI-powered impact report with mitigation recommendations.",
    video: "/showcase/environmental-impact.mp4",
    color: "#1a1611",
  },
  {
    id: "shadow-analysis",
    title: "Shadow & Sunlight Analysis",
    subtitle: "See which buildings lose sunlight — before it's built.",
    description:
      "Run shadow studies using real solar position equations for Toronto's latitude (44.23°N). Pick any season — winter solstice, equinox, summer solstice — and drag through the day to watch shadows sweep across the city. Toggle 'With Proposed' to compare before and after.",
    video: "/showcase/shadow-analysis.mp4",
    color: "#1a1611",
  },
  {
    id: "zoning",
    title: "Real-time City Zoning",
    subtitle: "All 76 designations from By-Law 2022-62.",
    description:
      "Every placed building is validated against Toronto's Official Plan zoning designations in real-time. See zoning boundaries, land use compatibility, and population sentiment scores that reflect the building's impact on surrounding residents.",
    video: "/showcase/zoning.mp4",
    color: "#1a1611",
  },
];

function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof features)[0];
  index: number;
}) {
  const isEven = index % 2 === 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="w-full"
    >
      <div
        className={`flex flex-col ${isEven ? "lg:flex-row" : "lg:flex-row-reverse"} gap-6 items-start`}
      >
        {/* Media side — standalone */}
        <div className="lg:w-[55%] w-full rounded-2xl overflow-hidden shadow-lg">
          <video
            src={feature.video}
            autoPlay
            loop
            muted
            playsInline
            className="w-full block"
            onError={(e) => {
              const target = e.target as HTMLVideoElement;
              target.style.display = "none";
              target.parentElement!.innerHTML = `
                <div class="flex flex-col items-center justify-center h-64 w-full text-white/30 gap-3 p-8 bg-black/20 rounded-2xl">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                  <span class="text-sm font-medium">Video coming soon</span>
                </div>
              `;
            }}
          />
        </div>

        {/* Text side — card with background */}
        <div
          className="lg:w-[45%] w-full p-8 lg:p-12 rounded-2xl shadow-lg flex flex-col justify-center"
          style={{ background: feature.color }}
        >
          <span className="text-white/40 text-xs font-bold tracking-[0.2em] uppercase mb-4">
            Feature {String(index + 1).padStart(2, "0")}
          </span>
          <h2
            className="text-2xl lg:text-3xl font-bold text-white mb-2"
            style={{
              fontFamily:
                "var(--font-playfair), 'Playfair Display', Georgia, serif",
            }}
          >
            {feature.title}
          </h2>
          <p
            className="text-white/60 text-sm italic mb-6"
            style={{
              fontFamily:
                "var(--font-playfair), 'Playfair Display', Georgia, serif",
            }}
          >
            {feature.subtitle}
          </p>
          <p className="text-white/80 text-sm leading-relaxed">
            {feature.description}
          </p>
        </div>
      </div>
    </motion.section>
  );
}

export default function ShowcasePage() {
  const [activeNav, setActiveNav] = useState<string | null>(null);

  const scrollToFeature = (id: string) => {
    setActiveNav(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#f4efe6] text-[#1a1611]">
      {/* ───── NAV ───── */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between w-[min(700px,92vw)] px-6 py-3 bg-white/88 backdrop-blur-xl rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.06)]">
        <Link
          href="/"
          className="font-bold text-lg text-[#1a1611] no-underline"
          style={{
            fontFamily:
              "var(--font-playfair), 'Playfair Display', Georgia, serif",
          }}
        >
          TorontoView
        </Link>
        <div className="flex gap-5">
          <Link
            href="/map"
            className="text-[11px] tracking-[0.1em] uppercase text-[#3d362c] no-underline px-3 py-1.5 rounded-full border-2 border-transparent hover:border-[#1a1611] hover:text-[#1a1611] transition-all"
          >
            Explore
          </Link>
          <Link
            href="/editor"
            className="text-[11px] tracking-[0.1em] uppercase text-[#3d362c] no-underline px-3 py-1.5 rounded-full border-2 border-transparent hover:border-[#1a1611] hover:text-[#1a1611] transition-all"
          >
            Build
          </Link>
        </div>
      </nav>

      {/* ───── HERO ───── */}
      <header className="relative pt-28 pb-16 px-6 text-center overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0 z-0">
          <img
            src="/thumb.jpg"
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#f4efe6]/75 via-[#f4efe6]/80 to-[#f4efe6]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-4 py-1.5 text-[11px] tracking-[0.15em] uppercase text-[#8a8279] border border-[#e8e0d2] rounded-full mb-8">
              Mayor&apos;s Innovation Challenge 2026
            </span>

            <h1
              className="text-5xl md:text-7xl font-bold mb-6"
              style={{
                fontFamily:
                  "var(--font-playfair), 'Playfair Display', Georgia, serif",
                letterSpacing: "-0.02em",
              }}
            >
              See Toronto&apos;s Future
              <br />
              <span className="italic font-normal text-[#8a8279]">
                Before It&apos;s Built
              </span>
            </h1>

            <p className="text-lg text-[#8a8279] max-w-2xl mx-auto mb-10 leading-relaxed">
              TorontoView gives residents and councillors the same visibility that
              planners and developers already have. Design a building in plain
              English, place it on a real 3D map of Toronto, and see the impact
              instantly.
            </p>

            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link
                href="/map"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#1a1611] text-[#f4efe6] rounded-full no-underline text-sm tracking-wide hover:-translate-y-0.5 hover:shadow-lg transition-all"
                style={{
                  fontFamily:
                    "var(--font-playfair), 'Playfair Display', Georgia, serif",
                }}
              >
                Try It Live&ensp;&rarr;
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 px-8 py-3.5 border border-[#e8e0d2] text-[#3d362c] rounded-full no-underline text-sm tracking-wide hover:border-[#3d362c] hover:text-[#1a1611] transition-all"
                style={{
                  fontFamily:
                    "var(--font-playfair), 'Playfair Display', Georgia, serif",
                }}
              >
                See Features
              </a>
            </div>
          </motion.div>
        </div>
      </header>

      {/* ───── FEATURE QUICK NAV ───── */}
      <div id="features" className="max-w-5xl mx-auto px-6 mb-12">
        <div className="flex flex-wrap justify-center gap-2">
          {features.map((f) => (
            <button
              key={f.id}
              onClick={() => scrollToFeature(f.id)}
              className="px-4 py-2 text-xs tracking-wide text-[#3d362c] bg-white/60 hover:bg-white border border-[#e8e0d2] hover:border-[#3d362c] rounded-full transition-all cursor-pointer"
            >
              {f.title}
            </button>
          ))}
        </div>
      </div>

      {/* ───── FEATURES ───── */}
      <main className="max-w-5xl mx-auto px-6 space-y-8 pb-16">
        {features.map((feature, i) => (
          <div key={feature.id} id={feature.id}>
            <FeatureCard feature={feature} index={i} />
          </div>
        ))}
      </main>

      {/* ───── CTA SECTION ───── */}
      <section className="bg-[#1a1611] text-[#f4efe6] py-20 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl mx-auto"
        >
          <h2
            className="text-3xl md:text-5xl font-bold mb-6"
            style={{
              fontFamily:
                "var(--font-playfair), 'Playfair Display', Georgia, serif",
            }}
          >
            The tool for everyone else.
          </h2>
          <p className="text-white/50 mb-10 leading-relaxed">
            Planners have tools. Developers have tools. TorontoView gives
            residents, councillors, and community groups the visibility they
            need to participate in the decisions that shape their city.
          </p>
          <Link
            href="/map"
            className="inline-flex items-center gap-2 px-10 py-4 bg-white text-[#1a1611] rounded-full no-underline text-sm font-semibold tracking-wide hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(255,255,255,0.15)] transition-all"
          >
            Explore TorontoView&ensp;&rarr;
          </Link>
        </motion.div>
      </section>

      {/* ───── FOOTER ───── */}
      <footer className="bg-[#1a1611] border-t border-white/10 py-8 px-6 text-center">
        <p className="text-white/30 text-xs tracking-wider uppercase">
          Built by Vihaan Sharma, Jack Le, Dhan Narula &amp; Phin Truong
          &nbsp;&mdash;&nbsp; University of Toronto
        </p>
      </footer>
    </div>
  );
}
