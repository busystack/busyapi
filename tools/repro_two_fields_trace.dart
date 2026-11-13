// Diagnostic entry for the plain two-field fixture. Never packaged.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';

import 'repro_two_fields.dart' as probe;
import 'source_input_trace.dart';

void main() {
  InputTraceBinding();
  HardwareKeyboard.instance.addHandler((event) {
    stderr.writeln(
      'PLAIN_HARDWARE ${jsonEncode({'type': event.runtimeType.toString(), 'logical': event.logicalKey.keyId, 'physical': event.physicalKey.usbHidUsage, 'character': event.character})}',
    );
    return false;
  });
  probe.main();
}
