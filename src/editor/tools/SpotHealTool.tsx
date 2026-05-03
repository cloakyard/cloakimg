// SpotHealTool.tsx — Click on a blemish to replace a circular region
// with the average color from the surrounding ring, feathered at the
// edge so the patch blends in.
//
// While Spot heal is active, the system cursor is hidden inside the
// canvas and replaced with a live ring sized to the brush slider, so
// the user can see exactly what will be healed before clicking.

import { useCallback, useState } from "react";
import { useEditor } from "../EditorContext";
import type { ImagePoint, Transform } from "../ImageCanvas";
import { useStageProps } from "../StageHost";

export function SpotHealTool() {
  const { doc, toolState, commit } = useEditor();
  const [hover, setHover] = useState<{ x: number; y: number; inside: boolean } | null>(null);

  const heal = useCallback(
    (p: ImagePoint) => {
      if (!doc || !p.inside) return;
      const ctx = doc.working.getContext("2d");
      if (!ctx) return;
      const radius = Math.max(4, toolState.brushSize * 100);
      const feather = Math.max(0.5, toolState.feather * 30);
      const ringMax = radius + feather + 4;
      const cx = Math.round(p.x);
      const cy = Math.round(p.y);
      const sampleSize = Math.ceil(ringMax) * 2;
      const sx = Math.max(0, cx - Math.ceil(ringMax));
      const sy = Math.max(0, cy - Math.ceil(ringMax));
      const sw = Math.min(doc.width - sx, sampleSize);
      const sh = Math.min(doc.height - sy, sampleSize);
      if (sw < 4 || sh < 4) return;
      const data = ctx.getImageData(sx, sy, sw, sh);
      const px = data.data;
      // Stay in squared-distance space everywhere we just need to
      // compare distances — sqrt per pixel was the dominant cost on a
      // big-brush click over a 24 MP photo.
      const ringMin2 = radius * radius;
      const ringMax2 = ringMax * ringMax;
      const outer = radius + feather;
      const outer2 = outer * outer;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = 0; y < sh; y++) {
        const dy = y + sy - cy;
        const dy2 = dy * dy;
        const rowBase = y * sw;
        for (let x = 0; x < sw; x++) {
          const dx = x + sx - cx;
          const d2 = dx * dx + dy2;
          if (d2 < ringMin2 || d2 > ringMax2) continue;
          const i = (rowBase + x) * 4;
          r += px[i] ?? 0;
          g += px[i + 1] ?? 0;
          b += px[i + 2] ?? 0;
          n += 1;
        }
      }
      if (n === 0) return;
      r /= n;
      g /= n;
      b /= n;

      // Inside the inner radius we hard-replace; in the feather band we
      // need a real distance to weight the blend, so sqrt only fires
      // for the band's pixels (a tiny sliver of the work).
      const r2 = radius * radius;
      for (let y = 0; y < sh; y++) {
        const dy = y + sy - cy;
        const dy2 = dy * dy;
        const rowBase = y * sw;
        for (let x = 0; x < sw; x++) {
          const dx = x + sx - cx;
          const d2 = dx * dx + dy2;
          if (d2 > outer2) continue;
          const i = (rowBase + x) * 4;
          let t: number;
          if (d2 <= r2) {
            t = 1;
          } else {
            const dist = Math.sqrt(d2);
            t = Math.max(0, 1 - (dist - radius) / feather);
          }
          const inv = 1 - t;
          const cr = px[i] ?? 0;
          const cg = px[i + 1] ?? 0;
          const cb = px[i + 2] ?? 0;
          px[i] = cr * inv + r * t;
          px[i + 1] = cg * inv + g * t;
          px[i + 2] = cb * inv + b * t;
        }
      }
      ctx.putImageData(data, sx, sy);
      commit("Spot heal");
    },
    [commit, doc, toolState.brushSize, toolState.feather],
  );

  const onMove = useCallback((p: ImagePoint) => {
    setHover({ x: p.x, y: p.y, inside: p.inside });
  }, []);

  const onLeave = useCallback(() => {
    setHover(null);
  }, []);

  const paintOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      if (!hover?.inside) return;
      const radius = Math.max(4, toolState.brushSize * 100);
      const feather = Math.max(0.5, toolState.feather * 30);
      const sx = t.ox + hover.x * t.scale;
      const sy = t.oy + hover.y * t.scale;
      const sr = radius * t.scale;
      const sf = (radius + feather) * t.scale;
      ctx.save();
      // Outer feather ring (dashed).
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(sx, sy, sf, 0, Math.PI * 2);
      ctx.stroke();
      // Inner solid ring at the heal radius — the actual replacement zone.
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.stroke();
      // Center crosshair pip.
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
    [hover, toolState.brushSize, toolState.feather],
  );

  useStageProps({
    paintOverlay,
    onImagePointerDown: heal,
    onImagePointerMove: onMove,
    onImagePointerUp: onLeave,
    cursor: "none",
  });
  return null;
}
