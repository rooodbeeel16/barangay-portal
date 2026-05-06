/* portal.js — Shared resident portal JS
   Scroll reveal, back-to-top, mobile menu, toast system */

(function () {

  /* ── Init on DOM ready ── */
  function init() {
    initScrollReveal();
    initBackToTop();
    initMobileMenu();
    initNavHighlight();
    createToastContainer();
  }

  /* ── Scroll reveal with IntersectionObserver ── */
  function initScrollReveal() {
    var els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.07, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ── Back-to-top with spring animation ── */
  function initBackToTop() {
    var btn = document.getElementById('backToTop');
    if (!btn) return;
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          btn.classList.toggle('visible', window.scrollY > 360);
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ── Mobile menu toggle ── */
  function initMobileMenu() {
    var menuBtn = document.getElementById('mobileMenuBtn');
    var menu    = document.getElementById('mobileMenu');
    if (!menuBtn || !menu || menuBtn._portalBound) return;
    menuBtn._portalBound = true;
    menuBtn.addEventListener('click', function () {
      var open = !menu.classList.contains('hidden');
      menu.classList.toggle('hidden', open);
      menuBtn.setAttribute('aria-expanded', String(!open));
    });
    /* Close on outside click */
    document.addEventListener('click', function (e) {
      if (!menu.classList.contains('hidden') &&
          !menu.contains(e.target) &&
          !menuBtn.contains(e.target)) {
        menu.classList.add('hidden');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── Highlight current nav link ── */
  function initNavHighlight() {
    var path = window.location.pathname;
    document.querySelectorAll('nav a[href]').forEach(function (a) {
      try {
        var href = new URL(a.href, window.location.origin).pathname;
        if (href === path) {
          a.classList.add('nav-current');
        }
      } catch (_) {}
    });
  }

  /* ── Toast container creation ── */
  function createToastContainer() {
    if (document.getElementById('toastContainer')) return;
    var c = document.createElement('div');
    c.id = 'toastContainer';
    document.body.appendChild(c);
  }

  /* ── DOMContentLoaded guard ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

/* ── Global toast API ── */
window.showToast = function (message, type, duration) {
  type     = type     || 'info';
  duration = duration || 3200;

  var container = document.getElementById('toastContainer');
  if (!container) return;

  var icons = {
    success: 'fa-circle-check',
    error:   'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info:    'fa-circle-info',
  };

  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML =
    '<i class="toast-icon fa-solid ' + (icons[type] || icons.info) + '"></i>' +
    '<span class="toast-msg">' + String(message).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>';

  container.appendChild(toast);

  var timer = setTimeout(function () { removeToast(toast); }, duration);
  toast.addEventListener('click', function () {
    clearTimeout(timer);
    removeToast(toast);
  });
};

function removeToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('is-exiting');
  setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 250);
}

/* ── Smooth modal helpers ── */
window.openModal = function (overlayId) {
  var el = document.getElementById(overlayId);
  if (!el) return;
  el.classList.add('is-open');
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { el.classList.add('is-visible'); });
  });
  document.body.style.overflow = 'hidden';
};

window.closeModal = function (overlayId) {
  var el = document.getElementById(overlayId);
  if (!el) return;
  el.classList.remove('is-visible');
  setTimeout(function () {
    el.classList.remove('is-open');
    document.body.style.overflow = '';
  }, 250);
};

/* ── Smooth drawer helpers ── */
window.openDrawer = function (drawerId, overlayId) {
  var drawer  = document.getElementById(drawerId);
  var overlay = overlayId ? document.getElementById(overlayId) : null;
  if (drawer)  drawer.classList.add('is-open');
  if (overlay) overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
};

window.closeDrawer = function (drawerId, overlayId) {
  var drawer  = document.getElementById(drawerId);
  var overlay = overlayId ? document.getElementById(overlayId) : null;
  if (drawer)  drawer.classList.remove('is-open');
  if (overlay) overlay.classList.remove('is-open');
  document.body.style.overflow = '';
};
