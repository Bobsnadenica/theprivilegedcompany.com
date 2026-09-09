# Bulgaria explorer data

Reviewed snapshot: 2026-09-10. Runtime uses these bundled files and does not scrape
the catalogue or request map tiles.

- `bulgaria-catalogue.json`: 250 places covering 252 entries in the [Bulgarian Tourist Union's official 100 National Tourist Sites programme](https://www.btsbg.org/node/338). The programme includes numbered sub-sites. Repeated listings of Plovdiv's Roman Stadium and Biserna Cave are stored as aliases on the canonical place, retaining both source IDs, numbers and URLs. The public interface counts canonical places.
- `bulgaria-ids.js`: lightweight accepted-ID set for validating private visits without loading the full catalogue. Keep it synchronized when reviewing a new catalogue version; existing IDs must not be reassigned.
- `bulgaria-geography.json`: [Natural Earth](https://www.naturalearthdata.com/) 1:10m geography: 28 Bulgarian administrative regions, neighbouring countries, rivers and city points. Shapes are clipped to the regional extent, simplified to 0.003 degrees and rounded for a small regional display. Natural Earth is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). This is an explorer map, not a cadastral or navigation map.

Catalogue names, membership and official numbers come from BTS; English names and
short descriptions were written for this explorer. No photographs or copied long
articles are bundled. Each place links to its source.

Coordinates were reviewed against named places and their locality. Most use mapped
[OpenStreetMap](https://www.openstreetmap.org/copyright) features, with the exact
node/way/relation linked in `coordinateSource`. Some use coordinates or map areas
on the official BTS listing. Belene uses [Wikidata's CC0 record](https://www.wikidata.org/wiki/Q815391);
the Lyubenova Mahala church uses the [temple register](https://www.hramove.bg/hramove/temple_635.html).
`coordinateMethod` distinguishes these sources. Official map centres with known
wrong locations were replaced, including Buynovo Gorge, Cherni Vrah, Kom Peak,
Kyustendil's museum, Karanovo Mound and Etropole's clock tower. Markers identify
sites/areas; they are not verified entrances, parking points or walking routes.

The coordinate database derived from OpenStreetMap is made available under the
[Open Database Licence (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/), with
attribution to OpenStreetMap contributors. Natural Earth retains its public-domain
status; Wikidata facts retain CC0 status. Map attribution is visible in the UI.
Library licence notices are included in `portal/MAP-LICENSES.txt`.

## Updating the snapshot

`scripts/prepare-bulgaria-data.py` collects BTS entries to an external review
directory. It requires build-time Python packages `beautifulsoup4` and `shapely`.
It caches source downloads, limits concurrency, and never overwrites the reviewed
catalogue. With `--geography` it rebuilds the geography from Natural Earth's GeoJSON.
Review labels and coordinates after regeneration; source sites can contain mistakes.

Review all new/changed source entries and coordinate matches before updating the
checked-in JSON. Preserve stable IDs and aliases, original descriptions, coordinate
provenance and prior private visits. Recheck category and region filters as well as
totals. Bump the snapshot metadata, update the accepted-ID set, run portal tests and
rebuild the portal. Vite generates new asset URLs; CacheStorage then replaces the
previous public snapshot. No private check-in dates belong in these files.
