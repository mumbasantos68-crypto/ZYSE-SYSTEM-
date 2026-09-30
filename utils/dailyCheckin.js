const { dbRun } = require('./db');

const COMPLETE_BONUS = 2;

const PUZZLES = [
  {
    id: 'p1',
    cols: 3,
    hint: 'Connect 3 blue dots in a line.',
    cells: ['blue', 'gold', 'green', 'blue', 'gold', 'green', 'blue', 'green', 'gold']
  },
  {
    id: 'p2',
    cols: 3,
    hint: 'Connect 3 gold dots in a line.',
    cells: ['green', 'gold', 'blue', 'blue', 'gold', 'green', 'green', 'gold', 'blue']
  },
  {
    id: 'p3',
    cols: 3,
    hint: 'Connect 3 green dots in a line.',
    cells: ['gold', 'blue', 'green', 'gold', 'blue', 'green', 'blue', 'gold', 'green']
  },
  {
    id: 'p4',
    cols: 4,
    hint: 'Connect 3 or 4 sky dots in a line.',
    cells: ['gold', 'sky', 'green', 'blue', 'gold', 'sky', 'green', 'blue', 'green', 'sky', 'sky', 'gold']
  }
];

function getZambiaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lusaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function levelNumber(level) {
  const n = parseInt(String(level || 'L1').replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 10);
}

function getLevelBonus(level) {
  return Math.round((1.5 + (levelNumber(level) - 1) * 0.5) * 100) / 100;
}

function puzzleIndexForDate(dateStr) {
  const parts = String(dateStr).split('-').map(Number);
  const sum = parts.reduce((s, p) => s + (Number.isFinite(p) ? p : 0), 0);
  return sum % PUZZLES.length;
}

function getPublicPuzzle(dateStr) {
  const puzzle = PUZZLES[puzzleIndexForDate(dateStr)];
  return {
    id: puzzle.id,
    cols: puzzle.cols,
    hint: puzzle.hint,
    cells: puzzle.cells
  };
}

function areAdjacent(a, b, cols) {
  const ar = Math.floor(a / cols);
  const ac = a % cols;
  const br = Math.floor(b / cols);
  const bc = b % cols;
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

function isValidPuzzlePath(dateStr, puzzleId, path) {
  const puzzle = PUZZLES[puzzleIndexForDate(dateStr)];
  if (!puzzle || puzzle.id !== puzzleId || !Array.isArray(path) || path.length < 3) {
    return false;
  }
  const seen = new Set();
  for (let i = 0; i < path.length; i++) {
    const idx = Number(path[i]);
    if (!Number.isInteger(idx) || idx < 0 || idx >= puzzle.cells.length || seen.has(idx)) {
      return false;
    }
    seen.add(idx);
    if (puzzle.cells[idx] !== puzzle.cells[path[0]]) {
      return false;
    }
    if (i > 0 && !areAdjacent(Number(path[i - 1]), idx, puzzle.cols)) {
      return false;
    }
  }
  return true;
}

function ensureDailyCheckinsTable() {
  return dbRun(`CREATE TABLE IF NOT EXISTS daily_checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    check_date TEXT NOT NULL,
    level TEXT,
    level_bonus REAL NOT NULL,
    complete_bonus REAL NOT NULL,
    total_amount REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, check_date)
  )`);
}

function quoteAmounts(level) {
  const levelBonus = getLevelBonus(level);
  const completeBonus = COMPLETE_BONUS;
  return {
    levelBonus,
    completeBonus,
    total: Math.round((levelBonus + completeBonus) * 100) / 100
  };
}

module.exports = {
  COMPLETE_BONUS,
  getZambiaDate,
  getLevelBonus,
  getPublicPuzzle,
  isValidPuzzlePath,
  quoteAmounts,
  ensureDailyCheckinsTable,
  levelNumber
};
