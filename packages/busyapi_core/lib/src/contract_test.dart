import 'package:path/path.dart' as p;

import 'model.dart';
import 'project.dart';
import 'request.dart';
import 'form_media_types.dart';
import 'multipart_encoding.dart';
import 'storage.dart';

const contractTestProducerVersion = '4';

class ContractCaseResult {
  const ContractCaseResult({
    required this.name,
    required this.operation,
    required this.snapshot,
    required this.status,
    required this.complete,
    required this.passed,
    required this.findings,
    required this.dispatched,
    this.responseStatus,
    this.mediaType,
    this.bodyIdentity,
    this.bodyLength,
    this.elapsed = Duration.zero,
    this.operationalFailure = false,
    this.stream,
  });
  final String name, operation, snapshot, status;
  final bool complete, passed;
  final int? responseStatus, bodyLength;
  final String? mediaType, bodyIdentity;
  final Duration elapsed;
  final Map<String,Object?>? stream;
  final bool operationalFailure;
  final bool dispatched;
  final List<Map<String, Object?>> findings;
  Map<String, Object?> toJson() => {
    'name': name,
    'operation': operation,
    'snapshot': snapshot,
    'status': status,
    'complete': complete,
    'passed': passed,
    'dispatched': dispatched,
    'operationalFailure': operationalFailure,
    if (responseStatus != null) 'responseStatus': responseStatus,
    if (mediaType != null) 'mediaType': mediaType,
    if (bodyIdentity != null) 'bodyIdentity': bodyIdentity,
    if (bodyLength != null) 'bodyLength': bodyLength,
    'findings': findings,
    if(stream!=null)'stream':stream,
  };
}

class ContractTestReport {
  const ContractTestReport({
    required this.snapshot,
    required this.complete,
    required this.passed,
    required this.cases,
    required this.executedOperations,
    required this.untestedOperations,
    this.saved = true,
  });
  final String snapshot;
  final bool complete, passed;
  final bool saved;
  final List<ContractCaseResult> cases;
  final List<String> executedOperations, untestedOperations;
  Map<String, Object?> toJson() => {
    'version': 1,
    'status': !complete
        ? 'incomplete'
        : passed
        ? 'complete'
        : 'failed',
    'complete': complete,
    'passed': passed,
    'snapshot': snapshot,
    'input': saved ? 'saved-source' : 'working-buffers',
    'unsaved': !saved,
    'producer': 'busyapi-contract-tests',
    'producerVersion': contractTestProducerVersion,
    'cases': cases.map((value) => value.toJson()).toList(),
    'executedOperations': executedOperations,
    'untestedOperations': untestedOperations,
    'coverage': {
      'selection': 'explicit-cases-only',
      'execution': 'transport-dispatched-attempts',
      'transport': 'native-dart-http',
      'schema': 'busyapi-contract-engine',
      'exhaustive': false,
    },
  };
}

class ContractTestRunner {
  const ContractTestRunner({this.executor = const ContractRequestExecutor()});
  final ContractRequestExecutor executor;

  Future<ContractTestReport> run(
    BusyProject project,
    String root, {
    required List<String> selectedCases,
    required SecretResolver resolveSecret,
    String? environment,
    RunCancellation? cancellation,
    bool saved = true,
    String? expectedSourceIdentity,
  }) async {
    if (selectedCases.isEmpty) {
      throw CoreFailure(
        'test.selection',
        'Select one or more named contract test cases; BusyAPI does not sweep operations automatically',
      );
    }
    final captured = await project.captureContractSnapshot(
      root,
      saved: saved,
      cancelled: () => cancellation?.cancelled == true,
    );
    cancellation?.throwIfCancelled();
    if (expectedSourceIdentity != null &&
        captured.snapshot.sourceIdentity != expectedSourceIdentity) {
      throw CoreFailure(
        'test.snapshot.changed',
        'The contract or configuration changed after case selection; reopen the test selection before executing.',
      );
    }
    final configuration = ExecutionConfiguration.parse(
      captured.snapshot.configuration.singleOrNull,
      project.access.boundary,
    );
    final definitions = <String, Map<String, Object?>>{};
    for (final item in configuration.tests) {
      final name = item['name'];
      if (name is! String || name.isEmpty || definitions.containsKey(name)) {
        throw CoreFailure(
          'test.configuration',
          'Every contract test requires a unique non-empty name',
        );
      }
      definitions[name] = item;
    }
    for (final name in selectedCases) {
      if (!definitions.containsKey(name)) {
        throw CoreFailure(
          'test.selection',
          'Configured test case $name was not found',
        );
      }
    }
    // Validate the entire selected run before its first network operation.
    for (final name in selectedCases) {
      _validateDefinition(
        definitions[name]!,
        configuration.tests.indexOf(definitions[name]!),
      );
    }
    final exactCases = <String, Map<String, dynamic>>{};
    for (final name in selectedCases) {
      cancellation?.throwIfCancelled();
      exactCases[name] = await project.engine.request('executionCaseValues', {
        'source': configuration.source,
        'name': name,
      });
    }
    final projection = captured.analysis['projection'];
    final operations = projection is Map && projection['operations'] is List
        ? (projection['operations'] as List).whereType<Map>().toList()
        : const <Map>[];
    final selectionFailure = _selectionFailure(captured.analysis);
    final results = <ContractCaseResult>[], executed = <String>{};
    for (final name in selectedCases) {
      cancellation?.throwIfCancelled();
      final definition = definitions[name]!;
      Map? selected;
      final operation = definition['operation'];
      if (operation is Map &&
          (operation['entry'] == null || operation['entry'] == configuration.entryName(root))) {
        if (operation['occurrence'] is String) {
          selected = operations
              .where(
                (candidate) =>
                    candidate['occurrence'] == operation['occurrence'],
              )
              .singleOrNull;
        } else {
          final candidates = operations
              .where(
                (candidate) =>
                    candidate['role'] == 'operation' &&
                    candidate['path'] == operation['path'],
              )
              .toList();
          // A custom token can differ from a fixed method only by case. Prefer
          // exact wire identity before normalizing an existing fixed-field name.
          selected = candidates
              .where(
                (candidate) =>
                    httpOperationMethod(candidate) == operation['method'],
              )
              .singleOrNull;
          selected ??= candidates
              .where(
                (candidate) =>
                    candidate['customMethod'] != true &&
                    httpOperationMethod(candidate) ==
                        '${operation['method']}'.toUpperCase(),
              )
              .singleOrNull;
        }
      }
      if (selected == null ||
          selected['resource'] is! String ||
          selected['pointer'] is! String) {
        results.add(
          selectionFailure == null
              ? _failedCase(
                  name,
                  'unresolved operation',
                  captured.snapshot.identity,
                  'test.operation',
                  'The configured operation is not uniquely available in the captured contract.',
                )
              : ContractCaseResult(
                  name: name,
                  operation: 'unresolved operation',
                  snapshot: captured.snapshot.identity,
                  status: selectionFailure.complete ? 'failed' : 'incomplete',
                  complete: selectionFailure.complete,
                  passed: false,
                  findings: selectionFailure.findings,
                  dispatched: false,
                ),
        );
        continue;
      }
      final label = '${httpOperationMethod(selected)} ${selected['path']}';
      final operationIdentity = selected['occurrence']?.toString() ?? label;
      var dispatched = false;
      OperationRequestPlan? plan;
      final clock = Stopwatch()..start();
      try {
        plan = await project.prepareRequest(
          root,
          resource: selected['resource'] as String,
          pointer: selected['pointer'] as String,
          occurrence: selected['occurrence'] as String?,
          saved: saved,
          requestId:
              'test-${captured.snapshot.identity.substring(0, 12)}-$name',
          cancelled: () => cancellation?.cancelled == true,
        );
        if (plan.snapshot.sourceIdentity != captured.snapshot.sourceIdentity) {
          throw CoreFailure(
            'test.snapshot.changed',
            'Project input changed while the selected test run was being captured',
          );
        }
        final draft = _draft(
          plan,
          definition,
          environment,
          exactCases[name]!,
          project.access,
        );
        final result = await executor.execute(
          plan,
          draft,
          resolveSecret: resolveSecret,
          cancellation: cancellation,
          onRequestDispatched: () {
            dispatched = true;
            executed.add(operationIdentity);
          },
        );
        try {
          results.add(_assert(name, label, definition, result, clock.elapsed));
        } finally {
          await result.close();
        }
      } on CoreFailure catch (failure) {
        if (failure.code == 'cancelled') rethrow;
        results.add(
          _failedCase(
            name,
            label,
            plan?.snapshot.identity ?? captured.snapshot.identity,
            failure.code,
            failure.message,
            source: failure.source,
            elapsed: clock.elapsed,
            dispatched: dispatched,
            complete:
                !failure.code.startsWith('runtime.') &&
                !failure.code.contains('timeout') &&
                !failure.code.contains('transport') &&
                !failure.unsupported,
            operationalFailure: failure.kind == CoreFailureKind.operational,
          ),
        );
      } finally {
        plan?.close();
      }
    }
    final all = operations
        .map(
          (value) =>
              value['occurrence']?.toString() ??
              '${httpOperationMethod(value)} ${value['path']}',
        )
        .toSet();
    return ContractTestReport(
      snapshot: captured.snapshot.identity,
      complete: results.isNotEmpty && results.every((value) => value.complete),
      passed: results.isNotEmpty && results.every((value) => value.passed),
      cases: List.unmodifiable(results),
      executedOperations: List.unmodifiable(executed),
      untestedOperations: List.unmodifiable(
        (all..removeAll(executed)).toList(),
      ),
      saved: saved,
    );
  }

  /// An incomplete inventory cannot prove that a configured operation is absent.
  /// Reuse the captured validation result, preserving its first error (or first
  /// diagnostic) and source. Other findings remain in the validation report.
  static ({bool complete, List<Map<String, Object?>> findings})?
  _selectionFailure(Map<String, dynamic> analysis) {
    final complete = analysis['complete'], findings = analysis['findings'];
    if (complete is! bool || findings is! List) {
      throw CoreFailure('test.analysis', 'Contract analysis is malformed');
    }
    Map<String, Object?>? first, error;
    for (final finding in findings) {
      if (finding is! Map || finding.keys.any((key) => key is! String)) {
        throw CoreFailure(
          'test.analysis',
          'Contract diagnostics are malformed',
        );
      }
      first ??= Map<String, Object?>.from(finding);
      if (finding['severity'] == 'error') {
        error ??= Map<String, Object?>.from(finding);
      }
    }
    if (complete && error == null) return null;
    return (
      complete: complete,
      findings: List.unmodifiable([
        error ??
            first ??
            {
              'code': 'test.operation.incomplete',
              'severity': 'warning',
              'message': 'The operation cannot be resolved from incomplete contract analysis. Review validation before retrying.',
            },
      ]),
    );
  }

  static void _validateDefinition(Map<String, Object?> value, int index) {
    Never invalid(String path, String explanation) => throw CoreFailure(
      'test.configuration',
      'busyapi.yaml /tests/$index/$path: $explanation',
    );
    void strings(Object? value, String path, {bool allowEmpty = false}) {
      if (value is! Map ||
          !allowEmpty && value.isEmpty ||
          value.length > 512 ||
          value.entries.any(
            (e) =>
                e.key is! String ||
                (e.key as String).isEmpty && !const ['body/partSchemas', 'body/partMediaTypes'].contains(path) ||
                e.value is! String,
          ))
        invalid(
          path,
          'Expected a non-empty bounded mapping of literal strings.',
        );
    }

    final operation = value['operation'];
    if (operation is! Map ||
        !(operation['occurrence'] is String &&
                (operation['occurrence'] as String).isNotEmpty ||
            operation['method'] is String &&
                (operation['method'] as String).isNotEmpty &&
                operation['path'] is String &&
                (operation['path'] as String).startsWith('/')))
      invalid('operation', 'Choose an occurrence or method/path.');
    for (final field in ['occurrence', 'method', 'path', 'entry']) {
      if (operation.containsKey(field) &&
          (operation[field] is! String ||
              (operation[field] as String).isEmpty ||
              field == 'path' &&
                  !(operation[field] as String).startsWith('/'))) {
        invalid(
          'operation/$field',
          'Expected a non-empty operation selector string.',
        );
      }
    }
    for (final key in ['environment']) {
      if (value.containsKey(key) &&
          (value[key] is! String || (value[key] as String).isEmpty))
        invalid(key, 'Expected a non-empty string.');
    }
    if(value.containsKey('stream')){final stream=value['stream'];if(stream is! Map||stream.keys.any((key)=>key!='stopAfterRecords')||stream['stopAfterRecords'] is! int||(stream['stopAfterRecords'] as int)<1||(stream['stopAfterRecords'] as int)>1000000000)invalid('stream','Expected a bounded positive stopAfterRecords selection.');}
    if (value.containsKey('tlsFiles')) {
      final files = value['tlsFiles'];
      if (files is! Map || files.length > 3 || files.entries.any((entry) =>
          !['caFile','clientCertificateFile','clientKeyFile'].contains(entry.key) || entry.value is! String ||
          (entry.value as String).length > 4096 || (entry.value as String).contains('\u0000') ||
          p.isAbsolute(entry.value as String) || p.split(entry.value as String).contains('..'))) {
        invalid('tlsFiles', 'Expected approved project-relative TLS file selections.');
      }
    }
    final servers = value['servers'];
    if (servers != null && (servers is! Map || servers.length > 2048 ||
        servers.entries.any((entry) => entry.key is! String || entry.value is! int || (entry.value as int) < -1 || (entry.value as int) > 2048))) {
      invalid('servers', 'Expected bounded environment Server selections.');
    }
    for (final key in ['server', 'securityAlternative']) {
      if (value.containsKey(key) &&
          (value[key] is! int ||
              (value[key] as int) < 0 ||
              (value[key] as int) >= 2048))
        invalid(key, 'Expected a selection index between 0 and 2047.');
    }
    for (final key in [
      'connectTimeoutMs',
      'overallTimeoutMs',
      'inactivityTimeoutMs',
    ]) {
      if (value.containsKey(key) &&
          (value[key] is! int ||
              (value[key] as int) <= 0 ||
              (value[key] as int) > 600000))
        invalid(key, 'Expected 1–600000 milliseconds.');
    }
    for (final key in ['headers', 'variables']) {
      if (value.containsKey(key)) strings(value[key], key, allowEmpty: true);
    }
    if (value.containsKey('parameterModes')) {
      final modes = value['parameterModes'];
      if (modes is! Map || modes.length > 5) invalid('parameterModes', 'Expected bounded parameter representation modes.');
      for (final location in (modes as Map).entries) {
        if (!['path','query','querystring','header','cookie'].contains(location.key) || location.value is! Map || (location.value as Map).length > 512 ||
            (location.value as Map).entries.any((entry) => entry.key is! String || !['data','text','serializedParameter','serializedMedia'].contains(entry.value) || value['parameters'] is! Map || (value['parameters'] as Map)[location.key] is! Map || !((value['parameters'] as Map)[location.key] as Map).containsKey(entry.key) || entry.value != 'data' && ((value['parameters'] as Map)[location.key] as Map)[entry.key] is! String)) {
          invalid('parameterModes', 'Expected captured data, text or serialized parameter modes.');
        }
      }
    }
    if (value.containsKey('parameterExamples')) {
      final selections = value['parameterExamples'];
      if (selections is! Map || selections.length > 5) invalid('parameterExamples', 'Expected bounded captured Parameter example choices.');
      for (final location in (selections as Map).entries) {
        if (!['path','query','querystring','header','cookie'].contains(location.key) || location.value is! Map || (location.value as Map).length > 512) {
          invalid('parameterExamples', 'Expected named choices at a supported Parameter location.');
        }
        for (final entry in (location.value as Map).entries) {
          final choice = entry.value;
          if (entry.key is! String || (entry.key as String).isEmpty || choice is! Map || choice['name'] is! String ||
              choice.keys.any((key) => !['name','mediaType'].contains(key)) ||
              choice.containsKey('mediaType') && (choice['mediaType'] is! String || (choice['mediaType'] as String).isEmpty) ||
              value['parameters'] is Map && (value['parameters'] as Map)[location.key] is Map &&
                ((value['parameters'] as Map)[location.key] as Map).containsKey(entry.key)) {
            invalid('parameterExamples', 'Choose one captured example name and optional declared media type per Parameter, without a competing literal value.');
          }
        }
      }
    }
    if (value.containsKey('parameters')) {
      final parameters = value['parameters'];
      if (parameters is! Map)
        invalid('parameters', 'Expected a location mapping.');
      for (final entry in parameters.entries) {
        if (!const [
              'path',
              'query',
              'querystring',
              'header',
              'cookie',
            ].contains(entry.key) ||
            entry.value is! Map ||
            (entry.value as Map).keys.any((k) => k is! String || k.isEmpty))
          invalid(
            'parameters/${entry.key}',
            'Expected a supported location with named typed values.',
          );
      }
    }
    if (value.containsKey('body')) {
      final body = value['body'];
      if (body is! Map ||
          body['mediaType'] is! String ||
          (body['mediaType'] as String).isEmpty ||
          ['value','externalExample','file'].where(body.containsKey).length != 1)
        invalid('body', 'Expected mediaType and exactly one value, external example name or approved file reference.');
      if (body.containsKey('representation') && !['data', 'serialized', 'fields'].contains(body['representation'])) invalid('body/representation', 'Expected data, serialized or literal field-row body mode.');
      if (body['representation'] == 'serialized' && body.containsKey('value') && body['value'] is! String) invalid('body/value', 'Serialized body mode requires a string.');
      if (body.containsKey('file')) {
        final file = body['file'];
        if (file is! String || file.isEmpty || file.length > 4096 || file.contains('\u0000') || p.isAbsolute(file) || p.split(file).contains('..') || body['representation'] == 'data' || body['representation'] == 'fields') invalid('body/file', 'Expected an approved project-relative serialized file reference.');
      }
      if (body['representation'] == 'fields') {
        final fields = body['value'];
        if (fields is! List || fields.length > 2048 || fields.any((field) => field is! Map || field['name'] is! String || field['value'] is! String || (field['name'] as String).length > 4096 || (field['value'] as String).length > 16 * 1024 * 1024)) invalid('body/value', 'Expected bounded literal name/value field rows.');
        final media = (body['mediaType'] as String).split(';').first.trim().toLowerCase();
        if (media != 'application/x-www-form-urlencoded' && !media.startsWith('multipart/')) invalid('body/representation', 'Literal field rows require a captured form representation.');
      }
      if (body.containsKey('externalExample')) {
        final choice = body['externalExample'];
        final valid = choice is String && choice.length <= 8192 ||
            choice is Map && choice.length == 1 && choice['name'] is String &&
                (choice['name'] as String).length <= 8192;
        if (!valid) invalid('body/externalExample',
            'Expected a bounded example name or a named selector from the selected media occurrence.');
      }
      if (body.containsKey('partMediaTypes')) {
        strings(
          body['partMediaTypes'],
          'body/partMediaTypes',
          allowEmpty: true,
        );
        final essence = (body['mediaType'] as String)
            .split(';')
            .first
            .trim()
            .toLowerCase();
        if (!(essence == 'application/x-www-form-urlencoded' ||
                essence.startsWith('multipart/')) ||
            (body['value'] is! Map && body['value'] is! List))
          invalid(
            'body/partMediaTypes',
            'Part media choices require structured form data.',
          );
      }
      if (body.containsKey('partHeaders')) {
        final fields = body['partHeaders'];
        if (fields is! List ||
            fields.length > 2048 ||
            (body['value'] is! Map && body['value'] is! List) ||
            !(body['mediaType'] as String)
                .split(';')
                .first
                .trim()
                .toLowerCase()
                .startsWith('multipart/')) {
          invalid(
            'body/partHeaders',
            'Part headers require structured multipart input and bounded field lines.',
          );
        }
        for (var i = 0; i < fields.length; i++) {
          try {
            RequestPartHeaderValue.fromJson(fields[i]);
          } on CoreFailure {
            invalid(
              'body/partHeaders/$i',
              'Expected bounded part, name and value strings.',
            );
          }
        }
      }
      if (body.containsKey('files') || body.containsKey('fileShapes')) {
        if ((body['value'] is! Map && body['value'] is! List) ||
            !(body['mediaType'] as String)
                .split(';')
                .first
                .trim()
                .toLowerCase()
                .startsWith('multipart/')) {
          invalid(
            'body/files',
            'File inputs require structured multipart data.',
          );
        }
        final files = body.containsKey('files') ? body['files'] : const [];
        if (files is! List || files.length > 2048) {
          invalid('body/files', 'Expected at most 2048 file inputs.');
        }
        final names = <String>{};
        for (var i = 0; i < files.length; i++) {
          final file = files[i];
          if (file is! Map ||
              file.keys.any(
                (key) => !const [
                  'name',
                  'path',
                  'filename',
                  'mediaType',
                  'capturedExample',
                ].contains(key),
              ) ||
              file['name'] is! String ||
              (file['name'] as String).length > 8192 ||
              file['path'] is! String ||
              (file['path'] as String).isEmpty ||
              (file['path'] as String).length > 8192 ||
              p.isAbsolute(file['path'] as String) ||
              p.split(p.normalize(file['path'] as String)).contains('..') ||
              file.containsKey('capturedExample') && file['capturedExample'] is! bool ||
              file['capturedExample'] == true && (file['mediaType'] is! String || (file['mediaType'] as String).isEmpty) ||
              ['filename', 'mediaType'].any(
                (key) =>
                    file.containsKey(key) &&
                    (file[key] is! String ||
                        (file[key] as String).length > 8192),
              )) {
            invalid(
              'body/files/$i',
              'Expected a named file with a relative path inside the project.',
            );
          }
          names.add(file['name'] as String);
        }
        if (body.containsKey('fileShapes')) {
          final shapes = body['fileShapes'];
          if (shapes is! Map ||
              shapes.length > 2048 ||
              shapes.entries.any(
                (entry) =>
                    !names.contains(entry.key) ||
                    !const ['single', 'array'].contains(entry.value),
              )) {
            invalid(
              'body/fileShapes',
              'Expected single or array choices for selected file names.',
            );
          }
        }
      }
      if (body.containsKey('partSchemas')) {
        strings(body['partSchemas'], 'body/partSchemas', allowEmpty: true);
        if (!(body['mediaType'] as String).toLowerCase().startsWith('multipart/') ||
            body['value'] is! Map && body['value'] is! List) {
          invalid('body/partSchemas', 'Representation choices require structured multipart data.');
        }
      }
    }
    if (!value.containsKey('expect')) return;
    final expect = value['expect'];
    if (expect is! Map ||
        expect.isEmpty ||
        expect.keys.any((k) => !['status', 'mediaType', 'headers'].contains(k)))
      invalid('expect', 'Expected status, mediaType or headers assertions.');
    if (expect.containsKey('status')) {
      final status = expect['status'];
      bool valid(Object? v) => v is int && v >= 100 && v <= 599;
      if (!(valid(status) ||
          status is List &&
              status.isNotEmpty &&
              status.length <= 128 &&
              status.every(valid)))
        invalid(
          'expect/status',
          'Expected an HTTP status integer or a non-empty list of HTTP status integers.',
        );
    }
    if (expect.containsKey('mediaType') &&
        (expect['mediaType'] is! String ||
            (expect['mediaType'] as String).isEmpty))
      invalid('expect/mediaType', 'Expected a media type string.');
    if (expect.containsKey('headers')) {
      strings(expect['headers'], 'expect/headers');
      for (final entry in (expect['headers'] as Map).entries) {
        if (!RegExp(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")
                .hasMatch(entry.key as String) ||
            RegExp(r'[\x00-\x1f\x7f]').hasMatch(entry.value as String))
          invalid(
            'expect/headers',
            'Header assertions require valid field names and literal field values.',
          );
      }
    }
  }

  /// Native reopening and headless execution share the same saved-case decoder.
  static Future<OperationRequestDraft> reopenCase(OperationRequestPlan plan, String name, ProjectAccess access) async {
    plan.ensureCurrentPreparation();
    final cases = plan.configuration.tests.where((item) => item['name'] == name).toList();
    if (cases.length != 1) throw CoreFailure('test.configuration', 'Choose one current saved request case.');
    final definition = cases.single, operation = definition['operation'];
    if (operation is! Map || operation['path'] != plan.operation['path'] ||
        '${operation['method']}'.toLowerCase() != '${plan.operation['method']}'.toLowerCase()) {
      throw CoreFailure('request.case.operation', 'The saved case belongs to another captured operation.');
    }
    _validateDefinition(definition, plan.configuration.tests.indexOf(definition));
    final exact = await plan.caseValues(name);
    plan.ensureCurrentPreparation();
    return _draft(plan, definition, null, exact, access);
  }

  static OperationRequestDraft _draft(
    OperationRequestPlan plan,
    Map<String, Object?> definition,
    String? environmentOverride,
    Map<String, dynamic> exact,
    ProjectAccess access,
  ) {
    final parameters = <String, RequestValue>{};
    final headers = <RequestHeaderValue>[];
    if (definition['headers'] is Map) {
      for (final entry in (definition['headers'] as Map).entries) {
        if (entry.key is String && entry.value is String) {
          headers.add(
            RequestHeaderValue(entry.key as String, entry.value as String),
          );
        }
      }
    }
    RequestBodyDraft body = const RequestBodyDraft.none();
    final rawBody = definition['body'];
    for (final entry in (exact['parameters'] as Map).entries) {
      final value = entry.value as Map;
      parameters[entry.key as String] = value['json'] == true
          ? RequestValue.json(value['text'] as String)
          : value['representation'] == 'serializedParameter' ? RequestValue.serialized(value['text'] as String)
          : value['representation'] == 'serializedMedia' ? RequestValue.serialized(value['text'] as String, mediaLevel: true)
          : RequestValue.text(value['text'] as String);
    }
    for (final location in (definition['parameterExamples'] as Map? ?? const {}).entries) {
      for (final entry in (location.value as Map).entries) {
        final choice = entry.value as Map;
        parameters[OperationRequestDraft.parameterKey(location.key as String, entry.key as String)] =
            RequestValue.example(plan.captureParameterExample(location.key as String, entry.key as String,
                name: choice['name'] as String,
                mediaType: choice['mediaType'] as String?));
      }
    }
    if (rawBody is Map && rawBody['file'] is String) {
      body = RequestBodyDraft.approvedFile(mediaType:rawBody['mediaType'] as String,file:access.pathFor(p.join(access.boundary,rawBody['file'] as String)),access:access);
    } else if (rawBody is Map && rawBody.containsKey('externalExample')) {
      final choice = rawBody['externalExample'];
      body = RequestBodyDraft.example(plan.captureBodyExample(rawBody['mediaType'] as String,
        name: choice is Map ? choice['name'] as String : choice == '' ? null : choice as String));
    } else if (rawBody is Map && exact['body'] is Map) {
      final media = rawBody['mediaType'] as String,
          text = exact['body']['text'] as String;
      final partMediaTypes = rawBody['partMediaTypes'] is Map
          ? (rawBody['partMediaTypes'] as Map).cast<String, String>()
          : const <String, String>{};
      final partHeaders = [
        for (final value in rawBody['partHeaders'] as List? ?? const [])
          RequestPartHeaderValue.fromJson(value),
      ];
      final files = [
        for (final value in rawBody['files'] as List? ?? const [])
          if (value['capturedExample'] == true)
            MultipartFileValue.example(plan.capturePartExample(media, value['name'] as String,
                value['mediaType'] as String, Uri.file(access.pathFor(p.join(access.boundary, value['path'] as String))).toString()),
                filename: value['filename'] as String?)
          else MultipartFileValue(
            name: value['name'] as String,
            path: access.pathFor(
              p.join(access.boundary, value['path'] as String),
            ),
            filename: value['filename'] as String?,
            mediaType:
                value['mediaType'] as String? ?? 'application/octet-stream',
            selectedMediaType: value['mediaType'] as String?,
            access: access,
          ),
      ];
      final fileShapes = <String, MultipartFileShape>{
        for (final entry in (rawBody['fileShapes'] as Map? ?? const {}).entries)
          entry.key as String: MultipartFileShape.fromJson(entry.value),
      };
      final binding = plan.formBindingForMedia(media);
      if (((partHeaders.isNotEmpty ||
                  files.isNotEmpty ||
                  fileShapes.isNotEmpty) &&
              binding?.multipart != true) ||
          (partMediaTypes.isNotEmpty && binding == null)) {
        throw CoreFailure(
          'request.multipart.header.owner',
          'The captured body no longer supports these part inputs.',
        );
      }
      final rows = rawBody['representation'] == 'fields' ? [for (final field in rawBody['value'] as List) RequestFormField(field['name'] as String,field['value'] as String)] : const <RequestFormField>[];
      body = rawBody['representation'] == 'fields'
          ? binding == RequestFormBinding.urlEncoded ? RequestBodyDraft.form(rows,mediaType:media,partMediaTypes:partMediaTypes) : RequestBodyDraft.multipart(rows,files,mediaType:media,partMediaTypes:partMediaTypes,partHeaders:partHeaders,fileShapes:fileShapes,partSchemas:(rawBody['partSchemas'] as Map? ?? const {}).cast<String,String>())
          : exact['body']['json'] == true
          ? switch (plan.formBindingForMedia(media)) {
              RequestFormBinding.urlEncoded => RequestBodyDraft.formValue(
                json: text,
                mediaType: media,
                partMediaTypes: partMediaTypes,
              ),
              RequestFormBinding.namedMultipart || RequestFormBinding.orderedMultipart =>
                RequestBodyDraft.multipartValue(
                  json: text,
                  mediaType: media,
                  partMediaTypes: partMediaTypes,
                  partHeaders: partHeaders,
                  files: files,
                  fileShapes: fileShapes,
                  partSchemas: (rawBody['partSchemas'] as Map? ?? const {}).cast<String, String>(),
                ),
              null => (media.split(';').first.trim().toLowerCase() == 'application/linkset' ||
                       media.split(';').first.trim().toLowerCase().endsWith('+json') ||
                       media.split(';').first.trim().toLowerCase().endsWith('+xml') ||
                       ['application/json', 'application/xml', 'text/xml'].contains(media.split(';').first.trim().toLowerCase()))
                  ? RequestBodyDraft.modeled(mediaType: media, json: text)
                  : RequestBodyDraft.raw(mediaType: media, text: text),
            }
          : RequestBodyDraft.raw(mediaType: media, text: text);
    }
    return OperationRequestDraft(
      planIdentity: plan.identity,
      environment: environmentOverride ?? definition['environment'] as String?,
      server: definition['servers'] is Map && (definition['servers'] as Map)[environmentOverride ?? definition['environment']] is int
          ? (definition['servers'] as Map)[environmentOverride ?? definition['environment']] as int
          : definition['server'] is int ? definition['server'] as int : null,
      securityAlternative: definition['securityAlternative'] as int?,
      parameters: Map.unmodifiable(parameters),
      headers: List.unmodifiable(headers),
      variables: definition['variables'] is Map
          ? Map.unmodifiable({
              for (final entry in (definition['variables'] as Map).entries)
                if (entry.key is String && entry.value is String)
                  entry.key as String: entry.value as String,
            })
          : const {},
      body: body,
      streamStopAfterRecords: definition['stream'] is Map ? (definition['stream'] as Map)['stopAfterRecords'] as int? : null,
      tlsFiles: {for (final entry in (definition['tlsFiles'] as Map? ?? const {}).entries)
        entry.key as String: entry.value == '' ? '' : access.pathFor(p.join(access.boundary, entry.value as String))},
      connectTimeout: Duration(
        milliseconds: definition['connectTimeoutMs'] is int
            ? definition['connectTimeoutMs'] as int
            : 15000,
      ),
      overallTimeout: Duration(
        milliseconds: definition['overallTimeoutMs'] is int
            ? definition['overallTimeoutMs'] as int
            : 60000,
      ),
      inactivityTimeout: Duration(
        milliseconds: definition['inactivityTimeoutMs'] is int
            ? definition['inactivityTimeoutMs'] as int
            : 15000,
      ),
    );
  }

  static ContractCaseResult _assert(
    String name,
    String operation,
    Map<String, Object?> definition,
    ContractRequestResult result,
    Duration elapsed,
  ) {
    final findings = <Map<String, Object?>>[
      ...result.outgoing.findings,
      ...result.received.findings,
    ];
    final expected = definition['expect'];
    if (expected is Map) {
      final statuses = expected['status'] is List
          ? (expected['status'] as List).whereType<int>().toSet()
          : expected['status'] is int
          ? {expected['status'] as int}
          : <int>{};
      if (statuses.isNotEmpty && !statuses.contains(result.response.status)) {
        findings.add({
          'code': 'test.response.status',
          'severity': 'error',
          'message':
              'Expected HTTP ${statuses.join(' or ')}, received ${result.response.status}.',
          'location': 'status',
        });
      }
      if (expected['mediaType'] is String) {
        final actual = _contentType(result.response.headers);
        if (actual != (expected['mediaType'] as String).toLowerCase()) {
          findings.add({
            'code': 'test.response.media-type',
            'severity': 'error',
            'message':
                'Expected ${expected['mediaType']}, received ${actual ?? 'no Content-Type'}.',
            'location': 'headers:content-type',
          });
        }
      }
      if (expected['headers'] is Map) {
        final actual = <String, List<String>>{};
        for (final header in result.response.headers) {
          actual.putIfAbsent(header.$1.toLowerCase(), () => []).add(header.$2);
        }
        for (final header in (expected['headers'] as Map).entries) {
          if (header.key is String &&
              header.value is String &&
              !(actual[(header.key as String).toLowerCase()] ?? const [])
                  .contains(header.value)) {
            findings.add({
              'code': 'test.response.header',
              'severity': 'error',
              'message': 'Expected response header ${header.key}.',
              'location': 'headers:${header.key}',
            });
          }
        }
      }
    }
    final complete =
        result.response.receiptComplete &&
        result.outgoing.complete &&
        result.received.complete;
    final passed =
        complete && findings.every((value) => value['severity'] != 'error');
    return ContractCaseResult(
      name: name,
      operation: operation,
      snapshot: result.request.plan.snapshot.identity,
      status: result.response.stream?.status == 'stopped' ? 'stopped' : passed
          ? 'passed'
          : complete
          ? 'failed'
          : 'incomplete',
      complete: complete,
      passed: passed,
      dispatched: true,
      responseStatus: result.response.status,
      mediaType: _contentType(result.response.headers),
      bodyIdentity: result.response.bodyIdentity,
      bodyLength: result.response.bodyLength, stream:result.response.stream?.toJson(),
      findings: List.unmodifiable(findings),
      elapsed: elapsed,
    );
  }

  static ContractCaseResult _failedCase(
    String name,
    String operation,
    String snapshot,
    String code,
    String message, {
    bool complete = true,
    bool operationalFailure = true,
    bool dispatched = false,
    CoreFailureSource? source,
    Duration elapsed = Duration.zero,
  }) => ContractCaseResult(
    name: name,
    operation: operation,
    snapshot: snapshot,
    status: complete ? 'failed' : 'incomplete',
    complete: complete,
    passed: false,
    elapsed: elapsed,
    operationalFailure: operationalFailure,
    dispatched: dispatched,
    findings: [
      {
        'code': code,
        'severity': 'error',
        'message': message,
        if (source != null) ...{
          'resource': source.resource,
          'pointer': source.pointer,
          'range': [source.range.start, source.range.end],
        },
      },
    ],
  );

  static String? _contentType(List<(String, String)> headers) {
    final value = headers
        .where((header) => header.$1.toLowerCase() == 'content-type')
        .map((header) => header.$2)
        .firstOrNull;
    return value?.split(';').first.trim().toLowerCase();
  }
}
