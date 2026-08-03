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
let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let dragPointerId = null;
let lastDragAngle = 0;
let dragSamples = [];

function buildLabels() {
  const frag = document.createDocumentFragment();

  SEGMENTS.forEach((segment, index) => {
    const label = document.createElement("div");
    label.className = "label";
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

function nearestCenter(deg) {
  return Math.round(deg / SEGMENT_DEG) * SEGMENT_DEG;
}

function clampSpeed(speed) {
  return Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed));
}

function renderNeedle() {
  needleEl.style.transform = `rotate(${angle}deg)`;
}

function announce(segment) {
  resultEl.textContent = segment.label;
  resultEl.classList.remove("pop");
  void resultEl.offsetWidth;
  resultEl.classList.add("pop");
  setButtonLabel("Spin");
}

function setButtonLabel(text) {
  spinBtn.textContent = text;
}

function ensureAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTick() {
  const ctx = ensureAudio();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(1550, now);
  osc.frequency.exponentialRampToValueAtTime(420, now + 0.045);

  filter.type = "highpass";
  filter.frequency.value = 650;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.06);
}

function emitTicks(fromAngle, toAngle) {
  const fromSlot = Math.floor(fromAngle / SEGMENT_DEG);
  const toSlot = Math.floor(toAngle / SEGMENT_DEG);
  const steps = Math.abs(toSlot - fromSlot);
  if (steps === 0) return;

  const clicks = Math.min(steps, 8);
  for (let i = 0; i < clicks; i += 1) {
    playTick();
  }
  lastTickSlot = slotIndex(toAngle);
}

function finishSpin() {
  angle = nearestCenter(angle);
  velocity = 0;
  mode = "idle";
  lastTickSlot = slotIndex(angle);
  renderNeedle();
  announce(SEGMENTS[segmentAt(angle)]);
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
    angle = nearestCenter(angle);
    renderNeedle();
    mode = "idle";
    announce(SEGMENTS[segmentAt(angle)]);
    return;
  }

  if (Math.abs(velocity) < MIN_FLICK_SPEED) {
    velocity = Math.sign(velocity || SPIN_DIRECTION) * MIN_FLICK_SPEED;
  }

  mode = "coasting";
  setButtonLabel("Spinning…");
  startLoop();
}

function buttonSpin() {
  ensureAudio();

  if (reducedMotion) {
    const index = pickIndex();
    angle = index * SEGMENT_DEG;
    renderNeedle();
    announce(SEGMENTS[index]);
    return;
  }

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

  ensureAudio();
  dragPointerId = event.pointerId;
  stageEl.setPointerCapture(event.pointerId);
  stageEl.classList.add("is-dragging");

  // Grabbing always stops the arm so you can wiggle it, then flick.
  velocity = 0;
  stopLoop();
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
    angle = nearestCenter(angle);
    renderNeedle();
    mode = "idle";
    velocity = 0;
    announce(SEGMENTS[segmentAt(angle)]);
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
  ensureAudio();
  buttonSpin();
});

stageEl.addEventListener("pointerdown", onPointerDown);
stageEl.addEventListener("pointermove", onPointerMove);
stageEl.addEventListener("pointerup", onPointerUp);
stageEl.addEventListener("pointercancel", onPointerCancel);
