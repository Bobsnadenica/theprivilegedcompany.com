import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../cloud/map_mode.dart';
import '../../cloud/models/shared_viewport_models.dart';
import '../../controllers/app_controller.dart';
import '../../core/constants/app_constants.dart';
import '../../data/models/reveal_point.dart';
import '../../services/external_maps_service.dart';
import '../../services/location_search_service.dart';
import '../widgets/fantasy_panel.dart';
import '../widgets/fog_of_war_overlay.dart';
import '../widgets/map_mode_toggle.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key, required this.controller});

  final AppController controller;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final LocationSearchService _locationSearchService = LocationSearchService();

  int _mapRevision = 0;
  bool _mapReady = false;
  bool _autoCenteredOnLiveFix = false;
  bool _mapGuideQueued = false;
  DateTime? _lastSharedTapAt;
  String? _lastSharedTapRegionId;
  LatLng? _navigationPin;

  @override
  void dispose() {
    _locationSearchService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final controller = widget.controller;
        final current = controller.currentLatLng;
        final center = controller.mapCenter;
        final fogReveals = controller.activeFogReveals;
        final revealPathSegments = controller.revealPathSegments;
        final sharedRegionOutlines =
            _mapReady && controller.mapMode == MapMode.shared
                ? controller
                    .visibleSharedRegionsFor(controller.mapController.camera)
                : const <SharedRegionOutline>[];
        final screenWidth = MediaQuery.sizeOf(context).width;

        final mapRotation = _mapReady
            ? controller.mapController.camera.rotation
            : 0.0;

        if (_mapReady && current != null && !_autoCenteredOnLiveFix) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted || !_mapReady || _autoCenteredOnLiveFix) {
              return;
            }
            controller.mapController.move(current, AppConstants.initialZoom);
            setState(() {
              _autoCenteredOnLiveFix = true;
              _mapRevision++;
            });
          });
        }

        if (_mapReady &&
            !_mapGuideQueued &&
            !controller.hasSeenMapGuide &&
            controller.initialized) {
          _mapGuideQueued = true;
          WidgetsBinding.instance.addPostFrameCallback((_) async {
            if (!mounted) return;
            await _showMapGuide(context);
          });
        }

        return Scaffold(
          backgroundColor: const Color(0xFF0D1113),
          body: Stack(
            children: [
              Positioned.fill(
                child: ColorFiltered(
                  colorFilter: const ColorFilter.matrix([
                    0.90,
                    0.08,
                    0.02,
                    0,
                    8,
                    0.12,
                    0.90,
                    0.04,
                    0,
                    5,
                    0.05,
                    0.10,
                    0.86,
                    0,
                    0,
                    0.00,
                    0.00,
                    0.00,
                    1,
                    0,
                  ]),
                  child: FlutterMap(
                    mapController: controller.mapController,
                    options: MapOptions(
                      initialCenter: center,
                      initialZoom: AppConstants.initialZoom,
                      minZoom: AppConstants.minZoom,
                      maxZoom: AppConstants.maxZoom,
                      interactionOptions: InteractionOptions(
                        flags: controller.mapMode == MapMode.shared
                            ? InteractiveFlag.all &
                                ~InteractiveFlag.doubleTapZoom &
                                ~InteractiveFlag.doubleTapDragZoom
                            : InteractiveFlag.all,
                      ),
                      onMapReady: () {
                        if (mounted && !_mapReady) {
                          setState(() {
                            _mapReady = true;
                            _mapRevision++;
                          });
                          if (controller.mapMode == MapMode.shared) {
                            controller.refreshSharedViewport(
                              controller.mapController.camera,
                            );
                          }
                        }
                      },
                      onTap: (_, point) => _handleSharedTap(point),
                      onLongPress: (_, point) => _handleMapLongPress(point),
                      onPositionChanged: (_, hasGesture) {
                        if (mounted && _mapReady) {
                          setState(() => _mapRevision++);
                          if (controller.mapMode == MapMode.shared &&
                              hasGesture) {
                            controller.scheduleSharedViewportRefresh(
                              controller.mapController.camera,
                            );
                          }
                        }
                      },
                    ),
                    children: [
                      TileLayer(
                        urlTemplate: AppConstants.tileUrlTemplate,
                        userAgentPackageName: AppConstants.userAgentPackageName,
                      ),
                      if (revealPathSegments
                          .any((segment) => segment.length > 1))
                        PolylineLayer(
                          polylines: revealPathSegments
                              .where((segment) => segment.length > 1)
                              .map(
                                (segment) => Polyline(
                                  points: segment,
                                  strokeWidth: 3.2,
                                  color: const Color(0xBFE9D3A4),
                                ),
                              )
                              .toList(growable: false),
                        ),
                      if (_mapReady)
                        Positioned.fill(
                          child: IgnorePointer(
                            child: FogOfWarOverlay(
                              camera: controller.mapController.camera,
                              reveals: fogReveals,
                              trailSegments: revealPathSegments,
                              revision: _mapRevision,
                            ),
                          ),
                        ),
                      if (current != null &&
                          controller.currentLocationAccuracyMeters != null)
                        CircleLayer(
                          circles: [
                            CircleMarker(
                              point: current,
                              radius:
                                  controller.currentLocationAccuracyMeters!,
                              useRadiusInMeter: true,
                              color: const Color(0x144FC3F7),
                              borderColor: const Color(0x554FC3F7),
                              borderStrokeWidth: 1.2,
                            ),
                          ],
                        ),
                      MarkerLayer(
                        markers: [
                          if (current != null)
                            _currentMarker(controller, current),
                          if (_navigationPin != null)
                            _navigationPinMarker(context, _navigationPin!),
                          if (controller.mapMode == MapMode.shared)
                            ...controller.sharedPlayers.map(_playerMarker),
                          if (controller.mapMode == MapMode.shared)
                            ...controller.sharedLandmarks.map(
                              (e) => _landmarkMarker(context, e),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              Positioned.fill(
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          const Color(0x22090A0B),
                          Colors.transparent,
                          const Color(0x22090A0B),
                        ],
                        stops: const [0.0, 0.32, 1.0],
                      ),
                    ),
                  ),
                ),
              ),
              if (_mapReady && controller.mapMode == MapMode.shared)
                Positioned.fill(
                  child: IgnorePointer(
                    child: _SharedRegionOutlineOverlay(
                      camera: controller.mapController.camera,
                      outlines: sharedRegionOutlines,
                      revision: _mapRevision,
                    ),
                  ),
                ),
              Positioned.fill(
                child: SafeArea(
                  minimum: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                  child: Stack(
                    children: [
                      Positioned(
                        top: 0,
                        right: 0,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            MapModeMenuButton(
                              mode: controller.mapMode,
                              sharedEnabled: controller.isSignedIn,
                              onChanged: (mode) async {
                                if (mode == MapMode.shared &&
                                    !controller.isSignedIn) {
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                        'Sign in from the Hero tab to enter the shared realm.',
                                      ),
                                    ),
                                  );
                                  return;
                                }
                                await controller.setMapMode(
                                  mode,
                                  camera: _mapReady
                                      ? controller.mapController.camera
                                      : null,
                                );
                              },
                            ),
                            const SizedBox(height: 10),
                            _MapActionButton(
                              icon: Icons.search_rounded,
                              tooltip: 'Search city',
                              onPressed: () => _showCitySearchSheet(context),
                            ),
                            const SizedBox(height: 10),
                            _MapActionButton(
                              icon: Icons.my_location_rounded,
                              tooltip: 'Center on me',
                              onPressed: (!_mapReady || current == null)
                                  ? null
                                  : () {
                                      controller.mapController.move(
                                          center, AppConstants.initialZoom);
                                      setState(() => _mapRevision++);
                                    },
                            ),
                            const SizedBox(height: 10),
                            _MapActionButton(
                              icon: Icons.fit_screen_rounded,
                              tooltip: 'Fit to explored',
                              onPressed:
                                  (!_mapReady || fogReveals.isEmpty)
                                      ? null
                                      : () => _fitToExplored(fogReveals),
                            ),
                            if (_mapReady && mapRotation.abs() > 1.0) ...[
                              const SizedBox(height: 10),
                              _CompassButton(
                                rotation: mapRotation,
                                onPressed: () {
                                  controller.mapController.rotate(0);
                                  setState(() => _mapRevision++);
                                },
                              ),
                            ],
                            if (controller.isSignedIn) ...[
                              const SizedBox(height: 10),
                              _MapActionButton(
                                icon: Icons.add_a_photo_outlined,
                                tooltip: 'New landmark',
                                onPressed: () => _showAddLandmarkSheet(context),
                              ),
                            ],
                          ],
                        ),
                      ),
                      if (_shouldShowStatus(controller))
                        Positioned(
                          left: 0,
                          right: 72,
                          bottom: 18,
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: ConstrainedBox(
                              constraints: BoxConstraints(
                                maxWidth: math.min(screenWidth - 100, 320),
                              ),
                              child: _StatusChip(
                                label: _statusText(controller),
                                active: controller.tracking,
                                loading:
                                    controller.sharedLoading || controller.busy,
                                progress: controller.sharedSyncProgress,
                              ),
                            ),
                          ),
                        ),
                      if (_mapReady &&
                          current == null &&
                          controller.tracking)
                        const Align(
                          alignment: Alignment.center,
                          child: _GpsLockHintBubble(),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _fitToExplored(List<RevealPoint> reveals) {
    if (!_mapReady || reveals.isEmpty) return;
    var minLat = reveals.first.latitude;
    var maxLat = minLat;
    var minLon = reveals.first.longitude;
    var maxLon = minLon;
    for (final r in reveals.skip(1)) {
      if (r.latitude < minLat) minLat = r.latitude;
      if (r.latitude > maxLat) maxLat = r.latitude;
      if (r.longitude < minLon) minLon = r.longitude;
      if (r.longitude > maxLon) maxLon = r.longitude;
    }
    final bounds = LatLngBounds(
      LatLng(minLat, minLon),
      LatLng(maxLat, maxLon),
    );
    widget.controller.mapController.fitCamera(
      CameraFit.bounds(
        bounds: bounds,
        padding: const EdgeInsets.all(48),
        maxZoom: AppConstants.initialZoom,
      ),
    );
    setState(() => _mapRevision++);
  }

  Future<void> _showMapGuide(BuildContext context) async {
    final controller = widget.controller;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isDismissible: true,
      builder: (sheetContext) {
        final guideItems = <({IconData icon, String title, String body})>[
          (
            icon: Icons.public_outlined,
            title: 'Realm switch',
            body:
                'Use the top-right Personal and Shared buttons to switch between your atlas and the shared realm.',
          ),
          (
            icon: Icons.search_rounded,
            title: 'Search cities',
            body:
                'Use the search button to jump the atlas to a city, town, or village.',
          ),
          (
            icon: Icons.my_location_rounded,
            title: 'Center on you',
            body:
                'The location button recenters the map on your live position.',
          ),
          if (controller.isSignedIn)
            (
              icon: Icons.add_a_photo_outlined,
              title: 'New landmark',
              body:
                  'Add a photo landmark from your current position for moderation and later display on the shared realm.',
            ),
          (
            icon: Icons.assistant_navigation,
            title: 'Pin and directions',
            body:
                'Long-press anywhere on the map to drop a pin and open directions in Apple Maps or Google Maps.',
          ),
          if (controller.isSignedIn)
            (
              icon: Icons.grid_4x4_outlined,
              title: 'Shared region sync',
              body:
                  'In Shared Realm, double-tap a region border to download that area. Progress appears in the status bar.',
            ),
        ];

        return Padding(
          padding: const EdgeInsets.all(16),
          child: SafeArea(
            top: false,
            child: SingleChildScrollView(
              child: FantasyPanel(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Map guide',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'A quick overview of the controls on this screen.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 16),
                    ...guideItems.map(
                      (item) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(11),
                                color: const Color(0x22F2E8D1),
                              ),
                              child: Icon(
                                item.icon,
                                size: 18,
                                color: const Color(0xFFF2E8D1),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    item.title,
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelLarge
                                        ?.copyWith(fontWeight: FontWeight.w800),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    item.body,
                                    style:
                                        Theme.of(context).textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: () => Navigator.of(sheetContext).pop(),
                        child: const Text('Continue'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );

    await controller.markMapGuideSeen();
  }

  void _handleSharedTap(LatLng point) {
    final controller = widget.controller;
    if (!_mapReady || controller.mapMode != MapMode.shared) {
      return;
    }

    final tappedRegionId = controller.sharedRegionIdForPoint(point);
    final now = DateTime.now();
    final isDoubleTap = _lastSharedTapRegionId == tappedRegionId &&
        _lastSharedTapAt != null &&
        now.difference(_lastSharedTapAt!).inMilliseconds <=
            AppConstants.sharedRegionDoubleTapWindowMs;

    _lastSharedTapAt = now;
    _lastSharedTapRegionId = tappedRegionId;

    if (!isDoubleTap) {
      return;
    }

    controller
        .syncSharedRegionAtPoint(
      point,
      camera: controller.mapController.camera,
    )
        .catchError((Object error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to sync region: $error')),
      );
    });
  }

  void _handleMapLongPress(LatLng point) {
    setState(() {
      _navigationPin = point;
      _mapRevision++;
    });
    _showDirectionsSheet(
      context,
      title: 'Pinned waypoint',
      point: point,
      allowClear: true,
    );
  }

  String _statusText(AppController controller) {
    if (controller.sharedLoading) {
      return controller.sharedSyncLabel ?? 'Loading realm map';
    }
    if (controller.busy) {
      return 'Requesting location';
    }
    if (controller.waitingForAccurateLocation) {
      return 'Waiting for GPS lock';
    }
    if (controller.tracking) {
      return 'Tracking live';
    }
    return 'Tracking unavailable';
  }

  bool _shouldShowStatus(AppController controller) {
    return controller.sharedLoading ||
        controller.busy ||
        controller.waitingForAccurateLocation ||
        !controller.tracking;
  }

  Marker _currentMarker(AppController controller, LatLng current) {
    return Marker(
      point: current,
      width: 44,
      height: 44,
      child: Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFFF2E1B8),
              Color(0xFFD2A562),
            ],
          ),
          shape: BoxShape.circle,
          border: Border.all(
            color: const Color(0xFFF9F2E5),
            width: 2.2,
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x66101010),
              blurRadius: 14,
              offset: Offset(0, 6),
            ),
          ],
        ),
        child: Center(
          child: Text(
            controller.profile.profileIcon,
            style: const TextStyle(fontSize: 18),
          ),
        ),
      ),
    );
  }

  Marker _playerMarker(SharedPlayer player) {
    return Marker(
      point: LatLng(player.lat, player.lon),
      width: 84,
      height: 64,
      child: Column(
        children: [
          Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFFDAE7ED), Color(0xFF6FA4BE)],
              ),
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0xFFF5F1E8), width: 2),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x66101010),
                  blurRadius: 10,
                ),
              ],
            ),
            child: Center(
              child: Text(
                player.profileIcon,
                style: const TextStyle(fontSize: 14),
              ),
            ),
          ),
          const SizedBox(height: 5),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xC8171B1D),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: const Color(0x30F1E5D2)),
            ),
            child: Text(
              player.displayName,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 10.5, color: Color(0xFFF3EBDC)),
            ),
          ),
        ],
      ),
    );
  }

  Marker _navigationPinMarker(BuildContext context, LatLng point) {
    return Marker(
      point: point,
      width: 44,
      height: 56,
      child: GestureDetector(
        onTap: () => _showDirectionsSheet(
          context,
          title: 'Pinned waypoint',
          point: point,
          allowClear: true,
        ),
        child: Column(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFFF0D6A3), Color(0xFFC3813A)],
                ),
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFF8F1E3), width: 2),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x66101010),
                    blurRadius: 12,
                    offset: Offset(0, 5),
                  ),
                ],
              ),
              child: const Icon(
                Icons.assistant_navigation,
                size: 18,
                color: Color(0xFF17140F),
              ),
            ),
            const SizedBox(height: 2),
            Container(
              width: 2,
              height: 14,
              color: const Color(0xFFF2E8D1),
            ),
          ],
        ),
      ),
    );
  }

  Marker _landmarkMarker(BuildContext context, SharedLandmark landmark) {
    return Marker(
      point: LatLng(landmark.lat, landmark.lon),
      width: 42,
      height: 42,
      child: GestureDetector(
        onTap: () async {
          try {
            final viewUrl = await widget.controller.getLandmarkViewUrl(
              landmark.landmarkId,
            );
            if (!context.mounted) return;
            _showLandmarkSheet(
              context,
              landmark: landmark,
              viewUrl: viewUrl,
            );
          } catch (e) {
            if (!context.mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Failed to load landmark image: $e')),
            );
          }
        },
        child: Container(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFFF0C87C), Color(0xFFAD7A34)],
            ),
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0xFFF5F1E8), width: 2),
            boxShadow: const [
              BoxShadow(
                color: Color(0x66101010),
                blurRadius: 10,
              ),
            ],
          ),
          child: const Icon(
            Icons.photo_camera_outlined,
            size: 18,
            color: Color(0xFF17140F),
          ),
        ),
      ),
    );
  }

  void _showLandmarkSheet(
    BuildContext context, {
    required SharedLandmark landmark,
    required String viewUrl,
  }) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Padding(
        padding: const EdgeInsets.all(16),
        child: FantasyPanel(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                landmark.title,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              if (landmark.description.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(landmark.description),
              ],
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(18),
                child: Image.network(
                  viewUrl,
                  height: 220,
                  fit: BoxFit.cover,
                ),
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final launched = await ExternalMapsService.openDirections(
                      latitude: landmark.lat,
                      longitude: landmark.lon,
                      label: landmark.title,
                    );
                    if (!context.mounted) return;
                    if (!launched) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('No maps application was available.'),
                        ),
                      );
                    }
                  },
                  icon: const Icon(Icons.route_outlined),
                  label: const Text('Get directions'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showDirectionsSheet(
    BuildContext context, {
    required String title,
    required LatLng point,
    bool allowClear = false,
  }) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Padding(
        padding: const EdgeInsets.all(16),
        child: FantasyPanel(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                '${point.latitude.toStringAsFixed(5)}, ${point.longitude.toStringAsFixed(5)}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () async {
                    final launched = await ExternalMapsService.openDirections(
                      latitude: point.latitude,
                      longitude: point.longitude,
                      label: title,
                    );
                    if (!context.mounted) return;
                    if (!launched) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('No maps application was available.'),
                        ),
                      );
                    }
                  },
                  icon: const Icon(Icons.route_outlined),
                  label: const Text('Open in Maps'),
                ),
              ),
              if (allowClear) ...[
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () {
                      Navigator.of(context).pop();
                      if (!mounted) return;
                      setState(() {
                        _navigationPin = null;
                        _mapRevision++;
                      });
                    },
                    icon: const Icon(Icons.close_rounded),
                    label: const Text('Clear pin'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showAddLandmarkSheet(BuildContext context) async {
    final titleController = TextEditingController();
    final descriptionController = TextEditingController();
    String selectedCategoryId = AppConstants.defaultLandmarkCategoryId;

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        top: false,
        child: AnimatedPadding(
          duration: const Duration(milliseconds: 180),
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 16,
          ),
          child: FantasyPanel(
            background: const [
              Color(0xD4151917),
              Color(0xD41B221C),
              Color(0xD414181A),
            ],
            child: StatefulBuilder(
              builder: (context, setSheetState) => SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'New Landmark',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Capture a place worth remembering. Your upload goes to review before it appears in the shared realm.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: titleController,
                      textInputAction: TextInputAction.next,
                      maxLength: 80,
                      decoration: const InputDecoration(labelText: 'Title'),
                    ),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      value: selectedCategoryId,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Category'),
                      items: AppConstants.landmarkCategories
                          .map(
                            (category) => DropdownMenuItem<String>(
                              value: category.id,
                              child: Text(category.label),
                            ),
                          )
                          .toList(growable: false),
                      onChanged: (value) {
                        if (value == null) return;
                        setSheetState(() {
                          selectedCategoryId = value;
                        });
                      },
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: descriptionController,
                      minLines: 2,
                      maxLines: 4,
                      maxLength: 280,
                      textInputAction: TextInputAction.done,
                      decoration:
                          const InputDecoration(labelText: 'Description'),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: () async {
                          final title = titleController.text.trim();
                          final description =
                              descriptionController.text.trim();
                          final category = selectedCategoryId.trim();

                          if (title.isEmpty ||
                              description.isEmpty ||
                              category.isEmpty) {
                            ScaffoldMessenger.of(sheetContext).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'Title, category, and description are required.',
                                ),
                              ),
                            );
                            return;
                          }

                          FocusScope.of(sheetContext).unfocus();
                          Navigator.of(sheetContext).pop();

                          try {
                            await widget.controller.uploadLandmark(
                              title: title,
                              description: description,
                              category: category,
                              mapZoom: 17,
                            );
                            if (!context.mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Landmark uploaded for review.'),
                              ),
                            );
                          } catch (e) {
                            if (!context.mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(e.toString())),
                            );
                          }
                        },
                        icon: const Icon(Icons.photo_camera_outlined),
                        label: const Text('Take photo and upload'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );

    titleController.dispose();
    descriptionController.dispose();
  }

  Future<void> _showCitySearchSheet(BuildContext context) async {
    final result = await showModalBottomSheet<LocationSearchResult>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (sheetContext) => _CitySearchSheet(
        searchService: _locationSearchService,
      ),
    );

    if (!mounted || result == null) {
      return;
    }

    final point = LatLng(result.latitude, result.longitude);
    widget.controller.mapController.move(point, AppConstants.citySearchZoom);
    setState(() {
      _navigationPin = point;
      _mapRevision++;
    });
  }
}

class _GpsLockHintBubble extends StatelessWidget {
  const _GpsLockHintBubble();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 280),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xCC131715),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0x44F2E8D1)),
            boxShadow: const [
              BoxShadow(
                color: Color(0x66101010),
                blurRadius: 18,
                offset: Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: const [
              SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2.2,
                  color: Color(0xFFF2E8D1),
                ),
              ),
              SizedBox(width: 10),
              Flexible(
                child: Text(
                  'Looking for GPS lock — step outside or near a window for the first fix.',
                  style: TextStyle(
                    color: Color(0xFFF2E8D1),
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MapActionButton extends StatelessWidget {
  const _MapActionButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: const Color(0xC9131715),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: Color(0x34F2E8D1)),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onPressed,
          child: SizedBox(
            width: 52,
            height: 52,
            child: Icon(
              icon,
              color: onPressed == null
                  ? const Color(0x66F2E8D1)
                  : const Color(0xFFF2E8D1),
            ),
          ),
        ),
      ),
    );
  }
}

class _CompassButton extends StatelessWidget {
  const _CompassButton({
    required this.rotation,
    required this.onPressed,
  });

  final double rotation;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Snap to north',
      child: Material(
        color: const Color(0xC9131715),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: Color(0x54F2E8D1)),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onPressed,
          child: SizedBox(
            width: 52,
            height: 52,
            child: Center(
              child: Transform.rotate(
                angle: -rotation * (math.pi / 180),
                child: const Icon(
                  Icons.navigation_rounded,
                  color: Color(0xFFE8C97A),
                  size: 24,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CitySearchSheet extends StatefulWidget {
  const _CitySearchSheet({required this.searchService});

  final LocationSearchService searchService;

  @override
  State<_CitySearchSheet> createState() => _CitySearchSheetState();
}

class _CitySearchSheetState extends State<_CitySearchSheet> {
  final TextEditingController _queryController = TextEditingController();

  bool _loading = false;
  String? _error;
  List<LocationSearchResult> _results = const <LocationSearchResult>[];

  @override
  void dispose() {
    _queryController.dispose();
    super.dispose();
  }

  Future<void> _runSearch() async {
    final query = _queryController.text.trim();
    if (query.length < 2) {
      setState(() {
        _error = 'Enter at least 2 characters.';
        _results = const <LocationSearchResult>[];
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final results = await widget.searchService.searchCities(query);
      if (!mounted) return;
      setState(() {
        _loading = false;
        _results = results;
        _error = results.isEmpty ? 'No matching cities found.' : null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _results = const <LocationSearchResult>[];
        _error = error.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: FantasyPanel(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Search cities',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                'Jump the atlas to a city, town, or village.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _queryController,
                      textInputAction: TextInputAction.search,
                      onSubmitted: (_) => _runSearch(),
                      decoration: const InputDecoration(
                        hintText: 'Search a city',
                        prefixIcon: Icon(Icons.search_rounded),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  FilledButton(
                    onPressed: _loading ? null : _runSearch,
                    child: const Text('Search'),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(
                    child: CircularProgressIndicator(),
                  ),
                )
              else if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    _error!,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: const Color(0xFFEAA8A0),
                        ),
                  ),
                )
              else if (_results.isNotEmpty)
                ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 320),
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: _results.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final result = _results[index];
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(
                          Icons.location_city_outlined,
                          color: Color(0xFFF2E8D1),
                        ),
                        title: Text(result.label),
                        subtitle: Text(
                          result.subtitle.isEmpty
                              ? result.type
                              : result.subtitle,
                        ),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: () => Navigator.of(context).pop(result),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({
    required this.label,
    required this.active,
    required this.loading,
    this.progress,
  });

  final String label;
  final bool active;
  final bool loading;
  final double? progress;

  @override
  Widget build(BuildContext context) {
    return FantasyPanel(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      background: active
          ? const [
              Color(0xC916241C),
              Color(0xC91C2F25),
            ]
          : const [
              Color(0xC9271816),
              Color(0xC937211B),
            ],
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (loading)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.0,
                    color: Color(0xFFF2E8D1),
                  ),
                )
              else
                Icon(
                  active ? Icons.track_changes : Icons.warning_amber_rounded,
                  size: 16,
                  color: const Color(0xFFF2E8D1),
                ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: Color(0xFFF2E8D1),
                  ),
                ),
              ),
            ],
          ),
          if (progress != null && progress! > 0 && progress! < 1) ...[
            const SizedBox(height: 9),
            FantasyProgressBar(
              value: progress!,
              height: 6,
              fill: const [Color(0xFFC99758), Color(0xFFF0D9A6)],
              trackColor: const Color(0x66322218),
            ),
          ],
        ],
      ),
    );
  }
}

class _SharedRegionOutlineOverlay extends StatelessWidget {
  const _SharedRegionOutlineOverlay({
    required this.camera,
    required this.outlines,
    required this.revision,
  });

  final MapCamera camera;
  final List<SharedRegionOutline> outlines;
  final int revision;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _SharedRegionOutlinePainter(
        camera: camera,
        outlines: outlines,
        revision: revision,
      ),
      size: Size.infinite,
    );
  }
}

class _SharedRegionOutlinePainter extends CustomPainter {
  _SharedRegionOutlinePainter({
    required this.camera,
    required this.outlines,
    required this.revision,
  }) : _outlineSignature = Object.hashAll(
          outlines
              .map((outline) => '${outline.regionId}:${outline.status.name}'),
        );

  final MapCamera camera;
  final List<SharedRegionOutline> outlines;
  final int revision;
  final int _outlineSignature;

  @override
  void paint(Canvas canvas, Size size) {
    for (final outline in outlines) {
      final path = ui.Path();
      final offsets = outline.points
          .map(camera.latLngToScreenOffset)
          .toList(growable: false);
      if (offsets.length < 3) {
        continue;
      }

      path.moveTo(offsets.first.dx, offsets.first.dy);
      for (final offset in offsets.skip(1)) {
        path.lineTo(offset.dx, offset.dy);
      }
      path.close();

      final fillColor = switch (outline.status) {
        SharedRegionStatus.syncing => const Color(0x1FB58A47),
        SharedRegionStatus.synced => const Color(0x14247C66),
        SharedRegionStatus.available => const Color(0x0A1B2024),
      };
      final borderColor = switch (outline.status) {
        SharedRegionStatus.syncing => const Color(0xE6F0D39B),
        SharedRegionStatus.synced => const Color(0xCC92D5BE),
        SharedRegionStatus.available => const Color(0x88C7AF7A),
      };

      canvas.drawPath(
        path,
        Paint()
          ..style = PaintingStyle.fill
          ..color = fillColor,
      );

      final borderPaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = outline.status == SharedRegionStatus.syncing ? 2.4 : 1.6
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..color = borderColor;

      if (outline.status == SharedRegionStatus.available) {
        _drawDashedPath(canvas, path, borderPaint,
            dashLength: 12, gapLength: 8);
      } else {
        canvas.drawPath(path, borderPaint);
      }

      if (outline.status == SharedRegionStatus.syncing) {
        canvas.drawPath(
          path,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 4.8
            ..color = const Color(0x2EF0D39B)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
        );
      }
    }
  }

  void _drawDashedPath(
    Canvas canvas,
    ui.Path path,
    Paint paint, {
    required double dashLength,
    required double gapLength,
  }) {
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        final next = math.min(distance + dashLength, metric.length);
        canvas.drawPath(metric.extractPath(distance, next), paint);
        distance += dashLength + gapLength;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _SharedRegionOutlinePainter oldDelegate) {
    return oldDelegate._outlineSignature != _outlineSignature ||
        oldDelegate.revision != revision ||
        oldDelegate.camera.center != camera.center ||
        oldDelegate.camera.zoom != camera.zoom ||
        oldDelegate.camera.rotation != camera.rotation;
  }
}
