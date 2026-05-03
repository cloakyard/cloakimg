// fabricDefaults.ts — Mutates Fabric's static `ownDefaults` so every
// selectable object on the canvas picks up the CloakIMG coral brand
// colour for its border + corner handles, and IText editing surfaces
// (the blinking cursor + character-selection band) match it too.
//
// Import this file once at the top of the app (before any Fabric
// instances are created). After that, all Fabric construction reads
// the mutated defaults.

import { FabricObject, IText } from "fabric";

const CORAL = "#f5613a";
/** Translucent coral used for the IText character-selection band and
 *  the Canvas marquee fill. */
const CORAL_TRANSLUCENT = "rgba(245, 97, 58, 0.35)";
const CORAL_FAINT = "rgba(245, 97, 58, 0.18)";

FabricObject.ownDefaults.borderColor = CORAL;
FabricObject.ownDefaults.cornerColor = CORAL;
FabricObject.ownDefaults.cornerStrokeColor = "#ffffff";
FabricObject.ownDefaults.cornerStyle = "circle";
FabricObject.ownDefaults.transparentCorners = false;
// Coarse pointers (touch) need a wider hit target — Apple's HIG and
// Material both ask for ≥44 pt. Fabric's default scales the visible
// corner with `cornerSize` and the hit area with `touchCornerSize`,
// so we keep the visible chip readable on desktop while expanding the
// touch area on coarse-pointer devices.
//
// On phones (small viewport AND coarse pointer) we go a step further:
// the Crop / shapes / text resize handles get a 20 px visible chip and
// a 44 px hit zone, with a thicker border to make selection state
// obvious from arm's length. Tablets stay on the merely-coarse profile
// — they have plenty of pixels and a wider chip starts crowding small
// shapes.
const isCoarsePointer =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;
const isPhone =
  typeof window !== "undefined" &&
  isCoarsePointer &&
  Math.min(window.innerWidth, window.innerHeight) <= 760;
FabricObject.ownDefaults.cornerSize = isPhone ? 20 : isCoarsePointer ? 14 : 9;
FabricObject.ownDefaults.touchCornerSize = isPhone ? 44 : isCoarsePointer ? 32 : 24;
FabricObject.ownDefaults.borderScaleFactor = isPhone ? 2 : 1.4;
FabricObject.ownDefaults.padding = isPhone ? 6 : isCoarsePointer ? 4 : 0;
// Inertial drag — on touch, a finger is rarely the precision instrument
// the mouse is. Bump the rotation snap angle and the click-vs-drag
// threshold so a stray pixel of finger jitter doesn't create a
// micro-rotation or fail to register a tap.
FabricObject.ownDefaults.snapAngle = isCoarsePointer ? 5 : 0;
FabricObject.ownDefaults.snapThreshold = isCoarsePointer ? 5 : 0;
FabricObject.ownDefaults.lockScalingFlip = true;

IText.ownDefaults.cursorColor = CORAL;
IText.ownDefaults.selectionColor = CORAL_TRANSLUCENT;

/** Use these on Canvas instances for the marquee + active-selection
 *  border (these aren't covered by `FabricObject.ownDefaults`). */
export const FABRIC_CANVAS_SELECTION = {
  selectionColor: CORAL_FAINT,
  selectionBorderColor: CORAL,
  selectionLineWidth: 1.5,
};
