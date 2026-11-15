import 'dart:math' as math;

import 'package:busyapi_core/busyapi_core.dart';
import 'package:busyapi/src/source/source_geometry.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'source_viewport_fixture.dart';

void main() {
  test(
    'crossing a fold boundary restores heights of every newly visible line',
    () {
      final before = SourceLineIndex(
        List.generate(200, (n) => 'line$n\r\n').join(),
      );
      final original = SourceFoldMap(before.source.length, [
        SourceRange(before.offsetForLine(90), before.offsetForLine(160)),
      ]);
      final geometry = SourceGeometry()..indexViewport(before, 40, original);
      final start = before.offsetForLine(90) - 1, end = start + 2;
      final after = SourceLineIndex.updated(
        previous: before,
        source: before.source.replaceRange(start, end, ''),
        oldStart: start,
        oldEnd: end,
      );
      final expanded = original.afterChange(start, end, 0);
      expect(expanded.ranges, isEmpty);
      geometry.indexViewport(after, 40, expanded);
      expect(geometry.totalRows, after.lineCount);
      expect(geometry.rowForLine(159), 158);
      expect(geometry.lineAtRow(158), 159);
    },
  );

  test(
    'viewport rows follow CRLF, wrapping, folded edits and missed revisions',
    () {
      var lines = SourceLineIndex(
        List.generate(
          400,
          (n) => 'line$n: ${'雪😀 word ' * (n % 20)}\r\n',
        ).join(),
      );
      var folds = SourceFoldMap(lines.source.length, [
        SourceRange(lines.offsetForLine(90), lines.offsetForLine(160)),
      ]);
      final geometry = SourceGeometry();
      var columns = 30;
      void verify() {
        geometry.indexViewport(lines, columns, folds);
        final tops = <int>[0];
        for (final line in lines.lines) {
          expect(geometry.rowForLine(line.number), tops.last);
          tops.add(
            tops.last +
                (folds.hides(line.startOffset)
                    ? 0
                    : math.max(1, (line.text.length / columns).ceil())),
          );
        }
        expect(geometry.totalRows, tops.last);
        for (final row in [
          0.0,
          .5,
          20.5,
          tops.last / 2,
          tops.last.toDouble(),
          tops.last + 3.0,
        ]) {
          var expected = 0;
          while (expected + 1 < lines.lineCount && tops[expected + 1] <= row) {
            expected++;
          }
          expect(geometry.lineAtRow(row), expected + 1);
        }
      }

      verify();
      for (var i = 0; i < 90; i++) {
        final line = lines.lineAt(
          [1, 89, 90, 159, 160, 128, 129, lines.lineCount][i % 8],
        );
        final start = i % 3 == 0 ? line.endOffset : line.startOffset;
        final end = i % 3 == 0 && line.hasLineBreak ? start + 1 : start;
        final added = i % 4 == 0
            ? 'long wrap 雪😀 ' * 10
            : i % 3 == 0
            ? ''
            : 'new\n';
        folds = folds.afterChange(start, end, added.length);
        lines = SourceLineIndex.updated(
          previous: lines,
          source: lines.source.replaceRange(start, end, added),
          oldStart: start,
          oldEnd: end,
        );
        if (i == 30) columns = 15;
        if (i == 60) {
          // Two core updates between paints cannot inherit the skipped layout.
          folds = folds.afterChange(0, 0, 4);
          lines = SourceLineIndex.updated(
            previous: lines,
            source: 'two\n${lines.source}',
            oldStart: 0,
            oldEnd: 0,
          );
        }
        verify();
      }
      lines = SourceLineIndex('');
      folds = SourceFoldMap(0, const []);
      verify();
    },
  );

  test(
    'viewport measures only changed rows in a hundred-thousand-line source',
    () {
      final geometry = SourceGeometry();
      var lines = CountingSourceLineIndex(
        SourceLineIndex(List.generate(100000, (n) => 'line$n').join('\n')),
      );
      var folds = SourceFoldMap(lines.source.length, [
        SourceRange(lines.offsetForLine(80000), lines.offsetForLine(90000)),
      ]);
      geometry.indexViewport(lines, 40, folds);
      expect(lines.reads, 100000);
      final initialRows = geometry.totalRows;
      for (final insert in ['x' * 100, '\nnew\r\nrows\n', '😀']) {
        final start = lines.offsetForLine(128);
        final next = SourceLineIndex.updated(
          previous: lines,
          source: lines.source.replaceRange(start, start, insert),
          oldStart: start,
          oldEnd: start,
        );
        folds = folds.afterChange(start, start, insert.length);
        lines = CountingSourceLineIndex(next);
        geometry.indexViewport(lines, 40, folds);
        expect(lines.reads, lessThanOrEqualTo(7));
        final reads = lines.reads;
        geometry.indexViewport(lines, 40, folds);
        expect(lines.reads, reads);
      }
      expect(geometry.totalRows, greaterThan(initialRows));
      lines.reads = 0;
      geometry.indexViewport(lines, 20, folds);
      expect(
        lines.reads,
        lines.lineCount,
        reason: 'A genuine width change affects every wrap estimate',
      );
    },
  );

  test(
    'repeated line insertion and deletion retain distant viewport coordinates',
    () {
      var lines = SourceLineIndex(
        List.generate(1000, (n) => 'line$n').join('\n'),
      );
      final geometry = SourceGeometry();
      for (var i = 0; i < 600; i++) {
        geometry.indexViewport(
          lines,
          40,
          SourceFoldMap(lines.source.length, const []),
        );
        expect(geometry.totalRows, lines.lineCount);
        expect(geometry.rowForLine(lines.lineCount), lines.lineCount - 1);
        expect(geometry.lineAtRow(lines.lineCount - 1.5), lines.lineCount - 1);
        final end = i < 300 ? 0 : 2;
        final added = i < 300 ? 'x\n' : '';
        lines = SourceLineIndex.updated(
          previous: lines,
          source: lines.source.replaceRange(0, end, added),
          oldStart: 0,
          oldEnd: end,
        );
      }
      expect(lines.lineCount, 1000);
    },
  );

  testWidgets('cached gutter paragraphs match the editable full-text geometry', (
    tester,
  ) async {
    final geometry = SourceGeometry();
    const texts = [
      'first\n\n😀 é 漢字\r\n\$value\nlast',
      'long wrapped 😀 line with several words and punctuation; repeated text '
          'that must occupy several visual rows\r\n\nlast',
      'first\r\nchanged\r\nlast',
      'first\r\nchanged again\r\nlast',
      'last wraps repeatedly with 😀 漢字 and enough words to reach the next row '
          'and another row with the same actual strut',
    ];
    for (final scale in [1.0, 1.5, 2.0]) {
      for (final width in [120.0, 320.0]) {
        for (final text in texts) {
          await tester.pumpWidget(
            MediaQuery(
              data: MediaQueryData(textScaler: TextScaler.linear(scale)),
              child: Directionality(
                textDirection: TextDirection.ltr,
                child: Builder(
                  builder: (context) {
                    const style = TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 14,
                      height: 1.5,
                      leadingDistribution: TextLeadingDistribution.even,
                    );
                    final measured = geometry.measure(
                      context,
                      text,
                      style,
                      width,
                    );
                    final painter = TextPainter(
                      text: TextSpan(text: text, style: style),
                      strutStyle: StrutStyle.fromTextStyle(
                        style,
                        forceStrutHeight: true,
                      ),
                      textDirection: TextDirection.ltr,
                      textHeightBehavior: sourceTextHeightBehavior,
                      textScaler: TextScaler.linear(scale),
                    )..layout(minWidth: width, maxWidth: width);
                    final lines = SourceLineIndex(text);
                    final tops = [
                      for (final line in lines.lines)
                        painter
                            .getOffsetForCaret(
                              TextPosition(offset: line.startOffset),
                              Rect.zero,
                            )
                            .dy,
                    ];
                    for (var i = 0; i < lines.lineCount; i++) {
                      final expected = math.max(
                        scale * 21,
                        (i + 1 < tops.length ? tops[i + 1] : painter.height) -
                            tops[i],
                      );
                      expect(
                        measured[i],
                        closeTo(expected, .001),
                        reason: 'line $i, scale $scale, width $width',
                      );
                    }
                    expect(
                      geometry.measure(context, text, style, width),
                      same(measured),
                    );
                    painter.dispose();
                    return const SizedBox();
                  },
                ),
              ),
            ),
          );
          expect(tester.takeException(), isNull);
        }
      }
    }
  });
}
