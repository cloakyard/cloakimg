# Air validation record

## 2026-10-11 — portable contract and inventory

`vp check`, 470/470 unit tests and production build/asset limits pass.

`node scripts/check-air-design.mjs` passes both in this repository and in a
separate temporary directory with only DESIGN.md, the checker and inventory.
Regenerating the inventory preserves its contents. The contract is copied in full;
there is no sibling-checkout or runtime service dependency. CI checks document
integrity and inventory drift; source files default to pending until reviewed.

This commit establishes governance only. Runtime Air styles, component/state audits,
responsive screenshots and feature sweeps are still pending. The full phased plan
is maintained in Cloakyard's `UX_REFRESH_TODO.md`; this repository's surface record
tracks local evidence so it remains usable independently.

## 2026-10-11 — shared component bundle

The pinned local CSS and working `docs/air/components.html` reference are identical
across the family. They are not yet imported into product screens. Contract/bundle
hashes, palette equality and standalone-copy validation pass. All 15 required and
breakpoint-neighbour viewport sizes have no document overflow in light and dark.
The reference was visually inspected on desktop, laptop and phone, including the
390px dark sheet and 320px light controls. Evidence images are recorded in the
family repository's `docs/air/evidence/reference-*.jpg`.

Verified: field/select editing; checkbox and segment selection; slider keyboard
increment; dialog initial focus, forward/reverse focus wrap, Escape, Done and focus
return; 44px coarse-pointer controls; 16px mobile inputs; zero-duration reduced
motion. Fixed the native dialog's default max-width narrowing the phone sheet.
Contrast calculations: all tested normal text/semantic pairs >=4.5:1; required
field boundaries >=3:1 (light 3.31:1, dark 4.39:1). Source review covers disabled,
busy, hover/press and status variants. Product-specific controls, real app state
sweeps, 200% browser zoom and software-keyboard behaviour remain separate gates.

The CSS is an explicit standalone reference entry for PDF's dead-code tool because
its HTML reference imports it; it is not a dead-code ignore. Product migration will
replace this entry with the application's normal stylesheet import.

## Full default-panel audit and Air precision study — 2026-10-11

All 26 desktop default tool panels and 25 mobile picker tools inspected. See
`editor-audit.md` for per-tool requirements, exact state/viewport coverage, the
Cancel/re-entry baseline finding and remaining feature probes. The audit is not
an Air implementation pass. No AI model download or export was performed.

Synchronized the complete portable contract and opt-in reference at hash
`80ae0cf6d1d6` (prefix), including actual IMG numeric ranges, curve accessibility,
compact curve geometry, real layer/history semantics and commit boundaries.
The canonical reference passed 70 IMG panel cases and 14 curve cases in both
light/dark, plus focused-field, precise-entry and curve interactions; full evidence
is recorded in Cloakyard's `docs/air/validation.md`. This local bundle remains
self-contained and no production entry point imports `src/styles/air.css`.

Passed `vp check`, `vp test run` (470/470, 46 files), `pnpm run build` and its
100-file deployment asset gate (all ≤25 MiB), inventory/contract checks and
exact-copy synchronization. Existing build chunk-size warnings remain. This is a
documentation/reference checkpoint; runtime tool-rail, model, export and PWA probes
were not run for unchanged product code and remain migration requirements.

## 2026-10-12 — refinement 03 reference checkpoint

Saved the canonical Air candidate from Cloakyard checkpoint `340aee8`, contract
`dc6032235f40` (SHA-256 prefix). The standalone bundle includes refined fields,
choices, compound controls, motion, floating menus/popovers/tooltips and safe
rename/remove/restore studies, plus local shader/overlay modules and licenses.
`design:portability` exposes the isolated validation command. Generated vendor
assets are covered by hash verification, not reformatted as app-owned source.

The exact-copy contract checker and all ten isolated portability assertions pass
for this product (13 files, no app dependencies or sibling checkout). Shared
reference visual and interaction evidence is recorded in Cloakyard's
`docs/air/validation.md`, including 224 floating-surface checks and 15 journeys.
This is a documentation/reference checkpoint; the runtime does not import Air CSS
or the study modules, and full product visual/feature migration is still pending.

`vp check`, all **470/470 tests** (46 files), `vp run build` (TypeScript,
production and PWA) and the 100-file deployment asset check (all ≤25 MiB) pass.

Existing product behavior and appearance are unchanged. Runtime editor/AI/export
E2E sweeps are reserved for affected production pieces; this checkpoint does not
claim those have passed. No push or deployment was performed.

## 2026-10-14 — Portable Air 1.0.1

Pinned the complete family contract and reference bundle to Air 1.0.1 (contract
`201f7c381b5f`). Header identity is now consistently 36×36px across landing/editor
and small screens, with at least a 44px interactive target. A shared paper-accent
keeps selection chrome readable on white document paper in both themes. Inventory
version comes from the manifest. The new token does not change this product's
runtime controls; its full application migration remains separately tracked.

Exact design integrity, isolated portability and production checks pass. Shared
visual/interaction evidence is in CloakPDF's canvas checkpoint; it does not claim
this product's editor, physical touch or assistive acceptance is complete.

## 2026-10-15 — Air 1.0.2 colour-wheel contract

Pinned the portable colour-wheel rules, opt-in CSS, shared math/types and working
reference. Product picker runtime adoption remains separate from this bundle sync.
Format/lint/types, 470 units, build/asset limits pass, as do design integrity and all 18 standalone portability assertions.
No product UI source or dependency changed. The family evidence and PDF pilot are
tracked in Cloakyard's UX_REFRESH_TODO.md; physical/assistive acceptance remains open.

## 2026-10-19 — shared disabled icon-button correction

Synchronized the canonical Air CSS and gallery hashes. Guarded `aria-disabled`
icon buttons now use the same disabled appearance as text buttons and cannot
show hover/press motion. No product component or native macOS source changed;
this bundle update is not a completed app migration. Contract stays Air 1.0.2,
`bb90f52e0b0a`; exact assets are pinned in bundle.json. Real behavior/visual evidence
is recorded in CloakPDF's editor-wrappers-2026-10-19 audit and Cloakyard's matching
validation checkpoint. Required local format/lint/types, 470 unit tests in 46 files, production build/asset limits, design integrity and all 18 portability checks pass.

The final correction keeps the keyboard focus contour at full opacity while muting
only the unavailable icon; the synchronized bundle was rebuilt and rechecked.

## 2026-10-19 — consistent landing arrows

Air 1.0.4 uses straight forward-navigation arrows. See
[scope, validation and evidence](link-arrows-2026-10-19.md). Twenty-two responsive
light/dark cases and two enlarged-text cases pass, including compact-menu
keyboard return; desktop/laptop/phone captures were visually inspected.

## 2026-10-19 — approved angled hyperlinks and neutral navigation

Air 1.0.5 restores the approved angled hyperlink cue and neutral header/footer
treatment. See [scope and evidence](hyperlinks-2026-10-19.md). Twenty-four local
responsive/theme/text cases pass; desktop/laptop/phone captures were inspected.

## Neutral hyperlink follow-up — 2026-10-19

Air 1.0.6 removes blue hyperlink text, including hover, and specifies neutral
inline/directional treatments. See [scope and evidence](neutral-links-2026-10-19.md).
