/**
 * Hardware Photogate Reader - The Thinking Experiment
 * Reads real-time optical beam times from physical photogates connected to the computer.
 * Supports:
 *  - Vernier Go Direct Photogates (GDX-VPG) via Web Bluetooth & USB (WebHID)
 *  - USB Serial Photogates (Arduino / micro:bit / DIY) via Web Serial API
 *  - Sub-millisecond hardware microsecond timestamp decoding
 */

(function () {
    "use strict";

    // --- DOM Elements ---
    const btnConnectBle = document.getElementById("btnConnectBle");
    const btnConnectUsb = document.getElementById("btnConnectUsb");
    const btnConnectSerial = document.getElementById("btnConnectSerial");
    const btnDisconnect = document.getElementById("btnDisconnect");
    const connStatusPill = document.getElementById("connStatusPill");
    const connDot = document.getElementById("connDot");
    const connStatusText = document.getElementById("connStatusText");
    const compatBanner = document.getElementById("compatBanner");

    const btnAudioToggle = document.getElementById("btnAudioToggle");
    const audioIcon = document.getElementById("audioIcon");
    const audioLabel = document.getElementById("audioLabel");

    // Beam Status Elements
    const boxBeam1 = document.getElementById("boxBeam1");
    const badgeBeam1 = document.getElementById("badgeBeam1");
    const lineBeam1 = document.getElementById("lineBeam1");
    const lblBeam1Duration = document.getElementById("lblBeam1Duration");

    const boxBeam2 = document.getElementById("boxBeam2");
    const badgeBeam2 = document.getElementById("badgeBeam2");
    const lineBeam2 = document.getElementById("lineBeam2");
    const lblBeam2Duration = document.getElementById("lblBeam2Duration");

    // Test Actions
    const btnTestBeam1 = document.getElementById("btnTestBeam1");
    const btnTestBeam2 = document.getElementById("btnTestBeam2");
    const btnTestPass = document.getElementById("btnTestPass");

    // Digital Hero Readout
    const btnZeroReadout = document.getElementById("btnZeroReadout");
    const lblClockSource = document.getElementById("lblClockSource");
    const heroTransitTime = document.getElementById("heroTransitTime");
    const heroTransitMs = document.getElementById("heroTransitMs");
    const inputBeamSpacing = document.getElementById("inputBeamSpacing");
    const valSpeed = document.getElementById("valSpeed");
    const valBeam1Time = document.getElementById("valBeam1Time");
    const valBeam1Speed = document.getElementById("valBeam1Speed");
    const valBeam2Time = document.getElementById("valBeam2Time");
    const valBeam2Speed = document.getElementById("valBeam2Speed");

    // Table Elements
    const tableBody = document.getElementById("tableBody");
    const emptyNotice = document.getElementById("emptyNotice");
    const btnCopyData = document.getElementById("btnCopyData");
    const btnExportCSV = document.getElementById("btnExportCSV");
    const btnClearData = document.getElementById("btnClearData");

    // Diagnostics Elements
    const diagDeviceName = document.getElementById("diagDeviceName");
    const diagConnType = document.getElementById("diagConnType");
    const diagPacketCount = document.getElementById("diagPacketCount");
    const diagLogBox = document.getElementById("diagLogBox");

    // --- State Variables ---
    let soundEnabled = true;
    let connectedDevice = null;
    let serialPort = null;
    let serialReader = null;
    let packetCount = 0;
    let passCount = 0;
    const passesHistory = [];

    // Hardware Beam Tracking
    const beam1 = {
        blocked: false,
        blockTsUs: 0,
        clearTsUs: 0,
        blockPerfMs: 0,
        clearPerfMs: 0,
        durationSec: 0
    };

    const beam2 = {
        blocked: false,
        blockTsUs: 0,
        clearTsUs: 0,
        blockPerfMs: 0,
        clearPerfMs: 0,
        durationSec: 0
    };

    let lastTransitSec = 0;
    let lastClockSource = "STANDBY";

    // --- Web Audio Synthesizer ---
    let audioCtx = null;
    function initAudio() {
        if (!audioCtx && typeof AudioContext !== "undefined") {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.warn("AudioContext error", e);
            }
        }
    }

    function playTone(freq, duration = 0.045, type = "sine") {
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
        } catch (e) {
            // Non-blocking
        }
    }

    // --- Diagnostics Logger ---
    function logDiag(msg) {
        const time = new Date().toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" });
        diagLogBox.textContent = `[${time}] ${msg}\n` + diagLogBox.textContent.slice(0, 3000);
    }

    // --- Browser Compatibility Check ---
    function checkBrowserSupport() {
        const hasBle = typeof navigator !== "undefined" && !!navigator.bluetooth;
        const hasHid = typeof navigator !== "undefined" && !!navigator.hid;
        if (!hasBle && !hasHid) {
            compatBanner.style.display = "flex";
        }
    }

    // --- Vernier Packet Decoder ---
    /**
     * Decodes Vernier Go Direct "aperiodic" measurement packets (0x20).
     * Extracts microsecond timestamps directly from the photogate hardware clock.
     */
    function parseVernierEventPacket(dv) {
        if (dv.byteLength < 16 || dv.getUint8(0) !== 0x20) return null;
        const subtype = dv.getUint8(4);
        if (subtype !== 0x0a && subtype !== 0x0b) return null;
        const channel = dv.getUint8(6);
        const count = dv.getUint8(7);
        const samples = [];
        for (let i = 0; i < count && 8 + i * 8 + 8 <= dv.byteLength; i++) {
            const at = 8 + i * 8;
            const value = subtype === 0x0b ? dv.getInt32(at, true) : dv.getFloat32(at, true);
            const tsUs = dv.getUint32(at + 4, true);
            samples.push({ value, tsUs });
        }
        return samples.length ? { subtype, channel, samples } : null;
    }

    // --- Physical Beam Events ---
    function onBeamEvent(beamNum, isBlocked, hwTsUs = null) {
        initAudio();
        const nowPerf = performance.now();
        const beam = beamNum === 1 ? beam1 : beam2;
        const otherBeam = beamNum === 1 ? beam2 : beam1;

        if (isBlocked) {
            beam.blocked = true;
            beam.blockPerfMs = nowPerf;
            if (hwTsUs !== null) beam.blockTsUs = hwTsUs;
            playTone(beamNum === 1 ? 880 : 988, 0.05, "square");
            setBeamVisual(beamNum, true);
            logDiag(`Beam ${beamNum} BLOCKED (hwTs: ${hwTsUs !== null ? hwTsUs + ' µs' : 'browser clock'})`);
        } else {
            beam.blocked = false;
            beam.clearPerfMs = nowPerf;
            if (hwTsUs !== null) beam.clearTsUs = hwTsUs;

            // Calculate duration
            if (hwTsUs !== null && beam.blockTsUs > 0) {
                let diff = hwTsUs - beam.blockTsUs;
                if (diff < 0) diff += 0x100000000; // 32-bit wrap
                beam.durationSec = diff / 1000000;
            } else if (beam.blockPerfMs > 0) {
                beam.durationSec = (nowPerf - beam.blockPerfMs) / 1000;
            }

            playTone(beamNum === 1 ? 587 : 659, 0.04, "sine");
            setBeamVisual(beamNum, false);
            logDiag(`Beam ${beamNum} CLEARED (duration: ${beam.durationSec.toFixed(5)} s)`);

            if (beamNum === 1) {
                lblBeam1Duration.textContent = `${beam.durationSec.toFixed(4)} s`;
                valBeam1Time.innerHTML = `${beam.durationSec.toFixed(4)} <span class="metric-unit-text">s</span>`;
            } else {
                lblBeam2Duration.textContent = `${beam.durationSec.toFixed(4)} s`;
                valBeam2Time.innerHTML = `${beam.durationSec.toFixed(4)} <span class="metric-unit-text">s</span>`;
            }

            // Check if this unblock completes a pass between beams!
            checkPassCompletion(beamNum);
        }
    }

    function checkPassCompletion(clearedBeamNum) {
        // Did we have a transition from Beam 1 -> Beam 2 (or Beam 2 -> Beam 1)?
        if (beam1.blockPerfMs > 0 && beam2.blockPerfMs > 0) {
            let dtSec = 0;
            let clockSource = "BROWSER CLOCK";

            // If we have microsecond hardware timestamps:
            if (beam1.blockTsUs > 0 && beam2.blockTsUs > 0) {
                let diff = beam2.blockTsUs - beam1.blockTsUs;
                // Handle forward or reverse pass
                if (diff < -0x80000000) diff += 0x100000000;
                dtSec = Math.abs(diff) / 1000000;
                clockSource = "VERNIER HARDWARE CLOCK (1 µs)";
            } else {
                dtSec = Math.abs(beam2.blockPerfMs - beam1.blockPerfMs) / 1000;
                clockSource = "BROWSER PERFORMANCE CLOCK (0.1 ms)";
            }

            // Valid transit interval
            if (dtSec > 0.0001 && dtSec < 10.0) {
                lastTransitSec = dtSec;
                lastClockSource = clockSource;
                displayTransit(dtSec, clockSource);
                logPassRow(dtSec, clockSource);

                // Reset block markers for the next pass
                beam1.blockPerfMs = 0;
                beam2.blockPerfMs = 0;
                beam1.blockTsUs = 0;
                beam2.blockTsUs = 0;
            }
        }
    }

    function displayTransit(dtSec, clockSource) {
        lblClockSource.textContent = clockSource;
        heroTransitTime.innerHTML = `${dtSec.toFixed(6)} <span class="hero-unit">s</span>`;
        const dtMs = dtSec * 1000;
        heroTransitMs.textContent = `(= ${dtMs.toFixed(3)} ms)`;

        // Calculate speed
        const spacingCm = parseFloat(inputBeamSpacing.value) || 2.0;
        const spacingM = spacingCm / 100;
        const speed = spacingM / dtSec;
        valSpeed.innerHTML = `${speed.toFixed(3)} <span class="metric-unit-text">m/s</span>`;

        logDiag(`⭐ PASS COMPLETE: Δt = ${dtSec.toFixed(6)} s (${dtMs.toFixed(3)} ms), Speed = ${speed.toFixed(3)} m/s`);
    }

    function setBeamVisual(beamNum, isBlocked) {
        const box = beamNum === 1 ? boxBeam1 : boxBeam2;
        const badge = beamNum === 1 ? badgeBeam1 : badgeBeam2;
        const line = beamNum === 1 ? lineBeam1 : lineBeam2;

        if (isBlocked) {
            box.classList.add("blocked");
            badge.textContent = "BLOCKED";
            badge.classList.remove("unblocked");
            badge.classList.add("blocked");
            line.classList.add("broken");
        } else {
            box.classList.remove("blocked");
            badge.textContent = "UNBLOCKED";
            badge.classList.remove("blocked");
            badge.classList.add("unblocked");
            line.classList.remove("broken");
        }
    }

    // --- Data Table Logging ---
    function logPassRow(dtSec, clockSource) {
        passCount++;
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const dtMs = dtSec * 1000;
        const spacingCm = parseFloat(inputBeamSpacing.value) || 2.0;
        const speed = (spacingCm / 100) / dtSec;

        const row = {
            pass: passCount,
            time: timeStr,
            transitSec: dtSec,
            transitMs: dtMs,
            b1Sec: beam1.durationSec,
            b2Sec: beam2.durationSec,
            speed: speed,
            source: clockSource
        };
        passesHistory.push(row);

        emptyNotice.style.display = "none";
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <th scope="row">${passCount}</th>
            <td>${timeStr}</td>
            <td><strong>${dtSec.toFixed(6)} s</strong></td>
            <td>${dtMs.toFixed(3)} ms</td>
            <td>${beam1.durationSec > 0 ? beam1.durationSec.toFixed(4) + ' s' : '—'}</td>
            <td>${beam2.durationSec > 0 ? beam2.durationSec.toFixed(4) + ' s' : '—'}</td>
            <td><strong>${speed.toFixed(3)} m/s</strong></td>
            <td>${clockSource.includes("VERNIER") ? "Vernier GDX-VPG" : "Serial / Clock"}</td>
        `;
        tableBody.prepend(tr);
    }

    // --- Connect Vernier Go Direct Photogate ---
    async function connectVernier(isBle = true) {
        initAudio();
        if (typeof window.godirect === "undefined") {
            alert("Vernier Go Direct library is loading. Please try again in a moment.");
            return;
        }

        try {
            logDiag(`Opening device chooser for Vernier Go Direct (${isBle ? "Bluetooth" : "USB WebHID"})...`);
            connStatusText.textContent = "Connecting to Vernier device...";

            // Use official godirect selector
            const device = await window.godirect.selectDevice(isBle);
            if (!device) {
                connStatusText.textContent = "Connection cancelled.";
                return;
            }

            connectedDevice = device;
            const devName = device.name || "Vernier Go Direct Photogate";
            diagDeviceName.textContent = devName;
            diagConnType.textContent = isBle ? "Bluetooth (BLE)" : "USB (WebHID)";
            connStatusPill.classList.remove("disconnected");
            connStatusPill.classList.add("connected");
            connStatusText.textContent = `CONNECTED: ${devName}`;
            btnDisconnect.style.display = "inline-flex";
            btnConnectBle.style.display = "none";
            btnConnectUsb.style.display = "none";
            btnConnectSerial.style.display = "none";

            logDiag(`Connected to ${devName}. Inspecting sensor channels...`);
            device.sensors.forEach(s => {
                logDiag(`  Channel ${s.number}: "${s.name}" (${s.unit || 'state'})`);
            });

            // Tap into raw packets to capture 1 µs hardware timestamps
            tapVernierPackets(device);

            // Enable Beam 1 (Channel 4: "Gate 1 - Gate State")
            // and Beam 2 (Channel 5: "Gate 2 - Gate State")
            // and Velocity (Channel 1: "Object Velocity")
            let gate1Sensor = device.sensors.find(s => /gate\s*1/i.test(s.name) && /state/i.test(s.name)) || device.getSensor(4);
            let gate2Sensor = device.sensors.find(s => /gate\s*2/i.test(s.name) && /state/i.test(s.name)) || device.getSensor(5);
            let velSensor = device.sensors.find(s => /velocity/i.test(s.name)) || device.getSensor(1);

            if (gate1Sensor) {
                gate1Sensor.setEnabled(true);
                gate1Sensor.on("value-changed", (s) => {
                    if (s.value === null) return;
                    onBeamEvent(1, s.value === 1);
                });
                logDiag(`Enabled Gate 1 sensor (channel ${gate1Sensor.number})`);
            }

            if (gate2Sensor) {
                gate2Sensor.setEnabled(true);
                gate2Sensor.on("value-changed", (s) => {
                    if (s.value === null) return;
                    onBeamEvent(2, s.value === 1);
                });
                logDiag(`Enabled Gate 2 sensor (channel ${gate2Sensor.number})`);
            }

            if (velSensor) {
                velSensor.setEnabled(true);
                velSensor.on("value-changed", (s) => {
                    if (s.value === null) return;
                    logDiag(`Firmware Object Velocity: ${s.value.toFixed(4)} m/s`);
                });
            }

            // Start measurements
            if (typeof device.start === "function") {
                await device.start(0);
            }

            device.on("device-closed", () => {
                logDiag("Vernier device disconnected.");
                disconnect();
            });

            logDiag("Listening for optical beam interrupts from photogate hardware!");
        } catch (err) {
            console.error("Vernier connection error:", err);
            connStatusPill.classList.remove("connected");
            connStatusPill.classList.add("disconnected");
            connStatusText.textContent = `Connection failed: ${err.message || err}`;
            logDiag(`Error: ${err.message || err}`);
        }
    }

    /**
     * Intercepts raw DataView packets from godirect to extract 1 µs hardware timestamps.
     */
    function tapVernierPackets(device) {
        const originalHandle = device._handleResponse?.bind(device);
        if (!originalHandle) return;

        device._handleResponse = (dataView) => {
            packetCount++;
            diagPacketCount.textContent = packetCount.toString();
            try {
                const packet = parseVernierEventPacket(dataView);
                if (packet) {
                    packet.samples.forEach(sample => {
                        // Channel 4 = Gate 1, Channel 5 = Gate 2
                        if (packet.channel === 4) {
                            onBeamEvent(1, sample.value === 1, sample.tsUs);
                        } else if (packet.channel === 5) {
                            onBeamEvent(2, sample.value === 1, sample.tsUs);
                        }
                    });
                }
            } catch (e) {
                // Keep resilient
            }
            originalHandle(dataView);
        };
    }

    // --- Connect USB Serial (Arduino / micro:bit) ---
    async function connectSerial() {
        if (!("serial" in navigator)) {
            alert("Web Serial API is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
            return;
        }

        try {
            logDiag("Requesting Serial COM port...");
            serialPort = await navigator.serial.requestPort();
            await serialPort.open({ baudRate: 115200 });

            diagDeviceName.textContent = "USB Serial Photogate";
            diagConnType.textContent = "USB Serial (115200 baud)";
            connStatusPill.classList.remove("disconnected");
            connStatusPill.classList.add("connected");
            connStatusText.textContent = "CONNECTED: USB Serial Photogate";
            btnDisconnect.style.display = "inline-flex";
            btnConnectBle.style.display = "none";
            btnConnectUsb.style.display = "none";
            btnConnectSerial.style.display = "none";

            readSerialStream();
            logDiag("Serial connection active. Reading serial line stream...");
        } catch (err) {
            logDiag(`Serial error: ${err.message || err}`);
            connStatusText.textContent = `Serial Error: ${err.message || err}`;
        }
    }

    async function readSerialStream() {
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = serialPort.readable.pipeTo(textDecoder.writable);
        serialReader = textDecoder.readable.getReader();
        let buffer = "";

        try {
            while (true) {
                const { value, done } = await serialReader.read();
                if (done) break;
                buffer += value;
                const lines = buffer.split("\n");
                buffer = lines.pop(); // keep last incomplete line

                for (const line of lines) {
                    const clean = line.trim().toUpperCase();
                    if (!clean) continue;
                    logDiag(`Serial in: "${clean}"`);

                    if (clean.includes("1") || clean.includes("G1") || clean.includes("BEAM1")) {
                        onBeamEvent(1, clean.includes("BLOCK") || clean === "1");
                    } else if (clean.includes("2") || clean.includes("G2") || clean.includes("BEAM2")) {
                        onBeamEvent(2, clean.includes("BLOCK") || clean === "2");
                    }
                }
            }
        } catch (e) {
            logDiag(`Serial stream ended: ${e.message}`);
        }
    }

    // --- Disconnect Device ---
    function disconnect() {
        if (connectedDevice) {
            try {
                connectedDevice.close();
            } catch (e) {}
            connectedDevice = null;
        }

        if (serialReader) {
            try {
                serialReader.cancel();
            } catch (e) {}
            serialReader = null;
        }

        if (serialPort) {
            try {
                serialPort.close();
            } catch (e) {}
            serialPort = null;
        }

        connStatusPill.classList.remove("connected");
        connStatusPill.classList.add("disconnected");
        connStatusText.textContent = "DISCONNECTED • Click 'Connect' to pair";
        diagDeviceName.textContent = "None";
        diagConnType.textContent = "Disconnected";
        btnDisconnect.style.display = "none";
        btnConnectBle.style.display = "inline-flex";
        btnConnectUsb.style.display = "inline-flex";
        btnConnectSerial.style.display = "inline-flex";
        logDiag("Hardware disconnected.");
    }

    // --- Zero / Reset Timer ---
    function zeroReadout() {
        beam1.blocked = false;
        beam2.blocked = false;
        beam1.blockPerfMs = 0;
        beam2.blockPerfMs = 0;
        beam1.blockTsUs = 0;
        beam2.blockTsUs = 0;
        beam1.durationSec = 0;
        beam2.durationSec = 0;
        lastTransitSec = 0;

        setBeamVisual(1, false);
        setBeamVisual(2, false);

        lblBeam1Duration.textContent = "0.0000 s";
        lblBeam2Duration.textContent = "0.0000 s";
        valBeam1Time.innerHTML = `0.0000 <span class="metric-unit-text">s</span>`;
        valBeam2Time.innerHTML = `0.0000 <span class="metric-unit-text">s</span>`;
        heroTransitTime.innerHTML = `0.000000 <span class="hero-unit">s</span>`;
        heroTransitMs.textContent = `(= 0.00 ms)`;
        valSpeed.innerHTML = `— <span class="metric-unit-text">m/s</span>`;

        logDiag("Timer readout zeroed / reset.");
    }

    // --- Manual Test Pass Helper ---
    function runTestPass(speedMps = 1.0) {
        initAudio();
        const spacingCm = parseFloat(inputBeamSpacing.value) || 2.0;
        const spacingM = spacingCm / 100;
        const transitSec = spacingM / speedMps;
        const transitMs = transitSec * 1000;
        const flagWidthM = 0.01; // 1 cm flag
        const blockDurationMs = (flagWidthM / speedMps) * 1000;

        logDiag(`Running simulated test pass: ${speedMps} m/s across ${spacingCm} cm...`);

        // Beam 1 break
        onBeamEvent(1, true);
        setTimeout(() => {
            onBeamEvent(1, false);
        }, blockDurationMs);

        // Beam 2 break after transit interval
        setTimeout(() => {
            onBeamEvent(2, true);
            setTimeout(() => {
                onBeamEvent(2, false);
            }, blockDurationMs);
        }, transitMs);
    }

    // --- Data Export & Clipboard ---
    function copyTable() {
        if (passesHistory.length === 0) {
            alert("No recorded passes to copy yet.");
            return;
        }

        let tsv = "Pass\tTimestamp\tTime Between Beams (s)\tMilliseconds (ms)\tBeam 1 Time (s)\tBeam 2 Time (s)\tSpeed (m/s)\tSource\n";
        passesHistory.forEach(r => {
            tsv += `${r.pass}\t${r.time}\t${r.transitSec.toFixed(6)}\t${r.transitMs.toFixed(3)}\t${r.b1Sec.toFixed(4)}\t${r.b2Sec.toFixed(4)}\t${r.speed.toFixed(3)}\t${r.source}\n`;
        });

        navigator.clipboard.writeText(tsv).then(() => {
            const orig = btnCopyData.textContent;
            btnCopyData.textContent = "✓ Copied!";
            setTimeout(() => btnCopyData.textContent = orig, 1800);
        }).catch(() => {
            alert("Could not copy table to clipboard.");
        });
    }

    function exportCSV() {
        if (passesHistory.length === 0) {
            alert("No recorded passes to export yet.");
            return;
        }

        let csv = "Pass,Timestamp,Time Between Beams (s),Milliseconds (ms),Beam 1 Time (s),Beam 2 Time (s),Speed (m/s),Source\n";
        passesHistory.forEach(r => {
            csv += `${r.pass},"${r.time}",${r.transitSec.toFixed(6)},${r.transitMs.toFixed(3)},${r.b1Sec.toFixed(4)},${r.b2Sec.toFixed(4)},${r.speed.toFixed(3)},"${r.source}"\n`;
        });

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `photogate_transit_times_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function clearData() {
        if (passesHistory.length === 0) return;
        if (confirm("Clear all recorded photogate times?")) {
            passesHistory.length = 0;
            tableBody.innerHTML = "";
            emptyNotice.style.display = "block";
            passCount = 0;
            zeroReadout();
            logDiag("Data log cleared.");
        }
    }

    // --- Recalculate Speed on Spacing Input Change ---
    function onSpacingChange() {
        if (lastTransitSec > 0) {
            const spacingCm = parseFloat(inputBeamSpacing.value) || 2.0;
            const speed = (spacingCm / 100) / lastTransitSec;
            valSpeed.innerHTML = `${speed.toFixed(3)} <span class="metric-unit-text">m/s</span>`;
        }
    }

    // --- Event Listeners ---
    function initListeners() {
        btnConnectBle.addEventListener("click", () => connectVernier(true));
        btnConnectUsb.addEventListener("click", () => connectVernier(false));
        btnConnectSerial.addEventListener("click", connectSerial);
        btnDisconnect.addEventListener("click", disconnect);

        btnAudioToggle.addEventListener("click", () => {
            soundEnabled = !soundEnabled;
            btnAudioToggle.setAttribute("aria-pressed", soundEnabled.toString());
            audioIcon.textContent = soundEnabled ? "🔊" : "🔇";
            audioLabel.textContent = soundEnabled ? "Audio Beeps: ON" : "Audio Beeps: OFF";
        });

        btnZeroReadout.addEventListener("click", zeroReadout);
        inputBeamSpacing.addEventListener("input", onSpacingChange);

        // Manual Test buttons
        btnTestBeam1.addEventListener("click", () => {
            onBeamEvent(1, true);
            setTimeout(() => onBeamEvent(1, false), 50);
        });
        btnTestBeam2.addEventListener("click", () => {
            onBeamEvent(2, true);
            setTimeout(() => onBeamEvent(2, false), 50);
        });
        btnTestPass.addEventListener("click", () => runTestPass(1.0));

        // Data actions
        btnCopyData.addEventListener("click", copyTable);
        btnExportCSV.addEventListener("click", exportCSV);
        btnClearData.addEventListener("click", clearData);

        // Keyboard triggers for rapid testing: [1], [2], [Space], [Z]
        window.addEventListener("keydown", (e) => {
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
            if (e.key === "1") {
                e.preventDefault();
                onBeamEvent(1, true);
                setTimeout(() => onBeamEvent(1, false), 50);
            } else if (e.key === "2") {
                e.preventDefault();
                onBeamEvent(2, true);
                setTimeout(() => onBeamEvent(2, false), 50);
            } else if (e.code === "Space") {
                e.preventDefault();
                runTestPass(1.2);
            } else if (e.key.toLowerCase() === "z") {
                e.preventDefault();
                zeroReadout();
            }
        });
    }

    // --- Init ---
    checkBrowserSupport();
    initListeners();
    zeroReadout();
    logDiag("Hardware Photogate Reader initialized. Ready to connect photogate.");
})();
