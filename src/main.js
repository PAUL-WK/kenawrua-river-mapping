import './styles/app.css';
import L from 'leaflet';
import { LAYERS, BASINS, BASIN_EXTENTS, BASIN_COLOR, ALL_MONTHS, asOf, normBasin, layerById } from './layers.js';

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
      <div class="icon-rail">
        <button class="rail-btn" id="rail-layers" title="Layers"><span class="msym">layers</span></button>
        <button class="rail-btn" id="rail-analytics" title="Basin Analytics"><span class="msym">monitoring</span></button>
        <button class="rail-btn" id="rail-table" title="Attribute table"><span class="msym">table_rows</span></button>
        <div style="flex:1"></div>
        <button class="rail-btn" id="rail-basemap" title="Basemap"><span class="msym">public</span></button>
      </div>

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
          </div>
        </div>
        <div class="time-bar" id="time-bar">
          <button class="time-play" id="time-play" title="Play / pause"><span class="msym" id="time-play-icon" style="font-size:18px">play_arrow</span></button>
          <div class="time-track-wrap">
            <input type="range" id="time-slider" class="time-slider" min="0" max="${ALL_MONTHS.length - 1}" step="1" value="${ALL_MONTHS.length - 1}">
          </div>
          <div class="time-label mono" id="time-label"></div>
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
            <div class="table-scroll scrollbar"><table class="attr"><thead><tr id="thead-row"></tr><tr id="filter-row" class="filter-row"></tr></thead><tbody id="tbody"></tbody></table></div>
            <div class="table-pagination" id="table-pagination"></div>
          </div>
        </div>
      </div>

      <div class="detail-panel" id="detail-panel">
        <div class="detail-panel-inner">
          <div class="panel-head">
            <div><div class="panel-head-title" id="detail-panel-title">Feature details</div><div class="panel-head-sub" id="detail-panel-sub"></div></div>
            <button class="icon-btn" id="detail-panel-close"><span class="msym" style="font-size:16px">close</span></button>
          </div>
          <div class="detail-panel-body scrollbar" id="detail-panel-body"></div>
        </div>
      </div>
    </div>
  </div>

  <div id="view-dash" class="view" hidden><div class="dash-wrap" id="dash-wrap"></div></div>
</div>`;

// ---------------- state ----------------
let basinFilter = '';
let activeTableLayer = LAYERS[0].id;
let selectedId = null;
let sortKey = null, sortDir = 1;
let columnFilters = {};
let currentPage = 1;
let pageSize = 50;
let headBuiltFor = null;
let activeSidePanel = null;
let tableOpen = false;
let basinsOn = true;
const layerOn = Object.fromEntries(LAYERS.map(l => [l.id, true]));
const markerById = {};

let sliderIdx = ALL_MONTHS.length - 1;
let playing = false;
let playTimer = null;
function currentMonth() { return ALL_MONTHS[sliderIdx]; }
function currentData(layer) { return asOf(layer.data, currentMonth()); }

// ---------------- basin select ----------------
const basinSelect = document.getElementById('basin-select');
BASINS.forEach(b => { const o = document.createElement('option'); o.value = b; o.textContent = b; basinSelect.appendChild(o); });
basinSelect.onchange = () => { basinFilter = basinSelect.value; refresh(); };

// ---------------- map ----------------
const map = L.map('map', { zoomSnap: 0.25, zoomControl: false }).fitBounds([[-3.3, 34.4], [0.9, 38.4]]);
L.control.zoom({ position: 'topright' }).addTo(map);

function updateLabelVisibility() {
  document.getElementById('map').classList.toggle('hide-labels', map.getZoom() < 9);
}
map.on('zoomend', updateLabelVisibility);

// ---------------- basemaps ----------------
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
const basinLayer = L.layerGroup();
if (basinsOn) basinLayer.addTo(map);
const basinPane = map.createPane('basins'); basinPane.style.zIndex = 450;
Object.entries(BASIN_EXTENTS).forEach(([b, pts]) => {
  const c = BASIN_COLOR[b] || '#94a3b8';
  basinLayer.addLayer(L.polygon(pts.map(p => [p[1], p[0]]), { pane: 'basins', color: c, weight: 1.6, dashArray: '5 4', fillColor: c, fillOpacity: 0.07, interactive: false }));
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  basinLayer.addLayer(L.marker([cy, cx], { pane: 'basins', interactive: false, icon: L.divIcon({ className: '', html: `<div style="font:700 11px Inter;letter-spacing:.12em;text-transform:uppercase;color:${c};text-shadow:0 0 4px #fff,0 0 4px #fff,0 0 4px #fff">${b}</div>`, iconSize: null }) }));
});
function toggleBasins(on) {
  basinsOn = on;
  if (on) basinLayer.addTo(map); else map.removeLayer(basinLayer);
}

const leafletLayerGroup = {};
LAYERS.forEach(l => { leafletLayerGroup[l.id] = L.layerGroup().addTo(map); });

// sites visible under the current basin filter AND the current slider month (asOf lookback) —
// a site with no reading yet by this month simply isn't shown, rather than drawn grey as if it
// existed but had "no data" (that grey is reserved for a site that exists but never recorded
// the relevant parameter at all).
function visible(layer) { return currentData(layer).filter(s => !basinFilter || normBasin(s.basin) === basinFilter); }

function drawMarkers() {
  LAYERS.forEach(l => {
    const grp = leafletLayerGroup[l.id];
    grp.clearLayers();
    if (!layerOn[l.id]) return;
    visible(l).forEach(s => {
      const col = l.colorFor(s);
      const dashed = l.dashed(s);
      const m = L.circleMarker([s.lat, s.lon], {
        radius: l.radius(s), color: dashed ? col : '#0f172a', weight: dashed ? 2 : 1.5,
        dashArray: dashed ? '3 3' : null, fillColor: col, fillOpacity: 0.9
      }).bindPopup(l.popup(s)).bindTooltip(s.name, { className: 'site-label', permanent: true, direction: 'right', offset: [7, 0] });
      m.on('click', () => selectSite(l.id, s.id, { openTable: false }));
      markerById[l.id + ':' + s.id] = m;
      grp.addLayer(m);
    });
  });
}

function selectSite(layerId, id, opts = {}) {
  const shouldOpenTable = opts.openTable !== false;
  selectedId = id;
  if (!layerOn[layerId]) {
    layerOn[layerId] = true;
    drawMarkers();
    if (activeSidePanel === 'layers') renderLayersPanel();
  }
  const key = layerId + ':' + id, m = markerById[key];
  if (m) {
    const targetZoom = Math.max(map.getZoom(), 11);
    map.setView(m.getLatLng(), targetZoom);
    m.openPopup();
    flashMarker(m);
  }
  if (shouldOpenTable) {
    openTable(layerId);
    openTableDock();
  } else if (tableOpen) {
    openTable(layerId);
  }
  if (document.getElementById('detail-panel').classList.contains('open')) {
    updateDetailPanel(layerId, id);
  }
}

function flashMarker(m) {
  const orig = { radius: m.options.radius, weight: m.options.weight, color: m.options.color };
  let n = 0;
  const pulse = () => {
    m.setStyle({ radius: orig.radius + 7, weight: 3, color: '#ffffff' });
    setTimeout(() => {
      m.setStyle({ radius: orig.radius, weight: orig.weight, color: orig.color });
      n++;
      if (n < 2) setTimeout(pulse, 140);
    }, 230);
  };
  pulse();
}

function updateDetailPanel(layerId, id) {
  const layer = layerById(layerId);
  const s = currentData(layer).find(x => x.id === id);
  if (!s) return;
  document.getElementById('detail-panel-title').textContent = s.name;
  document.getElementById('detail-panel-sub').textContent = layer.label;
  document.getElementById('detail-panel-body').innerHTML = layer.detail(s);
}

window.hlOpenDetail = function (layerId, id) {
  updateDetailPanel(layerId, id);
  document.getElementById('detail-panel').classList.add('open');
  map.closePopup();
};
document.getElementById('detail-panel-close').onclick = () => document.getElementById('detail-panel').classList.remove('open');

// ---------------- side panel: layers ----------------
function renderLayersPanel() {
  document.getElementById('side-panel-title').textContent = 'Active layers';
  document.getElementById('side-panel-sub').textContent = 'Tap the table icon to inspect a layer';
  const body = document.getElementById('side-panel-body');
  body.innerHTML = '<div class="layer-rows" id="layer-rows"></div>';
  const rowsEl = document.getElementById('layer-rows');

  const refGroup = document.createElement('div'); refGroup.className = 'layer-group-label'; refGroup.textContent = 'Reference';
  rowsEl.appendChild(refGroup);
  const basinRow = document.createElement('div'); basinRow.className = 'layer-row';
  basinRow.innerHTML = `
    <label>
      <input type="checkbox" ${basinsOn ? 'checked' : ''}>
      <span>
        <span style="display:flex;align-items:center;gap:7px"><span class="layer-swatch" style="background:linear-gradient(135deg,#a78bfa,#34d399,#60a5fa,#fb923c,#f472b6)"></span><span class="layer-name">Basin boundaries</span></span>
        <span class="layer-sub">Approximate WRUA basin outlines</span>
      </span>
    </label>
    <span class="layer-count">${BASINS.length}</span>`;
  basinRow.querySelector('input').onchange = e => toggleBasins(e.target.checked);
  rowsEl.appendChild(basinRow);

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

// ---------------- legend (shows every layer that's switched on, each with its own scale) ----------------
function buildLegend() {
  const parts = LAYERS.filter(l => layerOn[l.id]).map(l => `
    <div class="legend-group">
      <div class="legend-title">${l.label}</div>
      ${Object.values(l.cat).map(v => `<div class="legend-item"><span class="legend-dot" style="background:${v.c}"></span>${v.label}</div>`).join('')}
    </div>`).join('');
  document.getElementById('legend').innerHTML = parts || '';
}

// ---------------- time slider ----------------
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}
function updateTimeLabel() {
  document.getElementById('time-label').textContent = monthLabel(currentMonth());
}
function setSlider(idx) {
  sliderIdx = Math.max(0, Math.min(ALL_MONTHS.length - 1, idx));
  document.getElementById('time-slider').value = sliderIdx;
  updateTimeLabel();
  refresh();
}
document.getElementById('time-slider').oninput = e => setSlider(+e.target.value);
function stopPlaying() {
  playing = false;
  clearInterval(playTimer);
  document.getElementById('time-play-icon').textContent = 'play_arrow';
}
function startPlaying() {
  if (sliderIdx >= ALL_MONTHS.length - 1) sliderIdx = 0;
  playing = true;
  document.getElementById('time-play-icon').textContent = 'pause';
  playTimer = setInterval(() => {
    if (sliderIdx >= ALL_MONTHS.length - 1) { stopPlaying(); return; }
    setSlider(sliderIdx + 1);
  }, 450);
}
document.getElementById('time-play').onclick = () => { playing ? stopPlaying() : startPlaying(); };
updateTimeLabel();

// ---------------- basin stats (shared by side panel + full dashboard) ----------------
function basinStats(filter) {
  const layerSets = LAYERS.map(l => currentData(l).filter(s => !filter || normBasin(s.basin) === filter));
  const total = layerSets.reduce((a, s) => a + s.length, 0);
  const counts = {};
  LAYERS.forEach((l, i) => {
    const tally = {};
    layerSets[i].forEach(s => { tally[s._reading.category] = (tally[s._reading.category] || 0) + 1; });
    counts[l.id] = tally;
  });
  return { total, perLayer: Object.fromEntries(LAYERS.map((l, i) => [l.id, layerSets[i].length])), counts };
}
function statCard(label, val, sub) { return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-val">${val}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`; }
function hBarChart(items) {
  const max = Math.max(1, ...items.map(i => i.value));
  return items.map(i => `<div class="river-bar-row">
    <div class="river-bar-name">${i.label}</div>
    <div class="river-bar-track"><div class="river-bar-fill" style="width:${i.value / max * 100}%;background:${i.color || 'var(--accent)'}"></div></div>
    <div class="river-bar-val">${i.value}</div></div>`).join('') || '<div style="font-size:12px;color:#64748b">No data.</div>';
}
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
function basinCounts(filter) {
  return BASINS.map(b => ({
    label: b,
    value: LAYERS.reduce((a, l) => a + currentData(l).filter(s => normBasin(s.basin) === b && (!filter || normBasin(s.basin) === filter)).length, 0),
    color: BASIN_COLOR[b] || '#94a3b8'
  })).sort((a, b) => b.value - a.value);
}

// ---------------- side panel: basin analytics ----------------
function renderAnalyticsPanel() {
  document.getElementById('side-panel-title').textContent = 'Basin Analytics';
  document.getElementById('side-panel-sub').textContent = (basinFilter || 'All basins') + ' · as of ' + monthLabel(currentMonth());
  const st = basinStats(basinFilter);
  const pollSegs = Object.entries(st.counts.pollution || {}).map(([k, v]) => ({ label: layerById('pollution').cat[k].label, value: v, color: layerById('pollution').cat[k].c }));
  const healthSegs = Object.entries(st.counts.health || {}).map(([k, v]) => ({ label: layerById('health').cat[k].label, value: v, color: layerById('health').cat[k].c }));
  document.getElementById('side-panel-body').innerHTML = `
    <div class="stat-grid">
      ${statCard('Sites shown', st.total)}
      ${statCard('Pollution sites', st.perLayer.pollution)}
      ${statCard('Health sites', st.perLayer.health)}
    </div>
    <div><div style="font-size:12px;font-weight:700;margin-bottom:8px">Nutrient Pollution</div>${donutChart(pollSegs)}</div>
    <div><div style="font-size:12px;font-weight:700;margin-bottom:8px">River Health</div>${donutChart(healthSegs)}</div>
    <div><button class="subbar-btn" id="analytics-expand" style="width:100%;justify-content:center"><span class="msym" style="font-size:16px">open_in_full</span><span>Full dashboard</span></button></div>
    <div class="hud-foot">Covers ${BASINS.length} basins · snapshot as of ${monthLabel(currentMonth())}, drag the time slider to change it.</div>`;
  document.getElementById('analytics-expand').onclick = () => showView('dash');
}

function renderDash() {
  const st = basinStats(basinFilter);
  const pollSegs = Object.entries(st.counts.pollution || {}).map(([k, v]) => ({ label: layerById('pollution').cat[k].label, value: v, color: layerById('pollution').cat[k].c }));
  const healthSegs = Object.entries(st.counts.health || {}).map(([k, v]) => ({ label: layerById('health').cat[k].label, value: v, color: layerById('health').cat[k].c }));
  const basinBars = basinCounts(basinFilter).map(b => ({ ...b, label: b.label.length > 18 ? b.label.slice(0, 16) + '…' : b.label }));
  document.getElementById('dash-wrap').innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
      <div><div class="dash-h1">Basin Analytics — ${basinFilter || 'All basins'}</div><div class="dash-p">Snapshot as of ${monthLabel(currentMonth())}. Demonstration prototype built from WRUA and citizen-science monitoring records shared with KeNAWRUA.</div></div>
      <div class="chipbar"><span class="msym" style="font-size:16px;color:#06b6d4">travel_explore</span><select id="dash-basin-select"></select></div>
    </div>
    <div class="dash-stat-grid">
      ${statCard('Total sites shown', st.total)}
      ${statCard('Pollution sites', st.perLayer.pollution, 'nitrate / phosphate / turbidity')}
      ${statCard('Health sites', st.perLayer.health, 'pH / dissolved oxygen')}
      ${statCard('Severe pollution', (st.counts.pollution || {}).severe || 0)}
      ${statCard('Stressed health', (st.counts.health || {}).stressed || 0)}
    </div>
    <div class="dash-row-2">
      <div class="dash-card">
        <div class="dash-card-title">Nutrient Pollution — category</div>
        ${donutChart(pollSegs)}
      </div>
      <div class="dash-card">
        <div class="dash-card-title">River Health — category</div>
        ${donutChart(healthSegs)}
      </div>
    </div>
    <div class="dash-card">
      <div class="dash-card-title">Sites by basin</div>
      <div class="bar-list">${hBarChart(basinBars)}</div>
    </div>
    <div style="font-size:11px;color:#64748b;border-top:1px solid #1e293b;padding-top:12px">Coverage caveat: this demonstration holds a sample of KeNAWRUA's monitoring points, not a full national census. Grey "no data" markers mean the parameter was never recorded there — never read as "good."</div>`;
  const dashSel = document.getElementById('dash-basin-select');
  dashSel.innerHTML = '<option value="">All basins</option>' + BASINS.map(b => `<option value="${b}">${b}</option>`).join('');
  dashSel.value = basinFilter;
  dashSel.onchange = () => { basinFilter = dashSel.value; basinSelect.value = basinFilter; refresh(); renderDash(); };
}

// ---------------- attribute table (per layer, bottom-docked, pushes the map) ----------------
function openTable(layerId) {
  const changed = layerId !== headBuiltFor;
  activeTableLayer = layerId;
  if (changed) {
    sortKey = null; sortDir = 1; columnFilters = {}; currentPage = 1;
    renderTableHead(layerById(layerId));
    headBuiltFor = layerId;
  }
  renderTableBody();
}
function renderTableHead(layer) {
  document.getElementById('thead-row').innerHTML = '<th class="action-col"></th>' + layer.columns.map(([k, l]) =>
    `<th data-k="${k}">${l}${sortKey === k ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
  [...document.querySelectorAll('#thead-row th[data-k]')].forEach(th => th.onclick = () => {
    const k = th.dataset.k; if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = 1; }
    renderTableHead(layer); renderTableBody();
  });
  document.getElementById('filter-row').innerHTML = '<th class="action-col"></th>' + layer.columns.map(([k]) =>
    `<th><input class="col-filter" data-k="${k}" placeholder="Filter…" value="${columnFilters[k] || ''}"></th>`).join('');
  [...document.querySelectorAll('.col-filter')].forEach(inp => inp.oninput = () => {
    columnFilters[inp.dataset.k] = inp.value; currentPage = 1; renderTableBody();
  });
}
function matchesColumnFilters(s) {
  return Object.entries(columnFilters).every(([k, val]) => !val || String(s[k] ?? '').toLowerCase().includes(val.toLowerCase()));
}
function renderTableBody() {
  const layer = layerById(activeTableLayer);
  document.getElementById('table-icon').textContent = layer.id === 'pollution' ? 'water_drop' : 'water';
  document.getElementById('table-title').textContent = layer.label + ' — attribute table';
  const q = (document.getElementById('table-search').value || '').toLowerCase();
  let rows = visible(layer).filter(s => (!q || [s.name, s.wrua, s.basin, s.id].filter(Boolean).join(' ').toLowerCase().includes(q)) && matchesColumnFilters(s));
  if (sortKey) rows = rows.slice().sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (av == null) av = typeof bv === 'number' ? -1 : '';
    if (bv == null) bv = typeof av === 'number' ? -1 : '';
    return av > bv ? sortDir : av < bv ? -sortDir : 0;
  });
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  document.getElementById('table-count').textContent = (total === 0 ? 0 : start + 1) + '–' + Math.min(start + pageSize, total) + ' of ' + total + ' rows';
  document.getElementById('tbody').innerHTML = pageRows.map(s => `<tr class="${s.id === selectedId ? 'sel' : ''}" data-id="${s.id}">
    <td class="action-cell"><button class="row-zoom-btn" title="Zoom to feature"><span class="msym" style="font-size:15px">center_focus_strong</span></button></td>
    ${layer.columns.map(([k]) => `<td>${layer.cell(s, k)}</td>`).join('')}</tr>`).join('')
    || `<tr><td colspan="${layer.columns.length + 1}" style="text-align:center;color:#64748b;padding:18px">No rows match the current filters.</td></tr>`;
  [...document.querySelectorAll('#tbody tr[data-id]')].forEach(tr => {
    tr.onclick = () => selectSite(layer.id, tr.dataset.id);
    const btn = tr.querySelector('.row-zoom-btn');
    if (btn) btn.onclick = e => { e.stopPropagation(); selectSite(layer.id, tr.dataset.id); };
  });
  renderPagination(totalPages);
}
function renderPagination(totalPages) {
  document.getElementById('table-pagination').innerHTML = `
    <button class="page-btn" id="page-prev" ${currentPage <= 1 ? 'disabled' : ''}><span class="msym" style="font-size:16px">chevron_left</span></button>
    <span class="page-info">Page ${currentPage} of ${totalPages}</span>
    <button class="page-btn" id="page-next" ${currentPage >= totalPages ? 'disabled' : ''}><span class="msym" style="font-size:16px">chevron_right</span></button>
    <select class="page-size-select" id="page-size-select">
      ${[25, 50, 100].map(n => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n} / page</option>`).join('')}
    </select>`;
  document.getElementById('page-prev').onclick = () => { if (currentPage > 1) { currentPage--; renderTableBody(); } };
  document.getElementById('page-next').onclick = () => { if (currentPage < totalPages) { currentPage++; renderTableBody(); } };
  document.getElementById('page-size-select').onchange = e => { pageSize = +e.target.value; currentPage = 1; renderTableBody(); };
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
  renderTableBody();
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
document.getElementById('table-search').oninput = () => { currentPage = 1; renderTableBody(); };
document.getElementById('nav-map').onclick = () => showView('map');
document.getElementById('nav-dash').onclick = () => showView('dash');

['side-panel', 'table-dock', 'detail-panel'].forEach(id => {
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
function refresh() {
  buildLegend(); drawMarkers();
  if (tableOpen || headBuiltFor) renderTableBody();
  if (activeSidePanel === 'layers') renderLayersPanel();
  if (activeSidePanel === 'analytics') renderAnalyticsPanel();
  if (!document.getElementById('view-dash').hidden) renderDash();
}

refresh();
openTable(LAYERS[0].id);
updateLabelVisibility();
window.addEventListener('resize', () => map.invalidateSize());
setTimeout(() => map.invalidateSize(), 80);
