'use strict';

buildShell('transactions', 'Transaction Logs');

let page = 1;

function render(data) {
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
      </div>
      <div class="toolbar-right"><span class="health-pill"><b>${data.total}</b> transactions</span></div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>User</th><th>Kind</th><th>Details</th><th>Amount</th><th>SIM</th><th>USSD</th><th>Status</th><th>Time</th></tr></thead>
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
              </tr>`).join('') : '<tr><td colspan="9"><div class="empty-state">No transactions found</div></td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <button class="btn btn-sm btn-outline" onclick="changePage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>Prev</button>
        <span>Page ${data.page} of ${data.pages}</span>
        <button class="btn btn-sm btn-outline" onclick="changePage(${page + 1})" ${page >= data.pages ? 'disabled' : ''}>Next</button>
      </div>
    </div>
  `;

  document.getElementById('tx-search').addEventListener('input', debounce(() => { page = 1; load(); }, 350));
  document.getElementById('tx-kind').addEventListener('change', () => { page = 1; load(); });
  document.getElementById('tx-status').addEventListener('change', () => { page = 1; load(); });
}

window.changePage = (p) => {
  if (p < 1) return;
  page = p;
  load();
};

async function load() {
  const params = new URLSearchParams({ page, limit: 50 });
  const kind = document.getElementById('tx-kind')?.value;
  const status = document.getElementById('tx-status')?.value;
  const q = document.getElementById('tx-search')?.value;
  if (kind) params.set('kind', kind);
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  const data = await API.get(`/api/admin/transactions?${params}`);
  render(data);
}

load().catch((err) => toast(err.message, true));