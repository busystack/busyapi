import 'dart:async';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:path/path.dart' as p;

/// The independent CLI reviews the same captured Core transactions as Design.
/// An apply invocation recollects sources and compares a stable review identity
/// before making any buffer or publication change.
Future<({Map<String, Object?> report, int code})> refactoringCommand(
  BusyProject project,
  EngineProcess engine,
  ProjectRoot root,
  Map<String, String> options, {
  PublicationBoundary? beforePublish,
}) async {
  final action = options['action'], pointer = options['pointer'];
  const named = {
    'component-rename', 'property-rename', 'schema-definition-rename',
    'response-rename', 'extract', 'extract-file', 'move-definition',
  };
  const files = {'file-create', 'file-move', 'file-delete', 'root-remove'};
  const destinations = {'extract', 'extract-file', 'move-definition', 'file-create', 'file-move'};
  const requiredDestinations = {'extract-file', 'move-definition', 'file-create', 'file-move'};
  const operationOptions = {'method', 'additional', 'operation-context', 'path', 'destination-pointer'};
  if (action == null ||
      !{...named, ...files, 'inline', 'yaml-ownership', 'operation-move', 'object-delete'}.contains(action) ||
      (!files.contains(action) && pointer == null) ||
      (files.contains(action) && (pointer != null || options.containsKey('context-kind'))) ||
      options.containsKey('review') && options.containsKey('apply') ||
      named.contains(action) != options.containsKey('name') ||
      requiredDestinations.contains(action) && !options.containsKey('destination') ||
      options.containsKey('destination') && !destinations.contains(action) ||
      {'file-move', 'file-delete'}.contains(action) && !options.containsKey('resource') ||
      {'root-remove', 'file-create'}.contains(action) && options.containsKey('resource') ||
      action != 'file-create' && ['content-file', 'text', 'mode', 'bom'].any(options.containsKey) ||
      action != 'file-move' && options.containsKey('retain-identity') ||
      action != 'operation-move' && operationOptions.any(options.containsKey) ||
      options.containsKey('content-file') && options.containsKey('text')) {
    throw CoreFailure('cli.refactor', 'Choose an action and its applicable source, pointer, name and destination; review and apply are separate actions');
  }
  if (action == 'operation-move' &&
      (!options.containsKey('method') ||
          options.containsKey('path') == options.containsKey('destination-pointer'))) {
    throw CoreFailure('cli.refactor', 'Operation moves require --method and exactly one --path or --destination-pointer');
  }
  final mode = options['mode'] == null ? 420 : int.tryParse(options['mode']!, radix: 8);
  if (mode == null || mode < 0 || mode > 511) {
    throw CoreFailure('cli.refactor.mode', 'Use an octal source-file permission mode from 000 to 777');
  }
  String source(String? value) {
    if (value == null) return root.id;
    final uri = Uri.tryParse(value);
    if (uri != null && uri.hasScheme) {
      if (uri.scheme != 'file' || uri.hasQuery || uri.hasFragment)
        throw CoreFailure('cli.refactor.resource', 'Choose an approved local source file');
      return uri.toString();
    }
    return Uri.file(p.normalize(p.join(project.access.boundary, value))).toString();
  }
  final resource = source(options['resource']);
  final cancellation = RunCancellation();
  final signals = [ProcessSignal.sigint, ProcessSignal.sigterm].map(
    (signal) => signal.watch().listen((_) {
      cancellation.cancel();
      // This process owns this engine and all its current maintenance requests.
      unawaited(engine.cancelPrefix(''));
    }),
  ).toList();
  void active() {
    if (cancellation.cancelled) throw CoreFailure('cancelled', 'Source maintenance was cancelled');
  }
  Map<String, Object?>? contentSource;
  try {
    active();
    final item = files.contains(action) ? null : await project.inspectObject(
      root.id, resource, pointer!, contextKind: options['context-kind'],
    );
    active();
    final target = <String, Object?>{
      if (item != null) ...{
        'root': root.id, 'resource': resource, 'generation': item['generation'],
        'pointer': pointer, 'range': item['range'], 'kind': item['kind'],
      },
    };
    Future<RefactoringPlan> createFile() async {
      var text = options['text'] ?? '', bom = options.containsKey('bom');
      if (options['content-file'] case final input?) {
        try {
          // Join the existing source snapshot/freshness owner, including an
          // unopened input. Apply must reject a changed template too.
          final captured = await project.buffer(source(input));
          await project.refreshDisk(captured);
          active();
          if (captured.externalConflict) throw CoreFailure('refactor.stale', 'The captured content source changed');
          text = captured.text; bom = bom || captured.hasBom;
          contentSource = {'resource': captured.id, 'identity': captured.sourceIdentity};
        } on FormatException {
          throw CoreFailure('cli.refactor.content', 'The captured content input must be UTF-8');
        }
      }
      return project.planFileCreation(
        Uri.parse(source(options['destination'])).toFilePath(),
        text: text, hasBom: bom, mode: mode,
      );
    }
    final plan = await switch (action) {
      'component-rename' => project.planComponentRename(target, options['name']!),
      'property-rename' => project.planPropertyRename(target, options['name']!),
      'schema-definition-rename' => project.planSchemaDefinitionRename(target, options['name']!),
      'response-rename' => project.planResponseRename(target, options['name']!),
      'extract' => project.planComponentExtraction(target, options['name']!,
        destinationResource: options['destination'] == null ? null : source(options['destination']),
      ),
      'extract-file' => project.planComponentExtractionToFile(target, options['name']!,
        Uri.parse(source(options['destination'])).toFilePath(),
      ),
      'move-definition' => project.planComponentDefinitionMove(target, options['name']!,
        destinationResource: source(options['destination']),
      ),
      'inline' => project.planReferenceInlining(target),
      'yaml-ownership' => project.planYamlOwnership(target),
      'object-delete' => project.planObjectDeletion(target),
      'operation-move' => project.planOperationMove(target,
        method: options['method']!, additional: options.containsKey('additional'),
        context: options['operation-context'] ?? 'preserve',
        path: options['path'], destinationPointer: options['destination-pointer'],
      ),
      'file-create' => createFile(),
      'file-move' => project.planFileMove(resource,
        Uri.parse(source(options['destination'])).toFilePath(),
        retainIdentity: options.containsKey('retain-identity'),
      ),
      'file-delete' => project.planFileDeletion(resource),
      'root-remove' => project.planRootRemoval(root.name, root.id),
      _ => throw CoreFailure('cli.refactor', 'Unknown source maintenance action'),
    };
    active();
    final blocked = (plan.result['blockers'] as List? ?? const []).isNotEmpty;
    PublicationBatchResult? publication;
    if (options['apply'] case final identity?) {
      if (blocked) throw CoreFailure('refactor.blocked', 'Resolve the reported consumers before applying this review', kind: CoreFailureKind.unsupported);
      if (identity != plan.reviewIdentity)
        throw CoreFailure('refactor.stale', 'The supplied review identity does not match the captured sources, engine and proposed changes');
      final affected = await project.applyRefactoring(plan, current: () => !cancellation.cancelled);
      active();
      if (plan.hasChanges) {
        final locations = StateLocations.xdg();
        await locations.prepare();
        active();
        publication = await PublicationStore(p.join(locations.state, 'publication')).save(
          // Deleted owners are retained outside the visible buffer map until
          // their grouped publication/history can release the original bytes.
          project, project.store.fileBuffers.where((buffer) => affected.contains(buffer.id)),
          beforePublish: (path) async {
            active();
            await beforePublish?.call(path);
            active();
          },
        );
      }
    }
    final complete = !blocked && (publication?.complete ?? true);
    return (report: <String, Object?>{
      ...plan.result,
      'status': complete ? 'complete' : publication == null ? 'incomplete' : 'operational-failure',
      'complete': complete, 'contractValidation': 'not-run',
      'reviewIdentity': plan.reviewIdentity,
      'published': options.containsKey('apply') && complete,
      if (plan.fileIntent.isNotEmpty) 'fileIntent': plan.fileIntent,
      if (contentSource != null) 'contentSource': contentSource,
      if (publication != null) 'publication': {
        'published': publication.published, 'failed': publication.failed,
        'notAttempted': publication.notAttempted, 'journal': publication.journal,
      },
    }, code: complete ? 0 : publication == null ? 2 : 3);
  } finally {
    for (final signal in signals) await signal.cancel();
  }
}
