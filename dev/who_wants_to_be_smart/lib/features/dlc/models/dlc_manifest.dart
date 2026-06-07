// ─────────────────────────────────────────────────────────────────────────────
// Models for the remote manifest.json served by the DLC website.
//
// manifest.json shape:
// {
//   "manifest_version": 2,
//   "packs": [
//     {
//       "id": "animals",
//       "name": "Animal Kingdom",
//       "description": "Farm & jungle sounds",
//       "version": 1,
//       "download_url": "https://…/animals_v1.zip",
//       "icon_emoji": "🦁",
//       "question_count": 20,
//       "size_bytes": 4096000
//     }
//   ]
// }
// ─────────────────────────────────────────────────────────────────────────────

class DlcPack {
  const DlcPack({
    required this.id,
    required this.name,
    this.description,
    required this.version,
    required this.downloadUrl,
    this.iconEmoji = '📚',
    this.questionCount = 0,
    this.sizeBytes = 0,
    this.isComingSoon = false,
    this.priceEur,
    this.isInstalled = false,
    this.installedVersion,
    this.installedAt,
  });

  final String id;
  final String name;
  final String? description;
  final int version;
  final String downloadUrl;
  final String iconEmoji;
  final int questionCount;

  /// Raw download size in bytes — shown to users before download.
  final int sizeBytes;
  final bool isComingSoon;
  final double? priceEur;

  // ── Install state (set locally after DB check) ────────────────────────────
  final bool isInstalled;
  final int? installedVersion;
  final DateTime? installedAt;

  // ── Derived ───────────────────────────────────────────────────────────────

  bool get hasUpdate => isInstalled && (installedVersion ?? 0) < version;
  String get sizeMb => '${(sizeBytes / 1048576).toStringAsFixed(1)} MB';
  String get priceLabel =>
      priceEur == null ? '' : '€${priceEur!.toStringAsFixed(2)}';

  // ── Convenience ───────────────────────────────────────────────────────────

  DlcPack copyWith({
    String? id,
    String? name,
    String? description,
    int? version,
    String? downloadUrl,
    String? iconEmoji,
    int? questionCount,
    int? sizeBytes,
    bool? isComingSoon,
    double? priceEur,
    bool? isInstalled,
    int? installedVersion,
    DateTime? installedAt,
  }) =>
      DlcPack(
        id: id ?? this.id,
        name: name ?? this.name,
        description: description ?? this.description,
        version: version ?? this.version,
        downloadUrl: downloadUrl ?? this.downloadUrl,
        iconEmoji: iconEmoji ?? this.iconEmoji,
        questionCount: questionCount ?? this.questionCount,
        sizeBytes: sizeBytes ?? this.sizeBytes,
        isComingSoon: isComingSoon ?? this.isComingSoon,
        priceEur: priceEur ?? this.priceEur,
        isInstalled: isInstalled ?? this.isInstalled,
        installedVersion: installedVersion ?? this.installedVersion,
        installedAt: installedAt ?? this.installedAt,
      );

  // ── Serialisation ─────────────────────────────────────────────────────────

  factory DlcPack.fromJson(Map<String, dynamic> json) => DlcPack(
        id: json['id'] as String,
        name: json['name'] as String,
        description: json['description'] as String?,
        version: json['version'] as int,
        downloadUrl: json['download_url'] as String,
        iconEmoji: json['icon_emoji'] as String? ?? '📚',
        questionCount: json['question_count'] as int? ?? 0,
        sizeBytes: json['size_bytes'] as int? ?? 0,
        isComingSoon: json['is_coming_soon'] as bool? ?? false,
        priceEur: (json['price_eur'] as num?)?.toDouble(),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        if (description != null) 'description': description,
        'version': version,
        'download_url': downloadUrl,
        'icon_emoji': iconEmoji,
        'question_count': questionCount,
        'size_bytes': sizeBytes,
        if (isComingSoon) 'is_coming_soon': true,
        if (priceEur != null) 'price_eur': priceEur,
      };

  /// Converts to the DB row format for `question_packs` table.
  Map<String, dynamic> toDbMap() => {
        'id': id,
        'name': name,
        'description': description,
        'version': version,
        'is_installed': isInstalled ? 1 : 0,
        'installed_at': installedAt?.millisecondsSinceEpoch,
        'icon_emoji': iconEmoji,
        'question_count': questionCount,
      };

  @override
  String toString() => 'DlcPack($id v$version, installed: $isInstalled)';
}

// ─────────────────────────────────────────────────────────────────────────────

class DlcManifest {
  const DlcManifest({
    required this.manifestVersion,
    required this.packs,
  });

  final int manifestVersion;
  final List<DlcPack> packs;

  factory DlcManifest.fromJson(Map<String, dynamic> json) => DlcManifest(
        manifestVersion: json['manifest_version'] as int? ?? 1,
        packs: (json['packs'] as List<dynamic>)
            .map((p) => DlcPack.fromJson(p as Map<String, dynamic>))
            .toList(),
      );

  @override
  String toString() => 'DlcManifest(v$manifestVersion, ${packs.length} packs)';
}
