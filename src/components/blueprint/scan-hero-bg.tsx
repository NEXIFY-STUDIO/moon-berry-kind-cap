/**
 * Animated scan hero background — hex mesh + wireframe globe + energy beams.
 * Pure CSS/SVG, no external assets. Premium reverse-engineering aesthetic.
 */
export function ScanHeroBg() {
  return (
    <div className="scan-hero-bg" aria-hidden data-testid="scan-hero-bg">
      <div className="scan-hero-bg__vignette" />
      <div className="scan-hero-bg__hex" />
      <div className="scan-hero-bg__beams" />
      <div className="scan-hero-bg__glow scan-hero-bg__glow--gold" />
      <div className="scan-hero-bg__glow scan-hero-bg__glow--cyan" />
      <svg
        className="scan-hero-bg__globe"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="globeCore" cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#e8c48a" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#c8a16e" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#0a0a0b" stopOpacity="0.9" />
          </radialGradient>
          <linearGradient id="globeRim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff4cc" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#c8a16e" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="72" fill="url(#globeCore)" />
        <circle
          cx="100"
          cy="100"
          r="72"
          stroke="url(#globeRim)"
          strokeWidth="1.25"
          opacity="0.85"
        />
        {[-40, -20, 0, 20, 40].map((dy) => (
          <ellipse
            key={`lat-${dy}`}
            cx="100"
            cy={100 + dy * 0.85}
            rx={Math.sqrt(Math.max(4, 72 * 72 - (dy * 0.85) ** 2)) * 0.98}
            ry={14 - Math.abs(dy) * 0.12}
            stroke="#c8a16e"
            strokeOpacity="0.35"
            strokeWidth="0.7"
          />
        ))}
        {[-50, -25, 0, 25, 50].map((dx) => (
          <ellipse
            key={`lon-${dx}`}
            cx={100 + dx * 0.15}
            cy="100"
            rx={18 + Math.abs(dx) * 0.08}
            ry="71"
            stroke="#c8a16e"
            strokeOpacity="0.28"
            strokeWidth="0.7"
            transform={`rotate(${dx * 0.35} 100 100)`}
          />
        ))}
        {[
          [72, 78],
          [88, 70],
          [95, 92],
          [110, 85],
          [125, 95],
          [78, 110],
          [100, 118],
          [130, 108],
          [145, 88],
          [60, 100],
        ].map(([x, y], i) => (
          <circle
            key={`d-${i}`}
            cx={x}
            cy={y}
            r={i % 3 === 0 ? 1.6 : 1.1}
            fill="#e8c48a"
            opacity={0.55 + (i % 4) * 0.08}
          />
        ))}
        <circle
          className="scan-hero-bg__globe-pulse"
          cx="100"
          cy="100"
          r="78"
          stroke="#c8a16e"
          strokeOpacity="0.25"
          strokeWidth="0.8"
        />
      </svg>
      <div className="scan-hero-bg__nodes">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="scan-hero-bg__node"
            // CSS custom property for staggered node placement
            style={{ "--i": String(i) } as Record<string, string>}
          />
        ))}
      </div>
    </div>
  );
}
