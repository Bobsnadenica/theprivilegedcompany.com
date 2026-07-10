# Bulgarian Open Data Portal reference

## Environments

- Production: `https://data.egov.bg`
- Test portal: `https://testdata.egov.bg`
- Catalog: `{base}/data`
- Dataset: `{base}/data/view/{dataset_identifier}`
- Resource page: `{base}/data/resourceView/{resource_uuid}`
- Resource download: `{base}/resource/download/{resource_uuid}/{csv|json|xml}`
- API root: `{base}/api`
- Complete dataset catalog: `POST {base}/api/listDatasets`
- Organisations: `POST {base}/api/listOrganisations`
- Dataset resources: `POST {base}/api/listResources`

The official API specification documents a limit of 60 requests per minute per API key or IP address. Public list requests work without an API key. Use at most 100 records per page; larger values may fall back to the portal default.

The portal may respond slowly or return transient 5xx errors. Use bounded retries with backoff and retain the failing URL in diagnostics.

## Theme IDs

| ID | Bulgarian theme | English shorthand |
|---:|---|---|
| 1 | Селско стопанство, риболов и аква култури, горско стопанство, храни | Agriculture |
| 2 | Образование, култура и спорт | Education & culture |
| 3 | Околна среда | Environment |
| 4 | Енергетика | Energy |
| 5 | Транспорт | Transport |
| 6 | Наука и технологии | Science & technology |
| 7 | Икономика и финанси | Economy & finance |
| 8 | Население и социални условия | Population & society |
| 9 | Правителство, публичен сектор | Government |
| 10 | Здравеопазване | Health |
| 11 | Региони, градове | Regions & cities |
| 12 | Правосъдие, правна система, обществена безопасност | Justice & safety |
| 13 | Международни въпроси | International affairs |
| 14 | Некатегоризирани | Uncategorized |

## Verification levels

1. **Catalog verified** — all pages captured; API total equals the number of unique dataset identifiers; all 14 themes reconcile to the same total. Legacy records may use non-UUID URI values and must be URL-encoded.
2. **Metadata verified** — dataset, organisation, and resource relations are internally valid and source URLs are retained.
3. **Resource verified** — the original file was downloaded and its size, hash, encoding, structure, nulls, duplicates, and date range were checked.
4. **Visualization verified** — calculations, labels, units, time range, and chart claims were checked against the verified resource.

Do not describe level 1 or 2 as proof of the numerical values inside a resource.

## Provenance checklist

Record the portal base URL, dataset identifier, resource UUID, resource format, dataset title, publisher, license, retrieval time in UTC, original download URL, byte size, content hash when durability matters, and any parsing or encoding decisions.
