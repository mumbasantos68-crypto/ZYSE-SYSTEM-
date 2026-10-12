const { dbRun, dbGet, dbQuery } = require('./db');

function calculateWalletBalance(transactions) {
  const list = Array.isArray(transactions) ? transactions : [];
  let deposits = 0;
  let withdrawn = 0;
  let income = 0;
  let investmentNet = 0;

  for (const t of list) {
    if (!t) continue;
    const amount = Number(t.amount) || 0;
    if (t.type === 'deposit' && amount > 0) deposits += amount;
    else if (t.type === 'withdrawal') withdrawn += amount;
    else if (t.type === 'accrual' || t.type === 'bonus') income += amount;
    else if (t.type === 'investment') investmentNet += amount;
  }

  const balance = deposits + income - withdrawn + investmentNet;
  return {
    deposits,
    withdrawn,
    income,
    investmentNet,
    balance,
    displayBalance: Math.max(0, Math.round(balance * 100) / 100)
  };
}

async function creditTerminatedLevelLock(investment) {
  if (!investment || !investment.id || !investment.user_id) return false;
  const amount = Number(investment.deposit_amount) || 0;
  if (amount <= 0) return false;

  const alreadyCredited = await dbGet(
    `SELECT id FROM transactions
     WHERE investment_id = ? AND type = 'investment' AND amount > 0`,
    [investment.id]
  );
  if (alreadyCredited) return false;

  const wasLocked = await dbGet(
    `SELECT id FROM transactions
     WHERE investment_id = ? AND type = 'investment' AND amount < 0`,
    [investment.id]
  );
  if (!wasLocked) return false;

  await dbRun(
    `INSERT INTO transactions (user_id, type, amount, investment_id, date)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [investment.user_id, 'investment', amount, investment.id]
  );
  return true;
}

async function repairTerminatedLevelCredits() {
  const rows = await dbQuery(
    `SELECT id, user_id, deposit_amount
     FROM investments
     WHERE status = 'terminated'`
  );
  let credited = 0;
  for (const row of rows || []) {
    if (await creditTerminatedLevelLock(row)) credited += 1;
  }
  return credited;
}

module.exports = {
  calculateWalletBalance,
  creditTerminatedLevelLock,
  repairTerminatedLevelCredits
};
