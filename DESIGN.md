---
name: CloakIMG — Cloakyard Photo Workbench
description: >-
  A technical-editorial design system for a privacy-first browser photo editor.
  It shares Archivo, JetBrains Mono, declarative headlines, flat paper,
  hairline rules, real workbench instruments, and dark privacy receipts with
  CloakPDF while retaining CloakIMG's Signal Coral accent and photographic
  canvas language.
mode: light-and-dark
genre: modern-minimal
design-system: app-wide
primary: "Signal Coral"
paper: "oklch(0.978 0.008 55)"
ink: "oklch(0.22 0.026 45)"
fonts:
  display: Archivo
  body: Archivo
  mono: JetBrains Mono
macrostructures:
  marketing: Workbench
  editor: Persistent canvas workbench
  content: Long document
navigation: N7 workbench status header
footer: Ft5 statement band
---

# CloakIMG design system

## Family signature

CloakIMG and CloakPDF are siblings, not reskins. They share:

- Archivo for forceful, tightly set headlines and durable UI copy.
- JetBrains Mono for status, provenance, dimensions, tool groups, and model metadata.
- Flat paper surfaces, dark engineering chapters, and slate-like hairline rules.
- Real product instruments as visual proof; never fake browser or OS chrome.
- Compact 6–8px radii, one-pixel active motion, and no resting card shadows.
- A full 40px circular Cloakyard-family mark and a tightly set wordmark.

CloakIMG stays distinct through Signal Coral, checkerboard transparency, image
dimensions, photo previews, colour controls, and a persistent raster canvas.

## Product truth

The central line is: **“A complete photo workbench. Your pixels stay put.”**

Image content remains in the browser. The app can download static code,
MediaPipe/transformers.js runtimes, and on-device model weights when a capability
is first used. Copy must not imply that a cold-cache AI flow is network-free.

The proof path is:

1. Image bytes enter browser memory through a local file handle.
2. Canvas, Fabric, WASM, and optional on-device models process the image in the tab.
3. The browser writes a local JPEG, PNG, or WebP result for download.

## Colour

`tokens.css` is the source of truth.

- Signal Coral is the only product accent. It owns CTAs, active tools, links,
  focus rings, progress, and proof markers.
- Paper is a warm photographic near-white. Dark mode uses warm charcoal rather
  than pure black.
- Red, amber, and green are reserved for semantic states.
- Marketing backgrounds are flat. Grainient, aurora glows, cursor spotlights,
  and decorative radial gradients are outside the system.

## Typography

- Display and body: Archivo.
- Operational metadata: JetBrains Mono, 10–11px, uppercase, tracked.
- Hero: `clamp(2.75rem, 5.5vw, 5.6rem)`, weight 760, line-height 0.91.
- Section display: `clamp(2.15rem, 4.7vw, 4.9rem)`, weight 720.
- Body: Archivo 400–600, line-height 1.5–1.6.
- Mono is never used for paragraphs or oversized display copy.

## Macrostructure

### Marketing — Workbench

Solid header → split declaration → real image-input instrument → fact strip →
capability ledgers → dark local-processing receipt → statement footer.

### Editor — Persistent canvas workbench

Preserve the full-screen composition, 64px top bar, 72px rail, properties
widths, stage persistence, and mobile canvas/sheet behavior. Chrome uses flat
paper, hairline borders, compact radii, coral active cues, and mono metadata.

### Content — Long document

Privacy and explanatory copy use a narrow reading measure, strong title,
mono section markers, hairline divisions, and the dark statement close.

## Components

- Cards: 1px border, 6–8px radius, no resting shadow.
- Drop zone: a bordered local-input instrument with an operational header.
- Buttons: 6px radius, mono label, coral primary, neutral secondary.
- Inputs: stable height, 1px rule, visible focus, no error layout shift.
- Modals: solid paper, 8px desktop corners, named scrim/elevation, no glass.
- Tool rail: icon plus a single coral edge marker for the active tool.
- Status: semantic colour only; progress remains functional motion.

## Responsive and accessibility

- Maximum page frame: 88rem; 16px phone gutter and 24px gutter from 640px.
- Split layouts stack below 860px.
- Four-column facts become 2×2 below 640px.
- Verify 320, 375, 414, and 768px with no horizontal scrolling.
- Interactive controls keep visible focus and at least 44px touch targets where practical.
- `html` and `body` use `overflow-x: clip`, never `hidden`.
- Reduced motion collapses spatial transitions to an opacity change at 150ms or less.

## Invariants

1. Signal Coral owns interaction.
2. Hairline rules; no resting card shadows.
3. Real photo-workbench proof; no fake chrome.
4. Archivo + JetBrains Mono on every surface.
5. Functional labels and editor state-machine behavior stay stable.
6. Live-preview hooks keep canvas-pool release side effects outside React state updaters.

## Exports

The canonical CSS export lives in `tokens.css`. Tailwind maps the same values in
`src/tokens.css`; no component may improvise a new brand colour or font family.

### DTCG core

```json
{
  "color": {
    "paper": { "$value": "oklch(0.978 0.008 55)", "$type": "color" },
    "ink": { "$value": "oklch(0.22 0.026 45)", "$type": "color" },
    "accent": { "$value": "oklch(0.57 0.18 35)", "$type": "color" },
    "rule": { "$value": "oklch(0.858 0.022 55)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Archivo", "$type": "fontFamily" },
    "body": { "$value": "Archivo", "$type": "fontFamily" },
    "mono": { "$value": "JetBrains Mono", "$type": "fontFamily" }
  }
}
```

### shadcn/ui core

```css
:root {
  --background: 97.8% 0.008 55;
  --foreground: 22% 0.026 45;
  --card: 99.4% 0.006 55;
  --card-foreground: 22% 0.026 45;
  --primary: 57% 0.18 35;
  --primary-foreground: 99% 0.006 55;
  --muted: 94.9% 0.014 55;
  --muted-foreground: 51% 0.025 45;
  --border: 85.8% 0.022 55;
  --input: 85.8% 0.022 55;
  --ring: 67% 0.19 35;
  --radius: 0.375rem;
}
```
