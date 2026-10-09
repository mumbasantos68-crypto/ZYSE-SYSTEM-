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
        <p>Don't have an account?</p>
        <a href="#/register" class="btn btn-register">Register here</a>
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
  let referralCode = urlParams.get('ref') || '';
  try {
    referralCode = referralCode ? decodeURIComponent(referralCode).trim() : '';
  } catch (e) {
    referralCode = (referralCode || '').trim();
  }
  const referralDisplay = referralCode.replace(/[<>&"]/g, '');

  let messageHTML = '';
  if (message) {
    messageHTML = `<div class="message ${msgType}">${decodeURIComponent(message)}</div>`;
  }

  const referralFieldHTML = `
        <div class="form-group">
          <label for="registerReferralCode">Referral Code</label>
          <input
            type="text"
            id="registerReferralCode"
            name="referralCode"
            placeholder="Inviter phone number"
            autocomplete="off"
            value="${referralDisplay}"
            ${referralDisplay ? 'readonly' : ''}
          >
        </div>
      `;

  app.innerHTML = `
    ${brandingHTML}
    <div class="form-container fade-in">
      ${messageHTML}
      <form id="registerForm">
        <div class="form-group">
          <label for="registerFullName">Full Name</label>
          <input type="text" id="registerFullName" name="fullName" autocomplete="name">
        </div>
        <div class="form-group">
          <label for="registerPhone">Phone Number <span style="color: red;">*</span></label>
          <input type="tel" id="registerPhone" name="phone" placeholder="0977123456" required autocomplete="tel" pattern="[0-9]{9,10}" title="Enter 9-10 digit phone number">
          <small>This will be your login username</small>
        </div>
        <div class="form-group">
          <label for="registerEmail">Email</label>
          <input type="email" id="registerEmail" name="email" autocomplete="email">
        </div>
        ${referralFieldHTML}
        <div class="form-group">
          <label for="registerPassword">Password</label>
          <input type="password" id="registerPassword" name="password" required autocomplete="new-password" minlength="6">
        </div>
        <div class="form-group">
          <label for="registerConfirmPassword">Confirm Password</label>
          <input type="password" id="registerConfirmPassword" name="confirmPassword" required autocomplete="new-password" minlength="6">
        </div>
        <div class="whatsapp-join-box">
          <a class="btn-whatsapp" href="https://chat.whatsapp.com/LoVKTQEmJmKCH87VxZvURy" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2C6.58 2 2.15 6.37 2.15 11.75c0 1.72.46 3.4 1.33 4.88L2 22l5.54-1.44a10.1 10.1 0 0 0 4.5 1.07h.01c5.46 0 9.89-4.37 9.89-9.75S17.5 2 12.04 2zm5.76 13.83c-.24.68-1.4 1.25-1.94 1.33-.5.07-1.14.1-1.84-.12-.42-.13-.97-.32-1.67-.62-2.94-1.27-4.85-4.22-5-4.41-.14-.2-1.18-1.56-1.18-2.98 0-1.41.74-2.11 1-2.4.26-.28.57-.35.76-.35h.55c.18 0 .42-.07.65.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.1.2-.15.31-.3.48-.14.16-.3.36-.43.48-.14.14-.29.29-.12.56.16.28.73 1.2 1.56 1.94 1.08.96 1.98 1.26 2.26 1.4.28.14.44.12.6-.07.16-.2.7-.81.88-1.09.19-.28.37-.23.62-.14.26.1 1.63.77 1.91.91.28.14.47.21.54.32.07.12.07.68-.17 1.36z"/></svg>
            Join WhatsApp group
          </a>
          <label class="whatsapp-join-check" for="registerJoinedGroup">
            <input type="checkbox" id="registerJoinedGroup" name="registerJoinedGroup" required>
            <span>I have joined the official group</span>
          </label>
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

