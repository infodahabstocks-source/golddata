'use strict';

buildShell('spin', 'Spin Wheel & Rewards Manager');

let editing = null;
let allRows = [];

// Luxury palette: Deep Emerald / Metallic Gold / Pure White (alternating, high contrast)
const WHEEL_COLORS = ['#0A3A2A', '#D4AF37', '#FFFFFF'];
const WHEEL_TEXT = ['#F1F5F9', '#0A3A2A', '#0A3A2A'];
const WHEEL_STROKE = '#0A3A2A';
const WHEEL_POINTS_TEXT = '#D4AF37';
const HUB_FILL = '#D4AF37';
const HUB_TEXT = '#0A3A2A';

function segRowHtml(r, i) {
  return `
    <tr>
      <td class="muted">${i + 1}</td>
      <td><b>${escapeHtml(r.label)}</b></td>
      <td>${badge(r.reward_type)} ${r.reward_type !== 'NONE' ? `<span class="muted">${r.reward_value}</span>` : ''}</td>
      <td>${(Number(r.win_probability || 0) * 100).toFixed(1)}%</td>
      <td>${r.is_active ? badge('true') : badge('false')}</td>
      <td>
        <button class="btn btn-sm ${r.is_active ? 'btn-danger' : 'btn-primary'}" onclick="toggleSegment(${r.id})">${r.is_active ? 'Disable' : 'Enable'}</button>
        <button class="btn btn-sm btn-outline" onclick="editSegment(${r.id})">Edit</button>
        <button class="btn btn-sm btn-outline" onclick="deleteSegment(${r.id})">Delete</button>
      </td>
    </tr>`;
}

function applySpinFilters() {
  const q = (document.getElementById('seg-search')?.value || '').trim().toLowerCase();
  const st = document.getElementById('seg-status')?.value || '';
  const filtered = allRows.filter((r) => {
    const hay = `${r.id} ${r.label} ${r.reward_type} ${r.reward_value}`.toLowerCase();
    return (!q || hay.includes(q)) && (!st || String(r.is_active) === st);
  });
  document.getElementById('seg-count').textContent = filtered.length;
  document.getElementById('seg-tbody').innerHTML = filtered.length
    ? filtered.map((r, i) => segRowHtml(r, i)).join('')
    : '<tr><td colspan="6"><div class="empty-state">No segments match</div></td></tr>';
}

function render() {
  const totalProb = allRows.filter((r) => r.is_active).reduce((s, r) => s + Number(r.win_probability || 0), 0);
  const c = content();
  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-input" id="seg-search" placeholder="Search label or reward\u2026">
        <select id="seg-status" style="width:auto">
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Disabled</option>
        </select>
        <span class="health-pill"><b id="seg-count">0</b> segments</span>
        <span class="health-pill">Active probability sum: <b>${(totalProb * 100).toFixed(1)}%</b> ${totalProb > 1.001 ? '(over 100% - reduce!)' : ''}</span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-gold" onclick="openModal('seg-modal')">+ New Segment</button>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Wheel Preview</div>
        <div class="wheel-preview" id="wheel-preview"></div>
        <div class="empty-state" style="padding:0 0 12px 0">Segments render live from the config below.</div>
      </div>
      <div class="card">
        <div class="card-title">Segments & Probability Rates</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Order</th><th>Label</th><th>Reward</th><th>Probability</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody id="seg-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="modal-overlay" id="seg-modal">
      <div class="modal">
        <div class="modal-header">
          <h3 id="seg-modal-title">New Spin Segment</h3>
          <button class="modal-close">&times;</button>
        </div>
        <form id="seg-form">
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group"><label>Label *</label><input name="label" required placeholder="e.g. 100 MB"></div>
              <div class="form-group"><label>Reward Type *</label>
                <select name="reward_type"><option value="DATA">DATA</option><option value="POINTS">POINTS</option><option value="NONE">NONE</option></select>
              </div>
              <div class="form-group"><label>Reward Value</label><input name="reward_value" type="number" min="0" step="1" placeholder="e.g. 100"></div>
              <div class="form-group"><label>Win Probability (0.0 - 1.0) *</label><input name="win_probability" type="number" min="0" max="1" step="0.01" required></div>
              <div class="form-group"><label>Sort Order</label><input name="sort_order" type="number" step="1" placeholder="1"></div>
              <div class="form-group"><label>Active</label>
                <select name="is_active"><option value="true">Yes</option><option value="false">No</option></select>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal('seg-modal')">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Segment</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('seg-search').addEventListener('input', debounce(applySpinFilters, 250));
  document.getElementById('seg-status').addEventListener('change', applySpinFilters);

  renderWheel(allRows);
}

function renderWheel(rows) {
  const wrap = document.getElementById('wheel-preview');
  if (!wrap) return;
  const active = rows.filter((r) => r.is_active);
  wrap.innerHTML = '';
  if (!active.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding-top:70px">No active segments</div>';
    return;
  }

  const size = wrap.clientWidth || 220;
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  wrap.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 2;
  const n = active.length;
  const arcAngle = (2 * Math.PI) / n; // equal slices: 360 / N (perfect symmetry)
  const start = -Math.PI / 2; // start at 12 o'clock

  // Elegant outer ring with a soft gold glow
  ctx.save();
  ctx.shadowColor = 'rgba(212, 175, 55, 0.45)';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = WHEEL_STROKE;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  active.forEach((segment, i) => {
    const startAngle = start + i * arcAngle;
    const endAngle = startAngle + arcAngle;
    const colorIndex = i % WHEEL_COLORS.length; // alternating pattern (no adjacent repeats)
    const color = WHEEL_COLORS[colorIndex];

    // Gold text for POINTS rewards on the deep-green slice (luxury emphasis)
    let textColor = WHEEL_TEXT[colorIndex];
    if (colorIndex === 0 && segment.reward_type === 'POINTS') textColor = WHEEL_POINTS_TEXT;

    // Draw slice (equal angles regardless of win probability)
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = WHEEL_STROKE;
    ctx.stroke();

    // Radial label centered on the slice bisector
    const label = segment.label;
    const textRadius = radius - 16;
    const chord = 2 * textRadius * Math.sin(arcAngle / 2);
    const fontSize = Math.max(9, Math.min(14, chord / Math.max(1, label.length * 0.78)));

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(startAngle + arcAngle / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${fontSize}px Segoe UI, sans-serif`;
    ctx.fillStyle = textColor;
    if (textColor === WHEEL_TEXT[0] || textColor === WHEEL_POINTS_TEXT) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 3;
    }
    ctx.fillText(label, textRadius, 1);
    ctx.restore();
  });

  // Centered "SPIN" hub - gold face with deep-green text
  const hubR = radius * 0.24;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, 2 * Math.PI);
  ctx.fillStyle = HUB_FILL;
  ctx.fill();
  ctx.restore();

  // Subtle polished inner shadow on the hub
  const inner = ctx.createRadialGradient(cx - hubR * 0.35, cy - hubR * 0.35, hubR * 0.15, cx, cy, hubR);
  inner.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
  inner.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
  inner.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, 2 * Math.PI);
  ctx.fillStyle = inner;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.stroke();

  ctx.fillStyle = HUB_TEXT;
  ctx.font = 'bold 12px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SPIN', cx, cy + 1);
}

window.editSegment = (id) => {
  editing = id;
  API.get('/api/admin/spin').then((rows) => {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    const f = document.getElementById('seg-form');
    f.elements.label.value = r.label;
    f.elements.reward_type.value = r.reward_type;
    f.elements.reward_value.value = r.reward_value;
    f.elements.win_probability.value = r.win_probability;
    f.elements.sort_order.value = r.sort_order || '';
    f.elements.is_active.value = String(r.is_active);
    document.getElementById('seg-modal-title').textContent = `Edit Segment #${id}`;
    openModal('seg-modal');
  }).catch((err) => toast(err.message, true));
};

window.toggleSegment = async (id) => {
  try {
    const rows = await API.get('/api/admin/spin');
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    await API.put(`/api/admin/spin/${id}`, { is_active: !r.is_active });
    toast(r.is_active ? 'Segment disabled' : 'Segment enabled');
    load();
  } catch (err) { toast(err.message, true); }
};

window.deleteSegment = async (id) => {
  if (!confirm('Delete this spin segment?')) return;
  try {
    await API.del(`/api/admin/spin/${id}`);
    toast('Segment deleted');
    load();
  } catch (err) { toast(err.message, true); }
};

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'seg-form') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  const action = editing ? API.put(`/api/admin/spin/${editing}`, body) : API.post('/api/admin/spin', body);
  action.then(() => {
    toast(editing ? 'Segment updated' : 'Segment created');
    editing = null;
    closeModal('seg-modal');
    load();
  }).catch((err) => toast(err.message, true));
});

async function load() {
  allRows = await API.get('/api/admin/spin');
  render();
  applySpinFilters();
}

load().catch((err) => toast(err.message, true));
