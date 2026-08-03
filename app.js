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
const FRICTION = 2.35; // velocity decay per second (exponential base feel)
const STOP_SPEED = 18; // deg/s
const MIN_FLICK_SPEED = 140; // deg/s
const MAX_SPEED = 2600;

const CLOCK_SVG = (value) => `
  <svg viewBox="0 0 96 96" aria-hidden="true">
    <defs>
      <radialGradient id="clockGlow${value}" cx="50%" cy="45%" r="55%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="55%" stop-color="#d9f4ff"/>
        <stop offset="100%" stop-color="#4ea8d0"/>
      </radialGradient>
    </defs>
    <g fill="url(#clockGlow${value})">
      <path d="M48 4 L54 22 L74 12 L64 32 L88 38 L64 44 L74 64 L54 54 L48 78 L42 54 L22 64 L32 44 L8 38 L32 32 L22 12 L42 22 Z"/>
    </g>
    <circle cx="48" cy="42" r="20" fill="#1d6f95" stroke="#0f4d6b" stroke-width="2.2"/>
    <circle cx="48" cy="42" r="15.5" fill="#f7fbff"/>
    <text x="48" y="49" text-anchor="middle" font-size="22" font-family="Fredoka, Baloo 2, sans-serif" font-weight="800" fill="#152028">${value}</text>
  </svg>
`;

const MICKEY_SVG = `
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <g fill="#ffe14a" stroke="#e0b400" stroke-width="1.2">
      <circle cx="18" cy="18" r="12"/>
      <circle cx="46" cy="18" r="12"/>
      <circle cx="32" cy="36" r="18"/>
    </g>
    <circle cx="32" cy="36" r="7" fill="none" stroke="#1a1a1a" stroke-width="2.4"/>
    <line x1="32" y1="29" x2="32" y2="20" stroke="#1a1a1a" stroke-width="2.4" stroke-linecap="round"/>
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
let lastTickSlot = slotIndex(0);
let audioCtx = null;
let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let dragPointerId = null;
let lastDragAngle = 0;
let lastDragTime = 0;
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
  // Boundary crossings every 30°, offset so ticks happen at segment edges.
  return Math.floor(normalize(deg) / SEGMENT_DEG);
}

function segmentAt(deg) {
  return Math.floor((normalize(deg) + SEGMENT_DEG / 2) / SEGMENT_DEG) % SEGMENTS.length;
}

function nearestCenter(deg) {
  return Math.round(deg / SEGMENT_DEG) * SEGMENT_DEG;
}

function renderNeedle() {
  needleEl.style.transform = `rotate(${angle}deg)`;
}

function announce(segment) {
  resultEl.textContent = segment.label;
  resultEl.classList.remove("pop");
  void resultEl.offsetWidth;
  resultEl.classList.add("pop");
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

  const maxClicks = 8;
  const clicks = Math.min(steps, maxClicks);
  for (let i = 0; i < clicks; i += 1) {
    playTick();
  }
  lastTickSlot = slotIndex(toAngle);
}

function setBusy(isBusy) {
  spinBtn.disabled = isBusy;
}

function finishSpin() {
  angle = nearestCenter(angle);
  velocity = 0;
  mode = "idle";
  lastTickSlot = slotIndex(angle);
  renderNeedle();
  setBusy(false);
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
    const decay = Math.exp(-FRICTION * dt);
    velocity *= decay;
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

function beginCoast(speed) {
  velocity = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed));

  if (Math.abs(velocity) < 40) {
    angle = nearestCenter(angle);
    renderNeedle();
    mode = "idle";
    setBusy(false);
    announce(SEGMENTS[segmentAt(angle)]);
    return;
  }

  // Light flicks still get a little boost so the needle doesn't die immediately.
  if (Math.abs(velocity) < MIN_FLICK_SPEED) {
    velocity = Math.sign(velocity || 1) * MIN_FLICK_SPEED;
  }

  mode = "coasting";
  setBusy(true);
  resultEl.textContent = "Spinning…";
  resultEl.classList.remove("pop");
  startLoop();
}

function buttonSpin() {
  if (mode !== "idle") return;
  ensureAudio();

  if (reducedMotion) {
    const index = pickIndex();
    angle = index * SEGMENT_DEG;
    renderNeedle();
    announce(SEGMENTS[index]);
    return;
  }

  const direction = Math.random() > 0.5 ? 1 : -1;
  const speed = (980 + Math.random() * 900) * direction;
  beginCoast(speed);
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

function onPointerDown(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (mode === "coasting") return;

  ensureAudio();
  dragPointerId = event.pointerId;
  stageEl.setPointerCapture(event.pointerId);
  stageEl.classList.add("is-dragging");

  mode = "dragging";
  setBusy(true);
  resultEl.textContent = "Flick…";
  resultEl.classList.remove("pop");

  lastDragAngle = pointerAngleFromEvent(event);
  lastDragTime = performance.now();
  dragSamples = [{ angle: lastDragAngle, time: lastDragTime }];
  velocity = 0;
  stopLoop();
}

function onPointerMove(event) {
  if (dragPointerId !== event.pointerId || mode !== "dragging") return;

  const nextAngle = pointerAngleFromEvent(event);
  let delta = nextAngle - lastDragAngle;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  const prev = angle;
  angle += delta;
  emitTicks(prev, angle);
  renderNeedle();

  const now = performance.now();
  dragSamples.push({ angle: nextAngle, time: now });
  while (dragSamples.length > 6) dragSamples.shift();

  lastDragAngle = nextAngle;
  lastDragTime = now;
}

function onPointerUp(event) {
  if (dragPointerId !== event.pointerId) return;

  stageEl.releasePointerCapture(event.pointerId);
  stageEl.classList.remove("is-dragging");
  dragPointerId = null;

  let flickSpeed = 0;
  if (dragSamples.length >= 2) {
    const first = dragSamples[0];
    const last = dragSamples[dragSamples.length - 1];
    const dt = (last.time - first.time) / 1000;
    if (dt > 0.001) {
      let delta = last.angle - first.angle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      // Use unwrapped needle motion from recent samples for a truer flick.
      let travel = 0;
      for (let i = 1; i < dragSamples.length; i += 1) {
        let step = dragSamples[i].angle - dragSamples[i - 1].angle;
        if (step > 180) step -= 360;
        if (step < -180) step += 360;
        travel += step;
      }
      const travelDt =
        (dragSamples[dragSamples.length - 1].time - dragSamples[0].time) / 1000;
      flickSpeed = travelDt > 0 ? travel / travelDt : 0;
    }
  }

  dragSamples = [];

  if (reducedMotion) {
    angle = nearestCenter(angle);
    renderNeedle();
    mode = "idle";
    setBusy(false);
    announce(SEGMENTS[segmentAt(angle)]);
    return;
  }

  beginCoast(flickSpeed);
}

function onPointerCancel(event) {
  if (dragPointerId !== event.pointerId) return;
  stageEl.classList.remove("is-dragging");
  dragPointerId = null;
  dragSamples = [];
  beginCoast(velocity);
}

buildLabels();
renderNeedle();

spinBtn.addEventListener("click", () => {
  ensureAudio();
  buttonSpin();
});

stageEl.addEventListener("pointerdown", onPointerDown);
stageEl.addEventListener("pointermove", onPointerMove);
stageEl.addEventListener("pointerup", onPointerUp);
stageEl.addEventListener("pointercancel", onPointerCancel);
