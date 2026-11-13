/* xerox.js: the photocopied look shared by the results films (Act 1 docs/results, Act 2 docs/reveal).
   Brand book: photocopied, not photographed. Halftone plates (PNG, made offline), the portal home page's eye
   (.reye in Styles.html) painted in canvas, their eye-scan photo in black and white, hand-inked brush marks,
   CCTV scanlines. Every function takes the 2D context it draws on. */
import { rng } from './ink.js?v=3';

/* a plate image, loaded once */
const plates = {};
export function plate(src) { if (!plates[src]) { const i = new Image(); i.src = src; plates[src] = i; } return plates[src]; }
export const ready = img => img.complete && img.naturalWidth > 0;

/* the monitor's scanlines, one pattern per context */
const scans = new WeakMap();
export function scanPattern(g) {
  if (scans.has(g)) return scans.get(g);
  const s = document.createElement('canvas'); s.width = 4; s.height = 3; const c = s.getContext('2d'); c.fillStyle = 'rgba(0,0,0,.32)'; c.fillRect(0, 0, 4, 1);
  const p = g.createPattern(s, 'repeat'); scans.set(g, p); return p;
}
/* CCTV monitor: a cold tint (multiply), scanlines, a rolling bright band */
export function monitor(g, x, y, w, h, t, tint, still) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  if (tint) { g.globalCompositeOperation = 'multiply'; g.fillStyle = tint; g.fillRect(x, y, w, h); g.globalCompositeOperation = 'source-over'; }
  g.fillStyle = scanPattern(g); g.fillRect(x, y, w, h);
  if (!still) { const by = y + ((t * .22) % 1) * (h + 80) - 40, gr = g.createLinearGradient(0, by - 30, 0, by + 30);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.07)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, by - 30, w, 60); }
  g.restore();
}
export function vignette(g, x, y, w, h, a) {
  const cx = x + w / 2, cy = y + h / 2, gr = g.createRadialGradient(cx, cy, Math.min(w, h) * .3, cx, cy, Math.hypot(w, h) * .62);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${a})`); g.save(); g.fillStyle = gr; g.fillRect(x, y, w, h); g.restore();
}
/* cover a w x h box at (x, y) with img, zoomed z toward image point (fx, fy); returns the mapping */
export function cover(img, x, y, w, h, z = 1, fx, fy) {
  const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1, s = Math.max(w / iw, h / ih) * z, dw = iw * s, dh = ih * s;
  fx = fx == null ? iw / 2 : fx; fy = fy == null ? ih / 2 : fy;
  let X = x + w / 2 - fx * s, Y = y + h / 2 - fy * s;
  X = Math.min(x, Math.max(x + w - dw, X)); Y = Math.min(y, Math.max(y + h - dh, Y));
  return { s, x: X, y: Y, w: dw, h: dh, P: (px, py) => [X + px * s, Y + py * s] };
}

/* their eye-scan photo in black and white, a little hard, like the home page's CCTV eyes (cached per image) */
const grays = new WeakMap();
export function grayPhoto(img) {
  if (!img) return null;
  if (grays.has(img)) return grays.get(img);
  const c = document.createElement('canvas'), k = Math.min(1, 900 / Math.max(img.width, img.height));
  c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
  try { const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) { let v = (p[i] * .3 + p[i + 1] * .59 + p[i + 2] * .11) / 255; v = Math.max(0, Math.min(1, (v - .5) * 1.3 + .47)); p[i] = p[i + 1] = p[i + 2] = v * 255; }
    g.putImageData(d, 0, 0); } catch (e) { /* can't read it: keep the colour */ }
  grays.set(img, c); return c;
}
export function drawPhoto(g, img, x, y, w, h) {   // cover the box with the photo
  const k = Math.max(w / img.width, h / img.height), dw = img.width * k, dh = img.height * k;
  g.drawImage(img, x + w / 2 - dw / 2, y + h / 2 - dh / 2, dw, dh);
}

/* the portal home page's eye (.reye), in grey. w = width of the whole eye box (2.1 : 1).
   o.pupil (share of the iris), o.px / o.py (-1..1, where it looks), o.open (0 shut .. 1 open) */
const BALL = [[0, 54], [7, 38], [18, 22], [33, 10], [50, 5], [66, 8], [81, 18], [93, 33], [100, 50], [93, 63], [81, 77], [66, 88], [50, 93], [34, 89], [19, 79], [7, 67]];
export function reye(g, cx, cy, w, o = {}) {
  const h = w / 2.1, x0 = cx - w / 2, y0 = cy - h / 2, pupil = o.pupil == null ? .26 : o.pupil, px = o.px || 0, py = o.py || 0, open = o.open == null ? 1 : o.open;
  g.save();
  let gr = g.createRadialGradient(cx, y0 + h * .58, 0, cx, y0 + h * .58, w * .55);   // skin
  gr.addColorStop(0, '#a9a9a9'); gr.addColorStop(.42, '#7d7d7d'); gr.addColorStop(.78, '#454545'); gr.addColorStop(1, '#141414');
  g.fillStyle = gr; g.fillRect(x0, y0, w, h);
  const bx = x0 + w * .09, by = y0 + h * .15, bw = w * .82, bh = h * .72, bc = [bx + bw / 2, by + bh / 2];
  const ballPath = () => { g.beginPath(); BALL.forEach(([u, v], i) => { const X = bx + bw * u / 100, Y = by + bh * v / 100; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); };
  if (open > .02) {
    g.save(); ballPath(); g.clip();
    gr = g.createRadialGradient(bc[0], by + bh * .48, 0, bc[0], by + bh * .48, bw * .5);   // sclera
    gr.addColorStop(0, '#f1f1f1'); gr.addColorStop(.48, '#dedede'); gr.addColorStop(.84, '#ababab'); gr.addColorStop(1, '#6f6f6f');
    g.fillStyle = gr; g.fillRect(bx, by, bw, bh);
    const vr = rng(5); g.strokeStyle = 'rgba(70,70,70,.35)'; g.lineWidth = Math.max(.6, w * .0018);   // veins
    for (let i = 0; i < 26; i++) { const an = vr() * Math.PI * 2, r0 = bw * (.2 + vr() * .05), r1 = bw * (.42 + vr() * .1);
      g.beginPath(); g.moveTo(bc[0] + Math.cos(an) * r1, bc[1] + Math.sin(an) * r1 * .6);
      g.quadraticCurveTo(bc[0] + Math.cos(an + .15) * (r0 + r1) / 2, bc[1] + Math.sin(an + .15) * (r0 + r1) / 2 * .6, bc[0] + Math.cos(an) * r0, bc[1] + Math.sin(an) * r0 * .6); g.stroke(); }
    const ir = bw * .37 / 2, ix = bc[0] + px * bw * .12, iy = bc[1] + py * bh * .2;   // iris
    if (g.createConicGradient) { const cg = g.createConicGradient(.14, ix, iy); for (let k = 0; k <= 40; k++) cg.addColorStop(k / 40, ['#7b7b7b', '#454545', '#9b9b9b', '#565656'][k % 4]); g.fillStyle = cg; }
    else g.fillStyle = '#5e5e5e';
    g.beginPath(); g.arc(ix, iy, ir, 0, 7); g.fill();
    gr = g.createRadialGradient(ix, iy, 0, ix, iy, ir); gr.addColorStop(.34, 'rgba(0,0,0,0)'); gr.addColorStop(.86, 'rgba(0,0,0,.6)'); gr.addColorStop(.95, '#050505'); gr.addColorStop(1, 'rgba(5,5,5,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(ix, iy, ir, 0, 7); g.fill();
    const pr = ir * Math.min(pupil, 4);   // the pupil (past the iris it swallows the eye)
    gr = g.createRadialGradient(ix, iy, 0, ix, iy, pr + ir * .07); gr.addColorStop(0, '#000'); gr.addColorStop(pr / (pr + ir * .07), '#000'); gr.addColorStop(1, 'rgba(10,8,6,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(ix, iy, pr + ir * .07, 0, 7); g.fill();
    if (pupil < 1) { g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.arc(ix - ir * .28, iy - ir * .36, ir * .1, 0, 7); g.fill();   // the wet highlight
      g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.arc(ix + ir * .22, iy + ir * .28, ir * .06, 0, 7); g.fill(); }
    gr = g.createLinearGradient(0, by, 0, by + bh);   // the lid's shadow
    gr.addColorStop(0, 'rgba(0,0,0,.62)'); gr.addColorStop(.24, 'rgba(0,0,0,.16)'); gr.addColorStop(.42, 'rgba(0,0,0,0)'); gr.addColorStop(.78, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.38)');
    g.fillStyle = gr; g.fillRect(bx, by, bw, bh);
    g.restore();
  }
  if (open < 1) {   // the upper lid comes down over the ball (skin-coloured, with a dark lash line)
    const lidY = by + bh * open * .98, sk = g.createLinearGradient(0, by, 0, lidY + 2);
    sk.addColorStop(0, '#5a5a5a'); sk.addColorStop(1, '#8a8a8a');
    g.save(); ballPath(); g.clip(); g.fillStyle = sk; g.fillRect(bx - 2, by - 2, bw + 4, lidY - by + 2);
    g.strokeStyle = '#141414'; g.lineWidth = Math.max(1.2, w * .012); g.beginPath();
    for (let i = 0; i <= 20; i++) { const u = i / 20, X = bx + bw * u, Y = lidY + Math.sin(u * Math.PI) * bh * .06 * (1 - open); i ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke(); g.restore();
  }
  g.save(); g.globalAlpha = .55; g.fillStyle = scanPattern(g); g.fillRect(x0, y0, w, h); g.restore();   // the monitor's lines
  g.restore();
}

/* hand-inked brush: several bristles, dry gaps, ink at the ends; f changes the wobble (10 times a second) */
export function brush(g, pts, w, seed, col, a = 1, f = 0) {
  const r = rng(seed * 131 + f * 7), J = w * .35, P = pts.map(([x, y]) => [x + (r() - .5) * J, y + (r() - .5) * J]);
  g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let k = 0; k < 5; k++) {
    const off = (k - 2) * w * .16; g.globalAlpha = a * (.55 + r() * .45); g.lineWidth = w * (.28 + r() * .3); g.beginPath();
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[i + 1], L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / L, ny = (x1 - x0) / L, steps = Math.max(2, Math.ceil(L / (w * 1.2)));
      for (let s = 0; s <= steps; s++) { const q = s / steps, x = x0 + (x1 - x0) * q + nx * (off + (r() - .5) * w * .12), y = y0 + (y1 - y0) * q + ny * (off + (r() - .5) * w * .12);
        if ((r() < .06 && k !== 2) || (s === 0 && i === 0)) g.moveTo(x, y); else g.lineTo(x, y); }
    }
    g.stroke();
  }
  g.globalAlpha = a * .9; [P[0], P[P.length - 1]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, w * (.25 + r() * .2), 0, 7); g.fill(); });
  g.restore();
}
/* a manila folder cover, printed: card colour, halftone dots, worn edges (one canvas, made once) */
let manila = null;
export function manilaCard() {
  if (manila) return manila;
  const c = document.createElement('canvas'); c.width = 700; c.height = 980; const g = c.getContext('2d'), r = rng(9);
  g.fillStyle = '#c8ad74'; g.fillRect(0, 0, 700, 980);
  g.fillStyle = 'rgba(40,28,10,.22)';
  for (let y = 0; y < 980; y += 7) for (let x = (y / 7) % 2 ? 3.5 : 0; x < 700; x += 7) { const d = .6 + r() * 1.6; g.beginPath(); g.arc(x, y, d, 0, 7); g.fill(); }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(30,20,8,${.05 + r() * .2})`; g.fillRect(r() * 700, r() * 980, 1 + r() * 3, 1 + r() * 2); }
  const e = g.createLinearGradient(0, 0, 700, 0); e.addColorStop(0, 'rgba(60,40,10,.35)'); e.addColorStop(.08, 'rgba(0,0,0,0)'); e.addColorStop(.92, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(60,40,10,.3)');
  g.fillStyle = e; g.fillRect(0, 0, 700, 980);
  return (manila = c);
}
/* map image point A to screen point B with an affine that sends the image's edge vectors U, V2 to screen vectors PU, PV */
export function affine(g, A, U, V2, B, PU, PV) {
  const det = U[0] * V2[1] - U[1] * V2[0], i00 = V2[1] / det, i01 = -V2[0] / det, i10 = -U[1] / det, i11 = U[0] / det;
  const a = PU[0] * i00 + PV[0] * i10, b = PU[1] * i00 + PV[1] * i10, c = PU[0] * i01 + PV[0] * i11, d = PU[1] * i01 + PV[1] * i11;
  g.transform(a, b, c, d, B[0] - (a * A[0] + c * A[1]), B[1] - (b * A[0] + d * A[1]));
}
/* the eye with feathered edges (an oval vignette), for an eye that peers out of the dark */
export function softEye(g, cx, cy, w, o = {}, feather = .4) {
  const h = w / 2.1, dpr = Math.min(2, window.devicePixelRatio || 1), c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w * dpr)); c.height = Math.max(2, Math.ceil(h * dpr));
  const e = c.getContext('2d'); e.scale(dpr, dpr); reye(e, w / 2, h / 2, w, o);
  e.globalCompositeOperation = 'destination-in'; e.translate(w / 2, h / 2); e.scale(1, h / w);
  const gr = e.createRadialGradient(0, 0, w * .5 * (1 - feather), 0, 0, w * .5); gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  e.fillStyle = gr; e.fillRect(-w / 2, -w / 2, w, w);
  g.drawImage(c, cx - w / 2, cy - h / 2, w, h);
}
/* draw a plate at (0, 0) in the current transform, plus mirrored copies all around it, so a plate smaller than a wide
   screen never shows its edge (the mirror makes every seam continuous) */
export function plateMirrored(g, img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    g.save(); g.translate(dx === 1 ? 2 * w : 0, dy === 1 ? 2 * h : 0); g.scale(dx ? -1 : 1, dy ? -1 : 1); g.drawImage(img, 0, 0); g.restore();
  }
}
