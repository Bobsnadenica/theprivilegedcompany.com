import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/services.dart';

import 'armory_progression.dart';

/// Output of [ArmoryModelComposer.compose] — a self-contained glTF JSON
/// document plus any inline byte assets that the viewer's local HTTP server
/// will serve alongside it.
class ArmoryResolvedModelBundle {
  const ArmoryResolvedModelBundle({
    required this.modelJson,
    this.inlineAssets = const {},
    this.assetAliases = const {},
  });

  final String modelJson;
  final Map<String, Uint8List> inlineAssets;
  final Map<String, String> assetAliases;
}

/// Composes the per-archetype hero glTF.
///
/// Each hero archetype maps to a Kenney Blocky Character glTF (e.g.
/// `warden` -> `assets/armory/modular/heroes/warden_k.gltf`). Every model
/// has six separate rigid mesh nodes — head, torso, arm-left, arm-right,
/// leg-left, leg-right — and 27 baked animations including `idle`.
class ArmoryModelComposer {
  ArmoryModelComposer._();

  /// Bundle cache keyed by `(archetype, hidden mesh names)`. Static so it
  /// survives FutureBuilder rebuilds that re-run with the same input.
  static final Map<String, Future<ArmoryResolvedModelBundle>> _bundleCache =
      <String, Future<ArmoryResolvedModelBundle>>{};

  /// Per-archetype source asset cache. Loading the gltf+bin+textures is the
  /// expensive step — we share one parsed source across visibility toggles.
  static final Map<String, Future<_HeroSourceAsset>> _sourceCache =
      <String, Future<_HeroSourceAsset>>{};

  /// Builds the composed glTF for the hero preset and the player's current
  /// loadout. `accentColorFactor` and `glowColorFactor` are accepted for API
  /// compatibility with the previous signature but are no longer applied —
  /// the new outfits ship their own materials/textures.
  static Future<ArmoryResolvedModelBundle> compose({
    required String heroPresetId,
    required List<ArmoryInventorySlotState> loadout,
    required List<double> accentColorFactor,
    required List<double> glowColorFactor,
  }) {
    final recipe = _HeroRecipe.forPreset(heroPresetId);
    final hiddenMeshNodes = recipe.hiddenMeshNodesFor(loadout);
    final cacheKey = '$heroPresetId|${hiddenMeshNodes.join(",")}';

    return _bundleCache.putIfAbsent(cacheKey, () async {
      final source = await _loadSource(recipe.assetPath);
      final document = _cloneDocument(source.document);
      _detachMeshNodesByName(document, hiddenMeshNodes);
      _applyApose(document);

      return ArmoryResolvedModelBundle(
        modelJson: const JsonEncoder.withIndent('  ').convert(document),
        inlineAssets: Map<String, Uint8List>.from(source.companionBytes),
      );
    });
  }

  static Future<_HeroSourceAsset> _loadSource(String assetPath) {
    return _sourceCache.putIfAbsent(
      assetPath,
      () => _HeroSourceAsset.load(assetPath),
    );
  }
}

class _HeroSourceAsset {
  _HeroSourceAsset({
    required this.assetPath,
    required this.document,
    required this.companionBytes,
  });

  /// Original asset path (e.g. `assets/armory/modular/heroes/warden_k.gltf`).
  final String assetPath;

  /// Parsed glTF JSON. Treat as immutable; clone before mutating.
  final Map<String, dynamic> document;

  /// All sibling buffers/textures referenced by the gltf, keyed by the
  /// relative URI the local HTTP server will receive (e.g. `warden.bin`,
  /// `T_Ranger_BaseColor.png`).
  final Map<String, Uint8List> companionBytes;

  static Future<_HeroSourceAsset> load(String assetPath) async {
    final sourceJson = await rootBundle.loadString(assetPath);
    final document = jsonDecode(sourceJson) as Map<String, dynamic>;
    final companions = <String, Uint8List>{};

    Future<void> loadUri(String? uri) async {
      if (uri == null || uri.isEmpty || uri.startsWith('data:')) {
        return;
      }
      if (companions.containsKey(uri)) {
        return;
      }
      final siblingPath = _resolveSiblingAsset(assetPath, uri);
      final bytes = await rootBundle.load(siblingPath);
      companions[uri] = bytes.buffer.asUint8List();
    }

    for (final raw in document['buffers'] as List<dynamic>? ?? const []) {
      await loadUri((raw as Map<dynamic, dynamic>)['uri']?.toString());
    }
    for (final raw in document['images'] as List<dynamic>? ?? const []) {
      await loadUri((raw as Map<dynamic, dynamic>)['uri']?.toString());
    }

    return _HeroSourceAsset(
      assetPath: assetPath,
      document: document,
      companionBytes: companions,
    );
  }

  static String _resolveSiblingAsset(String assetPath, String relativeUri) {
    final lastSlash = assetPath.lastIndexOf('/');
    final directory = lastSlash == -1 ? '' : assetPath.substring(0, lastSlash);
    return directory.isEmpty ? relativeUri : '$directory/$relativeUri';
  }
}

class _HeroRecipe {
  const _HeroRecipe({
    required this.assetPath,
    this.slotNodes = const {},
  });

  /// Path to the per-archetype outfit glTF.
  final String assetPath;

  /// Maps each loadout slot ID to the mesh node names it controls.
  /// Body-part nodes are hidden when the slot is unlocked but toggled off,
  /// giving the blocky "body part = gear piece" visual metaphor.
  /// Slots absent from this map (trinket, relic, etc.) have no mesh change.
  final Map<String, List<String>> slotNodes;

  /// Kenney Blocky Character mesh nodes shared by all four archetypes.
  static const Map<String, List<String>> _kenneySlotNodes = {
    'head': ['head'],
    'chest': ['torso'],
    'mantle': ['arm-left', 'arm-right'],
    'legs': ['leg-left', 'leg-right'],
  };

  Iterable<String> hiddenMeshNodesFor(
    List<ArmoryInventorySlotState> loadout,
  ) sync* {
    for (final slot in loadout) {
      // Only hide when the slot is unlocked AND explicitly toggled off.
      // Locked slots keep their body part visible so the character always
      // has a complete silhouette until the player earns and removes gear.
      if (!slot.isUnlocked || slot.isEquipped) continue;
      final nodes = slotNodes[slot.slotId];
      if (nodes == null) continue;
      yield* nodes;
    }
  }

  static _HeroRecipe forPreset(String heroPresetId) {
    switch (heroPresetId) {
      case 'warden':
        return const _HeroRecipe(
          assetPath: 'assets/armory/modular/heroes/warden_k.gltf',
          slotNodes: _HeroRecipe._kenneySlotNodes,
        );
      case 'seer':
        return const _HeroRecipe(
          assetPath: 'assets/armory/modular/heroes/seer_k.gltf',
          slotNodes: _HeroRecipe._kenneySlotNodes,
        );
      case 'rider':
        return const _HeroRecipe(
          assetPath: 'assets/armory/modular/heroes/rider_k.gltf',
          slotNodes: _HeroRecipe._kenneySlotNodes,
        );
      case 'wayfarer':
      default:
        return const _HeroRecipe(
          assetPath: 'assets/armory/modular/heroes/wayfarer_k.gltf',
          slotNodes: _HeroRecipe._kenneySlotNodes,
        );
    }
  }
}

/// Removes the named nodes from the glTF document by detaching them from
/// their parent's `children` list AND from any scene's `nodes` root list.
/// The underlying mesh stays in the document — we just stop drawing it.
void _detachMeshNodesByName(
  Map<String, dynamic> document,
  Iterable<String> nodeNames,
) {
  if (nodeNames.isEmpty) return;
  final nodes = document['nodes'] as List<dynamic>? ?? const <dynamic>[];
  if (nodes.isEmpty) return;
  final scenes = document['scenes'] as List<dynamic>? ?? const <dynamic>[];

  final wanted = nodeNames.toSet();
  final indicesToDetach = <int>[];
  for (var i = 0; i < nodes.length; i += 1) {
    final node = nodes[i] as Map<String, dynamic>;
    if (wanted.contains(node['name'])) {
      indicesToDetach.add(i);
    }
  }
  if (indicesToDetach.isEmpty) return;

  for (final nodeIndex in indicesToDetach) {
    for (final scene in scenes) {
      final sceneMap = scene as Map<String, dynamic>;
      final sceneNodes = sceneMap['nodes'] as List<dynamic>?;
      sceneNodes?.remove(nodeIndex);
    }
    for (final node in nodes) {
      final nodeMap = node as Map<String, dynamic>;
      final children = nodeMap['children'] as List<dynamic>?;
      children?.remove(nodeIndex);
    }
  }
}

/// Rotates the upper arm bones from T-pose to A-pose (~35° down from
/// horizontal) so the character stands naturally instead of with arms
/// fully extended sideways. All four outfit GLTFs share the same UE5
/// Mannequin skeleton, so the corrected quaternions are constant.
///
/// Derived from FK: upperarm local-Y points along the arm in world space.
/// At T-pose that direction is (1, 0, 0); the correction applies a −35°
/// world-Z rotation, yielding (0.819, −0.573, 0) ≈ 35° below horizontal.
void _applyApose(Map<String, dynamic> document) {
  final nodes = document['nodes'] as List<dynamic>? ?? const <dynamic>[];
  for (final raw in nodes) {
    final node = raw as Map<String, dynamic>;
    switch (node['name'] as String?) {
      case 'upperarm_l':
        node['rotation'] = [-0.047691, 0.711708, -0.362218, 0.599996];
      case 'upperarm_r':
        node['rotation'] = [-0.047691, -0.711708, 0.362218, 0.599996];
    }
  }
}

Map<String, dynamic> _cloneDocument(Map<String, dynamic> source) {
  // Cheap deep clone via JSON round-trip. The composer mutates the document
  // (detaching nodes) so we never share state across calls.
  return jsonDecode(jsonEncode(source)) as Map<String, dynamic>;
}
