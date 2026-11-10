import './styles/app.css';
import L from 'leaflet';
import { LAYERS, BASINS, RIVERS, BASEMAP, BASIN_EXTENTS, BASIN_COLOR, Q, ST, colorFor, layerById } from './layers.js';

const app = document.getElementById('app');
app.innerHTML = `
<div class="app-shell">
  <header class="app-header">
    <div class="brand">
      <div class="brand-icon"><span class="msym" style="font-size:18px">water_drop</span></div>
      <div>
        <div class="brand-name">HydroLens <b>Kenya</b></div>
        <div class="brand-sub">WRUA &amp; Citizen-Science Monitoring</div>
      </div>
    </div>
    <nav class="nav-tabs">
      <button id="nav-map" class="nav-tab on"><span class="msym" style="font-size:16px">map</span>Map Viewer</button>
      <button id="nav-dash" class="nav-tab"><span class="msym" style="font-size:16px">monitoring</span>Dashboard</button>
    </nav>
    <div class="header-right">
      <div class="pill"><span class="pill-dot"></span><span class="mono" style="font-size:10px;color:#10b981;font-weight:700;letter-spacing:.06em">PROTOTYPE</span></div>
      <div class="avatar" title="Demonstration build for KeNAWRUA">PK</div>
    </div>
  </header>

  <div id="view-map" class="view">
    <div class="map-subbar">
      <div class="subbar-left">
        <div class="chipbar"><span class="msym" style="font-size:16px;color:#06b6d4">travel_explore</span>
          <select id="basin-select"><option value="">All basins</option></select></div>
        <div class="seg" id="color-mode">
          <button data-mode="quality" class="on">Water quality</button>
          <button data-mode="status">Monitoring status</button>
        </div>
      </div>
      <button class="subbar-btn" id="btn-hud"><span class="msym">dock_to_left</span><span>Basin Analytics</span></button>
    </div>
    <div id="map"></div>

    <button class="layers-fab" id="layers-fab"><span class="msym" style="font-size:22px">layers</span></button>
    <div class="layers-panel" id="layers-panel" hidden>
      <div class="panel-head">
        <div><div class="panel-head-title">Active layers</div><div class="panel-head-sub">Tap the table icon to inspect a layer</div></div>
        <button class="icon-btn" id="layers-close"><span class="msym" style="font-size:16px">close</span></button>
      </div>
      <div class="layer-rows scrollbar" id="layer-rows"></div>
    </div>

    <div class="legend" id="legend"></div>

    <div class="hud" id="hud" hidden>
      <div class="hud-head">
        <div><div class="hud-title">Basin Analytics</div><div class="hud-scope" id="hud-scope">All basins</div></div>
        <div style="display:flex;gap:6px">
          <button class="icon-btn" id="hud-expand" title="Expand"><span class="msym" style="font-size:16px">open_in_full</span></button>
          <button class="icon-btn" id="hud-close"><span class="msym" style="font-size:16px">close</span></button>
        </div>
      </div>
      <div class="hud-body scrollbar" id="hud-body"></div>
    </div>

    <button class="table-reopen" id="table-reopen" hidden><span class="msym" style="font-size:16px;color:#06b6d4">table_rows</span>Attribute table</button>
    <div class="table-panel closed" id="table-panel">
      <div class="table-head">
        <div class="table-head-left">
          <span class="msym" style="font-size:17px;color:#06b6d4" id="table-icon">table_rows</span>
          <span class="table-title" id="table-title">Attribute table</span>
          <span class="table-count" id="table-count"></span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <input class="table-search" id="table-search" placeholder="Search…">
          <button class="table-close" id="table-close"><span class="msym" style="font-size:15px">expand_more</span>Hide</button>
        </div>
      </div>
      <div class="table-scroll scrollbar"><table class="attr"><thead><tr id="thead-row"></tr></thead><tbody id="tbody"></tbody></table></div>
    </div>
  </div>

  <div id="view-dash" class="view" hidden><div class="dash-wrap" id="dash-wrap"></div></div>
</div>`;

// ---------------- state ----------------
let basinFilter = '';
let colorMode = 'quality';
let activeTableLayer = LAYERS[0].id;
let selectedId = null;
let sortKey = null, sortDir = 1;
const layerOn = Object.fromEntries(LAYERS.map(l => [l.id, true]));
const markerById = {};

// ---------------- basin select ----------------
const basinSelect = document.getElementById('basin-select');
BASINS.forEach(b => { const o = document.createElement('option'); o.value = b; o.textContent = b; basinSelect.appendChild(o); });
basinSelect.onchange = () => { basinFilter = basinSelect.value; refresh(); };

// ---------------- map ----------------
// zoomControl: false — the default top-left position collides with the layers FAB/panel,
// which also live in that corner. Re-added top-right below instead (see leaflet overrides in app.css).
const map = L.map('map', { zoomSnap: 0.25, attributionControl: true, zoomControl: false }).fitBounds([[-3.3, 34.4], [0.9, 38.4]]);
L.control.zoom({ position: 'topright' }).addTo(map);
map.attributionControl.setPrefix(false).addAttribution('Natural Earth · WRUA &amp; FreshWater Watch data · demonstration prototype');
map.createPane('basemap').style.zIndex = 250;

L.geoJSON(BASEMAP.countries, { pane: 'basemap', interactive: false, style: f => ({ color: '#334155', weight: f.properties.name === 'Kenya' ? 1.3 : 0.6, fillColor: f.properties.name === 'Kenya' ? '#0e1a24' : '#0a121c', fillOpacity: 1 }) }).addTo(map).bringToBack();
L.geoJSON(BASEMAP.lakes, { pane: 'basemap', interactive: false, style: { color: '#1d4e66', weight: 0.5, fillColor: '#123549', fillOpacity: 0.9 } }).addTo(map);
L.geoJSON(BASEMAP.rivers, { pane: 'basemap', interactive: false, style: { color: '#155e75', weight: 0.8, fillColor: '#155e75', fillOpacity: 0.9 } }).addTo(map);
const riverLayer = L.layerGroup().addTo(map);
if (BASEMAP.lines) L.geoJSON(BASEMAP.lines, { pane: 'basemap', interactive: false, style: { color: '#0e7490', weight: 1.6 } }).addTo(riverLayer);
[['Nairobi', -1.286, 36.817], ['Nakuru', -0.303, 36.08], ['Naivasha', -0.717, 36.431], ['Bomet', -0.782, 35.342], ['Narok', -1.08, 35.87], ['Nanyuki', 0.012, 37.073], ['Thika', -1.033, 37.069], ['Kajiado', -1.852, 36.776]]
  .forEach(([n, la, lo]) => L.circleMarker([la, lo], { pane: 'basemap', radius: 2, weight: 0, fillColor: '#64748b', fillOpacity: 1, interactive: false }).bindTooltip(n, { permanent: true, direction: 'right', offset: [4, 0], className: 'tip', opacity: 0.85 }).addTo(map));

const basinLayer = L.layerGroup().addTo(map);
Object.entries(BASIN_EXTENTS).forEach(([b, pts]) => {
  const c = BASIN_COLOR[b] || '#94a3b8';
  basinLayer.addLayer(L.polygon(pts.map(p => [p[1], p[0]]), { pane: 'basemap', color: c, weight: 1.3, dashArray: '5 4', fillColor: c, fillOpacity: 0.05, interactive: false }));
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  basinLayer.addLayer(L.marker([cy, cx], { pane: 'basemap', interactive: false, icon: L.divIcon({ className: '', html: `<div style="font:700 11px Inter;letter-spacing:.12em;text-transform:uppercase;color:${c};text-shadow:0 0 4px #070d1b,0 0 4px #070d1b">${b}</div>`, iconSize: null }) }));
});

const leafletLayerGroup = {};
LAYERS.forEach(l => { leafletLayerGroup[l.id] = L.layerGroup().addTo(map); });

function visible(layer) { return layer.data.filter(s => !basinFilter || s.basin === basinFilter); }

function drawMarkers() {
  LAYERS.forEach(l => {
    const grp = leafletLayerGroup[l.id];
    grp.clearLayers();
    if (!layerOn[l.id]) return;
    visible(l).forEach(s => {
      const col = colorFor(s, colorMode);
      const m = L.circleMarker([s.lat, s.lon], { radius: l.radius(s), color: '#0f172a', weight: 1.5, fillColor: col, fillOpacity: 0.9 })
        .bindPopup(l.popup(s)).bindTooltip(s.name, { className: 'tip', direction: 'top', offset: [0, -8] });
      m.on('click', () => selectSite(l.id, s.id));
      markerById[l.id + ':' + s.id] = m;
      grp.addLayer(m);
    });
  });
}

function selectSite(layerId, id) {
  selectedId = id; activeTableLayer = layerId;
  const key = layerId + ':' + id, m = markerById[key];
  if (m) { map.setView(m.getLatLng(), 11); m.openPopup(); }
  openTable(layerId);
}

// ---------------- layers panel ----------------
const rowsEl = document.getElementById('layer-rows');
function buildLayerPanel() {
  rowsEl.innerHTML = '';
  let lastGroup = null;
  LAYERS.forEach(l => {
    if (l.group !== lastGroup) { lastGroup = l.group; const g = document.createElement('div'); g.className = 'layer-group-label'; g.textContent = l.group; rowsEl.appendChild(g); }
    const n = visible(l).length;
    const row = document.createElement('div'); row.className = 'layer-row';
    row.innerHTML = `
      <label>
        <input type="checkbox" ${layerOn[l.id] ? 'checked' : ''}>
        <span>
          <span style="display:flex;align-items:center;gap:7px"><span class="layer-swatch" style="background:${l.swatch}"></span><span class="layer-name">${l.label}</span></span>
          <span class="layer-sub">${l.sub}</span>
        </span>
      </label>
      <span class="layer-count">${n}</span>
      <button class="layer-table-btn" title="Open ${l.label} attribute table"><span class="msym" style="font-size:16px">table_rows</span></button>`;
    row.querySelector('input').onchange = e => { layerOn[l.id] = e.target.checked; drawMarkers(); };
    row.querySelector('.layer-table-btn').onclick = () => openTable(l.id);
    rowsEl.appendChild(row);
  });
}

// ---------------- legend ----------------
function buildLegend() {
  const scale = colorMode === 'quality' ? Q : ST;
  document.getElementById('legend').innerHTML = `<div class="legend-title">${colorMode === 'quality' ? 'Water quality' : 'Monitoring status'}</div>` +
    Object.values(scale).map(v => `<div class="legend-item"><span class="legend-dot" style="background:${v.c}"></span>${v.label}</div>`).join('');
}

// ---------------- HUD / dashboard ----------------
function basinStats(filter) {
  const cs = LAYERS[0].data.filter(s => !filter || s.basin === filter);
  const wr = LAYERS[1].data.filter(s => !filter || s.basin === filter);
  const avgIdx = cs.length ? cs.reduce((a, b) => a + b.index, 0) / cs.length : null;
  const lowDO = wr.filter(x => x.lowDO != null && x.lowDO >= 0.5).length;
  const active = cs.filter(x => x.status === 'active').length + wr.filter(x => x.status === 'active').length;
  const total = cs.length + wr.length;
  const rivers = RIVERS.filter(r => !filter || r.basin === filter).slice().sort((a, b) => b.index - a.index);
  return { total, cs: cs.length, wr: wr.length, avgIdx, lowDO, active, stale: total - active, rivers };
}
function statCard(label, val, sub) { return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-val">${val}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`; }
function riverBars(rivers, max) {
  return rivers.slice(0, max).map(r => `<div class="river-bar-row">
    <div class="river-bar-name">${r.river}</div>
    <div class="river-bar-track"><div class="river-bar-fill" style="width:${r.index}%;background:${r.index >= 40 ? '#ef4444' : r.index >= 20 ? '#f59e0b' : '#10b981'}"></div></div>
    <div class="river-bar-val">${Math.round(r.index)}</div></div>`).join('') || '<div style="font-size:12px;color:#64748b">No ranked rivers in this basin.</div>';
}
function renderHud() {
  document.getElementById('hud-scope').textContent = basinFilter || 'All basins';
  const st = basinStats(basinFilter);
  document.getElementById('hud-body').innerHTML = `
    <div class="stat-grid">
      ${statCard('Sites shown', st.total)}
      ${statCard('Avg. pollution idx', st.avgIdx == null ? '–' : Math.round(st.avgIdx), 'citizen-science sites')}
      ${statCard('Actively sampled', st.active, '< 18 months ago')}
      ${statCard('Low oxygen', st.lowDO, 'WRUA, DO &lt; 5 mg/L')}
    </div>
    <div><div style="font-size:12px;font-weight:700;margin-bottom:8px">Most polluted rivers</div><div style="display:flex;flex-direction:column;gap:7px">${riverBars(st.rivers, 6)}</div></div>
    <div class="hud-foot">Covers ${BASINS.length} basins and 50 WRUAs in the shared dataset — a sample of KeNAWRUA's 756 WRUAs nationally, not a full census.</div>`;
}
function renderDash() {
  const st = basinStats(basinFilter);
  document.getElementById('dash-wrap').innerHTML = `
    <div><div class="dash-h1">Basin Analytics — ${basinFilter || 'All basins'}</div><div class="dash-p">Demonstration prototype built from WRUA and citizen-science monitoring records shared with KeNAWRUA.</div></div>
    <div class="dash-stat-grid">
      ${statCard('Total sites', st.total)}
      ${statCard('Citizen-science', st.cs, 'nitrate / phosphate / turbidity')}
      ${statCard('WRUA stations', st.wr, 'pH / dissolved oxygen')}
      ${statCard('Avg. pollution idx', st.avgIdx == null ? '–' : Math.round(st.avgIdx))}
    </div>
    <div class="dash-card">
      <div style="font-size:13px;font-weight:700;margin-bottom:12px">Rivers ranked by pollution index</div>
      <div style="display:flex;flex-direction:column;gap:9px">${riverBars(st.rivers, 13)}</div>
    </div>
    <div class="dash-stat-grid" style="grid-template-columns:repeat(3,1fr)">
      ${statCard('Actively sampled', st.active, 'sampled in the last 18 months')}
      ${statCard('Inactive / stale', st.stale, 'no recent sample')}
      ${statCard('Low-oxygen WRUA sites', st.lowDO, 'DO below 5 mg/L')}
    </div>
    <div style="font-size:11px;color:#64748b;border-top:1px solid #1e293b;padding-top:12px">Coverage caveat: this demonstration holds data for 50 of KeNAWRUA's 756 national WRUAs. Treat unmapped areas as data gaps, not confirmed inactivity.</div>`;
}

// ---------------- attribute table (per layer) ----------------
function openTable(layerId) {
  activeTableLayer = layerId;
  document.getElementById('table-panel').classList.remove('closed');
  document.getElementById('table-reopen').hidden = true;
  sortKey = null; sortDir = 1;
  renderTable();
}
function renderTableHead(layer) {
  document.getElementById('thead-row').innerHTML = layer.columns.map(([k, l]) =>
    `<th data-k="${k}">${l}${sortKey === k ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
  [...document.querySelectorAll('#thead-row th')].forEach(th => th.onclick = () => {
    const k = th.dataset.k; if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = 1; }
    renderTable();
  });
}
function renderTable() {
  const layer = layerById(activeTableLayer);
  document.getElementById('table-icon').textContent = layer.id === 'cs' ? 'water_drop' : 'water';
  document.getElementById('table-title').textContent = layer.label + ' — attribute table';
  renderTableHead(layer);
  const q = (document.getElementById('table-search').value || '').toLowerCase();
  let rows = visible(layer).filter(s => !q || [s.name, s.river, s.basin, s.id].filter(Boolean).join(' ').toLowerCase().includes(q));
  if (sortKey) rows = rows.slice().sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (av == null) av = typeof bv === 'number' ? -1 : '';
    if (bv == null) bv = typeof av === 'number' ? -1 : '';
    return av > bv ? sortDir : av < bv ? -sortDir : 0;
  });
  document.getElementById('table-count').textContent = rows.length + ' of ' + visible(layer).length + ' rows';
  document.getElementById('tbody').innerHTML = rows.map(s => `<tr class="${s.id === selectedId ? 'sel' : ''}" data-id="${s.id}">
    ${layer.columns.map(([k]) => `<td>${layer.cell(s, k)}</td>`).join('')}</tr>`).join('');
  [...document.querySelectorAll('#tbody tr')].forEach(tr => tr.onclick = () => selectSite(layer.id, tr.dataset.id));
}

// ---------------- wiring ----------------
document.getElementById('layers-fab').onclick = () => { document.getElementById('layers-panel').hidden = false; };
document.getElementById('layers-close').onclick = () => { document.getElementById('layers-panel').hidden = true; };
document.getElementById('btn-hud').onclick = () => { document.getElementById('hud').hidden = false; renderHud(); };
document.getElementById('hud-close').onclick = () => { document.getElementById('hud').hidden = true; };
document.getElementById('hud-expand').onclick = () => showView('dash');
document.getElementById('table-close').onclick = () => { document.getElementById('table-panel').classList.add('closed'); document.getElementById('table-reopen').hidden = false; };
document.getElementById('table-reopen').onclick = () => { document.getElementById('table-panel').classList.remove('closed'); document.getElementById('table-reopen').hidden = true; };
document.getElementById('table-search').oninput = renderTable;
document.getElementById('nav-map').onclick = () => showView('map');
document.getElementById('nav-dash').onclick = () => showView('dash');
document.querySelectorAll('#color-mode button').forEach(b => b.onclick = () => { colorMode = b.dataset.mode; refresh(); });

function showView(v) {
  document.getElementById('view-map').hidden = v !== 'map';
  document.getElementById('view-dash').hidden = v !== 'dash';
  document.getElementById('nav-map').classList.toggle('on', v === 'map');
  document.getElementById('nav-dash').classList.toggle('on', v === 'dash');
  if (v === 'dash') renderDash(); else setTimeout(() => map.invalidateSize(), 50);
}
function updateColorButtons() {
  document.querySelectorAll('#color-mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === colorMode));
}
function refresh() {
  updateColorButtons(); buildLegend(); drawMarkers(); buildLayerPanel(); renderTable();
  if (!document.getElementById('hud').hidden) renderHud();
}

refresh();
openTable(LAYERS[0].id);
document.getElementById('table-panel').classList.add('closed');
document.getElementById('table-reopen').hidden = false;
window.addEventListener('resize', () => map.invalidateSize());
setTimeout(() => map.invalidateSize(), 80);
