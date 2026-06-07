// Smoke test — verifies the app boots and the class-selection screen renders.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:who_wants_to_be_smart/main.dart';

void main() {
  testWidgets('App boots and shows class selection screen',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: WhoWantsToBeSmartApp()),
    );
    // Allow async providers (DB load) to settle.
    await tester.pumpAndSettle();

    // The title text should be visible somewhere on screen.
    expect(find.textContaining('SMART'), findsWidgets);
  });
}
