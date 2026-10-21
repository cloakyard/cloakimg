# Dependency rollout preparation — 2026-10-21

The committed baseline is upgraded independently of the parked Air draft.
[Evidence](evidence/dependencies-2026-10-21.json) records current direct/transitive
packages, pinned CI actions, MediaPipe JS/WASM 1.1.1 and the rebuilt libheif
1.23.6/libde265 1.1.3/Kvazaar 2.3.2 codec with Emscripten 6.0.13.

All 470 tests, 26 tool panels, real portrait detection/anonymization, history/export,
HEIC upload, responsive comparisons, build/assets/security and dry-run checks pass.
Native decoding and nine export round trips preserve all decoded pixels; HEIC
container bytes change with the newer library. The source model is unchanged.

Removed stale release-age exemptions and the obsolete positive-face fixture
reference. The exact-version service assertion prevents JS/WASM drift. Font assets,
canvas pool ownership, consent and optional AI workers retain live consumers.
No speculative package removal or parked source edits were made.

This does not finish IMG's Air refresh. The committed baseline retains the old
palette/link treatment and coarse-landscape rotation screen. The Air link audit
is a pending migration gate, not a dependency-regression pass. Preserve the 15-file
parked draft, finish Resume first, then migrate and validate all IMG surfaces.
No deployment or remote integration belongs to this bounded piece.
