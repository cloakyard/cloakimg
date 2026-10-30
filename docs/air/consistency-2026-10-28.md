# Air consistency audit — 2026-10-28

Air 1.2.4 pins the same public compact navigation and correct CSS time conversion
for both seconds and milliseconds. The production light arrival stays 900ms.

Portable maintenance only. The published legacy header, footer and coral PWA notice remain an explicit Air deviation, and no Air landing artwork is adopted on the live site. The isolated committed-source-plus-portable-update snapshot passes 470 tests, build/check/design/portability, 12 static and 22 GPU timing cases. The 15 parked draft paths retain their initial SHA-256 values. No push or deployment is authorized for this app.

The four refreshed websites pass 1,152 Chrome/Firefox shell layouts with zero
deviations/errors. PDF/Resume share 264 PWA layouts and 54 exact visual pairs.
The common notices preserve each app's update/work-safety lifecycle. Yard and
Drop's website have no PWA worker. Link states remain neutral, including hover.

[Local evidence](evidence/consistency-2026-10-28/) preserves this candidate's verification.
[The family audit](https://github.com/cloakyard/cloakyard/blob/main/docs/air/consistency-2026-10-28.md)
contains the before/after review, full test ledger and production release tracking.
Deployment is tracked separately from these pre-merge acceptance results.

Full product, physical/assistive/hardware and existing output/security acceptance
items remain open. This audit does not mark those surfaces fully validated.

## Build dependency follow-up

The 2026-10-28 CI scan surfaced GHSA-gcqx-w48m-w2h4 in deepmerge 4.3.1, a
transitive Workbox build dependency with no patched release. Its sole consumer
clones fixed resolver defaults. A version-pinned CJS/ESM patch uses Node's native
structuredClone; a scoped pnpm override removes the unused dependency. See
[patch rationale and removal condition](../../patches/README.md). No advisory
suppression or replacement library was added. Frozen install, both resolver
entry points, unchanged frozen defaults, full build and exact pre/post output
hashes pass. OSV passes with only any separately approved existing exception.

The same isolated scan found older serialize-javascript 7.1.2. Updated its build-only override to 7.1.4; the final OSV scan is clean, all 470 tests pass and all 101 build files remain byte-identical. This maintenance stays local; parked UI hashes remain unchanged.
