<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.

<!--VITE PLUS END-->

# AI capability architecture (Phase 0)

The AI subsystem is built around two primitives that any future
capability — face detection, depth, inpainting, super-resolution,
adversarial cloaking, alt-text, AI-image detection — plugs into without
forking the consent / state-machine / worker plumbing. (OCR is _not_ in
this list — it lives in the sibling product CloakPDF; see "Product
scope" below.)

## Where things live

```
src/editor/ai/
├── capability/                          ← generic primitives
│   ├── types.ts                         CapabilityKind union, CapabilityState,
│   │                                    CapabilityTier, CapabilityFamily,
│   │                                    ConsentCopy, StatusCopy, tier helpers
│   ├── service.ts                       CapabilityService<TResult> class
│   ├── service.test.ts                  state-machine, cache, in-flight, watchdog,
│   │                                    deny latch, supersession, validator tests
│   └── types.test.ts                    tier helper edge cases
├── runtime/
│   ├── worker.ts                        thin top-level dispatcher (HANDLERS map)
│   ├── handlers/
│   │   ├── shared.ts                    bitmap conversions, postProgress/Error/Ready,
│   │   │                                friendlyErrorMessage, deviceOrder
│   │   └── segmentHandler.ts            segmentation handler (per-kind pipeline cache)
│   ├── runtime.ts                       main-thread harness (unchanged)
│   ├── progress.ts                      cross-file progress aggregator (unchanged)
│   ├── cache.ts                         CacheStorage probe (already generic)
│   └── types.ts                         AiRequest discriminated union (worker-bound only)
├── capabilities/
│   ├── segment/                         (planned — segmentation flow lives in legacy
│   │                                    files for now, see bottom of tree)
│   └── detect-face/
│       ├── family.ts                    BlazeFace tier + consent copy
│       ├── service.ts                   CapabilityService<FaceBox[]> facade
│       ├── runner.ts                    MAIN-THREAD MediaPipe FaceDetector runner
│       │                                (Tasks Web SDK can't load in module workers)
│       ├── geometry.ts                  padFaceBox helper
│       ├── hook.ts                      useDetectFaces React binding
│       └── ConsentHost.tsx              dialog mount under the editor shell
├── ui/
│   ├── status/
│   │   └── CapabilityStatusCards.tsx    CapabilityProgressCard / ReadyChip /
│   │                                    ErrorCard / PausedChip / ConsentChip
│   └── consent/
│       └── CapabilityConsentDialog.tsx  generic tier picker + consent dialog
└── (legacy mask flow files kept in place: subjectMask.ts, useSubjectMask.ts,
    MaskConsentDialog.tsx, MaskConsentHost.tsx, etc. — these still own the
    segmentation surface today and will migrate onto the primitives later.)
```

## Adding a new AI capability

There are two patterns depending on whether your runtime works in a
module worker:

### Worker pattern (transformers.js, raw ONNX, anything that DOES work in module workers)

1. **Add the request kind** in `runtime/types.ts`'s `AiRequest` union,
   and to `capability/types.ts`'s `CapabilityKind`.
2. **Write the worker handler** under `runtime/handlers/`. Use
   `shared.ts` for bitmap conversion + post helpers + device fallback.
   Each handler owns its own MRU pipeline-cache slot (see
   `segmentHandler.ts`).
3. **Register the handler** in `runtime/worker.ts`'s `HANDLERS` map. TS
   forces this — a missing entry is a compile error.
4. The runner inside the capability's `service.ts` calls
   `runAi({kind: ..., bitmap, ...}, {signal, transfer, onProgress})`.

### Main-thread pattern (MediaPipe Tasks Web — anything that needs `importScripts`)

Module workers (which Vite generates with `type: "module"`) don't expose
`importScripts`, so SDKs that ship Emscripten loaders (notably MediaPipe)
fail with "ModuleFactory not set." inside the worker. For those:

1. **DO NOT add a request kind** to `AiRequest` — face detect is
   intentionally absent. Still add the `CapabilityKind` string to
   `capability/types.ts` (consent dialogs / status cards key off it).
2. **Write a runner** under `capabilities/<feature>/runner.ts` that
   owns the SDK lifecycle (download bytes with progress → init runtime
   → cache the detector across calls). See
   `capabilities/detect-face/runner.ts` for the canonical shape.
3. The runner accepts `{ source, signal, onProgress, ... }` and returns
   the result directly (no postMessage). The capability's `service.ts`
   wraps it in a `RunnerArgs`-compatible function for
   `CapabilityService.run`.
4. Inference happens on the main thread. This is fine for fast SDKs
   (BlazeFace runs in ~50 ms on a 1 MP photo); avoid the pattern for
   anything that takes multiple seconds.

### Either pattern, then:

5. **Build a `CapabilityFamily`** describing tiers + consent + status
   copy. Keep it under `capabilities/<feature>/` for organization.
6. **Instantiate a `CapabilityService<TResult>`** with the family, an
   `isTierCached` probe (HF-cache check for transformers.js,
   localStorage marker for same-origin assets), and an optional
   validator + onResultDropped hook.
7. **Wire the service into a hook + tool**. The capability owns its
   hook (the face surface has `useDetectFaces`); follow the same
   pattern. Wire `CapabilityConsentDialog` for tier selection and
   `CapabilityProgressCard / ReadyChip / ErrorCard / PausedChip` for
   inline status.

The service primitive handles every state-machine concern that the
segmentation flow proved out: lazy detection with concurrent dedup,
in-flight abort + 30s stall watchdog (overridable), generation counter
for invalidation safety, deny-latch so dismissing the dialog sticks,
disk-cache probe with implicit consent on hit, wait-for-resolution for
smart-action awaits, per-source cache with dim-drift invalidation, and
an `extra` slot for capability-specific cache extensions (e.g.
segmentation hangs its downsample cache there).

All consent prompts and download progress UIs MUST flow through these
primitives — every model download is gated behind explicit user consent
with a visible-bytes progress bar, and every AI control is disabled
(via `ScopeGate` or its successor) until status flips to `ready`.

## Capabilities shipped today

| Kind          | Family                          | Model                                                           | Size             | Surface                                                                                |
| ------------- | ------------------------------- | --------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `segment`     | ISNet (DIS) via transformers.js | `onnx-community/ISNet-ONNX` (q8 / fp16 / fp32)                  | 42 / 84 / 168 MB | Adjust/Filter/Levels/HSL scope, Portrait blur, Remove BG, Smart Anonymize person/scene |
| `detect-face` | MediaPipe BlazeFace full-range  | `public/models/face/blaze_face_full_range.tflite` (same-origin) | 1.04 MB          | Smart Auto-Anonymize "Faces"                                                           |

## Product scope (don't add features outside this)

CloakIMG is positioned as a free, privacy-first browser-based
alternative to Photoshop / Lightroom for **photo work**. Document text
flows (OCR, PDF parsing, signing, redacting) live in the sibling
product **CloakPDF** — don't pull them into CloakIMG. The
`CapabilityKind` union has no `ocr` entry on purpose. New capability
proposals should push toward the photo-editor goal: subject masking,
denoise, super-res, inpainting / object removal, depth-aware effects,
sky replacement, color grading, RAW workflows, etc.

When adding the **N**th capability, prefer reusing an existing runtime:

- **transformers.js** — any HF-hosted model with a recognisable pipeline
  (`background-removal`, `image-segmentation`, `object-detection`,
  `depth-estimation`, etc.). Today's segmentation surface uses this.
- **MediaPipe Tasks Web** (`@mediapipe/tasks-vision`) — Google's vision
  task suite. Today's face detection uses this. Same SDK + WASM bundle
  also covers Face Landmarker, Image Segmenter, Interactive Segmenter,
  Object Detector, and Pose Landmarker — pulling another MediaPipe task
  in costs nothing on top of the cached WASM.
- **Direct ONNX via `onnxruntime-web`** — raw ONNX models with no HF or
  MediaPipe wrapper (LaMa inpainting, Real-ESRGAN super-resolution,
  MiDaS depth — when we get there). Re-add the dependency when needed;
  it's currently uninstalled because no shipping capability uses it.

Same-origin assets (under `public/models/<feature>/`) sidestep the HF
CacheStorage probe; for those, the family's `isTierCached` callback
checks a localStorage marker (see `detect-face/service.ts`'s
`isFaceConsented` for the canonical pattern).

# Critical gotcha: live preview hooks + canvas pool + StrictMode

Every live-preview hook (`useAdjustPreview`, `useLevelsPreview`, `useHslPreview`, `useBgBlurPreview`) acquires scratch canvases from the pool in `editor/doc.ts`. The previous bake's canvas must be released back to the pool when the new bake replaces it.

**Do NOT call `releaseCanvas` inside a `setState` updater function.** React StrictMode (enabled in `src/main.tsx`) double-invokes useState updaters in dev to flag impurity. If `releaseCanvas` lives inside `setPreview((prev) => ...)`, the same canvas is pushed onto the pool twice. The next two `acquireCanvas` calls return the same element — `bakeGaussian`/`applyMaskScope`/etc. step on each other's pixels and the preview "freezes" after the pool starts handing out duplicates.

Pattern that's known broken:

```ts
// ❌ Side effect inside the updater — runs twice in StrictMode.
setPreview((prev) => {
  if (prev.canvas && prev.canvas !== ds && prev.canvas !== result) {
    releaseCanvas(prev.canvas); // ← leaks into the pool twice
  }
  return { canvas: result, version: prev.version + 1 };
});
```

Pattern that's correct (used by all four preview hooks today):

```ts
// ✅ Release happens synchronously, ONCE, before setState.
const pub = publishedCanvasRef.current;
if (pub && pub !== ds && pub !== result) releaseCanvas(pub);
publishedCanvasRef.current = result;
versionCounterRef.current += 1;
setPreview({ canvas: result, version: versionCounterRef.current });
```

The same rule applies to `clearPublished` (the no-op preview path) and the unmount cleanup. If you add a new live-preview hook, follow the `publishedCanvasRef` + `versionCounterRef` pattern — don't reach for the functional `setState` form.

This bug was reproducible with the headless Puppeteer driver: after 3 slider drags the visible canvas hash stopped changing because two pool-acquire calls returned the same element (`applyMaskScope` overwrote `bakeGaussian`'s pixels). Hash sequence before fix: `aa67… d36f… c235… c235… c235…` (frozen). After fix: every step a fresh hash.
