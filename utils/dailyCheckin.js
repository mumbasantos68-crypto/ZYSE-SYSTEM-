const { dbRun, dbGet } = require('./db');

const PUZZLES = [
  {
    id: 'p1',
    cols: 3,
    target: 'red',
    hint: 'Select only the red balls.',
    cells: ['red', 'blue', 'green', 'red', 'green', 'blue', 'red', 'blue', 'green']
  },
  {
    id: 'p2',
    cols: 3,
    target: 'blue',
    hint: 'Select only the blue balls.',
    cells: ['red', 'blue', 'green', 'green', 'blue', 'red', 'red', 'blue', 'green']
  },
  {
    id: 'p3',
    cols: 3,
    target: 'green',
    hint: 'Select only the green balls.',
    cells: ['red', 'green', 'blue', 'green', 'green', 'red', 'blue', 'green', 'red']
  },
  {
    id: 'p4',
    cols: 3,
    target: 'red',
    hint: 'Select only the red balls.',
    cells: ['blue', 'red', 'green', 'red', 'blue', 'red', 'green', 'red', 'blue']
  }
];

function getZambiaDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lusaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function parseSqliteUtc(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  if (!text) return null;
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(text)) return new Date(text);
  if (text.includes('T')) return new Date(`${text}Z`);
  return new Date(`${text.replace(' ', 'T')}Z`);
}

function getZambiaNowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lusaka',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type) => (parts.find((part) => part.type === type) || {}).value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: get('weekday'),
    hour: Number(get('hour')),
    minute: Number(get('minute'))
  };
}

const WITHDRAW_HOURS_MESSAGE = 'Withdrawals are only performed on working days, Monday to Friday, 09:00–17:00.';
const WITHDRAW_ONCE_MESSAGE = 'You can only withdraw once per day. Please wait until the next day.';

function getWithdrawalWindow(date = new Date()) {
  const now = getZambiaNowParts(date);
  const weekend = now.weekday === 'Sat' || now.weekday === 'Sun';
  const minutes = now.hour * 60 + now.minute;
  const open = !weekend && minutes >= 9 * 60 && minutes <= 17 * 60;
  return {
    open,
    date: now.date,
    closedMessage: WITHDRAW_HOURS_MESSAGE,
    onceMessage: WITHDRAW_ONCE_MESSAGE
  };
}

function levelNumber(level) {
  const n = parseInt(String(level || 'L1').replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 10);
}

function getLevelBonus(level) {
  return 2 + (levelNumber(level) - 1);
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
    target: puzzle.target,
    hint: puzzle.hint,
    cells: puzzle.cells
  };
}

function targetIndexes(puzzle) {
  const indexes = [];
  puzzle.cells.forEach((color, i) => {
    if (color === puzzle.target) indexes.push(i);
  });
  return indexes;
}

function sameIndexSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const left = [...a].map(Number).sort((x, y) => x - y);
  const right = [...b].map(Number).sort((x, y) => x - y);
  return left.every((value, i) => value === right[i]);
}

function isValidPuzzleSelection(dateStr, puzzleId, selected) {
  const puzzle = PUZZLES[puzzleIndexForDate(dateStr)];
  if (!puzzle || puzzle.id !== puzzleId || !Array.isArray(selected)) return false;
  const unique = [...new Set(selected.map(Number))];
  if (unique.length !== selected.length) return false;
  if (unique.some((idx) => !Number.isInteger(idx) || idx < 0 || idx >= puzzle.cells.length)) {
    return false;
  }
  if (unique.some((idx) => puzzle.cells[idx] !== puzzle.target)) {
    return false;
  }
  return sameIndexSet(unique, targetIndexes(puzzle));
}

async function getDailyCheckEligibility(userId) {
  const row = await dbGet(
    `SELECT p.level as level
     FROM investments i
     JOIN packages p ON i.package_id = p.id
     WHERE i.user_id = ? AND i.status = 'active'
     ORDER BY i.created_at DESC, i.id DESC
     LIMIT 1`,
    [userId]
  );
  if (!row) {
    return { unlocked: false, level: null };
  }
  return { unlocked: true, level: row.level || 'L1' };
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
  const total = getLevelBonus(level);
  return {
    levelBonus: total,
    completeBonus: 0,
    total
  };
}

module.exports = {
  getZambiaDate,
  parseSqliteUtc,
  getWithdrawalWindow,
  WITHDRAW_HOURS_MESSAGE,
  WITHDRAW_ONCE_MESSAGE,
  getLevelBonus,
  getPublicPuzzle,
  isValidPuzzleSelection,
  getDailyCheckEligibility,
  quoteAmounts,
  ensureDailyCheckinsTable,
  levelNumber
};
