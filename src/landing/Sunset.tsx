// Sunset.tsx — Animated warm-toned backdrop. Three layers (radial sun,
// horizon glow, drifting peach blobs) on a coral/amber/peach palette
// matching the editor's primary accent. Motion respects
// `prefers-reduced-motion`.
//
// Two modes:
//   • Default — full landing-page hero presence.
//   • `subtle` — toned down for the editor: lower overall opacity,
//     slower motion, no noise grain. Lets a hint of sunset bleed
//     through translucent chrome panels without distracting from the
//     working surface.
//
// iOS Safari URL-bar constraint: on phones the .sunset-stage layer is
// alpha-masked to transparent across the URL-bar's sample zone (see
// the @media (max-width: 640px) block in tokens.css). If you add
// blobs/elements that need to paint into the bottom ~200px of the
// viewport on mobile, they'll be masked out — that's intentional, not
// a bug. Without the mask, sunset hues sampled by the URL bar's
// backdrop-blur read as a "tinted stripe" above the bar.

interface Props {
  subtle?: boolean;
}

const BLOBS = [
  { c: "#f5613a", top: "8%", left: "-8%", d: 0, s: 1 },
  { c: "#ffb37a", top: "30%", left: "55%", d: -14, s: 1.15 },
  { c: "#ff9a8b", top: "60%", left: "20%", d: -28, s: 0.95 },
] as const;

export function Sunset({ subtle = false }: Props = {}) {
  return (
    <div className={subtle ? "sunset-stage sunset-subtle" : "sunset-stage"} aria-hidden="true">
      <div className="sunset-horizon" />
      <div className="sunset-sun" />
      {BLOBS.map((b) => (
        <div
          key={b.c}
          className="sunset-blob"
          style={{
            background: b.c,
            top: b.top,
            left: b.left,
            animationDelay: `${b.d}s`,
            transform: `scale(${b.s})`,
          }}
        />
      ))}
    </div>
  );
}
