import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lyk/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('shows the LYK parental control starter dashboard', (
    tester,
  ) async {
    await tester.pumpWidget(const LykApp());
    await tester.pump();

    expect(find.text('LYK'), findsOneWidget);
    expect(find.text('Today\'s screen-time rule'), findsOneWidget);
    expect(find.text('Access setup'), findsOneWidget);
    expect(find.text('Usage report'), findsOneWidget);
  });

  testWidgets(
    'shows Bulgarian dashboard text when device locale is Bulgarian',
    (tester) async {
      tester.binding.platformDispatcher.localesTestValue = const [Locale('bg')];
      addTearDown(tester.binding.platformDispatcher.clearLocalesTestValue);

      await tester.pumpWidget(const LykApp());
      await tester.pump();

      expect(find.text('Правило за днешното екранно време'), findsOneWidget);
      expect(find.text('Настройка на достъпите'), findsOneWidget);
      expect(find.text('Отчет за употреба'), findsOneWidget);
    },
  );
}
