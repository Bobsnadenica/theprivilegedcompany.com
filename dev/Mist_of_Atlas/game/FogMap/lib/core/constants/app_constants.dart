class AppConstants {
  static const String appName = 'Mist of Atlas';

  static const String userAgentPackageName = 'com.example.world_of_fog';

  static const String tileUrlTemplate =
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  static const double initialZoom = 16.0;
  static const double citySearchZoom = 12.5;
  static const double minZoom = 2.0;
  static const double maxZoom = 18.0;

  static const double discoveryRadiusMeters = 8.0;
  static const double minDistanceBetweenRevealsMeters = 8.0;
  static const double statsCellDegrees = 0.00018;
  static const double averageStepLengthMeters = 0.78;

  static const double maxAcceptedAccuracyMeters = 12.0;
  static const double maxInitialFixAccuracyMeters = 15.0;
  static const double maxPreviewAccuracyMeters = 35.0;
  static const double minAcceptedMovementMeters = 6.0;
  static const double stationaryJitterMeters = 4.0;
  static const double maxAcceptedSpeedMetersPerSecond = 12.0;
  static const double maxReasonableJumpMeters = 60.0;
  static const double discoverySmoothingMinBlend = 0.35;
  static const double discoverySmoothingMaxBlend = 0.82;
  static const double revealPathPointSpacingMeters = 3.0;
  static const int maxAcceptedLocationAgeSeconds = 15;
  static const int maxDistanceCarryForwardGapSeconds = 180;
  static const int maxRevealBridgeGapSeconds = 45;
  static const double maxRevealBridgeDistanceMeters = 250.0;
  static const int initialFixSampleCount = 2;
  static const int initialFixStabilizationWindowSeconds = 12;
  static const double initialFixMaxClusterSpreadMeters = 10.0;
  static const int initialFixBootstrapAttempts = 4;
  static const int initialFixBootstrapDelaySeconds = 2;
  static const int locationStreamDistanceFilterMeters = 3;
  static const int locationStreamIntervalSeconds = 3;
  static const int cloudSyncDebounceSeconds = 6;
  static const int sharedViewportRefreshSeconds = 15;
  static const int sharedPresenceHeartbeatSeconds = 12;
  static const int sharedPresenceStationaryHeartbeatSeconds = 60;
  static const int sharedPresenceStationarySeconds = 90;
  static const int sharedPresenceCacheSeconds = 10;
  static const int sharedViewportDebounceMilliseconds = 650;
  static const int sharedViewportCacheMaxEntries = 24;
  static const int sharedRegionSyncMapZoom = 17;
  static const int sharedTilesPerRegionSide = 4;
  static const int sharedRegionStarterRadiusMeters = 20000;
  static const double sharedRegionOutlineMinZoom = 9.0;
  static const int sharedRegionManifestCacheTtlSeconds = 30;
  static const int sharedManifestFetchBatchSize = 4;
  static const int sharedTileFetchBatchSize = 8;
  static const int sharedRegionDoubleTapWindowMs = 360;
  static const int sharedRegionAutoSyncCooldownSeconds = 12;
  static const int sharedMaxVisibleRegionOutlines = 48;
  static const int sharedVisibleTileHardLimit = 150;
  static const int sharedViewportPersistedCacheMaxAgeHours = 24 * 90;
  static const int sharedViewportPersistedCellLimit = 30000;
  static const int sharedViewportPersistedLandmarkLimit = 2000;
  static const int sharedViewportPersistedTileVersionLimit = 12000;
  static const int sharedViewportPersistedRegionLimit = 2400;
  static const int cloudSyncBatchSize = 200;
  static const int personalBootstrapRefreshHours = 12;

  static const double defaultLat = 20.0;
  static const double defaultLon = 0.0;

  static const String profileFileName = 'player_profile.json';

  /// Fixed taxonomy for user-submitted landmarks. Keep stable — the moderator
  /// queue groups by these strings and changing them invalidates older entries.
  static const List<LandmarkCategory> landmarkCategories = <LandmarkCategory>[
    LandmarkCategory(id: 'landmark', label: 'Landmark'),
    LandmarkCategory(id: 'monument', label: 'Monument'),
    LandmarkCategory(id: 'viewpoint', label: 'Viewpoint'),
    LandmarkCategory(id: 'nature', label: 'Nature'),
    LandmarkCategory(id: 'architecture', label: 'Architecture'),
    LandmarkCategory(id: 'food', label: 'Food & drink'),
    LandmarkCategory(id: 'history', label: 'History'),
    LandmarkCategory(id: 'other', label: 'Other'),
  ];

  static const String defaultLandmarkCategoryId = 'landmark';

  /// Cache window for presigned landmark image URLs. We re-fetch only after
  /// this many seconds, well within the typical S3 presign expiry, so a
  /// moderator opening 50 cards no longer triggers 50 AppSync calls.
  static const int landmarkUrlCacheSeconds = 5 * 60;
}

class LandmarkCategory {
  const LandmarkCategory({required this.id, required this.label});

  final String id;
  final String label;

  static LandmarkCategory byIdOrDefault(String id) {
    final normalized = id.trim().toLowerCase();
    for (final category in AppConstants.landmarkCategories) {
      if (category.id == normalized) return category;
    }
    return AppConstants.landmarkCategories.firstWhere(
      (category) => category.id == AppConstants.defaultLandmarkCategoryId,
    );
  }
}
