import '../../data/models/achievement.dart';
import '../../data/models/player_profile.dart';
import 'journey_insights.dart';

class ArmoryHeroPreset {
  const ArmoryHeroPreset({
    required this.id,
    required this.name,
    required this.role,
    required this.tagline,
  });

  final String id;
  final String name;
  final String role;
  final String tagline;
}

class ArmoryHairTone {
  const ArmoryHairTone({
    required this.id,
    required this.name,
  });

  final String id;
  final String name;
}

class ArmoryInventoryItem {
  const ArmoryInventoryItem({
    required this.name,
    required this.rarity,
    required this.source,
    required this.summary,
    this.unlockedByAchievementId,
  });

  final String name;
  final String rarity;
  final String source;
  final String summary;

  /// The achievement ID whose unlock awards this item. `null` for slots that
  /// are gated by a different mechanic (e.g. random rare finds).
  final String? unlockedByAchievementId;
}

class ArmoryInventorySlotState {
  const ArmoryInventorySlotState({
    required this.slotId,
    required this.label,
    required this.item,
    required this.isEquipped,
    required this.lockedHint,
  });

  final String slotId;
  final String label;
  final ArmoryInventoryItem? item;
  final bool isEquipped;
  final String lockedHint;

  bool get isUnlocked => item != null;
}

class ArmoryStatLine {
  const ArmoryStatLine({
    required this.label,
    required this.value,
    required this.flavor,
  });

  final String label;
  final int value;
  final String flavor;
}

class ArmoryProgression {
  const ArmoryProgression({
    required this.title,
    required this.level,
    required this.totalXp,
    required this.currentLevelXp,
    required this.nextLevelXp,
    required this.armoryScore,
    required this.rareFindCount,
    required this.unlockedAchievementCount,
    required this.equippedItemCount,
    required this.stats,
    required this.loadout,
  });

  final String title;
  final int level;
  final int totalXp;
  final int currentLevelXp;
  final int nextLevelXp;
  final int armoryScore;
  final int rareFindCount;
  final int unlockedAchievementCount;
  final int equippedItemCount;
  final List<ArmoryStatLine> stats;
  final List<ArmoryInventorySlotState> loadout;

  double get levelProgress {
    if (nextLevelXp <= 0) return 1;
    final ratio = currentLevelXp / nextLevelXp;
    if (ratio < 0) return 0;
    if (ratio > 1) return 1;
    return ratio;
  }
}

class ArmoryProgressionBuilder {
  static const List<ArmoryHeroPreset> heroPresets = [
    ArmoryHeroPreset(
      id: 'wayfarer',
      name: 'Wayfarer',
      role: 'Balanced explorer',
      tagline: 'A patient scout who turns distance into wisdom.',
    ),
    ArmoryHeroPreset(
      id: 'warden',
      name: 'Warden',
      role: 'Realm bulwark',
      tagline: 'An armored sentinel built for long roads and harder weather.',
    ),
    ArmoryHeroPreset(
      id: 'seer',
      name: 'Seer',
      role: 'Mystic cartographer',
      tagline: 'A lore-keeper who senses meaning in every route.',
    ),
    ArmoryHeroPreset(
      id: 'rider',
      name: 'Rider',
      role: 'Outrider scout',
      tagline: 'A fast-moving pathfinder who lives at the edge of the map.',
    ),
  ];

  static const List<ArmoryHairTone> hairTones = [
    ArmoryHairTone(id: 'ember', name: 'Ember'),
    ArmoryHairTone(id: 'raven', name: 'Raven'),
    ArmoryHairTone(id: 'frost', name: 'Frost'),
    ArmoryHairTone(id: 'moss', name: 'Moss'),
    ArmoryHairTone(id: 'sunrise', name: 'Sunrise'),
  ];

  static ArmoryHeroPreset heroPresetById(String id) {
    for (final preset in heroPresets) {
      if (preset.id == id) return preset;
    }
    return heroPresets.first;
  }

  static ArmoryHairTone hairToneById(String id) {
    for (final tone in hairTones) {
      if (tone.id == id) return tone;
    }
    return hairTones.first;
  }

  static ArmoryProgression build({
    required PlayerProfile profile,
    required JourneyInsights journeyInsights,
    required List<Achievement> achievements,
  }) {
    final unlockedAchievements =
        achievements.where((item) => item.isUnlocked).toList(growable: false);
    final unlockedAchievementCount = unlockedAchievements.length;
    final unlockedAchievementIds =
        unlockedAchievements.map((item) => item.id).toSet();
    final totalXp = _totalXpFor(
      profile: profile,
      journeyInsights: journeyInsights,
      unlockedAchievementCount: unlockedAchievementCount,
    );

    var level = 1;
    var xpIntoCurrentLevel = totalXp;
    var nextLevelXp = 260;
    while (xpIntoCurrentLevel >= nextLevelXp && level < 60) {
      xpIntoCurrentLevel -= nextLevelXp;
      level += 1;
      nextLevelXp = ((nextLevelXp * 1.14) + 22).round();
    }

    final stats = _buildStats(
      profile: profile,
      journeyInsights: journeyInsights,
      unlockedAchievementCount: unlockedAchievementCount,
      level: level,
    );
    final loadout = _buildLoadout(
      profile: profile,
      journeyInsights: journeyInsights,
      unlockedAchievementCount: unlockedAchievementCount,
      unlockedAchievementIds: unlockedAchievementIds,
    );
    final rareFindCount =
        loadout.where((slot) => slot.item?.rarity == 'Legendary').length;
    final equippedItemCount = loadout.where((slot) => slot.isEquipped).length;
    final unlockedItemCount = loadout.where((slot) => slot.isUnlocked).length;
    final armoryScore = (level * 12) +
        (unlockedAchievementCount * 8) +
        (unlockedItemCount * 14);

    return ArmoryProgression(
      title: _titleFor(
        level: level,
        unlockedAchievementCount: unlockedAchievementCount,
        rareFindCount: rareFindCount,
      ),
      level: level,
      totalXp: totalXp,
      currentLevelXp: xpIntoCurrentLevel,
      nextLevelXp: nextLevelXp,
      armoryScore: armoryScore,
      rareFindCount: rareFindCount,
      unlockedAchievementCount: unlockedAchievementCount,
      equippedItemCount: equippedItemCount,
      stats: stats,
      loadout: loadout,
    );
  }

  static int _totalXpFor({
    required PlayerProfile profile,
    required JourneyInsights journeyInsights,
    required int unlockedAchievementCount,
  }) {
    final km = profile.totalDistanceMeters / 1000.0;
    return ((km * 120).round()) +
        (profile.discoveredCells.length * 18) +
        (journeyInsights.expeditions.length * 34) +
        (journeyInsights.activeDays * 42) +
        (profile.reveals.length * 4) +
        (unlockedAchievementCount * 85);
  }

  static List<ArmoryStatLine> _buildStats({
    required PlayerProfile profile,
    required JourneyInsights journeyInsights,
    required int unlockedAchievementCount,
    required int level,
  }) {
    final km = profile.totalDistanceMeters / 1000.0;
    return [
      ArmoryStatLine(
        label: 'Vigor',
        value: 12 + (km / 2.2).round() + journeyInsights.activeDays,
        flavor: 'Built from long marches and repeat campaigns.',
      ),
      ArmoryStatLine(
        label: 'Discovery',
        value: 14 + (profile.discoveredCells.length / 8).round(),
        flavor: 'Measures how aggressively you uncover the world.',
      ),
      ArmoryStatLine(
        label: 'Lore',
        value: 10 + (profile.reveals.length / 18).round() + level,
        flavor: 'Earned by preserving paths, patterns, and memory.',
      ),
      ArmoryStatLine(
        label: 'Renown',
        value: 8 +
            (unlockedAchievementCount * 3) +
            journeyInsights.expeditions.length,
        flavor: 'Your standing as a proven realmwalker.',
      ),
    ];
  }

  /// Map of slot id → catalog entry. Each entry knows which achievement ID
  /// gates it; the achievements screen uses the same map to surface the
  /// reward inline. Order here matches the on-screen slot order.
  static const Map<String, _ArmorySlotCatalog> slotCatalog = {
    'head': _ArmorySlotCatalog(
      label: 'Head',
      item: ArmoryInventoryItem(
        name: 'Pathfinder Headpiece',
        rarity: 'Common',
        source: 'Trail Scout',
        summary: 'Claimed when your atlas first stretches beyond camp.',
        unlockedByAchievementId: 'trail_scout',
      ),
      lockedHint: 'Complete the Trail Scout deed to claim your headpiece.',
    ),
    'mantle': _ArmorySlotCatalog(
      label: 'Mantle',
      item: ArmoryInventoryItem(
        name: 'Wayfinder Mantle',
        rarity: 'Common',
        source: 'Pathfinder',
        summary: 'A travel-worn mantle stitched from persistent routes.',
        unlockedByAchievementId: 'pathfinder',
      ),
      lockedHint: 'Complete the Pathfinder deed to earn a mantle.',
    ),
    'chest': _ArmorySlotCatalog(
      label: 'Chest',
      item: ArmoryInventoryItem(
        name: 'Fogforged Cuirass',
        rarity: 'Rare',
        source: 'Many Moons',
        summary: 'Forged by seven separate days beneath the fog.',
        unlockedByAchievementId: 'many_moons',
      ),
      lockedHint: 'Complete the Many Moons deed to unlock the cuirass.',
    ),
    'main_hand': _ArmorySlotCatalog(
      label: 'Main Hand',
      item: ArmoryInventoryItem(
        name: 'Surveyor Arm',
        rarity: 'Rare',
        source: 'Realm Walker',
        summary:
            'A field tool for adventurers who prefer distance over comfort.',
        unlockedByAchievementId: 'realm_walker',
      ),
      lockedHint: 'Complete the Realm Walker deed to claim your field staff.',
    ),
    'off_hand': _ArmorySlotCatalog(
      label: 'Off Hand',
      item: ArmoryInventoryItem(
        name: 'Route Satchel',
        rarity: 'Common',
        source: 'Road Journal',
        summary:
            'Carries route notes, chalk, and the smell of old roads.',
        unlockedByAchievementId: 'road_journal',
      ),
      lockedHint: 'Complete the Road Journal deed to earn the satchel.',
    ),
    'legs': _ArmorySlotCatalog(
      label: 'Legs',
      item: ArmoryInventoryItem(
        name: 'Atlas Legguards',
        rarity: 'Epic',
        source: 'Cartographer\'s Oath',
        summary:
            'Rewarded to walkers who start to bend whole districts to memory.',
        unlockedByAchievementId: 'cartographers_oath',
      ),
      lockedHint:
          'Complete the Cartographer\'s Oath deed to forge armored leggings.',
    ),
    'boots': _ArmorySlotCatalog(
      label: 'Boots',
      item: ArmoryInventoryItem(
        name: 'Roadwarden Boots',
        rarity: 'Epic',
        source: 'Voyager',
        summary:
            'Heavy boots built for people who no longer turn back early.',
        unlockedByAchievementId: 'voyager',
      ),
      lockedHint: 'Complete the Voyager deed to unlock your boots.',
    ),
    'trinket': _ArmorySlotCatalog(
      label: 'Trinket',
      item: ArmoryInventoryItem(
        name: 'Guild Waystone',
        rarity: 'Rare',
        source: 'Atlas Chronicler',
        summary: 'Awarded for stacking enough deeds to look deliberate.',
        unlockedByAchievementId: 'atlas_chronicler',
      ),
      lockedHint: 'Complete the Atlas Chronicler deed to earn the waystone.',
    ),
    'relic': _ArmorySlotCatalog(
      label: 'Relic',
      item: ArmoryInventoryItem(
        name: 'Mistglass Reliquary',
        rarity: 'Legendary',
        source: 'Worldbreaker',
        summary:
            'A strange relic that surfaces only after the world bends to your map.',
        unlockedByAchievementId: 'worldbreaker',
      ),
      lockedHint: 'Complete the Worldbreaker deed to claim the legendary relic.',
    ),
  };

  /// Achievement IDs that, when unlocked, award gear. Used by the
  /// AchievementsScreen to surface the reward inline.
  static const Map<String, String> achievementToGearLabel = {
    'trail_scout': 'Pathfinder Headpiece',
    'pathfinder': 'Wayfinder Mantle',
    'many_moons': 'Fogforged Cuirass',
    'realm_walker': 'Surveyor Arm',
    'road_journal': 'Route Satchel',
    'cartographers_oath': 'Atlas Legguards',
    'voyager': 'Roadwarden Boots',
    'atlas_chronicler': 'Guild Waystone',
    'worldbreaker': 'Mistglass Reliquary',
  };

  static List<ArmoryInventorySlotState> _buildLoadout({
    required PlayerProfile profile,
    required JourneyInsights journeyInsights,
    required int unlockedAchievementCount,
    required Set<String> unlockedAchievementIds,
  }) {
    return slotCatalog.entries.map((entry) {
      final slotId = entry.key;
      final catalog = entry.value;
      final achievementId = catalog.item.unlockedByAchievementId;
      final unlocked = achievementId != null &&
          unlockedAchievementIds.contains(achievementId);
      return ArmoryInventorySlotState(
        slotId: slotId,
        label: catalog.label,
        item: unlocked ? catalog.item : null,
        isEquipped: unlocked && profile.isGearSlotVisible(slotId),
        lockedHint: catalog.lockedHint,
      );
    }).toList(growable: false);
  }

  static String _titleFor({
    required int level,
    required int unlockedAchievementCount,
    required int rareFindCount,
  }) {
    if (level >= 40 || rareFindCount >= 2) {
      return 'Realm Marshal';
    }
    if (level >= 28 || unlockedAchievementCount >= 10) {
      return 'Fogforged Captain';
    }
    if (level >= 18 || unlockedAchievementCount >= 6) {
      return 'Atlas Knight';
    }
    if (level >= 10) {
      return 'Trail Adept';
    }
    return 'Road Initiate';
  }

}

class _ArmorySlotCatalog {
  const _ArmorySlotCatalog({
    required this.label,
    required this.item,
    required this.lockedHint,
  });

  final String label;
  final ArmoryInventoryItem item;
  final String lockedHint;
}
