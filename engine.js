/* ============================================================
   KAGE NO MORI — engine core
   NES-style: 256×240 framebuffer, fixed 60 Hz logic,
   2A03-flavoured WebAudio APU, pixel-string sprites.
   ============================================================ */
'use strict';

/* ---------- canvas & scaling ---------- */
export const W = 256, H = 240;
export const cvs = document.getElementById('screen');
cvs.width = W; cvs.height = H;
export const ctx = cvs.getContext('2d');
ctx.imageSmoothingEnabled = false;

export function fitCanvas() {
  const raw = Math.min(innerWidth / W, innerHeight / H);
  // desktop: crisp integer scaling; small screens: fill with fractional scale
  const scale = raw >= 2 ? Math.floor(raw) : Math.max(0.8, raw);
  cvs.style.width = Math.round(W * scale) + 'px';
  cvs.style.height = Math.round(H * scale) + 'px';
}
addEventListener('resize', fitCanvas);
fitCanvas();

/* ---------- input (NES pad) ---------- */
export const pad = { left: false, right: false, up: false, down: false, a: false, b: false, j: false, start: false };
const prev = { ...pad };
export const pressed = { left: false, right: false, up: false, down: false, a: false, b: false, j: false, start: false };

const KEYMAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  Space: 'j', KeyC: 'j',            // dedicated JUMP
  KeyX: 'a',                        // sword
  KeyZ: 'b', KeyK: 'b',             // shuriken
  Enter: 'start', Escape: 'start',
};
export const rawKeys = {};
addEventListener('keydown', e => {
  rawKeys[e.code] = true;
  if (KEYMAP[e.code] !== undefined) e.preventDefault();
  if (!e.repeat && KEYMAP[e.code]) pad[KEYMAP[e.code]] = true;
});
addEventListener('keyup', e => {
  rawKeys[e.code] = false;
  if (KEYMAP[e.code]) pad[KEYMAP[e.code]] = false;
});
// keys held across focus loss would stay latched forever — release everything
function releaseAll() {
  for (const k in pad) pad[k] = false;
  for (const k in rawKeys) rawKeys[k] = false;
}
addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

export function latchInput() {           // call once per logic frame
  for (const k in pad) { pressed[k] = pad[k] && !prev[k]; prev[k] = pad[k]; }
}

/* ---------- touch controls ----------
   NES-style cross d-pad (threshold zones — diagonals still work)
   plus JUMP / SWORD / STAR / START buttons. JUMP merges into
   pad.up; holding a d-pad direction while tapping JUMP gives the
   diagonal leap. Overlay markup lives in index.html. */
export let touchEnabled = false;
export function initTouch(force = false) {
  if (!force && !(navigator.maxTouchPoints > 0 || 'ontouchstart' in window)) return false;
  const root = document.getElementById('touch');
  if (!root) return false;
  root.style.display = 'block';
  const note = document.getElementById('note');
  if (note) note.style.display = 'none';

  const dpad = document.getElementById('dpad');
  const dirTouches = new Map();          // pointerId -> {l,r,u,d}
  const applyDirs = () => {
    let l = false, r = false, u = false, d = false;
    for (const v of dirTouches.values()) { l ||= v.l; r ||= v.r; u ||= v.u; d ||= v.d; }
    pad.left = l; pad.right = r; pad.up = u; pad.down = d;
  };
  const zone = (e) => {
    const rc = dpad.getBoundingClientRect();
    const dx = e.clientX - (rc.left + rc.width / 2);
    const dy = e.clientY - (rc.top + rc.height / 2);
    const t = rc.width * 0.14;
    return { l: dx < -t, r: dx > t, u: dy < -t, d: dy > t };
  };
  dpad.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { dpad.setPointerCapture(e.pointerId); } catch {}
    dirTouches.set(e.pointerId, zone(e)); applyDirs();
  });
  dpad.addEventListener('pointermove', e => {
    if (!dirTouches.has(e.pointerId)) return;
    dirTouches.set(e.pointerId, zone(e)); applyDirs();
  });
  for (const ev of ['pointerup', 'pointercancel']) {
    dpad.addEventListener(ev, e => { dirTouches.delete(e.pointerId); applyDirs(); });
  }

  const bindBtn = (id, key) => {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch {}
      pad[key] = true; el.classList.add('on');
    });
    for (const ev of ['pointerup', 'pointercancel'])
      el.addEventListener(ev, () => { pad[key] = false; el.classList.remove('on'); });
  };
  bindBtn('btnA', 'a');
  bindBtn('btnB', 'b');
  bindBtn('btnJ', 'j');
  const st = document.getElementById('btnStart');
  st.addEventListener('pointerdown', e => {
    e.preventDefault();
    pad.start = true; st.classList.add('on');
    setTimeout(() => { pad.start = false; st.classList.remove('on'); }, 120);
  });
  touchEnabled = true;
  return true;
}

/* brief virtual button pulse (e.g. tap-canvas-to-start) */
export function pulse(key, ms = 120) {
  pad[key] = true;
  setTimeout(() => { pad[key] = false; }, ms);
}

/* ---------- sprite system ----------
   Sprites are arrays of strings; each char indexes into a palette
   array of CSS colors ('.' = transparent). Rendered once to an
   offscreen canvas per (art, palette) pair, then blitted. */
const spriteCache = new Map();
export function sprite(art, pal, key) {
  const k = key ?? (art.__id ??= Math.random().toString(36).slice(2)) + '|' + pal.join(',');
  let c = spriteCache.get(k);
  if (c) return c;
  const h = art.length, w = art[0].length;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = art[y][x];
    if (ch === '.') continue;
    g.fillStyle = pal[ch.charCodeAt(0) >= 97 ? ch.charCodeAt(0) - 87 : +ch];  // 0-9 then a,b,c…
    g.fillRect(x, y, 1, 1);
  }
  spriteCache.set(k, c);
  return c;
}
export function blit(img, x, y, flip = false) {
  x |= 0; y |= 0;
  if (!flip) { ctx.drawImage(img, x, y); return; }
  ctx.save(); ctx.translate(x + img.width, y); ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0); ctx.restore();
}

/* ---------- tiny bitmap font (5×7-in-8×8, NES vibe) ---------- */
const FONT = {};
const GLYPHS = {
  A:'.###.|#...#|#...#|#####|#...#|#...#|#...#', B:'####.|#...#|####.|#...#|#...#|#...#|####.',
  C:'.####|#....|#....|#....|#....|#....|.####', D:'####.|#...#|#...#|#...#|#...#|#...#|####.',
  E:'#####|#....|####.|#....|#....|#....|#####', F:'#####|#....|####.|#....|#....|#....|#....',
  G:'.####|#....|#....|#.###|#...#|#...#|.###.', H:'#...#|#...#|#####|#...#|#...#|#...#|#...#',
  I:'#####|..#..|..#..|..#..|..#..|..#..|#####', J:'....#|....#|....#|....#|#...#|#...#|.###.',
  K:'#...#|#..#.|###..|#..#.|#...#|#...#|#...#', L:'#....|#....|#....|#....|#....|#....|#####',
  M:'#...#|##.##|#.#.#|#...#|#...#|#...#|#...#', N:'#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  O:'.###.|#...#|#...#|#...#|#...#|#...#|.###.', P:'####.|#...#|#...#|####.|#....|#....|#....',
  Q:'.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R:'####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S:'.####|#....|.###.|....#|....#|#...#|.###.', T:'#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U:'#...#|#...#|#...#|#...#|#...#|#...#|.###.', V:'#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W:'#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#', X:'#...#|.#.#.|..#..|..#..|.#.#.|#...#|#...#',
  Y:'#...#|.#.#.|..#..|..#..|..#..|..#..|..#..', Z:'#####|....#|...#.|..#..|.#...|#....|#####',
  '0':'.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', '1':'..#..|.##..|..#..|..#..|..#..|..#..|#####',
  '2':'.###.|#...#|....#|..##.|.#...|#....|#####', '3':'.###.|#...#|...#.|..##.|....#|#...#|.###.',
  '4':'...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', '5':'#####|#....|####.|....#|....#|#...#|.###.',
  '6':'.###.|#....|####.|#...#|#...#|#...#|.###.', '7':'#####|....#|...#.|..#..|..#..|.#...|.#...',
  '8':'.###.|#...#|.###.|#...#|#...#|#...#|.###.', '9':'.###.|#...#|#...#|.####|....#|#...#|.###.',
  '-':'.....|.....|.....|#####|.....|.....|.....', '.':'.....|.....|.....|.....|.....|.##..|.##..',
  '!':'..#..|..#..|..#..|..#..|..#..|.....|..#..', ':':'.....|.##..|.##..|.....|.##..|.##..|.....',
  '/':'....#|....#|...#.|..#..|.#...|#....|#....', "'":'..#..|..#..|.....|.....|.....|.....|.....',
  '©':'.###.|#...#|#.##.|#.#..|#.##.|#...#|.###.', '·':'.....|.....|.....|..#..|.....|.....|.....',
  '↑':'..#..|.###.|#.#.#|..#..|..#..|..#..|..#..', '←':'.....|..#..|.#...|#####|.#...|..#..|.....',
  '→':'.....|..#..|...#.|#####|...#.|..#..|.....',
};
export function text(str, x, y, color = '#fff') {
  const key = color;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i].toUpperCase();
    if (ch === ' ') continue;
    const g = GLYPHS[ch]; if (!g) continue;
    let f = FONT[ch + key];
    if (!f) {
      f = document.createElement('canvas'); f.width = 8; f.height = 8;
      const fg = f.getContext('2d'); fg.fillStyle = color;
      g.split('|').forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) if (row[rx] === '#') fg.fillRect(rx + 1, ry, 1, 1); });
      FONT[ch + key] = f;
    }
    ctx.drawImage(f, (x + i * 8) | 0, y | 0);
  }
}

/* ---------- APU: 2 pulse + triangle + noise ---------- */
export const APU = {
  ctx: null, master: null, musicGain: null, sfxGain: null, muted: false,
  ch: {},         // pulse1, pulse2, tri  (persistent oscillators)
  init() {
    if (this.ctx) return;
    const ac = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ac.createGain(); this.master.gain.value = 0.4; this.master.connect(ac.destination);
    this.musicGain = ac.createGain(); this.musicGain.gain.value = 0.75; this.musicGain.connect(this.master);
    this.sfxGain = ac.createGain(); this.sfxGain.gain.value = 1.0; this.sfxGain.connect(this.master);
    // thin-duty pulse via Fourier series (NES-style 25% / 12.5% duty)
    this.pulseWave = {};
    for (const duty of [0.125, 0.25]) {
      const N = 32, real = new Float32Array(N), imag = new Float32Array(N);
      for (let n = 1; n < N; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
      this.pulseWave[duty] = ac.createPeriodicWave(real, imag);
    }
    for (const [name, type] of [['pulse1', 'square'], ['pulse2', 'square'], ['tri', 'triangle']]) {
      const o = ac.createOscillator();
      if (type === 'square') o.setPeriodicWave(this.pulseWave[name === 'pulse1' ? 0.25 : 0.125]);
      else o.type = type;
      const g = ac.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(this.musicGain); o.start();
      this.ch[name] = { o, g };
    }
    if (ac.state === 'suspended') ac.resume();
  },
  // schedule a note on a persistent channel at absolute time t
  note(chan, freq, t, dur, vol = 0.12) {
    const c = this.ch[chan]; if (!c) return;
    c.o.frequency.setValueAtTime(freq, t);
    c.g.gain.setValueAtTime(vol, t);
    c.g.gain.setValueAtTime(vol * 0.6, t + dur * 0.7);
    c.g.gain.setValueAtTime(0, t + dur * 0.92);
  },
  rest(chan, t) {
    const c = this.ch[chan]; if (!c) return;
    c.g.gain.cancelScheduledValues(t); c.o.frequency.cancelScheduledValues(t);
    c.g.gain.setValueAtTime(0, t);
  },
  noiseBuf: null,
  noise(t, dur, vol = 0.2, hp = 4000) {          // percussion / sfx noise burst
    const ac = this.ctx; if (!ac) return;
    if (!this.noiseBuf) {
      this.noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ac.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.musicGain);
    s.start(t); s.stop(t + dur + 0.05);
  },
  sfx(fn) { if (this.ctx && !this.muted) fn(this.ctx, this.sfxGain); },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.4, this.ctx.currentTime, 0.03);
    return this.muted;
  },
};

/* one-shot square blip helper for SFX */
export function blip(freq, dur, vol = 0.15, type = 'square', glideTo = null) {
  APU.sfx((ac, dest) => {
    const t = ac.currentTime;
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.linearRampToValueAtTime(glideTo, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  });
}
export function noiseHit(dur = 0.15, vol = 0.25, hp = 1500) {
  APU.sfx((ac, dest) => {
    const t = ac.currentTime;
    const s = ac.createBufferSource();
    if (!APU.noiseBuf) APU.noise(t, 0.001, 0.0001);      // ensure buffer exists
    s.buffer = APU.noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 0.05);
  });
}

/* ---------- fixed-timestep loop ---------- */
export function runLoop(update, draw) {
  const STEP = 1000 / 60;
  let acc = 0, last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    acc += Math.min(now - last, 100); last = now;
    let n = 0;
    while (acc >= STEP && n < 4) { latchInput(); update(); acc -= STEP; n++; }
    if (n === 4) acc = 0;                        // background-tab catchup guard
    draw();
  }
  requestAnimationFrame(frame);
}

/* ---------- misc ---------- */
export const rnd = (a, b) => a + Math.random() * (b - a);
export const irnd = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const pick = arr => arr[(Math.random() * arr.length) | 0];
