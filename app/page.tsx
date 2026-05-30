import Link from 'next/link';
import { FeatureSteps } from '@/components/ui/feature-section';

export default function Landing() {
  return (
    <div className="lp">
      {/* ───── FLOATING NAV ───── */}
      <nav className="lp-nav">
        <span className="lp-nav-logo">TorontoView</span>
        <div className="lp-nav-links">
          <Link href="/map">Explore</Link>
          <Link href="/editor">Build</Link>
        </div>
      </nav>

      {/* ───── HERO ───── */}
      <section className="lp-hero-wrap">
        <div className="lp-hero">
          <img src="/thumb.jpg" alt="" className="lp-hero-img" draggable={false} />
          <div className="lp-hero-vignette" />

          <h1 className="lp-hero-title">Reimagine Toronto.</h1>

          <Link href="/map" className="lp-hero-cta">
            Get Started&ensp;&rarr;
          </Link>
        </div>
      </section>

      {/* ───── STATEMENT ───── */}
      <section className="lp-statement">
        <span className="lp-stmt-rule lp-fade" style={{ animationDelay: '0.1s' }} />

        <p className="lp-stmt-small lp-fade" style={{ animationDelay: '0.25s' }}>
          Urban planning, reimagined for Toronto.
        </p>

        <div className="lp-stmt-block lp-fade" style={{ animationDelay: '0.5s' }}>
          <h2 className="lp-stmt-line">Visualize development proposals in 3D.</h2>
          <h2 className="lp-stmt-line">Analyze impact before you build.</h2>
        </div>

        <p className="lp-stmt-sub lp-fade" style={{ animationDelay: '0.75s' }}>
          A planning tool built for Toronto&apos;s future.
        </p>

        <Link
          href="/map"
          className="lp-stmt-cta lp-fade"
          style={{ animationDelay: '0.95s' }}
        >
          Explore the Map&ensp;&rarr;
        </Link>
      </section>

      {/* ───── FEATURE STEPS ───── */}
      <section className="bg-[#f4efe6]" style={{ width: '100vw', marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)' }}>
        <FeatureSteps
          title="How TorontoView Works"
          subtitle="Planning Toronto's future with clarity and precision."
          features={[
            {
              step: 'Step 1',
              title: 'Design 3D Developments',
              content:
                'Turn concepts, sketches, and blueprints into intelligent 3D developments. Design spaces that power economic growth, strengthen communities, and define Toronto\u2019s next chapter.',
              image: '/carousel/city-of-toronto-ontario-canada.jpg',
            },
            {
              step: 'Step 2',
              title: 'Place on the Real Map',
              content:
                'Place projects directly into real city locations. Visualize how housing, business hubs, and public spaces connect neighborhoods and drive a thriving urban ecosystem.',
              image: '/carousel/PZeSqEBK-RS12147_Toronto-Glamour-Shots-Downtown-1-1024x683.jpg',
            },
            {
              step: 'Step 3',
              title: 'Analyze the Impact',
              content:
                "Simulate environmental, economic, and social impacts to ensure today's developments become tomorrow's lasting legacy.",
              image: '/carousel/toronto-waterfront-at-night.jpg',
            },
          ]}
          autoPlayInterval={4000}
          imageHeight="h-[500px]"
        />
      </section>

      {/* ───── VIDEO SHOWCASE ───── */}
      <section className="lp-videos">
        <h2 className="lp-videos-title">See It in Action</h2>
        <div className="lp-videos-grid">
          <div className="lp-video-card">
            <video
              src="/showcase/street-view.mp4"
              autoPlay
              loop
              muted
              playsInline
            />
            <p className="lp-video-label">Street View</p>
          </div>
          <div className="lp-video-card">
            <video
              src="/showcase/traffic-impact.mp4"
              autoPlay
              loop
              muted
              playsInline
            />
            <p className="lp-video-label">Traffic Impact</p>
          </div>
        </div>
      </section>

      {/* ───── FOOTER ───── */}
      <footer className="lp-footer">
        <a href="https://github.com/notjackl3/torontoview" target="_blank" rel="noopener noreferrer">
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}
