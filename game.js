const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const NEXT_BLOCK = 24;
const LEVEL_LINES = 10;
const BASE_DROP_MS = 900;
const MIN_DROP_MS = 90;

const COLORS = {
  I: '#65e4ff',
  J: '#5d7cff',
  L: '#ffad4d',
  O: '#ffe55d',
  S: '#5dff9c',
  T: '#c36cff',
  Z: '#ff5d7a',
};

const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
};

const LINE_POINTS = [0, 100, 300, 500, 800];

const canvas = document.querySelector('#board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.querySelector('#next');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.querySelector('#score');
const linesEl = document.querySelector('#lines');
const levelEl = document.querySelector('#level');
const overlay = document.querySelector('#overlay');
const overlayTitle = document.querySelector('#overlay-title');
const overlayMessage = document.querySelector('#overlay-message');
const startButton = document.querySelector('#start-button');
const pauseButton = document.querySelector('#pause-button');
const resetButton = document.querySelector('#reset-button');
const soundButton = document.querySelector('#sound-button');

let board;
let currentPiece;
let nextPiece;
let score;
let lines;
let level;
let dropCounter;
let dropInterval;
let lastTime;
let animationId;
let running;
let paused;
let gameOver;
let audioContext;
let soundEnabled = true;

function updateSoundButton() {
  soundButton.textContent = `サウンド: ${soundEnabled ? 'ON' : 'OFF'}`;
  soundButton.setAttribute('aria-pressed', String(soundEnabled));
}

function getAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;

  if (!AudioContext) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  return audioContext;
}

function playTone({ frequency, duration = 0.08, type = 'sine', volume = 0.12, delay = 0, endFrequency }) {
  if (!soundEnabled) return;

  const context = getAudioContext();
  if (!context) return;

  const startTime = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  if (endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
  }

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function playNoise({ duration = 0.12, volume = 0.08 } = {}) {
  if (!soundEnabled) return;

  const context = getAudioContext();
  if (!context) return;

  const bufferSize = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const output = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i += 1) {
    output[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noise = context.createBufferSource();
  const gain = context.createGain();
  noise.buffer = buffer;
  gain.gain.setValueAtTime(volume, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  noise.connect(gain);
  gain.connect(context.destination);
  noise.start();
}

function playSound(name) {
  const lineThemes = {
    line1: [523.25, 659.25, 783.99],
    line2: [587.33, 739.99, 880, 987.77],
    line3: [659.25, 783.99, 987.77, 1174.66],
    line4: [783.99, 987.77, 1174.66, 1567.98],
  };

  if (lineThemes[name]) {
    lineThemes[name].forEach((frequency, index) => {
      playTone({ frequency, duration: 0.12, type: 'triangle', volume: 0.11, delay: index * 0.055 });
    });
    return;
  }

  const sounds = {
    start: () => {
      [261.63, 329.63, 392].forEach((frequency, index) => {
        playTone({ frequency, duration: 0.11, type: 'triangle', volume: 0.1, delay: index * 0.06 });
      });
    },
    move: () => playTone({ frequency: 220, duration: 0.045, type: 'square', volume: 0.045, endFrequency: 185 }),
    rotate: () => playTone({ frequency: 330, duration: 0.07, type: 'triangle', volume: 0.07, endFrequency: 495 }),
    softDrop: () => playTone({ frequency: 130.81, duration: 0.035, type: 'sine', volume: 0.045 }),
    hardDrop: () => {
      playNoise({ duration: 0.1, volume: 0.08 });
      playTone({ frequency: 95, duration: 0.1, type: 'sawtooth', volume: 0.075, endFrequency: 55 });
    },
    lock: () => playTone({ frequency: 110, duration: 0.075, type: 'sawtooth', volume: 0.055, endFrequency: 82.41 }),
    pause: () => playTone({ frequency: 392, duration: 0.08, type: 'triangle', volume: 0.075, endFrequency: 261.63 }),
    resume: () => playTone({ frequency: 261.63, duration: 0.08, type: 'triangle', volume: 0.075, endFrequency: 392 }),
    levelUp: () => {
      [392, 493.88, 587.33, 783.99].forEach((frequency, index) => {
        playTone({ frequency, duration: 0.12, type: 'triangle', volume: 0.11, delay: index * 0.065 });
      });
    },
    gameOver: () => {
      [392, 329.63, 261.63, 196].forEach((frequency, index) => {
        playTone({ frequency, duration: 0.16, type: 'sawtooth', volume: 0.08, delay: index * 0.09 });
      });
    },
    reset: () => playTone({ frequency: 246.94, duration: 0.08, type: 'triangle', volume: 0.07, endFrequency: 164.81 }),
  };

  sounds[name]?.();
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  updateSoundButton();

  if (soundEnabled) {
    playSound('resume');
  }
}

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function randomPiece() {
  const types = Object.keys(SHAPES);
  const type = types[Math.floor(Math.random() * types.length)];
  const matrix = SHAPES[type].map((row) => [...row]);

  return {
    type,
    matrix,
    color: COLORS[type],
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: type === 'I' ? -1 : 0,
  };
}

function resetState() {
  board = createBoard();
  currentPiece = randomPiece();
  nextPiece = randomPiece();
  score = 0;
  lines = 0;
  level = 1;
  dropCounter = 0;
  dropInterval = BASE_DROP_MS;
  lastTime = 0;
  running = false;
  paused = false;
  gameOver = false;
  cancelAnimationFrame(animationId);
  updateStats();
  updateButtons();
  updateSoundButton();
  draw();
  drawNext();
  showOverlay('準備完了', 'スタートを押してゲームを開始します。');
}

function updateStats() {
  scoreEl.textContent = score.toLocaleString('ja-JP');
  linesEl.textContent = lines.toLocaleString('ja-JP');
  levelEl.textContent = level.toLocaleString('ja-JP');
}

function updateButtons() {
  startButton.disabled = running && !paused;
  pauseButton.disabled = !running || gameOver;
  pauseButton.textContent = paused ? '再開' : '一時停止';
}

function showOverlay(title, message) {
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  overlay.classList.add('is-visible');
}

function hideOverlay() {
  overlay.classList.remove('is-visible');
}

function rotate(matrix) {
  return matrix[0].map((_, col) => matrix.map((row) => row[col]).reverse());
}

function collides(piece, offsetX = 0, offsetY = 0, matrix = piece.matrix) {
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix[y].length; x += 1) {
      if (!matrix[y][x]) continue;

      const boardX = piece.x + x + offsetX;
      const boardY = piece.y + y + offsetY;

      if (boardX < 0 || boardX >= COLS || boardY >= ROWS) {
        return true;
      }

      if (boardY >= 0 && board[boardY][boardX]) {
        return true;
      }
    }
  }

  return false;
}

function mergePiece() {
  currentPiece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      const boardY = currentPiece.y + y;
      const boardX = currentPiece.x + x;
      if (boardY >= 0) {
        board[boardY][boardX] = currentPiece.color;
      }
    });
  });
}

function clearLines() {
  let cleared = 0;
  const previousLevel = level;

  outer: for (let y = ROWS - 1; y >= 0; y -= 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!board[y][x]) continue outer;
    }

    board.splice(y, 1);
    board.unshift(Array(COLS).fill(null));
    cleared += 1;
    y += 1;
  }

  if (cleared > 0) {
    lines += cleared;
    level = Math.floor(lines / LEVEL_LINES) + 1;
    score += LINE_POINTS[cleared] * level;
    dropInterval = Math.max(MIN_DROP_MS, BASE_DROP_MS - (level - 1) * 75);
    updateStats();
  }

  return {
    cleared,
    leveledUp: level > previousLevel,
  };
}

function spawnPiece() {
  currentPiece = nextPiece;
  currentPiece.x = Math.floor((COLS - currentPiece.matrix[0].length) / 2);
  currentPiece.y = currentPiece.type === 'I' ? -1 : 0;
  nextPiece = randomPiece();
  drawNext();

  if (collides(currentPiece)) {
    finishGame();
  }
}

function softDrop() {
  if (!canControl()) return;

  if (!collides(currentPiece, 0, 1)) {
    currentPiece.y += 1;
    score += 1;
    dropCounter = 0;
    playSound('softDrop');
    updateStats();
  } else {
    lockPiece();
  }

  draw();
}

function hardDrop() {
  if (!canControl()) return;

  let distance = 0;
  while (!collides(currentPiece, 0, 1)) {
    currentPiece.y += 1;
    distance += 1;
  }
  score += distance * 2;
  updateStats();
  lockPiece({ hard: true });
  draw();
}

function lockPiece({ hard = false } = {}) {
  mergePiece();
  const { cleared, leveledUp } = clearLines();

  if (leveledUp) {
    playSound('levelUp');
  } else if (cleared > 0) {
    playSound(`line${Math.min(cleared, 4)}`);
  } else {
    playSound(hard ? 'hardDrop' : 'lock');
  }

  spawnPiece();
  dropCounter = 0;
}

function movePiece(direction) {
  if (!canControl()) return;
  if (!collides(currentPiece, direction, 0)) {
    currentPiece.x += direction;
    playSound('move');
    draw();
  }
}

function rotatePiece() {
  if (!canControl()) return;

  const rotated = rotate(currentPiece.matrix);
  const kicks = [0, -1, 1, -2, 2];
  const kick = kicks.find((offset) => !collides(currentPiece, offset, 0, rotated));

  if (kick !== undefined) {
    currentPiece.x += kick;
    currentPiece.matrix = rotated;
    playSound('rotate');
    draw();
  }
}

function canControl() {
  return running && !paused && !gameOver;
}

function startGame() {
  if (gameOver) {
    resetState();
  }

  getAudioContext();
  running = true;
  paused = false;
  playSound('start');
  hideOverlay();
  updateButtons();
  lastTime = performance.now();
  animationId = requestAnimationFrame(update);
}

function togglePause() {
  if (!running || gameOver) return;

  paused = !paused;
  updateButtons();

  if (paused) {
    playSound('pause');
    cancelAnimationFrame(animationId);
    showOverlay('一時停止中', '再開ボタンまたは P キーでゲームに戻ります。');
  } else {
    playSound('resume');
    hideOverlay();
    lastTime = performance.now();
    animationId = requestAnimationFrame(update);
  }
}

function finishGame() {
  running = false;
  paused = false;
  gameOver = true;
  cancelAnimationFrame(animationId);
  playSound('gameOver');
  showOverlay('ゲームオーバー', `スコア: ${score.toLocaleString('ja-JP')}。スタートで再挑戦できます。`);
  updateButtons();
}

function update(time = 0) {
  if (!running || paused || gameOver) return;

  const deltaTime = time - lastTime;
  lastTime = time;
  dropCounter += deltaTime;

  if (dropCounter > dropInterval) {
    if (!collides(currentPiece, 0, 1)) {
      currentPiece.y += 1;
    } else {
      lockPiece();
    }
    dropCounter = 0;
  }

  draw();
  animationId = requestAnimationFrame(update);
}

function drawCell(context, x, y, size, color) {
  context.fillStyle = color;
  context.fillRect(x * size, y * size, size, size);

  const gradient = context.createLinearGradient(x * size, y * size, (x + 1) * size, (y + 1) * size);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
  gradient.addColorStop(0.48, 'rgba(255, 255, 255, 0.06)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
  context.fillStyle = gradient;
  context.fillRect(x * size, y * size, size, size);

  context.strokeStyle = 'rgba(5, 9, 22, 0.45)';
  context.lineWidth = 2;
  context.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid');
  ctx.lineWidth = 1;

  for (let x = 0; x <= COLS; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x * BLOCK, 0);
    ctx.lineTo(x * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }

  for (let y = 0; y <= ROWS; y += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y * BLOCK);
    ctx.lineTo(COLS * BLOCK, y * BLOCK);
    ctx.stroke();
  }
}

function drawBoard() {
  ctx.fillStyle = '#050916';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  board.forEach((row, y) => {
    row.forEach((color, x) => {
      if (color) {
        drawCell(ctx, x, y, BLOCK, color);
      }
    });
  });
}

function drawPiece() {
  currentPiece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      const drawY = currentPiece.y + y;
      if (drawY >= 0) {
        drawCell(ctx, currentPiece.x + x, drawY, BLOCK, currentPiece.color);
      }
    });
  });
}

function draw() {
  drawBoard();
  drawPiece();
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  nextCtx.fillStyle = 'rgba(5, 9, 22, 0.82)';
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

  const matrix = nextPiece.matrix;
  const offsetX = (nextCanvas.width / NEXT_BLOCK - matrix[0].length) / 2;
  const offsetY = (nextCanvas.height / NEXT_BLOCK - matrix.length) / 2;

  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        drawCell(nextCtx, x + offsetX, y + offsetY, NEXT_BLOCK, nextPiece.color);
      }
    });
  });
}

function handleKeydown(event) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar', 'p', 'P', 'x', 'X', 'm', 'M'];
  if (keys.includes(event.key)) {
    event.preventDefault();
  }

  switch (event.key) {
    case 'ArrowLeft':
      movePiece(-1);
      break;
    case 'ArrowRight':
      movePiece(1);
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'x':
    case 'X':
      rotatePiece();
      break;
    case ' ':
    case 'Spacebar':
      hardDrop();
      break;
    case 'p':
    case 'P':
      togglePause();
      break;
    case 'm':
    case 'M':
      toggleSound();
      break;
    default:
      break;
  }
}

function handleTouchAction(event) {
  const action = event.currentTarget.dataset.action;
  const actions = {
    left: () => movePiece(-1),
    right: () => movePiece(1),
    rotate: rotatePiece,
    down: softDrop,
    drop: hardDrop,
  };

  actions[action]?.();
}

startButton.addEventListener('click', startGame);
pauseButton.addEventListener('click', togglePause);
resetButton.addEventListener('click', () => {
  resetState();
  playSound('reset');
});
soundButton.addEventListener('click', toggleSound);
document.addEventListener('keydown', handleKeydown);
document.querySelectorAll('.touch-controls button').forEach((button) => {
  button.addEventListener('click', handleTouchAction);
});

resetState();
