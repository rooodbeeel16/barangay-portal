const Utils = {
  formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  },

  formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  },

  getStatusBadgeClass(status) {
    const classes = {
      PENDING: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
      FOR_SIGNATURE: 'bg-blue-100 text-blue-800 border border-blue-300',
      READY_FOR_RELEASE: 'bg-purple-100 text-purple-800 border border-purple-300',
      RELEASED: 'bg-gray-100 text-gray-800 border border-gray-300',
    };
    return classes[status] || 'bg-gray-100 text-gray-800';
  },

  getStatusLabel(status) {
    const labels = {
      PENDING: 'Pending',
      FOR_SIGNATURE: 'For Signature',
      READY_FOR_RELEASE: 'Ready for Release',
      RELEASED: 'Released',
    };
    return labels[status] || status;
  },

  getDocTypeLabel(type) {
    const labels = {
      BARANGAY_CLEARANCE: 'Barangay Clearance',
      CERTIFICATE_OF_RESIDENCY: 'Certificate of Residency',
      CERTIFICATE_OF_INDIGENCY: 'Certificate of Indigency',
      BUSINESS_PERMIT_ENDORSEMENT: 'Business Permit Endorsement',
      INCIDENT_REPORT: 'Incident Report',
    };
    return labels[type] || type;
  },

  showToast(message, type = 'success') {
    /* Use the global showToast from portal.js if available */
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    /* Fallback for admin pages (no portal.js) */
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const colors = { success: 'linear-gradient(135deg,#059669,#10b981)', error: 'linear-gradient(135deg,#dc2626,#ef4444)', warning: 'linear-gradient(135deg,#d97706,#f59e0b)', info: 'linear-gradient(135deg,#1e3a5f,#2563eb)' };
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.cssText = 'position:fixed;top:1.25rem;right:1.25rem;z-index:9999;display:flex;flex-direction:column;gap:.5rem;pointer-events:none;';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.cssText = `display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-radius:14px;color:${type==='warning'?'#1a1a1a':'#fff'};font-size:13px;font-weight:500;line-height:1.4;box-shadow:0 8px 28px rgba(0,0,0,.16);pointer-events:all;min-width:240px;max-width:340px;background:${colors[type]||colors.info};animation:toastIn .32s cubic-bezier(.34,1.26,.64,1) both;`;
    toast.innerHTML = `<i class="toast-icon fa-solid ${icons[type]||icons.info}" style="font-size:14px;flex-shrink:0;margin-top:1px;"></i><span>${String(message).replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`;
    container.appendChild(toast);
    if (!document.getElementById('_toastStyle')) {
      const s = document.createElement('style'); s.id = '_toastStyle';
      s.textContent = '@keyframes toastIn{from{opacity:0;transform:translateX(24px) scale(.95)}to{opacity:1;transform:translateX(0) scale(1)}}@keyframes toastOut{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(16px) scale(.95)}}';
      document.head.appendChild(s);
    }
    const remove = () => { toast.style.animation = 'toastOut .22s ease both'; setTimeout(() => toast.remove(), 240); };
    setTimeout(remove, 3200);
    toast.addEventListener('click', remove);
  },

  showLoading(el, text = 'Loading...') {
    if (el) {
      el.disabled = true;
      el.dataset.originalText = el.textContent;
      el.innerHTML = `<svg class="animate-spin h-4 w-4 mr-2 inline" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>${text}`;
    }
  },

  hideLoading(el) {
    if (el && el.dataset.originalText) {
      el.disabled = false;
      el.textContent = el.dataset.originalText;
    }
  },

  getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  },

  formatCurrency(amount) {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount || 0);
  },
};
