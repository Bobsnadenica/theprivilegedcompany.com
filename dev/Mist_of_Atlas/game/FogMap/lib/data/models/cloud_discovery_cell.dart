class CloudDiscoveryCell {
  const CloudDiscoveryCell({
    required this.cellId,
    required this.latitude,
    required this.longitude,
  });

  final String cellId;
  final double latitude;
  final double longitude;

  Map<String, dynamic> toJson() => {
        'cellId': cellId,
        'lat': latitude,
        'lon': longitude,
      };

  @override
  bool operator ==(Object other) =>
      other is CloudDiscoveryCell && other.cellId == cellId;

  @override
  int get hashCode => cellId.hashCode;
}