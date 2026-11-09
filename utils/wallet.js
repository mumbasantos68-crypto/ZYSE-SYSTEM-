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

function summarizeWallet(transactions) {
  const wallet = calculateWalletBalance(transactions);
  let accruals = 0;
  let bonuses = 0;
  for (const t of Array.isArray(transactions) ? transactions : []) {
    if (!t) continue;
    const amount = Number(t.amount) || 0;
    if (t.type === 'accrual') accruals += amount;
    else if (t.type === 'bonus') bonuses += amount;
  }
  return { ...wallet, accruals, bonuses };
}

module.exports = {
  calculateWalletBalance,
  summarizeWallet
};
