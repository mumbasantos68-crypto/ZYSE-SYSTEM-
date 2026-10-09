const { dbRun, dbGet, dbQuery } = require('./db');
const { getDailyCheckEligibility, levelNumber } = require('./dailyCheckin');

const CAREER_ROLES = [
  {
    id: 'district-assistant-manager',
    title: 'District Assistant Manager',
    minInvites: 30,
    minLevel: 5,
    salary: 3500,
    dailyBonus: 35
  },
  {
    id: 'district-manager',
    title: 'District Manager',
    minInvites: 50,
    minLevel: 7,
    salary: 8000,
    dailyBonus: 50
  },
  {
    id: 'regional-manager',
    title: 'Regional Manager',
    minInvites: 100,
    minLevel: 8,
    salary: 10000,
    dailyBonus: 100
  },
  {
    id: 'country-manager',
    title: 'Country Manager',
    minInvites: 300,
    minLevel: 10,
    salary: null,
    dailyBonus: 500
  }
];

function ensureCareerApplicationsTable() {
  return dbRun(`CREATE TABLE IF NOT EXISTS career_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role_id)
  )`);
}

function getRole(roleId) {
  return CAREER_ROLES.find((role) => role.id === roleId) || null;
}

async function countActiveInvites(userId) {
  const row = await dbGet(
    `SELECT COUNT(DISTINCT u.id) as total
     FROM users u
     INNER JOIN investments i ON i.user_id = u.id AND i.status = 'active'
     WHERE u.invited_by_user_id = ?`,
    [userId]
  );
  return Number(row && row.total) || 0;
}

function publicRole(role, inviteCount, levelNum, applied) {
  const levelOk = levelNum >= role.minLevel;
  const invitesOk = inviteCount >= role.minInvites;
  return {
    id: role.id,
    title: role.title,
    minInvites: role.minInvites,
    minLevel: role.minLevel,
    salary: role.salary,
    dailyBonus: role.dailyBonus,
    eligible: levelOk && invitesOk,
    levelOk,
    invitesOk,
    applied: !!applied
  };
}

async function getCareerBoard(userId) {
  const access = await getDailyCheckEligibility(userId);
  const levelLabel = access.unlocked ? access.level : null;
  const levelNum = access.unlocked ? levelNumber(access.level) : 0;
  const inviteCount = await countActiveInvites(userId);
  const applications = await dbQuery(
    'SELECT role_id, status, created_at FROM career_applications WHERE user_id = ?',
    [userId]
  );
  const applied = {};
  applications.forEach((row) => {
    applied[row.role_id] = row;
  });
  return {
    level: levelLabel,
    levelNum,
    inviteCount,
    roles: CAREER_ROLES.map((role) => publicRole(role, inviteCount, levelNum, applied[role.id]))
  };
}

module.exports = {
  CAREER_ROLES,
  ensureCareerApplicationsTable,
  getRole,
  countActiveInvites,
  getCareerBoard
};
