'use strict';

buildShell('dashboard', 'Overview Dashboard');

(async () => {
  const c = content();
  c.innerHTML = '<div class="card"><div class="empty-state">Loading analytics\u2026</div></div>';

  const stats = await API.get('/api/admin/dashboard/stats');
  const t = stats.totals;

  c.innerHTML = `
    <div class="grid-4">
      <div class="stat-card"><div class="label">Total Users</div><div class="value">${t.users.toLocaleString()}</div><div class="hint">${t.active_users} active \u00B7 ${t.banned_users} banned</div></div>
      <div class="stat-card"><div class="label">Total Revenue</div><div class="value">${fmtMoney(t.total_revenue)}</div><div class="hint">${t.purchases} successful purchases</div></div>
      <div class="stat-card"><div class="label">Points Issued</div><div class="value">${t.points_issued.toLocaleString()}</div><div class="hint">${t.spins} spins played</div></div>
      <div class="stat-card"><div class="label">Today</div><div class="value">${fmtMoney(t.today_revenue)}</div><div class="hint">${t.today_transactions} transactions today</div></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Sales - last 7 days</div>
        <canvas id="sales-chart" height="230"></canvas>
      </div>
      <div class="card">
        <div class="card-title">Top packages by revenue</div>
        <canvas id="packages-chart" height="230"></canvas>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">System Health</div>
        <div class="health-row">
          <span class="health-pill">Status: <b>${stats.health.status}</b></span>
          <span class="health-pill">Engine: <b>${stats.health.engine}</b></span>
          <span class="health-pill">DB files: <b>${stats.health.db_files}</b></span>
          <span class="health-pill">Uptime: <b>${Math.floor(stats.health.uptime_seconds / 60)}m</b></span>
          <span class="health-pill">Writable: <b>${stats.health.db_writable ? 'Yes' : 'NO'}</b></span>
        </div>
        <div class="card-title" style="margin-top:20px">Counters</div>
        <div class="health-row">
          <span class="health-pill">Packages: <b>${t.packages}</b> (${t.active_packages} active)</span>
          <span class="health-pill">Transactions: <b>${t.transactions}</b></span>
          <span class="health-pill">Purchases: <b>${t.purchases}</b></span>
          <span class="health-pill">Spins: <b>${t.spins}</b></span>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Recent Transactions</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Type</th><th>Amount</th><th>Status</th><th>Time</th></tr></thead>
            <tbody>
              ${stats.recent_transactions.length ? stats.recent_transactions.map((x) => `
                <tr>
                  <td>#${x.id}</td>
                  <td>${escapeHtml(x.notes || x.kind || '')}</td>
                  <td>${x.kind === 'PURCHASE' ? fmtMoney(x.amount_paid) : (x.points_awarded ? '+' + x.points_awarded + ' pts' : '\u2014')}</td>
                  <td>${badge(x.status)}</td>
                  <td class="muted">${fmtTime(x.timestamp)}</td>
                </tr>`).join('') : '<tr><td colspan="5"><div class="empty-state">No transactions yet</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
  script.onload = () => {
    const gold = '#D4AF37', emerald = '#0A3A2A';
    new Chart(document.getElementById('sales-chart'), {
      type: 'line',
      data: {
        labels: stats.sales_by_day.map((d) => d.date.slice(5)),
        datasets: [{
          label: 'Revenue',
          data: stats.sales_by_day.map((d) => d.revenue),
          borderColor: emerald,
          backgroundColor: 'rgba(10, 58, 42, 0.12)',
          fill: true,
          tension: 0.35
        }]
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
    new Chart(document.getElementById('packages-chart'), {
      type: 'bar',
      data: {
        labels: stats.package_breakdown.slice(0, 6).map((p) => p.package_name),
        datasets: [{
          label: 'Revenue',
          data: stats.package_breakdown.slice(0, 6).map((p) => p.revenue),
          backgroundColor: gold,
          borderRadius: 6
        }]
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  };
  document.head.appendChild(script);
})().catch((err) => toast(err.message, true));