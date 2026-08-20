'use strict';

buildShell('packages', 'Data Packages Manager');

let editing = null;

function render(rows) {
  const c = content();
  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left"><span class="health-pill"><b>${rows.length}</b> packages</span></div>
      <div class="toolbar-right">
        <button class="btn btn-gold" onclick="openModal('pkg-modal')">+ New Package</button>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Package</th><th>Data</th><th>Price</th><th>USSD Template</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map((p) => `
              <tr>
                <td>#${p.id}</td>
                <td><b>${escapeHtml(p.package_name)}</b></td>
                <td>${escapeHtml(p.data_amount)}</td>
                <td><b>${fmtMoney(p.price)}</b></td>
                <td class="muted" style="font-family:Consolas,monospace">${escapeHtml(p.ussd_code_template)}</td>
                <td>${p.is_active ? badge('true') : badge('false')}</td>
                <td>
                  <button class="btn btn-sm btn-outline" onclick="editPackage(${p.id})">Edit</button>
                  <button class="btn btn-sm ${p.is_active ? 'btn-danger' : 'btn-primary'}" onclick="togglePackage(${p.id})">${p.is_active ? 'Disable' : 'Enable'}</button>
                  <button class="btn btn-sm btn-outline" onclick="deletePackage(${p.id})">Delete</button>
                </td>
              </tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">No packages yet</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="modal-overlay" id="pkg-modal">
      <div class="modal">
        <div class="modal-header">
          <h3 id="pkg-modal-title">New Data Package</h3>
          <button class="modal-close">&times;</button>
        </div>
        <form id="pkg-form">
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group"><label>Package Name *</label><input name="package_name" required placeholder="e.g. MTN 1GB"></div>
              <div class="form-group"><label>Data Amount *</label><input name="data_amount" required placeholder="e.g. 1 GB"></div>
              <div class="form-group"><label>Price (NGN) *</label><input name="price" type="number" min="0" step="0.01" required></div>
              <div class="form-group"><label>Active</label>
                <select name="is_active"><option value="true">Yes</option><option value="false">No</option></select>
              </div>
              <div class="form-group full"><label>USSD Code Template *</label><input name="ussd_code_template" required style="font-family:Consolas,monospace" placeholder="*712*61XXXXX*1#"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal('pkg-modal')">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Package</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function load() {
  const rows = await API.get('/api/admin/packages');
  render(rows);
}

window.editPackage = (id) => {
  editing = id;
  API.get(`/api/admin/packages/${id}`).then((p) => {
    const modal = document.getElementById('pkg-modal');
    document.getElementById('pkg-modal-title').textContent = `Edit Package #${p.id}`;
    const f = modal.querySelector('form');
    f.elements.package_name.value = p.package_name;
    f.elements.data_amount.value = p.data_amount;
    f.elements.price.value = p.price;
    f.elements.ussd_code_template.value = p.ussd_code_template;
    f.elements.is_active.value = String(p.is_active);
    openModal('pkg-modal');
  }).catch((err) => toast(err.message, true));
};

window.togglePackage = async (id) => {
  try {
    const p = await API.get(`/api/admin/packages/${id}`);
    await API.put(`/api/admin/packages/${id}`, { is_active: !p.is_active });
    toast(p.is_active ? 'Package disabled' : 'Package enabled');
    load();
  } catch (err) { toast(err.message, true); }
};

window.deletePackage = async (id) => {
  if (!confirm('Delete this package permanently?')) return;
  try {
    await API.del(`/api/admin/packages/${id}`);
    toast('Package deleted');
    load();
  } catch (err) { toast(err.message, true); }
};

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'pkg-form') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  const action = editing ? API.put(`/api/admin/packages/${editing}`, body) : API.post('/api/admin/packages', body);
  action.then(() => {
    toast(editing ? 'Package updated (live for app users)' : 'Package created');
    editing = null;
    closeModal('pkg-modal');
    load();
  }).catch((err) => toast(err.message, true));
});

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('body').addEventListener('click', (e) => {
    const openBtn = e.target.closest('#pkg-modal .modal-close');
    if (openBtn) {
      editing = null;
      document.getElementById('pkg-modal').querySelector('form').reset();
    }
  });
});

load().catch((err) => toast(err.message, true));