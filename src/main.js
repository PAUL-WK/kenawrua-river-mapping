import './styles/app.css';
import L from 'leaflet';
import { LAYERS, BASINS, RIVERS, BASIN_EXTENTS, BASIN_COLOR, Q, ST, colorFor, layerById } from './layers.js';

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
    <div class="body-row">
      <!-- slim icon rail: click to expand the matching panel -->
      <div class="icon-rail">
        <button class="rail-btn" id="rail-layers" title="Layers"><span class="msym">layers</span></button>
        <button class="rail-btn" id="rail-analytics" title="Basin Analytics"><span class="msym">monitoring</span></button>
        <button class="rail-btn" id="rail-table" title="Attribute table"><span class="msym">table_rows</span></button>
        <div style="flex:1"></div>
        <button class="rail-btn" id="rail-basemap" title="Basemap"><span class="msym">public</span></button>
      </div>

      <!-- side panel: fixed width, pushes the map column rather than floating over it -->
      <div class="side-panel" id="side-panel">
        <div class="side-panel-inner">
          <div class="panel-head">
            <div><div class="panel-head-title" id="side-panel-title">Layers</div><div class="panel-head-sub" id="side-panel-sub"></div></div>
            <button class="icon-btn" id="side-panel-close"><span class="msym" style="font-size:16px">close</span></button>
          </div>
          <div class="side-panel-body scrollbar" id="side-panel-body"></div>
        </div>
      </div>

      <div class="map-col">
        <div class="map-subbar">
          <div class="subbar-left">
            <div class="chipbar"><span class="msym" style="font-size:16px;color:#06b6d4">travel_explore</span>
              <select id="basin-select"><option value="">All basins</option></select></div>
            <div class="seg" id="color-mode">
              <button data-mode="quality" class="on">Water quality</button>
              <button data-mode="status">Monitoring status</button>
            </div>
          </div>
        </div>
        <div class="map-stage">
          <div id="map"></div>
          <div class="basemap-picker" id="basemap-picker" hidden></div>
          <div class="legend" id="legend"></div>
        </div>
        <div class="table-dock" id="table-dock">
          <div class="table-dock-inner">
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
      </div>
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
let activeSidePanel = null; // null | 'layers' | 'analytics'
let tableOpen = false;
const layerOn = Object.fromEntries(LAYERS.map(l => [l.id, true]));
const markerById = {};

// ---------------- basin select ----------------
const basinSelect = document.getElementById('basin-select');
BASINS.forEach(b => { const o = document.createElement('option'); o.value = b; o.textContent = b; basinSelect.appendChild(o); });
basinSelect.onchange = () => { basinFilter = basinSelect.value; refresh(); };

// ---------------- map ----------------
// zoomControl stays top-right — the icon rail + side panel now own the left edge, so the
// default top-left position (which used to collide with the floating layers FAB) is free,
// but top-right keeps the zoom buttons clear of both.
const map = L.map('map', { zoomSnap: 0.25, zoomControl: false }).fitBounds([[-3.3, 34.4], [0.9, 38.4]]);
L.control.zoom({ position: 'topright' }).addTo(map);

// ---------------- basemaps ----------------
// Real raster tiles instead of a hand-drawn dark vector basemap — OpenStreetMap is the default,
// with a couple of alternates reachable from the basemap icon on the rail.
const BASEMAPS = {
  osm: { label: 'OpenStreetMap', layer: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }) },
  dark: { label: 'Dark', layer: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd', attribution: '&copy; OpenStreetMap contributors &copy; CARTO' }) },
  satellite: { label: 'Satellite', layer: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' }) }
};
let currentBasemap = 'osm';
BASEMAPS[currentBasemap].layer.addTo(map);
map.attributionControl.setPrefix(false);

function setBasemap(key) {
  if (key === currentBasemap) return;
  map.removeLayer(BASEMAPS[currentBasemap].layer);
  currentBasemap = key;
  BASEMAPS[currentBasemap].layer.addTo(map);
  buildBasemapPicker();
}
function buildBasemapPicker() {
  document.getElementById('basemap-picker').innerHTML = Object.entries(BASEMAPS).map(([key, b]) =>
    `<button class="basemap-btn ${key === currentBasemap ? 'on' : ''}" data-key="${key}">${b.label}</button>`).join('');
  [...document.querySelectorAll('.basemap-btn')].forEach(btn => btn.onclick = () => setBasemap(btn.dataset.key));
}
buildBasemapPicker();

// Approximate WRUA basin outlines, drawn over the real basemap for orientation.
const basinLayer = L.layerGroup().addTo(map);
const basinPane = map.createPane('basins'); basinPane.style.zIndex = 450;
Object.entries(BASIN_EXTENTS).forEach(([b, pts]) => {
  const c = BASIN_COLOR[b] || '#94a3b8';
  basinLayer.addLayer(L.polygon(pts.map(p => [p[1], p[0]]), { pane: 'basins', color: c, weight: 1.6, dashArray: '5 4', fillColor: c, fillOpacity: 0.07, interactive: false }));
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  basinLayer.addLayer(L.marker([cy, cx], { pane: 'basins', interactive: false, icon: L.divIcon({ className: '', html: `<div style="font:700 11px Inter;letter-spacing:.12em;text-transform:uppercase;color:${c};text-shadow:0 0 4px #fff,0 0 4px #fff,0 0 4px #fff">${b}</div>`, iconSize: null }) }));
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

// ---------------- side panel: layers ----------------
function renderLayersPanel() {
  document.getElementById('side-panel-title').textContent = 'Active layers';
  document.getElementById('side-panel-sub').textContent = 'Tap the table icon to inspect a layer';
  const body = document.getElementById('side-panel-body');
  body.innerHTML = '<div class="layer-rows" id="layer-rows"></div>';
  const rowsEl = document.getElementById('layer-rows');
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
    row.querySelector('input').onchange = e => { layerOn[l.id] = e.target.checked; drawMarkers(); renderLayersPanel(); };
    row.querySelector('.layer-table-btn').onclick = () => { openTable(l.id); openTableDock(); };
    rowsEl.appendChild(row);
  });
}

// ---------------- legend ----------------
function buildLegend() {
  const scale = colorMode === 'quality' ? Q : ST;
  document.getElementById('legend').innerHTML = `<div class="legend-title">${colorMode === 'quality' ? 'Water quality' : 'Monitoring status'}</div>` +
    Object.values(scale).map(v => `<div class="legend-item"><span class="legend-dot" style="background:${v.c}"></span>${v.label}</div>`).join('');
}

// ---------------- basin stats (shared by side panel + full dashboard) ----------------
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
// generic horizontal bar chart — reuses the river-bar-* layout for any {label,value,color} list
function hBarChart(items) {
  const max = Math.max(1, ...items.map(i => i.value));
  return items.map(i => `<div class="river-bar-row">
    <div class="river-bar-name">${i.label}</div>
    <div class="river-bar-track"><div class="river-bar-fill" style="width:${i.value / max * 100}%;background:${i.color || 'var(--accent)'}"></div></div>
    <div class="river-bar-val">${i.value}</div></div>`).join('') || '<div style="font-size:12px;color:#64748b">No data.</div>';
}
// CSS conic-gradient donut + legend, for any {label,value,color} list
function donutChart(segments) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  const stops = total ? segments.map(s => {
    const start = acc / total * 360; acc += s.value; const end = acc / total * 360;
    return `${s.color} ${start}deg ${end}deg`;
  }).join(', ') : 'var(--line) 0deg 360deg';
  return `<div class="donut-row">
    <div class="donut" style="background:conic-gradient(${stops})">
      <div class="donut-center"><div class="donut-center-val">${total}</div><div class="donut-center-sub">sites</div></div>
    </div>
    <div class="donut-legend">${segments.map(s => `<div class="donut-legend-item"><span class="donut-legend-dot" style="background:${s.color}"></span><span class="donut-legend-label">${s.label}</span><span class="donut-legend-val">${s.value}</span></div>`).join('')}</div>
  </div>`;
}
// quality/status breakdown across both layers — respects the basin filter, like the stat cards
function qualityStatusTallies(filter) {
  const all = [...layerById('cs').data, ...layerById('wrua').data].filter(s => !filter || s.basin === filter);
  const quality = {}, status = {};
  all.forEach(s => { quality[s.quality] = (quality[s.quality] || 0) + 1; status[s.status] = (status[s.status] || 0) + 1; });
  return { quality, status };
}
// site count per basin, across both layers — always shows the full national spread, since
// comparing basins is the whole point of this chart (it ignores the current basin filter)
function basinCounts() {
  return BASINS.map(b => ({
    label: b,
    value: layerById('cs').data.filter(s => s.basin === b).length + layerById('wrua').data.filter(s => s.basin === b).length,
    color: BASIN_COLOR[b] || '#94a3b8'
  })).sort((a, b) => b.value - a.value);
}
// land-use breakdown for citizen-science sites only (WRUA stations don't carry this field)
function landuseCounts(filter) {
  const counts = {};
  layerById('cs').data.filter(s => !filter || s.basin === filter).forEach(s => {
    const lu = s.landuse ? s.landuse.replace(/_/g, ' ') : 'Unknown';
    counts[lu] = (counts[lu] || 0) + 1;
  });
  return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

// ---------------- side panel: basin analytics ----------------
function renderAnalyticsPanel() {
  document.getElementById('side-panel-title').textContent = 'Basin Analytics';
  document.getElementById('side-panel-sub').textContent = basinFilter || 'All basins';
  const st = basinStats(basinFilter);
  document.getElementById('side-panel-body').innerHTML = `
    <div class="stat-grid">
      ${statCard('Sites shown', st.total)}
      ${statCard('Avg. pollution idx', st.avgIdx == null ? '–' : Math.round(st.avgIdx), 'citizen-science sites')}
      ${statCard('Actively sampled', st.active, '< 18 months ago')}
      ${statCard('Low oxygen', st.lowDO, 'WRUA, DO &lt; 5 mg/L')}
    </div>
    <div><div style="font-size:12px;font-weight:700;margin-bottom:8px">Most polluted rivers</div><div style="display:flex;flex-direction:column;gap:7px">${riverBars(st.rivers, 6)}</div></div>
    <div><button class="subbar-btn" id="analytics-expand" style="width:100%;justify-content:center"><span class="msym" style="font-size:16px">open_in_full</span><span>Full dashboard</span></button></div>
    <div class="hud-foot">Covers ${BASINS.length} basins and 50 WRUAs in the shared dataset — a sample of KeNAWRUA's 756 WRUAs nationally, not a full census.</div>`;
  document.getElementById('analytics-expand').onclick = () => showView('dash');
}

function renderDash() {
  const st = basinStats(basinFilter);
  const { quality, status } = qualityStatusTallies(basinFilter);
  const qualitySegs = Object.entries(quality).map(([key, value]) => ({ label: Q[key] ? Q[key].label : key, value, color: Q[key] ? Q[key].c : '#94a3b8' }));
  const statusSegs = Object.entries(status).map(([key, value]) => ({ label: ST[key] ? ST[key].label : key, value, color: ST[key] ? ST[key].c : '#94a3b8' }));
  const basinBars = basinCounts().map(b => ({ ...b, label: b.label.length > 18 ? b.label.slice(0, 16) + '…' : b.label }));
  const landuseBars = landuseCounts(basinFilter).map(l => ({ ...l, color: '#38bdf8' }));
  document.getElementById('dash-wrap').innerHTML = `
    <div><div class="dash-h1">Basin Analytics — ${basinFilter || 'All basins'}</div><div class="dash-p">Demonstration prototype built from WRUA and citizen-science monitoring records shared with KeNAWRUA.</div></div>
    <div class="dash-stat-grid">
      ${statCard('Total sites', st.total)}
      ${statCard('Citizen-science', st.cs, 'nitrate / phosphate / turbidity')}
      ${statCard('WRUA stations', st.wr, 'pH / dissolved oxygen')}
      ${statCard('Avg. pollution idx', st.avgIdx == null ? '–' : Math.round(st.avgIdx))}
    </div>
    <div class="dash-row-2-1">
      <div class="dash-card">
        <div class="dash-card-title">Rivers ranked by pollution index</div>
        <div class="bar-list">${riverBars(st.rivers, 13)}</div>
      </div>
      <div class="dash-col-stack">
        <div class="dash-card">
          <div class="dash-card-title">Water quality</div>
          ${donutChart(qualitySegs)}
        </div>
        <div class="dash-card">
          <div class="dash-card-title">Monitoring status</div>
          ${donutChart(statusSegs)}
        </div>
      </div>
    </div>
    <div class="dash-row-2">
      <div class="dash-card">
        <div class="dash-card-title">Sites by basin</div>
        <div class="bar-list">${hBarChart(basinBars)}</div>
      </div>
      <div class="dash-card">
        <div class="dash-card-title">Citizen-science sites by land use</div>
        <div class="bar-list">${hBarChart(landuseBars)}</div>
      </div>
    </div>
    <div class="dash-stat-grid" style="grid-template-columns:repeat(3,1fr)">
      ${statCard('Actively sampled', st.active, 'sampled in the last 18 months')}
      ${statCard('Inactive / stale', st.stale, 'no recent sample')}
      ${statCard('Low-oxygen WRUA sites', st.lowDO, 'DO below 5 mg/L')}
    </div>
    <div style="font-size:11px;color:#64748b;border-top:1px solid #1e293b;padding-top:12px">Coverage caveat: this demonstration holds data for 50 of KeNAWRUA's 756 national WRUAs. Treat unmapped areas as data gaps, not confirmed inactivity.</div>`;
}

// ---------------- attribute table (per layer, bottom-docked, pushes the map) ----------------
function openTable(layerId) {
  activeTableLayer = layerId;
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

// ---------------- rail + side panel + table dock wiring ----------------
function setRailOn() {
  document.getElementById('rail-layers').classList.toggle('on', activeSidePanel === 'layers');
  document.getElementById('rail-analytics').classList.toggle('on', activeSidePanel === 'analytics');
  document.getElementById('rail-table').classList.toggle('on', tableOpen);
}
function openSidePanel(which) {
  activeSidePanel = which;
  document.getElementById('side-panel').classList.add('open');
  if (which === 'layers') renderLayersPanel(); else renderAnalyticsPanel();
  setRailOn();
}
function closeSidePanel() {
  activeSidePanel = null;
  document.getElementById('side-panel').classList.remove('open');
  setRailOn();
}
function toggleSidePanel(which) {
  if (activeSidePanel === which) closeSidePanel(); else openSidePanel(which);
}
function openTableDock() {
  tableOpen = true;
  document.getElementById('table-dock').classList.add('open');
  setRailOn();
  renderTable();
}
function closeTableDock() {
  tableOpen = false;
  document.getElementById('table-dock').classList.remove('open');
  setRailOn();
}
function toggleTableDock() { tableOpen ? closeTableDock() : openTableDock(); }

document.getElementById('rail-layers').onclick = () => toggleSidePanel('layers');
document.getElementById('rail-analytics').onclick = () => toggleSidePanel('analytics');
document.getElementById('rail-table').onclick = () => toggleTableDock();
document.getElementById('rail-basemap').onclick = () => { document.getElementById('basemap-picker').hidden = !document.getElementById('basemap-picker').hidden; };
document.getElementById('side-panel-close').onclick = () => closeSidePanel();
document.getElementById('table-close').onclick = () => closeTableDock();
document.getElementById('table-search').oninput = renderTable;
document.getElementById('nav-map').onclick = () => showView('map');
document.getElementById('nav-dash').onclick = () => showView('dash');
document.querySelectorAll('#color-mode button').forEach(b => b.onclick = () => { colorMode = b.dataset.mode; refresh(); });

// the map canvas only resizes because the side panel / table dock are real flex items (their
// width/height is animated, not an overlay) — recalculate Leaflet's internal size once that
// transition finishes, otherwise tiles stay clipped to the old canvas size.
['side-panel', 'table-dock'].forEach(id => {
  document.getElementById(id).addEventListener('transitionend', e => {
    if (e.propertyName === 'width' || e.propertyName === 'height') map.invalidateSize();
  });
});

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
  updateColorButtons(); buildLegend(); drawMarkers(); renderTable();
  if (activeSidePanel === 'layers') renderLayersPanel();
  if (activeSidePanel === 'analytics') renderAnalyticsPanel();
}

refresh();
openTable(LAYERS[0].id);
window.addEventListener('resize', () => map.invalidateSize());
setTimeout(() => map.invalidateSize(), 80);
