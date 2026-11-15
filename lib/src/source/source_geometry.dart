// Adapted from BusyMark source_gutter.dart, Copyright 2026 BusyStack, Apache-2.0.
// Modified for BusyAPI's bounded source window and incremental scroll geometry.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:busyapi_core/busyapi_core.dart';

const sourceTextHeightBehavior = TextHeightBehavior(
  applyHeightToFirstAscent: true,
  applyHeightToLastDescent: true,
  leadingDistribution: TextLeadingDistribution.even,
);

class SourceGeometry {
  SourceLineIndex? _indexed;
  SourceLineIndex? get indexed => _indexed;
  SourceFoldMap? _folds;
  int _columns = 0;
  final _rows = <_SourceRowChunk>[];
  final _lineEnds = <int>[0], _rowEnds = <int>[0];
  int get totalRows => _rowEnds.last;

  void invalidateViewport() => _indexed = null;

  void indexViewport(SourceLineIndex lines, int columns, SourceFoldMap folds) {
    bool sameFolds(SourceFoldMap a, SourceFoldMap b) =>
        a.length == b.length &&
        a.ranges.length == b.ranges.length &&
        Iterable<int>.generate(a.ranges.length).every(
          (i) =>
              a.ranges[i].start == b.ranges[i].start &&
              a.ranges[i].end == b.ranges[i].end,
        );
    if (identical(indexed, lines) &&
        _columns == columns &&
        sameFolds(_folds!, folds)) {
      return;
    }
    int rows(int number) {
      final line = lines.lineAt(number);
      return folds.hides(line.startOffset)
          ? 0
          : math.max(1, (line.text.length / columns).ceil());
    }

    final before = indexed, change = lines.change;
    if (before != null &&
        _columns == columns &&
        change?.previous == before.revision &&
        _folds!.ranges.length == folds.ranges.length &&
        sameFolds(
          _folds!.afterChange(change!.start, change.end, change.insertedLength),
          folds,
        )) {
      // CRLF seams can affect either neighboring line. Keep all other row
      // chunks intact; changing wrap height never shifts every later line.
      final first = before.lineNumberAtOffset(math.max(0, change.start - 1));
      final oldLast = before.lineNumberAtOffset(
        math.min(before.source.length, change.end + 1),
      );
      final newLast = lines.lineNumberAtOffset(
        math.min(lines.source.length, change.start + change.insertedLength + 1),
      );
      final firstChunk = _atOrBefore(_lineEnds, first - 1);
      final lastChunk = _atOrBefore(_lineEnds, oldLast - 1);
      // Repack the adjacent chunks too. Together with balanced splitting this
      // prevents repeated newline insertion from leaving one-line fragments.
      final head = math.max(0, firstChunk - 1);
      final tail = math.min(_rows.length - 1, lastChunk + 1);
      final changed = [
        ..._rows
            .getRange(head, firstChunk + 1)
            .expand((chunk) => chunk.values)
            .take(first - 1 - _lineEnds[head]),
        for (var line = first; line <= newLast; line++) rows(line),
        ..._rows
            .getRange(lastChunk, tail + 1)
            .expand((chunk) => chunk.values)
            .skip(oldLast - _lineEnds[lastChunk]),
      ];
      _rows.replaceRange(head, tail + 1, _chunks(changed));
    } else {
      _rows
        ..clear()
        ..addAll(
          _chunks([
            for (var line = 1; line <= lines.lineCount; line++) rows(line),
          ]),
        );
    }
    _lineEnds
      ..clear()
      ..add(0);
    _rowEnds
      ..clear()
      ..add(0);
    for (final chunk in _rows) {
      _lineEnds.add(_lineEnds.last + chunk.length);
      _rowEnds.add(_rowEnds.last + chunk.tops.last);
    }
    _indexed = lines;
    _columns = columns;
    _folds = folds;
  }

  int rowForLine(int number) {
    final at = (number - 1).clamp(0, _lineEnds.last);
    if (at == _lineEnds.last) return totalRows;
    final chunk = _atOrBefore(_lineEnds, at);
    return _rowEnds[chunk] + _rows[chunk].tops[at - _lineEnds[chunk]];
  }

  int lineAtRow(double row) {
    final chunk = _atOrBefore(_rowEnds, row).clamp(0, _rows.length - 1);
    final local = _atOrBefore(
      _rows[chunk].tops,
      row - _rowEnds[chunk],
    ).clamp(0, _rows[chunk].length - 1);
    return _lineEnds[chunk] + local + 1;
  }

  static int _atOrBefore(List<int> ends, num value) {
    var low = 0, high = ends.length;
    while (low < high) {
      final middle = (low + high) ~/ 2;
      if (ends[middle] <= value) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return math.max(0, low - 1);
  }

  static Iterable<_SourceRowChunk> _chunks(List<int> rows) sync* {
    final count = (rows.length + 127) ~/ 128;
    for (var i = 0; i < count; i++) {
      yield _SourceRowChunk(
        rows.sublist(i * rows.length ~/ count, (i + 1) * rows.length ~/ count),
      );
    }
  }

  String? _text;
  TextStyle? _style;
  double? _width;
  TextScaler? _scaler;
  List<double> _heights = [];
  final Map<String, double> _lineHeights = {};
  List<double> measure(
    BuildContext context,
    String text,
    TextStyle style,
    double width,
  ) {
    final scaler = MediaQuery.textScalerOf(context);
    if (_text == text &&
        _style == style &&
        _width == width &&
        _scaler == scaler) {
      return _heights;
    }
    if (_style != style || _width != width || _scaler != scaler) {
      _lineHeights.clear();
    }
    final index = SourceLineIndex(text);
    final strut = StrutStyle.fromTextStyle(style, forceStrutHeight: true);
    final fallback = scaler.scale(style.fontSize ?? 14) * (style.height ?? 1);
    double height(SourceLine line) {
      // Hard line breaks separate shaping paragraphs. Reuse their measured
      // heights; an ordinary edit only shapes its changed logical line. The
      // sentinel measures the next paragraph's caret with the same strut and
      // height behavior as RenderEditable, including empty and wrapped lines.
      final key = '${line.text}${line.lineBreak}';
      return _lineHeights.putIfAbsent(key, () {
        final painter = TextPainter(
          text: TextSpan(
            text: line.hasLineBreak ? '${key}M' : key,
            style: style,
          ),
          strutStyle: strut,
          textDirection: TextDirection.ltr,
          textHeightBehavior: sourceTextHeightBehavior,
          textScaler: scaler,
        )..layout(minWidth: math.max(1, width), maxWidth: math.max(1, width));
        final measured = line.hasLineBreak
            ? painter
                  .getOffsetForCaret(
                    TextPosition(offset: key.length),
                    Rect.zero,
                  )
                  .dy
            : painter.height;
        painter.dispose();
        return math.max(fallback, measured);
      });
    }

    final heights = [for (final line in index.lines) height(line)];
    if (_heights.length != heights.length ||
        Iterable<int>.generate(heights.length)
            .any((i) => heights[i] != _heights[i])) {
      _heights = heights;
    }
    // Retain only this bounded viewport, not every line visited in a session.
    final visible = {
      for (final line in index.lines) '${line.text}${line.lineBreak}',
    };
    _lineHeights.removeWhere((key, _) => !visible.contains(key));
    _text = text;
    _style = style;
    _width = width;
    _scaler = scaler;
    return _heights;
  }
}

class _SourceRowChunk {
  _SourceRowChunk(Iterable<int> values) {
    for (final value in values) {
      tops.add(tops.last + value);
    }
  }
  final tops = <int>[0];
  int get length => tops.length - 1;
  Iterable<int> get values sync* {
    for (var i = 0; i < length; i++) {
      yield tops[i + 1] - tops[i];
    }
  }
}
