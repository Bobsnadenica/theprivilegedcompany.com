import 'package:flutter/material.dart';

import 'controllers/app_controller.dart';
import 'core/constants/app_constants.dart';
import 'core/theme/app_theme.dart';
import 'ui/screens/app_shell.dart';
import 'ui/widgets/fantasy_panel.dart';

class MistOfAtlasApp extends StatelessWidget {
  const MistOfAtlasApp({
    super.key,
    required this.controller,
    required this.initialization,
  });

  final AppController controller;
  final Future<void> initialization;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: AppConstants.appName,
      theme: AppTheme.darkFantasy,
      home: _BootstrapGate(
        controller: controller,
        initialization: initialization,
      ),
    );
  }
}

class _BootstrapGate extends StatefulWidget {
  const _BootstrapGate({
    required this.controller,
    required this.initialization,
  });

  final AppController controller;
  final Future<void> initialization;

  @override
  State<_BootstrapGate> createState() => _BootstrapGateState();
}

class _BootstrapGateState extends State<_BootstrapGate> {
  late Future<void> _initialization = widget.initialization;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(_lifecycleObserver);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(_lifecycleObserver);
    super.dispose();
  }

  late final WidgetsBindingObserver _lifecycleObserver = _AppLifecycleObserver(
    onStateChanged: widget.controller.setAppLifecycleState,
  );

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _initialization,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.done &&
            snapshot.error == null) {
          return AppShell(controller: widget.controller);
        }

        final theme = Theme.of(context);
        final error = snapshot.error;

        return Scaffold(
          body: DecoratedBox(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0xFF0B0D10),
                  Color(0xFF131920),
                  Color(0xFF1B2128),
                ],
              ),
            ),
            child: SafeArea(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: FantasyPanel(
                      background: const [
                        Color(0xEE2A180E),
                        Color(0xEE1B120C),
                        Color(0xEE12171C),
                      ],
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            AppConstants.appName,
                            style: theme.textTheme.headlineMedium?.copyWith(
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            error == null
                                ? 'Preparing your map, cloud profile, and location tracking.'
                                : 'Startup failed before the world could load.',
                            style: theme.textTheme.bodyMedium,
                          ),
                          const SizedBox(height: 24),
                          if (error == null) ...[
                            const LinearProgressIndicator(minHeight: 8),
                            const SizedBox(height: 12),
                            Text(
                              'Checking permissions and restoring progress...',
                              style: theme.textTheme.bodySmall,
                            ),
                          ] else ...[
                            SelectableText(
                              error.toString(),
                              style: theme.textTheme.bodySmall,
                            ),
                            const SizedBox(height: 16),
                            FilledButton.icon(
                              onPressed: () {
                                setState(() {
                                  _initialization = widget.controller.init();
                                });
                              },
                              icon: const Icon(Icons.refresh),
                              label: const Text('Try again'),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _AppLifecycleObserver with WidgetsBindingObserver {
  _AppLifecycleObserver({required this.onStateChanged});

  final ValueChanged<AppLifecycleState> onStateChanged;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    onStateChanged(state);
  }
}
