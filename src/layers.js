// Layer definitions: each layer owns its data, its marker styling, and its own
// attribute-table column set.
//
// Two thematic layers, each independently scored and independently time-sliced:
//   - "pollution" (Mara + NBO_River citizen-science sites): nitrate / phosphate / turbidity
//   - "health" (WRUA basin monitoring points): pH / dissolved oxygen
// Both carry a real per-month reading history (not a single aggregate), which is what makes
// the time slider possible — colour and radius are computed "as of" whatever month is selected,
// not fixed at build time.
import pollutionSites from './data/pollution-sites.json';
import healthSites from './data/health-sites.json';
import timeMeta from './data/time-meta.json';
import rivers from './data/rivers.json';
import basins from './data/basins.json';
import basinExtents from './data/basin-extents.json';
import basemap from './data/basemap.json';

export const BASINS = basins;
export const RIVERS = rivers;
export const BASEMAP = basemap;
export const BASIN_EXTENTS = basinExtents;
export const TIME_META = timeMeta;
export const BASIN_COLOR = {
  'Rift Valley': '#a78bfa', 'Lake Victoria South': '#34d399', Tana: '#60a5fa',
  Athi: '#fb923c', "Ewaso Ng'iro North": '#f472b6'
};
// Source basin names are full administrative labels ("Lake Victoria South Basin Area",
// "Ath Basin Area", "Ewaso Nyiro North Basin Area"...) — normalize to the short names the
// basin-outline reference layer and BASIN_COLOR already use.
const BASIN_ALIAS = {
  'Lake Victoria South Basin Area': 'Lake Victoria South',
  'Tana Basin Area': 'Tana', 'Tana River Basin': 'Tana',
  'Rift Valley Basin Area': 'Rift Valley',
  'Ewaso Nyiro North Basin Area': "Ewaso Ng'iro North",
  'Ath Basin Area': 'Athi', 'Athi Basin Area': 'Athi'
};
export function normBasin(b) { return BASIN_ALIAS[b] || b; }

const fmt = (v, d = 1) => (v == null ? '–' : (+v).toFixed(d));

// ---- fixed, band-aligned classification scales (never quantile-based: the breakpoints are
// the real band edges in the source data, so a reading is never ambiguously on a boundary) ----
export const POLLUTION_CAT = {
  good: { c: '#10b981', label: 'Good' },
  elevated: { c: '#eab308', label: 'Elevated' },
  poor: { c: '#f59e0b', label: 'Poor' },
  severe: { c: '#ef4444', label: 'Severe' },
  nodata: { c: '#64748b', label: 'No data' }
};
export const HEALTH_CAT = {
  healthy: { c: '#10b981', label: 'Healthy' },
  stressed: { c: '#ef4444', label: 'Stressed' },
  nodata: { c: '#64748b', label: 'No data' }
};

// -------- time-slicing: pick each site's most-recent reading at-or-before `month` --------
// A site with no reading yet by `month` is dropped (it hadn't started being monitored) rather
// than shown as a potentially-misleading grey point before monitoring began.
export function asOf(sites, month) {
  return sites.map(s => {
    let r = null;
    for (const rd of s.readings) { if (rd.month <= month) r = rd; else break; }
    return r ? { ...s, _reading: r } : null;
  }).filter(Boolean);
}

function monthRange(months) {
  const [y0, m0] = months[0].split('-').map(Number);
  const [y1, m1] = months[months.length - 1].split('-').map(Number);
  const out = [];
  let y = y0, m = m0;
  while (y < y1 || (y === y1 && m <= m1)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
// one continuous monthly axis spanning both layers, so a single slider drives both
export const ALL_MONTHS = monthRange(
  [...timeMeta.pollution.months, ...timeMeta.health.months].sort()
);

function popupHeader(s, layerId, color) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px">
      <div style="display:flex;align-items:center;gap:6px;min-width:0"><span style="width:9px;height:9px;border-radius:50%;background:${color};flex:none"></span><b style="font-size:14px">${s.name}</b></div>
      <button class="msym" onclick="window.hlOpenDetail && window.hlOpenDetail('${layerId}','${s.id}')" title="Open details panel" style="flex:none;width:22px;height:22px;border-radius:6px;background:#1e293b;border:none;color:#94a3b8;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">open_in_full</button>
    </div>`;
}
function popupBody(s, layerId, color, subtitle, rows) {
  const shown = rows.slice(0, 4), hidden = rows.length - shown.length;
  return `${popupHeader(s, layerId, color)}
    <div style="color:#94a3b8;font-size:11px;margin-bottom:6px">${subtitle}</div>
    <table style="font-size:11.5px;width:100%">${shown.map(([l, v]) => row(l, v)).join('')}</table>
    ${hidden > 0 ? `<div style="font-size:10.5px;color:#64748b;margin-top:7px;text-align:center">+${hidden} more attribute${hidden > 1 ? 's' : ''} — tap <span class="msym" style="font-size:12px;vertical-align:-2px">open_in_full</span> to see all</div>` : ''}`;
}
function detailBody(subtitle, rows) {
  return `
    <div class="detail-sub">${subtitle}</div>
    <div class="detail-rows">
      ${rows.map(([l, v]) => `<div class="detail-row"><div class="detail-row-label">${l}</div><div class="detail-row-val">${v}</div></div>`).join('')}
    </div>`;
}

export const LAYERS = [
  {
    id: 'pollution', group: 'Telemetry', label: 'Nutrient Pollution', sub: 'Mara & Nairobi River · nitrate / phosphate / turbidity',
    swatch: '#22d3ee', data: pollutionSites, kindLabel: 'Pollution site', cat: POLLUTION_CAT,
    colorFor: s => POLLUTION_CAT[s._reading.category].c,
    radius: s => 5 + Math.min(5, Math.round(Math.log2((s.n || 1) + 1) * 1.6)),
    dashed: s => s.precision === 'band',
    rows: s => [
      ['Basin', normBasin(s.basin)], ['WRUA', s.wrua || '–'], ['Month', s._reading.month],
      ['Nitrate-N', fmt(s._reading.nitrate, 2) + ' mg/L'], ['Phosphate-P', fmt(s._reading.phosphate, 3) + ' mg/L'],
      ['Turbidity', fmt(s._reading.turbidity, 0) + ' NTU'], ['Category', POLLUTION_CAT[s._reading.category].label],
      ['Reading type', s.precision === 'band' ? 'Semi-quantitative band' : 'Instrument'],
      ['Samples total', s.n], ['First → last', s.first + ' → ' + s.last]
    ],
    popup: s => popupBody(s, 'pollution', POLLUTION_CAT[s._reading.category].c, s.tab, LAYERS[0].rows(s)),
    detail: s => detailBody(s.tab, LAYERS[0].rows(s)),
    columns: [
      ['id', 'ID'], ['name', 'Site'], ['basin', 'Basin'], ['wrua', 'WRUA'], ['n', 'Samples'],
      ['category', 'Category'], ['nitrate', 'Nitrate'], ['phosphate', 'Phosphate'], ['turbidity', 'Turbidity'], ['last', 'Last month']
    ],
    cell: (s, k) => {
      if (k === 'basin') return normBasin(s.basin);
      if (k === 'category') return catBadge(POLLUTION_CAT, s._reading.category);
      if (k === 'nitrate') return fmt(s._reading.nitrate, 2);
      if (k === 'phosphate') return fmt(s._reading.phosphate, 3);
      if (k === 'turbidity') return fmt(s._reading.turbidity, 0);
      return s[k] ?? '–';
    }
  },
  {
    id: 'health', group: 'Telemetry', label: 'River Health', sub: 'WRUA monitoring stations · pH / dissolved oxygen',
    swatch: '#818cf8', data: healthSites, kindLabel: 'WRUA station', cat: HEALTH_CAT,
    colorFor: s => HEALTH_CAT[s._reading.category].c,
    radius: s => 5 + Math.min(5, Math.round(Math.log2((s.n || 1) + 1) * 1.6)),
    dashed: () => false,
    rows: s => [
      ['Basin', normBasin(s.basin)], ['WRUA', s.wrua || '–'], ['Month', s._reading.month],
      ['pH', fmt(s._reading.pH, 1)], ['Dissolved oxygen', fmt(s._reading.DO, 1) + ' mg/L'],
      ['Temperature', fmt(s._reading.temp, 0) + ' °C'], ['Category', HEALTH_CAT[s._reading.category].label],
      ['Samples total', s.n], ['First → last', s.first + ' → ' + s.last],
      ...(s.basin && s.basin.toLowerCase().includes('tana') && s.tab === 'NBO_River'
        ? [['Basin note', 'Inferred by nearest station — not confirmed']] : [])
    ],
    popup: s => popupBody(s, 'health', HEALTH_CAT[s._reading.category].c, s.tab, LAYERS[1].rows(s)),
    detail: s => detailBody(s.tab, LAYERS[1].rows(s)),
    columns: [
      ['id', 'ID'], ['name', 'WRUA site'], ['basin', 'Basin'], ['wrua', 'WRUA'], ['n', 'Samples'],
      ['category', 'Category'], ['pH', 'pH'], ['DO', 'DO mg/L'], ['last', 'Last month']
    ],
    cell: (s, k) => {
      if (k === 'basin') return normBasin(s.basin);
      if (k === 'category') return catBadge(HEALTH_CAT, s._reading.category);
      if (k === 'pH') return fmt(s._reading.pH, 1);
      if (k === 'DO') return fmt(s._reading.DO, 1);
      return s[k] ?? '–';
    }
  }
];

function row(label, val) { return `<tr><td style="color:#94a3b8;padding:1.5px 0">${label}</td><td style="text-align:right;font-weight:600">${val}</td></tr>`; }
function catBadge(scale, key) { const c = scale[key].c; return `<span class="badge" style="background:${c}22;color:${c}">${scale[key].label}</span>`; }

export function layerById(id) { return LAYERS.find(l => l.id === id); }
