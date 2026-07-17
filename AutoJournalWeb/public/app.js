const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const api = {
  async get(url) { const r = await fetch(url); if (!r.ok) throw new Error((await r.json()).error || r.statusText); return r.json(); },
  async json(url, body, method = 'POST') {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  },
  async upload(url, formData) {
    const r = await fetch(url, { method: 'POST', body: formData });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  },
};

function setStatus(el, msg, kind = '') {
  el.textContent = msg;
  el.className = `status ${kind}`;
}

function fmtDate(day) {
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ---- Tabs ----
$$('.tab').forEach((tab) => tab.addEventListener('click', () => {
  $$('.tab').forEach((t) => t.classList.remove('active'));
  $$('.view').forEach((v) => v.classList.remove('active'));
  tab.classList.add('active');
  $(`#view-${tab.dataset.view}`).classList.add('active');
  if (tab.dataset.view === 'timeline') loadTimeline();
}));

// ---- Timeline ----
async function loadTimeline() {
  const entries = await api.get('/api/entries');
  const wrap = $('#entries');
  wrap.innerHTML = '';
  $('#timeline-empty').classList.toggle('hidden', entries.length > 0);
  for (const e of entries) {
    const card = document.createElement('div');
    card.className = 'entry-card';
    const snippet = e.narrative.length > 220 ? `${e.narrative.slice(0, 220)}…` : e.narrative;
    const thumbs = (e.hero_photos || []).slice(0, 5)
      .map((id) => `<img src="/api/photo/${id}" loading="lazy" onerror="this.remove()" />`).join('');
    card.innerHTML = `
      <div class="entry-date">${fmtDate(e.day)}</div>
      <div class="entry-meta">
        <span>${e.word_count} words</span>
        <span>${e.photo_count} photos</span>
        ${(e.place_trail || []).length ? `<span>📍 ${e.place_trail.slice(0, 3).join(' · ')}</span>` : ''}
      </div>
      <div class="entry-snippet">${snippet}</div>
      ${thumbs ? `<div class="thumbs">${thumbs}</div>` : ''}`;
    card.addEventListener('click', () => openDetail(e.day));
    wrap.appendChild(card);
  }
}

// ---- Detail modal ----
async function openDetail(day) {
  const e = await api.get(`/api/entries/${day}`);
  const gallery = (e.hero_photos || []).map((id) => `<img src="/api/photo/${id}" loading="lazy" onerror="this.remove()" />`).join('');
  $('#detail-body').innerHTML = `
    <h2>${fmtDate(e.day)}</h2>
    <div class="chips">
      <span class="chip">${e.word_count} words</span>
      <span class="chip">${e.photo_count} photos</span>
      ${e.model ? `<span class="chip">${e.model}</span>` : ''}
    </div>
    ${(e.place_trail || []).length ? `<div class="chips">${e.place_trail.map((p) => `<span class="chip">📍 ${p}</span>`).join('')}</div>` : ''}
    ${e.health_summary ? `<div class="chips"><span class="chip">💓 ${e.health_summary}</span></div>` : ''}
    <p class="narrative">${e.narrative}</p>
    ${gallery ? `<div class="gallery">${gallery}</div>` : ''}
    <button class="danger" id="del-entry">Delete this entry</button>`;
  $('#del-entry').addEventListener('click', async () => {
    await fetch(`/api/entries/${day}`, { method: 'DELETE' });
    closeDetail();
    loadTimeline();
  });
  $('#detail').classList.remove('hidden');
}
function closeDetail() { $('#detail').classList.add('hidden'); }
$('#detail-close').addEventListener('click', closeDetail);
$('#detail').addEventListener('click', (ev) => { if (ev.target.id === 'detail') closeDetail(); });

// ---- Generate ----
$('#gen-btn').addEventListener('click', async () => {
  const day = $('#gen-day').value;
  const note = $('#gen-note').value.trim();
  const status = $('#gen-status');
  if (!day) return setStatus(status, 'Pick a day first.', 'err');
  $('#gen-btn').disabled = true;
  setStatus(status, 'Reading your day and writing it up… this can take ~20s.', 'working');
  $('#gen-result').classList.add('hidden');
  try {
    const e = await api.json('/api/generate', { day, manualNote: note });
    setStatus(status, 'Done — saved to your timeline.', 'ok');
    $('#gen-result').classList.remove('hidden');
    $('#gen-result').innerHTML = `
      <div class="chips"><span class="chip">${e.word_count} words</span><span class="chip">${e.model}</span></div>
      <p class="narrative">${e.narrative}</p>`;
  } catch (err) {
    setStatus(status, err.message, 'err');
  } finally {
    $('#gen-btn').disabled = false;
  }
});

// ---- Imports ----
const importHandlers = {
  photos: () => {
    const files = $('#photo-files').files;
    if (!files.length) throw new Error('Choose some photos.');
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    if ($('#photo-day').value) fd.append('day', $('#photo-day').value);
    return api.upload('/api/import/photos', fd);
  },
  whatsapp: () => uploadSingle('#whatsapp-file', '/api/import/whatsapp'),
  messenger: () => uploadSingle('#messenger-file', '/api/import/messenger'),
  calls: () => uploadSingle('#calls-file', '/api/import/calls'),
  whoop: () => {
    const day = $('#whoop-day').value;
    if (!day) throw new Error('Pick a day.');
    return api.json('/api/import/whoop', { day });
  },
};
function uploadSingle(inputSel, url) {
  const file = $(inputSel).files[0];
  if (!file) throw new Error('Choose a file.');
  const fd = new FormData();
  fd.append('file', file);
  return api.upload(url, fd);
}
$$('[data-import]').forEach((btn) => btn.addEventListener('click', async () => {
  const key = btn.dataset.import;
  const status = $(`[data-status="${key}"]`);
  btn.disabled = true;
  setStatus(status, 'Working…', 'working');
  try {
    const res = await importHandlers[key]();
    const detail = res.imported !== undefined
      ? `Imported ${res.imported} item${res.imported === 1 ? '' : 's'}${res.days?.length ? ` across ${res.days.length} day(s).` : '.'}`
      : 'Fetched activity for the day.';
    setStatus(status, detail, 'ok');
    loadSettings();
  } catch (err) {
    setStatus(status, err.message, 'err');
  } finally {
    btn.disabled = false;
  }
}));

// ---- Settings ----
async function loadSettings() {
  const s = await api.get('/api/settings');
  $('#set-model').value = s.model;
  $('#set-maxphotos').value = s.maxPhotos;
  const tokenStatus = $('#token-status');
  if (s.hasToken) setStatus(tokenStatus, '✓ GitHub token detected on the server.', 'ok');
  else setStatus(tokenStatus, '⚠ No GITHUB_TOKEN in the server .env — generation will fail.', 'err');
  // Default date pickers to today.
  ['#gen-day', '#photo-day', '#whoop-day'].forEach((sel) => { if (!$(sel).value) $(sel).value = s.today; });
  const hint = $('#day-hint');
  hint.textContent = s.daysWithData.length
    ? `Days with imported data: ${s.daysWithData.slice(0, 8).join(', ')}${s.daysWithData.length > 8 ? '…' : ''}`
    : 'No data imported yet — add photos or a chat export in the Import tab.';
}
$('#save-settings').addEventListener('click', async () => {
  const status = $('[data-status="settings"]');
  try {
    const body = { model: $('#set-model').value, maxPhotos: $('#set-maxphotos').value };
    const whoop = $('#set-whoop').value.trim();
    if (whoop) body.whoopToken = whoop;
    await api.json('/api/settings', body);
    setStatus(status, 'Saved.', 'ok');
    $('#set-whoop').value = '';
  } catch (err) {
    setStatus(status, err.message, 'err');
  }
});

// ---- Init ----
loadSettings();
loadTimeline();
