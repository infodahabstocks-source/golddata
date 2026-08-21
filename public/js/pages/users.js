'use strict';

buildShell('users', 'Users & Security Management');

let page = 1;
let lastData = null;

function userFilterParams() {
  const params = new URLSearchParams();
  const q = document.getElementById('user-search')?.value || '';
  const status = document.getElementById('user-status')?.value || '';
  const date = document.getElementById('user-date')?.value || '';
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (date) params.set('date', date);
  return params;
}

function userFilterMeta() {
  const bits = [];
  const q = document.getElementById('user-search')?.value;
  const status = document.getElementById('user-status')?.value;
  const date = document.getElementById('user-date')?.value;
  if (q) bits.push(`search "${q}"`);
  if (status) bits.push(`status: ${status}`);
  if (date) bits.push(`joined: ${date}`);
  return bits.length ? bits.join(' \u00B7 ') : 'all records';
}

async function fetchAllFilteredUsers() {
  const base = userFilterParams();
  base.set('limit', '200');
  const first = await API.get(`/api/admin/users?${base}page=1`);
  const rows = [...first.rows];
  for (let p = 2; p <= first.pages; p++) {
    const next = await API.get(`/api/admin/users?${base}page=${p}`);
    rows.push(...next.rows);
  }
  return rows;
}

function render(data) {
  lastData = data;
  const c = content();
  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-input" id="user-search" placeholder="Search username, phone or ID\u2026">
        <select id="user-status" style="width:auto">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
        </select>
        <input type="date" id="user-date" style="width:auto" title="Filter by join date">
      </div>
      <div class="toolbar-right">
        <span class="health-pill"><b>${data.total}</b> users</span>
        <button class="btn btn-sm btn-outline" onclick="printUsersReport()">Print Report</button>
        <button class="btn btn-sm btn-outline" onclick="exportUsers('csv')">Export CSV</button>
        <button class="btn btn-sm btn-outline" onclick="exportUsers('json')">Export JSON</button>
        <button class="btn btn-gold" onclick="openModal('user-create-modal')">+ New User</button>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>User</th><th>Phone</th><th>Points</th><th>Status</th><th>Created</th><th class="no-print">Actions</th></tr></thead>
          <tbody>
            ${data.rows.length ? data.rows.map((u) => `
              <tr>
                <td>#${u.id}</td>
                <td>
                  <div class="user-cell">
                    <div class="avatar">${escapeHtml(u.username[0].toUpperCase())}</div>
                    <b>${escapeHtml(u.username)}</b>
                  </div>
                </td>
                <td>${escapeHtml(u.phone_number)}</td>
                <td><b>${u.points_balance}</b></td>
                <td>${badge(u.status)}</td>
                <td class="muted">${fmtDate(u.created_at)}</td>
                <td class="no-print">
                  <button class="btn btn-sm btn-outline" onclick="viewUser(${u.id})">Inspect</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">Delete</button>
                </td>
              </tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">No users found</div></td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <button class="btn btn-sm btn-outline" onclick="changePage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>Prev</button>
        <span>Page ${data.page} of ${data.pages}</span>
        <button class="btn btn-sm btn-outline" onclick="changePage(${page + 1})" ${page >= data.pages ? 'disabled' : ''}>Next</button>
      </div>
    </div>

    <div class="modal-overlay" id="user-modal">
      <div class="modal" style="max-width:760px">
        <div class="modal-header"><h3 id="user-modal-title">User Details</h3><button class="modal-close">&times;</button></div>
        <div class="modal-body" id="user-modal-body"></div>
      </div>
    </div>

    <div class="modal-overlay" id="user-create-modal">
      <div class="modal">
        <div class="modal-header">
          <h3>Create New User</h3>
          <button class="modal-close">&times;</button>
        </div>
        <form id="user-create-form">
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group"><label>Username *</label><input name="username" required minlength="3" placeholder="e.g. john_doe"></div>
              <div class="form-group"><label>Phone Number *</label><input name="phone_number" required placeholder="e.g. 08123456789"></div>
              <div class="form-group"><label>PIN (4-8 digits) *</label><input name="pin" required pattern="[0-9]{4,8}" placeholder="e.g. 1234"></div>
              <div class="form-group"><label>Starting Points</label><input name="points_balance" type="number" min="0" step="1" value="0"></div>
              <div class="form-group"><label>Status</label>
                <select name="status"><option value="active">Active</option><option value="banned">Banned</option></select>
              </div>
            </div>
            <div class="form-hint">The account is created immediately and can sign in on the Android app with the phone number and PIN.</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal('user-create-modal')">Cancel</button>
            <button type="submit" class="btn btn-primary">Create User</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('user-search').addEventListener('input', debounce(() => { page = 1; load(); }, 350));
  document.getElementById('user-status').addEventListener('change', () => { page = 1; load(); });
  document.getElementById('user-date').addEventListener('change', () => { page = 1; load(); });
}

window.changePage = (p) => {
  if (p < 1) return;
  page = p;
  load();
};

window.printUsersReport = () => {
  printReport(
    'Users Report',
    `${userFilterMeta()} \u2014 ${lastData ? lastData.total : 0} record(s) \u2014 generated ${fmtTime(new Date().toISOString())}`
  );
};

window.exportUsers = async (fmt) => {
  try {
    const rows = await fetchAllFilteredUsers();
    if (!rows.length) return toast('No records match the current filters', true);
    const stamp = new Date().toISOString().slice(0, 10);
    if (fmt === 'csv') {
      exportRowsCSV(rows, [
        { label: 'ID', key: 'id' },
        { label: 'Username', key: 'username' },
        { label: 'Phone', key: 'phone_number' },
        { label: 'Points', key: 'points_balance' },
        { label: 'Status', key: 'status' },
        { label: 'Created', key: 'created_at' }
      ], `golddata-users-${stamp}.csv`);
    } else {
      exportRowsJSON(rows, `golddata-users-${stamp}.json`);
    }
    toast(`Exported ${rows.length} user record(s)`);
  } catch (err) { toast(err.message, true); }
};

window.viewUser = async (id) => {
  try {
    const { user, history } = await API.get(`/api/admin/users/${id}`);
    const body = document.getElementById('user-modal-body');
    body.innerHTML = `
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px">
        <div class="avatar" style="width:56px;height:56px;font-size:20px">${escapeHtml(user.username[0].toUpperCase())}</div>
        <div>
          <div style="font-size:17px;font-weight:700">${escapeHtml(user.username)}</div>
          <div class="muted" style="font-size:13px">${escapeHtml(user.phone_number)} \u00B7 joined ${fmtDate(user.created_at)}</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-size:20px;font-weight:800;color:var(--emerald)">${user.points_balance} pts</div>
          <div class="muted">${history.length} transactions</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
        <button class="btn btn-sm ${user.status === 'banned' ? 'btn-primary' : 'btn-danger'}" onclick="setStatus(${user.id}, '${user.status === 'banned' ? 'active' : 'banned'}')">${user.status === 'banned' ? 'Unban Account' : 'Ban Account'}</button>
        <button class="btn btn-sm btn-outline" onclick="resetPin(${user.id})">Reset PIN</button>
        <button class="btn btn-sm btn-outline" onclick="adjustPoints(${user.id}, ${user.points_balance})">Adjust Points</button>
        <button class="btn btn-sm btn-outline" onclick="editProfile(${user.id})">Edit Profile</button>
        <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})">Delete Account</button>
      </div>
      <div class="card-title">Transaction History</div>
      <div class="table-wrap" style="max-height:280px;overflow-y:auto">
        <table>
          <thead><tr><th>ID</th><th>Kind</th><th>Details</th><th>Amount</th><th>SIM</th><th>Status</th><th>Time</th></tr></thead>
          <tbody>
            ${history.length ? history.map((t) => `
              <tr>
                <td>#${t.id}</td>
                <td>${badge(t.kind)}</td>
                <td class="muted">${escapeHtml(t.notes || '')}</td>
                <td>${t.kind === 'PURCHASE' ? fmtMoney(t.amount_paid) : (t.points_awarded ? '+' + t.points_awarded + ' pts' : '\u2014')}</td>
                <td class="muted">${escapeHtml(t.sim_slot_used || '\u2014')}</td>
                <td>${badge(t.status)}</td>
                <td class="muted">${fmtTime(t.timestamp)}</td>
              </tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">No activity yet</div></td></tr>'}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('user-modal-title').textContent = `User #${user.id}`;
    openModal('user-modal');
  } catch (err) { toast(err.message, true); }
};

window.setStatus = async (id, status) => {
  try {
    await API.put(`/api/admin/users/${id}/status`, { status });
    toast(status === 'banned' ? 'Account banned' : 'Account reactivated');
    viewUser(id);
    load();
  } catch (err) { toast(err.message, true); }
};

window.resetPin = async (id) => {
  const pin = prompt('Enter a new 4-8 digit PIN for this user:');
  if (pin === null) return;
  try {
    await API.put(`/api/admin/users/${id}/pin`, { new_pin: pin });
    toast('PIN reset successful');
  } catch (err) { toast(err.message, true); }
};

window.adjustPoints = (id, current) => {
  const delta = prompt(`Current balance: ${current} points. Enter a DELTA (+/-):`, '+');
  if (delta === null || delta === '') return;
  try {
    API.put(`/api/admin/users/${id}/points`, { delta: Number(delta) })
      .then((r) => { toast(`Balance is now ${r.points_balance} points`); viewUser(id); load(); })
      .catch((err) => toast(err.message, true));
  } catch { toast('Delta must be a number', true); }
};

window.editProfile = (id) => {
  const username = prompt('New username:');
  if (username === null) return;
  API.put(`/api/admin/users/${id}/profile`, { username: username.trim() })
    .then(() => { toast('Profile updated'); viewUser(id); load(); })
    .catch((err) => toast(err.message, true));
};

window.deleteUser = async (id) => {
  if (!confirm('Permanently delete this account and ALL its transactions?\n\nThis cannot be undone.')) return;
  try {
    const r = await API.del(`/api/admin/users/${id}`);
    toast(`Account #${r.deleted} deleted (${r.transactions_deleted} transaction(s) removed)`);
    closeModal('user-modal');
    load();
  } catch (err) { toast(err.message, true); }
};

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'user-create-form') return;
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  body.points_balance = Number(body.points_balance || 0);
  API.post('/api/admin/users', body)
    .then((u) => {
      toast(`User #${u.id} (${u.username}) created`);
      closeModal('user-create-modal');
      e.target.reset();
      page = 1;
      load();
    })
    .catch((err) => toast(err.message, true));
});

async function load() {
  const params = userFilterParams();
  params.set('page', page);
  params.set('limit', 25);
  const data = await API.get(`/api/admin/users?${params}`);
  render(data);
}

load().catch((err) => toast(err.message, true));
