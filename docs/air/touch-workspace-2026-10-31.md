# CloakIMG touch workspace — 2026-10-31

The approved touch study is implemented as a real editor composition under Air
1.3.2. This is a bounded phone/tablet workflow change after the completed Air
migration. The family contract, tokens, image algorithms, codecs and model tiers
remain unchanged; the canonical IMG product appendix records the composition.

## What changed

- A persistent labelled Adjust / Crop / Retouch / Protect / Add / Tools dock replaces
  the collapsed phone Tools button. Tablet uses the same shortcuts as a compact
  labelled rail with the 288px Air inspector. The full desktop rail is retained.
- One grouped, searchable catalogue exposes all 26 tools on every layout. Opening
  it no longer unmounts an active panel or unregisters its pending apply. Keyboard
  search works across layouts; dismissing search or an adjustment select preserves
  the current edit. Reselecting a tool does not reset its transaction boundary.
- Phone Adjust places its Air group selector in the fixed header. Light, Colour
  and Detail show named parameters with one exact value/slider at a time. Tablet
  shows related values together. Looks opens the actual Filters tool; All
  adjustments and Curves retain the full precision controls and masking scope.
- Expanded portrait controls retain a 128px preview region when height permits.
  Short landscape phones at 640px and above put controls beside the photo, with
  the dock below both. Short heights retain a reachable scrolling control region.
  The same persistent canvas survives tool and breakpoint changes. Batch retains
  its separate stage and existing scene restoration when returning to a photo.
- Cancel uses the shared history checkpoint and restores tool-entry settings,
  including discarded unbaked adjustments on re-entry. Done applies once. Mobile
  cancellation blocks conflicting interactions while undo completes. Nested
  select/dialog Escape handling cannot cancel the underlying image edit.
- Tablet zoom/reset actions move into More actions so the toolbar fits comfortably.
  Compact menus retain file/reset actions and expose zoom/fit and single/batch
  navigation. Existing two-finger comparison remains unchanged.
- Headers reflow long titles and actions at enlarged text. Neutral Air surfaces,
  exact numeric fields, standard selects, blue selection markers and 44px touch
  targets are retained. No new runtime dependency or alternate control skin.

The duplicated mobile picker/search, its separate rollback checkpoint, obsolete
mobile tool-tab metadata and superseded grid styles were removed. The compact
surface subscribes to the active-tool/actions slices instead of every slider tick.

The README and PWA install previews now show the actual phone dock/focused Adjust
and tablet compact rail/inspector. The capture generator uses the current shortcuts;
the obsolete picker selector and descriptions are removed. The tablet capture uses
the tablet layout at 1024×768 rather than the previous desktop-width viewport.
Both rendered captures were reviewed, and their PNG dimensions match the built
manifest (1290×2796 phone, 2048×1536 tablet). Formatting, types, production build,
asset-size and Air checks pass for this bounded asset/metadata follow-up.

## Validation

The durable [verification record](evidence/touch-workspace-2026-10-31/verification.json)
contains the final counts and reproduction commands. Initial layout coverage is
780 observations per engine: all 26 tools, 11 required sizes, additional 200% root
font profiles and both themes. A final 180-observation header matrix per engine
checks long titles, action overlap, preview retention and control bounds. Alternate
states cover all tools at phone, tablet and desktop sizes in both themes.

Feature checks include actual input/slider math for all eleven adjustments, curves,
mask gating, search/reselection, Cancel/re-entry, one-step Done, undo/redo pixels,
compact menu handoffs, batch return, native invalid drafts, file recovery, and 192
retained-value/canvas transitions around the changed 640px/768px/500px boundaries.
The existing all-tool and export/history probes also pass. Real original/adjusted
PNG downloads are compared with preceding production in both engines; decoded
pixels and transparency match exactly.

History assertions respect the editor's existing Display-P3 canvas and WebP .92
snapshot representation; they do not assume that compressed history is lossless.
No processing or history compression change was made. Earlier test attempts that
crossed a preview rebuild/HMR reload are excluded from passing evidence. The final
WebKit alternate-state matrix is a clean complete rerun. The new header assertion
caught the enlarged-text overlap; the nested-select journey caught Escape leaking
into Cancel. Both were fixed before release.

Representative rendered captures are stored beside the verification record. Full
scratch is `/tmp/air-img-touch-2026-10-31/`; only selected captures are retained in
Git. Use the checked-in `test-air-*` runners with an external `PLAYWRIGHT_MODULE`
and a built `BASE_URL`. `test-air-touch-workspace.mjs` needs a stable dev server for
its read-only history assertions. Do not rebuild or format watched application
sources during a browser matrix. `test-air-touch-output.mjs` supports `AIR_COMPARE`
against a saved preceding-production result.

Physical iPhone/software-keyboard, OS IME and spoken assistive acceptance remain
open. Browser-emulated touch and WebKit do not establish physical Safari acceptance.
This bounded pass does not repeat every native codec, model tier or high-resolution
workload from the earlier product audit. Other family applications are unchanged.
