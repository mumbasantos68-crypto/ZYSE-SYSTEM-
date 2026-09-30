// Dashboard functionality
// Displays user investments, transactions, and withdrawal options

// Use API_BASE from window (set by auth.js) or default to empty string
var API_BASE = window.API_BASE || '';

// Initialize dashboard
async function initDashboard() {
  console.log('Initializing dashboard...');
  
  // Check authentication
  if (!requireAuth()) {
    console.log('User not authenticated, redirecting...');
    return;
  }

  console.log('User authenticated, loading dashboard data...');
  
  // Load dashboard data
  try {
    await loadDashboardData();
  } catch (error) {
    console.error('Failed to initialize dashboard:', error);
    const dashboardContent = document.getElementById('dashboardContent');
    if (dashboardContent) {
      dashboardContent.innerHTML = `
        <div class="message error">
          <strong>Failed to load dashboard:</strong><br>
          ${error.message}<br>
          <button class="btn mt-20" onclick="location.reload()">Reload Page</button>
          <button class="btn btn-secondary mt-20" onclick="logout()">Logout</button>
        </div>
      `;
    }
  }
}

// Load dashboard data
async function loadDashboardData() {
  const token = getToken();
  const dashboardContent = document.getElementById('dashboardContent');

  if (!dashboardContent) {
    console.error('Dashboard content element not found');
    return;
  }

  if (!token) {
    console.error('No token found, redirecting to login');
    window.location.href = '/index.html';
    return;
  }

  // Show loading state
  showLoading(dashboardContent, 'Loading dashboard data...');

  try {
    // Use authenticatedApiCall utility for consistent error handling and timeout
    const data = await authenticatedApiCall(`${API_BASE}/api/dashboard`, {
      method: 'GET'
    });
    
    console.log('Dashboard data received:', data);
    
    // Ensure data has required properties (default to empty arrays if missing)
    if (!data) {
      throw new Error('No data received from server');
    }
    
    // Use empty arrays if investments or transactions are missing
    const investments = Array.isArray(data.investments) ? data.investments : [];
    const transactions = Array.isArray(data.transactions) ? data.transactions : [];

    renderDashboard({ investments, transactions });
  } catch (error) {
    console.error('Dashboard error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    // Use showError utility for consistent error display
    showError(dashboardContent, error.message, () => loadDashboardData());
  }
}

// Render dashboard (for investments section)
function renderDashboard(data) {
  const { investments, transactions } = data;
  const dashboardContent = document.getElementById('dashboardContent') || document.getElementById('investmentsContent');
  if (!dashboardContent) return;
  
  const user = getUser();

  let investmentsHTML = '';
  if (investments.length === 0) {
    investmentsHTML = `
      <div class="empty-state">
        <p>No investments yet.</p>
        <a href="/invest.html" class="btn mt-20">Invest Now</a>
      </div>
    `;
  } else {
    investmentsHTML = investments.map(investment => {
      const daysLeft = calculateDaysLeft(investment.maturity_date);
      const isMatured = daysLeft <= 0;
      const canWithdraw = isMatured && investment.status === 'matured';
      const totalValue = investment.deposit_amount + investment.total_accruals;
      const dailyAccrual = investment.deposit_amount * investment.daily_rate;
      const walletDisplay = investment.wallet ? 
        (investment.wallet === 'airtel' ? 'AIRTEL MONEY' : 
         investment.wallet === 'mtn' ? 'MTN MOBILE MONEY' : 
         investment.wallet.toUpperCase()) : 'N/A';

      return `
        <div class="card">
          <div class="card-header">Investment #${investment.id}</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
            <div>
              <strong>Package:</strong> K${investment.package_amount}
            </div>
            <div>
              <strong>Deposit:</strong> K${investment.deposit_amount}
            </div>
            <div>
              <strong>Daily Accrual:</strong> K${dailyAccrual.toFixed(2)}
            </div>
            <div>
              <strong>Total Accruals:</strong> K${investment.total_accruals.toFixed(2)}
            </div>
            <div>
              <strong>Start Date:</strong> ${formatDate(investment.start_date)}
            </div>
            <div>
              <strong>Maturity Date:</strong> ${formatDate(investment.maturity_date)}
            </div>
            <div>
              <strong>Status:</strong> <span style="text-transform: capitalize;">${investment.status}</span>
            </div>
            <div>
              <strong>Total Value:</strong> K${totalValue.toFixed(2)}
            </div>
            ${investment.wallet ? `
              <div>
                <strong>Payment Method:</strong> ${walletDisplay}
              </div>
            ` : ''}
            ${investment.transaction_txt ? `
              <div>
                <strong>Transaction TXT:</strong> <code style="font-size: 0.9rem; background: #f8f9fa; padding: 2px 6px; border-radius: 3px;">${investment.transaction_txt}</code>
              </div>
            ` : ''}
          </div>
          ${isMatured ? `
            <div class="countdown" style="background: #d4edda; color: #155724;">
              Investment Matured! Ready for withdrawal.
            </div>
          ` : `
            <div class="countdown">
              Days Remaining: ${daysLeft} days
            </div>
          `}
          ${canWithdraw ? `
            <button class="btn btn-success mt-20" onclick="withdrawInvestment(${investment.id})">
              Withdraw K${totalValue.toFixed(2)}
            </button>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  let transactionsHTML = '';
  if (transactions.length === 0) {
    transactionsHTML = '<p class="empty-state">No transactions yet.</p>';
  } else {
    transactionsHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.map(transaction => `
            <tr>
              <td>${formatDateTime(transaction.date)}</td>
              <td style="text-transform: capitalize;">${transaction.type}</td>
              <td>K${transaction.amount.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  dashboardContent.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${investments.length}</div>
        <div class="stat-label">Active Investments</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">K${investments.reduce((sum, inv) => sum + inv.deposit_amount, 0).toFixed(2)}</div>
        <div class="stat-label">Total Invested</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">K${investments.reduce((sum, inv) => sum + inv.total_accruals, 0).toFixed(2)}</div>
        <div class="stat-label">Total Accruals</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">K${investments.reduce((sum, inv) => sum + inv.deposit_amount + inv.total_accruals, 0).toFixed(2)}</div>
        <div class="stat-label">Total Value</div>
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; margin: 30px 0;">
      <h2>My Investments</h2>
      <a href="/invest.html" class="btn">Invest Now</a>
    </div>

    ${investmentsHTML}

    <div class="card mt-20">
      <div class="card-header">Transaction History</div>
      ${transactionsHTML}
    </div>

    ${user && user.isAdmin ? `
      <div class="mt-20">
        <a href="/admin.html" class="btn btn-secondary">Admin Panel</a>
      </div>
    ` : ''}
  `;
}

// Calculate days left until maturity
function calculateDaysLeft(maturityDate) {
  const today = new Date();
  const maturity = new Date(maturityDate);
  const diffTime = maturity - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

// Format date
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Format date and time
function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Withdraw investment
async function withdrawInvestment(investmentId) {
  const confirmed = await showConfirm('Are you sure you want to withdraw this investment?', 'Confirm Withdrawal');
  if (!confirmed) {
    return;
  }

  try {
    const data = await authenticatedApiCall(`${API_BASE}/api/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ investmentId })
    });

    showAlert(`Withdrawal processed successfully! Amount: K${data.amount?.toFixed(2) || 'N/A'}`, 'Success');
    await loadDashboardData();
  } catch (error) {
    console.error('Withdrawal error:', error);
    showAlert(`Withdrawal failed: ${error.message}`, 'Error');
  }
}

// Check if we're on the new section-based dashboard
const isSectionBasedDashboard = document.getElementById('section-home') !== null;

if (!isSectionBasedDashboard) {
  // Old dashboard - initialize normally
  console.log('dashboard.js script loaded, document readyState:', document.readyState);

  // Try multiple initialization methods to ensure it runs
  function tryInitDashboard() {
    console.log('Attempting to initialize dashboard...');
    try {
      if (typeof requireAuth === 'function' && typeof initDashboard === 'function') {
        initDashboard();
      } else {
        console.error('Required functions not available:', {
          requireAuth: typeof requireAuth,
          initDashboard: typeof initDashboard
        });
        // Try again after a short delay
        setTimeout(tryInitDashboard, 100);
      }
    } catch (error) {
      console.error('Error initializing dashboard:', error);
      const dashboardContent = document.getElementById('dashboardContent');
      if (dashboardContent) {
        dashboardContent.innerHTML = `
          <div class="message error">
            <strong>Error initializing dashboard:</strong><br>
            ${error.message}<br>
            <button class="btn mt-20" onclick="location.reload()">Reload Page</button>
          </div>
        `;
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInitDashboard);
  } else {
    tryInitDashboard();
  }

  // Also try after a short delay as fallback
  setTimeout(function() {
    const content = document.getElementById('dashboardContent');
    if (content && content.innerHTML.includes('Loading...')) {
      console.log('Dashboard still loading, attempting initialization...');
      tryInitDashboard();
    }
  }, 500);
} else {
  // New section-based dashboard - sections are handled in dashboard.html
  console.log('Section-based dashboard detected');
}

