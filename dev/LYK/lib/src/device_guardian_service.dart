import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class DeviceGuardianService {
  const DeviceGuardianService();

  static const MethodChannel _channel = MethodChannel('lyk/device_guardian');

  bool get isAndroid =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  bool get isIos => !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  bool get supportsNativeGuardianTools => isAndroid || isIos;

  Future<bool> hasUsageAccess() async {
    if (!isAndroid) {
      return false;
    }
    return _invokeBool('hasUsageAccess');
  }

  Future<bool> isDeviceAdminActive() async {
    if (!isAndroid) {
      return false;
    }
    return _invokeBool('isDeviceAdminActive');
  }

  Future<void> openUsageAccessSettings() async {
    if (!isAndroid) {
      throw PlatformException(
        code: 'unsupported_platform',
        message: 'Usage access is currently wired for Android only.',
      );
    }
    await _channel.invokeMethod<void>('openUsageAccessSettings');
  }

  Future<void> openDeviceAdminSetup() async {
    if (!isAndroid) {
      throw PlatformException(
        code: 'unsupported_platform',
        message: 'Device admin lock access is Android only.',
      );
    }
    await _channel.invokeMethod<void>('openDeviceAdminSetup');
  }

  Future<bool> lockNow() async {
    if (!isAndroid) {
      throw PlatformException(
        code: 'unsupported_platform',
        message: 'iOS does not allow third-party apps to lock the phone.',
      );
    }
    return _invokeBool('lockNow');
  }

  Future<void> setSessionGuardActive(bool active) async {
    if (!isAndroid) {
      return;
    }

    try {
      await _channel.invokeMethod<void>(
        'setSessionGuardActive',
        <String, Object>{'active': active},
      );
    } on MissingPluginException {
      return;
    } on PlatformException {
      return;
    }
  }

  Future<bool> isManagedAppBlockingAvailable() async {
    if (!isAndroid) {
      return false;
    }
    return _invokeBool('isManagedAppBlockingAvailable');
  }

  Future<List<AppBlockTarget>> loadBrowsersAndGamesPreview() async {
    if (!isAndroid) {
      return const [];
    }

    try {
      final result = await _channel.invokeListMethod<dynamic>(
        'browsersAndGamesPreview',
      );
      return (result ?? const <dynamic>[])
          .whereType<Map<dynamic, dynamic>>()
          .map(AppBlockTarget.fromPlatformMap)
          .toList();
    } on MissingPluginException {
      return const [];
    } on PlatformException {
      return const [];
    }
  }

  Future<AppBlockResult> blockBrowsersAndGames() async {
    if (!isAndroid) {
      return const AppBlockResult.unsupported();
    }

    return _invokeBlockResult('blockBrowsersAndGames');
  }

  Future<AppBlockResult> unblockBlockedApps() async {
    if (!isAndroid) {
      return const AppBlockResult.unsupported();
    }

    return _invokeBlockResult('unblockBlockedApps');
  }

  Future<List<UsageReportItem>> loadUsageReport({
    Duration window = const Duration(hours: 24),
  }) async {
    if (!isAndroid) {
      return const [];
    }

    try {
      final result = await _channel.invokeListMethod<dynamic>(
        'usageReport',
        <String, Object>{'minutes': window.inMinutes},
      );
      return (result ?? const <dynamic>[])
          .whereType<Map<dynamic, dynamic>>()
          .map(UsageReportItem.fromPlatformMap)
          .where((item) => item.minutesUsed > 0)
          .toList();
    } on MissingPluginException {
      return const [];
    } on PlatformException {
      return const [];
    }
  }

  Future<bool> _invokeBool(String method) async {
    try {
      return await _channel.invokeMethod<bool>(method) ?? false;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
  }

  Future<AppBlockResult> _invokeBlockResult(String method) async {
    try {
      final result = await _channel.invokeMapMethod<dynamic, dynamic>(method);
      if (result == null) {
        return const AppBlockResult.unsupported();
      }
      return AppBlockResult.fromPlatformMap(result);
    } on MissingPluginException {
      return const AppBlockResult.unsupported();
    } on PlatformException {
      return const AppBlockResult.unsupported();
    }
  }
}

class AppBlockTarget {
  const AppBlockTarget({
    required this.appName,
    required this.packageName,
    required this.reason,
  });

  final String appName;
  final String packageName;
  final String reason;

  factory AppBlockTarget.fromPlatformMap(Map<dynamic, dynamic> map) {
    return AppBlockTarget(
      appName: map['appName'] as String? ?? 'Unknown app',
      packageName: map['packageName'] as String? ?? 'unknown',
      reason: map['reason'] as String? ?? 'app',
    );
  }
}

class AppBlockResult {
  const AppBlockResult({
    required this.supported,
    required this.attempted,
    required this.affected,
    required this.failed,
    required this.appNames,
  });

  const AppBlockResult.unsupported()
    : supported = false,
      attempted = 0,
      affected = 0,
      failed = 0,
      appNames = const [];

  final bool supported;
  final int attempted;
  final int affected;
  final int failed;
  final List<String> appNames;

  factory AppBlockResult.fromPlatformMap(Map<dynamic, dynamic> map) {
    final names = map['appNames'];

    return AppBlockResult(
      supported: map['supported'] as bool? ?? false,
      attempted: (map['attempted'] as num?)?.round() ?? 0,
      affected: (map['affected'] as num?)?.round() ?? 0,
      failed: (map['failed'] as num?)?.round() ?? 0,
      appNames: names is List
          ? names.whereType<String>().toList(growable: false)
          : const [],
    );
  }
}

class UsageReportItem {
  const UsageReportItem({
    required this.appName,
    required this.packageName,
    required this.minutesUsed,
    this.lastUsed,
  });

  final String appName;
  final String packageName;
  final int minutesUsed;
  final DateTime? lastUsed;

  factory UsageReportItem.fromPlatformMap(Map<dynamic, dynamic> map) {
    final lastUsedMillis = map['lastUsedMillis'];

    return UsageReportItem(
      appName: (map['appName'] as String?)?.trim().isNotEmpty == true
          ? map['appName'] as String
          : map['packageName'] as String? ?? 'Unknown app',
      packageName: map['packageName'] as String? ?? 'unknown',
      minutesUsed: (map['minutesUsed'] as num?)?.round() ?? 0,
      lastUsed: lastUsedMillis is num && lastUsedMillis > 0
          ? DateTime.fromMillisecondsSinceEpoch(lastUsedMillis.round())
          : null,
    );
  }

  String get formattedDuration {
    final hours = minutesUsed ~/ 60;
    final minutes = minutesUsed % 60;

    if (hours == 0) {
      return '${minutes}m';
    }
    if (minutes == 0) {
      return '${hours}h';
    }
    return '${hours}h ${minutes}m';
  }

  static const sample = <UsageReportItem>[
    UsageReportItem(
      appName: 'YouTube',
      packageName: 'com.google.android.youtube',
      minutesUsed: 74,
    ),
    UsageReportItem(
      appName: 'TikTok',
      packageName: 'com.zhiliaoapp.musically',
      minutesUsed: 41,
    ),
    UsageReportItem(
      appName: 'Chrome',
      packageName: 'com.android.chrome',
      minutesUsed: 28,
    ),
    UsageReportItem(
      appName: 'Messages',
      packageName: 'com.google.android.apps.messaging',
      minutesUsed: 11,
    ),
  ];
}
