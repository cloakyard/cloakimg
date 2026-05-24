// breakpoints.ts — Single source of truth for the viewport thresholds
// the editor uses to switch between mobile / tablet / desktop layouts.
// Five files used to hard-code 760 (EditorContext, ImageCanvas,
// fabricDefaults, PropertiesPanel comment, style.css media query) —
// drifting one would silently break feature parity between
// `useEditor().layout === "mobile"` and `isMobile` flags computed
// elsewhere, so they share this module instead.
//
// `style.css` and tokens.css still hard-code the same number in
// `@media (max-width: …px)` rules — CSS has no build-time access to
// these JS constants. If you change a value here, update the media
// queries in `src/style.css` (search for the value) at the same time.

/** Viewport width (px) at which the editor swaps from the desktop /
 *  tablet split-pane to the mobile sheet-based UI. */
export const MOBILE_MAX_PX = 760;

/** Below this width we use the tablet shell (tool rail + collapsible
 *  property panel) but still render the desktop-style toolbar. */
export const TABLET_MAX_PX = 1180;
