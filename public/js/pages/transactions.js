'use strict';

buildShell('transactions', 'Transaction Logs');

let page = 1;
let editingTxn = null;
let lastData = null;

function txFilterParams() {
  const params = new URLSearchParams();
  const kind = document.getElementById('tx-kind')?.value || '';
  const status = document.getElementById('tx-status')?.value || '';
  const q = document.getElementById('tx-search')?.value || '';
  const date = document.getElementById('tx-date')?.value || '';
  if (kind) params.set('kind', kind);
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  if (date) params.set('date', date);
  return params;
}

function txFilterMeta() {
  const bits = [];
  const kind = document.getElementById('tx-kind')?.value;
  const status = document.getElementById('tx-status')?.value;
  const q = document.getElementById('tx-search')?.value;
  const date = document.getElementById('tx-date')?.value;
  if (kind) bits.push(`kind: ${kind}`);
  if (status) bits.push(`status: ${status}`);
  if (q) bits.push(`search "${q}"`);
  if (date) bits.push(`date: ${date}`);
  return bits.length ? bits.join(' \u00B7 ') : 'all records';
}

async function fetchAllFilteredTxns() {
  const base = txFilterParams();
  base.set('limit', '200');
  const first = await API.get(`/api/admin/transactions?${base}page=1`);
  const rows = [...first.rows];
  for (let p = 2; p <= first.pages; p++) {
    const next = await API.get(`/api/admin/transactions?${base}page=${p}`);
    rows.push(...next.rows);
  }
  return rows;
}

async function fetchAllUsers() {
  const first = await API.get('/api/admin/users?limit=200&page=1');
  const rows = [...first.rows];
  for (let p = 2; p <= first.pages; p++) {
    const next = await API.get(`/api/admin/users?limit=200&page=${p}`);
    rows.push(...next.rows);
  }
  return rows.sort((a, b) => String(a.username).localeCompare(String(b.username)));
}

function render(data) {
  lastData = data;
  const c = content();
  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <select id="tx-kind" style="width:auto">
          <option value="">All kinds</option>
          <option value="PURCHASE">PURCHASE</option>
          <option value="SPIN">SPIN</option>
        </select>
        <select id="tx-status" style="width:auto">
          <option value="">All statuses</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="FAILED">FAILED</option>
        </select>
        <input class="search-input" id="tx-search" placeholder="Search ID, username or phone\u2026">
        <input type="date" id="tx-date" style="width:auto" title="Filter by transaction date">
      </div>
      <div class="toolbar-right">
        <span class="health-pill"><b>${data.total}</b> transactions</span>
        <button class="btn btn-sm btn-outline" onclick="printTxnReport()">Print Report</button>
        <button class="btn btn-sm btn-outline" onclick="exportTxns('csv')">Export CSV</button>
        <button class="btn btn-sm btn-outline" onclick="exportTxns('json')">Export JSON</button>
        <button class="btn btn-gold" onclick="openTxnEditor(null)">+ New Entry</button>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>User</th><th>Kind</th><th>Details</th><th>Amount</th><th>SIM</th><th>USSD</th><th>Status</th><th>Time</th><th class="no-print">Actions</th></tr></thead>
          <tbody>
            ${data.rows.length ? data.rows.map((t) => `
              <tr>
                <td>#${t.id}</td>
                <td><b>${escapeHtml(t.username || 'User #' + t.user_id)}</b><div class="muted" style="font-size:11.5px">${escapeHtml(t.phone_number || '')}</div></td>
                <td>${badge(t.kind)}</td>
                <td class="muted">${escapeHtml(t.notes || '')}</td>
                <td>${t.kind === 'PURCHASE' ? fmtMoney(t.amount_paid) : (t.points_awarded ? '+' + t.points_awarded + ' pts' : '\u2014')}</td>
                <td>${escapeHtml(t.sim_slot_used || '\u2014')}</td>
                <td class="muted" style="font-family:Consolas,monospace;font-size:12px">${escapeHtml(t.ussd_executed || '\u2014')}</td>
                <td>${badge(t.status)}</td>
                <td class="muted">${fmtTime(t.timestamp)}</td>
                <td class="no-print">
                  <button class="btn btn-sm btn-outline" onclick="openTxnEditor(${t.id})">Edit</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteTxn(${t.id})">Delete</button>
                </td>
              </tr>`).join('') : '<tr><td colspan="10"><div class="empty-state">No transactions found</div></td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <button class="btn btn-sm btn-outline" onclick="changePage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>Prev</button>
        <span>Page ${data.page} of ${data.pages}</span>
        <button class="btn btn-sm btn-outline" onclick="changePage(${page + 1})" ${page >= data.pages ? 'disabled' : ''}>Next</button>
      </div>
    </div>

    <div class="modal-overlay" id="tx-modal">
      <div class="modal" style="max-width:640px">
        <div class="modal-header">
          <h3 id="tx-modal-title">New Transaction Entry</h3>
          <button class="modal-close">&times;</button>
        </div>
        <form id="tx-form">
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group full"><label>Account *</label><select name="user_id" required></select></div>
              <div class="form-group"><label>Kind *</label>
                <select name="kind"><option value="PURCHASE">PURCHASE</option><option value="SPIN">SPIN</option></select>
              </div>
              <div class="form-group"><label>Status *</label>
                <select name="status"><option value="SUCCESS">SUCCESS</option><option value="FAILED">FAILED</option></select>
              </div>
              <div class="form-group"><label>Amount Paid (\u20A6)</label><input name="amount_paid" type="number" min="0" step="0.01" value="0"></div>
              <div class="form-group"><label>Points Awarded</label><input name="points_awarded" type="number" min="0" step="1" value="0"></div>
              <div class="form-group"><label>SIM Slot Used</label><input name="sim_slot_used" placeholder="e.g. SIM 1"></div>
              <div class="form-group"><label>USSD Executed</label><input name="ussd_executed" style="font-family:Consolas,monospace" placeholder="*712*...#"></div>
              <div class="form-group full"><label>Notes</label><input name="notes" placeholder="Optional description logged with this entry"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal('tx-modal')">Cancel</button>
            <button type="submit" class="btn btn-primary" id="tx-save-btn">Save Entry</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('tx-search').addEventListener('input', debounce(() => { page = 1; load(); }, 350));
  document.getElementById('tx-kind').addEventListener('change', () => { page = 1; load(); });
  document.getElementById('tx-status').addEventListener('change', () => { page = 1; load(); });
  document.getElementById('tx-date').addEventListener('change', () => { page = 1; load(); });

  fetchAllUsers().then((users) => {
    const sel = document.querySelector('#tx-form select[name="user_id"]');
    sel.innerHTML = '<option value="">Select account\u2026</option>' +
      users.map((u) => `<option value="${u.id}">#${u.id} \u00B7 ${escapeHtml(u.username)} (${escapeHtml(u.phone_number)})</option>`).join('');
  }).catch(() => {});
}

window.changePage = (p) => {
  if (p < 1) return;
  page = p;
  load();
};

window.printTxnReport = () => {
  printReport(
    'Transaction Report',
    `${txFilterMeta()} \u2014 ${lastData ? lastData.total : 0} record(s) \u2014 generated ${fmtTime(new Date().toISOString())}`
  );
};

window.exportTxns = async (fmt) => {
  try {
    const rows = await fetchAllFilteredTxns();
    if (!rows.length) return toast('No records match the current filters', true);
    const stamp = new Date().toISOString().slice(0, 10);
    if (fmt === 'csv') {
      exportRowsCSV(rows, [
        { label: 'ID', key: 'id' },
        { label: 'User', key: 'username' },
        { label: 'Phone', key: 'phone_number' },
        { label: 'Kind', key: 'kind' },
        { label: 'Amount (NGN)', key: 'amount_paid' },
        { label: 'Points', key: 'points_awarded' },
        { label: 'SIM', key: 'sim_slot_used' },
        { label: 'USSD', key: 'ussd_executed' },
        { label: 'Status', key: 'status' },
        { label: 'Time', key: 'timestamp' },
        { label: 'Notes', key: 'notes' }
      ], `golddata-transactions-${stamp}.csv`);
    } else {
      exportRowsJSON(rows, `golddata-transactions-${stamp}.json`);
    }
    toast(`Exported ${rows.length} transaction record(s)`);
  } catch (err) { toast(err.message, true); }
};

window.openTxnEditor = (id) => {
  editingTxn = id;
  const f = document.getElementById('tx-form');
  f.reset();
  const userSel = f.elements.user_id;
  userSel.disabled = false;
  if (id) {
    const t = (lastData?.rows || []).find((x) => x.id === id);
    if (!t) return toast('Record not found in current page - clear filters and retry', true);
    document.getElementById('tx-modal-title').textContent = `Edit Transaction #${t.id}`;
    userSel.value = String(t.user_id);
    userSel.disabled = true;
    f.elements.kind.value = t.kind;
    f.elements.status.value = t.status;
    f.elements.amount_paid.value = t.amount_paid ?? 0;
    f.elements.points_awarded.value = t.points_awarded ?? 0;
    f.elements.sim_slot_used.value = t.sim_slot_used || '';
    f.elements.ussd_executed.value = t.ussd_executed || '';
    f.elements.notes.value = t.notes || '';
  } else {
    document.getElementById('tx-modal-title').textContent = 'New Transaction Entry';
  }
  openModal('tx-modal');
};

window.deleteTxn = async (id) => {
  if (!confirm('Delete this transaction log entry?')) return;
  try {
    await API.del(`/api/admin/transactions/${id}`);
    toast('Transaction deleted');
    load();
  } catch (err) { toast(err.message, true); }
};

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'tx-form') return;
  e.preventDefault();
  const raw = Object.fromEntries(new FormData(e.target).entries());
  const body = {
    kind: raw.kind,
    status: raw.status,
    amount_paid: Number(raw.amount_paid || 0),
    points_awarded: Number(raw.points_awarded || 0),
    sim_slot_used: raw.sim_slot_used,
    ussd_executed: raw.ussd_executed,
    notes: raw.notes
  };
  const action = editingTxn
    ? API.put(`/api/admin/transactions/${editingTxn}`, body)
    : API.post('/api/admin/transactions', { ...body, user_id: raw.user_id });
  action.then(() => {
    toast(editingTxn ? `Transaction #${editingTxn} updated` : 'Transaction entry created');
    editingTxn = null;
    closeModal('tx-modal');
    load();
  }).catch((err) => toast(err.message, true));
});

async function load() {
  const params = txFilterParams();
  params.set('page', page);
  params.set('limit', 50);
  const data = await API.get(`/api/admin/transactions?${params}`);
  render(data);
}

load().catch((err) => toast(err.message, true));
