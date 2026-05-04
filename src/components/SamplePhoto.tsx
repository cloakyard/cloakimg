// SamplePhoto.tsx — Coral-tinted "photo" placeholder used as a stand-in
// for the user's actual image while the editor is being implemented.

import type { CSSProperties, ReactNode } from "react";

export type PhotoVariant = "sunset" | "forest" | "night" | "studio" | "portrait";

const variants: Record<PhotoVariant, string> = {
  sunset: "linear-gradient(180deg, #ffd29a 0%, #ff8a5c 45%, #d94a3a 80%, #6b2638 100%)",
  forest: "linear-gradient(180deg, #d4e4c0 0%, #6fa86a 50%, #2a4f3e 100%)",
  night: "linear-gradient(180deg, #1a1f3a 0%, #4a3a6f 60%, #d97c5c 95%)",
  studio: "linear-gradient(135deg, #f5e6d3 0%, #e8c8a8 100%)",
  portrait: "linear-gradient(165deg, #f4d7c0 0%, #e8a988 50%, #b06a5a 100%)",
};

interface Props {
  aspect?: string;
  variant?: PhotoVariant;
  style?: CSSProperties;
  children?: ReactNode;
}

export function SamplePhoto({ aspect = "4/3", variant = "sunset", style, children }: Props) {
  return (
    <div
      style={{
        aspectRatio: aspect,
        background: variants[variant],
        borderRadius: "var(--r-md)",
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      {variant === "sunset" && (
        <>
          {/* Sun — placed first so the mountains overlap it as it
              dips below the far ridge. */}
          <div
            style={{
              position: "absolute",
              top: "32%",
              left: "62%",
              width: "9%",
              aspectRatio: "1",
              borderRadius: "50%",
              background: "radial-gradient(circle, #fff5d8 0%, #ffd29a 55%, transparent 100%)",
              filter: "blur(0.5px)",
              boxShadow: "0 0 60px 20px rgba(255, 210, 154, 0.45)",
            }}
          />
          {/* Horizon haze — warm atmospheric scatter piling up where
              sky meets ridges, softens the silhouette transition. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, transparent 35%, rgba(255, 180, 130, 0.18) 62%, rgba(217, 124, 92, 0.32) 84%, rgba(140, 60, 50, 0.20) 100%)",
              pointerEvents: "none",
            }}
          />
          {/* Mountains rendered as SVG paths with smooth bezier
              curves rather than clip-path polygons — the curves give
              ridgelines a painterly, eroded-rock feel instead of the
              rigid sawtooth that straight segments produce. */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="presentation"
            aria-hidden="true"
            focusable="false"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          >
            <defs>
              <linearGradient id="sp-sunset-far" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8c3c32" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#6b2a26" />
              </linearGradient>
              <linearGradient id="sp-sunset-mid" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5a1f1c" />
                <stop offset="100%" stopColor="#3a1310" />
              </linearGradient>
              <linearGradient id="sp-sunset-fore" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2a0e0c" />
                <stop offset="100%" stopColor="#100403" />
              </linearGradient>
            </defs>
            {/* Far ridge — hero peak (~x=38, y=27) with an asymmetric
                profile: steeper left flank, gentler right slope that
                breaks at a shoulder near (50, 50) before settling into
                lower subordinate peaks. */}
            <path
              d="M0,86 C5,84 10,80 15,81 C20,82 23,78 27,68 C30,56 33,40 37,29 C39,26 41,28 43,33 C46,40 48,46 51,50 C54,53 57,55 61,58 C65,60 69,57 73,58 C77,59 81,62 85,64 C89,66 93,67 96,70 C98,72 99,74 100,76 L100,100 L0,100 Z"
              fill="url(#sp-sunset-far)"
              opacity="0.82"
            />
            {/* Mid ridge — three distinct peaks at varied heights with
                sharper rises so the layer reads as a range, not soft
                rolling waves. Tallest sits at (~39, 56), shorter
                companions flank it. */}
            <path
              d="M0,82 C4,78 9,74 14,73 C19,72 22,80 26,76 C30,71 34,62 39,56 C43,55 46,68 50,74 C54,79 58,72 62,64 C66,59 70,66 74,71 C78,75 82,80 86,73 C90,66 94,72 97,75 C99,76 100,76 100,77 L100,100 L0,100 Z"
              fill="url(#sp-sunset-mid)"
              opacity="0.92"
            />
            {/* Foreground ridge — rolling silhouette, fades to near
                black for grounded depth. */}
            <path
              d="M0,92 C4,86 9,82 14,84 C20,86 24,76 30,80 C36,84 42,76 50,78 C58,80 62,86 68,84 C74,82 78,76 84,80 C90,84 94,80 100,84 L100,100 L0,100 Z"
              fill="url(#sp-sunset-fore)"
            />
          </svg>
        </>
      )}
      {variant === "portrait" && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "55%",
            aspectRatio: "1/1.2",
            background:
              "radial-gradient(ellipse at 50% 30%, rgba(60,30,20,0.4) 0%, rgba(60,30,20,0.6) 50%, transparent 70%)",
            borderRadius: "50% 50% 20% 20%",
          }}
        />
      )}
      {children}
    </div>
  );
}
