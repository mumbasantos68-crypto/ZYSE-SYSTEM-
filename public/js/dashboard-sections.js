// Dashboard sections navigation and content management

// Use API_BASE from window (set by auth.js) - don't redeclare, just reference
// Since auth.js is loaded first, API_BASE should already be available on window
// We'll reference window.API_BASE directly in functions that need it

// Ensure utility functions are available (fallback if api-utils.js hasn't loaded yet)
if (typeof showLoading !== 'function') {
  window.showLoading = function(element, message = 'Loading...') {
    if (element) {
      element.innerHTML = `<div class="loading">${message}</div>`;
    }
  };
}

if (typeof showError !== 'function') {
  window.showError = function(element, message, onRetry = null) {
    if (element) {
      const retryButton = onRetry ? `<button class="btn mt-20" onclick="(${onRetry.toString()})()">Retry</button>` : '';
      element.innerHTML = `
        <div class="message error">
          <strong>Error:</strong><br>
          ${message}<br>
          <small>Check browser console (F12) for more details.</small><br>
          ${retryButton}
          <button class="btn btn-secondary mt-20" onclick="location.reload()">Reload Page</button>
        </div>
      `;
    }
  };
}

// Ensure API utility functions are available
if (typeof apiCall !== 'function') {
  window.apiCall = async function(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeout / 1000} seconds`);
      }
      throw error;
    }
  };
}

if (typeof handleApiResponse !== 'function') {
  window.handleApiResponse = async function(response) {
    if (!response.ok) {
      let errorData = {};
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { error: response.statusText || `HTTP ${response.status}` };
      }
      throw new Error(errorData.error || errorData.message || `Request failed with status ${response.status}`);
    }
    return await response.json();
  };
}

if (typeof authenticatedApiCall !== 'function') {
  window.authenticatedApiCall = async function(url, options = {}, timeout = 15000) {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Not authenticated. Please log in.');
    }
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    };
    const response = await apiCall(url, { ...options, headers }, timeout);
    return handleApiResponse(response);
  };
}

// Show a specific section
function showSection(sectionName) {
  // Close mobile menu immediately when section is selected
  if (window.innerWidth <= 768) {
    if (typeof window.closeMobileMenu === 'function') {
      window.closeMobileMenu();
    } else {
      // Fallback if function not available
      const sidebar = document.getElementById('sidebar');
      const overlay = document.querySelector('.mobile-menu-overlay');
      if (sidebar && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
      }
    }
  }
  console.log('Showing section:', sectionName);
  
  // Hide all sections
  document.querySelectorAll('.content-section').forEach(section => {
    section.classList.remove('active');
  });

  // Remove active class from all nav items
  document.querySelectorAll('.nav-menu-sidebar a').forEach(link => {
    link.classList.remove('active');
  });

  // Show selected section
  const section = document.getElementById(`section-${sectionName}`);
  if (!section) {
    console.error('Section not found:', sectionName);
    return;
  }
  
  section.classList.add('active');
  const navLink = document.getElementById(`nav-${sectionName}`);
  if (navLink) {
    navLink.classList.add('active');
  }
  
  // Update URL hash without triggering hashchange
  const newHash = `#section-${sectionName}`;
  if (window.location.hash !== newHash) {
    history.replaceState(null, '', newHash);
  }

  // Load section content - always load, don't skip
  console.log('Loading content for section:', sectionName);
  switch(sectionName) {
    case 'home':
      loadHomeSection();
      break;
    case 'dashboard':
      loadDashboardSection();
      break;
    case 'levels':
      loadLevelsSection();
      break;
    case 'about':
      loadAboutSection();
      break;
    case 'me':
      loadMeSection();
      break;
    case 'withdraw':
      loadWithdrawSection();
      break;
    default:
      console.warn('Unknown section:', sectionName);
  }
}

// Load Home Section
async function loadHomeSection() {
  const homeContent = document.getElementById('homeContent');
  if (!homeContent) {
    console.error('Home content container not found');
    return;
  }
  
  // Show loading state
  showLoading(homeContent, 'Loading home content...');
  
  // Load announcements
  let announcements = [];
  try {
    const announcementsResponse = await apiCall(`${window.API_BASE || ''}/api/announcements`, {
      method: 'GET'
    });
    if (announcementsResponse.ok) {
      announcements = await handleApiResponse(announcementsResponse);
    }
  } catch (error) {
    console.error('Error loading announcements:', error);
    // Continue without announcements - not critical
  }
  
  // Generate random phone numbers and levels
  function generatePhoneNumber() {
    const prefixes = ['097', '096', '095', '077', '076', '075'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const number = Math.floor(1000000 + Math.random() * 9000000);
    return prefix + number.toString();
  }

  function generateLevel() {
    const levels = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10'];
    return levels[Math.floor(Math.random() * levels.length)];
  }

  // Slideshow functionality
  let slideshowInterval = null;
  function updateSlideshow() {
    const phone = generatePhoneNumber();
    const level = generateLevel();
    const slideshow = document.getElementById('homeSlideshow');
    if (slideshow) {
      slideshow.style.opacity = '0';
      setTimeout(() => {
        slideshow.textContent = `${phone} has activated in ${level}`;
        slideshow.style.opacity = '1';
      }, 250);
    }
  }

  // Format announcements HTML
  const announcementsHTML = announcements.length > 0 ? `
    <div style="background: white; padding: 30px; border-radius: 10px; margin-bottom: 20px;">
      <h3 style="color: #007BFF; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 1.5rem;">📢</span>
        <span>Announcements</span>
      </h3>
      ${announcements.map(a => `
        <div style="border-left: 4px solid ${a.priority >= 7 ? '#dc3545' : a.priority >= 4 ? '#ffc107' : '#007BFF'}; padding: 15px; margin-bottom: 15px; background: ${a.priority >= 7 ? '#fff5f5' : a.priority >= 4 ? '#fffbf0' : '#f8f9fa'}; border-radius: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
            <h4 style="margin: 0; color: #333; font-size: 1.1rem;">${a.title}</h4>
            ${a.priority > 0 ? `<span style="background: #007BFF; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;">Priority ${a.priority}</span>` : ''}
          </div>
          ${a.image_path ? `<div style="margin: 10px 0;"><img src="${a.image_path}" alt="${a.title}" style="max-width: 100%; max-height: 400px; border-radius: 8px; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></div>` : ''}
          <p style="margin: 0; color: #555; white-space: pre-wrap; line-height: 1.6;">${a.content}</p>
          <small style="color: #999; display: block; margin-top: 10px;">${new Date(a.created_at).toLocaleDateString()}</small>
        </div>
      `).join('')}
    </div>
  ` : '';

  homeContent.innerHTML = `
    <div style="background: linear-gradient(135deg, #007BFF 0%, #0056b3 100%); color: white; padding: 40px; border-radius: 10px; margin-bottom: 30px; text-align: center;">
      <h2 style="font-size: 2.5rem; margin-bottom: 20px; color: white;">Welcome Back!</h2>
      <p style="font-size: 1.2rem; margin-bottom: 30px;">Empowering Youth Through Digital Investment</p>
      
      <div style="background: rgba(255,255,255,0.1); border-radius: 10px; padding: 20px; margin: 20px 0; min-height: 60px; display: flex; align-items: center; justify-content: center;">
        <div id="homeSlideshow" style="font-size: 1.3rem; transition: opacity 0.3s;">Loading...</div>
      </div>
    </div>

    ${announcementsHTML}

    <div style="background: white; padding: 30px; border-radius: 10px; margin-bottom: 20px;">
      <h3 style="color: #007BFF; margin-bottom: 20px;">Quick Actions</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
        <button class="btn" onclick="showSection('levels')" style="padding: 20px; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 10px;">⭐</div>
          <div>View Levels</div>
        </button>
        <button class="btn btn-success" onclick="showSection('dashboard')" style="padding: 20px; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 10px;">📊</div>
          <div>My Investments</div>
        </button>
        <button class="btn btn-secondary" onclick="showSection('me')" style="padding: 20px; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 10px;">👤</div>
          <div>My Profile</div>
        </button>
      </div>
    </div>

    <div style="background: white; padding: 30px; border-radius: 10px;">
      <h3 style="color: #007BFF; margin-bottom: 20px; text-align: center;">Youth Empowerment</h3>
      <div id="youthImageSlideshow" style="width: 100%; max-width: 800px; height: 450px; margin: 0 auto 20px; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); position: relative; background: #000;">
        <img 
          id="youthSlideshowImage" 
          src="/images/medium-shot-smiley-friends-with-smartphones.jpg" 
          alt="Youth using phones"
          style="width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; transition: opacity 0.8s ease-in-out;"
        />
        <div style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px;">
          <span id="slideDot1" class="slide-dot active" style="width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.8); cursor: pointer; transition: background 0.3s;"></span>
          <span id="slideDot2" class="slide-dot" style="width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.4); cursor: pointer; transition: background 0.3s;"></span>
          <span id="slideDot3" class="slide-dot" style="width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.4); cursor: pointer; transition: background 0.3s;"></span>
          <span id="slideDot4" class="slide-dot" style="width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.4); cursor: pointer; transition: background 0.3s;"></span>
          <span id="slideDot5" class="slide-dot" style="width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.4); cursor: pointer; transition: background 0.3s;"></span>
        </div>
      </div>
      <p style="color: #6c757d; line-height: 1.8; text-align: center; max-width: 600px; margin: 0 auto;">
        Join thousands of Zambian youth who are building their future through smart digital investments.
        Start your journey today and unlock your potential.
      </p>
    </div>
  `;

  // Initialize slideshow after content is rendered
  setTimeout(() => {
    updateSlideshow();
    // Clear any existing interval
    if (window.homeSlideshowInterval) {
      clearInterval(window.homeSlideshowInterval);
    }
    window.homeSlideshowInterval = setInterval(updateSlideshow, 3000);
    
    // Setup image slideshow
    const youthImages = [
      '/images/medium-shot-smiley-friends-with-smartphones.jpg',
      '/images/group-young-african-friends-with-facemasks-using-their-phones-park.jpg',
      '/images/medium-shot-people-relaxing-outdoors.jpg',
      '/images/group-four-african-american-girls-sitting-bench-outdoor-looking-mobile-phones-black-white.jpg',
      '/images/medium-shot-student-with-smartphone.jpg'
    ];
    
    let currentImageIndex = 0;
    const slideshowImage = document.getElementById('youthSlideshowImage');
    
    function updateYouthSlideshow() {
      if (!slideshowImage) return;
      
      // Fade out
      slideshowImage.style.opacity = '0';
      
      setTimeout(() => {
        // Change image
        currentImageIndex = (currentImageIndex + 1) % youthImages.length;
        slideshowImage.src = youthImages[currentImageIndex];
        
        // Update dots
        document.querySelectorAll('.slide-dot').forEach((dot, index) => {
          if (index === currentImageIndex) {
            dot.style.background = 'rgba(255,255,255,0.8)';
          } else {
            dot.style.background = 'rgba(255,255,255,0.4)';
          }
        });
        
        // Fade in
        slideshowImage.style.opacity = '1';
      }, 400);
    }
    
    function goToSlide(index) {
      if (!slideshowImage) return;
      currentImageIndex = index;
      
      // Fade out
      slideshowImage.style.opacity = '0';
      
      setTimeout(() => {
        slideshowImage.src = youthImages[currentImageIndex];
        
        // Update dots
        document.querySelectorAll('.slide-dot').forEach((dot, idx) => {
          if (idx === currentImageIndex) {
            dot.style.background = 'rgba(255,255,255,0.8)';
          } else {
            dot.style.background = 'rgba(255,255,255,0.4)';
          }
        });
        
        // Fade in
        slideshowImage.style.opacity = '1';
      }, 400);
      
      // Reset interval
      if (window.youthSlideshowInterval) {
        clearInterval(window.youthSlideshowInterval);
      }
      window.youthSlideshowInterval = setInterval(updateYouthSlideshow, 6000);
    }
    
    // Handle image load errors - skip to next image if one fails
    if (slideshowImage) {
      slideshowImage.addEventListener('error', function() {
        console.log('Image failed to load, trying next image');
        setTimeout(() => {
          updateYouthSlideshow();
        }, 1000);
      });
      
      // Setup click handlers for dots
      document.querySelectorAll('.slide-dot').forEach((dot, index) => {
        dot.addEventListener('click', function() {
          goToSlide(index);
        });
      });
      
      // Initialize first image opacity
      slideshowImage.style.opacity = '1';
      
      // Start slideshow - change every 6 seconds
      if (window.youthSlideshowInterval) {
        clearInterval(window.youthSlideshowInterval);
      }
      window.youthSlideshowInterval = setInterval(updateYouthSlideshow, 6000);
    }
  }, 100);
}

// Load Dashboard Section
function loadDashboardSection() {
  const dashboardContent = document.getElementById('dashboardContent');
  if (!dashboardContent) {
    console.error('Dashboard content container not found');
    return;
  }
  // Reset loaded flag to force reload
  dashboardContent.dataset.loaded = 'false';
  loadInvestmentsDirectly();
}

// Direct loading function for investments
async function loadInvestmentsDirectly() {
  const dashboardContent = document.getElementById('dashboardContent');
  if (!dashboardContent) return;

  // Show loading state
  showLoading(dashboardContent, 'Loading investments...');

  try {
    // Use authenticatedApiCall for better error handling and timeout
    const data = await authenticatedApiCall(`${window.API_BASE || ''}/api/dashboard`, {
      method: 'GET'
    });
    const investments = data.investments || [];
    const transactions = data.transactions || [];
    const user = getUser();

    // Check for pending deposits and show notification
    checkAndShowPendingDeposits(investments);

    // Render dashboard (similar to dashboard.js)
    let investmentsHTML = '';
    if (investments.length === 0) {
      investmentsHTML = `
        <div class="empty-state">
          <p>No investments yet.</p>
          <a href="#" onclick="showSection('levels'); return false;" class="btn mt-20">Invest Now</a>
        </div>
      `;
    } else {
      investmentsHTML = investments.map(investment => {
        const totalValue = investment.deposit_amount + investment.total_accruals;
        const dailyAccrual = investment.deposit_amount * investment.daily_rate;
        const walletDisplay = investment.wallet ? 
          (investment.wallet === 'airtel' ? 'AIRTEL MONEY' : 
           investment.wallet === 'mtn' ? 'MTN MOBILE MONEY' : 
           investment.wallet === 'balance' ? 'BALANCE' :
           investment.wallet.toUpperCase()) : 'N/A';

        return `
          <div class="card">
            <div class="card-header">Investment #${investment.id}</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
              <div><strong>Package:</strong> K${investment.package_amount}</div>
              <div><strong>Deposit:</strong> K${investment.deposit_amount}</div>
              <div><strong>Daily Accrual:</strong> K${dailyAccrual.toFixed(2)}</div>
              <div><strong>Total Accruals:</strong> K${investment.total_accruals.toFixed(2)}</div>
              <div><strong>Start Date:</strong> ${formatDate(investment.start_date)}</div>
              <div><strong>Status:</strong> 
                <span style="
                  text-transform: capitalize; 
                  padding: 4px 12px; 
                  border-radius: 12px; 
                  font-size: 0.85rem;
                  font-weight: bold;
                  ${investment.status === 'pending' ? 'background: #fff3cd; color: #856404;' : 
                    investment.status === 'active' ? 'background: #d4edda; color: #155724;' : 
                    investment.status === 'denied' ? 'background: #f8d7da; color: #721c24;' : 
                    'background: #e2e3e5; color: #383d41;'}
                ">
                  ${investment.status === 'pending' ? '⏳ Pending' : 
                    investment.status === 'active' ? '✅ Active' : 
                    investment.status === 'denied' ? '❌ Denied' : 
                    investment.status}
                </span>
              </div>
              <div><strong>Total Value:</strong> K${totalValue.toFixed(2)}</div>
              ${investment.wallet ? `<div><strong>Payment Method:</strong> ${walletDisplay}</div>` : ''}
              ${investment.transaction_txt ? `<div><strong>Transaction TXT:</strong> <code style="font-size: 0.9rem; background: #f8f9fa; padding: 2px 6px; border-radius: 3px;">${investment.transaction_txt}</code></div>` : ''}
            </div>
            ${investment.status === 'active' ? `
              <button class="btn btn-success mt-20" onclick="withdrawInvestment(${investment.id})">
                Withdraw K${totalValue.toFixed(2)}
              </button>
            ` : ''}
          </div>
        `;
      }).join('');
    }

    // Filter out deleted transactions for display (but keep them for balance calculation)
    const visibleTransactions = transactions.filter(t => !t.deleted || t.deleted === 0);
    
    let transactionsHTML = '';
    if (visibleTransactions.length === 0) {
      transactionsHTML = '<p class="empty-state">No transactions yet.</p>';
    } else {
      transactionsHTML = `
        <table class="table">
          <thead>
            <tr><th>Date</th><th>Type</th><th>Amount</th></tr>
          </thead>
          <tbody>
            ${visibleTransactions.map(transaction => `
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

    // Filter to only active investments (exclude deposits which have status 'deposit_completed', 'pending', 'denied', 'terminated')
    const activeInvestments = investments.filter(inv => inv.status === 'active');
    
    dashboardContent.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${activeInvestments.length}</div>
          <div class="stat-label">Active Investments</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">K${activeInvestments.reduce((sum, inv) => sum + (Number(inv.deposit_amount) || 0), 0).toFixed(2)}</div>
          <div class="stat-label">Total Invested</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">K${activeInvestments.reduce((sum, inv) => sum + (Number(inv.total_accruals) || 0), 0).toFixed(2)}</div>
          <div class="stat-label">Total Accruals</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">K${activeInvestments.reduce((sum, inv) => sum + (Number(inv.deposit_amount) || 0) + (Number(inv.total_accruals) || 0), 0).toFixed(2)}</div>
          <div class="stat-label">Total Value</div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin: 30px 0;">
        <h2>My Investments</h2>
        <a href="#" onclick="showSection('levels'); return false;" class="btn">Invest Now</a>
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
    
    // Mark dashboard as loaded
    dashboardContent.dataset.loaded = 'true';
  } catch (error) {
    console.error('Dashboard error:', error);
    showError(dashboardContent, error.message, () => loadInvestmentsDirectly());
  }
}

// Periodically check for deposit status updates
let depositStatusPollInterval = null;
function startDepositStatusPolling() {
  // Clear existing interval if any
  if (depositStatusPollInterval) {
    clearInterval(depositStatusPollInterval);
  }
  
  // Check every 30 seconds for status updates
  depositStatusPollInterval = setInterval(async () => {
    try {
      const data = await authenticatedApiCall(`${window.API_BASE || ''}/api/dashboard`, {
        method: 'GET'
      });
      const investments = data.investments || [];
      checkAndShowPendingDeposits(investments);
    } catch (error) {
      // Silently fail - don't spam errors
      console.log('Deposit status check failed:', error.message);
    }
  }, 30000); // Check every 30 seconds
}

// Helper functions
function calculateDaysLeft(maturityDate) {
  const today = new Date();
  const maturity = new Date(maturityDate);
  const diffTime = maturity - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

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

// Load Levels Section
async function loadLevelsSection() {
  const levelsContent = document.getElementById('levelsContent');
  if (!levelsContent) {
    console.error('Levels content container not found');
    return;
  }
  
  // Show loading state
  showLoading(levelsContent, 'Loading levels...');
  
  try {
    // Load packages - use apiCall for timeout
    const packages = await handleApiResponse(await apiCall(`${window.API_BASE || ''}/api/packages`, {
      method: 'GET'
    }));
    
    if (packages.length === 0) {
      levelsContent.innerHTML = '<p class="empty-state">No levels available</p>';
      return;
    }

    // Sort by level
    packages.sort((a, b) => {
      const levelA = parseInt(a.level?.replace('L', '') || '0');
      const levelB = parseInt(b.level?.replace('L', '') || '0');
      return levelA - levelB;
    });

    // Get user's current level and investments to show which levels are available
    // Use Promise.all to load both in parallel for better performance
    let userCurrentLevel = 'L0';
    let userInvestments = [];
    try {
      const [profileData, dashboardData] = await Promise.all([
        authenticatedApiCall(`${window.API_BASE || ''}/api/profile`, { method: 'GET' }).catch(() => ({ level: 'L0' })),
        authenticatedApiCall(`${window.API_BASE || ''}/api/dashboard`, { method: 'GET' }).catch(() => ({ investments: [] }))
      ]);
      
      userCurrentLevel = profileData.level || 'L0';
      userInvestments = dashboardData.investments || [];
    } catch (error) {
      console.error('Error loading user data:', error);
      // Continue with defaults
    }

    // Get all packages to check which level user is currently on
    const allPackages = packages;
    
    // Find the user's CURRENT level - use profile level as primary source
    // This ensures the tick shows even if deposit records are deleted
    // The user's level in the users table is the source of truth
    const activeInvestment = userInvestments.find(inv => inv.status === 'active');
    let currentActiveLevel = null;
    
    // First try to get from active investment
    if (activeInvestment) {
      const investmentPackage = allPackages.find(p => p.id === activeInvestment.package_id);
      currentActiveLevel = investmentPackage ? investmentPackage.level : null;
    }
    
    // If no active investment found, use the user's level from profile (source of truth)
    // This handles cases where deposit records are deleted but user level remains correct
    if (!currentActiveLevel && userCurrentLevel && userCurrentLevel !== 'L0') {
      currentActiveLevel = userCurrentLevel;
    }

    levelsContent.innerHTML = `
      ${currentActiveLevel ? `
        <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; text-align: center;">
          <strong style="font-size: 1.2rem;">Your Current Level: ${currentActiveLevel}</strong>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">You can switch to any other level below. Your current investment will be terminated when you switch.</p>
        </div>
      ` : `
        <div style="background: linear-gradient(135deg, #007BFF 0%, #0056b3 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; text-align: center;">
          <strong style="font-size: 1.2rem;">Choose Your Investment Level</strong>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Select any level that suits your budget. You can only be on one level at a time.</p>
        </div>
      `}
      <p style="text-align: center; color: #6c757d; margin-bottom: 30px; max-width: 600px; margin-left: auto; margin-right: auto;">
        Select any investment level that matches your budget. Each level offers different daily returns. You can switch levels anytime - your current investment will be terminated and replaced with the new one.
      </p>
      <div style="display: grid; gap: 20px;">
        ${packages.map(pkg => {
          const level = pkg.level || 'L1';
          const amount = pkg.amount;
          const dailyIncome = pkg.daily_income || (pkg.daily_rate * amount);
          const isCurrentLevel = level === currentActiveLevel;
          
          return `
            <div class="card" style="display: grid; grid-template-columns: 100px 1fr 1fr auto; gap: 20px; align-items: center; ${isCurrentLevel ? 'border: 3px solid #28a745; background: #f0fff4;' : ''}">
              <div style="position: relative; width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: bold; color: white; background: ${isCurrentLevel ? 'linear-gradient(135deg, #28a745 0%, #20c997 100%)' : 'linear-gradient(135deg, #007BFF 0%, #0056b3 100%)'};">
                ${level}
                ${isCurrentLevel ? '<div style="position: absolute; top: -5px; right: -5px; background: #28a745; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; border: 2px solid white;">✓</div>' : ''}
              </div>
              <div>
                <strong style="color: #007BFF;">Investment Amount</strong><br>
                <span style="color: #6c757d;">K${amount.toLocaleString()}</span>
              </div>
              <div>
                <strong style="color: #007BFF;">Daily Income</strong><br>
                <span style="color: #28a745; font-weight: bold;">K${dailyIncome.toFixed(2)}/day</span>
              </div>
              <div style="display: flex; gap: 10px;">
                ${isCurrentLevel ? `
                  <button class="btn" disabled style="flex: 1; background: #28a745; border-color: #28a745; cursor: not-allowed;">✓ Current Level</button>
                  <button class="btn" onclick="showDepositModal(${pkg.id}, ${amount})" style="flex: 1; background: #17a2b8; border-color: #17a2b8;">💰 Deposit</button>
                ` : `
                  <button class="btn" onclick="confirmInvestment(${pkg.id}, ${amount}, '${level}')" style="flex: 1;">${currentActiveLevel ? 'Switch to ' + level : 'Invest in ' + level}</button>
                  <button class="btn" onclick="showDepositModal(${pkg.id}, ${amount})" style="flex: 1; background: #28a745; border-color: #28a745;">💰 Deposit</button>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (error) {
    console.error('Error loading levels:', error);
    showError(levelsContent, error.message, () => loadLevelsSection());
  }
}

// Load About Section
async function loadAboutSection() {
  const aboutContent = document.getElementById('aboutContent');
  if (!aboutContent) {
    console.error('About content container not found');
    return;
  }
  
  // Show loading
  showLoading(aboutContent, 'Loading about section...');
  
  try {
    // Fetch certificates - use apiCall for timeout
    let certificates = [];
    try {
      const certificatesResponse = await apiCall(`${window.API_BASE || ''}/api/certificates`, {
        method: 'GET'
      });
      if (certificatesResponse.ok) {
        certificates = await handleApiResponse(certificatesResponse);
      }
    } catch (error) {
      console.error('Error loading certificates:', error);
      // Continue without certificates - not critical
    }
    
    // Check if user is admin
    const user = getUser();
    const isAdmin = user && user.isAdmin;
    
    // Render certificates
    let certificatesHTML = '';
    if (certificates.length > 0) {
      certificatesHTML = certificates.map(cert => {
        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(cert.file_path);
        const isPDF = /\.pdf$/i.test(cert.file_path);
        
        return `
          <div style="border: 2px solid #e9ecef; border-radius: 8px; padding: 20px; text-align: center; background: #f8f9fa; position: relative; transition: all 0.3s;" onmouseover="this.style.borderColor='#007BFF'; this.style.transform='translateY(-5px)'; this.style.boxShadow='0 4px 8px rgba(0,0,0,0.1)';" onmouseout="this.style.borderColor='#e9ecef'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
            ${isAdmin ? `
              <button onclick="deleteCertificate(${cert.id})" style="position: absolute; top: 10px; right: 10px; background: #dc3545; color: white; border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; font-size: 1rem;" title="Delete Certificate">×</button>
            ` : ''}
            <div style="width: 100%; height: 200px; border-radius: 5px; margin-bottom: 10px; overflow: hidden; background: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer;" onclick="viewCertificate('${cert.file_path}', '${cert.title}')">
              ${isImage ? `
                <img src="${cert.file_path}" alt="${cert.title}" style="max-width: 100%; max-height: 100%; object-fit: contain;">
              ` : isPDF ? `
                <div style="text-align: center; color: #dc3545;">
                  <div style="font-size: 4rem; margin-bottom: 10px;">📄</div>
                  <div style="font-size: 0.9rem;">PDF Document</div>
                </div>
              ` : `
                <div style="text-align: center; color: #6c757d;">
                  <div style="font-size: 3rem; margin-bottom: 10px;">📜</div>
                </div>
              `}
            </div>
            <h3 style="margin: 10px 0 5px 0; color: #333;">${cert.title}</h3>
            ${cert.description ? `<p style="color: #6c757d; font-size: 0.9rem; margin: 0;">${cert.description}</p>` : ''}
            <p style="color: #999; font-size: 0.8rem; margin-top: 10px;">${new Date(cert.uploaded_at).toLocaleDateString()}</p>
          </div>
        `;
      }).join('');
    } else {
      certificatesHTML = `
        <div style="text-align: center; padding: 40px; color: #6c757d;">
          <div style="font-size: 4rem; margin-bottom: 20px;">📜</div>
          <p>No certificates uploaded yet.</p>
          ${isAdmin ? '<p style="margin-top: 10px;">Click "Upload Certificate" button above to add certificates.</p>' : ''}
        </div>
      `;
    }
    
    aboutContent.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 10px; margin-bottom: 20px;">
        <h2 style="color: #007BFF; margin-bottom: 20px;">About Us</h2>
        <p style="line-height: 1.8; color: #333; font-size: 1.1rem; margin-bottom: 20px;">
          Zambia Youth Self Employment is a forward-thinking investment platform dedicated to empowering 
          Zambian youth through digital financial opportunities. Our mission is to provide accessible, 
          transparent, and rewarding investment options that enable young people to build financial 
          independence and secure their future.
        </p>
        <p style="line-height: 1.8; color: #333; font-size: 1.1rem; margin-bottom: 20px;">
          We believe in the power of digital innovation to transform lives. Through our tiered investment 
          system, we offer multiple levels of engagement, allowing youth to start small and grow their 
          investments over time. Each investment offers daily returns and continues earning income, 
          ensuring sustainable growth and daily accruals that compound to create meaningful returns.
        </p>
        <p style="line-height: 1.8; color: #333; font-size: 1.1rem;">
          Our platform is built on principles of transparency, security, and empowerment. We are committed 
          to providing a safe and reliable environment where Zambian youth can invest with confidence and 
          watch their money grow through smart digital strategies.
        </p>
      </div>

      <div style="background: white; padding: 30px; border-radius: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="color: #007BFF; margin: 0;">Company Certificates</h2>
          ${isAdmin ? `
            <button class="btn" onclick="uploadCertificate()" style="padding: 10px 20px;">
              📤 Upload Certificate
            </button>
          ` : ''}
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px;">
          ${certificatesHTML}
        </div>
      </div>
    `;
    
    // Make functions globally available
    window.viewCertificate = function(filePath, title) {
      const isPDF = /\.pdf$/i.test(filePath);
      if (isPDF) {
        window.open(filePath, '_blank');
      } else {
        // Show image in modal
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; z-index: 10000; cursor: pointer;';
        modal.innerHTML = `
          <div style="max-width: 90%; max-height: 90%; position: relative;">
            <button onclick="this.parentElement.parentElement.remove()" style="position: absolute; top: -40px; right: 0; background: white; border: none; border-radius: 50%; width: 35px; height: 35px; font-size: 1.5rem; cursor: pointer; color: #333;">×</button>
            <img src="${filePath}" alt="${title}" style="max-width: 100%; max-height: 90vh; object-fit: contain;">
            <p style="color: white; text-align: center; margin-top: 10px;">${title}</p>
          </div>
        `;
        modal.onclick = function(e) {
          if (e.target === modal) modal.remove();
        };
        document.body.appendChild(modal);
      }
    };
    
    window.uploadCertificate = function() {
      const formHTML = `
        <div style="padding: 20px;">
          <h3 style="margin-bottom: 20px; color: #007BFF;">Upload Certificate</h3>
          <div class="form-group">
            <label>Certificate Title:</label>
            <input type="text" id="certTitle" placeholder="e.g., ASIC Registration Certificate" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: #fff;" required>
          </div>
          <div class="form-group" style="margin-top: 15px;">
            <label>Description (optional):</label>
            <textarea id="certDescription" placeholder="Brief description of the certificate" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; min-height: 80px; color: #333; background: #fff;"></textarea>
          </div>
          <div class="form-group" style="margin-top: 15px;">
            <label>Certificate File (Image or PDF, max 10MB):</label>
            <input type="file" id="certFile" accept="image/*,.pdf" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" required>
          </div>
          <div style="margin-top: 20px; text-align: right;">
            <button onclick="document.getElementById('uploadCertModal').remove()" class="btn btn-secondary" style="margin-right: 10px;">Cancel</button>
            <button onclick="saveCertificate()" class="btn">Upload</button>
          </div>
        </div>
      `;
      
      const modal = document.createElement('div');
      modal.id = 'uploadCertModal';
      modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
      modal.innerHTML = `
        <div style="background: white; border-radius: 8px; max-width: 600px; width: 90%; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          ${formHTML}
        </div>
      `;
      document.body.appendChild(modal);
      
      window.saveCertificate = function() {
        const title = document.getElementById('certTitle').value.trim();
        const description = document.getElementById('certDescription').value.trim();
        const fileInput = document.getElementById('certFile');
        const file = fileInput.files[0];
        
        if (!title) {
          showAlert('Please enter a certificate title');
          return;
        }
        
        if (!file) {
          showAlert('Please select a file');
          return;
        }
        
        if (file.size > 10 * 1024 * 1024) {
          showAlert('File size must be less than 10MB');
          return;
        }
        
        const formData = new FormData();
        formData.append('certificate', file);
        formData.append('title', title);
        if (description) formData.append('description', description);
        
        const btn = event.target;
        btn.disabled = true;
        btn.textContent = 'Uploading...';
        
        // Get auth token for file upload (don't set Content-Type for FormData)
        const token = localStorage.getItem('token');
        fetch(`${window.API_BASE || ''}/api/certificates`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
            // Don't set Content-Type - browser will set it with boundary for FormData
          },
          body: formData
        })
        .then(async response => {
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || `Upload failed: ${response.status} ${response.statusText}`);
          }
          return data;
        })
        .then(data => {
          showAlert('Certificate uploaded successfully!', 'Success');
          document.getElementById('uploadCertModal').remove();
          loadAboutSection();
        })
        .catch(error => {
          console.error('Upload error:', error);
          showAlert('Error: ' + (error.message || 'Failed to upload certificate. Please check:\n- File type (JPG, PNG, GIF, WEBP, PDF)\n- File size (max 10MB)\n- You are logged in as admin'), 'Upload Failed');
          btn.disabled = false;
          btn.textContent = 'Upload';
        });
      };
    };
    
    window.deleteCertificate = async function(certId) {
      const confirmed = await showConfirm('Are you sure you want to delete this certificate?', 'Delete Certificate');
      if (!confirmed) {
        return;
      }
      
      fetch(`${window.API_BASE || ''}/api/certificates/${certId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          showAlert('Error: ' + data.error, 'Delete Failed');
        } else {
          showAlert('Certificate deleted successfully!', 'Success');
          loadAboutSection();
        }
      })
      .catch(error => {
        console.error('Delete error:', error);
        showAlert('Failed to delete certificate', 'Delete Failed');
      });
    };
  } catch (error) {
    console.error('Error loading about section:', error);
    showError(aboutContent, error.message, () => loadAboutSection());
  }
}

// Helper function to get display name (excludes admin email and email-like values)
function getDisplayName(profileData, user) {
  // Priority: profileData.full_name > profileData.phone > user.phone > 'User'
  // Never use email as display name, especially not admin email
  // Also filter out if full_name looks like an email address
  
  // Check if full_name is valid (not an email, not admin email)
  if (profileData && profileData.full_name && profileData.full_name.trim()) {
    const fullName = profileData.full_name.trim();
    // Don't use if it looks like an email address
    if (!fullName.includes('@') && fullName !== 'admin@zambia-youth.com') {
      return fullName;
    }
  }
  
  // Use phone number if available
  if (profileData && profileData.phone && profileData.phone.trim()) {
    return profileData.phone;
  }
  if (user && user.phone && user.phone.trim() && user.phone !== 'admin@zambia-youth.com') {
    return user.phone;
  }
  
  return 'User';
}

// Load Me Section
async function loadMeSection() {
  const meContent = document.getElementById('meContent');
  if (!meContent) {
    console.error('Me content container not found');
    return;
  }
  
  // Check if already loaded
  if (meContent.dataset.loaded === 'true') {
    return;
  }
  
  // Show loading state
  showLoading(meContent, 'Loading profile...');
  
  try {
    // Get user data
    const user = getUser();
    if (!user) {
      throw new Error('User data not found. Please log in again.');
    }

    // Check if token exists
    const token = localStorage.getItem('token');
    if (!token) {
      localStorage.removeItem('user');
      throw new Error('No authentication token found. Please log in again.');
    }

    // Get dashboard data for stats - use authenticatedApiCall for better error handling
    const data = await authenticatedApiCall(`${window.API_BASE || ''}/api/dashboard`, {
      method: 'GET'
    });
    const investments = data.investments || [];
    const transactions = data.transactions || [];

    // Calculate stats
    // Calculate balance: deposits + accruals + bonuses - withdrawals - investments from balance
    // CRITICAL: Include ALL transactions (including deleted ones) for accurate balance calculation
    // Deleted transactions are marked as deleted=1 but MUST still count toward balance
    // DO NOT filter by deleted status in balance calculations - only filter for display
    const totalDeposits = (transactions || [])
      .filter(t => t && t.type === 'deposit' && t.amount > 0)
      // Note: NOT filtering by deleted - deleted deposits still count toward balance
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    // Total Invested: Only count ACTIVE investments (exclude deposits which have status 'deposit_completed', 'pending', or 'denied')
    const totalInvested = (investments || [])
      .filter(inv => inv.status === 'active')
      .reduce((sum, inv) => sum + (Number(inv?.deposit_amount) || 0), 0);
    const totalWithdrawn = (transactions || [])
      .filter(t => t && t.type === 'withdrawal')
      // Note: NOT filtering by deleted - deleted withdrawals still count toward balance
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
    // Include ALL accrual and bonus transactions (regardless of investment_id or deleted status)
    // This ensures all daily income, bonuses, and any other income is included in balance
    const allAccrualsAndBonuses = (transactions || [])
      .filter(t => t && (t.type === 'accrual' || t.type === 'bonus'))
      // Note: NOT filtering by deleted - deleted accruals/bonuses still count toward balance
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
    const investmentsFromBalance = (transactions || [])
      .filter(t => t && t.type === 'investment')
      // Note: NOT filtering by deleted - deleted investments still count toward balance
      .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
    
    // For display purposes, also calculate from investments (for backward compatibility)
    const totalAccruals = (investments || []).reduce((sum, inv) => sum + (Number(inv?.total_accruals) || 0), 0);
    const standaloneAccruals = (transactions || [])
      .filter(t =>
        t &&
        (t.type === 'accrual' || t.type === 'bonus') &&
        (
          t.investment_id === null ||
          t.investment_id === undefined ||
          t.investment_id === '' ||
          t.investment_id === 'null' ||
          t.investment_id === 0 ||
          t.investment_id === '0'
        )
      )
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
    const totalProfit = (totalAccruals || 0) + (standaloneAccruals || 0);
    const totalBonuses = (transactions || [])
      .filter(t => t && t.type === 'bonus')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const dailyIncomeEarned = (transactions || [])
      .filter(t => t && t.type === 'accrual')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
    // Balance = deposits + ALL accruals and bonuses - withdrawals - investments from balance
    // Use allAccrualsAndBonuses to ensure EVERY income transaction is included
    const currentBalance = (totalDeposits || 0) + (allAccrualsAndBonuses || 0) - (totalWithdrawn || 0) - (investmentsFromBalance || 0);

    // Get user profile - use authenticatedApiCall for consistent error handling
    let profileData = { full_name: '', phone: '', level: 'L1', withdrawal_wallet: '', withdrawal_phone: '', profile_picture: '', has_withdrawal_password: false };
    try {
      profileData = await authenticatedApiCall(`${window.API_BASE || ''}/api/profile`, {
        method: 'GET'
      });
    } catch (error) {
      console.warn('Profile fetch failed:', error);
      // Continue with defaults if profile fetch fails
    }

    // Generate referral link using phone number (unique for each user)
    const referralLink = `${window.location.origin}/index.html#/register?ref=${encodeURIComponent(profileData.phone || '')}`;

    // Render profile
    const profilePictureUrl = profileData.profile_picture || '';
    const profilePictureDisplay = profilePictureUrl 
      ? `<img src="${profilePictureUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
      : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 3rem;">👤</div>`;

    meContent.innerHTML = `
      <div style="background: linear-gradient(135deg, #007BFF 0%, #0056b3 100%); color: white; padding: 40px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
        <div style="position: relative; width: 120px; height: 120px; margin: 0 auto 20px;">
          <div style="width: 120px; height: 120px; border-radius: 50%; background: rgba(255,255,255,0.2); border: 4px solid white; overflow: hidden; position: relative;">
            ${profilePictureDisplay}
          </div>
          <button onclick="uploadProfilePicture()" style="position: absolute; bottom: 0; right: 0; width: 36px; height: 36px; border-radius: 50%; background: #28a745; border: 3px solid white; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; box-shadow: 0 2px 4px rgba(0,0,0,0.2);" title="Update Profile Picture">
            📷
          </button>
        </div>
        <h2 style="color: white; margin-bottom: 10px;">${getDisplayName(profileData, user)}</h2>
        <p style="margin-top: 10px;">
          <span style="display: inline-block; padding: 10px 20px; background: rgba(255,255,255,0.2); border-radius: 20px; font-weight: bold; font-size: 1.2rem;">
            ${profileData.level || 'L1'}
          </span>
        </p>
      </div>

      <div class="stats-grid" style="margin-bottom: 30px;">
        <div class="stat-card">
          <div class="stat-value">K${currentBalance.toFixed(2)}</div>
          <div class="stat-label">Current Balance</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">K${dailyIncomeEarned.toFixed(2)}</div>
          <div class="stat-label">Daily Income Earned</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">K${totalWithdrawn.toFixed(2)}</div>
          <div class="stat-label">Total Withdrawn</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">K${totalProfit.toFixed(2)}</div>
          <div class="stat-label">Total Profit</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">K${totalBonuses.toFixed(2)}</div>
          <div class="stat-label">Bonuses</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">K${totalInvested.toFixed(2)}</div>
          <div class="stat-label">Total Invested</div>
        </div>
      </div>

      <!-- Deposit and Withdraw Buttons -->
      <div style="text-align: center; margin: 30px 0; display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
        <button 
          class="btn btn-success" 
          onclick="showDepositOptionsModal()" 
          style="
            background: linear-gradient(135deg, #17a2b8 0%, #138496 100%); 
            color: white; 
            padding: 15px 40px; 
            border: none; 
            border-radius: 8px; 
            cursor: pointer; 
            font-weight: bold; 
            font-size: 1.2rem; 
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
          "
        >
          💳 Deposit
        </button>
        <button 
          class="btn btn-success" 
          onclick="showSection('withdraw')" 
          style="
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
            color: white; 
            padding: 15px 40px; 
            border: none; 
            border-radius: 8px; 
            cursor: pointer; 
            font-weight: bold; 
            font-size: 1.2rem; 
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
          "
        >
          💰 Withdraw
        </button>
      </div>

      <div class="profile-info" style="margin-bottom: 20px;">
        <h3 style="color: #007BFF; margin-bottom: 20px;">Profile Information</h3>
        <div class="info-row">
          <span class="info-label">Full Name:</span>
          <span class="info-value">${profileData.full_name || 'Not set'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Phone Number:</span>
          <span class="info-value">${profileData.phone || user.phone || 'Not set'}</span>
        </div>
        ${(user.email && user.email !== 'admin@zambia-youth.com') || (profileData.email && profileData.email !== 'admin@zambia-youth.com') ? `
        <div class="info-row">
          <span class="info-label">Email:</span>
          <span class="info-value">${profileData.email || user.email}</span>
        </div>
        ` : ''}
        <div class="info-row">
          <span class="info-label">Current Level:</span>
          <span class="info-value">
            <span style="display: inline-block; padding: 5px 15px; background: #007BFF; color: white; border-radius: 15px; font-weight: bold;">
              ${profileData.level || 'L1'}
            </span>
          </span>
        </div>
        <div class="info-row">
          <span class="info-label">Active Investments:</span>
          <span class="info-value">${investments.length}</span>
        </div>
      </div>

      <div class="profile-info" style="margin-bottom: 20px;">
        <h3 style="color: #007BFF; margin-bottom: 20px;">Withdrawal Settings</h3>
        <div class="info-row">
          <span class="info-label">Withdrawal Password:</span>
          <span class="info-value">
            ${profileData.has_withdrawal_password ? 
              '<span style="color: #28a745;">✓ Set</span>' : 
              '<span style="color: #dc3545;">✗ Not set</span>'}
          </span>
        </div>
        <div class="info-row">
          <span class="info-label">Withdrawal Wallet:</span>
          <span class="info-value">
            ${profileData.withdrawal_wallet ? 
              `<span style="text-transform: uppercase;">${profileData.withdrawal_wallet}</span>` : 
              '<span style="color: #dc3545;">Not set</span>'}
          </span>
        </div>
        <div class="info-row">
          <span class="info-label">Withdrawal Phone:</span>
          <span class="info-value">
            ${profileData.withdrawal_phone ? 
              `<span>${profileData.withdrawal_phone}</span>` : 
              '<span style="color: #dc3545;">Not set</span>'}
          </span>
        </div>
      </div>

      <div class="profile-info" style="margin-bottom: 20px; background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 25px; border-radius: 10px; color: white;">
        <h3 style="color: white; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.5rem;">🎁</span>
          Invite Friends & Earn
        </h3>
        <p style="margin-bottom: 20px; line-height: 1.6;">
          Share your referral link with friends and family. When they join using your link, they'll be automatically linked to your account!
        </p>
        ${profileData.phone ? `
          <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 8px; font-weight: bold; font-size: 0.9rem;">Your Referral Link:</label>
            <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
              <input 
                type="text" 
                id="referralLinkInput" 
                readonly 
                value="${referralLink}" 
                style="flex: 1; min-width: 250px; padding: 12px; border: 2px solid rgba(255,255,255,0.3); border-radius: 5px; background: rgba(255,255,255,0.9); color: #333; font-size: 0.9rem; cursor: text;"
                onclick="this.select();"
              />
              <button 
                onclick="copyReferralLink()" 
                class="btn" 
                style="background: white; color: #28a745; padding: 12px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; white-space: nowrap;"
                id="copyReferralBtn"
              >
                📋 Copy Link
              </button>
            </div>
            <div style="margin-top: 10px; font-size: 0.85rem; opacity: 0.9;">
              💡 Share this link via WhatsApp, SMS, or any messaging app
            </div>
          </div>
          <div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 8px; font-size: 0.9rem;">
            <strong>Your Referral Code:</strong> <span style="font-family: monospace; font-size: 1.1rem; font-weight: bold; background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px;">${profileData.phone}</span>
            <div style="margin-top: 8px; font-size: 0.85rem; opacity: 0.9;">
              They can also manually enter this phone number when registering
            </div>
          </div>
        ` : `
          <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; text-align: center;">
            <p style="margin: 0;">
              <strong>⚠️ Phone number required:</strong> Please add your phone number in your profile to generate your referral link.
            </p>
            <button class="btn" onclick="editProfileFromMe()" style="margin-top: 15px; background: white; color: #28a745;">
              Add Phone Number
            </button>
          </div>
        `}
      </div>

      <div class="profile-info" style="margin-bottom: 20px; background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); padding: 25px; border-radius: 10px; color: white;">
        <h3 style="color: white; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.5rem;">🔒</span>
          Change Password
        </h3>
        <p style="margin-bottom: 20px; line-height: 1.6; opacity: 0.95;">
          Keep your account secure by changing your password regularly. Make sure to use a strong password that you can remember.
        </p>
        <button 
          onclick="showChangePasswordForm()" 
          class="btn" 
          style="background: white; color: #ff9800; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 1rem;"
        >
          Change Password
        </button>
      </div>

      <div style="text-align: center; margin-top: 30px;">
        <button class="btn btn-secondary" onclick="editProfileFromMe()" style="margin-right: 10px;">
          Edit Profile
        </button>
        <button class="btn" onclick="editWithdrawalSettingsFromMe()" style="margin-right: 10px;">
          Withdrawal Settings
        </button>
      </div>
    `;

    // Make copyReferralLink function available
    window.copyReferralLink = function() {
      const input = document.getElementById('referralLinkInput');
      const btn = document.getElementById('copyReferralBtn');
      
      if (!input) return;
      
      // Select and copy
      input.select();
      input.setSelectionRange(0, 99999); // For mobile devices
      
      try {
        document.execCommand('copy');
        
        // Update button text
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Copied!';
        btn.style.background = '#28a745';
        btn.style.color = 'white';
        
        // Reset after 2 seconds
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.background = 'white';
          btn.style.color = '#28a745';
        }, 2000);
      } catch (err) {
        // Fallback: Use modern Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(input.value).then(() => {
            const originalText = btn.innerHTML;
            btn.innerHTML = '✅ Copied!';
            btn.style.background = '#28a745';
            btn.style.color = 'white';
            setTimeout(() => {
              btn.innerHTML = originalText;
              btn.style.background = 'white';
              btn.style.color = '#28a745';
            }, 2000);
          }).catch(err => {
            console.error('Failed to copy:', err);
            showAlert('Failed to copy link. Please select and copy manually.');
          });
        } else {
          showAlert('Copy not supported. Please select and copy manually.');
        }
      }
    };

    // Make uploadProfilePicture function available
    window.uploadProfilePicture = function() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/jpg,image/png,image/gif,image/webp';
      input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
          showAlert('File size must be less than 5MB');
          return;
        }

        // Show loading
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '⏳';

        // Create form data
        const formData = new FormData();
        formData.append('profilePicture', file);

        // Upload (don't set Content-Type for FormData)
        const token = localStorage.getItem('token');
        fetch(`${window.API_BASE || ''}/api/profile/picture`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
            // Don't set Content-Type - browser will set it with boundary for FormData
          },
          body: formData
        })
        .then(response => response.json())
        .then(data => {
          if (data.error) {
            showAlert('Error: ' + data.error);
            btn.disabled = false;
            btn.innerHTML = originalText;
          } else {
            showAlert('Profile picture updated successfully!');
            // Reload me section
            const meContent = document.getElementById('meContent');
            if (meContent) {
              meContent.dataset.loaded = 'false';
              loadMeSection();
            }
          }
        })
        .catch(error => {
          console.error('Upload error:', error);
          showAlert('Failed to upload profile picture');
          btn.disabled = false;
          btn.innerHTML = originalText;
        });
      };
      input.click();
    };

    // Mark as loaded
    meContent.dataset.loaded = 'true';
  } catch (error) {
    console.error('Error loading me section:', error);
    const isAuthError = error.message.includes('Session expired') || error.message.includes('invalid') || error.message.includes('log in');
    const errorMessage = isAuthError 
      ? `${error.message}<br><br><a href="/index.html" style="color: #007BFF; text-decoration: underline;">Click here to log in again</a>`
      : `${error.message}<br><br>Please try refreshing the page or contact support if the problem persists.`;
    showError(meContent, errorMessage, () => loadMeSection());
    meContent.dataset.loaded = 'false';
  }
}

// Load Withdraw Section
async function loadWithdrawSection() {
  const withdrawContent = document.getElementById('withdrawContent');
  if (!withdrawContent) return;

  // Check if already loaded
  if (withdrawContent.dataset.loaded === 'true') {
    return;
  }

  // Show loading state
  showLoading(withdrawContent, 'Loading withdrawal form...');

  try {
    // Get user profile and balance - use authenticatedApiCall for better error handling
    const [profileData, dashboardData] = await Promise.all([
      authenticatedApiCall(`${window.API_BASE || ''}/api/profile`, { method: 'GET' }),
      authenticatedApiCall(`${window.API_BASE || ''}/api/dashboard`, { method: 'GET' })
    ]);

    // Check if withdrawal settings are configured
    if (!profileData.withdrawal_wallet) {
      withdrawContent.innerHTML = `
        <div class="message error">
          <h3>Withdrawal Settings Not Configured</h3>
          <p>Please configure your withdrawal wallet in Withdrawal Settings first.</p>
          <button class="btn" onclick="showSection('me'); setTimeout(() => { editWithdrawalSettingsFromMe(); }, 500);" style="margin-top: 15px;">
            Go to Settings
          </button>
        </div>
      `;
      return;
    }
    
    if (!profileData.has_withdrawal_password) {
      withdrawContent.innerHTML = `
        <div class="message error">
          <h3>Withdrawal Password Not Set</h3>
          <p>Please set a withdrawal password in Withdrawal Settings first.</p>
          <button class="btn" onclick="showSection('me'); setTimeout(() => { editWithdrawalSettingsFromMe(); }, 500);" style="margin-top: 15px;">
            Go to Settings
          </button>
        </div>
      `;
      return;
    }

    // Calculate current balance: deposits + accruals + bonuses - withdrawals - investments from balance
    const investments = dashboardData.investments || [];
    const transactions = dashboardData.transactions || [];
    const totalDeposits = (transactions || [])
      .filter(t => t && t.type === 'deposit' && t.amount > 0)
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const totalWithdrawn = (transactions || [])
      .filter(t => t && t.type === 'withdrawal')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
    // Include ALL accrual and bonus transactions (regardless of investment_id)
    // This ensures all daily income, bonuses, and any other income is included in balance
    const allAccrualsAndBonuses = (transactions || [])
      .filter(t => t && (t.type === 'accrual' || t.type === 'bonus'))
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
    const investmentsFromBalance = (transactions || [])
      .filter(t => t && t.type === 'investment')
      .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
    
    // Balance = deposits + ALL accruals and bonuses - withdrawals - investments from balance
    const currentBalance = (totalDeposits || 0) + (allAccrualsAndBonuses || 0) - (totalWithdrawn || 0) - (investmentsFromBalance || 0);

    // Display wallet and phone
    const walletDisplay = profileData.withdrawal_wallet ? profileData.withdrawal_wallet.toUpperCase() : 'Not set';
    const phoneDisplay = profileData.phone || profileData.withdrawal_phone || 'Not set';
    const walletIcon = walletDisplay === 'AIRTEL' ? '📱' : walletDisplay === 'MTN' ? '📱' : '';

    withdrawContent.innerHTML = `
      <div style="position: relative; min-height: 500px;">
        <!-- Withdraw Records Button - Left Corner -->
        <button 
          onclick="showWithdrawalRecordsModal()" 
          class="btn"
          style="
            position: absolute; 
            top: 0; 
            left: 0; 
            background: #007BFF; 
            color: white; 
            padding: 10px 20px; 
            border: none; 
            border-radius: 5px; 
            cursor: pointer; 
            font-weight: bold;
            z-index: 10;
          "
        >
          📋 Withdraw Records
        </button>

        <!-- Main Withdrawal Form -->
        <div style="max-width: 600px; margin: 0 auto; padding-top: 60px;">
          <!-- Mobile Wallet Display at Top -->
          <div style="background: linear-gradient(135deg, #007BFF 0%, #0056b3 100%); padding: 30px; border-radius: 10px; color: white; margin-bottom: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: white; margin: 0 0 20px 0; display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 2rem;">${walletIcon}</span>
              Mobile Wallet
            </h2>
            <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
              <p style="margin: 5px 0; font-size: 0.9rem; opacity: 0.9;">Wallet Type:</p>
              <p style="margin: 5px 0; font-size: 1.3rem; font-weight: bold;">${walletDisplay === 'AIRTEL' ? 'Airtel Money' : walletDisplay === 'MTN' ? 'MTN Mobile Money' : walletDisplay}</p>
            </div>
            <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px;">
              <p style="margin: 5px 0; font-size: 0.9rem; opacity: 0.9;">Phone Number:</p>
              <p style="margin: 5px 0; font-size: 1.3rem; font-weight: bold;">${phoneDisplay}</p>
            </div>
          </div>

          <!-- Withdrawal Information -->
          <div style="background: #fff3cd; border-left: 4px solid #ff9800; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <h3 style="color: #856404; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.5rem;">ℹ️</span>
              Withdrawal Information
            </h3>
            <div style="color: #856404; line-height: 1.8; font-size: 0.95rem;">
              <p style="margin: 8px 0;"><strong>📅 Withdrawal Hours:</strong> Monday to Friday, 10:00hrs to 17:00hrs</p>
              <p style="margin: 8px 0;"><strong>💰 Minimum Amount:</strong> Zmw50</p>
              <p style="margin: 8px 0;"><strong>⏱️ Processing Time:</strong> May take up to 48 hours depending on the number of pending withdrawals</p>
              <p style="margin: 8px 0;"><strong>📊 Tax Information:</strong> Zambia Youth Self Employment is a global financial investment company. Your income is subject to personal income tax of 12% to the local government.</p>
              <p style="margin: 8px 0;"><strong>⚠️ Important:</strong> Please check your withdrawal information carefully before withdrawing money. If the withdrawal fails, please reconfirm your withdrawal information.</p>
              <p style="margin: 8px 0;"><strong>🔒 Security:</strong> Please make deposits and withdrawals through the Zambia Youth Self Employment APP. Do not send money to anyone personally.</p>
            </div>
          </div>

          <!-- Withdrawal Form -->
          <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div class="form-group">
              <label style="display: block; margin-bottom: 10px; font-weight: bold; color: #333;">Withdrawal Amount (Minimum Zmw50):</label>
              <input 
                type="number" 
                id="withdrawAmount" 
                min="50"
                placeholder="Enter withdrawal amount (minimum 50)" 
                step="0.01" 
                max="${currentBalance.toFixed(2)}" 
                style="width: 100%; padding: 15px; border: 2px solid #ddd; border-radius: 8px; font-size: 1.1rem; color: #333; background: #fff;"
                onchange="calculateWithdrawalOnPage()" 
                oninput="calculateWithdrawalOnPage()"
                onkeyup="calculateWithdrawalOnPage()"
              >
              <small style="color: #6c757d; display: block; margin-top: 5px;">Available Balance: K${currentBalance.toFixed(2)}</small>
              <div id="amountErrorMsg" style="display: none; margin-top: 8px; padding: 10px; background: #f8d7da; color: #721c24; border-radius: 5px; border-left: 4px solid #dc3545;">
                <strong>⚠️ Low Balance:</strong> Minimum withdrawal amount is Zmw50. Please enter an amount of 50 or more.
              </div>
            </div>
            
            <!-- Calculation Display - Always visible when amount is entered -->
            <div id="withdrawalCalculationOnPage" style="margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 8px; display: none;">
              <h4 style="margin: 0 0 15px 0; color: #333; font-size: 1.1rem;">Withdrawal Breakdown</h4>
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #ddd;">
                <span style="font-weight: bold; color: #333;">Amount to Withdraw:</span>
                <strong id="grossAmountOnPage" style="color: #007BFF; font-size: 1.1rem;">K0.00</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #ddd;">
                <span style="font-weight: bold; color: #333;">Service Fee (12%):</span>
                <strong id="chargeAmountOnPage" style="color: #dc3545; font-size: 1.1rem;">-K0.00</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin-top: 15px; padding-top: 15px; border-top: 2px solid #007BFF; font-size: 1.3rem; background: #e7f3ff; padding: 15px; border-radius: 5px;">
                <span style="font-weight: bold; color: #007BFF;">You Will Receive:</span>
                <strong id="netAmountOnPage" style="color: #28a745; font-size: 1.4rem;">K0.00</strong>
              </div>
              <div id="calculationNote" style="margin-top: 12px; padding: 10px; background: #fff3cd; border-radius: 5px; border-left: 4px solid #ff9800; display: none;">
                <small style="color: #856404; font-size: 0.9rem;">
                  <strong>Note:</strong> The 12% fee is deducted automatically. The amount shown above is what will be sent to your mobile wallet.
                </small>
              </div>
            </div>
            
            <div class="form-group" style="margin-top: 25px;">
              <label style="display: block; margin-bottom: 10px; font-weight: bold; color: #333;">Withdrawal Password:</label>
              <input 
                type="password" 
                id="withdrawPasswordOnPage" 
                placeholder="Enter your withdrawal password" 
                style="width: 100%; padding: 15px; border: 2px solid #ddd; border-radius: 8px; font-size: 1.1rem; color: #333; background: #fff;"
              >
            </div>
            
            <div style="margin-top: 30px; text-align: center;">
              <button 
                onclick="processWithdrawalOnPage(${currentBalance.toFixed(2)})" 
                class="btn btn-success" 
                style="
                  background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
                  color: white; 
                  padding: 15px 50px; 
                  border: none; 
                  border-radius: 8px; 
                  cursor: pointer; 
                  font-size: 1.2rem; 
                  font-weight: bold;
                  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                "
              >
                💰 Withdraw
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    withdrawContent.dataset.loaded = 'true';
  } catch (error) {
    console.error('Error loading withdraw section:', error);
    showError(withdrawContent, error.message, () => loadWithdrawSection());
    withdrawContent.dataset.loaded = 'false';
  }
}

// Calculate withdrawal on page - Instant calculation
window.calculateWithdrawalOnPage = function() {
  const amountInput = document.getElementById('withdrawAmount');
  const amount = parseFloat(amountInput.value) || 0;
  const calculationDiv = document.getElementById('withdrawalCalculationOnPage');
  const errorMsg = document.getElementById('amountErrorMsg');
  const calculationNote = document.getElementById('calculationNote');
  
  // Always show calculation if amount is entered (even if invalid)
  if (amount > 0) {
    // Calculate 12% fee
    const charge = amount * 0.12;
    const net = amount - charge;
    
    // Update calculation display
    document.getElementById('grossAmountOnPage').textContent = `K${amount.toFixed(2)}`;
    document.getElementById('chargeAmountOnPage').textContent = `-K${charge.toFixed(2)}`;
    document.getElementById('netAmountOnPage').textContent = `K${net.toFixed(2)}`;
    
    // Show calculation
    calculationDiv.style.display = 'block';
    calculationNote.style.display = 'block';
    
    // Validate minimum amount
    if (amount < 50) {
      // Show error message
      errorMsg.style.display = 'block';
      amountInput.style.borderColor = '#dc3545';
      amountInput.style.borderWidth = '2px';
      
      // Highlight calculation in red to show it's invalid
      calculationDiv.style.background = '#fff5f5';
      calculationDiv.style.border = '2px solid #dc3545';
      document.getElementById('netAmountOnPage').style.color = '#dc3545';
    } else {
      // Hide error message
      errorMsg.style.display = 'none';
      amountInput.style.borderColor = '#28a745';
      amountInput.style.borderWidth = '2px';
      
      // Show valid calculation in green
      calculationDiv.style.background = '#f8f9fa';
      calculationDiv.style.border = '1px solid #ddd';
      document.getElementById('netAmountOnPage').style.color = '#28a745';
    }
  } else {
    // Hide calculation if no amount entered
    calculationDiv.style.display = 'none';
    errorMsg.style.display = 'none';
    amountInput.style.borderColor = '#ddd';
    amountInput.style.borderWidth = '2px';
  }
};

// Process withdrawal on page
window.processWithdrawalOnPage = async function(maxBalance) {
  const amountInput = document.getElementById('withdrawAmount');
  const amount = parseFloat(amountInput.value) || 0;
  const password = document.getElementById('withdrawPasswordOnPage').value;

  // Validate amount
  if (!amount || amount <= 0) {
    showAlert('⚠️ Please enter a withdrawal amount', 'Missing Information');
    amountInput.focus();
    return;
  }

  if (amount < 50) {
    showAlert('⚠️ Low Balance: Minimum withdrawal amount is Zmw50. Please enter an amount of 50 or more.', 'Minimum Amount Required');
    amountInput.focus();
    return;
  }

  if (amount > maxBalance) {
    showAlert('⚠️ Withdrawal amount exceeds available balance. Available balance: K' + maxBalance.toFixed(2), 'Insufficient Balance');
    amountInput.focus();
    return;
  }

  if (!password) {
    showAlert('⚠️ Please enter your withdrawal password', 'Missing Password');
    document.getElementById('withdrawPasswordOnPage').focus();
    return;
  }
  
  // Calculate breakdown for confirmation
  const charge = amount * 0.12;
  const net = amount - charge;
  
  // Get wallet type from page
  let walletType = 'mobile wallet';
  try {
    const walletElement = document.querySelector('[style*="Mobile Wallet"]')?.parentElement;
    if (walletElement) {
      const walletText = walletElement.textContent || '';
      if (walletText.includes('Airtel')) walletType = 'Airtel Money';
      else if (walletText.includes('MTN')) walletType = 'MTN Mobile Money';
    }
  } catch (e) {
    // Fallback to default
  }
  
  // Show confirmation with breakdown
  const confirmMsg = `Confirm Withdrawal?\n\n` +
    `Amount to Withdraw: K${amount.toFixed(2)}\n` +
    `Service Fee (12%): K${charge.toFixed(2)}\n` +
    `─────────────────────────\n` +
    `You Will Receive: K${net.toFixed(2)}\n\n` +
    `This will be sent to your ${walletType}.`;
  
  const confirmed = await showConfirm(confirmMsg, 'Confirm Withdrawal');
  if (!confirmed) {
    return;
  }

  // Disable button
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Processing...';

  // Get user's first active investment or create standalone withdrawal
  authenticatedApiCall(`${window.API_BASE || ''}/api/dashboard`, {
    method: 'GET'
  })
  .then(dashboardData => {
    const investments = dashboardData.investments || [];
    // Use first active investment if available, otherwise use null (standalone)
    const investmentId = investments.length > 0 ? investments[0].id : null;

    // Build request body - only include investmentId if it exists
    const requestBody = {
      withdrawal_password: password,
      amount: amount
    };
    
    // Only add investmentId if it's not null
    if (investmentId !== null && investmentId !== undefined) {
      requestBody.investmentId = investmentId;
    }

    console.log('Submitting withdrawal request:', { 
      amount, 
      hasInvestment: !!investmentId,
      investmentId: investmentId || 'none (standalone)'
    });

    return authenticatedApiCall(`${window.API_BASE || ''}/api/withdraw`, {
      method: 'POST',
      body: JSON.stringify(requestBody)
    });
  })
  .then(data => {
    // Show success modal
    showWithdrawalSuccessModal(data);
    // Clear form
    document.getElementById('withdrawAmount').value = '';
    document.getElementById('withdrawPasswordOnPage').value = '';
    // Hide calculation
    document.getElementById('withdrawalCalculationOnPage').style.display = 'none';
    // Reload withdraw section after 2 seconds
    setTimeout(() => {
      const withdrawContent = document.getElementById('withdrawContent');
      if (withdrawContent) {
        withdrawContent.dataset.loaded = 'false';
        loadWithdrawSection();
      }
    }, 2000);
  })
  .catch(error => {
    console.error('Withdrawal error:', error);
    showAlert('⚠️ ' + (error.message || 'Failed to process withdrawal. Please check your withdrawal settings and try again.'), 'Withdrawal Failed');
    btn.disabled = false;
    btn.textContent = '💰 Withdraw';
  });
};

// Show withdrawal records modal
window.showWithdrawalRecordsModal = function() {
  fetch(`${window.API_BASE || ''}/api/withdrawal-requests`, {
    headers: getAuthHeaders()
  })
  .then(response => response.json())
  .then(requests => {
    // Separate pending and paid
    const pending = requests.filter(r => r.status === 'pending');
    const paid = requests.filter(r => r.status === 'paid');

    const modal = document.createElement('div');
    modal.id = 'withdrawalRecordsModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
      <div style="background: white; border-radius: 10px; max-width: 800px; width: 90%; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3); padding: 30px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px;">
          <h2 style="color: #007BFF; margin: 0;">📋 Withdrawal Records</h2>
          <button onclick="document.getElementById('withdrawalRecordsModal').remove()" style="background: #dc3545; color: white; border: none; border-radius: 5px; padding: 8px 15px; cursor: pointer; font-weight: bold;">✕ Close</button>
        </div>

        <!-- Pending Withdrawals -->
        <div style="margin-bottom: 30px;">
          <h3 style="color: #ff9800; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
            <span>⏳</span>
            Pending Withdrawals (${pending.length})
          </h3>
          ${pending.length === 0 ? `
            <p style="color: #6c757d; text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px;">No pending withdrawals</p>
          ` : pending.map(req => {
            const date = new Date(req.requested_at).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
            return `
              <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #ff9800;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                  <div>
                    <p style="margin: 5px 0; font-weight: bold; color: #333;">Amount: K${req.gross_amount.toFixed(2)}</p>
                    <p style="margin: 5px 0; color: #6c757d; font-size: 0.9rem;">Net: K${req.net_amount.toFixed(2)} (Tax: K${req.charge.toFixed(2)})</p>
                    <p style="margin: 5px 0; color: #6c757d; font-size: 0.85rem;">${date}</p>
                  </div>
                  <div style="text-align: right;">
                    <span style="background: #ff9800; color: white; padding: 6px 12px; border-radius: 15px; font-weight: bold; font-size: 0.9rem;">
                      ⏳ Pending
                    </span>
                    <p style="margin: 5px 0 0 0; color: #6c757d; font-size: 0.85rem;">${req.wallet ? req.wallet.toUpperCase() : 'N/A'}</p>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Paid Withdrawals -->
        <div>
          <h3 style="color: #28a745; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
            <span>✅</span>
            Approved/Paid Withdrawals (${paid.length})
          </h3>
          ${paid.length === 0 ? `
            <p style="color: #6c757d; text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px;">No paid withdrawals</p>
          ` : paid.map(req => {
            const date = new Date(req.requested_at).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
            return `
              <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #28a745;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                  <div>
                    <p style="margin: 5px 0; font-weight: bold; color: #333;">Amount: K${req.gross_amount.toFixed(2)}</p>
                    <p style="margin: 5px 0; color: #6c757d; font-size: 0.9rem;">Net: K${req.net_amount.toFixed(2)} (Tax: K${req.charge.toFixed(2)})</p>
                    <p style="margin: 5px 0; color: #6c757d; font-size: 0.85rem;">${date}</p>
                  </div>
                  <div style="text-align: right;">
                    <span style="background: #28a745; color: white; padding: 6px 12px; border-radius: 15px; font-weight: bold; font-size: 0.9rem;">
                      ✅ Paid
                    </span>
                    <p style="margin: 5px 0 0 0; color: #6c757d; font-size: 0.85rem;">${req.wallet ? req.wallet.toUpperCase() : 'N/A'}</p>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  })
  .catch(error => {
    console.error('Error loading withdrawal records:', error);
    showAlert('Failed to load withdrawal records');
  });
};

function showWithdrawalForm(profileData, currentBalance) {
  // Display wallet and phone
  const walletDisplay = profileData.withdrawal_wallet ? profileData.withdrawal_wallet.toUpperCase() : 'Not set';
  const phoneDisplay = profileData.phone || profileData.withdrawal_phone || 'Not set';
  
  const formHTML = `
    <div style="padding: 20px;">
      <h3 style="margin-bottom: 20px; color: #007BFF;">Instant Withdraw</h3>
      
      <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #007BFF;">
        <p style="margin: 5px 0; font-weight: bold; color: #007BFF;">Mobile Wallet:</p>
        <p style="margin: 5px 0; font-size: 1.1rem; color: #333;">${walletDisplay === 'AIRTEL' ? '📱 Airtel Money' : walletDisplay === 'MTN' ? '📱 MTN Mobile Money' : walletDisplay}</p>
        <p style="margin: 5px 0; font-weight: bold; color: #007BFF; margin-top: 10px;">Phone Number:</p>
        <p style="margin: 5px 0; font-size: 1.1rem; color: #333;">${phoneDisplay}</p>
      </div>

      <div class="form-group">
        <label>Withdrawal Amount (Minimum Zmw50):</label>
        <input type="number" id="withdrawAmount" min="50" step="0.01" max="${currentBalance.toFixed(2)}" placeholder="Enter amount" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: #fff;" onchange="calculateWithdrawal()" oninput="calculateWithdrawal()">
        <small style="color: #6c757d;">Available Balance: K${currentBalance.toFixed(2)}</small>
      </div>
      
      <div id="withdrawalCalculation" style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 4px; display: none;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
          <span>Gross Amount:</span>
          <strong id="grossAmount">K0.00</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px; color: #dc3545;">
          <span>Tax (12%):</span>
          <strong id="chargeAmount">K0.00</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 1.1rem;">
          <span><strong>Net Amount:</strong></span>
          <strong style="color: #28a745;" id="netAmount">K0.00</strong>
        </div>
      </div>
      
      <div class="form-group" style="margin-top: 15px;">
        <label>Withdrawal Password:</label>
        <input type="password" id="withdrawPassword" placeholder="Enter your withdrawal password" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: #fff;">
      </div>
      
      <div style="margin-top: 20px; text-align: right;">
        <button onclick="document.getElementById('withdrawModal').remove()" class="btn btn-secondary" style="margin-right: 10px;">Cancel</button>
        <button onclick="processWithdrawal(${currentBalance.toFixed(2)})" class="btn btn-success" style="padding: 12px 30px; font-size: 1.1rem; font-weight: bold;">💰 Instant Withdraw</button>
      </div>
    </div>
  `;

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'withdrawModal';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 8px; max-width: 600px; width: 90%; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      ${formHTML}
    </div>
  `;
  document.body.appendChild(modal);

  // Calculate withdrawal function
  window.calculateWithdrawal = function() {
    const amount = parseFloat(document.getElementById('withdrawAmount').value) || 0;
    const calculationDiv = document.getElementById('withdrawalCalculation');
    
    if (amount >= 50) {
      const charge = amount * 0.12;
      const net = amount - charge;
      
      document.getElementById('grossAmount').textContent = `K${amount.toFixed(2)}`;
      document.getElementById('chargeAmount').textContent = `K${charge.toFixed(2)}`;
      document.getElementById('netAmount').textContent = `K${net.toFixed(2)}`;
      calculationDiv.style.display = 'block';
    } else {
      calculationDiv.style.display = 'none';
    }
  };

  // Process withdrawal function
  window.processWithdrawal = function(maxBalance) {
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    const password = document.getElementById('withdrawPassword').value;

    if (!amount || amount < 50) {
      showAlert('Minimum withdrawal amount is Zmw50');
      return;
    }

    if (amount > maxBalance) {
      showAlert('Withdrawal amount exceeds available balance');
      return;
    }

    if (!password) {
      showAlert('Please enter your withdrawal password');
      return;
    }

    // Disable button
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Processing...';

    // Get user's first active investment or create standalone withdrawal
    fetch(`${window.API_BASE || ''}/api/dashboard`, {
      headers: getAuthHeaders()
    })
    .then(response => response.json())
    .then(dashboardData => {
      const investments = dashboardData.investments || [];
      // Use first active investment if available, otherwise use 0 (standalone)
      const investmentId = investments.length > 0 ? investments[0].id : null;

      return fetch(`${window.API_BASE || ''}/api/withdraw`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          investmentId: investmentId,
          withdrawal_password: password,
          amount: amount
        })
      });
    })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        showAlert('Error: ' + data.error);
        btn.disabled = false;
        btn.textContent = '💰 Instant Withdraw';
      } else {
        // Show success modal
        showWithdrawalSuccessModal(data);
        document.getElementById('withdrawModal').remove();
        // Reload sections
        setTimeout(() => {
          const meContent = document.getElementById('meContent');
          if (meContent) {
            meContent.dataset.loaded = 'false';
            loadMeSection();
          }
          const dashboardContent = document.getElementById('dashboardContent');
          if (dashboardContent) {
            dashboardContent.dataset.loaded = 'false';
            loadDashboardSection();
          }
        }, 2000);
      }
    })
    .catch(error => {
      console.error('Withdrawal error:', error);
      showAlert('Failed to process withdrawal');
      btn.disabled = false;
      btn.textContent = '💰 Instant Withdraw';
    });
  };
}

// Show withdrawal success modal
function showWithdrawalSuccessModal(data) {
  const modal = document.createElement('div');
  modal.id = 'withdrawalSuccessModal';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10001;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 10px; max-width: 500px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.3); padding: 30px; text-align: center;">
      <div style="font-size: 4rem; margin-bottom: 20px;">✅</div>
      <h2 style="color: #28a745; margin-bottom: 20px;">Withdrawal Successful!</h2>
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: left;">
        <p style="margin: 10px 0;"><strong>Status:</strong> <span style="color: #ff9800; font-weight: bold;">${data.status.toUpperCase()}</span></p>
        <p style="margin: 10px 0;"><strong>Gross Amount:</strong> K${data.gross_amount.toFixed(2)}</p>
        <p style="margin: 10px 0;"><strong>Tax (12%):</strong> K${data.charge.toFixed(2)}</p>
        <p style="margin: 10px 0;"><strong>Net Amount:</strong> <span style="color: #28a745; font-weight: bold; font-size: 1.1rem;">K${data.net_amount.toFixed(2)}</span></p>
        <p style="margin: 10px 0;"><strong>Wallet:</strong> ${data.wallet.toUpperCase()}</p>
      </div>
      <p style="color: #6c757d; margin-bottom: 20px;">
        Your withdrawal request has been submitted and is pending admin approval. You will be notified once it's processed.
      </p>
      <button onclick="document.getElementById('withdrawalSuccessModal').remove()" class="btn" style="background: #28a745; color: white; padding: 12px 30px; border: none; border-radius: 5px; cursor: pointer; font-size: 1rem; font-weight: bold;">
        Close
      </button>
    </div>
  `;
  document.body.appendChild(modal);
}

// Load withdrawal records
function loadWithdrawalRecords() {
  const container = document.getElementById('withdrawalRecordsContainer');
  if (!container) return;

  fetch(`${window.API_BASE || ''}/api/withdrawal-requests`, {
    headers: getAuthHeaders()
  })
  .then(response => response.json())
  .then(requests => {
    if (requests.length === 0) {
      container.innerHTML = '<p style="color: #6c757d; text-align: center; padding: 20px;">No withdrawal records found.</p>';
      return;
    }

    const recordsHTML = requests.map(req => {
      const statusColor = req.status === 'paid' ? '#28a745' : req.status === 'pending' ? '#ff9800' : '#dc3545';
      const statusText = req.status === 'paid' ? '✅ Paid' : req.status === 'pending' ? '⏳ Pending' : '❌ ' + req.status;
      const date = new Date(req.requested_at).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      return `
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${statusColor};">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <p style="margin: 5px 0; font-weight: bold; color: #333;">Amount: K${req.gross_amount.toFixed(2)}</p>
              <p style="margin: 5px 0; color: #6c757d; font-size: 0.9rem;">Net: K${req.net_amount.toFixed(2)} (Tax: K${req.charge.toFixed(2)})</p>
              <p style="margin: 5px 0; color: #6c757d; font-size: 0.85rem;">${date}</p>
            </div>
            <div style="text-align: right;">
              <span style="background: ${statusColor}; color: white; padding: 6px 12px; border-radius: 15px; font-weight: bold; font-size: 0.9rem;">
                ${statusText}
              </span>
              <p style="margin: 5px 0 0 0; color: #6c757d; font-size: 0.85rem;">${req.wallet ? req.wallet.toUpperCase() : 'N/A'}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = recordsHTML;
  })
  .catch(error => {
    console.error('Error loading withdrawal records:', error);
    container.innerHTML = '<p style="color: #dc3545; text-align: center; padding: 20px;">Failed to load withdrawal records.</p>';
  });
}

function editProfileFromMe() {
  const user = getUser();
  if (!user) return;

    fetch(`${window.API_BASE || ''}/api/profile`, {
      headers: getAuthHeaders()
    })
  .then(response => response.json())
  .then(profileData => {
    // Create modal form
    const formHTML = `
      <div style="padding: 20px;">
        <h3 style="margin-bottom: 20px; color: #007BFF;">Edit Profile</h3>
        <div class="form-group">
          <label>Full Name:</label>
          <input type="text" id="editFullName" value="${profileData.full_name || ''}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: #fff;" placeholder="Enter your full name">
          <small style="color: #6c757d; font-size: 0.85rem;">You can update your full name</small>
        </div>
        <div class="form-group" style="margin-top: 15px;">
          <label>Phone Number:</label>
          <input 
            type="text" 
            id="editPhone" 
            value="${profileData.phone || user.phone || ''}" 
            readonly 
            disabled
            style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #f8f9fa; color: #6c757d; cursor: not-allowed;"
          >
          <small style="color: #dc3545; font-size: 0.85rem; display: block; margin-top: 5px;">
            🔒 Phone number cannot be changed - it's your account identifier
          </small>
          <small style="color: #6c757d; font-size: 0.85rem; display: block; margin-top: 3px;">
            This is the number you used to register and login with. Contact support if you need to change it.
          </small>
        </div>
        <div style="margin-top: 20px; text-align: right;">
          <button onclick="document.getElementById('editProfileModal').remove()" class="btn btn-secondary" style="margin-right: 10px;">Cancel</button>
          <button onclick="saveProfileEdit()" class="btn">Save</button>
        </div>
      </div>
    `;

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'editProfileModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
      <div style="background: white; border-radius: 8px; max-width: 500px; width: 90%; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        ${formHTML}
      </div>
    `;
    document.body.appendChild(modal);

    // Save function
    window.saveProfileEdit = function() {
      const fullName = document.getElementById('editFullName').value.trim();

      if (!fullName) {
        showAlert('Please enter a full name');
        return;
      }

      // Validate full name doesn't look like an email
      if (fullName.includes('@')) {
        showAlert('Full name cannot be an email address. Please enter your actual name.');
        return;
      }

      // Phone number is read-only and cannot be changed - don't send it in the request
      fetch(`${window.API_BASE || ''}/api/profile`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          full_name: fullName
          // Phone number is NOT included - it cannot be changed
        })
      })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        showAlert('Error: ' + data.error);
      } else {
        showAlert('Profile updated successfully!');
        document.getElementById('editProfileModal').remove();
        // Reload me section
        const meContent = document.getElementById('meContent');
        if (meContent) {
          meContent.dataset.loaded = 'false';
          loadMeSection();
        }
      }
    })
    .catch(error => {
      console.error('Update error:', error);
      showAlert('Failed to update profile');
    });
    };
  })
  .catch(error => {
    console.error('Profile fetch error:', error);
    showAlert('Failed to load profile data');
  });
}

// Show change password form
function showChangePasswordForm() {
  const modal = document.createElement('div');
  modal.id = 'changePasswordModal';
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

  modal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 10px; max-width: 500px; width: 90%; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <h2 style="color: #ff9800; margin-top: 0; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
        <span>🔒</span>
        Change Password
      </h2>
      <form id="changePasswordForm">
        <div class="form-group" style="margin-bottom: 20px;">
          <label for="currentPassword" style="display: block; margin-bottom: 8px; font-weight: bold; color: #333;">
            Current Password <span style="color: red;">*</span>
          </label>
          <input 
            type="password" 
            id="currentPassword" 
            name="currentPassword" 
            required 
            autocomplete="current-password"
            style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 5px; font-size: 1rem; box-sizing: border-box; color: #333; background: #fff;"
            placeholder="Enter your current password"
          />
        </div>
        <div class="form-group" style="margin-bottom: 20px;">
          <label for="newPassword" style="display: block; margin-bottom: 8px; font-weight: bold; color: #333;">
            New Password <span style="color: red;">*</span>
          </label>
          <input 
            type="password" 
            id="newPassword" 
            name="newPassword" 
            required 
            autocomplete="new-password"
            minlength="6"
            style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 5px; font-size: 1rem; box-sizing: border-box; color: #333; background: #fff;"
            placeholder="Enter new password (min. 6 characters)"
          />
          <small style="color: #666; font-size: 0.85rem; margin-top: 5px; display: block;">
            Password must be at least 6 characters long
          </small>
        </div>
        <div class="form-group" style="margin-bottom: 20px;">
          <label for="confirmPassword" style="display: block; margin-bottom: 8px; font-weight: bold; color: #333;">
            Confirm New Password <span style="color: red;">*</span>
          </label>
          <input 
            type="password" 
            id="confirmPassword" 
            name="confirmPassword" 
            required 
            autocomplete="new-password"
            minlength="6"
            style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 5px; font-size: 1rem; box-sizing: border-box; color: #333; background: #fff;"
            placeholder="Confirm your new password"
          />
        </div>
        <div id="changePasswordError" style="display: none; background: #f8d7da; color: #721c24; padding: 12px; border-radius: 5px; margin-bottom: 20px; border: 1px solid #f5c6cb;">
        </div>
        <div id="changePasswordSuccess" style="display: none; background: #d4edda; color: #155724; padding: 12px; border-radius: 5px; margin-bottom: 20px; border: 1px solid #c3e6cb;">
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button 
            type="button" 
            onclick="closeChangePasswordForm()" 
            class="btn" 
            style="background: #6c757d; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            class="btn" 
            style="background: #ff9800; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;"
            id="changePasswordSubmitBtn"
          >
            Change Password
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  // Handle form submission
  const form = document.getElementById('changePasswordForm');
  form.addEventListener('submit', handleChangePassword);

  // Close on overlay click
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeChangePasswordForm();
    }
  });
}

// Handle change password form submission
async function handleChangePassword(e) {
  e.preventDefault();
  
  const form = e.target;
  const currentPassword = form.currentPassword.value;
  const newPassword = form.newPassword.value;
  const confirmPassword = form.confirmPassword.value;
  const submitBtn = document.getElementById('changePasswordSubmitBtn');
  const errorDiv = document.getElementById('changePasswordError');
  const successDiv = document.getElementById('changePasswordSuccess');

  // Hide previous messages
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';

  // Validate passwords match
  if (newPassword !== confirmPassword) {
    errorDiv.textContent = 'New password and confirm password do not match';
    errorDiv.style.display = 'block';
    return;
  }

  // Validate password length
  if (newPassword.length < 6) {
    errorDiv.textContent = 'New password must be at least 6 characters long';
    errorDiv.style.display = 'block';
    return;
  }

  // Validate current password is not the same as new password
  if (currentPassword === newPassword) {
    errorDiv.textContent = 'New password must be different from current password';
    errorDiv.style.display = 'block';
    return;
  }

  // Disable submit button
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Changing Password...';

  try {
    const response = await fetch(`${window.API_BASE || ''}/api/profile/change-password`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to change password');
    }

    // Show success message
    successDiv.textContent = 'Password changed successfully! You will be logged out. Please login again with your new password.';
    successDiv.style.display = 'block';

    // Clear form
    form.reset();

    // Logout after 3 seconds
    setTimeout(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/index.html';
    }, 3000);

  } catch (error) {
    console.error('Change password error:', error);
    errorDiv.textContent = error.message || 'Failed to change password. Please try again.';
    errorDiv.style.display = 'block';
    
    // Re-enable submit button
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

// Close change password form
function closeChangePasswordForm() {
  const modal = document.getElementById('changePasswordModal');
  if (modal) {
    document.body.removeChild(modal);
  }
}

function editWithdrawalSettingsFromMe() {
  fetch(`${window.API_BASE || ''}/api/profile`, {
    headers: getAuthHeaders()
  })
  .then(response => response.json())
  .then(profileData => {
    // Extract phone number without country code for display
    const currentPhone = profileData.withdrawal_phone || '';
    const phoneWithoutCode = currentPhone.startsWith('+260') ? currentPhone.substring(4) : currentPhone;
    
    // Create modal form
    const formHTML = `
      <div style="padding: 20px;">
        <h3 style="margin-bottom: 20px; color: #007BFF;">Withdrawal Settings</h3>
        <div class="form-group">
          <label>Withdrawal Password (min 4 characters):</label>
          <input type="password" id="editWithdrawalPassword" placeholder="Enter new withdrawal password" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: #fff;">
          <small style="color: #6c757d;">Leave blank to keep current password</small>
        </div>
        <div class="form-group" style="margin-top: 15px;">
          <label>Withdrawal Wallet:</label>
          <select id="editWithdrawalWallet" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: #fff;" onchange="togglePhoneInput()">
            <option value="">Select wallet</option>
            <option value="airtel" ${profileData.withdrawal_wallet === 'airtel' ? 'selected' : ''}>Airtel Money</option>
            <option value="mtn" ${profileData.withdrawal_wallet === 'mtn' ? 'selected' : ''}>MTN Mobile Money</option>
          </select>
        </div>
        <div class="form-group" id="phoneInputGroup" style="margin-top: 15px; display: none;">
          <label>Mobile Phone Number:</label>
          <div style="display: flex; gap: 5px;">
            <input type="text" id="editCountryCode" value="+260" readonly style="width: 80px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #f8f9fa; text-align: center; font-weight: bold; color: #333;">
            <input type="text" id="editWithdrawalPhone" value="${phoneWithoutCode}" placeholder="9XXXXXXXX" maxlength="9" pattern="[0-9]{9}" oninput="this.value = this.value.replace(/[^0-9]/g, '')" style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: #fff;">
          </div>
          <small style="color: #6c757d;">Enter 9 digits (e.g., 977123456)</small>
        </div>
        <div style="margin-top: 20px; text-align: right;">
          <button onclick="document.getElementById('editWithdrawalModal').remove()" class="btn btn-secondary" style="margin-right: 10px;">Cancel</button>
          <button onclick="saveWithdrawalSettings()" class="btn">Save</button>
        </div>
      </div>
    `;

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'editWithdrawalModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
      <div style="background: white; border-radius: 8px; max-width: 500px; width: 90%; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        ${formHTML}
      </div>
    `;
    document.body.appendChild(modal);

    // Toggle phone input based on wallet selection
    window.togglePhoneInput = function() {
      const wallet = document.getElementById('editWithdrawalWallet').value;
      const phoneGroup = document.getElementById('phoneInputGroup');
      if (wallet) {
        phoneGroup.style.display = 'block';
      } else {
        phoneGroup.style.display = 'none';
      }
    };

    // Initialize phone input visibility
    setTimeout(() => {
      togglePhoneInput();
    }, 100);

    // Save function
    window.saveWithdrawalSettings = function() {
      const password = document.getElementById('editWithdrawalPassword').value.trim();
      const wallet = document.getElementById('editWithdrawalWallet').value;
      const phoneInput = document.getElementById('editWithdrawalPhone');
      const phone = phoneInput ? phoneInput.value.trim() : '';

      if (!password && !wallet) {
        showAlert('Please set at least one field');
        return;
      }

      if (password && password.length < 4) {
        showAlert('Password must be at least 4 characters');
        return;
      }

      // Validate phone if wallet is selected
      if (wallet && phone) {
        // Remove any non-digit characters
        const phoneDigits = phone.replace(/\D/g, '');
        if (phoneDigits.length !== 9) {
          showAlert('Phone number must be 9 digits (e.g., 977123456)');
          return;
        }
      }

      const updateData = {};
      if (password) updateData.withdrawal_password = password;
      if (wallet) updateData.withdrawal_wallet = wallet;
      if (wallet && phone) {
        // Combine country code with phone number
        const phoneDigits = phone.replace(/\D/g, '');
        updateData.withdrawal_phone = `+260${phoneDigits}`;
      } else if (wallet && !phone) {
        // If wallet is set but no phone, clear phone
        updateData.withdrawal_phone = '';
      }

      fetch(`${window.API_BASE || ''}/api/withdrawal-settings`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updateData)
      })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          showAlert('Error: ' + (data.details ? JSON.stringify(data.details) : data.error));
        } else {
          showAlert('Withdrawal settings updated successfully!');
          document.getElementById('editWithdrawalModal').remove();
          // Reload me section
          const meContent = document.getElementById('meContent');
          if (meContent) {
            meContent.dataset.loaded = 'false';
            loadMeSection();
          }
        }
      })
      .catch(error => {
        console.error('Update error:', error);
        showAlert('Failed to update withdrawal settings');
      });
    };
  })
  .catch(error => {
    console.error('Profile fetch error:', error);
    showAlert('Failed to load profile data');
  });
}

// Withdraw investment (used from dashboard section)
async function withdrawInvestment(investmentId) {
  // Get investment details first
  try {
      const dashboardResponse = await fetch(`${window.API_BASE || ''}/api/dashboard`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
    
    if (!dashboardResponse.ok) {
      throw new Error('Failed to load investment details');
    }
    
    const dashboardData = await dashboardResponse.json();
    const investment = dashboardData.investments.find(inv => inv.id === investmentId);
    
    if (!investment) {
      showAlert('Investment not found');
      return;
    }
    
    const totalValue = investment.deposit_amount + investment.total_accruals;
    
    // Use the withdrawal form from Me section
    showWithdrawalForm([investment]);
  } catch (error) {
    console.error('Error loading investment:', error);
    showAlert('Failed to load investment details');
  }
}

// Handle hash-based navigation
function handleHashNavigation() {
  const hash = window.location.hash.replace('#', '');
    if (hash && hash.startsWith('section-')) {
      const sectionName = hash.replace('section-', '');
      if (['home', 'dashboard', 'levels', 'about', 'me', 'withdraw'].includes(sectionName)) {
        showSection(sectionName);
        return true;
      }
  }
  return false;
}

// Initialize dashboard sections
function initDashboardSections() {
  console.log('Initializing dashboard sections...');
  console.log('DOM ready state:', document.readyState);
  
  // Check if required functions are available
  if (typeof requireAuth !== 'function') {
    console.error('requireAuth function not found!');
    return;
  }
  
  if (typeof getUser !== 'function') {
    console.error('getUser function not found!');
    return;
  }
  
  if (typeof getAuthHeaders !== 'function') {
    console.error('getAuthHeaders function not found!');
    return;
  }
  
  // Check authentication
  if (!requireAuth()) {
    console.log('User not authenticated, redirecting...');
    return; // Redirect handled by requireAuth
  }
  
  console.log('User authenticated, loading sections...');
  const user = getUser();
  console.log('Current user:', user);
  
  // Check if containers exist
  const homeContent = document.getElementById('homeContent');
  const dashboardContent = document.getElementById('dashboardContent');
  const levelsContent = document.getElementById('levelsContent');
  const aboutContent = document.getElementById('aboutContent');
  const meContent = document.getElementById('meContent');
  
  console.log('Content containers:', {
    homeContent: !!homeContent,
    dashboardContent: !!dashboardContent,
    levelsContent: !!levelsContent,
    aboutContent: !!aboutContent,
    meContent: !!meContent
  });
  
  // Wait a bit for DOM to be fully ready
  setTimeout(() => {
    // Check for hash navigation first
    const hash = window.location.hash.replace('#', '');
    console.log('Current hash:', hash);
    
    if (hash && hash.startsWith('section-')) {
      const sectionName = hash.replace('section-', '');
      console.log('Loading section from hash:', sectionName);
      showSection(sectionName);
    } else {
      // Load home section by default
      console.log('Loading home section (default)...');
      showSection('home');
    }
    
    // Listen for hash changes
    window.addEventListener('hashchange', () => {
      console.log('Hash changed:', window.location.hash);
      handleHashNavigation();
    });
    
    console.log('Dashboard sections initialized');
    
    // Start deposit status polling
    if (typeof authenticatedApiCall === 'function') {
      startDepositStatusPolling();
    }
  }, 200);
}

// Make showSection available globally
window.showSection = showSection;
window.loadHomeSection = loadHomeSection;
window.loadDashboardSection = loadDashboardSection;
window.loadLevelsSection = loadLevelsSection;
window.loadAboutSection = loadAboutSection;
window.loadMeSection = loadMeSection;
window.confirmInvestment = confirmInvestment;
window.processInvestment = processInvestment;

// ==================== INVESTMENT FUNCTIONS ====================

// Confirm investment modal and process investment
async function confirmInvestment(packageId, amount, level) {
  try {
    // Get user's current balance and investments
    const dashboardResponse = await fetch(`${window.API_BASE || ''}/api/dashboard`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!dashboardResponse.ok) {
      throw new Error('Failed to fetch balance');
    }

    const dashboardData = await dashboardResponse.json();
    
    // Get user profile to check current level
    const profileResponse = await fetch(`${window.API_BASE || ''}/api/profile`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    let userCurrentLevel = 'L0';
    if (profileResponse.ok) {
      const profileData = await profileResponse.json();
      userCurrentLevel = profileData.level || 'L0';
    }
    
    // Check if user has any active investment (user can only be on ONE level at a time)
    const investments = dashboardData.investments || [];
    const packagesResponse = await fetch(`${window.API_BASE || ''}/api/packages`);
    const allPackages = packagesResponse.ok ? await packagesResponse.json() : [];
    const targetPackage = allPackages.find(p => p.id === packageId);
    
    // Find current active investment
    const currentActiveInvestment = investments.find(inv => inv.status === 'active');
    let currentActiveLevel = null;
    if (currentActiveInvestment) {
      const currentPackage = allPackages.find(p => p.id === currentActiveInvestment.package_id);
      currentActiveLevel = currentPackage ? currentPackage.level : null;
    }
    
    if (targetPackage) {
      // Check if user is trying to invest in the SAME level they're already on
      if (currentActiveLevel && currentActiveLevel === targetPackage.level) {
        showAlert(`You are already invested in ${targetPackage.level}. Choose a different level to switch.`);
        return;
      }
    }
    
    // Store for use in modal
    const isSwitching = currentActiveLevel !== null;
    
    // Calculate current balance
    const transactions = dashboardData.transactions || [];
    
    // Calculate balance: deposits + accruals + bonuses - withdrawals - investments from balance
    const totalDeposits = (transactions || [])
      .filter(t => t && t.type === 'deposit' && t.amount > 0)
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const totalWithdrawn = (transactions || [])
      .filter(t => t && t.type === 'withdrawal')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
    // Include ALL accrual and bonus transactions (regardless of investment_id)
    // This ensures all daily income, bonuses, and any other income is included in balance
    const allAccrualsAndBonuses = (transactions || [])
      .filter(t => t && (t.type === 'accrual' || t.type === 'bonus'))
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
    const investmentsFromBalance = (transactions || [])
      .filter(t => t && t.type === 'investment')
      .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
    
    // Balance = deposits + ALL accruals and bonuses - withdrawals - investments from balance
    const availableBalance = (totalDeposits || 0) + (allAccrualsAndBonuses || 0) - (totalWithdrawn || 0) - (investmentsFromBalance || 0);
    
    // Check if balance is sufficient
    if (availableBalance < amount) {
      showAlert(`Insufficient balance. Your current balance is K${availableBalance.toFixed(2)}. Please deposit to get this level.`);
      return;
    }

    // Show confirmation modal
    const modal = document.createElement('div');
    modal.id = 'confirmInvestmentModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
      <div style="background: white; border-radius: 8px; padding: 30px; max-width: 500px; width: 90%; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h3 style="margin-bottom: 20px; color: #007BFF;">${isSwitching ? 'Confirm Level Switch' : 'Confirm Investment'}</h3>
        ${isSwitching ? `
          <div style="background: #fff3cd; border: 1px solid #ffc107; color: #856404; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <strong>⚠️ Level Switch Warning:</strong>
            <p style="margin: 10px 0 0 0;">You are switching from <strong>${currentActiveLevel}</strong> to <strong>${level}</strong>. Your current investment in ${currentActiveLevel} will be <strong>terminated</strong>.</p>
          </div>
        ` : ''}
        <div style="margin-bottom: 20px;">
          <p style="margin-bottom: 10px; color: #333; font-size: 16px;">
            <strong>${isSwitching ? 'The following amount will be deducted for your new level:' : 'Confirm this amount based on the level you have chosen will be deducted from your account for the investment package:'}</strong>
          </p>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin-top: 15px;">
            ${isSwitching ? `
              <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span style="color: #6c757d;">Current Level:</span>
                <strong style="color: #dc3545;">${currentActiveLevel} (will be terminated)</strong>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="color: #6c757d;">${isSwitching ? 'New Level:' : 'Level:'}</span>
              <strong style="color: #007BFF;">${level}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="color: #6c757d;">Amount:</span>
              <strong style="color: #28a745;">K${amount.toLocaleString()}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="color: #6c757d;">Current Balance:</span>
              <strong>K${availableBalance.toFixed(2)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding-top: 10px; border-top: 2px solid #dee2e6;">
              <span style="color: #6c757d;">Balance After Investment:</span>
              <strong style="color: ${availableBalance - amount >= 0 ? '#28a745' : '#dc3545'}">K${(availableBalance - amount).toFixed(2)}</strong>
            </div>
          </div>
        </div>
        <div style="margin-top: 20px; text-align: right;">
          <button onclick="document.getElementById('confirmInvestmentModal').remove()" class="btn btn-secondary" style="margin-right: 10px;">Cancel</button>
          <button onclick="processInvestment(${packageId}, ${amount})" class="btn">${isSwitching ? 'Confirm Switch' : 'Confirm Investment'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } catch (error) {
    console.error('Error showing investment confirmation:', error);
    showAlert('Error loading balance: ' + error.message);
  }
}

// Process investment
async function processInvestment(packageId, amount) {
  try {
    const modal = document.getElementById('confirmInvestmentModal');
    if (modal) {
      modal.remove();
    }

    const response = await fetch(`${window.API_BASE || ''}/api/invest-from-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        packageId: packageId,
        amount: amount
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to create investment' }));
      const errorMessage = errorData.message || errorData.error || 'Failed to create investment';
      throw new Error(errorMessage);
    }

    const data = await response.json();

    // Show appropriate message based on whether it was a switch or new investment
    if (data.previousLevel) {
      showAlert(`Level switched successfully! Your ${data.previousLevel} investment has been terminated. You are now on ${data.level}. Amount K${amount.toFixed(2)} has been deducted from your balance.`);
    } else {
      showAlert(`Investment successful! You have been assigned to ${data.level}. Amount K${amount.toFixed(2)} has been deducted from your balance.`);
    }
    
    // Force reload by clearing cached data
    const meContent = document.getElementById('meContent');
    if (meContent) {
      meContent.dataset.loaded = 'false';
    }
    
    // Reload levels section and dashboard
    await loadLevelsSection();
    if (typeof loadDashboardSection === 'function') {
      await loadDashboardSection();
    }
    if (typeof loadMeSection === 'function') {
      await loadMeSection();
    }
  } catch (error) {
    console.error('Investment error:', error);
    showAlert('Failed to create investment: ' + error.message);
  }
}

// ==================== DEPOSIT/RECHARGE FUNCTIONS ====================

// Show deposit options modal (to select level/package)
async function showDepositOptionsModal() {
  try {
    // Fetch packages
    const response = await fetch(`${window.API_BASE || ''}/api/packages`);
    if (!response.ok) throw new Error('Failed to load packages');
    const packages = await response.json();
    
    // Sort packages by level
    packages.sort((a, b) => {
      const levelA = parseInt(a.level?.replace('L', '') || '0');
      const levelB = parseInt(b.level?.replace('L', '') || '0');
      return levelA - levelB;
    });
    
    const modal = document.createElement('div');
    modal.id = 'depositOptionsModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
      <div style="background: white; border-radius: 8px; padding: 30px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h2 style="margin-bottom: 20px; color: #007BFF;">Select Deposit Amount</h2>
        <p style="margin-bottom: 20px; color: #6c757d;">Choose the amount you want to deposit based on your level:</p>
        <div style="display: grid; gap: 15px;">
          ${packages.map(pkg => `
            <button 
              onclick="showDepositModal(${pkg.id}, ${pkg.amount}); document.getElementById('depositOptionsModal').remove();" 
              class="btn" 
              style="width: 100%; padding: 15px; text-align: left; background: #f8f9fa; border: 2px solid #dee2e6;"
            >
              <strong style="color: #333; font-size: 1.1rem;">${pkg.level || 'L1'}: K${pkg.amount.toLocaleString()}</strong>
              <small style="display: block; color: #6c757d; margin-top: 5px;">Daily Income: K${((pkg.daily_income || pkg.daily_rate * pkg.amount)).toFixed(2)}</small>
            </button>
          `).join('')}
        </div>
        <div style="margin-top: 20px; text-align: right;">
          <button onclick="document.getElementById('depositOptionsModal').remove()" class="btn btn-secondary">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } catch (error) {
    console.error('Error loading deposit options:', error);
    showAlert('Error loading deposit options: ' + error.message);
  }
}

// Show deposit modal with instructions
function showDepositModal(packageId, amount) {
  // Wallet details
  const walletDetails = {
    airtel: {
      phone: '+260770285804',
      name: 'Chigole Siakalenge',
      ussd: '*115#',
      getInstructions: function(showAmountInput, displayAmount) {
        const amountText = showAmountInput ? '<strong style="color: #333;">(enter amount below)</strong>' : '<strong style="color: #333;">K' + displayAmount + '</strong>';
        return [
          'Dial <strong>*115#</strong>',
          'Select <strong>Option 1</strong>',
          'Select <strong>Option 1</strong>',
          'Select <strong>Option 1</strong>',
          'Enter Number <strong id="depositPhoneInInstructions">' + this.phone + '</strong> (<span id="depositNameInInstructions">' + this.name + '</span>)',
          'Enter amount ' + amountText + ', enter your PIN and send'
        ];
      }
    },
    mtn: {
      phone: '0769194765',
      name: 'Maggie Mwamba',
      ussd: '*115#',
      getInstructions: function(showAmountInput, displayAmount) {
        const amountText = showAmountInput ? '<strong style="color: #333;">(enter amount below)</strong>' : '<strong style="color: #333;">K' + displayAmount + '</strong>';
        return [
          'Dial <strong>*115#</strong>',
          'Select <strong>Send Money</strong> or <strong>Option 1</strong>',
          'Enter Number <strong id="depositPhoneInInstructions">' + this.phone + '</strong> (<span id="depositNameInInstructions">' + this.name + '</span>)',
          'Enter amount ' + amountText + ', enter your PIN and send'
        ];
      }
    }
  };
  
  // If amount is null, show input field for custom amount
  const showAmountInput = amount === null || amount === undefined;
  const displayAmount = amount ? amount.toLocaleString() : '';
  
  // Get initial wallet (default to airtel)
  let currentWallet = 'airtel';
  const currentDetails = walletDetails[currentWallet];
  
  const modal = document.createElement('div');
  modal.id = 'depositModal';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 8px; padding: 30px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <h2 style="margin-bottom: 20px; color: #007BFF;">💰 Deposit ${showAmountInput ? '' : '<span style="color: #333;">K' + displayAmount + '</span>'}</h2>
      
      <!-- Wallet Selection (moved to top) -->
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 10px; color: #333; font-weight: bold;">Payment Method:</label>
        <select 
          id="depositWallet" 
          style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 5px; font-size: 1rem;"
        >
          <option value="airtel">Airtel Money</option>
          <option value="mtn">MTN Mobile Money</option>
        </select>
      </div>
      
      <!-- Account Credentials -->
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin-bottom: 15px; color: #333;">Account Credentials</h3>
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; color: #6c757d; font-weight: bold;">Phone Number:</label>
          <div style="display: flex; gap: 10px; align-items: center;">
            <input 
              type="text" 
              id="depositPhoneNumber" 
              value="${currentDetails.phone} (${currentDetails.name})" 
              readonly 
              style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 5px; background: white; font-weight: bold;"
            >
            <button 
              onclick="copyDepositPhone()" 
              class="btn" 
              style="padding: 10px 20px; background: #007BFF; color: white; border: none; border-radius: 5px; cursor: pointer;"
            >
              📋 Copy
            </button>
          </div>
        </div>
      </div>
      
      <!-- Instructions -->
      <div id="depositInstructions" style="background: #e7f3ff; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #007BFF;">
        <h3 style="margin-bottom: 15px; color: #007BFF;">📱 Top-up Method</h3>
        <ol id="depositInstructionsList" style="margin: 0; padding-left: 20px; color: #333; line-height: 1.8;">
          ${currentDetails.getInstructions(showAmountInput, displayAmount).map((inst) => `<li>${inst}</li>`).join('')}
        </ol>
      </div>
      
      ${showAmountInput ? `
      <!-- Amount Input (for custom amount) -->
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 10px; color: #333; font-weight: bold;">Deposit Amount (Kwacha):</label>
        <input 
          type="number" 
          id="depositAmount" 
          placeholder="Enter amount to deposit" 
          min="1"
          step="0.01"
          style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 5px; font-size: 1rem;"
        >
        <small style="color: #6c757d; display: block; margin-top: 5px;">Enter the amount you want to deposit</small>
      </div>
      ` : `
      <!-- Deposit Amount Display -->
      <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
        <strong style="color: #333; font-size: 1.1rem; font-weight: bold;">Deposit Amount: <span style="color: #007BFF;">K${displayAmount}</span></strong>
        <p style="margin: 5px 0 0 0; color: #856404; font-size: 0.9rem;">This amount will be added to your account balance after verification.</p>
      </div>
      `}
      
      <!-- Transaction Number Input -->
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 10px; color: #333; font-weight: bold;">Transaction Number (TXT):</label>
        <input 
          type="text" 
          id="depositTransactionTxt" 
          placeholder="Enter transaction number from your mobile money receipt" 
          style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 5px; font-size: 1rem;"
        >
        <small style="color: #6c757d; display: block; margin-top: 5px;">Enter the transaction number you received after sending the money</small>
      </div>
      
      <!-- Actions -->
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button 
          onclick="document.getElementById('depositModal').remove()" 
          class="btn btn-secondary"
          style="padding: 12px 30px;"
        >
          Cancel
        </button>
        <button 
          onclick="submitDeposit(null, ${amount ? amount : 'null'})" 
          data-endpoint="recharge" 
          class="btn btn-success"
          style="padding: 12px 30px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;"
        >
          ✅ Submit Deposit
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Add event listener to update details when wallet changes
  const walletSelect = document.getElementById('depositWallet');
  if (walletSelect) {
    walletSelect.addEventListener('change', function() {
      const selectedWallet = this.value;
      const details = walletDetails[selectedWallet];
      
      // Update phone number input
      const phoneInput = document.getElementById('depositPhoneNumber');
      if (phoneInput) {
        phoneInput.value = `${details.phone} (${details.name})`;
      }
      
      // Update instructions
      const instructionsList = document.getElementById('depositInstructionsList');
      if (instructionsList) {
        const amountInput = document.getElementById('depositAmount');
        const currentAmount = amountInput && amountInput.value ? parseFloat(amountInput.value).toLocaleString() : displayAmount;
        const isCustomAmount = showAmountInput && (!amountInput || !amountInput.value);
        instructionsList.innerHTML = details.getInstructions(isCustomAmount, currentAmount).map((inst) => `<li>${inst}</li>`).join('');
      }
      
      // Update border color based on wallet
      const instructionsDiv = document.getElementById('depositInstructions');
      if (instructionsDiv) {
        instructionsDiv.style.borderLeftColor = selectedWallet === 'mtn' ? '#FFCC00' : '#007BFF';
      }
    });
  }
}

// Copy phone number to clipboard
function copyDepositPhone() {
  const phoneInput = document.getElementById('depositPhoneNumber');
  if (!phoneInput) {
    showAlert('Phone number field not found', 'Error');
    return;
  }
  
  const phone = phoneInput.value.split(' ')[0]; // Get just the phone number
  
  // Find the copy button to update its text
  const copyBtn = document.querySelector('button[onclick*="copyDepositPhone"]');
  const originalText = copyBtn ? copyBtn.textContent : '📋 Copy';
  
  // Try modern clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(phone).then(() => {
      // Show success feedback
      if (copyBtn) {
        copyBtn.textContent = '✅ Copied!';
        copyBtn.style.background = '#28a745';
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = '#007BFF';
        }, 2000);
      } else {
        showAlert('Phone number copied to clipboard: ' + phone, 'Copied');
      }
    }).catch(err => {
      console.error('Clipboard API failed, trying fallback:', err);
      // Fallback to older method
      fallbackCopyText(phone, copyBtn, originalText);
    });
  } else {
    // Fallback for browsers without clipboard API
    fallbackCopyText(phone, copyBtn, originalText);
  }
}

// Fallback copy method for older browsers or HTTP sites
function fallbackCopyText(text, button, originalText) {
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
        button.textContent = '✅ Copied!';
        button.style.background = '#28a745';
        setTimeout(() => {
          button.textContent = originalText;
          button.style.background = '#007BFF';
        }, 2000);
      } else {
        showAlert('Phone number copied to clipboard: ' + text, 'Copied');
      }
    } else {
      throw new Error('execCommand copy failed');
    }
  } catch (err) {
    console.error('Fallback copy failed:', err);
    // Show manual copy option with selectable text
    const phoneInput = document.getElementById('depositPhoneNumber');
    if (phoneInput) {
      phoneInput.select();
      phoneInput.setSelectionRange(0, 99999); // For mobile devices
    }
    showAlert('Please copy the number manually: ' + text, 'Copy Manually');
  }
}

// Submit deposit (packageId is no longer used - deposits are not tied to packages)
async function submitDeposit(packageId, amount) {
  // packageId parameter is kept for backward compatibility but not used
  // Get amount from input if not provided (custom amount)
  let depositAmount = amount;
  if (!depositAmount || depositAmount === null || depositAmount === 'null') {
    const amountInput = document.getElementById('depositAmount');
    if (!amountInput || !amountInput.value) {
      showAlert('⚠️ Please enter the deposit amount');
      if (amountInput) amountInput.focus();
      return;
    }
    depositAmount = parseFloat(amountInput.value);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      showAlert('⚠️ Please enter a valid deposit amount');
      if (amountInput) amountInput.focus();
      return;
    }
  }
  
  const transactionTxt = document.getElementById('depositTransactionTxt').value.trim();
  
  if (!transactionTxt) {
    showAlert('⚠️ Please enter the transaction number');
    document.getElementById('depositTransactionTxt').focus();
    return;
  }
  
  // Get wallet selection
  const walletSelect = document.getElementById('depositWallet');
  const wallet = walletSelect ? walletSelect.value : 'airtel';
  
  const submitBtn = event.target;
  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ Submitting...';
  
  try {
    const requestBody = {
      amount: parseFloat(depositAmount), // Ensure it's a number
      transactionTxt: transactionTxt.trim(), // Ensure it's trimmed
      wallet: wallet || 'airtel' // Ensure wallet is set
      // NOTE: packageId is NOT sent - deposits are not tied to packages/levels
    };
    
    console.log('Submitting deposit to /api/recharge:', requestBody);
    console.log('Request URL:', `${window.API_BASE || ''}/api/recharge`);
    
    const response = await fetch(`${window.API_BASE || ''}/api/recharge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('Response status:', response.status);
    console.log('Response URL:', response.url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to process deposit' }));
      console.error('Deposit error response:', errorData);
      console.error('Response status:', response.status);
      console.error('Response URL:', response.url);
      
      // Check if we accidentally hit the wrong endpoint
      if (response.url && response.url.includes('invest-from-balance')) {
        throw new Error('Wrong endpoint called. Please refresh the page and try again.');
      }
      
      // Show detailed error if available
      const errorMessage = errorData.details && errorData.details.length > 0 
        ? errorData.details.map(d => d.msg || d.message).join(', ')
        : (errorData.error || 'Failed to process deposit');
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    
    // Show pending message - deposit is pending approval
    const submittedAmount = typeof depositAmount === 'number' ? depositAmount : parseFloat(depositAmount);
    showAlert('⏳ Deposit request submitted! K' + submittedAmount.toLocaleString() + ' is pending admin approval.');
    
    // Close modal
    const modal = document.getElementById('depositModal');
    if (modal) {
      modal.remove();
    }
    
    // Reload dashboard and me section (balance won't change until approved)
    // This will trigger the pending deposit notification
    if (typeof loadDashboardSection === 'function') {
      const dashboardContent = document.getElementById('dashboardContent');
      if (dashboardContent) {
        dashboardContent.dataset.loaded = 'false';
        loadDashboardSection();
      }
    }
    if (typeof loadInvestmentsDirectly === 'function') {
      loadInvestmentsDirectly();
    }
    if (typeof loadMeSection === 'function') {
      const meContent = document.getElementById('meContent');
      if (meContent) {
        meContent.dataset.loaded = 'false';
        loadMeSection();
      }
    }
  } catch (error) {
    console.error('Deposit error:', error);
    showAlert('❌ ' + (error.message || 'Failed to process deposit. Please check your transaction number and try again.'));
    submitBtn.disabled = false;
    submitBtn.textContent = '✅ Submit Deposit';
  }
}

// Check for pending deposits and show notification
function checkAndShowPendingDeposits(investments) {
  const pendingDeposits = investments.filter(inv => inv.status === 'pending' && inv.transaction_txt);
  const approvedDeposits = investments.filter(inv => {
    // Check if deposit was recently approved (has transaction_txt, is active, and wasn't notified yet)
    if (inv.status === 'active' && inv.transaction_txt) {
      const notifiedKey = `deposit_${inv.id}_notified`;
      const wasNotified = localStorage.getItem(notifiedKey) === 'true';
      // Also check if it was pending before (by checking if we have a pending flag)
      const wasPending = localStorage.getItem(`deposit_${inv.id}_was_pending`) === 'true';
      return !wasNotified && wasPending;
    }
    return false;
  });
  
  // Track pending deposits
  pendingDeposits.forEach(dep => {
    localStorage.setItem(`deposit_${dep.id}_was_pending`, 'true');
  });
  
  // Remove old notification if exists
  const oldNotification = document.getElementById('depositStatusNotification');
  if (oldNotification) {
    oldNotification.remove();
  }

  // Show pending deposits notification (priority)
  if (pendingDeposits.length > 0) {
    showDepositStatusNotification('pending', pendingDeposits);
  } 
  // Show approved deposits notification (only if no pending)
  else if (approvedDeposits.length > 0) {
    showDepositStatusNotification('approved', approvedDeposits);
    // Mark as notified and clear pending flag
    approvedDeposits.forEach(dep => {
      localStorage.setItem(`deposit_${dep.id}_notified`, 'true');
      localStorage.removeItem(`deposit_${dep.id}_was_pending`);
    });
  }
}

// Show deposit status notification in corner
function showDepositStatusNotification(status, deposits) {
  // Remove existing notification
  const existing = document.getElementById('depositStatusNotification');
  if (existing) {
    existing.remove();
  }

  const notification = document.createElement('div');
  notification.id = 'depositStatusNotification';
  
  if (status === 'pending') {
    const totalAmount = deposits.reduce((sum, d) => sum + d.deposit_amount, 0);
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
        color: white;
        padding: 20px;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10001;
        min-width: 300px;
        max-width: 400px;
        animation: slideInRight 0.3s ease-out;
      ">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
          <div>
            <h3 style="margin: 0 0 5px 0; color: white; font-size: 1.1rem;">⏳ Pending Deposit${deposits.length > 1 ? 's' : ''}</h3>
            <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 0.9rem;">
              ${deposits.length} deposit${deposits.length > 1 ? 's' : ''} totaling <strong>K${totalAmount.toLocaleString()}</strong> awaiting approval
            </p>
          </div>
          <button 
            onclick="document.getElementById('depositStatusNotification').remove()" 
            style="
              background: rgba(255,255,255,0.2); 
              border: none; 
              color: white; 
              width: 30px; 
              height: 30px; 
              border-radius: 50%; 
              cursor: pointer; 
              font-size: 1.2rem;
              line-height: 1;
              padding: 0;
              margin-left: 10px;
            "
            onmouseover="this.style.background='rgba(255,255,255,0.3)'"
            onmouseout="this.style.background='rgba(255,255,255,0.2)'"
          >×</button>
        </div>
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.3);">
          ${deposits.map(dep => `
            <div style="margin-bottom: 8px; font-size: 0.9rem;">
              <strong>K${dep.deposit_amount.toLocaleString()}</strong> - ${dep.transaction_txt || 'Pending'}
            </div>
          `).join('')}
        </div>
      </div>
      <style>
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      </style>
    `;
  } else if (status === 'approved') {
    const totalAmount = deposits.reduce((sum, d) => sum + d.deposit_amount, 0);
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
        color: white;
        padding: 20px;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10001;
        min-width: 300px;
        max-width: 400px;
        animation: slideInRight 0.3s ease-out;
      ">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
          <div>
            <h3 style="margin: 0 0 5px 0; color: white; font-size: 1.1rem;">✅ Deposit${deposits.length > 1 ? 's' : ''} Approved!</h3>
            <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 0.9rem;">
              ${deposits.length} deposit${deposits.length > 1 ? 's' : ''} totaling <strong>K${totalAmount.toLocaleString()}</strong> has been approved and added to your balance
            </p>
          </div>
          <button 
            onclick="document.getElementById('depositStatusNotification').remove()" 
            style="
              background: rgba(255,255,255,0.2); 
              border: none; 
              color: white; 
              width: 30px; 
              height: 30px; 
              border-radius: 50%; 
              cursor: pointer; 
              font-size: 1.2rem;
              line-height: 1;
              padding: 0;
              margin-left: 10px;
            "
            onmouseover="this.style.background='rgba(255,255,255,0.3)'"
            onmouseout="this.style.background='rgba(255,255,255,0.2)'"
          >×</button>
        </div>
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.3);">
          ${deposits.map(dep => `
            <div style="margin-bottom: 8px; font-size: 0.9rem;">
              <strong>K${dep.deposit_amount.toLocaleString()}</strong> - Approved ✓
            </div>
          `).join('')}
        </div>
      </div>
      <style>
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      </style>
    `;
  }

  document.body.appendChild(notification);
  
  // Auto-refresh dashboard to update balance when approved
  if (status === 'approved') {
    setTimeout(() => {
      if (typeof loadInvestmentsDirectly === 'function') {
        loadInvestmentsDirectly();
      }
      if (typeof loadMeSection === 'function') {
        const meContent = document.getElementById('meContent');
        if (meContent) {
          meContent.dataset.loaded = 'false';
          loadMeSection();
        }
      }
    }, 2000);
  }
}

// Make functions globally available
window.showDepositOptionsModal = showDepositOptionsModal;
window.showDepositModal = showDepositModal;
window.copyDepositPhone = copyDepositPhone;
window.submitDeposit = submitDeposit;
window.checkAndShowPendingDeposits = checkAndShowPendingDeposits;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboardSections);
} else {
  // DOM already loaded
  initDashboardSections();
}

