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
const isCoarsePointer =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;
FabricObject.ownDefaults.cornerSize = isCoarsePointer ? 14 : 9;
FabricObject.ownDefaults.touchCornerSize = isCoarsePointer ? 32 : 24;
FabricObject.ownDefaults.borderScaleFactor = 1.4;
FabricObject.ownDefaults.padding = isCoarsePointer ? 4 : 0;

IText.ownDefaults.cursorColor = CORAL;
IText.ownDefaults.selectionColor = CORAL_TRANSLUCENT;

/** Use these on Canvas instances for the marquee + active-selection
 *  border (these aren't covered by `FabricObject.ownDefaults`). */
export const FABRIC_CANVAS_SELECTION = {
  selectionColor: CORAL_FAINT,
  selectionBorderColor: CORAL,
  selectionLineWidth: 1.5,
};
