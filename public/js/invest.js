// Investment page functionality
// Displays packages and handles mobile wallet payment

// Use API_BASE from window (set by auth.js) or default to empty string
var API_BASE = window.API_BASE || '';
let packages = [];
let selectedPackage = null;
let selectedWallet = null;

// Mobile wallet configuration
// Wallet numbers are loaded from server API
const WALLETS = {
  airtel: {
    name: 'AIRTEL MONEY',
    number: '0978936541',
    accountName: 'SIMOWWE PETER',
    instructions: 'Send money to the number below using Airtel Money. After sending, copy the transaction TXT number from your confirmation message and paste it in the verification form below.'
  },
  mtn: {
    name: 'MTN MOBILE MONEY',
    number: '0966977329',
    accountName: 'MUSONDA',
    instructions: 'Send money to the number below using MTN Mobile Money. After sending, copy the transaction TXT number from your confirmation message and paste it in the verification form below.'
  }
};

// Initialize investment page
async function initInvest() {
  // Check authentication
  if (!requireAuth()) {
    return;
  }

  // Load wallet numbers from server
  await loadWallets();
  
  // Load packages
  await loadPackages();
}

// Load wallet numbers from server
async function loadWallets() {
  try {
    const response = await fetch(`${API_BASE}/api/wallets`);
    if (response.ok) {
      const wallets = await response.json();
      // Update wallet numbers from server
      if (wallets.airtel) {
        WALLETS.airtel.number = wallets.airtel.number;
        if (wallets.airtel.accountName) WALLETS.airtel.accountName = wallets.airtel.accountName;
      }
      if (wallets.mtn) {
        WALLETS.mtn.number = wallets.mtn.number;
        if (wallets.mtn.accountName) WALLETS.mtn.accountName = wallets.mtn.accountName;
      }
    }
  } catch (error) {
    console.error('Failed to load wallet numbers:', error);
    // Continue with default numbers
  }
}

// Load packages
async function loadPackages() {
  const investContent = document.getElementById('investContent');

  try {
    const response = await fetch(`${API_BASE}/api/packages`);
    
    if (!response.ok) {
      throw new Error('Failed to load packages');
    }

    packages = await response.json();
    renderPackages();
  } catch (error) {
    console.error('Packages error:', error);
    investContent.innerHTML = `
      <div class="message error">Error loading packages: ${error.message}</div>
    `;
  }
}

// Render packages
function renderPackages() {
  const investContent = document.getElementById('investContent');

  const packagesHTML = packages.map(pkg => {
    const dailyAccrual = pkg.amount * pkg.daily_rate;

    return `
      <div class="investment-card" onclick="selectPackage(${pkg.id})" id="package-${pkg.id}">
        <h3>K${pkg.amount}</h3>
        <div class="amount">Package Amount</div>
        <div class="rate">Daily Income: K${dailyAccrual.toFixed(2)}</div>
        <div class="rate">Daily Rate: ${(pkg.daily_rate * 100).toFixed(2)}%</div>
        <div class="total">Earns daily income continuously</div>
      </div>
    `;
  }).join('');

  investContent.innerHTML = `
    <h2 style="margin-bottom: 20px;">Select an Investment Package</h2>
    <p style="margin-bottom: 30px; color: #6c757d;">
      Choose a package that suits your investment goals. Each package offers daily returns.
    </p>
    
    <div class="investment-grid" id="packagesGrid">
      ${packagesHTML}
    </div>

    <div id="paymentSection" class="hidden" style="margin-top: 40px;">
      <div class="card">
        <div class="card-header">Complete Your Investment</div>
        <div id="selectedPackageInfo"></div>
        
        <!-- Wallet Selection -->
        <div id="walletSelection" style="margin-top: 20px;">
          <h3 style="margin-bottom: 15px;">Select Payment Method</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
            <div class="wallet-option" onclick="selectWallet('airtel')" id="wallet-airtel">
              <div style="font-size: 1.5rem; font-weight: bold; color: #E21836;">AIRTEL</div>
              <div style="color: #6c757d; margin-top: 5px;">Airtel Money</div>
            </div>
            <div class="wallet-option" onclick="selectWallet('mtn')" id="wallet-mtn">
              <div style="font-size: 1.5rem; font-weight: bold; color: #FFCC00;">MTN</div>
              <div style="color: #6c757d; margin-top: 5px;">MTN Mobile Money</div>
            </div>
          </div>
        </div>

        <!-- Payment Instructions -->
        <div id="paymentInstructions" class="hidden" style="margin-top: 20px;">
          <div class="message" style="background: #e7f3ff; border-color: #007BFF; color: #004085;">
            <strong>Payment Instructions:</strong>
            <p id="walletInstructions" style="margin-top: 10px;"></p>
          </div>
          
          <div style="margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center;">
            <div style="font-size: 0.9rem; color: #6c757d; margin-bottom: 10px;">Send money to:</div>
            <div style="font-size: 2rem; font-weight: bold; color: #007BFF; margin-bottom: 15px; word-break: break-all;" id="paymentNumber"></div>
            <button class="btn btn-secondary" onclick="copyPaymentNumber()" style="margin-top: 10px;">
              Copy Number
            </button>
          </div>

          <div style="margin-top: 30px;">
            <h3 style="margin-bottom: 15px;">Verify Your Payment</h3>
            <form id="transactionVerificationForm">
              <div class="form-group">
                <label for="transactionTxt">Transaction TXT Number</label>
                <input type="text" id="transactionTxt" name="transactionTxt" 
                       placeholder="Paste your transaction TXT number here" 
                       required 
                       style="font-family: monospace;">
                <small style="color: #6c757d; display: block; margin-top: 5px;">
                  Copy the transaction TXT number from your mobile money confirmation message
                </small>
              </div>
              <button type="submit" class="btn btn-success">Verify & Complete Investment</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach transaction verification form handler
  setTimeout(() => {
    const verificationForm = document.getElementById('transactionVerificationForm');
    if (verificationForm) {
      verificationForm.addEventListener('submit', handleTransactionVerification);
    }
  }, 100);
}

// Select package
function selectPackage(packageId) {
  selectedPackage = packages.find(pkg => pkg.id === packageId);
  
  if (!selectedPackage) {
    return;
  }

  // Reset wallet selection
  selectedWallet = null;

  // Update UI
  document.querySelectorAll('.investment-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  const selectedCard = document.getElementById(`package-${packageId}`);
  if (selectedCard) {
    selectedCard.classList.add('selected');
  }

  // Show payment section
  const paymentSection = document.getElementById('paymentSection');
  const selectedPackageInfo = document.getElementById('selectedPackageInfo');
  const walletSelection = document.getElementById('walletSelection');
  const paymentInstructions = document.getElementById('paymentInstructions');

  if (paymentSection) {
    paymentSection.classList.remove('hidden');
  }

    if (selectedPackageInfo) {
      const dailyAccrual = selectedPackage.amount * selectedPackage.daily_rate;

      selectedPackageInfo.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
          <div>
            <strong>Package:</strong> K${selectedPackage.amount}
          </div>
          <div>
            <strong>Daily Income:</strong> K${dailyAccrual.toFixed(2)}
          </div>
          <div>
            <strong>Daily Rate:</strong> ${(selectedPackage.daily_rate * 100).toFixed(2)}%
          </div>
          <div>
            <strong>Earnings:</strong> Continuous daily income
          </div>
        </div>
      `;
    }

  // Show wallet selection, hide instructions
  if (walletSelection) {
    walletSelection.classList.remove('hidden');
  }
  if (paymentInstructions) {
    paymentInstructions.classList.add('hidden');
  }

  // Scroll to payment section
  paymentSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Select wallet
function selectWallet(walletType) {
  selectedWallet = walletType;
  const wallet = WALLETS[walletType];

  if (!wallet) {
    return;
  }

  // Update UI
  document.querySelectorAll('.wallet-option').forEach(option => {
    option.classList.remove('selected');
  });
  
  const selectedOption = document.getElementById(`wallet-${walletType}`);
  if (selectedOption) {
    selectedOption.classList.add('selected');
  }

  // Hide wallet selection, show instructions
  const walletSelection = document.getElementById('walletSelection');
  const paymentInstructions = document.getElementById('paymentInstructions');
  const walletInstructions = document.getElementById('walletInstructions');
  const paymentNumber = document.getElementById('paymentNumber');

  if (walletSelection) {
    walletSelection.classList.add('hidden');
  }
  if (paymentInstructions) {
    paymentInstructions.classList.remove('hidden');
  }
  if (walletInstructions) {
    walletInstructions.textContent = wallet.instructions;
  }
  if (paymentNumber) {
    paymentNumber.textContent = wallet.accountName
      ? `${wallet.number} (${wallet.accountName})`
      : wallet.number;
  }

  // Scroll to instructions
  paymentInstructions.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Copy payment number to clipboard
function copyPaymentNumber() {
  const paymentNumber = document.getElementById('paymentNumber');
  if (!paymentNumber) {
    showAlert('Payment number not found', 'Error');
    return;
  }

  const number = paymentNumber.textContent.trim();
  
  // Find the copy button to update its text
  const copyBtn = document.querySelector('button[onclick*="copyPaymentNumber"]');
  const originalText = copyBtn ? copyBtn.textContent : 'Copy Number';
  
  // Try modern clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(number).then(() => {
      // Show success feedback
      if (copyBtn) {
        copyBtn.textContent = 'Copied!';
        copyBtn.style.background = '#28a745';
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = '';
        }, 2000);
      } else {
        showAlert('Number copied to clipboard: ' + number, 'Copied');
      }
    }).catch(err => {
      console.error('Clipboard API failed, trying fallback:', err);
      // Fallback to older method
      fallbackCopyPaymentNumber(number, copyBtn, originalText);
    });
  } else {
    // Fallback for browsers without clipboard API
    fallbackCopyPaymentNumber(number, copyBtn, originalText);
  }
}

// Fallback copy method for older browsers or HTTP sites
function fallbackCopyPaymentNumber(text, button, originalText) {
  try {
    // Create a temporary textarea element
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    
    if (successful) {
      // Show success feedback
      if (button) {
        button.textContent = 'Copied!';
        button.style.background = '#28a745';
        setTimeout(() => {
          button.textContent = originalText;
          button.style.background = '';
        }, 2000);
      } else {
        showAlert('Number copied to clipboard: ' + text, 'Copied');
      }
    } else {
      throw new Error('execCommand copy failed');
    }
  } catch (err) {
    console.error('Fallback copy failed:', err);
    // Show manual copy option
    showAlert('Please copy the number manually: ' + text, 'Copy Manually');
  }
}

// Handle transaction verification
async function handleTransactionVerification(e) {
  e.preventDefault();

  if (!selectedPackage || !selectedWallet) {
    showAlert('Please select a package and wallet first', 'Missing Information');
    return;
  }

  const form = e.target;
  const transactionTxt = form.transactionTxt.value.trim();
  const submitBtn = form.querySelector('button[type="submit"]');

  if (!transactionTxt) {
    showAlert('Please enter your transaction TXT number', 'Missing Information');
    return;
  }

  // Disable submit button
  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifying...';

  try {
    // Verify transaction and create investment
    const response = await fetch(`${API_BASE}/api/verify-transaction`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        packageId: selectedPackage.id,
        amount: selectedPackage.amount,
        wallet: selectedWallet,
        transactionTxt: transactionTxt
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Transaction verification failed');
    }

    // Show success message
    showAlert('Payment verified successfully! Your investment has been created.', 'Success');
    window.location.href = '/dashboard.html#section-dashboard';
  } catch (error) {
    console.error('Verification error:', error);
    showAlert(`Verification failed: ${error.message}`, 'Error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Verify & Complete Investment';
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initInvest);
} else {
  initInvest();
}
