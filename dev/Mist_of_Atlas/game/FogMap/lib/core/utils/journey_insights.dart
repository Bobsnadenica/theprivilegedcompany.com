import 'package:latlong2/latlong.dart';

import '../../core/constants/app_constants.dart';
import '../../data/models/player_profile.dart';
import '../../data/models/reveal_point.dart';
import 'discovery_math.dart';

class ExpeditionSession {
  const ExpeditionSession({
    required this.startedAt,
    required this.endedAt,
    required this.revealCount,
    required this.discoveredCellCount,
    required this.distanceMeters,
  });

  final DateTime startedAt;
  final DateTime endedAt;
  final int revealCount;
  final int discoveredCellCount;
  final double distanceMeters;

  Duration get duration => endedAt.difference(startedAt);
}

class JourneyInsights {
  const JourneyInsights({
    required this.expeditions,
    required this.activeDays,
    required this.maxConsecutiveDays,
    required this.longestExpeditionMeters,
    required this.averageExpeditionMeters,
  });

  final List<ExpeditionSession> expeditions;
  final int activeDays;

  /// Longest unbroken run of consecutive calendar days (UTC) with at least
  /// one reveal. Used by streak-based deeds.
  final int maxConsecutiveDays;

  final double longestExpeditionMeters;
  final double averageExpeditionMeters;

  ExpeditionSession? get latestExpedition =>
      expeditions.isEmpty ? null : expeditions.first;

  static JourneyInsights fromProfile(PlayerProfile profile) {
    final entries = profile.reveals
        .map(_ExpeditionEntry.tryFromReveal)
        .whereType<_ExpeditionEntry>()
        .toList(growable: false)
      ..sort((a, b) => a.timestamp.compareTo(b.timestamp));

    if (entries.isEmpty) {
      return const JourneyInsights(
        expeditions: <ExpeditionSession>[],
        activeDays: 0,
        maxConsecutiveDays: 0,
        longestExpeditionMeters: 0,
        averageExpeditionMeters: 0,
      );
    }

    final sessions = <List<_ExpeditionEntry>>[];
    var current = <_ExpeditionEntry>[];

    for (final entry in entries) {
      if (current.isEmpty) {
        current = <_ExpeditionEntry>[entry];
        continue;
      }

      final previous = current.last;
      final gap = entry.timestamp.difference(previous.timestamp);
      if (gap > const Duration(minutes: 90)) {
        sessions.add(current);
        current = <_ExpeditionEntry>[entry];
        continue;
      }

      current.add(entry);
    }

    if (current.isNotEmpty) {
      sessions.add(current);
    }

    final expeditions = sessions
        .map(_sessionFromEntries)
        .toList(growable: false)
      ..sort((a, b) => b.startedAt.compareTo(a.startedAt));

    final activeDays = entries
        .map((entry) {
          final utc = entry.timestamp.toUtc();
          return '${utc.year}-${utc.month}-${utc.day}';
        })
        .toSet()
        .length;

    final maxConsecutiveDays = _maxConsecutiveDays(entries);

    final longestExpeditionMeters = expeditions.fold<double>(
      0,
      (longest, expedition) => expedition.distanceMeters > longest
          ? expedition.distanceMeters
          : longest,
    );

    final totalMeters = expeditions.fold<double>(
      0,
      (sum, expedition) => sum + expedition.distanceMeters,
    );

    final averageExpeditionMeters = expeditions.isEmpty
        ? 0.0
        : (totalMeters / expeditions.length).toDouble();

    return JourneyInsights(
      expeditions: expeditions,
      activeDays: activeDays,
      maxConsecutiveDays: maxConsecutiveDays,
      longestExpeditionMeters: longestExpeditionMeters,
      averageExpeditionMeters: averageExpeditionMeters,
    );
  }

  static int _maxConsecutiveDays(List<_ExpeditionEntry> entries) {
    final days = entries
        .map((e) {
          final utc = e.timestamp.toUtc();
          return DateTime.utc(utc.year, utc.month, utc.day);
        })
        .toSet()
        .toList()
      ..sort();

    if (days.isEmpty) return 0;
    var maxStreak = 1;
    var streak = 1;
    for (var i = 1; i < days.length; i++) {
      if (days[i].difference(days[i - 1]).inDays == 1) {
        streak++;
        if (streak > maxStreak) maxStreak = streak;
      } else {
        streak = 1;
      }
    }
    return maxStreak;
  }

  static ExpeditionSession _sessionFromEntries(List<_ExpeditionEntry> entries) {
    final cellIds = <String>{};
    final distance = const Distance();
    var distanceMeters = 0.0;

    for (var index = 0; index < entries.length; index++) {
      final entry = entries[index];
      if (index == 0) {
        final cells = DiscoveryMath.cellsForRevealData(
          point: entry.point,
          radiusMeters: AppConstants.discoveryRadiusMeters,
          cellDegrees: AppConstants.statsCellDegrees,
        );
        cellIds.addAll(cells.map((cell) => cell.cellId));
        continue;
      }

      final previous = entries[index - 1];
      final shouldBridge = DiscoveryMath.shouldBridgeReveals(
        start: previous.point,
        startTimestamp: previous.timestamp,
        end: entry.point,
        endTimestamp: entry.timestamp,
      );
      if (shouldBridge) {
        distanceMeters += distance(previous.point, entry.point);
      }
      final cells = shouldBridge
          ? DiscoveryMath.cellsForPathSegmentData(
              start: previous.point,
              end: entry.point,
              radiusMeters: AppConstants.discoveryRadiusMeters,
              cellDegrees: AppConstants.statsCellDegrees,
            )
          : DiscoveryMath.cellsForRevealData(
              point: entry.point,
              radiusMeters: AppConstants.discoveryRadiusMeters,
              cellDegrees: AppConstants.statsCellDegrees,
            );
      cellIds.addAll(cells.map((cell) => cell.cellId));
    }

    return ExpeditionSession(
      startedAt: entries.first.timestamp,
      endedAt: entries.last.timestamp,
      revealCount: entries.length,
      discoveredCellCount: cellIds.length,
      distanceMeters: distanceMeters,
    );
  }
}

class _ExpeditionEntry {
  const _ExpeditionEntry({
    required this.point,
    required this.timestamp,
  });

  final LatLng point;
  final DateTime timestamp;

  static _ExpeditionEntry? tryFromReveal(RevealPoint reveal) {
    final timestamp = DateTime.tryParse(reveal.discoveredAtIso)?.toUtc();
    if (timestamp == null) {
      return null;
    }
    return _ExpeditionEntry(
      point: LatLng(reveal.latitude, reveal.longitude),
      timestamp: timestamp,
    );
  }
}
