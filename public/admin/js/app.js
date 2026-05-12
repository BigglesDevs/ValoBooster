// ── State ─────────────────────────────────────────────────────────────────────
let me      = null;
let orders  = [];
let calDate = new Date();

const BOOSTER_COLORS = [
  '#ff4655','#3498db','#2ecc71','#f1c40f','#9b59b6',
  '#e67e22','#1abc9c','#e91e63','#00bcd4','#8bc34a',
];

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  const res = await fetch('/admin/api/me');
  if (!res.ok) return (location.href = '/admin/login');
  me = await res.json();
  if (me.must_reset) return (location.href = '/admin/reset-password');

  document.getElementById('userName').textContent  = me.display_name || me.email;
  document.getElementById('userEmail').textContent = me.email;
  document.getElementById('roleLabel').textContent = me.role === 'admin' ? 'Owner' : 'Booster';

  if (me.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }

  await loadOrders();
  initNav();
  initLogout();
  initScheduleModal();
  initBoosterModal();
  renderCalendar();
  if (me.role === 'admin') loadBoosters();
})();

// ── Navigation ────────────────────────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

function switchView(name) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelector(`.nav-item[data-view="${name}"]`)?.classList.add('active');
  document.getElementById(`view-${name}`)?.classList.add('active');
  if (name === 'calendar') renderCalendar();
  if (name === 'boosters') loadBoosters();
}

// ── Logout ────────────────────────────────────────────────────────────────────
function initLogout() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/admin/api/logout', { method: 'POST' });
    location.href = '/admin/login';
  });
}

// ── Orders ────────────────────────────────────────────────────────────────────
async function loadOrders() {
  const res = await fetch('/admin/api/orders');
  orders = await res.json();
  renderOrders();
  renderStats();
}

function renderStats() {
  const pending   = orders.filter(o => o.status === 'pending').length;
  const accepted  = orders.filter(o => o.status === 'accepted').length;
  const completed = orders.filter(o => o.status === 'completed').length;
  const revenue   = orders.filter(o => o.status !== 'pending')
    .reduce((s, o) => s + (o.amount_cents || 0), 0) / 100;

  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card"><div class="label">Pending</div><div class="value yellow">${pending}</div></div>
    <div class="stat-card"><div class="label">Active</div><div class="value blue">${accepted}</div></div>
    <div class="stat-card"><div class="label">Completed</div><div class="value green">${completed}</div></div>
    <div class="stat-card"><div class="label">Revenue</div><div class="value red">£${revenue.toFixed(2)}</div></div>
  `;
}

function renderOrders() {
  const filter = document.getElementById('statusFilter').value;
  const list   = filter ? orders.filter(o => o.status === filter) : orders;
  const tbody  = document.getElementById('ordersBody');

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty">No orders yet</div></td></tr>';
    return;
  }

  tbody.innerHTML = list.map(o => {
    const scheduled = o.scheduled_start
      ? new Date(o.scheduled_start * 1000).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
      : '<span style="color:var(--muted)">Not set</span>';

    const canAccept   = o.status === 'pending';
    const canDecline  = ['pending','accepted'].includes(o.status) && (me.role === 'admin' || o.booster_id === me.id);
    const canSchedule = (o.status === 'accepted') && (me.role === 'admin' || o.booster_id === me.id);
    const canComplete = o.status === 'accepted' && (me.role === 'admin' || o.booster_id === me.id);
    const badgeClass  = { pending:'badge-pending', accepted:'badge-accepted', completed:'badge-completed', declined:'badge-pending', expired:'badge-pending' }[o.status] || 'badge-pending';

    return `<tr>
      <td><strong>${esc(o.service)}</strong></td>
      <td style="font-size:.8rem">${esc(o.customer_email || '—')}</td>
      <td>£${((o.amount_cents || 0) / 100).toFixed(2)}</td>
      <td><span class="badge ${badgeClass}">${o.status}</span></td>
      <td style="font-size:.8rem;color:var(--muted)">${esc(o.booster_name || '—')}</td>
      <td style="font-size:.8rem">${scheduled}</td>
      <td>
        <div class="actions">
          ${canAccept   ? `<button class="btn btn-primary btn-sm" onclick="acceptOrder('${o.id}')">Accept</button>` : ''}
          ${canSchedule ? `<button class="btn btn-ghost btn-sm" onclick="openSchedule('${o.id}')">Schedule</button>` : ''}
          ${canComplete ? `<button class="btn btn-success btn-sm" onclick="completeOrder('${o.id}')">Complete</button>` : ''}
          ${canDecline  ? `<button class="btn btn-danger btn-sm" onclick="declineOrder('${o.id}')">Decline</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('statusFilter').addEventListener('change', renderOrders);

async function acceptOrder(id) {
  const res = await fetch(`/admin/api/orders/${id}/accept`, { method: 'POST' });
  if (!res.ok) { const d = await res.json(); return alert(d.error); }
  await loadOrders();
}

async function declineOrder(id) {
  if (!confirm('Decline this order? The customer\'s card hold will be released immediately.')) return;
  const res = await fetch(`/admin/api/orders/${id}/decline`, { method: 'POST' });
  if (!res.ok) { const d = await res.json(); return alert(d.error); }
  await loadOrders();
}

async function completeOrder(id) {
  if (!confirm('Mark this order as completed?')) return;
  const res = await fetch(`/admin/api/orders/${id}/complete`, { method: 'POST' });
  if (!res.ok) { const d = await res.json(); return alert(d.error); }
  await loadOrders();
}

// ── Schedule modal ────────────────────────────────────────────────────────────
let scheduleOrderId = null;

function initScheduleModal() {
  document.getElementById('scheduleClose').addEventListener('click',  closeSchedule);
  document.getElementById('scheduleCancel').addEventListener('click', closeSchedule);
  document.getElementById('scheduleSave').addEventListener('click',   saveSchedule);
}

function openSchedule(id) {
  scheduleOrderId = id;
  const order = orders.find(o => o.id === id);
  document.getElementById('schedStart').value = order?.scheduled_start
    ? toLocalInput(order.scheduled_start * 1000) : '';
  document.getElementById('schedEnd').value = order?.scheduled_end
    ? toLocalInput(order.scheduled_end * 1000) : '';
  document.getElementById('schedNotes').value = order?.notes || '';
  document.getElementById('scheduleModal').classList.remove('hidden');
}

function closeSchedule() {
  document.getElementById('scheduleModal').classList.add('hidden');
  scheduleOrderId = null;
}

async function saveSchedule() {
  const start = document.getElementById('schedStart').value;
  const end   = document.getElementById('schedEnd').value;
  const notes = document.getElementById('schedNotes').value;
  const res = await fetch(`/admin/api/orders/${scheduleOrderId}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start, end, notes }),
  });
  if (!res.ok) { const d = await res.json(); return alert(d.error); }
  closeSchedule();
  await loadOrders();
  renderCalendar();
}

// ── Calendar ──────────────────────────────────────────────────────────────────
let myBlockedDates = [];

async function renderCalendar() {
  const [evRes, blRes] = await Promise.all([
    fetch('/admin/api/calendar'),
    fetch('/admin/api/blocked-dates'),
  ]);
  const events      = await evRes.json();
  const blockedRows = await blRes.json();
  myBlockedDates = blockedRows.filter(b => b.booster_id === me.id).map(b => b.date);

  const year  = calDate.getFullYear();
  const month = calDate.getMonth();

  document.getElementById('calTitle').textContent =
    calDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const boosterColors = {};
  let colorIdx = 0;
  events.forEach(e => {
    if (e.booster_id && !boosterColors[e.booster_id])
      boosterColors[e.booster_id] = BOOSTER_COLORS[colorIdx++ % BOOSTER_COLORS.length];
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = days.map(d => `<div class="cal-day-label">${d}</div>`).join('');

  const startOffset = firstDay;
  const totalCells  = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const dayNum   = i - startOffset + 1;
    const isValid  = dayNum >= 1 && dayNum <= daysInMonth;
    const cellDate = isValid ? new Date(year, month, dayNum) : null;
    const isToday  = cellDate && cellDate.toDateString() === today.toDateString();

    const dayEvents = isValid ? events.filter(e => {
      if (!e.scheduled_start) return false;
      const s = new Date(e.scheduled_start * 1000);
      const end = e.scheduled_end ? new Date(e.scheduled_end * 1000) : s;
      return cellDate >= new Date(s.getFullYear(), s.getMonth(), s.getDate()) &&
             cellDate <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
    }) : [];

    const evHtml = dayEvents.slice(0, 3).map(e => {
      const color = boosterColors[e.booster_id] || 'var(--red)';
      return `<div class="cal-event" style="background:${color}22;color:${color};border:1px solid ${color}44"
        title="${esc(e.service)} — ${esc(e.booster_name || 'Unassigned')}">${esc(e.service)}</div>`;
    }).join('');
    const more = dayEvents.length > 3
      ? `<div style="font-size:.65rem;color:var(--muted)">+${dayEvents.length - 3} more</div>` : '';

    const dateStr  = isValid ? `${year}-${String(month+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}` : '';
    const isBlocked = dateStr && myBlockedDates.includes(dateStr);

    html += `<div class="cal-cell${isToday ? ' today' : ''}${!isValid ? ' other-month' : ''}${isBlocked ? ' cal-blocked' : ''}"
      ${isValid ? `onclick="toggleBlock('${dateStr}')" title="${isBlocked ? 'Click to unblock' : 'Click to block this day'}"` : ''}>
      <div class="cal-date">${isValid ? dayNum : ''}${isBlocked ? ' <span style="color:#e74c3c;font-size:.65rem">✕</span>' : ''}</div>
      ${evHtml}${more}
    </div>`;
  }

  document.getElementById('calGrid').innerHTML = html;

  document.getElementById('calPrev').onclick = () => { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); };
  document.getElementById('calNext').onclick = () => { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); };
}

// ── Boosters ──────────────────────────────────────────────────────────────────
async function loadBoosters() {
  const res      = await fetch('/admin/api/boosters');
  const boosters = await res.json();
  const grid     = document.getElementById('boostersGrid');

  if (!boosters.length) {
    grid.innerHTML = '<div class="empty">No boosters yet — add one above</div>';
    return;
  }

  grid.innerHTML = boosters.map((b, i) => `
    <div class="booster-card">
      <div class="name">${esc(b.display_name || b.email)}</div>
      <div class="email">${esc(b.email)}</div>
      <div class="meta">
        <span class="badge" style="background:${BOOSTER_COLORS[i % BOOSTER_COLORS.length]}22;color:${BOOSTER_COLORS[i % BOOSTER_COLORS.length]};border:1px solid ${BOOSTER_COLORS[i % BOOSTER_COLORS.length]}44">${b.role}</span>
        ${b.must_reset ? '<span class="badge badge-pending">Temp password</span>' : ''}
      </div>
      ${b.id !== me.id ? `<button class="btn btn-danger btn-sm" onclick="removeBooster('${b.id}','${esc(b.display_name||b.email)}')">Remove</button>` : '<span style="font-size:.75rem;color:var(--muted)">You</span>'}
    </div>
  `).join('');
}

function initBoosterModal() {
  document.getElementById('addBoosterBtn')?.addEventListener('click', () => {
    document.getElementById('bName').value     = '';
    document.getElementById('bEmail').value    = '';
    document.getElementById('bPassword').value = '';
    document.getElementById('bRole').value     = 'booster';
    document.getElementById('boosterErr').textContent = '';
    document.getElementById('boosterModal').classList.remove('hidden');
  });
  document.getElementById('boosterClose').addEventListener('click',  () => document.getElementById('boosterModal').classList.add('hidden'));
  document.getElementById('boosterCancel').addEventListener('click', () => document.getElementById('boosterModal').classList.add('hidden'));
  document.getElementById('boosterSave').addEventListener('click', saveBooster);
}

async function saveBooster() {
  const err = document.getElementById('boosterErr');
  err.textContent = '';
  const res = await fetch('/admin/api/boosters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      display_name: document.getElementById('bName').value,
      email:        document.getElementById('bEmail').value,
      password:     document.getElementById('bPassword').value,
      role:         document.getElementById('bRole').value,
    }),
  });
  const data = await res.json();
  if (!res.ok) return (err.textContent = data.error || 'Failed to add booster');
  document.getElementById('boosterModal').classList.add('hidden');
  loadBoosters();
}

async function removeBooster(id, name) {
  if (!confirm(`Remove ${name}? This cannot be undone.`)) return;
  const res = await fetch(`/admin/api/boosters/${id}`, { method: 'DELETE' });
  if (!res.ok) { const d = await res.json(); return alert(d.error); }
  loadBoosters();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toLocalInput(ms) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function toggleBlock(date) {
  if (myBlockedDates.includes(date)) {
    await fetch(`/admin/api/blocked-dates/${encodeURIComponent(date)}`, { method: 'DELETE' });
  } else {
    await fetch('/admin/api/blocked-dates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    });
  }
  renderCalendar();
}

// expose for inline onclick handlers
window.acceptOrder   = acceptOrder;
window.declineOrder  = declineOrder;
window.completeOrder = completeOrder;
window.openSchedule  = openSchedule;
window.removeBooster = removeBooster;
window.toggleBlock   = toggleBlock;
