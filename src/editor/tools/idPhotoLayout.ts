// idPhotoLayout.ts — Pure physical-layout math plus the small PDF
// writer used by the ID photo tool. All geometry is expressed in mm
// until the last render step, which keeps paper and photo sizes exact.

import type { Rect } from "./cropMath";

export interface IdPhotoSize {
  widthMm: number;
  heightMm: number;
}

export interface PaperPreset {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  marginMm: number;
  gapMm: number;
  note?: string;
}

export interface SheetSlot {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface SheetLayout {
  paper: PaperPreset;
  photo: IdPhotoSize;
  rotated: boolean;
  columns: number;
  rows: number;
  copies: number;
  slots: SheetSlot[];
}

export interface CutGuideSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const PAPER_PRESETS: readonly PaperPreset[] = [
  {
    id: "photo-4x6",
    label: "Photo 4 × 6 in · borderless",
    widthMm: 101.6,
    heightMm: 152.4,
    marginMm: 0,
    gapMm: 0,
    note: "Best for borderless photo printers and lab prints.",
  },
  {
    id: "photo-5x7",
    label: "Photo 5 × 7 in",
    widthMm: 127,
    heightMm: 177.8,
    marginMm: 3,
    gapMm: 2,
  },
  {
    id: "photo-8x10",
    label: "Photo 8 × 10 in",
    widthMm: 203.2,
    heightMm: 254,
    marginMm: 5,
    gapMm: 2,
  },
  {
    id: "a4",
    label: "A4 · 210 × 297 mm",
    widthMm: 210,
    heightMm: 297,
    marginMm: 5,
    gapMm: 2,
  },
  {
    id: "a5",
    label: "A5 · 148 × 210 mm",
    widthMm: 148,
    heightMm: 210,
    marginMm: 5,
    gapMm: 2,
  },
  {
    id: "letter",
    label: "US Letter · 8.5 × 11 in",
    widthMm: 215.9,
    heightMm: 279.4,
    marginMm: 6.35,
    gapMm: 2.5,
  },
] as const;

export const DEFAULT_PAPER_PRESET_ID = "photo-4x6";
export const ID_PHOTO_DPI = 300;

export function findPaperPreset(id: string): PaperPreset {
  return (
    PAPER_PRESETS.find((paper) => paper.id === id) ??
    PAPER_PRESETS.find((paper) => paper.id === DEFAULT_PAPER_PRESET_ID)!
  );
}

function gridCount(
  paper: PaperPreset,
  widthMm: number,
  heightMm: number,
): { columns: number; rows: number; copies: number } {
  const usableW = Math.max(0, paper.widthMm - paper.marginMm * 2);
  const usableH = Math.max(0, paper.heightMm - paper.marginMm * 2);
  const columns = Math.max(0, Math.floor((usableW + paper.gapMm) / (widthMm + paper.gapMm)));
  const rows = Math.max(0, Math.floor((usableH + paper.gapMm) / (heightMm + paper.gapMm)));
  return { columns, rows, copies: columns * rows };
}

/** Pack a sheet in both orientations and keep the higher-copy result.
 *  Ties prefer upright photos because they are easier to inspect. */
export function calculateSheetLayout(photo: IdPhotoSize, paper: PaperPreset): SheetLayout {
  const upright = gridCount(paper, photo.widthMm, photo.heightMm);
  const rotated = gridCount(paper, photo.heightMm, photo.widthMm);
  const useRotated = rotated.copies > upright.copies;
  const picked = useRotated ? rotated : upright;
  const slotW = useRotated ? photo.heightMm : photo.widthMm;
  const slotH = useRotated ? photo.widthMm : photo.heightMm;
  const gridW = picked.columns * slotW + Math.max(0, picked.columns - 1) * paper.gapMm;
  const gridH = picked.rows * slotH + Math.max(0, picked.rows - 1) * paper.gapMm;
  const startX = (paper.widthMm - gridW) / 2;
  const startY = (paper.heightMm - gridH) / 2;
  const slots: SheetSlot[] = [];
  for (let row = 0; row < picked.rows; row += 1) {
    for (let column = 0; column < picked.columns; column += 1) {
      slots.push({
        xMm: startX + column * (slotW + paper.gapMm),
        yMm: startY + row * (slotH + paper.gapMm),
        widthMm: slotW,
        heightMm: slotH,
      });
    }
  }
  return {
    paper,
    photo,
    rotated: useRotated,
    columns: picked.columns,
    rows: picked.rows,
    copies: picked.copies,
    slots,
  };
}

export function largestCenteredCrop(imageWidth: number, imageHeight: number, aspect: number): Rect {
  const safeW = Math.max(1, imageWidth);
  const safeH = Math.max(1, imageHeight);
  const safeAspect = Math.max(0.01, aspect);
  const imageAspect = safeW / safeH;
  const width = imageAspect > safeAspect ? safeH * safeAspect : safeW;
  const height = width / safeAspect;
  return { x: (safeW - width) / 2, y: (safeH - height) / 2, w: width, h: height };
}

export function clampCrop(rect: Rect, imageWidth: number, imageHeight: number): Rect {
  const width = Math.min(Math.max(1, rect.w), Math.max(1, imageWidth));
  const height = Math.min(Math.max(1, rect.h), Math.max(1, imageHeight));
  return {
    x: Math.max(0, Math.min(imageWidth - width, rect.x)),
    y: Math.max(0, Math.min(imageHeight - height, rect.y)),
    w: width,
    h: height,
  };
}

export function cropPosition(rect: Rect, imageWidth: number, imageHeight: number) {
  const travelX = Math.max(0, imageWidth - rect.w);
  const travelY = Math.max(0, imageHeight - rect.h);
  return {
    x: travelX > 0 ? rect.x / travelX : 0.5,
    y: travelY > 0 ? rect.y / travelY : 0.5,
  };
}

export function moveCrop(
  rect: Rect,
  imageWidth: number,
  imageHeight: number,
  x: number,
  y: number,
): Rect {
  return {
    ...rect,
    x: Math.max(0, imageWidth - rect.w) * Math.min(1, Math.max(0, x)),
    y: Math.max(0, imageHeight - rect.h) * Math.min(1, Math.max(0, y)),
  };
}

/** 0 = widest possible crop, 1 = 3× zoom, preserving centre. */
export function zoomCrop(
  rect: Rect,
  imageWidth: number,
  imageHeight: number,
  aspect: number,
  zoom: number,
): Rect {
  const maxCrop = largestCenteredCrop(imageWidth, imageHeight, aspect);
  const scale = 1 - Math.min(1, Math.max(0, zoom)) * (2 / 3);
  const width = maxCrop.w * scale;
  const height = width / aspect;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return clampCrop(
    { x: cx - width / 2, y: cy - height / 2, w: width, h: height },
    imageWidth,
    imageHeight,
  );
}

export function cropZoom(
  rect: Rect,
  imageWidth: number,
  imageHeight: number,
  aspect: number,
): number {
  const maxCrop = largestCenteredCrop(imageWidth, imageHeight, aspect);
  const scale = Math.min(1, Math.max(1 / 3, rect.w / maxCrop.w));
  return (1 - scale) / (2 / 3);
}

function mmToPx(mm: number, dpi: number): number {
  return (mm * dpi) / 25.4;
}

/** Corner-only cut marks in any shared unit (millimetres for preview,
 * pixels for the output canvas). Keeping the geometry unit-agnostic
 * ensures the editor preview and generated sheet stay identical. */
export function cutGuideSegments(
  width: number,
  height: number,
  requestedLength: number,
): readonly CutGuideSegment[] {
  const length = Math.max(0, Math.min(requestedLength, width / 2, height / 2));
  return [
    { x1: 0, y1: length, x2: 0, y2: 0 },
    { x1: 0, y1: 0, x2: length, y2: 0 },
    { x1: width - length, y1: 0, x2: width, y2: 0 },
    { x1: width, y1: 0, x2: width, y2: length },
    { x1: width, y1: height - length, x2: width, y2: height },
    { x1: width, y1: height, x2: width - length, y2: height },
    { x1: length, y1: height, x2: 0, y2: height },
    { x1: 0, y1: height, x2: 0, y2: height - length },
  ];
}

export function renderIdPhotoSheet(
  source: HTMLCanvasElement,
  crop: Rect,
  layout: SheetLayout,
  drawCutLines: boolean,
  dpi = ID_PHOTO_DPI,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(mmToPx(layout.paper.widthMm, dpi)));
  canvas.height = Math.max(1, Math.round(mmToPx(layout.paper.heightMm, dpi)));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The browser could not create the print sheet.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  for (const slot of layout.slots) {
    const x = mmToPx(slot.xMm, dpi);
    const y = mmToPx(slot.yMm, dpi);
    const width = mmToPx(slot.widthMm, dpi);
    const height = mmToPx(slot.heightMm, dpi);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    if (layout.rotated) {
      ctx.translate(x + width / 2, y + height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, -height / 2, -width / 2, height, width);
    } else {
      ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, x, y, width, height);
    }
    ctx.restore();
    if (drawCutLines) drawCutGuide(ctx, x, y, width, height, dpi);
  }
  return canvas;
}

function drawCutGuide(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  dpi: number,
) {
  const line = Math.max(1, mmToPx(0.12, dpi));
  const length = Math.max(4, mmToPx(2, dpi));
  const segments = cutGuideSegments(width, height, length);
  ctx.save();
  ctx.strokeStyle = "rgba(20, 18, 16, 0.72)";
  ctx.lineWidth = line;
  ctx.beginPath();
  for (const segment of segments) {
    ctx.moveTo(x + segment.x1, y + segment.y1);
    ctx.lineTo(x + segment.x2, y + segment.y2);
  }
  ctx.stroke();
  ctx.restore();
}

export function renderCropThumbnail(source: HTMLCanvasElement, crop: Rect, width = 160): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(1, Math.round(width * (crop.h / crop.w)));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  // ID sheets are printed on opaque paper. Flatten transparent
  // cutouts against white before JPEG encoding so the preview matches
  // the final sheet instead of turning transparent pixels black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.84);
}

function ascii(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) out[i] = value.charCodeAt(i) & 0xff;
  return out;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Build a one-page PDF with an exact MediaBox and a full-page JPEG.
 *  Keeping this tiny avoids shipping a PDF dependency for one image. */
export function buildSinglePagePdf(
  jpeg: Uint8Array,
  pixelWidth: number,
  pixelHeight: number,
  widthMm: number,
  heightMm: number,
): Uint8Array {
  const widthPt = ((widthMm * 72) / 25.4).toFixed(4);
  const heightPt = ((heightMm * 72) / 25.4).toFixed(4);
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let length = 0;
  const push = (chunk: Uint8Array) => {
    chunks.push(chunk);
    length += chunk.length;
  };
  const pushText = (value: string) => push(ascii(value));
  const object = (number: number, body: string) => {
    offsets[number] = length;
    pushText(`${number} 0 obj\n${body}\nendobj\n`);
  };

  push(
    new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xff, 0xff, 0xff, 0xff, 0x0a,
    ]),
  );
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  offsets[4] = length;
  pushText(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  pushText("\nendstream\nendobj\n");
  const content = `q\n${widthPt} 0 0 ${heightPt} 0 0 cm\n/Im0 Do\nQ\n`;
  object(5, `<< /Length ${content.length} >>\nstream\n${content}endstream`);

  const xrefOffset = length;
  pushText("xref\n0 6\n0000000000 65535 f \n");
  for (let number = 1; number <= 5; number += 1) {
    pushText(`${String(offsets[number] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return concatBytes(chunks);
}

export async function sheetToPdfBlob(sheet: HTMLCanvasElement, paper: PaperPreset): Promise<Blob> {
  const jpegBlob = await new Promise<Blob | null>((resolve) =>
    sheet.toBlob((blob) => resolve(blob), "image/jpeg", 0.96),
  );
  if (!jpegBlob) throw new Error("The browser could not encode the print sheet.");
  const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdf = buildSinglePagePdf(jpeg, sheet.width, sheet.height, paper.widthMm, paper.heightMm);
  const buffer = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength);
  return new Blob([buffer as ArrayBuffer], { type: "application/pdf" });
}
