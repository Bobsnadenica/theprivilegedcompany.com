import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../l10n/generated/app_localizations.dart';
import 'device_guardian_service.dart';
import 'parent_guard_store.dart';

class GuardianHomePage extends StatefulWidget {
  const GuardianHomePage({super.key});

  @override
  State<GuardianHomePage> createState() => _GuardianHomePageState();
}

class _GuardianHomePageState extends State<GuardianHomePage>
    with WidgetsBindingObserver {
  final DeviceGuardianService _guardianService = const DeviceGuardianService();
  final ParentGuardStore _guardStore = ParentGuardStore();

  int _dailyLimitMinutes = 120;
  bool _blockAppsWhenLimitEnds = true;
  bool _sendReport = true;
  bool _usageAccessGranted = false;
  bool _deviceAdminActive = false;
  bool _managedAppBlockingAvailable = false;
  bool _loadingReport = true;
  bool _loadingAppBlocking = true;
  bool _usingLiveReport = false;
  bool _parentPasswordConfigured = false;
  bool _sessionLockedUntilParent = false;
  String? _statusMessage;
  DateTime? _sessionEndsAt;
  Duration _remaining = Duration.zero;
  Timer? _timer;
  List<UsageReportItem> _reportItems = UsageReportItem.sample;
  List<AppBlockTarget> _appBlockTargets = const [];

  bool get _sessionRunning =>
      _sessionEndsAt != null && !_sessionLockedUntilParent;

  bool get _sessionProtected => _sessionRunning || _sessionLockedUntilParent;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _bootstrap();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_sessionProtected) {
      return;
    }

    if (state == AppLifecycleState.resumed) {
      unawaited(_refreshAccessState());
      unawaited(_checkSessionDeadline());
      return;
    }

    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.hidden ||
        state == AppLifecycleState.paused) {
      unawaited(_guardianService.setSessionGuardActive(true));
      if (_sessionRunning) {
        unawaited(_guardianService.lockNow());
      }
    }
  }

  Future<void> _bootstrap() async {
    final passwordConfigured = await _guardStore.hasParentPassword();
    final lockedUntilParent = await _guardStore.loadSessionLockedUntilParent();
    final storedEndsAt = await _guardStore.loadSessionEndsAt();

    if (!mounted) {
      return;
    }

    setState(() {
      _parentPasswordConfigured = passwordConfigured;
      _sessionLockedUntilParent = lockedUntilParent;
      _sessionEndsAt = storedEndsAt;
      if (storedEndsAt != null) {
        _remaining = storedEndsAt.difference(DateTime.now());
      }
    });

    if (lockedUntilParent) {
      await _guardianService.setSessionGuardActive(true);
    } else if (storedEndsAt != null) {
      await _checkSessionDeadline();
      if (_sessionRunning) {
        await _guardianService.setSessionGuardActive(true);
        _startTicker();
      }
    }

    await Future.wait<void>([
      _refreshAccessState(),
      _refreshAppBlockingState(),
      _refreshReport(),
    ]);
  }

  Future<void> _refreshAccessState() async {
    final usageAccess = await _guardianService.hasUsageAccess();
    final adminActive = await _guardianService.isDeviceAdminActive();

    if (!mounted) {
      return;
    }

    setState(() {
      _usageAccessGranted = usageAccess;
      _deviceAdminActive = adminActive;
    });
  }

  Future<void> _refreshAppBlockingState() async {
    if (!mounted) {
      return;
    }

    setState(() {
      _loadingAppBlocking = true;
    });

    final available = await _guardianService.isManagedAppBlockingAvailable();
    final targets = await _guardianService.loadBrowsersAndGamesPreview();

    if (!mounted) {
      return;
    }

    setState(() {
      _managedAppBlockingAvailable = available;
      _appBlockTargets = targets;
      _loadingAppBlocking = false;
    });
  }

  Future<void> _refreshReport() async {
    if (!mounted) {
      return;
    }

    setState(() {
      _loadingReport = true;
    });

    final report = await _guardianService.loadUsageReport();

    if (!mounted) {
      return;
    }

    setState(() {
      _reportItems = report.isEmpty ? UsageReportItem.sample : report;
      _usingLiveReport = report.isNotEmpty;
      _loadingReport = false;
    });
  }

  Future<void> _openUsageAccess() async {
    final l10n = context.l10n;
    try {
      await _guardianService.openUsageAccessSettings();
      _showStatus(l10n.chooseLykAllowUsage);
      await Future<void>.delayed(const Duration(milliseconds: 700));
      await _refreshAccessState();
    } on PlatformException catch (error) {
      _showStatus(error.message ?? l10n.usageAccessUnavailable);
    }
  }

  Future<void> _openDeviceAdmin() async {
    final l10n = context.l10n;
    try {
      await _guardianService.openDeviceAdminSetup();
      _showStatus(l10n.enableLockAccessAndroid);
      await Future<void>.delayed(const Duration(milliseconds: 700));
      await _refreshAccessState();
    } on PlatformException catch (error) {
      _showStatus(error.message ?? l10n.deviceAdminUnavailable);
    }
  }

  Future<void> _lockNow() async {
    final l10n = context.l10n;
    try {
      final didLock = await _guardianService.lockNow();
      _showStatus(didLock ? l10n.lockCommandSent : l10n.enableAndroidLockFirst);
      await _refreshAccessState();
    } on PlatformException catch (error) {
      _showStatus(error.message ?? l10n.platformCannotLock);
    }
  }

  Future<void> _startSession() async {
    final l10n = context.l10n;
    final parentApproved = await _requireParentPassword(
      l10n.parentPasswordTitle,
      barrierDismissible: false,
    );
    if (!parentApproved || !mounted) {
      return;
    }

    _timer?.cancel();
    final endsAt = DateTime.now().add(Duration(minutes: _dailyLimitMinutes));
    await _guardStore.saveSessionEndsAt(endsAt);
    await _guardStore.saveSessionLockedUntilParent(false);
    await _guardianService.unblockBlockedApps();
    await _guardianService.setSessionGuardActive(true);

    setState(() {
      _sessionEndsAt = endsAt;
      _sessionLockedUntilParent = false;
      _remaining = endsAt.difference(DateTime.now());
    });

    _startTicker();
    _showStatus(l10n.supervisedSessionStarted);
  }

  Future<void> _requestStopSession() async {
    final l10n = context.l10n;
    final parentApproved = await _requireParentPassword(
      l10n.parentPasswordRequiredToStop,
      barrierDismissible: false,
    );
    if (!parentApproved) {
      return;
    }

    await _stopSession();
  }

  Future<void> _stopSession({bool showStatus = true}) async {
    _timer?.cancel();
    await _guardStore.saveSessionEndsAt(null);
    await _guardStore.saveSessionLockedUntilParent(false);
    await _guardianService.unblockBlockedApps();
    await _guardianService.setSessionGuardActive(false);

    if (!mounted) {
      return;
    }

    setState(() {
      _sessionEndsAt = null;
      _sessionLockedUntilParent = false;
      _remaining = Duration.zero;
    });

    if (showStatus) {
      _showStatus(context.l10n.supervisedSessionStopped);
    }
  }

  Future<void> _unlockExpiredSession() async {
    final l10n = context.l10n;
    final parentApproved = await _requireParentPassword(
      l10n.parentPasswordRequiredToUnlock,
      barrierDismissible: false,
    );
    if (!parentApproved) {
      return;
    }

    final result = await _guardianService.unblockBlockedApps();
    await _stopSession();
    if (mounted && result.supported && result.affected > 0) {
      _showStatus(l10n.unblockedAppsSuccess);
    }
  }

  Future<void> _changeLockSetting(bool value) async {
    if (_sessionProtected) {
      final parentApproved = await _requireParentPassword(
        context.l10n.parentPasswordRequiredToChangeSettings,
        barrierDismissible: false,
      );
      if (!parentApproved) {
        return;
      }
    }

    if (!mounted) {
      return;
    }
    setState(() {
      _blockAppsWhenLimitEnds = value;
    });
  }

  Future<void> _changeReportSetting(bool value) async {
    if (_sessionProtected) {
      final parentApproved = await _requireParentPassword(
        context.l10n.parentPasswordRequiredToChangeSettings,
        barrierDismissible: false,
      );
      if (!parentApproved) {
        return;
      }
    }

    if (!mounted) {
      return;
    }
    setState(() {
      _sendReport = value;
    });
  }

  void _startTicker() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      unawaited(_checkSessionDeadline());
    });
  }

  Future<void> _checkSessionDeadline() async {
    final endsAt = _sessionEndsAt;
    if (endsAt == null || _sessionLockedUntilParent) {
      return;
    }

    final remaining = endsAt.difference(DateTime.now());
    if (remaining > Duration.zero) {
      if (!mounted) {
        return;
      }

      setState(() {
        _remaining = remaining;
      });
      return;
    }

    await _expireSession();
  }

  Future<void> _expireSession() async {
    final l10n = context.l10n;
    _timer?.cancel();
    await _guardStore.saveSessionEndsAt(null);
    await _guardStore.saveSessionLockedUntilParent(true);
    await _guardianService.setSessionGuardActive(true);

    if (!mounted) {
      return;
    }

    setState(() {
      _sessionEndsAt = null;
      _sessionLockedUntilParent = true;
      _remaining = Duration.zero;
    });

    if (_blockAppsWhenLimitEnds) {
      final blockResult = await _guardianService.blockBrowsersAndGames();
      if (!mounted) {
        return;
      }
      _showStatus(_describeBlockResult(l10n, blockResult));
    } else {
      _showStatus(l10n.timeIsUpLockingDisabled);
    }
  }

  Future<bool> _requireParentPassword(
    String reason, {
    bool barrierDismissible = true,
  }) async {
    if (!_parentPasswordConfigured) {
      final password = await showDialog<String>(
        context: context,
        barrierDismissible: barrierDismissible,
        builder: (context) => const _SetParentPasswordDialog(),
      );

      if (password == null) {
        return false;
      }

      await _guardStore.setParentPassword(password);
      if (!mounted) {
        return false;
      }

      setState(() {
        _parentPasswordConfigured = true;
      });
      _showStatus(context.l10n.parentPasswordSaved);
      return true;
    }

    final approved = await showDialog<bool>(
      context: context,
      barrierDismissible: barrierDismissible,
      builder: (context) => _VerifyParentPasswordDialog(
        reason: reason,
        onVerify: _guardStore.verifyParentPassword,
      ),
    );

    return approved ?? false;
  }

  Future<void> _handleBlockedExit() async {
    final l10n = context.l10n;
    if (_sessionLockedUntilParent) {
      await _unlockExpiredSession();
      return;
    }

    if (!_sessionRunning) {
      return;
    }

    _showStatus(l10n.leavingDuringSession);
    final parentApproved = await _requireParentPassword(
      l10n.parentPasswordRequiredToClose,
      barrierDismissible: false,
    );
    if (!parentApproved) {
      return;
    }

    await _stopSession(showStatus: false);
    await SystemNavigator.pop();
  }

  void _showStatus(String message) {
    if (!mounted) {
      return;
    }

    setState(() {
      _statusMessage = message;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final platformNote = _guardianService.isAndroid
        ? l10n.platformNoteAndroid
        : _guardianService.isIos
        ? l10n.platformNoteIos
        : l10n.platformNoteOther;

    return PopScope<void>(
      canPop: !_sessionProtected,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _sessionProtected) {
          unawaited(_handleBlockedExit());
        }
      },
      child: Scaffold(
        body: SafeArea(
          child: Stack(
            children: [
              SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 920),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _Header(
                          platformNote: platformNote,
                          statusMessage: _statusMessage,
                        ),
                        const SizedBox(height: 16),
                        _LimitPlannerCard(
                          dailyLimitMinutes: _dailyLimitMinutes,
                          remaining: _remaining,
                          sessionRunning: _sessionRunning,
                          sessionProtected: _sessionProtected,
                          lockWhenLimitEnds: _blockAppsWhenLimitEnds,
                          sendReport: _sendReport,
                          onLimitChanged: (value) {
                            setState(() {
                              _dailyLimitMinutes = value;
                            });
                          },
                          onLockChanged: (value) {
                            unawaited(_changeLockSetting(value));
                          },
                          onReportChanged: (value) {
                            unawaited(_changeReportSetting(value));
                          },
                          onStart: () {
                            unawaited(_startSession());
                          },
                          onStop: () {
                            unawaited(_requestStopSession());
                          },
                        ),
                        const SizedBox(height: 16),
                        _AppBlockingCard(
                          targets: _appBlockTargets,
                          isAndroid: _guardianService.isAndroid,
                          isIos: _guardianService.isIos,
                          available: _managedAppBlockingAvailable,
                          loading: _loadingAppBlocking,
                          onRefresh: _refreshAppBlockingState,
                        ),
                        const SizedBox(height: 16),
                        _AccessSetupCard(
                          usageAccessGranted: _usageAccessGranted,
                          deviceAdminActive: _deviceAdminActive,
                          isAndroid: _guardianService.isAndroid,
                          isIos: _guardianService.isIos,
                          onUsageAccess: _openUsageAccess,
                          onDeviceAdmin: _openDeviceAdmin,
                          onRefresh: _refreshAccessState,
                          onLockNow: _lockNow,
                        ),
                        const SizedBox(height: 16),
                        _ReportCard(
                          items: _reportItems,
                          loading: _loadingReport,
                          usingLiveReport: _usingLiveReport,
                          onRefresh: _refreshReport,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              if (_sessionLockedUntilParent)
                Positioned.fill(
                  child: _ParentLockOverlay(
                    onUnlock: () {
                      unawaited(_unlockExpiredSession());
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.platformNote, required this.statusMessage});

  final String platformNote;
  final String? statusMessage;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final l10n = context.l10n;

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF102C2A),
        borderRadius: BorderRadius.circular(8),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: const Color(0xFFEAF6F1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(Icons.lock_clock, color: colors.primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.appTitle,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 30,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      l10n.headerSubtitle,
                      style: const TextStyle(color: Color(0xFFC8D7D4)),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text(
            platformNote,
            style: const TextStyle(
              color: Color(0xFFF3FAF8),
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (statusMessage != null) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF244844),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                statusMessage!,
                style: const TextStyle(color: Color(0xFFEAF6F1)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _LimitPlannerCard extends StatelessWidget {
  const _LimitPlannerCard({
    required this.dailyLimitMinutes,
    required this.remaining,
    required this.sessionRunning,
    required this.sessionProtected,
    required this.lockWhenLimitEnds,
    required this.sendReport,
    required this.onLimitChanged,
    required this.onLockChanged,
    required this.onReportChanged,
    required this.onStart,
    required this.onStop,
  });

  final int dailyLimitMinutes;
  final Duration remaining;
  final bool sessionRunning;
  final bool sessionProtected;
  final bool lockWhenLimitEnds;
  final bool sendReport;
  final ValueChanged<int> onLimitChanged;
  final ValueChanged<bool> onLockChanged;
  final ValueChanged<bool> onReportChanged;
  final VoidCallback onStart;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final l10n = context.l10n;
    final limitText = _formatMinutes(dailyLimitMinutes, l10n);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.timer_outlined, color: colors.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    l10n.screenTimeRuleTitle,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                Text(
                  limitText,
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(color: colors.primary),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Slider(
              value: dailyLimitMinutes.toDouble(),
              min: 15,
              max: 360,
              divisions: 23,
              label: limitText,
              onChanged: sessionProtected
                  ? null
                  : (value) => onLimitChanged(value.round()),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _PresetButton(
                  label: _formatMinutes(45, l10n),
                  selected: dailyLimitMinutes == 45,
                  enabled: !sessionProtected,
                  onPressed: () => onLimitChanged(45),
                ),
                _PresetButton(
                  label: _formatMinutes(90, l10n),
                  selected: dailyLimitMinutes == 90,
                  enabled: !sessionProtected,
                  onPressed: () => onLimitChanged(90),
                ),
                _PresetButton(
                  label: _formatMinutes(120, l10n),
                  selected: dailyLimitMinutes == 120,
                  enabled: !sessionProtected,
                  onPressed: () => onLimitChanged(120),
                ),
                _PresetButton(
                  label: _formatMinutes(180, l10n),
                  selected: dailyLimitMinutes == 180,
                  enabled: !sessionProtected,
                  onPressed: () => onLimitChanged(180),
                ),
              ],
            ),
            const SizedBox(height: 14),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: lockWhenLimitEnds,
              onChanged: onLockChanged,
              secondary: const Icon(Icons.phonelink_lock_outlined),
              title: Text(l10n.lockWhenLimitEnds),
              subtitle: Text(l10n.lockWhenLimitEndsSubtitle),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: sendReport,
              onChanged: onReportChanged,
              secondary: const Icon(Icons.summarize_outlined),
              title: Text(l10n.prepareParentReport),
              subtitle: Text(l10n.prepareParentReportSubtitle),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: sessionProtected ? null : onStart,
                    icon: const Icon(Icons.play_arrow),
                    label: Text(l10n.startSession(limitText)),
                  ),
                ),
                const SizedBox(width: 10),
                IconButton.outlined(
                  tooltip: l10n.stopSessionTooltip,
                  onPressed: sessionRunning ? onStop : null,
                  icon: const Icon(Icons.stop),
                ),
              ],
            ),
            if (sessionRunning) ...[
              const SizedBox(height: 12),
              LinearProgressIndicator(
                value: remaining.inSeconds <= 0
                    ? 0
                    : remaining.inSeconds / (dailyLimitMinutes * 60),
              ),
              const SizedBox(height: 8),
              Text(
                l10n.remaining(_formatDuration(remaining)),
                style: TextStyle(
                  color: colors.primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                l10n.sessionGuardNotice,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _PresetButton extends StatelessWidget {
  const _PresetButton({
    required this.label,
    required this.selected,
    required this.enabled,
    required this.onPressed,
  });

  final String label;
  final bool selected;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    if (selected) {
      return FilledButton.tonal(
        onPressed: enabled ? onPressed : null,
        child: Text(label),
      );
    }
    return OutlinedButton(
      onPressed: enabled ? onPressed : null,
      child: Text(label),
    );
  }
}

class _AppBlockingCard extends StatelessWidget {
  const _AppBlockingCard({
    required this.targets,
    required this.isAndroid,
    required this.isIos,
    required this.available,
    required this.loading,
    required this.onRefresh,
  });

  final List<AppBlockTarget> targets;
  final bool isAndroid;
  final bool isIos;
  final bool available;
  final bool loading;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = Theme.of(context).colorScheme;

    final statusText = available
        ? l10n.managedBlockingAvailable
        : isAndroid
        ? l10n.managedBlockingUnavailableAndroid
        : isIos
        ? l10n.managedBlockingUnavailableIos
        : l10n.managedBlockingUnavailableOther;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.block_outlined, color: colors.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    l10n.appBlocking,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                IconButton.outlined(
                  tooltip: l10n.refreshAppBlocking,
                  onPressed: loading ? null : onRefresh,
                  icon: loading
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.refresh),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  available ? Icons.verified_user_outlined : Icons.info_outline,
                  color: available
                      ? const Color(0xFF12733D)
                      : const Color(0xFF9B6200),
                ),
                const SizedBox(width: 10),
                Expanded(child: Text(statusText)),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              l10n.blockedTargetsTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            if (targets.isEmpty)
              Text(l10n.noBlockedTargetsFound)
            else
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final target in targets.take(12))
                    Chip(
                      avatar: Icon(
                        target.reason == 'browser'
                            ? Icons.public
                            : Icons.sports_esports_outlined,
                        size: 18,
                      ),
                      label: Text(
                        '${target.appName} · ${_localizedBlockReason(target.reason, l10n)}',
                      ),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _AccessSetupCard extends StatelessWidget {
  const _AccessSetupCard({
    required this.usageAccessGranted,
    required this.deviceAdminActive,
    required this.isAndroid,
    required this.isIos,
    required this.onUsageAccess,
    required this.onDeviceAdmin,
    required this.onRefresh,
    required this.onLockNow,
  });

  final bool usageAccessGranted;
  final bool deviceAdminActive;
  final bool isAndroid;
  final bool isIos;
  final VoidCallback onUsageAccess;
  final VoidCallback onDeviceAdmin;
  final VoidCallback onRefresh;
  final VoidCallback onLockNow;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.admin_panel_settings_outlined,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    l10n.accessSetup,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                IconButton.outlined(
                  tooltip: l10n.refreshAccessState,
                  onPressed: onRefresh,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _AccessRow(
              icon: Icons.analytics_outlined,
              title: l10n.usageReportAccess,
              body: isAndroid
                  ? l10n.usageReportAccessAndroidBody
                  : l10n.usageReportAccessIosBody,
              complete: usageAccessGranted,
              actionLabel: isAndroid ? l10n.openSettings : l10n.roadmap,
              onPressed: isAndroid ? onUsageAccess : null,
            ),
            const Divider(height: 24),
            _AccessRow(
              icon: Icons.lock_outline,
              title: l10n.lockAccess,
              body: isAndroid
                  ? l10n.lockAccessAndroidBody
                  : l10n.lockAccessIosBody,
              complete: deviceAdminActive,
              actionLabel: isAndroid ? l10n.enable : l10n.unavailable,
              onPressed: isAndroid ? onDeviceAdmin : null,
            ),
            if (isIos) ...[
              const Divider(height: 24),
              _AccessRow(
                icon: Icons.family_restroom_outlined,
                title: l10n.screenTimeEntitlement,
                body: l10n.screenTimeEntitlementBody,
                complete: false,
                actionLabel: l10n.appleSetup,
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: isAndroid ? onLockNow : null,
                    icon: const Icon(Icons.lock),
                    label: Text(l10n.testLock),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AccessRow extends StatelessWidget {
  const _AccessRow({
    required this.icon,
    required this.title,
    required this.body,
    required this.complete,
    required this.actionLabel,
    this.onPressed,
  });

  final IconData icon;
  final String title;
  final String body;
  final bool complete;
  final String actionLabel;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CircleAvatar(
          radius: 20,
          backgroundColor: complete
              ? const Color(0xFFE4F5EA)
              : const Color(0xFFFFF0D6),
          child: Icon(
            complete ? Icons.check : icon,
            color: complete ? const Color(0xFF12733D) : const Color(0xFF9B6200),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(body),
            ],
          ),
        ),
        const SizedBox(width: 8),
        TextButton(
          onPressed: onPressed,
          style: TextButton.styleFrom(foregroundColor: colors.primary),
          child: Text(actionLabel),
        ),
      ],
    );
  }
}

class _ReportCard extends StatelessWidget {
  const _ReportCard({
    required this.items,
    required this.loading,
    required this.usingLiveReport,
    required this.onRefresh,
  });

  final List<UsageReportItem> items;
  final bool loading;
  final bool usingLiveReport;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final maxMinutes = items.fold<int>(
      1,
      (value, item) => math.max(value, item.minutesUsed),
    );

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.bar_chart_outlined,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    l10n.usageReport,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                _SourceBadge(live: usingLiveReport),
                const SizedBox(width: 8),
                IconButton.outlined(
                  tooltip: l10n.refreshReport,
                  onPressed: loading ? null : onRefresh,
                  icon: loading
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.refresh),
                ),
              ],
            ),
            const SizedBox(height: 12),
            for (final item in items)
              _ReportRow(item: item, percent: item.minutesUsed / maxMinutes),
          ],
        ),
      ),
    );
  }
}

class _SourceBadge extends StatelessWidget {
  const _SourceBadge({required this.live});

  final bool live;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: live ? const Color(0xFFE4F5EA) : const Color(0xFFFFF0D6),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Text(
          live ? l10n.live : l10n.sample,
          style: TextStyle(
            color: live ? const Color(0xFF12733D) : const Color(0xFF7D5200),
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

class _ReportRow extends StatelessWidget {
  const _ReportRow({required this.item, required this.percent});

  final UsageReportItem item;
  final double percent;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final l10n = context.l10n;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  item.appName,
                  style: Theme.of(context).textTheme.titleMedium,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                _formatMinutes(item.minutesUsed, l10n),
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              minHeight: 9,
              value: percent.clamp(0.05, 1),
              backgroundColor: const Color(0xFFE8EEEC),
              color: colors.primary,
            ),
          ),
        ],
      ),
    );
  }
}

class _ParentLockOverlay extends StatelessWidget {
  const _ParentLockOverlay({required this.onUnlock});

  final VoidCallback onUnlock;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return DecoratedBox(
      decoration: const BoxDecoration(color: Color(0xF4102C2A)),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.lock_person_outlined,
                      color: Theme.of(context).colorScheme.primary,
                      size: 42,
                    ),
                    const SizedBox(height: 14),
                    Text(
                      l10n.lockedOverlayTitle,
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 10),
                    Text(l10n.lockedOverlayBody),
                    const SizedBox(height: 18),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: onUnlock,
                        icon: const Icon(Icons.lock_open),
                        label: Text(l10n.parentUnlock),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SetParentPasswordDialog extends StatefulWidget {
  const _SetParentPasswordDialog();

  @override
  State<_SetParentPasswordDialog> createState() =>
      _SetParentPasswordDialogState();
}

class _SetParentPasswordDialogState extends State<_SetParentPasswordDialog> {
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _confirmController = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  void _save() {
    final l10n = context.l10n;
    final password = _passwordController.text.trim();
    final confirmation = _confirmController.text.trim();

    if (password.length < 4) {
      setState(() {
        _error = l10n.passwordTooShort;
      });
      return;
    }

    if (password != confirmation) {
      setState(() {
        _error = l10n.passwordsDoNotMatch;
      });
      return;
    }

    Navigator.of(context).pop(password);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return AlertDialog(
      title: Text(l10n.setParentPasswordTitle),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.setParentPasswordBody),
          const SizedBox(height: 16),
          TextField(
            controller: _passwordController,
            obscureText: true,
            decoration: InputDecoration(
              labelText: l10n.newPassword,
              border: const OutlineInputBorder(),
            ),
            onSubmitted: (_) => _save(),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _confirmController,
            obscureText: true,
            decoration: InputDecoration(
              labelText: l10n.confirmPassword,
              border: const OutlineInputBorder(),
              errorText: _error,
            ),
            onSubmitted: (_) => _save(),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.cancel),
        ),
        FilledButton(onPressed: _save, child: Text(l10n.save)),
      ],
    );
  }
}

class _VerifyParentPasswordDialog extends StatefulWidget {
  const _VerifyParentPasswordDialog({
    required this.reason,
    required this.onVerify,
  });

  final String reason;
  final Future<bool> Function(String password) onVerify;

  @override
  State<_VerifyParentPasswordDialog> createState() =>
      _VerifyParentPasswordDialogState();
}

class _VerifyParentPasswordDialogState
    extends State<_VerifyParentPasswordDialog> {
  final TextEditingController _passwordController = TextEditingController();
  bool _checking = false;
  String? _error;

  @override
  void dispose() {
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (_checking) {
      return;
    }

    setState(() {
      _checking = true;
      _error = null;
    });

    final approved = await widget.onVerify(_passwordController.text.trim());
    if (!mounted) {
      return;
    }

    if (approved) {
      Navigator.of(context).pop(true);
      return;
    }

    setState(() {
      _checking = false;
      _error = context.l10n.wrongPassword;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return AlertDialog(
      title: Text(l10n.parentPasswordTitle),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.reason),
          const SizedBox(height: 10),
          Text(l10n.enterParentPasswordBody),
          const SizedBox(height: 16),
          TextField(
            controller: _passwordController,
            obscureText: true,
            enabled: !_checking,
            decoration: InputDecoration(
              labelText: l10n.parentPassword,
              border: const OutlineInputBorder(),
              errorText: _error,
            ),
            onSubmitted: (_) {
              unawaited(_verify());
            },
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _checking ? null : () => Navigator.of(context).pop(false),
          child: Text(l10n.cancel),
        ),
        FilledButton(
          onPressed: _checking
              ? null
              : () {
                  unawaited(_verify());
                },
          child: _checking
              ? const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(l10n.unlock),
        ),
      ],
    );
  }
}

String _formatMinutes(int minutes, AppLocalizations l10n) {
  final hours = minutes ~/ 60;
  final rest = minutes % 60;

  if (hours == 0) {
    return '$minutes${l10n.minuteShort}';
  }
  if (rest == 0) {
    return '$hours${l10n.hourShort}';
  }
  return '$hours${l10n.hourShort} $rest${l10n.minuteShort}';
}

String _formatDuration(Duration duration) {
  final safeDuration = duration.isNegative ? Duration.zero : duration;
  final hours = safeDuration.inHours;
  final minutes = safeDuration.inMinutes
      .remainder(60)
      .toString()
      .padLeft(2, '0');
  final seconds = safeDuration.inSeconds
      .remainder(60)
      .toString()
      .padLeft(2, '0');

  if (hours > 0) {
    return '$hours:$minutes:$seconds';
  }
  return '$minutes:$seconds';
}

String _describeBlockResult(AppLocalizations l10n, AppBlockResult result) {
  if (!result.supported) {
    return l10n.blockedAppsUnsupported;
  }
  if (result.attempted == 0) {
    return l10n.blockedAppsNoneFound;
  }
  if (result.failed > 0) {
    return l10n.blockedAppsPartial(result.affected, result.failed);
  }
  return l10n.blockedAppsSuccess(result.affected);
}

String _localizedBlockReason(String reason, AppLocalizations l10n) {
  return reason == 'browser' ? l10n.browserReason : l10n.gameReason;
}

extension _LykLocalizations on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this)!;
}
