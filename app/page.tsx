import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Landmark,
  Network,
  TrendingUp,
} from "lucide-react";

const metrics = [
  { label: "Council lenses", value: "4", detail: "legal, grants, infrastructure, market" },
  { label: "Official data chunks", value: "217k", detail: "Toronto and Ontario source corpus" },
  { label: "Local model path", value: "DGX", detail: "Qwen/Gemma-ready private inference" },
  { label: "Business plans", value: "Live", detail: "attach plans to real buildings" },
];

const councilAgents = [
  {
    icon: Landmark,
    title: "Building legality",
    copy: "Toronto zoning, permit, code, accessibility, and safety checks before a proposal advances.",
  },
  {
    icon: BriefcaseBusiness,
    title: "Capital support",
    copy: "Ontario grants, bursaries, non-dilutive supports, and intake readiness for business growth.",
  },
  {
    icon: Network,
    title: "Civil capacity",
    copy: "Traffic, transit, road access, public realm, drainage, and construction staging impact signals.",
  },
  {
    icon: TrendingUp,
    title: "Market viability",
    copy: "Nearby businesses, staffing, pricing, parking, accessibility, and customer access fit.",
  },
];

const operatingSignals = [
  "Local spend capacity",
  "Market access score",
  "Delay cost proxy",
  "Retail reach",
  "Logistics fit",
  "Safety confidence",
];

export default function Landing() {
  return (
    <main className="lp lp-econ">
      <nav className="lp-econ-nav" aria-label="Primary navigation">
        <Link href="/" className="lp-econ-brand">
          TorontoView
        </Link>
        <div className="lp-econ-navlinks">
          <Link href="/map">Map</Link>
          <Link href="/showcase">Showcase</Link>
          <Link href="/editor">Editor</Link>
        </div>
      </nav>

      <section className="lp-econ-hero">
        <img
          src="/thumb.jpg"
          alt="Toronto skyline and waterfront"
          className="lp-econ-hero-img"
          draggable={false}
        />
        <div className="lp-econ-hero-shade" />
        <div className="lp-econ-hero-grid" />

        <div className="lp-econ-hero-content">
          <div className="lp-econ-kicker">
            <span>Toronto economic development intelligence</span>
          </div>
          <h1>Model the city case before money moves.</h1>
          <p>
            TorontoView turns parcels, buildings, business plans, mobility, and
            official policy evidence into a working economic review board for
            safer approvals and stronger local growth.
          </p>

          <div className="lp-econ-actions">
            <Link href="/start" className="lp-econ-primary">
              Open a business in Toronto
              <ArrowRight size={17} />
            </Link>
            <Link href="/plan/business-1" className="lp-econ-secondary">
              Draft a business case
            </Link>
          </div>
        </div>

        <aside className="lp-econ-command" aria-label="Economic command center preview">
          <div className="lp-econ-command-head">
            <div>
              <span>Command center</span>
              <strong>Market Access Board</strong>
            </div>
            <BarChart3 size={22} />
          </div>
          <div className="lp-econ-score">
            <span>Viability index</span>
            <strong>84</strong>
            <em>/100</em>
          </div>
          <div className="lp-econ-bars">
            {operatingSignals.map((signal, index) => (
              <div key={signal} className="lp-econ-bar-row">
                <span>{signal}</span>
                <div>
                  <i style={{ width: `${72 + index * 4 > 96 ? 96 : 72 + index * 4}%` }} />
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="lp-econ-metrics" aria-label="Platform metrics">
        {metrics.map((metric) => (
          <div key={metric.label} className="lp-econ-metric">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </div>
        ))}
      </section>

      <section className="lp-econ-section">
        <div className="lp-econ-section-head">
          <span>What the board reviews</span>
          <h2>A council that understands growth and constraint.</h2>
          <p>
            Every proposal is read through separate expert lenses, so the same
            site can be judged for compliance, funding readiness, infrastructure
            load, and commercial viability.
          </p>
        </div>

        <div className="lp-econ-agent-grid">
          {councilAgents.map((agent) => (
            <article key={agent.title} className="lp-econ-agent">
              <agent.icon size={22} />
              <h3>{agent.title}</h3>
              <p>{agent.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-econ-board">
        <div>
          <span>From map to investment memo</span>
          <h2>Attach business plans to actual Toronto buildings.</h2>
          <p>
            Select a site, add a business plan, model staff and pricing, then
            inspect access, parking, traffic, public realm, and nearby economic
            context before presenting the opportunity.
          </p>
          <Link href="/start" className="lp-econ-inline">
            Start the guided flow
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="lp-econ-ledger">
          <div className="lp-econ-ledger-row">
            <span>Daily revenue proxy</span>
            <strong>$8.4k</strong>
          </div>
          <div className="lp-econ-ledger-row">
            <span>Staffing readiness</span>
            <strong>7 roles</strong>
          </div>
          <div className="lp-econ-ledger-row">
            <span>Parking + access</span>
            <strong>Review</strong>
          </div>
          <div className="lp-econ-ledger-row">
            <span>Public funding fit</span>
            <strong>3 paths</strong>
          </div>
        </div>
      </section>

      <footer className="lp-econ-footer">
        <div>
          <strong>TorontoView</strong>
          <span>Economic planning for real urban decisions.</span>
        </div>
        <Link href="/map">Launch map</Link>
      </footer>
    </main>
  );
}
