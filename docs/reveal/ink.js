/*
  Eyes on LEADS: shared drawing + sound for the results films (GitHub Pages, no libraries, no image or audio files).
    docs/results/  Act 1, the public page the acceptance email links to: the watching eye, the scribble glitch,
                   the LEADS eye opening, then the way into the portal.
    docs/reveal/   Act 2, inside the portal (only for an accepted applicant): the LEADS eye, the mirror, the case
                   file and the stamp.
  The look copies the Eyes on LEADS party video: a flat red field, a hand-drawn white eye that "boils" (every line is
  redrawn slightly differently 10 times a second, like stop motion), a burst of purple/red/yellow/blue scribbles as the
  glitch, then the brand book's typewriter LEADS eye with the red iris on the A. No triangle eye.
  Everything is drawn into one 2D canvas per page (grain and glitch included), so there is no blended overlay to
  composite and nothing to download but this file and the fonts.
*/

export const C = {
  field: '#d4260a',     // the party video's red-orange
  ink: '#0b0b0b', paper: '#fbfaf6', red: '#e50000', blue: '#000ff0', yellow: '#fffc04',
  purple: '#8b2be2', manila: '#d3bc86', silver: '#c9ced4'
};
export const FPS = 10;   // the boil rate: the line changes 10 times a second, motion stays smooth
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* seeded random, so every playback draws the same film */
export function rng(seed) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
export const boil = t => reduced ? 0 : Math.floor(t * FPS);
export const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
export const span = (t, a, b) => ease((t - a) / (b - a));
export const backOut = x => { x = Math.max(0, Math.min(1, x)); const k = 1.9; return 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2); };

/* ------------------------------------------------------------------ canvas */
export function stage(canvas) {
  const ctx = canvas.getContext('2d');
  const s = { canvas, ctx, W: 0, H: 0, dpr: 1, u: 0 };
  s.fit = () => {
    s.dpr = Math.min(window.devicePixelRatio || 1, 2);
    s.W = innerWidth; s.H = innerHeight;
    canvas.width = Math.round(s.W * s.dpr); canvas.height = Math.round(s.H * s.dpr);
    s.u = Math.min(s.W, s.H * 1.15);   // one unit that reads the same on a tall phone and a wide laptop
  };
  s.begin = color => { ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = color; ctx.fillRect(0, 0, s.W, s.H); };
  s.fit();
  return s;
}

/* the almond: a lens with pointed corners, its edge nudged by the boil so it looks hand-cut */
function almond(ctx, cx, cy, w, h, seed, amp) {
  const r = rng(seed), n = 26, pts = [];
  for (let i = 0; i <= n; i++) { const x = -1 + 2 * i / n; pts.push([cx + x * w, cy - h * (1 - x * x) + (r() - .5) * amp]); }
  for (let i = n - 1; i > 0; i--) { const x = -1 + 2 * i / n; pts.push([cx + x * w, cy + h * (1 - x * x) + (r() - .5) * amp]); }
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) { const p = pts[i - 1], q = pts[i]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  ctx.closePath();
}
function blob(ctx, x, y, rad, seed, amp) {   // a rough filled circle
  const r = rng(seed), n = 18;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, k = rad * (1 + (r() - .5) * amp); i ? ctx.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k) : ctx.moveTo(x + Math.cos(a) * k, y + Math.sin(a) * k); }
  ctx.closePath(); ctx.fill();
}

/* the party eye: white almond, black pupil. pupil = 'dot' | 'split' | 'scrawl' (the moment before it breaks) */
export function partyEye(ctx, o) {
  const { cx, cy, w, look = { x: 0, y: 0 }, open = 1, seed = 0, pupil = 'dot' } = o, h = w * .3 * Math.max(.04, open);
  ctx.save();
  ctx.fillStyle = C.paper; almond(ctx, cx, cy, w, h, seed * 7 + 1, w * .03); ctx.fill(); ctx.clip();
  const px = cx + look.x * w * .42, py = cy + look.y * h * .35, pr = w * .3 * .72;
  ctx.fillStyle = C.ink;
  if (pupil === 'dot') blob(ctx, px, py, pr, seed * 13 + 3, .07);
  else if (pupil === 'split') { blob(ctx, px - pr * .42, py, pr * .62, seed * 5 + 9, .25); blob(ctx, px + pr * .42, py + pr * .05, pr * .6, seed * 3 + 4, .25); }
  else {   // scrawl: the pupil turns into frantic marks
    const r = rng(seed * 31 + 7); ctx.strokeStyle = C.ink; ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const x = cx + (r() - .5) * w * 1.1, y = cy + (r() - .5) * h * 1.2;
      ctx.lineWidth = w * (.012 + r() * .025); ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - .5) * w * .18, y + (r() - .5) * h * 1.4); ctx.lineTo(x + (r() - .5) * w * .2, y + (r() - .5) * h); ctx.stroke();
    }
  }
  ctx.restore();
}

/* the glitch: a burst of coloured scribbles out of the eye, like the party video's crescendo (amount 0..1) */
export function scribble(ctx, cx, cy, w, amount, seed) {
  if (!(amount > .01)) return;   // sin(π) is 1e-16, not 0
  const r = rng(seed * 17 + 5), cols = [C.purple, C.purple, C.purple, '#b10000', C.red, C.yellow, C.blue, C.ink];
  ctx.save(); ctx.lineCap = 'round';
  const n = Math.round(70 * amount);
  for (let i = 0; i < n; i++) {
    const a = (r() - .5) * Math.PI * .9 + (r() < .5 ? Math.PI / 2 : -Math.PI / 2) + (r() < .25 ? Math.PI / 2 : 0);
    const x0 = cx + (r() - .5) * w * 1.2, y0 = cy + (r() - .5) * w * .25;
    const len = w * (.25 + r() * .9) * amount;
    ctx.strokeStyle = cols[Math.floor(r() * cols.length)]; ctx.lineWidth = w * (.008 + r() * .02); ctx.globalAlpha = .75 + r() * .25;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 + Math.cos(a) * len * .5 + (r() - .5) * w * .2, y0 + Math.sin(a) * len * .5, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
    ctx.stroke();
  }
  for (let i = 0; i < 10 * amount; i++) {   // tangled loops in the middle
    ctx.strokeStyle = cols[Math.floor(r() * cols.length)]; ctx.lineWidth = w * .01; ctx.beginPath();
    let x = cx + (r() - .5) * w * .8, y = cy + (r() - .5) * w * .2; ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (r() - .5) * w * .3; y += (r() - .5) * w * .15; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.restore();
}

/* the brand book's LEADS eye: typewriter letters in a white almond, the red iris behind the A, lashes, drips, xerox
   scratches. open squashes it shut like the party video. iris moves the red disc. mirror 0..1 turns the iris into a
   mirror that shows the party eye: the one who was watching was you. */
export function wordEye(ctx, o) {
  const { cx, cy, w, open = 1, seed = 0, iris = { x: 0, y: 0 }, mirror = 0, years = true } = o;
  const h = w * .36, r = rng(seed * 11 + 2);
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(1, Math.max(.02, open)); ctx.translate(-cx, -cy);
  // lashes above, drips below
  ctx.strokeStyle = C.ink; ctx.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x = -1 + 2 * (i + .5) / 46, px = cx + x * w * .96, py = cy - h * (1 - x * x) * .98;
    ctx.lineWidth = w * (.006 + r() * .007); ctx.beginPath(); ctx.moveTo(px, py - h * .06);
    ctx.lineTo(px + x * w * .05 + (r() - .5) * w * .02, py - h * (.2 + r() * .22)); ctx.stroke();
  }
  for (let i = 0; i < 7; i++) {
    const x = -.75 + 1.5 * r(), px = cx + x * w, py = cy + h * (1 - x * x);
    ctx.lineWidth = w * (.008 + r() * .01); ctx.beginPath(); ctx.moveTo(px, py + h * .04); ctx.lineTo(px + (r() - .5) * w * .01, py + h * (.18 + r() * .45)); ctx.stroke();
  }
  ctx.fillStyle = C.paper; almond(ctx, cx, cy, w, h, seed * 7 + 4, w * .02); ctx.fill();
  ctx.lineWidth = w * .035; ctx.stroke();
  ctx.save(); ctx.clip();
  for (let i = 0; i < 9; i++) {   // xerox scratches
    ctx.globalAlpha = .25 + r() * .35; ctx.lineWidth = w * (.002 + r() * .004);
    const y = cy + (r() - .5) * h * 1.6; ctx.beginPath(); ctx.moveTo(cx - w * (r() * .9), y); ctx.lineTo(cx + w * (r() * .9), y + (r() - .5) * h * .1); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const ir = h * .78, ix = cx + iris.x * w * .45, iy = cy + iris.y * h * .3;
  ctx.fillStyle = C.red; blob(ctx, ix, iy, ir, seed * 3 + 8, .05);
  if (mirror > 0) {
    ctx.globalAlpha = mirror;
    const g = ctx.createRadialGradient(ix - ir * .35, iy - ir * .4, ir * .1, ix, iy, ir * 1.05);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.45, C.silver); g.addColorStop(1, '#6c737b');
    ctx.fillStyle = g; blob(ctx, ix, iy, ir, seed * 3 + 8, .05);
    ctx.save(); ctx.beginPath(); ctx.arc(ix, iy, ir * .96, 0, Math.PI * 2); ctx.clip();
    partyEye(ctx, { cx: ix, cy: iy, w: ir * .78, look: { x: 0, y: 0 }, seed });   // your eye, looking back
    ctx.restore(); ctx.globalAlpha = 1;
  }
  ctx.setLineDash([w * .012, w * .012]); ctx.lineWidth = w * .006; ctx.strokeStyle = C.ink;   // the iris's dotted rim
  ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  // LEADS, typewriter, each letter a little off
  ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(h * 1.05)}px "Special Elite", "Courier New", monospace`;
  const word = 'LEADS', step = w * .3;
  for (let i = 0; i < 5; i++) {
    ctx.save(); ctx.translate(cx + (i - 2) * step + (r() - .5) * w * .008, cy + h * .06 + (r() - .5) * h * .05);
    ctx.rotate((r() - .5) * .06); ctx.fillText(word[i], 0, 0); ctx.restore();
  }
  ctx.restore();
  ctx.restore();
  if (years && open > .6) {   // the 26 / 27 corner marks and "oversight", like the wordmark
    ctx.save(); ctx.globalAlpha = Math.min(1, (open - .6) * 3); ctx.fillStyle = C.ink;
    ctx.font = `700 ${Math.round(w * .12)}px "JetBrains Mono", monospace`; ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left'; ctx.fillText('26', cx - w * 1.02, cy - h * .95);
    ctx.textAlign = 'right'; ctx.fillText('27', cx + w * 1.02, cy - h * .95);
    ctx.textAlign = 'center'; ctx.font = `400 ${Math.round(w * .075)}px "JetBrains Mono", monospace`;
    ctx.fillText('o v e r s i g h t', cx, cy + h * 1.75);
    ctx.restore();
  }
}

/* grain: one small noise tile, laid over the frame and shifted with the boil (cheap, no per-pixel work per frame) */
let grainTile = null;
export function grain(s, alpha, seed) {
  if (!grainTile) {
    grainTile = document.createElement('canvas'); grainTile.width = grainTile.height = 128;
    const g = grainTile.getContext('2d'), d = g.createImageData(128, 128), r = rng(99);
    for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255 | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = r() < .5 ? 60 : 0; }
    g.putImageData(d, 0, 0);
  }
  const { ctx, W, H } = s, r = rng(seed * 3 + 1);
  ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'overlay';
  ctx.translate(-r() * 128, -r() * 128); ctx.fillStyle = ctx.createPattern(grainTile, 'repeat'); ctx.fillRect(0, 0, W + 128, H + 128);
  ctx.restore();
}

/* glitch: shove horizontal slices of the finished frame sideways and add blue/yellow offset bars (amount 0..1) */
export function glitch(s, amount, seed) {
  if (!(amount > .01) || reduced) return;
  const { ctx, canvas, W, H, dpr } = s, r = rng(seed * 23 + 11);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const n = 2 + Math.round(amount * 9);
  for (let i = 0; i < n; i++) {
    const y = r() * canvas.height, hh = Math.max(2, r() * canvas.height * .07 * amount), dx = (r() - .5) * canvas.width * .14 * amount;
    ctx.drawImage(canvas, 0, y, canvas.width, hh, dx, y, canvas.width, hh);
  }
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < n / 2; i++) { ctx.globalAlpha = .55; ctx.fillStyle = r() < .5 ? C.blue : C.yellow; ctx.fillRect(r() * W * dpr * .6, r() * H * dpr, W * dpr * (.1 + r() * .5), dpr * (1 + r() * 6)); }
  ctx.restore();
}

/* camera shake for the stamp: an offset that dies away */
export function shake(t, at, power) {
  if (reduced || t < at || t > at + .5) return { x: 0, y: 0 };
  const k = (1 - (t - at) / .5) * power, r = rng(Math.floor(t * 60));
  return { x: (r() - .5) * k, y: (r() - .5) * k };
}

/* ------------------------------------------------------------------ sound (Web Audio, made here, only after a tap) */
export function makeSound() {
  let ac = null, master, bed, hiss, on = false, duckUntil = 0, lastTick = 0;
  const S = {};
  function init() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    bed = ac.createGain(); bed.gain.value = .6; bed.connect(master);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200; lp.connect(bed);
    // small speakers can't play a deep hum, so the bed is a mains buzz with harmonics plus tape hiss
    [[120, 'sawtooth', .045], [180, 'triangle', .045], [240, 'sine', .035]].forEach(([f, type, g]) => {
      const o = ac.createOscillator(), v = ac.createGain(); o.type = type; o.frequency.value = f; v.gain.value = g; o.connect(v); v.connect(lp); o.start();
    });
    const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = nb; src.loop = true;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    hiss = ac.createGain(); hiss.gain.value = .025; src.connect(hp); hp.connect(hiss); hiss.connect(master); src.start();
  }
  S.set = want => {
    if (!ac) { try { init(); } catch (e) { return false; } }
    on = !!want;
    if (ac.state === 'suspended') Promise.resolve(ac.resume()).catch(() => { /* iOS: audio device busy; stay silent */ });
    master.gain.setTargetAtTime(on ? .5 : 0, ac.currentTime, .05);
    return on;
  };
  S.toggle = () => S.set(!on);
  S.on = () => on;
  S.running = () => !!ac && ac.state === 'running';
  const live = () => ac && on;
  S.bedLevel = (b, h) => { if (live() && performance.now() > duckUntil) { bed.gain.value = b; hiss.gain.value = h; } };
  function noise(len, f, q, vol, shapeFn) {
    const b = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * len)), ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (shapeFn ? shapeFn(i / d.length) : 1 - i / d.length);
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q; g.gain.value = vol; s.buffer = b; s.connect(fl); fl.connect(g); g.connect(master); s.start();
  }
  function tone(f, type, at, len, peak, bend) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, at);
    if (bend) o.frequency.linearRampToValueAtTime(f * bend, at + len);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + Math.min(.03, len / 4)); g.gain.exponentialRampToValueAtTime(.0001, at + len);
    o.connect(g); g.connect(master); o.start(at); o.stop(at + len + .05);
  }
  const duck = ms => { bed.gain.value = .2; hiss.gain.value = .01; duckUntil = performance.now() + ms; };
  S.tick = () => {   // one key of a typewriter
    if (!live() || ac.currentTime - lastTick < .045) return; lastTick = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = 1500 + Math.random() * 500;
    g.gain.setValueAtTime(.06, ac.currentTime); g.gain.exponentialRampToValueAtTime(.0005, ac.currentTime + .03); o.connect(g); g.connect(master); o.start(); o.stop(ac.currentTime + .035);
  };
  S.burst = (len, vol) => { if (live()) noise(len, 1800, .4, vol); };
  S.crackle = len => {   // the scribble glitch: chopped, bit-crushed noise
    if (!live()) return;
    noise(len, 2600, .7, .9, x => (Math.sin(x * 140) > .2 ? 1 : 0) * (1 - x * .6));
    tone(90, 'sawtooth', ac.currentTime, len, .08, 2.2);
    duck(len * 1000 + 200);
  };
  S.thud = () => {
    if (!live()) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(60, t + .25);
    g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(.001, t + .4); o.connect(g); g.connect(master); o.start(); o.stop(t + .45);
    noise(.12, 1800, .4, .9);   // the paper smack is what small speakers hear
  };
  S.cue = k => {   // eerie cues instead of a voice: bell, fall, glass, open, verdict
    if (!live()) return;
    const t = ac.currentTime + .02;
    if (k === 'bell') [1, 2.76, 5.4].forEach((m, i) => tone(196 * m, 'sine', t, 3 - i * .7, [.13, .05, .03][i]));
    else if (k === 'fall') { tone(220, 'triangle', t, 1.3, .11, .985); tone(207.65, 'triangle', t + .6, 1.6, .11, .97); }
    else if (k === 'glass') { tone(1318.5, 'sine', t, 2.4, .045, .995); tone(1324, 'sine', t, 2.4, .045, .995); }
    else if (k === 'open') { tone(110, 'sawtooth', t, 1.1, .05, 1.08); noise(.9, 900, 2, .25, x => x); }
    else { tone(55, 'sine', t, 1.8, .5, .6); [220, 261.6, 329.6, 392].forEach((f, i) => tone(f, 'triangle', t + .15 + i * .06, 2.4, .045)); }
    duck(1500);
  };
  S.fade = () => { if (live()) { bed.gain.setTargetAtTime(.12, ac.currentTime, .4); hiss.gain.setTargetAtTime(.008, ac.currentTime, .4); } };
  return S;
}

/* the speaker icon used on every sound button in the portal */
export const SPEAKER = on => '<svg class="snd-ic" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor"/>' +
  (on ? '<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/>'
    : '<path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/>') + '</svg>';

/* captions: what you see types out letter by letter; screen readers get each line once, whole */
export function captions(visual, live, onTick) {
  let text = '', shown = -1;
  return {
    show(line, t0, t, cps) {
      const n = reduced ? line.length : Math.max(0, Math.min(line.length, Math.floor((t - t0) * (cps || 30))));
      if (line !== text) { text = line; shown = -1; live.textContent = line; }
      if (n === shown) return;
      if (n > shown && n > 0 && line[n - 1] !== ' ') onTick && onTick();
      shown = n;
      visual.textContent = line.slice(0, n);
      if (n < line.length) { const c = document.createElement('span'); c.className = 'cur'; visual.append(c); }
    },
    clear() { if (text) { text = ''; shown = -1; visual.textContent = ''; } }
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
