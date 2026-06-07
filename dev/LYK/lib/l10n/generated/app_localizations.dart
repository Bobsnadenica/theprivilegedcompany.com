import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_bg.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('bg'),
    Locale('en'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'LYK'**
  String get appTitle;

  /// No description provided for @headerSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Parent controls for calmer screen-time limits'**
  String get headerSubtitle;

  /// No description provided for @platformNoteAndroid.
  ///
  /// In en, this message translates to:
  /// **'Android setup can enable usage reports and device locking.'**
  String get platformNoteAndroid;

  /// No description provided for @platformNoteIos.
  ///
  /// In en, this message translates to:
  /// **'iOS requires Apple Screen Time APIs and a Family Controls entitlement.'**
  String get platformNoteIos;

  /// No description provided for @platformNoteOther.
  ///
  /// In en, this message translates to:
  /// **'Run on Android or iOS to connect native guardian controls.'**
  String get platformNoteOther;

  /// No description provided for @screenTimeRuleTitle.
  ///
  /// In en, this message translates to:
  /// **'Today\'s screen-time rule'**
  String get screenTimeRuleTitle;

  /// No description provided for @lockWhenLimitEnds.
  ///
  /// In en, this message translates to:
  /// **'Block browsers and games when the limit ends'**
  String get lockWhenLimitEnds;

  /// No description provided for @lockWhenLimitEndsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Managed Android devices can suspend matching apps. iOS needs Screen Time shielding.'**
  String get lockWhenLimitEndsSubtitle;

  /// No description provided for @prepareParentReport.
  ///
  /// In en, this message translates to:
  /// **'Prepare a parent report'**
  String get prepareParentReport;

  /// No description provided for @prepareParentReportSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Summarize app usage at the end of the session.'**
  String get prepareParentReportSubtitle;

  /// No description provided for @startSession.
  ///
  /// In en, this message translates to:
  /// **'Start {limit} session'**
  String startSession(Object limit);

  /// No description provided for @stopSessionTooltip.
  ///
  /// In en, this message translates to:
  /// **'Stop session'**
  String get stopSessionTooltip;

  /// No description provided for @remaining.
  ///
  /// In en, this message translates to:
  /// **'{time} remaining'**
  String remaining(Object time);

  /// No description provided for @accessSetup.
  ///
  /// In en, this message translates to:
  /// **'Access setup'**
  String get accessSetup;

  /// No description provided for @refreshAccessState.
  ///
  /// In en, this message translates to:
  /// **'Refresh access state'**
  String get refreshAccessState;

  /// No description provided for @usageReportAccess.
  ///
  /// In en, this message translates to:
  /// **'Usage report access'**
  String get usageReportAccess;

  /// No description provided for @usageReportAccessAndroidBody.
  ///
  /// In en, this message translates to:
  /// **'Opens Android Usage Access so LYK can read app time totals.'**
  String get usageReportAccessAndroidBody;

  /// No description provided for @usageReportAccessIosBody.
  ///
  /// In en, this message translates to:
  /// **'iOS reports need Device Activity and Family Controls.'**
  String get usageReportAccessIosBody;

  /// No description provided for @openSettings.
  ///
  /// In en, this message translates to:
  /// **'Open settings'**
  String get openSettings;

  /// No description provided for @roadmap.
  ///
  /// In en, this message translates to:
  /// **'Roadmap'**
  String get roadmap;

  /// No description provided for @lockAccess.
  ///
  /// In en, this message translates to:
  /// **'Lock access'**
  String get lockAccess;

  /// No description provided for @lockAccessAndroidBody.
  ///
  /// In en, this message translates to:
  /// **'Device admin grants force-lock permission after a timer ends.'**
  String get lockAccessAndroidBody;

  /// No description provided for @lockAccessIosBody.
  ///
  /// In en, this message translates to:
  /// **'iOS cannot be locked directly by third-party apps.'**
  String get lockAccessIosBody;

  /// No description provided for @enable.
  ///
  /// In en, this message translates to:
  /// **'Enable'**
  String get enable;

  /// No description provided for @unavailable.
  ///
  /// In en, this message translates to:
  /// **'Unavailable'**
  String get unavailable;

  /// No description provided for @screenTimeEntitlement.
  ///
  /// In en, this message translates to:
  /// **'Screen Time entitlement'**
  String get screenTimeEntitlement;

  /// No description provided for @screenTimeEntitlementBody.
  ///
  /// In en, this message translates to:
  /// **'Apple requires Family Controls entitlement approval before distribution.'**
  String get screenTimeEntitlementBody;

  /// No description provided for @appleSetup.
  ///
  /// In en, this message translates to:
  /// **'Apple setup'**
  String get appleSetup;

  /// No description provided for @testLock.
  ///
  /// In en, this message translates to:
  /// **'Test lock'**
  String get testLock;

  /// No description provided for @usageReport.
  ///
  /// In en, this message translates to:
  /// **'Usage report'**
  String get usageReport;

  /// No description provided for @refreshReport.
  ///
  /// In en, this message translates to:
  /// **'Refresh report'**
  String get refreshReport;

  /// No description provided for @live.
  ///
  /// In en, this message translates to:
  /// **'Live'**
  String get live;

  /// No description provided for @sample.
  ///
  /// In en, this message translates to:
  /// **'Sample'**
  String get sample;

  /// No description provided for @chooseLykAllowUsage.
  ///
  /// In en, this message translates to:
  /// **'Choose LYK, then allow usage access.'**
  String get chooseLykAllowUsage;

  /// No description provided for @usageAccessUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Usage access is not available here yet.'**
  String get usageAccessUnavailable;

  /// No description provided for @enableLockAccessAndroid.
  ///
  /// In en, this message translates to:
  /// **'Enable lock access so LYK can lock the device on Android.'**
  String get enableLockAccessAndroid;

  /// No description provided for @deviceAdminUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Device admin setup is not available here.'**
  String get deviceAdminUnavailable;

  /// No description provided for @lockCommandSent.
  ///
  /// In en, this message translates to:
  /// **'Lock command sent.'**
  String get lockCommandSent;

  /// No description provided for @enableAndroidLockFirst.
  ///
  /// In en, this message translates to:
  /// **'Enable Android lock access before using this.'**
  String get enableAndroidLockFirst;

  /// No description provided for @platformCannotLock.
  ///
  /// In en, this message translates to:
  /// **'This platform cannot be locked by LYK.'**
  String get platformCannotLock;

  /// No description provided for @supervisedSessionStarted.
  ///
  /// In en, this message translates to:
  /// **'Supervised session started.'**
  String get supervisedSessionStarted;

  /// No description provided for @supervisedSessionStopped.
  ///
  /// In en, this message translates to:
  /// **'Supervised session stopped.'**
  String get supervisedSessionStopped;

  /// No description provided for @timeIsUpLockingDisabled.
  ///
  /// In en, this message translates to:
  /// **'Time is up. App blocking is currently disabled.'**
  String get timeIsUpLockingDisabled;

  /// No description provided for @timeIsUpLocked.
  ///
  /// In en, this message translates to:
  /// **'Time is up. Browsers and games are blocked until parent approval.'**
  String get timeIsUpLocked;

  /// No description provided for @leavingDuringSession.
  ///
  /// In en, this message translates to:
  /// **'Session is active. Parent password is required before leaving.'**
  String get leavingDuringSession;

  /// No description provided for @parentPasswordTitle.
  ///
  /// In en, this message translates to:
  /// **'Parent password'**
  String get parentPasswordTitle;

  /// No description provided for @setParentPasswordTitle.
  ///
  /// In en, this message translates to:
  /// **'Set parent password'**
  String get setParentPasswordTitle;

  /// No description provided for @setParentPasswordBody.
  ///
  /// In en, this message translates to:
  /// **'Create a parent password before starting supervision. It is required to stop a session, change locked settings, or unlock after time is up.'**
  String get setParentPasswordBody;

  /// No description provided for @enterParentPasswordBody.
  ///
  /// In en, this message translates to:
  /// **'Enter the parent password to continue.'**
  String get enterParentPasswordBody;

  /// No description provided for @newPassword.
  ///
  /// In en, this message translates to:
  /// **'New password'**
  String get newPassword;

  /// No description provided for @confirmPassword.
  ///
  /// In en, this message translates to:
  /// **'Confirm password'**
  String get confirmPassword;

  /// No description provided for @parentPassword.
  ///
  /// In en, this message translates to:
  /// **'Parent password'**
  String get parentPassword;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @save.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// No description provided for @unlock.
  ///
  /// In en, this message translates to:
  /// **'Unlock'**
  String get unlock;

  /// No description provided for @continueAction.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get continueAction;

  /// No description provided for @passwordTooShort.
  ///
  /// In en, this message translates to:
  /// **'Use at least 4 characters.'**
  String get passwordTooShort;

  /// No description provided for @passwordsDoNotMatch.
  ///
  /// In en, this message translates to:
  /// **'Passwords do not match.'**
  String get passwordsDoNotMatch;

  /// No description provided for @wrongPassword.
  ///
  /// In en, this message translates to:
  /// **'Wrong password.'**
  String get wrongPassword;

  /// No description provided for @parentPasswordSaved.
  ///
  /// In en, this message translates to:
  /// **'Parent password saved.'**
  String get parentPasswordSaved;

  /// No description provided for @parentPasswordRequiredToStop.
  ///
  /// In en, this message translates to:
  /// **'Parent password is required to stop this session.'**
  String get parentPasswordRequiredToStop;

  /// No description provided for @parentPasswordRequiredToClose.
  ///
  /// In en, this message translates to:
  /// **'Parent password is required to close LYK during a session.'**
  String get parentPasswordRequiredToClose;

  /// No description provided for @parentPasswordRequiredToChangeSettings.
  ///
  /// In en, this message translates to:
  /// **'Parent password is required to change this setting during a session.'**
  String get parentPasswordRequiredToChangeSettings;

  /// No description provided for @parentPasswordRequiredToUnlock.
  ///
  /// In en, this message translates to:
  /// **'Parent password is required to unlock after the limit.'**
  String get parentPasswordRequiredToUnlock;

  /// No description provided for @lockedOverlayTitle.
  ///
  /// In en, this message translates to:
  /// **'Time is up'**
  String get lockedOverlayTitle;

  /// No description provided for @lockedOverlayBody.
  ///
  /// In en, this message translates to:
  /// **'LYK is keeping browsers and games blocked until a parent unlocks this session. Strong Android app blocking requires device-owner or profile-owner setup; iOS requires Screen Time shielding.'**
  String get lockedOverlayBody;

  /// No description provided for @parentUnlock.
  ///
  /// In en, this message translates to:
  /// **'Parent unlock'**
  String get parentUnlock;

  /// No description provided for @sessionGuardNotice.
  ///
  /// In en, this message translates to:
  /// **'During a running session, Android will lock the device if LYK is sent to the background. iOS requires Screen Time shielding for equivalent protection.'**
  String get sessionGuardNotice;

  /// No description provided for @appBlocking.
  ///
  /// In en, this message translates to:
  /// **'App blocking'**
  String get appBlocking;

  /// No description provided for @managedBlockingAvailable.
  ///
  /// In en, this message translates to:
  /// **'Managed app blocking is available on this device.'**
  String get managedBlockingAvailable;

  /// No description provided for @managedBlockingUnavailableAndroid.
  ///
  /// In en, this message translates to:
  /// **'Strong app blocking needs LYK to be device owner or profile owner. Normal device admin can lock the screen, but cannot suspend other apps.'**
  String get managedBlockingUnavailableAndroid;

  /// No description provided for @managedBlockingUnavailableIos.
  ///
  /// In en, this message translates to:
  /// **'iOS app blocking needs Family Controls, Device Activity, and Managed Settings shielding.'**
  String get managedBlockingUnavailableIos;

  /// No description provided for @managedBlockingUnavailableOther.
  ///
  /// In en, this message translates to:
  /// **'Run on Android or iOS to configure app blocking.'**
  String get managedBlockingUnavailableOther;

  /// No description provided for @blockedTargetsTitle.
  ///
  /// In en, this message translates to:
  /// **'Browsers and games LYK will block'**
  String get blockedTargetsTitle;

  /// No description provided for @noBlockedTargetsFound.
  ///
  /// In en, this message translates to:
  /// **'No browsers or game-category apps were found yet.'**
  String get noBlockedTargetsFound;

  /// No description provided for @browserReason.
  ///
  /// In en, this message translates to:
  /// **'Browser'**
  String get browserReason;

  /// No description provided for @gameReason.
  ///
  /// In en, this message translates to:
  /// **'Game'**
  String get gameReason;

  /// No description provided for @blockedAppsSuccess.
  ///
  /// In en, this message translates to:
  /// **'Blocked {count} browser/game app(s).'**
  String blockedAppsSuccess(Object count);

  /// No description provided for @blockedAppsPartial.
  ///
  /// In en, this message translates to:
  /// **'Blocked {affected} app(s); {failed} could not be blocked by Android.'**
  String blockedAppsPartial(Object affected, Object failed);

  /// No description provided for @blockedAppsUnsupported.
  ///
  /// In en, this message translates to:
  /// **'This device cannot suspend browsers/games yet. Set up LYK as Android device owner/profile owner, or use iOS Screen Time shielding.'**
  String get blockedAppsUnsupported;

  /// No description provided for @blockedAppsNoneFound.
  ///
  /// In en, this message translates to:
  /// **'Time is up, but no browsers or games were found to block.'**
  String get blockedAppsNoneFound;

  /// No description provided for @unblockedAppsSuccess.
  ///
  /// In en, this message translates to:
  /// **'Parent approved. Blocked apps are available again.'**
  String get unblockedAppsSuccess;

  /// No description provided for @refreshAppBlocking.
  ///
  /// In en, this message translates to:
  /// **'Refresh app blocking'**
  String get refreshAppBlocking;

  /// No description provided for @hourShort.
  ///
  /// In en, this message translates to:
  /// **'h'**
  String get hourShort;

  /// No description provided for @minuteShort.
  ///
  /// In en, this message translates to:
  /// **'m'**
  String get minuteShort;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['bg', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'bg':
      return AppLocalizationsBg();
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
