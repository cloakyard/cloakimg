# Portable runtime maintenance — 2026-10-26

Sync the reviewed Air 1.2 portable contract and Shaders 4.0.5/Vite+ 1.4 generated
library. No IMG redesign or dependency rollout is included. The parked 15-file
entry draft is byte-identical and excluded from this commit.

A clean snapshot of committed IMG plus these portable files passes 470 tests,
lint/types/build and deployed-asset checks. Twelve horizon layouts, real GPU
light/dark and rest behavior pass; 390/1280/1440 light/dark captures were reviewed.
See `evidence/portable-runtime-2026-10-26/`. This validates library maintenance,
not IMG's unfinished Air migration. No push or deployment is authorized for IMG.
