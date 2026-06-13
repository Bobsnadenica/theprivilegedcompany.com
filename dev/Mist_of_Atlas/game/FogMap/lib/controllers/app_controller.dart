import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show AppLifecycleState;
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../cloud/auth/cognito_auth_service.dart';
import '../cloud/auth/sign_in_flow.dart';
import '../cloud/backend_config.dart';
import '../cloud/map_mode.dart';
import '../cloud/models/landmark_models.dart';
import '../cloud/models/shared_viewport_models.dart';
import '../cloud/services/appsync_service.dart';
import '../cloud/services/landmark_upload_service.dart';
import '../cloud/services/shared_tile_service.dart';
import '../core/constants/app_constants.dart';
import '../core/constants/profile_icon_catalog.dart';
import '../core/utils/discovery_math.dart';
import '../core/utils/journey_insights.dart';
import '../data/models/achievement.dart';
import '../data/models/cloud_discovery_cell.dart';
import '../data/models/player_profile.dart';
import '../data/models/reveal_point.dart';
import '../services/local_profile_store.dart';
import '../services/location_service.dart';
import '../services/share_service.dart';
import '../services/shared_map_cache_store.dart';

class AppController extends ChangeNotifier {
  AppController({
    required this.localProfileStore,
    required this.locationService,
    required this.shareService,
    required this.sharedMapCacheStore,
    required this.authService,
    required this.appsyncService,
    required this.landmarkUploadService,
    required this.sharedTileService,
  });

  final LocalProfileStore localProfileStore;
  final LocationService locationService;
  final ShareService shareService;
  final SharedMapCacheStore sharedMapCacheStore;
  final CognitoAuthService authService;
  final AppSyncService appsyncService;
  final LandmarkUploadService landmarkUploadService;
  final SharedTileService sharedTileService;

  final MapController mapController = MapController();
  final Distance _distance = const Distance();
  final List<_AcceptedLocation> _initialFixSamples = [];

  late PlayerProfile _profile;
  StreamSubscription<Position>? _positionSub;
  Timer? _cloudSyncTimer;
  Timer? _profilePersistTimer;
  Timer? _sharedCachePersistTimer;
  Timer? _sharedViewportDebounceTimer;
  Timer? _sharedViewportPollTimer;
  Timer? _sharedPresenceHeartbeatTimer;
  DateTime? _lastAcceptedFixAt;
  double? _lastAcceptedAccuracyMeters;
  LatLng? _lastDiscoveryLatLng;
  DateTime? _lastPresenceSyncAt;
  String _activeProfileKey = LocalProfileStore.guestProfileKey;

  final Map<String, CloudDiscoveryCell> _pendingCloudCells = {};
  final Map<String, _SharedViewportCacheEntry> _sharedViewportCache = {};
  final Map<String, SharedCell> _sharedCellStore = {};
  final Map<String, SharedLandmark> _sharedLandmarkStore = {};
  final Map<String, String> _sharedTileVersionStore = {};
  final Map<String, _SharedTileMembershipEntry> _sharedTileMembershipIndex = {};
  final Set<String> _sharedSyncedRegionIds = <String>{};
  final Set<String> _sharedSyncingRegionIds = <String>{};
  String _sharedStoreGeneratedAt = '';

  // Memoised derived state — invalidated by `_profile.updatedAtIso` so that
  // every UI read isn't paying for a fresh JourneyInsights walk + Achievement
  // rebuild on every notifyListeners.
  String? _cachedDerivedKey;
  JourneyInsights? _cachedJourneyInsights;
  List<Achievement>? _cachedAchievements;

  // Cached presigned landmark image URLs. The backend signs them for ~15 min;
  // we re-issue ahead of expiry so a moderator opening the queue twice in a
  // row stops costing 2× the AppSync calls.
  final Map<String, _LandmarkUrlCacheEntry> _landmarkUrlCache = {};
  final Map<String, _LandmarkUrlCacheEntry> _pendingLandmarkUrlCache = {};

  bool _initialized = false;
  bool _tracking = false;
  bool _busy = false;
  bool _sharedLoading = false;
  bool _cloudSyncInFlight = false;
  String? _error;
  LatLng? _currentLatLng;
  LatLng? _savedMapCenterLatLng;
  MapMode _mapMode = MapMode.personal;
  SharedViewportResponse _sharedViewport = SharedViewportResponse.empty();
  List<PendingLandmark> _pendingLandmarks = const [];
  bool _sharedViewportRequestInFlight = false;
  MapCamera? _queuedSharedViewportCamera;
  String? _activeSharedViewportCacheKey;
  int _sharedSyncCompleted = 0;
  int _sharedSyncTotal = 0;
  DateTime? _sharedSyncStartedAt;
  String? _sharedSyncTargetLabel;
  String? _lastAutoSharedRegionId;
  DateTime? _lastAutoSharedRegionQueuedAt;
  bool _presenceSyncRequested = false;
  bool _appInForeground = true;

  bool get initialized => _initialized;
  bool get tracking => _tracking;
  bool get busy => _busy;
  bool get sharedLoading => _sharedLoading;
  double? get sharedSyncProgress =>
      _sharedSyncTotal > 0 ? _sharedSyncCompleted / _sharedSyncTotal : null;
  String? get sharedSyncLabel {
    if (_sharedSyncTotal <= 0) return null;
    final prefix = _sharedSyncTargetLabel ?? 'Syncing realm';
    final progress = '$_sharedSyncCompleted/$_sharedSyncTotal';
    final eta = _sharedSyncEtaLabel;
    return eta == null ? '$prefix $progress' : '$prefix $progress · $eta';
  }

  String? get error => _error;
  PlayerProfile get profile => _profile;
  LatLng? get currentLatLng => _currentLatLng;
  LatLng get mapCenter =>
      _currentLatLng ??
      _savedMapCenterLatLng ??
      const LatLng(AppConstants.defaultLat, AppConstants.defaultLon);
  MapMode get mapMode => _mapMode;
  SharedViewportResponse get sharedViewport => _sharedViewport;
  List<PendingLandmark> get pendingLandmarks => _pendingLandmarks;
  bool get waitingForAccurateLocation =>
      _tracking && !_busy && _currentLatLng == null;
  double? get currentLocationAccuracyMeters => _lastAcceptedAccuracyMeters;
  bool get hasSeenMapGuide => _profile.hasSeenMapGuide;

  bool get isSignedIn => authService.isSignedIn;
  bool get isAdminOrModerator =>
      authService.currentSession?.isAdminOrModerator ?? false;
  PendingNewPasswordChallenge? get pendingNewPasswordChallenge =>
      authService.pendingNewPasswordChallenge;
  bool get canChangeDisplayName =>
      !isSignedIn || !authService.isDisplayNameLocked;
  bool get canChangeProfileIcon =>
      !isSignedIn || !authService.isProfileIconLocked;
  String? get signedInEmail => authService.currentSession?.email;

  List<RevealPoint> get reveals => _profile.reveals;
  List<List<LatLng>> get revealPathSegments {
    final segments = <List<LatLng>>[];
    var currentSegment = <LatLng>[];
    LatLng? previousPoint;
    DateTime? previousTimestamp;

    for (final reveal in _profile.reveals) {
      final point = LatLng(reveal.latitude, reveal.longitude);
      final timestamp = DateTime.tryParse(reveal.discoveredAtIso)?.toUtc();
      final shouldBridge = previousPoint != null &&
          DiscoveryMath.shouldBridgeReveals(
            start: previousPoint,
            startTimestamp: previousTimestamp,
            end: point,
            endTimestamp: timestamp,
          );

      if (!shouldBridge && currentSegment.isNotEmpty) {
        segments.add(currentSegment);
        currentSegment = <LatLng>[];
      }

      currentSegment.add(point);
      previousPoint = point;
      previousTimestamp = timestamp;
    }

    if (currentSegment.isNotEmpty) {
      segments.add(currentSegment);
    }

    return segments.map(List<LatLng>.unmodifiable).toList(growable: false);
  }

  /// JourneyInsights computed once per `_profile.updatedAtIso`.
  JourneyInsights get journeyInsights {
    _refreshDerivedCacheIfNeeded();
    return _cachedJourneyInsights!;
  }

  /// Achievement list — memoised, recomputed only when the profile changes.
  List<Achievement> get achievements {
    _refreshDerivedCacheIfNeeded();
    return _cachedAchievements!;
  }

  /// Drains the queue of achievements that have been unlocked since the last
  /// time the player was notified. Intended to be called from the AppShell
  /// post-frame so the UI can show a single celebratory toast or banner per
  /// unlock without spamming on every rebuild.
  List<Achievement> consumePendingAchievementUnlocks() {
    final unlocked = achievements.where((a) => a.isUnlocked).toList();
    if (unlocked.isEmpty) return const <Achievement>[];

    final acknowledged = _profile.acknowledgedAchievementIds;
    final newly = unlocked
        .where((a) => !acknowledged.contains(a.id))
        .toList(growable: false);
    if (newly.isEmpty) return const <Achievement>[];

    final nextAcknowledged = <String>{
      ...acknowledged,
      ...newly.map((a) => a.id),
    };
    _profile = _profile.copyWith(
      acknowledgedAchievementIds: nextAcknowledged,
      updatedAtIso: DateTime.now().toUtc().toIso8601String(),
    );
    _scheduleProfilePersist();
    return newly;
  }

  void _refreshDerivedCacheIfNeeded() {
    final key = _profile.updatedAtIso;
    if (_cachedDerivedKey == key && _cachedJourneyInsights != null) {
      return;
    }
    _cachedJourneyInsights = JourneyInsights.fromProfile(_profile);
    _cachedAchievements = AchievementCatalog.build(_profile);
    _cachedDerivedKey = key;
  }

  double get totalKm => _profile.totalDistanceMeters / 1000.0;
  int get estimatedSteps =>
      (_profile.totalDistanceMeters / AppConstants.averageStepLengthMeters)
          .round();
  int get revealCount => _profile.reveals.length;
  int get discoveredCellsCount => _profile.discoveredCells.length;
  double get coveragePercent => DiscoveryMath.coveragePercent(
        discoveredCells: discoveredCellsCount,
        cellDegrees: AppConstants.statsCellDegrees,
      );
  String get adventurerRank {
    if (discoveredCellsCount >= 1000 || totalKm >= 250) return 'Worldbreaker';
    if (discoveredCellsCount >= 250 || totalKm >= 100) return 'Roadwarden';
    if (discoveredCellsCount >= 100 || totalKm >= 50) return 'Cartographer';
    if (discoveredCellsCount >= 25 || totalKm >= 10) return 'Pathfinder';
    if (discoveredCellsCount >= 5 || totalKm >= 1) return 'Scout';
    return 'Initiate';
  }

  List<RevealPoint> get personalFogReveals {
    return _profile.discoveredCells.map((cellId) {
      final center = DiscoveryMath.cellCenterFromId(
        cellId,
        AppConstants.statsCellDegrees,
      );
      return RevealPoint(
        latitude: center.latitude,
        longitude: center.longitude,
        discoveredAtIso: _profile.updatedAtIso,
      );
    }).toList(growable: false);
  }

  List<RevealPoint> get activeFogReveals {
    // The fog overlay derives cells from this list. We MUST include every
    // discoveredCell in the personal map even when local trail reveals exist
    // — otherwise cells restored from the cloud after sign-in (which have no
    // matching local trail) would never be drawn. The previous logic short-
    // circuited to an empty list whenever local reveals existed, hiding the
    // cloud-restored fog.
    final personal = personalFogReveals;
    if (_mapMode != MapMode.shared) {
      return personal;
    }

    final knownCellIds = _profile.discoveredCells;
    return <RevealPoint>[
      ...personal,
      for (final cell in _sharedViewport.cells)
        if (!knownCellIds.contains(cell.cellId))
          RevealPoint(
            latitude: cell.lat,
            longitude: cell.lon,
            discoveredAtIso: cell.lastDiscoveredAt,
          ),
    ];
  }

  List<SharedPlayer> get sharedPlayers {
    final currentUserId = authService.currentUserId;
    if (currentUserId == null) return _sharedViewport.players;
    return _sharedViewport.players
        .where((player) => player.userId != currentUserId)
        .toList();
  }

  List<SharedLandmark> get sharedLandmarks => _sharedViewport.landmarks;
  bool get hasSharedCache =>
      _sharedCellStore.isNotEmpty || _sharedLandmarkStore.isNotEmpty;

  List<SharedRegionOutline> visibleSharedRegionsFor(MapCamera camera) {
    if (camera.zoom < AppConstants.sharedRegionOutlineMinZoom) {
      return const <SharedRegionOutline>[];
    }

    final bounds = camera.visibleBounds;
    final regionIds = DiscoveryMath.sharedRegionIdsForBounds(
      minLat: bounds.southEast.latitude,
      maxLat: bounds.northWest.latitude,
      minLon: bounds.northWest.longitude,
      maxLon: bounds.southEast.longitude,
      mapZoom: AppConstants.sharedRegionSyncMapZoom,
      tilesPerRegion: AppConstants.sharedTilesPerRegionSide,
      maxRegionCount: AppConstants.sharedMaxVisibleRegionOutlines,
    );

    return regionIds
        .map(
          (regionId) => SharedRegionOutline(
            regionId: regionId,
            points: DiscoveryMath.sharedRegionOutlinePoints(
              regionId,
              tilesPerRegion: AppConstants.sharedTilesPerRegionSide,
            ),
            status: _sharedSyncingRegionIds.contains(regionId)
                ? SharedRegionStatus.syncing
                : _sharedSyncedRegionIds.contains(regionId)
                    ? SharedRegionStatus.synced
                    : SharedRegionStatus.available,
          ),
        )
        .toList(growable: false);
  }

  String sharedRegionIdForPoint(LatLng point) {
    return DiscoveryMath.sharedRegionIdForPoint(
      point,
      mapZoom: AppConstants.sharedRegionSyncMapZoom,
      tilesPerRegion: AppConstants.sharedTilesPerRegionSide,
    );
  }

  Future<void> init() async {
    await authService.init();
    await _loadProfileForCurrentSession();

    if (isSignedIn) {
      await _loadPersistedSharedCache();
      await _restorePersonalMapFromCloud(silent: true);
    }

    _initialized = true;
    notifyListeners();
    await startTracking();
  }

  Future<void> startTracking() async {
    if (_tracking || _busy) return;

    _busy = true;
    _error = null;
    notifyListeners();

    try {
      await locationService.ensureReady();
      await _positionSub?.cancel();
      await _bootstrapCurrentLocation();

      _positionSub = locationService.stream().listen(
        _handlePosition,
        onError: (Object err) {
          _error = err.toString();
          _tracking = false;
          notifyListeners();
        },
      );

      _tracking = true;
    } catch (e) {
      _error = e.toString();
      _tracking = false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> stopTracking() async {
    await _positionSub?.cancel();
    _positionSub = null;
    _tracking = false;
    notifyListeners();
  }

  Future<void> signUp({
    required String email,
    required String password,
    required String displayName,
    required String profileIcon,
  }) async {
    await authService.signUp(
      email: email,
      password: password,
      displayName: displayName,
      profileIcon: profileIcon,
    );
  }

  Future<void> confirmSignUp({
    required String email,
    required String code,
  }) async {
    await authService.confirmSignUp(email: email, code: code);
  }

  Future<SignInOutcome> signIn({
    required String email,
    required String password,
  }) async {
    final outcome = await authService.signIn(email: email, password: password);
    if (outcome == SignInOutcome.newPasswordRequired) {
      notifyListeners();
      return outcome;
    }

    await _completeSignedInTransition();
    notifyListeners();
    return outcome;
  }

  Future<void> completeNewPasswordChallenge({
    required String newPassword,
    required String displayName,
    required String profileIcon,
  }) async {
    await authService.completeNewPasswordChallenge(
      newPassword: newPassword,
      displayName: displayName,
      profileIcon: profileIcon,
    );
    await _completeSignedInTransition();
    notifyListeners();
  }

  void cancelPendingSignInChallenge() {
    authService.clearPendingSignInChallenge();
    notifyListeners();
  }

  Future<void> _completeSignedInTransition() async {
    _resetSessionScopedState();
    await _switchToCurrentSessionProfile();
    await _loadPersistedSharedCache();
    await _restorePersonalMapFromCloud(silent: false);
    await _bootstrapCurrentLocation();
    _ensureSharedViewportPolling();
    _ensureSharedPresenceHeartbeat();
  }

  Future<void> signOut() async {
    await authService.signOut();
    _resetSessionScopedState();
    _mapMode = MapMode.personal;
    await _switchToCurrentSessionProfile();
    await _bootstrapCurrentLocation();
    notifyListeners();
  }

  Future<void> setDisplayName(String name) async {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return;
    if (trimmed == _profile.displayName) return;

    if (isSignedIn) {
      final updatedDisplayName = await authService.updateDisplayNameOnce(
        trimmed,
      );

      _profile = _profile.copyWith(
        displayName: updatedDisplayName,
        updatedAtIso: DateTime.now().toUtc().toIso8601String(),
      );

      await localProfileStore.save(_profile, profileKey: _activeProfileKey);
      _requestSharedPresenceSync(immediate: true, force: true);
      notifyListeners();
      return;
    }

    _profile = _profile.copyWith(
      displayName: trimmed,
      updatedAtIso: DateTime.now().toUtc().toIso8601String(),
    );

    await localProfileStore.save(_profile, profileKey: _activeProfileKey);
    notifyListeners();
  }

  Future<void> setProfileIcon(String icon) async {
    final normalized = icon.trim();
    if (!ProfileIconCatalog.isAllowed(normalized)) return;
    if (normalized == _profile.profileIcon) return;

    if (isSignedIn) {
      final updatedProfileIcon = await authService.updateProfileIconOnce(
        normalized,
      );

      _profile = _profile.copyWith(
        profileIcon: updatedProfileIcon,
        updatedAtIso: DateTime.now().toUtc().toIso8601String(),
      );

      await localProfileStore.save(_profile, profileKey: _activeProfileKey);
      _requestSharedPresenceSync(immediate: true, force: true);
      notifyListeners();
      return;
    }

    _profile = _profile.copyWith(
      profileIcon: normalized,
      updatedAtIso: DateTime.now().toUtc().toIso8601String(),
    );

    await localProfileStore.save(_profile, profileKey: _activeProfileKey);
    notifyListeners();
  }

  Future<void> setHeroArchetype(String archetypeId) async {
    final normalized = archetypeId.trim();
    if (normalized.isEmpty || normalized == _profile.heroArchetypeId) return;

    _profile = _profile.copyWith(
      heroArchetypeId: normalized,
      updatedAtIso: DateTime.now().toUtc().toIso8601String(),
    );
    await localProfileStore.save(_profile, profileKey: _activeProfileKey);
    notifyListeners();
  }

  Future<void> setHairColor(String hairColorId) async {
    final normalized = hairColorId.trim();
    if (normalized.isEmpty || normalized == _profile.hairColorId) return;

    _profile = _profile.copyWith(
      hairColorId: normalized,
      updatedAtIso: DateTime.now().toUtc().toIso8601String(),
    );
    await localProfileStore.save(_profile, profileKey: _activeProfileKey);
    notifyListeners();
  }

  Future<void> setGearSlotEquipped(String slotId, bool isEquipped) async {
    final normalized = slotId.trim();
    if (normalized.isEmpty) return;

    final nextVisibility =
        Map<String, bool>.from(_profile.gearVisibilityBySlot);
    if (isEquipped) {
      nextVisibility.remove(normalized);
    } else {
      nextVisibility[normalized] = false;
    }

    final currentVisibility = _profile.gearVisibilityBySlot[normalized] ?? true;
    if (currentVisibility == isEquipped &&
        nextVisibility.length == _profile.gearVisibilityBySlot.length) {
      return;
    }

    _profile = _profile.copyWith(
      gearVisibilityBySlot: nextVisibility,
      updatedAtIso: DateTime.now().toUtc().toIso8601String(),
    );
    await localProfileStore.save(_profile, profileKey: _activeProfileKey);
    notifyListeners();
  }

  Future<void> share() async {
    await shareService.shareProfile(_profile);
  }

  Future<void> markMapGuideSeen() async {
    if (_profile.hasSeenMapGuide) return;

    _profile = _profile.copyWith(
      hasSeenMapGuide: true,
      updatedAtIso: DateTime.now().toUtc().toIso8601String(),
    );
    await localProfileStore.save(_profile, profileKey: _activeProfileKey);
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  void setAppLifecycleState(AppLifecycleState state) {
    final isForeground = state == AppLifecycleState.resumed;
    if (_appInForeground == isForeground) return;

    _appInForeground = isForeground;
    if (!_appInForeground) {
      _stopSharedViewportPolling();
      _stopSharedPresenceHeartbeat();
      // Flush any debounced profile writes before the OS may freeze us.
      _scheduleProfilePersist(immediate: true);
      return;
    }

    _ensureSharedViewportPolling();
    _ensureSharedPresenceHeartbeat();
    _requestSharedPresenceSync(immediate: true, force: true);
  }

  Future<void> setMapMode(MapMode mode, {MapCamera? camera}) async {
    if (mode == MapMode.shared && !isSignedIn) {
      _error = 'Please sign in to use Shared mode.';
      notifyListeners();
      return;
    }

    _mapMode = mode;
    if (_mapMode != MapMode.shared) {
      _stopSharedViewportPolling();
      _stopSharedPresenceHeartbeat();
      _presenceSyncRequested = false;
      _sharedLoading = false;
    } else {
      _ensureSharedViewportPolling();
      _ensureSharedPresenceHeartbeat();
      _requestSharedPresenceSync(immediate: true, force: true);
      if (camera != null) {
        _applyStoredSharedViewportFor(camera);
      }
    }
    notifyListeners();

    if (_mapMode == MapMode.shared && camera != null) {
      await refreshSharedViewport(camera);
      unawaited(_syncStarterSharedArea(camera: camera));
    }
  }

  Future<void> refreshSharedViewport(
    MapCamera camera, {
    bool force = false,
  }) async {
    if (!isSignedIn || _mapMode != MapMode.shared) return;

    if (!sharedTileService.isConfigured) {
      _error = 'Shared realm delivery is not configured.';
      notifyListeners();
      return;
    }

    _ensureSharedViewportPolling();
    final cacheKey = _sharedViewportCacheKeyFor(camera);
    final cachedEntry = _sharedViewportCache[cacheKey];
    final cachedPlayers = _freshCachedSharedPlayersFor(
      camera,
      force: force,
    );
    final storedViewport = _storedSharedViewportFor(camera);
    final hasAppliedCache = cachedEntry != null &&
        _applySharedViewportSnapshot(
          cacheKey: cacheKey,
          viewport: cachedEntry.viewport,
        );
    final hasAppliedStoredViewport = storedViewport != null &&
        _applySharedViewportSnapshot(
          cacheKey: cacheKey,
          viewport: storedViewport,
        );

    if (hasAppliedCache || hasAppliedStoredViewport) {
      notifyListeners();
    }

    final syncedVisibleRegionIds = _visibleSharedRegionIdsForCamera(camera)
        .where(_sharedSyncedRegionIds.contains)
        .toList(growable: false);

    if (_sharedViewportRequestInFlight) {
      _queuedSharedViewportCamera = camera;
      if (hasAppliedCache || hasAppliedStoredViewport) {
        notifyListeners();
      }
      return;
    }

    _sharedViewportRequestInFlight = true;

    try {
      SharedTileFetchResult? tileFetch;
      if (syncedVisibleRegionIds.isNotEmpty) {
        tileFetch = await sharedTileService.getRegions(
          worldId: BackendConfig.defaultWorldId,
          regionIds: syncedVisibleRegionIds,
          knownTileVersions:
              force ? const <String, String>{} : _sharedTileVersionStore,
        );
        if (tileFetch.tileSnapshots.isNotEmpty) {
          _applySharedTileSnapshots(tileFetch.tileSnapshots);
        }
        if (tileFetch.tileVersions.isNotEmpty) {
          _sharedTileVersionStore.addAll(tileFetch.tileVersions);
        }
        _sharedSyncedRegionIds.addAll(tileFetch.regionIds);
      }

      final players = cachedPlayers ?? await _fetchSharedPresence(camera);
      final mergedViewport = _storedSharedViewportFor(camera) ??
          SharedViewportResponse(
            worldId: BackendConfig.defaultWorldId,
            cells: const <SharedCell>[],
            players: const <SharedPlayer>[],
            landmarks: const <SharedLandmark>[],
            generatedAt: _sharedStoreGeneratedAt,
          );

      final viewport = SharedViewportResponse(
        worldId: mergedViewport.worldId,
        cells: mergedViewport.cells,
        players: players,
        landmarks: mergedViewport.landmarks,
        generatedAt: tileFetch?.generatedAt.isNotEmpty == true
            ? tileFetch!.generatedAt
            : mergedViewport.generatedAt,
      ).copyWithMetadata(
        tileVersions: Map<String, String>.from(_sharedTileVersionStore),
      );

      _cacheSharedViewport(
        cacheKey: cacheKey,
        viewport: viewport,
        fetchedAt: DateTime.now().toUtc(),
      );
      _applySharedViewportSnapshot(
        cacheKey: cacheKey,
        viewport: viewport,
      );
    } catch (e) {
      _error = e.toString();
    } finally {
      _sharedViewportRequestInFlight = false;
      notifyListeners();

      final queuedCamera = _queuedSharedViewportCamera;
      _queuedSharedViewportCamera = null;
      if (queuedCamera != null && isSignedIn && _mapMode == MapMode.shared) {
        Future<void>(() => refreshSharedViewport(queuedCamera));
      }
    }
  }

  void scheduleSharedViewportRefresh(MapCamera camera) {
    final appliedStoredViewport = _applyStoredSharedViewportFor(camera);
    if (appliedStoredViewport) {
      notifyListeners();
    }

    if (_freshCachedSharedPlayersFor(camera) != null) {
      return;
    }

    _sharedViewportDebounceTimer?.cancel();
    _sharedViewportDebounceTimer = Timer(
      const Duration(
          milliseconds: AppConstants.sharedViewportDebounceMilliseconds),
      () => refreshSharedViewport(camera),
    );
  }

  Future<void> syncSharedRegionAtPoint(
    LatLng point, {
    MapCamera? camera,
    bool force = false,
  }) async {
    final regionId = sharedRegionIdForPoint(point);
    await _syncSharedRegions(
      <String>[regionId],
      camera: camera ?? mapController.camera,
      force: force,
      targetLabel: 'Syncing selected realm',
    );
  }

  Future<void> _syncStarterSharedArea({MapCamera? camera}) async {
    if (!isSignedIn ||
        _mapMode != MapMode.shared ||
        !sharedTileService.isConfigured) {
      return;
    }

    final anchor = _currentLatLng ?? _savedMapCenterLatLng;
    if (anchor == null) return;

    final bounds = DiscoveryMath.boundsAroundPoint(
      point: anchor,
      radiusMeters: AppConstants.sharedRegionStarterRadiusMeters.toDouble(),
    );
    final regionIds = DiscoveryMath.sharedRegionIdsForBounds(
      minLat: bounds.minLat,
      maxLat: bounds.maxLat,
      minLon: bounds.minLon,
      maxLon: bounds.maxLon,
      mapZoom: AppConstants.sharedRegionSyncMapZoom,
      tilesPerRegion: AppConstants.sharedTilesPerRegionSide,
    )
        .where((regionId) => !_sharedSyncedRegionIds.contains(regionId))
        .toList(growable: false);

    if (regionIds.isEmpty) return;

    await _syncSharedRegions(
      regionIds,
      camera: camera ?? mapController.camera,
      targetLabel: 'Syncing nearby realm',
    );
  }

  Future<void> _syncSharedRegions(
    Iterable<String> regionIds, {
    required MapCamera camera,
    required String targetLabel,
    bool force = false,
  }) async {
    if (!isSignedIn ||
        _mapMode != MapMode.shared ||
        !sharedTileService.isConfigured) {
      return;
    }

    final normalizedRegionIds = regionIds.toSet().toList(growable: false)
      ..sort();
    if (normalizedRegionIds.isEmpty) return;

    final pendingRegionIds = force
        ? normalizedRegionIds
        : normalizedRegionIds
            .where((regionId) => !_sharedSyncingRegionIds.contains(regionId))
            .toList(growable: false);
    if (pendingRegionIds.isEmpty) return;

    _sharedSyncingRegionIds.addAll(pendingRegionIds);
    _sharedLoading = true;
    _sharedSyncTargetLabel = targetLabel;
    _sharedSyncStartedAt = DateTime.now().toUtc();
    _sharedSyncCompleted = 0;
    _sharedSyncTotal = pendingRegionIds.length;
    notifyListeners();

    try {
      final fetched = await sharedTileService.getRegions(
        worldId: BackendConfig.defaultWorldId,
        regionIds: pendingRegionIds,
        knownTileVersions:
            force ? const <String, String>{} : _sharedTileVersionStore,
        onProgress: _setSharedSyncProgress,
      );
      if (fetched.tileSnapshots.isNotEmpty) {
        _applySharedTileSnapshots(fetched.tileSnapshots);
      }
      if (fetched.tileVersions.isNotEmpty) {
        _sharedTileVersionStore.addAll(fetched.tileVersions);
      }
      _sharedSyncedRegionIds.addAll(fetched.regionIds);
      _scheduleSharedCachePersist(worldId: fetched.worldId);

      final players = _freshCachedSharedPlayersFor(camera) ??
          await _fetchSharedPresence(camera);
      final mergedViewport = _storedSharedViewportFor(camera) ??
          SharedViewportResponse(
            worldId: fetched.worldId,
            cells: const <SharedCell>[],
            players: const <SharedPlayer>[],
            landmarks: const <SharedLandmark>[],
            generatedAt: _sharedStoreGeneratedAt,
          );
      final viewport = SharedViewportResponse(
        worldId: mergedViewport.worldId,
        cells: mergedViewport.cells,
        players: players,
        landmarks: mergedViewport.landmarks,
        generatedAt: fetched.generatedAt.isNotEmpty
            ? fetched.generatedAt
            : mergedViewport.generatedAt,
      ).copyWithMetadata(
        tileVersions: Map<String, String>.from(_sharedTileVersionStore),
      );
      final cacheKey = _sharedViewportCacheKeyFor(camera);
      _cacheSharedViewport(
        cacheKey: cacheKey,
        viewport: viewport,
        fetchedAt: DateTime.now().toUtc(),
      );
      _applySharedViewportSnapshot(
        cacheKey: cacheKey,
        viewport: viewport,
      );
    } catch (e) {
      _error = e.toString();
    } finally {
      _sharedSyncingRegionIds.removeAll(pendingRegionIds);
      _sharedLoading = false;
      _sharedSyncTargetLabel = null;
      _sharedSyncStartedAt = null;
      _clearSharedSyncProgress();
      notifyListeners();
    }
  }

  Future<void> uploadLandmark({
    required String title,
    required String description,
    required String category,
    required int mapZoom,
  }) async {
    final current = _currentLatLng;
    if (current == null) {
      throw Exception('Current location is not available yet.');
    }

    final file = await landmarkUploadService.pickFromCamera();
    if (file == null) return;

    await landmarkUploadService.uploadLandmark(
      file: file,
      title: title,
      description: description,
      category: category,
      lat: current.latitude,
      lon: current.longitude,
      mapZoom: mapZoom,
    );
  }

  Future<void> loadPendingLandmarks() async {
    if (!isAdminOrModerator) return;
    _pendingLandmarks = await appsyncService.listPendingLandmarks();
    notifyListeners();
  }

  Future<String> getPendingLandmarkReviewUrl(String landmarkId) async {
    final cached = _pendingLandmarkUrlCache[landmarkId];
    if (cached != null && cached.isFresh()) {
      return cached.url;
    }
    final url = await appsyncService.getPendingLandmarkReviewUrl(landmarkId);
    _pendingLandmarkUrlCache[landmarkId] = _LandmarkUrlCacheEntry(
      url: url,
      fetchedAt: DateTime.now().toUtc(),
    );
    return url;
  }

  Future<void> moderateLandmark({
    required String landmarkId,
    required bool approve,
    String moderationNotes = '',
  }) async {
    await appsyncService.moderateLandmark(
      landmarkId: landmarkId,
      approve: approve,
      moderationNotes: moderationNotes,
    );
    await loadPendingLandmarks();
  }

  Future<String> getLandmarkViewUrl(String landmarkId) async {
    final cached = _landmarkUrlCache[landmarkId];
    if (cached != null && cached.isFresh()) {
      return cached.url;
    }
    final url = await appsyncService.getLandmarkViewUrl(landmarkId);
    _landmarkUrlCache[landmarkId] = _LandmarkUrlCacheEntry(
      url: url,
      fetchedAt: DateTime.now().toUtc(),
    );
    return url;
  }

  Future<void> _restorePersonalMapFromCloud({required bool silent}) async {
    if (_canUseWarmPersonalBootstrapCache(silent: silent)) {
      return;
    }

    try {
      final remoteCells = await appsyncService.getMyDiscoveryBootstrap();
      final remoteCellIds = remoteCells.map((cell) => cell.cellId).toSet();
      await _backfillLocalDiscoveriesToCloud(remoteCellIds);

      final bootstrapTimestamp = DateTime.now().toUtc().toIso8601String();

      if (remoteCells.isEmpty) {
        _profile =
            _profile.copyWith(lastCloudBootstrapAtIso: bootstrapTimestamp);
        await localProfileStore.save(_profile, profileKey: _activeProfileKey);
        return;
      }

      final mergedCells = Set<String>.from(_profile.discoveredCells);

      for (final cell in remoteCells) {
        mergedCells.add(cell.cellId);
      }

      _profile = _profile.copyWith(
        discoveredCells: mergedCells,
        lastCloudBootstrapAtIso: bootstrapTimestamp,
        updatedAtIso: DateTime.now().toUtc().toIso8601String(),
      );

      await localProfileStore.save(_profile, profileKey: _activeProfileKey);
    } catch (e) {
      if (!silent) rethrow;
      // If backend bootstrap is not deployed yet, do not block app startup.
    }
  }

  bool _canUseWarmPersonalBootstrapCache({required bool silent}) {
    if (!silent) return false;
    if (_profile.discoveredCells.isEmpty) return false;

    final rawTimestamp = _profile.lastCloudBootstrapAtIso;
    if (rawTimestamp == null || rawTimestamp.isEmpty) return false;

    final timestamp = DateTime.tryParse(rawTimestamp)?.toUtc();
    if (timestamp == null) return false;

    return DateTime.now().toUtc().difference(timestamp).inHours <
        AppConstants.personalBootstrapRefreshHours;
  }

  Future<void> _backfillLocalDiscoveriesToCloud(
      Set<String> remoteCellIds) async {
    final missingIds = _profile.discoveredCells
        .where((cellId) => !remoteCellIds.contains(cellId))
        .toList(growable: false);

    if (missingIds.isEmpty) return;

    for (var start = 0;
        start < missingIds.length;
        start += AppConstants.cloudSyncBatchSize) {
      final end = (start + AppConstants.cloudSyncBatchSize) > missingIds.length
          ? missingIds.length
          : start + AppConstants.cloudSyncBatchSize;
      final batchIds = missingIds.sublist(start, end);
      final batchCells = batchIds.map((cellId) {
        final center = DiscoveryMath.cellCenterFromId(
          cellId,
          AppConstants.statsCellDegrees,
        );
        return CloudDiscoveryCell(
          cellId: cellId,
          latitude: center.latitude,
          longitude: center.longitude,
        );
      }).toList(growable: false);

      await appsyncService.syncDiscoveries(
        cells: batchCells,
        currentLat: null,
        currentLon: null,
        mapZoom: 17,
        displayName: _syncDisplayName,
        profileIcon: _syncProfileIcon,
      );

      for (final cellId in batchIds) {
        _pendingCloudCells.remove(cellId);
      }

      // Returning players with a large local cell history would otherwise
      // fan out a burst of mutations on first sign-in. Pace ourselves so
      // we don't trip AppSync rate limits or DynamoDB write capacity.
      if (end < missingIds.length) {
        await Future<void>.delayed(const Duration(milliseconds: 250));
      }
    }
  }

  Future<void> _handlePosition(Position position) async {
    final preview = _previewLocationFor(position);
    final previewUpdated =
        preview != null ? _updateCurrentLocationPreview(preview.latLng) : false;

    final accepted = _acceptedLocationFor(position);
    if (accepted == null) {
      if (previewUpdated) {
        _ensureSharedPresenceHeartbeat();
        _requestSharedPresenceSync(
          immediate: _lastPresenceSyncAt == null,
        );
        notifyListeners();
      }
      return;
    }

    final previousAccepted = _lastDiscoveryLatLng;
    final point = _smoothedDiscoveryPoint(accepted);
    final shouldBridgeReveal = previousAccepted != null &&
        DiscoveryMath.shouldBridgeReveals(
          start: previousAccepted,
          startTimestamp: _lastAcceptedFixAt,
          end: point,
          endTimestamp: accepted.timestamp,
        );
    if (previousAccepted != null &&
        _distance(previousAccepted, point) <
            AppConstants.stationaryJitterMeters) {
      if (previewUpdated) {
        _ensureSharedPresenceHeartbeat();
        _requestSharedPresenceSync(
          immediate: _lastPresenceSyncAt == null,
        );
        notifyListeners();
      }
      return;
    }

    _currentLatLng = point;
    _lastDiscoveryLatLng = point;

    double totalMeters = _profile.totalDistanceMeters;
    if (previousAccepted != null) {
      final movedMeters = _distance(previousAccepted, point);
      final fixTimestamp = accepted.timestamp;
      final gapSeconds = _lastAcceptedFixAt == null
          ? 0
          : fixTimestamp.difference(_lastAcceptedFixAt!).inSeconds;
      if (movedMeters >= AppConstants.minAcceptedMovementMeters &&
          gapSeconds <= AppConstants.maxDistanceCarryForwardGapSeconds) {
        totalMeters += movedMeters;
      }
    }

    final updatedReveals = List<RevealPoint>.from(_profile.reveals);
    final updatedCells = Set<String>.from(_profile.discoveredCells);
    final revealTime = DateTime.now().toUtc().toIso8601String();

    final lastRevealPoint = updatedReveals.isEmpty
        ? null
        : LatLng(
            updatedReveals.last.latitude,
            updatedReveals.last.longitude,
          );
    final shouldAppendRevealPoint = lastRevealPoint == null ||
        _distance(lastRevealPoint, point) >=
            AppConstants.revealPathPointSpacingMeters;

    if (shouldAppendRevealPoint) {
      updatedReveals.add(
        RevealPoint(
          latitude: point.latitude,
          longitude: point.longitude,
          discoveredAtIso: revealTime,
        ),
      );
    }

    final cloudCells = previousAccepted == null
        ? DiscoveryMath.cellsForRevealData(
            point: point,
            radiusMeters: AppConstants.discoveryRadiusMeters,
            cellDegrees: AppConstants.statsCellDegrees,
          )
        : shouldBridgeReveal
            ? DiscoveryMath.cellsForPathSegmentData(
                start: previousAccepted,
                end: point,
                radiusMeters: AppConstants.discoveryRadiusMeters,
                cellDegrees: AppConstants.statsCellDegrees,
              )
            : DiscoveryMath.cellsForRevealData(
                point: point,
                radiusMeters: AppConstants.discoveryRadiusMeters,
                cellDegrees: AppConstants.statsCellDegrees,
              );

    final newCloudCells = cloudCells
        .where((cell) => !updatedCells.contains(cell.cellId))
        .toList();

    if (newCloudCells.isNotEmpty) {
      updatedCells.addAll(newCloudCells.map((e) => e.cellId));
      for (final cell in newCloudCells) {
        _pendingCloudCells[cell.cellId] = cell;
      }
    }

    _lastAcceptedFixAt = accepted.timestamp;
    _lastAcceptedAccuracyMeters = accepted.accuracy;
    _savedMapCenterLatLng = point;

    _profile = _profile.copyWith(
      reveals: updatedReveals,
      discoveredCells: updatedCells,
      totalDistanceMeters: totalMeters,
      updatedAtIso: DateTime.now().toUtc().toIso8601String(),
      lastLatitude: point.latitude,
      lastLongitude: point.longitude,
    );

    _scheduleProfilePersist();
    _scheduleDiscoverySync();
    _ensureSharedPresenceHeartbeat();
    _requestSharedPresenceSync(
      immediate: _lastPresenceSyncAt == null,
    );
    _maybeAutoSyncCurrentSharedRegion(point);
    notifyListeners();
  }

  /// Coalesces JSON profile writes — one fix every 3 metres of movement on a
  /// long walk used to flush the entire profile blob to disk hundreds of times
  /// per minute. We now batch within ~2.5s and always flush on lifecycle exit
  /// or when discovery sync starts.
  void _scheduleProfilePersist({bool immediate = false}) {
    if (immediate) {
      _profilePersistTimer?.cancel();
      _profilePersistTimer = null;
      unawaited(localProfileStore.save(
        _profile,
        profileKey: _activeProfileKey,
      ));
      return;
    }
    if (_profilePersistTimer?.isActive == true) return;
    _profilePersistTimer = Timer(
      const Duration(milliseconds: 2500),
      () {
        _profilePersistTimer = null;
        unawaited(localProfileStore.save(
          _profile,
          profileKey: _activeProfileKey,
        ));
      },
    );
  }

  _AcceptedLocation? _acceptedLocationFor(Position position) {
    if (position.isMocked) {
      _error = 'Mock location detected. Discovery update ignored.';
      notifyListeners();
      return null;
    }

    final candidate = _AcceptedLocation(
      latLng: LatLng(position.latitude, position.longitude),
      timestamp: _positionTimestamp(position),
      accuracy: position.accuracy,
    );

    if (!_isFreshTimestamp(candidate.timestamp)) {
      return null;
    }

    if (position.speed > AppConstants.maxAcceptedSpeedMetersPerSecond) {
      return null;
    }

    if (_lastDiscoveryLatLng == null) {
      return _stabilizedInitialFix(candidate);
    }

    _initialFixSamples.clear();

    if (candidate.accuracy <= 0 ||
        candidate.accuracy > AppConstants.maxAcceptedAccuracyMeters) {
      return null;
    }

    final distanceFromLastAccepted = _distance(
      _lastDiscoveryLatLng!,
      candidate.latLng,
    );

    if (distanceFromLastAccepted < AppConstants.minAcceptedMovementMeters) {
      return null;
    }

    if (!_isReasonableJump(candidate, distanceFromLastAccepted)) {
      return null;
    }

    return candidate;
  }

  _AcceptedLocation? _previewLocationFor(Position position) {
    if (position.isMocked) {
      return null;
    }

    final candidate = _AcceptedLocation(
      latLng: LatLng(position.latitude, position.longitude),
      timestamp: _positionTimestamp(position),
      accuracy: position.accuracy,
    );

    if (!_isFreshTimestamp(candidate.timestamp)) {
      return null;
    }

    if (candidate.accuracy <= 0 ||
        candidate.accuracy > AppConstants.maxPreviewAccuracyMeters) {
      return null;
    }

    if (position.speed > AppConstants.maxAcceptedSpeedMetersPerSecond) {
      return null;
    }

    return candidate;
  }

  _AcceptedLocation? _stabilizedInitialFix(_AcceptedLocation candidate) {
    if (candidate.accuracy <= 0 ||
        candidate.accuracy > AppConstants.maxInitialFixAccuracyMeters) {
      return null;
    }

    final cutoff = candidate.timestamp.subtract(
      const Duration(
        seconds: AppConstants.initialFixStabilizationWindowSeconds,
      ),
    );
    _initialFixSamples.removeWhere(
      (sample) => sample.timestamp.isBefore(cutoff),
    );
    _initialFixSamples.add(candidate);

    final sampleCount = AppConstants.initialFixSampleCount;
    if (_initialFixSamples.length < sampleCount) {
      return null;
    }

    final cluster = _initialFixSamples.sublist(
      _initialFixSamples.length - sampleCount,
    );
    final averagedLatLng = _averageLatLng(cluster);

    var maxSpreadMeters = 0.0;
    var worstAccuracyMeters = 0.0;
    for (final sample in cluster) {
      final spreadMeters = _distance(sample.latLng, averagedLatLng);
      if (spreadMeters > maxSpreadMeters) {
        maxSpreadMeters = spreadMeters;
      }
      if (sample.accuracy > worstAccuracyMeters) {
        worstAccuracyMeters = sample.accuracy;
      }
    }

    if (maxSpreadMeters > AppConstants.initialFixMaxClusterSpreadMeters) {
      _initialFixSamples.removeAt(0);
      return null;
    }

    _initialFixSamples.clear();
    return _AcceptedLocation(
      latLng: averagedLatLng,
      timestamp: candidate.timestamp,
      accuracy: worstAccuracyMeters,
    );
  }

  bool _isFreshTimestamp(DateTime timestamp) {
    final ageSeconds = DateTime.now().toUtc().difference(timestamp).inSeconds;
    return ageSeconds <= AppConstants.maxAcceptedLocationAgeSeconds;
  }

  bool _isReasonableJump(_AcceptedLocation candidate, double distanceMeters) {
    if (_lastAcceptedFixAt == null) return true;

    final elapsedSeconds =
        candidate.timestamp.difference(_lastAcceptedFixAt!).inSeconds;
    if (elapsedSeconds <= 0) return true;

    final allowedDistance = AppConstants.maxReasonableJumpMeters +
        (elapsedSeconds * AppConstants.maxAcceptedSpeedMetersPerSecond) +
        (_lastAcceptedAccuracyMeters ?? 0) +
        candidate.accuracy;

    return distanceMeters <= allowedDistance;
  }

  DateTime _positionTimestamp(Position position) => position.timestamp.toUtc();

  bool get _canSyncCloud => isSignedIn && _currentLatLng != null && _tracking;

  bool get _canAdvertiseSharedPresence =>
      _canSyncCloud && _mapMode == MapMode.shared && _appInForeground;

  void _scheduleDiscoverySync({bool immediate = false}) {
    if (_pendingCloudCells.isEmpty) return;
    _scheduleCloudSync(immediate: immediate);
  }

  void _requestSharedPresenceSync({
    bool immediate = false,
    bool force = false,
  }) {
    if (!_canAdvertiseSharedPresence) return;

    final lastPresenceSyncAt = _lastPresenceSyncAt;
    if (!force && lastPresenceSyncAt != null) {
      final elapsedSeconds =
          DateTime.now().toUtc().difference(lastPresenceSyncAt).inSeconds;
      // Slow the heartbeat way down when the player has been stationary —
      // this is the single biggest AppSync cost lever at scale.
      final minSeconds = _isPlayerStationary
          ? AppConstants.sharedPresenceStationaryHeartbeatSeconds
          : AppConstants.sharedPresenceHeartbeatSeconds;
      if (elapsedSeconds < minSeconds) {
        return;
      }
    }

    _presenceSyncRequested = true;
    _scheduleCloudSync(immediate: immediate);
  }

  /// True if the last accepted GPS fix is at least
  /// [AppConstants.sharedPresenceStationarySeconds] old. We use the *fix
  /// timestamp* rather than wall-clock so a backgrounded app that just
  /// resumed isn't immediately treated as stationary.
  bool get _isPlayerStationary {
    final lastFix = _lastAcceptedFixAt;
    if (lastFix == null) return false;
    return DateTime.now().toUtc().difference(lastFix).inSeconds >=
        AppConstants.sharedPresenceStationarySeconds;
  }

  void _scheduleCloudSync({bool immediate = false}) {
    if (!_canSyncCloud) return;
    if (_pendingCloudCells.isEmpty && !_presenceSyncRequested) return;
    if (_cloudSyncInFlight) return;

    if (_cloudSyncTimer?.isActive == true) {
      if (!immediate) return;
      _cloudSyncTimer?.cancel();
    }

    _cloudSyncTimer = Timer(
      Duration(
        seconds: immediate ? 0 : AppConstants.cloudSyncDebounceSeconds,
      ),
      () async {
        _cloudSyncTimer = null;
        _cloudSyncInFlight = true;
        final pendingSnapshot = Map<String, CloudDiscoveryCell>.from(
          _pendingCloudCells,
        );
        final cells = pendingSnapshot.values.toList(growable: false);
        final includePresence = _presenceSyncRequested &&
            _canAdvertiseSharedPresence &&
            _currentLatLng != null;

        if (cells.isEmpty && !includePresence) {
          _presenceSyncRequested = false;
          _cloudSyncInFlight = false;
          return;
        }

        try {
          final currentLatLng = _currentLatLng;
          await appsyncService.syncDiscoveries(
            cells: cells,
            currentLat: includePresence ? currentLatLng?.latitude : null,
            currentLon: includePresence ? currentLatLng?.longitude : null,
            mapZoom: 17,
            displayName: _syncDisplayName,
            profileIcon: _syncProfileIcon,
          );

          // Keep discoveries queued until sync succeeds to avoid silent data loss.
          for (final cellId in pendingSnapshot.keys) {
            _pendingCloudCells.remove(cellId);
          }
          if (includePresence) {
            _lastPresenceSyncAt = DateTime.now().toUtc();
            _presenceSyncRequested = false;
          } else if (!_canAdvertiseSharedPresence) {
            _presenceSyncRequested = false;
          }
        } catch (e) {
          _error = e.toString();
          notifyListeners();
        } finally {
          _cloudSyncInFlight = false;
          if (_pendingCloudCells.isNotEmpty ||
              (_presenceSyncRequested && _canAdvertiseSharedPresence)) {
            _scheduleCloudSync();
          }
        }
      },
    );
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    _cloudSyncTimer?.cancel();
    _profilePersistTimer?.cancel();
    _sharedCachePersistTimer?.cancel();
    _sharedViewportDebounceTimer?.cancel();
    _sharedViewportPollTimer?.cancel();
    _sharedPresenceHeartbeatTimer?.cancel();
    // Best-effort flush of any unsaved profile mutation.
    unawaited(localProfileStore.save(
      _profile,
      profileKey: _activeProfileKey,
    ));
    appsyncService.dispose();
    sharedTileService.dispose();
    super.dispose();
  }

  List<String> _visibleSharedRegionIdsForCamera(MapCamera camera) {
    if (camera.zoom < AppConstants.sharedRegionOutlineMinZoom) {
      return const <String>[];
    }

    final bounds = camera.visibleBounds;
    return DiscoveryMath.sharedRegionIdsForBounds(
      minLat: bounds.southEast.latitude,
      maxLat: bounds.northWest.latitude,
      minLon: bounds.northWest.longitude,
      maxLon: bounds.southEast.longitude,
      mapZoom: AppConstants.sharedRegionSyncMapZoom,
      tilesPerRegion: AppConstants.sharedTilesPerRegionSide,
      maxRegionCount: AppConstants.sharedMaxVisibleRegionOutlines,
    );
  }

  Future<List<SharedPlayer>> _fetchSharedPresence(MapCamera camera) async {
    final bounds = camera.visibleBounds;
    return appsyncService.getSharedPresence(
      minLat: bounds.southEast.latitude,
      maxLat: bounds.northWest.latitude,
      minLon: bounds.northWest.longitude,
      maxLon: bounds.southEast.longitude,
      zoom: camera.zoom.round(),
    );
  }

  void _maybeAutoSyncCurrentSharedRegion(LatLng point) {
    if (!isSignedIn ||
        _mapMode != MapMode.shared ||
        !sharedTileService.isConfigured) {
      return;
    }

    final regionId = sharedRegionIdForPoint(point);
    if (_sharedSyncedRegionIds.contains(regionId) ||
        _sharedSyncingRegionIds.contains(regionId)) {
      _lastAutoSharedRegionId = regionId;
      return;
    }

    final now = DateTime.now().toUtc();
    if (_lastAutoSharedRegionId == regionId &&
        _lastAutoSharedRegionQueuedAt != null &&
        now.difference(_lastAutoSharedRegionQueuedAt!).inSeconds <
            AppConstants.sharedRegionAutoSyncCooldownSeconds) {
      return;
    }

    _lastAutoSharedRegionId = regionId;
    _lastAutoSharedRegionQueuedAt = now;
    unawaited(
      _syncSharedRegions(
        <String>[regionId],
        camera: mapController.camera,
        targetLabel: 'Syncing nearby region',
      ),
    );
  }

  String get _syncDisplayName =>
      authService.currentDisplayName?.trim().isNotEmpty == true
          ? authService.currentDisplayName!.trim()
          : _profile.displayName;

  String get _syncProfileIcon {
    if (!isSignedIn) return _profile.profileIcon;
    return authService.currentProfileIcon;
  }

  Future<void> _loadProfileForCurrentSession() async {
    final userId = authService.currentUserId;
    final defaultDisplayName = userId == null
        ? 'Adventurer'
        : (authService.currentDisplayName ?? 'Adventurer');

    _activeProfileKey = _profileStorageKeyFor(userId);
    _profile = await localProfileStore.load(
      profileKey: _activeProfileKey,
      profileId: userId ?? 'local-player',
      defaultDisplayName: defaultDisplayName,
    );

    // Existing players upgrading to the achievement-toast build would
    // otherwise get spammed with one snackbar per already-unlocked deed.
    // Treat their current unlocks as acknowledged on first load so we only
    // ever celebrate going-forward transitions.
    if (_profile.acknowledgedAchievementIds.isEmpty) {
      final alreadyUnlocked = AchievementCatalog.build(_profile)
          .where((a) => a.isUnlocked)
          .map((a) => a.id)
          .toSet();
      if (alreadyUnlocked.isNotEmpty) {
        _profile = _profile.copyWith(
          acknowledgedAchievementIds: alreadyUnlocked,
        );
        await localProfileStore.save(_profile, profileKey: _activeProfileKey);
      }
    }

    await _syncProfileIdentityMetadata();

    if (_profile.lastLatitude != null && _profile.lastLongitude != null) {
      _savedMapCenterLatLng = LatLng(
        _profile.lastLatitude!,
        _profile.lastLongitude!,
      );
    } else {
      _savedMapCenterLatLng = null;
    }
  }

  Future<void> _switchToCurrentSessionProfile() async {
    final previousLivePoint = _currentLatLng;
    _resetLiveLocationState();
    await _loadProfileForCurrentSession();
    _savedMapCenterLatLng ??= previousLivePoint;
  }

  Future<void> _syncProfileIdentityMetadata() async {
    final userId = authService.currentUserId;
    if (userId == null) return;

    var updatedProfile = _profile;
    var changed = false;

    if (updatedProfile.id != userId) {
      updatedProfile = updatedProfile.copyWith(id: userId);
      changed = true;
    }

    final authDisplayName = authService.currentDisplayName?.trim();
    if (authDisplayName != null &&
        authDisplayName.isNotEmpty &&
        (updatedProfile.displayName.trim().isEmpty ||
            updatedProfile.displayName == 'Adventurer')) {
      updatedProfile = updatedProfile.copyWith(displayName: authDisplayName);
      changed = true;
    }

    final authProfileIcon = authService.currentProfileIcon.trim();
    if (authProfileIcon.isNotEmpty &&
        ProfileIconCatalog.isAllowed(authProfileIcon) &&
        (updatedProfile.profileIcon.trim().isEmpty ||
            updatedProfile.profileIcon == ProfileIconCatalog.defaultIcon)) {
      updatedProfile = updatedProfile.copyWith(profileIcon: authProfileIcon);
      changed = true;
    }

    if (!changed) return;

    _profile = updatedProfile.copyWith(
      updatedAtIso: DateTime.now().toUtc().toIso8601String(),
    );
    await localProfileStore.save(_profile, profileKey: _activeProfileKey);
  }

  String _profileStorageKeyFor(String? userId) {
    if (userId == null || userId.isEmpty) {
      return LocalProfileStore.guestProfileKey;
    }
    return 'user_$userId';
  }

  void _resetLiveLocationState() {
    _currentLatLng = null;
    _lastDiscoveryLatLng = null;
    _lastAcceptedFixAt = null;
    _lastAcceptedAccuracyMeters = null;
    _lastPresenceSyncAt = null;
    _initialFixSamples.clear();
  }

  void _resetSessionScopedState() {
    _pendingCloudCells.clear();
    _cloudSyncTimer?.cancel();
    _cloudSyncTimer = null;
    _error = null;
    _pendingLandmarks = const [];
    _resetSharedViewportState();
  }

  Future<void> _bootstrapCurrentLocation() async {
    for (var attempt = 0;
        attempt < AppConstants.initialFixBootstrapAttempts;
        attempt++) {
      try {
        final bootstrapPosition = await locationService
            .getCurrentPosition()
            .timeout(const Duration(seconds: 8));
        await _handlePosition(bootstrapPosition);
        if (_currentLatLng != null) {
          return;
        }
      } catch (_) {
        // Keep trying within the bootstrap window before falling back to stream.
      }

      if (attempt < AppConstants.initialFixBootstrapAttempts - 1) {
        await Future<void>.delayed(
          const Duration(seconds: AppConstants.initialFixBootstrapDelaySeconds),
        );
      }
    }
  }

  String _sharedViewportCacheKeyFor(MapCamera camera) {
    final bounds = camera.visibleBounds;
    return DiscoveryMath.sharedViewportCacheKey(
      minLat: bounds.southEast.latitude,
      maxLat: bounds.northWest.latitude,
      minLon: bounds.northWest.longitude,
      maxLon: bounds.southEast.longitude,
      mapZoom: camera.zoom.round(),
    );
  }

  List<SharedPlayer>? _freshCachedSharedPlayersFor(
    MapCamera camera, {
    bool force = false,
  }) {
    if (force) return null;

    final cacheKey = _sharedViewportCacheKeyFor(camera);
    final cachedEntry = _sharedViewportCache[cacheKey];
    if (cachedEntry == null) {
      return null;
    }

    final ageSeconds =
        DateTime.now().toUtc().difference(cachedEntry.fetchedAt).inSeconds;
    if (ageSeconds >= AppConstants.sharedPresenceCacheSeconds) {
      return null;
    }

    return cachedEntry.viewport.players;
  }

  bool _applySharedViewportSnapshot({
    required String cacheKey,
    required SharedViewportResponse viewport,
  }) {
    if (_mapMode != MapMode.shared) return false;

    final currentKey = _sharedViewportCacheKeyFor(mapController.camera);
    if (cacheKey != currentKey) {
      return false;
    }

    final changed = _activeSharedViewportCacheKey != cacheKey ||
        _sharedViewport.generatedAt != viewport.generatedAt;
    _sharedViewport = viewport;
    _activeSharedViewportCacheKey = cacheKey;
    return changed;
  }

  void _cacheSharedViewport({
    required String cacheKey,
    required SharedViewportResponse viewport,
    required DateTime fetchedAt,
  }) {
    _sharedViewportCache[cacheKey] = _SharedViewportCacheEntry(
      viewport: viewport,
      fetchedAt: fetchedAt,
    );

    if (_sharedViewportCache.length <=
        AppConstants.sharedViewportCacheMaxEntries) {
      return;
    }

    final oldestKey = _sharedViewportCache.entries
        .reduce(
          (a, b) => a.value.fetchedAt.isBefore(b.value.fetchedAt) ? a : b,
        )
        .key;
    _sharedViewportCache.remove(oldestKey);
  }

  bool _applyStoredSharedViewportFor(MapCamera camera) {
    final cacheKey = _sharedViewportCacheKeyFor(camera);
    final storedViewport = _storedSharedViewportFor(camera);
    if (storedViewport == null) {
      return false;
    }
    return _applySharedViewportSnapshot(
      cacheKey: cacheKey,
      viewport: storedViewport,
    );
  }

  void _applySharedTileSnapshots(List<SharedTileSnapshot> snapshots) {
    if (snapshots.isEmpty) return;

    for (final snapshot in snapshots) {
      final existingMembership = _sharedTileMembershipIndex[snapshot.tileId];
      if (existingMembership != null) {
        for (final cellId in existingMembership.cellIds) {
          _sharedCellStore.remove(cellId);
        }
        for (final landmarkId in existingMembership.landmarkIds) {
          _sharedLandmarkStore.remove(landmarkId);
        }
      }

      final cellIds = <String>{};
      for (final cell in snapshot.cells) {
        _sharedCellStore[cell.cellId] = cell;
        cellIds.add(cell.cellId);
      }

      final landmarkIds = <String>{};
      for (final landmark in snapshot.landmarks) {
        _sharedLandmarkStore[landmark.landmarkId] = landmark;
        landmarkIds.add(landmark.landmarkId);
      }

      _sharedTileMembershipIndex[snapshot.tileId] = _SharedTileMembershipEntry(
        cellIds: cellIds,
        landmarkIds: landmarkIds,
      );
      if (snapshot.generatedAt.isNotEmpty) {
        _sharedTileVersionStore[snapshot.tileId] = snapshot.generatedAt;
        if (snapshot.generatedAt.compareTo(_sharedStoreGeneratedAt) >= 0) {
          _sharedStoreGeneratedAt = snapshot.generatedAt;
        }
      }
    }

    _scheduleSharedCachePersist(
      worldId: snapshots.first.worldId.isEmpty
          ? BackendConfig.defaultWorldId
          : snapshots.first.worldId,
    );
  }

  SharedViewportResponse? _storedSharedViewportFor(MapCamera camera) {
    if (_sharedCellStore.isEmpty && _sharedLandmarkStore.isEmpty) {
      return null;
    }
    final cells = _sharedCellStore.values
        .where(
          (cell) => _isInViewport(
            lat: cell.lat,
            lon: cell.lon,
            camera: camera,
          ),
        )
        .toList(growable: false)
      ..sort((a, b) => b.lastDiscoveredAt.compareTo(a.lastDiscoveredAt));

    final landmarks = _sharedLandmarkStore.values
        .where(
          (landmark) => _isInViewport(
            lat: landmark.lat,
            lon: landmark.lon,
            camera: camera,
          ),
        )
        .toList(growable: false)
      ..sort((a, b) => (b.createdAt ?? '').compareTo(a.createdAt ?? ''));

    if (cells.isEmpty && landmarks.isEmpty) {
      return null;
    }

    return SharedViewportResponse(
      worldId: _sharedViewport.worldId.isEmpty
          ? BackendConfig.defaultWorldId
          : _sharedViewport.worldId,
      cells: cells,
      players: const [],
      landmarks: landmarks,
      generatedAt: _sharedStoreGeneratedAt,
    );
  }

  bool _isInViewport({
    required double lat,
    required double lon,
    required MapCamera camera,
  }) {
    final bounds = camera.visibleBounds;
    return lat >= bounds.southEast.latitude &&
        lat <= bounds.northWest.latitude &&
        lon >= bounds.northWest.longitude &&
        lon <= bounds.southEast.longitude;
  }

  void _resetSharedViewportState({bool clearCache = true}) {
    _sharedCachePersistTimer?.cancel();
    _sharedViewportDebounceTimer?.cancel();
    _stopSharedViewportPolling();
    _stopSharedPresenceHeartbeat();
    _sharedViewport = SharedViewportResponse.empty();
    _sharedLoading = false;
    _sharedViewportRequestInFlight = false;
    _queuedSharedViewportCamera = null;
    _activeSharedViewportCacheKey = null;
    _sharedStoreGeneratedAt = '';
    _clearSharedSyncProgress();
    _sharedSyncingRegionIds.clear();
    _sharedSyncedRegionIds.clear();
    _sharedSyncStartedAt = null;
    _sharedSyncTargetLabel = null;
    _lastAutoSharedRegionId = null;
    _lastAutoSharedRegionQueuedAt = null;
    _presenceSyncRequested = false;
    _lastPresenceSyncAt = null;
    if (clearCache) {
      _sharedViewportCache.clear();
      _sharedCellStore.clear();
      _sharedLandmarkStore.clear();
      _sharedTileVersionStore.clear();
      _sharedTileMembershipIndex.clear();
    }
  }

  Future<void> _loadPersistedSharedCache() async {
    final snapshot = await sharedMapCacheStore.load(
      worldId: BackendConfig.defaultWorldId,
      maxAge: const Duration(
        hours: AppConstants.sharedViewportPersistedCacheMaxAgeHours,
      ),
    );
    if (snapshot == null) {
      return;
    }

    _sharedCellStore
      ..clear()
      ..addEntries(
        snapshot.cells.map(
          (cell) => MapEntry(cell.cellId, cell),
        ),
      );
    _sharedLandmarkStore
      ..clear()
      ..addEntries(
        snapshot.landmarks.map(
          (landmark) => MapEntry(landmark.landmarkId, landmark),
        ),
      );
    _sharedTileVersionStore
      ..clear()
      ..addAll(snapshot.tileVersions);
    _sharedSyncedRegionIds
      ..clear()
      ..addAll(snapshot.syncedRegionIds);
    _sharedStoreGeneratedAt = snapshot.generatedAt;
    _rebuildSharedTileMembershipIndex();
  }

  void _scheduleSharedCachePersist({required String worldId}) {
    _sharedCachePersistTimer?.cancel();
    _sharedCachePersistTimer = Timer(const Duration(seconds: 2), () async {
      final sortedCells = _sharedCellStore.values.toList(growable: false)
        ..sort((a, b) => b.lastDiscoveredAt.compareTo(a.lastDiscoveredAt));
      final sortedLandmarks = _sharedLandmarkStore.values
          .toList(growable: false)
        ..sort((a, b) => (b.createdAt ?? '').compareTo(a.createdAt ?? ''));

      final snapshot = SharedViewportCacheSnapshot(
        worldId: worldId,
        savedAtIso: DateTime.now().toUtc().toIso8601String(),
        generatedAt: _sharedStoreGeneratedAt,
        cells: sortedCells
            .take(AppConstants.sharedViewportPersistedCellLimit)
            .toList(growable: false),
        landmarks: sortedLandmarks
            .take(AppConstants.sharedViewportPersistedLandmarkLimit)
            .toList(growable: false),
        tileVersions: Map<String, String>.fromEntries(
          _sharedTileVersionStore.entries.take(
            AppConstants.sharedViewportPersistedTileVersionLimit,
          ),
        ),
        syncedRegionIds: _sharedSyncedRegionIds
            .take(AppConstants.sharedViewportPersistedRegionLimit)
            .toList(growable: false),
      );

      await sharedMapCacheStore.save(snapshot);
    });
  }

  void _ensureSharedViewportPolling() {
    if (!isSignedIn || _mapMode != MapMode.shared || !_appInForeground) {
      _stopSharedViewportPolling();
      return;
    }
    if (_sharedViewportPollTimer != null) return;

    _sharedViewportPollTimer = Timer.periodic(
      const Duration(seconds: AppConstants.sharedViewportRefreshSeconds),
      (_) {
        if (!isSignedIn || _mapMode != MapMode.shared) {
          _stopSharedViewportPolling();
          return;
        }
        refreshSharedViewport(mapController.camera);
      },
    );
  }

  void _stopSharedViewportPolling() {
    _sharedViewportPollTimer?.cancel();
    _sharedViewportPollTimer = null;
  }

  void _ensureSharedPresenceHeartbeat() {
    if (!_canAdvertiseSharedPresence) {
      _stopSharedPresenceHeartbeat();
      return;
    }
    if (_sharedPresenceHeartbeatTimer != null) return;

    _sharedPresenceHeartbeatTimer = Timer.periodic(
      const Duration(seconds: AppConstants.sharedPresenceHeartbeatSeconds),
      (_) => _requestSharedPresenceSync(),
    );
  }

  void _stopSharedPresenceHeartbeat() {
    _sharedPresenceHeartbeatTimer?.cancel();
    _sharedPresenceHeartbeatTimer = null;
  }

  void _rebuildSharedTileMembershipIndex() {
    _sharedTileMembershipIndex.clear();

    for (final cell in _sharedCellStore.values) {
      if (cell.tileId.isEmpty) continue;
      final entry = _sharedTileMembershipIndex.putIfAbsent(
        cell.tileId,
        () => _SharedTileMembershipEntry.empty(),
      );
      entry.cellIds.add(cell.cellId);
    }

    for (final landmark in _sharedLandmarkStore.values) {
      if (landmark.tileId.isEmpty) continue;
      final entry = _sharedTileMembershipIndex.putIfAbsent(
        landmark.tileId,
        () => _SharedTileMembershipEntry.empty(),
      );
      entry.landmarkIds.add(landmark.landmarkId);
    }
  }

  void _setSharedSyncProgress(int completed, int total) {
    if (_sharedSyncCompleted == completed && _sharedSyncTotal == total) {
      return;
    }
    _sharedSyncCompleted = completed;
    _sharedSyncTotal = total;
    if (_sharedLoading) {
      notifyListeners();
    }
  }

  String? get _sharedSyncEtaLabel {
    final startedAt = _sharedSyncStartedAt;
    if (startedAt == null ||
        _sharedSyncCompleted <= 0 ||
        _sharedSyncTotal <= _sharedSyncCompleted) {
      return null;
    }

    final elapsedSeconds =
        DateTime.now().toUtc().difference(startedAt).inMilliseconds / 1000.0;
    if (elapsedSeconds <= 0) return null;

    final averageSecondsPerStep = elapsedSeconds / _sharedSyncCompleted;
    final remainingSteps = _sharedSyncTotal - _sharedSyncCompleted;
    final remainingSeconds = (averageSecondsPerStep * remainingSteps).round();
    if (remainingSeconds <= 0) return null;
    return remainingSeconds >= 60
        ? '~${(remainingSeconds / 60).ceil()}m left'
        : '~${remainingSeconds}s left';
  }

  void _clearSharedSyncProgress() {
    _sharedSyncCompleted = 0;
    _sharedSyncTotal = 0;
  }

  LatLng _averageLatLng(List<_AcceptedLocation> samples) {
    var latTotal = 0.0;
    var lonTotal = 0.0;
    for (final sample in samples) {
      latTotal += sample.latLng.latitude;
      lonTotal += sample.latLng.longitude;
    }
    return LatLng(latTotal / samples.length, lonTotal / samples.length);
  }

  LatLng _smoothedDiscoveryPoint(_AcceptedLocation candidate) {
    final previous = _lastDiscoveryLatLng;
    if (previous == null) return candidate.latLng;

    final distanceMeters = _distance(previous, candidate.latLng);
    if (distanceMeters <= AppConstants.stationaryJitterMeters) {
      return previous;
    }

    final blend = (distanceMeters / (distanceMeters + candidate.accuracy))
        .clamp(
          AppConstants.discoverySmoothingMinBlend,
          AppConstants.discoverySmoothingMaxBlend,
        )
        .toDouble();

    return LatLng(
      previous.latitude +
          ((candidate.latLng.latitude - previous.latitude) * blend),
      previous.longitude +
          ((candidate.latLng.longitude - previous.longitude) * blend),
    );
  }

  bool _updateCurrentLocationPreview(LatLng point) {
    final previous = _currentLatLng;
    if (previous != null && _distance(previous, point) < 1.0) {
      return false;
    }

    _currentLatLng = point;
    _savedMapCenterLatLng = point;
    return true;
  }
}

class _AcceptedLocation {
  const _AcceptedLocation({
    required this.latLng,
    required this.timestamp,
    required this.accuracy,
  });

  final LatLng latLng;
  final DateTime timestamp;
  final double accuracy;
}

class _SharedViewportCacheEntry {
  const _SharedViewportCacheEntry({
    required this.viewport,
    required this.fetchedAt,
  });

  final SharedViewportResponse viewport;
  final DateTime fetchedAt;
}

class _SharedTileMembershipEntry {
  const _SharedTileMembershipEntry({
    required this.cellIds,
    required this.landmarkIds,
  });

  _SharedTileMembershipEntry.empty()
      : cellIds = <String>{},
        landmarkIds = <String>{};

  final Set<String> cellIds;
  final Set<String> landmarkIds;
}

class _LandmarkUrlCacheEntry {
  const _LandmarkUrlCacheEntry({
    required this.url,
    required this.fetchedAt,
  });

  final String url;
  final DateTime fetchedAt;

  bool isFresh() {
    return DateTime.now().toUtc().difference(fetchedAt).inSeconds <
        AppConstants.landmarkUrlCacheSeconds;
  }
}
