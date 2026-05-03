// icons.tsx — Lucide-style stroke icons used across CloakIMG.
// Single source so the canvas + cards + chrome all match stroke weight.

import type { CSSProperties, ReactNode, SVGProps } from "react";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "stroke"> {
  d?: string;
  size?: number;
  stroke?: number;
  fill?: string;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Icon({
  d,
  size = 20,
  stroke = 2,
  fill = "none",
  children,
  style,
  ...rest
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      {...rest}
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

export function BrandMark({ size = 28, style }: { size?: number; style?: CSSProperties }) {
  const shield =
    "M72,30L38,44L38,76C38,93.333 49.333,107.333 72,118C94.667,107.333 106,93.333 106,76L106,44L72,30Z";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 144 144"
      fill="none"
      role="img"
      aria-label="CloakIMG"
      style={style}
    >
      <title>CloakIMG</title>
      <defs>
        <linearGradient id="bm-bg" gradientUnits="userSpaceOnUse" x1="8" y1="8" x2="8" y2="136">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="1" stopColor="#c2410c" />
        </linearGradient>
        <radialGradient id="bm-glow" gradientUnits="userSpaceOnUse" cx="72" cy="52.8" r="89.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id="bm-clip">
          <path d={shield} />
        </clipPath>
      </defs>
      <circle cx="72" cy="72" r="64" fill="url(#bm-bg)" />
      <circle cx="72" cy="72" r="64" fill="url(#bm-glow)" />
      <path d={shield} fill="#fff" fillOpacity="0.18" />
      <path d={shield} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="3" />
      <g clipPath="url(#bm-clip)">
        <circle cx="81" cy="53" r="5" fill="#fff" />
        <path
          d="M46,92L60,70L72,84L86,64L100,92"
          transform="matrix(0.962963 0 0 0.928571 1.703704 4.571429)"
          fill="none"
          stroke="#fff"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

type P = Omit<IconProps, "d" | "children">;

export const I = {
  Crop: (p: P) => <Icon {...p} d="M6 2v14a2 2 0 0 0 2 2h14M6 6h14a2 2 0 0 1 2 2v14" />,
  Rotate: (p: P) => (
    <Icon {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  ),
  Sliders: (p: P) => (
    <Icon {...p}>
      <line x1="4" x2="4" y1="21" y2="14" />
      <line x1="4" x2="4" y1="10" y2="3" />
      <line x1="12" x2="12" y1="21" y2="12" />
      <line x1="12" x2="12" y1="8" y2="3" />
      <line x1="20" x2="20" y1="21" y2="16" />
      <line x1="20" x2="20" y1="12" y2="3" />
      <line x1="2" x2="6" y1="14" y2="14" />
      <line x1="10" x2="14" y1="8" y2="8" />
      <line x1="18" x2="22" y1="16" y2="16" />
    </Icon>
  ),
  Brush: (p: P) => (
    <Icon
      {...p}
      d="M9.06 11.9 4 17a2.83 2.83 0 1 0 4 4l5.1-5.06M14 7l3 3M19.5 9.5 21 8a2.12 2.12 0 0 0-3-3l-1.5 1.5L9 14l1 1Z"
    />
  ),
  Wand: (p: P) => (
    <Icon
      {...p}
      d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h0M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5"
    />
  ),
  EyeOff: (p: P) => (
    <Icon
      {...p}
      d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20"
    />
  ),
  Eye: (p: P) => (
    <Icon {...p}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  ),
  Layers: (p: P) => (
    <Icon {...p}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </Icon>
  ),
  FileImage: (p: P) => (
    <Icon {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <circle cx="10" cy="13" r="2" />
      <path d="m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22" />
    </Icon>
  ),
  Refresh: (p: P) => (
    <Icon {...p}>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </Icon>
  ),
  Resize: (p: P) => (
    <Icon {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 9 L15 15" />
      <path d="M15 9 V15 H9" />
    </Icon>
  ),
  Eraser: (p: P) => (
    <Icon
      {...p}
      d="M21 21H8M5.7 14.3l7.5-7.5a2 2 0 0 1 2.8 0l4.7 4.7a2 2 0 0 1 0 2.8L13 22 3 12l2.7-2.7"
    />
  ),
  Stamp: (p: P) => (
    <Icon
      {...p}
      d="M5 22h14M19 14H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2ZM10 9V5a2 2 0 0 1 4 0v4M9 14V9h6v5"
    />
  ),
  Tag: (p: P) => (
    <Icon {...p}>
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1" />
    </Icon>
  ),
  Pipette: (p: P) => <Icon {...p} d="M2 22l4-1 9-9-3-3-9 9-1 4ZM13 9l4 4M16 6l5 5-3 3-5-5 3-3Z" />,
  ArrowRight: (p: P) => <Icon {...p} d="M5 12h14M13 6l6 6-6 6" />,
  Download: (p: P) => (
    <Icon {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </Icon>
  ),
  Upload: (p: P) => (
    <Icon {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </Icon>
  ),
  Plus: (p: P) => <Icon {...p} d="M12 5v14M5 12h14" />,
  X: (p: P) => <Icon {...p} d="M18 6 6 18M6 6l12 12" />,
  Check: (p: P) => <Icon {...p} d="M20 6 9 17l-5-5" />,
  Info: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-5M12 8h.01" />
    </Icon>
  ),
  Copy: (p: P) => (
    <Icon {...p}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  ),
  MoreVertical: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="5" r="1.25" />
      <circle cx="12" cy="12" r="1.25" />
      <circle cx="12" cy="19" r="1.25" />
    </Icon>
  ),
  AlertTriangle: (p: P) => (
    <Icon {...p}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" x2="12" y1="9" y2="13" />
      <line x1="12" x2="12.01" y1="17" y2="17" />
    </Icon>
  ),
  ZoomIn: (p: P) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" x2="16.65" y1="21" y2="16.65" />
      <line x1="11" x2="11" y1="8" y2="14" />
      <line x1="8" x2="14" y1="11" y2="11" />
    </Icon>
  ),
  ZoomOut: (p: P) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" x2="16.65" y1="21" y2="16.65" />
      <line x1="8" x2="14" y1="11" y2="11" />
    </Icon>
  ),
  Undo: (p: P) => <Icon {...p} d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5h-4" />,
  Redo: (p: P) => <Icon {...p} d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0-5 5v0a5 5 0 0 0 5 5h4" />,
  Lock: (p: P) => (
    <Icon {...p}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Icon>
  ),
  Folder: (p: P) => (
    <Icon {...p} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  ),
  Play: (p: P) => (
    <Icon {...p}>
      <polygon points="6 4 20 12 6 20 6 4" />
    </Icon>
  ),
  Type: (p: P) => (
    <Icon {...p}>
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" x2="15" y1="20" y2="20" />
      <line x1="12" x2="12" y1="4" y2="20" />
    </Icon>
  ),
  Move: (p: P) => (
    <Icon {...p} d="M5 9 2 12l3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
  ),
  Pen: (p: P) => (
    <Icon
      {...p}
      d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
    />
  ),
  Square: (p: P) => (
    <Icon {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </Icon>
  ),
  RoundedSquare: (p: P) => (
    <Icon {...p}>
      <rect x="3" y="3" width="18" height="18" rx="6" />
    </Icon>
  ),
  Circle: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
    </Icon>
  ),
  Slash: (p: P) => <Icon {...p} d="M5 19 19 5" />,
  ArrowGlyph: (p: P) => <Icon {...p} d="M5 19 19 5M19 5h-7M19 5v7" />,
  Triangle: (p: P) => <Icon {...p} d="M12 3 21 20H3Z" />,
  Hexagon: (p: P) => <Icon {...p} d="M12 2 21 7v10l-9 5-9-5V7Z" />,
  Star: (p: P) => (
    <Icon
      {...p}
      d="M12 2.5 14.85 8.6 21.5 9.55 16.7 14.25 17.85 20.85 12 17.75 6.15 20.85 7.3 14.25 2.5 9.55 9.15 8.6Z"
    />
  ),
  Heart: (p: P) => (
    <Icon
      {...p}
      d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"
    />
  ),
  SpeechBubble: (p: P) => (
    <Icon
      {...p}
      d="M21 11.5a8.38 8.38 0 0 1-9 8.5 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.5 8.5 0 0 1 12 3a8.38 8.38 0 0 1 9 8.5Z"
    />
  ),
  Cloud: (p: P) => (
    <Icon {...p} d="M17.5 19a4.5 4.5 0 1 0-1.36-8.81 6 6 0 0 0-11.6 2.31A4 4 0 0 0 5.5 19h12Z" />
  ),
  Frame: (p: P) => (
    <Icon {...p}>
      <rect x="3" y="3" width="18" height="18" rx="1.5" />
      <rect x="7" y="7" width="10" height="10" rx="0.5" />
    </Icon>
  ),
  Diamond: (p: P) => <Icon {...p} d="M12 2 22 12 12 22 2 12Z" />,
  Cross: (p: P) => <Icon {...p} d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z" />,
  RightTriangle: (p: P) => <Icon {...p} d="M4 4v16h16Z" />,
  Parallelogram: (p: P) => <Icon {...p} d="M7 5h14l-4 14H3Z" />,
  Lightning: (p: P) => <Icon {...p} d="M13 2 4 14h6l-2 8 9-12h-6l2-8Z" />,
  Teardrop: (p: P) => <Icon {...p} d="M12 2c4 5 7 9 7 13a7 7 0 0 1-14 0c0-4 3-8 7-13Z" />,
  Octagon: (p: P) => <Icon {...p} d="M8 3h8l5 5v8l-5 5H8l-5-5V8Z" />,
  Pentagon: (p: P) => <Icon {...p} d="M12 2 22 9.5 18 21H6L2 9.5Z" />,
  Trapezoid: (p: P) => <Icon {...p} d="M3 20h18l-4-14H7Z" />,
  Pie: (p: P) => (
    <Icon {...p}>
      <path d="M12 2v10l8 5A10 10 0 1 1 12 2Z" />
    </Icon>
  ),
  Sunburst: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93 7 7M17 17l2.07 2.07M4.93 19.07 7 17M17 7l2.07-2.07" />
    </Icon>
  ),
  Bookmark: (p: P) => <Icon {...p} d="M6 3h12v18l-6-4-6 4Z" />,
  Ribbon: (p: P) => <Icon {...p} d="M4 4h16l-3 8 3 8H4l3-8Z" />,
  Donut: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  ),
  Crescent: (p: P) => <Icon {...p} d="M20 12a8 8 0 1 1-12-7 6 6 0 0 0 9 8 8 8 0 0 1 3-1Z" />,
  ChevronDown: (p: P) => <Icon {...p} d="m6 9 6 6 6-6" />,
  ChevronUp: (p: P) => <Icon {...p} d="m18 15-6-6-6 6" />,
  Shield: (p: P) => <Icon {...p} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  ShieldCheck: (p: P) => (
    <Icon {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  ),
  ArrowUpRight: (p: P) => <Icon {...p} d="M7 17 17 7M8 7h9v9" />,
  Scale: (p: P) => (
    <Icon {...p}>
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </Icon>
  ),
  Github: (p: P) => (
    <svg
      width={p.size ?? 20}
      height={p.size ?? 20}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={p.style}
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  ),
  GitCompare: (p: P) => (
    <Icon {...p}>
      <circle cx="5" cy="6" r="3" />
      <circle cx="19" cy="18" r="3" />
      <path d="M8 6h7a4 4 0 0 1 4 4v5" />
      <path d="M16 18H9a4 4 0 0 1-4-4V9" />
    </Icon>
  ),
  UserCheck: (p: P) => (
    <Icon {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="16 11 18 13 22 9" />
    </Icon>
  ),
  WifiOff: (p: P) => (
    <Icon {...p}>
      <path d="M12 20h.01" />
      <path d="M8.5 16.43a5 5 0 0 1 7 0" />
      <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
      <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
      <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
      <path d="M5 13a10 10 0 0 1 5.24-2.76" />
      <path d="m2 2 20 20" />
    </Icon>
  ),
  Rocket: (p: P) => (
    <Icon {...p}>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </Icon>
  ),
  Sparkles: (p: P) => (
    <Icon {...p}>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </Icon>
  ),
  Laptop: (p: P) => (
    <Icon
      {...p}
      d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"
    />
  ),
  GitFork: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" />
      <path d="M12 12v3" />
    </Icon>
  ),
  Smartphone: (p: P) => (
    <Icon {...p}>
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </Icon>
  ),
  Camera: (p: P) => (
    <Icon {...p}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </Icon>
  ),
  Aperture: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m14.31 8 5.74 9.94" />
      <path d="M9.69 8h11.48" />
      <path d="m7.38 12 5.74-9.94" />
      <path d="M9.69 16 3.95 6.06" />
      <path d="M14.31 16H2.83" />
      <path d="m16.62 12-5.74 9.94" />
    </Icon>
  ),
  Calendar: (p: P) => (
    <Icon {...p}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </Icon>
  ),
  MapPin: (p: P) => (
    <Icon {...p}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </Icon>
  ),
  HardDrive: (p: P) => (
    <Icon {...p}>
      <line x1="22" x2="2" y1="12" y2="12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      <line x1="6" x2="6.01" y1="16" y2="16" />
      <line x1="10" x2="10.01" y1="16" y2="16" />
    </Icon>
  ),
  Maximize: (p: P) => (
    <Icon {...p}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </Icon>
  ),
  Ratio: (p: P) => (
    <Icon {...p}>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <path d="M7 9v6" />
      <path d="M17 9v6" />
    </Icon>
  ),
};
