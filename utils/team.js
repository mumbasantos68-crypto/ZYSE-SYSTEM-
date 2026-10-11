const { dbRun, dbGet, dbQuery } = require('./db');
const { getZambiaDate } = require('./dailyCheckin');

const TEAM_RATE = 0.05;

function teamBonusForLevel(packageAmount) {
  const amount = Number(packageAmount) || 0;
  return Math.round(amount * TEAM_RATE * 100) / 100;
}

function ensureTeamPayoutsTable() {
  return dbRun(`CREATE TABLE IF NOT EXISTS team_payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inviter_id INTEGER NOT NULL,
    invitee_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    level TEXT,
    payout_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(inviter_id, invitee_id, payout_date)
  )`);
}

async function listActiveTeamMembers(inviterId) {
  const rows = await dbQuery(
    `SELECT
        u.id,
        u.full_name,
        u.phone,
        p.level,
        p.amount as package_amount
     FROM users u
     INNER JOIN investments i ON i.user_id = u.id AND i.status = 'active'
     INNER JOIN packages p ON p.id = i.package_id
     WHERE u.invited_by_user_id = ?
     ORDER BY u.created_at DESC`,
    [inviterId]
  );

  const seen = new Set();
  const members = [];
  for (const row of rows || []) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const packageAmount = Number(row.package_amount) || 0;
    members.push({
      id: row.id,
      fullName: row.full_name || 'Member',
      phone: row.phone || '',
      level: row.level || 'L1',
      packageAmount,
      dailyBonus: teamBonusForLevel(packageAmount)
    });
  }
  return members;
}

async function getTeamBoard(userId) {
  await ensureTeamPayoutsTable();
  const members = await listActiveTeamMembers(userId);
  const dailyTotal = members.reduce((sum, member) => sum + member.dailyBonus, 0);
  return {
    count: members.length,
    rate: TEAM_RATE,
    dailyTotal: Math.round(dailyTotal * 100) / 100,
    members
  };
}

async function payDailyTeamBonuses() {
  await ensureTeamPayoutsTable();
  const payoutDate = getZambiaDate();
  const rows = await dbQuery(
    `SELECT
        u.id as invitee_id,
        u.invited_by_user_id as inviter_id,
        p.level,
        p.amount as package_amount,
        i.id as investment_id
     FROM investments i
     INNER JOIN users u ON u.id = i.user_id
     INNER JOIN packages p ON p.id = i.package_id
     WHERE i.status = 'active'
       AND u.invited_by_user_id IS NOT NULL`
  );

  let paid = 0;
  const paidInvitees = new Set();
  for (const row of rows || []) {
    const inviterId = Number(row.inviter_id);
    const inviteeId = Number(row.invitee_id);
    if (!inviterId || !inviteeId || inviterId === inviteeId) continue;
    if (paidInvitees.has(inviteeId)) continue;
    paidInvitees.add(inviteeId);

    const amount = teamBonusForLevel(row.package_amount);
    if (amount <= 0) continue;

    const insert = await dbRun(
      `INSERT OR IGNORE INTO team_payouts (inviter_id, invitee_id, amount, level, payout_date)
       VALUES (?, ?, ?, ?, ?)`,
      [inviterId, inviteeId, amount, row.level || null, payoutDate]
    );
    if (!insert.changes) continue;

    await dbRun(
      'INSERT INTO transactions (user_id, type, amount, date) VALUES (?, ?, ?, datetime("now"))',
      [inviterId, 'bonus', amount]
    );
    paid += 1;
  }
  return { payoutDate, paid };
}

module.exports = {
  TEAM_RATE,
  ensureTeamPayoutsTable,
  getTeamBoard,
  payDailyTeamBonuses
};
