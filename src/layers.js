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

// Each layer: id, label, group, data, marker radius fn, popup fn, table columns + row mapper.
export const LAYERS = [
  {
    id: 'cs', group: 'Telemetry', label: 'Citizen-science pollution sites', sub: 'Mara & Nairobi River · nitrate / phosphate / turbidity',
    swatch: '#22d3ee', data: csSites, kindLabel: 'Pollution site',
    radius: s => 6 + Math.min(4, Math.round((s.n || 1) / 20)),
    popup: s => `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px"><span style="width:9px;height:9px;border-radius:50%;background:${colorFor(s, 'quality')}"></span><b style="font-size:14px">${s.name}</b></div>
      <div style="color:#94a3b8;font-size:11px;margin-bottom:6px">${s.dataset}</div>
      <table style="font-size:11.5px;width:100%">
        ${row('Basin', s.basin)}${row('River', s.river)}${row('Samples', s.n)}
        ${row('Pollution index', fmt(s.index, 0) + ' / 100')}
        ${row('Nitrate-N (median)', fmt(s.N, 2) + ' mg/L')}${row('Phosphate-P (median)', fmt(s.P, 3) + ' mg/L')}${row('Turbidity (median)', fmt(s.T, 0) + ' NTU')}
        ${row('First → last', (s.first || '–') + ' → ' + (s.last || '–'))}
      </table>`,
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
    popup: s => `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px"><span style="width:9px;height:9px;border-radius:50%;background:${colorFor(s, 'quality')}"></span><b style="font-size:14px">${s.name}</b></div>
      <div style="color:#94a3b8;font-size:11px;margin-bottom:6px">WRUA monitoring${s.flag ? ' · ⚠ ' + s.flag : ''}</div>
      <table style="font-size:11.5px;width:100%">
        ${row('Basin', s.basin)}${row('Samples', s.n)}
        ${row('Median DO', fmt(s.DO) + ' mg/L')}${row('DO below 5 mg/L', pct(s.lowDO))}
        ${row('Median pH', fmt(s.pH))}${row('Median turbidity', s.T == null ? '–' : fmt(s.T, 0) + ' NTU (n=' + (s.nT || 0) + ')')}
        ${row('First → last', (s.first || '–') + ' → ' + (s.last || '–'))}
      </table>`,
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
