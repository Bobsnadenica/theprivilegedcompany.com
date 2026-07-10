---
name: bulgaria-open-data
description: Discover, inventory, and download public Bulgarian datasets from the national Open Data Portal, including testdata.egov.bg and data.egov.bg. Use when Codex needs Bulgarian government open-data catalog counts, dataset metadata, resource IDs, CSV/JSON/XML downloads, reproducible source manifests, or themed extracts for transport, finance, environment, population, government, health, regions, education, agriculture, energy, science, justice, or international affairs.
---

# Bulgaria Open Data

Use the bundled API client for deterministic portal discovery and downloads. Keep source URLs, retrieval times, portal environment, and license notes with every extract.

## Workflow

1. Read [references/portal.md](references/portal.md) for category IDs and portal caveats.
2. Create a complete, normalized metadata snapshot through the official public API:

   ```bash
   python3 scripts/bulgaria_open_data.py snapshot \
     --base https://testdata.egov.bg \
     --output-dir data/catalog
   ```

   This writes separate summary, category, dataset, organisation, and resource files. It paginates all published Bulgarian records and stays below the documented limit of 60 API requests per minute.

3. Inspect a dataset's resources:

   ```bash
   python3 scripts/bulgaria_open_data.py resources DATASET_IDENTIFIER \
     --base https://testdata.egov.bg
   ```

4. Download a resource in a published format:

   ```bash
   python3 scripts/bulgaria_open_data.py download RESOURCE_UUID \
     --format csv \
     --output resource.csv \
     --base https://testdata.egov.bg
   ```

5. Validate the file before analysis: check HTTP success, non-empty size, delimiter or JSON/XML parsing, headers, row count, encoding, date range, and obvious duplicate or null patterns.
6. Cite the dataset page and resource download URL. Label test-portal data as test-portal data; do not present it as the production portal without verification.

## Guardrails

- Prefer `https://data.egov.bg` for production work when it is reachable and current; use `https://testdata.egov.bg` when explicitly requested or when reproducing a test-portal extract.
- Prefer the documented `POST /api/listDatasets`, `listOrganisations`, and `listResources` endpoints over HTML scraping.
- Treat catalog metadata as evidence about the catalog, not evidence for the values inside a resource.
- A complete metadata snapshot is not equivalent to validating every resource's tabular contents. Download and validate each resource used for a new chart.
- Retry transient 5xx and timeout failures, but do not silently substitute another dataset.
- Preserve Bulgarian text as UTF-8 and record any decoding fallback.
- Keep raw downloads immutable. Write transformed extracts to a separate output path.
- When a portal resource endpoint fails, return the exact reproducible URL and report the failure instead of fabricating rows.
