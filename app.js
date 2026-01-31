const baseKeys = ["1", "2", "3", "4", "5"];
const baseColors = [
  "var(--lane-1)",
  "var(--lane-2)",
  "var(--lane-3)",
  "var(--lane-4)",
  "var(--lane-5)",
];

const audio = document.getElementById("audio");
const audioFile = document.getElementById("audioFile");
const songSelect = document.getElementById("songSelect");
const difficultySelect = document.getElementById("difficulty");
const speedSelect = document.getElementById("speed");
const keyCountSelect = document.getElementById("keyCount");
const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");
const lanesEl = document.getElementById("lanes");
const laneKeysEl = document.getElementById("laneKeys");
const timelineBar = document.getElementById("timelineBar");
const playfield = document.getElementById("playfield");
const songMeta = document.getElementById("songMeta");
const modeLabel = document.getElementById("modeLabel");
const scoreLabel = document.getElementById("scoreLabel");
const comboLabel = document.getElementById("comboLabel");
const accuracyLabel = document.getElementById("accuracyLabel");
const badgeKeys = document.getElementById("badgeKeys");

let notes = [];
let mode = "idle";
let score = 0;
let combo = 0;
let hits = 0;
let misses = 0;
let chartTitle = "Untitled";
let currentSong = null;
let keyMap = new Map();
let keyState = new Map();
let lanes = [];
let flashTimeout = null;
let hitAudioContext = null;

const builtInSongs = [
  { id: "aurora-run", title: "Aurora Run", bpm: 120, length: 36, seed: 12 },
  { id: "neon-steps", title: "Neon Steps", bpm: 132, length: 34, seed: 34 },
  { id: "skyline-pulse", title: "Skyline Pulse", bpm: 110, length: 38, seed: 56 },
  { id: "laser-drift", title: "Laser Drift", bpm: 140, length: 32, seed: 78 },
  { id: "midnight-arc", title: "Midnight Arc", bpm: 124, length: 35, seed: 91 },
  { id: "chrome-dawn", title: "Chrome Dawn", bpm: 116, length: 36, seed: 23 },
  { id: "pixel-drive", title: "Pixel Drive", bpm: 128, length: 34, seed: 45 },
  { id: "stormline", title: "Stormline", bpm: 136, length: 33, seed: 67 },
  { id: "glow-ferry", title: "Glow Ferry", bpm: 112, length: 37, seed: 89 },
  { id: "ghost-signal", title: "Ghost Signal", bpm: 118, length: 35, seed: 101 },
];

function buildLaneSet(count) {
  return baseKeys.slice(0, count).map((key, index) => ({
    key,
    color: baseColors[index],
  }));
}

function rebuildKeyMaps() {
  keyMap = new Map(lanes.map((lane, index) => [lane.key, index]));
  keyState = new Map(lanes.map((lane) => [lane.key, false]));
}

function buildLanes() {
  lanesEl.innerHTML = "";
  laneKeysEl.innerHTML = "";
  lanesEl.style.gridTemplateColumns = `repeat(${lanes.length}, 1fr)`;
  laneKeysEl.style.gridTemplateColumns = `repeat(${lanes.length}, 1fr)`;
  lanes.forEach((lane, index) => {
    const laneDiv = document.createElement("div");
    laneDiv.className = "lane";
    laneDiv.dataset.index = String(index);
    laneDiv.style.background = `linear-gradient(180deg, transparent 0%, ${lane.color}20 100%)`;
    lanesEl.appendChild(laneDiv);

    const keyDiv = document.createElement("div");
    keyDiv.className = "key";
    keyDiv.dataset.key = lane.key;
    keyDiv.textContent = lane.key;
    laneKeysEl.appendChild(keyDiv);
  });
}

function setMode(nextMode) {
  mode = nextMode;
  modeLabel.textContent = mode[0].toUpperCase() + mode.slice(1);
  playfield.classList.toggle("is-playing", mode === "play");
}

function resetScore() {
  score = 0;
  combo = 0;
  hits = 0;
  misses = 0;
  updateScore();
}

function updateScore() {
  scoreLabel.textContent = score;
  comboLabel.textContent = combo;
  const total = hits + misses;
  accuracyLabel.textContent = total ? `${Math.round((hits / total) * 100)}%` : "--";
}

function createNoteElement(note) {
  const lane = lanesEl.children[note.lane];
  const el = document.createElement("div");
  el.className = "note";
  el.style.background = lanes[note.lane].color;
  lane.appendChild(el);
  note.el = el;
}

function rebuildNotes() {
  Array.from(lanesEl.querySelectorAll(".note")).forEach((el) => el.remove());
  notes.forEach((note) => createNoteElement(note));
}

function resetNoteStates() {
  notes.forEach((note) => {
    note.hit = false;
    note.miss = false;
    if (note.el) {
      note.el.classList.remove("hit", "miss");
    }
  });
}

function sortNotes() {
  notes.sort((a, b) => a.time - b.time);
}

function getLeadTime() {
  const speed = Number(speedSelect.value) || 1;
  return 2.2 / speed;
}

function getHitWindow() {
  const difficulty = Number(difficultySelect.value) || 3;
  const base = 0.2;
  const adjustment = (difficulty - 1) * 0.025;
  return Math.max(0.08, base - adjustment);
}

function updateTimeline() {
  if (!audio.duration || Number.isNaN(audio.duration)) {
    timelineBar.style.width = "0%";
    return;
  }
  const progress = Math.min(audio.currentTime / audio.duration, 1);
  timelineBar.style.width = `${progress * 100}%`;
}

function updateNotes() {
  const t = audio.currentTime;
  const leadTime = getLeadTime();
  const fieldHeight = playfield.clientHeight || 520;
  const hitLineOffset = 90;
  const startY = -30;
  const endY = fieldHeight - hitLineOffset;
  notes.forEach((note) => {
    if (!note.el) return;
    const dt = note.time - t;
    const progress = 1 - dt / leadTime;
    const clamped = Math.min(Math.max(progress, -0.2), 1.4);
    const y = startY + clamped * (endY - startY);
    note.el.style.top = `${y}px`;
    note.el.classList.toggle("visible", progress > -0.2 && progress < 1.2);
    if (progress > 1.2 && !note.hit && !note.miss && mode === "play") {
      note.miss = true;
      note.el.classList.add("miss");
      combo = 0;
      misses += 1;
      updateScore();
    }
  });
}

function playHitSound(laneIndex) {
  if (!hitAudioContext) {
    hitAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (hitAudioContext.state === "suspended") {
    hitAudioContext.resume();
  }
  const now = hitAudioContext.currentTime;
  const osc = hitAudioContext.createOscillator();
  const gain = hitAudioContext.createGain();
  const freq = 220 * Math.pow(2, (laneIndex * 3) / 12);
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  osc.connect(gain).connect(hitAudioContext.destination);
  osc.start(now);
  osc.stop(now + 0.24);
}

function flashHit(laneIndex) {
  playfield.classList.add("flash");
  if (flashTimeout) clearTimeout(flashTimeout);
  flashTimeout = setTimeout(() => {
    playfield.classList.remove("flash");
  }, 120);

  const laneEl = lanesEl.children[laneIndex];
  if (laneEl) {
    laneEl.classList.add("hit");
    setTimeout(() => laneEl.classList.remove("hit"), 140);
  }
}

function handleHit(laneIndex) {
  if (mode !== "play") return;

  const now = audio.currentTime;
  const window = getHitWindow();
  let candidate = null;
  for (const note of notes) {
    if (note.lane !== laneIndex || note.hit || note.miss) continue;
    const delta = Math.abs(note.time - now);
    if (delta <= window) {
      candidate = note;
      break;
    }
    if (note.time > now + window) break;
  }

  if (candidate) {
    candidate.hit = true;
    candidate.el.classList.add("hit");
    score += 100 + combo * 5;
    combo += 1;
    hits += 1;
    playHitSound(laneIndex);
    flashHit(laneIndex);
  } else {
    combo = 0;
    misses += 1;
  }
  updateScore();
}

function setKeyActive(key, active) {
  const keyEl = laneKeysEl.querySelector(`[data-key="${key}"]`);
  if (!keyEl) return;
  keyEl.classList.toggle("active", active);
}

function stopPlayback() {
  audio.pause();
  audio.currentTime = 0;
  setMode("idle");
  updateTimeline();
  resetNoteStates();
  rebuildNotes();
}

function startPlay() {
  if (!audio.src) {
    songMeta.textContent = "Load a song before playing.";
    return;
  }
  if (!notes.length) {
    songMeta.textContent = "No notes yet. Pick a song or upload one.";
    return;
  }
  resetScore();
  resetNoteStates();
  audio.currentTime = 0;
  setMode("play");
  audio.playbackRate = Number(speedSelect.value) || 1;
  audio.volume = 0;
  audio.play();
}

function seededRandom(seed) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 13;
}

function generateChart(duration, bpm, difficulty, seed) {
  const rng = seededRandom(seed);
  const beat = 60 / bpm;
  const densityMap = [1, 1.5, 2, 2.5, 3];
  const density = densityMap[Math.max(0, Math.min(4, difficulty - 1))];
  const step = beat / density;
  const result = [];
  let time = 0.8;
  while (time < duration - 1) {
    if (rng() > 0.12) {
      const lane = Math.floor(rng() * lanes.length);
      result.push({ lane, time: Number(time.toFixed(3)) });
    }
    time += step;
  }
  return result;
}

function bufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2 + 44;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);
  let offset = 0;

  function writeString(string) {
    for (let i = 0; i < string.length; i += 1) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
    offset += string.length;
  }

  function writeUint32(value) {
    view.setUint32(offset, value, true);
    offset += 4;
  }

  function writeUint16(value) {
    view.setUint16(offset, value, true);
    offset += 2;
  }

  writeString("RIFF");
  writeUint32(length - 8);
  writeString("WAVE");
  writeString("fmt ");
  writeUint32(16);
  writeUint16(1);
  writeUint16(numChannels);
  writeUint32(sampleRate);
  writeUint32(sampleRate * numChannels * 2);
  writeUint16(numChannels * 2);
  writeUint16(16);
  writeString("data");
  writeUint32(length - 44);

  const interleaved = new Float32Array(buffer.length * numChannels);
  for (let channel = 0; channel < numChannels; channel += 1) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i += 1) {
      interleaved[i * numChannels + channel] = channelData[i];
    }
  }

  for (let i = 0; i < interleaved.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, interleaved[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function generateSongAudio(song) {
  const context = new (window.AudioContext || window.webkitAudioContext)();
  const duration = song.length;
  const sampleRate = 44100;
  const length = duration * sampleRate;
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  const melody = [0, 3, 7, 10, 7, 3, 0, -2];
  const altMelody = [0, 5, 7, 12, 7, 5, 0, -5];
  const bass = [0, 0, -5, -5, -7, -7, -5, -5];
  const bpm = song.bpm;
  const beat = 60 / bpm;
  const rng = seededRandom(song.seed);

  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const step = Math.floor(t / beat) % melody.length;
    const melodyIndex = rng() > 0.5 ? melody[step] : altMelody[step];
    const freq =
      220 * Math.pow(2, (melodyIndex + bass[Math.floor(step / 2)] / 2) / 12);
    const env = Math.exp(-((t % beat) * 6));
    const synth =
      Math.sin(2 * Math.PI * freq * t) * 0.24 +
      Math.sin(2 * Math.PI * (freq * 2) * t) * 0.05;
    const hats = (Math.random() * 2 - 1) * 0.02 * (1 - (t % (beat / 2)) * 4);
    data[i] = (synth * env + hats) * 0.9;
  }

  return bufferToWavBlob(buffer);
}

function loadBuiltInSong(song) {
  const wavBlob = generateSongAudio(song);
  const url = URL.createObjectURL(wavBlob);
  audio.src = url;
  chartTitle = song.title;
  currentSong = song;
  songMeta.textContent = `Loaded: ${song.title}`;
  audio.addEventListener(
    "loadedmetadata",
    () => {
      songMeta.textContent = `Loaded: ${song.title} · ${audio.duration.toFixed(1)}s`;
      regenerateNotes();
    },
    { once: true }
  );
}

function regenerateNotes() {
  if (!audio.duration || Number.isNaN(audio.duration)) return;
  const duration = audio.duration;
  const difficulty = Number(difficultySelect.value) || 3;
  const bpm = currentSong?.bpm || 120;
  const seed = (currentSong?.seed || 13) + difficulty * 11;
  const generated = generateChart(duration, bpm, difficulty, seed);
  notes = generated.map((note) => ({
    lane: note.lane,
    time: note.time,
    hit: false,
    miss: false,
    el: null,
  }));
  sortNotes();
  rebuildNotes();
}

function buildSongSelect() {
  songSelect.innerHTML = "";
  builtInSongs.forEach((song, index) => {
    const option = document.createElement("option");
    option.value = song.id;
    option.textContent = `${song.title} (${song.bpm} BPM)`;
    if (index === 0) option.selected = true;
    songSelect.appendChild(option);
  });
}

function updateKeyDisplay() {
  badgeKeys.textContent = lanes.map((lane) => lane.key).join(" ");
}

function applyKeyCount() {
  const count = Math.min(5, Math.max(3, Number(keyCountSelect.value) || 5));
  lanes = buildLaneSet(count);
  rebuildKeyMaps();
  buildLanes();
  updateKeyDisplay();
  regenerateNotes();
}

songSelect.addEventListener("change", () => {
  const song = builtInSongs.find((s) => s.id === songSelect.value);
  if (song) loadBuiltInSong(song);
});

audioFile.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  audio.src = url;
  chartTitle = file.name.replace(/\.[^/.]+$/, "");
  currentSong = {
    id: "uploaded",
    title: chartTitle,
    bpm: 120,
    length: 0,
    seed: hashString(chartTitle),
  };
  songMeta.textContent = `Loaded: ${file.name}`;
  audio.addEventListener(
    "loadedmetadata",
    () => {
      songMeta.textContent = `Loaded: ${file.name} · ${audio.duration.toFixed(1)}s`;
      regenerateNotes();
    },
    { once: true }
  );
});

difficultySelect.addEventListener("change", () => {
  regenerateNotes();
});

speedSelect.addEventListener("change", () => {
  if (mode === "play") {
    audio.playbackRate = Number(speedSelect.value) || 1;
  }
});

keyCountSelect.addEventListener("change", () => {
  applyKeyCount();
});

playBtn.addEventListener("click", startPlay);
stopBtn.addEventListener("click", stopPlayback);

document.addEventListener("keydown", (event) => {
  const key = event.key.toUpperCase();
  if (!keyMap.has(key) || keyState.get(key)) return;
  keyState.set(key, true);
  setKeyActive(key, true);
  handleHit(keyMap.get(key));
});

document.addEventListener("keyup", (event) => {
  const key = event.key.toUpperCase();
  if (!keyMap.has(key)) return;
  keyState.set(key, false);
  setKeyActive(key, false);
});

lanesEl.addEventListener("mousedown", (event) => {
  const key = event.target.closest(".lane")?.dataset?.index;
  if (key === undefined) return;
  const laneIndex = Number(key);
  const laneKey = lanes[laneIndex].key;
  setKeyActive(laneKey, true);
  handleHit(laneIndex);
});

lanesEl.addEventListener("mouseup", () => {
  lanes.forEach((lane) => setKeyActive(lane.key, false));
});

audio.addEventListener("ended", () => {
  setMode("idle");
});

function animationLoop() {
  if (mode === "play") {
    updateNotes();
    updateTimeline();
  }
  requestAnimationFrame(animationLoop);
}

buildSongSelect();
keyCountSelect.value = "3";
applyKeyCount();
loadBuiltInSong(builtInSongs[0]);
animationLoop();
