# Consistent landing navigation arrows — 2026-10-19

Superseded by [the user-confirmed angled hyperlink treatment](hyperlinks-2026-10-19.md).
This is historical evidence; the straight-link rule is no longer authoritative.

The user identified diagonal link arrows in Cloakyard and CloakPDF. Air 1.0.4
(`0f6ea38f83a9`) now requires a straight right arrow for forward landing links,
including outbound header/content/footer links. Back, download and disclosure
icons retain their meaning; plain text links need no extra decoration.

The portable contract/reference is updated. The parked Air header draft replaces its one ArrowUpRight with the existing ArrowRight; that one-line integration remains uncommitted with the larger draft. The committed legacy header has no diagonal navigation arrow. The combined draft passes 475 tests and build/assets plus the visual matrix below. Two pre-existing formatting failures remain in untracked draft files (scripts/test-air-entry.mjs and src/styles/air-entry.css); the isolated committed candidate passes full check/types, 105-source integrity and 18 portability checks. No parked migration source is included in this commit.

Each family landing passes 22 required viewport/theme cases (11 sizes, both
appearances), plus 320px at 200% text in both themes. Compact menus open and
close with Escape/focus restoration. Decorative arrows remain hidden from
assistive technology; no diagonal navigation glyph or horizontal overflow remains.
Desktop/laptop/phone light/dark navigation captures were visually inspected.
The generated gallery, horizontal-only hover, static keyboard focus and reduced
motion pass separately. This does not close full product or physical-device gates.

Evidence: `evidence/link-arrows-2026-10-19/`. Full captures and verification
commands are retained in `/tmp/air-link-arrows-2026-10-19/`. Root/PDF publication is a
follow-up to the authorized website release; Resume/IMG remain local.
