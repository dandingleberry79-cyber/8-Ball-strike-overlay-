import React, { useRef, useState } from 'react';

type DetectedBall = {
  id: number;
  x: number; // 0-1000 relative to image width
  y: number; // 0-1000 relative to image height
  color: string;
  label: string;
  isCue: boolean;
  isEight: boolean;
  size: number;
};

type Candidate = {
  ball: DetectedBall;
  pocket: number;
  pocketName: string;
  points: number;
  power: number;
  cutDeg: number;
  distance: number;
  blocked: boolean;
  reason: string;
};

const POCKETS = [
  { name: 'Top Left', x: 30, y: 30 },
  { name: 'Top Mid', x: 500, y: 20 },
  { name: 'Top Right', x: 970, y: 30 },
  { name: 'Bot Left', x: 30, y: 970 },
  { name: 'Bot Mid', x: 500, y: 980 },
  { name: 'Bot Right', x: 970, y: 970 },
];

const COLORS: { name: string; rgb: [number, number, number]; nums: string }[] = [
  { name: 'Yellow', rgb: [234, 179, 8], nums: '1 / 9' },
  { name: 'Blue', rgb: [37, 99, 235], nums: '2 / 10' },
  { name: 'Red', rgb: [220, 38, 38], nums: '3 / 11' },
  { name: 'Purple', rgb: [147, 51, 234], nums: '4 / 12' },
  { name: 'Orange', rgb: [234, 88, 12], nums: '5 / 13' },
  { name: 'Green', rgb: [22, 163, 74], nums: '6 / 14' },
  { name: 'Maroon', rgb: [127, 29, 29], nums: '7 / 15' },
];

function classify(r: number, g: number, b: number): { label: string; isCue: boolean; isEight: boolean } {
  if (r > 200 && g > 200 && b > 200) return { label: 'Cue ball', isCue: true, isEight: false };
  if (r < 75 && g < 75 && b < 75) return { label: '8 ball', isCue: false, isEight: true };
  let best = COLORS[0];
  let bestD = Infinity;
  for (const c of COLORS) {
    const d = (r - c.rgb[0]) ** 2 + (g - c.rgb[1]) ** 2 + (b - c.rgb[2]) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return { label: `${best.name} (${best.nums})`, isCue: false, isEight: false };
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Points-first scoring, NOT fastest-win scoring.
// Base points for pocketing a ball, plus difficulty bonus for cut angle
// and distance, plus a bank-style bonus for harder geometry. The 8 ball
// is deprioritised unless it is the only ball left, because pocketing it
// early ends the round and stops further points.
function scoreShots(balls: DetectedBall[]): Candidate[] {
  const cue = balls.find((b) => b.isCue);
  if (!cue) return [];
  const targets = balls.filter((b) => !b.isCue);
  const out: Candidate[] = [];
  for (const ball of targets) {
    for (let pi = 0; pi < POCKETS.length; pi++) {
      const pocket = POCKETS[pi];
      const pDx = pocket.x - ball.x, pDy = pocket.y - ball.y;
      const pDist = Math.hypot(pDx, pDy);
      if (pDist < 30) continue;
      const pAngle = Math.atan2(pDy, pDx);
      const ghostX = ball.x - Math.cos(pAngle) * 28;
      const ghostY = ball.y - Math.sin(pAngle) * 28;
      const cueDist = Math.hypot(ghostX - cue.x, ghostY - cue.y);
      const cueAngle = Math.atan2(ghostY - cue.y, ghostX - cue.x);
      let cutDeg = Math.abs(((cueAngle - pAngle) * 180) / Math.PI);
      if (cutDeg > 180) cutDeg = 360 - cutDeg;
      if (cutDeg > 90) continue; // not a makeable cut
      const blocked = targets.some(
        (o) =>
          o.id !== ball.id &&
          (distToSegment(o.x, o.y, cue.x, cue.y, ghostX, ghostY) < 26 ||
            distToSegment(o.x, o.y, ball.x, ball.y, pocket.x, pocket.y) < 26)
      );
      const totalDist = cueDist + pDist;
      let points = 100;
      points += Math.round(cutDeg * 2); // harder cut = more points
      points += Math.round(totalDist / 12); // longer shot = more points
      if (cutDeg > 30) points += 50; // hard-cut bonus
      if (ball.isEight) {
        points = targets.length === 1 ? points + 200 : points - 200; // don't end the round early
      }
      if (blocked) points -= 150;
      const power = Math.max(20, Math.min(95, Math.round(totalDist / 14)));
      out.push({
        ball, pocket: pi, pocketName: pocket.name, points,
        power, cutDeg: Math.round(cutDeg), distance: Math.round(totalDist),
        blocked,
        reason: ball.isEight && targets.length > 1
          ? '8 ball held back — pocketing it early ends the round and stops points.'
          : blocked
          ? 'Path is partly blocked — check the line before shooting.'
          : cutDeg > 30
          ? 'Hard cut, high points.'
          : 'Clean, makeable shot.',
      });
    }
  }
  return out.sort((a, b) => b.points - a.points);
}

export default function ShotFinder() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [balls, setBalls] = useState<DetectedBall[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [status, setStatus] = useState('Take a screenshot of the table, upload it here, and this will read the ball positions and recommend the highest-points shot.');
  const [tapMode, setTapMode] = useState<'cue' | 'target' | null>(null);

  const drawOverlay = (found: DetectedBall[], best: Candidate | null, url: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const sx = img.width / 1000, sy = img.height / 1000;
      for (const b of found) {
        ctx.beginPath();
        ctx.arc(b.x * sx, b.y * sy, 18 * sx, 0, Math.PI * 2);
        ctx.strokeStyle = b.isCue ? '#ffffff' : b.isEight ? '#facc15' : '#34d399';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(b.label, b.x * sx + 22, b.y * sy);
      }
      if (best) {
        const pocket = POCKETS[best.pocket];
        const cue = found.find((b) => b.isCue);
        if (cue) {
          const pAngle = Math.atan2(pocket.y - best.ball.y, pocket.x - best.ball.x);
          const gx = best.ball.x - Math.cos(pAngle) * 28;
          const gy = best.ball.y - Math.sin(pAngle) * 28;
          ctx.strokeStyle = 'rgba(59,130,246,0.95)';
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 5]);
          ctx.beginPath(); ctx.moveTo(cue.x * sx, cue.y * sy); ctx.lineTo(gx * sx, gy * sy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = 'rgba(239,68,68,0.95)';
          ctx.beginPath(); ctx.moveTo(best.ball.x * sx, best.ball.y * sy); ctx.lineTo(pocket.x * sx, pocket.y * sy); ctx.stroke();
          ctx.beginPath(); ctx.arc(gx * sx, gy * sy, 16 * sx, 0, Math.PI * 2);
          ctx.strokeStyle = '#60a5fa'; ctx.stroke();
        }
      }
    };
    img.src = url;
  };

  const handleFile = (file: File) => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    setStatus('Reading screenshot…');
    const img = new Image();
    img.onload = () => {
      const maxW = 900;
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      const ctx = off.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      // Find felt bounding box: green-dominant pixels.
      let minX = w, maxX = 0, minY = h, maxY = 0;
      const isGreen = (i: number) => {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        return g > r + 20 && g > b + 10 && g > 55;
      };
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          if (isGreen((y * w + x) * 4)) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX <= minX) {
        setStatus('Could not find the green table in this screenshot. Try a clearer, straight-on shot of the full table.');
        setBalls([]); setCandidates([]);
        return;
      }
      const insetX = (maxX - minX) * 0.04, insetY = (maxY - minY) * 0.04;
      type Cluster = { sx: number; sy: number; n: number; r: number; g: number; b: number };
      const clusters: Cluster[] = [];
      for (let y = minY + insetY; y < maxY - insetY; y += 3) {
        for (let x = minX + insetX; x < maxX - insetX; x += 3) {
          const i = (Math.round(y) * w + Math.round(x)) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (isGreen(i)) continue;
          // Skip near-black pockets / rail shadows inside the felt box edges.
          if (r < 30 && g < 30 && b < 30) continue;
          const rx = ((x - minX) / (maxX - minX)) * 1000;
          const ry = ((y - minY) / (maxY - minY)) * 1000;
          let foundC: Cluster | null = null;
          for (const c of clusters) {
            const cx = c.sx / c.n, cy = c.sy / c.n;
            if (Math.hypot(rx - cx, ry - cy) < 32) { foundC = c; break; }
          }
          if (foundC) {
            foundC.sx += rx; foundC.sy += ry; foundC.n += 1;
            foundC.r += r; foundC.g += g; foundC.b += b;
          } else {
            clusters.push({ sx: rx, sy: ry, n: 1, r, g, b });
          }
        }
      }
      const found: DetectedBall[] = clusters
        .filter((c) => c.n >= 6)
        .sort((a, b) => b.n - a.n)
        .slice(0, 16)
        .map((c, idx) => {
          const cls = classify(Math.round(c.r / c.n), Math.round(c.g / c.n), Math.round(c.b / c.n));
          return {
            id: idx, x: c.sx / c.n, y: c.sy / c.n,
            color: `rgb(${Math.round(c.r / c.n)},${Math.round(c.g / c.n)},${Math.round(c.b / c.n)})`,
            label: cls.label, isCue: cls.isCue, isEight: cls.isEight, size: c.n,
          };
        });
      // If no white cue was found, keep the brightest cluster as cue candidate is left to tap-correction.
      const scored = scoreShots(found);
      setBalls(found);
      setCandidates(scored);
      drawOverlay(found, scored[0] || null, url);
      if (!found.find((b) => b.isCue)) {
        setStatus(`Found ${found.length} balls, but no cue ball detected. Tap "Tap to set cue" below, then tap the cue ball on the image.`);
      } else if (scored.length === 0) {
        setStatus(`Found ${found.length} balls, but no makeable shot scored. Check the table framing.`);
      } else {
        setStatus(`Found ${found.length} balls. Best points shot: ${scored[0].ball.label} → ${scored[0].pocketName} (${scored[0].points} pts, ${scored[0].power}% power).`);
      }
    };
    img.src = url;
  };

  const handleCanvasTap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!tapMode || !imgUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 1000;
    let next = [...balls];
    if (tapMode === 'cue') {
      next = next.map((b) => ({ ...b, isCue: false, label: b.isCue ? 'White (?)' : b.label }));
      next.push({ id: next.length, x, y, color: '#ffffff', label: 'Cue ball', isCue: true, isEight: false, size: 10 });
    } else {
      // Replace nearest detected ball with a corrected target position, keeping its label.
      let nearest: DetectedBall | null = null; let bestD = Infinity;
      for (const b of next) {
        if (b.isCue) continue;
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < bestD) { bestD = d; nearest = b; }
      }
      if (nearest) next = next.map((b) => (b.id === nearest!.id ? { ...b, x, y } : b));
    }
    const scored = scoreShots(next);
    setBalls(next); setCandidates(scored);
    drawOverlay(next, scored[0] || null, imgUrl);
    setTapMode(null);
    setStatus(scored.length ? `Corrected. Best points shot: ${scored[0].ball.label} → ${scored[0].pocketName} (${scored[0].points} pts).` : 'Corrected, but no shot scored yet.');
  };

  const best = candidates[0];
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
        <h3 className="text-sm font-bold text-white">Round Scan — screenshot → ball positions → best points shot</h3>
        <p className="text-xs text-slate-400 mt-1">Goal is most points, not fastest win. Harder cuts and longer shots score higher, and the 8 ball is held back unless it is the last ball left.</p>
        <label className="mt-3 inline-block px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl cursor-pointer">
          Upload round screenshot
          <input type="file" className="hidden" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </label>
        <p className="text-xs text-slate-300 mt-3">{status}</p>
      </div>

      {imgUrl && (
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
          <canvas ref={canvasRef} onClick={handleCanvasTap} className="w-full rounded-xl cursor-crosshair" />
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={() => setTapMode('cue')} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-xl">Tap to set cue ball</button>
            <button onClick={() => setTapMode('target')} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-xl">Tap to correct a ball position</button>
            {tapMode && <span className="text-xs text-emerald-400 self-center">Now tap the image ({tapMode}).</span>}
          </div>
          <div className="text-xs text-slate-300 mt-3">
            Detected: {balls.length ? balls.map((b) => b.label).join(', ') : 'none yet'}
          </div>
        </div>
      )}

      {best && (
        <div className="bg-emerald-950/60 border border-emerald-800 rounded-2xl p-4">
          <h4 className="text-sm font-bold text-white">Recommended shot — most points</h4>
          <p className="text-sm text-slate-200 mt-1">{best.ball.label} → {best.pocketName} pocket</p>
          <p className="text-xs text-slate-300">Points: {best.points} · Power: {best.power}% · Cut: {best.cutDeg}° · {best.reason}</p>
          <h5 className="text-xs font-bold text-slate-300 mt-3">Next best</h5>
          <ul className="text-xs text-slate-300 list-disc pl-5">
            {candidates.slice(1, 4).map((c, i) => (
              <li key={i}>{c.ball.label} → {c.pocketName} · {c.points} pts · {c.power}% power{c.blocked ? ' · blocked' : ''}</li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-400 mt-3">Detection is colour-based and approximate — stripe vs solid numbers with the same colour are shown as both (e.g. 1 / 9). If a ball is missed, tap to correct it and the recommendation updates. Point values are a practice proxy until the game's exact table is confirmed.</p>
        </div>
      )}
    </div>
  );
}
