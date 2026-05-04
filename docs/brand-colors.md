# CloakIMG — Brand Colors

The primary accent for CloakIMG is **Sunset Coral** — a warm coral
that sits on top of the Cloak family's shared slate spine.

## Primary

| Role          | Token         | Hex       |
| ------------- | ------------- | --------- |
| Primary       | `--coral-500` | `#f5613a` |
| Primary hover | `--coral-600` | `#e54a22` |
| Primary tint  | `--coral-50`  | `#fff5f1` |

`--coral-500` (Tailwind: `coral-500`) is the canonical primary. It
drives `.btn-primary`, the page eyebrow, the form `accent-color`, the
text selection highlight, the focus ring (`rgba(245, 97, 58, 0.22)`),
and the logo gradient's midpoint.

## Logo gradient

The launcher logo at [public/icons/logo.svg](../public/icons/logo.svg)
runs `--coral-400` → `--coral-700`, with `--coral-500` (the primary)
as the visual midpoint:

| Stop      | Token         | Hex       | RGB                 |
| --------- | ------------- | --------- | ------------------- |
| `bg-from` | `--coral-400` | `#ff7d54` | `rgb(255, 125, 84)` |
| midpoint  | `--coral-500` | `#f5613a` | `rgb(245, 97, 58)`  |
| `bg-to`   | `--coral-700` | `#b8371a` | `rgb(184, 55, 26)`  |

The same gradient is mirrored in
[public/icons/favicon.svg](../public/icons/favicon.svg) and the
CloakIMG mark inside
[public/icons/og-image.svg](../public/icons/og-image.svg). The
generated PNGs (`pwa-*.png`, `apple-touch-icon.png`,
`maskable-icon-512x512.png`, `og-image.png`) need to be regenerated
from the SVG sources after any future brand-color change — see
`docs/logo-spec.md` §7.

## Full ramp

Defined in [src/tokens.css](../src/tokens.css):

| Step | Hex                 |
| ---- | ------------------- |
| 50   | `#fff5f1`           |
| 100  | `#ffe4d8`           |
| 200  | `#ffc8b0`           |
| 300  | `#ffa483`           |
| 400  | `#ff7d54`           |
| 500  | `#f5613a` ← primary |
| 600  | `#e54a22`           |
| 700  | `#b8371a`           |
| 800  | `#8a2914`           |
| 900  | `#5c1c0e`           |

## Usage

- **Tailwind utilities**: `bg-coral-500`, `text-coral-600`,
  `border-coral-200`, etc. — exposed via the `@theme` block in
  `src/tokens.css`.
- **Raw CSS**: `var(--coral-500)` (legacy bridge in `:root`, kept
  during the FX-3 Tailwind migration).
- **Sunset palette**: the landing-page Grainient uses the wider
  `--sunset-*` set (coral, amber, peach, rose, gold). The coral stop
  there is the same `#f5613a`.
