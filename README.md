# HydroLens Kenya — KeNAWRUA mapping prototype

A demonstration water-quality GIS prototype built from the WRUA and citizen-science
monitoring data shared by Enock Ole Kiminta (CEO, KeNAWRUA). Personal project,
built outside Ramani — see `/docs` for the data review this was built from.

## Run it in WebStorm

1. **Open the project**: `File → Open...` and select this `kenawrua-river-mapping` folder.
2. WebStorm detects `package.json` automatically. Open the built-in terminal
   (`Alt+F12` / `⌥F12`) and run:
   ```bash
   npm install
   npm run dev
   ```
3. Vite starts a dev server (usually `http://localhost:5173`) and opens it in your
   browser automatically. Edits to any file under `src/` hot-reload instantly.
4. To produce a static build you can host anywhere: `npm run build` → output in `dist/`.

No database, Docker, or API key is needed to run this locally — all data ships as
static JSON files under `src/data/`.

## Project layout

```
index.html              entry page
src/main.js              app shell, map, layer panel, attribute tables, dashboard
src/layers.js             layer definitions — each layer owns its own data + table columns
src/styles/app.css         all styling (dark GIS theme, mobile responsive)
src/data/
  cs-sites.json            32 citizen-science pollution sites (Mara + Nairobi River)
  wrua-sites.json          44 WRUA monitoring stations (pH / dissolved oxygen)
  rivers.json               13 rivers ranked by pollution index
  basins.json                list of the 5 basins represented in the data
  basin-extents.json         approximate basin outlines, derived from site locations
                              (NOT official WRA basin boundaries — see data review)
  basemap.json                Kenya country/river/lake outlines (Natural Earth, public domain)
```

## What's real vs. placeholder

- **Real**: all 76 monitoring sites, their coordinates (corrected per the data
  review — see `/docs/data-review.md`), their pollution index / DO / pH values,
  and the river pollution ranking.
- **Placeholder**: basin outlines are a shape computed from where the known
  sites sit, not the official WRA basin boundaries. Swap `basin-extents.json`
  for real boundaries once KeNAWRUA/WRA can provide them.
- **Not yet built**: a backend (PostGIS) that lets this update from new field
  submissions automatically. Right now, updating the data means replacing the
  JSON files in `src/data/` and rebuilding. See "Next steps" below.

## Next steps toward a production version

1. Get the national WRUA registry (names + locations for all 756, even without
   readings) — turns "sites we have data for" into an honest national coverage map.
2. Move `src/data/*.json` into a PostGIS database, served through a small API,
   so field submissions (e.g. via the existing Survey123 forms) update the map
   without a rebuild.
3. Get official WRA basin and sub-basin boundary polygons to replace the
   derived outlines in `basin-extents.json`.
4. Add a county field/boundary layer — not present in the source data yet.
