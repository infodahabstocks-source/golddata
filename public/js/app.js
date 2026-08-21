'use strict';

/* Shared admin shell: sidebar + topbar + logout. */

const NAV_ITEMS = [
  { id: 'dashboard', icon: '\u25C8', label: 'Dashboard', href: 'dashboard.html' },
  { id: 'packages', icon: '\u229E', label: 'Data Packages', href: 'packages.html' },
  { id: 'spin', icon: '\u27F3', label: 'Spin Wheel', href: 'spin.html' },
  { id: 'banners', icon: '\u25A3', label: 'Banner Ads', href: 'banners.html' },
  { id: 'users', icon: '\u25C9', label: 'Users & Security', href: 'users.html' },
  { id: 'transactions', icon: '\u2630', label: 'Transaction Logs', href: 'transactions.html' },
  { id: 'database', icon: '\u{1F5C3}', label: 'Database Management', href: 'database.html' },
  { id: 'settings', icon: '\u2699', label: 'App Settings', href: 'settings.html' }
];

function buildShell(pageId, title) {
  requireAuth();
  const splash = document.getElementById('app-splash');
  document.body.innerHTML = '';

  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <img src="images/logo.webp" alt="GoldData logo" class="sidebar-logo">
      <div>
        <div class="sidebar-title">GoldData</div>
        <div class="sidebar-sub">Admin Console</div>
      </div>
    </div>
    <nav class="sidebar-nav">
      ${NAV_ITEMS.map((n) => `
        <a class="nav-item ${n.id === pageId ? 'active' : ''}" href="${n.href}">
          <span class="nav-icon">${n.icon}</span>${n.label}
        </a>`).join('')}
    </nav>
    <div class="sidebar-footer">
      <button class="btn btn-gold" style="width:100%;justify-content:center" onclick="logout()">Log out</button>
    </div>
  `;

  const main = document.createElement('main');
  main.className = 'main';
  main.innerHTML = `
    <header class="topbar">
      <div class="topbar-title">${escapeHtml(title)}</div>
      <div class="topbar-right">
        <span class="staff-chip" id="staff-chip">Loading\u2026</span>
      </div>
    </header>
    <div class="content" id="page-content"></div>
  `;

  document.body.appendChild(sidebar);
  document.body.appendChild(main);
  if (splash) document.body.appendChild(splash);
  modalCloseButtons();

  API.get('/api/admin/auth/me').then((staff) => {
    const chip = document.getElementById('staff-chip');
    if (chip) chip.textContent = `${staff.username} \u00B7 ${staff.role}`;
  }).catch(() => {});
}

function content() {
  return document.getElementById('page-content');
}