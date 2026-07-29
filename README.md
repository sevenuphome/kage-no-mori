# KAGE NO MORI — Shadow of the Forest

A moonlit ninja action game in the spirit of 1985 arcade classics — one princess, five stages, three seasons, and the biggest jump on the NES. Runs entirely in your browser: vanilla JavaScript on a 256×240 canvas, original pixel art, and an original chiptune soundtrack synthesized live in WebAudio (two thin-duty pulse channels, triangle bass, noise percussion — the classic 2A03 recipe).

**▶ Play it now: https://sevenuphome.github.io/kage-no-mori/**

An **original homage** inspired by the mechanics of Taito's *The Legend of Kage* (1985): every sprite, tile, note, and line of code here is newly made — no original assets, names, or music are used.

## How to play

| Key | Action |
|-----|--------|
| `←` `→` | Run (fast, instant turns — body contact is harmless, only weapons hurt you) |
| `↑` | **Jump** — screen-tall and floaty. Hold `←`/`→` while pressing to leap diagonally. **The arc is committed: no steering in mid-air.** |
| `↓` | Crouch · climb down · drop from a platform |
| `X` / `SPACE` | Sword — short range, deflects enemy stars (+50), clashes blades (+100, ×3 in a row +1500) |
| `Z` | Shuriken — max 2 on screen; while airborne the d-pad aims all 8 directions |
| `ENTER` | Start / pause |
| `M` | Sound on/off |

- **Climb trees and castle columns**: press `↑` at a trunk. Fall past a trunk with the d-pad neutral and you'll catch it.
- **Crystal orbs** upgrade your outfit: red → **green** (large piercing stars) → **gold** (speed boost). A hit knocks you back a tier instead of killing you — but monk fire burns through everything.
- **Scrolls** freeze you in a chant that strikes down every nearby enemy.
- Secrets: 3 red-ninja kills in one area summon a bonus face (10,000 pts, or the 8-way star art); 7 sword-only kills in the moat summon a 1-up.
- One chapter = forest (defeat the 4 monks) → moat (10-ninja counter, water hides you but disarms your stars) → castle wall (climb ~7 jumps) → the keep (free Lady Kaede with your sword) → showdown (down the butterfly 5 times, then strike the boss once).
- Rescue her in **summer, autumn, and winter** to see the ending. Extra life at 30,000.

## Run locally

```sh
git clone https://github.com/sevenuphome/kage-no-mori.git
cd kage-no-mori
python3 -m http.server 8643
# open http://127.0.0.1:8643
```

ES modules require a local server (`file://` won't work). No dependencies, no build step.

## Files

- `engine.js` — canvas scaling, input latch, pixel-sprite cache, bitmap font, 2A03-style APU, fixed 60 Hz loop
- `sprites.js` — all pixel art as palette-indexed string grids
- `music.js` — sequencer + original tracks (in-sen & yo scales) + SFX
- `game.js` — player physics, enemies, stages, bosses, seasons, HUD
