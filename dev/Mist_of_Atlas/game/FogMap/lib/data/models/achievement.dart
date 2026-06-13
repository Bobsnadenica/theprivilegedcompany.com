import '../../core/constants/app_constants.dart';
import '../../core/utils/journey_insights.dart';
import 'player_profile.dart';

enum AchievementTier { common, rare, epic, legendary }

class Achievement {
  const Achievement({
    required this.id,
    required this.title,
    required this.description,
    required this.category,
    required this.currentValue,
    required this.targetValue,
    required this.tier,
    required this.isUnlocked,
  });

  final String id;
  final String title;
  final String description;
  final String category;
  final int currentValue;
  final int targetValue;
  final AchievementTier tier;
  final bool isUnlocked;

  int get displayedCurrentValue {
    if (currentValue <= 0) return 0;
    if (targetValue <= 0) return currentValue;
    return currentValue > targetValue ? targetValue : currentValue;
  }

  double get progress {
    if (targetValue <= 0) return 1;
    final ratio = displayedCurrentValue / targetValue;
    if (ratio < 0) return 0;
    if (ratio > 1) return 1;
    return ratio;
  }
}

class AchievementCatalog {
  static List<Achievement> build(PlayerProfile profile) {
    final cells = profile.discoveredCells.length;
    final wholeKm = (profile.totalDistanceMeters / 1000.0).floor();
    final steps =
        (profile.totalDistanceMeters / AppConstants.averageStepLengthMeters)
            .round();
    final reveals = profile.reveals.length;
    final journeyInsights = JourneyInsights.fromProfile(profile);
    final expeditions = journeyInsights.expeditions.length;
    final activeDays = journeyInsights.activeDays;
    final maxConsecutiveDays = journeyInsights.maxConsecutiveDays;
    final longestExpeditionKm =
        (journeyInsights.longestExpeditionMeters / 1000.0).floor();

    return [
      _milestone(
        id: 'first_footfall',
        title: 'First Footfall',
        description:
            'One step beyond the mist. The atlas begins with a single cell.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 1,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'lift_the_veil',
        title: 'Lift the Veil',
        description:
            'Five cells torn from the fog. Your home ground takes its first shape.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 5,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'morning_walker',
        title: 'Morning Walker',
        description:
            'Ten cells. The first hour of any campaign looks exactly like this.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 10,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'trail_scout',
        title: 'Trail Scout',
        description:
            'Twenty-five cells mapped. You have outpaced every armchair cartographer.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 25,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'borderwatch',
        title: 'Borderwatch',
        description:
            'Fifty cells. Your neighbourhood\'s edges are no longer a mystery.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 50,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'fogsplitter',
        title: 'Fogsplitter',
        description:
            'Seventy-five cells shattered. The fog does not enjoy your company.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 75,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'cartographers_oath',
        title: 'Cartographer\'s Oath',
        description:
            'One hundred cells. You swore to map the world — and you meant it.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 100,
        tier: AchievementTier.rare,
      ),
      _milestone(
        id: 'parish_walker',
        title: 'Parish Walker',
        description:
            'A hundred and fifty cells — a whole neighbourhood unmasked, street by street.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 150,
        tier: AchievementTier.rare,
      ),
      _milestone(
        id: 'district_walker',
        title: 'District Walker',
        description:
            'Two hundred cells. Your atlas now covers a full district. People notice.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 200,
        tier: AchievementTier.rare,
      ),
      _milestone(
        id: 'realm_surveyor',
        title: 'Realm Surveyor',
        description:
            'Two hundred and fifty cells surveyed. The fog is retreating on purpose now.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 250,
        tier: AchievementTier.rare,
      ),
      _milestone(
        id: 'map_architect',
        title: 'Map Architect',
        description:
            'Three hundred and fifty cells. You don\'t follow roads — you define them.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 350,
        tier: AchievementTier.rare,
      ),
      _milestone(
        id: 'province_warden',
        title: 'Province Warden',
        description:
            'Five hundred cells. A full province bows to your relentless atlas.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 500,
        tier: AchievementTier.epic,
      ),
      _milestone(
        id: 'territory_master',
        title: 'Territory Master',
        description:
            'Seven hundred and fifty cells claimed. You are running out of local fog.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 750,
        tier: AchievementTier.epic,
      ),
      _milestone(
        id: 'worldbreaker',
        title: 'Worldbreaker',
        description:
            'A thousand cells. The fog doesn\'t know what it\'s dealing with.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 1000,
        tier: AchievementTier.legendary,
      ),
      _milestone(
        id: 'fog_sovereign',
        title: 'Fog Sovereign',
        description:
            'Fifteen hundred cells. Other explorers find your cleared paths and wonder who passed through.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 1500,
        tier: AchievementTier.legendary,
      ),
      _milestone(
        id: 'realm_eternal',
        title: 'Realm Eternal',
        description:
            'Two thousand five hundred cells. Only legends keep walking this far — you are one of them.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 2500,
        tier: AchievementTier.legendary,
      ),
      _milestone(
        id: 'atlas_king',
        title: 'Atlas King',
        description:
            'Five thousand cells. You haven\'t revealed the world — you\'ve replaced it.',
        category: 'Exploration',
        currentValue: cells,
        targetValue: 5000,
        tier: AchievementTier.legendary,
      ),
      _milestone(
        id: 'road_dust',
        title: 'Road Dust',
        description: 'Log 1,000 steps across the kingdom.',
        category: 'Footfalls',
        currentValue: steps,
        targetValue: 1000,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'marching_orders',
        title: 'Marching Orders',
        description: 'Log 5,000 steps beneath the fog.',
        category: 'Footfalls',
        currentValue: steps,
        targetValue: 5000,
        tier: AchievementTier.rare,
      ),
      _milestone(
        id: 'ironstride',
        title: 'Ironstride',
        description: 'Log 25,000 steps on your campaign.',
        category: 'Footfalls',
        currentValue: steps,
        targetValue: 25000,
        tier: AchievementTier.epic,
      ),
      _milestone(
        id: 'endless_march',
        title: 'Endless March',
        description: 'Log 100,000 steps in the world beyond the fog.',
        category: 'Footfalls',
        currentValue: steps,
        targetValue: 100000,
        tier: AchievementTier.legendary,
      ),
      _milestone(
        id: 'ember_trail',
        title: 'Ember Trail',
        description: 'Record 10 reveal points on your war map.',
        category: 'Trail',
        currentValue: reveals,
        targetValue: 10,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'pathfinder',
        title: 'Pathfinder',
        description: 'Record 50 reveal points on your war map.',
        category: 'Trail',
        currentValue: reveals,
        targetValue: 50,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'chronicler',
        title: 'Chronicler',
        description: 'Record 250 reveal points on your war map.',
        category: 'Trail',
        currentValue: reveals,
        targetValue: 250,
        tier: AchievementTier.rare,
      ),
      _milestone(
        id: 'trailblazer',
        title: 'Trailblazer',
        description: 'Record 500 reveal points on your war map.',
        category: 'Trail',
        currentValue: reveals,
        targetValue: 500,
        tier: AchievementTier.epic,
      ),
      _milestone(
        id: 'cartography_obsessed',
        title: 'Cartography Obsessed',
        description: 'Record 1,000 trail points — the atlas grows heavy.',
        category: 'Trail',
        currentValue: reveals,
        targetValue: 1000,
        tier: AchievementTier.epic,
      ),
      _milestone(
        id: 'eternal_scribe',
        title: 'Eternal Scribe',
        description: 'Record 2,500 trail points — history written in footfalls.',
        category: 'Trail',
        currentValue: reveals,
        targetValue: 2500,
        tier: AchievementTier.legendary,
      ),
      _milestone(
        id: 'first_expedition',
        title: 'First Expedition',
        description: 'Complete your first atlas-worthy expedition.',
        category: 'Expedition',
        currentValue: expeditions,
        targetValue: 1,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'road_journal',
        title: 'Road Journal',
        description: 'Log 5 expedition sessions in your atlas.',
        category: 'Expedition',
        currentValue: expeditions,
        targetValue: 5,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'atlas_chronicler',
        title: 'Atlas Chronicler',
        description: 'Log 15 expedition sessions in your atlas.',
        category: 'Expedition',
        currentValue: expeditions,
        targetValue: 15,
        tier: AchievementTier.rare,
      ),
      _milestone(
        id: 'seasoned_scout',
        title: 'Seasoned Scout',
        description: 'Log 25 expedition sessions.',
        category: 'Expedition',
        currentValue: expeditions,
        targetValue: 25,
        tier: AchievementTier.rare,
      ),
      _milestone(
        id: 'seasoned_realmwalker',
        title: 'Seasoned Realmwalker',
        description: 'Log 40 expedition sessions across the realm.',
        category: 'Expedition',
        currentValue: expeditions,
        targetValue: 40,
        tier: AchievementTier.epic,
      ),
      _milestone(
        id: 'expedition_veteran',
        title: 'Expedition Veteran',
        description: 'Log 75 expedition sessions — the road is home.',
        category: 'Expedition',
        currentValue: expeditions,
        targetValue: 75,
        tier: AchievementTier.epic,
      ),
      _milestone(
        id: 'expedition_legend',
        title: 'Expedition Legend',
        description: 'Log 150 expedition sessions. Your name is on the maps.',
        category: 'Expedition',
        currentValue: expeditions,
        targetValue: 150,
        tier: AchievementTier.legendary,
      ),
      _milestone(
        id: 'many_moons',
        title: 'Many Moons',
        description: 'Explore on 7 distinct days.',
        category: 'Expedition',
        currentValue: activeDays,
        targetValue: 7,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'road_calendar',
        title: 'Road Calendar',
        description: 'Explore on 30 distinct days.',
        category: 'Expedition',
        currentValue: activeDays,
        targetValue: 30,
        tier: AchievementTier.rare,
      ),
      _milestone(
        id: 'season_walker',
        title: 'Season Walker',
        description: 'Explore on 60 distinct days — a full season on the road.',
        category: 'Expedition',
        currentValue: activeDays,
        targetValue: 60,
        tier: AchievementTier.epic,
      ),
      _milestone(
        id: 'year_of_fog',
        title: 'Year of Fog',
        description: 'Explore on 100 distinct days — the fog never stood a chance.',
        category: 'Expedition',
        currentValue: activeDays,
        targetValue: 100,
        tier: AchievementTier.legendary,
      ),
      _milestone(
        id: 'pathrunner',
        title: 'Pathrunner',
        description: 'Travel your first kilometre into the unknown.',
        category: 'Distance',
        currentValue: wholeKm,
        targetValue: 1,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'realm_walker',
        title: 'Realm Walker',
        description: 'Travel 10 kilometers through the wilds.',
        category: 'Distance',
        currentValue: wholeKm,
        targetValue: 10,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'district_wanderer',
        title: 'District Wanderer',
        description: 'Travel 25 kilometres — you\'ve left your home district behind.',
        category: 'Distance',
        currentValue: wholeKm,
        targetValue: 25,
        tier: AchievementTier.rare,
      ),
      _milestone(
        id: 'voyager',
        title: 'Voyager',
        description: 'Travel 50 kilometers through the wilds.',
        category: 'Distance',
        currentValue: wholeKm,
        targetValue: 50,
        tier: AchievementTier.rare,
      ),
      _milestone(
        id: 'world_roadwarden',
        title: 'World Roadwarden',
        description: 'Travel 100 kilometers through the wilds.',
        category: 'Distance',
        currentValue: wholeKm,
        targetValue: 100,
        tier: AchievementTier.epic,
      ),
      _milestone(
        id: 'grand_voyager',
        title: 'Grand Voyager',
        description: 'Travel 200 kilometres — the horizon is just a suggestion.',
        category: 'Distance',
        currentValue: wholeKm,
        targetValue: 200,
        tier: AchievementTier.epic,
      ),
      _milestone(
        id: 'mythic_roadwarden',
        title: 'Mythic Roadwarden',
        description: 'Travel 250 kilometers through the wilds.',
        category: 'Distance',
        currentValue: wholeKm,
        targetValue: 250,
        tier: AchievementTier.legendary,
      ),
      _milestone(
        id: 'endless_road',
        title: 'Endless Road',
        description: 'Travel 500 kilometres. The road has no end for you.',
        category: 'Distance',
        currentValue: wholeKm,
        targetValue: 500,
        tier: AchievementTier.legendary,
      ),
      // ── Long March — single-expedition distance deeds ──────────────────
      _milestone(
        id: 'first_league',
        title: 'First League',
        description: 'Cover one kilometre in a single expedition.',
        category: 'Long March',
        currentValue: longestExpeditionKm,
        targetValue: 1,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'day_tripper',
        title: 'Day Tripper',
        description: 'Push five kilometres in a single unbroken outing.',
        category: 'Long March',
        currentValue: longestExpeditionKm,
        targetValue: 5,
        tier: AchievementTier.rare,
      ),
      _milestone(
        id: 'long_march',
        title: 'Long March',
        description: 'Ten kilometres in one campaign — without turning back.',
        category: 'Long March',
        currentValue: longestExpeditionKm,
        targetValue: 10,
        tier: AchievementTier.epic,
      ),
      _milestone(
        id: 'iron_march',
        title: 'Iron March',
        description:
            'Twenty kilometres in a single expedition. Legends rest after this.',
        category: 'Long March',
        currentValue: longestExpeditionKm,
        targetValue: 20,
        tier: AchievementTier.legendary,
      ),
      // ── Streak — consecutive-day deeds ─────────────────────────────────
      _milestone(
        id: 'back_to_back',
        title: 'Back to Back',
        description: 'Explore on two consecutive days. Prove you came back.',
        category: 'Streak',
        currentValue: maxConsecutiveDays,
        targetValue: 2,
        tier: AchievementTier.common,
      ),
      _milestone(
        id: 'week_of_wonder',
        title: 'Week of Wonder',
        description: 'Seven days without missing a march.',
        category: 'Streak',
        currentValue: maxConsecutiveDays,
        targetValue: 7,
        tier: AchievementTier.rare,
      ),
      _milestone(
        id: 'relentless_roamer',
        title: 'Relentless Roamer',
        description: 'A fortnight of unbroken expeditions — fourteen days straight.',
        category: 'Streak',
        currentValue: maxConsecutiveDays,
        targetValue: 14,
        tier: AchievementTier.epic,
      ),
      _milestone(
        id: 'iron_calendar',
        title: 'Iron Calendar',
        description: 'Thirty consecutive days on campaign. The chain never broke.',
        category: 'Streak',
        currentValue: maxConsecutiveDays,
        targetValue: 30,
        tier: AchievementTier.legendary,
      ),
    ];
  }

  static Achievement _milestone({
    required String id,
    required String title,
    required String description,
    required String category,
    required int currentValue,
    required int targetValue,
    required AchievementTier tier,
  }) {
    return Achievement(
      id: id,
      title: title,
      description: description,
      category: category,
      currentValue: currentValue,
      targetValue: targetValue,
      tier: tier,
      isUnlocked: currentValue >= targetValue,
    );
  }
}
