import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:model_viewer_plus/model_viewer_plus.dart';

class AssetBackedModelViewer extends StatefulWidget {
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
  final Map<String, Uint8List> inlineAssets;
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
  State<AssetBackedModelViewer> createState() => _AssetBackedModelViewerState();
}

class _AssetBackedModelViewerState extends State<AssetBackedModelViewer> {
  HttpServer? _server;
  String? _localSrc;
  Object? _startupError;

  @override
  void initState() {
    super.initState();
    unawaited(_startServer());
  }

  @override
  void didUpdateWidget(covariant AssetBackedModelViewer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.assetPath != widget.assetPath ||
        oldWidget.modelJson != widget.modelJson ||
        oldWidget.assetAliases.length != widget.assetAliases.length ||
        oldWidget.inlineAssets.length != widget.inlineAssets.length) {
      unawaited(_restartServer());
    }
  }

  @override
  void dispose() {
    unawaited(_server?.close(force: true));
    super.dispose();
  }

  Future<void> _restartServer() async {
    await _server?.close(force: true);
    if (!mounted) return;
    setState(() {
      _server = null;
      _localSrc = null;
      _startupError = null;
    });
    await _startServer();
  }

  Future<void> _startServer() async {
    try {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      server.listen(_handleRequest);
      if (!mounted) {
        await server.close(force: true);
        return;
      }
      setState(() {
        _server = server;
        _localSrc = 'http://127.0.0.1:${server.port}/model.gltf';
        _startupError = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _startupError = error;
      });
    }
  }

  Future<void> _handleRequest(HttpRequest request) async {
    try {
      _applyCorsHeaders(request.response);

      if (request.method == 'OPTIONS') {
        request.response.statusCode = HttpStatus.noContent;
        await request.response.close();
        return;
      }

      if (request.method != 'GET' && request.method != 'HEAD') {
        request.response.statusCode = HttpStatus.methodNotAllowed;
        await request.response.close();
        return;
      }

      final pathSegments = request.uri.pathSegments
          .where((segment) => segment.isNotEmpty)
          .toList(growable: false);
      if (pathSegments.isEmpty ||
          pathSegments.any((segment) => segment.contains('..'))) {
        request.response.statusCode = HttpStatus.notFound;
        await request.response.close();
        return;
      }

      final requestedPath = pathSegments.join('/');
      final servedInlineAsset = widget.inlineAssets[requestedPath];
      late final Uint8List bytes;
      if (widget.modelJson != null && requestedPath == 'model.gltf') {
        bytes = Uint8List.fromList(utf8.encode(widget.modelJson!));
      } else if (servedInlineAsset != null) {
        bytes = servedInlineAsset;
      } else {
        final assetToLoad = _assetPathForRequest(requestedPath);
        final data = await rootBundle.load(assetToLoad);
        bytes = data.buffer.asUint8List();
      }

      request.response.headers.contentType = _contentTypeFor(requestedPath);
      request.response.headers.set(
        HttpHeaders.cacheControlHeader,
        'public, max-age=86400',
      );
      request.response.headers.set(
        HttpHeaders.contentLengthHeader,
        bytes.length.toString(),
      );
      if (request.method != 'HEAD') {
        request.response.add(bytes);
      }
    } catch (_) {
      request.response.statusCode = HttpStatus.notFound;
    } finally {
      await request.response.close();
    }
  }

  void _applyCorsHeaders(HttpResponse response) {
    response.headers.set(HttpHeaders.accessControlAllowOriginHeader, '*');
    response.headers.set(
      HttpHeaders.accessControlAllowMethodsHeader,
      'GET, HEAD, OPTIONS',
    );
    response.headers.set(HttpHeaders.accessControlAllowHeadersHeader, '*');
  }

  String _assetPathForRequest(String requestPath) {
    final aliasedAssetPath = widget.assetAliases[requestPath];
    if (aliasedAssetPath != null) {
      return aliasedAssetPath;
    }
    if (requestPath == 'model.gltf' && widget.assetPath != null) {
      return widget.assetPath!;
    }

    final assetPath = widget.assetPath;
    if (assetPath == null) {
      throw StateError('No asset registered for "$requestPath"');
    }
    final lastSlash = assetPath.lastIndexOf('/');
    final directory = lastSlash == -1 ? '' : assetPath.substring(0, lastSlash);
    return directory.isEmpty ? requestPath : '$directory/$requestPath';
  }

  ContentType _contentTypeFor(String assetPath) {
    final lowercase = assetPath.toLowerCase();
    if (lowercase.endsWith('.gltf')) {
      return ContentType('model', 'gltf+json', charset: 'utf-8');
    }
    if (lowercase.endsWith('.json')) {
      return ContentType.json;
    }
    if (lowercase.endsWith('.bin')) {
      return ContentType.binary;
    }
    if (lowercase.endsWith('.png')) {
      return ContentType('image', 'png');
    }
    if (lowercase.endsWith('.jpg') || lowercase.endsWith('.jpeg')) {
      return ContentType('image', 'jpeg');
    }
    if (lowercase.endsWith('.webp')) {
      return ContentType('image', 'webp');
    }
    return ContentType.binary;
  }

  @override
  Widget build(BuildContext context) {
    if (_localSrc == null) {
      return DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0x220A0F14),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Center(
          child: _startupError == null
              ? const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2.2),
                )
              : Icon(
                  Icons.shield_outlined,
                  color: Theme.of(context).colorScheme.secondary,
                ),
        ),
      );
    }

    return ModelViewer(
      key: ValueKey(
        '${widget.assetPath}|${widget.modelJson?.hashCode ?? 0}|$_localSrc',
      ),
      src: _localSrc!,
      alt: widget.alt,
      backgroundColor: widget.backgroundColor,
      loading: widget.loading,
      reveal: widget.reveal,
      cameraControls: widget.cameraControls,
      disablePan: widget.disablePan,
      disableZoom: widget.disableZoom,
      autoRotate: widget.autoRotate,
      autoRotateDelay: widget.autoRotateDelay,
      rotationPerSecond: widget.rotationPerSecond,
      interactionPrompt: widget.interactionPrompt,
      cameraOrbit: widget.cameraOrbit,
      cameraTarget: widget.cameraTarget,
      fieldOfView: widget.fieldOfView,
      minCameraOrbit: widget.minCameraOrbit,
      maxCameraOrbit: widget.maxCameraOrbit,
      exposure: widget.exposure,
      animationName: widget.animationName,
      autoPlay: widget.autoPlay,
      environmentImage: widget.environmentImage,
      debugLogging: widget.debugLogging,
    );
  }
}
