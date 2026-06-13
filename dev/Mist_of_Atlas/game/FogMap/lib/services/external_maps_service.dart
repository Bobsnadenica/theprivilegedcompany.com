import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

class ExternalMapsService {
  const ExternalMapsService._();

  static Future<bool> openDirections({
    required double latitude,
    required double longitude,
    String label = 'Destination',
  }) async {
    final targets = <Uri>[
      if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS)
        Uri.parse(
          'https://maps.apple.com/?daddr=$latitude,$longitude&q=${Uri.encodeComponent(label)}',
        )
      else if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android)
        Uri(
          scheme: 'geo',
          path: '0,0',
          queryParameters: {
            'q': '$latitude,$longitude($label)',
          },
        ),
      Uri.parse(
        'https://www.google.com/maps/dir/?api=1&destination=$latitude,$longitude',
      ),
    ];

    for (final uri in targets) {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        return true;
      }
    }

    return false;
  }
}
