// Firebase web client config
const firebaseConfig = {
  apiKey: "AIzaSyBXhrb5N_uBSl90PVBlS6BNf9GjVqLmw9Y",
  authDomain: "barangay-portal-15469.firebaseapp.com",
  projectId: "barangay-portal-15469",
  storageBucket: "barangay-portal-15469.firebasestorage.app",
  messagingSenderId: "604996104146",
  appId: "1:604996104146:web:dc3d59f52850fa98a7a20b",
  measurementId: "G-LNN07HB5TW"
};

// Initialize Firebase (loaded via CDN in HTML)
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const AuthService = {
  async login(email, password) {
    const userCred = await firebase.auth().signInWithEmailAndPassword(email, password);
    const token = await userCred.user.getIdToken();
    const idTokenResult = await userCred.user.getIdTokenResult();
    const role = idTokenResult.claims.role || 'staff';

    localStorage.setItem('authToken', token);
    localStorage.setItem('user', JSON.stringify({
      uid: userCred.user.uid,
      email: userCred.user.email,
      name: userCred.user.displayName || userCred.user.email,
      role,
    }));

    return { user: userCred.user, role };
  },

  async logout() {
    await firebase.auth().signOut();
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/admin/login.html';
  },

  getCurrentUser() {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  },

  async refreshToken() {
    const user = firebase.auth().currentUser;
    if (user) {
      const token = await user.getIdToken(true);
      localStorage.setItem('authToken', token);
      return token;
    }
    return null;
  },

  requireAuth() {
    const user = this.getCurrentUser();
    if (!user) {
      window.location.href = '/admin/login.html';
      return null;
    }
    return user;
  },

  requireAdmin() {
    const user = this.requireAuth();
    if (user && user.role !== 'admin') {
      window.location.href = '/admin/dashboard.html';
      return null;
    }
    return user;
  },
};

// Synchronously hide admin-only sidebar links for staff users (no flash)
(function () {
  try {
    var user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user && user.role !== 'admin') {
      var s = document.createElement('style');
      s.textContent = '.admin-only{display:none!important}';
      (document.head || document.documentElement).appendChild(s);
    }
  } catch (e) {}
})();
