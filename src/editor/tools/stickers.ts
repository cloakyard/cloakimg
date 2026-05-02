// stickers.ts — Phase F4.5. A pre-loaded local SVG library for the
// Sticker tool. Each entry is a path d-string normalised to a 100×100
// bbox; the StickerTool scales via scaleX / scaleY when dropped.
//
// Strict no-network: paths are inline strings, no fetches, no
// external assets. Add new stickers by appending to STICKERS and
// they show up in the panel grid automatically.

export interface Sticker {
  name: string;
  d: string;
  /** Default fill colour. Stroke is derived from `--text` so the
   *  sticker reads in both themes. */
  fill: string;
}

export const STICKERS: readonly Sticker[] = [
  {
    name: "Pin",
    fill: "#f5613a",
    d: "M 50,5 C 30,5 15,20 15,40 C 15,65 50,95 50,95 C 50,95 85,65 85,40 C 85,20 70,5 50,5 Z M 50,30 A 12,12 0 1 1 50,54 A 12,12 0 1 1 50,30 Z",
  },
  {
    name: "Star",
    fill: "#f4c542",
    d: "M 50,5 L 61,38 L 95,38 L 67,58 L 78,90 L 50,70 L 22,90 L 33,58 L 5,38 L 39,38 Z",
  },
  {
    name: "Heart",
    fill: "#e54a22",
    d: "M 50,90 C 20,70 0,40 10,20 C 25,0 45,0 50,20 C 55,0 75,0 90,20 C 100,40 80,70 50,90 Z",
  },
  {
    name: "Speech",
    fill: "#5fa0e0",
    d: "M 10,5 H 90 Q 100,5 100,15 V 60 Q 100,70 90,70 H 55 L 35,90 L 40,70 H 10 Q 0,70 0,60 V 15 Q 0,5 10,5 Z",
  },
  {
    name: "Banner",
    fill: "#e54a22",
    d: "M 5,20 H 80 L 95,40 L 80,60 H 5 L 18,40 Z",
  },
  {
    name: "Bolt",
    fill: "#ffd84a",
    d: "M 55,5 L 20,55 L 45,55 L 35,95 L 80,40 L 55,40 L 65,5 Z",
  },
  {
    name: "Check",
    fill: "#3fbf6f",
    d: "M 10,55 L 35,80 L 90,15 L 80,5 L 35,55 L 20,40 Z",
  },
  {
    name: "Cross",
    fill: "#cf3a4a",
    d: "M 20,10 L 50,40 L 80,10 L 90,20 L 60,50 L 90,80 L 80,90 L 50,60 L 20,90 L 10,80 L 40,50 L 10,20 Z",
  },
  {
    name: "Smile",
    fill: "#ffd84a",
    d: "M 50,5 A 45,45 0 1 1 49.99,5 Z M 35,38 A 5,6 0 1 1 35,37.99 Z M 65,38 A 5,6 0 1 1 65,37.99 Z M 30,60 Q 50,80 70,60 Q 50,72 30,60 Z",
  },
  {
    name: "Crown",
    fill: "#f4c542",
    d: "M 10,75 L 18,30 L 35,55 L 50,20 L 65,55 L 82,30 L 90,75 Z M 10,80 H 90 V 90 H 10 Z",
  },
  {
    name: "Lock",
    fill: "#5a4a3a",
    d: "M 30,45 V 30 A 20,20 0 0 1 70,30 V 45 H 60 V 30 A 10,10 0 0 0 40,30 V 45 Z M 22,45 H 78 V 90 H 22 Z",
  },
  {
    name: "Plus",
    fill: "#3fbf6f",
    d: "M 40,10 H 60 V 40 H 90 V 60 H 60 V 90 H 40 V 60 H 10 V 40 H 40 Z",
  },
  {
    name: "Question",
    fill: "#5fa0e0",
    d: "M 50,5 A 45,45 0 1 1 49.99,5 Z M 35,35 A 15,15 0 0 1 65,35 Q 65,45 55,52 Q 50,55 50,62 H 42 Q 42,52 50,46 Q 57,42 57,35 A 7,7 0 0 0 43,35 Z M 46,72 H 54 V 80 H 46 Z",
  },
  {
    name: "Exclaim",
    fill: "#e54a22",
    d: "M 50,5 L 70,5 L 65,60 L 35,60 L 30,5 Z M 35,72 H 65 V 90 H 35 Z",
  },
  {
    name: "ThumbsUp",
    fill: "#3fbf6f",
    d: "M 30,45 H 45 V 30 Q 45,15 55,15 Q 65,15 60,30 L 58,42 H 78 Q 88,42 86,52 L 80,80 Q 78,90 68,90 H 30 Z M 12,45 H 26 V 90 H 12 Z",
  },
  {
    name: "Camera",
    fill: "#5a4a3a",
    d: "M 12,28 H 30 L 36,18 H 64 L 70,28 H 88 Q 92,28 92,32 V 78 Q 92,82 88,82 H 12 Q 8,82 8,78 V 32 Q 8,28 12,28 Z M 50,38 A 17,17 0 1 1 49.99,38 Z M 50,46 A 9,9 0 1 1 49.99,46 Z",
  },
  {
    name: "Tag",
    fill: "#a06ed1",
    d: "M 8,8 H 50 L 92,50 L 50,92 L 8,50 Z M 22,22 A 7,7 0 1 1 22,21.99 Z",
  },
  {
    name: "Coffee",
    fill: "#7a5a3a",
    d: "M 18,30 H 70 V 60 Q 70,80 50,80 Q 30,80 30,60 V 30 Z M 70,38 H 82 Q 90,38 90,46 V 54 Q 90,62 82,62 H 70 V 54 H 80 V 46 H 70 Z M 25,18 Q 30,8 35,18 Q 40,28 35,18 Z M 45,12 Q 50,2 55,12 Q 60,22 55,12 Z M 65,18 Q 70,8 75,18 Q 80,28 75,18 Z",
  },
  {
    name: "Music",
    fill: "#6a5acd",
    d: "M 38,10 H 80 V 22 L 50,28 V 70 A 14,12 0 1 1 38,58 V 26 Z M 80,55 A 14,12 0 1 1 80,54.99 V 22 Z",
  },
  {
    name: "Sun",
    fill: "#ffb52a",
    d: "M 50,28 A 22,22 0 1 1 49.99,28 Z M 47,2 H 53 V 14 H 47 Z M 47,86 H 53 V 98 H 47 Z M 2,47 H 14 V 53 H 2 Z M 86,47 H 98 V 53 H 86 Z M 16,12 L 20,16 L 28,24 L 24,28 Z M 72,72 L 76,76 L 84,84 L 80,88 Z M 84,12 L 88,16 L 76,28 L 72,24 Z M 16,88 L 20,84 L 28,76 L 24,72 Z",
  },
  {
    name: "Moon",
    fill: "#9aa9d8",
    d: "M 65,8 A 42,42 0 1 0 92,55 A 32,32 0 0 1 65,8 Z",
  },
  {
    name: "Snowflake",
    fill: "#7bc6e6",
    d: "M 47,5 H 53 V 95 H 47 Z M 5,47 H 95 V 53 H 5 Z M 14,14 L 18,10 L 86,82 L 82,86 Z M 86,14 L 90,18 L 18,90 L 14,86 Z M 35,15 L 50,25 L 65,15 L 70,20 L 50,33 L 30,20 Z M 35,85 L 50,75 L 65,85 L 70,80 L 50,67 L 30,80 Z M 15,35 L 25,50 L 15,65 L 20,70 L 33,50 L 20,30 Z M 85,35 L 75,50 L 85,65 L 80,70 L 67,50 L 80,30 Z",
  },
  {
    name: "Flame",
    fill: "#ff6633",
    d: "M 50,5 C 70,25 85,40 75,60 C 70,75 80,80 70,90 C 60,98 35,98 28,85 C 22,72 32,68 28,55 C 24,42 35,32 50,5 Z M 50,42 C 60,55 65,62 60,72 C 55,82 42,82 38,72 C 35,62 42,55 50,42 Z",
  },
  {
    name: "Gift",
    fill: "#cf3a4a",
    d: "M 8,38 H 92 V 50 H 8 Z M 14,52 H 86 V 92 H 14 Z M 46,38 H 54 V 92 H 46 Z M 30,18 Q 50,5 50,30 Q 50,42 30,38 Q 22,30 30,18 Z M 70,18 Q 50,5 50,30 Q 50,42 70,38 Q 78,30 70,18 Z",
  },
  {
    name: "Rocket",
    fill: "#e54a22",
    d: "M 50,5 C 65,18 75,38 75,60 V 78 H 25 V 60 C 25,38 35,18 50,5 Z M 42,38 A 8,8 0 1 1 41.99,38 A 8,8 0 1 1 42,38 Z M 58,38 A 8,8 0 1 1 57.99,38 A 8,8 0 1 1 58,38 Z M 25,68 L 10,82 L 18,84 L 25,78 Z M 75,68 L 90,82 L 82,84 L 75,78 Z M 38,80 L 38,95 L 44,90 L 50,95 L 56,90 L 62,95 L 62,80 Z",
  },
  {
    name: "Bell",
    fill: "#f4c542",
    d: "M 50,5 A 8,8 0 1 1 50,18 A 8,8 0 1 1 50,5 Z M 30,20 H 70 Q 80,30 80,50 V 65 Q 80,72 86,76 H 14 Q 20,72 20,65 V 50 Q 20,30 30,20 Z M 40,82 H 60 A 10,10 0 1 1 40,82 Z",
  },
  {
    name: "Gem",
    fill: "#5fa0e0",
    d: "M 25,15 H 75 L 95,40 L 50,95 L 5,40 Z M 25,15 L 38,40 L 5,40 Z M 75,15 L 62,40 L 95,40 Z M 38,40 L 50,15 L 62,40 L 50,95 Z",
  },
];
