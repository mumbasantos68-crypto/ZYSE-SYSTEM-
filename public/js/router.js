// Hash-based Router
// Handles navigation between login and register views without page reload

const app = document.getElementById('app');

// Branding HTML
const brandingHTML = `
  <div class="branding">
    <h1>ZAMBIA YOUTH SELF EMPLOYMENT</h1>
    <p class="tagline">WORK SMART WORK DIGITAL</p>
  </div>
`;

// Render login form
function renderLogin() {
  const hash = window.location.hash;
  const urlParams = new URLSearchParams(window.location.search);
  const message = urlParams.get('msg');
  const msgType = urlParams.get('type') || 'error';

  let messageHTML = '';
  if (message) {
    messageHTML = `<div class="message ${msgType}">${decodeURIComponent(message)}</div>`;
  }

  app.innerHTML = `
    ${brandingHTML}
    <div class="form-container fade-in">
      ${messageHTML}
      <form id="loginForm">
        <div class="form-group">
          <label for="loginPhone">Phone Number</label>
          <input type="tel" id="loginPhone" name="phone" placeholder="0977123456" required autocomplete="tel" pattern="[0-9]{9,10}" title="Enter 9-10 digit phone number">
        </div>
        <div class="form-group">
          <label for="loginPassword">Password</label>
          <input type="password" id="loginPassword" name="password" required autocomplete="current-password">
        </div>
        <button type="submit" class="btn">Login</button>
      </form>
      <div class="form-link">
        <p>Don't have an account? <a href="#/register">Register here</a></p>
      </div>
    </div>
    <footer class="auth-footer">
      <p>&copy; 2026 Zambia Youth Self Employment. All rights reserved.</p>
    </footer>
  `;

  // Attach form handler
  const form = document.getElementById('loginForm');
  if (form) {
    form.addEventListener('submit', handleLogin);
  }
}

// Render register form
function renderRegister() {
  const hash = window.location.hash;
  
  // Get URL parameters - check both hash query string and regular query string
  const hashParts = hash.split('?');
  const hashQueryString = hashParts.length > 1 ? hashParts[1] : '';
  const urlParams = new URLSearchParams(hashQueryString || window.location.search);
  const message = urlParams.get('msg');
  const msgType = urlParams.get('type') || 'error';
  const referralCode = urlParams.get('ref') || '';

  let messageHTML = '';
  if (message) {
    messageHTML = `<div class="message ${msgType}">${decodeURIComponent(message)}</div>`;
  }

  // Show referral code message if present
  let referralMessageHTML = '';
  if (referralCode) {
    referralMessageHTML = `
      <div class="message success" style="background: #d4edda; color: #155724; border: 1px solid #c3e6cb; padding: 12px; border-radius: 5px; margin-bottom: 20px;">
        🎉 You've been invited! Referral code has been automatically filled.
      </div>
    `;
  }

  app.innerHTML = `
    ${brandingHTML}
    <div class="form-container fade-in">
      ${messageHTML}
      ${referralMessageHTML}
      <form id="registerForm">
        <div class="form-group">
          <label for="registerFullName">Full Name (Optional)</label>
          <input type="text" id="registerFullName" name="fullName" autocomplete="name">
        </div>
        <div class="form-group">
          <label for="registerPhone">Phone Number <span style="color: red;">*</span></label>
          <input type="tel" id="registerPhone" name="phone" placeholder="0977123456" required autocomplete="tel" pattern="[0-9]{9,10}" title="Enter 9-10 digit phone number">
          <small>This will be your login username</small>
        </div>
        <div class="form-group">
          <label for="registerEmail">Email (Optional)</label>
          <input type="email" id="registerEmail" name="email" autocomplete="email">
          <small>Not required - you can login with phone number only</small>
        </div>
        <div class="form-group">
          <label for="registerReferralCode">Referral Code (Optional)</label>
          <input type="text" id="registerReferralCode" name="referralCode" placeholder="Enter referrer's phone number" autocomplete="off" value="${referralCode ? decodeURIComponent(referralCode) : ''}" ${referralCode ? 'readonly style="background: #e9ecef; color: #333;"' : 'style="color: #333;"'}>
          <small>
            ${referralCode ? 'Referral code from your invitation link (auto-filled)' : 'Enter the phone number of the person who invited you'}
          </small>
        </div>
        <div class="form-group">
          <label for="registerPassword">Password</label>
          <input type="password" id="registerPassword" name="password" required autocomplete="new-password" minlength="6">
        </div>
        <div class="form-group">
          <label for="registerConfirmPassword">Confirm Password</label>
          <input type="password" id="registerConfirmPassword" name="confirmPassword" required autocomplete="new-password" minlength="6">
        </div>
        <button type="submit" class="btn">Register</button>
      </form>
      <div class="form-link">
        <p>Already have an account? <a href="#/login">Login here</a></p>
      </div>
    </div>
    <footer class="auth-footer">
      <p>&copy; 2026 Zambia Youth Self Employment. All rights reserved.</p>
    </footer>
  `;

  // Attach form handler
  const form = document.getElementById('registerForm');
  if (form) {
    form.addEventListener('submit', handleRegister);
  }
}

// Handle hash changes
function handleHashChange() {
  const hash = window.location.hash || '#/login';
  
  // Check if there's a referral code in the URL
  const hashParts = hash.split('?');
  const hashQueryString = hashParts.length > 1 ? hashParts[1] : '';
  const urlParams = new URLSearchParams(hashQueryString || window.location.search);
  const hasReferralCode = urlParams.has('ref');
  
  // Check if user is already logged in
  const token = localStorage.getItem('token');
  
  // Only redirect to dashboard if logged in AND:
  // 1. No referral code present (normal login/register access)
  // 2. User is trying to access login page (not register with referral)
  if (token && !hasReferralCode && (hash === '#/login' || hash === '#/register')) {
    // Redirect to dashboard if already logged in (but allow referral links to work)
    window.location.href = '/dashboard.html';
    return;
  }
  
  // If user is logged in but has a referral code, allow them to see register page
  // (they might be sharing their link, or someone else might be using it)
  // But if they're on login page with referral, redirect to register
  if (hasReferralCode && hash === '#/login') {
    // Redirect to register page with referral code
    window.location.hash = `#/register?${hashQueryString || urlParams.toString()}`;
    return;
  }

  // Render based on hash
  if (hash.startsWith('#/register')) {
    renderRegister();
  } else {
    renderLogin();
  }
}

// Initialize router
function initRouter() {
  // Handle initial load
  handleHashChange();

  // Listen for hash changes
  window.addEventListener('hashchange', handleHashChange);
}

// Start router when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRouter);
} else {
  initRouter();
}

