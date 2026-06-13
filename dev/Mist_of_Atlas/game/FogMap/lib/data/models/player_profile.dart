import '../../core/constants/profile_icon_catalog.dart';
import 'reveal_point.dart';

class PlayerProfile {
  PlayerProfile({
    required this.id,
    required this.displayName,
    required this.profileIcon,
    required this.heroArchetypeId,
    required this.hairColorId,
    required this.gearVisibilityBySlot,
    required this.createdAtIso,
    required this.updatedAtIso,
    required this.reveals,
    required this.discoveredCells,
    required this.totalDistanceMeters,
    required this.hasSeenMapGuide,
    this.lastCloudBootstrapAtIso,
    this.lastLatitude,
    this.lastLongitude,
    this.acknowledgedAchievementIds = const <String>{},
  });

  final String id;
  final String displayName;
  final String profileIcon;
  final String heroArchetypeId;
  final String hairColorId;
  final Map<String, bool> gearVisibilityBySlot;
  final String createdAtIso;
  final String updatedAtIso;
  final List<RevealPoint> reveals;
  final Set<String> discoveredCells;
  final double totalDistanceMeters;
  final bool hasSeenMapGuide;
  final String? lastCloudBootstrapAtIso;
  final double? lastLatitude;
  final double? lastLongitude;

  /// Achievement IDs the player has already been notified about. Used to
  /// detect locked → unlocked transitions and surface a toast / unlock
  /// celebration without spamming the player every time the controller
  /// rebuilds the achievement list.
  final Set<String> acknowledgedAchievementIds;

  /// Sentinel allowing callers to clear nullable fields via [copyWith].
  /// Using `Object()` avoids needing an `_unset` flag per field while still
  /// letting the caller distinguish "leave alone" (omit) from "set to null"
  /// (pass `null`). Internally we wrap in [_Optional] for this behaviour.
  PlayerProfile copyWith({
    String? id,
    String? displayName,
    String? profileIcon,
    String? heroArchetypeId,
    String? hairColorId,
    Map<String, bool>? gearVisibilityBySlot,
    String? createdAtIso,
    String? updatedAtIso,
    List<RevealPoint>? reveals,
    Set<String>? discoveredCells,
    double? totalDistanceMeters,
    bool? hasSeenMapGuide,
    Object? lastCloudBootstrapAtIso = _unset,
    Object? lastLatitude = _unset,
    Object? lastLongitude = _unset,
    Set<String>? acknowledgedAchievementIds,
  }) {
    return PlayerProfile(
      id: id ?? this.id,
      displayName: displayName ?? this.displayName,
      profileIcon: profileIcon ?? this.profileIcon,
      heroArchetypeId: heroArchetypeId ?? this.heroArchetypeId,
      hairColorId: hairColorId ?? this.hairColorId,
      gearVisibilityBySlot: gearVisibilityBySlot ?? this.gearVisibilityBySlot,
      createdAtIso: createdAtIso ?? this.createdAtIso,
      updatedAtIso: updatedAtIso ?? this.updatedAtIso,
      reveals: reveals ?? this.reveals,
      discoveredCells: discoveredCells ?? this.discoveredCells,
      totalDistanceMeters: totalDistanceMeters ?? this.totalDistanceMeters,
      hasSeenMapGuide: hasSeenMapGuide ?? this.hasSeenMapGuide,
      lastCloudBootstrapAtIso: identical(lastCloudBootstrapAtIso, _unset)
          ? this.lastCloudBootstrapAtIso
          : lastCloudBootstrapAtIso as String?,
      lastLatitude: identical(lastLatitude, _unset)
          ? this.lastLatitude
          : (lastLatitude as num?)?.toDouble(),
      lastLongitude: identical(lastLongitude, _unset)
          ? this.lastLongitude
          : (lastLongitude as num?)?.toDouble(),
      acknowledgedAchievementIds:
          acknowledgedAchievementIds ?? this.acknowledgedAchievementIds,
    );
  }

  static const Object _unset = Object();

  Map<String, dynamic> toJson() => {
        'id': id,
        'displayName': displayName,
        'profileIcon': profileIcon,
        'heroArchetypeId': heroArchetypeId,
        'hairColorId': hairColorId,
        'gearVisibilityBySlot': gearVisibilityBySlot,
        'createdAtIso': createdAtIso,
        'updatedAtIso': updatedAtIso,
        'reveals': reveals.map((e) => e.toJson()).toList(),
        'discoveredCells': discoveredCells.toList()..sort(),
        'totalDistanceMeters': totalDistanceMeters,
        'hasSeenMapGuide': hasSeenMapGuide,
        'lastCloudBootstrapAtIso': lastCloudBootstrapAtIso,
        'lastLatitude': lastLatitude,
        'lastLongitude': lastLongitude,
        'acknowledgedAchievementIds': acknowledgedAchievementIds.toList()
          ..sort(),
      };

  factory PlayerProfile.fromJson(Map<String, dynamic> json) {
    return PlayerProfile(
      id: json['id'] as String? ?? 'local-player',
      displayName: json['displayName'] as String? ?? 'Adventurer',
      profileIcon:
          json['profileIcon'] as String? ?? ProfileIconCatalog.defaultIcon,
      heroArchetypeId: json['heroArchetypeId'] as String? ?? 'wayfarer',
      hairColorId: json['hairColorId'] as String? ?? 'ember',
      gearVisibilityBySlot:
          ((json['gearVisibilityBySlot'] as Map<dynamic, dynamic>?) ??
                  const <dynamic, dynamic>{})
              .map(
        (key, value) => MapEntry(
          key.toString(),
          value is bool ? value : value != false,
        ),
      ),
      createdAtIso: json['createdAtIso'] as String? ??
          DateTime.now().toUtc().toIso8601String(),
      updatedAtIso: json['updatedAtIso'] as String? ??
          DateTime.now().toUtc().toIso8601String(),
      reveals: ((json['reveals'] as List<dynamic>?) ?? const <dynamic>[])
          .map((e) => RevealPoint.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      discoveredCells:
          ((json['discoveredCells'] as List<dynamic>?) ?? const <dynamic>[])
              .map((e) => e.toString())
              .toSet(),
      totalDistanceMeters:
          (json['totalDistanceMeters'] as num?)?.toDouble() ?? 0,
      hasSeenMapGuide: json['hasSeenMapGuide'] as bool? ?? false,
      lastCloudBootstrapAtIso: json['lastCloudBootstrapAtIso'] as String?,
      lastLatitude: (json['lastLatitude'] as num?)?.toDouble(),
      lastLongitude: (json['lastLongitude'] as num?)?.toDouble(),
      acknowledgedAchievementIds:
          ((json['acknowledgedAchievementIds'] as List<dynamic>?) ??
                  const <dynamic>[])
              .map((e) => e.toString())
              .toSet(),
    );
  }

  static PlayerProfile createEmpty({
    String id = 'local-player',
    String displayName = 'Adventurer',
    String profileIcon = ProfileIconCatalog.defaultIcon,
    String heroArchetypeId = 'wayfarer',
    String hairColorId = 'ember',
  }) {
    final now = DateTime.now().toUtc().toIso8601String();
    return PlayerProfile(
      id: id,
      displayName: displayName,
      profileIcon: profileIcon,
      heroArchetypeId: heroArchetypeId,
      hairColorId: hairColorId,
      gearVisibilityBySlot: const <String, bool>{},
      createdAtIso: now,
      updatedAtIso: now,
      reveals: const [],
      discoveredCells: <String>{},
      totalDistanceMeters: 0,
      hasSeenMapGuide: false,
    );
  }

  bool isGearSlotVisible(String slotId) {
    return gearVisibilityBySlot[slotId] ?? true;
  }
}
