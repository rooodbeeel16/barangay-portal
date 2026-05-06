/**
 * notifications.js — Global admin notifications
 * Polls /api/notifications every 30 seconds, renders a bell icon with badge
 * in the top header bar, and opens a dropdown panel. Click navigates to the
 * related request-detail page or appointments page.
 */

(function () {
  'use strict';

  const POLL_INTERVAL = 60_000; // 60 s
  const READ_KEY = 'notif_read_ids';
  const NOTIF_CONTAINER_ID = 'notifContainer';

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function getReadIds() {
    try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')); }
    catch { return new Set(); }
  }

  function markRead(id) {
    const ids = getReadIds();
    ids.add(id);
    // cap at 500 entries to avoid unbounded localStorage growth
    const arr = [...ids].slice(-500);
    localStorage.setItem(READ_KEY, JSON.stringify(arr));
  }

  function markAllRead(notifications) {
    const ids = getReadIds();
    notifications.forEach(n => ids.add(n.id));
    const arr = [...ids].slice(-500);
    localStorage.setItem(READ_KEY, JSON.stringify(arr));
  }

  function timeAgo(isoStr) {
    const diff = Date.now() - new Date(isoStr).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  function statusColor(status) {
    const map = {
      PENDING: '#f59e0b',
      FOR_SIGNATURE: '#3b82f6',
      READY_FOR_RELEASE: '#8b5cf6',
      RELEASED: '#10b981',
      APPROVED: '#10b981',
      DECLINED: '#ef4444',
      RESCHEDULED: '#f97316',
    };
    return map[status] || '#6b7280';
  }

  function statusLabel(status) {
    const map = {
      PENDING: 'Pending',
      FOR_SIGNATURE: 'For Signature',
      READY_FOR_RELEASE: 'Ready for Release',
      RELEASED: 'Released',
      APPROVED: 'Approved',
      DECLINED: 'Declined',
      RESCHEDULED: 'Rescheduled',
    };
    return map[status] || status;
  }

  function notifIcon(type) {
    if (type === 'appointment') return 'fa-calendar-days';
    if (type === 'blotter') return 'fa-book';
    return 'fa-clipboard-list';
  }

  function notifIconBg(event) {
    if (event === 'new_request') return '#dbeafe';
    if (event === 'new_appointment') return '#dcfce7';
    if (event === 'new_blotter') return '#dbeafe';
    if (event === 'status_update') return '#fef3c7';
    if (event === 'appointment_update') return '#ffe4e6';
    return '#f3f4f6';
  }

  function notifIconColor(event) {
    if (event === 'new_request') return '#2563eb';
    if (event === 'new_appointment') return '#16a34a';
    if (event === 'new_blotter') return '#2563eb';
    if (event === 'status_update') return '#d97706';
    if (event === 'appointment_update') return '#dc2626';
    return '#6b7280';
  }

  function navigateTo(notif) {
    markRead(notif.id);
    if (notif.type === 'request') {
      window.location.href = '/admin/request-detail.html?id=' + encodeURIComponent(notif.docId);
    } else if (notif.type === 'blotter') {
      window.location.href = '/admin/blotter-detail.html?id=' + encodeURIComponent(notif.docId);
    } else {
      window.location.href = '/admin/appointments.html?highlight=' + encodeURIComponent(notif.docId);
    }
  }

  // ── Build DOM ────────────────────────────────────────────────────────────────

  function buildStyles() {
    if (document.getElementById('notif-styles')) return;
    const style = document.createElement('style');
    style.id = 'notif-styles';
    style.textContent = `
      #${NOTIF_CONTAINER_ID} {
        position: relative;
        display: inline-flex;
        align-items: center;
      }

      #notifBell {
        position: relative;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        border: 1.5px solid #e5e7eb;
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.18s, box-shadow 0.18s, transform 0.15s;
        color: #374151;
        font-size: 15px;
        outline: none;
      }
      #notifBell:hover {
        background: #f3f4f6;
        box-shadow: 0 2px 8px rgba(0,0,0,.10);
      }
      #notifBell:active { transform: scale(.93); }
      #notifBell.has-unread {
        border-color: #f59e0b;
        color: #d97706;
      }
      #notifBell.ringing {
        animation: notif-ring 0.55s ease;
      }
      @keyframes notif-ring {
        0%   { transform: rotate(0deg); }
        15%  { transform: rotate(-18deg); }
        30%  { transform: rotate(18deg); }
        45%  { transform: rotate(-12deg); }
        60%  { transform: rotate(12deg); }
        75%  { transform: rotate(-6deg); }
        90%  { transform: rotate(6deg); }
        100% { transform: rotate(0deg); }
      }

      #notifBadge {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 18px;
        height: 18px;
        border-radius: 9px;
        background: #ef4444;
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        line-height: 18px;
        text-align: center;
        padding: 0 4px;
        border: 2px solid #fff;
        pointer-events: none;
        transform: scale(0);
        transition: transform 0.2s cubic-bezier(.34,1.56,.64,1);
      }
      #notifBadge.visible { transform: scale(1); }

      #notifPanel {
        position: absolute;
        top: calc(100% + 10px);
        right: 0;
        width: 360px;
        max-width: calc(100vw - 24px);
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,.14), 0 2px 8px rgba(0,0,0,.08);
        z-index: 9999;
        overflow: hidden;
        transform-origin: top right;
        transform: scale(.94) translateY(-6px);
        opacity: 0;
        pointer-events: none;
        transition: transform 0.2s cubic-bezier(.34,1.56,.64,1), opacity 0.18s ease;
      }
      #notifPanel.open {
        transform: scale(1) translateY(0);
        opacity: 1;
        pointer-events: auto;
      }

      #notifPanel .notif-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px 10px;
        border-bottom: 1px solid #f3f4f6;
      }
      #notifPanel .notif-header h3 {
        font-size: 13px;
        font-weight: 700;
        color: #111827;
        margin: 0;
      }
      #notifPanel .notif-mark-all {
        font-size: 11px;
        color: #3b82f6;
        cursor: pointer;
        font-weight: 600;
        background: none;
        border: none;
        padding: 0;
        transition: color 0.15s;
      }
      #notifPanel .notif-mark-all:hover { color: #1d4ed8; text-decoration: underline; }

      #notifList {
        max-height: 380px;
        overflow-y: auto;
        scroll-behavior: smooth;
      }
      #notifList::-webkit-scrollbar { width: 5px; }
      #notifList::-webkit-scrollbar-track { background: transparent; }
      #notifList::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }

      .notif-item {
        display: flex;
        align-items: flex-start;
        gap: 11px;
        padding: 11px 16px;
        cursor: pointer;
        border-bottom: 1px solid #f9fafb;
        transition: background 0.13s;
        text-decoration: none;
        animation: notif-slide-in 0.22s ease forwards;
        opacity: 0;
        transform: translateX(8px);
      }
      @keyframes notif-slide-in {
        to { opacity: 1; transform: translateX(0); }
      }
      .notif-item:hover { background: #f8faff; }
      .notif-item.unread { background: #fffbeb; }
      .notif-item.unread:hover { background: #fef3c7; }

      .notif-icon-wrap {
        flex-shrink: 0;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        margin-top: 1px;
      }
      .notif-dot {
        flex-shrink: 0;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #f59e0b;
        margin-top: 6px;
        transition: opacity 0.2s;
      }
      .notif-dot.hidden-dot { opacity: 0; }

      .notif-body { flex: 1; min-width: 0; }
      .notif-title {
        font-size: 12.5px;
        font-weight: 600;
        color: #111827;
        margin: 0 0 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .notif-msg {
        font-size: 11.5px;
        color: #4b5563;
        margin: 0 0 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .notif-meta {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .notif-time {
        font-size: 10.5px;
        color: #9ca3af;
      }
      .notif-status {
        font-size: 10px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 20px;
        color: #fff;
        white-space: nowrap;
      }

      #notifEmpty {
        padding: 32px 16px;
        text-align: center;
        color: #9ca3af;
        font-size: 13px;
      }
      #notifEmpty i { font-size: 28px; margin-bottom: 10px; display: block; color: #d1d5db; }

      #notifFooter {
        padding: 10px 16px;
        border-top: 1px solid #f3f4f6;
        text-align: center;
      }
      #notifFooter a {
        font-size: 12px;
        color: #3b82f6;
        text-decoration: none;
        font-weight: 600;
      }
      #notifFooter a:hover { text-decoration: underline; }

      #notifLoading {
        padding: 20px;
        text-align: center;
        color: #9ca3af;
        font-size: 12px;
      }

      /* ── History Drawer ──────────────────────────────────────── */
      #notifHistOverlay {
        position: fixed; inset: 0;
        background: rgba(0,0,0,.38);
        z-index: 10000;
        opacity: 0; pointer-events: none;
        transition: opacity 0.25s ease;
      }
      #notifHistOverlay.hist-open { opacity: 1; pointer-events: auto; }

      #notifHistDrawer {
        position: fixed; top: 0; right: 0;
        height: 100%; width: 420px; max-width: 100vw;
        background: #fff;
        box-shadow: -6px 0 32px rgba(0,0,0,.18);
        display: flex; flex-direction: column;
        transform: translateX(100%);
        transition: transform 0.28s cubic-bezier(.4,0,.2,1);
        z-index: 10001; overflow: hidden;
      }
      #notifHistOverlay.hist-open #notifHistDrawer { transform: translateX(0); }

      #notifHistHdr {
        padding: 15px 18px 12px;
        border-bottom: 1px solid #f3f4f6;
        display: flex; align-items: center; justify-content: space-between;
        flex-shrink: 0;
      }
      #notifHistHdr h3 { font-size: 14px; font-weight: 700; color: #111827; margin: 0; }
      #notifHistClose {
        width: 30px; height: 30px; border-radius: 50%;
        border: none; background: #f3f4f6; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        color: #6b7280; font-size: 14px; transition: background 0.15s;
      }
      #notifHistClose:hover { background: #e5e7eb; color: #111827; }

      #notifHistTabs {
        display: flex; gap: 6px;
        padding: 10px 16px; border-bottom: 1px solid #f3f4f6;
        flex-shrink: 0; overflow-x: auto;
      }
      #notifHistTabs::-webkit-scrollbar { display: none; }
      .nht-tab {
        padding: 5px 12px; border-radius: 20px;
        font-size: 11.5px; font-weight: 600;
        border: 1.5px solid #e5e7eb; background: none;
        cursor: pointer; color: #6b7280; white-space: nowrap;
        transition: all 0.15s;
      }
      .nht-tab.nht-active { background: #1e3a5f; border-color: #1e3a5f; color: #fff; }

      #notifHistList {
        flex: 1; overflow-y: auto; scroll-behavior: smooth;
      }
      #notifHistList::-webkit-scrollbar { width: 4px; }
      #notifHistList::-webkit-scrollbar-track { background: transparent; }
      #notifHistList::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }

      .nhi-sep {
        padding: 6px 16px 4px; font-size: 10.5px; font-weight: 700;
        text-transform: uppercase; letter-spacing: .05em; color: #9ca3af;
        background: #f9fafb; border-bottom: 1px solid #f3f4f6;
        position: sticky; top: 0; z-index: 1;
      }
      .nhi-item {
        display: flex; align-items: flex-start; gap: 11px;
        padding: 11px 16px; cursor: pointer;
        border-bottom: 1px solid #f9fafb; transition: background 0.12s;
      }
      .nhi-item:hover { background: #f8faff; }
      .nhi-item.nhi-unread { background: #fffbeb; }
      .nhi-item.nhi-unread:hover { background: #fef3c7; }
      .nhi-icon {
        flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; margin-top: 1px;
      }
      .nhi-body { flex: 1; min-width: 0; }
      .nhi-title { font-size: 12.5px; font-weight: 600; color: #111827; margin: 0 0 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .nhi-msg   { font-size: 11.5px; color: #4b5563; margin: 0 0 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .nhi-meta  { display: flex; align-items: center; gap: 6px; }
      .nhi-time  { font-size: 10.5px; color: #9ca3af; }
      .nhi-badge { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 20px; color: #fff; }
      .nhi-dot   { flex-shrink: 0; width: 7px; height: 7px; border-radius: 50%; background: #f59e0b; margin-top: 6px; }

      #notifHistEmpty {
        padding: 40px 16px; text-align: center; color: #9ca3af; font-size: 13px; display: none;
      }
      #notifHistEmpty i { font-size: 28px; margin-bottom: 10px; display: block; color: #d1d5db; }
      #notifHistLoader {
        padding: 18px; text-align: center; color: #9ca3af; font-size: 12px;
      }
      #notifHistEnd {
        padding: 18px; text-align: center; color: #9ca3af; font-size: 12px; display: none;
      }

      #notifViewAll {
        font-size: 12px; color: #3b82f6; font-weight: 600;
        background: none; border: none; cursor: pointer; padding: 0; transition: color 0.15s;
      }
      #notifViewAll:hover { color: #1d4ed8; text-decoration: underline; }
    `;
    document.head.appendChild(style);
  }

  function buildPanel() {
    const container = document.getElementById(NOTIF_CONTAINER_ID);
    if (!container) return;

    container.innerHTML = `
      <button id="notifBell" aria-label="Notifications" aria-expanded="false" aria-haspopup="true">
        <i class="fa-solid fa-bell"></i>
        <span id="notifBadge" role="status" aria-live="polite"></span>
      </button>
      <div id="notifPanel" role="dialog" aria-label="Notifications panel">
        <div class="notif-header">
          <h3><i class="fa-solid fa-bell" style="margin-right:6px;color:#f59e0b"></i>Notifications</h3>
          <button class="notif-mark-all" id="notifMarkAll" title="Mark all as read">Mark all read</button>
        </div>
        <div id="notifList">
          <div id="notifLoading"><i class="fa-solid fa-circle-notch fa-spin" style="margin-right:6px"></i>Loading…</div>
        </div>
        <div id="notifFooter" style="display:none">
          <button id="notifViewAll">View previous notifications</button>
        </div>
      </div>
    `;

    // Toggle panel
    const bell = document.getElementById('notifBell');
    const panel = document.getElementById('notifPanel');
    const markAllBtn = document.getElementById('notifMarkAll');

    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = panel.classList.contains('open');
      if (isOpen) {
        closePanel();
      } else {
        openPanel();
      }
    });

    markAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      markAllRead(window._notifData || []);
      renderNotifications(window._notifData || []);
      updateBadge(0);
    });

    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) closePanel();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
    });

    document.getElementById('notifViewAll').addEventListener('click', (e) => {
      e.stopPropagation();
      openHistoryModal();
    });
  }

  function openPanel() {
    const panel = document.getElementById('notifPanel');
    const bell = document.getElementById('notifBell');
    if (!panel || !bell) return;
    panel.classList.add('open');
    bell.setAttribute('aria-expanded', 'true');
  }

  function closePanel() {
    const panel = document.getElementById('notifPanel');
    const bell = document.getElementById('notifBell');
    if (!panel || !bell) return;
    panel.classList.remove('open');
    bell.setAttribute('aria-expanded', 'false');
  }

  function updateBadge(count) {
    const badge = document.getElementById('notifBadge');
    const bell = document.getElementById('notifBell');
    if (!badge || !bell) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.classList.add('visible');
      bell.classList.add('has-unread');
    } else {
      badge.classList.remove('visible');
      bell.classList.remove('has-unread');
    }
  }

  function renderNotifications(notifications) {
    const list = document.getElementById('notifList');
    const footer = document.getElementById('notifFooter');
    if (!list) return;

    const readIds = getReadIds();

    if (!notifications || notifications.length === 0) {
      list.innerHTML = `
        <div id="notifEmpty">
          <i class="fa-solid fa-bell-slash"></i>
          No recent notifications
        </div>`;
      if (footer) footer.style.display = 'none';
      return;
    }

    if (footer) footer.style.display = 'block';

    list.innerHTML = notifications.map((n, idx) => {
      const isUnread = !readIds.has(n.id);
      const iconBg = notifIconBg(n.event);
      const iconColor = notifIconColor(n.event);
      const sColor = statusColor(n.status);
      const delay = Math.min(idx * 0.04, 0.4);

      return `
        <div class="notif-item${isUnread ? ' unread' : ''}"
             data-notif-id="${escHtml(n.id)}"
             data-doc-id="${escHtml(n.docId)}"
             data-type="${escHtml(n.type)}"
             style="animation-delay:${delay}s"
             role="button"
             tabindex="0"
             aria-label="${escHtml(n.title)}: ${escHtml(n.message)}">
          <div class="notif-icon-wrap" style="background:${iconBg};color:${iconColor}">
            <i class="fa-solid ${notifIcon(n.type)}"></i>
          </div>
          <div class="notif-body">
            <p class="notif-title">${escHtml(n.title)}</p>
            <p class="notif-msg">${escHtml(n.message)}</p>
            <div class="notif-meta">
              <span class="notif-time">${timeAgo(n.timestamp)}</span>
              <span class="notif-status" style="background:${sColor}">${statusLabel(n.status)}</span>
            </div>
          </div>
          <div class="notif-dot${isUnread ? '' : ' hidden-dot'}"></div>
        </div>`;
    }).join('');

    // Attach click handlers
    list.querySelectorAll('.notif-item').forEach(el => {
      const handler = () => {
        const id = el.dataset.notifId;
        const docId = el.dataset.docId;
        const type = el.dataset.type;
        markRead(id);
        if (type === 'request') {
          window.location.href = '/admin/request-detail.html?id=' + encodeURIComponent(docId);
        } else if (type === 'blotter') {
          window.location.href = '/admin/blotter-detail.html?id=' + encodeURIComponent(docId);
        } else {
          window.location.href = '/admin/appointments.html?highlight=' + encodeURIComponent(docId);
        }
      };
      el.addEventListener('click', handler);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
    });
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Polling ──────────────────────────────────────────────────────────────────

  let previousUnreadCount = 0;

  async function fetchNotifications() {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      const response = await fetch('/api/notifications', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      if (!response.ok) return;

      const data = await response.json();
      const notifications = data.notifications || [];
      window._notifData = notifications;

      const readIds = getReadIds();
      const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

      renderNotifications(notifications);
      updateBadge(unreadCount);

      // Ring bell animation if new unread notifications appeared since last poll
      if (unreadCount > previousUnreadCount && previousUnreadCount !== -1) {
        const bell = document.getElementById('notifBell');
        if (bell) {
          bell.classList.remove('ringing');
          void bell.offsetWidth; // reflow
          bell.classList.add('ringing');
          bell.addEventListener('animationend', () => bell.classList.remove('ringing'), { once: true });
        }
      }
      previousUnreadCount = unreadCount;
    } catch (err) {
      // Silently ignore fetch errors during polling
    }
  }

  // ── History Modal ────────────────────────────────────────────────────────────

  let _hItems = [], _hOldest = null, _hLoading = false, _hHasMore = true,
      _hFilter = 'all', _hObserver = null;

  function _hFmtDate(iso) {
    const d = new Date(iso);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yd = new Date(today); yd.setDate(today.getDate() - 1);
    const dd = new Date(d); dd.setHours(0, 0, 0, 0);
    if (dd.getTime() === today.getTime()) return 'Today';
    if (dd.getTime() === yd.getTime()) return 'Yesterday';
    return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function _hMatchFilter(n) {
    const readIds = getReadIds();
    if (_hFilter === 'unread') return !readIds.has(n.id);
    if (_hFilter === 'request' || _hFilter === 'appointment') return n.type === _hFilter;
    return true;
  }

  function _hMakeItem(n) {
    const isUnread = !getReadIds().has(n.id);
    const el = document.createElement('div');
    el.className = 'nhi-item' + (isUnread ? ' nhi-unread' : '');
    el.dataset.nid = n.id;
    const iBg = notifIconBg(n.event), iCol = notifIconColor(n.event), sCol = statusColor(n.status);
    el.innerHTML =
      '<div class="nhi-icon" style="background:' + iBg + ';color:' + iCol + '">' +
        '<i class="fa-solid ' + notifIcon(n.type) + '"></i>' +
      '</div>' +
      '<div class="nhi-body">' +
        '<p class="nhi-title">' + escHtml(n.title) + '</p>' +
        '<p class="nhi-msg">'   + escHtml(n.message) + '</p>' +
        '<div class="nhi-meta">' +
          '<span class="nhi-time">'  + timeAgo(n.timestamp) + '</span>' +
          '<span class="nhi-badge" style="background:' + sCol + '">' + statusLabel(n.status) + '</span>' +
        '</div>' +
      '</div>' +
      (isUnread ? '<div class="nhi-dot"></div>' : '');
    el.addEventListener('click', function () {
      markRead(n.id);
      el.classList.remove('nhi-unread');
      var dot = el.querySelector('.nhi-dot');
      if (dot) dot.remove();
      if (n.type === 'request') {
        window.location.href = '/admin/request-detail.html?id=' + encodeURIComponent(n.docId);
      } else if (n.type === 'blotter') {
        window.location.href = '/admin/blotter-detail.html?id=' + encodeURIComponent(n.docId);
      } else {
        window.location.href = '/admin/appointments.html?highlight=' + encodeURIComponent(n.docId);
      }
    });
    return el;
  }

  function _hRenderAll() {
    var container = document.getElementById('notifHistItems');
    var empty     = document.getElementById('notifHistEmpty');
    if (!container) return;
    container.innerHTML = '';
    var filtered = _hItems.filter(_hMatchFilter);
    if (empty) empty.style.display = (filtered.length === 0 && !_hHasMore) ? 'block' : 'none';
    var lastDate = null;
    filtered.forEach(function (n) {
      var ds = _hFmtDate(n.timestamp);
      if (ds !== lastDate) {
        var sep = document.createElement('div');
        sep.className = 'nhi-sep'; sep.textContent = ds;
        container.appendChild(sep);
        lastDate = ds;
      }
      container.appendChild(_hMakeItem(n));
    });
  }

  function _hAppend(newItems) {
    var container = document.getElementById('notifHistItems');
    if (!container) return;
    var filtered = newItems.filter(_hMatchFilter);
    var seps = container.querySelectorAll('.nhi-sep');
    var lastDate = seps.length ? seps[seps.length - 1].textContent : null;
    filtered.forEach(function (n) {
      var ds = _hFmtDate(n.timestamp);
      if (ds !== lastDate) {
        var sep = document.createElement('div');
        sep.className = 'nhi-sep'; sep.textContent = ds;
        container.appendChild(sep);
        lastDate = ds;
      }
      container.appendChild(_hMakeItem(n));
    });
    var empty = document.getElementById('notifHistEmpty');
    if (empty && filtered.length > 0) empty.style.display = 'none';
  }

  async function _hLoadPage() {
    if (_hLoading || !_hHasMore) return;
    _hLoading = true;
    var loader = document.getElementById('notifHistLoader');
    var end    = document.getElementById('notifHistEnd');
    if (loader) loader.style.display = 'block';
    if (end)    end.style.display    = 'none';
    try {
      var token = localStorage.getItem('authToken');
      if (!token) return;
      var url = _hOldest
        ? '/api/notifications?before=' + encodeURIComponent(_hOldest)
        : '/api/notifications';
      var resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
      if (!resp.ok) throw new Error('fetch failed');
      var data = await resp.json();
      var newItems = data.notifications || [];
      var existIds = new Set(_hItems.map(function (n) { return n.id; }));
      var fresh = newItems.filter(function (n) { return !existIds.has(n.id); });
      if (fresh.length > 0) {
        _hItems.push.apply(_hItems, fresh);
        _hOldest = _hItems[_hItems.length - 1].timestamp;
        _hAppend(fresh);
      }
      _hHasMore = data.hasMore === true && fresh.length > 0;
    } catch (e) { /* silent */ } finally {
      _hLoading = false;
      var loaderEl = document.getElementById('notifHistLoader');
      var endEl    = document.getElementById('notifHistEnd');
      var emptyEl  = document.getElementById('notifHistEmpty');
      if (loaderEl) loaderEl.style.display = 'none';
      if (!_hHasMore) {
        if (endEl)   endEl.style.display   = 'block';
        if (_hItems.length === 0 && emptyEl) emptyEl.style.display = 'block';
      }
    }
  }

  function buildHistoryModal() {
    if (document.getElementById('notifHistOverlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'notifHistOverlay';
    overlay.innerHTML =
      '<div id="notifHistDrawer">' +
        '<div id="notifHistHdr">' +
          '<h3><i class="fa-solid fa-clock-rotate-left" style="margin-right:7px;color:#f59e0b"></i>All Notifications</h3>' +
          '<button id="notifHistClose" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div id="notifHistTabs">' +
          '<button class="nht-tab nht-active" data-f="all">All</button>' +
          '<button class="nht-tab" data-f="unread">Unread</button>' +
          '<button class="nht-tab" data-f="request">Requests</button>' +
          '<button class="nht-tab" data-f="appointment">Appointments</button>' +
        '</div>' +
        '<div id="notifHistList">' +
          '<div id="notifHistEmpty"><i class="fa-solid fa-bell-slash"></i>No notifications found</div>' +
          '<div id="notifHistItems"></div>' +
          '<div id="notifHistLoader"><i class="fa-solid fa-circle-notch fa-spin" style="margin-right:6px"></i>Loading older notifications…</div>' +
          '<div id="notifHistEnd"><i class="fa-solid fa-circle-check" style="margin-right:6px;color:#10b981"></i>You\'re all caught up!</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeHistoryModal();
    });
    document.getElementById('notifHistClose').addEventListener('click', closeHistoryModal);

    overlay.querySelectorAll('.nht-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        overlay.querySelectorAll('.nht-tab').forEach(function (b) { b.classList.remove('nht-active'); });
        btn.classList.add('nht-active');
        _hFilter = btn.dataset.f;
        _hRenderAll();
      });
    });

    // Infinite scroll via IntersectionObserver on the loader element
    var listEl = document.getElementById('notifHistList');
    var loaderEl = document.getElementById('notifHistLoader');
    _hObserver = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && !_hLoading && _hHasMore) _hLoadPage();
    }, { root: listEl, threshold: 0.1 });
    _hObserver.observe(loaderEl);
  }

  function openHistoryModal() {
    buildHistoryModal();
    closePanel();
    var overlay = document.getElementById('notifHistOverlay');
    overlay.classList.add('hist-open');
    document.body.style.overflow = 'hidden';
    // Seed with data already in the dropdown on first open
    if (_hItems.length === 0 && window._notifData && window._notifData.length > 0) {
      _hItems = window._notifData.slice();
      _hOldest = _hItems[_hItems.length - 1].timestamp;
      _hRenderAll();
    }
    // The IntersectionObserver will trigger _hLoadPage automatically when the
    // loader sentinel enters the viewport, loading older pages as the user scrolls.
  }

  function closeHistoryModal() {
    var overlay = document.getElementById('notifHistOverlay');
    if (overlay) overlay.classList.remove('hist-open');
    document.body.style.overflow = '';
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    if (!document.getElementById(NOTIF_CONTAINER_ID)) return;
    buildStyles();
    buildPanel();

    // Initial load
    previousUnreadCount = -1; // suppress ring on first load
    fetchNotifications().then(() => { previousUnreadCount = 0; });

    // Poll every 30 seconds
    setInterval(fetchNotifications, POLL_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
