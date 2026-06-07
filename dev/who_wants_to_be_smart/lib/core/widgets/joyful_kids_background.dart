import 'dart:math';

import 'package:flutter/material.dart';

class JoyfulKidsBackground extends StatefulWidget {
  const JoyfulKidsBackground({super.key});

  @override
  State<JoyfulKidsBackground> createState() => _JoyfulKidsBackgroundState();
}

class _JoyfulKidsBackgroundState extends State<JoyfulKidsBackground>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 16),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      ignoring: true,
      child: RepaintBoundary(
        child: AnimatedBuilder(
          animation: _ctrl,
          builder: (_, __) => CustomPaint(
            painter: _JoyfulKidsPainter(progress: _ctrl.value),
            size: Size.infinite,
          ),
        ),
      ),
    );
  }
}

class _JoyfulKidsPainter extends CustomPainter {
  const _JoyfulKidsPainter({required this.progress});

  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    final sky = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          Color(0xFF0A0A2E),
          Color(0xFF143169),
          Color(0xFF1E4D85),
        ],
      ).createShader(Offset.zero & size);
    canvas.drawRect(Offset.zero & size, sky);

    _drawGlowOrb(
      canvas,
      center: Offset(w * 0.14 + sin(progress * pi * 2) * 10, h * 0.18),
      radius: 86,
      color: const Color(0xFF67E8F9).withValues(alpha: 0.24),
    );
    _drawGlowOrb(
      canvas,
      center: Offset(w * 0.86 + cos(progress * pi * 2) * 12, h * 0.24),
      radius: 94,
      color: const Color(0xFFF9A8D4).withValues(alpha: 0.22),
    );
    _drawGlowOrb(
      canvas,
      center: Offset(w * 0.5 + sin((progress + 0.2) * pi * 2) * 14, h * 0.84),
      radius: 110,
      color: const Color(0xFFFFD740).withValues(alpha: 0.16),
    );

    _drawStars(canvas, size);
    _drawClouds(canvas, size);
    _drawColorBlocks(canvas, size);
    _drawKites(canvas, size);
  }

  void _drawGlowOrb(
    Canvas canvas, {
    required Offset center,
    required double radius,
    required Color color,
  }) {
    final paint = Paint()
      ..color = color
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 22);
    canvas.drawCircle(center, radius, paint);
  }

  void _drawStars(Canvas canvas, Size size) {
    final stars = <Offset>[
      Offset(size.width * 0.1, size.height * 0.08),
      Offset(size.width * 0.26, size.height * 0.12),
      Offset(size.width * 0.42, size.height * 0.07),
      Offset(size.width * 0.61, size.height * 0.11),
      Offset(size.width * 0.78, size.height * 0.09),
      Offset(size.width * 0.9, size.height * 0.15),
      Offset(size.width * 0.18, size.height * 0.32),
      Offset(size.width * 0.34, size.height * 0.26),
      Offset(size.width * 0.74, size.height * 0.3),
      Offset(size.width * 0.86, size.height * 0.36),
    ];

    for (var i = 0; i < stars.length; i++) {
      final twinkle = 0.5 + 0.5 * sin(progress * pi * 2 + i);
      final r = 1.2 + twinkle * 1.8;
      final paint = Paint()
        ..color = Color.lerp(
          const Color(0x80FFFFFF),
          const Color(0xFFFFF176),
          twinkle,
        )!;
      canvas.drawCircle(stars[i], r, paint);
    }
  }

  void _drawClouds(Canvas canvas, Size size) {
    final drift = sin(progress * pi * 2) * 18;
    _cloud(
      canvas,
      Offset(size.width * 0.18 + drift, size.height * 0.22),
      const Color(0x55FFFFFF),
    );
    _cloud(
      canvas,
      Offset(size.width * 0.72 - drift * 0.7, size.height * 0.18),
      const Color(0x44FFFFFF),
    );
  }

  void _cloud(Canvas canvas, Offset center, Color color) {
    final p = Paint()..color = color;
    canvas.drawCircle(center.translate(-26, 0), 20, p);
    canvas.drawCircle(center, 26, p);
    canvas.drawCircle(center.translate(30, 2), 18, p);
  }

  void _drawColorBlocks(Canvas canvas, Size size) {
    final yBase = size.height * 0.9;
    final sway = sin(progress * pi * 2) * 8;
    final blocks = [
      (Color(0xFF40C4FF), 18.0, yBase - 28 + sway),
      (Color(0xFFFFAB40), 62.0, yBase - 48 - sway * 0.6),
      (Color(0xFF69F0AE), 108.0, yBase - 24 + sway * 0.7),
      (Color(0xFFFF80AB), size.width - 130, yBase - 34 - sway),
      (Color(0xFFFFD740), size.width - 82, yBase - 54 + sway * 0.8),
    ];
    for (final b in blocks) {
      final paint = Paint()..color = b.$1.withValues(alpha: 0.5);
      final r = RRect.fromRectAndRadius(
        Rect.fromLTWH(b.$2, b.$3, 34, 18),
        const Radius.circular(8),
      );
      canvas.drawRRect(r, paint);
    }
  }

  void _drawKites(Canvas canvas, Size size) {
    final t = progress * pi * 2;
    _kite(
      canvas,
      center: Offset(size.width * 0.28 + sin(t) * 9, size.height * 0.56),
      body: const Color(0xFF67E8F9),
      tail: const Color(0xFFFFF176),
      angle: -0.3 + sin(t) * 0.1,
    );
    _kite(
      canvas,
      center: Offset(size.width * 0.78 + cos(t) * 8, size.height * 0.52),
      body: const Color(0xFFF9A8D4),
      tail: const Color(0xFFB2FF59),
      angle: 0.28 + cos(t) * 0.12,
    );
  }

  void _kite(
    Canvas canvas, {
    required Offset center,
    required Color body,
    required Color tail,
    required double angle,
  }) {
    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.rotate(angle);
    final path = Path()
      ..moveTo(0, -12)
      ..lineTo(10, 0)
      ..lineTo(0, 12)
      ..lineTo(-10, 0)
      ..close();
    final paint = Paint()..color = body.withValues(alpha: 0.6);
    canvas.drawPath(path, paint);
    final tailPaint = Paint()
      ..color = tail.withValues(alpha: 0.55)
      ..strokeWidth = 2;
    final tailPath = Path()
      ..moveTo(0, 12)
      ..quadraticBezierTo(4, 20, -2, 28)
      ..quadraticBezierTo(-8, 36, 2, 44);
    canvas.drawPath(tailPath, tailPaint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _JoyfulKidsPainter oldDelegate) =>
      oldDelegate.progress != progress;
}
