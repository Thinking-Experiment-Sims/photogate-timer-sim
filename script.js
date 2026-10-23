/**
 * Standalone Photogate Timer - The Thinking Experiment
 * Pure client-side JavaScript for sub-millisecond photogate timing.
 */

(function () {
    "use strict";

    // --- DOM Elements ---
    const btnAudioToggle = document.getElementById("btnAudioToggle");
    const audioIcon = document.getElementById("audioIcon");
    const audioLabel = document.getElementById("audioLabel");

    const btnMode2Gates = document.getElementById("btnMode2Gates");
    const btnMode1Gate = document.getElementById("btnMode1Gate");
    const gateUnit2 = document.getElementById("gateUnit2");
    const gateTransitSpacer = document.getElementById("gateTransitSpacer");
    const cellG2Time = document.getElementById("cellG2Time");
    const cellTransitTime = document.getElementById("cellTransitTime");
    const cellAccel = document.getElementById("cellAccel");
    const boxGateDistance = document.getElementById("boxGateDistance");

    // Gate 1 DOM
    const pillStateG1 = document.getElementById("pillStateG1");
    const beamG1 = document.getElementById("beamG1");
    const cardG1 = document.getElementById("cardG1");
    const ledG1 = document.getElementById("ledG1");
    const btnPassG1 = document.getElementById("btnPassG1");
    const btnHoldG1 = document.getElementById("btnHoldG1");

    // Gate 2 DOM
    const pillStateG2 = document.getElementById("pillStateG2");
    const beamG2 = document.getElementById("beamG2");
    const cardG2 = document.getElementById("cardG2");
    const ledG2 = document.getElementById("ledG2");
    const btnPassG2 = document.getElementById("btnPassG2");
    const btnHoldG2 = document.getElementById("btnHoldG2");

    // Transit & Simulation controls
    const btnSimulatePass = document.getElementById("btnSimulatePass");
    const rangePassSpeed = document.getElementById("rangePassSpeed");
    const valPassSpeed = document.getElementById("valPassSpeed");

    // Parameters
    const inputFlagWidth = document.getElementById("inputFlagWidth");
    const inputGateDist = document.getElementById("inputGateDist");
    const btnZeroTimer = document.getElementById("btnZeroTimer");
    const btnRecordRow = document.getElementById("btnRecordRow");

    // Display LCDs
    const timerStatusSummary = document.getElementById("timerStatusSummary");
    const dotG1 = document.getElementById("dotG1");
    const dotG2 = document.getElementById("dotG2");
    const dispG1Time = document.getElementById("dispG1Time");
    const dispG1Vel = document.getElementById("dispG1Vel");
    const dispG2Time = document.getElementById("dispG2Time");
    const dispG2Vel = document.getElementById("dispG2Vel");
    const dispTransitTime = document.getElementById("dispTransitTime");
    const dispAvgSpeed = document.getElementById("dispAvgSpeed");
    const dispAccel = document.getElementById("dispAccel");
    const dispAccelDx = document.getElementById("dispAccelDx");

    // Table elements
    const timesTableBody = document.getElementById("timesTableBody");
    const emptyTableMsg = document.getElementById("emptyTableMsg");
    const btnCopyTable = document.getElementById("btnCopyTable");
    const btnDownloadCSV = document.getElementById("btnDownloadCSV");
    const btnClearTable = document.getElementById("btnClearTable");

    // --- State Variables ---
    let soundEnabled = true;
    let modeGates = 2; // 1 or 2

    // Gate tracking state
    const gateState = {
        1: {
            blocked: false,
            entryTimestamp: 0,
            blockedTime: 0,
            isHolding: false,
            animating: false
        },
        2: {
            blocked: false,
            entryTimestamp: 0,
            blockedTime: 0,
            isHolding: false,
            animating: false
        }
    };

    let transitStartTimestamp = 0;
    let transitTime = 0;
    let timerRunning = false;
    let liveTimerRaf = null;

    let trialCount = 0;
    const trialsHistory = [];

    // --- Web Audio Synthesizer ---
    let audioCtx = null;

    function initAudio() {
        if (!audioCtx && typeof AudioContext !== "undefined") {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.warn("AudioContext not supported", e);
            }
        }
    }

    function playTone(freq, duration = 0.05, type = "sine") {
        if (!soundEnabled) return;
        try {
            initAudio();
            if (!audioCtx) return;
            if (audioCtx.state === "suspended") {
                audioCtx.resume();
            }
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (err) {
            // Audio error non-blocking
        }
    }

    // --- Gate Block / Unblock Logic ---
    function triggerGateBlock(gateId) {
        initAudio();
        const g = gateState[gateId];
        if (g.blocked) return;

        g.blocked = true;
        g.entryTimestamp = performance.now();
        playTone(gateId === 1 ? 880 : 988, 0.06, "square");

        // Visual updates
        updateGateVisuals(gateId, true);

        // Transit timing logic:
        if (modeGates === 2) {
            if (gateId === 1) {
                transitStartTimestamp = g.entryTimestamp;
                transitTime = 0;
                gateState[2].blockedTime = 0;
                timerStatusSummary.textContent = "TIMING TRANSIT...";
                timerStatusSummary.classList.add("active");
            } else if (gateId === 2 && transitStartTimestamp > 0) {
                transitTime = (g.entryTimestamp - transitStartTimestamp) / 1000;
            }
        }

        startLiveWatchLoop();
    }

    function triggerGateUnblock(gateId) {
        const g = gateState[gateId];
        if (!g.blocked) return;

        const exitTimestamp = performance.now();
        g.blockedTime = (exitTimestamp - g.entryTimestamp) / 1000;
        g.blocked = false;
        playTone(gateId === 1 ? 587 : 659, 0.05, "sine");

        // Visual updates
        updateGateVisuals(gateId, false);

        // Update readouts
        updateReadouts();

        // If single gate mode, or if Gate 2 finished in 2-gate mode, pass is complete!
        if (modeGates === 1 && gateId === 1) {
            timerStatusSummary.textContent = "GATE 1 PASS COMPLETE";
            timerStatusSummary.classList.remove("active");
            logTrial();
        } else if (modeGates === 2 && gateId === 2 && transitTime > 0) {
            timerStatusSummary.textContent = "PASS COMPLETE";
            timerStatusSummary.classList.remove("active");
            logTrial();
        }
    }

    function updateGateVisuals(gateId, isBlocked) {
        const pill = gateId === 1 ? pillStateG1 : pillStateG2;
        const beam = gateId === 1 ? beamG1 : beamG2;
        const led = gateId === 1 ? ledG1 : ledG2;
        const dot = gateId === 1 ? dotG1 : dotG2;
        const card = gateId === 1 ? cardG1 : cardG2;

        if (isBlocked) {
            pill.textContent = "BLOCKED";
            pill.classList.add("blocked");
            beam.classList.add("broken");
            led.classList.add("blocked");
            dot.classList.add("active");
            card.classList.add("blocked-state");
        } else {
            pill.textContent = "UNBLOCKED";
            pill.classList.remove("blocked");
            beam.classList.remove("broken");
            led.classList.remove("blocked");
            dot.classList.remove("active");
            card.classList.remove("blocked-state");
        }
    }

    // --- Live LCD Watch Loop ---
    function startLiveWatchLoop() {
        if (timerRunning) return;
        timerRunning = true;

        function tick() {
            const now = performance.now();
            let keepRunning = false;

            if (gateState[1].blocked) {
                const liveG1 = (now - gateState[1].entryTimestamp) / 1000;
                dispG1Time.innerHTML = `${liveG1.toFixed(4)} <span class="lcd-unit">s</span>`;
                keepRunning = true;
            }

            if (gateState[2].blocked) {
                const liveG2 = (now - gateState[2].entryTimestamp) / 1000;
                dispG2Time.innerHTML = `${liveG2.toFixed(4)} <span class="lcd-unit">s</span>`;
                keepRunning = true;
            }

            if (modeGates === 2 && transitStartTimestamp > 0 && !gateState[2].blockedTime) {
                const liveTransit = (now - transitStartTimestamp) / 1000;
                dispTransitTime.innerHTML = `${liveTransit.toFixed(4)} <span class="lcd-unit">s</span>`;
                keepRunning = true;
            }

            if (keepRunning) {
                liveTimerRaf = requestAnimationFrame(tick);
            } else {
                timerRunning = false;
                liveTimerRaf = null;
            }
        }

        liveTimerRaf = requestAnimationFrame(tick);
    }

    // --- Calculations & Readouts ---
    function updateReadouts() {
        const flagWidthCm = parseFloat(inputFlagWidth.value) || 5.0;
        const flagWidthM = flagWidthCm / 100;
        const gateDistCm = parseFloat(inputGateDist.value) || 50.0;
        const gateDistM = gateDistCm / 100;

        // Gate 1 Time & Speed
        const t1 = gateState[1].blockedTime;
        dispG1Time.innerHTML = `${t1.toFixed(4)} <span class="lcd-unit">s</span>`;
        let v1 = 0;
        if (t1 > 0) {
            v1 = flagWidthM / t1;
            dispG1Vel.textContent = `v1 = ${v1.toFixed(3)} m/s`;
        } else {
            dispG1Vel.textContent = `v1 = — m/s`;
        }

        // Gate 2 Time & Speed
        const t2 = gateState[2].blockedTime;
        dispG2Time.innerHTML = `${t2.toFixed(4)} <span class="lcd-unit">s</span>`;
        let v2 = 0;
        if (t2 > 0) {
            v2 = flagWidthM / t2;
            dispG2Vel.textContent = `v2 = ${v2.toFixed(3)} m/s`;
        } else {
            dispG2Vel.textContent = `v2 = — m/s`;
        }

        // Transit & Acceleration
        dispTransitTime.innerHTML = `${transitTime.toFixed(4)} <span class="lcd-unit">s</span>`;
        if (transitTime > 0) {
            const vAvg = gateDistM / transitTime;
            dispAvgSpeed.innerHTML = `v<sub>avg</sub> = ${vAvg.toFixed(3)} m/s`;

            if (v1 > 0 && v2 > 0) {
                const accel = (v2 - v1) / transitTime;
                dispAccel.innerHTML = `${accel.toFixed(3)} <span class="lcd-unit">m/s²</span>`;

                // Torricelli check: a = (v2^2 - v1^2) / (2 * dx)
                const accelDx = (v2 * v2 - v1 * v1) / (2 * gateDistM);
                dispAccelDx.textContent = `Torricelli: ${accelDx.toFixed(3)} m/s²`;
            } else {
                dispAccel.innerHTML = `0.000 <span class="lcd-unit">m/s²</span>`;
                dispAccelDx.textContent = `Torricelli: — m/s²`;
            }
        } else {
            dispAvgSpeed.innerHTML = `v<sub>avg</sub> = — m/s`;
            dispAccel.innerHTML = `0.000 <span class="lcd-unit">m/s²</span>`;
            dispAccelDx.textContent = `Torricelli: — m/s²`;
        }
    }

    // --- Reset / Zero Timer ---
    function zeroTimer() {
        if (liveTimerRaf) {
            cancelAnimationFrame(liveTimerRaf);
            liveTimerRaf = null;
        }
        timerRunning = false;

        gateState[1].blocked = false;
        gateState[1].blockedTime = 0;
        gateState[1].entryTimestamp = 0;
        gateState[1].isHolding = false;
        btnHoldG1.classList.remove("holding");
        btnHoldG1.textContent = "Hold Beam Blocked";

        gateState[2].blocked = false;
        gateState[2].blockedTime = 0;
        gateState[2].entryTimestamp = 0;
        gateState[2].isHolding = false;
        btnHoldG2.classList.remove("holding");
        btnHoldG2.textContent = "Hold Beam Blocked";

        transitStartTimestamp = 0;
        transitTime = 0;

        updateGateVisuals(1, false);
        updateGateVisuals(2, false);

        dispG1Time.innerHTML = `0.0000 <span class="lcd-unit">s</span>`;
        dispG1Vel.textContent = `v1 = — m/s`;
        dispG2Time.innerHTML = `0.0000 <span class="lcd-unit">s</span>`;
        dispG2Vel.textContent = `v2 = — m/s`;
        dispTransitTime.innerHTML = `0.0000 <span class="lcd-unit">s</span>`;
        dispAvgSpeed.innerHTML = `v<sub>avg</sub> = — m/s`;
        dispAccel.innerHTML = `0.000 <span class="lcd-unit">m/s²</span>`;
        dispAccelDx.textContent = `Torricelli: — m/s²`;

        cardG1.style.transform = `translateY(0px)`;
        cardG2.style.transform = `translateY(0px)`;

        timerStatusSummary.textContent = "READY / ZEROED";
        timerStatusSummary.classList.remove("active");
    }

    // --- Animated Swipe Helper ---
    function animatePass(gateId, speedMps = 1.2, onComplete = null) {
        initAudio();
        const flagWidthCm = parseFloat(inputFlagWidth.value) || 5.0;
        const flagWidthM = flagWidthCm / 100;

        // Block duration in seconds = width / speed
        const durationSec = Math.max(0.015, flagWidthM / Math.max(0.1, speedMps));
        const durationMs = durationSec * 1000;

        const card = gateId === 1 ? cardG1 : cardG2;
        card.style.transition = `transform ${durationMs + 200}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
        card.style.transform = `translateY(120px)`;

        // Trigger block at midpoint
        setTimeout(() => {
            triggerGateBlock(gateId);
            setTimeout(() => {
                triggerGateUnblock(gateId);
                setTimeout(() => {
                    card.style.transition = "transform 0.25s ease";
                    card.style.transform = "translateY(0px)";
                    if (onComplete) onComplete();
                }, 150);
            }, durationMs);
        }, 80);
    }

    // --- Quick Pass (Gate 1 -> Gate 2) ---
    function runSimulatedDualPass() {
        if (gateState[1].blocked || gateState[2].blocked) return;
        const speed = parseFloat(rangePassSpeed.value) || 1.2;
        const gateDistCm = parseFloat(inputGateDist.value) || 50.0;
        const gateDistM = gateDistCm / 100;
        const transitSec = gateDistM / speed;
        const transitMs = transitSec * 1000;

        btnSimulatePass.disabled = true;
        btnSimulatePass.textContent = "⏳ Running Pass...";

        animatePass(1, speed, () => {
            // After Gate 1, wait for transit delay minus overlap
            const waitTime = Math.max(100, transitMs - 200);
            setTimeout(() => {
                animatePass(2, speed * 1.05, () => { // tiny acceleration for realism
                    btnSimulatePass.disabled = false;
                    btnSimulatePass.textContent = "⚡ Quick Pass (Gate 1 → Gate 2)";
                });
            }, waitTime);
        });
    }

    // --- Interactive Mouse Drag on Cards ---
    function setupCardDrag(cardEl, gateId) {
        let isDragging = false;
        let startY = 0;
        let currentTranslateY = 0;
        const beamCenterY = 90; // relative center where beam sits

        function onPointerDown(e) {
            initAudio();
            isDragging = true;
            startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
            currentTranslateY = 0;
            cardEl.style.transition = "none";
            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", onPointerUp);
        }

        function onPointerMove(e) {
            if (!isDragging) return;
            const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
            const deltaY = clientY - startY;
            currentTranslateY = Math.max(-20, Math.min(130, deltaY));
            cardEl.style.transform = `translateY(${currentTranslateY}px)`;

            // Card height is 52px; center of card touches beam between approx 45px and 110px
            const cardTop = currentTranslateY;
            const cardBottom = currentTranslateY + 52;
            const beamY = 90;

            const isInterruping = (cardTop <= beamY && cardBottom >= beamY);

            if (isInterruping && !gateState[gateId].blocked) {
                triggerGateBlock(gateId);
            } else if (!isInterruping && gateState[gateId].blocked) {
                triggerGateUnblock(gateId);
            }
        }

        function onPointerUp() {
            if (!isDragging) return;
            isDragging = false;
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);

            if (gateState[gateId].blocked) {
                triggerGateUnblock(gateId);
            }

            cardEl.style.transition = "transform 0.25s ease";
            cardEl.style.transform = "translateY(0px)";
        }

        cardEl.addEventListener("pointerdown", onPointerDown);
    }

    // --- Data Table Logging ---
    function logTrial() {
        const t1 = gateState[1].blockedTime;
        const t2 = modeGates === 2 ? gateState[2].blockedTime : 0;
        const tTransit = modeGates === 2 ? transitTime : 0;

        if (t1 <= 0 && t2 <= 0) return;

        trialCount++;
        const flagWidthM = (parseFloat(inputFlagWidth.value) || 5.0) / 100;
        const gateDistM = (parseFloat(inputGateDist.value) || 50.0) / 100;

        const v1 = t1 > 0 ? (flagWidthM / t1) : 0;
        const v2 = t2 > 0 ? (flagWidthM / t2) : 0;
        let accel = 0;
        if (tTransit > 0 && v1 > 0 && v2 > 0) {
            accel = (v2 - v1) / tTransit;
        }

        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

        const rowData = {
            trial: trialCount,
            timeStr: timeStr,
            t1: t1,
            t2: t2,
            tTransit: tTransit,
            v1: v1,
            v2: v2,
            accel: accel
        };
        trialsHistory.push(rowData);

        emptyTableMsg.style.display = "none";

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <th scope="row">${trialCount}</th>
            <td>${timeStr}</td>
            <td>${t1 > 0 ? t1.toFixed(4) : "—"}</td>
            <td>${modeGates === 2 && t2 > 0 ? t2.toFixed(4) : "—"}</td>
            <td>${modeGates === 2 && tTransit > 0 ? tTransit.toFixed(4) : "—"}</td>
            <td>${v1 > 0 ? v1.toFixed(3) : "—"}</td>
            <td>${modeGates === 2 && v2 > 0 ? v2.toFixed(3) : "—"}</td>
            <td>${modeGates === 2 && accel !== 0 ? accel.toFixed(3) : "—"}</td>
        `;
        timesTableBody.prepend(tr);
    }

    // --- Export CSV & Copy Data ---
    function downloadCSV() {
        if (trialsHistory.length === 0) {
            alert("No recorded trials to export yet.");
            return;
        }

        let csv = "Trial,Timestamp,Gate 1 Time (s),Gate 2 Time (s),Transit Time (s),Speed 1 (m/s),Speed 2 (m/s),Acceleration (m/s^2)\n";
        trialsHistory.forEach(r => {
            csv += `${r.trial},"${r.timeStr}",${r.t1.toFixed(4)},${r.t2.toFixed(4)},${r.tTransit.toFixed(4)},${r.v1.toFixed(3)},${r.v2.toFixed(3)},${r.accel.toFixed(3)}\n`;
        });

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `photogate_data_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function copyTable() {
        if (trialsHistory.length === 0) {
            alert("No recorded trials to copy yet.");
            return;
        }

        let text = "Trial\tTimestamp\tGate 1 (s)\tGate 2 (s)\tTransit (s)\tSpeed 1 (m/s)\tSpeed 2 (m/s)\tAcceleration (m/s²)\n";
        trialsHistory.forEach(r => {
            text += `${r.trial}\t${r.timeStr}\t${r.t1.toFixed(4)}\t${r.t2.toFixed(4)}\t${r.tTransit.toFixed(4)}\t${r.v1.toFixed(3)}\t${r.v2.toFixed(3)}\t${r.accel.toFixed(3)}\n`;
        });

        navigator.clipboard.writeText(text).then(() => {
            const originalText = btnCopyTable.textContent;
            btnCopyTable.textContent = "✓ Copied!";
            setTimeout(() => {
                btnCopyTable.textContent = originalText;
            }, 1800);
        }).catch(err => {
            alert("Could not copy data to clipboard.");
        });
    }

    function clearTable() {
        if (trialsHistory.length === 0) return;
        if (confirm("Clear all recorded trials?")) {
            trialsHistory.length = 0;
            timesTableBody.innerHTML = "";
            emptyTableMsg.style.display = "block";
            trialCount = 0;
        }
    }

    // --- Mode Switching (1 Gate vs 2 Gates) ---
    function setGateMode(numGates) {
        modeGates = numGates;
        if (numGates === 1) {
            btnMode1Gate.classList.add("active");
            btnMode2Gates.classList.remove("active");
            gateUnit2.style.display = "none";
            gateTransitSpacer.style.display = "none";
            cellG2Time.style.display = "none";
            cellTransitTime.style.display = "none";
            cellAccel.style.display = "none";
            boxGateDistance.style.display = "none";
        } else {
            btnMode2Gates.classList.add("active");
            btnMode1Gate.classList.remove("active");
            gateUnit2.style.display = "flex";
            gateTransitSpacer.style.display = "flex";
            cellG2Time.style.display = "flex";
            cellTransitTime.style.display = "flex";
            cellAccel.style.display = "flex";
            boxGateDistance.style.display = "flex";
        }
        zeroTimer();
    }

    // --- Event Listeners ---
    function initEvents() {
        // Mode buttons
        btnMode2Gates.addEventListener("click", () => setGateMode(2));
        btnMode1Gate.addEventListener("click", () => setGateMode(1));

        // Sound Toggle
        btnAudioToggle.addEventListener("click", () => {
            soundEnabled = !soundEnabled;
            btnAudioToggle.setAttribute("aria-pressed", soundEnabled.toString());
            audioIcon.textContent = soundEnabled ? "🔊" : "🔇";
            audioLabel.textContent = soundEnabled ? "Sound: ON" : "Sound: OFF";
        });

        // Quick Pass Actions
        btnPassG1.addEventListener("click", () => animatePass(1, parseFloat(rangePassSpeed.value) || 1.2));
        btnPassG2.addEventListener("click", () => animatePass(2, parseFloat(rangePassSpeed.value) || 1.2));
        btnSimulatePass.addEventListener("click", runSimulatedDualPass);

        // Speed slider
        rangePassSpeed.addEventListener("input", (e) => {
            valPassSpeed.textContent = `${parseFloat(e.target.value).toFixed(1)} m/s`;
        });

        // Hold Buttons
        btnHoldG1.addEventListener("click", () => {
            initAudio();
            const g = gateState[1];
            if (!g.isHolding) {
                g.isHolding = true;
                btnHoldG1.classList.add("holding");
                btnHoldG1.textContent = "Release Beam";
                cardG1.style.transform = "translateY(90px)";
                triggerGateBlock(1);
            } else {
                g.isHolding = false;
                btnHoldG1.classList.remove("holding");
                btnHoldG1.textContent = "Hold Beam Blocked";
                cardG1.style.transform = "translateY(0px)";
                triggerGateUnblock(1);
            }
        });

        btnHoldG2.addEventListener("click", () => {
            initAudio();
            const g = gateState[2];
            if (!g.isHolding) {
                g.isHolding = true;
                btnHoldG2.classList.add("holding");
                btnHoldG2.textContent = "Release Beam";
                cardG2.style.transform = "translateY(90px)";
                triggerGateBlock(2);
            } else {
                g.isHolding = false;
                btnHoldG2.classList.remove("holding");
                btnHoldG2.textContent = "Hold Beam Blocked";
                cardG2.style.transform = "translateY(0px)";
                triggerGateUnblock(2);
            }
        });

        // Zero / Reset Timer
        btnZeroTimer.addEventListener("click", zeroTimer);

        // Record Current readings
        btnRecordRow.addEventListener("click", logTrial);

        // Table actions
        btnDownloadCSV.addEventListener("click", downloadCSV);
        btnCopyTable.addEventListener("click", copyTable);
        btnClearTable.addEventListener("click", clearTable);

        // Parameter changes re-compute readouts
        inputFlagWidth.addEventListener("input", updateReadouts);
        inputGateDist.addEventListener("input", updateReadouts);

        // Card drags
        setupCardDrag(cardG1, 1);
        setupCardDrag(cardG2, 2);

        // Keyboard Shortcuts: [1], [2], [Space], [Z]
        window.addEventListener("keydown", (e) => {
            // Ignore if typing in input
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

            if (e.key === "1") {
                e.preventDefault();
                animatePass(1, parseFloat(rangePassSpeed.value) || 1.2);
            } else if (e.key === "2" && modeGates === 2) {
                e.preventDefault();
                animatePass(2, parseFloat(rangePassSpeed.value) || 1.2);
            } else if (e.code === "Space") {
                e.preventDefault();
                if (modeGates === 2) {
                    runSimulatedDualPass();
                } else {
                    animatePass(1, parseFloat(rangePassSpeed.value) || 1.2);
                }
            } else if (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "r") {
                e.preventDefault();
                zeroTimer();
            }
        });
    }

    // --- Initialization ---
    initEvents();
    zeroTimer();
})();
