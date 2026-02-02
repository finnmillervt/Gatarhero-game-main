const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreValue = document.getElementById("scoreValue");
const bestValue = document.getElementById("bestValue");
const statusValue = document.getElementById("statusValue");
const gameTitle = document.getElementById("gameTitle");
const gameDesc = document.getElementById("gameDesc");
const instructionsEl = document.getElementById("instructions");

const gameButtons = Array.from(document.querySelectorAll(".game-card"));
const touchButtons = Array.from(document.querySelectorAll(".touch-btn"));

const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const restartBtn = document.getElementById("restartBtn");

const pressed = new Set();

const palette = ["#4fb3ff", "#23d7a8", "#ffd46b", "#ff9e2c", "#ff5d6c", "#a58dff", "#7be495"];

const games = {
  tetris: createTetris(),
  racing: createRacing(),
  snake: createSnakeIo(),
  breakout: createBreakout(),
};

let currentKey = "tetris";
let currentGame = games[currentKey];
let isRunning = false;
let isPaused = false;
let lastTime = 0;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function loadBestScore(key) {
  return Number(localStorage.getItem(`arcade-best-${key}`) || 0);
}

function saveBestScore(key, value) {
  localStorage.setItem(`arcade-best-${key}`, String(value));
}

function updateUI() {
  scoreValue.textContent = Math.floor(currentGame.score || 0);
  const best = loadBestScore(currentKey);
  if (currentGame.score > best) {
    saveBestScore(currentKey, Math.floor(currentGame.score));
  }
  bestValue.textContent = loadBestScore(currentKey);
  statusValue.textContent = currentGame.status;
}

function renderGameInfo() {
  gameTitle.textContent = currentGame.title;
  gameDesc.textContent = currentGame.description;
  instructionsEl.innerHTML = "";
  currentGame.instructions.forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    instructionsEl.appendChild(li);
  });
}

function setGame(key) {
  currentKey = key;
  currentGame = games[key];
  currentGame.reset();
  isRunning = false;
  isPaused = false;
  gameButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.game === key);
  });
  renderGameInfo();
  updateUI();
}

function sendKeyDown(code) {
  pressed.add(code);
  if (currentGame.onKeyDown) currentGame.onKeyDown(code);
}

function sendKeyUp(code) {
  pressed.delete(code);
  if (currentGame.onKeyUp) currentGame.onKeyUp(code);
}

function drawFrame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  currentGame.draw(ctx, canvas.width, canvas.height);
}

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000 || 0, 0.05);
  lastTime = timestamp;

  if (isRunning && !isPaused && !currentGame.gameOver) {
    currentGame.update(dt, pressed);
    if (currentGame.gameOver) {
      isRunning = false;
    }
  }

  drawFrame();
  updateUI();
  requestAnimationFrame(loop);
}

startBtn.addEventListener("click", () => {
  if (currentGame.gameOver) currentGame.reset();
  isRunning = true;
  isPaused = false;
  currentGame.status = "Running";
});

pauseBtn.addEventListener("click", () => {
  if (!isRunning) return;
  isPaused = !isPaused;
  currentGame.status = isPaused ? "Paused" : "Running";
});

restartBtn.addEventListener("click", () => {
  currentGame.reset();
  isRunning = true;
  isPaused = false;
});

gameButtons.forEach((button) => {
  button.addEventListener("click", () => setGame(button.dataset.game));
});

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  if (pressed.has(event.code)) return;
  sendKeyDown(event.code);
});

window.addEventListener("keyup", (event) => {
  sendKeyUp(event.code);
});

touchButtons.forEach((button) => {
  const key = button.dataset.key;

  const down = () => sendKeyDown(key);
  const up = () => sendKeyUp(key);

  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointerleave", up);
  button.addEventListener("pointercancel", up);
});

function createTetris() {
  const width = 10;
  const height = 20;
  const matrixes = {
    I: [[1, 1, 1, 1]],
    J: [[1, 0, 0], [1, 1, 1]],
    L: [[0, 0, 1], [1, 1, 1]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    T: [[0, 1, 0], [1, 1, 1]],
    Z: [[1, 1, 0], [0, 1, 1]],
  };

  const state = {
    board: [],
    piece: null,
    x: 0,
    y: 0,
    score: 0,
    status: "Ready",
    gameOver: false,
    dropTimer: 0,
    dropInterval: 0.65,
    moveTimer: 0,
  };

  function emptyBoard() {
    return Array.from({ length: height }, () => Array(width).fill(0));
  }

  function rotate(matrix) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        rotated[x][rows - 1 - y] = matrix[y][x];
      }
    }
    return rotated;
  }

  function randomPiece() {
    const keys = Object.keys(matrixes);
    const key = keys[randomInt(0, keys.length - 1)];
    return { key, matrix: matrixes[key].map((row) => row.slice()) };
  }

  function collides(board, piece, px, py) {
    for (let y = 0; y < piece.length; y += 1) {
      for (let x = 0; x < piece[y].length; x += 1) {
        if (!piece[y][x]) continue;
        const nx = px + x;
        const ny = py + y;
        if (nx < 0 || nx >= width || ny >= height) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  function mergePiece() {
    const pieceValue = {
      I: 1,
      J: 2,
      L: 3,
      O: 4,
      S: 5,
      T: 6,
      Z: 7,
    }[state.currentKey];
    for (let y = 0; y < state.piece.length; y += 1) {
      for (let x = 0; x < state.piece[y].length; x += 1) {
        if (!state.piece[y][x]) continue;
        const by = state.y + y;
        if (by >= 0) state.board[by][state.x + x] = pieceValue;
      }
    }
  }

  function clearLines() {
    let cleared = 0;
    for (let y = height - 1; y >= 0; y -= 1) {
      if (state.board[y].every(Boolean)) {
        state.board.splice(y, 1);
        state.board.unshift(Array(width).fill(0));
        cleared += 1;
        y += 1;
      }
    }
    if (cleared > 0) {
      state.score += [0, 100, 300, 500, 800][cleared];
      state.dropInterval = Math.max(0.16, state.dropInterval - cleared * 0.02);
    }
  }

  function spawn() {
    const pieceData = randomPiece();
    state.currentKey = pieceData.key;
    state.piece = pieceData.matrix;
    state.x = Math.floor((width - state.piece[0].length) / 2);
    state.y = -1;
    if (collides(state.board, state.piece, state.x, state.y + 1)) {
      state.gameOver = true;
      state.status = "Game Over";
    }
  }

  function move(dx) {
    const nx = state.x + dx;
    if (!collides(state.board, state.piece, nx, state.y)) {
      state.x = nx;
    }
  }

  function drop() {
    if (!collides(state.board, state.piece, state.x, state.y + 1)) {
      state.y += 1;
      return true;
    }
    mergePiece();
    clearLines();
    spawn();
    return false;
  }

  function hardDrop() {
    while (drop()) {
      state.score += 2;
    }
  }

  function rotatePiece() {
    const rotated = rotate(state.piece);
    if (!collides(state.board, rotated, state.x, state.y)) {
      state.piece = rotated;
      return;
    }
    if (!collides(state.board, rotated, state.x - 1, state.y)) {
      state.x -= 1;
      state.piece = rotated;
    } else if (!collides(state.board, rotated, state.x + 1, state.y)) {
      state.x += 1;
      state.piece = rotated;
    }
  }

  function colorForPiece(key) {
    return {
      I: "#4fb3ff",
      J: "#3a77ff",
      L: "#ff9e2c",
      O: "#ffd46b",
      S: "#23d7a8",
      T: "#a58dff",
      Z: "#ff5d6c",
    }[key];
  }

  return {
    title: "Tetris",
    description: "Stack blocks and clear rows before the board fills up.",
    instructions: [
      "Arrow Left / Right: move",
      "Arrow Up: rotate",
      "Arrow Down: soft drop",
      "Space: hard drop",
    ],
    get score() {
      return state.score;
    },
    get status() {
      return state.status;
    },
    set status(value) {
      state.status = value;
    },
    get gameOver() {
      return state.gameOver;
    },
    reset() {
      state.board = emptyBoard();
      state.score = 0;
      state.status = "Ready";
      state.gameOver = false;
      state.dropTimer = 0;
      state.dropInterval = 0.65;
      state.moveTimer = 0;
      spawn();
    },
    onKeyDown(code) {
      if (state.gameOver) return;
      if (code === "ArrowLeft") move(-1);
      if (code === "ArrowRight") move(1);
      if (code === "ArrowUp") rotatePiece();
      if (code === "Space") hardDrop();
      if (code === "ArrowDown") {
        if (drop()) state.score += 1;
      }
    },
    update(dt, keys) {
      if (state.gameOver) return;
      state.status = "Running";
      state.dropTimer += dt;

      if (keys.has("ArrowDown")) {
        state.dropTimer += dt * 4;
      }

      if (state.dropTimer >= state.dropInterval) {
        state.dropTimer = 0;
        drop();
      }
    },
    draw(context, w, h) {
      context.fillStyle = "#030912";
      context.fillRect(0, 0, w, h);

      const cell = 26;
      const ox = Math.floor((w - width * cell) / 2);
      const oy = Math.floor((h - height * cell) / 2);

      context.fillStyle = "rgba(255,255,255,0.03)";
      context.fillRect(ox, oy, width * cell, height * cell);

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (state.board[y][x]) {
            const color = palette[(state.board[y][x] - 1) % palette.length];
            context.fillStyle = color;
            context.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
          }
        }
      }

      if (state.piece) {
        const color = colorForPiece(state.currentKey);
        for (let y = 0; y < state.piece.length; y += 1) {
          for (let x = 0; x < state.piece[y].length; x += 1) {
            if (!state.piece[y][x]) continue;
            context.fillStyle = color;
            context.fillRect(ox + (state.x + x) * cell + 1, oy + (state.y + y) * cell + 1, cell - 2, cell - 2);
          }
        }
      }
    },
  };
}

function createRacing() {
  const player = {
    w: 52,
    h: 66,
    y: 530,
  };
  const obstacle = {
    w: 48,
  };
  const state = {
    lane: 1,
    score: 0,
    obstacles: [],
    spawnTimer: 0,
    speed: 220,
    roadOffset: 0,
    turbo: false,
    crashFx: null,
    status: "Ready",
    gameOver: false,
  };

  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function spawnWave() {
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    const blockedCount = Math.random() < 0.25 ? 2 : 1;
    for (let i = 0; i < blockedCount; i += 1) {
      state.obstacles.push({
        lane: lanes[i],
        y: -150 - i * 20,
        h: randomInt(64, 96),
        color: ["#ff5d6c", "#ffd46b", "#23d7a8", "#4fb3ff"][randomInt(0, 3)],
      });
    }
  }

  return {
    title: "Racing Cars",
    description: "Stay in your lane and dodge traffic for as long as possible.",
    instructions: [
      "Arrow Left / Right: switch lanes",
      "Arrow Down: brake slightly",
      "Space: turbo speed boost",
      "At least one lane is always open in each wave",
    ],
    get score() {
      return state.score;
    },
    get status() {
      return state.status;
    },
    set status(value) {
      state.status = value;
    },
    get gameOver() {
      return state.gameOver;
    },
    reset() {
      state.lane = 1;
      state.score = 0;
      state.obstacles = [];
      state.spawnTimer = 0;
      state.speed = 220;
      state.roadOffset = 0;
      state.turbo = false;
      state.crashFx = null;
      state.status = "Ready";
      state.gameOver = false;
    },
    onKeyDown(code) {
      if (state.gameOver) return;
      if (code === "ArrowLeft") state.lane = Math.max(0, state.lane - 1);
      if (code === "ArrowRight") state.lane = Math.min(2, state.lane + 1);
      if (code === "Space") state.turbo = true;
    },
    onKeyUp(code) {
      if (code === "Space") state.turbo = false;
    },
    update(dt, keys) {
      if (state.gameOver) return;
      state.turbo = keys.has("Space");
      state.status = state.turbo ? "Running (Turbo)" : "Running";
      const brake = keys.has("ArrowDown") ? 0.84 : 1;
      const turboFactor = state.turbo ? 1.7 : 1;
      state.score += dt * 22 * turboFactor;
      state.speed += dt * 2;
      state.spawnTimer -= dt * turboFactor;
      if (state.spawnTimer <= 0) {
        spawnWave();
        state.spawnTimer = Math.max(0.5, 1.02 - state.score / 320);
      }

      const roadW = canvas.width * 0.58;
      const roadX = (canvas.width - roadW) / 2;
      const laneCenters = [roadX + roadW * 0.2, roadX + roadW * 0.5, roadX + roadW * 0.8];
      const travelSpeed = state.speed * brake * turboFactor;
      state.roadOffset = (state.roadOffset + travelSpeed * dt * 0.75) % 80;
      state.obstacles.forEach((ob) => {
        ob.y += travelSpeed * dt;
      });
      state.obstacles = state.obstacles.filter((ob) => ob.y < 760);

      const playerRect = {
        x: laneCenters[state.lane] - player.w / 2,
        y: player.y,
        w: player.w,
        h: player.h,
      };
      for (const ob of state.obstacles) {
        const obstacleRect = {
          x: laneCenters[ob.lane] - obstacle.w / 2,
          y: ob.y,
          w: obstacle.w,
          h: ob.h,
        };
        if (intersects(playerRect, obstacleRect)) {
          const burstX = (Math.max(playerRect.x, obstacleRect.x) + Math.min(playerRect.x + playerRect.w, obstacleRect.x + obstacleRect.w)) / 2;
          const burstY = (Math.max(playerRect.y, obstacleRect.y) + Math.min(playerRect.y + playerRect.h, obstacleRect.y + obstacleRect.h)) / 2;
          state.crashFx = {
            x: burstX,
            y: burstY,
            start: performance.now(),
            sparks: Array.from({ length: 16 }, () => ({
              angle: Math.random() * Math.PI * 2,
              speed: randomInt(90, 250),
              size: randomInt(2, 5),
            })),
          };
          state.gameOver = true;
          state.status = "Crash!";
          break;
        }
      }
    },
    draw(context, w, h) {
      context.fillStyle = "#060d18";
      context.fillRect(0, 0, w, h);

      const roadW = w * 0.58;
      const roadX = (w - roadW) / 2;
      context.fillStyle = "#1a2533";
      context.fillRect(roadX, 0, roadW, h);

      context.fillStyle = "#f5f5f5";
      for (let y = -40; y < h + 50; y += 80) {
        context.fillRect(w / 2 - 4, y + state.roadOffset - 40, 8, 42);
      }

      const laneCenters = [roadX + roadW * 0.2, roadX + roadW * 0.5, roadX + roadW * 0.8];

      state.obstacles.forEach((ob) => {
        context.fillStyle = ob.color;
        context.fillRect(laneCenters[ob.lane] - 24, ob.y, 48, ob.h);
        context.fillStyle = "rgba(255,255,255,0.25)";
        context.fillRect(laneCenters[ob.lane] - 14, ob.y + 12, 10, ob.h - 24);
      });

      const px = laneCenters[state.lane];
      const py = player.y;
      context.fillStyle = state.turbo ? "#ffd46b" : "#23d7a8";
      context.fillRect(px - 26, py, 52, 66);
      context.fillStyle = state.turbo ? "#fff5c3" : "#b9fff0";
      context.fillRect(px - 14, py + 10, 28, 18);

      if (state.gameOver) {
        context.fillStyle = "rgba(0,0,0,0.45)";
        context.fillRect(0, 0, w, h);
      }

      if (state.crashFx) {
        const age = Math.min((performance.now() - state.crashFx.start) / 1000, 0.8);
        const burst = 10 + age * 95;
        context.save();
        context.globalCompositeOperation = "lighter";
        context.fillStyle = `rgba(255, 176, 64, ${Math.max(0, 0.8 - age)})`;
        context.beginPath();
        context.arc(state.crashFx.x, state.crashFx.y, burst * 0.55, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = `rgba(255, 90, 80, ${Math.max(0, 0.7 - age * 0.9)})`;
        context.beginPath();
        context.arc(state.crashFx.x, state.crashFx.y, burst, 0, Math.PI * 2);
        context.fill();
        state.crashFx.sparks.forEach((spark) => {
          const d = spark.speed * age;
          const sx = state.crashFx.x + Math.cos(spark.angle) * d;
          const sy = state.crashFx.y + Math.sin(spark.angle) * d;
          context.fillStyle = `rgba(255, 240, 180, ${Math.max(0, 1 - age * 1.2)})`;
          context.fillRect(sx - spark.size / 2, sy - spark.size / 2, spark.size, spark.size);
        });
        context.restore();
      }
    },
  };
}

function createSnakeIo() {
  const grid = 20;
  const state = {
    snake: [],
    dir: { x: 1, y: 0 },
    queued: { x: 1, y: 0 },
    foods: [],
    score: 0,
    status: "Ready",
    gameOver: false,
    timer: 0,
    boost: false,
  };

  function isOccupied(x, y) {
    if (state.snake.some((s) => s.x === x && s.y === y)) return true;
    return false;
  }

  function spawnFood() {
    let x = randomInt(0, grid - 1);
    let y = randomInt(0, grid - 1);
    while (isOccupied(x, y) || state.foods.some((f) => f.x === x && f.y === y)) {
      x = randomInt(0, grid - 1);
      y = randomInt(0, grid - 1);
    }
    state.foods.push({ x, y, color: ["#ffd46b", "#ff9e2c", "#7be495"][randomInt(0, 2)] });
  }

  function stepSnake() {
    state.dir = state.queued;
    const head = state.snake[0];
    const next = { x: head.x + state.dir.x, y: head.y + state.dir.y };

    if (next.x < 0 || next.y < 0 || next.x >= grid || next.y >= grid) {
      state.gameOver = true;
      state.status = "Wall hit";
      return;
    }

    if (state.snake.some((seg) => seg.x === next.x && seg.y === next.y)) {
      state.gameOver = true;
      state.status = "Self hit";
      return;
    }

    state.snake.unshift(next);
    const foodIndex = state.foods.findIndex((f) => f.x === next.x && f.y === next.y);
    if (foodIndex >= 0) {
      state.score += 10;
      state.foods.splice(foodIndex, 1);
      spawnFood();
    } else {
      state.snake.pop();
    }
  }

  return {
    title: "Snake.io",
    description: "Grow fast, move clean, and avoid walls and your own tail.",
    instructions: [
      "Arrow keys: steer",
      "Space: speed boost",
      "Eat pellets to grow + score",
      "Crash into walls or yourself = lose",
    ],
    get score() {
      return state.score;
    },
    get status() {
      return state.status;
    },
    set status(value) {
      state.status = value;
    },
    get gameOver() {
      return state.gameOver;
    },
    reset() {
      state.snake = [
        { x: 8, y: 10 },
        { x: 7, y: 10 },
        { x: 6, y: 10 },
      ];
      state.dir = { x: 1, y: 0 };
      state.queued = { x: 1, y: 0 };
      state.foods = [];
      state.score = 0;
      state.status = "Ready";
      state.gameOver = false;
      state.timer = 0;
      state.boost = false;
      spawnFood();
      spawnFood();
      spawnFood();
    },
    onKeyDown(code) {
      if (state.gameOver) return;
      if (code === "ArrowUp" && state.dir.y !== 1) state.queued = { x: 0, y: -1 };
      if (code === "ArrowDown" && state.dir.y !== -1) state.queued = { x: 0, y: 1 };
      if (code === "ArrowLeft" && state.dir.x !== 1) state.queued = { x: -1, y: 0 };
      if (code === "ArrowRight" && state.dir.x !== -1) state.queued = { x: 1, y: 0 };
      if (code === "Space") state.boost = true;
    },
    onKeyUp(code) {
      if (code === "Space") state.boost = false;
    },
    update(dt) {
      if (state.gameOver) return;
      state.status = "Running";
      state.timer += dt;
      const step = state.boost ? 0.075 : 0.125;
      while (state.timer >= step) {
        state.timer -= step;
        stepSnake();
        if (state.gameOver) return;
      }
    },
    draw(context, w, h) {
      context.fillStyle = "#040b14";
      context.fillRect(0, 0, w, h);

      const cell = Math.floor(Math.min(w, h) * 0.88 / grid);
      const board = cell * grid;
      const ox = Math.floor((w - board) / 2);
      const oy = Math.floor((h - board) / 2);

      context.fillStyle = "#071423";
      context.fillRect(ox, oy, board, board);

      context.strokeStyle = "rgba(255,255,255,0.05)";
      for (let i = 0; i <= grid; i += 1) {
        context.beginPath();
        context.moveTo(ox + i * cell, oy);
        context.lineTo(ox + i * cell, oy + board);
        context.stroke();
        context.beginPath();
        context.moveTo(ox, oy + i * cell);
        context.lineTo(ox + board, oy + i * cell);
        context.stroke();
      }

      state.foods.forEach((food) => {
        context.fillStyle = food.color;
        context.beginPath();
        context.arc(ox + food.x * cell + cell / 2, oy + food.y * cell + cell / 2, cell * 0.28, 0, Math.PI * 2);
        context.fill();
      });

      state.snake.forEach((seg, index) => {
        context.fillStyle = index === 0 ? "#23d7a8" : "#8effd7";
        context.fillRect(ox + seg.x * cell + 1, oy + seg.y * cell + 1, cell - 2, cell - 2);
      });

      if (state.gameOver) {
        context.fillStyle = "rgba(0,0,0,0.45)";
        context.fillRect(0, 0, w, h);
      }
    },
  };
}

function createBreakout() {
  const rows = 6;
  const cols = 8;
  const state = {
    paddleX: 180,
    paddleW: 84,
    left: false,
    right: false,
    ball: { x: 210, y: 500, vx: 150, vy: -200, r: 8, stuck: true },
    bricks: [],
    powerups: [],
    effectTimers: {
      wide: 0,
      slow: 0,
    },
    score: 0,
    lives: 3,
    status: "Ready",
    gameOver: false,
  };

  function makeBricks() {
    state.bricks = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        state.bricks.push({ r, c, alive: true, color: palette[(r + c) % palette.length] });
      }
    }
  }

  function resetBall() {
    state.ball.x = state.paddleX + state.paddleW / 2;
    state.ball.y = 520;
    state.ball.vx = Math.random() > 0.5 ? 150 : -150;
    state.ball.vy = -200;
    state.ball.stuck = true;
  }

  function spawnPowerup(x, y) {
    const kind = ["wide", "slow", "life"][randomInt(0, 2)];
    state.powerups.push({ x, y, kind, vy: 140 });
  }

  function applyPowerup(kind) {
    if (kind === "wide") {
      state.effectTimers.wide = 10;
      state.paddleW = 124;
      return;
    }
    if (kind === "slow") {
      state.effectTimers.slow = 9;
      return;
    }
    if (kind === "life") {
      state.lives += 1;
    }
  }

  return {
    title: "Breakout",
    description: "Bounce the ball and clear every brick to win the round.",
    instructions: [
      "Arrow Left / Right: move paddle",
      "Space: launch ball",
      "Break all bricks to win",
      "Catch falling powerups (wide / slow / extra life)",
    ],
    get score() {
      return state.score;
    },
    get status() {
      return state.status;
    },
    set status(value) {
      state.status = value;
    },
    get gameOver() {
      return state.gameOver;
    },
    reset() {
      state.paddleX = 168;
      state.left = false;
      state.right = false;
      state.score = 0;
      state.lives = 3;
      state.powerups = [];
      state.effectTimers.wide = 0;
      state.effectTimers.slow = 0;
      state.paddleW = 84;
      state.status = "Ready";
      state.gameOver = false;
      makeBricks();
      resetBall();
    },
    onKeyDown(code) {
      if (code === "ArrowLeft") state.left = true;
      if (code === "ArrowRight") state.right = true;
      if (code === "Space") state.ball.stuck = false;
    },
    onKeyUp(code) {
      if (code === "ArrowLeft") state.left = false;
      if (code === "ArrowRight") state.right = false;
    },
    update(dt) {
      if (state.gameOver) return;
      state.effectTimers.wide = Math.max(0, state.effectTimers.wide - dt);
      state.effectTimers.slow = Math.max(0, state.effectTimers.slow - dt);
      if (state.effectTimers.wide <= 0) {
        state.paddleW = 84;
      }

      let status = `Running (Lives: ${state.lives})`;
      if (state.effectTimers.wide > 0) status += " Wide";
      if (state.effectTimers.slow > 0) status += " Slow";
      state.status = status;

      const speed = 320;
      if (state.left) state.paddleX -= speed * dt;
      if (state.right) state.paddleX += speed * dt;
      state.paddleX = Math.max(12, Math.min(420 - state.paddleW - 12, state.paddleX));

      if (state.ball.stuck) {
        state.ball.x = state.paddleX + state.paddleW / 2;
        state.powerups.forEach((p) => {
          p.y += p.vy * dt;
        });
        return;
      }

      const ballTime = state.effectTimers.slow > 0 ? dt * 0.66 : dt;
      state.ball.x += state.ball.vx * ballTime;
      state.ball.y += state.ball.vy * ballTime;

      if (state.ball.x - state.ball.r < 0 || state.ball.x + state.ball.r > 420) {
        state.ball.vx *= -1;
      }
      if (state.ball.y - state.ball.r < 0) {
        state.ball.vy *= -1;
      }

      const paddleY = 560;
      if (
        state.ball.y + state.ball.r >= paddleY &&
        state.ball.y - state.ball.r <= paddleY + 12 &&
        state.ball.x >= state.paddleX &&
        state.ball.x <= state.paddleX + state.paddleW
      ) {
        const hitPoint = (state.ball.x - (state.paddleX + state.paddleW / 2)) / (state.paddleW / 2);
        state.ball.vx = hitPoint * 220;
        state.ball.vy = -Math.abs(state.ball.vy);
      }

      for (const brick of state.bricks) {
        if (!brick.alive) continue;
        const bw = 44;
        const bh = 20;
        const bx = 18 + brick.c * 48;
        const by = 70 + brick.r * 28;
        if (
          state.ball.x + state.ball.r > bx &&
          state.ball.x - state.ball.r < bx + bw &&
          state.ball.y + state.ball.r > by &&
          state.ball.y - state.ball.r < by + bh
        ) {
          brick.alive = false;
          state.score += 15;
          if (Math.random() < 0.24) {
            spawnPowerup(bx + bw / 2, by + bh / 2);
          }
          state.ball.vy *= -1;
          break;
        }
      }

      state.powerups.forEach((p) => {
        p.y += p.vy * dt;
      });
      state.powerups = state.powerups.filter((p) => p.y < 700);

      state.powerups = state.powerups.filter((p) => {
        if (
          p.y >= paddleY - 6 &&
          p.y <= paddleY + 16 &&
          p.x >= state.paddleX &&
          p.x <= state.paddleX + state.paddleW
        ) {
          applyPowerup(p.kind);
          return false;
        }
        return true;
      });

      if (state.ball.y > 640) {
        state.lives -= 1;
        if (state.lives <= 0) {
          state.gameOver = true;
          state.status = "Out of lives";
        } else {
          resetBall();
        }
      }

      if (state.bricks.every((b) => !b.alive)) {
        state.gameOver = true;
        state.status = "You Win!";
      }
    },
    draw(context, w, h) {
      context.fillStyle = "#030912";
      context.fillRect(0, 0, w, h);

      state.bricks.forEach((brick) => {
        if (!brick.alive) return;
        const bw = 44;
        const bh = 20;
        const bx = 18 + brick.c * 48;
        const by = 70 + brick.r * 28;
        context.fillStyle = brick.color;
        context.fillRect(bx, by, bw, bh);
      });

      context.fillStyle = "#23d7a8";
      context.fillRect(state.paddleX, 560, state.paddleW, 12);

      context.fillStyle = "#ffd46b";
      context.beginPath();
      context.arc(state.ball.x, state.ball.y, state.ball.r, 0, Math.PI * 2);
      context.fill();

      state.powerups.forEach((p) => {
        const colorMap = {
          wide: "#4fb3ff",
          slow: "#a58dff",
          life: "#7be495",
        };
        const labelMap = {
          wide: "W",
          slow: "S",
          life: "+",
        };
        context.fillStyle = colorMap[p.kind];
        context.fillRect(p.x - 12, p.y - 12, 24, 24);
        context.fillStyle = "#00111f";
        context.font = "bold 14px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(labelMap[p.kind], p.x, p.y + 1);
      });

      if (state.gameOver) {
        context.fillStyle = "rgba(0,0,0,0.45)";
        context.fillRect(0, 0, w, h);
      }
    },
  };
}

setGame(currentKey);
currentGame.reset();
requestAnimationFrame(loop);
