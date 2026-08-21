'use strict';

buildShell('banners', 'Banner Ads Manager');

let editing = null;
let allRows = [];

function bannerCardHtml(b) {
  return `
    <div class="banner-card">
      <img src="${escapeHtml(b.image_url)}" alt="${escapeHtml(b.banner_title)}" loading="lazy">
      <div class="banner-body">
        <div class="banner-title">${escapeHtml(b.banner_title)}</div>
        <div class="banner-meta">Target: <b>${escapeHtml(b.target_action)}</b></div>
        <div class="banner-meta">Schedule: ${b.start_at ? fmtDate(b.start_at) : 'now'} \u2192 ${b.end_at ? fmtDate(b.end_at) : 'forever'}</div>
        <div class="banner-meta">Status: ${b.is_active ? badge('true') : badge('false')}</div>
        <div class="banner-actions">
          <button class="btn btn-sm btn-outline" onclick="editBanner(${b.id})">Edit</button>
          <button class="btn btn-sm ${b.is_active ? 'btn-danger' : 'btn-primary'}" onclick="toggleBanner(${b.id})">${b.is_active ? 'Deactivate' : 'Activate'}</button>
          <button class="btn btn-sm btn-outline" onclick="deleteBanner(${b.id})">Delete</button>
        </div>
      </div>
    </div>`;
}

function applyBannerFilters() {
  const q = (document.getElementById('banner-search')?.value || '').trim().toLowerCase();
  const filtered = allRows.filter((b) => {
    const hay = `${b.id} ${b.banner_title} ${b.target_action}`.toLowerCase();
    return !q || hay.includes(q);
  });
  document.getElementById('banner-count').textContent = filtered.length;
  document.getElementById('banner-grid').innerHTML = filtered.length
    ? filtered.map(bannerCardHtml).join('')
    : '<div class="empty-state" style="grid-column:1/-1"><div class="big">\uD83D\uDD0D</div>No banners match your search</div>';
}

function render() {
  const c = content();
  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-input" id="banner-search" placeholder="Search title or target action\u2026">
        <span class="health-pill"><b id="banner-count">0</b> banners</span>
        <span class="health-pill">WEBP format recommended</span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-gold" onclick="openModal('banner-modal')">+ Upload Banner</button>
      </div>
    </div>
    <div class="banner-grid" id="banner-grid"></div>

    <div class="modal-overlay" id="banner-modal">
      <div class="modal">
        <div class="modal-header">
          <h3 id="banner-modal-title">Upload Banner</h3>
          <button class="modal-close">&times;</button>
        </div>
        <form id="banner-form">
          <div class="modal-body">
            <div class="form-group"><label>Banner Title *</label><input name="banner_title" required></div>
            <div class="form-group"><label>Image (WEBP recommended) *</label><input name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></div>
            <div class="form-group"><label>Target Action * (URL or App Screen)</label><input name="target_action" required placeholder="https://... or e.g. SPIN_SCREEN"></div>
            <div class="form-grid">
              <div class="form-group"><label>Start Date (optional)</label><input name="start_at" type="datetime-local"></div>
              <div class="form-group"><label>End Date (optional)</label><input name="end_at" type="datetime-local"></div>
              <div class="form-group"><label>Active</label>
                <select name="is_active"><option value="true">Yes</option><option value="false">No</option></select>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal('banner-modal')">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Banner</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('banner-search').addEventListener('input', debounce(applyBannerFilters, 250));
}

async function load() {
  allRows = await API.get('/api/admin/banners');
  render();
  applyBannerFilters();
}

window.editBanner = (id) => {
  editing = id;
  API.get('/api/admin/banners').then((rows) => {
    const b = rows.find((x) => x.id === id);
    if (!b) return;
    const f = document.getElementById('banner-form');
    f.elements.banner_title.value = b.banner_title;
    f.elements.target_action.value = b.target_action;
    f.elements.is_active.value = String(b.is_active);
    if (b.start_at) f.elements.start_at.value = b.start_at.slice(0, 16);
    if (b.end_at) f.elements.end_at.value = b.end_at.slice(0, 16);
    document.getElementById('banner-modal-title').textContent = `Edit Banner #${id}`;
    openModal('banner-modal');
  }).catch((err) => toast(err.message, true));
};

window.toggleBanner = async (id) => {
  try {
    const rows = await API.get('/api/admin/banners');
    const b = rows.find((x) => x.id === id);
    if (!b) return;
    await API.put(`/api/admin/banners/${id}`, { is_active: !b.is_active });
    toast(b.is_active ? 'Banner deactivated' : 'Banner activated');
    load();
  } catch (err) { toast(err.message, true); }
};

window.deleteBanner = async (id) => {
  if (!confirm('Delete this banner?')) return;
  try {
    await API.del(`/api/admin/banners/${id}`);
    toast('Banner deleted');
    load();
  } catch (err) { toast(err.message, true); }
};

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'banner-form') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  if (fd.get('start_at')) fd.set('start_at', new Date(fd.get('start_at')).toISOString());
  else fd.delete('start_at');
  if (fd.get('end_at')) fd.set('end_at', new Date(fd.get('end_at')).toISOString());
  else fd.delete('end_at');
  const action = editing ? API.put(`/api/admin/banners/${editing}`, fd) : API.post('/api/admin/banners', fd);
  action.then(() => {
    toast(editing ? 'Banner updated' : 'Banner uploaded');
    editing = null;
    closeModal('banner-modal');
    load();
  }).catch((err) => toast(err.message, true));
});

load().catch((err) => toast(err.message, true));
