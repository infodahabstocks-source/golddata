'use strict';

buildShell('database', 'Database Management');

/* ============================================================
   State
   ============================================================ */

let tablesList = [];
let currentTable = null;
let tableMeta = null;
let tableRows = [];
let filteredRows = [];
let pendingConfirm = null;

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function isIsoDate(v) {
  return typeof v === 'string' && ISO_RE.test(v);
}

function cellText(v) {
  if (v === null || v === undefined || v === '') return '\u2014';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

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
   Table explorer
   ============================================================ */

async function loadTables() {
  try {
    tablesList = await API.get('/api/admin/database/tables');
    const el = document.getElementById('table-list');
    el.innerHTML = `
      <table>
        <thead><tr><th>Table</th><th>Records</th><th>File</th><th></th></tr></thead>
        <tbody>
          ${tablesList.length ? tablesList.map((t) => `
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

/* ============================================================
   Data inspector (dynamic CRUD + search/filter + report)
   ============================================================ */

window.openTable = async (name) => {
  try {
    const data = await API.get(`/api/admin/db/${name}`);
    currentTable = name;
    tableMeta = { columns: data.columns, file: data.file };
    tableRows = data.rows;
    renderInspector();
  } catch (err) { toast(err.message, true); }
};

window.backToExplorer = () => {
  currentTable = null;
  tableMeta = null;
  tableRows = [];
  filteredRows = [];
  document.getElementById('inspector').style.display = 'none';
  document.getElementById('explorer').style.display = 'block';
};

function renderInspector() {
  const explorer = document.getElementById('explorer');
  const inspector = document.getElementById('inspector');
  explorer.style.display = 'none';
  inspector.style.display = 'block';

  inspector.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-outline btn-sm" onclick="backToExplorer()">&larr; All tables</button>
        <select id="inspector-table" style="width:auto" onchange="openTable(this.value)">
          ${tablesList.map((t) => `<option value="${escapeHtml(t.name)}" ${t.name === currentTable ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
        </select>
        <span class="health-pill">Table <b>${escapeHtml(currentTable)}</b> &middot; <b id="inspector-count">0</b> of ${tableRows.length} records</span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-sm btn-outline" onclick="printDbReport()">Print Report</button>
        <button class="btn btn-sm btn-outline" onclick="exportDb('csv')">Export CSV</button>
        <button class="btn btn-sm btn-outline" onclick="exportDb('json')">Export JSON</button>
        <button class="btn btn-gold btn-sm" onclick="openRowEditor('create')">+ Add New Row</button>
      </div>
    </div>
    <div class="card no-print" style="margin-bottom:16px;padding:14px 20px">
      <div id="inspector-filters" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end"></div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr id="inspector-head"></tr></thead>
          <tbody id="inspector-tbody"></tbody>
        </table>
      </div>
    </div>

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

    <div class="modal-overlay" id="row-editor-modal">
      <div class="modal" style="max-width:640px">
        <div class="modal-header">
          <h3 id="row-editor-title">Add record</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" id="row-editor-body"></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal('row-editor-modal')">Cancel</button>
          <button type="button" class="btn btn-primary" onclick="saveRow()">Save Record</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" id="confirm-modal">
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h3 id="confirm-title">Confirm</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body"><p id="confirm-text" style="font-size:13.5px"></p></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal('confirm-modal')">Cancel</button>
          <button type="button" class="btn btn-danger" onclick="confirmYes()">Delete Permanently</button>
        </div>
      </div>
    </div>
  `;

  buildInspectorFilters();
  applyInspectorFilters();
}

/* ---------- Filters: global search + per-column dropdowns + date ranges ---------- */

function buildInspectorFilters() {
  const wrap = document.getElementById('inspector-filters');
  const selects = [];
  const dateCols = [];

  (tableMeta?.columns || []).forEach((col) => {
    if (col.name === 'id' || selects.length >= 4 || dateCols.length >= 2) return;
    const values = tableRows
      .map((r) => r[col.name])
      .filter((v) => v !== null && v !== undefined && typeof v !== 'object');
    if (values.some((v) => isIsoDate(v))) {
      dateCols.push(col.name);
      return;
    }
    if (col.type === 'boolean') {
      selects.push({ name: col.name, values: ['true', 'false'] });
      return;
    }
    const strings = [...new Set(values.map(String))];
    if (strings.length >= 1 && strings.length <= 6 && strings.every((s) => s.length <= 24)) {
      selects.push({ name: col.name, values: strings.sort() });
    }
  });

  wrap.innerHTML = `
    <div style="flex:1;min-width:220px">
      <label>Search all columns</label>
      <input class="search-input" id="inspector-search" style="max-width:none;width:100%" placeholder="Match IDs, phones, statuses, amounts, dates\u2026">
    </div>
    ${selects.map((f) => `
      <div>
        <label>${escapeHtml(f.name)}</label>
        <select class="inspector-col-filter" data-col="${escapeHtml(f.name)}" style="width:auto;min-width:110px">
          <option value="">All</option>
          ${f.values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}
        </select>
      </div>`).join('')}
    ${dateCols.map((name) => `
      <div>
        <label>${escapeHtml(name)} from</label>
        <input type="date" class="inspector-date-from" data-col="${escapeHtml(name)}" style="width:auto">
      </div>
      <div>
        <label>${escapeHtml(name)} to</label>
        <input type="date" class="inspector-date-to" data-col="${escapeHtml(name)}" style="width:auto">
      </div>`).join('')}
  `;

  document.getElementById('inspector-search').addEventListener('input', debounce(applyInspectorFilters, 250));
  wrap.querySelectorAll('.inspector-col-filter').forEach((el) => el.addEventListener('change', applyInspectorFilters));
  wrap.querySelectorAll('.inspector-date-from, .inspector-date-to').forEach((el) => el.addEventListener('change', applyInspectorFilters));
}

function inspectorFilterMeta() {
  const bits = [];
  const q = document.getElementById('inspector-search')?.value.trim();
  if (q) bits.push(`search "${q}"`);
  document.querySelectorAll('#inspector-filters .inspector-col-filter').forEach((sel) => {
    if (sel.value !== '') bits.push(`${sel.dataset.col}: ${sel.value}`);
  });
  document.querySelectorAll('#inspector-filters .inspector-date-from').forEach((el) => {
    if (el.value) bits.push(`${el.dataset.col} from ${el.value}`);
  });
  document.querySelectorAll('#inspector-filters .inspector-date-to').forEach((el) => {
    if (el.value) bits.push(`${el.dataset.col} to ${el.value}`);
  });
  return bits.length ? bits.join(' \u00B7 ') : 'all records';
}

function applyInspectorFilters() {
  const q = (document.getElementById('inspector-search')?.value || '').trim().toLowerCase();
  const colSels = [...document.querySelectorAll('#inspector-filters .inspector-col-filter')]
    .filter((sel) => sel.value !== '')
    .map((sel) => ({ col: sel.dataset.col, val: sel.value.toLowerCase() }));
  const ranges = [
    ...[...document.querySelectorAll('#inspector-filters .inspector-date-from')]
      .filter((el) => el.value)
      .map((el) => ({ col: el.dataset.col, from: el.value })),
    ...[...document.querySelectorAll('#inspector-filters .inspector-date-to')]
      .filter((el) => el.value)
      .map((el) => ({ col: el.dataset.col, to: el.value }))
  ];

  filteredRows = tableRows.filter((row) => {
    if (q && !JSON.stringify(row).toLowerCase().includes(q)) return false;
    for (const f of colSels) {
      if (cellText(row[f.col]).toLowerCase() !== f.val) return false;
    }
    for (const r of ranges) {
      const day = String(row[r.col] || '').slice(0, 10);
      if (r.from && (!day || day < r.from)) return false;
      if (r.to && (!day || day > r.to)) return false;
    }
    return true;
  });

  renderInspectorBody();
}

function renderInspectorBody() {
  const columns = (tableMeta?.columns || []).map((c) => c.name);
  document.getElementById('inspector-count').textContent = filteredRows.length;
  document.getElementById('inspector-head').innerHTML =
    `${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}<th class="no-print">Actions</th>`;
  document.getElementById('inspector-tbody').innerHTML = filteredRows.length
    ? filteredRows.map((row) => `
      <tr>
        ${columns.map((c) => `<td>${escapeHtml(cellText(row[c]))}</td>`).join('')}
        <td class="no-print">
          <button class="btn btn-sm btn-outline" onclick="viewRowJSON(${row.id})">JSON</button>
          <button class="btn btn-sm btn-outline" onclick="openRowEditor(${row.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="requestDeleteRow(${row.id})">Delete</button>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="${columns.length + 1}"><div class="empty-state">No records match</div></td></tr>`;
}

/* ---------- Reports: print + exports ---------- */

window.printDbReport = () => {
  printReport(
    `Database Report \u2014 ${currentTable}`,
    `${inspectorFilterMeta()} \u2014 ${filteredRows.length} of ${tableRows.length} record(s) \u2014 generated ${fmtTime(new Date().toISOString())}`
  );
};

window.exportDb = (fmt) => {
  if (!filteredRows.length) return toast('No records match the current filters', true);
  const stamp = new Date().toISOString().slice(0, 10);
  if (fmt === 'csv') {
    exportRowsCSV(
      filteredRows,
      (tableMeta?.columns || []).map((c) => ({ label: c.name, value: (r) => cellText(r[c.name]) })),
      `golddata-${currentTable}-${stamp}.csv`
    );
  } else {
    exportRowsJSON(filteredRows, `golddata-${currentTable}-${stamp}.json`);
  }
  toast(`Exported ${filteredRows.length} record(s) from "${currentTable}"`);
};

/* ---------- Schema-driven record editor (create / edit) ---------- */

let rowEditorMode = null; // 'create' | numeric row id

function sampleForColumn(name) {
  for (const row of tableRows) {
    if (row[name] !== null && row[name] !== undefined) return row[name];
  }
  return null;
}

function fieldHtml(name, type, value) {
  const label = `<label>${escapeHtml(name)}</label>`;
  if (name === 'id') {
    return `<div class="form-group"><label>id</label><input value="${escapeHtml(value !== null && value !== undefined ? String(value) : 'auto-assigned')}" disabled><div class="form-hint">Assigned automatically by the engine</div></div>`;
  }
  if (type === 'boolean') {
    const v = value === null || value === undefined ? '' : String(Boolean(value));
    return `<div class="form-group">${label}
      <select name="${escapeHtml(name)}" data-type="boolean">
        <option value="">(not set)</option>
        <option value="true" ${v === 'true' ? 'selected' : ''}>true</option>
        <option value="false" ${v === 'false' ? 'selected' : ''}>false</option>
      </select></div>`;
  }
  if (type === 'number') {
    return `<div class="form-group">${label}
      <input name="${escapeHtml(name)}" data-type="number" type="number" step="any"
        value="${value === null || value === undefined ? '' : escapeHtml(String(value))}"></div>`;
  }
  if (type === 'json') {
    return `<div class="form-group full">${label}
      <textarea name="${escapeHtml(name)}" data-type="json" rows="3" spellcheck="false"
        style="font-family:Consolas,monospace;font-size:12px">${escapeHtml(value === null || value === undefined ? '' : JSON.stringify(value))}</textarea></div>`;
  }
  if (typeof value === 'string' && isIsoDate(value)) {
    return `<div class="form-group">${label}
      <input name="${escapeHtml(name)}" data-type="date" type="datetime-local" value="${escapeHtml(value.slice(0, 16))}"></div>`;
  }
  return `<div class="form-group">${label}
    <input name="${escapeHtml(name)}" data-type="string"
      value="${value === null || value === undefined ? '' : escapeHtml(String(value))}"></div>`;
}

window.openRowEditor = (mode) => {
  if (!currentTable) return;
  rowEditorMode = mode;
  const body = document.getElementById('row-editor-body');
  const title = document.getElementById('row-editor-title');

  if (mode === 'create' && (!tableMeta || !tableMeta.columns.length)) {
    title.textContent = `Add record to "${currentTable}"`;
    body.innerHTML = `
      <label>Record JSON <span class="muted">(empty table - define fields manually; id is auto-assigned)</span></label>
      <textarea id="row-editor-textarea" rows="12" spellcheck="false" style="font-family:Consolas,monospace;font-size:12px;white-space:pre;resize:vertical">{\n  \n}</textarea>
    `;
    openModal('row-editor-modal');
    return;
  }

  const row = mode === 'create' ? null : tableRows.find((r) => Number(r.id) === Number(mode));
  if (mode !== 'create' && !row) return toast('Record not found', true);

  title.textContent = mode === 'create'
    ? `Add New Row \u2014 "${currentTable}"`
    : `Edit Record #${row.id} \u2014 "${currentTable}"`;

  body.innerHTML = `<div class="form-grid">${(tableMeta?.columns || [])
    .map((c) => fieldHtml(c.name, c.type, mode === 'create' ? sampleForColumn(c.name) : row[c.name]))
    .join('')}</div>
    <div class="form-hint" style="margin-top:10px">Leave a field as "(not set)" / empty to omit it from the saved record.</div>`;
  openModal('row-editor-modal');
};

function collectRowForm() {
  if (document.getElementById('row-editor-textarea')) {
    const doc = JSON.parse(document.getElementById('row-editor-textarea').value);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('Record must be a JSON object');
    return doc;
  }
  const body = {};
  for (const el of document.querySelectorAll('#row-editor-body [name]')) {
    const type = el.dataset.type;
    const v = el.value;
    if (type === 'json') {
      if (!v.trim()) continue;
      try { body[el.name] = JSON.parse(v); } catch { throw new Error(`Field "${el.name}" contains invalid JSON`); }
    } else if (type === 'number') {
      if (v === '') continue;
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`Field "${el.name}" must be a number`);
      body[el.name] = n;
    } else if (type === 'boolean') {
      if (v === '') continue;
      body[el.name] = v === 'true';
    } else if (type === 'date') {
      if (!v) continue;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new Error(`Field "${el.name}" is not a valid date`);
      body[el.name] = d.toISOString();
    } else {
      if (v === '') continue;
      body[el.name] = v;
    }
  }
  return body;
}

window.saveRow = async () => {
  let doc;
  try {
    doc = collectRowForm();
  } catch (err) {
    return toast(err.message, true);
  }
  const { id, ...payload } = doc;
  if (Object.keys(payload).length === 0) return toast('Nothing to save - fill at least one field', true);
  try {
    if (rowEditorMode === 'create') {
      await API.post(`/api/admin/db/${currentTable}`, payload);
      toast('Record created');
    } else {
      await API.put(`/api/admin/db/${currentTable}/${rowEditorMode}`, payload);
      toast('Record updated');
    }
    closeModal('row-editor-modal');
    openTable(currentTable);
  } catch (err) { toast(err.message, true); }
};

/* ---------- Delete with confirmation modal ---------- */

window.requestDeleteRow = (rowId) => {
  const row = tableRows.find((r) => Number(r.id) === Number(rowId));
  document.getElementById('confirm-title').textContent = `Delete Record #${rowId}`;
  document.getElementById('confirm-text').textContent =
    `Permanently delete record #${rowId} from "${currentTable}"${row?.username ? ` (${row.username})` : ''}? This cannot be undone.`;
  pendingConfirm = async () => {
    try {
      await API.del(`/api/admin/db/${currentTable}/${rowId}`);
      toast('Record deleted');
      openTable(currentTable);
    } catch (err) { toast(err.message, true); }
  };
  openModal('confirm-modal');
};

window.confirmYes = () => {
  closeModal('confirm-modal');
  const fn = pendingConfirm;
  pendingConfirm = null;
  if (fn) fn();
};

window.viewRowJSON = (rowId) => {
  const row = tableRows.find((r) => Number(r.id) === Number(rowId));
  if (!row) return;
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(row, null, 2);
  pre.style.cssText = 'background:#0a3a2a;color:#f1f5f9;padding:14px;border-radius:8px;font-size:12px;max-height:50vh;overflow:auto;white-space:pre-wrap;word-break:break-all';
  const holder = document.getElementById('row-json');
  holder.innerHTML = '';
  holder.appendChild(pre);
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
          Download a complete JSON bundle of <b id="backup-db-name">the database</b>
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
  `;

  try {
    const conn = await API.get('/api/admin/database/connection');
    renderConnection(conn);
    const nameEl = document.getElementById('backup-db-name');
    if (nameEl) nameEl.textContent = conn.db_name;
  } catch (err) { toast(err.message, true); }
  loadTables();

  document.getElementById('btn-test-conn').addEventListener('click', testConnection);
  document.getElementById('btn-save-conn').addEventListener('click', saveConnection);
  bindRestoreForm();
}

init().catch((err) => toast(err.message, true));
