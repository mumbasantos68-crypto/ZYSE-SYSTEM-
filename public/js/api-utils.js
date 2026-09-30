// API Utility Functions
// Provides consistent error handling, timeouts, and loading states for all API calls

// Default timeout for API calls (15 seconds)
const DEFAULT_TIMEOUT = 15000;

/**
 * Make an API call with timeout and error handling
 * @param {string} url - API endpoint
 * @param {object} options - Fetch options (method, headers, body, etc.)
 * @param {number} timeout - Timeout in milliseconds (default: 15000)
 * @returns {Promise<Response>}
 */
async function apiCall(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout / 1000} seconds. The server may be slow or unresponsive.`);
    }
    
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error('Cannot connect to server. Please check your internet connection and try again.');
    }
    
    throw error;
  }
}

/**
 * Show loading state in an element
 * @param {HTMLElement} element - Element to show loading in
 * @param {string} message - Loading message
 */
function showLoading(element, message = 'Loading...') {
  if (element) {
    element.innerHTML = `<div class="loading">${message}</div>`;
  }
}

/**
 * Show error state in an element
 * @param {HTMLElement} element - Element to show error in
 * @param {string} message - Error message
 * @param {function} onRetry - Optional retry function
 */
function showError(element, message, onRetry = null) {
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
}

/**
 * Handle API response with proper error handling
 * @param {Response} response - Fetch response
 * @returns {Promise<object>} Parsed JSON data
 */
async function handleApiResponse(response) {
  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch (e) {
      // If response is not JSON, use status text
      errorData = { error: response.statusText || `HTTP ${response.status}` };
    }

    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
      if (typeof logout === 'function') {
        logout();
      } else {
        window.location.href = '/index.html';
      }
      throw new Error('Session expired. Please log in again.');
    }

    throw new Error(errorData.error || errorData.message || `Request failed with status ${response.status}`);
  }

  try {
    return await response.json();
  } catch (e) {
    throw new Error('Invalid response from server');
  }
}

/**
 * Make an authenticated API call
 * @param {string} url - API endpoint
 * @param {object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<object>} Parsed JSON response
 */
async function authenticatedApiCall(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const token = localStorage.getItem('token');
  if (!token) {
    throw new Error('Not authenticated. Please log in.');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {})
  };

  const response = await apiCall(url, {
    ...options,
    headers
  }, timeout);

  return handleApiResponse(response);
}

// Export functions to window for global access
window.apiCall = apiCall;
window.authenticatedApiCall = authenticatedApiCall;
window.showLoading = showLoading;
window.showError = showError;
window.handleApiResponse = handleApiResponse;
