// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'LYK';

  @override
  String get headerSubtitle => 'Parent controls for calmer screen-time limits';

  @override
  String get platformNoteAndroid =>
      'Android setup can enable usage reports and device locking.';

  @override
  String get platformNoteIos =>
      'iOS requires Apple Screen Time APIs and a Family Controls entitlement.';

  @override
  String get platformNoteOther =>
      'Run on Android or iOS to connect native guardian controls.';

  @override
  String get screenTimeRuleTitle => 'Today\'s screen-time rule';

  @override
  String get lockWhenLimitEnds =>
      'Block browsers and games when the limit ends';

  @override
  String get lockWhenLimitEndsSubtitle =>
      'Managed Android devices can suspend matching apps. iOS needs Screen Time shielding.';

  @override
  String get prepareParentReport => 'Prepare a parent report';

  @override
  String get prepareParentReportSubtitle =>
      'Summarize app usage at the end of the session.';

  @override
  String startSession(Object limit) {
    return 'Start $limit session';
  }

  @override
  String get stopSessionTooltip => 'Stop session';

  @override
  String remaining(Object time) {
    return '$time remaining';
  }

  @override
  String get accessSetup => 'Access setup';

  @override
  String get refreshAccessState => 'Refresh access state';

  @override
  String get usageReportAccess => 'Usage report access';

  @override
  String get usageReportAccessAndroidBody =>
      'Opens Android Usage Access so LYK can read app time totals.';

  @override
  String get usageReportAccessIosBody =>
      'iOS reports need Device Activity and Family Controls.';

  @override
  String get openSettings => 'Open settings';

  @override
  String get roadmap => 'Roadmap';

  @override
  String get lockAccess => 'Lock access';

  @override
  String get lockAccessAndroidBody =>
      'Device admin grants force-lock permission after a timer ends.';

  @override
  String get lockAccessIosBody =>
      'iOS cannot be locked directly by third-party apps.';

  @override
  String get enable => 'Enable';

  @override
  String get unavailable => 'Unavailable';

  @override
  String get screenTimeEntitlement => 'Screen Time entitlement';

  @override
  String get screenTimeEntitlementBody =>
      'Apple requires Family Controls entitlement approval before distribution.';

  @override
  String get appleSetup => 'Apple setup';

  @override
  String get testLock => 'Test lock';

  @override
  String get usageReport => 'Usage report';

  @override
  String get refreshReport => 'Refresh report';

  @override
  String get live => 'Live';

  @override
  String get sample => 'Sample';

  @override
  String get chooseLykAllowUsage => 'Choose LYK, then allow usage access.';

  @override
  String get usageAccessUnavailable =>
      'Usage access is not available here yet.';

  @override
  String get enableLockAccessAndroid =>
      'Enable lock access so LYK can lock the device on Android.';

  @override
  String get deviceAdminUnavailable =>
      'Device admin setup is not available here.';

  @override
  String get lockCommandSent => 'Lock command sent.';

  @override
  String get enableAndroidLockFirst =>
      'Enable Android lock access before using this.';

  @override
  String get platformCannotLock => 'This platform cannot be locked by LYK.';

  @override
  String get supervisedSessionStarted => 'Supervised session started.';

  @override
  String get supervisedSessionStopped => 'Supervised session stopped.';

  @override
  String get timeIsUpLockingDisabled =>
      'Time is up. App blocking is currently disabled.';

  @override
  String get timeIsUpLocked =>
      'Time is up. Browsers and games are blocked until parent approval.';

  @override
  String get leavingDuringSession =>
      'Session is active. Parent password is required before leaving.';

  @override
  String get parentPasswordTitle => 'Parent password';

  @override
  String get setParentPasswordTitle => 'Set parent password';

  @override
  String get setParentPasswordBody =>
      'Create a parent password before starting supervision. It is required to stop a session, change locked settings, or unlock after time is up.';

  @override
  String get enterParentPasswordBody =>
      'Enter the parent password to continue.';

  @override
  String get newPassword => 'New password';

  @override
  String get confirmPassword => 'Confirm password';

  @override
  String get parentPassword => 'Parent password';

  @override
  String get cancel => 'Cancel';

  @override
  String get save => 'Save';

  @override
  String get unlock => 'Unlock';

  @override
  String get continueAction => 'Continue';

  @override
  String get passwordTooShort => 'Use at least 4 characters.';

  @override
  String get passwordsDoNotMatch => 'Passwords do not match.';

  @override
  String get wrongPassword => 'Wrong password.';

  @override
  String get parentPasswordSaved => 'Parent password saved.';

  @override
  String get parentPasswordRequiredToStop =>
      'Parent password is required to stop this session.';

  @override
  String get parentPasswordRequiredToClose =>
      'Parent password is required to close LYK during a session.';

  @override
  String get parentPasswordRequiredToChangeSettings =>
      'Parent password is required to change this setting during a session.';

  @override
  String get parentPasswordRequiredToUnlock =>
      'Parent password is required to unlock after the limit.';

  @override
  String get lockedOverlayTitle => 'Time is up';

  @override
  String get lockedOverlayBody =>
      'LYK is keeping browsers and games blocked until a parent unlocks this session. Strong Android app blocking requires device-owner or profile-owner setup; iOS requires Screen Time shielding.';

  @override
  String get parentUnlock => 'Parent unlock';

  @override
  String get sessionGuardNotice =>
      'During a running session, Android will lock the device if LYK is sent to the background. iOS requires Screen Time shielding for equivalent protection.';

  @override
  String get appBlocking => 'App blocking';

  @override
  String get managedBlockingAvailable =>
      'Managed app blocking is available on this device.';

  @override
  String get managedBlockingUnavailableAndroid =>
      'Strong app blocking needs LYK to be device owner or profile owner. Normal device admin can lock the screen, but cannot suspend other apps.';

  @override
  String get managedBlockingUnavailableIos =>
      'iOS app blocking needs Family Controls, Device Activity, and Managed Settings shielding.';

  @override
  String get managedBlockingUnavailableOther =>
      'Run on Android or iOS to configure app blocking.';

  @override
  String get blockedTargetsTitle => 'Browsers and games LYK will block';

  @override
  String get noBlockedTargetsFound =>
      'No browsers or game-category apps were found yet.';

  @override
  String get browserReason => 'Browser';

  @override
  String get gameReason => 'Game';

  @override
  String blockedAppsSuccess(Object count) {
    return 'Blocked $count browser/game app(s).';
  }

  @override
  String blockedAppsPartial(Object affected, Object failed) {
    return 'Blocked $affected app(s); $failed could not be blocked by Android.';
  }

  @override
  String get blockedAppsUnsupported =>
      'This device cannot suspend browsers/games yet. Set up LYK as Android device owner/profile owner, or use iOS Screen Time shielding.';

  @override
  String get blockedAppsNoneFound =>
      'Time is up, but no browsers or games were found to block.';

  @override
  String get unblockedAppsSuccess =>
      'Parent approved. Blocked apps are available again.';

  @override
  String get refreshAppBlocking => 'Refresh app blocking';

  @override
  String get hourShort => 'h';

  @override
  String get minuteShort => 'm';
}
