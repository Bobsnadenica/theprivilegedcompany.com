import 'package:flutter/material.dart';

import '../../controllers/app_controller.dart';
import '../../core/utils/armory_progression.dart';
import '../../core/utils/journey_insights.dart';
import '../../core/utils/stat_formatters.dart';
import 'armory_hero_viewer.dart';
import 'fantasy_panel.dart';

class ArmoryProfileView extends StatelessWidget {
  const ArmoryProfileView({
    super.key,
    required this.controller,
    required this.journeyInsights,
    required this.onSelectHeroArchetype,
    required this.onSetGearSlotEquipped,
  });

  final AppController controller;
  final JourneyInsights journeyInsights;
  final Future<void> Function(String archetypeId) onSelectHeroArchetype;
  final Future<void> Function(String slotId, bool isEquipped)
      onSetGearSlotEquipped;

  @override
  Widget build(BuildContext context) {
    final profile = controller.profile;
    final progression = ArmoryProgressionBuilder.build(
      profile: profile,
      journeyInsights: journeyInsights,
      achievements: controller.achievements,
    );
    final heroPreset = ArmoryProgressionBuilder.heroPresetById(
      profile.heroArchetypeId,
    );
    final presetVisual = _presetVisualFor(heroPreset.id);

    return Column(
      children: [
        FantasyPanel(
          padding: const EdgeInsets.all(20),
          background: const [
            Color(0xE61C130E),
            Color(0xE618171D),
            Color(0xE612171C),
          ],
          accentColor: presetVisual.accent,
          child: Column(
            children: [
              _ArmoryHeroHeader(
                displayName: profile.displayName,
                title: progression.title,
                heroPreset: heroPreset,
                accentColor: presetVisual.accent,
              ),
              const SizedBox(height: 22),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 640),
                child: _HeroStage(
                  heroPresetId: heroPreset.id,
                  loadout: progression.loadout,
                  level: progression.level,
                  presetVisual: presetVisual,
                ),
              ),
              const SizedBox(height: 18),
              _LoadoutStrip(
                progression: progression,
                accentColor: presetVisual.accent,
                onToggleSlot: onSetGearSlotEquipped,
              ),
              const SizedBox(height: 22),
              _ArmorySummary(
                controller: controller,
                journeyInsights: journeyInsights,
                progression: progression,
                heroPreset: heroPreset,
                selectedHeroPresetId: profile.heroArchetypeId,
                presetVisual: presetVisual,
                onSelectHeroArchetype: onSelectHeroArchetype,
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        LayoutBuilder(
          builder: (context, constraints) {
            final wide = constraints.maxWidth >= 880;
            final statsPanel = _StatsPanel(
              progression: progression,
              controller: controller,
            );
            final campaignPanel = _CampaignPanel(
              controller: controller,
              journeyInsights: journeyInsights,
            );
            const broadcastPanel = _BroadcastPanel();

            if (wide) {
              return Column(
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: statsPanel),
                      const SizedBox(width: 14),
                      Expanded(child: campaignPanel),
                    ],
                  ),
                  const SizedBox(height: 14),
                  broadcastPanel,
                ],
              );
            }

            return Column(
              children: [
                statsPanel,
                const SizedBox(height: 14),
                campaignPanel,
                const SizedBox(height: 14),
                broadcastPanel,
              ],
            );
          },
        ),
      ],
    );
  }
}

class _ArmorySummary extends StatelessWidget {
  const _ArmorySummary({
    required this.controller,
    required this.journeyInsights,
    required this.progression,
    required this.heroPreset,
    required this.selectedHeroPresetId,
    required this.presetVisual,
    required this.onSelectHeroArchetype,
  });

  final AppController controller;
  final JourneyInsights journeyInsights;
  final ArmoryProgression progression;
  final ArmoryHeroPreset heroPreset;
  final String selectedHeroPresetId;
  final _PresetVisual presetVisual;
  final Future<void> Function(String archetypeId) onSelectHeroArchetype;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 860;
        final overview = _OverviewCluster(
          controller: controller,
          journeyInsights: journeyInsights,
          progression: progression,
          heroPreset: heroPreset,
          presetVisual: presetVisual,
        );
        final customization = _CustomizationPanel(
          selectedHeroPresetId: selectedHeroPresetId,
          onSelectHeroArchetype: onSelectHeroArchetype,
        );

        if (wide) {
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: overview),
              const SizedBox(width: 18),
              Expanded(child: customization),
            ],
          );
        }

        return Column(
          children: [
            overview,
            const SizedBox(height: 16),
            customization,
          ],
        );
      },
    );
  }
}

class _ArmoryHeroHeader extends StatelessWidget {
  const _ArmoryHeroHeader({
    required this.displayName,
    required this.title,
    required this.heroPreset,
    required this.accentColor,
  });

  final String displayName;
  final String title;
  final ArmoryHeroPreset heroPreset;
  final Color accentColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          'Atlas Armory',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: accentColor,
                letterSpacing: 1.1,
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 8),
        Text(
          displayName,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w900,
              ),
        ),
        const SizedBox(height: 4),
        Text(
          '$title • ${heroPreset.name}',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: const Color(0xFFF3E8D1),
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(height: 6),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Text(
            heroPreset.tagline,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: const Color(0xFFD5CCBC),
                ),
          ),
        ),
      ],
    );
  }
}

class _LoadoutStrip extends StatelessWidget {
  const _LoadoutStrip({
    required this.progression,
    required this.accentColor,
    required this.onToggleSlot,
  });

  final ArmoryProgression progression;
  final Color accentColor;
  final Future<void> Function(String slotId, bool isEquipped) onToggleSlot;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0x1613171B),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: accentColor.withValues(alpha: 0.20)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Text(
                'Collected Gear',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const Spacer(),
              Text(
                '${progression.equippedItemCount}/9 visible',
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: accentColor,
                    ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Tap any unlocked slot to show or hide it on the hero.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: const Color(0xFFD4C9B6),
                ),
          ),
          const SizedBox(height: 14),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 10,
            runSpacing: 10,
            children: progression.loadout
                .map(
                  (slot) => _LoadoutSlotPill(
                    slot: slot,
                    onToggle: slot.isUnlocked
                        ? () => onToggleSlot(slot.slotId, !slot.isEquipped)
                        : null,
                  ),
                )
                .toList(growable: false),
          ),
        ],
      ),
    );
  }
}

class _OverviewCluster extends StatelessWidget {
  const _OverviewCluster({
    required this.controller,
    required this.journeyInsights,
    required this.progression,
    required this.heroPreset,
    required this.presetVisual,
  });

  final AppController controller;
  final JourneyInsights journeyInsights;
  final ArmoryProgression progression;
  final ArmoryHeroPreset heroPreset;
  final _PresetVisual presetVisual;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0x14121619),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: presetVisual.accent.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${heroPreset.role} profile',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            'Keep the numbers, but let them support the hero instead of drowning it.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 14),
          _LevelPanel(
            progression: progression,
            presetVisual: presetVisual,
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _HeroChip(
                icon: Icons.shield_outlined,
                label:
                    '${StatFormatters.compactCount(progression.armoryScore)} score',
              ),
              _HeroChip(
                icon: Icons.grid_view_rounded,
                label:
                    '${StatFormatters.wholeNumber(controller.discoveredCellsCount)} cells',
              ),
              _HeroChip(
                icon: Icons.route,
                label: StatFormatters.distanceKm(
                  controller.totalKm,
                  fractionDigits: 1,
                ),
              ),
              _HeroChip(
                icon: Icons.map_outlined,
                label:
                    '${StatFormatters.wholeNumber(journeyInsights.expeditions.length)} expeditions',
              ),
              _HeroChip(
                icon: Icons.public,
                label: StatFormatters.percent(
                  controller.coveragePercent,
                  fractionDigits: 6,
                ),
              ),
              _HeroChip(
                icon: Icons.auto_awesome,
                label:
                    '${StatFormatters.wholeNumber(progression.rareFindCount)} rare finds',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CustomizationPanel extends StatelessWidget {
  const _CustomizationPanel({
    required this.selectedHeroPresetId,
    required this.onSelectHeroArchetype,
  });

  final String selectedHeroPresetId;
  final Future<void> Function(String archetypeId) onSelectHeroArchetype;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0x14121619),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0x24D4B16B)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SelectorLabel(
            title: 'Hero Preset',
            subtitle:
                'Choose the archetype. Gear visibility is controlled from the collected slots.',
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: ArmoryProgressionBuilder.heroPresets.map((preset) {
              final visual = _presetVisualFor(preset.id);
              final selected = preset.id == selectedHeroPresetId;
              return SizedBox(
                width: 170,
                child: ChoiceChip(
                  selected: selected,
                  onSelected: (_) {
                    onSelectHeroArchetype(preset.id);
                  },
                  avatar: Container(
                    width: 18,
                    height: 18,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        colors: visual.stage,
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      border: Border.all(
                        color: visual.accent.withValues(alpha: 0.7),
                      ),
                    ),
                  ),
                  label: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(preset.name),
                      Text(
                        preset.role,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: const Color(0xFFD0C7B5),
                            ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(growable: false),
          ),
        ],
      ),
    );
  }
}

class _HeroStage extends StatelessWidget {
  const _HeroStage({
    required this.heroPresetId,
    required this.loadout,
    required this.level,
    required this.presetVisual,
  });

  final String heroPresetId;
  final List<ArmoryInventorySlotState> loadout;
  final int level;
  final _PresetVisual presetVisual;

  @override
  Widget build(BuildContext context) {
    return ArmoryHeroViewer(
      heroPresetId: heroPresetId,
      loadout: loadout,
      level: level,
      stageColors: presetVisual.stage,
      accentColor: presetVisual.accent,
      glowColor: presetVisual.glow,
    );
  }
}

class _StatsPanel extends StatelessWidget {
  const _StatsPanel({
    required this.progression,
    required this.controller,
  });

  final ArmoryProgression progression;
  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return FantasyPanel(
      background: const [
        Color(0xE61A140F),
        Color(0xE6161C1E),
        Color(0xE611171B),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _PanelHeader(
            title: 'Hero Stats',
            subtitle: 'Core attributes shaped by how you actually explore.',
          ),
          const SizedBox(height: 14),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 1.12,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
            ),
            itemCount: progression.stats.length,
            itemBuilder: (context, index) {
              final stat = progression.stats[index];
              return _StatCard(stat: stat);
            },
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _LedgerChip(
                icon: Icons.auto_awesome,
                label:
                    '${StatFormatters.wholeNumber(progression.unlockedAchievementCount)} deeds',
              ),
              _LedgerChip(
                icon: Icons.hiking,
                label:
                    '${StatFormatters.compactCount(controller.estimatedSteps)} steps',
              ),
              _LedgerChip(
                icon: Icons.travel_explore,
                label:
                    '${StatFormatters.wholeNumber(progression.totalXp)} total XP',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CampaignPanel extends StatelessWidget {
  const _CampaignPanel({
    required this.controller,
    required this.journeyInsights,
  });

  final AppController controller;
  final JourneyInsights journeyInsights;

  @override
  Widget build(BuildContext context) {
    final latestExpedition = journeyInsights.latestExpedition;
    final longestKm = journeyInsights.longestExpeditionMeters / 1000.0;

    return FantasyPanel(
      background: const [
        Color(0xE6151510),
        Color(0xE613181D),
        Color(0xE610161B),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _PanelHeader(
            title: 'Journey Record',
            subtitle: 'Campaign history and exploration pacing at a glance.',
          ),
          const SizedBox(height: 14),
          _DetailBand(
            label: 'Current rank',
            value: controller.adventurerRank,
          ),
          _DetailBand(
            label: 'Active days',
            value: StatFormatters.wholeNumber(journeyInsights.activeDays),
          ),
          _DetailBand(
            label: 'Longest campaign',
            value: StatFormatters.distanceKm(longestKm, fractionDigits: 1),
          ),
          _DetailBand(
            label: 'Latest expedition',
            value: latestExpedition == null
                ? 'No campaigns logged yet'
                : '${StatFormatters.distanceKm(latestExpedition.distanceMeters / 1000, fractionDigits: 1)} • ${latestExpedition.revealCount} marks',
          ),
        ],
      ),
    );
  }
}

class _BroadcastPanel extends StatelessWidget {
  const _BroadcastPanel();

  @override
  Widget build(BuildContext context) {
    // The realm beacon UX is intentionally hidden until the backend relay is
    // live. Re-introduce by returning the previous compose UI here once the
    // server-side broadcast endpoint ships.
    return FantasyPanel(
      background: const [
        Color(0xE6141B16),
        Color(0xE6111F19),
        Color(0xE60F1718),
      ],
      accentColor: const Color(0xFF7AC7B6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Realm Beacon',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0x227AC7B6),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: const Color(0x447AC7B6)),
                ),
                child: const Text(
                  'COMING SOON',
                  style: TextStyle(
                    color: Color(0xFF7AC7B6),
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                    fontSize: 11,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Short, local "I\'m here" pings to nearby realmwalkers. The relay is on the roadmap — the button will reappear when it can actually deliver a signal.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _LevelPanel extends StatelessWidget {
  const _LevelPanel({
    required this.progression,
    required this.presetVisual,
  });

  final ArmoryProgression progression;
  final _PresetVisual presetVisual;

  @override
  Widget build(BuildContext context) {
    final xpLabel =
        '${StatFormatters.wholeNumber(progression.currentLevelXp)} / ${StatFormatters.wholeNumber(progression.nextLevelXp)} XP';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0x26111318),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: presetVisual.accent.withValues(alpha: 0.32)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Level ${progression.level}',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ),
              Text(
                xpLabel,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: const Color(0xFFD7CBB6),
                    ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          FantasyProgressBar(
            value: progression.levelProgress,
            fill: [presetVisual.accent, const Color(0xFFF3DFC0)],
            glowColor: presetVisual.glow.withValues(alpha: 0.55),
          ),
        ],
      ),
    );
  }
}

class _PanelHeader extends StatelessWidget {
  const _PanelHeader({
    required this.title,
    required this.subtitle,
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 4),
        Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

class _SelectorLabel extends StatelessWidget {
  const _SelectorLabel({
    required this.title,
    required this.subtitle,
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 3),
        Text(
          subtitle,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _HeroChip extends StatelessWidget {
  const _HeroChip({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0x22121518),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0x2BD4B16B)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: const Color(0xFFE2C58F)),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(context).textTheme.labelLarge,
          ),
        ],
      ),
    );
  }
}

class _LoadoutSlotPill extends StatelessWidget {
  const _LoadoutSlotPill({
    required this.slot,
    required this.onToggle,
  });

  final ArmoryInventorySlotState slot;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final item = slot.item;
    final color = _rarityColor(item?.rarity);
    final active = slot.isEquipped;

    return InkWell(
      onTap: onToggle,
      borderRadius: BorderRadius.circular(18),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        width: 98,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
        decoration: BoxDecoration(
          color: item == null
              ? const Color(0x1213171A)
              : active
                  ? color.withValues(alpha: 0.16)
                  : const Color(0x1A12161B),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: item == null
                ? const Color(0x24FFFFFF)
                : active
                    ? color.withValues(alpha: 0.68)
                    : const Color(0x2AD4B16B),
            width: active ? 1.5 : 1,
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: Icon(
                item == null
                    ? Icons.lock_outline
                    : active
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                size: 14,
                color: item == null
                    ? const Color(0xFF978F82)
                    : active
                        ? color
                        : const Color(0xFFB8AE9E),
              ),
            ),
            Icon(
              _slotIconFor(slot.slotId),
              size: 20,
              color: item == null
                  ? const Color(0xFF978F82)
                  : active
                      ? color
                      : const Color(0xFFD4C9B6),
            ),
            const SizedBox(height: 6),
            Text(
              slot.label,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: const Color(0xFFF0E7D8),
                  ),
            ),
            const SizedBox(height: 3),
            Text(
              item?.name ?? 'Locked',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: item == null
                        ? const Color(0xFF978F82)
                        : active
                            ? color
                            : const Color(0xFFD4C9B6),
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              item == null
                  ? 'Locked'
                  : active
                      ? 'Shown'
                      : 'Hidden',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: item == null
                        ? const Color(0xFF978F82)
                        : active
                            ? color
                            : const Color(0xFFB8AE9E),
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.stat,
  });

  final ArmoryStatLine stat;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0x1E121519),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0x26D4B16B)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            stat.label,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: const Color(0xFFE2C58F),
                ),
          ),
          const Spacer(),
          Text(
            StatFormatters.wholeNumber(stat.value),
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            stat.flavor,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _LedgerChip extends StatelessWidget {
  const _LedgerChip({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0x1A13181D),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0x287AC7B6)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: const Color(0xFF7AC7B6)),
          const SizedBox(width: 6),
          Text(label),
        ],
      ),
    );
  }
}

class _DetailBand extends StatelessWidget {
  const _DetailBand({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0x1A12161A),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0x22D4B16B)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: const Color(0xFFE7D2A1),
                    fontWeight: FontWeight.w800,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

Color _rarityColor(String? rarity) {
  switch (rarity) {
    case 'Legendary':
      return const Color(0xFFF1A94C);
    case 'Epic':
      return const Color(0xFFD884C5);
    case 'Rare':
      return const Color(0xFF72B8E8);
    default:
      return const Color(0xFFD8C18E);
  }
}

IconData _slotIconFor(String slotId) {
  switch (slotId) {
    case 'head':
      return Icons.military_tech_outlined;
    case 'mantle':
      return Icons.layers_outlined;
    case 'chest':
      return Icons.checkroom_outlined;
    case 'main_hand':
      return Icons.auto_fix_high_outlined;
    case 'off_hand':
      return Icons.work_outline;
    case 'legs':
      return Icons.accessibility_new_outlined;
    case 'boots':
      return Icons.hiking_outlined;
    case 'trinket':
      return Icons.brightness_5_outlined;
    case 'relic':
      return Icons.auto_awesome_outlined;
    default:
      return Icons.inventory_2_outlined;
  }
}

class _PresetVisual {
  const _PresetVisual({
    required this.stage,
    required this.accent,
    required this.glow,
  });

  final List<Color> stage;
  final Color accent;
  final Color glow;
}

_PresetVisual _presetVisualFor(String presetId) {
  switch (presetId) {
    case 'warden':
      return const _PresetVisual(
        stage: [
          Color(0xFF293321),
          Color(0xFF151E16),
          Color(0xFF12161A),
        ],
        accent: Color(0xFFB3D393),
        glow: Color(0x885AA661),
      );
    case 'seer':
      return const _PresetVisual(
        stage: [
          Color(0xFF251B36),
          Color(0xFF161729),
          Color(0xFF10151D),
        ],
        accent: Color(0xFFE1B5F5),
        glow: Color(0x88785BE3),
      );
    case 'rider':
      return const _PresetVisual(
        stage: [
          Color(0xFF372018),
          Color(0xFF1E1A1E),
          Color(0xFF11151A),
        ],
        accent: Color(0xFFFFC27A),
        glow: Color(0x88D87F3D),
      );
    default:
      return const _PresetVisual(
        stage: [
          Color(0xFF162331),
          Color(0xFF151A24),
          Color(0xFF10151A),
        ],
        accent: Color(0xFFE5C17A),
        glow: Color(0x8870A6D7),
      );
  }
}
