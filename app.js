const lanes = [
  { key: "A", color: "var(--lane-1)" },
  { key: "S", color: "var(--lane-2)" },
  { key: "D", color: "var(--lane-3)" },
  { key: "F", color: "var(--lane-4)" },
  { key: "G", color: "var(--lane-5)" },
];

const audio = document.getElementById("audio");
const audioFile = document.getElementById("audioFile");
const chartFile = document.getElementById("chartFile");
const exportChart = document.getElementById("exportChart");
const clearChart = document.getElementById("clearChart");
const demoSongBtn = document.getElementById("demoSong");
const demoChartBtn = document.getElementById("demoChart");
const leadTimeInput = document.getElementById("leadTime");
const hitWindowInput = document.getElementById("hitWindow");
const latencyInput = document.getElementById("latency");
const recordBtn = document.getElementById("recordBtn");
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

let notes = [];
let mode = "idle";
let score = 0;
let combo = 0;
let hits = 0;
let misses = 0;
let chartTitle = "Untitled";
let demoLoaded = false;
let demoNotes = [];

const keyMap = new Map(lanes.map((lane, index) => [lane.key, index]));
const keyState = new Map(lanes.map((lane) => [lane.key, false]));

function buildLanes() {
  lanesEl.innerHTML = "";
  laneKeysEl.innerHTML = "";
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

function addNote(laneIndex, time) {
  const note = { lane: laneIndex, time, hit: false, miss: false, el: null };
  notes.push(note);
  createNoteElement(note);
}

function sortNotes() {
  notes.sort((a, b) => a.time - b.time);
}

function getLeadTime() {
  return Number(leadTimeInput.value) || 2.2;
}

function getHitWindow() {
  return (Number(hitWindowInput.value) || 160) / 1000;
}

function getLatency() {
  return (Number(latencyInput.value) || 0) / 1000;
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

function handleHit(laneIndex) {
  if (mode === "record") {
    addNote(laneIndex, audio.currentTime);
    sortNotes();
    return;
  }
  if (mode !== "play") return;

  const now = audio.currentTime + getLatency();
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
  rebuildNotes();
}

function startRecord() {
  if (!audio.src) {
    songMeta.textContent = "Load a song before recording.";
    return;
  }
  resetScore();
  notes = [];
  rebuildNotes();
  audio.currentTime = 0;
  setMode("record");
  audio.play();
}

function startPlay() {
  if (!audio.src) {
    songMeta.textContent = "Load a song before playing.";
    return;
  }
  if (!notes.length) {
    songMeta.textContent = "No chart yet. Record a chart or import JSON.";
    return;
  }
  resetScore();
  audio.currentTime = 0;
  setMode("play");
  audio.play();
}

function exportChartToFile() {
  if (!notes.length) {
    songMeta.textContent = "No chart to export.";
    return;
  }
  const payload = {
    title: chartTitle,
    leadTime: getLeadTime(),
    notes: notes.map((note) => ({ lane: note.lane, time: Number(note.time.toFixed(3)) })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${chartTitle.replace(/\s+/g, "-").toLowerCase() || "chart"}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importChartFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.notes)) throw new Error("Invalid chart format.");
      chartTitle = data.title || chartTitle;
      if (data.leadTime) leadTimeInput.value = data.leadTime;
      notes = data.notes.map((note) => ({
        lane: Number(note.lane) || 0,
        time: Number(note.time) || 0,
        hit: false,
        miss: false,
        el: null,
      }));
      sortNotes();
      rebuildNotes();
      songMeta.textContent = `Chart loaded: ${chartTitle} (${notes.length} notes)`;
    } catch (error) {
      songMeta.textContent = "Could not read chart JSON.";
    }
  };
  reader.readAsText(file);
}

function loadDemoSong() {
  if (audio.src && demoLoaded) return;
  const context = new (window.AudioContext || window.webkitAudioContext)();
  const duration = 34;
  const sampleRate = 44100;
  const length = duration * sampleRate;
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  const melody = [0, 3, 7, 10, 7, 3, 0, -2];
  const bass = [0, 0, -5, -5, -7, -7, -5, -5];
  const bpm = 118;
  const beat = 60 / bpm;

  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const step = Math.floor(t / beat) % melody.length;
    const freq =
      220 *
      Math.pow(2, (melody[step] + bass[Math.floor(step / 2)] / 2) / 12);
    const env = Math.exp(-((t % beat) * 6));
    const synth =
      Math.sin(2 * Math.PI * freq * t) * 0.22 +
      Math.sin(2 * Math.PI * (freq * 2) * t) * 0.06;
    const hats = (Math.random() * 2 - 1) * 0.015 * (1 - (t % (beat / 2)) * 4);
    data[i] = (synth * env + hats) * 0.9;
  }

  const wavBlob = bufferToWavBlob(buffer);
  const url = URL.createObjectURL(wavBlob);
  audio.src = url;
  demoLoaded = true;
  chartTitle = "Demo Track";
  songMeta.textContent = "Loaded: Built-in demo track";
  audio.addEventListener(
    "loadedmetadata",
    () => {
      songMeta.textContent = `Loaded: Built-in demo track · ${audio.duration.toFixed(1)}s`;
    },
    { once: true }
  );
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

function loadDemoChart() {
  if (!demoNotes.length) {
    const bpm = 118;
    const beat = 60 / bpm;
    const pattern = [0, 1, 2, 3, 4, 3, 2, 1];
    const demo = [];
    let time = 0.8;
    for (let bar = 0; bar < 16; bar += 1) {
      for (let step = 0; step < pattern.length; step += 1) {
        demo.push({ lane: pattern[step], time: Number(time.toFixed(3)) });
        time += beat / 2;
      }
      time += beat / 2;
    }
    demoNotes = demo;
  }
  notes = demoNotes.map((note) => ({
    lane: note.lane,
    time: note.time,
    hit: false,
    miss: false,
    el: null,
  }));
  chartTitle = "Demo Track";
  sortNotes();
  rebuildNotes();
  songMeta.textContent = `Chart loaded: ${chartTitle} (${notes.length} notes)`;
}

audioFile.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  audio.src = url;
  demoLoaded = false;
  chartTitle = file.name.replace(/\.[^/.]+$/, "");
  songMeta.textContent = `Loaded: ${file.name}`;
  audio.addEventListener(
    "loadedmetadata",
    () => {
      songMeta.textContent = `Loaded: ${file.name} · ${audio.duration.toFixed(1)}s`;
    },
    { once: true }
  );
});

chartFile.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) importChartFromFile(file);
});

exportChart.addEventListener("click", exportChartToFile);
clearChart.addEventListener("click", () => {
  notes = [];
  rebuildNotes();
  songMeta.textContent = "Chart cleared.";
});
demoSongBtn.addEventListener("click", loadDemoSong);
demoChartBtn.addEventListener("click", loadDemoChart);

recordBtn.addEventListener("click", startRecord);
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
  if (mode === "play" || mode === "record") {
    updateNotes();
    updateTimeline();
  }
  requestAnimationFrame(animationLoop);
}

buildLanes();
animationLoop();
