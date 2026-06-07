import '../enums/app_language.dart';

String tr(AppLanguage lang, String en, String bg) =>
    lang == AppLanguage.bulgarian ? bg : en;
