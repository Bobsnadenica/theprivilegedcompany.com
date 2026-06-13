import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';

import 'package:fog_frontier/cloud/models/landmark_models.dart';
import 'package:fog_frontier/core/utils/armory_model_composer.dart';
import 'package:fog_frontier/core/constants/app_constants.dart';
import 'package:fog_frontier/core/utils/armory_progression.dart';
import 'package:fog_frontier/core/utils/discovery_math.dart';
import 'package:fog_frontier/core/utils/journey_insights.dart';
import 'package:fog_frontier/core/utils/stat_formatters.dart';
import 'package:fog_frontier/data/models/achievement.dart';
import 'package:fog_frontier/data/models/player_profile.dart';
import 'package:fog_frontier/data/models/reveal_point.dart';
import 'package:fog_frontier/services/location_search_service.dart';

void main() {
  test('DiscoveryMath returns stable reveal data', () {
    const point = LatLng(42.6977, 23.3219);
    const radiusMeters = AppConstants.discoveryRadiusMeters;
    const cellDegrees = AppConstants.statsCellDegrees;

    final first = DiscoveryMath.cellsForRevealData(
      point: point,
      radiusMeters: radiusMeters,
      cellDegrees: cellDegrees,
    );
    final second = DiscoveryMath.cellsForRevealData(
      point: point,
      radiusMeters: radiusMeters,
      cellDegrees: cellDegrees,
    );

    expect(first, isNotEmpty);
    expect(first, equals(second));
  });

  test('DiscoveryMath always includes the containing cell', () {
    const point = LatLng(42.697743, 23.321965);
    const cellDegrees = AppConstants.statsCellDegrees;

    final cells = DiscoveryMath.cellsForRevealData(
      point: point,
      radiusMeters: AppConstants.discoveryRadiusMeters,
      cellDegrees: cellDegrees,
    );

    expect(
      cells.map((cell) => cell.cellId),
      contains(DiscoveryMath.cellIdFromLatLng(point, cellDegrees)),
    );
  });

  test('DiscoveryMath fills cells across a walked segment', () {
    const start = LatLng(42.6977, 23.3219);
    const end = LatLng(42.6977, 23.3224);
    const cellDegrees = AppConstants.statsCellDegrees;

    final cells = DiscoveryMath.cellsForPathSegmentData(
      start: start,
      end: end,
      radiusMeters: AppConstants.discoveryRadiusMeters,
      cellDegrees: cellDegrees,
    );

    expect(cells.length, greaterThan(2));
    expect(
      cells.map((cell) => cell.cellId),
      contains(DiscoveryMath.cellIdFromLatLng(start, cellDegrees)),
    );
    expect(
      cells.map((cell) => cell.cellId),
      contains(DiscoveryMath.cellIdFromLatLng(end, cellDegrees)),
    );
  });

  test('DiscoveryMath path segment does not widen into adjacent rows', () {
    const start = LatLng(42.6977, 23.3219);
    const end = LatLng(42.6977, 23.3228);
    const cellDegrees = AppConstants.statsCellDegrees;

    final cells = DiscoveryMath.cellsForPathSegmentData(
      start: start,
      end: end,
      radiusMeters: AppConstants.discoveryRadiusMeters,
      cellDegrees: cellDegrees,
    );

    final latIndexes =
        cells.map((cell) => int.parse(cell.cellId.split(':').first)).toSet();

    expect(latIndexes.length, 1);
  });

  test('Discovery cell id round-trip is consistent', () {
    const point = LatLng(42.6977, 23.3219);
    const cellDegrees = AppConstants.statsCellDegrees;

    final cellId = DiscoveryMath.cellIdFromLatLng(point, cellDegrees);
    final center = DiscoveryMath.cellCenterFromId(cellId, cellDegrees);
    final roundTrip = DiscoveryMath.cellIdFromLatLng(center, cellDegrees);

    expect(roundTrip, cellId);
  });

  test('Shared viewport cache key is stable within the same tile range', () {
    final first = DiscoveryMath.sharedViewportCacheKey(
      minLat: 42.6968,
      maxLat: 42.6988,
      minLon: 23.3205,
      maxLon: 23.3231,
      mapZoom: 17,
    );
    final second = DiscoveryMath.sharedViewportCacheKey(
      minLat: 42.6969,
      maxLat: 42.6987,
      minLon: 23.3206,
      maxLon: 23.3230,
      mapZoom: 17,
    );

    expect(second, first);
  });

  test('DiscoveryMath does not bridge long GPS gaps', () {
    const start = LatLng(42.6977, 23.3219);
    const end = LatLng(42.7077, 23.3319);

    final shouldBridge = DiscoveryMath.shouldBridgeReveals(
      start: start,
      startTimestamp: DateTime.parse('2026-03-10T08:00:00Z'),
      end: end,
      endTimestamp: DateTime.parse('2026-03-10T08:03:30Z'),
    );

    expect(shouldBridge, isFalse);
  });

  test('Landmark upload ticket parses uploadFieldsJson payload', () {
    final ticket = LandmarkUploadTicket.fromJson({
      'landmarkId': 'landmark-123',
      'uploadToken': 'token-123',
      'objectKey': 'user/landmark/original.jpg',
      'uploadUrl': 'https://example.com/upload',
      'uploadFieldsJson': '{"key":"value","x-amz-meta-user-id":"u1"}',
      'expiresAt': '2026-03-10T12:00:00Z',
      'maxBytes': 5242880,
    });

    expect(ticket.uploadFields['key'], 'value');
    expect(ticket.uploadFields['x-amz-meta-user-id'], 'u1');
    expect(ticket.maxBytes, 5242880);
  });

  test('Landmark upload ticket parses double-encoded uploadFieldsJson', () {
    final ticket = LandmarkUploadTicket.fromJson({
      'landmarkId': 'landmark-123',
      'uploadToken': 'token-123',
      'objectKey': 'user/landmark/original.jpg',
      'uploadUrl': 'https://example.com/upload',
      'uploadFieldsJson': '"{\\"key\\":\\"value\\",\\"policy\\":\\"abc\\"}"',
      'expiresAt': '2026-03-10T12:00:00Z',
      'maxBytes': 5242880,
    });

    expect(ticket.uploadFields['key'], 'value');
    expect(ticket.uploadFields['policy'], 'abc');
  });

  test('JourneyInsights groups reveal points into expeditions by time gap', () {
    final profile = PlayerProfile.createEmpty().copyWith(
      reveals: const [
        RevealPoint(
          latitude: 42.6977,
          longitude: 23.3219,
          discoveredAtIso: '2026-03-10T08:00:00Z',
        ),
        RevealPoint(
          latitude: 42.6978,
          longitude: 23.3221,
          discoveredAtIso: '2026-03-10T08:10:00Z',
        ),
        RevealPoint(
          latitude: 42.6982,
          longitude: 23.3230,
          discoveredAtIso: '2026-03-10T11:30:00Z',
        ),
      ],
    );

    final insights = JourneyInsights.fromProfile(profile);

    expect(insights.expeditions.length, 2);
    expect(insights.activeDays, 1);
    expect(insights.expeditions.first.revealCount, 1);
    expect(insights.expeditions.last.revealCount, 2);
  });

  test('JourneyInsights computes active days across multiple dates', () {
    final profile = PlayerProfile.createEmpty().copyWith(
      reveals: const [
        RevealPoint(
          latitude: 42.6977,
          longitude: 23.3219,
          discoveredAtIso: '2026-03-10T08:00:00Z',
        ),
        RevealPoint(
          latitude: 42.6978,
          longitude: 23.3221,
          discoveredAtIso: '2026-03-11T08:10:00Z',
        ),
      ],
    );

    final insights = JourneyInsights.fromProfile(profile);

    expect(insights.expeditions.length, 2);
    expect(insights.activeDays, 2);
    expect(insights.longestExpeditionMeters, 0);
  });

  test('JourneyInsights does not infer subway tunnels as straight paths', () {
    final profile = PlayerProfile.createEmpty().copyWith(
      reveals: const [
        RevealPoint(
          latitude: 42.6977,
          longitude: 23.3219,
          discoveredAtIso: '2026-03-10T08:00:00Z',
        ),
        RevealPoint(
          latitude: 42.7077,
          longitude: 23.3319,
          discoveredAtIso: '2026-03-10T08:03:30Z',
        ),
      ],
    );

    final insights = JourneyInsights.fromProfile(profile);

    expect(insights.expeditions.length, 1);
    expect(insights.expeditions.single.distanceMeters, 0);
  });

  test('PlayerProfile defaults new armory fields for older saved profiles', () {
    final profile = PlayerProfile.fromJson({
      'id': 'legacy-user',
      'displayName': 'Legacy',
      'profileIcon': '🛡️',
      'createdAtIso': '2026-03-10T08:00:00Z',
      'updatedAtIso': '2026-03-10T08:00:00Z',
      'reveals': const [],
      'discoveredCells': const <String>[],
      'totalDistanceMeters': 0,
      'hasSeenMapGuide': true,
    });

    expect(profile.heroArchetypeId, 'wayfarer');
    expect(profile.hairColorId, 'ember');
    expect(profile.gearVisibilityBySlot, isEmpty);
  });

  test('Armory progression builds a levelled loadout from travel progress', () {
    final profile = PlayerProfile.createEmpty(
      id: 'hero-user',
      displayName: 'Hero',
    ).copyWith(
      heroArchetypeId: 'seer',
      hairColorId: 'frost',
      totalDistanceMeters: 58000,
      discoveredCells: Set<String>.from(
        List<String>.generate(140, (index) => '$index:${index + 1}'),
      ),
      reveals: List<RevealPoint>.generate(
        80,
        (index) => RevealPoint(
          latitude: 42.6977 + (index * 0.0001),
          longitude: 23.3219 + (index * 0.0001),
          discoveredAtIso:
              '2026-03-10T08:${(index % 60).toString().padLeft(2, '0')}:00Z',
        ),
      ),
    );

    final progression = ArmoryProgressionBuilder.build(
      profile: profile,
      journeyInsights: JourneyInsights.fromProfile(profile),
      achievements: AchievementCatalog.build(profile),
    );

    expect(progression.level, greaterThan(1));
    expect(progression.loadout.where((slot) => slot.isUnlocked).length,
        greaterThan(2));
    expect(progression.equippedItemCount, greaterThan(2));
    expect(progression.stats.map((stat) => stat.label), contains('Discovery'));
  });

  test('Armory progression respects hidden collected gear slots', () {
    final profile = PlayerProfile.createEmpty(
      id: 'hero-user',
      displayName: 'Hero',
    ).copyWith(
      totalDistanceMeters: 58000,
      gearVisibilityBySlot: const {
        'head': false,
        'main_hand': false,
      },
      discoveredCells: Set<String>.from(
        List<String>.generate(140, (index) => '$index:${index + 1}'),
      ),
      reveals: List<RevealPoint>.generate(
        80,
        (index) => RevealPoint(
          latitude: 42.6977 + (index * 0.0001),
          longitude: 23.3219 + (index * 0.0001),
          discoveredAtIso:
              '2026-03-10T08:${(index % 60).toString().padLeft(2, '0')}:00Z',
        ),
      ),
    );

    final progression = ArmoryProgressionBuilder.build(
      profile: profile,
      journeyInsights: JourneyInsights.fromProfile(profile),
      achievements: AchievementCatalog.build(profile),
    );
    final headSlot =
        progression.loadout.firstWhere((slot) => slot.slotId == 'head');
    final mainHandSlot =
        progression.loadout.firstWhere((slot) => slot.slotId == 'main_hand');

    expect(headSlot.isUnlocked, isTrue);
    expect(headSlot.isEquipped, isFalse);
    expect(mainHandSlot.isUnlocked, isTrue);
    expect(mainHandSlot.isEquipped, isFalse);
  });

  test('Armory model composer renders the warden outfit with hood + pauldron',
      () async {
    TestWidgetsFlutterBinding.ensureInitialized();

    final bundle = await ArmoryModelComposer.compose(
      heroPresetId: 'warden',
      loadout: const [
        ArmoryInventorySlotState(
          slotId: 'head',
          label: 'Head',
          item: ArmoryInventoryItem(
            name: 'Pathfinder Headpiece',
            rarity: 'Common',
            source: 'Trail Scout',
            summary: 'Head gear.',
          ),
          isEquipped: true,
          lockedHint: '',
        ),
        ArmoryInventorySlotState(
          slotId: 'mantle',
          label: 'Mantle',
          item: ArmoryInventoryItem(
            name: 'Wayfinder Mantle',
            rarity: 'Common',
            source: 'Pathfinder',
            summary: 'Shoulder gear.',
          ),
          isEquipped: true,
          lockedHint: '',
        ),
      ],
      accentColorFactor: const [0.72, 0.62, 0.44, 1.0],
      glowColorFactor: const [0.18, 0.42, 0.56, 1.0],
    );

    final document = jsonDecode(bundle.modelJson) as Map<String, dynamic>;

    expect(_isNodeReachableFromScene(document, 'Male_Ranger_Body'), isTrue);
    expect(_isNodeReachableFromScene(document, 'Male_Ranger_Head_Hood'), isTrue);
    expect(
        _isNodeReachableFromScene(document, 'Male_Ranger_Acc_Pauldron'), isTrue);
    expect(bundle.inlineAssets, isNotEmpty);
  });

  test('Armory model composer hides the hood when head slot is locked',
      () async {
    TestWidgetsFlutterBinding.ensureInitialized();

    final bundle = await ArmoryModelComposer.compose(
      heroPresetId: 'warden',
      loadout: const [
        ArmoryInventorySlotState(
          slotId: 'head',
          label: 'Head',
          item: null,
          isEquipped: false,
          lockedHint: '',
        ),
        ArmoryInventorySlotState(
          slotId: 'mantle',
          label: 'Mantle',
          item: null,
          isEquipped: false,
          lockedHint: '',
        ),
      ],
      accentColorFactor: const [0.72, 0.62, 0.44, 1.0],
      glowColorFactor: const [0.18, 0.42, 0.56, 1.0],
    );

    final document = jsonDecode(bundle.modelJson) as Map<String, dynamic>;

    // Body still renders even with head/mantle hidden — that's the whole
    // point of the per-archetype outfits: the character is never headless.
    expect(_isNodeReachableFromScene(document, 'Male_Ranger_Body'), isTrue);
    expect(_isNodeReachableFromScene(document, 'Male_Ranger_Head_Hood'), isFalse);
    expect(_isNodeReachableFromScene(document, 'Male_Ranger_Acc_Pauldron'),
        isFalse);
  });

  test('StatFormatters percent expands precision for tiny non-zero values', () {
    expect(
      StatFormatters.percent(0.0000000025, fractionDigits: 6),
      '0.0000000025%',
    );
  });

  test('StatFormatters percent preserves regular precision for normal values',
      () {
    expect(
      StatFormatters.percent(12.3456789, fractionDigits: 2),
      '12.35%',
    );
  });

  test('LocationSearchResult formats city search payload', () {
    final result = LocationSearchResult.fromJson({
      'lat': '42.6977',
      'lon': '23.3219',
      'type': 'city',
      'display_name': 'Sofia, Sofia City Province, Bulgaria',
      'address': {
        'city': 'Sofia',
        'state': 'Sofia City Province',
        'country': 'Bulgaria',
      },
    });

    expect(result.label, 'Sofia');
    expect(result.subtitle, 'Sofia City Province, Bulgaria');
    expect(result.latitude, closeTo(42.6977, 0.00001));
    expect(result.longitude, closeTo(23.3219, 0.00001));
    expect(result.type, 'city');
  });
}

bool _isNodeReachableFromScene(Map<String, dynamic> document, String nodeName) {
  final nodes = document['nodes'] as List<dynamic>? ?? const [];
  final sceneIndex = document['scene'] as int? ?? 0;
  final scenes = document['scenes'] as List<dynamic>? ?? const [];
  if (sceneIndex < 0 || sceneIndex >= scenes.length) {
    return false;
  }

  final scene = scenes[sceneIndex] as Map<String, dynamic>;
  final roots = scene['nodes'] as List<dynamic>? ?? const [];
  final visited = <int>{};

  bool visit(int nodeIndex) {
    if (nodeIndex < 0 || nodeIndex >= nodes.length || !visited.add(nodeIndex)) {
      return false;
    }
    final node = nodes[nodeIndex] as Map<String, dynamic>;
    if (node['name'] == nodeName) {
      return true;
    }
    for (final child in node['children'] as List<dynamic>? ?? const []) {
      if (visit(child as int)) {
        return true;
      }
    }
    return false;
  }

  return roots.any((nodeIndex) => visit(nodeIndex as int));
}
