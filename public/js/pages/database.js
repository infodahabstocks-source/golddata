'use strict';

buildShell('database', 'Database Management');

let currentTable = null;
let tableRows = [];

/* ============================================================
   Render: connection config
   ============================================================ */

function renderConnection(conn) {
  const el = document.getElementById('conn-fields');
  el.innerHTML = `
    <div class="form-group">
      <label for="db-host">Host / Server Domain</label>
      <input id="db-host" value="${escapeHtml(conn.host)}" placeholder="yourdomain.com">
    </div>
    <div class="form-group">
      <label for="db-user">Database Username</label>
      <input id="db-user" value="${escapeHtml(conn.username)}" placeholder="luka">
    </div>
    <div class="form-group">
      <label for="db-pass">Database Password</label>
      <div style="display:flex;gap:8px">
        <input id="db-pass" type="password" value="" placeholder="${conn.password_set ? 'Keep current password (leave blank)' : 'Set a password'}" autocomplete="new-password">
        <button type="button" class="btn btn-outline btn-sm" id="pass-toggle" title="Show / hide password">Show</button>
      </div>
    </div>
    <div class="form-group">
      <label for="db-name">Database Name</label>
      <input id="db-name" value="${escapeHtml(conn.db_name)}" placeholder="goldatadb">
    </div>
    <div class="form-hint">
      Data directory: <code>${escapeHtml(conn.data_dir)}</code> &middot; Configuration file: <code>${escapeHtml(conn.env_file)}</code>
    </div>
    <div id="conn-status" style="margin-top:14px"></div>
  `;

  const passInput = document.getElementById('db-pass');
  const toggle = document.getElementById('pass-toggle');
  toggle.addEventListener('click', () => {
    const show = passInput.type === 'password';
    passInput.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Hide' : 'Show';
  });
}

function connValues() {
  return {
    host: document.getElementById('db-host').value.trim(),
    username: document.getElementById('db-user').value.trim(),
    password: document.getElementById('db-pass').value,
    db_name: document.getElementById('db-name').value.trim()
  };
}

async function testConnection() {
  const status = document.getElementById('conn-status');
  status.innerHTML = '<span class="health-pill">Testing connection\u2026</span>';
  const btn = document.getElementById('btn-test-conn');
  btn.disabled = true;
  try {
    const result = await API.post('/api/admin/database/connection/test', connValues());
    const checks = (result.checks || []).map((c) => `
      <div style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <span class="badge ${c.pass ? 'badge-green' : 'badge-red'}">${c.pass ? 'PASS' : 'FAIL'}</span>
        <span>${escapeHtml(c.name)}</span>
        ${c.note ? `<span class="muted" style="font-size:12px">- ${escapeHtml(c.note)}</span>` : ''}
      </div>`).join('');
    status.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span class="badge ${result.ok ? 'badge-green' : 'badge-red'}">${result.ok ? 'CONNECTED' : 'FAILED'}</span>
        <b>${escapeHtml(result.message)}</b>
      </div>
      ${checks}
    `;
    toast(result.ok ? 'Connection test passed' : 'Connection test failed', !result.ok);
  } catch (err) {
    status.innerHTML = `<span class="badge badge-red">ERROR</span> ${escapeHtml(err.message)}`;
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function saveConnection() {
  if (!confirm('Save these database credentials to the configuration file and reconnect the live database?')) return;
  const btn = document.getElementById('btn-save-conn');
  btn.disabled = true;
  btn.textContent = 'Saving\u2026';
  try {
    const result = await API.put('/api/admin/database/connection', connValues());
    toast(result.message || 'Connection configuration saved');
    renderConnection(result);
    loadTables();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Configuration';
  }
}

/* ============================================================
   Render: table explorer + data inspector
   ============================================================ */

async function loadTables() {
  try {
    const tables = await API.get('/api/admin/database/tables');
    const el = document.getElementById('table-list');
    el.innerHTML = `
      <table>
        <thead><tr><th>Table</th><th>Records</th><th>File</th><th></th></tr></thead>
        <tbody>
          ${tables.length ? tables.map((t) => `
            <tr>
              <td><b>${escapeHtml(t.name)}</b></td>
              <td><span class="badge badge-gold">${t.count}</span></td>
              <td class="muted" style="font-family:Consolas,monospace;font-size:12px">${escapeHtml(t.file.split(/[\\/]/).pop())}</td>
              <td><button class="btn btn-sm btn-outline" onclick="openTable('${escapeHtml(t.name)}')">Inspect</button></td>
            </tr>`).join('') : '<tr><td colspan="4"><div class="empty-state">No tables found in this database</div></td></tr>'}
        </tbody>
      </table>`;
  } catch (err) { toast(err.message, true); }
}

window.openTable = async (name) => {
  try {
    const data = await API.get(`/api/admin/database/tables/${name}`);
    currentTable = name;
    tableRows = data.rows;
    renderInspector();
  } catch (err) { toast(err.message, true); }
};

window.backToExplorer = () => {
  currentTable = null;
  tableRows = [];
  document.getElementById('inspector').style.display = 'none';
  document.getElementById('explorer').style.display = 'block';
};

function renderInspector() {
  const explorer = document.getElementById('explorer');
  const inspector = document.getElementById('inspector');
  explorer.style.display = 'none';
  inspector.style.display = 'block';

  const columns = Array.from(
    tableRows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set())
  );

  inspector.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-outline btn-sm" onclick="backToExplorer()">&larr; All tables</button>
        <span class="health-pill">Table <b>${escapeHtml(currentTable)}</b> &middot; ${tableRows.length} records</span>
      </div>
      <div class="toolbar-right">
        <input class="search-input" id="inspector-search" placeholder="Search records\u2026">
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}<th></th></tr></thead>
          <tbody id="inspector-body"></tbody>
        </table>
      </div>
    </div>
  `;

  const renderRows = (filter) => {
    const tbody = document.getElementById('inspector-body');
    const q = (filter || '').toLowerCase();
    const matches = tableRows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => !q || JSON.stringify(row).toLowerCase().includes(q));
    tbody.innerHTML = matches.length ? matches.map(({ row, idx }) => `
      <tr>
        ${columns.map((c) => `<td>${escapeHtml(row[c] !== undefined ? String(row[c]) : '\u2014')}</td>`).join('')}
        <td><button class="btn btn-sm btn-outline" onclick="viewRowJSON(${idx})">JSON</button></td>
      </tr>`).join('') : '<tr><td colspan="99"><div class="empty-state">No records match</div></td></tr>';
  };

  renderRows('');
  document.getElementById('inspector-search').addEventListener('input', (e) => renderRows(e.target.value));
}

window.viewRowJSON = (idx) => {
  const row = tableRows[idx];
  if (!row) return;
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(row, null, 2);
  pre.style.cssText = 'background:#0a3a2a;color:#f1f5f9;padding:14px;border-radius:8px;font-size:12px;max-height:50vh;overflow:auto;white-space:pre-wrap;word-break:break-all';
  document.getElementById('row-json').innerHTML = '';
  document.getElementById('row-json').appendChild(pre);
  openModal('row-json-modal');
};

/* ============================================================
   Backup & restore
   ============================================================ */

window.downloadBackup = async () => {
  try {
    const res = await fetch('/api/admin/database/backup', {
      headers: { Authorization: `Bearer ${API.token}` }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `goldatadb-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast('Backup downloaded');
  } catch (err) { toast(err.message, true); }
};

function bindRestoreForm() {
  const form = document.getElementById('restore-form');
  if (!form || form._bound) return;
  form._bound = true;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('restore-file');
    if (!fileInput.files.length) return toast('Choose a backup .json file first', true);
    if (!confirm('Restore will OVERWRITE the tables contained in this backup. Continue?')) return;

    const btn = document.getElementById('btn-restore');
    btn.disabled = true;
    btn.textContent = 'Restoring\u2026';
    try {
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      const result = await API.post('/api/admin/database/restore', fd);
      toast(result.message || 'Database restored');
      loadTables();
      fileInput.value = '';
    } catch (err) { toast(err.message, true); }
    finally {
      btn.disabled = false;
      btn.textContent = 'Restore Backup';
    }
  });
}

/* ============================================================
   Initial render
   ============================================================ */

async function init() {
  const c = content();
  c.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Database Connection Configuration</div>
        <div id="conn-fields"></div>
        <div style="display:flex;gap:10px;margin-top:8px">
          <button class="btn btn-primary" id="btn-test-conn">Test Connection</button>
          <button class="btn btn-outline" id="btn-save-conn">Save Configuration</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Backup &amp; Restore</div>
        <p class="form-hint" style="margin-bottom:14px">
          Download a complete JSON bundle of <b>${escapeHtml((await API.get('/api/admin/database/connection')).db_name)}</b>
          (all tables) or restore from a previously downloaded backup. Restore overwrites the matching tables.
        </p>
        <button class="btn btn-gold" onclick="downloadBackup()">&#11015; Download Full Backup</button>
        <form id="restore-form" style="margin-top:18px">
          <label for="restore-file">Restore from backup file (.json)</label>
          <input id="restore-file" type="file" accept="application/json,.json" style="margin-bottom:10px">
          <button type="submit" class="btn btn-primary" id="btn-restore">Restore Backup</button>
        </form>
      </div>
    </div>

    <div class="card" id="explorer">
      <div class="card-title">Table Explorer</div>
      <div class="table-wrap" id="table-list"></div>
    </div>
    <div id="inspector" style="display:none"></div>

    <div class="modal-overlay" id="row-json-modal">
      <div class="modal" style="max-width:640px">
        <div class="modal-header">
          <h3>Record JSON</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" id="row-json"></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal('row-json-modal')">Close</button>
        </div>
      </div>
    </div>
  `;

  try {
    const conn = await API.get('/api/admin/database/connection');
    renderConnection(conn);
  } catch (err) { toast(err.message, true); }
  loadTables();

  document.getElementById('btn-test-conn').addEventListener('click', testConnection);
  document.getElementById('btn-save-conn').addEventListener('click', saveConnection);
  bindRestoreForm();
}

init().catch((err) => toast(err.message, true));