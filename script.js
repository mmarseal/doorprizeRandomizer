// ---- App State ----
let participants = []; // array of strings
let history = [];

// ---- DOM ----
const fileInput = document.getElementById("fileInput");
const currentNameEl = document.getElementById("currentName");
const subText = document.getElementById("subText");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const resetBtn = document.getElementById("resetBtn");
const removeWinnerBtn = document.getElementById("removeWinnerBtn");
const countPill = document.getElementById("countPill");
const statusPill = document.getElementById("statusPill");
const lastWinnerPill = document.getElementById("lastWinnerPill");
const participantList = document.getElementById("participantList");
const remainingCount = document.getElementById("remainingCount");
const historyList = document.getElementById("historyList");
const historyCount = document.getElementById("historyCount");

// ---- Spinner / timing control ----
let spinning = false;
let spinTimer = null;
let spinInterval = 60; // ms between name changes
let spinStartTime = 0;
let decelerating = false;
let decelStart = 0;
let decelDuration = 3000; // ms to slow down after stop pressed
let audioCtx = null;
let spinTone = null;

// ---- Confetti ----
const confCanvas = document.getElementById("confettiCanvas");
const cctx = confCanvas.getContext("2d");
let confettiParticles = [];
function resizeCanvas() {
  confCanvas.width = window.innerWidth;
  confCanvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function launchConfetti() {
  confettiParticles = [];
  const count = 120;
  for (let i = 0; i < count; i++) {
    confettiParticles.push({
      x: Math.random() * confCanvas.width,
      y: -10 - Math.random() * 300,
      vx: (Math.random() - 0.5) * 6,
      vy: 2 + Math.random() * 6,
      size: 6 + Math.random() * 8,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 10,
      color: ["#ff4d4f", "#00e676", "#ffd54f", "#40c4ff", "#b388ff"][
        Math.floor(Math.random() * 5)
      ],
    });
  }
  requestAnimationFrame(confettiLoop);
  setTimeout(() => {
    confettiParticles = [];
  }, 7000);
}
function confettiLoop() {
  cctx.clearRect(0, 0, confCanvas.width, confCanvas.height);
  if (confettiParticles.length === 0) return;
  for (let p of confettiParticles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.rot += p.vr;
    cctx.save();
    cctx.translate(p.x, p.y);
    cctx.rotate((p.rot * Math.PI) / 180);
    cctx.fillStyle = p.color;
    cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    cctx.restore();
  }
  requestAnimationFrame(confettiLoop);
}

// ---- Audio ----
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}
function startSpinSound() {
  try {
    ensureAudio();
    spinTone = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    spinTone.type = "sawtooth";
    spinTone.frequency.value = 220;
    gain.gain.value = 0.0005; // subtle
    spinTone.connect(gain);
    gain.connect(audioCtx.destination);
    spinTone.start();
  } catch (e) {
    console.warn("audio failed", e);
  }
}
function rampSpinSound(targetFreq, timeMs = 300) {
  if (spinTone) {
    const now = audioCtx.currentTime;
    spinTone.frequency.cancelScheduledValues(now);
    spinTone.frequency.linearRampToValueAtTime(targetFreq, now + timeMs / 1000);
  }
}
function stopSpinSound() {
  try {
    if (spinTone) {
      spinTone.stop();
      spinTone.disconnect();
      spinTone = null;
    }
  } catch (e) {}
}
function playBell() {
  try {
    ensureAudio();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "triangle";
    o.frequency.value = 880;
    g.gain.value = 0.0009;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.frequency.exponentialRampToValueAtTime(220, audioCtx.currentTime + 0.6);
    g.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.8);
    setTimeout(() => {
      try {
        o.stop();
        o.disconnect();
      } catch (e) {}
    }, 900);
  } catch (e) {
    console.warn(e);
  }
}

// ---- Utils ----
function parseCSV(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  // If header-like, check if first row contains non-letter? but assume single column names
  const names = [];
  for (let r of lines) {
    // split by comma if multiple columns, choose first non-empty cell
    const cols = r
      .split(",")
      .map((c) => c.replace(/^\uFEFF/, "").trim())
      .filter(Boolean);
    if (cols.length > 0) names.push(cols[0]);
  }
  return names;
}

function updateParticipantUI() {
  countPill.textContent = "Participants: " + participants.length;
  remainingCount.textContent = participants.length;
  participantList.innerHTML = "";
  if (participants.length === 0) {
    participantList.textContent = "No participants loaded";
    return;
  }
  for (let i = 0; i < participants.length; i++) {
    const div = document.createElement("div");
    div.className = "list-item";
    const span = document.createElement("div");
    span.textContent = participants[i];
    const sm = document.createElement("small");
    sm.textContent = i + 1;
    div.appendChild(span);
    div.appendChild(sm);
    participantList.appendChild(div);
  }
}
function updateHistoryUI() {
  historyCount.textContent = history.length;
  historyList.innerHTML = "";
  if (history.length === 0) {
    historyList.textContent = "No winners yet";
    return;
  }
  for (let i = 0; i < history.length; i++) {
    const div = document.createElement("div");
    div.className = "list-item";
    const span = document.createElement("div");
    span.textContent = history[i];
    const sm = document.createElement("small");
    sm.textContent = i + 1;
    div.appendChild(span);
    div.appendChild(sm);
    historyList.appendChild(div);
  }
}

// ---- CSV upload ----
document
  .querySelector(".file-label")
  .addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = function (ev) {
    const text = ev.target.result;
    const names = parseCSV(text);
    participants = names.slice();
    history = [];
    currentNameEl.textContent = "Ready";
    subText.textContent = "File loaded: " + (f.name || "uploaded");
    updateParticipantUI();
    updateHistoryUI();
    lastWinnerPill.textContent = "Last winner: —";
    statusPill.textContent = "Status: ready";
  };
  reader.readAsText(f);
});

// ---- Spinning logic ----
function spinStep() {
  if (!spinning) return;
  // update displayed name
  if (participants.length === 0) {
    currentNameEl.textContent = "No participants";
    stopImmediate();
    return;
  }
  const idx = Math.floor(Math.random() * participants.length);
  currentNameEl.textContent = participants[idx];

  // schedule next; interval may grow if decelerating
  if (decelerating) {
    const elapsed = Date.now() - decelStart;
    const t = Math.min(1, elapsed / decelDuration);
    // easeOutQuad for interval multiplier
    const mul = 1 + Math.pow(t, 0.8) * 20; // from 1 to ~21
    const nextInterval = Math.min(800, Math.floor(spinInterval * mul));
    spinTimer = setTimeout(spinStep, nextInterval);
    if (t >= 1) {
      // final stop: current displayed name is winner
      finalizeWinner(currentNameEl.textContent);
    }
  } else {
    spinTimer = setTimeout(spinStep, spinInterval);
  }
}

function startSpin() {
  if (spinning) return;
  if (participants.length === 0) {
    alert("No participants loaded. Upload CSV first.");
    return;
  }
  spinning = true;
  decelerating = false;
  spinStartTime = Date.now();
  statusPill.textContent = "Status: spinning";
  startBtn.disabled = true;
  stopBtn.disabled = false;
  removeWinnerBtn.disabled = true;
  subText.textContent = "Spinning... press STOP to choose winner";
  startSpinSound();
  rampSpinSound(420, 200);
  spinStep();
}

function beginDecel() {
  if (!spinning || decelerating) return;
  decelerating = true;
  decelStart = Date.now();
  // raise spin sound frequency slightly to signal slow
  rampSpinSound(560, 200);
}

function stopImmediate() {
  if (spinTimer) clearTimeout(spinTimer);
  spinTimer = null;
  spinning = false;
  decelerating = false;
  stopSpinSound();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  removeWinnerBtn.disabled = false;
  statusPill.textContent = "Status: idle";
}

function finalizeWinner(name) {
  stopImmediate();
  // record winner and update UI
  history.unshift(name);
  lastWinnerPill.textContent = "Last winner: " + name;
  updateHistoryUI();
  playBell();
  launchConfetti();
  subText.textContent = "Winner: " + name;
}

function stopSpin() {
  if (!spinning) return;
  // start deceleration rather than immediate stop to feel premium
  beginDecel();
  // after decelDuration + small buffer, ensure stop
  setTimeout(() => {
    if (spinning && decelerating) {
      // will be finalized at end of spinStep when t>=1
    }
  }, decelDuration + 100);
}

// ---- Remove winner from participants ----
removeWinnerBtn.addEventListener("click", () => {
  const last = history[0];
  if (!last) return; // nothing
  const idx = participants.indexOf(last);
  if (idx > -1) {
    participants.splice(idx, 1);
    updateParticipantUI();
  }
  removeWinnerBtn.disabled = true;
});

// ---- Button handlers ----
startBtn.addEventListener("click", () => {
  startSpin();
});
stopBtn.addEventListener("click", () => {
  stopSpin();
});
resetBtn.addEventListener("click", () => {
  if (confirm("Reset all data? This will clear participants and history.")) {
    participants = [];
    history = [];
    updateParticipantUI();
    updateHistoryUI();
    currentNameEl.textContent = "Ready";
    subText.textContent = "Upload CSV lalu tekan START";
    countPill.textContent = "Participants: 0";
    lastWinnerPill.textContent = "Last winner: —";
  }
});

// keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (e.key === " ") {
    e.preventDefault();
    if (!spinning) startSpin();
    else if (!decelerating) stopSpin();
  }
  if (e.key === "r") {
    resetBtn.click();
  }
});

// ---- Finalize before unload ----
window.addEventListener("beforeunload", () => {
  stopSpinSound();
});
