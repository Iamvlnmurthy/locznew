import 'package:flutter/material.dart';

import '../../../core/theme/tokens.g.dart';

/// A shopfront for a business that has never uploaded a photograph.
///
/// Three and a half million directory records have no logo and never will, and asking a
/// designer for three and a half million pictures is not a plan. So the face is computed:
/// the colourway is hashed from the business id, the glyph comes from its category, and
/// the initials come from its name. The same shop looks the same on every screen, forever,
/// and nothing is stored or served to achieve it.
///
/// The glyph is drawn from SVG path data rather than an asset. No image file, no network
/// request, and the same eight shapes the website uses — they come from one shared token
/// source, so the app and the site cannot disagree about what a pharmacy looks like.
class BusinessStorefront extends StatelessWidget {
  const BusinessStorefront({
    required this.businessId,
    required this.name,
    this.categoryName,
    this.height = 168,
    this.showInitials = true,
    super.key,
  });

  final String businessId;
  final String name;
  final String? categoryName;
  final double height;
  final bool showInitials;

  /// First letters of the first two words, in whatever script the name is written in.
  ///
  /// Taken from the characters themselves rather than transliterated, so a Telugu shop
  /// shows Telugu. `characters` would handle emoji and combining marks more precisely;
  /// business names in this data are plain words, and the first code unit is right for
  /// every one I looked at.
  String get _initials {
    final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    if (words.isEmpty) return '?';
    if (words.length == 1) return words.first.characters.first.toUpperCase();
    return (words[0].characters.first + words[1].characters.first).toUpperCase();
  }

  int get _composition {
    // FNV-1a gives a stable, cheap variant without relying on Dart's runtime hashCode.
    var hash = 0x811C9DC5;
    for (final unit in businessId.codeUnits) {
      hash ^= unit;
      hash = (hash * 0x01000193) & 0xFFFFFFFF;
    }
    return hash % 6;
  }

  @override
  Widget build(BuildContext context) {
    final brightness = Theme.of(context).brightness;
    final palette = LoczBusinessGraphics.paletteFor(businessId);
    final glyph = LoczBusinessGraphics.glyphFor(categoryName);

    final background = palette.background(brightness);
    final foreground = palette.foreground(brightness);
    final accent = palette.accent(brightness);

    final compact = height < 100;
    final padding = compact ? 12.0 : 20.0;
    final glyphTile = compact ? 34.0 : 46.0;

    return ExcludeSemantics(
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: ClipRect(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  background,
                  Color.lerp(
                    background,
                    accent,
                    brightness == Brightness.dark ? 0.13 : 0.08,
                  )!,
                ],
              ),
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                CustomPaint(
                  painter: _StorefrontBackdropPainter(
                    foreground: foreground,
                    accent: accent,
                    variant: _composition,
                  ),
                ),
                Positioned(
                  right: compact ? -12 : -height * 0.06,
                  bottom: compact ? -14 : -height * 0.16,
                  child: Container(
                    width: compact ? 82 : height * 0.9,
                    height: compact ? 82 : height * 0.9,
                    padding: EdgeInsets.all(compact ? 20 : height * 0.22),
                    decoration: BoxDecoration(
                      color: foreground.withValues(alpha: 0.065),
                      shape: BoxShape.circle,
                      border: Border.all(color: foreground.withValues(alpha: 0.1)),
                    ),
                    child: CustomPaint(
                      painter: _GlyphPainter(
                        glyph: glyph,
                        color: accent.withValues(alpha: 0.72),
                        strokeWidth: compact ? 1.35 : 1.15,
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.all(padding),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: glyphTile,
                            height: glyphTile,
                            padding: EdgeInsets.all(compact ? 8 : 11),
                            decoration: BoxDecoration(
                              color: foreground.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(compact ? 11 : 15),
                              border: Border.all(
                                color: foreground.withValues(alpha: 0.18),
                              ),
                            ),
                            child: CustomPaint(
                              painter: _GlyphPainter(
                                glyph: glyph,
                                color: foreground,
                                strokeWidth: 1.7,
                              ),
                            ),
                          ),
                          const Spacer(),
                          Row(
                            children: List.generate(
                              3,
                              (index) => Container(
                                width: index == _composition % 3 ? 16 : 5,
                                height: 5,
                                margin: const EdgeInsets.only(left: 5),
                                decoration: BoxDecoration(
                                  color: foreground.withValues(
                                    alpha: index == _composition % 3 ? 0.7 : 0.24,
                                  ),
                                  borderRadius: BorderRadius.circular(99),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (showInitials && !compact)
                        Text(
                          _initials,
                          style: Theme.of(context).textTheme.displaySmall?.copyWith(
                                color: foreground,
                                fontWeight: FontWeight.w900,
                                height: 0.9,
                                letterSpacing: -1.8,
                              ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StorefrontBackdropPainter extends CustomPainter {
  const _StorefrontBackdropPainter({
    required this.foreground,
    required this.accent,
    required this.variant,
  });

  final Color foreground;
  final Color accent;
  final int variant;

  @override
  void paint(Canvas canvas, Size size) {
    final fine = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = foreground.withValues(alpha: 0.105);
    final wash = Paint()
      ..style = PaintingStyle.fill
      ..color = accent.withValues(alpha: 0.075);

    final anchor = switch (variant % 3) {
      0 => Offset(size.width * 0.78, size.height * 0.18),
      1 => Offset(size.width * 0.68, size.height * 0.08),
      _ => Offset(size.width * 0.86, size.height * 0.34),
    };
    for (var index = 0; index < 3; index++) {
      canvas.drawCircle(anchor, size.height * (0.28 + index * 0.2), fine);
    }

    final bandTop = size.height * (variant.isEven ? 0.72 : 0.66);
    final band = Path()
      ..moveTo(0, bandTop)
      ..lineTo(size.width, bandTop - size.height * 0.08)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(band, wash);

    final dashY = size.height * 0.24;
    for (var index = 0; index < 5; index++) {
      final x = size.width * 0.34 + index * size.width * 0.065;
      canvas.drawLine(
        Offset(x, dashY),
        Offset(x + size.width * 0.032, dashY),
        fine,
      );
    }
  }

  @override
  bool shouldRepaint(_StorefrontBackdropPainter oldDelegate) =>
      oldDelegate.foreground != foreground ||
      oldDelegate.accent != accent ||
      oldDelegate.variant != variant;
}

/// Draws SVG path data directly, so no image and no SVG package is needed.
///
/// Only the commands these eight glyphs actually use are implemented — M, L, H, V, C, A
/// and Z, absolute and relative. A general SVG parser would be a dependency and a much
/// larger surface; this reads exactly the shapes in the token file and nothing else. If a
/// future glyph uses something unsupported it will simply not draw that segment, which is
/// visible immediately rather than silently wrong.
class _GlyphPainter extends CustomPainter {
  const _GlyphPainter({
    required this.glyph,
    required this.color,
    required this.strokeWidth,
  });

  final LoczBusinessGlyph glyph;
  final Color color;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final source = glyph.size;
    final scale = size.width / source.width;

    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..color = color
      ..strokeWidth = strokeWidth / scale
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    canvas.save();
    canvas.scale(scale);
    for (final data in glyph.paths) {
      canvas.drawPath(_parse(data), paint);
    }
    canvas.restore();
  }

  Path _parse(String data) {
    final path = Path();
    final tokens = RegExp(r'[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?').allMatches(data).map((m) => m[0]!);

    var command = '';
    var cursor = Offset.zero;
    var start = Offset.zero;
    final numbers = <double>[];

    void flush() {
      if (command.isEmpty) return;
      final relative = command.toLowerCase() == command;
      final code = command.toLowerCase();

      double x(int i) => relative ? cursor.dx + numbers[i] : numbers[i];
      double y(int i) => relative ? cursor.dy + numbers[i] : numbers[i];

      switch (code) {
        case 'm':
          if (numbers.length < 2) break;
          cursor = Offset(x(0), y(1));
          start = cursor;
          path.moveTo(cursor.dx, cursor.dy);
          // Extra pairs after a moveto are line segments, per the SVG spec.
          for (var i = 2; i + 1 < numbers.length; i += 2) {
            cursor = Offset(
              relative ? cursor.dx + numbers[i] : numbers[i],
              relative ? cursor.dy + numbers[i + 1] : numbers[i + 1],
            );
            path.lineTo(cursor.dx, cursor.dy);
          }
        case 'l':
          for (var i = 0; i + 1 < numbers.length; i += 2) {
            cursor = Offset(
              relative ? cursor.dx + numbers[i] : numbers[i],
              relative ? cursor.dy + numbers[i + 1] : numbers[i + 1],
            );
            path.lineTo(cursor.dx, cursor.dy);
          }
        case 'h':
          for (final value in numbers) {
            cursor = Offset(relative ? cursor.dx + value : value, cursor.dy);
            path.lineTo(cursor.dx, cursor.dy);
          }
        case 'v':
          for (final value in numbers) {
            cursor = Offset(cursor.dx, relative ? cursor.dy + value : value);
            path.lineTo(cursor.dx, cursor.dy);
          }
        case 'c':
          for (var i = 0; i + 5 < numbers.length; i += 6) {
            final c1 = Offset(
              relative ? cursor.dx + numbers[i] : numbers[i],
              relative ? cursor.dy + numbers[i + 1] : numbers[i + 1],
            );
            final c2 = Offset(
              relative ? cursor.dx + numbers[i + 2] : numbers[i + 2],
              relative ? cursor.dy + numbers[i + 3] : numbers[i + 3],
            );
            cursor = Offset(
              relative ? cursor.dx + numbers[i + 4] : numbers[i + 4],
              relative ? cursor.dy + numbers[i + 5] : numbers[i + 5],
            );
            path.cubicTo(c1.dx, c1.dy, c2.dx, c2.dy, cursor.dx, cursor.dy);
          }
        case 'a':
          for (var i = 0; i + 6 < numbers.length; i += 7) {
            final end = Offset(
              relative ? cursor.dx + numbers[i + 5] : numbers[i + 5],
              relative ? cursor.dy + numbers[i + 6] : numbers[i + 6],
            );
            path.arcToPoint(
              end,
              radius: Radius.elliptical(numbers[i], numbers[i + 1]),
              rotation: numbers[i + 2],
              largeArc: numbers[i + 3] != 0,
              clockwise: numbers[i + 4] != 0,
            );
            cursor = end;
          }
        case 'z':
          path.close();
          cursor = start;
      }
      numbers.clear();
    }

    for (final token in tokens) {
      if (RegExp(r'^[A-Za-z]$').hasMatch(token)) {
        flush();
        command = token;
      } else {
        numbers.add(double.parse(token));
      }
    }
    flush();

    return path;
  }

  @override
  bool shouldRepaint(_GlyphPainter old) =>
      old.color != color || old.glyph != glyph || old.strokeWidth != strokeWidth;
}
