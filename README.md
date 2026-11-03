# CALIBR — Posture Coach (companion app prototype)

A mobile-first, portrait companion app for the **CALIBR** indoor golf trainer.
CALIBR reproduces 5 balance profiles (Driver, Fairway Wood, Hybrid, Mid Iron,
Wedge) in a single club and trains swing & putting by joint-recognition sensors —
no ball, no mat.

The product philosophy is **zero-screen**: you don't look at a screen while you
practice. So this app is not a live dashboard. It's a coach you check at exactly
two moments — **before** practice (briefs today's mission) and **after** practice
(reviews your posture). Its identity is proving *"your body is improving,"* so it
captures a one-time **baseline** and shows growth by comparison against it.

## Run it

Pure HTML/CSS/JS — **no build step, no dependencies.**

- **Easiest:** double-click `standalone.html` (everything inlined into one file).
- **Source version:** open `index.html`. If your browser blocks the local
  `styles.css` / `app.js` over `file://`, serve the folder over HTTP, e.g. any
  static server pointed at this directory, then open `/index.html`.
- After editing `styles.css` / `app.js`, run `node build-standalone.js` to
  regenerate `standalone.html` (it inlines both files plus the two local
  images as base64, so the single-file build stays in sync with the source).

### Deep-link query params (handy for demos)
- `?screen=home|report|growth|profile` — jump straight to a screen (skips onboarding)
- `?tab=calendar|metrics|ba` — pick the Growth sub-tab
- `?ob=0` — start on Home without onboarding

## Live tracking (iPad camera)

The session flow is unchanged — **START → count-in → camera window → End session → Session Report** —
but the camera window is now real (`live.js`):

- **Camera window** (`.zc-feed`): the iPad's front camera, mirrored, with the joint skeleton drawn in the
  app's own camera style, the floor **laser** line (locks on when you hold your address), and the hands' path.
- **Readouts**: *Sets* counts real swings (e.g. 3 / 10) and a third column shows the last swing's **Tempo**.
- **Coach**: after every swing the session title becomes one coaching line, and the same line is **spoken**.
- **Balance dial**: a segmented control along the window's foot (Driver · Wood · Hybrid · Iron · Wedge · Putt).
  Switching plays the ball-screw motor, moves the weight (290 → 640 mm) and changes the targets the swing is
  judged against. Impact plays the **haptic** pulse as sound.
- **Stand camera** (iPad landscape only): the stand's own view, large, beside the phone — phase, joint
  angles drawn on the body, weight bar between the feet, and the last swing's numbers.
- **Session Report**: built from the swings that were tracked — the halftone avatar and *Posture by phase*
  show **this golfer's** seven stills (cut out with the segmentation model, drawn on the artwork's dot grid),
  the joint dots and flagged callouts come from their landmarks, and the four metrics, key finding and
  mission success are computed from the session. Putting sessions fill the putting report.

**Running it on an iPad:** the camera needs a secure address. Host the folder (or just `standalone.html`)
on any HTTPS host — GitHub Pages, Netlify Drop — and open it in Safari; allow the camera when asked. Stand
2.5–3 m from the iPad, whole body in frame. The pose model (MediaPipe Pose Landmarker, full) loads from the
CDN on first use; for an offline exhibition, put `pose_landmarker_full.task` next to `index.html`.
Without a camera (or inside a preview that blocks it) a **demo golfer** swings instead and every surface
says so. Everything runs on the device — no video leaves it.

Metrics are face-on estimates from 2-D joint positions: rotation from the shoulders' / hips' projected
width, weight from the hips' position between the feet, head drift in cm against a 39 cm shoulder width,
tempo from the hands' path, and release from when hand speed peaks before the strike.

## What's inside

| Screen | Contents |
|---|---|
| **Launch** (first entry) | full-bleed photo background (`assets/launch.jpg`) + dark bottom-heavy scrim · CALIBR wordmark top · big uppercase slogan + one-line subcopy · **Log in** (dark glass) / **Get started** (white) pills. Get started → onboarding (new user); Log in → home (returning). Falls back to a golf-toned gradient if no photo is present. |
| **Onboarding** | concept ("no screen while you train") → pair club & stand → goal (target score + next round). **Phone-only** — no swing capture and no camera-framing step, so you never put the phone down and pick it back up. |
| **Baseline** | No separate capture step. Your **first real session is saved automatically as your baseline (Day 0)** — Home shows a "tonight becomes your Day 0" banner, the START overlay confirms it, and the first report opens in baseline mode (no vs-last deltas). Every later session and the growth/Before-After views compare against it. |
| **Missions** | **Round Prep** teal hero card (D-day + "start round prep" → a set built from your recent weak spots) as the star · category filter chips (All · Swing · Putting · Recommended) · mission cards with a concrete goal sentence, est. time, balance-mode badge (Driver·Fairway Wood·Hybrid·Mid Iron·Wedge·Putt), difficulty, and a completion check · tap a card to start that mission. Goals are measurable actions only (counts / tempo / pass-fail) — no field-round or score simulation. |
| **Home** (before) | greeting · **light D-day bar** (tap → Missions; round prep is started there, not here) · streak · this-week · condition check (3-level state + discomfort multi-select) · today's mission (teal hero card, auto-adjusts to condition/injury) · correction of the day · start |
| **Session Report** (after) | **Depends on the session type.** A **putting** session shows a *game-result report* — big mission success (e.g. 4/5), streak, distance accuracy (avg miss cm), tempo consistency, and change-vs-last — **no posture avatar**. A **swing** session shows the posture report below: **interactive glow joint-mannequin** — tap a joint marker and a card **grows out of that exact point**, showing a **looping close-up** of the joint through the swing, a big metric, status tag, one-line coaching, and 4 phase thumbnails (problem = red border) you can tap to review; leader lines to callouts; whole-figure phase switch + Replay · key finding · 4 posture phases · 4 swing metrics with change-vs-last · mission success & streak · one-line reflection |
| **Growth** | weekly summary · Calendar / Metrics / Before-After tabs · **tap any practiced day in the calendar to reopen that session (the popup grows out of the tapped date, matching the joint-detail card)** — the same interactive avatar view (glow figure, joint markers → grow-from-point close-up loop, phase frames, metrics) filled with that day's data. The calendar is a table of contents into past sessions; earlier days sit closer to baseline, recent days show the improvement. · metric trend vs baseline · before/after avatar comparison |
| **Profile** | handicap · goal · round schedule · device settings (camera, laser, voice) · home-position re-setup · on-device privacy · notifications |

The flow is **START → Training-in-progress screen → (practice) → Session Report** — pressing START never jumps straight to the report. The training screen is deliberately minimal (zero-screen): "Put your phone down", the current mission name + balance mode, a **live elapsed timer + set progress** (e.g. Set 4/10), a gently rotating waiting ring, and an **End session** button (plus Cancel — don't save). Ending → Session Report; Cancel → back with nothing saved.

The **center START** button opens the *zero-screen* session overlay ("put your
phone down — come back after"), which then leads to the Session Report.

## Design

- Warm ivory/white gradient ground + a single lime/chartreuse accent (`#8BC63E`).
- Frosted-glass bento: translucent cards, `backdrop-filter` blur, 1px light
  borders, in-phone light so glass reads. One lime-filled card per screen for
  asymmetric emphasis; hero-sized numerals for key figures (D-day, success rate).
- **Everything is hand-drawn:** the glowing volumetric joint-mannequin (mint/teal
  gradient body + lime skeleton overlay + pulsing joint markers), line/spark
  charts, calendar, rings and all icons are **inline SVG** — no libraries, no
  external fonts (system `-apple-system` stack for the Apple mood).
- Metrics are **golf-posture only** — spine angle, shoulder rotation, weight
  transfer, wrist-release timing. No muscle mass, flexibility, or medical data.

## Launch-screen photo
Drop your background photo at **`assets/launch.jpg`** (portrait, ~1200px+ wide).
The source app picks it up immediately. For the single-file `standalone.html`
and the shared Artifact, re-run the build (it base64-embeds the photo so it
travels with the file); without it, a golf-toned gradient stands in.

## Files
```
calibr-app/
├─ index.html        markup shell (loads styles.css + app.js)
├─ styles.css        design system: tokens, glass, bento, components
├─ app.js            data model, screen renderers, SVG skeleton + charts, nav
├─ assets/launch.jpg your launch background photo (you add this)
├─ standalone.html   single-file build (all inlined) — double-click to run
└─ README.md
```

*Prototype — content is representative sample data. Metrics are joint-position
based golf-posture measures only (no muscle mass, flexibility, or medical data).*
