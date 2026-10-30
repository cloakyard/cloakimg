import { useEffect, useRef } from "react";
import { mountAirArtwork } from "../../docs/air/artwork.mjs";
import landscape from "./landscape.svg?raw";

/** A local illustration finding its frame; never reads or moves the user's image. */
export function Landscape() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const life = mountAirArtwork(node, {
      settle() {}, // SVG markup is the finished composition, including static fallback visits.
      run(animate) {
        const style = getComputedStyle(node);
        const spatial = style.getPropertyValue("--air-ease-in-out").trim();
        const arrival = style.getPropertyValue("--air-ease-out").trim();
        const parts = [
          ["far", "translate(-24px, 20px)", 2100, 0, spatial],
          ["near", "translate(28px, 24px)", 2100, 60, spatial],
          ["foreground", "translateY(20px)", 2100, 120, spatial],
          ["sun", "translateY(92px) rotate(-18deg)", 2000, 360, arrival],
          ["clouds", "translateX(-12px)", 2200, 120, spatial],
          ["rays", "rotate(-24deg) scale(.92)", 900, 1400, arrival],
          ["frame", "translateY(4px) scale(1.08)", 1800, 1400, spatial],
        ] as const;
        return animate(
          parts.map(([name, from, duration, delay, easing]) => ({
            element: node.querySelector<SVGElement>(`[data-landscape="${name}"]`)!,
            keyframes: [
              { transform: from },
              { transform: "translate(0, 0) scale(1) rotate(0deg)" },
            ],
            options: { duration, delay, easing },
          })),
        );
      },
    });
    return () => life.destroy();
  }, []);

  return (
    <div ref={root} className="air-artwork img-landscape">
      <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: landscape }} />
      <button
        type="button"
        className="air-artwork-replay"
        aria-label="Replay CloakIMG animation"
        aria-disabled="true"
        tabIndex={-1}
        hidden
      />
    </div>
  );
}
