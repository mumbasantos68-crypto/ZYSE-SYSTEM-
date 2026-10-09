// Authentication functions
// Handles login, register, and JWT token management

// Declare API_BASE on window object so it's globally accessible
if (typeof window.API_BASE === 'undefined') {
  window.API_BASE = '';
}
// Also create a local reference for convenience
var API_BASE = window.API_BASE;

// Handle login form submission
async function handleLogin(e) {
  e.preventDefault();
  
  const form = e.target;
  // Access form fields by name attribute (form.phone) or by id using querySelector
  const phone = (form.phone?.value || form.querySelector('#loginPhone')?.value || '').trim();
  const password = form.password?.value || form.querySelector('#loginPassword')?.value || '';
  const submitBtn = form.querySelector('button[type="submit"]');

  // Validate phone number (required)
  if (!phone || phone.length < 9) {
    const messageDiv = document.querySelector('.message');
    if (messageDiv) {
      messageDiv.textContent = 'Please enter a valid phone number (9-10 digits)';
      messageDiv.className = 'message error';
    } else {
      const formContainer = document.querySelector('.form-container');
      const errorMsg = document.createElement('div');
      errorMsg.className = 'message error';
      errorMsg.textContent = 'Please enter a valid phone number (9-10 digits)';
      formContainer.insertBefore(errorMsg, formContainer.firstChild);
    }
    return;
  }

  // Disable submit button
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in...';

  try {
    const url = (API_BASE || '') + '/api/login';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
    });

    // For login, we need custom error handling (401 is expected for wrong credentials)
    if (!response.ok) {
      let errorData = {};
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { error: response.statusText || 'HTTP ' + response.status };
      }
      console.error('Login API error:', response.status, errorData);
      var errorMessage = errorData.error || errorData.message || 'Login failed';
      if (errorData.hint) errorMessage += '\n\n' + errorData.hint;
      throw new Error(errorMessage);
    }

    // Parse successful response
    const data = await response.json();

    // Store token and user data
    // Clean up user data - remove admin email if user is not admin
    const userData = { ...data.user, isAdmin: data.user.isAdmin === true || data.user.isAdmin === 1 || data.user.isAdmin === '1' };
    if (!userData.isAdmin && userData.email === 'admin@zambia-youth.com') {
      userData.email = null; // Remove admin email from localStorage for non-admin users
      console.log('Removed admin email from user data for non-admin user');
    }
    
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(userData));

    window.location.href = '/dashboard.html';
  } catch (error) {
    console.error('Login error:', error);
    
    // Show error message with proper formatting
    const errorMessage = error.message;
    
    // Show error message
    const messageDiv = document.querySelector('.message');
    if (messageDiv) {
      messageDiv.textContent = errorMessage;
      messageDiv.className = 'message error';
      messageDiv.style.whiteSpace = 'pre-line'; // Allow line breaks
    } else {
      // Create error message
      const formContainer = document.querySelector('.form-container');
      const errorMsg = document.createElement('div');
      errorMsg.className = 'message error';
      errorMsg.style.whiteSpace = 'pre-line'; // Allow line breaks in error message
      errorMsg.textContent = errorMessage;
      formContainer.insertBefore(errorMsg, formContainer.firstChild);
    }

    // Re-enable submit button
    submitBtn.disabled = false;
    submitBtn.textContent = 'Login';
  }
}

// Handle register form submission
async function handleRegister(e) {
  e.preventDefault();
  
  const form = e.target;
  const fullName = form.registerFullName?.value || '';
  const phone = form.registerPhone?.value.trim() || '';
  const email = form.registerEmail?.value || ''; // Optional
  const password = form.registerPassword.value;
  const confirmPassword = form.registerConfirmPassword.value;
  const referralCode = form.registerReferralCode?.value || '';
  const joinedGroup = form.registerJoinedGroup?.checked || form.querySelector('#registerJoinedGroup')?.checked;
  const submitBtn = form.querySelector('button[type="submit"]');

  // Validate phone number
  if (!phone || phone.length < 9) {
    const messageDiv = document.querySelector('.message');
    if (messageDiv) {
      messageDiv.textContent = 'Phone number is required (9-10 digits)';
      messageDiv.className = 'message error';
    } else {
      const formContainer = document.querySelector('.form-container');
      const errorMsg = document.createElement('div');
      errorMsg.className = 'message error';
      errorMsg.textContent = 'Phone number is required (9-10 digits)';
      formContainer.insertBefore(errorMsg, formContainer.firstChild);
    }
    return;
  }

  if (!joinedGroup) {
    const messageDiv = document.querySelector('.message');
    const text = 'Join the official WhatsApp group, then tick the box to register.';
    if (messageDiv) {
      messageDiv.textContent = text;
      messageDiv.className = 'message error';
    } else {
      const formContainer = document.querySelector('.form-container');
      const errorMsg = document.createElement('div');
      errorMsg.className = 'message error';
      errorMsg.textContent = text;
      formContainer.insertBefore(errorMsg, formContainer.firstChild);
    }
    return;
  }

  // Validate passwords match
  if (password !== confirmPassword) {
    const messageDiv = document.querySelector('.message');
    if (messageDiv) {
      messageDiv.textContent = 'Passwords do not match';
      messageDiv.className = 'message error';
    } else {
      const formContainer = document.querySelector('.form-container');
      const errorMsg = document.createElement('div');
      errorMsg.className = 'message error';
      errorMsg.textContent = 'Passwords do not match';
      formContainer.insertBefore(errorMsg, formContainer.firstChild);
    }
    return;
  }

  // Disable submit button
  submitBtn.disabled = true;
  submitBtn.textContent = 'Registering...';

  try {
    const requestBody = { 
      phone: phone.trim(),
      password,
      full_name: fullName && fullName.trim() ? fullName.trim() : undefined,
      ...(email && email.trim() ? { email: email.trim() } : {}), // Only include email if provided
      ...(referralCode && referralCode.trim() ? { referral_code: referralCode.trim() } : {}) // Only include referral_code if provided
    };
    
    console.log('Sending registration request:', { ...requestBody, password: '***' });
    
    const response = await fetch(`${API_BASE}/api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('Registration response status:', response.status, response.statusText);

    let data;
    try {
      const text = await response.text();
      console.log('Registration response text:', text);
      data = text ? JSON.parse(text) : {};
    } catch (jsonError) {
      console.error('Failed to parse response as JSON:', jsonError);
      throw new Error(`Server error: ${response.status} ${response.statusText}. Please check the server logs.`);
    }

    if (!response.ok) {
      // Extract error message properly - handle both strings and objects
      let errorMessage = `Registration failed: ${response.status} ${response.statusText}`;
      
      if (data?.error) {
        errorMessage = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
      } else if (data?.message) {
        errorMessage = typeof data.message === 'string' ? data.message : (data.message.message || JSON.stringify(data.message));
      } else if (data?.details) {
        errorMessage = typeof data.details === 'string' ? data.details : (data.details.message || JSON.stringify(data.details));
      }
      
      console.error('Registration failed:', { 
        status: response.status, 
        statusText: response.statusText, 
        data,
        errorMessage 
      });
      throw new Error(errorMessage);
    }

    // Show success message
    const formContainer = document.querySelector('.form-container');
    const successMsg = document.createElement('div');
    successMsg.className = 'message success';
    successMsg.style.cssText = 'background: #d4edda; color: #155724; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin-bottom: 20px; font-weight: bold; text-align: center;';
    successMsg.innerHTML = 'Registered successfully. You start with no level (L0).<br><small style="font-weight: normal;">Stay in the official WhatsApp group, then login.</small>';
    formContainer.insertBefore(successMsg, formContainer.firstChild);
    
    // Clear form
    form.reset();
    
    // Redirect to login after 2 seconds
    setTimeout(() => {
      window.location.href = '#/login?msg=' + encodeURIComponent('Registration successful! Please login with your phone number and password.') + '&type=success';
    }, 2000);
  } catch (error) {
    console.error('Registration error:', error);
    
    // Show error message
    const messageDiv = document.querySelector('.message');
    if (messageDiv) {
      messageDiv.textContent = error.message;
      messageDiv.className = 'message error';
    } else {
      const formContainer = document.querySelector('.form-container');
      const errorMsg = document.createElement('div');
      errorMsg.className = 'message error';
      errorMsg.textContent = error.message;
      formContainer.insertBefore(errorMsg, formContainer.firstChild);
    }

    // Re-enable submit button
    submitBtn.disabled = false;
    submitBtn.textContent = 'Register';
  }
}

// Get auth token
function getToken() {
  return localStorage.getItem('token');
}

// Get user data
function getUser() {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
}

function isAdminUser(user) {
  const current = user || getUser();
  if (current && (current.isAdmin === true || current.isAdmin === 1 || current.isAdmin === '1')) {
    return true;
  }
  try {
    const token = getToken();
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length < 2) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.isAdmin === true || payload.isAdmin === 1;
  } catch (e) {
    return false;
  }
}

function setAdminUiVisible(visible) {
  const nav = document.getElementById('adminNavItem');
  const bar = document.getElementById('adminShortcutBar');
  if (nav) nav.style.display = visible ? '' : 'none';
  if (bar) bar.style.display = visible ? 'flex' : 'none';
}

// Check if user is authenticated
function isAuthenticated() {
  return !!getToken();
}

// Logout
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/index.html';
}

// Get auth headers for API calls
function getAuthHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// Check authentication and redirect if not logged in
function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = '/index.html';
    return false;
  }
  return true;
}

