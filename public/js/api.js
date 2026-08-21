'use strict';

/* Shared API client + UI helpers for the GoldData admin web-app. */

const API = {
  token: localStorage.getItem('gd_token') || '',

  async request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const res = await fetch(path, { ...options, headers });
    if (res.status === 401 && !path.endsWith('/auth/login')) {
      logout();
      throw new Error('Session expired. Please log in again.');
    }
    let data = {};
    try { data = await res.json(); } catch (_) { /* non-JSON */ }
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    if (window.splashEndpointLoaded) window.splashEndpointLoaded();
    return data.data;
  },

  get(path) { return this.request(path); },
  post(path, body) { return this.request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }); },
  put(path, body) { return this.request(path, { method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) }); },
  del(path) { return this.request(path, { method: 'DELETE' }); }
};

function logout() {
  localStorage.removeItem('gd_token');
  location.href = 'index.html';
}

function requireAuth() {
  if (!API.token) location.href = 'index.html';
}

function fmtMoney(n) {
  return '\u20A6' + Number(n || 0).toLocaleString();
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function badge(value) {
  const map = {
    active: 'badge-green', banned: 'badge-red', SUCCESS: 'badge-green', FAILED: 'badge-red',
    ONLINE: 'badge-green', MAINTENANCE: 'badge-gold', ADMIN: 'badge-gold', STAFF: 'badge-blue',
    true: 'badge-green', false: 'badge-gray', DATA: 'badge-blue', POINTS: 'badge-gold', NONE: 'badge-gray'
  };
  return `<span class="badge ${map[value] || 'badge-gray'}">${escapeHtml(String(value))}</span>`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function toast(message, isError = false) {
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast${isError ? ' error' : ''}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

/**
 * Delegated modal close: works for modals created at any time.
 * Close via the ✕ button, a Cancel button's onclick, or clicking the overlay.
 */
function modalCloseButtons() {
  if (modalCloseButtons._bound) return;
  modalCloseButtons._bound = true;
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.modal-close');
    if (closeBtn) {
      closeBtn.closest('.modal-overlay')?.classList.remove('open');
      return;
    }
    if (e.target.classList && e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('open');
    }
  });
}

function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------- Report printing & exports ---------- */

function downloadFile(content, filename, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Export rows to CSV. columns: [{ label, key }] or [{ label, value(row) }].
 * A UTF-8 BOM is prepended so Excel renders the Naira sign correctly.
 */
function exportRowsCSV(rows, columns, filename) {
  const head = columns.map((c) => csvCell(c.label)).join(',');
  const lines = rows.map((r) =>
    columns.map((c) => csvCell(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(',')
  );
  downloadFile('\uFEFF' + [head, ...lines].join('\r\n'), filename, 'text/csv;charset=utf-8');
}

function exportRowsJSON(rows, filename) {
  downloadFile(
    JSON.stringify({ exported_at: new Date().toISOString(), count: rows.length, rows }, null, 2),
    filename,
    'application/json'
  );
}

/**
 * Print the current page as a clean A4 report (see @media print styles).
 * Injects a branded header with title + meta line (filters, record count, timestamp).
 */
function printReport(title, metaText) {
  let header = document.getElementById('print-header');
  if (!header) {
    header = document.createElement('div');
    header.id = 'print-header';
    document.body.prepend(header);
  }
  header.innerHTML = `
    <div class="ph-brand"><span class="ph-logo">G</span>GoldData Admin Console</div>
    <div class="ph-title">${escapeHtml(title)}</div>
    <div class="ph-meta">${escapeHtml(metaText || '')}</div>
  `;
  const cleanup = () => { header.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}