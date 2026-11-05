part of 'project.dart';

bool _migrationOutputPath(String path) =>
    path == p.posix.normalize(path) &&
    !p.posix.isAbsolute(path) &&
    !p.posix.split(path).any((part) => part == '..' || part == '.') &&
    !path.contains('\\');

void _verifyMigrationExampleCopies(
  Map<String, dynamic> result,
  _OutputInput input,
  Set<String> paths,
  Map<String, String> outputTexts,
) {
  Never invalid() => throw CoreFailure(
    'migration.protocol', 'Migration returned unrelated external example bytes',
  );
  final captured = {for (final value in input.snapshot.exampleResources) value.id: value};
  final affected = result['affectedExampleResources'];
  if (affected is! List || affected.length != captured.length) invalid();
  final affectedIds = <String>{};
  for (final value in affected) {
    if (value is! Map || value['id'] is! String || !affectedIds.add(value['id'] as String)) invalid();
    final source = captured[value['id']];
    if (source == null || value['identity'] != source.identity || value['generation'] != source.generation ||
        value['state'] != (source.available ? 'available' : 'unavailable') ||
        jsonEncode(value['aliases']) != jsonEncode(source.aliases)) invalid();
  }
  final copied = <String>{}, occurrences = <String>{};
  final resources = {for (final value in input.snapshot.resources) value['id']: value};
  final outputs = result['exampleOutputs'];
  if (outputs is! List || outputs.length > 2048) invalid();
  for (final value in outputs) {
    if (value case {
      'path': String path, 'id': String id, 'identity': String identity,
      'base64': String base64, 'byteLength': int byteLength,
      'source': {'resource': String resource, 'identity': String sourceIdentity, 'generation': int generation},
      'occurrences': List locations,
    }) {
      final source = captured[resource], bytes = source?.bytes;
      if (source == null || bytes == null || identity != source.identity || sourceIdentity != identity ||
          generation != source.generation || bytes.length != byteLength || base64Encode(bytes) != base64 ||
          path != 'examples/${textIdentity(resource).substring(0, 24)}.bin' ||
          !_migrationOutputPath(path) || !paths.add(path) || !copied.add(resource) ||
          id != Uri.directory(input.target).resolve(path).toString() ||
          locations.isEmpty || locations.length > 20000) invalid();
      for (final occurrence in locations) {
        if (occurrence case {
          'source': {'resource': String originalResource, 'pointer': String _, 'range': [int start, int end]},
          'destination': {'resource': String destination, 'pointer': String pointer},
        }) {
          final original = resources[originalResource];
          if (original == null || start < 0 || end < start || end > (original['text'] as String).length ||
              !outputTexts.containsKey(destination) || !pointer.endsWith('/externalValue') ||
              !occurrences.add(jsonEncode([destination, pointer])) || occurrences.length > 20000) invalid();
        } else {invalid();}
      }
    } else {invalid();}
  }
}

void _verifyMigrationReview(
  Map<String, dynamic> result,
  _OutputInput input,
  String targetVersion,
) {
  Never invalid() => throw CoreFailure(
    'migration.protocol',
    'Migration returned an incomplete or unrelated review',
  );
  if (result['version'] != 1 ||
      result['snapshot'] != input.snapshot.identity ||
      result['producer'] != 'busyapi-native-migration' ||
      result['producerVersion'] != '82' ||
      result['problems'] is! List ||
      result['outputs'] is! List ||
      result['exampleOutputs'] is! List ||
      result['affectedExampleResources'] is! List ||
      result['changes'] is! List ||
      result['presentationChanges'] is! List ||
      result['affectedResources'] is! List ||
      result['entryRoutes'] is! List)
    invalid();
  final target = SpecificationContext.fromJson(result['target']);
  if (target.declaredVersion != targetVersion) invalid();
  final status = result['status'], complete = result['complete'];
  if (!const [
        'faithfully-convertible',
        'requires-decision',
        'blocked',
      ].contains(status) ||
      complete is! bool ||
      (status == 'faithfully-convertible') != complete)
    invalid();
  final resources = {
    for (final resource in input.snapshot.resources)
      resource['id'] as String: resource,
  };
  final configuration = input.snapshot.configuration;
  final expectedConfiguration = configuration.isEmpty ? null : {
    'resource': configuration.single['id'],
    'generation': configuration.single['generation'],
    'identity': configuration.single['identity'],
  };
  if (jsonEncode(result['affectedConfiguration']) != jsonEncode(expectedConfiguration)) invalid();
  final problemResources = {
    ...resources,
    for (final source in configuration) source['id'] as String: source,
  };
  final entries = result['entryRoutes'] as List, entryResources = <String>{};
  if (entries.isEmpty || entries.length > resources.length) invalid();
  for (final value in entries) {
    if (value is! Map ||
        value['resource'] is! String ||
        !resources.containsKey(value['resource']) ||
        !entryResources.add(value['resource'] as String))
      invalid();
    final entry = MigrationEntryRoute._(value);
    if (entry.target.declaredVersion != targetVersion) invalid();
  }
  if (!entryResources.contains(input.snapshot.root)) invalid();
  for (final value in result['problems'] as List) {
    if (value case {
      'id': String _,
      'resource': String resource,
      'pointer': String _,
      'code': String code,
      'message': String _,
      'reason': String reason,
      'range': [int start, int end],
    }) {
      final source = problemResources[resource];
      if (source == null ||
          start < 0 ||
          end < start ||
          end > (source['text'] as String).length ||
          !const [
            'target-representation',
            'implementation',
            'source-incomplete',
            'decision',
          ].contains(reason))
        invalid();
      final choices = value['choices'];
      if (choices != null &&
          (choices is! List || choices.any((choice) => choice is! String)))
        invalid();
      final details = value['choiceDetails'];
      final hasAlternative = choices is List && choices.any(
        (choice) => choice is String && choice.startsWith('discriminator-alternative:'),
      );
      if ((code == 'migration.discriminator.default' || hasAlternative) &&
          (choices is! List || choices.isEmpty || details is! List))
        invalid();
      if (details != null) {
        if (details is! List || choices is! List ||
            details.length != choices.length || details.length > 128)
          invalid();
        final described = <String>{};
        for (final detail in details) {
          if (detail case {
            'value': String choice,
            'label': String label,
            'target': {
              'resource': String targetResource,
              'pointer': String pointer,
              'range': [int start, int end],
            },
          }) {
            final target = resources[targetResource];
            if (!choices.contains(choice) || !described.add(choice) ||
                label.isEmpty || label.length > 1024 || pointer.length > 65536 ||
                pointer.isNotEmpty && !pointer.startsWith('/') ||
                RegExp(r'~(?![01])').hasMatch(pointer) ||
                target == null || start < 0 || end < start ||
                end > (target['text'] as String).length)
              invalid();
          } else {
            invalid();
          }
        }
      }
    } else {
      invalid();
    }
  }
  if (!complete) {
    if ((result['outputs'] as List).isNotEmpty ||
        (result['exampleOutputs'] as List).isNotEmpty ||
        (result['problems'] as List).isEmpty)
      invalid();
    return;
  }
  if ((result['problems'] as List).isNotEmpty ||
      (result['outputs'] as List).isEmpty || result['manifest'] is! Map)
    invalid();
  final manifestText = result['manifestText'];
  if (manifestText is! String || utf8.encode(manifestText).length > 65536 ||
      textIdentity(manifestText) != result['manifestIdentity'] ||
      result['configurationBindings'] is! List ||
      (result['configurationBindings'] as List).length > 4096 ||
      result['configurationAlternatives'] is! List ||
      (result['configurationAlternatives'] as List).length > 2048) invalid();
  Object? manifest;
  try { manifest = jsonDecode(manifestText); } on Object { invalid(); }
  if (manifest is! Map || manifest['version'] != 1 ||
      manifest.keys.any((key) => !const ['version', 'roots', 'resourceMappings', 'environments'].contains(key))) invalid();
  for (final key in ['version', 'roots', 'resourceMappings']) {
    if (jsonEncode(manifest[key]) != jsonEncode((result['manifest'] as Map?)?[key])) invalid();
  }
  Object? sourceConfiguration, exactManifest;
  try {
    sourceConfiguration = configuration.isEmpty
        ? null : exactConfiguration(configuration.single['text'] as String);
    exactManifest = exactConfiguration(manifestText);
  } on Object { invalid(); }
  if (exactManifest is! Map) invalid();
  final deliveredEnvironments = exactManifest['environments'];
  bool sameConfiguration(Object? a, Object? b) {
    try { return sameExactConfiguration(a, b); } on Object { invalid(); }
  }
  final originalEnvironments = sourceConfiguration is Map ? sourceConfiguration['environments'] : null;
  if ((originalEnvironments == null) != (deliveredEnvironments == null)) invalid();
  final alternativeChanges = <String, int>{};
  for (final value in result['configurationAlternatives'] as List) {
    if (value case {'environment': String environment, 'before': int before, 'after': int after}) {
      final original = originalEnvironments is Map ? originalEnvironments[environment] : null;
      final authentication = original is Map ? original['authentication'] : null;
      final alternative = authentication is Map ? authentication['alternative'] : null;
      if (alternative is! ExactConfigurationNumber || alternative.nativeInteger != before ||
          !sameConfiguration(alternative, before) || before < 0 || after < 0 || after >= 2048 ||
          before == after || alternativeChanges.containsKey(environment)) invalid();
      alternativeChanges[environment] = after;
    } else { invalid(); }
  }
  for (final value in result['configurationBindings'] as List) {
    if (value case {'root': String root, 'resource': String resource,
        'pointer': String pointer, 'before': String before, 'after': String after}) {
      if (!entryResources.contains(root) || !resources.containsKey(resource) ||
          pointer.length > 65536 || after.isEmpty || after.length > 65536 ||
          !pointer.endsWith('/${before.replaceAll('~', '~0').replaceAll('/', '~1')}')) invalid();
      if (originalEnvironments is Map) {
        if (deliveredEnvironments is! Map) invalid();
        for (final environment in originalEnvironments.entries) {
          final settings = environment.value is Map ? environment.value['authentication'] : null;
          final schemes = settings is Map ? settings['schemes'] : null;
          if (schemes is! Map || !schemes.containsKey(before)) continue;
          final delivered = deliveredEnvironments[environment.key];
          final authentication = delivered is Map ? delivered['authentication'] : null;
          final aliases = authentication is Map ? authentication['schemes'] : null;
          if (aliases is! Map || !aliases.containsKey(after) ||
              !sameConfiguration(aliases[after], schemes[before])) invalid();
        }
      }
    } else { invalid(); }
  }
  if (originalEnvironments is Map) {
    final delivered = deliveredEnvironments;
    if (delivered is! Map || delivered.length != originalEnvironments.length) invalid();
    for (final entry in originalEnvironments.entries) {
      final original = entry.value, environment = delivered[entry.key];
      if (original is! Map || environment is! Map || environment.length != original.length ||
          environment.keys.any((key) => !original.containsKey(key))) invalid();
      for (final field in original.keys.where((key) => key != 'authentication' && key != 'tls')) {
        if (!sameConfiguration(original[field], environment[field])) invalid();
      }
      final before = original['authentication'], after = environment['authentication'];
      if (before is Map) {
        if (after is! Map || before.length != after.length || after.keys.any((key) => !before.containsKey(key))) invalid();
        for (final field in before.keys.where((key) => key != 'schemes')) {
          final expected = field == 'alternative' ? alternativeChanges[entry.key] ?? before[field] : before[field];
          if (!sameConfiguration(expected, after[field])) invalid();
          if (field == 'alternative') {
            final originalSelection = expected is int ? expected :
                expected is ExactConfigurationNumber ? expected.nativeInteger : null;
            final targetSelection = after[field] is ExactConfigurationNumber
                ? (after[field] as ExactConfigurationNumber).nativeInteger : null;
            if (originalSelection != targetSelection) invalid();
          }
        }
        final originals = before['schemes'], aliases = after['schemes'];
        if (originals is Map) {
          if (aliases is! Map) invalid();
          for (final setting in originals.entries) {
            if (!aliases.containsKey(setting.key) || !sameConfiguration(setting.value, aliases[setting.key])) invalid();
          }
          for (final name in aliases.keys.where((name) => !originals.containsKey(name))) {
            if (!(result['configurationBindings'] as List).cast<Map>().any((binding) =>
                binding['after'] == name && originals.containsKey(binding['before']) &&
                sameConfiguration(originals[binding['before']], aliases[name]))) invalid();
          }
        } else if (!sameConfiguration(originals, aliases)) { invalid(); }
      } else if (!sameConfiguration(before, after)) { invalid(); }
      final originalTls = original['tls'], tls = environment['tls'];
      if (originalTls is Map) {
        if (tls is! Map || tls.length != originalTls.length || tls.keys.any((key) => !originalTls.containsKey(key))) invalid();
        for (final field in originalTls.keys) {
          final path = originalTls[field];
          final expected = const ['caFile', 'clientCertificateFile', 'clientKeyFile'].contains(field) &&
              path is String && !p.isAbsolute(path)
              ? p.normalize(p.join(p.dirname(Uri.parse(configuration.single['id'] as String).toFilePath()), path)) : path;
          if (!sameConfiguration(expected, tls[field])) invalid();
        }
      } else if (!sameConfiguration(originalTls, tls)) { invalid(); }
    }
  }
  if (result['validation'] case {'complete': true, 'family': String _}) {
  } else {
    invalid();
  }
  final paths = <String>{};
  final outputTexts = <String, String>{};
  for (final value in result['outputs'] as List) {
    if (value case {
      'path': String path,
      'id': String id,
      'text': String text,
      'identity': String identity,
      'hasBom': bool _,
    }) {
      if (!_migrationOutputPath(path) ||
          !paths.add(path) ||
          id != Uri.directory(input.target).resolve(path).toString() ||
          textIdentity(text) != identity)
        invalid();
      outputTexts[id] = text;
    } else {
      invalid();
    }
  }
  if (!paths.contains(result['entry']) ||
      paths.contains('busyapi.yaml') ||
      paths.contains('migration.json') ||
      result['manifest'] is! Map ||
      result['identity'] is! String)
    invalid();
  final reviewed = <String>{};
  final originalReviewed = <String>{};
  final reviewedDestinations = <String>{};
  for (final value in result['changes'] as List) {
    if (value case {
      'resource': String resource,
      'destination': String destination,
      'before': String before,
      'after': String after,
    }) {
      if (!reviewed.add(resource) ||
          !reviewedDestinations.add(destination) ||
          outputTexts[destination] != after)
        invalid();
      if (resources.containsKey(resource)) {
        if (resources[resource]?['text'] != before ||
            value.containsKey('createdFrom'))
          invalid();
        originalReviewed.add(resource);
      } else {
        final owner = value['createdFrom'];
        final usesCapturedIdentity = resources.values.any((input) {
          final aliases = input['aliases'];
          return aliases is List && aliases.contains(resource);
        });
        if (owner is! String ||
            !entryResources.contains(owner) ||
            before.isNotEmpty ||
            usesCapturedIdentity)
          invalid();
      }
    } else {
      invalid();
    }
  }
  if (originalReviewed.length != resources.length ||
      reviewed.length > 256 ||
      outputTexts.length != reviewed.length)
    invalid();
  _verifyMigrationExampleCopies(result, input, paths, outputTexts);
}

/// One captured API description's explicit source and target specifications.
class MigrationEntryRoute {
  MigrationEntryRoute._(Map value)
    : resource = value['resource'] as String,
      from = SpecificationContext.fromJson(value['from']),
      target = SpecificationContext.fromJson(value['target']);
  final String resource;
  final SpecificationContext from, target;
}

enum MigrationStatus { faithfullyConvertible, requiresDecision, blocked }

enum MigrationProblemReason {
  targetRepresentation,
  implementation,
  sourceIncomplete,
  decision,
}

class MigrationDecisionChoice {
  MigrationDecisionChoice._(Map value)
    : value = value['value'] as String,
      label = value['label'] as String,
      target = CoreFailureSource(
        (value['target'] as Map)['resource'] as String,
        (value['target'] as Map)['pointer'] as String,
        SourceRange(
          ((value['target'] as Map)['range'] as List)[0] as int,
          ((value['target'] as Map)['range'] as List)[1] as int,
        ),
      );
  final String value, label;
  final CoreFailureSource target;
}

class MigrationProblem {
  MigrationProblem._(Map value)
    : id = value['id'] as String,
      resource = value['resource'] as String,
      pointer = value['pointer'] as String,
      code = value['code'] as String,
      message = value['message'] as String,
      reason = switch (value['reason']) {
        'target-representation' => MigrationProblemReason.targetRepresentation,
        'implementation' => MigrationProblemReason.implementation,
        'source-incomplete' => MigrationProblemReason.sourceIncomplete,
        'decision' => MigrationProblemReason.decision,
        _ => throw CoreFailure(
          'migration.protocol',
          'Unknown migration problem classification',
        ),
      },
      range = SourceRange(
        (value['range'] as List)[0] as int,
        (value['range'] as List)[1] as int,
      ),
      choices = List.unmodifiable(
        (value['choices'] as List? ?? const []).cast<String>(),
      ),
      choiceDetails = Map.unmodifiable(
        {for (final choice in (value['choiceDetails'] as List? ?? const []).cast<Map>())
          choice['value'] as String: MigrationDecisionChoice._(choice)},
      );
  final String id, resource, pointer, code, message;
  final MigrationProblemReason reason;
  final SourceRange range;
  final List<String> choices;
  final Map<String, MigrationDecisionChoice> choiceDetails;
}

class MigrationChange {
  MigrationChange._(Map value)
    : resource = value['resource'] as String,
      destination = value['destination'] as String,
      before = value['before'] as String,
      after = value['after'] as String,
      createdFrom = value['createdFrom'] as String?;
  final String resource, destination, before, after;

  /// Captured entry owning a newly derived standard schema resource.
  final String? createdFrom;
  bool get isCreated => createdFrom != null;
}

/// A reviewed spelling change only; credential values never enter this record.
class MigrationSecurityBinding {
  MigrationSecurityBinding._(Map value)
    : root = value['root'] as String, resource = value['resource'] as String,
      pointer = value['pointer'] as String, before = value['before'] as String,
      after = value['after'] as String;
  final String root, resource, pointer, before, after;
}

/// Existing environment selection projected through captured OR expansion.
class MigrationAuthenticationAlternative {
  MigrationAuthenticationAlternative._(Map value)
    : environment = value['environment'] as String,
      before = value['before'] as int, after = value['after'] as int;
  final String environment;
  final int before, after;
}

/// An exact opaque copy in the reviewed output; no payload interpretation or
/// source mutation is performed by this publication record.
class MigrationExampleCopy {
  MigrationExampleCopy._(Map value)
    : path = value['path'] as String,
      destination = value['id'] as String,
      identity = value['identity'] as String,
      byteLength = value['byteLength'] as int,
      resource = (value['source'] as Map)['resource'] as String,
      _bytes = base64Decode(value['base64'] as String).asUnmodifiableView(),
      sources = List.unmodifiable((value['occurrences'] as List).cast<Map>().map((occurrence) {
        final source = occurrence['source'] as Map, range = source['range'] as List;
        return CoreFailureSource(source['resource'] as String, source['pointer'] as String,
            SourceRange(range[0] as int, range[1] as int));
      }));
  final String path, destination, identity, resource;
  final int byteLength;
  final Uint8List _bytes;
  final List<CoreFailureSource> sources;
  Uint8List get bytes => _bytes;
}

/// A review of one captured graph. Publishing owns a separate directory and
/// rechecks source buffers, disk inputs and destination ownership at the last
/// publication boundary. Original source is never an output target.
class MigrationOutput extends BundleOutput {
  MigrationOutput._(
    BusyProject owner,
    _OutputInput input,
    Map<String, dynamic> result,
    Map<String, Object?> metadata,
  ) : status = switch (result['status']) {
        'faithfully-convertible' => MigrationStatus.faithfullyConvertible,
        'requires-decision' => MigrationStatus.requiresDecision,
        'blocked' => MigrationStatus.blocked,
        _ => throw CoreFailure(
          'migration.protocol',
          'Unknown migration status',
        ),
      },
      problems = List.unmodifiable(
        (result['problems'] as List).cast<Map>().map(MigrationProblem._),
      ),
      changes = List.unmodifiable(
        (result['changes'] as List).cast<Map>().map(MigrationChange._),
      ),
      exampleCopies = List.unmodifiable(
        (result['exampleOutputs'] as List).cast<Map>().map(MigrationExampleCopy._),
      ),
      securityBindings = List.unmodifiable(
        (result['configurationBindings'] as List? ?? const []).cast<Map>().map(MigrationSecurityBinding._),
      ),
      authenticationAlternatives = List.unmodifiable(
        (result['configurationAlternatives'] as List? ?? const []).cast<Map>().map(MigrationAuthenticationAlternative._),
      ),
      target = SpecificationContext.fromJson(result['target']),
      entryRoutes = List.unmodifiable(
        (result['entryRoutes'] as List).cast<Map>().map(MigrationEntryRoute._),
      ),
      super._(
        owner,
        input.access,
        input.target,
        input.snapshot,
        input.saved,
        input.checked['unsaved'] == true,
        input.revision,
        result,
        metadata,
      );
  final MigrationStatus status;
  final List<MigrationProblem> problems;
  final List<MigrationChange> changes;
  final List<MigrationExampleCopy> exampleCopies;
  final List<MigrationSecurityBinding> securityBindings;
  final List<MigrationAuthenticationAlternative> authenticationAlternatives;
  final SpecificationContext target;
  final List<MigrationEntryRoute> entryRoutes;
  bool get publishable =>
      status == MigrationStatus.faithfullyConvertible &&
      result['complete'] == true;
  @override
  String get identity =>
      result['identity'] as String? ?? textIdentity(jsonEncode(result));

  Future<void> _verifyCurrent() async {
    if (_closed || outdated)
      throw CoreFailure(
        'migration.stale',
        'The reviewed migration inputs changed; create a new review',
      );
    final inputs = snapshot.allInputs
        .where((input) => input['bundled'] != true && input['kind'] != 'external-example')
        .map((input) => input['id'] as String)
        .toSet();
    await _resourceBatch(inputs, (id) async {
      final buffer = await _owner.buffer(id);
      await _owner.refreshDisk(buffer);
    });
    final examplesCurrent = await _owner._externalExampleInputsCurrent(snapshot);
    if (_closed ||
        outdated || !examplesCurrent ||
        inputs.any((id) => _owner.store.get(id).externalConflict))
      throw CoreFailure(
        'migration.stale',
        'A source file changed after migration review; no output was published',
      );
  }

  @override
  Future<OutputDirectoryResult> publish({
    String? replaceIdentity,
    bool Function()? cancelled,
    FutureOr<void> Function()? beforePublish,
    FutureOr<void> Function()? afterPublish,
  }) async {
    if (!publishable)
      throw CoreFailure(
        'migration.blocked',
        'Resolve every migration decision and blocker before publication',
      );
    if (cancelled?.call() == true)
      throw CoreFailure('cancelled', 'Migration publication was cancelled');
    await _verifyCurrent();
    final files = <String, List<int>>{};
    for (final output in (result['outputs'] as List).cast<Map>()) {
      final text = output['text'] as String, path = output['path'] as String;
      if (textIdentity(text) != output['identity'])
        throw CoreFailure(
          'migration.protocol',
          'Migrated source identity changed',
        );
      files[path] = [
        if (output['hasBom'] == true) ...const [239, 187, 191],
        ...utf8.encode(text),
      ];
    }
    for (final copy in exampleCopies) {
      if (files.containsKey(copy.path) || contentIdentity(copy.bytes) != copy.identity)
        throw CoreFailure('migration.protocol', 'Reviewed external example copy changed');
      files[copy.path] = copy.bytes;
    }
    final manifestText = result['manifestText'] as String;
    if (textIdentity(manifestText) != result['manifestIdentity'])
      throw CoreFailure('migration.protocol', 'Reviewed configuration identity changed');
    files['busyapi.yaml'] = utf8.encode(manifestText);
    files['migration.json'] = utf8.encode('${jsonEncode(metadata)}\n');
    return _access.publishOutput(
      destination,
      files,
      metadata,
      replaceIdentity: replaceIdentity,
      cancelled: () => cancelled?.call() == true || _closed || outdated,
      beforePublish: () async {
        await beforePublish?.call();
        await _verifyCurrent();
      },
      afterPublish: afterPublish,
    );
  }
}

extension ContractMigration on BusyProject {
  Future<MigrationOutput> prepareMigration(
    String root,
    String destination, {
    required String targetVersion,
    Map<String, String> decisions = const {},
    String? requestId,
    bool Function()? cancelled,
    void Function(String resource)? onResourceRefreshed,
  }) async {
    final captured = await _captureOutputInput(
      root,
      destination,
      operation: 'migration',
      requestId: requestId,
      cancelled: cancelled,
      onResourceRefreshed: onResourceRefreshed,
    );
    try {
      final result = await engine.request('planMigration', {
        ...captured.snapshot.toJson(),
        if (captured.snapshot.configuration.isNotEmpty)
          'configuration': captured.snapshot.configuration.single,
        'targetVersion': targetVersion,
        'destination': Uri.directory(captured.target).toString(),
        'decisions': decisions,
      }, requestId: requestId);
      if (_closed || cancelled?.call() == true)
        throw CoreFailure('cancelled', 'Migration planning was cancelled');
      if (captured.revision != _resourceRevision ||
          !captured.snapshot.current(store))
        throw CoreFailure(
          'migration.stale',
          'The graph changed while preparing migration',
        );
      _verifyMigrationReview(result, captured, targetVersion);
      final metadata = <String, Object?>{
        'version': 1,
        'operation': 'migration',
        'root': root,
        'snapshot': captured.snapshot.sourceIdentity,
        'input': captured.checked['unsaved'] == true
            ? 'working-copy'
            : 'saved-source',
        'unsaved': captured.checked['unsaved'] == true,
        'target': result['target'],
        'stages': result['stages'],
        'status': result['status'],
        'entry': result['entry'],
        'outputIdentity': result['identity'],
        'producer': result['producer'],
        'producerVersion': result['producerVersion'],
        'decisions': decisions,
        'presentationChanges': result['presentationChanges'],
        'invariants': result['invariants'],
        'configurationBindings': result['configurationBindings'],
        'configurationAlternatives': result['configurationAlternatives'],
        'manifestIdentity': result['manifestIdentity'],
        'exampleCopies': [
          for (final copy in (result['exampleOutputs'] as List).cast<Map>())
            {for (final entry in copy.entries) if (entry.key != 'base64') entry.key as String: entry.value},
        ],
        'sources': [
          for (final source in captured.snapshot.resources)
            {'resource': source['id'], 'identity': source['identity']},
          for (final source in captured.snapshot.exampleResources)
            {'resource': source.id, 'identity': source.identity, 'kind': 'external-example'},
          for (final source in captured.snapshot.configuration)
            {'resource': source['id'], 'identity': source['identity'], 'kind': 'configuration'},
        ],
      };
      return MigrationOutput._(this, captured, result, metadata);
    } on Object {
      captured.access.close();
      rethrow;
    }
  }
}
