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
  lockPiece();
  draw();
}

function lockPiece() {
  mergePiece();
  clearLines();
  spawnPiece();
  dropCounter = 0;
}

function movePiece(direction) {
  if (!canControl()) return;
  if (!collides(currentPiece, direction, 0)) {
    currentPiece.x += direction;
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

  running = true;
  paused = false;
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
    cancelAnimationFrame(animationId);
    showOverlay('一時停止中', '再開ボタンまたは P キーでゲームに戻ります。');
  } else {
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
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar', 'p', 'P', 'x', 'X'];
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
resetButton.addEventListener('click', resetState);
document.addEventListener('keydown', handleKeydown);
document.querySelectorAll('.touch-controls button').forEach((button) => {
  button.addEventListener('click', handleTouchAction);
});

resetState();
