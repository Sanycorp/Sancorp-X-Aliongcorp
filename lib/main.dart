import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'app/app_state.dart';
import 'app/root_shell.dart';
import 'core/palette.dart';
import 'core/theme.dart';
import 'widgets/boot_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations(<DeviceOrientation>[
    DeviceOrientation.portraitUp,
  ]);
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  runApp(const ElTzyApp());
}

class ElTzyApp extends StatefulWidget {
  const ElTzyApp({super.key});

  @override
  State<ElTzyApp> createState() => _ElTzyAppState();
}

class _ElTzyAppState extends State<ElTzyApp> {
  final AppState _state = AppState();
  late final Future<void> _boot;

  @override
  void initState() {
    super.initState();
    _boot = _state.init();
  }

  @override
  void dispose() {
    _state.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: _state.dark,
      builder: (BuildContext context, bool isDark, Widget? _) {
        final MechaColors colors = isDark ? kCockpit : kArmor;
        return MechaScope(
          colors: colors,
          child: AppScope(
            state: _state,
            child: MaterialApp(
              title: 'EL TZY',
              debugShowCheckedModeBanner: false,
              theme: MechaTheme.build(colors),
              home: _AppRoot(state: _state, boot: _boot),
            ),
          ),
        );
      },
    );
  }
}

class _AppRoot extends StatefulWidget {
  const _AppRoot({required this.state, required this.boot});

  final AppState state;
  final Future<void> boot;

  @override
  State<_AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<_AppRoot> {
  bool _booting = true;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    final int minMs = widget.state.settings.reduceMotion ? 700 : 1850;
    await Future.wait<void>(<Future<void>>[
      widget.boot,
      Future<void>.delayed(Duration(milliseconds: minMs)),
    ]);
    if (mounted) setState(() => _booting = false);
  }

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 420),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      child: _booting
          ? BootSequence(
              key: const ValueKey<String>('boot'),
              duration: Duration(
                milliseconds: widget.state.settings.reduceMotion ? 700 : 1850,
              ),
              onDone: () {
                if (mounted) setState(() => _booting = false);
              },
            )
          : const RootShell(key: ValueKey<String>('shell'))
              .withBackground(c),
    );
  }
}

extension _ShellBackground on Widget {
  Widget withBackground(MechaColors c) => ColoredBox(color: c.canvas, child: this);
}
