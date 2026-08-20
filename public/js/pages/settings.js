'use strict';

buildShell('settings', 'App Control Settings');

function render(settings, staff) {
  const c = content();
  c.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Global App Directives</div>
        <form id="settings-form">
          <div class="form-grid">
            <div class="form-group"><label>App Status</label>
              <select name="app_status">
                <option value="ONLINE" ${settings?.app_status === 'ONLINE' ? 'selected' : ''}>ONLINE</option>
                <option value="MAINTENANCE" ${settings?.app_status === 'MAINTENANCE' ? 'selected' : ''}>MAINTENANCE</option>
              </select>
            </div>
            <div class="form-group"><label>Min Required Version</label>
              <input name="min_required_version" value="${escapeHtml(settings?.min_required_version || '1.0.0')}" placeholder="1.0.0">
            </div>
            <div class="form-group"><label>Daily Spin Limit</label>
              <input name="daily_spin_limit" type="number" min="0" value="${settings?.daily_spin_limit ?? 3}">
            </div>
            <div class="form-group"><label>Auto Reminder Hours</label>
              <input name="auto_reminder_hours" type="number" min="1" value="${settings?.auto_reminder_hours ?? 24}">
            </div>
          </div>
          <button type="submit" class="btn btn-primary">Save Settings</button>
          <p class="form-hint">Changes are applied to the Android app in real time.</p>
        </form>
      </div>

      <div class="card">
        <div class="card-title">Staff &amp; Admin Accounts</div>
        <div class="toolbar" style="margin-bottom:10px">
          <span class="health-pill"><b>${staff.length}</b> accounts</span>
          <button class="btn btn-gold btn-sm" onclick="openModal('staff-modal')">+ Add Staff</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${staff.map((s) => `
                <tr>
                  <td><b>${escapeHtml(s.username)}</b><div class="muted" style="font-size:11.5px">${escapeHtml(s.full_name || '')}</div></td>
                  <td>${badge(s.role)}</td>
                  <td>${s.is_active ? badge('true') : badge('false')}</td>
                  <td>
                    <button class="btn btn-sm btn-outline" onclick="toggleStaff(${s.id})">${s.is_active ? 'Disable' : 'Enable'}</button>
                    <button class="btn btn-sm btn-outline" onclick="staffPassword(${s.id})">Set Password</button>
                    <button class="btn btn-sm btn-outline" onclick="deleteStaff(${s.id})">Delete</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="card-title" style="margin-top:22px">Change My Password</div>
        <form id="pw-form" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end">
          <div class="form-group" style="margin:0"><label>Current</label><input type="password" name="current_password" required></div>
          <div class="form-group" style="margin:0"><label>New (min 8 chars)</label><input type="password" name="new_password" required></div>
          <button type="submit" class="btn btn-outline">Change</button>
        </form>
      </div>
    </div>

    <div class="modal-overlay" id="staff-modal">
      <div class="modal">
        <div class="modal-header"><h3>Add Staff Account</h3><button class="modal-close">&times;</button></div>
        <form id="staff-form">
          <div class="modal-body">
            <div class="form-group"><label>Username *</label><input name="username" required></div>
            <div class="form-group"><label>Full Name</label><input name="full_name"></div>
            <div class="form-group"><label>Password * (min 8 chars)</label><input name="password" type="password" required></div>
            <div class="form-group"><label>Role</label>
              <select name="role"><option value="STAFF">STAFF</option><option value="ADMIN">ADMIN</option></select>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal('staff-modal')">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Staff</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function load() {
  const [settings, staff] = await Promise.all([
    API.get('/api/admin/settings'),
    API.get('/api/admin/settings/staff')
  ]);
  render(settings, staff);
}

window.toggleStaff = async (id) => {
  try {
    const staff = await API.get('/api/admin/settings/staff');
    const s = staff.find((x) => x.id === id);
    await API.put(`/api/admin/settings/staff/${id}`, { is_active: !s.is_active });
    toast(s.is_active ? 'Staff disabled' : 'Staff enabled');
    load();
  } catch (err) { toast(err.message, true); }
};

window.staffPassword = (id) => {
  const pw = prompt('Enter a new password (min 8 characters):');
  if (pw === null) return;
  API.put(`/api/admin/settings/staff/${id}`, { password: pw })
    .then(() => toast('Password updated'))
    .catch((err) => toast(err.message, true));
};

window.deleteStaff = async (id) => {
  if (!confirm('Delete this staff account?')) return;
  try {
    await API.del(`/api/admin/settings/staff/${id}`);
    toast('Staff deleted');
    load();
  } catch (err) { toast(err.message, true); }
};

document.addEventListener('submit', (e) => {
  if (e.target.id === 'settings-form') {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.daily_spin_limit = Number(body.daily_spin_limit);
    body.auto_reminder_hours = Number(body.auto_reminder_hours);
    API.put('/api/admin/settings', body)
      .then(() => toast('Global settings saved (live)'))
      .catch((err) => toast(err.message, true));
  }
  if (e.target.id === 'pw-form') {
    e.preventDefault();
    const fd = new FormData(e.target);
    API.put('/api/admin/auth/password', Object.fromEntries(fd.entries()))
      .then(() => { toast('Password changed'); e.target.reset(); })
      .catch((err) => toast(err.message, true));
  }
  if (e.target.id === 'staff-form') {
    e.preventDefault();
    const fd = new FormData(e.target);
    API.post('/api/admin/settings/staff', Object.fromEntries(fd.entries()))
      .then(() => { toast('Staff account created'); closeModal('staff-modal'); e.target.reset(); load(); })
      .catch((err) => toast(err.message, true));
  }
});

load().catch((err) => toast(err.message, true));