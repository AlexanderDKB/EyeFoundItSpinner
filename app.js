const SEGMENTS = [
  { id: "clock-1", label: "Clock 1", type: "clock", value: "1" },
  { id: "3", label: "3", type: "number", value: "3" },
  { id: "4", label: "4", type: "number", value: "4" },
  { id: "mickey-search-a", label: "Mickey search", type: "mickey" },
  { id: "5", label: "5", type: "number", value: "5" },
  { id: "6", label: "6", type: "number", value: "6" },
  { id: "clock-2", label: "Clock 2", type: "clock", value: "2" },
  { id: "7", label: "7", type: "number", value: "7" },
  { id: "8", label: "8", type: "number", value: "8" },
  { id: "mickey-search-b", label: "Mickey search", type: "mickey" },
  { id: "1", label: "1", type: "number", value: "1" },
  { id: "2", label: "2", type: "number", value: "2" },
];

const SEGMENT_DEG = 30;
const SPIN_DIRECTION = 1; // clockwise
const FRICTION = 0.72; // lower = longer coast
const STOP_SPEED = 10; // deg/s
const MIN_FLICK_SPEED = 200; // deg/s
const MAX_SPEED = 4800;
const BUTTON_SPEED_MIN = 2100;
const BUTTON_SPEED_SPAN = 1400;

const CLOCK_SVG = (value) => `
  <svg viewBox="0 0 80 110" aria-hidden="true">
    <defs>
      <linearGradient id="towerStone${value}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#d9f4ff"/>
        <stop offset="55%" stop-color="#6eb8d8"/>
        <stop offset="100%" stop-color="#2f7ea3"/>
      </linearGradient>
    </defs>
    <!-- spire -->
    <path d="M40 4 L46 22 L34 22 Z" fill="#1d5f7a"/>
    <rect x="37" y="20" width="6" height="8" rx="1" fill="#245f78"/>
    <!-- roof -->
    <path d="M18 36 L40 22 L62 36 Z" fill="#1d6f95"/>
    <path d="M22 36 L40 26 L58 36 Z" fill="#2f8bb3"/>
    <!-- tower body -->
    <rect x="22" y="36" width="36" height="68" rx="3" fill="url(#towerStone${value})" stroke="#0f4d6b" stroke-width="1.6"/>
    <!-- corner buttresses -->
    <rect x="18" y="40" width="6" height="60" rx="1.5" fill="#3f92b4" stroke="#0f4d6b" stroke-width="1"/>
    <rect x="56" y="40" width="6" height="60" rx="1.5" fill="#3f92b4" stroke="#0f4d6b" stroke-width="1"/>
    <!-- upper window -->
    <rect x="34" y="42" width="12" height="10" rx="2" fill="#0f3d52"/>
    <!-- clock face -->
    <circle cx="40" cy="68" r="14" fill="#1d6f95" stroke="#0f4d6b" stroke-width="1.8"/>
    <circle cx="40" cy="68" r="11.2" fill="#f7fbff"/>
    <text x="40" y="73.5" text-anchor="middle" font-size="14" font-family="Fredoka, Baloo 2, sans-serif" font-weight="800" fill="#152028">${value}</text>
    <!-- base -->
    <rect x="16" y="100" width="48" height="8" rx="2" fill="#1d6f95" stroke="#0f4d6b" stroke-width="1.4"/>
  </svg>
`;

const MICKEY_SVG = `
  <svg viewBox="0 0 72 72" aria-hidden="true">
    <g fill="#ffe14a" stroke="#e0b400" stroke-width="1.4">
      <circle cx="20" cy="20" r="14"/>
      <circle cx="52" cy="20" r="14"/>
      <circle cx="36" cy="40" r="21"/>
    </g>
    <circle cx="36" cy="40" r="8.5" fill="none" stroke="#1a1a1a" stroke-width="2.8"/>
    <line x1="36" y1="31.5" x2="36" y2="20" stroke="#1a1a1a" stroke-width="2.8" stroke-linecap="round"/>
  </svg>
`;

const labelsEl = document.getElementById("labels");
const wheelEl = document.getElementById("wheel");
const wheelSelectionEl = document.getElementById("wheelSelection");
const needleEl = document.getElementById("needle");
const stageEl = document.getElementById("spinnerStage");
const spinBtn = document.getElementById("spinBtn");
const resultEl = document.getElementById("result");

let angle = 0;
let velocity = 0;
let mode = "idle"; // idle | dragging | coasting
let rafId = 0;
let lastTs = 0;
let lastTickSlot = 0;
let audioCtx = null;
let audioUnlocked = false;
let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let selectedIndex = null;
let sfx = null;
let voiceList = [];
let voiceIndex = 0;

let dragPointerId = null;
let lastDragAngle = 0;
let dragSamples = [];

function buildLabels() {
  const frag = document.createDocumentFragment();

  SEGMENTS.forEach((segment, index) => {
    const label = document.createElement("div");
    label.className = "label";
    label.dataset.index = String(index);
    label.style.setProperty("--i", String(index));

    if (segment.type === "number") {
      label.textContent = segment.value;
    } else if (segment.type === "clock") {
      label.classList.add("label--clock");
      label.innerHTML = CLOCK_SVG(segment.value);
    } else {
      label.classList.add("label--mickey");
      label.innerHTML = MICKEY_SVG;
    }

    frag.appendChild(label);
  });

  labelsEl.appendChild(frag);
}

function normalize(deg) {
  return ((deg % 360) + 360) % 360;
}

function slotIndex(deg) {
  return Math.floor(normalize(deg) / SEGMENT_DEG);
}

function segmentAt(deg) {
  return Math.floor((normalize(deg) + SEGMENT_DEG / 2) / SEGMENT_DEG) % SEGMENTS.length;
}

function clampSpeed(speed) {
  return Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed));
}

function renderNeedle() {
  needleEl.style.transform = `rotate(${angle}deg)`;
}

function clearSelection() {
  selectedIndex = null;
  wheelEl.classList.remove("has-selection");
  wheelSelectionEl.style.background = "";
  labelsEl.querySelectorAll(".label").forEach((label) => {
    label.classList.remove("is-selected", "is-dimmed");
  });
}

function applySelection(index) {
  selectedIndex = index;
  wheelEl.classList.add("has-selection");

  const stops = [];
  for (let i = 0; i < SEGMENTS.length; i += 1) {
    const start = i * SEGMENT_DEG;
    const end = start + SEGMENT_DEG;
    if (i === index) {
      stops.push(`rgba(255, 255, 255, 0.28) ${start}deg ${end}deg`);
    } else {
      stops.push(`rgba(28, 28, 32, 0.48) ${start}deg ${end}deg`);
    }
  }
  wheelSelectionEl.style.background = `conic-gradient(from -15deg, ${stops.join(", ")})`;

  labelsEl.querySelectorAll(".label").forEach((label) => {
    const i = Number(label.dataset.index);
    label.classList.toggle("is-selected", i === index);
    label.classList.toggle("is-dimmed", i !== index);
  });
}

function announce(segment) {
  resultEl.textContent = segment.label;
  resultEl.classList.remove("pop");
  void resultEl.offsetWidth;
  resultEl.classList.add("pop");
  setButtonLabel("Spin");
  playLandSound(segment);
}

function setButtonLabel(text) {
  if (text === "Spinning…") {
    spinBtn.classList.add("is-spinning", "is-busy");
    spinBtn.innerHTML =
      '<span class="spin-loader" aria-hidden="true"></span>' +
      '<span class="spin-btn-text">Spinning</span>';
    return;
  }

  spinBtn.classList.remove("is-spinning");
  if (text === "Spin") {
    spinBtn.classList.remove("is-busy");
  } else {
    spinBtn.classList.add("is-busy");
  }
  spinBtn.textContent = text;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i += 1) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function samplesToWavUrl(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function makeTickSamples(sampleRate) {
  const count = Math.floor(sampleRate * 0.04);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const t = i / sampleRate;
    const env = Math.pow(1 - i / count, 5);
    samples[i] =
      (Math.sin(2 * Math.PI * 2600 * t) * 0.7 + (Math.random() * 2 - 1) * 0.35) * env;
  }
  return samples;
}

function makeBellSamples(sampleRate, frequency, duration) {
  const count = Math.floor(sampleRate * duration);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const t = i / sampleRate;
    const env = Math.exp((-3.1 * t) / duration);
    samples[i] =
      (Math.sin(2 * Math.PI * frequency * t) * 0.62 +
        Math.sin(2 * Math.PI * frequency * 2.01 * t) * 0.28 +
        Math.sin(2 * Math.PI * frequency * 3.01 * t) * 0.12) *
      env;
  }
  return samples;
}

function buildSfx() {
  if (sfx) return sfx;
  const sampleRate = 22050;
  sfx = {
    tick: new Audio(samplesToWavUrl(makeTickSamples(sampleRate), sampleRate)),
    ding: new Audio(
      samplesToWavUrl(makeBellSamples(sampleRate, 587.33, 0.95), sampleRate)
    ),
    dong: new Audio(
      samplesToWavUrl(makeBellSamples(sampleRate, 440.0, 1.25), sampleRate)
    ),
  };
  Object.values(sfx).forEach((audio) => {
    audio.preload = "auto";
    audio.setAttribute("playsinline", "true");
  });
  return sfx;
}

function playHtmlSound(template, volume) {
  const bank = buildSfx();
  const node = template.cloneNode(true);
  node.volume = volume;
  const playPromise = node.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {});
  }
}

function ensureAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

function unlockAudio() {
  const bank = buildSfx();
  const ctx = ensureAudio();

  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  // iOS: call play() synchronously inside the user gesture.
  [bank.tick, bank.ding, bank.dong].forEach((audio) => {
    try {
      audio.muted = true;
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = false;
          })
          .catch(() => {
            audio.muted = false;
          });
      } else {
        audio.muted = false;
      }
    } catch (_) {
      audio.muted = false;
    }
  });

  audioUnlocked = true;
}

function stopSpeech() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function playTick() {
  playHtmlSound(buildSfx().tick, 0.72);

  // Backup Web Audio click if HTML audio is blocked.
  const ctx = ensureAudio();
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(2100, t);
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.035);
}

function playDingDong() {
  const bank = buildSfx();
  playHtmlSound(bank.ding, 0.95);
  window.setTimeout(() => playHtmlSound(bank.dong, 0.95), 420);

  const ctx = ensureAudio();
  if (!ctx || ctx.state !== "running") return;
  const ring = (freq, delay, dur) => {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  };
  ring(587.33, 0, 0.9);
  ring(440.0, 0.42, 1.2);
}

function refreshVoices() {
  if (!window.speechSynthesis) return;
  voiceList = window.speechSynthesis.getVoices().filter((voice) => voice.lang.startsWith("en"));
  if (!voiceList.length) {
    voiceList = window.speechSynthesis.getVoices();
  }

  const saved = window.localStorage.getItem("efi-voice-uri");
  if (saved) {
    const found = voiceList.findIndex((voice) => voice.voiceURI === saved);
    if (found >= 0) voiceIndex = found;
  }
  updateVoiceButton();
}

function currentVoice() {
  if (!voiceList.length) return null;
  return voiceList[voiceIndex % voiceList.length];
}

function updateVoiceButton() {
  const btn = document.getElementById("voiceBtn");
  if (!btn) return;
  const voice = currentVoice();
  btn.textContent = voice ? `Voice: ${voice.name}` : "Voice: Default";
}

function cycleVoice() {
  unlockAudio();
  if (!voiceList.length) refreshVoices();
  if (!voiceList.length) return;

  voiceIndex = (voiceIndex + 1) % voiceList.length;
  const voice = currentVoice();
  if (voice) {
    window.localStorage.setItem("efi-voice-uri", voice.voiceURI);
  }
  updateVoiceButton();

  // Preview the selected voice.
  stopSpeech();
  if (!window.SpeechSynthesisUtterance) return;
  const preview = new SpeechSynthesisUtterance("Eye Find It");
  preview.rate = 1;
  preview.pitch = 1.1;
  if (voice) preview.voice = voice;
  window.speechSynthesis.speak(preview);
}

function playMickeyFound() {
  stopSpeech();

  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    playDingDong();
    return;
  }

  refreshVoices();
  const voice = currentVoice();

  const line = new SpeechSynthesisUtterance("Eye Find It");
  line.rate = 1;
  line.pitch = 1.2;
  line.volume = 1;
  if (voice) line.voice = voice;

  line.onend = () => {
    const moo = new SpeechSynthesisUtterance("mooooooooooooo");
    moo.rate = 0.28;
    moo.pitch = 0.35;
    moo.volume = 1;
    if (voice) moo.voice = voice;
    window.speechSynthesis.speak(moo);
  };

  window.speechSynthesis.speak(line);
}

function playLandSound(segment) {
  if (segment.type === "clock") {
    stopSpeech();
    playDingDong();
    return;
  }
  if (segment.type === "mickey") {
    playMickeyFound();
  }
}

function boundaryIndex(deg) {
  // Boundaries sit between segment centers (every 30°, offset by 15°).
  return Math.floor((deg + SEGMENT_DEG / 2) / SEGMENT_DEG);
}

function emitTicks(fromAngle, toAngle) {
  const fromBound = boundaryIndex(fromAngle);
  const toBound = boundaryIndex(toAngle);
  const steps = Math.abs(toBound - fromBound);
  if (steps === 0) return;

  const clicks = Math.min(steps, 10);
  for (let i = 0; i < clicks; i += 1) {
    window.setTimeout(() => playTick(), i * 18);
  }
  lastTickSlot = slotIndex(toAngle);
}

function finishSpin() {
  velocity = 0;
  mode = "idle";
  lastTickSlot = slotIndex(angle);
  renderNeedle();
  const index = segmentAt(angle);
  applySelection(index);
  announce(SEGMENTS[index]);
  if (navigator.vibrate) navigator.vibrate(16);
}

function startLoop() {
  if (rafId) return;
  lastTs = performance.now();
  rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (!rafId) return;
  cancelAnimationFrame(rafId);
  rafId = 0;
}

function tick(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000) || 0.016;
  lastTs = ts;

  if (mode === "coasting") {
    const prev = angle;
    velocity *= Math.exp(-FRICTION * dt);
    angle += velocity * dt;
    emitTicks(prev, angle);
    renderNeedle();

    if (Math.abs(velocity) < STOP_SPEED) {
      finishSpin();
      stopLoop();
      return;
    }
  }

  rafId = requestAnimationFrame(tick);
}

function beginCoast(speed, { additive = false } = {}) {
  const next = additive ? velocity + speed : speed;
  velocity = clampSpeed(next);

  if (Math.abs(velocity) < 45) {
    renderNeedle();
    mode = "idle";
    const index = segmentAt(angle);
    applySelection(index);
    announce(SEGMENTS[index]);
    return;
  }

  if (Math.abs(velocity) < MIN_FLICK_SPEED) {
    velocity = Math.sign(velocity || SPIN_DIRECTION) * MIN_FLICK_SPEED;
  }

  stopSpeech();
  unlockAudio();
  clearSelection();
  mode = "coasting";
  setButtonLabel("Spinning…");
  startLoop();
}

function buttonSpin() {
  unlockAudio();
  stopSpeech();

  if (reducedMotion) {
    const index = pickIndex();
    angle = index * SEGMENT_DEG + (Math.random() * 20 - 10);
    renderNeedle();
    applySelection(segmentAt(angle));
    announce(SEGMENTS[segmentAt(angle)]);
    return;
  }

  clearSelection();
  const speed =
    (BUTTON_SPEED_MIN + Math.random() * BUTTON_SPEED_SPAN) * SPIN_DIRECTION;
  // Button always boosts the same direction; stacks if already spinning.
  beginCoast(speed, { additive: mode === "coasting" });
}

function pickIndex() {
  if (window.crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return arr[0] % SEGMENTS.length;
  }
  return Math.floor(Math.random() * SEGMENTS.length);
}

function pointerAngleFromEvent(event) {
  const rect = stageEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = event.clientX - cx;
  const dy = event.clientY - cy;
  // 0deg = 12 o'clock, clockwise positive (CSS rotate)
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

function sampleFlickSpeed() {
  if (dragSamples.length < 2) return 0;

  let travel = 0;
  for (let i = 1; i < dragSamples.length; i += 1) {
    let step = dragSamples[i].angle - dragSamples[i - 1].angle;
    if (step > 180) step -= 360;
    if (step < -180) step += 360;
    travel += step;
  }

  const travelDt =
    (dragSamples[dragSamples.length - 1].time - dragSamples[0].time) / 1000;
  return travelDt > 0 ? travel / travelDt : 0;
}

function onPointerDown(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (dragPointerId !== null) return;

  unlockAudio();
  stopSpeech();
  dragPointerId = event.pointerId;
  stageEl.setPointerCapture(event.pointerId);
  stageEl.classList.add("is-dragging");

  // Grabbing always stops the arm so you can wiggle it, then flick.
  velocity = 0;
  stopLoop();
  clearSelection();
  mode = "dragging";
  setButtonLabel("Flick…");

  lastDragAngle = pointerAngleFromEvent(event);
  dragSamples = [{ angle: lastDragAngle, time: performance.now() }];
}

function onPointerMove(event) {
  if (dragPointerId !== event.pointerId || mode !== "dragging") return;

  const nextAngle = pointerAngleFromEvent(event);
  const now = performance.now();

  let delta = nextAngle - lastDragAngle;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  const prev = angle;
  angle += delta;
  emitTicks(prev, angle);
  renderNeedle();

  dragSamples.push({ angle: nextAngle, time: now });
  while (dragSamples.length > 6) dragSamples.shift();
  lastDragAngle = nextAngle;
}

function onPointerUp(event) {
  if (dragPointerId !== event.pointerId) return;

  stageEl.releasePointerCapture(event.pointerId);
  stageEl.classList.remove("is-dragging");
  dragPointerId = null;

  const flickSpeed = sampleFlickSpeed();
  dragSamples = [];

  if (reducedMotion) {
    renderNeedle();
    mode = "idle";
    velocity = 0;
    const index = segmentAt(angle);
    applySelection(index);
    announce(SEGMENTS[index]);
    return;
  }

  beginCoast(flickSpeed, { additive: false });
}

function onPointerCancel(event) {
  if (dragPointerId !== event.pointerId) return;
  stageEl.classList.remove("is-dragging");
  dragPointerId = null;
  dragSamples = [];
  beginCoast(0, { additive: false });
}

buildLabels();
renderNeedle();
lastTickSlot = slotIndex(angle);

spinBtn.addEventListener("click", () => {
  unlockAudio();
  buttonSpin();
});

stageEl.addEventListener("pointerdown", onPointerDown);
stageEl.addEventListener("pointermove", onPointerMove);
stageEl.addEventListener("pointerup", onPointerUp);
stageEl.addEventListener("pointercancel", onPointerCancel);
