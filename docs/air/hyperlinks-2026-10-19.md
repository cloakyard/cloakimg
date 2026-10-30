# Approved hyperlink treatment — 2026-10-19

The user reconfirmed angled hyperlinks and asked to preserve the approved Air design.
Air 1.0.5 (`94c5e537752f`) supersedes the straight-link rule introduced in 1.0.4.
Hyperlinks with a cue use ArrowUpRight; forward app actions and same-page jumps
retain ArrowRight. Header/footer navigation and credits keep neutral ink, while
meaningful body links, focus and active indicators retain the existing blue.
Destinations, new-tab behavior and product features are preserved.

Normalizes the shared angled glyph to the canonical Lucide path. Its existing ID-photo help link and parked landing Source retain their semantics. The isolated committed candidate passes full check/types, 470 tests, build/assets, 105-surface integrity and 18 portability checks. The combined parked draft passes 475 tests and build. The draft header restores ArrowUpRight; compact navigation/footer credits use neutral ink. These header/CSS edits remain uncommitted with the parked migration. Pre-existing formatting failures in two untracked draft files are not included in this commit. Local only; image output is unchanged.

The family link review covers 22 required viewport/theme cases per app plus two
320px/200% text cases (120 total), compact-menu opening/Escape/focus restoration,
neutral Source colour and decorative icon hiding. Desktop/laptop/phone light/dark
navigation captures were visually inspected. This bounded correction does not
complete the unfinished Resume/IMG migrations or physical/assistive acceptance.

Evidence: `evidence/hyperlinks-2026-10-19/`; full captures and command logs remain
in `/tmp/air-hyperlinks-2026-10-19/`. Root/PDF/Drop publication follows validation;
Resume/IMG remain local.
