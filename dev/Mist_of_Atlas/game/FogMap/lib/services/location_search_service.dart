import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/constants/app_constants.dart';

class LocationSearchService {
  LocationSearchService({http.Client? client})
      : _client = client ?? http.Client();

  final http.Client _client;

  static const _acceptedTypes = <String>{
    'city',
    'town',
    'village',
    'municipality',
    'administrative',
    'hamlet',
    'suburb',
  };

  Future<List<LocationSearchResult>> searchCities(String query) async {
    final normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      return const <LocationSearchResult>[];
    }

    final uri = Uri.https('nominatim.openstreetmap.org', '/search', {
      'q': normalizedQuery,
      'format': 'jsonv2',
      'addressdetails': '1',
      'limit': '8',
    });

    final response = await _client.get(
      uri,
      headers: const {
        'Accept': 'application/json',
        'User-Agent':
            '${AppConstants.userAgentPackageName} (${AppConstants.appName})',
      },
    ).timeout(const Duration(seconds: 8));

    if (response.statusCode != 200) {
      throw Exception('Search failed (${response.statusCode})');
    }

    final payload = jsonDecode(response.body);
    if (payload is! List) {
      return const <LocationSearchResult>[];
    }

    return payload
        .whereType<Map<String, dynamic>>()
        .map(LocationSearchResult.fromJson)
        .where((result) => _acceptedTypes.contains(result.type))
        .toList(growable: false);
  }

  void dispose() => _client.close();
}

class LocationSearchResult {
  const LocationSearchResult({
    required this.label,
    required this.subtitle,
    required this.latitude,
    required this.longitude,
    required this.type,
  });

  final String label;
  final String subtitle;
  final double latitude;
  final double longitude;
  final String type;

  factory LocationSearchResult.fromJson(Map<String, dynamic> json) {
    final address = json['address'];
    final addressMap =
        address is Map<String, dynamic> ? address : const <String, dynamic>{};
    final label = (addressMap['city'] ??
            addressMap['town'] ??
            addressMap['village'] ??
            addressMap['municipality'] ??
            addressMap['hamlet'] ??
            json['name'] ??
            json['display_name'] ??
            'Unknown location')
        .toString();

    final subtitleParts = <String>[
      if (addressMap['state'] != null) addressMap['state'].toString(),
      if (addressMap['country'] != null) addressMap['country'].toString(),
    ];

    return LocationSearchResult(
      label: label,
      subtitle: subtitleParts.join(', '),
      latitude: double.parse(json['lat'].toString()),
      longitude: double.parse(json['lon'].toString()),
      type: (json['type'] ?? '').toString(),
    );
  }
}
