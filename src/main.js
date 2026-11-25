import './styles/app.css';
import L from 'leaflet';
import { LAYERS, BASINS, BASIN_COLOR, ALL_MONTHS, asOf, normBasin, layerById } from './layers.js';

const app = document.getElementById('app');
app.innerHTML = `
<div class="app-shell">
  <header class="app-header">
    <div class="brand">
      <div class="brand-icon"><span class="msym" style="font-size:18px">water_drop</span></div>
      <div>
        <div class="brand-name">HydroLens <b>Kenya</b></div>
        <div class="brand-sub">Demonstration prototype for KeNAWRUA</div>
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
          <button class="time-cal-btn" id="time-cal-left" title="Jump to a specific month"><span class="msym" style="font-size:16px">calendar_month</span></button>
          <div class="time-track-wrap">
            <input type="range" id="time-slider" class="time-slider" min="0" max="${ALL_MONTHS.length - 1}" step="1" value="${ALL_MONTHS.length - 1}">
          </div>
          <button class="time-cal-btn" id="time-cal-right" title="Jump to a specific month"><span class="msym" style="font-size:16px">calendar_month</span></button>
          <div class="time-label mono" id="time-label"></div>
          <div class="time-cal-popover" id="time-cal-popover" hidden></div>
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
let selectedLayerId = null; // which layer selectedId belongs to — guards the attribute-table trend row below
let sortKey = null, sortDir = 1;
let columnFilters = {};
let currentPage = 1;
let pageSize = 50;
let headBuiltFor = null;
let activeSidePanel = null;
let tableOpen = false;
// only the first layer (Nutrient Pollution) is active by default — the legend below mirrors
// whichever layer(s) are on, so it starts showing just one scale; switching layers on/off in
// the Layers panel grows or shrinks it accordingly.
const layerOn = Object.fromEntries(LAYERS.map((l, i) => [l.id, i === 0]));
const markerById = {};

let sliderIdx = ALL_MONTHS.length - 1;
let playing = false;
let playTimer = null;
// tracks whatever the detail panel / an open marker popup is currently showing, so both can be
// refreshed in place as the time slider moves instead of freezing at the values they opened with
let detailShown = null; // {layerId, id} | null
let popupShown = null;  // {layerId, id} | null
function currentMonth() { return ALL_MONTHS[sliderIdx]; }
function currentData(layer) { return asOf(layer.data, currentMonth()); }

// Dashboard's own Year/Month date filter — independent of the map view's time slider.
// Either a single month (from === to) or a start/end range, picked from a dialog opened off
// the date chip. Defaults to the full axis (i.e. no filtering) until the user narrows it.
let dashMode = 'range'; // 'single' | 'range'
let dashFromIdx = 0;
let dashToIdx = ALL_MONTHS.length - 1;
function dashFromMonth() { return ALL_MONTHS[dashFromIdx]; }
function dashToMonth() { return ALL_MONTHS[dashToIdx]; }
function dashDateLabel() {
  return dashMode === 'single' ? monthLabel(dashToMonth()) : `${monthLabel(dashFromMonth())} – ${monthLabel(dashToMonth())}`;
}
// true once either the date filter has been narrowed away from "whole project", or a basin
// filter is applied — drives whether the "Clear" pill is shown at all
function dashDateFilterActive() {
  return dashMode === 'single' || dashFromIdx !== 0 || dashToIdx !== ALL_MONTHS.length - 1;
}
function dashFilterActive() {
  return dashDateFilterActive() || basinFilter !== '';
}
// resets both the date filter and the basin filter — the basin select lives on both the map
// view and the dashboard, so keep them in sync and refresh the map too
function clearDashFilters() {
  dashMode = 'range';
  dashFromIdx = 0;
  dashToIdx = ALL_MONTHS.length - 1;
  basinFilter = '';
  basinSelect.value = '';
  closeDashDatePopover();
  refresh();
  renderDash();
}

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
map.on('zoomend', () => { updateLabelVisibility(); declutterLabels(); });
map.on('moveend', declutterLabels);
// invalidateSize() (fired whenever a side panel opens/closes, the window resizes, or the map
// becomes visible again after being hidden) repositions every marker without panning or
// zooming — neither 'moveend' nor 'zoomend' fires for it, so the declutter pass would otherwise
// go stale against the map's actual current layout.
map.on('resize', declutterLabels);
// Leaflet's own 'resize' event only fires when it detects an actual size delta, which it can
// miss in practice (e.g. the very first invalidateSize() right after load, before the browser
// has painted a final layout) — call this instead of a bare invalidateSize() so the declutter
// pass is guaranteed to re-run regardless.
function syncMapSize() { map.invalidateSize(); declutterLabels(); }

// ---------------- basemaps ----------------
const BASEMAPS = {
  osm: { label: 'OpenStreetMap', layer: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }) },
  dark: { label: 'Dark', layer: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd', attribution: '&copy; OpenStreetMap contributors &copy; CARTO' }) },
  satellite: { label: 'Satellite', layer: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' }) },
  googleRoad: { label: 'Google Roadmap', layer: L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: '0123', attribution: '&copy; Google' }) },
  googleHybrid: { label: 'Google Hybrid', layer: L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: '0123', attribution: '&copy; Google' }) }
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


const leafletLayerGroup = {};
LAYERS.forEach(l => { leafletLayerGroup[l.id] = L.layerGroup().addTo(map); });

// sites visible under the current basin filter AND the current slider month (asOf lookback) —
// a site with no reading yet by this month simply isn't shown, rather than drawn grey as if it
// existed but had "no data" (that grey is reserved for a site that exists but never recorded
// the relevant parameter at all).
function visible(layer) { return currentData(layer).filter(s => !basinFilter || normBasin(s.basin) === basinFilter); }

function drawMarkers() {
  // clearing a layer group implicitly fires Leaflet's popupclose (which nulls popupShown via
  // the listener below) before we get a chance to redraw — snapshot it first so we know what
  // to try to reopen once the new markers exist.
  const reopenPopup = popupShown;
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
  // re-open whatever popup was showing before this redraw — only if that site still has a
  // reading as of the current slider position (its marker will exist in markerById if so).
  if (reopenPopup) {
    const m = markerById[reopenPopup.layerId + ':' + reopenPopup.id];
    if (m) { m.openPopup(); popupShown = reopenPopup; } else { popupShown = null; }
  }
  declutterLabels();
}

// Permanent site labels collide when two markers sit close together on screen (some NBO_River
// citizen-science sites are only metres apart) — and because label width varies hugely with
// name length ("MB02" vs "Illdungushu siana Wrua @ Nalengitomon"), comparing marker-to-marker
// distance isn't enough: two markers can be far enough apart that they don't collide, while
// their much-wider labels still overlap. So this measures each label's real rendered box
// (after opening every tooltip so Leaflet lays them out) and keeps only non-overlapping ones —
// the site with the longest reading history "wins" its label — closing the rest (their markers
// and popups stay fully interactive either way).
function declutterLabels() {
  const items = [];
  LAYERS.forEach(l => {
    if (!layerOn[l.id]) return;
    visible(l).forEach(s => {
      const m = markerById[l.id + ':' + s.id];
      if (m) items.push({ m, s, priority: s.n || 0 });
    });
  });
  // open everything first (writes), then read every box (reads) — batched to avoid layout thrash
  items.forEach(it => { if (!it.m.isTooltipOpen()) it.m.openTooltip(); });
  items.forEach(it => {
    const tt = it.m.getTooltip();
    const el = tt && tt.getElement();
    it.box = el ? el.getBoundingClientRect() : null;
  });
  items.sort((a, b) => b.priority - a.priority || a.s.name.localeCompare(b.s.name));
  const kept = [];
  const PAD = 2;
  items.forEach(it => {
    if (!it.box) return;
    const b = it.box;
    const collides = kept.some(k => !(b.right + PAD < k.left || k.right + PAD < b.left || b.bottom + PAD < k.top || k.bottom + PAD < b.top));
    if (collides) it.m.closeTooltip();
    else kept.push({ left: b.left, right: b.right, top: b.top, bottom: b.bottom });
  });
}

function selectSite(layerId, id, opts = {}) {
  const shouldOpenTable = opts.openTable !== false;
  selectedId = id;
  selectedLayerId = layerId;
  if (!layerOn[layerId]) {
    layerOn[layerId] = true;
    buildLegend();
    drawMarkers();
    if (activeSidePanel === 'layers') renderLayersPanel();
  }
  // The marker popup and the detail panel both show the same info — if the detail panel
  // ("info window") is already open, opening the popup too is redundant clutter. In that case
  // just flash the marker and zoom to it; the detail panel gets the update below instead.
  const detailOpen = document.getElementById('detail-panel').classList.contains('open');
  const key = layerId + ':' + id, m = markerById[key];
  if (m) {
    const targetZoom = Math.max(map.getZoom(), 11);
    map.setView(m.getLatLng(), targetZoom);
    if (!detailOpen) {
      m.openPopup();
      popupShown = { layerId, id };
    }
    flashMarker(m);
  }
  if (shouldOpenTable) {
    openTable(layerId);
    openTableDock();
  } else if (tableOpen) {
    openTable(layerId);
  }
  if (detailOpen) {
    detailShown = { layerId, id };
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
  document.getElementById('detail-panel-sub').textContent = layer.label + ' · as of ' + monthLabel(currentMonth());
  if (!s) {
    document.getElementById('detail-panel-body').innerHTML =
      '<div style="padding:18px;text-align:center;color:#64748b;font-size:12px">This site has no reading yet as of ' + monthLabel(currentMonth()) + '. Move the time slider forward to see it appear.</div>';
    return;
  }
  document.getElementById('detail-panel-title').textContent = s.name;
  document.getElementById('detail-panel-body').innerHTML = layer.detail(s);
}

window.hlOpenDetail = function (layerId, id) {
  detailShown = { layerId, id };
  updateDetailPanel(layerId, id);
  document.getElementById('detail-panel').classList.add('open');
  map.closePopup();
};
document.getElementById('detail-panel-close').onclick = () => { detailShown = null; document.getElementById('detail-panel').classList.remove('open'); };
map.on('popupclose', () => { popupShown = null; });

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
    row.querySelector('input').onchange = e => { layerOn[l.id] = e.target.checked; refresh(); renderLayersPanel(); };
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
  // Moving the time slider (dragging or playing) shouldn't keep popping the marker popup back
  // open on every redraw — close it once here so drawMarkers()'s "reopen whatever was showing"
  // logic has nothing to reopen. The detail panel (if open) still tracks the slider via `refresh`.
  if (popupShown) { map.closePopup(); popupShown = null; }
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

// -------- year/month jump popover, opened from the calendar icon on either edge of the track --------
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function renderCalMonthGrid(year) {
  const [curY, curM] = currentMonth().split('-').map(Number);
  const grid = document.getElementById('cal-month-grid');
  grid.innerHTML = MONTH_NAMES.map((nm, i) => {
    const m = i + 1;
    const ym = `${year}-${String(m).padStart(2, '0')}`;
    const idx = ALL_MONTHS.indexOf(ym);
    const on = year === curY && m === curM;
    return `<button class="cal-month-btn ${on ? 'on' : ''}" ${idx === -1 ? 'disabled' : ''} data-idx="${idx}">${nm}</button>`;
  }).join('');
  [...grid.querySelectorAll('.cal-month-btn:not([disabled])')].forEach(b => b.onclick = () => {
    stopPlaying();
    setSlider(+b.dataset.idx);
    closeCalPopover();
  });
}
function buildCalPopover() {
  const y0 = +ALL_MONTHS[0].slice(0, 4), y1 = +ALL_MONTHS[ALL_MONTHS.length - 1].slice(0, 4);
  const years = []; for (let y = y0; y <= y1; y++) years.push(y);
  const curY = +currentMonth().slice(0, 4);
  const pop = document.getElementById('time-cal-popover');
  pop.innerHTML = `
    <select class="cal-year-select" id="cal-year">${years.map(y => `<option value="${y}" ${y === curY ? 'selected' : ''}>${y}</option>`).join('')}</select>
    <div class="cal-month-grid" id="cal-month-grid"></div>`;
  renderCalMonthGrid(curY);
  document.getElementById('cal-year').onchange = e => renderCalMonthGrid(+e.target.value);
}
function closeCalPopover() { document.getElementById('time-cal-popover').hidden = true; }
function toggleCalPopover() {
  const pop = document.getElementById('time-cal-popover');
  if (pop.hidden) { buildCalPopover(); pop.hidden = false; } else { closeCalPopover(); }
}
document.getElementById('time-cal-left').onclick = toggleCalPopover;
document.getElementById('time-cal-right').onclick = toggleCalPopover;
document.addEventListener('click', e => {
  const pop = document.getElementById('time-cal-popover');
  if (!pop.hidden && !pop.contains(e.target) && e.target.id !== 'time-cal-left' && e.target.id !== 'time-cal-right' && !e.target.closest('#time-cal-left') && !e.target.closest('#time-cal-right')) {
    closeCalPopover();
  }
});

// -------- Dashboard date filter dialog: single month OR a start/end range --------
function buildDashMonthGrid(gridId, year, selectedIdx, onPick) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = MONTH_NAMES.map((nm, i) => {
    const m = i + 1;
    const ym = `${year}-${String(m).padStart(2, '0')}`;
    const idx = ALL_MONTHS.indexOf(ym);
    const on = idx === selectedIdx;
    return `<button class="cal-month-btn ${on ? 'on' : ''}" ${idx === -1 ? 'disabled' : ''} data-idx="${idx}">${nm}</button>`;
  }).join('');
  [...grid.querySelectorAll('.cal-month-btn:not([disabled])')].forEach(b => b.onclick = () => onPick(+b.dataset.idx));
}
function dashYearOptions(selectedYear) {
  const y0 = +ALL_MONTHS[0].slice(0, 4), y1 = +ALL_MONTHS[ALL_MONTHS.length - 1].slice(0, 4);
  const years = []; for (let y = y0; y <= y1; y++) years.push(y);
  return years.map(y => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`).join('');
}
function renderDashDatePopoverBody() {
  const body = document.getElementById('dash-date-body');
  if (!body) return;
  if (dashMode === 'single') {
    const curY = +dashToMonth().slice(0, 4);
    body.innerHTML = `
      <select class="cal-year-select" id="dash-single-year">${dashYearOptions(curY)}</select>
      <div class="cal-month-grid" id="dash-single-grid"></div>`;
    const draw = y => buildDashMonthGrid('dash-single-grid', y, dashToIdx, idx => {
      dashFromIdx = idx; dashToIdx = idx;
      closeDashDatePopover();
      renderDash();
    });
    draw(curY);
    document.getElementById('dash-single-year').onchange = e => draw(+e.target.value);
  } else {
    const curFromY = +dashFromMonth().slice(0, 4), curToY = +dashToMonth().slice(0, 4);
    body.innerHTML = `
      <div class="dash-date-range-cols">
        <div><div class="dash-date-col-label">Start</div>
          <select class="cal-year-select" id="dash-range-from-year">${dashYearOptions(curFromY)}</select>
          <div class="cal-month-grid" id="dash-range-from-grid"></div></div>
        <div><div class="dash-date-col-label">End</div>
          <select class="cal-year-select" id="dash-range-to-year">${dashYearOptions(curToY)}</select>
          <div class="cal-month-grid" id="dash-range-to-grid"></div></div>
      </div>
      <button class="subbar-btn" id="dash-date-apply" style="width:100%;justify-content:center;margin-top:10px">Apply</button>`;
    let pendingFrom = dashFromIdx, pendingTo = dashToIdx;
    const drawFrom = y => buildDashMonthGrid('dash-range-from-grid', y, pendingFrom, idx => { pendingFrom = idx; drawFrom(y); });
    const drawTo = y => buildDashMonthGrid('dash-range-to-grid', y, pendingTo, idx => { pendingTo = idx; drawTo(y); });
    drawFrom(curFromY);
    drawTo(curToY);
    document.getElementById('dash-range-from-year').onchange = e => drawFrom(+e.target.value);
    document.getElementById('dash-range-to-year').onchange = e => drawTo(+e.target.value);
    document.getElementById('dash-date-apply').onclick = () => {
      if (pendingFrom > pendingTo) { const t = pendingFrom; pendingFrom = pendingTo; pendingTo = t; }
      dashFromIdx = pendingFrom; dashToIdx = pendingTo;
      closeDashDatePopover();
      renderDash();
    };
  }
}
function buildDashDatePopover() {
  const pop = document.getElementById('dash-date-popover');
  if (!pop) return;
  // Clicks anywhere inside the dialog must never reach dash-date-btn's own toggle handler or
  // the document-level "click outside closes it" listener. Relying on e.target.closest(...) in
  // those outer handlers doesn't work here: picking a month rebuilds the grid's innerHTML mid-
  // click, which detaches the clicked button from the tree before the event finishes bubbling,
  // so closest() silently fails and the dialog slams shut on every pick. Stopping propagation
  // right here is immune to that.
  pop.onclick = e => e.stopPropagation();
  pop.innerHTML = `
    <div class="dash-date-tabs">
      <button class="dash-date-tab ${dashMode === 'single' ? 'on' : ''}" data-mode="single">Single month</button>
      <button class="dash-date-tab ${dashMode === 'range' ? 'on' : ''}" data-mode="range">Range</button>
    </div>
    <div id="dash-date-body"></div>`;
  [...pop.querySelectorAll('.dash-date-tab')].forEach(b => b.onclick = () => {
    dashMode = b.dataset.mode;
    if (dashMode === 'single') dashFromIdx = dashToIdx; // collapse to the "to" month when switching modes
    buildDashDatePopover();
  });
  renderDashDatePopoverBody();
}
function closeDashDatePopover() {
  const pop = document.getElementById('dash-date-popover');
  if (pop) pop.hidden = true;
}
function toggleDashDatePopover() {
  const pop = document.getElementById('dash-date-popover');
  if (!pop) return;
  if (pop.hidden) { buildDashDatePopover(); pop.hidden = false; } else { closeDashDatePopover(); }
}
document.addEventListener('click', e => {
  const pop = document.getElementById('dash-date-popover');
  const btn = document.getElementById('dash-date-btn');
  if (pop && !pop.hidden && !pop.contains(e.target) && !(btn && btn.contains(e.target))) {
    closeDashDatePopover();
  }
});

// ---------------- basin stats (shared by side panel + full dashboard) ----------------
// `month` defaults to the global time slider's position (used by the map-view side panel);
// the Dashboard passes its own independent date-range "to" month instead.
function basinStats(filter, month = currentMonth()) {
  const layerSets = LAYERS.map(l => asOf(l.data, month).filter(s => !filter || normBasin(s.basin) === filter));
  const total = layerSets.reduce((a, s) => a + s.length, 0);
  const counts = {};
  LAYERS.forEach((l, i) => {
    const tally = {};
    layerSets[i].forEach(s => { tally[s._reading.category] = (tally[s._reading.category] || 0) + 1; });
    counts[l.id] = tally;
  });
  return { total, perLayer: Object.fromEntries(LAYERS.map((l, i) => [l.id, layerSets[i].length])), counts };
}
function statCard(label, val, sub, color) {
  return `<div class="stat-card"${color ? ` style="border-left:3px solid ${color}"` : ''}>
    <div class="stat-label">${label}</div>
    <div class="stat-val"${color ? ` style="color:${color}"` : ''}>${val}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
  </div>`;
}
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
function basinCounts(filter, month = currentMonth()) {
  return BASINS.map(b => ({
    label: b,
    value: LAYERS.reduce((a, l) => a + asOf(l.data, month).filter(s => normBasin(s.basin) === b && (!filter || normBasin(s.basin) === filter)).length, 0),
    color: BASIN_COLOR[b] || '#94a3b8'
  })).sort((a, b) => b.value - a.value);
}
// per-month reading counts (actual readings that month, not the slider's lookback) — shows
// when each programme's monitoring actually ran, as a small bar chart. Restricted to
// [fromMonth, toMonth] when given (the Dashboard's own date-range filter); defaults to the
// full axis, which is what the map-view side panel still wants.
function monthlyActivity(layer, filter, fromMonth = ALL_MONTHS[0], toMonth = ALL_MONTHS[ALL_MONTHS.length - 1]) {
  const months = ALL_MONTHS.filter(m => m >= fromMonth && m <= toMonth);
  const counts = Object.fromEntries(months.map(m => [m, 0]));
  layer.data.filter(s => !filter || normBasin(s.basin) === filter).forEach(s => {
    s.readings.forEach(rd => { if (counts[rd.month] !== undefined) counts[rd.month]++; });
  });
  return months.map(m => ({ month: m, label: monthLabel(m), value: counts[m] }));
}
// smooth filled area/line trend chart (Dashboard only) — inline SVG, stretches to its
// container via preserveAspectRatio="none" so it sits in a plain CSS-height div
let _chartUid = 0;
function areaTrendChart(items, color) {
  _chartUid++;
  const W = 640, H = 170, padL = 40, padR = 10, padT = 12, padB = 22;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = items.length;
  const maxV = Math.max(1, ...items.map(i => i.value));
  const niceMax = Math.max(5, Math.ceil(maxV * 1.15 / 5) * 5);
  const xAt = i => padL + (n <= 1 ? innerW / 2 : i / (n - 1) * innerW);
  const yAt = v => padT + innerH - (v / niceMax) * innerH;
  const pts = items.map((it, i) => [xAt(i), yAt(it.value)]);

  // simple smoothing: quadratic-bezier through each point's midpoint to its neighbour
  let line = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    line += ` Q ${x0},${y0} ${(x0 + x1) / 2},${(y0 + y1) / 2}`;
  }
  line += ` L ${pts[pts.length - 1][0]},${pts[pts.length - 1][1]}`;
  const area = `${line} L ${pts[pts.length - 1][0]},${padT + innerH} L ${pts[0][0]},${padT + innerH} Z`;

  const yTicks = 4;
  const grid = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = niceMax * i / yTicks, yy = yAt(v);
    return `<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" stroke="#94a3b8" stroke-opacity="0.12"/>
            <text x="${padL - 6}" y="${yy + 3}" font-size="9" fill="#94a3b8" text-anchor="end">${Math.round(v)}</text>`;
  }).join('');

  const labelStep = Math.max(1, Math.round(n / 9));
  const xLabels = items.map((it, i) => i % labelStep === 0
    ? `<text x="${xAt(i)}" y="${H - 6}" font-size="8" fill="#94a3b8" text-anchor="middle">${it.label}</text>` : '').join('');

  const markerStep = n <= 28 ? 1 : Math.ceil(n / 28);
  const markers = pts.map((p, i) => i % markerStep === 0
    ? `<circle cx="${p[0]}" cy="${p[1]}" r="2.4" fill="${color}" stroke="#0a0f1a" stroke-width="1.2"/>` : '').join('');

  const gid = `trend-grad-${_chartUid}`;
  return `<div class="trend-chart-wrap"><svg viewBox="0 0 ${W} ${H}" class="trend-svg" preserveAspectRatio="none">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#${gid})" stroke="none"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    ${markers}
    ${xLabels}
  </svg></div>`;
}

// ---- per-site trend row shown in the attribute table (bottom drawer) for the selected point ----
function siteSeries(site, key) {
  return site.readings.filter(rd => rd[key] != null).map(rd => ({ label: monthLabel(rd.month), value: rd[key] }));
}
function siteTrendPanel(site, layer) {
  const metrics = layer.id === 'pollution'
    ? [['nitrate', 'Nitrate-N (mg/L)', '#22d3ee'], ['phosphate', 'Phosphate-P (mg/L)', '#a78bfa'], ['turbidity', 'Turbidity (NTU)', '#f59e0b']]
    : [['pH', 'pH', '#22d3ee'], ['DO', 'Dissolved oxygen (mg/L)', '#818cf8']];
  const cards = metrics.map(([key, label, color]) => {
    const series = siteSeries(site, key);
    const body = series.length
      ? areaTrendChart(series, color)
      : `<div style="padding:24px 0;text-align:center;color:#64748b;font-size:11px">No readings for this parameter</div>`;
    return `<div class="mini-trend-card"><div class="mini-trend-title">${label}</div>${body}</div>`;
  }).join('');
  return `<div class="site-trend-wrap">
    <div class="site-trend-head">Trend over time — ${site.name} <span style="color:#64748b;font-weight:500">(${site.n} reading${site.n === 1 ? '' : 's'}, ${site.first} → ${site.last})</span></div>
    <div class="mini-trend-grid">${cards}</div>
  </div>`;
}

// donut with external leader-line percentage labels, like the reference design — SVG arcs so
// label geometry can be computed directly from each segment's angle
function donutLabeled(segments, { size = 210, centerSub = 'sites' } = {}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const nonzero = segments.filter(s => s.value > 0);
  const cx = size / 2, cy = size / 2;
  const rOuter = size / 2 - 38, rInner = rOuter * 0.6;
  const toRad = deg => (deg - 90) * Math.PI / 180;
  const polar = (r, deg) => { const rad = toRad(deg); return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]; };

  let acc = 0;
  const arcs = [], labels = [];
  nonzero.forEach(seg => {
    const startDeg = total ? acc / total * 360 : 0;
    acc += seg.value;
    const endDeg = total ? acc / total * 360 : 360;
    const large = (endDeg - startDeg) > 180 ? 1 : 0;
    const [ox1, oy1] = polar(rOuter, endDeg), [ox2, oy2] = polar(rOuter, startDeg);
    const [ix1, iy1] = polar(rInner, endDeg), [ix2, iy2] = polar(rInner, startDeg);
    arcs.push(`<path d="M ${ox1} ${oy1} A ${rOuter} ${rOuter} 0 ${large} 0 ${ox2} ${oy2} L ${ix2} ${iy2} A ${rInner} ${rInner} 0 ${large} 1 ${ix1} ${iy1} Z" fill="${seg.color}"/>`);

    const midDeg = (startDeg + endDeg) / 2;
    const pct = total ? (seg.value / total * 100) : 0;
    if (pct >= 2) {
      const [ex, ey] = polar(rOuter + 2, midDeg);
      const [lx, ly] = polar(rOuter + 20, midDeg);
      const onRight = Math.cos(toRad(midDeg)) >= 0;
      labels.push(`
        <line x1="${ex}" y1="${ey}" x2="${lx}" y2="${ly}" stroke="${seg.color}" stroke-width="1.2"/>
        <circle cx="${lx}" cy="${ly}" r="2" fill="${seg.color}"/>
        <text x="${lx + (onRight ? 6 : -6)}" y="${ly + 3.5}" font-size="10.5" font-weight="600" fill="#e2e8f0" text-anchor="${onRight ? 'start' : 'end'}">${seg.label}: ${pct.toFixed(0)}%</text>`);
    }
  });

  return `<div class="donut-labeled">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="donut-labeled-svg">
      ${arcs.join('')}
      ${labels.join('')}
      <text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="22" font-weight="800" fill="#fff">${total}</text>
      <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="10" fill="#64748b">${centerSub}</text>
    </svg>
    <div class="donut-labeled-legend">${nonzero.map(s => `<span class="dl-leg-item"><span class="dl-leg-dot" style="background:${s.color}"></span>${s.label} <b>${s.value}</b></span>`).join('')}</div>
  </div>`;
}
function precisionCounts(filter, month = currentMonth()) {
  const sites = asOf(layerById('pollution').data, month).filter(s => !filter || normBasin(s.basin) === filter);
  let instrument = 0, band = 0;
  sites.forEach(s => { if (s.precision === 'band') band++; else instrument++; });
  return [{ label: 'Instrument', value: instrument, color: '#22d3ee' }, { label: 'Band (semi-quantitative)', value: band, color: '#a78bfa' }];
}
function worstSites(layer, filter, month = currentMonth(), n = 6) {
  const worstKey = layer.id === 'pollution' ? 'severe' : 'stressed';
  return asOf(layer.data, month).filter(s => !filter || normBasin(s.basin) === filter)
    .filter(s => s._reading.category === worstKey)
    .sort((a, b) => b.n - a.n).slice(0, n);
}
function worstList(sites, layer) {
  if (!sites.length) return '<div style="font-size:12px;color:#64748b;padding:8px 0">None at the current month — nothing in the worst category.</div>';
  return sites.map(s => `<div class="worst-row" data-layer="${layer.id}" data-id="${s.id}">
    <span class="worst-dot" style="background:${layer.colorFor(s)}"></span>
    <span class="worst-name">${s.name}</span>
    <span class="worst-basin">${normBasin(s.basin)}</span>
  </div>`).join('');
}

// ---------------- side panel: basin analytics ----------------
function renderAnalyticsPanel() {
  document.getElementById('side-panel-title').textContent = 'Basin Analytics';
  document.getElementById('side-panel-sub').textContent = (basinFilter || 'All basins') + ' · as of ' + monthLabel(currentMonth());
  const st = basinStats(basinFilter);
  const pollSegs = Object.entries(st.counts.pollution || {}).map(([k, v]) => ({ label: layerById('pollution').cat[k].label, value: v, color: layerById('pollution').cat[k].c }));
  const healthSegs = Object.entries(st.counts.health || {}).map(([k, v]) => ({ label: layerById('health').cat[k].label, value: v, color: layerById('health').cat[k].c }));
  const pollActivity = monthlyActivity(layerById('pollution'), basinFilter);
  const healthActivity = monthlyActivity(layerById('health'), basinFilter);
  document.getElementById('side-panel-body').innerHTML = `
    <div class="stat-grid stat-grid-3">
      ${statCard('Sites shown', st.total, null, '#22d3ee')}
      ${statCard('Pollution', st.perLayer.pollution, null, '#22d3ee')}
      ${statCard('Health', st.perLayer.health, null, '#818cf8')}
    </div>
    <div class="side-section">
      <div class="side-section-title">Nutrient Pollution — category</div>
      ${donutLabeled(pollSegs, { size: 180 })}
      <div class="side-section-sub">Monitoring activity</div>
      ${areaTrendChart(pollActivity, '#22d3ee')}
    </div>
    <div class="side-section">
      <div class="side-section-title">River Health — category</div>
      ${donutLabeled(healthSegs, { size: 180 })}
      <div class="side-section-sub">Monitoring activity</div>
      ${areaTrendChart(healthActivity, '#818cf8')}
    </div>
    <div><button class="subbar-btn" id="analytics-expand" style="width:100%;justify-content:center"><span class="msym" style="font-size:16px">open_in_full</span><span>Full dashboard</span></button></div>
    <div class="hud-foot">Covers ${BASINS.length} basins · snapshot as of ${monthLabel(currentMonth())}, drag the time slider to change it.</div>`;
  document.getElementById('analytics-expand').onclick = () => showView('dash');
}

function renderDash() {
  const toM = dashToMonth(), fromM = dashFromMonth();
  const st = basinStats(basinFilter, toM);
  const pollSegs = Object.entries(st.counts.pollution || {}).map(([k, v]) => ({ label: layerById('pollution').cat[k].label, value: v, color: layerById('pollution').cat[k].c }));
  const healthSegs = Object.entries(st.counts.health || {}).map(([k, v]) => ({ label: layerById('health').cat[k].label, value: v, color: layerById('health').cat[k].c }));
  const basinBars = basinCounts(basinFilter, toM).map(b => ({ ...b, label: b.label.length > 18 ? b.label.slice(0, 16) + '…' : b.label }));
  const precSegs = precisionCounts(basinFilter, toM);
  const pollActivity = monthlyActivity(layerById('pollution'), basinFilter, fromM, toM);
  const healthActivity = monthlyActivity(layerById('health'), basinFilter, fromM, toM);
  const worstPoll = worstSites(layerById('pollution'), basinFilter, toM);
  const worstHealth = worstSites(layerById('health'), basinFilter, toM);
  const rangeLabel = fromM === toM ? monthLabel(toM) : `${monthLabel(fromM)} – ${monthLabel(toM)}`;
  document.getElementById('dash-wrap').innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
      <div><div class="dash-h1">Basin Analytics — ${basinFilter || 'All basins'}</div><div class="dash-p">Snapshot as of ${monthLabel(toM)}, range ${rangeLabel}. Demonstration prototype built from WRUA and citizen-science monitoring records shared with KeNAWRUA.</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <div class="chipbar"><span class="msym" style="font-size:16px;color:#06b6d4">travel_explore</span><select id="dash-basin-select"></select></div>
        <div class="chipbar" id="dash-date-btn" style="position:relative;cursor:pointer">
          <span class="msym" style="font-size:16px;color:#06b6d4">calendar_month</span>
          <span id="dash-date-label">${dashDateLabel()}</span>
          <div class="dash-date-popover" id="dash-date-popover" hidden></div>
        </div>
        ${dashFilterActive() ? `<button class="chip-clear-btn" id="dash-date-clear" title="Clear all filters"><span class="msym" style="font-size:15px">filter_alt_off</span>Clear</button>` : ''}
      </div>
    </div>
    <div class="dash-stat-grid">
      ${statCard('Total sites shown', st.total, null, '#22d3ee')}
      ${statCard('Pollution sites', st.perLayer.pollution, 'nitrate / phosphate / turbidity', '#22d3ee')}
      ${statCard('Health sites', st.perLayer.health, 'pH / dissolved oxygen', '#818cf8')}
      ${statCard('Severe pollution', (st.counts.pollution || {}).severe || 0, null, '#ef4444')}
      ${statCard('Stressed health', (st.counts.health || {}).stressed || 0, null, '#ef4444')}
    </div>
    <div class="dash-row-2">
      <div class="dash-card">
        <div class="dash-card-title">Nutrient Pollution — category</div>
        ${donutLabeled(pollSegs)}
      </div>
      <div class="dash-card">
        <div class="dash-card-title">River Health — category</div>
        ${donutLabeled(healthSegs)}
      </div>
    </div>
    <div class="dash-row-2">
      <div class="dash-card">
        <div class="dash-card-title">Nutrient Pollution — monitoring activity</div>
        <div class="dash-card-sub">Readings recorded each month · ${rangeLabel}</div>
        ${areaTrendChart(pollActivity, '#22d3ee')}
      </div>
      <div class="dash-card">
        <div class="dash-card-title">River Health — monitoring activity</div>
        <div class="dash-card-sub">Readings recorded each month · ${rangeLabel}</div>
        ${areaTrendChart(healthActivity, '#818cf8')}
      </div>
    </div>
    <div class="dash-row-2-1">
      <div class="dash-col-stack">
        <div class="dash-card">
          <div class="dash-card-title">Worst — Nutrient Pollution <span class="dash-card-badge" style="background:${POLL_SEVERE_C}22;color:${POLL_SEVERE_C}">Severe</span></div>
          ${worstList(worstPoll, layerById('pollution'))}
        </div>
        <div class="dash-card">
          <div class="dash-card-title">Worst — River Health <span class="dash-card-badge" style="background:${HEALTH_STRESSED_C}22;color:${HEALTH_STRESSED_C}">Stressed</span></div>
          ${worstList(worstHealth, layerById('health'))}
        </div>
      </div>
      <div class="dash-col-stack">
        <div class="dash-card">
          <div class="dash-card-title">Nutrient Pollution — reading precision</div>
          ${donutLabeled(precSegs, { centerSub: 'sites' })}
        </div>
        <div class="dash-card">
          <div class="dash-card-title">Sites by basin</div>
          <div class="bar-list">${hBarChart(basinBars)}</div>
        </div>
      </div>
    </div>
    <div style="font-size:11px;color:#64748b;border-top:1px solid #1e293b;padding-top:12px">Coverage caveat: this demonstration holds a sample of KeNAWRUA's monitoring points, not a full national census. Grey "no data" markers mean the parameter was never recorded there — never read as "good."</div>`;
  const dashSel = document.getElementById('dash-basin-select');
  dashSel.innerHTML = '<option value="">All basins</option>' + BASINS.map(b => `<option value="${b}">${b}</option>`).join('');
  dashSel.value = basinFilter;
  dashSel.onchange = () => { basinFilter = dashSel.value; basinSelect.value = basinFilter; refresh(); renderDash(); };
  document.getElementById('dash-date-btn').onclick = e => {
    if (e.target.closest('.dash-date-popover')) return; // clicks inside the dialog shouldn't re-toggle it
    toggleDashDatePopover();
  };
  const dashDateClear = document.getElementById('dash-date-clear');
  if (dashDateClear) dashDateClear.onclick = e => { e.stopPropagation(); clearDashFilters(); };
  [...document.querySelectorAll('.worst-row')].forEach(row => row.onclick = () => {
    showView('map'); openSidePanel(activeSidePanel || 'layers');
    selectSite(row.dataset.layer, row.dataset.id);
  });
}
const POLL_SEVERE_C = '#ef4444', HEALTH_STRESSED_C = '#ef4444';

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
  const colspan = layer.columns.length + 1;
  document.getElementById('tbody').innerHTML = pageRows.map(s => {
    const sel = s.id === selectedId && selectedLayerId === activeTableLayer;
    const row = `<tr class="${sel ? 'sel' : ''}" data-id="${s.id}">
    <td class="action-cell"><button class="row-zoom-btn" title="Zoom to feature"><span class="msym" style="font-size:15px">center_focus_strong</span></button></td>
    ${layer.columns.map(([k]) => `<td>${layer.cell(s, k)}</td>`).join('')}</tr>`;
    // selecting a point shows its own history right under its row — "the trend over time" for
    // that site, rather than only the single current-month snapshot the rest of the row shows
    const trendRow = sel ? `<tr class="site-trend-row"><td colspan="${colspan}">${siteTrendPanel(s, layer)}</td></tr>` : '';
    return row + trendRow;
  }).join('')
    || `<tr><td colspan="${colspan}" style="text-align:center;color:#64748b;padding:18px">No rows match the current filters.</td></tr>`;
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
    if (e.propertyName === 'width' || e.propertyName === 'height') syncMapSize();
  });
});

function showView(v) {
  document.getElementById('view-map').hidden = v !== 'map';
  document.getElementById('view-dash').hidden = v !== 'dash';
  document.getElementById('nav-map').classList.toggle('on', v === 'map');
  document.getElementById('nav-dash').classList.toggle('on', v === 'dash');
  if (v === 'dash') renderDash(); else setTimeout(syncMapSize, 50);
}
function refresh() {
  buildLegend(); drawMarkers();
  if (tableOpen || headBuiltFor) renderTableBody();
  if (activeSidePanel === 'layers') renderLayersPanel();
  if (activeSidePanel === 'analytics') renderAnalyticsPanel();
  if (!document.getElementById('view-dash').hidden) renderDash();
  // keep the detail panel's values in step with the slider, even when its site has no popup open
  if (detailShown && document.getElementById('detail-panel').classList.contains('open')) {
    updateDetailPanel(detailShown.layerId, detailShown.id);
  }
}

refresh();
openTable(LAYERS[0].id);
updateLabelVisibility();
window.addEventListener('resize', syncMapSize);
setTimeout(syncMapSize, 80);
setTimeout(syncMapSize, 400); // second pass — covers fonts/webfont swap still reflowing after the first
