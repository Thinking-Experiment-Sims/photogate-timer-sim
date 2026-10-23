# Hardware Photogate Reader

A web application to connect physical photogates directly to your computer and read the real-time interval between optical beams and gate pulse durations. Authored as part of **The Thinking Experiment** (PhysicsKit).

---

## 🎯 Purpose

Connect your real laboratory photogates (such as the **Vernier Go Direct Photogate GDX-VPG**, USB WebHID sensors, or Arduino/micro:bit USB Serial photogates) and read:
- **Time Between Beams ($\Delta t_{1\to 2}$)**: Measured down to microsecond ($1\text{ }\mu\text{s}$) hardware precision directly from the photogate's internal clock.
- **Beam 1 & Beam 2 Block Durations ($\Delta t_1, \Delta t_2$)**.
- **Calculated Speed ($v = \Delta x / \Delta t$)**: Automatically calculated based on beam spacing (default $2.00\text{ cm}$ for Vernier Go Direct dual beams).
- **Automatic Data Logging**: Logs every physical pass with timestamps, durations, and speeds. Exportable as CSV or one-click clipboard copy.

---

## 🔌 Hardware Connectivity

1. **Bluetooth (Web Bluetooth)**:
   - Click **"Connect Vernier Photogate (Bluetooth)"** in Google Chrome or Microsoft Edge.
   - Select your Vernier Go Direct Photogate (`GDX-VPG`).
   - The app connects to the dual optical beam channels and velocity channels.
2. **USB (WebHID)**:
   - Connect the Go Direct Photogate via USB cable and click **"Connect USB (WebHID)"**.
3. **USB Serial (Arduino / micro:bit / DIY)**:
   - Click **"USB Serial (Arduino / DIY)"** to pair with any serial COM port transmitting state transitions or timestamps.
4. **Manual Test Buttons**:
   - Includes quick desktop test buttons (`Trigger Beam 1`, `Trigger Beam 2`, `Test Pass`) and keyboard shortcuts (`[1]`, `[2]`, `[Space]`, `[Z]`) to verify readouts.

---

## 🎨 Design System

- **Palette**: Teal (`#0f7e9b`), Amber CTA (`#d67b19`), White background (`#ffffff`).
- **Light Mode Only**: `color-scheme: light` enforced.
- **Zero dependencies**: Standalone UMD bundle included.

---

## 🚀 Live Web App

Launch directly in Google Chrome or Microsoft Edge:
[https://thinking-experiment-sims.github.io/photogate-timer-sim/](https://thinking-experiment-sims.github.io/photogate-timer-sim/)
