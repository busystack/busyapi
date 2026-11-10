part of 'project.dart';

enum RunPhase {
  preparing,
  ready,
  running,
  cancelling,
  cancelled,
  failed,
  complete,
  incomplete,
}

/// One-use cancellation ownership shared by request, OAuth, mock and test
/// work. Closing a project invalidates the higher-level owner; this token makes
/// the in-flight socket/process stop independently of presentation selection.
class RunCancellation {
  bool _cancelled = false;
  final Completer<void> _signal = Completer<void>();
  final _listeners = <void Function()>{};
  /// Removable ownership for repeated streaming evaluations. A completed chunk
  /// must not remain retained by the run's pending cancellation Future.
  void Function() listen(void Function() callback) {
    if (_cancelled) {callback();return () {}; }
    _listeners.add(callback);return () {_listeners.remove(callback);};
  }
  bool get cancelled => _cancelled;
  Future<void> get whenCancelled => _signal.future;
  void cancel() {
    if (_cancelled) return;
    _cancelled = true;
    _signal.complete();
    final listeners = List<void Function()>.of(_listeners);_listeners.clear();
    for (final callback in listeners) callback();
  }

  void throwIfCancelled() {
    if (_cancelled) throw CoreFailure('cancelled', 'Execution was cancelled');
  }
}

class ExecutionConfiguration {
  const ExecutionConfiguration({
    required this.environments,
    required this.tests,
    required this.mock,
    required this.comparison,
    this.source,
  });
  final Map<String, ExecutionEnvironment> environments;
  final List<Map<String, Object?>> tests;
  final Map<String, Object?> mock, comparison;
  final Map<String, Object?>? source;

  /// Named entry identity survives copying the delivered project directory.
  String? entryName(String root) {
    if (source == null) return null;
    final data = loadYaml(source!['text'] as String);
    if (data is! YamlMap || data['roots'] is! YamlList) return null;
    for (final entry in data['roots'] as YamlList) {
      if (entry is YamlMap && entry['name'] is String && entry['path'] is String &&
          Uri.parse(source!['id'] as String).resolve(entry['path'] as String).toString() == root) {
        return entry['name'] as String;
      }
    }
    return null;
  }

  String operationServerKey(String root, Map operation) =>
      jsonEncode([entryName(root) ?? root, operation['method'], operation['path']]);

  static ExecutionConfiguration parse(
    Map<String, Object?>? source,
    String boundary,
  ) {
    if (source == null) {
      return const ExecutionConfiguration(
        environments: {},
        tests: [],
        mock: {},
        comparison: {},
      );
    }
    Object? value;
    try {
      value = loadYaml(source['text'] as String);
    } on Object {
      throw CoreFailure(
        'manifest.syntax',
        'Project configuration has invalid or ambiguous syntax; inspect busyapi.yaml',
      );
    }
    if (value is! YamlMap || value['version'] != 1) {
      throw CoreFailure(
        'manifest.version',
        'Expected project configuration version 1',
      );
    }
    Object? plain(Object? input, [int depth = 0]) {
      if (depth > 32) {
        throw CoreFailure(
          'manifest.limit',
          'Execution configuration nesting exceeds 32 levels',
        );
      }
      if (input is YamlMap) {
        if (input.length > 2048 || input.keys.any((key) => key is! String)) {
          throw CoreFailure(
            'manifest.execution',
            'Execution configuration requires bounded string-keyed mappings',
          );
        }
        return <String, Object?>{
          for (final entry in input.entries)
            entry.key as String: plain(entry.value, depth + 1),
        };
      }
      if (input is YamlList) {
        if (input.length > 2048) {
          throw CoreFailure(
            'manifest.execution',
            'Execution configuration sequences exceed 2048 entries',
          );
        }
        return <Object?>[for (final item in input) plain(item, depth + 1)];
      }
      if (input == null || input is String || input is bool || input is num) {
        return input;
      }
      throw CoreFailure(
        'manifest.execution',
        'Execution configuration contains an unsupported value',
      );
    }

    Map<String, Object?> mapping(Object? input, String name) {
      final converted = plain(input);
      if (converted == null) return const {};
      if (converted is! Map<String, Object?>) {
        throw CoreFailure('manifest.execution', '$name must be a mapping');
      }
      return converted;
    }

    final environments = <String, ExecutionEnvironment>{};
    for (final entry in mapping(
      value['environments'],
      'environments',
    ).entries) {
      if (entry.key.isEmpty || entry.key.length > 128) {
        throw CoreFailure(
          'environment.name',
          'Environment names must contain 1 to 128 characters',
        );
      }
      final definition = entry.value;
      if (definition is! Map<String, Object?>) {
        throw CoreFailure(
          'environment.definition',
          'Each environment must be a mapping',
        );
      }
      environments[entry.key] = ExecutionEnvironment.parse(
        entry.key,
        definition,
        boundary,
      );
    }
    final rawTests = plain(value['tests']);
    if (rawTests != null && rawTests is! List) {
      throw CoreFailure('test.configuration', 'tests must be a sequence');
    }
    final tests = <Map<String, Object?>>[];
    for (final item in rawTests as List? ?? const []) {
      if (item is! Map<String, Object?>) {
        throw CoreFailure(
          'test.configuration',
          'Each contract test must be a mapping',
        );
      }
      tests.add(Map.unmodifiable(item));
    }
    return ExecutionConfiguration(
      environments: Map.unmodifiable(environments),
      tests: List.unmodifiable(tests),
      mock: Map.unmodifiable(mapping(value['mock'], 'mock')),
      comparison: Map.unmodifiable(mapping(value['comparison'], 'comparison')),
      source: source,
    );
  }
}

class ExecutionEnvironment {
  const ExecutionEnvironment({
    required this.name,
    required this.variables,
    required this.headers,
    required this.authentication,
    required this.tls,
    this.baseUrl,
    this.servers = const {},
  });
  final String name;
  final String? baseUrl;
  final Map<String, int> servers;
  final Map<String, String> variables, headers;
  final Map<String, Object?> authentication, tls;

  static ExecutionEnvironment parse(
    String name,
    Map<String, Object?> value,
    String boundary,
  ) {
    String? optionalString(String key) {
      final item = value[key];
      if (item == null) return null;
      if (item is! String || item.length > 16384 || item.contains('\u0000')) {
        throw CoreFailure(
          'environment.value',
          'Environment $name has an invalid $key value',
        );
      }
      return item;
    }

    Map<String, String> strings(String key) {
      final item = value[key];
      if (item == null) return const {};
      if (item is! Map<String, Object?> || item.length > 512) {
        throw CoreFailure(
          'environment.value',
          'Environment $name $key must be a bounded mapping',
        );
      }
      final output = <String, String>{};
      for (final entry in item.entries) {
        if (entry.key.isEmpty ||
            entry.key.length > 1024 ||
            entry.value is! String ||
            (entry.value as String).length > 65536 ||
            (entry.value as String).contains('\u0000')) {
          throw CoreFailure(
            'environment.value',
            'Environment $name $key contains an invalid literal value',
          );
        }
        output[entry.key] = entry.value as String;
      }
      return Map.unmodifiable(output);
    }

    Map<String, Object?> objects(String key, {int maximum = 512}) {
      final item = value[key];
      if (item == null) return const {};
      if (item is! Map<String, Object?> || item.length > maximum) {
        throw CoreFailure(
          'environment.value',
          'Environment $name $key must be a bounded mapping',
        );
      }
      return Map.unmodifiable(item);
    }

    final baseUrl = optionalString('baseUrl');
    if (baseUrl != null && baseUrl.isNotEmpty) {
      final parsed = Uri.tryParse(baseUrl);
      if (parsed == null ||
          !parsed.isAbsolute ||
          !const ['http', 'https'].contains(parsed.scheme) ||
          parsed.userInfo.isNotEmpty) {
        throw CoreFailure(
          'environment.base-url',
          'Environment $name baseUrl must be an absolute HTTP(S) URL without credentials',
        );
      }
    }
    final serverSettings = objects('servers', maximum: 2048);
    if (serverSettings.values.any((value) => value is! int || value < -1 || value > 2048)) {
      throw CoreFailure('environment.server', 'Operation Server selections must be bounded integers');
    }
    final tls = objects('tls');
    for (final key in ['caFile', 'clientCertificateFile', 'clientKeyFile']) {
      final path = tls[key];
      if (path == null) continue;
      if (path is! String || path.isEmpty || path.length > 4096) {
        throw CoreFailure(
          'environment.tls',
          'Environment $name has an invalid $key path',
        );
      }
      // A declaration is only a name. Individual external-file capabilities
      // must still be granted by a picker or explicit headless input.
    }
    return ExecutionEnvironment(
      name: name,
      baseUrl: baseUrl,
      servers: Map.unmodifiable(serverSettings.cast<String, int>()),
      variables: strings('variables'),
      headers: strings('headers'),
      authentication: objects('authentication'),
      tls: tls,
    );
  }
}

/// The engine owns the method/family rule. Consumers retain this located
/// declaration for inspection while excluding it from effective body inputs.
class IgnoredRequestBody {
  const IgnoredRequestBody._(this.method, this.source);
  final String method;
  final CoreFailureSource source;

  static IgnoredRequestBody? parse(Object? value) {
    if (value == null) return null;
    if (value
        case {
          'reason': 'oas30-http-method',
          'method': String method,
          'source': {
            'resource': String resource,
            'pointer': String pointer,
            'range': [int start, int end],
          },
        }
        when start >= 0 && end >= start) {
      return IgnoredRequestBody._(
        method,
        CoreFailureSource(resource, pointer, SourceRange(start, end)),
      );
    }
    throw CoreFailure('request.protocol', 'Invalid ignored body declaration');
  }
}

/// A selected occurrence in one captured request plan. Bytes stay with the
/// approved external-resource owner; selection grants no new file acquisition.
final class CapturedRequestBodyExample {
  CapturedRequestBodyExample._(this._owner, this.mediaType, this.name,
      this.resource, this.contentIdentity, this._bytes);
  final OperationRequestPlan _owner;
  final String mediaType, resource, contentIdentity;
  final String? name;
  final Uint8List _bytes;
  int get byteLength => _bytes.length;
}

/// An approved external example framed for one effective Parameter occurrence.
/// The selected media comes from that occurrence, including reusable declarations.
final class CapturedRequestParameterExample {
  CapturedRequestParameterExample._(this._owner, this.location, this.parameterName,
      this.name, this.mediaType, this.resource, this.contentIdentity,
      this.serialization, this.byteLength);
  final OperationRequestPlan _owner;
  final String location, parameterName, resource, contentIdentity, serialization;
  final String? name, mediaType;
  final int byteLength;
}

class OperationRequestPlan {
  OperationRequestPlan._(
    this._owner,
    this.snapshot,
    this.configuration,
    this.result,
    this.saved,
    this._revision,
  ) : responseStatusNamePolicy = MemberNamePolicy.fromJson(
        result['responseStatusNamePolicy'],
      ),
      ignoredRequestBody = IgnoredRequestBody.parse(
        result['ignoredRequestBody'],
      );
  final BusyProject _owner;
  final AnalysisSnapshot snapshot;
  final ExecutionConfiguration configuration;
  final Map<String, dynamic> result;
  final IgnoredRequestBody? ignoredRequestBody;
  final MemberNamePolicy responseStatusNamePolicy;
  final bool saved;
  final int _revision;
  bool _closed = false;
  int _contentPreparationSerial = 0;
  bool get closed => _closed;
  bool get outdated =>
      _owner._closed ||
      _revision != _owner._resourceRevision ||
      !saved && !snapshot.current(_owner.store);
  String get identity => result['identity'] as String;
  Map<String, dynamic> get operation =>
      Map<String, dynamic>.from(result['operation'] as Map);
  void close() => _closed = true;
  void ensureCurrentOwner() {
    if (_closed || _owner._closed) {
      throw CoreFailure(
        'request.closed',
        'The captured request owner is closed',
      );
    }
  }

  /// Preparation must use a current capture. Completed response inspection
  /// keeps using its original capture through [ensureCurrentOwner].
  void ensureCurrentPreparation() {
    ensureCurrentOwner();
    if (outdated) {
      throw CoreFailure(
        'request.draft.stale',
        'Reconcile the changed operation before preparing a request.',
      );
    }
  }

  /// Choose only a concrete example occurrence already projected by the
  /// semantic engine. A reusable declaration alone supplies no media context.
  Uint8List _capturedExampleBytes(Map example) {
    final external = example['external'];
    if (external is! Map) throw CoreFailure('request.example.external',
        'Choose an available captured external example.');
    final captured = snapshot.exampleResources
        .where((resource) => resource.id == external['resource']).toList();
    if (captured.length != 1 || !captured.single.available ||
        captured.single.identity != external['identity'] ||
        captured.single.bytes!.length != external['byteLength'] ||
        example['wireBase64'] != base64Encode(captured.single.bytes!)) {
      throw CoreFailure('runtime.request.example.protocol',
          'The selected example does not match its approved captured bytes.');
    }
    return captured.single.bytes!;
  }

  CapturedRequestParameterExample captureParameterExample(
    String location, String parameterName, {String? name, String? mediaType}
  ) {
    ensureCurrentPreparation();
    final declarations = (result['parameters'] as List).whereType<Map>()
        .where((value) => value['in'] == location && value['name'] == parameterName).toList();
    if (declarations.length != 1) throw CoreFailure('request.example.occurrence',
        'Choose one effective captured Parameter occurrence.');
    Map owner = declarations.single;
    if (mediaType != null) {
      final media = (owner['content'] as List? ?? const []).whereType<Map>()
          .where((value) => value['mediaType'] == mediaType).toList();
      if (media.length != 1) throw CoreFailure('request.example.occurrence',
          'Choose the captured Parameter content media occurrence.');
      owner = media.single;
    }
    final examples = (owner['examples'] as List? ?? const []).whereType<Map>()
        .where((value) => value['name'] == name && value['external'] is Map).toList();
    if (examples.length != 1) throw CoreFailure('request.example.external',
        'This occurrence has no unique available external example.');
    final example = examples.single;
    final bytes = _capturedExampleBytes(example);
    final text = example[mediaType == null ? 'raw' : 'parameterSerialization'];
    if (example['conversionError'] is String || text is! String) {
      throw CoreFailure('request.example.conversion',
          example['conversionError'] as String? ?? 'This example has no representable captured Parameter serialization.',
          kind: CoreFailureKind.unsupported);
    }
    final external = example['external'] as Map;
    return CapturedRequestParameterExample._(this, location, parameterName,
        name, mediaType, external['resource'] as String, external['identity'] as String,
        text, bytes.length);
  }

  void ensureParameterExample(CapturedRequestParameterExample example, String location, String name) {
    ensureCurrentPreparation();
    if (!identical(example._owner, this) || example.location != location || example.parameterName != name) {
      throw CoreFailure('request.example.stale', 'Select the example again from its current Parameter occurrence.');
    }
  }

  Future<void> ensureParameterExampleInputs(Iterable<CapturedRequestParameterExample> examples,
      {RunCancellation? cancellation}) async {
    if (examples.isEmpty) return;
    for (final example in examples) ensureParameterExample(example, example.location, example.parameterName);
    cancellation?.throwIfCancelled();
    final current = await _owner._externalExampleInputsCurrent(snapshot, saved: saved,
        cancelled: () { ensureCurrentPreparation();cancellation?.throwIfCancelled();return false; });
    ensureCurrentPreparation();cancellation?.throwIfCancelled();
    if (!current) throw CoreFailure('runtime.request.example.stale',
        'A captured external example changed; select it from a new request plan.');
  }

  CapturedRequestParameterExample? restoreParameterExample(CapturedRequestParameterExample previous) {
    ensureCurrentPreparation();
    if (!identical(_owner, previous._owner._owner) || identity != previous._owner.identity ||
        snapshot.identity != previous._owner.snapshot.identity) return null;
    final selected = captureParameterExample(previous.location, previous.parameterName,
        name: previous.name, mediaType: previous.mediaType);
    return selected.resource == previous.resource && selected.contentIdentity == previous.contentIdentity &&
        selected.serialization == previous.serialization ? selected : null;
  }

  CapturedRequestBodyExample captureBodyExample(
    String mediaType, {
    String? name,
  }) {
    ensureCurrentPreparation();
    final body = result['requestBody'];
    final content = body is Map ? body['content'] : null;
    final declarations = content is List
        ? content.whereType<Map>()
            .where((media) => media['mediaType'] == mediaType).toList()
        : const <Map>[];
    if (declarations.length != 1) {
      throw CoreFailure(
        'request.example.occurrence', 'Choose one captured request media occurrence.',
        kind: CoreFailureKind.unsupported,
      );
    }
    final projected = declarations.single['examples'];
    final examples = projected is List
        ? projected.whereType<Map>()
            .where((example) => example['name'] == name && example['external'] is Map).toList()
        : const <Map>[];
    if (examples.length != 1) {
      throw CoreFailure(
        'request.example.external', 'This occurrence has no unique available external example.',
        kind: CoreFailureKind.unsupported,
      );
    }
    final example = examples.single, external = example['external'] as Map;
    final bytes = _capturedExampleBytes(example);
    return CapturedRequestBodyExample._(this, mediaType, name, external['resource'] as String,
        external['identity'] as String, bytes);
  }

  void ensureBodyExample(CapturedRequestBodyExample example) {
    ensureCurrentPreparation();
    if (!identical(example._owner, this)) {
      throw CoreFailure('request.example.stale',
          'Select the example again from the current request plan.');
    }
  }

  /// Re-preparing unchanged inputs may replace a plan object. Preserve its
  /// explicit draft selection only within the same project, operation and
  /// snapshot. A changed capture keeps requiring an explicit new selection.
  CapturedRequestBodyExample? restoreBodyExample(
    CapturedRequestBodyExample previous,
  ) {
    ensureCurrentPreparation();
    if (!identical(_owner, previous._owner._owner) ||
        identity != previous._owner.identity ||
        snapshot.identity != previous._owner.snapshot.identity) return null;
    final selected = captureBodyExample(previous.mediaType, name: previous.name);
    return selected.resource == previous.resource &&
        selected.contentIdentity == previous.contentIdentity ? selected : null;
  }

  Future<Uint8List> bodyExampleBytes(
    CapturedRequestBodyExample example, {
    RunCancellation? cancellation,
  }) async {
    ensureBodyExample(example);
    cancellation?.throwIfCancelled();
    final current = await _owner._externalExampleInputsCurrent(
      snapshot,
      saved: saved,
      cancelled: () {
        ensureCurrentPreparation();
        cancellation?.throwIfCancelled();
        return false;
      },
    );
    ensureBodyExample(example);
    cancellation?.throwIfCancelled();
    if (!current) {
      throw CoreFailure('runtime.request.example.stale',
          'The captured external example changed; select it from a new request plan.');
    }
    return example._bytes;
  }

  RequestFormBinding? formBindingForMedia(String? mediaType) {
    final body = result['requestBody'];
    final content = body is Map ? body['content'] : null;
    if (content is! List || mediaType == null) return null;
    final media = selectDeclaredMedia(content.whereType<Map>(), mediaType);
    return RequestFormBinding.fromJson(media?['formBinding']);
  }

  bool hasDeclaredBodyMedia(String? mediaType) {
    final body = result['requestBody'];
    final content = body is Map ? body['content'] : null;
    return content is List && selectDeclaredMedia(content.whereType<Map>(), mediaType) != null;
  }

  bool get hasBodyMediaRanges {
    final body = result['requestBody'];
    final content = body is Map ? body['content'] : null;
    return content is List && content.whereType<Map>().any((media) =>
      media['mediaChoices'] is Map && media['mediaChoices']['allowsCustom'] == true);
  }

  bool usesMultipartTree(String? mediaType, {bool typed = false}) {
    final body = result['requestBody'];
    final content = body is Map ? body['content'] : null;
    if (content is! List || mediaType == null) return false;
    final media = selectDeclaredMedia(content.whereType<Map>(), mediaType);
    return media?['multipart'] is Map && (media!['multipart']['usesTree'] == true || typed && media['multipart']['typedTree'] == true);
  }

  List<Map> multipartRootChoices(String? mediaType) {
    final body = result['requestBody'];
    final content = body is Map ? body['content'] : null;
    if (content is! List || mediaType == null) return const [];
    final media = selectDeclaredMedia(content.whereType<Map>(), mediaType);
    final choices = media?['multipart'] is Map ? media!['multipart']['rootChoices'] : null;
    return choices is List ? choices.whereType<Map>().toList() : const [];
  }

  Future<String> appendMultipartValue(String text, String pointer, String value) async {
    final projected = await _formProjection('requestMultipartAppend',
      {'text': text, 'pointer': pointer, 'value': value},
      'multipart-edit-${DateTime.now().microsecondsSinceEpoch}', null);
    if (projected['version'] != 1 || projected['text'] is! String) {
      throw CoreFailure('request.multipart.protocol', 'Invalid exact multipart draft edit.');
    }
    return projected['text'] as String;
  }

  /// Captured Engine policy is shared by native, saved cases and CLI. File
  /// metadata contains instance pointers; only Core acquires the file bytes.
  Future<Map<String, dynamic>> multipartPlan(
    String mediaType,
    String text, {
    List<Map<String, Object?>> files = const [],
    Map<String, String> choices = const {},
    Map<String, String> partSchemas = const {},
    Map<String, MultipartFileShape> fileShapes = const {},
    List<Map<String, String>> literalFields = const [],
    List<RequestPartHeaderValue> headers = const [],
    String? wire,
    String? wireType,
    bool inspect = false,
    required String requestId,
    RunCancellation? cancellation,
  }) async {
    final projected = await _formProjection('requestMultipartPlan', {
      ...snapshot.toJson(),
      'resource': (operation['source'] as Map)['resource'],
      'pointer': (operation['source'] as Map)['pointer'],
      'occurrence': operation['occurrence'],
      'mediaType': mediaType,
      'text': text,
      'files': files,
      'choices': choices,
      'partSchemas': partSchemas,
      'fileShapes': {for (final entry in fileShapes.entries) entry.key: entry.value.name},
      'literalFields': literalFields,
      'headers': {
        for (final part in headers.map((header) => header.part).toSet())
          part: [for (final header in headers.where((header) => header.part == part))
            {'name': header.name, 'value': header.value, if (header.modeled) 'modeled': true}],
      },
      if (wire != null) 'wire': wire,
      if (wireType != null) 'wireType': wireType,
      if (inspect) 'inspect': true,
    }, requestId, cancellation);
    if (projected['version'] != 1 || projected['identity'] != identity ||
        projected['snapshot'] != snapshot.identity ||
        projected['representationRevisions'] is! Map ||
        jsonEncode(projected['representationRevisions']) != jsonEncode(result['representationRevisions']) ||
        projected['tree'] is! Map || projected['controls'] is! List ||
        projected['partSchemas'] is! Map || projected['fileShapes'] is! Map ||
        projected['input'] != textIdentity(text) ||
        wire != null && (projected['proof'] is! Map || projected['proof']['complete'] != true || projected['proof']['valid'] != true)) {
      throw CoreFailure('request.multipart.protocol', 'The worker returned an unrelated multipart preparation.');
    }
    return projected;
  }

  Future<void> proveNamedMultipart(String mediaType, String wireType, String wire, {
    String? expected,
    bool partialFiles = false,
    List<Map<String, Object?>> files = const [],
    Map<String, MultipartFileShape> fileShapes = const {},
    required String requestId,
    RunCancellation? cancellation,
  }) async {
    final projected = await _formProjection('requestMultipartNamedProof', {
      ...snapshot.toJson(),
      'resource': (operation['source'] as Map)['resource'],
      'pointer': (operation['source'] as Map)['pointer'],
      'occurrence': operation['occurrence'],
      'mediaType': mediaType, 'wireType': wireType, 'wire': wire,
      'expected': expected, 'partialFiles': partialFiles, 'files': files,
      'fileShapes': {for (final entry in fileShapes.entries) entry.key: entry.value.name},
    }, requestId, cancellation);
    if (projected['version'] != 1 || projected['snapshot'] != snapshot.identity ||
        projected['identity'] != identity || projected['proof'] is! Map ||
        projected['proof']['complete'] != true || projected['proof']['valid'] != true) {
      throw CoreFailure('request.multipart.protocol', 'Named multipart byte identity could not be established.');
    }
  }

  Future<Uint8List> readProjectFile(String relative) async {
    ensureCurrentOwner();
    final path = p.normalize(
      p.isAbsolute(relative)
          ? relative
          : p.join(_owner.access.boundary, relative),
    );
    final approved = _owner._executionFiles[path];
    final List<int> bytes;
    if (approved != null) {
      bytes = await approved.$1.read(path);
      if (contentIdentity(bytes) != approved.$2) {
        throw CoreFailure(
          'access.file.changed',
          'The selected TLS file changed; select it again before execution',
        );
      }
    } else {
      bytes = await _owner.access.read(_owner.access.pathFor(path));
    }
    if (bytes.length > 4 * 1024 * 1024) {
      throw CoreFailure('limit.tls.material', 'TLS material exceeds 4 MiB');
    }
    return Uint8List.fromList(bytes);
  }

  Future<Map<String, dynamic>> parameterValues(
    Map<String, String> values,
  ) async {
    ensureCurrentOwner();
    if (values.isEmpty) return const {};
    final result = await _owner.engine.request('requestParameterValues', {
      'values': values,
    });
    ensureCurrentOwner();
    if (result['version'] != 1 ||
        result['values'] is! Map ||
        (result['values'] as Map).length != values.length ||
        !(result['values'] as Map).keys.every(values.containsKey)) {
      throw CoreFailure(
        'request.value.protocol',
        'Invalid structured parameter projection',
      );
    }
    return Map<String, dynamic>.from(result['values'] as Map);
  }

  Future<RequestFormData> formData(
    String text, {
    required String requestId,
    RunCancellation? cancellation,
  }) async {
    final result = await _formProjection(
      'requestFormDataValues',
      {'text': text},
      requestId,
      cancellation,
    );
    return RequestFormData.fromJson(result, text);
  }

  List<FormPartMediaOptions> formMediaOptions(String? mediaType) {
    final body = result['requestBody'];
    final content = body is Map ? body['content'] : null;
    if (content is! List) return const [];
    final declaration = content
        .whereType<Map>()
        .where((item) => item['mediaType'] == mediaType)
        .singleOrNull;
    final form = declaration?['form'];
    return FormPartMediaOptions.fromJson(form is Map ? form['parts'] : null);
  }

  Future<ResolvedFormMediaTypes> formMediaTypes(
    String mediaType,
    Iterable<String> parts,
    Map<String, String> choices, {
    List<Map<String, String>> files = const [],
    Map<String, MultipartFileShape> fileShapes = const {},
    required String requestId,
    RunCancellation? cancellation,
  }) async {
    if (fileShapes.length > 2048) {
      throw CoreFailure(
        'request.multipart.file-shape',
        'Too many file value shapes.',
      );
    }
    final capturedParts = parts.toSet().toList(),
        selected = Map<String, String>.of(choices);
    final capturedShapes = Map<String, MultipartFileShape>.unmodifiable(
      fileShapes,
    );
    final result = await _formProjection(
      'requestFormMediaTypes',
      {
        ...snapshot.toJson(),
        'resource': (operation['source'] as Map)['resource'],
        'pointer': (operation['source'] as Map)['pointer'],
        'occurrence': operation['occurrence'],
        'mediaType': mediaType,
        'parts': capturedParts,
        'choices': selected,
        'files': files,
        if (capturedShapes.isNotEmpty)
          'fileShapes': {
            for (final entry in capturedShapes.entries)
              entry.key: entry.value.name,
          },
      },
      requestId,
      cancellation,
    );
    if (fileShapes.length != capturedShapes.length ||
        capturedShapes.entries.any(
          (entry) => fileShapes[entry.key] != entry.value,
        )) {
      throw CoreFailure(
        'request.multipart.file-shape.stale',
        'File value shapes changed while media choices were captured.',
      );
    }
    final types = result['types'], fileTypes = result['files'];
    if (result['version'] != 1 ||
        result['snapshot'] != snapshot.identity ||
        result['identity'] != identity ||
        types is! Map ||
        types.keys.any(
          (name) =>
              name is! String ||
              !capturedParts.contains(name) && !selected.containsKey(name),
        ) ||
        types.values.any((value) => value is! String) ||
        fileTypes is! List ||
        fileTypes.length != files.length ||
        fileTypes.any((value) => value is! String)) {
      throw CoreFailure(
        'request.form.protocol',
        'Invalid resolved part media types.',
      );
    }
    return ResolvedFormMediaTypes(
      Map.unmodifiable(types.cast<String, String>()),
      List.unmodifiable(fileTypes.cast<String>()),
    );
  }

  Future<Map<String, MultipartPartEncoding>> multipartEncoding(
    String mediaType,
    List<Map<String, String>> parts,
    List<String> files, {
    List<RequestPartHeaderValue> headers = const [],
    Map<String, MultipartFileShape> fileShapes = const {},
    required String requestId,
    RunCancellation? cancellation,
  }) async {
    if (headers.length > 2048)
      throw CoreFailure(
        'request.multipart.headers.limit',
        'Multipart header inputs exceed 2048 fields.',
      );
    final capturedHeaders = List<RequestPartHeaderValue>.unmodifiable(headers);
    if (fileShapes.length > 2048)
      throw CoreFailure(
        'request.multipart.file-shape',
        'File shape selections exceed 2048 parts.',
      );
    final capturedShapes = Map<String, MultipartFileShape>.unmodifiable(
      fileShapes,
    );
    final result = await _formProjection(
      'requestMultipartEncoding',
      {
        ...snapshot.toJson(),
        'resource': (operation['source'] as Map)['resource'],
        'pointer': (operation['source'] as Map)['pointer'],
        'occurrence': operation['occurrence'],
        'mediaType': mediaType,
        'parts': parts,
        'files': files,
        'fileShapes': {
          for (final entry in capturedShapes.entries)
            entry.key: entry.value.name,
        },
        'headers': {
          for (final name
              in capturedHeaders.map((header) => header.part).toSet())
            name: [
              for (final header in capturedHeaders.where(
                (header) => header.part == name,
              ))
                {'name': header.name, 'value': header.value, if (header.modeled) 'modeled': true},
            ],
        },
      },
      requestId,
      cancellation,
    );
    if (fileShapes.length != capturedShapes.length ||
        capturedShapes.entries.any(
          (entry) => fileShapes[entry.key] != entry.value,
        )) {
      throw CoreFailure(
        'request.multipart.file-shape.stale',
        'File value shapes changed during preparation.',
      );
    }
    if (headers.length != capturedHeaders.length ||
        [
          for (var i = 0; i < headers.length; i++)
            headers[i].part != capturedHeaders[i].part ||
                headers[i].name != capturedHeaders[i].name ||
                headers[i].value != capturedHeaders[i].value,
        ].any((changed) => changed)) {
      throw CoreFailure(
        'request.multipart.header.stale',
        'Multipart header inputs changed during preparation.',
      );
    }
    final values = result['parts'];
    final names = {...parts.map((part) => part['name']), ...files};
    if (result['version'] != 1 ||
        result['snapshot'] != snapshot.identity ||
        result['identity'] != identity ||
        values is! Map ||
        values.length != names.length ||
        values.keys.any((name) => name is! String || !names.contains(name))) {
      throw CoreFailure(
        'request.multipart.protocol',
        'Invalid captured multipart transfer projection.',
      );
    }
    final parsed = {
      for (final entry in values.entries)
        entry.key as String: MultipartPartEncoding.fromJson(entry.value),
    };
    for (final entry in capturedShapes.entries) {
      if (parsed[entry.key]?.fileArray !=
          (entry.value == MultipartFileShape.array)) {
        throw CoreFailure(
          'request.multipart.protocol',
          'The captured file shape differs from the selected input.',
        );
      }
    }
    for (final name in parsed.keys) {
      if (!capturedShapes.containsKey(name) &&
          parsed[name]!.fileArray != null) {
        throw CoreFailure(
          'request.multipart.protocol',
          'The captured projection contains an unselected file shape.',
        );
      }
      final expected = capturedHeaders
              .where((header) => header.part == name)
              .toList(),
          actual = parsed[name]!.headers;
      if (expected.length != actual.length ||
          [
            for (var i = 0; i < expected.length; i++)
              expected[i].name != actual[i].name ||
                  expected[i].value != actual[i].value,
          ].any((changed) => changed)) {
        throw CoreFailure(
          'request.multipart.protocol',
          'The captured MIME headers differ from the supplied input.',
        );
      }
    }
    return Map.unmodifiable(parsed);
  }

  /// One awaited chunk owns its captured media semantics and exact producer.
  Future<Map<String, dynamic>> responseStreamChunk(
    int status, String mediaType, List<int> bytes, Map<String, dynamic>? state, {
    bool end = false, int maximumRecords = 128, String? runId, RunCancellation? cancellation,
  }) async {
    ensureCurrentOwner();
    cancellation?.throwIfCancelled();
    final previousBytes = state?['bytes'];
    if (bytes.length > 65536 || maximumRecords < 1 || maximumRecords > 128 ||
        previousBytes != null && (previousBytes is! int || previousBytes < 0)) {
      throw CoreFailure('runtime.stream.input', 'Malformed or oversized stream continuation.');
    }
    final requestId = 'stream-${runId??identity}-${_contentPreparationSerial++}';
    final work = _owner.engine.request('responseStreamChunk', {
      ...snapshot.toJson(), 'resource': (operation['source'] as Map)['resource'],
      'pointer': (operation['source'] as Map)['pointer'], 'occurrence': operation['occurrence'],
      'status': status, 'mediaType': mediaType, 'text': base64Encode(bytes),
      'state': state, 'end': end, 'maximumRecords': maximumRecords, if(runId!=null)'runId':runId,
    }, requestId: requestId);
    final interrupted = Completer<Map<String,dynamic>>();
    final unsubscribe = cancellation?.listen(() {
      unawaited(_owner.engine.cancel(requestId));
      if (!interrupted.isCompleted) interrupted.completeError(CoreFailure('cancelled', 'Stream evaluation cancelled; late results are discarded.'));
    });
    late Map<String,dynamic> result;
    try {result = cancellation == null ? await work : await Future.any([work,interrupted.future]);}
    finally {unsubscribe?.call();}
    cancellation?.throwIfCancelled();
    ensureCurrentOwner();
    if (result['version'] != 1 || result['revision'] != '2' ||
        result['snapshot'] != snapshot.identity || result['identity'] != identity ||
        result['producer'] != 'hyperjump+busyapi-exact' ||
        result['producerVersion'] != _schemaProducerVersion ||
        result['supported'] is! bool || result['configuration'] is! String) {
      throw CoreFailure('runtime.stream.protocol', 'The stream worker returned an unrelated capture or producer.');
    }
    bool item(Object? raw) {
      if (raw is! Map || raw['index'] is! int || raw['offset'] is! int || raw['bytes'] is! int ||
          raw['wholeResolvable'] is! bool || raw['complete'] is! bool || raw['valid'] is! bool || raw['findings'] is! List) return false;
      final findings = raw['findings'] as List;
      return findings.length <= 16 && findings.every((value) => value is Map) &&
          (raw['data'] == null || raw['data'] is String && utf8.encode(raw['data'] as String).length <= 16384);
    }
    if (result['supported'] == true) {
      final next = result['state'], records = result['records'], findings = result['findings'];
      if (next is! Map || records is! List || records.length > maximumRecords || !records.every(item) ||
          next['mediaType'] != mediaType || next['bytes'] != (previousBytes ?? 0) + bytes.length ||
          findings is! List || findings.length > 16 || findings.any((value) => value is! Map) ||
          ['pending','framingComplete','binary','wholeSchema','wholeAvailable','binaryComplete','binaryValid'].any((key) => result[key] is! bool)) {
        throw CoreFailure('runtime.stream.protocol', 'Malformed incremental record proof.');
      }
    }
    return result;
  }

  Future<Map<String, (String, bool, String)>> contentParameterValues(Map<String, String> values, {Map<String, String> rawValues = const {}, RunCancellation? cancellation}) async {
    if (values.isEmpty && rawValues.isEmpty) return const {};
    final inputs = {...values, ...rawValues};
    final projected = await _formProjection('requestContentParameters', {
      ...snapshot.toJson(), 'resource': (operation['source'] as Map)['resource'],
      'pointer': (operation['source'] as Map)['pointer'], 'occurrence': operation['occurrence'], 'values': values, 'rawValues': rawValues,
    }, 'content-${identity}-${DateTime.now().microsecondsSinceEpoch}-${_contentPreparationSerial++}', cancellation);
    if (projected['version'] != 1 || projected['snapshot'] != snapshot.identity || projected['identity'] != identity || projected['values'] is! Map ||
        (projected['values'] as Map).entries.any((entry) => !inputs.containsKey(entry.key) || entry.value is! String)) {
      throw CoreFailure('request.parameter.protocol', 'The generated content parameters differ from their capture.');
    }
    final expected = <String>{};
    for (final parameter in (result['parameters'] as List? ?? const []).whereType<Map>()) {
      final content = parameter['content'];
      if (content is! List || content.length != 1 || content.single is! Map) continue;
      final media = ((content.single as Map)['mediaType'] as String).split(';').first.trim().toLowerCase();
      final key = OperationRequestDraft.parameterKey(parameter['in'] as String, parameter['name'] as String);
      if ((media == 'application/linkset' || media == 'application/linkset+json' || media == 'application/xml' || media == 'text/xml' || media.endsWith('+xml')) && inputs.containsKey(key)) expected.add(key);
    }
    if ((projected['values'] as Map).length != expected.length || !(projected['values'] as Map).keys.every(expected.contains) ||
        projected['percentEncoded'] is! Map || (projected['percentEncoded'] as Map).length != expected.length ||
        !(projected['percentEncoded'] as Map).keys.every(expected.contains) || (projected['percentEncoded'] as Map).values.any((value) => value is! bool) ||
        projected['inputs'] is! Map || (projected['inputs'] as Map).length != expected.length ||
        expected.any((key) => (projected['inputs'] as Map)[key] != textIdentity(inputs[key]!))) {
      throw CoreFailure('request.parameter.protocol', 'Generated content parameters omitted or replaced their captured inputs.');
    }
    if (projected['bodies'] is! Map || (projected['bodies'] as Map).length != expected.length ||
        !(projected['bodies'] as Map).keys.every(expected.contains)) throw CoreFailure('request.parameter.protocol', 'Content parameters omitted their actual media bytes.');
    for (final body in (projected['bodies'] as Map).values) {
      if (body is! String || body.length > 24 * 1024 * 1024 || base64Encode(base64Decode(body)) != body) throw CoreFailure('request.parameter.protocol', 'Content parameter bytes are malformed or exceed their bounded limit.');
    }
    return {for (final entry in (projected['values'] as Map).entries) entry.key as String: (entry.value as String, (projected['percentEncoded'] as Map)[entry.key] == true, (projected['bodies'] as Map)[entry.key] as String)};
  }

  Future<String> formContentValue(String formType, String name, int index, String text, String mediaType, bool structured, {String? bodyText, RunCancellation? cancellation}) async {
    final result = await _formProjection('requestFormContentValue', {
      ...snapshot.toJson(), 'resource': (operation['source'] as Map)['resource'], 'pointer': (operation['source'] as Map)['pointer'],
      'occurrence': operation['occurrence'], 'formType': formType, 'name': name, 'index': index, 'text': text, 'mediaType': mediaType, 'structured': structured,
      if (bodyText != null) 'bodyText': bodyText,
    }, 'form-content-${identity}-${_contentPreparationSerial++}', cancellation);
    if (result['version'] != 1 || result['snapshot'] != snapshot.identity || result['identity'] != identity || result['name'] != name || result['index'] != index || result['mediaType'] != mediaType || result['input'] != textIdentity(text) || result['value'] is! String ||
        (result['value'] as String).length > 48 * 1024 * 1024 || !RegExp(r'^(?:[A-Za-z0-9._~+\-]|%[0-9A-F]{2})*$').hasMatch(result['value'] as String)) throw CoreFailure('request.form.protocol', 'The encoded media field differs from its captured input.');
    return result['value'] as String;
  }

  Future<Uint8List> rawMediaBytes(String text, String mediaType, {required String requestId, RunCancellation? cancellation}) async {
    final prepared = await _formProjection('requestRawMediaBytes', {...snapshot.toJson(), 'text': text, 'mediaType': mediaType}, requestId, cancellation);
    if (prepared['version'] != 1 || prepared['snapshot'] != snapshot.identity || prepared['input'] != textIdentity(text) || prepared['mediaType'] != mediaType || prepared['base64'] is! String) throw CoreFailure('request.media.protocol', 'Literal XML materialization differs from its captured input.');
    final bytes = base64Decode(prepared['base64'] as String);
    if (base64Encode(bytes) != prepared['base64'] || bytes.length != prepared['byteLength']) throw CoreFailure('request.media.protocol', 'Literal XML materialization has inconsistent bytes.');
    return bytes;
  }

  Future<Uint8List> mediaBytes(String text, String mediaType, {
    required String requestId, RunCancellation? cancellation,
  }) async {
    final result = await _formProjection('requestMediaBytes', {
      ...snapshot.toJson(), 'resource': (operation['source'] as Map)['resource'],
      'pointer': (operation['source'] as Map)['pointer'],
      'occurrence': operation['occurrence'], 'text': text, 'mediaType': mediaType,
    }, requestId, cancellation);
    if (result['version'] != 1 || result['snapshot'] != snapshot.identity || result['identity'] != identity || result['input'] != textIdentity(text) ||
        result['mediaType'] != mediaType || result['base64'] is! String) {
      throw CoreFailure('request.media.protocol', 'The typed body materialization differs from its capture.');
    }
    final bytes = base64Decode(result['base64'] as String);
    if (base64Encode(bytes) != result['base64'] || bytes.length != result['byteLength']) {
      throw CoreFailure('request.media.protocol', 'The typed body byte length is inconsistent.');
    }
    return bytes;
  }

  Future<MimeTextMaterialization> mimeTextBytes(
    String text,
    String mediaType, {
    required String requestId,
    RunCancellation? cancellation,
  }) async {
    final result = await _formProjection(
      'requestMimeTextBytes',
      {...snapshot.toJson(), 'text': text, 'mediaType': mediaType},
      requestId,
      cancellation,
    );
    return MimeTextMaterialization.fromJson(
      result,
      snapshot: snapshot.identity,
      text: text,
      mediaType: mediaType,
    );
  }

  Future<Map<String, dynamic>> _formProjection(
    String method,
    Map<String, Object?> params,
    String requestId,
    RunCancellation? cancellation,
  ) async {
    ensureCurrentPreparation();
    cancellation?.throwIfCancelled();
    if (!await _owner._externalExampleInputsCurrent(snapshot, saved: saved,
        cancelled: () => cancellation?.cancelled == true)) {
      throw CoreFailure('request.stale', 'An external example changed after request capture');
    }
    ensureCurrentPreparation();
    final work = _owner.engine.request(method, params, requestId: requestId);
    final result = cancellation == null
        ? await work
        : await Future.any<Map<String, dynamic>>([
            work,
            cancellation.whenCancelled.then((_) async {
              await _owner.engine.cancel(requestId);
              throw CoreFailure(
                'cancelled',
                'Form preparation cancelled; late results are discarded.',
              );
            }),
          ]);
    cancellation?.throwIfCancelled();
    if (!await _owner._externalExampleInputsCurrent(snapshot, saved: saved,
        cancelled: () => cancellation?.cancelled == true)) {
      throw CoreFailure('request.stale', 'An external example changed during request preparation');
    }
    ensureCurrentPreparation();
    return result;
  }

  Future<RefactoringPlan> planCase(String name, OperationRequestDraft draft) async {
    ensureCurrentPreparation();
    if (draft.planIdentity != identity) throw CoreFailure('request.stale', 'The saved draft differs from its current capture.');
    await ensureParameterExampleInputs(draft.parameters.values
        .where((value) => value.present && value.capturedExample != null).map((value) => value.capturedExample!));
    final body = draft.body;
    String relativePath(String path) {
      final relative = p.relative(path, from: _owner.access.boundary);
      if (p.isAbsolute(relative) || relative == '..' || relative.startsWith('..${p.separator}')) {
        throw CoreFailure('test.configuration', 'Saved file references must remain inside the approved project boundary.');
      }
      return relative;
    }
    final parameters = <String, Map<String, Object?>>{}, modes = <String, Map<String, Object?>>{},
        parameterExamples = <String, Map<String, Object?>>{};
    for (final entry in draft.parameters.entries) {
      if (!entry.value.present) continue;
      final split = entry.key.indexOf('\u0000');
      if (split < 0) throw CoreFailure('test.configuration', 'Invalid parameter identity.');
      if (entry.value.capturedExample case final example?) {
        ensureParameterExample(example, entry.key.substring(0, split), entry.key.substring(split + 1));
        (parameterExamples[example.location] ??= {})[example.parameterName] = {
          'name': example.name ?? '', if (example.mediaType != null) 'mediaType': example.mediaType,
        };
        continue;
      }
      (parameters[entry.key.substring(0, split)] ??= {})[entry.key.substring(split + 1)] = entry.value.json ? {'dataJson': entry.value.text} : entry.value.text;
      (modes[entry.key.substring(0, split)] ??= {})[entry.key.substring(split + 1)] = entry.value.json ? 'data' : entry.value.representation.name;
    }
    final definition = <String, Object?>{
      'operation': {'path': operation['path'], 'method': operation['method']},
      if (draft.environment != null) 'environment': draft.environment,
      if (draft.selectedServer != null) 'server': draft.selectedServer,
      if (draft.securityAlternative != null) 'securityAlternative': draft.securityAlternative,
      if (parameters.isNotEmpty) 'parameters': parameters,
      if (parameterExamples.isNotEmpty) 'parameterExamples': parameterExamples,
      if (draft.headers.any((header) => header.enabled)) 'headers': [for (final header in draft.headers) if (header.enabled) {'name': header.name, 'value': header.value}],
      if (draft.variables.isNotEmpty) 'variables': draft.variables,
      if (draft.tlsFiles.isNotEmpty) 'tlsFiles': {for (final entry in draft.tlsFiles.entries) entry.key: entry.value.isEmpty ? '' : relativePath(entry.value)},
      'connectTimeoutMs': draft.connectTimeout.inMilliseconds, 'overallTimeoutMs': draft.overallTimeout.inMilliseconds, 'inactivityTimeoutMs': draft.inactivityTimeout.inMilliseconds,
      'parameterModes': modes,
      if(draft.streamStopAfterRecords!=null)'stream':{'stopAfterRecords':draft.streamStopAfterRecords},
      if (body.kind != RequestBodyKind.none) 'body': {
        'mediaType': body.mediaType,
        if (body.capturedExample != null) 'externalExample': body.capturedExample!.name ?? '',
        if (body.kind == RequestBodyKind.binaryFile) 'file': relativePath(body.file!),
        if (body.capturedExample == null && body.kind != RequestBodyKind.binaryFile) ...{
          'representation': (body.kind == RequestBodyKind.multipart || body.kind == RequestBodyKind.form) && body.text == null ? 'fields' : body.modeled || body.kind == RequestBodyKind.multipart || body.kind == RequestBodyKind.form ? 'data' : 'serialized',
          'value': (body.kind == RequestBodyKind.multipart || body.kind == RequestBodyKind.form) && body.text == null ? [for (final field in body.fields) {'name':field.name,'value':field.value}] : body.text ?? '',
        },
        if (body.partMediaTypes.isNotEmpty) 'partMediaTypes': body.partMediaTypes,
        if (body.partSchemas.isNotEmpty) 'partSchemas': body.partSchemas,
        if (body.fileShapes.isNotEmpty) 'fileShapes': {for (final entry in body.fileShapes.entries) entry.key: entry.value.name},
        if (body.partHeaders.isNotEmpty) 'partHeaders': [for (final header in body.partHeaders) header.toJson()],
        if (body.files.isNotEmpty) 'files': [for (final file in body.files) {'name': file.name, 'path': relativePath(file.path), if (file.filename != null) 'filename': file.filename, 'mediaType': file.selectedMediaType ?? file.mediaType}],
      },
    };
    final prepared = await _owner.engine.request('planExecutionCase', {
      ...snapshot.toJson(), 'source': configuration.source, 'name': name, 'definition': definition,
      'roots': [for (final root in _owner.roots) {'name': root.name, 'path': p.relative(Uri.parse(root.id).toFilePath(), from: _owner.access.boundary)}],
    });
    ensureCurrentPreparation();
    if (prepared['snapshot'] != snapshot.identity) throw CoreFailure('refactor.stale', 'Case preparation returned an unrelated capture.');
    if (configuration.source != null) return RefactoringPlan._(_owner, _revision, [snapshot], prepared);
    final text = prepared['text'] as String, id = _owner._manifestResource;
    await BusyProject.validateGeneratedConfiguration(_owner.access, _owner.engine, text: text, id: id);
    final creation = FileCreationPlan._(_owner, _revision, [snapshot], {
      'version': 1, 'snapshot': snapshot.identity, 'kind': 'execution-case-create', 'checkedRoots': [snapshot.root],
      'edits': <Object?>[], 'usages': <Object?>[],
      'changes': [{'resource': id, 'before': '', 'after': text, 'fileAction': 'create'}],
      'from': {'resource': id, 'pointer': ''}, 'to': {'resource': id, 'pointer': '/tests'},
    }, BufferCreation(id: id, path: Uri.parse(id).toFilePath(), text: text));
    await _owner._verifyFileCreation(creation);
    return creation;
  }

  Future<RefactoringPlan> planEnvironment(
    String name,
    Map<String, Object?> definition,
  ) async {
    ensureCurrentOwner();
    if (outdated) {
      throw CoreFailure(
        'refactor.stale',
        'Reconcile this request before changing configuration.',
      );
    }
    ExecutionEnvironment.parse(name, definition, _owner.access.boundary);
    final source = configuration.source;
    if (source == null) {
      final text =
          '${const JsonEncoder.withIndent('  ').convert({
            'version': 1,
            'roots': [
              for (final root in _owner.roots) {'name': root.name, 'path': p.relative(Uri.parse(root.id).toFilePath(), from: _owner.access.boundary)},
            ],
            'environments': {name: definition},
          })}\n';
      if (utf8.encode(text).length > 65536) {
        throw CoreFailure('limit.manifest', 'Configuration exceeds 64 KiB.');
      }
      final id = _owner._manifestResource;
      final creation = FileCreationPlan._(
        _owner,
        _revision,
        [snapshot],
        {
          'version': 1,
          'snapshot': snapshot.identity,
          'kind': 'execution-environment-create',
          'checkedRoots': [snapshot.root],
          'edits': <Object?>[],
          'usages': <Object?>[],
          'changes': [
            {
              'resource': id,
              'before': '',
              'after': text,
              'fileAction': 'create',
            },
          ],
          'from': {'resource': id, 'pointer': ''},
          'to': {'resource': id, 'pointer': ''},
        },
        BufferCreation(id: id, path: Uri.parse(id).toFilePath(), text: text),
      );
      await _owner._verifyFileCreation(creation);
      return creation;
    }
    final prepared = await _owner.engine.request('planExecutionEnvironment', {
      ...snapshot.toJson(),
      'source': source,
      'name': name,
      'definition': definition,
    });
    ensureCurrentOwner();
    if (outdated || prepared['snapshot'] != snapshot.identity) {
      throw CoreFailure(
        'refactor.stale',
        'Configuration changed while preparing its review.',
      );
    }
    return RefactoringPlan._(_owner, _revision, [snapshot], prepared);
  }

  Future<Map<String, dynamic>> inspectJson(String text) async {
    ensureCurrentOwner();
    return _owner.engine.request('inspectExecutionJson', {'text': text});
  }

  Future<Map<String, dynamic>> caseValues(String name) async {
    ensureCurrentOwner();
    final values = await _owner.engine.request('executionCaseValues', {
      'source': configuration.source,
      'name': name,
    });
    ensureCurrentOwner();
    return values;
  }

  Future<Map<String, dynamic>> evaluateRuntime(
    List<RuntimeSchemaInstance> instances, {
    String? requestId,
    RunCancellation? cancellation,
  }) async {
    ensureCurrentOwner();
    cancellation?.throwIfCancelled();
    final preparingRequest = instances.any((value) => value.subject.startsWith('request-'));
    if (preparingRequest) ensureCurrentPreparation();
    if (preparingRequest && !await _owner._externalExampleInputsCurrent(snapshot, saved: saved,
        cancelled: () => cancellation?.cancelled == true)) {
      throw CoreFailure('runtime.stale', 'An external example changed after capture');
    }
    ensureCurrentOwner();
    if (preparingRequest) ensureCurrentPreparation();
    final work = _owner.engine.request('evaluateSchemas', {
      ...snapshot.toJson(),
      'runtimeInstances': [for (final instance in instances) instance.toJson()],
    }, requestId: requestId);
    final result = cancellation == null
        ? await work
        : await Future.any<Map<String, dynamic>>([
            work,
            cancellation.whenCancelled.then((_) {
              if (requestId != null) unawaited(_owner.engine.cancel(requestId));
              throw CoreFailure(
                'cancelled',
                'Evaluation cancelled; late results are discarded.',
              );
            }),
          ]);
    cancellation?.throwIfCancelled();
    final examplesCurrent = !preparingRequest || await _owner._externalExampleInputsCurrent(snapshot,
        saved: saved, cancelled: () => cancellation?.cancelled == true);
    if (!examplesCurrent) throw CoreFailure('runtime.stale',
        'An external example changed while its captured runtime result was being evaluated');
    if (preparingRequest) ensureCurrentPreparation();
    if (_closed ||
        _owner._closed ||
        result['version'] != 1 ||
        result['snapshot'] != snapshot.identity ||
        result['complete'] is! bool ||
        result['runtimeEvaluations'] is! List ||
        result['runtimeFindings'] is! List ||
        result['producer'] != 'hyperjump+busyapi-exact' ||
        result['producerVersion'] != _schemaProducerVersion) {
      throw CoreFailure(
        'runtime.protocol',
        'The schema worker returned an unrelated or malformed runtime result',
      );
    }
    final expectedParameters = <String, int>{};
    String parameterKey(
      String subject,
      String location,
      String resource,
      String pointer,
    ) => jsonEncode([subject, location, resource, pointer]);
    for (final instance in instances) {
      final parameter = instance.parameter;
      if (parameter == null) continue;
      final key = parameterKey(
        instance.subject, instance.location, parameter.resource, parameter.pointer,
      );
      expectedParameters.update(key, (count) => count + 1, ifAbsent: () => 1);
    }
    final actualParameters = <String, int>{};
    for (final proof in result['runtimeEvaluations'] as List) {
      if (proof is! Map || !proof.containsKey('parameter')) continue;
      final parameter = proof['parameter'];
      if (parameter is! Map ||
          parameter.keys.any((key) => key != 'resource' && key != 'pointer') ||
          parameter['resource'] is! String ||
          parameter['pointer'] is! String ||
          proof['subject'] is! String || proof['location'] is! String ||
          proof['complete'] is! bool || proof['valid'] is! bool) {
        throw CoreFailure(
          'runtime.protocol',
          'The serialized parameter proof has malformed captured ownership.',
        );
      }
      final key = parameterKey(
        proof['subject'] as String, proof['location'] as String,
        parameter['resource'] as String, parameter['pointer'] as String,
      );
      actualParameters.update(key, (count) => count + 1, ifAbsent: () => 1);
    }
    if (actualParameters.length != expectedParameters.length ||
        expectedParameters.entries.any((entry) => actualParameters[entry.key] != entry.value)) {
      throw CoreFailure(
        'runtime.protocol',
        'The worker omitted, repeated or replaced a serialized parameter proof.',
      );
    }
    return _freezeResult(result);
  }

  Future<RefactoringPlan> planResponseExample(
    String reviewedJson, {
    required int status,
    required List<(String, String)> headers,
    required bool receiptComplete,
    required bool redacted,
  }) async {
    ensureCurrentOwner();
    if (!receiptComplete) {
      throw CoreFailure(
        'example.incomplete',
        'A truncated, cancelled or timed-out response cannot be saved as a complete example',
      );
    }
    final contentType = headers
        .where((header) => header.$1.toLowerCase() == 'content-type')
        .map((header) => header.$2)
        .firstOrNull;
    if (contentType == null ||
        !(contentType.split(';').first.trim().toLowerCase() ==
                'application/json' ||
            contentType
                .split(';')
                .first
                .trim()
                .toLowerCase()
                .endsWith('+json'))) {
      throw CoreFailure(
        'example.media-type',
        'Only an explicitly reviewed JSON response can be saved as an authored example',
      );
    }
    Map? declaration = (result['responses'] as List)
        .whereType<Map>()
        .where((value) => value['status'] == '$status')
        .firstOrNull;
    declaration ??= (result['responses'] as List).whereType<Map>().where((
      value,
    ) {
      final declaredStatus = '${value['status']}'.toUpperCase();
      return RegExp(r'^[1-5]XX$').hasMatch(declaredStatus) &&
          declaredStatus.codeUnitAt(0) - 48 == status ~/ 100;
    }).firstOrNull;
    declaration ??= (result['responses'] as List)
        .whereType<Map>()
        .where((value) => '${value['status']}'.toLowerCase() == 'default')
        .firstOrNull;
    final media = selectDeclaredMedia(
      (declaration?['content'] as List? ?? const []).whereType<Map>(),
      contentType,
    );
    final target = media?['definition'];
    if (target is! Map ||
        target['resource'] is! String ||
        target['pointer'] is! String ||
        target['generation'] is! int ||
        target['range'] is! List) {
      throw CoreFailure(
        'example.destination',
        'The received status and media type have no current authored response destination',
      );
    }
    final prepared = await _owner.engine.request('planResponseExample', {
      ...snapshot.toJson(),
      'target': Map<String, dynamic>.from(target),
      'raw': reviewedJson,
      'mediaType': contentType.split(';').first.trim(),
      'redacted': redacted,
    });
    if (_closed ||
        _owner._closed ||
        _revision != _owner._resourceRevision ||
        !snapshot.current(_owner.store) ||
        prepared['snapshot'] != snapshot.identity) {
      throw CoreFailure(
        'refactor.stale',
        'The contract changed while preparing the response example review',
      );
    }
    return RefactoringPlan._(_owner, _revision, [snapshot], prepared);
  }
}

class RuntimeFormTarget {
  const RuntimeFormTarget({
    required this.resource,
    required this.pointer,
    this.occurrence,
    this.fileShapes = const {},
    this.partSchemas = const {},
    this.partMediaTypes = const {},
  });
  final String resource, pointer;
  final String? occurrence;
  final Map<String, MultipartFileShape> fileShapes;
  final Map<String, String> partSchemas, partMediaTypes;
  Map<String, Object> toJson() => {
    'resource': resource,
    'pointer': pointer,
    if (occurrence != null) 'occurrence': occurrence!,
    if (partSchemas.isNotEmpty) 'partSchemas': partSchemas,
    if (partMediaTypes.isNotEmpty) 'partMediaTypes': partMediaTypes,
    if (fileShapes.isNotEmpty)
      'fileShapes': {
        for (final entry in fileShapes.entries) entry.key: entry.value.name,
      },
  };
}

/// The original media declaration owns body semantics when schema is absent.
class RuntimeMediaTarget {
  const RuntimeMediaTarget({required this.resource, required this.pointer});
  final String resource, pointer;
  Map<String, String> toJson() => {'resource': resource, 'pointer': pointer};
}

/// A complete parameter serialization interpreted by its captured declaration.
/// No caller-supplied family, style, schema or reference target is admitted.
class RuntimeParameterTarget {
  const RuntimeParameterTarget({required this.resource, required this.pointer, this.values});
  final String resource, pointer;
  final List<String>? values;
  Map<String, Object?> toJson() => {'resource': resource, 'pointer': pointer, if (values != null) 'values': List<String>.of(values!)};
}

/// Actual field lines and their captured response-header occurrence. The
/// contract engine owns reference following, family rules and representation.
class RuntimeHeaderTarget {
  RuntimeHeaderTarget({
    required this.resource,
    required this.pointer,
    required this.name,
    required List<String> values,
  }) : values = List.unmodifiable(values);
  final String resource, pointer, name;
  final List<String> values;
  Map<String, Object?> toJson() => {
    'resource': resource,
    'pointer': pointer,
    'name': name,
    'values': List<String>.of(values, growable: false),
  };
}

class RuntimeSwaggerHeaderTarget {
  RuntimeSwaggerHeaderTarget({
    required this.resource,
    required this.pointer,
    required this.name,
    required List<String> values,
  }) : values = List.unmodifiable(values);
  final String resource, pointer, name;
  final List<String> values;
  Map<String, Object?> toJson() => {
    'resource': resource,
    'pointer': pointer,
    'name': name,
    'values': List<String>.of(values, growable: false),
  };
}

class RuntimeSchemaInstance {
  const RuntimeSchemaInstance({
    required this.subject,
    required this.location,
    required this.text,
    this.schemaResource,
    this.schemaPointer,
    this.itemSchemaResource,
    this.itemSchemaPointer,
    this.mediaType,
    this.mediaBase64 = false,
    this.form,
    this.media,
    this.alternatives = const [],
    this.swaggerHeader,
    this.header,
    this.parameter,
  });
  final String subject, location, text;
  final String? schemaResource, schemaPointer;
  final String? itemSchemaResource, itemSchemaPointer, mediaType;
  final bool mediaBase64;
  final RuntimeFormTarget? form;
  final RuntimeMediaTarget? media;
  final List<String> alternatives;
  final RuntimeSwaggerHeaderTarget? swaggerHeader;
  final RuntimeHeaderTarget? header;
  final RuntimeParameterTarget? parameter;
  Map<String, Object?> toJson() => {
    'subject': subject,
    'location': location,
    'text': text,
    if (schemaResource != null)
      'schema': {'resource': schemaResource, 'pointer': schemaPointer},
    if (itemSchemaResource != null)
      'itemSchema': {
        'resource': itemSchemaResource,
        'pointer': itemSchemaPointer,
      },
    if (mediaType != null) 'mediaType': mediaType,
    if (mediaBase64) 'mediaBase64': true,
    if (form != null) 'form': form!.toJson(),
    if (media != null) 'media': media!.toJson(),
    if (alternatives.isNotEmpty)
      'alternatives': List<String>.of(alternatives, growable: false),
    if (swaggerHeader != null) 'swaggerHeader': swaggerHeader!.toJson(),
    if (header != null) 'header': header!.toJson(),
    if (parameter != null) 'parameter': parameter!.toJson(),
  };
}

extension RequestPlanning on BusyProject {
  Future<CapturedContractSnapshot> captureContractSnapshot(
    String root, {
    bool saved = false,
    String? requestId,
    bool Function()? cancelled,
    void Function(String resource)? onResourceRefreshed,
  }) async {
    AnalysisSnapshot? captured;
    final result = await check(
      root,
      saved: saved,
      requestId: requestId,
      cancelled: cancelled,
      onResourceRefreshed: onResourceRefreshed,
      onSnapshot: (snapshot) => captured = snapshot,
    );
    if (captured == null) {
      throw CoreFailure(
        'snapshot.incomplete',
        'The selected contract did not produce a coherent snapshot',
      );
    }
    return CapturedContractSnapshot(
      snapshot: captured!,
      analysis: _freezeResult(result),
      saved: saved,
    );
  }

  Future<OperationRequestPlan> prepareRequest(
    String root, {
    required String resource,
    required String pointer,
    String? occurrence,
    bool saved = false,
    String? requestId,
    bool Function()? cancelled,
    void Function(String resource)? onResourceRefreshed,
  }) async {
    if (_closed) throw CoreFailure('access.closed', 'Project is closed');
    AnalysisSnapshot? captured;
    final checked = await check(
      root,
      saved: saved,
      requestId: requestId == null ? null : '$requestId-check',
      cancelled: cancelled,
      onResourceRefreshed: onResourceRefreshed,
      onSnapshot: (snapshot) => captured = snapshot,
    );
    if (cancelled?.call() == true) {
      throw CoreFailure('cancelled', 'Request preparation was cancelled');
    }
    if (captured == null || checked['projection'] == null) {
      throw CoreFailure(
        'request.contract',
        'The captured contract could not produce an operation request plan',
      );
    }
    final snapshot = captured!, revision = _resourceRevision;
    final result = await engine.request('requestOperation', {
      ...snapshot.toJson(),
      'resource': resource,
      'pointer': pointer,
      if (occurrence != null) 'occurrence': occurrence,
    }, requestId: requestId == null ? null : '$requestId-plan');
    if (_closed ||
        cancelled?.call() == true ||
        result['snapshot'] != snapshot.identity ||
        result['version'] != 1 ||
        result['identity'] is! String ||
        result['complete'] != true ||
        result['representationRevisions'] is! Map ||
        (result['representationRevisions'] as Map)['multipart'] != '2' ||
        (result['representationRevisions'] as Map)['schemaExamples'] != '3' ||
        (result['representationRevisions'] as Map)['xml'] != '2' ||
        (result['representationRevisions'] as Map)['linkset'] != '2' ||
        (result['representationRevisions'] as Map)['stream'] != '2' ||
        (result['representationRevisions'] as Map)['parameterExamples'] != '1' ||
        result['operation'] is! Map ||
        result['servers'] is! List ||
        result['parameters'] is! List ||
        result['security'] is! Map ||
        result['responses'] is! List ||
        result['responseStatusNamePolicy'] is! Map) {
      throw CoreFailure(
        'request.protocol',
        'The contract worker returned an unrelated or malformed request plan',
      );
    }
    final configuration = ExecutionConfiguration.parse(
      snapshot.configuration.singleOrNull,
      access.boundary,
    );
    return OperationRequestPlan._(
      this,
      snapshot,
      configuration,
      _freezeResult(result),
      saved,
      revision,
    );
  }
}

class CapturedContractSnapshot {
  const CapturedContractSnapshot({
    required this.snapshot,
    required this.analysis,
    required this.saved,
  });
  final AnalysisSnapshot snapshot;
  final Map<String, dynamic> analysis;
  final bool saved;
}
