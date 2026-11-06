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
  const onceTotal = members.reduce((sum, member) => sum + member.dailyBonus, 0);
  return {
    count: members.length,
    rate: TEAM_RATE,
    dailyTotal: Math.round(onceTotal * 100) / 100,
    onceTotal: Math.round(onceTotal * 100) / 100,
    members
  };
}

async function payInviteBonusOnce(inviteeId) {
  await ensureTeamPayoutsTable();
  const invitee = await dbGet(
    'SELECT id, invited_by_user_id FROM users WHERE id = ?',
    [inviteeId]
  );
  const inviterId = Number(invitee && invitee.invited_by_user_id);
  if (!inviterId || inviterId === Number(inviteeId)) return false;

  const alreadyPaid = await dbGet(
    'SELECT id FROM team_payouts WHERE inviter_id = ? AND invitee_id = ? LIMIT 1',
    [inviterId, inviteeId]
  );
  if (alreadyPaid) return false;

  const investment = await dbGet(
    `SELECT p.level, p.amount as package_amount
     FROM investments i
     INNER JOIN packages p ON p.id = i.package_id
     WHERE i.user_id = ? AND i.status = 'active'
     ORDER BY i.created_at DESC, i.id DESC
     LIMIT 1`,
    [inviteeId]
  );
  if (!investment) return false;

  const amount = teamBonusForLevel(investment.package_amount);
  if (amount <= 0) return false;

  const insert = await dbRun(
    `INSERT OR IGNORE INTO team_payouts (inviter_id, invitee_id, amount, level, payout_date)
     VALUES (?, ?, ?, ?, ?)`,
    [inviterId, inviteeId, amount, investment.level || null, 'once']
  );
  if (!insert.changes) return false;

  await dbRun(
    'INSERT INTO transactions (user_id, type, amount, date) VALUES (?, ?, ?, datetime("now"))',
    [inviterId, 'bonus', amount]
  );
  return true;
}

const WELCOME_BONUS = 10;

async function creditWelcomeBonusOnInvest(userId) {
  const user = await dbGet('SELECT welcome_bonus_paid FROM users WHERE id = ?', [userId]);
  if (user && Number(user.welcome_bonus_paid) === 1) return false;

  const investCount = await dbGet(
    `SELECT COUNT(*) as n FROM investments WHERE user_id = ? AND status IN ('active', 'terminated')`,
    [userId]
  );
  if (Number(investCount && investCount.n) !== 1) return false;

  const oldRegisterBonus = await dbGet(
    `SELECT id FROM transactions WHERE user_id = ? AND type = 'bonus' AND amount = 20 LIMIT 1`,
    [userId]
  );
  if (oldRegisterBonus) {
    await dbRun('UPDATE users SET welcome_bonus_paid = 1 WHERE id = ?', [userId]);
    return false;
  }

  await dbRun(
    'INSERT INTO transactions (user_id, type, amount, date) VALUES (?, ?, ?, datetime("now"))',
    [userId, 'bonus', WELCOME_BONUS]
  );
  await dbRun('UPDATE users SET welcome_bonus_paid = 1 WHERE id = ?', [userId]);
  return true;
}

async function onActiveInvestmentCreated(userId) {
  const welcome = await creditWelcomeBonusOnInvest(userId).catch((err) => {
    console.error('Welcome bonus on invest failed:', err.message);
    return false;
  });
  const invite = await payInviteBonusOnce(userId).catch((err) => {
    console.error('Invite bonus on invest failed:', err.message);
    return false;
  });
  return { welcome, invite };
}

async function payDailyTeamBonuses() {
  return { payoutDate: getZambiaDate(), paid: 0 };
}

module.exports = {
  TEAM_RATE,
  WELCOME_BONUS,
  ensureTeamPayoutsTable,
  getTeamBoard,
  payInviteBonusOnce,
  creditWelcomeBonusOnInvest,
  onActiveInvestmentCreated,
  payDailyTeamBonuses
};
