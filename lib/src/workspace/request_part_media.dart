import 'package:flutter/material.dart';
import 'package:busyapi_core/busyapi_core.dart';

import '../app/busyapi_design.dart';
import '../app/localization.dart';
import 'request_run.dart';

class RequestPartMediaEditor extends StatelessWidget {
  const RequestPartMediaEditor({super.key, required this.run});
  final RequestRunController run;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final options = run.multipartTree
        ? [...FormPartMediaOptions.fromJson({for (final part in run.multipartControls) part['name']: part}),
            ...run.plan!.formMediaOptions(run.bodyMediaType).where((option) => run.bodyFiles.any((file) => file.name == option.name && !file.name.startsWith('/')))]
        : run.plan!.formMediaOptions(run.bodyMediaType);
    final names = options.map((option) => option.name).toSet();
    final enabled = !run.busy && !run.hasComposingInput;
    return Column(
      children: [
        if (run.multipartTree) ...[
          if (run.plan!.multipartRootChoices(run.bodyMediaType).isNotEmpty)
            BusyApiComboRow<String?>(title: l.requestStructuredValue,
              values: {null, ...run.plan!.multipartRootChoices(run.bodyMediaType).map((choice) => choice['id'] as String),
                if (run.partSchemas[''] case final String selected) selected}.toList(),
              selected: run.partSchemas[''],
              labelFor: (value) => value ?? l.requestFileShapeChoose,
              enabled: enabled, onSelected: (value) => run.selectPartSchema('', value)),
          const BusyApiStatusBox(message: 'Enter an ordered array, or the declared named object. Ordered form-data items contain one name/value pair. Files replace null at an instance JSON pointer, such as /1 or /1/file. Inspect parts again after changing values or representations.'),
          BusyApiActionRow(title: l.requestPartEncoding,
            subtitle: 'Inspect current parts and declared choices', enabled: enabled,
            onTap: () => _inspect(run.inspectMultipartParts)),
          RequestDraftEntry(run: run, label: 'Array JSON pointer (empty for the body)',
            value: run.multipartArrayPointer, enabled: enabled,
            onChanged: (value) => run.multipartArrayPointer = value),
          RequestDraftEntry(run: run, label: 'New ordered part · exact JSON value',
            value: run.multipartNewValue, enabled: enabled,
            onChanged: (value) => run.multipartNewValue = value),
          BusyApiActionRow(title: 'Add ordered part', enabled: enabled,
            onTap: () => _inspect(run.appendMultipartPart)),
          BusyApiActionRow(title: 'Inspect prepared multipart request', enabled: enabled,
            onTap: () => _inspect(run.inspectPreparedMultipart)),
          if (run.multipartPrepared case final String preview)
            SelectableText(preview),
          for (final part in run.multipartControls)
            if (part['choiceMessage'] case final String message)
              BusyApiStatusBox(message: '${part['name']}: $message'),
          for (final part in run.multipartControls)
            if (part['schemas'] is List && (part['schemas'] as List).length > 1)
              BusyApiComboRow<String?>(title: '${part['name']} · ${l.requestStructuredValue}',
                values: {null, if (run.partSchemas[part['name']] case final String retained) retained,
                  for (final schema in part['schemas'] as List) schema['id'] as String}.toList(),
                selected: run.partSchemas[part['name']] ?? part['selected'] as String?,
                labelFor: (value) => value ?? l.requestFileShapeChoose,
                enabled: enabled, onSelected: (value) => run.selectPartSchema(part['name'] as String, value)),
        ],
        for (final option in options) ...[
          if (run.bodyFiles.any((file) => file.name == option.name) &&
              option.fileShapes.length > 1)
            BusyApiComboRow<MultipartFileShape?>(
              title: '${option.name} · ${l.requestFileShape}',
              values: [null, ...option.fileShapes],
              selected: option.fileShapes.contains(run.fileShapes[option.name])
                  ? run.fileShapes[option.name]
                  : null,
              labelFor: (shape) => switch (shape) {
                null => l.requestFileShapeChoose,
                MultipartFileShape.single => l.requestFileShapeSingle,
                MultipartFileShape.array => l.requestFileShapeArray,
              },
              enabled: enabled,
              onSelected: (shape) => run.selectFileShape(option.name, shape),
            ),
          if (option.error != null)
            BusyApiStatusBox(message: '${option.name}: ${option.error}')
          else if (!option.styled) ...[
            if (option.requiresChoice ||
                run.partMediaTypes.containsKey(option.name))
              BusyApiComboRow<String?>(
                title: '${option.name} · Content-Type',
                subtitle: option.contentTypes.join(', '),
                values: {
                  null,
                  ...option.concreteTypes,
                  if (run.partMediaTypes[option.name]
                      case final String selected)
                    selected,
                }.toList(),
                selected: run.partMediaTypes[option.name],
                labelFor: (type) => type ?? l.requestPartMediaChoose,
                enabled: enabled,
                onSelected: (type) => run.selectPartMedia(option.name, type),
              )
            else
              BusyApiActionRow(
                title: option.name,
                subtitle:
                    option.fileShapes.length > 1 &&
                        run.bodyFiles.any((file) => file.name == option.name)
                    ? l.requestFileShapeMedia
                    : option.contentTypes.join(', '),
              ),
            if (option.allowsCustom)
              RequestDraftEntry(
                run: run,
                key: ValueKey(
                  'part-media/${run.plan!.identity}/${run.bodyMediaType}/${option.name}',
                ),
                label: '${option.name} · ${l.requestPartMediaConcrete}',
                value: run.partMediaTypes[option.name] ?? '',
                enabled: !run.busy,
                onChanged: (type) => run.selectPartMedia(option.name, type),
              ),
          ],
          if (option.styled && run.partMediaTypes.containsKey(option.name))
            BusyApiActionRow(
              title: '${option.name} · ${run.partMediaTypes[option.name]}',
              subtitle: l.requestPartMediaStale,
              enabled: enabled,
              onTap: () => run.selectPartMedia(option.name, null),
            ),
        ],
        for (final name in run.partMediaTypes.keys.where(
          (name) => !names.contains(name),
        ))
          BusyApiActionRow(
            title: '$name · ${run.partMediaTypes[name]}',
            subtitle: l.requestPartMediaStale,
            enabled: enabled,
            onTap: () => run.selectPartMedia(name, null),
          ),
        for (final entry in run.partSchemas.entries.where((entry) => entry.key.isNotEmpty &&
            !run.multipartControls.any((part) => part['name'] == entry.key &&
                (part['schemas'] as List? ?? const []).any((schema) => schema['id'] == entry.value))))
          BusyApiActionRow(title: '${entry.key} · ${entry.value}',
            subtitle: l.requestPartMediaStale, enabled: enabled,
            onTap: () => run.selectPartSchema(entry.key, null)),
        for (final entry in run.fileShapes.entries.where(
          (entry) =>
              !options.any(
                (option) =>
                    option.name == entry.key &&
                    option.fileShapes.contains(entry.value),
              ) ||
              !run.bodyFiles.any((file) => file.name == entry.key),
        ))
          BusyApiActionRow(
            title: '${entry.key} · ${l.requestFileShape}',
            subtitle: l.requestPartMediaStale,
            enabled: enabled,
            onTap: () => run.selectFileShape(entry.key, null),
          ),
        for (final (index, file) in run.bodyFiles.indexed)
          RequestDraftEntry(
            run: run,
            key: ValueKey(
              'file-media/${run.plan!.identity}/${run.bodyMediaType}/$index/${file.path}',
            ),
            label:
                '${file.name} · ${file.filename ?? file.name} · ${l.requestPartMediaConcrete}',
            value: file.selectedMediaType ?? '',
            enabled: !run.busy,
            onChanged: (type) => run.selectFileMedia(index, type),
          ),
      ],
    );
  }

  Future<void> _inspect(Future<void> Function() action) async {
    try { await action(); }
    on CoreFailure catch (error) {
      run.failure = error.code;
      run.failureMessage = error.message;
      run.refresh(draftChanged: false);
    }
  }
}
