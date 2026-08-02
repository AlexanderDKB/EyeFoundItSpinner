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

const CLOCK_SVG = (value) => `
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <radialGradient id="clockGlow${value}" cx="50%" cy="45%" r="55%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="55%" stop-color="#d9f4ff"/>
        <stop offset="100%" stop-color="#4ea8d0"/>
      </radialGradient>
    </defs>
    <g fill="url(#clockGlow${value})">
      <path d="M32 4 L36 16 L48 10 L42 22 L56 26 L42 30 L48 42 L36 36 L32 50 L28 36 L16 42 L22 30 L8 26 L22 22 L16 10 L28 16 Z"/>
    </g>
    <circle cx="32" cy="28" r="12.5" fill="#1d6f95" stroke="#0f4d6b" stroke-width="1.5"/>
    <circle cx="32" cy="28" r="9.5" fill="#f7fbff"/>
    <text x="32" y="32.5" text-anchor="middle" font-size="13" font-family="Fredoka, Baloo 2, sans-serif" font-weight="800" fill="#152028">${value}</text>
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

const wheel = document.getElementById("wheel");
const labelsEl = document.getElementById("labels");
const spinBtn = document.getElementById("spinBtn");
const resultEl = document.getElementById("result");

let currentRotation = 0;
let spinning = false;

function buildLabels() {
  const frag = document.createDocumentFragment();

  SEGMENTS.forEach((segment, index) => {
    const label = document.createElement("div");
    label.className = "label";
    label.style.setProperty("--i", String(index));

    if (segment.type === "number") {
      label.textContent = segment.value;
    } else if (segment.type === "clock") {
      label.innerHTML = CLOCK_SVG(segment.value);
    } else {
      label.innerHTML = MICKEY_SVG;
    }

    frag.appendChild(label);
  });

  labelsEl.appendChild(frag);
}

function pickIndex() {
  if (window.crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return arr[0] % SEGMENTS.length;
  }
  return Math.floor(Math.random() * SEGMENTS.length);
}

function announce(segment) {
  resultEl.textContent = segment.label;
  resultEl.classList.remove("pop");
  // Force reflow so the pop animation can replay.
  void resultEl.offsetWidth;
  resultEl.classList.add("pop");
}

function spin() {
  if (spinning) return;
  spinning = true;
  spinBtn.disabled = true;
  resultEl.textContent = "Spinning…";
  resultEl.classList.remove("pop");

  const index = pickIndex();
  const segmentAngle = index * 30;
  // Keep the chosen segment centered under the top pointer.
  const targetModulo = (360 - segmentAngle) % 360;
  const extraTurns = 5 + Math.floor(Math.random() * 3);
  const nextRotation =
    currentRotation +
    extraTurns * 360 +
    ((targetModulo - (currentRotation % 360) + 360) % 360);

  wheel.classList.add("spinning");
  wheel.style.transform = `rotate(${nextRotation}deg)`;
  currentRotation = nextRotation;

  let settled = false;
  const onDone = (event) => {
    if (settled) return;
    if (event?.propertyName && event.propertyName !== "transform") return;
    settled = true;
    wheel.removeEventListener("transitionend", onDone);
    spinning = false;
    spinBtn.disabled = false;
    announce(SEGMENTS[index]);

    if (navigator.vibrate) {
      navigator.vibrate(18);
    }
  };

  wheel.addEventListener("transitionend", onDone);
  // Fallback if transitionend is skipped (reduced motion / interrupted).
  window.setTimeout(onDone, 4500);
}

buildLabels();
spinBtn.addEventListener("click", spin);
