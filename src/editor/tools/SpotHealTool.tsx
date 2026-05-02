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
      const ringMin = radius;
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
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const dx = x + sx - cx;
          const dy = y + sy - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < ringMin || dist > ringMax) continue;
          const i = (y * sw + x) * 4;
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

      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const dx = x + sx - cx;
          const dy = y + sy - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > radius + feather) continue;
          const i = (y * sw + x) * 4;
          const t = dist <= radius ? 1 : Math.max(0, 1 - (dist - radius) / feather);
          const cur = [px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0];
          px[i] = cur[0] * (1 - t) + r * t;
          px[i + 1] = cur[1] * (1 - t) + g * t;
          px[i + 2] = cur[2] * (1 - t) + b * t;
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
