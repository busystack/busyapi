# Native OpenAPI support

**In progress. Complete native and release qualification has not passed.**

BusyAPI retains native Swagger 2.0 and OpenAPI 3.0.x, 3.1.x and 3.2.x.
Standard YAML/JSON remain authoritative. Opening, editing, saving, checking and
Reference preserve declarations; conversion remains explicit.

The current responsibility contract is [architecture](../architecture.md), and
supported commands are in [README](../../README.md). The former phase directives,
execution holds and detailed dated reports are preserved in the
[historical record](native-openapi-support-history.md); they are not active
implementation instructions. No older passing run qualifies the changed product.

## Simplification status — 2026-11-13

| Area | Current implementation and qualification |
| - | - |
| Source/Design/history | BufferStore owns source, BOM, path/presence, reload, recovery and replay. Reversible spans and logical tokens replace history digests; asynchronous revisions advance across undo and owner replacement. Focused core/widget exact-input, branching, late-input and save/reopen cases pass. Native input remains blocked below. |
| Recovery | Source input, field commits, undo/redo and selected publication checkpoint affected owners and changed draft revisions. Awaiting persistence also awaits earlier captured writes. File-intent updates and retirement avoid workspace-buffer enumeration and exclude unrelated dirty sources. Complete drains remain at workspace replacement/close. Focused interruption/race and targeted-resource cases pass. |
| Capture and assistance | Root-local immutable captures are separate from full schema analysis. Disk events invalidate relevant versions with bounded reconciliation. Folding uses selected-resource syntax without a graph. Derived text cannot reuse an old parse through inherited metadata. Focused root/cache/folding tests pass. |
| Source saving | Desktop and CLI use PublicationStore. Alternate BusyProject.save is removed. Partial publication, conflicts, permissions, interrupted records, grouped ordering and undo across save remain. Focused publication cases pass. |
| Conversion | TypeScript owns language/configuration transformation; Dart owns bounded review, immutable reviewed bytes and publication. One captured traversal allocates final typed owners and emits common static/contextual edges. Repeated entry/role passes, temporary owner wrappers, superseded-copy retirement and Dart's duplicate full schema precheck are deleted. Explicit capture includes configured entry consumers without eager ordinary opening. All 51 registered conversion suites pass: 7,810 cases on the coherent post-tuple snapshot, including actual mock HTTP and the final native-child, resource-local and tuple regressions. Full product/Core/native qualification remains outstanding. |
| Requests, mock and streams | One parameter-value map owns active request input. Captured operations and immutable body inputs share secret-free aggregate preparation across Preview/Send, with fresh dispatch credentials/TLS and exact selected-file reconciliation. Shared serializers replace equivalent form/multipart reproof. Streams retain bounded framing/context in one engine owner, with thin continuation IPC and independent close/cancellation. Broad runtime qualification remains in progress. |
| Outputs and governance | Prepared immutable files use the common output publisher. Generator selection and execution share a runtime. Verified renderer bytes are reused until installed files change; packaging inventory policy has left documentation-open actions. Governance reuses one immutable review and checks exact dispatch authority once. Focused output, approval and installed-input change cases pass. |
| Build and distribution | Assembly is separate from current-invocation qualification. Editor assembly passed with optional tools unavailable; renderer rebuilds are skipped when unchanged. Official widget acceptance runs once; no persistent full-suite receipt is required. Full release assembly and distributed-artifact verification pass. Full behavioral/native qualification remains outstanding. |

The compact acceptance corpus keeps all four native families, YAML/JSON fidelity,
shared roots, aliases/exact numbers, pending and composing fields, disk/save races,
grouped file maintenance, representative explicit conversion, actual HTTP bytes,
stream framing/cancellation and real native focus/input. Tests of observable
behavior and actual process/filesystem boundaries remain gates. Private conversion
layout, historical revision literals and build-script order are not independent
product requirements. Migration compatibility is tested separately at revision 107.

The latest complete conversion run used immutable post-tuple helpers and the
registered Node arguments, with real loopback mock execution: 51 suites, 7,810
passing cases, zero failures. The captured input identity is
`9b93b878ad767e41bff053d263a85c4338a352833dbf544164f11306df671cd0`.
Its source identity, helper hashes, invocation, registry, logs and aggregate are
retained in `build/diagnostics/simplification-20261113/conversion-post-tuples/`.
This run includes the YAML ownership correction, captured-document reuse and
sixteen added native-child, shared recursive-resource and tuple-connection cases.
Earlier v7 evidence remains in `conversion-v7/`. Complete Core/CLI journeys must
also use a refreshed candidate: an updated private conversion worker cannot
qualify the saved-source CLI inside an older candidate.

The refreshed v10 release candidate passes all twelve complete B02 Core/CLI
journeys, including actual HTTP, reviewed publication and cold reopen. Candidate,
fixtures and source inputs remained unchanged across that run. The complete
tooling population had 182 passes and one font-fixture failure; after correcting
the fixture's declared producer, all eleven related asset checks pass, including
clean reinstallation in Debug, Profile and Release. This is full-plus-focused
coverage, not a second complete tooling invocation. Current-invocation automated
qualification remains pending: ordinary assembly exposed a test fixture writing
an older runtime descriptor into the production resource-package output. The
build correction must isolate that writer before the broad gates run.

Conversion reuses an unchanged native component Schema as its material owner;
copied containers reference it through the same occurrence mapping. Resource
variation is decided per captured resource, rather than by unrelated differences
elsewhere in an entry. Anchor capture retains unused declarations belonging to an
entered resource, and excludes dormant alternate interpretations of literal data.
Exact-number registration follows active Schema uses; conflicting active source
locations still fail instead of falling back to JavaScript number projections.
The same mapping separates a whole document used as a Schema before its API
declaration is converted, preserving the Schema's original annotation bytes.
The former early shared-document identity refusal is removed.
Copied native roles retain their original typed child owners and associate the
additional concrete uses through the same occurrence map. The traversal follows
the native field definitions and stops at Schema boundaries, so a copied Schema
map cannot invent typed children. Equivalent bare tuple references without an
independent consumer share their surviving actual application; an independently
referenced tail keeps its own owner. This deletes an unused tail holder without
dropping the captured dynamic connection or activating a dormant Schema.
Finite conversion selects its original conjuncts from the capture even when an
earlier step has moved an inactive child. The annotation corpus checks every
native sample within the unchanged diagnostic bound. Two existing OpenAPI 3.0
proof limitations remain explicit: unrestricted name-length constraints and
conditional pattern coverage without a supported selection certificate. Their
located refusals match the baseline; neither publishes partial outputs.

Generated mock form bodies retain immutable typed input and normalized projection
with their output bytes until the final native response check. That check validates
original data, actual decoded bytes, Header/status semantics and exact correspondence,
including legitimate empty-collection omissions. Separate preliminary form and
multipart body checks have been deleted.

Source acquisition and disk reconciliation now share one observation of byte
identity and permissions. Native events schedule affected resources; they do not
advance semantic versions themselves. Actual observations are recorded before
capture versions, and retired reads cannot overwrite a newer publication.
URI aliases acquire one physical resource, and missing mapped resources remain
part of capture freshness and bounded reconciliation. The UI receives verified
changes directly instead of reading the files again. The final focused checkpoint
passes 123 Core boundary cases, 11 actual native-event journeys and 22 official
Flutter boundary cases. This does not replace full current-candidate qualification
or resolve the independent native text-input failure below.

## Remaining qualification gates

- Resolve or obtain an approved official-upstream resolution for the reproduced
  native stale-client input loss below. Core/widget results cannot qualify it.
- Complete Core/CLI and published-output qualification of the final-owner mapping
  against the same refreshed candidate, preserving advanced semantic obligations.
- Resolve retained runtime failures and verify all actual wire, file-change,
  credentials/TLS, mock, stream and cancellation boundaries together.
- Run full current-candidate Engine, Core/CLI, official widget, native/platform and
  distribution checks after source stabilizes. `python3 tools/qualify_linux.py`
  assembles and rejects failing automated candidates; native/platform acceptance
  remains a separately reported gate.

Historical Terms-of-Service, mixed Header, large-value IO and alias failures stay
in the dated record. Their status must come from current corresponding cases,
not from assuming that a simplification fixed every historical defect.

## Measured work reduction

These measurements establish specific mechanism changes. They are not full
application qualification, UI latency distributions, or an explanation for native
input loss. Local instrumentation exists only in copied benchmark sources under
`build/diagnostics/simplification-20261113/`; it is absent from production.

The editing pair compares `7cc6ab6` with the simplified buffer owner. Each process
performs 25 single-span edits, 25 undo and 25 redo operations and compares exact
restored text. Each old run computes 100 history digests; each new run computes
zero. The fixture excludes disk/recovery boundary digests and editor layout.

| Source fixture | Median edit, before → after | 95th percentile edit, before → after |
| - | - | - |
| 64 KiB, many lines | 6.620 → 0.315 ms | 9.749 → 3.741 ms |
| 1 MiB, many lines | 89.390 → 5.075 ms | 116.144 → 22.628 ms |
| 8 MiB, many lines | 677.340 → 25.164 ms | 755.985 → 54.041 ms |
| 8 MiB, one long value | 554.683 → 38.941 ms | 619.818 → 50.705 ms |

Remaining string/index costs are visible in these numbers. Twenty-five samples
per fixture are descriptive local results, not a native responsiveness guarantee.
The paired process memory observations and complete inputs are in `editing/`.

| Workload | Before → after |
| - | - |
| One changed resource among 33 dirty buffers | Typing, field commit, undo, redo and a selected save each checkpoint only that buffer; unchanged records survive |
| Two folding requests | One shared parse, zero semantic graphs in the new path |
| Two SourcePlan forks | Zero new parses in the new path |
| 6,400 independent Schema roots in each native family | All four existing eight-second cases pass in 3.35–3.85 seconds on the relieved host; the native empty-tuple adapter performs no whole-graph scan per checked value |
| Three saved cases for one operation | Full captures 4 → 1; configuration decodes 4 → 1; exact-input requests 3 → 1; operation plans 3 → 1 |
| Same three actual requests | Input IPC 13,150 → 7,185 bytes; exact received queries remain `x=1`, `x=2`, `x=3` |
| Twelve XML URL-form fields | Graphs 25 → 1; source transfers 13 → 1; input IPC 37,993 → 2,947 bytes |
| Three operation profiles over an acquired capture | Extra graph acquisitions 6 → 0; resulting profiles remain identical |
| Twelve modeled XML multipart fields | Parsed data documents 194 → 14; parser input 891,483 → 150,579 bytes; wire inversions 24 → 12; prepared output remains identical |
| Twenty related schemas, forty runtime values | Canonical compiler ASTs 21 → 1; node compilations 122 → 82; complete results remain identical |
| Twenty-one mock checks over a 131,388-byte source | Graphs and source-bearing worker packets 21 → 1; JSON-sized worker input 2,771,890 → 137,523 bytes, including initial worker data |
| One generated mock multipart response, twelve exact numeric parts | Body evaluations 2 → 1; MIME decodes 3 → 1; parsed data documents 92 → 52; parser input 617 → 324 bytes; the 1,069-byte response remains identical |
| One generated mock URL-form response, twelve values | Body evaluations 2 → 1; parsed data documents 57 → 28; parser input 1,126 → 510 bytes; the 80-byte response remains identical |
| Eight renderer opens, two installed presets | Admissions 8 → 2; file reads 48 → 12; bytes read 34,215,944 → 8,553,986 |
| Representative conversion captures | Graphs 21 → 14 / 28 → 17 / 19 → 12; parses 56 → 13 / 60 → 17 / 51 → 8 before the remaining holder work |
| Same conversion captures, final-owner and captured-document reuse | SourceDocument constructions 13 → 5 / 17 → 5 / 8 → 1; all three captures complete at both checkpoints |
| Same conversion captures, allocator constructions | 2 → 1 / 5 → 2 / 1 → 1; one allocator per genuine family stage |
| Same conversion captures, provenance inspections | 358 → 306 / 527 → 449 / 358 → 306 |
| Same conversion captures, graph API calls in final-owner slice | 14 → 14 / 17 → 17 / 12 → 12; this later slice claims no additional graph reduction |
| One homogeneous fixed-reference tuple, both conversions complete | Unconsumed tail holders 1 → 0; SourceDocument constructions 144 → 138; position holders remain 1 → 1 |

The final-owner conversion pair compares committed `c4b40de` with `eda617c`,
after the earlier capture reduction. Each complete JSON input has one integer
Base schema and twenty references; rows list 3.2.1 → 3.1.2, 3.0.4 → 3.2.1 and
3.2.1 → 3.2.1 in that order. Copied-source instrumentation counts SourceDocument
and MigrationSchemaOwners constructions, MigrationSemanticOrigins inspections,
and createGraph calls. Exact inputs, counts and source-archive SHA-256 are retained
in `conversion-owners/after-eda617c.jsonl` and `final-eda617c.json`. The additional
shared dynamic fixture was blocked before and completes after; its counts are
excluded from the performance comparison.

The tuple pair compares committed `2b20e5d` with `098b508` using one unchanged
JSON input. Only the unconsumed, equivalent bare-reference tail is coalesced;
independently referenced tails remain separate in the regression corpus. Copied
source counters and input/archive identities are retained in
`conversion-tuples/receipt.json`. This measures construction and allocation work,
not elapsed conversion latency or native input.

The unfinished-stream pair feeds 257 × 64 KiB into the same record bound. Both
accurately stop at `limit.stream.record`. Copied framing bytes fall from
2,172,715,008 to 50,331,648; unfinished-state serialization falls from
2,874,541,837 bytes to zero. Local raw-framer elapsed time was 7,545 → 25 ms and
peak process RSS 204,976 → 85,344 KiB. Those are isolated framer measurements.
For a 100,521-byte captured source packet, opening the new stream constructs one
graph/parse; all 257 chunks construct zero graphs/parses. The chunks transfer
22,467,968 input bytes and 536,308 output bytes without source/unfinished-record
continuations. Scripts and results are retained in `streaming/`.

The XML, compiler and mock measurements count parser input, canonical compiler work,
and JSON-sized messages respectively; they do not claim V8 transport framing or
native UI latency. Their evidence is retained in `schema-compiler/` and the
corresponding runtime work records.

Actual source-save, body, scheduler, ownership, and conversion mechanisms are the
deletions being audited. Historical prose, vendored inputs, generated files and
lockfile removals are excluded from production-reduction credit. Against `7cc6ab6`,
the committed production paths at `d800820` have these textual changes:

| Production responsibility | Added lines | Deleted lines | Net lines |
| - | -: | -: | -: |
| Desktop `lib/` | 437 | 518 | −81 |
| Dart core `packages/busyapi_core/lib/` | 2,669 | 2,393 | +276 |
| TypeScript `tools/contract_engine/src/` | 2,642 | 2,453 | +189 |
| Total | 5,748 | 5,364 | +384 |

Production text therefore grows by 384 lines overall. The reductions are in
owners and executed work: the alternate source saver, Dart conversion semantic
mirror, Dart execution scheduler, history hashing, per-edit recovery sweep,
superseded conversion retirement/repair, preliminary mock form proofs, repeated
stream continuations and uncompressed response copy are absent. The conversion
subset (`migration.dart` and `migration*.ts`) has a net reduction of 408 lines
across 41 changed files. Added code includes retained-context fixes and
explicit captured-input ownership; gross deleted lines alone do not establish
the structural result. The work counts above and the removed mechanisms provide
that evidence. Full integrated and native qualification remain separate gates.

## Fresh native input reproduction — 2026-11-13

The simplified editor builds successfully with optional generator/oasdiff inputs
unavailable, but native editing acceptance still fails. The unchanged owned-window
journey typed `edited 3.0.4` then Tab into Title; the field retained `edited 3.0`.
Disk source remained byte-identical. The full editing/save/reopen journey stopped
at that assertion; it is not qualified. The debug process's kernel-recorded peak
RSS was 706720 KiB, sampled RSS 651912 KiB; these are not release performance
measurements.

The independent ordinary two-field fixture in `tools/repro_two_fields.dart`,
driven by `tools/repro_two_fields.py`, reproduces without BufferStore, recovery, Design or project analysis. Its original
single native burst, Ctrl+A followed by `edited 3.2.1` and Tab, retained
`edited 3.`. The passive GTK/IBus-observed run retained `edited 3`. All 30 native
IBus requests/replies and all 12 one-byte GTK commit callbacks were observed.
The existing Flutter channel tracer then showed the exact final-character race:
hardware `1` down/up preceded Tab down/up; client 2 reached `edited 3.2.`;
`TextInput.clearClient` and `setClient(3)` changed focus to API version; afterward
`TextInputClient.updateEditingState` delivered the complete 12-character value
for retired client 2. This evidence locates the loss before BusyAPI source/draft
ownership. It does not establish a particular upstream patch or a qualified fix.

The official unchanged SDK is Flutter 3.47.5, framework
`6a19cca56475dbfba1478ee68d7bd0c2ef891da1`, engine
`af7e796e161ae0bb1ff0758c71a7105418bd9ded`, Dart 3.13.4. The debug engine hash is
`7a5698608a3c79ad3f123a74bce8074339ffa1a83c896d73ae853c9f92a43cc3`.
Host: GNOME X11, Linux 7.0.0-42-generic, GTK 3.24.41,
IBus 1.5.29-rc2 (Ubuntu package 1.5.29-2), `xkb:us::eng`.
`GTK_IM_MODULE`, `IBUS_ADDRESS` and `IBUS_ENABLE_SYNC_MODE` were unset;
`XMODIFIERS=@im=ibus`. App-only diagnostic synchronization modes also failed:
mode 1 retained `edited 3.2`; mode 2 reordered Title to `deeti.3 d` and wrote
`1.` into API version. Neither setting was applied to the user session or product.
No key timing, assertion, SDK, provider or vendor source was changed.

Evidence, original fixture/driver copies, screenshots, raw channel/IM logs,
process memory, host identities and source-byte comparisons are retained under
`build/diagnostics/simplification-20261113/native/`. Debug native executable
hashes alone do not identify the Dart entry point. The retained kernel hashes are:

| Candidate | SHA-256 of `data/flutter_assets/kernel_blob.bin` |
| - | - |
| Simplified editor | `8a96e9133f16ce41d2a82a40c3a6d65c04b18403dc5efddfd8871143865c34be` |
| Pure two-field fixture | `664a1bcc03819cc79cd6fee00bd39a417c7f09e0912ff1d484ce67d331932e68` |
| Channel-traced fixture | `a18631ab92c91b2fa9edb4da9407f5382d2e28f3371ff0dbf6e80db834802bee` |

The editor and pure fixture bundles are preserved in
`/tmp/busyapi-simplification-native-bundles-q8bo59qk/`. Rebuild the ordinary
application entry before any later native qualification. Earlier dated failures
in the historical record remain historical evidence; the observations here are fresh executions.

## Release native follow-up — 2026-11-13

Full release assembly now succeeds with the ordinary `lib/main.dart` AOT entry,
CLI, all optional tools, official SDK identities, notices and verified distributed
artifacts. Process-test fixtures live outside that candidate. This is assembly
evidence, not retained-behavior qualification.

The unchanged owned 3.0.4 YAML standalone editing journey then failed at its
first Title assertion: requested `edited 3.0.4`, observed `Production 3.0.4`.
The 430-byte API and 260-byte model remained byte-identical. The process reached
418,584 KiB peak RSS. Save, Source/history and reopen were not reached. This run
does not establish the earlier trailing-character cause. The candidate's
`lib/libapp.so` SHA-256 is
`7b4d904bfc03e1a095aefabf5bae215322724ddff4d5335d4ace24a6265dea0a`.
Original/current files, controls, screenshots, identities and memory are in
`build/diagnostics/simplification-20261113/native-release/`.

Separate controlled release AOT traces now compare `364209c` with `14004d3`,
before authoring consolidation. Both retain one mounted, writable Title field
through the entire burst. Tab then blurs it and clears its Flutter client;
the complete 12-character update arrives afterward for that retired client.
The current field retains `edited 3`; the earlier field retains `edited 3.0.`.
Neither late update reaches Designer's input callback. This rules out the
suspected first-party remount/read-only transition in those controlled runs.
It does not reconstruct the untraced zero-edit run or establish comparative
performance. Six initial-focus widget cases retain the focused client across
feedback invalidation. No input workaround, timing change or SDK patch was added.
Patches, raw events, original/current files and compiled identities are retained
in `build/diagnostics/simplification-20261113/native-boundary/`.

A read-only comparison of local official SDK tags 3.47.5 and 3.47.9 found the
Linux text-input/keyboard handlers, text-input service and focus manager unchanged;
the EditableText difference concerns context-menu action names. No later SDK was
installed or run, and this comparison identifies no qualified upstream fix.
The comparison is recorded in `native/sdk-source-comparison.json`.

The fresh v10 candidate repeats the unchanged native 3.0.4 YAML journey after
the final source-observation fixes. It requests `edited 3.0.4` and Tab; Title
retains `edited 3.0`. The 430-byte API remains unchanged, and the exact-input
assertion stops the journey before save, Source/history and reopen. Its desktop
AOT SHA-256 is
`e16447fb6b05653f0334843cb4052fa6958c530f099876d9689fd78df424878e`.
Peak RSS is 428,596 KiB. Controls, screenshots, source bytes, invocation and
identities are retained in `native-v10/`. This untraced run does not by itself
establish the cause observed in the separate official-SDK traces. It confirms
that the final first-party ownership changes have not qualified native input.
