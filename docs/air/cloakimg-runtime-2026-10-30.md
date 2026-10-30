# CloakIMG runtime and output acceptance — 2026-10-30

Updated Transformers.js to 4.3.2, MediaPipe Tasks Vision (including matching WASM URL) to 1.2.0, Vite+ to 1.4.0, Puppeteer to 25.16.0 and Node types to 26.6.6. `vp outdated` reports no newer direct dependencies; the production dependency audit reports zero advisories. Lazy AVIF is pre-optimized during development to avoid a first-export page reload.

The existing reproducible native codec now pins libheif 1.23.7, libde265 1.1.3, Kvazaar 2.3.2 and Emscripten 6.0.13. Added current libwebp 1.6.0 to that same lazy worker: WebKit's native canvas returns PNG for requested WebP, so actual WebP now falls back to the codec instead of failing. No new npm codec dependency remains. The binding copies bytes before native vectors/allocations expire. Its README includes exact versions, licenses and both Docker and official native SDK build instructions. The generated module is 2,101,540 bytes, loaded only on demand.

An absent GPU adapter previously poisoned upstream ONNX initialization before WASM could initialize. Auto device selection now probes for an adapter first and chooses WASM when unavailable; explicit device hints remain honored. Tests cover absent/null/rejected/valid adapters and explicit WASM. This does not claim recovery from every GPU failure after a valid adapter was supplied.

Verification:

- Format/lint/types, **480 tests / 49 files**, production build and **90 deployment assets** under 25 MiB; portable contract and isolated bundle validation; 26-tool touch sweep.
- Actual Chrome and WebKit downloads of JPG, PNG, WebP, AVIF and HEIC, decoded dimensions/colour and filename signatures. PNG exactly preserves the working canvas after conversion to sRGB; WebP preserves transparent and opaque alpha. This is not a claim that a colour-managed imported PNG is byte-identical to its source file.
- Actual ID-photo PDF download in both engines; existing physical-size/layout tests retained.
- Previous/current real HEIC fixture decode and nine real HEIC encode/decode comparisons (three sizes × three quality settings) preserve every decoded RGBA pixel.
- Actual face detection and depth inference; segmentation consent denial without downloading, explicit consent and successful WASM inference under iPhone UA and normal Chrome with no GPU adapter.
- Gaussian/lens/tilt-shift blur produce distinct pixel hashes. The diagnostic now reads the rendered image canvas, including legitimate white centre pixels. Time-of-day history, Tap-to-Fix, AI inspector and export privacy review pass.

Evidence lives in `/tmp/air-img-2026-10-30/`: `deps-{check,unit,build,tools,design,outdated,audit}-final.*`, `deps-outputs-final-2.log`, `codec-comparison-final.json`, `codec-compare-final.log`, `native-webp-build.log`, `deps-{face,relight}-1.log`, `deps-segment-{wasm,auto}-2.log`, `deps-blur-2.log`, `deps-features-2.log`, `exports/`, and segmentation captures. Restarting the dev server after dependency removal cleared a stale optimized-module failure before the passing browser run. Physical iPhone, software keyboard/IME and assistive-technology acceptance remain separate; cleanup and final visual/edge acceptance are next. No push or deployment in this piece.
