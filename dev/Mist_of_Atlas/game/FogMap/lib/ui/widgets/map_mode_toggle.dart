import 'package:flutter/material.dart';

import '../../cloud/map_mode.dart';

class MapModeMenuButton extends StatelessWidget {
  const MapModeMenuButton({
    super.key,
    required this.mode,
    required this.onChanged,
    required this.sharedEnabled,
  });

  final MapMode mode;
  final ValueChanged<MapMode> onChanged;
  final bool sharedEnabled;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 40,
      width: 190,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xE626211C), Color(0xD114100C)],
        ),
        border: Border.all(color: const Color(0x806E5A38)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x66000000),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: _MapModeSegment(
              label: 'Personal',
              icon: Icons.explore_outlined,
              selected: mode == MapMode.personal,
              onTap: () => onChanged(MapMode.personal),
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: _MapModeSegment(
              label: 'Shared',
              icon: Icons.public_outlined,
              selected: mode == MapMode.shared,
              muted: !sharedEnabled && mode != MapMode.shared,
              onTap: () => onChanged(MapMode.shared),
            ),
          ),
        ],
      ),
    );
  }
}

class _MapModeSegment extends StatelessWidget {
  const _MapModeSegment({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
    this.muted = false,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final foreground = selected
        ? const Color(0xFFF9E7B6)
        : muted
            ? const Color(0x80D9C69C)
            : const Color(0xFFE3D0A5);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOutCubic,
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: selected
                ? const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0xB0A97D37), Color(0xCC5F431B)],
                  )
                : null,
            color: selected ? null : const Color(0x26000000),
            border: Border.all(
              color:
                  selected ? const Color(0xDCCEA460) : const Color(0x40382C1A),
            ),
          ),
          child: Row(
            children: [
              Icon(icon, size: 15, color: foreground),
              const SizedBox(width: 6),
              Expanded(
                child: FittedBox(
                  alignment: Alignment.centerLeft,
                  fit: BoxFit.scaleDown,
                  child: Text(
                    label,
                    maxLines: 1,
                    style: TextStyle(
                      color: foreground,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.1,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
