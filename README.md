# Cliffdiving

A casual, cartoon cliff-diving competition game that runs as a PWA on phones and desktops.
You stand nervously on the edge of a cliff, tap to leap, swipe to pull off tricks, and tap
again just before the water to lock in a clean entry. Three rival divers (bots) go after you,
and three judges score every dive out of 10.

No build step and no dependencies: plain HTML, CSS and ES modules.

## Run it

```bash
npm start            # serves the game at http://localhost:8080
npm test             # unit tests (node:test)
```

Any static file server works too; the service worker needs `http(s)://`, not `file://`.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Charge and jump | Hold click or Space (up to 1 s), release | Hold the screen, release |
| Trick | Flick the mouse / trackpad (no click) | Swipe |
| Tucked variant | Hold Shift while flicking | Keep a second finger on the screen |
| Lock entry | Click / Space just before the water | Tap |

A quick tap is the minimum hop. A full one-second charge launches the diver about
2.5 m higher and adds close to a second of air time for tricks.

| Gesture | Trick | Difficulty |
| --- | --- | --- |
| ↓ | Front Flip (straight) | 1.2 |
| Shift + ↓ | Front Tuck | 1.0 |
| ↑ | Backflip (layout) | 1.4 |
| Shift + ↑ | Back Tuck | 1.2 |
| ↑ then ↓ in one stroke | Gainer (legs trail behind) | 1.6 |
| ← or → | Corkscrew (full twist) | 1.3 |
| ↘ or ↙ | Sideflip (tucked) | 1.3 |
| ↓ then ↑ (a ✓) | Jackknife | 0.8 |
| ↓ then sideways (an L) | Barani (front flip + half twist) | 1.7 |

Two-part gestures can be one continuous stroke or two quick strokes; a stroke that could be the
first half of a compound waits 170 ms for its second half. Keyboard: arrow keys (with Shift for
tucks), G gainer, J jackknife, B barani, S sideflip.

The tutorial shows automatically on first launch and can be reopened with the `?` button.

## The diver

Stick figures are a procedural rig (`src/rig.js`): jointed spine, neck, shoulders, elbows, hips,
knees and ankles driven by spring-damper joints toward pose targets, with limb lag, airflow and
water drag. Limbs carry small sideways offsets, so the figure can be rotated in 3D (twist for
corkscrews, roll for sideflips, pitch for flips) and drawn depth-sorted without ever flattening
into a cut-out. Each hairstyle is one outline around the head whose points are spring nodes, so it
streams, whips and floats. The player always wears the same hairstyle; bots change theirs each round.

## How a round works

1. Pick a competition and a stake. Only the first competition is unlocked when the page loads;
   winning a round (finishing 1st) unlocks the next one for the session.
2. The stake is deducted and the finishing position is drawn **before** the dive, using the
   competition's odds. A fresh 32-bit seed from the CSPRNG drives a seeded PRNG for everything
   else in the round (judge noise, bot behaviour, splash shapes), so a round is reproducible from
   its Round ID.
3. You dive. Your score is judged from what you actually did (difficulty of completed tricks and
   entry quality).
4. The three bots then dive. Their scores are placed around yours so that you land exactly in the
   predetermined position; each bot's tricks and splash are synthesised to match the score it posts.
5. Payout = stake × the multiplier for your finishing position.

## Odds spectrum

| Competition | Height | 1st | 2nd | 3rd | 4th |
| --- | --- | --- | --- | --- | --- |
| Little Tykes Diving Tourney | 10 m | 2x | 1.5x | 0.75x | 0x |
| The Bluffs Amateur Diving Comp. | 15 m | 3x | 1.5x | 0.5x | 0x |
| Olympic Superdive Classic | 21 m | 5x | 1.5x | 0.5x | 0x |
| Blue Horse Cliffdiving World Series | 27 m | 10x | 1.5x | 0.25x | 0x |

Position probabilities are derived from the multipliers so every competition returns exactly
**96% RTP**: `p_i ∝ exp(−λ·m_i)`, with λ solved by bisection (`src/odds.js`). The tests assert
this for every competition.

## Layout

```
index.html            app shell
css/style.css         UI styling (mobile bottom sheet, desktop side panel)
src/main.js           bootstrap, game loop, service worker registration
src/game.js           round state machine: lobby → ready → dive → judges → bots → results
src/odds.js           competitions, RTP solver, position draw, bot score placement
src/scoring.js        judge model, entry quality, bot dive synthesis
src/tricks.js         trick catalogue and swipe classifier
src/world.js          physics, diver state, bot autopilot, splashes
src/render.js         canvas renderer (cliff, water, stickmen, camera)
src/input.js          taps, no-click mouse swipes, touch swipes, keyboard
src/ui.js             DOM overlays
sw.js, manifest.webmanifest, icons/   PWA
tests/                node:test unit tests
```

Balance is play money (starts at 1,000, persisted in localStorage, top-up when empty).
