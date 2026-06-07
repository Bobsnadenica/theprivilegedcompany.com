// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Bulgarian (`bg`).
class AppLocalizationsBg extends AppLocalizations {
  AppLocalizationsBg([String locale = 'bg']) : super(locale);

  @override
  String get appTitle => 'LYK';

  @override
  String get headerSubtitle =>
      'Родителски контрол за по-спокойно ограничаване на времето пред екрана';

  @override
  String get platformNoteAndroid =>
      'Настройката за Android може да включи отчети за употреба и заключване на устройството.';

  @override
  String get platformNoteIos =>
      'iOS изисква Apple Screen Time APIs и Family Controls entitlement.';

  @override
  String get platformNoteOther =>
      'Стартирайте на Android или iOS, за да се свържат native контролите.';

  @override
  String get screenTimeRuleTitle => 'Правило за днешното екранно време';

  @override
  String get lockWhenLimitEnds =>
      'Блокирай браузъри и игри при изтичане на лимита';

  @override
  String get lockWhenLimitEndsSubtitle =>
      'Managed Android устройства могат да спират тези приложения. iOS изисква Screen Time shielding.';

  @override
  String get prepareParentReport => 'Подготви родителски отчет';

  @override
  String get prepareParentReportSubtitle =>
      'Обобщава използването на приложения в края на сесията.';

  @override
  String startSession(Object limit) {
    return 'Стартирай сесия $limit';
  }

  @override
  String get stopSessionTooltip => 'Спри сесията';

  @override
  String remaining(Object time) {
    return 'Остават $time';
  }

  @override
  String get accessSetup => 'Настройка на достъпите';

  @override
  String get refreshAccessState => 'Обнови състоянието на достъпите';

  @override
  String get usageReportAccess => 'Достъп до отчет за употреба';

  @override
  String get usageReportAccessAndroidBody =>
      'Отваря Android Usage Access, за да може LYK да отчита времето по приложения.';

  @override
  String get usageReportAccessIosBody =>
      'Отчетите за iOS изискват Device Activity и Family Controls.';

  @override
  String get openSettings => 'Отвори настройки';

  @override
  String get roadmap => 'План';

  @override
  String get lockAccess => 'Достъп за заключване';

  @override
  String get lockAccessAndroidBody =>
      'Device admin позволява принудително заключване след края на таймера.';

  @override
  String get lockAccessIosBody =>
      'iOS не позволява директно заключване на целия телефон от външни приложения.';

  @override
  String get enable => 'Активирай';

  @override
  String get unavailable => 'Недостъпно';

  @override
  String get screenTimeEntitlement => 'Screen Time entitlement';

  @override
  String get screenTimeEntitlementBody =>
      'Apple изисква одобрение за Family Controls entitlement преди публикуване.';

  @override
  String get appleSetup => 'Apple настройка';

  @override
  String get testLock => 'Тестово заключване';

  @override
  String get usageReport => 'Отчет за употреба';

  @override
  String get refreshReport => 'Обнови отчета';

  @override
  String get live => 'Реален';

  @override
  String get sample => 'Примерен';

  @override
  String get chooseLykAllowUsage => 'Изберете LYK и разрешете usage access.';

  @override
  String get usageAccessUnavailable =>
      'Достъпът до usage access още не е наличен тук.';

  @override
  String get enableLockAccessAndroid =>
      'Активирайте достъп за заключване, за да може LYK да заключва устройството на Android.';

  @override
  String get deviceAdminUnavailable =>
      'Настройката за device admin не е налична тук.';

  @override
  String get lockCommandSent => 'Командата за заключване е изпратена.';

  @override
  String get enableAndroidLockFirst =>
      'Първо активирайте Android достъп за заключване.';

  @override
  String get platformCannotLock => 'LYK не може да заключва тази платформа.';

  @override
  String get supervisedSessionStarted => 'Наблюдаваната сесия започна.';

  @override
  String get supervisedSessionStopped => 'Наблюдаваната сесия е спряна.';

  @override
  String get timeIsUpLockingDisabled =>
      'Времето изтече. Блокирането на приложения е изключено.';

  @override
  String get timeIsUpLocked =>
      'Времето изтече. Браузърите и игрите са блокирани до родителско одобрение.';

  @override
  String get leavingDuringSession =>
      'Сесията е активна. Необходима е родителска парола преди излизане.';

  @override
  String get parentPasswordTitle => 'Родителска парола';

  @override
  String get setParentPasswordTitle => 'Задайте родителска парола';

  @override
  String get setParentPasswordBody =>
      'Създайте родителска парола преди стартиране на наблюдение. Тя е нужна за спиране на сесия, промяна на заключени настройки или отключване след изтичане на времето.';

  @override
  String get enterParentPasswordBody =>
      'Въведете родителската парола, за да продължите.';

  @override
  String get newPassword => 'Нова парола';

  @override
  String get confirmPassword => 'Потвърди паролата';

  @override
  String get parentPassword => 'Родителска парола';

  @override
  String get cancel => 'Отказ';

  @override
  String get save => 'Запази';

  @override
  String get unlock => 'Отключи';

  @override
  String get continueAction => 'Продължи';

  @override
  String get passwordTooShort => 'Използвайте поне 4 символа.';

  @override
  String get passwordsDoNotMatch => 'Паролите не съвпадат.';

  @override
  String get wrongPassword => 'Грешна парола.';

  @override
  String get parentPasswordSaved => 'Родителската парола е запазена.';

  @override
  String get parentPasswordRequiredToStop =>
      'Нужна е родителска парола за спиране на тази сесия.';

  @override
  String get parentPasswordRequiredToClose =>
      'Нужна е родителска парола за затваряне на LYK по време на сесия.';

  @override
  String get parentPasswordRequiredToChangeSettings =>
      'Нужна е родителска парола за промяна на тази настройка по време на сесия.';

  @override
  String get parentPasswordRequiredToUnlock =>
      'Нужна е родителска парола за отключване след лимита.';

  @override
  String get lockedOverlayTitle => 'Времето изтече';

  @override
  String get lockedOverlayBody =>
      'LYK държи браузърите и игрите блокирани, докато родител не отключи тази сесия. Силното Android блокиране изисква device-owner или profile-owner настройка; iOS изисква Screen Time shielding.';

  @override
  String get parentUnlock => 'Родителско отключване';

  @override
  String get sessionGuardNotice =>
      'Докато сесията тече, Android ще заключи устройството, ако LYK бъде изпратено на заден план. iOS изисква Screen Time shielding за сходна защита.';

  @override
  String get appBlocking => 'Блокиране на приложения';

  @override
  String get managedBlockingAvailable =>
      'Managed блокирането на приложения е налично на това устройство.';

  @override
  String get managedBlockingUnavailableAndroid =>
      'Силното блокиране на приложения изисква LYK да е device owner или profile owner. Обикновен device admin може да заключи екрана, но не може да спира други приложения.';

  @override
  String get managedBlockingUnavailableIos =>
      'Блокирането на приложения в iOS изисква Family Controls, Device Activity и Managed Settings shielding.';

  @override
  String get managedBlockingUnavailableOther =>
      'Стартирайте на Android или iOS, за да настроите блокиране на приложения.';

  @override
  String get blockedTargetsTitle => 'Браузъри и игри, които LYK ще блокира';

  @override
  String get noBlockedTargetsFound =>
      'Все още не са намерени браузъри или приложения от категория игри.';

  @override
  String get browserReason => 'Браузър';

  @override
  String get gameReason => 'Игра';

  @override
  String blockedAppsSuccess(Object count) {
    return 'Блокирани са $count приложения браузъри/игри.';
  }

  @override
  String blockedAppsPartial(Object affected, Object failed) {
    return 'Блокирани са $affected приложения; $failed не могат да бъдат блокирани от Android.';
  }

  @override
  String get blockedAppsUnsupported =>
      'Това устройство още не може да спира браузъри/игри. Настройте LYK като Android device owner/profile owner или използвайте iOS Screen Time shielding.';

  @override
  String get blockedAppsNoneFound =>
      'Времето изтече, но не са намерени браузъри или игри за блокиране.';

  @override
  String get unblockedAppsSuccess =>
      'Родителят одобри. Блокираните приложения отново са достъпни.';

  @override
  String get refreshAppBlocking => 'Обнови блокирането';

  @override
  String get hourShort => 'ч';

  @override
  String get minuteShort => 'м';
}
