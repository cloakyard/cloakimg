import { useEffect, useRef } from "react";
import { mountAirArtwork } from "../../docs/air/artwork.mjs";
/** The earlier photographic concept: the image stays still as its frame finds focus. */
export function PhotoFrame() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const frame = node.querySelector<HTMLElement>(".img-photo-frame__crop")!;
    const life = mountAirArtwork(node, {
      settle() {},
      async run(animate) {
        const easing = getComputedStyle(node).getPropertyValue("--air-ease-in-out").trim();
        await animate([
          {
            element: frame,
            keyframes: [
              { transform: "translate(-8%, 5%) scale(1.08)" },
              { transform: "translate(0, 0) scale(1)" },
            ],
            options: { duration: 2400, easing },
          },
        ]);
      },
    });
    return () => life.destroy();
  }, []);
  return (
    <div ref={root} className="air-artwork img-photo-frame">
      <div className="img-photo-frame__photo" aria-hidden="true">
        <img
          src={`${import.meta.env.BASE_URL}artwork/orange.webp`}
          width="900"
          height="600"
          alt=""
          fetchPriority="high"
        />
        <div className="img-photo-frame__crop">
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
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
