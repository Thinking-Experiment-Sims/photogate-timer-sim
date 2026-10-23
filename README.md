# Standalone Photogate Timer

A fast, lightweight, and responsive virtual digital photogate timer built for high school and AP Physics classrooms. Authored as part of **The Thinking Experiment** (PhysicsKit).

---

## 🎯 Purpose

A standalone utility for whenever you need to record times from photogates quickly without needing to set up complex track dynamics, drop towers, or pendulums.

- **Dual-Gate & Single-Gate Modes**: Switch between 2 photogates (measuring $\Delta t_1$, $\Delta t_2$, and transit time $\Delta t_{1\to 2}$) or 1 photogate (measuring gate block time $\Delta t$).
- **Instant Speed & Acceleration Calculations**: Enter flag width (cm) and gate separation (cm) to calculate $v_1 = \Delta x / \Delta t_1$, $v_2 = \Delta x / \Delta t_2$, and $a = \Delta v / \Delta t$.
- **Multiple Ways to Trigger**:
  1. Click **"Quick Pass (Gate 1 → Gate 2)"** with adjustable simulated speed.
  2. Click **"Swipe Through Gate 1 / 2"** or **"Hold Beam Blocked"**.
  3. **Drag the flag** with your mouse or finger through the laser beam.
  4. Use keyboard shortcuts: `[1]` for Gate 1, `[2]` for Gate 2, `[Space]` for a dual pass, and `[Z]` to zero the timer.
- **Data Table Logging**: Automatically records each trial with timestamps. Export to CSV or copy directly to clipboard for Google Sheets or Excel.
- **Audio Feedback**: Built-in sound effects synthesize crisp clicks when beams are interrupted and cleared.

---

## 🎨 Design System

- **Palette**: Teal (`#0f7e9b`), Amber CTA (`#d67b19`), White background (`#ffffff`).
- **Light Mode Only**: `color-scheme: light` enforced.
- **No external dependencies**: Pure vanilla HTML5, CSS3, and modern ES6 JavaScript.

---

## 🚀 Live Demo

Launch the simulation on GitHub Pages:
[https://thinking-experiment-sims.github.io/photogate-timer-sim/](https://thinking-experiment-sims.github.io/photogate-timer-sim/)
