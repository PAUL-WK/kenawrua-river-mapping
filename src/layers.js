// Layer definitions: each layer owns its data, its marker styling, and its own
// attribute-table column set — this is what keeps a WRUA station (pH/DO) from
// being squashed into the same columns as a citizen-science site (N/P/turbidity).
import csSites from './data/cs-sites.json';
import wruaSites from './data/wrua-sites.json';
import rivers from './data/rivers.json';
import basins from './data/basins.json';
import basinExtents from './data/basin-extents.json';
import basemap from './data/basemap.json';

export const BASINS = basins;
export const RIVERS = rivers;
export const BASEMAP = basemap;
export const BASIN_EXTENTS = basinExtents;
export const BASIN_COLOR = {
  'Rift Valley': '#a78bfa', 'Lake Victoria South': '#34d399', Tana: '#60a5fa',
  Athi: '#fb923c', "Ewaso Ng'iro North": '#f472b6'
};

const fmt = (v, d = 1) => (v == null ? '–' : (+v).toFixed(d));
const pct = v => (v == null ? '–' : Math.round(v * 100) + '%');

// quality (good/warn/critical/nodata) and status (active/stale/nodata) color scales
export const Q = { good: { c: '#10b981', label: 'Good' }, warn: { c: '#f59e0b', label: 'Stressed' }, critical: { c: '#ef4444', label: 'Critical' }, nodata: { c: '#64748b', label: 'No data' } };
export const ST = { active: { c: '#10b981', label: 'Active (< 18 mo)' }, stale: { c: '#f59e0b', label: 'Inactive (> 18 mo)' }, nodata: { c: '#64748b', label: 'No data' } };

export function colorFor(site, mode) {
  return mode === 'quality' ? Q[site.quality].c : ST[site.status].c;
}

// Shared popup header (name + colour dot + "expand to detail panel" button).
function popupHeader(s, layerId) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px">
      <div style="display:flex;align-items:center;gap:6px;min-width:0"><span style="width:9px;height:9px;border-radius:50%;background:${colorFor(s, 'quality')};flex:none"></span><b style="font-size:14px">${s.name}</b></div>
      <button class="msym" onclick="window.hlOpenDetail && window.hlOpenDetail('${layerId}','${s.id}')" title="Open details panel" style="flex:none;width:22px;height:22px;border-radius:6px;background:#1e293b;border:none;color:#94a3b8;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">open_in_full</button>
    </div>`;
}
// Popup body: capped at 4 attributes so the popup stays small — the rest live behind the
// expand button in the detail panel. `rows` is the FULL ordered [label, value] list.
function popupBody(s, layerId, subtitle, rows) {
  const shown = rows.slice(0, 4), hidden = rows.length - shown.length;
  return `${popupHeader(s, layerId)}
    <div style="color:#94a3b8;font-size:11px;margin-bottom:6px">${subtitle}</div>
    <table style="font-size:11.5px;width:100%">${shown.map(([l, v]) => row(l, v)).join('')}</table>
    ${hidden > 0 ? `<div style="font-size:10.5px;color:#64748b;margin-top:7px;text-align:center">+${hidden} more attribute${hidden > 1 ? 's' : ''} — tap <span class="msym" style="font-size:12px;vertical-align:-2px">open_in_full</span> to see all</div>` : ''}`;
}
// Detail-panel body: the FULL row list as a feature-properties-style inspector — label left,
// value right, one hairline-separated line per attribute, rather than a cramped table.
function detailBody(subtitle, rows) {
  return `
    <div class="detail-sub">${subtitle}</div>
    <div class="detail-rows">
      ${rows.map(([l, v]) => `<div class="detail-row"><div class="detail-row-label">${l}</div><div class="detail-row-val">${v}</div></div>`).join('')}
    </div>`;
}

// Each layer: id, label, group, data, marker radius fn, popup/detail fns, table columns + row mapper.
export const LAYERS = [
  {
    id: 'cs', group: 'Telemetry', label: 'Citizen-science pollution sites', sub: 'Mara & Nairobi River · nitrate / phosphate / turbidity',
    swatch: '#22d3ee', data: csSites, kindLabel: 'Pollution site',
    radius: s => 6 + Math.min(4, Math.round((s.n || 1) / 20)),
    rows: s => [
      ['Basin', s.basin], ['River', s.river], ['Samples', s.n], ['Pollution index', fmt(s.index, 0) + ' / 100'],
      ['Nitrate-N (median)', fmt(s.N, 2) + ' mg/L'], ['Phosphate-P (median)', fmt(s.P, 3) + ' mg/L'], ['Turbidity (median)', fmt(s.T, 0) + ' NTU'],
      ['First → last', (s.first || '–') + ' → ' + (s.last || '–')]
    ],
    popup: s => popupBody(s, 'cs', s.dataset, LAYERS[0].rows(s)),
    detail: s => detailBody(s.dataset, LAYERS[0].rows(s)),
    columns: [
      ['id', 'ID'], ['name', 'Site'], ['river', 'River'], ['basin', 'Basin'], ['n', 'Samples'],
      ['index', 'Index'], ['N', 'Nitrate'], ['P', 'Phosphate'], ['T', 'Turbidity'], ['status', 'Status'], ['last', 'Last sample']
    ],
    cell: (s, k) => {
      if (k === 'index') return Math.round(s.index ?? 0);
      if (k === 'N') return fmt(s.N, 2);
      if (k === 'P') return fmt(s.P, 3);
      if (k === 'T') return fmt(s.T, 0);
      if (k === 'status') return statusBadge(s.status);
      return s[k] ?? '–';
    }
  },
  {
    id: 'wrua', group: 'Telemetry', label: 'WRUA monitoring stations', sub: 'General river health · pH / dissolved oxygen',
    swatch: '#818cf8', data: wruaSites, kindLabel: 'WRUA station',
    radius: () => 5,
    rows: s => [
      ['Basin', s.basin], ['Samples', s.n], ['Median DO', fmt(s.DO) + ' mg/L'], ['DO below 5 mg/L', pct(s.lowDO)],
      ['Median pH', fmt(s.pH)], ['Median turbidity', s.T == null ? '–' : fmt(s.T, 0) + ' NTU (n=' + (s.nT || 0) + ')'],
      ['First → last', (s.first || '–') + ' → ' + (s.last || '–')]
    ],
    popup: s => popupBody(s, 'wrua', 'WRUA monitoring' + (s.flag ? ' · ⚠ ' + s.flag : ''), LAYERS[1].rows(s)),
    detail: s => detailBody('WRUA monitoring' + (s.flag ? ' · ⚠ ' + s.flag : ''), LAYERS[1].rows(s)),
    columns: [
      ['id', 'ID'], ['name', 'WRUA'], ['basin', 'Basin'], ['n', 'Samples'],
      ['pH', 'pH'], ['DO', 'DO mg/L'], ['lowDO', 'DO<5'], ['status', 'Status'], ['last', 'Last sample']
    ],
    cell: (s, k) => {
      if (k === 'pH') return fmt(s.pH);
      if (k === 'DO') return fmt(s.DO);
      if (k === 'lowDO') return pct(s.lowDO);
      if (k === 'status') return statusBadge(s.status);
      return s[k] ?? '–';
    }
  }
];

function row(label, val) { return `<tr><td style="color:#94a3b8;padding:1.5px 0">${label}</td><td style="text-align:right;font-weight:600">${val}</td></tr>`; }
function statusBadge(status) { const c = ST[status].c; return `<span class="badge" style="background:${c}22;color:${c}">${status}</span>`; }

export function allSites() { return LAYERS.flatMap(l => l.data.map(s => ({ ...s, _layer: l.id }))); }
export function layerById(id) { return LAYERS.find(l => l.id === id); }
