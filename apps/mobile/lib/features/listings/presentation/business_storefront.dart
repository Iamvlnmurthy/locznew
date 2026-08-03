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
    if (words.length == 1) return words.first.substring(0, 1).toUpperCase();
    return (words[0].substring(0, 1) + words[1].substring(0, 1)).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final brightness = Theme.of(context).brightness;
    final palette = LoczBusinessGraphics.paletteFor(businessId);
    final glyph = LoczBusinessGraphics.glyphFor(categoryName);

    final background = palette.background(brightness);
    final foreground = palette.foreground(brightness);
    final accent = palette.accent(brightness);

    return SizedBox(
      height: height,
      width: double.infinity,
      child: DecoratedBox(
        decoration: BoxDecoration(color: background),
        child: Stack(
          fit: StackFit.expand,
          children: [
            // An oversized, cropped glyph as the backdrop. It reads as a pattern rather
            // than an icon, which is what stops three million cards looking like a
            // spreadsheet of the same eight symbols.
            Positioned(
              right: -height * 0.22,
              bottom: -height * 0.28,
              child: Opacity(
                opacity: 0.20,
                child: CustomPaint(
                  size: Size(height * 1.05, height * 1.05),
                  painter: _GlyphPainter(glyph: glyph, color: accent, strokeWidth: 1.1),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  SizedBox(
                    width: 34,
                    height: 34,
                    child: CustomPaint(
                      painter: _GlyphPainter(glyph: glyph, color: foreground, strokeWidth: 1.6),
                    ),
                  ),
                  if (showInitials)
                    Text(
                      _initials,
                      style: Theme.of(context).textTheme.displaySmall?.copyWith(
                            color: foreground,
                            fontWeight: FontWeight.w800,
                            height: 1,
                          ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Draws SVG path data directly, so no image and no SVG package is needed.
///
/// Only the commands these eight glyphs actually use are implemented — M, L, H, V, C, A
/// and Z, absolute and relative. A general SVG parser would be a dependency and a much
/// larger surface; this reads exactly the shapes in the token file and nothing else. If a
/// future glyph uses something unsupported it will simply not draw that segment, which is
/// visible immediately rather than silently wrong.
class _GlyphPainter extends CustomPainter {
  const _GlyphPainter({required this.glyph, required this.color, required this.strokeWidth});

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
