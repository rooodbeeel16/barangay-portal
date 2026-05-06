const API_BASE = '/api';

async function apiRequest(endpoint, options = {}, _retried = false) {
  const token = localStorage.getItem('authToken');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Try to silently refresh the Firebase token once before giving up
    if (!_retried && typeof firebase !== 'undefined') {
      try {
        const fbUser = firebase.auth().currentUser;
        if (fbUser) {
          const newToken = await fbUser.getIdToken(true);
          localStorage.setItem('authToken', newToken);
          return apiRequest(endpoint, options, true);
        }
      } catch (_) {}
    }
    // Fully sign out so login page doesn't redirect back (breaking the loop)
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    if (typeof firebase !== 'undefined') {
      try { firebase.auth().signOut(); } catch (_) {}
    }
    const isAdminPage = window.location.pathname.includes('/admin/');
    if (isAdminPage && !window.location.pathname.includes('/admin/login')) {
      window.location.href = '/admin/login.html';
    }
    throw new Error('Unauthorized');
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Request failed');
  }
  return data;
}

async function get(endpoint) { return apiRequest(endpoint, { method: 'GET' }); }
async function post(endpoint, body) { return apiRequest(endpoint, { method: 'POST', body: JSON.stringify(body) }); }
async function put(endpoint, body) { return apiRequest(endpoint, { method: 'PUT', body: JSON.stringify(body) }); }
async function patch(endpoint, body) { return apiRequest(endpoint, { method: 'PATCH', body: JSON.stringify(body) }); }
async function del(endpoint) { return apiRequest(endpoint, { method: 'DELETE' }); }

// Upload a file (multipart/form-data). Do NOT set Content-Type — the browser sets it with the boundary.
async function uploadFile(endpoint, formData, _retried = false) {
  const token = localStorage.getItem('authToken');
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { ...(token && { 'Authorization': `Bearer ${token}` }) },
    body: formData,
  });

  if (response.status === 401) {
    if (!_retried && typeof firebase !== 'undefined') {
      try {
        const fbUser = firebase.auth().currentUser;
        if (fbUser) {
          const newToken = await fbUser.getIdToken(true);
          localStorage.setItem('authToken', newToken);
          return uploadFile(endpoint, formData, true);
        }
      } catch (_) {}
    }
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    if (typeof firebase !== 'undefined') {
      try { firebase.auth().signOut(); } catch (_) {}
    }
    const isAdminPage = window.location.pathname.includes('/admin/');
    if (isAdminPage && !window.location.pathname.includes('/admin/login')) {
      window.location.href = '/admin/login.html';
    }
    throw new Error('Unauthorized');
  }

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || 'Upload failed');
  return data;
}
