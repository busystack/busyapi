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
    'response-rename', 'extract', 'move-definition',
  };
  if (pointer == null || action == null ||
      !{...named, 'inline', 'yaml-ownership'}.contains(action) ||
      options.containsKey('review') && options.containsKey('apply') ||
      named.contains(action) != options.containsKey('name') ||
      (action == 'move-definition' && !options.containsKey('destination')) ||
      (options.containsKey('destination') && !{'extract', 'move-definition'}.contains(action))) {
    throw CoreFailure('cli.refactor', 'Choose an action, --pointer and its applicable name/destination; review and apply are separate actions');
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
  try {
    active();
    final item = await project.inspectObject(root.id, resource, pointer,
      contextKind: options['context-kind'],
    );
    active();
    final target = <String, Object?>{
      'root': root.id, 'resource': resource, 'generation': item['generation'],
      'pointer': pointer, 'range': item['range'], 'kind': item['kind'],
    };
    final plan = await switch (action) {
      'component-rename' => project.planComponentRename(target, options['name']!),
      'property-rename' => project.planPropertyRename(target, options['name']!),
      'schema-definition-rename' => project.planSchemaDefinitionRename(target, options['name']!),
      'response-rename' => project.planResponseRename(target, options['name']!),
      'extract' => project.planComponentExtraction(target, options['name']!,
        destinationResource: options['destination'] == null ? null : source(options['destination']),
      ),
      'move-definition' => project.planComponentDefinitionMove(target, options['name']!,
        destinationResource: source(options['destination']),
      ),
      'inline' => project.planReferenceInlining(target),
      'yaml-ownership' => project.planYamlOwnership(target),
      _ => throw CoreFailure('cli.refactor', 'Unknown source maintenance action'),
    };
    active();
    final blocked = (plan.result['blockers'] as List? ?? const []).isNotEmpty;
    PublicationBatchResult? publication;
    if (options['apply'] case final identity?) {
      if (blocked) throw CoreFailure('refactor.blocked', 'Resolve the reported consumers before applying this review');
      if (identity != plan.reviewIdentity)
        throw CoreFailure('refactor.stale', 'The supplied review identity does not match the captured sources, engine and proposed changes');
      await project.applyRefactoring(plan, current: () => !cancellation.cancelled);
      active();
      if (plan.hasChanges) {
        final locations = StateLocations.xdg();
        await locations.prepare();
        active();
        publication = await PublicationStore(p.join(locations.state, 'publication')).save(
          project, plan.edits.map((edit) => project.store.get(edit.buffer)),
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
      if (publication != null) 'publication': {
        'published': publication.published, 'failed': publication.failed,
        'notAttempted': publication.notAttempted, 'journal': publication.journal,
      },
    }, code: complete ? 0 : publication == null ? 2 : 3);
  } finally {
    for (final signal in signals) await signal.cancel();
  }
}
