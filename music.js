/* ============================================================
   KAGE NO MORI — original chiptune soundtrack + SFX
   Structure follows 1986 practice: ONE long relentless stage
   theme (looped through every stage and boss), a bright rescue
   loop, a dissonant prologue sting, and a falling death jingle.
   Pulse 1 = thin-duty lead; Pulse 2 = 2-step delayed echo of
   the lead (cheap reverb); Triangle = pumping 8th bass; Noise
   = ticky hats / light backbeat. All compositions original.
   In-sen colour: A, Bb, D, E, G  → semitones 0,1,5,7,10.
   Yo colour:     A, B, D, E, F#  → semitones 0,2,5,7,9.
   ============================================================ */
import { APU, blip, noiseHit } from './engine.js';

const ST = n => n === null ? null : 220 * Math.pow(2, n / 12);   // semitones from A3

const A_ = null;   // rest shorthand

/* ---------- stage theme: A A' B C, 128 steps ≈ 26 s at 148 BPM ---------- */
const LEAD_A = [
  0,A_,0,1,  0,A_,5,A_,   7,A_,5,7,  10,A_,7,5,
  0,A_,0,1,  0,A_,5,A_,   7,10,7,5,  1,A_,0,A_,
];
const LEAD_A2 = [
  0,A_,0,1,  0,A_,5,A_,   7,A_,5,7,  10,A_,12,A_,
  10,A_,7,A_, 5,7,5,1,    0,A_,-2,A_, 0,A_,A_,A_,
];
const LEAD_B = [
  12,A_,12,13, 12,A_,10,A_,  7,A_,10,A_, 12,A_,10,7,
  5,A_,7,A_,  10,7,5,1,     0,1,0,-2,   0,A_,A_,A_,
];
const LEAD_C = [
  1,A_,0,A_,  1,A_,0,A_,   1,0,1,5,   1,A_,0,A_,
  -2,A_,0,A_, 1,A_,5,A_,   7,5,1,0,   -2,A_,0,A_,
];
const BASS_A = [
  -24,-12,-24,-12, -24,-12,-24,-12, -26,-14,-26,-14, -26,-14,-26,-14,
  -24,-12,-24,-12, -24,-12,-24,-12, -29,-17,-29,-17, -24,-12,-24,-12,
];
const BASS_B = [
  -22,-10,-22,-10, -22,-10,-22,-10, -24,-12,-24,-12, -24,-12,-24,-12,
  -26,-14,-26,-14, -26,-14,-26,-14, -24,-12,-24,-12, -24,-24,-24,A_,
];
const BASS_C = [
  -23,-11,-23,-11, -23,-11,-23,-11, -23,-11,-23,-11, -23,-11,-23,-11,
  -26,-14,-26,-14, -24,-12,-24,-12, -29,-17,-29,-17, -24,A_,-24,A_,
];
const DR_MAIN = ['k','h','h','h', 's','h','h','h'];   // repeats

export const TRACKS = {
  stage: {
    bpm: 148, echo: true, loop: true,
    lead: [...LEAD_A, ...LEAD_A2, ...LEAD_B, ...LEAD_C],
    bass: [...BASS_A, ...BASS_A, ...BASS_B, ...BASS_C],
    drums: DR_MAIN,
  },
  rescue: {     // bright yo mode, gentler — spring festival, not fanfare
    bpm: 132, echo: true, loop: true,
    lead: [ 0,A_,2,A_, 5,A_,7,A_,  9,A_,7,A_, 5,A_,7,A_,
            9,A_,12,A_, 9,A_,7,A_, 5,7,5,2,  0,A_,A_,A_,
            2,A_,5,A_,  7,A_,9,A_, 12,A_,9,A_, 7,A_,9,A_,
            7,A_,5,A_,  2,5,2,0,  -3,A_,0,A_, A_,A_,A_,A_ ],
    bass: [ -24,A_,-12,A_, -24,A_,-12,A_, -22,A_,-10,A_, -22,A_,-10,A_,
            -20,A_,-8,A_,  -20,A_,-8,A_,  -22,A_,-10,A_, -24,A_,-12,A_,
            -22,A_,-10,A_, -22,A_,-10,A_, -20,A_,-8,A_,  -20,A_,-8,A_,
            -22,A_,-10,A_, -24,A_,-12,A_, -27,A_,-15,A_, -24,A_,-12,A_ ],
    drums: ['k','','h','', 'k','','h',''],
  },
  prologue: {   // storm sting: low, dissonant, thunder crashes
    bpm: 100, echo: false, loop: true,
    lead: [ 1,A_,A_,A_, 0,A_,A_,A_, 1,0,1,A_, A_,A_,A_,A_,
            -11,A_,A_,A_, -10,A_,A_,A_, -11,-10,-11,A_, A_,A_,A_,A_ ],
    bass: [ -23,A_,-24,A_, -23,A_,-24,A_, -23,-23,A_,A_, -29,A_,A_,A_,
            -23,A_,-24,A_, -23,A_,-24,A_, -23,-23,A_,A_, -29,A_,A_,A_ ],
    drums: ['','','','', 'T','','','', '','','','', '','','','T'],
  },
  death: {      // short falling figure, one-shot
    bpm: 112, echo: false, loop: false,
    lead: [ 10,A_,7,A_, 5,A_,1,A_, 0,A_,-2,A_, -5,A_,A_,A_, -11,A_,A_,A_, A_,A_,A_,A_ ],
    bass: [ -14,A_,A_,A_, -17,A_,A_,A_, -24,A_,A_,A_, -29,A_,A_,A_, -35,A_,A_,A_, A_,A_,A_,A_ ],
    drums: ['','','','', '','','','', '','','','', 'k','','','', '','','','', '','','',''],
  },
  ending: {     // victory lap: yo mode, wider
    bpm: 120, echo: true, loop: true,
    lead: [ 12,A_,9,A_, 7,A_,9,A_, 12,A_,14,A_, 12,A_,A_,A_,
            9,A_,7,A_,  5,A_,7,A_, 9,A_,7,5,   2,A_,0,A_,
            0,A_,2,A_,  5,A_,7,A_, 9,7,9,12,   14,A_,12,A_,
            9,A_,12,A_, 7,A_,9,A_, 5,A_,2,A_,  0,A_,A_,A_ ],
    bass: [ -12,A_,-24,A_, -12,A_,-24,A_, -10,A_,-22,A_, -10,A_,-22,A_,
            -15,A_,-27,A_, -15,A_,-27,A_, -12,A_,-24,A_, -12,A_,-24,A_,
            -12,A_,-24,A_, -10,A_,-22,A_, -15,A_,-27,A_, -12,A_,-24,A_,
            -15,A_,-27,A_, -10,A_,-22,A_, -12,A_,-24,A_, -12,A_,-24,A_ ],
    drums: ['k','','h','', 's','','h','', 'k','','h','', 's','','h','h'],
  },
};

/* ---------- sequencer ---------- */
export const Music = {
  track: null, trackName: null, step: 0, nextT: 0, timer: null, playing: false, queued: null,
  play(name) {
    if (!APU.ctx) { this.queued = name; return; }
    if (this.trackName === name && this.playing) return;
    this.stop();
    this.track = TRACKS[name]; this.trackName = name; this.step = 0;
    if (!this.track) return;
    this.nextT = APU.ctx.currentTime + 0.06;
    this.playing = true;
    this.tick();
  },
  stop() {
    this.playing = false; this.trackName = null;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (APU.ctx) for (const n of ['pulse1', 'pulse2', 'tri']) APU.rest(n, APU.ctx.currentTime);
  },
  tick() {
    if (!this.playing || !APU.ctx) return;
    const t = this.track, spb = 60 / t.bpm / 2;
    // resync after tab throttling so we never burst-schedule missed steps
    if (this.nextT < APU.ctx.currentTime - 0.1) {
      const missed = Math.floor((APU.ctx.currentTime - this.nextT) / spb) + 1;
      this.step += missed;
      this.nextT = APU.ctx.currentTime + 0.05;
    }
    while (this.nextT < APU.ctx.currentTime + 0.2) {
      if (!t.loop && this.step >= t.lead.length) { this.playing = false; return; }
      const i = this.step % t.lead.length, T = this.nextT;
      const L = t.lead[i];
      if (L !== null) APU.note('pulse1', ST(L + 12), T, spb * 0.85, 0.09); else APU.rest('pulse1', T);
      if (t.echo) {                                  // pulse2 echoes lead 2 steps late, quieter
        const E = t.lead[(i - 2 + t.lead.length) % t.lead.length];
        if (E !== null && this.step >= 2) APU.note('pulse2', ST(E + 12), T, spb * 0.6, 0.035);
        else APU.rest('pulse2', T);
      }
      const B = t.bass[i % t.bass.length];
      if (B !== null) APU.note('tri', ST(B), T, spb * 0.9, 0.17); else APU.rest('tri', T);
      const d = t.drums[i % t.drums.length];
      if (d === 'k') APU.noise(T, 0.06, 0.12, 150);
      if (d === 's') APU.noise(T, 0.08, 0.09, 1400);
      if (d === 'h') APU.noise(T, 0.025, 0.04, 7000);
      if (d === 'T') APU.noise(T, 1.1, 0.3, 90);      // thunder
      this.nextT += spb; this.step++;
    }
    this.timer = setTimeout(() => this.tick(), 60);
  },
  onAudioReady() { if (this.queued) { const q = this.queued; this.queued = null; this.play(q); } },
};

/* ---------- SFX: short, thin, high — sparse by design ---------- */
export const SFX = {
  jump()      { blip(180, 0.2, 0.07, 'square', 760); },                       // the audible whoop
  sword()     { noiseHit(0.03, 0.15, 6500); blip(3200, 0.03, 0.04, 'square', 2000); },
  throwStar() { blip(2600, 0.09, 0.07, 'square', 800); },
  enemyDie()  { noiseHit(0.14, 0.16, 2200); },                                // soft poof
  clash()     { blip(1200, 0.06, 0.12, 'square', 700); noiseHit(0.05, 0.12, 3000); },
  deflect()   { blip(2200, 0.05, 0.1, 'square', 3000); },
  fireball()  { noiseHit(0.22, 0.1, 900); },
  bombThrow() { blip(300, 0.1, 0.08, 'square', 140); },
  pickup()    { blip(1046, 0.06, 0.1); setTimeout(() => blip(1568, 0.09, 0.1), 60); },
  scrollGet() { for (let i = 0; i < 4; i++) setTimeout(() => blip(1046 + i * 262, 0.07, 0.1), i * 70); },
  chant()     { blip(1760, 0.05, 0.06, 'square', 1500); },                    // insistent tick
  oneUp()     { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => blip(f, 0.09, 0.1), i * 80)); },
  faceGet()   { [784, 1046, 784, 1318].forEach((f, i) => setTimeout(() => blip(f, 0.07, 0.09), i * 60)); },
  bossHit()   { blip(440, 0.12, 0.13, 'square', 130); noiseHit(0.08, 0.14, 800); },
  flyHit()    { blip(1800, 0.06, 0.1, 'square', 2400); },
  playerDie() { blip(880, 0.55, 0.11, 'square', 60); },
  rescueCue() { [1046, 1318, 1568, 2093].forEach((f, i) => setTimeout(() => blip(f, 0.09, 0.1), i * 90)); },
  ropeCut()   { noiseHit(0.05, 0.15, 5000); blip(2800, 0.05, 0.06, 'square', 1800); },
  headBump()  { blip(220, 0.07, 0.08, 'square', 110); },
  splash()    { noiseHit(0.2, 0.12, 600); },
  pause()     { blip(1046, 0.06, 0.1); setTimeout(() => blip(784, 0.08, 0.1), 70); },
};
