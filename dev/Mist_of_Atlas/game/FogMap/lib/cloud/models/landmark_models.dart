import 'dart:convert';

class LandmarkUploadTicket {
  const LandmarkUploadTicket({
    required this.landmarkId,
    required this.uploadToken,
    required this.objectKey,
    required this.uploadUrl,
    required this.uploadFields,
    required this.expiresAt,
    required this.maxBytes,
  });

  final String landmarkId;
  final String uploadToken;
  final String objectKey;
  final String uploadUrl;
  final Map<String, String> uploadFields;
  final String expiresAt;
  final int maxBytes;

  factory LandmarkUploadTicket.fromJson(Map<String, dynamic> json) {
    return LandmarkUploadTicket(
      landmarkId: json['landmarkId'] as String,
      uploadToken: json['uploadToken'] as String,
      objectKey: json['objectKey'] as String,
      uploadUrl: json['uploadUrl'] as String,
      uploadFields: _parseUploadFields(json['uploadFieldsJson']),
      expiresAt: json['expiresAt'] as String,
      maxBytes: (json['maxBytes'] as num?)?.toInt() ?? 0,
    );
  }

  static Map<String, String> _parseUploadFields(dynamic rawUploadFields) {
    dynamic decoded = rawUploadFields;

    for (var depth = 0; depth < 3 && decoded is String; depth++) {
      final trimmed = decoded.trim();
      if (trimmed.isEmpty) {
        break;
      }

      try {
        decoded = jsonDecode(trimmed);
      } catch (_) {
        break;
      }
    }

    if (decoded is Map) {
      return Map<String, dynamic>.from(decoded).map(
        (key, value) => MapEntry(key, value.toString()),
      );
    }

    throw Exception(
      'uploadFieldsJson did not contain a JSON object: ${decoded.runtimeType}',
    );
  }
}

class PendingLandmark {
  const PendingLandmark({
    required this.landmarkId,
    required this.title,
    required this.description,
    required this.category,
    required this.lat,
    required this.lon,
    required this.status,
    required this.createdAt,
    required this.userId,
  });

  final String landmarkId;
  final String title;
  final String description;
  final String category;
  final double lat;
  final double lon;
  final String status;
  final String createdAt;
  final String userId;

  factory PendingLandmark.fromJson(Map<String, dynamic> json) {
    return PendingLandmark(
      landmarkId: json['landmarkId'] as String,
      title: json['title'] as String? ?? '',
      description: json['description'] as String? ?? '',
      category: json['category'] as String? ?? '',
      lat: (json['lat'] as num).toDouble(),
      lon: (json['lon'] as num).toDouble(),
      status: json['status'] as String? ?? '',
      createdAt: json['createdAt'] as String? ?? '',
      userId: json['userId'] as String? ?? '',
    );
  }
}
