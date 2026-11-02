/*
  Eyes on LEADS: shared drawing + soundtrack loader for the results films (GitHub Pages, no libraries).
    docs/results/  Act 1 "Tape found", the public page the acceptance email links to: a found tape, a CCTV hall, an eye
                   that walks up to the camera, then the LEADS eye and the way into the portal.
    docs/reveal/   Act 2 "The file", inside the portal (only for an accepted applicant): a desk under a swinging lamp,
                   the photo that looks back, the mirror, the intake form and the stamp.
  The look is a found VHS tape: a near-black field, thin chalk / dried-red lines that "boil" (every line is redrawn a
  little differently 10 times a second, like stop motion), tape tears, a rolling tracking band, grain and scanlines.
  Bright red (#e50000) is only the LEADS eye's iris and the ACCEPTED stamp. No eye inside a triangle.
  Everything is a function of the film time t, so ?at=<seconds> freezes any frame. One 2D canvas per page; the only
  other canvases are small scratch buffers for tears and the grain tile. Sound is one pre-mixed file per act.
*/

/* the palette (SPEC 1): nothing else is drawn */
export const PAL = {
  black: '#070606', oxblood: '#3a0806', red: '#7a120c', chalk: '#e6e0d4', cctv: '#8b97a4', blue: '#2b4a86',
  lamp: '#d8b787', manila: '#a8936b', brand: '#e50000', card: '#000ff0'
};
export const FPS = 10;   // the boil rate: lines change 10 times a second, motion stays smooth
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* seeded random, so every playback draws the same film */
export function rng(seed) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
export const boilFrame = (t, fps = FPS) => reduced ? 0 : Math.floor(t * fps + 1e-6);
export function boil(id, frame) { const r = rng(id * 977 + frame * 7919 + 13); r(); r(); return r; }   // same shape + same frame = same wobble
export const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
export const span = (t, a, b) => ease((t - a) / (b - a));
export const lerp = (a, b, k) => a + (b - a) * k;

const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const rgba = (h, a) => { const c = rgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
export function mix(a, b, k) {
  const p = rgb(a), q = rgb(b);
  return '#' + p.map((v, i) => Math.round(v + (q[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

/* one multiplier for everything drawn, so a whole shot can fade (lamp dips, reduced-motion crossfades) */
export const layer = { a: 1 };
const ga = a => (a == null ? 1 : a) * layer.a;
export function fadeIn(s, k, draw) {   // draw a shot over what is there, k 0..1 (the field goes with it)
  if (!(k > 0)) return;
  s.ctx.save(); s.ctx.globalAlpha = k; s.ctx.fillStyle = PAL.black; s.ctx.fillRect(0, 0, s.W, s.H); s.ctx.restore();
  layer.a = k; draw(); layer.a = 1;
}

/* ------------------------------------------------------------------ canvas */
export function stage(canvas) {
  const ctx = canvas.getContext('2d');
  const s = { canvas, ctx, W: 0, H: 0, dpr: 1, u: 0, lw: 2, jt: 1, osd: 14 };
  s.fit = () => {
    s.dpr = Math.min(window.devicePixelRatio || 1, 2);
    s.W = innerWidth; s.H = innerHeight;
    canvas.width = Math.round(s.W * s.dpr); canvas.height = Math.round(s.H * s.dpr);
    s.u = Math.min(s.W, s.H * 1.15);   // one unit that reads the same on a tall phone and a wide laptop
    s.lw = Math.max(1.5, Math.min(2.5, s.u * .0048));   // line width, css px
    s.jt = Math.max(.8, Math.min(1.6, s.u * .0032));    // boil jitter, css px
    s.osd = Math.max(13, Math.min(15, s.u * .036));
    s.vig = s.scan = null;
  };
  s.begin = color => { ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = color; ctx.fillRect(0, 0, s.W, s.H); };
  s.fit();
  return s;
}

/* ------------------------------------------------------------------ boiling lines */
let warpFn = null;
export const setWarp = fn => { warpFn = fn; };   // bends every line drawn after it (the hall around the eye); null turns it off

export function circ(cx, cy, rx, ry, n = 20) { const p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return p; }
export function almondPts(cx, cy, w, h, n = 12) {   // a lens with pointed corners; w is the half-width
  const p = [];
  for (let i = 0; i <= n; i++) { const x = -1 + 2 * i / n; p.push([cx + x * w, cy - h * (1 - x * x)]); }
  for (let i = n - 1; i > 0; i--) { const x = -1 + 2 * i / n; p.push([cx + x * w, cy + h * (1 - x * x)]); }
  return p;
}
function path(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); }

/* the one line routine: points in, a hand-drawn stroke out. The wobble is seeded by (id, boil frame).
   o: col, a, w (line width), amp (jitter), close, fill + fa (fill colour + alpha), dash */
export function wline(s, pts, id, b, o = {}) {
  const { ctx } = s, r = boil(id, b), amp = o.amp == null ? s.jt : o.amp, out = [];
  const m = o.close ? pts.length : pts.length - 1;
  for (let i = 0; i < m; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], k = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 56));
    for (let j = 0; j < k; j++) out.push([p[0] + (q[0] - p[0]) * j / k, p[1] + (q[1] - p[1]) * j / k]);
  }
  if (!o.close) out.push(pts[pts.length - 1]);
  ctx.beginPath();
  out.forEach((p, i) => {
    let x = p[0] + (r() - .5) * 2 * amp, y = p[1] + (r() - .5) * 2 * amp;
    if (warpFn) { const q = warpFn(x, y); x = q[0]; y = q[1]; }
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  if (o.close) ctx.closePath();
  if (o.fill) { ctx.globalAlpha = ga(o.fa); ctx.fillStyle = o.fill; ctx.fill(); }
  if (o.nostroke) return;
  ctx.globalAlpha = ga(o.a); ctx.strokeStyle = o.col || PAL.chalk; ctx.lineWidth = (o.w || s.lw) * (.8 + r() * .45);   // uneven pressure
  ctx.lineCap = ctx.lineJoin = 'round'; ctx.setLineDash(o.dash || []); ctx.stroke(); ctx.setLineDash([]);
}

/* text that boils a little (hand lettering, the OSD stays still) */
export function wtext(s, str, x, y, id, b, o = {}) {
  const { ctx } = s, r = boil(id, b), j = o.still ? 0 : s.jt * .6;
  ctx.globalAlpha = ga(o.a); ctx.fillStyle = o.col || PAL.chalk; ctx.font = o.font; ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
  ctx.fillText(str, x + (r() - .5) * 2 * j, y + (r() - .5) * 2 * j);
}
export function osd(s, str, x, y, a = .85) { wtext(s, str, x, y, 0, 0, { still: true, a, font: `${Math.round(s.osd)}px "JetBrains Mono", monospace` }); }

/* ------------------------------------------------------------------ the eyes */
/* the white eye (hand-drawn, chalk on black). w is the half-width. look -1..1. dil is the pupil as a fraction of the
   iris; over 1 it swallows what is around it. hr is the lid height as a fraction of w. */
export function partyEye(s, o) {
  const { ctx } = s, { cx, cy, w, look = { x: 0, y: 0 }, open = 1, id = 1, b = 0, dil = .45, fill = .16, a = 1, hr = .3, lw = 1.15 } = o;
  const h = w * hr * Math.max(.04, open), lid = almondPts(cx, cy, w, h);
  ctx.save(); ctx.globalAlpha = ga(a); ctx.fillStyle = PAL.black; path(ctx, lid); ctx.fill(); ctx.restore();   // cut out of what is behind it
  wline(s, lid, id, b, { close: true, fill: PAL.chalk, fa: fill * a, a, w: s.lw * lw });
  if (open > .12) {
    const px = cx + look.x * w * .42, py = cy + look.y * h * .35, ir = w * .26, pr = ir * dil, big = w > 24;
    ctx.save(); path(ctx, lid); ctx.clip();
    wline(s, circ(px, py, ir, ir, 18), id + 1, b, { close: true, a: a * .85, w: s.lw * lw });
    for (let i = 0; big && i < 10; i++) {   // iris strokes
      const an = i / 10 * 6.283 + .3, c = Math.cos(an), n = Math.sin(an);
      wline(s, [[px + c * pr * 1.1, py + n * pr * 1.1], [px + c * ir * .92, py + n * ir * .92]], id + 10 + i, b, { a: a * .5, w: s.lw * .7 });
    }
    if (dil <= 1) wline(s, circ(px, py, pr, pr, 14), id + 2, b, { close: true, fill: PAL.black, fa: a, a: a * .9 });
    ctx.restore();
    if (dil > 1) wline(s, circ(px, py, pr, pr, 48), id + 2, b, { close: true, fill: PAL.black, fa: a, a, w: s.lw * 1.5 });
  }
  if (w > 18 && open > .5) for (let i = 1; i < 13; i++) {   // lashes
    const x = -1 + 2 * i / 13, px = cx + x * w, py = cy - h * (1 - x * x);
    wline(s, [[px, py - h * .05], [px + x * w * .06, py - h * .05 - w * .07]], id + 30 + i, b, { a: a * .7, w: s.lw * .8 });
  }
}

/* the brand book's LEADS eye in the dark: oxblood lens, dried-red lines, typewriter letters, the iris behind the A.
   irisFill 0..1 pours the one bright red into the iris. open squashes it shut. */
export function wordEye(s, o) {
  const { ctx } = s, { cx, cy, w, open = 1, id = 1, b = 0, iris = { x: 0, y: 0 }, irisFill = 0, a = 1, years = true } = o;
  const h = w * .36, r = boil(id + 500, b), lid = almondPts(cx, cy, w, h, 14);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, Math.max(.02, open)); ctx.translate(-cx, -cy);
  for (let i = 0; i < 24; i++) {   // lashes above, a few drips below
    const x = -1 + 2 * (i + .5) / 24, px = cx + x * w * .96, py = cy - h * (1 - x * x) * .98;
    wline(s, [[px, py - h * .04], [px + x * w * .05, py - h * (.2 + r() * .2)]], id + 100 + i, b, { col: PAL.red, a: a * .9, w: s.lw * .9 });
  }
  for (let i = 0; i < 4; i++) { const x = -.6 + 1.2 * r(), px = cx + x * w, py = cy + h * (1 - x * x); wline(s, [[px, py + h * .04], [px, py + h * (.2 + r() * .35)]], id + 200 + i, b, { col: PAL.red, a: a * .8 }); }
  wline(s, lid, id, b, { close: true, fill: PAL.oxblood, fa: a, col: PAL.red, a, w: s.lw * 1.7 });
  ctx.save(); path(ctx, lid); ctx.clip();
  const ir = h * .78, ix = cx + iris.x * w * .45, iy = cy + iris.y * h * .3, ring = circ(ix, iy, ir, ir, 26);
  if (irisFill > 0) { ctx.globalAlpha = ga(irisFill * a); ctx.fillStyle = PAL.brand; path(ctx, ring); ctx.fill(); }   // the only bright red
  wline(s, ring, id + 1, b, { close: true, col: PAL.red, a, dash: [w * .012, w * .012] });
  ctx.restore();
  const word = 'LEADS', step = w * .3, k = Math.max(0, Math.min(1, (open - .35) * 2.5));
  ctx.font = `${Math.round(h * 1.05)}px "Special Elite", "Courier New", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; k > 0 && i < 5; i++) {   // each letter a little off
    ctx.save(); ctx.translate(cx + (i - 2) * step + (r() - .5) * w * .008, cy + h * .06 + (r() - .5) * h * .05); ctx.rotate((r() - .5) * .06);
    ctx.globalAlpha = ga(a * k); ctx.fillStyle = PAL.chalk; ctx.fillText(word[i], 0, 0); ctx.restore();
  }
  ctx.restore();
  if (years && open > .6) {   // 26 / 27 and "oversight", like the wordmark
    const q = a * Math.min(1, (open - .6) * 3) * .55, mono = `"JetBrains Mono", monospace`;
    wtext(s, '26', cx - w * 1.02, cy - h * .95, id + 300, b, { a: q, font: `700 ${Math.round(w * .12)}px ${mono}` });
    wtext(s, '27', cx + w * 1.02, cy - h * .95, id + 301, b, { a: q, align: 'right', font: `700 ${Math.round(w * .12)}px ${mono}` });
    wtext(s, 'o v e r s i g h t', cx, cy + h * 1.75, id + 302, b, { a: q, align: 'center', font: `400 ${Math.round(w * .075)}px ${mono}` });
  }
}

/* a burst of scribbles out of the eye (amount 0..1). Not used by the current cut, kept for the recipe, now in the film palette. */
export function scribble(s, cx, cy, w, amount, seed) {
  if (!(amount > .01)) return;   // sin(π) is 1e-16, not 0
  const { ctx } = s, r = rng(seed * 17 + 5), cols = [PAL.red, PAL.red, PAL.chalk, PAL.blue];
  const n = Math.round(60 * amount);
  for (let i = 0; i < n; i++) {
    const a = (r() - .5) * Math.PI * .9 + (r() < .5 ? Math.PI / 2 : -Math.PI / 2), x0 = cx + (r() - .5) * w * 1.2, y0 = cy + (r() - .5) * w * .25, len = w * (.25 + r() * .9) * amount;
    wline(s, [[x0, y0], [x0 + Math.cos(a) * len * .5 + (r() - .5) * w * .2, y0 + Math.sin(a) * len * .5], [x0 + Math.cos(a) * len, y0 + Math.sin(a) * len]], seed * 100 + i, 0, { col: cols[Math.floor(r() * cols.length)], a: .75, amp: 0 });
  }
}

/* ------------------------------------------------------------------ the tape: grain, tears, bands, scanlines */
let grainTile = null, snapC = null, tintC = null;
export function grain(s, alpha, seed) {   // one small noise tile laid over the frame and shifted per frame (no per-pixel work per frame)
  if (!grainTile) {
    grainTile = document.createElement('canvas'); grainTile.width = grainTile.height = 128;
    const g = grainTile.getContext('2d'), d = g.createImageData(128, 128), r = rng(99);
    for (let i = 0; i < d.data.length; i += 4) { const v = 90 + r() * 165 | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = r() < .5 ? 255 : 0; }
    g.putImageData(d, 0, 0);
  }
  const { ctx, W, H } = s, r = rng(seed * 3 + 1);
  ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'lighter';
  ctx.translate(-r() * 128, -r() * 128); ctx.fillStyle = ctx.createPattern(grainTile, 'repeat'); ctx.fillRect(0, 0, W + 128, H + 128);
  ctx.restore();
}
function buf(c, s) { c = c || document.createElement('canvas'); if (c.width !== s.canvas.width || c.height !== s.canvas.height) { c.width = s.canvas.width; c.height = s.canvas.height; } return c; }
function snap(s) { snapC = buf(snapC, s); const g = snapC.getContext('2d'); g.globalCompositeOperation = 'source-over'; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(s.canvas, 0, 0); return snapC; }

/* shove horizontal slices of the finished frame sideways (the core of a tape tear) */
function slices(s, n, maxdx, hmax, seed) {
  if (!s.canvas.width || !s.canvas.height) return;
  const { ctx, canvas, dpr } = s, c = snap(s), r = rng(seed);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < n; i++) {
    const y = Math.floor(r() * canvas.height), hh = Math.max(2, Math.floor((.3 + r() * .7) * hmax * dpr)), dx = Math.round((r() - .5) * 2 * maxdx * dpr);
    ctx.fillStyle = PAL.black; ctx.fillRect(0, y, canvas.width, hh); ctx.drawImage(c, 0, y, canvas.width, hh, dx, y, canvas.width, hh);
  }
  ctx.restore();
}
export function glitch(s, amount, seed) {   // kept from the party video: slices by amount 0..1
  if (!(amount > .01) || reduced) return;
  slices(s, 2 + Math.round(amount * 9), s.W * .07 * amount, s.H * .07 * amount, seed * 23 + 11);
}

/* red/blue split of the finished frame, px each way (used on tears, the Act 1 eye fill and the Act 2 scare only) */
export function misreg(s, px) {
  if (reduced || !(px > .4)) return;
  const { ctx, dpr } = s, c = snap(s); tintC = buf(tintC, s);
  const g = tintC.getContext('2d');
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .9;
  [[PAL.red, -px], [PAL.blue, px]].forEach(([col, dx]) => {
    g.globalCompositeOperation = 'source-over'; g.drawImage(c, 0, 0);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fillRect(0, 0, tintC.width, tintC.height);
    ctx.drawImage(tintC, Math.round(dx * dpr), 0);
  });
  ctx.restore();
}

/* the tape tear: call after the shot is drawn. f0 the picture splits, f1 a chalk noise slice + misregistration,
   f2 the new shot with two slices still off, f3 clean. The caller swaps the shot at t0 + swap/30 (swap is 2, or 0 when
   the new shot should land on the tear). Returns the tear frame, or -1. */
export const TEAR_SWAP = 2 / 30;
export function tapeTear(s, t, t0, seed = 1) {
  if (reduced) return -1;
  const f = Math.floor((t - t0) * 30 + 1e-6);
  if (f < 0 || f > 2) return -1;
  const k = s.u / 800, r = rng(seed * 131 + f * 17 + 5);
  if (f === 0) slices(s, 6 + Math.floor(r() * 5), 60 * k, 70 * k, seed * 7 + 1);
  else if (f === 1) {
    slices(s, 3, 30 * k, 50 * k, seed * 7 + 2);
    const { ctx, W, H } = s, y = r() * H * .7, hh = H * (.04 + r() * .04);
    ctx.save(); ctx.fillStyle = rgba(PAL.chalk, .5); ctx.fillRect(0, y, W, hh); ctx.restore();
    grain(s, .5, seed + 9); misreg(s, 5 * Math.max(.7, k));
  } else slices(s, 2, 8 * k, 40 * k, seed * 7 + 3);
  return f;
}

/* the soft tracking band: 40-70 px of brighter noise and smear rolling down. y = top edge (css px), a = strength. */
export function trackingBand(s, y, a) {
  if (!(a > .01) || !s.canvas.height) return;
  const { ctx, canvas, dpr, W } = s, bh = Math.max(40, Math.min(70, s.H * .07)), y0 = Math.round(y * dpr), hh = Math.round(bh * dpr);
  if (y0 + hh < 0 || y0 > canvas.height) return;
  const sy = Math.max(0, y0), sh = Math.min(canvas.height, y0 + hh) - sy;
  if (sh < 2) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.min(1, a * 1.2); ctx.drawImage(canvas, 0, sy, canvas.width, sh, Math.round(10 * dpr), sy, canvas.width, sh);   // horizontal smear
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, y0, 0, y0 + hh); g.addColorStop(0, rgba(PAL.chalk, 0)); g.addColorStop(.5, rgba(PAL.chalk, a * .22)); g.addColorStop(1, rgba(PAL.chalk, 0));
  ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, y0, canvas.width, hh);
  ctx.restore(); grainBand(s, y0, hh, a * .5);
}
function grainBand(s, y0, hh, a) {
  const { ctx, canvas } = s;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(0, y0, canvas.width, hh); ctx.clip(); ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  grain(s, a, Math.floor(y0 / 7) + 3); ctx.restore();
}

/* scanlines (1 px dark every 3 px) and ±1 px sideways jitter on a few random rows */
export function scanlines(s, a = .12) {
  const { ctx, canvas, dpr } = s;
  if (!s.scan) {
    const c = document.createElement('canvas'), p = Math.round(dpr); c.width = 1; c.height = p * 3;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 1, p);
    s.scan = ctx.createPattern(c, 'repeat');
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a; ctx.fillStyle = s.scan; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore();
}
export function rowJitter(s, frame) {
  if (reduced || !s.canvas.width || !s.canvas.height) return;   // a hidden tab can report a 0x0 window
  const { ctx, canvas, dpr } = s, r = rng(frame * 53 + 1);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 3; i++) { const y = Math.floor(r() * canvas.height), h = Math.max(2, Math.round((1 + r() * 2) * dpr)), dx = (r() < .5 ? -1 : 1) * Math.round(dpr); ctx.drawImage(canvas, 0, y, canvas.width, h, dx, y, canvas.width, h); }
  ctx.restore();
}

/* oxblood bleeding in from the edges; nothing over the middle third */
export function vignette(s, a = .55) {
  const { ctx, canvas } = s;
  if (!s.vig) {
    const R = Math.hypot(canvas.width, canvas.height) / 2, g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, R);
    g.addColorStop(0, rgba(PAL.oxblood, 0)); g.addColorStop(.32, rgba(PAL.oxblood, 0)); g.addColorStop(.7, rgba(PAL.oxblood, .25)); g.addColorStop(1, rgba(PAL.oxblood, 1));
    s.vig = g;
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a; ctx.fillStyle = s.vig; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore();
}

/* the cold CCTV grade: a flat wash of --cctv at 0.14-0.20 */
export function grade(s, a) {
  if (!(a > .005)) return;
  const { ctx } = s; ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = PAL.cctv; ctx.fillRect(0, 0, s.W, s.H); ctx.restore();
}

/* the whole tape layer in one call (everything except captions): grain, jitter, band, scanlines, vignette */
export function vhs(s, o) {
  const f = reduced ? 0 : Math.floor(o.t * 30 + 1e-6);
  if (o.band) trackingBand(s, o.band.y, o.band.a);
  rowJitter(s, f);
  scanlines(s, .12);
  grain(s, o.grain == null ? .07 : o.grain, reduced ? 1 : f);
  vignette(s, o.vig == null ? 1 : o.vig);
}

/* old TV switching off: the frame squashes to a line, the line to a dot, the dot fades. p 0..1 over 0.27 s */
export function crtCollapse(s, p) {
  const { ctx, W, H, dpr, canvas } = s;
  if (reduced) return;
  const pa = p / .556, pb = (p - .556) / .296, pc = (p - .852) / .148;
  if (p < .556) {
    const c = snap(s), sy = Math.max(2 / H, 1 - ease(pa) * pa * (1 - 2 / H)), hh = H * sy;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = PAL.black; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(c, 0, 0, canvas.width, canvas.height, 0, (H - hh) / 2 * dpr, canvas.width, hh * dpr); ctx.restore();
    ctx.save(); ctx.globalAlpha = .35 + .65 * pa; ctx.fillStyle = PAL.chalk; ctx.fillRect(0, H / 2 - Math.max(1, hh / 2), W, Math.max(2, Math.min(hh, 3))); ctx.restore();
  } else {
    ctx.fillStyle = PAL.black; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = p < .852 ? 1 : 1 - ease(pc); ctx.fillStyle = PAL.chalk;
    const hw = p < .852 ? lerp(W / 2, 3, ease(pb)) : 3; ctx.fillRect(W / 2 - hw, H / 2 - 1, hw * 2, 2);
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 14); g.addColorStop(0, rgba(PAL.chalk, .8)); g.addColorStop(1, rgba(PAL.chalk, 0));
    ctx.fillStyle = g; ctx.fillRect(W / 2 - 14, H / 2 - 14, 28, 28); ctx.restore();
  }
}

/* page shake in three frames (4, 2, 1 px) */
export function shake(t, at, px) {
  if (reduced) return { x: 0, y: 0 };
  const f = Math.floor((t - at) * 30 + 1e-6);
  if (f < 0 || f > 2) return { x: 0, y: 0 };
  const k = [1, .5, .25][f] * px, r = rng(f * 7 + 3);
  return { x: (r() < .5 ? -1 : 1) * k, y: (r() < .5 ? -1 : 1) * k * .6 };
}

/* ------------------------------------------------------------------ the lamp and the stamp */
/* a cone of light from the shade rim (x +- sw, y) to the desk (tx +- spread, ty): soft radial gradient inside a wedge */
export function lampCone(s, o) {
  const { ctx } = s, { x, y, tx, ty, sw, spread, col, a } = o;
  ctx.save(); ctx.globalAlpha = ga(1);
  ctx.beginPath(); ctx.moveTo(x - sw, y); ctx.lineTo(x + sw, y); ctx.lineTo(tx + spread, ty); ctx.lineTo(tx - spread, ty); ctx.closePath(); ctx.clip();
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.hypot(tx - x, ty - y) * 1.1);
  g.addColorStop(0, rgba(col, a * 1.4)); g.addColorStop(1, rgba(col, a * .25));
  ctx.fillStyle = g; ctx.fillRect(-s.W, 0, s.W * 3, s.H * 1.5);
  ctx.restore();
}

/* a rubber stamp, inked once on its own canvas: broken edges, uneven fill (80-95 %). Draw it with drawStamp. */
export function stamp(word, col) {
  const c = document.createElement('canvas'); c.width = 1100; c.height = 300;
  const g = c.getContext('2d'), r = rng(5);
  g.strokeStyle = col; g.lineWidth = 18; g.strokeRect(20, 20, 1060, 260);
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '190px "Special Elite", "Courier New", monospace'; g.fillText(word, 550, 162);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1100; i++) { g.globalAlpha = .1 + r() * .5; g.fillRect(r() * 1100, r() * 300, 3 + r() * 7, 2 + r() * 4); }   // worn ink
  for (let i = 0; i < 26; i++) { g.globalAlpha = 1; const edge = r() < .5; g.fillRect(edge ? 10 + r() * 1080 : (r() < .5 ? 8 : 1066), edge ? (r() < .5 ? 8 : 266) : 10 + r() * 280, 8 + r() * 26, 8 + r() * 14); }   // broken edge
  return c;
}
export function drawStamp(s, cv, x, y, w, rot, a = 1) {
  const { ctx } = s, h = w * cv.height / cv.width;
  ctx.save(); ctx.globalAlpha = ga(a); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(cv, -w / 2, -h / 2, w, h); ctx.restore();
}

/* ------------------------------------------------------------------ sound: one pre-mixed file per act */
/* filmAudio(url, clock): clock() is the film time in seconds while the film runs, null otherwise. The file is fetched and
   decoded on load (the picture never waits for it). When sound is on, the buffer starts at the current film time, so
   turning sound on mid-film, or on after the file arrives, stays in sync. begin() restarts at the film's t=0. If the file
   is missing or can't decode, everything stays silent and nothing else changes. */
export function filmAudio(url, clock) {
  let ac = null, master = null, buf = null, src = null, on = false, ended = false;
  const A = {};
  const noop = () => {};
  function stopSrc() { if (src) { try { src.onended = null; src.stop(); } catch (e) { /* already stopped */ } src.disconnect(); src = null; } }
  function sync(again) {
    if (!on || ended || !buf || !ac) return;
    const t = clock();
    if (t == null || t >= buf.duration - .05) return;
    if (ac.state !== 'running') { if (!again) Promise.resolve(ac.resume()).then(() => sync(true), noop); return; }   // iOS: audio device busy; stay silent
    stopSrc(); src = ac.createBufferSource(); src.buffer = buf; src.connect(master); src.start(0, Math.max(0, t));
  }
  const level = v => { if (master) master.gain.setTargetAtTime(v, ac.currentTime, .03); };
  A.load = () => {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination); } catch (e) { ac = null; return; }
    fetch(url).then(r => { if (!r.ok) throw new Error('no audio'); return r.arrayBuffer(); })
      .then(d => new Promise((ok, no) => { const p = ac.decodeAudioData(d, ok, no); if (p && p.then) p.then(ok, no); }))
      .then(b => { buf = b; sync(); }).catch(noop);   // missing file: silent
  };
  A.set = want => {
    if (!ac) return false;
    on = !!want;
    if (on) { level(1); if (!src) sync(); else if (ac.state === 'suspended') Promise.resolve(ac.resume()).catch(noop); } else level(0);
    return on;
  };
  A.toggle = () => A.set(!on);
  A.begin = want => { ended = false; stopSrc(); return A.set(want); };   // the film clock just restarted
  A.fade = () => {   // Skip or the end of the film: ~0.4 s out, then stop
    ended = true; if (!ac || !src) return;
    master.gain.setTargetAtTime(0, ac.currentTime, .1); const s0 = src; setTimeout(() => { if (src === s0) stopSrc(); }, 450);
  };
  A.on = () => on;
  A.running = () => !!ac && ac.state === 'running';
  return A;
}

/* the speaker icon used on every sound button in the portal */
export const SPEAKER = on => '<svg class="snd-ic" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor"/>' +
  (on ? '<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/>'
    : '<path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/>') + '</svg>';

/* captions: what you see types out at the line's speed (silent); screen readers get each line once, whole, from say() */
export function captions(visual, live) {
  let text = '', shown = -1, said = '';
  return {
    show(line, t0, t, cps) {
      const n = reduced ? line.length : Math.max(0, Math.min(line.length, Math.floor((t - t0) * (cps || 30) + 1e-6)));
      if (line !== text) { text = line; shown = -1; }
      if (n === shown) return;
      shown = n; visual.textContent = line.slice(0, n);
      if (n < line.length) { const c = document.createElement('span'); c.className = 'cur'; visual.append(c); }
    },
    say(line) { if (line !== said) { said = line; live.textContent = line; } },
    clear() { if (text) { text = ''; shown = -1; visual.textContent = ''; } },
    reset() { this.clear(); said = ''; live.textContent = ''; }
  };
}

/* wait for the brand fonts so the canvas never draws a fallback (gives up after 2.5 s) */
export function fontsReady() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.race([
    Promise.all(['64px "Special Elite"', '700 20px "JetBrains Mono"', '400 20px "JetBrains Mono"'].map(f => document.fonts.load(f))),
    new Promise(r => setTimeout(r, 2500))
  ]).catch(() => {});
}
