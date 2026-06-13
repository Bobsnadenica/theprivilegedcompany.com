# Production Roadmap

This project is moving from a good prototype into a durable travel product.

The target is not just "shared fog on a map". The target is a real personal atlas product with:

- durable local ownership of travel history
- repair tools for GPS drift and missing segments
- fast shared-map reads at scale
- low-cost storage/read patterns
- optional social/shared overlays rather than backend dependency for the core atlas

The reference product direction is captured well by Fog of World's published feature set:

- track editing
- snapshot backups and restore
- multiple databases
- import of existing tracks
- efficient vector rendering
- local-first privacy model

## Phase 1: Split expensive shared reads

Goal:

- move shared cells/landmarks off AppSync/Lambda viewport reconstruction
- keep AppSync for live presence and mutations

Implementation:

1. shared tile snapshots remain the source of shared cell/landmark read data
2. a CDN serves shared tile JSON cheaply
3. the app fetches shared tiles directly
4. AppSync returns live player presence only

This is the first production-grade scale step because it cuts hot shared-map costs without changing write truth.

## Phase 2: Durable personal atlas snapshots

Goal:

- restore not only discovered cells, but the player's atlas history
- preserve expeditions, reveal paths, and future edit history

Implementation:

1. per-user atlas snapshots stored privately
2. local-first rendering remains primary
3. cloud snapshots become restore/sync safety net, not the primary runtime database

## Phase 3: Track editor

Goal:

- correct GPS drift
- erase bad points
- fill tunnels and missing segments
- rebuild atlas state deterministically after edits

This is the biggest product gap versus mature travel-atlas apps.

## Phase 4: Multiple atlases and track layers

Goal:

- separate personal map databases by purpose
- optional overlay layers
- clean snapshot merge/restore workflows

## Phase 5: Packed atlas storage

Goal:

- stop storing discovery truth as one DynamoDB item per cell forever

Status:

- implemented as the current core write model

Implementation:

1. compact personal discoveries into per-user/per-tile packed data
2. derive shared read tiles from packed truth
3. keep S3/CDN as the primary read model

This is the correct durable core for the project at its current stage.

## Phase 6: Dirty-Tile Aggregation Pipeline

Goal:

- move packed tile merge/rebuild pressure out of synchronous request handling

Implemented foundation:

1. synchronous write handlers now enqueue dirty shared tiles
2. an SQS-backed worker rebuilds shared tile JSON asynchronously
3. CloudFront-facing tile objects keep a short edge cache while S3 snapshots remain long-lived

Next implementation direction:

1. add queue depth/age monitoring when operations matter
2. tune worker concurrency for hotspot regions if active usage grows
3. consider DynamoDB Streams or EventBridge if tile fan-out logic becomes more complex

That is the next backend step after packed atlas storage.
