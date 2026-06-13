# Final Architecture Decision

This document defines the target production architecture for the app.

## Decision Summary

The final architecture is:

- local-first personal atlas on device
- private cloud restore snapshots for signed-in users
- shared map delivered as tile JSON through CloudFront
- live player presence delivered separately from shared discovery tiles
- DynamoDB kept for write truth and operational simplicity
- packed per-tile truth as the current durable storage model

This is the correct architecture for speed, cost, and scale.

It is explicitly **not**:

- rebuilding the shared viewport from DynamoDB on every read forever
- downloading one giant world JSON file for all shared discovery
- making the phone the source of truth for shared data

## Why not one full JSON file?

A single aggregated JSON file for the shared world looks simple, but it fails once the map becomes large.

Problems:

1. The file only grows.
2. Every client downloads far more data than it needs.
3. A small change in one city invalidates the whole world file.
4. You lose spatial locality and CDN efficiency.
5. It becomes hard to keep "recent enough" without constantly regenerating and redownloading large payloads.

A giant JSON file is acceptable for a toy prototype. It is not the right production read model.

## Why not upload only one personal JSON blob forever?

Uploading a full personal atlas blob on app open/close is better than making the user rebuild from DynamoDB every time, but it still is not the full answer by itself.

It is good for:

- personal backup
- new-device restore
- low-cost snapshot storage

It is not enough alone for:

- conflict-safe multi-device merges
- granular shared-map derivation
- efficient partial updates over time

So the correct model is:

- device-local profile is the runtime store
- cloud snapshot is the restore/checkpoint artifact
- write truth remains structured until packed atlas storage replaces it

## Personal Atlas Architecture

### Runtime

The personal map should always render from local storage first.

Current and final behavior:

- the device stores the player's profile JSON locally
- reveals, trail points, discovered cells, and summary stats are read locally
- app startup does not depend on backend availability

### Cloud restore

For signed-in users:

- a private cloud snapshot exists as a restore/checkpoint mechanism
- startup can use local data immediately
- cloud restore is used when needed, especially on a new device or a stale local cache

### Long-term storage direction

The current implementation now stores personal truth as one DynamoDB item per packed tile rather than one item per discovered cell.

That is the right current core.

The long-term endpoint after this is:

1. keep private S3 snapshots for restore and backup
2. derive shared read tiles from packed truth
3. move hot aggregation pressure out of synchronous writes when concurrency becomes large enough

## Shared Map Architecture

### Read path

The shared map should be tile-based.

Correct read model:

- shared discovery cells and approved landmarks are stored as tile JSON snapshots
- CloudFront serves those tiles cheaply
- the client downloads only visible tiles
- the client caches loaded shared tiles locally for fast revisit and restart behavior

This keeps reads:

- geographically local
- CDN-cacheable
- cheap to repeat
- fast on mobile

### Presence path

Live players should not be bundled into tile snapshots.

Correct presence model:

- live presence remains short-lived DynamoDB truth
- AppSync/Lambda returns presence only
- player markers disappear quickly when the app closes

This preserves the real-time factor without making the entire shared map a hot query path.

### Write path

The current write model is:

- discovery sync writes personal truth
- discovery sync updates shared truth
- affected shared tiles are queued for asynchronous rebuild

This is a good transitional production model.

## Cost Model

The architecture is cost-effective because it separates write truth from read delivery.

### Cheap reads

- repeated shared map reads hit CloudFront and local cache
- repeated personal restores hit local cache first and S3 snapshot second
- only live presence remains a hot backend read path

### Controlled writes

- writes happen only when the user actually discovers new cells or updates presence
- expensive shared reconstruction is not done per viewport request
- tile rebuilds happen only for affected tiles, and now off the synchronous write path

### Why this is better than pure DynamoDB viewport reads

Without tile snapshots, every shared viewport request turns into repeated Lambda + DynamoDB assembly.

That is the wrong cost shape.

With tile snapshots:

- write once
- read many times cheaply

That is the right production cost shape.

## Scale Model

### Good enough now

This architecture is suitable for a practical app with roughly `10,000` users.

Why:

- local-first personal map removes heavy startup dependency on backend
- CloudFront shared tile delivery absorbs repeated read traffic
- live presence is small compared with map-cell delivery
- DynamoDB on-demand handles bursty writes safely at this stage

### Current limit

The current limit is not the shared read path anymore.

The current limit is the write truth shape:

- one DynamoDB item per personal packed tile
- one DynamoDB item per shared packed tile

That is a major improvement over per-cell truth, but it still leaves hot-tile contention and synchronous merge work in the write path.

### Next scale step

The next step, when discovery history becomes very large, is:

1. move packed tile truth out of the synchronous write path
2. preserve CloudFront tile delivery for shared reads
3. preserve separate presence delivery for real-time markers

That is the real long-term production endpoint.

## Operational Decision

The system should be run as:

- Personal atlas:
  - local-first
  - cloud snapshot for restore
- Shared atlas:
  - CloudFront tile delivery
  - local on-device shared cache
- Live presence:
  - AppSync/Lambda backed by DynamoDB TTL records

## What is already implemented

The repo already contains most of this direction:

- local personal profile storage
- private bootstrap snapshot cache
- shared tile snapshots
- CloudFront distribution for shared tiles
- direct shared tile client reader
- separate live presence query
- persisted client shared-map cache

The practical next action was simply to turn on the shared tile CDN domain in app config so the cheaper read path is actually used.

## Final Conclusion

The final architecture is not "one huge shared JSON".

The final architecture is:

- personal map local-first
- private restore snapshots for users
- shared map as CDN-delivered spatial tiles
- live presence as a separate real-time layer
- DynamoDB as transitional write truth
- packed atlas storage as the long-term storage evolution

That is the best balance of:

- speed
- cost
- scalability
- operational simplicity
- product quality
