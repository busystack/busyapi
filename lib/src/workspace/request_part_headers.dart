import 'package:busyapi_core/busyapi_core.dart';
import 'package:flutter/material.dart';

import '../app/busyapi_design.dart';
import '../app/busyapi_disclosure.dart';
import '../app/busyapi_glyphs.dart';
import '../app/localization.dart';
import 'request_run.dart';

class RequestPartHeadersEditor extends StatelessWidget {
  const RequestPartHeadersEditor({super.key, required this.run});
  final RequestRunController run;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final generic = run.multipartTree
        ? run.multipartControls.any((part) => (part['name'] == run.partHeaderPart || part['partName'] == run.partHeaderPart) && part['formData'] == false && part['emitted'] != false)
        : run.plan!.formBindingForMedia(run.bodyMediaType)?.multipart == true &&
        run.bodyMediaType?.split(';').first.trim().toLowerCase() !=
            'multipart/form-data';
    final editable = !run.busy && !run.hasComposingInput;
    return BusyApiDisclosure(
      title: Text(l.requestPartHeaders),
      children: [
        BusyApiStatusBox(message: l.requestPartHeadersHelp),
        if (run.multipartTree)
          for (final part in run.multipartControls)
            if (part['emitted'] != false)
              for (final header in part['headerControls'] as List? ?? const [])
                BusyApiStatusBox(message: '${part['name']} · ${header['name']}'
                  '${header['required'] == true ? ' · required' : ''}'
                  '${header['reason'] is String ? ': ${header['reason']}' : ''}'),
        for (final (index, header) in run.partHeaders.indexed)
          BusyApiActionRow(
            title: '${header.part} · ${header.name}',
            subtitle: header.value,
            trailing: BusyApiCompactIconButton(
              tooltip: l.requestRemove,
              icon: BusyApiGlyphs.delete,
              onPressed: editable ? () => run.removePartHeader(index) : null,
            ),
          ),
        if (generic || run.multipartTree) ...[
          if (run.multipartTree && !generic)
            const BusyApiStatusBox(message: 'Inspect current parts and enter the JSON pointer of a generic MIME part. Additional headers are unavailable on form-data parts.'),
          RequestDraftEntry(
            run: run,
            label: l.requestMultipartName,
            value: run.partHeaderPart,
            enabled: editable,
            onChanged: (value) => run.partHeaderPart = value,
          ),
          RequestDraftEntry(
            run: run,
            label: l.requestHeaderName,
            value: run.partHeaderName,
            enabled: editable,
            onChanged: (value) => run.partHeaderName = value,
          ),
          RequestDraftEntry(
            run: run,
            label: l.requestHeaderValue,
            value: run.partHeaderValue,
            enabled: editable,
            onChanged: (value) => run.partHeaderValue = value,
          ),
          BusyApiActionRow(
            title: l.requestAddHeader,
            enabled:
                editable &&
                generic &&
                run.partHeaders.length < 2048 &&
                run.hasPartHeaderOwner &&
                run.partHeaderName.isNotEmpty,
            onTap: run.addPartHeader,
          ),
        ],
      ],
    );
  }
}
