import 'dart:collection';

import 'package:busyapi_core/busyapi_core.dart';

// Counts actual logical lines visited by layout, including the old .lines
// traversal. Binary offset lookups remain the real immutable core index.
class CountingSourceLineIndex extends SourceLineIndex {
  CountingSourceLineIndex(this.delegate) : super(delegate.source);
  final SourceLineIndex delegate;
  int reads = 0;
  @override
  String get source => delegate.source;
  @override
  Object get revision => delegate.revision;
  @override
  get change => delegate.change;
  @override
  int get lineCount => delegate.lineCount;
  @override
  List<SourceLine> get lines => _CountedLines(this);
  @override
  SourceLine lineAt(int number) {
    reads++;
    return delegate.lineAt(number);
  }

  @override
  SourceLine lineAtOffset(int offset) => lineAt(lineNumberAtOffset(offset));
  @override
  int lineNumberAtOffset(int offset) => delegate.lineNumberAtOffset(offset);
  @override
  int offsetForLine(int number) => delegate.offsetForLine(number);
}

class _CountedLines extends ListBase<SourceLine> {
  _CountedLines(this.index);
  final CountingSourceLineIndex index;
  @override
  int get length => index.lineCount;
  @override
  set length(int value) => throw UnsupportedError('Immutable lines');
  @override
  SourceLine operator [](int at) => index.lineAt(at + 1);
  @override
  void operator []=(int at, SourceLine value) =>
      throw UnsupportedError('Immutable lines');
}
