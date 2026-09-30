// Admin panel functionality
// Manages users, investments, and exports data

// Use API_BASE from window (set by auth.js) or default to empty string
var API_BASE = window.API_BASE || '';

// Initialize admin panel
async function initAdmin() {
  // Check authentication
  if (!requireAuth()) {
    return;
  }

  // Check if user is admin
  const user = getUser();
  if (!user || !user.isAdmin) {
    showAlert('Access denied. Admin privileges required.', 'Access Denied');
    setTimeout(() => {
      window.location.href = '/dashboard.html';
    }, 2000);
    return;
  }

  // Load admin data
  await loadAdminData();
}

// Load admin data
async function loadAdminData() {
  const adminContent = document.getElementById('adminContent');

  try {
    // Load all data in parallel
    const [usersResponse, investmentsResponse, statsResponse, withdrawalRequestsResponse, depositsResponse, announcementsResponse] = await Promise.all([
      fetch(`${API_BASE}/api/admin/users`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE}/api/admin/investments`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE}/api/admin/stats`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE}/api/admin/withdrawal-requests`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE}/api/admin/deposits`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE}/api/admin/announcements`, { headers: getAuthHeaders() })
    ]);

    // Auth guard
    if (
      usersResponse.status === 401 || usersResponse.status === 403 ||
      investmentsResponse.status === 401 || investmentsResponse.status === 403 ||
      statsResponse.status === 401 || statsResponse.status === 403 ||
      withdrawalRequestsResponse.status === 401 || withdrawalRequestsResponse.status === 403 ||
      depositsResponse.status === 401 || depositsResponse.status === 403
    ) {
      logout();
      return;
    }

    // Parse responses (backend now returns all needed data including phone and inviter info)
    const users = usersResponse.ok ? await usersResponse.json() : [];
    const investments = investmentsResponse.ok ? await investmentsResponse.json() : [];
    const stats = statsResponse.ok ? await statsResponse.json() : { totalUsers: 0, totalInvestments: 0, totalDeposits: 0, totalAccruals: 0 };
    const withdrawalRequests = withdrawalRequestsResponse.ok
      ? await withdrawalRequestsResponse.json()
      : [];
    const deposits = depositsResponse.ok ? await depositsResponse.json() : [];
    const announcements = announcementsResponse.ok ? await announcementsResponse.json() : [];

    renderAdminDashboard(users, investments, stats, withdrawalRequests, deposits, announcements);
  } catch (error) {
    console.error('Admin error:', error);
    adminContent.innerHTML = `
      <div class="message error">Error loading admin data: ${error.message}</div>
    `;
  }
}

// Store users data globally for search functionality
let allUsersData = [];

// Render admin dashboard
function renderAdminDashboard(users, investments, stats, withdrawalRequests, deposits, announcements) {
  const adminContent = document.getElementById('adminContent');
  
  // Sort users: Admin first (is_admin = 1), then by creation date (newest first)
  const sortedUsers = [...users].sort((a, b) => {
    // First sort by admin status (1 = admin, 0 = regular user)
    // Convert to number to ensure proper comparison (handle both 0/1 and true/false)
    const aIsAdmin = Number(a.is_admin) || 0;
    const bIsAdmin = Number(b.is_admin) || 0;
    if (bIsAdmin !== aIsAdmin) {
      return bIsAdmin - aIsAdmin; // Admin (1) comes before regular (0)
    }
    // If both same admin status, sort by creation date (newest first)
    return new Date(b.created_at) - new Date(a.created_at);
  });
  
  // Store sorted users data for search
  allUsersData = sortedUsers;
  
  // pendingRequests already defined above; reuse it here

  // Helper: best-effort phone extraction
  const getUserPhone = (u) => (u && (u.phone || u.phone_number || u.phoneNumber || u.msisdn || u.mobile || u.contact_phone || u.contact)) || '';

  // Users table
  const usersHTML = sortedUsers.length === 0 ? 
    '<p class="empty-state">No users found.</p>' :
    `
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Account ID (Phone)</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Invited By</th>
            <th>Created At</th>
            <th>Admin</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${sortedUsers.map((user, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${getUserPhone(user) ? `<span>${getUserPhone(user)}</span>` : '<span style="color:#dc3545;">None</span>'}</td>
              <td>${getUserPhone(user) || 'N/A'}</td>
              <td>${user.email || 'N/A'}</td>
              <td>${user.invited_by_phone || user.invited_by_email || (user.invited_by_user_id ? `User #${user.invited_by_user_id}` : 'N/A')}</td>
              <td>${formatDateTime(user.created_at)}</td>
              <td>${user.is_admin ? 'Yes' : 'No'}</td>
              <td>
                <button class="btn btn-warning" onclick="resetUserPassword(${user.id}, '${(getUserPhone(user) || user.email || 'User').replace(/'/g, "\\'")}', this)" style="padding: 5px 10px; font-size: 12px; margin-right: 5px;" title="Reset Password">
                  🔑 Reset Password
                </button>
                ${!user.is_admin ? `
                  <button class="btn btn-danger" onclick="deleteUser(${user.id}, '${(getUserPhone(user) || user.email || 'User').replace(/'/g, "\\'")}')" style="padding: 5px 10px; font-size: 12px;" title="Delete User">
                    🗑️ Delete
                  </button>
                ` : '<span style="color: #6c757d; font-size: 12px;">Admin</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

  // Investments table
  const investmentsHTML = investments.length === 0 ?
    '<p class="empty-state">No investments found.</p>' :
    `
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>User</th>
            <th>Package</th>
            <th>Amount</th>
            <th>Start Date</th>
            <th>Maturity Date</th>
            <th>Accruals</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${investments.map(investment => `
            <tr>
              <td>${investment.id}</td>
              <td>${investment.email}</td>
              <td>K${investment.package_amount}</td>
              <td>K${investment.deposit_amount.toFixed(2)}</td>
              <td>${formatDate(investment.start_date)}</td>
              <td>${formatDate(investment.maturity_date)}</td>
              <td>K${investment.total_accruals.toFixed(2)}</td>
              <td>
                <select onchange="updateInvestmentStatus(${investment.id}, this.value)" style="padding: 5px; color: #333; background: #fff;">
                  <option value="active" ${investment.status === 'active' ? 'selected' : ''}>Active</option>
                  <option value="matured" ${investment.status === 'matured' ? 'selected' : ''}>Matured</option>
                  <option value="withdrawn" ${investment.status === 'withdrawn' ? 'selected' : ''}>Withdrawn</option>
                </select>
              </td>
              <td>
                <button class="btn btn-success" onclick="viewInvestment(${investment.id})" style="padding: 5px 10px; font-size: 14px;">View</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

  const pendingRequests = withdrawalRequests.filter(r => r.status === 'pending');
  
  adminContent.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.totalUsers}</div>
        <div class="stat-label">Total Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalInvestments}</div>
        <div class="stat-label">Total Investments</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">K${stats.totalDeposits.toFixed(2)}</div>
        <div class="stat-label">Total Deposits</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">K${stats.totalAccruals.toFixed(2)}</div>
        <div class="stat-label">Total Accruals</div>
      </div>
      <div class="stat-card" style="background: ${pendingRequests.length > 0 ? '#ff9800' : '#4caf50'};">
        <div class="stat-value">${pendingRequests.length}</div>
        <div class="stat-label">Pending Withdrawals</div>
      </div>
    </div>

    <div class="admin-actions">
      <button class="btn btn-secondary" onclick="exportUsers()">Export Users CSV</button>
      <button class="btn btn-secondary" onclick="exportInvestments()">Export Investments CSV</button>
      <button class="btn" onclick="showAddDailyIncomeModal()">➕ Add Daily Income</button>
      <button class="btn" onclick="showBulkDailyIncomeByLevelModal()">📈 Bulk Daily by Level</button>
      <button class="btn btn-success" onclick="showAddBonusModal()">💎 Add Individual Bonus</button>
      <button class="btn" onclick="showAnnouncementsModal()" style="background: #17a2b8; color: white;">📢 Manage Announcements</button>
    </div>

    <div class="card mt-20">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <span>Deposits (${deposits.length})</span>
        <button class="btn btn-danger" onclick="bulkDeleteDeposits()" style="padding: 8px 15px; font-size: 12px;" id="deleteDepositsBtn" disabled>🗑️ Delete Selected</button>
      </div>
      ${renderDepositsTable(deposits)}
    </div>

    <div class="card mt-20">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <span>Withdrawal Requests (${withdrawalRequests.length})</span>
        <button class="btn btn-danger" onclick="bulkDeleteWithdrawalRequests()" style="padding: 8px 15px; font-size: 12px;" id="deleteRequestsBtn" disabled>🗑️ Delete Selected</button>
      </div>
      ${renderWithdrawalRequests(withdrawalRequests)}
    </div>

    <div class="card mt-20">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
        <span>All Users (${sortedUsers.length})</span>
        <div style="display: flex; align-items: center; gap: 10px; flex: 1; max-width: 500px; margin-left: auto;">
          <input 
            type="text" 
            id="userSearchInput" 
            placeholder="🔍 Search by phone number..." 
            style="flex: 1; padding: 10px 15px; border: 2px solid #007BFF; border-radius: 5px; font-size: 14px; transition: border-color 0.3s; color: #333; background: #fff;"
            oninput="filterUsersTable(this.value)"
            onfocus="this.style.borderColor='#0056b3'; this.style.boxShadow='0 0 0 3px rgba(0,123,255,0.1)';"
            onblur="this.style.borderColor='#007BFF'; this.style.boxShadow='none';"
          />
          <button 
            onclick="clearUserSearch()" 
            id="clearSearchBtn"
            style="padding: 10px 15px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer; display: none; transition: background 0.3s;"
            onmouseover="this.style.background='#5a6268'"
            onmouseout="this.style.background='#6c757d'"
            title="Clear search"
          >
            ✕ Clear
          </button>
        </div>
      </div>
      <div id="usersTableContainer">
        ${usersHTML}
      </div>
      <div id="userSearchResults" style="padding: 10px 15px; color: #6c757d; font-size: 0.9rem; display: none;"></div>
    </div>

    <div class="card mt-20">
      <div class="card-header">All Investments (${investments.length})</div>
      ${investmentsHTML}
    </div>
  `;
}

// Render deposits table
function renderDepositsTable(deposits) {
  if (deposits.length === 0) {
    return '<p class="empty-state">No deposits found.</p>';
  }

  const pendingDeposits = deposits.filter(d => d.status === 'pending');
  const otherDeposits = deposits.filter(d => d.status !== 'pending');

  return `
    ${pendingDeposits.length > 0 ? `
      <div style="margin-bottom: 20px; padding: 15px; background: #fff3cd; border-left: 4px solid #ff9800; border-radius: 4px;">
        <strong style="color: #856404;">⚠️ ${pendingDeposits.length} Pending Deposit(s) Awaiting Approval</strong>
      </div>
    ` : ''}
    <table class="table">
      <thead>
        <tr>
          <th style="width: 30px;">
            <input type="checkbox" id="selectAllDeposits" onchange="toggleAllDeposits(this.checked)">
          </th>
          <th>ID</th>
          <th>User Name</th>
          <th>Phone Number</th>
          <th>Amount</th>
          <th>Level</th>
          <th>Transaction TXT</th>
          <th>Wallet</th>
          <th>Status</th>
          <th>Deposit Date</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${deposits.map(deposit => `
          <tr style="${deposit.status === 'pending' ? 'background-color: #fff3cd;' : ''}">
            <td>
              <input type="checkbox" class="deposit-checkbox" value="${deposit.investment_id}" id="dep_${deposit.investment_id}" onchange="updateDepositsDeleteButton(); updateSelectedDepositsCount();">
            </td>
            <td>${deposit.investment_id}</td>
            <td>${deposit.full_name || deposit.email || 'N/A'}</td>
            <td>${deposit.phone || 'N/A'}</td>
            <td>K${deposit.amount.toFixed(2)}</td>
            <td>${deposit.level || 'N/A'}</td>
            <td>
              <code style="background: #f8f9fa; padding: 4px 8px; border-radius: 4px; font-family: monospace;">
                ${deposit.transaction_txt || 'N/A'}
              </code>
            </td>
            <td>${deposit.wallet ? deposit.wallet.toUpperCase() : 'N/A'}</td>
            <td>
              <span class="badge ${deposit.status === 'active' ? 'badge-success' : deposit.status === 'pending' ? 'badge-warning' : deposit.status === 'matured' ? 'badge-warning' : deposit.status === 'withdrawn' ? 'badge-danger' : deposit.status === 'denied' ? 'badge-danger' : 'badge-secondary'}">
                ${deposit.status}
              </span>
            </td>
            <td>${formatDateTime(deposit.deposit_date)}</td>
            <td>
              ${deposit.status === 'pending' ? `
                <button class="btn btn-success" onclick="processDeposit(${deposit.investment_id}, 'approve')" style="padding: 5px 10px; font-size: 12px; margin-right: 5px;">✓ Approve</button>
                <button class="btn btn-danger" onclick="processDeposit(${deposit.investment_id}, 'deny')" style="padding: 5px 10px; font-size: 12px;">✗ Deny</button>
              ` : `
                <span style="color: #6c757d;">Processed</span>
              `}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 4px;">
      <strong>Selected: <span id="selectedDepositsCount">0</span> deposit(s)</strong>
      ${pendingDeposits.length > 0 ? `
        <div style="margin-top: 10px;">
          <button class="btn btn-success" onclick="bulkApproveDeposits()" style="margin-right: 10px; padding: 8px 15px;">✓ Approve Selected</button>
          <button class="btn btn-danger" onclick="bulkDenyDeposits()" style="padding: 8px 15px;">✗ Deny Selected</button>
        </div>
      ` : ''}
    </div>
  `;
}

// Render withdrawal requests table
function renderWithdrawalRequests(requests) {
  if (requests.length === 0) {
    return '<p class="empty-state">No withdrawal requests found.</p>';
  }

  return `
    <table class="table">
      <thead>
        <tr>
          <th style="width: 30px;">
            <input type="checkbox" id="selectAllRequests" onchange="toggleAllRequests(this.checked)">
          </th>
          <th>ID</th>
          <th>User</th>
          <th>Amount</th>
          <th>Charge</th>
          <th>Net Amount</th>
          <th>Wallet</th>
          <th>Phone</th>
          <th>Status</th>
          <th>Requested</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${requests.map(req => `
          <tr>
            <td>
              <input type="checkbox" class="request-checkbox" value="${req.id}" id="req_${req.id}" onchange="updateSelectedCount(); updateWithdrawalRequestsDeleteButton();">
            </td>
            <td>${req.id}</td>
            <td>${req.full_name || req.phone || req.email || 'N/A'}</td>
            <td>K${req.gross_amount.toFixed(2)}</td>
            <td>K${req.charge.toFixed(2)}</td>
            <td>K${req.net_amount.toFixed(2)}</td>
            <td>${req.wallet.toUpperCase()}</td>
            <td>${req.phone || 'N/A'}</td>
            <td>
              <span class="badge ${req.status === 'pending' ? 'badge-warning' : req.status === 'paid' ? 'badge-success' : req.status === 'denied' ? 'badge-danger' : 'badge-secondary'}">
                ${req.status}
              </span>
            </td>
            <td>${formatDateTime(req.requested_at)}</td>
            <td>
              ${req.status === 'pending' ? `
                <button class="btn btn-success" onclick="processWithdrawalRequest(${req.id}, 'approve')" style="padding: 5px 10px; font-size: 12px; margin-right: 5px;">✓ Approve</button>
                <button class="btn btn-danger" onclick="processWithdrawalRequest(${req.id}, 'deny')" style="padding: 5px 10px; font-size: 12px;">✗ Deny</button>
              ` : `
                <span style="color: #6c757d;">Processed</span>
              `}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 4px;">
      <strong>Bulk Actions:</strong>
      <button class="btn btn-success" onclick="bulkApproveRequests()" style="margin-left: 10px; padding: 8px 15px;">✓ Approve Selected</button>
      <button class="btn btn-danger" onclick="bulkDenyRequests()" style="margin-left: 10px; padding: 8px 15px;">✗ Deny Selected</button>
      <span id="selectedCount" style="margin-left: 15px; color: #6c757d;">0 selected</span>
    </div>
  `;
}

// Toggle all deposits checkbox
function toggleAllDeposits(checked) {
  document.querySelectorAll('.deposit-checkbox').forEach(cb => {
    cb.checked = checked;
  });
  updateDepositsDeleteButton();
  updateSelectedDepositsCount();
}

// Update deposits delete button state
function updateDepositsDeleteButton() {
  const selectedDeposits = document.querySelectorAll('.deposit-checkbox:checked');
  const deleteBtn = document.getElementById('deleteDepositsBtn');
  if (deleteBtn) {
    deleteBtn.disabled = selectedDeposits.length === 0;
  }
}

// Update selected deposits count
function updateSelectedDepositsCount() {
  const selectedDeposits = document.querySelectorAll('.deposit-checkbox:checked');
  const countEl = document.getElementById('selectedDepositsCount');
  if (countEl) {
    countEl.textContent = selectedDeposits.length;
  }
}

// Bulk delete deposits
async function bulkDeleteDeposits() {
  const selectedDeposits = Array.from(document.querySelectorAll('.deposit-checkbox:checked'))
    .map(cb => parseInt(cb.value));

  if (selectedDeposits.length === 0) {
    showAlert('Please select at least one deposit to delete.', 'No Selection');
    return;
  }

  const confirmed = await showConfirm(
    `Are you sure you want to delete ${selectedDeposits.length} deposit(s)?\n\nThis action cannot be undone.`,
    'Delete Deposits'
  );
  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/deposits`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ ids: selectedDeposits })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to delete deposits' }));
      throw new Error(errorData.error || 'Failed to delete deposits');
    }

    showAlert(`Successfully deleted ${selectedDeposits.length} deposit(s).`, 'Success');
    await loadAdminData();
  } catch (error) {
    console.error('Delete deposits error:', error);
    showAlert('Failed to delete deposits: ' + error.message, 'Error');
  }
}

// Bulk delete withdrawal requests
async function bulkDeleteWithdrawalRequests() {
  const selectedRequests = Array.from(document.querySelectorAll('.request-checkbox:checked'))
    .map(cb => parseInt(cb.value));

  if (selectedRequests.length === 0) {
    showAlert('Please select at least one withdrawal request to delete.', 'No Selection');
    return;
  }

  const confirmed = await showConfirm(
    `Are you sure you want to delete ${selectedRequests.length} withdrawal request(s)?\n\nThis action cannot be undone.`,
    'Delete Withdrawal Requests'
  );
  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/withdrawal-requests`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ ids: selectedRequests })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to delete withdrawal requests' }));
      throw new Error(errorData.error || 'Failed to delete withdrawal requests');
    }

    showAlert(`Successfully deleted ${selectedRequests.length} withdrawal request(s).`, 'Success');
    await loadAdminData();
  } catch (error) {
    console.error('Delete withdrawal requests error:', error);
    showAlert('Failed to delete withdrawal requests: ' + error.message, 'Error');
  }
}

// Toggle all requests checkbox
function toggleAllRequests(checked) {
  document.querySelectorAll('.request-checkbox').forEach(cb => {
    cb.checked = checked;
  });
  updateSelectedCount();
  updateWithdrawalRequestsDeleteButton();
}

// Update withdrawal requests delete button state
function updateWithdrawalRequestsDeleteButton() {
  const selectedRequests = document.querySelectorAll('.request-checkbox:checked');
  const deleteBtn = document.getElementById('deleteRequestsBtn');
  if (deleteBtn) {
    deleteBtn.disabled = selectedRequests.length === 0;
  }
}

// Update selected count
function updateSelectedCount() {
  const selected = document.querySelectorAll('.request-checkbox:checked').length;
  const countEl = document.getElementById('selectedCount');
  if (countEl) {
    countEl.textContent = `${selected} selected`;
  }
}

// Bulk approve requests
async function bulkApproveRequests() {
  const selected = Array.from(document.querySelectorAll('.request-checkbox:checked')).map(cb => parseInt(cb.value));
  
  if (selected.length === 0) {
    showAlert('Please select at least one withdrawal request to approve', 'No Selection');
    return;
  }

  const confirmed = await showConfirm(
    `Are you sure you want to approve ${selected.length} withdrawal request(s)?`,
    'Approve Requests'
  );
  if (!confirmed) {
    return;
  }

  const adminNotes = prompt('Enter notes for approval (optional):');

  try {
    let successCount = 0;
    let errorCount = 0;

    for (const requestId of selected) {
      try {
        const response = await fetch(`${API_BASE}/api/admin/withdrawal-requests/${requestId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            action: 'approve',
            admin_notes: adminNotes || ''
          })
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Error approving request ${requestId}:`, error);
        errorCount++;
      }
    }

    showAlert(`Approved: ${successCount}, Errors: ${errorCount}`, 'Approval Complete');
    await loadAdminData();
  } catch (error) {
    console.error('Bulk approve error:', error);
    showAlert('Failed to approve requests: ' + error.message, 'Error');
  }
}

// Bulk deny requests
async function bulkDenyRequests() {
  const selected = Array.from(document.querySelectorAll('.request-checkbox:checked')).map(cb => parseInt(cb.value));
  
  if (selected.length === 0) {
    showAlert('Please select at least one withdrawal request to deny', 'No Selection');
    return;
  }

  const confirmed = await showConfirm(
    `Are you sure you want to deny ${selected.length} withdrawal request(s)?`,
    'Deny Requests'
  );
  if (!confirmed) {
    return;
  }

  const adminNotes = prompt('Enter reason for denial (optional):');

  try {
    let successCount = 0;
    let errorCount = 0;

    for (const requestId of selected) {
      try {
        const response = await fetch(`${API_BASE}/api/admin/withdrawal-requests/${requestId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            action: 'deny',
            admin_notes: adminNotes || ''
          })
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Error denying request ${requestId}:`, error);
        errorCount++;
      }
    }

    showAlert(`Denied: ${successCount}, Errors: ${errorCount}`, 'Denial Complete');
    await loadAdminData();
  } catch (error) {
    console.error('Bulk deny error:', error);
    showAlert('Failed to deny requests: ' + error.message, 'Error');
  }
}

// Make functions globally available
window.toggleAllRequests = toggleAllRequests;
window.bulkApproveRequests = bulkApproveRequests;
window.bulkDenyRequests = bulkDenyRequests;

// Add event listeners for checkboxes after rendering
setTimeout(() => {
  document.querySelectorAll('.request-checkbox').forEach(cb => {
    cb.addEventListener('change', updateSelectedCount);
  });
}, 100);

// Process withdrawal request (approve/deny)
async function processWithdrawalRequest(requestId, action) {
  const adminNotes = prompt(`Enter notes for ${action === 'approve' ? 'approval' : 'denial'} (optional):`);
  
  if (action === 'deny' && !adminNotes) {
    const confirmDeny = await showConfirm('Are you sure you want to deny this withdrawal request without notes?', 'Confirm Denial');
    if (!confirmDeny) return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/withdrawal-requests/${requestId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        action: action,
        admin_notes: adminNotes || ''
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Failed to ${action} withdrawal request`);
    }

    showAlert(`Withdrawal request ${action === 'approve' ? 'approved' : 'denied'} successfully!`, 'Success');
    await loadAdminData();
  } catch (error) {
    console.error('Process withdrawal request error:', error);
    showAlert(`Failed to ${action} withdrawal request: ${error.message}`, 'Error');
  }
}

// Process deposit (approve/deny)
async function processDeposit(depositId, action) {
  const adminNotes = prompt(`Enter notes for ${action === 'approve' ? 'approval' : 'denial'} (optional):`);
  
  if (action === 'deny' && !adminNotes) {
    const confirmDeny = await showConfirm('Are you sure you want to deny this deposit without notes?', 'Confirm Denial');
    if (!confirmDeny) return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/deposits/${depositId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        action: action,
        admin_notes: adminNotes || ''
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Failed to ${action} deposit`);
    }

    showAlert(`Deposit ${action === 'approve' ? 'approved' : 'denied'} successfully!`, 'Success');
    await loadAdminData();
  } catch (error) {
    console.error('Process deposit error:', error);
    showAlert(`Failed to ${action} deposit: ${error.message}`, 'Error');
  }
}

// Bulk approve deposits
async function bulkApproveDeposits() {
  const selected = Array.from(document.querySelectorAll('.deposit-checkbox:checked')).map(cb => parseInt(cb.value));
  
  if (selected.length === 0) {
    showAlert('Please select at least one deposit to approve', 'No Selection');
    return;
  }

  const confirmed = await showConfirm(
    `Are you sure you want to approve ${selected.length} deposit(s)?`,
    'Approve Deposits'
  );
  if (!confirmed) {
    return;
  }

  const adminNotes = prompt('Enter notes for approval (optional):');

  try {
    let successCount = 0;
    let errorCount = 0;

    for (const depositId of selected) {
      try {
        const response = await fetch(`${API_BASE}/api/admin/deposits/${depositId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            action: 'approve',
            admin_notes: adminNotes || ''
          })
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Error approving deposit ${depositId}:`, error);
        errorCount++;
      }
    }

    showAlert(`Approved: ${successCount}, Errors: ${errorCount}`, 'Approval Complete');
    await loadAdminData();
  } catch (error) {
    console.error('Bulk approve deposits error:', error);
    showAlert('Failed to approve deposits: ' + error.message, 'Error');
  }
}

// Bulk deny deposits
async function bulkDenyDeposits() {
  const selected = Array.from(document.querySelectorAll('.deposit-checkbox:checked')).map(cb => parseInt(cb.value));
  
  if (selected.length === 0) {
    showAlert('Please select at least one deposit to deny', 'No Selection');
    return;
  }

  const confirmed = await showConfirm(
    `Are you sure you want to deny ${selected.length} deposit(s)?`,
    'Deny Deposits'
  );
  if (!confirmed) {
    return;
  }

  const adminNotes = prompt('Enter notes for denial (optional):');

  try {
    let successCount = 0;
    let errorCount = 0;

    for (const depositId of selected) {
      try {
        const response = await fetch(`${API_BASE}/api/admin/deposits/${depositId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            action: 'deny',
            admin_notes: adminNotes || ''
          })
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Error denying deposit ${depositId}:`, error);
        errorCount++;
      }
    }

    showAlert(`Denied: ${successCount}, Errors: ${errorCount}`, 'Denial Complete');
    await loadAdminData();
  } catch (error) {
    console.error('Bulk deny deposits error:', error);
    showAlert('Failed to deny deposits: ' + error.message, 'Error');
  }
}

// Show add daily income modal
function showAddDailyIncomeModal() {
  const modalHTML = `
    <div id="addDailyIncomeModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
      <div style="background: white; border-radius: 8px; padding: 30px; max-width: 500px; width: 90%; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h3 style="margin-bottom: 20px; color: #007BFF;">Add Daily Income</h3>
        <div class="form-group">
          <label>Phone Number:</label>
          <input type="tel" id="dailyIncomePhone" placeholder="Enter user's phone number (e.g., 0977123456)" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: #fff;" required>
          <small style="color: #6c757d; display: block; margin-top: 5px;">📱 Enter the phone number of the user to receive daily income</small>
        </div>
        <div class="form-group" style="margin-top: 15px;">
          <label>Amount (K):</label>
          <input type="number" id="dailyIncomeAmount" step="0.01" min="0.01" placeholder="Enter amount in Kwacha (e.g., 5.00)" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: #fff;" required>
          <small style="color: #6c757d; display: block; margin-top: 5px;">💰 Enter the daily income amount to add to the user's account</small>
        </div>
        <div style="margin-top: 20px; text-align: right;">
          <button onclick="document.getElementById('addDailyIncomeModal').remove()" class="btn btn-secondary" style="margin-right: 10px;">Cancel</button>
          <button onclick="addDailyIncome()" class="btn">Add Income</button>
        </div>
      </div>
    </div>
  `;
  
  const modal = document.createElement('div');
  modal.innerHTML = modalHTML;
  document.body.appendChild(modal);
}

// Add daily income
async function addDailyIncome() {
  const phone = document.getElementById('dailyIncomePhone').value.trim();
  const amount = parseFloat(document.getElementById('dailyIncomeAmount').value);

  if (!phone || !amount || amount <= 0) {
    showAlert('Please fill in phone number and amount', 'Missing Information');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/daily-income`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        accountId: phone,
        amount: amount
      })
    });

    if (!response.ok) {
      let errorMessage = 'Failed to add daily income';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
        if (errorData.details && Array.isArray(errorData.details)) {
          const detailMessages = errorData.details.map(d => d.msg || d.message).join(', ');
          if (detailMessages) {
            errorMessage += ': ' + detailMessages;
          }
        }
      } catch (e) {
        errorMessage = `Error ${response.status}: ${response.statusText || 'Bad Request'}`;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    showAlert(`Daily income of K${amount.toFixed(2)} added successfully to ${data.phone || 'user'}!`, 'Success');
    document.getElementById('addDailyIncomeModal').remove();
    await loadAdminData();
  } catch (error) {
    console.error('Add daily income error:', error);
    showAlert(`Failed to add daily income: ${error.message}`, 'Error');
  }
}

// Show bulk daily income by level modal
function showBulkDailyIncomeByLevelModal() {
  const modalHTML = `
    <div id="bulkDailyIncomeModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
      <div style="background: white; border-radius: 8px; padding: 30px; max-width: 520px; width: 90%; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h3 style="margin-bottom: 20px; color: #007BFF;">Bulk Daily Income by Level</h3>
        <div class="form-group">
          <label>Level:</label>
          <select id="bulkLevel" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: #fff;">
            ${Array.from({length:10}).map((_,i)=>`<option value="L${i+1}">L${i+1}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin-top: 15px;">
          <label>Amount per account (K):</label>
          <input type="number" id="bulkAmount" step="0.01" min="0.01" placeholder="Enter amount per account (e.g., 6.00)" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: #fff;">
          <small style="color: #6c757d; display: block; margin-top: 5px;">💰 This amount will be added to ALL accounts at the selected level</small>
        </div>
        <p style="margin-top: 10px; color: #6c757d;">This will add the specified amount to ALL accounts at the selected level.</p>
        <div style="margin-top: 20px; text-align: right;">
          <button onclick="document.getElementById('bulkDailyIncomeModal').remove()" class="btn btn-secondary" style="margin-right: 10px;">Cancel</button>
          <button onclick="addDailyIncomeByLevel()" class="btn">Confirm</button>
        </div>
      </div>
    </div>
  `;
  const modal = document.createElement('div');
  modal.innerHTML = modalHTML;
  document.body.appendChild(modal);
}

// Add daily income by level
async function addDailyIncomeByLevel() {
  const level = document.getElementById('bulkLevel').value;
  const amount = parseFloat(document.getElementById('bulkAmount').value);

  if (!level || !amount || amount <= 0) {
    showAlert('Please select a level and enter a valid amount', 'Missing Information');
    return;
  }

  const confirmed = await showConfirm(`Add K${amount.toFixed(2)} daily income to ALL accounts at ${level}?`, 'Confirm Bulk Add');
  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/daily-income/level`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ level, amount })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to add daily income by level');
    }

    showAlert(`Daily income applied to ${level} successfully.`, 'Success');
    document.getElementById('bulkDailyIncomeModal').remove();
    await loadAdminData();
  } catch (error) {
    console.error('Bulk daily income error:', error);
    showAlert(`Failed to add daily income by level: ${error.message}`, 'Error');
  }
}

// Show add individual bonus modal
function showAddBonusModal() {
  const modalHTML = `
    <div id="addBonusModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
      <div style="background: white; border-radius: 8px; padding: 30px; max-width: 520px; width: 90%; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h3 style="margin-bottom: 20px; color: #007BFF;">Add Individual Bonus</h3>
        <div class="form-group">
          <label>Account ID (Phone Number):</label>
          <input type="text" id="bonusAccountId" placeholder="Enter user's phone number (e.g., 0977123456)" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: #fff;">
          <small style="color: #6c757d; display: block; margin-top: 5px;">📱 Enter the phone number of the user to receive bonus</small>
        </div>
        <div class="form-group" style="margin-top: 15px;">
          <label>Amount (K):</label>
          <input type="number" id="bonusAmount" step="0.01" min="0.01" placeholder="Enter bonus amount (e.g., 10.00)" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: #fff;">
          <small style="color: #6c757d; display: block; margin-top: 5px;">💰 Enter the bonus amount in Kwacha to add to the user's account</small>
        </div>
        <div class="form-group" style="margin-top: 15px;">
          <label>Notes (optional):</label>
          <input type="text" id="bonusNotes" placeholder="Enter reason or notes for this bonus (optional)" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: #fff;">
          <small style="color: #6c757d; display: block; margin-top: 5px;">📝 Optional: Add a note explaining why this bonus is being given</small>
        </div>
        <p style="margin-top: 10px; color: #6c757d;">Use the user's phone number as the Account ID.</p>
        <div style="margin-top: 20px; text-align: right;">
          <button onclick="document.getElementById('addBonusModal').remove()" class="btn btn-secondary" style="margin-right: 10px;">Cancel</button>
          <button onclick="addBonusForAccount()" class="btn btn-success">Add Bonus</button>
        </div>
      </div>
    </div>
  `;
  const modal = document.createElement('div');
  modal.innerHTML = modalHTML;
  document.body.appendChild(modal);
}

// Add bonus to a single account by account ID
async function addBonusForAccount() {
  const accountId = (document.getElementById('bonusAccountId').value || '').trim(); // phone number
  const amount = parseFloat(document.getElementById('bonusAmount').value);
  const notes = (document.getElementById('bonusNotes').value || '').trim();

  if (!accountId || !amount || amount <= 0) {
    showAlert('Please enter a valid phone number (Account ID) and amount', 'Missing Information');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/bonus`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ accountId: accountId, amount, notes })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to add bonus');
    }

    showAlert('Bonus added successfully!', 'Success');
    document.getElementById('addBonusModal').remove();
    await loadAdminData();
  } catch (error) {
    console.error('Add bonus error:', error);
    showAlert(`Failed to add bonus: ${error.message}`, 'Error');
  }
}

// Make functions globally available
window.processWithdrawalRequest = processWithdrawalRequest;
window.processDeposit = processDeposit;
window.bulkApproveDeposits = bulkApproveDeposits;
window.bulkDenyDeposits = bulkDenyDeposits;
window.showAddDailyIncomeModal = showAddDailyIncomeModal;
window.addDailyIncome = addDailyIncome;
window.showBulkDailyIncomeByLevelModal = showBulkDailyIncomeByLevelModal;
window.addDailyIncomeByLevel = addDailyIncomeByLevel;
window.showAddBonusModal = showAddBonusModal;
window.addBonusForAccount = addBonusForAccount;
window.toggleAllDeposits = toggleAllDeposits;
window.updateDepositsDeleteButton = updateDepositsDeleteButton;
window.updateSelectedDepositsCount = updateSelectedDepositsCount;
window.bulkDeleteDeposits = bulkDeleteDeposits;
window.bulkDeleteWithdrawalRequests = bulkDeleteWithdrawalRequests;
window.updateWithdrawalRequestsDeleteButton = updateWithdrawalRequestsDeleteButton;
window.deleteUser = deleteUser;
window.bulkDeleteAnnouncements = bulkDeleteAnnouncements;
window.updateDeleteAnnouncementsButton = updateDeleteAnnouncementsButton;
window.toggleAllAnnouncements = toggleAllAnnouncements;
window.deleteAnnouncement = deleteAnnouncement;

// Update investment status
async function updateInvestmentStatus(investmentId, status) {
  try {
    const response = await fetch(`${API_BASE}/api/admin/investments/${investmentId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update investment status');
    }

    // Reload admin data
    await loadAdminData();
  } catch (error) {
    console.error('Update investment error:', error);
    showAlert(`Failed to update investment: ${error.message}`, 'Error');
  }
}

// View investment details
function viewInvestment(investmentId) {
  // Simple view - can be enhanced with modal
  showAlert(`Investment ID: ${investmentId}\nView full details in the table above.`, 'Investment Details');
}

// Export users to CSV
async function exportUsers() {
  try {
    const response = await fetch(`${API_BASE}/api/admin/users`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to fetch users');
    }

    const users = await response.json();
    const getUserPhone = (u) => (u && (u.phone || u.phone_number || u.phoneNumber || u.msisdn || u.mobile || u.contact_phone || u.contact)) || '';

    // Generate CSV
    const headers = ['ID', 'Phone', 'Email', 'Invited By', 'Created At', 'Is Admin'];
    const rows = users.map(user => [
      user.id,
      getUserPhone(user),
      user.email,
      (user.invited_by_phone || user.invited_by_email || (user.invited_by_user_id ? `User #${user.invited_by_user_id}` : '')),
      user.created_at,
      user.is_admin ? 'Yes' : 'No'
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    
    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export users error:', error);
    showAlert(`Failed to export users: ${error.message}`, 'Error');
  }
}

// Export investments to CSV
async function exportInvestments() {
  try {
    const response = await fetch(`${API_BASE}/api/admin/investments`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to fetch investments');
    }

    const investments = await response.json();

    // Generate CSV
    const headers = ['ID', 'User Email', 'Package Amount', 'Deposit Amount', 'Start Date', 'Maturity Date', 'Total Accruals', 'Status'];
    const rows = investments.map(inv => [
      inv.id,
      inv.email,
      inv.package_amount,
      inv.deposit_amount,
      inv.start_date,
      inv.maturity_date,
      inv.total_accruals,
      inv.status
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    
    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investments_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export investments error:', error);
    showAlert(`Failed to export investments: ${error.message}`, 'Error');
  }
}

// Format date
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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

// Reset user password
async function resetUserPassword(userId, userIdentifier, buttonElement) {
  // Confirm action
  const confirmed = await showConfirm(
    `Are you sure you want to reset the password for user ${userIdentifier}?\n\nDefault password (PMK321) will be set. You will need to copy the phone number and password and share them manually with the user.`,
    'Reset Password'
  );
  if (!confirmed) {
    return;
  }

  // Get button element
  const button = buttonElement || (window.event && window.event.target.closest('button'));
  const originalText = button ? button.innerHTML : '🔑 Reset Password';

  try {
    // Show loading
    if (button) {
      button.disabled = true;
      button.innerHTML = '⏳ Resetting...';
    }

    // Call API
    const response = await fetch(`${API_BASE}/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    // Check if response is OK before parsing JSON
    if (!response.ok) {
      let errorMessage = 'Failed to reset password';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        // If response is not JSON (e.g., HTML error page), use status text
        errorMessage = `Server error: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    // Show success modal with new password (no email sent)
    // Include phone number in the modal so admin knows which phone to use for login
    const userPhone = data.userPhone || userIdentifier;
    if (!userPhone) {
      showAlert('Error: User phone number not found. Please check the user has a phone number in their profile.', 'Error');
      return;
    }
    showPasswordResetSuccessModal(userPhone, data.newPassword, false);

    // Reset button
    if (button) {
      button.disabled = false;
      button.innerHTML = originalText;
    }
  } catch (error) {
    console.error('Reset password error:', error);
    showAlert(`Failed to reset password: ${error.message}`, 'Error');
    
    // Reset button
    if (button) {
      button.disabled = false;
      button.innerHTML = originalText;
    }
  }
}

// Show password reset success modal
function showPasswordResetSuccessModal(userIdentifier, newPassword, emailSent) {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  // Modal content
  modal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 10px; max-width: 600px; width: 90%; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <h2 style="color: #28a745; margin-top: 0; margin-bottom: 20px;">✅ Password Reset Successful</h2>
      
      <div style="background: #e7f3ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 4px solid #007BFF;">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">📱 Login Phone Number:</p>
        <div style="display: flex; align-items: center; gap: 10px;">
          <input 
            type="text" 
            id="userPhoneDisplay" 
            value="${userIdentifier}" 
            readonly 
            style="flex: 1; padding: 10px; font-size: 1.1rem; font-weight: bold; font-family: monospace; border: 2px solid #007BFF; border-radius: 5px; background: white; color: #007BFF;"
            onclick="this.select();"
          />
          <button 
            onclick="copyPhoneToClipboard('${userIdentifier}')" 
            class="btn" 
            style="background: #007BFF; color: white; padding: 10px 15px; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;"
            id="copyPhoneBtn"
          >
            📋 Copy Phone
          </button>
        </div>
        <p style="margin: 10px 0 0 0; color: #666; font-size: 0.85rem;">⚠️ User MUST use this exact phone number to login (no spaces)</p>
      </div>

      <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; border: 2px solid #28a745;">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">🔑 New Password:</p>
        <div style="display: flex; align-items: center; gap: 10px;">
          <input 
            type="text" 
            id="newPasswordDisplay" 
            value="${newPassword}" 
            readonly 
            style="flex: 1; padding: 10px; font-size: 1.1rem; font-weight: bold; font-family: monospace; border: 2px solid #28a745; border-radius: 5px; background: white;"
            onclick="this.select();"
          />
          <button 
            onclick="copyPasswordToClipboard('${newPassword}')" 
            class="btn" 
            style="background: #28a745; color: white; padding: 10px 15px; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;"
            id="copyPasswordBtn"
          >
            📋 Copy Password
          </button>
        </div>
      </div>

      <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ff9800;">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #856404;">📋 Instructions for User:</p>
        <ol style="margin: 0; padding-left: 20px; color: #856404;">
          <li>Go to the login page</li>
          <li>Enter phone number: <strong>${userIdentifier}</strong></li>
          <li>Enter password: <strong>${newPassword}</strong></li>
          <li>Click Login</li>
        </ol>
      </div>

      <p style="color: #666; font-size: 0.9rem; margin-bottom: 20px;">
        <strong>Important:</strong> The user should change this password after logging in for security reasons.
      </p>
      <div style="text-align: right;">
        <button 
          onclick="closePasswordResetModal()" 
          class="btn" 
          style="background: #007BFF; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;"
        >
          Close
        </button>
      </div>
    </div>
  `;

  // Add to page
  document.body.appendChild(modal);

  // Make functions available globally for onclick
  window.copyPasswordToClipboard = function(password) {
    const input = document.getElementById('newPasswordDisplay');
    const btn = document.getElementById('copyPasswordBtn');
    
    input.select();
    input.setSelectionRange(0, 99999);
    
    try {
      document.execCommand('copy');
      btn.innerHTML = '✅ Copied!';
      btn.style.background = '#28a745';
      setTimeout(() => {
        btn.innerHTML = '📋 Copy Password';
      }, 2000);
    } catch (err) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(password).then(() => {
          btn.innerHTML = '✅ Copied!';
          btn.style.background = '#28a745';
          setTimeout(() => {
            btn.innerHTML = '📋 Copy Password';
          }, 2000);
        });
      } else {
        showAlert('Copy failed. Please select and copy manually.', 'Copy Failed');
      }
    }
  };

  window.copyPhoneToClipboard = function(phone) {
    const input = document.getElementById('userPhoneDisplay');
    const btn = document.getElementById('copyPhoneBtn');
    
    input.select();
    input.setSelectionRange(0, 99999);
    
    try {
      document.execCommand('copy');
      btn.innerHTML = '✅ Copied!';
      btn.style.background = '#28a745';
      setTimeout(() => {
        btn.innerHTML = '📋 Copy Phone';
      }, 2000);
    } catch (err) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(phone).then(() => {
          btn.innerHTML = '✅ Copied!';
          btn.style.background = '#28a745';
          setTimeout(() => {
            btn.innerHTML = '📋 Copy Phone';
          }, 2000);
        });
      } else {
        showAlert('Copy failed. Please select and copy manually.', 'Copy Failed');
      }
    }
  };

  window.closePasswordResetModal = function() {
    document.body.removeChild(modal);
    delete window.copyPasswordToClipboard;
    delete window.copyPhoneToClipboard;
    delete window.closePasswordResetModal;
  };

  // Close on overlay click
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      window.closePasswordResetModal();
    }
  });
}

// Delete user function
async function deleteUser(userId, userIdentifier) {
  const confirmed = await showConfirm(
    `Are you sure you want to delete user "${userIdentifier}"?\n\nThis will permanently delete the user and all associated data (investments, transactions, withdrawal requests).\n\nThis action cannot be undone.`,
    'Delete User'
  );
  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to delete user' }));
      throw new Error(errorData.error || 'Failed to delete user');
    }

    showAlert(`User "${userIdentifier}" has been deleted successfully.`, 'Success');
    await loadAdminData();
  } catch (error) {
    console.error('Delete user error:', error);
    showAlert('Failed to delete user: ' + error.message, 'Error');
  }
}

// Filter users table by phone number
function filterUsersTable(searchTerm) {
  const searchInput = document.getElementById('userSearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  const resultsDiv = document.getElementById('userSearchResults');
  const tableContainer = document.getElementById('usersTableContainer');
  
  if (!searchInput || !tableContainer) return;
  
  const term = searchTerm.toLowerCase().trim();
  
  // Show/hide clear button
  if (term.length > 0) {
    if (clearBtn) clearBtn.style.display = 'block';
  } else {
    if (clearBtn) clearBtn.style.display = 'none';
    if (resultsDiv) resultsDiv.style.display = 'none';
  }
  
  // Helper: best-effort phone extraction
  const getUserPhone = (u) => (u && (u.phone || u.phone_number || u.phoneNumber || u.msisdn || u.mobile || u.contact_phone || u.contact)) || '';
  
  // Filter users by phone number (case-insensitive, partial match)
  const filteredUsers = allUsersData.filter(user => {
    const phone = getUserPhone(user);
    if (!phone) return false;
    // Remove spaces and special characters for better matching
    const normalizedPhone = phone.replace(/\s+/g, '').toLowerCase();
    const normalizedTerm = term.replace(/\s+/g, '');
    return normalizedPhone.includes(normalizedTerm);
  });
  
  // Update results counter
  if (term.length > 0 && resultsDiv) {
    if (filteredUsers.length === 0) {
      resultsDiv.innerHTML = `<span style="color: #dc3545;">❌ No users found matching "${searchTerm}"</span>`;
    } else if (filteredUsers.length === 1) {
      resultsDiv.innerHTML = `<span style="color: #28a745;">✓ Found 1 user matching "${searchTerm}"</span>`;
    } else {
      resultsDiv.innerHTML = `<span style="color: #28a745;">✓ Found ${filteredUsers.length} users matching "${searchTerm}"</span>`;
    }
    resultsDiv.style.display = 'block';
  }
  
  // Render filtered table
  if (filteredUsers.length === 0 && term.length > 0) {
    tableContainer.innerHTML = '<p class="empty-state">No users found matching your search.</p>';
    return;
  }
  
  // Sort filtered users the same way (admin first, then by date)
  const usersToRender = term.length > 0 ? filteredUsers.sort((a, b) => {
    const aIsAdmin = Number(a.is_admin) || 0;
    const bIsAdmin = Number(b.is_admin) || 0;
    if (bIsAdmin !== aIsAdmin) {
      return bIsAdmin - aIsAdmin;
    }
    return new Date(b.created_at) - new Date(a.created_at);
  }) : allUsersData;
  
  const usersHTML = usersToRender.length === 0 ? 
    '<p class="empty-state">No users found.</p>' :
    `
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Account ID (Phone)</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Invited By</th>
            <th>Created At</th>
            <th>Admin</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${usersToRender.map((user, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${getUserPhone(user) ? `<span>${getUserPhone(user)}</span>` : '<span style="color:#dc3545;">None</span>'}</td>
              <td>${getUserPhone(user) || 'N/A'}</td>
              <td>${user.email || 'N/A'}</td>
              <td>${user.invited_by_phone || user.invited_by_email || (user.invited_by_user_id ? `User #${user.invited_by_user_id}` : 'N/A')}</td>
              <td>${formatDateTime(user.created_at)}</td>
              <td>${user.is_admin ? 'Yes' : 'No'}</td>
              <td>
                <button class="btn btn-warning" onclick="resetUserPassword(${user.id}, '${(getUserPhone(user) || user.email || 'User').replace(/'/g, "\\'")}', this)" style="padding: 5px 10px; font-size: 12px; margin-right: 5px;" title="Reset Password">
                  🔑 Reset Password
                </button>
                ${!user.is_admin ? `
                  <button class="btn btn-danger" onclick="deleteUser(${user.id}, '${(getUserPhone(user) || user.email || 'User').replace(/'/g, "\\'")}')" style="padding: 5px 10px; font-size: 12px;" title="Delete User">
                    🗑️ Delete
                  </button>
                ` : '<span style="color: #6c757d; font-size: 12px;">Admin</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  
  tableContainer.innerHTML = usersHTML;
}

// Clear user search
function clearUserSearch() {
  const searchInput = document.getElementById('userSearchInput');
  if (searchInput) {
    searchInput.value = '';
    filterUsersTable('');
  }
}

// ==================== ANNOUNCEMENTS MANAGEMENT ====================

// Show announcements management modal
async function showAnnouncementsModal() {
  try {
    const response = await fetch(`${API_BASE}/api/admin/announcements`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to load announcements');
    const announcements = await response.json();

    const modal = document.createElement('div');
    modal.id = 'announcementsModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
      <div style="background: white; border-radius: 8px; max-width: 900px; width: 90%; max-height: 90vh; overflow-y: auto; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2>📢 Manage Announcements</h2>
          <button onclick="document.getElementById('announcementsModal').remove()" class="btn btn-secondary" style="padding: 8px 15px;">Close</button>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 15px;">
            <button class="btn" onclick="showCreateAnnouncementModal()">➕ Create New Announcement</button>
            <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="selectAllAnnouncements" onchange="toggleAllAnnouncements(this.checked)" style="width: 18px; height: 18px; cursor: pointer;">
              <span style="color: #6c757d;">Select All</span>
            </label>
          </div>
          <button class="btn btn-danger" onclick="bulkDeleteAnnouncements()" style="padding: 8px 15px; font-size: 12px;" id="deleteAnnouncementsBtn" disabled>🗑️ Delete Selected</button>
        </div>
        <div id="announcementsList">
          ${announcements.length === 0 ? '<p class="empty-state">No announcements yet.</p>' : announcements.map(a => `
            <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 15px; background: ${a.is_active ? '#f8f9fa' : '#fff3cd'};">
              <div style="display: flex; align-items: start; gap: 10px; margin-bottom: 10px;">
                <input type="checkbox" class="announcement-checkbox" value="${a.id}" onchange="updateDeleteAnnouncementsButton()" style="margin-top: 5px; width: 18px; height: 18px; cursor: pointer;">
                <div style="flex: 1;">
                  <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                    <div>
                      <h3 style="margin: 0 0 5px 0; color: #007BFF;">${a.title}</h3>
                      <small style="color: #6c757d;">Created: ${formatDateTime(a.created_at)} by ${a.created_by_name || 'Admin'}</small>
                      ${a.updated_at ? `<br><small style="color: #6c757d;">Updated: ${formatDateTime(a.updated_at)}</small>` : ''}
                    </div>
                    <div>
                      <span style="background: ${a.is_active ? '#28a745' : '#dc3545'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-right: 5px;">
                        ${a.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span style="background: #007BFF; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                        Priority: ${a.priority}
                      </span>
                    </div>
                  </div>
                  ${a.image_path ? `<div style="margin: 10px 0;"><img src="${a.image_path}" alt="Announcement image" style="max-width: 100%; max-height: 300px; border-radius: 4px; border: 1px solid #ddd;"></div>` : ''}
                  <p style="margin: 10px 0; white-space: pre-wrap;">${a.content}</p>
                  <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="btn btn-warning" onclick="showEditAnnouncementModal(${a.id})" style="padding: 5px 10px; font-size: 12px;">✏️ Edit</button>
                    <button class="btn btn-danger" onclick="deleteAnnouncement(${a.id})" style="padding: 5px 10px; font-size: 12px;">🗑️ Delete</button>
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } catch (error) {
    showAlert('Error loading announcements: ' + error.message, 'Error');
  }
}

// Show create announcement modal
function showCreateAnnouncementModal() {
  const modal = document.createElement('div');
  modal.id = 'createAnnouncementModal';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10001; overflow-y: auto;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 8px; max-width: 600px; width: 90%; max-height: 90vh; margin: 20px auto; display: flex; flex-direction: column;">
      <div style="padding: 20px; border-bottom: 1px solid #e9ecef;">
        <h3 style="margin: 0;">Create New Announcement</h3>
      </div>
      <div style="flex: 1; overflow-y: auto; padding: 20px;">
        <form id="createAnnouncementForm">
        <div class="form-group">
          <label>Title *</label>
          <input type="text" id="announcementTitle" required placeholder="e.g., System Maintenance Notice" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; font-size: 14px;">
          <small style="color: #6c757d; display: block; margin-top: 5px;">Enter a clear, descriptive title for the announcement</small>
        </div>
        <div class="form-group">
          <label>Content *</label>
          <textarea id="announcementContent" required rows="6" placeholder="Enter the announcement message here..." style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; resize: vertical; background: #fff; color: #333; font-size: 14px; font-family: inherit;"></textarea>
          <small style="color: #6c757d; display: block; margin-top: 5px;">Write the complete announcement message that users will read</small>
        </div>
        <div class="form-group">
          <label>Image (Optional)</label>
          <input type="file" id="announcementImage" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; font-size: 14px;">
          <small style="color: #6c757d; display: block; margin-top: 5px;">Upload an image to display with the announcement (max 5MB, JPG/PNG/GIF/WEBP)</small>
          <div id="announcementImagePreview" style="margin-top: 10px; display: none;">
            <img id="announcementImagePreviewImg" src="" alt="Preview" style="max-width: 100%; max-height: 200px; border-radius: 4px; border: 1px solid #ddd;">
          </div>
        </div>
        <div class="form-group">
          <label>Priority (0-10, higher = more important)</label>
          <input type="number" id="announcementPriority" min="0" max="10" value="0" placeholder="0" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; font-size: 14px;">
          <small style="color: #6c757d; display: block; margin-top: 5px;"><strong>0-3:</strong> Normal | <strong>4-6:</strong> Medium | <strong>7-10:</strong> High Priority (will be highlighted)</small>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="announcementActive" checked> Active (visible to users)
          </label>
        </div>
        </form>
      </div>
      <div style="padding: 20px; border-top: 1px solid #e9ecef; background: #f8f9fa; border-radius: 0 0 8px 8px;">
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('createAnnouncementModal').remove()">Cancel</button>
          <button type="submit" form="createAnnouncementForm" class="btn">Create</button>
        </div>
      </div>
    </div>
  `;
    document.body.appendChild(modal);

    // Image preview functionality
    const imageInput = document.getElementById('announcementImage');
    const previewDiv = document.getElementById('announcementImagePreview');
    const previewImg = document.getElementById('announcementImagePreviewImg');
    
    if (imageInput) {
      imageInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
          // Validate file size (5MB)
          if (file.size > 5 * 1024 * 1024) {
            showAlert('File size must be less than 5MB', 'File Too Large');
            e.target.value = '';
            previewDiv.style.display = 'none';
            return;
          }
          
          const reader = new FileReader();
          reader.onload = function(e) {
            previewImg.src = e.target.result;
            previewDiv.style.display = 'block';
          };
          reader.readAsDataURL(file);
        } else {
          previewDiv.style.display = 'none';
        }
      });
    }

    document.getElementById('createAnnouncementForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await createAnnouncement();
    });
}

// Create announcement
async function createAnnouncement() {
  try {
    const title = document.getElementById('announcementTitle').value;
    const content = document.getElementById('announcementContent').value;
    const priority = parseInt(document.getElementById('announcementPriority').value) || 0;
    const is_active = document.getElementById('announcementActive').checked;
    const imageFile = document.getElementById('announcementImage').files[0];

    // Create FormData for file upload
    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', content);
    formData.append('priority', priority);
    formData.append('is_active', is_active);
    
    if (imageFile) {
      formData.append('image', imageFile);
    }

    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/api/admin/announcements`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
        // Don't set Content-Type - browser will set it with boundary for FormData
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to create announcement' }));
      throw new Error(errorData.error || 'Failed to create announcement');
    }
    
    document.getElementById('createAnnouncementModal').remove();
    showAnnouncementsModal();
    showAlert('Announcement created successfully!', 'Success');
  } catch (error) {
    showAlert('Error creating announcement: ' + error.message, 'Error');
  }
}

// Show edit announcement modal
async function showEditAnnouncementModal(id) {
  try {
    const response = await fetch(`${API_BASE}/api/admin/announcements`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to load announcements');
    const announcements = await response.json();
    const announcement = announcements.find(a => a.id === id);
    if (!announcement) throw new Error('Announcement not found');

    const modal = document.createElement('div');
    modal.id = 'editAnnouncementModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10001; overflow-y: auto;';
    modal.innerHTML = `
      <div style="background: white; border-radius: 8px; max-width: 600px; width: 90%; max-height: 90vh; margin: 20px auto; display: flex; flex-direction: column;">
        <div style="padding: 20px; border-bottom: 1px solid #e9ecef;">
          <h3 style="margin: 0;">Edit Announcement</h3>
        </div>
        <div style="flex: 1; overflow-y: auto; padding: 20px;">
          <form id="editAnnouncementForm">
          <div class="form-group">
            <label>Title *</label>
            <input type="text" id="editAnnouncementTitle" value="${announcement.title.replace(/"/g, '&quot;')}" required placeholder="e.g., System Maintenance Notice" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; font-size: 14px;">
            <small style="color: #6c757d; display: block; margin-top: 5px;">Enter a clear, descriptive title for the announcement</small>
          </div>
          <div class="form-group">
            <label>Content *</label>
            <textarea id="editAnnouncementContent" required rows="6" placeholder="Enter the announcement message here..." style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; resize: vertical; background: #fff; color: #333; font-size: 14px; font-family: inherit;">${announcement.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
            <small style="color: #6c757d; display: block; margin-top: 5px;">Write the complete announcement message that users will read</small>
          </div>
          <div class="form-group">
            <label>Image (Optional)</label>
            ${announcement.image_path ? `
              <div style="margin-bottom: 10px;">
                <p style="margin: 0 0 5px 0; color: #6c757d; font-size: 0.9rem;">Current image:</p>
                <img src="${announcement.image_path}" alt="Current image" style="max-width: 100%; max-height: 200px; border-radius: 4px; border: 1px solid #ddd; margin-bottom: 10px;">
                <label style="display: block; margin-top: 5px;">
                  <input type="checkbox" id="editRemoveImage"> Remove current image
                </label>
              </div>
            ` : ''}
            <input type="file" id="editAnnouncementImage" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; font-size: 14px;">
            <small style="color: #6c757d; display: block; margin-top: 5px;">${announcement.image_path ? 'Upload a new image to replace the current one' : 'Upload an image to display with the announcement (max 5MB, JPG/PNG/GIF/WEBP)'}</small>
            <div id="editAnnouncementImagePreview" style="margin-top: 10px; display: none;">
              <img id="editAnnouncementImagePreviewImg" src="" alt="Preview" style="max-width: 100%; max-height: 200px; border-radius: 4px; border: 1px solid #ddd;">
            </div>
          </div>
          <div class="form-group">
            <label>Priority (0-10, higher = more important)</label>
            <input type="number" id="editAnnouncementPriority" min="0" max="10" value="${announcement.priority}" placeholder="0" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; font-size: 14px;">
            <small style="color: #6c757d; display: block; margin-top: 5px;"><strong>0-3:</strong> Normal | <strong>4-6:</strong> Medium | <strong>7-10:</strong> High Priority (will be highlighted)</small>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="editAnnouncementActive" ${announcement.is_active ? 'checked' : ''}> Active (visible to users)
            </label>
          </div>
          </form>
        </div>
        <div style="padding: 20px; border-top: 1px solid #e9ecef; background: #f8f9fa; border-radius: 0 0 8px 8px;">
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('editAnnouncementModal').remove()">Cancel</button>
            <button type="submit" form="editAnnouncementForm" class="btn">Update</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Image preview functionality for edit modal
    const editImageInput = document.getElementById('editAnnouncementImage');
    const editPreviewDiv = document.getElementById('editAnnouncementImagePreview');
    const editPreviewImg = document.getElementById('editAnnouncementImagePreviewImg');
    
    if (editImageInput) {
      editImageInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
          // Validate file size (5MB)
          if (file.size > 5 * 1024 * 1024) {
            showAlert('File size must be less than 5MB', 'File Too Large');
            e.target.value = '';
            editPreviewDiv.style.display = 'none';
            return;
          }
          
          const reader = new FileReader();
          reader.onload = function(e) {
            editPreviewImg.src = e.target.result;
            editPreviewDiv.style.display = 'block';
          };
          reader.readAsDataURL(file);
        } else {
          editPreviewDiv.style.display = 'none';
        }
      });
    }

    document.getElementById('editAnnouncementForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await updateAnnouncement(id);
    });
  } catch (error) {
    showAlert('Error loading announcement: ' + error.message, 'Error');
  }
}

// Update announcement
async function updateAnnouncement(id) {
  try {
    const title = document.getElementById('editAnnouncementTitle').value;
    const content = document.getElementById('editAnnouncementContent').value;
    const priority = parseInt(document.getElementById('editAnnouncementPriority').value) || 0;
    const is_active = document.getElementById('editAnnouncementActive').checked;
    const imageFile = document.getElementById('editAnnouncementImage')?.files[0];
    const removeImage = document.getElementById('editRemoveImage')?.checked || false;

    // Create FormData for file upload
    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', content);
    formData.append('priority', priority);
    formData.append('is_active', is_active);
    
    if (imageFile) {
      formData.append('image', imageFile);
    }
    
    if (removeImage) {
      formData.append('remove_image', 'true');
    }

    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/api/admin/announcements/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`
        // Don't set Content-Type - browser will set it with boundary for FormData
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to update announcement' }));
      throw new Error(errorData.error || 'Failed to update announcement');
    }
    
    document.getElementById('editAnnouncementModal').remove();
    showAnnouncementsModal();
    showAlert('Announcement updated successfully!', 'Success');
  } catch (error) {
    showAlert('Error updating announcement: ' + error.message, 'Error');
  }
}

// Toggle all announcements selection
function toggleAllAnnouncements(checked) {
  document.querySelectorAll('.announcement-checkbox').forEach(cb => {
    cb.checked = checked;
  });
  updateDeleteAnnouncementsButton();
}

// Update delete announcements button state
function updateDeleteAnnouncementsButton() {
  const selected = document.querySelectorAll('.announcement-checkbox:checked').length;
  const total = document.querySelectorAll('.announcement-checkbox').length;
  const deleteBtn = document.getElementById('deleteAnnouncementsBtn');
  const selectAllCheckbox = document.getElementById('selectAllAnnouncements');
  
  if (deleteBtn) {
    deleteBtn.disabled = selected === 0;
    if (selected > 0) {
      deleteBtn.textContent = `🗑️ Delete Selected (${selected})`;
    } else {
      deleteBtn.textContent = '🗑️ Delete Selected';
    }
  }
  
  if (selectAllCheckbox && total > 0) {
    selectAllCheckbox.checked = selected === total;
    selectAllCheckbox.indeterminate = selected > 0 && selected < total;
  }
}

// Bulk delete announcements
async function bulkDeleteAnnouncements() {
  const selectedAnnouncements = Array.from(document.querySelectorAll('.announcement-checkbox:checked'))
    .map(cb => parseInt(cb.value));

  if (selectedAnnouncements.length === 0) {
    showAlert('Please select at least one announcement to delete.', 'No Selection');
    return;
  }

  const confirmed = await showConfirm(`Are you sure you want to delete ${selectedAnnouncements.length} announcement(s)? This action cannot be undone.`, 'Delete Announcements');
  if (!confirmed) {
    return;
  }

  try {
    // Delete each announcement (and its image) one by one
    let deleted = 0;
    let failed = 0;

    for (const id of selectedAnnouncements) {
      try {
        const response = await fetch(`${API_BASE}/api/admin/announcements/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });

        if (response.ok) {
          deleted++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Error deleting announcement ${id}:`, error);
        failed++;
      }
    }

    if (failed === 0) {
      showAlert(`Successfully deleted ${deleted} announcement(s).`, 'Success');
    } else {
      showAlert(`Deleted ${deleted} announcement(s), but ${failed} failed.`, 'Partial Success');
    }

    // Reload announcements
    showAnnouncementsModal();
  } catch (error) {
    console.error('Bulk delete announcements error:', error);
    showAlert('Failed to delete announcements: ' + error.message, 'Error');
  }
}

// Delete announcement
async function deleteAnnouncement(id) {
  const confirmed = await showConfirm('Are you sure you want to delete this announcement?', 'Delete Announcement');
  if (!confirmed) return;

  try {
    console.log(`Attempting to delete announcement ID: ${id}`);
    const url = `${API_BASE}/api/admin/announcements/${id}`;
    console.log(`DELETE request to: ${url}`);
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    console.log(`Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => {
        console.error('Failed to parse error response');
        return { error: 'Failed to delete announcement' };
      });
      console.error('Error response data:', errorData);
      throw new Error(errorData.error || errorData.details || `Failed to delete announcement (${response.status})`);
    }
    
    const result = await response.json();
    console.log('Delete successful:', result);
    
    showAnnouncementsModal();
    showAlert('Announcement deleted successfully!', 'Success');
  } catch (error) {
    console.error('Delete announcement error:', error);
    console.error('Error stack:', error.stack);
    showAlert('Error deleting announcement: ' + error.message, 'Error');
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdmin);
} else {
  initAdmin();
}

