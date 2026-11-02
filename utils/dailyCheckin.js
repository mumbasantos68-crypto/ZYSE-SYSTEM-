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
const NO_EARNING_MESSAGE = 'No earnings on Saturday, Sunday, or Zambia public holidays. Money is earned Monday to Friday only.';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function ymd(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function addDaysYmd(year, month, day, delta) {
  const dt = new Date(Date.UTC(year, month - 1, day + delta));
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function firstWeekdayOfMonth(year, month, weekday) {
  const dt = new Date(Date.UTC(year, month - 1, 1));
  const dow = dt.getUTCDay();
  const add = (weekday - dow + 7) % 7;
  dt.setUTCDate(1 + add);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function observeIfSunday(year, month, day, name) {
  const dt = new Date(Date.UTC(year, month - 1, day));
  const dow = dt.getUTCDay();
  if (dow === 0) {
    dt.setUTCDate(dt.getUTCDate() + 1);
    return {
      date: ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()),
      name: `${name} (observed)`
    };
  }
  return { date: ymd(year, month, day), name };
}

function zambiaHolidaysForYear(year) {
  const easter = easterSunday(year);
  const holidays = [
    observeIfSunday(year, 1, 1, "New Year's Day"),
    observeIfSunday(year, 3, 8, "International Women's Day"),
    observeIfSunday(year, 3, 12, 'Youth Day'),
    { date: addDaysYmd(easter.year, easter.month, easter.day, -2), name: 'Good Friday' },
    { date: addDaysYmd(easter.year, easter.month, easter.day, 1), name: 'Easter Monday' },
    observeIfSunday(year, 4, 28, 'Kenneth Kaunda Day'),
    observeIfSunday(year, 5, 1, 'Labour Day'),
    observeIfSunday(year, 5, 25, 'Africa Freedom Day'),
    { date: firstWeekdayOfMonth(year, 7, 1), name: "Heroes' Day" },
    { date: firstWeekdayOfMonth(year, 7, 2), name: 'Unity Day' },
    { date: firstWeekdayOfMonth(year, 8, 1), name: "Farmers' Day" },
    observeIfSunday(year, 10, 18, 'National Day of Prayer'),
    observeIfSunday(year, 10, 24, 'Independence Day'),
    observeIfSunday(year, 12, 25, 'Christmas Day')
  ];
  const byDate = new Map();
  for (const item of holidays) {
    byDate.set(item.date, item.name);
  }
  return byDate;
}

function getZambiaPublicHoliday(dateStr) {
  const year = Number(String(dateStr).slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return zambiaHolidaysForYear(year).get(dateStr) || null;
}

function getEarningDayState(date = new Date()) {
  const now = getZambiaNowParts(date);
  const weekend = now.weekday === 'Sat' || now.weekday === 'Sun';
  const holidayName = getZambiaPublicHoliday(now.date);
  if (weekend) {
    return {
      earning: false,
      date: now.date,
      reason: 'weekend',
      message: NO_EARNING_MESSAGE
    };
  }
  if (holidayName) {
    return {
      earning: false,
      date: now.date,
      reason: 'holiday',
      holidayName,
      message: `No earnings today. ${holidayName} is a Zambia public holiday. Money is earned Monday to Friday only.`
    };
  }
  return { earning: true, date: now.date, reason: null, message: null };
}

function isZambiaEarningDay(date = new Date()) {
  return getEarningDayState(date).earning;
}

function getWithdrawalWindow(date = new Date()) {
  const now = getZambiaNowParts(date);
  const earning = isZambiaEarningDay(date);
  const minutes = now.hour * 60 + now.minute;
  const open = earning && minutes >= 9 * 60 && minutes <= 17 * 60;
  return {
    open,
    date: now.date,
    closedMessage: earning
      ? WITHDRAW_HOURS_MESSAGE
      : (getEarningDayState(date).message || WITHDRAW_HOURS_MESSAGE),
    onceMessage: WITHDRAW_ONCE_MESSAGE
  };
}

function levelNumber(level) {
  const n = parseInt(String(level || 'L1').replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 10);
}

function getLevelBonus(level) {
  const n = levelNumber(level);
  return n >= 6 ? 4 : 2;
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
  getEarningDayState,
  isZambiaEarningDay,
  WITHDRAW_HOURS_MESSAGE,
  WITHDRAW_ONCE_MESSAGE,
  NO_EARNING_MESSAGE,
  getLevelBonus,
  getPublicPuzzle,
  isValidPuzzleSelection,
  getDailyCheckEligibility,
  quoteAmounts,
  ensureDailyCheckinsTable,
  levelNumber
};
