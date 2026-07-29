/* ============================================================
   KAGE NO MORI — main game
   An original homage to 1985-style ninja arcade action.
   Mechanics recreated from research; all art, code and music
   are original. No Taito assets or names are used.
   ============================================================ */
import { W, H, ctx, cvs, pad, pressed, rawKeys, sprite, blit, text, APU, runLoop, latchInput, initTouch, touchEnabled, pulse, rnd, irnd, clamp, pick } from './engine.js';
import * as S from './sprites.js';
import { Music, SFX } from './music.js';

/* ============================================================
   TUNABLES (from research)
   ============================================================ */
const TU = {
  runSpeed: 1.6,            // fast, inertia-free, instant turns
  runSpeedFast: 2.1,        // orange outfit tier
  gravity: 0.1,
  jumpVel: -6.2,            // ~190px apex ≈ screen height, floaty
  jumpVX: 2.0,              // fixed diagonal arc speed — NO air steering
  climbSpeed: 1.2,
  waterSpeed: 0.8,
  starSpeed: 3.2,
  starMax: 2,               // on-screen cap
  swordRange: 16,
  swordArc: 14,
  deflectR: 14,
  enemyStar: 2.4,
  fireballSpeed: 2.6,
  bombG: 0.09,
  invulnFrames: 120,
  chantFrames: 220,
  ashuraFrames: 480,
  extendAt: 30000,
};

/* ---------- seasons (chapter palettes) ----------
   The sky is moonlit indigo night in EVERY season; only the
   foliage/ground/interior hues re-skin per chapter. */
const SKY = '#3b00a4';
const SEASONS = [
  { name: 'SUMMER', leaf1: '#5de530', leaf2: '#009032', trunk1: '#6c6e00', trunk2: '#343500',
    g0: '#bdbf00', g1: '#89d900', g2: '#343500', water: '#4240fe', keepWall: '#eb9f23' },
  { name: 'AUTUMN', leaf1: '#eb9f23', leaf2: '#994f00', trunk1: '#571d00', trunk2: '#2c0e00',
    g0: '#d8a038', g1: '#994f00', g2: '#343500', water: '#1412a8', keepWall: '#6c6e00' },
  { name: 'WINTER', leaf1: '#fefefe', leaf2: '#aeaeae', trunk1: '#6c6e00', trunk2: '#343500',
    g0: '#fefefe', g1: '#aeaeae', g2: '#343500', water: '#4240fe', keepWall: '#007c8e' },
];
const STAGE_NAMES = ['THE FOREST', 'THE MOAT', 'CASTLE WALL', 'THE KEEP', 'SHOWDOWN'];
const BOSSES = ['GENRAI TWINS', 'KUROGANE', 'ONIYAMA'];

/* ============================================================
   STATE
   ============================================================ */
const G = {
  mode: 'title',            // title|story|play|rescue|kidnap|clear|ending|dead|gameover
  stage: 0, season: 0, loopN: 0,
  score: 0, hi: +(localStorage.getItem('knm_hi') || 20000),
  lives: 3, power: 0,       // 0 red | 1 green | 2 orange
  extended: false,
  frames: 0, stateT: 0, paused: false,
  camX: 0, camY: 0,
  monksDown: 0,             // forest gate
  moatKills: 0, moatSword: 0, moatFaceGiven: false,
  redRegionKills: [],       // x positions of recent red-ninja kills (face trigger)
  ashuraT: 0, chantT: 0,
  butterflyDown: false,
};

const P = {                 // player
  x: 0, y: 0, vx: 0, vy: 0, w: 10, h: 22,
  face: -1, state: 'ground',   // ground|air|climb|water|ramp|chant
  swordT: 0, throwT: 0, invuln: 0, dying: 0,
  anim: 0, clashBounce: 0, trunk: null, ramp: null,
  aimVX: 0, aimVY: 0,
};

let world = null;           // stage geometry
let ents = [];              // enemies/projectiles/items/fx
let spawnT = 90;
let stars = 0;              // live player stars

/* ============================================================
   WORLD BUILDING
   ============================================================ */
function seasonPal() { return SEASONS[G.season % 3]; }

function buildStage() {
  ents = []; stars = 0; spawnT = 200;
  G.monksDown = 0; G.moatKills = 0; G.moatSword = 0; G.moatFaceGiven = false;
  G.redRegionKills = []; G.ashuraT = 0; G.chantT = 0; G.butterflyDown = false;
  P.vx = P.vy = 0; P.state = 'ground'; P.swordT = 0; P.dying = 0; P.trunk = null;

  const st = G.stage;
  if (st === 0) {                     // FOREST — travel LEFT, canopy zone a full screen up
    world = { w: 3840, h: 480, groundY: 448, ceiling: 14, kind: 'forest',
              solids: [], trunks: [], ramps: [], water: null, bgTrees: [] };
    // 25 climbable trees with undulating canopy heights + branch clumps
    for (let i = 0; i < 25; i++) {
      const x = 120 + i * 148 + irnd(-20, 20);
      const canY = 150 + (i * 37 % 90);
      world.trunks.push({ x, top: canY, bot: world.groundY });
      world.solids.push({ x: x - 44, y: canY, w: 92, canopy: true });
      world.solids.push({ x: x + (i % 2 ? 10 : -56), y: canY + 84 + (i % 3) * 26, w: 48, canopy: true });
      if (i % 2 === 1) world.solids.push({ x: x + (i % 4 === 1 ? -52 : 8), y: canY + 170, w: 44, canopy: true });
      if (i % 3 === 0) world.solids.push({ x: x - 24, y: canY - 72, w: 56, canopy: true });
    }
    // violet silhouette trees (same-layer fake depth, non-solid)
    for (let i = 0; i < 24; i++) world.bgTrees.push({ x: 40 + i * 160 + irnd(0, 60) });
    // scroll on a trunk ~78% along the leftward route
    ents.push(item('scroll', world.w * 0.22 + 2, 300));
    // 3 blue monk zone owners gate the exit
    for (let i = 0; i < 3; i++) {
      const zx = world.w * (0.62 - i * 0.19);
      ents.push(monk('blue', zx, world.groundY - 24, { zone: [zx - 300, zx + 300] }));
    }
    P.x = world.w - 40; P.y = world.groundY - P.h; P.face = -1;
  }
  else if (st === 1) {                // MOAT — brick wall, walkway over water
    world = { w: 1792, h: 240, groundY: 216, ceiling: null, kind: 'moat',
              solids: [], trunks: [], ramps: [], water: { y: 184 } };
    let x = 0;
    while (x < world.w) {
      const w = irnd(96, 200);
      world.solids.push({ x, y: 148, w });                 // bank ledges
      x += w + irnd(28, 64);                               // gaps drop to water
    }
    P.x = 24; P.y = 148 - P.h; P.face = 1;
  }
  else if (st === 2) {                // WALL — vertical ascent, ledges every ~90px
    world = { w: 256, h: 1185, groundY: 1169, ceiling: null, kind: 'wall',
              solids: [], trunks: [], ramps: [], water: null };
    for (let y = world.groundY - 92; y > 120; y -= irnd(82, 100)) {
      const w = irnd(56, 110);
      world.solids.push({ x: irnd(4, 256 - w - 4), y, w });
    }
    world.solids.push({ x: 48, y: 88, w: 160, top: true });
    // the lone black ninja, holding the scroll
    ents.push(ninja('black', 128, 600 - 22, { still: true }));
    P.x = 120; P.y = world.groundY - P.h; P.face = 1;
  }
  else if (st === 3) {                // KEEP — 4 floors, zig-zag stairs, columns
    world = { w: 768, h: 400, groundY: 376, ceiling: null, kind: 'keep',
              solids: [], trunks: [], ramps: [], water: null, floors: [376, 288, 200, 112] };
    const F = world.floors;
    for (let f = 0; f < 4; f++) {
      const y = F[f];
      if (f > 0) world.solids.push({ x: 0, y, w: 768, floor: true });
      for (let c = 0; c < 5; c++) {
        const cx = 110 + c * 136 + (f % 2) * 22;
        world.trunks.push({ x: cx, top: y - 76, bot: y, floor: f });
      }
    }
    // stairs: f0→f1 at right, f1→f2 at left, f2→f3 at right
    world.ramps = [
      { x0: 672, y0: F[0], x1: 756, y1: F[1] },
      { x0: 96, y0: F[1], x1: 12, y1: F[2] },
      { x0: 672, y0: F[2], x1: 756, y1: F[3] },
    ];
    world.princess = { x: 44, y: F[3] - 24, col: 56, freed: false };
    P.x = 24; P.y = world.groundY - P.h; P.face = 1;
  }
  else {                              // SHOWDOWN — forest arena + butterfly + boss
    world = { w: 256, h: 240, groundY: 208, ceiling: null, kind: 'duel',
              solids: [{ x: 20, y: 120, w: 56, canopy: true }, { x: 180, y: 120, w: 56, canopy: true }],
              trunks: [{ x: 46, top: 120, bot: 208 }, { x: 206, top: 120, bot: 208 }],
              ramps: [], water: null, bgTrees: [{ x: 100 }, { x: 170 }] };
    ents.push({ t: 'fly', x: 128, y: 48, hp: 5, a: rnd(0, 6), hitT: 0, down: false });
    const b = G.season % 3;
    if (b === 0) { ents.push(boss('twin', 200)); ents.push(boss('twin', 232)); }
    else if (b === 1) ents.push(boss('swordsman', 210));
    else ents.push(boss('warlord', 210));
    P.x = 24; P.y = world.groundY - P.h; P.face = 1;
  }
  G.camX = clamp(P.x - 120, 0, world.w - W);
  G.camY = clamp(P.y - 140, 0, world.h - H);
}

/* ============================================================
   ENTITY FACTORIES
   ============================================================ */
function ninja(pal, x, y, o = {}) {
  return { t: 'ninja', pal, x, y, vx: 0, vy: 0, w: 10, h: 22, face: -1,
    ground: false, anim: irnd(0, 40), think: 0, starCd: irnd(60, 150),
    bombCd: irnd(200, 400), swingT: 0, clashN: 0, ...o };
}
function monk(pal, x, y, o = {}) {
  return { t: 'monk', pal, x, y, vx: 0.3, vy: 0, w: 12, h: 23, face: -1,
    ground: true, anim: 0, fireCd: irnd(90, 160), breatheT: 0, fire: null, ...o };
}
function boss(kind, x) {
  return { t: 'boss', kind, x, y: world.groundY - 26, vx: 0, vy: 0, w: 12, h: 24,
    face: -1, ground: true, anim: 0, think: 0, starCd: 90, swingT: 0, dashT: 0,
    flyA: rnd(0, 6), hp: 1 };
}
function star(x, y, vx, vy, friendly, big = false) {
  return { t: 'star', x, y, vx, vy, friendly, big, spin: 0 };
}
function fireball(x, y, dir) {
  return { t: 'fire', x, y, vx: dir * TU.fireballSpeed, vy: 0, anim: 0, trail: [] };
}
function bomb(x, y, vx) { return { t: 'bomb', x, y, vx, vy: -2.6, anim: 0 }; }
function item(what, x, y) { return { t: 'item', what, x, y, vy: 0, age: 0 }; }
function poof(x, y) { return { t: 'poof', x, y, age: 0 }; }
function pop(x, y, v) { return { t: 'pop', x, y, v, age: 0 }; }
function face(kind) { return { t: 'face', kind, x: G.camX - 14, y: G.camY + 26, age: 0 }; }

function addScore(v, x, y) {
  G.score += v;
  if (x !== undefined) ents.push(pop(x, y, v));
  if (!G.extended && G.score >= TU.extendAt) { G.extended = true; G.lives++; SFX.oneUp(); ents.push(pop(P.x, P.y - 12, '1UP')); }
  if (G.score > G.hi) { G.hi = G.score; localStorage.setItem('knm_hi', G.hi); }
}

/* ============================================================
   PLAYER
   ============================================================ */
function killPlayer() {
  if (P.invuln > 0 || P.dying > 0 || G.chantT > 0) return;
  if (G.power > 0) { G.power = 0; P.invuln = 60; SFX.bossHit(); return; }
  P.dying = 1; P.vy = -3; P.state = 'air';
  SFX.playerDie(); Music.play('death');
}
function fireKillPlayer() {          // monk fire pierces power tiers
  if (P.invuln > 0 || P.dying > 0 || G.chantT > 0) return;
  P.dying = 1; P.vy = -3; P.state = 'air';
  SFX.playerDie(); Music.play('death');
}

function trunkAt(x, y, h) {
  for (const tr of world.trunks) {
    if (Math.abs(x + 5 - tr.x) < 7 && y + h > tr.top && y < tr.bot) return tr;
  }
  return null;
}
function solidUnder(x, y0, y1) {     // top-surface landing test between y0→y1 (feet)
  let best = null;
  if (world.groundY !== null && y0 <= world.groundY && y1 >= world.groundY)
    best = { y: world.groundY, ground: true };
  for (const s of world.solids) {
    if (x + 8 > s.x && x + 2 < s.x + s.w && y0 <= s.y && y1 >= s.y)
      if (!best || s.y < best.y) best = s.floor || s.top || s.canopy ? { y: s.y, s } : { y: s.y, s };
  }
  return best;
}
function rampAt(x, footY) {
  let best = null, bestD = 10;               // ramps can share x-ranges (stacked floors)
  for (const r of world.ramps) {
    const lo = Math.min(r.x0, r.x1), hi = Math.max(r.x0, r.x1);
    if (x + 5 < lo || x + 5 > hi) continue;
    // never mount from the TOP end — walking off a climbed staircase must not
    // catch the stair head and drag the player back down (descend by dropping)
    const topX = r.y1 < r.y0 ? r.x1 : r.x0;
    if (Math.abs(x + 5 - topX) < 14) continue;
    const d = Math.abs(footY - rampY(r, x));
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}
function rampY(r, x) {
  const t = clamp((x + 5 - r.x0) / (r.x1 - r.x0), 0, 1);
  return r.y0 + (r.y1 - r.y0) * t;
}

function updatePlayer() {
  P.anim++;
  if (P.swordT > 0) P.swordT--;
  if (P.throwT > 0) P.throwT--;
  if (P.invuln > 0) P.invuln--;
  if (P.clashBounce !== 0) { P.x += P.clashBounce; P.clashBounce *= 0.8; if (Math.abs(P.clashBounce) < 0.2) P.clashBounce = 0; }

  if (P.dying > 0) {
    P.dying++;
    P.vy = Math.min(P.vy + TU.gravity, 3.5);
    P.y += P.vy;
    if (P.dying > 130) {
      G.lives--;
      if (G.lives < 0) { setMode('gameover'); return; }
      respawn();
    }
    return;
  }

  /* scroll chant: frozen, invulnerable, nearby enemies drop dead */
  if (G.chantT > 0) {
    G.chantT--;
    if (G.chantT % 10 === 0) SFX.chant();
    if (G.chantT % 8 === 0) {
      for (const e of ents) {
        if ((e.t === 'ninja' || e.t === 'monk') && !e.dead &&
            Math.abs(e.x - P.x) < 140 && Math.abs(e.y - P.y) < 140) { slayEnemy(e, 'sword'); break; }
      }
    }
    return;
  }

  if (G.ashuraT > 0) G.ashuraT--;

  const speed = G.power === 2 ? TU.runSpeedFast : TU.runSpeed;

  /* ---------- state machine ---------- */
  if (P.state === 'climb') {
    const tr = P.trunk;
    P.x = tr.x - 5;
    if (pressed.j) { launchJump(pad.left ? -1 : pad.right ? 1 : 0); }
    else if (pad.up) {
      P.y -= TU.climbSpeed;
      if (P.y + P.h < tr.top + 6) {                      // reached trunk top
        const land = solidUnder(P.x, tr.top - 10, tr.top + 8);
        if (land) { P.y = land.y - P.h; P.state = 'ground'; P.trunk = null; }  // mount the canopy
        else launchJump(0, -3.4);
      }
    }
    else if (pad.down) {
      P.y += TU.climbSpeed;
      if (P.y + P.h >= tr.bot) { P.y = tr.bot - P.h; P.state = 'ground'; P.trunk = null; }
    }
    if (P.state === 'climb' && (pressed.left || pressed.right) && !pad.up) {
      P.face = pressed.left ? -1 : 1;            // face out, ready to throw
    }
  }
  else if (P.state === 'air') {
    // committed arc — no steering
    P.vy = Math.min(P.vy + TU.gravity, 3.4);
    P.x += P.vx; P.y += P.vy;
    if (world.ceiling !== null && P.y <= world.ceiling) {   // head bump
      P.y = world.ceiling; P.vy = 0.5; P.vx = 0; SFX.headBump();
    }
    if (P.vy > 0) {
      // cling to trunk when falling with pad neutral
      const tr = trunkAt(P.x, P.y, P.h);
      if (tr && !pad.left && !pad.right && !pad.down && !pad.up && P.y + P.h < tr.bot - 4) {
        P.state = 'climb'; P.trunk = tr; P.vx = P.vy = 0;
      } else {
        // down in the air aims stars — it must never cancel a landing
        const hit = solidUnder(P.x, P.y + P.h - P.vy, P.y + P.h);
        if (hit) {
          P.y = hit.y - P.h; P.vy = 0; P.vx = 0; P.state = 'ground';
          if (hit.s && hit.s.top) reachedWallTop();
        }
      }
    }
    if (world.water && P.vy > 0 && P.y + P.h > world.water.y + 6) { P.state = 'water'; P.vx = 0; P.vy = 0; SFX.splash(); P.y = world.water.y + 2; }
    if (P.y > world.h + 20) { fireKillPlayer(); }           // safety net (shouldn't happen)
  }
  else if (P.state === 'water') {
    if (pad.left) { P.x -= TU.waterSpeed; P.face = -1; }
    if (pad.right) { P.x += TU.waterSpeed; P.face = 1; }
    if (pressed.j) { P.vy = TU.jumpVel * 0.9; P.vx = pad.left ? -TU.jumpVX : pad.right ? TU.jumpVX : 0; P.state = 'air'; SFX.jump(); }
  }
  else if (P.state === 'ramp') {
    const r = P.ramp;
    let mv = 0;
    if (pad.left) { mv = -speed; P.face = -1; }
    if (pad.right) { mv = speed; P.face = 1; }
    P.x += mv;
    const lo = Math.min(r.x0, r.x1), hi = Math.max(r.x0, r.x1);
    if (P.x + 5 < lo - 2 || P.x + 5 > hi + 2) {   // stepped off ramp ends
      P.state = 'ground'; P.ramp = null;
      const land = solidUnder(P.x, P.y, P.y + P.h + 40);
      if (land) P.y = land.y - P.h;
    } else {
      P.y = rampY(r, P.x) - P.h;
    }
    // no jumping on stairs!
  }
  else { /* ground */
    if (pad.left) { P.vx = -speed; P.face = -1; } else if (pad.right) { P.vx = speed; P.face = 1; } else P.vx = 0;
    P.x += P.vx;
    // walked onto a ramp?
    if (world.ramps.length) {
      const r = rampAt(P.x, P.y + P.h);
      if (r) { P.state = 'ramp'; P.ramp = r; P.y = rampY(r, P.x) - P.h; }
    }
    if (P.state === 'ground') {
      // still supported?
      const sup = solidUnder(P.x, P.y + P.h - 2, P.y + P.h + 4);
      if (!sup) { P.state = 'air'; P.vy = 0.4; P.vx = P.vx; }
      else P.y = sup.y - P.h;

      const tr = trunkAt(P.x, P.y, P.h);
      if (pressed.j) {
        launchJump(pad.left ? -1 : pad.right ? 1 : 0);
      }
      else if (pressed.up && tr && P.y + P.h > tr.top + 10) {   // Up = climb at a trunk
        P.state = 'climb'; P.trunk = tr; P.vx = 0;
      }
      else if (pad.down) {
        if (tr && P.y + P.h < tr.bot - 4) { P.state = 'climb'; P.trunk = tr; }
        else if (sup && !sup.ground && !pad.left && !pad.right && pressed.down) {  // drop through platform
          P.y += 6; P.state = 'air'; P.vy = 0.6; P.vx = 0;
        }
      }
    }
  }
  P.x = clamp(P.x, 0, world.w - 12);

  /* ---------- attacks ---------- */
  if (pressed.a) {                     // sword always available, even in water
    P.swordT = 12; SFX.sword();
    swordStrike();
  }
  if (pressed.b && P.state !== 'water') {
    if (G.ashuraT > 0) {
      for (let d = 0; d < 8; d++) {
        const a = d * Math.PI / 4;
        ents.push(star(P.x + 5, P.y + 8, Math.cos(a) * TU.starSpeed, Math.sin(a) * TU.starSpeed, true, true));
      }
      SFX.throwStar();
    } else if (stars < TU.starMax) {
      let vx = P.face * TU.starSpeed, vy = 0;
      if (P.state === 'air' || P.state === 'climb') {        // 8-way aim
        const ax = pad.left ? -1 : pad.right ? 1 : 0;
        const ay = pad.up ? -1 : pad.down ? 1 : 0;
        if (ax || ay) {
          const n = Math.hypot(ax, ay);
          vx = ax / n * TU.starSpeed; vy = ay / n * TU.starSpeed;
          if (ax) P.face = ax;
        }
      }
      ents.push(star(P.x + 5 + P.face * 6, P.y + 8, vx, vy, true, G.power >= 1));
      stars++; P.throwT = 10;
      SFX.throwStar();
    }
  }

  /* ---------- stage goals ---------- */
  if (world.kind === 'forest' && P.x < 20 && G.monksDown >= 4) stageClear();
  if (world.kind === 'moat' && P.x > world.w - 22 && G.moatKills >= 10) stageClear();
  if (world.kind === 'keep' && world.princess && !world.princess.freed) {
    const pr = world.princess;
    if (P.swordT === 11 && Math.abs(P.x - pr.x) < 22 && Math.abs(P.y - pr.y) < 26) {
      pr.freed = true; addScore(3000, pr.x, pr.y - 10); SFX.ropeCut();
      setMode('rescue');
    }
  }

  /* ---------- camera ---------- */
  G.camX = clamp(P.x - 124, 0, world.w - W);
  G.camY = clamp(P.y - 130, 0, world.h - H);
}

function launchJump(dir, vy = TU.jumpVel) {
  P.state = 'air'; P.trunk = null;
  P.vy = vy;
  P.vx = dir * TU.jumpVX;
  if (dir) P.face = dir;
  SFX.jump();
}
function respawn() {
  P.dying = 0; P.invuln = TU.invulnFrames; G.power = 0;
  P.vx = P.vy = 0; P.state = 'air'; P.vy = 0.5;
  // fall back in from above current position
  P.x = clamp(P.x, 16, world.w - 24);
  if (world.kind === 'moat') {                 // snap onto the nearest bank ledge
    let best = world.solids[0], bd = 1e9;
    for (const s of world.solids) {
      const d = Math.abs(s.x + s.w / 2 - P.x);
      if (d < bd) { bd = d; best = s; }
    }
    P.x = clamp(best.x + best.w / 2, 16, world.w - 24);
  }
  P.y = Math.max(world.ceiling ?? 16, G.camY + 8);
  if (world.kind === 'wall') P.y = G.camY + 8;
  Music.play('stage');
}
function reachedWallTop() { if (world.kind === 'wall') stageClear(); }

function clashBlades(e) {              // sword-on-sword: bounce + points, streak per foe
  e.swingT = 0;
  if (G.frames - (e.clashF || 0) > 240) e.clashN = 0;    // streak breaks after ~4s
  e.clashF = G.frames;
  e.clashN = (e.clashN || 0) + 1;
  P.clashBounce = -P.face * 2.4;
  e.x += Math.sign(e.x - P.x) * 6;
  SFX.clash();
  addScore(e.clashN >= 3 ? 1500 : 100, e.x, e.y - 8);
  if (e.clashN >= 3) e.clashN = 0;
}

function swordStrike() {
  const sx = P.x + 5 + P.face * 12, sy = P.y + 10;
  for (const e of ents) {
    if (e.dead) continue;
    if (e.t === 'star' && !e.friendly) {
      if (Math.abs(e.x - sx) < TU.deflectR && Math.abs(e.y - sy) < TU.deflectR) {
        e.dead = true; addScore(50, e.x, e.y - 6); SFX.deflect();
        ents.push(poof(e.x - 3, e.y - 3));
      }
    } else if (e.t === 'ninja' || e.t === 'monk' || e.t === 'boss') {
      if (Math.abs((e.x + e.w / 2) - sx) < TU.swordRange && Math.abs((e.y + e.h / 2) - sy) < TU.swordArc) {
        if (e.t === 'ninja' && e.swingT > 4) clashBlades(e);
        else slayEnemy(e, 'sword');
      }
    } else if (e.t === 'fly' && !e.down) {
      if (Math.abs(e.x - sx) < 14 && Math.abs(e.y - sy) < 14) hitButterfly(e);
    }
  }
}

/* ============================================================
   ENEMIES
   ============================================================ */
const KILL_PTS = {                    // sword / star
  ninja_blue: [200, 100], ninja_red: [300, 150], ninja_black: [300, 150], ninja_teal: [300, 150],
  monk_blue: [1000, 500], monk_red: [3000, 1500], monk_white: [3000, 1500],
  boss_twin: [10000, 5000], boss_swordsman: [15000, 10000], boss_warlord: [20000, 15000],
};

function slayEnemy(e, weapon) {
  if (e.t === 'boss' && !G.butterflyDown) { SFX.deflect(); return; }   // invulnerable
  e.dead = true;
  // signature death: sprite flips flat and tumbles off the bottom of the screen
  ents.push({ t: 'corpse', kind: e.t, pal: e.pal || (e.kind === 'twin' ? 'white' : 'teal'),
              x: e.x, y: e.y, vy: -1.6, face: e.face, age: 0 });
  SFX.enemyDie();
  for (const f of ents) if (f.t === 'fire' && f.owner === e) f.dead = true;   // erase owned fire
  const key = e.t === 'boss' ? 'boss_' + e.kind : e.t + '_' + e.pal;
  const pts = (KILL_PTS[key] || [100, 100])[weapon === 'sword' ? 0 : 1];
  addScore(pts, e.x + 2, e.y - 4);

  if (e.t === 'monk') {
    for (const f of ents) if (f.t === 'fire' && f.owner === e) f.dead = true;  // erase his fire
    if (e.pal === 'blue' && world.kind === 'forest') {
      G.monksDown++;
      if (G.monksDown === 3)         // the red monk appears at the exit side
        ents.push(monk('red', G.camX + 40, world.groundY - 24, { zone: [0, world.w] }));
    } else if (e.pal === 'red' && world.kind === 'forest') G.monksDown++;
  }
  if (e.t === 'ninja') {
    if (world.kind === 'moat') {
      G.moatKills++;
      if (e.pal === 'blue' && weapon === 'sword') {
        G.moatSword++;
        if (G.moatSword === 7 && !G.moatFaceGiven) { G.moatFaceGiven = true; ents.push(face('blue')); }
      }
    }
    if (e.pal === 'red' && world.kind === 'forest') {
      G.redRegionKills.push(e.x);
      G.redRegionKills = G.redRegionKills.filter(x => Math.abs(x - P.x) < 400);
      if (G.redRegionKills.length >= 3) {
        G.redRegionKills = [];
        ents.push(face(Math.random() < 0.5 ? 'gray' : 'red'));
      }
    }
    if (e.pal === 'black') ents.push(item('scroll', e.x, e.y));
    else if (Math.random() < 0.06 && G.power < 2) ents.push(item('orb', e.x, e.y));
  }
  if (e.t === 'boss') {
    if (!ents.some(b => b.t === 'boss' && !b.dead && b !== e)) setMode('clear');
  }
}

function hitButterfly(e) {
  if (e.hitT > 0) return;
  e.hp--; e.hitT = 30;
  SFX.flyHit();
  if (e.hp <= 0) { e.down = true; e.vy = 0; e.hitT = 0; }   // stay visible while it falls
}

function spawnEnemies() {
  if (world.kind === 'duel') return;
  spawnT--;
  if (spawnT > 0) return;
  spawnT = Math.max(30, irnd(50, 110) - G.loopN * 10);

  const alive = ents.filter(e => e.t === 'ninja' && !e.dead).length;
  if (alive >= 4 + G.loopN) return;

  // forest: monk zone-owner pauses ninja spawns
  if (world.kind === 'forest') {
    const cx = G.camX + 128;
    for (const e of ents)
      if (e.t === 'monk' && !e.dead && e.zone && cx > e.zone[0] && cx < e.zone[1]) return;
  }

  const early = G.stateT < 600 && G.loopN === 0;         // opening grace: mostly blue ninjas
  const redBias = world.kind === 'wall' ? 1 : world.kind === 'moat' ? 0 :
                  (early ? 0.05 : 0.25 + G.loopN * 0.15 + G.season * 0.08);
  const pal = Math.random() < redBias ? 'red' : 'blue';

  if (world.kind === 'wall') {          // leap in from the sides
    const left = Math.random() < 0.5;
    const e = ninja('red', left ? -10 : W + 10, G.camY + irnd(20, 160));
    e.vx = (left ? 1 : -1) * rnd(1.2, 2); e.vy = rnd(-3, -1);
    e.ground = false; e.face = left ? 1 : -1;
    ents.push(e);
    return;
  }
  const ahead = Math.random() < 0.7;
  const dir = world.kind === 'forest' ? -1 : 1;             // travel direction
  let x = ahead ? G.camX + (dir > 0 ? W + 12 : -12) : G.camX + (dir > 0 ? -12 : W + 12);
  x = clamp(x, 4, world.w - 14);
  if (Math.abs(x - P.x) < 70) return;                       // never spawn on top of the player
  const e = ninja(pal, x, (world.kind === 'moat' && Math.random() < 0.4) ? world.water.y - 4 : 40);
  e.ground = false;
  if (world.kind === 'moat' && e.y > 100) { e.inWater = true; e.vy = 0; }
  if (world.kind === 'keep') { e.y = world.floors[irnd(0, 3)] - 24; e.ground = true; }
  ents.push(e);
  // keep top floor: endless red monks (bounded population)
  if (world.kind === 'keep' && Math.random() < 0.3 &&
      ents.filter(m => m.t === 'monk' && !m.dead).length < 3)
    ents.push(monk('red', pick([80, 560]), world.floors[3] - 24, { zone: [40, world.w - 40] }));
}

function updateNinja(e) {
  e.anim++;
  if (e.swingT > 0) e.swingT--;
  if (e.still) {                       // black ninja waits at his post
    if (Math.hypot(P.x - e.x, P.y - e.y) < 70) e.still = false;
    return;
  }
  if (e.inWater) {                     // lurker: pop out when player near
    if (Math.abs(P.x - e.x) < 56) { e.inWater = false; e.vy = -5.4; e.ground = false; SFX.splash(); }
    else return;
  }
  const dx = P.x - e.x, dy = P.y - e.y;
  e.think--;
  if (e.ground) {
    if (e.think <= 0) {
      e.think = irnd(20, 60);
      const speed = (e.pal === 'red' ? 1.3 : 1.0) * (1 + G.loopN * 0.12);
      const r = Math.random();
      if (r < 0.55) e.vx = Math.sign(dx || 1) * speed;
      else if (r < 0.75) e.vx = -Math.sign(dx || 1) * speed;
      else e.vx = 0;
      if (Math.random() < 0.3 && Math.abs(dy) > 30) {       // jump toward player's level
        e.vy = rnd(-6.2, -4); e.vx = Math.sign(dx || 1) * rnd(0, TU.jumpVX); e.ground = false;
      }
    }
    // sword swing up close
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20 && e.swingT === 0 && Math.random() < 0.05) {
      e.swingT = 14; e.face = Math.sign(dx || 1);
    }
    if (e.swingT === 7) {              // active frames — cut the player, or clash blades
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
        if (P.swordT > 0) clashBlades(e);
        else killPlayer();
      }
    }
  }
  if (e.vx !== 0) e.face = Math.sign(e.vx);
  // throw stars
  e.starCd--;
  if (e.starCd <= 0 && Math.abs(dx) < 150 && (P.state !== 'water')) {
    e.starCd = irnd(70, 170) - G.loopN * 12;
    e.throwT = 10;
    const a = Math.atan2(dy + 8, dx + 4);
    const q = Math.round(a / (Math.PI / 4)) * Math.PI / 4;   // 8-way quantized
    ents.push(star(e.x + 5, e.y + 8, Math.cos(q) * TU.enemyStar, Math.sin(q) * TU.enemyStar, false));
    SFX.throwStar();
  }
  if (e.throwT > 0) e.throwT--;
  // red ninja smoke bombs (unblockable)
  if (e.pal === 'red') {
    e.bombCd--;
    if (e.bombCd <= 0 && Math.abs(dx) < 130) {
      e.bombCd = irnd(240, 420);
      ents.push(bomb(e.x + 5, e.y + 4, Math.sign(dx) * rnd(1.1, 1.7)));
      SFX.bombThrow();
    }
  }
  enemyPhysics(e);
  if (e.pal !== 'black' &&                                 // the scroll carrier never despawns
      (e.x < G.camX - 40 || e.x > G.camX + W + 40 || e.y > G.camY + H + 60)) e.dead = true;
}

function updateMonk(e) {
  e.anim++;
  if (e.breatheT > 0) e.breatheT--;
  e.face = Math.sign(P.x - e.x) || -1;
  // slow patrol inside zone (bounds inclusive — enemyPhysics clamps to the world)
  e.x += e.vx * 0.5;
  if (e.zone && (e.x <= Math.max(e.zone[0], 2) || e.x >= Math.min(e.zone[1], world.w - 14))) {
    e.vx = -e.vx; e.x += e.vx;
  }
  e.fireCd--;
  if (e.fireCd <= 0 && Math.abs(P.y - e.y) < 40 && Math.abs(P.x - e.x) < 220) {
    e.fireCd = irnd(110, 180) - G.season * 15;
    e.breatheT = 20;
    const f = fireball(e.x + e.face * 8, e.y + 6, e.face);
    f.owner = e;
    ents.push(f);
    SFX.fireball();
  }
  enemyPhysics(e);
}

function updateBoss(e) {
  e.anim++; e.think--;
  const dx = P.x - e.x, dy = P.y - e.y;
  e.face = Math.sign(dx) || -1;
  if (e.kind === 'twin') {             // aggressive white monks (enemyPhysics applies vx)
    if (e.think <= 0) { e.think = irnd(30, 70); e.vx = Math.sign(dx) * rnd(0.4, 0.9); }
    e.fireCd = (e.fireCd || 60) - 1;
    if (e.fireCd <= 0 && Math.abs(dy) < 50) {
      e.fireCd = irnd(80, 130);
      e.breatheT = 20;
      const f = fireball(e.x + e.face * 8, e.y + 6, e.face); f.owner = e;
      ents.push(f); SFX.fireball();
    }
    if (e.breatheT > 0) e.breatheT--;
    enemyPhysics(e);
  }
  else if (e.kind === 'swordsman') {   // fast dueling ninja, deflects stars
    if (e.think <= 0) {
      e.think = irnd(16, 40);
      const r = Math.random();
      if (r < 0.5) e.vx = Math.sign(dx) * rnd(1.6, 2.2);
      else if (r < 0.7 && e.ground) { e.vy = rnd(-6.4, -4.5); e.vx = Math.sign(dx) * rnd(1, 2); e.ground = false; }
      else e.vx = 0;
    }
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20 && e.swingT <= 0 && Math.random() < 0.09) e.swingT = 12;
    if (e.swingT > 0) {
      e.swingT--;
      if (e.swingT === 6 && Math.abs(dx) < 20 && Math.abs(dy) < 18) {
        if (P.swordT > 0) clashBlades(e);
        else killPlayer();
      }
    }
    enemyPhysics(e);
  }
  else {                               // warlord: swooping flyer
    e.flyA += 0.03;
    if (e.dashT > 0) {                 // diving slash — blades out only mid-dive
      e.dashT--;
      e.x = clamp(e.x + e.vx, 4, world.w - e.w - 4);
      e.y = Math.max(e.y + e.vy, 16);
      if (e.y + e.h >= world.groundY) { e.y = world.groundY - e.h; e.dashT = 0; }
      const slashing = e.dashT > 8 && e.dashT < 34;
      if (slashing && Math.abs(P.x - e.x) < 14 && Math.abs(P.y - e.y) < 16 && !(P.swordT > 0)) killPlayer();
    } else {
      e.x = 128 + Math.cos(e.flyA) * 92;
      e.y = 70 + Math.sin(e.flyA * 2.1) * 34;
      if (e.think <= 0) { e.think = irnd(90, 150); e.dashT = 40; const a = Math.atan2(P.y - e.y, P.x - e.x); e.vx = Math.cos(a) * 3; e.vy = Math.sin(a) * 3; }
    }
  }
}

function enemyPhysics(e) {
  e.x += (e.ground ? 0 : e.vx);
  if (e.ground && e.t !== 'monk') e.x += e.vx;
  e.vy = Math.min(e.vy + TU.gravity, 3.4);
  const py = e.y;
  e.y += e.ground ? 0 : e.vy;
  if (!e.ground && e.vy > 0) {
    const hit = solidUnder(e.x, py + e.h, e.y + e.h);
    if (hit) { e.y = hit.y - e.h; e.vy = 0; e.ground = true; }
    if (world.water && e.y + e.h > world.water.y + 8) { e.dead = true; ents.push(poof(e.x, e.y)); SFX.splash(); }
  }
  if (e.ground) {
    const sup = solidUnder(e.x, e.y + e.h - 2, e.y + e.h + 4);
    if (!sup) { e.ground = false; e.vy = 0.4; }
    else e.y = sup.y - e.h;
  }
  e.x = clamp(e.x, 0, world.w - 10);
}

/* ============================================================
   ENTITY UPDATE
   ============================================================ */
function hitPlayerBox(x, y, w, h) {
  const crouch = P.state === 'ground' && pad.down;
  const py = P.y + (crouch ? 8 : 0), ph = P.h - (crouch ? 8 : 0);
  return x < P.x + 10 && x + w > P.x && y < py + ph && y + h > py;
}

function updateEnts() {
  spawnEnemies();
  for (const e of ents) {
    if (e.dead) continue;
    switch (e.t) {
      case 'ninja': updateNinja(e); break;
      case 'monk': updateMonk(e); break;
      case 'boss': updateBoss(e); break;
      case 'fly': {
        if (e.down) {
          e.y = Math.min(e.y + 1.2, world.groundY - 6);
          if (!G.butterflyDown && e.y >= world.groundY - 6) { G.butterflyDown = true; addScore(500, e.x, e.y - 8); }
          break;
        }
        if (e.hitT > 0) e.hitT--;
        e.a += 0.04;
        e.x = 128 + Math.cos(e.a) * 84;
        e.y = 52 + Math.sin(e.a * 1.7) * 26;
        break;
      }
      case 'star': {
        e.x += e.vx; e.y += e.vy; e.spin++;
        const sz = e.big ? 7 : 4;
        if (e.friendly) {
          for (const o of ents) {
            if (o.dead) continue;
            if (o.t === 'ninja' || o.t === 'monk' || o.t === 'boss') {
              if (e.x + sz > o.x && e.x < o.x + o.w && e.y + sz > o.y && e.y < o.y + o.h) {
                if (o.t === 'boss' && o.kind === 'swordsman' && o.ground && Math.sign(e.vx) === -o.face) {
                  e.dead = true; SFX.deflect(); ents.push(poof(e.x - 2, e.y - 2)); break;  // he parries
                }
                if (o.t === 'boss' && !G.butterflyDown) { e.dead = true; SFX.deflect(); break; }
                slayEnemy(o, 'star');
                if (!e.big) { e.dead = true; }
                break;
              }
            } else if (o.t === 'fly' && !o.down) {
              if (Math.abs(e.x - o.x) < 8 && Math.abs(e.y - o.y) < 8) { hitButterfly(o); e.dead = true; break; }
            }
          }
        } else if (hitPlayerBox(e.x, e.y, 4, 4)) { e.dead = true; killPlayer(); }
        if (e.x < G.camX - 20 || e.x > G.camX + W + 20 || e.y < G.camY - 20 || e.y > G.camY + H + 20) e.dead = true;
        break;
      }
      case 'fire': {
        e.x += e.vx; e.anim++;
        e.trail.push({ x: e.x, y: e.y });
        if (e.trail.length > 6) e.trail.shift();
        if (hitPlayerBox(e.x, e.y, 6, 6)) { e.dead = true; fireKillPlayer(); }
        if (e.x < G.camX - 30 || e.x > G.camX + W + 30) e.dead = true;
        break;
      }
      case 'bomb': {
        e.vy += TU.bombG; e.x += e.vx; e.y += e.vy; e.anim++;
        if (hitPlayerBox(e.x, e.y, 5, 5)) { e.dead = true; killPlayer(); }
        const hit = solidUnder(e.x, e.y + 3, e.y + 5);
        if (hit || e.y > world.h) { e.dead = true; ents.push(poof(e.x - 2, e.y - 4)); }
        break;
      }
      case 'poof': e.age++; if (e.age > 18) e.dead = true; break;
      case 'corpse':
        e.age++; e.vy = Math.min(e.vy + 0.12, 3.5); e.y += e.vy; e.x += e.face * 0.3;
        if (e.y > G.camY + H + 30) e.dead = true;
        break;
      case 'pop': e.age++; e.y -= 0.35; if (e.age > 45) e.dead = true; break;
      case 'item': {
        e.age++;
        if (e.what === 'orb') { e.vy = Math.min(e.vy + 0.06, 1.4); e.y += e.vy;
          const hit = solidUnder(e.x, e.y + 6, e.y + 8); if (hit) { e.y = hit.y - 8; e.vy = 0; } }
        if (e.age > 900) e.dead = true;
        if (hitPlayerBox(e.x - 2, e.y - 2, 11, 11)) {
          e.dead = true;
          if (e.what === 'orb') { G.power = Math.min(2, G.power + 1); addScore(1000, e.x, e.y - 8); SFX.pickup(); }
          else { G.chantT = TU.chantFrames; addScore(500, e.x, e.y - 8); SFX.scrollGet(); }
        }
        break;
      }
      case 'face': {
        e.age++;
        e.x += 0.8;                                     // walks across the sky
        e.y = G.camY + 26 + Math.sin(e.age * 0.08) * 6;
        if (e.x > G.camX + W + 16) e.dead = true;
        if (hitPlayerBox(e.x, e.y, 12, 12)) {
          e.dead = true; SFX.faceGet();
          if (e.kind === 'gray') addScore(10000, e.x, e.y);
          else if (e.kind === 'red') { G.ashuraT = TU.ashuraFrames; ents.push(pop(e.x, e.y, 'ASHURA')); }
          else { G.lives++; SFX.oneUp(); ents.push(pop(e.x, e.y, '1UP')); }
        }
        break;
      }
    }
  }
  stars = ents.filter(e => e.t === 'star' && e.friendly && !e.dead).length;
  ents = ents.filter(e => !e.dead);
}

/* ============================================================
   FLOW
   ============================================================ */
function setMode(m) {
  G.mode = m; G.stateT = 0;
  if (m === 'play') Music.play('stage');
  else if (m === 'rescue') { Music.play('rescue'); SFX.rescueCue(); }
  else if (m === 'kidnap') Music.play('prologue');
  else if (m === 'clear') Music.play('rescue');
  else if (m === 'ending') Music.play('ending');
  else if (m === 'title') Music.play('prologue');
  else if (m === 'story') Music.play('prologue');
  else if (m === 'gameover') Music.stop();
}
function startGame() {
  G.score = 0; G.lives = 3; G.power = 0; G.season = 0; G.loopN = 0; G.stage = 0;
  G.extended = false;
  P.invuln = 0; P.dying = 0;
  buildStage(); setMode('story');
}
function stageClear() {
  G.stage++;
  buildStage();
  setMode('story');
}

/* ============================================================
   MAIN UPDATE
   ============================================================ */
function update() {
  G.frames++; G.stateT++;
  if (rawKeys.KeyM && !G._m) { G._m = true; APU.toggleMute(); }
  if (!rawKeys.KeyM) G._m = false;

  switch (G.mode) {
    case 'title':
      if (pressed.start || pressed.a || pressed.b) { APU.init(); Music.onAudioReady(); startGame(); }
      break;
    case 'story':
      if (G.stateT > 160 || pressed.start || pressed.a) setMode('play');
      break;
    case 'play':
      if (pressed.start) { G.paused = !G.paused; SFX.pause(); }
      if (G.paused) break;
      updatePlayer();
      if (G.mode !== 'play') break;
      updateEnts();
      break;
    case 'rescue':                     // walk-out cinematic, then re-kidnap
      if (G.stateT > 200) setMode('kidnap');
      break;
    case 'kidnap':
      if (G.stateT === 1) SFX.playerDie();
      if (G.stateT > 170) { G.stage = 4; buildStage(); setMode('story'); }
      break;
    case 'clear': {                    // boss beaten → season turns
      if (G.stateT > 220) {
        G.season++;
        if (G.season % 3 === 0) setMode('ending');
        else { G.stage = 0; buildStage(); setMode('story'); }
      }
      break;
    }
    case 'ending':
      if (G.stateT > 480 || (G.stateT > 90 && pressed.start)) {
        G.loopN++; G.stage = 0;
        buildStage(); setMode('story');
      }
      break;
    case 'gameover':
      if (G.stateT > 60 && (pressed.start || pressed.a)) setMode('title');
      break;
  }
}

/* ============================================================
   DRAW
   ============================================================ */
function palArr(o) { const a = []; for (const k in o) a[+k] = o[k]; return a; }
const PLAYER_TIER = () => G.power === 2 ? S.PLAYER_PALS.full : G.power === 1 ? S.PLAYER_PALS.power : S.PLAYER_PALS.normal;

function drawBackdrop() {
  // moonlit indigo night, every season, every stage
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, W, H);
  blit(sprite(S.MOON, ['#f8f8d8'], 'moon'), 206, 18 + Math.max(0, -G.camY * 0.02));
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = i % 3 ? '#7627ff' : '#fcfcfc';
    ctx.fillRect((i * 89 + 31) % W, (i * 47 + 11) % 80, 1, 1);
  }
  // violet silhouette trees — same-layer fake depth (forest & duel)
  if (world && world.bgTrees) {
    for (const b of world.bgTrees) {
      const sx = b.x - G.camX;
      if (sx < -30 || sx > W + 20) continue;
      const gy = world.groundY - G.camY;
      ctx.fillStyle = '#1412a8';
      ctx.fillRect(sx + 5, gy - 108, 5, 108);
      ctx.fillStyle = '#7627ff';
      ctx.beginPath(); ctx.arc(sx + 7, gy - 110, 13, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(sx - 3, gy - 96, 9, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + 17, gy - 96, 9, 0, 7); ctx.fill();
    }
  }
}

function worldBlit(img, x, y, flip) { blit(img, x - G.camX, y - G.camY, flip); }

function drawWorld() {
  const s = seasonPal();
  if (world.kind === 'forest' || world.kind === 'duel') {
    for (const tr of world.trunks)
      for (let y = tr.top; y < tr.bot; y += 16)
        worldBlit(sprite(S.TRUNK, [s.trunk2, s.trunk1], 'tr' + s.name), tr.x - 8, y);
    for (const p of world.solids) {
      if (!p.canopy) continue;
      for (let x = 0; x < p.w; x += 16)
        worldBlit(sprite(S.CANOPY, [s.leaf2, s.leaf1, s.leaf2], 'cn' + s.name), p.x + x, p.y - 12);
    }
    drawGround(s);
    for (let x = 48; x < world.w; x += 176)
      worldBlit(sprite(S.BUSH, [s.leaf2, s.leaf1, s.leaf2], 'bs' + s.name), x, world.groundY - 16);
  }
  else if (world.kind === 'moat') {
    // pale pink brick wall fills the screen
    for (let x = 0; x < W + 16; x += 16)
      for (let y = 0; y < world.water.y - G.camY; y += 16)
        blit(sprite(S.WALLTILE, ['#994f00', '#fbc3fe'], 'wlm'), x - (G.camX % 16), y);
    ctx.fillStyle = '#2c0e00'; ctx.fillRect(0, 0, W, 12);          // dark overhang
    ctx.fillStyle = s.water;
    ctx.fillRect(0, world.water.y - G.camY, W, H);
    ctx.fillStyle = '#d4d3fe';
    for (let x = 0; x < W; x += 8) ctx.fillRect(x + ((G.frames >> 3) % 8), world.water.y - G.camY, 4, 2);
    for (const p of world.solids) {
      const sx = p.x - G.camX; if (sx + p.w < 0 || sx > W) continue;
      ctx.fillStyle = s.g1; ctx.fillRect(sx, p.y - G.camY, p.w, 4);
      ctx.fillStyle = s.g0; ctx.fillRect(sx, p.y - G.camY, p.w, 2);
      ctx.fillStyle = '#571d00'; ctx.fillRect(sx, p.y - G.camY + 4, p.w, world.water.y - p.y - 2);
    }
  }
  else if (world.kind === 'wall') {
    // gray cobble with pink mortar
    for (let y = -16; y < H + 16; y += 16)
      for (let x = 0; x < W; x += 16)
        blit(sprite(S.WALLTILE, ['#fbc3fe', '#aeaeae'], 'wlc'), x, y - (G.camY % 16));
    for (const p of world.solids) {
      const sy = p.y - G.camY; if (sy < -8 || sy > H + 8) continue;
      ctx.fillStyle = '#343500'; ctx.fillRect(p.x - G.camX, sy, p.w, 5);
      ctx.fillStyle = s.leaf1; ctx.fillRect(p.x - G.camX + 2, sy, 4, 2);   // moss tuft
      ctx.fillStyle = '#fefefe'; ctx.fillRect(p.x - G.camX, sy, p.w, 1);
    }
    // crimson rocky base + water at the bottom of the world
    const by = world.groundY - G.camY;
    if (by < H) {
      ctx.fillStyle = '#6e0040'; ctx.fillRect(0, by, W, 8);
      ctx.fillStyle = s.water; ctx.fillRect(0, by + 8, W, H - by);
    }
    if (G.stateT < 150 && G.mode === 'play') text('↑', 124, 200, (G.frames >> 4) % 2 ? '#fcfcfc' : '#aeaeae');
  }
  else if (world.kind === 'keep') {
    // seasonal interior wall + timber framing
    ctx.fillStyle = s.keepWall; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#6c6e00';
    for (let x = 0; x < W + 32; x += 64) ctx.fillRect(x - (G.camX % 64), 0, 6, H);
    // folding-screen décor panels
    for (let x = 24; x < world.w; x += 200) {
      const sx = x - G.camX; if (sx < -40 || sx > W) continue;
      for (const f of world.floors) {
        const sy = f - G.camY - 46;
        if (sy < -40 || sy > H) continue;
        ctx.fillStyle = '#9390fe'; ctx.fillRect(sx, sy, 36, 30);
        ctx.fillStyle = '#fcfcfc';
        ctx.beginPath(); ctx.moveTo(sx + 6, sy + 24); ctx.lineTo(sx + 14, sy + 10); ctx.lineTo(sx + 22, sy + 24); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sx + 16, sy + 24); ctx.lineTo(sx + 26, sy + 6); ctx.lineTo(sx + 34, sy + 24); ctx.fill();
      }
    }
    for (const f of world.floors) {
      const sy = f - G.camY; if (sy < -8 || sy > H + 8) continue;
      ctx.fillStyle = '#aeaeae'; ctx.fillRect(0, sy, W, 4);
      ctx.fillStyle = '#666666'; ctx.fillRect(0, sy + 4, W, 3);
    }
    for (const tr of world.trunks)
      for (let y = tr.top; y < tr.bot; y += 16)
        worldBlit(sprite(S.COLUMN, palArr(S.COLUMN_PAL), 'col'), tr.x - 4, y);
    for (const r of world.ramps) {                       // dark-red zig-zag staircases
      const steps = 11;
      for (let i = 0; i <= steps; i++) {
        const x = r.x0 + (r.x1 - r.x0) * i / steps, y = r.y0 + (r.y1 - r.y0) * i / steps;
        ctx.fillStyle = '#b53220'; ctx.fillRect(x - G.camX - 6, y - G.camY, 13, 3);
        ctx.fillStyle = '#6c0700'; ctx.fillRect(x - G.camX - 6, y - G.camY + 3, 13, 2);
      }
      // railing
      ctx.strokeStyle = '#6c0700';
      ctx.beginPath();
      ctx.moveTo(r.x0 - G.camX, r.y0 - G.camY - 12);
      ctx.lineTo(r.x1 - G.camX, r.y1 - G.camY - 12);
      ctx.stroke();
    }
    if (world.princess) {
      const pr = world.princess;
      worldBlit(sprite(S.PRINCESS, palArr(S.PRINCESS_PAL), 'pr'), pr.x, pr.y);
      if (!pr.freed) worldBlit(sprite(S.ROPE, palArr(S.ROPE_PAL), 'rope'), pr.x + 6, pr.y - 2);
    }
  }
}

function drawGround(s) {
  const gy = world.groundY - G.camY;
  if (gy > H) return;
  for (let x = 0; x < W + 16; x += 16)
    blit(sprite(S.GROUND, [s.g0, s.g1, s.g2], 'gd' + s.name), x - (G.camX % 16), gy);
}

function playerSprite() {
  const pal = palArr(PLAYER_TIER());
  const k = 'pl' + G.power;
  if (P.dying > 0) return sprite(S.P_DEAD, pal, k + 'dd');
  if (G.chantT > 0) return sprite(S.P_IDLE, pal, k + 'ch');
  if (P.swordT > 4) return sprite(S.P_SLASH, pal, k + 'sl');
  if (P.throwT > 4) return sprite(S.P_THROW, pal, k + 'th');
  if (P.state === 'climb') return sprite((P.anim >> 3) % 2 ? S.P_CLIMB1 : S.P_CLIMB2, pal, k + 'cl' + ((P.anim >> 3) % 2));
  if (P.state === 'air') return sprite(S.P_JUMP, pal, k + 'jp');
  if (P.state === 'water') return sprite(S.P_CROUCH, pal, k + 'wt');
  if (P.state === 'ground' && pad.down) return sprite(S.P_CROUCH, pal, k + 'cr');
  if (Math.abs(P.vx) > 0.2 || P.state === 'ramp') return sprite((P.anim >> 3) % 2 ? S.P_RUN1 : S.P_RUN2, pal, k + 'r' + ((P.anim >> 3) % 2));
  return sprite(S.P_IDLE, pal, k + 'id');
}

function drawPlayer() {
  if (P.invuln > 0 && (G.frames >> 2) % 2) return;
  if (P.state === 'water') {           // half submerged
    const img = playerSprite();
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, world.water.y - G.camY + 4); ctx.clip();
    worldBlit(img, P.x - 3, P.y - 10, P.face > 0);
    ctx.restore();
    // breathing reed
    ctx.fillStyle = '#00a844'; ctx.fillRect(P.x + 4 - G.camX, world.water.y - G.camY - 6, 2, 6);
    return;
  }
  worldBlit(playerSprite(), P.x - 3, P.y - 2, P.face > 0);
  if (G.ashuraT > 0 && (G.frames >> 2) % 2)
    text('*', P.x - G.camX + 2, P.y - G.camY - 10, '#f8f800');
}

function enemySprite(e) {
  if (e.t === 'monk' || (e.t === 'boss' && e.kind === 'twin')) {
    const pal = palArr(S.MONK_PALS[e.t === 'boss' ? 'white' : e.pal]);
    const k = 'mk' + (e.t === 'boss' ? 'w' : e.pal);
    if (e.breatheT > 0) return sprite(S.M_BREATHE, pal, k + 'b');
    return sprite((e.anim >> 4) % 2 ? S.M_WALK1 : S.M_WALK2, pal, k + ((e.anim >> 4) % 2));
  }
  if (e.t === 'boss' && e.kind === 'warlord') return sprite(S.S_STAND, palArr(S.SAMURAI_PAL), 'war');
  const pal = palArr(S.ENEMY_PALS[e.t === 'boss' ? 'teal' : e.pal]);
  const k = 'nj' + (e.t === 'boss' ? 'teal' : e.pal);
  if (e.swingT > 4) return sprite(S.E_SLASH, pal, k + 'sl');
  if (e.throwT > 0) return sprite(S.E_THROW, pal, k + 'th');
  if (!e.ground) return sprite(S.E_JUMP, pal, k + 'jp');
  if (Math.abs(e.vx) > 0.1) return sprite((e.anim >> 3) % 2 ? S.E_RUN1 : S.E_RUN2, pal, k + 'r' + ((e.anim >> 3) % 2));
  return sprite(S.E_IDLE, pal, k + 'id');
}

function drawEnts() {
  for (const e of ents) {
    const sx = e.x - G.camX, sy = e.y - G.camY;
    switch (e.t) {
      case 'ninja': case 'monk': case 'boss': {
        if (e.t === 'ninja' && e.inWater) {         // lurking head + reed
          ctx.fillStyle = '#3050c8'; ctx.fillRect(sx + 2, world.water.y - G.camY - 3, 7, 3);
          ctx.fillStyle = '#00a844'; ctx.fillRect(sx + 4, world.water.y - G.camY - 8, 2, 5);
          break;
        }
        worldBlit(enemySprite(e), e.x - 3, e.y - 2, e.face > 0);
        break;
      }
      case 'fly': {
        if (e.hitT % 4 > 1) break;
        const f = (G.frames >> 3) % 2 ? S.FLY1 : S.FLY2;
        worldBlit(sprite(f, palArr(S.FLY_PALS[5 - Math.max(e.hp, 1)] || S.FLY_PALS[0]), 'fly' + e.hp + ((G.frames >> 3) % 2)), e.x - 5, e.y - 4);
        break;
      }
      case 'star': {
        const img = sprite((e.spin >> 2) % 2 ? S.SHURIKEN1 : S.SHURIKEN2, ['#fcfcfc'], 'st' + ((e.spin >> 2) % 2));
        if (e.big) { ctx.save(); ctx.translate(sx - 3, sy - 3); ctx.scale(2, 2); ctx.drawImage(img, 0, 0); ctx.restore(); }
        else worldBlit(img, e.x - 1, e.y - 1);
        break;
      }
      case 'fire': {
        for (let i = 0; i < e.trail.length - 1; i++) {
          ctx.fillStyle = i % 2 ? '#f83800' : '#f8b800';
          ctx.fillRect(e.trail[i].x - G.camX, e.trail[i].y - G.camY + 1, 3, 3);
        }
        worldBlit(sprite((e.anim >> 2) % 2 ? S.FIREBALL1 : S.FIREBALL2, palArr(S.FIRE_PAL), 'fb' + ((e.anim >> 2) % 2)), e.x - 2, e.y - 2);
        break;
      }
      case 'bomb':
        worldBlit(sprite(S.BOMB, palArr(S.BOMB_PAL), 'bm'), e.x - 2, e.y - 2);
        break;
      case 'poof': {
        const f = e.age < 6 ? S.POOF1 : e.age < 12 ? S.POOF2 : S.POOF3;
        worldBlit(sprite(f, ['#fcfcfc'], 'pf' + (e.age < 6 ? 1 : e.age < 12 ? 2 : 3)), e.x, e.y);
        break;
      }
      case 'pop': text('' + e.v, sx - 8, sy - 8, '#fcfcfc'); break;
      case 'corpse': {
        // draw the enemy sprite rotated flat (lying on its back), tumbling down
        const img = e.kind === 'monk' || e.pal === 'white'
          ? sprite(S.M_WALK1, palArr(S.MONK_PALS[e.pal] || S.MONK_PALS.blue), 'cp_m' + e.pal)
          : sprite(S.E_IDLE, palArr(S.ENEMY_PALS[e.pal] || S.ENEMY_PALS.blue), 'cp_n' + e.pal);
        ctx.save();
        ctx.translate(sx + 8, sy + 12);
        ctx.rotate(e.face > 0 ? Math.PI / 2 : -Math.PI / 2);
        ctx.drawImage(img, -8, -12);
        ctx.restore();
        break;
      }
      case 'item':
        if (e.what === 'orb') worldBlit(sprite(S.ORB, palArr(S.ORB_PAL), 'orb'), e.x, e.y);
        else worldBlit(sprite(S.SCROLL, palArr(S.SCROLL_PAL), 'scr'), e.x, e.y);
        break;
      case 'face':
        worldBlit(sprite(S.FACE, palArr(S.FACE_PALS[e.kind]), 'fc' + e.kind), e.x, e.y);
        break;
    }
  }
  /* chant aura */
  if (G.chantT > 0) {
    ctx.fillStyle = (G.frames >> 2) % 2 ? '#f8f800' : '#fcfcfc';
    const sx = P.x - G.camX + 5, sy = P.y - G.camY + 10;
    for (let i = 0; i < 6; i++) {
      const a = G.frames * 0.15 + i;
      ctx.fillRect(sx + Math.cos(a) * 16 - 1, sy + Math.sin(a) * 16 - 1, 2, 2);
    }
  }
}

function drawHUD() {
  // top-left: red 1UP label, white score beneath; top-center: hi-score
  text('1UP', 8, 4, '#f83800');
  text(String(G.score).padStart(6, '0'), 8, 13, '#fcfcfc');
  text('HI', 108, 4, '#f83800');
  text(String(G.hi).padStart(6, '0'), 104, 13, '#fcfcfc');
  // bottom-left: hero icon + remaining lives digit
  ctx.fillStyle = '#f83800'; ctx.fillRect(8, H - 12, 5, 8);
  ctx.fillStyle = '#f0d0b0'; ctx.fillRect(9, H - 11, 3, 2);
  text('' + Math.max(0, G.lives), 18, H - 12, '#fcfcfc');
  // stage-specific counters
  if (world.kind === 'moat') {
    const left = Math.max(0, 10 - G.moatKills);
    text('' + left, W - 20, H - 12, left === 0 ? '#f8f800' : '#4290ff');
    if (left === 0) text('GO→', W - 34, H - 24, (G.frames >> 4) % 2 ? '#f8f800' : '#fc9838');
  }
  if (world.kind === 'forest') {
    const left = Math.max(0, 4 - G.monksDown);
    text('MONK ' + left, W - 64, H - 12, left === 0 ? '#f8f800' : '#fcfcfc');
    if (left === 0) text('←GO', 8, H - 24, (G.frames >> 4) % 2 ? '#f8f800' : '#fc9838');
  }
  if (G.paused) text('PAUSE', W / 2 - 20, 112, (G.frames >> 4) % 2 ? '#fcfcfc' : '#f8f800');
}

function drawTitle() {
  // black bg, flanking full-height trees built from game assets, hero perched
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, H);
  const s = SEASONS[0];
  for (const [tx, cy] of [[10, 96], [228, 128]]) {
    for (let y = 0; y < H; y += 16)
      blit(sprite(S.TRUNK, [s.trunk2, s.trunk1], 'trS'), tx, y);
    for (let x = -16; x <= 16; x += 16)
      blit(sprite(S.CANOPY, [s.leaf2, s.leaf1, s.leaf2], 'cnS'), tx + x, cy);
  }
  blit(sprite(S.P_IDLE, palArr(S.PLAYER_PALS.normal), 'ttlP'), 12, 74, true);
  text('PLAYER 1', 12, 4, '#f83800');
  text('HI SCORE', 96, 4, '#f83800');
  text(String(G.hi).padStart(6, '0'), 104, 13, '#fcfcfc');
  text('the tale of', W / 2 - 44, 60, '#f83800');
  text('KAGE NO MORI', W / 2 - 48, 74, '#f83800');
  text('KAGE NO MORI', W / 2 - 47, 75, '#6c0700');
  text('SHADOW OF THE FOREST', W / 2 - 80, 92, '#f8d878');
  if ((G.frames >> 5) % 2) text(touchEnabled ? 'TAP TO START' : 'PUSH ENTER', W / 2 - 48, 130, '#fcfcfc');
  if (!touchEnabled) text('SPACE JUMP X SWORD Z STAR', W / 2 - 100, 152, '#aeaeae');
  text('AN ORIGINAL HOMAGE', W / 2 - 72, 212, '#666666');
  text('© 2026 SEVENUPHOME', W / 2 - 72, 224, '#666666');
}

function drawStory() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const s = seasonPal();
  if ((G.stateT >> 4) % 3 === 0 && G.stage === 0 && G.stateT < 60) { ctx.fillStyle = '#fcfcfc'; ctx.fillRect(0, 0, W, H); }  // lightning
  text('CHAPTER OF ' + s.name, W / 2 - ('CHAPTER OF '.length + s.name.length) * 4, 76, '#f8d878');
  text('STAGE ' + (G.stage + 1) + ' · ' + STAGE_NAMES[G.stage], W / 2 - (10 + STAGE_NAMES[G.stage].length) * 4, 100, '#fcfcfc');
  if (G.stage === 0) text('LADY KAEDE IS TAKEN!', W / 2 - 80, 128, '#f870b8');
  if (G.stage === 4) text(BOSSES[G.season % 3] + ' AWAITS', W / 2 - (BOSSES[G.season % 3].length + 7) * 4, 128, '#fc4444');
  if (G.loopN > 0) text('LOOP ' + (G.loopN + 1), W / 2 - 24, 150, '#7c7c7c');
}

function drawRescue() {
  drawScene();
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 68, W, 76);
  text('LADY KAEDE IS FREE!', W / 2 - 76, 84, '#f870b8');
  text('+3000', W / 2 - 20, 100, '#f8f800');
  text('ESCAPE THE CASTLE...', W / 2 - 80, 120, '#f8d878');
}
function drawKidnap() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (G.stateT < 30 && (G.stateT >> 2) % 2) { ctx.fillStyle = '#fcfcfc'; ctx.fillRect(0, 0, W, H); return; }
  const t = clamp(G.stateT / 160, 0, 1);
  blit(sprite(S.E_RUN1, palArr(S.ENEMY_PALS.black), 'kd1'), 30 + t * 200, 90 - Math.sin(t * Math.PI) * 30, true);
  blit(sprite(S.PRINCESS, palArr(S.PRINCESS_PAL), 'kd2'), 40 + t * 200, 96 - Math.sin(t * Math.PI) * 30, true);
  text('SEIZED AGAIN!', W / 2 - 52, 160, '#fc4444');
  text('TO THE SHOWDOWN!', W / 2 - 64, 180, '#f8d878');
}
function drawClear() {
  drawScene();
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 68, W, 76);
  text(BOSSES[G.season % 3] + ' FALLS!', W / 2 - (BOSSES[G.season % 3].length + 7) * 4, 84, '#fc4444');
  text('LADY KAEDE IS SAFE', W / 2 - 72, 104, '#f870b8');
  text('THE SEASON TURNS...', W / 2 - 76, 124, '#f8d878');
}
function drawEnding() {
  ctx.fillStyle = '#0c0c2c'; ctx.fillRect(0, 0, W, H);
  blit(sprite(S.MOON, ['#f8f8d8'], 'moon'), 196, 26);
  blit(sprite(S.P_IDLE, palArr(S.PLAYER_PALS.normal), 'endP'), 104, 150, true);
  blit(sprite(S.PRINCESS, palArr(S.PRINCESS_PAL), 'endK'), 132, 150);
  ctx.fillStyle = '#101040'; ctx.fillRect(0, 174, W, 66);
  text('THE WARLORD HAS FALLEN', W / 2 - 88, 60, '#f8d878');
  text('PEACE RETURNS TO THE FOREST', W / 2 - 108, 80, '#fcfcfc');
  text('BUT SHADOWS NEVER REST...', W / 2 - 100, 100, '#7c7c7c');
  text('SCORE ' + String(G.score).padStart(6, '0'), W / 2 - 48, 196, '#f8f800');
}

function drawScene() {
  drawBackdrop();
  drawWorld();
  drawEnts();
  drawPlayer();
  drawHUD();
}

function draw() {
  switch (G.mode) {
    case 'title': drawTitle(); break;
    case 'story': drawStory(); break;
    case 'rescue': drawRescue(); break;
    case 'kidnap': drawKidnap(); break;
    case 'clear': drawClear(); break;
    case 'ending': drawEnding(); break;
    case 'gameover':
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      text('GAME OVER', W / 2 - 36, 100, '#fc4444');
      text(String(G.score).padStart(6, '0'), W / 2 - 24, 122, '#fcfcfc');
      if (G.stateT > 60 && (G.frames >> 5) % 2) text('PUSH ENTER', W / 2 - 40, 150, '#f8d878');
      break;
    default: drawScene();
  }
}

/* ============================================================
   BOOT
   ============================================================ */
addEventListener('pointerdown', () => { APU.init(); Music.onAudioReady(); });
addEventListener('keydown', () => { APU.init(); Music.onAudioReady(); });
initTouch();
// tapping the screen itself acts as START on menu-type screens (never mid-play)
cvs.addEventListener('pointerdown', () => {
  if (['title', 'gameover', 'story', 'ending'].includes(G.mode)) pulse('start');
});
window.__game = {
  G, P, TU, pad, get world() { return world; }, get ents() { return ents; },
  setMode, startGame, buildStage,
  forceTouch: () => initTouch(true),
  // synchronous test pump: run n logic frames + one draw, independent of rAF
  step(n = 1) { for (let i = 0; i < n; i++) { latchInput(); update(); } draw(); },
};
buildStage();
setMode('title');
runLoop(update, draw);
