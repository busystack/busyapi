# Native OpenAPI support

**Simplification changes are committed. Native editing and release acceptance remain unqualified.**

BusyAPI retains native Swagger 2.0 and OpenAPI 3.0.x, 3.1.x and 3.2.x,
authoritative YAML/JSON, Source/Design/Reference, explicit conversion, source
fidelity, recovery, refactoring, runtime workflows, outputs, CLI and Linux
integration. Opening or editing does not convert the declaration.

The responsibility contract is [architecture](../architecture.md); supported
commands are in [README](../../README.md). Superseded execution directives and
dated results are in the [historical record](native-openapi-support-history.md).
They are evidence, not active instructions or acceptance of the current candidate.

## Simplification status — 2026-11-14

| Area | Landed responsibility and deleted mechanisms |
| - | - |
| Editing and history | BufferStore exclusively owns source, BOM, presence/path, reload, recovery and replay. Reversible spans and logical history tokens replace whole-document history digests. Asynchronous revisions advance through undo and owner replacement. The windowed editor retains its line index. |
| Drafts and recovery | Owned draft revisions replace repeated draft serialization. Changes schedule affected owners rather than sweeping the workspace. Form Apply awaits one final checkpoint. The existing writer batches records and permits one newer payload to replace an encoding payload before forcing durable progress. Explicit close/replacement drains and grouped ordering remain. |
| Captures and assistance | Immutable root-local acquisition is separate from semantic analysis. Relevant resource observations invalidate captures; actual bytes and permissions own versions. Syntax is reused by immutable resource text/identity, distinct from contextual semantics. Folding constructs no graph. Inspection, completion and Design use the existing field definitions. Node owns execution scheduling; Dart owns transport and lifetime. |
| Authoring and saving | Specialized and generic forms share field metadata, draft ownership and transaction boundaries. PublicationStore is the sole source saver. One immutable v1 source-save intent replaces per-file journal rewrites; v2 file-operation checkpoints remain. Atomic writes, exact disk conflicts, permissions, partial outcomes and interruption recovery remain. |
| Conversion | TypeScript owns semantics; Dart retains packet/path/capture/review/publication authority. Captured typed occurrences point directly to final owners; intermediate owner-edge composition and chain traversal are removed. Actual structural edits retain CST projection and typed reference/resource/URI/Markdown provenance. Unchanged stages reuse captures and skip repeated projection/checking. Migrated families no longer use temporary preparation/retirement or duplicate entry/role passes. Redundant SourcePlan fork parsing and propose.moveOperation are removed. |
| Requests, mock and streams | Captured operations and immutable body inputs reuse secret-free preparation across Preview/Send. Dispatch still resolves credentials/TLS and rechecks selected files. Shared recipes replace equivalent multipart/form regeneration and preliminary mock body proofs. One bounded stream owner replaces full-source/unfinished-record chunk IPC and growing-buffer copies. Uncompressed responses reuse retained original bytes; mock startup derives one bundle. |
| Outputs and governance | Prepared immutable files use the existing common publisher. Generator selection/execution share one runtime. Renderer admission reuses verified installed bytes. One immutable policy closure binds explicit approval to a run; final dispatch and isolation remain. |
| Build and cleanup | Candidate assembly and qualification are separate. Assets prepare once per input signature; official widgets run once and no persistent suite receipt authorizes release. Both existing profiles remain. Test helpers/package outputs are outside production assets. Dead UI constants, duplicate input/menu mechanics and obsolete probes are removed; reachable Linux fallback behavior remains. |

Compatibility is tested centrally at migration revision 107. Semantic suites no
longer require unrelated revisions 30/91, private conversion layout or historical
build-script ordering. Meaningful semantic cases, exact input, race/interruption
injection, native assertions, correctness watchdogs and durability barriers remain.

## Current candidate verification

Code checkpoint `433d3bd` was assembled as the ordinary release candidate. Source
and installed files remained unchanged across the complete Engine run and the
subsequent sequential checks. Evidence is in
`build/diagnostics/simplification-20261113/final-current/`.

| Check | Observed result |
| - | - |
| Release assembly and full Flutter analysis | Pass |
| Complete registered Engine/renderer population | 217 suites; 20,905 reported cases pass; zero failures. Standalone assertions are additional to the reported case count. |
| Complete official Flutter widget population | 1,322 pass, zero failures, 12:31; default concurrency and original bounds/input/assertions |
| Affected Core/CLI population | 52 pass, zero failures, including actual HTTP, resource identities, B02 conversion, moved/cold outputs and SIGKILL definition recovery |
| Additional renderer asset checks | 6 pass |
| Installed-artifact smoke | Pass: native families and both formats, deterministic relocated output, exact receipts, collisions, missing runtime, arbitrary cwd and empty PATH |
| Real-kernel policy isolation | Separate unchanged-runtime gate: 3 suites/53 cases pass, including fail-closed startup and positive Landlock/seccomp execution |
| Native 3.0.4 YAML editing journey | Fails exact Title input before save/history/reopen; see below |

Core evidence is **full plus focused**, not a second complete Core invocation.
The preceding v5 full run passed 4,109 cases and failed one obsolete assertion
about a removed v1 per-file receipt field. That assertion now checks the captured
intent and actual published bytes; all five cases in its full interruption test
file pass, including the previously unreached assertions. All 52 affected cases
pass against the final candidate. Dart production and fixture-child sources are
unchanged since v5, and the CLI and main Engine binaries are byte-identical.
The changed conversion worker is covered by the full 217-suite run and the
52 affected Core cases; the changed desktop is covered by all 1,322 widgets and
the native journey. Exact identities and scope are in `core-scope.json`.

The final fixes also close two independent correctness gaps. Conversion forwards
an original native Schema slot only for a Schema interpretation; a secondary
Response interpretation at the same physical pointer cannot take its resource
identity. Original HTTPS bases, dialects, exact numbers and cold/moved outputs
are preserved; ordinary shared-reference edit refusal remains. Native object,
Reference and Schema-tree queries reload from the current captured authority,
including permission-only changes with identical text and generation. Three
held-real-reply races verify that retired replies cannot replace the eligible
view, unchanged feedback adds no requests, and pending input, reading position
and tree expansion survive.

Earlier widget IO watchdog failures remain in the historical record. A traced
recovery fsync took 9.44 seconds and a large-value-owned fsync 9.47 seconds;
traced chmod calls stayed below 3 milliseconds. Those observations do not assign
every prior wait to storage or identify a device cause. The final full widget run
passes with the same deadlines and durability. It does not establish universal
storage latency or native-input responsiveness.

Tooling coverage remains full plus focused: the full population had 182 passes
and one font-fixture failure. The declared producer was corrected; all eleven
related asset checks, six package-output ownership checks and nine qualifier
controls pass. No second complete tooling population is claimed.

Conversion retains the advanced obligations for dynamic connections, resource
identity, evaluated annotations, exact numbers and representation semantics.
Captured resource declarations stay distinct from active assertions and literal
data. Final owner allocation follows native fields and stops at Schema boundaries;
independent consumers retain their own owners. Two baseline OpenAPI 3.0 proof
limitations remain located refusals: unrestricted name-length constraints and
conditional pattern coverage without a supported selection certificate. Neither
publishes partial output.

The remaining acceptance work is a qualified official-upstream resolution of
native input loss, then the complete native editing/save/recovery/reopen journey
and final release qualification on that supported runtime. No release, push,
SDK/vendor patch, input throttling, session/provider change or weakened assertion
has been applied. A passing automated population cannot waive the native failure.

## Measured work reduction

The current Node startup comparison uses five samples per version, the same
packaged Node, identical immutable OpenAPI 3.2.1 input and exact cold/warm result
hashes. The measured helper is byte-identical to the installed helper. Median
main hello time fell from 523.22 to 130.51 ms; total child CPU for a cold analysis
fell from 1333.34 to 610.97 ms. This is a grouped engine diagnostic, not native
input or paint measurement. The same work-count probe observes four eagerly
compiled family roots before the change and zero afterward; folding leaves zero,
the first 3.2 analysis compiles one, and repeating it reuses that function. Other
families compile on demand. Eight meta validators remain. Evidence is in
`startup-reuse/` beneath the diagnostic directory.

A real recovery-writer boundary test reduces two captured updates from two writes
to one. Coalescing permits at most two encodes per write, retaining the original
continuous-input progress test. Multi-source publication checks retain identical
actual journal bytes throughout one save, partial recovery and four cold disk
outcomes; only the initial v1 intent is written.

These measurements establish specific mechanism changes. They are not full
application qualification, UI latency distributions, or an explanation for native
input loss. Local instrumentation exists only in copied benchmark sources under
`build/diagnostics/simplification-20261113/`; it is absent from production.
Native input/paint latency distributions and time to an editable view are not
established by these engine/JIT measurements and remain acceptance work.

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
| Explicit drain with 32 dirty recovery records | All 32 exact records remain durable; directory inventories 33 → 3 by using the existing bounded writer batch |
| Captured form Apply | Intermediate source-plus-applying-form checkpoint is removed; the final source-only checkpoint remains awaited, including when its completion is held |
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
| Same-family empty and static-reference captures, direct-association slice | Actual ReferenceGraph constructions 11 → 8 in each; createGraph calls 12 → 9; unchanged-stage semantic projections 1 → 0; complete review JSON remains identical |
| Shared recursive/boolean schemas in two entries, direct-association slice | Actual ReferenceGraph constructions 29 → 25; createGraph calls 30 → 26; owner lookup work 1,399 → 818; complete review JSON remains identical |
| Shared Swagger dispatch, two changed batches through 2.0/3.1/3.2 | Actual ReferenceGraph constructions 41 → 37; createGraph calls 42 → 38; owner lookup work 1,877 → 1,355; both genuine stage projections remain and complete review JSON is identical |
| Mixed native entries with shared flat Header/parameter owners | Intermediate owner transitions 14 → 0; 14 direct endpoint updates retain the existing complete value/cold-output assertions; owner lookup work 7,056 → 5,190 |

The final-owner conversion pair compares committed `c4b40de` with `eda617c`,
after the earlier capture reduction. Each complete JSON input has one integer
Base schema and twenty references; rows list 3.2.1 → 3.1.2, 3.0.4 → 3.2.1 and
3.2.1 → 3.2.1 in that order. Copied-source instrumentation counts SourceDocument
and MigrationSchemaOwners constructions, MigrationSemanticOrigins inspections,
and createGraph calls. Exact inputs, counts and source-archive SHA-256 are retained
in `conversion-owners/after-eda617c.jsonl` and `final-eda617c.json`. The additional
shared dynamic fixture was blocked before and completes after; its counts are
excluded from the performance comparison.

The direct-association rows are a later focused comparison, not a new whole-product
qualification. The same captured records serve stable source keys and current
material lookup keys in the existing occurrence map; no synthetic alias scopes
or transition chain is stored. Endpoint and planner-context updates preserve
that record's identity, so lookup views retain current metadata. Source
validation and the first unchanged stage
reuse their original immutable graphs. The counts distinguish calls to
`createGraph` from actual `ReferenceGraph` constructions because ordinary capture
reuse can satisfy a call without constructing another graph.
At initial capture, completed source validation and first-stage capture, the
single-entry construction totals are 1/2/3 before and 1/1/1 after; the two-entry
totals are 2/4/6 before and 2/2/2 after. The same ambiguous-identity input retains
its exact located refusal and empty outputs while source constructions fall 2 → 1.
Paired source archives, input identities, counters and focused-control logs are
retained in `build/diagnostics/simplification-20261113/conversion-direct-associations/`;
only `migration.ts` and `migration_schema_owners.ts` differ between those archives.

`MigrationSemanticOrigins.advance` remains a projection after actual stage edits,
and is skipped when neither source documents nor the resource set changed. Each
changed stage starts the next `SourcePlan` capture in a new coordinate space.
Its surviving reference, URI, rendered Markdown and resource endpoints can have
multiple final uses or a changed native kind, such as a body Parameter becoming
a Request Body. That projection uses the captured graph's field capabilities;
literal/history provenance cannot choose a semantic copy. It preserves direct
endpoints for the next capture rather than retaining intermediate owner edges.
Exact authored bytes and diagnostic locations remain a separate CST provenance
view. Necessary final reference emission and changed-stage coordinate bookkeeping
have not been claimed removed.

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
the committed runtime paths at `433d3bd` have these textual changes:

| Production responsibility | Added lines | Deleted lines | Net lines |
| - | -: | -: | -: |
| Desktop `lib/` | 624 | 566 | +58 |
| Dart core `packages/busyapi_core/lib/` | 2,747 | 2,432 | +315 |
| TypeScript `tools/contract_engine/src/` | 2,741 | 2,516 | +225 |
| Total | 6,112 | 5,514 | +598 |

These runtime paths therefore grow by 598 lines overall. The reductions are in
owners and executed work: the alternate source saver, Dart conversion semantic
mirror, Dart execution scheduler, history hashing, per-edit recovery sweep,
superseded conversion retirement/repair, preliminary mock form proofs, repeated
stream continuations and uncompressed response copy are absent. The conversion
semantic owners, production source savers and execution schedulers each fall
from two to one. The conversion
subset (`migration.dart` and `migration*.ts`) has a net reduction of 381 lines
across 41 changed files. Added code includes retained-context fixes and
explicit captured-input ownership; gross deleted lines alone do not establish
the structural result. The work counts above and the removed mechanisms provide
that evidence. Full integrated and native qualification remain separate gates.

## Current native input reproduction — 2026-11-14

The unchanged owned-window driver ran the ordinary release at `433d3bd` with
`--version 3.0.4 --format yaml --edit`. Ctrl+A, `edited 3.0.4` and Tab left only
`edited` in the enabled, editable Title field, caret 6 after blur. API version
remained `api-version`. All 430 API source bytes remain identical, SHA-256
`6233b96038accefdd231b0a655470e80726f183c39949933b84b80581d1e94b5`.
Save, Source/history and reopen were not reached.

| Artifact | SHA-256 |
| - | - |
| Desktop AOT `lib/libapp.so` | `c6f3c21f7399f2b296199bf4de33af4f353490cdb166f51763082caedcaa01b5` |
| Native executable | `d86703b0e14a8007ecee55a82db579a4b3db2bb4344aa1226992714a74a383e3` |
| CLI | `71d1bb6ccb9594ad61e7993da4f675758654f229c54350a70e0f302770f4426f` |
| Main Engine | `df76196efbe9102e30b08ed502bbb3a9780ab973a72306ae8b9dd96e7d234858` |
| Conversion worker | `21d59f4f3241bc8009f863beef9f3bb7d187eb3cab996a59d01c691204d4a3db` |

Kernel-recorded application peak RSS was 421996 KiB; sampled RSS was 406120 KiB.
These are single-run observations, not comparative native performance results.
Controls, screenshots, original/current bytes, artifacts and result are retained
in `final-current/native/` beneath the diagnostic directory. This untraced run
establishes the retained failure, not its cause.

The separate independent `tools/repro_two_fields.dart` fixture, driven by
`tools/repro_two_fields.py` on the unchanged official SDK/native host, reproduced
trailing loss without BusyAPI history, recovery or Design. Its recorded channel
trace observes the complete 12-character update for client 2 only after
`TextInput.clearClient` and `setClient(3)` move focus to API version. The update
for the retired client is discarded. All 30 observed IBus requests/replies and
12 one-byte GTK commits were present. Separate BusyAPI AOT traces retain one
mounted writable Title field through the burst; the final update does not reach
the Designer callback. These controlled traces do not reconstruct every untraced
failure. Full originals and hashes remain in `native/` and `native-boundary/`.

The supported official SDK is Flutter 3.47.5, framework
`6a19cca56475dbfba1478ee68d7bd0c2ef891da1`, engine
`af7e796e161ae0bb1ff0758c71a7105418bd9ded`, Dart 3.13.4.
The host is GNOME X11, Linux 7.0.0-42-generic, GTK 3.24.41,
IBus 1.5.29-rc2, `xkb:us::eng`. The local read-only comparison of official
3.47.5/3.47.9 input paths and the bounded official-report review did not establish
a qualified matching fix. No later SDK was installed or run. Search scope is
recorded in `final-current/upstream-review.json`; absence of a matching result
in that review is not proof that no upstream fix exists.
