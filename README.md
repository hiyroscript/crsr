# Courser's Evade!

An endless top-down car chase: steer, drift, dodge the puddles, and don't get caught by the Guard.

By **hiyroscript**.

## How to play

The car drives itself. You only steer. Survive as long as you can and beat your high score.

- **Score** rises with distance driven and time survived. **Near misses** (passing close to a puddle without touching it) and **clean drifts** (a drift with no hit and no scrape) give bonus points.
- **Speed tiers:** the higher your score, the faster you go, with sharper corners and more puddles. A new tier comes every 200 points, up to **tier 19**. Your best tier is shown on the home screen's "top speed" rail (`tier 01 / 19`), and the current tier is shown in the HUD.
- **Water puddles** slow you down hard, like hitting a rock, and splash your screen for a couple of seconds.
- **Oil slicks** slow you down hard and **swap left and right for 3 seconds**. The edges of the screen turn purple and a timer counts down until your controls are back.
- **The Guard** (the police car) is always right behind you. Every slowdown lets it close in, and clean driving slowly wins the gap back. The **guard** meter at the top of the HUD shows how close it is. As it gets close, the screen shows a danger vignette and the siren gets louder.
- **Busted:** if the Guard touches you, the run is over. Touching the edge of the road never ends a run. It only slows you a little, but that lets the Guard close in.

## Controls

| Action | Keyboard | Touch / mouse |
|---|---|---|
| Turn left / right (a tap is a smooth, gentle turn) | `←` / `→` or `A` / `D` | tap the left / right half of the screen |
| Drift (a tighter turn with the rear sliding out; one hold takes any corner, even a U-turn) | hold the key | hold a side |
| Pause / resume | `Esc` | pause button (top right of the HUD) |
| Start a run from the home screen | `Enter` or `Space` | the play orb |
| Confirm a card (resume, retry, …) | `Enter` (picks the first button) | tap a button |
| Previous / next page in How to play | `←` / `→` | back / next |
| Close How to play / Settings | `Esc` | close |
| Toggle the debug view | `Shift`+`D` or `` ` `` | — |

The most recent press wins, so you can hold one side and tap the other. The game pauses itself when the tab is hidden or the window loses focus.

## Settings

- **Sound effects:** engine, tires, siren, splashes and crashes.
- **Music:** the driving soundtrack.
- **Vibration:** a buzz when you hit a puddle and when you're busted (phones only).
- **Screen shake:** impact shake on puddles, scrapes and the bust.
- **Tutorial tips:** show the controls at the start of a run. They switch off by themselves after your first run that lasts more than 20 seconds; turn them back on here.
- **Reset high score:** clears your high score and top speed tier. Your settings stay.

## Running it

No build step and no dependencies. Either:

- open `index.html` directly in a browser, or
- serve the folder and open it:

  ```sh
  python3 -m http.server
  # then visit http://localhost:8000
  ```

The only external resource is Google Fonts (Space Grotesk and JetBrains Mono). Offline, the game falls back to system fonts.

## URL options and debug

| Option | Effect |
|---|---|
| `?seed=123` | reproducible runs: every run uses this seed (same road, scenery and puddles) |
| `?debug` | start with the debug view on |
| `?score=1500` | start runs at this score (higher speed tier and difficulty), for tuning |

`Shift`+`D` or `` ` `` toggles the debug view during play. It shows road pieces, hitboxes and puddle hit areas, plus fps, the Guard gap, speed, difficulty, tier, seed, and counts of road pieces, scenery, puddles and particles.

You can also fix the seed in code: set `CONFIG.seed` in `js/config.js` to a number. It takes precedence over `?seed=`; `null` picks a new seed per run.

## Project structure

```
index.html          markup only; links css/style.css and the scripts below
css/style.css       all styles
js/config.js        CONFIG: every tuning value in one place
js/util.js          U: small shared helpers (seeded RNG, angles, easing, hashing, spatial hash grid)
js/road.js          ROAD: the infinite, never self-intersecting road, generated ahead and freed behind
js/scenery.js       SCENERY: the city around the road (buildings, parks, lots, plazas, trees, parked cars, streetlights)
js/obstacles.js     OBST: data-driven puddles (water, oil): placement, hits, effects
js/courser.js       COURSER: the player's car: taps, drifts, road assist, soft edges
js/guard.js         GUARD: the police car, placed as a gap along the road behind the Courser
js/world.js         WORLD: one run as a deterministic fixed-timestep simulation, plus the demo bot
js/camera.js        CAMERA: top-down follow camera that turns with the car, zooms with speed and swings in on a bust
js/render.js        RENDER: the whole city on one full-screen canvas, plus the How to play vignettes
js/input.js         INPUT: steering only (-1 / 0 / +1) from touch, mouse and keyboard
js/audio.js         AUDIO: all sound synthesised live with Web Audio (engine, drift, siren, one-shots, music)
js/ui.js            UI: the DOM side: screens, cards, title, wipe, tutorial, HUD, How to play carousel
js/game.js          ties it together: saves, modes, the main loop, keyboard shortcuts, debug view
```

**Script load order matters.** The files are plain classic `<script>`s, not ES modules. They share the global scope: each one defines a top-level `const` (`CONFIG`, `U`, `ROAD`, …, `UI`) that later files use by name. `index.html` loads them at the end of `<body>`, after the markup exists, in the order above: `config.js` first, `game.js` last. `game.js` boots the game as soon as it runs. Don't add `type="module"`, `defer` or `async`, and don't reorder them.

## Architecture notes

- **Fixed 60 Hz simulation.** `game.js` steps `WORLD.step(w, dir)` at `CONFIG.hz`, at most `CONFIG.maxSteps` steps per frame, and reads input at every step. The renderer draws between the last two steps, so motion is smooth at any refresh rate.
- **Deterministic, seeded runs.** A run is a function of its seed and its inputs: road, scenery and puddles all come from seeded RNGs, so the same seed gives the same city.
- **Procedural road and scenery.** The road is built from pieces (straights and arcs) weighted by difficulty. It is generated ahead of the car and freed far behind, so memory stays flat. Every candidate piece is checked against the live road so it never self-intersects. Scenery is placed per road piece and checked against the asphalt and against other scenery.
- **One-canvas renderer.** Static scenery becomes cached `Path2D` objects the first time a piece is on screen. Repeated things (trees, parked cars, glows, smoke, droplets) are sprites drawn once to offscreen canvases. Particles and skid marks use fixed pools. If a device can't hold 60 fps, the resolution drops once.
- **Synthesised audio.** No audio files: Web Audio builds the engine, drift screech, siren, one-shots and a small music loop on the first gesture.

## Tuning

All gameplay numbers live in `js/config.js`: road pieces and the generator, speed and score, the car's handling, the Guard, puddle types and placement, the camera, and "juice" (shake, danger look, bust timing).

## Saves

The high score, best tier, run count and settings are stored in `localStorage` under the key `coursersevade.v1`. They are validated on load.

## Notes

- The car sprite is **inlined as a base64 data URI in `js/render.js`** (`const SPR`) on purpose. An external image would load asynchronously and could change when the sprite is ready for the first frames, the home demo and the How to play scenes. It could also be blocked or taint the canvas when the game is opened from `file://`.
- The UI style (tokens, type, chips, rails, play orb, wipe, cards) is shared with hiyroscript's *shkr* and *vl*.
