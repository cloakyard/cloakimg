<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.

<!--VITE PLUS END-->

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
