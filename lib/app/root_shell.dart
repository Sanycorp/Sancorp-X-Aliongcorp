import 'package:flutter/material.dart';

import '../core/palette.dart';
import '../core/typography.dart';
import '../screens/archive_screen.dart';
import '../screens/deck_screen.dart';
import '../screens/lab_screen.dart';
import '../screens/system_screen.dart';
import '../state/forge_controller.dart';
import '../state/forge_scope.dart';
import '../widgets/hud_background.dart';
import 'app_state.dart';
import '../core/haptics.dart';

class RootShell extends StatefulWidget {
  const RootShell({super.key});

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  int _index = 0;
  ForgeController? _forge;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_forge == null) {
      _forge = ForgeController(AppScope.of(context))..attach();
    }
  }

  @override
  void dispose() {
    _forge?.dispose();
    super.dispose();
  }

  void _select(int next) {
    if (next == _index) return;
    Haptics.tap();
    setState(() => _index = next);
  }

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final AppState app = AppScope.of(context);
    final ForgeController forge = _forge!;
    return ForgeScope(
      controller: forge,
      child: Scaffold(
      backgroundColor: c.canvas,
      body: Stack(
        children: <Widget>[
          Positioned.fill(
            child: HudBackground(animate: !app.settings.reduceMotion),
          ),
          SafeArea(
            bottom: false,
            child: IndexedStack(
              index: _index,
              children: const <Widget>[
                DeckScreen(),
                LabScreen(),
                ArchiveScreen(),
                SystemScreen(),
              ],
            ),
          ),
        ],
      ),
        bottomNavigationBar: _MechaNav(index: _index, onSelect: _select),
      ),
    );
  }
}

class _NavSpec {
  const _NavSpec(this.icon, this.label, this.code);

  final IconData icon;
  final String label;
  final String code;
}

const List<_NavSpec> _navItems = <_NavSpec>[
  _NavSpec(Icons.graphic_eq, 'DECK', '01'),
  _NavSpec(Icons.science_outlined, 'LAB', '02'),
  _NavSpec(Icons.inventory_2_outlined, 'ARCHIVE', '03'),
  _NavSpec(Icons.tune, 'SYSTEM', '04'),
];

class _MechaNav extends StatelessWidget {
  const _MechaNav({required this.index, required this.onSelect});

  final int index;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return Container(
      decoration: BoxDecoration(
        color: c.panel,
        border: Border(top: BorderSide(color: c.line, width: 1)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Row(
            children: List<Widget>.generate(_navItems.length, (int i) {
              final _NavSpec spec = _navItems[i];
              final bool selected = i == index;
              return Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onSelect(i),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: <Widget>[
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        curve: Curves.easeOutCubic,
                        width: selected ? 28 : 0,
                        height: 2.4,
                        color: c.cobalt,
                      ),
                      const SizedBox(height: 7),
                      Icon(
                        spec.icon,
                        size: 20,
                        color: selected ? c.cobalt : c.inkFaint,
                      ),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: <Widget>[
                          Text(
                            spec.code,
                            style: T.metric(
                              selected ? c.cobalt : c.inkFaint,
                              size: 7,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            spec.label,
                            style: T.label(
                              selected ? c.cobalt : c.inkFaint,
                              size: 8.5,
                              tracking: 1.3,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}
