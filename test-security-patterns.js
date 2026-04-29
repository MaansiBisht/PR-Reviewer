// Test file with various concurrency issues
const axios = require('axios');

// Example 1: Race condition in token refresh
let isRefreshing = false;
let failedQueue = [];

axios.interceptors.request.use(async (config) => {
  // Check token expiration on every request
  if (isTokenExpired()) {
    await refreshToken(); // Multiple requests can trigger this simultaneously
  }
  return config;
});

// Example 2: Missing request queue
axios.interceptors.response.use(
  response => response,
  async error => {
    if (error.response.status === 401) {
      // No queue - multiple 401s will trigger multiple refresh calls
      const newToken = await refreshToken();
      error.config.headers.Authorization = `Bearer ${newToken}`;
      return axios(error.config);
    }
    return Promise.reject(error);
  }
);

// Example 3: Check-then-act without atomicity
function updateUserBalance(userId, amount) {
  const currentBalance = getBalance(userId); // Check
  if (currentBalance > 0) {
    setBalance(userId, currentBalance - amount); // Act - balance might have changed
  }
}

// Example 4: Shared state without synchronization
let sharedCounter = 0;

function incrementCounter() {
  const current = sharedCounter;
  // Some async operation
  setTimeout(() => {
    sharedCounter = current + 1; // Race condition here
  }, 100);
}

function isTokenExpired() {
  return Date.now() > token.expiresAt;
}

async function refreshToken() {
  // No locking mechanism
  const response = await axios.post('/refresh');
  token = response.data.token;
}
