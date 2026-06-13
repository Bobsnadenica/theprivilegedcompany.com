import 'package:flutter/material.dart';
import 'package:model_viewer_plus/model_viewer_plus.dart';

import '../../core/utils/armory_model_composer.dart';
import '../../core/utils/armory_progression.dart';
import 'asset_backed_model_viewer.dart';

class ArmoryHeroViewer extends StatelessWidget {
  const ArmoryHeroViewer({
    super.key,
    required this.heroPresetId,
    required this.loadout,
    required this.level,
    required this.stageColors,
    required this.accentColor,
    required this.glowColor,
  });

  final String heroPresetId;
  final List<ArmoryInventorySlotState> loadout;
  final int level;
  final List<Color> stageColors;
  final Color accentColor;
  final Color glowColor;

  @override
  Widget build(BuildContext context) {
    final config = _ArmoryHeroViewerCatalog.forPreset(heroPresetId);
    final equippedCount = loadout.where((slot) => slot.isEquipped).length;
    final equippedSlots = loadout
        .where((slot) => slot.isEquipped)
        .map((slot) => slot.slotId)
        .toList(growable: false)
      ..sort();
    final modelStateKey = [
      heroPresetId,
      equippedSlots.join(','),
      accentColor.toARGB32(),
      glowColor.toARGB32(),
    ].join('|');
    final auraStrength = (0.14 + (equippedCount * 0.022)).clamp(0.14, 0.34);
    final secondaryAuraStrength =
        (0.10 + (equippedCount * 0.015)).clamp(0.10, 0.24);

    return AspectRatio(
      aspectRatio: 0.72,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(28),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: stageColors,
          ),
          border: Border.all(color: accentColor.withValues(alpha: 0.38)),
          boxShadow: [
            BoxShadow(
              color: glowColor.withValues(alpha: 0.18),
              blurRadius: 34,
              offset: const Offset(0, 20),
            ),
          ],
        ),
        child: Stack(
          children: [
            Positioned(
              top: -14,
              right: -4,
              child: _SoftGlow(
                size: 168,
                color: glowColor.withValues(alpha: auraStrength),
              ),
            ),
            Positioned(
              bottom: 26,
              left: -2,
              child: _SoftGlow(
                size: 140,
                color: accentColor.withValues(alpha: secondaryAuraStrength),
              ),
            ),
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(22),
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Color(0xFF161C23),
                      Color(0xFF0E1319),
                      Color(0xFF090D12),
                    ],
                  ),
                  border: Border.all(
                    color: const Color(0x22FFFFFF),
                  ),
                ),
              ),
            ),
            Positioned(
              top: 12,
              right: 12,
              child: _LevelBadge(
                level: level,
                accentColor: accentColor,
              ),
            ),
            Positioned(
              left: 10,
              right: 10,
              top: 10,
              bottom: 12,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(22),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 138,
                      child: IgnorePointer(
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: RadialGradient(
                              center: const Alignment(0, 0.76),
                              radius: 0.82,
                              colors: [
                                accentColor.withValues(
                                  alpha: 0.10 + (equippedCount * 0.012),
                                ),
                                const Color(0x330A0D12),
                                Colors.transparent,
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                    Positioned.fill(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(0, 0, 0, 6),
                        child: FutureBuilder<ArmoryResolvedModelBundle>(
                          key: ValueKey('compose-$modelStateKey'),
                          future: ArmoryModelComposer.compose(
                            heroPresetId: heroPresetId,
                            loadout: loadout,
                            accentColorFactor: _colorFactor(accentColor),
                            glowColorFactor: _colorFactor(glowColor),
                          ),
                          builder: (context, snapshot) {
                            final bundle = snapshot.data;
                            if (bundle == null) {
                              if (snapshot.hasError) {
                                return _FallbackHeroViewer(
                                  key: ValueKey('fallback-$modelStateKey'),
                                  config: config,
                                );
                              }
                              return const _ArmoryHeroLoadingState();
                            }
                            return AssetBackedModelViewer(
                              key: ValueKey('armory-$modelStateKey'),
                              modelJson: bundle.modelJson,
                              inlineAssets: bundle.inlineAssets,
                              assetAliases: bundle.assetAliases,
                              alt: '${config.name} armory hero',
                              backgroundColor: Colors.transparent,
                              loading: Loading.eager,
                              reveal: Reveal.auto,
                              interactionPrompt: InteractionPrompt.none,
                              cameraControls: true,
                              disablePan: true,
                              disableZoom: false,
                              autoRotate: true,
                              autoRotateDelay: 3200,
                              rotationPerSecond: '3deg',
                              cameraOrbit: config.cameraOrbit,
                              cameraTarget: config.cameraTarget,
                              fieldOfView: config.fieldOfView,
                              minCameraOrbit: 'auto 65deg 72%',
                              maxCameraOrbit: 'auto 96deg 260%',
                              exposure: config.exposure,
                              animationName: config.animationName,
                              autoPlay: true,
                              environmentImage: 'legacy',
                              debugLogging: false,
                            );
                          },
                        ),
                      ),
                    ),
                    Positioned(
                      left: 28,
                      right: 28,
                      bottom: 10,
                      child: IgnorePointer(
                        child: _Pedestal(
                          accentColor: accentColor,
                          auraStrength: auraStrength,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ArmoryHeroViewerCatalog {
  // Kenney Blocky Characters (CC0). Each model has separate head/torso/
  // arm-left/arm-right/leg-left/leg-right mesh nodes and 27 animations.
  // Camera framing calibrated for ~2-unit-tall blocky rig; target y=1.0
  // aims at the character's chest/mid-torso world centre.
  static const Map<String, _ArmoryHeroViewerConfig> _configs = {
    'wayfarer': _ArmoryHeroViewerConfig(
      name: 'Wayfarer',
      assetPath: 'assets/armory/modular/heroes/wayfarer_k.gltf',
      cameraOrbit: '0deg 78deg 200%',
      cameraTarget: '0m 1.0m 0m',
      fieldOfView: '28deg',
      exposure: 1.15,
      animationName: 'idle',
    ),
    'warden': _ArmoryHeroViewerConfig(
      name: 'Warden',
      assetPath: 'assets/armory/modular/heroes/warden_k.gltf',
      cameraOrbit: '0deg 78deg 200%',
      cameraTarget: '0m 1.0m 0m',
      fieldOfView: '28deg',
      exposure: 1.10,
      animationName: 'idle',
    ),
    'seer': _ArmoryHeroViewerConfig(
      name: 'Seer',
      assetPath: 'assets/armory/modular/heroes/seer_k.gltf',
      cameraOrbit: '0deg 78deg 200%',
      cameraTarget: '0m 1.0m 0m',
      fieldOfView: '28deg',
      exposure: 1.15,
      animationName: 'idle',
    ),
    'rider': _ArmoryHeroViewerConfig(
      name: 'Rider',
      assetPath: 'assets/armory/modular/heroes/rider_k.gltf',
      cameraOrbit: '0deg 78deg 200%',
      cameraTarget: '0m 1.0m 0m',
      fieldOfView: '28deg',
      exposure: 1.10,
      animationName: 'idle',
    ),
  };

  static _ArmoryHeroViewerConfig forPreset(String presetId) {
    return _configs[presetId] ?? _configs.values.first;
  }
}

class _LevelBadge extends StatelessWidget {
  const _LevelBadge({
    required this.level,
    required this.accentColor,
  });

  final int level;
  final Color accentColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xB814191E),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: accentColor.withValues(alpha: 0.42)),
      ),
      child: Text(
        'LVL $level',
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: accentColor,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
            ),
      ),
    );
  }
}

class _ArmoryHeroLoadingState extends StatelessWidget {
  const _ArmoryHeroLoadingState();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0x441E2630),
            Color(0x2211181F),
            Color(0x0811181F),
          ],
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: const Center(
        child: SizedBox(
          width: 26,
          height: 26,
          child: CircularProgressIndicator(strokeWidth: 2.2),
        ),
      ),
    );
  }
}

class _FallbackHeroViewer extends StatelessWidget {
  const _FallbackHeroViewer({
    super.key,
    required this.config,
  });

  final _ArmoryHeroViewerConfig config;

  @override
  Widget build(BuildContext context) {
    return AssetBackedModelViewer(
      assetPath: config.assetPath,
      alt: '${config.name} armory hero',
      backgroundColor: Colors.transparent,
      loading: Loading.eager,
      reveal: Reveal.auto,
      interactionPrompt: InteractionPrompt.none,
      cameraControls: true,
      disablePan: true,
      disableZoom: false,
      autoRotate: true,
      autoRotateDelay: 3200,
      rotationPerSecond: '3deg',
      cameraOrbit: config.cameraOrbit,
      cameraTarget: config.cameraTarget,
      fieldOfView: config.fieldOfView,
      minCameraOrbit: 'auto 65deg 72%',
      maxCameraOrbit: 'auto 96deg 260%',
      exposure: config.exposure,
      animationName: config.animationName,
      autoPlay: true,
      environmentImage: 'legacy',
      debugLogging: false,
    );
  }
}

class _Pedestal extends StatelessWidget {
  const _Pedestal({
    required this.accentColor,
    required this.auraStrength,
  });

  final Color accentColor;
  final double auraStrength;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          height: 10,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            gradient: LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: [
                accentColor.withValues(alpha: auraStrength * 0.22),
                accentColor.withValues(alpha: auraStrength + 0.08),
                accentColor.withValues(alpha: auraStrength * 0.22),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        Container(
          height: 22,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0x55191E25),
                Color(0xAA0F1318),
              ],
            ),
            border: Border.all(color: const Color(0x22FFFFFF)),
          ),
        ),
      ],
    );
  }
}

class _SoftGlow extends StatelessWidget {
  const _SoftGlow({
    required this.size,
    required this.color,
  });

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          colors: [
            color,
            Colors.transparent,
          ],
        ),
      ),
    );
  }
}

class _ArmoryHeroViewerConfig {
  const _ArmoryHeroViewerConfig({
    required this.name,
    required this.assetPath,
    required this.cameraOrbit,
    required this.cameraTarget,
    required this.fieldOfView,
    required this.exposure,
    this.animationName,
  });

  final String name;
  final String assetPath;
  final String cameraOrbit;
  final String cameraTarget;
  final String fieldOfView;
  final double exposure;
  final String? animationName;
}

List<double> _colorFactor(Color color) {
  return [
    color.r,
    color.g,
    color.b,
    color.a,
  ];
}
