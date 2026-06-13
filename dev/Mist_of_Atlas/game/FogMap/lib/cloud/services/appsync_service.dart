import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../data/models/cloud_discovery_cell.dart';
import '../auth/cognito_auth_service.dart';
import '../backend_config.dart';
import '../models/landmark_models.dart';
import '../models/shared_viewport_models.dart';

class AppSyncService {
  AppSyncService({
    required this.authService,
    http.Client? client,
  })  : _client = client ?? http.Client(),
        _ownsClient = client == null;

  final CognitoAuthService authService;
  final http.Client _client;
  final bool _ownsClient;
  bool _disposed = false;
  bool _supportsProfileIconSync = true;
  bool _supportsProfileIconViewport = true;
  bool _supportsSharedPresenceQuery = true;
  DateTime? _profileIconSyncFallbackAt;
  DateTime? _profileIconViewportFallbackAt;
  DateTime? _sharedPresenceFallbackAt;

  /// Once a request fails because the backend predates a schema field, we drop
  /// to the legacy query for the rest of the session. After the backend
  /// redeploys, we'd otherwise stay on the legacy path forever — so we
  /// re-enable optimistically after this window. 30 minutes is short enough
  /// to recover from a deploy quickly without thrashing on a still-old API.
  static const Duration _legacyFallbackRetryWindow = Duration(minutes: 30);

  bool _shouldRetryLegacyFallback(DateTime? markedAt) {
    if (markedAt == null) return false;
    return DateTime.now().toUtc().difference(markedAt) >=
        _legacyFallbackRetryWindow;
  }

  Future<void> syncDiscoveries({
    required List<CloudDiscoveryCell> cells,
    required double? currentLat,
    required double? currentLon,
    required int mapZoom,
    required String displayName,
    required String profileIcon,
  }) async {
    final variables = {
      'worldId': BackendConfig.defaultWorldId,
      'cellsJson': jsonEncode(cells.map((e) => e.toJson()).toList()),
      'currentLat': currentLat,
      'currentLon': currentLon,
      'mapZoom': mapZoom,
      'displayName': displayName,
    };

    if (!_supportsProfileIconSync &&
        !_shouldRetryLegacyFallback(_profileIconSyncFallbackAt)) {
      await _post(
        query: _legacySyncDiscoveriesMutation,
        variables: variables,
      );
      return;
    }

    if (_shouldRetryLegacyFallback(_profileIconSyncFallbackAt)) {
      _supportsProfileIconSync = true;
      _profileIconSyncFallbackAt = null;
    }

    try {
      await _post(
        query: '''
mutation SyncDiscoveries(
  \$worldId: String
  \$cellsJson: AWSJSON!
  \$currentLat: Float
  \$currentLon: Float
  \$mapZoom: Int
  \$displayName: String
  \$profileIcon: String
) {
  syncDiscoveries(
    worldId: \$worldId
    cellsJson: \$cellsJson
    currentLat: \$currentLat
    currentLon: \$currentLon
    mapZoom: \$mapZoom
    displayName: \$displayName
    profileIcon: \$profileIcon
  ) {
    acceptedCellCount
    newPersonalCellCount
    updatedSharedCellCount
    trackingActive
    timestamp
  }
}
''',
        variables: {
          ...variables,
          'profileIcon': profileIcon,
        },
      );
    } catch (e) {
      if (!_isLegacyProfileIconSchemaError(e)) rethrow;
      _supportsProfileIconSync = false;
      _profileIconSyncFallbackAt = DateTime.now().toUtc();
      await _post(
        query: _legacySyncDiscoveriesMutation,
        variables: variables,
      );
    }
  }

  Future<SharedViewportResponse> getSharedViewport({
    required double minLat,
    required double maxLat,
    required double minLon,
    required double maxLon,
    required int zoom,
  }) async {
    final variables = {
      'worldId': BackendConfig.defaultWorldId,
      'minLat': minLat,
      'maxLat': maxLat,
      'minLon': minLon,
      'maxLon': maxLon,
      'zoom': zoom,
    };

    if (!_supportsProfileIconViewport &&
        !_shouldRetryLegacyFallback(_profileIconViewportFallbackAt)) {
      final data = await _post(
        query: _legacySharedViewportQuery,
        variables: variables,
      );
      return SharedViewportResponse.fromJson(_asMap(data['getSharedViewport']));
    }

    if (_shouldRetryLegacyFallback(_profileIconViewportFallbackAt)) {
      _supportsProfileIconViewport = true;
      _profileIconViewportFallbackAt = null;
    }

    try {
      final data = await _post(
        query: r'''
query GetSharedViewport(
  $worldId: String
  $minLat: Float!
  $maxLat: Float!
  $minLon: Float!
  $maxLon: Float!
  $zoom: Int!
) {
  getSharedViewport(
    worldId: $worldId
    minLat: $minLat
    maxLat: $maxLat
    minLon: $minLon
    maxLon: $maxLon
    zoom: $zoom
  ) {
    worldId
    generatedAt
    cells { cellId lat lon discovererCount tileId lastDiscoveredAt }
    players { userId displayName profileIcon lat lon lastSeenAt }
    landmarks { landmarkId title description category lat lon status approvedObjectKey createdAt }
  }
}
''',
        variables: variables,
      );

      return SharedViewportResponse.fromJson(
        _asMap(data['getSharedViewport']),
      );
    } catch (e) {
      if (!_isLegacyProfileIconSchemaError(e)) rethrow;
      _supportsProfileIconViewport = false;
      _profileIconViewportFallbackAt = DateTime.now().toUtc();
      final data = await _post(
        query: _legacySharedViewportQuery,
        variables: variables,
      );
      return SharedViewportResponse.fromJson(_asMap(data['getSharedViewport']));
    }
  }

  Future<List<SharedPlayer>> getSharedPresence({
    required double minLat,
    required double maxLat,
    required double minLon,
    required double maxLon,
    required int zoom,
  }) async {
    final variables = {
      'worldId': BackendConfig.defaultWorldId,
      'minLat': minLat,
      'maxLat': maxLat,
      'minLon': minLon,
      'maxLon': maxLon,
      'zoom': zoom,
    };

    if (!_supportsSharedPresenceQuery &&
        !_shouldRetryLegacyFallback(_sharedPresenceFallbackAt)) {
      return (await getSharedViewport(
        minLat: minLat,
        maxLat: maxLat,
        minLon: minLon,
        maxLon: maxLon,
        zoom: zoom,
      ))
          .players;
    }

    if (_shouldRetryLegacyFallback(_sharedPresenceFallbackAt)) {
      _supportsSharedPresenceQuery = true;
      _sharedPresenceFallbackAt = null;
    }

    try {
      final data = await _post(
        query: r'''
query GetSharedPresence(
  $worldId: String
  $minLat: Float!
  $maxLat: Float!
  $minLon: Float!
  $maxLon: Float!
  $zoom: Int!
) {
  getSharedPresence(
    worldId: $worldId
    minLat: $minLat
    maxLat: $maxLat
    minLon: $minLon
    maxLon: $maxLon
    zoom: $zoom
  ) {
    worldId
    generatedAt
    players { userId displayName profileIcon lat lon lastSeenAt }
  }
}
''',
        variables: variables,
      );

      final root = _asMap(data['getSharedPresence']);
      return ((root['players'] as List?) ?? const [])
          .map((e) => SharedPlayer.fromJson(_asMap(e)))
          .toList(growable: false);
    } catch (e) {
      if (!_isLegacyFieldUndefinedError(e, 'getsharedpresence')) rethrow;
      _supportsSharedPresenceQuery = false;
      _sharedPresenceFallbackAt = DateTime.now().toUtc();
      return (await getSharedViewport(
        minLat: minLat,
        maxLat: maxLat,
        minLon: minLon,
        maxLon: maxLon,
        zoom: zoom,
      ))
          .players;
    }
  }

  Future<LandmarkUploadTicket> createLandmarkUploadTicket({
    required String title,
    required String description,
    required String category,
    required double lat,
    required double lon,
    required String filename,
    required String contentType,
    required int byteLength,
    required int mapZoom,
  }) async {
    final data = await _post(
      query: '''
mutation CreateLandmarkUploadTicket(
  \$worldId: String
  \$title: String!
  \$description: String
  \$category: String!
  \$lat: Float!
  \$lon: Float!
  \$filename: String!
  \$contentType: String!
  \$byteLength: Int!
  \$mapZoom: Int
) {
  createLandmarkUploadTicket(
    worldId: \$worldId
    title: \$title
    description: \$description
    category: \$category
    lat: \$lat
    lon: \$lon
    filename: \$filename
    contentType: \$contentType
    byteLength: \$byteLength
    mapZoom: \$mapZoom
  ) {
    landmarkId
    uploadToken
    objectKey
    uploadUrl
    uploadFieldsJson
    expiresAt
    maxBytes
  }
}
''',
      variables: {
        'worldId': BackendConfig.defaultWorldId,
        'title': title,
        'description': description,
        'category': category,
        'lat': lat,
        'lon': lon,
        'filename': filename,
        'contentType': contentType,
        'byteLength': byteLength,
        'mapZoom': mapZoom,
      },
    );

    return LandmarkUploadTicket.fromJson(
      _asMap(data['createLandmarkUploadTicket']),
    );
  }

  Future<void> finalizeLandmarkUpload({
    required String landmarkId,
    required String uploadToken,
  }) async {
    await _post(
      query: '''
mutation FinalizeLandmarkUpload(\$landmarkId: ID!, \$uploadToken: String!) {
  finalizeLandmarkUpload(landmarkId: \$landmarkId, uploadToken: \$uploadToken) {
    landmarkId
    status
    message
  }
}
''',
      variables: {
        'landmarkId': landmarkId,
        'uploadToken': uploadToken,
      },
    );
  }

  Future<List<PendingLandmark>> listPendingLandmarks() async {
    final data = await _post(
      query: '''
query ListPendingLandmarks {
  listPendingLandmarks {
    items {
      landmarkId
      title
      description
      category
      lat
      lon
      status
      createdAt
      userId
    }
    nextToken
  }
}
''',
      variables: const {},
    );

    final page = _asMap(data['listPendingLandmarks']);
    return ((page['items'] as List?) ?? const [])
        .map(
          (e) => PendingLandmark.fromJson(
            _asMap(e),
          ),
        )
        .toList();
  }

  Future<String> getPendingLandmarkReviewUrl(String landmarkId) async {
    final data = await _post(
      query: '''
query GetPendingLandmarkReviewUrl(\$landmarkId: ID!) {
  getPendingLandmarkReviewUrl(landmarkId: \$landmarkId) {
    viewUrl
    expiresAt
  }
}
''',
      variables: {'landmarkId': landmarkId},
    );

    final payload = _asMap(data['getPendingLandmarkReviewUrl']);
    return payload['viewUrl'] as String;
  }

  Future<void> moderateLandmark({
    required String landmarkId,
    required bool approve,
    String moderationNotes = '',
  }) async {
    await _post(
      query: '''
mutation ModerateLandmark(\$landmarkId: ID!, \$approve: Boolean!, \$moderationNotes: String) {
  moderateLandmark(
    landmarkId: \$landmarkId
    approve: \$approve
    moderationNotes: \$moderationNotes
  ) {
    landmarkId
    status
    approvedObjectKey
  }
}
''',
      variables: {
        'landmarkId': landmarkId,
        'approve': approve,
        'moderationNotes': moderationNotes,
      },
    );
  }

  Future<String> getLandmarkViewUrl(String landmarkId) async {
    final data = await _post(
      query: '''
query GetLandmarkViewUrl(\$landmarkId: ID!) {
  getLandmarkViewUrl(landmarkId: \$landmarkId) {
    viewUrl
    expiresAt
  }
}
''',
      variables: {'landmarkId': landmarkId},
    );

    final payload = _asMap(data['getLandmarkViewUrl']);
    return payload['viewUrl'] as String;
  }

  Future<List<CloudDiscoveryCell>> getMyDiscoveryBootstrap() async {
    final data = await _post(
      query: '''
query GetMyDiscoveryBootstrap(\$worldId: String) {
  getMyDiscoveryBootstrap(worldId: \$worldId) {
    cells {
      cellId
      lat
      lon
    }
  }
}
''',
      variables: {'worldId': BackendConfig.defaultWorldId},
    );

    final root = _asMap(data['getMyDiscoveryBootstrap']);
    final items = (root['cells'] as List?) ?? const [];
    return items.map((e) {
      final map = _asMap(e);
      return CloudDiscoveryCell(
        cellId: map['cellId'] as String,
        latitude: (map['lat'] as num).toDouble(),
        longitude: (map['lon'] as num).toDouble(),
      );
    }).toList();
  }

  void dispose() {
    if (_disposed) return;
    if (_ownsClient) {
      _client.close();
    }
    _disposed = true;
  }

  Future<Map<String, dynamic>> _post({
    required String query,
    required Map<String, dynamic> variables,
  }) async {
    if (_disposed) {
      throw StateError('AppSyncService has been disposed.');
    }

    final token = await authService.getIdToken();
    if (token == null || token.isEmpty) {
      throw Exception('Please sign in to use cloud features.');
    }

    final response = await _client
        .post(
          Uri.parse(BackendConfig.appSyncGraphqlUrl),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token,
          },
          body: jsonEncode({
            'query': query,
            'variables': variables,
          }),
        )
        .timeout(
          const Duration(seconds: 20),
          onTimeout: () => throw Exception(
            'Cloud request timed out. Check your network connection and try again.',
          ),
        );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        'GraphQL request failed (${response.statusCode}): ${response.body}',
      );
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    final errors = decoded['errors'] as List<dynamic>?;
    if (errors != null && errors.isNotEmpty) {
      final messages = errors
          .map((error) => _asMap(error)['message']?.toString().trim())
          .whereType<String>()
          .where((message) => message.isNotEmpty)
          .toList();
      throw Exception(
        messages.isEmpty ? 'Unknown GraphQL error' : messages.join(' | '),
      );
    }

    return _asMap(decoded['data']);
  }

  Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    if (value is String) {
      final decoded = jsonDecode(value);
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
    }
    throw Exception(
      'Expected object but got ${value.runtimeType}: $value',
    );
  }

  bool _isLegacyProfileIconSchemaError(Object error) {
    final text = error.toString().toLowerCase();
    final referencesProfileIcon = text.contains('profileicon') ||
        text.contains('profile_icon') ||
        text.contains('profile icon');
    return referencesProfileIcon && _isValidationSchemaErrorText(text);
  }

  bool _isLegacyFieldUndefinedError(Object error, String fieldName) {
    final text = error.toString().toLowerCase();
    return text.contains(fieldName.toLowerCase()) &&
        _isValidationSchemaErrorText(text);
  }

  bool _isValidationSchemaErrorText(String text) {
    return text.contains('fieldundefined') ||
        text.contains('field undefined') ||
        text.contains('unknown argument') ||
        text.contains('validation error');
  }

  static const String _legacySyncDiscoveriesMutation = '''
mutation SyncDiscoveries(
  \$worldId: String
  \$cellsJson: AWSJSON!
  \$currentLat: Float
  \$currentLon: Float
  \$mapZoom: Int
  \$displayName: String
) {
  syncDiscoveries(
    worldId: \$worldId
    cellsJson: \$cellsJson
    currentLat: \$currentLat
    currentLon: \$currentLon
    mapZoom: \$mapZoom
    displayName: \$displayName
  ) {
    acceptedCellCount
    newPersonalCellCount
    updatedSharedCellCount
    trackingActive
    timestamp
  }
}
''';

  static const String _legacySharedViewportQuery = '''
query GetSharedViewport(
  \$worldId: String
  \$minLat: Float!
  \$maxLat: Float!
  \$minLon: Float!
  \$maxLon: Float!
  \$zoom: Int!
) {
  getSharedViewport(
    worldId: \$worldId
    minLat: \$minLat
    maxLat: \$maxLat
    minLon: \$minLon
    maxLon: \$maxLon
    zoom: \$zoom
  ) {
    worldId
    generatedAt
    cells { cellId lat lon discovererCount tileId lastDiscoveredAt }
    players { userId displayName lat lon lastSeenAt }
    landmarks { landmarkId title description category lat lon status approvedObjectKey createdAt }
  }
}
''';
}
