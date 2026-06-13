import 'package:flutter/material.dart';
import 'package:model_viewer_plus/model_viewer_plus.dart';

class AssetBackedModelViewer extends StatelessWidget {
  const AssetBackedModelViewer({
    super.key,
    this.assetPath,
    this.modelJson,
    required this.alt,
    this.inlineAssets = const {},
    this.assetAliases = const {},
    this.backgroundColor = Colors.transparent,
    this.cameraControls = true,
    this.disablePan = true,
    this.disableZoom = true,
    this.autoRotate = true,
    this.autoRotateDelay = 0,
    this.rotationPerSecond = '18deg',
    this.cameraOrbit,
    this.cameraTarget,
    this.fieldOfView,
    this.minCameraOrbit,
    this.maxCameraOrbit,
    this.exposure,
    this.environmentImage = 'legacy',
    this.interactionPrompt = InteractionPrompt.none,
    this.loading = Loading.eager,
    this.reveal = Reveal.auto,
    this.animationName,
    this.autoPlay,
    this.debugLogging = false,
  }) : assert(assetPath != null || modelJson != null);

  final String? assetPath;
  final String? modelJson;
  final String alt;
  final Map<String, dynamic> inlineAssets;
  final Map<String, String> assetAliases;
  final Color backgroundColor;
  final bool cameraControls;
  final bool disablePan;
  final bool disableZoom;
  final bool autoRotate;
  final int autoRotateDelay;
  final String rotationPerSecond;
  final String? cameraOrbit;
  final String? cameraTarget;
  final String? fieldOfView;
  final String? minCameraOrbit;
  final String? maxCameraOrbit;
  final double? exposure;
  final String environmentImage;
  final InteractionPrompt interactionPrompt;
  final Loading loading;
  final Reveal reveal;
  final String? animationName;
  final bool? autoPlay;
  final bool debugLogging;

  @override
  Widget build(BuildContext context) {
    return ModelViewer(
      key: ValueKey('${assetPath ?? ''}|${modelJson?.hashCode ?? 0}'),
      src: assetPath ?? '',
      alt: alt,
      backgroundColor: backgroundColor,
      loading: loading,
      reveal: reveal,
      cameraControls: cameraControls,
      disablePan: disablePan,
      disableZoom: disableZoom,
      autoRotate: autoRotate,
      autoRotateDelay: autoRotateDelay,
      rotationPerSecond: rotationPerSecond,
      interactionPrompt: interactionPrompt,
      cameraOrbit: cameraOrbit,
      cameraTarget: cameraTarget,
      fieldOfView: fieldOfView,
      minCameraOrbit: minCameraOrbit,
      maxCameraOrbit: maxCameraOrbit,
      exposure: exposure,
      animationName: animationName,
      autoPlay: autoPlay,
      environmentImage: environmentImage,
      debugLogging: debugLogging,
    );
  }
}
