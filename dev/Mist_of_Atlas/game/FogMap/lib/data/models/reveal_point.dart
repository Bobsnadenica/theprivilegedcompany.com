class RevealPoint {
  const RevealPoint({
    required this.latitude,
    required this.longitude,
    required this.discoveredAtIso,
  });

  final double latitude;
  final double longitude;
  final String discoveredAtIso;

  Map<String, dynamic> toJson() => {
        'latitude': latitude,
        'longitude': longitude,
        'discoveredAtIso': discoveredAtIso,
      };

  factory RevealPoint.fromJson(Map<String, dynamic> json) {
    return RevealPoint(
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      discoveredAtIso: json['discoveredAtIso'] as String,
    );
  }
}